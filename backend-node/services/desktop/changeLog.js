// Records what changed in tenant collections, so desktop apps can ask "what's new
// since number N?". It follows MongoDB's change stream, which also catches edits
// from the web app, the admin panel and scripts. One API container writes at a
// time, which keeps the numbers in order for readers.
const os = require("os");
const { ALL, OWNER_FIELD } = require("./collections");

const STATE_ID = "desktop_change_log";
const LEASE_MS = 30 * 1000;
const RETENTION_SECONDS = 30 * 24 * 60 * 60;
const OWNER = `${os.hostname()}:${process.pid}`;

let stream = null;
let stopped = false;

async function ensureIndexes(db) {
  await db.collection("sync_log").createIndex({ seq: 1 }, { unique: true });
  await db.collection("sync_log").createIndex({ pharmacy_id: 1, seq: 1 });
  await db.collection("sync_log").createIndex({ at: 1 }, { expireAfterSeconds: RETENTION_SECONDS });
  await db.collection("sync_applied").createIndex({ device_id: 1, changeset_id: 1 }, { unique: true });
  await db.collection("sync_applied").createIndex({ at: 1 }, { expireAfterSeconds: 180 * 24 * 60 * 60 });
  await db.collection("desktop_devices").createIndex({ token_hash: 1 }, { unique: true });
  await db.collection("desktop_devices").createIndex({ pharmacy_id: 1 });
  await db.collection("desktop_auth_codes").createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 });
  await db.collection("desktop_auth_codes").createIndex({ code_hash: 1 }, { unique: true });
}

async function takeLease(db) {
  const now = new Date();
  try {
    const held = await db.collection("job_locks").findOneAndUpdate(
      { _id: STATE_ID, $or: [{ lease_until: { $lt: now } }, { owner: OWNER }] },
      { $set: { owner: OWNER, lease_until: new Date(now.getTime() + LEASE_MS) } },
      { upsert: true, returnDocument: "after" }
    );
    return held?.owner === OWNER;
  } catch (err) {
    if (err.code === 11000) return false;
    throw err;
  }
}

const userPharmacies = new Map();
async function ownerOf(db, coll, fullDocument) {
  if (!fullDocument) return null;
  const field = OWNER_FIELD[coll];
  if (coll === "pharmacies") return fullDocument.id;
  if (!field) return fullDocument.pharmacy_id || null;
  const userId = fullDocument[field];
  if (!userPharmacies.has(userId)) {
    const user = await db.collection("users").findOne({ id: userId }, { projection: { pharmacy_id: 1 } });
    userPharmacies.set(userId, user?.pharmacy_id || null);
  }
  return userPharmacies.get(userId);
}

async function record(db, event) {
  const coll = event.ns.coll;
  const op = event.operationType === "delete" ? "delete" : "upsert";
  const pharmacyId = await ownerOf(db, coll, event.fullDocument);
  // A deleted document's owner is unknown here, so its id goes to every device;
  // an id alone reveals nothing, and devices ignore ids they don't hold.
  if (op === "upsert" && !pharmacyId) return;
  const state = await db.collection("desktop_sync_state").findOneAndUpdate(
    { _id: STATE_ID },
    { $inc: { seq: 1 }, $set: { resume_token: event._id } },
    { upsert: true, returnDocument: "after" }
  );
  await db.collection("sync_log").insertOne({ seq: state.seq, pharmacy_id: pharmacyId, coll, key: event.documentKey._id, op, at: new Date() });
}

async function follow(db) {
  const state = await db.collection("desktop_sync_state").findOne({ _id: STATE_ID });
  const pipeline = [{ $match: { "ns.coll": { $in: ALL }, operationType: { $in: ["insert", "update", "replace", "delete"] } } }];
  const options = { fullDocument: "updateLookup", ...(state?.resume_token ? { resumeAfter: state.resume_token } : {}) };
  stream = db.watch(pipeline, options);
  const renew = setInterval(() => takeLease(db).catch(() => {}), LEASE_MS / 2);
  try {
    for await (const event of stream) await record(db, event);
  } finally {
    clearInterval(renew);
  }
}

// Runs for the life of the process; a standby container takes over within a lease
function start(db) {
  ensureIndexes(db).catch((err) => console.warn("[DesktopSync] indexes:", err.message));
  const loop = async () => {
    while (!stopped) {
      try {
        if (await takeLease(db)) await follow(db);
      } catch (err) {
        if (err.codeName === "ChangeStreamHistoryLost" || err.code === 286 || err.code === 280) {
          // Too long down: devices re-copy, since the log has a gap they can't see
          await db.collection("desktop_sync_state").updateOne({ _id: STATE_ID }, { $unset: { resume_token: "" }, $inc: { epoch: 1 } }, { upsert: true });
        }
        if (!stopped) console.warn("[DesktopSync] change log:", err.message);
      }
      await new Promise((resolve) => setTimeout(resolve, LEASE_MS / 3));
    }
  };
  loop();
}

const stop = () => {
  stopped = true;
  stream?.close().catch(() => {});
};

module.exports = { start, stop, ensureIndexes, STATE_ID };
