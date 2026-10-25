// HTTP handlers for AI scans.
//
//   Billing  POST /bills/scan-product        inline: read pack -> match stock (~2-4s)
//   Purchase POST /purchases/scan-image|bill queued to the scan worker
//            GET  /purchases/scan-status/:id long-polls until the job finishes
//
// Uploads stay in memory (no temp files), are validated and shrunk once, and
// identical photos are answered from cache.
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");
const mongoose = require("mongoose");

const ScanJob = require("../../models/scanJob");
const { scanQueue, getQueueEvents } = require("./queue");
const { prepareImages, fingerprint, ImageError } = require("./imagePrep");
const { extractProduct } = require("./extract");
const { matchForBilling } = require("./inventoryMatch");
const { createSemaphore, GeminiError } = require("./gemini");
const guard = require("./scanGuard");
const credits = require("../credits");

class NoCreditsError extends Error {}

// Scans use AI credits: refuse up front when the pharmacy has none
async function requireCredits(pharmacyId) {
  const db = mongoose.connection.db;
  const pharmacy = await db.collection("pharmacies").findOne({ id: pharmacyId }, { projection: { _id: 0, id: 1, subscription: 1 } });
  const cfg = await credits.config.getConfig(db);
  const gate = await credits.policy.canSpend(db, cfg, pharmacy || { id: pharmacyId });
  if (!gate.ok) throw new NoCreditsError("AI scanning needs AI credits. Add credits from the credits button at the top of DavaDesk, then scan again.");
  return pharmacy || { id: pharmacyId };
}

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

const scanUpload = (maxFiles) =>
  multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 15 * 1024 * 1024, files: maxFiles },
    fileFilter: (req, file, cb) =>
      IMAGE_TYPES.has(file.mimetype) ? cb(null, true) : cb(Object.assign(new Error("Only JPEG, PNG, WebP or HEIC photos can be scanned"), { status: 400 })),
  }).array("files", maxFiles);

// Wraps multer so its errors become clean 400s
const acceptImages = (maxFiles) => (req, res, next) =>
  scanUpload(maxFiles)(req, res, (err) => {
    if (!err) return next();
    const detail =
      err.code === "LIMIT_FILE_SIZE" ? "Each photo must be under 15 MB" :
      err.code === "LIMIT_FILE_COUNT" || err.code === "LIMIT_UNEXPECTED_FILE" ? `You can scan up to ${maxFiles} photos at a time` :
      err.message || "Upload failed";
    res.status(400).json({ success: false, detail });
  });

// Gemini calls in flight from this API process (inline billing scans)
const geminiSlots = createSemaphore(parseInt(process.env.SCAN_INLINE_CONCURRENCY || "24", 10));

function sendError(res, err) {
  if (err instanceof NoCreditsError) return res.status(402).json({ success: false, code: "NO_CREDITS", detail: err.message });
  if (err instanceof guard.ScanLimitError) {
    res.set("Retry-After", String(err.retryAfter || 30));
    return res.status(429).json({ success: false, code: "SCAN_LIMIT", detail: err.message });
  }
  if (err instanceof ImageError) return res.status(422).json({ success: false, code: "BAD_IMAGE", detail: err.message });
  if (err instanceof GeminiError) {
    const map = {
      rate_limit: [503, "The AI service is busy right now. Please try again in a moment."],
      busy: [503, err.message],
      timeout: [504, "The AI took too long to read this photo. Try a clearer photo."],
      image_error: [422, "The photo couldn't be read. Retake it in good light."],
      invalid_json: [502, "The AI couldn't read this photo properly. Please try again."],
      config: [503, "AI scanning is not configured on the server."],
    };
    const [status, detail] = map[err.category] || [502, "AI scan failed. Please try again."];
    console.warn(`[scan] Gemini ${err.category}: ${err.message}`);
    return res.status(status).json({ success: false, code: `AI_${String(err.category).toUpperCase()}`, detail });
  }
  console.error("[scan] unexpected error:", err);
  return res.status(500).json({ success: false, detail: "Scan failed. Please try again." });
}

// POST /bills/scan-product: read one pack and map it to stock
async function scanForBilling(req, res) {
  const started = Date.now();
  try {
    if (!req.files?.length) return res.status(400).json({ success: false, detail: "Add at least one photo of the product" });
    const pharmacyId = req.user.pharmacy_id;
    const pharmacy = await requireCredits(pharmacyId);
    await guard.consume({ userId: req.user.id, pharmacyId });

    const images = await prepareImages(req.files.map((f) => f.buffer), "product");
    const hash = fingerprint(images, "product");

    // The read is cached; the stock match is always fresh
    let extraction = await guard.getCached(pharmacyId, "product-read", hash);
    if (!extraction) {
      // A repeat of the same photos comes from cache and isn't charged
      const m = credits.meter.createMeter();
      extraction = await credits.meter.run(m, () => geminiSlots(() => extractProduct(images)));
      await guard.setCached(pharmacyId, "product-read", hash, extraction);
      await credits
        .settle(mongoose.connection.db, pharmacy, m, { ref: `scan:bill:${hash}:${Date.now()}`, task: "scan", engine: "pro", userId: req.user.id, label: "Scan to bill" })
        .catch((err) => console.error("[scan] charging credits failed:", err.message));
    }

    const match = await matchForBilling(mongoose.connection.db, pharmacyId, extraction.product);
    res.json({
      success: true,
      extracted_data: extraction.product,
      matched_item: { ...match.matched_item, match_type: match.match_type },
      match_type: match.match_type,
      confidence: match.confidence,
      alternatives: match.alternatives,
      duration_ms: Date.now() - started,
    });
  } catch (err) {
    sendError(res, err);
  }
}

// POST /purchases/scan-image (product) and /purchases/scan-bill (invoice)
const enqueueScan = (type) => async (req, res) => {
  try {
    if (!req.files?.length) return res.status(400).json({ success: false, detail: "Add at least one photo" });
    const pharmacyId = req.user.pharmacy_id;
    await requireCredits(pharmacyId);
    await guard.consume({ userId: req.user.id, pharmacyId });

    const images = await prepareImages(req.files.map((f) => f.buffer), type);
    const hash = fingerprint(images, type);
    const jobId = uuidv4();

    // Same photos scanned again within 15 minutes: answer instantly
    const cached = await guard.getCached(pharmacyId, type, hash);
    if (cached) {
      await ScanJob.create({ jobId, pharmacyId, userId: req.user.id, type, status: "completed", result: cached });
      return res.json({ success: true, jobId, status: "completed", cached: true, result: cached, progress: 100 });
    }

    await guard.reserveInflight(pharmacyId, jobId);
    await ScanJob.create({ jobId, pharmacyId, userId: req.user.id, type, status: "pending" });
    try {
      await scanQueue.add(
        "scan",
        { jobId, type, pharmacyId, userId: req.user.id, hash, images: images.map((i) => i.data.toString("base64")) },
        { jobId }
      );
    } catch (err) {
      await guard.releaseInflight(pharmacyId, jobId);
      await ScanJob.deleteOne({ jobId }).catch(() => {});
      throw err;
    }
    res.json({ success: true, jobId, status: "pending" });
  } catch (err) {
    sendError(res, err);
  }
};

// Resolves when the worker reports the job finished, or after `ms`
function waitForJob(jobId, ms) {
  return new Promise((resolve) => {
    const events = getQueueEvents();
    const done = ({ jobId: id }) => {
      if (id !== jobId) return;
      cleanup();
      resolve();
    };
    const cleanup = () => {
      clearTimeout(timer);
      events.off("completed", done);
      events.off("failed", done);
    };
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    events.on("completed", done);
    events.on("failed", done);
  });
}

// GET /purchases/scan-status/:jobId[?wait=1]
async function scanStatus(req, res) {
  try {
    const find = () =>
      ScanJob.findOne({ jobId: req.params.jobId, pharmacyId: req.user.pharmacy_id }, { _id: 0, __v: 0 }).lean();
    let job = await find();
    if (!job) return res.status(404).json({ success: false, detail: "Scan not found" });

    if ((job.status === "pending" || job.status === "processing") && req.query.wait) {
      await waitForJob(job.jobId, 20000);
      job = await find();
    }

    let progress = job.status === "completed" || job.status === "failed" ? 100 : 5;
    if (progress < 100) {
      const bullJob = await scanQueue.getJob(job.jobId).catch(() => null);
      if (bullJob && typeof bullJob.progress === "number") progress = Math.max(progress, bullJob.progress);
      if (bullJob) job.queue_position = await bullJob.getState().catch(() => null);
    }
    res.json({ ...job, progress });
  } catch (err) {
    sendError(res, err);
  }
}

module.exports = { acceptImages, scanForBilling, enqueueScan, scanStatus };
