const jwt = require("jsonwebtoken");
const { ObjectId } = require("mongodb");
const { getAdminDb } = require("../db/connections");

const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

if (!JWT_SECRET) {
  console.error("[Admin Auth Fatal] JWT_SECRET is not configured in environment variables (.env)!");
}

/**
 * Middleware: Verify Admin Access Token (JWT)
 * Ensures user is active, session is valid, and token has not been revoked.
 */
async function requireAdminAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    const directToken = req.headers["x-admin-token"];

    // Direct system token bypass for server-to-server health or scripts if matching ADMIN_TOKEN
    if (directToken && directToken === ADMIN_TOKEN) {
      req.adminUser = {
        _id: new ObjectId("000000000000000000000001"),
        email: "system@davadesk.in",
        name: "System Admin",
        role: "SUPERADMIN",
        status: "ACTIVE",
      };
      return next();
    }

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "Authentication required. Please provide a valid authorization token.",
        code: "AUTH_REQUIRED",
      });
    }

    const token = authHeader.split(" ")[1];
    if (!token) {
      return res.status(401).json({
        error: "Malformed authentication token.",
        code: "INVALID_TOKEN",
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (jwtErr) {
      if (jwtErr.name === "TokenExpiredError") {
        return res.status(401).json({
          error: "Your session token has expired. Please refresh your session or log in again.",
          code: "TOKEN_EXPIRED",
        });
      }
      return res.status(401).json({
        error: "Invalid session token signature.",
        code: "INVALID_TOKEN",
      });
    }

    if (!decoded || !decoded.userId) {
      return res.status(401).json({
        error: "Invalid token payload.",
        code: "INVALID_TOKEN",
      });
    }

    const db = getAdminDb();
    let queryId;
    try {
      queryId = new ObjectId(String(decoded.userId));
    } catch (idErr) {
      return res.status(401).json({ error: "Invalid user ID format in token.", code: "INVALID_USER" });
    }

    const user = await db.collection("admin_users").findOne({ _id: queryId });

    if (!user) {
      return res.status(401).json({
        error: "Admin account not found or has been revoked.",
        code: "USER_NOT_FOUND",
      });
    }

    if (user.status === "SUSPENDED") {
      return res.status(403).json({
        error: "Your admin account is currently suspended. Contact superadmin.",
        code: "ACCOUNT_SUSPENDED",
      });
    }

    // Verify token version (invalidates previous tokens if user changed password or logged out all devices)
    if (decoded.tokenVersion !== undefined && user.token_version !== undefined) {
      if (decoded.tokenVersion !== user.token_version) {
        return res.status(401).json({
          error: "Session has been invalidated due to a security update. Please log in again.",
          code: "SESSION_REVOKED",
        });
      }
    }

    req.adminUser = user;
    next();
  } catch (err) {
    console.error("[Admin Auth Middleware Error]:", err);
    return res.status(500).json({ error: "Authentication verification failed.", code: "AUTH_ERROR" });
  }
}

/**
 * Middleware: Require Superadmin privileges
 */
function requireSuperAdmin(req, res, next) {
  if (!req.adminUser || req.adminUser.role !== "SUPERADMIN") {
    return res.status(403).json({
      error: "Access denied. Action requires Superadmin privileges.",
      code: "FORBIDDEN",
    });
  }
  next();
}

module.exports = {
  requireAdminAuth,
  requireSuperAdmin,
};
