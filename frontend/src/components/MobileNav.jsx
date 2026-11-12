import { useEffect, useState } from "react";
import { motion, MotionConfig } from "framer-motion";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Receipt,
  ShoppingCart,
  ScanLine,
  LayoutGrid,
  Camera,
  FileText,
  LogOut,
  Activity,
  ChevronRight,
  Sparkles,
  Compass,
  Sun,
  Moon,
  Clapperboard,
} from "lucide-react";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "./ui/sheet";
import { AI_LOGO_SRC } from "./scan/ScanUI";
import { useTour } from "./tour/ProductTour";
import { useGuide } from "./guide/GuideProvider";

// Phone-only navigation (below md): a bottom tab bar like a native app, with
// the rest of the app in a "More" sheet. Desktop keeps the top navigation.
const TABS = [
  { path: "/dashboard", label: "Home", icon: LayoutDashboard },
  { path: "/billing", label: "Billing", icon: Receipt },
  { scan: true, label: "Scan", icon: ScanLine },
  { path: "/purchases", label: "Purchases", icon: ShoppingCart },
  { more: true, label: "More", icon: LayoutGrid },
];
const TAB_PATHS = TABS.filter((t) => t.path).map((t) => t.path);

// While typing, the on-screen keyboard leaves little room: hide the tab bar.
// Only while a field has focus AND the screen has actually shrunk, so the bar
// always comes back once the keyboard goes, even if the field keeps focus or
// is removed from the page without a blur.
function useKeyboardOpen() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const isField = (el) =>
      el &&
      (el.tagName === "TEXTAREA" ||
        el.isContentEditable ||
        (el.tagName === "INPUT" && !["checkbox", "radio", "button", "submit", "file", "range", "color"].includes(el.type)));
    const vv = window.visualViewport;
    let full = window.innerHeight;
    let lastWidth = window.innerWidth;
    const check = () => {
      const h = vv ? vv.height : window.innerHeight;
      // Rotation: start over with the new full height
      if (window.innerWidth !== lastWidth) {
        lastWidth = window.innerWidth;
        full = h;
      }
      full = Math.max(full, h);
      setOpen(isField(document.activeElement) && h < full * 0.8);
    };
    // focus can move straight from one field to the next; check after it settles
    const later = () => setTimeout(check, 80);
    window.addEventListener("focusin", later);
    window.addEventListener("focusout", later);
    vv?.addEventListener("resize", check);
    window.addEventListener("resize", check);
    return () => {
      window.removeEventListener("focusin", later);
      window.removeEventListener("focusout", later);
      vv?.removeEventListener("resize", check);
      window.removeEventListener("resize", check);
    };
  }, []);
  return open;
}

export function MobileBottomNav({ items, isActive, onLogout, onOpenActivity, pharmacy, planLabel, isDark, onToggleTheme }) {
  const { start: startTour } = useTour();
  const { openHub: openGuides } = useGuide();
  const navigate = useNavigate();
  const location = useLocation();
  const [sheet, setSheet] = useState(null); // "scan" | "more" | null
  const keyboardOpen = useKeyboardOpen();

  useEffect(() => setSheet(null), [location.pathname]);

  const moreItems = items.filter((i) => !TAB_PATHS.includes(i.path));
  const moreActive = moreItems.some((i) => isActive(i.path));

  const go = (path) => {
    setSheet(null);
    navigate(path);
  };

  return (
    <>
      <nav
        className={`mobile-tabbar md:hidden shrink-0 border-t border-border/70 bg-background/95 backdrop-blur-xl pb-[env(safe-area-inset-bottom)] ${keyboardOpen ? "hidden" : ""}`}
        data-testid="mobile-bottom-nav"
        data-tour="mobile-nav"
      >
        <MotionConfig reducedMotion="user">
          <div className="grid grid-cols-5 h-[3.75rem]">
            {TABS.filter((t) => !t.path || t.path === "/dashboard" || items.some((i) => i.path === t.path)).map((tab) => {
              const cls = "relative flex flex-col items-center justify-center gap-1 touch-manipulation";
              if (tab.scan) {
                // Sits inside the bar like the other tabs, so it never covers the page
                return (
                  <button key="scan" type="button" onClick={() => setSheet("scan")} aria-label="Scan" data-tour="mtab-scan" className={`${cls} group`}>
                    <span className="flex h-8 w-12 items-center justify-center rounded-[0.9rem] bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-md shadow-orange-500/30 transition-transform duration-150 group-active:scale-90">
                      <ScanLine className="h-[1.15rem] w-[1.15rem]" />
                    </span>
                    <span className={`text-[10.5px] font-bold leading-none ${sheet === "scan" ? "text-orange-500" : "text-muted-foreground"}`}>Scan</span>
                  </button>
                );
              }
              const active = tab.more ? moreActive || sheet === "more" : isActive(tab.path);
              const Icon = tab.icon;
              const inner = (
                <>
                  <span className="relative flex h-8 w-12 items-center justify-center transition-transform duration-150 group-active:scale-90">
                    {active && (
                      <motion.span
                        layoutId="mobile-tab-pill"
                        className="absolute inset-0 rounded-full bg-orange-500/15"
                        transition={{ type: "spring", stiffness: 520, damping: 38 }}
                      />
                    )}
                    <Icon className={`relative h-5 w-5 transition-colors duration-200 ${active ? "text-orange-500" : "text-muted-foreground"}`} strokeWidth={active ? 2.4 : 2} />
                  </span>
                  <span className={`text-[10.5px] font-bold leading-none transition-colors duration-200 ${active ? "text-orange-500" : "text-muted-foreground"}`}>{tab.label}</span>
                </>
              );
              return tab.more ? (
                <button key="more" type="button" onClick={() => setSheet("more")} className={`${cls} group`} data-tour="mtab-more" aria-current={active ? "page" : undefined}>
                  {inner}
                </button>
              ) : (
                <NavLink key={tab.path} to={tab.path} className={`${cls} group`} data-testid={`tab-${tab.path.slice(1)}`} data-tour={`mtab-${tab.path}`}>
                  {inner}
                </NavLink>
              );
            })}
          </div>
        </MotionConfig>
      </nav>

      {/* Scan chooser */}
      <Sheet open={sheet === "scan"} onOpenChange={(o) => !o && setSheet(null)}>
        <SheetContent side="bottom" className="md:hidden rounded-t-3xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
          <SheetTitle className="text-base font-black">Scan with AI</SheetTitle>
          <SheetDescription className="text-xs">Point your camera; DavaDesk AI reads it for you.</SheetDescription>
          <div className="mt-4 grid gap-3">
            <SheetAction
              icon={Camera}
              tone="from-orange-500 to-amber-500"
              title="Scan medicine for bill"
              text="Photo of a strip or bottle adds it to a new bill"
              onClick={() => go("/scan-bill")}
            />
            <SheetAction
              icon={FileText}
              tone="from-violet-500 to-indigo-500"
              title="Scan purchase invoice"
              text="Photo of a supplier bill creates the purchase"
              onClick={() => go("/scan")}
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* Everything else */}
      <Sheet open={sheet === "more"} onOpenChange={(o) => !o && setSheet(null)}>
        <SheetContent side="bottom" className="md:hidden max-h-[88dvh] overflow-y-auto rounded-t-3xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
          <div className="flex items-center gap-3 pr-8">
            {pharmacy?.logo_url ? (
              <img src={pharmacy.logo_url} alt="" className="h-11 w-11 rounded-xl object-cover border border-border/60" />
            ) : (
              <img src="/assets/svgs/logoBrand/logoOnlyWithoutBackground.svg" alt="" className="h-11 w-11 object-contain" />
            )}
            <div className="min-w-0">
              <SheetTitle className="truncate text-base font-black">{pharmacy?.name || "DavaDesk"}</SheetTitle>
              <SheetDescription className="flex items-center gap-1 text-[11px] font-extrabold text-orange-600 dark:text-orange-400">
                <Sparkles className="h-3 w-3" />
                {planLabel}
              </SheetDescription>
            </div>
          </div>

          <button
            type="button"
            onClick={() => go("/assistant")}
            className="mt-4 flex w-full items-center gap-3 rounded-2xl border border-violet-500/25 bg-gradient-to-r from-orange-500/10 via-pink-500/10 to-violet-500/10 p-3 text-left active:scale-[0.99]"
          >
            <img src={AI_LOGO_SRC} alt="" className="h-10 w-10 rounded-full" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-black">DavaDesk AI</span>
              <span className="block truncate text-xs text-muted-foreground">Ask, create bills and purchases by voice</span>
            </span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>

          <div className="mt-4 grid grid-cols-4 gap-2">
            {moreItems.map((item) => {
              const active = isActive(item.path);
              const Icon = item.icon;
              return (
                <button
                  key={item.path}
                  type="button"
                  onClick={() => go(item.path)}
                  className={`flex flex-col items-center gap-1.5 rounded-2xl border p-2.5 active:scale-95 transition-transform ${
                    active ? "border-orange-500/40 bg-orange-500/10" : "border-border/60 bg-muted/30"
                  }`}
                >
                  <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${active ? "bg-gradient-to-br from-orange-500 to-amber-500 text-white" : "bg-background text-foreground"}`}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="w-full text-center text-[10.5px] font-bold leading-tight tracking-tight">{item.label}</span>
                </button>
              );
            })}
          </div>

          {onToggleTheme && (
            <button
              type="button"
              onClick={onToggleTheme}
              role="switch"
              aria-checked={!!isDark}
              data-testid="mobile-theme-toggle"
              className="mt-4 flex h-12 w-full items-center gap-3 rounded-2xl border border-border/60 bg-muted/30 px-3.5 text-left text-sm font-bold active:scale-[0.99] transition-transform"
            >
              {isDark ? <Moon className="h-4 w-4 text-orange-500" /> : <Sun className="h-4 w-4 text-amber-500" />}
              <span className="flex-1">Dark mode</span>
              <span className={`relative h-6 w-10 rounded-full transition-colors duration-200 ${isDark ? "bg-orange-500" : "bg-muted-foreground/30"}`}>
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left] duration-200 ${isDark ? "left-[1.125rem]" : "left-0.5"}`} />
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setSheet(null);
              setTimeout(startTour, 250); // after the sheet has closed
            }}
            className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-orange-500/30 bg-orange-500/5 text-sm font-bold text-orange-600 active:scale-[0.98] dark:text-orange-400"
          >
            <Compass className="h-4 w-4" /> Take the tour
          </button>
          <button
            type="button"
            onClick={() => {
              setSheet(null);
              setTimeout(openGuides, 250);
            }}
            data-testid="mobile-guided-tours"
            className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-violet-500/30 bg-violet-500/5 text-sm font-bold text-violet-600 active:scale-[0.98] dark:text-violet-400"
          >
            <Clapperboard className="h-4 w-4" /> Guided tours
          </button>

          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setSheet(null);
                onOpenActivity();
              }}
              className="flex h-11 items-center justify-center gap-2 rounded-xl border border-border/60 bg-muted/30 text-sm font-bold active:scale-[0.98]"
            >
              <Activity className="h-4 w-4" /> Recent activity
            </button>
            <button
              type="button"
              onClick={() => {
                setSheet(null);
                onLogout();
              }}
              className="flex h-11 items-center justify-center gap-2 rounded-xl border border-destructive/25 bg-destructive/5 text-sm font-bold text-destructive active:scale-[0.98]"
            >
              <LogOut className="h-4 w-4" /> Logout
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function SheetAction({ icon: Icon, tone, title, text, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 rounded-2xl border border-border/60 bg-muted/30 p-3.5 text-left active:scale-[0.99] transition-transform"
    >
      <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${tone} text-white shadow-md`}>
        <Icon className="h-6 w-6" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-black">{title}</span>
        <span className="block text-xs text-muted-foreground">{text}</span>
      </span>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </button>
  );
}
