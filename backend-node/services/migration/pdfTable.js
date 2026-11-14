// A report printed to PDF (with real text, not a scan) as rows of cells.
// Text pieces on the same line become a row; columns come from where text
// usually starts across the whole document, so the AI can map them like any sheet.
const MAX_PAGES = 3000;
const LINE_TOLERANCE = 2.5; // points

class PdfError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
  }
}

async function readPdfTable(buffer) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  let doc;
  try {
    doc = await pdfjs.getDocument({ data: new Uint8Array(buffer), isEvalSupported: false, disableFontFace: true, useSystemFonts: false, verbosity: 0 }).promise;
  } catch (err) {
    throw new PdfError(/password/i.test(err.message) ? "This PDF is password protected. Remove the password and upload it again." : "We couldn't open this PDF. Export the report to Excel or CSV instead.");
  }
  if (doc.numPages > MAX_PAGES) throw new PdfError(`This PDF has ${doc.numPages} pages. Split it, or export the report to Excel or CSV.`);

  // Every text piece with its page line
  const lines = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const byY = [];
    for (const it of content.items) {
      const str = String(it.str || "").trim();
      if (!str) continue;
      const x = it.transform[4];
      const y = it.transform[5];
      let line = byY.find((l) => Math.abs(l.y - y) <= LINE_TOLERANCE);
      if (!line) byY.push((line = { y, items: [] }));
      line.items.push({ x, end: x + (it.width || 0), str });
    }
    byY.sort((a, b) => b.y - a.y).forEach((l) => lines.push(l.items.sort((a, b) => a.x - b.x)));
    page.cleanup();
  }
  if (!lines.length) throw new PdfError("This PDF has no text we can read (it may be a scan). Export the report to Excel or CSV instead.");

  // Pieces closer than a small gap belong to one cell
  const cellsOf = (items) => {
    const out = [];
    for (const it of items) {
      const last = out[out.length - 1];
      if (last && it.x - last.end < 3) {
        last.str += ` ${it.str}`;
        last.end = it.end;
      } else out.push({ ...it });
    }
    return out;
  };
  const rowsOfCells = lines.map(cellsOf);

  // Column starts: x positions where many cells begin, merged when close together
  const starts = rowsOfCells.flatMap((r) => r.map((c) => Math.round(c.x))).sort((a, b) => a - b);
  const anchors = [];
  for (const x of starts) {
    const a = anchors[anchors.length - 1];
    if (a && x - a.max <= 6) {
      a.max = x;
      a.n++;
      a.sum += x;
    } else anchors.push({ min: x, max: x, n: 1, sum: x });
  }
  const minHits = Math.max(3, Math.floor(rowsOfCells.length * 0.02));
  const cols = anchors.filter((a) => a.n >= minHits).map((a) => a.sum / a.n);
  if (!cols.length) cols.push(0);
  const nearest = (x) => cols.reduce((best, c, i) => (Math.abs(c - x) < Math.abs(cols[best] - x) ? i : best), 0);

  const rows = rowsOfCells.map((cells) => {
    const row = new Array(cols.length).fill("");
    for (const c of cells) {
      const i = nearest(c.x);
      row[i] = row[i] ? `${row[i]} ${c.str}` : c.str;
    }
    return row.map((v) => (/^-?[\d,]+(\.\d+)?$/.test(v) ? Number(v.replace(/,/g, "")) : v));
  });
  return [{ name: "PDF", rows }];
}

module.exports = { readPdfTable, PdfError };
