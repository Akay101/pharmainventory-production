const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const multer = require('multer');
const { auth, adminOnly } = require('../middleware/auth');
const { uploadToR2 } = require('../services/r2');

const upload = multer({ storage: multer.memoryStorage() });

// PUT /api/pharmacy - Update pharmacy
router.put('/', auth, adminOnly, async (req, res, next) => {
  try {
    const { name, location, license_no, years_old } = req.body;
    const db = mongoose.connection.db;

    await db.collection('pharmacies').updateOne(
      { id: req.user.pharmacy_id },
      { $set: { name, location, license_no, years_old } }
    );

    const pharmacy = await db.collection('pharmacies').findOne(
      { id: req.user.pharmacy_id },
      { projection: { _id: 0 } }
    );

    res.json({ message: 'Pharmacy updated', pharmacy });
  } catch (error) {
    next(error);
  }
});

// POST /api/pharmacy/logo - Upload logo
router.post('/logo', auth, adminOnly, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ detail: 'No file uploaded' });
    }

    const key = `logos/${req.user.pharmacy_id}-${Date.now()}.${req.file.originalname.split('.').pop()}`;
    const url = await uploadToR2(key, req.file.buffer, req.file.mimetype);

    const db = mongoose.connection.db;
    await db.collection('pharmacies').updateOne(
      { id: req.user.pharmacy_id },
      { $set: { logo_url: url } }
    );

    res.json({ url, message: 'Logo uploaded' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
