const mongoose = require("mongoose");
require("dotenv").config({ path: __dirname + "/../.env" });

async function fixFebutecPurchase() {
  const uri = process.env.MONGO_URI || "mongodb://localhost:27017/pharmacy_db";
  try {
    await mongoose.connect(uri);
    const db = mongoose.connection.db;

    console.log("Searching for Febutec purchases near 15 August...");
    const purchases = await db.collection("purchases").find({
      $or: [
        { "items.product_name": { $regex: "febutec", $options: "i" } },
        { supplier_name: { $regex: "neeranjan", $options: "i" } }
      ]
    }).toArray();

    let updatedCount = 0;
    for (const purchase of purchases) {
      let modified = false;
      const updatedItems = (purchase.items || []).map((item) => {
        if (/febutec/i.test(item.product_name || "")) {
          modified = true;
          const qty = 2;
          const rate = 44;
          const unitsPerPack = item.units_per_pack || 10;
          const discount = item.discount_percent || 0;
          const totalAmount = (qty * rate) * (1 - discount / 100);
          const pricePerUnit = unitsPerPack > 0 ? (rate * (1 - discount / 100)) / unitsPerPack : 0;
          return {
            ...item,
            pack_quantity: qty,
            quantity: qty,
            pack_price: rate,
            purchase_price: rate,
            rate: rate,
            total_amount: totalAmount,
            price_per_unit: pricePerUnit,
            pricePerUnit: pricePerUnit
          };
        }
        return item;
      });

      if (modified) {
        const subtotal = updatedItems.reduce((s, i) => s + (parseFloat(i.total_amount) || 0), 0);
        const grandTotal = subtotal;
        await db.collection("purchases").updateOne(
          { id: purchase.id },
          {
            $set: {
              items: updatedItems,
              subtotal: subtotal,
              total_amount: grandTotal,
              grand_total: grandTotal,
              updated_at: new Date().toISOString()
            }
          }
        );
        updatedCount++;
        console.log(`Updated purchase ${purchase.id} (${purchase.purchase_date || purchase.created_at})`);
      }
    }

    console.log(`Fix completed. ${updatedCount} records updated.`);
    await mongoose.disconnect();
  } catch (err) {
    console.error("Migration error:", err);
    process.exit(1);
  }
}

if (require.main === module) {
  fixFebutecPurchase();
}

module.exports = { fixFebutecPurchase };
