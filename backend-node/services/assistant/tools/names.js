// Record names (medicines, suppliers, customers, doctors) are always stored in
// English/Latin script, however the user spoke. Hindi voice input writes brand
// names in Devanagari ("कालपोल 650"), so those are converted to the spelling
// printed on packs ("Calpol 650") before anything is matched or drafted.
const llm = require("../llm");

const DEVANAGARI = /[ऀ-ॿ]/;
const hasDevanagari = (s) => DEVANAGARI.test(String(s || ""));

const cache = new Map(); // "kind|text" -> latin
const CACHE_MAX = 2000;

// Plain letter-by-letter fallback for when the quick model is unavailable
const V = { "अ": "a", "आ": "aa", "इ": "i", "ई": "ee", "उ": "u", "ऊ": "oo", "ऋ": "ri", "ए": "e", "ऐ": "ai", "ओ": "o", "औ": "au", "ऑ": "o" };
const M = { "ा": "a", "ि": "i", "ी": "ee", "ु": "u", "ू": "oo", "ृ": "ri", "े": "e", "ै": "ai", "ो": "o", "ौ": "au", "ॉ": "o", "ं": "n", "ँ": "n", "ः": "h" };
const C = {
  "क": "k", "ख": "kh", "ग": "g", "घ": "gh", "ङ": "n", "च": "ch", "छ": "chh", "ज": "j", "झ": "jh", "ञ": "n",
  "ट": "t", "ठ": "th", "ड": "d", "ढ": "dh", "ण": "n", "त": "t", "थ": "th", "द": "d", "ध": "dh", "न": "n",
  "प": "p", "फ": "f", "ब": "b", "भ": "bh", "म": "m", "य": "y", "र": "r", "ल": "l", "व": "v", "श": "sh",
  "ष": "sh", "स": "s", "ह": "h", "ळ": "l", "क़": "q", "ख़": "kh", "ग़": "g", "ज़": "z", "ड़": "d", "ढ़": "rh", "फ़": "f",
};
const DIGITS = "०१२३४५६७८९";
function roughLatin(text) {
  const s = String(text || "").normalize("NFC");
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    const next = s[i + 1];
    if (C[ch]) {
      out += C[ch];
      if (next === "्") i++; // halant: no vowel
      else if (!M[next] && next !== "़" && !(i + 1 >= s.length || /\s/.test(next))) out += "a";
    } else if (V[ch]) out += V[ch];
    else if (M[ch]) out += M[ch];
    else if (DIGITS.includes(ch)) out += DIGITS.indexOf(ch);
    else if (ch === "़" || ch === "्") continue;
    else out += ch;
  }
  return out.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

const SYSTEM = `You convert names spoken in Hindi (written in Devanagari by speech recognition) into the English spelling used in Indian pharmacies.
- Medicines: the brand as printed on the pack, e.g. "कालपोल 650" -> "Calpol 650", "डोलो" -> "Dolo", "बोरोलीन क्रीम" -> "Boroline Cream", "पैन 40" -> "Pan 40", "ऑगमेंटिन 625 डुओ" -> "Augmentin 625 Duo", "एज़िथ्रल 500" -> "Azithral 500". Translate form words: टैबलेट -> Tablet, सिरप -> Syrup, क्रीम -> Cream, कैप्सूल -> Capsule, इंजेक्शन -> Injection, ड्रॉप्स -> Drops.
- Suppliers/companies: e.g. "नीलकंठ फार्मास्यूटिकल्स" -> "Neelkanth Pharmaceuticals", "शिव शक्ति फार्मा" -> "Shiv Shakti Pharma", "डिस्ट्रीब्यूटर्स" -> "Distributors", "एजेंसी" -> "Agency".
- People: usual English spelling, e.g. "रमेश कुमार" -> "Ramesh Kumar".
- Keep numbers, strengths and Latin text exactly. Output Latin script only, same order and count as the input.`;

const SCHEMA = { type: "object", properties: { names: { type: "array", items: { type: "string" } } }, required: ["names"] };

// Converts every Devanagari name in `list` (strings) to Latin in one call.
// kind: "medicine" | "supplier" | "person" (a hint for the spelling)
async function latinNames(list, kind = "medicine", { signal } = {}) {
  const out = list.map((s) => (s == null ? s : String(s).trim()));
  const todo = [...new Set(out.filter((s) => s && hasDevanagari(s) && !cache.has(`${kind}|${s}`)))];
  if (todo.length) {
    let converted = null;
    try {
      const res = await llm.json({
        role: "router",
        system: SYSTEM,
        contents: [{ role: "user", parts: [{ text: `Kind: ${kind}\n${JSON.stringify(todo)}` }] }],
        schema: SCHEMA,
        signal,
        timeoutMs: 8000,
      });
      if (Array.isArray(res.names) && res.names.length === todo.length) converted = res.names;
    } catch (err) {
      if (err.category === "cancelled") throw err;
    }
    todo.forEach((s, i) => {
      const v = converted?.[i] && !hasDevanagari(converted[i]) ? converted[i].trim() : roughLatin(s);
      if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
      cache.set(`${kind}|${s}`, v);
    });
  }
  return out.map((s) => (s && hasDevanagari(s) ? cache.get(`${kind}|${s}`) || roughLatin(s) : s));
}

const latinName = async (s, kind, opts) => (await latinNames([s], kind, opts))[0];

module.exports = { hasDevanagari, latinNames, latinName, roughLatin };
