// Abuse and cost protection for AI scans, shared by every API container
// through Redis:
//   - per-user burst limit (scans per minute)
//   - per-pharmacy daily quota
//   - per-pharmacy cap on queued/processing invoice scans
//   - result cache, so re-submitting the same photos costs nothing
// If Redis is unavailable the guard fails open (logs and allows) rather than
// taking scanning down with it.
const { connection: redis } = require("./queue");

const LIMITS = {
  userPerMinute: () => parseInt(process.env.SCAN_USER_PER_MIN || "30", 10),
  pharmacyPerDay: () => parseInt(process.env.SCAN_PHARMACY_PER_DAY || "1500", 10),
  pharmacyInflight: () => parseInt(process.env.SCAN_PHARMACY_INFLIGHT || "5", 10),
};
const CACHE_TTL_S = 15 * 60;
const INFLIGHT_STALE_MS = 5 * 60 * 1000;

const istDay = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10).replace(/-/g, "");

class ScanLimitError extends Error {
  constructor(message, retryAfter) {
    super(message);
    this.status = 429;
    this.retryAfter = retryAfter;
  }
}

// The queue's Redis connection retries forever by design (BullMQ needs that),
// so guard calls get their own short deadline.
async function safe(fn, fallback) {
  let timer;
  try {
    return await Promise.race([
      fn(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), 1500);
      }),
    ]);
  } catch (err) {
    console.warn("[scanGuard] Redis unavailable, allowing scan:", err.message);
    return fallback;
  } finally {
    clearTimeout(timer);
  }
}

// Counts one scan against the user's per-minute and the pharmacy's daily
// allowance. Throws ScanLimitError when either is exhausted.
async function consume({ userId, pharmacyId }) {
  const minute = Math.floor(Date.now() / 60000);
  const uKey = `scan:u:${userId}:${minute}`;
  const pKey = `scan:p:${pharmacyId}:${istDay()}`;
  const counts = await safe(async () => {
    const res = await redis.multi().incr(uKey).expire(uKey, 70).incr(pKey).expire(pKey, 26 * 3600).exec();
    return { user: res[0][1], pharmacy: res[2][1] };
  }, null);
  if (!counts) return;
  if (counts.user > LIMITS.userPerMinute()) {
    throw new ScanLimitError("You're scanning too fast. Wait a few seconds and try again.", 60 - (Math.floor(Date.now() / 1000) % 60));
  }
  if (counts.pharmacy > LIMITS.pharmacyPerDay()) {
    throw new ScanLimitError("Your pharmacy has reached today's AI scan limit. It resets at midnight.", 3600);
  }
}

const inflightKey = (pharmacyId) => `scan:inflight:${pharmacyId}`;

// Reserves a slot for a queued invoice scan; released by the worker
async function reserveInflight(pharmacyId, jobId) {
  const ok = await safe(async () => {
    const key = inflightKey(pharmacyId);
    const now = Date.now();
    const res = await redis.multi().zremrangebyscore(key, 0, now - INFLIGHT_STALE_MS).zcard(key).exec();
    if (res[1][1] >= LIMITS.pharmacyInflight()) return false;
    await redis.multi().zadd(key, now, jobId).expire(key, 600).exec();
    return true;
  }, true);
  if (!ok) throw new ScanLimitError("A few scans are already processing for your pharmacy. Please wait for them to finish.", 10);
}

async function releaseInflight(pharmacyId, jobId) {
  await safe(() => redis.zrem(inflightKey(pharmacyId), jobId), null);
}

const cacheKey = (pharmacyId, kind, hash) => `scan:cache:${pharmacyId}:${kind}:${hash}`;

async function getCached(pharmacyId, kind, hash) {
  const raw = await safe(() => redis.get(cacheKey(pharmacyId, kind, hash)), null);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function setCached(pharmacyId, kind, hash, value) {
  await safe(() => redis.set(cacheKey(pharmacyId, kind, hash), JSON.stringify(value), "EX", CACHE_TTL_S), null);
}

module.exports = { consume, reserveInflight, releaseInflight, getCached, setCached, ScanLimitError };
