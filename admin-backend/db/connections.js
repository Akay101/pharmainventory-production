const { MongoClient } = require("mongodb");
const { ensureSshTunnel, LOCAL_TUNNEL_PORT } = require("./tunnel");

const DEV_MONGO_URL = process.env.DEV_MONGO_URL;
const PROD_DIRECT_URL = process.env.PROD_MONGO_URL;
const PROD_TUNNEL_URL = process.env.PROD_TUNNEL_URL;

// One host and no replicaSet: talk to that host directly. Without this the
// driver follows the replica set's own member address (localhost:27017),
// which doesn't exist on the far side of an SSH tunnel or Docker bridge.
const directOpts = (url) => {
  const hosts = String(url || "").replace(/^mongodb:\/\/([^@/]*@)?/, "").split(/[/?]/)[0];
  return /^mongodb:\/\//.test(url) && !hosts.includes(",") && !/[?&]replicaSet=/.test(url) ? { directConnection: true } : {};
};

const connectionPool = {
  dev: {
    client: null,
    db: null,
    status: "disconnected",
    latencyMs: null,
    error: null,
    lastChecked: null,
    url: DEV_MONGO_URL,
    name: "Development (Atlas Cloud)",
    dbName: "pharmalogy-app-db",
    mode: "cloud",
  },
  prod: {
    client: null,
    db: null,
    status: "disconnected",
    latencyMs: null,
    error: null,
    lastChecked: null,
    url: PROD_DIRECT_URL,
    name: "Production (Lightsail Cluster)",
    dbName: "pharmalogy_prod_db",
    mode: "direct",
  },
};

async function tryClientConnect(url, timeoutMs = 3500) {
  if (!url) throw new Error("Database URL is not defined in environment");
  const client = new MongoClient(url, {
    serverSelectionTimeoutMS: timeoutMs,
    connectTimeoutMS: timeoutMs,
    maxPoolSize: 20,
    ...directOpts(url),
  });
  await client.connect();
  return client;
}

async function connectTo(envKey) {
  const target = connectionPool[envKey];
  if (!target) return;

  target.status = "connecting";
  const startTime = Date.now();

  if (envKey === "dev") {
    if (!target.url) {
      target.status = "unreachable";
      target.error = "DEV_MONGO_URL is not set in environment (.env)";
      target.lastChecked = new Date().toISOString();
      console.warn(`[DB] Error: DEV_MONGO_URL is not defined in .env`);
      return;
    }
    try {
      const client = await tryClientConnect(target.url, 5000);
      target.client = client;
      target.db = client.db(target.dbName);
      target.latencyMs = Date.now() - startTime;
      target.status = "connected";
      target.error = null;
      target.lastChecked = new Date().toISOString();
      console.log(`[DB] Connected to DEV database (${target.latencyMs}ms)`);
    } catch (err) {
      target.status = "unreachable";
      target.error = err.message;
      target.latencyMs = null;
      target.lastChecked = new Date().toISOString();
      console.warn(`[DB] Could not connect to DEV database: ${err.message}`);
    }
    return;
  }

  // envKey === 'prod'
  // Strategy 1: Try direct connection (works when deployed on server/Docker)
  if (PROD_DIRECT_URL) {
    try {
      console.log(`[DB] Attempting direct connection to PROD database...`);
      const client = await tryClientConnect(PROD_DIRECT_URL, 2000);
      target.client = client;
      target.db = client.db(target.dbName);
      target.latencyMs = Date.now() - startTime;
      target.status = "connected";
      target.error = null;
      target.mode = "direct";
      target.lastChecked = new Date().toISOString();
      console.log(`[DB] Connected directly to PROD database (${target.latencyMs}ms)`);
      return;
    } catch (directErr) {
      console.log(`[DB] Direct connection to PROD unreachable (${directErr.message}). Switching to auto-tunnel...`);
    }
  }

  // Strategy 2: Try SSH Tunnel to Lightsail
  if (PROD_TUNNEL_URL) {
    try {
      const tunnelReady = await ensureSshTunnel();
      if (tunnelReady) {
        const client = await tryClientConnect(PROD_TUNNEL_URL, 4000);
        target.client = client;
        target.db = client.db(target.dbName);
        target.latencyMs = Date.now() - startTime;
        target.status = "connected";
        target.error = null;
        target.mode = "tunnel";
        target.lastChecked = new Date().toISOString();
        console.log(`[DB] Successfully connected to PROD database via Lightsail SSH tunnel (${target.latencyMs}ms)!`);
        return;
      }
    } catch (tunnelErr) {
      console.warn(`[DB] Tunnel connection to PROD failed: ${tunnelErr.message}`);
      target.error = `Direct: unreachable; Tunnel: ${tunnelErr.message}`;
    }
  }

  target.status = "unreachable";
  target.latencyMs = null;
  target.lastChecked = new Date().toISOString();
  if (!PROD_DIRECT_URL && !PROD_TUNNEL_URL) {
    target.error = "Neither PROD_MONGO_URL nor PROD_TUNNEL_URL is defined in .env";
  }
}

async function initConnections() {
  await Promise.allSettled([connectTo("dev"), connectTo("prod")]);
}

async function checkPing(envKey) {
  const target = connectionPool[envKey];
  if (!target) return null;

  if (!target.client || target.status !== "connected") {
    await connectTo(envKey);
    return {
      connected: target.status === "connected",
      latencyMs: target.latencyMs,
      status: target.status,
      error: target.error,
      mode: target.mode,
      lastChecked: target.lastChecked,
    };
  }

  const start = Date.now();
  try {
    await target.db.command({ ping: 1 });
    target.latencyMs = Date.now() - start;
    target.status = "connected";
    target.error = null;
    target.lastChecked = new Date().toISOString();
  } catch (err) {
    target.status = "unreachable";
    target.error = err.message;
    target.latencyMs = null;
    target.lastChecked = new Date().toISOString();
  }

  return {
    connected: target.status === "connected",
    latencyMs: target.latencyMs,
    status: target.status,
    error: target.error,
    mode: target.mode,
    lastChecked: target.lastChecked,
  };
}

function getDb(env = "dev") {
  const key = env.toLowerCase() === "prod" || env.toLowerCase() === "production" ? "prod" : "dev";
  const target = connectionPool[key];

  if (!target.db || target.status !== "connected") {
    const errorMsg =
      key === "prod"
        ? `Production database is currently unreachable. Error: ${target.error || "Connection timed out"}`
        : `Development database is not connected: ${target.error || "Unknown error"}`;
    const err = new Error(errorMsg);
    err.status = 503;
    err.env = key;
    throw err;
  }

  return { db: target.db, env: key };
}

function getAdminDb() {
  // Use dev Atlas DB as authoritative admin auth store, fallback to prod
  if (connectionPool.dev && connectionPool.dev.db && connectionPool.dev.status === "connected") {
    return connectionPool.dev.db;
  }
  if (connectionPool.prod && connectionPool.prod.db && connectionPool.prod.status === "connected") {
    return connectionPool.prod.db;
  }
  // If neither connected yet, attempt to get dev
  const { db } = getDb("dev");
  return db;
}

// The global catalogues (global_medicines, global_doctors,
// global_distributors) are one shared database next to production's.
// GLOBAL_MONGO_URI wins when set (same variable as the main API); otherwise
// the production connection's server is used.
let globalClient = null;
let globalConnecting = null;
async function getGlobalDb() {
  if (process.env.GLOBAL_MONGO_URI) {
    if (!globalClient) {
      globalConnecting =
        globalConnecting ||
        tryClientConnect(process.env.GLOBAL_MONGO_URI, 5000)
          .then((c) => (globalClient = c))
          .finally(() => (globalConnecting = null));
      await globalConnecting;
    }
    return globalClient.db(process.env.GLOBAL_DB_NAME || "global_collections");
  }
  const prod = connectionPool.prod;
  if (!prod.client || prod.status !== "connected") await connectTo("prod");
  if (!prod.client || prod.status !== "connected") {
    const err = new Error(`Global data needs the production database, which is unreachable: ${prod.error || "not connected"}`);
    err.status = 503;
    throw err;
  }
  return prod.client.db(process.env.GLOBAL_DB_NAME || "global_collections");
}

function getStatus() {
  return {
    dev: {
      name: connectionPool.dev.name,
      connected: connectionPool.dev.status === "connected",
      status: connectionPool.dev.status,
      latencyMs: connectionPool.dev.latencyMs,
      error: connectionPool.dev.error,
      dbName: connectionPool.dev.dbName,
      mode: connectionPool.dev.mode,
      lastChecked: connectionPool.dev.lastChecked,
    },
    prod: {
      name: connectionPool.prod.name,
      connected: connectionPool.prod.status === "connected",
      status: connectionPool.prod.status,
      latencyMs: connectionPool.prod.latencyMs,
      error: connectionPool.prod.error,
      dbName: connectionPool.prod.dbName,
      mode: connectionPool.prod.mode,
      lastChecked: connectionPool.prod.lastChecked,
    },
  };
}

// Middleware to resolve active environment per request
function resolveDbEnv(req, res, next) {
  const headerEnv = req.headers["x-admin-env"];
  const queryEnv = req.query.env;
  const envKey =
    headerEnv === "prod" || headerEnv === "production" || queryEnv === "prod" || queryEnv === "production"
      ? "prod"
      : "dev";

  req.dbEnv = envKey;
  req.dbTarget = connectionPool[envKey];

  try {
    const { db } = getDb(envKey);
    req.db = db;
    next();
  } catch (err) {
    // If prod was requested but failed, attempt fallback to dev if requested
    if (envKey === "prod" && req.query.fallback === "true") {
      try {
        const { db } = getDb("dev");
        req.db = db;
        req.dbEnv = "dev";
        req.fallbackNotice = "Production unreachable; defaulted to Dev.";
        return next();
      } catch (fallbackErr) {
        return next(fallbackErr);
      }
    }
    return res.status(503).json({
      error: err.message,
      env: envKey,
      status: req.dbTarget.status,
      hint:
        envKey === "prod"
          ? "Production database requires SSH tunnel or VPC network. Auto-tunneling attempted."
          : "Please check your network and Mongo URI configuration.",
    });
  }
}

module.exports = {
  initConnections,
  checkPing,
  getDb,
  getAdminDb,
  getGlobalDb,
  getStatus,
  resolveDbEnv,
};

