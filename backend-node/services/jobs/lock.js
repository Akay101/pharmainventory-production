// Lease-based job lock in Mongo so a cron job runs on exactly one API
// container, including the overlap window of a blue/green deploy.
const os = require("os");

const OWNER = `${os.hostname()}:${process.pid}`;

async function withJobLock(db, name, leaseMs, fn) {
  const now = new Date();
  const res = await db.collection("job_locks").findOneAndUpdate(
    { _id: name, $or: [{ lease_until: { $lt: now } }, { owner: OWNER }] },
    { $set: { owner: OWNER, lease_until: new Date(now.getTime() + leaseMs), started_at: now } },
    { upsert: true, returnDocument: "after" }
  ).catch((err) => {
    // Duplicate key: another container holds an unexpired lease
    if (err.code === 11000) return null;
    throw err;
  });
  if (!res || res.owner !== OWNER) return { skipped: true };

  try {
    return await fn();
  } finally {
    await db
      .collection("job_locks")
      .updateOne({ _id: name, owner: OWNER }, { $set: { lease_until: new Date(0), finished_at: new Date() } });
  }
}

module.exports = { withJobLock };
