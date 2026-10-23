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
  pro: { question: 1.5, lookup: 3, report: 7, action: 10, photo: 14, voice: 1.5, scan: 4 },
  swift: { question: 0.4, lookup: 0.6, report: 1.2, action: 2, photo: 5, voice: 1.5, scan: 4 },
};
const TASKS = {
  question: { label: "Ask a question", hint: "Medicine info, how-to, greetings" },
  lookup: { label: "Look something up", hint: "Stock, a bill, a customer's dues" },
  report: { label: "Report or chart", hint: "Sales trends, top medicines, dashboards" },
  action: { label: "Create or change records", hint: "Purchase or bill drafts, payments, edits" },
  photo: { label: "Read a photo in chat", hint: "Invoice or medicine pack" },
  voice: { label: "Spoken reply", hint: "Per reply read aloud" },
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
        { $match: { type: "USAGE", status: "DONE", created_at: { $gte: new Date(Date.now() - 14 * 864e5) } } },
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

// Turned on in admin and its key set on this server (Precision: Gemini, Swift: Groq)
const engineReady = (config, e) => !!ENGINES[e] && config.engines?.[e]?.enabled !== false && llm.engineReady(e);

// The engine a request runs on: the one asked for when it can run, else the
// other one (the reply is then labelled with the engine that really answered)
function pickEngine(config, wanted) {
  const ok = (e) => engineReady(config, e);
  if (ok(wanted)) return wanted;
  return ok("pro") ? "pro" : "swift";
}

/**
 * Decide how a chat turn runs. Consumes a free message when it falls to free mode.
 * Returns { mode: "full"|"free"|"blocked", engine, wallet, reason? }
 */
async function decideTurn(db, config, { pharmacy, engine, hasPhotos }) {
  const w = await wallet.getWallet(db, config, pharmacy);
  if (wallet.availableMilli(w) >= MIN_START_MILLI) return { mode: "full", engine: pickEngine(config, engine), wallet: w };
  if (hasPhotos) return { mode: "blocked", engine: "swift", wallet: w, reason: "PHOTO_NEEDS_CREDITS" };
  if (config.free_mode?.enabled && (await wallet.takeFreeMessage(db, pharmacy.id, Number(config.free_mode.messages_per_day) || 0))) {
    return { mode: "free", engine: pickEngine(config, "swift"), wallet: w };
  }
  return { mode: "blocked", engine: "swift", wallet: w, reason: "NO_CREDITS" };
}

// Gate for a single paid feature outside chat (voice reply, scanner scan)
async function canSpend(db, config, pharmacy) {
  const w = await wallet.getWallet(db, config, pharmacy);
  return { ok: wallet.availableMilli(w) >= MIN_START_MILLI, wallet: w };
}

const allowedTools = (tools, mode) => (mode === "free" ? tools.filter((t) => !PAID_TOOLS.has(t.name)) : tools);

module.exports = { ENGINES, TASKS, PAID_TOOLS, DEFAULT_ESTIMATES, MIN_START_MILLI, estimates, engineReady, pickEngine, decideTurn, canSpend, allowedTools };
