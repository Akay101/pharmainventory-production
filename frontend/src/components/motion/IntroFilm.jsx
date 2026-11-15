import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

// The landing page's opening film: the liquid glass DavaDesk logo plays once
// right after a successful sign-in (or first sign-in after registering), then
// the panel lifts away to reveal the dashboard loading underneath. If the film
// can't play (blocked, slow network, reduced motion) it steps aside quickly.
const FILM_BG = "#E5E5E7";
const EVENT = "dd:intro";
const pickSrc = () =>
  window.innerWidth * (window.devicePixelRatio || 1) >= 1600 ? "/intro/logo-intro-1080.mp4" : "/intro/logo-intro-720.mp4";

export function playIntro() {
  window.dispatchEvent(new Event(EVENT));
}

// Fetch the film while the person types their password, so it starts at once
// (a quiet fetch fills the HTTP cache; <link rel=preload as=video> isn't supported)
let warmed = false;
export function warmIntro() {
  if (warmed) return undefined;
  warmed = true;
  const t = setTimeout(() => {
    fetch(pickSrc(), { priority: "low" }).catch(() => {
      warmed = false;
    });
  }, 600);
  return () => clearTimeout(t);
}

export default function IntroFilm() {
  const [run, setRun] = useState(0);
  const [show, setShow] = useState(false);
  const video = useRef(null);
  const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    const go = () => {
      setRun((n) => n + 1);
      setShow(true);
    };
    window.addEventListener(EVENT, go);
    return () => window.removeEventListener(EVENT, go);
  }, []);

  useEffect(() => {
    if (!show) return;
    if (reduced) {
      const t = setTimeout(() => setShow(false), 300);
      return () => clearTimeout(t);
    }
    const v = video.current;
    let started = false;
    const finish = (why) => {
      if (window.__ddIntroDebug) console.log("[intro] finish", why);
      setShow(false);
    };
    const onPlaying = () => (started = true);
    v?.addEventListener("playing", onPlaying);
    v?.play().catch((e) => finish("play " + e?.message));
    // Never hold the app longer than this; give up early if the film hasn't started
    const notStarted = setTimeout(() => !started && finish("not started"), 1800);
    const hardStop = setTimeout(() => finish("hard stop"), 4500);
    document.documentElement.style.overflow = "hidden";
    return () => {
      v?.removeEventListener("playing", onPlaying);
      clearTimeout(notStarted);
      clearTimeout(hardStop);
    };
  }, [show, run, reduced]);

  return (
    <AnimatePresence onExitComplete={() => (document.documentElement.style.overflow = "")}>
      {show && (
        <motion.div
          key={run}
          data-testid="intro-film"
          aria-hidden
          className="fixed inset-0 flex items-center justify-center overflow-hidden"
          style={{ backgroundColor: FILM_BG, zIndex: 2147483600 }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reduced ? { opacity: 0 } : { y: "-100%" }}
          transition={{ duration: reduced ? 0.25 : 0.95, ease: [0.76, 0, 0.24, 1], opacity: { duration: 0.18 } }}
        >
          {!reduced && (
            <motion.video
              ref={video}
              src={pickSrc()}
              muted
              playsInline
              autoPlay
              preload="auto"
              disablePictureInPicture
              onEnded={() => {
                if (window.__ddIntroDebug) console.log("[intro] ended");
                setShow(false);
              }}
              onError={() => {
                if (window.__ddIntroDebug) console.log("[intro] video error");
                setShow(false);
              }}
              className="h-[72%] w-[72%] object-contain"
              exit={{ scale: 0.94, opacity: 0.4 }}
              transition={{ duration: 0.9, ease: [0.76, 0, 0.24, 1] }}
            />
          )}
          {/* the curtain's leading edge, so the lift reads as a physical panel */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-black/10" />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
