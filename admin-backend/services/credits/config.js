// AI credit settings: what each model costs us, how that becomes credits, and
// what each plan gets. One document in `credit_config`, edited from the admin
// panel; everything missing falls back to the defaults below.
//
// COPY of backend-node/services/credits/config.js (separately deployed app). KEEP IN SYNC.
const DAY_MS = 24 * 60 * 60 * 1000;

// USD per 1M tokens. `from` = first day (UTC) a price applies.
const DEFAULT_MODEL_PRICES = {
  "gemini-3.6-flash": [
    { from: "2000-01-01", input: 0.75, cached: 0.075, output: 3.75 },
    { from: "2027-01-01", input: 1.5, cached: 0.15, output: 7.5 },
  ],
  "gemini-3.8-flash": [
    { from: "2000-01-01", input: 0.75, cached: 0.075, output: 3.75 },
    { from: "2027-01-01", input: 1.5, cached: 0.15, output: 7.5 },
  ],
  "gemini-3.5-flash": [
    { from: "2000-01-01", input: 0.75, cached: 0.075, output: 3.75 },
    { from: "2027-01-01", input: 1.5, cached: 0.15, output: 7.5 },
  ],
  "gemini-3.1-flash-lite": [{ from: "2000-01-01", input: 0.25, cached: 0.025, output: 1.5 }],
  "gemini-2.5-flash": [{ from: "2000-01-01", input: 0.3, cached: 0.03, output: 2.5 }],
  // Voice: output is audio tokens
  "gemini-3.8-flash-tts": [
    { from: "2000-01-01", input: 0.5, cached: 0.5, output: 9 },
    { from: "2027-01-01", input: 1, cached: 1, output: 18 },
  ],
  "gemini-3.1-flash-tts-preview": [{ from: "2000-01-01", input: 1, cached: 1, output: 20 }],
  "gemini-2.5-flash-preview-tts": [{ from: "2000-01-01", input: 0.5, cached: 0.5, output: 10 }],
  "openai/gpt-oss-120b": [{ from: "2000-01-01", input: 0.15, cached: 0.075, output: 0.6 }],
  "openai/gpt-oss-20b": [{ from: "2000-01-01", input: 0.075, cached: 0.0375, output: 0.3 }],
  // NVIDIA's hosted endpoint has no per-token bill on the trial; priced like a
  // paid host of a 120B model so the last-resort answers still cover their cost
  "nvidia/nemotron-3.5-super-vl-120b-a12b": [{ from: "2000-01-01", input: 0.15, cached: 0.075, output: 0.6 }],
};
// A model we don't have a price for is billed at this (on the safe side)
const UNKNOWN_MODEL_PRICE = { input: 1.5, cached: 0.15, output: 7.5 };

const DEFAULTS = {
  credit_value_paise: 10, // 1 credit = ₹0.10
  margin_percent: 25, // ₹10 of AI cost uses ₹12.50 worth of credits
  usd_inr: 88,
  gst_percent: 18, // pack prices include GST; credits are given on the price before GST
  min_charge_credits: 0.1,
  // Daily allowance by plan (credits), for active subscriptions; unused daily credits don't carry over
  daily_credits: { BASIC: 0, ADVANCED: 0, AGENTIC: 50 },
  trial_daily_credits: 10,
  // With no credits left: light questions/lookups/reports still work, on the economy engine, up to a daily count
  free_mode: { enabled: true, messages_per_day: 25 },
  engines: { pro: { enabled: true }, swift: { enabled: true } },
  packs: [
    // credits: null = worked out from the price before GST
    { id: "pack_99", label: "Starter", price_paise: 9900, credits: null, bonus_credits: 0, active: true },
    { id: "pack_249", label: "Popular", price_paise: 24900, credits: null, bonus_credits: 150, active: true },
    { id: "pack_499", label: "Best value", price_paise: 49900, credits: null, bonus_credits: 500, active: true },
  ],
  model_prices: DEFAULT_MODEL_PRICES,
};

let cache = { at: 0, value: null };
const TTL_MS = 30 * 1000;

function merge(doc) {
  const d = doc || {};
  return {
    ...DEFAULTS,
    ...d,
    daily_credits: { ...DEFAULTS.daily_credits, ...(d.daily_credits || {}) },
    free_mode: { ...DEFAULTS.free_mode, ...(d.free_mode || {}) },
    engines: {
      pro: { ...DEFAULTS.engines.pro, ...(d.engines?.pro || {}) },
      swift: { ...DEFAULTS.engines.swift, ...(d.engines?.swift || {}) },
    },
    packs: Array.isArray(d.packs) && d.packs.length ? d.packs : DEFAULTS.packs,
    model_prices: { ...DEFAULT_MODEL_PRICES, ...(d.model_prices || {}) },
  };
}

async function getConfig(db) {
  if (cache.value && Date.now() - cache.at < TTL_MS) return cache.value;
  const doc = await db.collection("credit_config").findOne({ _id: "global" }).catch(() => null);
  cache = { at: Date.now(), value: merge(doc) };
  return cache.value;
}
const invalidateConfig = () => (cache = { at: 0, value: null });

// Price in effect for a model on a date (USD per 1M tokens)
function priceFor(config, model, when = new Date()) {
  const rows = config.model_prices[model];
  if (!rows?.length) return { ...UNKNOWN_MODEL_PRICE, unknown: true };
  const day = when.toISOString().slice(0, 10);
  const live = [...rows].filter((r) => (r.from || "2000-01-01") <= day).sort((a, b) => (a.from < b.from ? 1 : -1))[0];
  return live || rows[0];
}

// One AI call's cost in USD: uncached input, cached input, output (thinking counts as output)
function usageCostUsd(config, u, when) {
  const p = priceFor(config, u.model, when);
  const cached = Math.max(0, u.cached_tokens || 0);
  const input = Math.max(0, (u.input_tokens || 0) - cached);
  const output = Math.max(0, (u.output_tokens || 0) + (u.thinking_tokens || 0));
  return (input * p.input + cached * (p.cached ?? p.input) + output * p.output) / 1e6;
}

// Milli-credits (1 credit = 1000) for a rupee cost, with margin, rounded up to 0.1 credit
function creditsForInr(config, inr) {
  const credits = (inr * (1 + config.margin_percent / 100)) / (config.credit_value_paise / 100);
  const tenths = Math.ceil(Math.max(credits, inr > 0 ? config.min_charge_credits : 0) * 10 - 1e-9);
  return tenths * 100;
}

// Credits a pack gives (explicit, or from its price before GST)
function packCredits(config, pack) {
  const base = Number.isFinite(pack.credits)
    ? pack.credits
    : Math.floor(pack.price_paise / (1 + config.gst_percent / 100) / config.credit_value_paise);
  return base + (pack.bonus_credits || 0);
}

module.exports = { DAY_MS, DEFAULTS, DEFAULT_MODEL_PRICES, getConfig, invalidateConfig, merge, priceFor, usageCostUsd, creditsForInr, packCredits };
