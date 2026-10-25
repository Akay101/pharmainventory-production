// Short book: items to reorder, usually noted from a bill line after it sold.
//   GET    /api/shortbook                 ?status=pending|ordered|received|cancelled|all&search=
//   POST   /api/shortbook                 {bill_id, line, quantity, unit?, notes?}  from a bill line
//                                          or {product_name, quantity, unit?, notes?}  by hand
//   PATCH  /api/shortbook/:id             {quantity?, unit?, status?, notes?, supplier_name?}
//   DELETE /api/shortbook/:id             also clears the bill line's mark
// One open (pending) entry per medicine: adding it again adds to its quantity.
const express = require("express");
const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");
const { auth } = require("../middleware/auth");
const { requireSubscription } = require("../middleware/subscription");
const { logActivity } = require("../utils/activityLogger");

const router = express.Router();
const db = () => mongoose.connection.db;
const col = () => db().collection("short_book");
const guard = [auth, requireSubscription()];

const STATUSES = ["pending", "ordered", "received", "cancelled"];
const UNITS = ["units", "packs"];
const escapeRegex = (s) => String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const nowIso = () => new Date().toISOString();
const keyOf = (name) => String(name || "").trim().toLowerCase().replace(/\s+/g, " ");

function parseQty(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0 || n > 100000) return null;
  return Math.round(n * 100) / 100;
}

// Stock on hand and the supplier it was last bought from, per medicine
async function stockInfo(pharmacyId, names) {
  if (!names.length) return new Map();
  const rows = await db()
    .collection("inventory")
    .aggregate([
      { $match: { pharmacy_id: pharmacyId, product_name: { $in: names } } },
      { $sort: { created_at: -1 } },
      {
        $group: {
          _id: "$product_name",
          on_hand: { $sum: { $max: [0, { $ifNull: ["$available_quantity", 0] }] } },
          supplier_id: { $first: "$supplier_id" },
          units_per_pack: { $first: "$units_per_pack" },
          pack_type: { $first: "$pack_type" },
        },
      },
    ])
    .toArray();
  const supIds = [...new Set(rows.map((r) => r.supplier_id).filter(Boolean))];
  const sups = supIds.length ? await db().collection("suppliers").find({ id: { $in: supIds } }, { projection: { _id: 0, id: 1, name: 1, phone: 1 } }).toArray() : [];
  const supBy = new Map(sups.map((s) => [s.id, s]));
  return new Map(rows.map((r) => [r._id, { on_hand: r.on_hand, units_per_pack: r.units_per_pack || null, pack_type: r.pack_type || null, supplier: supBy.get(r.supplier_id) || null }]));
}

async function markBillLine(pharmacyId, src, mark) {
  if (!src?.bill_id) return;
  const bill = await db().collection("bills").findOne({ id: src.bill_id, pharmacy_id: pharmacyId }, { projection: { items: 1 } });
  if (!bill?.items) return;
  const items = bill.items.map((it, i) => {
    const same = i === src.line && keyOf(it.product_name) === keyOf(src.product_name);
    if (!same) return it;
    const next = { ...it };
    if (mark) next.short_book = mark;
    else delete next.short_book;
    return next;
  });
  await db().collection("bills").updateOne({ id: src.bill_id, pharmacy_id: pharmacyId }, { $set: { items } });
}

router.get("/", ...guard, async (req, res, next) => {
  try {
    const pharmacyId = req.user.pharmacy_id;
    const { status = "pending", search } = req.query;
    const q = { pharmacy_id: pharmacyId };
    if (STATUSES.includes(status)) q.status = status;
    if (search) {
      const rx = { $regex: escapeRegex(search), $options: "i" };
      q.$or = [{ product_name: rx }, { notes: rx }, { supplier_name: rx }, { "sources.bill_no": rx }];
    }
    const [entries, counts] = await Promise.all([
      col().find(q, { projection: { _id: 0 } }).sort({ updated_at: -1 }).limit(1000).toArray(),
      col().aggregate([{ $match: { pharmacy_id: pharmacyId } }, { $group: { _id: "$status", n: { $sum: 1 } } }]).toArray(),
    ]);
    const info = await stockInfo(pharmacyId, [...new Set(entries.map((e) => e.product_name))]);
    res.json({
      entries: entries.map((e) => {
        const s = info.get(e.product_name) || {};
        return { ...e, on_hand: s.on_hand ?? 0, last_supplier: e.supplier_name ? { name: e.supplier_name } : s.supplier || null, units_per_pack: e.units_per_pack || s.units_per_pack || null };
      }),
      counts: Object.fromEntries(counts.map((c) => [c._id, c.n])),
    });
  } catch (err) {
    next(err);
  }
});

router.post("/", ...guard, async (req, res, next) => {
  try {
    const pharmacyId = req.user.pharmacy_id;
    const body = req.body || {};
    const quantity = parseQty(body.quantity);
    if (!quantity) return res.status(400).json({ detail: "Enter a quantity to reorder" });
    const unit = UNITS.includes(body.unit) ? body.unit : "units";
    const notes = String(body.notes || "").trim().slice(0, 300);

    let line = null;
    let source = null;
    if (body.bill_id) {
      const bill = await db().collection("bills").findOne({ id: body.bill_id, pharmacy_id: pharmacyId }, { projection: { _id: 0, id: 1, bill_no: 1, items: 1, customer_name: 1 } });
      if (!bill) return res.status(404).json({ detail: "Bill not found" });
      const idx = Number(body.line);
      line = Number.isInteger(idx) ? bill.items?.[idx] : null;
      if (!line) return res.status(400).json({ detail: "That bill line was not found" });
      if (line.short_book?.entry_id) return res.status(409).json({ detail: `${line.product_name} from this bill is already in the short book` });
      source = { bill_id: bill.id, bill_no: bill.bill_no, line: idx, product_name: line.product_name, sold_units: line.quantity, customer_name: bill.customer_name || null, quantity, unit, at: nowIso() };
    }
    const productName = String(line?.product_name || body.product_name || "").trim().slice(0, 200);
    if (!productName) return res.status(400).json({ detail: "Choose a medicine" });

    // Same medicine still to order: add to it
    const open = await col().findOne({ pharmacy_id: pharmacyId, status: "pending", product_key: keyOf(productName) });
    let entry;
    let merged = false;
    if (open) {
      const sameUnit = open.unit === unit;
      const upp = Number(open.units_per_pack || line?.units_per_pack) || 0;
      const add = sameUnit ? quantity : unit === "packs" && upp ? quantity * upp : open.unit === "packs" && upp ? Math.ceil(quantity / upp) : null;
      if (add === null) return res.status(409).json({ detail: `${productName} is already in the short book in ${open.unit}. Use ${open.unit} to add to it.` });
      await col().updateOne(
        { id: open.id },
        { $inc: { quantity: Math.round(add * 100) / 100 }, $set: { updated_at: nowIso(), ...(notes ? { notes: [open.notes, notes].filter(Boolean).join(" · ").slice(0, 300) } : {}) }, ...(source ? { $push: { sources: source } } : {}) }
      );
      entry = await col().findOne({ id: open.id }, { projection: { _id: 0 } });
      merged = true;
    } else {
      entry = {
        id: uuidv4(),
        pharmacy_id: pharmacyId,
        product_name: productName,
        product_key: keyOf(productName),
        inventory_id: line?.inventory_id || null,
        batch_no: line?.batch_no || null,
        units_per_pack: Number(line?.units_per_pack) || null,
        quantity,
        unit,
        notes,
        status: "pending",
        supplier_name: null,
        sources: source ? [source] : [],
        created_by: { id: req.user.id, name: req.user.name || "" },
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      try {
        await col().insertOne({ ...entry });
      } catch (err) {
        if (err.code === 11000) return res.status(409).json({ detail: `${productName} was just added. Refresh and try again.` });
        throw err;
      }
      delete entry.pharmacy_id;
    }
    if (source) await markBillLine(pharmacyId, source, { entry_id: entry.id, quantity, unit, added_at: source.at });
    logActivity(db(), pharmacyId, req.user.id, req.user.name, "CREATE", "SHORT_BOOK", entry.id, `Short book: ${productName} +${quantity} ${unit}${source ? ` (bill ${source.bill_no})` : ""}`, "/short-book").catch(() => {});
    res.status(merged ? 200 : 201).json({ entry, merged });
  } catch (err) {
    next(err);
  }
});

router.patch("/:id", ...guard, async (req, res, next) => {
  try {
    const pharmacyId = req.user.pharmacy_id;
    const body = req.body || {};
    const $set = { updated_at: nowIso() };
    if (body.quantity !== undefined) {
      const q = parseQty(body.quantity);
      if (!q) return res.status(400).json({ detail: "Enter a quantity to reorder" });
      $set.quantity = q;
    }
    if (body.unit !== undefined) {
      if (!UNITS.includes(body.unit)) return res.status(400).json({ detail: "Invalid unit" });
      $set.unit = body.unit;
    }
    if (body.notes !== undefined) $set.notes = String(body.notes || "").trim().slice(0, 300);
    if (body.supplier_name !== undefined) $set.supplier_name = String(body.supplier_name || "").trim().slice(0, 120) || null;
    if (body.status !== undefined) {
      if (!STATUSES.includes(body.status)) return res.status(400).json({ detail: "Invalid status" });
      $set.status = body.status;
      $set[`${body.status}_at`] = nowIso();
      if (body.status === "pending") {
        // Reopening: only one open entry per medicine
        const cur = await col().findOne({ id: req.params.id, pharmacy_id: pharmacyId });
        if (cur && cur.status !== "pending" && (await col().findOne({ pharmacy_id: pharmacyId, status: "pending", product_key: cur.product_key, id: { $ne: cur.id } }))) {
          return res.status(409).json({ detail: `${cur.product_name} is already in the list to order` });
        }
      }
    }
    const updated = await col().findOneAndUpdate({ id: req.params.id, pharmacy_id: pharmacyId }, { $set }, { returnDocument: "after", projection: { _id: 0, pharmacy_id: 0 } });
    if (!updated) return res.status(404).json({ detail: "Entry not found" });
    res.json({ entry: updated });
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", ...guard, async (req, res, next) => {
  try {
    const pharmacyId = req.user.pharmacy_id;
    const entry = await col().findOne({ id: req.params.id, pharmacy_id: pharmacyId });
    if (!entry) return res.status(404).json({ detail: "Entry not found" });
    await col().deleteOne({ id: entry.id });
    for (const s of entry.sources || []) await markBillLine(pharmacyId, s, null);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

async function ensureIndexes(database) {
  await database.collection("short_book").createIndex({ id: 1 }, { unique: true });
  await database.collection("short_book").createIndex({ pharmacy_id: 1, status: 1, updated_at: -1 });
  // One open entry per medicine
  await database
    .collection("short_book")
    .createIndex({ pharmacy_id: 1, product_key: 1 }, { unique: true, partialFilterExpression: { status: "pending" }, name: "one_pending_per_product" });
}

module.exports = router;
module.exports.ensureIndexes = ensureIndexes;
