// Value helpers shared by the document store: JSON encoding that keeps Dates and
// Buffers, path walking, and comparison in MongoDB's BSON order.

function replacer(key, value) {
  const raw = this[key];
  if (raw instanceof Date) {
    const t = raw.getTime();
    return Number.isNaN(t) ? null : { $date: t };
  }
  if (Buffer.isBuffer(raw)) return { $bin: raw.toString("base64") };
  return value;
}

const encode = (doc) => JSON.stringify(doc, replacer);

function revive(value) {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const v = value[i];
      if (v && typeof v === "object") value[i] = revive(v);
    }
    return value;
  }
  if (typeof value.$date === "number") return new Date(value.$date);
  if (typeof value.$bin === "string") return Buffer.from(value.$bin, "base64");
  for (const k of Object.keys(value)) {
    const v = value[k];
    if (v && typeof v === "object") value[k] = revive(v);
  }
  return value;
}

const decode = (text) => {
  const doc = JSON.parse(text);
  // Most documents hold neither, so the walk is skipped for them
  return text.includes('"$date"') || text.includes('"$bin"') ? revive(doc) : doc;
};

const clone = (doc) => decode(encode(doc));

// Every scalar reachable at a dotted path, flattening arrays the way a MongoDB
// multikey index does. Date becomes its time in ms.
function collect(value, parts, i, out) {
  if (value === null || value === undefined) return;
  if (Array.isArray(value)) {
    for (const v of value) collect(v, parts, i, out);
    return;
  }
  if (i === parts.length) {
    if (typeof value === "string" || typeof value === "number") out.push(value);
    else if (value instanceof Date) out.push(value.getTime());
    return;
  }
  if (typeof value === "object") collect(value[parts[i]], parts, i + 1, out);
}

const indexValues = (doc, path) => {
  const out = [];
  collect(doc, path.split("."), 0, out);
  return out;
};

// First value at a path, for sorting and unique keys
function getPath(doc, path) {
  let cur = doc;
  for (const part of path.split(".")) {
    if (cur === null || cur === undefined) return undefined;
    if (Array.isArray(cur) && !/^\d+$/.test(part)) {
      cur = cur.map((v) => (v === null || v === undefined ? undefined : v[part]));
    } else {
      cur = cur[part];
    }
  }
  return cur;
}

const typeRank = (v) => {
  if (v === undefined || v === null) return 1;
  if (typeof v === "number") return 2;
  if (typeof v === "string") return 3;
  if (v instanceof Date) return 8;
  if (Array.isArray(v)) return 5;
  if (typeof v === "object") return 4;
  if (typeof v === "boolean") return 7;
  return 9;
};

function compare(a, b) {
  const ra = typeRank(a);
  const rb = typeRank(b);
  if (ra !== rb) return ra - rb;
  if (ra === 1) return 0;
  if (ra === 8) return a.getTime() - b.getTime();
  if (ra === 5 || ra === 4) {
    const x = encode(a);
    const y = encode(b);
    return x < y ? -1 : x > y ? 1 : 0;
  }
  return a < b ? -1 : a > b ? 1 : 0;
}

// MongoDB sorts an array field by its lowest element ascending, highest descending
const sortKey = (doc, path, dir) => {
  const v = getPath(doc, path);
  if (!Array.isArray(v) || v.length === 0) return Array.isArray(v) ? undefined : v;
  return v.reduce((best, x) => ((dir > 0 ? compare(x, best) < 0 : compare(x, best) > 0) ? x : best));
};

module.exports = { encode, decode, clone, indexValues, getPath, compare, sortKey };
