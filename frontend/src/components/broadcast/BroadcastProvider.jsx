import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { API } from "../../App";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../ui/dialog";
import { BroadcastBanner, BroadcastDetail } from "./BroadcastRender";
import { useTour } from "../tour/ProductTour";

// Broadcasts from the admin panel: fetched (never pushed) on load, every few
// minutes and when the tab comes back, so a user who was signed out when one
// went out still gets it on their next visit. The server leaves out expired
// and cleared ones.

const REFRESH_MS = 5 * 60 * 1000;
const FOCUS_REFRESH_MS = 60 * 1000;
const ROTATE_MS = 9000;
export const assetUrl = (id) => `${API}/broadcasts/assets/${id}`;

const Ctx = createContext(null);
export const useBroadcasts = () => useContext(Ctx);

const SPOTLIGHT_KEY = "dd_spotlight_shown";
const readShown = () => {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(SPOTLIGHT_KEY) || "[]"));
  } catch {
    return new Set();
  }
};
const saveShown = (set) => {
  try {
    sessionStorage.setItem(SPOTLIGHT_KEY, JSON.stringify([...set]));
  } catch {
    // private mode: the spotlight may show again next visit, which is fine
  }
};

// The app is dark unless <html> has the "light" class (see DashboardLayout)
const isDarkNow = () => !document.documentElement.classList.contains("light");
function useIsDark() {
  const [dark, setDark] = useState(isDarkNow);
  useEffect(() => {
    const obs = new MutationObserver(() => setDark(isDarkNow()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return dark;
}

export function BroadcastProvider({ children }) {
  const navigate = useNavigate();
  const dark = useIsDark();
  const tourActive = useTour().active;
  const [items, setItems] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [openId, setOpenId] = useState(null);
  const lastFetch = useRef(0);
  const sent = useRef(new Set()); // "id:type" already sent this session

  const refresh = useCallback(async () => {
    lastFetch.current = Date.now();
    try {
      const res = await axios.get(`${API}/broadcasts`);
      setItems(res.data.items || []);
    } catch {
      // Banners are extras; a failed fetch just shows none
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, REFRESH_MS);
    const onVisible = () => document.visibilityState === "visible" && Date.now() - lastFetch.current > FOCUS_REFRESH_MS && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  const patch = (id, state) => setItems((list) => list.map((b) => (b.id === id ? { ...b, state: { ...b.state, ...state } } : b)));

  // Record an event once per session (seen/open), or every time (click)
  const track = useCallback((id, type) => {
    const key = `${id}:${type}`;
    if (type !== "click" && sent.current.has(key)) return Promise.resolve();
    sent.current.add(key);
    return axios.post(`${API}/broadcasts/${id}/event`, { type }).catch(() => sent.current.delete(key));
  }, []);

  const markSeen = useCallback(
    (id) => {
      patch(id, { seen: true });
      track(id, "seen");
    },
    [track]
  );

  const open = useCallback(
    (id) => {
      setOpenId(id);
      patch(id, { seen: true, opened: true });
      track(id, "open");
    },
    [track]
  );

  const dismissBanner = useCallback(
    (id) => {
      patch(id, { banner_dismissed: true });
      track(id, "dismiss");
    },
    [track]
  );

  const clear = useCallback(
    async (id) => {
      const prev = items;
      setItems((list) => list.filter((b) => b.id !== id));
      try {
        await axios.post(`${API}/broadcasts/${id}/event`, { type: "clear" });
      } catch (err) {
        setItems(prev);
        toast.error(err.response?.data?.detail || "Couldn't clear it");
      }
    },
    [items]
  );

  const clearAll = useCallback(async () => {
    const prev = items;
    setItems((list) => list.filter((b) => b.kind === "COMING_SOON"));
    try {
      await axios.post(`${API}/broadcasts/clear-all`);
    } catch {
      setItems(prev);
      toast.error("Couldn't clear updates");
    }
  }, [items]);

  // Spotlight: opens the details once on the visit after it goes live. Waits
  // for the welcome tour (which also opens itself on a first visit) to close.
  useEffect(() => {
    if (!loaded || openId || tourActive) return;
    const shown = readShown();
    const next = items.find((b) => b.display === "SPOTLIGHT" && b.state.banner_live && !b.state.opened && !b.state.banner_dismissed && !shown.has(b.id));
    if (!next) return;
    const t = setTimeout(() => {
      shown.add(next.id);
      saveShown(shown);
      open(next.id);
    }, 2500);
    return () => clearTimeout(t);
  }, [loaded, items, openId, open, tourActive]);

  const current = items.find((b) => b.id === openId) || null;

  const onLink = useCallback(
    (link, opts = {}) => {
      if (current) track(current.id, "click");
      if (opts.external) return; // the <a> opens the page in a new tab
      setOpenId(null);
      navigate(link);
    },
    [current, navigate, track]
  );

  const value = useMemo(() => {
    const updates = items.filter((b) => b.kind !== "COMING_SOON");
    const comingSoon = items.filter((b) => b.kind === "COMING_SOON");
    // Once opened, the banner has done its job; it stays in the bell
    const banners = items.filter((b) => b.display !== "SILENT" && b.state.banner_live && !b.state.banner_dismissed && !b.state.opened);
    const unread = items.filter((b) => !b.state.opened && (b.kind !== "COMING_SOON" || b.state.banner_live)).length;
    return { items, updates, comingSoon, banners, unread, refresh, open, markSeen, dismissBanner, clear, clearAll };
  }, [items, refresh, open, markSeen, dismissBanner, clear, clearAll]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <Dialog open={!!current} onOpenChange={(o) => !o && setOpenId(null)}>
        {current && (
          <DialogContent className="max-w-xl gap-0 overflow-y-auto border-0 p-0 sm:rounded-3xl [&>button:last-child]:z-30 [&>button:last-child]:rounded-full [&>button:last-child]:bg-white/20 [&>button:last-child]:p-1.5 [&>button:last-child]:text-white [&>button:last-child]:opacity-100 [&>button:last-child]:backdrop-blur">
            <DialogTitle className="sr-only">{current.title}</DialogTitle>
            <DialogDescription className="sr-only">{current.summary}</DialogDescription>
            <BroadcastDetail b={current} assetUrl={assetUrl} dark={dark} onLink={onLink} />
          </DialogContent>
        )}
      </Dialog>
    </Ctx.Provider>
  );
}

// Pages where a banner would crowd the work area
const NO_BANNER = ["/billing", "/purchases", "/assistant", "/scanner"];

// Banner carousel above the page content
export function BroadcastBannerSlot() {
  const ctx = useBroadcasts();
  const { pathname } = useLocation();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const banners = ctx?.banners || [];
  const count = banners.length;
  const b = banners[Math.min(index, Math.max(0, count - 1))];
  const hidden = NO_BANNER.some((p) => pathname.startsWith(p));

  useEffect(() => {
    if (index >= count && count) setIndex(0);
  }, [count, index]);

  useEffect(() => {
    if (count < 2 || paused || hidden) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % count), ROTATE_MS);
    return () => clearInterval(t);
  }, [count, paused, hidden]);

  // Counts as seen once it's actually on screen in a visible tab
  const markSeen = ctx?.markSeen;
  useEffect(() => {
    if (!b || hidden || b.state.seen || document.visibilityState !== "visible") return;
    const t = setTimeout(() => markSeen(b.id), 1500);
    return () => clearTimeout(t);
  }, [b, hidden, markSeen]);

  if (!b || hidden) return null;
  return (
    <div className="mb-4 shrink-0" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} data-testid="broadcast-banner">
      <BroadcastBanner
        key={b.id}
        b={b}
        assetUrl={assetUrl}
        onExplore={() => ctx.open(b.id)}
        onClose={() => ctx.dismissBanner(b.id)}
        pager={{ index: Math.min(index, count - 1), count, prev: () => setIndex((i) => (i - 1 + count) % count), next: () => setIndex((i) => (i + 1) % count) }}
      />
    </div>
  );
}
