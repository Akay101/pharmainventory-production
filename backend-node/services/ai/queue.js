const { Queue, QueueEvents } = require("bullmq");
const IORedis = require("ioredis");

// REDIS_URL wins when set; otherwise host/port/password (current deployments)
const redisOptions = { maxRetriesPerRequest: null }; // Required by BullMQ
const makeConnection = (options = redisOptions) =>
  process.env.REDIS_URL
    ? new IORedis(process.env.REDIS_URL, options)
    : new IORedis({
        host: process.env.REDIS_HOST || "127.0.0.1",
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD || undefined,
        ...options,
      });

const connection = makeConnection();
connection.on("error", (err) => console.warn("[Redis]", err.message));

// For per-request lookups (rate limits): fails fast instead of queueing
// commands while Redis is down, so callers can fall through. The BullMQ
// connection above waits forever by design, which would hang every request.
// Opened on first use, so the worker process doesn't hold a spare connection.
let fast = null;
const fastConnection = () => {
  if (!fast) {
    fast = makeConnection({ maxRetriesPerRequest: 1, enableOfflineQueue: false, connectTimeout: 3000, commandTimeout: 2000 });
    fast.on("error", (err) => console.warn("[Redis:fast]", err.message));
  }
  return fast;
};

const scanQueue = new Queue("scan-queue", {
  connection,
  defaultJobOptions: {
    // Gemini calls already retry transient errors internally; one more queue
    // attempt covers a worker crash mid-job.
    attempts: 2,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: { age: 600 },
    removeOnFail: { age: 3600 },
  },
});

// Completion events for long-polling clients; one listener per API process
let queueEvents = null;
function getQueueEvents() {
  if (!queueEvents) {
    queueEvents = new QueueEvents("scan-queue", { connection: makeConnection() });
    queueEvents.setMaxListeners(0);
    queueEvents.on("error", (err) => console.warn("[ScanQueueEvents]", err.message));
  }
  return queueEvents;
}

module.exports = { scanQueue, connection, fastConnection, makeConnection, getQueueEvents };
