// Per-account failure counters (shared across containers via Mongo).
// Complements the per-IP express-rate-limit: an attacker rotating IPs still
// hits the per-account lock.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

async function lockStatus(db, key) {
  const doc = await db.collection("auth_attempts").findOne({ key });
  if (!doc || !doc.locked_until || new Date(doc.locked_until) <= new Date()) return { locked: false };
  return { locked: true, retryAfter: Math.ceil((new Date(doc.locked_until) - Date.now()) / 1000) };
}

async function recordFailure(db, key) {
  const now = new Date();
  const col = db.collection("auth_attempts");
  const doc = await col.findOne({ key });
  const fresh = !doc || now - new Date(doc.window_start) > WINDOW_MS;
  const failures = fresh ? 1 : (doc.failures || 0) + 1;
  const update = {
    key,
    failures,
    window_start: fresh ? now : doc.window_start,
    expires_at: new Date(now.getTime() + WINDOW_MS),
  };
  if (failures >= MAX_FAILURES) update.locked_until = new Date(now.getTime() + WINDOW_MS);
  await col.updateOne({ key }, { $set: update }, { upsert: true });
  return { failures, locked: failures >= MAX_FAILURES };
}

async function clearFailures(db, key) {
  await db.collection("auth_attempts").deleteOne({ key });
}

module.exports = { lockStatus, recordFailure, clearFailures, MAX_FAILURES };
