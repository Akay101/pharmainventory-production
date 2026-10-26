const PDFDocument = require("pdfkit");

const IST = "Asia/Kolkata";

// Retail bill line maths. MRP is GST-inclusive, so a line's amount is
// qty x MRP less its own discount; the bill-level discount comes off the total.
const billLine = (item) => {
  const qty = Number(item.quantity || item.sold_units) || 1;
  const mrp = Number(item.unit_price || item.mrp_per_unit) || 0;
  const discPct = Number(item.discount_percent) || 0;
  const gross = qty * mrp;
  const discount = item.line_discount !== undefined ? Number(item.line_discount) || 0 : gross * (discPct / 100);
  return { qty, mrp, discPct, gross, discount, amount: gross - discount };
};

// "2 strips", "1 strip + 3", "loose" for a quantity in units
const packLabel = (qty, perPack, packType) => {
  if (!perPack || perPack <= 1) return "";
  const pt = String(packType || "pack").toLowerCase();
  const packs = Math.floor(qty / perPack);
  const rest = qty % perPack;
  if (packs === 0) return "loose";
  const name = packs > 1 ? `${packs} ${pt}s` : `1 ${pt}`;
  return rest ? `${name} + ${rest}` : name;
};

const money = (n) => (Math.round((Number(n) || 0) * 100) / 100).toFixed(2);

// options.upiQr: true = UPI QR for the amount due (the bill total when it's
// already paid), false = no QR, undefined = QR only while something is due.
const generateBillPDF = async (bill, pharmacy, options = {}) => {
  return new Promise(async (resolve, reject) => {
    try {
      const https = require("https");
      const mongoose = require("mongoose");
      const QRCode = require("qrcode");

      const db = mongoose.connection.db;
      const scope = bill.pharmacy_id ? { pharmacy_id: bill.pharmacy_id } : {};
      let customer = null;
      if (db && bill.customer_id) {
        customer = await db.collection("customers").findOne({ id: bill.customer_id, ...scope });
      }

      const enrichedItems = [];
      for (const item of bill.items || []) {
        let inv = null;
        if (db && item.inventory_id && !String(item.inventory_id).startsWith("negative-")) {
          inv = await db.collection("inventory").findOne({ id: item.inventory_id, ...scope });
        }

        let hsn = item.hsn_no || inv?.hsn_no || "-";
        if (hsn === "-" && inv?.product_id) {
          const prod = await db.collection("products").findOne({ id: inv.product_id, ...scope });
          if (prod && prod.hsn_no) {
            hsn = prod.hsn_no;
          }
        }

        enrichedItems.push({
          ...item,
          manufacturer: item.manufacturer || inv?.manufacturer || "",
          hsn_no: hsn,
          expiry_date: item.expiry_date || inv?.expiry_date || "-",
          units_per_pack: Number(item.units_per_pack || inv?.units_per_pack) || 1,
          pack_type: item.pack_type || inv?.pack_type || "",
          line: billLine(item),
        });
      }

      // Totals
      const grandTotal = Number(bill.grand_total ?? bill.total_amount) || 0;
      const totalGross = enrichedItems.reduce((s, i) => s + i.line.gross, 0);
      const itemDiscount = enrichedItems.reduce((s, i) => s + i.line.discount, 0);
      const linesTotal = enrichedItems.reduce((s, i) => s + i.line.amount, 0);
      const billDiscount = Number(bill.discount_amount) || 0;
      const saved = Math.max(0, totalGross - grandTotal);
      const paid = bill.total_paid !== undefined
        ? Number(bill.total_paid) || 0
        : bill.is_paid ? grandTotal : Number(bill.advance_amount) || 0;
      const balance = Math.max(0, grandTotal - paid);
      // Udhar: the customer's dues across all bills (this one included)
      const isUdhar = !!bill.is_credit || (balance > 0.004 && !bill.is_advance_paid);
      const customerDues = customer ? Math.max(0, Number(customer.total_debt) || 0) : null;
      const totalQty = enrichedItems.reduce((s, i) => s + i.line.qty, 0);

      // GST included in the amount actually charged (after all discounts)
      const gst = { taxable: 0, cgst: 0, sgst: 0, rates: new Set() };
      const chargeFactor = linesTotal > 0 ? grandTotal / linesTotal : 0;
      for (const i of enrichedItems) {
        const c = Number(i.cgst) || 0;
        const sg = Number(i.sgst) || 0;
        const charged = i.line.amount * chargeFactor;
        const taxable = charged / (1 + (c + sg) / 100);
        gst.taxable += taxable;
        gst.cgst += taxable * (c / 100);
        gst.sgst += taxable * (sg / 100);
        if (c + sg > 0) gst.rates.add(Number((c + sg).toFixed(2)));
      }
      const gstRates = [...gst.rates].sort((a, b) => a - b).map((r) => `${r}%`).join(", ");

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

      // Scannable UPI QR (see options.upiQr)
      const upiId = (pharmacy?.upi_id || "").trim();
      const { isValidUpiId, buildUpiUri } = require("../utils/upi");
      const wantQr = options.upiQr === undefined ? balance > 0 : !!options.upiQr;
      const qrAmount = balance > 0 ? balance : grandTotal;
      let qrBuffer = null;
      if (wantQr && isValidUpiId(upiId) && qrAmount > 0) {
        const upi = buildUpiUri({ upiId, payeeName: pharmacy?.name, amount: Math.min(qrAmount, 100000), note: bill.bill_no || "" });
        try {
          qrBuffer = await QRCode.toBuffer(upi, { margin: 0, width: 160, errorCorrectionLevel: "M" });
        } catch (qrErr) {
          console.error("UPI QR generation failed:", qrErr.message);
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

      const ROW_H = 18;
      const TABLE_TOP = 98;
      const TABLE_BOTTOM = 300;
      const itemsPerPage = Math.floor((TABLE_BOTTOM - TABLE_TOP) / ROW_H);
      const totalPages = Math.ceil(enrichedItems.length / itemsPerPage) || 1;

      const formatExpiry = (exp) => {
        if (!exp || exp === "-") return "-";
        if (/^\d{1,2}\/\d{2}$/.test(exp)) {
          const [m, y] = exp.split("/");
          return `${m.padStart(2, "0")}/${y}`;
        }
        if (/^\d{1,2}\/\d{4}$/.test(exp)) {
          const [m, y] = exp.split("/");
          return `${m.padStart(2, "0")}/${y.slice(-2)}`;
        }
        const d = new Date(exp);
        if (isNaN(d.getTime())) return exp;
        const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
        const yy = String(d.getUTCFullYear()).substring(2);
        return `${mm}/${yy}`;
      };

      // Bill date is the business date; the time is shown only when the bill
      // was created on that same day (not for back-dated bills).
      const billTimestamp = (() => {
        const created = bill.created_at ? new Date(bill.created_at) : null;
        const createdDay = created && !isNaN(created) ? created.toLocaleDateString("en-CA", { timeZone: IST }) : null;
        const day = /^\d{4}-\d{2}-\d{2}$/.test(bill.billing_date || "") ? bill.billing_date : createdDay;
        if (!day) return "-";
        const dateLabel = new Date(`${day}T00:00:00Z`)
          .toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })
          .replace(/ /g, "-");
        if (createdDay !== day) return dateLabel;
        const time = created.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: IST });
        return `${dateLabel} ${time}`;
      })();

      const columnWidths = [16, 178, 38, 50, 32, 46, 52, 50, 28, 85];
      const tableHeaders = ["#", "ITEM", "HSN", "BATCH", "EXP", "QTY", "MRP", "DISC", "GST%", "AMOUNT"];
      const RIGHT_FROM = 5;
      const MUTED = "#64748b";

      const drawPageSkeleton = (pageNum, total, isLastPage) => {
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
            doc.image(logoBuffer, 30, 28, { fit: [60, 48], align: "center", valign: "center" });
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
          .text((pharmacy?.name || "").toUpperCase(), 115, 14, { width: 225, lineBreak: false, ellipsis: true });
        doc
          .font("Helvetica")
          .fontSize(6.5)
          .text(pharmacy?.location || "", 115, 26, { width: 225, height: 20, ellipsis: true });

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
        if (pharmacy?.license_no || pharmacy?.drug_license_no) {
          doc
            .font("Helvetica-Bold")
            .text("D.L. No.     ", 115, 66, { continued: true })
            .font("Helvetica")
            .text(pharmacy.license_no || pharmacy.drug_license_no);
        }

        // Right Header Panel: Customer and Billing details
        doc.fillColor("#000000");
        doc.font("Helvetica-Bold").fontSize(6.5).text("Bill No.", 349, 14);
        doc
          .font("Helvetica-Bold")
          .fontSize(7.5)
          .text(bill.bill_no || "-", 385, 14, { width: 100, lineBreak: false });
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
            lineBreak: false,
            ellipsis: true,
          });

        doc.font("Helvetica-Bold").fontSize(6.5).text("ADDRESS", 349, 39);
        doc
          .font("Helvetica")
          .fontSize(6.5)
          .text((customer?.address || "").toUpperCase(), 395, 39, {
            width: 185,
            lineBreak: false,
            ellipsis: true,
          });

        doc.font("Helvetica-Bold").fontSize(6.5).text("CONTACT", 349, 49);
        doc
          .font("Helvetica")
          .fontSize(6.5)
          .text(customer?.mobile || bill.customer_mobile || "-", 395, 49, { width: 185 });

        doc.font("Helvetica-Bold").fontSize(6.5).text("DOCTOR", 349, 59);
        doc
          .font("Helvetica")
          .fontSize(6.5)
          .text((bill.doctor || "-").toUpperCase(), 395, 59, { width: 185, lineBreak: false, ellipsis: true });

        doc.font("Helvetica-Bold").fontSize(6.5).text("PAYMENT", 349, 69);
        doc
          .font("Helvetica")
          .fontSize(6.5)
          .text(
            balance <= 0.004
              ? `PAID${bill.payment_mode ? ` (${String(bill.payment_mode).toUpperCase()})` : ""}`
              : isUdhar
              ? paid > 0
                ? `UDHAR · PAID RS ${money(paid)}${bill.payment_mode ? ` (${String(bill.payment_mode).toUpperCase()})` : ""}`
                : "UDHAR (CREDIT)"
              : paid > 0
              ? "PART PAID"
              : "CREDIT",
            395,
            69,
            { width: 185 }
          );

        // 3. Table Structure
        doc.fillColor("#f1f5f9").rect(10.5, 80.5, 574, 17).fill();
        doc.strokeColor("#000000").rect(10, 80, 575, 18).stroke();
        let currentX = 10;
        tableHeaders.forEach((th, idx) => {
          doc.fillColor("#000000");
          doc
            .font("Helvetica-Bold")
            .fontSize(6.5)
            .text(th, currentX + 3, 86, {
              width: columnWidths[idx] - 6,
              align: idx >= RIGHT_FROM ? "right" : "left",
            });
          currentX += columnWidths[idx];
        });

        doc.moveTo(10, TABLE_TOP).lineTo(585, TABLE_TOP).stroke();
        doc.moveTo(10, TABLE_BOTTOM).lineTo(585, TABLE_BOTTOM).stroke();

        let divX = 10;
        columnWidths.forEach((w) => {
          divX += w;
          if (divX < 585) {
            doc.moveTo(divX, 80).lineTo(divX, TABLE_BOTTOM).stroke();
          }
        });

        // 4. Footer Structure
        doc.moveTo(230, TABLE_BOTTOM).lineTo(230, 398).stroke();
        doc.moveTo(395, TABLE_BOTTOM).lineTo(395, 398).stroke();
        doc.moveTo(460, TABLE_BOTTOM).lineTo(460, 398).stroke();
        doc.moveTo(10, 398).lineTo(585, 398).stroke();

        // Panel 1: remarks, savings and GST included
        doc.fillColor("#000000");
        doc.font("Helvetica-Bold").fontSize(6.5).text("REMARKS", 15, 305);
        doc
          .font("Helvetica-Bold")
          .fontSize(6.5)
          .text("E&OE", 10, 305, { width: 215, align: "right" });
        doc
          .font("Helvetica")
          .fontSize(6.5)
          .text(bill.notes || "We wish you a speedy recovery!", 15, 315, {
            width: 210,
            height: 18,
            ellipsis: true,
          });

        if (isLastPage) {
          if (saved > 0.004) {
            doc.fillColor("#dcfce7").rect(15, 337, 210, 15).fill();
            doc
              .fillColor("#166534")
              .font("Helvetica-Bold")
              .fontSize(7)
              .text(`YOU SAVED Rs ${money(saved)} ON MRP`, 15, 341.5, { width: 210, align: "center" });
          }
          doc
            .fillColor(MUTED)
            .font("Helvetica")
            .fontSize(5.8)
            .text(
              gstRates ? `GST ${gstRates} included: Rs ${money(gst.cgst + gst.sgst)}` : "Prices are inclusive of GST",
              15,
              357,
              { width: 210 }
            );
        }
        doc
          .fillColor("#000000")
          .font("Helvetica-Bold")
          .fontSize(6.5)
          .text(`ITEMS: ${enrichedItems.length}   TOTAL QTY: ${totalQty} units`, 15, 386);

        // Panel 2: bank details and signature
        const bankName = pharmacy?.bank_name || "";
        const bankIfsc = pharmacy?.bank_ifsc || "";
        const bankAcc = pharmacy?.bank_acc_no || "";
        const bankHolder = pharmacy?.bank_holder || "";

        if (bankName || bankIfsc || bankAcc || bankHolder || upiId) {
          doc.fillColor("#000000").font("Helvetica-Bold").fontSize(6.5).text("BANK DETAIL", 235, 305);
          let by = 315;
          const bankRow = (label, value) => {
            if (!value) return;
            doc
              .font("Helvetica-Bold")
              .fontSize(6)
              .text(label, 235, by, { continued: true })
              .font("Helvetica")
              .text(` ${value}`, { width: 155, lineBreak: false, ellipsis: true });
            by += 10;
          };
          if (bankName) {
            doc.font("Helvetica-Bold").fontSize(6).text(bankName.toUpperCase(), 235, by, { width: 155, lineBreak: false, ellipsis: true });
            by += 10;
          }
          bankRow("IFSC  ", bankIfsc);
          bankRow("A/C No", bankAcc);
          bankRow("Holder", bankHolder);
          bankRow("UPI ID", upiId);
        }
        doc.strokeColor("#94a3b8").moveTo(300, 384).lineTo(390, 384).stroke().strokeColor("#000000");
        doc
          .fillColor("#000000")
          .font("Helvetica-Bold")
          .fontSize(5.5)
          .text("Authorised Signatory", 300, 387, { width: 90, align: "center" });

        // Panel 3: scan to pay / paid stamp
        if (isLastPage && qrBuffer) {
          doc.image(qrBuffer, 402, 306, { width: 51, height: 51 });
          doc
            .fillColor("#000000")
            .font("Helvetica-Bold")
            .fontSize(5.5)
            .text("SCAN TO PAY", 395, 362, { width: 65, align: "center" });
          doc
            .font("Helvetica")
            .fontSize(5.5)
            .text(`Rs ${money(qrAmount)}`, 395, 370, { width: 65, align: "center" });
        } else if (isLastPage && balance <= 0.004 && grandTotal > 0) {
          doc.lineWidth(1.2).strokeColor("#16a34a").roundedRect(405, 334, 46, 18, 3).stroke();
          doc
            .fillColor("#16a34a")
            .font("Helvetica-Bold")
            .fontSize(9)
            .text("PAID", 405, 339, { width: 46, align: "center" });
          doc.lineWidth(1).strokeColor("#000000");
        }

        // Panel 4: totals (last page only)
        doc.fillColor("#000000");
        if (isLastPage) {
          const rows = [
            ["Total MRP", money(totalGross)],
            ["Item discount", itemDiscount > 0.004 ? `- ${money(itemDiscount)}` : "0.00"],
            [`Bill discount${bill.discount_percent ? ` (${Number(bill.discount_percent).toFixed(2).replace(/\.?0+$/, "")}%)` : ""}`, billDiscount > 0.004 ? `- ${money(billDiscount)}` : "0.00"],
          ];
          let ty = 305;
          rows.forEach(([label, value]) => {
            doc.font("Helvetica").fontSize(6.5).fillColor("#000000").text(label, 465, ty);
            doc.text(value, 465, ty, { width: 115, align: "right" });
            ty += 12;
          });
          doc.fillColor("#f1f5f9").rect(460.5, 341.5, 124, 18).fill();
          doc.strokeColor("#000000").moveTo(460, 341).lineTo(585, 341).stroke();
          doc.moveTo(460, 360).lineTo(585, 360).stroke();
          doc.fillColor("#000000").font("Helvetica-Bold").fontSize(8).text("NET AMOUNT", 465, 346.5);
          doc.text(`Rs ${money(grandTotal)}`, 465, 346.5, { width: 115, align: "right" });

          const showDues = isUdhar && balance > 0.004 && customerDues !== null && customerDues > 0.004;
          const step = showDues ? 10 : 13;
          let py = showDues ? 363 : 366;
          doc.font("Helvetica").fontSize(6.5).text(isUdhar ? "Paid now" : "Paid", 465, py);
          doc.text(money(paid), 465, py, { width: 115, align: "right" });
          py += step;
          doc.font("Helvetica-Bold").fontSize(7).fillColor(balance > 0.004 ? "#b91c1c" : "#000000").text(isUdhar && balance > 0.004 ? "Udhar (this bill)" : "Balance due", 465, py);
          doc.text(money(balance), 465, py, { width: 115, align: "right" });
          if (showDues) {
            py += step;
            doc.font("Helvetica-Bold").fontSize(7).fillColor("#b91c1c").text("Total udhar (all bills)", 465, py);
            doc.text(money(Math.max(customerDues, balance)), 465, py, { width: 115, align: "right" });
          }
          doc.fillColor("#000000");
        } else {
          doc
            .fillColor(MUTED)
            .font("Helvetica-Oblique")
            .fontSize(7)
            .text("Continued on next page…", 465, 345, { width: 115, align: "center" });
        }

        // Bottom Metadata
        doc
          .fillColor("#475569")
          .font("Helvetica")
          .fontSize(5.5)
          .text(`Page ${pageNum} of ${total}`, 15, 402);

        const timestamp = new Date().toLocaleString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
          timeZone: IST,
        });
        doc.text(`Generated by DavaDesk on ${timestamp}`, 15, 402, {
          width: 565,
          align: "right",
        });
      };

      for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
        if (pageIdx > 0) {
          doc.addPage();
        }

        drawPageSkeleton(pageIdx + 1, totalPages, pageIdx === totalPages - 1);

        const pageItems = enrichedItems.slice(
          pageIdx * itemsPerPage,
          (pageIdx + 1) * itemsPerPage
        );

        pageItems.forEach((item, itemIdx) => {
          const indexInBill = pageIdx * itemsPerPage + itemIdx;
          const rowY = TABLE_TOP + itemIdx * ROW_H;
          const { qty, mrp, discPct, discount, amount } = item.line;
          const perPack = item.units_per_pack;
          const packType = String(item.pack_type || "pack").replace(/^./, (c) => c.toUpperCase());
          const gstPercent = (Number(item.cgst) || 0) + (Number(item.sgst) || 0);
          // Whole packs read as packs ("1 Strip" at the strip MRP); loose
          // quantities stay in units
          const fullPacks = perPack > 1 && qty % perPack === 0 ? qty / perPack : 0;
          const packWord = (n) => {
            const w = String(packType);
            if (n === 1) return `1 ${w}`;
            return `${n} ${/(s|x|ch|sh)$/i.test(w) ? `${w}es` : `${w}s`}`;
          };

          if (itemIdx > 0) {
            doc.strokeColor("#e2e8f0").moveTo(10, rowY).lineTo(585, rowY).stroke();
          }

          // Main line, then a muted detail line under it
          const main = [
            String(indexInBill + 1),
            item.product_name || "-",
            item.hsn_no || "-",
            item.batch_no || "-",
            formatExpiry(item.expiry_date),
            fullPacks ? packWord(fullPacks) : String(qty),
            fullPacks ? money(mrp * perPack) : money(mrp),
            discPct > 0 ? `${Number(discPct.toFixed(2))}%` : "-",
            gstPercent ? String(Number(gstPercent.toFixed(2))) : "-",
            money(amount),
          ];
          const detail = [
            "",
            [item.manufacturer, perPack > 1 ? `${packType} of ${perPack}` : ""].filter(Boolean).join("  ·  "),
            "",
            "",
            "",
            fullPacks ? `${qty} units` : packLabel(qty, perPack, packType),
            fullPacks ? `${money(mrp)}/unit` : perPack > 1 ? `${money(mrp * perPack)}/${String(packType).toLowerCase()}` : "",
            discount > 0.004 ? `- ${money(discount)}` : "",
            "",
            "",
          ];

          let currentX = 10;
          main.forEach((val, idx) => {
            const w = columnWidths[idx] - 6;
            const align = idx >= RIGHT_FROM ? "right" : "left";
            doc
              .fillColor("#000000")
              .font(idx === 1 || idx === 9 ? "Helvetica-Bold" : "Helvetica")
              .fontSize(6.5)
              .text(val, currentX + 3, rowY + 3, { width: w, height: 8, align, lineBreak: false, ellipsis: true });
            if (detail[idx]) {
              doc
                .fillColor(MUTED)
                .font("Helvetica")
                .fontSize(5.2)
                .text(detail[idx], currentX + 3, rowY + 10.5, { width: w, height: 7, align, lineBreak: false, ellipsis: true });
            }
            currentX += columnWidths[idx];
          });
        });
        doc.strokeColor("#000000");
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
        if (/^\d{1,2}\/\d{2}$/.test(exp)) {
          const [m, y] = exp.split("/");
          return `${m.padStart(2, "0")}/${y}`;
        }
        if (/^\d{1,2}\/\d{4}$/.test(exp)) {
          const [m, y] = exp.split("/");
          return `${m.padStart(2, "0")}/${y.slice(-2)}`;
        }
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
