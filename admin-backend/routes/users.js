const express = require("express");
const router = express.Router();
const { resolveDbEnv } = require("../db/connections");
const { describe } = require("../services/billing/subscriptions");
const { userJourney, pendingJourney } = require("../services/journey");
const { offerIndex, SOURCE: OFFER_SOURCE } = require("../services/offerLeads");

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
      ...(await userJourney(db, user)),
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
