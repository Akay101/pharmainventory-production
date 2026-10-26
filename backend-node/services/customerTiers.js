// Customer tiers, worked out from each customer's bills.
//
// A "visit" is a day the customer bought something (two bills on one day = 1).
//   PERMANENT  visits in the window >= permanent_min_visits (e.g. 4 in 90 days)
//   RUNNING    visits in the window >= running_min_visits (e.g. 2 in 90 days)
//   OCCASIONAL fewer visits than that
//   NEW        first visit within new_within_days and only one visit so far
//              (also customers with no bills yet)
//   INACTIVE   last visit more than inactive_after_days ago
// A pharmacy can change the numbers and give each tier a default discount.
// Any customer can be pinned to a tier (tier_override) and/or given their own
// discount (custom_discount); those win over the automatic values.

const TIERS = ["PERMANENT", "RUNNING", "OCCASIONAL", "NEW", "INACTIVE"];
const TIER_LABEL = { PERMANENT: "Permanent", RUNNING: "Running", OCCASIONAL: "Occasional", NEW: "New", INACTIVE: "Inactive" };

const DEFAULT_CONFIG = {
  window_days: 90,
  permanent_min_visits: 4,
  running_min_visits: 2,
  new_within_days: 30,
  inactive_after_days: 90,
  discounts: { PERMANENT: 0, RUNNING: 0, OCCASIONAL: 0, NEW: 0, INACTIVE: 0 },
  auto_apply_discount: true,
};

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const todayIst = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 864e5);

function normalizeConfig(raw = {}) {
  const c = { ...DEFAULT_CONFIG, ...raw, discounts: { ...DEFAULT_CONFIG.discounts, ...(raw.discounts || {}) } };
  const int = (v, lo, hi, d) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Math.round(Number(v)))) : d);
  c.window_days = int(c.window_days, 7, 730, DEFAULT_CONFIG.window_days);
  c.running_min_visits = int(c.running_min_visits, 1, 365, DEFAULT_CONFIG.running_min_visits);
  c.permanent_min_visits = Math.max(c.running_min_visits + 1, int(c.permanent_min_visits, 2, 365, DEFAULT_CONFIG.permanent_min_visits));
  c.new_within_days = int(c.new_within_days, 1, 365, DEFAULT_CONFIG.new_within_days);
  c.inactive_after_days = int(c.inactive_after_days, 7, 1095, DEFAULT_CONFIG.inactive_after_days);
  for (const t of TIERS) c.discounts[t] = Math.min(50, Math.max(0, round2(c.discounts[t])));
  c.auto_apply_discount = c.auto_apply_discount !== false;
  return c;
}

async function getConfig(db, pharmacyId) {
  const p = await db.collection("pharmacies").findOne({ id: pharmacyId }, { projection: { customer_tiers: 1 } });
  return normalizeConfig(p?.customer_tiers || {});
}

// Visit days, spend and discounts per customer (optionally only some customers)
async function billStats(db, pharmacyId, customerIds = null) {
  const match = { pharmacy_id: pharmacyId, customer_id: customerIds ? { $in: customerIds } : { $nin: [null, ""] } };
  const rows = await db
    .collection("bills")
    .aggregate([
      { $match: match },
      {
        $project: {
          customer_id: 1,
          day: { $substrBytes: [{ $ifNull: ["$billing_date", { $ifNull: ["$created_at", ""] }] }, 0, 10] },
          total: { $ifNull: ["$grand_total", { $ifNull: ["$total_amount", 0] }] },
          disc: {
            $add: [
              { $ifNull: ["$discount_amount", 0] },
              { $sum: { $map: { input: { $ifNull: ["$items", []] }, as: "i", in: { $ifNull: ["$$i.line_discount", 0] } } } },
            ],
          },
        },
      },
      { $group: { _id: { c: "$customer_id", d: "$day" }, total: { $sum: "$total" }, disc: { $sum: "$disc" }, bills: { $sum: 1 } } },
      {
        $group: {
          _id: "$_id.c",
          days: { $push: { d: "$_id.d", total: "$total" } },
          visits_total: { $sum: 1 },
          bills_total: { $sum: "$bills" },
          spend_total: { $sum: "$total" },
          discount_total: { $sum: "$disc" },
          first: { $min: "$_id.d" },
          last: { $max: "$_id.d" },
        },
      },
    ])
    .toArray();
  return new Map(rows.map((r) => [r._id, r]));
}

function tierFor(customer, stats, config, today = todayIst()) {
  const windowStart = new Date(`${today}T00:00:00Z`);
  windowStart.setUTCDate(windowStart.getUTCDate() - config.window_days);
  const ws = windowStart.toISOString().slice(0, 10);
  const inWindow = stats ? stats.days.filter((x) => x.d >= ws) : [];
  const s = {
    visits_window: inWindow.length,
    spend_window: round2(inWindow.reduce((a, x) => a + (x.total || 0), 0)),
    visits_total: stats?.visits_total || 0,
    bills_total: stats?.bills_total || 0,
    spend_total: round2(stats?.spend_total),
    discount_total: round2(stats?.discount_total),
    first_visit: stats?.first || null,
    last_visit: stats?.last || null,
    days_since_last: stats?.last ? Math.max(0, daysBetween(stats.last, today)) : null,
    // Typical gap between visits ("comes every N days")
    avg_gap_days: stats && stats.visits_total > 1 ? Math.round(daysBetween(stats.first, stats.last) / (stats.visits_total - 1)) : null,
    avg_bill: stats?.bills_total ? round2(stats.spend_total / stats.bills_total) : 0,
  };

  let auto;
  if (!stats || !stats.visits_total) auto = "NEW";
  else if (s.days_since_last > config.inactive_after_days) auto = "INACTIVE";
  else if (s.visits_total <= 1 && daysBetween(stats.first, today) <= config.new_within_days) auto = "NEW";
  else if (s.visits_window >= config.permanent_min_visits) auto = "PERMANENT";
  else if (s.visits_window >= config.running_min_visits) auto = "RUNNING";
  else auto = "OCCASIONAL";

  const pinned = TIERS.includes(customer?.tier_override) ? customer.tier_override : null;
  const tier = pinned || auto;
  const custom = customer?.custom_discount;
  const hasCustom = custom !== undefined && custom !== null && custom !== "" && Number.isFinite(Number(custom));
  return {
    tier,
    tier_label: TIER_LABEL[tier],
    auto_tier: auto,
    tier_source: pinned ? "manual" : "auto",
    discount_percent: hasCustom ? Math.min(50, Math.max(0, round2(custom))) : config.discounts[tier] || 0,
    discount_source: hasCustom ? "customer" : "tier",
    stats: s,
  };
}

// Customers with their tier attached; `ids` limits the work to those customers
async function withTiers(db, pharmacyId, customers, config = null) {
  const cfg = config || (await getConfig(db, pharmacyId));
  const ids = customers.map((c) => c.id).filter(Boolean);
  const stats = ids.length ? await billStats(db, pharmacyId, ids) : new Map();
  const today = todayIst();
  return customers.map((c) => ({ ...c, ...tierFor(c, stats.get(c.id), cfg, today), auto_apply_discount: cfg.auto_apply_discount }));
}

module.exports = { TIERS, TIER_LABEL, DEFAULT_CONFIG, normalizeConfig, getConfig, billStats, tierFor, withTiers, todayIst };
