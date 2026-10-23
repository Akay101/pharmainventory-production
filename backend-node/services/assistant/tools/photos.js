// Photo tools: read an attached invoice or medicine pack and hand the result
// to the same drafts the rest of the assistant uses.
const { extractBill, extractProduct } = require("../../ai/extract");
const { matchForBilling } = require("../../ai/inventoryMatch");
const S = require("./shared");

const { blocks, cols, inr, say } = S;

async function needImages(ctx) {
  const images = await ctx.getImages();
  if (!images.length) return { error: "No photo attached. Ask the user to attach a photo (paperclip/camera button)." };
  return { images };
}

const readError = (err) => ({ error: err.category === "rate_limit" ? "The AI is busy, try again in a moment" : `Couldn't read the photo: ${err.message}` });

function makePhotoTools({ purchaseTools, billingTools }) {
  const draftPurchase = purchaseTools.find((t) => t.name === "draft_purchase");
  const draftBill = billingTools.find((t) => t.name === "draft_bill");

  const readInvoice = {
    name: "read_invoice_photo",
    description:
      "Read the attached supplier invoice/bill photo(s) and turn EVERY line into a purchase draft (supplier, invoice no, date, batch, expiry, qty, free, pack size, rate, MRP, discount, GST), linked to the catalog. Use when the user attached a purchase invoice and wants it entered ('iski purchase chadha do').",
    parameters: { type: "object", properties: { payment_status: { type: "string", enum: ["Paid", "Unpaid"] } } },
    status: (a, lang) => say(lang, { en: "Reading every line of the invoice", hinglish: "Invoice ki har line padh raha hoon", hi: "बिल की हर लाइन पढ़ रहा हूँ" }),
    async run(a, ctx) {
      const { images, error } = await needImages(ctx);
      if (error) return { error };
      let bill;
      try {
        bill = await extractBill(images);
      } catch (err) {
        return readError(err);
      }
      if (!bill.items.length) return { error: "No product lines found. If this is a single medicine pack, use read_product_photo_for_purchase instead." };
      const result = await draftPurchase.run(
        {
          origin: "photo",
          supplier: bill.supplier_name || undefined,
          invoice_no: bill.invoice_no || undefined,
          purchase_date: bill.invoice_date || undefined,
          payment_status: a.payment_status,
          items: bill.items.map((i) => ({
            product_name: i.product_name,
            batch_no: i.batch_no || undefined,
            expiry: i.expiry_date || undefined,
            packs: i.quantity || undefined,
            free_packs: i.free_quantity || undefined,
            units_per_pack: i.units_per_pack || undefined,
            rate_per_pack: i.rate_pack || undefined,
            mrp_per_pack: i.mrp || undefined,
            discount_percent: i.discount_percent,
            gst_percent: i.gst_percent || undefined,
          })),
        },
        ctx
      );
      return { ...result, read_from_photo: { supplier: bill.supplier_name, gstin: bill.supplier_gstin, invoice_no: bill.invoice_no, invoice_date: bill.invoice_date, lines: bill.items.length, confidence: bill.confidence } };
    },
  };

  const readPackForPurchase = {
    name: "read_product_photo_for_purchase",
    description: "Read an attached medicine pack photo (name, batch, expiry, MRP, pack size) and start/extend a purchase draft line for it. Ask for quantity, rate and supplier if not given.",
    parameters: {
      type: "object",
      properties: {
        draft_id: { type: "string", description: "Existing purchase draft to add this line to" },
        supplier: { type: "string" },
        packs: { type: "number" },
        rate_per_pack: { type: "number" },
      },
    },
    status: (a, lang) => say(lang, { en: "Reading the pack", hinglish: "Pack padh raha hoon", hi: "पैक पढ़ रहा हूँ" }),
    async run(a, ctx) {
      const { images, error } = await needImages(ctx);
      if (error) return { error };
      let p;
      try {
        p = (await extractProduct(images)).product;
      } catch (err) {
        return readError(err);
      }
      const prev = a.draft_id ? ctx.getDraft(a.draft_id) : null;
      const items = [
        ...(prev?.items || []).map((i) => ({ ...i.input })),
        {
          product_name: p.product_name,
          batch_no: p.batch_no || undefined,
          expiry: p.expiry_date || undefined,
          units_per_pack: p.units_per_pack,
          mrp_per_pack: p.mrp_pack || undefined,
          packs: a.packs,
          rate_per_pack: a.rate_per_pack,
        },
      ];
      const result = await draftPurchase.run({ draft_id: a.draft_id, supplier: a.supplier, items, origin: "photo" }, ctx);
      return { ...result, read_from_photo: { name: p.product_name, batch: p.batch_no, batch_clearly_readable: p.batch_legible, expiry: p.expiry_date, mrp_per_pack: p.mrp_pack, units_per_pack: p.units_per_pack } };
    },
  };

  const readPackForBill = {
    name: "read_product_photo",
    description:
      "Read the attached medicine pack photo(s) and add that medicine to the bill draft, matched to stock: by batch first, then by name; if not in stock it's billed as negative stock. One photo set = one medicine. Pass quantity if the user said it.",
    parameters: {
      type: "object",
      properties: {
        draft_id: { type: "string", description: "Existing bill draft to add to" },
        quantity: { type: "number" },
        unit: { type: "string", enum: ["units", "packs"] },
        customer_name: { type: "string" },
        payment_mode: { type: "string", enum: ["Cash", "UPI", "Card", "Credit"] },
      },
    },
    status: (a, lang) => say(lang, { en: "Reading the pack and matching your stock", hinglish: "Pack padh ke stock se match kar raha hoon", hi: "पैक पढ़कर स्टॉक से मिला रहा हूँ" }),
    async run(a, ctx) {
      const { images, error } = await needImages(ctx);
      if (error) return { error };
      let p;
      try {
        p = (await extractProduct(images)).product;
      } catch (err) {
        return readError(err);
      }
      const prev = a.draft_id ? ctx.getDraft(a.draft_id) : null;
      const items = [
        ...(prev?.items || []).map((i) => ({ ...i.input })),
        { product: p.product_name, batch_no: p.batch_legible ? p.batch_no : "", quantity: a.quantity || 1, unit: a.unit || "units", mrp_per_unit: p.mrp_per_unit },
      ];
      const result = await draftBill.run({ draft_id: a.draft_id, customer_name: a.customer_name, payment_mode: a.payment_mode, items }, ctx);
      return { ...result, read_from_photo: { name: p.product_name, batch: p.batch_no, batch_clearly_readable: p.batch_legible, expiry: p.expiry_date, mrp_per_unit: p.mrp_per_unit } };
    },
  };

  const identify = {
    name: "identify_product_photo",
    description: "Identify the medicine in the attached photo (name, composition, maker, batch, expiry, MRP) and look it up in the user's stock (batch first, then name).",
    parameters: { type: "object", properties: {} },
    status: (a, lang) => say(lang, { en: "Identifying the medicine", hinglish: "Dawai pehchaan raha hoon", hi: "दवा पहचान रहा हूँ" }),
    async run(a, ctx) {
      const { images, error } = await needImages(ctx);
      if (error) return { error };
      let p;
      try {
        p = (await extractProduct(images)).product;
      } catch (err) {
        return readError(err);
      }
      const m = await matchForBilling(ctx.db, ctx.pharmacyId, p);
      const item = m.matched_item;
      ctx.emit(
        blocks.stats(
          [
            { label: "Medicine", value: p.product_name || "—", hint: p.manufacturer },
            { label: "Batch / Exp", value: p.batch_no || "—", hint: p.expiry_date ? `Exp ${S.fmtExpiry(p.expiry_date)}` : "" },
            { label: "MRP", value: p.mrp_pack ? inr(p.mrp_pack) : "—", hint: p.units_per_pack > 1 ? `${p.units_per_pack} per pack` : "" },
            { label: "In your stock", value: item.inventory_id ? `${item.available_batches?.reduce((s, b) => s + (b.available_quantity || 0), 0) ?? item.available_quantity} units` : "Not in stock", hint: m.match_type === "batch_exact" ? "Same batch found" : m.match_type === "name_matched" ? "Matched by name" : "" },
          ],
          "From the photo"
        )
      );
      if (item.available_batches?.length) {
        ctx.emit(blocks.table(`Batches of ${item.product_name}`, cols(["batch_no", "Batch"], ["expiry", "Exp"], ["available_quantity", "Stock", null, "right"], ["mrp", "MRP/unit", "inr", "right"]), item.available_batches.map((b) => ({ ...b, expiry: S.fmtExpiry(b.expiry_date) }))));
      }
      return { read: { name: p.product_name, composition: p.salt_composition, manufacturer: p.manufacturer, batch: p.batch_no, expiry: p.expiry_date, mrp_per_pack: p.mrp_pack, units_per_pack: p.units_per_pack }, stock_match: m.match_type, stock: item.inventory_id ? { product: item.product_name, batches: item.available_batches } : null, alternatives: m.alternatives };
    },
  };

  return { readInvoice, readPackForPurchase, readPackForBill, identify };
}

module.exports = { makePhotoTools };
