import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw, X, Gauge, Captions, Languages, Loader2, FlaskConical, Volume2, VolumeX } from "lucide-react";
import ParticleOrb from "../../assistant/ParticleOrb";
import Stage, { useFocusRect } from "./Stage";
import { Runner, flatten } from "./runner";
import { isPhone } from "./dom";
import { isMuted, setMuted, unlockAudio } from "./narration";

// The tour player: language choice, then the stage plus a presenter bar
// (captions in the chosen language, chapter progress and controls). While
// it plays, a click on the page pauses the tour so the user can look around
// the demo data; resuming rebuilds the page if they changed it.

export const LANGS = {
  hi: { label: "हिंदी", sub: "Hindi" },
  en: { label: "English", sub: "अंग्रेज़ी" },
};

const T = {
  en: { demo: "Demo data · nothing is saved", paused: "Paused. Look around freely, it's demo data.", resume: "Resume", restart: "Replay", close: "Close tour", done: "That was", again: "Watch again", tryIt: "Try it yourself", next: "Up next", error: "This step didn't load.", retry: "Try again", preparing: "Getting the demo ready…", speed: "Speed", captions: "Captions", voice: "Voice on/off" },
  hi: { demo: "डेमो डेटा · कुछ भी सेव नहीं होता", paused: "रुका हुआ है। आराम से देखिए, यह डेमो डेटा है।", resume: "आगे चलें", restart: "फिर से", close: "टूर बंद करें", done: "यह था", again: "फिर से देखें", tryIt: "ख़ुद आज़माएँ", next: "अगला", error: "यह स्टेप लोड नहीं हुआ।", retry: "फिर कोशिश करें", preparing: "डेमो तैयार हो रहा है…", speed: "रफ़्तार", captions: "कैप्शन", voice: "आवाज़ चालू/बंद" },
};

const usePhone = () => {
  const [p, setP] = useState(isPhone());
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const on = () => setP(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return p;
};

function LanguagePick({ tour, initial, onPick, onClose }) {
  const [hover, setHover] = useState(initial);
  return (
    <motion.div className="fixed inset-0 z-[2147483001] flex items-center justify-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_35%,rgba(76,29,149,0.55),rgba(3,3,12,0.92)_65%)] backdrop-blur-xl" onClick={onClose} />
      <div className="relative w-full max-w-lg text-center text-white">
        <motion.div className="mx-auto flex h-36 w-36 items-center justify-center" initial={{ scale: 0.3, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 140, damping: 14 }}>
          <div className="absolute h-40 w-40 rounded-full bg-[radial-gradient(circle,rgba(236,72,153,0.45),transparent_65%)] blur-md" />
          <ParticleOrb size={130} count={90} />
        </motion.div>
        <motion.p className="mt-2 text-xs font-black uppercase tracking-[0.4em] text-orange-300" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
          Guided tour · {tour.title.en}
        </motion.p>
        <motion.h2 className="mt-3 text-2xl font-black sm:text-3xl" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}>
          {hover === "hi" ? "नमस्ते! किस भाषा में समझाऊँ?" : "Hi! Which language should I use?"}
        </motion.h2>
        <motion.p className="mt-2 text-sm text-white/70" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}>
          {hover === "hi" ? `मैं आपको ${tour.title.hi} का हर बटन और हर स्टेप दिखाऊँगी, डेमो डेटा के साथ।` : `I'll show you every button and every step of ${tour.title.en}, using demo data.`}
        </motion.p>
        <div className="mt-7 grid grid-cols-2 gap-3">
          {["hi", "en"].map((l, i) => (
            <motion.button
              key={l}
              type="button"
              autoFocus={l === initial}
              onMouseEnter={() => setHover(l)}
              onFocus={() => setHover(l)}
              onClick={() => onPick(l)}
              className={`group relative overflow-hidden rounded-2xl border px-4 py-5 text-left transition-colors ${hover === l ? "border-orange-400/80 bg-white/10" : "border-white/15 bg-white/5"}`}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7 + i * 0.1 }}
              data-testid={`guide-lang-${l}`}
            >
              <div className="text-2xl font-black">{LANGS[l].label}</div>
              <div className="text-xs font-semibold text-white/60">{LANGS[l].sub}</div>
              <Play className="absolute right-4 top-1/2 h-6 w-6 -translate-y-1/2 text-orange-300 opacity-70 transition-transform group-hover:scale-125" />
            </motion.button>
          ))}
        </div>
        <motion.p className="mt-5 flex items-center justify-center gap-1.5 text-xs font-semibold text-white/55" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9 }}>
          <FlaskConical className="h-3.5 w-3.5" /> {T[hover].demo}
        </motion.p>
        <button type="button" onClick={onClose} className="absolute -top-2 right-0 rounded-full p-2 text-white/60 hover:bg-white/10 hover:text-white" aria-label="Close">
          <X className="h-5 w-5" />
        </button>
      </div>
    </motion.div>
  );
}

// Captions: the line being spoken, lighting up word by word
function Caption({ text, progress }) {
  const words = useMemo(() => String(text || "").split(/\s+/).filter(Boolean), [text]);
  const weights = useMemo(() => {
    const w = words.map((x) => x.length + 2);
    const total = w.reduce((a, b) => a + b, 0) || 1;
    let acc = 0;
    return w.map((x) => (acc += x) / total);
  }, [words]);
  const lit = weights.findIndex((w) => w > progress);
  return (
    <p className="text-[15px] font-semibold leading-snug sm:text-[17px]">
      {words.map((w, i) => (
        <span key={i} className="transition-colors duration-200" style={{ color: lit === -1 || i < lit ? "rgba(255,255,255,0.96)" : i === lit ? "#fdba74" : "rgba(255,255,255,0.38)" }}>
          {w}{" "}
        </span>
      ))}
    </p>
  );
}

function Bar({ runner, state, tour, lang, setLang, onClose, onToggle, phone, captionsOn, setCaptionsOn }) {
  const beats = runner.beats;
  const t = T[lang];
  const focusRect = useFocusRect(state.focus);
  const atTop = focusRect && focusRect.top + focusRect.height > window.innerHeight * 0.58 && focusRect.top > 220;
  const [rate, setRate] = useState(1);
  const [mute, setMute] = useState(isMuted);
  const toggleMute = () => {
    setMuted(!mute);
    setMute(!mute);
  };
  const chapterStarts = useMemo(() => beats.map((b, i) => (b.firstInChapter ? i : null)).filter((i) => i !== null), [beats]);
  const chapter = beats[state.index]?.chapter;
  const cycleRate = () => {
    const next = rate === 1 ? 1.25 : rate === 1.25 ? 1.5 : rate === 1.5 ? 0.85 : 1;
    setRate(next);
    runner.setRate(next);
  };
  const btn = "flex h-9 w-9 items-center justify-center rounded-full text-white/80 hover:bg-white/10 hover:text-white active:scale-95 transition";
  return (
    <div data-guide-layer className={`pointer-events-none fixed inset-x-0 z-[2147483002] flex justify-center px-2 ${atTop ? "top-3" : phone ? "bottom-[calc(8px+env(safe-area-inset-bottom))]" : "bottom-5"}`}>
    <motion.div className="pointer-events-auto w-full max-w-[760px]" layout transition={{ type: "spring", stiffness: 220, damping: 28 }}>
      <div className="overflow-hidden rounded-[22px] bg-slate-950/90 text-white shadow-[0_24px_80px_rgba(0,0,0,0.55)] ring-1 ring-white/10 backdrop-blur-xl">
        <div className="flex items-start gap-3 px-4 pb-2 pt-3">
          <div className="relative mt-0.5 shrink-0">
            <ParticleOrb size={34} count={30} />
          </div>
          <div className="min-w-0 flex-1">
            <div className={`mb-0.5 flex items-center gap-2 text-[10px] font-black text-orange-300/90 ${lang === "hi" ? "text-[11px]" : "uppercase tracking-[0.18em]"}`}>
              <span className="truncate">{tour.title[lang]} · {chapter?.title?.[lang]}</span>
              <span className="ml-auto shrink-0 rounded-full bg-emerald-400/15 px-2 py-0.5 text-[9px] tracking-wider text-emerald-300">{t.demo}</span>
            </div>
            {state.busy ? (
              <p className="flex items-center gap-2 text-sm font-semibold text-white/70"><Loader2 className="h-4 w-4 animate-spin" /> {t.preparing}</p>
            ) : state.status === "error" ? (
              <p className="text-sm font-semibold text-rose-300">{t.error}</p>
            ) : state.paused ? (
              <p className="text-sm font-semibold text-white/80">{t.paused}</p>
            ) : captionsOn ? (
              <Caption text={state.caption} progress={state.progress} />
            ) : (
              <p className="text-sm font-semibold text-white/50">…</p>
            )}
          </div>
        </div>
        {/* Chapter progress */}
        <div className="flex gap-1 px-4">
          {chapterStarts.map((s, ci) => {
            const end = chapterStarts[ci + 1] ?? beats.length;
            const frac = state.index >= end ? 1 : state.index < s ? 0 : (state.index - s + state.progress) / (end - s);
            return (
              <button key={s} type="button" title={tour.chapters[ci].title[lang]} onClick={() => runner.goTo(s)} className="group h-3 flex-1 py-1" style={{ flexGrow: end - s }}>
                <div className="h-1 overflow-hidden rounded-full bg-white/15 group-hover:bg-white/25">
                  <div className="h-full rounded-full bg-gradient-to-r from-orange-500 to-amber-300" style={{ width: `${frac * 100}%`, transition: "width 200ms linear" }} />
                </div>
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-1 px-2 pb-2 pt-0.5">
          <button type="button" className={btn} onClick={() => runner.prev()} aria-label="Back" data-testid="guide-prev">
            <ChevronLeft className="h-5 w-5" />
          </button>
          {state.status === "error" ? (
            <button type="button" onClick={() => runner.restartBeat()} className="flex h-9 items-center gap-1.5 rounded-full bg-orange-500 px-4 text-sm font-bold">
              <RotateCcw className="h-4 w-4" /> {t.retry}
            </button>
          ) : (
            <button type="button" className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-amber-400 text-white shadow-[0_0_24px_rgba(249,115,22,0.5)] active:scale-95" onClick={onToggle} aria-label={state.paused ? "Play" : "Pause"} data-testid="guide-play">
              {state.paused ? <Play className="ml-0.5 h-5 w-5" /> : <Pause className="h-5 w-5" />}
            </button>
          )}
          <button type="button" className={btn} onClick={() => runner.next()} aria-label="Next" data-testid="guide-next">
            <ChevronRight className="h-5 w-5" />
          </button>
          <span className="ml-1 font-mono text-[11px] font-bold text-white/45">
            {state.index + 1}/{beats.length}
          </span>
          <div className="ml-auto flex items-center gap-0.5">
            <button type="button" className={btn} onClick={toggleMute} title={t.voice} aria-label={t.voice} data-testid="guide-mute">
              {mute ? <VolumeX className="h-4 w-4 text-white/50" /> : <Volume2 className="h-4 w-4" />}
            </button>
            <button type="button" className={`${btn} w-auto gap-1 px-2.5 text-xs font-black`} onClick={cycleRate} title={t.speed}>
              <Gauge className="h-4 w-4" /> {rate}×
            </button>
            {!phone && (
              <button type="button" className={`${btn} ${captionsOn ? "" : "opacity-50"}`} onClick={() => setCaptionsOn(!captionsOn)} title={t.captions}>
                <Captions className="h-4 w-4" />
              </button>
            )}
            <button type="button" className={`${btn} w-auto gap-1 px-2.5 text-xs font-black`} onClick={() => setLang(lang === "hi" ? "en" : "hi")} title="Language" data-testid="guide-lang-toggle">
              <Languages className="h-4 w-4" /> {lang === "hi" ? "EN" : "हि"}
            </button>
            <button type="button" className={btn} onClick={onClose} aria-label={t.close} data-testid="guide-close">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    </motion.div>
    </div>
  );
}

function Outro({ tour, lang, onReplay, onClose, next }) {
  const t = T[lang];
  return (
    <motion.div data-guide-layer className="fixed inset-0 z-[2147483002] flex items-center justify-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_40%,rgba(124,45,18,0.5),rgba(3,3,12,0.92)_65%)] backdrop-blur-xl" />
      <div className="relative max-w-md text-center text-white">
        <motion.div className="mx-auto flex h-28 w-28 items-center justify-center" initial={{ scale: 0.4 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 160, damping: 12 }}>
          <ParticleOrb size={110} count={80} />
        </motion.div>
        <p className="mt-2 text-xs font-black uppercase tracking-[0.4em] text-orange-300">{t.done}</p>
        <h2 className="mt-2 text-4xl font-black">{tour.title[lang]}</h2>
        {tour.outro?.[lang] && <p className="mt-3 text-sm text-white/75">{tour.outro[lang]}</p>}
        <div className="mt-7 flex flex-wrap justify-center gap-2">
          <button type="button" onClick={onReplay} className="flex h-11 items-center gap-2 rounded-full border border-white/20 px-5 text-sm font-bold hover:bg-white/10">
            <RotateCcw className="h-4 w-4" /> {t.again}
          </button>
          <button type="button" onClick={onClose} className="flex h-11 items-center gap-2 rounded-full bg-gradient-to-r from-orange-500 to-amber-400 px-6 text-sm font-black shadow-[0_0_30px_rgba(249,115,22,0.45)]" data-testid="guide-try">
            {t.tryIt}
          </button>
        </div>
        {next && (
          <button type="button" onClick={next.start} className="mt-4 text-xs font-bold text-white/60 underline-offset-4 hover:text-white hover:underline">
            {t.next}: {next.title[lang]} →
          </button>
        )}
      </div>
    </motion.div>
  );
}

export default function Director({ tour, env, initialLang, onLang, onClose, nextTour }) {
  const phone = usePhone();
  const [lang, setLangState] = useState(null);
  const [state, setState] = useState(null);
  const [captionsOn, setCaptionsOn] = useState(true);
  const runnerRef = useRef(null);

  const begin = async (l) => {
    unlockAudio();
    setLangState(l);
    onLang(l);
    const r = new Runner({ tour, lang: l, env, onState: setState });
    runnerRef.current = r;
    setState({ ...r.state, busy: true });
    r.jump(0);
  };

  const setLang = (l) => {
    setLangState(l);
    onLang(l);
    runnerRef.current?.setLang(l);
    runnerRef.current?.restartBeat();
  };

  useEffect(() => () => runnerRef.current?.stop(), []);

  // Dev builds expose the player for automated checks
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    window.__guide = { state, runner: runnerRef.current };
  }, [state]);

  const touched = useRef(false);
  // Resuming after the user changed the demo page rebuilds it first
  const resume = () => {
    const r = runnerRef.current;
    if (!r) return;
    if (touched.current) {
      touched.current = false;
      r.restartBeat();
    } else r.resume();
  };
  const toggle = () => (runnerRef.current?.paused ? resume() : runnerRef.current?.pause());

  // A click on the page pauses the tour; keys drive it
  useEffect(() => {
    if (!lang) return undefined;
    const onKey = (e) => {
      const r = runnerRef.current;
      if (!r || e.isTrusted === false) return;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        onClose();
      } else if (e.key === " " && !/^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName || "") ) {
        e.preventDefault();
        e.stopImmediatePropagation();
        toggle();
      } else if (!r.paused && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
        e.preventDefault();
        e.stopImmediatePropagation();
        e.key === "ArrowRight" ? r.next() : r.prev();
      } else if (!r.paused) {
        // While it plays the tour owns the keyboard
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [lang, onClose]);

  // Touching the page while paused means the demo may have changed: rebuild
  // it before carrying on
  useEffect(() => {
    if (!state?.paused) return undefined;
    touched.current = false;
    const on = (e) => {
      if (!e.target.closest?.("[data-guide-layer]")) touched.current = true;
    };
    document.addEventListener("pointerdown", on, true);
    document.addEventListener("keydown", on, true);
    return () => {
      document.removeEventListener("pointerdown", on, true);
      document.removeEventListener("keydown", on, true);
    };
  }, [state?.paused]);
  const speaking = !!state && !state.paused && !!state.caption && state.progress < 1;
  const playing = state && state.status !== "done";

  return createPortal(
    <>
      <AnimatePresence>{!lang && <LanguagePick key="lang" tour={tour} initial={initialLang} onPick={begin} onClose={onClose} />}</AnimatePresence>
      {lang && state && playing && (
        <>
          {/* Catches clicks on the page while playing: they pause the tour */}
          {!state.paused && !state.busy && <div data-guide-layer className="fixed inset-0 z-[2147482999] cursor-pointer" onClick={() => runnerRef.current?.pause()} />}
          {state.busy && <div data-guide-layer className="fixed inset-0 z-[2147482999] bg-slate-950/70 backdrop-blur-md" />}
          {!state.paused && <Stage state={state} speaking={speaking} compact={phone} lang={lang} />}
          <Bar runner={runnerRef.current} state={state} tour={tour} lang={lang} setLang={setLang} onClose={onClose} onToggle={toggle} phone={phone} captionsOn={captionsOn} setCaptionsOn={setCaptionsOn} />
        </>
      )}
      <AnimatePresence>
        {lang && state?.status === "done" && (
          <Outro key="outro" tour={tour} lang={lang} next={nextTour} onClose={onClose} onReplay={() => runnerRef.current?.jump(0)} />
        )}
      </AnimatePresence>
    </>,
    document.body
  );
}

export { flatten };
