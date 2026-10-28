// Keeps the local production DB tunnel (127.0.0.1:27018) open: runs ssh in
// the foreground and starts it again whenever it drops (Wi-Fi change, laptop
// sleep, server restart). Started in the background by ensure-db-tunnel.js;
// only one keeper runs at a time (pid file). Log: <tmpdir>/davadesk-db-tunnel.log
//   Stop it:  kill $(cat "$TMPDIR/davadesk-db-tunnel.pid")
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const [key, host, port] = process.argv.slice(2);
const PID_FILE = path.join(os.tmpdir(), "davadesk-db-tunnel.pid");
const log = (msg) => console.log(`${new Date().toISOString()} ${msg}`);

const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
const other = Number(fs.existsSync(PID_FILE) && fs.readFileSync(PID_FILE, "utf8"));
if (other && other !== process.pid && alive(other)) process.exit(0);
fs.writeFileSync(PID_FILE, String(process.pid));

let child = null;
let delay = 2000;
const stop = () => {
  if (child) child.kill();
  try {
    if (Number(fs.readFileSync(PID_FILE, "utf8")) === process.pid) fs.unlinkSync(PID_FILE);
  } catch {}
  process.exit(0);
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);

function open() {
  const started = Date.now();
  log(`opening tunnel 127.0.0.1:${port} -> ${host}`);
  child = spawn(
    "ssh",
    [
      "-i", key, "-N",
      "-o", "ExitOnForwardFailure=yes",
      "-o", "ServerAliveInterval=15",
      "-o", "ServerAliveCountMax=3",
      "-o", "ConnectTimeout=15",
      "-o", "BatchMode=yes",
      "-L", `127.0.0.1:${port}:127.0.0.1:27017`,
      host,
    ],
    { stdio: ["ignore", "inherit", "inherit"] }
  );
  child.on("exit", (code) => {
    child = null;
    // A tunnel that stayed up a while dropped: retry quickly. Repeated quick
    // failures (offline, key problem) back off up to a minute.
    delay = Date.now() - started > 60000 ? 2000 : Math.min(delay * 2, 60000);
    log(`tunnel closed (ssh exit ${code}); reopening in ${delay / 1000}s`);
    setTimeout(open, delay);
  });
}
open();
