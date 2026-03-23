const Cashfree = require("cashfree-pg");

const env = process.env.NODE_ENV === "production" && !process.env.CASHFREE_APP_ID.startsWith("TEST")
  ? Cashfree.CFEnvironment.PRODUCTION
  : Cashfree.CFEnvironment.SANDBOX;

const cashfree = new Cashfree.Cashfree(
  env,
  process.env.CASHFREE_APP_ID,
  process.env.CASHFREE_SECRET_KEY
);

module.exports = cashfree;
