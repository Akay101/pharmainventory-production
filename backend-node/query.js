const mongoose = require('mongoose');
mongoose.connect('mongodb+srv://akay101685_db_user:enyGnu7IGvCN2rK2@cluster0.fp3n1as.mongodb.net/pharmalogy-app-db?retryWrites=true&w=majority');
async function test() {
  const db = mongoose.connection;
  await new Promise(r => db.once('open', r));
  
  const bills = await db.collection('bills').find({}).project({_id:0, bill_no:1, customer_name:1, customer_id:1}).limit(20).toArray();
  const customers = await db.collection('customers').find({}).project({_id:0, name:1, id:1}).toArray();
  
  console.log("CUSTOMERS:", customers);
  console.log("BILLS:", bills);
  process.exit(0);
}
test();
