const mongoose = require('mongoose');
require('dotenv').config();

const url = process.env.MONGO_URL || 'mongodb+srv://akay101685_db_user:enyGnu7IGvCN2rK2@cluster0.fp3n1as.mongodb.net/pharmalogy-app-db?retryWrites=true&w=majority';
mongoose.connect(url);

async function inspect() {
  const db = mongoose.connection;
  await new Promise(r => db.once('open', r));
  console.log("Connected to MongoDB");

  const pharmacyId = '1e8c6e8b-cc66-4357-93cc-3fc25f3e4370';

  const bills = await db.collection('bills').find({ pharmacy_id: pharmacyId }).toArray();
  console.log(`BILLS for ${pharmacyId}:`, JSON.stringify(bills, null, 2));

  const purchases = await db.collection('purchases').find({ pharmacy_id: pharmacyId }).toArray();
  console.log(`PURCHASES for ${pharmacyId}:`, JSON.stringify(purchases, null, 2));

  const suppliers = await db.collection('suppliers').find({ pharmacy_id: pharmacyId }).toArray();
  console.log(`SUPPLIERS for ${pharmacyId}:`, JSON.stringify(suppliers, null, 2));

  process.exit(0);
}

inspect().catch(err => {
  console.error(err);
  process.exit(1);
});
