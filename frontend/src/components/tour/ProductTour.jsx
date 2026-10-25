import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import axios from "axios";
import { ArrowLeft, ArrowRight, Check, ShoppingCart, Receipt, Settings, Sparkles, Package, CalendarX, Bot, X, Info } from "lucide-react";
import { API } from "../../App";
import { comboKeys, isVisible, topModal } from "../../lib/shortcuts";
import { AI_LOGO_SRC } from "../scan/ScanUI";
import { stepsFor } from "./tourSteps";

// Welcome tour: a spotlight that walks a new user through the app, step by
// step. Starts by itself the first time a user with an active plan lands on
// the dashboard; can be replayed from the profile menu (useTour().start()).
// Seen/skipped is stored on the user (POST /users/me/tour) so it shows once
// per account, on any device.

export const TOUR_VERSION = 1;
const PAD = 8; // spotlight padding around the target, px
const GAP = 14; // between target and card
const EDGE = 12; // keep the card this far from the screen edge
const seenKey = (userId) => `dd_tour_seen_${userId}`;

const TourContext = createContext({ start: () => {}, active: false });
export const useTour = () => useContext(TourContext);

function useIsPhone() {
  const query = "(max-width: 767px)";
  const [phone, setPhone] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setPhone(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return phone;
}

// First visible target for a step: { el, hint } or null
function resolveTarget(step) {
  for (const t of step.targets || []) {
    const sel = typeof t === "string" ? t : t.sel;
    const el = [...document.querySelectorAll(sel)].find((e) => isVisible(e) && e.getBoundingClientRect().width > 0);
    if (el) return { el, hint: typeof t === "string" ? null : t.hint };
  }
  return null;
}

const sameRect = (a, b) => a && b && Math.abs(a.top - b.top) < 0.5 && Math.abs(a.left - b.left) < 0.5 && Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5;

export function TourProvider({ user, children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const isPhone = useIsPhone();
  const [index, setIndex] = useState(null); // null = closed
  const steps = useMemo(() => stepsFor(isPhone), [isPhone]);

  const start = useCallback(() => {
    if (location.pathname !== "/dashboard") navigate("/dashboard");
    setIndex(0);
  }, [location.pathname, navigate]);

  const end = useCallback(
    (status, step) => {
      setIndex(null);
      if (!user?.id) return;
      try {
        localStorage.setItem(seenKey(user.id), status);
      } catch {}
      axios.post(`${API}/users/me/tour`, { status, version: TOUR_VERSION, step }).catch(() => {});
    },
    [user?.id]
  );

  // First visit: start on the dashboard once it has rendered, if nothing else is open
  useEffect(() => {
    if (!user?.id || index !== null) return undefined;
    if (location.pathname !== "/dashboard") return undefined;
    if (user.tour) return undefined;
    const status = user.subscription?.status;
    if (status !== "ACTIVE" && status !== "TRIAL") return undefined;
    let seen = null;
    try {
      seen = localStorage.getItem(seenKey(user.id));
    } catch {}
    if (seen) return undefined;
    const t = setTimeout(() => {
      if (!topModal() && document.querySelector('[data-tour="dashboard-kpis"]')) setIndex(0);
    }, 1200);
    return () => clearTimeout(t);
  }, [user?.id, user?.tour, user?.subscription?.status, location.pathname, index]);

  // Viewport class changed mid-tour (rotated phone, resized window): restart cleanly
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    setIndex((i) => (i === null ? null : 0));
  }, [isPhone]);

  const value = useMemo(() => ({ start, active: index !== null }), [start, index]);

  return (
    <TourContext.Provider value={value}>
      {children}
      {index !== null && (
        <TourOverlay
          steps={steps}
          index={index}
          setIndex={setIndex}
          isPhone={isPhone}
          firstName={(user?.name || "").split(" ")[0]}
          onFinish={(go) => {
            end("completed", steps.length - 1);
            if (go) navigate(go);
          }}
          onSkip={(at) => end("skipped", at)}
        />
      )}
    </TourContext.Provider>
  );
}

function TourOverlay({ steps, index, setIndex, isPhone, firstName, onFinish, onSkip }) {
  const step = steps[index];
  const centred = step.kind || !step.targets;
  const reduce = useReducedMotion();
  const [rect, setRect] = useState(null);
  const [hint, setHint] = useState(null);
  const [view, setView] = useState({ w: window.innerWidth, h: window.innerHeight });
  const cardRef = useRef(null);
  const [card, setCard] = useState({ w: 360, h: 220 });

  const last = index === steps.length - 1;
  const next = useCallback(() => (last ? onFinish() : setIndex((i) => Math.min(i + 1, steps.length - 1))), [last, onFinish, setIndex, steps.length]);
  const back = useCallback(() => setIndex((i) => Math.max(i - 1, 0)), [setIndex]);
  const skip = useCallback(() => onSkip(index), [onSkip, index]);

  // Find the step's element, bring it on screen, then follow it every frame
  // (layout can still be settling, fonts loading, the window resizing)
  useLayoutEffect(() => {
    if (centred) {
      setRect(null);
      setHint(null);
      return undefined;
    }
    let cancel = () => {};
    let found = resolveTarget(step);
    if (!found) {
      // Target missing at this size: show the step centred rather than stall
      setRect(null);
      setHint(null);
      return undefined;
    }
    setHint(found.hint);
    const r0 = found.el.getBoundingClientRect();
    if (r0.top < 70 || r0.bottom > window.innerHeight - 80) found.el.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
    let prev = null;
    const tick = () => {
      if (!found.el.isConnected || !isVisible(found.el)) found = resolveTarget(step) || found;
      const r = found.el.getBoundingClientRect();
      const next = { top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 };
      if (!sameRect(prev, next)) {
        prev = next;
        setRect(next);
      }
      cancel = nextFrame(tick);
    };
    tick();
    return () => cancel();
  }, [step, centred, reduce]);

  useEffect(() => {
    const on = () => setView({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);

  // Card size (for placing it): measured on mount and whenever it changes
  const ro = useRef(null);
  const setCardEl = useCallback((node) => {
    ro.current?.disconnect();
    cardRef.current = node;
    if (!node) return;
    setCard({ w: node.offsetWidth, h: node.offsetHeight });
    ro.current = new ResizeObserver(() => setCard((c) => (c.w === node.offsetWidth && c.h === node.offsetHeight ? c : { w: node.offsetWidth, h: node.offsetHeight })));
    ro.current.observe(node);
  }, []);
  useEffect(() => () => ro.current?.disconnect(), []);

  // Keys: → / Enter next, ← back, Esc skip. Captured first so page shortcuts don't fire.
  useEffect(() => {
    const onKey = (e) => {
      const map = { ArrowRight: next, Enter: next, ArrowLeft: back, Escape: skip };
      const fn = map[e.key];
      if (!fn) return;
      if (e.key === "Enter" && e.target?.tagName === "BUTTON") return; // let the focused button act
      e.preventDefault();
      e.stopImmediatePropagation();
      fn();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [next, back, skip]);

  // Focus the main button once the new card is in (keyboard users, screen readers)
  const focusPrimary = useCallback(() => cardRef.current?.querySelector("[data-tour-primary]")?.focus({ preventScroll: true }), []);
  useEffect(() => {
    const t = setTimeout(focusPrimary, 400); // also when there's no entrance animation
    return () => clearTimeout(t);
  }, [index, focusPrimary]);

  const pos = useMemo(() => placeCard(rect, card, view, step.placement, isPhone), [rect, card, view, step.placement, isPhone]);
  const showCentred = centred || !rect;
  const dim = "rgba(9, 9, 11, 0.66)";
  const hole = useTween(showCentred ? null : rect, reduce);

  return createPortal(
    // The dialog role sits on the card: the app's CSS blurs behind every [role=dialog],
    // which on this full-screen layer would blur the highlighted element too
    <div className="fixed inset-0 z-[200]" data-testid="product-tour">
      {/* Click shield: the page stays still while the tour is open */}
      <div className="absolute inset-0" onClick={(e) => e.stopPropagation()} />

      {/* Dimmed screen with a rounded window cut out over the target (SVG mask:
          a huge box-shadow isn't reliably painted by every browser) */}
      <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full">
        <defs>
          <mask id="dd-tour-hole">
            <rect width="100%" height="100%" fill="white" />
            {hole && <rect x={hole.left} y={hole.top} width={hole.width} height={hole.height} rx="16" fill="black" />}
          </mask>
        </defs>
        <rect width="100%" height="100%" fill={dim} mask="url(#dd-tour-hole)" />
      </svg>
      {hole && (
        <div aria-hidden="true" className="pointer-events-none absolute rounded-2xl" style={{ top: hole.top, left: hole.left, width: hole.width, height: hole.height }}>
          <span className="absolute inset-0 rounded-2xl ring-2 ring-orange-400 shadow-[0_0_0_4px_rgba(249,115,22,0.25),0_0_30px_rgba(249,115,22,0.45)]" />
          {/* Soft pulse that keeps its size (ping would balloon on wide targets) */}
          {!reduce && <span className="absolute -inset-1.5 rounded-[20px] ring-4 ring-orange-400/40 animate-pulse" />}
        </div>
      )}

      {/* Keyed per step: the new card animates in and the old one leaves at once,
          so card and spotlight never fall out of step on quick clicks */}
        <motion.div
          key={step.id}
          role="dialog"
          aria-modal="true"
          aria-label={step.title || "Welcome tour"}
          initial={reduce ? false : { opacity: 0, y: 10, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          onAnimationComplete={focusPrimary}
          className={showCentred ? "pointer-events-none absolute inset-0 flex items-center justify-center p-3" : "absolute"}
          style={showCentred ? undefined : { left: pos.left, top: pos.top, width: pos.width }}
        >
          <div ref={setCardEl} className="pointer-events-auto w-full" style={showCentred ? { maxWidth: step.kind ? 460 : 400 } : undefined}>
            {step.kind === "welcome" ? (
              <WelcomeCard firstName={firstName} total={steps.length - 2} onStart={next} onSkip={skip} isPhone={isPhone} />
            ) : step.kind === "finish" ? (
              <FinishCard onFinish={onFinish} onBack={back} isPhone={isPhone} />
            ) : (
              <StepCard step={step} hint={hint} index={index} total={steps.length} onNext={next} onBack={back} onSkip={skip} arrow={!showCentred ? pos.arrow : null} isPhone={isPhone} />
            )}
          </div>
        </motion.div>
    </div>,
    document.body
  );
}

// Next animation frame, or a timer when frames are paused (hidden tab), so
// anything driven by it always finishes on wall-clock time
function nextFrame(fn) {
  let done = false;
  const run = () => {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    clearTimeout(timer);
    fn(performance.now());
  };
  const raf = requestAnimationFrame(run);
  const timer = setTimeout(run, 50);
  return () => {
    done = true;
    cancelAnimationFrame(raf);
    clearTimeout(timer);
  };
}

// Glides the spotlight from one target to the next; small moves (scrolling,
// layout settling) follow instantly. A glide in progress heads for the
// target's latest position rather than restarting, so a target that keeps
// moving can't stall it.
function useTween(target, reduce) {
  const [shown, setShown] = useState(target);
  const shownRef = useRef(target);
  const targetRef = useRef(target);
  const anim = useRef(null); // { from, t0, raf }
  targetRef.current = target;

  useEffect(() => {
    const set = (r) => {
      shownRef.current = r;
      setShown(r);
    };
    if (anim.current) return; // the running glide picks up the new target
    const from = shownRef.current;
    if (!target || !from || reduce) return set(target);
    const far = Math.abs(from.top - target.top) + Math.abs(from.left - target.left) + Math.abs(from.width - target.width) > 24;
    if (!far) return set(target);
    const t0 = performance.now();
    const ease = (t) => 1 - Math.pow(1 - t, 4);
    const step = (now) => {
      const to = targetRef.current;
      const t = Math.min(1, (now - t0) / 420);
      const k = ease(t);
      const mix = (a, b) => a + (b - a) * k;
      if (!to) {
        anim.current = null;
        return set(null);
      }
      set({ top: mix(from.top, to.top), left: mix(from.left, to.left), width: mix(from.width, to.width), height: mix(from.height, to.height) });
      if (t < 1) anim.current.cancel = nextFrame(step);
      else anim.current = null;
    };
    anim.current = { cancel: nextFrame(step) };
  }, [target && target.top, target && target.left, target && target.width, target && target.height, reduce]); // eslint-disable-line
  useEffect(() => () => anim.current?.cancel(), []);
  return shown;
}

// Where the card goes: the preferred side if it fits, else the roomiest side,
// clamped on screen; arrow points back at the target.
function placeCard(rect, card, view, preferred, isPhone) {
  const width = Math.min(isPhone ? view.w - EDGE * 2 : 380, view.w - EDGE * 2);
  if (!rect) return { left: EDGE, top: EDGE, width, arrow: null };
  const h = card.h;
  const space = {
    bottom: view.h - (rect.top + rect.height) - GAP - EDGE,
    top: rect.top - GAP - EDGE,
    right: view.w - (rect.left + rect.width) - GAP - EDGE,
    left: rect.left - GAP - EDGE,
  };
  const fits = (side) => (side === "top" || side === "bottom" ? space[side] >= h : space[side] >= width && view.h - EDGE * 2 >= h);
  const order = [preferred, "bottom", "top", "right", "left"].filter(Boolean);
  let side = order.find(fits) || ["bottom", "top"].sort((a, b) => space[b] - space[a])[0];
  if (isPhone && (side === "left" || side === "right")) side = space.bottom >= space.top ? "bottom" : "top";

  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const clampX = (x) => Math.max(EDGE, Math.min(x, view.w - width - EDGE));
  const clampY = (y) => Math.max(EDGE, Math.min(y, view.h - h - EDGE));
  let left;
  let top;
  if (side === "bottom") {
    top = clampY(rect.top + rect.height + GAP);
    left = clampX(cx - width / 2);
  } else if (side === "top") {
    top = clampY(rect.top - GAP - h);
    left = clampX(cx - width / 2);
  } else if (side === "right") {
    left = clampX(rect.left + rect.width + GAP);
    top = clampY(cy - h / 2);
  } else {
    left = clampX(rect.left - GAP - width);
    top = clampY(cy - h / 2);
  }
  const arrow =
    side === "bottom" || side === "top"
      ? { side, offset: Math.max(22, Math.min(cx - left, width - 22)) }
      : { side, offset: Math.max(22, Math.min(cy - top, h - 22)) };
  return { left, top, width, arrow };
}

function Keys({ combo, caps }) {
  return (
    <span className="inline-flex items-center gap-1">
      {(caps || comboKeys(combo)).map((k, i) => (
        <kbd
          key={i}
          className="min-w-[1.6rem] rounded-md border border-border bg-muted px-1.5 py-0.5 text-center font-mono text-[11px] font-bold text-foreground shadow-[0_1px_0_0_hsl(var(--border))]"
        >
          {k}
        </kbd>
      ))}
    </span>
  );
}

function Progress({ index, total }) {
  // Welcome and finish aren't counted
  const n = total - 2;
  const at = Math.min(Math.max(index, 1), n);
  return (
    <div className="flex items-center gap-1" aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <span
          key={i}
          className={`h-1.5 rounded-full transition-all duration-300 ${i + 1 === at ? "w-5 bg-gradient-to-r from-orange-500 to-amber-500" : i + 1 < at ? "w-1.5 bg-orange-400/70" : "w-1.5 bg-muted-foreground/25"}`}
        />
      ))}
    </div>
  );
}

function Arrow({ arrow }) {
  if (!arrow) return null;
  const base = "absolute h-3.5 w-3.5 rotate-45 border-border bg-card";
  const style =
    arrow.side === "bottom"
      ? { top: -7, left: arrow.offset - 7, borderTopWidth: 1, borderLeftWidth: 1 }
      : arrow.side === "top"
      ? { bottom: -7, left: arrow.offset - 7, borderBottomWidth: 1, borderRightWidth: 1 }
      : arrow.side === "right"
      ? { left: -7, top: arrow.offset - 7, borderBottomWidth: 1, borderLeftWidth: 1 }
      : { right: -7, top: arrow.offset - 7, borderTopWidth: 1, borderRightWidth: 1 };
  return <span aria-hidden="true" className={base} style={style} />;
}

const primaryBtn =
  "inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-4 text-sm font-bold text-white shadow-lg shadow-orange-500/25 transition-all hover:from-orange-600 hover:to-amber-600 active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2 focus-visible:ring-offset-card";
const ghostBtn =
  "inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-border px-3 text-sm font-bold text-foreground transition-colors hover:bg-muted active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400";

function StepCard({ step, hint, index, total, onNext, onBack, onSkip, arrow, isPhone }) {
  const Icon = step.icon;
  return (
    <div className="relative rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-2xl shadow-black/30">
      <Arrow arrow={arrow} />
      <button type="button" onClick={onSkip} aria-label="Close tour" className="absolute right-3 top-3 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
        <X className="h-4 w-4" />
      </button>
      <div className="flex items-start gap-3 pr-6">
        {step.ai ? (
          <img src={AI_LOGO_SRC} alt="" className="h-11 w-11 shrink-0 rounded-2xl" />
        ) : (
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-md shadow-orange-500/30">
            {Icon ? <Icon className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
          </span>
        )}
        <div className="min-w-0">
          <p className="text-[11px] font-extrabold uppercase tracking-wider text-orange-600 dark:text-orange-400">
            Step {index} of {total - 2}
          </p>
          <h3 className="mt-0.5 text-[17px] font-black leading-snug tracking-tight">{step.title}</h3>
        </div>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{step.body}</p>

      {hint && (
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-700 dark:text-amber-300">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {hint}
        </p>
      )}

      {!isPhone && step.keys?.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 rounded-xl border border-dashed border-border/80 bg-muted/40 px-3 py-2.5">
          {step.keys.map((k) => (
            <span key={k.combo + k.label} className="inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              <Keys combo={k.combo} />
              {k.label}
            </span>
          ))}
        </div>
      )}
      {!isPhone && step.note && <p className="mt-2 text-xs font-semibold text-muted-foreground">{step.note}</p>}

      <div className="mt-5 flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-2">
          <Progress index={index} total={total} />
          <button type="button" onClick={onSkip} className="self-start text-xs font-bold text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
            Skip tour
          </button>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {index > 1 && (
            <button type="button" onClick={onBack} className={ghostBtn} aria-label="Previous step">
              <ArrowLeft className="h-4 w-4" />
              {!isPhone && "Back"}
            </button>
          )}
          <button type="button" onClick={onNext} className={primaryBtn} data-tour-primary>
            {index === total - 2 ? "Finish" : "Next"}
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

const HIGHLIGHTS = [
  { icon: ShoppingCart, label: "Stock & purchases" },
  { icon: Receipt, label: "Fast billing" },
  { icon: CalendarX, label: "Expiry & returns" },
  { icon: Bot, label: "DavaDesk AI" },
];

function WelcomeCard({ firstName, total, onStart, onSkip, isPhone }) {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-border bg-card text-card-foreground shadow-2xl shadow-black/40">
      <div className="relative bg-gradient-to-br from-orange-500 via-orange-500 to-amber-500 px-6 pb-7 pt-7 text-white">
        <span aria-hidden="true" className="absolute -right-10 -top-12 h-40 w-40 rounded-full bg-white/15 blur-2xl" />
        <span aria-hidden="true" className="absolute -bottom-16 -left-10 h-40 w-40 rounded-full bg-amber-300/30 blur-2xl" />
        <div className="relative flex items-center gap-3">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-lg">
            <img src="/assets/svgs/logoBrand/logoOnlyWithoutBackground.svg" alt="" className="h-10 w-10 object-contain" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-extrabold uppercase tracking-wider text-white/80">Welcome to DavaDesk</p>
            <h2 className="text-2xl font-black leading-tight tracking-tight">Hi{firstName ? ` ${firstName}` : ""}, let's get you set up</h2>
          </div>
        </div>
      </div>
      <div className="px-6 pb-6 pt-5">
        <p className="text-sm leading-relaxed text-muted-foreground">
          A quick {total}-step walk through the app: where everything is, how to switch sections, and how to bill your first customer. It takes about two minutes.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {HIGHLIGHTS.map(({ icon: I, label }) => (
            <span key={label} className="flex items-center gap-2 rounded-xl border border-border/70 bg-muted/40 px-3 py-2 text-xs font-bold">
              <I className="h-4 w-4 shrink-0 text-orange-500" />
              {label}
            </span>
          ))}
        </div>
        {!isPhone && (
          <p className="mt-4 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            Use <Keys caps={["←"]} /> <Keys caps={["→"]} /> to move, <Keys caps={["Esc"]} /> to close.
          </p>
        )}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <button type="button" onClick={onSkip} className="h-10 rounded-xl px-3 text-sm font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            Skip for now
          </button>
          <button type="button" onClick={onStart} className={primaryBtn} data-tour-primary>
            Start the tour
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-3 text-center text-[11px] font-semibold text-muted-foreground sm:text-left">You can replay it anytime from your profile menu.</p>
      </div>
    </div>
  );
}

const NEXT_STEPS = [
  { icon: ShoppingCart, title: "Add your first purchase", text: "Get your stock in, or scan a supplier bill", go: "/purchases" },
  { icon: Receipt, title: "Create a bill", text: "Bill a customer in a few seconds", go: "/billing" },
  { icon: Settings, title: "Finish pharmacy details", text: "GSTIN, licence, logo and UPI ID", go: "/settings" },
  { icon: Package, title: "Look at inventory", text: "Stock, batches and expiry in one place", go: "/inventory" },
];

function FinishCard({ onFinish, onBack, isPhone }) {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-border bg-card p-6 text-card-foreground shadow-2xl shadow-black/40">
      <span aria-hidden="true" className="absolute -right-16 -top-16 h-44 w-44 rounded-full bg-gradient-to-br from-orange-500/25 to-amber-400/10 blur-2xl" />
      <div className="relative flex items-center gap-3">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/30">
          <Check className="h-7 w-7" strokeWidth={3} />
        </span>
        <div>
          <h2 className="text-2xl font-black leading-tight tracking-tight">You're all set!</h2>
          <p className="text-sm font-semibold text-muted-foreground">Here's a good place to begin:</p>
        </div>
      </div>
      <div className="relative mt-5 grid gap-2">
        {NEXT_STEPS.slice(0, isPhone ? 3 : 4).map(({ icon: I, title, text, go }) => (
          <button
            key={go}
            type="button"
            onClick={() => onFinish(go)}
            className="group flex items-center gap-3 rounded-2xl border border-border/80 bg-muted/30 p-3 text-left transition-all hover:-translate-y-0.5 hover:border-orange-400/60 hover:bg-orange-500/5 hover:shadow-md active:scale-[0.99]"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-500/10 text-orange-600 dark:text-orange-400">
              <I className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-black">{title}</span>
              <span className="block truncate text-xs font-semibold text-muted-foreground">{text}</span>
            </span>
            <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-orange-500" />
          </button>
        ))}
      </div>
      <div className="relative mt-5 flex items-center justify-between gap-2">
        <button type="button" onClick={onBack} className={ghostBtn}>
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <button type="button" onClick={() => onFinish()} className={primaryBtn} data-tour-primary>
          Go to dashboard
          <Check className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
