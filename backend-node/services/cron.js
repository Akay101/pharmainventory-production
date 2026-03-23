const cron = require("node-cron");
const mongoose = require("mongoose");

const startCronJobs = () => {
  cron.schedule("0 2 * * *", async () => {
    const db = mongoose.connection.db;
    const now = new Date().toISOString();

    // expire subscriptions
    await db.collection("subscriptions").updateMany(
      {
        status: "ACTIVE",
        end_date: { $lt: now },
      },
      {
        $set: { status: "EXPIRED", updated_at: now },
      }
    );

    // update users
    await db.collection("users").updateMany(
      {
        subscription_expiry: { $lt: now },
        subscription_plan: { $ne: null },
      },
      {
        $set: {
          subscription_plan: null,
          subscription_id: null,
          subscription_expiry: null,
        },
      }
    );

    console.log("Subscription expiry cron executed");
  });
};

module.exports = startCronJobs;
