const mongoose = require('mongoose');
mongoose.connect('mongodb+srv://akay101685_db_user:enyGnu7IGvCN2rK2@cluster0.fp3n1as.mongodb.net/pharmalogy-app-db?retryWrites=true&w=majority');
async function test() {
  const db = mongoose.connection;
  await new Promise(r => db.once('open', r));
  
  const sumitCustomer = await db.collection('customers').findOne({name: 'sumit', mobile: '89028272928'});
  
  if (!sumitCustomer) {
      console.log('sumit customer not found');
  } else {
      console.log("sumit ID:", sumitCustomer.id);
      
      const bills = await db.collection('bills').find({ customer_id: sumitCustomer.id }).project({_id:0, bill_no:1, customer_name:1, customer_id:1}).limit(20).toArray();
      console.log("BILLS WITH SUMIT ID:");
      console.log(bills);
  }

  process.exit(0);
}
test();
