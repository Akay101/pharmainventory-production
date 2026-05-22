const mongoose = require('mongoose');
require('dotenv').config();

const url = process.env.MONGO_URL || 'mongodb+srv://akay101685_db_user:enyGnu7IGvCN2rK2@cluster0.fp3n1as.mongodb.net/pharmalogy-app-db?retryWrites=true&w=majority';
mongoose.connect(url);

async function inspect() {
  const db = mongoose.connection;
  await new Promise(r => db.once('open', r));
  console.log("Connected to MongoDB");

  const purchases = await db.collection('purchases').find({}).toArray();
  console.log(`Total purchases: ${purchases.length}`);

  let zeroTotalAmountDocs = 0;
  let packPriceMissing = 0;
  let itemTotalMissing = 0;

  purchases.forEach((p, idx) => {
    const hasTotalAmount = p.total_amount !== undefined && p.total_amount !== null;
    const items = p.items || [];
    let itemsSumPack = 0;
    let itemsSumPurchase = 0;
    let itemsSumItemTotal = 0;

    items.forEach(item => {
      if (item.pack_price === undefined) packPriceMissing++;
      if (item.item_total === undefined) itemTotalMissing++;
      itemsSumPack += (item.pack_quantity || 1) * (item.pack_price || 0);
      itemsSumPurchase += (item.quantity || 1) * (item.purchase_price || 0);
      itemsSumItemTotal += item.item_total || 0;
    });

    if (idx < 5) {
      console.log(`Doc ${idx}:`);
      console.log(`  id: ${p.id}`);
      console.log(`  supplier_name: ${p.supplier_name}`);
      console.log(`  total_amount: ${p.total_amount}`);
      console.log(`  itemsSumPack: ${itemsSumPack}`);
      console.log(`  itemsSumPurchase: ${itemsSumPurchase}`);
      console.log(`  itemsSumItemTotal: ${itemsSumItemTotal}`);
    }
  });

  console.log(`Pack price missing items: ${packPriceMissing}`);
  console.log(`Item total missing items: ${itemTotalMissing}`);

  process.exit(0);
}

inspect().catch(err => {
  console.error(err);
  process.exit(1);
});
