// Gemini client for the assistant: streaming text, native function calling,
// structured JSON output. Plain REST over fetch.
//
// Model turns are kept exactly as Gemini returned them (including thought
// signatures) and sent back verbatim on the next step, which newer models
// require for multi-step tool use.
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

const apiKey = () => process.env.GEMINI_API_KEY || process.env.EMERGENT_LLM_KEY || "";
const MODELS = {
  agent: () => process.env.ASSISTANT_MODEL || "gemini-3.5-flash",
  router: () => process.env.ASSISTANT_ROUTER_MODEL || "gemini-3.1-flash-lite",
  fallback: () => process.env.GEMINI_FALLBACK_MODEL || "gemini-2.5-flash",
};

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

// Model turn with retries for transient errors and fallback for a retired model
async function turn({ role = "agent", system, contents, tools, schema, thinking, maxOutputTokens, temperature, onText, signal, timeoutMs }) {
  let model = MODELS[role]();
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    let streamed = false;
    try {
      const body = buildBody({ system, contents, tools, schema, model, thinking, maxOutputTokens, temperature });
      return await streamTurn({
        model,
        body,
        signal,
        timeoutMs,
        onText: (t) => {
          streamed = true;
          onText?.(t);
        },
      });
    } catch (err) {
      lastErr = err;
      if (err.category === "cancelled" || streamed) throw err; // can't un-send streamed text
      if (err.status === 404 && model !== MODELS.fallback()) {
        model = MODELS.fallback();
        continue;
      }
      if (err.status === 400 && /thinking level/i.test(err.message)) {
        thinking = "low";
        continue;
      }
      if (!err.retryable) throw err;
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt + Math.random() * 300));
    }
  }
  throw lastErr;
}

// Structured JSON answer (router, titles)
async function json({ role = "router", system, contents, schema, signal, timeoutMs = 15000, thinking = "minimal" }) {
  const out = await turn({ role, system, contents, schema, thinking, signal, timeoutMs, maxOutputTokens: 1024, temperature: 0 });
  try {
    return JSON.parse(out.text);
  } catch {
    throw new LlmError("AI returned malformed JSON", { category: "invalid_json" });
  }
}

module.exports = { turn, json, LlmError, MODELS, apiKey };
