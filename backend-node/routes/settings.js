const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const { auth, adminOnly } = require("../middleware/auth");

/**
 * Registry of all available settings.
 * In a production app, this could be stored in a collection called 'settings_registry'
 */
const DEFAULT_REGISTRY = [
  {
    key: "sidebar_collapsed",
    label: "Sidebar Collapsed by Default",
    type: "boolean",
    default: false,
    category: "Appearance",
    description: "Whether the sidebar should be collapsed when you log in.",
  },
  {
    key: "theme",
    label: "Application Theme",
    type: "select",
    options: ["dark", "light"],
    default: "dark",
    category: "Appearance",
    description: "Choose your preferred application theme.",
  },
  {
    key: "activity_sidebar_open",
    label: "Show Activity Sidebar",
    type: "boolean",
    default: true,
    category: "Appearance",
    description: "Keep the recent activity sidebar visible by default.",
  },
  {
    key: "purchase_payment_status",
    label: "Purchase Payment Status Unpaid/Partial/Paid",
    type: "select",
    options: ["Unpaid", "Partial", "Paid"],
    default: "Unpaid",
    category: "Preferences",
    description:
      "What should be the payment mode by default Unpaid/Partial/Paid",
  },
  {
    key: "purchase_payment_mode_mandatory",
    label: "Purchase Payment Mode Mandatory",
    type: "boolean",
    default: false,
    category: "Preferences",
    description:
      "Require payment mode to be selected when creating a purchase.",
  },
  {
    key: "purchase_payment_mode_default",
    label: "Purchase Default Payment Mode",
    type: "select",
    options: ["none", "Cash", "UPI", "Card"],
    default: "none",
    category: "Preferences",
    description: "Default payment mode selected for new purchases.",
  },
  {
    key: "billing_payment_mode_mandatory",
    label: "Billing Payment Mode Mandatory",
    type: "boolean",
    default: false,
    category: "Preferences",
    description: "Require payment mode to be selected when creating a bill.",
  },
  {
    key: "billing_payment_mode_default",
    label: "Billing Default Payment Mode",
    type: "select",
    options: ["none", "Cash", "UPI", "Card"],
    default: "none",
    category: "Preferences",
    description: "Default payment mode selected for new bills.",
  },
  {
    key: "shortage_threshold",
    label: "Shortage List Threshold",
    type: "number",
    default: 10,
    category: "Preferences",
    description: "Default minimum stock quantity threshold for Shortage List alert.",
  },
];

// Helper to ensure registry exists in DB
const syncRegistry = async (db) => {
  const registry = db.collection("settings_registry");
  for (const setting of DEFAULT_REGISTRY) {
    await registry.updateOne(
      { key: setting.key },
      { $set: setting },
      { upsert: true }
    );
  }
};

// GET /api/settings/definitions
// Fetch the registry of available settings (Admin only or all?)
router.get("/definitions", auth, async (req, res, next) => {
  try {
    const db = mongoose.connection.db;
    const registry = await db.collection("settings_registry").find().toArray();
    res.json(registry);
  } catch (error) {
    next(error);
  }
});

// GET /api/settings
// Fetch merged settings for the current user
router.get("/", auth, async (req, res, next) => {
  try {
    const db = mongoose.connection.db;
    const userId = req.user.id;

    // 1. Sync registry if empty (bootstrapping)
    await syncRegistry(db);

    // 2. Fetch registry and user settings
    const [registry, userPrefs] = await Promise.all([
      db.collection("settings_registry").find().toArray(),
      db.collection("user_settings").findOne({ user_id: userId }),
    ]);

    const preferences = userPrefs?.preferences || {};

    // 3. Merge registry with user preferences
    const merged = registry.map((setting) => ({
      ...setting,
      value:
        preferences[setting.key] !== undefined
          ? preferences[setting.key]
          : setting.default,
    }));

    res.json({
      settings: merged,
      preferences, // raw map
    });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/settings
// Update a specific setting for the current user
router.post("/update", auth, async (req, res, next) => {
  try {
    const { key, value } = req.body;
    const db = mongoose.connection.db;
    const userId = req.user.id;

    if (!key) {
      return res.status(400).json({ detail: "Setting key is required" });
    }

    // If setting purchase_payment_mode_mandatory to true, ensure purchase_payment_status is not Unpaid
    let extraUpdates = {};
    if (key === "purchase_payment_mode_mandatory" && value === true) {
      const userSettings = await db.collection("user_settings").findOne({ user_id: userId });
      if (userSettings?.preferences?.purchase_payment_status === "Unpaid" || !userSettings?.preferences?.purchase_payment_status) {
        extraUpdates["preferences.purchase_payment_status"] = "Paid";
      }
    }
    // If setting purchase_payment_status to Unpaid, ensure purchase_payment_mode_mandatory is false
    if (key === "purchase_payment_status" && value === "Unpaid") {
      const userSettings = await db.collection("user_settings").findOne({ user_id: userId });
      if (userSettings?.preferences?.purchase_payment_mode_mandatory === true) {
        return res.status(400).json({ detail: "Cannot set default status to Unpaid when payment mode is mandatory" });
      }
    }

    // Update user preferences
    await db
      .collection("user_settings")
      .updateOne(
        { user_id: userId },
        { 
          $set: { 
            [`preferences.${key}`]: value,
            ...extraUpdates
          } 
        },
        { upsert: true }
      );

    res.json({ message: "Setting updated successfully", key, value });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
