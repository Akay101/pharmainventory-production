// Supplier return notes, shared by Returns (non-expired stock sent back) and
// Expiry (expired stock sent back for credit).
//
// Stock model (per inventory batch):
//   available_quantity  units on the shelf that can be billed
//   expired_quantity    expired units taken off the shelf into the expiry list
//   returned_quantity   units handed to suppliers through return notes
//
// A note takes its units out of stock when it is created (the goods are set
// aside for the supplier), so a batch can be returned partly and the rest
// keeps selling. Deleting a note puts exactly those units back where they came
// from. Notes created before this model (no `stock_v2`) still deduct at
// settlement, as they always did, but only their own units.
//
// Each note line is linked to the purchase lines it came from, so purchase
// records show what was returned. Supplier credit is settled either in money
// (cash, UPI, ...) or by adjusting it against the supplier's unpaid purchases.
const express = require("express");
const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");
const { auth } = require("../../middleware/auth");
const { requireSubscription } = require("../../middleware/subscription");
const { logActivity } = require("../../utils/activityLogger");
const { generateReturnNotePDF } = require("../returnNotePdf");

const KINDS = {
  return: {
    collection: "return_bundles",
    prefix: "RET",
    statusField: "return_status",
    bundleIdField: "return_bundle_id",
    bundleNoField: "return_bundle_no",
    moved: "Moved to Returns",
    done: "Returned",
    returnType: "General Return",
    noteLabel: "Purchase Return Note",
    pendingItemStatus: "Return Pending",
    module: "RETURNS",
    link: "/returns",
  },
  expiry: {
    collection: "expiry_bundles",
    prefix: "EXP",
    statusField: "expiry_status",
    bundleIdField: "expiry_bundle_id",
    bundleNoField: "expiry_bundle_no",
    moved: "Moved to Expiry",
    done: "Expired & Returned",
    returnType: "Expiry",
    noteLabel: "Expiry Return Note",
    pendingItemStatus: "Expiry Return Pending",
    module: "EXPIRY",
    link: "/expiry",
  },
};

const DRAFT = "Draft";
const PICKED = "Picked - Payment Pending";
const PARTIAL = "Partial Paid";
const SETTLED = "Payment Done (Returned)";
const STATUSES = [DRAFT, PICKED, PARTIAL, SETTLED];
const DUES_MODE = "Adjust against dues";

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const nowIso = () => new Date().toISOString();
const todayStr = () => new Date().toISOString().split("T")[0];
const escapeRegex = (str) => String(str || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

class HttpError extends Error {
  constructor(status, detail) {
    super(detail);
    this.status = status;
  }
}

// A real date that has passed. "-" and "" sort before digits, so a bare
// string comparison would call them expired.
const isExpiredDate = (d) => typeof d === "string" && /^\d{4}-\d{2}/.test(d) && d < todayStr();
const expiredDateMatch = () => ({ $gte: "1900-01-01", $lt: todayStr() });

const unitsOf = (b) => Math.max(0, Number(b.available_quantity) || 0);
const expiredUnitsOf = (b) => Math.max(0, Number(b.expired_quantity) || 0);

// One status a person can read, from the batch's fields.
function stockStatus(b) {
  const expired = isExpiredDate(b.expiry_date);
  if (b.expiry_status === "Expired & Returned" || b.expiry_status === "Picked") {
    return unitsOf(b) + expiredUnitsOf(b) > 0 ? "Expired · Partly Returned" : "Expired & Returned";
  }
  if (b.expiry_status === "Moved to Expiry") {
    return b.expiry_bundle_id ? "Expired · In Return Note" : "Expired · In Expiry List";
  }
  if (b.return_status === "Returned" || b.return_status === "Picked") {
    return unitsOf(b) > 0 ? "Partly Returned" : "Returned";
  }
  if (b.return_status === "Moved to Returns") {
    return b.return_bundle_id ? "In Return Note" : "Marked for Return";
  }
  if (expired) return "Expired";
  return "In Stock";
}

// Units a new note may take from a batch.
const poolOf = (kind, b) => unitsOf(b) + (kind === "expiry" ? expiredUnitsOf(b) : 0);

async function nextBundleNo(db, cfg, pharmacyId) {
  const datePrefix = new Date().toISOString().slice(0, 7).replace("-", "");
  const rows = await db
    .collection(cfg.collection)
    .find({ pharmacy_id: pharmacyId }, { projection: { _id: 0, bundle_no: 1 } })
    .toArray();
  const max = rows.reduce((m, r) => {
    const n = parseInt(String(r.bundle_no || "").split("-").pop(), 10);
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return `${cfg.prefix}-${datePrefix}-${String(max + 1).padStart(4, "0")}`;
}

// ── Purchase links ──────────────────────────────────────────────────────────

const sameLine = (pi, item) =>
  pi.batch_no === item.batch_no &&
  ((item.product_id && pi.product_id === item.product_id) ||
    String(pi.product_name || "").trim().toLowerCase() === String(item.product_name || "").trim().toLowerCase());

const purchaseLineUnits = (pi) => {
  if (pi.total_units !== undefined && pi.total_units !== null) return Number(pi.total_units) || 0;
  const per = Number(pi.units_per_pack) || 1;
  return ((Number(pi.pack_quantity ?? pi.quantity) || 0) + (Number(pi.scheme) || 0)) * per;
};

// Label shown on a purchase line from the return notes that touch it.
function purchaseItemStatus(pi) {
  const refs = pi.return_refs || [];
  if (!refs.length) return null;
  const done = refs.filter((r) => r.state === "returned");
  const latest = (done.length ? done : refs)[(done.length ? done : refs).length - 1];
  const cfg = KINDS[latest.kind] || KINDS.return;
  return done.length ? cfg.done : cfg.pendingItemStatus;
}

function applyItemStatus(pi) {
  const status = purchaseItemStatus(pi);
  if (status) pi.status = status;
  else if (pi.status && /Return/.test(pi.status)) delete pi.status;
  if (!(pi.return_refs || []).length) {
    delete pi.return_refs;
    delete pi.returned_units;
    delete pi.return_bundle_no;
  }
}

function recomputePurchaseTotals(purchase) {
  let units = 0;
  let value = 0;
  for (const pi of purchase.items || []) {
    for (const r of pi.return_refs || []) {
      units += Number(r.units) || 0;
      value += Number(r.value) || 0;
    }
  }
  return { returned_units: units, returned_value: round2(value), has_returns: units > 0 };
}

// Spreads a note line over the purchase lines of that batch (newest purchase
// first) and records the link on both sides.
async function linkPurchases(db, session, pharmacyId, kind, bundle, item) {
  const purchases = await db
    .collection("purchases")
    .find({ pharmacy_id: pharmacyId, "items.batch_no": item.batch_no }, { session })
    .sort({ purchase_date: -1, created_at: -1 })
    .toArray();
  let left = item.quantity_units;
  const refs = [];
  for (const p of purchases) {
    if (left <= 0) break;
    let touched = false;
    for (const pi of p.items || []) {
      if (left <= 0) break;
      if (!sameLine(pi, item)) continue;
      const already = (pi.return_refs || []).reduce((s, r) => s + (Number(r.units) || 0), 0);
      const room = Math.max(0, purchaseLineUnits(pi) - already);
      const take = Math.min(room, left);
      if (take <= 0) continue;
      pi.return_refs = [
        ...(pi.return_refs || []),
        {
          bundle_id: bundle.id,
          bundle_no: bundle.bundle_no,
          kind,
          units: take,
          value: round2(take * item.purchase_price),
          state: "pending",
          at: nowIso(),
        },
      ];
      pi.returned_units = already + take;
      pi.return_bundle_no = bundle.bundle_no;
      applyItemStatus(pi);
      left -= take;
      touched = true;
      refs.push({ purchase_id: p.id, invoice_no: p.invoice_no || null, units: take });
    }
    if (touched) {
      await db
        .collection("purchases")
        .updateOne({ id: p.id }, { $set: { items: p.items, ...recomputePurchaseTotals(p), updated_at: nowIso() } }, { session });
    }
  }
  return refs;
}

// Changes or removes this note's links on its purchases.
async function updatePurchaseLinks(db, session, pharmacyId, bundle, change) {
  const ids = [...new Set((bundle.items || []).flatMap((it) => (it.purchase_refs || []).map((r) => r.purchase_id)))];
  if (!ids.length) return;
  const purchases = await db.collection("purchases").find({ pharmacy_id: pharmacyId, id: { $in: ids } }, { session }).toArray();
  for (const p of purchases) {
    for (const pi of p.items || []) {
      const refs = pi.return_refs || [];
      if (!refs.some((r) => r.bundle_id === bundle.id)) continue;
      pi.return_refs =
        change === "remove"
          ? refs.filter((r) => r.bundle_id !== bundle.id)
          : refs.map((r) => (r.bundle_id === bundle.id ? { ...r, state: change } : r));
      pi.returned_units = pi.return_refs.reduce((s, r) => s + (Number(r.units) || 0), 0);
      if (change === "returned") pi.returned_at = nowIso();
      applyItemStatus(pi);
    }
    await db
      .collection("purchases")
      .updateOne({ id: p.id }, { $set: { items: p.items, ...recomputePurchaseTotals(p), updated_at: nowIso() } }, { session });
  }
}

// Notes from before purchase links: mark matching purchase lines the old way.
async function legacyMarkPurchases(db, session, pharmacyId, cfg, bundle) {
  for (const item of bundle.items || []) {
    await db.collection("purchases").updateMany(
      { pharmacy_id: pharmacyId, "items.batch_no": item.batch_no, "items.product_name": item.product_name },
      {
        $set: {
          "items.$[elem].status": cfg.done,
          "items.$[elem].returned_at": nowIso(),
          "items.$[elem].return_bundle_no": bundle.bundle_no,
        },
      },
      { arrayFilters: [{ "elem.batch_no": item.batch_no, "elem.product_name": item.product_name }], session }
    );
  }
}

// ── Batch status ────────────────────────────────────────────────────────────

// Sets the batch's return/expiry status for a note, and the overall `status`
// that hides a batch from billing only once nothing of it is left.
async function setBatchState(db, session, pharmacyId, cfg, inventoryId, state, bundle) {
  const batch = await db.collection("inventory").findOne({ id: inventoryId, pharmacy_id: pharmacyId }, { session });
  if (!batch) return;
  const $set = { [cfg.statusField]: state, updated_at: nowIso() };
  const $unset = {};
  if (bundle) {
    $set[cfg.bundleIdField] = bundle.id;
    $set[cfg.bundleNoField] = bundle.bundle_no;
  }
  const empty = unitsOf(batch) + expiredUnitsOf(batch) <= 0;
  if ((state === cfg.done || state === "Picked") && empty) $set.status = cfg.done;
  else if (batch.status === "Returned" || batch.status === "Expired & Returned") $unset.status = "";
  await db
    .collection("inventory")
    .updateOne({ id: inventoryId, pharmacy_id: pharmacyId }, Object.keys($unset).length ? { $set, $unset } : { $set }, { session });
}

// ── Router ──────────────────────────────────────────────────────────────────

function createNotesRouter(kind) {
  const cfg = KINDS[kind];
  const router = express.Router();
  const guard = [auth, requireSubscription()];
  const col = () => mongoose.connection.db.collection(cfg.collection);

  const log = (req, type, entityId, description) =>
    logActivity(mongoose.connection.db, req.user.pharmacy_id, req.user.id, req.user.name, type, cfg.module, entityId, description, cfg.link);

  // Runs `fn` in a transaction; HttpError becomes its status + detail.
  const tx = (fn) => async (req, res, next) => {
    const session = await mongoose.startSession();
    try {
      let out;
      await session.withTransaction(async () => {
        out = await fn(req, session);
      });
      res.status(out?.status || 200).json(out?.body ?? out);
      if (out?.after) out.after().catch(() => {});
    } catch (err) {
      if (err instanceof HttpError) res.status(err.status).json({ detail: err.message });
      else next(err);
    } finally {
      session.endSession();
    }
  };

  const batchProjection = {
    _id: 0,
    id: 1,
    product_id: 1,
    product_name: 1,
    batch_no: 1,
    expiry_date: 1,
    available_quantity: 1,
    expired_quantity: 1,
    returned_quantity: 1,
    quantity: 1,
    pack_type: 1,
    units_per_pack: 1,
    purchase_price: 1,
    mrp: 1,
    manufacturer: 1,
    salt_composition: 1,
    supplier_id: 1,
    supplier_name: { $ifNull: ["$supplier_name", "$supplier_info.name"] },
    return_status: 1,
    return_bundle_id: 1,
    return_bundle_no: 1,
    expiry_status: 1,
    expiry_bundle_id: 1,
    expiry_bundle_no: 1,
    status: 1,
    created_at: 1,
  };

  const withSupplier = [
    { $lookup: { from: "suppliers", localField: "supplier_id", foreignField: "id", as: "supplier_info" } },
    { $unwind: { path: "$supplier_info", preserveNullAndEmptyArrays: true } },
  ];

  const decorate = (b) => ({ ...b, stock_status: stockStatus(b), returnable_units: poolOf(kind, b) });

  // GET / - notes, stats and batches waiting for a note
  router.get("/", ...guard, async (req, res, next) => {
    try {
      const pharmacyId = req.user.pharmacy_id;
      const { search, status, supplier_id, start_date, end_date, page = 1, limit = 20 } = req.query;
      const sortBy = ["created_at", "return_date", "total_amount", "bundle_no"].includes(req.query.sort_by) ? req.query.sort_by : "created_at";
      const query = { pharmacy_id: pharmacyId };
      if (status && status !== "all") query.status = status;
      if (supplier_id && supplier_id !== "all") query.supplier_id = supplier_id;
      if (search) {
        const rx = { $regex: escapeRegex(search), $options: "i" };
        query.$or = [{ bundle_no: rx }, { supplier_name: rx }, { "items.product_name": rx }, { "items.batch_no": rx }];
      }
      if (start_date || end_date) {
        query.created_at = {};
        if (start_date) query.created_at.$gte = start_date;
        if (end_date) query.created_at.$lte = end_date + "T23:59:59.999Z";
      }
      const parsedPage = Math.max(1, parseInt(page) || 1);
      const parsedLimit = Math.min(100, Math.max(1, parseInt(limit) || 20));

      const total = await col().countDocuments(query);
      const bundles = await col()
        .find(query, { projection: { _id: 0 } })
        .sort({ [sortBy]: req.query.sort_order === "asc" ? 1 : -1 })
        .skip((parsedPage - 1) * parsedLimit)
        .limit(parsedLimit)
        .toArray();

      const all = await col()
        .find({ pharmacy_id: pharmacyId }, { projection: { _id: 0, status: 1, total_amount: 1, amount_paid: 1, items: 1 } })
        .toArray();
      const stats = {
        total_bundles: all.length,
        total_value: 0,
        pending_payments: 0,
        completed_returns: 0,
        total_items: 0,
        draft_count: 0,
        awaiting_credit: 0,
      };
      for (const b of all) {
        const remaining = Math.max(0, (b.total_amount || 0) - (b.amount_paid || 0));
        stats.total_value += b.total_amount || 0;
        stats.total_items += (b.items || []).length;
        if (b.status === SETTLED) stats.completed_returns += b.total_amount || 0;
        else stats.pending_payments += remaining;
        if (b.status === DRAFT) stats.draft_count += 1;
        if (b.status === PICKED || b.status === PARTIAL) stats.awaiting_credit += remaining;
      }
      for (const k of ["total_value", "pending_payments", "completed_returns", "awaiting_credit"]) stats[k] = round2(stats[k]);

      const unbundled = await mongoose.connection.db
        .collection("inventory")
        .aggregate([
          {
            $match: {
              pharmacy_id: pharmacyId,
              [cfg.statusField]: cfg.moved,
              $or: [{ [cfg.bundleIdField]: null }, { [cfg.bundleIdField]: "" }, { [cfg.bundleIdField]: { $exists: false } }],
            },
          },
          ...withSupplier,
          { $project: { ...batchProjection, supplier_name: { $ifNull: ["$supplier_name", "$supplier_info.name", "Unknown Supplier"] } } },
        ])
        .toArray();
      stats.unbundled_count = unbundled.length;

      res.json({
        bundles,
        unbundled_batches: unbundled.map(decorate),
        stats,
        pagination: { page: parsedPage, limit: parsedLimit, total, total_pages: Math.ceil(total / parsedLimit) || 1 },
      });
    } catch (error) {
      next(error);
    }
  });

  // GET /batches - inventory batches this section deals with
  //   status_filter: all | unmoved | moved | returned
  //   returnable=1:  only batches with units a new note can take
  router.get("/batches", ...guard, async (req, res, next) => {
    try {
      const { search, supplier_id, status_filter, returnable } = req.query;
      const and = [];
      if (kind === "expiry") {
        and.push({ $or: [{ expiry_date: expiredDateMatch() }, { expiry_status: { $in: [cfg.moved, "Picked", cfg.done] } }] });
      } else {
        and.push({
          $or: [
            { expiry_date: { $gte: todayStr() } },
            { expiry_date: { $in: [null, "", "-"] } },
            { expiry_date: { $exists: false } },
            { return_status: { $in: [cfg.moved, "Picked", cfg.done] } },
          ],
        });
      }
      if (supplier_id && supplier_id !== "all") and.push({ supplier_id });
      if (search) {
        const rx = { $regex: escapeRegex(search), $options: "i" };
        and.push({ $or: [{ product_name: rx }, { batch_no: rx }, { salt_composition: rx }, { manufacturer: rx }] });
      }
      const pool =
        kind === "expiry"
          ? { $or: [{ available_quantity: { $gt: 0 } }, { expired_quantity: { $gt: 0 } }] }
          : { available_quantity: { $gt: 0 } };
      if (status_filter === "unmoved") {
        and.push({ [cfg.statusField]: { $in: [null, "", "Not Moved"] } }, pool);
      } else if (status_filter === "moved") {
        and.push({ [cfg.statusField]: { $in: [cfg.moved] } });
      } else if (status_filter === "returned") {
        and.push({ [cfg.statusField]: { $in: ["Picked", cfg.done] } });
      }
      if (returnable === "1" || returnable === "true") {
        and.push(pool);
        if (kind === "return") and.push({ expiry_date: { $not: expiredDateMatch() } });
      }

      const batches = await mongoose.connection.db
        .collection("inventory")
        .aggregate([
          { $match: { pharmacy_id: req.user.pharmacy_id, $and: and } },
          ...withSupplier,
          { $project: batchProjection },
          { $sort: kind === "expiry" ? { expiry_date: 1 } : { product_name: 1, created_at: -1 } },
          { $limit: 1000 },
        ])
        .toArray();
      res.json({ batches: batches.map(decorate), count: batches.length });
    } catch (error) {
      next(error);
    }
  });

  // POST /move-batch - expiry: take expired units off the shelf into the
  // expiry list. returns: flag a batch to return later (stock unchanged).
  // Accepts one batch (inventory_id or batch_no + product_name) or inventory_ids[].
  router.post(
    "/move-batch",
    ...guard,
    tx(async (req, session) => {
      const db = mongoose.connection.db;
      const pharmacyId = req.user.pharmacy_id;
      const { inventory_id, inventory_ids, batch_no, product_name } = req.body || {};
      let filter;
      if (Array.isArray(inventory_ids) && inventory_ids.length) filter = { id: { $in: inventory_ids.slice(0, 500) } };
      else if (inventory_id) filter = { id: inventory_id };
      else if (batch_no && product_name) filter = { batch_no, product_name };
      else throw new HttpError(400, "inventory_id or batch_no + product_name is required");

      const batches = await db.collection("inventory").find({ pharmacy_id: pharmacyId, ...filter }, { session }).toArray();
      if (!batches.length) throw new HttpError(404, "Batch not found in inventory");

      const moved = [];
      const skipped = [];
      for (const b of batches) {
        const state = b[cfg.statusField];
        if (state && state !== "Not Moved") {
          skipped.push({ id: b.id, batch_no: b.batch_no, reason: `Already ${state}` });
          continue;
        }
        if (kind === "expiry" && !isExpiredDate(b.expiry_date)) {
          skipped.push({ id: b.id, batch_no: b.batch_no, reason: "Not expired yet" });
          continue;
        }
        if (kind === "return" && isExpiredDate(b.expiry_date)) {
          skipped.push({ id: b.id, batch_no: b.batch_no, reason: "Expired — use Expiry" });
          continue;
        }
        const units = unitsOf(b);
        if (units <= 0 && (kind === "return" || expiredUnitsOf(b) <= 0)) {
          skipped.push({ id: b.id, batch_no: b.batch_no, reason: "No stock left" });
          continue;
        }
        const $set = { [cfg.statusField]: cfg.moved, updated_at: nowIso() };
        const update = { $set };
        if (kind === "expiry") {
          $set.available_quantity = 0;
          update.$inc = { expired_quantity: units };
        }
        await db.collection("inventory").updateOne({ id: b.id, pharmacy_id: pharmacyId }, update, { session });
        moved.push({ id: b.id, batch_no: b.batch_no, units });
      }
      if (!moved.length && batches.length === 1) throw new HttpError(400, skipped[0].reason);

      return {
        body: {
          message: kind === "expiry" ? `${moved.length} batch(es) moved to the expiry list` : `${moved.length} batch(es) marked for return`,
          batch_id: moved[0]?.id,
          moved,
          skipped,
        },
        after: () =>
          moved.length
            ? log(req, "UPDATE", moved[0].id, `${kind === "expiry" ? "Moved to expiry list" : "Marked for return"}: ${moved.map((m) => m.batch_no).join(", ")}`)
            : Promise.resolve(),
      };
    })
  );

  // POST /restore-batch - undo move-batch for batches not yet in a note
  router.post(
    "/restore-batch",
    ...guard,
    tx(async (req, session) => {
      const db = mongoose.connection.db;
      const pharmacyId = req.user.pharmacy_id;
      const { inventory_id } = req.body || {};
      if (!inventory_id) throw new HttpError(400, "inventory_id is required");
      const b = await db.collection("inventory").findOne({ id: inventory_id, pharmacy_id: pharmacyId }, { session });
      if (!b) throw new HttpError(404, "Batch not found in inventory");
      if (b[cfg.statusField] !== cfg.moved) throw new HttpError(400, `This batch is not ${kind === "expiry" ? "in the expiry list" : "marked for return"}`);
      if (b[cfg.bundleIdField]) throw new HttpError(400, `This batch is in ${b[cfg.bundleNoField] || "a return note"}. Delete the note first.`);
      const update = { $set: { [cfg.statusField]: "Not Moved", updated_at: nowIso() } };
      if (kind === "expiry") {
        update.$inc = { available_quantity: expiredUnitsOf(b) };
        update.$set.expired_quantity = 0;
      }
      await db.collection("inventory").updateOne({ id: b.id, pharmacy_id: pharmacyId }, update, { session });
      return { message: "Batch restored to stock", batch_id: b.id };
    })
  );

  // GET /:id
  router.get("/:id", ...guard, async (req, res, next) => {
    try {
      const bundle = await col().findOne({ id: req.params.id, pharmacy_id: req.user.pharmacy_id }, { projection: { _id: 0 } });
      if (!bundle) return res.status(404).json({ detail: `${cfg.noteLabel} not found` });
      res.json(bundle);
    } catch (error) {
      next(error);
    }
  });

  // GET /:id/pdf - printable note (same frame as purchase invoices and bills)
  router.get("/:id/pdf", ...guard, async (req, res, next) => {
    try {
      const db = mongoose.connection.db;
      const bundle = await col().findOne({ id: req.params.id, pharmacy_id: req.user.pharmacy_id }, { projection: { _id: 0 } });
      if (!bundle) return res.status(404).json({ detail: `${cfg.noteLabel} not found` });
      const [pharmacy, supplier] = await Promise.all([
        db.collection("pharmacies").findOne({ id: req.user.pharmacy_id }, { projection: { _id: 0 } }),
        bundle.supplier_id ? db.collection("suppliers").findOne({ id: bundle.supplier_id, pharmacy_id: req.user.pharmacy_id }, { projection: { _id: 0 } }) : null,
      ]);
      const pdf = await generateReturnNotePDF(bundle, pharmacy || {}, { kind, supplier });
      res.set("Content-Type", "application/pdf");
      res.set("Content-Disposition", `inline; filename="${String(bundle.bundle_no || "note").replace(/[^A-Za-z0-9_-]/g, "")}.pdf"`);
      res.set("Cache-Control", "private, no-store");
      res.send(pdf);
    } catch (error) {
      next(error);
    }
  });

  // POST / - create a note; its units leave stock now
  router.post(
    "/",
    ...guard,
    tx(async (req, session) => {
      const db = mongoose.connection.db;
      const pharmacyId = req.user.pharmacy_id;
      const { supplier_id, supplier_name, items, reason, notes, return_date, handed_over } = req.body || {};

      if (!supplier_id) throw new HttpError(400, "Supplier is required");
      if (!Array.isArray(items) || !items.length) throw new HttpError(400, "At least one batch item is required");
      const supplier = await db.collection("suppliers").findOne({ id: supplier_id, pharmacy_id: pharmacyId }, { session });
      if (!supplier) throw new HttpError(400, "Supplier not found");

      const bundle = {
        id: uuidv4(),
        pharmacy_id: pharmacyId,
        bundle_no: await nextBundleNo(db, cfg, pharmacyId),
        supplier_id,
        supplier_name: supplier.name || supplier_name || "Unknown Supplier",
        status: handed_over ? PICKED : DRAFT,
        return_type: cfg.returnType,
        ...(kind === "return" ? { reason: reason || "General Return" } : {}),
        return_date: /^\d{4}-\d{2}-\d{2}$/.test(return_date || "") ? return_date : todayStr(),
        items: [],
        total_amount: 0,
        amount_paid: 0,
        remaining_amount: 0,
        payments: [],
        notes: String(notes || "").slice(0, 1000),
        stock_v2: true,
        created_by: req.user.id,
        created_at: nowIso(),
        updated_at: nowIso(),
        ...(handed_over ? { picked_at: nowIso() } : {}),
      };

      const seen = new Set();
      for (const raw of items) {
        const invId = raw.inventory_id || raw.id;
        if (!invId) throw new HttpError(400, `Pick a stock batch for ${raw.product_name || "each item"}`);
        if (seen.has(invId)) throw new HttpError(400, `Batch ${raw.batch_no || ""} is listed twice`);
        seen.add(invId);

        const b = await db.collection("inventory").findOne({ id: invId, pharmacy_id: pharmacyId }, { session });
        if (!b) throw new HttpError(404, `Batch ${raw.batch_no || invId} not found in inventory`);
        if (kind === "return" && isExpiredDate(b.expiry_date)) {
          throw new HttpError(400, `${b.product_name} (${b.batch_no}) has expired. Return it from Expiry.`);
        }
        if (kind === "expiry" && !isExpiredDate(b.expiry_date) && b.expiry_status !== cfg.moved) {
          throw new HttpError(400, `${b.product_name} (${b.batch_no}) has not expired. Return it from Returns.`);
        }
        const units = Number(raw.quantity_units);
        if (!Number.isInteger(units) || units <= 0) throw new HttpError(400, `Enter whole units to return for ${b.product_name} (${b.batch_no})`);
        const pool = poolOf(kind, b);
        if (units > pool) {
          throw new HttpError(400, `${b.product_name} (${b.batch_no}) has only ${pool} unit(s) to return`);
        }

        // Expiry takes from the expiry list first, then the shelf
        const fromExpired = kind === "expiry" ? Math.min(units, expiredUnitsOf(b)) : 0;
        const fromAvailable = units - fromExpired;
        await db.collection("inventory").updateOne(
          { id: b.id, pharmacy_id: pharmacyId },
          {
            $inc: { available_quantity: -fromAvailable, expired_quantity: -fromExpired, returned_quantity: units },
            $set: { updated_at: nowIso() },
          },
          { session }
        );

        const rate = raw.purchase_price !== undefined && raw.purchase_price !== "" ? Number(raw.purchase_price) : Number(b.purchase_price) || 0;
        if (!Number.isFinite(rate) || rate < 0) throw new HttpError(400, `Invalid rate for ${b.product_name}`);
        const upp = Number(b.units_per_pack) || 1;
        const line = {
          inventory_id: b.id,
          product_id: b.product_id,
          product_name: b.product_name,
          batch_no: b.batch_no,
          expiry_date: b.expiry_date,
          pack_type: b.pack_type || "Strip",
          units_per_pack: upp,
          quantity_units: units,
          pack_quantity: round2(units / upp),
          purchase_price: round2(rate),
          mrp: Number(b.mrp) || 0,
          total_refund_amount: round2(units * rate),
          from_available: fromAvailable,
          from_expired: fromExpired,
          ...(kind === "return" ? { reason: raw.reason || reason || "General Return" } : {}),
          notes: String(raw.notes || "").slice(0, 300),
        };
        line.purchase_refs = await linkPurchases(db, session, pharmacyId, kind, bundle, line);
        bundle.items.push(line);
      }

      bundle.total_amount = round2(bundle.items.reduce((s, it) => s + it.total_refund_amount, 0));
      bundle.remaining_amount = bundle.total_amount;
      await col().insertOne({ ...bundle }, { session });

      for (const it of bundle.items) {
        await setBatchState(db, session, pharmacyId, cfg, it.inventory_id, handed_over ? "Picked" : cfg.moved, bundle);
      }
      if (handed_over) await updatePurchaseLinks(db, session, pharmacyId, bundle, "returned");

      return {
        status: 201,
        body: bundle,
        after: () =>
          log(req, "CREATE", bundle.id, `Created ${cfg.noteLabel} ${bundle.bundle_no} for ${bundle.supplier_name}: ${bundle.items.length} item(s), ₹${bundle.total_amount}`),
      };
    })
  );

  // Settles a note: final batch statuses, and legacy stock deduction.
  async function settle(db, session, pharmacyId, bundle) {
    for (const it of bundle.items || []) {
      if (!it.inventory_id) continue;
      if (!bundle.stock_v2 && !bundle.legacy_stock_settled) {
        const b = await db.collection("inventory").findOne({ id: it.inventory_id, pharmacy_id: pharmacyId }, { session });
        if (b) {
          const fromAvailable = Math.min(unitsOf(b), Number(it.quantity_units) || 0);
          const fromExpired = kind === "expiry" ? Math.min(expiredUnitsOf(b), (Number(it.quantity_units) || 0) - fromAvailable) : 0;
          await db.collection("inventory").updateOne(
            { id: b.id, pharmacy_id: pharmacyId },
            { $inc: { available_quantity: -fromAvailable, expired_quantity: -fromExpired, returned_quantity: fromAvailable + fromExpired } },
            { session }
          );
        }
      }
      await setBatchState(db, session, pharmacyId, cfg, it.inventory_id, cfg.done, null);
    }
    if (bundle.stock_v2) await updatePurchaseLinks(db, session, pharmacyId, bundle, "returned");
    else await legacyMarkPurchases(db, session, pharmacyId, cfg, bundle);
  }

  // PATCH /:id/status
  //   Draft <-> Picked while no payment is recorded.
  //   Payment Done (Returned) closes the note; any unpaid balance is written
  //   into the ledger as "Marked settled" so the totals still add up.
  router.patch(
    "/:id/status",
    ...guard,
    tx(async (req, session) => {
      const db = mongoose.connection.db;
      const pharmacyId = req.user.pharmacy_id;
      const { status } = req.body || {};
      if (!STATUSES.includes(status)) throw new HttpError(400, "Invalid status");
      if (status === PARTIAL) throw new HttpError(400, "Partial Paid is set by recording a payment");

      const bundle = await col().findOne({ id: req.params.id, pharmacy_id: pharmacyId }, { session });
      if (!bundle) throw new HttpError(404, `${cfg.noteLabel} not found`);
      if (bundle.status === status) return { message: "Status unchanged", status };
      if (bundle.status === SETTLED) throw new HttpError(400, "This note is already settled");
      if (status === DRAFT && (bundle.payments || []).length) {
        throw new HttpError(400, "Payments are recorded on this note, so it can't go back to Draft");
      }

      const $set = { status, updated_at: nowIso() };
      const $push = {};
      if (status === PICKED) {
        $set.picked_at = nowIso();
        for (const it of bundle.items || []) {
          if (it.inventory_id) await setBatchState(db, session, pharmacyId, cfg, it.inventory_id, "Picked", null);
        }
        if (bundle.stock_v2) await updatePurchaseLinks(db, session, pharmacyId, bundle, "returned");
      } else if (status === DRAFT) {
        for (const it of bundle.items || []) {
          if (it.inventory_id) await setBatchState(db, session, pharmacyId, cfg, it.inventory_id, cfg.moved, null);
        }
        if (bundle.stock_v2) await updatePurchaseLinks(db, session, pharmacyId, bundle, "pending");
      } else if (status === SETTLED) {
        const remaining = round2((bundle.total_amount || 0) - (bundle.amount_paid || 0));
        if (remaining > 0) {
          $push.payments = {
            id: uuidv4(),
            amount: remaining,
            payment_mode: "Marked settled",
            payment_date: nowIso(),
            reference_no: "",
            notes: "Closed without a recorded payment",
            recorded_by: { id: req.user.id, name: req.user.name },
            created_at: nowIso(),
          };
        }
        $set.returned_at = nowIso();
        $set.amount_paid = round2(bundle.total_amount);
        $set.remaining_amount = 0;
        if (!bundle.picked_at) $set.picked_at = nowIso();
        await settle(db, session, pharmacyId, bundle);
        if (!bundle.stock_v2) $set.legacy_stock_settled = true;
      }
      await col().updateOne({ id: bundle.id }, Object.keys($push).length ? { $set, $push } : { $set }, { session });
      return {
        body: { message: "Status updated", status, payment: $push.payments || null },
        after: () => log(req, "UPDATE", bundle.id, `${bundle.bundle_no} moved to "${status}"`),
      };
    })
  );

  // POST /:id/payments - money received, or credit adjusted against dues
  router.post(
    "/:id/payments",
    ...guard,
    tx(async (req, session) => {
      const db = mongoose.connection.db;
      const pharmacyId = req.user.pharmacy_id;
      const { amount, payment_mode = "Cash", payment_date, reference_no, notes } = req.body || {};
      const payAmount = round2(parseFloat(amount));
      if (!Number.isFinite(payAmount) || payAmount <= 0) throw new HttpError(400, "Valid positive payment amount is required");

      const bundle = await col().findOne({ id: req.params.id, pharmacy_id: pharmacyId }, { session });
      if (!bundle) throw new HttpError(404, `${cfg.noteLabel} not found`);
      if (bundle.status === SETTLED) throw new HttpError(400, "This note is already settled");
      const remaining = round2((bundle.total_amount || 0) - (bundle.amount_paid || 0));
      if (payAmount > remaining + 0.001) throw new HttpError(400, `Amount is more than the ₹${remaining.toFixed(2)} still due on this note`);

      const payment = {
        id: uuidv4(),
        amount: payAmount,
        payment_mode,
        payment_date: payment_date ? new Date(payment_date).toISOString() : nowIso(),
        reference_no: String(reference_no || "").slice(0, 100),
        notes: String(notes || "").slice(0, 300),
        recorded_by: { id: req.user.id, name: req.user.name },
        created_at: nowIso(),
      };
      if (Number.isNaN(Date.parse(payment.payment_date))) payment.payment_date = nowIso();

      // Credit adjusted against what we owe this supplier, oldest purchase first
      if (payment_mode === DUES_MODE) {
        const purchases = await db
          .collection("purchases")
          .find({ pharmacy_id: pharmacyId, supplier_id: bundle.supplier_id, payment_status: { $ne: "Paid" } }, { session })
          .sort({ purchase_date: 1, created_at: 1 })
          .toArray();
        const outstanding = round2(purchases.reduce((s, p) => s + Math.max(0, (p.total_amount || 0) - (p.amount_paid || 0)), 0));
        if (outstanding <= 0) throw new HttpError(400, `Nothing is due to ${bundle.supplier_name}, so there is nothing to adjust against`);
        if (payAmount > outstanding + 0.001) {
          throw new HttpError(400, `Only ₹${outstanding.toFixed(2)} is due to ${bundle.supplier_name}. Adjust up to that, and take the rest as a refund.`);
        }
        let left = payAmount;
        payment.adjusted_purchases = [];
        for (const p of purchases) {
          if (left <= 0) break;
          const due = round2((p.total_amount || 0) - (p.amount_paid || 0));
          if (due <= 0) continue;
          const apply = round2(Math.min(due, left));
          const paid = round2((p.amount_paid || 0) + apply);
          await db.collection("purchases").updateOne(
            { id: p.id },
            {
              $set: { amount_paid: paid, payment_status: paid >= (p.total_amount || 0) - 0.001 ? "Paid" : "Partial", updated_at: nowIso() },
              $push: {
                payments: {
                  id: uuidv4(),
                  amount: apply,
                  date: payment.payment_date,
                  mode: "Return credit",
                  notes: `Adjusted from ${bundle.bundle_no}`,
                  source: "return_credit",
                  bundle_id: bundle.id,
                  recorded_by: req.user.id,
                },
              },
            },
            { session }
          );
          payment.adjusted_purchases.push({ purchase_id: p.id, invoice_no: p.invoice_no || null, amount: apply });
          left = round2(left - apply);
        }
      }

      const paidTotal = round2((bundle.amount_paid || 0) + payAmount);
      const newRemaining = Math.max(0, round2((bundle.total_amount || 0) - paidTotal));
      const nextStatus = newRemaining <= 0 ? SETTLED : PARTIAL;
      const $set = { amount_paid: paidTotal, remaining_amount: newRemaining, status: nextStatus, updated_at: nowIso() };
      if (!bundle.picked_at) $set.picked_at = nowIso();

      if (nextStatus === SETTLED) {
        $set.returned_at = nowIso();
        await settle(db, session, pharmacyId, bundle);
        if (!bundle.stock_v2) $set.legacy_stock_settled = true;
      } else if (bundle.status === DRAFT) {
        // Being paid means the goods went back
        for (const it of bundle.items || []) {
          if (it.inventory_id) await setBatchState(db, session, pharmacyId, cfg, it.inventory_id, "Picked", null);
        }
        if (bundle.stock_v2) await updatePurchaseLinks(db, session, pharmacyId, bundle, "returned");
      }
      await col().updateOne({ id: bundle.id }, { $set, $push: { payments: payment } }, { session });

      return {
        body: { message: "Payment recorded", payment, amount_paid: paidTotal, remaining_amount: newRemaining, status: nextStatus },
        after: () => log(req, "PAYMENT", bundle.id, `₹${payAmount} (${payment_mode}) recorded on ${bundle.bundle_no}`),
      };
    })
  );

  // DELETE /:id - only while no payment is recorded; units go back exactly
  router.delete(
    "/:id",
    ...guard,
    tx(async (req, session) => {
      const db = mongoose.connection.db;
      const pharmacyId = req.user.pharmacy_id;
      const bundle = await col().findOne({ id: req.params.id, pharmacy_id: pharmacyId }, { session });
      if (!bundle) throw new HttpError(404, `${cfg.noteLabel} not found`);
      if (bundle.status === SETTLED) throw new HttpError(400, "Cannot delete a settled note");
      if ((bundle.payments || []).length) throw new HttpError(400, "Payments are recorded on this note, so it can't be deleted");

      for (const it of bundle.items || []) {
        if (!it.inventory_id) continue;
        const b = await db.collection("inventory").findOne({ id: it.inventory_id, pharmacy_id: pharmacyId }, { session });
        if (!b) continue;
        const update = { $set: { updated_at: nowIso() }, $unset: { [cfg.bundleIdField]: "", [cfg.bundleNoField]: "" } };
        if (bundle.stock_v2) {
          update.$inc = {
            available_quantity: Number(it.from_available) || 0,
            expired_quantity: Number(it.from_expired) || 0,
            returned_quantity: -(Number(it.quantity_units) || 0),
          };
        }
        // Another live note on this batch decides its status; else units back
        // in the expiry list keep it there; else it is plain stock again.
        const otherNote = await col().findOne(
          { pharmacy_id: pharmacyId, id: { $ne: bundle.id }, "items.inventory_id": b.id },
          { session, sort: { created_at: -1 } }
        );
        const backInList = kind === "expiry" && expiredUnitsOf(b) + (Number(it.from_expired) || 0) > 0;
        if (backInList && otherNote?.status !== DRAFT) {
          // Expired units waiting in the list are what needs attention
          update.$set[cfg.statusField] = cfg.moved;
        } else if (otherNote) {
          update.$set[cfg.statusField] = otherNote.status === DRAFT ? cfg.moved : otherNote.status === SETTLED ? cfg.done : "Picked";
          update.$set[cfg.bundleIdField] = otherNote.id;
          update.$set[cfg.bundleNoField] = otherNote.bundle_no;
          delete update.$unset[cfg.bundleIdField];
          delete update.$unset[cfg.bundleNoField];
        } else {
          update.$set[cfg.statusField] = backInList ? cfg.moved : "Not Moved";
        }
        if (b.status === cfg.done) update.$unset.status = "";
        await db.collection("inventory").updateOne({ id: b.id, pharmacy_id: pharmacyId }, update, { session });
      }
      if (bundle.stock_v2) await updatePurchaseLinks(db, session, pharmacyId, bundle, "remove");
      await col().deleteOne({ id: bundle.id }, { session });
      return {
        body: { message: `${bundle.bundle_no} deleted and its stock restored` },
        after: () => log(req, "DELETE", bundle.id, `Deleted ${cfg.noteLabel} ${bundle.bundle_no}`),
      };
    })
  );

  return router;
}

module.exports = { createNotesRouter, stockStatus, isExpiredDate, KINDS };
