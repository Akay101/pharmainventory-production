// Restocking for refill reminders: a customer will come back for their
// medicines, so the pharmacy needs that stock on the shelf by then.
//
// Each reminder carries reminder.restock = { status, ... }:
//   PENDING  stock still short
//   ORDERED  a purchase draft was made from it (still short until it's saved)
//   DONE     by "auto" when unexpired stock covers every medicine's restock
//            quantity (a purchase since the reminder, or enough on hand), or
//            by "manual" (an override: stock may still be short)
// Auto checks run whenever the list is read; once DONE it stays done (a later
// sale doesn't reopen it). Reopen puts it back to PENDING.
const { stockLevels, keyOf } = require("./stockLevels");

const need = (it) => Math.max(1, Number(it.reorder_units) || Number(it.quantity) || 1);

// Purchases of these medicines saved after `since`: name key -> { invoice_no, at }
async function purchasesSince(db, pharmacyId, names, since) {
  if (!names.length || !since) return new Map();
  const rows = await db
    .collection("purchases")
    .find({ pharmacy_id: pharmacyId, created_at: { $gte: since } }, { projection: { _id: 0, invoice_no: 1, created_at: 1, items: 1 } })
    .sort({ created_at: 1 })
    .toArray();
  const out = new Map();
  for (const p of rows) {
    for (const i of p.items || []) {
      const k = keyOf(i.product_name);
      if (names.includes(k) && !out.has(k)) out.set(k, { invoice_no: p.invoice_no || "", at: p.created_at });
    }
  }
  return out;
}

// Attach stock per item and the restock status; persist auto-done
async function evaluate(db, user, reminders) {
  if (!reminders.length) return [];
  const { levels } = await stockLevels(db, user);
  const now = new Date().toISOString();
  const out = [];
  for (const r of reminders) {
    const items = (r.items || []).filter((i) => i.product_name);
    const names = items.map((i) => keyOf(i.product_name));
    const bought = await purchasesSince(db, user.pharmacy_id, names, r.created_at);
    const rows = items.map((i) => {
      const lvl = levels.get(keyOf(i.product_name));
      const stock = lvl ? lvl.stock : 0;
      const needed = need(i);
      const p = bought.get(keyOf(i.product_name)) || null;
      return { ...i, needed, in_stock: stock, covered: stock >= needed, purchased: p };
    });
    let restock = { status: "PENDING", ...(r.restock || {}) };
    if (r.purchase_draft_id && restock.status === "PENDING") restock = { ...restock, status: "ORDERED" };
    const allCovered = rows.length > 0 && rows.every((x) => x.covered);
    if (restock.status !== "DONE" && allCovered) {
      const viaPurchase = rows.filter((x) => x.purchased).map((x) => x.purchased.invoice_no).filter(Boolean);
      restock = {
        ...restock,
        status: "DONE",
        done_by: "auto",
        done_at: now,
        reason: viaPurchase.length ? `Restocked (purchase ${[...new Set(viaPurchase)].join(", ")})` : "Enough stock already on hand",
      };
      await db.collection("reminders").updateOne({ id: r.id, pharmacy_id: user.pharmacy_id }, { $set: { restock, updated_at: now } });
    }
    out.push({ ...r, items: rows, restock, all_covered: allCovered });
  }
  return out;
}

module.exports = { evaluate, need };
