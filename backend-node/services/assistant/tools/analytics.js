// Live analytics for the assistant: one flexible report builder over sales,
// purchases and stock, plus a chart tool for numbers the agent already has.
// Results stream to the chat as chart blocks the UI renders on the spot.
const S = require("./shared");

const { round2, say, todayIst, addDays, isYmd, textMatch } = S;

const billTotal = { $ifNull: ["$grand_total", "$total_amount"] };
const billPaid = { $ifNull: ["$total_paid", { $cond: ["$is_paid", billTotal, 0] }] };

const METRICS = {
  sales: {
    revenue: { label: "Sales", format: "inr" },
    profit: { label: "Profit", format: "inr" },
    margin: { label: "Margin %", format: "percent" },
    bills: { label: "Bills", format: "number" },
    avg_bill: { label: "Avg bill", format: "inr" },
    units: { label: "Units sold", format: "number" },
    discount: { label: "Discount given", format: "inr" },
    dues: { label: "Unpaid", format: "inr" },
    customers: { label: "Customers", format: "number" },
  },
  purchases: {
    spend: { label: "Purchase spend", format: "inr" },
    purchases: { label: "Invoices", format: "number" },
    unpaid: { label: "Unpaid", format: "inr" },
    units: { label: "Units bought", format: "number" },
    packs: { label: "Packs", format: "number" },
  },
  stock: {
    stock_value: { label: "Stock value (cost)", format: "inr" },
    mrp_value: { label: "Stock value (MRP)", format: "inr" },
    units: { label: "Units in stock", format: "number" },
    batches: { label: "Batches", format: "number" },
  },
};
const GROUPS = {
  sales: ["none", "day", "week", "month", "weekday", "hour", "product", "customer", "payment_mode", "doctor"],
  purchases: ["none", "day", "week", "month", "weekday", "supplier", "product"],
  stock: ["product", "manufacturer", "expiry_month", "status"],
};
const TIME = new Set(["day", "week", "month", "weekday", "hour"]);
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const fmtDay = (ymd) => new Date(`${ymd}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
const fmtMonth = (ym) => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "short", year: "2-digit", timeZone: "UTC" });
const weekStart = (ymd) => {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
};
const weekdayOf = (ymd) => (new Date(`${ymd}T00:00:00Z`).getUTCDay() + 6) % 7;

// Raw rows keyed at the finest grain the dataset needs
async function rawSales(ctx, a, from, to) {
  const match = { pharmacy_id: ctx.pharmacyId, billing_date: { $gte: from, $lte: to } };
  const and = [];
  if (a.customer) and.push(textMatch(["customer_name", "customer_mobile"], a.customer));
  if (a.product) and.push(textMatch(["items.product_name"], a.product));
  if (a.payment_mode) match.payment_mode = a.payment_mode;
  if (and.length) match.$and = and.filter((x) => Object.keys(x).length);
  const col = ctx.db.collection("bills");
  const g = a.group_by;
  if (g === "product") {
    const itemMatch = a.product ? [{ $match: textMatch(["items.product_name"], a.product) }] : [];
    return col
      .aggregate([
        { $match: match },
        { $unwind: "$items" },
        ...itemMatch,
        {
          $group: {
            _id: "$items.product_name",
            revenue: { $sum: { $ifNull: ["$items.item_total", 0] } },
            profit: { $sum: { $ifNull: ["$items.profit", 0] } },
            units: { $sum: { $ifNull: ["$items.quantity", 0] } },
            billIds: { $addToSet: "$id" },
            customerIds: { $addToSet: "$customer_id" },
          },
        },
        { $project: { revenue: 1, profit: 1, units: 1, bills: { $size: "$billIds" }, customers: { $size: "$customerIds" } } },
      ])
      .toArray();
  }
  const key =
    g === "hour"
      ? { $hour: { date: { $toDate: "$created_at" }, timezone: "Asia/Kolkata" } }
      : TIME.has(g) || g === "none"
      ? "$billing_date"
      : g === "customer"
      ? { $ifNull: ["$customer_name", "Walk-in"] }
      : g === "payment_mode"
      ? { $cond: [{ $eq: ["$is_paid", false] }, "Credit", { $ifNull: ["$payment_mode", "Cash"] }] }
      : { $ifNull: [{ $cond: [{ $eq: ["$doctor", ""] }, null, "$doctor"] }, "No doctor"] };
  return col
    .aggregate([
      { $match: match },
      {
        $group: {
          _id: key,
          revenue: { $sum: billTotal },
          profit: { $sum: { $ifNull: ["$profit", 0] } },
          bills: { $sum: 1 },
          units: { $sum: { $sum: "$items.quantity" } },
          discount: { $sum: { $ifNull: ["$discount_amount", 0] } },
          dues: { $sum: { $max: [0, { $subtract: [billTotal, billPaid] }] } },
          customerIds: { $addToSet: "$customer_id" },
        },
      },
      { $project: { revenue: 1, profit: 1, bills: 1, units: 1, discount: 1, dues: 1, customers: { $size: "$customerIds" } } },
    ])
    .toArray();
}

async function rawPurchases(ctx, a, from, to) {
  const match = { pharmacy_id: ctx.pharmacyId, purchase_date: { $gte: from, $lte: to } };
  const and = [];
  if (a.supplier) and.push(textMatch(["supplier_name"], a.supplier));
  if (a.product) and.push(textMatch(["items.product_name"], a.product));
  if (and.length) match.$and = and.filter((x) => Object.keys(x).length);
  const col = ctx.db.collection("purchases");
  if (a.group_by === "product") {
    return col
      .aggregate([
        { $match: match },
        { $unwind: "$items" },
        ...(a.product ? [{ $match: textMatch(["items.product_name"], a.product) }] : []),
        { $group: { _id: "$items.product_name", spend: { $sum: "$items.item_total" }, units: { $sum: "$items.total_units" }, packs: { $sum: "$items.pack_quantity" }, ids: { $addToSet: "$id" } } },
        { $project: { spend: 1, units: 1, packs: 1, purchases: { $size: "$ids" } } },
      ])
      .toArray();
  }
  const key = a.group_by === "supplier" ? "$supplier_name" : "$purchase_date";
  return col
    .aggregate([
      { $match: match },
      {
        $group: {
          _id: key,
          spend: { $sum: "$total_amount" },
          purchases: { $sum: 1 },
          unpaid: { $sum: { $max: [0, { $subtract: ["$total_amount", { $ifNull: ["$amount_paid", 0] }] }] } },
          units: { $sum: { $sum: "$items.total_units" } },
          packs: { $sum: { $sum: "$items.pack_quantity" } },
        },
      },
    ])
    .toArray();
}

async function rawStock(ctx, a) {
  const today = todayIst();
  const match = { pharmacy_id: ctx.pharmacyId, available_quantity: { $gt: 0 } };
  if (a.product) Object.assign(match, textMatch(["product_name"], a.product));
  const key =
    a.group_by === "manufacturer"
      ? { $ifNull: ["$manufacturer", "Unknown"] }
      : a.group_by === "expiry_month"
      ? { $substr: [{ $ifNull: ["$expiry_date", "0000-00"] }, 0, 7] }
      : a.group_by === "status"
      ? {
          $switch: {
            branches: [
              { case: { $regexMatch: { input: { $ifNull: ["$status", ""] }, regex: /returned/i } }, then: "Returned" },
              { case: { $and: [{ $gte: ["$expiry_date", "2000"] }, { $lt: ["$expiry_date", today] }] }, then: "Expired" },
              { case: { $and: [{ $gte: ["$expiry_date", today] }, { $lte: ["$expiry_date", addDays(today, 90)] }] }, then: "Expiring in 90 days" },
            ],
            default: "Good",
          },
        }
      : "$product_name";
  return ctx.db
    .collection("inventory")
    .aggregate([
      { $match: match },
      {
        $group: {
          _id: key,
          stock_value: { $sum: { $multiply: ["$available_quantity", { $ifNull: ["$purchase_price", 0] }] } },
          mrp_value: { $sum: { $multiply: ["$available_quantity", { $ifNull: ["$mrp", 0] }] } },
          units: { $sum: "$available_quantity" },
          batches: { $sum: 1 },
        },
      },
    ])
    .toArray();
}

// Roll day rows up to the requested time grain and fill empty slots
function rollTime(rows, g, from, to, metricKeys) {
  const zero = () => Object.fromEntries(metricKeys.map((k) => [k, 0]));
  const add = (acc, r) => {
    for (const k of Object.keys(acc)) if (typeof r[k] === "number") acc[k] += r[k];
    return acc;
  };
  const buckets = new Map();
  const keyOf = (day) => (g === "day" ? day : g === "week" ? weekStart(day) : g === "month" ? day.slice(0, 7) : WEEKDAYS[weekdayOf(day)]);
  if (g === "weekday") WEEKDAYS.forEach((w) => buckets.set(w, zero()));
  else if (g === "hour") for (let h = 0; h < 24; h++) buckets.set(h, zero());
  else {
    let d = from;
    let guard = 0;
    while (d <= to && guard++ < 800) {
      const k = keyOf(d);
      if (!buckets.has(k)) buckets.set(k, zero());
      d = addDays(d, 1);
    }
  }
  for (const r of rows) {
    const k = g === "hour" ? r._id : keyOf(r._id);
    if (!buckets.has(k)) buckets.set(k, zero());
    add(buckets.get(k), r);
  }
  let out = [...buckets.entries()].map(([k, v]) => ({ _id: k, ...v }));
  if (g === "hour") out = out.filter((r) => r._id >= 7 && r._id <= 23); // shop hours
  return out;
}

const label = (g, k) =>
  g === "day" ? fmtDay(k) : g === "week" ? `Wk of ${fmtDay(k)}` : g === "month" ? fmtMonth(k) : g === "hour" ? `${k % 12 || 12}${k < 12 ? "am" : "pm"}` : g === "expiry_month" ? (k === "0000-00" ? "No expiry" : fmtMonth(k)) : String(k ?? "—");

function finalize(dataset, rows) {
  return rows.map((r) => {
    const o = { ...r };
    if (dataset === "sales") {
      o.avg_bill = o.bills ? o.revenue / o.bills : 0;
      o.margin = o.revenue ? (o.profit / o.revenue) * 100 : 0;
    }
    for (const k of Object.keys(o)) if (typeof o[k] === "number") o[k] = round2(o[k]);
    return o;
  });
}

function totalsOf(dataset, rows) {
  const t = {};
  for (const r of rows) for (const [k, v] of Object.entries(r)) if (typeof v === "number" && k !== "_id") t[k] = (t[k] || 0) + v;
  if (dataset === "sales") {
    t.avg_bill = t.bills ? t.revenue / t.bills : 0;
    t.margin = t.revenue ? (t.profit / t.revenue) * 100 : 0;
  }
  for (const k of Object.keys(t)) t[k] = round2(t[k]);
  return t;
}

function pickChart(g, metrics, rows, requested) {
  if (requested && requested !== "auto") return requested;
  if (TIME.has(g) && g !== "weekday" && g !== "hour") {
    const fmts = new Set(metrics.map((m) => m.format));
    return metrics.length > 1 && fmts.size > 1 ? "combo" : rows.length > 20 ? "area" : "line";
  }
  if (g === "weekday" || g === "hour") return "bar";
  if (["payment_mode", "status"].includes(g) && rows.length <= 6 && metrics.length === 1) return "donut";
  return "hbar";
}

const reportTool = {
  name: "build_report",
  description:
    "Build any analytical report and DRAW it as a chart in the chat: trends over time, comparisons, top-N, shares. Datasets: sales (bills), purchases, stock. Choose metrics and a grouping; optional filters, period comparison and chart type. Call it several times in one turn for a multi-chart report/dashboard. Use this for every 'graph/chart/trend/report/analysis/compare' request.",
  parameters: {
    type: "object",
    properties: {
      dataset: { type: "string", enum: ["sales", "purchases", "stock"] },
      metrics: {
        type: "array",
        items: { type: "string" },
        description:
          "sales: revenue, profit, margin, bills, avg_bill, units, discount, dues, customers | purchases: spend, purchases, unpaid, units, packs | stock: stock_value, mrp_value, units, batches. Up to 3.",
      },
      group_by: {
        type: "string",
        description: "sales: none, day, week, month, weekday, hour, product, customer, payment_mode, doctor | purchases: none, day, week, month, weekday, supplier, product | stock: product, manufacturer, expiry_month, status",
      },
      date_from: { type: "string", description: "YYYY-MM-DD (sales/purchases). Default: last 30 days" },
      date_to: { type: "string", description: "YYYY-MM-DD, default today" },
      product: { type: "string", description: "Filter to a medicine" },
      customer: { type: "string" },
      supplier: { type: "string" },
      payment_mode: { type: "string", enum: ["Cash", "UPI", "Card"] },
      top_n: { type: "integer", description: "For category groupings, keep the top N (default 10)" },
      sort: { type: "string", enum: ["desc", "asc"], description: "Category groupings: by first metric. asc = lowest first" },
      chart: { type: "string", enum: ["auto", "line", "area", "bar", "hbar", "stacked", "donut", "combo", "table"] },
      compare_previous: { type: "boolean", description: "Also compute the previous period of equal length for % change" },
      title: { type: "string", description: "Short chart title in the user's language" },
    },
    required: ["dataset", "metrics", "group_by"],
  },
  status: (a, lang) =>
    say(lang, {
      en: `Building the ${a.dataset} chart by ${String(a.group_by).replace("_", " ")}`,
      hinglish: `${a.dataset === "sales" ? "Sales" : a.dataset === "purchases" ? "Purchase" : "Stock"} ka ${String(a.group_by).replace("_", " ")} wise chart bana raha hoon`,
      hi: "चार्ट बना रहा हूँ",
    }),
  async run(a, ctx) {
    const dataset = METRICS[a.dataset] ? a.dataset : "sales";
    const g = GROUPS[dataset].includes(a.group_by) ? a.group_by : GROUPS[dataset][0];
    const metricKeys = (a.metrics || []).filter((m) => METRICS[dataset][m]).slice(0, 3);
    if (!metricKeys.length) metricKeys.push(Object.keys(METRICS[dataset])[0]);
    const today = todayIst();
    const to = isYmd(a.date_to) ? a.date_to : today;
    const from = isYmd(a.date_from) ? a.date_from : addDays(to, -29);
    if (from > to) return { error: "date_from is after date_to" };

    const raw = dataset === "sales" ? await rawSales(ctx, a, from, to) : dataset === "purchases" ? await rawPurchases(ctx, a, from, to) : await rawStock(ctx, a);
    const allKeys = Object.keys(METRICS[dataset]).filter((k) => !["margin", "avg_bill"].includes(k));
    let rows = TIME.has(g) ? rollTime(raw, g, from, to, allKeys) : raw;
    rows = finalize(dataset, rows);
    const totals = totalsOf(dataset, rows);

    if (g === "none") rows = [{ _id: "Total", ...totals }];
    let othersCount = 0;
    if (!TIME.has(g) && g !== "none") {
      const m = metricKeys[0];
      rows.sort((x, y) => (a.sort === "asc" ? x[m] - y[m] : y[m] - x[m]));
      const n = Math.max(1, Math.min(25, a.top_n || 10));
      othersCount = Math.max(0, rows.length - n);
      rows = rows.slice(0, n);
    }

    let delta = null;
    let prevSeriesRows = null;
    if (a.compare_previous && dataset !== "stock") {
      const days = Math.round((new Date(`${to}T00:00:00Z`) - new Date(`${from}T00:00:00Z`)) / 86400000) + 1;
      const pTo = addDays(from, -1);
      const pFrom = addDays(pTo, -(days - 1));
      const sameGrain = TIME.has(g) && !["weekday", "hour"].includes(g);
      const prevArgs = { ...a, group_by: sameGrain ? g : "none" };
      const prevRaw = dataset === "sales" ? await rawSales(ctx, prevArgs, pFrom, pTo) : await rawPurchases(ctx, prevArgs, pFrom, pTo);
      let prevRows = finalize(dataset, sameGrain ? rollTime(prevRaw, g, pFrom, pTo, allKeys) : prevRaw);
      // Day-by-day overlay of the previous period, aligned by position
      if (sameGrain) prevSeriesRows = prevRows;
      const prev = totalsOf(dataset, prevRows);
      delta = Object.fromEntries(metricKeys.map((k) => [k, prev[k] ? round2(((totals[k] - prev[k]) / Math.abs(prev[k])) * 100) : null]));
      delta._range = { from: pFrom, to: pTo, values: Object.fromEntries(metricKeys.map((k) => [k, prev[k] || 0])) };
    }

    const series = metricKeys.map((k, i) => ({ key: k, label: METRICS[dataset][k].label, format: METRICS[dataset][k].format, axis: i > 0 && METRICS[dataset][k].format !== METRICS[dataset][metricKeys[0]].format ? "right" : "left" }));
    const chartRows = rows.map((r) => ({ x: label(g, r._id), raw: r._id, ...Object.fromEntries(metricKeys.map((k) => [k, r[k] ?? 0])) }));
    let chart = pickChart(g, series, chartRows, a.chart);
    if (prevSeriesRows) {
      const m = metricKeys[0];
      chartRows.forEach((r, i) => (r[`prev_${m}`] = prevSeriesRows[i]?.[m] ?? 0));
      series.splice(1, 0, { key: `prev_${m}`, label: `${METRICS[dataset][m].label} (previous period)`, format: METRICS[dataset][m].format, axis: "left", dashed: true });
      if (chart === "combo" || chart === "bar") chart = "line";
    }
    const periodText = dataset === "stock" ? "Current stock" : `${fmtDay(from)} – ${fmtDay(to)}${from.slice(0, 4) !== to.slice(0, 4) ? ` ${to.slice(0, 4)}` : ""}`;
    const hasData = rows.some((r) => metricKeys.some((k) => r[k]));

    ctx.emit({
      type: "chart",
      chart,
      title: a.title || `${series.map((s) => s.label).join(" & ")}${g !== "none" ? ` by ${g.replace("_", " ")}` : ""}`,
      subtitle: periodText,
      x: { key: "x", kind: TIME.has(g) ? "time" : "category" },
      series,
      rows: chartRows,
      kpis: metricKeys.map((k) => ({ label: METRICS[dataset][k].label, value: totals[k] ?? 0, format: METRICS[dataset][k].format, delta_pct: delta ? delta[k] : null })),
      compare_label: delta ? `vs ${fmtDay(delta._range.from)} – ${fmtDay(delta._range.to)}` : null,
      footer: othersCount ? `Top ${rows.length} shown · ${othersCount} more not shown` : null,
      empty: !hasData,
    });

    return {
      period: dataset === "stock" ? "current" : { from, to },
      totals: Object.fromEntries(metricKeys.map((k) => [k, totals[k]])),
      change_vs_previous_pct: delta ? Object.fromEntries(metricKeys.map((k) => [k, delta[k]])) : undefined,
      previous_period: delta?._range,
      not_shown: othersCount || undefined,
      points: chartRows.slice(0, 40).map((r) => ({ x: r.x, ...Object.fromEntries(metricKeys.map((k) => [k, r[k]])) })),
      note: hasData ? "Chart is drawn for the user. Give 1-3 sharp insights (peak, trend, standout, change) instead of listing numbers." : "No data in this period; say so and suggest a wider period.",
    };
  },
};

// Chart from numbers the agent already got from tools this turn
const chartTool = {
  name: "show_chart",
  description:
    "Draw a custom chart from numbers you ALREADY received from tools in this conversation (never invented). Use when build_report can't express it, e.g. comparing two separately fetched figures.",
  parameters: {
    type: "object",
    properties: {
      title: { type: "string" },
      chart: { type: "string", enum: ["line", "area", "bar", "hbar", "stacked", "donut", "combo"] },
      x_label: { type: "string" },
      series: { type: "array", items: { type: "object", properties: { key: { type: "string" }, label: { type: "string" }, format: { type: "string", enum: ["inr", "number", "percent"] } }, required: ["key", "label"] } },
      rows: { type: "array", items: { type: "object", properties: { x: { type: "string" }, values: { type: "array", items: { type: "number" }, description: "One value per series, in series order" } }, required: ["x", "values"] } },
    },
    required: ["title", "chart", "series", "rows"],
  },
  status: (a, lang) => say(lang, { en: "Drawing the chart", hinglish: "Chart bana raha hoon", hi: "चार्ट बना रहा हूँ" }),
  async run(a, ctx) {
    const series = (a.series || []).slice(0, 4).map((s, i) => ({ key: `s${i}`, label: s.label, format: s.format || "number", axis: "left" }));
    if (!series.length || !a.rows?.length) return { error: "Need series and rows" };
    const rows = a.rows.slice(0, 60).map((r) => ({ x: String(r.x), ...Object.fromEntries(series.map((s, i) => [s.key, Number(r.values?.[i]) || 0])) }));
    ctx.emit({ type: "chart", chart: a.chart, title: a.title, subtitle: a.x_label || "", x: { key: "x", kind: "category" }, series, rows, kpis: [] });
    return { shown: true };
  },
};

module.exports = { reportTool, chartTool };
