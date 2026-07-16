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
      is_advance_paid,
      start_date,
      end_date,
      page = 1,
      limit = 20,
      sort_by = "billing_date",
      sort_order = "desc",
      highlight_id,
    } = req.query;

    const query = { pharmacy_id: req.user.pharmacy_id };

    if (search) {
      query.$or = [
        { bill_no: { $regex: search, $options: "i" } },
        { customer_name: { $regex: search, $options: "i" } },
        { customer_mobile: { $regex: search, $options: "i" } },
        { customer_email: { $regex: search, $options: "i" } },
        { doctor: { $regex: search, $options: "i" } },
        { notes: { $regex: search, $options: "i" } },
        { billing_date: { $regex: search, $options: "i" } },
        { "items.product_name": { $regex: search, $options: "i" } },
        { "items.batch_no": { $regex: search, $options: "i" } },
      ];
    }

    if (customer_id) {
      query.customer_id = customer_id;
    }

    // 💰 Paid filter
    if (is_paid !== undefined) {
      query.is_paid = is_paid === "true";
    }

    if (is_advance_paid !== undefined) {
      query.is_advance_paid = is_advance_paid === "true";
    }

    // 📅 Date range filter (billing_date)
    if (start_date || end_date) {
      query.billing_date = {};
      if (start_date) query.billing_date.$gte = start_date;
      if (end_date) query.billing_date.$lte = end_date;
    }

    const sortDir = sort_order === "asc" ? 1 : -1;

    // 🧠 Smart sorting logic
    const sortOptions =
      sort_by === "billing_date"
        ? { billing_date: sortDir, created_at: sortDir }
        : { [sort_by]: sortDir };

    let pageNum = parseInt(page);
    if (highlight_id) {
      const allBillsIds = await db
        .collection("bills")
        .find(query)
        .sort(sortOptions)
        .project({ id: 1 })
        .toArray();
      const targetIndex = allBillsIds.findIndex((b) => b.id === highlight_id);
      if (targetIndex !== -1) {
        pageNum = Math.floor(targetIndex / parseInt(limit)) + 1;
      }
    }

    const skip = (parseInt(pageNum) - 1) * parseInt(limit);

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
        page: pageNum,
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

// GET /api/bills/doctors
router.get("/doctors", auth, requireSubscription(), async (req, res, next) => {
  try {
    const db = mongoose.connection.db;
    const { search } = req.query;
    const query = { pharmacy_id: req.user.pharmacy_id };
    if (search) {
      query.name = { $regex: search, $options: "i" };
    }
    const doctors = await db
      .collection("doctors")
      .find(query, { projection: { _id: 0 } })
      .sort({ name: 1 })
      .toArray();
    res.json({ doctors });
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
      doctor,
      items,
      discount_percent = 0,
      notes,
      is_paid = true,
      due_date,
      billing_date,
      payment_mode,
      is_advance_paid = false,
      advance_amount = 0,
    } = req.body;
    const db = mongoose.connection.db;

    // Validate payment mode against mandatory settings preference
    const userPrefs = await db.collection("user_settings").findOne({ user_id: req.user.id });
    const preferences = userPrefs?.preferences || {};
    const isModeMandatory = preferences.billing_payment_mode_mandatory === true;

    if (isModeMandatory && (!payment_mode || !["Cash", "UPI", "Card"].includes(payment_mode))) {
      return res.status(400).json({ detail: "Payment mode is mandatory" });
    }

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
      const cgst = parseFloat(item.cgst) || 0;
      const sgst = parseFloat(item.sgst) || 0;
      const itemTotal = item.item_total !== undefined ? parseFloat(item.item_total) : (itemSubtotal - itemDiscount);
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
        cgst: parseFloat(item.cgst) || 0,
        sgst: parseFloat(item.sgst) || 0,
        delivery_status: is_advance_paid ? "Pending" : "Delivered",
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

    // Calculate final customer debt and advance increments
    let activeDebt = 0;
    let activeAdvance = 0;
    const totalPaid = is_paid ? totalAmount : (is_advance_paid ? (Number(advance_amount) || 0) : 0);

    if (is_advance_paid) {
      activeAdvance = totalPaid;
      activeDebt = 0;
    } else {
      activeDebt = is_paid ? 0 : totalAmount;
      activeAdvance = 0;
    }

    if (finalCustomerId) {
      await db
        .collection("customers")
        .updateOne(
          { id: finalCustomerId },
          { $inc: { total_debt: activeDebt, total_advance: activeAdvance } }
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
      is_advance_paid: is_advance_paid || false,
      advance_amount: is_advance_paid ? (Number(advance_amount) || 0) : 0,
      total_paid: totalPaid,
      payments: is_paid 
        ? [{ amount: totalAmount, payment_mode: payment_mode || "Cash", paid_at: new Date().toISOString() }]
        : (is_advance_paid && Number(advance_amount) > 0 
          ? [{ amount: Number(advance_amount), payment_mode: payment_mode || "Cash", paid_at: new Date().toISOString() }]
          : []),
      delivery_status: is_advance_paid ? "Pending" : "Delivered",
      due_date: due_date || null,
      payment_date: is_paid ? new Date().toISOString() : null,
      payment_mode: payment_mode || null,
      notes: notes || null,
      doctor: doctor || null,
      pdf_url: null,
      created_by: req.user.id,
      created_at: new Date().toISOString(),
    };

    await db.collection("bills").insertOne(billData);

    // Upsert doctor to pharmacy list
    if (doctor && doctor.trim()) {
      const docName = doctor.trim();
      await db.collection("doctors").updateOne(
        { pharmacy_id: req.user.pharmacy_id, name: { $regex: new RegExp(`^${docName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}$`, 'i') } },
        {
          $setOnInsert: {
            id: uuidv4(),
            pharmacy_id: req.user.pharmacy_id,
            name: docName,
            created_at: new Date().toISOString()
          }
        },
        { upsert: true }
      );
    }

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
      doctor,
      items,
      discount_percent = 0,
      notes,
      is_paid,
      due_date,
      billing_date,
      payment_mode,
      is_advance_paid,
      advance_amount,
    } = req.body;

    const db = mongoose.connection.db;

    // Validate payment mode against mandatory settings preference
    const userPrefs = await db.collection("user_settings").findOne({ user_id: req.user.id });
    const preferences = userPrefs?.preferences || {};
    const isModeMandatory = preferences.billing_payment_mode_mandatory === true;

    if (isModeMandatory && (!payment_mode || !["Cash", "UPI", "Card"].includes(payment_mode))) {
      return res.status(400).json({ detail: "Payment mode is mandatory" });
    }

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
      const cgst = parseFloat(item.cgst) || 0;
      const sgst = parseFloat(item.sgst) || 0;
      const itemTotal = item.item_total !== undefined ? parseFloat(item.item_total) : (itemSubtotal - itemDiscount);
      const itemProfit = (unitPrice - purchasePrice) * quantity - itemDiscount;

      subtotal += itemTotal;
      totalProfit += itemProfit;

      const isAdvance = is_advance_paid !== undefined ? is_advance_paid : bill.is_advance_paid;
      let finalDeliveryStatus = "Delivered";
      if (isAdvance) {
        const matchingOld = bill.items?.find(o => o.product_name === item.product_name && o.batch_no === item.batch_no);
        finalDeliveryStatus = matchingOld ? (matchingOld.delivery_status || "Pending") : "Pending";
      }

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
        cgst: parseFloat(item.cgst) || 0,
        sgst: parseFloat(item.sgst) || 0,
        delivery_status: finalDeliveryStatus,
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

    /* ---------------- Adjust customer debt and advance ---------------- */

    // Calculate old active values
    const oldPaid = bill.total_paid !== undefined ? bill.total_paid : (bill.is_paid ? bill.total_amount : (bill.advance_amount || 0));
    let oldDeliveredValue = 0;
    if (bill.is_advance_paid) {
      oldDeliveredValue = (bill.items || []).reduce((sum, i) => i.delivery_status === "Delivered" ? sum + (i.item_total || 0) : sum, 0);
    } else {
      oldDeliveredValue = bill.total_amount;
    }
    const oldDebt = Math.max(0, oldDeliveredValue - oldPaid);
    const oldAdvance = Math.max(0, oldPaid - oldDeliveredValue);

    // Calculate new active values
    const finalIsPaid = is_paid !== undefined ? is_paid : bill.is_paid;
    const finalIsAdvancePaid = is_advance_paid !== undefined ? is_advance_paid : bill.is_advance_paid;
    const finalAdvanceAmount = is_advance_paid !== undefined ? (Number(advance_amount) || 0) : (bill.advance_amount || 0);

    const newPaid = finalIsPaid ? totalAmount : (finalIsAdvancePaid ? finalAdvanceAmount : 0);
    let newDeliveredValue = 0;
    if (finalIsAdvancePaid) {
      newDeliveredValue = processedItems.reduce((sum, i) => i.delivery_status === "Delivered" ? sum + (i.item_total || 0) : sum, 0);
    } else {
      newDeliveredValue = totalAmount;
    }
    const newDebt = Math.max(0, newDeliveredValue - newPaid);
    const newAdvance = Math.max(0, newPaid - newDeliveredValue);

    // Deltas
    const deltaDebt = newDebt - oldDebt;
    const deltaAdvance = newAdvance - oldAdvance;

    if (bill.customer_id && bill.customer_id !== finalCustomerId) {
      // Customer changed
      await db.collection("customers").updateOne(
        { id: bill.customer_id },
        { $inc: { total_debt: -oldDebt, total_advance: -oldAdvance } }
      );
      if (finalCustomerId) {
        await db.collection("customers").updateOne(
          { id: finalCustomerId },
          { $inc: { total_debt: newDebt, total_advance: newAdvance } }
        );
      }
    } else if (finalCustomerId) {
      await db.collection("customers").updateOne(
        { id: finalCustomerId },
        { $inc: { total_debt: deltaDebt, total_advance: deltaAdvance } }
      );
    }

    /* ---------------- Update bill ---------------- */

    let finalPayments = bill.payments || [];
    if (finalIsPaid) {
      finalPayments = [{ amount: totalAmount, payment_mode: payment_mode || bill.payment_mode || "Cash", paid_at: new Date().toISOString() }];
    } else if (finalIsAdvancePaid) {
      if (finalPayments.length === 0 && finalAdvanceAmount > 0) {
        finalPayments = [{ amount: finalAdvanceAmount, payment_mode: payment_mode || bill.payment_mode || "Cash", paid_at: new Date().toISOString() }];
      } else if (finalPayments.length > 0 && finalAdvanceAmount !== bill.advance_amount) {
        finalPayments[0] = { ...finalPayments[0], amount: finalAdvanceAmount };
      }
    } else {
      finalPayments = [];
    }

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
      is_paid: finalIsPaid,
      is_advance_paid: finalIsAdvancePaid,
      advance_amount: finalAdvanceAmount,
      total_paid: newPaid,
      payments: finalPayments,
      delivery_status: finalIsAdvancePaid 
        ? (processedItems.every(i => i.delivery_status === "Delivered") 
          ? "Delivered" 
          : (processedItems.some(i => i.delivery_status === "Delivered") ? "Partially Delivered" : "Pending"))
        : "Delivered",
      due_date: due_date || null,
      payment_date: finalIsPaid ? new Date().toISOString() : null,
      payment_mode: payment_mode || null,
      notes: notes || null,
      doctor: doctor || null,
      updated_at: new Date().toISOString(),
    };

    // Calculate Edit History Changes
    const changes = [];
    const compareField = (fieldName, label, formatter = (v) => v) => {
      const oldVal = bill[fieldName];
      const newVal = updates[fieldName];
      const normalizedOld = (oldVal === undefined || oldVal === null) ? "" : oldVal;
      const normalizedNew = (newVal === undefined || newVal === null) ? "" : newVal;
      if (normalizedOld !== normalizedNew) {
        changes.push({
          field: fieldName,
          old_value: formatter(oldVal),
          new_value: formatter(newVal),
          description: `Changed ${label} from "${formatter(oldVal) || "none"}" to "${formatter(newVal) || "none"}"`
        });
      }
    };

    compareField("customer_name", "Customer Name");
    compareField("customer_mobile", "Customer Mobile");
    compareField("doctor", "Doctor");
    compareField("discount_percent", "Discount %", (v) => v !== undefined && v !== null ? `${v}%` : "0%");
    compareField("grand_total", "Grand Total", (v) => v !== undefined && v !== null ? `₹${Number(v).toFixed(2)}` : "₹0.00");
    compareField("is_paid", "Payment Status", (v) => v ? "Paid" : "Unpaid");
    compareField("is_advance_paid", "Is Advance Paid", (v) => v ? "Yes" : "No");
    compareField("advance_amount", "Advance Amount", (v) => v !== undefined && v !== null ? `₹${Number(v).toFixed(2)}` : "₹0.00");
    compareField("payment_mode", "Payment Mode");
    compareField("due_date", "Due Date", (v) => v ? new Date(v).toLocaleDateString() : "");
    compareField("billing_date", "Billing Date", (v) => v ? new Date(v).toLocaleDateString() : "");

    // Items Comparison
    const oldItemsMap = {};
    const oldCounts = {};
    (bill.items || []).forEach(item => {
      const pId = item.inventory_id || item.product_name;
      oldCounts[pId] = (oldCounts[pId] || 0) + 1;
      const key = `${pId}_${oldCounts[pId]}`;
      oldItemsMap[key] = item;
    });

    const newItemsMap = {};
    const newCounts = {};
    processedItems.forEach(item => {
      const pId = item.inventory_id || item.product_name;
      newCounts[pId] = (newCounts[pId] || 0) + 1;
      const key = `${pId}_${newCounts[pId]}`;
      newItemsMap[key] = item;
    });

    const itemChanges = [];
    processedItems.forEach(item => {
      const pId = item.inventory_id || item.product_name;
      const count = newCounts[pId] || 0;
      const key = `${pId}_${count}`;
      const oldItem = oldItemsMap[key];
      if (!oldItem) {
        itemChanges.push(`Added item ${item.product_name} (Qty: ${item.quantity})`);
      } else {
        const changesList = [];
        
        const checkItemField = (oldField, newField, label, formatter = (v) => v) => {
          const oldVal = oldItem[oldField];
          const newVal = item[newField];
          const normalizedOld = (oldVal === undefined || oldVal === null) ? "" : String(oldVal).trim();
          const normalizedNew = (newVal === undefined || newVal === null) ? "" : String(newVal).trim();
          if (normalizedOld !== normalizedNew) {
            changesList.push(`${label}: ${formatter(oldVal) || "none"} -> ${formatter(newVal) || "none"}`);
          }
        };

        if (parseInt(oldItem.quantity) !== parseInt(item.quantity)) {
          changesList.push(`Qty: ${oldItem.quantity} -> ${item.quantity}`);
        }

        checkItemField("batch_no", "batch_no", "Batch");
        checkItemField("expiry_date", "expiry_date", "Expiry");
        checkItemField("cgst", "cgst", "CGST", (v) => `${v}%`);
        checkItemField("sgst", "sgst", "SGST", (v) => `${v}%`);
        checkItemField("discount_percent", "discount_percent", "Discount", (v) => `${v}%`);

        const oldPrice = oldItem.unit_price || 0;
        const newPrice = item.unit_price || 0;
        if (parseFloat(oldPrice).toFixed(2) !== parseFloat(newPrice).toFixed(2)) {
          changesList.push(`Rate: ₹${parseFloat(oldPrice).toFixed(2)} -> ₹${parseFloat(newPrice).toFixed(2)}`);
        }

        if (changesList.length > 0) {
          itemChanges.push(`Updated item ${item.product_name} (${changesList.join(", ")})`);
        }
      }
    });

    (bill.items || []).forEach(item => {
      const pId = item.inventory_id || item.product_name;
      const key = `${pId}_${oldCounts[pId] || 1}`;
      if (!newItemsMap[key]) {
        itemChanges.push(`Removed item ${item.product_name}`);
      }
    });

    if (itemChanges.length > 0) {
      changes.push({
        field: "items",
        description: itemChanges.join("; ")
      });
    }

    if (changes.length > 0) {
      const historyEntry = {
        updated_at: new Date().toISOString(),
        updated_by_id: req.user.id,
        updated_by_name: req.user.name,
        updated_by_avatar: req.user.image_url || null,
        changes: changes
      };
      updates.history = [...(bill.history || []), historyEntry];
    }

    await db
      .collection("bills")
      .updateOne({ id: req.params.bill_id }, { $set: updates });

    // Upsert doctor to pharmacy list
    if (doctor && doctor.trim()) {
      const docName = doctor.trim();
      await db.collection("doctors").updateOne(
        { pharmacy_id: req.user.pharmacy_id, name: { $regex: new RegExp(`^${docName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}$`, 'i') } },
        {
          $setOnInsert: {
            id: uuidv4(),
            pharmacy_id: req.user.pharmacy_id,
            name: docName,
            created_at: new Date().toISOString()
          }
        },
        { upsert: true }
      );
    }
      
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

      // Update customer debt and advance
      if (bill.customer_id) {
        const totalPaid = bill.total_paid !== undefined ? bill.total_paid : (bill.is_paid ? bill.total_amount : (bill.advance_amount || 0));
        let deliveredValue = 0;
        if (bill.is_advance_paid) {
          deliveredValue = (bill.items || []).reduce((sum, i) => i.delivery_status === "Delivered" ? sum + (i.item_total || 0) : sum, 0);
        } else {
          deliveredValue = bill.total_amount;
        }
        const activeDebt = Math.max(0, deliveredValue - totalPaid);
        const activeAdvance = Math.max(0, totalPaid - deliveredValue);

        await db
          .collection("customers")
          .updateOne(
            { id: bill.customer_id },
            { $inc: { total_debt: -activeDebt, total_advance: -activeAdvance } }
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

      const grandTotal = bill.grand_total || bill.total_amount || 0;
      const oldPaid = bill.total_paid !== undefined ? bill.total_paid : (bill.is_paid ? grandTotal : (bill.advance_amount || 0));
      let oldDeliveredValue = 0;
      if (bill.is_advance_paid) {
        oldDeliveredValue = (bill.items || []).reduce((sum, i) => i.delivery_status === "Delivered" ? sum + (i.item_total || 0) : sum, 0);
      } else {
        oldDeliveredValue = grandTotal;
      }
      const oldDebt = Math.max(0, oldDeliveredValue - oldPaid);
      const oldAdvance = Math.max(0, oldPaid - oldDeliveredValue);

      // Fully paid updates
      const newPaid = grandTotal;
      const newDebt = 0;
      const newAdvance = Math.max(0, newPaid - oldDeliveredValue);

      const deltaDebt = newDebt - oldDebt;
      const deltaAdvance = newAdvance - oldAdvance;

      if (bill.customer_id) {
        await db.collection("customers").updateOne(
          { id: bill.customer_id },
          { $inc: { total_debt: deltaDebt, total_advance: deltaAdvance } }
        );
      }

      await db
        .collection("bills")
        .updateOne(
          { id: req.params.bill_id },
          { $set: { is_paid: true, total_paid: newPaid, paid_at: new Date().toISOString() } }
        );
      
      await logActivity(db, req.user.pharmacy_id, req.user.id, req.user.name, "UPDATE", "BILLING", req.params.bill_id, `Marked Bill ${bill.bill_no} as Paid`, `/billing`);

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

      const pharmacyDoc = await db
        .collection("pharmacies")
        .findOne({ id: req.user.pharmacy_id }, { projection: { _id: 0 } });

      const pharmacy = pharmacyDoc ? {
        id: pharmacyDoc.id || null,
        name: pharmacyDoc.name || "",
        location: pharmacyDoc.location || "",
        license_no: pharmacyDoc.license_no || "",
        years_old: pharmacyDoc.years_old || null,
        logo_url: pharmacyDoc.logo_url || null,
        contact: pharmacyDoc.contact || "",
        pan: pharmacyDoc.pan || "",
        bank_name: pharmacyDoc.bank_name || "",
        bank_ifsc: pharmacyDoc.bank_ifsc || "",
        bank_acc_no: pharmacyDoc.bank_acc_no || "",
        bank_holder: pharmacyDoc.bank_holder || "",
        upi_id: pharmacyDoc.upi_id || "",
        gst_no: pharmacyDoc.gst_no || "",
        created_at: pharmacyDoc.created_at || null
      } : {
        id: null,
        name: "",
        location: "",
        license_no: "",
        years_old: null,
        logo_url: null,
        contact: "",
        pan: "",
        bank_name: "",
        bank_ifsc: "",
        bank_acc_no: "",
        bank_holder: "",
        upi_id: "",
        gst_no: ""
      };

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
        const pharmacyDoc = await db
          .collection("pharmacies")
          .findOne({ id: req.user.pharmacy_id }, { projection: { _id: 0 } });

        const pharmacy = pharmacyDoc ? {
          id: pharmacyDoc.id || null,
          name: pharmacyDoc.name || "",
          location: pharmacyDoc.location || "",
          license_no: pharmacyDoc.license_no || "",
          years_old: pharmacyDoc.years_old || null,
          logo_url: pharmacyDoc.logo_url || null,
          contact: pharmacyDoc.contact || "",
          pan: pharmacyDoc.pan || "",
          bank_name: pharmacyDoc.bank_name || "",
          bank_ifsc: pharmacyDoc.bank_ifsc || "",
          bank_acc_no: pharmacyDoc.bank_acc_no || "",
          bank_holder: pharmacyDoc.bank_holder || "",
          upi_id: pharmacyDoc.upi_id || "",
          gst_no: pharmacyDoc.gst_no || "",
          created_at: pharmacyDoc.created_at || null
        } : {
          id: null,
          name: "",
          location: "",
          license_no: "",
          years_old: null,
          logo_url: null,
          contact: "",
          pan: "",
          bank_name: "",
          bank_ifsc: "",
          bank_acc_no: "",
          bank_holder: "",
          upi_id: "",
          gst_no: ""
        };

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

// POST /api/bills/:bill_id/record-payment
router.post(
  "/:bill_id/record-payment",
  auth,
  requireSubscription(),
  async (req, res, next) => {
    try {
      const db = mongoose.connection.db;
      const { amount, payment_mode } = req.body;

      const paymentAmount = Number(amount);
      if (isNaN(paymentAmount) || paymentAmount <= 0) {
        return res.status(400).json({ detail: "Invalid payment amount" });
      }

      const bill = await db.collection("bills").findOne({
        id: req.params.bill_id,
        pharmacy_id: req.user.pharmacy_id,
      });

      if (!bill) {
        return res.status(404).json({ detail: "Bill not found" });
      }

      const grandTotal = bill.grand_total || bill.total_amount || 0;
      const currentPaid = bill.total_paid !== undefined ? bill.total_paid : (bill.is_paid ? grandTotal : (bill.advance_amount || 0));
      const remainingUnpaid = Math.max(0, grandTotal - currentPaid);

      if (paymentAmount > remainingUnpaid) {
        return res.status(400).json({ detail: `Payment amount ₹${paymentAmount} exceeds remaining unpaid balance of ₹${remainingUnpaid}` });
      }

      // Calculate old debt/advance
      let oldDeliveredValue = 0;
      if (bill.is_advance_paid) {
        oldDeliveredValue = (bill.items || []).reduce((sum, i) => i.delivery_status === "Delivered" ? sum + (i.item_total || 0) : sum, 0);
      } else {
        oldDeliveredValue = grandTotal;
      }
      const oldDebt = Math.max(0, oldDeliveredValue - currentPaid);
      const oldAdvance = Math.max(0, currentPaid - oldDeliveredValue);

      // New paid amount
      const newPaid = currentPaid + paymentAmount;
      const isPaid = newPaid >= grandTotal;

      // New debt/advance
      const newDebt = Math.max(0, oldDeliveredValue - newPaid);
      const newAdvance = Math.max(0, newPaid - oldDeliveredValue);

      const deltaDebt = newDebt - oldDebt;
      const deltaAdvance = newAdvance - oldAdvance;

      if (bill.customer_id) {
        await db.collection("customers").updateOne(
          { id: bill.customer_id },
          { $inc: { total_debt: deltaDebt, total_advance: deltaAdvance } }
        );
      }

      let paymentsList = bill.payments || [];
      if (paymentsList.length === 0 && currentPaid > 0) {
        paymentsList = [
          {
            amount: currentPaid,
            payment_mode: bill.payment_mode || "Cash",
            paid_at: bill.created_at || bill.billing_date || new Date().toISOString()
          }
        ];
      }
      paymentsList.push({
        amount: paymentAmount,
        payment_mode: payment_mode || "Cash",
        paid_at: new Date().toISOString()
      });

      await db.collection("bills").updateOne(
        { id: req.params.bill_id },
        { 
          $set: { 
            total_paid: newPaid,
            is_paid: isPaid,
            payment_date: new Date().toISOString(),
            payment_mode: payment_mode || bill.payment_mode,
            payments: paymentsList
          } 
        }
      );

      await logActivity(db, req.user.pharmacy_id, req.user.id, req.user.name, "UPDATE", "BILLING", req.params.bill_id, `Recorded payment of ₹${paymentAmount} for Bill ${bill.bill_no}`, `/billing`);

      res.json({ message: "Payment recorded successfully", total_paid: newPaid, is_paid: isPaid });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/bills/:bill_id/update-delivery
router.post(
  "/:bill_id/update-delivery",
  auth,
  requireSubscription(),
  async (req, res, next) => {
    try {
      const db = mongoose.connection.db;
      const { items_delivery } = req.body; // Array of { item_index: number, delivery_status: "Pending" | "Delivered" }

      const bill = await db.collection("bills").findOne({
        id: req.params.bill_id,
        pharmacy_id: req.user.pharmacy_id,
      });

      if (!bill) {
        return res.status(404).json({ detail: "Bill not found" });
      }

      const grandTotal = bill.grand_total || bill.total_amount || 0;
      const currentPaid = bill.total_paid !== undefined ? bill.total_paid : (bill.is_paid ? grandTotal : (bill.advance_amount || 0));

      // Calculate old stats
      let oldDeliveredValue = 0;
      if (bill.is_advance_paid) {
        oldDeliveredValue = (bill.items || []).reduce((sum, i) => i.delivery_status === "Delivered" ? sum + (i.item_total || 0) : sum, 0);
      } else {
        oldDeliveredValue = grandTotal;
      }
      const oldDebt = Math.max(0, oldDeliveredValue - currentPaid);
      const oldAdvance = Math.max(0, currentPaid - oldDeliveredValue);

      // Update bill items
      const updatedItems = [...bill.items];
      items_delivery.forEach(({ item_index, delivery_status }) => {
        if (updatedItems[item_index]) {
          updatedItems[item_index].delivery_status = delivery_status;
          if (delivery_status === "Delivered") {
            updatedItems[item_index].delivered_at = new Date().toISOString();
          } else {
            delete updatedItems[item_index].delivered_at;
          }
        }
      });

      // Calculate new stats
      const newDeliveredValue = updatedItems.reduce((sum, i) => i.delivery_status === "Delivered" ? sum + (i.item_total || 0) : sum, 0);
      const newDebt = Math.max(0, newDeliveredValue - currentPaid);
      const newAdvance = Math.max(0, currentPaid - newDeliveredValue);

      const deltaDebt = newDebt - oldDebt;
      const deltaAdvance = newAdvance - oldAdvance;

      if (bill.customer_id) {
        await db.collection("customers").updateOne(
          { id: bill.customer_id },
          { $inc: { total_debt: deltaDebt, total_advance: deltaAdvance } }
        );
      }

      const allDelivered = updatedItems.every(i => i.delivery_status === "Delivered");
      const someDelivered = updatedItems.some(i => i.delivery_status === "Delivered");
      const overallDeliveryStatus = allDelivered ? "Delivered" : (someDelivered ? "Partially Delivered" : "Pending");

      await db.collection("bills").updateOne(
        { id: req.params.bill_id },
        { 
          $set: { 
            items: updatedItems,
            delivery_status: overallDeliveryStatus
          } 
        }
      );

      await logActivity(db, req.user.pharmacy_id, req.user.id, req.user.name, "UPDATE", "BILLING", req.params.bill_id, `Updated delivery status of Bill ${bill.bill_no} to ${overallDeliveryStatus}`, `/billing`);

      res.json({ message: "Delivery status updated successfully", delivery_status: overallDeliveryStatus });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
