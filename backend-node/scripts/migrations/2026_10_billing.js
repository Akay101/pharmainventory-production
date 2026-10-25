/**
 * Billing redesign migration (idempotent, safe to re-run).
 *
 *   node scripts/migrations/2026_10_billing.js --dry-run
 *   node scripts/migrations/2026_10_billing.js [--uri mongodb://...]
 *
 * 1. Abort if users share an email (case-insensitive) — fix those by hand.
 * 2. Seed `plans` (from PLAN_*_PRICE env) and `pricing_config` if missing.
 * 3. Convert legacy promo codes to type ACCESS; record past redemptions.
 * 4. Move per-user subscriptions onto pharmacies.subscription; backfill
 *    ledger rows with pharmacy_id / kind / source_ref.
 * 5. Mirror pharmacy subscriptions to every user (staff included).
 * 6. Create core indexes (unique email, codes, orders, tokens...).
 */
require("dotenv").config({ path: require("path").join(__dirname, "../../.env") });
const crypto = require("crypto");
const { MongoClient } = require("mongodb");
const { defaultPlans, defaultPricingConfig, CONFIG_ID } = require("../../services/billing/pricing");
const { mirrorToUsers } = require("../../services/billing/subscriptions");
const { ensureCoreIndexes } = require("../../services/billing/indexes");

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const uriArg = args.indexOf("--uri");
const URI = uriArg >= 0 ? args[uriArg + 1] : process.env.MONGO_URL;

const log = (...a) => console.log(DRY ? "[dry-run]" : "[migrate]", ...a);

const kindFromSource = (src = "") => (/CASHFREE/i.test(src) ? "PAID" : "PROMO");

(async () => {
  if (!URI) throw new Error("MONGO_URL not set (or pass --uri)");
  const client = new MongoClient(URI);
  await client.connect();
  const db = client.db();
  log("database:", db.databaseName);

  // 1. Duplicate emails
  const dups = await db
    .collection("users")
    .aggregate([
      { $match: { email: { $type: "string" } } },
      { $group: { _id: { $toLower: "$email" }, n: { $sum: 1 }, ids: { $push: "$id" } } },
      { $match: { n: { $gt: 1 } } },
    ])
    .toArray();
  if (dups.length) {
    console.error("Duplicate emails found, resolve before migrating:", JSON.stringify(dups, null, 2));
    process.exit(2);
  }
  const mixedCase = await db.collection("users").find({ email: { $regex: "[A-Z]" } }, { projection: { id: 1, email: 1 } }).toArray();
  log(`users with uppercase in email: ${mixedCase.length}`);
  if (!DRY) for (const u of mixedCase) await db.collection("users").updateOne({ id: u.id }, { $set: { email: u.email.toLowerCase() } });

  // 2. Plans and pricing config
  for (const plan of defaultPlans()) {
    const exists = await db.collection("plans").findOne({ code: plan.code });
    log(`plan ${plan.code}: ${exists ? "exists, unchanged" : `seed at ₹${plan.price_paise / 100}`}`);
    if (!exists && !DRY) {
      await db.collection("plans").insertOne({ ...plan, created_at: new Date(), updated_at: new Date() });
    }
  }
  const cfg = await db.collection("pricing_config").findOne({ _id: CONFIG_ID });
  log(`pricing_config: ${cfg ? "exists" : "seed defaults (trial 7 days, best plan)"}`);
  if (!cfg && !DRY) await db.collection("pricing_config").insertOne(defaultPricingConfig());

  // 3. Legacy promo codes
  const legacy = await db.collection("promo_codes").find({ type: { $exists: false } }).toArray();
  log(`legacy promo codes to convert: ${legacy.length}`);
  for (const p of legacy) {
    const upper = String(p.code || "").trim().toUpperCase();
    const update = {
      type: "ACCESS",
      plans: p.plan ? [p.plan] : [],
      usage_limit: p.usage_limit ?? 1,
      used_count: p.used_count ?? 0,
      per_account_limit: 1,
      source: "ADMIN",
      valid_from: null,
      valid_until: null,
    };
    if (upper !== p.code) {
      const clash = await db.collection("promo_codes").findOne({ code: upper });
      if (!clash) update.code = upper;
    }
    if (!DRY) await db.collection("promo_codes").updateOne({ _id: p._id }, { $set: update });
    if (p.used_by_pharmacy_id) {
      const code = update.code || p.code;
      const has = await db.collection("promo_redemptions").findOne({ code, pharmacy_id: p.used_by_pharmacy_id });
      if (!has && !DRY) {
        await db.collection("promo_redemptions").insertOne({
          id: crypto.randomUUID(),
          code,
          type: "ACCESS",
          pharmacy_id: p.used_by_pharmacy_id,
          user_id: p.used_by_user_id || null,
          order_id: null,
          status: "REDEEMED",
          created_at: p.used_at ? new Date(p.used_at) : new Date(),
          updated_at: new Date(),
          migrated: true,
        });
      }
    }
  }

  // 4. Ledger backfill + pharmacy snapshot
  const ledger = await db.collection("subscriptions").find({ source_ref: { $exists: false } }).toArray();
  log(`ledger rows to backfill: ${ledger.length}`);
  for (const row of ledger) {
    let pharmacyId = row.pharmacy_id;
    if (!pharmacyId && row.user_id) {
      pharmacyId = (await db.collection("users").findOne({ id: row.user_id }, { projection: { pharmacy_id: 1 } }))?.pharmacy_id;
    }
    if (!DRY) {
      await db.collection("subscriptions").updateOne(
        { _id: row._id },
        { $set: { source_ref: `legacy:${row.id || row._id}`, pharmacy_id: pharmacyId || null, kind: kindFromSource(row.metadata?.source) } }
      );
    }
  }

  const now = new Date();
  const pharmacies = await db.collection("pharmacies").find({ subscription: { $exists: false } }, { projection: { id: 1 } }).toArray();
  let active = 0;
  let lapsed = 0;
  for (const ph of pharmacies) {
    const users = await db
      .collection("users")
      .find({ pharmacy_id: ph.id, subscription_plan: { $ne: null }, subscription_expiry: { $ne: null } })
      .toArray();
    if (!users.length) continue;
    const best = users.sort((a, b) => new Date(b.subscription_expiry) - new Date(a.subscription_expiry))[0];
    const row =
      (best.subscription_id && (await db.collection("subscriptions").findOne({ id: best.subscription_id }))) ||
      (await db.collection("subscriptions").find({ user_id: best.id }).sort({ created_at: -1 }).limit(1).next());
    const endsAt = new Date(best.subscription_expiry);
    const isLive = endsAt > now;
    isLive ? active++ : lapsed++;
    const sub = {
      plan: best.subscription_plan,
      kind: kindFromSource(row?.metadata?.source),
      status: isLive ? "ACTIVE" : "EXPIRED",
      starts_at: row?.start_date ? new Date(row.start_date) : now,
      ends_at: endsAt,
      amount_paise: 0,
      ledger_id: row?.id || null,
      trial_used: false,
      updated_at: now,
      migrated: true,
    };
    if (!DRY) {
      await db.collection("pharmacies").updateOne({ id: ph.id }, { $set: { subscription: sub } });
      await mirrorToUsers(db, ph.id, sub);
    }
  }
  log(`pharmacy subscriptions migrated: ${active} active, ${lapsed} lapsed`);

  // 6. Indexes
  if (!DRY) {
    const failed = await ensureCoreIndexes(db);
    if (failed) process.exitCode = 1;
  }
  await client.close();
  log("done");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
