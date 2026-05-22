const mongoose = require('mongoose');
require('dotenv').config();

const url = process.env.MONGO_URL || 'mongodb+srv://akay101685_db_user:enyGnu7IGvCN2rK2@cluster0.fp3n1as.mongodb.net/pharmalogy-app-db?retryWrites=true&w=majority';
mongoose.connect(url);

async function inspect() {
  const db = mongoose.connection;
  await new Promise(r => db.once('open', r));
  console.log("Connected to MongoDB");

  // Get test user
  const user = await db.collection('users').findOne({ email: 'test@pharmalogy.com' });
  console.log("TEST USER:", user);
  if (!user) {
    const anyUser = await db.collection('users').findOne({});
    console.log("ANY USER:", anyUser);
  }

  const pharmacyId = user ? user.pharmacy_id : null;
  console.log("PHARMACY ID:", pharmacyId);

  // Check counts
  const userCount = await db.collection('users').countDocuments({});
  const billCount = await db.collection('bills').countDocuments({});
  const purchaseCount = await db.collection('purchases').countDocuments({});
  const supplierCount = await db.collection('suppliers').countDocuments({});
  const inventoryCount = await db.collection('inventory').countDocuments({});
  
  console.log(`COUNTS - Users: ${userCount}, Bills: ${billCount}, Purchases: ${purchaseCount}, Suppliers: ${supplierCount}, Inventory: ${inventoryCount}`);

  if (pharmacyId) {
    const billsWithPharmacy = await db.collection('bills').countDocuments({ pharmacy_id: pharmacyId });
    const purchasesWithPharmacy = await db.collection('purchases').countDocuments({ pharmacy_id: pharmacyId });
    const suppliersWithPharmacy = await db.collection('suppliers').countDocuments({ pharmacy_id: pharmacyId });
    console.log(`COUNTS WITH PHARMACY ID ${pharmacyId} - Bills: ${billsWithPharmacy}, Purchases: ${purchasesWithPharmacy}, Suppliers: ${suppliersWithPharmacy}`);
    
    const sampleBills = await db.collection('bills').find({ pharmacy_id: pharmacyId }).limit(1).toArray();
    console.log("SAMPLE BILL:", JSON.stringify(sampleBills, null, 2));

    const samplePurchases = await db.collection('purchases').find({ pharmacy_id: pharmacyId }).limit(1).toArray();
    console.log("SAMPLE PURCHASE:", JSON.stringify(samplePurchases, null, 2));

    const sampleSuppliers = await db.collection('suppliers').find({ pharmacy_id: pharmacyId }).limit(2).toArray();
    console.log("SAMPLE SUPPLIERS:", JSON.stringify(sampleSuppliers, null, 2));
  }

  process.exit(0);
}

inspect().catch(err => {
  console.error(err);
  process.exit(1);
});
