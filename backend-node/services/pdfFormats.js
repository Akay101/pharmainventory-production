// Page formats for bills and purchases. services/pdf.js works out the numbers
// and hands over a model; this file only lays it out, so a bill and a purchase
// look like one family on every paper size:
//   a4, a5        portrait invoice, table of lines, totals, GST summary
//   receipt_80/58 thermal roll: black only, as long as the bill needs
// "a5_landscape" is the original layout and stays in services/pdf.js.
const PDFDocument = require("pdfkit");

const LEGACY_FORMAT = "a5_landscape";
const FORMATS = ["a4", "a5", LEGACY_FORMAT, "receipt_80", "receipt_58"];
const isNewFormat = (f) => FORMATS.includes(f) && f !== LEGACY_FORMAT;

const REGULAR = "Helvetica";
const BOLD = "Helvetica-Bold";
const INK = "#0f172a";
const MUTED = "#64748b";
const RULE = "#e2e8f0";
const BAND = "#f1f5f9";
const ACCENT = "#ea580c";
const GOOD = "#15803d";
const BAD = "#b91c1c";
const TONES = { good: GOOD, bad: BAD, muted: MUTED };

const money = (n) => (Math.round((Number(n) || 0) * 100) / 100).toFixed(2);
const rate = (n) => String(Number((Number(n) || 0).toFixed(2)));

const formatExpiry = (exp) => {
  if (!exp || exp === "-") return "-";
  const s = String(exp);
  if (/^\d{1,2}\/\d{2}$/.test(s)) return s.padStart(5, "0");
  if (/^\d{1,2}\/\d{4}$/.test(s)) {
    const [m, y] = s.split("/");
    return `${m.padStart(2, "0")}/${y.slice(-2)}`;
  }
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCFullYear()).slice(2)}`;
};

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
const underHundred = (n) => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ""}`);
function indianWords(n) {
  if (n === 0) return "Zero";
  const parts = [];
  [[10000000, "Crore"], [100000, "Lakh"], [1000, "Thousand"], [100, "Hundred"]].forEach(([size, name]) => {
    const q = Math.floor(n / size);
    if (q) parts.push(`${size === 10000000 ? indianWords(q) : underHundred(q)} ${name}`);
    n %= size;
  });
  if (n) parts.push(underHundred(n));
  return parts.join(" ");
}
function amountInWords(amount) {
  const total = Math.round((Number(amount) || 0) * 100);
  const rupees = Math.floor(total / 100);
  const paise = total % 100;
  return `Rupees ${indianWords(rupees)}${paise ? ` and ${underHundred(paise)} Paise` : ""} Only`;
}

// ---------- text ----------
const setFont = (doc, size, bold) => doc.font(bold ? BOLD : REGULAR).fontSize(size);

// Longest start of the text that fits, with an ellipsis
function fit(doc, text, width) {
  const s = String(text ?? "");
  if (doc.widthOfString(s) <= width) return s;
  let lo = 0;
  let hi = s.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (doc.widthOfString(`${s.slice(0, mid)}...`) <= width) lo = mid;
    else hi = mid - 1;
  }
  return `${s.slice(0, lo).trimEnd()}...`;
}

// Word-wrapped lines, at most `max`, the last one cut to fit
function wrap(doc, text, width, max = 3) {
  const words = String(text ?? "").split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (let i = 0; i < words.length; i++) {
    const next = line ? `${line} ${words[i]}` : words[i];
    if (doc.widthOfString(next) <= width || !line) {
      line = next;
      continue;
    }
    if (lines.length === max - 1) {
      lines.push(fit(doc, words.slice(i - line.split(" ").length).join(" "), width));
      return lines;
    }
    lines.push(line);
    line = words[i];
  }
  if (line) lines.push(fit(doc, line, width));
  return lines;
}

function putText(doc, text, x, y, { size = 8, bold = false, color = INK, width, align = "left", shrink = false } = {}) {
  setFont(doc, size, bold).fillColor(color);
  // A batch number must stay readable whole: smaller type before cutting it
  if (shrink && width) {
    const smallest = Math.max(4.5, (size * width) / Math.max(doc.widthOfString(String(text ?? "")), 1));
    if (smallest < size) setFont(doc, smallest, bold);
  }
  const s = width ? fit(doc, text, width) : String(text ?? "");
  doc.text(s, x, y, { lineBreak: false, width, align });
}

const put = putText;

const hairline = (doc, x1, x2, y, color = RULE, weight = 0.5) =>
  doc.save().strokeColor(color).lineWidth(weight).moveTo(x1, y).lineTo(x2, y).stroke().restore();

// ---------- A4 and A5 ----------
const PAGE_SPECS = {
  a4: { width: 595.28, height: 841.89, margin: 36, shop: 15, base: 8.5, small: 7.5, tiny: 6.8, cell: 8, cellSub: 6.8, logo: 48, qr: 76, rightWidth: 190, pad: 5 },
  a5: { width: 419.53, height: 595.28, margin: 22, shop: 12, base: 7.5, small: 6.8, tiny: 6, cell: 7.2, cellSub: 6, logo: 36, qr: 62, rightWidth: 150, pad: 4 },
};

function renderInvoice(doc, m, format) {
  const s = PAGE_SPECS[format];
  const left = s.margin;
  const right = s.width - s.margin;
  const contentWidth = right - left;
  const bottom = s.height - s.margin - 12;
  let y = s.margin;

  const fullHeader = () => {
    let textX = left;
    if (m.logo) {
      try {
        doc.image(m.logo, left, y, { fit: [s.logo, s.logo] });
        textX = left + s.logo + 10;
      } catch {
        // A logo that can't be read just leaves the name at the margin
      }
    }
    const metaWidth = contentWidth * 0.34;
    const textWidth = right - metaWidth - 10 - textX;
    let ty = y;
    put(doc, m.seller.name, textX, ty, { size: s.shop, bold: true, width: textWidth });
    ty += s.shop + 4;
    setFont(doc, s.small);
    for (const line of wrap(doc, m.seller.address, textWidth, 2)) {
      put(doc, line, textX, ty, { size: s.small, color: MUTED, width: textWidth });
      ty += s.small + 2.5;
    }
    for (const [label, value] of m.seller.lines) {
      if (!value) continue;
      setFont(doc, s.small, true);
      const lw = doc.widthOfString(`${label}  `);
      put(doc, label, textX, ty, { size: s.small, bold: true, color: MUTED });
      put(doc, value, textX + lw, ty, { size: s.small, width: textWidth - lw });
      ty += s.small + 2.5;
    }

    const metaX = right - metaWidth;
    put(doc, m.title, metaX, y + 1, { size: s.small, bold: true, color: ACCENT, width: metaWidth, align: "right" });
    put(doc, m.number, metaX, y + s.small + 6, { size: s.shop - 2, bold: true, width: metaWidth, align: "right" });
    put(doc, m.date, metaX, y + s.small + s.shop + 7, { size: s.small, color: MUTED, width: metaWidth, align: "right" });

    y = Math.max(ty, y + (m.logo ? s.logo : 0), y + s.small + s.shop + 7 + s.small + 2) + 6;
    hairline(doc, left, right, y, ACCENT, 1.2);
    y += 9;

    // Who it's for, and where it stands
    const gap = 16;
    const colWidth = (contentWidth - gap) / 2;
    const start = y;
    put(doc, m.party.heading, left, y, { size: s.tiny, bold: true, color: MUTED });
    y += s.tiny + 3.5;
    put(doc, m.party.name, left, y, { size: s.base + 1, bold: true, width: colWidth });
    y += s.base + 4;
    setFont(doc, s.small);
    for (const raw of m.party.lines) {
      if (!raw) continue;
      for (const line of wrap(doc, raw, colWidth, 2)) {
        put(doc, line, left, y, { size: s.small, color: MUTED, width: colWidth });
        y += s.small + 2.5;
      }
    }
    let ry = start;
    const rx = left + colWidth + gap;
    for (const [label, value, tone] of m.meta) {
      if (!value) continue;
      put(doc, label, rx, ry, { size: s.small, color: MUTED });
      put(doc, value, rx + 54, ry, { size: s.small, bold: true, color: TONES[tone] || INK, width: colWidth - 54, align: "right" });
      ry += s.small + 4;
    }
    y = Math.max(y, ry) + 7;
  };

  const compactHeader = () => {
    put(doc, m.seller.name, left, y, { size: s.base + 1, bold: true, width: contentWidth * 0.6 });
    put(doc, `${m.number}  ·  ${m.date}`, left + contentWidth * 0.6, y + 1, { size: s.small, color: MUTED, width: contentWidth * 0.4, align: "right" });
    y += s.base + 7;
    hairline(doc, left, right, y, ACCENT, 1);
    y += 8;
  };

  // Column x and width: the flexible column takes what the others leave
  const columns = m.columns[format];
  const fixed = columns.reduce((sum, c) => sum + (c.w || 0), 0);
  let cx = left;
  const cols = columns.map((c) => {
    const col = { ...c, x: cx, w: c.w || contentWidth - fixed };
    cx += col.w;
    return col;
  });
  const CELL_X = 3;

  const tableHead = () => {
    const h = s.tiny + 9;
    doc.save().fillColor(BAND).rect(left, y, contentWidth, h).fill().restore();
    for (const c of cols) {
      put(doc, c.label, c.x + CELL_X, y + 4.5, { size: s.tiny, bold: true, color: MUTED, width: c.w - CELL_X * 2, align: c.align || "left" });
    }
    y += h;
  };

  const cellOf = (v) => (v && typeof v === "object" ? v : { t: v });
  const rowHeight = (row) => {
    let h = 0;
    for (const c of cols) {
      const cell = cellOf(row[c.key]);
      setFont(doc, s.cell, !!(c.strong || cell.bold));
      const lines = c.flex ? wrap(doc, cell.t, c.w - CELL_X * 2, 3).length : 1;
      h = Math.max(h, lines * (s.cell + 2) + (cell.s ? s.cellSub + 2 : 0));
    }
    return h + s.pad * 2;
  };

  const drawRow = (row) => {
    const top = y + s.pad;
    for (const c of cols) {
      const cell = cellOf(row[c.key]);
      const width = c.w - CELL_X * 2;
      const bold = !!(c.strong || cell.bold);
      const color = TONES[cell.tone] || INK;
      let ly = top;
      setFont(doc, s.cell, bold);
      const lines = c.flex ? wrap(doc, cell.t, width, 3) : [cell.t];
      for (const line of lines) {
        put(doc, line, c.x + CELL_X, ly, { size: s.cell, bold, color, width, align: c.align || "left", shrink: c.shrink });
        ly += s.cell + 2;
      }
      if (cell.s) put(doc, cell.s, c.x + CELL_X, ly, { size: s.cellSub, color: TONES[cell.subTone] || MUTED, width, align: c.align || "left" });
    }
    y += rowHeight(row);
    hairline(doc, left, right, y);
  };

  const newPage = () => {
    doc.addPage();
    y = s.margin;
    compactHeader();
  };

  fullHeader();
  tableHead();
  for (const row of m.rows) {
    if (y + rowHeight(row) > bottom) {
      newPage();
      tableHead();
    }
    drawRow(row);
  }
  put(doc, m.countLabel, left + CELL_X, y + 4, { size: s.small, bold: true, color: MUTED, width: contentWidth / 2 });
  y += s.small + 12;

  // ---------- totals ----------
  const leftWidth = contentWidth - s.rightWidth - 16;
  const rightX = right - s.rightWidth;
  const leftBlocks = [];

  setFont(doc, s.small, true);
  const words = wrap(doc, amountInWords(m.net), leftWidth, 2);
  leftBlocks.push({
    h: s.tiny + 4 + words.length * (s.small + 2.5) + 8,
    draw(ty) {
      put(doc, "AMOUNT IN WORDS", left, ty, { size: s.tiny, bold: true, color: MUTED });
      words.forEach((line, i) => put(doc, line, left, ty + s.tiny + 4 + i * (s.small + 2.5), { size: s.small, bold: true, width: leftWidth }));
    },
  });

  if (m.gstRows.length) {
    const rowH = s.tiny + 5.5;
    const cw = leftWidth / 5;
    const heads = [["GST %", "left"], ["Taxable", "right"], ["CGST", "right"], ["SGST", "right"], ["Total", "right"]];
    leftBlocks.push({
      h: rowH * (m.gstRows.length + 1) + 9,
      draw(ty) {
        doc.save().fillColor(BAND).rect(left, ty, leftWidth, rowH).fill().restore();
        heads.forEach(([label, align], i) => put(doc, label, left + i * cw + 2, ty + 2.8, { size: s.tiny, bold: true, color: MUTED, width: cw - 4, align }));
        m.gstRows.forEach((r, ri) => {
          const ry = ty + rowH * (ri + 1);
          [`${rate(r.rate)}%`, money(r.taxable), money(r.cgst), money(r.sgst), money(r.cgst + r.sgst)].forEach((v, i) =>
            put(doc, v, left + i * cw + 2, ry + 2.8, { size: s.tiny, width: cw - 4, align: heads[i][1] })
          );
          hairline(doc, left, left + leftWidth, ry + rowH);
        });
      },
    });
  }

  if (m.saved) {
    leftBlocks.push({
      h: s.small + 12,
      draw(ty) {
        doc.save().fillColor("#f0fdf4").rect(left, ty, leftWidth, s.small + 7).fill().restore();
        put(doc, m.saved, left + 5, ty + 3.5, { size: s.small, bold: true, color: GOOD, width: leftWidth - 10 });
      },
    });
  }

  if (m.note) {
    setFont(doc, s.small);
    const lines = wrap(doc, m.note, leftWidth, 3);
    leftBlocks.push({
      h: s.tiny + 4 + lines.length * (s.small + 2.5) + 6,
      draw(ty) {
        put(doc, m.noteLabel || "REMARKS", left, ty, { size: s.tiny, bold: true, color: MUTED });
        lines.forEach((line, i) => put(doc, line, left, ty + s.tiny + 4 + i * (s.small + 2.5), { size: s.small, width: leftWidth }));
      },
    });
  }

  const totalRowH = s.base + 5;
  const netH = s.base + 14;
  const summaryH = totalRowH * m.summary.length + netH + 6 + totalRowH * m.after.length;
  const leftH = leftBlocks.reduce((sum, b) => sum + b.h, 0);

  // Bank details, payment QR, signature
  const bankRows = m.bank ? m.bank.filter(([, v]) => v) : [];
  const stripH = Math.max(m.qr ? s.qr + s.tiny * 2 + 8 : 0, bankRows.length ? (bankRows.length + 1) * (s.small + 3) : 0, 38);

  if (y + Math.max(leftH, summaryH) + stripH + 10 > bottom) newPage();

  let ly = y;
  for (const b of leftBlocks) {
    b.draw(ly);
    ly += b.h;
  }

  let ty = y;
  for (const [label, value, tone] of m.summary) {
    const color = TONES[tone] || INK;
    put(doc, label, rightX, ty, { size: s.base, color: tone ? color : MUTED, bold: !!tone, width: s.rightWidth * 0.62 });
    put(doc, value, rightX, ty, { size: s.base, color, bold: !!tone, width: s.rightWidth, align: "right" });
    ty += totalRowH;
  }
  doc.save().fillColor(INK).rect(rightX, ty, s.rightWidth, netH).fill().restore();
  put(doc, m.netLabel, rightX + 6, ty + 5.5, { size: s.base, bold: true, color: "#ffffff" });
  put(doc, `Rs ${money(m.net)}`, rightX + 6, ty + 5, { size: s.base + 1.5, bold: true, color: "#ffffff", width: s.rightWidth - 12, align: "right" });
  ty += netH + 6;
  for (const [label, value, tone] of m.after) {
    const color = TONES[tone] || INK;
    put(doc, label, rightX, ty, { size: s.base, color: tone ? color : MUTED, bold: !!tone });
    put(doc, value, rightX, ty, { size: s.base, color, bold: !!tone, width: s.rightWidth, align: "right" });
    ty += totalRowH;
  }

  y = Math.max(ly, ty) + 6;
  hairline(doc, left, right, y);
  y += 7;

  if (bankRows.length) {
    put(doc, "BANK DETAILS", left, y, { size: s.tiny, bold: true, color: MUTED });
    bankRows.forEach(([label, value], i) => {
      const ry = y + s.tiny + 4 + i * (s.small + 3);
      put(doc, label, left, ry, { size: s.small, color: MUTED });
      put(doc, value, left + 38, ry, { size: s.small, bold: true, width: contentWidth * 0.42 - 38 });
    });
  }
  if (m.qr) {
    const qx = rightX - s.qr - 14;
    doc.image(m.qr.buffer, qx, y, { width: s.qr, height: s.qr });
    put(doc, "SCAN TO PAY", qx - 10, y + s.qr + 3, { size: s.tiny, bold: true, width: s.qr + 20, align: "center" });
    put(doc, `Rs ${money(m.qr.amount)}`, qx - 10, y + s.qr + s.tiny + 5, { size: s.tiny, color: MUTED, width: s.qr + 20, align: "center" });
  }
  hairline(doc, rightX + 20, right, y + stripH - s.small - 5, MUTED);
  put(doc, m.signLabel, rightX + 20, y + stripH - s.small - 2, { size: s.small, color: MUTED, width: s.rightWidth - 20, align: "center" });

  // Footers, once the page count is known
  const { start, count } = doc.bufferedPageRange();
  for (let i = start; i < start + count; i++) {
    doc.switchToPage(i);
    const fy = s.height - s.margin + 2;
    put(doc, `E&OE  ·  Page ${i - start + 1} of ${count}`, left, fy, { size: s.tiny, color: MUTED });
    put(doc, m.generated, left, fy, { size: s.tiny, color: MUTED, width: contentWidth, align: "right" });
  }
}

// ---------- thermal receipts ----------
// Black only: thermal heads have no grey. Returns the height used.
const RECEIPT_SPECS = {
  receipt_80: { width: 226.77, margin: 11, shop: 12.5, base: 8.5, small: 7.5, net: 12, qr: 92 },
  receipt_58: { width: 164.41, margin: 8, shop: 10.5, base: 7.5, small: 6.8, net: 10.5, qr: 78 },
};

function renderReceipt(doc, m, format) {
  const s = RECEIPT_SPECS[format];
  const put = (d, text, x, y, o) => putText(d, text, x, y, { color: "#000000", ...o });
  const left = s.margin;
  const width = s.width - s.margin * 2;
  const right = left + width;
  let y = s.margin;

  const center = (text, { size = s.small, bold = false, max = 3 } = {}) => {
    setFont(doc, size, bold);
    for (const line of wrap(doc, text, width, max)) {
      put(doc, line, left, y, { size, bold, width, align: "center" });
      y += size + 2.5;
    }
  };
  const pair = (label, value, { size = s.base, bold = false } = {}) => {
    setFont(doc, size, bold);
    const vw = Math.min(doc.widthOfString(String(value ?? "")), width * 0.72);
    put(doc, label, left, y, { size, bold, width: width - vw - 4 });
    put(doc, value, left, y, { size, bold, width, align: "right" });
    y += size + 3.5;
  };
  const dashed = () => {
    y += 1.5;
    doc.save().strokeColor("#000000").lineWidth(0.6).dash(2.5, { space: 2 }).moveTo(left, y).lineTo(right, y).stroke().undash().restore();
    y += 5;
  };
  const solid = () => {
    y += 1;
    doc.save().strokeColor("#000000").lineWidth(1).moveTo(left, y).lineTo(right, y).stroke().restore();
    y += 4;
  };

  center(m.seller.name, { size: s.shop, bold: true, max: 2 });
  y += 1;
  if (m.seller.address) center(m.seller.address, { max: 3 });
  for (const [label, value] of m.seller.lines) if (value) center(`${label} ${value}`);
  dashed();
  center(m.title, { size: s.small, bold: true });
  y += 1;
  pair(m.numberLabel, m.number, { bold: true });
  pair("Date", m.date, { size: s.small });
  if (m.party.name) pair(m.receiptPartyLabel, m.party.name, { size: s.small });
  for (const [label, value] of m.receiptMeta) if (value) pair(label, value, { size: s.small });
  dashed();

  m.receiptRows.forEach((r, i) => {
    setFont(doc, s.base, true);
    for (const line of wrap(doc, `${i + 1}. ${r.name}`, width, 3)) {
      put(doc, line, left, y, { size: s.base, bold: true, width });
      y += s.base + 2.5;
    }
    pair(r.qty, r.amount, { size: s.base });
    setFont(doc, s.small);
    for (const detail of r.details) {
      for (const line of wrap(doc, detail, width, 2)) {
        put(doc, line, left, y, { size: s.small, width });
        y += s.small + 2.5;
      }
    }
    y += 3;
  });
  dashed();
  put(doc, m.countLabel, left, y, { size: s.small, bold: true, width });
  y += s.small + 4;
  for (const [label, value] of m.summary) pair(label, value);
  solid();
  pair(m.netLabel, `Rs ${money(m.net)}`, { size: s.net, bold: true });
  solid();
  for (const [label, value, tone] of m.after) pair(label, value, { bold: !!tone });
  if (m.gstLine) center(m.gstLine);
  if (m.saved) {
    y += 2;
    center(m.saved, { size: s.base, bold: true });
  }
  if (m.qr) {
    y += 5;
    doc.image(m.qr.buffer, left + (width - s.qr) / 2, y, { width: s.qr, height: s.qr });
    y += s.qr + 3;
    center(`Scan to pay Rs ${money(m.qr.amount)}`, { bold: true });
  }
  if (m.note) {
    y += 3;
    center(m.note, { max: 4 });
  }
  dashed();
  center(m.generated, { size: s.small - 0.6 });
  return y + s.margin;
}

// ---------- entry ----------
const collect = (doc) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

async function renderFormat(model, format) {
  if (format === "a4" || format === "a5") {
    const s = PAGE_SPECS[format];
    const doc = new PDFDocument({ size: [s.width, s.height], margin: 0, bufferPages: true, info: { Title: model.pdfTitle } });
    const done = collect(doc);
    renderInvoice(doc, model, format);
    doc.end();
    return done;
  }
  // A roll is as long as its content: measure on a very tall page, then draw
  const { width } = RECEIPT_SPECS[format];
  const measure = new PDFDocument({ size: [width, 14000], margin: 0 });
  const measured = collect(measure);
  const height = renderReceipt(measure, model, format);
  measure.end();
  await measured;
  const doc = new PDFDocument({ size: [width, Math.ceil(height)], margin: 0, info: { Title: model.pdfTitle } });
  const done = collect(doc);
  renderReceipt(doc, model, format);
  doc.end();
  return done;
}

const billColumns = {
  a4: [
    { key: "no", label: "#", w: 22 },
    { key: "item", label: "ITEM", flex: true, strong: true },
    { key: "hsn", label: "HSN", w: 44 },
    { key: "batch", label: "BATCH", w: 58, shrink: true },
    { key: "exp", label: "EXP", w: 32 },
    { key: "qty", label: "QTY", w: 46, align: "right" },
    { key: "mrp", label: "MRP", w: 50, align: "right" },
    { key: "disc", label: "DISC", w: 40, align: "right" },
    { key: "gst", label: "GST%", w: 28, align: "right" },
    { key: "amount", label: "AMOUNT", w: 56, align: "right", strong: true },
  ],
  a5: [
    { key: "no", label: "#", w: 20 },
    { key: "item", label: "ITEM", flex: true, strong: true },
    { key: "batchExp", label: "BATCH / EXP", w: 56, shrink: true },
    { key: "qty", label: "QTY", w: 40, align: "right" },
    { key: "mrp", label: "MRP", w: 42, align: "right" },
    { key: "disc", label: "DISC", w: 34, align: "right" },
    { key: "amount", label: "AMOUNT", w: 48, align: "right", strong: true },
  ],
};

const purchaseColumns = {
  a4: [
    { key: "no", label: "#", w: 22 },
    { key: "item", label: "ITEM", flex: true, strong: true },
    { key: "batchExp", label: "BATCH / EXP", w: 62, shrink: true },
    { key: "packs", label: "PACKS", w: 40, align: "right" },
    { key: "units", label: "UNITS", w: 32, align: "right" },
    { key: "rate", label: "RATE", w: 44, align: "right" },
    { key: "disc", label: "DISC", w: 40, align: "right" },
    { key: "gst", label: "GST%", w: 28, align: "right" },
    { key: "mrp", label: "MRP/U", w: 38, align: "right" },
    { key: "amount", label: "AMOUNT", w: 56, align: "right", strong: true },
  ],
  a5: [
    { key: "no", label: "#", w: 20 },
    { key: "item", label: "ITEM", flex: true, strong: true },
    { key: "batchExp", label: "BATCH / EXP", w: 54, shrink: true },
    { key: "packs", label: "PACKS", w: 34, align: "right" },
    { key: "rate", label: "RATE", w: 38, align: "right" },
    { key: "disc", label: "DISC", w: 36, align: "right" },
    { key: "gst", label: "GST", w: 22, align: "right" },
    { key: "amount", label: "AMOUNT", w: 46, align: "right", strong: true },
  ],
};

module.exports = { FORMATS, LEGACY_FORMAT, isNewFormat, renderFormat, formatExpiry, money, rate, billColumns, purchaseColumns, amountInWords };
