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

      const safeFrontendUrl = process.env.FRONTEND_URL ? process.env.FRONTEND_URL.replace(/\/$/, "") : "";
      const safeBackendUrl = process.env.BACKEND_URL ? process.env.BACKEND_URL.replace(/\/$/, "") : "";

      const order_meta = {
        return_url: `${safeFrontendUrl}/payment-success?order_id={order_id}`,
        plan: plan,
      };

      if (safeBackendUrl) {
        order_meta.notify_url = `${safeBackendUrl}/api/webhook/cashfree`;
      }

      const request = {
        order_id: orderId,
        order_amount: PLAN_CONFIG[plan].amount,
        order_currency: "INR",

        customer_details: {
          customer_id: req.user.id,
          customer_email: req.user.email,
          customer_phone: req.user.mobile,
        },

        order_meta,
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

router.post("/create-promo", async (req, res, next) => {
  try {
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
  } catch (error) {
    next(error);
  }
});

router.post("/apply-code", auth, async (req, res, next) => {
  try {
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
    order_id: `promo_${code}_${subId}`, // Prevent duplicate key null error
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
  } catch (error) {
    next(error);
  }
});

router.post("/verify", auth, async (req, res, next) => {
  try {
    const db = mongoose.connection.db;
    const { order_id } = req.body;

    if (!order_id) {
      return res.status(400).json({ detail: "Order ID is required" });
    }

    const { Cashfree } = require("cashfree-pg");

    // 1. Check if already processed
    const existing = await db.collection("subscriptions").findOne({ order_id });
    if (existing) {
      return res.json({ status: "already_processed" });
    }

    // 2. Fetch payments from Cashfree directly to ensure security
    const verifyPayment = await cashfree.PGOrderFetchPayments("2023-08-01", order_id).catch(async () => {
         return await cashfree.PGOrderFetchPayments(order_id);
    });
    
    const paid = verifyPayment.data?.some((p) => p.payment_status === "SUCCESS");
    if (!paid) {
      return res.status(400).json({ detail: "Payment not successful or pending" });
    }

    // 3. Fetch order details to get plan and amount
    const orderDetails = await cashfree.PGFetchOrder("2023-08-01", order_id).catch(async () => {
         return await cashfree.PGFetchOrder(order_id);
    });

    const data = orderDetails.data;
    const payment = verifyPayment.data.find(p => p.payment_status === "SUCCESS");
    
    // Calculate Plan
    const PLAN_BY_AMOUNT = {
      [parseInt(process.env.PLAN_BASIC_PRICE) || 20]: "BASIC",
      [parseInt(process.env.PLAN_ADV_PRICE) || 40]: "ADVANCED",
      [parseInt(process.env.PLAN_AGENTIC_PRICE) || 80]: "AGENTIC",
    };

    let plan = data.order_meta?.plan || PLAN_BY_AMOUNT[data.order_amount];
    
    if (!plan) {
      return res.status(400).json({ detail: "Could not resolve plan from amount or metadata" });
    }

    const PLAN_DURATION = {
      BASIC: 365,
      ADVANCED: 365,
      AGENTIC: 365,
    };

    // 4. Time Setup
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + PLAN_DURATION[plan]);

    const subscriptionId = uuidv4();

    // 5. Deactivate previous subs
    await db.collection("subscriptions").updateMany(
      { user_id: req.user.id, status: "ACTIVE" },
      { $set: { status: "EXPIRED", updated_at: new Date().toISOString() } }
    );

    // 6. Create new active sub using upsert to avoid duplicate key crash on race conditions
    const subscription = {
      id: subscriptionId,
      user_id: req.user.id,
      pharmacy_id: req.user.pharmacy_id,
      plan,
      status: "ACTIVE",
      start_date: startDate.toISOString(),
      end_date: endDate.toISOString(),
      payment_id: payment.cf_payment_id || "",
      order_id,
      metadata: { source: "CASHFREE_VERIFY" },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await db.collection("subscriptions").updateOne(
      { order_id },
      { $setOnInsert: subscription },
      { upsert: true }
    );

    // 7. Update user context
    await db.collection("users").updateOne(
      { id: req.user.id },
      {
        $set: {
          subscription_id: subscriptionId,
          subscription_plan: plan,
          subscription_expiry: endDate.toISOString(),
        },
      }
    );

    res.json({ status: "success", plan });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
