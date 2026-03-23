require("dotenv").config();
const { Cashfree } = require("cashfree-pg");

Cashfree.XClientId = process.env.CASHFREE_APP_ID;
Cashfree.XClientSecret = process.env.CASHFREE_SECRET_KEY;
Cashfree.XEnvironment = Cashfree.CFEnvironment.SANDBOX; // using SANDBOX for TEST keys

async function testStatic() {
  try {
    const request = {
      order_id: "test_" + Date.now(),
      order_amount: 1,
      order_currency: "INR",
      customer_details: {
        customer_id: "cust_123",
        customer_phone: "9999999999"
      }
    };
    
    // Testing PGCreateOrder with just request argument
    const response = await Cashfree.PGCreateOrder("2023-08-01", request).catch(async () => {
         return await Cashfree.PGCreateOrder(request);
    });
    console.log("SUCCESS:", response.data);
  } catch (err) {
    console.log("ERROR STATUS:", err.response ? err.response.status : err.message);
    if(err.response) {
      console.log("RESPONSE DATA:", err.response.data);
    }
  }
}

testStatic();
