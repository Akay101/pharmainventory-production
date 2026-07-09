require("dotenv").config();
const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");
const assert = require("assert");

async function runTest() {
  console.log("Connecting to MongoDB...");
  await mongoose.connect(process.env.MONGO_URL);
  const db = mongoose.connection.db;
  console.log("Connected successfully.");

  const pharmacyId = "test_pharmacy_pag_123";

  // Clean up
  await db.collection("inventory").deleteMany({ pharmacy_id: pharmacyId });

  // 1. Create 35 test inventory items
  const testItems = [];
  for (let i = 1; i <= 35; i++) {
    testItems.push({
      id: uuidv4(),
      product_id: uuidv4(),
      pharmacy_id: pharmacyId,
      product_name: `Dolo Test Item ${i.toString().padStart(2, "0")}`,
      batch_no: `BATCH-${i}`,
      expiry_date: "2028-12-31",
      quantity: 10,
      available_quantity: 10,
      purchase_price: 1.0,
      mrp: 2.0,
      cgst: 6,
      sgst: 6,
      created_at: new Date(Date.now() + i * 1000).toISOString() // Different creation times
    });
  }

  await db.collection("inventory").insertMany(testItems);
  console.log("Inserted 35 test inventory records.");

  // 2. Simulate GET /api/inventory with page=1, limit=10
  console.log("Testing GET / with page=1, limit=10...");
  const page = 1;
  const limit = 10;
  const sort_by = "created_at";
  const sortDir = -1; // desc

  const query = { pharmacy_id: pharmacyId };
  const total = await db.collection("inventory").countDocuments(query);
  assert.strictEqual(total, 35, "Total count should be 35");

  const skip = (page - 1) * limit;
  const page1Items = await db.collection("inventory")
    .find(query)
    .sort({ [sort_by]: sortDir })
    .skip(skip)
    .limit(limit)
    .toArray();

  assert.strictEqual(page1Items.length, 10, "Page 1 should return exactly 10 items");
  assert.strictEqual(page1Items[0].product_name, "Dolo Test Item 35", "First item should be the newest (Item 35)");

  // 3. Simulate GET /api/inventory with page=4, limit=10
  console.log("Testing GET / with page=4, limit=10...");
  const page4 = 4;
  const skip4 = (page4 - 1) * limit;
  const page4Items = await db.collection("inventory")
    .find(query)
    .sort({ [sort_by]: sortDir })
    .skip(skip4)
    .limit(limit)
    .toArray();

  assert.strictEqual(page4Items.length, 5, "Page 4 should return exactly 5 items (35 total)");
  assert.strictEqual(page4Items[4].product_name, "Dolo Test Item 01", "Last item on last page should be oldest (Item 01)");

  // 4. Test GET /api/inventory/search with page=2, limit=2
  console.log("Testing GET /search pagination...");
  const searchQ = "Dolo Test";
  const searchPage = 2;
  const searchLimit = 2;

  const searchQuery = {
    pharmacy_id: pharmacyId,
    product_name: { $regex: searchQ, $options: "i" }
  };

  const allGrouped = await db.collection("inventory").aggregate([
    { $match: searchQuery },
    {
      $group: {
        _id: "$product_name"
      }
    }
  ]).toArray();

  assert.strictEqual(allGrouped.length, 35, "Grouped matches should be 35");

  const searchResults = await db.collection("inventory").aggregate([
    { $match: searchQuery },
    {
      $group: {
        _id: "$product_name",
        product_name: { $first: "$product_name" },
        batches: {
          $push: {
            batch_no: "$batch_no"
          }
        }
      }
    }
  ]).toArray();

  assert.strictEqual(searchResults.length, 35, "Total grouped matches should be 35");

  // Simulate slice pagination
  const paginatedResults = searchResults.slice((searchPage - 1) * searchLimit, searchPage * searchLimit);
  assert.strictEqual(paginatedResults.length, 2, "Search page 2 should return exactly 2 items");

  console.log("🎉 Pagination assertions passed successfully!");

  // Clean up
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
