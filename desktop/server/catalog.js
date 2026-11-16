// The offline medicine, doctor and distributor catalogue: its own encrypted file,
// searched through a full-text index. It offers only `find` and `findOne` with
// result limits. There is no route that lists or exports it, and searches pass
// through the backend's usual catalogue rate limits.
const Database = require("better-sqlite3-multiple-ciphers");
const { Query } = require("mingo");
const { encode, decode } = require("./docdb/values");

const KINDS = {
  medicines: { name: ["product_name", "name", "brand"], salt: ["active_ingredients", "salt_composition", "short_composition1", "short_composition2"], rank: "rank_score" },
  doctors: { name: ["full_name", "practitioner_name", "name", "doctor_name"], salt: ["clinic_hospital", "specialization", "speciality", "city"], rank: null },
  distributors: { name: ["agency_name", "name", "supplier_name"], salt: ["city", "gst_number", "gstin", "gst_no", "locality", "state", "supplier_code"], rank: null },
};
const COLLECTION_KIND = { global_medicines: "medicines", global_doctors: "doctors", global_distributors: "distributors" };
const GRAM_FIELDS = { s_name_grams: "name", s_salt_grams: "salt" };
const MAX_CANDIDATES = 400;

const joined = (doc, fields) => fields.map((f) => doc[f]).filter((v) => typeof v === "string" && v).join(" ");

class Catalog {
  constructor(file, key) {
    this.db = new Database(file);
    this.db.pragma("cipher='sqlcipher'");
    this.db.pragma(`key="x'${key}'"`);
    this.db.prepare("SELECT count(*) FROM sqlite_master").get();
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS entries (rid INTEGER PRIMARY KEY, kind TEXT NOT NULL, ext_id TEXT NOT NULL, rank REAL NOT NULL DEFAULT 0, doc TEXT NOT NULL, UNIQUE (kind, ext_id));
      CREATE INDEX IF NOT EXISTS entries_kind_rank ON entries (kind, rank DESC);
      CREATE TABLE IF NOT EXISTS ranks (rid INTEGER PRIMARY KEY, kind TEXT NOT NULL, rank REAL NOT NULL);
      CREATE VIRTUAL TABLE IF NOT EXISTS search USING fts5(name, salt, kind UNINDEXED, tokenize = 'trigram');
    `);
    this._upsert = this.db.prepare("INSERT INTO entries (kind, ext_id, rank, doc) VALUES (?, ?, ?, ?) ON CONFLICT (kind, ext_id) DO UPDATE SET rank = excluded.rank, doc = excluded.doc RETURNING rid");
    // Ranks sit apart from the documents, so ordering thousands of matches reads little
    this._rank = this.db.prepare("INSERT OR REPLACE INTO ranks (rid, kind, rank) VALUES (?, ?, ?)");
    this._doc = this.db.prepare("SELECT doc FROM entries WHERE rid = ?");
    this._ftsDelete = this.db.prepare("DELETE FROM search WHERE rowid = ?");
    this._ftsInsert = this.db.prepare("INSERT INTO search (rowid, name, salt, kind) VALUES (?, ?, ?, ?)");
  }

  addPage(kind, docs) {
    const spec = KINDS[kind];
    this.db.transaction(() => {
      for (const doc of docs) {
        const rank = spec.rank ? Number(doc[spec.rank]) || 0 : 0;
        const { rid } = this._upsert.get(kind, String(doc._id), rank, encode(doc));
        this._rank.run(rid, kind, rank);
        this._ftsDelete.run(rid);
        this._ftsInsert.run(rid, joined(doc, spec.name), joined(doc, spec.salt), kind);
      }
    })();
  }

  clear() {
    this.db.exec("DELETE FROM entries; DELETE FROM ranks; DELETE FROM search;");
  }

  count(kind) {
    return this.db.prepare("SELECT count(*) AS n FROM entries WHERE kind = ?").get(kind).n;
  }

  // Terms drawn from the filter drive the index; the full filter is rechecked below
  candidates(kind, terms, limit) {
    const parts = [];
    for (const { column, text } of terms) {
      if (text.length < 3) continue;
      const quoted = `"${text.replace(/"/g, '""')}"`;
      parts.push(column ? `${column} : ${quoted}` : quoted);
    }
    if (parts.length) {
      return this.db
        .prepare("SELECT r.rid FROM search JOIN ranks r ON r.rid = search.rowid WHERE search MATCH ? AND r.kind = ? ORDER BY r.rank DESC LIMIT ?")
        .all(parts.join(" AND "), kind, limit)
        .map((r) => decode(this._doc.get(r.rid).doc));
    }
    // Only very short terms: limited to the most used entries
    return this.db.prepare("SELECT doc FROM entries WHERE kind = ? ORDER BY rank DESC LIMIT ?").all(kind, limit).map((r) => decode(r.doc));
  }

  collection(name) {
    return new CatalogCollection(this, COLLECTION_KIND[name] || null);
  }

  close() {
    this.db.close();
  }
}

const regexSource = (value) => (value instanceof RegExp ? value.source : value?.$regex instanceof RegExp ? value.$regex.source : typeof value?.$regex === "string" ? value.$regex : null);
const words = (source) => source.replace(/\\(.)/g, "$1").split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3);

// Separates what the index can answer from what the query must recheck
function analyse(filter) {
  const terms = [];
  const rest = {};
  const visit = (f, target) => {
    for (const [key, value] of Object.entries(f || {})) {
      if (GRAM_FIELDS[key]) {
        const column = GRAM_FIELDS[key];
        const list = typeof value === "string" ? [value] : value?.$all || [];
        for (const text of list) terms.push({ column, text: String(text) });
      } else if (key === "$text") {
        for (const word of String(value.$search || "").split(/\s+/)) if (word) terms.push({ column: null, text: word });
      } else if (key === "$or" && Array.isArray(value)) {
        // "This word in any of these fields": the index covers those fields together
        target[key] = value;
        const sources = new Set(value.flatMap((branch) => Object.values(branch).map(regexSource)));
        if (sources.size === 1 && !sources.has(null)) for (const word of words(sources.values().next().value)) terms.push({ column: null, text: word });
      } else if (key === "$and" && Array.isArray(value)) {
        const kept = [];
        for (const item of value) {
          const inner = {};
          visit(item, inner);
          if (Object.keys(inner).length) kept.push(inner);
        }
        if (kept.length) target.$and = kept;
      } else {
        target[key] = value;
        const source = regexSource(value);
        if (source) for (const word of words(source)) terms.push({ column: null, text: word });
      }
    }
  };
  visit(filter, rest);
  return { terms, rest };
}

class CatalogCollection {
  constructor(catalog, kind) {
    this.catalog = catalog;
    this.kind = kind;
  }

  _run(filter, { limit = 100, skip = 0 }) {
    if (!this.kind) return [];
    const { terms, rest } = analyse(filter);
    const docs = this.catalog.candidates(this.kind, terms, MAX_CANDIDATES);
    const q = Object.keys(rest).length ? new Query(rest) : null;
    const out = q ? docs.filter((d) => q.test(d)) : docs;
    return out.slice(skip, skip + Math.min(limit, 200));
  }

  find(filter = {}) {
    const opts = { limit: 100, skip: 0 };
    const cursor = {
      sort: () => cursor,
      hint: () => cursor,
      project: () => cursor,
      maxTimeMS: () => cursor,
      limit: (n) => ((opts.limit = n), cursor),
      skip: (n) => ((opts.skip = n), cursor),
      toArray: async () => this._run(filter, opts),
      next: async () => this._run(filter, { ...opts, limit: 1 })[0] || null,
    };
    return cursor;
  }

  async findOne(filter = {}) {
    return this._run(filter, { limit: 1 })[0] || null;
  }

  async estimatedDocumentCount() {
    return this.kind ? this.catalog.count(this.kind) : 0;
  }

  async countDocuments() {
    return this.estimatedDocumentCount();
  }

  // Nothing in the desktop app writes to the catalogue
  async updateOne() {
    return { matchedCount: 0, modifiedCount: 0 };
  }
}

module.exports = { Catalog, KINDS };
