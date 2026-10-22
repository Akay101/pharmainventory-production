const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const { auth } = require("../middleware/auth");

const { requireSubscription } = require("../middleware/subscription");
const dash = require("../services/dashboard");

// Summary stats (also used by Reports). IST business dates, aggregations only.
async function getDashboardStats(pharmacyId) {
  const db = mongoose.connection.db;
  const today = dash.istDate();
  const [todayS, monthS, totalS, stock, customerCount, supplierCount, debt] = await Promise.all([
    dash.salesBetween(db, pharmacyId, today, today),
    dash.salesBetween(db, pharmacyId, dash.monthStart(today), today),
    dash.salesBetween(db, pharmacyId, "0000-01-01", "9999-12-31"),
    db
      .collection("inventory")
      .aggregate([
        { $match: { pharmacy_id: pharmacyId, available_quantity: { $gt: 0 }, status: { $nin: ["Returned", "Expired & Returned"] } } },
        {
          $group: {
            _id: null,
            value: { $sum: { $multiply: ["$available_quantity", { $ifNull: ["$purchase_price", 0] }] } },
            batches: { $sum: 1 },
            medicines: { $addToSet: { $ifNull: ["$product_id", "$product_name"] } },
          },
        },
      ])
      .next(),
    db.collection("customers").countDocuments({ pharmacy_id: pharmacyId }),
    db.collection("suppliers").countDocuments({ pharmacy_id: pharmacyId }),
    dash.receivables(db, pharmacyId, today),
  ]);
  return {
    today: { revenue: todayS.revenue, profit: todayS.profit, bills: todayS.bills },
    month: { revenue: monthS.revenue, profit: monthS.profit, bills: monthS.bills },
    total: { revenue: totalS.revenue, profit: totalS.profit, bills: totalS.bills },
    inventory: {
      stock_value: Math.round((stock?.value || 0) * 100) / 100,
      total_items: stock?.medicines?.length || 0,
      batches: stock?.batches || 0,
    },
    pending: { amount: debt.total },
    counts: { customers: customerCount, suppliers: supplierCount, products: stock?.batches || 0 },
  };
}

// GET /api/dashboard/overview — everything the dashboard needs in one call
router.get("/overview", auth, requireSubscription(), async (req, res, next) => {
  try {
    res.json(await dash.overview(mongoose.connection.db, { pharmacyId: req.user.pharmacy_id, userId: req.user.id }));
  } catch (error) {
    next(error);
  }
});

// GET /api/dashboard - Backward compatible root route
router.get("/", auth, requireSubscription(), async (req, res, next) => {
  try {
    const stats = await getDashboardStats(req.user.pharmacy_id);
    res.json(stats);
  } catch (error) {
    next(error);
  }
});

// GET /api/dashboard/stats
router.get("/stats", auth, requireSubscription(), async (req, res, next) => {
  try {
    const stats = await getDashboardStats(req.user.pharmacy_id);
    res.json(stats);
  } catch (error) {
    next(error);
  }
});

// GET /api/dashboard/sales-trend - Sales trend by days
router.get(
  "/sales-trend",
  auth,
  requireSubscription(),
  async (req, res, next) => {
    try {
      const numDays = Math.min(Math.max(parseInt(req.query.days) || 30, 1), 366);
      const trendData = (await dash.dailyTrend(mongoose.connection.db, req.user.pharmacy_id, numDays, dash.istDate())).map((d) => ({
        date: d.date,
        revenue: d.revenue,
        profit: d.profit,
        orders: d.bills,
      }));

      res.json({ trend: trendData });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/dashboard/debt-summary - Customer debt summary
router.get(
  "/debt-summary",
  auth,
  requireSubscription(),
  async (req, res, next) => {
    try {
      const r = await dash.receivables(mongoose.connection.db, req.user.pharmacy_id, dash.istDate());
      res.json({
        total_debt: r.total,
        overdue_amount: r.overdue,
        total_unpaid_bills: r.bills,
        overdue_count: r.overdue_bills,
        top_debtors: r.top.map((d) => ({ id: d.id, name: d.name, total_debt: d.total_debt, bills_count: d.bills_count })),
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/dashboard/supplier-dues - Supplier payment dues summary
router.get(
  "/supplier-dues",
  auth,
  requireSubscription(),
  async (req, res, next) => {
    try {
      const db = mongoose.connection.db;
      const pharmacyId = req.user.pharmacy_id;

      // 30 days ago for overdue calculation
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const overdueThreshold = thirtyDaysAgo.toISOString();

      // Fetch all purchases with outstanding balance
      const unpaidPurchases = await db
        .collection("purchases")
        .find({
          pharmacy_id: pharmacyId,
          payment_status: { $in: ["Unpaid", "Partial", "Partially Paid"] }
        })
        .project({ _id: 0, id: 1, supplier_id: 1, supplier_name: 1, total_amount: 1, amount_paid: 1, created_at: 1 })
        .toArray();

      const stats = {
        total_due: 0,
        total_paid: 0, // NEW: Track parts already paid
        overdue_due: 0,
        unpaid_purchases_count: 0,
        overdue_count: 0,
        suppliers_map: {}
      };

      unpaidPurchases.forEach(purchase => {
        const total = purchase.total_amount || 0;
        const paid = purchase.amount_paid || 0;
        const remaining = Math.max(0, total - paid);

        if (remaining <= 0) return;

        // ONLY count purchases that have a valid supplier_id to match the 'Top Suppliers' list
        const supplierId = purchase.supplier_id;
        if (!supplierId) return;

        stats.total_due += remaining;
        stats.total_paid += paid;
        stats.unpaid_purchases_count += 1;

        // Overdue check
        if (purchase.created_at < overdueThreshold) {
          stats.overdue_due += remaining;
          stats.overdue_count += 1;
        }

        // Group by supplier
        if (!stats.suppliers_map[supplierId]) {
          stats.suppliers_map[supplierId] = {
            id: supplierId,
            name: purchase.supplier_name || "Unknown",
            total_debt: 0,
            purchase_count: 0
          };
        }
        stats.suppliers_map[supplierId].total_debt += remaining;
        stats.suppliers_map[supplierId].purchase_count += 1;
      });

      // Get top 5 suppliers by debt
      const topSuppliers = Object.values(stats.suppliers_map)
        .sort((a, b) => b.total_debt - a.total_debt)
        .slice(0, 5)
        .map(s => ({
          ...s,
          total_debt: parseFloat(s.total_debt.toFixed(2))
        }));

      res.json({
        total_due: parseFloat(stats.total_due.toFixed(2)),
        total_paid: parseFloat(stats.total_paid.toFixed(2)),
        overdue_due: parseFloat(stats.overdue_due.toFixed(2)),
        unpaid_purchases_count: stats.unpaid_purchases_count,
        overdue_count: stats.overdue_count,
        top_suppliers: topSuppliers
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/dashboard/sales-chart
router.get(
  "/sales-chart",
  auth,
  requireSubscription(),
  async (req, res, next) => {
    try {
      const db = mongoose.connection.db;
      const { period = "7days" } = req.query;

      let days = 7;
      if (period === "30days") days = 30;
      if (period === "90days") days = 90;

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const bills = await db
        .collection("bills")
        .find({
          pharmacy_id: req.user.pharmacy_id,
          created_at: { $gte: startDate.toISOString() },
        })
        .project({ _id: 0 })
        .toArray();

      // Group by date
      const salesByDate = {};
      for (let i = 0; i < days; i++) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split("T")[0];
        salesByDate[dateStr] = { date: dateStr, sales: 0, profit: 0, bills: 0 };
      }

      bills.forEach((bill) => {
        const dateStr = bill.created_at.split("T")[0];
        if (salesByDate[dateStr]) {
          const getBillTotal = (bill) =>
            bill.grand_total || bill.total_amount || 0;

          salesByDate[dateStr].sales += getBillTotal(bill);
          salesByDate[dateStr].profit += bill.profit || 0;
          salesByDate[dateStr].bills += 1;
        }
      });

      const chartData = Object.values(salesByDate).sort((a, b) =>
        a.date.localeCompare(b.date)
      );

      res.json({ chart_data: chartData });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/dashboard/top-products
router.get(
  "/top-products",
  auth,
  requireSubscription(),
  async (req, res, next) => {
    try {
      const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 50);
      const days = parseInt(req.query.days) || 0;
      const today = dash.istDate();
      const from = days > 0 ? dash.addDays(today, -(days - 1)) : "0000-01-01";
      const topProducts = await dash.topProducts(mongoose.connection.db, req.user.pharmacy_id, from, today, limit);
      res.json({ top_products: topProducts });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/dashboard/ai-tips
router.get("/ai-tips", auth, requireSubscription(), async (req, res, next) => {
  try {
    const { GoogleGenerativeAI } = require("@google/generative-ai");

    const apiKey = process.env.EMERGENT_LLM_KEY || process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.json({
        tips: "AI service not configured. Please set GEMINI_API_KEY.",
      });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
    });

    const db = mongoose.connection.db;

    // Get stats
    const bills = await db
      .collection("bills")
      .find({ pharmacy_id: req.user.pharmacy_id })
      .sort({ created_at: -1 })
      .limit(50)
      .project({ _id: 0 })
      .toArray();

    const recentSales = bills
      .slice(0, 7)
      .reduce((sum, b) => sum + (b.total_amount || 0), 0);

    const avgBillValue =
      bills.length > 0
        ? bills.reduce((sum, b) => sum + (b.total_amount || 0), 0) /
          bills.length
        : 0;

    const inventory = await db
      .collection("inventory")
      .find({
        pharmacy_id: req.user.pharmacy_id,
        available_quantity: { $gt: 0 },
      })
      .limit(200)
      .project({ _id: 0 })
      .toArray();

    const lowStock = inventory.filter(
      (i) => (i.available_quantity || 0) < 10
    ).length;

    const expiringSoon = inventory.filter((i) => {
      if (!i.expiry_date) return false;
      const expiry = new Date(i.expiry_date);
      const days = (expiry - new Date()) / (1000 * 60 * 60 * 24);
      return days < 90 && days > 0;
    }).length;

    const prompt = `You are a pharmacy business advisor.

Provide 3 brief, practical, actionable business tips based on:

Recent 7-day sales: Rs.${recentSales.toFixed(0)}
Average bill value: Rs.${avgBillValue.toFixed(0)}
Low stock items: ${lowStock}
Items expiring in 90 days: ${expiringSoon}

Rules:
- Keep each tip under 50 words
- Be specific and actionable
- Format as a simple numbered list
- Do NOT add extra explanation`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const tips = response.text();

    res.json({ tips });
  } catch (error) {
    console.error("Gemini AI tips error:", error);

    res.json({
      tips: "Unable to generate AI tips at this time. Please check inventory alerts manually.",
    });
  }
});

// GET /api/dashboard/supplier-analysis
router.get(
  "/supplier-analysis",
  auth,
  requireSubscription(),
  async (req, res, next) => {
    try {
      const db = mongoose.connection.db;

      // Get all purchases
      const purchases = await db
        .collection("purchases")
        .find({ pharmacy_id: req.user.pharmacy_id })
        .project({ _id: 0 })
        .toArray();

      // Get all suppliers
      const suppliers = await db
        .collection("suppliers")
        .find({ pharmacy_id: req.user.pharmacy_id })
        .project({ _id: 0 })
        .toArray();

      // Group purchases by supplier
      const supplierStats = {};

      purchases.forEach((purchase) => {
        const supplierId = purchase.supplier_id;
        if (!supplierStats[supplierId]) {
          const supplier = suppliers.find((s) => s.id === supplierId);
          supplierStats[supplierId] = {
            id: supplierId,
            name: supplier?.name || purchase.supplier_name || "Unknown",
            total_purchases: 0,
            total_amount: 0,
            purchase_count: 0,
          };
        }

        const totalAmount = typeof purchase.total_amount === "number" && purchase.total_amount > 0
          ? purchase.total_amount
          : (purchase.items || []).reduce((sum, item) => {
              const itemTotal = item.item_total || (item.pack_quantity || item.quantity || 1) * (item.pack_price || item.purchase_price || 0);
              return sum + (itemTotal || 0);
            }, 0);

        supplierStats[supplierId].total_amount += totalAmount;
        supplierStats[supplierId].purchase_count += 1;
        supplierStats[supplierId].total_purchases += (
          purchase.items || []
        ).length;
      });

      const supplierAnalysis = Object.values(supplierStats).sort(
        (a, b) => b.total_amount - a.total_amount
      );

      res.json({ supplier_analysis: supplierAnalysis });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
