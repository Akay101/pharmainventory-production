// How a counter finds and joins the main computer.
const crypto = require("crypto");
const dgram = require("dgram");
const https = require("https");
const os = require("os");
const { clientProof, serverProof, LAN_PORT, DISCOVERY_PORT, DISCOVERY_REQUEST } = require("../server/lan");

function broadcastAddresses() {
  const out = new Set(["255.255.255.255"]);
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family !== "IPv4" || a.internal) continue;
      const ip = a.address.split(".").map(Number);
      const mask = a.netmask.split(".").map(Number);
      out.add(ip.map((b, i) => (b | ~mask[i]) & 255).join("."));
    }
  }
  return [...out];
}

// Asks the local network who is a DavaDesk main computer
function discover(waitMs = 1500) {
  return new Promise((resolve) => {
    const found = new Map();
    const socket = dgram.createSocket("udp4");
    const finish = () => {
      try {
        socket.close();
      } catch {}
      resolve([...found.values()]);
    };
    socket.on("error", finish);
    socket.on("message", (msg, rinfo) => {
      try {
        const info = JSON.parse(msg.toString());
        if (info.app === "davadesk" && !found.has(rinfo.address)) found.set(rinfo.address, { host: rinfo.address, port: info.port, name: info.name, computer: info.computer });
      } catch {}
    });
    socket.bind(0, () => {
      socket.setBroadcast(true);
      for (const addr of broadcastAddresses()) socket.send(DISCOVERY_REQUEST, DISCOVERY_PORT, addr, () => {});
      setTimeout(finish, waitMs);
    });
  });
}

const friendly = (err) => {
  if (err.code === "ECONNREFUSED") return "That computer isn't accepting counters. Turn on \"Main computer\" there first.";
  if (err.code === "ETIMEDOUT" || err.code === "EHOSTUNREACH" || err.code === "ENETUNREACH" || err.code === "ENOTFOUND") return "Couldn't reach that computer. Check the address and that both are on the same network.";
  return err.message;
};

// The certificate is what the counter will trust from now on, so the exchange
// below checks both ways that the same code was used against this certificate.
function pair({ host, port = LAN_PORT, code, name }) {
  return new Promise((resolve, reject) => {
    const nonce = crypto.randomBytes(24).toString("hex");
    const fail = (err) => reject(new Error(friendly(err)));
    const agent = new https.Agent({ rejectUnauthorized: false, maxCachedSessions: 0 });
    const probe = https.request({ host, port, path: "/health", agent, timeout: 6000 }, (res) => {
      const fingerprint = res.socket.getPeerCertificate().fingerprint256;
      res.resume();
      const body = JSON.stringify({ nonce, proof: clientProof(code, nonce, fingerprint), name });
      const req = https.request(
        { host, port, path: "/api/desktop/pair", method: "POST", agent, timeout: 8000, headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body) } },
        (reply) => {
          const replyFingerprint = reply.socket.getPeerCertificate().fingerprint256;
          let text = "";
          reply.on("data", (c) => (text += c));
          reply.on("end", () => {
            agent.destroy();
            let data = {};
            try {
              data = JSON.parse(text);
            } catch {}
            if (reply.statusCode !== 200) return reject(new Error(data.detail || "Couldn't connect to that computer."));
            if (replyFingerprint !== fingerprint) return reject(new Error("The main computer's identity changed during connection."));
            if (data.proof !== serverProof(code, nonce, fingerprint)) return reject(new Error("Couldn't verify the main computer. Try a new code."));
            resolve({ host, port, fingerprint, token: data.token, shop: data.shop });
          });
        }
      );
      req.on("error", fail);
      req.on("timeout", () => req.destroy(Object.assign(new Error("timed out"), { code: "ETIMEDOUT" })));
      req.end(body);
    });
    probe.on("error", fail);
    probe.on("timeout", () => probe.destroy(Object.assign(new Error("timed out"), { code: "ETIMEDOUT" })));
    probe.end();
  });
}

module.exports = { discover, pair };
