// One-time codes that confirm a destructive admin action (e.g. deleting an
// account). The code goes to the signed-in admin's own email and is bound to
// that admin, the action, the environment and the target, so a code for one
// user can't delete another. Stored only as an HMAC; single use; short expiry;
// a few attempts; sends are throttled per admin across containers (Mongo).
const crypto = require("crypto");
const { getAdminDb } = require("../db/connections");
const { sendAdminOTPEmail } = require("./email");

const COL = "admin_action_otps";
const TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const RESEND_GAP_MS = 60 * 1000;
const MAX_SENDS_PER_HOUR = 5;

const fail = (status, error, extra = {}) => Object.assign(new Error(error), { status, expose: true, ...extra });

const hashCode = (id, code) => crypto.createHmac("sha256", process.env.JWT_SECRET).update(`${id}:${String(code).trim()}`).digest("hex");
const sameHash = (a, b) => {
  const x = Buffer.from(String(a || ""), "hex");
  const y = Buffer.from(String(b || ""), "hex");
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
};

let indexed = null;
const col = () => {
  const c = getAdminDb().collection(COL);
  if (!indexed) {
    indexed = Promise.all([
      c.createIndex({ purge_at: 1 }, { expireAfterSeconds: 0, name: "ttl" }),
      c.createIndex({ admin_id: 1, created_at: -1 }, { name: "admin_created" }),
    ]).catch((err) => {
      indexed = null;
      console.warn("[ActionOtp] index:", err.message);
    });
  }
  return c;
};

// Email a fresh code for { purpose, env, target }. Earlier open codes for the
// same admin and purpose stop working.
async function issue({ admin, purpose, env, target, scenario }) {
  if (!process.env.JWT_SECRET) throw fail(500, "Server is missing JWT_SECRET");
  const adminId = String(admin._id);
  const c = col();
  const now = Date.now();
  const recent = await c.find({ admin_id: adminId, created_at: { $gt: new Date(now - 3600e3) } }).sort({ created_at: -1 }).limit(MAX_SENDS_PER_HOUR).toArray();
  if (recent[0] && now - recent[0].created_at.getTime() < RESEND_GAP_MS) {
    const wait = Math.ceil((RESEND_GAP_MS - (now - recent[0].created_at.getTime())) / 1000);
    throw fail(429, `Please wait ${wait} seconds before requesting another code.`, { wait_seconds: wait });
  }
  if (recent.length >= MAX_SENDS_PER_HOUR) throw fail(429, "Too many codes requested in the last hour. Try again later.");

  await c.updateMany({ admin_id: adminId, purpose, used: false }, { $set: { used: true, superseded: true } });
  const id = crypto.randomUUID();
  const code = crypto.randomInt(100000, 1000000).toString();
  const expiresAt = new Date(now + TTL_MS);
  await c.insertOne({
    _id: id,
    admin_id: adminId,
    admin_email: admin.email,
    purpose,
    env,
    target: String(target),
    code_hash: hashCode(id, code),
    attempts: 0,
    used: false,
    created_at: new Date(now),
    expires_at: expiresAt,
    purge_at: new Date(now + 24 * 3600e3),
  });
  try {
    await sendAdminOTPEmail({ toEmail: admin.email, toName: admin.name, otp: code, scenario, expiryMinutes: TTL_MS / 60000 });
  } catch (err) {
    await c.deleteOne({ _id: id });
    throw fail(502, "Couldn't send the verification email. Try again.");
  }
  return { challenge_id: id, expires_at: expiresAt, sent_to: maskEmail(admin.email) };
}

// Check a code. Throws on anything but an exact, unexpired, unused match for
// this admin, purpose, environment and target; the code is spent on success.
async function consume({ admin, challengeId, code, purpose, env, target }) {
  if (typeof challengeId !== "string" || !challengeId || typeof code !== "string" || !/^\d{6}$/.test(code.trim())) {
    throw fail(400, "Enter the 6-digit code from your email.");
  }
  const c = col();
  const now = new Date();
  const doc = await c.findOneAndUpdate(
    { _id: challengeId, admin_id: String(admin._id), purpose, env, target: String(target), used: false, expires_at: { $gt: now }, attempts: { $lt: MAX_ATTEMPTS } },
    { $inc: { attempts: 1 } },
    { returnDocument: "after" }
  );
  if (!doc) throw fail(400, "This code has expired or was already used. Request a new one.", { code: "OTP_INVALID_OR_EXPIRED" });
  if (!sameHash(hashCode(challengeId, code), doc.code_hash)) {
    const left = MAX_ATTEMPTS - doc.attempts;
    if (left <= 0) await c.updateOne({ _id: challengeId }, { $set: { used: true, locked: true } });
    throw fail(400, left > 0 ? `Wrong code. ${left} attempt(s) left.` : "Too many wrong codes. Request a new one.", { code: "OTP_WRONG", attempts_left: Math.max(0, left) });
  }
  const spent = await c.updateOne({ _id: challengeId, used: false }, { $set: { used: true, used_at: now } });
  if (!spent.modifiedCount) throw fail(400, "This code was already used. Request a new one.", { code: "OTP_INVALID_OR_EXPIRED" });
  return true;
}

function maskEmail(email) {
  const [u, d] = String(email || "").split("@");
  if (!d) return "your email";
  return `${u.slice(0, 2)}${"*".repeat(Math.max(1, u.length - 2))}@${d}`;
}

module.exports = { issue, consume, TTL_MS, MAX_ATTEMPTS };
