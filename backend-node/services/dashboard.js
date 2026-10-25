// Dashboard metrics, computed with aggregations (never loading every bill).
//
// Dates: pharmacies work in IST, so "today" / "this month" are IST calendar
// days. Bills are bucketed by their business date `billing_date`
// (YYYY-MM-DD, what the pharmacist billed against), not the UTC created_at.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const istDate = (d = new Date()) => new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
const addDays = (ymd, n) => istDate(new Date(new Date(`${ymd}T00:00:00+05:30`).getTime() + n * DAY_MS));
const monthStart = (ymd) => `${ymd.slice(0, 8)}01`;
const prevMonthSameDay = (ymd) => {
  const [y, m, d] = ymd.split("-").map(Number);
  const pm = m === 1 ? 12 : m - 1;
  const py = m === 1 ? y - 1 : y;
  const lastDay = new Date(Date.UTC(py, pm, 0)).getUTCDate();
  return `${py}-${String(pm).padStart(2, "0")}-${String(Math.min(d, lastDay)).padStart(2, "0")}`;
};

// Real 20xx dates only (data has typos like "+20230-01-01" or "0027-08-12")
const VALID_DATE = /^20\d{2}-[01]\d/;
const billTotal = { $ifNull: ["$grand_total", { $ifNull: ["$total_amount", 0] }] };
const round2 = (n) => Math.round((n || 0) * 100) / 100;
const pct = (now, before) => (before > 0 ? round2(((now - before) / before) * 100) : null);

// Thresholds from the user's Settings (falling back to the registry defaults)
async function thresholds(db, userId) {
  const [registry, prefs] = await Promise.all([
    db.collection("settings_registry").find({ key: { $in: ["shortage_threshold", "expiry_warning_days", "expiry_critical_days"] } }).toArray(),
    db.collection("user_settings").findOne({ user_id: userId }, { projection: { preferences: 1 } }),
  ]);
  const get = (key, fallback) => {
    const v = prefs?.preferences?.[key];
    if (v !== undefined && v !== null && v !== "") return Number(v);
    const r = registry.find((s) => s.key === key);
    return r?.default !== undefined ? Number(r.default) : fallback;
  };
  return {
    lowStock: get("shortage_threshold", 10),
    expiryWarningDays: get("expiry_warning_days", 90),
    expiryCriticalDays: get("expiry_critical_days", 30),
  };
}

async function salesBetween(db, pharmacyId, from, to) {
  const r = await db
    .collection("bills")
    .aggregate([
      { $match: { pharmacy_id: pharmacyId, billing_date: { $gte: from, $lte: to } } },
      {
        $group: {
          _id: null,
          revenue: { $sum: billTotal },
          profit: { $sum: { $ifNull: ["$profit", 0] } },
          bills: { $sum: 1 },
          credit: { $sum: { $cond: [{ $eq: ["$is_paid", false] }, { $subtract: [billTotal, { $ifNull: ["$total_paid", 0] }] }, 0] } },
        },
      },
    ])
    .next();
  const revenue = round2(r?.revenue);
  return {
    revenue,
    profit: round2(r?.profit),
    bills: r?.bills || 0,
    avg_bill: r?.bills ? round2(revenue / r.bills) : 0,
    margin_pct: revenue > 0 ? round2(((r?.profit || 0) / revenue) * 100) : 0,
    credit: round2(Math.max(0, r?.credit || 0)),
  };
}

async function dailyTrend(db, pharmacyId, days, today) {
  const from = addDays(today, -(days - 1));
  const rows = await db
    .collection("bills")
    .aggregate([
      { $match: { pharmacy_id: pharmacyId, billing_date: { $gte: from, $lte: today } } },
      { $group: { _id: "$billing_date", revenue: { $sum: billTotal }, profit: { $sum: { $ifNull: ["$profit", 0] } }, bills: { $sum: 1 } } },
    ])
    .toArray();
  const by = new Map(rows.map((r) => [r._id, r]));
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(today, -i);
    const r = by.get(date);
    out.push({ date, revenue: round2(r?.revenue), profit: round2(r?.profit), bills: r?.bills || 0 });
  }
  return out;
}

// Bills per IST hour over the last 30 days (when is the counter busiest?)
async function busyHours(db, pharmacyId, today) {
  const since = new Date(new Date(`${addDays(today, -29)}T00:00:00+05:30`)).toISOString();
  const rows = await db
    .collection("bills")
    .aggregate([
      { $match: { pharmacy_id: pharmacyId, created_at: { $gte: since } } },
      { $group: { _id: { $hour: { date: { $toDate: "$created_at" }, timezone: "Asia/Kolkata" } }, bills: { $sum: 1 }, revenue: { $sum: billTotal } } },
    ])
    .toArray();
  const by = new Map(rows.map((r) => [r._id, r]));
  return Array.from({ length: 24 }, (_, h) => ({ hour: h, bills: by.get(h)?.bills || 0, revenue: round2(by.get(h)?.revenue) }));
}

async function paymentMix(db, pharmacyId, from, to) {
  const rows = await db
    .collection("bills")
    .aggregate([
      { $match: { pharmacy_id: pharmacyId, billing_date: { $gte: from, $lte: to } } },
      { $unwind: { path: "$payments", preserveNullAndEmptyArrays: false } },
      { $group: { _id: { $ifNull: ["$payments.payment_mode", "Other"] }, amount: { $sum: { $ifNull: ["$payments.amount", 0] } } } },
    ])
    .toArray();
  const outstanding = await db
    .collection("bills")
    .aggregate([
      { $match: { pharmacy_id: pharmacyId, billing_date: { $gte: from, $lte: to }, is_paid: false } },
      { $group: { _id: null, due: { $sum: { $subtract: [billTotal, { $ifNull: ["$total_paid", 0] }] } } } },
    ])
    .next();
  const modes = rows
    .map((r) => ({ mode: String(r._id || "Other"), amount: round2(r.amount) }))
    .filter((r) => r.amount > 0)
    .sort((a, b) => b.amount - a.amount);
  const due = round2(Math.max(0, outstanding?.due || 0));
  if (due > 0) modes.push({ mode: "Credit (Udhar)", amount: due });
  return modes;
}

async function topProducts(db, pharmacyId, from, to, limit = 6) {
  const rows = await db
    .collection("bills")
    .aggregate([
      { $match: { pharmacy_id: pharmacyId, billing_date: { $gte: from, $lte: to } } },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.product_name",
          quantity: { $sum: { $ifNull: ["$items.quantity", 0] } },
          revenue: { $sum: { $ifNull: ["$items.item_total", { $multiply: [{ $ifNull: ["$items.quantity", 0] }, { $ifNull: ["$items.unit_price", 0] }] }] } },
          profit: { $sum: { $ifNull: ["$items.profit", 0] } },
          bills: { $sum: 1 },
        },
      },
      { $sort: { revenue: -1 } },
      { $limit: limit },
    ])
    .toArray();
  return rows.map((r) => ({ product_name: r._id || "Unnamed", quantity: r.quantity, revenue: round2(r.revenue), profit: round2(r.profit), bills: r.bills }));
}

async function inventoryHealth(db, pharmacyId, today, t) {
  const live = { pharmacy_id: pharmacyId, status: { $nin: ["Returned", "Expired & Returned"] } };
  const warnCut = addDays(today, t.expiryWarningDays);
  const critCut = addDays(today, t.expiryCriticalDays);

  const [stock, perProduct, expiring, expiringList, totalProducts, sold, expiredList] = await Promise.all([
    db
      .collection("inventory")
      .aggregate([
        { $match: { ...live, available_quantity: { $gt: 0 } } },
        {
          $group: {
            _id: null,
            batches: { $sum: 1 },
            medicines: { $addToSet: { $ifNull: ["$product_id", "$product_name"] } },
            cost_value: { $sum: { $multiply: ["$available_quantity", { $ifNull: ["$purchase_price", 0] }] } },
            mrp_value: { $sum: { $multiply: ["$available_quantity", { $ifNull: ["$mrp", 0] }] } },
          },
        },
        { $project: { batches: 1, medicines: { $size: "$medicines" }, cost_value: 1, mrp_value: 1 } },
      ])
      .next(),
    db
      .collection("inventory")
      .aggregate([
        { $match: live },
        {
          $group: {
            _id: { $ifNull: ["$product_id", "$product_name"] },
            name: { $first: "$product_name" },
            units: { $sum: { $max: [{ $ifNull: ["$available_quantity", 0] }, 0] } },
            units_per_pack: { $first: "$units_per_pack" },
            last_supplier_id: { $last: "$supplier_id" },
          },
        },
        { $match: { units: { $lte: t.lowStock } } },
        { $sort: { units: 1, name: 1 } },
      ])
      .toArray(),
    db
      .collection("inventory")
      .aggregate([
        { $match: { ...live, available_quantity: { $gt: 0 }, expiry_date: { $regex: VALID_DATE, $lte: warnCut } } },
        {
          $group: {
            _id: { $cond: [{ $lt: ["$expiry_date", today] }, "expired", { $cond: [{ $lte: ["$expiry_date", critCut] }, "critical", "warning"] }] },
            batches: { $sum: 1 },
            value: { $sum: { $multiply: ["$available_quantity", { $ifNull: ["$purchase_price", 0] }] } },
          },
        },
      ])
      .toArray(),
    db
      .collection("inventory")
      .find(
        { ...live, available_quantity: { $gt: 0 }, expiry_date: { $regex: VALID_DATE, $gte: today, $lte: warnCut } },
        { projection: { _id: 0, id: 1, product_name: 1, batch_no: 1, expiry_date: 1, available_quantity: 1, purchase_price: 1, supplier_id: 1 } }
      )
      .sort({ expiry_date: 1 })
      .limit(8)
      .toArray(),
    db.collection("products").countDocuments({ pharmacy_id: pharmacyId }),
    // Units sold per product in the last 30 days, to rank what to reorder first
    db
      .collection("bills")
      .aggregate([
        { $match: { pharmacy_id: pharmacyId, billing_date: { $gte: addDays(today, -29), $lte: today } } },
        { $unwind: "$items" },
        { $group: { _id: "$items.product_name", sold: { $sum: { $ifNull: ["$items.quantity", 0] } } } },
      ])
      .toArray(),
    // Expired but still on the shelf, biggest value first (what to return)
    db
      .collection("inventory")
      .aggregate([
        { $match: { ...live, available_quantity: { $gt: 0 }, expiry_date: { $regex: VALID_DATE, $lt: today } } },
        {
          $project: {
            _id: 0, id: 1, product_name: 1, batch_no: 1, expiry_date: 1, available_quantity: 1, supplier_id: 1,
            value: { $multiply: ["$available_quantity", { $ifNull: ["$purchase_price", 0] }] },
          },
        },
        { $sort: { value: -1 } },
        { $limit: 8 },
      ])
      .toArray(),
  ]);
  const soldBy = new Map(sold.map((r) => [r._id, r.sold]));

  const bucket = (k) => {
    const r = expiring.find((e) => e._id === k);
    return { batches: r?.batches || 0, value: round2(r?.value) };
  };
  const outOfStock = perProduct.filter((p) => p.units <= 0);
  const low = perProduct
    .filter((p) => p.units > 0)
    .map((p) => ({ ...p, sold_30d: soldBy.get(p.name) || 0 }))
    .sort((a, b) => b.sold_30d - a.sold_30d || a.units - b.units);
  return {
    medicines_in_stock: stock?.medicines || 0,
    batches_in_stock: stock?.batches || 0,
    catalog_products: totalProducts,
    stock_value: round2(stock?.cost_value),
    stock_mrp_value: round2(stock?.mrp_value),
    low_stock_count: low.length,
    out_of_stock_count: outOfStock.length,
    low_stock_selling_count: low.filter((p) => p.sold_30d > 0).length,
    low_stock: low.slice(0, 8).map((p) => ({ product_id: p._id, product_name: p.name, units: p.units, units_per_pack: p.units_per_pack || 1, sold_30d: p.sold_30d })),
    bad_expiry_dates: await db.collection("inventory").countDocuments({ ...live, available_quantity: { $gt: 0 }, expiry_date: { $exists: true, $nin: [null, ""], $not: VALID_DATE } }),
    expired: bucket("expired"),
    expiring_critical: bucket("critical"),
    expiring_warning: bucket("warning"),
    expiring_soon: expiringList.map((i) => ({
      ...i,
      days_left: Math.round((new Date(`${i.expiry_date.slice(0, 10)}T00:00:00+05:30`) - new Date(`${today}T00:00:00+05:30`)) / DAY_MS),
      value: round2((i.available_quantity || 0) * (i.purchase_price || 0)),
    })),
    expired_list: expiredList.map((i) => ({ ...i, value: round2(i.value) })),
    thresholds: t,
  };
}

// Customer credit (udhar) from unpaid bills: total - total_paid
async function receivables(db, pharmacyId, today) {
  const overdueBefore = addDays(today, -30);
  const remaining = { $max: [0, { $subtract: [billTotal, { $ifNull: ["$total_paid", { $ifNull: ["$amount_paid", 0] }] }] }] };
  const [sum, top] = await Promise.all([
    db
      .collection("bills")
      .aggregate([
        { $match: { pharmacy_id: pharmacyId, is_paid: false } },
        { $project: { remaining, overdue: { $lt: ["$billing_date", overdueBefore] } } },
        { $match: { remaining: { $gt: 0.009 } } },
        {
          $group: {
            _id: null,
            total: { $sum: "$remaining" },
            bills: { $sum: 1 },
            overdue: { $sum: { $cond: ["$overdue", "$remaining", 0] } },
            overdue_bills: { $sum: { $cond: ["$overdue", 1, 0] } },
          },
        },
      ])
      .next(),
    db
      .collection("bills")
      .aggregate([
        { $match: { pharmacy_id: pharmacyId, is_paid: false, customer_id: { $nin: [null, ""] } } },
        { $project: { customer_id: 1, customer_name: 1, customer_mobile: 1, billing_date: 1, remaining } },
        { $match: { remaining: { $gt: 0.009 } } },
        {
          $group: {
            _id: "$customer_id",
            name: { $first: "$customer_name" },
            mobile: { $first: "$customer_mobile" },
            total_debt: { $sum: "$remaining" },
            bills_count: { $sum: 1 },
            oldest: { $min: "$billing_date" },
          },
        },
        { $sort: { total_debt: -1 } },
        { $limit: 5 },
      ])
      .toArray(),
  ]);
  return {
    total: round2(sum?.total),
    bills: sum?.bills || 0,
    overdue: round2(sum?.overdue),
    overdue_bills: sum?.overdue_bills || 0,
    top: top.map((d) => ({
      id: d._id,
      name: d.name || "Unknown",
      mobile: d.mobile && d.mobile !== "0000000000" ? d.mobile : null,
      total_debt: round2(d.total_debt),
      bills_count: d.bills_count,
      oldest: d.oldest,
    })),
  };
}

// Supplier dues from unpaid / partial purchases
async function payables(db, pharmacyId, today) {
  const overdueBefore = addDays(today, -30);
  const rows = await db
    .collection("purchases")
    .aggregate([
      { $match: { pharmacy_id: pharmacyId, payment_status: { $in: ["Unpaid", "Partial", "Partially Paid"] }, supplier_id: { $nin: [null, ""] } } },
      {
        $project: {
          supplier_id: 1,
          supplier_name: 1,
          remaining: { $max: [0, { $subtract: [{ $ifNull: ["$total_amount", 0] }, { $ifNull: ["$amount_paid", 0] }] }] },
          overdue: { $lt: [{ $ifNull: ["$purchase_date", { $substr: ["$created_at", 0, 10] }] }, overdueBefore] },
        },
      },
      { $match: { remaining: { $gt: 0.009 } } },
      {
        $group: {
          _id: "$supplier_id",
          name: { $first: "$supplier_name" },
          total_debt: { $sum: "$remaining" },
          purchase_count: { $sum: 1 },
          overdue: { $sum: { $cond: ["$overdue", "$remaining", 0] } },
          overdue_count: { $sum: { $cond: ["$overdue", 1, 0] } },
        },
      },
      { $sort: { total_debt: -1 } },
    ])
    .toArray();
  return {
    total: round2(rows.reduce((s, r) => s + r.total_debt, 0)),
    purchases: rows.reduce((s, r) => s + r.purchase_count, 0),
    overdue: round2(rows.reduce((s, r) => s + r.overdue, 0)),
    overdue_purchases: rows.reduce((s, r) => s + r.overdue_count, 0),
    top: rows.slice(0, 5).map((r) => ({ id: r._id, name: r.name || "Unknown", total_debt: round2(r.total_debt), purchase_count: r.purchase_count, overdue: round2(r.overdue) })),
  };
}

async function purchasesBetween(db, pharmacyId, from, to) {
  const r = await db
    .collection("purchases")
    .aggregate([
      { $match: { pharmacy_id: pharmacyId, purchase_date: { $gte: from, $lte: to } } },
      { $group: { _id: null, amount: { $sum: { $ifNull: ["$total_amount", 0] } }, count: { $sum: 1 } } },
    ])
    .next();
  return { amount: round2(r?.amount), count: r?.count || 0 };
}

async function recentBills(db, pharmacyId) {
  return db
    .collection("bills")
    .find(
      { pharmacy_id: pharmacyId },
      { projection: { _id: 0, id: 1, bill_no: 1, customer_name: 1, grand_total: 1, total_amount: 1, is_paid: 1, created_at: 1, billing_date: 1, items: { $slice: 0 } } }
    )
    .sort({ created_at: -1 })
    .limit(6)
    .toArray()
    .then((rows) =>
      rows.map((b) => ({
        id: b.id,
        bill_no: b.bill_no,
        customer_name: b.customer_name || "Walk-in",
        amount: round2(b.grand_total || b.total_amount || 0),
        is_paid: b.is_paid !== false,
        created_at: b.created_at,
      }))
    );
}

async function overview(db, { pharmacyId, userId }) {
  const today = istDate();
  const yesterday = addDays(today, -1);
  const mStart = monthStart(today);
  const lastMonthToDate = prevMonthSameDay(today);
  const lastMonthStart = monthStart(lastMonthToDate);
  const t = await thresholds(db, userId);

  const [todayS, yesterdayS, monthS, lastMonthS, trend, hours, mix, top, inventory, recv, pay, purchasesMonth, newCustomers, customers, recent] =
    await Promise.all([
      salesBetween(db, pharmacyId, today, today),
      salesBetween(db, pharmacyId, yesterday, yesterday),
      salesBetween(db, pharmacyId, mStart, today),
      salesBetween(db, pharmacyId, lastMonthStart, lastMonthToDate),
      dailyTrend(db, pharmacyId, 30, today),
      busyHours(db, pharmacyId, today),
      paymentMix(db, pharmacyId, mStart, today),
      topProducts(db, pharmacyId, addDays(today, -29), today),
      inventoryHealth(db, pharmacyId, today, t),
      receivables(db, pharmacyId, today),
      payables(db, pharmacyId, today),
      purchasesBetween(db, pharmacyId, mStart, today),
      db.collection("customers").countDocuments({ pharmacy_id: pharmacyId, created_at: { $gte: new Date(`${mStart}T00:00:00+05:30`).toISOString() } }),
      db.collection("customers").countDocuments({ pharmacy_id: pharmacyId }),
      recentBills(db, pharmacyId),
    ]);

  return {
    as_of: new Date().toISOString(),
    today_date: today,
    timezone: "Asia/Kolkata",
    today: { ...todayS, vs_yesterday_pct: pct(todayS.revenue, yesterdayS.revenue), yesterday_revenue: yesterdayS.revenue },
    month: {
      ...monthS,
      from: mStart,
      vs_last_month_pct: pct(monthS.revenue, lastMonthS.revenue),
      profit_vs_last_month_pct: pct(monthS.profit, lastMonthS.profit),
      last_month_to_date_revenue: lastMonthS.revenue,
      purchases: purchasesMonth,
    },
    trend,
    busy_hours: hours,
    payment_mix: mix,
    top_products: top,
    inventory,
    receivables: recv,
    payables: pay,
    customers: { total: customers, new_this_month: newCustomers },
    recent_bills: recent,
  };
}

module.exports = { overview, istDate, addDays, monthStart, thresholds, salesBetween, dailyTrend, topProducts, receivables, payables };
