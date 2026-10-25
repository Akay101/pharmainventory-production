const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const multer = require("multer");
const { auth, adminOnly } = require("../middleware/auth");
const { uploadToR2 } = require("../services/r2");
const { normalizeUpiId, isValidUpiId, pharmacyUpiQr } = require("../utils/upi");

const { requireSubscription } = require("../middleware/subscription");

const upload = multer({ storage: multer.memoryStorage() });

// PUT /api/pharmacy - Update pharmacy
router.put(
  "/",
  auth,
  requireSubscription(),
  adminOnly,
  upload.none(),
  async (req, res, next) => {
    try {
      const {
        name,
        location,
        license_no,
        years_old,
        contact,
        pan,
        bank_name,
        bank_ifsc,
        bank_acc_no,
        bank_holder,
        upi_id,
        gst_no,
      } = req.body;
      const db = mongoose.connection.db;

      const upi = normalizeUpiId(upi_id);
      if (upi && !isValidUpiId(upi)) {
        return res.status(400).json({ detail: "UPI ID should look like name@bank, e.g. medicalstore@okhdfcbank" });
      }

      const updateFields = {
        name: name || null,
        location: location || null,
        license_no: license_no || null,
        years_old: years_old ? parseInt(years_old) : null,
        contact: contact || null,
        pan: pan || null,
        bank_name: bank_name || null,
        bank_ifsc: bank_ifsc || null,
        bank_acc_no: bank_acc_no || null,
        bank_holder: bank_holder || null,
        upi_id: upi || null,
        gst_no: gst_no || null,
      };

      await db
        .collection("pharmacies")
        .updateOne(
          { id: req.user.pharmacy_id },
          { $set: updateFields }
        );

      const pharmacy = await db
        .collection("pharmacies")
        .findOne({ id: req.user.pharmacy_id }, { projection: { _id: 0 } });

      res.json({ message: "Pharmacy updated", pharmacy });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/pharmacy/upi-qr?amount=250&note=Bill%2012 - scannable UPI QR for any amount
router.get("/upi-qr", auth, requireSubscription(), async (req, res, next) => {
  try {
    const pharmacy = await mongoose.connection.db
      .collection("pharmacies")
      .findOne({ id: req.user.pharmacy_id }, { projection: { _id: 0, name: 1, upi_id: 1 } });
    res.json(await pharmacyUpiQr(pharmacy, { amount: req.query.amount, note: req.query.note }));
  } catch (error) {
    if (error.code && error.status) return res.status(error.status).json({ detail: error.message, code: error.code });
    next(error);
  }
});

// POST /api/pharmacy/logo - Upload logo
router.post(
  "/logo",
  auth,
  requireSubscription(),
  adminOnly,
  upload.single("file"),
  async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({ detail: "No file uploaded" });
      }

      const key = `logos/${req.user.pharmacy_id}-${Date.now()}.${req.file.originalname.split(".").pop()}`;
      const url = await uploadToR2(key, req.file.buffer, req.file.mimetype);

      const db = mongoose.connection.db;
      await db
        .collection("pharmacies")
        .updateOne({ id: req.user.pharmacy_id }, { $set: { logo_url: url } });

      res.json({ url, message: "Logo uploaded" });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
