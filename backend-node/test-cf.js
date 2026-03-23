require("dotenv").config();
const { Cashfree } = require("cashfree-pg");

Cashfree.XClientId = process.env.CASHFREE_APP_ID;
Cashfree.XClientSecret = process.env.CASHFREE_SECRET_KEY;
Cashfree.XEnvironment = Cashfree.Environment.SANDBOX;

async function test() {
  try {
    const request = {
      order_amount: 1,
      order_currency: "INR",
      order_id: "test_" + Date.now(),
      customer_details: {
        customer_id: "cust_123",
        customer_phone: "9999999999"
      }
    };
    const response = await Cashfree.PGCreateOrder("2023-08-01", request); // or depends on version
    console.log("SUCCESS:", response.data);
  } catch (err) {
    console.log("ERROR:", err.response ? err.response.data : err.message);
  }
}
test();
