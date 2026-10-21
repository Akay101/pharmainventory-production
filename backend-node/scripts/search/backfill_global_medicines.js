/**
 * Backfill precomputed search keys on global_collections.global_medicines and
 * create the indexes the medicine search relies on.
 *
 * Idempotent and safe to re-run (e.g. after a new catalogue import):
 *   node scripts/search/backfill_global_medicines.js            # only docs missing/stale keys
 *   node scripts/search/backfill_global_medicines.js --all      # recompute every doc
 *   node scripts/search/backfill_global_medicines.js --uri "mongodb://..."   # override GLOBAL_MONGO_URI
 *   node scripts/search/backfill_global_medicines.js --indexes-only
 */
require("dotenv").config({ path: require("path").join(__dirname, "../../.env") });
const { MongoClient } = require("mongodb");
const {
  buildMedicineSearchKeys,
  SEARCH_KEYS_VERSION,
} = require("../../services/search/normalize");
const { GLOBAL_MEDICINE_INDEXES } = require("../../services/search/indexes");

const args = process.argv.slice(2);
const argValue = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};

const URI = argValue("--uri") || process.env.GLOBAL_MONGO_URI;
const DB_NAME = argValue("--db") || "global_collections";
const BATCH = 1000;

(async () => {
  if (!URI) throw new Error("GLOBAL_MONGO_URI not set (or pass --uri)");
  const client = new MongoClient(URI);
  await client.connect();
  const col = client.db(DB_NAME).collection("global_medicines");
  const started = Date.now();

  if (!args.includes("--indexes-only")) {
    const filter = args.includes("--all") ? {} : { s_v: { $ne: SEARCH_KEYS_VERSION } };
    const total = await col.countDocuments(filter);
    console.log(`Backfilling search keys on ${total} documents...`);

    const cursor = col
      .find(filter, {
        projection: { product_name: 1, name: 1, brand: 1, active_ingredients: 1, manufacturer: 1, manufacturer_name: 1 },
      })
      .batchSize(BATCH);

    let ops = [];
    let done = 0;
    for await (const doc of cursor) {
      ops.push({ updateOne: { filter: { _id: doc._id }, update: { $set: buildMedicineSearchKeys(doc) } } });
      if (ops.length >= BATCH) {
        await col.bulkWrite(ops, { ordered: false });
        done += ops.length;
        ops = [];
        if (done % 20000 === 0) console.log(`  ${done}/${total}`);
      }
    }
    if (ops.length) {
      await col.bulkWrite(ops, { ordered: false });
      done += ops.length;
    }
    console.log(`Backfilled ${done} documents in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  }

  for (const { key, options } of GLOBAL_MEDICINE_INDEXES) {
    const t = Date.now();
    await col.createIndex(key, options);
    console.log(`Index ${options.name} ready (${Date.now() - t}ms)`);
  }

  const stats = await client.db(DB_NAME).command({ collStats: "global_medicines" });
  console.log("Index sizes (MB):");
  for (const [name, bytes] of Object.entries(stats.indexSizes)) {
    console.log(`  ${name}: ${(bytes / 1e6).toFixed(1)}`);
  }
  await client.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
