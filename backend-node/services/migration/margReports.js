// Marg report layouts that aren't a plain table, turned into one row per line.
//
// "SUPPLIER/ITEM WISE PURCHASE STATEMENT" (Marg ERP 9+ Excel Report):
//   - a supplier's name on a row of its own, its bill lines below, a TOTAL row
//   - BILL, PACKING and BATCH are fixed 8-character fields: a longer bill number
//     runs into ITEM DESCRIPTION ("NET31688LACTOGEN PRO 1"), a batch into EXP.
//     ("M2T2508210/27"), and PACKING BATCH holds both ("1X400GM 190453K1")
//   - "AMOUNT NET RATE" holds two numbers; LOOS is total units including free
//   - page breaks repeat the pharmacy name, the title and the headings
//   - bill dates aren't in this report, only the period it covers
const FIELD = 8;

const text = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
const raw = (v) => String(v ?? "");
const key = (v) => text(v).toLowerCase().replace(/[^a-z0-9]/g, "");
const HEADINGS = ["bill", "itemdescription", "packingbatch", "exp", "tax", "qty", "free", "rate", "dis", "amountnetrate", "loos", "mrp", "amount"];

const ddmmyyyy = (s) => {
  const m = String(s).match(/(\d{1,2})-(\d{1,2})-(\d{4})/);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
};

function findLayout(rows) {
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const keys = (rows[i] || []).map(key);
    if (HEADINGS.every((h, c) => keys[c] === h)) return i;
  }
  return -1;
}

const isItem = (r) => text(r[1]) && typeof r[5] === "number";
const sameAcross = (r) => {
  const first = text(r[0]);
  return first && r.slice(1).every((c) => text(c) === "" || text(c) === first);
};

// Bill number, item name: the bill column, or the first 8 characters of the description
function splitBill(r) {
  const bill = text(r[0]);
  const desc = raw(r[1]);
  if (bill) return { bill, item: text(desc) };
  const head = desc.slice(0, FIELD);
  if (desc.length > FIELD && /\d/.test(head)) return { bill: text(head), item: text(desc.slice(FIELD)) };
  return { bill: "", item: text(desc) };
}

function splitPackingBatch(v, expCell) {
  const s = raw(v);
  let packing = text(s.slice(0, FIELD));
  let batch = text(s.slice(FIELD));
  let exp = text(expCell);
  // A batch longer than its field runs into EXP.: "M2T25082" + "10/27"
  const m = exp.match(/^(.+?)(\d{1,2}\/\d{2})$/);
  if (m && !/^\d{1,2}\/\d{2}$/.test(exp)) {
    batch = text(batch + m[1]);
    exp = m[2];
  }
  if (s.length <= FIELD) packing = text(s);
  return { packing, batch, exp };
}

function amountAndRate(v) {
  const nums = text(v).split(" ").map(Number).filter((n) => Number.isFinite(n));
  return { amount: nums[0] ?? null, net_rate: nums[1] ?? null };
}

const HEADERS = ["Supplier", "Bill No", "Bill Date", "Item Name", "Packing", "Batch No", "Expiry", "GST %", "Qty", "Free", "Rate", "Discount %", "Amount", "Units", "MRP", "MRP Value"];

/**
 * If `rows` are a Marg supplier/item-wise purchase statement, returns
 * { headers, rows: [{ row_no, cells }], meta } with one row per bill line.
 */
function margPurchaseStatement(rows) {
  const headingIndex = findLayout(rows);
  if (headingIndex < 0) return null;
  const top = rows.slice(0, headingIndex + 1).map((r) => text(r[0]));
  const title = top.find((t) => /PURCHASE STATEMENT/i.test(t));
  if (!title) return null;
  const pharmacyName = top[0];
  const period = title.match(/FROM\s+(\S+)\s+TO\s+(\S+)/i);
  const meta = {
    report: "marg_supplier_item_purchase",
    label: "Marg supplier/item-wise purchase statement",
    period_from: period ? ddmmyyyy(period[1]) : null,
    period_to: period ? ddmmyyyy(period[2]) : null,
    has_bill_dates: false,
  };

  const out = [];
  let supplier = "";
  let lines = 0;
  let fileTotal = 0;
  let supplierTotal = null; // the TOTAL row closing the current supplier
  let supplierLines = 0;
  const unclosed = [];
  for (let i = headingIndex + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const first = text(r[0]);
    if (isItem(r)) {
      const { bill, item } = splitBill(r);
      const { packing, batch, exp } = splitPackingBatch(r[2], r[3]);
      const { amount } = amountAndRate(r[9]);
      supplierLines += amountAndRate(r[9]).amount || 0;
      out.push({
        row_no: i + 1,
        cells: [supplier, bill, "", item, packing, batch, exp, r[4], r[5], r[6] === "" ? 0 : r[6], r[7], r[8] === "" ? 0 : r[8], amount, r[10], r[11], r[12]],
      });
      lines++;
      continue;
    }
    if (/^grand$/i.test(first) && /^total$/i.test(text(r[1]))) {
      fileTotal = Number(r[9]) || 0;
      continue;
    }
    if (text(r[7]).toUpperCase() === "TOTAL") {
      supplierTotal = Number(r[9]) || 0;
      if (Math.abs(supplierTotal - supplierLines) > 0.5) unclosed.push(`${supplier}: lines add up to ₹${supplierLines.toFixed(2)}, the report's total says ₹${supplierTotal.toFixed(2)}`);
      continue;
    }
    if (text(r[5]) === "Page") continue;
    if (!sameAcross(r)) continue;
    if (first === pharmacyName || /PURCHASE STATEMENT/i.test(first) || key(first) === "bill") continue;
    if (supplier && supplierTotal === null && supplierLines) unclosed.push(`${supplier} has no TOTAL row`);
    supplier = first; // a name alone on its row starts the next supplier
    supplierTotal = null;
    supplierLines = 0;
  }
  if (!lines) return null;
  if (supplier && supplierTotal === null && supplierLines) unclosed.push(`${supplier} has no TOTAL row`);
  const sum = Math.round(out.reduce((a, r) => a + (Number(r.cells[12]) || 0), 0) * 100) / 100;
  meta.file_net_total = fileTotal || null;
  meta.lines_net_total = sum;
  meta.warnings = [
    ...unclosed,
    ...(fileTotal ? (Math.abs(fileTotal - sum) > 0.5 ? [`Lines add up to ₹${sum.toFixed(2)}, the report's grand total is ₹${fileTotal.toFixed(2)}`] : []) : ["The report has no GRAND TOTAL, so it may have been cut off when it was exported. Check that the last supplier's bills are all there."]),
  ];
  return { headers: HEADERS, rows: out, meta };
}

module.exports = { margPurchaseStatement };
