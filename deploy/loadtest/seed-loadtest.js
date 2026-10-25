// Seeds load-test pharmacies into an ISOLATED database (never the live one),
// then stocks each one through the real API so inventory looks like a shop's.
//   MONGO_URL=mongodb://.../loadtest_db BASE=http://127.0.0.1:8090/api ACCOUNTS=20 node seed-loadtest.js
const { MongoClient } = require("mongodb");
const bcrypt = require("bcryptjs");

const MONGO_URL = process.env.MONGO_URL;
const BASE = process.env.BASE || "http://127.0.0.1:8090/api";
const ACCOUNTS = Number(process.env.ACCOUNTS || 20);
const PURCHASES = Number(process.env.PURCHASES || 8);
const ITEMS = Number(process.env.ITEMS || 30);
if (!MONGO_URL || (!/loadtest/.test(MONGO_URL) && process.env.ALLOW_ANY_DB !== "1")) throw new Error("MONGO_URL must point at a *loadtest* database");

const MEDS = ["Dolo 650", "Paracetamol 500", "Azithromycin 500", "Pan 40", "Amoxicillin 500", "Cetirizine 10", "Metformin 500", "Atorvastatin 10", "Telmisartan 40", "Crocin Advance", "Vitamin D3 60K", "Omez 20", "Augmentin 625", "Calpol 650", "Montair LC", "Shelcal 500", "Becosules", "Limcee", "Allegra 120", "Zincovit"];

(async () => {
  const client = await MongoClient.connect(MONGO_URL);
  const db = client.db();
  const now = new Date();
  const ends = new Date(Date.now() + 60 * 864e5).toISOString();
  const hash = bcrypt.hashSync("LoadTest@123", 10);
  for (let i = 1; i <= ACCOUNTS; i++) {
    const pid = `lt-ph-${i}`;
    await db.collection("pharmacies").updateOne({ id: pid }, { $set: { id: pid, name: `Load Pharmacy ${i}`, location: "Pune", subscription: { plan: "AGENTIC", kind: "PAID", status: "ACTIVE", starts_at: now.toISOString(), ends_at: ends, ledger_id: `lt-${pid}` }, created_at: now.toISOString() } }, { upsert: true });
    await db.collection("users").updateOne({ id: `lt-u-${i}` }, { $set: { id: `lt-u-${i}`, name: `Load Owner ${i}`, email: `load${i}@loadtest.local`, mobile: `90000${String(i).padStart(5, "0")}`, password_hash: hash, role: "ADMIN", pharmacy_id: pid, is_primary_admin: true, verified: true, token_version: 0, subscription_plan: "AGENTIC", subscription_expiry: ends, created_at: now.toISOString() } }, { upsert: true });
  }
  await client.close();
  console.log(`seeded ${ACCOUNTS} pharmacies`);

  const post = async (path, body, token) => {
    const r = await fetch(BASE + path, { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
    return { status: r.status, data: await r.json().catch(() => null) };
  };
  let made = 0;
  for (let i = 1; i <= ACCOUNTS; i++) {
    const token = (await post("/auth/login", { email: `load${i}@loadtest.local`, password: "LoadTest@123" })).data?.token;
    if (!token) throw new Error(`login failed for load${i}`);
    for (let p = 0; p < PURCHASES; p++) {
      const items = Array.from({ length: ITEMS }, (_, k) => {
        const med = MEDS[(p * ITEMS + k) % MEDS.length];
        return { product_name: `${med} ${k % 3 ? "Tablet" : "Strip"} ${Math.floor(k / MEDS.length)}`, batch_no: `L${i}P${p}K${k}`, expiry_date: `202${7 + (k % 3)}-0${1 + (k % 9)}-28`, pack_quantity: 20 + (k % 30), units_per_pack: 10, pack_price: 20 + k, mrp_per_unit: 3 + (k % 20) };
      });
      const r = await post("/purchases", { supplier_name: `Load Distributor ${p % 4}`, invoice_no: `LT${i}-${p}-${Date.now() % 1e6}`, purchase_date: "2026-10-01", payment_status: "Paid", payment_mode: "Cash", items }, token);
      if (r.status !== 201 && r.status !== 200) throw new Error(`purchase failed ${r.status} ${JSON.stringify(r.data).slice(0, 200)}`);
      made += ITEMS;
    }
  }
  console.log(`stocked ${made} batches`);
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
