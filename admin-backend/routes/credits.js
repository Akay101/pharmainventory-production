// AI credits for the selected environment: settings (prices, margin, plan
// allowances, packs, model prices), every pharmacy's wallet with grant /
// remove / daily-allowance controls, and what AI costs vs what it earns.
// The main API caches settings for up to 30 seconds. All writes are audited.
const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const { z } = require("zod");
const { resolveDbEnv } = require("../db/connections");
const { requireSuperAdmin } = require("../middleware/auth");
const { audit, actorOf, parseBody } = require("../services/audit");
const C = require("../services/credits/config");
const W = require("../services/credits/wallet");

router.use(resolveDbEnv);

const PLAN_CODES = ["BASIC", "ADVANCED", "AGENTIC"];
const money = z.number().finite();
const priceRow = z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), input: money.min(0), cached: money.min(0), output: money.min(0) });

const configSchema = z.object({
  credit_value_paise: z.number().int().min(1).max(10000),
  margin_percent: z.number().min(0).max(500),
  usd_inr: z.number().min(10).max(500),
  gst_percent: z.number().min(0).max(40),
  min_charge_credits: z.number().min(0).max(100),
  ai_mode: z.enum(C.AI_MODES),
  plan_budget_inr: z.object(Object.fromEntries(PLAN_CODES.map((p) => [p, z.number().min(0).max(1_000_000)]))),
  budget_daily_cap_factor: z.number().min(1).max(30),
  daily_credits: z.object(Object.fromEntries(PLAN_CODES.map((p) => [p, z.number().min(0).max(100000)]))).optional(),
  trial_daily_credits: z.number().min(0).max(100000),
  free_mode: z.object({ enabled: z.boolean(), messages_per_day: z.number().int().min(0).max(1000) }),
  packs: z
    .array(
      z.object({
        id: z.string().trim().regex(/^[a-z0-9_-]{2,30}$/i, "Pack id: letters, numbers, - or _"),
        label: z.string().trim().min(2).max(30),
        price_paise: z.number().int().min(100).max(10_000_000),
        credits: z.number().min(1).max(10_000_000).nullable(),
        bonus_credits: z.number().min(0).max(10_000_000).default(0),
        active: z.boolean().default(true),
      })
    )
    .min(1)
    .max(8)
    .refine((p) => new Set(p.map((x) => x.id)).size === p.length, { message: "Pack ids must be unique" }),
  model_prices: z.record(z.string().min(3).max(80), z.array(priceRow).min(1).max(6)),
});

// GET /api/credits/config: settings in effect (defaults filled in) + the defaults
router.get("/config", async (req, res, next) => {
  try {
    const doc = await req.db.collection("credit_config").findOne({ _id: "global" });
    const config = C.merge(doc);
    res.json({
      env: req.dbEnv,
      config: { ...config, _id: undefined },
      saved: !!doc,
      updated_at: doc?.updated_at || null,
      updated_by: doc?.updated_by || null,
      pack_credits: Object.fromEntries(config.packs.map((p) => [p.id, C.packCredits(config, p)])),
      example: { cost_inr: 10, credits: C.creditsForInr(config, 10) / 1000 },
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/credits/config
router.put("/config", requireSuperAdmin, async (req, res, next) => {
  try {
    const data = parseBody(configSchema, req, res);
    if (!data) return;
    const before = await req.db.collection("credit_config").findOne({ _id: "global" });
    await req.db
      .collection("credit_config")
      .updateOne({ _id: "global" }, { $set: { ...data, updated_at: new Date(), updated_by: actorOf(req).admin_email } }, { upsert: true });
    await audit(req, "CREDITS_CONFIG_UPDATE", "credit_config", { before: before ? { ...before, _id: undefined } : null, after: data });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Usage and spend per pharmacy over a window
async function windowStats(db, since) {
  const rows = await db
    .collection(W.LEDGER)
    .aggregate([
      { $match: { created_at: { $gte: since }, status: "DONE" } },
      {
        $group: {
          _id: { p: "$pharmacy_id", t: "$type" },
          milli: { $sum: "$amount_milli" },
          cost: { $sum: { $ifNull: ["$meta.cost_inr", 0] } },
          n: { $sum: 1 },
        },
      },
    ])
    .toArray();
  const by = {};
  for (const r of rows) {
    const p = (by[r._id.p] = by[r._id.p] || { used_credits: 0, cost_inr: 0, free_cost_inr: 0, purchased_credits: 0, requests: 0, free_requests: 0 });
    if (r._id.t === "USAGE") {
      p.used_credits += -r.milli / 1000;
      p.cost_inr += r.cost;
      p.requests += r.n;
    } else if (r._id.t === "FREE_USAGE") {
      p.free_cost_inr += r.cost;
      p.free_requests += r.n;
    } else if (r._id.t === "PURCHASE") p.purchased_credits += r.milli / 1000;
  }
  return by;
}

// GET /api/credits/wallets?search=&days=30
router.get("/wallets", async (req, res, next) => {
  try {
    const days = Math.min(365, Math.max(1, parseInt(req.query.days, 10) || 30));
    const cfg = C.merge(await req.db.collection("credit_config").findOne({ _id: "global" }));
    const [pharmacies, owners, wallets, stats] = await Promise.all([
      req.db.collection("pharmacies").find({}, { projection: { _id: 0, id: 1, name: 1, location: 1, subscription: 1 } }).toArray(),
      req.db.collection("users").find({ is_primary_admin: true }, { projection: { _id: 0, pharmacy_id: 1, name: 1, email: 1 } }).toArray(),
      req.db.collection(W.WALLETS).find({}, { projection: { _id: 0 } }).toArray(),
      windowStats(req.db, new Date(Date.now() - days * 864e5)),
    ]);
    const ownerBy = new Map(owners.map((o) => [o.pharmacy_id, o]));
    const walletBy = new Map(wallets.map((w) => [w.pharmacy_id, w]));
    const today = W.todayIst();
    let rows = pharmacies.map((p) => {
      const w = walletBy.get(p.id) || null;
      // Today's allowance as it will apply (wallets refill lazily on first use)
      const allowance = W.allowanceCredits(cfg, p, w);
      const fresh = w && w.daily?.date === today;
      return {
        pharmacy_id: p.id,
        pharmacy_name: p.name || "Unnamed",
        location: p.location || "",
        owner: ownerBy.get(p.id) || null,
        plan: p.subscription?.plan || null,
        plan_kind: p.subscription?.kind || null,
        plan_active: !!p.subscription?.plan && new Date(p.subscription.ends_at) > new Date() && p.subscription.status !== "EXPIRED",
        balance: W.toCredits(w?.balance_milli || 0),
        daily_allowance: allowance,
        daily_remaining: fresh ? W.toCredits(Math.max(0, w.daily.remaining_milli)) : allowance,
        daily_override: w?.daily_override_credits ?? null,
        free_used_today: w?.free?.date === today ? w.free.used || 0 : 0,
        // Our AI cost on what the plan includes, this plan year, against its budget
        plan_year: (() => {
          const b = W.planBudget(cfg, p.subscription, w);
          return b ? { budget_inr: Math.round(b.budget * 100) / 100, spent_inr: Math.round(b.spent * 100) / 100, ends: b.end, days_left: b.daysLeft } : null;
        })(),
        stats: stats[p.id] || { used_credits: 0, cost_inr: 0, free_cost_inr: 0, purchased_credits: 0, requests: 0, free_requests: 0 },
      };
    });
    if (req.query.search) {
      const t = String(req.query.search).toLowerCase();
      rows = rows.filter((r) => r.pharmacy_name.toLowerCase().includes(t) || (r.owner?.email || "").toLowerCase().includes(t));
    }
    rows.sort((a, b) => b.stats.used_credits - a.stats.used_credits || a.pharmacy_name.localeCompare(b.pharmacy_name));
    res.json({ env: req.dbEnv, days, rows });
  } catch (err) {
    next(err);
  }
});

const loadPharmacy = async (req, res) => {
  const p = await req.db.collection("pharmacies").findOne({ id: req.params.pharmacyId }, { projection: { _id: 0, id: 1, name: 1, subscription: 1 } });
  if (!p) res.status(404).json({ error: "Pharmacy not found" });
  return p;
};

// GET /api/credits/wallets/:pharmacyId: wallet + ledger
router.get("/wallets/:pharmacyId", async (req, res, next) => {
  try {
    const p = await loadPharmacy(req, res);
    if (!p) return;
    const cfg = C.merge(await req.db.collection("credit_config").findOne({ _id: "global" }));
    const w = await W.getWallet(req.db, cfg, p);
    const ledger = await req.db
      .collection(W.LEDGER)
      .find({ pharmacy_id: p.id, status: { $ne: "PENDING" } }, { projection: { _id: 0 } })
      .sort({ created_at: -1 })
      .limit(150)
      .toArray();
    res.json({
      pharmacy: { id: p.id, name: p.name, plan: p.subscription?.plan || null },
      wallet: W.view(w),
      totals: Object.fromEntries(Object.entries(w.totals || {}).map(([k, v]) => [k.replace("_milli", ""), W.toCredits(v)])),
      ledger: ledger.map((r) => ({
        id: r.id,
        type: r.type,
        credits: W.toCredits(r.amount_milli),
        task: r.task || null,
        engine: r.engine || null,
        note: r.note || r.meta?.label || "",
        cost_inr: r.meta?.cost_inr ?? null,
        models: (r.meta?.models || []).map((m) => m.model),
        fallback: !!r.meta?.fallback,
        actor: r.actor?.admin_email || null,
        balance_after: r.balance_after_milli !== undefined ? W.toCredits(r.balance_after_milli) : null,
        created_at: r.created_at,
      })),
    });
  } catch (err) {
    next(err);
  }
});

const adjustSchema = z.object({ credits: z.number().positive().max(1_000_000), reason: z.string().trim().min(3, "Add a short reason").max(300) });

// POST /api/credits/wallets/:pharmacyId/grant
router.post("/wallets/:pharmacyId/grant", requireSuperAdmin, async (req, res, next) => {
  try {
    const data = parseBody(adjustSchema, req, res);
    if (!data) return;
    const p = await loadPharmacy(req, res);
    if (!p) return;
    const actor = actorOf(req);
    const r = await W.credit(req.db, p.id, { milli: W.toMilli(data.credits), type: "ADMIN_GRANT", ref: `admin_grant:${crypto.randomUUID()}`, actor, note: data.reason });
    await audit(req, "CREDITS_GRANT", p.id, { credits: data.credits, reason: data.reason });
    res.json({ ok: true, wallet: W.view(r.wallet) });
  } catch (err) {
    next(err);
  }
});

// POST /api/credits/wallets/:pharmacyId/remove (never below zero)
router.post("/wallets/:pharmacyId/remove", requireSuperAdmin, async (req, res, next) => {
  try {
    const data = parseBody(adjustSchema, req, res);
    if (!data) return;
    const p = await loadPharmacy(req, res);
    if (!p) return;
    const r = await W.remove(req.db, p.id, { milli: W.toMilli(data.credits), actor: actorOf(req), note: data.reason });
    await audit(req, "CREDITS_REMOVE", p.id, { requested: data.credits, removed: W.toCredits(r.removed), reason: data.reason });
    res.json({ ok: true, removed: W.toCredits(r.removed), wallet: W.view(r.wallet) });
  } catch (err) {
    if (/balance changed/.test(err.message)) return res.status(409).json({ error: err.message });
    next(err);
  }
});

const dailySchema = z.object({ credits: z.number().min(0).max(100000).nullable(), reason: z.string().trim().max(300).default("") });

// PUT /api/credits/wallets/:pharmacyId/daily { credits | null = plan default }
router.put("/wallets/:pharmacyId/daily", requireSuperAdmin, async (req, res, next) => {
  try {
    const data = parseBody(dailySchema, req, res);
    if (!data) return;
    const p = await loadPharmacy(req, res);
    if (!p) return;
    const cfg = C.merge(await req.db.collection("credit_config").findOne({ _id: "global" }));
    const w = await W.setDailyOverride(req.db, cfg, p, data.credits, actorOf(req));
    await audit(req, "CREDITS_DAILY_OVERRIDE", p.id, { credits: data.credits, reason: data.reason });
    res.json({ ok: true, wallet: W.view(w) });
  } catch (err) {
    next(err);
  }
});

// GET /api/credits/summary?days=30: what AI cost us vs what it brought in
router.get("/summary", async (req, res, next) => {
  try {
    const days = Math.min(365, Math.max(1, parseInt(req.query.days, 10) || 30));
    const since = new Date(Date.now() - days * 864e5);
    const cfg = C.merge(await req.db.collection("credit_config").findOne({ _id: "global" }));
    const [byType, byTaskEngine, byDay, packRevenue] = await Promise.all([
      req.db.collection(W.LEDGER).aggregate([{ $match: { created_at: { $gte: since }, status: "DONE" } }, { $group: { _id: "$type", milli: { $sum: "$amount_milli" }, cost: { $sum: { $ifNull: ["$meta.cost_inr", 0] } }, n: { $sum: 1 } } }]).toArray(),
      req.db
        .collection(W.LEDGER)
        .aggregate([
          { $match: { created_at: { $gte: since }, status: "DONE", type: { $in: ["USAGE", "FREE_USAGE"] } } },
          { $group: { _id: { task: "$task", engine: "$engine", type: "$type" }, milli: { $sum: "$amount_milli" }, cost: { $sum: { $ifNull: ["$meta.cost_inr", 0] } }, n: { $sum: 1 } } },
        ])
        .toArray(),
      req.db
        .collection(W.LEDGER)
        .aggregate([
          { $match: { created_at: { $gte: since }, status: "DONE", type: { $in: ["USAGE", "FREE_USAGE"] } } },
          { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$created_at", timezone: "Asia/Kolkata" } }, cost: { $sum: { $ifNull: ["$meta.cost_inr", 0] } }, milli: { $sum: "$amount_milli" }, n: { $sum: 1 } } },
          { $sort: { _id: 1 } },
        ])
        .toArray(),
      req.db.collection("payment_orders").aggregate([{ $match: { purpose: "CREDITS", status: "PAID", paid_at: { $gte: since } } }, { $group: { _id: null, paise: { $sum: "$amount_paise" }, n: { $sum: 1 } } }]).toArray(),
    ]);
    const t = Object.fromEntries(byType.map((r) => [r._id, r]));
    const usedCredits = -(t.USAGE?.milli || 0) / 1000;
    const creditValue = cfg.credit_value_paise / 100;
    res.json({
      env: req.dbEnv,
      days,
      ai_cost_inr: (t.USAGE?.cost || 0) + (t.FREE_USAGE?.cost || 0),
      charged_cost_inr: t.USAGE?.cost || 0,
      free_cost_inr: t.FREE_USAGE?.cost || 0,
      credits_used: usedCredits,
      credits_used_value_inr: usedCredits * creditValue,
      requests: (t.USAGE?.n || 0) + (t.FREE_USAGE?.n || 0),
      free_requests: t.FREE_USAGE?.n || 0,
      daily_credits_given: (t.DAILY?.milli || 0) / 1000,
      credits_purchased: (t.PURCHASE?.milli || 0) / 1000,
      credits_granted: (t.ADMIN_GRANT?.milli || 0) / 1000,
      pack_revenue_inr: (packRevenue[0]?.paise || 0) / 100,
      pack_orders: packRevenue[0]?.n || 0,
      by_task: byTaskEngine.map((r) => ({ task: r._id.task, engine: r._id.engine, free: r._id.type === "FREE_USAGE", requests: r.n, credits: -r.milli / 1000, cost_inr: r.cost, avg_credits: r.n ? -r.milli / 1000 / r.n : 0 })),
      by_day: byDay.map((r) => ({ day: r._id, cost_inr: r.cost, credits: -r.milli / 1000, requests: r.n })),
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
