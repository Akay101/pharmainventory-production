// One definition of "low stock", "shortage" and "expiring" for the whole app
// (inventory filters and badges, shortage endpoint, dashboard).
//
// Per medicine (grouped by name, like the inventory list):
//   stock      = units in batches that are not expired (expired stock can't be sold)
//   threshold  = the medicine's own threshold if one was set, else the global
//                one from Settings ("shortage_threshold")
//   state      = "out"       nothing sellable left
//                "low"       at or below the threshold
//                "ok"        above it
//                "untracked" custom threshold 0 and nothing left: never listed
// Low stock list  = "low" (still in stock, running out)
// Shortage list   = "low" + "out" (everything to reorder)
//
// Custom thresholds: products.custom_threshold (set from Inventory / Settings);
// older data may only have one typed on a purchase line (inventory batch
// shortage_threshold, null unless typed). products.shortage_threshold is NOT
// used: new products always got 10 there, so it can't tell custom from default.

const DEFAULTS = { shortage_threshold: 10, expiry_warning_days: 90, expiry_critical_days: 30 };

const num = (v) => (v === undefined || v === null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const todayIst = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
const addDays = (ymd, n) => {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const keyOf = (name) => String(name || "").trim().toLowerCase();

// Global thresholds: the user's own Settings, else the pharmacy owner's (staff
// follow the owner), else the registry default.
async function stockSettings(db, user) {
  const keys = Object.keys(DEFAULTS);
  const [registry, mine, owner] = await Promise.all([
    db.collection("settings_registry").find({ key: { $in: keys } }, { projection: { key: 1, default: 1 } }).toArray(),
    db.collection("user_settings").findOne({ user_id: user.id }, { projection: { preferences: 1 } }),
    db
      .collection("users")
      .findOne({ pharmacy_id: user.pharmacy_id, is_primary_admin: true }, { projection: { id: 1 } })
      .then((o) => (o && o.id !== user.id ? db.collection("user_settings").findOne({ user_id: o.id }, { projection: { preferences: 1 } }) : null)),
  ]);
  const out = {};
  for (const k of keys) {
    const reg = registry.find((r) => r.key === k);
    out[k] = num(mine?.preferences?.[k]) ?? num(owner?.preferences?.[k]) ?? num(reg?.default) ?? DEFAULTS[k];
  }
  return {
    lowStock: Math.max(0, out.shortage_threshold),
    expiryWarningDays: Math.max(1, out.expiry_warning_days),
    expiryCriticalDays: Math.max(1, out.expiry_critical_days),
  };
}

async function stockLevels(db, user) {
  const settings = await stockSettings(db, user);
  const today = todayIst();
  const pharmacyId = user.pharmacy_id;
  const [batches, products] = await Promise.all([
    db
      .collection("inventory")
      .find({ pharmacy_id: pharmacyId }, { projection: { _id: 0, product_id: 1, product_name: 1, available_quantity: 1, expiry_date: 1, shortage_threshold: 1 } })
      .toArray(),
    db.collection("products").find({ pharmacy_id: pharmacyId }, { projection: { _id: 0, id: 1, name: 1, product_name: 1, custom_threshold: 1 } }).toArray(),
  ]);
  const productById = new Map(products.map((p) => [p.id, p]));
  const productByName = new Map(products.map((p) => [keyOf(p.name || p.product_name), p]));

  const levels = new Map();
  for (const b of batches) {
    const key = keyOf(b.product_name);
    if (!key) continue;
    let e = levels.get(key);
    if (!e) {
      e = { name: b.product_name, product_id: b.product_id || null, stock: 0, typed: null };
      levels.set(key, e);
    }
    if (!e.product_id && b.product_id) e.product_id = b.product_id;
    const avail = Number(b.available_quantity) || 0;
    const expired = b.expiry_date && /^\d{4}-\d{2}/.test(b.expiry_date) && b.expiry_date.slice(0, 10) < today;
    if (avail > 0 && !expired) e.stock += avail;
    const t = num(b.shortage_threshold);
    if (t !== null) e.typed = e.typed === null ? t : Math.max(e.typed, t);
  }

  const counts = { low: 0, out: 0, shortage: 0 };
  for (const e of levels.values()) {
    const product = (e.product_id && productById.get(e.product_id)) || productByName.get(keyOf(e.name)) || null;
    const custom = num(product?.custom_threshold) ?? e.typed;
    e.custom = custom;
    e.threshold = custom ?? settings.lowStock;
    e.state = e.stock <= 0 ? (custom === 0 ? "untracked" : "out") : e.stock <= e.threshold ? "low" : "ok";
    if (e.state === "low") counts.low++;
    if (e.state === "out") counts.out++;
    if (e.state === "low" || e.state === "out") counts.shortage++;
  }

  const expiryCutoff = addDays(today, settings.expiryWarningDays);
  const [expiringCount, expiredCount] = await Promise.all([
    db.collection("inventory").countDocuments({ pharmacy_id: pharmacyId, available_quantity: { $gt: 0 }, expiry_date: { $gte: today, $lte: expiryCutoff } }),
    db.collection("inventory").countDocuments({ pharmacy_id: pharmacyId, available_quantity: { $gt: 0 }, expiry_date: { $lt: today, $regex: /^20\d{2}-/ } }),
  ]);

  return { settings, levels, counts: { ...counts, expiring: expiringCount, expired: expiredCount }, today, expiryCutoff };
}

// Names (lower-cased) of medicines in the given states
const namesIn = (levels, states) => [...levels.entries()].filter(([, e]) => states.includes(e.state)).map(([k]) => k);

// Mongo condition matching inventory rows of those medicines (case-insensitive name match)
function productNameMatch(keys) {
  if (!keys.length) return { _id: { $exists: false } }; // nothing matches
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Batched into one anchored alternation per 300 names to keep the regex small
  const ors = [];
  for (let i = 0; i < keys.length; i += 300) {
    ors.push({ product_name: { $regex: `^\\s*(?:${keys.slice(i, i + 300).map(esc).join("|")})\\s*$`, $options: "i" } });
  }
  return ors.length === 1 ? ors[0] : { $or: ors };
}

// Set (or clear with null) a medicine's own threshold. Clears thresholds typed
// on its purchase lines so one value decides.
async function setCustomThreshold(db, pharmacyId, { productId, productName }, value) {
  const v = value === null || value === "" || value === undefined ? null : Math.max(0, Math.round(Number(value)));
  if (v !== null && !Number.isFinite(v)) throw Object.assign(new Error("Threshold must be a number"), { status: 400 });
  const name = String(productName || "").trim();
  let product = productId ? await db.collection("products").findOne({ id: productId, pharmacy_id: pharmacyId }) : null;
  if (!product && name) {
    product = await db
      .collection("products")
      .findOne({ pharmacy_id: pharmacyId, $or: [{ name: { $regex: `^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" } }, { product_name: name }] });
  }
  const now = new Date().toISOString();
  if (product) {
    await db.collection("products").updateOne({ id: product.id, pharmacy_id: pharmacyId }, { $set: { custom_threshold: v, updated_at: now } });
  }
  const batchMatch = { pharmacy_id: pharmacyId, ...(product ? { $or: [{ product_id: product.id }, productNameMatch([keyOf(name || product.name)])] } : productNameMatch([keyOf(name)])) };
  // Without a product record (manual items) the batches carry the value
  await db.collection("inventory").updateMany(batchMatch, { $set: { shortage_threshold: product ? null : v } });
  return { custom_threshold: v, product_id: product?.id || null };
}

module.exports = { stockSettings, stockLevels, namesIn, productNameMatch, setCustomThreshold, keyOf, todayIst, addDays };
