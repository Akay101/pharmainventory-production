const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");
const multer = require("multer");
const { z } = require("zod");
const { auth, adminOnly } = require("../middleware/auth");
const { sendOTPEmail } = require("../services/email");
const { uploadToR2 } = require("../services/r2");
const { requireSubscription } = require("../middleware/subscription");
const { logActivity } = require("../utils/activityLogger");
const { issueOtp, verifyOtp, sendOtpError, OtpError } = require("../services/auth/otp");
const schemas = require("../services/auth/schemas");
const { revokeAllForUser } = require("../services/auth/tokens");
const { publicUser } = require("./auth");

const AVATAR_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => cb(null, !!AVATAR_TYPES[file.mimetype]),
});

const db = () => mongoose.connection.db;

const inviteSchema = z.object({
  name: schemas.text("Name", 80),
  email: schemas.email,
  mobile: schemas.mobile,
  password: schemas.password,
  role: z.enum(["PHARMACIST", "ADMIN"]).default("PHARMACIST"),
});
const verifyInviteSchema = z.object({ pending_id: z.string().uuid(), otp: schemas.otp });
const profileSchema = z.object({
  name: schemas.text("Name", 80),
  phone: schemas.mobile.optional().or(z.literal("")),
});
const profileVerifySchema = profileSchema.extend({ otp: schemas.otp });

const sendCode = async (email, name, purpose, scenario) => {
  const otp = await issueOtp(db(), { purpose, subject: email });
  const sent = await sendOTPEmail(email, name, otp, scenario);
  if (!sent) throw new OtpError("EMAIL_FAILED", "We couldn't send the verification email. Please try again shortly.", 503);
};

// GET /api/users/me - Get current user profile and pharmacy details
router.get("/me", auth, async (req, res, next) => {
  try {
    const pharmacy = req.user.pharmacy_id
      ? await db().collection("pharmacies").findOne({ id: req.user.pharmacy_id }, { projection: { _id: 0 } })
      : null;
    const user = publicUser(req.user, pharmacy);
    res.json({
      user,
      pharmacy: {
        id: pharmacy?.id || null,
        name: pharmacy?.name || "",
        location: pharmacy?.location || "",
        license_no: pharmacy?.license_no || "",
        years_old: pharmacy?.years_old || null,
        logo_url: pharmacy?.logo_url || null,
        contact: pharmacy?.contact || "",
        pan: pharmacy?.pan || "",
        bank_name: pharmacy?.bank_name || "",
        bank_ifsc: pharmacy?.bank_ifsc || "",
        bank_acc_no: pharmacy?.bank_acc_no || "",
        bank_holder: pharmacy?.bank_holder || "",
        upi_id: pharmacy?.upi_id || "",
        gst_no: pharmacy?.gst_no || "",
        created_at: pharmacy?.created_at || null,
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/users - Invite a staff member (admin only). The account stays
// unverified until the admin enters the code emailed to the staff member.
router.post("/", auth, requireSubscription(), adminOnly, async (req, res, next) => {
  try {
    const data = schemas.validate(inviteSchema, req.body, res);
    if (!data) return;

    const existing = await db().collection("users").findOne({ email: data.email }, { projection: { id: 1, verified: 1, pharmacy_id: 1 } });
    if (existing && !(existing.verified === false && existing.pharmacy_id === req.user.pharmacy_id)) {
      return res.status(409).json({ code: "EMAIL_EXISTS", detail: "This email is already registered" });
    }

    const userId = existing?.id || uuidv4();
    const userData = {
      id: userId,
      name: data.name,
      email: data.email,
      mobile: data.mobile,
      password_hash: await bcrypt.hash(data.password, 12),
      role: data.role,
      pharmacy_id: req.user.pharmacy_id,
      is_primary_admin: false,
      verified: false,
      token_version: 0,
      image_url: null,
      invited_by: req.user.id,
      created_at: new Date().toISOString(),
    };
    await db().collection("users").updateOne({ id: userId }, { $set: userData }, { upsert: true });

    await sendCode(data.email, data.name, "invite", "user_invite");
    await logActivity(db(), req.user.pharmacy_id, req.user.id, req.user.name, "CREATE", "USERS", userId, `Invited staff member ${data.name}`, `/users`);

    res.status(201).json({
      message: `We've sent a 6-digit code to ${data.email}. Enter it to finish adding them.`,
      pending_id: userId,
      user: { id: userId, name: data.name, email: data.email, mobile: data.mobile, role: data.role },
    });
  } catch (error) {
    sendOtpError(res, error, next);
  }
});

// POST /api/users/verify - Admin confirms the invite with the staff code
router.post("/verify", auth, requireSubscription(), adminOnly, async (req, res, next) => {
  try {
    const data = schemas.validate(verifyInviteSchema, req.body, res);
    if (!data) return;

    const user = await db().collection("users").findOne({
      id: data.pending_id,
      pharmacy_id: req.user.pharmacy_id,
      verified: false,
    });
    if (!user) throw new OtpError("OTP_INVALID", "Invalid or expired code");

    await verifyOtp(db(), { purpose: "invite", subject: user.email, otp: data.otp });
    await db()
      .collection("users")
      .updateOne({ id: user.id }, { $set: { verified: true, verified_at: new Date().toISOString() }, $unset: { otp: "", otp_expiry: "", otp_attempts: "" } });

    res.json({ message: "User verified successfully" });
  } catch (error) {
    sendOtpError(res, error, next);
  }
});

// POST /api/users/:user_id/resend-invite
router.post("/:user_id/resend-invite", auth, requireSubscription(), adminOnly, async (req, res, next) => {
  try {
    const user = await db().collection("users").findOne({ id: String(req.params.user_id), pharmacy_id: req.user.pharmacy_id, verified: false });
    if (!user) return res.status(404).json({ detail: "Pending invite not found" });
    await sendCode(user.email, user.name, "invite", "user_invite");
    res.json({ message: `A new code has been sent to ${user.email}` });
  } catch (error) {
    sendOtpError(res, error, next);
  }
});

// GET /api/users - List users of this pharmacy
router.get("/", auth, requireSubscription(), async (req, res, next) => {
  try {
    const users = await db()
      .collection("users")
      .find(
        { pharmacy_id: req.user.pharmacy_id },
        { projection: { _id: 0, id: 1, name: 1, email: 1, mobile: 1, role: 1, is_primary_admin: 1, verified: 1, image_url: 1, created_at: 1, last_login_at: 1 } }
      )
      .toArray();
    res.json({ users });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/users/:user_id
router.delete("/:user_id", auth, requireSubscription(), adminOnly, async (req, res, next) => {
  try {
    const user = await db().collection("users").findOne({ id: String(req.params.user_id), pharmacy_id: req.user.pharmacy_id });
    if (!user) {
      return res.status(404).json({ detail: "User not found" });
    }
    if (user.is_primary_admin) {
      return res.status(403).json({ detail: "Cannot delete primary admin" });
    }
    if (user.id === req.user.id) {
      return res.status(400).json({ detail: "You cannot delete your own account" });
    }

    await db().collection("users").deleteOne({ id: user.id, pharmacy_id: req.user.pharmacy_id });
    await revokeAllForUser(db(), user.id, "user_deleted");
    await logActivity(db(), req.user.pharmacy_id, req.user.id, req.user.name, "DELETE", "USERS", user.id, `Removed staff member ${user.name}`, `/users`);
    res.json({ message: "User deleted" });
  } catch (error) {
    next(error);
  }
});

// POST /api/users/avatar - Upload avatar (JPEG/PNG/WebP, max 2 MB)
router.post("/avatar", auth, requireSubscription(), upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ detail: "Upload a JPEG, PNG or WebP image up to 2 MB" });
    }
    const key = `avatars/${req.user.id}-${Date.now()}.${AVATAR_TYPES[req.file.mimetype]}`;
    const url = await uploadToR2(key, req.file.buffer, req.file.mimetype);
    await db().collection("users").updateOne({ id: req.user.id }, { $set: { image_url: url } });
    res.json({ url, message: "Avatar uploaded" });
  } catch (error) {
    next(error);
  }
});

// POST /api/users/request-profile-update
router.post("/request-profile-update", auth, requireSubscription(), async (req, res, next) => {
  try {
    const data = schemas.validate(profileSchema, req.body, res);
    if (!data) return;
    await sendCode(req.user.email, req.user.name, "profile", "security");
    res.json({ message: "OTP sent to your email", email_sent: true });
  } catch (error) {
    sendOtpError(res, error, next);
  }
});

// POST /api/users/verify-profile-update
router.post("/verify-profile-update", auth, requireSubscription(), async (req, res, next) => {
  try {
    const data = schemas.validate(profileVerifySchema, req.body, res);
    if (!data) return;
    await verifyOtp(db(), { purpose: "profile", subject: req.user.email, otp: data.otp });

    await db()
      .collection("users")
      .updateOne(
        { id: req.user.id },
        {
          $set: { name: data.name, mobile: data.phone || req.user.mobile },
          $unset: { profile_update_otp: "", profile_update_otp_expiry: "", pending_name: "", pending_phone: "" },
        }
      );

    const updated = await db().collection("users").findOne({ id: req.user.id });
    const pharmacy = await db().collection("pharmacies").findOne({ id: req.user.pharmacy_id }, { projection: { subscription: 1 } });
    await logActivity(db(), req.user.pharmacy_id, req.user.id, req.user.name, "UPDATE", "USERS", req.user.id, `Updated their profile`, `/settings`);
    res.json({ message: "Profile updated", user: publicUser(updated, pharmacy) });
  } catch (error) {
    sendOtpError(res, error, next);
  }
});

module.exports = router;
