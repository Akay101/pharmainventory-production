const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");
const { auth, generateToken, parseCookies } = require("../middleware/auth");
const { sendOTPEmail } = require("../services/email");
const jwt = require("jsonwebtoken");

const { requireSubscription } = require("../middleware/subscription");

// Generate OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

const getCookieOptions = (isRefresh = false) => {
  const isProd = process.env.NODE_ENV === "production";
  return {
    httpOnly: false,
    secure: isProd,
    sameSite: isProd ? "none" : "lax",
    path: "/",
    maxAge: isRefresh ? 7 * 24 * 60 * 60 * 1000 : 15 * 60 * 1000,
  };
};

// POST /api/auth/register
router.post("/register", async (req, res, next) => {
  try {
    const { name, email, mobile, password, pharmacy } = req.body;
    const db = mongoose.connection.db;

    // Check existing user
    const existingUser = await db
      .collection("users")
      .findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ detail: "Email already registered" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create pharmacy
    const pharmacyId = uuidv4();
    const pharmacyData = {
      id: pharmacyId,
      name: pharmacy.name,
      location: pharmacy.location,
      license_no: pharmacy.license_no || null,
      years_old: pharmacy.years_old || null,
      logo_url: null,
      created_at: new Date().toISOString(),
    };
    await db.collection("pharmacies").insertOne(pharmacyData);

    // Generate OTP
    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    // Create user (using password_hash for compatibility with existing data)
    const userId = uuidv4();
    const userData = {
      id: userId,
      name,
      email: email.toLowerCase(),
      mobile,
      password_hash: hashedPassword,
      role: "ADMIN",
      pharmacy_id: pharmacyId,
      is_primary_admin: true,
      verified: false,
      otp,
      otp_expiry: otpExpiry,
      image_url: null,
      subscription_id: null,
      subscription_plan: null,
      subscription_expiry: null,
      created_at: new Date().toISOString(),
    };
    await db.collection("users").insertOne(userData);

    // Send OTP email
    const emailSent = await sendOTPEmail(email, name, otp);

    res.status(201).json({
      message: "Registration successful. Please verify your email.",
      email,
      email_sent: emailSent,
      otp: emailSent ? null : otp, // Show OTP if email failed
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/verify-otp
router.post("/verify-otp", async (req, res, next) => {
  try {
    const { email, otp } = req.body;
    const db = mongoose.connection.db;

    const user = await db
      .collection("users")
      .findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(404).json({ detail: "User not found" });
    }

    if (user.verified) {
      return res.status(400).json({ detail: "Email already verified" });
    }

    if (user.otp !== otp) {
      return res.status(400).json({ detail: "Invalid OTP" });
    }

    if (new Date(user.otp_expiry) < new Date()) {
      return res.status(400).json({ detail: "OTP expired" });
    }

    // Mark verified
    await db
      .collection("users")
      .updateOne(
        { id: user.id },
        { $set: { verified: true, otp: null, otp_expiry: null } }
      );

    // Generate token
    const { token, refreshToken } = generateToken(user.id, user.token_version || 0);

    // Set cookies
    res.cookie("pharmalogy_token", token, getCookieOptions(false));
    res.cookie("pharmalogy_refresh_token", refreshToken, getCookieOptions(true));

    // Get pharmacy
    const pharmacy = await db
      .collection("pharmacies")
      .findOne({ id: user.pharmacy_id }, { projection: { _id: 0 } });

    res.json({
      message: "Email verified successfully",
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        mobile: user.mobile,
        role: user.role,
        pharmacy_id: user.pharmacy_id,
        image_url: user.image_url,
      },
      pharmacy,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/resend-otp
router.post("/resend-otp", async (req, res, next) => {
  try {
    const { email } = req.body;
    const db = mongoose.connection.db;

    const user = await db
      .collection("users")
      .findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(404).json({ detail: "User not found" });
    }

    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    await db
      .collection("users")
      .updateOne({ id: user.id }, { $set: { otp, otp_expiry: otpExpiry } });

    const emailSent = await sendOTPEmail(email, user.name, otp);

    res.json({
      message: "OTP resent",
      email_sent: emailSent,
      otp: emailSent ? null : otp,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/login
router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const db = mongoose.connection.db;

    const user = await db
      .collection("users")
      .findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ detail: "Invalid email or password" });
    }

    const validPassword = await bcrypt.compare(
      password,
      user.password_hash || user.password
    );
    if (!validPassword) {
      return res.status(401).json({ detail: "Invalid email or password" });
    }

    // Check if user is verified (default to true for migrated users without the field)
    if (user.verified === false) {
      return res
        .status(403)
        .json({ detail: "Email not verified", email: user.email });
    }

    const { token, refreshToken } = generateToken(user.id, user.token_version || 0);

    // Set cookies
    res.cookie("pharmalogy_token", token, getCookieOptions(false));
    res.cookie("pharmalogy_refresh_token", refreshToken, getCookieOptions(true));

    const pharmacy = await db
      .collection("pharmacies")
      .findOne({ id: user.pharmacy_id }, { projection: { _id: 0 } });

    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        mobile: user.mobile,
        role: user.role,
        pharmacy_id: user.pharmacy_id,
        image_url: user.image_url,
      },
      pharmacy,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/auth/me
router.get("/me", auth, async (req, res, next) => {
  try {
    const db = mongoose.connection.db;
    const pharmacy = await db
      .collection("pharmacies")
      .findOne({ id: req.user.pharmacy_id }, { projection: { _id: 0 } });

    const normalizedPharmacy = pharmacy
      ? {
          id: pharmacy.id || null,
          name: pharmacy.name || "",
          location: pharmacy.location || "",
          license_no: pharmacy.license_no || "",
          years_old: pharmacy.years_old || null,
          logo_url: pharmacy.logo_url || null,
          contact: pharmacy.contact || "",
          pan: pharmacy.pan || "",
          bank_name: pharmacy.bank_name || "",
          bank_ifsc: pharmacy.bank_ifsc || "",
          bank_acc_no: pharmacy.bank_acc_no || "",
          bank_holder: pharmacy.bank_holder || "",
          upi_id: pharmacy.upi_id || "",
          gst_no: pharmacy.gst_no || "",
          created_at: pharmacy.created_at || null,
        }
      : {
          id: null,
          name: "",
          location: "",
          license_no: "",
          years_old: null,
          logo_url: null,
          contact: "",
          pan: "",
          bank_name: "",
          bank_ifsc: "",
          bank_acc_no: "",
          bank_holder: "",
          upi_id: "",
          gst_no: "",
        };

    res.json({
      user: req.user,
      pharmacy: normalizedPharmacy,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/refresh
router.post("/refresh", async (req, res, next) => {
  try {
    let refreshToken = req.body.refreshToken;
    if (!refreshToken && req.headers.cookie) {
      const cookies = parseCookies(req.headers.cookie);
      refreshToken = cookies['pharmalogy_refresh_token'];
    }

    if (!refreshToken) {
      return res.status(401).json({ detail: "Refresh token is required" });
    }

    const JWT_SECRET = process.env.JWT_SECRET;
    try {
      const decoded = jwt.verify(refreshToken, JWT_SECRET);
      if (decoded.token_type !== "refresh") {
        return res.status(401).json({ detail: "Invalid token type" });
      }

      const db = mongoose.connection.db;
      const user = await db.collection("users").findOne(
        { id: decoded.user_id },
        { projection: { _id: 0, password_hash: 0, password: 0 } }
      );

      if (!user) {
        return res.status(401).json({ detail: "User not found" });
      }

      // Verify token version matches user token version
      if ((decoded.token_version || 0) !== (user.token_version || 0)) {
        return res.status(401).json({ detail: "Session expired or invalidated" });
      }

      const tokens = generateToken(user.id, user.token_version || 0);

      // Set cookies
      res.cookie("pharmalogy_token", tokens.token, getCookieOptions(false));
      res.cookie("pharmalogy_refresh_token", tokens.refreshToken, getCookieOptions(true));

      res.json({ message: "Token refreshed successfully" });
    } catch (err) {
      return res.status(401).json({ detail: "Invalid or expired refresh token" });
    }
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/logout
router.post("/logout", auth, async (req, res, next) => {
  try {
    const db = mongoose.connection.db;
    
    // Invalidate session by incrementing token_version
    await db.collection("users").updateOne(
      { id: req.user.id },
      { $inc: { token_version: 1 } }
    );

    // Clear cookies
    const clearOpts = {
      path: "/",
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    };
    res.clearCookie("pharmalogy_token", clearOpts);
    res.clearCookie("pharmalogy_refresh_token", clearOpts);

    res.json({ message: "Logged out successfully" });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
