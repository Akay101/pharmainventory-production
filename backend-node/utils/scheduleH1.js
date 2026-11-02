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
  if (!ids.size && !names.size) return { byId: new Map(), byName: new Map(), comp: new Map() };
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
      { projection: { _id: 0, id: 1, product_id: 1, name: 1, product_name: 1, schedule_h1: 1, salt_composition: 1 } }
    )
    .limit(500)
    .toArray();
  const byId = new Map();
  const byName = new Map();
  const comp = new Map();
  for (const r of rows) {
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
  return { byId, byName, comp };
}

const overrideFor = (ov, it) => {
  if (it.product_id && ov.byId.has(String(it.product_id))) return ov.byId.get(String(it.product_id));
  const n = keyOfName(it.product_name || it.name);
  return ov.byName.has(n) ? ov.byName.get(n) : undefined;
};

// Sets schedule_h1 (true/false) on each item in place and returns them
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
    it.schedule_h1 = isScheduleH1({ ...it, salt_composition: salt, schedule_h1: own !== undefined ? own : it.schedule_h1 });
  }
  return items;
}

// Lines of a bill / purchase that are H1. Bill lines carry no composition, so
// the batch (inventory) and product supply it.
async function h1Lines(db, pharmacyId, lines = []) {
  if (!lines.length) return [];
  const invIds = lines.map((l) => l.inventory_id).filter(Boolean);
  const inv = invIds.length
    ? await db
        .collection("inventory")
        .find({ pharmacy_id: pharmacyId, id: { $in: invIds } }, { projection: { _id: 0, id: 1, product_id: 1, salt_composition: 1 } })
        .toArray()
    : [];
  const invById = new Map(inv.map((b) => [b.id, b]));
  const enriched = lines.map((l) => {
    const b = invById.get(l.inventory_id) || {};
    return {
      product_name: l.product_name,
      product_id: l.product_id || b.product_id || null,
      salt_composition: l.salt_composition || b.salt_composition || "",
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
  return enriched.filter((e) => e.schedule_h1).map((e) => e.product_name);
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

module.exports = { H1_SALTS, h1Reason, isScheduleH1, flagScheduleH1, h1Lines, h1InventoryMatch };
