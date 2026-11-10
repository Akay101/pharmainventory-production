import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Clapperboard, Lock, Play, Sparkles } from "lucide-react";
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

  const env = useMemo(() => {
    if (!tour) return null;
    return {
      navigate: (p) => navRef.current(p),
      // Fresh demo pharmacy, page remounted on the tour's route
      resetStage: async () => {
        exitSandbox();
        enterSandbox({ clearKeys: tour.clearKeys || [] });
        document.activeElement?.blur?.();
        if (locRef.current.pathname !== tour.route) navRef.current(tour.route);
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
    setHubOpen(false);
    setActive(id);
  }, []);

  const close = useCallback(() => {
    stopSpeaking();
    const wasDemo = sandboxActive();
    exitSandbox();
    setActive(null);
    if (wasDemo) setEpoch((e) => e + 1); // the page reloads its real data
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

// "Watch tour" button for a page header
export function GuideButton({ tour, className = "" }) {
  const { start, has, lang } = useGuide();
  if (!has(tour)) return null;
  return (
    <button
      type="button"
      onClick={() => start(tour)}
      data-testid={`guide-start-${tour}`}
      title={lang === "hi" ? "इस पेज का गाइडेड टूर देखें" : "Watch the guided tour of this page"}
      className={`group relative inline-flex h-8 items-center gap-1.5 overflow-hidden rounded-xl border border-violet-500/30 bg-gradient-to-r from-violet-500/10 via-fuchsia-500/10 to-orange-500/10 px-3 text-xs font-bold text-violet-700 transition hover:border-violet-500/60 dark:text-violet-300 ${className}`}
    >
      <Sparkles className="h-3.5 w-3.5 transition group-hover:rotate-12" />
      {lang === "hi" ? "टूर देखें" : "Watch tour"}
    </button>
  );
}
