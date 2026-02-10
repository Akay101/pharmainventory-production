const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const { auth, generateToken } = require('../middleware/auth');
const { sendOTPEmail } = require('../services/email');

// Generate OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// POST /api/auth/register
router.post('/register', async (req, res, next) => {
  try {
    const { name, email, mobile, password, pharmacy } = req.body;
    const db = mongoose.connection.db;

    // Check existing user
    const existingUser = await db.collection('users').findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ detail: 'Email already registered' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create pharmacy
    const pharmacyId = uuidv4();
    const pharmacyData = {
      id: pharmacyId,
      name: pharmacy.name,
      location: pharmacy.location,
      license_no: pharmacy.license_no || null,
      years_old: pharmacy.years_old || null,
      logo_url: null,
      created_at: new Date().toISOString()
    };
    await db.collection('pharmacies').insertOne(pharmacyData);

    // Generate OTP
    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    // Create user (using password_hash for compatibility with existing data)
    const userId = uuidv4();
    const userData = {
      id: userId,
      name,
      email: email.toLowerCase(),
      mobile,
      password_hash: hashedPassword,
      role: 'ADMIN',
      pharmacy_id: pharmacyId,
      is_primary_admin: true,
      verified: false,
      otp,
      otp_expiry: otpExpiry,
      image_url: null,
      created_at: new Date().toISOString()
    };
    await db.collection('users').insertOne(userData);

    // Send OTP email
    const emailSent = await sendOTPEmail(email, name, otp);

    res.status(201).json({
      message: 'Registration successful. Please verify your email.',
      email,
      email_sent: emailSent,
      otp: emailSent ? null : otp // Show OTP if email failed
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/verify-otp
router.post('/verify-otp', async (req, res, next) => {
  try {
    const { email, otp } = req.body;
    const db = mongoose.connection.db;

    const user = await db.collection('users').findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(404).json({ detail: 'User not found' });
    }

    if (user.verified) {
      return res.status(400).json({ detail: 'Email already verified' });
    }

    if (user.otp !== otp) {
      return res.status(400).json({ detail: 'Invalid OTP' });
    }

    if (new Date(user.otp_expiry) < new Date()) {
      return res.status(400).json({ detail: 'OTP expired' });
    }

    // Mark verified
    await db.collection('users').updateOne(
      { id: user.id },
      { $set: { verified: true, otp: null, otp_expiry: null } }
    );

    // Generate token
    const token = generateToken(user.id);

    // Get pharmacy
    const pharmacy = await db.collection('pharmacies').findOne(
      { id: user.pharmacy_id },
      { projection: { _id: 0 } }
    );

    res.json({
      message: 'Email verified successfully',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        mobile: user.mobile,
        role: user.role,
        pharmacy_id: user.pharmacy_id,
        image_url: user.image_url
      },
      pharmacy
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/resend-otp
router.post('/resend-otp', async (req, res, next) => {
  try {
    const { email } = req.body;
    const db = mongoose.connection.db;

    const user = await db.collection('users').findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(404).json({ detail: 'User not found' });
    }

    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    await db.collection('users').updateOne(
      { id: user.id },
      { $set: { otp, otp_expiry: otpExpiry } }
    );

    const emailSent = await sendOTPEmail(email, user.name, otp);

    res.json({
      message: 'OTP resent',
      email_sent: emailSent,
      otp: emailSent ? null : otp
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const db = mongoose.connection.db;

    const user = await db.collection('users').findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ detail: 'Invalid email or password' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash || user.password);
    if (!validPassword) {
      return res.status(401).json({ detail: 'Invalid email or password' });
    }

    // Check if user is verified (default to true for migrated users without the field)
    if (user.verified === false) {
      return res.status(403).json({ detail: 'Email not verified', email: user.email });
    }

    const token = generateToken(user.id);

    const pharmacy = await db.collection('pharmacies').findOne(
      { id: user.pharmacy_id },
      { projection: { _id: 0 } }
    );

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        mobile: user.mobile,
        role: user.role,
        pharmacy_id: user.pharmacy_id,
        image_url: user.image_url
      },
      pharmacy
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/auth/me
router.get('/me', auth, async (req, res, next) => {
  try {
    const db = mongoose.connection.db;
    const pharmacy = await db.collection('pharmacies').findOne(
      { id: req.user.pharmacy_id },
      { projection: { _id: 0 } }
    );

    res.json({
      user: req.user,
      pharmacy
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
