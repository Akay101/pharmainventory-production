// Plan catalogue and server-side price computation.
//
// Prices live in the `plans` collection (managed from the admin panel) in
// paise. The client never sends an amount: every checkout is re-quoted here.
const { BillingError } = require("./errors");

const PLAN_CODES = ["BASIC", "ADVANCED", "AGENTIC"];
const CONFIG_ID = "global";
const PLANS_CACHE_MS = 30 * 1000;

const rupeesFromEnv = (key, fallback) => {
  const n = parseInt(process.env[key], 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

// Seed values, used only when the collection is empty (see migration script).
const defaultPlans = () => [
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
    is_active: true,
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
    highlight: true,
    is_active: true,
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
    is_active: true,
  },
];

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
  display: { hide_prices: false, label: "Launching soon" },
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
function priceBreakdown(plan, offer, promo, now = new Date()) {
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

  return {
    base_paise: base,
    offer: appliedOffer,
    promo: appliedPromo,
    amount_paise: afterOffer - promoDiscount,
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
        ...priceBreakdown(p, config.offer, null, now),
      })),
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

async function getOffer(db) {
  const { config } = await loadCatalogue(db);
  return config.offer;
}

module.exports = {
  PLAN_CODES,
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
