const { Queue, QueueEvents } = require("bullmq");
const IORedis = require("ioredis");

// REDIS_URL wins when set; otherwise host/port/password (current deployments)
const redisOptions = { maxRetriesPerRequest: null }; // Required by BullMQ
const makeConnection = () =>
  process.env.REDIS_URL
    ? new IORedis(process.env.REDIS_URL, redisOptions)
    : new IORedis({
        host: process.env.REDIS_HOST || "127.0.0.1",
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD || undefined,
        ...redisOptions,
      });

const connection = makeConnection();
connection.on("error", (err) => console.warn("[Redis]", err.message));

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

module.exports = { scanQueue, connection, makeConnection, getQueueEvents };
