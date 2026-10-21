// Promo codes: ACCESS (grant a plan for N days) and DISCOUNT (off at checkout).
// Usage is enforced by the main API; this only manages the codes.
const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const { z } = require("zod");
const { resolveDbEnv } = require("../db/connections");
const { audit, parseBody } = require("../services/audit");

router.use(resolveDbEnv);

const PLAN_CODES = ["BASIC", "ADVANCED", "AGENTIC"];
const CODE_RE = /^[A-Z0-9][A-Z0-9_-]{3,31}$/;

function generateRandomCode(length = 8) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < length; i++) out += chars[crypto.randomInt(chars.length)];
  return out;
}

const isoOrNull = z.string().datetime().nullable().optional();

const createSchema = z
  .object({
    type: z.enum(["ACCESS", "DISCOUNT"]).default("ACCESS"),
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(CODE_RE, "4-32 letters, numbers, - or _")
      .optional()
      .or(z.literal("")),
    plans: z.array(z.enum(PLAN_CODES)).default([]),
    // legacy single-plan field from older admin builds
    plan: z.enum(PLAN_CODES).optional(),
    duration_days: z.number().int().min(1).max(3650).optional(),
    discount_type: z.enum(["PERCENT", "FLAT"]).optional(),
    discount_value: z.number().positive().optional(),
    max_discount_rupees: z.number().positive().nullable().optional(),
    usage_limit: z.number().int().min(0).max(1_000_000).default(1), // 0 = unlimited
    valid_from: isoOrNull,
    valid_until: isoOrNull,
    notes: z.string().trim().max(300).nullable().optional(),
  })
  .superRefine((d, ctx) => {
    const plans = d.plans.length ? d.plans : d.plan ? [d.plan] : [];
    if (d.type === "ACCESS") {
      if (plans.length !== 1) ctx.addIssue({ code: "custom", path: ["plans"], message: "Access codes grant exactly one plan" });
      if (!d.duration_days) ctx.addIssue({ code: "custom", path: ["duration_days"], message: "Duration is required" });
    } else {
      if (!d.discount_type || !d.discount_value) {
        ctx.addIssue({ code: "custom", path: ["discount_value"], message: "Discount type and value are required" });
      }
      if (d.discount_type === "PERCENT" && d.discount_value > 100) {
        ctx.addIssue({ code: "custom", path: ["discount_value"], message: "Percentage can't exceed 100" });
      }
    }
    if (d.valid_from && d.valid_until && new Date(d.valid_until) <= new Date(d.valid_from)) {
      ctx.addIssue({ code: "custom", path: ["valid_until"], message: "Must be after the start" });
    }
  });

const statusOf = (p, now = new Date()) => {
  if (!p.is_active) return "INACTIVE";
  if (p.valid_until && new Date(p.valid_until) <= now) return "EXPIRED";
  if (p.valid_from && new Date(p.valid_from) > now) return "SCHEDULED";
  if (p.usage_limit && (p.used_count || 0) >= p.usage_limit) return "EXHAUSTED";
  return "ACTIVE";
};

// GET /api/promos
router.get("/", async (req, res, next) => {
  try {
    const { status, plan, search, type, source } = req.query;
    const promos = await req.db.collection("promo_codes").find({}).sort({ created_at: -1 }).limit(2000).toArray();
    const now = new Date();

    let rows = promos.map((p) => ({
      _id: p._id,
      code: p.code,
      type: p.type || "ACCESS",
      source: p.source || "ADMIN",
      plans: p.plans || (p.plan ? [p.plan] : []),
      plan: (p.plans && p.plans[0]) || p.plan || null,
      duration_days: p.duration_days || null,
      discount: p.discount
        ? {
            type: p.discount.type,
            value: p.discount.type === "FLAT" ? p.discount.value / 100 : p.discount.value,
            max_discount_rupees: p.discount.max_discount_paise ? p.discount.max_discount_paise / 100 : null,
          }
        : null,
      is_active: p.is_active,
      usage_limit: p.usage_limit ?? null,
      used_count: p.used_count || 0,
      valid_from: p.valid_from || null,
      valid_until: p.valid_until || null,
      locked_to_pharmacy_id: p.locked_to_pharmacy_id || null,
      notes: p.notes || null,
      created_by: p.created_by || null,
      created_at: p.created_at,
      used_at: p.used_at || null,
      used_by_pharmacy_name: p.used_by_pharmacy_name || null,
      used_by_pharmacy_id: p.used_by_pharmacy_id || null,
      status: statusOf(p, now),
    }));

    const summary = {
      total: rows.length,
      active: rows.filter((p) => p.status === "ACTIVE").length,
      redeemed: rows.filter((p) => p.used_count > 0).length,
      exhausted: rows.filter((p) => p.status === "EXHAUSTED").length,
      trials: rows.filter((p) => p.source === "TRIAL").length,
      discounts: rows.filter((p) => p.type === "DISCOUNT").length,
    };

    if (search) {
      const term = String(search).toLowerCase();
      rows = rows.filter(
        (p) => p.code.toLowerCase().includes(term) || (p.used_by_pharmacy_name || "").toLowerCase().includes(term)
      );
    }
    if (status && status !== "ALL") rows = rows.filter((p) => p.status === status);
    if (plan && plan !== "ALL") rows = rows.filter((p) => p.plans.length === 0 || p.plans.includes(plan));
    if (type && type !== "ALL") rows = rows.filter((p) => p.type === type);
    if (source && source !== "ALL") rows = rows.filter((p) => p.source === source);

    res.json({ env: req.dbEnv, summary, total: rows.length, promo_codes: rows });
  } catch (error) {
    next(error);
  }
});

// GET /api/promos/:code/redemptions
router.get("/:code/redemptions", async (req, res, next) => {
  try {
    const code = String(req.params.code).toUpperCase();
    const reds = await req.db.collection("promo_redemptions").find({ code }).sort({ created_at: -1 }).limit(500).toArray();
    const pharmIds = [...new Set(reds.map((r) => r.pharmacy_id).filter(Boolean))];
    const pharms = await req.db
      .collection("pharmacies")
      .find({ id: { $in: pharmIds } }, { projection: { id: 1, name: 1 } })
      .toArray();
    const names = new Map(pharms.map((p) => [p.id, p.name]));
    res.json({
      redemptions: reds.map((r) => ({
        pharmacy_id: r.pharmacy_id,
        pharmacy_name: names.get(r.pharmacy_id) || "Unknown",
        status: r.status,
        order_id: r.order_id,
        at: r.created_at,
      })),
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/promos/generate
router.post("/generate", async (req, res, next) => {
  try {
    const d = parseBody(createSchema, req, res);
    if (!d) return;

    const code = d.code || generateRandomCode(8);
    if (await req.db.collection("promo_codes").findOne({ code })) {
      return res.status(400).json({ error: `Promo code "${code}" already exists` });
    }
    const plans = d.plans.length ? d.plans : d.plan ? [d.plan] : [];

    const promo = {
      code,
      type: d.type,
      plans,
      duration_days: d.type === "ACCESS" ? d.duration_days : null,
      discount:
        d.type === "DISCOUNT"
          ? {
              type: d.discount_type,
              value: d.discount_type === "FLAT" ? Math.round(d.discount_value * 100) : d.discount_value,
              max_discount_paise: d.max_discount_rupees ? Math.round(d.max_discount_rupees * 100) : null,
            }
          : null,
      usage_limit: d.usage_limit || null,
      used_count: 0,
      per_account_limit: 1,
      is_active: true,
      source: "ADMIN",
      valid_from: d.valid_from ? new Date(d.valid_from) : null,
      valid_until: d.valid_until ? new Date(d.valid_until) : null,
      notes: d.notes || null,
      created_by: req.adminUser?.email || "Admin Panel",
      created_at: new Date().toISOString(),
    };

    try {
      await req.db.collection("promo_codes").insertOne(promo);
    } catch (err) {
      if (err.code === 11000) return res.status(400).json({ error: `Promo code "${code}" already exists` });
      throw err;
    }
    await audit(req, "PROMO_CREATED", code, { type: promo.type, plans, usage_limit: promo.usage_limit });
    res.status(201).json({ message: "Promo code generated successfully", promo });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/promos/:code/toggle
router.patch("/:code/toggle", async (req, res, next) => {
  try {
    const code = String(req.params.code).toUpperCase();
    const promo = await req.db.collection("promo_codes").findOne({ code });
    if (!promo) return res.status(404).json({ error: "Promo code not found" });
    const is_active = !promo.is_active;
    await req.db.collection("promo_codes").updateOne({ code }, { $set: { is_active } });
    await audit(req, is_active ? "PROMO_ACTIVATED" : "PROMO_DEACTIVATED", code);
    res.json({ message: `Promo code ${code} is now ${is_active ? "active" : "inactive"}`, is_active });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/promos/:code — only codes nobody has used; otherwise deactivate
router.delete("/:code", async (req, res, next) => {
  try {
    const code = String(req.params.code).toUpperCase();
    const promo = await req.db.collection("promo_codes").findOne({ code });
    if (!promo) return res.status(404).json({ error: "Promo code not found" });
    const used = await req.db.collection("promo_redemptions").countDocuments({ code });
    if (used || promo.used_count > 0) {
      return res.status(409).json({ error: "This code has been used, so it's kept for records. Deactivate it instead." });
    }
    await req.db.collection("promo_codes").deleteOne({ code });
    await audit(req, "PROMO_DELETED", code);
    res.json({ message: `Promo code ${code} deleted successfully` });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
