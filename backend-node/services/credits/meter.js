// Collects the token usage of every AI call made while handling one request
// (a chat turn, a voice reply, a scan), without threading it through every
// function: code runs inside meter.run(), and AI clients call meter.record().
const { AsyncLocalStorage } = require("async_hooks");
const { usageCostUsd } = require("./config");

const store = new AsyncLocalStorage();

function createMeter() {
  return { entries: [] };
}

const run = (meterObj, fn) => store.run(meterObj, fn);
// Meter the rest of the current request (its async continuations included)
const enter = (meterObj) => store.enterWith(meterObj);
const current = () => store.getStore() || null;

// entry: { provider, model, purpose, input_tokens, cached_tokens, output_tokens, thinking_tokens, fallback }
function record(entry) {
  const m = current();
  if (m && entry && entry.model) m.entries.push({ ...entry, at: Date.now() });
}

// Gemini usageMetadata -> our usage entry
function fromGemini(model, purpose, usage, extra = {}) {
  if (!usage) return null;
  return {
    provider: "gemini",
    model,
    purpose,
    input_tokens: usage.promptTokenCount || 0,
    cached_tokens: usage.cachedContentTokenCount || 0,
    output_tokens: usage.candidatesTokenCount || 0,
    thinking_tokens: usage.thoughtsTokenCount || 0,
    ...extra,
  };
}

// OpenAI-style usage (Groq) -> our usage entry
// Groq or NVIDIA (pass extra.provider for NVIDIA)
function fromOpenAi(model, purpose, usage, extra = {}) {
  if (!usage) return null;
  return {
    provider: "groq",
    model,
    purpose,
    input_tokens: usage.prompt_tokens || 0,
    cached_tokens: usage.prompt_tokens_details?.cached_tokens || 0,
    output_tokens: usage.completion_tokens || 0,
    thinking_tokens: 0,
    ...extra,
  };
}

// Totals for a meter: tokens per model and the cost in USD / INR
function summarize(config, meterObj, when = new Date()) {
  let usd = 0;
  const byModel = {};
  for (const e of meterObj?.entries || []) {
    const cost = usageCostUsd(config, e, when);
    usd += cost;
    const k = e.model;
    byModel[k] = byModel[k] || { model: k, provider: e.provider, calls: 0, input_tokens: 0, cached_tokens: 0, output_tokens: 0, usd: 0 };
    const b = byModel[k];
    b.calls++;
    b.input_tokens += e.input_tokens || 0;
    b.cached_tokens += e.cached_tokens || 0;
    b.output_tokens += (e.output_tokens || 0) + (e.thinking_tokens || 0);
    b.usd += cost;
  }
  return { usd, inr: usd * config.usd_inr, models: Object.values(byModel), calls: meterObj?.entries?.length || 0 };
}

module.exports = { createMeter, run, enter, current, record, fromGemini, fromOpenAi, summarize };
