const mongoose = require("mongoose");
const { verifyAccess } = require("../services/auth/tokens");
const account = require("../services/account");
const permissions = require("../services/access/permissions");
const policy = require("../services/access/policy");
const sessions = require("../services/auth/sessions");

if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required");
}

// The desktop app runs these routes on the shop computer with its own
// locally signed tokens; sessions, seats and add-ons are checked by the cloud
// when it hands the app its licence and tokens.
const DESKTOP_RUNTIME = process.env.DAVADESK_DESKTOP === "true";

// Secrets and OTP state never leave the users collection via req.user
const USER_PROJECTION = {
  _id: 0,
  password_hash: 0,
  password: 0,
  otp: 0,
  otp_expiry: 0,
  otp_attempts: 0,
  profile_update_otp: 0,
  profile_update_otp_expiry: 0,
  profile_update_otp_attempts: 0,
  lock_setting_otp: 0,
  lock_setting_otp_expiry: 0,
  lock_setting_otp_attempts: 0,
};

// Short in-process cache for lookups that change rarely (add-ons, linked
// pharmacies, desktop devices). Permissions and sessions are read fresh.
const CACHE_MS = 15 * 1000;
const cache = new Map();
async function cached(key, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  const value = await fn();
  cache.set(key, { at: Date.now(), value });
  if (cache.size > 5000) cache.delete(cache.keys().next().value);
  return value;
}
const invalidateAccessCache = (part = "") => {
  for (const k of [...cache.keys()]) if (!part || k.includes(part)) cache.delete(k);
};

const SEAT_TEXT = {
  SEAT_EXPIRED: "Your user licence has expired. Ask the pharmacy owner to renew it from Users.",
  SEAT_REQUIRED: "Your user account doesn't have a licence yet. Ask the pharmacy owner to add one from Users.",
};

// Access tokens are accepted only from the Authorization header (never
// cookies, query strings or bodies), which also rules out CSRF.
const auth = async (req, res, next) => {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : null;
    if (!token) {
      return res.status(401).json({ detail: "Not authenticated" });
    }

    const decoded = verifyAccess(token);
    const db = mongoose.connection.db;

    const user = await db.collection("users").findOne({ id: decoded.user_id }, { projection: USER_PROJECTION });

    if (!user || user.verified === false || user.disabled_at) {
      return res.status(401).json({ detail: "User not found" });
    }

    if ((decoded.token_version || 0) !== (user.token_version || 0)) {
      return res.status(401).json({ detail: "Session expired or invalidated" });
    }

    if (!DESKTOP_RUNTIME) {
      // Two live sessions per user (computer + phone); desktop apps hold their own device sign-in
      if (decoded.kind === "desktop") {
        const live = await cached(`dev:${decoded.did}`, () =>
          db.collection("desktop_devices").findOne({ id: decoded.did, user_id: user.id, revoked_at: null }, { projection: { _id: 0, id: 1 } })
        );
        if (!live) return res.status(401).json({ code: "DEVICE_REVOKED", detail: "This computer was removed from the account." });
      } else if (!decoded.sid || !sessions.liveIds(user).includes(decoded.sid)) {
        return res.status(401).json({ code: "SESSION_ENDED", detail: "Your session has ended. Please sign in again." });
      }

      const seat = await cached(`seat:${user.id}:${user.seat_id || "-"}`, () => account.seatProblem(db, user));
      if (seat) return res.status(403).json({ code: seat, detail: SEAT_TEXT[seat] });
    }

    // The pharmacy this request works in (from the token), checked against
    // what the user may open right now
    const accountId = user.pharmacy_id;
    let pid = decoded.pid || user.last_pharmacy_id || accountId;
    if (!DESKTOP_RUNTIME) {
      const pharmacies = await cached(`acct:${accountId}`, () => account.accountPharmacies(db, accountId));
      const allowed = account.allowedPharmacyIds(user, pharmacies);
      if (!allowed.includes(pid)) {
        if (decoded.pid) return res.status(401).json({ code: "PHARMACY_ACCESS_CHANGED", detail: "Your pharmacy access has changed. Please reload." });
        pid = allowed[0];
        if (!pid) return res.status(403).json({ code: "NO_PHARMACY_ACCESS", detail: "You don't have access to any pharmacy on this account. Ask the owner." });
      }
    } else if (!decoded.pid) {
      pid = accountId;
    }

    req.account_id = accountId;
    req.user = { ...user, home_pharmacy_id: accountId, pharmacy_id: pid };
    req.access = permissions.effective(user);
    req.sessionId = decoded.sid || null;

    const denial = policy.decide(req.access, { method: req.method, baseUrl: req.baseUrl, path: req.path, req });
    if (denial) return res.status(403).json(denial);

    next();
  } catch (error) {
    if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError" || error.name === "NotBeforeError") {
      return res.status(401).json({ detail: "Invalid or expired token" });
    }
    next(error);
  }
};

const adminOnly = (req, res, next) => {
  if (req.user.role !== "ADMIN") {
    return res.status(403).json({ detail: "Admin access required" });
  }
  next();
};

// The account owner only (billing, team, pharmacies)
const ownerOnly = (req, res, next) => {
  if (!req.user.is_primary_admin) {
    return res.status(403).json({ code: "OWNER_ONLY", detail: "Only the pharmacy owner can do this" });
  }
  next();
};

module.exports = { auth, adminOnly, ownerOnly, USER_PROJECTION, invalidateAccessCache, DESKTOP_RUNTIME };
