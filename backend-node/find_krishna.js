const mongoose = require('mongoose');
require('dotenv').config();

const url = process.env.MONGO_URL || 'mongodb+srv://akay101685_db_user:enyGnu7IGvCN2rK2@cluster0.fp3n1as.mongodb.net/pharmalogy-app-db?retryWrites=true&w=majority';
mongoose.connect(url);

async function findKrishna() {
  const db = mongoose.connection;
  await new Promise(r => db.once('open', r));
  console.log("Connected to MongoDB");

  // Search users for Krishna
  const users = await db.collection('users').find({ name: /krishna/i }).toArray();
  console.log("USERS:", JSON.stringify(users, null, 2));

  if (users.length > 0) {
    const pharmacyId = users[0].pharmacy_id;
    console.log("PHARMACY ID:", pharmacyId);

    const suppliersCount = await db.collection('suppliers').countDocuments({ pharmacy_id: pharmacyId });
    const purchasesCount = await db.collection('purchases').countDocuments({ pharmacy_id: pharmacyId });
    const billsCount = await db.collection('bills').countDocuments({ pharmacy_id: pharmacyId });

    console.log(`COUNTS FOR KRISHNA - Suppliers: ${suppliersCount}, Purchases: ${purchasesCount}, Bills: ${billsCount}`);

    const suppliers = await db.collection('suppliers').find({ pharmacy_id: pharmacyId }).toArray();
    console.log("SUPPLIERS:", suppliers.map(s => ({ id: s.id, name: s.name })));

    const purchases = await db.collection('purchases').find({ pharmacy_id: pharmacyId }).toArray();
    console.log("PURCHASES:", JSON.stringify(purchases.slice(0, 3).map(p => ({
      id: p.id,
      supplier_name: p.supplier_name,
      supplier_id: p.supplier_id,
      total_amount: p.total_amount,
      items: p.items
    })), null, 2));
  }

  process.exit(0);
}

findKrishna().catch(err => {
  console.error(err);
  process.exit(1);
});
