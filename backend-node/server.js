require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const startCronJobs = require("./services/cron");
const { ensureTenantIndexes } = require("./services/search/indexes");
const { ensureCoreIndexes } = require("./services/billing/indexes");
const { getPublicPlans } = require("./services/billing/pricing");
const helmet = require("helmet");

// Import routes
const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/users");
const supplierRoutes = require("./routes/suppliers");
const productRoutes = require("./routes/products");
const purchaseRoutes = require("./routes/purchases");
const inventoryRoutes = require("./routes/inventory");
const customerRoutes = require("./routes/customers");
const billRoutes = require("./routes/bills");
const dashboardRoutes = require("./routes/dashboard");
const medicineRoutes = require("./routes/medicines");
const migrateRoutes = require("./routes/migrate");
const pharmacyRoutes = require("./routes/pharmacy");
const activityRoutes = require("./routes/activities");
const settingsRoutes = require("./routes/settings");

const { createBullBoard } = require("@bull-board/api");
const { BullMQAdapter } = require("@bull-board/api/bullMQAdapter");
const { ExpressAdapter } = require("@bull-board/express");
const { scanQueue } = require("./services/ai/queue");
const basicAuth = require("express-basic-auth");
const {
  sanitizeInput,
  apiLimiter,
  authLimiter,
  otpLimiter,
  refreshLimiter,
  publicLimiter,
  adminLimiter,
} = require("./middleware/security");

const app = express();
app.set("trust proxy", 1);
const PORT = process.env.PORT || 8001;
// Security headers (API only serves JSON, so no CSP/frame concerns for HTML)
// HSTS is set by nginx (it also covers nginx's own error pages)
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" }, strictTransportSecurity: false }));

// CORS: credentials are allowed, so only known frontends may call the API.
// CORS_ORIGINS="https://a.com,https://b.com" overrides; "*" or unset = defaults.
const DEFAULT_ORIGIN_SUFFIXES = [".davadesk.in", ".pharmalogy.co.in"];
const DEFAULT_ORIGINS = ["https://davadesk.in", "http://localhost:3000", "http://localhost:3001", "http://localhost:5173"];
const configuredOrigins = (process.env.CORS_ORIGINS || "")
  .replace(/"/g, "")
  .split(",")
  .map((o) => o.trim().replace(/\/+$/, ""))
  .filter((o) => o && o !== "*");
const isAllowedOrigin = (origin) => {
  if (configuredOrigins.length) return configuredOrigins.includes(origin);
  if (DEFAULT_ORIGINS.includes(origin)) return true;
  try {
    const { protocol, hostname } = new URL(origin);
    return protocol === "https:" && DEFAULT_ORIGIN_SUFFIXES.some((s) => hostname.endsWith(s));
  } catch {
    return false;
  }
};
app.use(
  cors({
    origin: (origin, callback) => {
      // No Origin header: server-to-server, curl, Cashfree webhooks
      if (!origin) return callback(null, true);
      callback(null, isAllowedOrigin(origin));
    },
    credentials: true,
  })
);
// Cashfree webhooks need the exact raw bytes for signature verification, so
// this must be registered before the JSON parser.
app.use("/api/webhook/cashfree", express.raw({ type: "*/*", limit: "1mb" }));
// Files arrive as multipart uploads (their own limits); JSON stays modest so
// a single request can't tie up memory.
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(sanitizeInput);

// MongoDB connection
// In production a failed first connection exits and Docker restarts the
// container. Locally (nodemon) that would leave the app dead until a file
// changes, e.g. while the DB tunnel is still opening, so retry instead.
const connectMongo = () =>
  mongoose.connect(process.env.MONGO_URL, { maxPoolSize: 50, serverSelectionTimeoutMS: 10000 }).catch((err) => {
    if (process.env.NODE_ENV === "production") throw err;
    console.error(`MongoDB not reachable (${err.message}); retrying in 5s`);
    return new Promise((resolve) => setTimeout(resolve, 5000)).then(connectMongo);
  });

connectMongo()
  .then(() => {
    console.log("Connected to MongoDB");
    // Idempotent; runs in the background so startup isn't blocked
    ensureTenantIndexes(mongoose.connection.db).catch((err) =>
      console.warn("[Indexes] ensureTenantIndexes failed:", err.message)
    );
    require("./services/assistant/store").ensureIndexes(mongoose.connection.db).catch((err) =>
      console.warn("[Indexes] assistant indexes failed:", err.message)
    );
    require("./routes/shortbook").ensureIndexes(mongoose.connection.db).catch((err) =>
      console.warn("[Indexes] short book indexes failed:", err.message)
    );
    require("./routes/support").ensureIndexes(mongoose.connection.db).catch((err) =>
      console.warn("[Indexes] support indexes failed:", err.message)
    );
    require("./routes/broadcasts").ensureIndexes(mongoose.connection.db).catch((err) =>
      console.warn("[Indexes] broadcast indexes failed:", err.message)
    );
    require("./services/billShare").ensureIndexes(mongoose.connection.db).catch((err) =>
      console.warn("[Indexes] bill share indexes failed:", err.message)
    );
    require("./services/assistant/stt").ensureIndexes(mongoose.connection.db).catch((err) =>
      console.warn("[Indexes] voice typing indexes failed:", err.message)
    );
    ensureCoreIndexes(mongoose.connection.db).catch((err) =>
      console.warn("[Indexes] ensureCoreIndexes failed:", err.message)
    );
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  });


// Rate limits live in Redis (middleware/security.js): one overall ceiling per
// IP, tighter ones on credential, OTP and public endpoints.
app.use("/api", apiLimiter);
app.use(["/api/auth/login", "/api/auth/register", "/api/auth/forgot-password"], authLimiter);
app.use(
  ["/api/auth/verify-otp", "/api/auth/resend-otp", "/api/auth/reset-password", "/api/auth/reset-link", "/api/users/verify"],
  otpLimiter
);
app.use("/api/auth/refresh", refreshLimiter);
app.use("/api/public", publicLimiter);

// API Routes - all prefixed with /api
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/suppliers", supplierRoutes);
app.use("/api/products", productRoutes);
app.use("/api/purchases", purchaseRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/bills", billRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/medicines", medicineRoutes);
app.use("/api/migrate", migrateRoutes);
app.use("/api/pharmacy", pharmacyRoutes);
app.use("/api/activities", activityRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/expiry", require("./routes/expiry"));
app.use("/api/returns", require("./routes/returns"));
app.use("/api/reminders", require("./routes/reminders"));
app.use("/api/notifications", require("./routes/notifications"));
app.use("/api/broadcasts", require("./routes/broadcasts"));

app.get("/api/plans", async (req, res, next) => {
  try {
    res.set("Cache-Control", "public, max-age=30");
    res.json(await getPublicPlans(mongoose.connection.db));
  } catch (err) {
    next(err);
  }
});
app.use("/api/billing", require("./routes/billing"));
app.use("/api/credits", require("./routes/credits"));
app.use("/api/webhook", require("./routes/webhook"));
app.use("/api/assistant", require("./routes/assistant"));
app.use("/api/public", require("./routes/public"));
app.use("/api/support", require("./routes/support"));
app.use("/api/shortbook", require("./routes/shortbook"));

// Bull Board Setup (Protected with Basic Auth)
if (!process.env.ADMIN_PASSWORD) {
  console.error(
    "CRITICAL ERROR: ADMIN_PASSWORD environment variable is missing."
  );
  process.exit(1);
}

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath("/admin/queues");
createBullBoard({
  queues: [new BullMQAdapter(scanQueue)],
  serverAdapter: serverAdapter,
});

app.use(
  "/admin/queues",
  adminLimiter,
  basicAuth({
    users: { admin: process.env.ADMIN_PASSWORD },
    challenge: true,
  }),
  serverAdapter.getRouter()
);

startCronJobs();

// Swagger Documentation setup (not served in production unless asked for:
// it lists every endpoint)
const serveDocs = process.env.NODE_ENV !== "production" || process.env.ENABLE_API_DOCS === "true";
if (serveDocs) try {
  const swaggerUi = require("swagger-ui-express");
  const swaggerDocument = require("./swagger-output.json");
  app.use(
    "/api-docs",
    swaggerUi.serve,
    swaggerUi.setup(swaggerDocument, {
      customSiteTitle: "Pharmacy API Explorer",
      customCss: ".swagger-ui .topbar { display: none }",
      explorer: true,
    })
  );
} catch (error) {
  console.log(
    "Swagger documentation not generated. Run 'npm run swagger' to generate."
  );
}

// Root API endpoint
app.get("/api/", (req, res) => {
  res.json({ message: "Pharmacy API - Node.js/Express", version: "2.0.0" });
});

// Health checks. /health is liveness (the process answers); /health/ready
// also checks MongoDB and Redis, and is what deploys and monitors should use.
app.get(["/health", "/api/health"], (req, res) => {
  res.json({ status: "healthy", timestamp: new Date().toISOString() });
});

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
app.get(["/health/ready", "/api/health/ready"], async (req, res) => {
  const checks = {};
  try {
    await withTimeout(mongoose.connection.db.admin().ping(), 2000);
    checks.mongo = "ok";
  } catch {
    checks.mongo = "down";
  }
  try {
    await withTimeout(scanQueue.client.then((c) => c.ping()), 2000);
    checks.redis = "ok";
  } catch {
    checks.redis = "down";
  }
  const ok = Object.values(checks).every((v) => v === "ok");
  res.set("Cache-Control", "no-store");
  res.status(ok ? 200 : 503).json({ status: ok ? "ready" : "degraded", checks, timestamp: new Date().toISOString() });
});

// Unknown API paths answer JSON, not Express's HTML page
app.use("/api", (req, res) => res.status(404).json({ detail: "Not found" }));

// Error handling middleware
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error("Error:", err);
  // Client errors keep their message; server errors never leak internals
  res.status(status).json({
    detail: status < 500 ? err.message : "Something went wrong. Please try again.",
    ...(err.code && typeof err.code === "string" && status < 500 ? { code: err.code } : {}),
  });
});

// Start server
const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`Pharmalogy API running on port ${PORT}`);
});
// Slow or stalled clients can't hold sockets open indefinitely; keep-alive is
// longer than nginx's upstream keepalive so nginx closes first.
server.requestTimeout = 120 * 1000;
server.headersTimeout = 65 * 1000;
server.keepAliveTimeout = 61 * 1000;

// Graceful shutdown: finish in-flight requests on deploy/stop, then close DB
let shuttingDown = false;
const shutdown = (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received, shutting down`);
  server.close(async () => {
    await mongoose.connection.close().catch(() => {});
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 15000).unref();
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("unhandledRejection", (err) => console.error("Unhandled rejection:", err));
