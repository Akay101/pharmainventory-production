// Reads cell values from an old Excel 97-2003 (.xls, BIFF8) file, which is what
// Marg and other desktop billing software export. Formatting, formulas and
// merged cells are ignored: each sheet comes back as rows of plain values.
const CFB = require("cfb");

class XlsError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
  }
}

const T = {
  BOF: 0x0809, EOF: 0x000a, BOUNDSHEET: 0x0085, SST: 0x00fc, CONTINUE: 0x003c, FILEPASS: 0x002f,
  LABELSST: 0x00fd, LABEL: 0x0204, NUMBER: 0x0203, RK: 0x027e, MULRK: 0x00bd, FORMULA: 0x0006, STRING: 0x0207, BOOLERR: 0x0205,
};
const MAX_CELLS = 5_000_000;

function records(buf) {
  const out = [];
  let i = 0;
  while (i + 4 <= buf.length) {
    const type = buf.readUInt16LE(i);
    const len = buf.readUInt16LE(i + 2);
    out.push({ type, offset: i, data: buf.subarray(i + 4, i + 4 + len) });
    i += 4 + len;
  }
  return out;
}

// A string spread over a record and its CONTINUE records. Character data that
// crosses into a CONTINUE starts again with its own one-byte flags.
class Segments {
  constructor(parts) {
    this.parts = parts;
    this.p = 0;
    this.i = 0;
  }
  ensure() {
    while (this.p < this.parts.length && this.i >= this.parts[this.p].length) {
      this.p++;
      this.i = 0;
    }
    if (this.p >= this.parts.length) throw new XlsError("This .xls file is damaged (a text list ends early).");
  }
  u8() {
    this.ensure();
    return this.parts[this.p][this.i++];
  }
  u16() {
    return this.u8() | (this.u8() << 8);
  }
  u32() {
    return (this.u16() | (this.u16() << 16)) >>> 0;
  }
  skip(n) {
    for (let k = 0; k < n; k++) this.u8();
  }
  chars(count, highByte) {
    let s = "";
    let wide = highByte;
    for (let k = 0; k < count; k++) {
      if (this.p < this.parts.length && this.i >= this.parts[this.p].length) {
        this.p++;
        this.i = 0;
        wide = (this.u8() & 1) === 1; // a CONTINUE restarts with its own flags
      }
      s += String.fromCharCode(wide ? this.u16() : this.u8());
    }
    return s;
  }
}

function readSst(parts) {
  const r = new Segments(parts);
  r.skip(4);
  const unique = r.u32();
  const strings = new Array(unique);
  for (let n = 0; n < unique; n++) {
    const cch = r.u16();
    const flags = r.u8();
    const runs = flags & 0x08 ? r.u16() : 0;
    const ext = flags & 0x04 ? r.u32() : 0;
    strings[n] = r.chars(cch, (flags & 1) === 1);
    r.skip(runs * 4 + ext);
  }
  return strings;
}

// XLUnicodeString inside one record (LABEL, STRING): 2-byte length, flags, characters
function shortString(data, at) {
  const cch = data.readUInt16LE(at);
  const wide = (data[at + 2] & 1) === 1;
  const start = at + 3;
  return wide ? data.toString("utf16le", start, start + cch * 2) : data.toString("latin1", start, start + cch);
}

function rk(v) {
  let n;
  if (v & 0x02) n = v >> 2;
  else {
    const b = Buffer.alloc(8);
    b.writeUInt32LE(0, 0);
    b.writeUInt32LE(v & 0xfffffffc, 4);
    n = b.readDoubleLE(0);
  }
  return v & 0x01 ? n / 100 : n;
}

function readXls(buffer) {
  let cfb;
  try {
    cfb = CFB.read(buffer, { type: "buffer" });
  } catch {
    throw new XlsError("We couldn't open this .xls file. Open it in Excel and save it again, then upload that.");
  }
  const entry = CFB.find(cfb, "Workbook") || CFB.find(cfb, "Book");
  if (!entry || !entry.content) throw new XlsError("This .xls file has no worksheet data.");
  const stream = Buffer.from(entry.content);
  if (!CFB.find(cfb, "Workbook")) throw new XlsError("This is a very old Excel file (Excel 95 or earlier). Save it again as .xlsx or CSV, then upload that.");

  const recs = records(stream);
  const byOffset = new Map(recs.map((r, idx) => [r.offset, idx]));
  const sheets = [];
  let sst = [];

  // Workbook globals: the sheet list and the shared strings
  for (let idx = 0; idx < recs.length; idx++) {
    const r = recs[idx];
    if (r.type === T.FILEPASS) throw new XlsError("This .xls file is password protected. Remove the password in Excel, then upload it again.");
    if (r.type === T.BOUNDSHEET) {
      const pos = r.data.readUInt32LE(0);
      const kind = r.data[5];
      const cch = r.data[6];
      const wide = (r.data[7] & 1) === 1;
      const name = wide ? r.data.toString("utf16le", 8, 8 + cch * 2) : r.data.toString("latin1", 8, 8 + cch);
      if (kind === 0) sheets.push({ name, pos });
    } else if (r.type === T.SST) {
      const parts = [r.data];
      for (let k = idx + 1; k < recs.length && recs[k].type === T.CONTINUE; k++) parts.push(recs[k].data);
      sst = readSst(parts);
    } else if (r.type === T.EOF) break;
  }

  let cells = 0;
  return sheets.map((sheet) => {
    const rows = [];
    const set = (row, col, value) => {
      if (++cells > MAX_CELLS) throw new XlsError("This file is too large to read. Split it into smaller files.");
      (rows[row] ||= [])[col] = value;
    };
    let idx = byOffset.get(sheet.pos);
    if (idx === undefined) return { name: sheet.name, rows: [] };
    let pendingFormula = null;
    for (idx++; idx < recs.length; idx++) {
      const { type, data } = recs[idx];
      if (type === T.EOF) break;
      if (type === T.LABELSST) set(data.readUInt16LE(0), data.readUInt16LE(2), sst[data.readUInt32LE(6)] ?? "");
      else if (type === T.LABEL) set(data.readUInt16LE(0), data.readUInt16LE(2), shortString(data, 6));
      else if (type === T.NUMBER) set(data.readUInt16LE(0), data.readUInt16LE(2), data.readDoubleLE(6));
      else if (type === T.RK) set(data.readUInt16LE(0), data.readUInt16LE(2), rk(data.readUInt32LE(6)));
      else if (type === T.MULRK) {
        const row = data.readUInt16LE(0);
        const first = data.readUInt16LE(2);
        const n = (data.length - 6) / 6;
        for (let k = 0; k < n; k++) set(row, first + k, rk(data.readUInt32LE(4 + k * 6 + 2)));
      } else if (type === T.BOOLERR) {
        if (data[7] === 0) set(data.readUInt16LE(0), data.readUInt16LE(2), data[6] === 1);
      } else if (type === T.FORMULA) {
        const row = data.readUInt16LE(0);
        const col = data.readUInt16LE(2);
        if (data.readUInt16LE(12) === 0xffff) {
          const kind = data[6];
          if (kind === 0) pendingFormula = { row, col };
          else if (kind === 1) set(row, col, data[8] === 1);
        } else set(row, col, data.readDoubleLE(6));
      } else if (type === T.STRING && pendingFormula) {
        set(pendingFormula.row, pendingFormula.col, shortString(data, 0));
        pendingFormula = null;
      }
    }
    return { name: sheet.name, rows: Array.from(rows, (r) => Array.from(r || [], (c) => (c === undefined ? "" : c))) };
  });
}

module.exports = { readXls, XlsError };
