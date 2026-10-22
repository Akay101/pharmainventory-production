// Image preparation for AI scans: one pass through sharp that validates the
// file is a real image, applies the EXIF rotation phone cameras rely on,
// downsizes and re-encodes as JPEG. A 4-12 MB phone photo becomes ~150-400 KB,
// which is what makes uploads and the Gemini call fast.
const crypto = require("crypto");
const sharp = require("sharp");

// Longest side in pixels. Product packs read fine at 1400; invoices keep more
// detail so small table text stays legible.
const PRESETS = {
  product: { maxSide: 1400, quality: 80 },
  bill: { maxSide: 2200, quality: 85 },
};

const MAX_INPUT_PIXELS = 60e6;

class ImageError extends Error {}

async function prepareImage(input, kind = "product") {
  const { maxSide, quality } = PRESETS[kind] || PRESETS.product;
  let img;
  try {
    img = sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" });
    const meta = await img.metadata();
    if (!meta.width || !meta.height) throw new Error("no dimensions");
  } catch {
    throw new ImageError("One of the files is not a readable image");
  }
  const data = await img
    .rotate()
    .resize({ width: maxSide, height: maxSide, fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality, mozjpeg: true })
    .toBuffer();
  return { data, mimeType: "image/jpeg" };
}

// Identical photos (a double-tapped upload, the same page picked twice) are
// dropped so they aren't read, and billed, twice.
async function prepareImages(inputs, kind) {
  const images = await Promise.all(inputs.map((i) => prepareImage(i, kind)));
  const seen = new Set();
  return images.filter((img) => {
    const h = crypto.createHash("sha1").update(img.data).digest("hex");
    if (seen.has(h)) return false;
    seen.add(h);
    return true;
  });
}

// Stable fingerprint of a scan's images, used to answer a repeated scan of the
// same photos from cache instead of calling the AI again.
function fingerprint(images, kind) {
  const h = crypto.createHash("sha256").update(kind);
  for (const img of images) h.update(img.data);
  return h.digest("hex");
}

module.exports = { prepareImage, prepareImages, fingerprint, ImageError };
