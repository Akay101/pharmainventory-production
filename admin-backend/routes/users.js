const express = require("express");
const router = express.Router();
const { resolveDbEnv } = require("../db/connections");

router.use(resolveDbEnv);

// GET /api/users - List all users with pagination, search, status filter
router.get("/", async (req, res, next) => {
  try {
    const db = req.db;
    const { search, filter = "ALL", role, page = 1, limit = 50 } = req.query;
    const now = new Date();

    const [users, pharmacies, subscriptions] = await Promise.all([
      db.collection("users").find({}).toArray(),
      db.collection("pharmacies").find({}).toArray(),
      db.collection("subscriptions").find({}).toArray(),
    ]);

    const pharmacyMap = new Map();
    pharmacies.forEach((p) => {
      pharmacyMap.set(p.id, {
        name: p.name || p.pharmacy_name || "Unknown Pharmacy",
        location: p.location || "N/A",
      });
    });

    const activeUserSubs = new Set();
    subscriptions.forEach((s) => {
      if (s.status === "ACTIVE" && s.end_date && new Date(s.end_date) > now) {
        activeUserSubs.add(s.user_id);
      }
    });

    let mapped = users.map((u) => {
      const isSubscribed =
        (u.subscription_plan &&
          u.subscription_expiry &&
          new Date(u.subscription_expiry) > now) ||
        activeUserSubs.has(u.id);

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
        subscription_plan: u.subscription_plan || "NONE",
        subscription_expiry: u.subscription_expiry || null,
        is_subscribed: isSubscribed,
        status: isSubscribed ? "SUBSCRIBED" : "LEAD",
        created_at: u.created_at,
      };
    });

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
      mapped = mapped.filter((u) => u.is_subscribed);
    } else if (filter === "LEAD") {
      mapped = mapped.filter((u) => !u.is_subscribed);
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

// GET /api/users/:id - Single user details with activity logs
router.get("/:id", async (req, res, next) => {
  try {
    const db = req.db;
    const userId = req.params.id;

    const user = await db.collection("users").findOne({ id: userId });
    if (!user) {
      return res.status(404).json({ detail: "User not found" });
    }

    const [pharmacy, subscriptions, activities] = await Promise.all([
      user.pharmacy_id ? db.collection("pharmacies").findOne({ id: user.pharmacy_id }) : null,
      db.collection("subscriptions").find({ user_id: userId }).toArray(),
      db.collection("activities").find({ user_id: userId }).sort({ created_at: -1 }).limit(20).toArray().catch(() => []),
    ]);

    const now = new Date();
    const isSubscribed =
      (user.subscription_plan &&
        user.subscription_expiry &&
        new Date(user.subscription_expiry) > now) ||
      subscriptions.some((s) => s.status === "ACTIVE" && new Date(s.end_date) > now);

    res.json({
      env: req.dbEnv,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        mobile: user.mobile,
        role: user.role,
        is_primary_admin: !!user.is_primary_admin,
        verified: !!user.verified,
        created_at: user.created_at,
        subscription_plan: user.subscription_plan || "NONE",
        subscription_expiry: user.subscription_expiry,
        is_subscribed: isSubscribed,
      },
      pharmacy: pharmacy
        ? {
            id: pharmacy.id,
            name: pharmacy.name || pharmacy.pharmacy_name,
            location: pharmacy.location,
            license_no: pharmacy.license_no,
            contact: pharmacy.contact,
          }
        : null,
      subscriptions,
      activities,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
