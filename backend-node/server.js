require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { rateLimit } = require("express-rate-limit");
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

const app = express();
app.set("trust proxy", 1);
const PORT = process.env.PORT || 8001;
// Security headers (API only serves JSON, so no CSP/frame concerns for HTML)
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));

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
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// MongoDB connection
mongoose
  .connect(process.env.MONGO_URL)
  .then(() => {
    console.log("Connected to MongoDB");
    // Idempotent; runs in the background so startup isn't blocked
    ensureTenantIndexes(mongoose.connection.db).catch((err) =>
      console.warn("[Indexes] ensureTenantIndexes failed:", err.message)
    );
    require("./services/assistant/store").ensureIndexes(mongoose.connection.db).catch((err) =>
      console.warn("[Indexes] assistant indexes failed:", err.message)
    );
    ensureCoreIndexes(mongoose.connection.db).catch((err) =>
      console.warn("[Indexes] ensureCoreIndexes failed:", err.message)
    );
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  });


// Brute-force protection on credential and OTP endpoints (per client IP).
// RATE_LIMIT_SCALE only exists so automated tests can raise the ceilings.
const rlScale = Math.max(1, Number(process.env.RATE_LIMIT_SCALE) || 1);
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20 * rlScale,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { detail: "Too many requests. Please wait a minute and try again." },
});
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15 * rlScale,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { detail: "Too many OTP attempts. Please try again later." },
});
const refreshLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60 * rlScale,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { detail: "Too many requests." },
});
app.use(["/api/auth/login", "/api/auth/register", "/api/auth/forgot-password"], authLimiter);
app.use(
  ["/api/auth/verify-otp", "/api/auth/resend-otp", "/api/auth/reset-password", "/api/users/verify"],
  otpLimiter
);
app.use("/api/auth/refresh", refreshLimiter);

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

app.get("/api/plans", async (req, res, next) => {
  try {
    res.set("Cache-Control", "public, max-age=30");
    res.json(await getPublicPlans(mongoose.connection.db));
  } catch (err) {
    next(err);
  }
});
app.use("/api/billing", require("./routes/billing"));
app.use("/api/webhook", require("./routes/webhook"));
app.use("/api/assistant", require("./routes/assistant"));

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
  basicAuth({
    users: { admin: process.env.ADMIN_PASSWORD },
    challenge: true,
  }),
  serverAdapter.getRouter()
);

startCronJobs();

// Swagger Documentation setup
try {
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

// Health check endpoints
app.get("/api/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    stack: "Node.js/Express",
  });
});

app.get("/health", (req, res) => {
  res.json({ status: "healthy", timestamp: new Date().toISOString() });
});

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
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Pharmalogy API running on port ${PORT}`);
});
