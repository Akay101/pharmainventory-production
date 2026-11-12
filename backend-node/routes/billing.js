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
const addons = require("../services/billing/addons");
const invoices = require("../services/billing/invoices");
const receipts = require("../services/billing/receipts");
const gst = require("../services/billing/gst");
const account = require("../services/account");

// Buyer details for the GST invoice (validated again in the service)
const billingSchema = z
  .object({
    legal_name: z.string().trim().max(120).optional(),
    gstin: z.string().trim().max(20).optional().or(z.literal("")).nullable(),
    state_code: z.string().trim().regex(/^\d{2}$/).optional(),
    address: z.string().trim().max(300).optional(),
  })
  .strict()
  .optional()
  .nullable();

const planSchema = z.object({
  plan: z.enum(pricing.PLAN_CODES),
  code: z.string().trim().max(32).optional().or(z.literal("")),
  billing: billingSchema,
});

const pharmacyDetailsSchema = z
  .object({
    name: z.string().max(80),
    location: z.string().max(200),
    license_no: z.string().max(60).optional().nullable(),
    contact: z.string().max(20).optional().nullable(),
    gst_no: z.string().max(20).optional().nullable(),
  })
  .strict();
const addonSchema = z
  .object({
    kind: z.enum(addons.KINDS),
    cycle: z.enum(addons.CYCLES).optional(),
    quantity: z.number().int().min(1).max(50).optional(),
    pharmacy: pharmacyDetailsSchema.optional(),
    addon_id: z.string().max(80).optional(),
    billing: billingSchema,
  })
  .strict();
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

// The account's main pharmacy holds the plan and add-ons, whichever
// pharmacy the user is working in
const loadPharmacy = async (req) => {
  const pharmacy = await mongoose.connection.db.collection("pharmacies").findOne({ id: req.account_id || req.user.pharmacy_id });
  if (!pharmacy) throw new BillingError("NO_PHARMACY", "Pharmacy not found", 404);
  return pharmacy;
};

const requireManager = (req) => {
  if (req.user.role !== "ADMIN") throw new BillingError("OWNER_ONLY", "Only the pharmacy admin can see billing", 403);
};

const addonView = (a) => ({
  id: a.id,
  type: a.type,
  kind: a.kind,
  cycle: a.cycle,
  status: account.addonActive(a) ? "ACTIVE" : a.status === "ENDED" ? "ENDED" : "EXPIRED",
  starts_at: a.starts_at,
  ends_at: a.ends_at,
  pharmacy_id: a.pharmacy_id || null,
  assigned_user_id: a.assigned_user_id || null,
});

// GET /api/billing/status — current plan, trial eligibility
router.get("/status", auth, async (req, res, next) => {
  try {
    const db = mongoose.connection.db;
    const pharmacy = await loadPharmacy(req);
    const trial = await trialEligibility(db, { pharmacy, user: req.user });
    const out = {
      subscription: subscriptions.describe(pharmacy.subscription),
      trial,
      can_manage: req.user.role === "ADMIN",
    };
    if (req.user.role === "ADMIN") {
      const cfg = await pricing.getAddonConfig(db);
      const seats = await account.seatSummary(db, pharmacy.id, cfg.included_users);
      const rows = await account.listAddons(db, pharmacy.id);
      const linked = await account.accountPharmacies(db, pharmacy.id);
      const users = await db.collection("users").find({ pharmacy_id: pharmacy.id }, { projection: { _id: 0, id: 1, name: 1 } }).toArray();
      const nameOf = Object.fromEntries(users.map((u) => [u.id, u.name]));
      const pharmacyName = Object.fromEntries(linked.map((p) => [p.id, p.name]));
      out.addons = rows
        .filter((a) => a.kind === "PAID")
        .map((a) => ({ ...addonView(a), user_name: a.assigned_user_id ? nameOf[a.assigned_user_id] || null : null, pharmacy_name: a.pharmacy_id ? pharmacyName[a.pharmacy_id] || null : null }));
      out.seats = { included: seats.included, purchased: seats.purchased, total: seats.total, used: seats.used, free: seats.free };
      out.billing_profile = pharmacy.billing_profile || null;
      out.pharmacy_gstin = pharmacy.gst_no || null;
    }
    res.json(out);
  } catch (err) {
    sendBillingError(res, err, next);
  }
});

// Plans can't be priced or bought until prices are announced (early access)
async function requirePricesLive() {
  const display = await pricing.getDisplay(mongoose.connection.db);
  if (display.hide_prices) {
    throw new BillingError("PRICES_NOT_LAUNCHED", "Plans aren't on sale yet. Activate DavaDesk with your early access code.", 403);
  }
}

// POST /api/billing/quote { plan, code? }
router.post("/quote", auth, perUser(30), async (req, res, next) => {
  try {
    const { plan, code } = parse(planSchema, req.body);
    await requirePricesLive();
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
    await requirePricesLive();
    const pharmacy = await loadPharmacy(req);
    res.json(
      await orders.createCheckout(mongoose.connection.db, { user: req.user, pharmacy, planCode: plan, promoCode: code || null, billing: req.body.billing || null })
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
      { order_id: orderId, $or: [{ pharmacy_id: req.user.pharmacy_id }, { account_id: req.account_id || req.user.pharmacy_id }] },
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
      pharmacyId: req.account_id || req.user.pharmacy_id,
      userId: req.user.id,
    });
    res.json({ plan: result.promo.plans[0], days: result.promo.duration_days, subscription: result.subscription });
  } catch (err) {
    sendBillingError(res, err, next);
  }
});

// ---- Add-ons -----------------------------------------------------------------------------

// POST /api/billing/addons/quote { kind, cycle?, quantity?, pharmacy?, addon_id? }
router.post("/addons/quote", auth, perUser(30), async (req, res, next) => {
  try {
    const body = parse(addonSchema, req.body);
    await requirePricesLive();
    const pharmacy = await loadPharmacy(req);
    res.json(await addons.quote(mongoose.connection.db, { user: req.user, pharmacy, req: body }));
  } catch (err) {
    sendBillingError(res, err, next);
  }
});

// POST /api/billing/addons/checkout { ...as quote, billing }
router.post("/addons/checkout", auth, perUser(10), async (req, res, next) => {
  try {
    const body = parse(addonSchema, req.body);
    await requirePricesLive();
    const pharmacy = await loadPharmacy(req);
    res.json(await addons.createCheckout(mongoose.connection.db, { user: req.user, pharmacy, req: body, billing: body.billing || null }));
  } catch (err) {
    sendBillingError(res, err, next);
  }
});

// GET /api/billing/gst-states — for the invoice details form
router.get("/gst-states", auth, (req, res) => {
  res.set("Cache-Control", "public, max-age=86400");
  res.json({ states: Object.entries(gst.STATES).map(([code, name]) => ({ code, name })) });
});

// ---- Invoices --------------------------------------------------------------------------

router.get("/invoices", auth, async (req, res, next) => {
  try {
    requireManager(req);
    const rows = await mongoose.connection.db
      .collection(invoices.INVOICES)
      .find({ account_id: req.account_id }, { projection: { pdf: 0 } })
      .sort({ issued_at: -1 })
      .limit(200)
      .toArray();
    res.json({ invoices: rows.map(invoices.publicView) });
  } catch (err) {
    sendBillingError(res, err, next);
  }
});

const findInvoice = async (req) => {
  const id = String(req.params.id || "");
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new BillingError("INVOICE_NOT_FOUND", "Invoice not found", 404);
  const inv = await mongoose.connection.db.collection(invoices.INVOICES).findOne({ id, account_id: req.account_id }, { projection: { pdf: 0 } });
  if (!inv) throw new BillingError("INVOICE_NOT_FOUND", "Invoice not found", 404);
  return inv;
};

router.get("/invoices/:id/pdf", auth, perUser(30), async (req, res, next) => {
  try {
    requireManager(req);
    const inv = await findInvoice(req);
    const pdf = await invoices.ensurePdf(mongoose.connection.db, inv);
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="DavaDesk-Invoice-${inv.invoice_no.replace(/\//g, "-")}.pdf"`,
      "Cache-Control": "private, no-store",
    });
    res.send(pdf);
  } catch (err) {
    sendBillingError(res, err, next);
  }
});

router.post("/invoices/:id/email", auth, perUser(3), async (req, res, next) => {
  try {
    requireManager(req);
    const inv = await findInvoice(req);
    const ok = await receipts.resendInvoice(mongoose.connection.db, inv, { to: req.user.email, by: "OWNER" });
    if (!ok) throw new BillingError("EMAIL_FAILED", "We couldn't send the email. Please try again shortly.", 503);
    res.json({ message: `Invoice sent to ${req.user.email}` });
  } catch (err) {
    sendBillingError(res, err, next);
  }
});

module.exports = router;
