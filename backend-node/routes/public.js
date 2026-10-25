// Public, unauthenticated links (rate-limited in server.js).
//   GET /api/public/bill/:token   a shared bill's PDF, while its link is valid
const express = require("express");
const mongoose = require("mongoose");
const billShare = require("../services/billShare");
const { generateBillPDF } = require("../services/pdf");

const router = express.Router();

const page = (title, text) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f6f6f7;color:#111}
div{max-width:360px;padding:28px;margin:16px;background:#fff;border-radius:18px;box-shadow:0 2px 12px rgba(0,0,0,.06);text-align:center}h1{font-size:18px;margin:0 0 8px}p{margin:0;color:#555;font-size:14px;line-height:1.5}</style>
</head><body><div><h1>${title}</h1><p>${text}</p></div></body></html>`;

router.get("/bill/:token", async (req, res, next) => {
  try {
    res.set("Cache-Control", "private, no-store");
    res.set("X-Robots-Tag", "noindex, nofollow");
    const db = mongoose.connection.db;
    const found = await billShare.resolveToken(db, req.params.token);
    if (!found?.share) {
      return res
        .status(found?.expired ? 410 : 404)
        .type("html")
        .send(page(found?.expired ? "This bill link has expired" : "Bill link not found", "Please ask the pharmacy to send the bill again."));
    }
    const { share } = found;
    const bill = await db.collection("bills").findOne({ id: share.bill_id, pharmacy_id: share.pharmacy_id }, { projection: { _id: 0 } });
    if (!bill) return res.status(410).type("html").send(page("This bill is no longer available", "Please contact the pharmacy."));
    const pharmacy = await db.collection("pharmacies").findOne({ id: share.pharmacy_id }, { projection: { _id: 0 } });
    const pdf = await generateBillPDF(bill, billShare.pdfPharmacy(pharmacy));
    const name = String(bill.bill_no || "bill").replace(/[^A-Za-z0-9_-]/g, "");
    res.set("Content-Type", "application/pdf");
    res.set("Content-Disposition", `inline; filename="${name}.pdf"`);
    res.send(pdf);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
