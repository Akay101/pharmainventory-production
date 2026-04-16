const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");
const { auth } = require("../middleware/auth");
const { generateBillPDF } = require("../services/pdf");
const { uploadToR2 } = require("../services/r2");
const { sendBillEmail } = require("../services/email");
const { logActivity } = require("../utils/activityLogger");

const { requireSubscription } = require("../middleware/subscription");

// Generate bill number
const generateBillNo = () => {
  const now = new Date();
  return `BILL-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
};

// GET /api/bills
router.get("/", auth, requireSubscription(), async (req, res, next) => {
  try {
    const db = mongoose.connection.db; // Forces reload for updated customer_ids

    const {
      search,
      customer_id,
      is_paid,
      start_date,
      end_date,
      page = 1,
      limit = 20,
      sort_by = "billing_date", // ✅ default changed
      sort_order = "desc",
    } = req.query;

    const query = { pharmacy_id: req.user.pharmacy_id };

    if (search) {
      query.$or = [
        { bill_no: { $regex: search, $options: "i" } },
        { customer_name: { $regex: search, $options: "i" } },
        { "items.product_name": { $regex: search, $options: "i" } },
      ];
    }

    if (customer_id) {
      query.customer_id = customer_id;
    }

    // 💰 Paid filter
    if (is_paid !== undefined) {
      query.is_paid = is_paid === "true";
    }

    // 📅 Date range filter (billing_date)
    if (start_date || end_date) {
      query.billing_date = {};
      if (start_date) query.billing_date.$gte = start_date;
      if (end_date) query.billing_date.$lte = end_date;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sortDir = sort_order === "asc" ? 1 : -1;

    // 🧠 Smart sorting logic
    const sortOptions =
      sort_by === "billing_date"
        ? { billing_date: sortDir, created_at: sortDir }
        : { [sort_by]: sortDir };

    const bills = await db
      .collection("bills")
      .find(query, { projection: { _id: 0 } })
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit))
      .toArray();

    const total = await db.collection("bills").countDocuments(query);

    // Ensure totals always exist
    const processedBills = bills.map((bill) => ({
      ...bill,
      grand_total: bill.grand_total || bill.total_amount || 0,
      total_amount: bill.total_amount || bill.grand_total || 0,
    }));

    res.json({
      bills: processedBills,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        total_pages: Math.ceil(total / parseInt(limit)) || 1,
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/bills/insights
router.get("/insights", auth, requireSubscription(), async (req, res, next) => {
  try {
    const db = mongoose.connection.db;
    const { start_date, end_date } = req.query;

    if (!start_date && !end_date) {
      return res.status(400).json({ detail: "Date range required for insights" });
    }

    const query = { pharmacy_id: req.user.pharmacy_id };
    
    // Date filter
    query.billing_date = {};
    if (start_date) query.billing_date.$gte = start_date;
    if (end_date) query.billing_date.$lte = end_date;

    // 1. Core Summary Metrics
    const summaryResult = await db.collection("bills").aggregate([
      { $match: query },
      { 
        $group: { 
          _id: null, 
          total_revenue: { $sum: "$grand_total" },
          total_profit: { $sum: "$profit" },
          total_bills: { $sum: 1 },
          unpaid_bills: { 
            $sum: { $cond: [{ $eq: ["$is_paid", false] }, 1, 0] } 
          },
          unpaid_amount: { 
            $sum: { $cond: [{ $eq: ["$is_paid", false] }, "$grand_total", 0] } 
          }
        } 
      }
    ]).toArray();

    // 2. Top 10 Products by Revenue
    const topProductsResult = await db.collection("bills").aggregate([
      { $match: query },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.product_name",
          total_profit: { $sum: "$items.profit" },
          total_revenue: { $sum: "$items.item_total" },
          total_quantity: { $sum: "$items.quantity" }
        }
      },
      { $sort: { total_revenue: -1 } },
      { $limit: 10 }
    ]).toArray();

    const summary = summaryResult.length > 0 ? summaryResult[0] : {
      total_revenue: 0,
      total_profit: 0,
      total_bills: 0,
      unpaid_bills: 0,
      unpaid_amount: 0
    };

    res.json({
      summary,
      top_products: topProductsResult.map(p => ({
        name: p._id,
        profit: p.total_profit,
        revenue: p.total_revenue,
        quantity: p.total_quantity
      }))
    });

  } catch (error) {
    next(error);
  }
});

// POST /api/bills
router.post("/", auth, requireSubscription(), async (req, res, next) => {
  try {
    const {
      customer_id,
      customer_name,
      customer_mobile,
      customer_email,
      items,
      discount_percent = 0,
      notes,
      is_paid = true,
      due_date,
      billing_date,
    } = req.body;
    const db = mongoose.connection.db;

    if (!items || items.length === 0) {
      return res.status(400).json({ detail: "At least one item is required" });
    }

    const billId = uuidv4();
    const billNo = generateBillNo();
    let subtotal = 0;
    let totalProfit = 0;
    const processedItems = [];

    for (const item of items) {
      const quantity = parseInt(item.quantity) || 1;
      const unitPrice = parseFloat(item.unit_price) || 0;
      const discountPercent = parseFloat(item.discount_percent) || 0;
      const purchasePrice = parseFloat(item.purchase_price) || 0;

      const itemSubtotal = quantity * unitPrice;
      const itemDiscount = itemSubtotal * (discountPercent / 100);
      const itemTotal = itemSubtotal - itemDiscount;
      const itemProfit = (unitPrice - purchasePrice) * quantity - itemDiscount;

      subtotal += itemTotal;
      totalProfit += itemProfit;

      processedItems.push({
        inventory_id: item.inventory_id || null,
        product_name: item.product_name,
        batch_no: item.batch_no || null,
        expiry_date: item.expiry_date || null,
        quantity,
        unit_price: unitPrice,
        purchase_price: purchasePrice,
        discount_percent: discountPercent,
        item_total: itemTotal,
        profit: itemProfit,
        is_manual: !item.inventory_id, // Mark as manual if no inventory_id
      });

      // Update inventory only for items from inventory (not manual entries)
      if (item.inventory_id) {
        await db
          .collection("inventory")
          .updateOne(
            { id: item.inventory_id },
            [{ $set: { available_quantity: { $max: [0, { $subtract: ["$available_quantity", quantity] }] } } }]
          );
      }
    }

    const discountAmount = subtotal * (discount_percent / 100);
    const totalAmount = subtotal - discountAmount;
    totalProfit -= discountAmount;

    // 💰 Distribute bill-level discount to individual items proportionally for consistency
    if (discountAmount > 0 && subtotal > 0) {
      processedItems.forEach(item => {
        const itemProportion = item.item_total / subtotal;
        const itemDiscountShare = discountAmount * itemProportion;
        item.item_total -= itemDiscountShare;
        item.profit -= itemDiscountShare;
      });
    }

    // Handle customer
    let finalCustomerId = customer_id;
    if (!customer_id && customer_name) {
      const existingCustomer = await db.collection("customers").findOne({
        pharmacy_id: req.user.pharmacy_id,
        $or: [{ name: customer_name }, { mobile: customer_mobile }].filter(
          (c) => c.name || c.mobile
        ),
      });

      if (existingCustomer) {
        finalCustomerId = existingCustomer.id;
      } else {
        finalCustomerId = uuidv4();
        await db.collection("customers").insertOne({
          id: finalCustomerId,
          pharmacy_id: req.user.pharmacy_id,
          name: customer_name,
          mobile: customer_mobile || null,
          email: customer_email || null,
          total_debt: 0,
          created_at: new Date().toISOString(),
        });
      }
    }

    // Update customer debt if unpaid
    if (!is_paid && finalCustomerId) {
      await db
        .collection("customers")
        .updateOne(
          { id: finalCustomerId },
          { $inc: { total_debt: totalAmount } }
        );
    }

    // Calculate inventory vs negative billing stats
    const inventoryBilledQty = processedItems.reduce(
      (sum, item) => (item.is_manual ? sum : sum + item.quantity),
      0
    );
    const negativeBilledQty = processedItems
      .filter((item) => item.is_manual)
      .reduce((sum, item) => sum + item.quantity, 0);

    const billData = {
      id: billId,
      bill_no: billNo,
      pharmacy_id: req.user.pharmacy_id,
      customer_id: finalCustomerId || null,
      customer_name: customer_name || "Walk-in",
      customer_mobile: customer_mobile || null,
      customer_email: customer_email || null,
      billing_date: billing_date || new Date().toISOString().slice(0, 10),
      items: processedItems,
      subtotal,
      discount_percent,
      discount_amount: discountAmount,
      grand_total: totalAmount, // Use grand_total for consistency with existing data
      total_amount: totalAmount, // Keep for backward compatibility
      total_cost: processedItems.reduce(
        (sum, i) => sum + i.purchase_price * i.quantity,
        0
      ),
      profit: totalProfit,
      inventory_billed_qty: inventoryBilledQty,
      negative_billed_qty: negativeBilledQty,
      is_paid,
      due_date: due_date || null,
      payment_date: is_paid ? new Date().toISOString() : null,
      notes: notes || null,
      pdf_url: null,
      created_by: req.user.id,
      created_at: new Date().toISOString(),
    };

    await db.collection("bills").insertOne(billData);
    const { _id, ...bill } = billData;
    await logActivity(db, req.user.pharmacy_id, req.user.id, req.user.name, "CREATE", "BILLING", billId, `Created Bill ${billNo} for ₹${totalAmount}`, `/billing`);

    res.status(201).json({ message: "Bill created", bill });
  } catch (error) {
    next(error);
  }
});

// GET /api/bills/:bill_id
router.get("/:bill_id", auth, requireSubscription(), async (req, res, next) => {
  try {
    const db = mongoose.connection.db;
    const bill = await db
      .collection("bills")
      .findOne(
        { id: req.params.bill_id, pharmacy_id: req.user.pharmacy_id },
        { projection: { _id: 0 } }
      );

    if (!bill) {
      return res.status(404).json({ detail: "Bill not found" });
    }

    res.json(bill);
  } catch (error) {
    next(error);
  }
});

// PUT /api/bills/:bill_id
router.put("/:bill_id", auth, requireSubscription(), async (req, res, next) => {
  try {
    const {
      customer_id,
      customer_name,
      customer_mobile,
      customer_email,
      items,
      discount_percent = 0,
      notes,
      is_paid,
      due_date,
      billing_date,
    } = req.body;

    const db = mongoose.connection.db;

    const bill = await db.collection("bills").findOne({
      id: req.params.bill_id,
      pharmacy_id: req.user.pharmacy_id,
    });

    if (!bill) {
      return res.status(404).json({ detail: "Bill not found" });
    }

    /* ---------------- Reverse old inventory ---------------- */

    for (const oldItem of bill.items) {
      if (oldItem.inventory_id) {
        await db
          .collection("inventory")
          .updateOne(
            { id: oldItem.inventory_id },
            { $inc: { available_quantity: oldItem.quantity } }
          );
      }
    }

    /* ---------------- Process new items ---------------- */

    let subtotal = 0;
    let totalProfit = 0;
    const processedItems = [];

    for (const item of items) {
      const quantity = parseInt(item.quantity) || 1;
      const unitPrice = parseFloat(item.unit_price) || 0;
      const discountPercent = parseFloat(item.discount_percent) || 0;
      const purchasePrice = parseFloat(item.purchase_price) || 0;

      const itemSubtotal = quantity * unitPrice;
      const itemDiscount = itemSubtotal * (discountPercent / 100);
      const itemTotal = itemSubtotal - itemDiscount;
      const itemProfit = (unitPrice - purchasePrice) * quantity - itemDiscount;

      subtotal += itemTotal;
      totalProfit += itemProfit;

      processedItems.push({
        inventory_id: item.inventory_id || null,
        product_name: item.product_name,
        batch_no: item.batch_no || null,
        expiry_date: item.expiry_date || null,
        quantity,
        unit_price: unitPrice,
        purchase_price: purchasePrice,
        discount_percent: discountPercent,
        item_total: itemTotal,
        profit: itemProfit,
        is_manual: !item.inventory_id,
      });

      // Deduct inventory if item linked to inventory
      if (item.inventory_id) {
        await db
          .collection("inventory")
          .updateOne(
            { id: item.inventory_id },
            [{ $set: { available_quantity: { $max: [0, { $subtract: ["$available_quantity", quantity] }] } } }]
          );
      }
    }

    /* ---------------- Calculate totals ---------------- */

    const discountAmount = subtotal * (discount_percent / 100);
    const totalAmount = subtotal - discountAmount;
    totalProfit -= discountAmount;

    // 💰 Distribute bill-level discount to individual items proportionally for consistency
    if (discountAmount > 0 && subtotal > 0) {
      processedItems.forEach(item => {
        const itemProportion = item.item_total / subtotal;
        const itemDiscountShare = discountAmount * itemProportion;
        item.item_total -= itemDiscountShare;
        item.profit -= itemDiscountShare;
      });
    }

    const totalCost = processedItems.reduce(
      (sum, i) => sum + i.purchase_price * i.quantity,
      0
    );

    const inventoryBilledQty = processedItems.reduce(
      (sum, item) => (item.is_manual ? sum : sum + item.quantity),
      0
    );

    const negativeBilledQty = processedItems
      .filter((item) => item.is_manual)
      .reduce((sum, item) => sum + item.quantity, 0);

    /* ---------------- Handle customer ---------------- */

    let finalCustomerId = customer_id;

    if (!customer_id && customer_name) {
      const existingCustomer = await db.collection("customers").findOne({
        pharmacy_id: req.user.pharmacy_id,
        $or: [{ name: customer_name }, { mobile: customer_mobile }].filter(
          (c) => c.name || c.mobile
        ),
      });

      if (existingCustomer) {
        finalCustomerId = existingCustomer.id;
      } else {
        finalCustomerId = uuidv4();

        await db.collection("customers").insertOne({
          id: finalCustomerId,
          pharmacy_id: req.user.pharmacy_id,
          name: customer_name,
          mobile: customer_mobile || null,
          email: customer_email || null,
          total_debt: 0,
          created_at: new Date().toISOString(),
        });
      }
    }

    /* ---------------- Adjust customer debt ---------------- */

    if (bill.customer_id && !bill.is_paid) {
      await db
        .collection("customers")
        .updateOne(
          { id: bill.customer_id },
          { $inc: { total_debt: -bill.total_amount } }
        );
    }

    if (!is_paid && finalCustomerId) {
      await db
        .collection("customers")
        .updateOne(
          { id: finalCustomerId },
          { $inc: { total_debt: totalAmount } }
        );
    }

    /* ---------------- Update bill ---------------- */

    const updates = {
      customer_id: finalCustomerId || null,
      customer_name: customer_name || "Walk-in",
      customer_mobile: customer_mobile || null,
      customer_email: customer_email || null,
      billing_date: billing_date || bill.billing_date,
      items: processedItems,
      subtotal,
      discount_percent,
      discount_amount: discountAmount,
      grand_total: totalAmount,
      total_amount: totalAmount,
      total_cost: totalCost,
      profit: totalProfit,
      inventory_billed_qty: inventoryBilledQty,
      negative_billed_qty: negativeBilledQty,
      is_paid,
      due_date: due_date || null,
      payment_date: is_paid ? new Date().toISOString() : null,
      notes: notes || null,
      updated_at: new Date().toISOString(),
    };

    await db
      .collection("bills")
      .updateOne({ id: req.params.bill_id }, { $set: updates });
      
    await logActivity(db, req.user.pharmacy_id, req.user.id, req.user.name, "UPDATE", "BILLING", req.params.bill_id, `Updated Bill ${bill.bill_no}`, `/billing`);

    const updated = await db
      .collection("bills")
      .findOne({ id: req.params.bill_id }, { projection: { _id: 0 } });

    res.json({ message: "Bill updated", bill: updated });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/bills/:bill_id
router.delete(
  "/:bill_id",
  auth,
  requireSubscription(),
  async (req, res, next) => {
    try {
      const { restore_inventory } = req.query;
      const db = mongoose.connection.db;

      const bill = await db.collection("bills").findOne({
        id: req.params.bill_id,
        pharmacy_id: req.user.pharmacy_id,
      });

      if (!bill) {
        return res.status(404).json({ detail: "Bill not found" });
      }

      // Restore inventory if requested
      if (restore_inventory === "true") {
        for (const item of bill.items) {
          if (item.inventory_id && !item.inventory_id.startsWith("negative-")) {
            await db
              .collection("inventory")
              .updateOne(
                { id: item.inventory_id },
                { $inc: { available_quantity: item.quantity } }
              );
          }
        }
      }

      // Update customer debt if unpaid
      if (!bill.is_paid && bill.customer_id) {
        await db
          .collection("customers")
          .updateOne(
            { id: bill.customer_id },
            { $inc: { total_debt: -bill.total_amount } }
          );
      }

      await db.collection("bills").deleteOne({ id: req.params.bill_id });
      await logActivity(db, req.user.pharmacy_id, req.user.id, req.user.name, "DELETE", "BILLING", req.params.bill_id, `Deleted Bill ${bill.bill_no}`, `/billing`);
      res.json({
        message: "Bill deleted",
        inventory_restored: restore_inventory === "true",
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/bills/:bill_id/mark-paid
router.post(
  "/:bill_id/mark-paid",
  auth,
  requireSubscription(),
  async (req, res, next) => {
    try {
      const db = mongoose.connection.db;

      const bill = await db.collection("bills").findOne({
        id: req.params.bill_id,
        pharmacy_id: req.user.pharmacy_id,
      });

      if (!bill) {
        return res.status(404).json({ detail: "Bill not found" });
      }

      if (bill.is_paid) {
        return res.status(400).json({ detail: "Bill already paid" });
      }

      await db
        .collection("bills")
        .updateOne(
          { id: req.params.bill_id },
          { $set: { is_paid: true, paid_at: new Date().toISOString() } }
        );
      
      await logActivity(db, req.user.pharmacy_id, req.user.id, req.user.name, "UPDATE", "BILLING", req.params.bill_id, `Marked Bill ${bill.bill_no} as Paid`, `/billing`);

      // Update customer debt
      if (bill.customer_id) {
        await db
          .collection("customers")
          .updateOne(
            { id: bill.customer_id },
            { $inc: { total_debt: -bill.total_amount } }
          );
      }

      res.json({ message: "Bill marked as paid" });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/bills/:bill_id/pdf
router.post(
  "/:bill_id/pdf",
  auth,
  requireSubscription(),
  async (req, res, next) => {
    try {
      const db = mongoose.connection.db;

      const bill = await db.collection("bills").findOne({
        id: req.params.bill_id,
        pharmacy_id: req.user.pharmacy_id,
      });

      if (!bill) {
        return res.status(404).json({ detail: "Bill not found" });
      }

      const pharmacy = await db
        .collection("pharmacies")
        .findOne({ id: req.user.pharmacy_id }, { projection: { _id: 0 } });

      // Generate PDF
      const pdfBuffer = await generateBillPDF(bill, pharmacy);

      // Upload to R2
      const key = `bills/${req.user.pharmacy_id}/${bill.bill_no}.pdf`;
      const pdfUrl = await uploadToR2(key, pdfBuffer, "application/pdf");

      // Update bill with PDF URL
      await db
        .collection("bills")
        .updateOne({ id: req.params.bill_id }, { $set: { pdf_url: pdfUrl } });

      res.json({ pdf_url: pdfUrl });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/bills/:bill_id/email
router.post(
  "/:bill_id/email",
  auth,
  requireSubscription(),
  async (req, res, next) => {
    try {
      const db = mongoose.connection.db;

      const bill = await db.collection("bills").findOne({
        id: req.params.bill_id,
        pharmacy_id: req.user.pharmacy_id,
      });

      if (!bill) {
        return res.status(404).json({ detail: "Bill not found" });
      }

      if (!bill.customer_email) {
        return res.status(400).json({ detail: "Customer email not available" });
      }

      let pdfUrl = bill.pdf_url;

      // Generate PDF if not exists
      if (!pdfUrl) {
        const pharmacy = await db
          .collection("pharmacies")
          .findOne({ id: req.user.pharmacy_id }, { projection: { _id: 0 } });

        const pdfBuffer = await generateBillPDF(bill, pharmacy);
        const key = `bills/${req.user.pharmacy_id}/${bill.bill_no}.pdf`;
        pdfUrl = await uploadToR2(key, pdfBuffer, "application/pdf");

        await db
          .collection("bills")
          .updateOne({ id: req.params.bill_id }, { $set: { pdf_url: pdfUrl } });
      }

      // Send email
      const sent = await sendBillEmail(
        bill.customer_email,
        bill.customer_name,
        bill.bill_no,
        pdfUrl,
        bill.total_amount
      );

      if (!sent) {
        return res.status(500).json({ detail: "Failed to send email" });
      }

      res.json({ message: "Email sent successfully" });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
