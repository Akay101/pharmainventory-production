// Narration for guided tours: the assistant's own voice, recorded ahead of
// time (backend-node/scripts/build-guide-audio.js) into
// /guide-audio/<lang>/<tour>/<beat>.m4a, listed in /guide-audio/manifest.json
// with a hash of the line it was recorded from. A line whose recording is
// missing or out of date plays as timed captions only, never in a different
// voice.

let manifestPromise = null;
export function loadManifest() {
  if (!manifestPromise) {
    manifestPromise = fetch(`${process.env.PUBLIC_URL || ""}/guide-audio/manifest.json`, { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => ({}));
  }
  return manifestPromise;
}

// Same hash as the recording script (FNV-1a over the trimmed line)
export function lineHash(text) {
  let h = 0x811c9dc5;
  const s = String(text || "").trim();
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

let ctx = null;
let analyser = null;
let levelData = null;
// Set when the audio output fails (device unplugged, Bluetooth dropped…):
// voice then plays without the analyser, or the line falls back to captions
let routeBroken = false;

// Call from the click that starts a tour, so audio is allowed to play
export function unlockAudio() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  if (!ctx || ctx.state === "closed") {
    ctx = new AC();
    analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    levelData = new Uint8Array(analyser.fftSize);
    analyser.connect(ctx.destination);
    ctx.addEventListener?.("error", () => {
      routeBroken = true;
    });
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
}

// 0..1 loudness of the voice right now (drives the orb's glow)
export function voiceLevel() {
  if (!analyser || routeBroken || !current?.playing) return 0;
  analyser.getByteTimeDomainData(levelData);
  let sum = 0;
  for (let i = 0; i < levelData.length; i++) {
    const v = (levelData[i] - 128) / 128;
    sum += v * v;
  }
  return Math.min(1, Math.sqrt(sum / levelData.length) * 4);
}

let current = null;

// Voice off: lines play as captions only (remembered on this device)
const MUTE_KEY = "dd_guide_muted";
let muted = (() => {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
})();
export const isMuted = () => muted;
export function setMuted(m) {
  muted = !!m;
  try {
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {}
  if (current?.audio) current.audio.muted = muted;
}

const WORDS_PER_SEC = { en: 2.55, hi: 2.3 };

// Speaks one line. Resolves when it has finished (or was stopped).
// onProgress(fraction 0..1) is called while it plays, for the captions.
export function speak({ tour, beat, lang, text, rate = 1, onProgress }) {
  stopSpeaking();
  const me = { playing: false, paused: false, done: null, audio: null, timer: null, stop: null };
  current = me;
  const words = String(text || "").trim().split(/\s+/).filter(Boolean).length;

  return new Promise((resolve) => {
    me.done = resolve;
    const finish = () => {
      if (me.finished) return;
      me.finished = true;
      me.playing = false;
      clearInterval(me.timer);
      onProgress?.(1);
      if (current === me) current = null;
      resolve();
    };
    me.stop = finish;

    // Captions-only fallback, paced like speech (from = fraction already shown)
    const silent = (from = 0) => {
      clearInterval(me.timer);
      const total = Math.max(1800, (words / (WORDS_PER_SEC[lang] || 2.5)) * 1000) / rate;
      let elapsed = total * from;
      let last = performance.now();
      me.playing = true;
      me.timer = setInterval(() => {
        const now = performance.now();
        if (!me.paused) elapsed += now - last;
        last = now;
        onProgress?.(Math.min(1, elapsed / total));
        if (elapsed >= total) finish();
      }, 50);
      me.setRate = (r) => {
        rate = r;
      };
    };

    loadManifest().then((manifest) => {
      if (me.finished) return;
      const entry = manifest[`${lang}/${tour}/${beat}`];
      if (muted || !entry || entry.hash !== lineHash(text)) return silent();
      const audio = new Audio(`${process.env.PUBLIC_URL || ""}/guide-audio/${entry.file}?v=${entry.hash}`);
      audio.preload = "auto";
      audio.playbackRate = rate;
      audio.preservesPitch = true;
      me.audio = audio;
      try {
        if (ctx && analyser && !routeBroken && ctx.state === "running") ctx.createMediaElementSource(audio).connect(analyser);
      } catch {}
      audio.ontimeupdate = () => audio.duration && onProgress?.(audio.currentTime / audio.duration);
      audio.onended = finish;
      audio.onerror = () => {
        if (!me.playing) silent();
        else finish();
      };
      me.setRate = (r) => {
        audio.playbackRate = r;
      };
      audio
        .play()
        .then(() => {
          me.playing = true;
          if (me.paused) audio.pause();
          // Watchdog: if the voice stops moving (audio output failed), carry
          // on with captions instead of hanging the tour
          let lastT = -1;
          let stuckFor = 0;
          me.timer = setInterval(() => {
            if (me.finished || me.paused) return;
            if (audio.currentTime === lastT) stuckFor += 400;
            else stuckFor = 0;
            lastT = audio.currentTime;
            if (stuckFor >= 2400) {
              routeBroken = true;
              audio.onended = null;
              audio.ontimeupdate = null;
              try {
                audio.pause();
              } catch {}
              silent(audio.duration ? audio.currentTime / audio.duration : 0);
            }
          }, 400);
        })
        .catch(() => silent());
    });
  });
}

export function pauseSpeaking() {
  if (!current) return;
  current.paused = true;
  current.audio?.pause();
}

export function resumeSpeaking() {
  if (!current) return;
  current.paused = false;
  if (current.audio && current.playing) current.audio.play().catch(() => {});
}

export function setSpeakingRate(r) {
  current?.setRate?.(r);
}

export function stopSpeaking() {
  const c = current;
  current = null;
  if (!c) return;
  try {
    c.audio?.pause();
  } catch {}
  c.stop?.();
}

// Fetches the next lines' audio ahead of time
export function preload(entries) {
  loadManifest().then((manifest) => {
    entries.forEach(({ tour, beat, lang, text }) => {
      const e = manifest[`${lang}/${tour}/${beat}`];
      if (e && e.hash === lineHash(text)) {
        const a = new Audio();
        a.preload = "auto";
        a.src = `${process.env.PUBLIC_URL || ""}/guide-audio/${e.file}?v=${e.hash}`;
      }
    });
  });
}
