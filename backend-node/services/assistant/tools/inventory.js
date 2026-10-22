// Inventory agent tools
const S = require("./shared");
const L = require("./lookup");
const { latinName } = require("./names");
const { thresholds } = require("../../dashboard");

const { blocks, cols, inr, textMatch, clampLimit, round2, say, todayIst, addDays } = S;

const notReturned = { status: { $not: /returned/i } };

const settingsThresholds = async (ctx) => {
  const t = await thresholds(ctx.db, ctx.user.id).catch(() => null);
  return { shortage: t?.lowStock ?? 10, expiryWarning: t?.expiryWarningDays ?? 90 };
};

// One row per product with stock totals across its batches
async function groupedStock(ctx, match, { sort = { product_name: 1 }, limit = 30 } = {}) {
  return ctx.db
    .collection("inventory")
    .aggregate([
      { $match: { pharmacy_id: ctx.pharmacyId, ...notReturned, ...match } },
      {
        $group: {
          _id: { $ifNull: ["$product_id", "$product_name"] },
          product_name: { $first: "$product_name" },
          salt: { $first: "$salt_composition" },
          manufacturer: { $first: "$manufacturer" },
          units_per_pack: { $first: "$units_per_pack" },
          pack_type: { $first: "$pack_type" },
          units: { $sum: { $max: [0, { $ifNull: ["$available_quantity", 0] }] } },
          batches: { $sum: 1 },
          mrp: { $max: { $ifNull: ["$mrp", 0] } },
          value_cost: { $sum: { $multiply: [{ $max: [0, { $ifNull: ["$available_quantity", 0] }] }, { $ifNull: ["$purchase_price", 0] }] } },
          nearest_expiry: { $min: { $cond: [{ $gt: ["$available_quantity", 0] }, "$expiry_date", null] } },
          threshold: { $max: "$shortage_threshold" },
        },
      },
      { $sort: sort },
      { $limit: limit },
    ])
    .toArray();
}

const stockRow = (r) => ({
  product: r.product_name,
  salt: r.salt || "",
  units: r.units,
  packs: r.units_per_pack > 1 ? Math.floor(r.units / r.units_per_pack) : r.units,
  units_per_pack: r.units_per_pack || 1,
  batches: r.batches,
  mrp: r.mrp,
  expiry: S.fmtExpiry(r.nearest_expiry),
});

const STOCK_COLS = cols(["product", "Medicine"], ["salt", "Composition"], ["units", "Units", null, "right"], ["packs", "Packs", null, "right"], ["batches", "Batches", null, "right"], ["expiry", "Next exp"], ["mrp", "MRP/unit", "inr", "right"]);

const tools = [
  {
    name: "search_stock",
    description:
      "Stock lookup grouped per medicine. Filter by name, composition/salt, manufacturer, or status: low_stock, out_of_stock, expiring (within N days), expired. Sort by name, stock, expiry or value.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Medicine name" },
        salt: { type: "string", description: "Composition, e.g. 'paracetamol'" },
        manufacturer: { type: "string" },
        filter: { type: "string", enum: ["all", "in_stock", "low_stock", "out_of_stock", "expiring", "expired"] },
        expiring_within_days: { type: "integer", description: "For filter=expiring, default from settings (usually 90)" },
        sort_by: { type: "string", enum: ["name", "stock_low", "stock_high", "expiry", "value"] },
        limit: { type: "integer" },
      },
    },
    status: (a, lang) => say(lang, { en: `Checking stock${a.query ? ` for ${a.query}` : a.salt ? ` with ${a.salt}` : ""}`, hinglish: `Stock check kar raha hoon${a.query ? ` (${a.query})` : ""}`, hi: "स्टॉक देख रहा हूँ" }),
    async run(a, ctx) {
      const th = await settingsThresholds(ctx);
      const and = [];
      if (a.query) and.push(textMatch(["product_name"], a.query));
      if (a.salt) and.push(textMatch(["salt_composition"], a.salt));
      if (a.manufacturer) and.push(textMatch(["manufacturer"], a.manufacturer));
      const today = todayIst();
      if (a.filter === "expired") and.push({ expiry_date: { $lt: today, $gte: "2000" }, available_quantity: { $gt: 0 } });
      if (a.filter === "expiring") and.push({ expiry_date: { $gte: today, $lte: addDays(today, a.expiring_within_days || th.expiryWarning || 90) }, available_quantity: { $gt: 0 } });
      const match = and.filter((x) => Object.keys(x).length).length ? { $and: and.filter((x) => Object.keys(x).length) } : {};
      const sort = { name: { product_name: 1 }, stock_low: { units: 1 }, stock_high: { units: -1 }, expiry: { nearest_expiry: 1 }, value: { value_cost: -1 } }[a.sort_by] || (a.filter === "expiring" || a.filter === "expired" ? { nearest_expiry: 1 } : { product_name: 1 });
      let rows = await groupedStock(ctx, match, { sort, limit: 300 });
      const shortage = th.shortage ?? 10;
      if (a.filter === "out_of_stock") rows = rows.filter((r) => r.units <= 0);
      if (a.filter === "low_stock") rows = rows.filter((r) => r.units > 0 && r.units <= (r.threshold ?? shortage));
      if (a.filter === "in_stock") rows = rows.filter((r) => r.units > 0);
      const total = rows.length;
      rows = rows.slice(0, clampLimit(a.limit, 25, 50)).map(stockRow);
      if (rows.length) ctx.emit(blocks.table(`Stock${a.query ? ` · ${a.query}` : ""}${a.salt ? ` · ${a.salt}` : ""}${a.filter && a.filter !== "all" ? ` · ${a.filter.replace(/_/g, " ")}` : ""}`, STOCK_COLS, rows, { footer: `${total} medicine(s)`, open: "/inventory" }));
      return { total_matches: total, rows: rows.slice(0, 15), low_stock_level: shortage, note: rows.length ? "Table shown; summarise." : "Nothing matched." };
    },
  },
  {
    name: "product_batches",
    description: "All batches of one medicine with stock, expiry, MRP and cost.",
    parameters: { type: "object", properties: { product: { type: "string" } }, required: ["product"] },
    status: (a, lang) => say(lang, { en: `Opening batches of ${a.product}`, hinglish: `${a.product} ke batches dekh raha hoon`, hi: `${a.product} के बैच देख रहा हूँ` }),
    async run(a, ctx) {
      const rows = await ctx.db
        .collection("inventory")
        .find({ pharmacy_id: ctx.pharmacyId, ...textMatch(["product_name"], a.product) }, { projection: { _id: 0, product_name: 1, batch_no: 1, expiry_date: 1, available_quantity: 1, quantity: 1, mrp: 1, purchase_price: 1, status: 1, units_per_pack: 1 } })
        .sort({ expiry_date: 1 })
        .limit(40)
        .toArray();
      const today = todayIst();
      const table = rows.map((r) => ({
        product: r.product_name,
        batch: r.batch_no,
        expiry: S.fmtExpiry(r.expiry_date),
        stock: r.available_quantity || 0,
        received: r.quantity || 0,
        mrp: r.mrp,
        cost: round2(r.purchase_price),
        state: /returned/i.test(r.status || "") ? "Returned" : r.expiry_date && r.expiry_date < today ? "Expired" : (r.available_quantity || 0) > 0 ? "In stock" : "Empty",
      }));
      if (table.length) ctx.emit(blocks.table(`Batches · ${a.product}`, cols(["product", "Medicine"], ["batch", "Batch"], ["expiry", "Exp"], ["stock", "Stock", null, "right"], ["received", "Received", null, "right"], ["mrp", "MRP", "inr", "right"], ["cost", "Cost", "inr", "right"], ["state", "State", "badge"]), table));
      return { batches: table.length, in_stock_units: table.reduce((s, r) => s + (r.state === "In stock" ? r.stock : 0), 0), rows: table.slice(0, 20) };
    },
  },
  {
    name: "find_alternatives",
    description: "Find in-stock medicines with the same composition (salt + strength) as a given medicine or salt. Use for 'koi alternate hai?', 'substitute for X'.",
    parameters: { type: "object", properties: { product: { type: "string" }, salt: { type: "string" } } },
    status: (a, lang) => say(lang, { en: `Finding alternatives${a.product ? ` to ${a.product}` : ""}`, hinglish: `${a.product || a.salt} ka alternative dhoondh raha hoon`, hi: "विकल्प खोज रहा हूँ" }),
    async run(a, ctx) {
      let salt = a.salt || "";
      if (!salt && a.product) {
        const inv = await ctx.db.collection("inventory").findOne({ pharmacy_id: ctx.pharmacyId, ...textMatch(["product_name"], a.product), salt_composition: { $nin: [null, ""] } }, { projection: { salt_composition: 1 } });
        salt = inv?.salt_composition || "";
        if (!salt) {
          const cat = await ctx.db.collection("products").findOne({ pharmacy_id: ctx.pharmacyId, ...textMatch(["name"], a.product), salt_composition: { $nin: [null, ""] } }, { projection: { salt_composition: 1 } });
          salt = cat?.salt_composition || "";
        }
        if (!salt) salt = (await L.globalMedicine(a.product))?.salt_composition || "";
      }
      if (!salt) return { error: "Couldn't determine the composition. Ask the user for the salt." };
      // Match on the ingredient words and strengths, ignoring units/brackets
      const key = S.tokenize(salt).filter((t) => !["mg", "ml", "mcg", "gm", "g", "w", "v", "ip", "bp", "usp", "and"].includes(t));
      const words = key.filter((t) => !/^\d/.test(t));
      if (!words.length) return { error: "Composition unclear", salt };
      let rows = await groupedStock(ctx, textMatch(["salt_composition"], words.join(" ")), { sort: { units: -1 }, limit: 60 });
      const strengths = key.filter((t) => /^\d/.test(t));
      const sameStrength = (r) => !strengths.length || strengths.every((s) => S.tokenize(r.salt || "").includes(s));
      rows = rows.filter((r) => r.units > 0 && (!a.product || L.norm(r.product_name) !== L.norm(a.product)));
      const exact = rows.filter(sameStrength).map(stockRow);
      const other = rows.filter((r) => !sameStrength(r)).map(stockRow);
      if (exact.length) ctx.emit(blocks.table(`Same composition in stock · ${salt}`, STOCK_COLS, exact.slice(0, 20)));
      if (other.length) ctx.emit(blocks.table(`Same salt, different strength`, STOCK_COLS, other.slice(0, 10)));
      return { composition: salt, same_strength: exact.slice(0, 10), different_strength: other.slice(0, 5), note: exact.length || other.length ? "Tables shown." : "No alternative in stock." };
    },
  },
  {
    name: "stock_summary",
    description: "Overall inventory health: stock value (cost and MRP), medicines in stock, low stock, out of stock, expiring and expired counts.",
    parameters: { type: "object", properties: {} },
    status: (a, lang) => say(lang, { en: "Summarising your inventory", hinglish: "Poore stock ka summary bana raha hoon", hi: "स्टॉक का सारांश बना रहा हूँ" }),
    async run(a, ctx) {
      const th = await settingsThresholds(ctx);
      const rows = await groupedStock(ctx, {}, { limit: 100000 });
      const today = todayIst();
      const soon = addDays(today, th.expiryWarning || 90);
      const batchAgg = await ctx.db
        .collection("inventory")
        .aggregate([
          { $match: { pharmacy_id: ctx.pharmacyId, ...notReturned, available_quantity: { $gt: 0 } } },
          {
            $group: {
              _id: null,
              cost: { $sum: { $multiply: ["$available_quantity", { $ifNull: ["$purchase_price", 0] }] } },
              mrp: { $sum: { $multiply: ["$available_quantity", { $ifNull: ["$mrp", 0] }] } },
              expired: { $sum: { $cond: [{ $and: [{ $lt: ["$expiry_date", today] }, { $gte: ["$expiry_date", "2000"] }] }, 1, 0] } },
              expiring: { $sum: { $cond: [{ $and: [{ $gte: ["$expiry_date", today] }, { $lte: ["$expiry_date", soon] }] }, 1, 0] } },
            },
          },
        ])
        .next();
      const s = {
        medicines_in_stock: rows.filter((r) => r.units > 0).length,
        out_of_stock: rows.filter((r) => r.units <= 0).length,
        low_stock: rows.filter((r) => r.units > 0 && r.units <= (r.threshold ?? th.shortage ?? 10)).length,
        stock_value_cost: round2(batchAgg?.cost || 0),
        stock_value_mrp: round2(batchAgg?.mrp || 0),
        expiring_batches: batchAgg?.expiring || 0,
        expired_batches: batchAgg?.expired || 0,
      };
      ctx.emit(
        blocks.stats([
          { label: "Stock value", value: inr(s.stock_value_cost), hint: `MRP ${inr(s.stock_value_mrp)}` },
          { label: "In stock", value: String(s.medicines_in_stock), hint: `${s.out_of_stock} out of stock` },
          { label: "Low stock", value: String(s.low_stock) },
          { label: "Expiring", value: String(s.expiring_batches), hint: `${s.expired_batches} expired` },
        ], "Inventory health")
      );
      return s;
    },
  },
  {
    name: "add_stock",
    description: "Ask to add units to an existing batch (stock correction). Shows a confirmation card.",
    parameters: { type: "object", properties: { product: { type: "string" }, batch_no: { type: "string" }, units: { type: "integer" } }, required: ["product", "batch_no", "units"] },
    status: (a, lang) => say(lang, { en: "Preparing the stock update", hinglish: "Stock update ready kar raha hoon", hi: "स्टॉक अपडेट तैयार कर रहा हूँ" }),
    async run(a, ctx) {
      a.product = await latinName(a.product, "medicine");
      const inv = await ctx.db.collection("inventory").findOne({ pharmacy_id: ctx.pharmacyId, ...textMatch(["product_name"], a.product), batch_no: { $regex: `^${S.escapeRegex(a.batch_no)}$`, $options: "i" } }, { projection: { _id: 0, id: 1, product_name: 1, batch_no: 1, available_quantity: 1 } });
      if (!inv) return { error: "Batch not found" };
      if (!(a.units > 0)) return { error: "Units must be positive" };
      ctx.emit({
        type: "confirm",
        tone: "primary",
        title: `Add ${a.units} units to ${inv.product_name} · ${inv.batch_no}`,
        text: `Stock ${inv.available_quantity || 0} → ${(inv.available_quantity || 0) + a.units}`,
        actions: [
          { label: "Add stock", style: "primary", action: { type: "op", op: "add_stock", inventory_id: inv.id, units: a.units } },
          { label: "Cancel", style: "ghost", action: { type: "dismiss" } },
        ],
      });
      return { awaiting_confirmation: true };
    },
  },
];

const ops = {
  async add_stock(a, ctx) {
    await S.api(ctx, "PATCH", `/inventory/${a.inventory_id}/add-quantity`, { add_quantity: a.units });
    return { block: { type: "result", tone: "success", title: "Stock updated", text: `+${a.units} units` }, summary: { added_units: a.units } };
  },
};

module.exports = { tools, ops };
