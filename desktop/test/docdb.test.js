// Behaviour of the local store against what the routes expect from MongoDB.
// Run with: npm run test:db
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { DocDb } = require("../server/docdb");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "docdb-"));
let n = 0;
const open = () => new DocDb(path.join(dir, `t${++n}.db`), "ab".repeat(32));

test("insert assigns _id and find returns copies with dates intact", async () => {
  const c = open().collection("a");
  const when = new Date("2026-01-02T03:04:05Z");
  const doc = { id: "x", at: when, nested: { list: [1, { d: when }] } };
  const r = await c.insertOne(doc);
  assert.ok(doc._id);
  assert.strictEqual(r.insertedId, doc._id);
  const got = await c.findOne({ id: "x" });
  assert.ok(got.at instanceof Date);
  assert.strictEqual(got.at.getTime(), when.getTime());
  assert.ok(got.nested.list[1].d instanceof Date);
  got.id = "changed";
  assert.strictEqual((await c.findOne({ id: "x" })).id, "x");
});

test("filters: equality on arrays, null matches missing, ranges, in, regex, or", async () => {
  const c = open().collection("a");
  await c.insertMany([
    { id: "1", n: 5, tags: ["a", "b"], s: "Paracetamol" },
    { id: "2", n: 10, tags: ["c"], s: "Crocin", gone: null },
    { id: "3", n: 15, s: "aspirin" },
  ]);
  assert.strictEqual((await c.find({ tags: "b" }).toArray()).length, 1);
  assert.strictEqual((await c.find({ gone: null }).toArray()).length, 3);
  assert.strictEqual((await c.find({ tags: { $exists: false } }).toArray()).length, 1);
  assert.deepStrictEqual((await c.find({ n: { $gt: 5, $lte: 15 } }).sort({ n: -1 }).toArray()).map((d) => d.id), ["3", "2"]);
  assert.strictEqual(await c.countDocuments({ id: { $in: ["1", "3", "9"] } }), 2);
  assert.strictEqual((await c.find({ s: { $regex: "^para", $options: "i" } }).toArray()).length, 1);
  assert.strictEqual((await c.find({ s: /CROCIN/i }).toArray()).length, 1);
  assert.strictEqual((await c.find({ $or: [{ id: "1" }, { n: 15 }] }).toArray()).length, 2);
});

test("indexed lookup finds values inside arrays and dotted paths", async () => {
  const db = open();
  const c = db.collection("bills");
  await c.createIndex({ pharmacy_id: 1, "items.product_id": 1 });
  await c.insertOne({ id: "b1", pharmacy_id: "p", items: [{ product_id: "m1" }, { product_id: "m2" }] });
  await c.insertOne({ id: "b2", pharmacy_id: "p", items: [{ product_id: "m3" }] });
  assert.strictEqual((await c.find({ pharmacy_id: "p", "items.product_id": "m2" }).toArray()).length, 1);
  await c.updateOne({ id: "b1" }, { $set: { "items.1.product_id": "m9" } });
  assert.strictEqual((await c.find({ "items.product_id": "m2" }).toArray()).length, 0);
  assert.strictEqual((await c.find({ "items.product_id": "m9" }).toArray()).length, 1);
});

test("index added after data exists is backfilled", async () => {
  const db = open();
  const c = db.collection("a");
  await c.insertOne({ code: "abc" });
  await c.createIndex({ code: 1 });
  assert.strictEqual((await c.find({ code: "abc" }).toArray()).length, 1);
});

test("sort, skip, limit and projection", async () => {
  const c = open().collection("a");
  await c.insertMany([{ id: "a", v: 2, x: 1 }, { id: "b", v: 1, x: 2 }, { id: "c", x: 3 }]);
  assert.deepStrictEqual((await c.find({}).sort({ v: 1 }).toArray()).map((d) => d.id), ["c", "b", "a"]);
  assert.deepStrictEqual((await c.find({}).sort({ v: -1 }).skip(1).limit(1).toArray()).map((d) => d.id), ["b"]);
  assert.deepStrictEqual(await c.findOne({ id: "a" }, { projection: { _id: 0, id: 1 } }), { id: "a" });
  const noX = await c.findOne({ id: "a" }, { projection: { _id: 0, x: 0 } });
  assert.deepStrictEqual(noX, { id: "a", v: 2 });
});

test("update operators", async () => {
  const c = open().collection("a");
  await c.insertOne({ id: "1", n: 5, list: [1], obj: { k: 1 }, drop: true, items: [{ b: "x", q: 1 }, { b: "y", q: 2 }] });
  const r = await c.updateOne(
    { id: "1" },
    {
      $inc: { n: 2, fresh: 1 },
      $set: { "obj.z": 9 },
      $unset: { drop: "" },
      $push: { list: { $each: [2, 3], $slice: -2 } },
      $addToSet: { tags: "t" },
      $max: { big: 10 },
      $min: { small: 1 },
    }
  );
  assert.strictEqual(r.modifiedCount, 1);
  const d = await c.findOne({ id: "1" });
  assert.strictEqual(d.n, 7);
  assert.strictEqual(d.fresh, 1);
  assert.strictEqual(d.obj.z, 9);
  assert.strictEqual(d.drop, undefined);
  assert.deepStrictEqual(d.list, [2, 3]);
  assert.deepStrictEqual(d.tags, ["t"]);
  await c.updateOne({ id: "1" }, { $set: { "items.$[e].q": 50 } }, { arrayFilters: [{ "e.b": "y" }] });
  await c.updateOne({ id: "1", "items.b": "x" }, { $inc: { "items.$.q": 1 } });
  const after = await c.findOne({ id: "1" });
  assert.deepStrictEqual(after.items.map((i) => i.q), [2, 50]);
  const noop = await c.updateOne({ id: "1" }, { $set: { n: 7 } });
  assert.strictEqual(noop.modifiedCount, 0);
  assert.strictEqual(noop.matchedCount, 1);
});

test("pipeline update, as used to take stock", async () => {
  const c = open().collection("inventory");
  await c.insertOne({ id: "b", qty: 3 });
  const taken = 5;
  const doc = await c.findOneAndUpdate(
    { id: "b" },
    [{ $set: { _prev: "$qty", qty: { $max: [0, { $subtract: ["$qty", taken] }] } } }],
    { returnDocument: "after" }
  );
  assert.strictEqual(doc.qty, 0);
  assert.strictEqual(doc._prev, 3);
});

test("upsert seeds from the filter and honours setOnInsert", async () => {
  const c = open().collection("a");
  const r = await c.updateOne({ id: "u", kind: "x" }, { $set: { v: 1 }, $setOnInsert: { born: 1 } }, { upsert: true });
  assert.strictEqual(r.upsertedCount, 1);
  assert.ok(r.upsertedId);
  await c.updateOne({ id: "u" }, { $set: { v: 2 }, $setOnInsert: { born: 9 } }, { upsert: true });
  const d = await c.findOne({ id: "u" });
  assert.strictEqual(d.kind, "x");
  assert.strictEqual(d.born, 1);
  assert.strictEqual(d.v, 2);
});

test("findOneAndUpdate returns before or after, and counters stay atomic", async () => {
  const c = open().collection("counters");
  const first = await c.findOneAndUpdate({ key: "bill" }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: "after" });
  assert.strictEqual(first.seq, 1);
  const before = await c.findOneAndUpdate({ key: "bill" }, { $inc: { seq: 1 } });
  assert.strictEqual(before.seq, 1);
  const seqs = await Promise.all(Array.from({ length: 20 }, () => c.findOneAndUpdate({ key: "bill" }, { $inc: { seq: 1 } }, { returnDocument: "after" })));
  assert.strictEqual(new Set(seqs.map((s) => s.seq)).size, 20);
  const meta = await c.findOneAndDelete({ key: "bill" }, { includeResultMetadata: true });
  assert.strictEqual(meta.value.key, "bill");
});

test("unique indexes reject duplicates with code 11000, partial ones only within scope", async () => {
  const db = open();
  const c = db.collection("users");
  await c.createIndex({ email: 1 }, { unique: true });
  await c.insertOne({ email: "a@x" });
  await assert.rejects(c.insertOne({ email: "a@x" }), (e) => e.code === 11000 && e.keyValue.email === "a@x");
  await c.insertOne({ email: "b@x" });
  await assert.rejects(c.updateOne({ email: "b@x" }, { $set: { email: "a@x" } }), (e) => e.code === 11000);
  await c.updateOne({ email: "b@x" }, { $set: { email: "b@x", other: 1 } });

  const p = db.collection("bills");
  await p.createIndex({ pharmacy_id: 1, bill_no: 1 }, { unique: true, partialFilterExpression: { bill_no: { $type: "string" } } });
  await p.insertOne({ pharmacy_id: "p", bill_no: "A1" });
  await p.insertOne({ pharmacy_id: "p" });
  await p.insertOne({ pharmacy_id: "p" });
  await assert.rejects(p.insertOne({ pharmacy_id: "p", bill_no: "A1" }), (e) => e.code === 11000);
  await p.insertOne({ pharmacy_id: "q", bill_no: "A1" });
});

test("aggregate: match, group, unwind, lookup, sort, dates", async () => {
  const db = open();
  await db.collection("customers").insertOne({ id: "c1", name: "Asha" });
  const b = db.collection("bills");
  await b.insertMany([
    { id: "1", customer_id: "c1", total: 100, at: new Date("2026-01-01"), items: [{ q: 1 }, { q: 2 }] },
    { id: "2", customer_id: "c1", total: 50, at: new Date("2026-02-01"), items: [{ q: 3 }] },
    { id: "3", customer_id: "c2", total: 10, at: new Date("2026-03-01"), items: [] },
  ]);
  const out = await b
    .aggregate([
      { $match: { at: { $gte: new Date("2026-01-15") } } },
      { $group: { _id: "$customer_id", sum: { $sum: "$total" } } },
      { $sort: { sum: -1 } },
      { $lookup: { from: "customers", localField: "_id", foreignField: "id", as: "c" } },
    ])
    .toArray();
  assert.deepStrictEqual(out.map((o) => o.sum), [50, 10]);
  assert.strictEqual(out[0].c[0].name, "Asha");
  const qty = await b.aggregate([{ $unwind: "$items" }, { $group: { _id: null, q: { $sum: "$items.q" } } }]).next();
  assert.strictEqual(qty.q, 6);
  const months = await b.aggregate([{ $group: { _id: { $dateToString: { format: "%Y-%m", date: "$at", timezone: "Asia/Kolkata" } }, n: { $sum: 1 } } }, { $sort: { _id: 1 } }]).toArray();
  assert.strictEqual(months[0]._id, "2026-01");
});

test("text search matches any term and scores", async () => {
  const c = open().collection("a");
  await c.insertMany([{ id: "1", s: "Dolo tablet" }, { id: "2", s: "dolo syrup tablet" }, { id: "3", s: "other" }]);
  const out = await c
    .find({ $text: { $search: "dolo syrup" } }, { projection: { _id: 0, id: 1, score: { $meta: "textScore" } } })
    .sort({ score: { $meta: "textScore" } })
    .toArray();
  assert.deepStrictEqual(out.map((d) => d.id), ["2", "1"]);
  assert.strictEqual(out[0].score, 2);
});

test("sessions roll back and commit", async () => {
  const db = open();
  const c = db.collection("a");
  let s = db.startSession();
  s.startTransaction();
  await c.insertOne({ id: "gone" }, { session: s });
  await s.abortTransaction();
  await s.endSession();
  assert.strictEqual(await c.findOne({ id: "gone" }), null);
  s = db.startSession();
  s.startTransaction();
  await c.insertOne({ id: "kept" }, { session: s });
  await s.commitTransaction();
  assert.ok(await c.findOne({ id: "kept" }));
  await assert.rejects(
    db.startSession().withTransaction(async () => {
      await c.insertOne({ id: "gone2" });
      throw new Error("boom");
    })
  );
  assert.strictEqual(await c.findOne({ id: "gone2" }), null);
});

test("data is encrypted on disk and survives reopening; a wrong key is refused", async () => {
  const file = path.join(dir, "enc.db");
  const key = "cd".repeat(32);
  let db = new DocDb(file, key);
  await db.collection("a").insertOne({ id: "secret-medicine-name" });
  await db.collection("a").createIndex({ code: 1 }, { unique: true });
  db.close();
  for (const f of fs.readdirSync(dir).filter((x) => x.startsWith("enc.db"))) {
    assert.ok(!fs.readFileSync(path.join(dir, f)).includes("secret-medicine-name"), `${f} holds plain text`);
  }
  db = new DocDb(file, key);
  assert.ok(await db.collection("a").findOne({ id: "secret-medicine-name" }));
  assert.strictEqual((await db.collection("a").indexes()).length, 1);
  db.close();
  assert.throws(() => new DocDb(file, "ef".repeat(32)));
});

test("TTL purge removes only expired rows", async () => {
  const db = open();
  const c = db.collection("otp");
  await c.createIndex({ at: 1 }, { expireAfterSeconds: 60 });
  await c.insertMany([{ id: "old", at: new Date(Date.now() - 120000) }, { id: "new", at: new Date() }, { id: "nodate" }]);
  db.purgeExpired();
  assert.deepStrictEqual((await c.find({}).toArray()).map((d) => d.id).sort(), ["new", "nodate"]);
});

test.after(() => fs.rmSync(dir, { recursive: true, force: true }));
