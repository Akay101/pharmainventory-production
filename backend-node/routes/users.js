const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");
const { z } = require("zod");
const { auth, adminOnly } = require("../middleware/auth");
const { sendOTPEmail } = require("../services/email");
const { uploadToR2, deleteFromR2 } = require("../services/r2");
const { acceptImage, imageExtension, storeImageError } = require("../utils/imageUpload");
const { requireSubscription } = require("../middleware/subscription");
const { logActivity } = require("../utils/activityLogger");
const { issueOtp, verifyOtp, sendOtpError, OtpError } = require("../services/auth/otp");
const schemas = require("../services/auth/schemas");
const { revokeAllForUser } = require("../services/auth/tokens");
const { publicUser } = require("./auth");
const account = require("../services/account");
const permissions = require("../services/access/permissions");
const pricing = require("../services/billing/pricing");
const sessions = require("../services/auth/sessions");
const { invalidateAccessCache } = require("../middleware/auth");

const db = () => mongoose.connection.db;

const inviteSchema = z.object({
  name: schemas.text("Name", 80),
  email: schemas.email,
  mobile: schemas.mobile,
  password: schemas.password,
  // Kept for older clients; new users are always pharmacists with set access
  role: z.enum(["PHARMACIST", "ADMIN"]).default("PHARMACIST"),
  permissions: z.any().optional(),
  copy_from_user_id: z.string().max(64).optional(),
});
const verifyInviteSchema = z.object({ pending_id: z.string().uuid(), otp: schemas.otp });
const profileSchema = z.object({
  name: schemas.text("Name", 80),
  phone: schemas.mobile.optional().or(z.literal("")),
});

const sendCode = async (email, name, purpose, scenario) => {
  const otp = await issueOtp(db(), { purpose, subject: email });
  const sent = await sendOTPEmail(email, name, otp, scenario);
  if (!sent) throw new OtpError("EMAIL_FAILED", "We couldn't send the verification email. Please try again shortly.", 503);
};

// POST /api/users/me/tour {status: "completed"|"skipped", version, step}
// Remembers that this user has seen the welcome tour (on every device).
const TOUR_STATUSES = new Set(["completed", "skipped"]);
router.post("/me/tour", auth, async (req, res, next) => {
  try {
    const status = String(req.body?.status || "");
    if (!TOUR_STATUSES.has(status)) return res.status(400).json({ detail: "status must be completed or skipped" });
    const version = Math.min(Math.max(parseInt(req.body?.version, 10) || 1, 1), 100);
    const step = Math.min(Math.max(parseInt(req.body?.step, 10) || 0, 0), 100);
    const tour = { status, version, step, at: new Date().toISOString() };
    await db().collection("users").updateOne({ id: req.user.id }, { $set: { onboarding_tour: tour } });
    res.json({ tour: { status, version, at: tour.at } });
  } catch (error) {
    next(error);
  }
});

// POST /api/users/me/early-access-terms {version}
// The user accepted the early access terms (shown after an access code).
const EARLY_ACCESS_TERMS_VERSION = 1;
router.post("/me/early-access-terms", auth, async (req, res, next) => {
  try {
    const version = parseInt(req.body?.version, 10);
    if (version !== EARLY_ACCESS_TERMS_VERSION) {
      return res.status(409).json({ detail: "These terms have been updated. Please reload the page and read them again." });
    }
    const terms = {
      version,
      accepted_at: new Date().toISOString(),
      ip: req.ip,
      user_agent: String(req.headers["user-agent"] || "").slice(0, 200),
    };
    await db().collection("users").updateOne({ id: req.user.id }, { $set: { early_access_terms: terms } });
    res.json({ early_access_terms: { version, accepted_at: terms.accepted_at } });
  } catch (error) {
    next(error);
  }
});

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

    const accountId = req.account_id;
    const existing = await db().collection("users").findOne({ email: data.email }, { projection: { id: 1, verified: 1, pharmacy_id: 1, seat_id: 1 } });
    if (existing && !(existing.verified === false && existing.pharmacy_id === accountId)) {
      return res.status(409).json({ code: "EMAIL_EXISTS", detail: "This email is already registered" });
    }

    // Access: copied from another user, or as given
    const accountPharmacyIds = (await account.accountPharmacies(db(), accountId)).map((p) => p.id);
    let perms;
    try {
      if (data.copy_from_user_id) {
        const src = await db().collection("users").findOne({ id: data.copy_from_user_id, pharmacy_id: accountId }, { projection: { permissions: 1, role: 1 } });
        if (!src) return res.status(404).json({ detail: "The user to copy access from wasn't found" });
        perms = permissions.sanitize(src.permissions || permissions.LEGACY_FULL, accountPharmacyIds);
      } else {
        perms = permissions.sanitize(data.permissions || { preset: "BILLING_COUNTER", ...permissions.PRESETS.BILLING_COUNTER }, accountPharmacyIds);
      }
    } catch (e) {
      return res.status(400).json({ code: "INVALID_PERMISSIONS", detail: e.message });
    }

    const userId = existing?.id || uuidv4();
    // A user needs a seat: the plan's included one, or a paid extra
    let seatId = existing?.seat_id || null;
    if (!seatId) {
      const cfg = await pricing.getAddonConfig(db());
      const seat = await account.claimSeat(db(), accountId, userId, cfg.included_users);
      if (!seat) {
        return res.status(402).json({ code: "SEAT_REQUIRED", detail: "All your user licences are in use. Add an extra user to invite another pharmacist." });
      }
      seatId = seat.id;
    }
    const userData = {
      id: userId,
      name: data.name,
      email: data.email,
      mobile: data.mobile,
      password_hash: await bcrypt.hash(data.password, 12),
      role: "PHARMACIST",
      permissions: perms,
      seat_id: seatId,
      pharmacy_id: accountId,
      is_primary_admin: false,
      verified: false,
      token_version: 0,
      image_url: null,
      invited_by: req.user.id,
      created_at: new Date().toISOString(),
    };
    try {
      await db().collection("users").updateOne({ id: userId }, { $set: userData }, { upsert: true });
    } catch (e) {
      if (!existing) await account.releaseSeat(db(), userId);
      throw e;
    }

    await sendCode(data.email, data.name, "invite", "user_invite");
    await logActivity(db(), req.user.pharmacy_id, req.user.id, req.user.name, "CREATE", "USERS", userId, `Invited staff member ${data.name}`, `/users`);

    res.status(201).json({
      message: `We've sent a 6-digit code to ${data.email}. Enter it to finish adding them.`,
      pending_id: userId,
      user: { id: userId, name: data.name, email: data.email, mobile: data.mobile, role: "PHARMACIST" },
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
      pharmacy_id: req.account_id,
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
    const user = await db().collection("users").findOne({ id: String(req.params.user_id), pharmacy_id: req.account_id, verified: false });
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
    const full = req.user.role === "ADMIN";
    const users = await db()
      .collection("users")
      .find(
        { pharmacy_id: req.account_id },
        { projection: { _id: 0, id: 1, name: 1, email: 1, mobile: 1, role: 1, is_primary_admin: 1, verified: 1, image_url: 1, created_at: 1, last_login_at: 1, ...(full ? { permissions: 1, seat_id: 1, seat_exempt: 1, disabled_at: 1, active_session_id: 1, active_sessions: 1 } : {}) } }
      )
      .toArray();
    if (!full) return res.json({ users });
    const seatIds = users.map((u) => u.seat_id).filter(Boolean);
    const seats = seatIds.length ? await db().collection(account.ADDONS).find({ id: { $in: seatIds } }, { projection: { _id: 0 } }).toArray() : [];
    const seatOf = Object.fromEntries(seats.map((x) => [x.id, x]));
    const live = await db().collection(sessions.SESSIONS).find({ id: { $in: users.flatMap((u) => sessions.liveIds(u)) }, ended_at: null }, { projection: { _id: 0, family: 0, device_key: 0 } }).toArray();
    const sessionOf = Object.fromEntries(live.map((x) => [x.id, x]));
    res.json({
      users: users.map((u) => {
        const seat = u.seat_id ? seatOf[u.seat_id] : null;
        const live = sessions.liveIds(u).map((id) => sessionOf[id]).filter((x) => x && sessions.isLive(x));
        const { active_session_id, active_sessions, ...rest } = u;
        return {
          ...rest,
          access: u.role === "ADMIN" ? { full: true } : { full: false, ...(u.permissions || permissions.LEGACY_FULL) },
          seat: u.is_primary_admin
            ? null
            : seat
              ? { id: seat.id, kind: seat.kind, cycle: seat.cycle, ends_at: seat.ends_at, active: account.addonActive(seat) && seat.assigned_user_id === u.id }
              : { kind: u.seat_exempt === "LEGACY" ? "LEGACY" : "NONE", active: u.seat_exempt === "LEGACY" },
          session: live[0] ? sessions.publicSession(live[0]) : null,
          sessions: live.map((x) => sessions.publicSession(x)),
        };
      }),
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/users/:user_id
router.delete("/:user_id", auth, requireSubscription(), adminOnly, async (req, res, next) => {
  try {
    const user = await db().collection("users").findOne({ id: String(req.params.user_id), pharmacy_id: req.account_id });
    if (!user) {
      return res.status(404).json({ detail: "User not found" });
    }
    if (user.is_primary_admin) {
      return res.status(403).json({ detail: "Cannot delete primary admin" });
    }
    if (user.id === req.user.id) {
      return res.status(400).json({ detail: "You cannot delete your own account" });
    }

    await db().collection("users").deleteOne({ id: user.id, pharmacy_id: req.account_id });
    await revokeAllForUser(db(), user.id, "user_deleted");
    await account.releaseSeat(db(), user.id);
    invalidateAccessCache(user.id);
    await logActivity(db(), req.user.pharmacy_id, req.user.id, req.user.name, "DELETE", "USERS", user.id, `Removed staff member ${user.name}`, `/users`);
    res.json({ message: "User deleted" });
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

// POST /api/users/me/profile - Save name, mobile and photo together. Changing the
// name or mobile needs the emailed code; a photo on its own doesn't. The photo is
// stored first so a failed upload leaves the code usable and nothing saved.
router.post("/me/profile", auth, requireSubscription(), acceptImage("avatar"), async (req, res, next) => {
  let avatarKey = null;
  try {
    const currentPhone = req.user.mobile || req.user.phone || "";
    const rawPhone = String(req.body.phone ?? "").trim();
    const phoneChanged = rawPhone !== currentPhone;
    if (phoneChanged && !rawPhone) {
      return res.status(400).json({ detail: "Mobile number can't be removed" });
    }
    const data = schemas.validate(profileSchema, { name: req.body.name, phone: phoneChanged ? rawPhone : "" }, res);
    if (!data) return;

    const detailsChanged = data.name !== req.user.name || phoneChanged;
    if (detailsChanged && !req.body.otp) {
      return res.status(400).json({ code: "OTP_REQUIRED", detail: "Enter the code sent to your email" });
    }

    const update = { name: data.name, ...(phoneChanged ? { mobile: data.phone } : {}) };
    if (req.file) {
      avatarKey = `avatars/${req.user.id}-${Date.now()}.${imageExtension(req.file)}`;
      try {
        update.image_url = await uploadToR2(avatarKey, req.file.buffer, req.file.mimetype);
      } catch (uploadError) {
        console.error("Avatar upload failed:", uploadError.message);
        avatarKey = null;
        return storeImageError(res);
      }
    } else if (req.body.remove_avatar === "true") {
      update.image_url = null;
    }

    if (detailsChanged) {
      await verifyOtp(db(), { purpose: "profile", subject: req.user.email, otp: String(req.body.otp) });
    }

    await db().collection("users").updateOne({ id: req.user.id }, { $set: update });

    const updated = await db().collection("users").findOne({ id: req.user.id });
    const pharmacy = await db().collection("pharmacies").findOne({ id: req.user.pharmacy_id }, { projection: { subscription: 1 } });
    await logActivity(db(), req.user.pharmacy_id, req.user.id, req.user.name, "UPDATE", "USERS", req.user.id, `Updated their profile`, `/settings`);
    res.json({ message: "Profile updated", user: publicUser(updated, pharmacy) });
  } catch (error) {
    if (avatarKey) deleteFromR2(avatarKey).catch(() => {});
    sendOtpError(res, error, next);
  }
});

// ---- Access management (owner / admins) ------------------------------------------

const loadTeamUser = async (req, res) => {
  const user = await db().collection("users").findOne({ id: String(req.params.user_id), pharmacy_id: req.account_id }, { projection: { _id: 0, password_hash: 0, password: 0 } });
  if (!user) {
    res.status(404).json({ detail: "User not found" });
    return null;
  }
  if (user.is_primary_admin || user.role === "ADMIN") {
    res.status(400).json({ detail: "Admins always have full access" });
    return null;
  }
  return user;
};

// GET /api/users/access/schema — modules, actions, restrictions, presets and
// the account's pharmacies, for the access editor
router.get("/access/schema", auth, adminOnly, async (req, res, next) => {
  try {
    const pharmacies = await account.accountPharmacies(db(), req.account_id);
    const cfg = await pricing.getAddonConfig(db());
    const seats = await account.seatSummary(db(), req.account_id, cfg.included_users);
    res.json({
      modules: permissions.MODULES,
      restrictions: permissions.RESTRICTIONS,
      presets: Object.entries(permissions.PRESETS).map(([key, p]) => ({ key, label: p.label, modules: p.modules, restrictions: p.restrictions })),
      pharmacies: pharmacies.map((p) => ({ id: p.id, name: p.name, primary: p.id === req.account_id })),
      seats: { included: seats.included, purchased: seats.purchased, total: seats.total, used: seats.used, free: seats.free },
      seat_prices: { monthly_paise: cfg.user_seat.monthly_paise, yearly_paise: cfg.user_seat.yearly_paise, enabled: cfg.user_seat.enabled },
    });
  } catch (error) {
    next(error);
  }
});

// PUT /api/users/:user_id/permissions { permissions } | { copy_from_user_id }
router.put("/:user_id/permissions", auth, adminOnly, async (req, res, next) => {
  try {
    const user = await loadTeamUser(req, res);
    if (!user) return;
    const accountPharmacyIds = (await account.accountPharmacies(db(), req.account_id)).map((p) => p.id);
    let perms;
    try {
      if (req.body?.copy_from_user_id) {
        const src = await db().collection("users").findOne({ id: String(req.body.copy_from_user_id), pharmacy_id: req.account_id }, { projection: { permissions: 1 } });
        if (!src) return res.status(404).json({ detail: "The user to copy access from wasn't found" });
        perms = permissions.sanitize(src.permissions || permissions.LEGACY_FULL, accountPharmacyIds);
      } else {
        perms = permissions.sanitize(req.body?.permissions, accountPharmacyIds);
      }
    } catch (e) {
      return res.status(400).json({ code: "INVALID_PERMISSIONS", detail: e.message });
    }
    await db().collection("users").updateOne({ id: user.id }, { $set: { permissions: { ...perms, updated_at: new Date().toISOString(), updated_by: req.user.id } } });
    invalidateAccessCache(user.id);
    await logActivity(db(), req.user.pharmacy_id, req.user.id, req.user.name, "UPDATE", "USERS", user.id, `Changed access for ${user.name}`, `/users`);
    res.json({ message: `Access updated for ${user.name}`, permissions: perms });
  } catch (error) {
    next(error);
  }
});

// POST /api/users/:user_id/status { enabled } — switch a user off or on
router.post("/:user_id/status", auth, adminOnly, async (req, res, next) => {
  try {
    const user = await loadTeamUser(req, res);
    if (!user) return;
    const enabled = req.body?.enabled === true;
    if (enabled) {
      await db().collection("users").updateOne({ id: user.id }, { $unset: { disabled_at: "", disabled_by: "" } });
    } else {
      await db().collection("users").updateOne({ id: user.id }, { $set: { disabled_at: new Date().toISOString(), disabled_by: req.user.id } });
      await revokeAllForUser(db(), user.id, "user_disabled");
    }
    invalidateAccessCache(user.id);
    await logActivity(db(), req.user.pharmacy_id, req.user.id, req.user.name, "UPDATE", "USERS", user.id, `${enabled ? "Switched on" : "Switched off"} ${user.name}`, `/users`);
    res.json({ message: enabled ? `${user.name} can sign in again` : `${user.name} is switched off and signed out` });
  } catch (error) {
    next(error);
  }
});

// POST /api/users/:user_id/seat — give a user without a live seat a free one
router.post("/:user_id/seat", auth, adminOnly, async (req, res, next) => {
  try {
    const user = await loadTeamUser(req, res);
    if (!user) return;
    const problem = await account.seatProblem(db(), user);
    if (!problem) return res.json({ message: `${user.name} already has a licence` });
    if (user.seat_id) await account.releaseSeat(db(), user.id);
    const cfg = await pricing.getAddonConfig(db());
    const seat = await account.claimSeat(db(), req.account_id, user.id, cfg.included_users);
    if (!seat) return res.status(402).json({ code: "SEAT_REQUIRED", detail: "No free user licence. Add an extra user first." });
    invalidateAccessCache(user.id);
    res.json({ message: `${user.name} now has a user licence` });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
