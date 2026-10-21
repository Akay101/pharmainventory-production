// Free trial: once per pharmacy, ever.
//
// Mints a single-use TRIAL access code locked to the pharmacy, redeems it
// (activating the best plan for the configured days) and emails the code as a
// receipt. Done in-process rather than via an HTTP promo endpoint so no
// code-minting API is ever exposed.
const { BillingError } = require("./errors");
const pricing = require("./pricing");
const promos = require("./promos");
const subscriptions = require("./subscriptions");
const { sendTrialStartedEmail } = require("../email");

async function trialEligibility(db, { pharmacy, user }) {
  const trial = await pricing.getTrialConfig(db);
  if (!trial.enabled) return { eligible: false, reason: "TRIAL_DISABLED" };
  if (pharmacy.trial_claimed_at || pharmacy.subscription?.trial_used) return { eligible: false, reason: "TRIAL_USED" };
  if (subscriptions.isActive(pharmacy.subscription)) return { eligible: false, reason: "ALREADY_SUBSCRIBED" };
  if (pharmacy.subscription?.plan) return { eligible: false, reason: "PREVIOUSLY_SUBSCRIBED" };

  // Same mobile number already used a trial under another pharmacy
  const mobile = String(user.mobile || "").replace(/\D/g, "").slice(-10);
  if (mobile) {
    const others = await db
      .collection("users")
      .find({ pharmacy_id: { $ne: pharmacy.id }, mobile: { $regex: `${mobile}$` } }, { projection: { pharmacy_id: 1 } })
      .limit(20)
      .toArray();
    if (others.length) {
      const used = await db.collection("pharmacies").countDocuments({
        id: { $in: others.map((o) => o.pharmacy_id) },
        $or: [{ trial_claimed_at: { $exists: true } }, { "subscription.trial_used": true }],
      });
      if (used) return { eligible: false, reason: "TRIAL_USED" };
    }
  }
  return { eligible: true, days: trial.days };
}

const REASON_TEXT = {
  TRIAL_DISABLED: "Free trials are not available right now",
  TRIAL_USED: "Your pharmacy has already used its free trial",
  ALREADY_SUBSCRIBED: "You already have an active plan",
  PREVIOUSLY_SUBSCRIBED: "Free trial is only for new pharmacies",
};

async function startFreeTrial(db, { user, pharmacy }) {
  if (user.role !== "ADMIN") {
    throw new BillingError("OWNER_ONLY", "Only the pharmacy admin can start the free trial", 403);
  }
  const elig = await trialEligibility(db, { pharmacy, user });
  if (!elig.eligible) throw new BillingError(elig.reason, REASON_TEXT[elig.reason], 409);

  // Atomic claim: concurrent clicks can't start two trials
  const claim = await db.collection("pharmacies").updateOne(
    { id: pharmacy.id, trial_claimed_at: { $exists: false } },
    { $set: { trial_claimed_at: new Date(), trial_claimed_by: user.id } }
  );
  if (!claim.modifiedCount) throw new BillingError("TRIAL_USED", REASON_TEXT.TRIAL_USED, 409);

  try {
    const trial = await pricing.getTrialConfig(db);
    const plan = trial.plan === "BEST" ? await pricing.getBestPlan(db) : await pricing.getPlan(db, trial.plan);
    if (!plan) throw new BillingError("PLAN_UNAVAILABLE", "No plan is available for the trial");

    const codeDoc = await promos.createTrialCode(db, { pharmacyId: pharmacy.id, planCode: plan.code, days: trial.days });
    const result = await promos.redeemAccessCode(db, codeDoc.code, { pharmacyId: pharmacy.id, userId: user.id });

    sendTrialStartedEmail(user.email, user.name, {
      code: codeDoc.code,
      planName: plan.name,
      days: trial.days,
      endsAt: result.subscription.ends_at,
    }).catch((err) => console.warn("[Billing] Trial email failed:", err.message));

    return { plan: plan.code, days: trial.days, subscription: result.subscription };
  } catch (err) {
    // Roll back the claim so a transient failure doesn't burn the trial
    const started = await db.collection("subscriptions").findOne({ pharmacy_id: pharmacy.id, kind: "TRIAL" });
    if (!started) {
      await db.collection("pharmacies").updateOne({ id: pharmacy.id }, { $unset: { trial_claimed_at: "", trial_claimed_by: "" } });
    }
    throw err;
  }
}

module.exports = { trialEligibility, startFreeTrial };
