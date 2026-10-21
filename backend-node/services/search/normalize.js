// Shared text normalisation for medicine search.
//
// The same functions build the precomputed search keys stored on
// global_medicines (see scripts/search/backfill_global_medicines.js) and
// normalise the user's query, so both sides always agree.

// Edge n-grams are generated for each token from MIN_GRAM up to MAX_GRAM chars.
// Queries longer than MAX_GRAM are truncated to MAX_GRAM for the index lookup and
// verified in memory.
const MIN_GRAM = 2;
const MAX_GRAM = 12;

// Bump when the key format changes so the backfill can find stale documents.
const SEARCH_KEYS_VERSION = 1;

const escapeRegex = (str) =>
  String(str || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// "Dolo-650mg Tab." -> "dolo 650 mg tab"
const normalizeText = (str) => {
  if (!str) return "";
  return String(str)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/([a-z])(\d)/g, "$1 $2")
    .replace(/(\d)([a-z])/g, "$1 $2")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
};

const tokenize = (str) => {
  const norm = normalizeText(str);
  return norm ? norm.split(" ") : [];
};

const edgeGrams = (tokens) => {
  const grams = new Set();
  for (const t of tokens) {
    // Single digits ("5" in "B-5") are still useful as exact tokens.
    if (t.length < MIN_GRAM) {
      if (/^\d$/.test(t)) grams.add(t);
      continue;
    }
    const max = Math.min(t.length, MAX_GRAM);
    for (let i = MIN_GRAM; i <= max; i++) grams.add(t.slice(0, i));
  }
  return [...grams];
};

// Precomputed search keys for a global_medicines document.
const buildMedicineSearchKeys = (doc) => {
  const name = doc.product_name || doc.name || "";
  const nameTokens = [...new Set([...tokenize(name), ...tokenize(doc.brand)])];
  const saltTokens = [...new Set(tokenize(doc.active_ingredients))].filter(
    // Strengths like "650" or "mg" in the salt are noise for salt search.
    (t) => !/^\d/.test(t) && !["mg", "ml", "mcg", "gm", "g", "iu", "w", "v"].includes(t)
  );
  return {
    s_name: normalizeText(name),
    s_name_grams: edgeGrams(nameTokens),
    s_salt_grams: edgeGrams(saltTokens),
    s_mfr: normalizeText(doc.manufacturer || doc.manufacturer_name),
    s_v: SEARCH_KEYS_VERSION,
  };
};

// Query tokens as index lookup keys (each truncated to MAX_GRAM).
const queryGrams = (q) =>
  [...new Set(tokenize(q))]
    .filter((t) => t.length >= MIN_GRAM || /^\d$/.test(t))
    .map((t) => t.slice(0, MAX_GRAM));

module.exports = {
  MIN_GRAM,
  MAX_GRAM,
  SEARCH_KEYS_VERSION,
  escapeRegex,
  normalizeText,
  tokenize,
  edgeGrams,
  buildMedicineSearchKeys,
  queryGrams,
};
