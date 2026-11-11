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
const { TWO_WAY, ALL, OWNER_FIELD, SECRET_FIELDS, COUNTERS, QUIET, NOT_COMPARED } = require("../services/desktop/collections");

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
// Each computer of a shop gets its own number, which goes into its bill numbers.
// Removed computers keep theirs, so a number is never reused.
const nextDeviceNo = async (pharmacyId) => {
  const last = await db().collection("desktop_devices").find({ pharmacy_id: pharmacyId, device_no: { $gt: 0 } }).sort({ device_no: -1 }).limit(1).next();
  return (last?.device_no || 0) + 1;
};

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
      device_no: await nextDeviceNo(stored.pharmacy_id),
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
    let deviceNo = req.device.device_no;
    if (!deviceNo) {
      deviceNo = await nextDeviceNo(req.device.pharmacy_id);
      await db().collection("desktop_devices").updateOne({ id: req.device.id }, { $set: { device_no: deviceNo } });
    }
    res.json({
      device_no: deviceNo,
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

// Two values compared as the device sends them, whatever order their fields are in
const sortKeys = (v) => {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])]));
  return v;
};
const same = (a, b) => JSON.stringify(sortKeys(a ?? null)) === JSON.stringify(sortKeys(b ?? null));
const compared = (field) => !NEVER_PUSHED.has(field) && !NOT_COMPARED.includes(field);

// Fields of the cloud's copy that differ from what the device last saw
function changedSince(current, was) {
  const fields = new Set([...Object.keys(current), ...Object.keys(was)]);
  return [...fields].filter((f) => compared(f) && !same(outgoing(current[f]), was[f]));
}

// Each change carries what the record looked like on the device before it (`was`).
// A field is written only if the cloud still holds that value, so nothing someone
// else changed meanwhile is overwritten. What can't be written goes back to the
// device as something for the shop to decide; the rest of the change still applies.
async function applyChange(req, change, session, ctx) {
  const { coll, key, op } = change;
  if (!TWO_WAY.includes(coll)) throw Object.assign(new Error(`${coll} can't be changed from a device`), { status: 400 });
  if (typeof key !== "string") throw Object.assign(new Error("Invalid key"), { status: 400 });
  const col = db().collection(coll);
  const owner = coll === "user_settings" ? { user_id: req.deviceUser.id } : { pharmacy_id: req.device.pharmacy_id };
  const filter = { _id: toId(key), ...owner };
  const quiet = QUIET.includes(coll);
  const was = change.was && typeof change.was === "object" ? change.was : null;
  const current = await col.findOne(filter, { session });

  if (op === "delete") {
    if (!current) return;
    if (was && !quiet) {
      const fields = changedSince(current, was);
      if (fields.length) return ctx.review.push({ kind: "changed_before_delete", coll, key, fields });
    }
    await col.deleteOne(filter, { session });
    return;
  }
  if (op !== "upsert") throw Object.assign(new Error("Invalid change"), { status: 400 });

  // Apps before 0.1.5 send neither `new` nor `was`: their changes apply as they always
  // did. `force` is the shop's own choice in the Sync Center: written as is, but
  // still never into a record that no longer exists.
  const legacy = !change.new && !was && !change.force;
  if (legacy) {
    await col.updateOne(filter, buildUpdate(coll, change, req), { upsert: true, session });
    if (coll === "inventory" && change.inc?.available_quantity < 0) {
      await col.updateOne({ ...filter, available_quantity: { $lt: 0 } }, { $set: { available_quantity: 0 } }, { session });
    }
    return;
  }

  if (!current && !change.new) {
    // Deleted in the cloud meanwhile. Writing part of a record would leave an empty
    // shell behind, so nothing is written and the shop decides.
    if (coll === "inventory") ctx.lose(key, change.ref, -(change.inc?.available_quantity || 0));
    if (!quiet) ctx.review.push({ kind: "deleted", coll, key });
    return;
  }

  let apply = change;
  if (current && was && !quiet) {
    const set = { ...(change.set || {}) };
    let unset = [...(change.unset || [])];
    const fields = {};
    for (const field of [...Object.keys(set), ...unset]) {
      if (!compared(field)) continue;
      const cloud = outgoing(current[field]);
      const mine = field in set ? set[field] : null;
      if (same(cloud, was[field]) || same(cloud, mine)) continue;
      fields[field] = { mine, cloud: cloud ?? null };
      delete set[field];
      unset = unset.filter((f) => f !== field);
    }
    if (Object.keys(fields).length) {
      ctx.review.push({ kind: "edited", coll, key, fields });
      apply = { ...change, set, unset };
    }
  }

  // Each computer numbers its own bills, so this is a safety net, not the plan
  if (coll === "bills" && change.new && typeof change.set?.bill_no === "string") {
    const clash = await col.findOne({ pharmacy_id: req.device.pharmacy_id, bill_no: change.set.bill_no, _id: { $ne: toId(key) } }, { session, projection: { _id: 1 } });
    if (clash) ctx.review.push({ kind: "duplicate_bill_no", coll, key, bill_no: change.set.bill_no });
  }

  await col.updateOne(filter, buildUpdate(coll, apply, req), { upsert: !!change.new, session });

  // The shelf can't go below zero, same as a live bill: the sale stands, and the
  // shop is told the count is off
  if (coll === "inventory" && change.inc?.available_quantity < 0) {
    const after = await col.findOne(filter, { session, projection: { available_quantity: 1 } });
    if (after && after.available_quantity < 0) {
      await col.updateOne(filter, { $set: { available_quantity: 0 } }, { session });
      const short = Math.min(-after.available_quantity, -change.inc.available_quantity);
      ctx.lose(key, change.ref || current?.id, short);
      ctx.review.push({ kind: "stock_short", coll, key, short });
    }
  }
}

// Units a bill took from a batch that the cloud couldn't give (deleted, or not
// enough left) were never taken, so the bill mustn't give them back on a return
async function settleBillStock(req, changeset, ctx, session) {
  if (!ctx.lost.size) return;
  const col = db().collection("bills");
  for (const change of changeset.changes) {
    if (change.coll !== "bills" || change.op !== "upsert" || !change.set?.items) continue;
    const filter = { _id: toId(change.key), pharmacy_id: req.device.pharmacy_id };
    const bill = await col.findOne(filter, { session, projection: { items: 1 } });
    if (!Array.isArray(bill?.items)) continue;
    let touched = false;
    const items = bill.items.map((item) => {
      const lost = [...ctx.lost.values()].find((l) => l.ids.has(String(item.inventory_id)));
      const deducted = Number(item.stock_deducted) || 0;
      if (!lost || lost.units <= 0 || deducted <= 0) return item;
      const cut = Math.min(lost.units, deducted);
      lost.units -= cut;
      touched = true;
      return { ...item, stock_deducted: deducted - cut };
    });
    if (touched) await col.updateOne(filter, { $set: { items } }, { session });
  }
}

const noteConflict = (req, changeset, err) =>
  db().collection("sync_conflicts").insertOne({ device_id: req.device.id, pharmacy_id: req.device.pharmacy_id, changeset_id: changeset.id, detail: err.message, changes: outgoing(changeset.changes), at: new Date() }).catch(() => {});

const noteReview = (req, changeset, review) =>
  db().collection("sync_conflicts").insertOne({ device_id: req.device.id, pharmacy_id: req.device.pharmacy_id, changeset_id: changeset.id, review, at: new Date() }).catch(() => {});

async function applyChangeset(req, changeset) {
  const applied = db().collection("sync_applied");
  const mark = { device_id: req.device.id, changeset_id: changeset.id };
  if (await applied.findOne(mark)) return { id: changeset.id, result: "duplicate" };
  const session = mongoose.connection.getClient().startSession();
  let ctx;
  try {
    await session.withTransaction(async () => {
      // Started afresh on each attempt, since a transaction may be retried
      ctx = { review: [], lost: new Map() };
      ctx.lose = (key, ref, units) => {
        if (!(units > 0)) return;
        const entry = ctx.lost.get(key) || { ids: new Set([key, ...(ref ? [String(ref)] : [])]), units: 0 };
        entry.units += units;
        ctx.lost.set(key, entry);
      };
      // Recording the id in the same transaction is what makes a retry safe
      await applied.insertOne({ ...mark, at: new Date() }, { session });
      for (const change of changeset.changes) await applyChange(req, change, session, ctx);
      await settleBillStock(req, changeset, ctx, session);
    });
    if (ctx.review.length) await noteReview(req, changeset, ctx.review);
    return { id: changeset.id, result: "applied", review: ctx.review };
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

// The cloud's copy of a few records, for the shop's choices in the Sync Center
router.post("/sync/docs", deviceAuth, requireActive, syncLimiter, async (req, res, next) => {
  try {
    const items = req.body?.items;
    if (!Array.isArray(items) || items.length > 100) return res.status(400).json({ detail: "Invalid request" });
    const docs = [];
    for (const { coll, key } of items) {
      if (!TWO_WAY.includes(coll) || typeof key !== "string") return res.status(400).json({ detail: "Invalid request" });
      const doc = await db().collection(coll).findOne({ _id: toId(key), ...(await scopeFilter(req, coll)) });
      docs.push({ coll, key, doc: doc ? safeDoc(doc) : null });
    }
    res.json({ docs });
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
