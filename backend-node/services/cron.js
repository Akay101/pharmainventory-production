const cron = require("node-cron");
const mongoose = require("mongoose");
const { checkAndProcessDueReminders } = require("./notifications");

const startCronJobs = () => {
  // Daily subscription expiry cron
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

  // Daily & Periodic Restock / Refill Due Reminders Cron (Runs at 08:00 AM and every 3 hours)
  cron.schedule("0 */3 * * *", async () => {
    try {
      const db = mongoose.connection.db;
      if (db) {
        const res = await checkAndProcessDueReminders(db);
        if (res.created > 0) {
          console.log(`[DavaDesk Notifications] Processed ${res.processed} reminders, created ${res.created} new refill alerts.`);
        }
      }
    } catch (err) {
      console.error("[DavaDesk Cron Error] Failed to process due reminders:", err);
    }
  });
};

module.exports = startCronJobs;
