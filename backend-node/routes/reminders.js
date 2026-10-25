const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");
const { auth } = require("../middleware/auth");
const { requireSubscription } = require("../middleware/subscription");
const { checkAndProcessDueReminders, createNotification } = require("../services/notifications");
const { logActivity } = require("../utils/activityLogger");

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
      const searchRegex = { $regex: search, $options: "i" };
      query.$or = [
        { customer_name: searchRegex },
        { customer_mobile: searchRegex },
        { "items.product_name": searchRegex },
        { notes: searchRegex },
      ];
    }

    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 50;
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
