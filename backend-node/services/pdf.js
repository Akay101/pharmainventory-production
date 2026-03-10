const PDFDocument = require("pdfkit");

const generateBillPDF = async (bill, pharmacy) => {
  return new Promise((resolve, reject) => {
    try {
      const PDFDocument = require("pdfkit");

      const doc = new PDFDocument({ size: "A4", margin: 50 });
      const chunks = [];

      doc.on("data", (c) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const startX = 50;
      const pageWidth = 495;

      const currency = (v) => `Rs.${Number(v || 0).toFixed(2)}`;

      const grandTotal = bill.grand_total || bill.total_amount || 0;
      const subtotal = bill.subtotal || grandTotal;
      const discountAmount = bill.discount_amount || 0;

      /* ---------- HEADER ---------- */

      doc
        .fontSize(20)
        .font("Helvetica-Bold")
        .text(pharmacy?.name || "Pharmalogy", { align: "center" });

      doc.fontSize(10).font("Helvetica");

      if (pharmacy?.location) doc.text(pharmacy.location, { align: "center" });

      if (pharmacy?.license_no)
        doc.text(`License: ${pharmacy.license_no}`, { align: "center" });

      doc.moveDown();

      doc
        .moveTo(startX, doc.y)
        .lineTo(startX + pageWidth, doc.y)
        .stroke();

      doc.moveDown();

      doc
        .fontSize(14)
        .font("Helvetica-Bold")
        .text("BILL / INVOICE", { align: "center" });

      doc.moveDown();

      doc.fontSize(10).font("Helvetica");

      doc.text(`Bill No: ${bill.bill_no}`);
      doc.text(
        `Date: ${new Date(bill.created_at).toLocaleDateString("en-IN")}`
      );

      doc.moveDown();

      doc.font("Helvetica-Bold").text("Customer Details:");
      doc.font("Helvetica");
      doc.text(`Name: ${bill.customer_name}`);
      if (bill.customer_mobile) doc.text(`Mobile: ${bill.customer_mobile}`);

      doc.moveDown(1.5);

      /* ---------- TABLE CONFIG ---------- */

      const headers = [
        "#",
        "Product",
        "Batch",
        "Qty",
        "Rate",
        "Disc%",
        "Amount",
      ];

      // EXACT WIDTH SUM = 495
      const columnWidths = [35, 195, 65, 45, 60, 45, 50];

      const rowHeight = 22;

      let y = doc.y;

      /* ---------- HEADER DRAW ---------- */

      const drawHeader = () => {
        let x = startX;

        doc.rect(startX, y, pageWidth, rowHeight).fill("#7c3aed");

        doc.fillColor("white").font("Helvetica-Bold").fontSize(9);

        headers.forEach((header, i) => {
          doc.text(header, x + 4, y + 6, {
            width: columnWidths[i] - 8,
            align: i >= 3 ? "right" : "left",
            lineBreak: false,
          });

          x += columnWidths[i];
        });

        doc.fillColor("black");

        x = startX;

        columnWidths.forEach((w) => {
          doc
            .moveTo(x, y)
            .lineTo(x, y + rowHeight)
            .stroke();
          x += w;
        });

        doc
          .moveTo(startX + pageWidth, y)
          .lineTo(startX + pageWidth, y + rowHeight)
          .stroke();

        y += rowHeight;
      };

      drawHeader();

      /* ---------- ROWS ---------- */

      doc.font("Helvetica").fontSize(9);

      bill.items.forEach((item, index) => {
        if (y + rowHeight > 740) {
          doc.addPage();
          y = 50;
          drawHeader();
        }

        let x = startX;

        const unitPrice = item.unit_price || item.mrp_per_unit || 0;
        const qty = item.quantity || item.sold_units || 1;

        const total =
          item.total ||
          item.item_total ||
          qty * unitPrice * (1 - (item.discount_percent || 0) / 100);

        const row = [
          index + 1,
          item.product_name || "",
          item.batch_no || "-",
          qty,
          currency(unitPrice),
          `${item.discount_percent || 0}%`,
          currency(total),
        ];

        doc.rect(startX, y, pageWidth, rowHeight).stroke();

        row.forEach((cell, i) => {
          const text = i === 1 ? String(cell).substring(0, 38) : String(cell);

          doc.text(text, x + 4, y + 6, {
            width: columnWidths[i] - 8,
            align: i >= 3 ? "right" : "left",
            lineBreak: false,
          });

          x += columnWidths[i];
        });

        x = startX;

        columnWidths.forEach((w) => {
          doc
            .moveTo(x, y)
            .lineTo(x, y + rowHeight)
            .stroke();
          x += w;
        });

        doc
          .moveTo(startX + pageWidth, y)
          .lineTo(startX + pageWidth, y + rowHeight)
          .stroke();

        y += rowHeight;
      });

      /* ---------- TOTALS ---------- */

      doc
        .moveTo(startX, y + 5)
        .lineTo(startX + pageWidth, y + 5)
        .stroke();

      doc.moveDown();

      doc.font("Helvetica").fontSize(10);

      doc.text(`Subtotal: ${currency(subtotal)}`, startX, y + 15, {
        align: "right",
      });

      if (discountAmount > 0) {
        doc.text(`Discount: -${currency(discountAmount)}`, startX, y + 30, {
          align: "right",
        });
      }

      doc.font("Helvetica-Bold").fontSize(12);

      doc.text(`Grand Total: ${currency(grandTotal)}`, startX, y + 50, {
        align: "right",
      });

      /* ---------- PAYMENT STATUS ---------- */

      doc.moveDown(2);

      const statusColor = bill.is_paid ? "#22c55e" : "#ef4444";

      doc
        .fillColor(statusColor)
        .fontSize(10)
        .text(`Payment Status: ${bill.is_paid ? "PAID" : "UNPAID"}`, {
          align: "center",
        });

      doc.fillColor("black");

      /* ---------- FOOTER ---------- */

      doc.moveDown(2);

      doc.fontSize(8).text("Thank you for your purchase!", { align: "center" });

      doc.text("This is a computer generated bill.", {
        align: "center",
      });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};

const generatePurchasePDF = async (purchase, pharmacy) => {
  return new Promise((resolve, reject) => {
    try {
      const PDFDocument = require("pdfkit");

      const doc = new PDFDocument({ size: "A4", margin: 50 });
      const chunks = [];

      doc.on("data", (c) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const startX = 50;
      const pageWidth = 495;

      const currency = (v) => `Rs.${Number(v || 0).toFixed(2)}`;

      const totalAmount = purchase.total_amount || 0;

      /* ---------- HEADER ---------- */

      doc
        .fontSize(20)
        .font("Helvetica-Bold")
        .text(pharmacy?.name || "Pharmalogy", { align: "center" });

      doc.fontSize(10).font("Helvetica");

      if (pharmacy?.location) doc.text(pharmacy.location, { align: "center" });

      if (pharmacy?.license_no)
        doc.text(`License: ${pharmacy.license_no}`, { align: "center" });

      doc.moveDown();

      doc
        .moveTo(startX, doc.y)
        .lineTo(startX + pageWidth, doc.y)
        .stroke();

      doc.moveDown();

      doc
        .fontSize(14)
        .font("Helvetica-Bold")
        .text("PURCHASE INVOICE", { align: "center" });

      doc.moveDown();

      doc.fontSize(10).font("Helvetica");

      doc.text(`Invoice No: ${purchase.invoice_no || "-"}`);
      doc.text(`Supplier: ${purchase.supplier_name || "-"}`);
      doc.text(
        `Date: ${new Date(
          purchase.purchase_date || purchase.created_at
        ).toLocaleDateString("en-IN")}`
      );

      doc.moveDown(1.5);

      /* ---------- TABLE CONFIG ---------- */

      const headers = [
        "#",
        "Product",
        "Batch",
        "Expiry",
        "Pack Qty",
        "Pack Price",
        "Amount",
      ];

      const columnWidths = [35, 165, 65, 70, 55, 55, 50];

      const rowHeight = 22;

      let y = doc.y;

      /* ---------- HEADER DRAW ---------- */

      const drawHeader = () => {
        let x = startX;

        doc.rect(startX, y, pageWidth, rowHeight).fill("#2f63d6");

        doc.fillColor("white").font("Helvetica-Bold").fontSize(9);

        headers.forEach((h, i) => {
          doc.text(h, x + 4, y + 6, {
            width: columnWidths[i] - 8,
            align: i >= 4 ? "right" : "left",
            lineBreak: false,
          });

          x += columnWidths[i];
        });

        doc.fillColor("black");

        x = startX;

        columnWidths.forEach((w) => {
          doc
            .moveTo(x, y)
            .lineTo(x, y + rowHeight)
            .stroke();
          x += w;
        });

        doc
          .moveTo(startX + pageWidth, y)
          .lineTo(startX + pageWidth, y + rowHeight)
          .stroke();

        y += rowHeight;
      };

      drawHeader();

      /* ---------- ROWS ---------- */

      doc.font("Helvetica").fontSize(9);

      purchase.items.forEach((item, index) => {
        if (y + rowHeight > 740) {
          doc.addPage();
          y = 50;
          drawHeader();
        }

        let x = startX;

        const qty = item.pack_quantity || 1;
        const price = item.pack_price || 0;
        const total = item.item_total || qty * price;

        const row = [
          index + 1,
          item.product_name || "",
          item.batch_no || "-",
          item.expiry_date || "-",
          qty,
          currency(price),
          currency(total),
        ];

        doc.rect(startX, y, pageWidth, rowHeight).stroke();

        row.forEach((cell, i) => {
          const text = i === 1 ? String(cell).substring(0, 35) : String(cell);

          doc.text(text, x + 4, y + 6, {
            width: columnWidths[i] - 8,
            align: i >= 4 ? "right" : "left",
            lineBreak: false,
          });

          x += columnWidths[i];
        });

        x = startX;

        columnWidths.forEach((w) => {
          doc
            .moveTo(x, y)
            .lineTo(x, y + rowHeight)
            .stroke();
          x += w;
        });

        doc
          .moveTo(startX + pageWidth, y)
          .lineTo(startX + pageWidth, y + rowHeight)
          .stroke();

        y += rowHeight;
      });

      /* ---------- TOTAL ---------- */

      doc
        .moveTo(startX, y + 5)
        .lineTo(startX + pageWidth, y + 5)
        .stroke();

      doc.font("Helvetica-Bold").fontSize(12);

      doc.text(`Total Amount: ${currency(totalAmount)}`, startX, y + 15, {
        align: "right",
      });

      /* ---------- FOOTER ---------- */

      doc.moveDown(3);

      doc
        .font("Helvetica")
        .fontSize(8)
        .text("Purchase record generated by Pharmalogy", {
          align: "center",
        });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};
module.exports = { generateBillPDF, generatePurchasePDF };
