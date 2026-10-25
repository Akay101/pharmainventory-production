const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const { auth } = require("../middleware/auth");
const { requireSubscription } = require("../middleware/subscription");
const { checkAndProcessDueReminders } = require("../services/notifications");

/**
 * GET /api/notifications
 * Fetch notifications for current pharmacy with pagination, type filter, and unread counts
 */
router.get("/", auth, requireSubscription(), async (req, res, next) => {
  try {
    const db = mongoose.connection.db;
    const { type, is_read, page = 1, limit = 30 } = req.query;

    // Automatically check for due reminders on fetch
    try {
      await checkAndProcessDueReminders(db, req.user.pharmacy_id);
    } catch (checkErr) {
      console.error("Error auto-checking due reminders:", checkErr);
    }

    const query = { pharmacy_id: req.user.pharmacy_id };

    if (type && type !== "ALL") {
      query.type = type;
    }

    if (is_read !== undefined) {
      query.is_read = is_read === "true" || is_read === true;
    }

    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 30;
    const skip = (pageNum - 1) * limitNum;

    const notifications = await db
      .collection("notifications")
      .find(query, { projection: { _id: 0 } })
      .sort({ is_read: 1, created_at: -1 })
      .skip(skip)
      .limit(limitNum)
      .toArray();

    const total = await db.collection("notifications").countDocuments(query);
    const unreadCount = await db.collection("notifications").countDocuments({
      pharmacy_id: req.user.pharmacy_id,
      is_read: false,
    });

    res.json({
      notifications,
      unread_count: unreadCount,
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
 * GET /api/notifications/unread-count
 * Lightweight unread badge count
 */
router.get("/unread-count", auth, requireSubscription(), async (req, res, next) => {
  try {
    const db = mongoose.connection.db;
    const unreadCount = await db.collection("notifications").countDocuments({
      pharmacy_id: req.user.pharmacy_id,
      is_read: false,
    });

    res.json({ unread_count: unreadCount });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/notifications/:id/read
 * Mark a single notification as read
 */
router.put("/:id/read", auth, requireSubscription(), async (req, res, next) => {
  try {
    const db = mongoose.connection.db;
    const { id } = req.params;

    const result = await db.collection("notifications").updateOne(
      { id, pharmacy_id: req.user.pharmacy_id },
      {
        $set: {
          is_read: true,
          read_at: new Date().toISOString(),
        },
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ detail: "Notification not found" });
    }

    res.json({ message: "Notification marked as read" });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/notifications/mark-all-read
 * Mark all notifications as read for current pharmacy
 */
router.put("/mark-all-read", auth, requireSubscription(), async (req, res, next) => {
  try {
    const db = mongoose.connection.db;

    await db.collection("notifications").updateMany(
      { pharmacy_id: req.user.pharmacy_id, is_read: false },
      {
        $set: {
          is_read: true,
          read_at: new Date().toISOString(),
        },
      }
    );

    res.json({ message: "All notifications marked as read" });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/notifications/:id
 * Delete single notification
 */
router.delete("/:id", auth, requireSubscription(), async (req, res, next) => {
  try {
    const db = mongoose.connection.db;
    const { id } = req.params;

    const result = await db.collection("notifications").deleteOne({
      id,
      pharmacy_id: req.user.pharmacy_id,
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ detail: "Notification not found" });
    }

    res.json({ message: "Notification deleted" });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/notifications/clear-all
 * Clear all read notifications
 */
router.delete("/clear-all", auth, requireSubscription(), async (req, res, next) => {
  try {
    const db = mongoose.connection.db;

    await db.collection("notifications").deleteMany({
      pharmacy_id: req.user.pharmacy_id,
      is_read: true,
    });

    res.json({ message: "Read notifications cleared" });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
