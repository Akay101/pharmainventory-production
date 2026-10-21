const crypto = require("crypto");

const MAX_OTP_ATTEMPTS = 5;

// Verify an OTP stored on a user document, counting failed attempts.
// After MAX_OTP_ATTEMPTS wrong guesses the OTP is wiped and must be re-sent.
// Returns { ok: true } or { ok: false, status, detail }.
async function checkStoredOtp(db, user, provided, { otpField, expiryField }) {
  const attemptsField = `${otpField}_attempts`;
  const stored = user[otpField];

  if (typeof provided !== "string" || !/^\d{6}$/.test(provided) || !stored) {
    return { ok: false, status: 400, detail: "Invalid OTP" };
  }
  if (!user[expiryField] || new Date(user[expiryField]) < new Date()) {
    return { ok: false, status: 400, detail: "OTP expired. Please request a new one." };
  }

  const a = Buffer.from(String(stored));
  const b = Buffer.from(provided);
  const match = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (match) return { ok: true };

  const attempts = (user[attemptsField] || 0) + 1;
  if (attempts >= MAX_OTP_ATTEMPTS) {
    await db.collection("users").updateOne(
      { id: user.id },
      { $set: { [otpField]: null, [expiryField]: null, [attemptsField]: 0 } }
    );
    return { ok: false, status: 429, detail: "Too many incorrect attempts. Please request a new OTP." };
  }
  await db.collection("users").updateOne({ id: user.id }, { $set: { [attemptsField]: attempts } });
  return { ok: false, status: 400, detail: "Invalid OTP" };
}

const generateOTP = () => String(crypto.randomInt(100000, 1000000));

module.exports = { checkStoredOtp, generateOTP, MAX_OTP_ATTEMPTS };
