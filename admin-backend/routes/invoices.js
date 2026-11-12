// DavaDesk's own GST invoices (plan, add-ons, AI credits) for the selected
// environment. The app creates them when a payment settles and stores the
// PDF on the invoice, so what is shown and resent here is exactly what the
// customer got.
//   GET  /api/invoices?search=&from=&to=&page=
//   GET  /api/invoices/:id/pdf
//   POST /api/invoices/:id/resend { to? }
const express = require("express");
const { z } = require("zod");
const { resolveDbEnv } = require("../db/connections");
const { audit, parseBody } = require("../services/audit");
const { sendAttachmentEmail } = require("../services/email");

const router = express.Router();
router.use(resolveDbEnv);

const PAGE = 50;
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

router.get("/", async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const filter = {};
    const search = String(req.query.search || "").trim().slice(0, 80);
    if (search) {
      const re = new RegExp(escapeRe(search), "i");
      filter.$or = [{ invoice_no: re }, { "buyer.name": re }, { "buyer.email": re }, { "buyer.gstin": re }, { order_id: re }];
    }
    const from = req.query.from ? new Date(String(req.query.from)) : null;
    const to = req.query.to ? new Date(String(req.query.to)) : null;
    if ((from && !isNaN(from)) || (to && !isNaN(to))) {
      filter.issued_at = {};
      if (from && !isNaN(from)) filter.issued_at.$gte = from;
      if (to && !isNaN(to)) filter.issued_at.$lte = to;
    }
    const col = req.db.collection("billing_invoices");
    const [rows, total, sums] = await Promise.all([
      col.find(filter, { projection: { pdf: 0 } }).sort({ issued_at: -1 }).skip((page - 1) * PAGE).limit(PAGE).toArray(),
      col.countDocuments(filter),
      col.aggregate([{ $match: filter }, { $group: { _id: null, total: { $sum: "$total_paise" }, taxable: { $sum: "$taxable_paise" }, gst: { $sum: "$gst_paise" } } }]).toArray(),
    ]);
    res.json({
      env: req.dbEnv,
      page,
      pages: Math.max(1, Math.ceil(total / PAGE)),
      total,
      sums: sums[0] ? { total_paise: sums[0].total, taxable_paise: sums[0].taxable, gst_paise: sums[0].gst } : { total_paise: 0, taxable_paise: 0, gst_paise: 0 },
      invoices: rows.map((i) => ({
        id: i.id,
        invoice_no: i.invoice_no,
        issued_at: i.issued_at,
        purpose: i.purpose,
        account_id: i.account_id,
        buyer: i.buyer,
        description: (i.lines || []).map((l) => l.description).join("; "),
        taxable_paise: i.taxable_paise,
        cgst_paise: i.cgst_paise,
        sgst_paise: i.sgst_paise,
        igst_paise: i.igst_paise,
        gst_paise: i.gst_paise,
        total_paise: i.total_paise,
        type: i.type,
        place_of_supply: i.place_of_supply,
        order_id: i.order_id,
        payment_id: i.payment?.payment_id || null,
        emailed_at: i.emailed_at || null,
        emails: (i.emails || []).slice(-5),
      })),
    });
  } catch (err) {
    next(err);
  }
});

const findInvoice = async (req, res, withPdf = false) => {
  const id = String(req.params.id || "");
  if (!/^[0-9a-f-]{36}$/.test(id)) {
    res.status(404).json({ error: "Invoice not found" });
    return null;
  }
  const inv = await req.db.collection("billing_invoices").findOne({ id }, withPdf ? {} : { projection: { pdf: 0 } });
  if (!inv) {
    res.status(404).json({ error: "Invoice not found" });
    return null;
  }
  return inv;
};

const pdfOf = (inv) => (inv.pdf ? Buffer.from(inv.pdf.buffer || inv.pdf) : null);
const fileName = (inv) => `DavaDesk-Invoice-${inv.invoice_no.replace(/\//g, "-")}.pdf`;

router.get("/:id/pdf", async (req, res, next) => {
  try {
    const inv = await findInvoice(req, res, true);
    if (!inv) return;
    const pdf = pdfOf(inv);
    if (!pdf) return res.status(409).json({ error: "The PDF for this invoice hasn't been made yet. It is rebuilt the next time the customer opens it; try again shortly." });
    res.set({ "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${fileName(inv)}"`, "Cache-Control": "private, no-store" });
    res.send(pdf);
  } catch (err) {
    next(err);
  }
});

const resendSchema = z.object({ to: z.string().trim().email().max(120).optional().or(z.literal("")) });

router.post("/:id/resend", async (req, res, next) => {
  try {
    const d = parseBody(resendSchema, req, res);
    if (!d) return;
    const inv = await findInvoice(req, res, true);
    if (!inv) return;
    const pdf = pdfOf(inv);
    if (!pdf) return res.status(409).json({ error: "The PDF for this invoice hasn't been made yet. Try again shortly." });
    let to = d.to || null;
    let name = inv.buyer?.contact_name || "";
    if (!to) {
      const owner = await req.db.collection("users").findOne({ pharmacy_id: inv.account_id, is_primary_admin: true }, { projection: { email: 1, name: 1 } });
      to = owner?.email || inv.buyer?.email;
      name = owner?.name || name;
    }
    if (!to) return res.status(400).json({ error: "No email on file for this customer. Enter one." });
    const total = `Rs. ${(inv.total_paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
    await sendAttachmentEmail({
      toEmail: to,
      toName: name,
      subject: `DavaDesk tax invoice ${inv.invoice_no}`,
      text: `Hello ${name || "there"},\n\nPlease find attached a copy of your DavaDesk GST tax invoice ${inv.invoice_no} dated ${new Date(inv.issued_at).toLocaleDateString("en-IN")} for ${total} (incl. GST).\n\nThank you for using DavaDesk.`,
      highlight: inv.invoice_no,
      attachments: [{ filename: fileName(inv), content: pdf, contentType: "application/pdf" }],
    });
    await req.db.collection("billing_invoices").updateOne({ id: inv.id }, { $push: { emails: { to, at: new Date(), ok: true, kind: "ADMIN", by: req.adminUser?.email || null } } });
    await audit(req, "INVOICE_RESENT", inv.id, { invoice_no: inv.invoice_no, to });
    res.json({ message: `Invoice ${inv.invoice_no} sent to ${to}` });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
