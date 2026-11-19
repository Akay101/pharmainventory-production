// Schedule H1 (Drugs and Cosmetics Rules, GSR 588(E), 2013): medicines sold
// only on prescription, with the prescription kept on record. A medicine is
// H1 when the pharmacy marked it so on the product (schedule_h1 true/false
// overrides everything), else when the medicine database says so
// (drug_schedule), else when its composition (or name) has an H1 salt.

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

const scheduleText = (item) =>
  [item.drug_schedule, item.schedule].filter((v) => typeof v === "string").join(" ");

// The salt (or name) that makes it H1, or null
function h1Reason(item = {}) {
  if (item.schedule_h1 === false) return null;
  if (item.schedule_h1 === true) return "marked Schedule H1";
  if (/\bH\s*-?\s*1\b/i.test(scheduleText(item))) return "Schedule H1";
  const text = [item.salt_composition, item.short_composition1, item.short_composition2, item.active_ingredients, item.composition]
    .filter((v) => typeof v === "string")
    .join(" ");
  const m = text.match(H1_RE) || String(item.product_name || item.name || "").match(H1_RE);
  return m ? m[1].toLowerCase() : null;
}

const isScheduleH1 = (item) => h1Reason(item) !== null;

// Drug schedules shown apart from each other (Drugs and Cosmetics Rules /
// NDPS Act). Order: the strictest first, when a text names more than one.
const SCHEDULES = ["NDPS", "X", "H1", "H", "G", "C"];

// "Schedule H", "SCH-H1", "x", "Narcotic"... → a code in SCHEDULES, or null
function normalizeSchedule(v) {
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

// The item's schedule: Schedule H1 (by the rules above) wins, then the
// pharmacy's own drug_schedule on the product, then the medicine database's
function scheduleOf(item = {}, productSchedule) {
  if (isScheduleH1(item)) return "H1";
  const own = normalizeSchedule(productSchedule);
  const code = own || normalizeSchedule(item.drug_schedule) || normalizeSchedule(item.schedule);
  // H1 named only by the schedule text but unmarked by the pharmacy: not H1
  return code === "H1" ? null : code;
}

const keyOfName = (n) => String(n || "").trim().toLowerCase();

// The pharmacy's own marks (products.schedule_h1) and compositions for these
// items, by product id and by name
async function productOverrides(db, pharmacyId, items) {
  const ids = new Set();
  const names = new Set();
  for (const it of items) {
    if (it.product_id) ids.add(String(it.product_id));
    const n = it.product_name || it.name;
    if (n) names.add(String(n).trim());
  }
  if (!ids.size && !names.size) return { byId: new Map(), byName: new Map(), comp: new Map(), sched: new Map() };
  const rows = await db
    .collection("products")
    .find(
      {
        pharmacy_id: pharmacyId,
        $or: [
          { id: { $in: [...ids] } },
          { product_id: { $in: [...ids] } },
          { name: { $in: [...names] } },
          { product_name: { $in: [...names] } },
        ],
      },
      { projection: { _id: 0, id: 1, product_id: 1, name: 1, product_name: 1, schedule_h1: 1, salt_composition: 1, drug_schedule: 1 } }
    )
    .limit(500)
    .toArray();
  const byId = new Map();
  const byName = new Map();
  const comp = new Map();
  const sched = new Map();
  for (const r of rows) {
    if (r.drug_schedule) {
      for (const k of [r.id, r.product_id].filter(Boolean)) sched.set(`id:${k}`, r.drug_schedule);
      for (const k of [r.name, r.product_name].filter(Boolean)) sched.set(`n:${keyOfName(k)}`, r.drug_schedule);
    }
    if (r.salt_composition) {
      for (const k of [r.id, r.product_id].filter(Boolean)) comp.set(`id:${k}`, r.salt_composition);
      for (const k of [r.name, r.product_name].filter(Boolean)) comp.set(`n:${keyOfName(k)}`, r.salt_composition);
    }
    if (r.schedule_h1 !== true && r.schedule_h1 !== false) continue;
    if (r.id) byId.set(String(r.id), r.schedule_h1);
    if (r.product_id) byId.set(String(r.product_id), r.schedule_h1);
    if (r.name) byName.set(keyOfName(r.name), r.schedule_h1);
    if (r.product_name) byName.set(keyOfName(r.product_name), r.schedule_h1);
  }
  return { byId, byName, comp, sched };
}

const overrideFor = (ov, it) => {
  if (it.product_id && ov.byId.has(String(it.product_id))) return ov.byId.get(String(it.product_id));
  const n = keyOfName(it.product_name || it.name);
  return ov.byName.has(n) ? ov.byName.get(n) : undefined;
};

// Sets schedule_h1 (true/false) and schedule_code (see SCHEDULES, or null) on
// each item in place and returns them
async function flagScheduleH1(db, pharmacyId, items = []) {
  if (!items.length) return items;
  const ov = await productOverrides(db, pharmacyId, items);
  for (const it of items) {
    const own = overrideFor(ov, it);
    const salt =
      it.salt_composition ||
      ov.comp.get(`id:${it.product_id}`) ||
      ov.comp.get(`n:${keyOfName(it.product_name || it.name)}`) ||
      "";
    const flagged = { ...it, salt_composition: salt, schedule_h1: own !== undefined ? own : it.schedule_h1 };
    it.schedule_h1 = isScheduleH1(flagged);
    const prodSched = ov.sched.get(`id:${it.product_id}`) || ov.sched.get(`n:${keyOfName(it.product_name || it.name)}`);
    it.schedule_code = scheduleOf(flagged, prodSched);
  }
  return items;
}

// Lines of a bill / purchase with a drug schedule: [{ product_name, schedule }].
// Bill lines carry no composition, so the batch (inventory) and product supply it.
async function scheduleLines(db, pharmacyId, lines = []) {
  if (!lines.length) return [];
  const invIds = lines.map((l) => l.inventory_id).filter(Boolean);
  const inv = invIds.length
    ? await db
        .collection("inventory")
        .find({ pharmacy_id: pharmacyId, id: { $in: invIds } }, { projection: { _id: 0, id: 1, product_id: 1, salt_composition: 1, drug_schedule: 1 } })
        .toArray()
    : [];
  const invById = new Map(inv.map((b) => [b.id, b]));
  const enriched = lines.map((l) => {
    const b = invById.get(l.inventory_id) || {};
    return {
      product_name: l.product_name,
      product_id: l.product_id || b.product_id || null,
      salt_composition: l.salt_composition || b.salt_composition || "",
      drug_schedule: l.drug_schedule || b.drug_schedule || null,
    };
  });
  // Lines without a composition: the product's
  const missing = enriched.filter((e) => !e.salt_composition);
  if (missing.length) {
    const prods = await db
      .collection("products")
      .find(
        {
          pharmacy_id: pharmacyId,
          $or: [
            { id: { $in: missing.map((e) => e.product_id).filter(Boolean) } },
            { name: { $in: missing.map((e) => e.product_name).filter(Boolean) } },
          ],
        },
        { projection: { _id: 0, id: 1, name: 1, salt_composition: 1 } }
      )
      .toArray();
    for (const e of missing) {
      const p = prods.find((x) => (e.product_id && x.id === e.product_id) || keyOfName(x.name) === keyOfName(e.product_name));
      if (p?.salt_composition) e.salt_composition = p.salt_composition;
    }
  }
  await flagScheduleH1(db, pharmacyId, enriched);
  const seen = new Set();
  return enriched
    .filter((e) => e.schedule_code && e.product_name && !seen.has(e.product_name) && seen.add(e.product_name))
    .map((e) => ({ product_name: e.product_name, schedule: e.schedule_code }));
}

// Names of the H1 lines
async function h1Lines(db, pharmacyId, lines = []) {
  return (await scheduleLines(db, pharmacyId, lines)).filter((l) => l.schedule === "H1").map((l) => l.product_name);
}

// Mongo match for this pharmacy's Schedule H1 stock: the salt list, plus its
// own marks in the catalog (and products whose composition is only there)
async function h1InventoryMatch(db, pharmacyId) {
  const rows = await db
    .collection("products")
    .find(
      { pharmacy_id: pharmacyId, $or: [{ schedule_h1: { $in: [true, false] } }, { salt_composition: H1_RE }] },
      { projection: { _id: 0, name: 1, product_name: 1, schedule_h1: 1 } }
    )
    .toArray();
  const namesOf = (r) => [r.name, r.product_name].filter(Boolean);
  const yes = rows.filter((r) => r.schedule_h1 !== false).flatMap(namesOf);
  const no = rows.filter((r) => r.schedule_h1 === false).flatMap(namesOf);
  return {
    $and: [
      { $or: [{ salt_composition: H1_RE }, { product_name: H1_RE }, { product_name: { $in: yes } }] },
      { product_name: { $nin: no } },
    ],
  };
}

module.exports = { H1_SALTS, SCHEDULES, h1Reason, isScheduleH1, normalizeSchedule, scheduleOf, flagScheduleH1, scheduleLines, h1Lines, h1InventoryMatch };
