const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const { auth } = require("../middleware/auth");

// Helper function to get dashboard stats
async function getDashboardStats(pharmacyId) {
  const db = mongoose.connection.db;

  // Today's date range
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startOfDay = new Date(today).toISOString();
  today.setHours(23, 59, 59, 999);
  const endOfDay = new Date(today).toISOString();

  // Month date range
  const now = new Date();
  const startOfMonth = new Date(
    now.getFullYear(),
    now.getMonth(),
    1
  ).toISOString();
  const endOfMonth = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0,
    23,
    59,
    59,
    999
  ).toISOString();

  // Get bills
  const bills = await db
    .collection("bills")
    .find({ pharmacy_id: pharmacyId })
    .project({ _id: 0 })
    .toArray();

  // Helper to get bill total (supports both grand_total and total_amount)
  const getBillTotal = (bill) => bill.grand_total || bill.total_amount || 0;

  // Today's stats
  const todayBills = bills.filter(
    (b) => b.created_at >= startOfDay && b.created_at <= endOfDay
  );
  const todaySales = todayBills.reduce((sum, b) => sum + getBillTotal(b), 0);
  const todayProfit = todayBills.reduce((sum, b) => sum + (b.profit || 0), 0);

  // Monthly stats
  const monthBills = bills.filter(
    (b) => b.created_at >= startOfMonth && b.created_at <= endOfMonth
  );
  const monthlySales = monthBills.reduce((sum, b) => sum + getBillTotal(b), 0);
  const monthlyProfit = monthBills.reduce((sum, b) => sum + (b.profit || 0), 0);

  // All time
  const totalSales = bills.reduce((sum, b) => sum + getBillTotal(b), 0);
  const totalProfit = bills.reduce((sum, b) => sum + (b.profit || 0), 0);

  // Inventory stats
  const inventory = await db
    .collection("inventory")
    .find({ pharmacy_id: pharmacyId, available_quantity: { $gt: 0 } })
    .project({ _id: 0 })
    .toArray();

  const totalInventoryValue = inventory.reduce(
    (sum, i) => sum + i.available_quantity * (i.purchase_price || 0),
    0
  );

  // Counts
  const customerCount = await db
    .collection("customers")
    .countDocuments({ pharmacy_id: pharmacyId });
  const supplierCount = await db
    .collection("suppliers")
    .countDocuments({ pharmacy_id: pharmacyId });
  const productCount = inventory.length;

  // Pending debt
  const customers = await db
    .collection("customers")
    .find({ pharmacy_id: pharmacyId })
    .project({ _id: 0 })
    .toArray();
  const totalDebt = customers.reduce((sum, c) => sum + (c.total_debt || 0), 0);

  return {
    today: {
      sales: todaySales,
      profit: todayProfit,
      bills: todayBills.length,
    },
    monthly: {
      sales: monthlySales,
      profit: monthlyProfit,
      bills: monthBills.length,
    },
    total: {
      sales: totalSales,
      profit: totalProfit,
      bills: bills.length,
    },
    inventory_value: totalInventoryValue,
    total_debt: totalDebt,
    total_revenue: totalSales, // For backward compatibility with frontend
    counts: {
      customers: customerCount,
      suppliers: supplierCount,
      products: productCount,
    },
  };
}

// GET /api/dashboard - Backward compatible root route
router.get("/", auth, async (req, res, next) => {
  try {
    const stats = await getDashboardStats(req.user.pharmacy_id);
    res.json(stats);
  } catch (error) {
    next(error);
  }
});

// GET /api/dashboard/stats
router.get("/stats", auth, async (req, res, next) => {
  try {
    const stats = await getDashboardStats(req.user.pharmacy_id);
    res.json(stats);
  } catch (error) {
    next(error);
  }
});

// GET /api/dashboard/sales-trend - Sales trend by days
router.get("/sales-trend", auth, async (req, res, next) => {
  try {
    const db = mongoose.connection.db;
    const { days = 30 } = req.query;
    const numDays = parseInt(days);

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - numDays);

    const bills = await db
      .collection("bills")
      .find({
        pharmacy_id: req.user.pharmacy_id,
        created_at: { $gte: startDate.toISOString() },
      })
      .project({ _id: 0 })
      .toArray();

    // Helper to get bill total
    const getBillTotal = (bill) => bill.grand_total || bill.total_amount || 0;

    // Group by date
    const salesByDate = {};
    for (let i = 0; i < numDays; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split("T")[0];
      salesByDate[dateStr] = {
        date: dateStr,
        revenue: 0,
        profit: 0,
        orders: 0,
      };
    }

    bills.forEach((bill) => {
      const dateStr = bill.created_at.split("T")[0];
      if (salesByDate[dateStr]) {
        salesByDate[dateStr].revenue += getBillTotal(bill);
        salesByDate[dateStr].profit += bill.profit || 0;
        salesByDate[dateStr].orders += 1;
      }
    });

    const trendData = Object.values(salesByDate).sort((a, b) =>
      a.date.localeCompare(b.date)
    );

    res.json({ trend: trendData });
  } catch (error) {
    next(error);
  }
});

// GET /api/dashboard/debt-summary - Customer debt summary
router.get("/debt-summary", auth, async (req, res, next) => {
  try {
    const db = mongoose.connection.db;

    const customers = await db
      .collection("customers")
      .find({ pharmacy_id: req.user.pharmacy_id })
      .project({ _id: 0 })
      .toArray();

    const totalDebt = customers.reduce(
      (sum, c) => sum + (c.total_debt || 0),
      0
    );
    const customersWithDebt = customers.filter((c) => (c.total_debt || 0) > 0);

    // Get top debtors
    const topDebtors = customersWithDebt
      .sort((a, b) => (b.total_debt || 0) - (a.total_debt || 0))
      .slice(0, 5)
      .map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        total_debt: c.total_debt || 0,
      }));

    res.json({
      total_debt: totalDebt,
      customers_with_debt: customersWithDebt.length,
      top_debtors: topDebtors,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/dashboard/sales-chart
router.get("/sales-chart", auth, async (req, res, next) => {
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
        salesByDate[dateStr].sales += bill.total_amount;
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
});

// GET /api/dashboard/top-products
router.get("/top-products", auth, async (req, res, next) => {
  try {
    const db = mongoose.connection.db;
    const { limit = 10 } = req.query;

    const bills = await db
      .collection("bills")
      .find({ pharmacy_id: req.user.pharmacy_id })
      .project({ _id: 0, items: 1 })
      .toArray();

    const productSales = {};
    bills.forEach((bill) => {
      (bill.items || []).forEach((item) => {
        const name = item.product_name;
        if (!productSales[name]) {
          productSales[name] = { product_name: name, quantity: 0, revenue: 0 };
        }
        productSales[name].quantity += item.quantity;
        productSales[name].revenue +=
          item.item_total || item.quantity * item.unit_price;
      });
    });

    const topProducts = Object.values(productSales)
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, parseInt(limit));

    res.json({ top_products: topProducts });
  } catch (error) {
    next(error);
  }
});

// GET /api/dashboard/ai-tips
router.get("/ai-tips", auth, async (req, res, next) => {
  try {
    const OpenAI = require("openai");
    const openai = new OpenAI({
      apiKey: process.env.EMERGENT_LLM_KEY || process.env.OPENAI_API_KEY,
    });

    const db = mongoose.connection.db;

    // Get some stats for context
    const bills = await db
      .collection("bills")
      .find({ pharmacy_id: req.user.pharmacy_id })
      .sort({ created_at: -1 })
      .limit(50)
      .project({ _id: 0 })
      .toArray();

    const recentSales = bills
      .slice(0, 7)
      .reduce((sum, b) => sum + b.total_amount, 0);
    const avgBillValue =
      bills.length > 0
        ? bills.reduce((sum, b) => sum + b.total_amount, 0) / bills.length
        : 0;

    const inventory = await db
      .collection("inventory")
      .find({
        pharmacy_id: req.user.pharmacy_id,
        available_quantity: { $gt: 0 },
      })
      .limit(100)
      .project({ _id: 0 })
      .toArray();

    const lowStock = inventory.filter((i) => i.available_quantity < 10).length;
    const expiringSoon = inventory.filter((i) => {
      if (!i.expiry_date) return false;
      const expiry = new Date(i.expiry_date);
      const days = (expiry - new Date()) / (1000 * 60 * 60 * 24);
      return days < 90 && days > 0;
    }).length;

    const prompt = `As a pharmacy business advisor, provide 3 brief, actionable tips based on:
    - Recent 7-day sales: Rs.${recentSales.toFixed(0)}
    - Average bill value: Rs.${avgBillValue.toFixed(0)}
    - Low stock items: ${lowStock}
    - Items expiring in 90 days: ${expiringSoon}
    
    Keep tips specific, practical, and under 50 words each. Format as a simple numbered list.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 300,
    });

    const tips = response.choices[0].message.content;

    res.json({ tips });
  } catch (error) {
    console.error("AI tips error:", error);
    res.json({
      tips: "Unable to generate tips at this time. Please check your inventory alerts manually.",
    });
  }
});

// GET /api/dashboard/supplier-analysis
router.get("/supplier-analysis", auth, async (req, res, next) => {
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

      const totalAmount = (purchase.items || []).reduce((sum, item) => {
        return sum + (item.pack_quantity || 1) * (item.pack_price || 0);
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
});

module.exports = router;
