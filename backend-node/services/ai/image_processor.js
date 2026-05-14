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

  const outputPath = path.join(
    uploadDir,
    `comp-${Date.now()}-${Math.random().toString(36).substring(7)}.webp`
  );

  await sharp(inputPath)
    .resize({ width: 1600, withoutEnlargement: true })
    .webp({ quality: 80 })
    .toFile(outputPath);

  return outputPath;
}

module.exports = { compressImage };
