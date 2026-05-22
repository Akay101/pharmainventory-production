const axios = require('axios');

async function test() {
  try {
    console.log("Logging in...");
    const loginRes = await axios.post('http://localhost:8001/api/auth/login', {
      email: 'test@pharmalogy.com',
      password: 'test123456'
    });

    const token = loginRes.data.token;
    console.log("Token obtained successfully.");

    const config = {
      headers: { Authorization: `Bearer ${token}` }
    };

    console.log("\nCalling /api/dashboard/supplier-analysis...");
    const supplierRes = await axios.get('http://localhost:8001/api/dashboard/supplier-analysis', config);
    console.log("SUPPLIER ANALYSIS RESP:");
    console.log(JSON.stringify(supplierRes.data, null, 2));

    console.log("\nCalling /api/dashboard/top-products...");
    const productsRes = await axios.get('http://localhost:8001/api/dashboard/top-products', config);
    console.log("TOP PRODUCTS RESP:");
    console.log(JSON.stringify(productsRes.data, null, 2));

  } catch (error) {
    console.error("Error during API request:", error.response?.data || error.message);
  }
}

test();
