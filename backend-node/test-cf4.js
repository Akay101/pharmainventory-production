require("dotenv").config();
const { Cashfree, CFEnvironment } = require("cashfree-pg");

Cashfree.XClientId = process.env.CASHFREE_APP_ID;
Cashfree.XClientSecret = process.env.CASHFREE_SECRET_KEY;
Cashfree.XEnvironment = process.env.NODE_ENV === "production" && !process.env.CASHFREE_APP_ID.startsWith("TEST") 
  ? CFEnvironment.PRODUCTION 
  : CFEnvironment.SANDBOX;

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
    const response = await Cashfree.PGCreateOrder("2023-08-01", request).catch(async (e) => {
         if(e.message && e.message.includes("version")) throw e;
         return await Cashfree.PGCreateOrder(request);
    });
    console.log("SUCCESS:", response.data.order_id);
  } catch (err) {
    console.log("ERROR STATUS:", err.response ? err.response.status : err.message);
    if(err.response) {
      console.log("RESPONSE DATA:", err.response.data);
    }
  }
}

testStatic();
