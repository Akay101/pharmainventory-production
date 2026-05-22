const mongoose = require('mongoose');
require('dotenv').config();

const url = process.env.MONGO_URL || 'mongodb+srv://akay101685_db_user:enyGnu7IGvCN2rK2@cluster0.fp3n1as.mongodb.net/pharmalogy-app-db?retryWrites=true&w=majority';
mongoose.connect(url);

async function inspect() {
  const db = mongoose.connection;
  await new Promise(r => db.once('open', r));
  console.log("Connected to MongoDB");

  const krishna = await db.collection('users').findOne({ name: /krishna/i });
  console.log("KRISHNA USER:", krishna);

  if (krishna) {
    const pharmacyId = krishna.pharmacy_id;
    console.log("PHARMACY ID:", pharmacyId);

    // Get all purchases for this pharmacy
    const purchases = await db.collection('purchases').find({ pharmacy_id: pharmacyId }).toArray();
    console.log("PURCHASES COUNT:", purchases.length);
    console.log("SAMPLE PURCHASES:", JSON.stringify(purchases.slice(0, 3), null, 2));

    // Let's run the logic of supplier-analysis manually to see what it produces
    const suppliers = await db.collection('suppliers').find({ pharmacy_id: pharmacyId }).toArray();
    console.log("SUPPLIERS COUNT:", suppliers.length);

    const supplierStats = {};
    purchases.forEach((purchase) => {
      const supplierId = purchase.supplier_id;
      if (!supplierStats[supplierId]) {
        const supplier = suppliers.find((s) => s.id === supplierId);
        supplierStats[supplierId] = {
          id: supplierId,
          name: supplier?.name || purchase.supplier_name || "Unknown",
          total_purchases: 0,
          total_amount: 0,
          purchase_count: 0,
        };
      }

      const totalAmount = typeof purchase.total_amount === "number" && purchase.total_amount > 0
        ? purchase.total_amount
        : (purchase.items || []).reduce((sum, item) => {
            const itemTotal = item.item_total || (item.pack_quantity || item.quantity || 1) * (item.pack_price || item.purchase_price || 0);
            return sum + (itemTotal || 0);
          }, 0);

      supplierStats[supplierId].total_amount += totalAmount;
      supplierStats[supplierId].purchase_count += 1;
      supplierStats[supplierId].total_purchases += (purchase.items || []).length;
    });

    console.log("MANUAL SUPPLIER STATS:", JSON.stringify(Object.values(supplierStats), null, 2));
  }

  process.exit(0);
}

inspect().catch(err => {
  console.error(err);
  process.exit(1);
});
