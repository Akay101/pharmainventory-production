// Customer and supplier agent tools
const S = require("./shared");
const L = require("./lookup");
const { latinName } = require("./names");

const { blocks, cols, inr, fmtDate, textMatch, clampLimit, round2, say } = S;
const billTotal = { $ifNull: ["$grand_total", "$total_amount"] };

async function findCustomer(ctx, { customer_id, customer }) {
  const col = ctx.db.collection("customers");
  if (customer_id) return col.findOne({ pharmacy_id: ctx.pharmacyId, id: customer_id }, { projection: { _id: 0 } });
  const r = await L.resolveCustomer(ctx, { name: customer, mobile: /\d{10}/.test(customer || "") ? customer : undefined });
  return r.customer || (r.options.length === 1 ? await col.findOne({ pharmacy_id: ctx.pharmacyId, id: r.options[0].id }, { projection: { _id: 0 } }) : null) || { ambiguous: r.options };
}

async function findSupplier(ctx, { supplier_id, supplier }) {
  const col = ctx.db.collection("suppliers");
  if (supplier_id) return col.findOne({ pharmacy_id: ctx.pharmacyId, id: supplier_id }, { projection: { _id: 0 } });
  const rows = await col.find({ pharmacy_id: ctx.pharmacyId, ...textMatch(["name", "gst_no"], supplier) }, { projection: { _id: 0 } }).limit(6).toArray();
  const exact = rows.filter((r) => L.norm(r.name) === L.norm(supplier));
  if (exact.length === 1 || rows.length === 1) return exact[0] || rows[0];
  return { ambiguous: rows.map((r) => ({ id: r.id, name: r.name, city: r.city })) };
}

const customerTools = [
  {
    name: "search_customers",
    description: "Find customers by name/mobile, or list customers with dues (khata), sorted by due amount, recent visit or name.",
    parameters: {
      type: "object",
      properties: { query: { type: "string" }, has_dues: { type: "boolean" }, sort_by: { type: "string", enum: ["dues", "recent", "name"] }, limit: { type: "integer" } },
    },
    status: (a, lang) => say(lang, { en: a.has_dues ? "Listing customers with dues" : "Searching customers", hinglish: a.has_dues ? "Udhaar wale customers dekh raha hoon" : "Customers dhoondh raha hoon", hi: "ग्राहक खोज रहा हूँ" }),
    async run(a, ctx) {
      const q = { pharmacy_id: ctx.pharmacyId, ...(a.query ? textMatch(["name", "mobile"], a.query) : {}) };
      if (a.has_dues) q.total_debt = { $gt: 0 };
      const sort = a.sort_by === "dues" || a.has_dues ? { total_debt: -1 } : a.sort_by === "recent" ? { updated_at: -1, created_at: -1 } : { name: 1 };
      const col = ctx.db.collection("customers");
      const [rows, agg] = await Promise.all([
        col.find(q, { projection: { _id: 0, id: 1, name: 1, mobile: 1, total_debt: 1, total_advance: 1, created_at: 1 } }).sort(sort).limit(clampLimit(a.limit)).toArray(),
        col.aggregate([{ $match: q }, { $group: { _id: null, n: { $sum: 1 }, dues: { $sum: { $ifNull: ["$total_debt", 0] } } } }]).next(),
      ]);
      const table = rows.map((c) => ({ id: c.id, name: c.name, mobile: c.mobile || "—", dues: round2(c.total_debt || 0), advance: round2(c.total_advance || 0) }));
      if (table.length) ctx.emit(blocks.table(a.has_dues ? "Customers with dues" : "Customers", cols(["name", "Customer"], ["mobile", "Mobile"], ["dues", "Dues", "inr", "right"], ["advance", "Advance", "inr", "right"]), table, { footer: `${agg?.n || 0} customer(s) · ${inr(agg?.dues || 0)} total dues`, open: "/customers" }));
      return { total_matches: agg?.n || 0, total_dues: round2(agg?.dues || 0), rows: table.slice(0, 15) };
    },
  },
  {
    name: "customer_profile",
    description: "Everything about one customer: dues, total spend, visits, last visit, top medicines, recent bills.",
    parameters: { type: "object", properties: { customer: { type: "string", description: "Name or mobile" }, customer_id: { type: "string" } } },
    status: (a, lang) => say(lang, { en: `Opening ${a.customer || "customer"}'s profile`, hinglish: `${a.customer || "Customer"} ki profile khol raha hoon`, hi: "ग्राहक की जानकारी खोल रहा हूँ" }),
    async run(a, ctx) {
      const c = await findCustomer(ctx, a);
      if (!c) return { error: "Customer not found" };
      if (c.ambiguous) return { ambiguous: true, options: c.ambiguous, note: "Several customers match; ask which one (offer them as ::choices::)." };
      const bills = ctx.db.collection("bills");
      const [agg, top, recent] = await Promise.all([
        bills.aggregate([{ $match: { pharmacy_id: ctx.pharmacyId, customer_id: c.id } }, { $group: { _id: null, n: { $sum: 1 }, spend: { $sum: billTotal }, last: { $max: "$billing_date" }, first: { $min: "$billing_date" } } }]).next(),
        bills.aggregate([{ $match: { pharmacy_id: ctx.pharmacyId, customer_id: c.id } }, { $unwind: "$items" }, { $group: { _id: "$items.product_name", units: { $sum: "$items.quantity" }, times: { $sum: 1 } } }, { $sort: { times: -1 } }, { $limit: 5 }]).toArray(),
        bills.find({ pharmacy_id: ctx.pharmacyId, customer_id: c.id }, { projection: { _id: 0, bill_no: 1, billing_date: 1, grand_total: 1, total_amount: 1, total_paid: 1, is_paid: 1 } }).sort({ billing_date: -1, created_at: -1 }).limit(8).toArray(),
      ]);
      ctx.emit(
        blocks.stats([
          { label: "Dues", value: inr(c.total_debt || 0) },
          { label: "Total spend", value: inr(agg?.spend || 0), hint: `${agg?.n || 0} bills` },
          { label: "Last visit", value: agg?.last ? fmtDate(agg.last) : "—" },
          { label: "Customer since", value: agg?.first ? fmtDate(agg.first) : fmtDate(c.created_at) },
        ], `${c.name}${c.mobile ? ` · ${c.mobile}` : ""}`)
      );
      if (recent.length) {
        ctx.emit(blocks.table("Recent bills", cols(["bill_no", "Bill"], ["date", "Date"], ["amount", "Amount", "inr", "right"], ["status", "Status", "badge"]), recent.map((b) => {
          const t = b.grand_total ?? b.total_amount ?? 0;
          const due = t - (b.total_paid ?? (b.is_paid ? t : 0));
          return { bill_no: b.bill_no, date: fmtDate(b.billing_date), amount: round2(t), status: due > 0.01 ? "Unpaid" : "Paid" };
        })));
      }
      return { id: c.id, name: c.name, mobile: c.mobile, dues: round2(c.total_debt || 0), advance: round2(c.total_advance || 0), bills: agg?.n || 0, spend: round2(agg?.spend || 0), last_visit: agg?.last, top_medicines: top.map((t) => ({ name: t._id, times: t.times, units: t.units })) };
    },
  },
  {
    name: "save_customer",
    description: "Ask to create a new customer or update an existing one (name, mobile, email, address). Shows a confirmation card.",
    parameters: {
      type: "object",
      properties: { customer_id: { type: "string", description: "Set to update" }, name: { type: "string" }, mobile: { type: "string" }, email: { type: "string" }, address: { type: "string" } },
    },
    status: (a, lang) => say(lang, { en: "Preparing customer details", hinglish: "Customer details ready kar raha hoon", hi: "ग्राहक विवरण तैयार कर रहा हूँ" }),
    async run(a, ctx) {
      a.name = await latinName(a.name, "person");
      let existing = null;
      if (a.customer_id) existing = await ctx.db.collection("customers").findOne({ pharmacy_id: ctx.pharmacyId, id: a.customer_id }, { projection: { _id: 0 } });
      if (a.customer_id && !existing) return { error: "Customer not found" };
      if (!existing && !a.name) return { error: "Name is required for a new customer" };
      const data = { name: a.name ?? existing?.name, mobile: a.mobile ?? existing?.mobile ?? "", email: a.email ?? existing?.email ?? "", address: a.address ?? existing?.address ?? "" };
      ctx.emit({
        type: "confirm",
        tone: "primary",
        title: existing ? `Update ${existing.name}` : `Add customer ${data.name}`,
        fields: [
          { label: "Name", value: data.name },
          { label: "Mobile", value: data.mobile || "—" },
          { label: "Email", value: data.email || "—" },
          { label: "Address", value: data.address || "—" },
        ],
        actions: [
          { label: existing ? "Save changes" : "Add customer", style: "primary", action: { type: "op", op: "save_customer", customer_id: existing?.id || null, data } },
          { label: "Cancel", style: "ghost", action: { type: "dismiss" } },
        ],
      });
      return { awaiting_confirmation: true };
    },
  },
  {
    name: "settle_customer_dues",
    description: "Ask to mark ALL of a customer's unpaid bills as paid (clears their khata). Shows a confirmation.",
    parameters: { type: "object", properties: { customer: { type: "string" }, customer_id: { type: "string" } } },
    status: (a, lang) => say(lang, { en: "Checking the customer's dues", hinglish: "Customer ka udhaar check kar raha hoon", hi: "ग्राहक का बकाया देख रहा हूँ" }),
    async run(a, ctx) {
      const c = await findCustomer(ctx, a);
      if (!c || c.ambiguous) return c?.ambiguous ? { ambiguous: true, options: c.ambiguous } : { error: "Customer not found" };
      if (!(c.total_debt > 0)) return { error: `${c.name} has no dues` };
      ctx.emit({
        type: "confirm",
        tone: "primary",
        title: `Clear ${inr(c.total_debt)} dues of ${c.name}`,
        text: "All unpaid bills of this customer will be marked paid.",
        actions: [
          { label: `Mark ${inr(c.total_debt)} received`, style: "primary", action: { type: "op", op: "clear_customer_dues", customer_id: c.id } },
          { label: "Cancel", style: "ghost", action: { type: "dismiss" } },
        ],
      });
      return { awaiting_confirmation: true, dues: c.total_debt };
    },
  },
];

const supplierTools = [
  {
    name: "search_suppliers",
    description: "List/search the user's suppliers with how much is owed to each; optionally include the global distributor directory.",
    parameters: {
      type: "object",
      properties: { query: { type: "string" }, has_dues: { type: "boolean" }, include_global: { type: "boolean", description: "Also search the global distributor directory" }, limit: { type: "integer" } },
    },
    status: (a, lang) => say(lang, { en: a.has_dues ? "Checking supplier dues" : "Searching suppliers", hinglish: a.has_dues ? "Suppliers ka baaki payment dekh raha hoon" : "Suppliers dhoondh raha hoon", hi: "सप्लायर खोज रहा हूँ" }),
    async run(a, ctx) {
      const q = { pharmacy_id: ctx.pharmacyId, ...(a.query ? textMatch(["name", "gst_no", "city"], a.query) : {}) };
      const suppliers = await ctx.db.collection("suppliers").find(q, { projection: { _id: 0, id: 1, name: 1, city: 1, gst_no: 1, phone: 1, contact: 1 } }).limit(200).toArray();
      const dues = await ctx.db
        .collection("purchases")
        .aggregate([
          { $match: { pharmacy_id: ctx.pharmacyId, supplier_id: { $in: suppliers.map((s) => s.id) } } },
          { $group: { _id: "$supplier_id", total: { $sum: "$total_amount" }, paid: { $sum: { $ifNull: ["$amount_paid", 0] } }, last: { $max: "$purchase_date" }, n: { $sum: 1 } } },
        ])
        .toArray();
      const byId = Object.fromEntries(dues.map((d) => [d._id, d]));
      let rows = suppliers.map((s) => {
        const d = byId[s.id] || {};
        return { id: s.id, name: s.name, city: s.city || "", phone: s.phone || s.contact || "", purchases: d.n || 0, spend: round2(d.total || 0), due: round2((d.total || 0) - (d.paid || 0)), last: d.last ? fmtDate(d.last) : "—" };
      });
      if (a.has_dues) rows = rows.filter((r) => r.due > 0.01);
      rows.sort((x, y) => (a.has_dues ? y.due - x.due : y.spend - x.spend));
      const shown = rows.slice(0, clampLimit(a.limit, 20, 50));
      if (shown.length) ctx.emit(blocks.table(a.has_dues ? "Supplier dues" : "Your suppliers", cols(["name", "Supplier"], ["city", "City"], ["purchases", "Purchases", null, "right"], ["last", "Last"], ["spend", "Spend", "inr", "right"], ["due", "Due", "inr", "right"]), shown, { footer: `${rows.length} supplier(s) · ${inr(rows.reduce((s, r) => s + r.due, 0))} due`, open: "/suppliers" }));
      let global = [];
      if (a.include_global && a.query) {
        const r = await L.resolveSupplier(ctx, a.query);
        global = r.options.filter((o) => o.is_global);
        if (global.length) ctx.emit(blocks.table("Global distributors", cols(["name", "Distributor"], ["city", "City"], ["gst_no", "GSTIN"]), global));
      }
      return { total: rows.length, total_due: round2(rows.reduce((s, r) => s + r.due, 0)), rows: shown.slice(0, 15), global_distributors: global };
    },
  },
  {
    name: "supplier_profile",
    description: "One supplier: total purchases, dues, last purchase, top medicines bought from them, recent purchases.",
    parameters: { type: "object", properties: { supplier: { type: "string" }, supplier_id: { type: "string" } } },
    status: (a, lang) => say(lang, { en: `Opening ${a.supplier || "supplier"}`, hinglish: `${a.supplier || "Supplier"} ki details khol raha hoon`, hi: "सप्लायर की जानकारी खोल रहा हूँ" }),
    async run(a, ctx) {
      const s = await findSupplier(ctx, a);
      if (!s) return { error: "Supplier not found in your suppliers" };
      if (s.ambiguous) return { ambiguous: true, options: s.ambiguous };
      const col = ctx.db.collection("purchases");
      const match = { pharmacy_id: ctx.pharmacyId, supplier_id: s.id };
      const [agg, top, recent] = await Promise.all([
        col.aggregate([{ $match: match }, { $group: { _id: null, n: { $sum: 1 }, total: { $sum: "$total_amount" }, paid: { $sum: { $ifNull: ["$amount_paid", 0] } }, last: { $max: "$purchase_date" } } }]).next(),
        col.aggregate([{ $match: match }, { $unwind: "$items" }, { $group: { _id: "$items.product_name", spend: { $sum: "$items.item_total" }, packs: { $sum: "$items.pack_quantity" } } }, { $sort: { spend: -1 } }, { $limit: 6 }]).toArray(),
        col.find(match, { projection: { _id: 0, invoice_no: 1, purchase_date: 1, total_amount: 1, payment_status: 1 } }).sort({ purchase_date: -1 }).limit(6).toArray(),
      ]);
      ctx.emit(
        blocks.stats([
          { label: "Total purchases", value: inr(agg?.total || 0), hint: `${agg?.n || 0} invoices` },
          { label: "Due", value: inr((agg?.total || 0) - (agg?.paid || 0)) },
          { label: "Last purchase", value: agg?.last ? fmtDate(agg.last) : "—" },
          { label: "GSTIN", value: s.gst_no || "—" },
        ], `${s.name}${s.city ? ` · ${s.city}` : ""}`)
      );
      if (top.length) ctx.emit(blocks.table("Most bought from them", cols(["name", "Medicine"], ["packs", "Packs", null, "right"], ["spend", "Spend", "inr", "right"]), top.map((t) => ({ name: t._id, packs: t.packs, spend: round2(t.spend) }))));
      return { id: s.id, name: s.name, phone: s.phone || s.contact, gst_no: s.gst_no, purchases: agg?.n || 0, spend: round2(agg?.total || 0), due: round2((agg?.total || 0) - (agg?.paid || 0)), last_purchase: agg?.last, recent: recent.map((p) => ({ invoice: p.invoice_no, date: p.purchase_date, amount: round2(p.total_amount), status: p.payment_status })) };
    },
  },
  {
    name: "save_supplier",
    description: "Ask to add a supplier (or adopt a global distributor via its id) or update an existing one. Shows a confirmation card.",
    parameters: {
      type: "object",
      properties: { supplier_id: { type: "string", description: "Existing supplier to update" }, global_id: { type: "string", description: "Global distributor id (DST-...) to add" }, name: { type: "string" }, contact: { type: "string" }, email: { type: "string" }, address: { type: "string" }, gst_no: { type: "string" } },
    },
    status: (a, lang) => say(lang, { en: "Preparing supplier details", hinglish: "Supplier details ready kar raha hoon", hi: "सप्लायर विवरण तैयार कर रहा हूँ" }),
    async run(a, ctx) {
      a.name = await latinName(a.name, "supplier");
      const existing = a.supplier_id ? await ctx.db.collection("suppliers").findOne({ pharmacy_id: ctx.pharmacyId, id: a.supplier_id }, { projection: { _id: 0 } }) : null;
      if (!existing && !a.name && !a.global_id) return { error: "Supplier name is required" };
      const data = { name: a.name ?? existing?.name, contact: a.contact ?? existing?.contact ?? "", email: a.email ?? existing?.email ?? "", address: a.address ?? existing?.address ?? "", gst_no: a.gst_no ?? existing?.gst_no ?? "" };
      ctx.emit({
        type: "confirm",
        tone: "primary",
        title: existing ? `Update ${existing.name}` : `Add supplier ${data.name || a.global_id}`,
        fields: [
          { label: "Name", value: data.name || "—" },
          { label: "Contact", value: data.contact || "—" },
          { label: "GSTIN", value: data.gst_no || "—" },
          { label: "Address", value: data.address || "—" },
        ],
        actions: [
          { label: existing ? "Save changes" : "Add supplier", style: "primary", action: { type: "op", op: "save_supplier", supplier_id: existing?.id || null, global_id: a.global_id || null, data } },
          { label: "Cancel", style: "ghost", action: { type: "dismiss" } },
        ],
      });
      return { awaiting_confirmation: true };
    },
  },
  {
    name: "pay_supplier",
    description: "Ask to record a payment to a supplier against their oldest unpaid purchases (amount), or settle everything (all=true). Shows a confirmation.",
    parameters: { type: "object", properties: { supplier: { type: "string" }, supplier_id: { type: "string" }, amount: { type: "number" }, all: { type: "boolean" } } },
    status: (a, lang) => say(lang, { en: "Checking what's owed", hinglish: "Kitna baaki hai check kar raha hoon", hi: "बकाया देख रहा हूँ" }),
    async run(a, ctx) {
      const s = await findSupplier(ctx, a);
      if (!s || s.ambiguous) return s?.ambiguous ? { ambiguous: true, options: s.ambiguous } : { error: "Supplier not found" };
      const agg = await ctx.db.collection("purchases").aggregate([{ $match: { pharmacy_id: ctx.pharmacyId, supplier_id: s.id } }, { $group: { _id: null, total: { $sum: "$total_amount" }, paid: { $sum: { $ifNull: ["$amount_paid", 0] } } } }]).next();
      const due = round2((agg?.total || 0) - (agg?.paid || 0));
      if (due <= 0) return { error: `Nothing is due to ${s.name}` };
      const amount = a.all ? due : Math.min(Number(a.amount) || 0, due);
      if (!amount) return { error: "Amount needed", due };
      ctx.emit({
        type: "confirm",
        tone: "primary",
        title: `Pay ${inr(amount)} to ${s.name}`,
        text: `Total due ${inr(due)}${amount < due ? ` · ${inr(due - amount)} will remain` : ""}`,
        actions: [
          { label: `Record ${inr(amount)}`, style: "primary", action: { type: "op", op: "pay_supplier", supplier_id: s.id, amount, all: amount >= due } },
          { label: "Cancel", style: "ghost", action: { type: "dismiss" } },
        ],
      });
      return { awaiting_confirmation: true, due };
    },
  },
];

const ops = {
  async save_customer(a, ctx) {
    if (a.customer_id) await S.api(ctx, "PUT", `/customers/${a.customer_id}`, a.data);
    else await S.api(ctx, "POST", "/customers", a.data);
    return { block: { type: "result", tone: "success", title: a.customer_id ? "Customer updated" : "Customer added", text: a.data.name }, summary: { saved: "customer", name: a.data.name } };
  },
  async clear_customer_dues(a, ctx) {
    const r = await S.api(ctx, "POST", `/customers/${a.customer_id}/clear-debt`, {});
    return { block: { type: "result", tone: "success", title: "Dues cleared", text: r.message || "All unpaid bills marked paid" }, summary: { cleared: "customer dues" } };
  },
  async save_supplier(a, ctx) {
    if (a.supplier_id) await S.api(ctx, "PUT", `/suppliers/${a.supplier_id}`, a.data);
    else if (a.global_id) await S.api(ctx, "POST", "/suppliers/ensure-global", { global_id: a.global_id, ...a.data });
    else await S.api(ctx, "POST", "/suppliers", a.data);
    return { block: { type: "result", tone: "success", title: a.supplier_id ? "Supplier updated" : "Supplier added", text: a.data.name || a.global_id }, summary: { saved: "supplier", name: a.data.name } };
  },
  async pay_supplier(a, ctx) {
    if (a.all) await S.api(ctx, "POST", `/suppliers/${a.supplier_id}/pay-all`, {});
    else await S.api(ctx, "POST", `/suppliers/${a.supplier_id}/pay-part`, { amount: a.amount, notes: "Recorded via AI assistant" });
    return { block: { type: "result", tone: "success", title: "Supplier payment recorded", text: inr(a.amount) }, summary: { paid_supplier: a.amount } };
  },
};

module.exports = { customerTools, supplierTools, ops };
