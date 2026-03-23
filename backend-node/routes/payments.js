const express = require("express");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");
const cashfree = require("../services/cashfree");
const { auth } = require("../middleware/auth");
const mongoose = require("mongoose");

const PLAN_CONFIG = {
  BASIC: { amount: parseInt(process.env.PLAN_BASIC_PRICE) || 20, duration_days: 365 },
  ADVANCED: { amount: parseInt(process.env.PLAN_ADV_PRICE) || 40, duration_days: 365 },
  AGENTIC: { amount: parseInt(process.env.PLAN_AGENTIC_PRICE) || 80, duration_days: 365 },
};

router.post("/create-order", auth, async (req, res, next) => {
  try {
    const { plan } = req.body;

    if (!["BASIC", "ADVANCED", "AGENTIC"].includes(plan)) {
      return res.status(400).json({ detail: "Invalid plan" });
    }

    const orderId = `order_${uuidv4()}`;

    const request = {
      order_id: orderId,
      order_amount: PLAN_CONFIG[plan].amount,
      order_currency: "INR",

      customer_details: {
        customer_id: req.user.id,
        customer_email: req.user.email,
        customer_phone: req.user.mobile,
      },

      order_meta: {
        return_url: `${process.env.FRONTEND_URL}/payment-success?order_id={order_id}`,
        plan: plan,
      },
    };

    const response = await cashfree.PGCreateOrder(request);
    res.json({
      order_id: orderId,
      payment_session_id: response.data.payment_session_id,
    });
  } catch (err) {
    next(err);
  }
});

router.post("/create-promo", async (req, res) => {
  const db = mongoose.connection.db;
  const { plan, duration_days } = req.body;

  if (!["BASIC", "ADVANCED", "AGENTIC"].includes(plan)) {
    return res.status(400).json({ detail: "Invalid plan. Choose BASIC, ADVANCED, or AGENTIC." });
  }

  const duration = parseInt(duration_days);
  if (!duration || duration <= 0) {
    return res.status(400).json({ detail: "Invalid duration_days." });
  }

  // Generate 8 character promo code
  const code = Array.from({ length: 8 }, () =>
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[Math.floor(Math.random() * 36)]
  ).join("");

  await db.collection("promo_codes").insertOne({
    code,
    plan,
    duration_days: duration,
    is_active: true,
    usage_limit: 1,
    used_count: 0,
    created_at: new Date().toISOString()
  });

  res.json({
    message: "Promo code successfully generated",
    code,
    plan,
    duration_days: duration
  });
});

router.post("/apply-code", auth, async (req, res) => {
  const db = mongoose.connection.db;
  const { code } = req.body;

  if (!code) {
    return res.status(400).json({ detail: "Promo code is required" });
  }

  const promo = await db.collection("promo_codes").findOne({
    code,
    is_active: true,
  });

  if (!promo) {
    return res.status(400).json({ detail: "Invalid or expired promo code" });
  }

  if (promo.usage_limit && promo.used_count >= promo.usage_limit) {
    return res.status(400).json({ detail: "Code exhausted" });
  }

  const start = new Date();
  const end = new Date();
  end.setDate(end.getDate() + promo.duration_days);

  // deactivate old subscriptions
  await db
    .collection("subscriptions")
    .updateMany(
      { user_id: req.user.id, status: "ACTIVE" },
      { $set: { status: "EXPIRED" } }
    );

  const subId = uuidv4();

  await db.collection("subscriptions").insertOne({
    id: subId,
    user_id: req.user.id,
    pharmacy_id: req.user.pharmacy_id,
    plan: promo.plan,
    status: "ACTIVE",
    start_date: start.toISOString(),
    end_date: end.toISOString(),
    metadata: { source: "PROMO" },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  await db.collection("users").updateOne(
    { id: req.user.id },
    {
      $set: {
        subscription_id: subId,
        subscription_plan: promo.plan,
        subscription_expiry: end.toISOString(),
      },
    }
  );

  // Try fetching the pharmacy name to log with the code
  const pharmacy = await db.collection("pharmacies").findOne({ id: req.user.pharmacy_id });
  const pharmacyName = pharmacy ? (pharmacy.name || pharmacy.pharmacy_name || "Unknown") : "Unknown";

  // Mark promo code as used permanently and save pharmacy details
  await db.collection("promo_codes").updateOne(
    { code },
    {
      $inc: { used_count: 1 },
      $set: {
        is_active: false,
        used_at: new Date().toISOString(),
        used_by_user_id: req.user.id,
        used_by_pharmacy_id: req.user.pharmacy_id,
        used_by_pharmacy_name: pharmacyName,
      }
    }
  );

  res.json({ message: "Subscription activated successfully via Promo Code" });
});

module.exports = router;
