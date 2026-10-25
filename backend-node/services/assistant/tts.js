// Spoken replies for the assistant, streamed to the browser as raw 16-bit
// PCM (24 kHz mono).
//
// Two engines, same persona ("Kore"):
//   1. Google Cloud Text-to-Speech, Chirp 3 HD: natural AND consistent, the
//      same voice, pitch and pace every time. Used automatically when the
//      Cloud TTS API is enabled for the key's Google project.
//   2. Gemini TTS: natural but generative, so a take can drift (higher, or
//      a male-sounding read). Kept on one model, and every take's pitch is
//      checked before it plays; a drifted take is regenerated.
const { medianPitch } = require("./pitch");
const meter = require("../credits/meter");
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const apiKey = () => process.env.GEMINI_API_KEY || process.env.EMERGENT_LLM_KEY || "";

const MODELS = () => [process.env.ASSISTANT_TTS_MODEL || "gemini-3.8-flash-tts", "gemini-3.1-flash-tts-preview", "gemini-2.5-flash-preview-tts"];
const VOICE = () => process.env.ASSISTANT_TTS_VOICE || "Kore";
const MAX_CHARS = 700;
const SAMPLE_RATE = 24000;

const CLOUD_VOICE = {
  hi: () => process.env.ASSISTANT_TTS_CLOUD_VOICE_HI || "hi-IN-Chirp3-HD-Kore",
  en: () => process.env.ASSISTANT_TTS_CLOUD_VOICE_EN || "en-IN-Chirp3-HD-Kore",
};
// Remember for a while that Cloud TTS isn't enabled, so we don't retry it per reply
let cloudDisabledUntil = 0;

// Markdown and symbols out, speakable text in; long replies are cut at a
// sentence boundary (the detail stays on screen)
function speakable(text) {
  let t = String(text || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^\s*\|.*\|\s*$/gm, " ") // tables
    .replace(/^#+\s*/gm, "")
    .replace(/^\s*[-*•]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/\*\*|__|[*_`>]/g, "")
    .replace(/\[(.*?)\]\(.*?\)/g, "$1")
    .replace(/\s*\n+\s*/g, ". ")
    .replace(/\.\s*\./g, ".")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (t.length > MAX_CHARS) {
    const cut = t.slice(0, MAX_CHARS);
    const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("। "), cut.lastIndexOf("! "));
    t = end > 200 ? cut.slice(0, end + 1) : cut;
  }
  return t;
}

// Sentences grouped into ~220-char pieces so the first piece is ready fast
function pieces(text) {
  const parts = text.match(/[^.!?।]+[.!?।]*\s*/g) || [text];
  const out = [];
  let cur = "";
  for (const p of parts) {
    if ((cur + p).length > 220 && cur) {
      out.push(cur.trim());
      cur = "";
    }
    cur += p;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

async function cloudPiece(text, voice, signal) {
  // Gemini keys can't be combined with Cloud TTS, so the voice has its own key
  const res = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(process.env.GOOGLE_TTS_API_KEY || apiKey())}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      input: { text },
      voice: { languageCode: voice.slice(0, 5), name: voice },
      audioConfig: { audioEncoding: "LINEAR16", sampleRateHertz: SAMPLE_RATE },
    }),
    signal,
  });
  if (!res.ok) {
    const err = new Error(`Cloud TTS failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  const { audioContent } = await res.json();
  const wav = Buffer.from(audioContent, "base64");
  return wav.slice(0, 4).toString() === "RIFF" ? wav.slice(44) : wav;
}

// All pieces are requested at once and played back in order
async function cloudSpeech(text, language, signal, onChunk) {
  const voice = (language === "en" ? CLOUD_VOICE.en : CLOUD_VOICE.hi)();
  const jobs = pieces(text).map((t) => cloudPiece(t, voice, signal));
  let bytes = 0;
  for (const job of jobs) {
    const pcm = await job;
    bytes += pcm.length;
    onChunk(pcm);
  }
  return bytes;
}

// Streams PCM chunks via onChunk(Buffer). Resolves when done.
async function streamSpeech({ text, language, signal, onChunk }) {
  const spoken = speakable(text);
  if (!spoken) return 0;
  if (process.env.ASSISTANT_TTS_PROVIDER !== "gemini" && process.env.GOOGLE_TTS_API_KEY && Date.now() > cloudDisabledUntil) {
    let sent = 0;
    try {
      return await cloudSpeech(spoken, language, signal, (b) => {
        sent += b.length;
        onChunk(b);
      });
    } catch (err) {
      if (signal?.aborted) return 0;
      if (sent) return sent;
      if ([400, 403, 404].includes(err.status)) {
        cloudDisabledUntil = Date.now() + 10 * 60 * 1000;
        console.warn(`[assistant tts] Cloud TTS rejected GOOGLE_TTS_API_KEY (${err.status}); using Gemini TTS for 10 min`);
      }
    }
  }
  return geminiSpeech(spoken, signal, onChunk);
}

// Kore normally speaks with a median pitch of about 180-220 Hz. A take outside
// this band has drifted (deeper and male-sounding, or squeaky), so it is
// dropped before anything is played and generated again with another seed.
const PITCH_BAND = [
  Number(process.env.ASSISTANT_TTS_PITCH_MIN) || 172,
  Number(process.env.ASSISTANT_TTS_PITCH_MAX) || 240,
];
const CHECK_BYTES = SAMPLE_RATE * 2 * 1.6; // judge the voice on the first 1.6 s
const MAX_TRIES = 4;
// Only a retired model (404) moves us to the next one; other models' "Kore"
// sounds like a different person, so busy/5xx errors retry the same model
let modelIndex = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// The voice model has a daily request quota; once it is used up we stay quiet
// until Google resets it rather than switch to a different-sounding voice
let quotaPausedUntil = 0;
const quotaError = () => Object.assign(new Error("Daily voice limit reached"), { code: "VOICE_QUOTA" });

// "43587s" -> ms; whether a 429 is the daily quota
async function readLimit(res) {
  try {
    const body = await res.json();
    const details = body?.error?.details || [];
    const daily = details.some((d) => (d.violations || []).some((v) => /PerDay/i.test(v.quotaId || "")));
    const delay = details.find((d) => d.retryDelay)?.retryDelay;
    return { daily, retryMs: delay ? parseFloat(delay) * 1000 : 0 };
  } catch {
    return { daily: false, retryMs: 0 };
  }
}

async function geminiSpeech(spoken, signal, onChunk) {
  if (Date.now() < quotaPausedUntil) throw quotaError();
  let lastErr;
  let pitchRetries = 0;
  for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
    const models = MODELS();
    if (modelIndex >= models.length) modelIndex = 0;
    const model = models[modelIndex];
    const ctl = new AbortController();
    const onAbort = () => ctl.abort();
    signal?.addEventListener("abort", onAbort);
    let sent = 0;
    let voiceUsage = null; // what this take cost, for credits (drifted takes cost too)
    let audioBytes = 0;
    let held = []; // audio kept back until the voice is checked
    let heldBytes = 0;
    let verdict = null; // "ok" once checked
    const lastTry = attempt === MAX_TRIES - 1;
    const release = () => {
      for (const b of held) {
        sent += b.length;
        onChunk(b);
      }
      held = [];
    };
    const check = () => {
      const { hz, frames } = medianPitch(Buffer.concat(held));
      if (frames < 12 || lastTry || (hz >= PITCH_BAND[0] && hz <= PITCH_BAND[1])) return "ok";
      console.warn(`[assistant tts] voice drifted (${Math.round(hz)} Hz); regenerating`);
      return "drift";
    };
    try {
      const res = await fetch(`${ENDPOINT}/${model}:streamGenerateContent?alt=sse`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey() },
        body: JSON.stringify({
          // Only the reply itself: TTS models read any style instruction aloud
          // (and reject system instructions), so the voice choice sets the tone
          contents: [{ parts: [{ text: spoken }] }],
          generationConfig: {
            responseModalities: ["AUDIO"],
            temperature: 0,
            seed: 7 + pitchRetries * 101,
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE() } } },
          },
        }),
        signal: ctl.signal,
      });
      if (!res.ok) {
        lastErr = new Error(`TTS ${model} failed (${res.status})`);
        if (res.status === 404) {
          modelIndex++;
          continue;
        }
        if (res.status === 429) {
          const { daily, retryMs } = await readLimit(res);
          if (daily) {
            quotaPausedUntil = Date.now() + (retryMs || 60 * 60 * 1000);
            console.warn(`[assistant tts] daily voice quota for ${model} used up; voice paused for ${Math.round((quotaPausedUntil - Date.now()) / 60000)} min`);
            throw quotaError();
          }
          if (retryMs > 4000) throw lastErr; // busy for a while: skip this reply
          await sleep(retryMs || 800 * (attempt + 1));
          continue;
        }
        if (res.status >= 500) {
          await sleep(500 * (attempt + 1));
          continue;
        }
        throw lastErr;
      }
      const dec = new TextDecoder();
      let buf = "";
      let drifted = false;
      const handle = (ev) => {
        const line = ev.split("\n").find((l) => l.startsWith("data:"));
        if (!line) return;
        let part;
        try {
          const j = JSON.parse(line.slice(5));
          if (j.usageMetadata) voiceUsage = j.usageMetadata;
          part = j.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
        } catch {
          return;
        }
        if (!part) return;
        let pcm = Buffer.from(part.inlineData.data, "base64");
        if (/wav/i.test(part.inlineData.mimeType) && pcm.slice(0, 4).toString() === "RIFF") pcm = pcm.slice(44);
        audioBytes += pcm.length;
        if (verdict === "ok") {
          sent += pcm.length;
          onChunk(pcm);
          return;
        }
        held.push(pcm);
        heldBytes += pcm.length;
        if (heldBytes >= CHECK_BYTES) {
          verdict = check();
          if (verdict === "ok") release();
          else drifted = true;
        }
      };
      for await (const chunk of res.body) {
        buf += dec.decode(chunk, { stream: true }).replace(/\r\n/g, "\n");
        let i;
        while (!drifted && (i = buf.indexOf("\n\n")) >= 0) {
          handle(buf.slice(0, i));
          buf = buf.slice(i + 2);
        }
        if (drifted) break;
      }
      if (!drifted && buf.trim()) handle(buf);
      if (!drifted && verdict !== "ok" && heldBytes) {
        // Short reply: judge it whole
        verdict = check();
        if (verdict === "ok") release();
        else drifted = true;
      }
      if (drifted) {
        ctl.abort();
        pitchRetries++;
        continue;
      }
      if (sent) return sent;
      lastErr = new Error(`TTS ${model} returned no audio`);
    } catch (err) {
      if (signal?.aborted) return 0;
      if (err.code === "VOICE_QUOTA") throw err;
      lastErr = err;
      if (sent) return sent; // partial audio already played
    } finally {
      signal?.removeEventListener("abort", onAbort);
      // Google reports usage at the end; a take we stopped early is estimated from its audio (~25 tokens/s)
      if (voiceUsage) meter.record(meter.fromGemini(model, "voice", voiceUsage));
      else if (audioBytes) meter.record({ provider: "gemini", model, purpose: "voice", input_tokens: Math.ceil(spoken.length / 3), output_tokens: Math.ceil((audioBytes / (SAMPLE_RATE * 2)) * 25), estimated: true });
    }
  }
  throw lastErr || new Error("Speech unavailable");
}

module.exports = { streamSpeech, speakable };
