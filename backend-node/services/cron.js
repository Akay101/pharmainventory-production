const cron = require("node-cron");
const mongoose = require("mongoose");
const { checkAndProcessDueReminders } = require("./notifications");
const { withJobLock } = require("./jobs/lock");
const subscriptions = require("./billing/subscriptions");
const orders = require("./billing/orders");
const { sendSubscriptionEmail } = require("./email");

// Every job takes a Mongo lease so it runs on one container only, including
// while old and new containers overlap during a deploy.
const job = (name, leaseMs, fn) => async () => {
  const db = mongoose.connection.db;
  if (!db) return;
  try {
    await withJobLock(db, name, leaseMs, () => fn(db));
  } catch (err) {
    console.error(`[Cron] ${name} failed:`, err);
  }
};

// Day-before reminder for trials (sent once per trial).
async function remindEndingTrials(db) {
  const now = Date.now();
  const fresh = await db
    .collection("pharmacies")
    .find({
      "subscription.status": "ACTIVE",
      "subscription.kind": "TRIAL",
      "subscription.ends_at": { $gt: new Date(now), $lte: new Date(now + 26 * 60 * 60 * 1000) },
      "subscription.reminder_sent_for": { $exists: false },
    })
    .toArray();
  for (const p of fresh) {
    const owner = await db.collection("users").findOne({ pharmacy_id: p.id, role: "ADMIN", is_primary_admin: true });
    if (!owner) continue;
    const marked = await db.collection("pharmacies").updateOne(
      { id: p.id, "subscription.reminder_sent_for": { $exists: false } },
      { $set: { "subscription.reminder_sent_for": p.subscription.ledger_id || "trial" } }
    );
    if (!marked.modifiedCount) continue;
    await sendSubscriptionEmail(owner.email, owner.name, {
      subject: "Your DavaDesk free trial ends tomorrow",
      badge: "Trial ending",
      title: "Your trial ends tomorrow",
      message: "Choose a plan before your trial ends to keep billing, inventory and reports running without interruption.",
      rows: [
        { label: "Plan", value: p.subscription.plan },
        { label: "Ends on", value: new Date(p.subscription.ends_at).toLocaleString("en-IN") },
      ],
    }).catch((err) => console.warn("[Cron] trial reminder email failed:", err.message));
  }
  return fresh.length;
}

const startCronJobs = () => {
  // Expire lapsed subscriptions (also enforced per request by requireSubscription)
  cron.schedule(
    "*/15 * * * *",
    job("expire-subscriptions", 10 * 60 * 1000, async (db) => {
      const n = await subscriptions.expireDue(db);
      if (n) console.log(`[Cron] Expired ${n} subscription(s)`);
    })
  );

  // Catch missed webhooks, close abandoned checkouts and release their promos
  cron.schedule(
    "*/10 * * * *",
    job("reconcile-payments", 9 * 60 * 1000, async (db) => {
      const r = await orders.reconcile(db);
      if (r.checked) console.log(`[Cron] Reconciled ${r.checked} order(s), activated ${r.activated}`);
    })
  );

  // Trial-ending reminders (hourly so the 24h window is never missed)
  cron.schedule("5 * * * *", job("trial-reminders", 30 * 60 * 1000, remindEndingTrials));

  // Restock / refill due reminders (every 3 hours)
  cron.schedule(
    "0 */3 * * *",
    job("refill-reminders", 60 * 60 * 1000, async (db) => {
      const res = await checkAndProcessDueReminders(db);
      if (res.created > 0) {
        console.log(`[DavaDesk Notifications] Processed ${res.processed} reminders, created ${res.created} new refill alerts.`);
      }
    })
  );
};

module.exports = startCronJobs;
