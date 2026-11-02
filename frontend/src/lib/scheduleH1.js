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
