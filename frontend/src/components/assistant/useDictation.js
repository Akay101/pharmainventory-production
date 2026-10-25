import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { API } from "../../App";

// Voice typing on the server's Whisper (see backend services/assistant/stt.js).
//
// The mic is recorded at 16 kHz and cut into phrases at the speaker's pauses.
// While a phrase is being spoken it is sent every couple of seconds for a
// quick live transcript; when it ends it is sent once more to the accurate
// model, whose text replaces the live one. Nothing is sent to the chat: the
// caller gets the text when the user stops (onEnd) and the user taps Send.
const RATE = 16000;
const FRAME = 480; // 30 ms
const PAUSE_MS = 900; // silence that ends a phrase
const PRE_ROLL_S = 0.35; // audio kept before speech starts
const TAIL_S = 0.3; // silence kept after the last word
const MAX_PHRASE_S = 25;
const LIVE_EVERY_MS = 1800;
const MAX_DICTATION_S = 180;
const FATAL = new Set(["NO_CREDITS", "STT_UNAVAILABLE", "BAD_SESSION"]);

export const dictationSupported = () =>
  typeof window !== "undefined" &&
  !!navigator.mediaDevices?.getUserMedia &&
  !!(window.AudioContext || window.webkitAudioContext);

function toWav(chunks, length) {
  const buf = new ArrayBuffer(44 + length * 2);
  const v = new DataView(buf);
  const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + length * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, RATE, true);
  v.setUint32(28, RATE * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, length * 2, true);
  let o = 44;
  for (const c of chunks) {
    for (let i = 0; i < c.length; i++, o += 2) {
      const s = Math.max(-1, Math.min(1, c[i]));
      v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
  }
  return new Blob([buf], { type: "audio/wav" });
}

// Samples [from, to) of a list of Float32 chunks
function slice(chunks, from, to) {
  const out = [];
  let pos = 0;
  for (const c of chunks) {
    const end = pos + c.length;
    if (end > from && pos < to) out.push(c.subarray(Math.max(0, from - pos), Math.min(c.length, to - pos)));
    pos = end;
    if (pos >= to) break;
  }
  return out;
}

const join = (parts) => parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();

export function useDictation({ lang = "auto", onEnd, onFatal } = {}) {
  const [status, setStatus] = useState("idle"); // idle | starting | listening | finishing
  const [text, setText] = useState("");
  const [level, setLevel] = useState(0);
  const engineRef = useRef(null);
  const cb = useRef({ onEnd, onFatal });
  cb.current = { onEnd, onFatal };

  const start = useCallback(async () => {
    if (engineRef.current) return;
    const session = (crypto.randomUUID && crypto.randomUUID()) || `d${Date.now()}${Math.random().toString(36).slice(2, 10)}`;
    const e = {
      session,
      chunks: [], // Float32 at 16 kHz, from the current phrase's start
      length: 0,
      phraseStart: 0, // absolute sample index of chunks[0]
      total: 0, // samples recorded
      speechAt: -1, // last sample index with speech
      speechFrom: -1, // first speech sample of the current phrase
      floor: 0.004,
      frameBuf: new Float32Array(FRAME),
      frameLen: 0,
      resamplePos: 0,
      lastSample: 0,
      phrases: [], // { text, preview, done, promise }
      live: "",
      liveBusy: false,
      liveAt: 0,
      liveUpTo: 0,
      stopped: false,
      ctrl: new AbortController(),
    };
    engineRef.current = e;
    setStatus("starting");
    setText("");

    const render = () => {
      if (engineRef.current !== e) return;
      setText(join([...e.phrases.map((p) => (p.done ? p.text : p.text || p.preview)), e.live]));
    };
    const context = () => join(e.phrases.filter((p) => p.done).map((p) => p.text)).slice(-200);

    const post = async (blob, mode) => {
      const res = await axios.post(`${API}/assistant/transcribe`, blob, {
        headers: { "Content-Type": "audio/wav" },
        params: { session, mode, lang, context: context() },
        signal: e.ctrl.signal,
        timeout: 30000,
      });
      return String(res.data?.text || "");
    };

    const fail = (err) => {
      const code = err?.response?.data?.code;
      if (FATAL.has(code) && !e.stopped) {
        finish({ fatal: { code, detail: err.response.data.detail } });
        return true;
      }
      return false;
    };

    // Closes the current phrase at `cut` (absolute sample index) and sends it
    const closePhrase = (cut) => {
      const from = Math.max(e.phraseStart, e.speechFrom - PRE_ROLL_S * RATE);
      const to = Math.min(cut, e.phraseStart + e.length);
      const audio = slice(e.chunks, from - e.phraseStart, to - e.phraseStart);
      const len = audio.reduce((s, c) => s + c.length, 0);
      const keep = slice(e.chunks, to - e.phraseStart, e.length);
      e.chunks = keep.map((c) => c.slice());
      e.length = e.chunks.reduce((s, c) => s + c.length, 0);
      e.phraseStart = to;
      e.speechFrom = -1;
      e.liveUpTo = 0;
      const phrase = { text: "", preview: e.live, done: false };
      e.live = "";
      e.phrases.push(phrase);
      if (len < RATE * 0.25) {
        phrase.done = true;
        render();
        return;
      }
      phrase.promise = post(toWav(audio, len), "final")
        .then((t) => {
          phrase.text = t.trim();
        })
        .catch((err) => {
          if (!fail(err)) phrase.text = phrase.preview; // keep what was shown
        })
        .finally(() => {
          phrase.done = true;
          render();
        });
      render();
    };

    const sendLive = () => {
      if (e.liveBusy || e.speechFrom < 0 || e.stopped) return;
      const now = Date.now();
      const spoken = e.phraseStart + e.length - e.speechFrom;
      if (now - e.liveAt < LIVE_EVERY_MS || spoken < RATE * 0.6 || e.phraseStart + e.length - e.liveUpTo < RATE * 0.5) return;
      const from = Math.max(e.phraseStart, e.speechFrom - PRE_ROLL_S * RATE) - e.phraseStart;
      const audio = slice(e.chunks, from, e.length);
      const len = audio.reduce((s, c) => s + c.length, 0);
      const phraseAt = e.phraseStart;
      e.liveBusy = true;
      e.liveAt = now;
      e.liveUpTo = e.phraseStart + e.length;
      post(toWav(audio, len), "live")
        .then((t) => {
          if (e.phraseStart === phraseAt) e.live = t.trim(); // still the same phrase
          else if (e.phrases.length && !e.phrases[e.phrases.length - 1].done) e.phrases[e.phrases.length - 1].preview = t.trim();
          render();
        })
        .catch(fail)
        .finally(() => {
          e.liveBusy = false;
        });
    };

    // One 30 ms frame: voice activity and phrase cuts
    const onFrame = (frame) => {
      let sum = 0;
      for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
      const rms = Math.sqrt(sum / frame.length);
      const speech = rms > Math.max(0.012, e.floor * 3.2);
      // Noise floor: follows quiet frames quickly, steady noise slowly
      e.floor = speech ? e.floor * 0.999 + rms * 0.001 : e.floor * 0.97 + rms * 0.03;
      const at = e.total;
      if (speech) {
        if (e.speechFrom < 0) e.speechFrom = at;
        e.speechAt = at + frame.length;
      }
      setLevel(Math.min(1, rms * 9));

      if (e.speechFrom >= 0) {
        const silentFor = ((at + frame.length - e.speechAt) / RATE) * 1000;
        const phraseLen = (at + frame.length - e.speechFrom) / RATE;
        if (silentFor >= PAUSE_MS) closePhrase(e.speechAt + TAIL_S * RATE);
        else if (phraseLen >= MAX_PHRASE_S) closePhrase(at + frame.length);
      } else if (e.length > PRE_ROLL_S * RATE * 2) {
        // No speech yet: keep only the pre-roll
        const drop = e.length - PRE_ROLL_S * RATE;
        e.chunks = slice(e.chunks, drop, e.length).map((c) => c.slice());
        e.length -= drop;
        e.phraseStart += drop;
      }
      if (e.total / RATE >= MAX_DICTATION_S) finish({ limit: true });
    };

    const onAudio = (input, inRate) => {
      if (e.stopped) return;
      // Linear resample to 16 kHz
      // (resamplePos may sit just before this buffer: sample -1 is the last one of the previous buffer)
      const n = input.length;
      const ratio = inRate / RATE;
      const outLen = n - 1 >= e.resamplePos ? Math.floor((n - 1 - e.resamplePos) / ratio) + 1 : 0;
      if (outLen <= 0) return;
      const out = new Float32Array(outLen);
      let pos = e.resamplePos;
      for (let i = 0; i < outLen; i++, pos += ratio) {
        const j = Math.floor(pos);
        const f = pos - j;
        const a = j < 0 ? e.lastSample : input[j];
        const b = j + 1 < n ? input[j + 1] : a;
        out[i] = a * (1 - f) + b * f;
      }
      e.resamplePos = pos - n;
      e.lastSample = input[n - 1];
      e.chunks.push(out);
      e.length += out.length;
      for (let i = 0; i < out.length; i++) {
        e.frameBuf[e.frameLen++] = out[i];
        if (e.frameLen === FRAME) {
          e.frameLen = 0;
          onFrame(e.frameBuf);
          e.total += FRAME;
        }
      }
    };

    const finish = async ({ fatal, limit } = {}) => {
      if (e.stopped) return;
      e.stopped = true;
      clearInterval(e.timer);
      try {
        e.processor?.disconnect();
        e.source?.disconnect();
        e.stream?.getTracks().forEach((t) => t.stop());
        e.ctx?.close();
      } catch {}
      setLevel(0);
      if (fatal) {
        e.ctrl.abort();
        engineRef.current = null;
        setStatus("idle");
        setText("");
        axios.post(`${API}/assistant/transcribe/finish`, { session }).catch(() => {});
        cb.current.onFatal?.(fatal);
        return;
      }
      setStatus("finishing");
      if (e.speechFrom >= 0) closePhrase(e.speechAt + TAIL_S * RATE);
      await Promise.all(e.phrases.map((p) => p.promise).filter(Boolean));
      const final = join(e.phrases.map((p) => p.text));
      engineRef.current = null;
      setStatus("idle");
      setText("");
      axios.post(`${API}/assistant/transcribe/finish`, { session }).catch(() => {});
      cb.current.onEnd?.(final, { limit });
    };
    e.finish = finish;

    // Credits and service first, so a fallback can start before any words are lost
    try {
      const st = await axios.get(`${API}/assistant/transcribe/status`, { timeout: 4000 });
      if (st.data && st.data.available === false) {
        e.stopped = true;
        engineRef.current = null;
        setStatus("idle");
        cb.current.onFatal?.({ code: st.data.code || "STT_UNAVAILABLE", detail: "Voice typing isn't available right now" });
        return;
      }
    } catch {
      /* the uploads check again */
    }
    if (e.stopped) return;

    try {
      e.stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      if (e.stopped) return e.stream.getTracks().forEach((t) => t.stop());
      const Ctx = window.AudioContext || window.webkitAudioContext;
      e.ctx = new Ctx();
      if (e.ctx.state === "suspended") await e.ctx.resume();
      e.source = e.ctx.createMediaStreamSource(e.stream);
      e.processor = e.ctx.createScriptProcessor(4096, 1, 1);
      e.processor.onaudioprocess = (ev) => onAudio(ev.inputBuffer.getChannelData(0), e.ctx.sampleRate);
      e.source.connect(e.processor);
      e.processor.connect(e.ctx.destination); // some browsers only run a connected processor
      e.timer = setInterval(sendLive, 300);
      setStatus("listening");
    } catch (err) {
      e.stopped = true;
      engineRef.current = null;
      setStatus("idle");
      const denied = err?.name === "NotAllowedError" || err?.name === "SecurityError";
      cb.current.onFatal?.({
        code: denied ? "MIC_DENIED" : "MIC_FAILED",
        detail: denied ? "Microphone access is blocked. Allow it in your browser's site settings." : "Couldn't open the microphone.",
      });
    }
  }, [lang]);

  // Stop listening; the text arrives through onEnd once the last phrase is read
  const stop = useCallback(() => engineRef.current?.finish?.(), []);

  useEffect(
    () => () => {
      const e = engineRef.current;
      if (!e) return;
      e.stopped = true;
      e.ctrl.abort();
      clearInterval(e.timer);
      try {
        e.stream?.getTracks().forEach((t) => t.stop());
        e.ctx?.close();
      } catch {}
      axios.post(`${API}/assistant/transcribe/finish`, { session: e.session }).catch(() => {});
    },
    []
  );

  return { status, active: status !== "idle", listening: status === "listening", finishing: status === "finishing", text, level, start, stop };
}
