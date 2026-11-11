// The import report: a branded PDF the DavaDesk team can hand to a pharmacy.
// Overview first (what came in, from where, what was missing and what was done
// about it), then every record that was missing something or wasn't imported.
const path = require("path");
const PDFDocument = require("pdfkit");

const LOGO = path.join(__dirname, "../../assets/logoBrand/logoFull.png");
const C = {
  brand: "#EA580C",
  brandSoft: "#FFF7ED",
  ink: "#0F172A",
  text: "#334155",
  muted: "#64748B",
  line: "#E2E8F0",
  band: "#F8FAFC",
  amber: "#B45309",
  amberSoft: "#FEF3C7",
  red: "#B91C1C",
  redSoft: "#FEE2E2",
  green: "#15803D",
  greenSoft: "#DCFCE7",
  blue: "#1D4ED8",
};
const M = 40; // page margin
const HEAD = 52; // space for the running header
const FOOT = 34;

const num = (n) => Number(n || 0).toLocaleString("en-IN");
const money = (n) => `Rs. ${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const when = (iso) => (iso ? new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "-");
const day = (iso) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "-");
const showValue = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? day(v) : String(v));
const kb = (b) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round((b || 0) / 1024))} KB`);
const who = (a) => (a ? a.email || a.name || "-" : "-");

const STATUS = {
  committed: ["Imported", C.green, C.greenSoft],
  partly_undone: ["Undone (some records kept)", C.amber, C.amberSoft],
  undone: ["Undone", C.muted, C.band],
  ready: ["Reviewed, not imported yet", C.amber, C.amberSoft],
  failed_commit: ["Import stopped part-way", C.red, C.redSoft],
};

function renderReport(data) {
  const { job, pharmacy } = data;
  const doc = new PDFDocument({ size: "A4", margins: { top: M + HEAD, bottom: M + FOOT, left: M, right: M }, bufferPages: true, info: { Title: `Data import report - ${pharmacy.name || ""}`, Author: "DavaDesk" } });
  const W = doc.page.width - M * 2;
  const bottom = () => doc.page.height - M - FOOT;
  const ensure = (h) => {
    if (doc.y + h > bottom()) doc.addPage();
  };

  const heading = (title, sub, keepWith = 110) => {
    ensure(keepWith);
    doc.moveDown(0.6);
    const y = doc.y;
    doc.save().rect(M, y + 2, 3, 13).fill(C.brand).restore();
    doc.font("Helvetica-Bold").fontSize(12.5).fillColor(C.ink).text(title, M + 10, y, { width: W - 10 });
    if (sub) doc.font("Helvetica").fontSize(8.5).fillColor(C.muted).text(sub, M + 10, doc.y + 1, { width: W - 10 });
    doc.y += 8;
  };

  // A table that wraps cell text, repeats its heading on each page and never splits a row
  const table = (cols, rows, { cell, zebra = true, font = 8.5 } = {}) => {
    const pad = 5;
    const widths = cols.map((c) => c.w * W);
    const xs = widths.map((_, i) => M + widths.slice(0, i).reduce((a, b) => a + b, 0));
    const head = () => {
      const h = Math.max(...cols.map((c, i) => doc.font("Helvetica-Bold").fontSize(7.5).heightOfString(c.label.toUpperCase(), { width: widths[i] - pad * 2 }))) + pad * 2;
      const y = doc.y;
      doc.save().rect(M, y, W, h).fill(C.band).restore();
      doc.save().moveTo(M, y + h).lineTo(M + W, y + h).lineWidth(0.8).strokeColor(C.line).stroke().restore();
      cols.forEach((c, i) => doc.font("Helvetica-Bold").fontSize(7.5).fillColor(C.muted).text(c.label.toUpperCase(), xs[i] + pad, y + pad, { width: widths[i] - pad * 2, align: c.align || "left", characterSpacing: 0.3 }));
      doc.y = y + h;
    };
    const parts = (row, i) => {
      const v = cell ? cell(row, cols[i], i) : row[cols[i].key];
      return (Array.isArray(v) ? v : [v]).filter((p) => p !== null && p !== undefined && p !== "").map((p) => (typeof p === "object" ? p : { text: String(p) }));
    };
    const measure = (row) =>
      Math.max(
        14,
        ...cols.map((c, i) =>
          parts(row, i).reduce((h, p) => h + doc.font(p.bold ? "Helvetica-Bold" : "Helvetica").fontSize(p.size || font).heightOfString(p.text, { width: widths[i] - pad * 2, lineGap: 1 }) + 1.5, 0)
        )
      ) + pad * 2;

    ensure(60);
    head();
    rows.forEach((row, n) => {
      const h = measure(row);
      if (doc.y + h > bottom()) {
        doc.addPage();
        head();
      }
      const y = doc.y;
      if (zebra && n % 2 === 1) doc.save().rect(M, y, W, h).fill("#FBFCFD").restore();
      cols.forEach((c, i) => {
        let ty = y + pad;
        for (const p of parts(row, i)) {
          doc.font(p.bold ? "Helvetica-Bold" : "Helvetica").fontSize(p.size || font).fillColor(p.color || C.text);
          doc.text(p.text, xs[i] + pad, ty, { width: widths[i] - pad * 2, align: c.align || "left", lineGap: 1 });
          ty = doc.y + 1.5;
        }
      });
      doc.save().moveTo(M, y + h).lineTo(M + W, y + h).lineWidth(0.5).strokeColor(C.line).stroke().restore();
      doc.y = y + h;
    });
    doc.x = M;
    doc.y += 6;
  };

  // ---- Cover and overview ------------------------------------------------------------------
  doc.y = M;
  try {
    doc.image(LOGO, M, M, { width: 150 });
  } catch {
    doc.font("Helvetica-Bold").fontSize(20).fillColor(C.brand).text("DavaDesk", M, M);
  }
  const [stLabel, stColor, stSoft] = STATUS[job.status] || [job.status, C.muted, C.band];
  doc.font("Helvetica-Bold").fontSize(8).fillColor(C.muted).text("DATA IMPORT REPORT", M, M + 6, { width: W, align: "right", characterSpacing: 1 });
  doc.font("Helvetica").fontSize(8).fillColor(C.muted).text(`Generated ${when(new Date().toISOString())}`, M, M + 18, { width: W, align: "right" });
  doc.y = M + 62;
  doc.font("Helvetica-Bold").fontSize(22).fillColor(C.ink).text(pharmacy.name || job.pharmacy_name || "Pharmacy", M, doc.y, { width: W });
  doc.font("Helvetica").fontSize(10.5).fillColor(C.text).text(`${data.entity} imported from ${data.source}${pharmacy.location ? ` · ${pharmacy.location}` : ""}`, { width: W });
  doc.moveDown(0.5);
  const pw = doc.font("Helvetica-Bold").fontSize(9).widthOfString(stLabel) + 18;
  const py = doc.y;
  doc.save().roundedRect(M, py, pw, 18, 9).fill(stSoft).restore();
  doc.font("Helvetica-Bold").fontSize(9).fillColor(stColor).text(stLabel, M + 9, py + 4.5, { lineBreak: false });
  doc.y = py + 28;
  doc.x = M;

  // Key figures
  const sc = data.status_count;
  const res = job.counts?.results || {};
  const notImported = (sc.error || 0) + (sc.skipped || 0) + (res.product_skipped || 0);
  const tiles = [
    ["Records in the file", num(Object.values(sc).reduce((a, b) => a + b, 0)), C.ink],
    ["Imported", num((res.created || 0) + (res.merged || 0)), C.green],
    ["Already in DavaDesk", num(res.duplicate || 0), C.muted],
    ["Not imported", num(notImported), notImported ? C.red : C.muted],
  ];
  const tw = (W - 3 * 10) / 4;
  const ty = doc.y;
  tiles.forEach(([label, value, color], i) => {
    const x = M + i * (tw + 10);
    doc.save().roundedRect(x, ty, tw, 54, 6).lineWidth(0.8).strokeColor(C.line).stroke().restore();
    doc.font("Helvetica-Bold").fontSize(7).fillColor(C.muted).text(label.toUpperCase(), x + 10, ty + 10, { width: tw - 20, characterSpacing: 0.4 });
    doc.font("Helvetica-Bold").fontSize(17).fillColor(color).text(value, x + 10, ty + 25, { width: tw - 20 });
  });
  doc.y = ty + 64;
  doc.x = M;

  heading("Import details");
  const meta = job.meta || {};
  const facts = [
    ["Pharmacy", [pharmacy.name, pharmacy.gst_no && `GSTIN ${pharmacy.gst_no}`].filter(Boolean).join(" · ")],
    ["Imported from", data.source],
    ["What was imported", data.entity],
    ["File", job.file_name],
    ["File format", `${data.format}, ${kb(job.file_bytes)}`],
    ["Read as", meta.label ? `${meta.label}${meta.period_from ? `, ${day(meta.period_from)} to ${day(meta.period_to)}` : ""}` : `Sheet "${job.sheet}", headings on row ${job.header_row}`],
    ["Uploaded", `${when(job.created_at)} by ${who(job.created_by)}`],
    ["Imported", job.committed_at ? `${when(job.committed_at)} by ${who(job.committed_by)}` : "Not imported yet"],
    ...(job.undo ? [["Undone", `${when(job.undo.at)} by ${who(job.undo.by)}`]] : []),
    ["Import ID", job.id],
  ];
  table([{ label: "Detail", w: 0.26 }, { label: "Value", w: 0.74 }], facts, { cell: (r, c, i) => (i === 0 ? { text: r[0], bold: true, color: C.ink } : r[1] || "-"), zebra: false });

  // What the import made
  heading("What was added to DavaDesk", job.undo ? "What the import added. It has since been undone: everything was removed again except the records the pharmacy had used, shown as kept." : null);
  const made = data.made;
  const purchases = job.counts?.purchases;
  const createdRows = [
    job.entity === "purchases" && ["Purchase bills", num(job.undo ? purchases?.bills : made.purchases), purchases ? `${money(purchases.net)} before GST, ${money(purchases.gross)} with GST${meta.file_net_total ? ` (report's grand total ${money(meta.file_net_total)})` : ""}` : ""],
    ["Stock batches added", num(made.inventory), job.entity === "purchases" ? (job.options?.add_to_stock === false ? "Stock wasn't changed for this import" : "Bought quantities added to stock; they show in Inventory and billing") : ""],
    made.topped_up && ["Existing batches topped up", num(made.topped_up), "The pharmacy already had these batches; the bought units were added to them"],
    ["New products in the catalog", num(made.products), made.incomplete_products ? `${num(made.incomplete_products)} still need a manufacturer or salt in the catalog` : ""],
    ["New suppliers", num(made.suppliers), ""],
    job.entity === "customers" && ["New customers", num(made.customers), ""],
  ].filter(Boolean);
  if (job.undo) {
    const collOf = { "Purchase bills": "purchases", "Stock batches added": "inventory", "New products in the catalog": "products", "New suppliers": "suppliers", "New customers": "customers" };
    for (const r of createdRows) {
      const k = collOf[r[0]];
      if (!k) continue;
      const kept = made.kept?.[k] || 0;
      r[2] = [r[2], kept ? `Undone: ${num(kept)} kept because the pharmacy used them, the rest removed` : "Removed when undone"].filter(Boolean).join(". ");
    }
  }
  table([{ label: "Record", w: 0.34 }, { label: "Count", w: 0.14, align: "right" }, { label: "Notes", w: 0.52 }], createdRows, {
    cell: (r, c, i) => (i === 0 ? { text: r[0], bold: true, color: C.ink } : i === 1 ? { text: r[1], bold: true, color: C.ink } : r[2] ? { text: r[2], color: C.muted } : "-"),
  });

  // Missing fields and what was done about them
  heading("Missing information", "Fields that were empty in the file, and how each one was handled before importing.");
  if (!data.fields.length) {
    doc.font("Helvetica").fontSize(9.5).fillColor(C.green).text("Nothing was missing: every field the import needs was in the file.", M, doc.y, { width: W });
    doc.moveDown(0.6);
  } else {
    table(
      [
        { label: "Field", w: 0.2 },
        { label: "Empty in file", w: 0.13, align: "right" },
        { label: "Filled by hand", w: 0.13, align: "right" },
        { label: "Filled for all", w: 0.24 },
        { label: "Left empty", w: 0.13, align: "right" },
        { label: "Still empty", w: 0.17, align: "right" },
      ],
      data.fields,
      {
        cell: (f, c, i) => {
          if (i === 0) return { text: f.label, bold: true, color: C.ink };
          if (i === 1) return { text: num(f.empty_in_file), color: f.empty_in_file ? C.amber : C.muted, bold: !!f.empty_in_file };
          if (i === 2) return [{ text: num(f.filled_by_hand), color: f.filled_by_hand ? C.blue : C.muted }, f.corrected_by_hand ? { text: `+${num(f.corrected_by_hand)} corrected`, color: C.muted, size: 7 } : null];
          if (i === 3) return f.filled_for_all ? [{ text: num(f.filled_for_all), color: C.blue, bold: true }, { text: `with "${showValue(f.fill_value)}"`, color: C.muted, size: 7.5 }] : { text: "-", color: C.muted };
          if (i === 4) return { text: num(f.left_empty), color: f.left_empty ? C.text : C.muted };
          return { text: num(f.still_empty), color: f.still_empty ? C.red : C.muted, bold: !!f.still_empty };
        },
      }
    );
  }

  if (data.filled_everywhere?.length || data.not_in_file?.length) {
    ensure(40);
    const lines = [
      ...(data.filled_everywhere || []).map((f) => `${f.label} wasn't in the file for any of the ${num(f.rows)} records, so every record was given ${showValue(f.value)}.`),
      ...(data.not_in_file?.length ? [`Not part of this file at all: ${data.not_in_file.join(", ")}. Those details can be added later in DavaDesk.`] : []),
    ];
    for (const l of lines) {
      const h = doc.font("Helvetica").fontSize(8.5).heightOfString(l, { width: W - 24 }) + 10;
      ensure(h + 6);
      const y = doc.y;
      doc.save().roundedRect(M, y, W, h, 4).fill(C.brandSoft).restore();
      doc.font("Helvetica").fontSize(8.5).fillColor(C.text).text(l, M + 12, y + 5, { width: W - 24 });
      doc.y = y + h + 5;
    }
    doc.x = M;
  }

  const pd = data.product_decisions;
  if (Object.keys(pd).length) {
    heading("Products", "How each product in the file was matched to the pharmacy's catalog.");
    table(
      [{ label: "Decision", w: 0.4 }, { label: "Products", w: 0.2, align: "right" }, { label: "Meaning", w: 0.4 }],
      [
        ["Matched to an existing product", pd.use || 0, "The pharmacy's own product was used, so no duplicate was made"],
        ["Added as a new product", pd.new || 0, "Created in the catalog with the file's details"],
        ["Left out", pd.skip || 0, "Their rows weren't imported"],
        ...(pd.undecided ? [["Not decided", pd.undecided, "Waiting for a decision before import"]] : []),
      ].filter((r) => r[1]),
      { cell: (r, c, i) => (i === 0 ? { text: r[0], bold: true, color: C.ink } : i === 1 ? { text: num(r[1]), bold: true, color: C.ink } : { text: r[2], color: C.muted }) }
    );
  }

  if (meta.warnings?.length) {
    heading("Notes about the file");
    for (const w of meta.warnings) {
      ensure(24);
      const y = doc.y;
      const h = doc.font("Helvetica").fontSize(9).heightOfString(w, { width: W - 24 }) + 10;
      doc.save().roundedRect(M, y, W, h, 4).fill(C.amberSoft).restore();
      doc.font("Helvetica").fontSize(9).fillColor(C.amber).text(w, M + 12, y + 5, { width: W - 24 });
      doc.y = y + h + 5;
    }
  }

  // ---- Records -------------------------------------------------------------------------------
  doc.addPage();
  heading(
    "Records needing attention",
    data.records.length
      ? `${num(data.records.length)} records were missing something, were changed by hand, or weren't imported. The row is the line number in the original file.`
      : "Every record came in complete and was imported as it was."
  );
  if (data.records.length) {
    const tone = { hand: C.blue, fill: C.blue, left: C.muted, missing: C.amber };
    table(
      [
        { label: "Row", w: 0.06 },
        { label: job.entity === "purchases" ? "Supplier · bill" : "Name", w: 0.22 },
        { label: "Product", w: 0.2 },
        { label: "Batch · expiry", w: 0.13 },
        { label: "Missing or changed", w: 0.23 },
        { label: "Result", w: 0.16 },
      ],
      data.records,
      {
        font: 8,
        cell: (r, c, i) => {
          if (i === 0) return { text: String(r.row_no), color: C.muted };
          if (i === 1) return [{ text: r.who || "-", bold: true, color: C.ink }, r.ref ? { text: r.ref.split(" · ").map(showValue).join(" · "), color: C.muted, size: 7.5 } : null];
          if (i === 2) return r.item || "-";
          if (i === 3) return [{ text: r.batch && !/^n\/?a$/i.test(r.batch) ? r.batch : "No batch", color: r.batch && !/^n\/?a$/i.test(r.batch) ? C.text : C.amber }, { text: r.expiry || "No expiry", color: r.expiry ? C.muted : C.amber, size: 7.5 }];
          if (i === 4) return r.notes.length ? r.notes.map((n) => ({ text: n.text, color: tone[n.kind] || C.text, size: 7.5 })) : { text: "-", color: C.muted };
          const bad = /^Not imported/.test(r.outcome);
          return { text: r.outcome, color: bad ? C.red : /^Skipped/.test(r.outcome) ? C.muted : C.green, bold: bad, size: 7.5 };
        },
      }
    );
  }

  // ---- Running header and footer on every page ----------------------------------------------
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const keep = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    if (i > range.start) {
      try {
        doc.image(LOGO, M, M - 6, { height: 18 });
      } catch {}
      doc.font("Helvetica").fontSize(8).fillColor(C.muted).text(`Data import report · ${pharmacy.name || ""}`, M, M - 1, { width: W, align: "right" });
      doc.save().moveTo(M, M + 20).lineTo(M + W, M + 20).lineWidth(0.6).strokeColor(C.line).stroke().restore();
    }
    const fy = doc.page.height - M - 10;
    doc.save().moveTo(M, fy - 8).lineTo(M + W, fy - 8).lineWidth(0.6).strokeColor(C.line).stroke().restore();
    doc.font("Helvetica").fontSize(7.5).fillColor(C.muted).text(`DavaDesk · ${job.file_name} · Import ${job.id.slice(0, 8)}`, M, fy, { width: W * 0.75, lineBreak: false });
    doc.text(`Page ${i - range.start + 1} of ${range.count}`, M, fy, { width: W, align: "right", lineBreak: false });
    doc.page.margins.bottom = keep;
  }
  doc.end();
  return doc;
}

module.exports = { renderReport };
