const crypto = require("crypto");

// Reject webhooks whose timestamp is too far from now (replay protection).
const MAX_SKEW_MS = 5 * 60 * 1000;

// Cashfree signs `timestamp + rawBody` with HMAC-SHA256 using the secret key.
const verifyCashfreeSignature = (rawBody, headers) => {
  const signature = headers["x-webhook-signature"];
  const timestamp = headers["x-webhook-timestamp"];
  if (!signature || !timestamp || !process.env.CASHFREE_SECRET_KEY) return false;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > MAX_SKEW_MS) return false;

  const expected = crypto
    .createHmac("sha256", process.env.CASHFREE_SECRET_KEY)
    .update(timestamp + rawBody)
    .digest("base64");

  const a = Buffer.from(String(signature));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

module.exports = verifyCashfreeSignature;
