require("dotenv").config();
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const { initConnections } = require("./db/connections");

const app = express();
const PORT = process.env.PORT || 8002;

// Middleware
app.use(
  cors({
    origin: (origin, callback) => callback(null, origin || true),
    credentials: true,
  })
);
app.use(morgan("dev"));
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true }));

// Health Check
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    service: "pharmalogy-admin-backend",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
  });
});

app.get("/api", (req, res) => {
  res.json({
    message: "Pharmalogy Admin Monitoring API",
    version: "1.0.0",
    endpoints: [
      "/api/env/status",
      "/api/dashboard/metrics",
      "/api/dashboard/trends",
      "/api/pharmacies",
      "/api/users",
      "/api/leads",
      "/api/promos",
      "/api/analytics/funnel",
      "/api/analytics/activity-feed",
    ],
  });
});

// Routes
const authRoutes = require("./routes/auth");
const envRoutes = require("./routes/env");
const dashboardRoutes = require("./routes/dashboard");
const pharmaciesRoutes = require("./routes/pharmacies");
const usersRoutes = require("./routes/users");
const leadsRoutes = require("./routes/leads");
const promosRoutes = require("./routes/promos");
const analyticsRoutes = require("./routes/analytics");
const { requireAdminAuth } = require("./middleware/auth");

// Public Auth Endpoints
app.use("/api/auth", authRoutes);

// Public Tracking Endpoints
app.use("/api/track", analyticsRoutes);

// Protected Admin Operations (Requires valid JWT & active session)
app.use("/api/env", requireAdminAuth, envRoutes);
app.use("/api/dashboard", requireAdminAuth, dashboardRoutes);
app.use("/api/pharmacies", requireAdminAuth, pharmaciesRoutes);
app.use("/api/users", requireAdminAuth, usersRoutes);
app.use("/api/leads", requireAdminAuth, leadsRoutes);
app.use("/api/promos", requireAdminAuth, promosRoutes);
app.use("/api/analytics", requireAdminAuth, analyticsRoutes);


// Error Handler
app.use((err, req, res, next) => {
  console.error("[Admin API Error]:", err);
  const status = err.status || 500;
  res.status(status).json({
    error: err.message || "Internal server error",
    status,
    env: err.env || req.dbEnv || "unknown",
  });
});

// Start Server
async function start() {
  console.log("[Admin Backend] Initializing MongoDB connections...");
  await initConnections();

  app.listen(PORT, () => {
    console.log(`[Admin Backend] Server running on http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error("Failed to start Admin Backend:", err);
});
