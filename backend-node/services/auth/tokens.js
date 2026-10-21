// Session tokens.
//
// Access token: short-lived JWT, sent as `Authorization: Bearer`, kept in
// memory by the frontend.
// Refresh token: JWT carrying a random `jti`, set as an httpOnly cookie scoped
// to /api/auth. Every refresh rotates it; presenting an already-rotated token
// (outside a short grace window for parallel tabs) revokes the whole session
// family, which kills a stolen token.
const crypto = require("crypto");
const jwt = require("jsonwebtoken");

const ACCESS_TTL = "15m";
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const FAMILY_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const ROTATION_GRACE_MS = 20 * 1000;
const AUDIENCE = "davadesk-api";
const REFRESH_COOKIE = "dd_refresh";
const LEGACY_COOKIES = ["pharmalogy_token", "pharmalogy_refresh_token"];

const accessSecret = () => process.env.JWT_SECRET;
// A separate secret means an access token can never pass as a refresh token.
const refreshSecret = () =>
  process.env.JWT_REFRESH_SECRET ||
  crypto.createHmac("sha256", process.env.JWT_SECRET).update("davadesk-refresh-v1").digest("hex");

class TokenError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const signAccess = (user) =>
  jwt.sign({ user_id: user.id, token_type: "access", token_version: user.token_version || 0 }, accessSecret(), {
    expiresIn: ACCESS_TTL,
    audience: AUDIENCE,
  });

const verifyAccess = (token) => {
  const decoded = jwt.verify(token, accessSecret(), { audience: AUDIENCE });
  if (decoded.token_type !== "access") throw new jwt.JsonWebTokenError("wrong token type");
  return decoded;
};

const clientInfo = (req) => ({
  ua: String(req.headers["user-agent"] || "").slice(0, 200),
  ip: req.ip,
});

async function issueRefresh(db, user, req, { family = null, familyCreatedAt = null } = {}) {
  const jti = crypto.randomBytes(24).toString("base64url");
  const now = new Date();
  const fam = family || crypto.randomBytes(16).toString("base64url");
  await db.collection("refresh_tokens").insertOne({
    jti,
    family: fam,
    family_created_at: familyCreatedAt || now,
    user_id: user.id,
    token_version: user.token_version || 0,
    created_at: now,
    expires_at: new Date(now.getTime() + REFRESH_TTL_MS),
    revoked_at: null,
    replaced_at: null,
    ...clientInfo(req),
  });
  const token = jwt.sign({ user_id: user.id, jti, token_type: "refresh" }, refreshSecret(), {
    expiresIn: Math.floor(REFRESH_TTL_MS / 1000),
    audience: AUDIENCE,
  });
  return { token, jti, family: fam };
}

// New session: access + refresh in a fresh family.
async function startSession(db, user, req) {
  const refresh = await issueRefresh(db, user, req);
  return { accessToken: signAccess(user), refreshToken: refresh.token };
}

async function revokeFamily(db, family, reason) {
  await db.collection("refresh_tokens").updateMany(
    { family, revoked_at: null },
    { $set: { revoked_at: new Date(), revoke_reason: reason } }
  );
}

async function revokeAllForUser(db, userId, reason) {
  await db.collection("refresh_tokens").updateMany(
    { user_id: userId, revoked_at: null },
    { $set: { revoked_at: new Date(), revoke_reason: reason } }
  );
}

/**
 * Exchange a refresh token for a new access + refresh pair.
 * Throws TokenError on anything suspicious.
 */
async function rotate(db, refreshToken, req) {
  let decoded;
  try {
    decoded = jwt.verify(refreshToken, refreshSecret(), { audience: AUDIENCE });
  } catch (e) {
    throw new TokenError("REFRESH_INVALID", "Session expired. Please sign in again.");
  }
  if (decoded.token_type !== "refresh" || !decoded.jti) {
    throw new TokenError("REFRESH_INVALID", "Session expired. Please sign in again.");
  }

  const col = db.collection("refresh_tokens");
  const record = await col.findOne({ jti: decoded.jti });
  if (!record || record.user_id !== decoded.user_id) {
    throw new TokenError("REFRESH_INVALID", "Session expired. Please sign in again.");
  }
  if (record.revoked_at) {
    throw new TokenError("REFRESH_REVOKED", "Session ended. Please sign in again.");
  }
  if (Date.now() - new Date(record.family_created_at).getTime() > FAMILY_MAX_AGE_MS) {
    await revokeFamily(db, record.family, "family_max_age");
    throw new TokenError("REFRESH_INVALID", "Session expired. Please sign in again.");
  }

  // Already rotated: parallel tabs get a short grace window, anything later
  // means the old token was replayed — revoke the whole family.
  if (record.replaced_at && Date.now() - new Date(record.replaced_at).getTime() > ROTATION_GRACE_MS) {
    await revokeFamily(db, record.family, "refresh_reuse");
    console.warn(`[Auth] Refresh token reuse detected for user ${record.user_id}; session family revoked`);
    throw new TokenError("REFRESH_REUSED", "Session ended for your security. Please sign in again.");
  }

  const user = await db
    .collection("users")
    .findOne({ id: record.user_id }, { projection: { _id: 0, id: 1, token_version: 1, verified: 1 } });
  if (!user || (user.token_version || 0) !== (record.token_version || 0) || user.verified === false) {
    await revokeFamily(db, record.family, "user_invalidated");
    throw new TokenError("REFRESH_REVOKED", "Session ended. Please sign in again.");
  }

  if (!record.replaced_at) {
    await col.updateOne({ jti: record.jti, replaced_at: null }, { $set: { replaced_at: new Date() } });
  }
  const next = await issueRefresh(db, user, req, { family: record.family, familyCreatedAt: record.family_created_at });
  return { accessToken: signAccess(user), refreshToken: next.token, userId: user.id };
}

// Revoke the family of the presented refresh token (single-device logout).
async function revokeByToken(db, refreshToken) {
  try {
    const decoded = jwt.verify(refreshToken, refreshSecret(), { audience: AUDIENCE, ignoreExpiration: true });
    const record = await db.collection("refresh_tokens").findOne({ jti: decoded.jti });
    if (record) await revokeFamily(db, record.family, "logout");
  } catch (e) {
    // Invalid token: nothing to revoke
  }
}

const isSecureRequest = (req) => req.secure || req.headers["x-forwarded-proto"] === "https";

const refreshCookieOptions = (req) => {
  const secure = isSecureRequest(req);
  return {
    httpOnly: true,
    secure,
    // Cross-site frontends (e.g. dev on another domain) need None+Secure
    sameSite: secure ? "none" : "lax",
    path: "/api/auth",
    maxAge: REFRESH_TTL_MS,
  };
};

function setRefreshCookie(req, res, token) {
  res.cookie(REFRESH_COOKIE, token, refreshCookieOptions(req));
  // Drop the old JS-readable cookies from before the redesign
  for (const name of LEGACY_COOKIES) res.clearCookie(name, { path: "/" });
}

function clearRefreshCookie(req, res) {
  const { maxAge, ...opts } = refreshCookieOptions(req);
  res.clearCookie(REFRESH_COOKIE, opts);
  for (const name of LEGACY_COOKIES) res.clearCookie(name, { path: "/" });
}

const parseCookies = (header) => {
  const out = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    try {
      out[k] = decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      out[k] = part.slice(i + 1).trim();
    }
  }
  return out;
};

const readRefreshCookie = (req) => parseCookies(req.headers.cookie)[REFRESH_COOKIE] || null;

module.exports = {
  TokenError,
  signAccess,
  verifyAccess,
  startSession,
  rotate,
  revokeByToken,
  revokeFamily,
  revokeAllForUser,
  setRefreshCookie,
  clearRefreshCookie,
  readRefreshCookie,
  parseCookies,
};
