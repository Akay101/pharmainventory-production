// Signed licences for the desktop app. The private key stays on this server; the
// app holds only the public key, so it can check a licence but never make one.
const crypto = require("crypto");

const DAY_MS = 24 * 60 * 60 * 1000;
const OFFLINE_DAYS_PAID = 30;
const OFFLINE_DAYS_TRIAL = 3;

const privateKey = () => {
  const b64 = process.env.DESKTOP_LICENCE_PRIVATE_KEY;
  if (!b64) throw Object.assign(new Error("Desktop licences aren't set up on this server"), { status: 503 });
  return crypto.createPrivateKey(Buffer.from(b64, "base64").toString("utf8"));
};

// How long the app may run before it must reach this server again
function issue({ device, user, subscription, now = new Date() }) {
  const days = subscription.kind === "TRIAL" ? OFFLINE_DAYS_TRIAL : OFFLINE_DAYS_PAID;
  const offlineLimit = now.getTime() + days * DAY_MS;
  const subscriptionEnd = new Date(subscription.ends_at).getTime();
  const payload = {
    v: 1,
    device_id: device.id,
    pharmacy_id: device.pharmacy_id,
    user_id: user.id,
    plan: subscription.plan,
    kind: subscription.kind || null,
    issued_at: now.getTime(),
    valid_until: Math.min(offlineLimit, subscriptionEnd),
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.sign(null, Buffer.from(body), privateKey()).toString("base64url");
  return `${body}.${signature}`;
}

module.exports = { issue };
