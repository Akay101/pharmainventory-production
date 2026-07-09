require("dotenv").config();
const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");
const assert = require("assert");

async function runTest() {
  console.log("Connecting to MongoDB...");
  await mongoose.connect(process.env.MONGO_URL);
  const db = mongoose.connection.db;
  console.log("Connected successfully.");

  const pharmacyId = "test_pharmacy_search_123";

  // Clean up
  await db.collection("products").deleteMany({ pharmacy_id: pharmacyId });
  await db.collection("inventory").deleteMany({ pharmacy_id: pharmacyId });

  // 1. Setup test catalog products
  const prod1Id = uuidv4();
  const prod2Id = uuidv4();

  await db.collection("products").insertMany([
    {
      id: prod1Id,
      pharmacy_id: pharmacyId,
      name: "Paracetamol 500mg",
      low_stock_threshold: 10,
      created_at: new Date().toISOString()
    },
    {
      id: prod2Id,
      pharmacy_id: pharmacyId,
      name: "Paracetamol 650mg",
      low_stock_threshold: 10,
      created_at: new Date().toISOString()
    }
  ]);

  // 2. Setup inventory with multiple batches
  await db.collection("inventory").insertMany([
    {
      id: uuidv4(),
      product_id: prod1Id,
      pharmacy_id: pharmacyId,
      product_name: "Paracetamol 500mg",
      batch_no: "BATCH-A",
      expiry_date: "2027-01-01",
      available_quantity: 12,
      quantity: 15,
      purchase_price: 1.0,
      mrp: 1.5,
      cgst: 6,
      sgst: 6,
      created_at: new Date().toISOString()
    },
    {
      id: uuidv4(),
      product_id: prod1Id,
      pharmacy_id: pharmacyId,
      product_name: "Paracetamol 500mg",
      batch_no: "BATCH-B",
      expiry_date: "2027-06-01",
      available_quantity: 8,
      quantity: 10,
      purchase_price: 1.1,
      mrp: 1.6,
      cgst: 6,
      sgst: 6,
      created_at: new Date().toISOString()
    },
    {
      id: uuidv4(),
      product_id: prod2Id,
      pharmacy_id: pharmacyId,
      product_name: "Paracetamol 650mg",
      batch_no: "BATCH-C",
      expiry_date: "2027-03-01",
      available_quantity: 25,
      quantity: 30,
      purchase_price: 1.5,
      mrp: 2.0,
      cgst: 6,
      sgst: 6,
      created_at: new Date().toISOString()
    }
  ]);

  // --- SIMULATE MEDICINES SEARCH AGGREGATION PIPELINE (from routes/medicines.js) ---
  console.log("Simulating search pipeline...");
  const q = "Paracetamol";

  const inventoryMatchStage = {
    pharmacy_id: pharmacyId,
    $or: [
      { product_name: { $regex: q, $options: "i" } },
      { batch_no: { $regex: q, $options: "i" } },
      { salt_composition: { $regex: q, $options: "i" } },
    ]
  };

  const inventoryPipeline = [
    { $match: inventoryMatchStage },
    {
      $group: {
        _id: "$product_name",
        product_id: { $first: "$product_id" },
        product_name: { $first: "$product_name" },
        manufacturer: { $first: "$manufacturer" },
        salt_composition: { $first: "$salt_composition" },
        hsn_no: { $first: "$hsn_no" },
        available_quantity: { $sum: "$available_quantity" },
        quantity: { $sum: "$quantity" },
        units_per_pack: { $first: "$units_per_pack" },
        purchase_price: { $first: "$purchase_price" },
        mrp: { $first: "$mrp" },
        created_at: { $max: "$created_at" },
        supplier_id: { $first: "$supplier_id" },
        batches: {
          $push: {
            id: "$id",
            batch_no: "$batch_no",
            expiry_date: "$expiry_date",
            available_quantity: "$available_quantity",
            quantity: "$quantity",
            purchase_price: "$purchase_price",
            mrp: "$mrp",
            cgst: "$cgst",
            sgst: "$sgst"
          }
        }
      }
    },
    {
      $lookup: {
        from: "suppliers",
        localField: "supplier_id",
        foreignField: "id",
        as: "supplier",
      },
    },
    {
      $unwind: {
        path: "$supplier",
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $addFields: {
        supplier_name: "$supplier.name",
      },
    },
    {
      $project: {
        supplier: 0,
        _id: 0,
      },
    },
    {
      $project: {
        id: "$product_id",
        product_id: "$product_id",
        product_name: "$product_name",
        manufacturer_name: "$manufacturer",
        salt_composition: "$salt_composition",
        short_composition1: "$salt_composition",
        pack_size: { $concat: [{ $toString: { $ifNull: ["$units_per_pack", 1] } }, " units"] },
        pack_size_label: {
          $concat: [{ $toString: { $ifNull: ["$units_per_pack", 1] } }, " units"],
        },
        source: { $literal: "inventory" },
        batches: "$batches",
        batch_no: { $let: { vars: { firstBatch: { $first: "$batches" } }, in: "$$firstBatch.batch_no" } },
        expiry_date: { $let: { vars: { firstBatch: { $first: "$batches" } }, in: "$$firstBatch.expiry_date" } },
        available_quantity: "$available_quantity",
        quantity: "$quantity",
        stock_status: {
          $cond: {
            if: { $gt: ["$available_quantity", 0] },
            then: "In Stock",
            else: "Out of Stock",
          },
        },
        purchase_price: "$purchase_price",
        mrp_per_unit: "$mrp",
        mrp: "$mrp",
        "price(₹)": "$mrp",
        created_at: "$created_at",
        supplier_name: "$supplier_name",
        supplier_id: "$supplier_id",
      }
    }
  ];

  const results = await db.collection("inventory").aggregate(inventoryPipeline).toArray();

  assert.strictEqual(results.length, 2, "Search should return 2 grouped products");
  
  const p500 = results.find(r => r.product_name === "Paracetamol 500mg");
  const p650 = results.find(r => r.product_name === "Paracetamol 650mg");

  assert.ok(p500, "Should have 'Paracetamol 500mg'");
  assert.ok(p650, "Should have 'Paracetamol 650mg'");

  // Assert batches and quantity sum on Paracetamol 500mg
  assert.strictEqual(p500.available_quantity, 20, "Paracetamol 500mg stock should be 12 + 8 = 20");
  assert.strictEqual(p500.batches.length, 2, "Paracetamol 500mg should have exactly 2 batches");
  
  const batches = p500.batches;
  assert.ok(batches.some(b => b.batch_no === "BATCH-A" && b.available_quantity === 12), "Should contain BATCH-A");
  assert.ok(batches.some(b => b.batch_no === "BATCH-B" && b.available_quantity === 8), "Should contain BATCH-B");

  // Assert batches and quantity sum on Paracetamol 650mg
  assert.strictEqual(p650.available_quantity, 25, "Paracetamol 650mg stock should be 25");
  assert.strictEqual(p650.batches.length, 1, "Paracetamol 650mg should have exactly 1 batch");
  assert.strictEqual(p650.batches[0].batch_no, "BATCH-C");

  console.log("🎉 Search pipeline assertion passed successfully!");

  // --- SIMULATE SEARCH SUGGESTIONS AGGREGATION PIPELINE (from routes/medicines.js) ---
  console.log("Simulating suggestions pipeline...");
  
  const suggestionsPipeline = [
    {
      $match: {
        pharmacy_id: pharmacyId,
        $or: [
          { product_name: { $regex: `^${q}`, $options: "i" } },
          { product_name: { $regex: q, $options: "i" } },
        ],
      }
    },
    {
      $group: {
        _id: "$product_name",
        product_name: { $first: "$product_name" },
        product_id: { $first: "$product_id" },
        available_quantity: { $sum: "$available_quantity" }
      }
    },
    { $limit: 10 }
  ];

  const suggestions = await db.collection("inventory").aggregate(suggestionsPipeline).toArray();
  assert.strictEqual(suggestions.length, 2, "Suggestions should return 2 grouped products");
  
  const sug500 = suggestions.find(s => s.product_name === "Paracetamol 500mg");
  assert.strictEqual(sug500.available_quantity, 20, "Suggestion stock should be summed");

  console.log("🎉 Suggestions pipeline assertion passed successfully!");

  // Clean up
  await db.collection("products").deleteMany({ pharmacy_id: pharmacyId });
  await db.collection("inventory").deleteMany({ pharmacy_id: pharmacyId });
  console.log("Cleanup finished.");
}

runTest()
  .then(() => {
    console.log("Test execution completed successfully.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Test execution failed:", err);
    process.exit(1);
  });
