// Assistant runtime: one user turn = route -> agent tool loop -> streamed
// reply, or a button action (save/confirm) executed directly.
//
// Server-sent events to the client:
//   meta    {conversation_id, title}
//   route   {agent, label, loader}
//   status  {text}                  a tool is running
//   block   {block}                 table / stats / draft / confirm / choices / result
//   delta   {text}                  streamed reply text
//   done    {message}               final stored assistant message
//   error   {detail}
const { v4: uuidv4 } = require("uuid");
const store = require("./store");
const llm = require("./llm");
const { route } = require("./router");
const { AGENTS, systemPrompt, turnContext, COMMIT, SAVE_AS_DRAFT, OPS } = require("./agents");
const credits = require("../credits");
const crypto = require("crypto");
const limits = require("./limits");
const { say, todayIst } = require("./tools/shared");
const attachments = require("./attachments");

const MAX_STEPS = 6;
const HINGLISH = new Set("hai hain ho hoon tha thi kya kaise kaisa kitna kitni kitne kab kaha kahan kyun kyu mein mai main mujhe mera meri mere aap aapka tum tumhara humara hum ka ki ke ko se par pe aur ya bhi nahi nahin mat batao bata dikhao dikha karo kar kardo karna chahiye sakte sakta sakti wala wali wale aaj kal abhi sab sabse thoda zyada jyada kuch koi bana banao bhai ji haan accha theek".split(" "));
const hinglishWords = (t) => (String(t).toLowerCase().match(/[a-z]+/g) || []).filter((w) => HINGLISH.has(w)).length;

const LANG_NAMES = { en: "English", hinglish: "Hinglish (Hindi in Latin script)", hi: "Hindi in Devanagari script" };
const HISTORY_TURNS = 12;

function sse(res) {
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // nginx: don't buffer the stream
  res.flushHeaders?.();
  const beat = setInterval(() => res.write(": ping\n\n"), 15000);
  return {
    send: (event, data) => {
      if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    },
    end: () => {
      clearInterval(beat);
      if (!res.writableEnded) res.end();
    },
  };
}

// The agent ends a reply with "::choices:: A => a | B => b" for tappable
// options. This filter streams the text but holds back that trailer, then
// parses it into a choices block.
const MARKER = "::choices";
// Notes the model sometimes copies from the history (<ui>…</ui>, <context>…</context>)
// are internal: never shown
const INTERNAL = /<(ui|context)>[\s\S]*?<\/\1>/g;
const INTERNAL_OPEN = /<(ui|context)>(?![\s\S]*<\/\1>)/;
function choicesFilter(send) {
  let raw = "";
  let full = "";
  let sent = 0;
  return {
    push(t) {
      raw += t;
      full = raw.replace(INTERNAL, "");
      const at = full.indexOf(MARKER);
      let safeEnd = at >= 0 ? at : full.length;
      // An internal note still open: hold everything from its start
      const open = full.search(INTERNAL_OPEN);
      if (open >= 0) safeEnd = Math.min(safeEnd, open);
      if (at < 0 && open < 0) {
        // Hold back a tail that could be the start of the marker or a note
        for (let k = Math.min(MARKER.length - 1, full.length); k > 0; k--) {
          const tail = full.slice(-k);
          if (MARKER.startsWith(tail) || "<context>".startsWith(tail) || "<ui>".startsWith(tail)) {
            safeEnd = full.length - k;
            break;
          }
        }
      }
      if (safeEnd > sent) {
        send(full.slice(sent, safeEnd));
        sent = safeEnd;
      }
    },
    finish() {
      full = full.replace(/<(ui|context)>[\s\S]*$/, ""); // a note that never closed
      const at = full.indexOf(MARKER);
      if (at < 0) {
        if (full.length > sent) send(full.slice(sent));
        return { text: full.trim(), choices: null };
      }
      const m = full.slice(at).match(/^::choices(?:\[(dropdown|buttons)\])?::\s*([\s\S]*)$/);
      const options = (m?.[2] || "")
        .split("|")
        .map((part) => {
          const [label, reply] = part.split("=>").map((x) => (x || "").trim());
          return label ? { label: label.slice(0, 60), reply: (reply || label).slice(0, 300) } : null;
        })
        .filter(Boolean)
        .slice(0, 8);
      return { text: full.slice(0, at).trim(), choices: options.length ? { type: "choices", style: m?.[1] || (options.length > 5 ? "dropdown" : "buttons"), question: "", options } : null };
    },
  };
}

// Give every actionable button a single-use token (double taps can't
// record a payment twice)
function stampActions(block) {
  const stamp = (a) => (a?.action && ["commit", "op"].includes(a.action.type) ? { ...a, action: { ...a.action, nonce: uuidv4() } } : a);
  const out = { ...block };
  if (Array.isArray(out.actions)) out.actions = out.actions.map(stamp);
  return out;
}

// Stored messages -> compact model history (text plus what was shown)
// Tool results go back to the model as input tokens: long lists are cut to
// what it needs to answer (the full table is already on screen)
const RESULT_CHAR_BUDGET = 9000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// "08/27" reads as a date to a model; expiries go out as "Aug 2027"
function readableExpiry(v) {
  const s = String(v || "").trim();
  let m;
  if ((m = s.match(/^(\d{1,2})\/(\d{2})$/))) return +m[1] >= 1 && +m[1] <= 12 ? `${MONTHS[+m[1] - 1]} 20${m[2]}` : v;
  if ((m = s.match(/^(\d{4})-(\d{2})(?:-\d{2})?$/))) return +m[2] >= 1 && +m[2] <= 12 ? `${MONTHS[+m[2] - 1]} ${m[1]}` : v;
  return v;
}
function withReadableDates(v, key = "") {
  if (Array.isArray(v)) return v.map((x) => withReadableDates(x, key));
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, withReadableDates(x, k)]));
  return /expir/i.test(key) && typeof v === "string" ? readableExpiry(v) : v;
}
function compactResult(raw) {
  const result = withReadableDates(raw);
  let json;
  try {
    json = JSON.stringify(result);
  } catch {
    return result;
  }
  if (!json || json.length <= RESULT_CHAR_BUDGET) return result;
  const trim = (v, depth = 0) => {
    if (Array.isArray(v)) {
      const keep = v.slice(0, depth ? 10 : 30).map((x) => trim(x, depth + 1));
      return v.length > keep.length ? [...keep, { note: `${v.length - keep.length} more not shown here (visible to the user)` }] : keep;
    }
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, trim(x, depth + 1)]));
    if (typeof v === "string" && v.length > 400) return `${v.slice(0, 400)}…`;
    return v;
  };
  const out = trim(result);
  const again = JSON.stringify(out);
  return again.length <= RESULT_CHAR_BUDGET * 1.5 ? out : { summary: again.slice(0, RESULT_CHAR_BUDGET), truncated: true };
}

// The reply when a turn can't run for lack of credits
function noCreditsReply(reason, lang, cfg) {
  if (reason === "PHOTO_NEEDS_CREDITS") {
    return {
      card: "Reading photos needs AI credits.",
      text: say(lang, {
        en: "Reading photos needs AI credits, and you're out of credits right now. Buy credits from the Credits button at the top, or use the Scan page once you have credits.",
        hinglish: "Photo padhne ke liye AI credits chahiye, aur abhi credits khatam hain. Upar Credits button se credits le lijiye.",
        hi: "फ़ोटो पढ़ने के लिए AI क्रेडिट चाहिए, और अभी क्रेडिट खत्म हैं। ऊपर Credits बटन से क्रेडिट ले लीजिए।",
      }),
    };
  }
  const n = Number(cfg?.free_mode?.messages_per_day) || 0;
  return {
    card: "Today's free messages are used up.",
    text: say(lang, {
      en: `You're out of AI credits and today's ${n} free messages are used up. Buy credits from the Credits button at the top to keep going; everything else in the app works as usual.`,
      hinglish: `AI credits khatam hain aur aaj ke ${n} free messages bhi ho gaye. Aage chalane ke liye upar Credits button se credits le lijiye; app ka baaki sab kaam normal chalega.`,
      hi: `AI क्रेडिट खत्म हैं और आज के ${n} मुफ़्त संदेश भी हो गए। आगे चलाने के लिए ऊपर Credits बटन से क्रेडिट ले लीजिए; ऐप का बाकी सब काम सामान्य चलेगा।`,
    }),
  };
}

// Older messages are shortened: the last few exchanges carry the detail, the
// rest only needs to say what was discussed
const FULL_RECENT = 6;
const OLD_TEXT_CHARS = 500;
function toHistory(messages) {
  const turns = [];
  const recent = messages.slice(-HISTORY_TURNS * 2);
  recent.forEach((m, idx) => {
    const old = idx < recent.length - FULL_RECENT;
    let text = String(m.text || "");
    if (old && text.length > OLD_TEXT_CHARS) text = `${text.slice(0, OLD_TEXT_CHARS)}…`;
    if (m.role === "assistant" && m.blocks?.length) {
      const notes = m.blocks
        .map((b) => (b.type === "table" ? `table "${b.title}" (${b.rows?.length || 0} rows)` : b.type === "draft" ? `${b.kind} draft ${b.draft_id}` : b.type === "result" ? `result: ${b.title}${b.text ? ` – ${b.text}` : ""}` : b.type === "confirm" ? `confirm card: ${b.title}` : b.type === "picker" ? `picker card: ${b.title}` : b.type === "stats" ? `stats: ${(b.items || []).map((i) => `${i.label} ${i.value}`).join(", ")}` : b.type === "chart" ? `${b.chart} chart "${b.title}" (${b.subtitle || ""}; ${(b.kpis || []).map((k) => `${k.label} ${k.value}`).join(", ")})` : null))
        .filter(Boolean);
      if (notes.length) text += `\n<ui>${notes.join("; ")}</ui>`;
    }
    if (!text.trim()) return;
    const role = m.role === "user" ? "user" : "model";
    const prev = turns[turns.length - 1];
    if (prev && prev.role === role) prev.parts[0].text += `\n${text}`;
    else turns.push({ role, parts: [{ text }] });
  });
  while (turns.length && turns[0].role !== "user") turns.shift();
  return turns;
}

async function handle({ req, res, db }) {
  const user = req.user;
  const body = { ...(req.body || {}) };
  // Multipart turns send fields as strings
  if (typeof body.action === "string") {
    try {
      body.action = JSON.parse(body.action);
    } catch {
      body.action = null;
    }
  }
  body.voice = body.voice === true || body.voice === "true";
  const stream = sse(res);
  const ctrl = new AbortController();
  res.on("close", () => !res.writableFinished && ctrl.abort());

  let conversation;
  let lock = null;
  try {
    await limits.consume(user);
    conversation = body.conversation_id ? await store.getConversation(db, user, body.conversation_id) : null;
    if (body.conversation_id && !conversation) throw Object.assign(new Error("This chat no longer exists (chats are kept for 30 days)."), { status: 404 });
    if (!conversation) conversation = await store.createConversation(db, user);
    lock = await limits.lock(conversation.id);
    stream.send("meta", { conversation_id: conversation.id, title: conversation.title });

    const pharmacy = await db.collection("pharmacies").findOne({ id: user.pharmacy_id }, { projection: { _id: 0, id: 1, name: 1, subscription: 1 } });
    const state = conversation.state || { drafts: {} };
    const language = state.language || "en";
    const shown = [];
    const ctx = {
      db,
      user,
      pharmacyId: user.pharmacy_id,
      authorization: req.headers.authorization,
      language,
      voice: body.voice,
      drafts: { ...(state.drafts || {}) },
      emit: (block) => {
        const b = stampActions(block);
        shown.push(b);
        stream.send("block", { block: b });
      },
      getDraft: (id) => ctx.drafts[id] || null,
      images: null,
      // Photos of this turn, else the ones sent earlier in this chat (1 h)
      getImages: async () => ctx.images || (ctx.images = await attachments.recall(conversation.id)),
      saveDraft: async (d) => {
        ctx.drafts[d.id] = d;
        await store.setDraft(db, conversation.id, d);
      },
      removeDraft: async (id) => {
        delete ctx.drafts[id];
        await store.removeDraft(db, conversation.id, id);
      },
    };

    if (body.action) {
      await handleAction({ body, ctx, conversation, state, stream, db, shown });
      return;
    }

    let message = String(body.message || "").trim().slice(0, 4000);
    let thumbs = [];
    if (req.files?.length) {
      const prepared = await attachments.prepare(req.files);
      ctx.images = prepared.images;
      thumbs = prepared.thumbs;
      await attachments.remember(conversation.id, prepared.images);
      if (!message) message = say(language, { en: "Here's a photo", hinglish: "Ye photo dekho", hi: "यह फ़ोटो देखिए" });
    }
    if (!message) throw Object.assign(new Error("Type a message"), { status: 400 });
    await store.addMessage(db, conversation.id, { role: "user", text: message, ...(thumbs.length ? { images: thumbs } : {}), ...(body.voice ? { voice: true } : {}) });

    // 0. Credits: full (credits), free light mode, or blocked
    const creditCfg = await credits.config.getConfig(db);
    const decision = await credits.policy.decideTurn(db, creditCfg, { pharmacy: pharmacy || { id: user.pharmacy_id }, hasPhotos: !!ctx.images?.length });
    if (decision.mode === "blocked") {
      // No router call here: the message's own script/words tell the language
      const letters = message.replace(/[^\p{L}]/gu, "");
      const deva = (message.match(/[\u0900-\u097F]/g) || []).length;
      const replyLang = letters.length && deva / letters.length > 0.5 ? "hi" : hinglishWords(message) >= 2 ? "hinglish" : language;
      const reply = noCreditsReply(decision.reason, replyLang, creditCfg);
      ctx.emit({ type: "credits", reason: decision.reason, text: reply.card });
      stream.send("delta", { text: reply.text });
      const savedBlocked = await store.addMessage(db, conversation.id, { role: "assistant", agent: "app", language: replyLang, text: reply.text, blocks: shown });
      stream.send("done", { message: { ...savedBlocked, expires_at: undefined, _id: undefined }, credits: credits.wallet.view(decision.wallet), mode: "blocked" });
      return;
    }
    ctx.mode = decision.mode;
    // Who answers is the admin's ai_mode. Routing picks the agent, so in auto it
    // runs on Gemini Flash-Lite (Groq's small model misroutes some requests,
    // e.g. a supplier payment to the customer agent); ~₹0.02 a message
    const turnMeter = credits.meter.createMeter();
    turnMeter.aiMode = creditCfg.ai_mode;
    turnMeter.engine = creditCfg.ai_mode === "auto" ? "pro" : credits.policy.engineFor(creditCfg, "light");
    credits.meter.enter(turnMeter); // every AI call from here on is metered for this turn
    const history = await store.getMessages(db, conversation.id, { limit: HISTORY_TURNS * 2 + 1 });

    // 1. Route
    const r = await route({
      message: ctx.images?.length ? `${message}\n[The user attached ${ctx.images.length} photo(s) with this message]` : message,
      recent: history.slice(-7, -1),
      lastAgent: state.last_agent,
      drafts: Object.values(ctx.drafts),
      wantTitle: !conversation.message_count,
      signal: ctrl.signal,
    });
    const agent = AGENTS[r.agent];
    // Small model for questions and lookups; the strong one for records, reports and photos
    const tier = ctx.mode === "free" ? "light" : r.task === "action" || r.task === "report" || ctx.images?.length ? "heavy" : "light";
    ctx.engine = credits.policy.engineFor(creditCfg, tier);
    turnMeter.engine = ctx.engine;
    // Mostly-Devanagari input is Hindi, whatever the router guessed
    const letters = message.replace(/[^\p{L}]/gu, "");
    const deva = (message.match(/[\u0900-\u097F]/g) || []).length;
    ctx.language = letters.length && deva / letters.length > 0.5 ? "hi" : r.language || language;
    // Hindi written in English letters is Hinglish even if the router said English
    if (ctx.language === "en" && hinglishWords(message) >= 2) ctx.language = "hinglish";
    // ...and is never answered in Devanagari, even if the router said Hindi
    if (ctx.language === "hi" && !deva && hinglishWords(message) >= 1) ctx.language = "hinglish";
    stream.send("route", { agent: agent.id, label: agent.label[ctx.language] || agent.label.en, loader: r.loader });
    if (r.title && !conversation.message_count) {
      await store.renameConversation(db, user, conversation.id, { title: r.title });
      stream.send("meta", { conversation_id: conversation.id, title: r.title.slice(0, 80) });
    }
    await store.updateState(db, conversation.id, { last_agent: agent.id, language: ctx.language });

    // 2. Agent loop
    const todayDate = todayIst();
    const system = systemPrompt(agent, { mode: ctx.mode, engine: ctx.engine });
    const context = turnContext({
      ...ctx,
      languageName: LANG_NAMES[ctx.language] || "English",
      pharmacyName: pharmacy?.name || "the pharmacy",
      userName: user.name || "the user",
      today: todayDate,
      todayLong: new Date(`${todayDate}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }),
    });
    const contents = toHistory(history);
    // Pin the reply language to the latest message (users switch mid-chat)
    const lastUser = contents[contents.length - 1];
    if (lastUser?.role === "user") {
      // The agent sees this turn's photos itself; its photo tools do the exact reading
      if (ctx.images?.length) {
        lastUser.parts.push(...ctx.images.map((img) => ({ inline_data: { mime_type: img.mimeType, data: img.data.toString("base64") } })));
        lastUser.parts.push({ text: `<attachments>${ctx.images.length} photo(s) attached to this message</attachments>` });
      }
      lastUser.parts.push({ text: context });
    }
    // Chart/report tools only when a report was asked for (~800 tokens a call otherwise)
    const REPORT_TOOLS = new Set(["build_report", "show_chart"]);
    const forTask = r.task === "report" ? agent.tools : agent.tools.filter((t) => !REPORT_TOOLS.has(t.name));
    const tools = credits.policy.allowedTools(forTask, ctx.mode);
    const toolMap = Object.fromEntries(tools.map((t) => [t.name, t]));
    let text = "";
    const toolLog = [];
    const filter = choicesFilter((t) => stream.send("delta", { text: t }));

    // When the chosen engine can't answer the other one takes over: the app is
    // told (and warned when the slow last resort answers), the reply labelled
    let stepEngine = ctx.engine;
    let answered = null;
    // The app's engine tab follows who is answering (Nemotron: slow warning)
    const firstProvider = { gemini: "gemini", groq: "groq", nemotron: "nvidia" }[creditCfg.ai_mode] || (ctx.engine === "swift" ? "groq" : "gemini");
    stream.send("engine", { engine: ctx.engine, provider: firstProvider, slow: firstProvider === "nvidia" });
    let lastNote = firstProvider;
    const onSwitch = (s) => {
      if (lastNote === s.provider) return;
      lastNote = s.provider;
      stream.send("engine", s);
    };
    const agentTurn = async (withTools, forceTool = false) => {
      const out = await llm.turn({ role: "agent", engine: stepEngine, tier, system, contents, ...(withTools ? { tools, forceTool } : {}), thinking: "low", signal: ctrl.signal, onText: (t) => filter.push(t), onSwitch });
      answered = { engine: out.engine, provider: out.provider };
      // Stay on the engine that answered for the rest of the turn (not on the last resort)
      if (out.provider !== "nvidia") stepEngine = out.engine;
      return out;
    };

    for (let step = 0; step < MAX_STEPS; step++) {
      const out = await agentTurn(true, step === 0 && r.task === "action");
      contents.push(out.content);
      if (!out.calls.length) break;

      const responses = [];
      for (const call of out.calls) {
        const t = toolMap[call.name];
        let result;
        if (!t) result = credits.policy.PAID_TOOLS.has(call.name) ? { error: "Needs AI credits: tell the user this action needs credits (Credits button at the top) or can be done on the app's page." } : { error: `Unknown tool ${call.name}` };
        else {
          const label = t.status?.(call.args || {}, ctx.language);
          if (label) stream.send("status", { text: label, tool: call.name });
          const started = Date.now();
          try {
            result = await t.run(call.args || {}, ctx);
          } catch (err) {
            console.error(`[assistant] tool ${call.name} failed:`, err.message);
            result = { error: err.data?.detail || err.message || "Tool failed" };
          }
          toolLog.push({ tool: call.name, ms: Date.now() - started, ok: !result?.error });
        }
        responses.push({ functionResponse: { ...(call.id ? { id: call.id } : {}), name: call.name, response: { result: compactResult(result) } } });
      }
      contents.push({ role: "user", parts: responses });
      if (step === MAX_STEPS - 1) {
        // Out of steps: ask for a final answer without tools
        const final = await agentTurn(false);
        contents.push(final.content);
      }
    }

    const parsed = filter.finish();
    text = parsed.text.replace(/<\/?(ui|reply-language|attachments|context)>/g, "").trim();
    if (parsed.choices) ctx.emit(parsed.choices);

    // Charge for what this turn used (a failed or stopped turn isn't charged)
    const usedEngine = answered?.engine || ctx.engine;
    let usage = {
      mode: ctx.mode,
      engine: usedEngine,
      ...(usedEngine !== ctx.engine ? { switched_from: ctx.engine } : {}),
      ...(answered?.provider === "nvidia" ? { slow: true } : {}),
      tier,
      task: r.task,
      credits: 0,
    };
    let walletAfter = decision.wallet;
    try {
      const charged = await credits.settle(db, pharmacy || { id: user.pharmacy_id }, turnMeter, {
        ref: `turn:${conversation.id}:${crypto.randomUUID()}`,
        task: ctx.images?.length ? "photo" : r.task,
        engine: usedEngine,
        userId: user.id,
        label: String(message).slice(0, 80),
        free: ctx.mode === "free",
      });
      usage.credits = charged.credits;
      if (charged.wallet) walletAfter = charged.wallet;
    } catch (err) {
      console.error("[assistant] charging credits failed:", err.message);
    }
    if (ctx.mode === "free") walletAfter = await credits.wallet.getWallet(db, creditCfg, pharmacy || { id: user.pharmacy_id });
    const saved = await store.addMessage(db, conversation.id, { role: "assistant", agent: agent.id, language: ctx.language, text, blocks: shown, tools: toolLog, usage });
    stream.send("done", { message: { ...saved, expires_at: undefined, _id: undefined }, credits: credits.wallet.view(walletAfter), mode: ctx.mode });
  } catch (err) {
    if (err.category === "cancelled") return;
    console.error("[assistant] turn failed:", err.message);
    const detail =
      err.category === "all_busy" || err.category === "failed"
        ? err.message
        : err.category === "network" || err.category === "timeout"
        ? "Couldn't reach the AI service just now. Please try again."
        : err.category === "blocked"
        ? err.message
        : err.category === "all_busy"
        ? err.message
        : err.status === 429 || err.category === "rate_limit"
        ? err.message || "Too many requests. Please wait a moment."
        : err.status && err.status < 500
        ? err.message
        : "Something went wrong. Please try again.";
    stream.send("error", { detail, code: err.code || err.category || null });
  } finally {
    if (lock) await lock.release();
    stream.end();
  }
}

const FOLLOW_UPS = {
  purchase: (lang) => [
    { label: say(lang, { en: "Add another purchase", hinglish: "Ek aur purchase", hi: "एक और खरीद" }), reply: say(lang, { en: "I want to add another purchase", hinglish: "Ek aur purchase add karni hai", hi: "एक और खरीद जोड़नी है" }) },
    { label: say(lang, { en: "Today's purchases", hinglish: "Aaj ki purchases", hi: "आज की खरीद" }), reply: say(lang, { en: "Show today's purchases", hinglish: "Aaj ki purchases dikhao", hi: "आज की खरीद दिखाओ" }) },
  ],
  bill: (lang) => [
    { label: say(lang, { en: "New bill", hinglish: "Naya bill", hi: "नया बिल" }), reply: say(lang, { en: "Make another bill", hinglish: "Ek aur bill banana hai", hi: "एक और बिल बनाना है" }) },
    { label: say(lang, { en: "Today's sales", hinglish: "Aaj ki sale", hi: "आज की बिक्री" }), reply: say(lang, { en: "How much did I sell today?", hinglish: "Aaj kitni sale hui?", hi: "आज कितनी बिक्री हुई?" }) },
  ],
};

async function handleAction({ body, ctx, conversation, state, stream, db, shown }) {
  const a = body.action || {};
  const lang = ctx.language;
  const label = String(body.label || "").slice(0, 80);
  const used = new Set(state.used_nonces || []);
  const markUsed = async () => {
    if (!a.nonce) return;
    used.add(a.nonce);
    await store.updateState(db, conversation.id, { used_nonces: [...used].slice(-300) });
  };
  if (a.nonce && used.has(a.nonce)) {
    const text = say(lang, { en: "That's already done.", hinglish: "Ye pehle hi ho chuka hai.", hi: "यह पहले ही हो चुका है।" });
    stream.send("delta", { text });
    stream.send("done", { message: { role: "assistant", text, blocks: [] } });
    return;
  }

  await store.addMessage(db, conversation.id, { role: "user", text: label || a.type, action: { type: a.type, op: a.op || null } });
  let text = "";
  let agentId = state.last_agent || null;

  if (a.type === "commit") {
    const draft = ctx.drafts[a.draft_id];
    if (!draft) {
      text = say(lang, { en: "This draft was already saved or discarded.", hinglish: "Ye draft pehle hi save ya cancel ho chuka hai.", hi: "यह ड्राफ्ट पहले ही सेव या रद्द हो चुका है।" });
    } else {
      stream.send("status", { text: say(lang, { en: `Saving the ${draft.kind}`, hinglish: `${draft.kind === "bill" ? "Bill" : "Purchase"} save kar raha hoon`, hi: "सेव कर रहा हूँ" }) });
      try {
        const r = await COMMIT[draft.kind](draft, ctx);
        await markUsed();
        delete ctx.drafts[draft.id];
        await store.removeDraft(db, conversation.id, draft.id);
        ctx.emit(r.block);
        agentId = draft.kind === "bill" ? "billing" : "purchase";
        text = draft.kind === "bill"
          ? say(lang, { en: `Done! Bill ${r.summary.bill_no} is saved and stock is updated.`, hinglish: `Ho gaya! Bill ${r.summary.bill_no} save ho gaya aur stock update ho gaya.`, hi: `हो गया! बिल ${r.summary.bill_no} सेव हो गया और स्टॉक अपडेट हो गया।` })
          : say(lang, { en: `Done! Purchase ${r.summary.invoice_no} from ${r.summary.supplier} is saved and stock is added.`, hinglish: `Ho gaya! ${r.summary.supplier} ki purchase (${r.summary.invoice_no}) save ho gayi aur stock add ho gaya.`, hi: `हो गया! ${r.summary.supplier} की खरीद (${r.summary.invoice_no}) सेव हो गई और स्टॉक जुड़ गया।` });
        ctx.emit({ type: "choices", style: "buttons", question: "", options: FOLLOW_UPS[draft.kind]?.(lang) || [] });
      } catch (err) {
        ctx.emit({ type: "notice", tone: "danger", text: err.data?.detail || err.message });
        text = say(lang, { en: "I couldn't save it. Fix the issue above and tap Save again.", hinglish: "Save nahi ho paya. Upar wali problem theek karke dobara Save dabaiye.", hi: "सेव नहीं हो पाया। ऊपर की समस्या ठीक करके दोबारा सेव दबाइए।" });
      }
    }
  } else if (a.type === "save_draft") {
    const draft = ctx.drafts[a.draft_id];
    if (!draft || !SAVE_AS_DRAFT[draft.kind]) {
      text = say(lang, { en: "This draft was already saved or discarded.", hinglish: "Ye draft pehle hi save ya cancel ho chuka hai.", hi: "यह ड्राफ्ट पहले ही सेव या रद्द हो चुका है।" });
    } else {
      stream.send("status", { text: say(lang, { en: "Saving as a draft", hinglish: "Draft mein save kar raha hoon", hi: "ड्राफ्ट में सेव कर रहा हूँ" }) });
      try {
        const r = await SAVE_AS_DRAFT[draft.kind](draft, ctx);
        await markUsed();
        delete ctx.drafts[draft.id];
        await store.removeDraft(db, conversation.id, draft.id);
        ctx.emit(r.block);
        agentId = "purchase";
        text = say(lang, {
          en: `Saved as draft ${r.summary.draft_no}. Stock isn't added yet: review it on the Purchases page (Draft Purchases), edit anything, then save.`,
          hinglish: `Draft ${r.summary.draft_no} save ho gaya. Stock abhi add nahi hua: Purchases page pe Draft Purchases mein check karke, zarurat ho to edit karke save kar dijiye.`,
          hi: `ड्राफ्ट ${r.summary.draft_no} सेव हो गया। स्टॉक अभी नहीं जुड़ा: Purchases पेज पर Draft Purchases में देखकर, ज़रूरत हो तो बदलकर सेव कर दीजिए।`,
        });
      } catch (err) {
        ctx.emit({ type: "notice", tone: "danger", text: err.data?.detail || err.message });
        text = say(lang, { en: "I couldn't save the draft.", hinglish: "Draft save nahi ho paya.", hi: "ड्राफ्ट सेव नहीं हो पाया।" });
      }
    }
  } else if (a.type === "discard") {
    delete ctx.drafts[a.draft_id];
    await store.removeDraft(db, conversation.id, a.draft_id);
    text = say(lang, { en: "Draft discarded.", hinglish: "Draft cancel kar diya.", hi: "ड्राफ्ट रद्द कर दिया।" });
  } else if (a.type === "op" && OPS[a.op]) {
    stream.send("status", { text: say(lang, { en: "Working on it", hinglish: "Kar raha hoon", hi: "कर रहा हूँ" }) });
    try {
      const r = await OPS[a.op](a, ctx);
      await markUsed();
      if (r.block) ctx.emit(r.block);
      text = r.text || say(lang, { en: "Done.", hinglish: "Ho gaya.", hi: "हो गया।" });
    } catch (err) {
      ctx.emit({ type: "notice", tone: "danger", text: err.data?.detail || err.message });
      text = say(lang, { en: "That didn't go through.", hinglish: "Ye nahi ho paya.", hi: "यह नहीं हो पाया।" });
    }
  } else if (a.type === "dismiss") {
    text = say(lang, { en: "Okay, cancelled.", hinglish: "Theek hai, cancel kar diya.", hi: "ठीक है, रद्द कर दिया।" });
  } else {
    text = say(lang, { en: "I didn't understand that action.", hinglish: "Ye action samajh nahi aaya.", hi: "यह कार्रवाई समझ नहीं आई।" });
  }

  stream.send("delta", { text });
  const saved = await store.addMessage(db, conversation.id, { role: "assistant", agent: agentId, language: lang, text, blocks: shown });
  stream.send("done", { message: { ...saved, expires_at: undefined, _id: undefined } });
}

module.exports = { handle };
