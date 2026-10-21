// Thin Cashfree PG client (cashfree-pg v5, API version pinned by the SDK).
const CashfreePG = require("cashfree-pg");

let client = null;

// Sandbox keys are prefixed "TEST"; anything else is a live key.
const mode = () => ((process.env.CASHFREE_APP_ID || "").startsWith("TEST") ? "sandbox" : "production");

function getClient() {
  if (client) return client;
  const appId = process.env.CASHFREE_APP_ID;
  const secret = process.env.CASHFREE_SECRET_KEY;
  if (!appId || !secret) throw new Error("Cashfree is not configured (CASHFREE_APP_ID / CASHFREE_SECRET_KEY)");
  const env = mode() === "sandbox" ? CashfreePG.CFEnvironment.SANDBOX : CashfreePG.CFEnvironment.PRODUCTION;
  client = new CashfreePG.Cashfree(env, appId, secret);
  return client;
}

async function createOrder({ orderId, amountPaise, customer, returnUrl, notifyUrl, tags, expiresAt }) {
  const request = {
    order_id: orderId,
    order_amount: Number((amountPaise / 100).toFixed(2)),
    order_currency: "INR",
    customer_details: customer,
    order_meta: { return_url: returnUrl, ...(notifyUrl ? { notify_url: notifyUrl } : {}) },
    order_tags: tags,
    order_expiry_time: expiresAt.toISOString(),
  };
  // Idempotency key = our order id, so a retried request never creates two orders
  const res = await getClient().PGCreateOrder(request, undefined, orderId);
  return res.data;
}

async function fetchOrder(orderId) {
  return (await getClient().PGFetchOrder(orderId)).data;
}

async function fetchPayments(orderId) {
  return (await getClient().PGOrderFetchPayments(orderId)).data || [];
}

module.exports = { mode, createOrder, fetchOrder, fetchPayments };
