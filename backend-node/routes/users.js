const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const { auth, adminOnly } = require('../middleware/auth');
const { sendOTPEmail } = require('../services/email');
const { uploadToR2 } = require('../services/r2');

const upload = multer({ storage: multer.memoryStorage() });

// Generate OTP
const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

// POST /api/users - Create new user (admin only)
router.post('/', auth, adminOnly, async (req, res, next) => {
  try {
    const { name, email, mobile, password, role } = req.body;
    const db = mongoose.connection.db;

    const existing = await db.collection('users').findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(400).json({ detail: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const userId = uuidv4();
    const userData = {
      id: userId,
      name,
      email: email.toLowerCase(),
      mobile,
      password_hash: hashedPassword,
      role: role || 'PHARMACIST',
      pharmacy_id: req.user.pharmacy_id,
      is_primary_admin: false,
      verified: false,
      otp,
      otp_expiry: otpExpiry,
      image_url: null,
      created_at: new Date().toISOString()
    };
    await db.collection('users').insertOne(userData);

    const emailSent = await sendOTPEmail(email, name, otp);

    res.status(201).json({
      message: 'User created. They need to verify their email.',
      user: { id: userId, name, email, mobile, role: userData.role },
      email_sent: emailSent,
      otp: emailSent ? null : otp
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/users/verify - Verify new user OTP
router.post('/verify', async (req, res, next) => {
  try {
    const { email, otp, password } = req.body;
    const db = mongoose.connection.db;

    const user = await db.collection('users').findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(404).json({ detail: 'User not found' });
    }

    if (user.otp !== otp) {
      return res.status(400).json({ detail: 'Invalid OTP' });
    }

    if (new Date(user.otp_expiry) < new Date()) {
      return res.status(400).json({ detail: 'OTP expired' });
    }

    const updates = { verified: true, otp: null, otp_expiry: null };
    if (password) {
      updates.password_hash = await bcrypt.hash(password, 10);
    }

    await db.collection('users').updateOne({ id: user.id }, { $set: updates });

    res.json({ message: 'User verified successfully' });
  } catch (error) {
    next(error);
  }
});

// GET /api/users - List users
router.get('/', auth, async (req, res, next) => {
  try {
    const db = mongoose.connection.db;
    const users = await db.collection('users').find(
      { pharmacy_id: req.user.pharmacy_id },
      { projection: { _id: 0, password_hash: 0, password: 0, otp: 0, otp_expiry: 0 } }
    ).toArray();

    res.json({ users });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/users/:user_id
router.delete('/:user_id', auth, adminOnly, async (req, res, next) => {
  try {
    const { user_id } = req.params;
    const db = mongoose.connection.db;

    const user = await db.collection('users').findOne({ id: user_id });
    if (!user) {
      return res.status(404).json({ detail: 'User not found' });
    }

    if (user.is_primary_admin) {
      return res.status(403).json({ detail: 'Cannot delete primary admin' });
    }

    await db.collection('users').deleteOne({ id: user_id });
    res.json({ message: 'User deleted' });
  } catch (error) {
    next(error);
  }
});

// POST /api/users/avatar - Upload avatar
router.post('/avatar', auth, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ detail: 'No file uploaded' });
    }

    const key = `avatars/${req.user.id}-${Date.now()}.${req.file.originalname.split('.').pop()}`;
    const url = await uploadToR2(key, req.file.buffer, req.file.mimetype);

    const db = mongoose.connection.db;
    await db.collection('users').updateOne(
      { id: req.user.id },
      { $set: { image_url: url } }
    );

    res.json({ url, message: 'Avatar uploaded' });
  } catch (error) {
    next(error);
  }
});

// POST /api/users/request-profile-update
router.post('/request-profile-update', auth, async (req, res, next) => {
  try {
    const { name, phone } = req.body;
    const db = mongoose.connection.db;

    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    await db.collection('users').updateOne(
      { id: req.user.id },
      { $set: { profile_update_otp: otp, profile_update_otp_expiry: otpExpiry, pending_name: name, pending_phone: phone } }
    );

    const emailSent = await sendOTPEmail(req.user.email, req.user.name, otp);

    res.json({
      message: 'OTP sent to your email',
      email_sent: emailSent,
      otp: emailSent ? null : otp
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/users/verify-profile-update
router.post('/verify-profile-update', auth, async (req, res, next) => {
  try {
    const { otp, name, phone } = req.body;
    const db = mongoose.connection.db;

    const user = await db.collection('users').findOne({ id: req.user.id });

    if (user.profile_update_otp !== otp) {
      return res.status(400).json({ detail: 'Invalid OTP' });
    }

    if (new Date(user.profile_update_otp_expiry) < new Date()) {
      return res.status(400).json({ detail: 'OTP expired' });
    }

    await db.collection('users').updateOne(
      { id: req.user.id },
      {
        $set: { name, mobile: phone || user.mobile },
        $unset: { profile_update_otp: '', profile_update_otp_expiry: '', pending_name: '', pending_phone: '' }
      }
    );

    const updatedUser = await db.collection('users').findOne(
      { id: req.user.id },
      { projection: { _id: 0, password_hash: 0, password: 0, otp: 0 } }
    );

    res.json({ message: 'Profile updated', user: updatedUser });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
