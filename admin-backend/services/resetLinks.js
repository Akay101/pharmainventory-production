// Password reset links an admin sends to a user (email and/or WhatsApp).
// The main API checks and uses them (backend-node/services/auth/resetLinks.js);
// both sides hash the token the same way.
//
// Only sha256(token) is stored. The plain link is returned once, to the admin
// who made it, so they can copy it or open WhatsApp with it. Issuing a new
// link revokes the user's older ones.
const crypto = require("crypto");

const COLLECTION = "password_reset_links";
const MIN_MINUTES = 15;
const MAX_MINUTES = 7 * 24 * 60;

const hashToken = (token) => crypto.createHash("sha256").update(String(token)).digest("hex");
const newToken = () => crypto.randomBytes(32).toString("base64url"); // 43 chars

// The app the link opens, per environment
const appUrl = (env) =>
  (env === "prod"
    ? process.env.APP_URL_PROD || process.env.OFFER_APP_URL_PROD || "https://store.davadesk.in"
    : process.env.APP_URL_DEV || process.env.OFFER_APP_URL_DEV || "https://store-dev.davadesk.in"
  ).replace(/\/+$/, "");

// Token in the fragment: browsers never send it to a server or in Referer
const linkFor = (env, token) => `${appUrl(env)}/reset-password/link#${token}`;

async function ensureIndexes(db) {
  await Promise.all([
    db.collection(COLLECTION).createIndex({ token_hash: 1 }, { unique: true, name: "token_hash" }),
    db.collection(COLLECTION).createIndex({ user_id: 1, created_at: -1 }, { name: "user_created" }),
    // Old links go 90 days after they stop working
    db.collection(COLLECTION).createIndex({ purge_at: 1 }, { expireAfterSeconds: 0, name: "purge_at" }),
  ]);
}

function statusOf(l, now = new Date()) {
  if (l.used_at) return "USED";
  if (l.revoked_at) return "REVOKED";
  if (l.expires_at <= now) return "EXPIRED";
  return "ACTIVE";
}

const view = (l) => ({
  id: l.id,
  status: statusOf(l),
  created_at: l.created_at,
  expires_at: l.expires_at,
  created_by: l.created_by,
  channels: l.channels || {},
  opened_at: l.opened_at || null,
  used_at: l.used_at || null,
  revoked_at: l.revoked_at || null,
  revoked_reason: l.revoked_reason || null,
});

async function issue(db, { user, env, expiresAt, actor }) {
  const now = new Date();
  await db
    .collection(COLLECTION)
    .updateMany({ user_id: user.id, used_at: null, revoked_at: null }, { $set: { revoked_at: now, revoked_reason: "REPLACED" } });
  const token = newToken();
  const doc = {
    id: crypto.randomUUID(),
    token_hash: hashToken(token),
    user_id: user.id,
    email: String(user.email || "").toLowerCase(),
    pharmacy_id: user.pharmacy_id || null,
    env,
    created_by: actor,
    created_at: now,
    expires_at: expiresAt,
    purge_at: new Date(expiresAt.getTime() + 90 * 864e5),
    used_at: null,
    revoked_at: null,
    opened_at: null,
    channels: {},
  };
  await db.collection(COLLECTION).insertOne(doc);
  return { doc, url: linkFor(env, token) };
}

// "91XXXXXXXXXX" for wa.me, or null
function waNumber(raw) {
  let d = String(raw || "").replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? `91${d}` : null;
}

const until = (d) => new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

function messageText({ name, url, expiresAt }) {
  return [
    `Hi ${String(name || "").split(" ")[0] || "there"},`,
    "",
    "Here is your link to set a new DavaDesk password. Open it and choose a new password; no code is needed.",
    "",
    url,
    "",
    `The link works once and expires on ${until(expiresAt)} (IST). Don't share it with anyone. If you didn't ask for this, ignore this message; your password stays the same.`,
    "",
    "Team DavaDesk",
  ].join("\n");
}

const whatsappUrl = (mobile, text) => {
  const n = waNumber(mobile);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : null;
};

module.exports = { COLLECTION, MIN_MINUTES, MAX_MINUTES, ensureIndexes, issue, view, statusOf, messageText, whatsappUrl, hashToken };
