// The desktop app's link to the cloud: browser approval, signed licences, sync and
// the offline catalogue. Everything here runs on the server, so the rules hold
// whatever is done to a copy of the app: an expired subscription or a removed
// computer gets nothing from these routes.
const crypto = require("crypto");
const express = require("express");
const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");
const { auth } = require("../middleware/auth");
const { requireSubscription } = require("../middleware/subscription");
const { rateLimit, ipKeyGenerator } = require("express-rate-limit");
const { isActive } = require("../services/billing/subscriptions");
const { signAccess } = require("../services/auth/tokens");
const { getGlobalDb } = require("../utils/globalDb");
const { GLOBAL_PROJECTION } = require("../services/search/medicineSearch");
const licence = require("../services/desktop/licence");
const { STATE_ID } = require("../services/desktop/changeLog");
const { toId, fromId, outgoing, incoming } = require("../services/desktop/codec");
const { TWO_WAY, ALL, OWNER_FIELD, SECRET_FIELDS, COUNTERS } = require("../services/desktop/collections");

const router = express.Router();
const db = () => mongoose.connection.db;
const sha256 = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");
const CODE_TTL_MS = 2 * 60 * 1000;
const MAX_DEVICES = 10;
const MAX_PAGE = 500;
const CATALOG_PAGE = 2000;
// A whole catalogue is a few hundred pages; this leaves room for retries, not scraping
const CATALOG_PAGES_PER_DAY = 2000;

const limiter = (limit, windowMs = 60 * 1000) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    passOnStoreError: true,
    keyGenerator: (req) => req.device?.id || ipKeyGenerator(req.ip),
    message: { detail: "Too many requests. Please wait a moment.", code: "RATE_LIMITED" },
  });
const exchangeLimiter = limiter(20);
const syncLimiter = limiter(600);

// ---- Installers and updates --------------------------------------------------------
// The files stay in the private bucket. Anyone may fetch them, since the app does
// nothing without an account with an active subscription, and this hands out a
// short-lived link to one named file in the release folder.
const releaseChannel = (req) => process.env.DESKTOP_RELEASE_CHANNEL || (/-dev\./.test(req.hostname) ? "dev" : "production");
const INSTALLERS = /\.(dmg|exe)$/;

router.get("/releases/:file", limiter(120), async (req, res, next) => {
  try {
    const file = req.params.file;
    if (!/^[A-Za-z0-9][A-Za-z0-9._ -]*$/.test(file)) return res.status(400).json({ detail: "Invalid file name" });
    const s3 = require("../services/s3");
    const key = `desktop/${releaseChannel(req)}/${file}`;
    if (!(await s3.exists(key))) return res.status(404).json({ detail: "This download isn't available yet.", code: "RELEASE_NOT_FOUND" });
    res.set("Cache-Control", "no-store");
    res.redirect(302, await s3.downloadUrl(key, { filename: INSTALLERS.test(file) ? file : undefined }));
  } catch (err) {
    next(err);
  }
});

// ---- Device identity -------------------------------------------------------------
const deviceAuth = async (req, res, next) => {
  try {
    const presented = req.headers["x-device-token"];
    if (!presented) return res.status(401).json({ code: "DEVICE_REVOKED", detail: "This computer isn't signed in." });
    const device = await db().collection("desktop_devices").findOne({ token_hash: sha256(presented) });
    if (!device || device.revoked_at) return res.status(401).json({ code: "DEVICE_REVOKED", detail: "This computer was removed from the account. Please sign in again." });
    const user = await db().collection("users").findOne({ id: device.user_id }, { projection: { _id: 0, id: 1, name: 1, email: 1, role: 1, pharmacy_id: 1, verified: 1, token_version: 1 } });
    // Same rule as a browser session: a password change or removed user ends it
    if (!user || user.verified === false || user.pharmacy_id !== device.pharmacy_id || (user.token_version || 0) !== (device.token_version || 0)) {
      return res.status(401).json({ code: "DEVICE_REVOKED", detail: "Your sign-in has ended. Please sign in again." });
    }
    const pharmacy = await db().collection("pharmacies").findOne({ id: device.pharmacy_id }, { projection: { subscription: 1 } });
    req.device = device;
    req.deviceUser = user;
    req.subscription = pharmacy?.subscription || null;
    req.subscriptionActive = isActive(pharmacy?.subscription);
    db().collection("desktop_devices").updateOne({ id: device.id }, { $set: { last_seen_at: new Date() } }).catch(() => {});
    next();
  } catch (err) {
    next(err);
  }
};

const requireActive = (req, res, next) => {
  if (req.subscriptionActive) return next();
  res.status(403).json({ code: "SUBSCRIPTION_EXPIRED", detail: "Your subscription isn't active. Renew it to keep using the desktop app." });
};

// ---- Browser approval -------------------------------------------------------------
// The signed-in browser asks for a one-time code for a computer it was told about.
router.post("/authorize", auth, requireSubscription(), async (req, res, next) => {
  try {
    const { code_challenge, device_name } = req.body || {};
    if (typeof code_challenge !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(code_challenge)) {
      return res.status(400).json({ detail: "Invalid request from the app. Please try again from the app." });
    }
    const count = await db().collection("desktop_devices").countDocuments({ pharmacy_id: req.user.pharmacy_id, revoked_at: null });
    if (count >= MAX_DEVICES) {
      return res.status(409).json({ code: "TOO_MANY_DEVICES", detail: `This pharmacy already has ${MAX_DEVICES} computers. Remove one in Settings first.` });
    }
    const code = crypto.randomBytes(24).toString("base64url");
    await db().collection("desktop_auth_codes").insertOne({
      code_hash: sha256(code),
      code_challenge,
      user_id: req.user.id,
      pharmacy_id: req.user.pharmacy_id,
      device_name: String(device_name || "Computer").slice(0, 80),
      expires_at: new Date(Date.now() + CODE_TTL_MS),
    });
    res.json({ code });
  } catch (err) {
    next(err);
  }
});

// The app swaps the code for its device login, proving it started the request
router.post("/token", exchangeLimiter, async (req, res, next) => {
  try {
    const { code, code_verifier } = req.body || {};
    if (typeof code !== "string" || typeof code_verifier !== "string") return res.status(400).json({ detail: "Invalid sign-in request" });
    const challenge = crypto.createHash("sha256").update(code_verifier).digest("base64url");
    // Deleting as it reads means a code works once, even if two requests race
    const stored = await db().collection("desktop_auth_codes").findOneAndDelete({ code_hash: sha256(code), expires_at: { $gt: new Date() } });
    if (!stored || stored.code_challenge !== challenge) {
      return res.status(400).json({ code: "CODE_INVALID", detail: "That sign-in has expired. Please try again." });
    }
    const user = await db().collection("users").findOne({ id: stored.user_id }, { projection: { _id: 0, id: 1, pharmacy_id: 1, token_version: 1, verified: 1 } });
    const pharmacy = await db().collection("pharmacies").findOne({ id: stored.pharmacy_id }, { projection: { subscription: 1 } });
    if (!user || user.verified === false || !isActive(pharmacy?.subscription)) {
      return res.status(403).json({ code: "SUBSCRIPTION_EXPIRED", detail: "An active subscription is needed to use the desktop app." });
    }
    const deviceToken = crypto.randomBytes(32).toString("base64url");
    const device = {
      id: uuidv4(),
      token_hash: sha256(deviceToken),
      name: stored.device_name,
      user_id: user.id,
      pharmacy_id: stored.pharmacy_id,
      token_version: user.token_version || 0,
      revoked_at: null,
      created_at: new Date(),
      last_seen_at: new Date(),
    };
    await db().collection("desktop_devices").insertOne(device);
    res.json({ device_id: device.id, device_token: deviceToken, licence: licence.issue({ device, user, subscription: pharmacy.subscription }) });
  } catch (err) {
    next(err);
  }
});

// A fresh licence and a normal short-lived API token, for each online stretch.
// The token is the same as a browser's, so every web route applies its usual checks.
router.post("/session", deviceAuth, requireActive, async (req, res, next) => {
  try {
    res.json({
      token: signAccess(req.deviceUser),
      licence: licence.issue({ device: req.device, user: req.deviceUser, subscription: req.subscription }),
      user_id: req.deviceUser.id,
      pharmacy_id: req.device.pharmacy_id,
    });
  } catch (err) {
    next(err);
  }
});

// The app signing itself out: this computer stops counting on the account
router.post("/sign-out", deviceAuth, async (req, res, next) => {
  try {
    await db().collection("desktop_devices").updateOne({ id: req.device.id }, { $set: { revoked_at: new Date(), revoked_by: "device" } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ---- Computers on the account -------------------------------------------------------
router.get("/devices", auth, async (req, res, next) => {
  try {
    const devices = await db().collection("desktop_devices").find({ pharmacy_id: req.user.pharmacy_id, revoked_at: null }, { projection: { _id: 0, id: 1, name: 1, created_at: 1, last_seen_at: 1 } }).sort({ created_at: 1 }).toArray();
    res.json({ devices });
  } catch (err) {
    next(err);
  }
});

router.delete("/devices/:id", auth, async (req, res, next) => {
  try {
    const r = await db().collection("desktop_devices").updateOne({ id: req.params.id, pharmacy_id: req.user.pharmacy_id, revoked_at: null }, { $set: { revoked_at: new Date(), revoked_by: req.user.id } });
    if (!r.matchedCount) return res.status(404).json({ detail: "Computer not found" });
    res.json({ message: "Computer removed" });
  } catch (err) {
    next(err);
  }
});

// ---- Sync: scope ----------------------------------------------------------------------
async function scopeFilter(req, coll) {
  if (coll === "user_settings") {
    const users = await db().collection("users").find({ pharmacy_id: req.device.pharmacy_id }, { projection: { id: 1 } }).toArray();
    return { user_id: { $in: users.map((u) => u.id) } };
  }
  return { [OWNER_FIELD[coll] || "pharmacy_id"]: req.device.pharmacy_id };
}

const safeDoc = (doc) => {
  const out = outgoing(doc);
  for (const field of SECRET_FIELDS) delete out[field];
  return out;
};

const latestSeq = async () => (await db().collection("desktop_sync_state").findOne({ _id: STATE_ID }))?.seq || 0;

// ---- Sync: first copy --------------------------------------------------------------------
router.get("/sync/manifest", deviceAuth, requireActive, syncLimiter, async (req, res, next) => {
  try {
    const collections = {};
    for (const coll of ALL) collections[coll] = await db().collection(coll).countDocuments(await scopeFilter(req, coll));
    res.json({ collections, cursor: await latestSeq() });
  } catch (err) {
    next(err);
  }
});

router.get("/sync/snapshot", deviceAuth, requireActive, syncLimiter, async (req, res, next) => {
  try {
    const coll = String(req.query.coll || "");
    if (!ALL.includes(coll)) return res.status(400).json({ detail: "Unknown collection" });
    const filter = await scopeFilter(req, coll);
    if (req.query.after) filter._id = { $gt: toId(String(req.query.after)) };
    const docs = await db().collection(coll).find(filter).sort({ _id: 1 }).limit(MAX_PAGE).toArray();
    res.json({ docs: docs.map(safeDoc), done: docs.length < MAX_PAGE });
  } catch (err) {
    next(err);
  }
});

// ---- Sync: from the device -----------------------------------------------------------------
const NEVER_PUSHED = new Set(["_id", "pharmacy_id", "subscription", "subscription_id", "subscription_plan", "subscription_expiry", "role", "token_version", ...SECRET_FIELDS]);

function buildUpdate(coll, change, req) {
  const set = {};
  const inc = {};
  const unset = {};
  for (const [field, value] of Object.entries(incoming(change.set || {}))) {
    if (!NEVER_PUSHED.has(field)) set[field] = value;
  }
  const counters = COUNTERS[coll] || [];
  for (const [field, value] of Object.entries(change.inc || {})) {
    if (!counters.includes(field) || typeof value !== "number" || !Number.isFinite(value)) throw Object.assign(new Error(`Invalid change to ${field}`), { status: 400 });
    inc[field] = value;
  }
  for (const field of change.unset || []) {
    if (!NEVER_PUSHED.has(String(field)) && !String(field).startsWith("$")) unset[String(field)] = "";
  }
  const update = {};
  if (Object.keys(set).length) update.$set = set;
  if (Object.keys(inc).length) update.$inc = inc;
  if (Object.keys(unset).length) update.$unset = unset;
  const ownerField = OWNER_FIELD[coll] || "pharmacy_id";
  update.$setOnInsert = { [ownerField]: coll === "user_settings" ? req.deviceUser.id : req.device.pharmacy_id };
  return update;
}

async function applyChange(req, change, session) {
  const { coll, key, op } = change;
  if (!TWO_WAY.includes(coll)) throw Object.assign(new Error(`${coll} can't be changed from a device`), { status: 400 });
  if (typeof key !== "string") throw Object.assign(new Error("Invalid key"), { status: 400 });
  const col = db().collection(coll);
  const owner = coll === "user_settings" ? { user_id: req.deviceUser.id } : { pharmacy_id: req.device.pharmacy_id };
  const filter = { _id: toId(key), ...owner };
  if (op === "delete") {
    await col.deleteOne(filter, { session });
    return;
  }
  if (op !== "upsert") throw Object.assign(new Error("Invalid change"), { status: 400 });
  await col.updateOne(filter, buildUpdate(coll, change, req), { upsert: true, session });
  // The shelf can't go below zero, same as a live bill: the sale stands
  if (coll === "inventory" && change.inc?.available_quantity < 0) {
    await col.updateOne({ ...filter, available_quantity: { $lt: 0 } }, { $set: { available_quantity: 0 } }, { session });
  }
}

const noteConflict = (req, changeset, err) =>
  db().collection("sync_conflicts").insertOne({ device_id: req.device.id, pharmacy_id: req.device.pharmacy_id, changeset_id: changeset.id, detail: err.message, changes: outgoing(changeset.changes), at: new Date() }).catch(() => {});

async function applyChangeset(req, changeset) {
  const applied = db().collection("sync_applied");
  const mark = { device_id: req.device.id, changeset_id: changeset.id };
  if (await applied.findOne(mark)) return { id: changeset.id, result: "duplicate" };
  const session = mongoose.connection.getClient().startSession();
  try {
    await session.withTransaction(async () => {
      // Recording the id in the same transaction is what makes a retry safe
      await applied.insertOne({ ...mark, at: new Date() }, { session });
      for (const change of changeset.changes) await applyChange(req, change, session);
    });
    return { id: changeset.id, result: "applied" };
  } catch (err) {
    // Two copies of one retry racing: the other copy has already done it
    if (err.code === 11000 && (await applied.findOne(mark))) return { id: changeset.id, result: "duplicate" };
    // A record the cloud refuses must not hold up the rest of the shop's work
    await noteConflict(req, changeset, err);
    return { id: changeset.id, result: "conflict", detail: err.message };
  } finally {
    await session.endSession();
  }
}

// Allowed with a lapsed subscription too: work already done still reaches the cloud.
router.post("/sync/push", deviceAuth, syncLimiter, async (req, res, next) => {
  try {
    const changesets = req.body?.changesets;
    if (!Array.isArray(changesets) || changesets.length > 100) return res.status(400).json({ detail: "Invalid batch" });
    const results = [];
    for (const changeset of changesets) {
      // Sent as text: the request filter would otherwise strip the date markers.
      // incoming() below refuses anything else that looks like an operator.
      let changes = null;
      try {
        changes = JSON.parse(changeset?.changes);
      } catch {}
      if (typeof changeset?.id !== "string" || !Array.isArray(changes)) return res.status(400).json({ detail: "Invalid change set" });
      results.push(await applyChangeset(req, { id: changeset.id, changes }));
    }
    res.json({ results });
  } catch (err) {
    next(err);
  }
});

// Private files saved while offline, such as prescriptions
router.post("/sync/file", deviceAuth, syncLimiter, express.raw({ type: "*/*", limit: "6mb" }), async (req, res, next) => {
  try {
    const key = String(req.query.key || "");
    const doc = await db().collection("bill_prescriptions").findOne({ s3_key: key, pharmacy_id: req.device.pharmacy_id }, { projection: { mime: 1 } });
    if (!doc) return res.status(404).json({ detail: "No record for this file" });
    await require("../services/s3").putPrivate(key, req.body, doc.mime);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ---- Sync: to the device ---------------------------------------------------------------------
router.get("/sync/pull", deviceAuth, requireActive, syncLimiter, async (req, res, next) => {
  try {
    const cursor = Number(req.query.cursor) || 0;
    const log = db().collection("sync_log");
    if (cursor > 0) {
      const oldest = await log.find({}).sort({ seq: 1 }).limit(1).next();
      if (oldest && oldest.seq > cursor + 1) return res.json({ reset: true, changes: [], cursor: 0, more: false });
    }
    const rows = await log.find({ seq: { $gt: cursor }, $or: [{ pharmacy_id: req.device.pharmacy_id }, { pharmacy_id: null, op: "delete" }] }).sort({ seq: 1 }).limit(MAX_PAGE).toArray();
    // Only the newest state of each document matters
    const latest = new Map();
    for (const row of rows) latest.set(`${row.coll}:${String(row.key)}`, row);
    const changes = [];
    for (const row of latest.values()) {
      const key = fromId(row.key);
      if (row.op === "delete") {
        changes.push({ coll: row.coll, key, op: "delete" });
        continue;
      }
      const doc = await db().collection(row.coll).findOne({ _id: row.key, ...(await scopeFilter(req, row.coll)) });
      if (doc) changes.push({ coll: row.coll, key, op: "upsert", doc: safeDoc(doc) });
      else changes.push({ coll: row.coll, key, op: "delete" });
    }
    res.json({ changes, cursor: rows.length ? rows[rows.length - 1].seq : cursor, more: rows.length === MAX_PAGE });
  } catch (err) {
    next(err);
  }
});

// ---- Offline catalogue ---------------------------------------------------------------------------
// Only for signed-in computers on an active plan, counted per computer per day, and logged.
const CATALOGS = {
  medicines: { collection: "global_medicines", projection: GLOBAL_PROJECTION },
  doctors: { collection: "global_doctors" },
  distributors: { collection: "global_distributors" },
};
const catalogDaily = limiter(CATALOG_PAGES_PER_DAY, 24 * 60 * 60 * 1000);

router.get("/catalog/manifest", deviceAuth, requireActive, syncLimiter, async (req, res, next) => {
  try {
    const out = {};
    for (const [kind, c] of Object.entries(CATALOGS)) out[kind] = await getGlobalDb().collection(c.collection).estimatedDocumentCount();
    db().collection("desktop_catalog_log").insertOne({ device_id: req.device.id, pharmacy_id: req.device.pharmacy_id, at: new Date() }).catch(() => {});
    res.json({ catalogs: out, page_size: CATALOG_PAGE });
  } catch (err) {
    next(err);
  }
});

router.get("/catalog/page", deviceAuth, requireActive, catalogDaily, async (req, res, next) => {
  try {
    const catalog = CATALOGS[String(req.query.kind)];
    if (!catalog) return res.status(400).json({ detail: "Unknown catalogue" });
    const filter = req.query.after ? { _id: { $gt: toId(String(req.query.after)) } } : {};
    const docs = await getGlobalDb().collection(catalog.collection).find(filter, catalog.projection ? { projection: catalog.projection } : {}).sort({ _id: 1 }).limit(CATALOG_PAGE).toArray();
    res.json({ docs: docs.map(outgoing), done: docs.length < CATALOG_PAGE });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
