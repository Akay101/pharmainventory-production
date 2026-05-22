const mongoose = require('mongoose');
require('dotenv').config();

const url = process.env.MONGO_URL || 'mongodb+srv://akay101685_db_user:enyGnu7IGvCN2rK2@cluster0.fp3n1as.mongodb.net/pharmalogy-app-db?retryWrites=true&w=majority';
mongoose.connect(url);

async function test() {
  const db = mongoose.connection;
  await new Promise(r => db.once('open', r));
  console.log("Connected to MongoDB");

  const pharmacyId = '1e8c6e8b-cc66-4357-93cc-3fc25f3e4370';

  // 1. Top Products
  const bills = await db
    .collection("bills")
    .find({ pharmacy_id: pharmacyId })
    .project({ _id: 0, items: 1 })
    .toArray();

  const productSales = {};
  bills.forEach((bill) => {
    (bill.items || []).forEach((item) => {
      const name = item.product_name;
      if (!productSales[name]) {
        productSales[name] = {
          product_name: name,
          quantity: 0,
          revenue: 0,
        };
      }
      productSales[name].quantity += item.quantity;
      productSales[name].revenue +=
        item.item_total || item.quantity * item.unit_price;
    });
  });

  const topProducts = Object.values(productSales)
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 10);

  console.log("TOP PRODUCTS OUTPUT:");
  console.log(JSON.stringify(topProducts, null, 2));

  // 2. Supplier Analysis
  const purchases = await db
    .collection("purchases")
    .find({ pharmacy_id: pharmacyId })
    .project({ _id: 0 })
    .toArray();

  const suppliers = await db
    .collection("suppliers")
    .find({ pharmacy_id: pharmacyId })
    .project({ _id: 0 })
    .toArray();

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

    const totalAmount = (purchase.items || []).reduce((sum, item) => {
      return sum + (item.pack_quantity || 1) * (item.pack_price || 0);
    }, 0);

    supplierStats[supplierId].total_amount += totalAmount;
    supplierStats[supplierId].purchase_count += 1;
    supplierStats[supplierId].total_purchases += (
      purchase.items || []
    ).length;
  });

  const supplierAnalysis = Object.values(supplierStats).sort(
    (a, b) => b.total_amount - a.total_amount
  );

  console.log("SUPPLIER ANALYSIS OUTPUT:");
  console.log(JSON.stringify(supplierAnalysis, null, 2));

  process.exit(0);
}

test().catch(err => {
  console.error(err);
  process.exit(1);
});
