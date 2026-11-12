// Login sessions: one active web session per user.
//
// user_sessions: one row per sign-in (device, browser, IP, location, times,
// how it ended). users.active_session_id names the live one; every access
// token carries its session id (`sid`) and the auth middleware refuses a
// token whose sid isn't the user's live session. So signing in elsewhere, a
// remote sign-out or a password reset ends the old session on its next call.
//
// Signing in while another device holds the session returns a one-time,
// five-minute ticket instead of a session; using it signs the other device
// out and this one in, without asking for the password again.
const crypto = require("crypto");

const SESSIONS = "user_sessions";
const TICKETS = "login_tickets";
const TICKET_TTL_MS = 5 * 60 * 1000;
const SESSION_IDLE_MS = 7 * 24 * 60 * 60 * 1000; // matches the refresh token
const SESSION_MAX_MS = 30 * 24 * 60 * 60 * 1000;
const KEEP_HISTORY_MS = 180 * 24 * 60 * 60 * 1000;

const sha256 = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");

// Browsers send a random id they keep in localStorage. Only its hash is stored.
function deviceKey(req) {
  const raw = String(req.headers["x-device-id"] || "");
  return /^[A-Za-z0-9_-]{16,64}$/.test(raw) ? sha256(`dd-device:${raw}`) : null;
}

function parseUserAgent(ua = "") {
  const s = String(ua);
  const browser =
    (/DavaDesk|Electron/i.test(s) && "DavaDesk app") ||
    (/Edg\//.test(s) && "Edge") ||
    (/OPR\/|Opera/.test(s) && "Opera") ||
    (/SamsungBrowser/.test(s) && "Samsung Internet") ||
    (/Firefox\/|FxiOS/.test(s) && "Firefox") ||
    (/CriOS|Chrome\//.test(s) && "Chrome") ||
    (/Safari\//.test(s) && "Safari") ||
    "Browser";
  const os =
    (/iPhone|iPad|iPod/.test(s) && "iOS") ||
    (/Android/.test(s) && "Android") ||
    (/Windows/.test(s) && "Windows") ||
    (/CrOS/.test(s) && "ChromeOS") ||
    (/Mac OS X|Macintosh/.test(s) && "macOS") ||
    (/Linux/.test(s) && "Linux") ||
    "Unknown OS";
  const type = /iPad|Tablet/.test(s) ? "tablet" : /Mobi|iPhone|Android.+Mobile/.test(s) ? "mobile" : "desktop";
  return { browser, os, type, label: `${browser} on ${os}` };
}

const TZ_COUNTRY = { "Asia/Kolkata": "India", "Asia/Calcutta": "India", "Asia/Dubai": "UAE", "Asia/Kathmandu": "Nepal", "Asia/Dhaka": "Bangladesh", "Asia/Colombo": "Sri Lanka" };

// Location from the edge/proxy when it provides one, else from the
// browser's time zone. No IP is sent to any outside service.
function locate(req) {
  const h = req.headers;
  const city = h["cf-ipcity"] || h["cloudfront-viewer-city"] || h["x-geo-city"] || null;
  const region = h["cloudfront-viewer-country-region-name"] || h["cf-region"] || h["x-geo-region"] || null;
  const country = h["cf-ipcountry"] || h["cloudfront-viewer-country"] || h["x-geo-country"] || null;
  const tz = String(h["x-client-timezone"] || "").slice(0, 64);
  const tzOk = /^[A-Za-z_]+\/[A-Za-z_\-/]+$/.test(tz) ? tz : null;
  const clean = (v) => (v ? String(v).replace(/[^\p{L}\p{N} .,'-]/gu, "").slice(0, 60) : null);
  const out = { city: clean(city), region: clean(region), country: clean(country) || (tzOk && TZ_COUNTRY[tzOk]) || null, timezone: tzOk };
  out.label = [out.city, out.region, out.country].filter(Boolean).join(", ") || (tzOk ? tzOk.replace(/_/g, " ") : null);
  return out;
}

const clientIp = (req) => String(req.ip || "").replace(/^::ffff:/, "").slice(0, 64);

const isLive = (s, now = new Date()) => !!s && !s.ended_at && new Date(s.expires_at) > now;

async function activeSession(db, user) {
  if (!user?.active_session_id) return null;
  const s = await db.collection(SESSIONS).findOne({ id: user.active_session_id, user_id: user.id });
  return isLive(s) ? s : null;
}

const publicSession = (s, currentId = null) =>
  s && {
    id: s.id,
    current: !!currentId && s.id === currentId,
    device: s.device?.label || "Unknown device",
    browser: s.device?.browser || null,
    os: s.device?.os || null,
    type: s.device?.type || "desktop",
    ip: s.ip || null,
    location: s.location?.label || null,
    started_at: s.created_at,
    last_active_at: s.last_seen_at || s.created_at,
    ended_at: s.ended_at || null,
    end_reason: s.end_reason || null,
    active: isLive(s),
  };

// Can this request sign in straight away, or does another device hold the session?
async function loginDecision(db, user, req) {
  const live = await activeSession(db, user);
  if (!live) return { conflict: false };
  const key = deviceKey(req);
  // Same browser signing in again: just replace its old session
  if (key && live.device_key === key) return { conflict: false, replaces: live.id };
  return { conflict: true, session: live };
}

async function issueTicket(db, user, req) {
  const token = crypto.randomBytes(32).toString("base64url");
  const now = new Date();
  await db.collection(TICKETS).insertOne({
    hash: sha256(token),
    user_id: user.id,
    token_version: user.token_version || 0,
    device_key: deviceKey(req),
    ip: clientIp(req),
    created_at: now,
    expires_at: new Date(now.getTime() + TICKET_TTL_MS),
    used_at: null,
  });
  return token;
}

// Single use, same browser, five minutes
async function consumeTicket(db, token, req) {
  if (typeof token !== "string" || token.length < 20 || token.length > 100) return null;
  const now = new Date();
  const t = await db.collection(TICKETS).findOneAndUpdate(
    { hash: sha256(token), used_at: null, expires_at: { $gt: now } },
    { $set: { used_at: now, used_ip: clientIp(req) } },
    { returnDocument: "before" }
  );
  if (!t) return null;
  if (t.device_key && t.device_key !== deviceKey(req)) return null;
  return t;
}

/**
 * Open a session for a user and make it the live one. Any other open session
 * of the user is ended (its refresh tokens revoked).
 */
async function create(db, user, req, { family, pharmacyId, platform = "web" }) {
  const now = new Date();
  const id = crypto.randomBytes(18).toString("base64url");
  const row = {
    id,
    user_id: user.id,
    account_id: user.pharmacy_id,
    family,
    platform,
    device_key: deviceKey(req),
    device: parseUserAgent(req.headers["user-agent"]),
    ua: String(req.headers["user-agent"] || "").slice(0, 300),
    ip: clientIp(req),
    location: locate(req),
    active_pharmacy_id: pharmacyId,
    created_at: now,
    last_seen_at: now,
    expires_at: new Date(now.getTime() + SESSION_IDLE_MS),
    max_until: new Date(now.getTime() + SESSION_MAX_MS),
    ended_at: null,
    end_reason: null,
    purge_at: new Date(now.getTime() + KEEP_HISTORY_MS),
  };
  await db.collection(SESSIONS).insertOne(row);
  await db.collection("users").updateOne({ id: user.id }, { $set: { active_session_id: id, last_pharmacy_id: pharmacyId, last_login_at: now.toISOString() } });
  await endOthers(db, user.id, id, "REPLACED");
  return row;
}

async function revokeFamilies(db, families, reason) {
  if (!families.length) return;
  await db.collection("refresh_tokens").updateMany({ family: { $in: families }, revoked_at: null }, { $set: { revoked_at: new Date(), revoke_reason: reason } });
}

async function endOthers(db, userId, keepId, reason) {
  const open = await db.collection(SESSIONS).find({ user_id: userId, ended_at: null, id: { $ne: keepId } }, { projection: { id: 1, family: 1 } }).toArray();
  if (!open.length) return 0;
  await db.collection(SESSIONS).updateMany({ id: { $in: open.map((s) => s.id) }, ended_at: null }, { $set: { ended_at: new Date(), end_reason: reason } });
  await revokeFamilies(db, open.map((s) => s.family).filter(Boolean), `session_${reason.toLowerCase()}`);
  return open.length;
}

// End one session (sign-out, remote sign-out, admin)
async function end(db, sessionId, reason, by = null) {
  const s = await db.collection(SESSIONS).findOneAndUpdate(
    { id: sessionId, ended_at: null },
    { $set: { ended_at: new Date(), end_reason: reason, ended_by: by } },
    { returnDocument: "after" }
  );
  if (!s) return null;
  await revokeFamilies(db, [s.family].filter(Boolean), `session_${reason.toLowerCase()}`);
  await db.collection("users").updateOne({ id: s.user_id, active_session_id: s.id }, { $unset: { active_session_id: "" } });
  return s;
}

async function endAllForUser(db, userId, reason) {
  await endOthers(db, userId, null, reason);
  await db.collection("users").updateOne({ id: userId }, { $unset: { active_session_id: "" } });
}

const byFamily = (db, family) => db.collection(SESSIONS).findOne({ family });

// On each token refresh: still live? Slide its idle expiry.
async function touch(db, session, req) {
  const now = new Date();
  const expires = new Date(Math.min(now.getTime() + SESSION_IDLE_MS, new Date(session.max_until || now.getTime() + SESSION_IDLE_MS).getTime()));
  await db.collection(SESSIONS).updateOne({ id: session.id, ended_at: null }, { $set: { last_seen_at: now, expires_at: expires, ip: clientIp(req) } });
}

async function setActivePharmacy(db, sessionId, pharmacyId, userId) {
  await db.collection(SESSIONS).updateOne({ id: sessionId, ended_at: null }, { $set: { active_pharmacy_id: pharmacyId } });
  await db.collection("users").updateOne({ id: userId }, { $set: { last_pharmacy_id: pharmacyId } });
}

async function history(db, userIds, { limit = 30 } = {}) {
  return db.collection(SESSIONS).find({ user_id: { $in: userIds } }, { projection: { _id: 0, family: 0, device_key: 0 } }).sort({ created_at: -1 }).limit(limit).toArray();
}

module.exports = {
  SESSIONS,
  TICKETS,
  deviceKey,
  parseUserAgent,
  locate,
  isLive,
  activeSession,
  publicSession,
  loginDecision,
  issueTicket,
  consumeTicket,
  create,
  end,
  endOthers,
  endAllForUser,
  byFamily,
  touch,
  setActivePharmacy,
  history,
};
