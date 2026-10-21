// One-time codes for signup, password reset, staff invites and sensitive
// settings. Codes are never stored or returned in clear text: only an HMAC is
// kept, attempts are capped, and sending is throttled per subject.
const crypto = require("crypto");

const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_SENDS_PER_HOUR = 5;
const HOUR_MS = 60 * 60 * 1000;

class OtpError extends Error {
  constructor(code, message, status = 400, extra = {}) {
    super(message);
    this.code = code;
    this.status = status;
    this.extra = extra;
  }
}

const secret = () => {
  const base = process.env.OTP_SECRET || process.env.JWT_SECRET;
  if (!base) throw new Error("JWT_SECRET is required");
  return base;
};

const hashOtp = (purpose, subject, otp) =>
  crypto.createHmac("sha256", secret()).update(`${purpose}:${subject}:${otp}`).digest("hex");

const challengeId = (purpose, subject) => `${purpose}:${String(subject).toLowerCase()}`;

/**
 * Create (or replace) a challenge and return the clear-text code for emailing.
 * Throws OtpError(429) inside the resend cooldown or over the hourly cap.
 */
async function issueOtp(db, { purpose, subject, data = null }) {
  const col = db.collection("otp_challenges");
  const id = challengeId(purpose, subject);
  const now = Date.now();
  const existing = await col.findOne({ _id: id });

  let windowStart = existing?.window_start ? new Date(existing.window_start).getTime() : now;
  let sends = existing?.send_count || 0;
  if (now - windowStart > HOUR_MS) {
    windowStart = now;
    sends = 0;
  }
  if (existing?.last_sent_at && now - new Date(existing.last_sent_at).getTime() < RESEND_COOLDOWN_MS) {
    const retryAfter = Math.ceil((RESEND_COOLDOWN_MS - (now - new Date(existing.last_sent_at).getTime())) / 1000);
    throw new OtpError("OTP_COOLDOWN", `Please wait ${retryAfter}s before requesting another code`, 429, { retry_after: retryAfter });
  }
  if (sends >= MAX_SENDS_PER_HOUR) {
    const retryAfter = Math.ceil((windowStart + HOUR_MS - now) / 1000);
    throw new OtpError("OTP_SEND_LIMIT", "Too many codes requested. Please try again later.", 429, { retry_after: retryAfter });
  }

  const otp = String(crypto.randomInt(100000, 1000000));
  await col.updateOne(
    { _id: id },
    {
      $set: {
        purpose,
        subject: String(subject).toLowerCase(),
        hash: hashOtp(purpose, String(subject).toLowerCase(), otp),
        attempts: 0,
        expires_at: new Date(now + OTP_TTL_MS),
        last_sent_at: new Date(now),
        window_start: new Date(windowStart),
        send_count: sends + 1,
        data,
        // Keep the doc until the throttle window closes (TTL index)
        purge_at: new Date(Math.max(now + OTP_TTL_MS, windowStart + HOUR_MS)),
      },
    },
    { upsert: true }
  );
  return otp;
}

/**
 * Check a code. On success the challenge is consumed and its `data` returned.
 * Wrong codes count towards MAX_ATTEMPTS, after which the code is burnt.
 */
async function verifyOtp(db, { purpose, subject, otp }) {
  const col = db.collection("otp_challenges");
  const id = challengeId(purpose, subject);
  const invalid = new OtpError("OTP_INVALID", "Invalid or expired code");
  if (typeof otp !== "string" || !/^\d{6}$/.test(otp)) throw invalid;

  const ch = await col.findOne({ _id: id });
  if (!ch) throw invalid;
  if (ch.attempts >= MAX_ATTEMPTS) {
    throw new OtpError("OTP_LOCKED", "Too many incorrect attempts. Request a new code.", 429);
  }
  if (!ch.hash || new Date(ch.expires_at) < new Date()) throw invalid;

  const expected = Buffer.from(ch.hash, "hex");
  const actual = Buffer.from(hashOtp(purpose, ch.subject, otp), "hex");
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    const updated = await col.findOneAndUpdate({ _id: id }, { $inc: { attempts: 1 } }, { returnDocument: "after" });
    if (updated && updated.attempts >= MAX_ATTEMPTS) {
      await col.updateOne({ _id: id }, { $set: { hash: null } });
      throw new OtpError("OTP_LOCKED", "Too many incorrect attempts. Request a new code.", 429);
    }
    throw new OtpError("OTP_INVALID", "Invalid or expired code", 400, {
      attempts_left: MAX_ATTEMPTS - (updated?.attempts || MAX_ATTEMPTS),
    });
  }

  // Consume atomically so the same code can't be used twice concurrently
  const consumed = await col.findOneAndUpdate({ _id: id, hash: ch.hash }, { $set: { hash: null, verified_at: new Date() } });
  if (!consumed) throw invalid;
  return ch.data || null;
}

async function hasPendingOtp(db, { purpose, subject }) {
  const ch = await db.collection("otp_challenges").findOne({ _id: challengeId(purpose, subject) });
  return !!(ch && ch.hash && new Date(ch.expires_at) > new Date());
}

const sendOtpError = (res, err, next) => {
  if (err instanceof OtpError) {
    return res.status(err.status).json({ code: err.code, detail: err.message, ...err.extra });
  }
  return next(err);
};

module.exports = { OtpError, issueOtp, verifyOtp, hasPendingOtp, sendOtpError, OTP_TTL_MS, MAX_ATTEMPTS };
