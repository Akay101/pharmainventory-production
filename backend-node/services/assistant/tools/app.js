// Application agent + Medi expert tools
const S = require("./shared");
const L = require("./lookup");
const { overview } = require("../../dashboard");
const { pharmacyUpiQr } = require("../../../utils/upi");

const { blocks, cols, inr, say, textMatch } = S;

const PAGES = {
  dashboard: "/dashboard",
  inventory: "/inventory",
  purchases: "/purchases",
  billing: "/billing",
  suppliers: "/suppliers",
  customers: "/customers",
  expiry: "/expiry",
  returns: "/returns",
  users: "/users",
  reports: "/reports",
  settings: "/settings",
  scan_purchase: "/scan",
  scan_bill: "/scan-bill",
  upgrade: "/upgrade",
};

// Settings that the assistant must never flip on its own
const PROTECTED = new Set(["lock_unpaid_purchases", "lock_unpaid_bills"]);

const appTools = [
  {
    name: "business_overview",
    description: "Today's and this month's sales, profit, bills, purchases, receivables (customer dues), payables (supplier dues) and stock alerts. Use for 'aaj ka business kaisa hai', 'overall summary'.",
    parameters: { type: "object", properties: {} },
    status: (a, lang) => say(lang, { en: "Pulling your business numbers", hinglish: "Aapke business ke numbers nikaal raha hoon", hi: "व्यापार के आँकड़े निकाल रहा हूँ" }),
    async run(a, ctx) {
      const o = await overview(ctx.db, { pharmacyId: ctx.pharmacyId, userId: ctx.user.id });
      const inv = o.inventory || {};
      const k = {
        today_sales: o.today?.revenue || 0,
        today_bills: o.today?.bills || 0,
        today_vs_yesterday_pct: o.today?.vs_yesterday_pct,
        month_sales: o.month?.revenue || 0,
        month_profit: o.month?.profit || 0,
        month_margin_pct: o.month?.margin_pct || 0,
        month_vs_last_month_pct: o.month?.vs_last_month_pct,
        month_purchases: o.month?.purchases?.amount || 0,
        to_collect_from_customers: o.receivables?.total || 0,
        overdue_customer_dues: o.receivables?.overdue || 0,
        to_pay_suppliers: o.payables?.total || 0,
        stock_value: inv.stock_value || 0,
        low_stock: inv.low_stock_count || 0,
        out_of_stock: inv.out_of_stock_count || 0,
        expired_batches: inv.expired?.batches || 0,
        expiring_soon_batches: (inv.expiring_critical?.batches || 0) + (inv.expiring_warning?.batches || 0),
        top_products: (o.top_products || []).slice(0, 5).map((t) => t.product_name || t.name),
        new_customers_this_month: o.customers?.new_this_month || 0,
      };
      ctx.emit(
        blocks.stats([
          { label: "Today's sales", value: inr(k.today_sales), hint: `${k.today_bills} bills` },
          { label: "This month", value: inr(k.month_sales), hint: `Profit ${inr(k.month_profit)}` },
          { label: "To collect", value: inr(k.to_collect_from_customers) },
          { label: "To pay suppliers", value: inr(k.to_pay_suppliers) },
          { label: "Stock value", value: inr(k.stock_value), hint: `${k.low_stock} low · ${k.out_of_stock} out` },
          { label: "Expiry", value: `${k.expiring_soon_batches} soon`, hint: `${k.expired_batches} expired` },
        ], "Business overview")
      );
      return k;
    },
  },
  {
    name: "get_settings",
    description: "List the app settings with their current values (thresholds, default payment modes, expiry warning days, theme…).",
    parameters: { type: "object", properties: { search: { type: "string" } } },
    status: (a, lang) => say(lang, { en: "Reading your settings", hinglish: "Settings dekh raha hoon", hi: "सेटिंग्स देख रहा हूँ" }),
    async run(a, ctx) {
      const data = await S.api(ctx, "GET", "/settings");
      let rows = (data.settings || []).map((s) => ({ key: s.key, label: s.label, value: typeof s.value === "boolean" ? (s.value ? "On" : "Off") : String(s.value ?? "—"), type: s.type, options: s.options }));
      if (a.search) {
        const re = new RegExp(S.escapeRegex(a.search), "i");
        rows = rows.filter((r) => re.test(r.label) || re.test(r.key));
      }
      if (rows.length) ctx.emit(blocks.table("Settings", cols(["label", "Setting"], ["value", "Current value"]), rows.slice(0, 40), { open: "/settings" }));
      return { settings: rows.map(({ key, label, value, type, options }) => ({ key, label, value, type, options })) };
    },
  },
  {
    name: "change_setting",
    description: "Ask to change one setting (use get_settings to find the exact key and allowed values). Shows a confirmation card.",
    parameters: { type: "object", properties: { key: { type: "string" }, value: { type: "string", description: "New value; for on/off use 'true' or 'false'" } }, required: ["key", "value"] },
    status: (a, lang) => say(lang, { en: "Preparing the setting change", hinglish: "Setting change ready kar raha hoon", hi: "सेटिंग बदलने की तैयारी" }),
    async run(a, ctx) {
      if (PROTECTED.has(a.key)) return { error: "This setting needs OTP verification; ask the user to change it from the Settings page.", open: "/settings" };
      const data = await S.api(ctx, "GET", "/settings");
      const def = (data.settings || []).find((s) => s.key === a.key);
      if (!def) return { error: "Unknown setting key. Call get_settings first." };
      let value = a.value;
      if (def.type === "boolean") value = /^(true|on|yes|1|haan|ha)$/i.test(String(a.value));
      else if (def.type === "number") value = Number(a.value);
      ctx.emit({
        type: "confirm",
        tone: "primary",
        title: `Change "${def.label}"`,
        text: `${typeof def.value === "boolean" ? (def.value ? "On" : "Off") : def.value ?? "—"} → ${typeof value === "boolean" ? (value ? "On" : "Off") : value}`,
        actions: [
          { label: "Apply", style: "primary", action: { type: "op", op: "change_setting", key: a.key, value } },
          { label: "Cancel", style: "ghost", action: { type: "dismiss" } },
        ],
      });
      return { awaiting_confirmation: true };
    },
  },
  {
    name: "open_page",
    description: "Give the user a button to open a page of the app.",
    parameters: { type: "object", properties: { page: { type: "string", enum: Object.keys(PAGES) }, label: { type: "string" } }, required: ["page"] },
    status: () => "",
    async run(a, ctx) {
      const to = PAGES[a.page];
      if (!to) return { error: "Unknown page" };
      ctx.emit({ type: "result", tone: "info", title: a.label || `Open ${a.page.replace(/_/g, " ")}`, actions: [{ label: "Open", action: { type: "navigate", to } }] });
      return { shown: true };
    },
  },
];

// Shared by the billing and app agents: "250 ka QR do", "generate a QR for ₹250"
const upiQrTool = {
  name: "upi_payment_qr",
  description: "Show a scannable UPI payment QR for an amount, paid to the pharmacy's UPI ID (from Settings). Use for 'QR do / QR banao / payment QR for ₹250 / UPI se lena hai'. Optional note, e.g. a bill number.",
  parameters: {
    type: "object",
    properties: {
      amount: { type: "number", description: "Rupees, e.g. 250 or 199.50" },
      note: { type: "string", description: "Optional payment note shown in the payer's app, e.g. 'Bill 1024'" },
    },
    required: ["amount"],
  },
  status: (a, lang) => say(lang, { en: "Making the payment QR", hinglish: "Payment QR bana raha hoon", hi: "पेमेंट QR बना रहा हूँ" }),
  async run(a, ctx) {
    const pharmacy = await ctx.db.collection("pharmacies").findOne({ id: ctx.pharmacyId }, { projection: { _id: 0, name: 1, upi_id: 1 } });
    try {
      const q = await pharmacyUpiQr(pharmacy, { amount: a.amount, note: a.note });
      ctx.emit({ type: "qr", title: `Scan to pay ${inr(q.amount)}`, amount: q.amount, upi_id: q.upi_id, payee_name: q.payee_name, note: q.note, upi_uri: q.upi_uri, image: q.qr });
      return { shown: true, amount: q.amount, upi_id: q.upi_id, payee: q.payee_name };
    } catch (err) {
      if (err.code === "NO_UPI_ID" || err.code === "BAD_UPI_ID") {
        const admin = ctx.user.role === "ADMIN";
        ctx.emit({
          type: "result",
          tone: "info",
          title: err.code === "NO_UPI_ID" ? "No UPI ID set yet" : "UPI ID needs fixing",
          text: admin ? "Add your pharmacy's UPI ID in Settings → Pharmacy, then ask again." : "Ask the pharmacy admin to add the UPI ID in Settings.",
          actions: admin ? [{ label: "Open Settings", action: { type: "navigate", to: "/settings" } }] : [],
        });
        return { error: err.message, needs_upi_id: true };
      }
      if (err.code === "BAD_AMOUNT") return { error: err.message, ask_user_for_amount: true };
      throw err;
    }
  },
};

const mediTools = [
  {
    name: "medicine_facts",
    description: "Look up a medicine in the national medicine database: composition, manufacturer, pack size, MRP, dosage form. Use before answering questions about a specific brand.",
    parameters: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
    status: (a, lang) => say(lang, { en: `Looking up ${a.name}`, hinglish: `${a.name} ki jaankari dhoondh raha hoon`, hi: `${a.name} की जानकारी खोज रहा हूँ` }),
    async run(a) {
      const g = await L.globalMedicine(a.name);
      return g || { not_found: true };
    },
  },
  {
    name: "check_in_stock",
    description: "Check whether the pharmacy has these medicines (or this salt) in stock, with units.",
    parameters: { type: "object", properties: { names: { type: "array", items: { type: "string" } }, salt: { type: "string" } } },
    status: (a, lang) => say(lang, { en: "Checking your stock", hinglish: "Aapka stock check kar raha hoon", hi: "आपका स्टॉक देख रहा हूँ" }),
    async run(a, ctx) {
      const out = [];
      const queries = [...(a.names || []).map((n) => ({ label: n, match: textMatch(["product_name"], n) })), ...(a.salt ? [{ label: a.salt, match: textMatch(["salt_composition"], a.salt) }] : [])];
      for (const q of queries.slice(0, 8)) {
        const rows = await ctx.db
          .collection("inventory")
          .aggregate([
            { $match: { pharmacy_id: ctx.pharmacyId, status: { $not: /returned/i }, ...q.match } },
            { $group: { _id: "$product_name", units: { $sum: { $max: [0, { $ifNull: ["$available_quantity", 0] }] } }, mrp: { $max: "$mrp" } } },
            { $sort: { units: -1 } },
            { $limit: 5 },
          ])
          .toArray();
        out.push({ asked: q.label, found: rows.map((r) => ({ product: r._id, units: r.units, mrp_per_unit: r.mrp })) });
      }
      return { results: out };
    },
  },
];

const ops = {
  async change_setting(a, ctx) {
    await S.api(ctx, "POST", "/settings/update", { key: a.key, value: a.value });
    return { block: { type: "result", tone: "success", title: "Setting updated", text: `${a.key} → ${a.value}` }, summary: { changed_setting: a.key, value: a.value } };
  },
};

module.exports = { appTools, mediTools, upiQrTool, ops, PAGES };
