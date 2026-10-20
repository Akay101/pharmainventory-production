const express = require("express");
const router = express.Router();
const { resolveDbEnv } = require("../db/connections");

router.use(resolveDbEnv);

// Helper to generate 8-character alphanumeric code
function generateRandomCode(length = 8) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// GET /api/promos - List all promo codes with stats
router.get("/", async (req, res, next) => {
  try {
    const db = req.db;
    const { status, plan, search } = req.query;

    const promos = await db.collection("promo_codes").find({}).sort({ created_at: -1 }).toArray();

    let filtered = promos.map((p) => ({
      _id: p._id,
      code: p.code,
      plan: p.plan,
      duration_days: p.duration_days,
      is_active: p.is_active,
      usage_limit: p.usage_limit || 1,
      used_count: p.used_count || 0,
      created_at: p.created_at,
      used_at: p.used_at || null,
      used_by_pharmacy_name: p.used_by_pharmacy_name || null,
      used_by_pharmacy_id: p.used_by_pharmacy_id || null,
      used_by_user_id: p.used_by_user_id || null,
      status: !p.is_active
        ? "INACTIVE"
        : (p.used_count || 0) >= (p.usage_limit || 1)
        ? "EXHAUSTED"
        : "ACTIVE",
    }));

    if (search) {
      const term = search.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.code.toLowerCase().includes(term) ||
          (p.used_by_pharmacy_name && p.used_by_pharmacy_name.toLowerCase().includes(term))
      );
    }

    if (status && status !== "ALL") {
      filtered = filtered.filter((p) => p.status === status);
    }

    if (plan && plan !== "ALL") {
      filtered = filtered.filter((p) => p.plan === plan);
    }

    const summary = {
      total: promos.length,
      active: promos.filter((p) => p.is_active && (p.used_count || 0) < (p.usage_limit || 1)).length,
      redeemed: promos.filter((p) => (p.used_count || 0) > 0).length,
      exhausted: promos.filter((p) => (p.used_count || 0) >= (p.usage_limit || 1)).length,
    };

    res.json({
      env: req.dbEnv,
      summary,
      total: filtered.length,
      promo_codes: filtered,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/promos/generate - Generate promo code
router.post("/generate", async (req, res, next) => {
  try {
    const db = req.db;
    const { plan, duration_days, code: customCode, usage_limit = 1, notes } = req.body;

    if (!["BASIC", "ADVANCED", "AGENTIC"].includes(plan)) {
      return res.status(400).json({ detail: "Invalid plan. Choose BASIC, ADVANCED, or AGENTIC." });
    }

    const duration = parseInt(duration_days);
    if (!duration || duration <= 0) {
      return res.status(400).json({ detail: "Invalid duration_days. Must be positive." });
    }

    const promoCode = customCode ? customCode.trim().toUpperCase() : generateRandomCode(8);

    // Check if code already exists
    const existing = await db.collection("promo_codes").findOne({ code: promoCode });
    if (existing) {
      return res.status(400).json({ detail: `Promo code "${promoCode}" already exists` });
    }

    const newPromo = {
      code: promoCode,
      plan,
      duration_days: duration,
      is_active: true,
      usage_limit: parseInt(usage_limit) || 1,
      used_count: 0,
      notes: notes || null,
      created_by: "Admin Panel",
      created_at: new Date().toISOString(),
    };

    await db.collection("promo_codes").insertOne(newPromo);

    res.status(201).json({
      message: "Promo code generated successfully",
      promo: newPromo,
    });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/promos/:code/toggle - Toggle active status
router.patch("/:code/toggle", async (req, res, next) => {
  try {
    const db = req.db;
    const code = req.params.code.toUpperCase();

    const promo = await db.collection("promo_codes").findOne({ code });
    if (!promo) {
      return res.status(404).json({ detail: "Promo code not found" });
    }

    const newStatus = !promo.is_active;
    await db.collection("promo_codes").updateOne({ code }, { $set: { is_active: newStatus } });

    res.json({ message: `Promo code ${code} is now ${newStatus ? "active" : "inactive"}`, is_active: newStatus });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/promos/:code - Delete promo code
router.delete("/:code", async (req, res, next) => {
  try {
    const db = req.db;
    const code = req.params.code.toUpperCase();

    const result = await db.collection("promo_codes").deleteOne({ code });
    if (result.deletedCount === 0) {
      return res.status(404).json({ detail: "Promo code not found" });
    }

    res.json({ message: `Promo code ${code} deleted successfully` });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
