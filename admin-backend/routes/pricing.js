// Plan prices, global offer and free-trial settings for the selected
// environment. The main API caches these for up to 30 seconds.
const express = require("express");
const router = express.Router();
const { z } = require("zod");
const { resolveDbEnv } = require("../db/connections");
const { requireSuperAdmin } = require("../middleware/auth");
const { audit, parseBody } = require("../services/audit");

router.use(resolveDbEnv);

const PLAN_CODES = ["COMPLETE", "BASIC", "ADVANCED", "AGENTIC"];
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

const gstSchema = z.object({ gst_percent: z.number().min(0).max(28) });

const paise = (max) => z.number().int().min(100).max(max);
const addonsSchema = z.object({
  included_users: z.number().int().min(0).max(20),
  user_seat: z.object({
    enabled: z.boolean(),
    monthly_rupees: z.number().min(1).max(100000),
    yearly_rupees: z.number().min(1).max(1000000),
    max_per_order: z.number().int().min(1).max(50).default(20),
  }),
  pharmacy: z.object({
    enabled: z.boolean(),
    yearly_rupees: z.number().min(1).max(1000000),
    max_linked: z.number().int().min(1).max(100).default(20),
  }),
});

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const invoiceSchema = z.object({
  prefix: z.string().trim().regex(/^[A-Z]{1,4}$/, "1-4 capital letters"),
  seller_name: z.string().trim().min(2).max(120),
  seller_address: z.string().trim().min(5).max(300),
  seller_gstin: z.string().trim().toUpperCase().regex(GSTIN_RE, "Invalid GSTIN"),
  seller_email: z.string().trim().email().max(120).or(z.literal("")),
  seller_phone: z.string().trim().max(20).default(""),
  sac: z.string().trim().regex(/^\d{6}$/, "SAC is 6 digits"),
  sac_description: z.string().trim().min(3).max(120),
});

const DEFAULT_ADDONS = { included_users: 1, user_seat: { enabled: true, monthly_paise: 7900, yearly_paise: 79000, max_per_order: 20 }, pharmacy: { enabled: true, yearly_paise: 200000, max_linked: 20 } };
const DEFAULT_INVOICE = {
  prefix: "DD",
  seller_name: "DavaDesk",
  seller_address: "Uttar Pradesh, India",
  seller_gstin: "09AAMCD7026N1Z2",
  seller_email: "support@davadesk.in",
  seller_phone: "",
  sac: "998314",
  sac_description: "Software as a service (SaaS) subscription",
};

const displaySchema = z.object({
  hide_prices: z.boolean(),
  label: z.string().trim().min(2).max(40).default("Launching soon"),
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
      // Same default as the app: hidden until an admin publishes prices
      display: { hide_prices: true, label: "Launching soon", ...(config?.display || {}) },
      gst_percent: config?.gst_percent ?? 18,
      addons: (() => {
        const a = config?.addons || {};
        const seat = { ...DEFAULT_ADDONS.user_seat, ...(a.user_seat || {}) };
        const ph = { ...DEFAULT_ADDONS.pharmacy, ...(a.pharmacy || {}) };
        return {
          included_users: Number.isInteger(a.included_users) ? a.included_users : DEFAULT_ADDONS.included_users,
          user_seat: { enabled: seat.enabled, monthly_rupees: seat.monthly_paise / 100, yearly_rupees: seat.yearly_paise / 100, max_per_order: seat.max_per_order },
          pharmacy: { enabled: ph.enabled, yearly_rupees: ph.yearly_paise / 100, max_linked: ph.max_linked },
        };
      })(),
      invoice: { ...DEFAULT_INVOICE, ...(config?.invoice || {}) },
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

// PUT /api/pricing/display — hide plan prices on the app's upgrade page
// (early access: plans show "₹XXX · Launching soon" and can't be bought)
router.put("/display", requireSuperAdmin, async (req, res, next) => {
  try {
    const data = parseBody(displaySchema, req, res);
    if (!data) return;
    await req.db
      .collection("pricing_config")
      .updateOne({ _id: CONFIG_ID }, { $set: { display: data, updated_at: new Date() } }, { upsert: true });
    await audit(req, "PRICING_DISPLAY_UPDATED", "display", data);
    res.json({ message: data.hide_prices ? "Prices hidden on the upgrade page" : "Prices visible on the upgrade page" });
  } catch (err) {
    next(err);
  }
});

// PUT /api/pricing/gst — GST % added on top of plan and add-on prices
router.put("/gst", requireSuperAdmin, async (req, res, next) => {
  try {
    const data = parseBody(gstSchema, req, res);
    if (!data) return;
    await req.db.collection("pricing_config").updateOne({ _id: CONFIG_ID }, { $set: { gst_percent: data.gst_percent, updated_at: new Date() } }, { upsert: true });
    await audit(req, "PRICING_GST_UPDATED", "gst", data);
    res.json({ message: `GST set to ${data.gst_percent}%` });
  } catch (err) {
    next(err);
  }
});

// PUT /api/pricing/addons — included users, extra user and linked pharmacy prices
router.put("/addons", requireSuperAdmin, async (req, res, next) => {
  try {
    const data = parseBody(addonsSchema, req, res);
    if (!data) return;
    const addons = {
      included_users: data.included_users,
      user_seat: { enabled: data.user_seat.enabled, monthly_paise: Math.round(data.user_seat.monthly_rupees * 100), yearly_paise: Math.round(data.user_seat.yearly_rupees * 100), max_per_order: data.user_seat.max_per_order },
      pharmacy: { enabled: data.pharmacy.enabled, yearly_paise: Math.round(data.pharmacy.yearly_rupees * 100), max_linked: data.pharmacy.max_linked },
    };
    const before = await req.db.collection("pricing_config").findOne({ _id: CONFIG_ID }, { projection: { addons: 1 } });
    await req.db.collection("pricing_config").updateOne({ _id: CONFIG_ID }, { $set: { addons, updated_at: new Date() } }, { upsert: true });
    await audit(req, "PRICING_ADDONS_UPDATED", "addons", { before: before?.addons || null, after: addons });
    res.json({ message: "Add-on prices saved" });
  } catch (err) {
    next(err);
  }
});

// PUT /api/pricing/invoice — seller details and SAC printed on GST invoices
router.put("/invoice", requireSuperAdmin, async (req, res, next) => {
  try {
    const data = parseBody(invoiceSchema, req, res);
    if (!data) return;
    await req.db.collection("pricing_config").updateOne({ _id: CONFIG_ID }, { $set: { invoice: data, updated_at: new Date() } }, { upsert: true });
    await audit(req, "PRICING_INVOICE_UPDATED", "invoice", data);
    res.json({ message: "Invoice details saved. New invoices use them." });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
