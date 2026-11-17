// One-off data fix (Nov 2026): imports before this fix stored the cost per unit of
// imported stock WITHOUT GST, while purchases entered in DavaDesk store the landing
// cost WITH GST, and bill profit is (amount with GST) - (cost with GST). So every
// sale from imported stock showed the GST as profit.
//
// What it corrects, for imports only (records the app made itself are already right):
//   1. purchase lines from a purchase import: cost per unit = line total with GST / units
//   2. stock batches from a purchase or stock import: the same landing cost
//   3. bill lines that sold from those batches, typed or imported: their cost and profit,
//      and the bill's total cost and profit
//   4. imported sales lines that had no batch left (cost 0, so profit = whole amount):
//      the product's landing cost from another batch, where there is one
// Every change is saved first in data_fix_landing_cost (before/after), so it can be reviewed
// or reversed. Running it again changes nothing. DRY_RUN=1 only reports.
//
// Run inside the backend container: node scripts/fix-import-landing-cost.js [pharmacy_id]
const { MongoClient } = require("mongodb");

const DRY = process.env.DRY_RUN === "1";
const ONLY = process.argv[2] || null;
const r4 = (n) => Math.round(n * 10000) / 10000;
const r2 = (n) => Math.round(n * 100) / 100;
const gstOf = (x) => (Number(x?.cgst) || 0) + (Number(x?.sgst) || 0);

(async () => {
  const c = await MongoClient.connect(process.env.MONGO_URL || process.env.MONGODB_URI);
  const db = c.db(process.env.DB_NAME || undefined);
  const audit = db.collection("data_fix_landing_cost");
  const done = new Set((await audit.distinct("key")).map(String));
  const save = async (key, coll, id, before, after) => {
    if (DRY) return;
    await audit.insertOne({ key, coll, id, before, after, at: new Date().toISOString() });
  };
  const jobs = await db.collection("migration_jobs").find({ status: { $in: ["committed", "partly_undone", "failed_commit"] }, entity: { $in: ["purchases", "stock", "sales"] }, ...(ONLY ? { pharmacy_id: ONLY } : {}) }).project({ _id: 0, id: 1, entity: 1, pharmacy_id: 1, file_name: 1 }).toArray();
  const byEntity = (e) => jobs.filter((j) => j.entity === e).map((j) => j.id);
  const stats = { purchase_lines: 0, batches: 0, bill_lines: 0, bills: 0, nobatch_lines: 0, profit_before: 0, profit_after: 0 };
  console.log(`${DRY ? "DRY RUN: " : ""}${jobs.length} imports: ${JSON.stringify(jobs.map((j) => [j.entity, j.file_name]))}`);

  // 1. Purchase lines of purchase imports, and the landing cost of each product|batch
  const landing = new Map(); // purchase_id|product_id|batch -> cost
  for await (const p of db.collection("purchases").find({ import_job_id: { $in: byEntity("purchases") } })) {
    let changed = false;
    const before = p.items.map((i) => i.purchase_price);
    p.items.forEach((it) => {
      const units = Number(it.total_units || it.quantity) || 0;
      if (!(units > 0) || !(it.item_total > 0)) return;
      const cost = r4(it.item_total / units);
      landing.set(`${p.id}|${it.product_id}|${it.batch_no}`, cost);
      if (Math.abs(cost - (Number(it.purchase_price) || 0)) > 0.0001) {
        it.purchase_price = cost;
        it.price_per_unit = cost;
        it.cost_per_unit = cost;
        changed = true;
        stats.purchase_lines++;
      }
    });
    const key = `purchase|${p.id}`;
    if (changed && !done.has(key)) {
      await save(key, "purchases", p.id, before, p.items.map((i) => i.purchase_price));
      if (!DRY) await db.collection("purchases").updateOne({ id: p.id }, { $set: { items: p.items } });
    }
  }

  // 2. Batches made by purchase or stock imports
  const batchCost = new Map(); // inventory id -> { old, cost }
  for await (const b of db.collection("inventory").find({ import_job_id: { $in: [...byEntity("purchases"), ...byEntity("stock")] } })) {
    const old = Number(b.purchase_price) || 0;
    if (!(old > 0)) continue;
    const key = `inventory|${b.id}`;
    if (done.has(key)) continue;
    const fromPurchase = landing.get(`${b.purchase_id}|${b.product_id}|${b.batch_no}`);
    const cost = fromPurchase || r4(old * (1 + gstOf(b) / 100));
    if (Math.abs(cost - old) <= 0.0001) continue;
    batchCost.set(b.id, { old, cost });
    stats.batches++;
    await save(key, "inventory", b.id, old, cost);
    if (!DRY) await db.collection("inventory").updateOne({ id: b.id }, { $set: { purchase_price: cost, updated_at: new Date().toISOString() } });
  }

  // 3 + 4. Bill lines: sold from a corrected batch, or an imported sale with no batch and no cost
  const latestCost = async (pharmacyId, productId) => {
    const x = await db.collection("inventory").findOne({ pharmacy_id: pharmacyId, product_id: productId, purchase_price: { $gt: 0 } }, { sort: { created_at: -1 }, projection: { _id: 0, id: 1, purchase_price: 1 } });
    if (!x) return 0;
    return batchCost.get(x.id)?.cost || x.purchase_price;
  };
  const ids = [...batchCost.keys()];
  const salesJobs = new Set(byEntity("sales"));
  const q = { $or: [{ "items.inventory_id": { $in: ids } }, { import_job_id: { $in: [...salesJobs] } }], ...(ONLY ? { pharmacy_id: ONLY } : {}) };
  for await (const bill of db.collection("bills").find(q)) {
    const key = `bill|${bill.id}`;
    if (done.has(key)) continue;
    let delta = 0;
    const before = { profit: bill.profit, total_cost: bill.total_cost, items: bill.items.map((i) => [i.purchase_price, i.profit]) };
    for (const it of bill.items) {
      const qty = Number(it.quantity) || 0;
      const pp = Number(it.purchase_price) || 0;
      let cost = null;
      const fix = it.inventory_id && batchCost.get(it.inventory_id);
      if (fix && Math.abs(pp - fix.old) < 0.01) cost = fix.cost;
      else if (!it.inventory_id && pp === 0 && salesJobs.has(bill.import_job_id) && it.product_id) {
        const lc = await latestCost(bill.pharmacy_id, it.product_id);
        if (lc > 0) { cost = lc; stats.nobatch_lines++; }
      }
      if (cost === null) continue;
      const d = (cost - pp) * qty;
      it.purchase_price = cost;
      it.profit = r2((Number(it.profit) || 0) - d);
      delta += d;
      stats.bill_lines++;
    }
    if (!delta) continue;
    stats.bills++;
    stats.profit_before += Number(bill.profit) || 0;
    const profit = r2((Number(bill.profit) || 0) - delta);
    const totalCost = r2((Number(bill.total_cost) || 0) + delta);
    stats.profit_after += profit;
    if (process.env.SHOW && bill.bill_no === process.env.SHOW) console.log("SHOW", bill.bill_no, JSON.stringify({ before, after: { profit, total_cost: totalCost, items: bill.items.map((i) => [i.product_name, i.quantity, i.item_total, i.purchase_price, i.profit]) } }));
    await save(key, "bills", bill.id, before, { profit, total_cost: totalCost });
    if (!DRY) await db.collection("bills").updateOne({ id: bill.id }, { $set: { items: bill.items, profit, total_cost: totalCost } });
  }
  stats.profit_before = r2(stats.profit_before);
  stats.profit_after = r2(stats.profit_after);
  console.log(JSON.stringify(stats));
  await c.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
