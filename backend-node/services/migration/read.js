// Turns an uploaded Excel or CSV file into rows of cell values, finds the
// heading row, and guesses which column holds which field.
const ExcelJS = require("exceljs");
const { headerKey } = require("./fields");

const MAX_ROWS = 200000;
const HEADER_SCAN_ROWS = 30;

class ImportFileError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
  }
}

// RFC 4180 CSV with the delimiter guessed from the first lines (, ; tab |)
function parseCsv(text) {
  const sample = text.slice(0, 5000);
  const delims = [",", ";", "\t", "|"];
  const delim = delims.map((d) => [d, sample.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === delim) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      if (rows.length > MAX_ROWS + HEADER_SCAN_ROWS) break;
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

const decodeText = (buffer) => {
  const utf8 = buffer.toString("utf8");
  // Not valid UTF-8 (old Windows exports): read it as Windows-1252/Latin-1
  return (utf8.includes("�") ? buffer.toString("latin1") : utf8).replace(/^﻿/, "");
};

// Excel cell values come as numbers, strings, Dates, rich text or formula results
const cellValue = (v) => {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v;
  if (typeof v === "object") {
    if ("result" in v) return cellValue(v.result);
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join("");
    if ("text" in v) return String(v.text);
    if ("error" in v) return "";
  }
  return v;
};

async function readSheets(buffer, fileName) {
  const name = String(fileName || "").toLowerCase();
  const isZip = buffer[0] === 0x50 && buffer[1] === 0x4b;
  const isOldExcel = buffer.subarray(0, 4).toString("hex") === "d0cf11e0";
  if (isOldExcel || name.endsWith(".xls")) {
    throw new ImportFileError("This is an old .xls Excel file. Open it in Excel and save it as .xlsx (Excel Workbook) or CSV, then upload that.");
  }
  if (isZip) {
    const book = new ExcelJS.Workbook();
    try {
      await book.xlsx.load(buffer);
    } catch {
      throw new ImportFileError("We couldn't open this Excel file. Save it again as .xlsx or CSV and upload that.");
    }
    return book.worksheets.map((ws) => {
      const rows = [];
      ws.eachRow({ includeEmpty: true }, (r, n) => {
        if (n > MAX_ROWS + HEADER_SCAN_ROWS) return;
        const cells = [];
        r.eachCell({ includeEmpty: true }, (c, col) => {
          cells[col - 1] = cellValue(c.value);
        });
        rows[n - 1] = Array.from(cells, (c) => (c === undefined ? "" : c));
      });
      return { name: ws.name, rows: Array.from(rows, (r) => r || []) };
    });
  }
  if (name.endsWith(".pdf")) throw new ImportFileError("PDF files can't be imported yet. Export the report to Excel or CSV instead.");
  return [{ name: "CSV", rows: parseCsv(decodeText(buffer)) }];
}

// The row (within the first few) whose cells look most like headings for this kind of import
function findHeader(rows, fields) {
  const all = new Set(fields.flatMap((f) => f.synonyms));
  let best = { index: -1, score: 0 };
  rows.slice(0, HEADER_SCAN_ROWS).forEach((row, index) => {
    const score = new Set(row.map(headerKey).filter((k) => k && all.has(k))).size;
    if (score > best.score) best = { index, score };
  });
  return best.score >= 2 ? best.index : -1;
}

// field key -> column index. Exact heading matches first, then headings that
// contain a longer synonym ("Item Name / Description"). A column is used once.
function guessMapping(headers, fields) {
  const keys = headers.map(headerKey);
  const used = new Set();
  const mapping = {};
  for (const f of fields) {
    const i = keys.findIndex((k, idx) => !used.has(idx) && k && f.synonyms.includes(k));
    if (i >= 0) {
      mapping[f.key] = i;
      used.add(i);
    }
  }
  for (const f of fields) {
    if (mapping[f.key] !== undefined) continue;
    const i = keys.findIndex((k, idx) => !used.has(idx) && k && f.synonyms.some((s) => s.length >= 4 && k.includes(s)));
    if (i >= 0) {
      mapping[f.key] = i;
      used.add(i);
    }
  }
  return mapping;
}

// Picks the sheet and heading row that best fit, and returns the data rows after it
async function readImportFile(buffer, fileName, fields) {
  const sheets = await readSheets(buffer, fileName);
  let pick = null;
  for (const sheet of sheets) {
    const headerIndex = findHeader(sheet.rows, fields);
    if (headerIndex < 0) continue;
    const headers = sheet.rows[headerIndex].map((h) => String(h ?? "").trim());
    const mapping = guessMapping(headers, fields);
    const score = Object.keys(mapping).length;
    if (!pick || score > pick.score) pick = { sheet, headerIndex, headers, mapping, score };
  }
  if (!pick) {
    const first = sheets[0]?.rows || [];
    const headerIndex = first.findIndex((r) => r.filter((c) => String(c).trim()).length >= 2);
    if (headerIndex < 0) throw new ImportFileError("This file has no rows we can read.");
    const headers = first[headerIndex].map((h) => String(h ?? "").trim());
    pick = { sheet: sheets[0], headerIndex, headers, mapping: {}, score: 0 };
  }
  const dataRows = pick.sheet.rows
    .slice(pick.headerIndex + 1)
    .map((cells, i) => ({ row_no: pick.headerIndex + i + 2, cells }))
    .filter((r) => r.cells.some((c) => String(c ?? "").trim() !== ""));
  if (dataRows.length > MAX_ROWS) throw new ImportFileError(`This file has more than ${MAX_ROWS.toLocaleString("en-IN")} rows. Split it into smaller files.`);
  return { sheet: pick.sheet.name, header_row: pick.headerIndex + 1, headers: pick.headers, mapping: pick.mapping, rows: dataRows };
}

module.exports = { readImportFile, parseCsv, guessMapping, findHeader, ImportFileError };
