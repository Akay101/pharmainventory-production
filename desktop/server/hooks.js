// Points the backend's cloud dependencies at local stand-ins, so the backend's
// own route and service files run unchanged on a shop PC.
const Module = require("module");
const path = require("path");

const stub = (name) => path.join(__dirname, "stubs", name);

// By package name
const PACKAGES = {
  mongoose: stub("mongoose.js"),
  dotenv: stub("noop.js"),
  "rate-limit-redis": stub("rateLimitStore.js"),
  // Needs the internet, or only serves features that do
  bullmq: stub("onlineOnly.js"),
  ioredis: stub("onlineOnly.js"),
  openai: stub("onlineOnly.js"),
  sharp: stub("onlineOnly.js"),
  "@google/generative-ai": stub("onlineOnly.js"),
  "cashfree-pg": stub("onlineOnly.js"),
  "sib-api-v3-sdk": stub("onlineOnly.js"),
  "@aws-sdk/client-s3": stub("onlineOnly.js"),
  "@aws-sdk/client-ses": stub("onlineOnly.js"),
  "@aws-sdk/s3-request-presigner": stub("onlineOnly.js"),
  "node-cron": stub("noop.js"),
};

// By file inside the backend
const FILES = {
  "services/ai/queue.js": stub("queue.js"),
  "services/r2.js": stub("r2.js"),
  "services/s3.js": stub("s3.js"),
  "services/email.js": stub("email.js"),
  "utils/globalDb.js": stub("globalDb.js"),
};

function install(backendDir) {
  const resolvedFiles = Object.fromEntries(Object.entries(FILES).map(([rel, to]) => [path.join(backendDir, rel), to]));
  const original = Module._resolveFilename;
  Module._resolveFilename = function (request, ...rest) {
    if (PACKAGES[request]) return PACKAGES[request];
    const resolved = original.call(this, request, ...rest);
    return resolvedFiles[resolved] || resolved;
  };
}

module.exports = { install };
