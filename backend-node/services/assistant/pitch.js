// Median speaking pitch (Hz) of 16-bit little-endian mono PCM, estimated by
// normalised autocorrelation over the voiced 40 ms frames. Used to catch a
// Gemini TTS take that drifted away from the chosen voice.
function medianPitch(pcm, rate = 24000) {
  const n = Math.floor(pcm.length / 2);
  if (n < rate * 0.3) return { hz: 0, frames: 0 };
  const x = new Float32Array(n);
  let peak = 0;
  for (let i = 0; i < n; i++) {
    x[i] = pcm.readInt16LE(i * 2) / 32768;
    peak = Math.max(peak, Math.abs(x[i]));
  }
  const frame = Math.round(rate * 0.04);
  const hop = Math.round(rate * 0.02);
  const minLag = Math.floor(rate / 400);
  const maxLag = Math.ceil(rate / 70);
  const found = [];
  for (let s = 0; s + frame + maxLag < n; s += hop) {
    let e = 0;
    for (let i = 0; i < frame; i++) e += x[s + i] * x[s + i];
    if (Math.sqrt(e / frame) < peak * 0.08) continue; // silence / breath
    let best = 0;
    let bestLag = 0;
    for (let lag = minLag; lag <= maxLag; lag++) {
      let c = 0;
      let e2 = 0;
      for (let i = 0; i < frame; i++) {
        c += x[s + i] * x[s + i + lag];
        e2 += x[s + i + lag] * x[s + i + lag];
      }
      const r = c / Math.sqrt(e * e2 + 1e-12);
      if (r > best) {
        best = r;
        bestLag = lag;
      }
    }
    if (best > 0.75) found.push(rate / bestLag);
  }
  if (!found.length) return { hz: 0, frames: 0 };
  found.sort((a, b) => a - b);
  return { hz: found[Math.floor(found.length / 2)], frames: found.length };
}

module.exports = { medianPitch };
