// Minimal Gemini client for structured extraction from images.
//
// Plain REST over fetch: no SDK, no Python. Thinking is off by default
// (OCR-style extraction doesn't benefit from it and it adds seconds), the
// response is constrained to a JSON schema, and transient failures
// (429/5xx/timeouts) are retried with jittered backoff.
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

const apiKey = () => process.env.GEMINI_API_KEY || process.env.EMERGENT_LLM_KEY || "";
const defaultModel = () => process.env.GEMINI_SCAN_MODEL || "gemini-3.5-flash";
// Used when the configured model is retired or unavailable (404)
const fallbackModel = () => process.env.GEMINI_FALLBACK_MODEL || "gemini-2.5-flash";

class GeminiError extends Error {
  constructor(message, { category = "gemini_error", status = null, retryable = false } = {}) {
    super(message);
    this.name = "GeminiError";
    this.category = category;
    this.status = status;
    this.retryable = retryable;
  }
}

// Reading text off a photo needs no reasoning; keep thinking to the minimum
// each model family allows.
function thinkingFor(model) {
  if (/^gemini-2\.5-flash/.test(model)) return { thinkingConfig: { thinkingBudget: 0 } };
  if (/^gemini-[3-9]/.test(model)) return { thinkingConfig: { thinkingLevel: process.env.GEMINI_THINKING_LEVEL || "minimal" } };
  return {};
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function callOnce({ model, body, timeoutMs, signal }) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const onCancel = () => ctrl.abort();
  signal?.addEventListener("abort", onCancel);
  let res;
  let text;
  try {
    res = await fetch(`${ENDPOINT}/${model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey() },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    // The deadline covers the body too: a stalled response must not hang
    text = await res.text();
  } catch (err) {
    if (signal?.aborted) throw new GeminiError("cancelled", { category: "cancelled" });
    if (err.name === "AbortError") {
      throw new GeminiError(`AI request timed out after ${Math.round(timeoutMs / 1000)}s`, { category: "timeout", retryable: true });
    }
    throw new GeminiError(`AI service unreachable: ${err.message}`, { category: "network", retryable: true });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onCancel);
  }

  if (!res.ok) {
    let msg = text.slice(0, 300);
    try {
      msg = JSON.parse(text)?.error?.message || msg;
    } catch {}
    const retryable = res.status === 429 || res.status >= 500;
    const category = res.status === 429 ? "rate_limit" : res.status === 400 ? "image_error" : "gemini_error";
    throw new GeminiError(msg, { category, status: res.status, retryable });
  }

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new GeminiError("AI returned an unreadable response", { category: "invalid_json", retryable: true });
  }
  const cand = json.candidates?.[0];
  if (!cand) {
    const blocked = json.promptFeedback?.blockReason;
    throw new GeminiError(blocked ? `Image was blocked by the AI (${blocked})` : "AI returned no result", {
      category: blocked ? "image_error" : "gemini_error",
      retryable: !blocked,
    });
  }
  const out = (cand.content?.parts || []).map((p) => p.text || "").join("").trim();
  try {
    return { data: JSON.parse(out), finishReason: cand.finishReason, usage: json.usageMetadata };
  } catch {
    // MAX_TOKENS on a huge invoice: the JSON is cut off
    throw new GeminiError(
      cand.finishReason === "MAX_TOKENS" ? "The bill is too long to read in one go. Scan fewer pages at a time." : "AI returned malformed JSON",
      { category: "invalid_json", retryable: cand.finishReason !== "MAX_TOKENS" }
    );
  }
}

// Tail-latency guard: if the first call hasn't answered after `hedgeAfterMs`,
// fire an identical second call and take whichever finishes first. Occasional
// provider stalls then cost a few seconds instead of a full timeout.
function callHedged({ hedgeAfterMs, ...opts }) {
  if (!hedgeAfterMs) return callOnce(opts);
  return new Promise((resolve, reject) => {
    const ctrls = [];
    let settled = false;
    let started = 0;
    let failed = 0;
    let lastErr;
    const launch = () => {
      const c = new AbortController();
      ctrls.push(c);
      started++;
      callOnce({ ...opts, signal: c.signal }).then(
        (v) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          ctrls.forEach((x) => x !== c && x.abort());
          resolve(v);
        },
        (err) => {
          if (settled) return;
          failed++;
          lastErr = err;
          // Fail fast if nothing else is (or will be) running
          if (failed >= started && (started > 1 || !err.retryable)) {
            settled = true;
            clearTimeout(timer);
            reject(lastErr);
          } else if (failed >= started) {
            clearTimeout(timer);
            launch();
          }
        }
      );
    };
    const timer = setTimeout(() => !settled && started < 2 && launch(), hedgeAfterMs);
    launch();
  });
}

/**
 * Extract structured JSON from images.
 * @param {object} opts
 * @param {string} opts.prompt
 * @param {{data: Buffer, mimeType: string}[]} opts.images
 * @param {object} opts.schema   Gemini responseSchema (OpenAPI subset)
 * @param {number} [opts.timeoutMs=45000]
 * @param {number} [opts.retries=2]
 * @param {number} [opts.maxOutputTokens=4096]
 */
async function extractJson({ prompt, images, schema, timeoutMs = 45000, retries = 2, maxOutputTokens = 4096, model = defaultModel(), hedgeAfterMs = 0 }) {
  if (!apiKey()) throw new GeminiError("AI scanning is not configured on this server", { category: "config" });

  const buildBody = (m, thinking) => ({
    contents: [
      {
        role: "user",
        parts: [
          ...images.map((img) => ({ inline_data: { mime_type: img.mimeType || "image/jpeg", data: img.data.toString("base64") } })),
          { text: prompt },
        ],
      },
    ],
    generationConfig: {
      temperature: 0,
      responseMimeType: "application/json",
      responseSchema: schema,
      maxOutputTokens,
      ...(thinking || thinkingFor(m)),
    },
  });

  let current = model;
  let body = buildBody(current);
  let adjusted = false;
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await callHedged({ model: current, body, timeoutMs, hedgeAfterMs });
    } catch (err) {
      lastErr = err;
      // Configuration mismatches fixed once, without counting as a retry
      if (!adjusted && err.status === 400 && /thinking level/i.test(err.message)) {
        adjusted = true;
        body = buildBody(current, { thinkingConfig: { thinkingLevel: "low" } });
        attempt--;
        continue;
      }
      if (!adjusted && err.status === 404 && current !== fallbackModel()) {
        adjusted = true;
        console.warn(`[gemini] model ${current} unavailable, falling back to ${fallbackModel()}`);
        current = fallbackModel();
        body = buildBody(current);
        attempt--;
        continue;
      }
      if (!err.retryable || attempt === retries) break;
      const base = err.category === "rate_limit" ? 1500 : 600;
      await sleep(base * 2 ** attempt + Math.random() * 400);
    }
  }
  throw lastErr;
}

// Caps concurrent Gemini calls from one process so a burst of scans queues
// briefly instead of tripping the provider's rate limit for everyone.
function createSemaphore(max) {
  let active = 0;
  const waiters = [];
  return async function run(fn, { maxWaitMs = 20000 } = {}) {
    if (active >= max) {
      await new Promise((resolve, reject) => {
        const t = setTimeout(() => {
          const i = waiters.indexOf(entry);
          if (i >= 0) waiters.splice(i, 1);
          reject(new GeminiError("AI scanner is busy. Please try again in a moment.", { category: "busy", status: 503 }));
        }, maxWaitMs);
        const entry = () => {
          clearTimeout(t);
          resolve();
        };
        waiters.push(entry);
      });
    }
    active++;
    try {
      return await fn();
    } finally {
      active--;
      const next = waiters.shift();
      if (next) next();
    }
  };
}

module.exports = { extractJson, createSemaphore, GeminiError, defaultModel };
