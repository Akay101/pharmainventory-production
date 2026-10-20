const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { ObjectId } = require("mongodb");
const { getAdminDb } = require("../db/connections");
const { sendAdminOTPEmail } = require("../services/email");
const { requireAdminAuth, requireSuperAdmin } = require("../middleware/auth");

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const DEFAULT_SUPERADMIN_EMAIL = process.env.DEFAULT_ADMIN_EMAIL || "akay101685@gmail.com";

if (!JWT_SECRET || !JWT_REFRESH_SECRET) {
  console.error("[Admin Auth Fatal] JWT_SECRET and JWT_REFRESH_SECRET must be configured in environment variables (.env)!");
}

/**
 * Hash an OTP string using HMAC-SHA256 with JWT_SECRET as the key
 */
function hashOtp(otp) {
  return crypto.createHmac("sha256", JWT_SECRET).update(String(otp).trim()).digest("hex");
}

/**
 * Generate a cryptographically secure 6-digit numeric OTP
 */
function generateSecureOtp() {
  return crypto.randomInt(100000, 1000000).toString();
}

/**
 * Timing-safe comparison of OTP hashes to prevent timing attacks
 */
function verifyOtpHash(inputOtp, storedHash) {
  if (!inputOtp || !storedHash) return false;
  const inputHash = hashOtp(inputOtp);
  const storedBuf = Buffer.from(storedHash, "hex");
  const inputBuf = Buffer.from(inputHash, "hex");
  if (storedBuf.length !== inputBuf.length) return false;
  return crypto.timingSafeEqual(storedBuf, inputBuf);
}

/**
 * Ensure Superadmin exists in database & create unique indexes
 */
async function ensureSuperAdminSeed() {
  try {
    const db = getAdminDb();
    const collection = db.collection("admin_users");

    // Ensure unique index on email
    await collection.createIndex({ email: 1 }, { unique: true }).catch(() => {});

    // Check if default superadmin exists
    const existing = await collection.findOne({ email: DEFAULT_SUPERADMIN_EMAIL });
    if (!existing) {
      console.log(`[Admin Auth] Seeding default superadmin: ${DEFAULT_SUPERADMIN_EMAIL}`);
      await collection.insertOne({
        name: "DavaDesk Super Admin",
        email: DEFAULT_SUPERADMIN_EMAIL,
        mobile: "+919999999999",
        role: "SUPERADMIN",
        status: "PENDING_SETUP", // Will trigger OTP -> Set Password flow on first login
        password_hash: null,
        otp_hash: null,
        otp_expires_at: null,
        otp_attempts: 0,
        otp_last_sent_at: null,
        token_version: 1,
        created_at: new Date(),
        updated_at: new Date(),
      });
      console.log(`[Admin Auth] Default superadmin ${DEFAULT_SUPERADMIN_EMAIL} seeded successfully.`);
    }
  } catch (err) {
    console.error("[Admin Auth Seed Error]:", err.message);
  }
}

// Trigger initial seed check
setTimeout(() => {
  ensureSuperAdminSeed().catch(() => {});
}, 1500);

// ============================================================================
// PUBLIC AUTH ENDPOINTS
// ============================================================================

/**
 * POST /api/auth/login-init
 * Step 1: User provides Email (and Password if already activated)
 */
router.post("/login-init", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Strict type check to prevent NoSQL query injection
    if (!email || typeof email !== "string") {
      return res.status(400).json({ error: "Email is required and must be a string." });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      return res.status(400).json({ error: "Invalid email format." });
    }

    // Auto-seed if it's default superadmin
    if (cleanEmail === DEFAULT_SUPERADMIN_EMAIL) {
      await ensureSuperAdminSeed();
    }

    const db = getAdminDb();
    const user = await db.collection("admin_users").findOne({ email: cleanEmail });

    if (!user) {
      return res.status(401).json({
        error: "No administrative account registered with this email address.",
        code: "USER_NOT_FOUND",
      });
    }

    if (user.status === "SUSPENDED") {
      return res.status(403).json({
        error: "This administrator account is suspended. Contact superadmin.",
        code: "ACCOUNT_SUSPENDED",
      });
    }

    // FIRST-TIME LOGIN / ONBOARDING FLOW
    if (user.status === "PENDING_SETUP" || !user.password_hash) {
      // Check resend throttle (60 seconds)
      if (user.otp_last_sent_at) {
        const elapsed = (Date.now() - new Date(user.otp_last_sent_at).getTime()) / 1000;
        if (elapsed < 30) {
          return res.status(429).json({
            error: `Please wait ${Math.ceil(30 - elapsed)} seconds before requesting a new code.`,
            wait_seconds: Math.ceil(30 - elapsed),
          });
        }
      }

      const otp = generateSecureOtp();
      const otpHash = hashOtp(otp);
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      await db.collection("admin_users").updateOne(
        { _id: user._id },
        {
          $set: {
            otp_hash: otpHash,
            otp_expires_at: expiresAt,
            otp_attempts: 0,
            otp_last_sent_at: new Date(),
            updated_at: new Date(),
          },
        }
      );

      // Send OTP via Brevo
      try {
        await sendAdminOTPEmail({
          toEmail: cleanEmail,
          toName: user.name,
          otp,
          scenario: "FIRST_TIME_LOGIN",
          expiryMinutes: 10,
        });
      } catch (mailErr) {
        console.error("[Login Init] Email delivery failed:", mailErr.message);
        return res.status(500).json({
          error: "Failed to deliver verification code email. Please check your Brevo configuration.",
        });
      }

      return res.json({
        step: "OTP_REQUIRED",
        firstTime: true,
        email: cleanEmail,
        message: "First-time setup code sent to your email. Check your inbox.",
      });
    }

    // SUBSEQUENT LOGIN FLOW: Requires Email + Password + OTP (2FA)
    if (!password || typeof password !== "string") {
      return res.status(400).json({
        error: "Password is required for this account.",
        code: "PASSWORD_REQUIRED",
      });
    }

    const isPasswordValid = await bcrypt.compare(String(password), user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({
        error: "Invalid email or password.",
        code: "INVALID_CREDENTIALS",
      });
    }

    // Password passed! Now issue 2FA OTP
    const otp = generateSecureOtp();
    const otpHash = hashOtp(otp);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await db.collection("admin_users").updateOne(
      { _id: user._id },
      {
        $set: {
          otp_hash: otpHash,
          otp_expires_at: expiresAt,
          otp_attempts: 0,
          otp_last_sent_at: new Date(),
          updated_at: new Date(),
        },
      }
    );

    try {
      await sendAdminOTPEmail({
        toEmail: cleanEmail,
        toName: user.name,
        otp,
        scenario: "LOGIN_2FA",
        expiryMinutes: 10,
      });
    } catch (mailErr) {
      console.error("[Login 2FA] Email delivery failed:", mailErr.message);
      return res.status(500).json({
        error: "Failed to send two-factor verification code.",
      });
    }

    return res.json({
      step: "OTP_REQUIRED",
      firstTime: false,
      email: cleanEmail,
      message: "Credentials verified. Two-factor verification code sent to your email.",
    });
  } catch (err) {
    console.error("[Login Init Error]:", err);
    res.status(500).json({ error: "Login initialization failed.", details: err.message });
  }
});

/**
 * POST /api/auth/resend-otp
 */
router.post("/resend-otp", async (req, res) => {
  try {
    const { email, scenario } = req.body;

    if (!email || typeof email !== "string") {
      return res.status(400).json({ error: "Email must be a valid string." });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const db = getAdminDb();
    const user = await db.collection("admin_users").findOne({ email: cleanEmail });

    if (!user) {
      return res.status(404).json({ error: "Account not found." });
    }

    // Throttle check: 45 seconds
    if (user.otp_last_sent_at) {
      const elapsed = (Date.now() - new Date(user.otp_last_sent_at).getTime()) / 1000;
      if (elapsed < 45) {
        return res.status(429).json({
          error: `Please wait ${Math.ceil(45 - elapsed)}s before requesting another code.`,
          wait_seconds: Math.ceil(45 - elapsed),
        });
      }
    }

    const otp = generateSecureOtp();
    const otpHash = hashOtp(otp);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await db.collection("admin_users").updateOne(
      { _id: user._id },
      {
        $set: {
          otp_hash: otpHash,
          otp_expires_at: expiresAt,
          otp_attempts: 0,
          otp_last_sent_at: new Date(),
          updated_at: new Date(),
        },
      }
    );

    const emailScenario = scenario || (user.status === "PENDING_SETUP" ? "FIRST_TIME_LOGIN" : "LOGIN_2FA");

    await sendAdminOTPEmail({
      toEmail: cleanEmail,
      toName: user.name,
      otp,
      scenario: emailScenario,
      expiryMinutes: 10,
    });

    res.json({
      success: true,
      message: "A fresh verification code has been dispatched to your email.",
    });
  } catch (err) {
    console.error("[Resend OTP Error]:", err);
    res.status(500).json({ error: "Failed to resend code." });
  }
});

/**
 * POST /api/auth/verify-otp
 * Strict verification with zero bypass, rate limiting, and single-use clearance
 */
router.post("/verify-otp", async (req, res) => {
  try {
    const { email, otp, purpose } = req.body;

    // Strict input validation
    if (!email || typeof email !== "string" || !otp || typeof otp !== "string") {
      return res.status(400).json({ error: "Both email and OTP must be valid strings." });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const cleanOtp = String(otp).trim();

    if (!/^\d{6}$/.test(cleanOtp)) {
      return res.status(400).json({ error: "Verification code must be exactly 6 digits." });
    }

    const db = getAdminDb();
    const user = await db.collection("admin_users").findOne({ email: cleanEmail });

    if (!user) {
      return res.status(401).json({ error: "Invalid verification attempt." });
    }

    // 1. Check if OTP exists
    if (!user.otp_hash || !user.otp_expires_at) {
      return res.status(400).json({
        error: "No active verification code found. Please request a new code.",
        code: "NO_ACTIVE_OTP",
      });
    }

    // 2. Check Expiry (10 minutes)
    if (Date.now() > new Date(user.otp_expires_at).getTime()) {
      // Invalidate expired OTP
      await db.collection("admin_users").updateOne(
        { _id: user._id },
        { $set: { otp_hash: null, otp_expires_at: null, otp_attempts: 0 } }
      );
      return res.status(400).json({
        error: "Verification code has expired. Please request a new code.",
        code: "OTP_EXPIRED",
      });
    }

    // 3. Check Brute-Force Rate Limiting (max 5 attempts)
    const currentAttempts = user.otp_attempts || 0;
    if (currentAttempts >= 5) {
      await db.collection("admin_users").updateOne(
        { _id: user._id },
        { $set: { otp_hash: null, otp_expires_at: null, otp_attempts: 0 } }
      );
      return res.status(429).json({
        error: "Too many failed attempts. Code has been invalidated for security. Please request a new code.",
        code: "MAX_ATTEMPTS_EXCEEDED",
      });
    }

    // 4. Cryptographic Timing-Safe Hash Verification
    const isValid = verifyOtpHash(cleanOtp, user.otp_hash);

    if (!isValid) {
      const nextAttempts = currentAttempts + 1;
      const remaining = Math.max(0, 5 - nextAttempts);

      await db.collection("admin_users").updateOne(
        { _id: user._id },
        {
          $set: {
            otp_attempts: nextAttempts,
            ...(nextAttempts >= 5 ? { otp_hash: null, otp_expires_at: null } : {}),
          },
        }
      );

      return res.status(400).json({
        error: remaining > 0 ? `Invalid code. ${remaining} attempt(s) remaining.` : "Invalid code. Max attempts exceeded.",
        remaining_attempts: remaining,
        code: "INVALID_OTP",
      });
    }

    // OTP IS VALID! Immediately wipe OTP fields so it cannot be reused
    await db.collection("admin_users").updateOne(
      { _id: user._id },
      {
        $set: {
          otp_hash: null,
          otp_expires_at: null,
          otp_attempts: 0,
          updated_at: new Date(),
        },
      }
    );

    // CASE A: First-time setup OR password reset
    const isFirstTime = user.status === "PENDING_SETUP" || !user.password_hash;
    const isReset = purpose === "reset";

    if (isFirstTime || isReset) {
      // Issue a short-lived temporary setup token (15 mins)
      const tempToken = jwt.sign(
        {
          userId: user._id.toString(),
          email: user.email,
          action: "SET_PASSWORD",
        },
        JWT_SECRET,
        { expiresIn: "15m" }
      );

      return res.json({
        step: "SET_PASSWORD_REQUIRED",
        tempToken,
        email: user.email,
        message: "Code verified. Please set your new secure account password.",
      });
    }

    // CASE B: Standard 2FA Login -> Issue Access Token & Refresh Token (24h session)
    const tokenVersion = user.token_version || 1;

    const accessToken = jwt.sign(
      {
        userId: user._id.toString(),
        email: user.email,
        role: user.role,
        tokenVersion,
      },
      JWT_SECRET,
      { expiresIn: "2h" }
    );

    // Refresh token with 24 hours strict lifetime
    const refreshToken = jwt.sign(
      {
        userId: user._id.toString(),
        tokenVersion,
      },
      JWT_REFRESH_SECRET,
      { expiresIn: "24h" }
    );

    return res.json({
      step: "AUTHENTICATED",
      accessToken,
      refreshToken,
      sessionExpiresIn: 86400, // 24 hours in seconds
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
        mobile: user.mobile,
      },
      message: "Authentication successful. Welcome to DavaDesk Admin.",
    });
  } catch (err) {
    console.error("[Verify OTP Error]:", err);
    res.status(500).json({ error: "Verification process failed.", details: err.message });
  }
});

/**
 * POST /api/auth/set-password
 * Requires tempToken from OTP verification
 */
router.post("/set-password", async (req, res) => {
  try {
    const { tempToken, newPassword, confirmPassword } = req.body;
    const authHeader = req.headers.authorization;
    const token = tempToken || (authHeader && authHeader.startsWith("Bearer ") ? authHeader.split(" ")[1] : null);

    if (!token || typeof token !== "string") {
      return res.status(401).json({
        error: "Temporary setup token is required to set a password.",
        code: "TOKEN_REQUIRED",
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (jwtErr) {
      return res.status(401).json({
        error: "Setup token has expired or is invalid. Please restart login.",
        code: "INVALID_SETUP_TOKEN",
      });
    }

    if (decoded.action !== "SET_PASSWORD" || !decoded.userId) {
      return res.status(400).json({ error: "Invalid action for this token." });
    }

    if (!newPassword || typeof newPassword !== "string") {
      return res.status(400).json({ error: "New password is required." });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: "Password confirmation does not match." });
    }

    // Strong password policy enforcement
    if (newPassword.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters long." });
    }
    if (!/[A-Z]/.test(newPassword)) {
      return res.status(400).json({ error: "Password must contain at least one uppercase letter (A-Z)." });
    }
    if (!/[a-z]/.test(newPassword)) {
      return res.status(400).json({ error: "Password must contain at least one lowercase letter (a-z)." });
    }
    if (!/[0-9]/.test(newPassword)) {
      return res.status(400).json({ error: "Password must contain at least one numeric digit (0-9)." });
    }
    if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(newPassword)) {
      return res.status(400).json({ error: "Password must contain at least one special character (!@#$%^&*...)." });
    }

    const salt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash(newPassword, salt);

    const db = getAdminDb();
    const queryId = new ObjectId(String(decoded.userId));
    const user = await db.collection("admin_users").findOne({ _id: queryId });

    if (!user) {
      return res.status(404).json({ error: "User account not found." });
    }

    const newTokenVersion = (user.token_version || 1) + 1;

    await db.collection("admin_users").updateOne(
      { _id: queryId },
      {
        $set: {
          password_hash: passwordHash,
          status: "ACTIVE",
          token_version: newTokenVersion,
          updated_at: new Date(),
        },
      }
    );

    // Issue standard access & refresh tokens
    const accessToken = jwt.sign(
      {
        userId: user._id.toString(),
        email: user.email,
        role: user.role,
        tokenVersion: newTokenVersion,
      },
      JWT_SECRET,
      { expiresIn: "2h" }
    );

    const refreshToken = jwt.sign(
      {
        userId: user._id.toString(),
        tokenVersion: newTokenVersion,
      },
      JWT_REFRESH_SECRET,
      { expiresIn: "24h" }
    );

    return res.json({
      success: true,
      message: "Password set successfully. You are now logged in.",
      accessToken,
      refreshToken,
      sessionExpiresIn: 86400,
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
        mobile: user.mobile,
      },
    });
  } catch (err) {
    console.error("[Set Password Error]:", err);
    res.status(500).json({ error: "Failed to update password." });
  }
});

/**
 * POST /api/auth/forgot-password
 * Initiates reset password OTP
 */
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || typeof email !== "string") {
      return res.status(400).json({ error: "Email must be a valid string." });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const db = getAdminDb();
    const user = await db.collection("admin_users").findOne({ email: cleanEmail });

    // Friendly response even if not found to prevent user enumeration
    if (!user) {
      return res.json({
        success: true,
        message: "If an administrative account exists for this email, a verification code has been dispatched.",
      });
    }

    const otp = generateSecureOtp();
    const otpHash = hashOtp(otp);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await db.collection("admin_users").updateOne(
      { _id: user._id },
      {
        $set: {
          otp_hash: otpHash,
          otp_expires_at: expiresAt,
          otp_attempts: 0,
          otp_last_sent_at: new Date(),
          updated_at: new Date(),
        },
      }
    );

    await sendAdminOTPEmail({
      toEmail: cleanEmail,
      toName: user.name,
      otp,
      scenario: "PASSWORD_RESET",
      expiryMinutes: 10,
    });

    res.json({
      success: true,
      message: "Password reset verification code has been sent to your email.",
    });
  } catch (err) {
    console.error("[Forgot Password Error]:", err);
    res.status(500).json({ error: "Failed to process forgot password request." });
  }
});

/**
 * POST /api/auth/refresh
 * Refreshes an access token if refresh token is within 24 hours
 */
router.post("/refresh", async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken || typeof refreshToken !== "string") {
      return res.status(400).json({ error: "Refresh token is required." });
    }

    let decoded;
    try {
      decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
    } catch (err) {
      return res.status(401).json({
        error: "Your 24-hour administrative session has expired. Please sign in again.",
        code: "SESSION_EXPIRED",
      });
    }

    const db = getAdminDb();
    const queryId = new ObjectId(String(decoded.userId));
    const user = await db.collection("admin_users").findOne({ _id: queryId });

    if (!user || user.status === "SUSPENDED") {
      return res.status(401).json({ error: "Account inactive or suspended.", code: "ACCOUNT_INACTIVE" });
    }

    if (decoded.tokenVersion !== user.token_version) {
      return res.status(401).json({
        error: "Session was invalidated due to password change or logout.",
        code: "SESSION_REVOKED",
      });
    }

    const accessToken = jwt.sign(
      {
        userId: user._id.toString(),
        email: user.email,
        role: user.role,
        tokenVersion: user.token_version,
      },
      JWT_SECRET,
      { expiresIn: "2h" }
    );

    res.json({
      accessToken,
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
        mobile: user.mobile,
      },
    });
  } catch (err) {
    console.error("[Refresh Token Error]:", err);
    res.status(500).json({ error: "Could not refresh token." });
  }
});

// ============================================================================
// PROTECTED USER / SESSION ENDPOINTS
// ============================================================================

/**
 * GET /api/auth/me
 * Returns authenticated admin profile
 */
router.get("/me", requireAdminAuth, (req, res) => {
  const u = req.adminUser;
  res.json({
    user: {
      id: u._id.toString(),
      name: u.name,
      email: u.email,
      role: u.role,
      mobile: u.mobile,
      status: u.status,
      created_at: u.created_at,
    },
  });
});

/**
 * POST /api/auth/logout
 * Revokes all sessions server-side by incrementing token_version
 */
router.post("/logout", requireAdminAuth, async (req, res) => {
  try {
    const db = getAdminDb();
    await db.collection("admin_users").updateOne(
      { _id: req.adminUser._id },
      {
        $inc: { token_version: 1 },
        $set: { updated_at: new Date() },
      }
    );
    res.json({ success: true, message: "Logged out from all sessions successfully." });
  } catch (err) {
    res.status(500).json({ error: "Logout failed." });
  }
});

// ============================================================================
// TEAM MEMBERS MANAGEMENT (SUPERADMIN ONLY)
// ============================================================================

/**
 * GET /api/auth/team
 * List all admin team members
 */
router.get("/team", requireAdminAuth, requireSuperAdmin, async (req, res) => {
  try {
    const db = getAdminDb();
    const members = await db
      .collection("admin_users")
      .find({}, { projection: { password_hash: 0, otp_hash: 0 } })
      .sort({ created_at: -1 })
      .toArray();

    res.json({
      team: members.map((m) => ({
        id: m._id.toString(),
        name: m.name,
        email: m.email,
        mobile: m.mobile,
        role: m.role,
        status: m.status,
        created_at: m.created_at,
        last_login_at: m.last_login_at,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch team members." });
  }
});

/**
 * POST /api/auth/team/create
 * Provision a new admin user (Name, Email, Mobile, Role)
 * The user can then login with email and OTP, and set a new password.
 */
router.post("/team/create", requireAdminAuth, requireSuperAdmin, async (req, res) => {
  try {
    const { name, email, mobile, role } = req.body;

    if (!name || typeof name !== "string" || name.trim().length < 2) {
      return res.status(400).json({ error: "A valid name is required (min 2 characters)." });
    }

    if (!email || typeof email !== "string") {
      return res.status(400).json({ error: "A valid email is required." });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ error: "Invalid email format." });
    }

    const cleanMobile = mobile && typeof mobile === "string" ? mobile.trim() : "";
    const cleanRole = ["SUPERADMIN", "ADMIN", "OPERATOR", "SUPPORT"].includes(role) ? role : "ADMIN";

    const db = getAdminDb();
    const existing = await db.collection("admin_users").findOne({ email: cleanEmail });
    if (existing) {
      return res.status(400).json({ error: `An admin account with email ${cleanEmail} already exists.` });
    }

    // Generate initial OTP for onboarding
    const otp = generateSecureOtp();
    const otpHash = hashOtp(otp);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    const newAdmin = {
      name: name.trim(),
      email: cleanEmail,
      mobile: cleanMobile,
      role: cleanRole,
      status: "PENDING_SETUP", // Must complete OTP -> Set Password flow
      password_hash: null,
      otp_hash: otpHash,
      otp_expires_at: expiresAt,
      otp_attempts: 0,
      otp_last_sent_at: new Date(),
      token_version: 1,
      invited_by: req.adminUser.email,
      created_at: new Date(),
      updated_at: new Date(),
    };

    const insertResult = await db.collection("admin_users").insertOne(newAdmin);

    // Send invitation email with OTP
    try {
      await sendAdminOTPEmail({
        toEmail: cleanEmail,
        toName: name.trim(),
        otp,
        scenario: "INVITE",
        expiryMinutes: 10,
      });
    } catch (mailErr) {
      console.warn("[Team Create] Invitation email could not be sent:", mailErr.message);
    }

    res.status(201).json({
      success: true,
      message: `Admin user ${cleanEmail} created successfully. Setup instructions and verification code sent to their email.`,
      user: {
        id: insertResult.insertedId.toString(),
        name: newAdmin.name,
        email: newAdmin.email,
        mobile: newAdmin.mobile,
        role: newAdmin.role,
        status: newAdmin.status,
      },
    });
  } catch (err) {
    console.error("[Team Create Error]:", err);
    res.status(500).json({ error: "Failed to create team member." });
  }
});

/**
 * DELETE /api/auth/team/:id
 * Remove or deactivate admin member
 */
router.delete("/team/:id", requireAdminAuth, requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    let objectId;
    try {
      objectId = new ObjectId(String(id));
    } catch (e) {
      return res.status(400).json({ error: "Invalid user ID format." });
    }

    // Prevent deleting self
    if (objectId.toString() === req.adminUser._id.toString()) {
      return res.status(400).json({ error: "You cannot delete your own admin account." });
    }

    const db = getAdminDb();
    const targetUser = await db.collection("admin_users").findOne({ _id: objectId });

    if (!targetUser) {
      return res.status(404).json({ error: "Admin user not found." });
    }

    // Protect default superadmin
    if (targetUser.email === DEFAULT_SUPERADMIN_EMAIL) {
      return res.status(400).json({ error: "The primary root Superadmin cannot be deleted." });
    }

    await db.collection("admin_users").deleteOne({ _id: objectId });

    res.json({
      success: true,
      message: `Admin user ${targetUser.email} has been permanently removed.`,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete admin member." });
  }
});

module.exports = router;
