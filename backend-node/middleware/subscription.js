const mongoose = require("mongoose");
const { isActive } = require("../services/billing/subscriptions");

// Subscriptions belong to the pharmacy; every user of the pharmacy (owner and
// staff) shares it. Expiry is checked on every request, so access stops on
// time regardless of when the expiry cron last ran.
const requireSubscription = (plans = []) => {
  return async (req, res, next) => {
    try {
      const db = mongoose.connection.db;
      const pharmacy = await db
        .collection("pharmacies")
        .findOne({ id: req.user.pharmacy_id }, { projection: { subscription: 1 } });
      const sub = pharmacy?.subscription;

      if (!sub || !sub.plan) {
        return res.status(403).json({
          code: "SUBSCRIPTION_REQUIRED",
          detail: "No active subscription",
        });
      }

      if (!isActive(sub)) {
        return res.status(403).json({
          code: "SUBSCRIPTION_EXPIRED",
          detail: sub.kind === "TRIAL" ? "Your free trial has ended" : "Subscription expired",
        });
      }

      if (plans.length && !plans.includes(sub.plan)) {
        return res.status(403).json({
          code: "PLAN_UPGRADE_REQUIRED",
          detail: "Upgrade required",
          current_plan: sub.plan,
        });
      }

      req.subscription = {
        plan: sub.plan,
        kind: sub.kind,
        expiry: sub.ends_at,
      };

      next();
    } catch (err) {
      next(err);
    }
  };
};

module.exports = { requireSubscription };
