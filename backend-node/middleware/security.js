// Request-level protections shared by every route: NoSQL operator stripping,
// Redis-backed rate limits (shared by the blue/green API containers and kept
// across restarts) and caps on catalogue scraping.
const { rateLimit, ipKeyGenerator } = require("express-rate-limit");
const { RedisStore } = require("rate-limit-redis");
const { fastConnection } = require("../services/ai/queue");

// ---- NoSQL injection --------------------------------------------------------
// `?q[$ne]=` or `{"mobile": {"$gt": ""}}` would otherwise reach Mongo filters
// as operators. Keys starting with "$" or containing "." are dropped.
const MAX_DEPTH = 20;
function strip(value, depth = 0) {
  if (depth > MAX_DEPTH || value === null || typeof value !== "object")
    return value;
  if (Buffer.isBuffer(value) || value instanceof Date) return value;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++)
      value[i] = strip(value[i], depth + 1);
    return value;
  }
  for (const k of Object.keys(value)) {
    if (k.startsWith("$") || k.includes(".")) delete value[k];
    else value[k] = strip(value[k], depth + 1);
  }
  return value;
}

const sanitizeInput = (req, res, next) => {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body))
    strip(req.body);
  if (req.query) strip(req.query);
  if (req.params) strip(req.params);
  next();
};

// ---- Rate limits -------------------------------------------------------------
// RATE_LIMIT_SCALE only exists so automated tests can raise the ceilings.
const scale = Math.max(1, Number(process.env.RATE_LIMIT_SCALE) || 1);

const redisStore = (prefix) =>
  new RedisStore({
    prefix: `rl:${prefix}:`,
    // Fail-fast connection: with Redis down the limiter errors and passes the
    // request on (passOnStoreError) instead of waiting forever
    sendCommand: (command, ...args) => fastConnection().call(command, ...args),
  });

// Fails open if Redis is unreachable: an outage must not lock every user out
function limiter(name, { windowMs, limit, message, keyGenerator, skip }) {
  return rateLimit({
    windowMs,
    limit: limit * scale,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    store: redisStore(name),
    passOnStoreError: true,
    message: {
      detail:
        message || "Too many requests. Please wait a minute and try again.",
      code: "RATE_LIMITED",
    },
    ...(keyGenerator ? { keyGenerator } : {}),
    ...(skip ? { skip } : {}),
  });
}

const byIp = (req) => ipKeyGenerator(req.ip);
// Per signed-in user when known, else per IP
const byUser = (req) =>
  req.user?.id ? `u:${req.user.id}` : `ip:${ipKeyGenerator(req.ip)}`;
const byPharmacy = (req) =>
  req.user?.pharmacy_id
    ? `p:${req.user.pharmacy_id}`
    : `ip:${ipKeyGenerator(req.ip)}`;

// Every API call, per client IP. Generous: a pharmacy with several counters
// behind one connection stays well under it.
const apiLimiter = limiter("api", {
  windowMs: 60 * 1000,
  limit: 600,
  keyGenerator: byIp,
  skip: (req) => req.path.startsWith("/webhook/"),
});

const authLimiter = limiter("auth", {
  windowMs: 60 * 1000,
  limit: 20,
  keyGenerator: byIp,
});
const otpLimiter = limiter("otp", {
  windowMs: 15 * 60 * 1000,
  limit: 15,
  keyGenerator: byIp,
  message: "Too many OTP attempts. Please try again later.",
});
const refreshLimiter = limiter("refresh", {
  windowMs: 60 * 1000,
  limit: 60,
  keyGenerator: byIp,
  message: "Too many requests.",
});
// Shared bill links are public: keep guessing and scraping slow
const publicLimiter = limiter("public", {
  windowMs: 60 * 1000,
  limit: 30,
  keyGenerator: byIp,
});
const adminLimiter = limiter("admin", {
  windowMs: 15 * 60 * 1000,
  limit: 30,
  keyGenerator: byIp,
});

// Catalogue searches (global medicines, doctors, distributors). Typing in
// billing makes a few calls per item; scraping makes thousands. Applied after
// `auth`, so it counts per user and per pharmacy.
const catalogPerMinute = limiter("cat-min", {
  windowMs: 60 * 1000,
  limit: 120,
  keyGenerator: byUser,
  message: "You're searching too fast. Please slow down for a moment.",
});
const catalogPerDay = limiter("cat-day", {
  windowMs: 24 * 60 * 60 * 1000,
  limit: 6000,
  keyGenerator: byPharmacy,
  message:
    "Daily search limit reached for this pharmacy. Please contact support if you need more.",
});
const catalogLimiter = [catalogPerMinute, catalogPerDay];

// Global catalogue results per request and how deep a search may page. The
// UI shows at most a few pages of suggestions; a deeper walk is enumeration.
const GLOBAL_PAGE_SIZE = 25;
const GLOBAL_MAX_PAGES = 5;
const MIN_GLOBAL_QUERY = 2;

module.exports = {
  sanitizeInput,
  apiLimiter,
  authLimiter,
  otpLimiter,
  refreshLimiter,
  publicLimiter,
  adminLimiter,
  catalogLimiter,
  GLOBAL_PAGE_SIZE,
  GLOBAL_MAX_PAGES,
  MIN_GLOBAL_QUERY,
  _strip: strip,
};
