import { memo, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useMotionTemplate, useReducedMotion, useSpring, useTransform } from "framer-motion";
import Orb from "./Orb";
import { find, union } from "./dom";
import { voiceLevel } from "./narration";
import Graphic from "./Graphics";

// Everything a tour draws over the real page: the dimmed, softly blurred
// stage with a lit "iris" around what's being explained, a light sweep, a
// magnifier for small controls, the assistant's orb that travels and presses
// things, chapter cards and the motion graphics.

const PAD = 10;

// Live rect of the focused element(s), re-read every frame so it follows
// scrolling, layout changes and animations
export function useFocusRect(spec) {
  const [rect, setRect] = useState(null);
  const cache = useRef({ spec: null, els: [], at: 0 });
  useEffect(() => {
    if (!spec) {
      setRect(null);
      return undefined;
    }
    let raf = 0;
    const specs = Array.isArray(spec) && spec.some((s) => s?.union) ? spec.map((s) => s.union) : [spec];
    const tick = (now) => {
      const c = cache.current;
      if (c.spec !== spec || now - c.at > 1000 || c.els.some((e) => !e?.isConnected)) {
        c.spec = spec;
        c.at = now;
        c.els = specs.map((s) => find(s)).filter(Boolean);
      }
      const r = union(c.els.map((e) => e.getBoundingClientRect()));
      setRect((prev) => {
        if (!r) return prev && null;
        if (prev && Math.abs(prev.left - r.left) < 0.5 && Math.abs(prev.top - r.top) < 0.5 && Math.abs(prev.width - r.width) < 0.5 && Math.abs(prev.height - r.height) < 0.5) return prev;
        return { left: r.left, top: r.top, width: r.width, height: r.height };
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [spec]);
  return rect;
}

function useViewport() {
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const on = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return vp;
}

const roundedRect = (x, y, w, h, r) => {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  return `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
};

function Iris({ rect, look, vp }) {
  const reduce = useReducedMotion();
  const cfg = reduce ? { duration: 0 } : { stiffness: 170, damping: 26, mass: 0.9 };
  const hole = rect
    ? { x: rect.left - PAD, y: rect.top - PAD, w: rect.width + PAD * 2, h: rect.height + PAD * 2 }
    : { x: vp.w / 2, y: vp.h / 2, w: 0, h: 0 };
  const x = useSpring(hole.x, cfg);
  const y = useSpring(hole.y, cfg);
  const w = useSpring(hole.w, cfg);
  const h = useSpring(hole.h, cfg);
  // The blur is the costly part: it is re-shaped only once the light has
  // settled, and fades out while the light moves (the dim layer follows the
  // light every frame and costs little)
  const [settled, setSettled] = useState(hole);
  const [moving, setMoving] = useState(false);
  const key = `${Math.round(hole.x)},${Math.round(hole.y)},${Math.round(hole.w)},${Math.round(hole.h)}`;
  useEffect(() => {
    x.set(hole.x);
    y.set(hole.y);
    w.set(hole.w);
    h.set(hole.h);
    if (reduce) {
      setSettled(hole);
      return undefined;
    }
    setMoving(true);
    const t = setTimeout(() => {
      setSettled(hole);
      setMoving(false);
    }, 520);
    return () => clearTimeout(t);
  }, [key]); // eslint-disable-line

  const clip = useTransform([x, y, w, h], ([X, Y, W, H]) => `path(evenodd, "M0 0H${vp.w}V${vp.h}H0Z ${W > 1 ? roundedRect(X, Y, W, H, 14) : ""}")`);
  const blurClip = `path(evenodd, "M0 0H${vp.w}V${vp.h}H0Z ${settled.w > 1 ? roundedRect(settled.x, settled.y, settled.w, settled.h, 14) : ""}")`;
  const dim = look === "stage" ? 0 : look === "wide" ? 0.38 : 0.6;
  const blur = look === "stage" ? 0 : look === "wide" ? 1.5 : 3;
  const tx = useMotionTemplate`translate3d(${x}px, ${y}px, 0)`;
  // The spinning gradient only needs to cover the frame's diagonal
  const ring = useTransform([w, h], ([W, H]) => Math.ceil(Math.hypot(W, H)) + 12);

  return (
    <>
      {blur > 0 && (
        <div
          className="pointer-events-none fixed inset-0"
          style={{
            clipPath: blurClip,
            WebkitClipPath: blurClip,
            backdropFilter: `blur(${blur}px) saturate(0.8)`,
            WebkitBackdropFilter: `blur(${blur}px) saturate(0.8)`,
            opacity: moving ? 0 : 1,
            transition: "opacity 260ms ease",
          }}
        />
      )}
      <motion.div className="pointer-events-none fixed inset-0" style={{ clipPath: clip, WebkitClipPath: clip, background: `rgba(6, 8, 20, ${dim})`, transition: "background 400ms" }} />
      {rect && look !== "stage" && (
        <motion.div className="pointer-events-none fixed left-0 top-0" style={{ transform: tx, width: w, height: h, borderRadius: 14, willChange: "transform" }}>
          <div className="guide-halo absolute inset-0 rounded-[14px]">
            <div className="guide-halo-ring">
              <motion.div className="guide-halo-spin" style={{ width: ring, height: ring }} />
            </div>
          </div>
          {!reduce && <Sweep key={key} />}
        </motion.div>
      )}
    </>
  );
}

// One diagonal shimmer across a newly lit area
function Sweep() {
  return (
    <div className="absolute inset-0 overflow-hidden rounded-[14px]">
      <motion.div
        className="absolute inset-y-[-40%] left-0 w-[45%]"
        style={{ background: "linear-gradient(100deg, transparent, rgba(255,255,255,0.28), transparent)", rotate: 12 }}
        initial={{ x: "-140%" }}
        animate={{ x: "290%" }}
        transition={{ duration: 1.1, delay: 0.35, ease: [0.4, 0, 0.2, 1] }}
      />
    </div>
  );
}

// Small controls are also shown magnified beside themselves
function Loupe({ spec, rect, vp }) {
  const box = useRef(null);
  useEffect(() => {
    const el = find(spec);
    const host = box.current;
    if (!el || !host) return;
    const clone = el.cloneNode(true);
    clone.style.pointerEvents = "none";
    clone.style.margin = "0";
    clone.style.width = `${rect.width}px`;
    clone.style.height = `${rect.height}px`;
    clone.removeAttribute("id");
    host.innerHTML = "";
    host.appendChild(clone);
  }, [spec]); // eslint-disable-line
  if (!rect) return null;
  const scale = Math.min(3, 120 / Math.max(rect.width, rect.height));
  const size = 150;
  const right = rect.left + rect.width + 40 + size < vp.w;
  const left = right ? rect.left + rect.width + 36 : rect.left - size - 36;
  const top = Math.min(Math.max(12, rect.top + rect.height / 2 - size / 2), vp.h - size - 12);
  return (
    <motion.div
      className="pointer-events-none fixed overflow-hidden rounded-full border-2 border-white/70 bg-background shadow-[0_20px_60px_rgba(0,0,0,0.45)]"
      style={{ left, top, width: size, height: size }}
      initial={{ scale: 0.2, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.2, opacity: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 22 }}
    >
      <div className="absolute left-1/2 top-1/2 flex items-center justify-center" style={{ width: rect.width, height: rect.height, transform: `translate(-50%, -50%) scale(${scale})` }} ref={box} />
      <div className="absolute inset-0 rounded-full shadow-[inset_0_0_30px_rgba(249,115,22,0.35)]" />
    </motion.div>
  );
}

// The assistant itself: rests beside what it's talking about, glows with its
// voice, flies to controls and presses them
function Presenter({ rect, cursor, vp, speaking, compact }) {
  const reduce = useReducedMotion();
  const size = compact ? 46 : 58;
  let target;
  if (cursor) target = { x: cursor.x, y: cursor.y };
  else if (rect) {
    const spaceRight = vp.w - (rect.left + rect.width);
    const spaceBelow = vp.h - (rect.top + rect.height);
    if (spaceRight > size + 40) target = { x: rect.left + rect.width + size / 2 + 22, y: Math.max(size, Math.min(rect.top + 18, vp.h - size)) };
    else if (rect.left > size + 40) target = { x: rect.left - size / 2 - 22, y: Math.max(size, Math.min(rect.top + 18, vp.h - size)) };
    else if (spaceBelow > size + 40) target = { x: Math.min(vp.w - size, rect.left + rect.width - size), y: rect.top + rect.height + size / 2 + 18 };
    else target = { x: Math.min(vp.w - size, rect.left + rect.width - size), y: Math.max(size, rect.top - size / 2 - 18) };
  } else target = { x: vp.w / 2, y: vp.h * 0.38 };

  const cfg = reduce ? { duration: 0 } : { stiffness: 120, damping: 17, mass: 0.8 };
  const x = useSpring(target.x, cfg);
  const y = useSpring(target.y, cfg);
  useEffect(() => {
    x.set(target.x);
    y.set(target.y);
  }, [target.x, target.y]); // eslint-disable-line

  // Glow follows the voice
  const glowRef = useRef(null);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const lvl = speaking ? Math.max(0.12, voiceLevel()) : 0;
      if (glowRef.current) {
        glowRef.current.style.transform = `scale(${1 + lvl * 0.9})`;
        glowRef.current.style.opacity = String(0.35 + lvl * 0.65);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [speaking]);

  const tx = useMotionTemplate`translate(${x}px, ${y}px) translate(-50%, -50%)`;
  const big = !rect && !cursor;
  return (
    <motion.div className="pointer-events-none fixed left-0 top-0" style={{ transform: tx }}>
      <motion.div animate={{ scale: big ? 2.1 : cursor?.press ? 0.72 : 1 }} transition={{ type: "spring", stiffness: 380, damping: 18 }} className="relative" style={{ width: size, height: size }}>
        <div ref={glowRef} className="absolute inset-[-35%] rounded-full" style={{ background: "radial-gradient(circle, rgba(236,72,153,0.55), rgba(168,85,247,0.25) 45%, transparent 70%)", transition: "transform 80ms linear" }} />
        <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_35%_30%,rgba(255,255,255,0.9),rgba(255,237,213,0.55)_30%,rgba(249,115,22,0.25)_60%,transparent_72%)]" />
        <Orb size={size} count={compact ? 34 : 46} className="relative" />
      </motion.div>
      <AnimatePresence>
        {cursor?.press && (
          <motion.span
            key={cursor.t}
            className="absolute left-1/2 top-1/2 rounded-full border-2 border-orange-400"
            style={{ width: 24, height: 24, marginLeft: -12, marginTop: -12 }}
            initial={{ scale: 0.4, opacity: 0.9 }}
            animate={{ scale: 3.2, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          />
        )}
      </AnimatePresence>
      {cursor?.typing && !reduce && <TypingSparks />}
    </motion.div>
  );
}

function TypingSparks() {
  return (
    <div className="absolute left-1/2 top-1/2">
      {[0, 1, 2, 3, 4].map((i) => (
        <motion.span
          key={i}
          className="absolute h-1.5 w-1.5 rounded-full bg-amber-300 shadow-[0_0_8px_rgba(251,191,36,0.9)]"
          initial={{ x: 0, y: 0, opacity: 1 }}
          animate={{ x: [0, (i - 2) * 14], y: [0, -18 - (i % 2) * 10], opacity: [1, 0] }}
          transition={{ duration: 0.7, repeat: Infinity, delay: i * 0.14, ease: "easeOut" }}
        />
      ))}
    </div>
  );
}

// Full-screen chapter title, letterboxed like a film
function ChapterCard({ card }) {
  return (
    <motion.div className="pointer-events-none fixed inset-0 flex items-center justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }}>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(20,14,40,0.82),rgba(3,3,10,0.94))] backdrop-blur-md" />
      <motion.div className="absolute inset-x-0 top-0 bg-black" initial={{ height: 0 }} animate={{ height: "11vh" }} exit={{ height: 0 }} transition={{ duration: 0.5, ease: [0.7, 0, 0.3, 1] }} />
      <motion.div className="absolute inset-x-0 bottom-0 bg-black" initial={{ height: 0 }} animate={{ height: "11vh" }} exit={{ height: 0 }} transition={{ duration: 0.5, ease: [0.7, 0, 0.3, 1] }} />
      <div className="relative px-6 text-center text-white">
        <motion.p className="text-xs font-black uppercase tracking-[0.5em] text-orange-300" initial={{ opacity: 0, letterSpacing: "1.2em" }} animate={{ opacity: 1, letterSpacing: "0.5em" }} transition={{ duration: 0.9, delay: 0.15 }}>
          {String(card.n).padStart(2, "0")}
        </motion.p>
        <motion.h2 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl" initial={{ opacity: 0, y: 18, filter: "blur(8px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} transition={{ duration: 0.7, delay: 0.3 }}>
          {card.title}
        </motion.h2>
        <motion.div className="mx-auto mt-5 h-[2px] bg-gradient-to-r from-transparent via-orange-400 to-transparent" initial={{ width: 0 }} animate={{ width: 260 }} transition={{ duration: 0.9, delay: 0.55, ease: "easeOut" }} />
      </div>
    </motion.div>
  );
}

function Stage({ state, speaking, compact, lang = "en" }) {
  const vp = useViewport();
  const rect = useFocusRect(state.card ? null : state.focus);
  const small = rect && (state.look === "loupe" || (rect.width < 44 && rect.height < 44));
  const fx = useMemo(() => (state.card ? [] : state.fx || []), [state.card, state.fx]);
  return (
    <div data-guide-layer className="pointer-events-none fixed inset-0 z-[2147483000]">
      {!state.card && <Iris rect={rect} look={state.look} vp={vp} />}
      <AnimatePresence>{small && <Loupe key={JSON.stringify(state.focus)} spec={state.focus} rect={rect} vp={vp} />}</AnimatePresence>
      <AnimatePresence>
        {fx.map((f) => (
          <Graphic key={f.key} fx={f} focusRect={rect} vp={vp} compact={compact} lang={lang} />
        ))}
      </AnimatePresence>
      {!state.card && !state.busy && <Presenter rect={rect} cursor={state.cursor} vp={vp} speaking={speaking} compact={compact} />}
      <AnimatePresence>{state.card && <ChapterCard key={state.card.n} card={state.card} />}</AnimatePresence>
    </div>
  );
}

// The stage ignores the caption's progress ticks; only what it draws re-renders it
const same = (a, b) =>
  a.speaking === b.speaking &&
  a.compact === b.compact &&
  a.lang === b.lang &&
  ["focus", "look", "fx", "card", "cursor", "busy"].every((k) => a.state[k] === b.state[k]);
export default memo(Stage, same);
