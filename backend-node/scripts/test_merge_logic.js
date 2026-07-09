require("dotenv").config();
const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");
const assert = require("assert");

async function runTest() {
  console.log("Connecting to MongoDB...");
  await mongoose.connect(process.env.MONGO_URL);
  const db = mongoose.connection.db;
  console.log("Connected successfully.");

  const pharmacyId = "test_pharmacy_merge_123";
  const userId = "test_user_123";

  // Clean up any leftover test data
  await db.collection("products").deleteMany({ pharmacy_id: pharmacyId });
  await db.collection("inventory").deleteMany({ pharmacy_id: pharmacyId });
  await db.collection("purchases").deleteMany({ pharmacy_id: pharmacyId });
  await db.collection("bills").deleteMany({ pharmacy_id: pharmacyId });

  // 1. Create dummy catalog products
  const productAId = uuidv4();
  const productBId = uuidv4();
  
  await db.collection("products").insertMany([
    {
      id: productAId,
      pharmacy_id: pharmacyId,
      name: "Dolo 650mg Tablet",
      low_stock_threshold: 10,
      created_at: new Date().toISOString()
    },
    {
      id: productBId,
      pharmacy_id: pharmacyId,
      name: "Dolo 650 Tablet",
      low_stock_threshold: 10,
      created_at: new Date().toISOString()
    }
  ]);

  // 2. Create inventory records (two with overlapping batch numbers, one with different batch)
  const invAId = uuidv4();
  const invBId = uuidv4();
  const invCId = uuidv4();

  await db.collection("inventory").insertMany([
    {
      id: invAId,
      product_id: productAId,
      pharmacy_id: pharmacyId,
      product_name: "Dolo 650mg Tablet",
      batch_no: "B123",
      expiry_date: "2028-12-31",
      quantity: 50,
      available_quantity: 40,
      purchase_price: 1.5,
      mrp: 2.0,
      cgst: 6,
      sgst: 6,
      created_at: new Date().toISOString()
    },
    {
      id: invBId,
      product_id: productBId,
      pharmacy_id: pharmacyId,
      product_name: "Dolo 650 Tablet",
      batch_no: "B123", // OVERLAPPING BATCH NO
      expiry_date: "2028-12-31",
      quantity: 30,
      available_quantity: 25,
      purchase_price: 1.6,
      mrp: 2.1,
      cgst: 6,
      sgst: 6,
      created_at: new Date().toISOString()
    },
    {
      id: invCId,
      product_id: productBId,
      pharmacy_id: pharmacyId,
      product_name: "Dolo 650 Tablet",
      batch_no: "B456", // DIFFERENT BATCH
      expiry_date: "2028-10-31",
      quantity: 10,
      available_quantity: 10,
      purchase_price: 1.6,
      mrp: 2.1,
      cgst: 6,
      sgst: 6,
      created_at: new Date().toISOString()
    }
  ]);

  // 3. Create historical purchases referencing these products
  const purchaseId = uuidv4();
  await db.collection("purchases").insertOne({
    id: purchaseId,
    pharmacy_id: pharmacyId,
    supplier_name: "Test Supplier",
    items: [
      {
        product_id: productAId,
        product_name: "Dolo 650mg Tablet",
        batch_no: "B123",
        quantity: 50
      },
      {
        product_id: productBId,
        product_name: "Dolo 650 Tablet",
        batch_no: "B123",
        quantity: 30
      },
      {
        product_id: productBId,
        product_name: "Dolo 650 Tablet",
        batch_no: "B456",
        quantity: 10
      }
    ],
    created_at: new Date().toISOString()
  });

  // 4. Create historical bills referencing these inventory items
  const billId = uuidv4();
  await db.collection("bills").insertOne({
    id: billId,
    pharmacy_id: pharmacyId,
    items: [
      {
        inventory_id: invAId,
        product_name: "Dolo 650mg Tablet",
        batch_no: "B123",
        quantity: 10
      },
      {
        inventory_id: invBId,
        product_name: "Dolo 650 Tablet",
        batch_no: "B123",
        quantity: 5
      }
    ],
    created_at: new Date().toISOString()
  });

  // --- RUN MERGING LOGIC SIMULATION ---
  console.log("Simulating merge of [invAId, invBId, invCId] into 'Dolo 650mg Tablet'...");
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const inventory_ids = [invAId, invBId, invCId];
    const merged_name = "Dolo 650mg Tablet";
    const merged_manufacturer = "Micro Labs";
    const merged_salt = "Paracetamol 650mg";
    const merged_hsn = "300490";

    const cleanMergedName = merged_name.trim();

    // 1. Fetch target inventory documents
    const items = await db.collection("inventory").find({
      pharmacy_id: pharmacyId,
      id: { $in: inventory_ids }
    }, { session }).toArray();

    assert.strictEqual(items.length, 3, "Should find all 3 items");

    const oldProductNames = [...new Set(items.map(item => item.product_name))];
    const oldProductIds = [...new Set(items.map(item => item.product_id).filter(id => id))];

    // 2. Find or create unified product
    let matchedProduct = await db.collection("products").findOne({
      pharmacy_id: pharmacyId,
      name: { $regex: new RegExp("^" + cleanMergedName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + "$", "i") }
    }, { session });

    let unifiedProductId;
    if (matchedProduct) {
      unifiedProductId = matchedProduct.id;
    } else {
      unifiedProductId = uuidv4();
      await db.collection("products").insertOne({
        id: unifiedProductId,
        pharmacy_id: pharmacyId,
        name: cleanMergedName,
        low_stock_threshold: 10,
        created_at: new Date().toISOString()
      }, { session });
    }

    assert.strictEqual(unifiedProductId, productAId, "Should use existing Product A ID");

    // 3. Batch conflict check
    const batchesMap = {};
    items.forEach(item => {
      if (!batchesMap[item.batch_no]) {
        batchesMap[item.batch_no] = [];
      }
      batchesMap[item.batch_no].push(item);
    });

    const deletedToPrimary = {};
    const inventoryIdsToKeep = [];

    for (const batchNo of Object.keys(batchesMap)) {
      const batchItems = batchesMap[batchNo];
      if (batchItems.length > 1) {
        const primary = batchItems[0];
        inventoryIdsToKeep.push(primary.id);

        let totalQty = primary.quantity || 0;
        let totalAvailable = primary.available_quantity || 0;

        for (let i = 1; i < batchItems.length; i++) {
          const duplicate = batchItems[i];
          totalQty += (duplicate.quantity || 0);
          totalAvailable += (duplicate.available_quantity || 0);
          deletedToPrimary[duplicate.id] = primary.id;

          await db.collection("inventory").deleteOne({ id: duplicate.id }, { session });
        }

        await db.collection("inventory").updateOne(
          { id: primary.id },
          {
            $set: {
              quantity: totalQty,
              available_quantity: totalAvailable
            }
          },
          { session }
        );
      } else {
        inventoryIdsToKeep.push(batchItems[0].id);
      }
    }

    // Asserts duplicate batch consolidation:
    // invBId (batch B123) should be deleted, invAId (batch B123) should be kept with updated qty.
    assert.strictEqual(deletedToPrimary[invBId], invAId, "invBId should be mapped to invAId");
    assert.ok(inventoryIdsToKeep.includes(invAId), "invAId should be kept");
    assert.ok(inventoryIdsToKeep.includes(invCId), "invCId should be kept");
    assert.ok(!inventoryIdsToKeep.includes(invBId), "invBId should not be in kept list");

    // 4. Update remaining inventory batches
    await db.collection("inventory").updateMany(
      {
        pharmacy_id: pharmacyId,
        id: { $in: inventoryIdsToKeep }
      },
      {
        $set: {
          product_id: unifiedProductId,
          product_name: cleanMergedName,
          manufacturer: merged_manufacturer || null,
          salt_composition: merged_salt || null,
          hsn_no: merged_hsn || null
        }
      },
      { session }
    );

    // 5. Update historical purchases
    if (oldProductNames.length > 0 || oldProductIds.length > 0) {
      const purchaseQuery = {
        pharmacy_id: pharmacyId,
        $or: []
      };
      if (oldProductNames.length > 0) {
        purchaseQuery.$or.push({ "items.product_name": { $in: oldProductNames } });
      }
      if (oldProductIds.length > 0) {
        purchaseQuery.$or.push({ "items.product_id": { $in: oldProductIds } });
      }

      const matchingPurchases = await db.collection("purchases").find(purchaseQuery, { session }).toArray();

      for (const purchase of matchingPurchases) {
        const updatedItems = purchase.items.map(item => {
          const nameMatches = oldProductNames.includes(item.product_name);
          const idMatches = item.product_id && oldProductIds.includes(item.product_id);

          if (nameMatches || idMatches) {
            return {
              ...item,
              product_id: unifiedProductId,
              product_name: cleanMergedName,
              manufacturer: merged_manufacturer || item.manufacturer,
              salt_composition: merged_salt || item.salt_composition,
              hsn_no: merged_hsn || item.hsn_no
            };
          }
          return item;
        });

        await db.collection("purchases").updateOne(
          { id: purchase.id },
          { $set: { items: updatedItems } },
          { session }
        );
      }
    }

    // 6. Update historical bills
    const billQuery = {
      pharmacy_id: pharmacyId,
      $or: [
        { "items.product_name": { $in: oldProductNames } },
        { "items.inventory_id": { $in: inventory_ids } }
      ]
    };

    const matchingBills = await db.collection("bills").find(billQuery, { session }).toArray();

    for (const bill of matchingBills) {
      const updatedItems = bill.items.map(item => {
        const nameMatches = oldProductNames.includes(item.product_name);
        const invIdMatches = item.inventory_id && inventory_ids.includes(item.inventory_id);

        if (nameMatches || invIdMatches) {
          let targetInvId = item.inventory_id;
          if (targetInvId && deletedToPrimary[targetInvId]) {
            targetInvId = deletedToPrimary[targetInvId];
          }

          return {
            ...item,
            inventory_id: targetInvId,
            product_name: cleanMergedName,
            salt_composition: merged_salt || item.salt_composition
          };
        }
        return item;
      });

      await db.collection("bills").updateOne(
        { id: bill.id },
        { $set: { items: updatedItems } },
        { session }
      );
    }

    // 7. Clean up old catalog products
    const productsToDelete = oldProductIds.filter(id => id !== unifiedProductId);
    if (productsToDelete.length > 0) {
      await db.collection("products").deleteMany({
        pharmacy_id: pharmacyId,
        id: { $in: productsToDelete }
      }, { session });
    }

    await session.commitTransaction();
    console.log("Transaction committed successfully!");
  } catch (error) {
    await session.abortTransaction();
    console.error("Transaction failed, aborted:", error);
    throw error;
  } finally {
    session.endSession();
  }

  // --- RUN POST-MERGE VALIDATION ASSERTS ---
  console.log("Running assertions...");

  // A. Inventory verification
  const inventoryItems = await db.collection("inventory").find({ pharmacy_id: pharmacyId }).toArray();
  assert.strictEqual(inventoryItems.length, 2, "Should have exactly 2 inventory items left");
  
  const invA = inventoryItems.find(i => i.id === invAId);
  const invB = inventoryItems.find(i => i.id === invBId);
  const invC = inventoryItems.find(i => i.id === invCId);

  assert.ok(invA, "invA should still exist");
  assert.ok(!invB, "invB should be deleted");
  assert.ok(invC, "invC should still exist");

  // Verify quantity addition
  assert.strictEqual(invA.quantity, 80, "invA quantity should be 50 + 30 = 80");
  assert.strictEqual(invA.available_quantity, 65, "invA available_quantity should be 40 + 25 = 65");
  assert.strictEqual(invA.product_name, "Dolo 650mg Tablet");
  assert.strictEqual(invA.manufacturer, "Micro Labs");
  assert.strictEqual(invA.salt_composition, "Paracetamol 650mg");
  assert.strictEqual(invA.hsn_no, "300490");

  assert.strictEqual(invC.product_name, "Dolo 650mg Tablet");
  assert.strictEqual(invC.manufacturer, "Micro Labs");
  assert.strictEqual(invC.salt_composition, "Paracetamol 650mg");
  assert.strictEqual(invC.hsn_no, "300490");

  // B. Product list verification (old product deleted)
  const products = await db.collection("products").find({ pharmacy_id: pharmacyId }).toArray();
  assert.strictEqual(products.length, 1, "Should have only 1 product left");
  assert.strictEqual(products[0].id, productAId, "Should keep productAId");
  assert.strictEqual(products[0].name, "Dolo 650mg Tablet");

  // C. Purchases verification
  const purchase = await db.collection("purchases").findOne({ id: purchaseId });
  assert.ok(purchase, "Purchase should exist");
  assert.strictEqual(purchase.items[0].product_name, "Dolo 650mg Tablet");
  assert.strictEqual(purchase.items[0].product_id, productAId);
  assert.strictEqual(purchase.items[1].product_name, "Dolo 650mg Tablet");
  assert.strictEqual(purchase.items[1].product_id, productAId);
  assert.strictEqual(purchase.items[2].product_name, "Dolo 650mg Tablet");
  assert.strictEqual(purchase.items[2].product_id, productAId);
  // check manufacturer/salt/hsn fields are updated
  assert.strictEqual(purchase.items[0].manufacturer, "Micro Labs");
  assert.strictEqual(purchase.items[0].salt_composition, "Paracetamol 650mg");

  // D. Bills verification
  const bill = await db.collection("bills").findOne({ id: billId });
  assert.ok(bill, "Bill should exist");
  assert.strictEqual(bill.items[0].product_name, "Dolo 650mg Tablet");
  assert.strictEqual(bill.items[0].inventory_id, invAId);
  assert.strictEqual(bill.items[1].product_name, "Dolo 650mg Tablet");
  // CRITICAL: invBId was deleted, so item in bill must now link to invAId
  assert.strictEqual(bill.items[1].inventory_id, invAId, "Deleted inventory link should be rewritten to invAId");

  console.log("🎉 All assertions passed successfully!");

  // Clean up test data
  console.log("Cleaning up test data...");
  await db.collection("products").deleteMany({ pharmacy_id: pharmacyId });
  await db.collection("inventory").deleteMany({ pharmacy_id: pharmacyId });
  await db.collection("purchases").deleteMany({ pharmacy_id: pharmacyId });
  await db.collection("bills").deleteMany({ pharmacy_id: pharmacyId });
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
