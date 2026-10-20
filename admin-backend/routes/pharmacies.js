const express = require("express");
const router = express.Router();
const { resolveDbEnv } = require("../db/connections");

router.use(resolveDbEnv);

// GET /api/pharmacies - List all pharmacies with user count & search
router.get("/", async (req, res, next) => {
  try {
    const db = req.db;
    const { search, page = 1, limit = 50, sort = "users" } = req.query;

    const [pharmacies, users, bills, inventory] = await Promise.all([
      db.collection("pharmacies").find({}).toArray(),
      db.collection("users").find({}).toArray(),
      db.collection("bills").find({}).project({ pharmacy_id: 1, total_amount: 1 }).toArray().catch(() => []),
      db.collection("inventory").find({}).project({ pharmacy_id: 1 }).toArray().catch(() => []),
    ]);

    // Aggregate counts per pharmacy
    const userCountMap = {};
    const usersByPharmMap = {};
    users.forEach((u) => {
      if (u.pharmacy_id) {
        userCountMap[u.pharmacy_id] = (userCountMap[u.pharmacy_id] || 0) + 1;
        if (!usersByPharmMap[u.pharmacy_id]) usersByPharmMap[u.pharmacy_id] = [];
        usersByPharmMap[u.pharmacy_id].push({
          id: u.id,
          name: u.name,
          email: u.email,
          mobile: u.mobile,
          role: u.role,
          subscription_plan: u.subscription_plan,
        });
      }
    });

    const billsCountMap = {};
    const revenueMap = {};
    bills.forEach((b) => {
      if (b.pharmacy_id) {
        billsCountMap[b.pharmacy_id] = (billsCountMap[b.pharmacy_id] || 0) + 1;
        revenueMap[b.pharmacy_id] = (revenueMap[b.pharmacy_id] || 0) + (Number(b.total_amount) || 0);
      }
    });

    const inventoryCountMap = {};
    inventory.forEach((i) => {
      if (i.pharmacy_id) {
        inventoryCountMap[i.pharmacy_id] = (inventoryCountMap[i.pharmacy_id] || 0) + 1;
      }
    });

    // Build enriched list
    let list = pharmacies.map((p) => {
      const userCount = userCountMap[p.id] || 0;
      return {
        id: p.id,
        name: p.name || p.pharmacy_name || "Unnamed Pharmacy",
        location: p.location || "Not specified",
        license_no: p.license_no || "N/A",
        years_old: p.years_old || null,
        contact: p.contact || null,
        pan: p.pan || null,
        gst_no: p.gst_no || null,
        logo_url: p.logo_url || null,
        user_count: userCount,
        users: usersByPharmMap[p.id] || [],
        bills_count: billsCountMap[p.id] || 0,
        total_revenue: Math.round(revenueMap[p.id] || 0),
        inventory_items_count: inventoryCountMap[p.id] || 0,
        status: userCount > 0 ? "ACTIVE" : "ONBOARDED_NO_USERS",
        created_at: p.created_at,
      };
    });

    // Search filter
    if (search) {
      const term = search.toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(term) ||
          p.location.toLowerCase().includes(term) ||
          p.license_no.toLowerCase().includes(term)
      );
    }

    // Sort
    if (sort === "users") {
      list.sort((a, b) => b.user_count - a.user_count);
    } else if (sort === "bills") {
      list.sort((a, b) => b.bills_count - a.bills_count);
    } else if (sort === "name") {
      list.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      list.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    }

    const total = list.length;
    const startIndex = (parseInt(page) - 1) * parseInt(limit);
    const paginated = list.slice(startIndex, startIndex + parseInt(limit));

    res.json({
      env: req.dbEnv,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      pharmacies: paginated,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/pharmacies/:id - Get detailed pharmacy with all users, products, bills
router.get("/:id", async (req, res, next) => {
  try {
    const db = req.db;
    const pharmacyId = req.params.id;

    const pharmacy = await db.collection("pharmacies").findOne({ id: pharmacyId });
    if (!pharmacy) {
      return res.status(404).json({ detail: "Pharmacy not found" });
    }

    const [users, productsCount, billsCount, purchasesCount] = await Promise.all([
      db.collection("users").find({ pharmacy_id: pharmacyId }).toArray(),
      db.collection("products").countDocuments({ pharmacy_id: pharmacyId }).catch(() => 0),
      db.collection("bills").countDocuments({ pharmacy_id: pharmacyId }).catch(() => 0),
      db.collection("purchases").countDocuments({ pharmacy_id: pharmacyId }).catch(() => 0),
    ]);

    const sanitizedUsers = users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      mobile: u.mobile,
      role: u.role,
      is_primary_admin: !!u.is_primary_admin,
      verified: !!u.verified,
      subscription_plan: u.subscription_plan,
      subscription_expiry: u.subscription_expiry,
      created_at: u.created_at,
    }));

    res.json({
      env: req.dbEnv,
      pharmacy: {
        ...pharmacy,
        users_count: sanitizedUsers.length,
        products_count: productsCount,
        bills_count: billsCount,
        purchases_count: purchasesCount,
        users: sanitizedUsers,
      },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
