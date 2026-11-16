// Optional: lets other counters in the shop use this computer's data. Off until
// the owner turns it on. Traffic is TLS with a certificate made on this computer;
// a counter proves it knows the pairing code, and checks that the code holder
// owns the certificate it is talking to, before either side trusts the other.
const crypto = require("crypto");
const dgram = require("dgram");
const https = require("https");
const os = require("os");

const LAN_PORT = 47811;
const DISCOVERY_PORT = 47812;
const DISCOVERY_REQUEST = "DAVADESK_DISCOVER_1";
const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;

const hmac = (code, text) => crypto.createHmac("sha256", code).update(text).digest("hex");
const clientProof = (code, nonce, fingerprint) => hmac(code, `client:${nonce}:${fingerprint}`);
const serverProof = (code, nonce, fingerprint) => hmac(code, `server:${nonce}:${fingerprint}`);
const safeEqual = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

function localAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const addr of list || []) {
      if (addr.family === "IPv4" && !addr.internal) out.push(addr.address);
    }
  }
  return out;
}

function create({ db, app, sha256, log, getShopName }) {
  let httpsServer = null;
  let udp = null;
  let fingerprint = null;
  let pairing = null; // { code, expires, attempts }

  async function certificate() {
    const saved = db.getMeta("lan_certificate");
    if (saved) return JSON.parse(saved);
    const selfsigned = require("selfsigned");
    const notAfterDate = new Date();
    notAfterDate.setFullYear(notAfterDate.getFullYear() + 20);
    const pems = await selfsigned.generate([{ name: "commonName", value: "DavaDesk shop server" }], { keySize: 2048, algorithm: "sha256", notAfterDate });
    const cert = { key: pems.private, cert: pems.cert };
    db.setMeta("lan_certificate", JSON.stringify(cert));
    return cert;
  }

  const newCode = () => {
    pairing = { code: String(crypto.randomInt(0, 1000000)).padStart(6, "0"), expires: Date.now() + CODE_TTL_MS, attempts: 0 };
    return pairing.code;
  };

  const startDiscovery = () =>
    new Promise((resolve) => {
      udp = dgram.createSocket({ type: "udp4", reuseAddr: true });
      udp.on("message", async (msg, rinfo) => {
        if (msg.toString() !== DISCOVERY_REQUEST) return;
        const reply = JSON.stringify({ app: "davadesk", name: await getShopName(), port: LAN_PORT, fingerprint, computer: os.hostname() });
        udp?.send(reply, rinfo.port, rinfo.address);
      });
      // Discovery is a convenience: typing the address still works without it
      udp.on("error", (err) => {
        log.warn("[LAN] discovery:", err.message);
        resolve();
      });
      udp.bind(DISCOVERY_PORT, resolve);
    });

  async function enable() {
    if (httpsServer) return status();
    const { key, cert } = await certificate();
    fingerprint = new crypto.X509Certificate(cert).fingerprint256;
    httpsServer = https.createServer({ key, cert }, app);
    await new Promise((resolve, reject) => {
      httpsServer.once("error", (err) => {
        httpsServer = null;
        reject(err);
      });
      httpsServer.listen(LAN_PORT, "0.0.0.0", resolve);
    });
    await startDiscovery();
    newCode();
    return status();
  }

  async function disable() {
    pairing = null;
    if (udp) {
      udp.close();
      udp = null;
    }
    if (httpsServer) {
      const s = httpsServer;
      httpsServer = null;
      await new Promise((resolve) => {
        s.close(resolve);
        s.closeAllConnections?.();
      });
    }
  }

  async function status() {
    const devices = await db.collection("desktop_devices").find({ revoked_at: null }, { projection: { _id: 0, id: 1, name: 1, created_at: 1 } }).sort({ created_at: 1 }).toArray();
    return {
      enabled: !!httpsServer,
      addresses: localAddresses(),
      port: LAN_PORT,
      code: pairing && pairing.expires > Date.now() ? pairing.code : null,
      devices,
    };
  }

  async function revoke(id) {
    await db.collection("desktop_devices").updateOne({ id }, { $set: { revoked_at: new Date().toISOString() } });
    return status();
  }

  // POST /api/desktop/pair { nonce, proof, name }
  async function pairRoute(req, res, next) {
    try {
      const { nonce, proof, name } = req.body || {};
      if (!httpsServer || !pairing || pairing.expires < Date.now()) {
        return res.status(403).json({ code: "PAIRING_CLOSED", detail: "Pairing code has expired. Create a new one on the main computer." });
      }
      if (typeof nonce !== "string" || nonce.length < 16 || typeof proof !== "string") {
        return res.status(400).json({ detail: "Invalid pairing request" });
      }
      if (!safeEqual(proof, clientProof(pairing.code, nonce, fingerprint))) {
        pairing.attempts++;
        const remaining = MAX_CODE_ATTEMPTS - pairing.attempts;
        if (remaining <= 0) pairing = null;
        return res.status(401).json({
          code: "WRONG_CODE",
          detail: remaining > 0 ? "That code isn't right. Check the main computer and try again." : "Too many wrong tries. Create a new code on the main computer.",
        });
      }
      const token = crypto.randomBytes(32).toString("base64url");
      const reply = serverProof(pairing.code, nonce, fingerprint);
      await db.collection("desktop_devices").insertOne({
        id: crypto.randomUUID(),
        name: String(name || "Counter").slice(0, 80),
        token_hash: sha256(token),
        revoked_at: null,
        created_at: new Date().toISOString(),
      });
      pairing = null; // one code, one counter
      res.json({ token, proof: reply, shop: await getShopName() });
    } catch (err) {
      next(err);
    }
  }

  return { enable, disable, status, revoke, newCode: async () => (newCode(), status()), pairRoute };
}

module.exports = { create, clientProof, serverProof, LAN_PORT, DISCOVERY_PORT, DISCOVERY_REQUEST };
