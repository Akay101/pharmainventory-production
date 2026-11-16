// The shop's local server: the backend's own routes on the local database, plus
// the desktop-only parts (automatic sign-in, device check, backups, shop network).
const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const https = require("https");
const path = require("path");

const WINDOW_HEADER = "x-davadesk-device";
const PREFERRED_PORT = 47810;
const BACKUP_DAYS = 7;
const BACKUP_EVERY_MS = 60 * 60 * 1000;
const WRITE_WATCHDOG_MS = 30 * 1000;

const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");

// One writer at a time. A write request runs in one transaction: a saved bill is the
// whole bill or nothing, and what it changed becomes one unit to send to the cloud.
function createWriteLock() {
  let tail = Promise.resolve();
  return () => {
    let release;
    const turn = new Promise((resolve) => (release = resolve));
    const previous = tail;
    tail = tail.then(() => turn);
    return previous.then(() => release);
  };
}

function writeTransactions(db, acquire) {
  return (req, res, next) => {
    if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return next();
    acquire().then((release) => {
      let finished = false;
      const end = (commit) => {
        if (finished) return;
        finished = true;
        clearTimeout(watchdog);
        try {
          db.endCapture(commit && db._db.inTransaction);
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
      db.beginCapture();
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

async function startServer({ dataDir, backendDir, webDir, dbKey, catalogKey, windowSecret, config, port = PREFERRED_PORT, version = "dev", log = console }) {
  fs.mkdirSync(dataDir, { recursive: true });
  // Upload code writes under the working directory, which must be writable
  process.chdir(dataDir);

  require("./hooks").install(backendDir);

  const { DocDb } = require("./docdb");
  const { Catalog } = require("./catalog");
  const { SyncEngine } = require("./sync");
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
  for (const k of ["GLOBAL_MONGO_URI", "MONGO_URL", "GEMINI_API_KEY", "EMERGENT_LLM_KEY", "REDIS_URL", "BREVO_API_KEY", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "CASHFREE_APP_ID", "CASHFREE_SECRET_KEY"]) delete process.env[k];

  const backend = (rel) => require(path.join(backendDir, rel));
  const express = require("express");
  const app = express();
  app.set("trust proxy", false);
  app.disable("x-powered-by");

  // ---- Sync, licence and the offline catalogue --------------------------------
  const collections = backend("services/desktop/collections");
  db.trackChanges({ collections: new Set(collections.TWO_WAY), counters: collections.COUNTERS });
  const catalog = new Catalog(path.join(dataDir, "catalog.db"), catalogKey);
  require(path.join(__dirname, "stubs", "globalDb.js")).setCatalog(catalog);
  const acquireWriteLock = createWriteLock();
  const withWriteLock = async (fn) => {
    const release = await acquireWriteLock();
    try {
      return await fn();
    } finally {
      release();
    }
  };
  const sync = new SyncEngine({ db, config, withWriteLock, collections, catalog, filesRoot: require("./stubs/files").getRoot(), log });

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

  const { sanitizeInput, apiLimiter } = backend("middleware/security");

  // Pairing proves itself with the code, so it comes before the device check
  const network = lan.create({ db, app, dataDir, sha256, log, getShopName: async () => (await db.collection("pharmacies").findOne({ id: db.getMeta("pharmacy_id") }))?.name || "DavaDesk" });
  app.post("/api/desktop/pair", apiLimiter, express.json(), network.pairRoute);

  app.use("/api", requireDevice);
  app.use("/api", apiLimiter);

  // ---- Status for the Sync Center ---------------------------------------------
  app.get("/api/desktop/status", (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({ version, ...sync.status() });
  });
  app.post("/api/desktop/continue-setup", (req, res) => {
    db.setMeta("catalog_skip", "1");
    res.json({ ok: true });
  });
  app.post("/api/desktop/sync-now", (req, res) => {
    sync.wake();
    res.json({ ok: true });
  });
  app.post("/api/desktop/conflicts/:seq/retry", (req, res) => {
    sync.retryConflict(Number(req.params.seq));
    res.json({ ok: true });
  });
  app.post("/api/desktop/conflicts/:seq/discard", async (req, res) => {
    try {
      await sync.discardConflict(Number(req.params.seq));
      res.json({ ok: true });
    } catch (err) {
      res.status(err.network ? 503 : 500).json({ detail: err.network ? "Connect to the internet to get the cloud's copy back." : err.message });
    }
  });

  // Nothing else works without a valid licence. The licence is signed by the cloud,
  // and this check runs on every request, on this computer and for its counters.
  const requireLicence = (req, res, next) => {
    const problem = sync.accessProblem();
    if (!problem) return next();
    res.status(403).json({ code: "LICENCE_REQUIRED", problem, detail: "Please sign in with an active DavaDesk subscription." });
  };
  app.use("/api", requireLicence);
  app.use("/files", requireDevice, requireLicence, express.static(require("./stubs/files").getRoot(), { fallthrough: false, index: false }));

  // ---- Features that live in the cloud ---------------------------------------
  // Forwarded with a normal API token, so the cloud applies the same checks as for
  // a browser. Keys for AI, payments and email stay on the server.
  const needsInternet = (req, res) => res.status(503).json({ code: "NEEDS_INTERNET", detail: "This needs internet. It will work again once you're back online." });
  const forward = (flushFirst) => async (req, res, next) => {
    if (!sync.online) return needsInternet(req, res);
    try {
      if (flushFirst) await sync.flush();
      const token = await sync.cloudToken();
      const target = new URL(req.originalUrl, config.cloudUrl);
      const lib = target.protocol === "https:" ? https : http;
      const headers = { ...req.headers, host: target.host, authorization: `Bearer ${token}` };
      for (const h of ["x-davadesk-device", "cookie", "origin", "referer"]) delete headers[h];
      const upstream = lib.request(target, { method: req.method, headers }, (reply) => {
        const out = { ...reply.headers };
        delete out["set-cookie"];
        res.writeHead(reply.statusCode, out);
        reply.pipe(res);
      });
      upstream.on("error", () => {
        if (!res.headersSent) needsInternet(req, res);
        else res.destroy();
      });
      req.pipe(upstream);
    } catch (err) {
      if (err.network) return needsInternet(req, res);
      next(err);
    }
  };
  const online = forward(false);
  const onlineAfterFlush = forward(true);
  // Reads that also work from the local copy when offline
  const onlineWrites = (req, res, next) => (req.method === "GET" && !sync.online ? next() : online(req, res, next));
  for (const route of ["/api/credits", "/api/support", "/api/billing", "/api/plans", "/api/migrate"]) app.use(route, online);
  // The assistant reads the shop's data in the cloud, so waiting work goes up first
  app.use("/api/assistant", onlineAfterFlush);
  // Data import runs as background jobs in the cloud, and its records sync down after.
  // Matching reads the shop's stock there, so waiting work goes up first.
  app.use("/api/imports", onlineAfterFlush);
  // Until the offline catalogue is complete, the cloud gives the full results
  const catalogPending = () => sync.online && sync.catalogState.state !== "ready";
  app.get(["/api/medicines/search", "/api/bills/doctors"], (req, res, next) => (catalogPending() ? online(req, res, next) : next()));
  app.get("/api/suppliers", (req, res, next) => (catalogPending() && req.query.include_global ? online(req, res, next) : next()));
  for (const route of ["/api/users", "/api/pharmacy", "/api/broadcasts"]) app.use(route, onlineWrites);
  for (const route of ["/api/purchases/scan-image", "/api/purchases/scan-bill", "/api/bills/scan-product", "/api/settings/request-lock-otp", "/api/settings/verify-and-update-lock"]) app.post(route, online);
  app.get("/api/purchases/scan-status/:id", online);
  app.use("/api/medicines/enrich", (req, res, next) => (sync.online ? online(req, res, next) : res.json({ salt_composition: "", manufacturer: "" })));
  app.use("/api/bills/:bill_id/share", onlineAfterFlush);
  app.use("/api/bills/:bill_id/email", onlineAfterFlush);
  app.use("/api/bills/:bill_id/send-email", onlineAfterFlush);
  app.get("/api/dashboard/ai-tips", (req, res, next) => (sync.online ? online(req, res, next) : res.json({ tips: [] })));
  const authLocal = new Set(["/refresh", "/logout", "/me"]);
  app.use("/api/auth", (req, res, next) => (authLocal.has(req.path) ? next() : online(req, res, next)));

  // ---- From here on, requests are answered by this computer ---------------------
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true, limit: "10mb" }));
  app.use(sanitizeInput);
  app.use("/api", writeTransactions(db, acquireWriteLock));

  // The shop's choice on a change the cloud held back. Inside the write transaction,
  // so whatever it changes is sent to the cloud like any other edit.
  app.post("/api/desktop/review/:id", (req, res) => {
    try {
      sync.resolveReview(req.params.id, String(req.body?.choice || ""), { quantity: req.body?.quantity });
      sync.wake();
      res.json({ ok: true });
    } catch (err) {
      res.status(err.status || 500).json({ detail: err.message });
    }
  });

  const tokens = backend("services/auth/tokens");
  app.post("/api/auth/refresh", async (req, res, next) => {
    try {
      const user = await db.collection("users").findOne({ id: db.getMeta("user_id") });
      if (!user) return res.status(401).json({ code: "NO_SESSION", detail: "Not signed in" });
      // The pharmacy this computer is signed in to (an account can have several)
      res.json({ token: tokens.signAccess(user, { pid: db.getMeta("pharmacy_id") || null }) });
    } catch (err) {
      next(err);
    }
  });
  app.post("/api/auth/logout", (req, res) => res.json({ message: "Logged out successfully" }));

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
    "/api/shortbook": "routes/shortbook",
  };
  for (const [mount, file] of Object.entries(routes)) app.use(mount, backend(file));
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

  sync.start();

  const stop = async () => {
    sync.stop();
    await network.disable().catch(() => {});
    await new Promise((resolve) => {
      server.close(resolve);
      if (server.closeAllConnections) server.closeAllConnections();
    });
    backupNow();
    catalog.close();
    db.close();
  };

  return { port: server.address().port, app, db, network, sync, catalog, stop, windowHeader: WINDOW_HEADER };
}

module.exports = { startServer, WINDOW_HEADER };
