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

const PLAN_CODES = ["COMPLETE", "BASIC", "ADVANCED", "AGENTIC"];
const extendSchema = z.object({ days: z.number().int().min(1).max(3650), reason: z.string().trim().max(300).default("") });
const endSchema = z.object({ reason: z.string().trim().max(300).default("") });
const changePlanSchema = z.object({ plan: z.enum(PLAN_CODES), reason: z.string().trim().max(300).default("") });
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
      // Linked pharmacies (add-on) follow their account and are listed under it
      req.db.collection("pharmacies").find({ $or: [{ account_id: { $exists: false } }, { account_id: null }, { $expr: { $eq: ["$account_id", "$id"] } }] }, { projection: { _id: 0, id: 1, name: 1, location: 1, subscription: 1, created_at: 1, trial_claimed_at: 1 } }).toArray(),
      req.db
        .collection("users")
        .find({ is_primary_admin: true }, { projection: { _id: 0, pharmacy_id: 1, name: 1, email: 1, mobile: 1 } })
        .toArray(),
    ]);
    const ownerBy = new Map(owners.map((o) => [o.pharmacy_id, o]));
    // Paid add-ons per account: live counts and the soonest end date
    const addonRows = await req.db
      .collection("account_addons")
      .find({ kind: "PAID" }, { projection: { _id: 0, account_id: 1, type: 1, status: 1, ends_at: 1 } })
      .toArray();
    const addonsBy = new Map();
    const nowTs = Date.now();
    for (const a of addonRows) {
      const live = a.status === "ACTIVE" && a.ends_at && new Date(a.ends_at).getTime() > nowTs;
      const x = addonsBy.get(a.account_id) || { users: 0, pharmacies: 0, expired: 0, next_end: null };
      if (live) {
        if (a.type === "USER_SEAT") x.users++;
        else x.pharmacies++;
        if (!x.next_end || new Date(a.ends_at) < new Date(x.next_end)) x.next_end = a.ends_at;
      } else x.expired++;
      addonsBy.set(a.account_id, x);
    }
    let rows = pharmacies.map((p) => ({
      pharmacy_id: p.id,
      pharmacy_name: p.name || "Unnamed",
      location: p.location || "",
      owner: ownerBy.get(p.id) || null,
      created_at: p.created_at || null,
      trial_claimed_at: p.trial_claimed_at || null,
      subscription: subs.describe(p.subscription),
      addons: addonsBy.get(p.id) || null,
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
    const [ledger, orders, redemptions, addons, linked, invoices, team] = await Promise.all([
      req.db.collection("subscriptions").find({ pharmacy_id: id }, { projection: { _id: 0 } }).sort({ created_at: -1 }).limit(100).toArray(),
      req.db
        .collection("payment_orders")
        .find({ pharmacy_id: id }, { projection: { _id: 0, payment_session_id: 0 } })
        .sort({ created_at: -1 })
        .limit(50)
        .toArray(),
      req.db.collection("promo_redemptions").find({ pharmacy_id: id }, { projection: { _id: 0 } }).sort({ created_at: -1 }).limit(50).toArray(),
      req.db.collection("account_addons").find({ account_id: id }, { projection: { _id: 0 } }).sort({ type: 1, created_at: 1 }).toArray(),
      req.db.collection("pharmacies").find({ account_id: id, id: { $ne: id } }, { projection: { _id: 0, id: 1, name: 1, location: 1, subscription: 1, addon_id: 1, created_at: 1 } }).toArray(),
      req.db.collection("billing_invoices").find({ account_id: id }, { projection: { pdf: 0 } }).sort({ issued_at: -1 }).limit(100).toArray(),
      req.db.collection("users").find({ pharmacy_id: id }, { projection: { _id: 0, id: 1, name: 1, email: 1, role: 1, is_primary_admin: 1, seat_id: 1, seat_exempt: 1, disabled_at: 1 } }).toArray(),
    ]);
    const now = new Date();
    const live = (a) => a.status === "ACTIVE" && (a.kind === "INCLUDED" || (a.ends_at && new Date(a.ends_at) > now));
    const userName = Object.fromEntries(team.map((u) => [u.id, u.name]));
    const pharmacyName = Object.fromEntries(linked.map((p) => [p.id, p.name]));
    res.json({
      pharmacy_id: id,
      pharmacy_name: pharmacy.name,
      subscription: subs.describe(pharmacy.subscription),
      trial_claimed_at: pharmacy.trial_claimed_at || null,
      linked_to: pharmacy.account_id && pharmacy.account_id !== pharmacy.id ? pharmacy.account_id : null,
      ledger,
      orders,
      redemptions,
      addons: addons.map((a) => ({
        ...a,
        live: live(a),
        state: live(a) ? "ACTIVE" : a.status === "ENDED" ? "ENDED" : "EXPIRED",
        user_name: a.assigned_user_id ? userName[a.assigned_user_id] || null : null,
        pharmacy_name: a.pharmacy_id ? pharmacyName[a.pharmacy_id] || null : null,
      })),
      linked_pharmacies: linked.map((p) => ({ ...p, subscription: subs.describe(p.subscription) })),
      invoices: invoices.map((i) => ({ id: i.id, invoice_no: i.invoice_no, issued_at: i.issued_at, total_paise: i.total_paise, taxable_paise: i.taxable_paise, gst_paise: i.gst_paise, type: i.type, purpose: i.purpose, emailed_at: i.emailed_at || null })),
      team: team.map((u) => ({ ...u, seat: u.seat_id ? addons.find((a) => a.id === u.seat_id) || null : null })),
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

// POST /api/subscriptions/:pharmacyId/change-plan { plan, reason }
// Upgrade/downgrade the live plan; the end date stays the same.
router.post("/:pharmacyId/change-plan", async (req, res, next) => {
  try {
    const d = parseBody(changePlanSchema, req, res);
    if (!d) return;
    const pharmacy = await withPharmacy(req, res);
    if (!pharmacy) return;
    if (!subs.isActive(pharmacy.subscription)) {
      return res.status(400).json({ error: "No active plan or trial to change. Use Grant instead." });
    }
    const from = pharmacy.subscription.plan;
    const result = await subs.changePlan(req.db, { pharmacyId: pharmacy.id, planCode: d.plan, actor: actorOf(req), reason: d.reason });
    await audit(req, "SUBSCRIPTION_PLAN_CHANGED", pharmacy.id, { from, to: d.plan, reason: d.reason });
    res.json({ message: `Plan changed from ${from} to ${d.plan}`, subscription: result });
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

// ---- Add-ons (extra users, linked pharmacies) -----------------------------------

const addonExtendSchema = z.object({ days: z.number().int().min(1).max(3650), reason: z.string().trim().min(3, "Add a short reason").max(300) });
const addonEndSchema = z.object({ reason: z.string().trim().min(3, "Add a short reason").max(300) });
const seatGrantSchema = z.object({ count: z.number().int().min(1).max(20), days: z.number().int().min(1).max(3650), reason: z.string().trim().min(3, "Add a short reason").max(300) });

const findAddon = async (req, res) => {
  const addon = await req.db.collection("account_addons").findOne({ id: String(req.params.addonId), account_id: String(req.params.pharmacyId) });
  if (!addon) {
    res.status(404).json({ error: "Add-on not found" });
    return null;
  }
  if (addon.kind !== "PAID") {
    res.status(400).json({ error: "The plan's included user follows the plan. Extend the plan instead." });
    return null;
  }
  return addon;
};

// POST /api/subscriptions/:pharmacyId/addons/:addonId/extend { days, reason }
router.post("/:pharmacyId/addons/:addonId/extend", async (req, res, next) => {
  try {
    const d = parseBody(addonExtendSchema, req, res);
    if (!d) return;
    const addon = await findAddon(req, res);
    if (!addon) return;
    const now = new Date();
    const live = addon.status === "ACTIVE" && addon.ends_at && new Date(addon.ends_at) > now;
    const endsAt = new Date((live ? new Date(addon.ends_at) : now).getTime() + d.days * 24 * 60 * 60 * 1000);
    await req.db.collection("account_addons").updateOne(
      { id: addon.id },
      {
        $set: { status: "ACTIVE", ends_at: endsAt, updated_at: now, ...(live ? {} : { starts_at: now }) },
        $unset: { end_reason: "", ended_at: "" },
        $push: { renewals: { source_ref: `admin:${crypto.randomUUID()}`, days: d.days, at: now, actor: actorOf(req), reason: d.reason } },
      }
    );
    await subs.syncLinkedPharmacies(req.db, addon.account_id, now);
    await audit(req, "ADDON_EXTENDED", addon.id, { account_id: addon.account_id, type: addon.type, days: d.days, reason: d.reason, ends_at: endsAt });
    res.json({ message: `Extended by ${d.days} day(s), until ${endsAt.toLocaleDateString("en-IN")}`, ends_at: endsAt });
  } catch (err) {
    next(err);
  }
});

// POST /api/subscriptions/:pharmacyId/addons/:addonId/end { reason }
router.post("/:pharmacyId/addons/:addonId/end", async (req, res, next) => {
  try {
    const d = parseBody(addonEndSchema, req, res);
    if (!d) return;
    const addon = await findAddon(req, res);
    if (!addon) return;
    const now = new Date();
    await req.db.collection("account_addons").updateOne(
      { id: addon.id },
      { $set: { status: "ENDED", end_reason: "ADMIN", ended_at: now, ends_at: now, ended_by: actorOf(req), end_note: d.reason, updated_at: now } }
    );
    await subs.syncLinkedPharmacies(req.db, addon.account_id, now);
    await audit(req, "ADDON_ENDED", addon.id, { account_id: addon.account_id, type: addon.type, reason: d.reason });
    res.json({ message: addon.type === "PHARMACY" ? "Linked pharmacy switched off" : "User licence ended" });
  } catch (err) {
    next(err);
  }
});

// POST /api/subscriptions/:pharmacyId/addons/grant-seats { count, days, reason }
// Complimentary extra users (no payment, no invoice)
router.post("/:pharmacyId/addons/grant-seats", async (req, res, next) => {
  try {
    const d = parseBody(seatGrantSchema, req, res);
    if (!d) return;
    const pharmacy = await withPharmacy(req, res);
    if (!pharmacy) return;
    if (pharmacy.account_id && pharmacy.account_id !== pharmacy.id) return res.status(400).json({ error: "Open the account's main pharmacy" });
    const now = new Date();
    const rows = Array.from({ length: d.count }, () => ({
      id: crypto.randomUUID(),
      account_id: pharmacy.id,
      type: "USER_SEAT",
      kind: "PAID",
      cycle: "ADMIN",
      status: "ACTIVE",
      source_ref: `admin-grant:${crypto.randomUUID()}`,
      order_id: null,
      assigned_user_id: null,
      starts_at: now,
      ends_at: new Date(now.getTime() + d.days * 24 * 60 * 60 * 1000),
      renewals: [],
      granted_by: actorOf(req),
      grant_reason: d.reason,
      created_at: now,
      updated_at: now,
    }));
    await req.db.collection("account_addons").insertMany(rows);
    await audit(req, "ADDON_SEATS_GRANTED", pharmacy.id, { count: d.count, days: d.days, reason: d.reason });
    res.json({ message: `${d.count} user licence(s) granted for ${d.days} day(s)` });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
