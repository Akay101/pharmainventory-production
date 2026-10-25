const { spawn } = require("child_process");
const net = require("net");
const fs = require("fs");
const path = require("path");
const os = require("os");

const LOCAL_TUNNEL_PORT = 27019;
const REMOTE_HOST = "api.davadesk.in";
const REMOTE_USER = "ubuntu";
const REMOTE_PORT = 27017;

// Possible SSH key locations
const POSSIBLE_KEYS = [
  path.join(os.homedir(), ".ssh", "LightsailDefaultKey-ap-south-1.pem"),
  path.join(os.homedir(), ".ssh", "id_rsa"),
  path.join(os.homedir(), ".ssh", "id_ed25519"),
];

function findSshKey() {
  for (const keyPath of POSSIBLE_KEYS) {
    if (fs.existsSync(keyPath)) {
      return keyPath;
    }
  }
  return null;
}

function checkPortOpen(port, host = "127.0.0.1", timeoutMs = 1200) {
  return new Promise((resolve) => {
    const socket = new net.Socket();

    socket.setTimeout(timeoutMs);

    socket.on("connect", () => {
      socket.destroy();
      resolve(true);
    });

    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });

    socket.on("error", () => {
      socket.destroy();
      resolve(false);
    });

    socket.connect(port, host);
  });
}

let tunnelProcess = null;

async function ensureSshTunnel() {
  // 1. Check if tunnel is already listening
  const alreadyOpen = await checkPortOpen(LOCAL_TUNNEL_PORT);
  if (alreadyOpen) {
    return true;
  }

  // 2. Find SSH key
  const keyPath = findSshKey();
  if (!keyPath) {
    console.warn("[SSH Tunnel] No Lightsail SSH key found in ~/.ssh. Skipping auto-tunnel.");
    return false;
  }

  console.log(`[SSH Tunnel] Establishing tunnel to ${REMOTE_HOST} via ${path.basename(keyPath)} on port ${LOCAL_TUNNEL_PORT}...`);

  return new Promise((resolve) => {
    try {
      const args = [
        "-N",
        "-L",
        `${LOCAL_TUNNEL_PORT}:127.0.0.1:${REMOTE_PORT}`,
        "-i",
        keyPath,
        "-o",
        "StrictHostKeyChecking=no",
        "-o",
        "ExitOnForwardFailure=yes",
        "-o",
        "ServerAliveInterval=30",
        "-o",
        "ServerAliveCountMax=3",
        `${REMOTE_USER}@${REMOTE_HOST}`,
      ];

      tunnelProcess = spawn("ssh", args, {
        detached: true,
        stdio: "ignore",
      });

      tunnelProcess.unref();

      // Wait for port to become available
      let attempts = 0;
      const interval = setInterval(async () => {
        attempts++;
        const isOpen = await checkPortOpen(LOCAL_TUNNEL_PORT);
        if (isOpen) {
          clearInterval(interval);
          console.log(`[SSH Tunnel] Successfully established on 127.0.0.1:${LOCAL_TUNNEL_PORT}!`);
          resolve(true);
        } else if (attempts > 12) {
          clearInterval(interval);
          console.warn("[SSH Tunnel] Tunnel spawn timed out after 6s.");
          resolve(false);
        }
      }, 500);
    } catch (err) {
      console.error("[SSH Tunnel] Error spawning tunnel:", err.message);
      resolve(false);
    }
  });
}

module.exports = {
  LOCAL_TUNNEL_PORT,
  checkPortOpen,
  ensureSshTunnel,
};
