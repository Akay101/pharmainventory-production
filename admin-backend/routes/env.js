const express = require("express");
const router = express.Router();
const { getStatus, checkPing } = require("../db/connections");

// GET /api/env/status - Return connection health for both environments
router.get("/status", (req, res) => {
  const status = getStatus();
  res.json({
    status,
    activeEnv: req.headers["x-admin-env"] || "dev",
    timestamp: new Date().toISOString(),
  });
});

// POST /api/env/ping - Re-check connection and ping latency
router.post("/ping", async (req, res) => {
  const { env } = req.body;
  const targetEnv = env === "prod" || env === "production" ? "prod" : "dev";
  const pingResult = await checkPing(targetEnv);
  const status = getStatus();

  res.json({
    targetEnv,
    pingResult,
    status,
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
