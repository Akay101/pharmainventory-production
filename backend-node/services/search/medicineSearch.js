// Medicine search over the global catalogue and tenant collections.
//
// Global catalogue (≈4L docs): index-backed edge n-gram lookup on precomputed
// keys (see normalize.js), pre-sorted by rank_score, then re-ranked in memory.
// Results are cached because the catalogue is effectively static.
//
// Tenant collections (inventory/products): bounded by the {pharmacy_id, ...}
// indexes, so token regexes only scan that pharmacy's documents. Never cached,
// because stock changes with every bill and purchase.

const { getGlobalMedicinesCollection, onGlobalConnect } = require("../../utils/globalDb");
const {
  escapeRegex,
  normalizeText,
  tokenize,
  queryGrams,
  MAX_GRAM,
} = require("./normalize");

const NAME_CANDIDATES = 80;
const SALT_CANDIDATES = 40;
const GLOBAL_CACHE_TTL = 10 * 60 * 1000;
const GLOBAL_CACHE_MAX = 5000;

const GLOBAL_PROJECTION = {
  _id: 1, id: 1, product_id: 1, product_code: 1, product_slug: 1,
  name: 1, product_name: 1, brand: 1, manufacturer: 1, manufacturer_name: 1,
  dosage_form: 1, product_category: 1, packaging_label: 1, package_details: 1,
  pack_size_label: 1, pack_size: 1, pack_type: 1, units_per_pack: 1,
  mrp: 1, "price(₹)": 1, unit_mrp: 1, selling_price: 1, trade_price: 1,
  purchase_price: 1, tax_rate: 1, gst_percentage: 1, hsn_code: 1, hsn_no: 1,
  salt_composition: 1, short_composition1: 1, short_composition2: 1,
  active_ingredients: 1, prescription_required: 1, drug_schedule: 1, image_url: 1,
  thumbnail_url: 1, rank_score: 1, search_keyword: 1, s_name: 1,
};

let warnedMissingIndex = false;

// ---------- small LRU for global results ----------
const globalCache = new Map();
const cacheGet = (key) => {
  const hit = globalCache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    globalCache.delete(key);
    return null;
  }
  globalCache.delete(key); // refresh LRU position
  globalCache.set(key, hit);
  return hit.data;
};
// Results cached while on the fallback DB must not outlive a reconnect.
onGlobalConnect(() => {
  globalCache.clear();
  warnedMissingIndex = false;
});

const cacheSet = (key, data) => {
  if (globalCache.size >= GLOBAL_CACHE_MAX) {
    globalCache.delete(globalCache.keys().next().value);
  }
  globalCache.set(key, { data, expiresAt: Date.now() + GLOBAL_CACHE_TTL });
};

const levenshtein = (a, b) => {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = cur;
  }
  return prev[b.length];
};

// Relevance of a candidate name/salt to the query, 0–100.
// Used for global results and for ranking tenant results the same way.
const scoreMatch = (query, name, salt = "") => {
  const qn = normalizeText(query);
  const nn = normalizeText(name);
  if (!qn || !nn) return 0;
  if (nn === qn) return 100;
  if (nn.startsWith(qn)) return 90;

  const qTokens = tokenize(query);
  const nTokens = nn.split(" ");
  const tokenHit = (qt, tokens) => tokens.some((t) => t.startsWith(qt));
  const nameHits = qTokens.filter((qt) => tokenHit(qt, nTokens)).length;
  if (nameHits === qTokens.length) {
    // All tokens match name words; first-word match ranks higher.
    return nTokens[0].startsWith(qTokens[0]) ? 80 : 72;
  }
  if (nn.includes(qn)) return 65;

  const sTokens = tokenize(salt);
  const saltHits = qTokens.filter(
    (qt) => tokenHit(qt, sTokens) || tokenHit(qt, nTokens)
  ).length;
  if (saltHits === qTokens.length) return 60;

  // Typo tolerance on the leading word.
  const dist = levenshtein(qTokens[0], nTokens[0].slice(0, qTokens[0].length + 1));
  if (dist <= (qTokens[0].length >= 6 ? 2 : 1)) return 50 - dist * 5;
  return nameHits > 0 ? 30 : 0;
};

const findByGrams = (col, field, grams, extra, limit) => {
  if (!grams.length) return Promise.resolve([]);
  // Longest gram is the most selective; it drives the index scan.
  const [primary, ...rest] = [...grams].sort((a, b) => b.length - a.length);
  const filter = { [field]: primary, ...extra };
  if (rest.length) filter.$and = [{ [field]: { $all: rest } }];
  return col
    .find(filter, { projection: GLOBAL_PROJECTION })
    .hint(field === "s_name_grams" ? "search_name_grams_rank" : "search_salt_grams_rank")
    .sort({ rank_score: -1 })
    .limit(limit)
    .toArray();
};

/**
 * Search the global medicine catalogue.
 * Returns raw catalogue documents (plus `_score`) ordered by relevance, deduped
 * by normalised name. Callers map them into their own response shape.
 */
const searchGlobalMedicines = async (q, { limit = 60 } = {}) => {
  const grams = queryGrams(q);
  if (!grams.length) return [];

  const cacheKey = `${grams.join(" ")}|${limit}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const col = await getGlobalMedicinesCollection();
  let candidates;
  try {
    candidates = await findCandidates(col, q, grams);
  } catch (err) {
    // Catalogue not backfilled yet (hint on a missing index): degrade to the
    // legacy text index rather than returning nothing.
    if (!/hint|index/i.test(err.message)) throw err;
    if (!warnedMissingIndex) {
      warnedMissingIndex = true;
      console.warn(
        "[Search] global_medicines n-gram index missing; using $text fallback. " +
          "Run scripts/search/backfill_global_medicines.js against this database."
      );
    }
    candidates = await col
      .find({ $text: { $search: q } }, { projection: { ...GLOBAL_PROJECTION, score: { $meta: "textScore" } } })
      .sort({ score: { $meta: "textScore" } })
      .limit(NAME_CANDIDATES)
      .toArray()
      .catch(() => []);
  }

  const best = new Map();
  for (const doc of candidates) {
    const name = doc.product_name || doc.name || "";
    const key = doc.s_name || normalizeText(name);
    if (!key) continue;
    const score = scoreMatch(q, name, doc.active_ingredients || "");
    if (score <= 0) continue;
    const prev = best.get(key);
    const rank = doc.rank_score || 0;
    if (!prev || score > prev._score || (score === prev._score && rank > (prev.rank_score || 0))) {
      best.set(key, { ...doc, _score: score });
    }
  }

  const results = [...best.values()]
    .sort(
      (a, b) =>
        b._score - a._score ||
        (b.rank_score || 0) - (a.rank_score || 0) ||
        (a.product_name || "").length - (b.product_name || "").length
    )
    .slice(0, limit)
    .map(({ s_name, score, ...doc }) => doc);

  cacheSet(cacheKey, results);
  return results;
};

const findCandidates = async (col, q, grams) => {
  const alpha = grams.filter((g) => !/^\d/.test(g) && g.length >= 3);
  const numeric = grams.filter((g) => /^\d/.test(g));

  const [byName, bySalt] = await Promise.all([
    findByGrams(col, "s_name_grams", grams, {}, NAME_CANDIDATES),
    // "paracetamol 650" → salt words in the salt, strengths in the name.
    alpha.length
      ? findByGrams(
          col,
          "s_salt_grams",
          alpha,
          numeric.length ? { s_name_grams: { $all: numeric } } : {},
          SALT_CANDIDATES
        )
      : [],
  ]);

  let candidates = [...byName, ...bySalt];

  // Typo fallback: retry on a shorter prefix of the leading word and let
  // scoreMatch's edit-distance check filter the noise.
  if (candidates.length < 5) {
    const lead = tokenize(q)[0] || "";
    for (let len = Math.min(lead.length, MAX_GRAM) - 1; len >= 3 && candidates.length < 5; len--) {
      const more = await findByGrams(col, "s_name_grams", [lead.slice(0, len)], {}, NAME_CANDIDATES);
      candidates = candidates.concat(more);
    }
  }
  return candidates;
};

/**
 * Mongo filter matching every query token at the start of a word in any of
 * `fields` (case-insensitive, word-order independent), mirroring the global
 * n-gram semantics. Combine with a pharmacy_id equality so the tenant index
 * bounds the scan.
 */
const tokenClause = (t, fields) => {
  // Tokens split at letter/digit changes, so either kind may be glued
  // to the other in the stored name ("Dolo650", "650mg").
  const boundary = /^\d/.test(t) ? "(^|[^0-9])" : "(^|[^a-z])";
  const re = { $regex: boundary + escapeRegex(t), $options: "i" };
  return { $or: fields.map((f) => ({ [f]: re })) };
};

// Words people type around a price: "dolo mrp 30", "dolo rs 30".
const PRICE_WORDS = new Set(["mrp", "rs", "inr", "price"]);

/**
 * `mrpFields` lets a number in the query match the MRP instead of the name:
 * "dolo 30" finds Dolo whose MRP is about ₹30 (₹29.50 to ₹30.99), the rest of
 * the words still matching the name.
 */
const tenantTokenMatch = (q, fields, { wholeQueryFields = [], mrpFields = [] } = {}) => {
  const tokens = tokenize(q);
  const clauses = [];
  if (tokens.length) {
    clauses.push({ $and: tokens.map((t) => tokenClause(t, fields)) });
  }
  if (mrpFields.length) {
    const prices = [...new Set(String(q || "").match(/\d+(?:\.\d+)?/g) || [])].filter((n) => Number(n) > 0);
    if (prices.length) {
      const words = tokens.filter((t) => !/^\d/.test(t) && !PRICE_WORDS.has(t));
      const priceOr = [];
      for (const p of prices) {
        const n = Number(p);
        // "30" means ₹29.50 to ₹30.99 (people drop the paise); "30.9" is exact to 5 paise
        const range = p.includes(".") ? { $gte: n - 0.05, $lte: n + 0.05 } : { $gte: n - 0.5, $lt: n + 1 };
        for (const f of mrpFields) priceOr.push({ [f]: range });
      }
      clauses.push({ $and: [...words.map((t) => tokenClause(t, fields)), { $or: priceOr }] });
    }
  }
  const raw = String(q || "").trim();
  if (raw) {
    const re = { $regex: escapeRegex(raw), $options: "i" };
    for (const f of wholeQueryFields) clauses.push({ [f]: re });
  }
  return clauses.length ? { $or: clauses } : {};
};

// A query that is a batch number should surface that batch's product first.
const batchMatchScore = (q, batches = []) => {
  const needle = String(q || "").trim().toLowerCase();
  if (needle.length < 3) return 0;
  let best = 0;
  for (const b of batches) {
    const bn = String(b?.batch_no || "").toLowerCase();
    if (!bn) continue;
    if (bn === needle) return 98;
    if (bn.startsWith(needle)) best = Math.max(best, 75);
  }
  return best;
};

// Salt / composition search for the catalogue form: distinct compositions
// from the global catalogue (salt n-gram index) and the pharmacy's own
// products, every typed word matching the start of a word.
const searchSalts = async (db, pharmacyId, q, { limit = 15 } = {}) => {
  const words = tokenize(q).filter((t) => t.length >= 2);
  if (!words.length) return [];
  const wordRe = words.map((w) => new RegExp(`(^|[^a-z0-9])${escapeRegex(w)}`, "i"));
  const fits = (txt) => !!txt && wordRe.every((re) => re.test(txt));
  const seen = new Map();
  const add = (txt, source) => {
    const t = String(txt || "").trim();
    if (!t || t.length > 300 || !fits(t)) return;
    const k = normalizeText(t);
    const cur = seen.get(k);
    if (cur) cur.count += 1;
    else seen.set(k, { salt: t, source, count: 1 });
  };
  const own = await db
    .collection("products")
    .find({ pharmacy_id: pharmacyId, ...tenantTokenMatch(q, ["salt_composition"]) }, { projection: { _id: 0, salt_composition: 1 } })
    .limit(200)
    .toArray()
    .catch(() => []);
  own.forEach((p) => add(p.salt_composition, "catalog"));
  const cacheKey = `salt:${words.join(" ")}`;
  let global = cacheGet(cacheKey);
  if (!global) {
    try {
      const col = await getGlobalMedicinesCollection();
      const grams = queryGrams(words.filter((w) => !/^\d/.test(w)).join(" "));
      global = grams.length ? await findByGrams(col, "s_salt_grams", grams, {}, 300) : [];
    } catch {
      global = [];
    }
    cacheSet(cacheKey, global);
  }
  for (const d of global) {
    const comp = d.salt_composition || [d.short_composition1, d.short_composition2].filter(Boolean).join(" + ") || d.active_ingredients;
    add(comp, "global");
  }
  return [...seen.values()]
    .sort((a, b) => (a.source === b.source ? 0 : a.source === "catalog" ? -1 : 1) || b.count - a.count || a.salt.length - b.salt.length)
    .slice(0, limit);
};

module.exports = {
  searchGlobalMedicines,
  searchSalts,
  tenantTokenMatch,
  scoreMatch,
  batchMatchScore,
  GLOBAL_PROJECTION,
};
