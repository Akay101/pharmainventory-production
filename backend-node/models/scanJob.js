const mongoose = require("mongoose");

const scanJobSchema = new mongoose.Schema({
  jobId: { type: String, required: true, unique: true },
  pharmacyId: { type: String, required: true },
  userId: { type: String, required: true },
  status: {
    type: String,
    enum: ["pending", "processing", "completed", "failed"],
    default: "pending",
  },
  type: {
    type: String,
    enum: ["product", "bill"],
    required: true,
  },
  result: { type: mongoose.Schema.Types.Mixed },
  errorCategory: {
    type: String,
    enum: ["timeout", "invalid_json", "gemini_error", "image_error", "unknown"],
    null: true,
  },
  errorMessage: { type: String, null: true },
  createdAt: { type: Date, default: Date.now, expires: 86400 * 7 }, // Expire after 7 days
});

module.exports = mongoose.model("ScanJob", scanJobSchema);
