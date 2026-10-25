// AI credit wallet, one per pharmacy (staff share it).
//
// Two buckets:
//   daily   - the plan's allowance for today (India time); refilled on first use
//             each day, unused credits don't carry over
//   balance - bought and admin-granted credits; never expire
// Spending takes from `daily` first. Amounts are milli-credits (1 credit = 1000).
//
// Every change writes a row to `credit_transactions` first, keyed by a unique
// `ref`, so retries (webhooks, double taps, crashed requests) never apply
// twice; spending is one atomic update, so concurrent turns can't overspend.
//
// KEEP IN SYNC with admin-backend/services/credits/wallet.js
const crypto = require("crypto");

const WALLETS = "credit_wallets";
const LEDGER = "credit_transactions";

const todayIst = (d = new Date()) => new Date(d.getTime() + 5.5 * 3600e3).toISOString().slice(0, 10);
const toMilli = (credits) => Math.round(Number(credits || 0) * 1000);
const toCredits = (milli) => Math.round((milli || 0) / 100) / 10; // one decimal
const isActiveSub = (sub, now = new Date()) => !!sub?.plan && !!sub.ends_at && new Date(sub.ends_at) > now && sub.status !== "EXPIRED";

const DAY_MS = 864e5;
const addDays = (ymd, n) => new Date(Date.parse(ymd) + n * DAY_MS).toISOString().slice(0, 10);
function addYears(ymd, n) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y + n, m - 1, d)).toISOString().slice(0, 10); // 29 Feb -> 1 Mar
}
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / DAY_MS);

// The subscription's current plan year (India dates, end exclusive): from the
// last anniversary of its start, cut short where the subscription ends.
// `key` names the year in wallet.included.
function planYear(sub, now = new Date()) {
  const today = todayIst(now);
  const anchor = sub?.starts_at ? todayIst(new Date(sub.starts_at)) : `${today.slice(0, 4)}-01-01`;
  let start = anchor > today ? today : anchor;
  if (anchor <= today) {
    let k = Number(today.slice(0, 4)) - Number(anchor.slice(0, 4));
    while (k > 0 && addYears(anchor, k) > today) k--;
    start = addYears(anchor, k);
  }
  let end = addYears(start, 1);
  const subEnd = sub?.ends_at ? addDays(todayIst(new Date(sub.ends_at)), 1) : null;
  if (subEnd && subEnd > today && subEnd < end) end = subEnd;
  return { key: start, start, end, days: Math.max(1, daysBetween(start, end)), daysLeft: Math.max(1, daysBetween(today, end)) };
}

// Our AI cost allowance (₹) for a paid plan's included usage this plan year, and
// what's been used of it. null for trials, inactive subscriptions and plans
// without a budget.
function planBudget(config, sub, w, now = new Date()) {
  if (!isActiveSub(sub, now) || sub.kind === "TRIAL") return null;
  const yearly = Number(config.plan_budget_inr?.[sub.plan]);
  if (!(yearly > 0)) return null;
  const py = planYear(sub, now);
  const budget = (yearly * Math.min(365, py.days)) / 365;
  const spent = w?.included?.period === py.key ? (w.included.cost_paise || 0) / 100 : 0;
  return { ...py, yearly, budget, spent, left: Math.max(0, budget - spent) };
}

// Today's allowance (credits) for a pharmacy: its own override, the trial's
// fixed amount, or a fair share of what's left of its plan's yearly budget
function allowanceCredits(config, pharmacy, wallet) {
  const sub = pharmacy?.subscription;
  if (!isActiveSub(sub)) return 0;
  if (wallet?.daily_override_credits !== null && wallet?.daily_override_credits !== undefined) return Number(wallet.daily_override_credits) || 0;
  if (sub.kind === "TRIAL") return Number(config.trial_daily_credits) || 0;
  const b = planBudget(config, sub, wallet);
  if (!b) return Number(config.daily_credits?.[sub.plan]) || 0;
  const perCredit = config.credit_value_paise / 100 / (1 + config.margin_percent / 100); // our cost of one credit
  const even = b.budget / b.days / perCredit;
  const fair = b.left / b.daysLeft / perCredit;
  return Math.floor(Math.min(fair, even * (Number(config.budget_daily_cap_factor) || 2)) * 10) / 10;
}

// Pipeline expression: wallet.included with `paise` more AI cost in plan year `key`
const includedPlus = (key, paise) => ({
  period: key,
  cost_paise: { $add: [{ $cond: [{ $eq: ["$included.period", key] }, { $ifNull: ["$included.cost_paise", 0] }, 0] }, paise] },
});

// Record AI cost paid for by the plan (light mode turns)
async function addIncludedCost(db, pharmacy, paise) {
  if (!(paise > 0)) return;
  await db.collection(WALLETS).updateOne({ pharmacy_id: pharmacy.id }, [{ $set: { included: includedPlus(planYear(pharmacy.subscription).key, paise) } }]);
}

const isDuplicate = (err) => err && (err.code === 11000 || /E11000/.test(err.message || ""));

async function ensureWallet(db, pharmacyId) {
  const now = new Date();
  await db.collection(WALLETS).updateOne(
    { pharmacy_id: pharmacyId },
    {
      $setOnInsert: {
        pharmacy_id: pharmacyId,
        balance_milli: 0,
        daily: { date: null, allowance_milli: 0, remaining_milli: 0 },
        daily_override_credits: null,
        free: { date: null, used: 0 },
        version: 0,
        totals: { purchased_milli: 0, granted_milli: 0, removed_milli: 0, used_milli: 0, daily_granted_milli: 0 },
        created_at: now,
      },
    },
    { upsert: true }
  ).catch((err) => {
    if (!isDuplicate(err)) throw err;
  });
  return db.collection(WALLETS).findOne({ pharmacy_id: pharmacyId });
}

// The wallet with today's allowance in place
async function getWallet(db, config, pharmacy) {
  const today = todayIst();
  for (let i = 0; i < 5; i++) {
    const w = await ensureWallet(db, pharmacy.id);
    if (w.daily?.date === today) return w;
    const allowance = toMilli(allowanceCredits(config, pharmacy, w));
    const year = planYear(pharmacy.subscription).key;
    const res = await db.collection(WALLETS).updateOne(
      { pharmacy_id: pharmacy.id, version: w.version },
      {
        $set: {
          daily: { date: today, allowance_milli: allowance, remaining_milli: allowance },
          ...(w.included?.period !== year ? { included: { period: year, cost_paise: 0 } } : {}),
          updated_at: new Date(),
        },
        $inc: { version: 1, "totals.daily_granted_milli": allowance },
      }
    );
    if (res.modifiedCount) {
      if (allowance > 0) {
        await db
          .collection(LEDGER)
          .insertOne({
            id: crypto.randomUUID(),
            ref: `daily:${pharmacy.id}:${today}`,
            pharmacy_id: pharmacy.id,
            type: "DAILY",
            amount_milli: allowance,
            bucket: "daily",
            status: "DONE",
            note: `Daily credits for ${today}`,
            created_at: new Date(),
          })
          .catch((err) => {
            if (!isDuplicate(err)) throw err;
          });
      }
      return db.collection(WALLETS).findOne({ pharmacy_id: pharmacy.id });
    }
  }
  return db.collection(WALLETS).findOne({ pharmacy_id: pharmacy.id });
}

const availableMilli = (w) => Math.max(0, w?.daily?.remaining_milli || 0) + (w?.balance_milli || 0);

// Public view of a wallet
function view(w) {
  return {
    available: toCredits(availableMilli(w)),
    daily: { date: w?.daily?.date || null, allowance: toCredits(w?.daily?.allowance_milli), remaining: toCredits(Math.max(0, w?.daily?.remaining_milli || 0)) },
    balance: toCredits(w?.balance_milli),
    daily_override: w?.daily_override_credits ?? null,
    free_used_today: w?.free?.date === todayIst() ? w.free.used || 0 : 0,
  };
}

// Spend credits (daily first, then balance). The balance may dip below zero by
// at most this one charge: the turn already happened; the next one is gated.
// costPaise: what the request cost us; the share paid from daily credits counts
// against the plan's yearly budget.
async function charge(db, config, pharmacy, { milli, ref, userId = null, task = null, engine = null, costPaise = 0, meta = {} }) {
  if (!(milli > 0)) return { charged: 0, duplicate: false };
  ref = ref || `usage:${crypto.randomUUID()}`;
  const entry = {
    id: crypto.randomUUID(),
    ref,
    pharmacy_id: pharmacy.id,
    user_id: userId,
    type: "USAGE",
    amount_milli: -milli,
    task,
    engine,
    meta,
    status: "PENDING",
    created_at: new Date(),
  };
  try {
    await db.collection(LEDGER).insertOne(entry);
  } catch (err) {
    if (isDuplicate(err)) return { charged: 0, duplicate: true };
    throw err;
  }
  // One atomic update: take what today's allowance has, the rest from the
  // balance, all inside the database (no read-modify-write race)
  for (let i = 0; i < 3; i++) {
    const today = todayIst();
    await getWallet(db, config, pharmacy); // today's allowance in place
    const year = planYear(pharmacy.subscription).key;
    const r = await db.collection(WALLETS).findOneAndUpdate(
      { pharmacy_id: pharmacy.id, "daily.date": today },
      [
        { $set: { _take: { $min: [milli, { $max: [0, "$daily.remaining_milli"] }] } } },
        {
          $set: {
            "daily.remaining_milli": { $subtract: ["$daily.remaining_milli", "$_take"] },
            balance_milli: { $subtract: ["$balance_milli", { $subtract: [milli, "$_take"] }] },
            "totals.used_milli": { $add: [{ $ifNull: ["$totals.used_milli", 0] }, milli] },
            version: { $add: ["$version", 1] },
            last_take_milli: "$_take",
            updated_at: "$$NOW",
          },
        },
        { $set: { included: { $cond: [{ $gt: ["$last_take_milli", 0] }, includedPlus(year, { $multiply: [costPaise || 0, { $divide: ["$last_take_milli", milli] }] }), "$included"] } } },
        { $unset: "_take" },
      ],
      { returnDocument: "after" }
    );
    const after = r && r.value !== undefined ? r.value : r;
    if (after) {
      const fromDaily = after.last_take_milli || 0;
      await db.collection(LEDGER).updateOne(
        { ref },
        { $set: { status: "DONE", from_daily_milli: fromDaily, from_balance_milli: milli - fromDaily, balance_after_milli: after.balance_milli, daily_after_milli: after.daily.remaining_milli } }
      );
      return { charged: milli, duplicate: false, wallet: after };
    }
    // Day rolled over between refresh and charge: refresh and go again
  }
  await db.collection(LEDGER).deleteOne({ ref, status: "PENDING" });
  throw new Error("Couldn't update credits, please try again");
}

// Add credits to the balance (purchase, admin grant, refund). Idempotent on ref.
async function credit(db, pharmacyId, { milli, type, ref, userId = null, actor = null, note = "", meta = {} }) {
  if (!(milli > 0)) throw new Error("Amount must be positive");
  await ensureWallet(db, pharmacyId);
  ref = ref || `${String(type).toLowerCase()}:${crypto.randomUUID()}`;
  try {
    await db.collection(LEDGER).insertOne({
      id: crypto.randomUUID(),
      ref,
      pharmacy_id: pharmacyId,
      user_id: userId,
      type,
      amount_milli: milli,
      bucket: "balance",
      actor,
      note,
      meta,
      status: "PENDING",
      created_at: new Date(),
    });
  } catch (err) {
    if (isDuplicate(err)) return { duplicate: true, wallet: await db.collection(WALLETS).findOne({ pharmacy_id: pharmacyId }) };
    throw err;
  }
  const field = type === "PURCHASE" ? "totals.purchased_milli" : "totals.granted_milli";
  await db.collection(WALLETS).updateOne({ pharmacy_id: pharmacyId }, { $inc: { balance_milli: milli, version: 1, [field]: milli }, $set: { updated_at: new Date() } });
  const after = await db.collection(WALLETS).findOne({ pharmacy_id: pharmacyId });
  await db.collection(LEDGER).updateOne({ ref }, { $set: { status: "DONE", balance_after_milli: after.balance_milli } });
  return { duplicate: false, wallet: after };
}

// Take credits back (admin). Never more than the balance holds.
async function remove(db, pharmacyId, { milli, ref, actor = null, note = "" }) {
  if (!(milli > 0)) throw new Error("Amount must be positive");
  const w = await ensureWallet(db, pharmacyId);
  const take = Math.min(milli, Math.max(0, w.balance_milli || 0));
  if (!take) return { removed: 0, wallet: w };
  ref = ref || `admin_remove:${crypto.randomUUID()}`;
  try {
    await db.collection(LEDGER).insertOne({ id: crypto.randomUUID(), ref, pharmacy_id: pharmacyId, type: "ADMIN_REMOVE", amount_milli: -take, bucket: "balance", actor, note, status: "PENDING", created_at: new Date() });
  } catch (err) {
    if (isDuplicate(err)) return { removed: 0, duplicate: true, wallet: w };
    throw err;
  }
  // Conditional so a concurrent spend can't push it below zero
  const res = await db.collection(WALLETS).updateOne(
    { pharmacy_id: pharmacyId, balance_milli: { $gte: take } },
    { $inc: { balance_milli: -take, version: 1, "totals.removed_milli": take }, $set: { updated_at: new Date() } }
  );
  if (!res.modifiedCount) {
    await db.collection(LEDGER).deleteOne({ ref });
    throw new Error("The balance changed just now, please try again");
  }
  const after = await db.collection(WALLETS).findOne({ pharmacy_id: pharmacyId });
  await db.collection(LEDGER).updateOne({ ref }, { $set: { status: "DONE", balance_after_milli: after.balance_milli } });
  return { removed: take, wallet: after };
}

// Per-pharmacy daily allowance (credits), or null for the plan default.
// Takes effect today: today's remaining moves by the difference.
async function setDailyOverride(db, config, pharmacy, credits, actor = null) {
  const w = await getWallet(db, config, pharmacy);
  const override = credits === null || credits === undefined || credits === "" ? null : Math.max(0, Number(credits));
  const newAllowance = toMilli(allowanceCredits(config, pharmacy, { ...w, daily_override_credits: override }));
  const diff = newAllowance - (w.daily?.allowance_milli || 0);
  await db.collection(WALLETS).updateOne(
    { pharmacy_id: pharmacy.id },
    {
      $set: {
        daily_override_credits: override,
        "daily.allowance_milli": newAllowance,
        "daily.remaining_milli": Math.max(0, (w.daily?.remaining_milli || 0) + diff),
        updated_at: new Date(),
      },
      $inc: { version: 1 },
    }
  );
  await db.collection(LEDGER).insertOne({
    id: crypto.randomUUID(),
    ref: `override:${crypto.randomUUID()}`,
    pharmacy_id: pharmacy.id,
    type: "DAILY_OVERRIDE",
    amount_milli: Math.max(-(w.daily?.remaining_milli || 0), diff), // what today's daily changed by
    bucket: "daily",
    status: "DONE",
    actor,
    note: override === null ? "Daily credits back to the plan default" : `Daily credits set to ${override}`,
    created_at: new Date(),
  });
  return db.collection(WALLETS).findOne({ pharmacy_id: pharmacy.id });
}

// One free (no-credit) message for today, if any are left
async function takeFreeMessage(db, pharmacyId, perDay) {
  const today = todayIst();
  await ensureWallet(db, pharmacyId);
  // New day: reset the counter
  await db.collection(WALLETS).updateOne({ pharmacy_id: pharmacyId, "free.date": { $ne: today } }, { $set: { free: { date: today, used: 0 } } });
  const res = await db.collection(WALLETS).updateOne({ pharmacy_id: pharmacyId, "free.date": today, "free.used": { $lt: perDay } }, { $inc: { "free.used": 1 } });
  return res.modifiedCount === 1;
}

async function history(db, pharmacyId, { limit = 50, before = null } = {}) {
  const q = { pharmacy_id: pharmacyId, status: { $ne: "PENDING" } };
  if (before) q.created_at = { $lt: new Date(before) };
  const rows = await db.collection(LEDGER).find(q, { projection: { _id: 0 } }).sort({ created_at: -1 }).limit(Math.min(200, limit)).toArray();
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    credits: toCredits(r.amount_milli),
    task: r.task || null,
    engine: r.engine || null,
    note: r.note || r.meta?.label || "",
    balance_after: r.balance_after_milli !== undefined ? toCredits(r.balance_after_milli) : null,
    created_at: r.created_at,
  }));
}

module.exports = { WALLETS, LEDGER, isActiveSub, todayIst, toMilli, toCredits, planYear, planBudget, allowanceCredits, addIncludedCost, getWallet, availableMilli, view, charge, credit, remove, setDailyOverride, takeFreeMessage, history, ensureWallet };
