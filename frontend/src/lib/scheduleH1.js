// Schedule H1 salts (GSR 588(E), 2013). Same list as
// backend-node/utils/scheduleH1.js; the server's flag (schedule_h1 on search
// results, which also applies the pharmacy's own marks) wins when present.
const H1_SALTS = [
  "alprazolam", "balofloxacin", "buprenorphine", "capreomycin", "cefdinir", "cefditoren", "cefepime",
  "cefetamet", "cefixime", "cefoperazone", "cefotaxime", "cefpirome", "cefpodoxime", "ceftazidime",
  "ceftibuten", "ceftizoxime", "ceftriaxone", "chlordiazepoxide", "clofazimine", "codeine", "cycloserine",
  "diazepam", "diphenoxylate", "doripenem", "ertapenem", "ethambutol", "ethionamide", "faropenem",
  "feropenem", "gemifloxacin", "imipenem", "isoniazid", "levofloxacin", "meropenem", "midazolam",
  "moxifloxacin", "nitrazepam", "pentazocine", "prulifloxacin", "pyrazinamide", "rifabutin", "rifampicin",
  "rifampin", "aminosalicylate", "sparfloxacin", "thiacetazone", "tramadol", "zolpidem",
];
const H1_RE = new RegExp(`\\b(${H1_SALTS.join("|")})`, "i");

// A bill / purchase line or search result: is it Schedule H1?
export function isScheduleH1(item) {
  if (!item) return false;
  if (item.schedule_h1 === true || item.schedule_h1 === false) return item.schedule_h1;
  return H1_RE.test(`${item.salt_composition || ""} ${item.product_name || item.name || ""}`);
}

// Distinct names of the H1 lines
export const h1Names = (lines = []) => [...new Set(lines.filter((l) => l.product_name && isScheduleH1(l)).map((l) => l.product_name))];

// "Schedule H", "SCH-H1", "x", "Narcotic"... → NDPS / X / H1 / H / G / C, or
// null. Same rules as backend-node/utils/scheduleH1.js normalizeSchedule.
export function normalizeSchedule(v) {
  if (typeof v !== "string" || !v.trim()) return null;
  const t = v.toUpperCase().replace(/SCHEDULES?|SCH\.?/g, " ").replace(/[^A-Z0-9]+/g, " ").trim();
  if (!t || t === "NONE" || t === "NA" || t === "OTC") return null;
  if (/\bNDPS\b|NARCOTIC|PSYCHOTROPIC/.test(t)) return "NDPS";
  if (/\bX\b/.test(t)) return "X";
  if (/\bH ?1\b/.test(t)) return "H1";
  if (/\bH\b/.test(t)) return "H";
  if (/\bG\b/.test(t)) return "G";
  if (/\bC ?1?\b/.test(t)) return "C";
  return null;
}

// A line / search result / product: its schedule code. The server's
// schedule_code wins; H1 (by salt or mark) next; then the drug_schedule text.
export function scheduleOf(item) {
  if (!item) return null;
  if (item.schedule_code !== undefined && item.schedule_h1 !== true) return item.schedule_code || null;
  if (isScheduleH1(item)) return "H1";
  const code = normalizeSchedule(item.drug_schedule) || normalizeSchedule(item.schedule);
  return code === "H1" ? null : code;
}

// A bill / purchase: its scheduled lines ({ product_name, schedule }); falls
// back to the H1 names on records from before schedule_lines
export const recordScheduleLines = (rec) =>
  Array.isArray(rec?.schedule_lines) ? rec.schedule_lines : (rec?.schedule_h1_items || []).map((n) => ({ product_name: n, schedule: "H1" }));

export const lineScheduleIn = (rec, name) => recordScheduleLines(rec).find((l) => l.product_name === name)?.schedule || null;
