// Login sessions: two per user, one on a computer and one on a phone.
//
// user_sessions: one row per sign-in (device, browser, IP, location, times,
// how it ended, slot). users.active_sessions = { pc, mobile } names the live
// one in each slot; every access token carries its session id (`sid`) and
// the auth middleware refuses a token whose sid isn't one of them. So
// signing in on another device of the same kind, a remote sign-out or a
// password reset ends the old session on its next call.
//
// Which slot a device takes is decided by services/auth/deviceProof.js
// (a key the browser can't export, plus signals that must agree).
//
// Signing in while another device holds that slot returns a one-time,
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

const { SLOTS } = require("./deviceProof");

// Live session ids of a user, by slot. A sign-in from before slots counts as
// the computer one.
function liveSlots(user) {
  const a = user?.active_sessions || {};
  const out = {};
  if (a.pc) out.pc = a.pc;
  else if (user?.active_session_id) out.pc = user.active_session_id;
  if (a.mobile) out.mobile = a.mobile;
  return out;
}
const liveIds = (user) => Object.values(liveSlots(user));
const slotOfSession = (s) => (s && SLOTS.includes(s.slot) ? s.slot : "pc");

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

async function activeSession(db, user, slot = "pc") {
  const id = liveSlots(user)[slot];
  if (!id) return null;
  const s = await db.collection(SESSIONS).findOne({ id, user_id: user.id });
  return isLive(s) ? s : null;
}

async function activeSessions(db, user) {
  const ids = liveIds(user);
  if (!ids.length) return [];
  const rows = await db.collection(SESSIONS).find({ id: { $in: ids }, user_id: user.id }).toArray();
  return rows.filter((s) => isLive(s));
}

const publicSession = (s, currentId = null) =>
  s && {
    id: s.id,
    current: !!currentId && s.id === currentId,
    device: s.device?.label || "Unknown device",
    browser: s.device?.browser || null,
    os: s.device?.os || null,
    type: s.device?.type || "desktop",
    slot: slotOfSession(s),
    verified_device: !!s.device_kid,
    ip: s.ip || null,
    location: s.location?.label || null,
    started_at: s.created_at,
    last_active_at: s.last_seen_at || s.created_at,
    ended_at: s.ended_at || null,
    end_reason: s.end_reason || null,
    active: isLive(s),
  };

// Can this device sign in straight away, or does another device hold its slot?
async function loginDecision(db, user, ident) {
  const live = await activeSession(db, user, ident.slot);
  if (!live) return { conflict: false };
  // Same device signing in again: just replace its old session
  if (ident.key && live.device_key === ident.key) return { conflict: false, replaces: live.id };
  return { conflict: true, session: live };
}

async function issueTicket(db, user, req, ident) {
  const token = crypto.randomBytes(32).toString("base64url");
  const now = new Date();
  await db.collection(TICKETS).insertOne({
    hash: sha256(token),
    user_id: user.id,
    token_version: user.token_version || 0,
    device_key: ident.key,
    slot: ident.slot,
    ip: clientIp(req),
    created_at: now,
    expires_at: new Date(now.getTime() + TICKET_TTL_MS),
    used_at: null,
  });
  return token;
}

// Single use, same device, five minutes
async function consumeTicket(db, token, req, ident) {
  if (typeof token !== "string" || token.length < 20 || token.length > 100) return null;
  const now = new Date();
  const t = await db.collection(TICKETS).findOneAndUpdate(
    { hash: sha256(token), used_at: null, expires_at: { $gt: now } },
    { $set: { used_at: now, used_ip: clientIp(req) } },
    { returnDocument: "before" }
  );
  if (!t) return null;
  if (!t.device_key || t.device_key !== ident.key || (t.slot || "pc") !== ident.slot) return null;
  return t;
}

/**
 * Open a session for a user in the device's slot. The session that held that
 * slot, and any other session of this same device, is ended (its refresh
 * tokens revoked). The other slot is left alone.
 */
async function create(db, user, req, { family, pharmacyId, ident, platform = "web" }) {
  const now = new Date();
  const id = crypto.randomBytes(18).toString("base64url");
  const slot = ident?.slot || "pc";
  const row = {
    id,
    user_id: user.id,
    account_id: user.pharmacy_id,
    family,
    platform,
    slot,
    device_key: ident?.key || null,
    device_kid: ident?.kid || null,
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
  // A pre-slot session (active_session_id) is the computer slot
  const keep = liveSlots(user);
  const update = { $set: { [`active_sessions.${slot}`]: id, last_pharmacy_id: pharmacyId, last_login_at: now.toISOString() } };
  if (user.active_session_id) {
    update.$unset = { active_session_id: "" };
    if (slot !== "pc" && keep.pc && !user.active_sessions?.pc) update.$set["active_sessions.pc"] = keep.pc;
  }
  await db.collection("users").updateOne({ id: user.id }, update);
  // End whatever held this slot, and this device's older sessions
  const otherSlot = SLOTS.find((x) => x !== slot);
  const spare = keep[otherSlot];
  const open = await db.collection(SESSIONS).find({ user_id: user.id, ended_at: null, id: { $ne: id } }, { projection: { id: 1, family: 1, slot: 1, device_key: 1 } }).toArray();
  const toEnd = open.filter((s) => s.id !== spare || (row.device_key && s.device_key === row.device_key));
  if (toEnd.some((s) => s.id === spare)) await db.collection("users").updateOne({ id: user.id, [`active_sessions.${otherSlot}`]: spare }, { $unset: { [`active_sessions.${otherSlot}`]: "" } });
  await endList(db, toEnd, "REPLACED");
  return row;
}

async function endList(db, list, reason) {
  if (!list.length) return 0;
  await db.collection(SESSIONS).updateMany({ id: { $in: list.map((s) => s.id) }, ended_at: null }, { $set: { ended_at: new Date(), end_reason: reason } });
  await revokeFamilies(db, list.map((s) => s.family).filter(Boolean), `session_${reason.toLowerCase()}`);
  return list.length;
}

async function revokeFamilies(db, families, reason) {
  if (!families.length) return;
  await db.collection("refresh_tokens").updateMany({ family: { $in: families }, revoked_at: null }, { $set: { revoked_at: new Date(), revoke_reason: reason } });
}

async function endOthers(db, userId, keepId, reason) {
  const open = await db.collection(SESSIONS).find({ user_id: userId, ended_at: null, id: { $ne: keepId } }, { projection: { id: 1, family: 1 } }).toArray();
  return endList(db, open, reason);
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
  for (const slot of SLOTS) await db.collection("users").updateOne({ id: s.user_id, [`active_sessions.${slot}`]: s.id }, { $unset: { [`active_sessions.${slot}`]: "" } });
  await db.collection("users").updateOne({ id: s.user_id, active_session_id: s.id }, { $unset: { active_session_id: "" } });
  return s;
}

async function endAllForUser(db, userId, reason) {
  await endOthers(db, userId, null, reason);
  await db.collection("users").updateOne({ id: userId }, { $unset: { active_session_id: "", active_sessions: "" } });
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
  liveSlots,
  liveIds,
  slotOfSession,
  activeSessions,
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
