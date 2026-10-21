const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");
const verifySignature = require("../utils/verifyCashfreeSignature");
const cashfree = require("../services/cashfree");

const PLAN_BY_AMOUNT = {
  [parseInt(process.env.PLAN_BASIC_PRICE) || 20]: "BASIC",
  [parseInt(process.env.PLAN_ADV_PRICE) || 40]: "ADVANCED",
  [parseInt(process.env.PLAN_AGENTIC_PRICE) || 80]: "AGENTIC",
};

const PLAN_DURATION = {
  BASIC: 365,
  ADVANCED: 365,
  AGENTIC: 365,
};

router.post("/cashfree", async (req, res, next) => {
  try {
    const db = mongoose.connection.db;

    if (!Buffer.isBuffer(req.body)) {
      return res.status(400).json({ detail: "Raw body required" });
    }
    const rawBody = req.body.toString("utf8");

    // 🔐 1. VERIFY SIGNATURE before trusting anything in the payload
    if (!verifySignature(rawBody, req.headers)) {
      return res.status(401).json({ detail: "Invalid signature" });
    }

    let body;
    try {
      body = JSON.parse(rawBody);
    } catch (e) {
      return res.status(400).json({ detail: "Invalid JSON" });
    }

    const order_id = body?.data?.order?.order_id;
    if (!order_id || body.type !== "PAYMENT_SUCCESS_WEBHOOK") {
      return res.json({ status: "ignored" });
    }

    // 🧾 2. LOG EVERYTHING
    await db.collection("payment_logs").insertOne({
      id: uuidv4(),
      order_id,
      type: body.type,
      raw_payload: body,
      processed: false,
      created_at: new Date().toISOString(),
    });

    // 🔁 3. IDEMPOTENCY CHECK
    const existing = await db.collection("subscriptions").findOne({ order_id });
    if (existing) {
      return res.json({ status: "already_processed" });
    }

    // Never trust the webhook body for amounts/customer: re-fetch from Cashfree
    const { data } = await cashfree.PGFetchOrder(order_id);
    if (data?.order_status !== "PAID") {
      return res.json({ status: "not_paid" });
    }
    const { order_amount, customer_details } = data;
    const payment_id = body?.data?.payment?.cf_payment_id || null;

    const user = await db.collection("users").findOne({
      id: customer_details.customer_id,
    });

    if (!user) {
      return res.status(404).json({ detail: "User not found" });
    }

    // 🧠 4. PLAN RESOLUTION (STRICT)
    let plan = data.order_meta?.plan;

    if (!plan) {
      plan = PLAN_BY_AMOUNT[order_amount];
    }

    if (!plan) {
      return res.status(400).json({ detail: "Invalid plan mapping" });
    }

    // ⏳ 5. DATE CALCULATION
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + PLAN_DURATION[plan]);

    const subscriptionId = uuidv4();

    // 🔄 6. DEACTIVATE OLD SUBSCRIPTIONS
    await db.collection("subscriptions").updateMany(
      {
        user_id: user.id,
        status: "ACTIVE",
      },
      {
        $set: { status: "EXPIRED", updated_at: new Date().toISOString() },
      }
    );

    // 🧾 7. CREATE NEW SUBSCRIPTION
    const subscription = {
      id: subscriptionId,
      user_id: user.id,
      pharmacy_id: user.pharmacy_id,

      plan,
      status: "ACTIVE",

      start_date: startDate.toISOString(),
      end_date: endDate.toISOString(),

      payment_id,
      order_id,

      metadata: { source: "CASHFREE" },

      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    try {
      await db.collection("subscriptions").insertOne(subscription);
    } catch (err) {
      if (err.code === 11000) {
        return res.json({ status: "duplicate" });
      }
      throw err;
    }
    // ⚡ 8. UPDATE USER (FAST ACCESS)
    await db.collection("users").updateOne(
      { id: user.id },
      {
        $set: {
          subscription_id: subscriptionId,
          subscription_plan: plan,
          subscription_expiry: endDate.toISOString(),
        },
      }
    );

    // ✅ 9. MARK LOG PROCESSED
    await db
      .collection("payment_logs")
      .updateOne({ order_id }, { $set: { processed: true } });

    res.json({ status: "success" });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
