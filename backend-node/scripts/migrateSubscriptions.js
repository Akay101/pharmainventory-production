require("dotenv").config();
const mongoose = require("mongoose");

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL, {
      dbName: "pharmalogy-app-db",
    });

    console.log("Connected to DB");

    const db = mongoose.connection.db;

    const result = await db.collection("users").updateMany(
      {
        subscription_plan: { $exists: false },
      },
      {
        $set: {
          subscription_id: null,
          subscription_plan: null,
          subscription_expiry: null,
        },
      }
    );

    console.log("Migration complete");
    console.log("Modified users:", result.modifiedCount);

    process.exit(0);
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  }
})();
