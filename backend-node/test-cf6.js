const Cashfree = require("cashfree-pg");
const cashfree = new Cashfree.Cashfree({
  clientId: "TEST_ID",
  clientSecret: "TEST_SECRET",
  environment: Cashfree.CFEnvironment.SANDBOX
});
console.log(cashfree);
console.log("XClientId from instance:", cashfree.XClientId);
console.log("XClientId from class:", Cashfree.Cashfree.XClientId);
