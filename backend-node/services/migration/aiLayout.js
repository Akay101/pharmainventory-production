// Reads an unfamiliar file's layout with AI, once per layout.
//
// Gemini sees a small sample of the sheet (the top, a few slices from the
// middle, the bottom) and returns a layout: the heading row, which column holds
// which field, which rows to skip (totals, page headers), rows that carry a
// value down to the lines below them (a supplier's name on its own row), and
// whether quantities are loose units or packs. Our own code then applies that
// layout to every row, so a 50 MB file costs the same few thousand tokens as a
// small one. A layout that worked is kept (migration_layouts) and reused for
// the next file with the same headings at no AI cost.
const crypto = require("crypto");
const gemini = require("../ai/gemini");
const meter = require("../credits/meter");
const { getConfig } = require("../credits/config");
const { ENTITIES, HINTS, headerKey } = require("./fields");
const { packing, num, billDate } = require("./normalize");

const MAX_COLS = 40;
const CELL_CHARS = 40;
const TOP_ROWS = 40;
const SLICE_ROWS = 12;

class LayoutError extends Error {
  constructor(message, category = "ai") {
    super(message);
    this.category = category;
  }
}

const cellText = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? "").replace(/\s+/g, " ").trim());
const blank = (v) => /^[-–—*.\s]*$/.test(cellText(v));
const filled = (row) => (row || []).filter((c) => !blank(c)).length;

// The sheet with the most filled rows is the one to import
function mainSheet(sheets) {
  let best = 0;
  sheets.forEach((s, i) => {
    if (s.rows.filter((r) => filled(r) >= 2).length > sheets[best].rows.filter((r) => filled(r) >= 2).length) best = i;
  });
  return best;
}

// Row numbers (0-based) shown to the AI: the top, three slices from the middle, the bottom
function sampleIndexes(n) {
  const set = new Set();
  for (let i = 0; i < Math.min(TOP_ROWS, n); i++) set.add(i);
  for (const f of [0.3, 0.55, 0.8]) {
    const start = Math.floor(n * f);
    for (let i = start; i < Math.min(start + SLICE_ROWS, n); i++) set.add(i);
  }
  for (let i = Math.max(0, n - SLICE_ROWS); i < n; i++) set.add(i);
  return [...set].sort((a, b) => a - b);
}

function sampleText(rows) {
  const width = Math.min(MAX_COLS, Math.max(0, ...rows.map((r) => (r || []).length)));
  let last = -1;
  const lines = [];
  for (const i of sampleIndexes(rows.length)) {
    if (last >= 0 && i > last + 1) lines.push(`... (rows ${last + 2}-${i} not shown)`);
    const cells = Array.from({ length: width }, (_, c) => cellText(rows[i]?.[c]).slice(0, CELL_CHARS));
    while (cells.length && cells[cells.length - 1] === "") cells.pop();
    lines.push(`${i + 1}\t${JSON.stringify(cells)}`);
    last = i;
  }
  return { text: lines.join("\n"), width };
}

function schemaFor(entity) {
  const fieldKeys = ENTITIES[entity].fields.map((f) => f.key);
  const pair = { type: "OBJECT", properties: { field: { type: "STRING", enum: fieldKeys }, column: { type: "INTEGER" } }, required: ["field", "column"] };
  return {
    type: "OBJECT",
    properties: {
      report_type: { type: "STRING" },
      software: { type: "STRING" },
      header_row: { type: "INTEGER" },
      first_data_row: { type: "INTEGER" },
      columns: { type: "ARRAY", items: pair },
      group_fields: { type: "ARRAY", items: pair },
      skip_rows: { type: "ARRAY", items: { type: "OBJECT", properties: { column: { type: "INTEGER" }, pattern: { type: "STRING" } }, required: ["column", "pattern"] } },
      required_columns: { type: "ARRAY", items: { type: "INTEGER" } },
      quantity_unit: { type: "STRING", enum: ["units", "packs"] },
      amount_includes_gst: { type: "BOOLEAN" },
      period_from: { type: "STRING" },
      period_to: { type: "STRING" },
      notes: { type: "STRING" },
      confidence: { type: "NUMBER" },
    },
    required: ["header_row", "first_data_row", "columns", "skip_rows", "required_columns", "quantity_unit", "amount_includes_gst", "confidence"],
  };
}

function promptFor(entity, sample, feedback) {
  const e = ENTITIES[entity];
  const fields = e.fields.map((f) => `- ${f.key}${f.required ? " (needed)" : ""}: ${f.label}${HINTS[f.key] ? `, ${HINTS[f.key]}` : ""}`).join("\n");
  return `You are reading the layout of a pharmacy's data export (from Marg, eVitalRx, LocalWell, Tally or other billing software) so that code can import every row.
What is being imported: ${e.label}.

Fields we can import:
${fields}

Below is a SAMPLE of the sheet: the top rows, a few slices from the middle and the bottom. Each line is "<row number>\\t<JSON array of cells>", cells numbered from 0.

${sample}

Return the layout:
- header_row: row number of the column headings (0 if there are none). first_data_row: row number of the first real data line.
- columns: for each field present in the file, the 0-based column that holds it. Only map a column you are sure of; leave a field out rather than guess. Never map the same column twice. A month column ("May, 2026") is not the bill date.
- group_fields: only for layouts where a value (for example a supplier or customer name) sits ALONE on its own row above its lines and applies to the lines below it: the field and the column it appears in on that row. Otherwise empty.
- skip_rows: regular expressions (JavaScript, case-insensitive) tested against one column's text that identify rows that are NOT data lines: totals, sub-totals, grand totals, repeated headings, page numbers, report titles, adverts. Use short anchored patterns such as "^total$" or "^grand".
- required_columns: columns that are filled on EVERY real data line (for example the item name and quantity columns); a row missing any of them is not a data line.
- quantity_unit: "units" if the quantity counts loose units/tablets (e.g. 15 for one strip of 15, 7 for "1X7"), "packs" if it counts strips/bottles/boxes. Check against rate and amount: if amount ≈ quantity/pack size × rate, it is units.
- amount_includes_gst: true if the line amount already includes GST/tax. Check with the tax amount column: if tax ≈ amount × GST% the amount is BEFORE GST (false); if tax ≈ amount × GST/(100+GST) it includes GST (true). Marg's date-wise analysis prints "Amount" before GST and "Tax Amount" beside it; its bill-wise analysis prints a GST-inclusive "Bill Amount".
- Money columns: map amount to the line's own amount column, never to "MRP Amt"/"MRP Value" (that is mrp_amount). A plain "Discount" column in Marg holds RUPEES (map it to discount_amount); only a column headed with % ("Dis1 %", "Disc %") is the percent discount.
- People: in a purchase file "Party Name" is the supplier (supplier_name) and "GST No." is the supplier's GSTIN (supplier_gst). In a sale file "Party Name" is the ledger (often CASH) → customer_name, and "Patient Name" → patient_name. "Compnay Name"/"Company Name" is the manufacturer.
- bill_type: map the entry type column ("Type": Purc, Sale, Stk., P/Re, S/Re, Brk/) if there is one; returns are recognised from it.
- period_from / period_to: the report period if printed (YYYY-MM-DD), else empty. report_type: a short name of the report. software: the billing software if you can tell.
- notes: one or two sentences on anything unusual. confidence: 0 to 1.
${feedback ? `\nA previous reading of this layout did not work: ${feedback}\nFix it.` : ""}`;
}

function cleanSpec(raw, entity, width) {
  const keys = new Set(ENTITIES[entity].fields.map((f) => f.key));
  const used = new Set();
  const columns = {};
  for (const c of raw.columns || []) {
    if (!keys.has(c.field) || !Number.isInteger(c.column) || c.column < 0 || c.column >= width || used.has(c.column) || columns[c.field] !== undefined) continue;
    used.add(c.column);
    columns[c.field] = c.column;
  }
  const group = {};
  for (const g of raw.group_fields || []) {
    if (keys.has(g.field) && Number.isInteger(g.column) && g.column >= 0 && g.column < width && columns[g.field] === undefined) group[g.field] = g.column;
  }
  const skip = [];
  for (const s of raw.skip_rows || []) {
    if (!Number.isInteger(s.column) || s.column < 0 || s.column >= width) continue;
    const p = String(s.pattern || "").slice(0, 120);
    if (!p || /\([^)]*[+*][^)]*\)[+*{]/.test(p)) continue; // nested repetition can run for ever
    try {
      new RegExp(p, "i");
      skip.push({ column: s.column, pattern: p });
    } catch {}
  }
  return {
    report_type: String(raw.report_type || "").slice(0, 80),
    software: String(raw.software || "").slice(0, 40),
    header_row: Math.max(0, parseInt(raw.header_row, 10) || 0),
    first_data_row: Math.max(1, parseInt(raw.first_data_row, 10) || 1),
    columns,
    group_fields: group,
    skip_rows: skip,
    required_columns: (raw.required_columns || []).filter((c) => Number.isInteger(c) && c >= 0 && c < width),
    quantity_unit: raw.quantity_unit === "units" ? "units" : "packs",
    amount_includes_gst: !!raw.amount_includes_gst,
    period_from: /^\d{4}-\d{2}-\d{2}$/.test(raw.period_from || "") ? raw.period_from : null,
    period_to: /^\d{4}-\d{2}-\d{2}$/.test(raw.period_to || "") ? raw.period_to : null,
    notes: String(raw.notes || "").slice(0, 400),
    confidence: Math.max(0, Math.min(1, Number(raw.confidence) || 0)),
  };
}

/**
 * Applies a layout to every row of a sheet. Returns the data lines with any
 * carried-down values appended as extra columns, the headings and the mapping.
 */
// "PERIOD : 01-04-2026 TO 15-11-2026" printed above the table: this file's own period,
// so a layout saved from another year's file doesn't carry that year's dates
const DATE_RE = "(\\d{1,2}[-/.](?:\\d{1,2}|[a-z]{3})[-/.]\\d{2,4})";
function filePeriod(rows) {
  const re = new RegExp(`${DATE_RE}\\s*(?:to|-|–|till|upto)\\s*${DATE_RE}`, "i");
  for (const r of rows.slice(0, 15)) {
    const m = (r || []).map(cellText).join(" ").match(re);
    if (m) {
      const from = billDate(m[1]);
      const to = billDate(m[2]);
      if (from && to) return { period_from: from, period_to: to };
    }
  }
  return null;
}

function applyLayout(rows, spec) {
  const width = Math.max(0, ...rows.slice(0, 2000).map((r) => (r || []).length));
  const heading = spec.header_row ? (rows[spec.header_row - 1] || []).map(cellText) : [];
  const headingKey = heading.join("|").toLowerCase();
  const skips = spec.skip_rows.map((s) => ({ column: s.column, re: new RegExp(s.pattern, "i") }));
  // The AI's rules may never drop a real line. A row with an item name and a
  // numeric quantity is data, whatever a skip rule says (unless the name reads
  // as a total), and a "must be filled" column has to be filled on every such row.
  const nameCol = spec.columns.product_name ?? spec.columns.name;
  const qtyCol = spec.columns.quantity;
  const TOTALS = /^(grand |sub |net )?total\b|^page\b|^continued\b|^(carried|brought) (forward|fwd)/i;
  const dataLike = (r) =>
    nameCol !== undefined && !blank(r[nameCol]) && !TOTALS.test(cellText(r[nameCol])) && (qtyCol === undefined || /^-?\d+(\.\d+)?$/.test(cellText(r[qtyCol]).replace(/,/g, "")));
  let required = spec.required_columns;
  if (nameCol !== undefined) {
    const real = [];
    for (let i = Math.max(0, spec.first_data_row - 1); i < rows.length; i++) if (rows[i] && dataLike(rows[i])) real.push(rows[i]);
    required = [...new Set([nameCol, ...(qtyCol !== undefined ? [qtyCol] : []), ...spec.required_columns.filter((c) => real.length && real.filter((r) => !blank(r[c])).length / real.length >= 0.999)])];
  }
  const groupFields = Object.entries(spec.group_fields || {});
  const context = Object.fromEntries(groupFields.map(([f]) => [f, ""]));
  const out = [];
  const stats = { lines: 0, skipped: 0, group_rows: 0 };
  for (let i = Math.max(0, spec.first_data_row - 1); i < rows.length; i++) {
    const r = rows[i] || [];
    if (!filled(r)) continue;
    if (heading.length && r.map(cellText).join("|").toLowerCase() === headingKey) {
      stats.skipped++;
      continue;
    }
    if (!dataLike(r) && skips.some((s) => s.re.test(cellText(r[s.column])))) {
      stats.skipped++;
      continue;
    }
    // A carried-down value: the group column filled and (almost) nothing else
    const g = groupFields.find(([, col]) => !blank(r[col]) && filled(r) <= 2);
    if (g && required.some((c) => blank(r[c]))) {
      context[g[0]] = cellText(r[g[1]]);
      stats.group_rows++;
      continue;
    }
    if (required.some((c) => blank(r[c]))) {
      stats.skipped++;
      continue;
    }
    const cells = Array.from({ length: width }, (_, c) => (r[c] === undefined ? "" : r[c]));
    out.push({ row_no: i + 1, cells: [...cells, ...groupFields.map(([f]) => context[f])] });
    stats.lines++;
  }
  const headers = Array.from({ length: width }, (_, c) => heading[c] || `Column ${c + 1}`);
  const mapping = { ...spec.columns };
  groupFields.forEach(([f], k) => {
    headers.push(`${f.replace(/_/g, " ")} (from group rows)`);
    mapping[f] = width + k;
  });
  return { rows: out, headers, mapping, stats };
}

// Opening stock has no amount field, but a purchase or stock report often still
// carries a value column (quantity × rate). If one is found, it settles whether
// the quantities are loose units or packs.
function verifyStockUnits(rows, spec) {
  const c = spec.columns;
  if (c.quantity === undefined || c.purchase_rate === undefined) return spec;
  const used = new Set(Object.values(c));
  const step = Math.max(1, Math.floor(rows.length / 800));
  const lines = [];
  for (let i = 0; i < rows.length; i += step) {
    const r = rows[i].cells;
    const qty = num(r[c.quantity]);
    const rate = num(r[c.purchase_rate]);
    if (!(qty > 0 && rate > 0)) continue;
    const n = packing(c.packing !== undefined ? r[c.packing] : "", false).units || packing(r[c.product_name], true).units || 1;
    lines.push({ r, qty, rate, n });
  }
  if (lines.length < 5) return spec;
  const near = (a, b) => Math.abs(a - b) <= Math.max(0.6, Math.abs(a) * 0.02);
  const width = Math.max(...lines.map((l) => l.r.length));
  let best = null;
  for (let col = 0; col < width; col++) {
    if (used.has(col)) continue;
    for (const unit of ["units", "packs"]) {
      let hits = 0;
      for (const l of lines) if (near(num(l.r[col]), (unit === "units" ? l.qty / l.n : l.qty) * l.rate)) hits++;
      if (!best || hits > best.hits) best = { col, unit, hits };
    }
  }
  // Only lines with more than one unit per pack can tell the two apart
  const telling = lines.filter((l) => l.n > 1);
  if (!best || telling.length < 5 || best.hits < lines.length * 0.6) return spec;
  const other = best.unit === "units" ? "packs" : "units";
  let otherHits = 0;
  for (const l of lines) if (near(num(l.r[best.col]), (other === "units" ? l.qty / l.n : l.qty) * l.rate)) otherHits++;
  if (otherHits >= best.hits) return spec;
  const out = { ...spec, checked: { lines: lines.length, matched: best.hits, changes: [] } };
  if (best.unit !== spec.quantity_unit) {
    out.checked.changes.push(`quantities are ${best.unit}, not ${spec.quantity_unit}`);
    out.quantity_unit = best.unit;
  }
  return out;
}

// Checks the layout's reading of the numbers against the file itself: are
// quantities loose units or packs, does the line amount include GST, and is
// the discount column a percent or rupees? Each guess is tried on the lines
// and the one that reproduces the file's own amounts wins. Changes are noted.
function verifyConventions(entity, rows, spec) {
  if (entity === "stock") return verifyStockUnits(rows, spec);
  if (!["purchases", "sales"].includes(entity)) return spec;
  const c = spec.columns;
  const rateCol = c[entity === "sales" ? "sale_rate" : "purchase_rate"] ?? (entity === "sales" ? c.mrp : undefined);
  if (c.quantity === undefined || c.amount === undefined || rateCol === undefined) return spec;
  const discCol = c.discount ?? c.discount_amount;
  const step = Math.max(1, Math.floor(rows.length / 800));
  const lines = [];
  for (let i = 0; i < rows.length; i += step) {
    const r = rows[i].cells;
    const qty = num(r[c.quantity]);
    const rate = num(r[rateCol]);
    const amount = num(r[c.amount]);
    if (!(qty > 0 && rate > 0 && amount > 0)) continue;
    const pk = packing(c.packing !== undefined ? r[c.packing] : "", false).units || packing(r[c.product_name], true).units || 1;
    lines.push({ qty, rate, amount, n: pk, d: num(r[discCol]) || 0, tax: num(r[c.tax_amount]) || 0, g: num(r[c.gst_rate]) || 0 });
  }
  if (lines.length < 5) return spec;
  const near = (a, b) => Math.abs(a - b) <= Math.max(0.6, Math.abs(a) * 0.02);
  const tries = [];
  for (const unit of ["units", "packs"]) {
    for (const dmode of discCol === undefined ? ["none"] : ["percent", "amount"]) {
      const tally = { plain: 0, minusTax: 0, plusTax: 0, matched: 0 };
      for (const l of lines) {
        const packs = unit === "units" ? l.qty / l.n : l.qty;
        const gross = packs * l.rate;
        const base = dmode === "percent" ? gross * (1 - l.d / 100) : dmode === "amount" ? gross - l.d : gross;
        const hit = near(l.amount, base) ? "plain" : near(l.amount, base - l.tax) && l.tax ? "minusTax" : near(l.amount, base + l.tax) || near(l.amount, base * (1 + l.g / 100)) ? "plusTax" : null;
        if (hit) {
          tally[hit]++;
          tally.matched++;
        }
      }
      tries.push({ unit, dmode, ...tally });
    }
  }
  // On a tie (most lines have no discount, or all are single units) the AI's reading stands
  const aiDmode = spec.columns.discount_amount !== undefined ? "amount" : spec.columns.discount !== undefined ? "percent" : "none";
  const agrees = (t) => (t.unit === spec.quantity_unit ? 2 : 0) + (t.dmode === aiDmode ? 1 : 0);
  tries.sort((a, b) => b.matched - a.matched || agrees(b) - agrees(a));
  const best = tries[0];
  if (best.matched < Math.max(5, lines.length * 0.5)) return spec;
  const out = { ...spec, columns: { ...spec.columns }, checked: { lines: lines.length, matched: best.matched, changes: [] } };
  if (best.unit !== spec.quantity_unit) {
    out.checked.changes.push(`quantities are ${best.unit}, not ${spec.quantity_unit}`);
    out.quantity_unit = best.unit;
  }
  // The GST amount settles it where the file has one: tax = amount x GST% means the
  // amount is before GST; tax = amount x GST/(100+GST) means it includes GST
  let taxSays = null;
  {
    let ex = 0;
    let inc = 0;
    for (const l of lines) {
      if (!(l.tax > 0 && l.g > 0)) continue;
      const tol = Math.max(0.05, l.tax * 0.02);
      const e = Math.abs(l.tax - (l.amount * l.g) / 100);
      const i = Math.abs(l.tax - (l.amount * l.g) / (100 + l.g));
      if (Math.abs(e - i) <= tol) continue; // too small a line to tell
      if (e <= tol) ex++;
      else if (i <= tol) inc++;
    }
    if (ex + inc >= 5) taxSays = inc > ex ? true : ex > inc ? false : null;
  }
  const inclusive = taxSays !== null ? taxSays : best.plusTax >= Math.max(best.plain, best.minusTax) ? true : best.minusTax > best.plain ? false : entity === "sales";
  if (inclusive !== spec.amount_includes_gst) {
    out.checked.changes.push(`the line amount ${inclusive ? "includes" : "excludes"} GST`);
    out.amount_includes_gst = inclusive;
  }
  if (best.dmode === "amount" && spec.columns.discount !== undefined) {
    out.checked.changes.push("the discount column is in rupees");
    out.columns.discount_amount = spec.columns.discount;
    delete out.columns.discount;
  } else if (best.dmode === "percent" && spec.columns.discount_amount !== undefined) {
    out.checked.changes.push("the discount column is a percent");
    out.columns.discount = spec.columns.discount_amount;
    delete out.columns.discount_amount;
  }
  return out;
}

// How well a layout reads the sheet: share of lines with each needed field filled, and numbers where numbers belong
function quality(entity, applied) {
  const lines = applied.rows;
  if (!lines.length) return { ok: false, score: 0, problems: ["no data lines were found"] };
  const problems = [];
  let score = 1;
  const pick = (r, f) => (applied.mapping[f] === undefined ? "" : r.cells[applied.mapping[f]]);
  for (const f of ENTITIES[entity].fields.filter((x) => x.required)) {
    if (applied.mapping[f.key] === undefined) {
      // A purchase file without supplier names is fine: the admin fills or leaves them
      if (f.key === "supplier_name") continue;
      problems.push(`the needed field ${f.key} isn't mapped`);
      score -= 0.5;
      continue;
    }
    const share = lines.filter((r) => !blank(pick(r, f.key))).length / lines.length;
    if (share < 0.9) {
      problems.push(`${f.key} is empty on ${Math.round((1 - share) * 100)}% of the lines`);
      score -= 0.4 * (1 - share);
    }
  }
  if (applied.mapping.quantity !== undefined) {
    const numeric = lines.filter((r) => /^-?\d+(\.\d+)?$/.test(cellText(pick(r, "quantity")).replace(/,/g, ""))).length / lines.length;
    if (numeric < 0.9) {
      problems.push(`quantity isn't a number on ${Math.round((1 - numeric) * 100)}% of the lines (are totals or headings being read as lines?)`);
      score -= 0.4 * (1 - numeric);
    }
  }
  return { ok: score >= 0.8, score: Math.max(0, Math.round(score * 100) / 100), problems };
}

// Bumped when the fields or the reading rules change, so layouts saved under the
// old rules are read again instead of reused
const LAYOUT_VERSION = 2;
const keyOf = (entity, heading) => crypto.createHash("sha256").update(`v${LAYOUT_VERSION}|${entity}|${heading}`).digest("hex");
const fingerprint = (entity, rows, spec) => {
  if (!spec.header_row) return null;
  const heading = (rows[spec.header_row - 1] || []).map(headerKey).join("|");
  return heading ? keyOf(entity, heading) : null;
};

// The headings row of a sheet that matches a saved layout, if any
async function savedLayout(db, entity, rows) {
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    if (filled(rows[i]) < 3) continue;
    const fp = keyOf(entity, (rows[i] || []).map(headerKey).join("|"));
    const hit = await db.collection("migration_layouts").findOne({ _id: fp });
    if (hit) return { ...hit.spec, period_from: null, period_to: null, ...(filePeriod(rows) || {}), header_row: i + 1, first_data_row: Math.max(i + 2, hit.spec.first_data_row - hit.spec.header_row + i + 1) };
  }
  return null;
}

// ---- Rate limits: AI reading is the only paid step, so it's what's limited ----
const HOURLY = () => Math.max(1, parseInt(process.env.IMPORT_AI_PER_HOUR, 10) || 30);
const CONCURRENT = () => Math.max(1, parseInt(process.env.IMPORT_AI_CONCURRENT, 10) || 2);

async function checkLimits(db, actor, jobId) {
  const who = actor?.email || actor?.id || "unknown";
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const running = await db.collection("migration_jobs").countDocuments({ "ai.by": who, "ai.status": "running", id: { $ne: jobId } });
  if (running >= CONCURRENT()) return `${running} files are already being read with AI. Wait for one to finish.`;
  const used = await db.collection("migration_jobs").aggregate([{ $match: { "ai.by": who, "ai.started_at": { $gte: since } } }, { $group: { _id: null, calls: { $sum: "$ai.calls" } } }]).toArray();
  const calls = used[0]?.calls || 0;
  if (calls >= HOURLY()) return `The AI has read ${calls} layouts for you in the last hour (the limit is ${HOURLY()}). Try again later, or choose the columns by hand.`;
  return null;
}

/**
 * Works out a sheet's layout: a saved one if the headings are known, else AI.
 * Returns { spec, applied, quality, source: "saved"|"ai", usage: {calls, input_tokens, output_tokens, usd, inr, model}, attempts }.
 */
async function readLayout(db, { entity, rows, actor, jobId, fresh = false, onStage = () => {} }) {
  if (!fresh) {
    const saved = await savedLayout(db, entity, rows);
    if (saved) {
      const applied0 = applyLayout(rows, saved);
      const checkedSaved = verifyConventions(entity, applied0.rows, saved);
      const applied = applyLayout(rows, checkedSaved);
      const q = quality(entity, applied);
      if (q.ok) return { spec: checkedSaved, applied, quality: q, source: "saved", usage: { calls: 0, input_tokens: 0, output_tokens: 0, usd: 0, inr: 0 }, attempts: 0 };
    }
  }
  if (!process.env.GEMINI_API_KEY && !process.env.EMERGENT_LLM_KEY) throw new LayoutError("AI isn't set up on this server (no Gemini key).", "config");
  const limited = await checkLimits(db, actor, jobId);
  if (limited) throw new LayoutError(limited, "limit");

  const { text, width } = sampleText(rows);
  const m = meter.createMeter();
  let best = null;
  let feedback = null;
  let attempts = 0;
  for (attempts = 1; attempts <= 2; attempts++) {
    onStage(attempts === 1 ? "Reading the layout with AI" : "Checking the layout again with AI");
    const res = await meter.run(m, () =>
      gemini.extractJson({ prompt: promptFor(entity, text, feedback), images: [], schema: schemaFor(entity), timeoutMs: 90000, retries: 1, maxOutputTokens: 4096 })
    );
    const rawSpec = { ...cleanSpec(res.data || {}, entity, width), ...(filePeriod(rows) || {}) };
    const spec = verifyConventions(entity, applyLayout(rows, rawSpec).rows, rawSpec);
    const applied = applyLayout(rows, spec);
    const q = quality(entity, applied);
    if (!best || q.score > best.quality.score) best = { spec, applied, quality: q };
    if (q.ok) break;
    feedback = `${q.problems.join("; ")}. ${applied.stats.lines} lines were read, ${applied.stats.skipped} rows skipped.`;
  }
  const config = await getConfig(db);
  const sum = meter.summarize(config, m);
  const model = sum.models[0]?.model || null;
  const usage = {
    calls: sum.calls,
    model,
    input_tokens: sum.models.reduce((a, x) => a + (x.input_tokens || 0), 0),
    output_tokens: sum.models.reduce((a, x) => a + (x.output_tokens || 0), 0),
    usd: Math.round(sum.usd * 1e6) / 1e6,
    inr: Math.round(sum.inr * 10000) / 10000,
    usd_inr: config.usd_inr,
  };
  if (best.quality.ok) {
    const fp = fingerprint(entity, rows, best.spec);
    if (fp) {
      await db.collection("migration_layouts").updateOne(
        { _id: fp },
        { $set: { entity, spec: best.spec, report_type: best.spec.report_type, updated_at: new Date().toISOString() }, $setOnInsert: { created_at: new Date().toISOString() } },
        { upsert: true }
      );
    }
  }
  return { ...best, source: "ai", usage, attempts: Math.min(attempts, 2) };
}

module.exports = { readLayout, applyLayout, verifyConventions, quality, mainSheet, sampleText, filePeriod, LayoutError };
