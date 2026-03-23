const mongoose = require("mongoose");

const requireSubscription = (plans = []) => {
  return async (req, res, next) => {
    try {
      const db = mongoose.connection.db;

      const user = await db.collection("users").findOne(
        { id: req.user.id },
        {
          projection: {
            subscription_plan: 1,
            subscription_expiry: 1,
          },
        }
      );

      // ❌ No subscription
      if (!user || !user.subscription_expiry || !user.subscription_plan) {
        return res.status(403).json({
          code: "SUBSCRIPTION_REQUIRED",
          detail: "No active subscription",
        });
      }

      // ❌ Expired
      if (new Date(user.subscription_expiry) < new Date()) {
        return res.status(403).json({
          code: "SUBSCRIPTION_EXPIRED",
          detail: "Subscription expired",
        });
      }

      // ❌ Plan restriction
      if (plans.length && !plans.includes(user.subscription_plan)) {
        return res.status(403).json({
          code: "PLAN_UPGRADE_REQUIRED",
          detail: "Upgrade required",
          current_plan: user.subscription_plan,
        });
      }

      // ✅ Attach subscription to request (VERY USEFUL)
      req.subscription = {
        plan: user.subscription_plan,
        expiry: user.subscription_expiry,
      };

      next();
    } catch (err) {
      next(err);
    }
  };
};

module.exports = { requireSubscription };
