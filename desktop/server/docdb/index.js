// A small MongoDB-compatible document store over encrypted SQLite. It offers the
// `db.collection()` calls the backend routes already make, so the same route
// code runs on a shop PC. Matching and aggregation use mingo for MongoDB
// semantics; a multikey index table narrows down which documents are read.
const crypto = require("crypto");
const Database = require("better-sqlite3-multiple-ciphers");
const { Query, Aggregator, find: mingoFind } = require("mingo");
const { encode, decode, indexValues, getPath, compare, sortKey } = require("./values");
const { applyUpdate, seedFromFilter, isOperatorUpdate } = require("./update");

// Looked up by the routes on nearly every request, whether or not an index
// was declared for them
const DEFAULT_PATHS = ["id", "bill_id", "bill_no", "product_id", "customer_id", "supplier_id", "purchase_id", "inventory_id", "user_id", "jti", "email", "subject", "key"];
// One shop holds one pharmacy, so this field would narrow nothing
const USELESS_PATHS = new Set(["pharmacy_id"]);

const newObjectId = () => crypto.randomBytes(12).toString("hex");
const idKey = (id) => (typeof id === "string" ? id : encode({ v: id }));
const isScalar = (v) => typeof v === "string" || typeof v === "number" || v instanceof Date;
const toIndexed = (v) => (v instanceof Date ? v.getTime() : v);
const usablePath = (p) => !p.split(".").some((s) => /^\d+$/.test(s) || s.startsWith("$"));

class DuplicateKeyError extends Error {
  constructor(coll, index, keyValue) {
    super(`E11000 duplicate key error collection: ${coll} index: ${index}`);
    this.name = "MongoServerError";
    this.code = 11000;
    this.keyValue = keyValue;
    this.keyPattern = Object.fromEntries(Object.keys(keyValue || {}).map((k) => [k, 1]));
  }
}

// ---- Text search --------------------------------------------------------------
function allText(value, out) {
  if (typeof value === "string") out.push(value.toLowerCase());
  else if (Array.isArray(value)) value.forEach((v) => allText(v, out));
  else if (value && typeof value === "object" && !(value instanceof Date)) Object.values(value).forEach((v) => allText(v, out));
}

const textScore = (doc, terms) => {
  const parts = [];
  allText(doc, parts);
  const text = parts.join(" ");
  return terms.reduce((n, t) => (text.includes(t) ? n + 1 : n), 0);
};

// Pulls a top-level $text out of a filter, since text indexes aren't kept here
function splitText(filter) {
  if (!filter || !filter.$text) return { filter: filter || {}, terms: null };
  const { $text, ...rest } = filter;
  const terms = String($text.$search || "").toLowerCase().split(/\s+/).filter(Boolean);
  return { filter: rest, terms };
}

// ---- Cursors ------------------------------------------------------------------
class BaseCursor {
  constructor(run) {
    this._run = run;
    this._mappers = [];
    this._results = null;
    this._pos = 0;
  }
  _load() {
    if (!this._results) {
      this._results = this._run();
      for (const fn of this._mappers) this._results = this._results.map(fn);
    }
    return this._results;
  }
  map(fn) {
    this._mappers.push(fn);
    return this;
  }
  batchSize() {
    return this;
  }
  maxTimeMS() {
    return this;
  }
  hint() {
    return this;
  }
  collation() {
    return this;
  }
  comment() {
    return this;
  }
  async toArray() {
    return this._load().slice(this._pos);
  }
  async next() {
    const rows = this._load();
    return this._pos < rows.length ? rows[this._pos++] : null;
  }
  async tryNext() {
    return this.next();
  }
  async hasNext() {
    return this._pos < this._load().length;
  }
  async forEach(fn) {
    for (const row of await this.toArray()) await fn(row);
  }
  async close() {}
  async *[Symbol.asyncIterator]() {
    let row;
    while ((row = await this.next()) !== null) yield row;
  }
}

class FindCursor extends BaseCursor {
  constructor(coll, filter, options = {}) {
    super(() => coll._execFind(filter, this._opts));
    this._opts = { projection: options.projection, sort: options.sort, limit: options.limit, skip: options.skip };
  }
  sort(spec, dir) {
    this._opts.sort = typeof spec === "string" ? { [spec]: dir === undefined ? 1 : dir } : spec;
    return this;
  }
  limit(n) {
    this._opts.limit = n;
    return this;
  }
  skip(n) {
    this._opts.skip = n;
    return this;
  }
  project(p) {
    this._opts.projection = p;
    return this;
  }
  async count() {
    return this._load().length;
  }
}

// ---- Collection ---------------------------------------------------------------
class Collection {
  constructor(db, name) {
    this.db = db;
    this.collectionName = name;
    this.s = db._statements;
  }

  // Candidate rows for a filter, using the index table when a clause allows it.
  // Results are always rechecked with the real query, so this only has to
  // return a superset of the matches.
  _candidates(filter) {
    const coll = this.collectionName;
    const paths = this.db._paths(coll);
    let idClause = null;
    let eqClause = null;
    let rangeClause = null;

    const consider = (key, cond) => {
      if (key === "_id") {
        if (isScalar(cond) || (cond && typeof cond === "object" && Array.isArray(cond.$in) && cond.$in.every((v) => typeof v === "string"))) idClause = idClause || cond;
        return;
      }
      if (!paths.has(key) || !usablePath(key)) return;
      if (isScalar(cond)) {
        eqClause = eqClause || { path: key, values: [toIndexed(cond)] };
        return;
      }
      if (!cond || typeof cond !== "object" || Array.isArray(cond) || cond instanceof RegExp) return;
      if (isScalar(cond.$eq)) {
        eqClause = eqClause || { path: key, values: [toIndexed(cond.$eq)] };
      } else if (Array.isArray(cond.$in) && cond.$in.length && cond.$in.every(isScalar)) {
        eqClause = eqClause || { path: key, values: cond.$in.map(toIndexed) };
      } else if (isScalar(cond.$gte) || isScalar(cond.$gt) || isScalar(cond.$lte) || isScalar(cond.$lt)) {
        const lo = isScalar(cond.$gte) ? cond.$gte : cond.$gt;
        const hi = isScalar(cond.$lte) ? cond.$lte : cond.$lt;
        rangeClause = rangeClause || { path: key, lo: lo === undefined ? null : toIndexed(lo), hi: hi === undefined ? null : toIndexed(hi) };
      }
    };
    const scan = (f) => {
      for (const [k, v] of Object.entries(f)) {
        if (k === "$and" && Array.isArray(v)) v.forEach(scan);
        else if (!k.startsWith("$")) consider(k, v);
      }
    };
    scan(filter);

    const database = this.db._db;
    if (idClause !== null) {
      const ids = typeof idClause === "object" && idClause.$in ? idClause.$in : [idClause];
      const ph = ids.map(() => "?").join(",");
      return database.prepare(`SELECT rid, doc FROM docs WHERE coll = ? AND _id IN (${ph})`).iterate(coll, ...ids.map(idKey));
    }
    if (eqClause) {
      const ph = eqClause.values.map(() => "?").join(",");
      return database
        .prepare(`SELECT rid, doc FROM docs WHERE rid IN (SELECT rid FROM idx WHERE coll = ? AND path = ? AND val IN (${ph})) ORDER BY rid`)
        .iterate(coll, eqClause.path, ...eqClause.values);
    }
    if (rangeClause) {
      const where = ["coll = ?", "path = ?"];
      const params = [coll, rangeClause.path];
      if (rangeClause.lo !== null) {
        where.push("val >= ?");
        params.push(rangeClause.lo);
      }
      if (rangeClause.hi !== null) {
        where.push("val <= ?");
        params.push(rangeClause.hi);
      }
      return database.prepare(`SELECT rid, doc FROM docs WHERE rid IN (SELECT rid FROM idx WHERE ${where.join(" AND ")}) ORDER BY rid`).iterate(...params);
    }
    return this.s.scan.iterate(coll);
  }

  // Matching rows as { rid, doc }. `stopAt` ends the read early when no sort needs them all.
  _select(rawFilter, stopAt = Infinity) {
    const { filter, terms } = splitText(rawFilter);
    const q = Object.keys(filter).length ? new Query(filter) : null;
    const out = [];
    for (const row of this._candidates(filter)) {
      const doc = decode(row.doc);
      if (q && !q.test(doc)) continue;
      if (terms) {
        const score = textScore(doc, terms);
        if (!score) continue;
        Object.defineProperty(doc, "__score", { value: score, enumerable: false });
      }
      out.push({ rid: row.rid, doc });
      if (out.length >= stopAt) {
        // Ends the statement so the connection is free for the caller's writes
        return out;
      }
    }
    return out;
  }

  _sortRows(rows, sort) {
    if (!sort) return rows;
    const keys = Array.isArray(sort) ? sort : Object.entries(sort);
    const spec = keys.map(([field, dir]) => ({ field, meta: dir && typeof dir === "object" && dir.$meta, dir: dir === "desc" || dir === -1 ? -1 : 1 }));
    if (!spec.length) return rows;
    return rows.sort((a, b) => {
      for (const { field, meta, dir } of spec) {
        if (meta) {
          const d = (b.doc.__score || 0) - (a.doc.__score || 0);
          if (d) return d;
          continue;
        }
        const d = compare(sortKey(a.doc, field, dir), sortKey(b.doc, field, dir)) * dir;
        if (d) return d;
      }
      return a.rid - b.rid;
    });
  }

  _project(docs, projection) {
    if (!projection || !Object.keys(projection).length) return docs;
    const metaField = Object.entries(projection).find(([, v]) => v && typeof v === "object" && v.$meta === "textScore");
    const plain = Object.fromEntries(Object.entries(projection).filter(([, v]) => !(v && typeof v === "object" && v.$meta)));
    const out = Object.keys(plain).length ? mingoFind(docs, {}, plain).all() : docs;
    if (metaField) out.forEach((d, i) => (d[metaField[0]] = docs[i].__score || 0));
    return out;
  }

  _execFind(filter, { projection, sort, limit, skip }) {
    const hasSort = sort && (Array.isArray(sort) ? sort.length : Object.keys(sort).length);
    const stopAt = !hasSort && limit ? limit + (skip || 0) : Infinity;
    let rows = this._select(filter || {}, stopAt);
    if (hasSort) rows = this._sortRows(rows, sort);
    if (skip) rows = rows.slice(skip);
    if (limit) rows = rows.slice(0, limit);
    return this._project(rows.map((r) => r.doc), projection);
  }

  // ---- Reads ------------------------------------------------------------------
  find(filter = {}, options = {}) {
    return new FindCursor(this, filter, options);
  }

  async findOne(filter = {}, options = {}) {
    const docs = this._execFind(filter, { projection: options.projection, sort: options.sort, skip: options.skip, limit: 1 });
    return docs[0] || null;
  }

  async countDocuments(filter = {}, options = {}) {
    if (!Object.keys(filter).length && !options.limit && !options.skip) return this.s.count.get(this.collectionName).n;
    const n = this._select(filter, options.limit ? options.limit + (options.skip || 0) : Infinity).length;
    return Math.max(0, n - (options.skip || 0));
  }

  async estimatedDocumentCount() {
    return this.s.count.get(this.collectionName).n;
  }

  async distinct(field, filter = {}) {
    const seen = new Map();
    for (const { doc } of this._select(filter)) {
      const v = getPath(doc, field);
      for (const item of Array.isArray(v) ? v.flat(Infinity) : [v]) {
        if (item !== undefined) seen.set(encode({ v: item }), item);
      }
    }
    return [...seen.values()];
  }

  aggregate(pipeline = []) {
    return new BaseCursor(() => {
      let stages = pipeline;
      let docs;
      if (stages[0] && stages[0].$match) {
        docs = this._select(stages[0].$match).map((r) => r.doc);
        stages = stages.slice(1);
      } else {
        docs = this._select({}).map((r) => r.doc);
      }
      if (!stages.length) return docs;
      return new Aggregator(stages, { collectionResolver: (name) => this.db.collection(name)._select({}).map((r) => r.doc) }).run(docs);
    });
  }

  // ---- Index bookkeeping ------------------------------------------------------
  _indexRow(rid, doc) {
    const coll = this.collectionName;
    this.s.idxClear.run(rid);
    for (const path of this.db._paths(coll)) {
      for (const val of new Set(indexValues(doc, path))) this.s.idxAdd.run(coll, path, val, rid);
    }
    for (const ix of this.db._uniques(coll)) {
      const key = this._uniqueKey(ix, doc);
      if (key !== null) this.s.idxAdd.run(coll, `unique:${ix.name}`, key, rid);
    }
  }

  // The stored form of a unique index key, or null when the document is outside the index
  _uniqueKey(ix, doc) {
    if (ix.partialFilter && !new Query(ix.partialFilter).test(doc)) return null;
    const values = ix.fields.map((f) => getPath(doc, f));
    if (ix.sparse && values.every((v) => v === undefined || v === null)) return null;
    return encode(values.map((v) => (v === undefined ? null : v)));
  }

  _checkUnique(doc, rid) {
    const coll = this.collectionName;
    for (const ix of this.db._uniques(coll)) {
      const key = this._uniqueKey(ix, doc);
      if (key === null) continue;
      const hit = this.s.idxFind.get(coll, `unique:${ix.name}`, key);
      if (hit && hit.rid !== rid) throw new DuplicateKeyError(coll, ix.name, Object.fromEntries(ix.fields.map((f) => [f, getPath(doc, f)])));
    }
  }

  // ---- Writes -----------------------------------------------------------------
  _insert(doc) {
    if (doc._id === undefined) doc._id = newObjectId();
    this._checkUnique(doc, null);
    const coll = this.collectionName;
    if (this.s.idGet.get(coll, idKey(doc._id))) throw new DuplicateKeyError(coll, "_id_", { _id: doc._id });
    const { lastInsertRowid } = this.s.insert.run(coll, idKey(doc._id), encode(doc));
    this._indexRow(Number(lastInsertRowid), doc);
    this.db._recordChange(coll, doc._id, null, doc);
    return doc._id;
  }

  async insertOne(doc) {
    return { acknowledged: true, insertedId: this._insert(doc) };
  }

  async insertMany(docs, options = {}) {
    const insertedIds = {};
    const ordered = options.ordered !== false;
    let firstError = null;
    docs.forEach((doc, i) => {
      if (firstError && ordered) return;
      try {
        insertedIds[i] = this._insert(doc);
      } catch (err) {
        firstError = firstError || err;
      }
    });
    if (firstError) throw firstError;
    return { acknowledged: true, insertedCount: docs.length, insertedIds };
  }

  _store(row, next, before) {
    this._checkUnique(next, row.rid);
    this.s.update.run(encode(next), row.rid);
    this._indexRow(row.rid, next);
    this.db._recordChange(this.collectionName, next._id, before, next);
  }

  // Applies one update to a stored row; returns the new document if it changed
  _applyTo(row, update, filter, options) {
    const before = encode(row.doc);
    const next = isOperatorUpdate(update) || Array.isArray(update)
      ? applyUpdate(row.doc, update, { filter, arrayFilters: options.arrayFilters })
      : { ...update, _id: row.doc._id };
    const changed = encode(next) !== before;
    if (changed) this._store(row, next, decode(before));
    return { doc: next, changed };
  }

  _upsert(filter, update, options) {
    let seed = seedFromFilter(splitText(filter).filter);
    seed = isOperatorUpdate(update) || Array.isArray(update)
      ? applyUpdate(seed, update, { filter, arrayFilters: options.arrayFilters, isInsert: true })
      : { ...update, ...(seed._id !== undefined ? { _id: seed._id } : {}) };
    return { id: this._insert(seed), doc: seed };
  }

  async updateOne(filter, update, options = {}) {
    const [row] = this._select(filter, 1);
    if (!row) {
      if (!options.upsert) return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 0, upsertedId: null };
      const { id } = this._upsert(filter, update, options);
      return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 1, upsertedId: id };
    }
    const { changed } = this._applyTo(row, update, filter, options);
    return { acknowledged: true, matchedCount: 1, modifiedCount: changed ? 1 : 0, upsertedCount: 0, upsertedId: null };
  }

  async updateMany(filter, update, options = {}) {
    const rows = this._select(filter);
    if (!rows.length) {
      if (!options.upsert) return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 0, upsertedId: null };
      const { id } = this._upsert(filter, update, options);
      return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 1, upsertedId: id };
    }
    let modified = 0;
    for (const row of rows) if (this._applyTo(row, update, filter, options).changed) modified++;
    return { acknowledged: true, matchedCount: rows.length, modifiedCount: modified, upsertedCount: 0, upsertedId: null };
  }

  async replaceOne(filter, replacement, options = {}) {
    return this.updateOne(filter, replacement, options);
  }

  _metadata(value, options, extra = {}) {
    if (!options.includeResultMetadata) return value;
    return { value, ok: 1, lastErrorObject: extra };
  }

  async findOneAndUpdate(filter, update, options = {}) {
    const rows = this._select(filter, options.sort ? Infinity : 1);
    const row = this._sortRows(rows, options.sort)[0];
    const after = options.returnDocument === "after" || options.returnOriginal === false;
    if (!row) {
      if (!options.upsert) return this._metadata(null, options, { n: 0, updatedExisting: false });
      const { id, doc } = this._upsert(filter, update, options);
      return this._metadata(after ? this._project([doc], options.projection)[0] : null, options, { n: 1, updatedExisting: false, upserted: id });
    }
    const original = decode(encode(row.doc));
    const { doc } = this._applyTo(row, update, filter, options);
    return this._metadata(this._project([after ? doc : original], options.projection)[0], options, { n: 1, updatedExisting: true });
  }

  async findOneAndReplace(filter, replacement, options = {}) {
    return this.findOneAndUpdate(filter, replacement, options);
  }

  _remove(row) {
    this.s.idxClear.run(row.rid);
    this.s.remove.run(row.rid);
    this.db._recordChange(this.collectionName, row.doc._id, row.doc, null);
  }

  // Writes that came from the cloud: they aren't sent back, and the cloud has
  // already decided about uniqueness
  _putRaw(doc) {
    const key = idKey(doc._id);
    const existing = this.s.idGet.get(this.collectionName, key);
    let rid;
    if (existing) {
      rid = existing.rid;
      this.s.update.run(encode(doc), rid);
    } else {
      rid = Number(this.s.insert.run(this.collectionName, key, encode(doc)).lastInsertRowid);
    }
    this._indexRow(rid, doc);
  }

  _getRaw(id) {
    const existing = this.s.idGet.get(this.collectionName, idKey(id));
    return existing ? decode(this.db._db.prepare("SELECT doc FROM docs WHERE rid = ?").get(existing.rid).doc) : null;
  }

  _deleteRaw(id) {
    const existing = this.s.idGet.get(this.collectionName, idKey(id));
    if (!existing) return;
    this.s.idxClear.run(existing.rid);
    this.s.remove.run(existing.rid);
  }

  async findOneAndDelete(filter, options = {}) {
    const rows = this._select(filter, options.sort ? Infinity : 1);
    const row = this._sortRows(rows, options.sort)[0];
    if (!row) return this._metadata(null, options, { n: 0 });
    this._remove(row);
    return this._metadata(this._project([row.doc], options.projection)[0], options, { n: 1 });
  }

  async deleteOne(filter = {}) {
    const [row] = this._select(filter, 1);
    if (row) this._remove(row);
    return { acknowledged: true, deletedCount: row ? 1 : 0 };
  }

  async deleteMany(filter = {}) {
    const rows = this._select(filter);
    rows.forEach((r) => this._remove(r));
    return { acknowledged: true, deletedCount: rows.length };
  }

  async bulkWrite(ops = []) {
    const out = { acknowledged: true, insertedCount: 0, matchedCount: 0, modifiedCount: 0, deletedCount: 0, upsertedCount: 0, upsertedIds: {}, insertedIds: {} };
    for (const [i, op] of ops.entries()) {
      if (op.insertOne) {
        out.insertedIds[i] = this._insert(op.insertOne.document);
        out.insertedCount++;
      } else if (op.updateOne || op.updateMany || op.replaceOne) {
        const spec = op.updateOne || op.updateMany || op.replaceOne;
        const body = spec.update || spec.replacement;
        const r = await (op.updateMany ? this.updateMany(spec.filter, body, spec) : this.updateOne(spec.filter, body, spec));
        out.matchedCount += r.matchedCount;
        out.modifiedCount += r.modifiedCount;
        out.upsertedCount += r.upsertedCount;
        if (r.upsertedId) out.upsertedIds[i] = r.upsertedId;
      } else if (op.deleteOne) {
        out.deletedCount += (await this.deleteOne(op.deleteOne.filter)).deletedCount;
      } else if (op.deleteMany) {
        out.deletedCount += (await this.deleteMany(op.deleteMany.filter)).deletedCount;
      } else {
        throw new Error(`Unsupported bulk operation: ${Object.keys(op)[0]}`);
      }
    }
    return out;
  }

  // ---- Index declarations -----------------------------------------------------
  async createIndex(spec, options = {}) {
    const keys = typeof spec === "string" ? { [spec]: 1 } : spec;
    const fields = Array.isArray(keys) ? keys.map(([f]) => f) : Object.keys(keys);
    const name = options.name || fields.map((f) => `${f}_1`).join("_");
    // Text indexes aren't needed: $text is answered by reading the documents
    if (Object.values(keys).includes("text")) return name;
    this.db._declareIndex(this.collectionName, name, {
      fields,
      unique: !!options.unique,
      sparse: !!options.sparse,
      partialFilter: options.partialFilterExpression || null,
      ttl: options.expireAfterSeconds ?? null,
    });
    return name;
  }

  async createIndexes(specs) {
    return Promise.all(specs.map(({ key, ...options }) => this.createIndex(key, options)));
  }

  async dropIndex(name) {
    this.db._dropIndex(this.collectionName, name);
  }

  async indexes() {
    return this.db._declared(this.collectionName).map((ix) => ({ name: ix.name, key: Object.fromEntries(ix.fields.map((f) => [f, 1])), unique: ix.unique }));
  }

  listIndexes() {
    return new BaseCursor(() => this.db._declared(this.collectionName).map((ix) => ({ name: ix.name, key: Object.fromEntries(ix.fields.map((f) => [f, 1])), unique: ix.unique })));
  }

  async drop() {
    this.db._db.prepare("DELETE FROM idx WHERE coll = ?").run(this.collectionName);
    this.db._db.prepare("DELETE FROM docs WHERE coll = ?").run(this.collectionName);
    return true;
  }
}

// What one write changed, by top-level field. Counters travel as differences so
// that a sale here and a sale elsewhere both count. `was` holds the values before
// the write, so the cloud can tell whether someone else changed them meanwhile;
// `ref` is the record's own id, which bills use to point at a batch.
function diffChange(coll, id, before, after, counters) {
  const key = typeof id === "string" ? id : String(id);
  const ref = (after || before)?.id;
  const tag = ref !== undefined && ref !== null ? { ref: String(ref) } : {};
  if (!after) {
    const { _id, ...was } = before || {};
    return { coll, key, op: "delete", was: JSON.parse(encode(was)), ...tag };
  }
  const { _id, ...fields } = after;
  if (!before) return { coll, key, op: "upsert", new: true, set: JSON.parse(encode(fields)), ...tag };
  const set = {};
  const inc = {};
  const unset = [];
  const was = {};
  for (const [field, value] of Object.entries(fields)) {
    if (encode({ v: value }) === encode({ v: before[field] })) continue;
    if (counters.includes(field) && typeof value === "number" && typeof before[field] === "number") {
      inc[field] = value - before[field];
    } else {
      set[field] = value;
      if (field in before) was[field] = before[field];
    }
  }
  for (const field of Object.keys(before)) {
    if (field !== "_id" && !(field in after)) {
      unset.push(field);
      was[field] = before[field];
    }
  }
  if (!Object.keys(set).length && !Object.keys(inc).length && !unset.length) return null;
  return { coll, key, op: "upsert", set: JSON.parse(encode(set)), inc, unset, was: JSON.parse(encode(was)), ...tag };
}

// ---- Sessions -----------------------------------------------------------------
// Transactions nest as savepoints, because a write request already runs inside
// a transaction of its own (see withWriteTransaction in the server).
class Session {
  constructor(db) {
    this.db = db;
    this.name = null;
  }
  inTransaction() {
    return this.name !== null;
  }
  startTransaction() {
    this.mark = this.db._capture ? this.db._capture.length : 0;
    this.name = `s_${++this.db._savepoints}`;
    this.db._db.exec(`SAVEPOINT ${this.name}`);
  }
  _finish(sql) {
    if (this.name === null) return;
    const name = this.name;
    this.name = null;
    // The enclosing transaction may already have ended (watchdog)
    if (this.db._db.inTransaction) {
      try {
        this.db._db.exec(sql.replaceAll("{}", name));
      } catch (err) {
        console.warn("[LocalDB] savepoint:", err.message);
      }
    }
  }
  async commitTransaction() {
    this._finish("RELEASE {}");
  }
  async abortTransaction() {
    // What the transaction changed is undone, so it mustn't be sent to the cloud either
    if (this.name !== null && this.db._capture) this.db._capture.length = this.mark;
    this._finish("ROLLBACK TO {}; RELEASE {}");
  }
  async endSession() {
    if (this.name !== null) await this.abortTransaction();
  }
  async withTransaction(fn) {
    this.startTransaction();
    try {
      const out = await fn(this);
      await this.commitTransaction();
      return out;
    } catch (err) {
      await this.abortTransaction();
      throw err;
    }
  }
}

// ---- Database -----------------------------------------------------------------
class DocDb {
  constructor(file, key) {
    this._db = new Database(file);
    if (key) {
      this._db.pragma("cipher='sqlcipher'");
      this._db.pragma(`key="x'${key}'"`);
    }
    // Reads the file now, so a wrong key fails at open rather than mid-request
    this._db.prepare("SELECT count(*) FROM sqlite_master").get();
    this._db.pragma("journal_mode = WAL");
    this._db.pragma("synchronous = FULL");
    this._db.pragma("busy_timeout = 5000");
    this._db.exec(`
      CREATE TABLE IF NOT EXISTS docs (rid INTEGER PRIMARY KEY, coll TEXT NOT NULL, _id TEXT NOT NULL, doc TEXT NOT NULL, UNIQUE (coll, _id));
      CREATE TABLE IF NOT EXISTS idx (coll TEXT NOT NULL, path TEXT NOT NULL, val, rid INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS idx_lookup ON idx (coll, path, val);
      CREATE INDEX IF NOT EXISTS idx_rid ON idx (rid);
      CREATE TABLE IF NOT EXISTS indexes (coll TEXT NOT NULL, name TEXT NOT NULL, spec TEXT NOT NULL, PRIMARY KEY (coll, name));
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
      CREATE TABLE IF NOT EXISTS outbox (seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL, changes TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', detail TEXT, created_at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS outbox_status ON outbox (status, seq);
    `);
    this._statements = {
      scan: this._db.prepare("SELECT rid, doc FROM docs WHERE coll = ? ORDER BY rid"),
      count: this._db.prepare("SELECT count(*) AS n FROM docs WHERE coll = ?"),
      idGet: this._db.prepare("SELECT rid FROM docs WHERE coll = ? AND _id = ?"),
      insert: this._db.prepare("INSERT INTO docs (coll, _id, doc) VALUES (?, ?, ?)"),
      update: this._db.prepare("UPDATE docs SET doc = ? WHERE rid = ?"),
      remove: this._db.prepare("DELETE FROM docs WHERE rid = ?"),
      idxClear: this._db.prepare("DELETE FROM idx WHERE rid = ?"),
      idxAdd: this._db.prepare("INSERT INTO idx (coll, path, val, rid) VALUES (?, ?, ?, ?)"),
      idxFind: this._db.prepare("SELECT rid FROM idx WHERE coll = ? AND path = ? AND val = ? LIMIT 1"),
    };
    this._collections = new Map();
    this._savepoints = 0;
    this._listeners = new Set();
    this._capture = null;
    this._syncTracking = null;
    this._loadIndexes();
  }

  _loadIndexes() {
    this._indexes = new Map();
    for (const row of this._db.prepare("SELECT coll, name, spec FROM indexes").all()) {
      if (!this._indexes.has(row.coll)) this._indexes.set(row.coll, new Map());
      this._indexes.get(row.coll).set(row.name, { name: row.name, ...JSON.parse(row.spec) });
    }
    this._pathCache = new Map();
  }

  _declared(coll) {
    return [...(this._indexes.get(coll)?.values() || [])];
  }

  _uniques(coll) {
    return this._declared(coll).filter((ix) => ix.unique);
  }

  _paths(coll) {
    let paths = this._pathCache.get(coll);
    if (!paths) {
      paths = new Set(DEFAULT_PATHS);
      for (const ix of this._declared(coll)) for (const f of ix.fields) if (!USELESS_PATHS.has(f) && usablePath(f)) paths.add(f);
      this._pathCache.set(coll, paths);
    }
    return paths;
  }

  _declareIndex(coll, name, spec) {
    const text = JSON.stringify(spec);
    const existing = this._indexes.get(coll)?.get(name);
    if (existing && JSON.stringify({ fields: existing.fields, unique: existing.unique, sparse: existing.sparse, partialFilter: existing.partialFilter, ttl: existing.ttl }) === text) return;
    this._db.prepare("INSERT OR REPLACE INTO indexes (coll, name, spec) VALUES (?, ?, ?)").run(coll, name, text);
    this._loadIndexes();
    this._reindex(coll);
  }

  _dropIndex(coll, name) {
    this._db.prepare("DELETE FROM indexes WHERE coll = ? AND name = ?").run(coll, name);
    this._db.prepare("DELETE FROM idx WHERE coll = ? AND path = ?").run(coll, `unique:${name}`);
    this._loadIndexes();
  }

  _reindex(coll) {
    const c = this.collection(coll);
    const rows = this._statements.scan.all(coll);
    const run = this._db.transaction(() => {
      for (const row of rows) c._indexRow(row.rid, decode(row.doc));
    });
    if (this._db.inTransaction) {
      for (const row of rows) c._indexRow(row.rid, decode(row.doc));
    } else {
      run();
    }
  }

  // Removes rows past their TTL; MongoDB does this in the background
  purgeExpired(now = Date.now()) {
    for (const [coll, indexes] of this._indexes) {
      for (const ix of indexes.values()) {
        if (ix.ttl === null || ix.ttl === undefined) continue;
        const c = this.collection(coll);
        for (const row of c._select({})) {
          const v = getPath(row.doc, ix.fields[0]);
          const t = v instanceof Date ? v.getTime() : NaN;
          if (t + ix.ttl * 1000 < now) c._remove(row);
        }
      }
    }
  }

  collection(name) {
    if (!this._collections.has(name)) this._collections.set(name, new Collection(this, name));
    return this._collections.get(name);
  }

  createCollection(name) {
    return this.collection(name);
  }

  listCollections() {
    return new BaseCursor(() => this._db.prepare("SELECT DISTINCT coll AS name FROM docs").all());
  }

  admin() {
    return { ping: async () => ({ ok: 1 }) };
  }

  startSession() {
    return new Session(this);
  }

  // ---- Changes for the cloud ---------------------------------------------------
  // tracking: { collections: Set, counters: { coll: [field] } }
  trackChanges(tracking) {
    this._syncTracking = tracking;
  }

  beginCapture() {
    this._capture = [];
  }

  endCapture(commit) {
    const changes = this._capture;
    this._capture = null;
    if (commit && changes?.length) this._outboxAdd(changes);
  }

  _outboxAdd(changes) {
    this._db.prepare("INSERT INTO outbox (id, changes, created_at) VALUES (?, ?, ?)").run(crypto.randomUUID(), encode(changes), Date.now());
    this._emit();
  }

  _recordChange(coll, id, before, after) {
    this._emit();
    const tracking = this._syncTracking;
    if (!tracking || !tracking.collections.has(coll)) return;
    const change = diffChange(coll, id, before, after, tracking.counters[coll] || []);
    if (!change) return;
    if (this._capture) this._capture.push(change);
    else this._outboxAdd([change]);
  }

  // Marks that data changed, for whoever watches this (backups, sync)
  onChange(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  _emit() {
    for (const fn of this._listeners) fn();
  }

  getMeta(key) {
    return this._db.prepare("SELECT value FROM meta WHERE key = ?").get(key)?.value ?? null;
  }

  setMeta(key, value) {
    this._db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)").run(key, value);
  }

  close() {
    this._db.close();
  }
}

module.exports = { DocDb, Session, DuplicateKeyError, newObjectId };
