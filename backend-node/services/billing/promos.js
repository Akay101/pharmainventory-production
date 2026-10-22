// Promo codes.
//
//   ACCESS   — grants plans[0] for duration_days, no payment (incl. TRIAL codes)
//   DISCOUNT — percent/flat off at checkout for the listed plans ([] = all)
//
// Usage is enforced atomically: a redemption row (unique per code+pharmacy
// while RESERVED/REDEEMED) plus a conditional $inc on used_count. Checkout
// reserves; payment success redeems; failure/expiry releases.
const crypto = require("crypto");
const { BillingError } = require("./errors");
const subscriptions = require("./subscriptions");
const { requireActivePlan, getPlan } = require("./pricing");

const CODE_RE = /^[A-Z0-9][A-Z0-9_-]{3,31}$/;

const normalizeCode = (code) => {
  if (typeof code !== "string") throw new BillingError("INVALID_CODE", "Enter a valid code");
  const c = code.trim().toUpperCase();
  if (!CODE_RE.test(c)) throw new BillingError("INVALID_CODE", "Enter a valid code");
  return c;
};

const randomCode = (prefix = "", len = 8) => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
  let out = "";
  for (let i = 0; i < len; i++) out += chars[crypto.randomInt(chars.length)];
  return prefix + out;
};

// Look up a code and check it is usable by this pharmacy right now.
// allowOwnReservation: a code this pharmacy has reserved for an unpaid
// checkout still counts as usable for it (e.g. re-quoting before paying).
async function findUsable(db, rawCode, { pharmacyId, now = new Date(), allowOwnReservation = false }) {
  const code = normalizeCode(rawCode);
  const promo = await db.collection("promo_codes").findOne({ code });
  const invalid = () => new BillingError("INVALID_CODE", "This code is invalid or has expired");
  if (!promo || !promo.is_active) throw invalid();
  if (promo.valid_from && new Date(promo.valid_from) > now) throw invalid();
  if (promo.valid_until && new Date(promo.valid_until) <= now) throw invalid();
  if (promo.locked_to_pharmacy_id && promo.locked_to_pharmacy_id !== pharmacyId) throw invalid();

  const mine = await db.collection("promo_redemptions").findOne({
    code,
    pharmacy_id: pharmacyId,
    status: { $in: ["RESERVED", "REDEEMED"] },
  });
  if (mine?.status === "RESERVED" && allowOwnReservation) return promo;
  if (mine) throw new BillingError("CODE_ALREADY_USED", "You have already used this code");
  if (promo.usage_limit && (promo.used_count || 0) >= promo.usage_limit) {
    throw new BillingError("CODE_EXHAUSTED", "This code has reached its usage limit");
  }
  return promo;
}

function assertDiscountFor(promo, planCode) {
  if (promo.type !== "DISCOUNT") {
    throw new BillingError("NOT_A_DISCOUNT_CODE", "This code activates a plan directly. Use “Redeem” instead.");
  }
  if (promo.plans?.length && !promo.plans.includes(planCode)) {
    throw new BillingError("CODE_NOT_FOR_PLAN", `This code is valid for ${promo.plans.join(", ")} only`);
  }
}

// Atomically claim one use of the code for this pharmacy.
async function reserve(db, promo, { pharmacyId, userId, orderId = null, status = "RESERVED" }) {
  const now = new Date();
  const redemption = {
    id: crypto.randomUUID(),
    code: promo.code,
    type: promo.type,
    pharmacy_id: pharmacyId,
    user_id: userId,
    order_id: orderId,
    status,
    created_at: now,
    updated_at: now,
  };
  try {
    await db.collection("promo_redemptions").insertOne(redemption);
  } catch (err) {
    if (err.code === 11000) throw new BillingError("CODE_ALREADY_USED", "You have already used this code");
    throw err;
  }

  const filter = { code: promo.code, is_active: true };
  if (promo.usage_limit) filter.$expr = { $lt: [{ $ifNull: ["$used_count", 0] }, "$usage_limit"] };
  const claimed = await db.collection("promo_codes").findOneAndUpdate(
    filter,
    { $inc: { used_count: 1 }, $set: { last_used_at: now } },
    { returnDocument: "after" }
  );
  if (!claimed) {
    await db.collection("promo_redemptions").deleteOne({ id: redemption.id });
    throw new BillingError("CODE_EXHAUSTED", "This code has reached its usage limit");
  }
  return redemption;
}

// Keep the code's own "last redeemed by" fields in step with its redemptions
async function stampRedeemer(db, code, { pharmacyId, userId }) {
  const pharmacy = await db.collection("pharmacies").findOne({ id: pharmacyId }, { projection: { name: 1 } });
  await db.collection("promo_codes").updateOne(
    { code },
    {
      $set: {
        used_at: new Date().toISOString(),
        used_by_pharmacy_id: pharmacyId,
        used_by_pharmacy_name: pharmacy?.name || null,
        used_by_user_id: userId,
      },
    }
  );
}

async function markRedeemedForOrder(db, orderId) {
  const r = await db.collection("promo_redemptions").findOneAndUpdate(
    { order_id: orderId, status: "RESERVED" },
    { $set: { status: "REDEEMED", updated_at: new Date() } }
  );
  if (r) await stampRedeemer(db, r.code, { pharmacyId: r.pharmacy_id, userId: r.user_id });
}

// Give a reserved use back (payment failed, order expired or superseded).
async function releaseForOrder(db, orderId) {
  const r = await db.collection("promo_redemptions").findOneAndUpdate(
    { order_id: orderId, status: "RESERVED" },
    { $set: { status: "RELEASED", updated_at: new Date() } }
  );
  if (r) {
    await db.collection("promo_codes").updateOne({ code: r.code, used_count: { $gt: 0 } }, { $inc: { used_count: -1 } });
  }
}

/**
 * Redeem an ACCESS code: activates its plan for duration_days immediately.
 */
async function redeemAccessCode(db, rawCode, { pharmacyId, userId }) {
  const promo = await findUsable(db, rawCode, { pharmacyId });
  if (promo.type !== "ACCESS") {
    throw new BillingError("NOT_AN_ACCESS_CODE", "This is a discount code. Choose a plan and apply it at checkout.");
  }
  const planCode = promo.plans?.[0];
  const plan = await getPlan(db, planCode);
  if (!plan) throw new BillingError("PLAN_UNAVAILABLE", "This code's plan is no longer available");

  const redemption = await reserve(db, promo, { pharmacyId, userId, status: "REDEEMED" });
  const result = await subscriptions.activate(db, {
    pharmacyId,
    plan,
    days: promo.duration_days,
    kind: promo.source === "TRIAL" ? "TRIAL" : "PROMO",
    sourceRef: `promo:${promo.code}:${pharmacyId}`,
    actor: { user_id: userId },
    meta: { promo_code: promo.code, redemption_id: redemption.id },
  });
  await stampRedeemer(db, promo.code, { pharmacyId, userId });
  return { promo, ...result };
}

// One-off ACCESS code locked to a pharmacy, used for the free trial.
async function createTrialCode(db, { pharmacyId, planCode, days }) {
  for (let i = 0; i < 5; i++) {
    const doc = {
      code: randomCode("TRIAL-", 6),
      type: "ACCESS",
      plans: [planCode],
      duration_days: days,
      usage_limit: 1,
      used_count: 0,
      per_account_limit: 1,
      is_active: true,
      source: "TRIAL",
      locked_to_pharmacy_id: pharmacyId,
      valid_from: null,
      valid_until: new Date(Date.now() + 24 * 60 * 60 * 1000),
      created_by: "system:free-trial",
      created_at: new Date().toISOString(),
    };
    try {
      await db.collection("promo_codes").insertOne(doc);
      return doc;
    } catch (err) {
      if (err.code !== 11000) throw err;
    }
  }
  throw new Error("Could not allocate a unique trial code");
}

module.exports = {
  normalizeCode,
  randomCode,
  findUsable,
  assertDiscountFor,
  reserve,
  markRedeemedForOrder,
  releaseForOrder,
  redeemAccessCode,
  createTrialCode,
  requireActivePlan,
};
