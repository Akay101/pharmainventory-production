// True only in the build packaged inside the desktop app (desktop/scripts/prepare-web.js).
// The web app is unaffected: this is false there, and the bundler removes what it guards.
import { useEffect, useState } from "react";
import axios from "axios";

export const IS_DESKTOP = process.env.REACT_APP_DESKTOP === "true";

export const openCounters = () => window.davadeskDesktop?.openCounters();
export const signOutDesktop = (force) => window.davadeskDesktop?.signOut(force);

// The download offer is on for dev only, until it's switched on for production here
const IS_DEV_SITE = typeof window !== "undefined" && /^store-dev\./.test(window.location.hostname);
export const DOWNLOADS_ENABLED = !IS_DESKTOP && (IS_DEV_SITE || process.env.REACT_APP_DESKTOP_DOWNLOADS === "true");

// Installers are served by the API, which gives a short-lived link to the private bucket
export const DOWNLOAD_BASE = process.env.REACT_APP_DESKTOP_DOWNLOAD_URL || `${process.env.REACT_APP_BACKEND_URL || ""}/api/desktop/releases`;

export const PACKAGES = {
  win: { label: "Windows", note: "Windows 10 or later, 64-bit", file: "DavaDesk-Windows-Setup.exe" },
  arm: { label: "Mac with Apple chip", note: "M1, M2, M3 or later", file: "DavaDesk-Mac-Apple-Silicon.dmg" },
  intel: { label: "Mac with Intel chip", note: "Older Macs", file: "DavaDesk-Mac-Intel.dmg" },
};
export const downloadUrl = (key) => `${DOWNLOAD_BASE}/${PACKAGES[key].file}`;

// "windows" or "mac", plus the chip when the browser reports it. Safari doesn't,
// so a Mac user is always offered both.
export async function detectComputer() {
  const ua = navigator.userAgent;
  if (/Windows/.test(ua)) return { os: "windows", best: "win" };
  if (!/Macintosh/.test(ua)) return { os: null, best: null };
  try {
    const hints = await navigator.userAgentData?.getHighEntropyValues?.(["architecture"]);
    if (hints?.architecture === "arm") return { os: "mac", best: "arm" };
    if (hints?.architecture === "x86") return { os: "mac", best: "intel" };
  } catch {}
  return { os: "mac", best: null };
}

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
