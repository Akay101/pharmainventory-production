// One spreadsheet row -> clean values for our records, with the problems found.
// Errors stop a row from being imported; warnings are shown but don't.
const { normalizeExpiryDate } = require("../../utils/helpers");
const { medicineKey, normalizeText, cleanProductName } = require("../search/normalize");

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const MOBILE_RE = /^(?:\+?91|0)?([6-9]\d{9})$/;
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };

const text = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? "").replace(/\s+/g, " ").trim());

// "₹1,23,456.50", "(12)", "12.00 Rs" -> number; blank or "-" -> null; anything else -> NaN
function num(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : NaN;
  const s = text(v);
  if (!s || /^[-–—]+$/.test(s)) return null;
  const neg = /^\(.*\)$/.test(s) || /^-/.test(s);
  const cleaned = s.replace(/rs\.?|inr|₹|,|\s|[()]/gi, "").replace(/^-/, "");
  if (!/^\d*\.?\d+$/.test(cleaned)) return NaN;
  return (neg ? -1 : 1) * parseFloat(cleaned);
}

const lastDay = (y, m) => `${y}-${String(m).padStart(2, "0")}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;

// Expiry is printed by month, so month-only values become that month's last day
function expiry(v) {
  if (v instanceof Date) return lastDay(v.getUTCFullYear(), v.getUTCMonth() + 1);
  if (typeof v === "number" && v > 20000 && v < 80000) {
    // An Excel date serial that arrived as a plain number
    const d = new Date(Date.UTC(1899, 11, 30) + v * 864e5);
    return lastDay(d.getUTCFullYear(), d.getUTCMonth() + 1);
  }
  const s = text(v).toLowerCase().replace(/\s+/g, " ");
  if (!s) return null;
  let m = s.match(/^(\d{1,2})[-./ ](\d{2}|\d{4})$/); // 03/26, 3-2026, 03.26
  if (m) {
    const month = +m[1];
    const year = m[2].length === 2 ? 2000 + +m[2] : +m[2];
    return month >= 1 && month <= 12 ? lastDay(year, month) : null;
  }
  m = s.match(/^([a-z]{3,4})[a-z]*[-./ ']?(\d{2}|\d{4})$/); // mar-26, march 2026, MAR'26
  if (m && MONTHS[m[1]]) return lastDay(m[2].length === 2 ? 2000 + +m[2] : +m[2], MONTHS[m[1]]);
  m = s.match(/^(\d{4})[-/](\d{1,2})$/);
  if (m) return +m[2] >= 1 && +m[2] <= 12 ? lastDay(+m[1], +m[2]) : null;
  const iso = normalizeExpiryDate(s);
  return iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) && !isNaN(Date.parse(iso)) ? iso : null;
}

// "10's", "1x10", "1*15", "10 TAB", "strip of 10" -> 10 units; "100ML", "30 GM" -> 1 (a bottle or tube)
// `fromName`: reading a product name ("DOLO 650 TAB 15'S"), where a bare number is a strength, not a pack size
function packing(v, fromName = false) {
  const s = text(v).toLowerCase();
  if (!s) return { units: null, pack_type: null };
  let m = s.match(/(\d+)\s*[x*]\s*(\d+)/);
  if (m) return { units: +m[1] * +m[2], pack_type: "Strip" };
  m = s.match(/(\d+)\s*['’`]\s*s\b|\b(\d+)\s*s\b|(?:strip|pack|box) of (\d+)/);
  if (m) return { units: +(m[1] || m[2] || m[3]), pack_type: "Strip" };
  if (/\d+(\.\d+)?\s*(ml|ltr|l|gm|g|kg)\b/.test(s)) return { units: 1, pack_type: /ml|ltr|\bl\b/.test(s) ? "Bottle" : "Tube" };
  if (fromName) return { units: null, pack_type: null };
  m = s.match(/^(\d+)\s*(?:tabs?|tablets?|caps?|capsules?|nos?|pcs?|units?|sachets?)?$/);
  if (m && +m[1] > 0 && +m[1] <= 1000) return { units: +m[1], pack_type: /sachet/.test(s) ? "Sachet" : "Strip" };
  return { units: null, pack_type: null };
}

function mobile(v) {
  const digits = text(v).split(/[,/;]/)[0].replace(/[\s\-()]/g, "");
  if (!digits) return { value: null, ok: true };
  const m = digits.match(MOBILE_RE);
  return m ? { value: m[1], ok: true } : { value: digits.slice(0, 20), ok: false };
}

const pick = (cells, mapping, key) => (mapping[key] === undefined || mapping[key] === null ? "" : cells[mapping[key]] ?? "");

// Rows that repeat the heading, or carry report totals, aren't records
const isNoise = (name) => {
  const n = normalizeText(name);
  return !n || /^(grand )?(sub )?total\b/.test(n) || /^(page|continued)\b/.test(n);
};

function product(cells, mapping, errors, warnings) {
  const rawName = text(pick(cells, mapping, "product_name"));
  const name = cleanProductName(rawName) || rawName;
  const packCell = pick(cells, mapping, "packing");
  let pack = packing(packCell);
  if (!pack.units) pack = { ...packing(rawName, true), pack_type: pack.pack_type || packing(rawName, true).pack_type };
  let units = num(pick(cells, mapping, "units_per_pack"));
  if (!(units > 0)) units = pack.units;
  if (!(units > 0)) {
    units = 1;
    warnings.push("Units per pack not found, so it's taken as 1");
  }
  const mrp = num(pick(cells, mapping, "mrp"));
  const rate = num(pick(cells, mapping, "purchase_rate"));
  const gst = num(pick(cells, mapping, "gst_rate"));
  if (Number.isNaN(mrp)) errors.push("MRP isn't a number");
  if (Number.isNaN(rate)) warnings.push("Purchase rate isn't a number, so it's left blank");
  if (Number.isNaN(gst) || (gst !== null && (gst < 0 || gst > 28))) warnings.push("GST % isn't between 0 and 28, so it's left blank");
  if (mrp > 0 && rate > mrp) warnings.push("Purchase rate is above MRP");
  return {
    product_name: name,
    product_key: `${medicineKey(name)}|${Math.round(units)}`,
    units_per_pack: Math.round(units),
    pack_type: pack.pack_type || "Strip",
    manufacturer: text(pick(cells, mapping, "manufacturer")) || null,
    salt_composition: text(pick(cells, mapping, "salt_composition")) || null,
    mrp_pack: mrp > 0 ? mrp : null,
    rate_pack: rate > 0 ? rate : null,
    hsn_no: text(pick(cells, mapping, "hsn_no")).replace(/\D/g, "").slice(0, 8) || null,
    gst_rate: gst >= 0 && gst <= 28 ? gst : null,
    barcode: text(pick(cells, mapping, "barcode")) || null,
    rack: text(pick(cells, mapping, "rack")) || null,
  };
}

/**
 * Normalise one row. Returns { data, errors, warnings, noise }.
 * `today` (YYYY-MM-DD) decides what counts as expired.
 */
function normalizeRow(entity, cells, mapping, { today, includeExpired = false, quantityIn = "packs" } = {}) {
  const errors = [];
  const warnings = [];

  if (entity === "stock" || entity === "products") {
    if (isNoise(pick(cells, mapping, "product_name"))) return { noise: true };
    const data = product(cells, mapping, errors, warnings);
    if (!data.product_name) errors.push("Product name is missing");
    if (entity === "products") return { data, errors, warnings };

    let batch = text(pick(cells, mapping, "batch_no")).toUpperCase();
    if (!batch) {
      batch = "NA";
      warnings.push("No batch number, so it's saved as NA");
    }
    const rawExpiry = pick(cells, mapping, "expiry_date");
    const exp = expiry(rawExpiry);
    if (!exp) errors.push(text(rawExpiry) ? `Expiry "${text(rawExpiry)}" isn't a date we can read` : "Expiry is missing");
    if (!(data.mrp_pack > 0)) errors.push("MRP is missing");

    const qty = num(pick(cells, mapping, "quantity"));
    const loose = num(pick(cells, mapping, "loose_units"));
    if (Number.isNaN(qty) || qty === null) errors.push("Stock quantity is missing or not a number");
    let units = 0;
    if (qty > 0 || loose > 0) {
      units = quantityIn === "units" ? qty || 0 : (qty || 0) * data.units_per_pack;
      if (loose > 0) units += loose;
      if (Math.abs(units - Math.round(units)) > 0.001) errors.push(`Stock comes to ${+units.toFixed(3)} units, which isn't a whole number`);
      units = Math.round(units);
    }
    const skip = !errors.length && units <= 0 ? "no_stock" : !errors.length && exp && exp < today && !includeExpired ? "expired" : null;
    return { data: { ...data, batch_no: batch.slice(0, 40), expiry_date: exp, units }, errors, warnings, skip };
  }

  const name = text(pick(cells, mapping, "name"));
  if (isNoise(name)) return { noise: true };
  if (!name) errors.push("Name is missing");
  const phoneField = entity === "suppliers" ? "contact" : "mobile";
  const phone = mobile(pick(cells, mapping, phoneField));
  if (!phone.ok) warnings.push(`"${phone.value}" isn't a 10-digit mobile number`);
  const email = text(pick(cells, mapping, "email")).toLowerCase();
  const address = [text(pick(cells, mapping, "address")), text(pick(cells, mapping, "city"))].filter(Boolean).join(", ");
  const data = { name: name.slice(0, 120), [phoneField]: phone.value, email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null, address: address || null };
  if (email && !data.email) warnings.push(`"${email}" isn't an email address, so it's left blank`);
  if (entity === "suppliers") {
    const gst = text(pick(cells, mapping, "gst_no")).toUpperCase().replace(/\s/g, "");
    data.gst_no = GSTIN_RE.test(gst) ? gst : null;
    if (gst && !data.gst_no) warnings.push(`GSTIN "${gst}" isn't valid, so it's left blank`);
    data.dl_no = text(pick(cells, mapping, "dl_no")) || null;
  }
  return { data, errors, warnings };
}

module.exports = { normalizeRow, expiry, packing, num, mobile };
