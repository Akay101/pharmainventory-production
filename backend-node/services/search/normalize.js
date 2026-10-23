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

// Invoices print names like "OXALGIN-DP TAB 20S ." or "DOLO 650MG TAB 1X15":
// pack counts and stray punctuation hide the medicine from catalog/global
// matching. Strip them; keep brand, strength and form.
function cleanProductName(name) {
  let s = String(name || "")
    .replace(/\(([^)]*)\)/g, (m, inner) => (/^\s*\d+\s*$|\d+\s*('?s|x|\*|tab|cap|strip)/i.test(inner) ? " " : ` ${inner} `))
    .replace(/\b\d+\s*[xX*]\s*\d+(\s*['’`]?\s*s)?\b/g, " ") // 1X15, 10*10
    .replace(/\b\d+\s*['’`]?\s*s\b/gi, " ") // 20S, 15'S, 10 S
    .replace(/\b(strip|pack|box)\s+of\s+\d+\b/gi, " ")
    .replace(/[.,;:]+(\s|$)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // ALL CAPS invoice text reads better in title case ("Oxalgin-DP Tab")
  if (s && s === s.toUpperCase() && /[A-Z]{3}/.test(s)) {
    s = s.toLowerCase().replace(/(^|[\s-])([a-z])/g, (m, sep, c) => sep + c.toUpperCase());
    s = s.replace(/\b(Dp|Ds|Sr|Er|Xr|Cr|Md|Dt|Mr|Od|Lc|Ls|Cv|Ip|Bp|Usp|Ml|Mg)\b/g, (w) => (/^(Ml|Mg)$/.test(w) ? w.toLowerCase() : w.toUpperCase()));
  }
  return s;
}

const FORM_ALIASES = [
  [/\b(tablets?|tabs?)\b/g, "tab"],
  [/\b(capsules?|caps?)\b/g, "cap"],
  [/\b(syrup|syr|syp)\b/g, "syp"],
  [/\b(injection|inj)\b/g, "inj"],
  [/\b(suspension|susp)\b/g, "susp"],
  [/\b(ointment|oint)\b/g, "oint"],
  [/\b(drops?)\b/g, "drop"],
];

// One key per medicine for de-duplicating search results: "OXALGIN-DP TAB
// 20S ." and "Oxalgin DP Tablet" -> "oxalgindptab". Form words are unified,
// not dropped, so a syrup and a tablet of the same brand stay apart.
const medicineKey = (name) => {
  let s = cleanProductName(name).toLowerCase();
  s = s.replace(/(\d+(?:\.\d+)?)\s*(mg|ml|gm|g|mcg|iu)\b/g, "$1");
  for (const [re, to] of FORM_ALIASES) s = s.replace(re, to);
  return s.replace(/[^a-z0-9]/g, "");
};

module.exports = {
  cleanProductName,
  medicineKey,
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
