// DavaDesk AI assistant
//   POST   /api/assistant/chat                    streamed turn (SSE): {conversation_id?, message} or {conversation_id, action, label}
//   GET    /api/assistant/conversations           ?search=&before=&limit=
//   GET    /api/assistant/conversations/:id       chat + messages
//   PATCH  /api/assistant/conversations/:id       {title?, pinned?}
//   DELETE /api/assistant/conversations/:id
//   DELETE /api/assistant/conversations           delete all of the user's chats
//   POST   /api/assistant/messages/:id/feedback   {value: "up"|"down"|null}
const express = require("express");
const mongoose = require("mongoose");
const { auth } = require("../middleware/auth");
const { requireSubscription } = require("../middleware/subscription");
const store = require("../services/assistant/store");
const runtime = require("../services/assistant/runtime");
const { streamSpeech } = require("../services/assistant/tts");
const limits = require("../services/assistant/limits");
const { acceptImages } = require("../services/ai/scanService");

const router = express.Router();
const db = () => mongoose.connection.db;

// Photos come as multipart (field "files", up to 4); plain turns as JSON
const maybeImages = (req, res, next) => (req.is("multipart/form-data") ? acceptImages(4)(req, res, next) : next());

router.post("/chat", auth, requireSubscription(), maybeImages, (req, res) => runtime.handle({ req, res, db: db() }));

// POST /api/assistant/tts {text, language} -> streamed 16-bit PCM, 24 kHz mono
router.post("/tts", auth, requireSubscription(), async (req, res) => {
  const text = String(req.body?.text || "").slice(0, 4000);
  if (!text.trim()) return res.status(400).json({ detail: "Nothing to speak" });
  try {
    await limits.consumeTts(req.user);
  } catch (err) {
    return res.status(429).json({ detail: err.message });
  }
  const ctrl = new AbortController();
  res.on("close", () => !res.writableFinished && ctrl.abort());
  res.setHeader("Content-Type", "audio/L16; rate=24000; channels=1");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Accel-Buffering", "no");
  try {
    await streamSpeech({ text, language: req.body?.language, signal: ctrl.signal, onChunk: (b) => res.write(b) });
    res.end();
  } catch (err) {
    console.warn("[assistant tts]", err.message);
    if (!res.headersSent) return res.status(502).json({ detail: "Voice is unavailable right now" });
    res.end();
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
