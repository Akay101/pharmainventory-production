// Keeps the app current. Windows downloads updates by itself and installs them when
// the app closes. A Mac app can only do that once it is signed by Apple, so until
// then it says a new version exists and offers the download.
const { app, net, shell } = require("electron");

const CHECK_EVERY_MS = 60 * 60 * 1000;
const FIRST_CHECK_MS = 20 * 1000;

let state = { current: app.getVersion(), latest: null, status: "none", required: false };
let options = null;
let updater = null;

const parse = (v) => String(v).split(".").map((n) => parseInt(n, 10) || 0);
function older(a, b) {
  const [x, y] = [parse(a), parse(b)];
  for (let i = 0; i < 3; i++) {
    if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0);
  }
  return false;
}

const set = (next) => {
  state = { ...state, ...next };
  options?.onChange?.();
};

const manualFile = () => (process.arch === "arm64" ? "DavaDesk-Mac-Apple-Silicon.dmg" : "DavaDesk-Mac-Intel.dmg");

function startUpdater() {
  if (updater) return updater;
  updater = require("electron-updater").autoUpdater;
  updater.setFeedURL({ provider: "generic", url: `${options.cloudUrl}/api/desktop/releases` });
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;
  updater.on("download-progress", () => set({ status: "downloading" }));
  updater.on("update-downloaded", () => set({ status: "ready" }));
  updater.on("error", (err) => {
    console.warn("[Update]", err.message);
    if (state.status === "downloading") set({ status: "available" });
  });
  return updater;
}

async function check() {
  try {
    const res = await net.fetch(`${options.cloudUrl}/api/desktop/releases/latest.json`);
    if (!res.ok) return;
    const info = await res.json();
    const required = !!info.min_version && older(state.current, info.min_version);
    if (!older(state.current, info.version)) return set({ latest: info.version, required, status: "none" });
    if (state.status === "ready" || state.status === "downloading") return set({ latest: info.version, required });
    set({ latest: info.version, required, status: options.autoUpdate ? "downloading" : "available" });
    if (options.autoUpdate) await startUpdater().checkForUpdates();
  } catch (err) {
    // No internet: nothing to do until the next check
    console.warn("[Update] check:", err.message);
  }
}

function apply() {
  if (state.status === "ready") return updater.quitAndInstall(true, true);
  if (options.autoUpdate) return check();
  return shell.openExternal(`${options.cloudUrl}/api/desktop/releases/${manualFile()}`);
}

function start(opts) {
  options = opts;
  if (!app.isPackaged) return;
  setTimeout(check, FIRST_CHECK_MS).unref?.();
  setInterval(check, CHECK_EVERY_MS).unref?.();
}

module.exports = { start, apply, state: () => state };
