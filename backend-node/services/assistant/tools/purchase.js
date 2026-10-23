// Purchase agent tools
const { v4: uuidv4 } = require("uuid");
const { parseExpiry } = require("../../ai/extract");
const S = require("./shared");
const L = require("./lookup");
const { latinNames, hasDevanagari } = require("./names");
const { cleanProductName, medicineKey } = require("../../search/normalize");

const { blocks, cols, inr, fmtDate, dateRange, textMatch, clampLimit, round2, say } = S;

const purchaseFilter = (ctx, a) => {
  const q = { pharmacy_id: ctx.pharmacyId, ...dateRange("purchase_date", a.date_from, a.date_to) };
  const and = [];
  if (a.supplier) and.push(textMatch(["supplier_name"], a.supplier));
  if (a.product) and.push(textMatch(["items.product_name"], a.product));
  if (a.invoice_no) q.invoice_no = { $regex: S.escapeRegex(a.invoice_no), $options: "i" };
  if (a.payment_status) q.payment_status = a.payment_status;
  if (a.min_amount || a.max_amount) {
    q.total_amount = {};
    if (a.min_amount) q.total_amount.$gte = Number(a.min_amount);
    if (a.max_amount) q.total_amount.$lte = Number(a.max_amount);
  }
  const clean = and.filter((x) => Object.keys(x).length);
  if (clean.length) q.$and = clean;
  return q;
};

async function findPurchase(ctx, { purchase_id, invoice_no }) {
  const col = ctx.db.collection("purchases");
  if (purchase_id) return col.findOne({ pharmacy_id: ctx.pharmacyId, id: purchase_id }, { projection: { _id: 0 } });
  if (invoice_no) {
    const rows = await col
      .find({ pharmacy_id: ctx.pharmacyId, invoice_no: { $regex: `^${S.escapeRegex(invoice_no)}$`, $options: "i" } }, { projection: { _id: 0 } })
      .sort({ created_at: -1 })
      .limit(1)
      .toArray();
    return rows[0] || null;
  }
  return null;
}

const DATE_PROPS = {
  date_from: { type: "string", description: "Start date YYYY-MM-DD (inclusive)" },
  date_to: { type: "string", description: "End date YYYY-MM-DD (inclusive)" },
};

const tools = [
  {
    name: "search_purchases",
    description:
      "Find purchases with any combination of filters, sorted as asked. Use for: recent purchases, purchases from a supplier, purchases containing a medicine, unpaid purchases, most expensive purchases. Shows a table to the user.",
    parameters: {
      type: "object",
      properties: {
        ...DATE_PROPS,
        supplier: { type: "string", description: "Supplier name (partial ok)" },
        product: { type: "string", description: "Medicine contained in the purchase" },
        invoice_no: { type: "string" },
        payment_status: { type: "string", enum: ["Paid", "Unpaid", "Partial"] },
        min_amount: { type: "number" },
        max_amount: { type: "number" },
        sort_by: { type: "string", enum: ["date", "amount"], description: "default date" },
        sort_order: { type: "string", enum: ["desc", "asc"], description: "default desc" },
        limit: { type: "integer", description: "max rows, default 20, up to 50" },
      },
    },
    status: (a, lang) => say(lang, { en: `Searching purchases${a.supplier ? ` from ${a.supplier}` : ""}${a.product ? ` with ${a.product}` : ""}`, hinglish: `Purchases dhoondh raha hoon${a.supplier ? ` (${a.supplier})` : ""}`, hi: "खरीद खोज रहा हूँ" }),
    async run(a, ctx) {
      const q = purchaseFilter(ctx, a);
      const limit = clampLimit(a.limit);
      const sort = a.sort_by === "amount" ? { total_amount: a.sort_order === "asc" ? 1 : -1 } : { purchase_date: a.sort_order === "asc" ? 1 : -1, created_at: -1 };
      const col = ctx.db.collection("purchases");
      const [rows, agg] = await Promise.all([
        col.find(q, { projection: { _id: 0, id: 1, purchase_date: 1, supplier_name: 1, invoice_no: 1, total_amount: 1, amount_paid: 1, payment_status: 1, items: 1 } }).sort(sort).limit(limit).toArray(),
        col.aggregate([{ $match: q }, { $group: { _id: null, n: { $sum: 1 }, total: { $sum: "$total_amount" }, paid: { $sum: { $ifNull: ["$amount_paid", 0] } } } }]).next(),
      ]);
      const productRe = a.product ? new RegExp(S.tokenize(a.product).map(S.escapeRegex).join(".*"), "i") : null;
      const table = rows.map((p) => {
        const matched = productRe ? (p.items || []).filter((i) => productRe.test(i.product_name || "")) : [];
        return {
          id: p.id,
          date: fmtDate(p.purchase_date),
          supplier: p.supplier_name,
          invoice: p.invoice_no || "—",
          items: matched.length ? matched.map((i) => `${i.product_name} × ${i.pack_quantity}${i.scheme ? `+${i.scheme}` : ""} @ ${inr(i.pack_price)}`).join(", ") : `${(p.items || []).length} item(s)`,
          amount: round2(p.total_amount),
          status: p.payment_status || "Unpaid",
        };
      });
      if (table.length) {
        ctx.emit(
          blocks.table(
            `Purchases${a.supplier ? ` · ${a.supplier}` : ""}${a.product ? ` · ${a.product}` : ""}`,
            cols(["date", "Date"], ["supplier", "Supplier"], ["invoice", "Invoice"], ["items", "Items"], ["amount", "Amount", "inr", "right"], ["status", "Status", "badge"]),
            table,
            { footer: `${agg?.n || 0} purchase(s) · ${inr(agg?.total || 0)} total · ${inr((agg?.total || 0) - (agg?.paid || 0))} unpaid`, open: "/purchases" }
          )
        );
      }
      return {
        total_matches: agg?.n || 0,
        total_amount: round2(agg?.total || 0),
        unpaid_amount: round2((agg?.total || 0) - (agg?.paid || 0)),
        shown: table.length,
        rows: table.map(({ id, date, supplier, invoice, amount, status, items }) => ({ id, date, supplier, invoice, amount, status, items })),
        note: table.length ? "A table with these rows is already shown to the user; summarise, don't repeat every row." : "Nothing matched.",
      };
    },
  },
  {
    name: "get_purchase",
    description: "Full details of one purchase (all lines) by id or invoice number.",
    parameters: { type: "object", properties: { purchase_id: { type: "string" }, invoice_no: { type: "string" } } },
    status: (a, lang) => say(lang, { en: "Opening the purchase", hinglish: "Purchase khol raha hoon", hi: "खरीद खोल रहा हूँ" }),
    async run(a, ctx) {
      const p = await findPurchase(ctx, a);
      if (!p) return { error: "Purchase not found" };
      ctx.emit(
        blocks.table(
          `${p.supplier_name} · ${p.invoice_no || ""} · ${fmtDate(p.purchase_date)}`,
          cols(["product", "Medicine"], ["batch", "Batch"], ["expiry", "Exp"], ["qty", "Qty"], ["rate", "Rate/pack", "inr", "right"], ["mrp", "MRP/pack", "inr", "right"], ["gst", "GST %", null, "right"], ["total", "Total", "inr", "right"]),
          (p.items || []).map((i) => ({
            product: i.product_name,
            batch: i.batch_no || "—",
            expiry: S.fmtExpiry(i.expiry_date),
            qty: `${i.pack_quantity}${i.scheme ? `+${i.scheme} free` : ""} × ${i.units_per_pack}`,
            rate: i.pack_price,
            mrp: i.mrp_pack || (i.mrp_per_unit || 0) * (i.units_per_pack || 1),
            gst: (Number(i.cgst) || 0) + (Number(i.sgst) || 0),
            total: round2(i.item_total),
          })),
          { footer: `Total ${inr(p.total_amount)} · Paid ${inr(p.amount_paid || 0)} · ${p.payment_status || "Unpaid"}` }
        )
      );
      return {
        id: p.id,
        supplier: p.supplier_name,
        invoice_no: p.invoice_no,
        date: p.purchase_date,
        total: round2(p.total_amount),
        paid: round2(p.amount_paid || 0),
        status: p.payment_status,
        items: (p.items || []).map((i) => ({ product: i.product_name, batch: i.batch_no, packs: i.pack_quantity, free: i.scheme, units_per_pack: i.units_per_pack, rate_per_pack: i.pack_price, total: round2(i.item_total) })),
      };
    },
  },
  {
    name: "price_history",
    description: "Purchase price history of one medicine: dates, suppliers, rate per pack, MRP, discount. Use for 'kis rate pe li thi', 'cheapest supplier for X'.",
    parameters: { type: "object", properties: { product: { type: "string" }, limit: { type: "integer" } }, required: ["product"] },
    status: (a, lang) => say(lang, { en: `Checking price history of ${a.product}`, hinglish: `${a.product} ki price history dekh raha hoon`, hi: `${a.product} का मूल्य इतिहास देख रहा हूँ` }),
    async run(a, ctx) {
      const rows = await ctx.db
        .collection("purchases")
        .aggregate([
          { $match: { pharmacy_id: ctx.pharmacyId, ...textMatch(["items.product_name"], a.product) } },
          { $unwind: "$items" },
          { $match: textMatch(["items.product_name"], a.product) },
          { $sort: { purchase_date: -1 } },
          { $limit: clampLimit(a.limit, 15, 50) },
          { $project: { _id: 0, date: "$purchase_date", supplier: "$supplier_name", product: "$items.product_name", rate: "$items.pack_price", mrp: "$items.mrp_pack", discount: "$items.discount", packs: "$items.pack_quantity", units_per_pack: "$items.units_per_pack" } },
        ])
        .toArray();
      if (rows.length) {
        ctx.emit(
          blocks.table(
            `Price history · ${a.product}`,
            cols(["date", "Date"], ["supplier", "Supplier"], ["product", "Medicine"], ["packs", "Packs", null, "right"], ["rate", "Rate/pack", "inr", "right"], ["discount", "Disc %", null, "right"], ["mrp", "MRP/pack", "inr", "right"]),
            rows.map((r) => ({ ...r, date: fmtDate(r.date) }))
          )
        );
      }
      const rates = rows.map((r) => Number(r.rate) || 0).filter(Boolean);
      return { purchases: rows.length, lowest_rate: rates.length ? Math.min(...rates) : null, highest_rate: rates.length ? Math.max(...rates) : null, latest: rows[0] || null, rows: rows.slice(0, 10) };
    },
  },
  {
    name: "find_supplier",
    description: "Look up a supplier/distributor by name or GSTIN in the user's suppliers and the global distributor directory.",
    parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    status: (a, lang) => say(lang, { en: `Looking up supplier ${a.query}`, hinglish: `Supplier "${a.query}" dhoondh raha hoon`, hi: "सप्लायर खोज रहा हूँ" }),
    async run(a, ctx) {
      return L.resolveSupplier(ctx, a.query);
    },
  },
  {
    name: "draft_purchase",
    description:
      "Create or update a purchase DRAFT (nothing is saved until the user confirms with the Save button). Pass everything known; omit unknown fields. To change an existing draft pass its draft_id and the full updated item list. Each medicine is matched to the user's catalog first, then the global medicine database (which fills maker, composition, pack size); medicines found in neither, and unknown suppliers, are only added after the user agrees (confirm_new_item / confirm_new_supplier). Reports what's missing.",
    parameters: {
      type: "object",
      properties: {
        draft_id: { type: "string", description: "Existing draft to update" },
        supplier: { type: "string", description: "Supplier name in English/Latin letters (convert Hindi: नीलकंठ फार्मा -> Neelkanth Pharma)" },
        supplier_id: { type: "string", description: "Exact supplier id when the user picked one from options" },
        confirm_new_supplier: { type: "boolean", description: "true only after the user agreed to add this supplier as a NEW supplier (not found in their list or the distributor directory)" },
        invoice_no: { type: "string" },
        purchase_date: { type: "string", description: "YYYY-MM-DD, default today" },
        payment_status: { type: "string", enum: ["Paid", "Unpaid"] },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              product_name: { type: "string", description: "Medicine name in English as printed on the pack (convert Hindi: कालपोल 650 -> Calpol 650). Use the exact option name when the user picked one." },
              catalog_product_id: { type: "string", description: "When the user picked a catalog option" },
              confirm_new_item: { type: "boolean", description: "true only after the user agreed to add this medicine as a NEW catalog item (found in neither their catalog nor the medicine database)" },
              batch_no: { type: "string" },
              expiry: { type: "string", description: "As said: '08/27', 'Aug 2027' or YYYY-MM-DD" },
              packs: { type: "number", description: "Packs/strips bought (excluding free)" },
              free_packs: { type: "number" },
              units_per_pack: { type: "number" },
              rate_per_pack: { type: "number", description: "Purchase rate per pack (before GST)" },
              mrp_per_pack: { type: "number" },
              discount_percent: { type: "number" },
              gst_percent: { type: "number" },
            },
            required: ["product_name"],
          },
        },
      },
    },
    status: (a, lang) => say(lang, { en: a.draft_id ? "Updating the purchase draft" : "Preparing the purchase draft", hinglish: a.draft_id ? "Draft update kar raha hoon" : "Purchase ka draft bana raha hoon", hi: "खरीद का ड्राफ्ट बना रहा हूँ" }),
    async run(a, ctx) {
      const prev = a.draft_id ? ctx.getDraft(a.draft_id) : null;
      const draft = {
        id: prev?.id || `pd_${uuidv4().slice(0, 8)}`,
        kind: "purchase",
        created_at: prev?.created_at || new Date().toISOString(),
        invoice_no: a.invoice_no ?? prev?.invoice_no ?? "",
        purchase_date: S.isYmd(a.purchase_date) ? a.purchase_date : prev?.purchase_date || S.todayIst(),
        payment_status: a.payment_status || prev?.payment_status || "Unpaid",
        supplier: prev?.supplier || null,
        supplier_pending: prev?.supplier_pending || null, // said but not found yet
        supplier_options: prev?.supplier_options || [],
        items: [],
      };

      // Record names are English: convert anything said in Hindi script first
      const [supplierName] = await latinNames([a.supplier], "supplier", { signal: ctx.signal });
      const itemNames = await latinNames((a.items || []).map((it) => it.product_name), "medicine", { signal: ctx.signal });
      (a.items || []).forEach((it, i) => {
        if (itemNames[i] && itemNames[i] !== it.product_name) it.spoken_name = it.product_name;
        it.product_name = itemNames[i];
      });

      // Supplier: yours, then the distributor directory; a new one only when the user agrees
      const supplierText = supplierName || (a.confirm_new_supplier ? draft.supplier_pending : null);
      if (a.supplier_id) {
        const r = await L.resolveSupplier(ctx, supplierText || a.supplier_id);
        draft.supplier = r.options.find((o) => o.id === a.supplier_id) || { id: a.supplier_id, name: supplierText || a.supplier_id };
        draft.supplier_pending = null;
        draft.supplier_options = [];
      } else if (supplierText) {
        const r = await L.resolveSupplier(ctx, supplierText);
        if (r.supplier) {
          draft.supplier = r.supplier;
          draft.supplier_pending = null;
          draft.supplier_options = [];
        } else if (a.confirm_new_supplier) {
          draft.supplier = { id: null, name: supplierText.trim(), is_new: true };
          draft.supplier_pending = null;
          draft.supplier_options = [];
        } else {
          draft.supplier = null;
          draft.supplier_pending = supplierText.trim();
          draft.supplier_options = r.options;
        }
      }

      // Lines
      // Updates may carry only the changed fields: merge them into the
      // previous line with the same medicine (or the same position)
      const prevInputs = prev?.items?.map((i) => ({ ...i.input })) || [];
      const lines = a.items?.length
        ? a.items.map((it, idx) => {
            const same = prevInputs.find((p) => L.norm(p.product_name) === L.norm(it.product_name)) || (a.items.length === prevInputs.length ? prevInputs[idx] : null);
            const changes = Object.fromEntries(Object.entries(it).filter(([, v]) => v !== undefined && v !== null && v !== ""));
            return same ? { ...same, ...changes } : it;
          })
        : prevInputs;
      for (const it of lines) {
        const input = { ...it };
        let link = null;
        let options = [];
        if (it.catalog_product_id) {
          const p = await L.catalogProduct(ctx, it.catalog_product_id);
          link = p ? { product_id: p.id, product_name: p.name, via: "picked" } : null;
        }
        if (!link) {
          const r = await L.resolveCatalogProduct(ctx, it.product_name, it.batch_no);
          link = r.linked;
          options = link ? [] : r.options;
        }
        // Not in the catalog: the global medicine database, like a manual purchase
        const g = !link ? await L.globalCandidates(it.product_name) : { best: null, list: [] };
        // Picked by the user from the medicine database: take that entry
        if (!link && !g.best && it.global_pick) g.best = g.list.find((m) => m.name.toLowerCase() === String(it.product_name).toLowerCase()) || g.list[0] || null;
        let global = g.best;
        // The database name may be a medicine the catalog already has under another spelling
        if (!link && global) {
          const same = await L.sameMedicineInCatalog(ctx, global.name);
          if (same) {
            link = same;
            global = null;
          }
        }
        const source = link ? "catalog" : global ? "global" : it.confirm_new_item ? "new" : "not_found";
        const product = link ? await L.catalogProduct(ctx, link.product_id) : null;
        const last = link ? await L.lastPurchaseLine(ctx, link.product_id, link.product_name) : null;

        const units = Number(it.units_per_pack) || last?.units_per_pack || product?.units_per_pack || global?.units_per_pack || 1;
        const line = {
          input,
          product_name: link?.product_name || global?.name || cleanProductName(it.product_name) || it.product_name,
          product_id: link?.product_id || null,
          link_via: link?.via || null,
          catalog_options: options,
          medicine_options: source === "not_found" ? g.list.map((m) => ({ name: m.name, manufacturer: m.manufacturer, pack: m.pack_size })) : [],
          source,
          is_new_product: !link,
          manufacturer: product?.manufacturer || global?.manufacturer || "",
          salt_composition: product?.salt_composition || global?.salt_composition || "",
          pack_type: product?.pack_type || last?.pack_type || "Strip",
          batch_no: (it.batch_no || "").toUpperCase(),
          expiry_date: parseExpiry(it.expiry) || (S.isYmd(it.expiry) ? it.expiry : ""),
          packs: Number(it.packs) || 0,
          free_packs: Number(it.free_packs) || 0,
          units_per_pack: units,
          rate_per_pack: Number(it.rate_per_pack) || 0,
          mrp_per_pack: Number(it.mrp_per_pack) || 0,
          discount_percent: it.discount_percent ?? last?.discount_percent ?? 0,
          gst_percent: it.gst_percent ?? (last?.gst_percent || 5),
          last_purchase: last ? { date: last.date, supplier: last.supplier, rate_per_pack: last.rate_per_pack, mrp_per_pack: last.mrp_per_pack } : null,
        };
        line.total = round2(line.packs * line.rate_per_pack * (1 - line.discount_percent / 100) * (1 + line.gst_percent / 100));
        draft.items.push(line);
      }

      draft.total = round2(draft.items.reduce((s, i) => s + i.total, 0));
      draft.missing = [];
      if (!draft.supplier) {
        draft.missing.push(
          draft.supplier_pending
            ? `supplier: "${draft.supplier_pending}" not found${draft.supplier_options.length ? ", pick one of the matches" : ""} or confirm adding it as a new supplier`
            : "supplier"
        );
      }
      if (!draft.items.length) draft.missing.push("items");
      draft.items.forEach((i, idx) => {
        const n = `${idx + 1}. ${i.product_name}`;
        if (i.source === "not_found") {
          draft.missing.push(`${n}: not found in your catalog or the medicine database${i.medicine_options.length ? ", pick the right medicine" : ""} or confirm adding it as a new item`);
        }
        if (hasDevanagari(i.product_name)) draft.missing.push(`${n}: name must be in English`);
        if (!i.packs) draft.missing.push(`${n}: quantity`);
        if (!i.rate_per_pack) draft.missing.push(`${n}: rate`);
        if (!i.mrp_per_pack) draft.missing.push(`${n}: MRP`);
        if (!i.batch_no) draft.missing.push(`${n}: batch`);
        if (!i.expiry_date) draft.missing.push(`${n}: expiry`);
        if (i.mrp_per_pack && i.rate_per_pack && i.rate_per_pack > i.mrp_per_pack) draft.missing.push(`${n}: rate is higher than MRP, please check`);
      });
      await ctx.saveDraft(draft);
      ctx.emit(purchaseDraftBlock(draft));
      for (const b of purchasePickers(draft)) ctx.emit(b);

      return {
        draft_id: draft.id,
        supplier: draft.supplier,
        supplier_not_found: draft.supplier_pending,
        supplier_options: draft.supplier_options.slice(0, 5),
        items: draft.items.map((i) => ({
          product_name: i.product_name,
          source: i.source,
          linked_to_catalog: !i.is_new_product,
          catalog_options: i.catalog_options,
          medicine_options: i.medicine_options,
          batch_no: i.batch_no,
          expiry_date: i.expiry_date,
          packs: i.packs,
          free_packs: i.free_packs,
          units_per_pack: i.units_per_pack,
          rate_per_pack: i.rate_per_pack,
          mrp_per_pack: i.mrp_per_pack,
          gst_percent: i.gst_percent,
          discount_percent: i.discount_percent,
          last_purchase: i.last_purchase,
          total: i.total,
        })),
        total: draft.total,
        missing: draft.missing,
        note: "The draft card with Save/Cancel buttons is shown, plus a search picker card under it for every item with source not_found and for supplier_not_found (closest matches from the catalog / medicine database / distributors, a search box and 'Add as new'). Don't repeat those options as choices; just say in one line which ones need picking. In the SAME message ask for anything else missing (batch/expiry/rate/MRP for all lines together). source global = matched in the medicine database, fine to use. Do not claim it is saved.",
      };
    },
  },
  {
    name: "delete_purchase",
    description: "Ask to delete a purchase. Shows a confirmation card with its stock impact; deletion happens only when the user confirms.",
    parameters: { type: "object", properties: { purchase_id: { type: "string" }, invoice_no: { type: "string" } } },
    status: (a, lang) => say(lang, { en: "Checking stock impact of deleting", hinglish: "Delete karne se stock pe asar check kar raha hoon", hi: "स्टॉक पर असर देख रहा हूँ" }),
    async run(a, ctx) {
      const p = await findPurchase(ctx, a);
      if (!p) return { error: "Purchase not found" };
      const impact = await S.api(ctx, "GET", `/purchases/${p.id}/stock-impact`).catch(() => null);
      const sold = impact?.consumed;
      ctx.emit({
        type: "confirm",
        tone: "danger",
        title: `Delete purchase ${p.invoice_no || ""} · ${p.supplier_name}`,
        text: `${fmtDate(p.purchase_date)} · ${inr(p.total_amount)}${sold ? " · some of this stock is already sold" : ""}`,
        rows: (impact?.batches || []).map((b) => ({ product: b.product_name, batch: b.batch_no, purchased: b.purchased, sold: b.consumed, in_stock: b.on_hand })),
        columns: cols(["product", "Medicine"], ["batch", "Batch"], ["purchased", "Bought", null, "right"], ["sold", "Sold", null, "right"], ["in_stock", "In stock", null, "right"]),
        actions: sold
          ? [
              { label: "Delete & remove unsold stock", style: "danger", action: { type: "op", op: "delete_purchase", purchase_id: p.id, mode: "unsold" } },
              { label: "Delete, keep stock", style: "secondary", action: { type: "op", op: "delete_purchase", purchase_id: p.id, mode: "false" } },
              { label: "Cancel", style: "ghost", action: { type: "dismiss" } },
            ]
          : [
              { label: "Delete & remove stock", style: "danger", action: { type: "op", op: "delete_purchase", purchase_id: p.id, mode: "true" } },
              { label: "Cancel", style: "ghost", action: { type: "dismiss" } },
            ],
      });
      return { awaiting_confirmation: true, purchase: { invoice: p.invoice_no, supplier: p.supplier_name, total: p.total_amount }, stock_already_sold: !!sold };
    },
  },
  {
    name: "record_purchase_payment",
    description: "Ask to record a payment made to a supplier against a purchase. Shows a confirmation card.",
    parameters: {
      type: "object",
      properties: { purchase_id: { type: "string" }, invoice_no: { type: "string" }, amount: { type: "number" }, payment_mode: { type: "string", enum: ["Cash", "UPI", "Card", "Bank"] } },
      required: ["amount"],
    },
    status: (a, lang) => say(lang, { en: "Preparing the payment", hinglish: "Payment ready kar raha hoon", hi: "भुगतान तैयार कर रहा हूँ" }),
    async run(a, ctx) {
      const p = await findPurchase(ctx, a);
      if (!p) return { error: "Purchase not found" };
      const due = round2((p.total_amount || 0) - (p.amount_paid || 0));
      ctx.emit({
        type: "confirm",
        tone: "primary",
        title: `Pay ${inr(a.amount)} to ${p.supplier_name}`,
        text: `Invoice ${p.invoice_no || "—"} · due ${inr(due)} · ${a.payment_mode || "UPI"}`,
        actions: [
          { label: `Record ${inr(a.amount)}`, style: "primary", action: { type: "op", op: "purchase_payment", purchase_id: p.id, amount: a.amount, payment_mode: a.payment_mode || "UPI" } },
          { label: "Cancel", style: "ghost", action: { type: "dismiss" } },
        ],
      });
      return { awaiting_confirmation: true, due };
    },
  },
];

function purchaseDraftBlock(d) {
  return {
    type: "draft",
    kind: "purchase",
    draft_id: d.id,
    title: "Purchase draft",
    fields: [
      { label: "Supplier", value: d.supplier ? `${d.supplier.name}${d.supplier.is_new ? " (new)" : d.supplier.is_global ? " (distributor)" : ""}` : d.supplier_pending ? `${d.supplier_pending}? (not found)` : "—", missing: !d.supplier },
      { label: "Invoice", value: d.invoice_no || "Auto" },
      { label: "Date", value: fmtDate(d.purchase_date) },
      { label: "Payment", value: d.payment_status },
    ],
    columns: cols(["product", "Medicine"], ["batch", "Batch"], ["expiry", "Exp"], ["qty", "Qty"], ["rate", "Rate", "inr", "right"], ["mrp", "MRP", "inr", "right"], ["gst", "GST", null, "right"], ["total", "Total", "inr", "right"]),
    rows: d.items.map((i) => ({
      product: `${i.product_name}${{ global: " · from medicine DB", new: " · new item", not_found: " · not found" }[i.source] || (i.is_new_product && !i.source ? " · new" : "")}`,
      batch: i.batch_no || "?",
      expiry: S.fmtExpiry(i.expiry_date) || "?",
      qty: `${i.packs || "?"}${i.free_packs ? `+${i.free_packs}` : ""} × ${i.units_per_pack}`,
      rate: i.rate_per_pack,
      mrp: i.mrp_per_pack,
      gst: `${i.gst_percent}%`,
      total: i.total,
    })),
    totals: [{ label: "Total (incl. GST)", value: d.total }],
    missing: d.missing,
    actions: [
      { label: "Save purchase", style: "primary", action: { type: "commit", draft_id: d.id }, disabled: d.missing.some((m) => /supplier|items|quantity|rate|higher|batch|expiry|not found|English/.test(m)) },
      { label: "Discard", style: "ghost", action: { type: "discard", draft_id: d.id } },
    ],
  };
}

// Search picker cards for whatever the draft couldn't place with confidence:
// closest matches from the user's catalog, then the medicine database (one
// entry per medicine), with a search box and "add as new" in the card
function purchasePickers(d) {
  const out = [];
  if (!d.supplier && d.supplier_pending) {
    out.push({
      type: "picker",
      kind: "supplier",
      draft_id: d.id,
      target: "supplier",
      title: `Which supplier is "${d.supplier_pending}"?`,
      query: d.supplier_pending,
      options: (d.supplier_options || []).map((o) => ({ source: o.is_global ? "global" : "yours", id: o.id, name: o.name, detail: [o.city, o.gst_no].filter(Boolean).join(" · ") })),
      new_name: d.supplier_pending,
      new_label: `Add "${d.supplier_pending}" as a new supplier`,
    });
  }
  d.items.forEach((i, idx) => {
    if (i.source !== "not_found") return;
    const seen = new Set();
    const options = [];
    for (const o of i.catalog_options || []) {
      const k = medicineKey(o.product_name);
      if (seen.has(k)) continue;
      seen.add(k);
      options.push({ source: "catalog", id: o.product_id, name: o.product_name, detail: "In your catalog" });
    }
    for (const o of i.medicine_options || []) {
      const k = medicineKey(o.name);
      if (seen.has(k)) continue;
      seen.add(k);
      options.push({ source: "global", name: o.name, detail: [o.manufacturer, o.pack].filter(Boolean).join(" · ") });
    }
    const said = i.input?.spoken_name || i.input?.product_name || i.product_name;
    const name = cleanProductName(i.input?.product_name || i.product_name) || i.product_name;
    out.push({
      type: "picker",
      kind: "medicine",
      draft_id: d.id,
      target: "line",
      line: idx,
      title: `${idx + 1}. Which medicine is "${said}"?`,
      query: name,
      options: options.slice(0, 8),
      new_name: name,
      new_label: `Add "${name}" as a new item`,
    });
  });
  return out;
}

// Saving a confirmed purchase draft through the normal purchase API
async function commitPurchase(draft, ctx) {
  const s = draft.supplier || {};
  // Last line of defence: never store a record under a Hindi-script or unconfirmed name
  if (!s.name || hasDevanagari(s.name)) throw new Error("The supplier still needs to be confirmed in English before saving.");
  const blocked = draft.items.find((i) => i.source === "not_found" || hasDevanagari(i.product_name));
  if (blocked) throw new Error(`"${blocked.product_name}" still needs to be confirmed before saving.`);
  const payload = {
    supplier_id: s.id || null,
    supplier_name: s.name,
    ...(s.is_new ? { supplier_data: { name: s.name } } : {}),
    invoice_no: draft.invoice_no || `AI-${Date.now().toString().slice(-8)}`,
    purchase_date: draft.purchase_date,
    payment_status: draft.payment_status,
    items: draft.items.map((i) => ({
      product_id: i.product_id || `scanned_${uuidv4().slice(0, 12)}`,
      selected_product_id: i.product_id || undefined,
      product_name: i.product_name,
      manufacturer: i.manufacturer || null,
      salt_composition: i.salt_composition || null,
      pack_type: i.pack_type || "Strip",
      batch_no: i.batch_no || null,
      expiry_date: i.expiry_date || null,
      pack_quantity: i.packs || 1,
      scheme: i.free_packs || 0,
      units_per_pack: i.units_per_pack || 1,
      pack_price: i.rate_per_pack,
      mrp_per_unit: (i.mrp_per_pack || 0) / (i.units_per_pack || 1),
      discount: i.discount_percent || 0,
      cgst: (i.gst_percent || 0) / 2,
      sgst: (i.gst_percent || 0) / 2,
    })),
  };
  const res = await S.api(ctx, "POST", "/purchases", payload);
  const p = res.purchase;
  return {
    block: {
      type: "result",
      tone: "success",
      title: "Purchase saved",
      text: `${p.supplier_name} · ${p.invoice_no} · ${inr(p.total_amount)} · ${p.items.length} item(s) added to stock`,
      actions: [{ label: "Open purchases", action: { type: "navigate", to: `/purchases`, state: { highlightId: p.id } } }],
    },
    summary: { saved: "purchase", id: p.id, invoice_no: p.invoice_no, supplier: p.supplier_name, total: p.total_amount, items: p.items.length },
  };
}

const ops = {
  // A pick from a search picker card: applied straight to the draft, no AI turn
  async resolve_purchase_line(a, ctx) {
    const draft = ctx.getDraft(a.draft_id);
    if (!draft) throw new Error("This draft was already saved or discarded.");
    const pick = a.pick || {};
    const name = String(pick.name || "").trim();
    if (!name) throw new Error("Nothing was picked.");
    const args = { draft_id: draft.id };
    let what;
    if (a.target === "supplier") {
      args.supplier = name;
      if (pick.source === "new") args.confirm_new_supplier = true;
      else args.supplier_id = pick.id;
      what = name;
    } else {
      const line = draft.items[a.line];
      if (!line) throw new Error("That line is no longer in the draft.");
      const input = line.input;
      delete input.catalog_product_id;
      delete input.confirm_new_item;
      delete input.global_pick;
      if (pick.source === "catalog") {
        input.catalog_product_id = pick.id;
        input.product_name = name;
      } else if (pick.source === "global") {
        input.product_name = name;
        input.global_pick = true;
      } else {
        input.product_name = cleanProductName(name) || name;
        input.confirm_new_item = true;
      }
      what = `${a.line + 1}. ${input.product_name}`;
    }
    const draftTool = tools.find((t) => t.name === "draft_purchase");
    const r = await draftTool.run(args, ctx);
    // Short "what's left": names still to pick, then other missing fields
    const toPick = [...(r.supplier_not_found ? [r.supplier_not_found] : []), ...r.items.filter((i) => i.source === "not_found").map((i) => i.product_name)];
    const other = (r.missing || []).filter((m) => !/not found/.test(m)).map((m) => m.replace(/^\d+\.\s*/, ""));
    const left = [...(toPick.length ? [`pick or add ${toPick.join(", ")}`] : []), ...other].join("; ");
    return {
      block: null,
      text: say(ctx.language, {
        en: left ? `Updated ${what}. Still needed: ${left}.` : `Updated ${what}. The purchase is ready to save.`,
        hinglish: left ? `${what} update ho gaya. Abhi baaki: ${left}.` : `${what} update ho gaya. Purchase save karne ke liye ready hai.`,
        hi: left ? `${what} अपडेट हो गया। अभी बाकी: ${left}।` : `${what} अपडेट हो गया। खरीद सेव करने के लिए तैयार है।`,
      }),
      summary: { updated: what, missing: r.missing },
    };
  },
  async delete_purchase(a, ctx) {
    const res = await S.api(ctx, "DELETE", `/purchases/${a.purchase_id}?delete_inventory=${a.mode}`);
    return { block: { type: "result", tone: "success", title: "Purchase deleted", text: res.removed_units ? `${res.removed_units} units removed from stock` : "Stock left unchanged" }, summary: { deleted: "purchase", removed_units: res.removed_units || 0 } };
  },
  async purchase_payment(a, ctx) {
    await S.api(ctx, "POST", `/purchases/${a.purchase_id}/payments`, { amount: a.amount, payment_mode: a.payment_mode });
    return { block: { type: "result", tone: "success", title: "Payment recorded", text: `${inr(a.amount)} · ${a.payment_mode}` }, summary: { recorded: "supplier payment", amount: a.amount } };
  },
};

module.exports = { tools, commitPurchase, ops, purchaseDraftBlock };
