// Maps what a scan read (name, batch) onto the pharmacy's own stock.
//
// Billing priority:
//   1. Batch number: the most specific thing printed on a pack. Matched
//      exactly, then tolerant of common OCR confusions (0/O, 1/I, 5/S, 8/B).
//      A batch hit is only trusted when the name doesn't contradict it,
//      because different manufacturers can reuse batch codes.
//   2. Product name: brand + strength against inventory, then the best batch
//      of that product (first to expire with stock).
//   3. Nothing found: negative billing with what was read.
//
// All lookups run in Mongo against indexed, pharmacy-scoped queries; nothing
// loads the whole inventory.
const { tokenize, escapeRegex } = require("../search/normalize");

const FORM_WORDS = new Set([
  "tab", "tabs", "tablet", "tablets", "cap", "caps", "capsule", "capsules", "syp", "syrup", "susp", "suspension",
  "inj", "injection", "cream", "gel", "oint", "ointment", "drops", "drop", "lotion", "solution", "sol", "powder",
  "sachet", "strip", "bottle", "ip", "bp", "usp", "mg", "ml", "mcg", "gm", "g", "w", "v", "of", "and", "the", "for",
  "sr", "er", "xr", "cr", "ds", "plus", "forte", "kid", "kids", "oral", "dry", "film", "coated", "dt", "md",
]);

// Brand words and strengths, without form/filler words
function coreTokens(name) {
  return tokenize(name).filter((t) => !FORM_WORDS.has(t));
}
const numbersOf = (tokens) => tokens.filter((t) => /^\d/.test(t));
const wordsOf = (tokens) => tokens.filter((t) => !/^\d/.test(t));

function editDistance(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

// Same brand word, allowing one OCR slip or a slightly truncated read on
// longer brands. Short brands must match exactly ("Dolo" is not "Dolocode").
function brandsAgree(a, b) {
  if (a === b) return true;
  const short = Math.min(a.length, b.length);
  if (short < 5) return false;
  if ((a.startsWith(b) || b.startsWith(a)) && Math.abs(a.length - b.length) <= 2) return true;
  return editDistance(a, b) <= 1;
}

// 0..1 similarity between a scanned name and a stored one. The brand word has
// to agree; strengths must not conflict ("Dolo 650" vs "Dolo 500" is a miss).
function nameSimilarity(scanned, stored) {
  const a = coreTokens(scanned);
  const b = coreTokens(stored);
  if (!a.length || !b.length) return 0;
  const aw = wordsOf(a), bw = wordsOf(b);
  const an = numbersOf(a), bn = numbersOf(b);
  if (!aw.length || !bw.length) return 0;

  if (!brandsAgree(aw[0], bw[0])) return 0;
  if (an.length && bn.length && !an.some((n) => bn.includes(n))) return 0.15;

  const setB = new Set(b);
  const shared = a.filter((t) => setB.has(t)).length;
  const union = new Set([...a, ...b]).size;
  let score = 0.45 + 0.55 * (shared / union);
  if (an.length && bn.length && an.every((n) => bn.includes(n))) score += 0.1;
  return Math.min(1, score);
}

const batchKey = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

const OCR_CLASS = {
  0: "[0OQD]", O: "[0OQD]", Q: "[0OQ]", D: "[D0O]",
  1: "[1IL]", I: "[1IL]", L: "[1IL]",
  2: "[2Z]", Z: "[2Z]", 5: "[5S]", S: "[5S]",
  6: "[6G]", G: "[6G]", 8: "[8B]", B: "[8B]",
};

// Matches the batch ignoring separators/case, tolerating OCR look-alikes
function batchRegex(key) {
  const sep = "[^A-Za-z0-9]*";
  const body = [...key].map((c) => OCR_CLASS[c] || escapeRegex(c)).join(sep);
  return new RegExp(`^${sep}${body}${sep}$`, "i");
}

const today = () => new Date().toISOString().slice(0, 10);
const isReturned = (inv) => /returned/i.test(inv.status || "");
const isExpired = (inv) => !!inv.expiry_date && /^20\d{2}-/.test(inv.expiry_date) && inv.expiry_date < today();

const BATCH_FIELDS = {
  _id: 0, id: 1, product_id: 1, product_name: 1, batch_no: 1, expiry_date: 1, available_quantity: 1, quantity: 1,
  mrp: 1, mrp_per_unit: 1, purchase_price: 1, cost_per_unit: 1, cgst: 1, sgst: 1, units_per_pack: 1, pack_type: 1,
  salt_composition: 1, manufacturer: 1, hsn_no: 1, status: 1, supplier_id: 1,
};

const toBatch = (inv) => ({
  id: inv.id,
  batch_no: inv.batch_no,
  expiry_date: inv.expiry_date || "",
  available_quantity: inv.available_quantity || 0,
  mrp: inv.mrp_per_unit || inv.mrp || 0,
  purchase_price: inv.cost_per_unit || inv.purchase_price || 0,
  cgst: inv.cgst || 0,
  sgst: inv.sgst || 0,
  units_per_pack: inv.units_per_pack || 1,
  pack_type: inv.pack_type || "",
});

// First to expire among usable batches; an exact batch read wins outright
function pickBatch(batches, scannedKey) {
  if (scannedKey) {
    const exact = batches.find((b) => batchKey(b.batch_no) === scannedKey && !isReturned(b));
    if (exact) return exact;
  }
  const usable = batches.filter((b) => !isReturned(b) && !isExpired(b) && (b.available_quantity || 0) > 0);
  const pool = usable.length ? usable : batches.filter((b) => !isReturned(b));
  return [...pool].sort((x, y) => String(x.expiry_date || "9999").localeCompare(String(y.expiry_date || "9999")))[0] || null;
}

async function batchesOfProduct(db, pharmacyId, inv) {
  const q = inv.product_id ? { pharmacy_id: pharmacyId, product_id: inv.product_id } : { pharmacy_id: pharmacyId, product_name: inv.product_name };
  return db.collection("inventory").find(q, { projection: BATCH_FIELDS }).limit(200).toArray();
}

// Inventory rows whose name could be the scanned product: brand word prefix
// plus any strength, scoped to the pharmacy.
async function nameCandidates(db, pharmacyId, scannedName, limit = 300) {
  const core = coreTokens(scannedName);
  const words = wordsOf(core);
  if (!words.length) return [];
  const brand = words[0];
  const filter = {
    pharmacy_id: pharmacyId,
    product_name: { $regex: `(^|[^a-z])${escapeRegex(brand.slice(0, Math.max(3, Math.min(brand.length, 6))))}`, $options: "i" },
  };
  return db.collection("inventory").find(filter, { projection: BATCH_FIELDS }).limit(limit).toArray();
}

function groupByProduct(rows) {
  const map = new Map();
  for (const r of rows) {
    const key = r.product_id || (r.product_name || "").toLowerCase();
    if (!map.has(key)) map.set(key, { key, product_id: r.product_id, product_name: r.product_name, rows: [] });
    map.get(key).rows.push(r);
  }
  return [...map.values()];
}

/**
 * Best inventory match for a scanned pack, for billing.
 * @returns {{match_type, confidence, matched_item, alternatives}}
 */
async function matchForBilling(db, pharmacyId, scanned) {
  const name = scanned.product_name || "";
  const key = batchKey(scanned.batch_no);
  const batchUsable = key.length >= 3;

  // 1. Batch
  if (batchUsable) {
    const hits = await db
      .collection("inventory")
      .find({ pharmacy_id: pharmacyId, batch_no: batchRegex(key) }, { projection: BATCH_FIELDS })
      .limit(25)
      .toArray();
    const ranked = hits
      .filter((h) => !isReturned(h))
      .map((h) => {
        const exact = batchKey(h.batch_no) === key;
        const sim = name ? nameSimilarity(name, h.product_name) : 0.5;
        return { h, exact, sim, score: (exact ? 1 : 0.6) + sim + ((h.available_quantity || 0) > 0 ? 0.2 : 0) };
      })
      .sort((a, b) => b.score - a.score);
    const best = ranked[0];
    // Trust the batch unless the name clearly belongs to another product
    if (best && (!name || best.sim >= 0.45 || (best.exact && ranked.length === 1 && best.sim >= 0.15))) {
      const batches = await batchesOfProduct(db, pharmacyId, best.h);
      return {
        match_type: best.exact ? "batch_exact" : "batch_similar",
        confidence: Math.round(Math.min(1, (best.exact ? 0.75 : 0.55) + best.sim * 0.25) * 100),
        matched_item: buildItem(best.h, batches, scanned, true),
        alternatives: [],
      };
    }
  }

  // 2. Name
  if (name) {
    const groups = groupByProduct(await nameCandidates(db, pharmacyId, name))
      .map((g) => ({ ...g, sim: nameSimilarity(name, g.product_name) }))
      .filter((g) => g.sim >= 0.5)
      .sort((a, b) => b.sim - a.sim || stockOf(b) - stockOf(a));
    if (groups.length) {
      const best = groups[0];
      const batch = pickBatch(best.rows, batchUsable ? key : "");
      if (batch) {
        return {
          match_type: "name_matched",
          confidence: Math.round(best.sim * 90),
          matched_item: buildItem(batch, best.rows, scanned, false),
          alternatives: groups.slice(1, 5).map((g) => ({ product_id: g.product_id, product_name: g.product_name, available_quantity: stockOf(g) })),
        };
      }
    }
  }

  // 3. Not in stock: bill it negatively with what the scan read
  return {
    match_type: "negative_billing",
    confidence: 0,
    matched_item: {
      inventory_id: null,
      product_id: null,
      product_name: name || "Scanned Medicine",
      salt_composition: scanned.salt_composition || "",
      manufacturer: scanned.manufacturer || "",
      batch_no: scanned.batch_no || "",
      expiry_date: scanned.expiry_date || "",
      available_quantity: 0,
      mrp: scanned.mrp_per_unit || scanned.mrp || 0,
      purchase_price: 0,
      cgst: 0,
      sgst: 0,
      units_per_pack: scanned.units_per_pack || 1,
      quantity: 1,
      available_batches: [],
      match_type: "negative_billing",
    },
    alternatives: [],
  };
}

const stockOf = (g) => g.rows.reduce((s, r) => s + (isReturned(r) ? 0 : r.available_quantity || 0), 0);

function buildItem(inv, productRows, scanned, viaBatch) {
  const batches = productRows
    // Sellable batches only (in stock, not expired), plus the one we matched
    .filter((b) => b.id === inv.id || (!isReturned(b) && !isExpired(b) && (b.available_quantity || 0) > 0))
    .sort((x, y) => String(x.expiry_date || "9999").localeCompare(String(y.expiry_date || "9999")))
    .map(toBatch);
  return {
    inventory_id: inv.id,
    product_id: inv.product_id || null,
    product_name: inv.product_name,
    salt_composition: inv.salt_composition || scanned.salt_composition || "",
    manufacturer: inv.manufacturer || scanned.manufacturer || "",
    batch_no: inv.batch_no,
    expiry_date: inv.expiry_date || "",
    available_quantity: inv.available_quantity || 0,
    mrp: inv.mrp_per_unit || inv.mrp || scanned.mrp_per_unit || 0,
    purchase_price: inv.cost_per_unit || inv.purchase_price || 0,
    cgst: inv.cgst || 0,
    sgst: inv.sgst || 0,
    units_per_pack: inv.units_per_pack || 1,
    hsn_no: inv.hsn_no || "",
    quantity: 1,
    available_batches: batches,
    scanned_batch_found: viaBatch,
    match_type: viaBatch ? (batchKey(inv.batch_no) === batchKey(scanned.batch_no) ? "batch_exact" : "batch_similar") : "name_matched",
  };
}

/**
 * Catalog link for a scanned purchase line (which existing product it is).
 * Shape matches /purchases/match-suggestions for the scanner screen.
 */
async function matchForPurchase(db, pharmacyId, item) {
  const name = item.product_name || "";
  const key = batchKey(item.batch_no);
  let batchMatch = null;

  if (key.length >= 3) {
    const hits = await db
      .collection("inventory")
      .find({ pharmacy_id: pharmacyId, batch_no: batchRegex(key) }, { projection: BATCH_FIELDS })
      .limit(10)
      .toArray();
    const best = hits
      .map((h) => ({ h, exact: batchKey(h.batch_no) === key, sim: name ? nameSimilarity(name, h.product_name) : 0.5 }))
      .filter((x) => x.exact && x.sim >= 0.45)
      .sort((a, b) => b.sim - a.sim)[0];
    if (best) {
      batchMatch = {
        product_id: best.h.product_id || best.h.id,
        inventory_id: best.h.id,
        product_name: best.h.product_name,
        batch_no: best.h.batch_no,
        expiry_date: best.h.expiry_date || "",
        units_per_pack: best.h.units_per_pack || 1,
        type: "batch_exact",
      };
    }
  }

  const suggestions = [];
  let exactNameMatch = null;
  if (name) {
    const core = coreTokens(name);
    const brand = wordsOf(core)[0];
    if (brand) {
      const products = await db
        .collection("products")
        .find(
          { pharmacy_id: pharmacyId, name: { $regex: `(^|[^a-z])${escapeRegex(brand.slice(0, Math.max(3, Math.min(brand.length, 6))))}`, $options: "i" } },
          { projection: { _id: 0, id: 1, name: 1, manufacturer: 1, units_per_pack: 1 } }
        )
        .limit(200)
        .toArray();
      const target = tokenize(name).join(" ");
      for (const p of products) {
        const sim = nameSimilarity(name, p.name);
        if (sim < 0.5) continue;
        const exact = tokenize(p.name).join(" ") === target;
        const s = {
          product_id: p.id,
          product_name: p.name,
          manufacturer: p.manufacturer || "",
          units_per_pack: p.units_per_pack || 1,
          score: Math.round((exact ? 1 : sim) * 100),
          is_high_confidence: exact || sim >= 0.8,
        };
        if (exact && !exactNameMatch) exactNameMatch = { product_id: p.id, product_name: p.name, type: "name_exact" };
        suggestions.push(s);
      }
    }
  }
  if (batchMatch && !suggestions.some((s) => s.product_id === batchMatch.product_id)) {
    suggestions.push({ product_id: batchMatch.product_id, product_name: batchMatch.product_name, score: 100, is_high_confidence: true });
  }
  suggestions.sort((a, b) => b.score - a.score);
  if (batchMatch) {
    const i = suggestions.findIndex((s) => s.product_id === batchMatch.product_id);
    if (i >= 0) suggestions[i] = { ...suggestions[i], is_batch_match: true, score: 10000 };
    suggestions.sort((a, b) => b.score - a.score);
  }

  return {
    scanned_name: name,
    scanned_batch: item.batch_no || "",
    batch_match: batchMatch,
    exact_name_match: exactNameMatch,
    suggestions: suggestions.slice(0, 10),
  };
}

module.exports = { matchForBilling, matchForPurchase, nameSimilarity, batchKey, batchRegex, coreTokens };
