import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { CheckCircle2, Download, History, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "./ui/button";

// Desktop only: the version this computer runs, its update state and the full
// version history published with every release (dev and production channels).
const shell = () => (typeof window !== "undefined" ? window.davadeskDesktop : null);
const SEEN_KEY = "dd_desktop_seen_version";
const READY_KEY = "dd_desktop_ready_notified";

const fmt = (iso) => {
  try {
    return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
};

export function useUpdateState(every = 5000) {
  const [state, setState] = useState(null);
  useEffect(() => {
    let alive = true;
    const read = () =>
      shell()
        ?.updateState?.()
        .then((s) => alive && setState(s))
        .catch(() => {});
    read();
    const t = setInterval(read, every);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [every]);
  return state;
}

export function useVersionHistory() {
  const [items, setItems] = useState(null);
  useEffect(() => {
    let alive = true;
    const p = shell()?.versionHistory?.();
    if (!p) {
      setItems([]);
      return undefined;
    }
    p.then((r) => alive && setItems(Array.isArray(r) ? r : [])).catch(() => alive && setItems([]));
    return () => {
      alive = false;
    };
  }, []);
  return items;
}

// Mounted once in the layout: says "updated to X" after an update, and "X is
// ready" when a new version has downloaded, each once.
export function DesktopUpdateNotices() {
  const state = useUpdateState(15000);
  const navigate = useNavigate();
  const shown = useRef(false);

  useEffect(() => {
    if (!state?.current || shown.current) return;
    shown.current = true;
    let seen = null;
    try {
      seen = localStorage.getItem(SEEN_KEY);
      localStorage.setItem(SEEN_KEY, state.current);
    } catch {}
    const from = state.previous || (seen && seen !== state.current ? seen : null);
    if (from) {
      toast.success(`DavaDesk is now version ${state.current}`, {
        description: `Updated from ${from}. Your data and settings are as you left them.`,
        duration: 10000,
        action: { label: "What's new", onClick: () => navigate("/sync#versions") },
      });
    }
  }, [state, navigate]);

  useEffect(() => {
    if (state?.status !== "ready" || !state.latest) return;
    let told = null;
    try {
      told = localStorage.getItem(READY_KEY);
    } catch {}
    if (told === state.latest) return;
    try {
      localStorage.setItem(READY_KEY, state.latest);
    } catch {}
    toast.info(`Version ${state.latest} is ready`, {
      description: "It installs when you close DavaDesk, or restart now.",
      duration: 12000,
      action: { label: "Restart now", onClick: () => shell()?.applyUpdate?.() },
    });
  }, [state]);

  return null;
}

// The Sync Center card
export function VersionCard() {
  const state = useUpdateState();
  const items = useVersionHistory();
  const [open, setOpen] = useState(false);
  if (!state) return null;
  const current = state.current;
  const list = items || [];
  const shownList = open ? list : list.slice(0, 5);
  const busy = state.status === "downloading";

  let status;
  if (state.status === "ready") status = { icon: Download, tone: "text-orange-600 dark:text-orange-400", text: `Version ${state.latest} is ready to install` };
  else if (busy) status = { icon: Loader2, tone: "text-muted-foreground", text: `Downloading version ${state.latest}…`, spin: true };
  else if (state.status === "available") status = { icon: Download, tone: "text-orange-600 dark:text-orange-400", text: `Version ${state.latest} is available` };
  else status = { icon: CheckCircle2, tone: "text-emerald-600 dark:text-emerald-400", text: "Up to date" };
  const StatusIcon = status.icon;

  return (
    <section id="versions" className="rounded-2xl border border-border/60 bg-card p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="eyebrow">Version</span>
          <p className="mt-1 text-3xl font-semibold tracking-tight num">{current}</p>
          <p className={`mt-1 flex items-center gap-1.5 text-sm font-medium ${status.tone}`}>
            <StatusIcon className={`h-4 w-4 ${status.spin ? "animate-spin" : ""}`} aria-hidden="true" />
            {status.text}
          </p>
        </div>
        {state.status === "ready" || state.status === "available" ? (
          <Button onClick={() => shell()?.applyUpdate?.()}>{state.status === "ready" ? "Restart to update" : "Download update"}</Button>
        ) : (
          <Button variant="outline" disabled={busy} onClick={() => shell()?.applyUpdate?.()}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Check for updates
          </Button>
        )}
      </div>

      <div>
        <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
          <History className="h-4 w-4 text-muted-foreground" aria-hidden="true" /> Version history
        </p>
        {items === null ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading…</p>
        ) : list.length === 0 ? (
          <p className="text-sm text-muted-foreground">The history appears here once you're online.</p>
        ) : (
          <ol className="relative space-y-0 border-l border-border pl-5">
            {shownList.map((r) => {
              const isCurrent = r.version === current;
              const isNewer = !isCurrent && state.latest === r.version && state.status !== "none";
              return (
                <li key={r.version} data-panel className="relative pb-4 last:pb-0">
                  <span className={`absolute -left-[1.6rem] top-1 h-3 w-3 rounded-full border-2 border-card ${isCurrent ? "bg-brand ring-4 ring-brand/20" : isNewer ? "bg-foreground" : "bg-muted-foreground/40"}`} aria-hidden="true" />
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="num text-sm font-semibold">{r.version}</span>
                    {isCurrent && <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-semibold text-brand-soft">This computer</span>}
                    {isNewer && <span className="inline-flex items-center gap-1 rounded-full bg-foreground px-2 py-0.5 text-[10px] font-semibold text-background"><Sparkles className="h-3 w-3" aria-hidden="true" /> New</span>}
                    <span className="text-xs text-muted-foreground">{fmt(r.published_at)}</span>
                  </div>
                  {r.notes?.length > 0 && (
                    <ul className="mt-1 space-y-0.5 text-[13px] text-muted-foreground">
                      {r.notes.slice(0, 8).map((n, i) => (
                        <li key={i} className="before:mr-1.5 before:content-['·']">{n}</li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ol>
        )}
        {list.length > 5 && (
          <button type="button" onClick={() => setOpen(!open)} className="mt-2 text-xs font-semibold text-brand-soft hover:underline">
            {open ? "Show fewer" : `Show all ${list.length} versions`}
          </button>
        )}
      </div>
    </section>
  );
}
