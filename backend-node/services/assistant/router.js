// Intent router: picks the micro-agent for a message, detects the language,
// and writes the loader line the user sees while the agent works.
const llm = require("./llm");
const { AGENTS } = require("./agents");

const SCHEMA = {
  type: "object",
  properties: {
    agent: { type: "string", enum: Object.keys(AGENTS) },
    language: { type: "string", enum: ["en", "hinglish", "hi"], description: "en = English; hinglish = Hindi in Latin script (incl. mixed); hi = Devanagari" },
    loader: { type: "string", description: "3-7 word status line in the user's language describing what you're about to do, e.g. 'Neelkanth ki purchases dhoondh raha hoon', 'Checking Dolo 650 stock', 'Purchase ka draft bana raha hoon'. Never say something is being saved/added/created in the system: nothing is saved until the user confirms." },
    title: { type: "string", description: "2-5 word chat title in the user's language" },
    task: {
      type: "string",
      enum: ["question", "lookup", "report", "action"],
      description:
        "question = greeting, medicine info, how-to, anything answered without the pharmacy's records; lookup = a fact, total or list from the pharmacy's data ('aaj ki sale kitni', 'Dolo ka stock', 'Ramesh ka udhaar', 'last 3 din ki purchase'); report = analysis over time, trends, comparisons, top-N rankings, graphs/charts, dashboards ('sales ka graph', 'pichhle mahine se compare', 'top 10 medicines'); action = create/edit/delete/pay/save anything, a draft, or continuing a draft (incl. giving batch/qty/rate for it), or any photo",
    },
  },
  required: ["agent", "language", "loader", "task"],
};

const SYSTEM = `You route messages inside a pharmacy software assistant to exactly one specialist agent.
Agents:
${Object.values(AGENTS).map((a) => `- ${a.id}: ${a.description}`).join("\n")}

Rules:
- Pick the agent whose module owns the data or action asked for. "Do I have X / alternate to X / stock" → inventory. "Did I buy X / purchase / supplier invoice" → purchase. "Sell / bill / sale" → billing. Medical questions (uses, side effects, dosage) → medi.
- Reports/graphs: sales/profit/bills analytics → billing; purchase spend analytics → purchase; stock value/expiry analytics → inventory; customer dues/spend analytics → customer; supplier analytics → supplier; mixed whole-business reports or dashboards → app.
- Photos: a supplier invoice/bill + "purchase chadha do / add" → purchase. A medicine pack + "bill bana do / sell" → billing. A pack + "find in inventory / stock hai?" → inventory. A pack + "ye kya dawai hai / uses" → medi.
- A short follow-up ("haan", "save kar do", "batch B12 hai", a number, a name) continues the previous agent, especially when a draft is open.
- The user can switch topic any time; route by the new intent.
- Questions about the assistant itself (who made you, how you work, which AI/API/backend) and anything unrelated to pharmacy work (coding, general knowledge, entertainment, etc.) → app.
- language: copy the user's own style for THIS message.
- task: when unsure between two, pick the heavier one (action > report > lookup > question).`;

async function route({ message, recent, lastAgent, drafts, wantTitle, signal }) {
  const context = [
    recent.length ? `Recent conversation:\n${recent.map((m) => `${m.role === "user" ? "User" : `Assistant(${m.agent || "?"})`}: ${String(m.text || "").slice(0, 300)}`).join("\n")}` : "",
    lastAgent ? `Previous agent: ${lastAgent}` : "",
    drafts.length ? `Open drafts: ${drafts.map((d) => `${d.kind} (${d.id})`).join(", ")}` : "",
    `New message: ${message}`,
    wantTitle ? "Also give a title." : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  try {
    const out = await llm.json({ role: "router", system: SYSTEM, contents: [{ role: "user", parts: [{ text: context }] }], schema: SCHEMA, signal, timeoutMs: 12000 });
    if (!AGENTS[out.agent]) out.agent = lastAgent || "app";
    if (!["question", "lookup", "report", "action"].includes(out.task)) out.task = drafts.length ? "action" : "lookup";
    return out;
  } catch (err) {
    if (err.category === "cancelled") throw err;
    // Router trouble shouldn't block the user: fall back to the last agent
    return { agent: lastAgent || "app", language: /[ऀ-ॿ]/.test(message) ? "hi" : "en", loader: "Working on it", task: "action" };
  }
}

module.exports = { route };
