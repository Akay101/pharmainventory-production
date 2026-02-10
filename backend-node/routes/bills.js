const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");
const { auth } = require("../middleware/auth");
const { generateBillPDF } = require("../services/pdf");
const { uploadToR2 } = require("../services/r2");
const { sendBillEmail } = require("../services/email");

// Generate bill number
const generateBillNo = () => {
  const now = new Date();
  return `BILL-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
};

// GET /api/bills
router.get("/", auth, async (req, res, next) => {
  try {
    const db = mongoose.connection.db;
    const {
      search,
      is_paid,
      start_date,
      end_date,
      page = 1,
      limit = 20,
      sort_by = "created_at",
      sort_order = "desc",
    } = req.query;

    const query = { pharmacy_id: req.user.pharmacy_id };

    if (search) {
      query.$or = [
        { bill_no: { $regex: search, $options: "i" } },
        { customer_name: { $regex: search, $options: "i" } },
      ];
    }
    if (is_paid !== undefined) query.is_paid = is_paid === "true";
    if (start_date || end_date) {
      query.created_at = {};
      if (start_date) query.created_at.$gte = start_date;
      if (end_date) query.created_at.$lte = end_date + "T23:59:59";
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sortDir = sort_order === "asc" ? 1 : -1;

    const bills = await db
      .collection("bills")
      .find(query, { projection: { _id: 0 } })
      .sort({ [sort_by]: sortDir })
      .skip(skip)
      .limit(parseInt(limit))
      .toArray();

    // Ensure grand_total is always present for frontend
    const processedBills = bills.map((bill) => ({
      ...bill,
      grand_total: bill.grand_total || bill.total_amount || 0,
      total_amount: bill.total_amount || bill.grand_total || 0,
    }));

    const total = await db.collection("bills").countDocuments(query);

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

// POST /api/bills
router.post("/", auth, async (req, res, next) => {
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
            { $inc: { available_quantity: -quantity } }
          );
      }
    }

    const discountAmount = subtotal * (discount_percent / 100);
    const totalAmount = subtotal - discountAmount;
    totalProfit -= discountAmount;

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

    res.status(201).json({ message: "Bill created", bill });
  } catch (error) {
    next(error);
  }
});

// GET /api/bills/:bill_id
router.get("/:bill_id", auth, async (req, res, next) => {
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
router.put("/:bill_id", auth, async (req, res, next) => {
  try {
    const {
      customer_name,
      customer_mobile,
      customer_email,
      discount_percent,
      notes,
      is_paid,
      due_date,
    } = req.body;
    const db = mongoose.connection.db;

    const bill = await db.collection("bills").findOne({
      id: req.params.bill_id,
      pharmacy_id: req.user.pharmacy_id,
    });

    if (!bill) {
      return res.status(404).json({ detail: "Bill not found" });
    }

    const updates = {};
    if (customer_name !== undefined) updates.customer_name = customer_name;
    if (customer_mobile !== undefined)
      updates.customer_mobile = customer_mobile;
    if (customer_email !== undefined) updates.customer_email = customer_email;
    if (notes !== undefined) updates.notes = notes;
    if (due_date !== undefined) updates.due_date = due_date;

    // Handle discount update
    if (
      discount_percent !== undefined &&
      discount_percent !== bill.discount_percent
    ) {
      updates.discount_percent = discount_percent;
      updates.discount_amount = bill.subtotal * (discount_percent / 100);
      updates.total_amount = bill.subtotal - updates.discount_amount;
    }

    // Handle payment status change
    if (is_paid !== undefined && is_paid !== bill.is_paid) {
      updates.is_paid = is_paid;
      if (is_paid) {
        updates.paid_at = new Date().toISOString();
        // Reduce customer debt
        if (bill.customer_id) {
          await db
            .collection("customers")
            .updateOne(
              { id: bill.customer_id },
              { $inc: { total_debt: -bill.total_amount } }
            );
        }
      } else {
        // Increase customer debt
        if (bill.customer_id) {
          await db
            .collection("customers")
            .updateOne(
              { id: bill.customer_id },
              { $inc: { total_debt: bill.total_amount } }
            );
        }
      }
    }

    updates.updated_at = new Date().toISOString();

    await db
      .collection("bills")
      .updateOne({ id: req.params.bill_id }, { $set: updates });

    const updated = await db
      .collection("bills")
      .findOne({ id: req.params.bill_id }, { projection: { _id: 0 } });

    res.json({ message: "Bill updated", bill: updated });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/bills/:bill_id
router.delete("/:bill_id", auth, async (req, res, next) => {
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
    res.json({
      message: "Bill deleted",
      inventory_restored: restore_inventory === "true",
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/bills/:bill_id/mark-paid
router.post("/:bill_id/mark-paid", auth, async (req, res, next) => {
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
});

// POST /api/bills/:bill_id/pdf
router.post("/:bill_id/pdf", auth, async (req, res, next) => {
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
});

// POST /api/bills/:bill_id/email
router.post("/:bill_id/email", auth, async (req, res, next) => {
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
});

module.exports = router;
