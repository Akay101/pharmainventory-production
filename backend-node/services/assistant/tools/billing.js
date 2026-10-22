// Billing agent tools
const { v4: uuidv4 } = require("uuid");
const { matchForBilling } = require("../../ai/inventoryMatch");
const S = require("./shared");
const L = require("./lookup");

const { blocks, cols, inr, fmtDate, dateRange, textMatch, clampLimit, round2, say } = S;

const DATE_PROPS = {
  date_from: { type: "string", description: "Start date YYYY-MM-DD (inclusive)" },
  date_to: { type: "string", description: "End date YYYY-MM-DD (inclusive)" },
};

const billTotal = { $ifNull: ["$grand_total", "$total_amount"] };
const billPaid = { $ifNull: ["$total_paid", { $cond: ["$is_paid", billTotal, 0] }] };

function billFilter(ctx, a) {
  const q = { pharmacy_id: ctx.pharmacyId, ...dateRange("billing_date", a.date_from, a.date_to) };
  const and = [];
  if (a.customer) and.push(textMatch(["customer_name", "customer_mobile"], a.customer));
  if (a.product) and.push(textMatch(["items.product_name"], a.product));
  if (a.doctor) and.push(textMatch(["doctor"], a.doctor));
  if (a.bill_no) q.bill_no = { $regex: S.escapeRegex(a.bill_no), $options: "i" };
  if (a.payment === "unpaid") q.is_paid = { $ne: true };
  if (a.payment === "paid") q.is_paid = true;
  if (a.payment_mode) q.payment_mode = a.payment_mode;
  if (a.min_amount || a.max_amount) {
    const r = {};
    if (a.min_amount) r.$gte = Number(a.min_amount);
    if (a.max_amount) r.$lte = Number(a.max_amount);
    and.push({ $or: [{ grand_total: r }, { grand_total: { $exists: false }, total_amount: r }] });
  }
  const clean = and.filter((x) => Object.keys(x).length);
  if (clean.length) q.$and = clean;
  return q;
}

async function findBill(ctx, { bill_id, bill_no }) {
  const col = ctx.db.collection("bills");
  if (bill_id) return col.findOne({ pharmacy_id: ctx.pharmacyId, id: bill_id }, { projection: { _id: 0 } });
  if (bill_no) {
    return col.findOne(
      { pharmacy_id: ctx.pharmacyId, bill_no: { $regex: `${S.escapeRegex(bill_no.replace(/^bill-?/i, ""))}$`, $options: "i" } },
      { projection: { _id: 0 }, sort: { created_at: -1 } }
    );
  }
  return null;
}

const tools = [
  {
    name: "search_bills",
    description: "Find sales bills with any filters, sorted as asked: by date range, customer, medicine sold, doctor, paid/unpaid, payment mode, amount. Shows a table.",
    parameters: {
      type: "object",
      properties: {
        ...DATE_PROPS,
        customer: { type: "string", description: "Customer name or mobile" },
        product: { type: "string", description: "Medicine sold in the bill" },
        doctor: { type: "string" },
        bill_no: { type: "string" },
        payment: { type: "string", enum: ["paid", "unpaid"] },
        payment_mode: { type: "string", enum: ["Cash", "UPI", "Card"] },
        min_amount: { type: "number" },
        max_amount: { type: "number" },
        sort_by: { type: "string", enum: ["date", "amount"] },
        sort_order: { type: "string", enum: ["desc", "asc"] },
        limit: { type: "integer" },
      },
    },
    status: (a, lang) => say(lang, { en: `Searching bills${a.customer ? ` for ${a.customer}` : ""}`, hinglish: `Bills dhoondh raha hoon${a.customer ? ` (${a.customer})` : ""}`, hi: "बिल खोज रहा हूँ" }),
    async run(a, ctx) {
      const q = billFilter(ctx, a);
      const sort = a.sort_by === "amount" ? { grand_total: a.sort_order === "asc" ? 1 : -1 } : { billing_date: a.sort_order === "asc" ? 1 : -1, created_at: -1 };
      const col = ctx.db.collection("bills");
      const [rows, agg] = await Promise.all([
        col.find(q, { projection: { _id: 0, id: 1, bill_no: 1, billing_date: 1, customer_name: 1, grand_total: 1, total_amount: 1, total_paid: 1, is_paid: 1, items: 1, payment_mode: 1 } }).sort(sort).limit(clampLimit(a.limit)).toArray(),
        col.aggregate([{ $match: q }, { $group: { _id: null, n: { $sum: 1 }, total: { $sum: billTotal }, paid: { $sum: billPaid }, profit: { $sum: { $ifNull: ["$profit", 0] } } } }]).next(),
      ]);
      const table = rows.map((b) => {
        const total = b.grand_total ?? b.total_amount ?? 0;
        const paid = b.total_paid ?? (b.is_paid ? total : 0);
        return {
          id: b.id,
          bill_no: b.bill_no,
          date: fmtDate(b.billing_date),
          customer: b.customer_name || "Walk-in",
          items: (b.items || []).map((i) => `${i.product_name} × ${i.quantity}`).join(", ").slice(0, 120),
          amount: round2(total),
          due: round2(Math.max(0, total - paid)),
          status: total - paid > 0.01 ? (paid > 0 ? "Partial" : "Unpaid") : "Paid",
        };
      });
      if (table.length) {
        ctx.emit(
          blocks.table(
            `Bills${a.customer ? ` · ${a.customer}` : ""}${a.product ? ` · ${a.product}` : ""}`,
            cols(["bill_no", "Bill"], ["date", "Date"], ["customer", "Customer"], ["items", "Items"], ["amount", "Amount", "inr", "right"], ["due", "Due", "inr", "right"], ["status", "Status", "badge"]),
            table,
            { footer: `${agg?.n || 0} bill(s) · ${inr(agg?.total || 0)} sales · ${inr((agg?.total || 0) - (agg?.paid || 0))} due`, open: "/billing" }
          )
        );
      }
      return { total_matches: agg?.n || 0, sales: round2(agg?.total || 0), due: round2((agg?.total || 0) - (agg?.paid || 0)), profit: round2(agg?.profit || 0), rows: table.slice(0, 15), note: table.length ? "Table already shown; summarise." : "Nothing matched." };
    },
  },
  {
    name: "get_bill",
    description: "Full details of one bill by id or bill number.",
    parameters: { type: "object", properties: { bill_id: { type: "string" }, bill_no: { type: "string" } } },
    status: (a, lang) => say(lang, { en: "Opening the bill", hinglish: "Bill khol raha hoon", hi: "बिल खोल रहा हूँ" }),
    async run(a, ctx) {
      const b = await findBill(ctx, a);
      if (!b) return { error: "Bill not found" };
      const total = b.grand_total ?? b.total_amount ?? 0;
      ctx.emit(
        blocks.table(
          `${b.bill_no} · ${b.customer_name || "Walk-in"} · ${fmtDate(b.billing_date)}`,
          cols(["product", "Medicine"], ["batch", "Batch"], ["qty", "Qty", null, "right"], ["mrp", "MRP", "inr", "right"], ["disc", "Disc %", null, "right"], ["total", "Amount", "inr", "right"]),
          (b.items || []).map((i) => ({ product: i.product_name, batch: i.batch_no || "—", qty: i.quantity, mrp: i.unit_price, disc: i.discount_percent || 0, total: i.item_total })),
          {
            footer: `Total ${inr(total)} · Paid ${inr(b.total_paid ?? (b.is_paid ? total : 0))}${b.discount_percent ? ` · Bill discount ${b.discount_percent}%` : ""}`,
            actions: [{ label: "Bill PDF", action: { type: "op", op: "bill_pdf", bill_id: b.id } }],
          }
        )
      );
      return { id: b.id, bill_no: b.bill_no, customer: b.customer_name, date: b.billing_date, total: round2(total), paid: round2(b.total_paid ?? (b.is_paid ? total : 0)), profit: round2(b.profit || 0), items: (b.items || []).map((i) => ({ product: i.product_name, qty: i.quantity, amount: round2(i.item_total) })) };
    },
  },
  {
    name: "sales_report",
    description: "Quick sales totals (sales, profit, bills, dues) for a period as stat tiles. For any breakdown, trend, top-N or graph use build_report instead.",
    parameters: { type: "object", properties: { ...DATE_PROPS } },
    status: (a, lang) => say(lang, { en: "Crunching the sales numbers", hinglish: "Sale ka hisaab laga raha hoon", hi: "बिक्री का हिसाब लगा रहा हूँ" }),
    async run(a, ctx) {
      const match = { pharmacy_id: ctx.pharmacyId, ...dateRange("billing_date", a.date_from, a.date_to) };
      const totals = await ctx.db.collection("bills").aggregate([{ $match: match }, { $group: { _id: null, bills: { $sum: 1 }, revenue: { $sum: billTotal }, profit: { $sum: { $ifNull: ["$profit", 0] } }, paid: { $sum: billPaid } } }]).next();
      const t = { bills: totals?.bills || 0, revenue: round2(totals?.revenue || 0), profit: round2(totals?.profit || 0), due: round2((totals?.revenue || 0) - (totals?.paid || 0)) };
      ctx.emit(
        blocks.stats([
          { label: "Sales", value: inr(t.revenue) },
          { label: "Profit", value: inr(t.profit), hint: t.revenue ? `${Math.round((t.profit / t.revenue) * 100)}% margin` : "" },
          { label: "Bills", value: String(t.bills), hint: t.bills ? `Avg ${inr(t.revenue / t.bills)}` : "" },
          { label: "Due", value: inr(t.due) },
        ], `${a.date_from ? fmtDate(a.date_from) : "All time"}${a.date_to && a.date_to !== a.date_from ? ` – ${fmtDate(a.date_to)}` : ""}`)
      );
      return t;
    },
  },
  {
    name: "draft_bill",
    description:
      "Create or update a sales bill DRAFT (saved only when the user taps Save). Each medicine is matched to stock: batch if given, else the batch that expires first with stock. Quantities: units (tablets) unless unit='packs'. Reports stock problems.",
    parameters: {
      type: "object",
      properties: {
        draft_id: { type: "string" },
        customer_name: { type: "string" },
        customer_mobile: { type: "string" },
        doctor: { type: "string" },
        payment_mode: { type: "string", enum: ["Cash", "UPI", "Card", "Credit"], description: "Credit = unpaid" },
        bill_discount_percent: { type: "number" },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              product: { type: "string" },
              quantity: { type: "number" },
              unit: { type: "string", enum: ["units", "packs"], description: "default units" },
              batch_no: { type: "string" },
              inventory_id: { type: "string", description: "Exact batch when the user picked one" },
              discount_percent: { type: "number" },
              mrp_per_unit: { type: "number", description: "Only for items not in stock (e.g. read from a photo)" },
            },
            required: ["product"],
          },
        },
      },
    },
    status: (a, lang) => say(lang, { en: a.draft_id ? "Updating the bill" : "Preparing the bill", hinglish: a.draft_id ? "Bill update kar raha hoon" : "Bill bana raha hoon, stock check ho raha hai", hi: "बिल बना रहा हूँ" }),
    async run(a, ctx) {
      const prev = a.draft_id ? ctx.getDraft(a.draft_id) : null;
      const draft = {
        id: prev?.id || `bd_${uuidv4().slice(0, 8)}`,
        kind: "bill",
        created_at: prev?.created_at || new Date().toISOString(),
        customer: prev?.customer || { name: "Walk-in", mobile: "" },
        customer_options: [],
        doctor: a.doctor ?? prev?.doctor ?? "",
        payment_mode: a.payment_mode || prev?.payment_mode || "Cash",
        bill_discount_percent: a.bill_discount_percent ?? prev?.bill_discount_percent ?? 0,
        items: [],
      };
      if (a.customer_name || a.customer_mobile) {
        const r = await L.resolveCustomer(ctx, { name: a.customer_name, mobile: a.customer_mobile });
        draft.customer = r.customer
          ? { id: r.customer.id, name: r.customer.name, mobile: r.customer.mobile || "", debt: r.customer.total_debt || 0 }
          : { name: a.customer_name || "Walk-in", mobile: a.customer_mobile || "", is_new: !!a.customer_name };
        if (!r.customer) draft.customer_options = r.options;
      }

      const prevInputs = prev?.items?.map((i) => ({ ...i.input })) || [];
      const lines = a.items?.length
        ? a.items.map((it, idx) => {
            const same = prevInputs.find((p) => L.norm(p.product) === L.norm(it.product)) || (a.items.length === prevInputs.length ? prevInputs[idx] : null);
            const changes = Object.fromEntries(Object.entries(it).filter(([, v]) => v !== undefined && v !== null && v !== ""));
            return same ? { ...same, ...changes } : it;
          })
        : prevInputs;

      for (const it of lines) {
        const m = await matchForBilling(ctx.db, ctx.pharmacyId, { product_name: it.product, batch_no: it.batch_no || "" });
        let item = m.matched_item;
        if (it.inventory_id && item.available_batches?.length) {
          const b = item.available_batches.find((x) => x.id === it.inventory_id);
          if (b) item = { ...item, inventory_id: b.id, batch_no: b.batch_no, expiry_date: b.expiry_date, available_quantity: b.available_quantity, mrp: b.mrp || item.mrp, purchase_price: b.purchase_price, cgst: b.cgst, sgst: b.sgst };
        }
        const upp = item.units_per_pack || 1;
        const qty = Math.max(1, Math.round((Number(it.quantity) || 1) * (it.unit === "packs" ? upp : 1)));
        const disc = Number(it.discount_percent) || 0;
        draft.items.push({
          input: it,
          inventory_id: item.inventory_id || null,
          product_name: item.product_name,
          salt_composition: item.salt_composition || "",
          batch_no: item.batch_no || "",
          expiry_date: item.expiry_date || "",
          available: item.available_quantity || 0,
          batches: (item.available_batches || []).slice(0, 8).map((b) => ({ id: b.id, batch_no: b.batch_no, expiry_date: b.expiry_date, available: b.available_quantity })),
          units_per_pack: upp,
          quantity: qty,
          mrp: Number(item.mrp) || Number(it.mrp_per_unit) || 0,
          purchase_price: Number(item.purchase_price) || 0,
          cgst: item.cgst || 0,
          sgst: item.sgst || 0,
          discount_percent: disc,
          match_type: m.match_type,
          alternatives: m.alternatives,
          total: round2(qty * (Number(item.mrp) || Number(it.mrp_per_unit) || 0) * (1 - disc / 100)),
        });
      }

      const subtotal = draft.items.reduce((s, i) => s + i.total, 0);
      draft.total = round2(subtotal * (1 - (draft.bill_discount_percent || 0) / 100));
      draft.warnings = [];
      draft.items.forEach((i, idx) => {
        const n = `${idx + 1}. ${i.product_name}`;
        if (!i.inventory_id) draft.warnings.push(`${n}: not in stock, will be billed as negative stock`);
        else if (i.quantity > i.available) draft.warnings.push(`${n}: only ${i.available} units in batch ${i.batch_no}`);
        if (!i.mrp) draft.warnings.push(`${n}: MRP unknown`);
      });
      await ctx.saveDraft(draft);
      ctx.emit(billDraftBlock(draft));
      return {
        draft_id: draft.id,
        customer: draft.customer,
        customer_options: draft.customer_options.slice(0, 5),
        items: draft.items.map((i) => ({ product: i.product_name, batch: i.batch_no, expiry: i.expiry_date, quantity_units: i.quantity, units_per_pack: i.units_per_pack, in_stock: i.available, mrp_per_unit: i.mrp, total: i.total, match: i.match_type, other_batches: i.batches, alternatives: i.alternatives })),
        total: draft.total,
        warnings: draft.warnings,
        note: "Bill card with Save button is shown. Mention warnings briefly; for items not in stock you may suggest alternatives (inventory agent's find_alternatives is not available here, so just ask). Don't claim it's saved.",
      };
    },
  },
  {
    name: "record_bill_payment",
    description: "Ask to record a customer payment against a bill (shows a confirmation).",
    parameters: { type: "object", properties: { bill_id: { type: "string" }, bill_no: { type: "string" }, amount: { type: "number" }, payment_mode: { type: "string", enum: ["Cash", "UPI", "Card"] } }, required: ["amount"] },
    status: (a, lang) => say(lang, { en: "Preparing the payment", hinglish: "Payment ready kar raha hoon", hi: "भुगतान तैयार कर रहा हूँ" }),
    async run(a, ctx) {
      const b = await findBill(ctx, a);
      if (!b) return { error: "Bill not found" };
      const total = b.grand_total ?? b.total_amount ?? 0;
      const due = round2(total - (b.total_paid ?? (b.is_paid ? total : 0)));
      if (due <= 0) return { error: "This bill is already fully paid" };
      const amount = Math.min(a.amount, due);
      ctx.emit({
        type: "confirm",
        tone: "primary",
        title: `Receive ${inr(amount)} for ${b.bill_no}`,
        text: `${b.customer_name || "Walk-in"} · due ${inr(due)}`,
        actions: [
          { label: `Record ${inr(amount)} (${a.payment_mode || "Cash"})`, style: "primary", action: { type: "op", op: "bill_payment", bill_id: b.id, amount, payment_mode: a.payment_mode || "Cash" } },
          { label: "Cancel", style: "ghost", action: { type: "dismiss" } },
        ],
      });
      return { awaiting_confirmation: true, due };
    },
  },
  {
    name: "delete_bill",
    description: "Ask to delete a bill; stock is returned to inventory on confirmation.",
    parameters: { type: "object", properties: { bill_id: { type: "string" }, bill_no: { type: "string" } } },
    status: (a, lang) => say(lang, { en: "Preparing to delete the bill", hinglish: "Bill delete karne ki taiyari", hi: "बिल हटाने की तैयारी" }),
    async run(a, ctx) {
      const b = await findBill(ctx, a);
      if (!b) return { error: "Bill not found" };
      ctx.emit({
        type: "confirm",
        tone: "danger",
        title: `Delete bill ${b.bill_no}`,
        text: `${b.customer_name || "Walk-in"} · ${fmtDate(b.billing_date)} · ${inr(b.grand_total ?? b.total_amount)} · stock will be returned`,
        actions: [
          { label: "Delete & return stock", style: "danger", action: { type: "op", op: "delete_bill", bill_id: b.id } },
          { label: "Cancel", style: "ghost", action: { type: "dismiss" } },
        ],
      });
      return { awaiting_confirmation: true };
    },
  },
  {
    name: "bill_pdf",
    description: "Get a printable PDF of a bill (link).",
    parameters: { type: "object", properties: { bill_id: { type: "string" }, bill_no: { type: "string" } } },
    status: (a, lang) => say(lang, { en: "Generating the bill PDF", hinglish: "Bill ki PDF bana raha hoon", hi: "बिल की PDF बना रहा हूँ" }),
    async run(a, ctx) {
      const b = await findBill(ctx, a);
      if (!b) return { error: "Bill not found" };
      const r = await ops.bill_pdf({ bill_id: b.id }, ctx);
      ctx.emit(r.block);
      return r.summary;
    },
  },
];

function billDraftBlock(d) {
  return {
    type: "draft",
    kind: "bill",
    draft_id: d.id,
    title: "Bill draft",
    fields: [
      { label: "Customer", value: `${d.customer.name}${d.customer.mobile ? ` · ${d.customer.mobile}` : ""}${d.customer.is_new ? " (new)" : ""}` },
      ...(d.doctor ? [{ label: "Doctor", value: d.doctor }] : []),
      { label: "Payment", value: d.payment_mode },
      ...(d.bill_discount_percent ? [{ label: "Bill discount", value: `${d.bill_discount_percent}%` }] : []),
    ],
    columns: cols(["product", "Medicine"], ["batch", "Batch"], ["qty", "Qty", null, "right"], ["stock", "In stock", null, "right"], ["mrp", "MRP", "inr", "right"], ["total", "Amount", "inr", "right"]),
    rows: d.items.map((i) => ({
      product: i.product_name,
      batch: i.batch_no || "—",
      qty: i.units_per_pack > 1 && i.quantity % i.units_per_pack === 0 ? `${i.quantity / i.units_per_pack} pack (${i.quantity})` : i.quantity,
      stock: i.inventory_id ? i.available : "—",
      mrp: i.mrp,
      total: i.total,
    })),
    totals: [{ label: "Total", value: d.total }],
    missing: d.warnings,
    actions: [
      { label: "Save bill", style: "primary", action: { type: "commit", draft_id: d.id }, disabled: !d.items.length },
      { label: "Discard", style: "ghost", action: { type: "discard", draft_id: d.id } },
    ],
  };
}

async function commitBill(draft, ctx) {
  const credit = draft.payment_mode === "Credit";
  const res = await S.api(ctx, "POST", "/bills", {
    customer_id: draft.customer.id || null,
    customer_name: draft.customer.name || "Walk-in",
    customer_mobile: draft.customer.mobile || null,
    doctor: draft.doctor || null,
    billing_date: S.todayIst(),
    discount_percent: draft.bill_discount_percent || 0,
    is_paid: !credit,
    payment_mode: credit ? null : draft.payment_mode,
    items: draft.items.map((i) => ({
      inventory_id: i.inventory_id,
      product_name: i.product_name,
      batch_no: i.batch_no,
      expiry_date: i.expiry_date || null,
      quantity: i.quantity,
      unit_price: i.mrp,
      purchase_price: i.purchase_price,
      discount_percent: i.discount_percent,
      cgst: i.cgst,
      sgst: i.sgst,
      units_per_pack: i.units_per_pack,
    })),
  });
  const b = res.bill;
  return {
    block: {
      type: "result",
      tone: "success",
      title: `Bill ${b.bill_no} saved`,
      text: `${b.customer_name} · ${inr(b.grand_total)} · ${credit ? "on credit" : `paid by ${draft.payment_mode}`}`,
      actions: [
        { label: "Bill PDF", action: { type: "op", op: "bill_pdf", bill_id: b.id } },
        { label: "Open billing", action: { type: "navigate", to: "/billing", state: { highlightId: b.id } } },
      ],
    },
    summary: { saved: "bill", id: b.id, bill_no: b.bill_no, total: b.grand_total, customer: b.customer_name },
  };
}

const ops = {
  async bill_payment(a, ctx) {
    const r = await S.api(ctx, "POST", `/bills/${a.bill_id}/record-payment`, { amount: a.amount, payment_mode: a.payment_mode });
    return { block: { type: "result", tone: "success", title: "Payment recorded", text: `${inr(a.amount)} · ${a.payment_mode}${r.is_paid ? " · bill fully paid" : ""}` }, summary: { recorded: "customer payment", amount: a.amount, fully_paid: r.is_paid } };
  },
  async delete_bill(a, ctx) {
    await S.api(ctx, "DELETE", `/bills/${a.bill_id}?restore_inventory=true`);
    return { block: { type: "result", tone: "success", title: "Bill deleted", text: "Stock returned to inventory" }, summary: { deleted: "bill" } };
  },
  async bill_pdf(a, ctx) {
    const r = await S.api(ctx, "POST", `/bills/${a.bill_id}/pdf`);
    return { block: { type: "result", tone: "info", title: "Bill PDF ready", actions: [{ label: "Open PDF", action: { type: "url", href: r.pdf_url } }] }, summary: { pdf_url: r.pdf_url } };
  },
};

module.exports = { tools, commitBill, ops };
