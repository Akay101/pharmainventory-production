#!/usr/bin/env node
// Records the narration for the frontend's guided tours in the assistant's
// own voice (services/assistant/tts.js, "Kore"), once, into static files:
//   frontend/public/guide-audio/<lang>/<tour>/<beat>.m4a
//   frontend/public/guide-audio/manifest.json   { "<lang>/<tour>/<beat>": { file, hash, seconds } }
// Only lines that are new or changed since the last run are recorded (the
// manifest keeps a hash of each line). The player skips a recording whose
// hash doesn't match the current line and shows captions instead.
//
//   node scripts/build-guide-audio.js                 all tours, both languages
//   node scripts/build-guide-audio.js billing hi      one tour / one language
//   GUIDE_ENV=/path/to/.env node scripts/...          take API keys from another .env
//   --force                                           re-record everything selected
//
// Needs GEMINI_API_KEY (or GOOGLE_TTS_API_KEY for Cloud TTS). AAC encoding
// uses macOS `afconvert`, or `ffmpeg` when present; without either it saves WAV.

const path = require("path");
const fs = require("fs");
const vm = require("vm");
const os = require("os");
const { execFileSync } = require("child_process");

require("dotenv").config({ path: process.env.GUIDE_ENV || path.join(__dirname, "../.env") });
const { streamSpeech } = require("../services/assistant/tts");

const ROOT = path.join(__dirname, "../../frontend");
const TOURS_DIR = path.join(ROOT, "src/components/guide/tours");
const OUT = path.join(ROOT, "public/guide-audio");
const MANIFEST = path.join(OUT, "manifest.json");
const LANGS = ["hi", "en"];
const SAMPLE_RATE = 24000;

// Same hash as frontend/src/components/guide/engine/narration.js
function lineHash(text) {
  let h = 0x811c9dc5;
  const s = String(text || "").trim();
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

// Tour files are plain data modules with no imports
function loadTour(file) {
  const src = fs.readFileSync(file, "utf8").replace(/^export default/m, "module.exports =");
  const sandbox = { module: { exports: {} } };
  vm.runInNewContext(src, sandbox, { filename: file });
  return sandbox.module.exports;
}

const has = (cmd) => {
  try {
    execFileSync("which", [cmd], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};

function wavHeader(bytes) {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + bytes, 4);
  h.write("WAVE", 8);
  h.write("fmt ", 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(SAMPLE_RATE, 24);
  h.writeUInt32LE(SAMPLE_RATE * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(bytes, 40);
  return h;
}

// 40 ms fade in/out so lines never click
function soften(pcm) {
  const n = pcm.length / 2;
  const f = Math.min(n / 2, Math.round(SAMPLE_RATE * 0.04));
  for (let i = 0; i < f; i++) {
    const g = i / f;
    pcm.writeInt16LE(Math.round(pcm.readInt16LE(i * 2) * g), i * 2);
    const j = n - 1 - i;
    pcm.writeInt16LE(Math.round(pcm.readInt16LE(j * 2) * g), j * 2);
  }
  return pcm;
}

function encode(pcm, outBase) {
  const tmp = path.join(os.tmpdir(), `guide-${process.pid}-${Date.now()}.wav`);
  fs.writeFileSync(tmp, Buffer.concat([wavHeader(pcm.length), pcm]));
  try {
    if (has("afconvert")) {
      execFileSync("afconvert", ["-f", "m4af", "-d", "aac", "-b", "48000", "-q", "127", tmp, `${outBase}.m4a`]);
      return ".m4a";
    }
    if (has("ffmpeg")) {
      execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", tmp, "-c:a", "aac", "-b:a", "48k", `${outBase}.m4a`]);
      return ".m4a";
    }
    fs.copyFileSync(tmp, `${outBase}.wav`);
    return ".wav";
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function recordOnce(text, language) {
  const chunks = [];
  await streamSpeech({ text, language, onChunk: (b) => chunks.push(Buffer.from(b)) });
  let pcm = Buffer.concat(chunks);
  if (pcm.length % 2) pcm = pcm.slice(0, pcm.length - 1);
  if (pcm.length < SAMPLE_RATE) throw new Error("no audio came back");
  return soften(pcm);
}

// The voice API allows only a few requests a minute: pace them, and wait
// and retry when it says "too many"
async function record(text, language) {
  for (let attempt = 1; ; attempt++) {
    try {
      const pcm = await recordOnce(text, language);
      await sleep(Number(process.env.GUIDE_TTS_GAP_MS) || 6500);
      return pcm;
    } catch (err) {
      if (err.code === "VOICE_QUOTA" || attempt >= 5 || !/\((429|5\d\d)\)/.test(err.message)) throw err;
      process.stdout.write(`(busy, retry ${attempt}) `);
      await sleep(20000 * attempt);
    }
  }
}

async function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const force = process.argv.includes("--force");
  const only = args.find((a) => !LANGS.includes(a));
  const langs = args.filter((a) => LANGS.includes(a));
  const manifest = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, "utf8")) : {};
  const files = fs.readdirSync(TOURS_DIR).filter((f) => f.endsWith(".js") && f !== "index.js");
  let made = 0;
  let kept = 0;
  let failed = 0;

  for (const f of files) {
    const tour = loadTour(path.join(TOURS_DIR, f));
    if (only && tour.id !== only) continue;
    const beats = tour.chapters.flatMap((c) => c.beats);
    for (const lang of langs.length ? langs : LANGS) {
      const dir = path.join(OUT, lang, tour.id);
      fs.mkdirSync(dir, { recursive: true });
      const live = new Set();
      for (const b of beats) {
        const text = b.say?.[lang];
        if (!text) continue;
        const key = `${lang}/${tour.id}/${b.id}`;
        live.add(key);
        const hash = lineHash(text);
        const prev = manifest[key];
        if (!force && prev?.hash === hash && fs.existsSync(path.join(OUT, prev.file))) {
          kept++;
          continue;
        }
        process.stdout.write(`  ${key} … `);
        try {
          const pcm = await record(text, lang);
          const ext = encode(pcm, path.join(dir, b.id));
          if (prev && prev.file !== `${lang}/${tour.id}/${b.id}${ext}`) fs.rmSync(path.join(OUT, prev.file), { force: true });
          manifest[key] = { file: `${lang}/${tour.id}/${b.id}${ext}`, hash, seconds: Math.round((pcm.length / 2 / SAMPLE_RATE) * 10) / 10 };
          fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1));
          made++;
          console.log(`${manifest[key].seconds}s`);
        } catch (err) {
          failed++;
          console.log(`FAILED: ${err.message}`);
          if (err.code === "VOICE_QUOTA") {
            console.log("Daily voice quota used up; run again later to record the rest.");
            fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1));
            process.exit(1);
          }
        }
      }
      // Lines removed from the tour
      Object.keys(manifest)
        .filter((k) => k.startsWith(`${lang}/${tour.id}/`) && !live.has(k))
        .forEach((k) => {
          fs.rmSync(path.join(OUT, manifest[k].file), { force: true });
          delete manifest[k];
        });
    }
  }
  fs.mkdirSync(OUT, { recursive: true });
  const sorted = Object.fromEntries(Object.keys(manifest).sort().map((k) => [k, manifest[k]]));
  fs.writeFileSync(MANIFEST, JSON.stringify(sorted, null, 1));
  console.log(`Recorded ${made}, unchanged ${kept}, failed ${failed}.`);
  if (failed) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
