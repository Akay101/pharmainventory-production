// Natural-sounding speech for assistant replies using Gemini's TTS models.
// Audio is streamed to the browser as raw 16-bit PCM (24 kHz mono) while it
// is generated, so playback starts within ~2 s instead of after the whole
// clip is ready.
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const apiKey = () => process.env.GEMINI_API_KEY || process.env.EMERGENT_LLM_KEY || "";

const MODELS = () => [process.env.ASSISTANT_TTS_MODEL || "gemini-3.8-flash-tts", "gemini-3.1-flash-tts-preview", "gemini-2.5-flash-preview-tts"];
const VOICE = () => process.env.ASSISTANT_TTS_VOICE || "Kore";
const MAX_CHARS = 700;

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

const STYLE = {
  en: "Read this aloud in a warm, natural, professional voice, like a helpful pharmacist talking to a colleague. Indian English accent.",
  hinglish: "Read this aloud in natural conversational Hinglish (Hindi-English mix) with an Indian accent, warm and professional, like a helpful pharmacist talking to a colleague.",
  hi: "इसे गर्मजोशी भरी, स्वाभाविक और पेशेवर आवाज़ में पढ़ें, जैसे एक मददगार फार्मासिस्ट अपने साथी से बात कर रहा हो।",
};

// Streams PCM chunks via onChunk(Buffer). Resolves when done.
async function streamSpeech({ text, language = "en", signal, onChunk }) {
  const spoken = speakable(text);
  if (!spoken) return 0;
  let lastErr;
  for (const model of MODELS()) {
    let bytes = 0;
    try {
      const res = await fetch(`${ENDPOINT}/${model}:streamGenerateContent?alt=sse`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey() },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${STYLE[language] || STYLE.en}\n\n${spoken}` }] }],
          generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE() } } } },
        }),
        signal,
      });
      if (!res.ok) {
        lastErr = new Error(`TTS ${model} failed (${res.status})`);
        if ([400, 404].includes(res.status)) continue; // try the next model
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
