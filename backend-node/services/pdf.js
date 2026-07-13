const PDFDocument = require("pdfkit");

const generateBillPDF = async (bill, pharmacy) => {
  return new Promise(async (resolve, reject) => {
    try {
      const PDFDocument = require("pdfkit");
      const https = require("https");
      const mongoose = require("mongoose");

      const db = mongoose.connection.db;
      let customer = null;
      if (db && bill.customer_id) {
        customer = await db
          .collection("customers")
          .findOne({ id: bill.customer_id });
      }

      const enrichedItems = [];
      for (const item of bill.items) {
        let inv = null;
        if (item.inventory_id && !item.inventory_id.startsWith("negative-")) {
          inv = await db
            .collection("inventory")
            .findOne({ id: item.inventory_id });
        }

        let hsn = item.hsn_no || inv?.hsn_no || "-";
        if (hsn === "-" && inv?.product_id) {
          const prod = await db
            .collection("products")
            .findOne({ id: inv.product_id });
          if (prod && prod.hsn_no) {
            hsn = prod.hsn_no;
          }
        }

        enrichedItems.push({
          ...item,
          manufacturer: item.manufacturer || inv?.manufacturer || "-",
          hsn_no: hsn,
          expiry_date: item.expiry_date || inv?.expiry_date || "-",
        });
      }

      const fetchImageBuffer = (url) => {
        return new Promise((resResolve) => {
          https
            .get(url, { timeout: 3000 }, (res) => {
              if (res.statusCode !== 200) {
                resResolve(null);
                return;
              }
              const data = [];
              res.on("data", (chunk) => data.push(chunk));
              res.on("end", () => resResolve(Buffer.concat(data)));
            })
            .on("error", () => resResolve(null));
        });
      };

      let logoBuffer = null;
      if (pharmacy?.logo_url) {
        const rawBuffer = await fetchImageBuffer(pharmacy.logo_url);
        if (rawBuffer) {
          try {
            const sharp = require("sharp");
            logoBuffer = await sharp(rawBuffer).png().toBuffer();
          } catch (sharpErr) {
            console.error("Logo sharp conversion failed:", sharpErr);
            logoBuffer = rawBuffer;
          }
        }
      }

      const doc = new PDFDocument({
        size: "A5",
        layout: "landscape",
        margin: 10,
        compress: false,
      });
      const chunks = [];

      doc.on("data", (c) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const itemsPerPage = 15;
      const totalPages = Math.ceil(enrichedItems.length / itemsPerPage) || 1;

      const formatExpiry = (exp) => {
        if (!exp || exp === "-") return "-";
        if (/^\d{2}\/\d{2}$/.test(exp) || /^\d{2}\/\d{4}$/.test(exp))
          return exp;
        const d = new Date(exp);
        if (isNaN(d.getTime())) return exp;
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const yy = String(d.getFullYear()).substring(2);
        return `${mm}/${yy}`;
      };

      let totalQty = 0;
      enrichedItems.forEach((item) => {
        totalQty += item.quantity || 1;
      });

      const columnWidths = [15, 190, 65, 30, 45, 30, 20, 45, 25, 30, 80];
      const tableHeaders = [
        "#",
        "DESCRIPTION",
        "COMP",
        "HSN",
        "BATCH",
        "EXP",
        "QTY",
        "MRP",
        "DIS %",
        "GST %",
        "AMT",
      ];

      const drawPageSkeleton = (pageNum, total) => {
        doc.lineWidth(1);
        doc.strokeColor("#000000");

        // 1. Outer Border
        doc.rect(10, 10, 575, 400).stroke();

        // 2. Header Panel Borders
        doc.moveTo(110, 10).lineTo(110, 80).stroke();
        doc.moveTo(345, 10).lineTo(345, 80).stroke();
        doc.moveTo(10, 25).lineTo(110, 25).stroke();
        doc.moveTo(345, 25).lineTo(585, 25).stroke();
        doc.moveTo(10, 80).lineTo(585, 80).stroke();

        // Left Header Panel: Logo/Initials
        doc.fillColor("#000000");
        doc
          .font("Helvetica-Bold")
          .fontSize(7)
          .text("BILL OF SUPPLY", 10, 15, { width: 100, align: "center" });

        const drawVectorMonogram = () => {
          const initials = pharmacy?.name
            ? pharmacy.name
                .split(" ")
                .map((w) => w[0])
                .join("")
                .substring(0, 2)
                .toUpperCase()
            : "";
          doc
            .fillColor("#16a34a")
            .font("Helvetica-Bold")
            .fontSize(20)
            .text(initials, 10, 38, { width: 100, align: "center" });
          if (initials) {
            doc
              .fillColor("#16a34a")
              .font("Helvetica-Bold")
              .fontSize(7)
              .text("PHARMACY", 10, 62, { width: 100, align: "center" });
          }
        };

        if (logoBuffer) {
          try {
            doc.image(logoBuffer, 30, 28, { width: 60, height: 48 });
          } catch (err) {
            drawVectorMonogram();
          }
        } else {
          drawVectorMonogram();
        }

        // Center Header Panel: Pharmacy metadata
        doc.fillColor("#000000");
        doc
          .font("Helvetica-Bold")
          .fontSize(10)
          .text((pharmacy?.name || "").toUpperCase(), 115, 14);
        doc
          .font("Helvetica")
          .fontSize(6.5)
          .text(pharmacy?.location || "", 115, 26, { width: 225 });

        doc
          .font("Helvetica-Bold")
          .fontSize(6.5)
          .text("CONTACT  ", 115, 48, { continued: true })
          .font("Helvetica")
          .text(pharmacy?.contact || "");
        doc
          .font("Helvetica-Bold")
          .text("GSTIN        ", 115, 57, { continued: true })
          .font("Helvetica")
          .text(pharmacy?.gst_no || "");

        // Right Header Panel: Customer and Billing details
        const billDate = new Date(bill.created_at || bill.billing_date || new Date());
        const billDateFormatted = isNaN(billDate.getTime())
          ? "-"
          : billDate.toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            }).replace(/ /g, "-");
        const billTimeFormatted = isNaN(billDate.getTime())
          ? ""
          : billDate.toLocaleTimeString("en-IN", {
              hour: "2-digit",
              minute: "2-digit",
              hour12: true,
            });
        const billTimestamp = billTimeFormatted
          ? `${billDateFormatted} ${billTimeFormatted}`
          : billDateFormatted;

        doc.fillColor("#000000");
        doc.font("Helvetica-Bold").fontSize(6.5).text("Serial No.", 349, 14);
        doc
          .font("Helvetica-Bold")
          .fontSize(7.5)
          .text(bill.bill_no || "-", 395, 14, { width: 85 });
        doc
          .font("Helvetica-Bold")
          .fontSize(7)
          .text(billTimestamp, 480, 14, { width: 100, align: "right" });

        doc.font("Helvetica-Bold").fontSize(6.5).text("PATIENT", 349, 29);
        doc
          .font("Helvetica")
          .fontSize(6.5)
          .text((bill.customer_name || "Walk-in").toUpperCase(), 395, 29, {
            width: 185,
          });

        doc.font("Helvetica-Bold").fontSize(6.5).text("ADDRESS", 349, 39);
        doc
          .font("Helvetica")
          .fontSize(6.5)
          .text((customer?.address || "").toUpperCase(), 395, 39, {
            width: 185,
          });

        doc.font("Helvetica-Bold").fontSize(6.5).text("CONTACT", 349, 49);
        doc
          .font("Helvetica")
          .fontSize(6.5)
          .text(customer?.mobile || bill.customer_mobile || "", 395, 49, {
            continued: true,
          });
        doc
          .font("Helvetica-Bold")
          .text("         POS   ", { continued: true })
          .font("Helvetica")
          .text(bill.pos || "");

        doc.font("Helvetica-Bold").fontSize(6.5).text("DOCTOR", 349, 59);
        doc
          .font("Helvetica")
          .fontSize(6.5)
          .text((bill.doctor || "").toUpperCase(), 395, 59, { width: 185 });

        // 3. Table Structure
        doc.rect(10, 80, 575, 18).stroke();
        let currentX = 10;
        tableHeaders.forEach((th, idx) => {
          const isRightAlign = idx >= 6;
          doc.fillColor("#000000");
          doc
            .font("Helvetica-Bold")
            .fontSize(6.5)
            .text(th, currentX + 3, 86, {
              width: columnWidths[idx] - (idx === 10 ? 10 : 6),
              align: isRightAlign ? "right" : "left",
            });
          currentX += columnWidths[idx];
        });

        doc.moveTo(10, 98).lineTo(585, 98).stroke();
        doc.moveTo(10, 323).lineTo(585, 323).stroke();

        let divX = 10;
        columnWidths.forEach((w) => {
          divX += w;
          if (divX < 585) {
            doc.moveTo(divX, 80).lineTo(divX, 323).stroke();
          }
        });

        // 4. Footer Structure
        doc.moveTo(195, 323).lineTo(195, 398).stroke();
        doc.moveTo(395, 323).lineTo(395, 398).stroke();
        doc.moveTo(455, 323).lineTo(455, 398).stroke();
        doc.moveTo(10, 398).lineTo(585, 398).stroke();

        // Panel 1 Remarks
        doc.fillColor("#000000");
        doc.font("Helvetica-Bold").fontSize(6.5).text("REMARKS", 15, 328);
        doc
          .font("Helvetica-Bold")
          .fontSize(6.5)
          .text("E&OE", 10, 328, { width: 180, align: "right" });
        doc
          .font("Helvetica")
          .fontSize(6.5)
          .text(bill.notes || "We Wish for your speedy recovery!", 15, 338, {
            width: 175,
          });
        doc
          .font("Helvetica-Bold")
          .fontSize(6.5)
          .text(
            `PRODUCTS: ${enrichedItems.length}, TOTAL QTY: ${totalQty}`,
            15,
            386
          );

        // Panel 2 Bank
        const bankName = pharmacy?.bank_name || "";
        const bankIfsc = pharmacy?.bank_ifsc || "";
        const bankAcc = pharmacy?.bank_acc_no || "";
        const bankHolder = pharmacy?.bank_holder || "";
        const bankUpi = pharmacy?.upi_id || "";

        if (bankName || bankIfsc || bankAcc || bankHolder || bankUpi) {
          doc
            .font("Helvetica-Bold")
            .fontSize(6.5)
            .text("BANK DETAIL", 200, 328);
          if (bankName)
            doc
              .font("Helvetica-Bold")
              .fontSize(6)
              .text(bankName.toUpperCase(), 200, 338, { width: 190 });

          if (bankIfsc) {
            doc
              .font("Helvetica-Bold")
              .fontSize(6)
              .text("IFSC", 200, 350, { continued: true })
              .font("Helvetica")
              .text(`   ${bankIfsc}`);
          }
          if (bankAcc) {
            doc
              .font("Helvetica-Bold")
              .fontSize(6)
              .text("A/C No", 200, 362, { continued: true })
              .font("Helvetica")
              .text(` ${bankAcc}`);
          }
          if (bankHolder) {
            doc
              .font("Helvetica-Bold")
              .fontSize(6)
              .text("Holder", 200, 374, { continued: true })
              .font("Helvetica")
              .text(` ${bankHolder}`);
          }
          if (bankUpi) {
            doc
              .font("Helvetica-Bold")
              .fontSize(6)
              .text("UPI ID", 200, 386, { continued: true })
              .font("Helvetica")
              .text(` ${bankUpi}`);
          }
        }

        // Panel 3 QR & Sign
        const sigInitials = pharmacy?.name
          ? pharmacy.name
              .split(" ")
              .map((w) => w[0])
              .join("")
              .substring(0, 2)
              .toUpperCase()
          : "";
        if (bankUpi) {
          const qrX = 407;
          const qrY = 328;
          doc.rect(qrX, qrY, 36, 36).stroke();

          doc.fillColor("#000000");
          doc.rect(qrX + 2, qrY + 2, 8, 8).fill();
          doc
            .rect(qrX + 4, qrY + 4, 4, 4)
            .fillColor("white")
            .fill();
          doc
            .rect(qrX + 5, qrY + 5, 2, 2)
            .fillColor("black")
            .fill();

          doc.rect(qrX + 26, qrY + 2, 8, 8).fill();
          doc
            .rect(qrX + 28, qrY + 4, 4, 4)
            .fillColor("white")
            .fill();
          doc
            .rect(qrX + 29, qrY + 5, 2, 2)
            .fillColor("black")
            .fill();

          doc.rect(qrX + 2, qrY + 26, 8, 8).fill();
          doc
            .rect(qrX + 4, qrY + 28, 4, 4)
            .fillColor("white")
            .fill();
          doc
            .rect(qrX + 5, qrY + 29, 2, 2)
            .fillColor("black")
            .fill();

          const dots = [
            [15, 5],
            [18, 7],
            [22, 4],
            [14, 12],
            [20, 15],
            [24, 12],
            [4, 15],
            [7, 18],
            [11, 20],
            [15, 22],
            [18, 20],
            [22, 24],
            [15, 29],
            [19, 31],
            [24, 28],
            [29, 15],
            [31, 20],
            [28, 22],
          ];
          doc.fillColor("black");
          dots.forEach(([dx, dy]) => {
            doc.rect(qrX + dx, qrY + dy, 2, 2).fill();
          });
        }

        doc.strokeColor("#000000");
        doc
          .fillColor("#000000")
          .font("Helvetica-Bold")
          .fontSize(5.5)
          .text("Authorized Sign", 395, 387, { width: 60, align: "center" });

        // Panel 4 Totals
        doc.fillColor("#f8fafc").rect(455.5, 359.5, 129, 19).fill();

        doc.fillColor("#000000");
        doc.moveTo(455, 341).lineTo(585, 341).stroke();
        doc.moveTo(455, 359).lineTo(585, 359).stroke();
        doc.moveTo(455, 379).lineTo(585, 379).stroke();

        const discountAmount = bill.discount_amount || 0;
        const grandTotal = bill.grand_total || bill.total_amount || 0;
        const subtotal = bill.subtotal || grandTotal + discountAmount;

        doc.font("Helvetica").fontSize(6.5).text("Subtotal", 460, 329);
        doc
          .font("Helvetica")
          .fontSize(6.5)
          .text(Number(subtotal).toFixed(1), 460, 329, {
            width: 120,
            align: "right",
          });

        doc.font("Helvetica").fontSize(6.5).text("Your Savings", 460, 347);
        doc
          .font("Helvetica")
          .fontSize(6.5)
          .text(Number(discountAmount).toFixed(1), 460, 347, {
            width: 120,
            align: "right",
          });

        doc.font("Helvetica-Bold").fontSize(7.5).text("To Pay", 460, 365);
        doc
          .font("Helvetica-Bold")
          .fontSize(7.5)
          .text(`Rs ${Number(grandTotal).toFixed(2)}`, 460, 365, {
            width: 120,
            align: "right",
          });

        doc.font("Helvetica-Bold").fontSize(6.5).text("Paid/Balance", 460, 385);
        const paidVal = bill.is_paid ? grandTotal : 0;
        const balVal = bill.is_paid ? 0 : grandTotal;
        doc
          .font("Helvetica")
          .fontSize(6.5)
          .text(`${paidVal.toFixed(2)}/${balVal.toFixed(2)}`, 460, 385, {
            width: 120,
            align: "right",
          });

        // Bottom Metadata
        doc
          .fillColor("#475569")
          .font("Helvetica")
          .fontSize(5.5)
          .text(
            `ORIGINAL / DUPLICATE / TRIPLICATE  |  Page ${pageNum} of ${total}`,
            15,
            402
          );

        const timestamp = new Date().toLocaleString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        });
        const pharmName = (pharmacy?.name || "JK Pharmacy").toUpperCase();
        doc.text(`Generated by ${pharmName} at ${timestamp}`, 15, 402, {
          width: 565,
          align: "right",
        });
      };

      for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
        if (pageIdx > 0) {
          doc.addPage();
        }

        drawPageSkeleton(pageIdx + 1, totalPages);

        const pageItems = enrichedItems.slice(
          pageIdx * itemsPerPage,
          (pageIdx + 1) * itemsPerPage
        );

        doc.fillColor("#000000");
        pageItems.forEach((item, itemIdx) => {
          const indexInBill = pageIdx * itemsPerPage + itemIdx;
          const rowY = 98 + itemIdx * 15 + 4;

          const unitPrice = item.unit_price || item.mrp_per_unit || 0;
          const qty = item.quantity || item.sold_units || 1;
          const disc = item.discount_percent || 0;
          const rate = unitPrice * (1 - disc / 100);
          const total =
            item.item_total !== undefined
              ? item.item_total
              : qty * unitPrice * (1 - disc / 100);

          const gstPercent = (item.cgst || 0) + (item.sgst || 0);

          const vals = [
            indexInBill + 1,
            (item.product_name || "-").substring(0, 38),
            (item.manufacturer || "-").substring(0, 15),
            item.hsn_no || "-",
            item.batch_no || "-",
            formatExpiry(item.expiry_date),
            qty,
            unitPrice.toFixed(1),
            disc.toFixed(1),
            gstPercent.toFixed(1),
            total.toFixed(2),
          ];

          let currentX = 10;
          vals.forEach((val, idx) => {
            const isRightAlign = idx >= 6;
            const isHighlighted = idx === 7;
            doc
              .font(isHighlighted ? "Helvetica-Bold" : "Helvetica")
              .fontSize(6)
              .text(String(val), currentX + 3, rowY, {
                width: columnWidths[idx] - (idx === 10 ? 10 : 6),
                align: isRightAlign ? "right" : "left",
                lineBreak: false,
              });
            currentX += columnWidths[idx];
          });
        });
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};

const generatePurchasePDF = async (purchase, pharmacy) => {
  return new Promise(async (resolve, reject) => {
    try {
      const PDFDocument = require("pdfkit");
      const https = require("https");
      const mongoose = require("mongoose");

      const db = mongoose.connection.db;
      let supplier = null;
      if (db && purchase.supplier_id) {
        supplier = await db
          .collection("suppliers")
          .findOne({ id: purchase.supplier_id });
      }

      const fetchImageBuffer = (url) => {
        return new Promise((resResolve) => {
          https
            .get(url, { timeout: 3000 }, (res) => {
              if (res.statusCode !== 200) {
                resResolve(null);
                return;
              }
              const data = [];
              res.on("data", (chunk) => data.push(chunk));
              res.on("end", () => resResolve(Buffer.concat(data)));
            })
            .on("error", () => resResolve(null));
        });
      };

      let logoBuffer = null;
      if (pharmacy?.logo_url) {
        const rawBuffer = await fetchImageBuffer(pharmacy.logo_url);
        if (rawBuffer) {
          try {
            const sharp = require("sharp");
            logoBuffer = await sharp(rawBuffer).png().toBuffer();
          } catch (sharpErr) {
            console.error("Logo sharp conversion failed:", sharpErr);
            logoBuffer = rawBuffer;
          }
        }
      }

      const doc = new PDFDocument({
        size: "A5",
        layout: "landscape",
        margin: 10,
      });
      const chunks = [];

      doc.on("data", (c) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const itemsPerPage = 15;
      const totalPages = Math.ceil(purchase.items.length / itemsPerPage) || 1;

      const formatExpiry = (exp) => {
        if (!exp || exp === "-") return "-";
        if (/^\d{2}\/\d{2}$/.test(exp) || /^\d{2}\/\d{4}$/.test(exp))
          return exp;
        const d = new Date(exp);
        if (isNaN(d.getTime())) return exp;
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const yy = String(d.getFullYear()).substring(2);
        return `${mm}/${yy}`;
      };

      let totalQty = 0;
      purchase.items.forEach((item) => {
        totalQty += (item.pack_quantity || 1) + (item.scheme || 0);
      });

      const columnWidths = [
        12, 132, 40, 30, 28, 36, 35, 35, 28, 33, 33, 32, 36, 65,
      ];
      const tableHeaders = [
        "#",
        "DESCRIPTION",
        "BATCH",
        "EXP",
        "PACKS",
        "SCHEME",
        "T.UNITS",
        "RATE",
        "DISC%",
        "CGST%",
        "SGST%",
        "MRP/U",
        "T.MRP",
        "AMT",
      ];

      const drawPageSkeleton = (pageNum, total) => {
        doc.lineWidth(1);
        doc.strokeColor("#000000");

        // 1. Outer Border
        doc.rect(10, 10, 575, 400).stroke();

        // 2. Header Panel Borders
        doc.moveTo(110, 10).lineTo(110, 80).stroke();
        doc.moveTo(345, 10).lineTo(345, 80).stroke();
        doc.moveTo(10, 25).lineTo(110, 25).stroke();
        doc.moveTo(345, 25).lineTo(585, 25).stroke();
        doc.moveTo(10, 80).lineTo(585, 80).stroke();

        // Left Header Panel: Logo/Initials
        doc.fillColor("#000000");
        doc
          .font("Helvetica-Bold")
          .fontSize(7)
          .text("PURCHASE INVOICE", 10, 15, { width: 100, align: "center" });

        const drawVectorMonogram = () => {
          const initials = pharmacy?.name
            ? pharmacy.name
                .split(" ")
                .map((w) => w[0])
                .join("")
                .substring(0, 2)
                .toUpperCase()
            : "";
          doc
            .fillColor("#16a34a")
            .font("Helvetica-Bold")
            .fontSize(20)
            .text(initials, 10, 38, { width: 100, align: "center" });
          if (initials) {
            doc
              .fillColor("#16a34a")
              .font("Helvetica-Bold")
              .fontSize(7)
              .text("PHARMACY", 10, 62, { width: 100, align: "center" });
          }
        };

        if (logoBuffer) {
          try {
            doc.image(logoBuffer, 30, 28, { width: 60, height: 48 });
          } catch (err) {
            drawVectorMonogram();
          }
        } else {
          drawVectorMonogram();
        }

        // Center Header Panel: Pharmacy metadata
        doc.fillColor("#000000");
        doc
          .font("Helvetica-Bold")
          .fontSize(10)
          .text((pharmacy?.name || "").toUpperCase(), 115, 14);
        doc
          .font("Helvetica")
          .fontSize(6.5)
          .text(pharmacy?.location || "", 115, 26, { width: 225 });

        doc
          .font("Helvetica-Bold")
          .fontSize(6.5)
          .text("CONTACT  ", 115, 48, { continued: true })
          .font("Helvetica")
          .text(pharmacy?.contact || "");
        doc
          .font("Helvetica-Bold")
          .text("GSTIN        ", 115, 57, { continued: true })
          .font("Helvetica")
          .text(pharmacy?.gst_no || "");

        // Right Header Panel: Supplier and Purchase details
        const purchaseDate = new Date(
          purchase.purchase_date || purchase.created_at || new Date()
        );
        const purchaseDateFormatted = isNaN(purchaseDate.getTime())
          ? "-"
          : purchaseDate.toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            }).replace(/ /g, "-");
        const purchaseTimeFormatted = isNaN(purchaseDate.getTime())
          ? ""
          : purchaseDate.toLocaleTimeString("en-IN", {
              hour: "2-digit",
              minute: "2-digit",
              hour12: true,
            });
        const purchaseTimestamp = purchaseTimeFormatted
          ? `${purchaseDateFormatted} ${purchaseTimeFormatted}`
          : purchaseDateFormatted;

        doc.fillColor("#000000");
        doc.font("Helvetica-Bold").fontSize(6.5).text("Serial No.", 349, 14);
        doc
          .font("Helvetica-Bold")
          .fontSize(7.5)
          .text(
            purchase.invoice_no ? `INV-${purchase.invoice_no}` : "-",
            395,
            14,
            { width: 85 }
          );
        doc
          .font("Helvetica-Bold")
          .fontSize(7)
          .text(purchaseTimestamp, 480, 14, { width: 100, align: "right" });

        doc.font("Helvetica-Bold").fontSize(6.5).text("SUPPLIER", 349, 29);
        doc
          .font("Helvetica")
          .fontSize(6.5)
          .text(
            (purchase.supplier_name || supplier?.name || "").toUpperCase(),
            395,
            29,
            { width: 185 }
          );

        doc.font("Helvetica-Bold").fontSize(6.5).text("ADDRESS", 349, 39);
        doc
          .font("Helvetica")
          .fontSize(6.5)
          .text((supplier?.address || "").toUpperCase(), 395, 39, {
            width: 185,
          });

        doc.font("Helvetica-Bold").fontSize(6.5).text("CONTACT", 349, 49);
        doc
          .font("Helvetica")
          .fontSize(6.5)
          .text(supplier?.contact || "", 395, 49, { width: 185 });

        doc.font("Helvetica-Bold").fontSize(6.5).text("GSTIN", 349, 59);
        doc
          .font("Helvetica")
          .fontSize(6.5)
          .text(supplier?.gst_no || "", 395, 59, { width: 185 });

        // 3. Table Structure
        doc.rect(10, 80, 575, 18).stroke();
        let currentX = 10;
        tableHeaders.forEach((th, idx) => {
          const isRightAlign = idx >= 4;
          doc.fillColor("#000000");
          doc
            .font("Helvetica-Bold")
            .fontSize(6.5)
            .text(th, currentX + 3, 86, {
              width: columnWidths[idx] - (idx === 13 ? 10 : 6),
              align: isRightAlign ? "right" : "left",
            });
          currentX += columnWidths[idx];
        });

        doc.moveTo(10, 98).lineTo(585, 98).stroke();
        doc.moveTo(10, 323).lineTo(585, 323).stroke();

        let divX = 10;
        columnWidths.forEach((w) => {
          divX += w;
          if (divX < 585) {
            doc.moveTo(divX, 80).lineTo(divX, 323).stroke();
          }
        });

        // 4. Footer Structure
        doc.moveTo(195, 323).lineTo(195, 398).stroke();
        doc.moveTo(395, 323).lineTo(395, 398).stroke();
        doc.moveTo(455, 323).lineTo(455, 398).stroke();
        doc.moveTo(10, 398).lineTo(585, 398).stroke();

        // Panel 1 Remarks
        doc.fillColor("#000000");
        doc.font("Helvetica-Bold").fontSize(6.5).text("REMARKS", 15, 328);
        doc
          .font("Helvetica-Bold")
          .fontSize(6.5)
          .text("E&OE", 10, 328, { width: 180, align: "right" });
        doc
          .font("Helvetica")
          .fontSize(6.5)
          .text(purchase.notes || "Purchase recorded successfully!", 15, 338, {
            width: 175,
          });
        doc
          .font("Helvetica-Bold")
          .fontSize(6.5)
          .text(
            `PRODUCTS: ${purchase.items.length}, TOTAL QTY: ${totalQty}`,
            15,
            386
          );

        // Panel 2 Bank Details (same as bill)
        const bankName = pharmacy?.bank_name || "";
        const bankIfsc = pharmacy?.bank_ifsc || "";
        const bankAcc = pharmacy?.bank_acc_no || "";
        const bankHolder = pharmacy?.bank_holder || "";
        const bankUpi = pharmacy?.upi_id || "";

        if (bankName || bankIfsc || bankAcc || bankHolder || bankUpi) {
          doc
            .font("Helvetica-Bold")
            .fontSize(6.5)
            .text("BANK DETAIL", 200, 328);
          if (bankName)
            doc
              .font("Helvetica-Bold")
              .fontSize(6)
              .text(bankName.toUpperCase(), 200, 338, { width: 190 });

          if (bankIfsc) {
            doc
              .font("Helvetica-Bold")
              .fontSize(6)
              .text("IFSC", 200, 350, { continued: true })
              .font("Helvetica")
              .text(`   ${bankIfsc}`);
          }
          if (bankAcc) {
            doc
              .font("Helvetica-Bold")
              .fontSize(6)
              .text("A/C No", 200, 362, { continued: true })
              .font("Helvetica")
              .text(` ${bankAcc}`);
          }
          if (bankHolder) {
            doc
              .font("Helvetica-Bold")
              .fontSize(6)
              .text("Holder", 200, 374, { continued: true })
              .font("Helvetica")
              .text(` ${bankHolder}`);
          }
          if (bankUpi) {
            doc
              .font("Helvetica-Bold")
              .fontSize(6)
              .text("UPI ID", 200, 386, { continued: true })
              .font("Helvetica")
              .text(` ${bankUpi}`);
          }
        }

        // Panel 3 Sign
        doc.strokeColor("#000000");
        doc
          .fillColor("#000000")
          .font("Helvetica-Bold")
          .fontSize(5.5)
          .text("Authorized Sign", 395, 387, { width: 60, align: "center" });

        // Panel 4 Totals
        doc.fillColor("#f8fafc").rect(455.5, 359.5, 129, 19).fill();

        doc.fillColor("#000000");
        doc.moveTo(455, 341).lineTo(585, 341).stroke();
        doc.moveTo(455, 359).lineTo(585, 359).stroke();
        doc.moveTo(455, 379).lineTo(585, 379).stroke();

        let totalBase = 0;
        let totalTax = 0;
        purchase.items.forEach((item) => {
          const qty = item.pack_quantity || 1;
          const price = item.pack_price || 0;
          const discount = item.discount || 0;
          const cgst = item.cgst || 0;
          const sgst = item.sgst || 0;
          const base = qty * price * (1 - discount / 100);
          const tax = (base * (cgst + sgst)) / 100;
          totalBase += base;
          totalTax += tax;
        });
        const grandTotal = purchase.total_amount || totalBase + totalTax;
        const amountPaid = purchase.amount_paid || 0;
        const balance = grandTotal - amountPaid;

        doc.font("Helvetica").fontSize(6.5).text("Subtotal", 460, 329);
        doc
          .font("Helvetica")
          .fontSize(6.5)
          .text(Number(totalBase).toFixed(2), 460, 329, {
            width: 120,
            align: "right",
          });

        doc.font("Helvetica").fontSize(6.5).text("Total GST", 460, 347);
        doc
          .font("Helvetica")
          .fontSize(6.5)
          .text(Number(totalTax).toFixed(2), 460, 347, {
            width: 120,
            align: "right",
          });

        doc.font("Helvetica-Bold").fontSize(7.5).text("Grand Total", 460, 365);
        doc
          .font("Helvetica-Bold")
          .fontSize(7.5)
          .text(`Rs ${Number(grandTotal).toFixed(2)}`, 460, 365, {
            width: 120,
            align: "right",
          });

        doc.font("Helvetica-Bold").fontSize(6.5).text("Paid/Balance", 460, 385);
        doc
          .font("Helvetica")
          .fontSize(6.5)
          .text(
            `${Number(amountPaid).toFixed(2)}/${Number(balance).toFixed(2)}`,
            460,
            385,
            { width: 120, align: "right" }
          );

        // Bottom Metadata
        doc
          .fillColor("#475569")
          .font("Helvetica")
          .fontSize(5.5)
          .text(`PURCHASE RECORD  |  Page ${pageNum} of ${total}`, 15, 402);

        const timestamp = new Date().toLocaleString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        });
        const pharmName = (pharmacy?.name || "JK Pharmacy").toUpperCase();
        doc.text(`Generated by ${pharmName} at ${timestamp}`, 15, 402, {
          width: 565,
          align: "right",
        });
      };

      for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
        if (pageIdx > 0) {
          doc.addPage();
        }

        drawPageSkeleton(pageIdx + 1, totalPages);

        const pageItems = purchase.items.slice(
          pageIdx * itemsPerPage,
          (pageIdx + 1) * itemsPerPage
        );

        doc.fillColor("#000000");
        pageItems.forEach((item, itemIdx) => {
          const indexInPurchase = pageIdx * itemsPerPage + itemIdx;
          const rowY = 98 + itemIdx * 15 + 4;

          const packs = item.pack_quantity || 1;
          const scheme = item.scheme || 0;
          const unitsPerPack = item.units_per_pack || 1;
          const totalUnits = item.quantity || (packs + scheme) * unitsPerPack;
          const price = item.pack_price || 0;
          const mrp = item.mrp || item.mrp_per_unit || 0;
          const totalMrp = totalUnits * mrp;
          const discount = item.discount || 0;
          const cgst = item.cgst || 0;
          const sgst = item.sgst || 0;
          const totalCost =
            item.item_total !== undefined
              ? item.item_total
              : packs *
                price *
                (1 - discount / 100) *
                (1 + (cgst + sgst) / 100);

          const vals = [
            indexInPurchase + 1,
            (item.product_name || "-").substring(0, 26),
            item.batch_no || "-",
            formatExpiry(item.expiry_date),
            packs,
            scheme,
            totalUnits,
            price.toFixed(1),
            discount ? `${discount}%` : "0%",
            cgst.toFixed(1),
            sgst.toFixed(1),
            mrp.toFixed(1),
            totalMrp.toFixed(2),
            totalCost.toFixed(2),
          ];

          let currentX = 10;
          vals.forEach((val, idx) => {
            const isRightAlign = idx >= 4;
            const isHighlighted = idx === 7 || idx === 11 || idx === 12;
            doc
              .font(isHighlighted ? "Helvetica-Bold" : "Helvetica")
              .fontSize(6)
              .text(String(val), currentX + 3, rowY, {
                width: columnWidths[idx] - (idx === 13 ? 10 : 6),
                align: isRightAlign ? "right" : "left",
                lineBreak: false,
              });
            currentX += columnWidths[idx];
          });
        });
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};
module.exports = { generateBillPDF, generatePurchasePDF };
