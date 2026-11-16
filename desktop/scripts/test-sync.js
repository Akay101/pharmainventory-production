// Runs the sync tests against a private copy of the cloud: its own MongoDB and Redis
// in Docker, and the real backend with no .env, so it can't reach anything else.
const { spawn, spawnSync } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.join(__dirname, "..");
const backendDir = path.join(root, "..", "backend-node");
const MONGO = "dd-test-mongo";
const REDIS = "dd-test-redis";
const docker = (...args) => spawnSync("docker", args, { encoding: "utf8" });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function startDatabases() {
  docker("rm", "-f", MONGO, REDIS);
  docker("run", "-d", "--name", MONGO, "-p", "127.0.0.1:27099:27017", "mongo:7", "--replSet", "rs0", "--bind_ip_all");
  docker("run", "-d", "--name", REDIS, "-p", "127.0.0.1:6399:6379", "redis:7-alpine");
  for (let i = 0; i < 60; i++) {
    const r = docker("exec", MONGO, "mongosh", "--quiet", "--eval", "try{rs.status().ok}catch(e){rs.initiate({_id:'rs0',members:[{_id:0,host:'127.0.0.1:27017'}]}).ok}");
    const hello = docker("exec", MONGO, "mongosh", "--quiet", "--eval", "db.hello().isWritablePrimary");
    if (r.status === 0 && hello.stdout.trim() === "true") return;
    await wait(1000);
  }
  throw new Error("Test MongoDB didn't start");
}

(async () => {
  await startDatabases();
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const privatePem = privateKey.export({ type: "pkcs8", format: "pem" });
  const JWT_SECRET = crypto.randomBytes(32).toString("hex");
  const cloudDir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-cloud-"));
  const env = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    PORT: "18001",
    NODE_ENV: "test",
    MONGO_URL: "mongodb://127.0.0.1:27099/ddtest?directConnection=true",
    REDIS_HOST: "127.0.0.1",
    REDIS_PORT: "6399",
    JWT_SECRET,
    ADMIN_PASSWORD: "test-only",
    DESKTOP_LICENCE_PRIVATE_KEY: Buffer.from(privatePem).toString("base64"),
    RATE_LIMIT_SCALE: "100",
  };
  // Started from an empty folder, so the developer's .env is not read
  const cloud = spawn("node", [path.join(backendDir, "server.js")], { cwd: cloudDir, env, stdio: ["ignore", fs.openSync(path.join(cloudDir, "cloud.log"), "a"), fs.openSync(path.join(cloudDir, "cloud.log"), "a")] });
  let code = 1;
  try {
    for (let i = 0; i < 60; i++) {
      try {
        if ((await fetch("http://127.0.0.1:18001/health")).ok) break;
      } catch {}
      await wait(500);
    }
    const electron = path.join(root, "node_modules", ".bin", "electron");
    const run = spawnSync(electron, ["--test", path.join(root, "test", "sync.test.js")], {
      stdio: "inherit",
      cwd: root,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1",
        DD_TEST_CLOUD: "http://127.0.0.1:18001",
        DD_TEST_MONGO: "mongodb://127.0.0.1:27099/ddtest?directConnection=true",
        DD_TEST_JWT: JWT_SECRET,
        DD_TEST_PUBLIC_KEY: publicKey.export({ type: "spki", format: "pem" }),
      },
    });
    code = run.status;
  } finally {
    cloud.kill();
    if (code !== 0) console.log("Cloud log:\n" + fs.readFileSync(path.join(cloudDir, "cloud.log"), "utf8").slice(-3000));
    docker("rm", "-f", MONGO, REDIS);
    fs.rmSync(cloudDir, { recursive: true, force: true });
  }
  process.exit(code);
})().catch((err) => {
  console.error(err);
  docker("rm", "-f", MONGO, REDIS);
  process.exit(1);
});
