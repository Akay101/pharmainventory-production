// The shop's local server: the backend's own routes on the local database, plus
// the desktop-only parts (automatic sign-in, device check, backups, shop network).
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const WINDOW_HEADER = "x-davadesk-device";
const PREFERRED_PORT = 47810;
const BACKUP_DAYS = 7;
const BACKUP_EVERY_MS = 60 * 60 * 1000;
const WRITE_WATCHDOG_MS = 30 * 1000;

const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");

// One write request at a time, each in one transaction: a saved bill is the
// whole bill or nothing, and a failure part-way leaves no stock or debt change.
function writeTransactions(db) {
  let tail = Promise.resolve();
  return (req, res, next) => {
    if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return next();
    let release;
    const turn = new Promise((resolve) => (release = resolve));
    const previous = tail;
    tail = tail.then(() => turn);
    previous.then(() => {
      let finished = false;
      const end = (commit) => {
        if (finished) return;
        finished = true;
        clearTimeout(watchdog);
        try {
          if (db._db.inTransaction) db._db.exec(commit ? "COMMIT" : "ROLLBACK");
        } catch (err) {
          console.error("[LocalDB] ending transaction:", err.message);
        }
        release();
      };
      const watchdog = setTimeout(() => {
        console.error(`[LocalDB] ${req.method} ${req.originalUrl} held the write lock too long; rolled back`);
        end(false);
      }, WRITE_WATCHDOG_MS);
      res.on("finish", () => end(res.statusCode < 500));
      res.on("close", () => end(res.writableFinished && res.statusCode < 500));
      db._db.exec("BEGIN IMMEDIATE");
      next();
    });
  };
}

// Daily copies of the encrypted file, refreshed hourly while data keeps changing
function startBackups(db, dataDir, dbFile) {
  const dir = path.join(dataDir, "backups");
  fs.mkdirSync(dir, { recursive: true });
  let dirty = false;
  db.onChange(() => (dirty = true));
  const run = () => {
    if (!dirty || db._db.inTransaction) return;
    try {
      db._db.pragma("wal_checkpoint(TRUNCATE)");
      fs.copyFileSync(dbFile, path.join(dir, `davadesk-${new Date().toISOString().slice(0, 10)}.db`));
      dirty = false;
      const old = fs.readdirSync(dir).filter((f) => f.endsWith(".db")).sort().slice(0, -BACKUP_DAYS);
      old.forEach((f) => fs.rmSync(path.join(dir, f), { force: true }));
    } catch (err) {
      console.error("[Backup]", err.message);
    }
  };
  const timer = setInterval(run, BACKUP_EVERY_MS);
  timer.unref();
  return run;
}

// A shop that opens the app for the first time gets a working pharmacy at once.
// Name and address can be changed in Settings whenever the owner likes.
async function ensureShop(db) {
  const users = db.collection("users");
  const existing = await users.findOne({ is_primary_admin: true });
  if (existing) return existing;
  const bcrypt = require("bcryptjs");
  const { v4: uuidv4 } = require("uuid");
  const now = new Date().toISOString();
  const pharmacyId = uuidv4();
  await db.collection("pharmacies").insertOne({
    id: pharmacyId,
    name: "My Pharmacy",
    location: "",
    license_no: null,
    years_old: null,
    logo_url: null,
    subscription: {
      plan: "ADVANCED",
      kind: "PAID",
      status: "ACTIVE",
      starts_at: now,
      ends_at: "2099-12-31T23:59:59.000Z",
      trial_used: true,
    },
    created_at: now,
  });
  const user = {
    id: uuidv4(),
    name: "Owner",
    email: "owner@davadesk.local",
    mobile: "",
    // Nobody signs in with this; the app signs in for the owner
    password_hash: await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 10),
    role: "ADMIN",
    pharmacy_id: pharmacyId,
    is_primary_admin: true,
    verified: true,
    token_version: 0,
    image_url: null,
    onboarding_tour: { status: "skipped", version: 1, at: now },
    created_at: now,
  };
  await users.insertOne(user);
  return user;
}

async function startServer({ dataDir, backendDir, webDir, dbKey, windowSecret, port = PREFERRED_PORT, version = "dev", log = console }) {
  fs.mkdirSync(dataDir, { recursive: true });
  // Upload code writes under the working directory, which must be writable
  process.chdir(dataDir);

  require("./hooks").install(backendDir);

  const { DocDb } = require("./docdb");
  const dbFile = path.join(dataDir, "davadesk.db");
  const db = new DocDb(dbFile, dbKey);
  require("mongoose").connection.db = db;
  require("./stubs/files").setRoot(path.join(dataDir, "files"));

  // Backend settings. Nothing reaches cloud services from here, and any
  // credentials from a developer's shell stay out of this process.
  let jwtSecret = db.getMeta("jwt_secret");
  if (!jwtSecret) {
    jwtSecret = crypto.randomBytes(48).toString("hex");
    db.setMeta("jwt_secret", jwtSecret);
  }
  process.env.JWT_SECRET = jwtSecret;
  process.env.NODE_ENV = "production";
  process.env.DAVADESK_DESKTOP = "true";
  process.env.RATE_LIMIT_SCALE = "10";
  for (const k of ["GLOBAL_MONGO_URI", "MONGO_URL", "GEMINI_API_KEY", "EMERGENT_LLM_KEY", "REDIS_URL", "BREVO_API_KEY", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "CASHFREE_APP_ID", "CASHFREE_SECRET_KEY"]) delete process.env[k];

  const backend = (rel) => require(path.join(backendDir, rel));
  const express = require("express");
  const app = express();
  app.set("trust proxy", false);
  app.disable("x-powered-by");

  const owner = await ensureShop(db);
  for (const ensure of [
    () => backend("services/search/indexes").ensureTenantIndexes(db),
    () => backend("services/billing/indexes").ensureCoreIndexes(db),
    () => backend("routes/shortbook").ensureIndexes(db),
    () => backend("routes/broadcasts").ensureIndexes(db),
  ]) {
    await ensure().catch((err) => log.warn("[Indexes]", err.message));
  }
  db.purgeExpired();

  // ---- Who may call this server --------------------------------------------
  const lan = require("./lan");
  const isLoopback = (req) => ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress);
  const trustedDevice = async (req) => {
    const presented = req.headers[WINDOW_HEADER];
    if (!presented) return false;
    if (isLoopback(req) && presented === windowSecret) return true;
    return !!(await db.collection("desktop_devices").findOne({ token_hash: sha256(presented), revoked_at: null }));
  };
  const requireDevice = async (req, res, next) => {
    try {
      if (await trustedDevice(req)) return next();
      res.status(401).json({ detail: "This computer isn't connected to this shop.", code: "DEVICE_NOT_PAIRED" });
    } catch (err) {
      next(err);
    }
  };

  app.get(["/health", "/api/health"], (req, res) => res.json({ status: "healthy", app: "davadesk", version }));

  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true, limit: "10mb" }));
  const { sanitizeInput, apiLimiter } = backend("middleware/security");

  // Pairing proves itself with the code, so it comes before the device check
  const network = lan.create({ db, app, dataDir, sha256, log, getShopName: async () => (await db.collection("pharmacies").findOne({ id: owner.pharmacy_id }))?.name || "DavaDesk" });
  app.post("/api/desktop/pair", apiLimiter, network.pairRoute);

  app.use("/api", requireDevice);
  app.use("/files", requireDevice, express.static(require("./stubs/files").getRoot(), { fallthrough: false, index: false }));
  app.use(sanitizeInput);
  app.use("/api", apiLimiter);
  app.use("/api", writeTransactions(db));

  // ---- Desktop-only endpoints ----------------------------------------------
  const tokens = backend("services/auth/tokens");
  app.post("/api/auth/refresh", async (req, res, next) => {
    try {
      const user = await db.collection("users").findOne({ id: owner.id });
      res.json({ token: tokens.signAccess(user) });
    } catch (err) {
      next(err);
    }
  });
  app.post("/api/auth/logout", (req, res) => res.json({ message: "Logged out successfully" }));
  app.get("/api/desktop/info", (req, res) => res.json({ version, desktop: true }));

  // ---- Features that only work online --------------------------------------
  const needsInternet = (req, res) => res.status(503).json({ code: "NEEDS_INTERNET", detail: "This feature needs internet and isn't available in this version of the desktop app." });
  for (const route of ["/api/assistant", "/api/credits", "/api/support", "/api/migrate", "/api/public"]) app.use(route, needsInternet);
  for (const route of ["/api/purchases/scan-image", "/api/purchases/scan-bill", "/api/bills/scan-product", "/api/medicines/ai-enrich"]) app.post(route, needsInternet);
  app.get("/api/purchases/scan-status/:id", needsInternet);
  app.get("/api/dashboard/ai-tips", (req, res) => res.json({ tips: [] }));

  // ---- The backend's own routes --------------------------------------------
  const routes = {
    "/api/auth": "routes/auth",
    "/api/users": "routes/users",
    "/api/suppliers": "routes/suppliers",
    "/api/products": "routes/products",
    "/api/purchases": "routes/purchases",
    "/api/inventory": "routes/inventory",
    "/api/customers": "routes/customers",
    "/api/bills": "routes/bills",
    "/api/dashboard": "routes/dashboard",
    "/api/medicines": "routes/medicines",
    "/api/pharmacy": "routes/pharmacy",
    "/api/activities": "routes/activities",
    "/api/settings": "routes/settings",
    "/api/expiry": "routes/expiry",
    "/api/returns": "routes/returns",
    "/api/reminders": "routes/reminders",
    "/api/notifications": "routes/notifications",
    "/api/broadcasts": "routes/broadcasts",
    "/api/billing": "routes/billing",
    "/api/shortbook": "routes/shortbook",
  };
  for (const [mount, file] of Object.entries(routes)) app.use(mount, backend(file));
  app.get("/api/plans", (req, res) => res.json({ plans: [] }));
  app.use("/api", (req, res) => res.status(404).json({ detail: "Not found" }));

  // ---- The React app --------------------------------------------------------
  if (webDir) {
    app.use(express.static(webDir, { index: false, maxAge: "1y", immutable: true, setHeaders: (res, file) => { if (file.endsWith(".html")) res.setHeader("Cache-Control", "no-cache"); } }));
    app.get("*", (req, res) => {
      res.setHeader("Cache-Control", "no-cache");
      res.sendFile(path.join(webDir, "index.html"));
    });
  }

  app.use((err, req, res, next) => {
    const status = err.status || err.statusCode || 500;
    if (status >= 500 && !err.onlineOnly) log.error(`[API] ${req.method} ${req.originalUrl}:`, err);
    res.status(status).json({
      detail: status < 500 || err.onlineOnly ? err.message : "Something went wrong. Please try again.",
      ...(err.onlineOnly ? { code: "NEEDS_INTERNET" } : {}),
      ...(err.code && typeof err.code === "string" && status < 500 ? { code: err.code } : {}),
    });
  });

  const backupNow = startBackups(db, dataDir, dbFile);

  // Always loopback: nothing on the shop network reaches this listener
  const listen = (p) =>
    new Promise((resolve, reject) => {
      const s = app.listen(p, "127.0.0.1", () => resolve(s));
      s.once("error", reject);
    });
  let server;
  try {
    server = await listen(port);
  } catch (err) {
    if (err.code !== "EADDRINUSE") throw err;
    server = await listen(0);
  }
  server.requestTimeout = 120 * 1000;

  const stop = async () => {
    await network.disable().catch(() => {});
    await new Promise((resolve) => {
      server.close(resolve);
      if (server.closeAllConnections) server.closeAllConnections();
    });
    backupNow();
    db.close();
  };

  return { port: server.address().port, app, db, network, owner, stop, windowHeader: WINDOW_HEADER };
}

module.exports = { startServer, WINDOW_HEADER };
