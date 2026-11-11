import { useEffect, useRef, useState } from "react";
import { animate, motion, useReducedMotion } from "framer-motion";
import { find } from "./dom";
import { IS_MAC } from "../../../lib/shortcuts";

// Key names as printed on this keyboard
const MAC_KEYS = { Alt: "⌥", Ctrl: "⌘", Shift: "⇧" };
const keyName = (k) => (IS_MAC && MAC_KEYS[k]) || k;

// Motion graphics a tour beat can play over the page, anchored next to the
// focused element (or fx.at). Types:
//   chips     { items: [{ label, value?, tone? }] }        facts that pop in one by one
//   equation  { parts: ["₹2.13", "×", "10", "=", "₹21.30"] } a calculation that builds itself
//   split     { from: "GST 12%", into: ["CGST 6%", "SGST 6%"] }
//   stamp     { text: "PAID", tone }                        a rubber stamp landing on the target
//   count     { to | toFrom: target, from?, prefix?, label? } a number counting up
//   flow      { to: target }                                particles streaming to another element
//   scan      {}                                            a laser line sweeping the target
//   receipt   { title, lines: [[name, amount]], total }     a bill printing out
//   keys      { combo: ["Alt", "N"], label? }               keyboard shortcut caps
//   rings     {}                                            pulses calling attention to a spot
//   title     { text, sub? }                                big kinetic headline (no target)

const TONES = {
  orange: "from-orange-500 to-amber-400 text-white",
  green: "from-emerald-500 to-teal-400 text-white",
  rose: "from-rose-500 to-pink-500 text-white",
  violet: "from-violet-500 to-fuchsia-500 text-white",
  sky: "from-sky-500 to-indigo-500 text-white",
  ink: "from-slate-900 to-slate-700 text-white",
};

function anchor(fx, focusRect) {
  if (fx.at) {
    const el = find(fx.at);
    if (el) return el.getBoundingClientRect();
  }
  return focusRect;
}

// Where a box of (w, h) fits beside the anchor
function place(r, w, h, vp, side) {
  const M = 14;
  if (!r) return { left: (vp.w - w) / 2, top: vp.h * 0.18 };
  const cx = Math.min(Math.max(M, r.left + r.width / 2 - w / 2), vp.w - w - M);
  const cy = Math.min(Math.max(M, r.top + r.height / 2 - h / 2), vp.h - h - M);
  const fits = {
    bottom: r.top + r.height + 18 + h < vp.h - 120,
    top: r.top - 18 - h > 70,
    right: r.left + r.width + 18 + w < vp.w - M,
    left: r.left - 18 - w > M,
  };
  const order = side ? [side, "bottom", "top", "right", "left"] : ["bottom", "top", "right", "left"];
  const s = order.find((k) => fits[k]) || "over";
  if (s === "bottom") return { left: cx, top: r.top + r.height + 18 };
  if (s === "top") return { left: cx, top: r.top - 18 - h };
  if (s === "right") return { left: r.left + r.width + 18, top: cy };
  if (s === "left") return { left: r.left - 18 - w, top: cy };
  return { left: cx, top: cy };
}

function Placed({ fx, focusRect, vp, children, className = "" }) {
  const ref = useRef(null);
  const [size, setSize] = useState({ w: 280, h: 60 });
  // Measured once, then only when the box itself resizes
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () =>
      setSize((prev) => (prev.w === el.offsetWidth && prev.h === el.offsetHeight ? prev : { w: el.offsetWidth, h: el.offsetHeight }));
    measure();
    if (!window.ResizeObserver) return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const r = anchor(fx, focusRect);
  const pos = place(r, size.w, size.h, vp, fx.side);
  return (
    <motion.div
      ref={ref}
      className={`fixed ${className}`}
      style={{ left: pos.left, top: pos.top, maxWidth: vp.w - 28 }}
      initial={{ opacity: 0, y: 10, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.97, transition: { duration: 0.2 } }}
      transition={{ type: "spring", stiffness: 260, damping: 24, delay: (fx.delay || 0) / 1000 }}
    >
      {children}
    </motion.div>
  );
}

const pop = (i, base = 0) => ({
  initial: { opacity: 0, y: 14, scale: 0.6, filter: "blur(6px)" },
  animate: { opacity: 1, y: 0, scale: 1, filter: "blur(0px)" },
  transition: { type: "spring", stiffness: 340, damping: 20, delay: base + i * 0.28 },
});

function Chips({ fx, ...p }) {
  return (
    <Placed fx={fx} {...p}>
      <div className="flex flex-wrap gap-2">
        {fx.items.map((it, i) => (
          <motion.div key={i} {...pop(i, (fx.delay || 0) / 1000)} className={`rounded-2xl bg-gradient-to-br px-3.5 py-2 shadow-[0_10px_30px_rgba(0,0,0,0.35)] ring-1 ring-white/20 ${TONES[it.tone || "ink"]}`}>
            <div className="text-[10px] font-black uppercase tracking-[0.14em] opacity-75">{it.label}</div>
            {it.value !== undefined && <div className="font-mono text-sm font-black">{it.value}</div>}
          </motion.div>
        ))}
      </div>
    </Placed>
  );
}

function Equation({ fx, ...p }) {
  return (
    <Placed fx={fx} {...p}>
      <div className="flex flex-wrap items-center gap-1.5 rounded-2xl bg-slate-950/90 px-4 py-3 shadow-[0_18px_50px_rgba(0,0,0,0.5)] ring-1 ring-white/15 backdrop-blur">
        {fx.parts.map((t, i) => {
          const op = /^[×x+\-−=÷%]$/.test(t);
          const last = i === fx.parts.length - 1;
          return (
            <motion.span
              key={i}
              {...pop(i, (fx.delay || 0) / 1000)}
              className={op ? "px-0.5 text-lg font-black text-orange-300" : `rounded-lg px-2 py-1 font-mono text-sm font-black ${last ? "bg-gradient-to-r from-orange-500 to-amber-400 text-white shadow-[0_0_24px_rgba(249,115,22,0.6)]" : "bg-white/10 text-white"}`}
            >
              {t}
            </motion.span>
          );
        })}
      </div>
    </Placed>
  );
}

function Split({ fx, ...p }) {
  return (
    <Placed fx={fx} {...p}>
      <div className="flex flex-col items-center gap-2">
        <motion.div {...pop(0)} className="rounded-xl bg-gradient-to-r from-sky-500 to-indigo-500 px-4 py-1.5 font-mono text-sm font-black text-white shadow-lg">
          {fx.from}
        </motion.div>
        <svg width="180" height="26" className="overflow-visible">
          <motion.path d="M90 0 C90 14, 30 10, 30 26" fill="none" stroke="rgba(125,211,252,0.9)" strokeWidth="2" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.45, duration: 0.5 }} />
          <motion.path d="M90 0 C90 14, 150 10, 150 26" fill="none" stroke="rgba(165,180,252,0.9)" strokeWidth="2" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.45, duration: 0.5 }} />
        </svg>
        <div className="flex gap-6">
          {fx.into.map((t, i) => (
            <motion.div key={i} {...pop(i, 0.9)} className="rounded-xl bg-white px-3 py-1.5 font-mono text-xs font-black text-indigo-700 shadow-lg ring-2 ring-indigo-300">
              {t}
            </motion.div>
          ))}
        </div>
      </div>
    </Placed>
  );
}

function Stamp({ fx, focusRect }) {
  const r = anchor(fx, focusRect);
  if (!r) return null;
  const color = { green: "#059669", rose: "#e11d48", orange: "#ea580c", violet: "#7c3aed" }[fx.tone || "green"];
  return (
    <motion.div
      className="fixed flex items-center justify-center"
      style={{ left: r.left + r.width / 2, top: r.top + r.height / 2 }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="-translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-xl border-[5px] px-5 py-1.5 text-3xl font-black uppercase tracking-[0.2em]"
        style={{ color, borderColor: color, background: "rgba(255,255,255,0.88)", boxShadow: `0 0 0 3px rgba(255,255,255,0.6), 0 20px 50px ${color}55`, mixBlendMode: "normal" }}
        initial={{ scale: 2.6, rotate: -26, opacity: 0 }}
        animate={{ scale: 1, rotate: -12, opacity: 1 }}
        transition={{ type: "spring", stiffness: 420, damping: 16, delay: (fx.delay || 0) / 1000 }}
      >
        {fx.text}
      </motion.div>
    </motion.div>
  );
}

// Reads a ₹ amount shown on the page, e.g. the grand total
const amountIn = (spec) => {
  const el = find(spec);
  const raw = el ? (el.value !== undefined && el.value !== "" ? el.value : el.textContent) : "";
  const n = parseFloat(String(raw).replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

function Count({ fx, ...p }) {
  const [to] = useState(() => (fx.toFrom ? amountIn(fx.toFrom) : fx.to));
  const [v, setV] = useState(fx.from || 0);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (reduce) return setV(to);
    const c = animate(fx.from || 0, to, { duration: 1.6, delay: (fx.delay || 0) / 1000 + 0.2, ease: [0.16, 1, 0.3, 1], onUpdate: setV });
    return () => c.stop();
  }, [to]); // eslint-disable-line
  return (
    <Placed fx={fx} {...p}>
      <div className="rounded-2xl bg-slate-950/90 px-5 py-3 text-center shadow-[0_18px_50px_rgba(0,0,0,0.5)] ring-1 ring-orange-400/40">
        {fx.label && <div className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-300">{fx.label}</div>}
        <div className="font-mono text-3xl font-black text-white">
          {fx.prefix || ""}
          {v.toLocaleString("en-IN", { minimumFractionDigits: fx.decimals ?? 2, maximumFractionDigits: fx.decimals ?? 2 })}
        </div>
      </div>
    </Placed>
  );
}

function Flow({ fx, focusRect }) {
  const from = anchor({ at: fx.from }, focusRect);
  const toEl = find(fx.to);
  if (!from || !toEl) return null;
  const to = toEl.getBoundingClientRect();
  const a = { x: from.left + from.width / 2, y: from.top + from.height / 2 };
  const b = { x: to.left + to.width / 2, y: to.top + to.height / 2 };
  const mid = { x: (a.x + b.x) / 2 + (b.y - a.y) * 0.25, y: (a.y + b.y) / 2 - Math.abs(b.x - a.x) * 0.18 };
  return (
    <motion.div className="fixed inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <svg className="absolute inset-0 h-full w-full overflow-visible">
        <motion.path d={`M${a.x} ${a.y} Q${mid.x} ${mid.y} ${b.x} ${b.y}`} fill="none" stroke="rgba(251,146,60,0.55)" strokeWidth="2" strokeDasharray="4 7" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.9 }} />
      </svg>
      {Array.from({ length: 9 }).map((_, i) => (
        <motion.span
          key={i}
          className="absolute h-2.5 w-2.5 rounded-full bg-amber-300 shadow-[0_0_14px_rgba(251,191,36,0.95)]"
          style={{ left: -5, top: -5 }}
          initial={{ x: a.x, y: a.y, opacity: 0, scale: 0.6 }}
          animate={{ x: [a.x, mid.x, b.x], y: [a.y, mid.y, b.y], opacity: [0, 1, 0], scale: [0.6, 1.2, 0.4] }}
          transition={{ duration: 1.3, delay: 0.3 + i * 0.13, repeat: fx.repeat ? Infinity : 0, repeatDelay: 0.6, ease: "easeInOut" }}
        />
      ))}
    </motion.div>
  );
}

function Scan({ fx, focusRect }) {
  const r = anchor(fx, focusRect);
  if (!r) return null;
  return (
    <motion.div className="fixed overflow-hidden rounded-[14px]" style={{ left: r.left - 10, top: r.top - 10, width: r.width + 20, height: r.height + 20 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div
        className="absolute inset-x-0 h-[3px] bg-gradient-to-r from-transparent via-emerald-300 to-transparent shadow-[0_0_18px_4px_rgba(52,211,153,0.7)]"
        initial={{ top: "0%" }}
        animate={{ top: ["0%", "100%", "0%"] }}
        transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
      />
    </motion.div>
  );
}

function Receipt({ fx, ...p }) {
  return (
    <Placed fx={fx} {...p}>
      <div className="overflow-hidden" style={{ width: 230 }}>
        <motion.div
          className="rounded-b-lg bg-white px-4 pb-4 pt-3 font-mono text-[11px] text-slate-800 shadow-[0_24px_60px_rgba(0,0,0,0.5)]"
          style={{ backgroundImage: "radial-gradient(circle at 6px 0, transparent 5px, white 5.5px)", backgroundSize: "12px 100%" }}
          initial={{ y: "-100%" }}
          animate={{ y: 0 }}
          transition={{ duration: 1.4, ease: [0.3, 0.8, 0.4, 1], delay: (fx.delay || 0) / 1000 }}
        >
          <div className="border-b border-dashed border-slate-300 pb-1.5 text-center text-xs font-black tracking-widest">{fx.title || "TAX INVOICE"}</div>
          {fx.lines.map(([n, amt], i) => (
            <div key={i} className="mt-1.5 flex justify-between gap-2">
              <span className="truncate">{n}</span>
              <span className="font-bold">{amt}</span>
            </div>
          ))}
          <div className="mt-2 flex justify-between border-t border-dashed border-slate-300 pt-1.5 text-sm font-black">
            <span>TOTAL</span>
            <span>{fx.total}</span>
          </div>
        </motion.div>
      </div>
    </Placed>
  );
}

function Keys({ fx, ...p }) {
  return (
    <Placed fx={fx} {...p}>
      <div className="flex items-center gap-1.5 rounded-2xl bg-slate-950/85 px-3 py-2 ring-1 ring-white/15">
        {fx.combo.map((k, i) => (
          <motion.kbd key={i} {...pop(i)} className="min-w-[2.2rem] rounded-lg border-b-4 border-slate-400 bg-gradient-to-b from-white to-slate-200 px-2 py-1 text-center font-mono text-sm font-black text-slate-800 shadow">
            {keyName(k)}
          </motion.kbd>
        ))}
        {fx.label && <span className="ml-1.5 text-xs font-bold text-white/80">{fx.label}</span>}
      </div>
    </Placed>
  );
}

function Rings({ fx, focusRect }) {
  const r = anchor(fx, focusRect);
  if (!r) return null;
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  return (
    <motion.div className="fixed" style={{ left: cx, top: cy }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="absolute rounded-full border-2 border-orange-400/80"
          style={{ width: 40, height: 40, left: -20, top: -20 }}
          animate={{ scale: [0.6, 3.4], opacity: [0.9, 0] }}
          transition={{ duration: 1.8, delay: i * 0.6, repeat: Infinity, ease: "easeOut" }}
        />
      ))}
    </motion.div>
  );
}

function Title({ fx, vp }) {
  const words = String(fx.text).split(" ");
  return (
    <motion.div className="fixed inset-x-0 text-center" style={{ top: vp.h * (fx.y ?? 0.16) }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="mx-auto max-w-3xl px-6">
        <h2 className="text-3xl font-black tracking-tight text-white drop-shadow-[0_6px_30px_rgba(0,0,0,0.6)] sm:text-5xl">
          {words.map((w, i) => (
            <motion.span key={i} className="mr-[0.25em] inline-block" initial={{ opacity: 0, y: 24, rotateX: 70 }} animate={{ opacity: 1, y: 0, rotateX: 0 }} transition={{ delay: 0.15 + i * 0.09, type: "spring", stiffness: 200, damping: 18 }}>
              {w}
            </motion.span>
          ))}
        </h2>
        {fx.sub && (
          <motion.p className="mt-3 text-base font-semibold text-white/80" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 + words.length * 0.09 }}>
            {fx.sub}
          </motion.p>
        )}
      </div>
    </motion.div>
  );
}

const TYPES = { chips: Chips, equation: Equation, split: Split, stamp: Stamp, count: Count, flow: Flow, scan: Scan, receipt: Receipt, keys: Keys, rings: Rings, title: Title };

// Text in a graphic can be { en, hi }: pick the tour's language
const localize = (v, lang) => {
  if (Array.isArray(v)) return v.map((x) => localize(x, lang));
  if (v && typeof v === "object" && ("en" in v || "hi" in v) && Object.keys(v).every((k) => k === "en" || k === "hi")) return v[lang] ?? v.en;
  if (v && typeof v === "object" && !v.sel && !v.within) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, localize(x, lang)]));
  return v;
};

export default function Graphic({ fx, focusRect, vp, compact, lang = "en" }) {
  const C = TYPES[fx.type];
  if (!C) return null;
  if (compact && fx.desktopOnly) return null;
  return <C fx={localize(fx, lang)} focusRect={focusRect} vp={vp} />;
}
