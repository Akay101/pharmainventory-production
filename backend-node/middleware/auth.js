const mongoose = require("mongoose");
const { verifyAccess } = require("../services/auth/tokens");

if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required");
}

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

    const user = await mongoose.connection.db
      .collection("users")
      .findOne({ id: decoded.user_id }, { projection: USER_PROJECTION });

    if (!user || user.verified === false) {
      return res.status(401).json({ detail: "User not found" });
    }

    if ((decoded.token_version || 0) !== (user.token_version || 0)) {
      return res.status(401).json({ detail: "Session expired or invalidated" });
    }

    req.user = user;
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

module.exports = { auth, adminOnly, USER_PROJECTION };
