// A private copy of the cloud on this computer, for trying the desktop app before
// anything goes live: its own MongoDB and Redis in Docker, the real backend started
// outside the repo so it reads no .env, and the web app on http://localhost:3000.
// Nothing here can reach production. Data stays between runs; --fresh starts over.
const { execSync, spawn, spawnSync } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");

const root = path.join(__dirname, "..");
const repo = path.join(root, "..");
const backend = path.join(repo, "backend-node");
const home = path.join(root, ".test-cloud");
const webDir = path.join(home, "web");
const MONGO = "dd-trial-mongo";
const REDIS = "dd-trial-redis";
const MONGO_URL = "mongodb://127.0.0.1:27098/ddtrial?directConnection=true";
const docker = (...args) => spawnSync("docker", args, { encoding: "utf8" });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const fresh = process.argv.includes("--fresh");

function secrets() {
  const file = path.join(home, "secrets.json");
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const out = {
    jwt: crypto.randomBytes(32).toString("hex"),
    licencePrivate: Buffer.from(privateKey.export({ type: "pkcs8", format: "pem" })).toString("base64"),
    licencePublic: publicKey.export({ type: "spki", format: "pem" }),
    password: `Trial-${crypto.randomBytes(6).toString("hex")}`,
  };
  fs.writeFileSync(file, JSON.stringify(out, null, 2), { mode: 0o600 });
  return out;
}

async function startDatabases() {
  if (fresh) docker("rm", "-f", MONGO, REDIS);
  if (docker("start", MONGO).status !== 0) docker("run", "-d", "--name", MONGO, "-p", "127.0.0.1:27098:27017", "mongo:7", "--replSet", "rs0", "--bind_ip_all");
  if (docker("start", REDIS).status !== 0) docker("run", "-d", "--name", REDIS, "-p", "127.0.0.1:6398:6379", "redis:7-alpine");
  for (let i = 0; i < 60; i++) {
    docker("exec", MONGO, "mongosh", "--quiet", "--eval", "try{rs.status().ok}catch(e){rs.initiate({_id:'rs0',members:[{_id:0,host:'127.0.0.1:27017'}]}).ok}");
    if (docker("exec", MONGO, "mongosh", "--quiet", "--eval", "db.hello().isWritablePrimary").stdout.trim() === "true") return;
    await wait(1000);
  }
  throw new Error("MongoDB didn't start. Is Docker running?");
}

async function seed(password) {
  const { MongoClient } = require(path.join(backend, "node_modules", "mongodb"));
  const bcrypt = require(path.join(backend, "node_modules", "bcryptjs"));
  const client = await MongoClient.connect(MONGO_URL);
  const db = client.db();
  if (await db.collection("pharmacies").findOne({ id: "trial-active" })) return client.close();

  const now = new Date().toISOString();
  const DAY = 86400000;
  const hash = await bcrypt.hash(password, 10);
  const subscription = (days) => ({ plan: "ADVANCED", kind: "PAID", status: days > 0 ? "ACTIVE" : "EXPIRED", starts_at: new Date(Date.now() - 400 * DAY).toISOString(), ends_at: new Date(Date.now() + days * DAY).toISOString(), trial_used: true });
  const account = (id, email, name, pharmacyId, days) => ({ id, name, email, mobile: "9000000000", password_hash: hash, role: "ADMIN", pharmacy_id: pharmacyId, is_primary_admin: true, verified: true, token_version: 0, onboarding_tour: { status: "skipped", version: 1, at: now }, subscription_plan: days > 0 ? "ADVANCED" : null, subscription_expiry: days > 0 ? new Date(Date.now() + days * DAY).toISOString() : null, created_at: now });
  await db.collection("pharmacies").insertMany([
    { id: "trial-active", name: "Trial Medicals", location: "Pune", subscription: subscription(365), created_at: now },
    { id: "trial-expired", name: "Expired Medicals", location: "Pune", subscription: subscription(-5), created_at: now },
  ]);
  await db.collection("users").insertMany([account("u-active", "active@trial.test", "Asha", "trial-active", 365), account("u-expired", "expired@trial.test", "Ravi", "trial-expired", -5)]);
  const P = { pharmacy_id: "trial-active", created_at: now };
  await db.collection("suppliers").insertOne({ id: "s-1", name: "Sai Distributors", contact: "9000000001", ...P });
  await db.collection("customers").insertOne({ id: "c-1", name: "Existing Customer", mobile: "9111111111", ...P });
  const stock = [
    ["Dolo 650", "Micro Labs", "Paracetamol", "D1", 30, 20],
    ["Crocin Advance", "GSK", "Paracetamol", "C1", 25, 15],
    ["Azee 500", "Cipla", "Azithromycin", "A1", 90, 60],
  ];
  for (const [i, [name, manufacturer, salt, batch, mrp, cost]] of stock.entries()) {
    await db.collection("products").insertOne({ id: `p-${i}`, name, product_name: name, manufacturer, salt_composition: salt, category: "Tablet", units_per_pack: 1, mrp, ...P });
    await db.collection("inventory").insertOne({ id: `b-${i}`, product_id: `p-${i}`, product_name: name, manufacturer, salt_composition: salt, batch_no: batch, expiry_date: "2028-06-30", quantity: 100, available_quantity: 100, purchase_price: cost, mrp, units_per_pack: 1, ...P });
  }
  // A small made-up catalogue, not your real global data
  const medicines = [];
  for (let i = 0; i < 5000; i++) medicines.push({ name: `Trialmed ${i} Tablet`, product_name: `Trialmed ${i} Tablet`, manufacturer: "Acme", active_ingredients: "Testamol", rank_score: i % 100, s_name: `trialmed ${i} tablet`, mrp: 10 + (i % 50) });
  medicines.push({ name: "Azithral 500 Tablet", product_name: "Azithral 500 Tablet", manufacturer: "Alembic", active_ingredients: "Azithromycin", rank_score: 95, s_name: "azithral 500 tablet", mrp: 120 });
  await db.collection("global_medicines").insertMany(medicines);
  await db.collection("global_doctors").insertOne({ full_name: "Dr Meera Kulkarni", practitioner_id: 7 });
  await db.collection("global_distributors").insertOne({ agency_name: "Pune Pharma Agency", supplier_id: 9 });
  await client.close();
}

function buildWeb() {
  if (fs.existsSync(path.join(webDir, "index.html")) && !process.argv.includes("--rebuild")) return;
  console.log("Building the web app (a couple of minutes, first time only)...");
  execSync("npx craco build", {
    cwd: path.join(repo, "frontend"),
    stdio: "inherit",
    env: { ...process.env, CI: "false", BUILD_PATH: webDir, REACT_APP_BACKEND_URL: "http://localhost:18001", REACT_APP_DESKTOP_DOWNLOADS: "true", REACT_APP_DESKTOP_DOWNLOAD_URL: "http://localhost:3000/installers", GENERATE_SOURCEMAP: "false" },
  });
}

function serveWeb() {
  const types = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json", ".woff2": "font/woff2" };
  http
    .createServer((req, res) => {
      let file = path.join(webDir, path.normalize(decodeURIComponent(req.url.split("?")[0])));
      if (!file.startsWith(webDir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(webDir, "index.html");
      res.writeHead(200, { "content-type": types[path.extname(file)] || "application/octet-stream" });
      fs.createReadStream(file).pipe(res);
    })
    .listen(3000, "127.0.0.1");
}

function writeTestConfig(s) {
  fs.writeFileSync(path.join(home, "app-config.json"), JSON.stringify({ cloudUrl: "http://localhost:18001", webUrl: "http://localhost:3000", licencePublicKey: s.licencePublic, hardened: true }, null, 2));
}

(async () => {
  fs.mkdirSync(home, { recursive: true });
  const s = secrets();
  writeTestConfig(s);
  if (process.argv.includes("--config-only")) return;
  buildWeb();
  await startDatabases();
  await seed(s.password);
  fs.writeFileSync(path.join(home, "accounts.txt"), `Active subscription: active@trial.test\nExpired subscription: expired@trial.test\nPassword for both: ${s.password}\n`, { mode: 0o600 });

  const env = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    PORT: "18001",
    NODE_ENV: "test",
    MONGO_URL,
    REDIS_HOST: "127.0.0.1",
    REDIS_PORT: "6398",
    JWT_SECRET: s.jwt,
    ADMIN_PASSWORD: s.jwt,
    DESKTOP_LICENCE_PRIVATE_KEY: s.licencePrivate,
    CORS_ORIGINS: "http://localhost:3000",
  };
  const log = fs.openSync(path.join(home, "cloud.log"), "a");
  const cloud = spawn("node", [path.join(backend, "server.js")], { cwd: home, env, stdio: ["ignore", log, log] });
  const stop = () => {
    cloud.kill();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  cloud.on("exit", (code) => console.log(`Cloud stopped (${code}). This is how to test "internet lost": it also happens if you stop this script.`));
  serveWeb();
  console.log(`\nTest cloud ready.\nWeb app: http://localhost:3000\nAccounts: ${path.join(home, "accounts.txt")}\nPress Ctrl+C to stop it. The desktop app then behaves as if the internet is gone.\n`);
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
