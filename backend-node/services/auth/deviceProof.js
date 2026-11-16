// Device identity for sign-in sessions.
//
// Each browser makes an ECDSA P-256 key pair with WebCrypto, marked
// non-extractable, and keeps it in IndexedDB: page scripts can sign with it
// but nobody can read the private key out, so the device id (a hash of the
// public key) can't be copied to another machine. Sign-in, refresh and
// "continue here" send a fresh signature over the action, a timestamp and the
// device signals; the server checks it, refuses replays, and binds the
// session to that key, so a stolen refresh cookie is useless elsewhere.
//
// Device class (computer or phone) decides which of the user's two login
// slots a session takes. It is decided here from several signals that must
// all agree (user agent, client hints, touch, pointer, screen, GPU); a key
// once seen as a real computer stays one. Browser emulators change the
// user agent and touch but not the GPU, so a computer pretending to be a
// phone stays a computer. Anything without a valid key proof counts as a
// computer. A native mobile app can use the same protocol later, with
// platform attestation added on top.
const crypto = require("crypto");

const DEVICES = "auth_devices";
const PROOFS = "device_proofs";
const MAX_SKEW_MS = 10 * 60 * 1000;
const SLOTS = ["pc", "mobile"];
const SLOT_LABEL = { pc: "computer", mobile: "phone" };

const sha256 = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");
const b64urlJson = (raw) => {
  try {
    const s = String(raw || "");
    if (!s || s.length > 4096) return null;
    return JSON.parse(Buffer.from(s, "base64url").toString("utf8"));
  } catch {
    return null;
  }
};

const B64URL = /^[A-Za-z0-9_-]+$/;
function cleanJwk(j) {
  if (!j || j.kty !== "EC" || j.crv !== "P-256") return null;
  if (typeof j.x !== "string" || typeof j.y !== "string" || !B64URL.test(j.x) || !B64URL.test(j.y)) return null;
  if (j.x.length !== 43 || j.y.length !== 43) return null;
  return { kty: "EC", crv: "P-256", x: j.x, y: j.y };
}
// RFC 7638 thumbprint of the public key
const kidOf = (jwk) => crypto.createHash("sha256").update(JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y })).digest("base64url");

// What the browser reports about itself (all checked for consistency, never trusted alone)
function cleanSignals(s) {
  if (!s || typeof s !== "object") return {};
  const num = (v, max) => (Number.isFinite(Number(v)) ? Math.max(0, Math.min(max, Number(v))) : null);
  const str = (v, n) => (typeof v === "string" ? v.slice(0, n) : null);
  return {
    touch: num(s.touch, 64),
    coarse: s.coarse === true,
    hover: s.hover === true,
    sw: num(s.sw, 20000),
    sh: num(s.sh, 20000),
    dpr: num(s.dpr, 10),
    gpu: str(s.gpu, 160),
    uam: typeof s.uam === "boolean" ? s.uam : null, // navigator.userAgentData.mobile
    plat: str(s.plat, 40),
    cores: num(s.cores, 256),
    mem: num(s.mem, 1024),
  };
}

// The signed message: action, time, key and the exact signals sent
const message = (action, ts, kid, signalsRaw) => `dd-device-proof|v1|${action}|${ts}|${kid}|${sha256(signalsRaw || "")}`;

const DESKTOP_GPU = /NVIDIA|GeForce|Quadro|RTX|Radeon|\bAMD\b|Intel|Iris|UHD Graphics|HD Graphics|Direct3D|D3D1[12]|Apple M\d|Metal Renderer: Apple M|llvmpipe|SwiftShader|Microsoft Basic|VMware|VirtualBox|Parallels/i;
const MOBILE_GPU = /Adreno|Mali|PowerVR|Apple GPU|Xclipse|Immortalis|Maleoon|Tegra|Vivante|VideoCore|IMG BXM|\bGE8\d{3}\b/i;

function uaClass(ua, signals) {
  const s = String(ua || "");
  if (/iPhone|iPod/.test(s) || /Android.+Mobile|Mobile.+Android/.test(s) || /Windows Phone|IEMobile/.test(s)) return "mobile";
  if (/iPad|Tablet|Android/.test(s)) return "tablet";
  // iPadOS Safari reports a Mac; only a touch screen tells it apart
  if (/Macintosh/.test(s) && (signals.touch || 0) > 1) return "tablet";
  return "desktop";
}

/**
 * Computer or phone. A phone needs every signal to agree; anything doubtful
 * is a computer. Returns { slot, reasons } (reasons explain a "pc" verdict).
 */
function classify(req, signals) {
  const ua = req.headers["user-agent"] || "";
  const kind = uaClass(ua, signals);
  const reasons = [];
  if (kind === "desktop") return { slot: "pc", kind, reasons: ["desktop browser"] };
  const ch = String(req.headers["sec-ch-ua-mobile"] || "");
  if (ch && kind === "mobile" && ch !== "?1") reasons.push("client hints say not mobile");
  if (signals.uam === false && kind === "mobile") reasons.push("browser says not mobile");
  if (signals.uam === true && ch === "?0") reasons.push("hints disagree");
  if (!(signals.touch >= 1)) reasons.push("no touch screen");
  if (!signals.coarse) reasons.push("no touch pointer");
  if (!signals.gpu) reasons.push("graphics unknown");
  else if (DESKTOP_GPU.test(signals.gpu) || !MOBILE_GPU.test(signals.gpu)) reasons.push("computer graphics");
  const short = Math.min(signals.sw || 0, signals.sh || 0);
  if (!short || short > 1366) reasons.push("screen too large");
  return { slot: reasons.length ? "pc" : "mobile", kind, reasons };
}

/**
 * Check the X-Device-Proof header for an action ("login", "refresh",
 * "continue"). Returns { ok:true, kid, jwk, signals } or { ok:false, code }.
 * A replayed signature is refused.
 */
async function verify(db, req, action) {
  const proof = b64urlJson(req.headers["x-device-proof"]);
  if (!proof) return { ok: false, code: "DEVICE_PROOF_MISSING" };
  const jwk = cleanJwk(proof.jwk);
  const ts = Number(proof.ts);
  const sig = typeof proof.sig === "string" && B64URL.test(proof.sig) && proof.sig.length <= 100 ? proof.sig : null;
  if (!jwk || !sig || !Number.isFinite(ts)) return { ok: false, code: "DEVICE_PROOF_INVALID" };
  if (Math.abs(Date.now() - ts) > MAX_SKEW_MS) return { ok: false, code: "DEVICE_PROOF_STALE" };
  const kid = kidOf(jwk);
  const signalsRaw = typeof proof.signals === "string" ? proof.signals : "";
  let good = false;
  try {
    const key = crypto.createPublicKey({ key: jwk, format: "jwk" });
    good = crypto.verify("sha256", Buffer.from(message(action, ts, kid, signalsRaw)), { key, dsaEncoding: "ieee-p1363" }, Buffer.from(sig, "base64url"));
  } catch {
    good = false;
  }
  if (!good) return { ok: false, code: "DEVICE_PROOF_INVALID" };
  try {
    await db.collection(PROOFS).insertOne({ _id: sha256(sig), kid, action, at: new Date(), expires_at: new Date(Date.now() + 2 * MAX_SKEW_MS) });
  } catch (err) {
    if (err.code === 11000) return { ok: false, code: "DEVICE_PROOF_REPLAYED" };
    throw err;
  }
  return { ok: true, kid, jwk, signals: cleanSignals(b64urlJson(signalsRaw)) };
}

/**
 * Who is this device? Verifies the proof (if any), registers the key on first
 * sight and returns its locked class:
 * { key, kid|null, bound, slot, kind, proof_code }
 */
async function identify(db, req, action) {
  const proof = await verify(db, req, action);
  if (!proof.ok) {
    // No usable key: an unbound device, always in the computer slot
    const raw = String(req.headers["x-device-id"] || "");
    const key = /^[A-Za-z0-9_-]{16,64}$/.test(raw) ? sha256(`dd-device:${raw}`) : null;
    return { key, kid: null, bound: false, slot: "pc", kind: "unknown", proof_code: proof.code };
  }
  const verdict = classify(req, proof.signals);
  const now = new Date();
  const prev = await db.collection(DEVICES).findOne({ kid: proof.kid }, { projection: { _id: 0, slot: 1, kind: 1, locked: 1 } });
  // A key once seen as a real computer (desktop browser or computer
  // graphics) stays a computer; otherwise it is re-checked on each sign-in,
  // so a phone that was misread once (say, graphics hidden) can recover.
  const locked = prev?.locked || (verdict.slot === "pc" && verdict.reasons.some((r) => r === "desktop browser" || r === "computer graphics"));
  const slot = prev?.locked ? prev.slot : verdict.slot;
  await db.collection(DEVICES).updateOne(
    { kid: proof.kid },
    {
      $setOnInsert: { kid: proof.kid, jwk: proof.jwk, first_signals: proof.signals, first_ua: String(req.headers["user-agent"] || "").slice(0, 300), created_at: now },
      $set: { slot, kind: verdict.kind, locked: !!locked, reasons: verdict.reasons, last_seen_at: now, last_signals: proof.signals },
    },
    { upsert: true }
  );
  return { key: `kid:${proof.kid}`, kid: proof.kid, bound: true, slot: SLOTS.includes(slot) ? slot : "pc", kind: verdict.kind, reasons: verdict.reasons, proof_code: null };
}

module.exports = { DEVICES, PROOFS, SLOTS, SLOT_LABEL, verify, identify, classify, uaClass, message, kidOf, cleanSignals };
