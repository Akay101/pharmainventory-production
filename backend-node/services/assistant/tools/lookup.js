// Cross-module lookups: catalog products, suppliers, customers, global
// medicine facts. Used by several agents to resolve what the user named.
const { matchForPurchase, nameSimilarity, coreTokens, strengthsOf } = require("../../ai/inventoryMatch");
const { searchGlobalMedicines } = require("../../search/medicineSearch");
const { isMedicineDbAvailable, getGlobalMedicinesCollection } = require("../../../utils/globalDb");
const { escapeRegex, api, textMatch } = require("./shared");
const { tokenize, cleanProductName, medicineKey } = require("../../search/normalize");

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

// Catalog product for a purchase line, with what we know about it
async function resolveCatalogProduct(ctx, rawName, batch) {
  const name = cleanProductName(rawName) || rawName;
  const m = await matchForPurchase(ctx.db, ctx.pharmacyId, { product_name: name, batch_no: batch || "" });
  let linked = null;
  if (m.batch_match) linked = { product_id: m.batch_match.product_id, product_name: m.batch_match.product_name, via: "batch" };
  else if (m.exact_name_match) linked = { product_id: m.exact_name_match.product_id, product_name: m.exact_name_match.product_name, via: "name" };
  else if (m.suggestions[0]?.is_high_confidence) linked = { product_id: m.suggestions[0].product_id, product_name: m.suggestions[0].product_name, via: "similar" };
  if (!linked) linked = await sameMedicineInCatalog(ctx, name);
  const options = m.suggestions.slice(0, 5).map((s) => ({ product_id: s.product_id, product_name: s.product_name }));
  return { linked, options };
}

// The catalog item that is this medicine under another spelling ("OXALGIN-DP
// TAB 20S ." for "Oxalgin DP Tablet"): same cleaned key, or the same brand and
// strength once pack text is stripped from both
async function sameMedicineInCatalog(ctx, name) {
  const key = medicineKey(name);
  const brand = tokenize(cleanProductName(name)).find((t) => /[a-z]/.test(t) && t.length >= 3);
  if (!key || !brand) return null;
  const rows = await ctx.db
    .collection("products")
    .find({ pharmacy_id: ctx.pharmacyId, name: { $regex: `^\\W*${escapeRegex(brand)}`, $options: "i" } }, { projection: { _id: 0, id: 1, name: 1 } })
    .limit(60)
    .toArray();
  const hit =
    rows.find((r) => medicineKey(r.name) === key) ||
    rows.find((r) => nameSimilarity(cleanProductName(name), cleanProductName(r.name)) >= 0.95);
  return hit ? { product_id: hit.id, product_name: hit.name, via: "same medicine" } : null;
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

const globalFacts = (r) => ({
  name: r.product_name || r.name,
  manufacturer: r.manufacturer || r.manufacturer_name || "",
  salt_composition: r.salt_composition || r.active_ingredients || r.short_composition1 || "",
  pack_size: r.pack_size_label || r.packaging_label || r.package_details || "",
  units_per_pack: r.units_per_pack || null,
  mrp: Number(r.mrp || r["price(₹)"] || 0) || null,
  dosage_form: r.dosage_form || "",
});

// What a medicine name says: brand/variant words, strengths, dosage form
const FORM_OF = { tab: "tab", tabs: "tab", tablet: "tab", tablets: "tab", cap: "cap", caps: "cap", capsule: "cap", capsules: "cap", syp: "liquid", syr: "liquid", syrup: "liquid", susp: "liquid", suspension: "liquid", inj: "inj", injection: "inj", drop: "drop", drops: "drop", cream: "topical", gel: "topical", oint: "topical", ointment: "topical", lotion: "topical", powder: "powder", sachet: "powder" };
function describe(name) {
  const clean = cleanProductName(name);
  const words = coreTokens(clean).filter((t) => /[a-z]/.test(t));
  const form = tokenize(clean).map((t) => FORM_OF[t]).find(Boolean) || null;
  return { words: [...new Set(words)].sort().join(" "), strengths: strengthsOf(clean), form };
}

// The one database entry that is clearly this medicine: exactly the same
// brand and variant words, the same strengths ("Amlokind 2.5" is not
// "Amlokind 5"; "Naprosyn 250" is not "Naprosyn D 250"), and the dosage form
// when one was said. Anything less goes to the user to pick.
function exactGlobalMatch(name, rows) {
  const q = describe(name);
  if (!q.words) return null;
  let hits = rows
    .map((r) => ({ r, c: describe(r.product_name || r.name || "") }))
    .filter(({ c }) => c.words === q.words && [...q.strengths].sort().join() === [...c.strengths].sort().join());
  if (q.form) hits = hits.filter(({ c }) => c.form === q.form);
  // Pack-size copies of one medicine count once
  const kinds = new Set(hits.map(({ c }) => `${[...c.strengths].sort().join(",")}|${c.form}`));
  return kinds.size === 1 ? globalFacts(hits[0].r) : null;
}

// Ranked matches from the global medicine database; `best` only when one
// entry is exactly the medicine said (see exactGlobalMatch).
async function globalCandidates(rawName, limit = 6) {
  if (!(await isMedicineDbAvailable())) return { best: null, list: [], offline: true };
  try {
    const name = cleanProductName(rawName) || rawName;
    // Search the full name, then brand + strength, then the brand alone when
    // the first search is thin ("Calpol 650 Tab" finds "Calpol 650mg Tablet")
    const words = tokenize(name).filter((t) => !/^(tab|tabs|tablet|tablets|cap|caps|capsule|capsules|syp|syrup|inj|injection)$/.test(t));
    const brand = words.find((t) => !/^\d/.test(t)) || "";
    const strength = words.find((t) => /^\d/.test(t)) || "";
    const queries = [...new Set([name, [brand, strength].filter(Boolean).join(" "), brand].filter((q) => q && q.length >= 2))];
    const seen = new Map();
    for (const q of queries) {
      const rows = await searchGlobalMedicines(q, { limit: 15 });
      for (const r of rows) {
        const n = r.product_name || r.name || "";
        if (!seen.has(n.toLowerCase())) seen.set(n.toLowerCase(), r);
      }
      const strong = [...seen.values()].some((r) => nameSimilarity(name, r.product_name || r.name || "") >= 0.85);
      if (strong) break;
    }
    const scored = [...seen.values()]
      .map((r) => ({ r, sim: nameSimilarity(name, r.product_name || r.name || "") }))
      .filter((x) => x.sim >= 0.5)
      .sort((a, b) => b.sim - a.sim);
    const list = scored.slice(0, limit).map((x) => ({ ...globalFacts(x.r), similarity: Math.round(x.sim * 100) / 100 }));
    return { best: exactGlobalMatch(name, scored.map((x) => x.r)), list };
  } catch {
    return { best: null, list: [] };
  }
}

// What the search box in a picker card shows as the user types
async function pickerSearch(ctx, kind, q) {
  q = String(q || "").trim().slice(0, 80);
  if (q.length < 2) return { options: [] };
  if (kind === "supplier") {
    const r = await resolveSupplier(ctx, q);
    return { options: r.options.map((o) => ({ source: o.is_global ? "global" : "yours", id: o.id, name: o.name, detail: [o.city, o.gst_no].filter(Boolean).join(" · ") })) };
  }
  const catalog = await ctx.db
    .collection("products")
    .find({ pharmacy_id: ctx.pharmacyId, ...textMatch(["name"], q) }, { projection: { _id: 0, id: 1, name: 1, manufacturer: 1, units_per_pack: 1 } })
    .limit(6)
    .toArray();
  const offline = !(await isMedicineDbAvailable());
  const seen = new Set(catalog.map((p) => medicineKey(p.name)));
  const options = catalog.map((p) => ({ source: "catalog", id: p.id, name: p.name, detail: ["In your catalog", p.manufacturer].filter(Boolean).join(" · ") }));
  let global = [];
  if (!offline) {
    try {
      global = await searchGlobalMedicines(q, { limit: 12 });
    } catch {}
    // Half-typed names ("Azithra") when the word index has nothing: names that start with it
    if (global.length < 4 && q.length >= 3) {
      try {
        const col = await getGlobalMedicinesCollection();
        const more = await col
          .find({ product_name: { $regex: `^${escapeRegex(q)}`, $options: "i" } }, { projection: { _id: 0 } })
          .limit(12)
          .maxTimeMS(1500)
          .toArray();
        global = [...global, ...more];
      } catch {}
    }
  }
  // Every word typed has to start a word of the result ("korvantix 5" must
  // not list everything with a 5 in it)
  const typed = tokenize(q).filter((t) => /[a-z]/.test(t));
  const fits = (name) => {
    const words = tokenize(name);
    return typed.every((t) => words.some((w) => w.startsWith(t)));
  };
  for (const r of global) {
    const f = globalFacts(r);
    const k = medicineKey(f.name);
    if (!f.name || seen.has(k) || !fits(f.name)) continue; // already in the catalog: one entry per medicine
    seen.add(k);
    options.push({ source: "global", name: f.name, detail: [f.manufacturer, f.pack_size].filter(Boolean).join(" · ") });
    if (options.length >= 12) break;
  }
  return { options, medicine_db_offline: offline };
}

// Sound-alike key for names that reach us through Hindi speech: "Neelkanth
// Pharmaceuticals" and "Nilkanth Pharmaceutical" -> the same key. Every word
// counts, so "Shiv Shakti Pharma" and "Shiv Shakti Agency" stay different.
function soundKey(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) =>
      w
        .replace(/s$/, "")
        .replace(/ph/g, "f")
        .replace(/ck/g, "k")
        .replace(/c(?=[eiy])/g, "s")
        .replace(/[cq]/g, "k")
        .replace(/w/g, "v")
        .replace(/z/g, "j")
        .replace(/sh/g, "s")
        .replace(/([bcdfgjklmnpqrstvxz])h/g, "$1")
        .replace(/^(.)(.*)$/, (m, a, rest) => a + rest.replace(/[aeiouy]/g, "")) // vowels vary; keep the first letter
        .replace(/(.)\1+/g, "$1")
    )
    .join(" ");
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
  // Your own suppliers by sound, for spellings the search can't find
  const said = soundKey(text);
  if (said) {
    const mine = await ctx.db
      .collection("suppliers")
      .find({ pharmacy_id: ctx.pharmacyId }, { projection: { _id: 0, id: 1, name: 1, city: 1, gst_no: 1 } })
      .limit(2000)
      .toArray();
    for (const m of mine) {
      if (seen.has(`l:${m.id}`)) continue;
      const k = soundKey(m.name);
      if (k === said) {
        seen.add(`l:${m.id}`);
        list.unshift({ ...m, is_local: true, sounds_like: true });
      } else if (said.length >= 3 && k.startsWith(said)) {
        // "nilkanth" while typing: offer it, but don't treat it as certain
        seen.add(`l:${m.id}`);
        list.push({ ...m, is_local: true });
      }
    }
  }
  const t = norm(text);
  const scored = list
    .map((s) => {
      const n = norm(s.name);
      const exact = n === t || (s.gst_no && norm(s.gst_no) === t) || s.sounds_like;
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

module.exports = { soundKey, pickerSearch, sameMedicineInCatalog, resolveCatalogProduct, lastPurchaseLine, catalogProduct, globalMedicine, globalCandidates, resolveSupplier, resolveCustomer, norm };
