// Pharmacy subscription state machine.
//
// Source of truth: `pharmacies.subscription` (current snapshot) plus the
// `subscriptions` collection (append-only ledger, one row per grant, unique
// on source_ref for idempotency). Users of the pharmacy get a read-only
// mirror (subscription_plan / subscription_expiry) for older readers.
//
// KEEP IN SYNC with backend-node/services/billing/subscriptions.js (and vice versa)
// (separately deployed app; this file has no project-local dependencies).
const crypto = require("crypto");

const DAY_MS = 24 * 60 * 60 * 1000;

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

  return { duplicate: false, ledger, subscription: describe(sub, now), credit_days: credit };
}

// Add days to the current subscription (or restart it from now if lapsed).
async function extend(db, { pharmacyId, days, actor = null, reason = "" }) {
  const now = new Date();
  const pharmacy = await db.collection("pharmacies").findOne({ id: pharmacyId });
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
  return describe(sub, now);
}

// End the current subscription immediately (e.g. admin ends a trial).
async function endNow(db, { pharmacyId, actor = null, reason = "" }) {
  const now = new Date();
  const pharmacy = await db.collection("pharmacies").findOne({ id: pharmacyId });
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
  }
  return due.length;
}

module.exports = { DAY_MS, isActive, describe, creditDays, activate, extend, endNow, expireDue, mirrorToUsers };
