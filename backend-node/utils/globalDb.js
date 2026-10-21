const mongoose = require("mongoose");
const { ensureSshTunnel, LOCAL_TUNNEL_PORT } = require("./tunnel");

let globalClient = null;
let connectingPromise = null;
let isGlobalConnectionAttempted = false;

// Fast in-memory search cache (15-minute TTL, max 2000 entries)
const searchCache = new Map();
const SEARCH_CACHE_TTL = 15 * 60 * 1000;
const MAX_CACHE_ENTRIES = 2000;

function getCached(key) {
  const item = searchCache.get(key);
  if (!item) return null;
  if (Date.now() > item.expiresAt) {
    searchCache.delete(key);
    return null;
  }
  return item.data;
}

function setCached(key, data) {
  if (searchCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = searchCache.keys().next().value;
    searchCache.delete(oldestKey);
  }
  searchCache.set(key, { data, expiresAt: Date.now() + SEARCH_CACHE_TTL });
}

function clearCachePattern(prefix) {
  if (!prefix) {
    searchCache.clear();
    return;
  }
  for (const key of searchCache.keys()) {
    if (key.startsWith(prefix)) {
      searchCache.delete(key);
    }
  }
}

// Reconnect backoff after a failed or closed connection: 5s, 10s, 20s ... capped at 5 min.
// Retries are triggered lazily by the next request that needs the global DB.
const RETRY_BASE_MS = 5000;
const RETRY_MAX_MS = 5 * 60 * 1000;
const FIRST_CONNECT_TRIES = 3; // ~12s total before the first fallback
let failedAttempts = 0;
let nextRetryAt = 0;
const connectListeners = [];

// Register a callback run after every successful (re)connect, e.g. to flush
// results that were computed from the fallback DB.
function onGlobalConnect(fn) {
  connectListeners.push(fn);
}

// Background connection to Centralized Global Collections (Prod DB)
function initBackgroundGlobalClient() {
  if (globalClient || connectingPromise) return connectingPromise;
  if (Date.now() < nextRetryAt) return null;

  const globalUri = process.env.GLOBAL_MONGO_URI;
  if (!globalUri) {
    if (!isGlobalConnectionAttempted) {
      console.warn("[Global DB] GLOBAL_MONGO_URI is not set in environment (.env). Skipping global DB connection.");
    }
    isGlobalConnectionAttempted = true;
    nextRetryAt = Infinity;
    return null;
  }
  // The very first connect gets a longer window: the first hop may go through
  // an SSH tunnel to another region, which can take several seconds to open.
  const tries = isGlobalConnectionAttempted ? 1 : FIRST_CONNECT_TRIES;
  isGlobalConnectionAttempted = true;

  connectingPromise = (async () => {
    let client;
    try {
      // Auto-establish SSH tunnel if targeting local tunnel port
      if (globalUri.includes("127.0.0.1") || globalUri.includes("localhost")) {
        await ensureSshTunnel().catch((tErr) => {
          console.warn("[Global DB] SSH tunnel check note:", tErr.message);
        });
      }

      for (let i = 1; ; i++) {
        // Server selection stays short so queries fail fast (and fall back)
        // during an outage; the per-socket connect timeout is generous.
        client = new mongoose.mongo.MongoClient(globalUri, {
          maxPoolSize: 20,
          minPoolSize: 1,
          serverSelectionTimeoutMS: 4000,
          connectTimeoutMS: 10000,
        });
        try {
          await client.connect();
          break;
        } catch (err) {
          client.close().catch(() => {});
          client = null;
          if (i >= tries) throw err;
        }
      }

      globalClient = client;
      failedAttempts = 0;
      nextRetryAt = 0;
      clearCachePattern(); // Flush cache on successful connect
      for (const fn of connectListeners) {
        try {
          fn();
        } catch (e) {}
      }
      console.log(
        "✅ Connected to Centralized Global Collections (Prod DB - 4.09L+ Medicines, 87K+ Distributors, 39K+ Doctors)"
      );

      // Driver v6 emits topologyClosed (not close) on client.close(); a
      // server outage is retried by the driver itself and doesn't land here.
      const onClosed = () => {
        if (globalClient === client) globalClient = null;
      };
      client.on("topologyClosed", onClosed);
      client.on("close", onClosed);
    } catch (err) {
      failedAttempts++;
      const delay = Math.min(RETRY_BASE_MS * 2 ** (failedAttempts - 1), RETRY_MAX_MS);
      nextRetryAt = Date.now() + delay;
      console.warn(
        `⚠️ Centralized global DB connection fallback to primary Atlas DB (attempt ${failedAttempts}, retrying in ${Math.round(delay / 1000)}s):`,
        err.message
      );
      globalClient = null;
      if (client) client.close().catch(() => {});
    } finally {
      connectingPromise = null;
    }
  })();

  return connectingPromise;
}

// Trigger connection immediately on load. Requests wait for this first
// attempt only; later retries run in the background while requests use the
// fallback DB, so a slow reconnect never stalls a search.
const initialConnection = initBackgroundGlobalClient();

function getGlobalDb() {
  if (globalClient) {
    return globalClient.db("global_collections");
  }

  // Kick off a background reconnect if the backoff window has passed
  initBackgroundGlobalClient();

  // Fast direct fallback to Primary Mongoose connection DB (pharmalogy-app-db)
  if (mongoose.connection && mongoose.connection.db) {
    return mongoose.connection.db;
  }

  try {
    const primaryClient = mongoose.connection.getClient();
    if (primaryClient) {
      const dbName = mongoose.connection.name || "pharmalogy-app-db";
      return primaryClient.db(dbName);
    }
  } catch (err) {}

  throw new Error("No MongoDB connection available for global collections");
}

async function getGlobalMedicinesCollection() {
  await initialConnection;
  const db = getGlobalDb();
  return db.collection("global_medicines");
}

async function getGlobalDoctorsCollection() {
  await initialConnection;
  const db = getGlobalDb();
  return db.collection("global_doctors");
}

async function getGlobalDistributorsCollection() {
  await initialConnection;
  const db = getGlobalDb();
  return db.collection("global_distributors");
}

module.exports = {
  getGlobalDb,
  getGlobalMedicinesCollection,
  getGlobalDoctorsCollection,
  getGlobalDistributorsCollection,
  getCached,
  setCached,
  clearCachePattern,
  initBackgroundGlobalClient,
  onGlobalConnect,
};
