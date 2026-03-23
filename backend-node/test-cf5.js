require("dotenv").config();
const { Cashfree, CFEnvironment } = require("cashfree-pg");

async function testStaticAndInstance() {
  Cashfree.XClientId = process.env.CASHFREE_APP_ID;
  Cashfree.XClientSecret = process.env.CASHFREE_SECRET_KEY;
  // Use SANDBOX to match the TEST keys!
  Cashfree.XEnvironment = CFEnvironment.SANDBOX;

  try {
    const request = {
      order_id: "test_" + Date.now(),
      order_amount: 1,
      order_currency: "INR",
      customer_details: { customer_id: "123", customer_phone: "9999999999" }
    };
    
    console.log("Testing with static setup and static method call...");
    // Let's try to instantiate it like cashfree.js does, but call it.
    const instance = new Cashfree();
    const response = await instance.PGCreateOrder("2023-08-01", request).catch(async () => {
         return await instance.PGCreateOrder(request);
    });
    console.log("SUCCESS:", response.data.order_id);
  } catch (err) {
    if (err.response) {
      console.log("ERROR STATUS:", err.response.status, err.response.data);
    } else {
      console.log("ERROR:", err.message);
    }
  }
}

testStaticAndInstance();
