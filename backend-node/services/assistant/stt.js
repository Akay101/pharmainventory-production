// Speech-to-text for the assistant's mic (dictation), on Groq Whisper.
//
// The browser cuts what the user says into phrases at their pauses and sends
// each phrase twice: "live" while it is being spoken (whisper-large-v3-turbo,
// cheap and quick, shown as the user talks) and "final" once the phrase ends
// (whisper-large-v3, the most accurate). One dictation is one session: its
// calls are collected and charged as a single credits entry when the user
// stops, or by the sweeper if the page goes away first.
//
// Groq bills audio by the second with a 10 s minimum per request. Prices are
// kept in the credits config like token prices, with "input" = USD per 1M
// billed seconds (see DEFAULT_MODEL_PRICES).
const crypto = require("crypto");
const credits = require("../credits");

const ENDPOINT = "https://api.groq.com/openai/v1/audio/transcriptions";
const MODELS = {
  live: process.env.STT_LIVE_MODEL || "whisper-large-v3-turbo",
  final: process.env.STT_FINAL_MODEL || "whisper-large-v3",
};
const MIN_BILLED_S = 10;
const MAX_SEGMENT_S = 35;
const SESSIONS = "stt_sessions";
const SWEEP_AFTER_MS = 2 * 60 * 1000;

const ready = () => !!process.env.GROQ_API_KEY;

class SttError extends Error {
  constructor(message, status = 502, code = "STT_FAILED") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// Seconds of audio in a 16-bit PCM WAV
function wavSeconds(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 44 || buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") {
    throw new SttError("Audio must be 16-bit PCM WAV", 400, "BAD_AUDIO");
  }
  // Walk the chunks: some encoders put others (JUNK, LIST) before fmt/data
  let fmt = null;
  let dataBytes = 0;
  for (let o = 12; o + 8 <= buf.length; ) {
    const id = buf.toString("ascii", o, o + 4);
    const size = buf.readUInt32LE(o + 4);
    if (id === "fmt " && o + 24 <= buf.length) fmt = { channels: buf.readUInt16LE(o + 10), rate: buf.readUInt32LE(o + 12), bits: buf.readUInt16LE(o + 22) };
    if (id === "data") {
      dataBytes = Math.min(size, buf.length - o - 8);
      break;
    }
    o += 8 + size + (size % 2);
  }
  if (!fmt || !fmt.rate || fmt.bits !== 16 || !fmt.channels) throw new SttError("Audio must be 16-bit PCM WAV", 400, "BAD_AUDIO");
  return dataBytes / (fmt.rate * fmt.channels * 2);
}

// Style + vocabulary hints. Whisper follows the script and spelling of its
// prompt, so Hinglish stays in Roman letters and medicine names come out as
// the pharmacy writes them.
// Whisper is never told "en": with that it translates Hindi into English
// instead of writing down what was said.
const STYLE = {
  auto: "Haan, Dolo 650 ka stock dikhao. Kal ki sale kitni hui? Show today's sales. Ramesh ka bill banao, 2 strip Azithral 500.",
  hi: "हाँ, डोलो 650 का स्टॉक दिखाओ। कल की सेल कितनी हुई? रमेश का बिल बनाओ।",
};

const vocabCache = new Map(); // pharmacy -> { at, words }
async function vocabulary(db, pharmacyId) {
  const hit = vocabCache.get(pharmacyId);
  if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.words;
  let words = "";
  try {
    const rows = await db
      .collection("inventory")
      .aggregate([
        { $match: { pharmacy_id: pharmacyId, available_quantity: { $gt: 0 } } },
        { $sort: { updated_at: -1, created_at: -1 } },
        { $limit: 400 },
        { $group: { _id: "$product_name" } },
        { $limit: 25 },
      ])
      .toArray();
    words = rows
      .map((r) => String(r._id || "").replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .join(", ")
      .slice(0, 350);
  } catch {}
  vocabCache.set(pharmacyId, { at: Date.now(), words });
  return words;
}

// Whisper's well-known inventions on near-silence
const HALLUCINATION = /^(thank you|thanks for watching|thank you for watching|bye|you|please subscribe|subtitles by.*|धन्यवाद|शुक्रिया|\.|,)\W*$/i;

async function callGroq({ audio, model, language, prompt, signal }) {
  const form = new FormData();
  form.append("file", new Blob([audio], { type: "audio/wav" }), "speech.wav");
  form.append("model", model);
  form.append("response_format", "verbose_json");
  form.append("temperature", "0");
  if (language) form.append("language", language);
  if (prompt) form.append("prompt", prompt);
  let res;
  try {
    res = await fetch(ENDPOINT, { method: "POST", headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` }, body: form, signal });
  } catch (err) {
    if (err.name === "AbortError") throw new SttError("Cancelled", 499, "CANCELLED");
    throw new SttError("Voice typing is unreachable right now", 503, "STT_UNAVAILABLE");
  }
  if (!res.ok) {
    const status = res.status === 429 ? 429 : res.status >= 500 ? 503 : 502;
    let detail = "";
    try {
      detail = (await res.json())?.error?.message || "";
    } catch {}
    console.warn(`[stt] ${model} ${res.status}: ${detail.slice(0, 200)}`);
    throw new SttError(status === 429 ? "Voice typing is busy, try again in a moment" : "Voice typing failed", status, status === 429 ? "STT_BUSY" : "STT_FAILED");
  }
  return res.json();
}

/**
 * Transcribe one phrase. Returns { text, seconds, billed_seconds, model }.
 * mode: "live" | "final"; lang: "auto" (Roman script) | "hi" (Devanagari); context: text said just before.
 */
async function transcribe(db, { pharmacyId, audio, mode, lang, context, signal }) {
  if (!ready()) throw new SttError("Voice typing is not set up", 503, "STT_UNAVAILABLE");
  const seconds = wavSeconds(audio);
  if (seconds > MAX_SEGMENT_S + 1) throw new SttError("Audio piece is too long", 413, "TOO_LONG");
  if (seconds < 0.3) return { text: "", seconds, billed_seconds: 0, model: null };

  const style = STYLE[lang] || STYLE.auto;
  const vocab = await vocabulary(db, pharmacyId);
  const before = String(context || "").slice(-200);
  const prompt = [style, vocab && `Medicines: ${vocab}.`, before].filter(Boolean).join(" ").slice(-850);
  const model = mode === "final" ? MODELS.final : MODELS.live;
  const language = lang === "hi" ? "hi" : undefined;

  const out = await callGroq({ audio, model, language, prompt, signal });
  const billed = Math.max(MIN_BILLED_S, Math.ceil(Number(out.duration) || seconds));
  // Drop pieces Whisper itself thinks were not speech
  const kept = (out.segments || []).filter((s) => !(s.no_speech_prob > 0.6 && s.avg_logprob < -0.8));
  let text = (out.segments ? kept.map((s) => s.text).join("") : out.text || "").replace(/\s+/g, " ").trim();
  if (HALLUCINATION.test(text)) text = "";
  return { text, seconds, billed_seconds: billed, model };
}

// ── Sessions & charging ─────────────────────────────────────────────────────

const validSession = (id) => typeof id === "string" && /^[A-Za-z0-9-]{8,64}$/.test(id);

async function record(db, user, sessionId, result, mode) {
  if (!result.model) return;
  const entry = {
    provider: "groq",
    model: result.model,
    purpose: `dictation_${mode}`,
    input_tokens: result.billed_seconds, // billed seconds, priced per 1M seconds
    cached_tokens: 0,
    output_tokens: 0,
    thinking_tokens: 0,
    at: Date.now(),
  };
  await db.collection(SESSIONS).updateOne(
    { id: sessionId, pharmacy_id: user.pharmacy_id, settled_at: null },
    {
      $push: { entries: entry },
      $inc: { seconds: result.seconds, billed_seconds: result.billed_seconds, calls: 1 },
      $set: { updated_at: new Date() },
      $setOnInsert: { id: sessionId, pharmacy_id: user.pharmacy_id, user_id: user.id, created_at: new Date(), settled_at: null },
    },
    { upsert: true }
  );
}

// Charges a session once (claimed atomically, so two servers can't both bill it)
async function settleSession(db, sessionId, pharmacyId) {
  const s = await db
    .collection(SESSIONS)
    .findOneAndUpdate({ id: sessionId, pharmacy_id: pharmacyId, settled_at: null }, { $set: { settled_at: new Date() } }, { returnDocument: "after" });
  if (!s || !(s.entries || []).length) return { credits: 0 };
  const pharmacy = (await db.collection("pharmacies").findOne({ id: pharmacyId }, { projection: { _id: 0, id: 1, subscription: 1 } })) || { id: pharmacyId };
  const r = await credits.settle(db, pharmacy, { entries: s.entries }, {
    ref: `stt:${sessionId}`,
    task: "dictation",
    engine: "swift",
    userId: s.user_id,
    label: `Voice typing (${Math.round(s.seconds || 0)}s)`,
  });
  await db.collection(SESSIONS).updateOne({ id: sessionId }, { $set: { credits: r.credits, cost_inr: r.cost_inr } });
  return r;
}

let sweeper = null;
function startSweeper(db) {
  if (sweeper) return;
  sweeper = setInterval(async () => {
    try {
      const stale = await db
        .collection(SESSIONS)
        .find({ settled_at: null, updated_at: { $lt: new Date(Date.now() - SWEEP_AFTER_MS) } }, { projection: { id: 1, pharmacy_id: 1 } })
        .limit(50)
        .toArray();
      for (const s of stale) await settleSession(db, s.id, s.pharmacy_id).catch((e) => console.warn("[stt] sweep:", e.message));
    } catch (e) {
      console.warn("[stt] sweep failed:", e.message);
    }
  }, 60 * 1000);
  sweeper.unref?.();
}

async function ensureIndexes(db) {
  await db.collection(SESSIONS).createIndex({ id: 1 }, { unique: true });
  await db.collection(SESSIONS).createIndex({ settled_at: 1, updated_at: 1 });
  // Settled sessions are only kept for a while
  await db.collection(SESSIONS).createIndex({ created_at: 1 }, { expireAfterSeconds: 30 * 24 * 3600 });
}

const newSessionId = () => crypto.randomUUID();

module.exports = { MODELS, ready, transcribe, record, settleSession, startSweeper, ensureIndexes, validSession, newSessionId, wavSeconds, SttError };
