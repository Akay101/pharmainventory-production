// Stock movements shared by purchases and bills.
//
// Inventory batches carry two counters: `quantity` (units ever received into
// the batch) and `available_quantity` (units still on the shelf). Purchases
// move both; bills only consume `available_quantity`. Billing more than is on
// the shelf is allowed ("negative billing"), so a bill line records how many
// units it actually took from stock (`stock_deducted`) and gives back exactly
// that many when it is edited or deleted.
const mongoose = require("mongoose");

const escapeRegex = (s) => String(s).replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");

const lineUnits = (item) => Number(item.total_units ?? item.quantity) || 0;

function inventoryIdQuery(pharmacyId, inventoryId) {
  return {
    pharmacy_id: pharmacyId,
    $or: [
      { id: inventoryId },
      ...(mongoose.Types.ObjectId.isValid(inventoryId) && String(inventoryId).length === 24
        ? [{ _id: new mongoose.Types.ObjectId(inventoryId) }]
        : []),
    ],
  };
}

// The batch a purchase line went into. Purchases create batches keyed by
// product_id + batch_no; older records only match by name.
async function findBatch(db, pharmacyId, { product_id, product_name, batch_no }, session) {
  const col = db.collection("inventory");
  if (product_id) {
    const byId = await col.findOne({ pharmacy_id: pharmacyId, product_id, batch_no }, { session });
    if (byId) return byId;
  }
  if (!product_name) return null;
  return col.findOne(
    {
      pharmacy_id: pharmacyId,
      batch_no,
      product_name: { $regex: new RegExp(`^${escapeRegex(product_name.trim())}$`, "i") },
    },
    { session }
  );
}

// Per batch: what this purchase put in, what is still on the shelf, and how
// much of it has already left (sold, returned or adjusted).
async function purchaseStockImpact(db, pharmacyId, items, session) {
  const byBatch = new Map();
  const missing = [];
  for (const item of items || []) {
    const inv = await findBatch(db, pharmacyId, item, session);
    if (!inv) {
      missing.push({ product_name: item.product_name, batch_no: item.batch_no, purchased: lineUnits(item) });
      continue;
    }
    const row = byBatch.get(inv.id) || {
      inventory: inv,
      inventory_id: inv.id,
      product_name: inv.product_name || item.product_name,
      batch_no: inv.batch_no,
      purchased: 0,
      on_hand: Math.max(0, Number(inv.available_quantity) || 0),
    };
    row.purchased += lineUnits(item);
    byBatch.set(inv.id, row);
  }
  const batches = [...byBatch.values()].map((r) => ({
    ...r,
    consumed: Math.max(0, r.purchased - r.on_hand),
    removable: Math.min(r.purchased, r.on_hand),
  }));
  return { batches, missing, consumed: batches.some((b) => b.consumed > 0) };
}

const publicImpact = ({ batches, missing, consumed }) => ({
  consumed,
  batches: batches.map(({ inventory, ...b }) => b),
  missing,
});

// Takes up to `qty` units from a batch for a bill line. Returns how many
// units actually came off the shelf.
async function takeFromStock(db, pharmacyId, inventoryId, qty) {
  if (!inventoryId || String(inventoryId).startsWith("negative-") || qty <= 0) return 0;
  const before = await db
    .collection("inventory")
    .findOneAndUpdate(
      inventoryIdQuery(pharmacyId, inventoryId),
      [{ $set: { available_quantity: { $max: [0, { $subtract: [{ $ifNull: ["$available_quantity", 0] }, qty] }] } } }],
      { returnDocument: "before" }
    );
  if (!before) return 0;
  return Math.min(qty, Math.max(0, Number(before.available_quantity) || 0));
}

// Gives a bill line's units back to its batch. Lines saved before
// `stock_deducted` existed return their full quantity, as they always did.
async function returnToStock(db, pharmacyId, item) {
  if (!item.inventory_id || String(item.inventory_id).startsWith("negative-")) return 0;
  const units = item.stock_deducted !== undefined ? Number(item.stock_deducted) || 0 : Number(item.quantity) || 0;
  if (units <= 0) return 0;
  await db
    .collection("inventory")
    .updateOne(inventoryIdQuery(pharmacyId, item.inventory_id), { $inc: { available_quantity: units } });
  return units;
}

module.exports = {
  escapeRegex,
  lineUnits,
  inventoryIdQuery,
  findBatch,
  purchaseStockImpact,
  publicImpact,
  takeFromStock,
  returnToStock,
};
