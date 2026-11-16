// Keeps the app current with no one having to do anything. It checks every few
// minutes, downloads a new version in the background and installs it when the app
// closes, or by itself once the computer has been idle for a while.
// Windows uses the standard updater. A Mac app can only use Apple's updater once it
// is signed by Apple, so on a Mac this downloads the new app, checks it against the
// published checksum and swaps it in after the app has quit.
const { app, net, shell, powerMonitor } = require("electron");
const { spawn, execFileSync } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { Readable } = require("stream");
const { pipeline } = require("stream/promises");

const CHECK_EVERY_MS = 10 * 60 * 1000;
const FIRST_CHECK_MS = 20 * 1000;
// Installs on its own only when nobody has touched the computer for this long
const IDLE_INSTALL_SECONDS = 10 * 60;

let state = { current: app.getVersion(), latest: null, status: "none", required: false };
let options = null;
let updater = null;
let checking = false;
let macReady = null; // { app: path of the new DavaDesk.app }
let relaunchAfterQuit = false;

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

const releases = () => `${options.cloudUrl}/api/desktop/releases`;
const manualFile = () => (process.arch === "arm64" ? "DavaDesk-Mac-Apple-Silicon.dmg" : "DavaDesk-Mac-Intel.dmg");
const updatesDir = () => path.join(app.getPath("userData"), "updates");

// ---- Windows ------------------------------------------------------------------
function windowsUpdater() {
  if (updater) return updater;
  updater = require("electron-updater").autoUpdater;
  updater.setFeedURL({ provider: "generic", url: releases() });
  updater.autoDownload = true;
  // Installed by onQuit below: the app ends with app.exit(), which this hook never sees
  updater.autoInstallOnAppQuit = false;
  updater.on("download-progress", () => set({ status: "downloading" }));
  updater.on("update-downloaded", () => {
    set({ status: "ready" });
    installIfRequired();
  });
  updater.on("error", (err) => {
    console.warn("[Update]", err.message);
    if (state.status === "downloading") set({ status: "none" });
  });
  return updater;
}

// ---- Mac ------------------------------------------------------------------------
// The DavaDesk.app this is running from, if the app may replace it
function macBundle() {
  const bundle = path.resolve(process.execPath, "..", "..", "..");
  if (!bundle.endsWith(".app")) return null;
  // Opened straight from the download (App Translocation) or the disk image
  if (bundle.includes("/AppTranslocation/") || bundle.startsWith("/Volumes/")) return null;
  try {
    fs.accessSync(path.dirname(bundle), fs.constants.W_OK);
    fs.accessSync(bundle, fs.constants.W_OK);
    return bundle;
  } catch {
    return null;
  }
}

async function downloadMac(version) {
  const yml = await net.fetch(`${releases()}/latest-mac.yml`);
  if (!yml.ok) throw new Error(`latest-mac.yml: ${yml.status}`);
  const meta = require("js-yaml").load(await yml.text());
  if (meta.version !== version) throw new Error(`Release files are for ${meta.version}, not ${version}`);
  const file = (meta.files || []).find((f) => String(f.url).endsWith(`-mac-${process.arch}.zip`));
  if (!file) throw new Error(`No Mac ${process.arch} update in ${version}`);

  const dir = updatesDir();
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const zip = path.join(dir, "update.zip");
  const res = await net.fetch(`${releases()}/${encodeURIComponent(file.url)}`);
  if (!res.ok) throw new Error(`Download: ${res.status}`);
  const hash = crypto.createHash("sha512");
  await pipeline(
    Readable.fromWeb(res.body),
    async function* (source) {
      for await (const chunk of source) {
        hash.update(chunk);
        yield chunk;
      }
    },
    fs.createWriteStream(zip)
  );
  // The checksum comes from the same release, so a broken or swapped file never installs
  if (hash.digest("base64") !== file.sha512) throw new Error("The download didn't match its checksum");

  const out = path.join(dir, "app");
  execFileSync("/usr/bin/ditto", ["-x", "-k", zip, out]);
  fs.rmSync(zip, { force: true });
  const name = fs.readdirSync(out).find((n) => n.endsWith(".app"));
  if (!name) throw new Error("The download had no app in it");
  const newApp = path.join(out, name);
  const plist = path.join(newApp, "Contents", "Info.plist");
  const got = execFileSync("/usr/bin/plutil", ["-extract", "CFBundleShortVersionString", "raw", plist], { encoding: "utf8" }).trim();
  if (got !== version) throw new Error(`Downloaded app is ${got}, expected ${version}`);
  return newApp;
}

// After this process ends: swap the new app in, keeping the old one if anything fails
function swapMacOnExit(bundle, newApp, relaunch) {
  const script = [
    'while kill -0 "$1" 2>/dev/null; do sleep 0.3; done',
    'OLD="$2"; NEW="$3"; KEEP="$2.previous"',
    'rm -rf "$KEEP"',
    'if mv "$OLD" "$KEEP"; then',
    '  if mv "$NEW" "$OLD"; then rm -rf "$KEEP"; else mv "$KEEP" "$OLD"; fi',
    "fi",
    '[ "$4" = "1" ] && open "$OLD"',
    "exit 0",
  ].join("\n");
  spawn("/bin/sh", ["-c", script, "davadesk-update", String(process.pid), bundle, newApp, relaunch ? "1" : "0"], { detached: true, stdio: "ignore" }).unref();
}

// ---- Both ------------------------------------------------------------------------
async function check() {
  if (checking) return;
  checking = true;
  try {
    const res = await net.fetch(`${releases()}/latest.json`);
    if (!res.ok) return;
    const info = await res.json();
    const required = !!info.min_version && older(state.current, info.min_version);
    if (!older(state.current, info.version)) return set({ latest: info.version, required, status: "none" });
    if (state.status === "ready" && state.latest === info.version) return set({ required });
    if (state.status === "downloading") return set({ required });
    set({ latest: info.version, required, status: "downloading" });
    if (process.platform === "win32") {
      await windowsUpdater().checkForUpdates();
      return;
    }
    const bundle = macBundle();
    if (!bundle) return set({ status: "available", manual: true });
    macReady = { app: await downloadMac(info.version), bundle };
    set({ status: "ready", manual: false });
    installIfRequired();
  } catch (err) {
    // No internet, or a release still being published: tried again at the next check
    console.warn("[Update] check:", err.message);
    if (state.status === "downloading") set({ status: "none" });
  } finally {
    checking = false;
  }
}

// Called by the app once its local server has stopped. True when the update
// takes over ending the app (Windows runs its installer and quits by itself).
function onQuit() {
  if (state.status !== "ready") return false;
  if (process.platform === "win32" && updater) {
    updater.quitAndInstall(true, relaunchAfterQuit);
    return true;
  }
  if (macReady) swapMacOnExit(macReady.bundle, macReady.app, relaunchAfterQuit);
  return false;
}

// "Restart to update", or the computer being idle: quit now and come back updated
function apply() {
  if (state.status === "ready") {
    relaunchAfterQuit = true;
    return app.quit();
  }
  if (state.manual) return shell.openExternal(`${releases()}/${manualFile()}`);
  return check();
}

// A version too old for the account can't be used anyway, so it updates at once
function installIfRequired() {
  if (state.required) setTimeout(apply, 3000);
}

function installWhenIdle() {
  if (state.status !== "ready") return;
  if (powerMonitor.getSystemIdleTime() < IDLE_INSTALL_SECONDS) return;
  if (options.isBusy?.()) return;
  console.log(`[Update] Computer idle: installing ${state.latest}`);
  apply();
}

function start(opts) {
  options = opts;
  if (!app.isPackaged) return;
  fs.rmSync(updatesDir(), { recursive: true, force: true });
  setTimeout(check, FIRST_CHECK_MS).unref?.();
  setInterval(check, CHECK_EVERY_MS).unref?.();
  setInterval(installWhenIdle, 60 * 1000).unref?.();
  // Back from sleep: often the moment a pharmacy opens for the day
  powerMonitor.on("resume", () => setTimeout(check, FIRST_CHECK_MS));
}

module.exports = { start, apply, onQuit, state: () => state };
