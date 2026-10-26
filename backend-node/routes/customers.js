const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");
const { auth, adminOnly } = require("../middleware/auth");
const { logActivity } = require("../utils/activityLogger");

const { requireSubscription } = require("../middleware/subscription");
const tiers = require("../services/customerTiers");

const escapeRegex = (str) => {
  if (!str) return "";
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

// GET /api/customers[?search&has_debt&tier&sort=recent|visits|spend|name&page&limit&highlight_id]
// Every customer comes with its tier, discount and visit stats.
router.get("/", auth, requireSubscription(), async (req, res, next) => {
  try {
    const db = mongoose.connection.db;
    const { search, has_debt, tier, sort, page = 1, limit = 50, highlight_id } = req.query;
    const lim = Math.min(Math.max(parseInt(limit) || 50, 1), 200);

    const query = { pharmacy_id: req.user.pharmacy_id };
    if (search) {
      const escapedSearch = escapeRegex(String(search).slice(0, 100));
      query.$or = [
        { name: { $regex: escapedSearch, $options: "i" } },
        { mobile: { $regex: escapedSearch, $options: "i" } },
      ];
    }
    if (has_debt === "true") query.total_debt = { $gt: 0 };

    const config = await tiers.getConfig(db, req.user.pharmacy_id);
    const all = await db.collection("customers").find(query, { projection: { _id: 0 } }).sort({ created_at: -1 }).toArray();
    let list = await tiers.withTiers(db, req.user.pharmacy_id, all, config);

    // Counts per tier for the filter chips (before the tier filter)
    const tier_counts = Object.fromEntries(tiers.TIERS.map((t) => [t, 0]));
    list.forEach((c) => (tier_counts[c.tier] = (tier_counts[c.tier] || 0) + 1));

    if (tier && tiers.TIERS.includes(String(tier))) list = list.filter((c) => c.tier === tier);
    const sorters = {
      visits: (a, b) => b.stats.visits_window - a.stats.visits_window || b.stats.spend_total - a.stats.spend_total,
      spend: (a, b) => b.stats.spend_total - a.stats.spend_total,
      recent: (a, b) => String(b.stats.last_visit || "").localeCompare(String(a.stats.last_visit || "")),
      name: (a, b) => String(a.name || "").localeCompare(String(b.name || "")),
    };
    if (sorters[sort]) list.sort(sorters[sort]);

    let pageNum = Math.max(parseInt(page) || 1, 1);
    if (highlight_id) {
      const idx = list.findIndex((c) => c.id === highlight_id);
      if (idx !== -1) pageNum = Math.floor(idx / lim) + 1;
    }
    const total = list.length;
    const customers = list.slice((pageNum - 1) * lim, pageNum * lim);

    res.json({
      customers,
      tier_counts,
      tier_config: config,
      pagination: { page: pageNum, limit: lim, total, total_pages: Math.ceil(total / lim) || 1 },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/customers/tiers/config
router.get("/tiers/config", auth, requireSubscription(), async (req, res, next) => {
  try {
    res.json({ config: await tiers.getConfig(mongoose.connection.db, req.user.pharmacy_id), tiers: tiers.TIERS, labels: tiers.TIER_LABEL, defaults: tiers.DEFAULT_CONFIG });
  } catch (error) {
    next(error);
  }
});

// PUT /api/customers/tiers/config — admin: tier rules and default discount per tier
router.put("/tiers/config", auth, requireSubscription(), adminOnly, async (req, res, next) => {
  try {
    const db = mongoose.connection.db;
    const body = req.body || {};
    const config = tiers.normalizeConfig({
      window_days: body.window_days,
      permanent_min_visits: body.permanent_min_visits,
      running_min_visits: body.running_min_visits,
      new_within_days: body.new_within_days,
      inactive_after_days: body.inactive_after_days,
      discounts: body.discounts && typeof body.discounts === "object" ? Object.fromEntries(tiers.TIERS.map((t) => [t, body.discounts[t]])) : undefined,
      auto_apply_discount: body.auto_apply_discount,
    });
    await db.collection("pharmacies").updateOne({ id: req.user.pharmacy_id }, { $set: { customer_tiers: config } });
    await logActivity(db, req.user.pharmacy_id, req.user.id, req.user.name, "UPDATE", "CUSTOMERS", "tiers", "Updated customer tier rules", "/customers");
    res.json({ message: "Tier rules saved", config });
  } catch (error) {
    next(error);
  }
});

// PUT /api/customers/:customer_id/tier {tier_override: tier|null, custom_discount: number|null}
router.put("/:customer_id/tier", auth, requireSubscription(), adminOnly, async (req, res, next) => {
  try {
    const db = mongoose.connection.db;
    const { tier_override, custom_discount } = req.body || {};
    const set = {};
    if (tier_override !== undefined) {
      if (tier_override !== null && !tiers.TIERS.includes(tier_override)) return res.status(400).json({ detail: "Unknown tier" });
      set.tier_override = tier_override;
    }
    if (custom_discount !== undefined) {
      if (custom_discount !== null && custom_discount !== "" && !(Number(custom_discount) >= 0 && Number(custom_discount) <= 50)) {
        return res.status(400).json({ detail: "Discount must be between 0 and 50%" });
      }
      set.custom_discount = custom_discount === null || custom_discount === "" ? null : Math.round(Number(custom_discount) * 100) / 100;
    }
    if (!Object.keys(set).length) return res.status(400).json({ detail: "Nothing to change" });
    const q = { id: req.params.customer_id, pharmacy_id: req.user.pharmacy_id };
    const r = await db.collection("customers").updateOne(q, { $set: { ...set, tier_updated_at: new Date().toISOString() } });
    if (!r.matchedCount) return res.status(404).json({ detail: "Customer not found" });
    const c = await db.collection("customers").findOne(q, { projection: { _id: 0 } });
    const [withTier] = await tiers.withTiers(db, req.user.pharmacy_id, [c]);
    res.json({ message: "Saved", customer: withTier });
  } catch (error) {
    next(error);
  }
});

// POST /api/customers
router.post("/", auth, requireSubscription(), async (req, res, next) => {
  try {
    const { name, mobile, email, address } = req.body;
    const db = mongoose.connection.db;

    const customerId = uuidv4();
    const customerData = {
      id: customerId,
      pharmacy_id: req.user.pharmacy_id,
      name,
      mobile: mobile || null,
      email: email || null,
      address: address || null,
      total_debt: 0,
      total_advance: 0,
      created_at: new Date().toISOString(),
    };

    await db.collection("customers").insertOne(customerData);
    const { _id, ...customer } = customerData;
    await logActivity(db, req.user.pharmacy_id, req.user.id, req.user.name, "CREATE", "CUSTOMERS", customerId, `Added Customer ${name}`, `/customers`);

    res.status(201).json({ message: "Customer created", customer });
  } catch (error) {
    next(error);
  }
});

// GET /api/customers/search
router.get("/search", auth, requireSubscription(), async (req, res, next) => {
  try {
    const { q, limit = 10 } = req.query;
    const db = mongoose.connection.db;
    const escapedQ = escapeRegex(q || "");

    const customers = await db
      .collection("customers")
      .find(
        {
          pharmacy_id: req.user.pharmacy_id,
          $or: [
            { name: { $regex: escapedQ, $options: "i" } },
            { mobile: { $regex: escapedQ, $options: "i" } },
          ],
        },
        { projection: { _id: 0 } }
      )
      .limit(Math.min(parseInt(limit) || 10, 50))
      .toArray();

    res.json({ customers: await tiers.withTiers(db, req.user.pharmacy_id, customers) });
  } catch (error) {
    next(error);
  }
});

// GET /api/customers/:customer_id
router.get(
  "/:customer_id",
  auth,
  requireSubscription(),
  async (req, res, next) => {
    try {
      const db = mongoose.connection.db;
      const customer = await db
        .collection("customers")
        .findOne(
          { id: req.params.customer_id, pharmacy_id: req.user.pharmacy_id },
          { projection: { _id: 0 } }
        );

      if (!customer) {
        return res.status(404).json({ detail: "Customer not found" });
      }

      // Get bills
      const bills = await db
        .collection("bills")
        .find({ customer_id: req.params.customer_id })
        .sort({ created_at: -1 })
        .project({ _id: 0 })
        .toArray();

      // Aggregate stats
      const stats = await db
        .collection("bills")
        .aggregate([
          { $match: { customer_id: req.params.customer_id } },
          {
            $group: {
              _id: null,
              total_purchases: { $sum: "$total_amount" },
              total_profit: { $sum: "$profit" },
            },
          },
        ])
        .toArray();

      const totalPurchases = stats[0]?.total_purchases || 0;
      const totalProfit = stats[0]?.total_profit || 0;

      const [customerWithTier] = await tiers.withTiers(db, req.user.pharmacy_id, [customer]);
      res.json({ 
        customer: customerWithTier, 
        bills,
        stats: {
          total_purchases: totalPurchases,
          total_profit: totalProfit
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

// PUT /api/customers/:customer_id
router.put(
  "/:customer_id",
  auth,
  requireSubscription(),
  async (req, res, next) => {
    try {
      const { name, mobile, email, address } = req.body;
      const db = mongoose.connection.db;

      const result = await db
        .collection("customers")
        .updateOne(
          { id: req.params.customer_id, pharmacy_id: req.user.pharmacy_id },
          { $set: { name, mobile, email, address } }
        );

      if (result.matchedCount === 0) {
        return res.status(404).json({ detail: "Customer not found" });
      }

      await logActivity(db, req.user.pharmacy_id, req.user.id, req.user.name, "UPDATE", "CUSTOMERS", req.params.customer_id, `Updated Customer ${name}`, `/customers`);

      const customer = await db
        .collection("customers")
        .findOne({ id: req.params.customer_id }, { projection: { _id: 0 } });

      res.json({ message: "Customer updated", customer });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/customers/:customer_id/unpaid-bills
router.get(
  "/:customer_id/unpaid-bills",
  auth,
  requireSubscription(),
  async (req, res, next) => {
    try {
      const db = mongoose.connection.db;

      const bills = await db
        .collection("bills")
        .find(
          {
            pharmacy_id: req.user.pharmacy_id,
            customer_id: req.params.customer_id,
            is_paid: false,
          },
          { projection: { _id: 0 } }
        )
        .sort({ billing_date: -1 })
        .toArray();

      const totalDebt = bills.reduce((sum, b) => {
        const grandTotal = b.grand_total || b.total_amount || 0;
        const currentPaid = b.total_paid !== undefined ? b.total_paid : (b.is_paid ? grandTotal : (b.advance_amount || 0));
        let deliveredValue = 0;
        if (b.is_advance_paid) {
          deliveredValue = (b.items || []).reduce((s, i) => i.delivery_status === "Delivered" ? s + (i.item_total || 0) : s, 0);
        } else {
          deliveredValue = grandTotal;
        }
        return sum + Math.max(0, deliveredValue - currentPaid);
      }, 0);

      const totalAdvance = bills.reduce((sum, b) => {
        const grandTotal = b.grand_total || b.total_amount || 0;
        const currentPaid = b.total_paid !== undefined ? b.total_paid : (b.is_paid ? grandTotal : (b.advance_amount || 0));
        let deliveredValue = 0;
        if (b.is_advance_paid) {
          deliveredValue = (b.items || []).reduce((s, i) => i.delivery_status === "Delivered" ? s + (i.item_total || 0) : s, 0);
        } else {
          deliveredValue = grandTotal;
        }
        return sum + Math.max(0, currentPaid - deliveredValue);
      }, 0);

      res.json({
        unpaid_bills: bills,
        total_debt: totalDebt,
        total_advance: totalAdvance,
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/customers/:customer_id/clear-debt
router.post(
  "/:customer_id/clear-debt",
  auth,
  requireSubscription(),
  adminOnly,
  async (req, res, next) => {
    try {
      const db = mongoose.connection.db;

      const customer = await db.collection("customers").findOne({
        id: req.params.customer_id,
        pharmacy_id: req.user.pharmacy_id,
      });

      if (!customer) {
        return res.status(404).json({ detail: "Customer not found" });
      }

      // Find all unpaid bills
      const unpaidBills = await db.collection("bills").find({ customer_id: req.params.customer_id, is_paid: false }).toArray();
      
      for (const bill of unpaidBills) {
        const grandTotal = bill.grand_total || bill.total_amount || 0;
        await db.collection("bills").updateOne(
          { id: bill.id },
          { $set: { is_paid: true, total_paid: grandTotal, paid_at: new Date().toISOString() } }
        );
      }

      // Recalculate customer total_debt and total_advance across all bills to ensure no drift
      const allCustomerBills = await db.collection("bills").find({ customer_id: req.params.customer_id }).toArray();
      let totalDebt = 0;
      let totalAdvance = 0;

      allCustomerBills.forEach(b => {
        const grandTotal = b.grand_total || b.total_amount || 0;
        const currentPaid = b.total_paid !== undefined ? b.total_paid : (b.is_paid ? grandTotal : (b.advance_amount || 0));
        let deliveredValue = 0;
        if (b.is_advance_paid) {
          deliveredValue = (b.items || []).reduce((sum, i) => i.delivery_status === "Delivered" ? sum + (i.item_total || 0) : sum, 0);
        } else {
          deliveredValue = grandTotal;
        }
        totalDebt += Math.max(0, deliveredValue - currentPaid);
        totalAdvance += Math.max(0, currentPaid - deliveredValue);
      });

      await db
        .collection("customers")
        .updateOne({ id: req.params.customer_id }, { $set: { total_debt: totalDebt, total_advance: totalAdvance } });

      res.json({ message: "Debt cleared", previous_debt: customer.total_debt, remaining_debt: totalDebt });
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /api/customers/:customer_id
router.delete(
  "/:customer_id",
  auth,
  requireSubscription(),
  async (req, res, next) => {
    try {
      const db = mongoose.connection.db;
      const result = await db.collection("customers").deleteOne({
        id: req.params.customer_id,
        pharmacy_id: req.user.pharmacy_id,
      });

      if (result.deletedCount === 0) {
        return res.status(404).json({ detail: "Customer not found" });
      }
      
      await logActivity(db, req.user.pharmacy_id, req.user.id, req.user.name, "DELETE", "CUSTOMERS", req.params.customer_id, `Deleted Customer`, `/customers`);

      res.json({ message: "Customer deleted" });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
