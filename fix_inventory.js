const mongoose = require('mongoose');
require('dotenv').config({ path: './backend-node/.env' });

async function fix() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  const res = await db.collection('inventory').updateMany(
    { available_quantity: { $lt: 0 } },
    { $set: { available_quantity: 0 } }
  );
  console.log('Fixed', res.modifiedCount, 'items');
  process.exit(0);
}
fix();
