// Alternates: other medicines in the pharmacy's own stock with the same salt.
//   exact   same ingredients at the same strengths ("Paracetamol 650mg")
//   partial same ingredients, different strengths
//   related one's ingredients are part of the other's (e.g. paracetamol alone)
// Only unexpired batches with stock count; returned per medicine, in the same
// shape as /inventory/search so billing can pick one straight into a row.
const { keyOf, todayIst } = require("./stockLevels");

// "Paracetamol (325mg) + Tramadol (37.5 mg)" -> [{name:"paracetamol", dose:"325mg"}, ...]
function parseSalt(salt) {
  return String(salt || "")
    .toLowerCase()
    .split(/\s*(?:\+|,|&|\band\b)\s*/)
    .map((part) => {
      const dose = (part.match(/(\d+(?:\.\d+)?)\s*(mg|mcg|µg|g|ml|iu|%)/) || []).slice(1).join("");
      const name = part
        .replace(/\(.*?\)/g, " ")
        .replace(/\d+(?:\.\d+)?\s*(mg|mcg|µg|g|ml|iu|%)(\s*\/\s*\d*\s*(ml|g))?/g, " ")
        .replace(/[^a-z\s-]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      return name ? { name, dose } : null;
    })
    .filter(Boolean);
}

const RANK = { exact: 0, partial: 1, related: 2 };
const names = (parts) => [...new Set(parts.map((p) => p.name))].sort();
const full = (parts) => parts.map((p) => `${p.name}:${p.dose}`).sort().join("|");

function matchKind(target, other) {
  if (!target.length || !other.length) return null;
  const a = names(target), b = names(other);
  if (a.join("|") === b.join("|")) return full(target) === full(other) ? "exact" : "partial";
  const [small, big] = a.length <= b.length ? [a, b] : [b, a];
  return small.every((n) => big.includes(n)) ? "related" : null;
}

async function findAlternates(db, pharmacyId, { salt, exclude, limit = 30 }) {
  const target = parseSalt(salt);
  if (!target.length) return { salt: salt || "", ingredients: [], alternates: [] };
  const today = todayIst();
  // Narrow by any ingredient's first word, then match precisely in memory
  const first = [...new Set(target.map((t) => t.name.split(" ")[0]))].map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const rows = await db
    .collection("inventory")
    .find(
      {
        pharmacy_id: pharmacyId,
        available_quantity: { $gt: 0 },
        status: { $nin: ["Returned", "Expired & Returned"] },
        salt_composition: { $regex: first, $options: "i" },
      },
      { projection: { _id: 0 } }
    )
    .limit(3000)
    .toArray();

  const excludeKey = keyOf(exclude);
  const groups = new Map();
  for (const r of rows) {
    if (r.expiry_date && /^\d{4}-\d{2}/.test(r.expiry_date) && r.expiry_date.slice(0, 10) < today) continue;
    const key = keyOf(r.product_name);
    if (!key || key === excludeKey) continue;
    const kind = matchKind(target, parseSalt(r.salt_composition));
    if (!kind) continue;
    let g = groups.get(key);
    if (!g) {
      g = {
        id: r.id,
        product_id: r.product_id || null,
        product_name: r.product_name,
        manufacturer: r.manufacturer || null,
        salt_composition: r.salt_composition,
        hsn_no: r.hsn_no || null,
        units_per_pack: r.units_per_pack,
        pack_type: r.pack_type,
        purchase_price: r.purchase_price,
        mrp: r.mrp,
        cgst: r.cgst,
        sgst: r.sgst,
        available_quantity: 0,
        batches: [],
        source: "inventory",
        match: kind,
      };
      groups.set(key, g);
    }
    g.available_quantity += Number(r.available_quantity) || 0;
    g.batches.push({
      id: r.id,
      batch_no: r.batch_no,
      expiry_date: r.expiry_date,
      available_quantity: r.available_quantity,
      quantity: r.quantity,
      purchase_price: r.purchase_price,
      mrp: r.mrp,
      units_per_pack: r.units_per_pack,
      pack_type: r.pack_type,
      cgst: r.cgst,
      sgst: r.sgst,
    });
  }
  const alternates = [...groups.values()]
    .map((g) => {
      g.batches.sort((x, y) => String(x.expiry_date || "9").localeCompare(String(y.expiry_date || "9")));
      // Batches store MRP per unit; lowest one, for comparing prices
      const perUnit = g.batches.map((b) => Number(b.mrp) || 0).filter((v) => v > 0);
      g.mrp_per_unit = perUnit.length ? Math.min(...perUnit) : 0;
      g.available_units = g.available_quantity;
      return g;
    })
    .sort((x, y) => RANK[x.match] - RANK[y.match] || y.available_quantity - x.available_quantity)
    .slice(0, limit);
  return { salt, ingredients: target, alternates };
}

module.exports = { findAlternates, parseSalt, matchKind };
