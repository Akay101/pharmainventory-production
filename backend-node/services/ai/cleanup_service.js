const fs = require("fs");
const path = require("path");

/**
 * Deletes files in the specified directory that are older than the given age.
 * @param {string} directory Path to the directory.
 * @param {number} maxAgeMs Maximum age of files in milliseconds.
 */
function cleanupTmpFolder(directory = path.join(process.cwd(), "tmp/uploads"), maxAgeMs = 3600000) {
  // 1 hour
  if (!fs.existsSync(directory)) return;

  const now = Date.now();
  const files = fs.readdirSync(directory);

  for (const file of files) {
    const filePath = path.join(directory, file);
    try {
      const stats = fs.statSync(filePath);
      if (now - stats.mtimeMs > maxAgeMs) {
        fs.unlinkSync(filePath);
        console.log(`[Cleanup] Deleted old file: ${file}`);
      }
    } catch (err) {
      console.error(`[Cleanup] Failed to process file ${file}:`, err.message);
    }
  }
}

module.exports = { cleanupTmpFolder };
