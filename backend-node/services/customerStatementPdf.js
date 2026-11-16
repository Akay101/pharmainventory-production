// Customer account statement for a month (or any date range), as a PDF.
// Two layouts:
//   detailed: every bill, date-wise, with the items bought on it
//   summary:  one line per bill: date, bill no and amount
// Options: show the MRP (detailed: MRP per unit and line MRP value; summary:
// the MRP value of the bill) and the remaining balance (paid and due).
const PDFDocument = require("pdfkit");

const money = (n) => (Math.round((Number(n) || 0) * 100) / 100).toFixed(2);
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const fmtDate = (v) => {
  const d = new Date(v || Date.now());
  return Number.isNaN(d.getTime()) ? "-" : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

// Paid and due on one bill, the way Billing shows them
function billMoney(bill) {
  const total = r2(bill.grand_total || bill.total_amount);
  const paid = bill.is_paid ? total : r2(bill.total_paid !== undefined ? bill.total_paid : bill.advance_amount || 0);
  return { total, paid: Math.min(paid, total), due: bill.is_paid ? 0 : Math.max(0, r2(total - paid)) };
}

// MRP value of a line: quantity x MRP per unit, before any discount
const lineMrp = (it) => r2((Number(it.quantity) || 0) * (Number(it.unit_price) || 0));

function totalsOf(bills) {
  return bills.reduce(
    (t, b) => {
      const m = billMoney(b);
      t.count += 1;
      t.total = r2(t.total + m.total);
      t.paid = r2(t.paid + m.paid);
      t.due = r2(t.due + m.due);
      t.mrp = r2(t.mrp + (b.items || []).reduce((s, it) => s + lineMrp(it), 0));
      t.items += (b.items || []).length;
      return t;
    },
    { count: 0, total: 0, paid: 0, due: 0, mrp: 0, items: 0 }
  );
}

/**
 * bills: the customer's bills for the period, any order (sorted here, oldest first)
 * opts: { format: "detailed" | "summary", showMrp, showBalance, periodLabel, statusLabel }
 */
function generateCustomerStatementPDF(customer, pharmacy, bills, opts = {}) {
  const format = opts.format === "summary" ? "summary" : "detailed";
  const showMrp = !!opts.showMrp;
  const showBalance = opts.showBalance !== false;
  const sorted = [...bills].sort((a, b) =>
    String(a.billing_date || a.created_at).localeCompare(String(b.billing_date || b.created_at)) ||
    String(a.created_at).localeCompare(String(b.created_at))
  );
  const totals = totalsOf(sorted);

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 36, bufferPages: true });
      const chunks = [];
      doc.on("data", (c) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const left = 36;
      const width = doc.page.width - 72;
      const bottom = doc.page.height - 50;

      // ---- header ----
      doc.font("Helvetica-Bold").fontSize(15).fillColor("#000").text(pharmacy?.name || "Pharmacy", left, 36, { width });
      doc.font("Helvetica").fontSize(9).fillColor("#333");
      const sub = [pharmacy?.location, pharmacy?.contact ? `Ph: ${pharmacy.contact}` : "", pharmacy?.gst_no ? `GSTIN: ${pharmacy.gst_no}` : "", pharmacy?.license_no ? `DL: ${pharmacy.license_no}` : ""]
        .filter(Boolean)
        .join("  |  ");
      if (sub) doc.text(sub, left, doc.y + 2, { width });
      doc.moveDown(0.6);
      doc.font("Helvetica-Bold").fontSize(12).fillColor("#000").text(
        format === "summary" ? "ACCOUNT STATEMENT (SUMMARY)" : "ACCOUNT STATEMENT (DETAILED)",
        left,
        doc.y,
        { width, align: "center" }
      );
      doc.moveDown(0.4);
      const infoY = doc.y;
      doc.font("Helvetica-Bold").fontSize(10).text(customer.name || "Customer", left, infoY, { width: width / 2 });
      doc.font("Helvetica").fontSize(9);
      if (customer.mobile) doc.text(`Mobile: ${customer.mobile}`, left, doc.y, { width: width / 2 });
      if (customer.address) doc.text(customer.address, left, doc.y, { width: width / 2 });
      const leftEnd = doc.y;
      doc.font("Helvetica").fontSize(9).text(`Period: ${opts.periodLabel || "All bills"}`, left + width / 2, infoY, { width: width / 2, align: "right" });
      if (opts.statusLabel) doc.text(`Bills: ${opts.statusLabel}`, left + width / 2, doc.y, { width: width / 2, align: "right" });
      doc.text(`Printed: ${fmtDate(new Date())}`, left + width / 2, doc.y, { width: width / 2, align: "right" });
      doc.y = Math.max(leftEnd, doc.y) + 8;
      doc.moveTo(left, doc.y).lineTo(left + width, doc.y).lineWidth(1).strokeColor("#000").stroke();
      doc.y += 6;

      // ---- table helpers ----
      let cols = [];
      const drawRow = (cells, { bold = false, fill = null, size = 8.5 } = {}) => {
        const h = 14;
        if (doc.y + h > bottom) {
          doc.addPage();
          doc.y = 40;
          if (cols.header) drawRow(cols.header, { bold: true, fill: "#e8e8e8" });
        }
        const y = doc.y;
        if (fill) doc.rect(left, y - 2, width, h).fill(fill).fillColor("#000");
        let x = left;
        doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(size).fillColor("#000");
        cells.forEach((c, i) => {
          const col = cols[i];
          doc.text(String(c ?? ""), x + 2, y, { width: col.w - 4, align: col.align || "left", lineBreak: false, ellipsis: true });
          x += col.w;
        });
        doc.y = y + h;
      };
      const setCols = (list, header) => {
        const fixed = list.reduce((s, c) => s + (c.w || 0), 0);
        const flex = list.filter((c) => !c.w).length || 1;
        cols = list.map((c) => ({ ...c, w: c.w || (width - fixed) / flex }));
        cols.header = header;
      };

      if (format === "summary") {
        const list = [
          { w: 26, align: "right" },
          { w: 70 },
          {},
          { w: 40, align: "right" },
          ...(showMrp ? [{ w: 66, align: "right" }] : []),
          { w: 70, align: "right" },
          ...(showBalance ? [{ w: 62, align: "right" }, { w: 62, align: "right" }] : []),
        ];
        const header = ["#", "DATE", "BILL NO", "ITEMS", ...(showMrp ? ["MRP VALUE"] : []), "AMOUNT", ...(showBalance ? ["PAID", "BALANCE"] : [])];
        setCols(list, header);
        drawRow(header, { bold: true, fill: "#e8e8e8" });
        sorted.forEach((b, i) => {
          const m = billMoney(b);
          const mrp = (b.items || []).reduce((s, it) => s + lineMrp(it), 0);
          drawRow(
            [i + 1, fmtDate(b.billing_date || b.created_at), b.bill_no, (b.items || []).length, ...(showMrp ? [money(mrp)] : []), money(m.total), ...(showBalance ? [money(m.paid), money(m.due)] : [])],
            { fill: i % 2 ? "#f7f7f7" : null }
          );
        });
      } else {
        const list = [
          { w: 22, align: "right" },
          {},
          { w: 58 },
          { w: 34, align: "right" },
          ...(showMrp ? [{ w: 54, align: "right" }, { w: 60, align: "right" }] : []),
          { w: 40, align: "right" },
          { w: 64, align: "right" },
        ];
        const header = ["#", "PRODUCT", "BATCH", "QTY", ...(showMrp ? ["MRP/UNIT", "MRP VALUE"] : []), "DISC%", "AMOUNT"];
        setCols(list, header);
        sorted.forEach((b) => {
          const m = billMoney(b);
          if (doc.y + 50 > bottom) {
            doc.addPage();
            doc.y = 40;
          }
          doc.font("Helvetica-Bold").fontSize(9.5).fillColor("#000").text(
            `${fmtDate(b.billing_date || b.created_at)}   ·   Bill ${b.bill_no}${b.doctor ? `   ·   Dr ${b.doctor}` : ""}`,
            left,
            doc.y,
            { width }
          );
          doc.y += 2;
          cols.header = header;
          drawRow(header, { bold: true, fill: "#e8e8e8", size: 8 });
          (b.items || []).forEach((it, i) => {
            drawRow([
              i + 1,
              it.product_name,
              it.batch_no || "-",
              it.quantity,
              ...(showMrp ? [money(it.unit_price), money(lineMrp(it))] : []),
              Number(it.discount_percent) ? `${Number(it.discount_percent)}` : "-",
              money(it.item_total),
            ]);
          });
          const parts = [];
          if (Number(b.discount_amount) > 0) parts.push(`Bill discount -${money(b.discount_amount)}`);
          parts.push(`Bill total ${money(m.total)}`);
          if (showBalance) parts.push(`Paid ${money(m.paid)}`, `Balance ${money(m.due)}`);
          doc.font("Helvetica-Bold").fontSize(8.5).text(parts.join("    "), left, doc.y + 1, { width, align: "right" });
          doc.y += 8;
          doc.moveTo(left, doc.y).lineTo(left + width, doc.y).lineWidth(0.4).strokeColor("#999").stroke();
          doc.y += 6;
        });
      }

      if (!sorted.length) {
        doc.font("Helvetica").fontSize(10).text("No bills in this period.", left, doc.y + 10, { width, align: "center" });
      }

      // ---- totals ----
      if (doc.y + 70 > bottom) {
        doc.addPage();
        doc.y = 40;
      }
      doc.y += 8;
      const boxY = doc.y;
      const lines = [
        ["Bills", String(totals.count)],
        ...(showMrp ? [["MRP value", money(totals.mrp)]] : []),
        ["Total billed", money(totals.total)],
        ...(showBalance ? [["Paid", money(totals.paid)], ["Balance due", money(totals.due)]] : []),
      ];
      const boxW = 220;
      doc.rect(left + width - boxW, boxY, boxW, lines.length * 15 + 8).lineWidth(1).strokeColor("#000").stroke();
      lines.forEach(([k, v], i) => {
        const y = boxY + 6 + i * 15;
        const last = i === lines.length - 1;
        doc.font(last ? "Helvetica-Bold" : "Helvetica").fontSize(9.5).fillColor("#000");
        doc.text(k, left + width - boxW + 8, y, { width: 110 });
        doc.text(v, left + width - 110, y, { width: 102, align: "right" });
      });

      // page numbers
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        doc.page.margins.bottom = 0; // the footer sits in the margin; don't let it open a page
        doc.font("Helvetica").fontSize(7.5).fillColor("#666").text(`Page ${i + 1} of ${range.count}`, left, doc.page.height - 34, { width, align: "right", lineBreak: false });
      }
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { generateCustomerStatementPDF, billMoney, totalsOf };
