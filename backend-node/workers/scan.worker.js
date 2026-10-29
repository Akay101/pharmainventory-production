// Scan worker: reads queued product/invoice scans with Gemini and links each
// line to the pharmacy's catalog. Runs as its own container; scale it out by
// running more replicas (BullMQ distributes jobs) or raising WORKER_CONCURRENCY.
const path = require("path");
const dotenv = require("dotenv");
dotenv.config({ path: path.join(__dirname, "../.env") });

const { Worker } = require("bullmq");
const mongoose = require("mongoose");
const credits = require("../services/credits");

const { connection } = require("../services/ai/queue");
const ScanJob = require("../models/scanJob");
const { extractProduct, extractBill } = require("../services/ai/extract");
const { matchForPurchase } = require("../services/ai/inventoryMatch");
const { setCached, releaseInflight } = require("../services/ai/scanGuard");
const { deleteFromR2, downloadFromR2 } = require("../services/r2");

const MONGO_URL = process.env.MONGO_URL || "mongodb://localhost:27017/pharmalogy";
mongoose
  .connect(MONGO_URL, { maxPoolSize: 20 })
  .then(() => console.log("[Worker] Connected to MongoDB"))
  .catch((err) => console.error("[Worker] MongoDB connection error:", err.message));

const CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || "8", 10);
// Jobs started per minute across all workers, to stay under the Gemini quota
const JOBS_PER_MINUTE = parseInt(process.env.GEMINI_JOBS_PER_MIN || "600", 10);

const FRIENDLY = {
  timeout: "The AI took too long to read these images. Try clearer or fewer photos.",
  rate_limit: "The AI service is busy right now. Please try again in a minute.",
  image_error: "The images couldn't be read. Retake them in good light.",
  invalid_json: "The AI couldn't read the bill properly. Try a clearer photo.",
  config: "AI scanning is not configured on the server.",
};

async function loadImages(data) {
  if (Array.isArray(data.images) && data.images.length) {
    return data.images.map((b64) => ({ data: Buffer.from(b64, "base64"), mimeType: "image/jpeg" }));
  }
  // Jobs queued by the previous API version kept their images in R2
  if (Array.isArray(data.r2Keys)) {
    const out = [];
    for (const key of data.r2Keys) {
      try {
        out.push({ data: await downloadFromR2(key), mimeType: /\.png$/i.test(key) ? "image/png" : /\.webp$/i.test(key) ? "image/webp" : "image/jpeg" });
      } catch (err) {
        console.error(`[Worker] R2 download failed for ${key}:`, err.message);
      }
    }
    return out;
  }
  return [];
}

async function processJob(job) {
  const { jobId, type, pharmacyId, hash } = job.data;
  const started = Date.now();
  await ScanJob.updateOne({ jobId }, { status: "processing" });
  await job.updateProgress(20);

  const images = await loadImages(job.data);
  if (!images.length) {
    const err = new Error("No images could be loaded for this scan");
    err.category = "image_error";
    throw err;
  }

  const db = mongoose.connection.db;
  // What the AI reads cost, charged to the pharmacy when the scan is done
  const m = credits.meter.createMeter();
  credits.meter.enter(m);
  let result;
  if (type === "bill") {
    const bill = await extractBill(images);
    await job.updateProgress(80);
    const matches = pharmacyId && db ? await Promise.all(bill.items.map((i) => matchForPurchase(db, pharmacyId, i).catch(() => null))) : [];
    result = { success: true, purchase_data: bill, matches };
  } else {
    const { raw, product } = await extractProduct(images);
    await job.updateProgress(80);
    const match = pharmacyId && db ? await matchForPurchase(db, pharmacyId, product).catch(() => null) : null;
    result = { success: true, scanned_product: product, scanned_data: raw, match };
  }
  result.duration_ms = Date.now() - started;

  await ScanJob.updateOne({ jobId }, { status: "completed", result });
  if (pharmacyId && hash) await setCached(pharmacyId, type, hash, result);
  if (pharmacyId && db) {
    const pharmacy = await db.collection("pharmacies").findOne({ id: pharmacyId }, { projection: { _id: 0, id: 1, subscription: 1 } });
    await credits
      .settle(db, pharmacy || { id: pharmacyId }, m, { ref: `scan:${jobId}`, task: "scan", engine: "pro", userId: job.data.userId || null, label: type === "bill" ? "Invoice scan" : "Pack scan" })
      .catch((err) => console.error(`[Worker] charging credits for ${jobId} failed:`, err.message));
  }
  await job.updateProgress(100);
  return { ok: true };
}

const worker = new Worker(
  "scan-queue",
  processJob,
  {
    connection,
    concurrency: CONCURRENCY,
    limiter: { max: JOBS_PER_MINUTE, duration: 60000 },
    lockDuration: 120000,
    stalledInterval: 30000,
  }
);

// Once a scan is finished either way: free the pharmacy's slot and drop any
// legacy R2 copies of the images
async function finish(job) {
  if (job.data.pharmacyId) await releaseInflight(job.data.pharmacyId, job.data.jobId);
  if (Array.isArray(job.data.r2Keys)) {
    for (const key of job.data.r2Keys) await deleteFromR2(key).catch(() => {});
  }
}

worker.on("completed", finish);

// Only mark the scan failed once retries are exhausted
worker.on("failed", async (job, err) => {
  if (!job) return;
  console.error(`[Worker] Job ${job.id} attempt ${job.attemptsMade} failed:`, err.message);
  if (job.attemptsMade >= (job.opts.attempts || 1)) {
    const category = err.category || "unknown";
    await ScanJob.updateOne(
      { jobId: job.data.jobId },
      { status: "failed", errorCategory: category, errorMessage: FRIENDLY[category] || err.message }
    ).catch(() => {});
    await finish(job);
  }
});

worker.on("error", (err) => console.error("[Worker] error:", err.message));

// Background check of new pharmacy records against the global catalogues
const globalReviewWorker = require("./globalReview.worker").startGlobalReviewWorker();

const shutdown = async (signal) => {
  console.log(`[Worker] ${signal} received. Finishing active scans...`);
  await Promise.all([worker.close(), globalReviewWorker.close()]);
  await mongoose.connection.close();
  process.exit(0);
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

console.log(`[Worker] Started (concurrency ${CONCURRENCY}, ${JOBS_PER_MINUTE} jobs/min)`);
