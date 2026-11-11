// Data import (moving a pharmacy over from Marg and other software).
// Two ways in, one engine (services/migration):
//   - the DavaDesk team, through the admin panel's backend, with the
//     IMPORT_SERVICE_TOKEN and the pharmacy named in x-pharmacy-id;
//   - a pharmacy admin, with their own login, for their own pharmacy.
const express = require("express");
const crypto = require("crypto");
const mongoose = require("mongoose");
const multer = require("multer");
const { auth, adminOnly } = require("../middleware/auth");
const { requireSubscription } = require("../middleware/subscription");
const { ENTITIES, SOURCES } = require("../services/migration/fields");
const jobs = require("../services/migration/jobs");

const router = express.Router();
const db = () => mongoose.connection.db;

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_BYTES, files: 1 } });

const tokenMatches = (given) => {
  const expected = process.env.IMPORT_SERVICE_TOKEN || "";
  if (expected.length < 32 || typeof given !== "string") return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

const runAll = (handlers, req, res, next) => {
  const [first, ...rest] = handlers;
  if (!first) return next();
  first(req, res, (err) => (err ? next(err) : runAll(rest, req, res, next)));
};

// Sets req.importer = { pharmacyId, actor }
async function importAuth(req, res, next) {
  const token = req.headers["x-import-token"];
  if (token !== undefined) {
    if (!tokenMatches(token)) return res.status(401).json({ detail: "Invalid import token" });
    const pharmacyId = String(req.headers["x-pharmacy-id"] || "").trim();
    if (!pharmacyId) return res.status(400).json({ detail: "Choose a pharmacy" });
    req.importer = {
      pharmacyId,
      actor: { type: "admin", email: String(req.headers["x-admin-email"] || "unknown").slice(0, 120), name: String(req.headers["x-admin-name"] || "").slice(0, 80) || null },
    };
    return next();
  }
  runAll([auth, requireSubscription(), adminOnly], req, res, (err) => {
    if (err) return next(err);
    req.importer = { pharmacyId: req.user.pharmacy_id, actor: { type: "user", id: req.user.id, name: req.user.name } };
    next();
  });
}

router.use(importAuth);

const handle = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (err) {
    if (err.status && err.status < 500) return res.status(err.status).json({ detail: err.message });
    next(err);
  }
};

// GET /api/imports/meta - what can be imported, and from where
router.get("/meta", (req, res) => {
  res.json({
    entities: Object.entries(ENTITIES).map(([key, e]) => ({ key, label: e.label, fields: e.fields.map(({ key: k, label, required }) => ({ key: k, label, required: !!required })) })),
    sources: Object.entries(SOURCES).map(([key, s]) => ({ key, label: s.label, guides: s.guides })),
    max_file_mb: MAX_FILE_BYTES / 1024 / 1024,
  });
});

// GET /api/imports - this pharmacy's imports, newest first
router.get("/", handle(async (req, res) => res.json({ jobs: await jobs.listJobs(db(), req.importer.pharmacyId) })));

// POST /api/imports (multipart: file, entity, source, include_expired, quantity_in)
router.post(
  "/",
  (req, res, next) =>
    upload.single("file")(req, res, (err) => {
      if (err?.code === "LIMIT_FILE_SIZE") return res.status(413).json({ detail: `The file is over ${MAX_FILE_BYTES / 1024 / 1024} MB. Split it into smaller files.` });
      if (err) return res.status(400).json({ detail: "Upload one Excel or CSV file" });
      next();
    }),
  handle(async (req, res) => {
    if (!req.file) return res.status(400).json({ detail: "Choose an Excel or CSV file" });
    const job = await jobs.createJob(db(), {
      pharmacyId: req.importer.pharmacyId,
      actor: req.importer.actor,
      entity: String(req.body.entity || ""),
      source: String(req.body.source || ""),
      file: { buffer: req.file.buffer, name: req.file.originalname },
      options: { include_expired: req.body.include_expired === "true", quantity_in: req.body.quantity_in, purchase_date: req.body.purchase_date },
    });
    // A known report layout needs no column choices: start checking at once
    if (job.meta?.report) await jobs.applyMapping(db(), req.importer.pharmacyId, job.id, {});
    res.status(201).json(await jobs.jobView(db(), req.importer.pharmacyId, job.id));
  })
);

router.get("/:id", handle(async (req, res) => res.json(await jobs.jobView(db(), req.importer.pharmacyId, req.params.id))));

// PUT /api/imports/:id/mapping {mapping: {field: columnIndex}, options} - check the rows and match products
router.put("/:id/mapping", handle(async (req, res) => {
  await jobs.applyMapping(db(), req.importer.pharmacyId, req.params.id, { mapping: req.body?.mapping, options: req.body?.options || {} });
  res.json(await jobs.jobView(db(), req.importer.pharmacyId, req.params.id));
}));

router.get("/:id/rows", handle(async (req, res) => res.json(await jobs.listRows(db(), req.importer.pharmacyId, req.params.id, req.query))));

router.get("/:id/products", handle(async (req, res) => res.json(await jobs.listProducts(db(), req.importer.pharmacyId, req.params.id, req.query))));

// PUT /api/imports/:id/products/decide {key, action: use|new|skip, product_id?, details?}
router.put("/:id/products/decide", handle(async (req, res) => {
  const product = await jobs.decideProduct(db(), req.importer.pharmacyId, req.params.id, req.body?.key, req.body || {});
  res.json({ product, ...(await jobs.jobView(db(), req.importer.pharmacyId, req.params.id)) });
}));

// PUT /api/imports/:id/products/decide-all {action: new|skip, include_close} - every product still waiting
router.put("/:id/products/decide-all", handle(async (req, res) => {
  await jobs.decideAll(db(), req.importer.pharmacyId, req.params.id, String(req.body?.action || ""), { includeClose: req.body?.include_close === true });
  res.json(await jobs.jobView(db(), req.importer.pharmacyId, req.params.id));
}));

// GET /api/imports/:id/problems.csv - rows that weren't (or won't be) imported, with the reason
router.get("/:id/problems.csv", handle(async (req, res) => {
  const csv = await jobs.problemsCsv(db(), req.importer.pharmacyId, req.params.id);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="import-problems-${String(req.params.id).slice(0, 8)}.csv"`);
  res.send("﻿" + csv);
}));

router.post("/:id/commit", handle(async (req, res) => {
  await jobs.startCommit(db(), req.importer.pharmacyId, req.params.id, req.importer.actor);
  res.json(await jobs.jobView(db(), req.importer.pharmacyId, req.params.id));
}));

router.post("/:id/undo", handle(async (req, res) => {
  const result = await jobs.undo(db(), req.importer.pharmacyId, req.params.id, req.importer.actor);
  res.json({ result, ...(await jobs.jobView(db(), req.importer.pharmacyId, req.params.id)) });
}));

router.post("/:id/resume", handle(async (req, res) => {
  await jobs.resume(db(), req.importer.pharmacyId, req.params.id, req.importer.actor);
  res.json(await jobs.jobView(db(), req.importer.pharmacyId, req.params.id));
}));

router.delete("/:id", handle(async (req, res) => {
  await jobs.discard(db(), req.importer.pharmacyId, req.params.id);
  res.json({ message: "Import discarded" });
}));

module.exports = router;
