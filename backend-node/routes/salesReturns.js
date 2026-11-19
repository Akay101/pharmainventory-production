// Sales returns (customer returns against a bill). The logic is in
// services/salesReturns.js; purchase returns to suppliers are in returns.js.
const express = require("express");
const mongoose = require("mongoose");
const { auth } = require("../middleware/auth");
const { requireSubscription } = require("../middleware/subscription");
const { logActivity } = require("../utils/activityLogger");
const { generateSalesReturnPDF } = require("../services/salesReturnPdf");
const sr = require("../services/salesReturns");

const router = express.Router();
const guard = [auth, requireSubscription()];
const db = () => mongoose.connection.db;
const col = () => db().collection(sr.COLLECTION);
const escapeRegex = (s) => String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

let indexed = false;
const ensureIndexes = () => {
  if (indexed) return;
  indexed = true;
  Promise.all([
    col().createIndex({ pharmacy_id: 1, return_no: 1 }, { unique: true }),
    col().createIndex({ pharmacy_id: 1, bill_id: 1, created_at: -1 }),
    col().createIndex({ pharmacy_id: 1, created_at: -1 }),
  ]).catch((e) => console.error("sales_returns indexes:", e.message));
};

const log = (req, type, id, text) =>
  logActivity(db(), req.user.pharmacy_id, req.user.id, req.user.name, type, "RETURNS", id, text, "/returns?view=sales").catch(() => {});

// Runs `fn` in a transaction; HttpError becomes its status + detail
const tx = (fn) => async (req, res, next) => {
  ensureIndexes();
  const session = await mongoose.startSession();
  try {
    let out;
    await session.withTransaction(async () => {
      out = await fn(req, session);
    });
    res.status(out?.status || 200).json(out?.body ?? out);
    if (out?.after) out.after();
  } catch (err) {
    if (err instanceof sr.HttpError) res.status(err.status).json({ detail: err.message, ...err.extra });
    else if (err?.code === 11000) res.status(409).json({ detail: "Another return was saved at the same moment. Please try again." });
    else next(err);
  } finally {
    session.endSession();
  }
};

// GET / - returns, with totals
router.get("/", ...guard, async (req, res, next) => {
  try {
    ensureIndexes();
    const pharmacyId = req.user.pharmacy_id;
    const { search, status, refund_mode, start_date, end_date, bill_id, page = 1, limit = 20 } = req.query;
    const query = { pharmacy_id: pharmacyId };
    if (status && status !== "all") query.status = status;
    if (bill_id) query.bill_id = bill_id;
    if (refund_mode && refund_mode !== "all") query.refund_mode = refund_mode === "none" ? null : refund_mode;
    if (search) {
      const rx = { $regex: escapeRegex(search), $options: "i" };
      query.$or = [{ return_no: rx }, { bill_no: rx }, { customer_name: rx }, { customer_mobile: rx }, { "items.product_name": rx }, { "items.batch_no": rx }];
    }
    if (start_date || end_date) {
      query.return_date = {};
      if (start_date) query.return_date.$gte = start_date;
      if (end_date) query.return_date.$lte = end_date;
    }
    const p = Math.max(1, parseInt(page) || 1);
    const l = Math.min(100, Math.max(1, parseInt(limit) || 20));
    const [total, returns, agg] = await Promise.all([
      col().countDocuments(query),
      col()
        .find(query, { projection: { _id: 0, bill_snapshot: 0 } })
        .sort({ created_at: -1 })
        .skip((p - 1) * l)
        .limit(l)
        .toArray(),
      col()
        .aggregate([
          { $match: { pharmacy_id: pharmacyId, status: sr.ACTIVE } },
          {
            $group: {
              _id: null,
              count: { $sum: 1 },
              value: { $sum: "$total_amount" },
              refunded: { $sum: { $cond: [{ $ne: ["$refund_mode", "Advance"] }, "$refund_amount", 0] } },
              to_advance: { $sum: { $cond: [{ $eq: ["$refund_mode", "Advance"] }, "$refund_amount", 0] } },
              adjusted: { $sum: "$adjusted_against_due" },
              full: { $sum: { $cond: [{ $eq: ["$type", "full"] }, 1, 0] } },
              units: { $sum: "$total_units" },
            },
          },
        ])
        .toArray(),
    ]);
    const s = agg[0] || {};
    res.json({
      returns,
      stats: {
        count: s.count || 0,
        value: sr.round2(s.value),
        refunded: sr.round2(s.refunded),
        to_advance: sr.round2(s.to_advance),
        adjusted: sr.round2(s.adjusted),
        full_bills: s.full || 0,
        units: s.units || 0,
      },
      pagination: { page: p, limit: l, total, total_pages: Math.ceil(total / l) || 1 },
    });
  } catch (e) {
    next(e);
  }
});

// GET /bills?search= - bills a return can be made against (for the picker)
router.get("/bills", ...guard, async (req, res, next) => {
  try {
    const { search } = req.query;
    const query = { pharmacy_id: req.user.pharmacy_id, return_status: { $ne: "Returned" } };
    if (search && String(search).trim()) {
      const rx = { $regex: escapeRegex(String(search).trim()), $options: "i" };
      query.$or = [{ bill_no: rx }, { customer_name: rx }, { customer_mobile: rx }, { "items.product_name": rx }, { "items.batch_no": rx }];
    }
    const bills = await db()
      .collection("bills")
      .find(query, {
        projection: { _id: 0, id: 1, bill_no: 1, billing_date: 1, customer_name: 1, customer_mobile: 1, grand_total: 1, total_amount: 1, original_grand_total: 1, total_paid: 1, is_paid: 1, return_status: 1, returned_amount: 1, created_at: 1, "items.product_name": 1, "items.quantity": 1 },
      })
      .sort({ billing_date: -1, created_at: -1 })
      .limit(30)
      .toArray();
    res.json({
      bills: bills.map((b) => ({
        ...b,
        grand_total: sr.round2(b.grand_total ?? b.total_amount),
        item_count: (b.items || []).filter((i) => (Number(i.quantity) || 0) > 0).length,
        items: (b.items || []).slice(0, 4).map((i) => i.product_name),
      })),
    });
  } catch (e) {
    next(e);
  }
});

// GET /bill/:bill_id - a bill's returnable lines and its past returns
router.get("/bill/:bill_id", ...guard, async (req, res, next) => {
  try {
    const bill = await db().collection("bills").findOne({ id: req.params.bill_id, pharmacy_id: req.user.pharmacy_id });
    if (!bill) return res.status(404).json({ detail: "Bill not found" });
    const returns = await col()
      .find({ pharmacy_id: req.user.pharmacy_id, bill_id: bill.id }, { projection: { _id: 0, bill_snapshot: 0 } })
      .sort({ created_at: -1 })
      .toArray();
    let advance = 0;
    if (bill.customer_id) {
      const c = await db().collection("customers").findOne({ id: bill.customer_id, pharmacy_id: req.user.pharmacy_id }, { projection: { advance_credit: 1 } });
      advance = sr.round2(c?.advance_credit || 0);
    }
    res.json({ bill: sr.publicBill(bill), returns, customer_advance: advance, reasons: sr.REASONS, refund_modes: sr.REFUND_MODES });
  } catch (e) {
    next(e);
  }
});

// GET /:id
router.get("/:id", ...guard, async (req, res, next) => {
  try {
    const ret = await col().findOne({ id: req.params.id, pharmacy_id: req.user.pharmacy_id }, { projection: { _id: 0, bill_snapshot: 0 } });
    if (!ret) return res.status(404).json({ detail: "Sales return not found" });
    res.json(ret);
  } catch (e) {
    next(e);
  }
});

// GET /:id/pdf - the credit note
router.get("/:id/pdf", ...guard, async (req, res, next) => {
  try {
    const ret = await col().findOne({ id: req.params.id, pharmacy_id: req.user.pharmacy_id }, { projection: { _id: 0, bill_snapshot: 0 } });
    if (!ret) return res.status(404).json({ detail: "Sales return not found" });
    const pharmacy = await db().collection("pharmacies").findOne({ id: req.user.pharmacy_id }, { projection: { _id: 0 } });
    const pdf = await generateSalesReturnPDF(ret, pharmacy || {});
    res.set("Content-Type", "application/pdf");
    res.set("Content-Disposition", `inline; filename="${String(ret.return_no || "return").replace(/[^A-Za-z0-9_-]/g, "")}.pdf"`);
    res.set("Cache-Control", "private, no-store");
    res.send(pdf);
  } catch (e) {
    next(e);
  }
});

// POST / - make a return: { bill_id, full?, items?: [{line_index, quantity, restock}], reason, notes, refund_mode, return_date }
router.post(
  "/",
  ...guard,
  tx(async (req, session) => {
    const body = req.body || {};
    if (!body.bill_id) throw new sr.HttpError(400, "Pick the bill the goods were sold on");
    const ret = await sr.createReturn(db(), session, req.user, body);
    const { bill_snapshot, ...out } = ret;
    return {
      status: 201,
      body: out,
      after: () =>
        log(
          req,
          "CREATE",
          ret.id,
          `Sales return ${ret.return_no} on bill ${ret.bill_no}: ${ret.type === "full" ? "whole bill" : `${ret.items.length} item(s)`}, ₹${ret.total_amount}${ret.refund_amount ? ` (₹${ret.refund_amount} refunded${ret.refund_mode === "Advance" ? " to advance" : ` in ${ret.refund_mode}`})` : ""}`
        ),
    };
  })
);

// POST /:id/cancel - undo the latest return on a bill
router.post(
  "/:id/cancel",
  ...guard,
  tx(async (req, session) => {
    const { ret, shortfalls } = await sr.cancelReturn(db(), session, req.user, req.params.id, req.body?.note);
    return {
      body: {
        message: `${ret.return_no} cancelled. Bill ${ret.bill_no} is back as it was.`,
        stock_shortfall: shortfalls,
        refund_to_recover: ret.refund_mode && ret.refund_mode !== "Advance" ? ret.refund_amount : 0,
      },
      after: () => log(req, "DELETE", ret.id, `Cancelled sales return ${ret.return_no} on bill ${ret.bill_no}`),
    };
  })
);

module.exports = router;
