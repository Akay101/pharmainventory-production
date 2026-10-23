// AI credits for the app
//   GET  /api/credits            balance, packs, engines, what tasks cost
//   GET  /api/credits/history    ledger (?before=ISO&limit=)
//   POST /api/credits/checkout   { pack_id } -> Cashfree session
//   PUT  /api/credits/engine     { engine: "pro"|"swift" } the user's assistant engine
// Authenticated, not behind requireSubscription: the balance stays visible.
const express = require("express");
const mongoose = require("mongoose");
const { z } = require("zod");
const { rateLimit } = require("express-rate-limit");
const { auth } = require("../middleware/auth");
const credits = require("../services/credits");
const orders = require("../services/billing/orders");
const { sendBillingError, BillingError } = require("../services/billing/errors");

const router = express.Router();
const db = () => mongoose.connection.db;

const perUser = (limit) =>
  rateLimit({ windowMs: 60 * 1000, limit, keyGenerator: (req) => `u:${req.user.id}`, standardHeaders: "draft-8", legacyHeaders: false, message: { detail: "Too many requests. Please slow down." } });

const loadPharmacy = async (req) => {
  const p = await db().collection("pharmacies").findOne({ id: req.user.pharmacy_id }, { projection: { _id: 0, id: 1, name: 1, subscription: 1 } });
  if (!p) throw new BillingError("NO_PHARMACY", "Pharmacy not found", 404);
  return p;
};

router.get("/", auth, async (req, res, next) => {
  try {
    const cfg = await credits.config.getConfig(db());
    const pharmacy = await loadPharmacy(req);
    const w = await credits.wallet.getWallet(db(), cfg, pharmacy);
    const est = await credits.policy.estimates(db());
    const me = await db().collection("users").findOne({ id: req.user.id }, { projection: { _id: 0, assistant_engine: 1 } });
    // Engines turned on in admin; `ready` says whether one can run here right now
    const engines = Object.values(credits.policy.ENGINES)
      .filter((e) => cfg.engines?.[e.id]?.enabled !== false)
      .map((e) => ({ ...e, ready: credits.policy.engineReady(cfg, e.id) }));
    res.json({
      wallet: credits.wallet.view(w),
      plan_daily: credits.wallet.allowanceCredits(cfg, pharmacy, w),
      engine: credits.policy.pickEngine(cfg, me?.assistant_engine || "pro"),
      engines,
      tasks: Object.entries(credits.policy.TASKS).map(([id, t]) => ({ id, ...t, credits: Object.fromEntries(engines.map((e) => [e.id, est[e.id]?.[id] ?? null])) })),
      packs: (cfg.packs || [])
        .filter((p) => p.active !== false)
        .map((p) => ({ id: p.id, label: p.label, price_paise: p.price_paise, credits: credits.config.packCredits(cfg, p), bonus_credits: p.bonus_credits || 0 })),
      credit_value_paise: cfg.credit_value_paise,
      gst_percent: cfg.gst_percent,
      free_mode: { enabled: !!cfg.free_mode?.enabled, messages_per_day: Number(cfg.free_mode?.messages_per_day) || 0 },
      can_buy: req.user.role === "ADMIN",
    });
  } catch (err) {
    next(err);
  }
});

router.get("/history", auth, async (req, res, next) => {
  try {
    const before = req.query.before && !isNaN(Date.parse(req.query.before)) ? req.query.before : null;
    res.json({ items: await credits.wallet.history(db(), req.user.pharmacy_id, { limit: Math.min(100, parseInt(req.query.limit, 10) || 40), before }) });
  } catch (err) {
    next(err);
  }
});

const packSchema = z.object({ pack_id: z.string().trim().min(1).max(40) });
router.post("/checkout", auth, perUser(10), async (req, res, next) => {
  try {
    const parsed = packSchema.safeParse(req.body);
    if (!parsed.success) throw new BillingError("INVALID_REQUEST", "Pick a credit pack");
    const pharmacy = await loadPharmacy(req);
    res.json(await orders.createCreditCheckout(db(), { user: req.user, pharmacy, packId: parsed.data.pack_id }));
  } catch (err) {
    sendBillingError(res, err, next);
  }
});

const engineSchema = z.object({ engine: z.enum(["pro", "swift"]) });
router.put("/engine", auth, perUser(30), async (req, res, next) => {
  try {
    const parsed = engineSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ detail: "Unknown engine" });
    if (!credits.policy.engineReady(await credits.config.getConfig(db()), parsed.data.engine)) {
      return res.status(400).json({ detail: `${credits.policy.ENGINES[parsed.data.engine].name} isn't available right now` });
    }
    await db().collection("users").updateOne({ id: req.user.id }, { $set: { assistant_engine: parsed.data.engine } });
    res.json({ engine: parsed.data.engine });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
