// Pharmacy subscription state machine.
//
// Source of truth: `pharmacies.subscription` (current snapshot) plus the
// `subscriptions` collection (append-only ledger, one row per grant, unique
// on source_ref for idempotency). Users of the pharmacy get a read-only
// mirror (subscription_plan / subscription_expiry) for older readers.
//
// KEEP IN SYNC with admin-backend/services/billing/subscriptions.js
// (separately deployed app; this file has no project-local dependencies).
const crypto = require("crypto");

const DAY_MS = 24 * 60 * 60 * 1000;

// A linked pharmacy's plan comes from its account; it is never changed directly
const assertPrimary = (pharmacy) => {
  if (pharmacy.account_id && pharmacy.account_id !== pharmacy.id) {
    const err = new Error("This pharmacy is linked to another account. Manage the plan on the main pharmacy.");
    err.status = 409;
    err.code = "LINKED_PHARMACY";
    throw err;
  }
};

const isActive = (sub, now = new Date()) =>
  !!sub && !!sub.plan && !!sub.ends_at && new Date(sub.ends_at) > now && sub.status !== "EXPIRED";

// Normalised view used by API responses and middleware.
function describe(sub, now = new Date()) {
  if (!sub || !sub.plan) {
    return { plan: null, status: "NONE", kind: null, starts_at: null, ends_at: null, days_left: 0, trial_used: !!sub?.trial_used };
  }
  const active = isActive(sub, now);
  const msLeft = active ? new Date(sub.ends_at) - now : 0;
  return {
    plan: sub.plan,
    status: active ? (sub.kind === "TRIAL" ? "TRIAL" : "ACTIVE") : "EXPIRED",
    kind: sub.kind || null,
    starts_at: sub.starts_at || null,
    ends_at: sub.ends_at || null,
    days_left: Math.ceil(msLeft / DAY_MS),
    trial_used: !!sub.trial_used,
  };
}

async function mirrorToUsers(db, pharmacyId, sub) {
  const active = isActive(sub);
  await db.collection("users").updateMany(
    { pharmacy_id: pharmacyId },
    {
      $set: {
        subscription_id: active ? sub.ledger_id : null,
        subscription_plan: active ? sub.plan : null,
        subscription_expiry: active ? new Date(sub.ends_at).toISOString() : null,
      },
    }
  );
}

/**
 * Linked pharmacies (paid add-on) carry a copy of the primary pharmacy's
 * subscription, ending at whichever comes first: the plan or the add-on. Every
 * check that reads `pharmacies.subscription` then treats them correctly.
 * Called after any change to the primary's subscription or to an add-on.
 */
async function syncLinkedPharmacies(db, accountId, now = new Date()) {
  const primary = await db.collection("pharmacies").findOne({ id: accountId }, { projection: { subscription: 1, account_id: 1 } });
  if (!primary || (primary.account_id && primary.account_id !== accountId)) return 0;
  const linked = await db
    .collection("pharmacies")
    .find({ account_id: accountId, id: { $ne: accountId } }, { projection: { id: 1, addon_id: 1, subscription: 1, removed_at: 1 } })
    .toArray();
  if (!linked.length) return 0;
  const addons = await db
    .collection("account_addons")
    .find({ account_id: accountId, type: "PHARMACY" }, { projection: { _id: 0, id: 1, status: 1, ends_at: 1, pharmacy_id: 1 } })
    .toArray();
  const main = primary.subscription;
  for (const p of linked) {
    const addon = addons.find((a) => a.id === p.addon_id || a.pharmacy_id === p.id);
    const addonLive = !!addon && addon.status === "ACTIVE" && addon.ends_at && new Date(addon.ends_at) > now;
    const mainLive = isActive(main, now);
    let sub;
    if (main?.plan && addon && !p.removed_at) {
      const endsAt = new Date(Math.min(new Date(main.ends_at).getTime(), new Date(addon.ends_at).getTime()));
      sub = {
        plan: main.plan,
        kind: main.kind,
        status: mainLive && addonLive && endsAt > now ? "ACTIVE" : "EXPIRED",
        starts_at: main.starts_at,
        ends_at: endsAt,
        ledger_id: main.ledger_id || null,
        trial_used: !!main.trial_used,
        linked: true,
        addon_id: addon.id,
        addon_ends_at: addon.ends_at,
        updated_at: now,
      };
    } else {
      sub = { ...(p.subscription || {}), plan: main?.plan || p.subscription?.plan || null, status: "EXPIRED", ends_at: p.subscription?.ends_at || now, linked: true, updated_at: now };
    }
    await db.collection("pharmacies").updateOne({ id: p.id }, { $set: { subscription: sub } });
  }
  return linked.length;
}

/**
 * Unused value of a paid subscription converted into days of `newPlan`.
 * Same plan: the remaining days carry over unchanged.
 */
function creditDays(current, newPlan, now = new Date()) {
  if (!isActive(current, now) || current.kind !== "PAID") return 0;
  const remainingMs = new Date(current.ends_at) - now;
  if (remainingMs <= 0) return 0;
  if (current.plan === newPlan.code) return Math.floor(remainingMs / DAY_MS);
  const totalMs = new Date(current.ends_at) - new Date(current.starts_at);
  const paid = current.amount_paise || 0;
  if (!paid || totalMs <= 0 || !newPlan.price_paise) return 0;
  const remainingValue = (paid * remainingMs) / totalMs;
  return Math.floor((remainingValue / newPlan.price_paise) * newPlan.duration_days);
}

/**
 * Grant a plan to a pharmacy. Idempotent on `sourceRef`: calling twice with
 * the same reference (duplicate webhook, return page + webhook) is a no-op.
 *
 * kind: TRIAL | PAID | PROMO | ADMIN
 * plan: { code, price_paise, duration_days } (price only needed for PAID credit)
 */
async function activate(db, { pharmacyId, plan, days, kind, sourceRef, amountPaise = 0, actor = null, meta = {} }) {
  const now = new Date();
  const existing = await db.collection("subscriptions").findOne({ source_ref: sourceRef });
  if (existing) return { duplicate: true, ledger: existing };

  const pharmacy = await db.collection("pharmacies").findOne({ id: pharmacyId });
  if (!pharmacy) throw new Error(`Pharmacy ${pharmacyId} not found`);
  assertPrimary(pharmacy);
  const current = pharmacy.subscription || null;

  const credit = kind === "TRIAL" ? 0 : creditDays(current, plan, now);
  const endsAt = new Date(now.getTime() + (days + credit) * DAY_MS);

  const ledgerId = crypto.randomUUID();
  const ledger = {
    id: ledgerId,
    source_ref: sourceRef,
    // Legacy unique index on order_id (non-sparse): never leave it null
    order_id: sourceRef,
    pharmacy_id: pharmacyId,
    user_id: actor?.user_id || null,
    plan: plan.code,
    kind,
    status: "ACTIVE",
    start_date: now.toISOString(),
    end_date: endsAt.toISOString(),
    days,
    credit_days: credit,
    amount_paise: amountPaise,
    replaced: current && isActive(current, now) ? { plan: current.plan, kind: current.kind, ends_at: current.ends_at } : null,
    actor,
    metadata: meta,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  };

  try {
    await db.collection("subscriptions").insertOne(ledger);
  } catch (err) {
    if (err.code === 11000) {
      return { duplicate: true, ledger: await db.collection("subscriptions").findOne({ source_ref: sourceRef }) };
    }
    throw err;
  }

  await db.collection("subscriptions").updateMany(
    { pharmacy_id: pharmacyId, status: "ACTIVE", id: { $ne: ledgerId } },
    { $set: { status: "SUPERSEDED", updated_at: now.toISOString() } }
  );

  const sub = {
    plan: plan.code,
    kind,
    status: "ACTIVE",
    starts_at: now,
    ends_at: endsAt,
    amount_paise: amountPaise,
    ledger_id: ledgerId,
    trial_used: !!(current?.trial_used || kind === "TRIAL"),
    updated_at: now,
  };
  await db.collection("pharmacies").updateOne({ id: pharmacyId }, { $set: { subscription: sub } });
  await mirrorToUsers(db, pharmacyId, sub);
  await syncLinkedPharmacies(db, pharmacyId, now);

  return { duplicate: false, ledger, subscription: describe(sub, now), credit_days: credit };
}

// Add days to the current subscription (or restart it from now if lapsed).
async function extend(db, { pharmacyId, days, actor = null, reason = "" }) {
  const now = new Date();
  const pharmacy = await db.collection("pharmacies").findOne({ id: pharmacyId });
  if (pharmacy) assertPrimary(pharmacy);
  const current = pharmacy?.subscription;
  if (!current || !current.plan) throw new Error("No subscription to extend");

  const from = isActive(current, now) ? new Date(current.ends_at) : now;
  const endsAt = new Date(from.getTime() + days * DAY_MS);
  const sub = { ...current, status: "ACTIVE", ends_at: endsAt, updated_at: now };

  await db.collection("pharmacies").updateOne({ id: pharmacyId }, { $set: { subscription: sub } });
  const extendRef = `extend:${pharmacyId}:${now.getTime()}`;
  await db.collection("subscriptions").insertOne({
    id: crypto.randomUUID(),
    source_ref: extendRef,
    order_id: extendRef,
    pharmacy_id: pharmacyId,
    plan: current.plan,
    kind: "ADMIN",
    status: "ADJUSTMENT",
    start_date: now.toISOString(),
    end_date: endsAt.toISOString(),
    days,
    actor,
    metadata: { action: "EXTEND", reason, applies_to: current.ledger_id || null },
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  });
  if (current.ledger_id) {
    await db.collection("subscriptions").updateOne(
      { id: current.ledger_id },
      { $set: { status: "ACTIVE", end_date: endsAt.toISOString(), updated_at: now.toISOString() } }
    );
  }
  await mirrorToUsers(db, pharmacyId, sub);
  await syncLinkedPharmacies(db, pharmacyId, now);
  return describe(sub, now);
}

// End the current subscription immediately (e.g. admin ends a trial).
async function endNow(db, { pharmacyId, actor = null, reason = "" }) {
  const now = new Date();
  const pharmacy = await db.collection("pharmacies").findOne({ id: pharmacyId });
  if (pharmacy) assertPrimary(pharmacy);
  const current = pharmacy?.subscription;
  if (!current || !current.plan) throw new Error("No subscription to end");

  const sub = { ...current, status: "EXPIRED", ends_at: now, updated_at: now };
  await db.collection("pharmacies").updateOne({ id: pharmacyId }, { $set: { subscription: sub } });
  if (current.ledger_id) {
    await db.collection("subscriptions").updateOne(
      { id: current.ledger_id },
      { $set: { status: "ENDED", end_date: now.toISOString(), ended_by: actor, end_reason: reason, updated_at: now.toISOString() } }
    );
  }
  await mirrorToUsers(db, pharmacyId, sub);
  await syncLinkedPharmacies(db, pharmacyId, now);
  return describe(sub, now);
}

// Switch the plan of a live subscription without touching its end date
// (admin upgrade/downgrade). A trial stays a trial.
async function changePlan(db, { pharmacyId, planCode, actor = null, reason = "" }) {
  const now = new Date();
  const pharmacy = await db.collection("pharmacies").findOne({ id: pharmacyId });
  if (pharmacy) assertPrimary(pharmacy);
  const current = pharmacy?.subscription;
  if (!isActive(current, now)) throw new Error("No active subscription to change");
  if (current.plan === planCode) return describe(current, now);

  const sub = { ...current, plan: planCode, updated_at: now };
  await db.collection("pharmacies").updateOne({ id: pharmacyId }, { $set: { subscription: sub } });
  const ref = `change-plan:${pharmacyId}:${now.getTime()}`;
  await db.collection("subscriptions").insertOne({
    id: crypto.randomUUID(),
    source_ref: ref,
    order_id: ref,
    pharmacy_id: pharmacyId,
    plan: planCode,
    kind: "ADMIN",
    status: "ADJUSTMENT",
    start_date: now.toISOString(),
    end_date: new Date(current.ends_at).toISOString(),
    actor,
    metadata: { action: "CHANGE_PLAN", from: current.plan, to: planCode, reason, applies_to: current.ledger_id || null },
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  });
  if (current.ledger_id) {
    await db.collection("subscriptions").updateOne(
      { id: current.ledger_id },
      { $set: { plan: planCode, updated_at: now.toISOString() } }
    );
  }
  await mirrorToUsers(db, pharmacyId, sub);
  await syncLinkedPharmacies(db, pharmacyId, now);
  return describe(sub, now);
}

// Cron: flip lapsed subscriptions to EXPIRED and clear the user mirror.
async function expireDue(db) {
  const now = new Date();
  const due = await db
    .collection("pharmacies")
    .find({ "subscription.status": "ACTIVE", "subscription.ends_at": { $lte: now } }, { projection: { id: 1, subscription: 1 } })
    .toArray();
  for (const p of due) {
    const sub = { ...p.subscription, status: "EXPIRED", updated_at: now };
    await db.collection("pharmacies").updateOne(
      { id: p.id, "subscription.ledger_id": p.subscription.ledger_id },
      { $set: { "subscription.status": "EXPIRED", "subscription.updated_at": now } }
    );
    if (p.subscription.ledger_id) {
      await db.collection("subscriptions").updateOne(
        { id: p.subscription.ledger_id, status: "ACTIVE" },
        { $set: { status: "EXPIRED", updated_at: now.toISOString() } }
      );
    }
    await mirrorToUsers(db, p.id, sub);
    await syncLinkedPharmacies(db, p.id, now);
  }
  return due.length;
}

module.exports = { DAY_MS, syncLinkedPharmacies, isActive, describe, creditDays, activate, extend, endNow, changePlan, expireDue, mirrorToUsers };
