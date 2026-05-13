const { Queue } = require("bullmq");
const IORedis = require("ioredis");
const path = require("path");

const connection = new IORedis({
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null, // Required by BullMQ
});

const scanQueue = new Queue("scan-queue", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 5000,
    },
    removeOnComplete: true,
    removeOnFail: false, // Keep for debugging/board
  },
  stalledInterval: 30000,
  maxStalledCount: 3,
});

module.exports = { scanQueue, connection };
