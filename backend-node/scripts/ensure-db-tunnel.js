// Runs before `npm run dev`. When .env points MONGO_URL at the production
// database through the local SSH tunnel (127.0.0.1:27018), opens that tunnel
// in the background if it isn't up yet. Does nothing for any other database.
//   Key: PROD_SSH_KEY (default ~/Downloads/davadesk-prod.pem)
//   Host: PROD_SSH_HOST (default ubuntu@15.252.100.85)
require("dotenv").config();
const net = require("net");
const os = require("os");
const path = require("path");
const fs = require("fs");
const { spawnSync } = require("child_process");

const url = process.env.MONGO_URL || "";
const m = url.match(/@(127\.0\.0\.1|localhost):(\d+)\//);
const PORT = 27018;
if (!m || Number(m[2]) !== PORT) process.exit(0);

const isOpen = () =>
  new Promise((resolve) => {
    const s = net.connect(PORT, "127.0.0.1");
    s.once("connect", () => (s.destroy(), resolve(true)));
    s.once("error", () => resolve(false));
    s.setTimeout(1500, () => (s.destroy(), resolve(false)));
  });

(async () => {
  if (await isOpen()) return console.log(`[db-tunnel] production DB tunnel already open on ${PORT}`);
  const key = process.env.PROD_SSH_KEY || path.join(os.homedir(), "Downloads", "davadesk-prod.pem");
  const host = process.env.PROD_SSH_HOST || "ubuntu@15.252.100.85";
  if (!fs.existsSync(key)) {
    console.error(`[db-tunnel] SSH key not found at ${key}; set PROD_SSH_KEY or run scripts/prod-db-tunnel.sh`);
    process.exit(0);
  }
  console.log(`[db-tunnel] opening production DB tunnel on ${PORT}...`);
  // -f: go to the background once connected, so `npm run dev` continues
  const r = spawnSync(
    "ssh",
    ["-i", key, "-f", "-N", "-o", "ExitOnForwardFailure=yes", "-o", "ServerAliveInterval=30", "-o", "ServerAliveCountMax=3", "-o", "ConnectTimeout=15", "-L", `127.0.0.1:${PORT}:127.0.0.1:27017`, host],
    { stdio: "inherit" }
  );
  if (r.status !== 0) return console.error("[db-tunnel] could not open the tunnel (check VPN / network / key)");
  for (let i = 0; i < 20 && !(await isOpen()); i++) await new Promise((res) => setTimeout(res, 250));
  console.log((await isOpen()) ? "[db-tunnel] tunnel ready" : "[db-tunnel] tunnel started but the port isn't answering yet");
})();
