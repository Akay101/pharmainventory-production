const sharp = require("sharp");
const path = require("path");
const fs = require("fs");

/**
 * Compresses an image using Sharp.
 * @param {string} inputPath Path to the input image.
 * @returns {Promise<string>} Path to the compressed image.
 */
async function compressImage(inputPath) {
  const uploadDir = path.join(process.cwd(), "tmp/uploads");
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const extension = path.extname(inputPath);
  const outputPath = path.join(
    uploadDir,
    `raw-${Date.now()}-${Math.random().toString(36).substring(7)}${extension}`
  );
  
  // Direct copy with zero processing, zero compression, zero modification
  fs.copyFileSync(inputPath, outputPath);

  return outputPath;
}

module.exports = { compressImage };
