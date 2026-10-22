import { API, getAccessToken, refreshAccessToken } from "../../App";

// Plays the assistant's natural Gemini voice. Audio arrives as streamed
// 16-bit PCM (24 kHz mono); each chunk is scheduled right after the previous
// one so speech starts within ~2 s and never stutters.
const SAMPLE_RATE = 24000;
let sharedCtx = null;
let current = null; // { abort, sources: [] }
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn(!!current));

export const onSpeakingChange = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

// Call from a user gesture (mic/speaker tap): browsers only allow audio
// from a context that was unlocked by the user
export function primeVoice() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  if (!sharedCtx || sharedCtx.state === "closed") sharedCtx = new AudioCtx({ sampleRate: SAMPLE_RATE });
  if (sharedCtx.state === "suspended") sharedCtx.resume().catch(() => {});
  return sharedCtx;
}

export function stopVoice() {
  if (current) {
    current.abort.abort();
    current.sources.forEach((s) => {
      try {
        s.stop();
      } catch {}
    });
    current = null;
    notify();
  }
}

export async function speakReply(text, language) {
  stopVoice();
  if (!text?.trim()) return;
  const ctx = primeVoice();
  if (!ctx) return;

  const me = { abort: new AbortController(), sources: [] };
  current = me;
  notify();
  let playAt = 0;
  let carry = null; // odd byte left over between network chunks

  const finish = () => {
    if (current === me) {
      current = null;
      notify();
    }
  };

  const play = (bytes) => {
    let data = bytes;
    if (carry) {
      const merged = new Uint8Array(carry.length + data.length);
      merged.set(carry);
      merged.set(data, carry.length);
      data = merged;
      carry = null;
    }
    if (data.length % 2) {
      carry = data.slice(data.length - 1);
      data = data.slice(0, data.length - 1);
    }
    if (!data.length) return;
    const view = new DataView(data.buffer, data.byteOffset, data.length);
    const n = data.length / 2;
    const buf = ctx.createBuffer(1, n, SAMPLE_RATE);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < n; i++) ch[i] = view.getInt16(i * 2, true) / 32768;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    playAt = Math.max(playAt, ctx.currentTime + 0.06);
    src.start(playAt);
    playAt += buf.duration;
    me.sources.push(src);
  };

  try {
    const send = () =>
      fetch(`${API}/assistant/tts`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${getAccessToken()}` },
        body: JSON.stringify({ text, language }),
        signal: me.abort.signal,
      });
    let res = await send();
    if (res.status === 401) {
      await refreshAccessToken();
      res = await send();
    }
    if (!res.ok || !res.body) throw new Error("tts unavailable");
    const reader = res.body.getReader();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (current !== me) return;
      play(value);
    }
    const last = me.sources[me.sources.length - 1];
    if (last) last.onended = finish;
    else finish();
  } catch {
    // Stay silent rather than switch to a different (browser) voice; the
    // reply is on screen and the speaker button can retry
    finish();
  }
}
