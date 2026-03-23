const crypto = require("crypto");

const verifyCashfreeSignature = (rawBody, headers) => {
  const signature = headers["x-webhook-signature"];
  const timestamp = headers["x-webhook-timestamp"];

  if (!signature || !timestamp) return false;

  const signedPayload = timestamp + rawBody;

  const expectedSignature = crypto
    .createHmac("sha256", process.env.CASHFREE_SECRET_KEY)
    .update(signedPayload)
    .digest("base64");

  return signature === expectedSignature;
};

module.exports = verifyCashfreeSignature;
