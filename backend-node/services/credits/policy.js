// What a request may do, given the pharmacy's credits:
//   full    - credits available: every feature, on the chosen engine
//   free    - no credits: questions, lookups, medicine info and reports only,
//             on the economy engine, a limited number of messages a day
//   blocked - no credits and today's free messages are used up
const wallet = require("./wallet");
const llm = require("../assistant/llm");

const ENGINES = {
  pro: { id: "pro", name: "Precision", blurb: "Most accurate. Best for purchases, bills and invoices." },
  swift: { id: "swift", name: "Swift", blurb: "Fast and light on credits. Great for questions, lookups and reports." },
};

// Tools that create, change or delete records, or read photos: credits only
const PAID_TOOLS = new Set([
  "draft_bill",
  "record_bill_payment",
  "delete_bill",
  "read_invoice_photo",
  "read_product_photo_for_purchase",
  "read_product_photo",
  "identify_product_photo",
  "change_setting",
  "add_stock",
  "save_customer",
  "settle_customer_dues",
  "save_supplier",
  "pay_supplier",
  "draft_purchase",
  "save_purchase_as_draft",
  "delete_purchase",
  "record_purchase_payment",
]);

// What each kind of request typically uses (credits), measured on real turns
// (Oct 2026 prices); replaced by live averages once there is enough usage
const DEFAULT_ESTIMATES = {
  pro: { question: 1.3, lookup: 2.1, report: 3.4, action: 3, photo: 6.5, voice: 1.5, scan: 3, dictation: 1.2 },
  swift: { question: 0.4, lookup: 0.6, report: 1.5, action: 1.7, photo: 5, voice: 1.5, scan: 3, dictation: 1.2 },
};
// Live averages only from usage after the move to Flash-Lite for records and
// reports (older rows were priced on Flash)
const ESTIMATES_FROM = new Date("2026-10-24T00:00:00Z");
const TASKS = {
  question: { label: "Ask a question", hint: "Medicine info, how-to, greetings" },
  lookup: { label: "Look something up", hint: "Stock, a bill, a customer's dues" },
  report: { label: "Report or chart", hint: "Sales trends, top medicines, dashboards" },
  action: { label: "Create or change records", hint: "Purchase or bill drafts, payments, edits" },
  photo: { label: "Read a photo in chat", hint: "Invoice or medicine pack" },
  voice: { label: "Spoken reply", hint: "Per reply read aloud" },
  dictation: { label: "Voice typing", hint: "Per dictation, about 15 seconds" },
  scan: { label: "Scanner page scan", hint: "Purchase invoice or pack scan" },
};

const MIN_START_MILLI = 1000; // need at least 1 credit to start a full request

let estCache = { at: 0, value: null };
// Average credits per task and engine over the last 14 days (once there are
// enough samples), else the defaults
async function estimates(db) {
  if (estCache.value && Date.now() - estCache.at < 10 * 60 * 1000) return estCache.value;
  const out = JSON.parse(JSON.stringify(DEFAULT_ESTIMATES));
  try {
    const rows = await db
      .collection(wallet.LEDGER)
      .aggregate([
        { $match: { type: "USAGE", status: "DONE", created_at: { $gte: new Date(Math.max(Date.now() - 14 * 864e5, ESTIMATES_FROM.getTime())) } } },
        { $group: { _id: { task: "$task", engine: "$engine" }, avg: { $avg: "$amount_milli" }, n: { $sum: 1 } } },
      ])
      .toArray();
    for (const r of rows) {
      const { task, engine } = r._id || {};
      if (r.n >= 8 && out[engine] && task in out[engine]) out[engine][task] = Math.round((Math.abs(r.avg) / 1000) * 10) / 10;
    }
  } catch {}
  estCache = { at: Date.now(), value: out };
  return out;
}

// Which engine runs a task. auto: Swift for light work (questions, lookups),
// Precision for records, reports and photos; a fixed mode uses its provider
// for everything (Nemotron shows as Swift)
function engineFor(config, tier) {
  if (config.ai_mode === "gemini") return "pro";
  if (config.ai_mode === "groq" || config.ai_mode === "nemotron") return "swift";
  return tier === "light" ? "swift" : "pro";
}

// Whether an engine can answer here right now (its provider's key is set and
// the admin's mode allows it)
function engineReady(config, e) {
  if (!ENGINES[e]) return false;
  const mode = config.ai_mode || "auto";
  if (mode === "gemini") return e === "pro" && llm.providerReady("gemini");
  if (mode === "groq") return e === "swift" && llm.providerReady("groq");
  if (mode === "nemotron") return e === "swift" && llm.providerReady("nvidia");
  return llm.providerReady(e === "pro" ? "gemini" : "groq");
}

/**
 * Decide how a chat turn runs. Consumes a free message when it falls to free mode.
 * Returns { mode: "full"|"free"|"blocked", engine, wallet, reason? }
 */
async function decideTurn(db, config, { pharmacy, hasPhotos }) {
  const w = await wallet.getWallet(db, config, pharmacy);
  if (wallet.availableMilli(w) >= MIN_START_MILLI) return { mode: "full", wallet: w };
  if (hasPhotos) return { mode: "blocked", wallet: w, reason: "PHOTO_NEEDS_CREDITS" };
  // Light mode is part of the plan: an active subscription with budget left
  const sub = pharmacy?.subscription;
  const budget = wallet.planBudget(config, sub, w);
  const included = wallet.isActiveSub(sub) && (!budget || budget.left > 0);
  if (included && config.free_mode?.enabled && (await wallet.takeFreeMessage(db, pharmacy.id, Number(config.free_mode.messages_per_day) || 0))) {
    return { mode: "free", wallet: w };
  }
  return { mode: "blocked", wallet: w, reason: "NO_CREDITS" };
}

// Gate for a single paid feature outside chat (voice reply, scanner scan)
async function canSpend(db, config, pharmacy) {
  const w = await wallet.getWallet(db, config, pharmacy);
  return { ok: wallet.availableMilli(w) >= MIN_START_MILLI, wallet: w };
}

const allowedTools = (tools, mode) => (mode === "free" ? tools.filter((t) => !PAID_TOOLS.has(t.name)) : tools);

module.exports = { ENGINES, TASKS, PAID_TOOLS, DEFAULT_ESTIMATES, MIN_START_MILLI, estimates, engineReady, engineFor, decideTurn, canSpend, allowedTools };
