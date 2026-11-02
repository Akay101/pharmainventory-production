// What pages may ask of the desktop shell. The React app only gets to open the
// counters window; the counters window itself gets its controls.
const { contextBridge, ipcRenderer } = require("electron");

const call = (name, args) => ipcRenderer.invoke(`dd:${name}`, args);

contextBridge.exposeInMainWorld("davadeskDesktop", {
  isDesktop: true,
  openCounters: () => call("openCounters"),
  platform: process.platform,
});

if (window.location.protocol === "file:") {
  contextBridge.exposeInMainWorld("davadeskSetup", {
    state: () => call("state"),
    discover: () => call("discover"),
    enableMain: () => call("enableMain"),
    disableMain: () => call("disableMain"),
    newCode: () => call("newCode"),
    revoke: (id) => call("revoke", { id }),
    connect: (host, code) => call("connect", { host, code }),
    disconnect: () => call("disconnect"),
    retry: () => call("retry"),
    close: () => window.close(),
  });
}
