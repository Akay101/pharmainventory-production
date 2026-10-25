// Indexes for auth, billing and subscriptions. Ensured at startup; unique
// indexes fail loudly (logged) if existing data violates them — run
// scripts/migrations/2026_10_billing.js to clean up first.
const CORE_INDEXES = {
  users: [{ key: { email: 1 }, options: { name: "email_unique", unique: true } }],
  pharmacies: [
    { key: { id: 1 }, options: { name: "id" } },
    { key: { "subscription.status": 1, "subscription.ends_at": 1 }, options: { name: "subscription_due" } },
  ],
  subscriptions: [
    {
      key: { source_ref: 1 },
      options: { name: "source_ref_unique", unique: true, partialFilterExpression: { source_ref: { $type: "string" } } },
    },
    { key: { pharmacy_id: 1, created_at: -1 }, options: { name: "pharmacy_created" } },
  ],
  plans: [{ key: { code: 1 }, options: { name: "code_unique", unique: true } }],
  promo_codes: [{ key: { code: 1 }, options: { name: "code_unique", unique: true } }],
  promo_redemptions: [
    {
      key: { code: 1, pharmacy_id: 1 },
      options: {
        name: "one_live_use_per_pharmacy",
        unique: true,
        partialFilterExpression: { status: { $in: ["RESERVED", "REDEEMED"] } },
      },
    },
    { key: { order_id: 1 }, options: { name: "order_id" } },
  ],
  payment_orders: [
    { key: { order_id: 1 }, options: { name: "order_id_unique", unique: true } },
    { key: { pharmacy_id: 1, created_at: -1 }, options: { name: "pharmacy_created" } },
    { key: { status: 1, created_at: 1 }, options: { name: "status_created" } },
  ],
  refresh_tokens: [
    { key: { jti: 1 }, options: { name: "jti_unique", unique: true } },
    { key: { family: 1 }, options: { name: "family" } },
    { key: { user_id: 1 }, options: { name: "user_id" } },
    { key: { expires_at: 1 }, options: { name: "ttl", expireAfterSeconds: 0 } },
  ],
  pending_registrations: [
    { key: { email: 1 }, options: { name: "email_unique", unique: true } },
    { key: { expires_at: 1 }, options: { name: "ttl", expireAfterSeconds: 0 } },
  ],
  otp_challenges: [{ key: { purge_at: 1 }, options: { name: "ttl", expireAfterSeconds: 0 } }],
  auth_attempts: [
    { key: { key: 1 }, options: { name: "key_unique", unique: true } },
    { key: { expires_at: 1 }, options: { name: "ttl", expireAfterSeconds: 0 } },
  ],
};

async function ensureCoreIndexes(db) {
  const results = await Promise.allSettled(
    Object.entries(CORE_INDEXES).flatMap(([collection, indexes]) =>
      indexes.map(({ key, options }) =>
        db.collection(collection).createIndex(key, options).catch(async (err) => {
          // Same key + uniqueness already indexed under another name (older
          // environments): that satisfies the requirement.
          if (err.code === 85 || err.codeName === "IndexOptionsConflict") {
            const existing = await db.collection(collection).indexes();
            const same = existing.find(
              (i) => JSON.stringify(i.key) === JSON.stringify(key) && !!i.unique === !!options.unique
            );
            if (same) return same.name;
          }
          throw new Error(`${collection}.${options.name}: ${err.message}`);
        })
      )
    )
  );
  const failed = results.filter((r) => r.status === "rejected");
  for (const f of failed) console.warn("[Indexes] core index failed:", f.reason.message);
  console.log(`[Indexes] Core indexes ensured (${results.length - failed.length}/${results.length})`);
  return failed.length;
}

module.exports = { CORE_INDEXES, ensureCoreIndexes };
