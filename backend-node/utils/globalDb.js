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

// Background connection to Centralized Global Collections (Prod DB)
function initBackgroundGlobalClient() {
  if (isGlobalConnectionAttempted || globalClient) return connectingPromise;
  isGlobalConnectionAttempted = true;

  const globalUri = process.env.GLOBAL_MONGO_URI;
  if (!globalUri) {
    console.warn("[Global DB] GLOBAL_MONGO_URI is not set in environment (.env). Skipping global DB connection.");
    return Promise.resolve(null);
  }

  connectingPromise = (async () => {
    try {
      // Auto-establish SSH tunnel if targeting local tunnel port
      if (globalUri.includes("127.0.0.1") || globalUri.includes("localhost")) {
        await ensureSshTunnel().catch((tErr) => {
          console.warn("[Global DB] SSH tunnel check note:", tErr.message);
        });
      }

      const client = new mongoose.mongo.MongoClient(globalUri, {
        maxPoolSize: 20,
        minPoolSize: 1,
        serverSelectionTimeoutMS: 3000,
        connectTimeoutMS: 3500,
      });

      await client.connect();
      globalClient = client;
      clearCachePattern(); // Flush cache on successful connect
      console.log(
        "✅ Connected to Centralized Global Collections (Prod DB - 4.09L+ Medicines, 87K+ Distributors, 39K+ Doctors)"
      );

      client.on("close", () => {
        globalClient = null;
        isGlobalConnectionAttempted = false;
      });
    } catch (err) {
      console.warn(
        "⚠️ Centralized global DB connection fallback to primary Atlas DB:",
        err.message
      );
      globalClient = null;
    } finally {
      connectingPromise = null;
    }
  })();

  return connectingPromise;
}

// Trigger connection immediately on load
initBackgroundGlobalClient();

function getGlobalDb() {
  if (globalClient) {
    return globalClient.db("global_collections");
  }

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
  if (connectingPromise) {
    try {
      await connectingPromise;
    } catch (e) {}
  }
  const db = getGlobalDb();
  return db.collection("global_medicines");
}

async function getGlobalDoctorsCollection() {
  if (connectingPromise) {
    try {
      await connectingPromise;
    } catch (e) {}
  }
  const db = getGlobalDb();
  return db.collection("global_doctors");
}

async function getGlobalDistributorsCollection() {
  if (connectingPromise) {
    try {
      await connectingPromise;
    } catch (e) {}
  }
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
};
