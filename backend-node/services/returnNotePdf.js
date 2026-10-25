// Purchase return / expiry return note PDF, in the same A5-landscape frame
// as the purchase invoice and bill (services/pdf.js).
const PDFDocument = require("pdfkit");
const https = require("https");

const money = (n) => (Math.round((Number(n) || 0) * 100) / 100).toFixed(2);
const fmtExpiry = (exp) => {
  if (!exp || exp === "-") return "-";
  const d = new Date(exp);
  if (Number.isNaN(d.getTime())) return String(exp);
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(2)}`;
};
const fmtDate = (v) => {
  const d = new Date(v || Date.now());
  return Number.isNaN(d.getTime()) ? "-" : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).replace(/ /g, "-");
};
const STATUS = {
  Draft: "DRAFT - NOT HANDED OVER",
  "Picked - Payment Pending": "HANDED OVER - CREDIT DUE",
  "Partial Paid": "PART CREDITED",
  "Payment Done (Returned)": "RETURNED & SETTLED",
};

function fetchImage(url) {
  return new Promise((resolve) => {
    https
      .get(url, { timeout: 3000 }, (res) => {
        if (res.statusCode !== 200) return resolve(null);
        const data = [];
        res.on("data", (c) => data.push(c));
        res.on("end", () => resolve(Buffer.concat(data)));
      })
      .on("error", () => resolve(null));
  });
}

/**
 * bundle: a return_bundles / expiry_bundles document; kind: "return" | "expiry";
 * supplier: the supplier document (address, contact, GSTIN) if known.
 */
async function generateReturnNotePDF(bundle, pharmacy, { kind = "return", supplier = null } = {}) {
  let logo = null;
  if (pharmacy?.logo_url) {
    const raw = await fetchImage(pharmacy.logo_url);
    if (raw) {
      try {
        logo = await require("sharp")(raw).png().toBuffer();
      } catch {
        logo = raw;
      }
    }
  }

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A5", layout: "landscape", margin: 10 });
      const chunks = [];
      doc.on("data", (c) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const items = bundle.items || [];
      const perPage = 14;
      const pages = Math.max(1, Math.ceil(items.length / perPage));
      const title = kind === "expiry" ? "EXPIRY RETURN NOTE" : "PURCHASE RETURN NOTE";
      const totalUnits = items.reduce((s, it) => s + (Number(it.quantity_units) || 0), 0);
      const total = Number(bundle.total_amount) || items.reduce((s, it) => s + (Number(it.total_refund_amount) || 0), 0);
      const received = Math.min(total, Number(bundle.amount_paid) || 0);
      const due = Math.max(0, total - received);

      // #, DESCRIPTION, BATCH, EXP, UNITS, PACKS, RATE/U, MRP/U, AMOUNT, FROM PURCHASE
      const widths = [14, 150, 52, 32, 38, 38, 44, 44, 56, 107];
      const headers = ["#", "DESCRIPTION", "BATCH", "EXP", "UNITS", "PACKS", "RATE/U", "MRP/U", "AMOUNT", "FROM PURCHASE"];
      const rightAligned = (i) => i >= 4 && i <= 8;

      const skeleton = (page) => {
        doc.lineWidth(1).strokeColor("#000000").fillColor("#000000");
        doc.rect(10, 10, 575, 400).stroke();

        // Header: title + logo | pharmacy | note + supplier
        doc.moveTo(110, 10).lineTo(110, 80).stroke();
        doc.moveTo(345, 10).lineTo(345, 80).stroke();
        doc.moveTo(10, 25).lineTo(110, 25).stroke();
        doc.moveTo(345, 25).lineTo(585, 25).stroke();
        doc.moveTo(10, 80).lineTo(585, 80).stroke();
        doc.font("Helvetica-Bold").fontSize(6.5).text(title, 10, 15, { width: 100, align: "center" });
        let drewLogo = false;
        if (logo) {
          try {
            doc.image(logo, 30, 28, { width: 60, height: 48 });
            drewLogo = true;
          } catch {}
        }
        if (!drewLogo) {
          const initials = (pharmacy?.name || "")
            .split(" ")
            .map((w) => w[0])
            .join("")
            .slice(0, 2)
            .toUpperCase();
          doc.fillColor(kind === "expiry" ? "#e11d48" : "#ea580c").font("Helvetica-Bold").fontSize(20).text(initials, 10, 38, { width: 100, align: "center" });
          if (initials) doc.fontSize(7).text("PHARMACY", 10, 62, { width: 100, align: "center" });
          doc.fillColor("#000000");
        }

        doc.font("Helvetica-Bold").fontSize(10).text((pharmacy?.name || "").toUpperCase(), 115, 14, { width: 225 });
        doc.font("Helvetica").fontSize(6.5).text(pharmacy?.location || "", 115, 27, { width: 225 });
        doc.font("Helvetica-Bold").fontSize(6.5).text("CONTACT  ", 115, 48, { continued: true }).font("Helvetica").text(pharmacy?.contact || "");
        doc.font("Helvetica-Bold").text("GSTIN        ", 115, 57, { continued: true }).font("Helvetica").text(pharmacy?.gst_no || "");
        doc.font("Helvetica-Bold").text("D.L. NO       ", 115, 66, { continued: true }).font("Helvetica").text(pharmacy?.license_no || "");

        doc.font("Helvetica-Bold").fontSize(6.5).text("Note No.", 349, 14);
        doc.fontSize(7.5).text(bundle.bundle_no || "-", 385, 14, { width: 100 });
        doc.fontSize(7).text(fmtDate(bundle.return_date || bundle.created_at), 480, 14, { width: 100, align: "right" });
        const row = (label, value, y) => {
          doc.font("Helvetica-Bold").fontSize(6.5).text(label, 349, y);
          doc.font("Helvetica").fontSize(6.5).text(String(value || "").toUpperCase(), 395, y, { width: 185, lineBreak: false, ellipsis: true });
        };
        row("RETURN TO", bundle.supplier_name || supplier?.name, 29);
        row("ADDRESS", supplier?.address, 39);
        row("CONTACT", supplier?.contact || supplier?.phone, 49);
        row("GSTIN", supplier?.gst_no || supplier?.gstin, 59);
        row(kind === "expiry" ? "TYPE" : "REASON", kind === "expiry" ? "Expired stock" : bundle.reason || "General return", 69);

        // Table frame
        doc.rect(10, 80, 575, 18).stroke();
        let x = 10;
        headers.forEach((h, i) => {
          doc.font("Helvetica-Bold").fontSize(6.5).text(h, x + 3, 86, { width: widths[i] - 6, align: rightAligned(i) ? "right" : "left" });
          x += widths[i];
        });
        doc.moveTo(10, 323).lineTo(585, 323).stroke();
        let dx = 10;
        widths.forEach((w) => {
          dx += w;
          if (dx < 585) doc.moveTo(dx, 80).lineTo(dx, 323).stroke();
        });

        // Footer: remarks | credit summary | signatures
        doc.moveTo(225, 323).lineTo(225, 398).stroke();
        doc.moveTo(415, 323).lineTo(415, 398).stroke();
        doc.moveTo(10, 398).lineTo(585, 398).stroke();
        doc.font("Helvetica-Bold").fontSize(6.5).text("REMARKS", 15, 328);
        doc.text("E&OE", 10, 328, { width: 210, align: "right" });
        doc
          .font("Helvetica")
          .fontSize(6.5)
          .text(bundle.notes || (kind === "expiry" ? "Expired stock returned for credit." : "Stock returned to supplier."), 15, 338, { width: 205, height: 34, ellipsis: true });
        doc.font("Helvetica-Bold").fontSize(6.5).text(`ITEMS: ${items.length}   TOTAL QTY: ${totalUnits} units`, 15, 376);
        doc.font("Helvetica").fontSize(6).text(`STATUS: ${STATUS[bundle.status] || bundle.status || "-"}`, 15, 386);

        // Credit summary
        doc.fillColor("#f8fafc").rect(225.5, 359.5, 189, 19).fill().fillColor("#000000");
        doc.moveTo(225, 341).lineTo(415, 341).stroke();
        doc.moveTo(225, 359).lineTo(415, 359).stroke();
        doc.moveTo(225, 379).lineTo(415, 379).stroke();
        const sum = (label, value, y, bold) => {
          doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(bold ? 7.5 : 6.5).text(label, 230, y);
          doc.text(value, 230, y, { width: 180, align: "right" });
        };
        sum("Credit value", money(total), 329);
        sum("Received / adjusted", money(received), 347);
        sum("Credit due", `Rs ${money(due)}`, 365, true);
        doc.font("Helvetica").fontSize(6).text(bundle.returned_at ? `Settled on ${fmtDate(bundle.returned_at)}` : bundle.picked_at ? `Handed over on ${fmtDate(bundle.picked_at)}` : "Not handed over yet", 230, 385, { width: 180, align: "right" });

        // Signatures
        doc.strokeColor("#94a3b8").moveTo(425, 360).lineTo(500, 360).stroke().moveTo(508, 360).lineTo(580, 360).stroke().strokeColor("#000000");
        doc.font("Helvetica-Bold").fontSize(5.5).text("Handed over by", 420, 364, { width: 85, align: "center" });
        doc.text("Received by (supplier)", 503, 364, { width: 80, align: "center" });
        doc.font("Helvetica").fontSize(5.5).text("Name, date & stamp", 503, 372, { width: 80, align: "center" });

        doc
          .fillColor("#475569")
          .font("Helvetica")
          .fontSize(5.5)
          .text(`${title}  |  Page ${page} of ${pages}`, 15, 402);
        doc.text(
          `Generated by ${(pharmacy?.name || "").toUpperCase()} at ${new Date().toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true })}`,
          15,
          402,
          { width: 565, align: "right" }
        );
        doc.fillColor("#000000");
      };

      for (let p = 0; p < pages; p++) {
        if (p > 0) doc.addPage();
        skeleton(p + 1);
        items.slice(p * perPage, (p + 1) * perPage).forEach((it, i) => {
          const y = 98 + i * 16 + 5;
          const upp = Number(it.units_per_pack) || 1;
          const from = (it.purchase_refs || []).map((r) => r.invoice_no || "-").join(", ");
          const vals = [
            p * perPage + i + 1,
            String(it.product_name || "-").slice(0, 34),
            it.batch_no || "-",
            fmtExpiry(it.expiry_date),
            it.quantity_units || 0,
            upp > 1 ? String(Number((Number(it.quantity_units) / upp).toFixed(1))) : "-",
            money(it.purchase_price),
            money(it.mrp),
            money(it.total_refund_amount),
            from || "-",
          ];
          let x = 10;
          vals.forEach((v, idx) => {
            doc
              .font(idx === 8 || idx === 1 ? "Helvetica-Bold" : "Helvetica")
              .fontSize(6)
              .fillColor(idx === 3 && kind === "expiry" ? "#be123c" : "#000000")
              .text(String(v), x + 3, y, { width: widths[idx] - 6, align: rightAligned(idx) ? "right" : "left", lineBreak: false, ellipsis: true });
            x += widths[idx];
          });
          doc.fillColor("#000000");
        });
      }
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { generateReturnNotePDF };
