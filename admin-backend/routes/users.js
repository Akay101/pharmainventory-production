const express = require("express");
const router = express.Router();
const { resolveDbEnv } = require("../db/connections");
const { describe } = require("../services/billing/subscriptions");
const { userJourney, pendingJourney } = require("../services/journey");
const { offerIndex, SOURCE: OFFER_SOURCE } = require("../services/offerLeads");
const crypto = require("crypto");
const { z } = require("zod");
const { requireSuperAdmin, requireSessionAdmin, requireRole } = require("../middleware/auth");
const resetLinks = require("../services/resetLinks");
const { sendTextEmail } = require("../services/email");
const { audit, actorOf, parseBody } = require("../services/audit");
const W = require("../services/credits/wallet");
const otp = require("../services/actionOtp");
const offboard = require("../services/offboard");

router.use(resolveDbEnv);

// GET /api/users - List all users with pagination, search, status filter
router.get("/", async (req, res, next) => {
  try {
    const db = req.db;
    const { search, filter = "ALL", role, page = 1, limit = 50 } = req.query;
    const now = new Date();

    const [users, pharmacies, subscriptions, pending, paidTotals] = await Promise.all([
      db.collection("users").find({}, { projection: { password_hash: 0, password: 0 } }).toArray(),
      db.collection("pharmacies").find({}).toArray(),
      db.collection("subscriptions").find({}).toArray(),
      db
        .collection("pending_registrations")
        .find({}, { projection: { password_hash: 0 } })
        .toArray()
        .catch(() => []),
      db
        .collection("payment_orders")
        .aggregate([{ $match: { status: "PAID" } }, { $group: { _id: "$pharmacy_id", total: { $sum: "$amount_paise" }, n: { $sum: 1 } } }])
        .toArray()
        .catch(() => []),
    ]);
    const paidBy = new Map(paidTotals.map((t) => [t._id, t]));

    // 50-50 launch offer: redeemed one of its codes, or registered on the
    // website form with the same email / mobile. The registrations DB being
    // unreachable must not break this list.
    const [offer, offerRedemptions] = await Promise.all([
      offerIndex().catch((err) => {
        console.warn("[users] 50-50 registrations unavailable:", err.message);
        return null;
      }),
      db
        .collection("promo_codes")
        .find({ source: OFFER_SOURCE }, { projection: { _id: 0, code: 1, offer_lead: 1 } })
        .toArray()
        .then(async (codes) => {
          const byCode = new Map(codes.map((c) => [c.code, c]));
          const reds = codes.length ? await db.collection("promo_redemptions").find({ code: { $in: [...byCode.keys()] }, status: "REDEEMED" }).toArray() : [];
          return new Map(reds.map((r) => [r.pharmacy_id, { ...byCode.get(r.code), redeemed_at: r.updated_at || r.created_at }]));
        })
        .catch(() => new Map()),
    ]);
    const offerFor = (u) => {
      const red = offerRedemptions.get(u.pharmacy_id);
      const reg = offer?.match(u.email, u.mobile);
      if (!red && !reg) return null;
      return {
        lead_id: red?.offer_lead?.lead_id || reg?.lead_id || null,
        registration_id: red?.offer_lead?.registration_id || reg?.registration_id || null,
        code: red?.code || null,
        code_redeemed: !!red,
        redeemed_at: red?.redeemed_at || null,
      };
    };

    const pharmacyMap = new Map();
    pharmacies.forEach((p) => {
      pharmacyMap.set(p.id, {
        name: p.name || p.pharmacy_name || "Unknown Pharmacy",
        location: p.location || "N/A",
        subscription: p.subscription === undefined ? undefined : describe(p.subscription),
      });
    });

    const activeUserSubs = new Set();
    subscriptions.forEach((s) => {
      if (s.status === "ACTIVE" && s.end_date && new Date(s.end_date) > now) {
        activeUserSubs.add(s.user_id);
      }
    });

    let mapped = users.map((u) => {
      const sub = pharmacyMap.get(u.pharmacy_id)?.subscription;
      const isSubscribed = sub
        ? sub.status === "ACTIVE" || sub.status === "TRIAL"
        : (u.subscription_plan && u.subscription_expiry && new Date(u.subscription_expiry) > now) ||
          activeUserSubs.has(u.id);
      const status = sub
        ? { ACTIVE: "SUBSCRIBED", TRIAL: "TRIAL", EXPIRED: "EXPIRED", NONE: "LEAD" }[sub.status]
        : isSubscribed
          ? "SUBSCRIBED"
          : "LEAD";

      const pharmInfo = pharmacyMap.get(u.pharmacy_id) || {
        name: "Unassigned",
        location: "N/A",
      };

      return {
        id: u.id,
        name: u.name || "Unnamed",
        email: u.email,
        mobile: u.mobile || "N/A",
        role: u.role || "STAFF",
        is_primary_admin: !!u.is_primary_admin,
        verified: !!u.verified,
        pharmacy_id: u.pharmacy_id,
        pharmacy_name: pharmInfo.name,
        pharmacy_location: pharmInfo.location,
        subscription_plan: sub ? sub.plan || "NONE" : u.subscription_plan || "NONE",
        subscription_expiry: sub ? sub.ends_at : u.subscription_expiry || null,
        subscription: sub || null,
        days_left: sub ? sub.days_left : null,
        total_paid_paise: paidBy.get(u.pharmacy_id)?.total || 0,
        payments: paidBy.get(u.pharmacy_id)?.n || 0,
        is_subscribed: isSubscribed,
        status,
        kind: "USER",
        offer_5050: offerFor(u),
        last_login_at: u.last_login_at || null,
        created_at: u.created_at,
      };
    });

    // Signups that never verified their email (no user/pharmacy yet)
    const registeredEmails = new Set(users.map((u) => u.email));
    for (const p of pending) {
      if (registeredEmails.has(p.email)) continue;
      mapped.push({
        id: `pending:${p.id || p.email}`,
        name: p.name || "Pending signup",
        email: p.email,
        mobile: p.mobile || "N/A",
        role: "ADMIN",
        is_primary_admin: true,
        verified: false,
        pharmacy_id: null,
        pharmacy_name: p.pharmacy?.name || "Not created yet",
        pharmacy_location: p.pharmacy?.location || "N/A",
        subscription_plan: "NONE",
        subscription_expiry: null,
        subscription: null,
        days_left: null,
        is_subscribed: false,
        status: "INCOMPLETE",
        kind: "PENDING_SIGNUP",
        offer_5050: (() => {
          const reg = offer?.match(p.email, p.mobile);
          return reg ? { lead_id: reg.lead_id, registration_id: reg.registration_id, code: null, code_redeemed: false, redeemed_at: null } : null;
        })(),
        created_at: p.created_at ? new Date(p.created_at).toISOString() : null,
      });
    }

    // Apply search filter
    if (search) {
      const term = search.toLowerCase();
      mapped = mapped.filter(
        (u) =>
          u.name.toLowerCase().includes(term) ||
          u.email.toLowerCase().includes(term) ||
          u.mobile.toLowerCase().includes(term) ||
          u.pharmacy_name.toLowerCase().includes(term)
      );
    }

    // Filter by subscription status
    if (filter === "SUBSCRIBED") {
      mapped = mapped.filter((u) => u.status === "SUBSCRIBED");
    } else if (filter === "TRIAL") {
      mapped = mapped.filter((u) => u.status === "TRIAL");
    } else if (filter === "EXPIRED") {
      mapped = mapped.filter((u) => u.status === "EXPIRED");
    } else if (filter === "INCOMPLETE") {
      mapped = mapped.filter((u) => u.status === "INCOMPLETE");
    } else if (filter === "LEAD") {
      mapped = mapped.filter((u) => !u.is_subscribed);
    } else if (filter === "OFFER_5050") {
      mapped = mapped.filter((u) => u.offer_5050);
    }

    // Filter by role
    if (role && role !== "ALL") {
      mapped = mapped.filter((u) => u.role === role);
    }

    mapped.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

    const total = mapped.length;
    const startIndex = (parseInt(page) - 1) * parseInt(limit);
    const paginated = mapped.slice(startIndex, startIndex + parseInt(limit));

    res.json({
      env: req.dbEnv,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      users: paginated,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/users/:id - Full journey: plan state, timeline, usage, payments.
// "pending:<id>" addresses a signup that never verified its email.
router.get("/:id", async (req, res, next) => {
  try {
    const db = req.db;
    const id = String(req.params.id);

    if (id.startsWith("pending:")) {
      const key = id.slice("pending:".length);
      const pending = await db
        .collection("pending_registrations")
        .findOne({ $or: [{ id: key }, { email: key }] }, { projection: { password_hash: 0 } });
      if (!pending) return res.status(404).json({ error: "Signup not found (it may have been completed or expired)" });
      return res.json({
        env: req.dbEnv,
        kind: "PENDING_SIGNUP",
        user: {
          id,
          name: pending.name,
          email: pending.email,
          mobile: pending.mobile,
          role: "ADMIN",
          verified: false,
          created_at: pending.created_at,
        },
        pharmacy: { id: null, name: pending.pharmacy?.name, location: pending.pharmacy?.location },
        ...(await pendingJourney(db, pending)),
      });
    }

    const user = await db.collection("users").findOne({ id }, { projection: { password_hash: 0, password: 0 } });
    if (!user) return res.status(404).json({ error: "User not found" });
    const pharmacy = user.pharmacy_id
      ? await db.collection("pharmacies").findOne({ id: user.pharmacy_id }, { projection: { _id: 0, id: 1, name: 1, location: 1, license_no: 1, contact: 1, created_at: 1 } })
      : null;
    const owner =
      pharmacy && !user.is_primary_admin
        ? await db.collection("users").findOne({ pharmacy_id: pharmacy.id, is_primary_admin: true }, { projection: { _id: 0, id: 1, name: 1, email: 1 } })
        : null;

    res.json({
      env: req.dbEnv,
      kind: "USER",
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        mobile: user.mobile,
        role: user.role,
        is_primary_admin: !!user.is_primary_admin,
        verified: user.verified !== false,
        created_at: user.created_at,
        last_login_at: user.last_login_at || null,
      },
      pharmacy,
      owner,
      credits: pharmacy
        ? await db
            .collection(W.WALLETS)
            .findOne({ pharmacy_id: pharmacy.id }, { projection: { _id: 0, balance_milli: 1 } })
            .then((w) => ({ balance: W.toCredits(w?.balance_milli || 0) }))
        : null,
      ...(await userJourney(db, user)),
    });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// AI credits for the user's pharmacy (the wallet is shared by its staff)

const grantSchema = z.object({
  credits: z.number().positive().max(1_000_000),
  reason: z.string().trim().min(3, "Add a short reason").max(300),
  // Client-made id: a double click or retry grants once
  request_id: z.string().uuid().optional(),
});

// POST /api/users/:id/credits { credits, reason, request_id }
router.post("/:id/credits", requireSuperAdmin, async (req, res, next) => {
  try {
    const data = parseBody(grantSchema, req, res);
    if (!data) return;
    const user = await req.db.collection("users").findOne({ id: String(req.params.id) }, { projection: { _id: 0, id: 1, name: 1, email: 1, pharmacy_id: 1 } });
    if (!user) return res.status(404).json({ error: "User not found" });
    if (!user.pharmacy_id) return res.status(400).json({ error: "This user has no pharmacy, so there is no credit wallet to add to." });
    const pharmacy = await req.db.collection("pharmacies").findOne({ id: user.pharmacy_id }, { projection: { _id: 0, id: 1, name: 1 } });
    if (!pharmacy) return res.status(404).json({ error: "Pharmacy not found" });
    const r = await W.credit(req.db, pharmacy.id, {
      milli: W.toMilli(data.credits),
      type: "ADMIN_GRANT",
      ref: `admin_grant:${data.request_id || crypto.randomUUID()}`,
      userId: user.id,
      actor: actorOf(req),
      note: data.reason,
    });
    if (!r.duplicate) {
      await audit(req, "CREDITS_GRANT", pharmacy.id, { credits: data.credits, reason: data.reason, user_id: user.id, user_email: user.email, via: "users" });
    }
    res.json({ ok: true, duplicate: !!r.duplicate, balance: W.toCredits(r.wallet?.balance_milli || 0), wallet: r.wallet ? W.view(r.wallet) : null });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Password reset link: the admin picks how long it stays valid; it can be
// emailed by the server and/or sent from the admin's own WhatsApp. The plain
// link is only in this response; the database keeps its hash.

const linkSchema = z
  .object({
    expires_in_minutes: z.number().int().min(resetLinks.MIN_MINUTES).max(resetLinks.MAX_MINUTES).optional(),
    expires_at: z.string().datetime().optional(),
    send_email: z.boolean().default(false),
  })
  .refine((d) => d.expires_in_minutes || d.expires_at, { message: "Pick how long the link stays valid", path: ["expires_in_minutes"] });

let linkIndexes = null;
const canIssueLinks = [requireRole("SUPERADMIN", "ADMIN"), requireSessionAdmin];

// POST /api/users/:id/reset-link { expires_in_minutes | expires_at, send_email }
router.post("/:id/reset-link", ...canIssueLinks, async (req, res, next) => {
  try {
    const data = parseBody(linkSchema, req, res);
    if (!data) return;
    const id = userIdOf(req);
    if (!id) return res.status(400).json({ error: "This person hasn't finished signing up yet" });
    const user = await req.db.collection("users").findOne({ id }, { projection: { _id: 0, id: 1, name: 1, email: 1, mobile: 1, pharmacy_id: 1, verified: 1 } });
    if (!user) return res.status(404).json({ error: "User not found" });
    if (user.verified === false || !user.email) return res.status(400).json({ error: "This account isn't verified, so it can't sign in yet" });

    const now = Date.now();
    const expiresAt = data.expires_at ? new Date(data.expires_at) : new Date(now + data.expires_in_minutes * 60000);
    const minutes = (expiresAt.getTime() - now) / 60000;
    if (minutes < resetLinks.MIN_MINUTES - 1 || minutes > resetLinks.MAX_MINUTES + 1)
      return res.status(400).json({ error: `The link must stay valid between ${resetLinks.MIN_MINUTES} minutes and 7 days` });

    linkIndexes = linkIndexes || resetLinks.ensureIndexes(req.db).catch((err) => ((linkIndexes = null), console.warn("[ResetLinks] indexes:", err.message)));
    await linkIndexes;
    const { doc, url } = await resetLinks.issue(req.db, { user, env: req.dbEnv, expiresAt, actor: actorOf(req) });
    const text = resetLinks.messageText({ name: user.name, url, expiresAt });

    let email = null;
    if (data.send_email) {
      try {
        const out = await sendTextEmail({ toEmail: user.email, toName: user.name, subject: "Set a new DavaDesk password", text });
        email = { sent: true, provider: out.provider };
        await req.db.collection(resetLinks.COLLECTION).updateOne({ id: doc.id }, { $set: { "channels.email": { sent_at: new Date(), provider: out.provider, to: user.email } } });
      } catch (err) {
        email = { sent: false, error: err.message };
      }
    }
    await audit(req, "PASSWORD_LINK_ISSUED", user.id, { link_id: doc.id, email: user.email, expires_at: expiresAt, emailed: !!email?.sent });
    res.status(201).json({
      link: { ...resetLinks.view(doc), url },
      message: text,
      whatsapp_url: resetLinks.whatsappUrl(user.mobile, text),
      email,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/users/:id/reset-links/:linkId/whatsapp  marks it sent by WhatsApp (for the history)
router.post("/:id/reset-links/:linkId/whatsapp", ...canIssueLinks, async (req, res, next) => {
  try {
    await req.db.collection(resetLinks.COLLECTION).updateOne({ id: String(req.params.linkId), user_id: String(req.params.id) }, { $set: { "channels.whatsapp": { opened_at: new Date(), by: actorOf(req).admin_email } } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// GET /api/users/:id/reset-links  history, newest first (never the token)
router.get("/:id/reset-links", async (req, res, next) => {
  try {
    const rows = await req.db.collection(resetLinks.COLLECTION).find({ user_id: String(req.params.id) }, { projection: { _id: 0, token_hash: 0 } }).sort({ created_at: -1 }).limit(20).toArray();
    res.json({ links: rows.map(resetLinks.view) });
  } catch (err) {
    next(err);
  }
});

// POST /api/users/:id/reset-links/:linkId/revoke
router.post("/:id/reset-links/:linkId/revoke", ...canIssueLinks, async (req, res, next) => {
  try {
    const r = await req.db
      .collection(resetLinks.COLLECTION)
      .updateOne({ id: String(req.params.linkId), user_id: String(req.params.id), used_at: null, revoked_at: null }, { $set: { revoked_at: new Date(), revoked_reason: "REVOKED_BY_ADMIN", revoked_by: actorOf(req) } });
    if (!r.modifiedCount) return res.status(409).json({ error: "This link is already used, revoked or gone" });
    await audit(req, "PASSWORD_LINK_REVOKED", String(req.params.id), { link_id: req.params.linkId });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Offboard: permanently delete a user (and, for an owner, the pharmacy).
// preview -> emailed code to the admin -> delete with code + typed name.
// The server rebuilds the plan at delete time; the client only names the user.

const OFFBOARD = "OFFBOARD_USER";
function userIdOf(req) {
  const id = String(req.params.id || "");
  return id && !id.startsWith("pending:") && id.length <= 100 ? id : null;
}
const sendErr = (res, err) => res.status(err.status).json({ error: err.message, ...(err.code ? { code: err.code } : {}), ...(err.attempts_left !== undefined ? { attempts_left: err.attempts_left } : {}), ...(err.wait_seconds ? { wait_seconds: err.wait_seconds } : {}) });

// GET /api/users/:id/offboard/preview
router.get("/:id/offboard/preview", requireSuperAdmin, requireSessionAdmin, async (req, res, next) => {
  try {
    const id = userIdOf(req);
    if (!id) return res.status(400).json({ error: "Only registered users can be offboarded" });
    const plan = await offboard.buildPlan(req.db, id);
    if (!plan) return res.status(404).json({ error: "User not found" });
    res.json({ env: req.dbEnv, ...offboard.publicPlan(plan), otp_ttl_minutes: otp.TTL_MS / 60000 });
  } catch (err) {
    next(err);
  }
});

// POST /api/users/:id/offboard/otp: email a code to the signed-in admin
router.post("/:id/offboard/otp", requireSuperAdmin, requireSessionAdmin, async (req, res, next) => {
  try {
    const id = userIdOf(req);
    if (!id) return res.status(400).json({ error: "Only registered users can be offboarded" });
    const user = await req.db.collection("users").findOne({ id }, { projection: { _id: 0, id: 1, email: 1 } });
    if (!user) return res.status(404).json({ error: "User not found" });
    const r = await otp.issue({ admin: req.adminUser, purpose: OFFBOARD, env: req.dbEnv, target: id, scenario: OFFBOARD });
    await audit(req, "OFFBOARD_CODE_SENT", id, { user_email: user.email });
    res.json({ ok: true, ...r });
  } catch (err) {
    if (err.expose) return sendErr(res, err);
    next(err);
  }
});

const offboardSchema = z.object({
  challenge_id: z.string().min(10).max(100),
  otp: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code"),
  confirm_name: z.string().trim().min(1, "Type the name to confirm").max(200),
});

// POST /api/users/:id/offboard { challenge_id, otp, confirm_name }
router.post("/:id/offboard", requireSuperAdmin, requireSessionAdmin, async (req, res, next) => {
  try {
    const id = userIdOf(req);
    if (!id) return res.status(400).json({ error: "Only registered users can be offboarded" });
    const data = parseBody(offboardSchema, req, res);
    if (!data) return;
    const plan = await offboard.buildPlan(req.db, id);
    if (!plan) return res.status(404).json({ error: "User not found" });
    if (!offboard.sameName(data.confirm_name, plan.scope.confirmName)) {
      return res.status(400).json({ error: `Type "${plan.scope.confirmName}" exactly to confirm.`, code: "CONFIRM_NAME_MISMATCH" });
    }
    try {
      await otp.consume({ admin: req.adminUser, challengeId: data.challenge_id, code: data.otp, purpose: OFFBOARD, env: req.dbEnv, target: id });
    } catch (err) {
      if (!err.expose) throw err;
      await audit(req, "OFFBOARD_CODE_REJECTED", id, { reason: err.code || err.message });
      return sendErr(res, err);
    }
    const summary = offboard.publicPlan(plan);
    const result = await offboard.execute(req.db, plan, actorOf(req));
    await audit(req, "USER_OFFBOARDED", id, {
      kind: summary.kind,
      user: summary.user,
      pharmacy: summary.pharmacy,
      users: summary.users,
      planned: summary.collections,
      deleted: result.deleted,
      total_deleted: result.total,
      file_prefixes: summary.files,
    });
    res.json({ ok: true, kind: summary.kind, deleted: result.deleted, total: result.total });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
