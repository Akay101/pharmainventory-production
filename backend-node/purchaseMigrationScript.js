const { MongoClient, ObjectId } = require("mongodb");
const { v4: uuidv4 } = require("uuid");

const OLD_URI =
  "mongodb+srv://alternate-user02:Thefluentgamer001@cluster0.klen6.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
const NEW_URI =
  "mongodb+srv://akay101685_db_user:enyGnu7IGvCN2rK2@cluster0.fp3n1as.mongodb.net/?appName=Cluster0";

const OLD_DB = "test";
const NEW_DB = "pharmalogy-app-db";

const ENTERPRISE_ID = new ObjectId("690757467ba1e16903ae2ad8");
// const PHARMACY_ID = "dc1cb59e-c461-4e39-9aa1-ae2efacb5499";
const PHARMACY_ID = "e26f243d-ecfa-442c-af49-f68a9827520a";
// const PHARMACY_ID = "047033f0-617d-46f1-bcd9-f1308eeb0ef7";

async function migrate() {
  const oldClient = new MongoClient(OLD_URI);
  const newClient = new MongoClient(NEW_URI);

  let insertedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  try {
    console.log("🚀 Starting migration...\n");

    await oldClient.connect();
    await newClient.connect();

    console.log("✅ Connected to both databases\n");

    const oldDb = oldClient.db(OLD_DB);
    const newDb = newClient.db(NEW_DB);

    const oldDocs = await oldDb
      .collection("purchasebills")
      .find({ enterprise: ENTERPRISE_ID })
      .toArray();

    console.log(`📦 Found ${oldDocs.length} old purchase bills\n`);

    let processed = 0;

    for (const oldDoc of oldDocs) {
      processed++;

      try {
        const migrationId = oldDoc._id.toString();

        const alreadyExists = await newDb.collection("purchases").findOne({
          migration_id: migrationId,
        });

        if (alreadyExists) {
          skippedCount++;
          console.log(`⏭ Skipped ${migrationId}`);
          continue;
        }

        const purchaseId = uuidv4();
        let totalAmount = 0;
        const processedItems = [];

        for (const item of oldDoc.items || []) {
          const packQty = item.qnty || 1;
          const unitsPerPack = 1;
          const packPrice = item.rate || 0;
          const mrpPerUnit = item.retailPrice || 0;

          const totalUnits = packQty * unitsPerPack;
          const pricePerUnit = packPrice;
          const itemTotal = packQty * packPrice;

          totalAmount += itemTotal;

          const processedItem = {
            product_id: item.product ? item.product.toString() : null,
            product_name: item.name,
            batch_no: item.batchNo || null,
            expiry_date: item.expiryDate
              ? new Date(item.expiryDate).toISOString().split("T")[0]
              : null,
            manufacturer: item.manufacturerName || null,
            salt_composition: null,
            pack_type: item.pack || "Strip",
            quantity: totalUnits,
            pack_quantity: packQty,
            units_per_pack: unitsPerPack,
            total_units: totalUnits,
            purchase_price: pricePerUnit,
            pack_price: packPrice,
            price_per_unit: pricePerUnit,
            mrp: mrpPerUnit,
            mrp_per_unit: mrpPerUnit,
            mrp_pack: mrpPerUnit || null,
            hsn_no: item.hsnCode || null,
            item_total: itemTotal,
          };

          processedItems.push(processedItem);

          const existingInventory = await newDb
            .collection("inventory")
            .findOne({
              pharmacy_id: PHARMACY_ID,
              product_name: processedItem.product_name,
              batch_no: processedItem.batch_no,
            });

          if (existingInventory) {
            await newDb.collection("inventory").updateOne(
              { id: existingInventory.id },
              {
                $inc: {
                  quantity: totalUnits,
                  available_quantity: totalUnits,
                },
                $set: {
                  purchase_price: pricePerUnit,
                  mrp: mrpPerUnit,
                  units_per_pack: unitsPerPack,
                  pack_type: processedItem.pack_type,
                  manufacturer: processedItem.manufacturer,
                  pack_price: packPrice,
                  expiry_date: processedItem.expiry_date,
                },
              }
            );
          } else {
            await newDb.collection("inventory").insertOne({
              id: uuidv4(),
              pharmacy_id: PHARMACY_ID,
              product_id: processedItem.product_id,
              product_name: processedItem.product_name,
              batch_no: processedItem.batch_no,
              expiry_date: processedItem.expiry_date,
              manufacturer: processedItem.manufacturer,
              pack_type: processedItem.pack_type,
              quantity: totalUnits,
              available_quantity: totalUnits,
              units_per_pack: unitsPerPack,
              purchase_price: pricePerUnit,
              mrp: mrpPerUnit,
              pack_price: packPrice,
              purchase_id: purchaseId,
              created_at: new Date().toISOString(),
            });
          }
        }

        const purchaseData = {
          id: purchaseId,
          pharmacy_id: PHARMACY_ID,
          supplier_id: null,
          supplier_name: oldDoc.supplierName || null,
          invoice_no: `MIG-${migrationId.slice(-6)}`,
          purchase_date: oldDoc.purchasedDate
            ? new Date(oldDoc.purchasedDate).toISOString().split("T")[0]
            : null,
          items: processedItems,
          total_amount: totalAmount,
          created_by: "migration-script",
          created_at: oldDoc.createdAt
            ? new Date(oldDoc.createdAt).toISOString()
            : new Date().toISOString(),

          migration_source: "old_purchasebills",
          migration_id: migrationId,
        };

        await newDb.collection("purchases").insertOne(purchaseData);

        insertedCount++;
        console.log(`✅ Inserted ${migrationId}`);
      } catch (err) {
        failedCount++;
        console.error(`❌ Failed ${oldDoc._id}:`, err.message);
      }

      // 📊 Progress log every 10 records
      if (processed % 10 === 0) {
        console.log(
          `\n📊 Progress: ${processed}/${oldDocs.length} | ✅ ${insertedCount} | ⏭ ${skippedCount} | ❌ ${failedCount}\n`
        );
      }
    }

    // 🎉 Final summary
    console.log("\n=======================");
    console.log("🎉 MIGRATION COMPLETE");
    console.log("=======================");
    console.log(`📦 Total old records: ${oldDocs.length}`);
    console.log(`✅ Inserted: ${insertedCount}`);
    console.log(`⏭ Skipped: ${skippedCount}`);
    console.log(`❌ Failed: ${failedCount}`);
    console.log("=======================\n");
  } catch (err) {
    console.error("❌ Fatal Error:", err);
  } finally {
    await oldClient.close();
    await newClient.close();
    console.log("🔌 Connections closed");
  }
}

migrate();
