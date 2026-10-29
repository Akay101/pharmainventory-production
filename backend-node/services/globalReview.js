// Background check of new pharmacy records against the global catalogues.
//
// When a pharmacy creates a catalogue product, doctor or supplier, the API
// queues a job (never awaited, so the request isn't slowed). The worker
// fuzzy-matches the name against global_medicines / global_doctors /
// global_distributors; when nothing matches, the name goes into
// `global_review_queue` (one entry per kind + normalised name, listing the
// pharmacies that created it) for an admin to dismiss or add in the admin
// panel's Global Data Manager.
const { Queue } = require("bullmq");
const { makeConnection } = require("./ai/queue");
const { normalizeText, cleanProductName, medicineKey, escapeRegex } = require("./search/normalize");

const QUEUE_NAME = "global-review";
const COLLECTION = "global_review_queue";
const KINDS = ["medicine", "doctor", "distributor"];

// ---------------------------------------------------------------------------
// Producer (API)

let queue = null;
const getQueue = () => {
  if (!queue) {
    // Offline queue off: while Redis is down, add() fails at once instead of
    // piling up in memory
    const connection = makeConnection({ maxRetriesPerRequest: null, enableOfflineQueue: false });
    connection.on("error", (err) => console.warn("[GlobalReview:redis]", err.message));
    queue = new Queue(QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        attempts: 6,
        backoff: { type: "exponential", delay: 60000 },
        removeOnComplete: { age: 3600 },
        removeOnFail: { age: 7 * 86400 },
      },
    });
    queue.on("error", (err) => console.warn("[GlobalReview:queue]", err.message));
  }
  return queue;
};

const clean = (v, max = 200) => (v === undefined || v === null ? "" : String(v).trim().slice(0, max));
const meaningful = (name) => name.length >= 3 && /[a-z]{2}/i.test(name);

// Queue a check. Fire and forget: never throws, never blocks the caller.
function queueGlobalCheck(kind, pharmacyId, record) {
  try {
    const name = clean(record?.name);
    if (!KINDS.includes(kind) || !pharmacyId || !meaningful(name)) return;
    const data = { kind, pharmacy_id: String(pharmacyId), record_id: record.id ?? null, name, details: detailsOf(kind, record) };
    // Same record queued twice (retries, double submit) runs once
    const jobId = ["gr", kind, pharmacyId, record.id || normalizeText(name).replace(/\s+/g, "_")].join("-").slice(0, 200);
    // Short delay: records created inside a transaction are committed by then
    getQueue()
      .add(kind, data, { jobId, delay: 5000 })
      .catch((err) => console.warn("[GlobalReview] queue failed:", err.message));
  } catch (err) {
    console.warn("[GlobalReview] queue failed:", err.message);
  }
}

// What the admin sees to fill in the global record, in its field names
function detailsOf(kind, r) {
  if (kind === "medicine") {
    return {
      manufacturer: clean(r.manufacturer),
      active_ingredients: clean(r.salt_composition || r.active_ingredients, 500),
      dosage_form: clean(r.dosage_form, 60),
      packaging_label: clean(r.packaging_label || r.package_details, 120),
      units_per_pack: Number(r.units_per_pack) || null,
      mrp: Number(r.mrp) || null,
      hsn_code: clean(r.hsn_no || r.hsn_code, 20),
      tax_rate: r.tax_rate === undefined || r.tax_rate === null || r.tax_rate === "" ? null : Number(r.tax_rate),
    };
  }
  if (kind === "doctor") {
    return { medical_registration_no: clean(r.license_number || r.registration_no, 60), clinic_hospital: clean(r.clinic), city: clean(r.city), state: clean(r.state) };
  }
  return {
    contact_number: clean(r.phone || r.contact, 30),
    gst_number: clean(r.gstin || r.gst_no, 20).toUpperCase(),
    city: clean(r.city),
    state: clean(r.state),
    address: clean(r.address, 300),
  };
}

// ---------------------------------------------------------------------------
// Matching (worker)

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}
const similarity = (a, b) => (!a || !b ? 0 : 1 - levenshtein(a, b) / Math.max(a.length, b.length));
const sortedTokens = (s) => s.split(" ").filter(Boolean).sort().join(" ");

const FORM_WORDS = new Set(["tab", "tabs", "tablet", "tablets", "cap", "caps", "capsule", "capsules", "syp", "syr", "syrup", "inj", "injection", "susp", "suspension", "oint", "ointment", "cream", "gel", "drop", "drops", "mg", "ml", "gm", "g", "mcg", "iu", "strip", "bottle"]);
const medicineCore = (s) => s.split(" ").filter((t) => !FORM_WORDS.has(t)).join(" ");
const doctorName = (s) => normalizeText(s).replace(/^(dr|doctor)\s+/, "").trim();
const LEGAL_WORDS = new Set(["pvt", "private", "ltd", "limited", "llp", "m", "s", "the", "co", "company", "and"]);
const companyName = (s) => normalizeText(s).split(" ").filter((t) => !LEGAL_WORDS.has(t)).join(" ");
const GST_RE = /^[0-9]{2}[A-Z0-9]{10}[0-9A-Z]Z[0-9A-Z]$/;

// Dedupe key of a queue entry
function reviewKey(kind, name, details = {}) {
  if (kind === "medicine") return medicineKey(name) || normalizeText(name);
  if (kind === "doctor") return sortedTokens(doctorName(name));
  if (GST_RE.test(details.gst_number || "")) return `gst:${details.gst_number}`;
  return companyName(name);
}

// Longest word: the most selective one for a contains-search
const longestToken = (s) => s.split(" ").sort((a, b) => b.length - a.length)[0] || "";

async function textAndRegex(col, field, norm, limit = 30) {
  const out = new Map();
  const add = (rows) => rows.forEach((r) => out.set(String(r._id), r));
  add(await col.find({ $text: { $search: norm } }).limit(limit).toArray().catch(() => []));
  const token = longestToken(norm);
  if (token.length >= 3) add(await col.find({ [field]: { $regex: escapeRegex(token), $options: "i" } }).limit(limit).toArray().catch(() => []));
  return [...out.values()];
}

// { match, candidates } for one name against its global catalogue.
// `globals` holds the three collections.
async function findGlobalMatch(kind, name, details, globals) {
  if (kind === "medicine") {
    const { searchGlobalMedicines } = require("./search/medicineSearch");
    const cands = await searchGlobalMedicines(cleanProductName(name) || name, { limit: 30 });
    const qn = normalizeText(cleanProductName(name) || name);
    const qk = medicineKey(name);
    const scored = cands.map((c) => {
      const cname = c.product_name || c.name || "";
      const cn = normalizeText(cname);
      const sim = Math.max(similarity(medicineCore(qn), medicineCore(cn)), similarity(qn, cn));
      const same = medicineKey(cname) === qk || cn === qn || cn.startsWith(`${qn} `) || sim >= 0.88;
      return { c, cname, sim, same };
    });
    return pack(scored, (s) => ({ code: s.c.product_code || null, name: s.cname, detail: s.c.manufacturer || "" }));
  }

  if (kind === "doctor") {
    const qn = doctorName(name);
    const reg = String(details.medical_registration_no || "").trim();
    if (reg) {
      const byReg = await globals.doctors.findOne({ medical_registration_no: reg });
      if (byReg) return { match: { code: byReg.practitioner_code, name: byReg.full_name }, candidates: [] };
    }
    const cands = await textAndRegex(globals.doctors, "full_name", qn);
    const scored = cands.map((c) => {
      const cn = doctorName(c.full_name || "");
      const sim = Math.max(similarity(qn, cn), similarity(sortedTokens(qn), sortedTokens(cn)));
      return { c, cname: c.full_name, sim, same: cn === qn || sortedTokens(cn) === sortedTokens(qn) || sim >= 0.9 };
    });
    return pack(scored, (s) => ({ code: s.c.practitioner_code || null, name: s.cname, detail: [s.c.clinic_hospital, s.c.city].filter(Boolean).join(", ") }));
  }

  const gst = String(details.gst_number || "").toUpperCase();
  if (GST_RE.test(gst)) {
    const byGst = await globals.distributors.findOne({ gst_number: gst });
    if (byGst) return { match: { code: byGst.supplier_code, name: byGst.agency_name }, candidates: [] };
  }
  const qn = companyName(name);
  const cands = await textAndRegex(globals.distributors, "agency_name", normalizeText(name));
  const scored = cands.map((c) => {
    const cn = companyName(c.agency_name || "");
    const sim = similarity(qn, cn);
    // Same name in another city is a different distributor only when both cities are known
    const otherCity = details.city && c.city && normalizeText(details.city) !== normalizeText(c.city);
    return { c, cname: c.agency_name, sim, same: !otherCity && (cn === qn || sim >= 0.9) };
  });
  return pack(scored, (s) => ({ code: s.c.supplier_code || null, name: s.cname, detail: [s.c.city, s.c.gst_number].filter(Boolean).join(" · ") }));
}

function pack(scored, view) {
  const hit = scored.find((s) => s.same);
  if (hit) return { match: view(hit), candidates: [] };
  const candidates = scored
    .sort((a, b) => b.sim - a.sim)
    .slice(0, 5)
    .map((s) => ({ ...view(s), similarity: Math.round(s.sim * 100) / 100 }));
  return { match: null, candidates };
}

async function ensureReviewIndexes(db) {
  await Promise.all([
    db.collection(COLLECTION).createIndex({ kind: 1, key: 1 }, { unique: true, name: "kind_key" }),
    db.collection(COLLECTION).createIndex({ status: 1, last_seen_at: -1 }, { name: "status_seen" }),
  ]);
}

// Add (or add a pharmacy to) the review entry for a name not in the catalogue.
// One entry per kind + key; dismissed and added entries stay closed.
async function recordMissing(db, { kind, name, details, pharmacy_id, pharmacy_name, record_id, candidates }) {
  const col = db.collection(COLLECTION);
  const key = reviewKey(kind, name, details);
  if (!key) return null;
  const now = new Date();
  const upsert = () =>
    col.updateOne(
      { kind, key },
      { $setOnInsert: { kind, key, name, details, status: "PENDING", first_seen_at: now, sources: [], pharmacy_count: 0 }, $set: { last_seen_at: now, candidates } },
      { upsert: true }
    );
  try {
    await upsert();
  } catch (err) {
    if (err.code !== 11000) throw err;
    await upsert(); // lost an insert race; the entry exists now
  }
  await col.updateOne(
    { kind, key, "sources.pharmacy_id": { $ne: pharmacy_id } },
    { $push: { sources: { $each: [{ pharmacy_id, pharmacy_name, record_id, name, details, at: now }], $slice: 20 } }, $inc: { pharmacy_count: 1 } }
  );
  return key;
}

module.exports = { QUEUE_NAME, COLLECTION, queueGlobalCheck, findGlobalMatch, recordMissing, reviewKey, ensureReviewIndexes, similarity };
