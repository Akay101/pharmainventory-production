// Plan prices, global offer and free-trial settings for the selected
// environment. The main API caches these for up to 30 seconds.
const express = require("express");
const router = express.Router();
const { z } = require("zod");
const { resolveDbEnv } = require("../db/connections");
const { requireSuperAdmin } = require("../middleware/auth");
const { audit, parseBody } = require("../services/audit");

router.use(resolveDbEnv);

const PLAN_CODES = ["BASIC", "ADVANCED", "AGENTIC"];
const CONFIG_ID = "global";

const planSchema = z.object({
  name: z.string().trim().min(2).max(40),
  description: z.string().trim().max(200).default(""),
  features: z.array(z.string().trim().min(1).max(80)).max(12),
  price_rupees: z.number().int().min(1).max(10_000_000),
  duration_days: z.number().int().min(1).max(3650).default(365),
  is_active: z.boolean(),
  highlight: z.boolean(),
});

const offerSchema = z
  .object({
    enabled: z.boolean(),
    label: z.string().trim().max(60).default(""),
    type: z.enum(["PERCENT", "FLAT"]),
    // PERCENT: 1-90; FLAT: rupees
    value: z.number().positive(),
    plans: z.array(z.enum(PLAN_CODES)).default([]),
    starts_at: z.string().datetime().nullable().optional(),
    ends_at: z.string().datetime().nullable().optional(),
  })
  .refine((o) => o.type !== "PERCENT" || o.value <= 90, { message: "Percentage offers are capped at 90%", path: ["value"] })
  .refine((o) => !o.starts_at || !o.ends_at || new Date(o.ends_at) > new Date(o.starts_at), {
    message: "End must be after start",
    path: ["ends_at"],
  });

const trialSchema = z.object({
  enabled: z.boolean(),
  days: z.number().int().min(1).max(60),
  plan: z.enum(["BEST", ...PLAN_CODES]),
});

// GET /api/pricing
router.get("/", async (req, res, next) => {
  try {
    const [plans, config] = await Promise.all([
      req.db.collection("plans").find({}, { projection: { _id: 0 } }).sort({ rank: 1 }).toArray(),
      req.db.collection("pricing_config").findOne({ _id: CONFIG_ID }),
    ]);
    res.json({
      env: req.dbEnv,
      initialized: plans.length > 0,
      plans: plans.map((p) => ({ ...p, price_rupees: p.price_paise / 100 })),
      offer: config?.offer
        ? { ...config.offer, value: config.offer.type === "FLAT" ? config.offer.value / 100 : config.offer.value }
        : { enabled: false, label: "", type: "PERCENT", value: 10, plans: [], starts_at: null, ends_at: null },
      trial: config?.trial || { enabled: true, days: 7, plan: "BEST" },
      updated_at: config?.updated_at || null,
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/pricing/plans/:code
router.put("/plans/:code", requireSuperAdmin, async (req, res, next) => {
  try {
    const code = String(req.params.code).toUpperCase();
    if (!PLAN_CODES.includes(code)) return res.status(400).json({ error: "Unknown plan" });
    const data = parseBody(planSchema, req, res);
    if (!data) return;
    const existing = await req.db.collection("plans").findOne({ code });
    if (!existing) {
      return res.status(409).json({ error: "Plans are not initialised in this environment. Run the billing migration first." });
    }
    const update = {
      name: data.name,
      description: data.description,
      features: data.features,
      price_paise: data.price_rupees * 100,
      duration_days: data.duration_days,
      is_active: data.is_active,
      highlight: data.highlight,
      updated_at: new Date(),
    };
    if (!update.is_active) {
      const activeCount = await req.db.collection("plans").countDocuments({ is_active: true, code: { $ne: code } });
      if (!activeCount) return res.status(400).json({ error: "At least one plan must stay active" });
    }
    await req.db.collection("plans").updateOne({ code }, { $set: update });
    await audit(req, "PRICING_PLAN_UPDATED", code, {
      before: { price_paise: existing.price_paise, is_active: existing.is_active, name: existing.name },
      after: { price_paise: update.price_paise, is_active: update.is_active, name: update.name },
    });
    res.json({ message: `${data.name} updated`, plan: { code, ...update, price_rupees: data.price_rupees } });
  } catch (err) {
    next(err);
  }
});

// PUT /api/pricing/offer
router.put("/offer", requireSuperAdmin, async (req, res, next) => {
  try {
    const data = parseBody(offerSchema, req, res);
    if (!data) return;
    const offer = {
      enabled: data.enabled,
      label: data.label,
      type: data.type,
      value: data.type === "FLAT" ? Math.round(data.value * 100) : data.value,
      plans: data.plans,
      starts_at: data.starts_at ? new Date(data.starts_at) : null,
      ends_at: data.ends_at ? new Date(data.ends_at) : null,
    };
    await req.db
      .collection("pricing_config")
      .updateOne({ _id: CONFIG_ID }, { $set: { offer, updated_at: new Date() } }, { upsert: true });
    await audit(req, "PRICING_OFFER_UPDATED", "offer", offer);
    res.json({ message: data.enabled ? "Offer saved and live" : "Offer saved (disabled)" });
  } catch (err) {
    next(err);
  }
});

// PUT /api/pricing/trial
router.put("/trial", requireSuperAdmin, async (req, res, next) => {
  try {
    const data = parseBody(trialSchema, req, res);
    if (!data) return;
    await req.db
      .collection("pricing_config")
      .updateOne({ _id: CONFIG_ID }, { $set: { trial: data, updated_at: new Date() } }, { upsert: true });
    await audit(req, "PRICING_TRIAL_UPDATED", "trial", data);
    res.json({ message: "Trial settings saved" });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
