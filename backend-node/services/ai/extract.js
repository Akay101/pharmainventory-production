// What we ask the AI for, and how its answer is cleaned up.
//
// Prompts are short and specific; the JSON shape is enforced with a response
// schema rather than described in prose. Everything the model returns is
// treated as untrusted and normalised here: numbers, expiry dates, pack sizes.
const { extractJson } = require("./gemini");

const PRODUCT_SCHEMA = {
  type: "OBJECT",
  properties: {
    product_name: { type: "STRING", description: "Brand + strength + dosage form only, e.g. 'Dolo 650 Tablet', 'Pan 40 Tablet', 'Benadryl Cough Syrup'" },
    manufacturer: { type: "STRING" },
    salt_composition: { type: "STRING", description: "Active ingredients with strengths" },
    batch_no: { type: "STRING", description: "Batch/Lot number exactly as printed, or empty" },
    batch_legible: { type: "BOOLEAN", description: "true only if every character of the batch number is clearly readable" },
    expiry: { type: "STRING", description: "Expiry exactly as printed, e.g. '05/2027', 'MAY 27'" },
    mrp: { type: "NUMBER", description: "MRP in rupees for the whole pack shown, 0 if not visible" },
    pack_size: { type: "STRING", description: "e.g. '15 Tablets', '10 x 10 Capsules', '100 ml'" },
    units_per_pack: { type: "INTEGER", description: "Countable units (tablets/capsules) in one strip or pack; 1 for bottles, tubes, vials" },
    pack_type: { type: "STRING", enum: ["Strip", "Bottle", "Tube", "Box", "Vial", "Ampoule", "Sachet", "Jar", "Packet", "Other"] },
    hsn_no: { type: "STRING" },
    confidence: { type: "INTEGER", description: "0-100: how sure you are the name, batch and MRP are read correctly" },
  },
  required: ["product_name", "batch_no", "batch_legible", "expiry", "mrp", "units_per_pack", "pack_type", "confidence"],
};

const PRODUCT_PROMPT = `You are reading photos of ONE Indian medicine pack (strip, bottle, tube or box), possibly from several angles.
Read only what is printed. Rules:
- product_name: the BRAND name + strength + dosage form, title case (e.g. "Dolo 650 Tablet", "Augmentin 625 Duo Tablet"). Do not include the generic/salt description like "Paracetamol Tablets I.P."; that goes in salt_composition. Never invent a different brand.
- batch_no: copy character by character from "B.No"/"Batch"/"Lot". Keep letters vs digits exactly (O vs 0, I vs 1). If you cannot read it all, still return your best reading and set batch_legible to false.
- expiry: copy the "EXP"/"Use before" value as printed. Do not confuse it with MFG date.
- mrp: the MRP for the whole pack (Rs./₹), number only.
- manufacturer and salt_composition: as printed; if not printed but you are certain for this exact brand, fill them in.
- units_per_pack: tablets/capsules per strip or pack (e.g. "10 x 15" strip of 15 -> 15). Use 1 for liquids, creams, injections.`;

const BILL_SCHEMA = {
  type: "OBJECT",
  properties: {
    supplier_name: { type: "STRING" },
    supplier_gstin: { type: "STRING" },
    invoice_no: { type: "STRING" },
    invoice_date: { type: "STRING", description: "As printed" },
    items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          product_name: { type: "STRING" },
          manufacturer: { type: "STRING" },
          pack: { type: "STRING", description: "Pack column as printed, e.g. '10S', '1X15', '100ML'" },
          units_per_pack: { type: "INTEGER", description: "Units in one pack from the pack column; 1 for liquids" },
          batch_no: { type: "STRING" },
          expiry: { type: "STRING", description: "As printed" },
          quantity: { type: "NUMBER", description: "Billed quantity in packs (not free)" },
          free_quantity: { type: "NUMBER", description: "Free/scheme quantity in packs, 0 if none" },
          rate: { type: "NUMBER", description: "Purchase rate per pack (PTR/Rate), before tax" },
          mrp: { type: "NUMBER", description: "MRP per pack" },
          discount_percent: { type: "NUMBER", description: "Trade discount %, 0 if none" },
          gst_percent: { type: "NUMBER", description: "Total GST % for the line (CGST+SGST or IGST)" },
          hsn_no: { type: "STRING" },
          amount: { type: "NUMBER", description: "Line amount as printed" },
        },
        required: ["product_name", "batch_no", "expiry", "quantity", "rate", "mrp"],
      },
    },
    confidence: { type: "INTEGER", description: "0-100: how sure you are every line was read correctly" },
  },
  required: ["supplier_name", "invoice_no", "items", "confidence"],
};

const BILL_PROMPT = `You are reading a page of an Indian pharmaceutical distributor's purchase invoice.
Extract every product line of the item table, top to bottom, one object per printed line. Rules:
- Use the column headers to map values. Do not skip lines and do not merge lines.
- Copy names and batch numbers exactly as printed. Never substitute a different medicine.
- quantity is the billed qty column; free/scheme qty goes in free_quantity.
- rate is the purchase rate per pack (PTR/Rate). mrp is the MRP per pack. MRP is never lower than rate.
- pack is the pack/packing column (e.g. "10S", "1X15", "100ML"). units_per_pack is the count of tablets/capsules in one pack; 1 for liquids.
- gst_percent: if CGST and SGST are separate, add them. discount_percent is the trade discount column.
- Ignore totals, taxes summary, bank details and footer rows.`;

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };

const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const iso = (y, m, d) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

// "05/2027", "5-27", "MAY 2027", "May-27", "2027-05", "31/05/2027" -> "2027-05-31"
function parseExpiry(raw) {
  if (!raw) return "";
  const s = String(raw).trim().toLowerCase().replace(/^(exp(iry)?|use before|best before)[.:\s]*/i, "");
  const fixYear = (y) => (y < 100 ? 2000 + y : y);
  const ok = (y, m) => y >= 2000 && y <= 2099 && m >= 1 && m <= 12;
  let m;
  if ((m = s.match(/^(\d{4})[-/.](\d{1,2})(?:[-/.](\d{1,2}))?$/))) {
    const y = +m[1], mo = +m[2];
    return ok(y, mo) ? iso(y, mo, lastDay(y, mo)) : "";
  }
  if ((m = s.match(/^(\d{1,2})[-/.\s](\d{1,2})[-/.\s](\d{2,4})$/))) {
    const y = fixYear(+m[3]), mo = +m[2];
    return ok(y, mo) ? iso(y, mo, lastDay(y, mo)) : "";
  }
  if ((m = s.match(/^(\d{1,2})\s*[-/.\s]\s*(\d{2}|\d{4})$/))) {
    const y = fixYear(+m[2]), mo = +m[1];
    return ok(y, mo) ? iso(y, mo, lastDay(y, mo)) : "";
  }
  if ((m = s.match(/^([a-z]{3,9})\.?\s*[-/.,\s]?\s*(\d{2}|\d{4})$/))) {
    const mo = MONTHS[m[1].slice(0, 4)] || MONTHS[m[1].slice(0, 3)];
    const y = fixYear(+m[2]);
    return mo && ok(y, mo) ? iso(y, mo, lastDay(y, mo)) : "";
  }
  return "";
}

const num = (v) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = parseFloat(String(v ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const str = (v) => (v === null || v === undefined ? "" : String(v).trim());
const round2 = (n) => Math.round(n * 100) / 100;

// "10S" / "1X15" / "15 Tablets" / "10 x 10 Capsules" / "100ML" -> units in one pack
function unitsFromPack(pack, fallback) {
  const s = str(pack).toLowerCase();
  if (!s) return fallback;
  if (/\b\d+\s*(ml|gm|g|kg|l|ltr)\b/.test(s)) return 1;
  let m = s.match(/(\d+)\s*[x×*]\s*(\d+)/);
  if (m) return Math.max(1, +m[2]);
  m = s.match(/(\d+)\s*(s|'s|tab|tabs|tablets?|caps?|capsules?|nos?|pcs?)\b/);
  if (m) return Math.max(1, +m[1]);
  m = s.match(/^(\d+)$/);
  if (m) return Math.max(1, +m[1]);
  return fallback;
}

function normalizeProduct(d = {}) {
  const units = Math.max(1, Math.round(num(d.units_per_pack)) || unitsFromPack(d.pack_size, 1));
  const mrpPack = round2(num(d.mrp));
  const packType = str(d.pack_type) && str(d.pack_type) !== "Other" ? str(d.pack_type) : "Strip";
  return {
    product_name: str(d.product_name),
    manufacturer: str(d.manufacturer),
    salt_composition: str(d.salt_composition),
    batch_no: str(d.batch_no).replace(/^(b\.?\s*no\.?|batch\s*(no\.?)?|lot\s*(no\.?)?)[:.\s]*/i, "").toUpperCase(),
    batch_legible: d.batch_legible !== false,
    expiry_date: parseExpiry(d.expiry),
    expiry_raw: str(d.expiry),
    mrp: mrpPack,
    mrp_pack: mrpPack,
    mrp_per_unit: units > 1 ? round2(mrpPack / units) : mrpPack,
    units_per_pack: units,
    pack_type: packType,
    pack_size: str(d.pack_size),
    hsn_no: str(d.hsn_no).replace(/\D/g, ""),
    confidence: Math.min(100, Math.max(0, Math.round(num(d.confidence)) || 0)),
    quantity: 1,
    rate_pack: 0,
    purchase_price: 0,
  };
}

function normalizeBillItem(d = {}) {
  const units = Math.max(1, Math.round(num(d.units_per_pack)) || unitsFromPack(d.pack, 1));
  let rate = round2(num(d.rate));
  let mrp = round2(num(d.mrp));
  // MRP is never below the purchase rate; the model occasionally swaps columns
  if (rate > 0 && mrp > 0 && rate > mrp) [rate, mrp] = [mrp, rate];
  const gst = num(d.gst_percent);
  return {
    product_name: str(d.product_name),
    manufacturer: str(d.manufacturer),
    salt_composition: str(d.salt_composition),
    pack: str(d.pack),
    units_per_pack: units,
    batch_no: str(d.batch_no).toUpperCase(),
    expiry_date: parseExpiry(d.expiry),
    expiry_raw: str(d.expiry),
    quantity: Math.max(0, Math.round(num(d.quantity))),
    free_quantity: Math.max(0, Math.round(num(d.free_quantity))),
    rate_pack: rate,
    mrp,
    discount_percent: Math.min(100, Math.max(0, num(d.discount_percent))),
    gst_percent: [0, 5, 12, 18, 28].includes(gst) ? gst : gst > 0 && gst <= 28 ? gst : 0,
    hsn_no: str(d.hsn_no).replace(/\D/g, ""),
    amount: round2(num(d.amount)),
  };
}

async function extractProduct(images, opts = {}) {
  const { data } = await extractJson({ prompt: PRODUCT_PROMPT, images, schema: PRODUCT_SCHEMA, maxOutputTokens: 1024, timeoutMs: 25000, hedgeAfterMs: 6000, ...opts });
  const raw = Array.isArray(data) ? data[0] || {} : data || {};
  return { raw, product: normalizeProduct(raw) };
}

// Each invoice page is read in parallel and the lines are concatenated in page
// order; header fields come from the first page that has them.
async function extractBill(images, opts = {}) {
  const pages = await Promise.all(
    images.map((img) =>
      extractJson({ prompt: BILL_PROMPT, images: [img], schema: BILL_SCHEMA, maxOutputTokens: 8192, timeoutMs: 60000, hedgeAfterMs: 15000, ...opts }).then((r) => r.data || {})
    )
  );
  const pick = (k) => pages.map((p) => str(p[k])).find(Boolean) || "";
  const items = pages
    .flatMap((p) => p.items || [])
    .map(normalizeBillItem)
    .filter((i) => i.product_name && (i.quantity > 0 || i.free_quantity > 0));
  const conf = pages.map((p) => num(p.confidence)).filter((n) => n > 0);
  return {
    supplier_name: pick("supplier_name"),
    supplier_gstin: pick("supplier_gstin").toUpperCase(),
    invoice_no: pick("invoice_no"),
    invoice_date: parseInvoiceDate(pick("invoice_date")),
    confidence: conf.length ? Math.round(conf.reduce((a, b) => a + b, 0) / conf.length) : 0,
    items,
  };
}

// Invoice dates are full dates: "21/10/2026", "21-Oct-2026", "2026-10-21"
function parseInvoiceDate(raw) {
  const s = str(raw).toLowerCase();
  let m;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return iso(+m[1], +m[2], +m[3]);
  if ((m = s.match(/^(\d{1,2})[-/.\s]([a-z]{3,9}|\d{1,2})[-/.\s,]*(\d{2,4})$/))) {
    const mo = /\d/.test(m[2]) ? +m[2] : MONTHS[m[2].slice(0, 3)];
    const y = +m[3] < 100 ? 2000 + +m[3] : +m[3];
    if (mo >= 1 && mo <= 12 && +m[1] >= 1 && +m[1] <= 31 && y >= 2000 && y <= 2099) return iso(y, mo, +m[1]);
  }
  return "";
}

module.exports = { extractProduct, extractBill, normalizeProduct, normalizeBillItem, parseExpiry, parseInvoiceDate, unitsFromPack };
