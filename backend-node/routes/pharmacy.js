const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const { auth, adminOnly } = require("../middleware/auth");
const { uploadToR2, deleteFromR2 } = require("../services/r2");
const { acceptImage, imageExtension, storeImageError } = require("../utils/imageUpload");
const { normalizeUpiId, isValidUpiId, pharmacyUpiQr } = require("../utils/upi");

const { requireSubscription } = require("../middleware/subscription");

// PUT /api/pharmacy - Save the details and the logo together: if the image can't
// be stored, none of the details are saved either.
router.put(
  "/",
  auth,
  requireSubscription(),
  adminOnly,
  acceptImage("logo"),
  async (req, res, next) => {
    let logoKey = null;
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

      if (!String(name || "").trim()) {
        return res.status(400).json({ detail: "Pharmacy name is required" });
      }

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

      if (req.file) {
        logoKey = `logos/${req.user.pharmacy_id}-${Date.now()}.${imageExtension(req.file)}`;
        try {
          updateFields.logo_url = await uploadToR2(logoKey, req.file.buffer, req.file.mimetype);
        } catch (uploadError) {
          console.error("Logo upload failed:", uploadError.message);
          logoKey = null;
          return storeImageError(res);
        }
      } else if (req.body.remove_logo === "true") {
        updateFields.logo_url = null;
      }

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
      if (logoKey) deleteFromR2(logoKey).catch(() => {});
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

module.exports = router;
