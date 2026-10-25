// Subscription purchase, trial and promo endpoints.
// Authenticated but deliberately NOT behind requireSubscription: lapsed
// pharmacies must be able to pay.
const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const { z } = require("zod");
const { rateLimit } = require("express-rate-limit");
const { auth } = require("../middleware/auth");
const { sendBillingError, BillingError } = require("../services/billing/errors");
const pricing = require("../services/billing/pricing");
const orders = require("../services/billing/orders");
const promos = require("../services/billing/promos");
const subscriptions = require("../services/billing/subscriptions");
const { trialEligibility, startFreeTrial } = require("../services/billing/trial");
const credits = require("../services/credits");

const planSchema = z.object({
  plan: z.enum(pricing.PLAN_CODES),
  code: z.string().trim().max(32).optional().or(z.literal("")),
});
const codeSchema = z.object({ code: z.string().trim().min(4).max(32) });

const parse = (schema, body) => {
  const r = schema.safeParse(body);
  if (!r.success) throw new BillingError("INVALID_REQUEST", "Invalid request");
  return r.data;
};

const perUser = (limit) =>
  rateLimit({
    windowMs: 60 * 1000,
    limit,
    keyGenerator: (req) => `u:${req.user.id}`,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { detail: "Too many requests. Please slow down." },
  });

const loadPharmacy = async (req) => {
  const pharmacy = await mongoose.connection.db.collection("pharmacies").findOne({ id: req.user.pharmacy_id });
  if (!pharmacy) throw new BillingError("NO_PHARMACY", "Pharmacy not found", 404);
  return pharmacy;
};

// GET /api/billing/status — current plan, trial eligibility
router.get("/status", auth, async (req, res, next) => {
  try {
    const db = mongoose.connection.db;
    const pharmacy = await loadPharmacy(req);
    const trial = await trialEligibility(db, { pharmacy, user: req.user });
    res.json({
      subscription: subscriptions.describe(pharmacy.subscription),
      trial,
      can_manage: req.user.role === "ADMIN",
    });
  } catch (err) {
    sendBillingError(res, err, next);
  }
});

// POST /api/billing/quote { plan, code? }
router.post("/quote", auth, perUser(30), async (req, res, next) => {
  try {
    const { plan, code } = parse(planSchema, req.body);
    const pharmacy = await loadPharmacy(req);
    res.json(await orders.quote(mongoose.connection.db, { pharmacy, planCode: plan, promoCode: code || null }));
  } catch (err) {
    sendBillingError(res, err, next);
  }
});

// POST /api/billing/checkout { plan, code? }
router.post("/checkout", auth, perUser(10), async (req, res, next) => {
  try {
    const { plan, code } = parse(planSchema, req.body);
    const pharmacy = await loadPharmacy(req);
    res.json(
      await orders.createCheckout(mongoose.connection.db, { user: req.user, pharmacy, planCode: plan, promoCode: code || null })
    );
  } catch (err) {
    sendBillingError(res, err, next);
  }
});

// POST /api/billing/orders/:orderId/confirm — return page polling
router.post("/orders/:orderId/confirm", auth, perUser(30), async (req, res, next) => {
  try {
    const orderId = String(req.params.orderId || "");
    if (!/^[A-Za-z0-9_-]{3,64}$/.test(orderId)) throw new BillingError("INVALID_REQUEST", "Invalid order");
    const db = mongoose.connection.db;
    const order = await db.collection("payment_orders").findOne(
      { order_id: orderId, pharmacy_id: req.user.pharmacy_id },
      { projection: { _id: 0, order_id: 1 } }
    );
    if (!order) throw new BillingError("ORDER_NOT_FOUND", "Order not found", 404);
    const result = await orders.finalizeOrder(db, orderId, { source: "RETURN_PAGE" });
    const pharmacy = await loadPharmacy(req);
    const extra = {};
    if (result.purpose === "CREDITS") {
      const cfg = await credits.config.getConfig(db);
      extra.credit_wallet = credits.wallet.view(await credits.wallet.getWallet(db, cfg, pharmacy));
    }
    res.json({ ...result, subscription: subscriptions.describe(pharmacy.subscription), ...extra });
  } catch (err) {
    sendBillingError(res, err, next);
  }
});

// POST /api/billing/free-trial
router.post("/free-trial", auth, perUser(5), async (req, res, next) => {
  try {
    const pharmacy = await loadPharmacy(req);
    res.json(await startFreeTrial(mongoose.connection.db, { user: req.user, pharmacy }));
  } catch (err) {
    sendBillingError(res, err, next);
  }
});

// POST /api/billing/redeem { code } — ACCESS codes
router.post("/redeem", auth, perUser(10), async (req, res, next) => {
  try {
    if (req.user.role !== "ADMIN") {
      throw new BillingError("OWNER_ONLY", "Only the pharmacy admin can manage the subscription", 403);
    }
    const { code } = parse(codeSchema, req.body);
    const result = await promos.redeemAccessCode(mongoose.connection.db, code, {
      pharmacyId: req.user.pharmacy_id,
      userId: req.user.id,
    });
    res.json({ plan: result.promo.plans[0], days: result.promo.duration_days, subscription: result.subscription });
  } catch (err) {
    sendBillingError(res, err, next);
  }
});

module.exports = router;
