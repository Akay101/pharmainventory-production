// Pharmacy subscriptions: who is on trial / paid / expired, with controls to
// extend, end or grant plans. All writes go through the shared state machine
// (services/billing/subscriptions.js) and are audited.
const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const { z } = require("zod");
const { resolveDbEnv } = require("../db/connections");
const subs = require("../services/billing/subscriptions");
const { audit, actorOf, parseBody } = require("../services/audit");

router.use(resolveDbEnv);

const PLAN_CODES = ["BASIC", "ADVANCED", "AGENTIC"];
const extendSchema = z.object({ days: z.number().int().min(1).max(3650), reason: z.string().trim().max(300).default("") });
const endSchema = z.object({ reason: z.string().trim().max(300).default("") });
const grantSchema = z.object({
  plan: z.enum(PLAN_CODES),
  days: z.number().int().min(1).max(3650),
  reason: z.string().trim().min(3, "Add a short reason").max(300),
});

// GET /api/subscriptions?status=TRIAL|ACTIVE|EXPIRED|NONE|ALL&search=
router.get("/", async (req, res, next) => {
  try {
    const { status = "ALL", search } = req.query;
    const [pharmacies, owners] = await Promise.all([
      req.db.collection("pharmacies").find({}, { projection: { _id: 0, id: 1, name: 1, location: 1, subscription: 1, created_at: 1, trial_claimed_at: 1 } }).toArray(),
      req.db
        .collection("users")
        .find({ is_primary_admin: true }, { projection: { _id: 0, pharmacy_id: 1, name: 1, email: 1, mobile: 1 } })
        .toArray(),
    ]);
    const ownerBy = new Map(owners.map((o) => [o.pharmacy_id, o]));
    let rows = pharmacies.map((p) => ({
      pharmacy_id: p.id,
      pharmacy_name: p.name || "Unnamed",
      location: p.location || "",
      owner: ownerBy.get(p.id) || null,
      created_at: p.created_at || null,
      trial_claimed_at: p.trial_claimed_at || null,
      subscription: subs.describe(p.subscription),
    }));

    const summary = rows.reduce(
      (acc, r) => ({ ...acc, [r.subscription.status]: (acc[r.subscription.status] || 0) + 1 }),
      { TRIAL: 0, ACTIVE: 0, EXPIRED: 0, NONE: 0 }
    );

    if (status !== "ALL") rows = rows.filter((r) => r.subscription.status === status);
    if (search) {
      const t = String(search).toLowerCase();
      rows = rows.filter(
        (r) =>
          r.pharmacy_name.toLowerCase().includes(t) ||
          (r.owner?.email || "").toLowerCase().includes(t) ||
          (r.owner?.name || "").toLowerCase().includes(t)
      );
    }
    // Soonest-ending first: what needs attention
    rows.sort((a, b) => {
      const ea = a.subscription.ends_at ? new Date(a.subscription.ends_at).getTime() : Infinity;
      const eb = b.subscription.ends_at ? new Date(b.subscription.ends_at).getTime() : Infinity;
      return ea - eb;
    });
    res.json({ env: req.dbEnv, summary, total: rows.length, pharmacies: rows });
  } catch (err) {
    next(err);
  }
});

// GET /api/subscriptions/:pharmacyId — ledger, orders, code redemptions
router.get("/:pharmacyId", async (req, res, next) => {
  try {
    const id = String(req.params.pharmacyId);
    const pharmacy = await req.db.collection("pharmacies").findOne({ id }, { projection: { _id: 0 } });
    if (!pharmacy) return res.status(404).json({ error: "Pharmacy not found" });
    const [ledger, orders, redemptions] = await Promise.all([
      req.db.collection("subscriptions").find({ pharmacy_id: id }, { projection: { _id: 0 } }).sort({ created_at: -1 }).limit(100).toArray(),
      req.db
        .collection("payment_orders")
        .find({ pharmacy_id: id }, { projection: { _id: 0, payment_session_id: 0 } })
        .sort({ created_at: -1 })
        .limit(50)
        .toArray(),
      req.db.collection("promo_redemptions").find({ pharmacy_id: id }, { projection: { _id: 0 } }).sort({ created_at: -1 }).limit(50).toArray(),
    ]);
    res.json({
      pharmacy_id: id,
      pharmacy_name: pharmacy.name,
      subscription: subs.describe(pharmacy.subscription),
      trial_claimed_at: pharmacy.trial_claimed_at || null,
      ledger,
      orders,
      redemptions,
    });
  } catch (err) {
    next(err);
  }
});

const withPharmacy = async (req, res) => {
  const pharmacy = await req.db.collection("pharmacies").findOne({ id: String(req.params.pharmacyId) });
  if (!pharmacy) {
    res.status(404).json({ error: "Pharmacy not found" });
    return null;
  }
  return pharmacy;
};

// POST /api/subscriptions/:pharmacyId/extend { days, reason }
router.post("/:pharmacyId/extend", async (req, res, next) => {
  try {
    const d = parseBody(extendSchema, req, res);
    if (!d) return;
    const pharmacy = await withPharmacy(req, res);
    if (!pharmacy) return;
    if (!pharmacy.subscription?.plan) return res.status(400).json({ error: "No plan to extend. Use Grant instead." });
    const result = await subs.extend(req.db, { pharmacyId: pharmacy.id, days: d.days, actor: actorOf(req), reason: d.reason });
    await audit(req, "SUBSCRIPTION_EXTENDED", pharmacy.id, { days: d.days, reason: d.reason, ends_at: result.ends_at });
    res.json({ message: `Extended by ${d.days} day(s)`, subscription: result });
  } catch (err) {
    next(err);
  }
});

// POST /api/subscriptions/:pharmacyId/end { reason }
router.post("/:pharmacyId/end", async (req, res, next) => {
  try {
    const d = parseBody(endSchema, req, res);
    if (!d) return;
    const pharmacy = await withPharmacy(req, res);
    if (!pharmacy) return;
    if (!subs.isActive(pharmacy.subscription)) return res.status(400).json({ error: "Nothing active to end" });
    const result = await subs.endNow(req.db, { pharmacyId: pharmacy.id, actor: actorOf(req), reason: d.reason });
    await audit(req, "SUBSCRIPTION_ENDED", pharmacy.id, { reason: d.reason, kind: pharmacy.subscription.kind });
    res.json({ message: "Subscription ended", subscription: result });
  } catch (err) {
    next(err);
  }
});

// POST /api/subscriptions/:pharmacyId/grant { plan, days, reason }
router.post("/:pharmacyId/grant", async (req, res, next) => {
  try {
    const d = parseBody(grantSchema, req, res);
    if (!d) return;
    const pharmacy = await withPharmacy(req, res);
    if (!pharmacy) return;
    const plan = await req.db.collection("plans").findOne({ code: d.plan });
    const result = await subs.activate(req.db, {
      pharmacyId: pharmacy.id,
      plan: { code: d.plan, price_paise: plan?.price_paise || 0, duration_days: d.days },
      days: d.days,
      kind: "ADMIN",
      sourceRef: `admin-grant:${pharmacy.id}:${crypto.randomUUID()}`,
      actor: actorOf(req),
      meta: { reason: d.reason },
    });
    await audit(req, "SUBSCRIPTION_GRANTED", pharmacy.id, { plan: d.plan, days: d.days, reason: d.reason });
    res.json({ message: `${d.plan} granted for ${d.days} day(s)`, subscription: result.subscription });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
