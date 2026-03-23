const mongoose = require("mongoose");
require("dotenv").config();

async function checkLogs() {
  await mongoose.connect(process.env.MONGO_URL, { dbName: process.env.DB_NAME });
  const db = mongoose.connection.db;

  console.log("--- RECENT PAYMENT LOGS ---");
  const logs = await db.collection("payment_logs").find().sort({ _id: -1 }).limit(3).toArray();
  logs.forEach(log => {
    console.log(`Log ID: ${log.id}, Processed: ${log.processed}, Order ID: ${log.order_id}`);
    if (!log.processed) {
      console.log("Raw Payload:", JSON.stringify(log.raw_payload, null, 2).substring(0, 300) + '...');
    }
  });

  console.log("\n--- RECENT SUBSCRIPTIONS ---");
  const subs = await db.collection("subscriptions").find().sort({ _id: -1 }).limit(2).toArray();
  subs.forEach(s => console.log(s.id, s.plan, s.status, s.user_id));

  process.exit();
}
checkLogs().catch(console.error);
