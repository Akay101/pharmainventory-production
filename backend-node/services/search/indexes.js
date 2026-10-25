// Index definitions for search and tenant-scoped queries.
//
// Tenant indexes are ensured at API startup (createIndex is a no-op when the
// index already exists). Global catalogue indexes are created by
// scripts/search/backfill_global_medicines.js because they depend on the
// precomputed search keys.

const GLOBAL_MEDICINE_INDEXES = [
  // Name/brand token prefix lookup, pre-sorted by popularity so the top-N
  // candidates come straight off the index without an in-memory sort.
  { key: { s_name_grams: 1, rank_score: -1 }, options: { name: "search_name_grams_rank" } },
  { key: { s_salt_grams: 1, rank_score: -1 }, options: { name: "search_salt_grams_rank" } },
  // Exact normalised-name lookups (dedupe, matching a bill line to the catalogue).
  { key: { s_name: 1 }, options: { name: "search_name_exact" } },
];

const TENANT_INDEXES = {
  inventory: [
    { key: { pharmacy_id: 1, product_name: 1 }, options: { name: "tenant_product_name" } },
    { key: { pharmacy_id: 1, product_id: 1 }, options: { name: "tenant_product_id" } },
    { key: { pharmacy_id: 1, created_at: -1 }, options: { name: "tenant_created" } },
    { key: { pharmacy_id: 1, expiry_date: 1 }, options: { name: "tenant_expiry" } },
    // Batch lookups from scans and batch search
    { key: { pharmacy_id: 1, batch_no: 1 }, options: { name: "tenant_batch" } },
    { key: { id: 1 }, options: { name: "id" } },
  ],
  products: [
    { key: { pharmacy_id: 1, name: 1 }, options: { name: "tenant_name" } },
    { key: { id: 1 }, options: { name: "id" } },
  ],
  bills: [
    { key: { pharmacy_id: 1, created_at: -1 }, options: { name: "tenant_created" } },
    { key: { pharmacy_id: 1, billing_date: -1 }, options: { name: "tenant_billing_date" } },
    { key: { pharmacy_id: 1, customer_id: 1 }, options: { name: "tenant_customer" } },
    { key: { id: 1 }, options: { name: "id" } },
  ],
  purchases: [
    { key: { pharmacy_id: 1, created_at: -1 }, options: { name: "tenant_created" } },
    { key: { pharmacy_id: 1, purchase_date: -1 }, options: { name: "tenant_purchase_date" } },
    { key: { pharmacy_id: 1, supplier_id: 1 }, options: { name: "tenant_supplier" } },
    { key: { id: 1 }, options: { name: "id" } },
  ],
  // AI credits: one wallet per pharmacy; every ledger row has a unique ref (idempotency)
  credit_wallets: [{ key: { pharmacy_id: 1 }, options: { name: "pharmacy", unique: true } }],
  credit_transactions: [
    { key: { ref: 1 }, options: { name: "ref", unique: true } },
    { key: { pharmacy_id: 1, created_at: -1 }, options: { name: "tenant_created" } },
    { key: { type: 1, created_at: -1 }, options: { name: "type_created" } },
  ],
  purchase_drafts: [
    { key: { pharmacy_id: 1, updated_at: -1 }, options: { name: "tenant_updated" } },
    { key: { id: 1 }, options: { name: "id" } },
  ],
  suppliers: [
    { key: { pharmacy_id: 1, name: 1 }, options: { name: "tenant_name" } },
    // $lookup from inventory/purchases joins on suppliers.id.
    { key: { id: 1 }, options: { name: "id" } },
  ],
  customers: [
    { key: { pharmacy_id: 1, name: 1 }, options: { name: "tenant_name" } },
    { key: { pharmacy_id: 1, mobile: 1 }, options: { name: "tenant_mobile" } },
    { key: { id: 1 }, options: { name: "id" } },
  ],
};

const ensureTenantIndexes = async (db) => {
  const results = await Promise.allSettled(
    Object.entries(TENANT_INDEXES).flatMap(([collection, indexes]) =>
      indexes.map(({ key, options }) =>
        db.collection(collection).createIndex(key, { background: true, ...options })
      )
    )
  );
  const failed = results.filter((r) => r.status === "rejected");
  for (const f of failed) console.warn("[Indexes] createIndex failed:", f.reason?.message);
  console.log(`[Indexes] Tenant indexes ensured (${results.length - failed.length}/${results.length})`);
};

module.exports = { GLOBAL_MEDICINE_INDEXES, TENANT_INDEXES, ensureTenantIndexes };
