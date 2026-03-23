require("dotenv").config();
const cashfree = require("./services/cashfree");

async function verify() {
  try {
    const request = {
      order_id: "test_" + Date.now(),
      order_amount: 1,
      order_currency: "INR",
      customer_details: { customer_id: "123", customer_phone: "9999999999" }
    };
    
    // Testing PGCreateOrder
    const response = await cashfree.PGCreateOrder("2023-08-01", request).catch(async (e) => {
         // Some versions might not require api_version as string
         return await cashfree.PGCreateOrder(request);
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

verify();
