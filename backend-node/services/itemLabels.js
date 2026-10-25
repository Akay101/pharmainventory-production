// Mini QR labels for stock batches, stuck on the pack so it can be billed by
// scanning (Billing: scanner in the product search, or "Scan item QR").
//
// QR payload: DD1|<inventory id>|<batch>|<YYYY-MM expiry>|<MRP per unit>|<name>
// The id is what billing uses; the rest is printed and kept for reference.
const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");

const MM = 72 / 25.4; // PDF points per mm
const PREFIX = "DD1";

const LAYOUTS = {
  // A4 sheets (sizes of common sticker sheets); print at 100% scale
  a4_126: { label: "A4 · Mini 26×15 mm · 126 per page", page: "A4", w: 26, h: 15, cols: 7, rows: 18, left: 9.5, top: 13.5, gapX: 1.5, gapY: 0 },
  a4_65: { label: "A4 · Small 38×21 mm · 65 per page", page: "A4", w: 38.1, h: 21.2, cols: 5, rows: 13, left: 4.7, top: 10.7, gapX: 2.5, gapY: 0 },
  a4_44: { label: "A4 · Medium 48×25 mm · 44 per page", page: "A4", w: 48.5, h: 25.4, cols: 4, rows: 11, left: 8, top: 8.8, gapX: 0, gapY: 0 },
  a4_24: { label: "A4 · Large 64×34 mm · 24 per page", page: "A4", w: 63.5, h: 33.9, cols: 3, rows: 8, left: 7.2, top: 12.9, gapX: 2.5, gapY: 0 },
  // Thermal / label printer rolls: one label per page
  roll_50x25: { label: "Label roll 50×25 mm", page: [50 * MM, 25 * MM], w: 50, h: 25, cols: 1, rows: 1, left: 0, top: 0, gapX: 0, gapY: 0 },
  roll_38x25: { label: "Label roll 38×25 mm", page: [38 * MM, 25 * MM], w: 38, h: 25, cols: 1, rows: 1, left: 0, top: 0, gapX: 0, gapY: 0 },
};

const clean = (v) => String(v ?? "").replace(/[|\r\n]/g, " ").trim();
const ym = (d) => (/^\d{4}-\d{2}/.test(String(d || "")) ? String(d).slice(0, 7) : "");
const mmYY = (d) => (/^\d{4}-\d{2}/.test(String(d || "")) ? `${String(d).slice(5, 7)}/${String(d).slice(2, 4)}` : "-");

function encodeLabel(b) {
  return [PREFIX, b.id, clean(b.batch_no).slice(0, 20), ym(b.expiry_date), Number(b.mrp || 0).toFixed(2), clean(b.product_name).slice(0, 20)].join("|");
}

// "DD1|<id>|..." (or a bare id) -> { id, batch_no, expiry, mrp, name }
function parseLabel(raw) {
  const s = String(raw || "").trim();
  const parts = s.split("|");
  if (parts[0] === PREFIX && /^[A-Za-z0-9-]{8,64}$/.test(parts[1] || "")) {
    return { id: parts[1], batch_no: parts[2] || "", expiry: parts[3] || "", mrp: Number(parts[4]) || null, name: parts.slice(5).join("|") };
  }
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return { id: s };
  return null;
}

/**
 * lines: [{ batch (inventory doc), copies }]; returns a PDF buffer.
 * skip: labels already used at the start of an A4 sheet.
 */
async function labelsPdf({ lines, layout = "a4_65", skip = 0, pharmacyName = "" }) {
  const L = LAYOUTS[layout] || LAYOUTS.a4_65;
  const perPage = L.cols * L.rows;
  const queue = [];
  for (let i = 0; i < Math.min(skip, perPage - 1); i++) queue.push(null);
  for (const { batch, copies } of lines) for (let c = 0; c < copies; c++) queue.push(batch);

  // One QR image per batch
  const qr = new Map();
  for (const { batch } of lines) {
    if (!qr.has(batch.id)) qr.set(batch.id, await QRCode.toBuffer(encodeLabel(batch), { errorCorrectionLevel: "L", margin: 1, width: 240 }));
  }

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: L.page, margin: 0, autoFirstPage: false });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    queue.forEach((batch, n) => {
      const slot = n % perPage;
      if (slot === 0) doc.addPage({ size: L.page, margin: 0 });
      if (!batch) return;
      const col = slot % L.cols;
      const row = Math.floor(slot / L.cols);
      const x = (L.left + col * (L.w + L.gapX)) * MM;
      const y = (L.top + row * (L.h + L.gapY)) * MM;
      const w = L.w * MM;
      const h = L.h * MM;
      const pad = 1.2 * MM;
      const q = h - 2 * pad; // square QR, full label height
      doc.image(qr.get(batch.id), x + pad, y + pad, { width: q, height: q });

      const tx = x + pad + q + 1 * MM;
      const tw = w - (tx - x) - pad;
      // Text scales with the label; small labels keep the most useful lines
      const big = Math.max(5, Math.min(9, L.h * 0.3));
      const small = Math.max(4.3, big - 1.3);
      const nameLines = L.h >= 20 ? 2 : 1;
      doc.fillColor("#000000").font("Helvetica-Bold").fontSize(big);
      // Name; an ellipsis only where it is cut
      const words = clean(batch.product_name).split(/\s+/).filter(Boolean);
      const lines = [""];
      let cut = false;
      for (const w of words) {
        const cur = lines[lines.length - 1];
        const next = cur ? `${cur} ${w}` : w;
        if (doc.widthOfString(next) <= tw || !cur) lines[lines.length - 1] = next;
        else if (lines.length < nameLines) lines.push(w);
        else {
          cut = true;
          break;
        }
      }
      if (cut || doc.widthOfString(lines[lines.length - 1]) > tw) {
        let last = lines[lines.length - 1];
        while (last && doc.widthOfString(`${last}…`) > tw) last = last.slice(0, -1);
        lines[lines.length - 1] = `${last.trimEnd()}…`;
      }
      // No wrap width: pdfkit can still wrap a line that measured as fitting
      lines.forEach((l, k) => doc.text(l, tx, y + pad + k * (big + 0.6), { lineBreak: false }));
      let ty = y + pad + lines.length * (big + 0.6) + 0.8;
      const bottom = y + h - pad;
      const room = Math.max(0, Math.floor((bottom - ty) / (small + 1.1)));
      // Most useful first, shown in reading order
      const mrp = Number(batch.mrp || 0).toFixed(2);
      const details = [
        { k: 2, text: [`B: ${clean(batch.batch_no) || "-"}`] },
        { k: 1, text: [`Exp: ${mmYY(batch.expiry_date)}`] },
        { k: 0, text: [`MRP: Rs ${mrp}/u`, `MRP ${mrp}`, mrp], bold: true },
        { k: 3, text: [clean(pharmacyName)], muted: true },
      ]
        .filter((d) => d.text[0] && d.k < room)
        .sort((a, b) => (a.k === 3) - (b.k === 3));
      for (const d of details) {
        doc
          .font(d.bold ? "Helvetica-Bold" : "Helvetica")
          .fontSize(d.muted ? small - 0.5 : small)
          .fillColor(d.muted ? "#555555" : "#000000");
        // Longest wording that fits, else cut with an ellipsis
        let t = d.text.find((v) => doc.widthOfString(v) <= tw);
        if (!t) {
          t = d.text[d.text.length - 1];
          while (t && doc.widthOfString(`${t}…`) > tw) t = t.slice(0, -1);
          t = `${t}…`;
        }
        doc.text(t, tx, ty, { lineBreak: false });
        ty += small + 1.1;
      }
      doc.fillColor("#000000");
    });
    if (!queue.length) doc.addPage({ size: L.page, margin: 0 });
    doc.end();
  });
}

module.exports = { LAYOUTS, encodeLabel, parseLabel, labelsPdf };
