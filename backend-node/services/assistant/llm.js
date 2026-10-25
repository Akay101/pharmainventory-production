// Gemini client for the assistant: streaming text, native function calling,
// structured JSON output. Plain REST over fetch.
//
// Model turns are kept exactly as Gemini returned them (including thought
// signatures) and sent back verbatim on the next step, which newer models
// require for multi-step tool use.
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

const apiKey = () => process.env.GEMINI_API_KEY || process.env.EMERGENT_LLM_KEY || "";
const groq = require("./groq");
const meter = require("../credits/meter");

// Two engines:
//   pro   ("Precision" in the app): Gemini. Flash-Lite does routing, questions,
//         lookups, records and reports (as accurate as Flash on our tool flows,
//         faster, a third of the price); Flash is its backup
//   swift ("Swift"): Groq. gpt-oss-20b for light work, gpt-oss-120b for records
// The admin's ai_mode decides who answers: "auto" (engine chosen per task, the
// other engine covers, NVIDIA's Nemotron last, shown as Swift), or one provider
// for everything with no fallback ("gemini" | "groq" | "nemotron").
const MODELS = {
  agent: () => process.env.ASSISTANT_MODEL || "gemini-3.5-flash",
  heavy: () => process.env.ASSISTANT_HEAVY_MODEL || "gemini-3.1-flash-lite",
  light: () => process.env.ASSISTANT_LIGHT_MODEL || "gemini-3.1-flash-lite",
  router: () => process.env.ASSISTANT_ROUTER_MODEL || "gemini-3.1-flash-lite",
  fallback: () => process.env.GEMINI_FALLBACK_MODEL || "gemini-2.5-flash",
  swiftAgent: () => process.env.SWIFT_AGENT_MODEL || "openai/gpt-oss-120b",
  swiftLight: () => process.env.SWIFT_LIGHT_MODEL || "openai/gpt-oss-20b",
  lastResort: () => process.env.LAST_RESORT_MODEL || "nvidia/nemotron-3.5-super-vl-120b-a12b",
};
const ENGINE_OF = { gemini: "pro", groq: "swift", nvidia: "swift" };
const ALL_BUSY = "Due to high demand, our agents will be back in a few moments. Please check back later.";
const FAILED = "Something went wrong. Please try again.";

// Gemini models that just hit a quota or outage are skipped for a while, so
// every step of a turn doesn't wait on the same failure (Groq/NVIDIA keep their own)
const geminiCooling = new Map();
const usable = (link) =>
  link.provider === "gemini" ? !!apiKey() && (geminiCooling.get(link.model) || 0) <= Date.now() : groq.available(link.model, link.provider);

// Whether a provider's key is set here
const providerReady = (provider) => (provider === "gemini" ? !!apiKey() : groq.available(null, provider));

function providerLinks(provider, role, tier) {
  const g = (model) => ({ provider: "gemini", model });
  const q = (model) => ({ provider: "groq", model });
  if (provider === "nvidia") return [{ provider: "nvidia", model: MODELS.lastResort() }];
  // Swift record work never uses the small model (it can skip the tools and
  // only describe a draft)
  if (provider === "groq") return role === "router" || tier === "light" ? [q(MODELS.swiftLight()), q(MODELS.swiftAgent())] : [q(MODELS.swiftAgent())];
  if (role === "router") return [g(MODELS.router())];
  return tier === "light" ? [g(MODELS.light()), g(MODELS.fallback())] : [g(MODELS.heavy()), g(MODELS.agent())];
}

// Which models to try, in order. auto: the task's engine, the other engine,
// then Nemotron. A fixed mode: only its provider's models.
function chainFor({ role = "agent", engine = "pro", tier = "heavy", mode = "auto" }) {
  const fixed = { gemini: "gemini", groq: "groq", nemotron: "nvidia" }[mode];
  const chain = fixed
    ? providerLinks(fixed, role, tier)
    : [...providerLinks(engine === "swift" ? "groq" : "gemini", role, tier), ...providerLinks(engine === "swift" ? "gemini" : "groq", role, tier), ...providerLinks("nvidia")];
  const seen = new Set();
  const live = chain.filter((c) => !seen.has(c.provider + c.model) && seen.add(c.provider + c.model) && usable(c));
  if (!live.length) throw fixed ? new LlmError(FAILED, { category: "failed", status: 503 }) : new LlmError(ALL_BUSY, { category: "all_busy", status: 503 });
  return live;
}

class LlmError extends Error {
  constructor(message, { status = null, retryable = false, category = "llm" } = {}) {
    super(message);
    this.status = status;
    this.retryable = retryable;
    this.category = category;
  }
}

function thinkingFor(model, level) {
  if (/^gemini-2\.5-flash/.test(model)) return { thinkingConfig: { thinkingBudget: level === "minimal" ? 0 : 512 } };
  if (/^gemini-[3-9]/.test(model)) return { thinkingConfig: { thinkingLevel: level || "minimal" } };
  return {};
}

// OpenAPI-ish lowercase schema -> Gemini's uppercase type names
function toGeminiSchema(s) {
  if (!s || typeof s !== "object") return s;
  const out = {};
  for (const [k, v] of Object.entries(s)) {
    if (k === "type") out.type = String(v).toUpperCase();
    else if (k === "properties") out.properties = Object.fromEntries(Object.entries(v).map(([pk, pv]) => [pk, toGeminiSchema(pv)]));
    else if (k === "items") out.items = toGeminiSchema(v);
    else out[k] = v;
  }
  return out;
}

function buildBody({ system, contents, tools, schema, model, thinking, maxOutputTokens = 4096, temperature = 0.2 }) {
  const body = {
    contents,
    generationConfig: { temperature, maxOutputTokens, ...thinkingFor(model, thinking) },
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  if (tools?.length) {
    body.tools = [{ functionDeclarations: tools.map((t) => ({ name: t.name, description: t.description, parameters: toGeminiSchema(t.parameters || { type: "object", properties: {} }) })) }];
    body.toolConfig = { functionCallingConfig: { mode: "AUTO" } };
  }
  if (schema) {
    body.generationConfig.responseMimeType = "application/json";
    body.generationConfig.responseSchema = toGeminiSchema(schema);
  }
  return body;
}

async function post(url, body, { signal, timeoutMs }) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener("abort", onAbort);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey() },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const text = await res.text();
      let msg = text.slice(0, 300);
      try {
        msg = JSON.parse(text)?.error?.message || msg;
      } catch {}
      throw new LlmError(msg, { status: res.status, retryable: res.status === 429 || res.status >= 500, category: res.status === 429 ? "rate_limit" : "llm" });
    }
    return { res, done: () => clearTimeout(timer) };
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof LlmError) throw err;
    if (signal?.aborted) throw new LlmError("cancelled", { category: "cancelled" });
    if (err.name === "AbortError") throw new LlmError("The AI took too long to respond", { retryable: true, category: "timeout" });
    throw new LlmError(`AI service unreachable: ${err.message}`, { retryable: true, category: "network" });
  } finally {
    signal?.removeEventListener("abort", onAbort);
  }
}

// One streamed model turn. Calls onText(delta) as text arrives and resolves
// with the full model content plus any function calls it asked for.
async function streamTurn({ model, body, onText, signal, timeoutMs = 60000 }) {
  const { res, done } = await post(`${ENDPOINT}/${model}:streamGenerateContent?alt=sse`, body, { signal, timeoutMs });
  const parts = [];
  let finishReason = null;
  let usage = null;
  const decoder = new TextDecoder();
  let buf = "";
  const handleEvent = (event) => {
    const line = event.split("\n").find((l) => l.startsWith("data:"));
    if (!line) return;
    let json;
    try {
      json = JSON.parse(line.slice(5).trim());
    } catch {
      return;
    }
    const cand = json.candidates?.[0];
    if (json.usageMetadata) usage = json.usageMetadata;
    if (!cand) return;
    if (cand.finishReason) finishReason = cand.finishReason;
    for (const p of cand.content?.parts || []) {
      parts.push(p);
      if (typeof p.text === "string" && p.text && !p.thought) onText?.(p.text);
    }
  };
  try {
    for await (const chunk of res.body) {
      buf += decoder.decode(chunk, { stream: true }).replace(/\r\n/g, "\n");
      let idx;
      while ((idx = buf.indexOf("\n\n")) >= 0) {
        handleEvent(buf.slice(0, idx));
        buf = buf.slice(idx + 2);
      }
    }
    // The last event isn't always followed by a blank line
    if (buf.trim()) handleEvent(buf);
  } catch (err) {
    if (signal?.aborted) throw new LlmError("cancelled", { category: "cancelled" });
    throw new LlmError(`AI stream interrupted: ${err.message}`, { retryable: true, category: "network" });
  } finally {
    done();
  }
  if (!parts.length && finishReason && finishReason !== "STOP") {
    throw new LlmError(finishReason === "SAFETY" ? "That request was blocked by the AI safety filter" : `AI stopped early (${finishReason})`, { category: "blocked" });
  }
  return {
    content: { role: "model", parts },
    text: parts.filter((p) => typeof p.text === "string" && !p.thought).map((p) => p.text).join(""),
    calls: parts.filter((p) => p.functionCall).map((p) => p.functionCall),
    finishReason,
    usage,
  };
}

// One Gemini model, with a quick retry for a blip and a switch for a retired model
async function geminiTurn({ model, system, contents, tools, schema, thinking, maxOutputTokens, temperature, onText, signal, timeoutMs }) {
  let lastErr;
  let sent = false;
  const relay = (t) => {
    sent = true;
    onText?.(t);
  };
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const body = buildBody({ system, contents, tools, schema, model, thinking, maxOutputTokens, temperature });
      const out = await streamTurn({ model, body, signal, timeoutMs, onText: relay });
      return { ...out, model, provider: "gemini" };
    } catch (err) {
      lastErr = err;
      if (err.category === "cancelled" || sent) throw err; // text already shown: can't retry
      if (err.status === 404 && model !== MODELS.fallback()) {
        model = MODELS.fallback();
        continue;
      }
      if (err.status === 400 && /thinking level/i.test(err.message)) {
        thinking = "low";
        continue;
      }
      // Quota / billing / rate limits: no point hammering, let the next provider answer
      if (!err.retryable || err.status === 429 || attempt >= 1) throw err;
      await new Promise((r) => setTimeout(r, 400 + Math.random() * 300));
    }
  }
  throw lastErr;
}

/**
 * One model turn on the engine's chain: the first model that answers wins.
 * Usage is recorded on the request's meter (see credits/meter) for billing.
 *   role:   "agent" | "router" (router also serves small JSON jobs)
 *   engine: "pro" | "swift"     tier: "light" | "heavy"
 */
async function turn({ role = "agent", engine, mode, tier = "heavy", purpose, system, contents, tools, schema, thinking, maxOutputTokens, temperature, onText, onSwitch, forceTool, signal, timeoutMs }) {
  // Calls that don't name an engine (router, name cleanup) follow the turn's
  engine = engine || meter.current()?.engine || "pro";
  mode = mode || meter.current()?.aiMode || "auto";
  const chain = chainFor({ role, engine, tier, mode });
  let lastErr;
  for (let i = 0; i < chain.length; i++) {
    const link = chain[i];
    let streamed = false;
    const relay = (t) => {
      streamed = true;
      onText?.(t);
    };
    // Tell the user before another engine (or the slow last resort) answers
    if (ENGINE_OF[link.provider] !== engine || link.provider === "nvidia") onSwitch?.({ engine: ENGINE_OF[link.provider], provider: link.provider, from: engine, slow: link.provider === "nvidia" });
    try {
      let out;
      if (link.provider !== "gemini") {
        const timeout = link.provider === "nvidia" && role !== "router" ? Math.max(timeoutMs || 60000, 90000) : timeoutMs;
        // Nemotron tends to describe a record instead of making it: on a record
        // request its first step must call a tool
        const force = !!forceTool && link.provider === "nvidia" && !!tools?.length;
        try {
          out = await groq.groqTurn({ provider: link.provider, model: link.model, system, contents, tools, schema, forceTool: force, maxOutputTokens, temperature, onText: relay, signal, timeoutMs: timeout });
        } catch (err) {
          // One retry for a blip or a garbled tool call, unless text already went out
          if (streamed || err.category === "cancelled" || !err.retryable || err.status === 429) throw err;
          out = await groq.groqTurn({ provider: link.provider, model: link.model, system, contents, tools, schema, forceTool: force, maxOutputTokens, temperature, onText: relay, signal, timeoutMs: timeout });
        }
        meter.record(meter.fromOpenAi(link.model, purpose || role, out.usage, { provider: link.provider, fallback: i > 0 }));
        // gpt-oss sometimes stops silently after reading a tool result: nudge it once
        if (!schema && !String(out.text || "").trim() && !out.calls?.length) {
          const nudged = [...contents, { role: "user", parts: [{ text: "(Now reply to the user in text, in the reply language.)" }] }];
          out = await groq.groqTurn({ provider: link.provider, model: link.model, system, contents: nudged, tools, schema, maxOutputTokens, temperature, onText: relay, signal, timeoutMs: timeout });
          meter.record(meter.fromOpenAi(link.model, purpose || role, out.usage, { provider: link.provider, fallback: i > 0 }));
        }
      } else {
        out = await geminiTurn({ model: link.model, system, contents, tools, schema, thinking, maxOutputTokens, temperature, onText: relay, signal, timeoutMs });
        meter.record(meter.fromGemini(out.model, purpose || role, out.usage, { fallback: i > 0 }));
      }
      // Nothing said and no tool asked for: treat as a failure, the next model answers
      if (!schema && !String(out.text || "").trim() && !out.calls?.length) {
        throw new LlmError(`${link.model} returned an empty answer (${out.finishReason}, ${out.usage?.completion_tokens ?? "?"} output tokens)`, { retryable: true, category: "empty" });
      }
      if (i > 0) console.warn(`[assistant] ${role} (${engine}) answered by fallback ${link.provider}/${out.model} (${lastErr?.message?.slice(0, 120)})`);
      return { ...out, engine: ENGINE_OF[link.provider], fallback: i > 0 };
    } catch (err) {
      if (err.category === "cancelled" || streamed) throw err; // can't un-send streamed text
      if (err.category === "blocked") throw err;
      if (link.provider === "gemini") {
        const badKey = err.status === 401 || err.status === 403 || (err.status === 400 && /api key/i.test(err.message));
        if (badKey || err.status === 429 || err.status >= 500) geminiCooling.set(link.model, Date.now() + (badKey ? 300000 : err.status === 429 ? 60000 : 15000));
      }
      console.warn(`[assistant] ${role} ${link.provider}/${link.model} failed: ${String(err.message).slice(0, 160)}`);
      lastErr = err;
    }
  }
  // Every model failed: auto has nothing left to try; a fixed mode has no fallback
  if (mode !== "auto") throw new LlmError(FAILED, { category: "failed", status: lastErr?.status || 503 });
  throw new LlmError(ALL_BUSY, { category: "all_busy", status: lastErr?.status || 503 });
}

// Structured JSON answer (router, titles)
async function json({ role = "router", engine, mode, purpose, system, contents, schema, signal, timeoutMs = 15000, thinking = "minimal" }) {
  const out = await turn({ role, engine, mode, purpose, system, contents, schema, thinking, signal, timeoutMs, maxOutputTokens: 1024, temperature: 0 });
  try {
    return JSON.parse(out.text);
  } catch {
    throw new LlmError("AI returned malformed JSON", { category: "invalid_json" });
  }
}

module.exports = { turn, json, LlmError, MODELS, apiKey, chainFor, providerReady, ENGINE_OF };
