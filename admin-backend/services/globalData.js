// Global catalogues shared by every pharmacy: medicines, doctors and
// distributors. Records written here use the same fields (and, for medicines,
// the same precomputed search keys) the main API's suggestions read, so an
// added record shows up for users as soon as their search cache turns over.
const { z } = require("zod");
const { buildMedicineSearchKeys, normalizeText, queryGrams, escapeRegex } = require("./search/normalize");

const KINDS = {
  medicines: { col: "global_medicines", idField: "product_id", codeField: "product_code", prefix: "MED-", base: 80000000, nameField: "product_name", queueKind: "medicine" },
  doctors: { col: "global_doctors", idField: "practitioner_id", codeField: "practitioner_code", prefix: "DOC-", base: 20000000, nameField: "full_name", queueKind: "doctor" },
  distributors: { col: "global_distributors", idField: "supplier_id", codeField: "supplier_code", prefix: "DST-", base: 50000000, nameField: "agency_name", queueKind: "distributor" },
};
const KIND_BY_QUEUE = Object.fromEntries(Object.entries(KINDS).map(([k, v]) => [v.queueKind, k]));

const str = (max = 200) => z.string().trim().max(max);
const num = z.number().finite().min(0).max(10_000_000);
const GST_RE = /^[0-9]{2}[A-Z0-9]{10}[0-9A-Z]Z[0-9A-Z]$/;

const SCHEMAS = {
  medicines: z.object({
    product_name: str(200).min(2, "Name is required"),
    brand: str(120).optional(),
    manufacturer: str(200).optional(),
    dosage_form: str(60).optional(),
    product_category: str(60).optional(),
    packaging_label: str(120).optional(),
    package_details: str(200).optional(),
    units_per_pack: z.number().int().min(1).max(10000).optional(),
    mrp: num.optional(),
    unit_mrp: num.optional(),
    trade_price: num.optional(),
    tax_rate: z.number().min(0).max(40).optional(),
    hsn_code: str(20).optional(),
    active_ingredients: str(500).optional(),
    prescription_required: z.boolean().optional(),
    drug_schedule: str(20).optional(),
    is_discontinued: z.boolean().optional(),
  }),
  doctors: z.object({
    full_name: str(150).min(2, "Name is required"),
    clinic_hospital: str(200).optional(),
    medical_registration_no: str(60).optional(),
    locality: str(120).optional(),
    city: str(120).optional(),
    state: str(120).optional(),
  }),
  distributors: z.object({
    agency_name: str(200).min(2, "Name is required"),
    contact_person: str(120).optional(),
    contact_number: str(30).optional(),
    gst_number: z
      .string()
      .trim()
      .toUpperCase()
      .refine((v) => !v || GST_RE.test(v), "GSTIN should be 15 characters, like 27ABCDE1234F1Z5")
      .optional(),
    locality: str(120).optional(),
    city: str(120).optional(),
    state: str(120).optional(),
  }),
};

const slugify = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

const splitDoctorName = (full) => {
  const parts = String(full).replace(/^dr\.?\s*/i, "").trim().split(/\s+/);
  return { first_name: parts.length > 1 ? parts.slice(0, -1).join(" ") : parts[0] || "", last_name: parts.length > 1 ? parts[parts.length - 1] : "" };
};

// Fields derived from what the admin typed (on create, and again on edit)
function derived(kind, doc) {
  if (kind === "medicines") {
    const units = doc.units_per_pack || 1;
    return {
      search_keyword: doc.product_name,
      brand: doc.brand || String(doc.product_name).split(/\s+/)[0],
      unit_mrp: doc.unit_mrp ?? (doc.mrp ? Math.round((doc.mrp / units) * 100) / 100 : 0),
      selling_price: doc.mrp ?? 0,
      ...buildMedicineSearchKeys(doc),
    };
  }
  if (kind === "doctors") return splitDoctorName(doc.full_name);
  if (kind === "distributors") return doc.gst_number ? { pan_number: doc.gst_number.slice(2, 12), tax_category: "regular" } : {};
  return {};
}

const DEFAULTS = {
  medicines: { manufacturer: "", dosage_form: "", product_category: "drug", packaging_label: "", package_details: "", units_per_pack: 1, mrp: 0, trade_price: 0, tax_rate: 12, cess_rate: 0, hsn_code: "", active_ingredients: "", prescription_required: false, narcotic_schedule: false, drug_schedule: "", is_discontinued: false, image_url: "", thumbnail_url: "", rank_score: 10 },
  doctors: { clinic_hospital: "", medical_registration_no: "", locality: "", city: "", state: "", is_affiliated: false },
  distributors: { contact_person: "", contact_number: "", gst_number: "", pan_number: "", tax_category: "", locality: "", city: "", state: "", billing_software: "", is_partner: false },
};

// Hide search keys from API responses
const PUBLIC_PROJECTION = { s_name_grams: 0, s_salt_grams: 0 };

// A record that looks like the same thing already in the catalogue
async function findDuplicate(gdb, kind, data) {
  const k = KINDS[kind];
  const c = gdb.collection(k.col);
  if (kind === "medicines") return c.findOne({ s_name: normalizeText(data.product_name) }, { projection: PUBLIC_PROJECTION });
  if (kind === "distributors" && data.gst_number) return c.findOne({ gst_number: data.gst_number }, { projection: PUBLIC_PROJECTION });
  const nameRe = new RegExp(`^${escapeRegex(data[k.nameField].trim())}$`, "i");
  const q = { [k.nameField]: nameRe };
  if (data.city) q.city = new RegExp(`^${escapeRegex(data.city.trim())}$`, "i");
  return c.findOne(q, { projection: PUBLIC_PROJECTION });
}

// Insert with the next numeric id; the unique id/code indexes catch races
async function create(gdb, kind, data, actor) {
  const k = KINDS[kind];
  const c = gdb.collection(k.col);
  const now = new Date().toISOString();
  for (let attempt = 0; attempt < 6; attempt++) {
    const last = await c.find({ [k.idField]: { $type: "number" } }, { projection: { [k.idField]: 1 } }).sort({ [k.idField]: -1 }).limit(1).next();
    const id = Math.max(k.base, Number(last?.[k.idField]) || 0) + 1 + attempt;
    const code = `${k.prefix}${id}`;
    const doc = { [k.idField]: id, [k.codeField]: code, ...DEFAULTS[kind], ...data };
    Object.assign(doc, derived(kind, doc));
    if (kind === "medicines") doc.product_slug = `${slugify(doc.product_name)}-${code.toLowerCase()}`;
    Object.assign(doc, { source: "admin", added_by: actor?.admin_email || null, created_at: now, updated_at: now });
    try {
      const r = await c.insertOne(doc);
      return { ...doc, _id: r.insertedId };
    } catch (err) {
      if (err.code !== 11000) throw err;
    }
  }
  throw Object.assign(new Error("Couldn't allocate a new id, try again"), { status: 409 });
}

async function update(gdb, kind, _id, data, actor) {
  const k = KINDS[kind];
  const c = gdb.collection(k.col);
  const before = await c.findOne({ _id });
  if (!before) return null;
  const merged = { ...before, ...data };
  // A new pack price or size recomputes the unit price unless one was given
  if (kind === "medicines" && data.unit_mrp === undefined && (data.mrp !== undefined || data.units_per_pack !== undefined)) delete merged.unit_mrp;
  const $set = { ...data, ...derived(kind, merged), updated_at: new Date().toISOString(), updated_by: actor?.admin_email || null };
  await c.updateOne({ _id }, { $set });
  const after = await c.findOne({ _id }, { projection: PUBLIC_PROJECTION });
  const { s_name_grams, s_salt_grams, ...beforePublic } = before;
  return { before: beforePublic, after };
}

// Search one catalogue: by code, GSTIN/registration number, or name
async function search(gdb, kind, q, limit = 20) {
  const k = KINDS[kind];
  const c = gdb.collection(k.col);
  const term = String(q || "").trim().slice(0, 100);
  if (!term) return c.find({}, { projection: PUBLIC_PROJECTION }).sort({ _id: -1 }).limit(limit).toArray();
  if (new RegExp(`^${k.prefix}\\d+$`, "i").test(term)) return c.find({ [k.codeField]: term.toUpperCase() }, { projection: PUBLIC_PROJECTION }).limit(limit).toArray();

  if (kind === "medicines") {
    const grams = queryGrams(term);
    if (!grams.length) return [];
    return c.find({ s_name_grams: { $all: grams } }, { projection: PUBLIC_PROJECTION }).sort({ rank_score: -1 }).limit(limit).toArray();
  }
  if (kind === "distributors" && /^[0-9]{2}[A-Z0-9]{10,13}$/i.test(term)) {
    return c.find({ gst_number: { $regex: `^${escapeRegex(term.toUpperCase())}` } }, { projection: PUBLIC_PROJECTION }).limit(limit).toArray();
  }
  const e = escapeRegex(term);
  const prefix = kind === "doctors" ? `^(dr\\.?\\s*)?${e}` : `^${e}`;
  const first = await c.find({ [k.nameField]: { $regex: prefix, $options: "i" } }, { projection: PUBLIC_PROJECTION }).limit(limit).toArray();
  if (first.length >= limit) return first;
  const seen = first.map((d) => d._id);
  const extraFields = kind === "doctors" ? ["medical_registration_no", "clinic_hospital"] : ["gst_number", "contact_number", "city"];
  const more = await c
    .find({ _id: { $nin: seen }, $or: [k.nameField, ...extraFields].map((f) => ({ [f]: { $regex: e, $options: "i" } })) }, { projection: PUBLIC_PROJECTION })
    .limit(limit - first.length)
    .toArray();
  return [...first, ...more];
}

module.exports = { KINDS, KIND_BY_QUEUE, SCHEMAS, PUBLIC_PROJECTION, create, update, search, findDuplicate };
