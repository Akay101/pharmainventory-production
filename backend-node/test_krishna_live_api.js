const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const axios = require('axios');
require('dotenv').config();

const url = process.env.MONGO_URL || 'mongodb+srv://akay101685_db_user:enyGnu7IGvCN2rK2@cluster0.fp3n1as.mongodb.net/pharmalogy-app-db?retryWrites=true&w=majority';
mongoose.connect(url);

const JWT_SECRET = process.env.JWT_SECRET;

async function test() {
  const db = mongoose.connection;
  await new Promise(r => db.once('open', r));
  console.log("Connected to MongoDB");

  const krishna = await db.collection('users').findOne({ name: /krishna/i });
  if (!krishna) {
    console.error("Krishna user not found!");
    process.exit(1);
  }
  console.log("Krishna user found:", krishna.name, krishna.email);

  const token = jwt.sign({ user_id: krishna.id }, JWT_SECRET, { expiresIn: '7d' });
  const config = {
    headers: { Authorization: `Bearer ${token}` }
  };

  try {
    console.log("\nCalling /api/dashboard/supplier-analysis...");
    const supplierRes = await axios.get('http://localhost:8001/api/dashboard/supplier-analysis', config);
    console.log("SUPPLIER ANALYSIS RESP (first 3):");
    console.log(JSON.stringify(supplierRes.data.supplier_analysis.slice(0, 5), null, 2));

    console.log("\nCalling /api/dashboard/top-products...");
    const productsRes = await axios.get('http://localhost:8001/api/dashboard/top-products?limit=10', config);
    console.log("TOP PRODUCTS RESP (first 3):");
    console.log(JSON.stringify(productsRes.data.top_products.slice(0, 5), null, 2));
  } catch (err) {
    console.error("Error during API request:", err.response?.data || err.message);
  }

  process.exit(0);
}

test().catch(err => {
  console.error(err);
  process.exit(1);
});
