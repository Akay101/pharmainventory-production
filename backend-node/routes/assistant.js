// DavaDesk AI assistant
//   POST   /api/assistant/chat                    streamed turn (SSE): {conversation_id?, message} or {conversation_id, action, label}
//   GET    /api/assistant/conversations           ?search=&before=&limit=
//   GET    /api/assistant/conversations/:id       chat + messages
//   PATCH  /api/assistant/conversations/:id       {title?, pinned?}
//   DELETE /api/assistant/conversations/:id
//   DELETE /api/assistant/conversations           delete all of the user's chats
//   POST   /api/assistant/messages/:id/feedback   {value: "up"|"down"|null}
//   GET    /api/assistant/lookup?kind=medicine|supplier&q=   search box of a picker card
//   POST   /api/assistant/transcribe?session=&mode=live|final&lang=auto|hi&context=   WAV body -> {text}
//   POST   /api/assistant/transcribe/finish   {session} charge the dictation
//   GET    /api/assistant/transcribe/status   {available, code?} before the mic opens
const express = require("express");
const mongoose = require("mongoose");
const { auth } = require("../middleware/auth");
const { requireSubscription } = require("../middleware/subscription");
const store = require("../services/assistant/store");
const runtime = require("../services/assistant/runtime");
const { streamSpeech } = require("../services/assistant/tts");
const limits = require("../services/assistant/limits");
const { acceptImages } = require("../services/ai/scanService");
const { pickerSearch } = require("../services/assistant/tools/lookup");
const credits = require("../services/credits");
const stt = require("../services/assistant/stt");

const router = express.Router();
const db = () => mongoose.connection.db;

// Photos come as multipart (field "files", up to 4); plain turns as JSON
const maybeImages = (req, res, next) => (req.is("multipart/form-data") ? acceptImages(4)(req, res, next) : next());

router.post("/chat", auth, requireSubscription(), maybeImages, (req, res) => runtime.handle({ req, res, db: db() }));

// Catalog + medicine database (or your suppliers + distributors) for a picker card
router.get("/lookup", auth, requireSubscription(), async (req, res, next) => {
  try {
    const ctx = { db: db(), user: req.user, pharmacyId: req.user.pharmacy_id, authorization: req.headers.authorization };
    res.json(await pickerSearch(ctx, req.query.kind === "supplier" ? "supplier" : "medicine", req.query.q));
  } catch (err) {
    next(err);
  }
});

// POST /api/assistant/tts {text, language} -> streamed 16-bit PCM, 24 kHz mono
router.post("/tts", auth, requireSubscription(), async (req, res) => {
  const text = String(req.body?.text || "").slice(0, 4000);
  if (!text.trim()) return res.status(400).json({ detail: "Nothing to speak" });
  try {
    await limits.consumeTts(req.user);
  } catch (err) {
    return res.status(429).json({ detail: err.message });
  }
  // Spoken replies use credits
  const pharmacy = await db().collection("pharmacies").findOne({ id: req.user.pharmacy_id }, { projection: { _id: 0, id: 1, subscription: 1 } });
  const cfg = await credits.config.getConfig(db());
  const gate = await credits.policy.canSpend(db(), cfg, pharmacy || { id: req.user.pharmacy_id });
  if (!gate.ok) return res.status(402).json({ detail: "Spoken replies need AI credits", code: "NO_CREDITS" });
  const voiceMeter = credits.meter.createMeter();
  credits.meter.enter(voiceMeter);
  const ctrl = new AbortController();
  res.on("close", () => !res.writableFinished && ctrl.abort());
  res.setHeader("Content-Type", "audio/L16; rate=24000; channels=1");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Accel-Buffering", "no");
  try {
    await streamSpeech({ text, language: req.body?.language, signal: ctrl.signal, onChunk: (b) => res.write(b) });
    res.end();
    await credits
      .settle(db(), pharmacy || { id: req.user.pharmacy_id }, voiceMeter, { ref: `voice:${req.user.id}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`, task: "voice", engine: "pro", userId: req.user.id, label: "Spoken reply" })
      .catch((err) => console.error("[assistant tts] charging credits failed:", err.message));
  } catch (err) {
    console.warn("[assistant tts]", err.message);
    if (!res.headersSent && err.code === "VOICE_QUOTA") {
      return res.status(429).json({ detail: "Voice replies are paused for today (daily voice limit reached)", code: "VOICE_QUOTA" });
    }
    if (!res.headersSent) return res.status(502).json({ detail: "Voice is unavailable right now" });
    res.end();
  }
});

// Voice typing: one phrase of a dictation (16 kHz WAV) -> text
router.post(
  "/transcribe",
  auth,
  requireSubscription(),
  express.raw({ type: ["audio/wav", "audio/x-wav", "application/octet-stream"], limit: "3mb" }),
  async (req, res) => {
    const session = String(req.query.session || "");
    if (!stt.validSession(session)) return res.status(400).json({ detail: "Missing dictation session", code: "BAD_SESSION" });
    if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ detail: "No audio received", code: "BAD_AUDIO" });
    const mode = req.query.mode === "final" ? "final" : "live";
    const lang = req.query.lang === "hi" ? "hi" : "auto";
    try {
      await limits.consumeStt(req.user);
    } catch (err) {
      return res.status(429).json({ detail: err.message, code: "STT_BUSY" });
    }
    try {
      stt.startSweeper(db());
      const existing = await db().collection("stt_sessions").findOne({ id: session }, { projection: { pharmacy_id: 1, settled_at: 1, calls: 1 } });
      if (existing && (existing.pharmacy_id !== req.user.pharmacy_id || existing.settled_at)) {
        return res.status(409).json({ detail: "This dictation has ended", code: "SESSION_CLOSED" });
      }
      // A dictation needs credits to start; once started it runs to the end
      if (!existing) {
        const pharmacy = await db().collection("pharmacies").findOne({ id: req.user.pharmacy_id }, { projection: { _id: 0, id: 1, subscription: 1 } });
        const cfg = await credits.config.getConfig(db());
        const gate = await credits.policy.canSpend(db(), cfg, pharmacy || { id: req.user.pharmacy_id });
        if (!gate.ok) return res.status(402).json({ detail: "Accurate voice typing needs AI credits", code: "NO_CREDITS" });
      }
      const ctrl = new AbortController();
      res.on("close", () => !res.writableFinished && ctrl.abort());
      const out = await stt.transcribe(db(), {
        pharmacyId: req.user.pharmacy_id,
        audio: req.body,
        mode,
        lang,
        context: String(req.query.context || "").slice(0, 300),
        signal: ctrl.signal,
      });
      await stt.record(db(), req.user, session, out, mode).catch((err) => console.warn("[stt] record:", err.message));
      res.json({ text: out.text, seconds: Math.round(out.seconds * 10) / 10 });
    } catch (err) {
      if (err instanceof stt.SttError) {
        if (err.code === "CANCELLED") return res.end();
        return res.status(err.status).json({ detail: err.message, code: err.code });
      }
      console.error("[stt]", err);
      res.status(500).json({ detail: "Voice typing failed", code: "STT_FAILED" });
    }
  }
);

router.get("/transcribe/status", auth, requireSubscription(), async (req, res) => {
  if (!stt.ready()) return res.json({ available: false, code: "STT_UNAVAILABLE" });
  try {
    const pharmacy = await db().collection("pharmacies").findOne({ id: req.user.pharmacy_id }, { projection: { _id: 0, id: 1, subscription: 1 } });
    const cfg = await credits.config.getConfig(db());
    const gate = await credits.policy.canSpend(db(), cfg, pharmacy || { id: req.user.pharmacy_id });
    res.json(gate.ok ? { available: true } : { available: false, code: "NO_CREDITS" });
  } catch {
    res.json({ available: true }); // the upload itself checks again
  }
});

router.post("/transcribe/finish", auth, async (req, res) => {
  const session = String(req.body?.session || "");
  if (!stt.validSession(session)) return res.status(400).json({ detail: "Missing dictation session" });
  try {
    const r = await stt.settleSession(db(), session, req.user.pharmacy_id);
    res.json({ credits: r.credits || 0 });
  } catch (err) {
    console.error("[stt] finish:", err.message);
    res.json({ credits: 0 });
  }
});

router.get("/conversations", auth, async (req, res, next) => {
  try {
    const out = await store.listConversations(db(), req.user, {
      limit: Math.min(50, parseInt(req.query.limit) || 30),
      before: req.query.before,
      search: req.query.search ? String(req.query.search).slice(0, 80) : undefined,
    });
    res.json({ ...out, retention_days: store.RETENTION_DAYS });
  } catch (err) {
    next(err);
  }
});

router.get("/conversations/:id", auth, async (req, res, next) => {
  try {
    const c = await store.getConversation(db(), req.user, req.params.id);
    if (!c) return res.status(404).json({ detail: "This chat no longer exists. Chats are kept for 30 days." });
    const messages = await store.getMessages(db(), c.id);
    const { state, ...conversation } = c;
    res.json({ conversation, messages, open_drafts: Object.keys(state?.drafts || {}) });
  } catch (err) {
    next(err);
  }
});

router.patch("/conversations/:id", auth, async (req, res, next) => {
  try {
    const ok = await store.renameConversation(db(), req.user, req.params.id, req.body || {});
    if (!ok) return res.status(404).json({ detail: "Chat not found" });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.delete("/conversations/:id", auth, async (req, res, next) => {
  try {
    const ok = await store.deleteConversation(db(), req.user, req.params.id);
    if (!ok) return res.status(404).json({ detail: "Chat not found" });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.delete("/conversations", auth, async (req, res, next) => {
  try {
    res.json({ deleted: await store.deleteAll(db(), req.user) });
  } catch (err) {
    next(err);
  }
});

router.post("/messages/:id/feedback", auth, async (req, res, next) => {
  try {
    const value = ["up", "down"].includes(req.body?.value) ? req.body.value : null;
    const mine = (await db().collection("assistant_conversations").find({ user_id: req.user.id }, { projection: { id: 1 } }).toArray()).map((c) => c.id);
    await store.setFeedback(db(), mine, req.params.id, value);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
