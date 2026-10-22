// Assistant usage limits (shared across API containers through Redis):
//   - per-user burst: ASSISTANT_USER_PER_MIN (default 20)
//   - per-pharmacy daily: ASSISTANT_PHARMACY_PER_DAY (default 2000)
//   - one turn at a time per chat (a second send waits for the first)
// Redis trouble fails open so the assistant keeps working.
const { connection: redis } = require("../ai/queue");

class LimitError extends Error {
  constructor(message) {
    super(message);
    this.status = 429;
    this.code = "ASSISTANT_LIMIT";
  }
}

async function safe(fn, fallback) {
  let timer;
  try {
    return await Promise.race([fn(), new Promise((_, rej) => (timer = setTimeout(() => rej(new Error("timeout")), 1500)))]);
  } catch (err) {
    console.warn("[assistant limits] Redis unavailable:", err.message);
    return fallback;
  } finally {
    clearTimeout(timer);
  }
}

const istDay = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10).replace(/-/g, "");

async function consume(user) {
  const minute = Math.floor(Date.now() / 60000);
  const u = `asst:u:${user.id}:${minute}`;
  const p = `asst:p:${user.pharmacy_id}:${istDay()}`;
  const counts = await safe(async () => {
    const r = await redis.multi().incr(u).expire(u, 70).incr(p).expire(p, 26 * 3600).exec();
    return { user: r[0][1], pharmacy: r[2][1] };
  }, null);
  if (!counts) return;
  if (counts.user > parseInt(process.env.ASSISTANT_USER_PER_MIN || "20", 10)) throw new LimitError("You're sending messages too fast. Please wait a few seconds.");
  if (counts.pharmacy > parseInt(process.env.ASSISTANT_PHARMACY_PER_DAY || "2000", 10)) throw new LimitError("Your pharmacy has reached today's assistant limit. It resets at midnight.");
}

// Serialises turns within one chat; waits briefly, then gives up
async function lock(conversationId, { waitMs = 8000, ttlS = 120 } = {}) {
  const key = `asst:lock:${conversationId}`;
  const token = `${process.pid}-${Date.now()}-${Math.random()}`;
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    const ok = await safe(() => redis.set(key, token, "EX", ttlS, "NX"), "OK");
    if (ok === "OK") {
      return {
        release: () =>
          safe(() => redis.eval("if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end", 1, key, token), null),
      };
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new LimitError("Still working on your previous message in this chat. Please wait.");
}

module.exports = { consume, lock, LimitError };
