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
const { deleteFromR2, downloadFromR2, R2_PUBLIC_URL } = require("../services/r2");

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
    const { jobId, r2Keys, type } = job.data;
    const apiKey = process.env.EMERGENT_LLM_KEY || process.env.GEMINI_API_KEY;

    console.log(`[Worker] Processing job ${jobId} (type: ${type}) from R2`);

    // Create a local temp folder for this job
    const tempDir = path.join(__dirname, "../tmp/scans", jobId);
    fs.mkdirSync(tempDir, { recursive: true });

    // Download files from R2
    const localPaths = [];
    for (const key of r2Keys) {
      try {
        const buffer = await downloadFromR2(key);
        const localPath = path.join(tempDir, path.basename(key));
        fs.writeFileSync(localPath, buffer);
        localPaths.push(localPath);
      } catch (err) {
        console.error(`[Worker] Failed to download key ${key} from R2:`, err);
      }
    }

    if (localPaths.length === 0) {
      // Clean up tempDir
      try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}
      throw new Error(`No images could be retrieved for processing. Tried to download: ${r2Keys.join(", ")}`);
    }

    // [Issue #7] Granular progress steps
    await job.updateProgress(10);

    // Update status to processing
    await ScanJob.findOneAndUpdate(
      { jobId },
      { status: "processing" },
      { upsert: true }
    );

    const helperPath =
      type === "bill"
        ? path.join(__dirname, "../services/scan_purchase_bill.py")
        : path.join(__dirname, "../services/scan_helper.py");

    await job.updateProgress(40);

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
    }, 10000);

    return new Promise((resolve, reject) => {
      const pythonProcess = spawn(
        pythonPath,
        [helperPath, apiKey, ...localPaths],
        {
          shell: false,
        }
      );

      let stdoutData = "";
      let stderrData = "";

      const timeout = setTimeout(async () => {
        clearInterval(progressTicker);

        if (pythonProcess.exitCode === null) {
          pythonProcess.kill();

          // Cleanup local temp files
          try {
            fs.rmSync(tempDir, { recursive: true, force: true });
          } catch (e) {}

          // Cleanup R2 files if max attempts reached
          const maxAttempts = job.opts.attempts || 3;
          if (job.attemptsMade >= maxAttempts) {
            for (const key of r2Keys) {
              try { await deleteFromR2(key); } catch (e) {}
            }
          }

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

        // Cleanup local temp files
        try {
          fs.rmSync(tempDir, { recursive: true, force: true });
        } catch (e) {}

        try {
          if (code !== 0) {
            const errorMsg =
              stderrData || `Python process exited with code ${code}`;

            // Cleanup R2 files if max attempts reached
            const maxAttempts = job.opts.attempts || 3;
            if (job.attemptsMade >= maxAttempts) {
              for (const key of r2Keys) {
                try { await deleteFromR2(key); } catch (e) {}
              }
            }

            return reject(new Error(errorMsg));
          }

          await job.updateProgress(85);

          const result = JSON.parse(stdoutData.trim());

          if (!result.success) {
            // Cleanup R2 files if max attempts reached
            const maxAttempts = job.opts.attempts || 3;
            if (job.attemptsMade >= maxAttempts) {
              for (const key of r2Keys) {
                try { await deleteFromR2(key); } catch (e) {}
              }
            }
            return reject(new Error(result.error || "AI extraction failed"));
          }

          // If successful, clean up R2 files immediately
          for (const key of r2Keys) {
            try {
              await deleteFromR2(key);
            } catch (e) {}
          }

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

    // Safety cleanup fallback
    for (const key of job.data.r2Keys) {
      try {
        await deleteFromR2(key);
      } catch (e) {}
    }

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
