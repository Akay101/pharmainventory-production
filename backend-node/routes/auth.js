const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");
const { auth } = require("../middleware/auth");
const { sendOTPEmail, sendWelcomeEmail } = require("../services/email");
const { issueOtp, verifyOtp, sendOtpError, OtpError } = require("../services/auth/otp");
const tokens = require("../services/auth/tokens");
const attempts = require("../services/auth/attempts");
const schemas = require("../services/auth/schemas");
const subscriptions = require("../services/billing/subscriptions");

const BCRYPT_ROUNDS = 12;
// Unverified signups are kept for 14 days: admin's lead CRM follows up on them
const PENDING_TTL_MS = 14 * 24 * 60 * 60 * 1000;
// Compared against when the email doesn't exist, so response timing doesn't
// reveal which emails have accounts.
const DUMMY_HASH = bcrypt.hashSync("davadesk-timing-equaliser", 10);

const db = () => mongoose.connection.db;

const normalizePharmacy = (pharmacy) => ({
  id: pharmacy?.id || null,
  name: pharmacy?.name || "",
  location: pharmacy?.location || "",
  license_no: pharmacy?.license_no || "",
  years_old: pharmacy?.years_old || null,
  logo_url: pharmacy?.logo_url || null,
  contact: pharmacy?.contact || "",
  pan: pharmacy?.pan || "",
  bank_name: pharmacy?.bank_name || "",
  bank_ifsc: pharmacy?.bank_ifsc || "",
  bank_acc_no: pharmacy?.bank_acc_no || "",
  bank_holder: pharmacy?.bank_holder || "",
  upi_id: pharmacy?.upi_id || "",
  gst_no: pharmacy?.gst_no || "",
  created_at: pharmacy?.created_at || null,
});

// The only user fields ever sent to the client.
const publicUser = (user, pharmacy) => {
  const subscription = subscriptions.describe(pharmacy?.subscription);
  const active = subscription.status === "ACTIVE" || subscription.status === "TRIAL";
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    mobile: user.mobile,
    phone: user.mobile,
    role: user.role,
    pharmacy_id: user.pharmacy_id,
    is_primary_admin: !!user.is_primary_admin,
    image_url: user.image_url || null,
    created_at: user.created_at || null,
    subscription_plan: active ? subscription.plan : null,
    subscription_expiry: active ? subscription.ends_at : null,
    subscription,
  };
};

async function sessionResponse(req, res, user, extra = {}) {
  const pharmacy = await db().collection("pharmacies").findOne({ id: user.pharmacy_id }, { projection: { _id: 0 } });
  const { accessToken, refreshToken } = await tokens.startSession(db(), user, req);
  tokens.setRefreshCookie(req, res, refreshToken);
  return res.json({
    ...extra,
    token: accessToken,
    user: publicUser(user, pharmacy),
    pharmacy: normalizePharmacy(pharmacy),
  });
}

const sendCode = async (email, name, purpose, scenario, data = null) => {
  const otp = await issueOtp(db(), { purpose, subject: email, data });
  const sent = await sendOTPEmail(email, name, otp, scenario);
  if (!sent) {
    throw new OtpError("EMAIL_FAILED", "We couldn't send the verification email. Please try again shortly.", 503);
  }
};

// POST /api/auth/register — stage the signup; nothing is created until the
// email is verified.
router.post("/register", async (req, res, next) => {
  try {
    const data = schemas.validate(schemas.registerSchema, req.body, res);
    if (!data) return;

    const existing = await db().collection("users").findOne({ email: data.email }, { projection: { verified: 1 } });
    if (existing && existing.verified !== false) {
      return res.status(409).json({
        code: "EMAIL_EXISTS",
        detail: "An account with this email already exists. Sign in or reset your password.",
      });
    }

    const now = new Date();
    await db().collection("pending_registrations").updateOne(
      { email: data.email },
      {
        $set: {
          email: data.email,
          name: data.name,
          mobile: data.mobile,
          password_hash: await bcrypt.hash(data.password, BCRYPT_ROUNDS),
          pharmacy: {
            name: data.pharmacy.name,
            location: data.pharmacy.location,
            license_no: data.pharmacy.license_no || null,
            years_old: data.pharmacy.years_old || null,
          },
          ip: req.ip,
          updated_at: now,
          expires_at: new Date(now.getTime() + PENDING_TTL_MS),
        },
        $setOnInsert: { id: uuidv4(), created_at: now },
      },
      { upsert: true }
    );

    await sendCode(data.email, data.name, "signup", "signup");
    res.status(201).json({
      message: "We've sent a 6-digit code to your email.",
      email: data.email,
      email_sent: true,
    });
  } catch (error) {
    sendOtpError(res, error, next);
  }
});

// Create the pharmacy + owner from a verified pending registration.
async function materializeRegistration(pending) {
  const now = new Date().toISOString();
  const pharmacyId = uuidv4();
  const userId = uuidv4();
  const user = {
    id: userId,
    name: pending.name,
    email: pending.email,
    mobile: pending.mobile,
    password_hash: pending.password_hash,
    role: "ADMIN",
    pharmacy_id: pharmacyId,
    is_primary_admin: true,
    verified: true,
    token_version: 0,
    image_url: null,
    subscription_id: null,
    subscription_plan: null,
    subscription_expiry: null,
    created_at: now,
  };
  await db().collection("pharmacies").insertOne({
    id: pharmacyId,
    name: pending.pharmacy.name,
    location: pending.pharmacy.location,
    license_no: pending.pharmacy.license_no || null,
    years_old: pending.pharmacy.years_old || null,
    logo_url: null,
    subscription: null,
    created_at: now,
  });
  try {
    await db().collection("users").insertOne(user);
  } catch (err) {
    await db().collection("pharmacies").deleteOne({ id: pharmacyId });
    if (err.code === 11000) {
      throw new OtpError("EMAIL_EXISTS", "An account with this email already exists. Sign in instead.", 409);
    }
    throw err;
  }
  await db().collection("pending_registrations").deleteOne({ email: pending.email });
  sendWelcomeEmail(user.email, user.name, pending.pharmacy.name).catch(() => {});
  return user;
}

// POST /api/auth/verify-otp — completes signup (or verifies a legacy
// unverified account) and starts a session.
router.post("/verify-otp", async (req, res, next) => {
  try {
    const data = schemas.validate(schemas.verifySchema, req.body, res);
    if (!data) return;

    await verifyOtp(db(), { purpose: "signup", subject: data.email, otp: data.otp });

    const pending = await db().collection("pending_registrations").findOne({ email: data.email });
    let user;
    if (pending) {
      user = await materializeRegistration(pending);
    } else {
      user = await db().collection("users").findOne({ email: data.email });
      if (!user) throw new OtpError("OTP_INVALID", "Invalid or expired code");
      if (user.verified === false) {
        await db()
          .collection("users")
          .updateOne({ id: user.id }, { $set: { verified: true }, $unset: { otp: "", otp_expiry: "", otp_attempts: "" } });
        user.verified = true;
      }
    }

    return sessionResponse(req, res, user, { message: "Email verified successfully" });
  } catch (error) {
    sendOtpError(res, error, next);
  }
});

// POST /api/auth/resend-otp — same generic answer whether or not the email
// is pending, so it can't be used to probe for accounts.
router.post("/resend-otp", async (req, res, next) => {
  try {
    const data = schemas.validate(schemas.emailSchema, req.body, res);
    if (!data) return;

    const pending = await db().collection("pending_registrations").findOne({ email: data.email });
    const legacy = pending
      ? null
      : await db().collection("users").findOne({ email: data.email, verified: false }, { projection: { name: 1 } });
    if (pending || legacy) {
      await sendCode(data.email, (pending || legacy).name, "signup", "verification");
    }
    res.json({ message: "If this email is awaiting verification, a new code has been sent.", email_sent: true });
  } catch (error) {
    sendOtpError(res, error, next);
  }
});

// POST /api/auth/login
router.post("/login", async (req, res, next) => {
  try {
    const data = schemas.validate(schemas.loginSchema, req.body, res);
    if (!data) return;

    const lockKey = `login:${data.email}`;
    const lock = await attempts.lockStatus(db(), lockKey);
    if (lock.locked) {
      return res.status(429).json({
        code: "ACCOUNT_LOCKED",
        detail: `Too many failed attempts. Try again in ${Math.ceil(lock.retryAfter / 60)} minute(s) or reset your password.`,
        retry_after: lock.retryAfter,
      });
    }

    const user = await db().collection("users").findOne({ email: data.email });
    const hash = user ? user.password_hash || user.password : null;
    const valid = await bcrypt.compare(data.password, hash || DUMMY_HASH);
    if (!user || !hash || !valid) {
      const r = await attempts.recordFailure(db(), lockKey);
      return res.status(401).json({
        code: "INVALID_CREDENTIALS",
        detail: r.locked
          ? "Too many failed attempts. Your account is locked for 15 minutes."
          : "Invalid email or password",
      });
    }
    await attempts.clearFailures(db(), lockKey);

    if (user.verified === false) {
      return res.status(403).json({ code: "EMAIL_NOT_VERIFIED", detail: "Email not verified", email: user.email });
    }

    // Transparently upgrade old bcrypt cost factors
    if (bcrypt.getRounds(hash) < BCRYPT_ROUNDS) {
      bcrypt
        .hash(data.password, BCRYPT_ROUNDS)
        .then((h) => db().collection("users").updateOne({ id: user.id }, { $set: { password_hash: h }, $unset: { password: "" } }))
        .catch(() => {});
    }
    await db().collection("users").updateOne({ id: user.id }, { $set: { last_login_at: new Date().toISOString() } });

    return sessionResponse(req, res, user);
  } catch (error) {
    next(error);
  }
});

// GET /api/auth/me
router.get("/me", auth, async (req, res, next) => {
  try {
    const pharmacy = await db().collection("pharmacies").findOne({ id: req.user.pharmacy_id }, { projection: { _id: 0 } });
    res.json({ user: publicUser(req.user, pharmacy), pharmacy: normalizePharmacy(pharmacy) });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/refresh — rotates the httpOnly refresh cookie
router.post("/refresh", async (req, res, next) => {
  try {
    const presented = tokens.readRefreshCookie(req);
    if (!presented) {
      return res.status(401).json({ code: "NO_SESSION", detail: "Not signed in" });
    }
    const result = await tokens.rotate(db(), presented, req);
    tokens.setRefreshCookie(req, res, result.refreshToken);
    res.json({ token: result.accessToken });
  } catch (error) {
    if (error instanceof tokens.TokenError) {
      tokens.clearRefreshCookie(req, res);
      return res.status(401).json({ code: error.code, detail: error.message });
    }
    next(error);
  }
});

// POST /api/auth/logout — ends this device's session only. No access token
// required, so an expired session can still sign out cleanly.
router.post("/logout", async (req, res, next) => {
  try {
    const presented = tokens.readRefreshCookie(req);
    if (presented) await tokens.revokeByToken(db(), presented);
    tokens.clearRefreshCookie(req, res);
    res.json({ message: "Logged out successfully" });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/logout-all — every device, and invalidates live access tokens
router.post("/logout-all", auth, async (req, res, next) => {
  try {
    await db().collection("users").updateOne({ id: req.user.id }, { $inc: { token_version: 1 } });
    await tokens.revokeAllForUser(db(), req.user.id, "logout_all");
    tokens.clearRefreshCookie(req, res);
    res.json({ message: "Signed out of all devices" });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/forgot-password — always the same answer
router.post("/forgot-password", async (req, res, next) => {
  try {
    const data = schemas.validate(schemas.emailSchema, req.body, res);
    if (!data) return;
    const user = await db()
      .collection("users")
      .findOne({ email: data.email, verified: { $ne: false } }, { projection: { name: 1 } });
    if (user) {
      try {
        await sendCode(data.email, user.name, "reset", "forgot_password");
      } catch (err) {
        // Cooldowns are surfaced (the UI shows a timer); delivery failures are
        // only logged so the response stays identical for unknown emails.
        if (err instanceof OtpError && err.status === 429) throw err;
        console.warn("[Auth] reset code not sent:", err.message);
      }
    }
    res.json({ message: "If an account exists for this email, we've sent a reset code." });
  } catch (error) {
    sendOtpError(res, error, next);
  }
});

// POST /api/auth/reset-password { email, otp, password }
router.post("/reset-password", async (req, res, next) => {
  try {
    const data = schemas.validate(schemas.resetSchema, req.body, res);
    if (!data) return;
    await verifyOtp(db(), { purpose: "reset", subject: data.email, otp: data.otp });

    const user = await db().collection("users").findOne({ email: data.email });
    if (!user) throw new OtpError("OTP_INVALID", "Invalid or expired code");

    await db()
      .collection("users")
      .updateOne(
        { id: user.id },
        {
          $set: { password_hash: await bcrypt.hash(data.password, BCRYPT_ROUNDS), password_changed_at: new Date().toISOString() },
          $unset: { password: "" },
          $inc: { token_version: 1 },
        }
      );
    await tokens.revokeAllForUser(db(), user.id, "password_reset");
    await attempts.clearFailures(db(), `login:${data.email}`);
    tokens.clearRefreshCookie(req, res);
    res.json({ message: "Password updated. Please sign in with your new password." });
  } catch (error) {
    sendOtpError(res, error, next);
  }
});

module.exports = router;
module.exports.publicUser = publicUser;
