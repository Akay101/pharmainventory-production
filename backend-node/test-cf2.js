require("dotenv").config();
const Cashfree = require("cashfree-pg");

async function testV5() {
  console.log("APP_ID:", process.env.CASHFREE_APP_ID?.substring(0, 10));
  console.log("NODE_ENV:", process.env.NODE_ENV);
  
  // Try static initialization
  Cashfree.Cashfree.XClientId = process.env.CASHFREE_APP_ID;
  Cashfree.Cashfree.XClientSecret = process.env.CASHFREE_SECRET_KEY;
  Cashfree.Cashfree.XEnvironment = process.env.NODE_ENV === "production" && !process.env.CASHFREE_APP_ID.startsWith("TEST")
    ? Cashfree.CFEnvironment.PRODUCTION
    : Cashfree.CFEnvironment.SANDBOX;

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
    
    // Some versions required an API version parameter, V5 might not. We test what's used in routes:
    const response = await Cashfree.Cashfree.PGCreateOrder("2023-08-01", request).catch(async () => {
         return await Cashfree.Cashfree.PGCreateOrder(request);
    });
    console.log("STATIC INIT SUCCESS:", response.data);
  } catch (err) {
    console.log("STATIC INIT ERROR:", err.response ? err.response.data : err.message);
  }
}

testV5();
