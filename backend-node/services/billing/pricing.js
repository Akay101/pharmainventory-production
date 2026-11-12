// Plan catalogue and server-side price computation.
//
// Prices live in the `plans` collection (managed from the admin panel) in
// paise. The client never sends an amount: every checkout is re-quoted here.
const { BillingError } = require("./errors");

// COMPLETE is the single launch plan; the older three stay for existing
// subscribers and are switched off for new purchases (see ensureLaunchCatalogue).
const PLAN_CODES = ["COMPLETE", "BASIC", "ADVANCED", "AGENTIC"];
const LAUNCH_PLAN = "COMPLETE";
const CONFIG_ID = "global";
const PLANS_CACHE_MS = 30 * 1000;

const rupeesFromEnv = (key, fallback) => {
  const n = parseInt(process.env[key], 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

// Seed values, used only when the collection is empty (see migration script).
const launchPlan = () => ({
  code: LAUNCH_PLAN,
  name: "DavaDesk Complete",
  rank: 10,
  price_paise: rupeesFromEnv("PLAN_COMPLETE_PRICE", 3999) * 100,
  duration_days: 365,
  description: "Everything DavaDesk does, for one pharmacy, for a year.",
  features: [
    "One login session across the platform",
    "Desktop app for offline billing, with free automatic cloud sync",
    "1 pharmacist user login with access management",
    "20 complimentary AI credits every day",
    "Billing, purchases, inventory, expiry and returns",
    "Customers, suppliers, credit ledgers and reports",
    "AI bill scanning, assistant and WhatsApp sharing",
    "Every other feature, with free updates",
  ],
  highlight: true,
  is_active: true,
});

const defaultPlans = () => [
  launchPlan(),
  {
    code: "BASIC",
    name: "Basic",
    rank: 1,
    price_paise: rupeesFromEnv("PLAN_BASIC_PRICE", 2499) * 100,
    duration_days: 365,
    description: "Essential tools for small pharmacies to streamline operations.",
    features: [
      "Up to 1,000 Invoices per year",
      "Standard Inventory Management",
      "Basic Analytics Dashboard",
      "Email Support",
    ],
    highlight: false,
    is_active: false,
  },
  {
    code: "ADVANCED",
    name: "Advanced",
    rank: 2,
    price_paise: rupeesFromEnv("PLAN_ADV_PRICE", 5499) * 100,
    duration_days: 365,
    description: "Advanced tracking and metrics for growing pharmacy businesses.",
    features: [
      "Unlimited Invoices",
      "Real-time Inventory Alerts",
      "Advanced Sales Forecasting",
      "Priority 24/7 Support",
      "Multi-user Access",
    ],
    highlight: false,
    is_active: false,
  },
  {
    code: "AGENTIC",
    name: "Agentic",
    rank: 3,
    price_paise: rupeesFromEnv("PLAN_AGENTIC_PRICE", 7499) * 100,
    duration_days: 365,
    description: "AI-powered automation for maximum efficiency and growth.",
    features: [
      "Everything in Advanced",
      "AI Inventory Predictions",
      "Automated Supplier Reordering",
      "Custom Data Integrations",
      "Dedicated Account Manager",
    ],
    highlight: false,
    is_active: false,
  },
];

// Add-ons, priced before GST. A seat lets one more pharmacist user sign in; a
// pharmacy add-on links one more pharmacy to the account.
const defaultAddons = () => ({
  included_users: 1,
  user_seat: { enabled: true, monthly_paise: 7900, yearly_paise: 79000, max_per_order: 20 },
  pharmacy: { enabled: true, yearly_paise: 200000, max_linked: 20 },
});

// Seller details printed on GST invoices (editable from the admin panel)
const defaultInvoiceConfig = () => ({
  prefix: "DD",
  seller_name: process.env.INVOICE_SELLER_NAME || "DavaDesk",
  seller_address: process.env.INVOICE_SELLER_ADDRESS || "Uttar Pradesh, India",
  seller_gstin: process.env.INVOICE_SELLER_GSTIN || "09AAMCD7026N1Z2",
  seller_email: process.env.INVOICE_SELLER_EMAIL || "support@davadesk.in",
  seller_phone: process.env.INVOICE_SELLER_PHONE || "",
  // SAC 998314: IT design and development services (software as a service)
  sac: "998314",
  sac_description: "Software as a service (SaaS) subscription",
});

const defaultPricingConfig = () => ({
  _id: CONFIG_ID,
  offer: {
    enabled: false,
    label: "",
    type: "PERCENT", // PERCENT | FLAT (paise)
    value: 0,
    plans: [], // empty = all plans
    starts_at: null,
    ends_at: null,
  },
  trial: { enabled: true, days: 7, plan: "BEST" }, // BEST = highest-ranked active plan
  // Before prices are announced (early access): plans show without prices and
  // can't be bought; access codes still work. Toggled from the admin panel.
  display: { hide_prices: true, label: "Launching soon" },
  // Prices above are before GST; GST is added on the amount after discounts
  gst_percent: 18,
  addons: defaultAddons(),
  invoice: defaultInvoiceConfig(),
  updated_at: new Date(),
});

let plansCache = { at: 0, plans: null, config: null };
const invalidatePricingCache = () => {
  plansCache = { at: 0, plans: null, config: null };
};

async function loadCatalogue(db) {
  if (plansCache.plans && Date.now() - plansCache.at < PLANS_CACHE_MS) return plansCache;
  const [plans, config] = await Promise.all([
    db.collection("plans").find({}, { projection: { _id: 0 } }).sort({ rank: 1 }).toArray(),
    db.collection("pricing_config").findOne({ _id: CONFIG_ID }),
  ]);
  plansCache = {
    at: Date.now(),
    plans: plans.length ? plans : defaultPlans(),
    config: config || defaultPricingConfig(),
  };
  return plansCache;
}

const isOfferLive = (offer, now = new Date()) =>
  !!offer &&
  offer.enabled &&
  offer.value > 0 &&
  (!offer.starts_at || new Date(offer.starts_at) <= now) &&
  (!offer.ends_at || new Date(offer.ends_at) > now);

const offerAppliesTo = (offer, planCode) =>
  !offer.plans || offer.plans.length === 0 || offer.plans.includes(planCode);

// Discount in paise for a percent/flat rule on `amount`, never more than amount.
const discountFor = (type, value, amount, capPaise) => {
  let d = type === "PERCENT" ? Math.round((amount * Math.min(value, 100)) / 100) : Math.round(value);
  if (capPaise && capPaise > 0) d = Math.min(d, capPaise);
  return Math.max(0, Math.min(d, amount));
};

async function getPlan(db, code) {
  const { plans } = await loadCatalogue(db);
  return plans.find((p) => p.code === code) || null;
}

async function getBestPlan(db) {
  const { plans } = await loadCatalogue(db);
  return [...plans].filter((p) => p.is_active).sort((a, b) => b.rank - a.rank)[0] || null;
}

async function getTrialConfig(db) {
  const { config } = await loadCatalogue(db);
  return { ...defaultPricingConfig().trial, ...(config.trial || {}) };
}

/**
 * Price breakdown for one plan with the live global offer and an optional
 * discount promo applied (promo validation happens in promos.js).
 */
const clampGst = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 28 ? n : 18;
};
const gstOn = (taxablePaise, gstPercent) => Math.round((taxablePaise * clampGst(gstPercent)) / 100);

function priceBreakdown(plan, offer, promo, now = new Date(), gstPercent = 18) {
  const base = plan.price_paise;
  let offerDiscount = 0;
  let appliedOffer = null;
  if (isOfferLive(offer, now) && offerAppliesTo(offer, plan.code)) {
    offerDiscount = discountFor(offer.type, offer.value, base);
    appliedOffer = { label: offer.label, type: offer.type, value: offer.value, discount_paise: offerDiscount, ends_at: offer.ends_at || null };
  }
  const afterOffer = base - offerDiscount;

  let promoDiscount = 0;
  let appliedPromo = null;
  if (promo) {
    promoDiscount = discountFor(promo.discount.type, promo.discount.value, afterOffer, promo.discount.max_discount_paise);
    appliedPromo = { code: promo.code, type: promo.discount.type, value: promo.discount.value, discount_paise: promoDiscount };
  }

  const taxable = afterOffer - promoDiscount;
  const gst = gstOn(taxable, gstPercent);
  return {
    base_paise: base,
    offer: appliedOffer,
    promo: appliedPromo,
    taxable_paise: taxable,
    gst_percent: clampGst(gstPercent),
    gst_paise: gst,
    // What is charged: the taxable value plus GST
    amount_paise: taxable + gst,
  };
}

async function getDisplay(db) {
  const { config } = await loadCatalogue(db);
  return { ...defaultPricingConfig().display, ...(config.display || {}) };
}

// Public catalogue for the upgrade page. While prices are hidden no amount
// leaves the server (not even in the API response).
async function getPublicPlans(db) {
  const { plans, config } = await loadCatalogue(db);
  const now = new Date();
  const display = { ...defaultPricingConfig().display, ...(config.display || {}) };
  if (display.hide_prices) {
    return {
      prices_hidden: true,
      launch_label: display.label || "Launching soon",
      plans: plans
        .filter((p) => p.is_active)
        .map((p) => ({ code: p.code, name: p.name, rank: p.rank, description: p.description, features: p.features || [], highlight: !!p.highlight, duration_days: p.duration_days })),
      offer: null,
      trial: (() => {
        const t = { ...defaultPricingConfig().trial, ...(config.trial || {}) };
        return { enabled: !!t.enabled, days: t.days };
      })(),
    };
  }
  return {
    prices_hidden: false,
    plans: plans
      .filter((p) => p.is_active)
      .map((p) => ({
        code: p.code,
        name: p.name,
        rank: p.rank,
        description: p.description,
        features: p.features || [],
        highlight: !!p.highlight,
        duration_days: p.duration_days,
        ...priceBreakdown(p, config.offer, null, now, config.gst_percent ?? 18),
      })),
    gst_percent: clampGst(config.gst_percent ?? 18),
    addons: publicAddons(config),
    offer: isOfferLive(config.offer, now)
      ? { label: config.offer.label, type: config.offer.type, value: config.offer.value, plans: config.offer.plans || [], ends_at: config.offer.ends_at || null }
      : null,
    trial: (() => {
      const t = { ...defaultPricingConfig().trial, ...(config.trial || {}) };
      return { enabled: !!t.enabled, days: t.days };
    })(),
  };
}

async function requireActivePlan(db, code) {
  if (!PLAN_CODES.includes(code)) throw new BillingError("INVALID_PLAN", "Invalid plan");
  const plan = await getPlan(db, code);
  if (!plan || !plan.is_active) throw new BillingError("PLAN_UNAVAILABLE", "This plan is not available right now");
  return plan;
}

async function getGstPercent(db) {
  const { config } = await loadCatalogue(db);
  return clampGst(config.gst_percent ?? 18);
}

const mergeAddons = (config) => {
  const d = defaultAddons();
  const a = config?.addons || {};
  return {
    included_users: Number.isInteger(a.included_users) ? a.included_users : d.included_users,
    user_seat: { ...d.user_seat, ...(a.user_seat || {}) },
    pharmacy: { ...d.pharmacy, ...(a.pharmacy || {}) },
  };
};

function publicAddons(config) {
  const a = mergeAddons(config);
  return {
    included_users: a.included_users,
    user_seat: a.user_seat.enabled ? { monthly_paise: a.user_seat.monthly_paise, yearly_paise: a.user_seat.yearly_paise } : null,
    pharmacy: a.pharmacy.enabled ? { yearly_paise: a.pharmacy.yearly_paise } : null,
  };
}

async function getAddonConfig(db) {
  const { config } = await loadCatalogue(db);
  return mergeAddons(config);
}

async function getInvoiceConfig(db) {
  const { config } = await loadCatalogue(db);
  return { ...defaultInvoiceConfig(), ...(config.invoice || {}) };
}

// One-time switch to the launch catalogue: adds the COMPLETE plan and, the
// first time it is added, stops new purchases of the older plans. Existing
// subscriptions on those plans run on unchanged. Safe to call on every start.
async function ensureLaunchCatalogue(db) {
  const count = await db.collection("plans").countDocuments({});
  if (!count) {
    await db.collection("plans").insertMany(defaultPlans().map((p) => ({ ...p, created_at: new Date(), updated_at: new Date() }))).catch((err) => {
      if (err.code !== 11000) throw err;
    });
    invalidatePricingCache();
    return { created: true };
  }
  const res = await db.collection("plans").updateOne(
    { code: LAUNCH_PLAN },
    { $setOnInsert: { ...launchPlan(), created_at: new Date(), updated_at: new Date() } },
    { upsert: true }
  );
  if (res.upsertedCount) {
    await db.collection("plans").updateMany({ code: { $ne: LAUNCH_PLAN } }, { $set: { is_active: false, highlight: false, updated_at: new Date() } });
    await db.collection("pricing_config").updateOne(
      { _id: CONFIG_ID },
      { $set: { "trial.plan": "BEST" }, $setOnInsert: { display: defaultPricingConfig().display } },
      { upsert: true }
    );
    console.log("[Billing] Launch plan added; older plans closed to new purchases");
  }
  invalidatePricingCache();
  return { created: !!res.upsertedCount };
}

async function getOffer(db) {
  const { config } = await loadCatalogue(db);
  return config.offer;
}

module.exports = {
  PLAN_CODES,
  LAUNCH_PLAN,
  defaultAddons,
  defaultInvoiceConfig,
  getGstPercent,
  getAddonConfig,
  getInvoiceConfig,
  mergeAddons,
  gstOn,
  clampGst,
  ensureLaunchCatalogue,
  CONFIG_ID,
  defaultPlans,
  defaultPricingConfig,
  invalidatePricingCache,
  getPlan,
  getBestPlan,
  getTrialConfig,
  getOffer,
  getDisplay,
  getPublicPlans,
  priceBreakdown,
  requireActivePlan,
  discountFor,
};
