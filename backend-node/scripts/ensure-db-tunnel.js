// Runs before `npm run dev`. When .env points MONGO_URL at the production
// database through the local SSH tunnel (127.0.0.1:27018), starts a background
// keeper (scripts/db-tunnel-keeper.js) that opens the tunnel and reopens it
// whenever it drops. Does nothing for any other database.
//   Key: PROD_SSH_KEY (default ~/.ssh/davadesk-prod.pem, then ~/Downloads/davadesk-prod.pem)
//   Host: PROD_SSH_HOST (default ubuntu@api.davadesk.in, which follows the Elastic IP)
require("dotenv").config();
const net = require("net");
const os = require("os");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");

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
  const candidates = [process.env.PROD_SSH_KEY, path.join(os.homedir(), ".ssh", "davadesk-prod.pem"), path.join(os.homedir(), "Downloads", "davadesk-prod.pem")].filter(Boolean);
  const key = candidates.find((k) => fs.existsSync(k));
  const host = process.env.PROD_SSH_HOST || "ubuntu@api.davadesk.in";
  if (!key) {
    console.error(`[db-tunnel] SSH key not found (${candidates.join(", ")}); set PROD_SSH_KEY`);
    process.exit(0);
  }
  // Always make sure the keeper runs (it exits at once if one already does),
  // so an already-open tunnel is also reopened if it later drops
  const logFile = path.join(os.tmpdir(), "davadesk-db-tunnel.log");
  const out = fs.openSync(logFile, "a");
  spawn(process.execPath, [path.join(__dirname, "db-tunnel-keeper.js"), key, host, String(PORT)], {
    detached: true,
    stdio: ["ignore", out, out],
  }).unref();

  if (await isOpen()) return console.log(`[db-tunnel] production DB tunnel open on ${PORT} (kept alive in the background)`);
  console.log(`[db-tunnel] opening production DB tunnel on ${PORT} via ${host}...`);
  for (let i = 0; i < 60 && !(await isOpen()); i++) await new Promise((res) => setTimeout(res, 250));
  console.log(
    (await isOpen())
      ? "[db-tunnel] tunnel ready (kept alive in the background)"
      : `[db-tunnel] tunnel isn't up yet; it keeps retrying in the background. Log: ${logFile}`
  );
})();
