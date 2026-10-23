// OpenAI-compatible client (Groq, and NVIDIA's Nemotron as the last resort)
// speaking the assistant's Gemini-shaped conversation: contents/parts in, the
// same { content, text, calls, usage } out. Tool calls keep an id so a turn can
// switch provider mid-way (fallback).
const PROVIDERS = {
  groq: { endpoint: "https://api.groq.com/openai/v1/chat/completions", key: () => process.env.GROQ_API_KEY || "" },
  nvidia: { endpoint: "https://integrate.api.nvidia.com/v1/chat/completions", key: () => process.env.NVIDIA_API_KEY || "" },
};
const apiKey = (provider = "groq") => PROVIDERS[provider]?.key() || "";
// A model that just hit its rate limit is skipped until the provider says it
// resets, so calls go straight to the next model instead of waiting on a 429
const coolingUntil = new Map();
const available = (model, provider = "groq") => !!apiKey(provider) && (!model || (coolingUntil.get(`${provider}:${model}`) || 0) <= Date.now());
// "56.692s", "1m26.4s", "250ms" -> ms
function resetMs(v) {
  if (!v) return 0;
  let ms = 0;
  for (const [, n, unit] of String(v).matchAll(/([\d.]+)(ms|m|s|h)/g)) ms += parseFloat(n) * { ms: 1, s: 1000, m: 60000, h: 3600000 }[unit];
  return ms;
}

class GroqError extends Error {
  constructor(message, { status = null, retryable = false, category = "llm" } = {}) {
    super(message);
    this.status = status;
    this.retryable = retryable;
    this.category = category;
    this.provider = "groq";
  }
}

// Gemini contents -> OpenAI messages
function toMessages(system, contents) {
  const messages = [];
  if (system) messages.push({ role: "system", content: system });
  let pending = []; // tool call ids awaiting their responses, in order
  let seq = 0;
  for (const c of contents || []) {
    const parts = c.parts || [];
    if (c.role === "model") {
      const text = parts.filter((p) => typeof p.text === "string" && !p.thought).map((p) => p.text).join("");
      const calls = parts.filter((p) => p.functionCall);
      const toolCalls = calls.map((p) => {
        const id = p.functionCall.id || `call_${seq++}`;
        return { id, type: "function", function: { name: p.functionCall.name, arguments: JSON.stringify(p.functionCall.args || {}) } };
      });
      pending = toolCalls.map((t) => ({ id: t.id, name: t.function.name }));
      messages.push({ role: "assistant", content: text || (toolCalls.length ? null : ""), ...(toolCalls.length ? { tool_calls: toolCalls } : {}) });
      continue;
    }
    const responses = parts.filter((p) => p.functionResponse);
    for (const p of responses) {
      const i = pending.findIndex((x) => x.name === p.functionResponse.name);
      const match = i >= 0 ? pending.splice(i, 1)[0] : { id: p.functionResponse.id || `call_${seq++}` };
      const r = p.functionResponse.response;
      messages.push({ role: "tool", tool_call_id: match.id, content: JSON.stringify(r?.result !== undefined ? r.result : r) });
    }
    const text = parts
      .map((p) => (typeof p.text === "string" ? p.text : p.inline_data || p.inlineData ? "[photo attached: use the photo tools to read it]" : ""))
      .filter(Boolean)
      .join("\n");
    if (text) messages.push({ role: "user", content: text });
  }
  return messages;
}

const toTools = (tools) =>
  (tools || []).map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters || { type: "object", properties: {} } } }));

async function groqTurn({ provider = "groq", model, system, contents, tools, schema, forceTool = false, maxOutputTokens = 4096, temperature = 0.2, onText, signal, timeoutMs = 60000 }) {
  if (!apiKey(provider)) throw new GroqError(`${provider} is not configured`, { category: "unavailable" });
  const nvidia = provider === "nvidia";
  const sys = schema ? `${system || ""}\n\nReply with ONE JSON object only, matching this JSON schema:\n${JSON.stringify(schema)}` : system;
  const body = {
    model,
    messages: toMessages(sys, contents),
    temperature,
    ...(nvidia ? { max_tokens: maxOutputTokens, stream_options: { include_usage: true }, chat_template_kwargs: { enable_thinking: false } } : { max_completion_tokens: maxOutputTokens }),
    stream: true,
    ...(tools?.length ? { tools: toTools(tools), tool_choice: forceTool ? "required" : "auto" } : {}),
    ...(schema && !nvidia ? { response_format: { type: "json_object" } } : {}),
    ...(/gpt-oss/.test(model) ? { reasoning_effort: "low", include_reasoning: false } : {}),
  };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener("abort", onAbort);
  let res;
  try {
    res = await fetch(PROVIDERS[provider].endpoint, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${apiKey(provider)}` }, body: JSON.stringify(body), signal: ctrl.signal });
  } catch (err) {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
    if (signal?.aborted) throw new GroqError("cancelled", { category: "cancelled" });
    if (err.name === "AbortError") throw new GroqError("The AI took too long to respond", { retryable: true, category: "timeout" });
    throw new GroqError(`AI service unreachable: ${err.message}`, { retryable: true, category: "network" });
  }
  if (!res.ok) {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
    if (res.status === 401 || res.status === 403) coolingUntil.set(`${provider}:${model}`, Date.now() + 5 * 60 * 1000);
    if (res.status === 429) {
      const wait = Math.max(resetMs(res.headers.get("x-ratelimit-reset-tokens")), resetMs(res.headers.get("retry-after") && `${res.headers.get("retry-after")}s`), 5000);
      coolingUntil.set(`${provider}:${model}`, Date.now() + Math.min(wait, 10 * 60 * 1000));
    }
    const t = await res.text();
    let msg = t.slice(0, 300);
    try {
      msg = JSON.parse(t)?.error?.message || msg;
    } catch {}
    throw new GroqError(msg, { status: res.status, retryable: res.status === 429 || res.status >= 500, category: res.status === 429 ? "rate_limit" : "llm" });
  }

  let text = "";
  const calls = []; // by index
  let finishReason = null;
  let usage = null;
  const dec = new TextDecoder();
  let buf = "";
  const handle = (line) => {
    if (!line.startsWith("data:")) return;
    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") return;
    let j;
    try {
      j = JSON.parse(data);
    } catch {
      return;
    }
    if (j.usage) usage = j.usage;
    if (j.x_groq?.usage) usage = j.x_groq.usage;
    const ch = j.choices?.[0];
    if (!ch) return;
    if (ch.finish_reason) finishReason = ch.finish_reason;
    const d = ch.delta || {};
    if (typeof d.content === "string" && d.content) {
      text += d.content;
      onText?.(d.content);
    }
    for (const tc of d.tool_calls || []) {
      const c = (calls[tc.index] = calls[tc.index] || { id: null, name: "", args: "" });
      if (tc.id) c.id = tc.id;
      if (tc.function?.name) c.name += tc.function.name;
      if (tc.function?.arguments) c.args += tc.function.arguments;
    }
  };
  try {
    for await (const chunk of res.body) {
      buf += dec.decode(chunk, { stream: true }).replace(/\r\n/g, "\n");
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        handle(buf.slice(0, i).trim());
        buf = buf.slice(i + 1);
      }
    }
    if (buf.trim()) handle(buf.trim());
  } catch (err) {
    if (signal?.aborted) throw new GroqError("cancelled", { category: "cancelled" });
    throw new GroqError(`AI stream interrupted: ${err.message}`, { retryable: true, category: "network" });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }

  const parsedCalls = calls.filter(Boolean).map((c, i) => {
    let args = {};
    try {
      args = c.args ? JSON.parse(c.args) : {};
    } catch {
      throw new GroqError("AI returned a malformed tool call", { retryable: true, category: "invalid_json" });
    }
    return { id: c.id || `${provider}_${Date.now()}_${i}`, name: c.name, args };
  });
  const parts = [];
  if (text) parts.push({ text });
  // Gemini 3 checks thought signatures on calls in the current turn; calls made
  // by another provider carry the documented "skip" value
  for (const c of parsedCalls) parts.push({ functionCall: { id: c.id, name: c.name, args: c.args }, thoughtSignature: "skip_thought_signature_validator" });
  if (!parts.length && finishReason === "length") throw new GroqError("AI stopped early (length)", { category: "blocked" });
  return { content: { role: "model", parts }, text, calls: parsedCalls, finishReason, usage, provider, model };
}

module.exports = { groqTurn, available, GroqError, toMessages };
