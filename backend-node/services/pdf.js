const PDFDocument = require("pdfkit");

const generateBillPDF = async (bill, pharmacy) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 50 });
      const chunks = [];

      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      // Get total amount (supports both grand_total and total_amount)
      const grandTotal = bill.grand_total || bill.total_amount || 0;
      const subtotal = bill.subtotal || grandTotal;
      const discountAmount = bill.discount_amount || 0;

      // Header
      doc
        .fontSize(20)
        .font("Helvetica-Bold")
        .text(pharmacy?.name || "Pharmalogy", { align: "center" });
      doc
        .fontSize(10)
        .font("Helvetica")
        .text(pharmacy?.location || "", { align: "center" });
      if (pharmacy?.license_no) {
        doc.text(`License: ${pharmacy.license_no}`, { align: "center" });
      }

      doc.moveDown();
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown();

      // Bill Info
      doc
        .fontSize(14)
        .font("Helvetica-Bold")
        .text("BILL / INVOICE", { align: "center" });
      doc.moveDown();

      doc.fontSize(10).font("Helvetica");
      doc.text(`Bill No: ${bill.bill_no}`, 50);
      doc.text(
        `Date: ${new Date(bill.created_at).toLocaleDateString("en-IN")}`,
        50
      );
      doc.moveDown();

      // Customer Info
      doc.font("Helvetica-Bold").text("Customer Details:");
      doc.font("Helvetica");
      doc.text(`Name: ${bill.customer_name}`);
      if (bill.customer_mobile) doc.text(`Mobile: ${bill.customer_mobile}`);
      doc.moveDown();

      // Items Table Header
      const tableTop = doc.y;
      const tableHeaders = [
        "#",
        "Product",
        "Batch",
        "Qty",
        "Rate",
        "Disc%",
        "Amount",
      ];
      const colWidths = [30, 180, 70, 40, 60, 50, 65];
      let xPos = 50;

      doc.font("Helvetica-Bold").fontSize(9);
      doc.rect(50, tableTop, 495, 20).fill("#7c3aed");
      doc.fillColor("white");

      tableHeaders.forEach((header, i) => {
        doc.text(header, xPos + 5, tableTop + 5, {
          width: colWidths[i] - 10,
          align: i > 2 ? "right" : "left",
        });
        xPos += colWidths[i];
      });

      doc.fillColor("black").font("Helvetica").fontSize(9);
      let yPos = tableTop + 25;

      // Items
      bill.items.forEach((item, index) => {
        if (yPos > 700) {
          doc.addPage();
          yPos = 50;
        }

        xPos = 50;
        const unitPrice = item.unit_price || item.mrp_per_unit || 0;
        const qty = item.quantity || item.sold_units || 1;
        const itemTotal =
          item.total ||
          item.item_total ||
          qty * unitPrice * (1 - (item.discount_percent || 0) / 100);
        const rowData = [
          (index + 1).toString(),
          item.product_name?.substring(0, 30) || "",
          item.batch_no || "-",
          qty.toString(),
          `Rs.${unitPrice.toFixed(2)}`,
          `${item.discount_percent || 0}%`,
          `Rs.${itemTotal.toFixed(2)}`,
        ];

        rowData.forEach((cell, i) => {
          doc.text(cell, xPos + 5, yPos, {
            width: colWidths[i] - 10,
            align: i > 2 ? "right" : "left",
          });
          xPos += colWidths[i];
        });

        yPos += 18;
      });

      // Totals
      doc.moveDown(2);
      const totalsX = 380;
      doc.y = yPos + 20;

      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown();

      doc.font("Helvetica").fontSize(10);
      doc.text(`Subtotal:`, totalsX, doc.y, { continued: true });
      doc.text(`Rs.${subtotal.toFixed(2)}`, { align: "right" });

      if (discountAmount > 0) {
        doc.text(`Discount:`, totalsX, doc.y, { continued: true });
        doc.text(`-Rs.${discountAmount.toFixed(2)}`, { align: "right" });
      }

      doc.moveDown();
      doc.font("Helvetica-Bold").fontSize(12);
      doc.text(`Grand Total:`, totalsX, doc.y, { continued: true });
      doc.text(`Rs.${grandTotal.toFixed(2)}`, { align: "right" });

      // Payment Status
      doc.moveDown(2);
      doc.fontSize(10).font("Helvetica");
      const statusColor = bill.is_paid ? "#22c55e" : "#ef4444";
      doc
        .fillColor(statusColor)
        .text(`Payment Status: ${bill.is_paid ? "PAID" : "UNPAID"}`, {
          align: "center",
        });

      // Footer
      doc.fillColor("black");
      doc.moveDown(2);
      doc.fontSize(8).text("Thank you for your purchase!", { align: "center" });
      doc.text("This is a computer generated bill.", { align: "center" });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

module.exports = { generateBillPDF };
