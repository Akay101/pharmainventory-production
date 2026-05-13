const mongoose = require("mongoose");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.join(__dirname, "../.env") });

async function run() {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log("Connected to MongoDB");
    
    const db = mongoose.connection.db;
    
    console.log("Creating partial unique compound index on purchases...");
    await db.collection("purchases").createIndex(
      { pharmacy_id: 1, supplier_id: 1, invoice_no: 1 },
      { 
        unique: true, 
        name: "pharmacy_supplier_invoice_unique",
        partialFilterExpression: { invoice_no: { $exists: true, $ne: "" } }
      }
    );
    
    console.log("Index created successfully!");
    process.exit(0);
  } catch (error) {
    console.error("Error creating index:", error);
    process.exit(1);
  }
}

run();
