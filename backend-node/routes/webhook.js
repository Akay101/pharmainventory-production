// Cashfree payment webhooks. Mounted with express.raw() in server.js so the
// signature is verified over the exact bytes Cashfree sent.
const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");
const verifySignature = require("../utils/verifyCashfreeSignature");
const orders = require("../services/billing/orders");

const HANDLED = new Set(["PAYMENT_SUCCESS_WEBHOOK", "PAYMENT_FAILED_WEBHOOK", "PAYMENT_USER_DROPPED_WEBHOOK"]);

router.post("/cashfree", async (req, res, next) => {
  try {
    if (!Buffer.isBuffer(req.body)) {
      return res.status(400).json({ detail: "Raw body required" });
    }
    const rawBody = req.body.toString("utf8");

    // 1. Signature first: nothing in the payload is trusted before this
    if (!verifySignature(rawBody, req.headers)) {
      return res.status(401).json({ detail: "Invalid signature" });
    }

    let body;
    try {
      body = JSON.parse(rawBody);
    } catch (e) {
      return res.status(400).json({ detail: "Invalid JSON" });
    }

    const db = mongoose.connection.db;
    const orderId = body?.data?.order?.order_id;

    await db.collection("payment_logs").insertOne({
      id: uuidv4(),
      order_id: orderId || null,
      type: body?.type || null,
      raw_payload: body,
      received_at: new Date(),
    });

    if (!orderId || !HANDLED.has(body.type)) {
      return res.json({ status: "ignored" });
    }

    // 2. The webhook only tells us *which* order changed; finalizeOrder
    //    re-reads the truth from Cashfree and applies it idempotently.
    const result = await orders.finalizeOrder(db, orderId, { source: `WEBHOOK:${body.type}` });
    await db.collection("payment_logs").updateOne(
      { order_id: orderId, type: body.type, processed_status: { $exists: false } },
      { $set: { processed_status: result.status } }
    );
    // Unknown orders (e.g. pre-redesign) are acknowledged so Cashfree stops retrying
    res.json({ status: result.status });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
