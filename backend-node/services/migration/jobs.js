// An import job: one file, one kind of data, for one pharmacy.
//
//   upload -> mapped -> matching -> ready -> committing -> committed -> undone
//
// Rows are staged in migration_rows (the file's own cells are kept, so a new
// column mapping re-reads them without another upload). Products are decided
// once per distinct product in migration_products. Nothing reaches the
// pharmacy's records until commit, every record made carries import_job_id,
// and import_keys (unique per pharmacy) makes a re-run of the same data skip
// what is already there instead of adding it twice.
const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");
const { ENTITIES, SOURCES } = require("./fields");
const { readImportFile } = require("./read");
const { normalizeRow } = require("./normalize");
const { matchForPurchase } = require("../ai/inventoryMatch");
const { looseNameRegex, normalizeText } = require("../search/normalize");
const { identityGaps } = require("../../utils/catalogDetails");
const { logActivity } = require("../../utils/activityLogger");

const CHUNK = 500;
const STALE_MS = 2 * 60 * 1000; // a background step with no progress for this long can be restarted

class JobError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const now = () => new Date().toISOString();
const today = () => new Date().toISOString().slice(0, 10);
const round2 = (n) => Math.round(n * 100) / 100;

let indexesReady = null;
function ensureIndexes(db) {
  indexesReady ||= Promise.all([
    db.collection("migration_jobs").createIndex({ id: 1 }, { unique: true }),
    db.collection("migration_jobs").createIndex({ pharmacy_id: 1, created_at: -1 }),
    db.collection("migration_rows").createIndex({ job_id: 1, row_no: 1 }),
    db.collection("migration_rows").createIndex({ job_id: 1, status: 1 }),
    db.collection("migration_products").createIndex({ job_id: 1, key: 1 }, { unique: true }),
    db.collection("migration_products").createIndex({ job_id: 1, status: 1 }),
    db.collection("import_keys").createIndex({ pharmacy_id: 1, entity: 1, key: 1 }, { unique: true }),
    db.collection("import_keys").createIndex({ job_id: 1 }),
  ]).catch((err) => {
    indexesReady = null;
    throw err;
  });
  return indexesReady;
}

const publicJob = (job) => {
  if (!job) return null;
  const { _id, ...rest } = job;
  return rest;
};

async function getJob(db, pharmacyId, jobId) {
  const job = await db.collection("migration_jobs").findOne({ id: String(jobId), pharmacy_id: pharmacyId });
  if (!job) throw new JobError("Import not found", 404);
  return job;
}

const isStale = (job) => !job.heartbeat_at || Date.now() - new Date(job.heartbeat_at).getTime() > STALE_MS;

async function setJob(db, job, set) {
  await db.collection("migration_jobs").updateOne({ id: job.id }, { $set: { ...set, updated_at: now(), heartbeat_at: now() } });
}

// ---- 1. Upload ------------------------------------------------------------------------------

async function createJob(db, { pharmacyId, actor, entity, source, file, options = {} }) {
  await ensureIndexes(db);
  if (!ENTITIES[entity]) throw new JobError("Choose what this file holds: stock, products, suppliers or customers");
  if (!SOURCES[source]) throw new JobError("Choose which software the file came from");
  const pharmacy = await db.collection("pharmacies").findOne({ id: pharmacyId }, { projection: { _id: 0, id: 1, name: 1 } });
  if (!pharmacy) throw new JobError("Pharmacy not found", 404);

  const read = await readImportFile(file.buffer, file.name, ENTITIES[entity].fields, entity);
  const job = {
    id: uuidv4(),
    pharmacy_id: pharmacyId,
    pharmacy_name: pharmacy.name || "",
    entity,
    source,
    file_name: String(file.name || "upload").slice(0, 200),
    file_sha256: crypto.createHash("sha256").update(file.buffer).digest("hex"),
    file_bytes: file.buffer.length,
    sheet: read.sheet,
    header_row: read.header_row,
    headers: read.headers,
    mapping: read.mapping,
    meta: read.meta || null,
    options: {
      include_expired: !!options.include_expired,
      quantity_in: options.quantity_in === "units" ? "units" : "packs",
      // Bills with no date of their own (Marg's purchase statement has none) are dated this day
      purchase_date: isoDay(options.purchase_date) || read.meta?.period_to || null,
    },
    status: "mapped",
    total_rows: read.rows.length,
    counts: {},
    progress: null,
    created_by: actor,
    created_at: now(),
    updated_at: now(),
  };
  // A file already imported for this pharmacy is worth a warning, not a block
  const earlier = await db.collection("migration_jobs").findOne(
    { pharmacy_id: pharmacyId, file_sha256: job.file_sha256, status: "committed" },
    { projection: { _id: 0, id: 1, committed_at: 1 } }
  );
  if (earlier) job.same_file_as = earlier;

  await db.collection("migration_jobs").insertOne(job);
  for (let i = 0; i < read.rows.length; i += CHUNK) {
    await db.collection("migration_rows").insertMany(
      read.rows.slice(i, i + CHUNK).map((r) => ({
        job_id: job.id,
        row_no: r.row_no,
        cells: r.cells.map((c) => (c instanceof Date ? c : c === null || c === undefined ? "" : c)),
        status: "pending",
      })),
      { ordered: false }
    );
  }
  return publicJob(job);
}

// Sample values under each column, for the mapping screen
async function samples(db, job, limit = 5) {
  const rows = await db.collection("migration_rows").find({ job_id: job.id }).sort({ row_no: 1 }).limit(limit).toArray();
  return job.headers.map((_, i) => rows.map((r) => {
    const v = r.cells[i];
    return v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? "").slice(0, 60);
  }));
}

// ---- 2. Mapping and checks ---------------------------------------------------------------------

function cleanMapping(job, mapping) {
  const fields = ENTITIES[job.entity].fields;
  const out = {};
  const used = new Set();
  for (const f of fields) {
    const v = mapping?.[f.key];
    if (v === null || v === undefined || v === "") continue;
    const col = Number(v);
    if (!Number.isInteger(col) || col < 0 || col >= job.headers.length) throw new JobError(`Column for ${f.label} doesn't exist`);
    if (used.has(col)) throw new JobError(`"${job.headers[col] || `Column ${col + 1}`}" is chosen for two fields`);
    used.add(col);
    out[f.key] = col;
  }
  const missing = fields.filter((f) => f.required && out[f.key] === undefined).map((f) => f.label);
  if (missing.length) throw new JobError(`Choose a column for: ${missing.join(", ")}`);
  return out;
}

const usesProducts = (entity) => entity === "stock" || entity === "products" || entity === "purchases";
const isoDay = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) && !isNaN(Date.parse(v)) ? String(v) : null);

// Re-reads every staged row with the mapping, then matches products in the background
async function applyMapping(db, pharmacyId, jobId, { mapping, options = {} }) {
  const job = await getJob(db, pharmacyId, jobId);
  if (!["mapped", "ready", "failed"].includes(job.status)) throw new JobError("This import can't be changed now");
  const clean = cleanMapping(job, mapping ?? job.mapping);
  const opts = {
    include_expired: options.include_expired === undefined ? job.options.include_expired : !!options.include_expired,
    quantity_in: (options.quantity_in || job.options.quantity_in) === "units" ? "units" : "packs",
    purchase_date: isoDay(options.purchase_date) || job.options.purchase_date || null,
  };
  const claimed = await db.collection("migration_jobs").findOneAndUpdate(
    { id: job.id, status: job.status },
    { $set: { mapping: clean, options: opts, status: "checking", progress: { step: "checking", done: 0, total: job.total_rows }, error: null, updated_at: now(), heartbeat_at: now() } },
    { returnDocument: "after" }
  );
  if (!claimed) throw new JobError("This import is already being changed. Refresh and try again.", 409);
  runInBackground(db, claimed, () => checkAndMatch(db, claimed));
  return publicJob(claimed);
}

function runInBackground(db, job, work) {
  setImmediate(async () => {
    try {
      await work();
    } catch (err) {
      console.error(`[Import ${job.id}] failed:`, err);
      await setJob(db, job, { status: job.status === "committing" ? "failed_commit" : "failed", error: err.message || "Something went wrong" }).catch(() => {});
    }
  });
}

async function checkAndMatch(db, job) {
  const groups = new Map();
  const t = today();
  let done = 0;
  const cursor = db.collection("migration_rows").find({ job_id: job.id }).sort({ row_no: 1 });
  let batch = [];
  const flush = async () => {
    if (!batch.length) return;
    await db.collection("migration_rows").bulkWrite(batch, { ordered: false });
    done += batch.length;
    batch = [];
    await setJob(db, job, { progress: { step: "checking", done, total: job.total_rows } });
  };
  for await (const row of cursor) {
    const r = normalizeRow(job.entity, row.cells, job.mapping, { today: t, includeExpired: job.options.include_expired, quantityIn: job.options.quantity_in, fallbackDate: job.options.purchase_date });
    let set;
    if (r.noise) set = { status: "ignored", data: null, errors: [], warnings: [], skip: null };
    else {
      const status = r.errors.length ? "error" : r.skip ? "skipped" : "ok";
      set = { status, data: r.data, errors: r.errors, warnings: r.warnings, skip: r.skip || null };
      if (status === "ok" && usesProducts(job.entity)) {
        const g = groups.get(r.data.product_key);
        if (g) g.row_count++;
        else groups.set(r.data.product_key, { sample: r.data, row_count: 1 });
      }
    }
    batch.push({ updateOne: { filter: { _id: row._id }, update: { $set: { ...set, product_key: set.data?.product_key || null, result: null } } } });
    if (batch.length >= CHUNK) await flush();
  }
  await flush();

  if (usesProducts(job.entity)) await matchProducts(db, job, groups);
  await setJob(db, job, { status: "ready", progress: null, counts: await countJob(db, job) });
}

// One decision per distinct product. Earlier decisions (by key) are kept when the mapping changes.
async function matchProducts(db, job, groups) {
  const col = db.collection("migration_products");
  const previous = new Map((await col.find({ job_id: job.id }).toArray()).map((p) => [p.key, p]));
  await col.deleteMany({ job_id: job.id, key: { $nin: [...groups.keys()] } });
  let done = 0;
  for (const [key, g] of groups) {
    const old = previous.get(key);
    const decided = old && ["use", "new", "skip"].includes(old.decision) && old.decided_by;
    const doc = decided
      ? { ...old, row_count: g.row_count, sample: g.sample }
      : { job_id: job.id, key, ...(await matchOne(db, job.pharmacy_id, g.sample)), row_count: g.row_count, sample: g.sample };
    delete doc._id;
    await col.updateOne({ job_id: job.id, key }, { $set: doc }, { upsert: true });
    if (++done % 25 === 0) await setJob(db, job, { progress: { step: "matching", done, total: groups.size } });
  }
}

const fillBlank = (details, from) => {
  for (const k of ["manufacturer", "salt_composition", "hsn_no"]) if (!details[k] && from[k]) details[k] = from[k];
  if (details.gst_rate === null && from.tax_rate !== null && from.tax_rate !== undefined && +from.tax_rate >= 0) details.gst_rate = +from.tax_rate;
  return details;
};

// match: an existing product is used automatically. check: a person picks.
// new: created at commit. needs_details: created once manufacturer and salt are filled in.
async function matchOne(db, pharmacyId, sample) {
  const details = {
    manufacturer: sample.manufacturer,
    salt_composition: sample.salt_composition,
    hsn_no: sample.hsn_no,
    gst_rate: sample.gst_rate,
    category: "medicine",
  };
  const exact = await db.collection("products").find(
    { pharmacy_id: pharmacyId, $or: [{ name: looseNameRegex(sample.product_name) }, { product_name: looseNameRegex(sample.product_name) }] },
    { projection: { _id: 0, id: 1, name: 1, units_per_pack: 1, manufacturer: 1, salt_composition: 1, mrp: 1 } }
  ).limit(5).toArray();
  const same = exact.find((p) => (+p.units_per_pack || 1) === sample.units_per_pack) || (exact.length === 1 ? exact[0] : null);
  if (same) return { decision: "use", status: "match", product_id: same.id, matched_name: same.name, reason: "Same name in the catalog", candidates: [], details };

  const m = await matchForPurchase(db, pharmacyId, { product_name: sample.product_name, manufacturer: sample.manufacturer }, { includeGlobal: true }).catch(() => ({ suggestions: [] }));
  const own = m.suggestions.filter((s) => s.source === "catalog");
  const global = m.suggestions.filter((s) => s.source === "global");
  const candidates = [...own.slice(0, 3), ...global.slice(0, 2)].map((s) => ({
    source: s.source, product_id: s.product_id, product_name: s.product_name, manufacturer: s.manufacturer || "", salt_composition: s.salt_composition || "",
    units_per_pack: s.units_per_pack || null, mrp: s.mrp || null, score: s.score,
  }));
  const top = own[0];
  if (top && top.is_exact && (+top.units_per_pack || 1) === sample.units_per_pack) {
    return { decision: "use", status: "match", product_id: top.product_id, matched_name: top.product_name, reason: "Matched in the catalog", candidates, details };
  }
  if (own.length) return { decision: null, status: "check", product_id: null, reason: "Close names in the catalog", candidates, details };

  const g = global.find((s) => s.is_high_confidence);
  if (g) fillBlank(details, g);
  const gaps = identityGaps(details);
  return {
    decision: gaps.length ? null : "new",
    status: gaps.length ? "needs_details" : "new",
    product_id: null,
    reason: gaps.length ? `Missing ${gaps.join(" and ")}` : g ? "New, details from the medicine database" : "New product",
    candidates,
    details,
  };
}

// A person's choice for one product: use an existing one, create it new (with details), or leave it out
async function decideProduct(db, pharmacyId, jobId, key, body) {
  const job = await getJob(db, pharmacyId, jobId);
  if (job.status !== "ready") throw new JobError("This import can't be changed now");
  const col = db.collection("migration_products");
  const p = await col.findOne({ job_id: job.id, key: String(key) });
  if (!p) throw new JobError("Product not found in this import", 404);
  const set = { decided_by: true, decided_at: now() };
  if (body.action === "use") {
    const product = await db.collection("products").findOne({ id: String(body.product_id), pharmacy_id: pharmacyId }, { projection: { _id: 0, id: 1, name: 1 } });
    if (!product) throw new JobError("Choose a product from this pharmacy's catalog");
    Object.assign(set, { decision: "use", status: "match", product_id: product.id, matched_name: product.name, reason: "Chosen by hand" });
  } else if (body.action === "new") {
    const details = { ...p.details };
    for (const k of ["manufacturer", "salt_composition", "hsn_no"]) if (body.details?.[k] !== undefined) details[k] = String(body.details[k] || "").trim().slice(0, 200) || null;
    if (body.details?.category) details.category = body.details.category === "medicine" ? "medicine" : String(body.details.category).slice(0, 40);
    if (body.details?.gst_rate !== undefined) {
      const g = Number(body.details.gst_rate);
      details.gst_rate = Number.isFinite(g) && g >= 0 && g <= 28 ? g : null;
    }
    const gaps = identityGaps(details);
    if (gaps.length) throw new JobError(`Add the ${gaps.join(" and ")} first, or mark it as not a medicine`);
    Object.assign(set, { decision: "new", status: "new", product_id: null, matched_name: null, details, reason: "New, details added by hand" });
  } else if (body.action === "skip") {
    Object.assign(set, { decision: "skip", status: "skip", product_id: null, reason: "Left out" });
  } else throw new JobError("Unknown choice");
  await col.updateOne({ _id: p._id }, { $set: set });
  await setJob(db, job, { counts: await countJob(db, job) });
  const { _id, ...updated } = await col.findOne({ _id: p._id });
  return updated;
}

// The same choice for every product still waiting: "new" adds them all (ones the
// file and the medicine database couldn't complete are marked for finishing in
// the catalog), "skip" leaves them all out.
async function decideAll(db, pharmacyId, jobId, action, { includeClose = false } = {}) {
  const job = await getJob(db, pharmacyId, jobId);
  if (job.status !== "ready") throw new JobError("This import can't be changed now");
  if (!["new", "skip"].includes(action)) throw new JobError("Unknown choice");
  const col = db.collection("migration_products");
  const open = { job_id: job.id, decision: null };
  if (action === "skip") {
    await col.updateMany(open, { $set: { decision: "skip", status: "skip", product_id: null, reason: "Left out", decided_by: true, decided_at: now() } });
  } else {
    // Products with a close name in the catalog need a person to pick, unless asked to add those too
    await col.updateMany({ ...open, status: { $in: includeClose ? ["new", "needs_details", "check"] : ["new", "needs_details"] } }, [
      {
        $set: {
          decision: "new",
          catalog_incomplete: { $gt: [{ $size: { $filter: { input: [{ $ifNull: ["$details.manufacturer", ""] }, { $ifNull: ["$details.salt_composition", ""] }], cond: { $eq: ["$$this", ""] } } } }, 0] },
          status: "new",
          reason: { $cond: [{ $eq: ["$status", "new"] }, "$reason", "Added as new; finish any missing manufacturer or salt in the catalog"] },
          decided_by: true,
          decided_at: now(),
        },
      },
    ]);
  }
  await setJob(db, job, { counts: await countJob(db, job) });
}

// ---- 3. Summary --------------------------------------------------------------------------------

async function countJob(db, job) {
  const rows = await db.collection("migration_rows").aggregate([
    { $match: { job_id: job.id } },
    { $group: { _id: { status: "$status", skip: "$skip", result: "$result" }, n: { $sum: 1 } } },
  ]).toArray();
  const counts = { rows: {}, skipped: {}, results: {}, products: {} };
  for (const r of rows) {
    counts.rows[r._id.status] = (counts.rows[r._id.status] || 0) + r.n;
    if (r._id.skip) counts.skipped[r._id.skip] = (counts.skipped[r._id.skip] || 0) + r.n;
    if (r._id.result) counts.results[r._id.result] = (counts.results[r._id.result] || 0) + r.n;
  }
  if (usesProducts(job.entity)) {
    const prods = await db.collection("migration_products").aggregate([{ $match: { job_id: job.id } }, { $group: { _id: "$status", n: { $sum: 1 }, rows: { $sum: "$row_count" } } }]).toArray();
    for (const p of prods) counts.products[p._id] = { products: p.n, rows: p.rows };
  }
  if (job.entity === "purchases") {
    const left = await db.collection("migration_products").distinct("key", { job_id: job.id, decision: "skip" });
    const [t] = await db.collection("migration_rows").aggregate([
      { $match: { job_id: job.id, status: "ok", product_key: { $nin: left }, result: { $nin: ["duplicate", "product_skipped"] } } },
      {
        $group: {
          _id: null,
          bills: { $addToSet: { s: "$data.supplier_name", b: "$data.invoice_no", d: "$data.purchase_date" } },
          suppliers: { $addToSet: "$data.supplier_name" },
          net: { $sum: "$data.net" },
          gross: { $sum: { $multiply: ["$data.net", { $add: [1, { $divide: [{ $ifNull: ["$data.gst_rate", 0] }, 100] }] }] } },
          undated: { $sum: { $cond: ["$data.date_from_file", 0, 1] } },
        },
      },
    ]).toArray();
    counts.purchases = { bills: t?.bills.length || 0, suppliers: t?.suppliers.length || 0, net: round2(t?.net || 0), gross: round2(t?.gross || 0), undated_lines: t?.undated || 0 };
  }
  if (job.entity === "stock") {
    // Totals of what will actually go in: rows of products left out don't count
    const left = await db.collection("migration_products").distinct("key", { job_id: job.id, decision: "skip" });
    const [t] = await db.collection("migration_rows").aggregate([
      { $match: { job_id: job.id, status: "ok", product_key: { $nin: left }, result: { $nin: ["duplicate", "product_skipped"] } } },
      {
        $group: {
          _id: null,
          units: { $sum: "$data.units" },
          mrp_value: { $sum: { $multiply: ["$data.units", { $divide: [{ $ifNull: ["$data.mrp_pack", 0] }, "$data.units_per_pack"] }] } },
          cost_value: { $sum: { $multiply: ["$data.units", { $divide: [{ $ifNull: ["$data.rate_pack", 0] }, "$data.units_per_pack"] }] } },
        },
      },
    ]).toArray();
    counts.stock = { units: t?.units || 0, mrp_value: round2(t?.mrp_value || 0), cost_value: round2(t?.cost_value || 0) };
  }
  return counts;
}

// What still has to be decided before the import can be saved
async function blockers(db, job) {
  if (!usesProducts(job.entity)) return [];
  const open = await db.collection("migration_products").countDocuments({ job_id: job.id, decision: null });
  return open ? [`${open} product${open === 1 ? "" : "s"} still need a decision`] : [];
}

async function jobView(db, pharmacyId, jobId) {
  const job = await getJob(db, pharmacyId, jobId);
  const fields = ENTITIES[job.entity].fields.map(({ key, label, required }) => ({ key, label, required: !!required }));
  return {
    job: publicJob(job),
    fields,
    samples: await samples(db, job),
    guide: SOURCES[job.source]?.guides?.[job.entity] || null,
    blockers: job.status === "ready" ? await blockers(db, job) : [],
    stale: ["checking", "committing", "undoing"].includes(job.status) && isStale(job),
  };
}

async function listRows(db, pharmacyId, jobId, { status, page = 1, limit = 50 }) {
  const job = await getJob(db, pharmacyId, jobId);
  const q = { job_id: job.id };
  if (status) q.status = String(status);
  const lim = Math.min(Math.max(+limit || 50, 1), 500);
  const [rows, total] = await Promise.all([
    db.collection("migration_rows").find(q, { projection: { _id: 0, job_id: 0, cells: 0 } }).sort({ row_no: 1 }).skip((Math.max(+page || 1, 1) - 1) * lim).limit(lim).toArray(),
    db.collection("migration_rows").countDocuments(q),
  ]);
  return { rows, total };
}

async function listProducts(db, pharmacyId, jobId, { status, page = 1, limit = 50 }) {
  const job = await getJob(db, pharmacyId, jobId);
  const q = { job_id: job.id };
  if (status === "open") q.decision = null;
  else if (status) q.status = String(status);
  const lim = Math.min(Math.max(+limit || 50, 1), 200);
  const [products, total] = await Promise.all([
    db.collection("migration_products").find(q, { projection: { _id: 0, job_id: 0 } }).sort({ row_count: -1, key: 1 }).skip((Math.max(+page || 1, 1) - 1) * lim).limit(lim).toArray(),
    db.collection("migration_products").countDocuments(q),
  ]);
  return { products, total };
}

// Problem rows as CSV, for the pharmacy to fix in their old software or spreadsheet
async function problemsCsv(db, pharmacyId, jobId) {
  const job = await getJob(db, pharmacyId, jobId);
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [["Row", "Status", "Problem", ...job.headers].map(esc).join(",")];
  const cursor = db.collection("migration_rows").find({ job_id: job.id, $or: [{ status: { $in: ["error", "skipped"] } }, { result: { $in: ["duplicate", "product_skipped", "failed"] } }] }).sort({ row_no: 1 });
  const label = { no_stock: "No stock", expired: "Expired", duplicate: "Already in DavaDesk", product_skipped: "Product left out", failed: "Couldn't save" };
  for await (const r of cursor) {
    const problem = r.errors?.length ? r.errors.join("; ") : label[r.result] || label[r.skip] || r.status;
    lines.push([r.row_no, r.result || r.status, problem, ...r.cells.map((c) => (c instanceof Date ? c.toISOString().slice(0, 10) : c))].map(esc).join(","));
  }
  return lines.join("\r\n");
}

// ---- 4. Commit ---------------------------------------------------------------------------------

async function startCommit(db, pharmacyId, jobId, actor) {
  const job = await getJob(db, pharmacyId, jobId);
  const resumable = job.status === "failed_commit" || (job.status === "committing" && isStale(job));
  if (job.status !== "ready" && !resumable) throw new JobError(job.status === "committed" ? "This import is already saved" : "This import isn't ready to save");
  const blocking = await blockers(db, job);
  if (blocking.length) throw new JobError(blocking.join(". "));
  const claimed = await db.collection("migration_jobs").findOneAndUpdate(
    { id: job.id, status: job.status, updated_at: job.updated_at },
    { $set: { status: "committing", committed_by: actor, progress: { step: "saving", done: 0, total: job.counts?.rows?.ok || 0 }, error: null, updated_at: now(), heartbeat_at: now() } },
    { returnDocument: "after" }
  );
  if (!claimed) throw new JobError("This import is already being saved", 409);
  runInBackground(db, claimed, () => commit(db, claimed, actor));
  return publicJob(claimed);
}

// Claims a key; returns the record id already holding it, or null if this import may create it
async function claimKey(db, job, entity, key, docId, collection) {
  const keys = db.collection("import_keys");
  try {
    await keys.insertOne({ pharmacy_id: job.pharmacy_id, entity, key, doc_id: docId, collection, job_id: job.id, at: now() });
    return null;
  } catch (err) {
    if (err.code !== 11000) throw err;
    const held = await keys.findOne({ pharmacy_id: job.pharmacy_id, entity, key });
    const exists = held && (await db.collection(held.collection).countDocuments({ id: held.doc_id, pharmacy_id: job.pharmacy_id }, { limit: 1 }));
    if (exists) return held.doc_id;
    // The record it pointed to is gone (deleted, or an interrupted save): take the key over
    await keys.updateOne({ _id: held._id }, { $set: { doc_id: docId, collection, job_id: job.id, at: now() } });
    return null;
  }
}

const stamp = (job) => ({ import_job_id: job.id, import_source: job.source, created_at: now(), updated_at: now() });

const dosageForm = (name) => {
  const n = normalizeText(name);
  if (/\b(cap|caps|capsule)/.test(n)) return "capsule";
  if (/\b(syp|syr|syrup|susp|suspension|solution|liquid)\b/.test(n)) return "syrup";
  if (/\b(inj|injection|vial|amp)\b/.test(n)) return "injection";
  if (/\b(cream|gel|oint|ointment|lotion)\b/.test(n)) return "cream";
  if (/\b(drop|drops)\b/.test(n)) return "drops";
  return "tablet";
};

function productDoc(job, p) {
  const s = p.sample;
  const d = p.details || {};
  const gst = d.gst_rate === null || d.gst_rate === undefined ? 0 : +d.gst_rate;
  const form = dosageForm(s.product_name);
  return {
    id: uuidv4(),
    pharmacy_id: job.pharmacy_id,
    name: s.product_name,
    product_name: s.product_name,
    category: d.category || "medicine",
    dosage_form: form,
    manufacturer: d.manufacturer || "",
    salt_composition: d.salt_composition || "",
    pack_type: s.pack_type || "Strip",
    units_per_pack: s.units_per_pack,
    packaging_label: `${s.units_per_pack} ${form}`,
    package_details: `${s.units_per_pack} ${form}`,
    hsn_no: d.hsn_no || "",
    hsn_code: d.hsn_no || "",
    tax_rate: gst,
    cgst: gst / 2,
    sgst: gst / 2,
    mrp: s.mrp_pack || 0,
    unit_mrp: s.mrp_pack ? round2(s.mrp_pack / s.units_per_pack) : 0,
    trade_price: s.rate_pack || 0,
    purchase_price: s.rate_pack || 0,
    low_stock_threshold: 10,
    shortage_threshold: 10,
    rack_location: s.rack || "",
    barcode: s.barcode || null,
    schedule_h1: null,
    description: null,
    image_url: null,
    source: "catalog",
    is_custom_catalog: true,
    // Added by an import without manufacturer or salt: the catalog asks for them before it's bought again
    ...(p.catalog_incomplete ? { catalog_incomplete: true } : {}),
    ...stamp(job),
  };
}

async function commitProducts(db, job, tick) {
  const ids = new Map(); // product key -> product id
  const cursor = db.collection("migration_products").find({ job_id: job.id });
  for await (const p of cursor) {
    if (p.decision === "use") ids.set(p.key, p.product_id);
    else if (p.decision === "new") {
      const doc = productDoc(job, p);
      const held = await claimKey(db, job, "products", p.key, doc.id, "products");
      if (held) ids.set(p.key, held);
      else {
        doc.product_id = doc.id;
        await db.collection("products").insertOne(doc);
        ids.set(p.key, doc.id);
        await db.collection("migration_products").updateOne({ _id: p._id }, { $set: { created_product_id: doc.id } });
      }
    }
    await tick(0);
  }
  return ids;
}

async function commitStock(db, job, productIds, tick) {
  // Rows naming the same product, batch and expiry become one stock record
  const merged = new Map();
  for await (const r of db.collection("migration_rows").find({ job_id: job.id, status: "ok" }).sort({ row_no: 1 })) {
    const d = r.data;
    const productId = productIds.get(d.product_key);
    if (!productId) {
      await db.collection("migration_rows").updateOne({ _id: r._id }, { $set: { result: "product_skipped" } });
      await tick(1);
      continue;
    }
    const key = `${d.product_key}|${d.batch_no}|${d.expiry_date}`;
    const m = merged.get(key);
    if (m) {
      m.units += d.units;
      m.extra.push(r._id);
    } else merged.set(key, { row: r, productId, units: d.units, extra: [] });
  }

  const products = new Map();
  for (const [key, m] of merged) {
    const d = m.row.data;
    let product = products.get(m.productId);
    if (!product) {
      product = await db.collection("products").findOne({ id: m.productId, pharmacy_id: job.pharmacy_id }, { projection: { _id: 0, id: 1, name: 1, manufacturer: 1, salt_composition: 1, units_per_pack: 1, cgst: 1, sgst: 1, hsn_no: 1 } });
      products.set(m.productId, product);
    }
    const rows = [m.row._id, ...m.extra];
    const already = await db.collection("inventory").findOne(
      { pharmacy_id: job.pharmacy_id, product_id: m.productId, batch_no: looseNameRegex(d.batch_no) },
      { projection: { _id: 0, id: 1 } }
    );
    const id = uuidv4();
    const held = already ? already.id : await claimKey(db, job, "stock", key, id, "inventory");
    if (held) {
      await db.collection("migration_rows").updateMany({ _id: { $in: rows } }, { $set: { result: "duplicate", result_id: held } });
      await tick(rows.length);
      continue;
    }
    const units = m.units;
    const upp = d.units_per_pack || product?.units_per_pack || 1;
    const gst = d.gst_rate === null ? (+product?.cgst || 0) + (+product?.sgst || 0) : d.gst_rate;
    await db.collection("inventory").insertOne({
      id,
      pharmacy_id: job.pharmacy_id,
      product_id: m.productId,
      product_name: product?.name || d.product_name,
      batch_no: d.batch_no,
      hsn_no: d.hsn_no || product?.hsn_no || null,
      expiry_date: d.expiry_date,
      manufacturer: product?.manufacturer || d.manufacturer || null,
      salt_composition: product?.salt_composition || d.salt_composition || null,
      pack_type: d.pack_type || "Strip",
      quantity: units,
      available_quantity: units,
      pack_quantity: round2(units / upp),
      scheme: null,
      units_per_pack: upp,
      purchase_price: d.rate_pack ? round2(d.rate_pack / upp) : null,
      mrp: d.mrp_pack ? round2(d.mrp_pack / upp) : null,
      pack_price: d.rate_pack || null,
      mrp_pack: d.mrp_pack || null,
      cgst: gst / 2,
      sgst: gst / 2,
      discount: 0,
      margin_percent: null,
      purchase_id: null,
      supplier_id: null,
      shortage_threshold: null,
      rack_location: d.rack || null,
      ...stamp(job),
    });
    await db.collection("migration_rows").updateOne({ _id: m.row._id }, { $set: { result: "created", result_id: id } });
    if (m.extra.length) await db.collection("migration_rows").updateMany({ _id: { $in: m.extra } }, { $set: { result: "merged", result_id: id } });
    await tick(rows.length);
  }
}

async function commitParties(db, job, tick) {
  const coll = job.entity; // suppliers | customers
  const phoneField = coll === "suppliers" ? "contact" : "mobile";
  for await (const r of db.collection("migration_rows").find({ job_id: job.id, status: "ok" }).sort({ row_no: 1 })) {
    const d = r.data;
    const phone = d[phoneField] && /^\d{10}$/.test(d[phoneField]) ? d[phoneField] : null;
    const key = d.gst_no ? `gst|${d.gst_no}` : phone ? `mob|${phone}` : `name|${normalizeText(d.name)}`;
    const or = [];
    if (d.gst_no) or.push({ gst_no: d.gst_no });
    if (phone) or.push({ [phoneField]: { $regex: `${phone}$` } });
    if (!d.gst_no && !phone) or.push({ name: looseNameRegex(d.name) });
    const existing = await db.collection(coll).findOne({ pharmacy_id: job.pharmacy_id, $or: or }, { projection: { _id: 0, id: 1 } });
    const id = uuidv4();
    const held = existing ? existing.id : await claimKey(db, job, coll, key, id, coll);
    if (held) {
      await db.collection("migration_rows").updateOne({ _id: r._id }, { $set: { result: "duplicate", result_id: held } });
      await tick(1);
      continue;
    }
    const doc =
      coll === "suppliers"
        ? { id, pharmacy_id: job.pharmacy_id, name: d.name, contact: d.contact || null, email: d.email || null, address: d.address || null, gst_no: d.gst_no || null, notes: d.dl_no ? `DL No: ${d.dl_no}` : null, default_margin_percent: null, ...stamp(job) }
        : { id, pharmacy_id: job.pharmacy_id, name: d.name, mobile: d.mobile || null, email: d.email || null, address: d.address || null, total_debt: 0, total_advance: 0, ...stamp(job) };
    await db.collection(coll).insertOne(doc);
    await db.collection("migration_rows").updateOne({ _id: r._id }, { $set: { result: "created", result_id: id } });
    await tick(1);
  }
}

// Supplier for a name: the pharmacy's own (same name, any spacing or case), else a new one
async function supplierFor(db, job, name, cache) {
  const k = normalizeText(name);
  if (cache.has(k)) return cache.get(k);
  const existing = await db.collection("suppliers").findOne({ pharmacy_id: job.pharmacy_id, name: looseNameRegex(name) }, { projection: { _id: 0, id: 1, name: 1 } });
  let s = existing;
  if (!s) {
    const id = uuidv4();
    const held = await claimKey(db, job, "suppliers", `name|${k}`, id, "suppliers");
    if (held) s = await db.collection("suppliers").findOne({ id: held, pharmacy_id: job.pharmacy_id }, { projection: { _id: 0, id: 1, name: 1 } });
    else {
      s = { id, name };
      await db.collection("suppliers").insertOne({ id, pharmacy_id: job.pharmacy_id, name, contact: null, email: null, address: null, gst_no: null, notes: null, default_margin_percent: null, ...stamp(job) });
    }
  }
  cache.set(k, s);
  return s;
}

// Past bills as purchase records. They are history: stock isn't added, and they're
// marked paid because the report doesn't say what is still owed.
async function commitPurchases(db, job, productIds, tick) {
  const bills = new Map();
  for await (const r of db.collection("migration_rows").find({ job_id: job.id, status: "ok" }).sort({ row_no: 1 })) {
    const d = r.data;
    if (!productIds.get(d.product_key)) {
      await db.collection("migration_rows").updateOne({ _id: r._id }, { $set: { result: "product_skipped" } });
      await tick(1);
      continue;
    }
    const k = `${normalizeText(d.supplier_name)}|${d.invoice_no || "-"}|${d.purchase_date}`;
    if (!bills.has(k)) bills.set(k, []);
    bills.get(k).push(r);
  }

  const suppliers = new Map();
  const products = new Map();
  for (const [k, rows] of bills) {
    const first = rows[0].data;
    const supplier = await supplierFor(db, job, first.supplier_name, suppliers);
    const ids = rows.map((r) => r._id);
    const id = uuidv4();
    const already = first.invoice_no
      ? await db.collection("purchases").findOne({ pharmacy_id: job.pharmacy_id, supplier_id: supplier.id, invoice_no: looseNameRegex(first.invoice_no), purchase_date: first.purchase_date }, { projection: { _id: 0, id: 1 } })
      : null;
    const held = already ? already.id : await claimKey(db, job, "purchases", k, id, "purchases");
    if (held) {
      await db.collection("migration_rows").updateMany({ _id: { $in: ids } }, { $set: { result: "duplicate", result_id: held } });
      await tick(ids.length);
      continue;
    }
    let total = 0;
    const items = [];
    for (const r of rows) {
      const d = r.data;
      const productId = productIds.get(d.product_key);
      let product = products.get(productId);
      if (!product) {
        product = await db.collection("products").findOne({ id: productId, pharmacy_id: job.pharmacy_id }, { projection: { _id: 0, id: 1, name: 1, manufacturer: 1, salt_composition: 1, hsn_no: 1 } });
        products.set(productId, product);
      }
      const gst = d.gst_rate === null ? 0 : d.gst_rate;
      const itemTotal = d.net * (1 + gst / 100);
      total += itemTotal;
      const perUnit = d.units ? Math.round((d.net / d.units) * 10000) / 10000 : 0;
      const mrpUnit = d.mrp_pack ? round2(d.mrp_pack / d.units_per_pack) : null;
      items.push({
        product_id: productId,
        product_name: product?.name || d.product_name,
        batch_no: d.batch_no,
        expiry_date: d.expiry_date,
        manufacturer: product?.manufacturer || d.manufacturer || null,
        salt_composition: product?.salt_composition || null,
        pack_type: d.pack_type || "Strip",
        quantity: d.units,
        pack_quantity: d.pack_qty,
        scheme: d.free_packs || 0,
        units_per_pack: d.units_per_pack,
        total_units: d.units,
        purchase_price: perUnit,
        pack_price: d.rate_pack || 0,
        price_per_unit: perUnit,
        cost_per_unit: perUnit,
        mrp: mrpUnit,
        mrp_per_unit: mrpUnit,
        mrp_pack: d.mrp_pack || null,
        hsn_no: d.hsn_no || product?.hsn_no || null,
        item_total: round2(itemTotal),
        cgst: gst / 2,
        sgst: gst / 2,
        discount: d.discount,
        scheme_discount: 0,
        scheme_discount_type: "percent",
        scheme_discount_amount: 0,
        margin_percent: null,
        shortage_threshold: null,
      });
    }
    total = round2(total);
    await db.collection("purchases").insertOne({
      id,
      pharmacy_id: job.pharmacy_id,
      supplier_id: supplier.id,
      supplier_name: supplier.name,
      invoice_no: first.invoice_no,
      purchase_date: first.purchase_date,
      items,
      total_amount: total,
      payment_status: "Paid",
      amount_paid: total,
      payments: [{ id: uuidv4(), amount: total, date: first.purchase_date, notes: "Imported as paid: the old software's report doesn't say what is still owed" }],
      payment_mode: null,
      created_by: "import",
      notes: `Imported from ${SOURCES[job.source].label} (${job.file_name})${first.date_from_file ? "" : `. The report has no bill dates, so it's dated ${first.purchase_date}`}`,
      imported: true,
      stock_added: false,
      date_from_file: !!first.date_from_file,
      ...stamp(job),
    });
    await db.collection("migration_rows").updateMany({ _id: { $in: ids } }, { $set: { result: "created", result_id: id } });
    await tick(ids.length);
  }
}

async function commit(db, job, actor) {
  let done = 0;
  let last = 0;
  const total = job.counts?.rows?.ok || 0;
  const tick = async (n) => {
    done += n;
    if (Date.now() - last > 1500) {
      last = Date.now();
      await setJob(db, job, { progress: { step: "saving", done, total } });
    }
  };
  if (usesProducts(job.entity)) {
    const ids = await commitProducts(db, job, tick);
    if (job.entity === "stock") await commitStock(db, job, ids, tick);
    else if (job.entity === "purchases") await commitPurchases(db, job, ids, tick);
    else {
      // A product list has no stock: each row is done once its product is
      for await (const r of db.collection("migration_rows").find({ job_id: job.id, status: "ok" })) {
        const id = ids.get(r.data.product_key);
        await db.collection("migration_rows").updateOne({ _id: r._id }, { $set: id ? { result: "created", result_id: id } : { result: "product_skipped" } });
      }
    }
  } else await commitParties(db, job, tick);

  const counts = await countJob(db, job);
  await setJob(db, job, { status: "committed", progress: null, counts, committed_at: now() });
  const who = actor?.type === "admin" ? `DavaDesk team (${actor.email})` : actor?.name || "Admin";
  const made = counts.results.created || 0;
  await logActivity(db, job.pharmacy_id, actor?.id || "davadesk-import", who, "CREATE", "IMPORT", job.id, `Imported ${made} ${ENTITIES[job.entity].label.toLowerCase()} from ${SOURCES[job.source].label} (${job.file_name})`, "/settings");
}

// ---- 5. Undo -----------------------------------------------------------------------------------

// Removes what this import made, except records already used (sold, billed, bought against)
async function undo(db, pharmacyId, jobId, actor) {
  const job = await getJob(db, pharmacyId, jobId);
  if (!["committed", "failed_commit", "partly_undone"].includes(job.status)) throw new JobError("Only a saved import can be undone");
  const claimed = await db.collection("migration_jobs").findOneAndUpdate({ id: job.id, status: job.status }, { $set: { status: "undoing", updated_at: now(), heartbeat_at: now() } });
  if (!claimed) throw new JobError("This import is already being undone", 409);

  try {
    const P = job.pharmacy_id;
    const mine = { pharmacy_id: P, import_job_id: job.id };
    const kept = {};
    const removed = {};
    const remove = async (coll, ids) => {
      if (!ids.length) return;
      for (let i = 0; i < ids.length; i += CHUNK) await db.collection(coll).deleteMany({ ...mine, id: { $in: ids.slice(i, i + CHUNK) } });
      removed[coll] = (removed[coll] || 0) + ids.length;
    };
    const idsOf = (coll, extra = {}) => db.collection(coll).find({ ...mine, ...extra }, { projection: { _id: 0, id: 1 } }).toArray().then((d) => d.map((x) => x.id));
    const usedBy = async (coll, field, ids) => {
      const used = new Set();
      for (let i = 0; i < ids.length; i += CHUNK) {
        (await db.collection(coll).distinct(field, { pharmacy_id: P, [field]: { $in: ids.slice(i, i + CHUNK) } })).forEach((x) => used.add(String(x)));
      }
      return used;
    };

    // Imported purchase records are history (no stock moved), so they always go
    await remove("purchases", await idsOf("purchases"));

    // Stock: only batches nothing has been taken from
    const stock = await db.collection("inventory").find(mine, { projection: { _id: 0, id: 1, quantity: 1, available_quantity: 1 } }).toArray();
    const billed = await usedBy("bills", "items.inventory_id", stock.map((s) => s.id));
    const freeStock = stock.filter((s) => s.available_quantity === s.quantity && !billed.has(s.id)).map((s) => s.id);
    kept.inventory = stock.length - freeStock.length;
    await remove("inventory", freeStock);

    // Products: only ones with no stock left and no bills or purchases naming them
    const products = await idsOf("products");
    if (products.length) {
      const withStock = await usedBy("inventory", "product_id", products);
      const inBills = await usedBy("bills", "items.product_id", products);
      const inPurchases = await usedBy("purchases", "items.product_id", products);
      const free = products.filter((id) => !withStock.has(id) && !inBills.has(id) && !inPurchases.has(id));
      kept.products = products.length - free.length;
      await remove("products", free);
    }
    for (const [coll, field, by] of [["suppliers", "supplier_id", "purchases"], ["customers", "customer_id", "bills"]]) {
      const ids = await idsOf(coll);
      if (!ids.length) continue;
      const used = await usedBy(by, field, ids);
      const free = ids.filter((id) => !used.has(id));
      kept[coll] = ids.length - free.length;
      await remove(coll, free);
    }
    // Keys of removed records go, so the same data can be imported again
    const left = new Set();
    for (const coll of ["inventory", "products", "suppliers", "customers", "purchases"]) (await idsOf(coll)).forEach((id) => left.add(id));
    await db.collection("import_keys").deleteMany({ job_id: job.id, doc_id: { $nin: [...left] } });

    const keptTotal = Object.values(kept).reduce((a, b) => a + b, 0);
    await setJob(db, job, { status: keptTotal ? "partly_undone" : "undone", undo: { at: now(), by: actor, removed, kept } });
    const who = actor?.type === "admin" ? `DavaDesk team (${actor.email})` : actor?.name || "Admin";
    await logActivity(db, P, actor?.id || "davadesk-import", who, "DELETE", "IMPORT", job.id, `Undid import of ${job.file_name}${keptTotal ? ` (${keptTotal} records kept because they're in use)` : ""}`, "/settings");
    return { removed, kept };
  } catch (err) {
    await setJob(db, job, { status: job.status, error: `Undo stopped: ${err.message}` });
    throw err;
  }
}

async function listJobs(db, pharmacyId) {
  await ensureIndexes(db);
  const jobs = await db.collection("migration_jobs").find({ pharmacy_id: pharmacyId }, { projection: { _id: 0, headers: 0 } }).sort({ created_at: -1 }).limit(100).toArray();
  return jobs;
}

// A job that never got saved can be thrown away with its staged rows
async function discard(db, pharmacyId, jobId) {
  const job = await getJob(db, pharmacyId, jobId);
  if (!["mapped", "ready", "failed"].includes(job.status)) throw new JobError("Only an import that hasn't been saved can be discarded");
  await db.collection("migration_rows").deleteMany({ job_id: job.id });
  await db.collection("migration_products").deleteMany({ job_id: job.id });
  await db.collection("migration_jobs").deleteOne({ id: job.id });
}

// Restarts a background step that stopped (for example, the server restarted)
async function resume(db, pharmacyId, jobId, actor) {
  const job = await getJob(db, pharmacyId, jobId);
  if (job.status === "checking" && isStale(job)) {
    await setJob(db, job, { status: "mapped" });
    return applyMapping(db, pharmacyId, jobId, {});
  }
  if (job.status === "committing" && isStale(job)) return startCommit(db, pharmacyId, jobId, actor);
  if (job.status === "undoing" && isStale(job)) {
    await setJob(db, job, { status: "committed" });
    return undo(db, pharmacyId, jobId, actor);
  }
  throw new JobError("Nothing to resume");
}

module.exports = {
  JobError,
  createJob,
  applyMapping,
  decideProduct,
  decideAll,
  jobView,
  listRows,
  listProducts,
  problemsCsv,
  startCommit,
  undo,
  listJobs,
  discard,
  resume,
  matchOne,
};
