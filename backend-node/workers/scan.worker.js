const { Worker } = require("bullmq");
const { spawn } = require("child_process");
const mongoose = require("mongoose");
const path = require("path");
const fs = require("fs");
const dotenv = require("dotenv");

// Load env vars
dotenv.config({ path: path.join(__dirname, "../.env") });

const { connection } = require("../services/ai/queue");
const ScanJob = require("../models/scanJob");
const { cleanupTmpFolder } = require("../services/ai/cleanup_service");

// Connect to MongoDB
const MONGO_URL =
  process.env.MONGO_URL || "mongodb://localhost:27017/pharmalogy";
mongoose
  .connect(MONGO_URL)
  .then(() => console.log("[Worker] Connected to MongoDB"))
  .catch((err) => console.error("[Worker] MongoDB connection error:", err));

const pythonPath = process.env.PYTHON_PATH || "python3";

const worker = new Worker(
  "scan-queue",
  async (job) => {
    const { jobId, tempFiles, type } = job.data;
    const apiKey = process.env.EMERGENT_LLM_KEY || process.env.GEMINI_API_KEY;

    console.log(`[Worker] Processing job ${jobId} (type: ${type})`);

    // [Issue #7] Granular progress steps
    await job.updateProgress(10); // Upload validated

    // Update status to processing if not already
    await ScanJob.findOneAndUpdate(
      { jobId },
      { status: "processing" },
      { upsert: true }
    );

    const helperPath =
      type === "bill"
        ? path.join(__dirname, "../services/scan_purchase_bill.py")
        : path.join(__dirname, "../services/scan_helper.py");

    await job.updateProgress(25); // Compression complete (happens in route, but worker starts here)
    await job.updateProgress(40); // Python process starting

    // [UX] Incremental progress ticker to keep UI alive during long extraction
    let currentProgress = 40;
    const progressTicker = setInterval(async () => {
      if (currentProgress < 80) {
        currentProgress += 5;
        try {
          await job.updateProgress(currentProgress);
        } catch (e) {}
      } else {
        clearInterval(progressTicker);
      }
    }, 10000); // Increment every 10s

    return new Promise((resolve, reject) => {
      console.log("[Worker] Files received:", tempFiles);

      for (const file of tempFiles) {
        if (!fs.existsSync(file)) {
          console.error("[Worker] Missing upload file:", file);

          return reject(
            new Error(`Upload file missing inside worker container: ${file}`)
          );
        }

        const stats = fs.statSync(file);

        console.log(`[Worker] File OK -> ${file} (${stats.size} bytes)`);

        if (stats.size <= 0) {
          return reject(new Error(`Upload file is empty: ${file}`));
        }
      }

      let stdoutData = "";
      let stderrData = "";

      // Timeout protection: Kill after 90 seconds
      const timeout = setTimeout(async () => {
        clearInterval(progressTicker);
        // [Issue #6] Only kill and update if still running
        if (pythonProcess.exitCode === null) {
          pythonProcess.kill();
          // [Issue #3] Cleanup ScanJob state on timeout
          await ScanJob.findOneAndUpdate(
            { jobId },
            {
              status: "failed",
              errorCategory: "timeout",
              errorMessage: "Process timed out after 90 seconds",
            }
          );
          reject(new Error("PROCESS_TIMEOUT"));
        }
      }, 90000);

      pythonProcess.stdout.on("data", (data) => {
        stdoutData += data.toString();
      });

      pythonProcess.stderr.on("data", (data) => {
        stderrData += data.toString();
      });

      pythonProcess.on("close", async (code) => {
        clearTimeout(timeout);
        clearInterval(progressTicker);

        try {
          if (code !== 0) {
            // [Issue #8] Cleanup temp files on failure
            tempFiles.forEach((f) => {
              try {
                fs.unlinkSync(f);
              } catch (e) {}
            });
            const errorMsg =
              stderrData || `Python process exited with code ${code}`;
            return reject(new Error(errorMsg));
          }

          await job.updateProgress(85); // [Issue #7] Parsing stage
          const result = JSON.parse(stdoutData.trim());

          if (!result.success) {
            // [Issue #8] Cleanup on AI extraction failure
            tempFiles.forEach((f) => {
              try {
                fs.unlinkSync(f);
              } catch (e) {}
            });
            return reject(new Error(result.error || "AI extraction failed"));
          }

          // Success - Now cleanup temp files [Issue #8]
          tempFiles.forEach((f) => {
            try {
              fs.unlinkSync(f);
            } catch (e) {}
          });

          await ScanJob.findOneAndUpdate(
            { jobId },
            {
              status: "completed",
              result: result,
            }
          );
          await job.updateProgress(100);
          resolve(result);
        } catch (err) {
          // [Issue #8] Cleanup on JSON parse error
          tempFiles.forEach((f) => {
            try {
              fs.unlinkSync(f);
            } catch (e) {}
          });
          reject(err);
        }
      });
    });
  },
  {
    connection,
    concurrency: 2,
    stalledInterval: 30000,
  }
);

// [Issue #8] Handle Failure - Only mark failed if retries are exhausted
worker.on("failed", async (job, err) => {
  console.error(`[Worker] Job ${job.id} failed:`, err.message);

  if (job.attemptsMade >= (job.opts.attempts || 3)) {
    console.log(
      `[Worker] Max retries reached for job ${job.data.jobId}. Marking as failed in DB.`
    );
    await ScanJob.findOneAndUpdate(
      { jobId: job.data.jobId },
      {
        status: "failed",
        errorCategory: "max_retries_exceeded",
        errorMessage: err.message,
      }
    );
  }
});

// [Issue #20] Graceful Shutdown
const shutdown = async (signal) => {
  console.log(`[Worker] ${signal} received. Shutting down gracefully...`);
  await worker.close();
  await mongoose.connection.close();
  process.exit(0);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Run cleanup on startup [Issue #2]
cleanupTmpFolder(path.join(process.cwd(), "tmp/uploads"));
console.log("[Worker] Started and cleanup performed");
