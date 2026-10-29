// Password reset links issued by an admin (admin panel > All Users > user).
//
// The admin backend creates the link; only sha256(token) is stored, in
// `password_reset_links` of the environment's database. A link is for one
// user, works once, stops at the expiry the admin picked, and is void if it
// was revoked, replaced by a newer link, or the password changed after it was
// issued. The token sits in the URL fragment (#...), so it never reaches
// server logs or Referer headers; the page sends it in a POST body.
const crypto = require("crypto");

const COLLECTION = "password_reset_links";
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/; // 32 random bytes, base64url

const hashToken = (token) => crypto.createHash("sha256").update(String(token)).digest("hex");

class LinkError extends Error {
  constructor() {
    // One message for every failure: callers can't tell expired from unknown
    super("This link is invalid or has expired. Ask DavaDesk support for a new one, or use Forgot password.");
    this.status = 410;
    this.code = "RESET_LINK_INVALID";
  }
}

const liveFilter = (token, now = new Date()) => ({ token_hash: hashToken(token), used_at: null, revoked_at: null, expires_at: { $gt: now } });

// The link and its user, if the link can still be used
async function findUsable(db, token) {
  if (!TOKEN_RE.test(String(token || ""))) throw new LinkError();
  const link = await db.collection(COLLECTION).findOne(liveFilter(token));
  if (!link) throw new LinkError();
  const user = await db.collection("users").findOne({ id: link.user_id }, { projection: { _id: 0, id: 1, name: 1, email: 1, verified: 1, password_changed_at: 1 } });
  if (!user || user.verified === false || String(user.email || "").toLowerCase() !== link.email) throw new LinkError();
  // Password already changed since the link went out (by the user or another link)
  if (user.password_changed_at && new Date(user.password_changed_at) > link.created_at) throw new LinkError();
  return { link, user };
}

// Claims the link for this use. Only one request can win; a second gets null.
async function claim(db, token, meta) {
  const now = new Date();
  return db.collection(COLLECTION).findOneAndUpdate(liveFilter(token, now), { $set: { used_at: now, used_ip: meta.ip || null, used_ua: String(meta.ua || "").slice(0, 300) } }, { returnDocument: "after" });
}

const maskEmail = (email) => {
  const [local, domain] = String(email || "").split("@");
  if (!domain) return "";
  const keep = local.length <= 2 ? local.slice(0, 1) : local.slice(0, 2);
  return `${keep}${"•".repeat(Math.max(2, Math.min(6, local.length - keep.length)))}@${domain}`;
};

module.exports = { COLLECTION, hashToken, findUsable, claim, maskEmail, LinkError };
