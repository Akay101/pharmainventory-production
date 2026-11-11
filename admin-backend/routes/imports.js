// Data imports for a pharmacy, run by the DavaDesk team. The import engine lives
// in the main backend (it reuses its product matching), so this forwards each
// request there with the service token, the chosen pharmacy and who is acting.
//
// Settings, per environment (dev / prod, as picked in the panel):
//   MAIN_API_URL_DEV, MAIN_API_URL_PROD          e.g. http://localhost:8001
//   IMPORT_SERVICE_TOKEN_DEV, IMPORT_SERVICE_TOKEN_PROD (or one IMPORT_SERVICE_TOKEN)
//     the same value as IMPORT_SERVICE_TOKEN in that main backend's .env
const express = require("express");
const http = require("http");
const https = require("https");
const { requireRole } = require("../middleware/auth");
const { resolveDbEnv } = require("../db/connections");
const { audit } = require("../services/audit");

const router = express.Router();
router.use(resolveDbEnv);
router.use(requireRole("SUPERADMIN", "ADMIN", "OPERATOR"));

const target = (env) => {
  const key = env === "prod" ? "PROD" : "DEV";
  const base = process.env[`MAIN_API_URL_${key}`];
  const token = process.env[`IMPORT_SERVICE_TOKEN_${key}`] || process.env.IMPORT_SERVICE_TOKEN;
  return base && token ? { base: base.replace(/\/+$/, ""), token } : null;
};

const AUDITED = [
  [/^\/[^/]+\/commit$/, "import.commit"],
  [/^\/[^/]+\/undo$/, "import.undo"],
  [/^\/[^/]+$/, "import.discard", "DELETE"],
];

router.all("/*", (req, res) => {
  const t = target(req.dbEnv);
  if (!t) {
    return res.status(503).json({ error: `Imports aren't set up for ${req.dbEnv}. Add MAIN_API_URL_${req.dbEnv === "prod" ? "PROD" : "DEV"} and the import token to the admin backend's .env.` });
  }
  const pharmacyId = String(req.headers["x-pharmacy-id"] || req.query.pharmacy_id || "").trim();
  if (!pharmacyId) return res.status(400).json({ error: "Choose a pharmacy first" });

  const url = new URL(`${t.base}/api/imports${req.path === "/" ? "" : req.path}`);
  for (const [k, v] of Object.entries(req.query)) if (k !== "pharmacy_id" && k !== "env") url.searchParams.set(k, String(v));

  // JSON bodies were already parsed by express.json; anything else (the file upload) streams through
  const json = req.is("application/json") ? Buffer.from(JSON.stringify(req.body ?? {})) : null;
  const headers = {
    "x-import-token": t.token,
    "x-pharmacy-id": pharmacyId,
    "x-admin-email": req.adminUser?.email || "unknown",
    "x-admin-name": req.adminUser?.name || "",
    accept: req.headers.accept || "application/json",
  };
  if (json) {
    headers["content-type"] = "application/json";
    headers["content-length"] = json.length;
  } else if (req.headers["content-type"]) {
    headers["content-type"] = req.headers["content-type"];
    if (req.headers["content-length"]) headers["content-length"] = req.headers["content-length"];
  }

  const lib = url.protocol === "https:" ? https : http;
  const upstream = lib.request(url, { method: req.method, headers, timeout: 120000 }, (r) => {
    const pass = {};
    for (const h of ["content-type", "content-disposition"]) if (r.headers[h]) pass[h] = r.headers[h];
    res.writeHead(r.statusCode, pass);
    r.pipe(res);
    if (r.statusCode < 300) {
      const hit = AUDITED.find(([re, , method]) => re.test(req.path) && (!method || method === req.method) && (method || req.method === "POST"));
      if (hit) audit(req, hit[1], { pharmacy_id: pharmacyId, import_id: req.path.split("/")[1] });
    }
  });
  upstream.on("timeout", () => upstream.destroy(new Error("timeout")));
  upstream.on("error", (err) => {
    if (res.headersSent) return res.destroy();
    res.status(502).json({ error: `Couldn't reach the main backend (${err.message}).` });
  });
  if (json) upstream.end(json);
  else req.pipe(upstream);
});

module.exports = router;
