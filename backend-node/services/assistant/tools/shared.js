// Helpers shared by the assistant's tools.
const { escapeRegex, tokenize } = require("../../search/normalize");

// ---------- dates (business dates are IST, stored as YYYY-MM-DD) ----------
const IST_MS = 5.5 * 3600 * 1000;
const todayIst = () => new Date(Date.now() + IST_MS).toISOString().slice(0, 10);
const addDays = (ymd, n) => {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const isYmd = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));
// Inclusive date range filter on a YYYY-MM-DD field
function dateRange(field, from, to) {
  const r = {};
  if (isYmd(from)) r.$gte = from;
  if (isYmd(to)) r.$lte = to;
  return Object.keys(r).length ? { [field]: r } : {};
}

// ---------- formatting ----------
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const inr = (n) => `₹${round2(n).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const fmtDate = (ymd) => {
  if (!ymd) return "";
  const d = new Date(isYmd(ymd) ? `${ymd}T00:00:00Z` : ymd);
  if (isNaN(d)) return String(ymd);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: isYmd(ymd) ? "UTC" : "Asia/Kolkata" });
};
const fmtExpiry = (ymd) => (isYmd(ymd) ? `${ymd.slice(5, 7)}/${ymd.slice(2, 4)}` : ymd || "");

// Every token must appear at a word start (order-free), like app search
function textMatch(fields, q) {
  const tokens = tokenize(q);
  if (!tokens.length) return {};
  return {
    $and: tokens.map((t) => {
      const re = { $regex: `(^|[^a-z0-9])${escapeRegex(t)}`, $options: "i" };
      return { $or: fields.map((f) => ({ [f]: re })) };
    }),
  };
}
const clampLimit = (n, def = 20, max = 50) => Math.max(1, Math.min(max, parseInt(n) || def));

// ---------- UI blocks streamed to the chat ----------
const blocks = {
  table: (title, columns, rows, extra = {}) => ({ type: "table", title, columns, rows, ...extra }),
  stats: (items, title) => ({ type: "stats", title, items }),
  choices: (question, options, style = "buttons") => ({ type: "choices", question, style, options }),
  link: (label, to) => ({ type: "link", label, to }),
  notice: (tone, text) => ({ type: "notice", tone, text }),
};
// Column helper: [key, label, format?, align?]
const cols = (...defs) => defs.map(([key, label, format, align]) => ({ key, label, ...(format ? { format } : {}), ...(align ? { align } : {}) }));

// ---------- calling the app's own API (all writes go through it) ----------
// Reuses every validation and side effect of the normal screens (stock,
// suppliers, history, activity log) instead of re-implementing them.
async function api(ctx, method, path, body) {
  const port = process.env.PORT || 8001;
  const res = await fetch(`http://127.0.0.1:${port}/api${path}`, {
    method,
    headers: { authorization: ctx.authorization, "content-type": "application/json", "x-davadesk-agent": "1" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {}
  if (!res.ok) {
    const err = new Error(data?.detail || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

// Message in the user's language: en / hi (Devanagari) / hinglish
const say = (lang, { en, hi, hinglish }) => (lang === "hi" ? hi || hinglish || en : lang === "hinglish" ? hinglish || en : en);

// Run fn over items with at most `limit` in flight; results keep input order
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

module.exports = { todayIst, addDays, isYmd, dateRange, round2, inr, fmtDate, fmtExpiry, textMatch, clampLimit, blocks, cols, api, say, escapeRegex, tokenize, mapLimit };
