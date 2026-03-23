require("dotenv").config();
const { Cashfree, CFEnvironment } = require("cashfree-pg");

async function testWorking() {
  Cashfree.XClientId = process.env.CASHFREE_APP_ID;
  Cashfree.XClientSecret = process.env.CASHFREE_SECRET_KEY;
  Cashfree.XEnvironment = CFEnvironment.SANDBOX;

  try {
    const request = {
      order_id: "test_" + Date.now(),
      order_amount: 1,
      order_currency: "INR",
      customer_details: { customer_id: "123", customer_phone: "9999999999" },
      order_meta: { return_url: "http://localhost/test?order_id={order_id}" }
    };
    
    console.log("Testing with static properties and static method...");
    
    // In V5, static method is on Cashfree
    const response = await Cashfree.PGCreateOrder("2023-08-01", request).catch(async () => {
         return await Cashfree.PGCreateOrder(request);
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

testWorking();
