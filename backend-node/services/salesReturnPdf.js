// Sales return (credit note) PDF, in the same A5-landscape frame as the
// purchase return note and the bill.
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

async function generateSalesReturnPDF(ret, pharmacy) {
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

      const items = ret.items || [];
      const perPage = 14;
      const pages = Math.max(1, Math.ceil(items.length / perPage));
      const title = ret.status === "Cancelled" ? "SALES RETURN (CANCELLED)" : "SALES RETURN / CREDIT NOTE";
      const refundLabel = !ret.refund_amount ? "-" : ret.refund_mode === "Advance" ? "Kept as advance" : `Refunded (${ret.refund_mode})`;

      // #, DESCRIPTION, BATCH, EXP, UNITS, PACKS, MRP/U, REFUND/U, AMOUNT, STOCK
      const widths = [14, 160, 56, 34, 38, 38, 48, 52, 60, 75];
      const headers = ["#", "DESCRIPTION", "BATCH", "EXP", "UNITS", "PACKS", "MRP/U", "REFUND/U", "AMOUNT", "STOCK"];
      const rightAligned = (i) => i >= 4 && i <= 8;

      const skeleton = (page) => {
        doc.lineWidth(1).strokeColor("#000000").fillColor("#000000");
        doc.rect(10, 10, 575, 400).stroke();
        doc.moveTo(110, 10).lineTo(110, 80).stroke();
        doc.moveTo(345, 10).lineTo(345, 80).stroke();
        doc.moveTo(10, 25).lineTo(110, 25).stroke();
        doc.moveTo(345, 25).lineTo(585, 25).stroke();
        doc.moveTo(10, 80).lineTo(585, 80).stroke();
        doc.font("Helvetica-Bold").fontSize(6).text(title, 10, 15, { width: 100, align: "center" });
        let drewLogo = false;
        if (logo) {
          try {
            doc.image(logo, 30, 28, { fit: [60, 48], align: "center", valign: "center" });
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
          doc.fillColor("#0d9488").font("Helvetica-Bold").fontSize(20).text(initials, 10, 38, { width: 100, align: "center" });
          if (initials) doc.fontSize(7).text("PHARMACY", 10, 62, { width: 100, align: "center" });
          doc.fillColor("#000000");
        }

        doc.font("Helvetica-Bold").fontSize(10).text((pharmacy?.name || "").toUpperCase(), 115, 14, { width: 225 });
        doc.font("Helvetica").fontSize(6.5).text(pharmacy?.location || "", 115, 27, { width: 225 });
        doc.font("Helvetica-Bold").fontSize(6.5).text("CONTACT  ", 115, 48, { continued: true }).font("Helvetica").text(pharmacy?.contact || "");
        doc.font("Helvetica-Bold").text("GSTIN        ", 115, 57, { continued: true }).font("Helvetica").text(pharmacy?.gst_no || "");
        doc.font("Helvetica-Bold").text("D.L. NO       ", 115, 66, { continued: true }).font("Helvetica").text(pharmacy?.license_no || "");

        doc.font("Helvetica-Bold").fontSize(6.5).text("Return No.", 349, 14);
        doc.fontSize(7.5).text(ret.return_no || "-", 392, 14, { width: 110 });
        doc.fontSize(7).text(fmtDate(ret.return_date || ret.created_at), 480, 14, { width: 100, align: "right" });
        const row = (label, value, y) => {
          doc.font("Helvetica-Bold").fontSize(6.5).text(label, 349, y);
          doc.font("Helvetica").fontSize(6.5).text(String(value || "-").toUpperCase(), 400, y, { width: 180, lineBreak: false, ellipsis: true });
        };
        row("CUSTOMER", ret.customer_name, 29);
        row("MOBILE", ret.customer_mobile, 39);
        row("AGAINST BILL", `${ret.bill_no || "-"}  (${fmtDate(ret.billing_date)})`, 49);
        row("TYPE", ret.type === "full" ? "Whole bill returned" : "Part return", 59);
        row("REASON", ret.reason, 69);

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

        doc.moveTo(225, 323).lineTo(225, 398).stroke();
        doc.moveTo(415, 323).lineTo(415, 398).stroke();
        doc.moveTo(10, 398).lineTo(585, 398).stroke();
        doc.font("Helvetica-Bold").fontSize(6.5).text("REMARKS", 15, 328);
        doc.text("E&OE", 10, 328, { width: 210, align: "right" });
        doc.font("Helvetica").fontSize(6.5).text(ret.notes || "Goods returned by the customer.", 15, 338, { width: 205, height: 34, ellipsis: true });
        doc.font("Helvetica-Bold").fontSize(6.5).text(`ITEMS: ${items.length}   TOTAL QTY: ${ret.total_units || 0} units`, 15, 376);
        doc.font("Helvetica").fontSize(6).text(`Bill total ${money(ret.bill_total_before)} -> ${money(ret.bill_total_after)}`, 15, 386);

        doc.fillColor("#f8fafc").rect(225.5, 359.5, 189, 19).fill().fillColor("#000000");
        doc.moveTo(225, 341).lineTo(415, 341).stroke();
        doc.moveTo(225, 359).lineTo(415, 359).stroke();
        doc.moveTo(225, 379).lineTo(415, 379).stroke();
        const sum = (label, value, y, bold) => {
          doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(bold ? 7.5 : 6.5).text(label, 230, y);
          doc.text(value, 230, y, { width: 180, align: "right" });
        };
        sum("Return value", money(ret.total_amount), 329);
        sum("Adjusted against dues", money(ret.adjusted_against_due), 347);
        sum(refundLabel === "-" ? "Refund" : refundLabel, `Rs ${money(ret.refund_amount)}`, 365, true);
        doc.font("Helvetica").fontSize(6).text(ret.status === "Cancelled" ? `Cancelled on ${fmtDate(ret.cancelled_at)}` : `Made by ${ret.created_by_name || "-"}`, 230, 385, { width: 180, align: "right" });

        doc.strokeColor("#94a3b8").moveTo(425, 360).lineTo(500, 360).stroke().moveTo(508, 360).lineTo(580, 360).stroke().strokeColor("#000000");
        doc.font("Helvetica-Bold").fontSize(5.5).text("Received by (pharmacy)", 420, 364, { width: 85, align: "center" });
        doc.text("Customer signature", 503, 364, { width: 80, align: "center" });

        doc.fillColor("#475569").font("Helvetica").fontSize(5.5).text(`${title}  |  Page ${page} of ${pages}`, 15, 402);
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
          const vals = [
            p * perPage + i + 1,
            String(it.product_name || "-").slice(0, 36),
            it.batch_no || "-",
            fmtExpiry(it.expiry_date),
            it.quantity || 0,
            upp > 1 ? String(Number((Number(it.quantity) / upp).toFixed(1))) : "-",
            money(it.unit_price),
            money(it.refund_per_unit),
            money(it.amount),
            it.restocked_units ? (it.written_off_units ? `${it.restocked_units} back, ${it.written_off_units} off` : "Back in stock") : "Written off",
          ];
          let cx = 10;
          vals.forEach((v, idx) => {
            doc
              .font(idx === 8 || idx === 1 ? "Helvetica-Bold" : "Helvetica")
              .fontSize(6)
              .text(String(v), cx + 3, y, { width: widths[idx] - 6, align: rightAligned(idx) ? "right" : "left", lineBreak: false, ellipsis: true });
            cx += widths[idx];
          });
        });
      }
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { generateSalesReturnPDF };
