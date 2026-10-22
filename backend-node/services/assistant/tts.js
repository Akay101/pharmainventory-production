// Spoken replies for the assistant, streamed to the browser as raw 16-bit
// PCM (24 kHz mono).
//
// Two engines, same persona ("Kore"):
//   1. Google Cloud Text-to-Speech, Chirp 3 HD: natural AND consistent, the
//      same voice, pitch and pace every time. Used automatically when the
//      Cloud TTS API is enabled for the key's Google project.
//   2. Gemini TTS: natural but generative, so tone drifts a little between
//      replies. Kept as steady as it allows (one model, fixed seed,
//      temperature 0) and used when Cloud TTS isn't available.
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

async function geminiSpeech(spoken, signal, onChunk) {
  let lastErr;
  for (const model of MODELS()) {
    let bytes = 0;
    try {
      const res = await fetch(`${ENDPOINT}/${model}:streamGenerateContent?alt=sse`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey() },
        body: JSON.stringify({
          // Only the reply itself: TTS models read any style instruction aloud
          // (and reject system instructions), so the voice choice sets the tone
          contents: [{ parts: [{ text: spoken }] }],
          // Same model, seed and temperature every time keeps the tone as steady as Gemini allows
          generationConfig: { responseModalities: ["AUDIO"], temperature: 0, seed: 7, speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE() } } } },
        }),
        signal,
      });
      if (!res.ok) {
        lastErr = new Error(`TTS ${model} failed (${res.status})`);
        if (res.status === 404) continue; // model retired: try the next one
        throw lastErr;
      }
      const dec = new TextDecoder();
      let buf = "";
      const handle = (ev) => {
        const line = ev.split("\n").find((l) => l.startsWith("data:"));
        if (!line) return;
        try {
          const part = JSON.parse(line.slice(5)).candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
          if (part) {
            let pcm = Buffer.from(part.inlineData.data, "base64");
            if (/wav/i.test(part.inlineData.mimeType) && pcm.slice(0, 4).toString() === "RIFF") pcm = pcm.slice(44);
            bytes += pcm.length;
            onChunk(pcm);
          }
        } catch {}
      };
      for await (const chunk of res.body) {
        buf += dec.decode(chunk, { stream: true }).replace(/\r\n/g, "\n");
        let i;
        while ((i = buf.indexOf("\n\n")) >= 0) {
          handle(buf.slice(0, i));
          buf = buf.slice(i + 2);
        }
      }
      if (buf.trim()) handle(buf);
      if (bytes) return bytes;
      lastErr = new Error(`TTS ${model} returned no audio`);
    } catch (err) {
      if (signal?.aborted) return 0;
      lastErr = err;
      if (bytes) return bytes; // partial audio already sent
    }
  }
  throw lastErr || new Error("Speech unavailable");
}

module.exports = { streamSpeech, speakable };
