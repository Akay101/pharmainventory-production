// Cross-module lookups: catalog products, suppliers, customers, global
// medicine facts. Used by several agents to resolve what the user named.
const { matchForPurchase, nameSimilarity } = require("../../ai/inventoryMatch");
const { searchGlobalMedicines } = require("../../search/medicineSearch");
const { escapeRegex, api, textMatch } = require("./shared");

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

// Catalog product for a purchase line, with what we know about it
async function resolveCatalogProduct(ctx, name, batch) {
  const m = await matchForPurchase(ctx.db, ctx.pharmacyId, { product_name: name, batch_no: batch || "" });
  let linked = null;
  if (m.batch_match) linked = { product_id: m.batch_match.product_id, product_name: m.batch_match.product_name, via: "batch" };
  else if (m.exact_name_match) linked = { product_id: m.exact_name_match.product_id, product_name: m.exact_name_match.product_name, via: "name" };
  else if (m.suggestions[0]?.is_high_confidence) linked = { product_id: m.suggestions[0].product_id, product_name: m.suggestions[0].product_name, via: "similar" };
  const options = m.suggestions.slice(0, 5).map((s) => ({ product_id: s.product_id, product_name: s.product_name }));
  return { linked, options };
}

// What the last purchase of this product looked like (prefills a draft)
async function lastPurchaseLine(ctx, productId, productName) {
  const q = productId ? { "items.product_id": productId } : { "items.product_name": { $regex: `^${escapeRegex(productName)}$`, $options: "i" } };
  const p = await ctx.db
    .collection("purchases")
    .find({ pharmacy_id: ctx.pharmacyId, ...q }, { projection: { _id: 0, items: 1, purchase_date: 1, supplier_name: 1 } })
    .sort({ purchase_date: -1, created_at: -1 })
    .limit(1)
    .next();
  if (!p) return null;
  const it = (p.items || []).find((i) => (productId ? i.product_id === productId : norm(i.product_name) === norm(productName)));
  if (!it) return null;
  return {
    date: p.purchase_date,
    supplier: p.supplier_name,
    units_per_pack: it.units_per_pack,
    rate_per_pack: it.pack_price,
    mrp_per_pack: it.mrp_pack || (it.mrp_per_unit || it.mrp || 0) * (it.units_per_pack || 1),
    gst_percent: (Number(it.cgst) || 0) + (Number(it.sgst) || 0),
    discount_percent: it.discount || 0,
    pack_type: it.pack_type,
  };
}

async function catalogProduct(ctx, productId) {
  if (!productId) return null;
  return ctx.db.collection("products").findOne(
    { pharmacy_id: ctx.pharmacyId, $or: [{ id: productId }, { product_id: productId }] },
    { projection: { _id: 0, id: 1, name: 1, units_per_pack: 1, pack_type: 1, manufacturer: 1, salt_composition: 1, hsn_no: 1 } }
  );
}

// Facts from the global medicine database (pack size, maker, composition)
async function globalMedicine(name) {
  try {
    const rows = await searchGlobalMedicines(name, { limit: 5 });
    const best = rows
      .map((r) => ({ r, sim: nameSimilarity(name, r.product_name || r.name || "") }))
      .filter((x) => x.sim >= 0.5)
      .sort((a, b) => b.sim - a.sim)[0]?.r;
    if (!best) return null;
    return {
      name: best.product_name || best.name,
      manufacturer: best.manufacturer || best.manufacturer_name || "",
      salt_composition: best.salt_composition || best.active_ingredients || best.short_composition1 || "",
      pack_size: best.pack_size_label || best.packaging_label || best.package_details || "",
      units_per_pack: best.units_per_pack || null,
      mrp: Number(best.mrp || best["price(₹)"] || 0) || null,
      dosage_form: best.dosage_form || "",
    };
  } catch {
    return null;
  }
}

// Supplier by name/GSTIN: your suppliers first, then the global directory.
// Invoices often print a longer name ("Shiv Shakti Pharma Distributors" for
// "Shiv Shakti Pharma"), so a name that is the start of the other counts.
async function resolveSupplier(ctx, text) {
  if (!text) return { supplier: null, options: [] };
  const fetchList = async (q) => {
    try {
      const data = await api(ctx, "GET", `/suppliers?search=${encodeURIComponent(q)}&limit=8&include_global=true`);
      return data.suppliers || [];
    } catch {
      return [];
    }
  };
  const words = String(text).trim().split(/\s+/);
  const lists = await Promise.all([fetchList(text), words.length > 2 ? fetchList(words.slice(0, 2).join(" ")) : []]);
  const seen = new Set();
  const list = lists.flat().filter((s) => {
    const k = `${s.is_local === false ? "g" : "l"}:${s.id}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const t = norm(text);
  const scored = list
    .map((s) => {
      const n = norm(s.name);
      const exact = n === t || (s.gst_no && norm(s.gst_no) === t);
      const prefix = n.length >= 6 && t.length >= 6 && (n.startsWith(t) || t.startsWith(n));
      const starts = n.startsWith(t.slice(0, 6));
      return { s, score: (exact ? 3 : prefix ? 2.6 : starts ? 2 : 1) + (s.is_local === false ? 0 : 0.5) };
    })
    .sort((a, b) => b.score - a.score);
  const options = scored.slice(0, 6).map(({ s }) => ({ id: s.id, name: s.name, city: s.city || "", gst_no: s.gst_no || s.gstin || "", is_global: s.is_local === false }));
  const top = scored[0];
  const confident = top && top.score >= 3 && (scored.length === 1 || scored[1].score < top.score);
  return { supplier: confident ? options[0] : null, options };
}

async function resolveCustomer(ctx, { name, mobile }) {
  const col = ctx.db.collection("customers");
  if (mobile) {
    const digits = String(mobile).replace(/\D/g, "").slice(-10);
    if (digits.length === 10) {
      const c = await col.findOne({ pharmacy_id: ctx.pharmacyId, mobile: { $regex: `${digits}$` } }, { projection: { _id: 0 } });
      if (c) return { customer: c, options: [] };
    }
  }
  if (!name) return { customer: null, options: [] };
  const rows = await col
    .find({ pharmacy_id: ctx.pharmacyId, ...textMatch(["name"], name) }, { projection: { _id: 0, id: 1, name: 1, mobile: 1, total_debt: 1 } })
    .limit(6)
    .toArray();
  const exact = rows.filter((r) => norm(r.name) === norm(name));
  // "Ramesh" with exactly one Ramesh on file is that customer
  const pick = exact.length === 1 ? exact[0] : !exact.length && rows.length === 1 ? rows[0] : null;
  return { customer: pick, options: pick ? [] : rows };
}

module.exports = { resolveCatalogProduct, lastPurchaseLine, catalogProduct, globalMedicine, resolveSupplier, resolveCustomer, norm };
