// True only in the build packaged inside the desktop app (desktop/scripts/prepare-web.js).
// The web app is unaffected: this is false there, and the bundler removes what it guards.
import { useEffect, useState } from "react";
import axios from "axios";

export const IS_DESKTOP = process.env.REACT_APP_DESKTOP === "true";

export const openCounters = () => window.davadeskDesktop?.openCounters();
export const signOutDesktop = (force) => window.davadeskDesktop?.signOut(force);

// Where the installers are hosted, and whether the download offer is switched on
export const DOWNLOAD_BASE = process.env.REACT_APP_DESKTOP_DOWNLOAD_URL || "";
export const DOWNLOADS_ENABLED = !IS_DESKTOP && process.env.REACT_APP_DESKTOP_DOWNLOADS === "true";

// One shared poll for every component that wants the sync status
let status = null;
let timer = null;
const listeners = new Set();
const poll = () =>
  axios
    .get("/api/desktop/status", { _skipAuthRetry: true })
    .then((r) => {
      status = r.data;
      listeners.forEach((fn) => fn(status));
    })
    .catch(() => {});

export function useDesktopStatus() {
  const [value, setValue] = useState(status);
  useEffect(() => {
    if (!IS_DESKTOP) return undefined;
    listeners.add(setValue);
    if (!timer) {
      poll();
      timer = setInterval(poll, 1500);
    }
    return () => {
      listeners.delete(setValue);
    };
  }, []);
  return value;
}

// Online-only features: always on the web; on desktop, only with internet
export function useOnlineFeatures() {
  const s = useDesktopStatus();
  return !IS_DESKTOP || !!s?.online;
}
