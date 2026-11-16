// Logos and profile photos are public files: only small raster images, never
// HTML/SVG. The type is checked against the file's own bytes, not just its label.
const multer = require("multer");

const IMAGE_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX_BYTES = 2 * 1024 * 1024;
const WRONG_TYPE = "Upload a PNG, JPEG or WebP image (max 2 MB)";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    if (!IMAGE_TYPES[file.mimetype]) req.imageRejected = true;
    cb(null, !!IMAGE_TYPES[file.mimetype]);
  },
});

const bytesMatchType = ({ buffer, mimetype }) => {
  if (mimetype === "image/jpeg") return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mimetype === "image/png") return buffer.subarray(0, 8).toString("hex") === "89504e470d0a1a0a";
  return buffer.subarray(0, 4).toString("latin1") === "RIFF" && buffer.subarray(8, 12).toString("latin1") === "WEBP";
};

// Parses a multipart body with one optional image in `field`, answering 4xx for a bad image
const acceptImage = (field) => (req, res, next) =>
  upload.single(field)(req, res, (err) => {
    if (err?.code === "LIMIT_FILE_SIZE") return res.status(413).json({ detail: "That image is over 2 MB. Please choose a smaller one." });
    if (err instanceof multer.MulterError) return res.status(400).json({ detail: WRONG_TYPE });
    if (err) return next(err);
    if (req.imageRejected || (req.file && !bytesMatchType(req.file))) return res.status(400).json({ detail: WRONG_TYPE });
    next();
  });

const imageExtension = (file) => IMAGE_TYPES[file.mimetype];

const storeImageError = (res) =>
  res.status(502).json({ code: "IMAGE_UPLOAD_FAILED", detail: "We couldn't upload the image, so nothing was saved. Please try again." });

module.exports = { acceptImage, imageExtension, storeImageError };
