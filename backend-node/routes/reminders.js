const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");
const { auth } = require("../middleware/auth");
const { requireSubscription } = require("../middleware/subscription");
const { checkAndProcessDueReminders, createNotification } = require("../services/notifications");
const { logActivity } = require("../utils/activityLogger");
const restock = require("../services/restock");

/**
 * GET /api/reminders
 * List reminders with optional filters: customer_id, status, is_active, due_only, search
 */
router.get("/", auth, requireSubscription(), async (req, res, next) => {
  try {
    const db = mongoose.connection.db;
    const {
      customer_id,
      customer_mobile,
      status,
      is_active,
      due_only,
      search,
      page = 1,
      limit = 50,
    } = req.query;

    const query = { pharmacy_id: req.user.pharmacy_id };

    if (customer_id) {
      query.customer_id = customer_id;
    }

    if (customer_mobile) {
      query.customer_mobile = customer_mobile;
    }

    if (status) {
      query.status = status;
    }

    if (is_active !== undefined) {
      query.is_active = is_active === "true" || is_active === true;
    }

    const todayStr = new Date().toISOString().slice(0, 10);
    if (due_only === "true") {
      query.is_active = true;
      query.reminder_date = { $lte: todayStr };
    }

    if (search) {
      const escaped = String(search).slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const searchRegex = { $regex: escaped, $options: "i" };
      query.$or = [
        { customer_name: searchRegex },
        { customer_mobile: searchRegex },
        { "items.product_name": searchRegex },
        { notes: searchRegex },
      ];
    }

    const pageNum = Math.max(parseInt(page) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit) || 50, 1), 200);
    const skip = (pageNum - 1) * limitNum;

    const reminders = await db
      .collection("reminders")
      .find(query, { projection: { _id: 0 } })
      .sort({ reminder_date: 1, created_at: -1 })
      .skip(skip)
      .limit(limitNum)
      .toArray();

    const total = await db.collection("reminders").countDocuments(query);

    // Summary counts
    const activeCount = await db.collection("reminders").countDocuments({
      pharmacy_id: req.user.pharmacy_id,
      is_active: true,
    });
    const dueCount = await db.collection("reminders").countDocuments({
      pharmacy_id: req.user.pharmacy_id,
      is_active: true,
      status: { $in: ["PENDING", "NOTIFIED"] },
      reminder_date: { $lte: todayStr },
    });

    res.json({
      reminders,
      stats: {
        total,
        active: activeCount,
        due: dueCount,
      },
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        total_pages: Math.ceil(total / limitNum) || 1,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/reminders
 * Create a new restock / refill reminder
 */
// GET /api/reminders/restock?view=open|due|done|all&search=
// Restock list: every refill reminder with its medicines, stock on hand vs the
// restock quantity, and the restock status (auto-done when stock covers it).
router.get("/restock", auth, requireSubscription(), async (req, res, next) => {
  try {
    const db = mongoose.connection.db;
    const view = ["open", "due", "done", "all"].includes(req.query.view) ? req.query.view : "open";
    const q = { pharmacy_id: req.user.pharmacy_id, "items.0": { $exists: true } };
    const search = String(req.query.search || "").trim().slice(0, 80);
    if (search) {
      const esc = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      q.$or = [{ customer_name: { $regex: esc, $options: "i" } }, { customer_mobile: { $regex: esc } }, { "items.product_name": { $regex: esc, $options: "i" } }, { bill_no: { $regex: esc, $options: "i" } }];
    }
    const docs = await db.collection("reminders").find(q, { projection: { _id: 0 } }).sort({ reminder_date: 1, created_at: -1 }).limit(500).toArray();
    // Done ones are already settled; only open ones need a stock check
    const open = docs.filter((r) => r.restock?.status !== "DONE");
    const evaluated = new Map((await restock.evaluate(db, req.user, open)).map((r) => [r.id, r]));
    const today = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
    const all = docs.map((r) => evaluated.get(r.id) || { ...r, items: (r.items || []).map((i) => ({ ...i, needed: restock.need(i) })) });
    const isDone = (r) => r.restock?.status === "DONE";
    const isDue = (r) => !isDone(r) && r.reminder_date && r.reminder_date <= today;
    const counts = { open: all.filter((r) => !isDone(r)).length, due: all.filter(isDue).length, done: all.filter(isDone).length, all: all.length };
    const list = view === "all" ? all : view === "done" ? all.filter(isDone) : view === "due" ? all.filter(isDue) : all.filter((r) => !isDone(r));
    res.json({ reminders: list, counts, today });
  } catch (error) {
    next(error);
  }
});

// POST /api/reminders/:id/restock {action: "done", force?} | {action: "reopen"}
// "done" checks the stock first; when it's still short it answers 409 with the
// shortfall, and force: true marks it done anyway (manual override).
router.post("/:id/restock", auth, requireSubscription(), async (req, res, next) => {
  try {
    const db = mongoose.connection.db;
    const { action, force } = req.body || {};
    const r = await db.collection("reminders").findOne({ id: req.params.id, pharmacy_id: req.user.pharmacy_id }, { projection: { _id: 0 } });
    if (!r) return res.status(404).json({ detail: "Reminder not found" });
    const now = new Date().toISOString();
    if (action === "reopen") {
      const next = { status: r.purchase_draft_id ? "ORDERED" : "PENDING", reopened_at: now };
      await db.collection("reminders").updateOne({ id: r.id, pharmacy_id: req.user.pharmacy_id }, { $set: { restock: next, updated_at: now } });
      return res.json({ message: "Reopened", restock: next });
    }
    if (action !== "done") return res.status(400).json({ detail: "Unknown action" });
    if (r.restock?.status === "DONE") return res.json({ message: "Already done", restock: r.restock });
    const [ev] = await restock.evaluate(db, req.user, [r]);
    if (ev.restock.status === "DONE") return res.json({ message: ev.restock.reason, restock: ev.restock, auto: true });
    const short = ev.items.filter((i) => !i.covered).map((i) => ({ product_name: i.product_name, in_stock: i.in_stock, needed: i.needed }));
    if (!force) {
      return res.status(409).json({ code: "STOCK_SHORT", detail: "Stock isn't back for every medicine yet", short });
    }
    const done = {
      status: "DONE",
      done_by: "manual",
      done_at: now,
      done_by_user: req.user.name || req.user.id,
      reason: "Marked done by hand",
      short_at_done: short,
    };
    await db.collection("reminders").updateOne({ id: r.id, pharmacy_id: req.user.pharmacy_id }, { $set: { restock: done, updated_at: now } });
    await logActivity(db, req.user.pharmacy_id, req.user.id, req.user.name, "UPDATE", "REMINDERS", r.id, `Restock marked done by hand for ${r.customer_name || "customer"}`, "/restock");
    res.json({ message: "Marked done", restock: done });
  } catch (error) {
    next(error);
  }
});

router.post("/", auth, requireSubscription(), async (req, res, next) => {
  try {
    const db = mongoose.connection.db;
    const {
      customer_id,
      customer_name,
      customer_mobile,
      bill_id,
      bill_no,
      items,
      billing_date,
      refill_target_date,
      reminder_date,
      notes,
      days_supply = 30,
      remind_before_days = 5,
    } = req.body;

    if (!customer_name && !customer_id) {
      return res.status(400).json({ detail: "Customer information is required" });
    }

    const todayStr = new Date().toISOString().slice(0, 10);
    const bDate = billing_date || todayStr;

    // Calculate target date if not provided
    let finalTargetDate = refill_target_date;
    if (!finalTargetDate) {
      const d = new Date(bDate);
      d.setDate(d.getDate() + (parseInt(days_supply) || 30));
      finalTargetDate = d.toISOString().slice(0, 10);
    }

    // Calculate reminder date if not provided (default: 5 days before target)
    let finalReminderDate = reminder_date;
    if (!finalReminderDate) {
      const d = new Date(finalTargetDate);
      d.setDate(d.getDate() - (parseInt(remind_before_days) || 5));
      finalReminderDate = d.toISOString().slice(0, 10);
    }

    // Resolve customer info if customer_id is provided
    let resolvedCustomerName = customer_name;
    let resolvedCustomerMobile = customer_mobile;
    if (customer_id && (!resolvedCustomerName || !resolvedCustomerMobile)) {
      const cust = await db.collection("customers").findOne({ id: customer_id, pharmacy_id: req.user.pharmacy_id });
      if (cust) {
        resolvedCustomerName = resolvedCustomerName || cust.name;
        resolvedCustomerMobile = resolvedCustomerMobile || cust.mobile;
      }
    }

    const reminderId = uuidv4();
    const reminderData = {
      id: reminderId,
      pharmacy_id: req.user.pharmacy_id,
      customer_id: customer_id || null,
      customer_name: resolvedCustomerName || "Customer",
      customer_mobile: resolvedCustomerMobile || null,
      bill_id: bill_id || null,
      bill_no: bill_no || null,
      items: Array.isArray(items)
        ? items.map((i) => ({
            product_name: i.product_name || i.name || "Medicine",
            batch_no: i.batch_no || null,
            quantity: parseInt(i.quantity) || 1,
            unit_price: parseFloat(i.unit_price) || 0,
            daily_dosage: parseFloat(i.daily_dosage) || 1,
            days_supply: parseInt(i.days_supply) || parseInt(days_supply) || 30,
          }))
        : [],
      billing_date: bDate,
      refill_target_date: finalTargetDate,
      reminder_date: finalReminderDate,
      notes: notes || "",
      is_active: true,
      status: "PENDING", // PENDING, NOTIFIED, COMPLETED, CANCELLED
      notified_at: null,
      completed_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await db.collection("reminders").insertOne(reminderData);

    // If reminder date is today or in past, trigger notification immediately
    if (finalReminderDate <= todayStr) {
      await checkAndProcessDueReminders(db, req.user.pharmacy_id);
    }

    await logActivity(
      db,
      req.user.pharmacy_id,
      req.user.id,
      req.user.name,
      "CREATE",
      "REMINDER",
      reminderId,
      `Set Refill Reminder for ${resolvedCustomerName} on ${finalReminderDate}`,
      `/customers?highlight_id=${customer_id}`
    );

    const { _id, ...savedReminder } = reminderData;
    res.status(201).json({
      message: "Restock reminder created successfully",
      reminder: savedReminder,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/reminders/:id/toggle
 * Turn reminder ON or OFF
 */
router.put("/:id/toggle", auth, requireSubscription(), async (req, res, next) => {
  try {
    const db = mongoose.connection.db;
    const { id } = req.params;

    const reminder = await db.collection("reminders").findOne({
      id,
      pharmacy_id: req.user.pharmacy_id,
    });

    if (!reminder) {
      return res.status(404).json({ detail: "Reminder not found" });
    }

    const newActiveState = !reminder.is_active;
    const updateFields = {
      is_active: newActiveState,
      updated_at: new Date().toISOString(),
    };

    if (!newActiveState) {
      updateFields.status = "CANCELLED";
    } else if (reminder.status === "CANCELLED") {
      updateFields.status = "PENDING";
    }

    await db.collection("reminders").updateOne(
      { id, pharmacy_id: req.user.pharmacy_id },
      { $set: updateFields }
    );

    // If turned back on and due, process notification
    const todayStr = new Date().toISOString().slice(0, 10);
    if (newActiveState && reminder.reminder_date <= todayStr) {
      await checkAndProcessDueReminders(db, req.user.pharmacy_id);
    }

    res.json({
      message: `Reminder ${newActiveState ? "activated" : "deactivated"}`,
      is_active: newActiveState,
      status: updateFields.status || reminder.status,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/reminders/:id/complete
 * Mark reminder as completed (refill purchased)
 */
router.post("/:id/complete", auth, requireSubscription(), async (req, res, next) => {
  try {
    const db = mongoose.connection.db;
    const { id } = req.params;

    const result = await db.collection("reminders").updateOne(
      { id, pharmacy_id: req.user.pharmacy_id },
      {
        $set: {
          status: "COMPLETED",
          is_active: false,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ detail: "Reminder not found" });
    }

    // Also mark related notifications as read
    await db.collection("notifications").updateMany(
      { pharmacy_id: req.user.pharmacy_id, "data.reminder_id": id },
      { $set: { is_read: true, read_at: new Date().toISOString() } }
    );

    res.json({ message: "Reminder marked as completed" });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/reminders/:id
 * Update reminder dates, notes, items
 */
router.put("/:id", auth, requireSubscription(), async (req, res, next) => {
  try {
    const db = mongoose.connection.db;
    const { id } = req.params;
    const { refill_target_date, reminder_date, notes, items, is_active } = req.body;

    const updateFields = {
      updated_at: new Date().toISOString(),
    };

    if (refill_target_date) updateFields.refill_target_date = refill_target_date;
    if (reminder_date) updateFields.reminder_date = reminder_date;
    if (notes !== undefined) updateFields.notes = notes;
    if (items !== undefined) updateFields.items = items;
    if (is_active !== undefined) updateFields.is_active = is_active;

    const result = await db.collection("reminders").updateOne(
      { id, pharmacy_id: req.user.pharmacy_id },
      { $set: updateFields }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ detail: "Reminder not found" });
    }

    res.json({ message: "Reminder updated successfully" });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/reminders/:id
 * Delete a reminder
 */
router.delete("/:id", auth, requireSubscription(), async (req, res, next) => {
  try {
    const db = mongoose.connection.db;
    const { id } = req.params;

    const result = await db.collection("reminders").deleteOne({
      id,
      pharmacy_id: req.user.pharmacy_id,
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ detail: "Reminder not found" });
    }

    // Delete related notifications
    await db.collection("notifications").deleteMany({
      pharmacy_id: req.user.pharmacy_id,
      "data.reminder_id": id,
    });

    res.json({ message: "Reminder deleted successfully" });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/reminders/check-due
 * Trigger scan for due reminders and generate notifications
 */
// POST /api/reminders/:id/purchase-draft
// Turns a refill reminder into a purchase draft to restock what the customer
// will buy again: last supplier, pack size, rates and GST from the last
// purchase of each medicine; quantity from the reminder. Batch and expiry are
// left for the user. Calling it again returns the same draft while it exists.
router.post("/:id/purchase-draft", auth, requireSubscription(), async (req, res, next) => {
  try {
    const db = mongoose.connection.db;
    const pharmacyId = req.user.pharmacy_id;
    const reminder = await db.collection("reminders").findOne({ id: req.params.id, pharmacy_id: pharmacyId });
    if (!reminder) return res.status(404).json({ detail: "Reminder not found" });

    if (reminder.purchase_draft_id) {
      const existing = await db.collection("purchase_drafts").findOne({ id: reminder.purchase_draft_id, pharmacy_id: pharmacyId }, { projection: { _id: 0 } });
      if (existing) return res.json({ draft: existing, existing: true });
    }
    const items = (reminder.items || []).filter((i) => i.product_name).slice(0, 50);
    if (!items.length) return res.status(400).json({ detail: "This reminder has no medicines to order" });

    const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    let supplier = null;
    const lines = [];
    for (const it of items) {
      const sameProduct = it.product_id
        ? { $or: [{ "items.product_id": it.product_id }, { "items.product_name": it.product_name }] }
        : { "items.product_name": { $regex: `^${esc(it.product_name)}$`, $options: "i" } };
      const [lastPurchase] = await db
        .collection("purchases")
        .find({ pharmacy_id: pharmacyId, ...sameProduct }, { projection: { _id: 0, supplier_id: 1, supplier_name: 1, items: 1 } })
        .sort({ purchase_date: -1, created_at: -1 })
        .limit(1)
        .toArray();
      const line = lastPurchase?.items?.find(
        (x) => (it.product_id && x.product_id === it.product_id) || String(x.product_name || "").toLowerCase() === it.product_name.toLowerCase()
      );
      const inv = it.inventory_id
        ? await db.collection("inventory").findOne({ id: it.inventory_id, pharmacy_id: pharmacyId }, { projection: { _id: 0 } })
        : null;
      const src = line || inv || {};
      const upp = Number(src.units_per_pack) || Number(it.units_per_pack) || 1;
      const wantUnits = Number(it.reorder_units) || Number(it.quantity) || upp;
      const mrpUnit = Number(src.mrp_per_unit || src.mrp) || Number(it.unit_price) || 0;
      lines.push({
        product_id: src.product_id || it.product_id || "",
        product_name: it.product_name,
        manufacturer: src.manufacturer || "",
        salt_composition: src.salt_composition || "",
        pack_type: src.pack_type || "Strip",
        batch_no: "",
        expiry_date: "",
        hsn_no: src.hsn_no || "",
        pack_quantity: Math.max(1, Math.ceil(wantUnits / upp)),
        units_per_pack: upp,
        pack_price: Number(src.pack_price) || (Number(src.purchase_price) ? Math.round(Number(src.purchase_price) * upp * 100) / 100 : 0),
        mrp_per_unit: mrpUnit,
        cgst: src.cgst ?? "",
        sgst: src.sgst ?? "",
        discount: src.discount ?? "",
      });
      if (!supplier && (lastPurchase?.supplier_id || lastPurchase?.supplier_name)) {
        supplier = { id: lastPurchase.supplier_id || null, name: lastPurchase.supplier_name || "" };
      }
    }
    // Purchases saved by supplier name only: link the matching supplier record if there is one
    if (supplier && !supplier.id && supplier.name) {
      const rec = await db
        .collection("suppliers")
        .findOne({ pharmacy_id: pharmacyId, name: { $regex: `^${esc(supplier.name)}$`, $options: "i" } }, { projection: { _id: 0, id: 1, name: 1 } });
      if (rec) supplier = { id: rec.id, name: rec.name };
    }

    const now = new Date().toISOString();
    const total =
      Math.round(lines.reduce((s, l) => s + (l.pack_quantity || 0) * (l.pack_price || 0) * (1 + ((Number(l.cgst) || 0) + (Number(l.sgst) || 0)) / 100), 0) * 100) / 100;
    const draft = {
      id: uuidv4(),
      draft_no: `PD-${Date.now().toString().slice(-6)}`,
      pharmacy_id: pharmacyId,
      source: "reminder",
      supplier_id: supplier?.id || null,
      supplier_name: supplier?.name || "",
      supplier_data: null,
      invoice_no: "",
      purchase_date: now.slice(0, 10),
      payment_status: "Unpaid",
      amount_paid: 0,
      payment_mode: null,
      items: lines,
      note: `Restock for ${reminder.customer_name || "customer"}${reminder.bill_no ? ` (bill ${reminder.bill_no})` : ""}`.slice(0, 300),
      reminder_id: reminder.id,
      total,
      created_by: req.user.id,
      created_by_name: req.user.name || "",
      created_at: now,
      updated_at: now,
    };
    await db.collection("purchase_drafts").insertOne({ ...draft });
    const restockNow = reminder.restock?.status === "DONE" ? reminder.restock : { ...(reminder.restock || {}), status: "ORDERED", ordered_at: now };
    await db.collection("reminders").updateOne({ id: reminder.id, pharmacy_id: pharmacyId }, { $set: { purchase_draft_id: draft.id, restock: restockNow, updated_at: now } });
    res.status(201).json({ draft });
  } catch (error) {
    next(error);
  }
});

router.post("/check-due", auth, requireSubscription(), async (req, res, next) => {
  try {
    const db = mongoose.connection.db;
    const result = await checkAndProcessDueReminders(db, req.user.pharmacy_id);
    res.json({ message: "Due reminders checked", result });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
