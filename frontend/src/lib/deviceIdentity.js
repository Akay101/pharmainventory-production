// This browser's device key, used to prove which device a sign-in belongs to.
//
// A P-256 key pair is made once with WebCrypto as non-extractable and kept in
// IndexedDB: this page can sign with it, but the private key can't be read or
// copied anywhere. Sign-in, "continue here" and every token refresh send a
// fresh signature (X-Device-Proof) together with what the browser reports
// about the device (touch, pointer, screen, graphics). The server decides from
// that whether this is a computer or a phone (each user gets one of each)
// and binds the session to the key. See backend services/auth/deviceProof.js.
const DB_NAME = "davadesk-device";
const STORE = "keys";
const KEY_ID = "signing-v1";

let keyPromise = null;
let clockOffset = 0; // server time - local time, learned from DEVICE_CLOCK replies

export const setServerTime = (serverMs) => {
  if (Number.isFinite(serverMs)) clockOffset = serverMs - Date.now();
};

const b64url = (buf) => {
  const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf;
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const b64urlText = (text) => b64url(new TextEncoder().encode(text));

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
const idb = (db, mode, fn) =>
  new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const r = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(r?.result);
    tx.onerror = () => reject(tx.error);
  });

async function loadOrCreateKey() {
  const subtle = window.crypto?.subtle;
  if (!subtle || typeof indexedDB === "undefined") return null;
  const db = await openDb();
  let pair = await idb(db, "readonly", (s) => s.get(KEY_ID));
  if (!pair?.privateKey || !pair?.publicJwk) {
    const made = await subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"]);
    const jwk = await subtle.exportKey("jwk", made.publicKey);
    pair = { privateKey: made.privateKey, publicJwk: { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y }, created_at: Date.now() };
    await idb(db, "readwrite", (s) => s.put(pair, KEY_ID));
  }
  db.close();
  const thumb = await subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify({ crv: pair.publicJwk.crv, kty: pair.publicJwk.kty, x: pair.publicJwk.x, y: pair.publicJwk.y })));
  return { ...pair, kid: b64url(thumb) };
}

const getKey = () => {
  if (!keyPromise) keyPromise = loadOrCreateKey().catch(() => null);
  return keyPromise;
};

let gpuName;
function gpu() {
  if (gpuName !== undefined) return gpuName;
  gpuName = null;
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    if (gl) {
      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      gpuName = String((ext && gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) || gl.getParameter(gl.RENDERER) || "").slice(0, 160) || null;
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    }
  } catch {
    gpuName = null;
  }
  return gpuName;
}

function signals() {
  const mq = (q) => {
    try {
      return window.matchMedia(q).matches;
    } catch {
      return false;
    }
  };
  return {
    touch: navigator.maxTouchPoints || 0,
    coarse: mq("(pointer: coarse)"),
    hover: mq("(hover: hover)"),
    sw: window.screen?.width || 0,
    sh: window.screen?.height || 0,
    dpr: window.devicePixelRatio || 1,
    gpu: gpu(),
    uam: typeof navigator.userAgentData?.mobile === "boolean" ? navigator.userAgentData.mobile : null,
    plat: navigator.userAgentData?.platform || navigator.platform || null,
    cores: navigator.hardwareConcurrency || null,
    mem: navigator.deviceMemory || null,
  };
}

const sha256Hex = async (text) => {
  const d = await window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
};

/**
 * The X-Device-Proof header value for an action ("login", "continue",
 * "refresh"), or null when this browser can't hold a key (very old browsers,
 * or a page not served over HTTPS). Without it the sign-in counts as a
 * computer and isn't bound to the device.
 */
export async function deviceProof(action) {
  try {
    const key = await getKey();
    if (!key) return null;
    const signalsRaw = b64urlText(JSON.stringify(signals()));
    const ts = Date.now() + clockOffset;
    const msg = `dd-device-proof|v1|${action}|${ts}|${key.kid}|${await sha256Hex(signalsRaw)}`;
    const sig = await window.crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key.privateKey, new TextEncoder().encode(msg));
    return b64urlText(JSON.stringify({ v: 1, jwk: key.publicJwk, ts, sig: b64url(sig), signals: signalsRaw }));
  } catch {
    return null;
  }
}

// Which auth calls carry a proof, and for which action
export function proofActionFor(url = "") {
  const path = String(url).split("?")[0];
  if (/\/auth\/login\/continue$/.test(path)) return "continue";
  if (/\/auth\/(login|verify-otp)$/.test(path)) return "login";
  if (/\/auth\/refresh$/.test(path)) return "refresh";
  return null;
}
