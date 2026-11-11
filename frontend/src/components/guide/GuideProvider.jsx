import { createContext, Fragment, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Clapperboard, Lock, Play, Sparkles, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useTour } from "../tour/ProductTour";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import Director from "./engine/Director";
import { flatten } from "./engine/runner";
import { sleep, waitFor } from "./engine/dom";
import { enterSandbox, exitSandbox, sandboxActive } from "./sandbox/sandbox";
import { stopSpeaking } from "./engine/narration";
import { TOURS, TOUR_LIST } from "./tours";

// Guided tours: cinematic, narrated walkthroughs that run on the real pages
// with demo data. useGuide().start("billing") plays one; useGuide().openHub()
// shows them all. Wrap the app's page outlet in <GuideOutlet /> so a tour can
// remount the page in and out of demo mode.

const GuideContext = createContext({ start: () => {}, openHub: () => {}, active: null, epoch: 0, has: () => false });
export const useGuide = () => useContext(GuideContext);

const LANG_KEY = "dd_guide_lang";
// First visits: the tour button is pointed out up to HINT_MAX times, until
// the user starts the tour or says "Later"
const HINT_KEY = (id) => `dd_guide_hint_${id}`;
const HINT_MAX = 3;
const hintCount = (id) => {
  try {
    const v = localStorage.getItem(HINT_KEY(id));
    return v === "done" ? Infinity : parseInt(v || "0", 10) || 0;
  } catch {
    return Infinity;
  }
};
const setHint = (id, v) => {
  try {
    localStorage.setItem(HINT_KEY(id), String(v));
  } catch {}
};
const readLang = () => {
  try {
    return localStorage.getItem(LANG_KEY) || "hi";
  } catch {
    return "hi";
  }
};

export function GuideOutlet() {
  const { epoch } = useGuide();
  return <Outlet key={epoch} />;
}

// Same for a page rendered outside the main layout (e.g. the assistant)
export function GuideStage({ children }) {
  const { epoch } = useGuide();
  return <Fragment key={epoch}>{children}</Fragment>;
}

// Minutes of narration in a tour, roughly
const minutes = (tour, lang = "en") => {
  const words = flatten(tour).reduce((s, b) => s + String(b.say?.[lang] || "").split(/\s+/).length, 0);
  return Math.max(1, Math.round(words / 2.5 / 60 + flatten(tour).length * 0.04));
};

function GuideHub({ open, onOpenChange, onPick, lang }) {
  const hi = lang === "hi";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl rounded-2xl p-0 max-md:max-h-[88vh] max-md:overflow-y-auto">
        <DialogHeader className="border-b border-border/60 p-5 pb-4">
          <DialogTitle className="flex items-center gap-2 text-lg font-black">
            <Clapperboard className="h-5 w-5 text-orange-500" /> {hi ? "गाइडेड टूर" : "Guided tours"}
          </DialogTitle>
          <p className="text-xs font-medium text-muted-foreground">
            {hi
              ? "हर मॉड्यूल का हर बटन और हर स्टेप, आवाज़ के साथ, हिंदी या English में। टूर डेमो डेटा पर चलते हैं, आपका असली डेटा नहीं बदलता।"
              : "Every button and every step of each module, narrated in Hindi or English. Tours run on demo data, so your real data never changes."}
          </p>
        </DialogHeader>
        <div className="grid gap-2 p-4 sm:grid-cols-2">
          {TOUR_LIST.map((t) => {
            const ready = !!TOURS[t.id];
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                disabled={!ready}
                onClick={() => onPick(t.id)}
                data-testid={`guide-hub-${t.id}`}
                className={`group flex items-center gap-3 rounded-xl border p-3 text-left transition ${ready ? "border-border hover:border-orange-500/50 hover:bg-orange-500/5" : "cursor-not-allowed border-border/50 opacity-55"}`}
              >
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${ready ? "bg-gradient-to-br from-orange-500 to-amber-400 text-white" : "bg-muted text-muted-foreground"}`}>
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-black text-foreground">{hi ? t.title.hi : t.title.en}</span>
                  <span className="block truncate text-[11px] font-medium text-muted-foreground">
                    {ready ? `${minutes(TOURS[t.id], lang)} min · ${TOURS[t.id].chapters.length} ${hi ? "अध्याय" : "chapters"}` : hi ? "जल्द आ रहा है" : "Coming soon"}
                  </span>
                </span>
                {ready ? <Play className="h-4 w-4 text-orange-500 transition group-hover:scale-125" /> : <Lock className="h-3.5 w-3.5 text-muted-foreground" />}
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function GuideProvider({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [active, setActive] = useState(null); // tour id
  const [epoch, setEpoch] = useState(0);
  const [hubOpen, setHubOpen] = useState(false);
  const [lang, setLang] = useState(readLang);
  const navRef = useRef(navigate);
  navRef.current = navigate;
  const locRef = useRef(location);
  locRef.current = location;

  const tour = active ? TOURS[active] : null;
  const activeRef = useRef(null);
  activeRef.current = active;

  const env = useMemo(() => {
    if (!tour) return null;
    return {
      navigate: (p) => navRef.current(p),
      // Fresh demo pharmacy, page remounted on the tour's route
      resetStage: async () => {
        exitSandbox();
        enterSandbox({ clearKeys: tour.clearKeys || [] });
        document.activeElement?.blur?.();
        if (locRef.current.pathname !== tour.route || locRef.current.search) navRef.current(tour.route);
        setEpoch((e) => e + 1);
        await sleep(120);
        window.scrollTo({ top: 0 });
        await waitFor(tour.ready, { timeout: 15000 });
        await sleep(350);
      },
    };
  }, [tour]);

  const start = useCallback((id) => {
    if (!TOURS[id]) return;
    setHint(id, "done");
    setHubOpen(false);
    setActive(id);
  }, []);

  const close = useCallback(() => {
    stopSpeaking();
    const wasDemo = sandboxActive();
    const route = TOURS[activeRef.current]?.route;
    exitSandbox();
    setActive(null);
    if (wasDemo) {
      // Demo ids in the address (e.g. ?c=demo-chat) mean nothing to the real page
      if (route && locRef.current.pathname === route && locRef.current.search) navRef.current(route, { replace: true });
      setEpoch((e) => e + 1); // the page reloads its real data
    }
  }, []);

  const pickLang = useCallback((l) => {
    setLang(l);
    try {
      localStorage.setItem(LANG_KEY, l);
    } catch {}
  }, []);

  const value = useMemo(
    () => ({ start, openHub: () => setHubOpen(true), active, epoch, has: (id) => !!TOURS[id], lang }),
    [start, active, epoch, lang]
  );

  const nextId = tour?.next && TOURS[tour.next] ? tour.next : null;

  return (
    <GuideContext.Provider value={value}>
      {children}
      <GuideHub open={hubOpen} onOpenChange={setHubOpen} onPick={start} lang={lang} />
      {tour && env && (
        <Director
          key={active}
          tour={tour}
          env={env}
          initialLang={lang}
          onLang={pickLang}
          onClose={close}
          nextTour={nextId ? { title: TOURS[nextId].title, start: () => { close(); setTimeout(() => start(nextId), 50); } } : null}
        />
      )}
    </GuideContext.Provider>
  );
}

// "Watch tour" button for a page header. The first few times a user opens
// the page it glows and says what it is.
export function GuideButton({ tour, className = "" }) {
  const { start, has, lang, active } = useGuide();
  const { active: welcomeTour } = useTour();
  const [hint, setHintOpen] = useState(false);
  const hi = lang === "hi";

  useEffect(() => {
    if (!has(tour) || active || welcomeTour || hintCount(tour) >= HINT_MAX) return undefined;
    const t = setTimeout(() => {
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      setHint(tour, hintCount(tour) + 1);
      setHintOpen(true);
    }, 1500);
    return () => clearTimeout(t);
  }, [tour, active, welcomeTour]); // eslint-disable-line

  useEffect(() => {
    if (active || welcomeTour) setHintOpen(false);
  }, [active, welcomeTour]);

  if (!has(tour)) return null;
  const later = () => {
    setHint(tour, "done");
    setHintOpen(false);
  };
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={() => start(tour)}
        data-testid={`guide-start-${tour}`}
        title={hi ? "इस पेज का गाइडेड टूर देखें" : "Watch the guided tour of this page"}
        className={`group relative inline-flex h-8 items-center gap-1.5 overflow-hidden rounded-xl border border-violet-500/30 bg-gradient-to-r from-violet-500/10 via-fuchsia-500/10 to-orange-500/10 px-3 text-xs font-bold text-violet-700 transition hover:border-violet-500/60 dark:text-violet-300 ${hint ? "ring-2 ring-violet-500/60 ring-offset-2 ring-offset-background" : ""} ${className}`}
      >
        <Sparkles className="h-3.5 w-3.5 transition group-hover:rotate-12" />
        {hi ? "टूर देखें" : "Watch tour"}
      </button>
      <AnimatePresence>
        {hint && (
          <>
            <motion.span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 rounded-xl border-2 border-violet-500"
              initial={{ opacity: 0.8, scale: 1 }}
              animate={{ opacity: [0.8, 0], scale: [1, 1.35] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
            />
            <motion.div
              role="status"
              data-testid={`guide-hint-${tour}`}
              className="absolute right-0 top-full z-[70] mt-3 w-[270px] max-w-[calc(100vw-24px)] rounded-2xl border border-violet-500/30 bg-card p-3.5 text-left shadow-2xl shadow-violet-500/20 max-md:left-0 max-md:right-auto"
              initial={{ opacity: 0, y: -6, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.97 }}
              transition={{ type: "spring", stiffness: 320, damping: 24 }}
            >
              <span className="absolute -top-1.5 right-6 h-3 w-3 rotate-45 border-l border-t border-violet-500/30 bg-card max-md:left-6 max-md:right-auto" />
              <button type="button" onClick={later} className="absolute right-2 top-2 rounded-full p-1 text-muted-foreground hover:bg-muted" aria-label="Close">
                <X className="h-3.5 w-3.5" />
              </button>
              <p className="pr-5 text-sm font-black text-foreground">{hi ? "नया: इस पेज का गाइडेड टूर" : "New: a guided tour of this page"}</p>
              <p className="mt-1 text-xs font-medium leading-relaxed text-muted-foreground">
                {hi
                  ? "AI असिस्टेंट आवाज़ के साथ हर बटन और हर स्टेप दिखाएगा, हिंदी या English में। डेमो डेटा पर चलता है।"
                  : "The AI assistant shows you every button and step, with voice, in Hindi or English. It runs on demo data."}
              </p>
              <div className="mt-3 flex gap-2">
                <button type="button" onClick={() => start(tour)} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 px-3 text-xs font-bold text-white">
                  <Play className="h-3.5 w-3.5" /> {hi ? "टूर शुरू करें" : "Start the tour"}
                </button>
                <button type="button" onClick={later} className="h-8 rounded-lg px-3 text-xs font-bold text-muted-foreground hover:bg-muted">
                  {hi ? "बाद में" : "Later"}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </span>
  );
}
