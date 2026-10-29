// Global review worker: runs inside the scan worker process (see
// scan.worker.js) on its own queue, so it isn't held back by the scan
// queue's Gemini rate limit. Checks each new pharmacy product, doctor or
// supplier against the global catalogues and queues the misses for review.
const { Worker } = require("bullmq");
const mongoose = require("mongoose");
const { connection } = require("../services/ai/queue");
const { isGlobalConnected, getGlobalDoctorsCollection, getGlobalDistributorsCollection } = require("../utils/globalDb");
const { QUEUE_NAME, findGlobalMatch, recordMissing, ensureReviewIndexes } = require("../services/globalReview");

const SOURCE = { medicine: "products", doctor: "doctors", distributor: "suppliers" };

async function processJob(job) {
  const { kind, pharmacy_id, record_id, name, details } = job.data;
  // Jobs waiting in Redis start as soon as the worker boots, before Mongo is up
  if (mongoose.connection.readyState !== 1) {
    await Promise.race([mongoose.connection.asPromise(), new Promise((_, rej) => setTimeout(() => rej(new Error("MongoDB not connected yet")), 30000))]);
  }
  const db = mongoose.connection.db;
  // Matching against the fallback DB would report everything as missing
  if (!(await isGlobalConnected())) throw new Error("Global DB not connected yet");

  // Skip records that no longer exist (deleted, or their transaction aborted)
  const exists = await db
    .collection(SOURCE[kind])
    .findOne(record_id !== null && record_id !== undefined ? { pharmacy_id, id: { $in: [record_id, String(record_id), Number(record_id)].filter((v) => v === v) } } : { pharmacy_id, name }, { projection: { _id: 1 } });
  if (!exists) return { skipped: "record gone" };

  const globals = { doctors: await getGlobalDoctorsCollection(), distributors: await getGlobalDistributorsCollection() };
  const { match, candidates } = await findGlobalMatch(kind, name, details || {}, globals);
  if (match) return { matched: match.code || match.name };

  const pharmacy = await db.collection("pharmacies").findOne({ id: pharmacy_id }, { projection: { _id: 0, name: 1 } });
  const key = await recordMissing(db, { kind, name, details: details || {}, pharmacy_id, pharmacy_name: pharmacy?.name || null, record_id, candidates });
  return { queued: key };
}

function startGlobalReviewWorker() {
  const run = () => ensureReviewIndexes(mongoose.connection.db).catch((err) => console.warn("[GlobalReview] indexes:", err.message));
  if (mongoose.connection.readyState === 1) run();
  else mongoose.connection.once("connected", run);

  const worker = new Worker(QUEUE_NAME, processJob, {
    connection,
    concurrency: parseInt(process.env.GLOBAL_REVIEW_CONCURRENCY || "4", 10),
  });
  worker.on("failed", (job, err) => {
    if (job && job.attemptsMade >= (job.opts.attempts || 1)) console.warn(`[GlobalReview] gave up on ${job.id}:`, err.message);
  });
  worker.on("error", (err) => console.error("[GlobalReview] error:", err.message));
  console.log("[GlobalReview] Worker started");
  return worker;
}

module.exports = { startGlobalReviewWorker, processJob };
