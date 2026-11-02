// The desktop shell. It opens straight into the app: the first launch creates
// the encrypted database and key with nothing asked of the user. Connecting
// several counters is optional and lives in its own window.
const { app, BrowserWindow, Menu, dialog, ipcMain, safeStorage, session, shell, utilityProcess } = require("electron");
const crypto = require("crypto");
const fs = require("fs");
const https = require("https");
const os = require("os");
const path = require("path");
const { discover, pair } = require("./pairing");
const config = require("./config");

// A shipped build refuses the switches that attach a debugger to it
if (config.hardened && process.argv.some((arg) => /^--(remote-debugging|inspect|debug)/.test(arg))) {
  app.exit(1);
}

const isMac = process.platform === "darwin";
const ROOT = app.getAppPath();
const SETUP_PAGE = path.join(__dirname, "setup.html");
const GATE_PAGE = path.join(__dirname, "gate.html");
const PROTOCOL = "davadesk";
const DEVICE_HEADER = "x-davadesk-device";
// Lets the automated smoke test keep its data apart from a real install
if (!config.hardened && process.env.DAVADESK_DATA_DIR) app.setPath("userData", process.env.DAVADESK_DATA_DIR);
const userData = () => app.getPath("userData");
const dataDir = () => path.join(userData(), "shop");
const configFile = () => path.join(userData(), "config.json");

const readConfig = () => {
  try {
    return JSON.parse(fs.readFileSync(configFile(), "utf8"));
  } catch {
    return { mode: "solo" };
  }
};
function writeConfig(next) {
  const tmp = `${configFile()}.tmp`;
  fs.mkdirSync(userData(), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2));
  fs.renameSync(tmp, configFile());
}

// Windows seals the key silently with DPAPI. On a Mac the Keychain would stop the
// first launch with a password prompt, so there the key stays in a file only this
// user account can read, and FileVault protects the disk.
const canSealQuietly = async () => process.platform === "win32" && (await safeStorage.isAsyncEncryptionAvailable());

async function secretFile(name, make) {
  const file = path.join(userData(), name);
  fs.mkdirSync(userData(), { recursive: true });
  if (fs.existsSync(file)) {
    const raw = fs.readFileSync(file);
    if (raw.subarray(0, 6).toString() === "plain:") return raw.subarray(6).toString();
    return (await safeStorage.decryptStringAsync(raw)).result;
  }
  const value = make();
  fs.writeFileSync(file, (await canSealQuietly()) ? await safeStorage.encryptStringAsync(value) : `plain:${value}`, { mode: 0o600 });
  return value;
}
const databaseKey = () => secretFile("db.key", () => crypto.randomBytes(32).toString("hex"));
const catalogKey = () => secretFile("catalog.key", () => crypto.randomBytes(32).toString("hex"));
const counterToken = async (fresh) => {
  const file = path.join(userData(), "counter.key");
  if (fresh !== undefined) {
    fs.rmSync(file, { force: true });
    return fresh ? secretFile("counter.key", () => fresh) : null;
  }
  return fs.existsSync(file) ? secretFile("counter.key", () => "") : null;
};

// ---- Local server process --------------------------------------------------
let server = null; // { child, port }
const pendingCalls = new Map();
let callSeq = 0;
const windowSecret = crypto.randomBytes(32).toString("hex");

async function startServerProcess() {
  const dbKey = await databaseKey();
  const catKey = await catalogKey();
  return new Promise((resolve, reject) => {
    const child = utilityProcess.fork(path.join(__dirname, "serverProcess.js"), [], { serviceName: "DavaDesk Shop Server", stdio: "pipe" });
    const record = { child, port: null, stopping: false, onStopped: null };
    const logStream = fs.createWriteStream(path.join(userData(), "server.log"), { flags: "a" });
    child.stdout?.pipe(logStream);
    child.stderr?.pipe(logStream);
    child.on("message", (msg) => {
      if (msg.type === "ready") {
        record.port = msg.port;
        server = record;
        resolve(record);
      } else if (msg.type === "failed") {
        reject(Object.assign(new Error(msg.message), { code: msg.code }));
      } else if (msg.type === "result") {
        const p = pendingCalls.get(msg.id);
        if (p) {
          pendingCalls.delete(msg.id);
          if (msg.error) p.reject(new Error(msg.error));
          else p.resolve(msg.value);
        }
      } else if (msg.type === "stopped") {
        record.onStopped?.();
      }
    });
    child.on("exit", (code) => {
      // The "stopped" message can be lost when the process exits straight after it
      record.onStopped?.();
      for (const pending of pendingCalls.values()) pending.reject(new Error("This computer's own data isn't open right now."));
      pendingCalls.clear();
      if (server === record) server = null;
      if (!record.stopping && !quitting) {
        dialog.showErrorBox("DavaDesk", `The shop server stopped unexpectedly (code ${code}). DavaDesk will close; your saved work is safe. Please open it again.`);
        app.quit();
      }
    });
    child.postMessage({
      type: "start",
      options: {
        dataDir: dataDir(),
        backendDir: path.join(ROOT, "backend"),
        webDir: path.join(ROOT, "web"),
        dbKey,
        catalogKey: catKey,
        config: { cloudUrl: config.cloudUrl, licencePublicKey: config.licencePublicKey },
        windowSecret,
        version: app.getVersion(),
      },
    });
  });
}

const callServer = (action, args) =>
  new Promise((resolve, reject) => {
    if (!server) return reject(new Error("This computer's own data isn't open right now."));
    const id = ++callSeq;
    pendingCalls.set(id, { resolve, reject });
    server.child.postMessage({ type: "call", id, action, args });
  });

function stopServerProcess() {
  return new Promise((resolve) => {
    if (!server) return resolve();
    const record = server;
    // From here on nothing may call it: it's on its way out
    server = null;
    record.stopping = true;
    const done = setTimeout(resolve, 8000);
    record.onStopped = () => {
      clearTimeout(done);
      resolve();
    };
    record.child.postMessage({ type: "stop" });
  });
}

// ---- Windows -----------------------------------------------------------------
let mainWindow = null;
let setupWindow = null;
let quitting = false;
let currentOrigin = null;
let currentDeviceToken = null;
let pinned = null; // { host, fingerprint }

const webPreferences = () => ({
  preload: path.join(__dirname, "preload.js"),
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  devTools: !config.hardened,
  plugins: true, // the built-in PDF viewer, for bills
});

function configureSession() {
  const ses = session.defaultSession;
  // The device header goes only to this shop's server, on every request
  ses.webRequest.onBeforeSendHeaders((details, callback) => {
    const headers = details.requestHeaders;
    if (currentOrigin && currentDeviceToken && details.url.startsWith(`${currentOrigin}/`)) headers[DEVICE_HEADER] = currentDeviceToken;
    callback({ requestHeaders: headers });
  });
  // A counter trusts exactly the certificate it paired with, nothing else on that address
  ses.setCertificateVerifyProc((request, callback) => {
    if (pinned && request.hostname === pinned.host) {
      let fp = null;
      try {
        fp = new crypto.X509Certificate(request.certificate.data).fingerprint256;
      } catch {}
      return callback(fp === pinned.fingerprint ? 0 : -2);
    }
    callback(-3);
  });
  ses.setPermissionRequestHandler((wc, permission, callback) => callback(["clipboard-sanitized-write", "fullscreen", "media"].includes(permission)));
}

function setupOpenHandlers(contents) {
  contents.setWindowOpenHandler(({ url }) => {
    const local = url === "about:blank" || (currentOrigin && url.startsWith(`${currentOrigin}/`));
    if (local) {
      return { action: "allow", overrideBrowserWindowOptions: { width: 980, height: 800, autoHideMenuBar: true, webPreferences: { contextIsolation: true, sandbox: true, plugins: true, devTools: !config.hardened } } };
    }
    if (/^https?:|^mailto:|^tel:|^whatsapp:/.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  contents.on("will-navigate", (event, url) => {
    if (url.startsWith("file:") && (contents === setupWindow?.webContents || contents === mainWindow?.webContents)) return;
    if (currentOrigin && url.startsWith(`${currentOrigin}/`)) return;
    event.preventDefault();
    if (/^https?:/.test(url)) shell.openExternal(url);
  });
}

function loadApp() {
  if (!mainWindow || !currentOrigin) return;
  mainWindow.loadURL(`${currentOrigin}/dashboard`);
}

// ---- Sign-in gate ----------------------------------------------------------------
// The app itself only opens with a valid licence from the cloud. The local server
// enforces the same check on every request; this just shows the right screen.
let showingGate = false;
let gateWatch = null;
let pendingSignIn = null; // { verifier, state }

function showGate() {
  if (!mainWindow || showingGate) return;
  showingGate = true;
  mainWindow.loadFile(GATE_PAGE);
}

async function checkAccess() {
  if (!server || readConfig().mode === "counter") return;
  try {
    const { access_problem: problem } = await callServer("status");
    if (problem && !showingGate) showGate();
    else if (!problem && showingGate) {
      showingGate = false;
      loadApp();
    }
  } catch {}
}

function watchAccess() {
  clearInterval(gateWatch);
  gateWatch = setInterval(checkAccess, 1500);
  return checkAccess();
}

function startSignIn() {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const state = crypto.randomBytes(16).toString("base64url");
  pendingSignIn = { verifier, state };
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  const url = new URL("/desktop/authorize", config.webUrl);
  url.searchParams.set("challenge", challenge);
  url.searchParams.set("state", state);
  url.searchParams.set("name", os.hostname());
  if (config.hardened || !process.env.DAVADESK_NO_BROWSER) shell.openExternal(url.toString());
  return { url: config.hardened ? null : url.toString(), challenge, state };
}

async function finishSignIn(code) {
  if (!pendingSignIn) throw new Error("Please click Sign in first.");
  const { verifier } = pendingSignIn;
  await callServer("activate", { code, verifier });
  pendingSignIn = null;
  await checkAccess();
}

function handleDeepLink(link) {
  try {
    const url = new URL(link);
    if (url.protocol !== `${PROTOCOL}:` || url.searchParams.get("state") !== pendingSignIn?.state) return;
    finishSignIn(url.searchParams.get("code")).catch((err) => {
      mainWindow?.webContents.send("dd:signInError", err.message);
    });
    mainWindow?.show();
    mainWindow?.focus();
  } catch {}
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1000,
    minHeight: 640,
    show: false,
    title: "DavaDesk",
    backgroundColor: "#ffffff",
    webPreferences: webPreferences(),
  });
  setupOpenHandlers(mainWindow.webContents);
  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.on("closed", () => (mainWindow = null));
  // A counter whose main computer is off lands on a page that explains it
  mainWindow.webContents.on("did-fail-load", (event, code, description, url, isMainFrame) => {
    if (!isMainFrame || code === -3) return;
    if (readConfig().mode === "counter") openSetup({ problem: true });
  });
}

function openSetup({ problem = false } = {}) {
  if (setupWindow) {
    setupWindow.focus();
    if (problem) setupWindow.loadFile(SETUP_PAGE, { query: { problem: "1" } });
    return;
  }
  setupWindow = new BrowserWindow({
    width: 620,
    height: 720,
    resizable: true,
    minimizable: false,
    parent: mainWindow || undefined,
    title: "Counters and network",
    autoHideMenuBar: true,
    webPreferences: { ...webPreferences(), plugins: false },
  });
  setupOpenHandlers(setupWindow.webContents);
  setupWindow.on("closed", () => (setupWindow = null));
  setupWindow.loadFile(SETUP_PAGE, problem ? { query: { problem: "1" } } : {});
}

function buildMenu() {
  const countersItem = { label: "Counters and Network…", click: () => openSetup() };
  const template = [
    ...(isMac
      ? [{ label: app.name, submenu: [{ role: "about" }, { type: "separator" }, countersItem, { type: "separator" }, { role: "hide" }, { role: "hideOthers" }, { role: "unhide" }, { type: "separator" }, { role: "quit" }] }]
      : [{ label: "File", submenu: [countersItem, { type: "separator" }, { role: "quit" }] }]),
    { role: "editMenu" },
    { label: "View", submenu: [{ role: "reload" }, { type: "separator" }, { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" }, { type: "separator" }, { role: "togglefullscreen" }] },
    { role: "windowMenu" },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---- Counter: is the main computer still there? --------------------------------
// Only asks whether it answers; real traffic stays pinned to its certificate.
const MAIN_CHECK_MS = 5000;
let mainCheck = null;

function watchMainComputer(main) {
  clearInterval(mainCheck);
  let failures = 0;
  let reported = false;
  mainCheck = setInterval(() => {
    const req = https.get({ host: main.host, port: main.port, path: "/health", rejectUnauthorized: false, timeout: 3000 }, (res) => {
      res.resume();
      failures = 0;
      if (reported) {
        reported = false;
        setupWindow?.close();
        loadApp();
      }
    });
    req.on("timeout", () => req.destroy());
    req.on("error", () => {
      failures++;
      if (failures >= 2 && !reported) {
        reported = true;
        openSetup({ problem: true });
      }
    });
  }, MAIN_CHECK_MS);
}

// ---- Modes -------------------------------------------------------------------
async function useLocalData() {
  clearInterval(mainCheck);
  pinned = null;
  if (!server) await startServerProcess();
  currentOrigin = `http://127.0.0.1:${server.port}`;
  currentDeviceToken = windowSecret;
  configureSession();
}

async function useMainComputer(main) {
  // A counter doesn't open its own database while it uses another computer's
  await stopServerProcess();
  pinned = { host: main.host, fingerprint: main.fingerprint };
  currentOrigin = `https://${main.host}:${main.port}`;
  currentDeviceToken = await counterToken();
  configureSession();
  watchMainComputer(main);
}

const describeState = async () => {
  const config = readConfig();
  const lan = server ? await callServer("lanStatus") : null;
  return {
    mode: config.mode,
    computer: os.hostname(),
    main: config.main ? { host: config.main.host, shop: config.main.shop } : null,
    lan,
  };
};

const APP_ACTIONS = new Set(["openCounters", "signOut"]);
const GATE_ACTIONS = new Set(["signIn", "submitCode", "gateState", "openCounters"]);

function registerIpc() {
  const handle = (name, fn) =>
    ipcMain.handle(`dd:${name}`, async (event, args) => {
      const senderUrl = event.senderFrame?.url || "";
      const fromApp = event.sender === mainWindow?.webContents;
      const allowed =
        (APP_ACTIONS.has(name) && fromApp) ||
        (GATE_ACTIONS.has(name) && fromApp && senderUrl.startsWith("file:")) ||
        event.sender === setupWindow?.webContents;
      if (!allowed) throw new Error("Not allowed");
      return fn(args || {});
    });
  handle("openCounters", () => openSetup());
  handle("signIn", () => startSignIn());
  handle("submitCode", ({ code }) => finishSignIn(String(code).trim()));
  handle("gateState", () => callServer("status"));
  handle("signOut", async ({ force }) => {
    await callServer("signOut", { force: !!force });
    await checkAccess();
  });
  handle("state", describeState);
  handle("discover", () => discover());
  handle("enableMain", async () => {
    await callServer("lanEnable");
    writeConfig({ ...readConfig(), mode: "main" });
    return describeState();
  });
  handle("disableMain", async () => {
    await callServer("lanDisable");
    writeConfig({ ...readConfig(), mode: "solo" });
    return describeState();
  });
  handle("newCode", async () => {
    await callServer("lanNewCode");
    return describeState();
  });
  handle("revoke", async ({ id }) => {
    await callServer("lanRevoke", { id });
    return describeState();
  });
  handle("connect", async ({ host, code }) => {
    const result = await pair({ host: String(host).trim(), code: String(code).trim(), name: os.hostname() });
    clearInterval(gateWatch);
    await counterToken(result.token);
    writeConfig({ mode: "counter", main: { host: result.host, port: result.port, fingerprint: result.fingerprint, shop: result.shop } });
    await useMainComputer(readConfig().main);
    loadApp();
    return describeState();
  });
  handle("disconnect", async () => {
    await counterToken(null);
    writeConfig({ mode: "solo" });
    await useLocalData();
    showingGate = false;
    loadApp();
    await watchAccess();
    return describeState();
  });
  handle("retry", async () => {
    loadApp();
    return describeState();
  });
}

function reportStartupFailure(err) {
  const log = path.join(userData(), "server.log");
  dialog.showErrorBox("DavaDesk couldn't open your data", `${err.message}\n\nNothing has been changed. Details are in:\n${log}`);
  app.quit();
}

// ---- Start -------------------------------------------------------------------
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  if (app.isPackaged) app.setAsDefaultProtocolClient(PROTOCOL);
  app.on("open-url", (event, link) => {
    event.preventDefault();
    handleDeepLink(link);
  });
  app.on("second-instance", (event, argv) => {
    const link = argv.find((arg) => arg.startsWith(`${PROTOCOL}://`));
    if (link) handleDeepLink(link);
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    configureSession();
    buildMenu();
    registerIpc();
    createMainWindow();
    const savedConfig = readConfig();
    try {
      if (savedConfig.mode === "counter" && savedConfig.main) {
        await useMainComputer(savedConfig.main);
      } else {
        await useLocalData();
        if (savedConfig.mode === "main") await callServer("lanEnable");
      }
      loadApp();
      await watchAccess();
    } catch (err) {
      reportStartupFailure(err);
    }
  });

  app.on("window-all-closed", () => app.quit());
  app.on("before-quit", (event) => {
    if (quitting) return;
    if (!server) return;
    event.preventDefault();
    quitting = true;
    stopServerProcess().then(() => app.exit(0));
  });
}
