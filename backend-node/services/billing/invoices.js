// DavaDesk's GST tax invoices for its own sales (plan, add-ons, AI credits).
//
// One invoice per paid order, created when the order is settled. Numbers run
// in sequence per financial year (DD/26-27/000001) from the `counters`
// collection. The PDF is stored on the invoice so the admin panel can show
// and resend exactly what the customer received.
//
// The invoice row is written before its PDF: if rendering fails the number is
// still used once, and the PDF is rebuilt on the next read.
const crypto = require("crypto");
const PDFDocument = require("pdfkit");
const { amountInWords } = require("../pdfFormats");
const gst = require("./gst");
const pricing = require("./pricing");

const INVOICES = "billing_invoices";
const IST = "Asia/Kolkata";

const rs = (paise) => `Rs. ${((Number(paise) || 0) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const istDate = (d) => new Date(d).toLocaleDateString("en-IN", { timeZone: IST, day: "2-digit", month: "short", year: "numeric" });

async function nextInvoiceNumber(db, prefix, at = new Date()) {
  const fy = gst.financialYear(at);
  const r = await db
    .collection("counters")
    .findOneAndUpdate({ _id: `billing_invoice:${fy}` }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: "after" });
  const seq = r.seq;
  return { fy, seq, number: `${prefix}/${fy}/${String(seq).padStart(6, "0")}` };
}

// Lines and tax for an order, from what was snapshotted at checkout
function invoiceLines(order) {
  if (order.invoice_lines?.length) return order.invoice_lines;
  if (order.purpose === "CREDITS") {
    // Credit packs are priced GST-inclusive
    const total = order.amount_paise;
    const pct = order.pack_snapshot?.gst_percent ?? 18;
    const taxable = Math.round((total * 100) / (100 + pct));
    return [{ description: `DavaDesk AI credits: ${order.pack_snapshot?.label || "pack"} (${order.pack_snapshot?.credits || 0} credits)`, qty: 1, unit_paise: taxable, gross_paise: taxable, discount_paise: 0, taxable_paise: taxable }];
  }
  const p = order.pricing || {};
  const discount = (p.offer?.discount_paise || 0) + (p.promo?.discount_paise || 0);
  return [
    {
      description: `${order.plan_snapshot?.name || order.plan} subscription (${order.plan_snapshot?.duration_days || 365} days)`,
      qty: 1,
      unit_paise: p.base_paise ?? order.amount_paise,
      gross_paise: p.base_paise ?? order.amount_paise,
      discount_paise: discount,
      taxable_paise: p.taxable_paise ?? order.amount_paise,
    },
  ];
}

function orderTax(order, lines) {
  const taxable = lines.reduce((s, l) => s + l.taxable_paise, 0);
  const total = order.amount_paise;
  const pct = order.tax?.gst_percent ?? order.pricing?.gst_percent ?? order.pack_snapshot?.gst_percent ?? 18;
  return { taxable, gst: total - taxable, pct, total };
}

/**
 * Create the invoice for a settled order (idempotent on order_id).
 */
async function createForOrder(db, order) {
  const existing = await db.collection(INVOICES).findOne({ order_id: order.order_id }, { projection: { pdf: 0 } });
  if (existing) return existing;

  const cfg = await pricing.getInvoiceConfig(db);
  const sellerGstin = gst.normalizeGstin(cfg.seller_gstin);
  const sellerState = sellerGstin.slice(0, 2);
  const account = await db.collection("pharmacies").findOne({ id: order.account_id || order.pharmacy_id }, { projection: { _id: 0, id: 1, name: 1, location: 1, gst_no: 1, contact: 1, billing_profile: 1 } });
  const owner = await db.collection("users").findOne({ id: order.user_id }, { projection: { _id: 0, name: 1, email: 1, mobile: 1 } });

  const bp = order.billing_profile || account?.billing_profile || {};
  const buyerGstin = bp.gstin && gst.isValidGstin(bp.gstin) ? gst.normalizeGstin(bp.gstin) : null;
  const buyerState = buyerGstin ? buyerGstin.slice(0, 2) : bp.state_code || sellerState;

  const lines = invoiceLines(order);
  const t = orderTax(order, lines);
  const split = gst.splitTax({ taxablePaise: t.taxable, gstPaise: t.gst, gstPercent: t.pct, sellerStateCode: sellerState, buyerStateCode: buyerState });

  const issuedAt = order.paid_at ? new Date(order.paid_at) : new Date();
  const { fy, seq, number } = await nextInvoiceNumber(db, cfg.prefix || "DD", issuedAt);
  const invoice = {
    id: crypto.randomUUID(),
    invoice_no: number,
    fy,
    seq,
    order_id: order.order_id,
    purpose: order.purpose || "PLAN",
    account_id: order.account_id || order.pharmacy_id,
    pharmacy_id: order.pharmacy_id,
    user_id: order.user_id,
    issued_at: issuedAt,
    seller: {
      name: cfg.seller_name,
      address: cfg.seller_address,
      gstin: sellerGstin,
      state_code: sellerState,
      state: gst.stateName(sellerState),
      email: cfg.seller_email || "",
      phone: cfg.seller_phone || "",
    },
    buyer: {
      name: bp.legal_name || account?.name || owner?.name || "Customer",
      contact_name: owner?.name || "",
      email: owner?.email || "",
      phone: owner?.mobile || "",
      address: bp.address || account?.location || "",
      gstin: buyerGstin,
      state_code: buyerState,
      state: gst.stateName(buyerState),
    },
    place_of_supply: `${gst.stateName(buyerState) || "-"} (${buyerState})`,
    reverse_charge: false,
    sac: cfg.sac,
    sac_description: cfg.sac_description,
    lines,
    gst_percent: t.pct,
    taxable_paise: t.taxable,
    ...split,
    gst_paise: t.gst,
    total_paise: t.total,
    payment: { gateway: order.gateway, order_id: order.order_id, payment_id: order.payment_id || null, paid_at: order.paid_at || issuedAt },
    status: "ISSUED",
    emails: [],
    created_at: new Date(),
  };
  try {
    await db.collection(INVOICES).insertOne(invoice);
  } catch (err) {
    if (err.code === 11000) return db.collection(INVOICES).findOne({ order_id: order.order_id }, { projection: { pdf: 0 } });
    throw err;
  }
  await db.collection("payment_orders").updateOne({ order_id: order.order_id }, { $set: { invoice_id: invoice.id, invoice_no: number } });
  try {
    await ensurePdf(db, invoice);
  } catch (err) {
    console.error(`[Invoices] PDF for ${number} failed (will retry on read):`, err.message);
  }
  return invoice;
}

// The stored PDF, rendering it first if it is missing
async function ensurePdf(db, invoice) {
  const stored = await db.collection(INVOICES).findOne({ id: invoice.id }, { projection: { pdf: 1 } });
  if (stored?.pdf) return Buffer.from(stored.pdf.buffer || stored.pdf);
  const buf = await renderPdf(invoice);
  await db.collection(INVOICES).updateOne({ id: invoice.id }, { $set: { pdf: buf, pdf_rendered_at: new Date() } });
  return buf;
}

function renderPdf(inv) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 40, info: { Title: `Tax Invoice ${inv.invoice_no}`, Author: inv.seller.name } });
      const chunks = [];
      doc.on("data", (c) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const L = 40;
      const R = 555;
      const W = R - L;
      const orange = "#ea580c";
      const grey = "#475569";

      // Header
      try {
        doc.image(require("path").join(__dirname, "..", "..", "assets", "logoBrand", "logoOnly.png"), L, 36, { width: 34 });
      } catch {
        /* logo is optional */
      }
      doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(15).text(inv.seller.name, L + 44, 38, { width: 300 });
      doc.font("Helvetica").fontSize(8.5).fillColor(grey).text(inv.seller.address || "", L + 44, 56, { width: 300 });
      doc.text(`GSTIN: ${inv.seller.gstin}   State: ${inv.seller.state} (${inv.seller.state_code})`, L + 44, doc.y + 1, { width: 320 });
      if (inv.seller.email || inv.seller.phone) doc.text([inv.seller.email, inv.seller.phone].filter(Boolean).join("  |  "), L + 44, doc.y + 1, { width: 320 });

      doc.font("Helvetica-Bold").fontSize(16).fillColor(orange).text("TAX INVOICE", 360, 38, { width: R - 360, align: "right" });
      doc.font("Helvetica").fontSize(8).fillColor(grey).text("Original for recipient", 360, 58, { width: R - 360, align: "right" });

      let y = Math.max(doc.y, 100) + 12;
      doc.moveTo(L, y).lineTo(R, y).strokeColor("#e2e8f0").lineWidth(1).stroke();
      y += 10;

      // Invoice meta and buyer
      const meta = [
        ["Invoice No.", inv.invoice_no],
        ["Invoice Date", istDate(inv.issued_at)],
        ["Place of Supply", inv.place_of_supply],
        ["Reverse Charge", inv.reverse_charge ? "Yes" : "No"],
        ["Order ID", inv.payment.order_id],
      ];
      if (inv.payment.payment_id) meta.push(["Payment Ref.", inv.payment.payment_id]);
      let my = y;
      for (const [k, v] of meta) {
        doc.font("Helvetica").fontSize(8.5).fillColor(grey).text(k, 340, my, { width: 85 });
        doc.font("Helvetica-Bold").fillColor("#0f172a").text(String(v), 425, my, { width: R - 425 });
        my = doc.y + 3;
      }

      doc.font("Helvetica-Bold").fontSize(8.5).fillColor(orange).text("BILL TO", L, y);
      doc.font("Helvetica-Bold").fontSize(10.5).fillColor("#0f172a").text(inv.buyer.name, L, y + 12, { width: 280 });
      doc.font("Helvetica").fontSize(8.5).fillColor(grey);
      if (inv.buyer.contact_name && inv.buyer.contact_name !== inv.buyer.name) doc.text(`Attn: ${inv.buyer.contact_name}`, L, doc.y + 1, { width: 280 });
      if (inv.buyer.address) doc.text(inv.buyer.address, L, doc.y + 1, { width: 280 });
      doc.text(`State: ${inv.buyer.state || "-"} (${inv.buyer.state_code || "-"})`, L, doc.y + 1, { width: 280 });
      doc.text(`GSTIN: ${inv.buyer.gstin || "Unregistered"}`, L, doc.y + 1, { width: 280 });
      if (inv.buyer.email) doc.text(inv.buyer.email, L, doc.y + 1, { width: 280 });
      if (inv.buyer.phone) doc.text(inv.buyer.phone, L, doc.y + 1, { width: 280 });

      y = Math.max(doc.y, my) + 16;

      // Lines table
      const cols = [
        { k: "#", x: L, w: 22, align: "left" },
        { k: "Description", x: L + 22, w: 228, align: "left" },
        { k: "SAC", x: L + 250, w: 50, align: "left" },
        { k: "Qty", x: L + 300, w: 30, align: "right" },
        { k: "Rate", x: L + 330, w: 70, align: "right" },
        { k: "Discount", x: L + 400, w: 55, align: "right" },
        { k: "Taxable", x: L + 455, w: W - 455, align: "right" },
      ];
      doc.rect(L, y, W, 20).fill("#fff7ed");
      doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#9a3412");
      for (const c of cols) doc.text(c.k, c.x + 4, y + 6, { width: c.w - 8, align: c.align });
      y += 24;
      doc.font("Helvetica").fillColor("#0f172a");
      inv.lines.forEach((l, i) => {
        const cells = [String(i + 1), l.description, inv.sac, String(l.qty || 1), rs(l.unit_paise), l.discount_paise ? rs(l.discount_paise) : "-", rs(l.taxable_paise)];
        const h = Math.max(16, doc.heightOfString(l.description, { width: cols[1].w - 8 }) + 6);
        cols.forEach((c, j) => doc.text(cells[j], c.x + 4, y, { width: c.w - 8, align: c.align }));
        y += h;
        doc.moveTo(L, y - 2).lineTo(R, y - 2).strokeColor("#f1f5f9").stroke();
      });
      doc.font("Helvetica").fontSize(7.5).fillColor(grey).text(`SAC ${inv.sac}: ${inv.sac_description}`, L + 4, y + 2, { width: 300 });

      // Totals
      y += 18;
      const rows = [["Taxable value", rs(inv.taxable_paise)]];
      if (inv.type === "INTRA") {
        rows.push([`CGST @ ${inv.cgst_percent}%`, rs(inv.cgst_paise)]);
        rows.push([`SGST @ ${inv.sgst_percent}%`, rs(inv.sgst_paise)]);
      } else {
        rows.push([`IGST @ ${inv.igst_percent}%`, rs(inv.igst_paise)]);
      }
      let ty = y;
      for (const [k, v] of rows) {
        doc.font("Helvetica").fontSize(9).fillColor(grey).text(k, 340, ty, { width: 120 });
        doc.fillColor("#0f172a").text(v, 460, ty, { width: R - 460, align: "right" });
        ty += 15;
      }
      doc.rect(340, ty, R - 340, 22).fill("#0f172a");
      doc.font("Helvetica-Bold").fontSize(10).fillColor("#ffffff").text("Total (incl. GST)", 346, ty + 6, { width: 120 });
      doc.text(rs(inv.total_paise), 460, ty + 6, { width: R - 466, align: "right" });
      ty += 30;

      doc.font("Helvetica-Bold").fontSize(8.5).fillColor(orange).text("AMOUNT IN WORDS", L, y);
      doc.font("Helvetica").fontSize(9).fillColor("#0f172a").text(amountInWords(inv.total_paise / 100), L, y + 12, { width: 280 });
      doc.font("Helvetica-Bold").fontSize(8.5).fillColor(orange).text("PAYMENT", L, doc.y + 10);
      doc.font("Helvetica").fontSize(8.5).fillColor(grey).text(`Paid online on ${istDate(inv.payment.paid_at)}${inv.payment.gateway && inv.payment.gateway !== "NONE" ? ` via ${inv.payment.gateway === "CASHFREE" ? "Cashfree" : inv.payment.gateway}` : ""}.`, L, doc.y + 2, { width: 280 });

      // Footer
      const fy = Math.max(ty, doc.y) + 40;
      doc.moveTo(L, fy).lineTo(R, fy).strokeColor("#e2e8f0").stroke();
      doc.font("Helvetica").fontSize(7.5).fillColor(grey).text(
        "This is a computer-generated invoice and does not need a signature. Tax is not payable under reverse charge. Subject to the terms of service of DavaDesk.",
        L,
        fy + 8,
        { width: W, align: "center" }
      );
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

const publicView = (inv) => ({
  id: inv.id,
  invoice_no: inv.invoice_no,
  issued_at: inv.issued_at,
  purpose: inv.purpose,
  description: inv.lines?.map((l) => l.description).join("; "),
  taxable_paise: inv.taxable_paise,
  gst_paise: inv.gst_paise,
  total_paise: inv.total_paise,
  type: inv.type,
  buyer_gstin: inv.buyer?.gstin || null,
  order_id: inv.order_id,
});

module.exports = { INVOICES, createForOrder, ensurePdf, renderPdf, nextInvoiceNumber, invoiceLines, publicView };
