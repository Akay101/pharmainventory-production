const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");
const { auth } = require("../middleware/auth");
const { logActivity } = require("../utils/activityLogger");

const { requireSubscription } = require("../middleware/subscription");

// GET /api/suppliers
router.get("/", auth, requireSubscription(), async (req, res, next) => {
  try {
    const db = mongoose.connection.db;
    const { search, page = 1, limit = 50 } = req.query;

    const query = { pharmacy_id: req.user.pharmacy_id };
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { contact: { $regex: search, $options: "i" } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const suppliers = await db
      .collection("suppliers")
      .find(query, { projection: { _id: 0 } })
      .skip(skip)
      .limit(parseInt(limit))
      .toArray();

    // Augment with total owed
    const supplierIds = suppliers.map((s) => s.id);
    const purchases = await db
      .collection("purchases")
      .find({ supplier_id: { $in: supplierIds }, payment_status: { $ne: "Paid" } })
      .project({ _id: 0, supplier_id: 1, total_amount: 1, amount_paid: 1, payment_status: 1 })
      .toArray();

    const owedBySupplier = {};
    purchases.forEach((p) => {
      const remaining = (p.total_amount || 0) - (p.amount_paid || 0);
      if (remaining > 0) {
        owedBySupplier[p.supplier_id] = (owedBySupplier[p.supplier_id] || 0) + remaining;
      }
    });

    const augmentedSuppliers = suppliers.map((s) => ({
      ...s,
      total_amount_owed: owedBySupplier[s.id] || 0,
    }));

    const total = await db.collection("suppliers").countDocuments(query);

    res.json({
      suppliers: augmentedSuppliers,
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

// POST /api/suppliers
router.post("/", auth, requireSubscription(), async (req, res, next) => {
  try {
    const { name, contact, email, address, gst_no, notes } = req.body;
    const db = mongoose.connection.db;

    const supplierId = uuidv4();
    const supplierData = {
      id: supplierId,
      pharmacy_id: req.user.pharmacy_id,
      name,
      contact: contact || null,
      email: email || null,
      address: address || null,
      gst_no: gst_no || null,
      notes: notes || null,
      created_at: new Date().toISOString(),
    };

    await db.collection("suppliers").insertOne(supplierData);
    const { _id, ...supplier } = supplierData;
    await logActivity(db, req.user.pharmacy_id, req.user.id, req.user.name, "CREATE", "SUPPLIERS", supplierId, `Added Supplier ${name}`, `/suppliers`);

    res.status(201).json({ message: "Supplier created", supplier });
  } catch (error) {
    next(error);
  }
});

// GET /api/suppliers/:supplier_id
router.get(
  "/:supplier_id",
  auth,
  requireSubscription(),
  async (req, res, next) => {
    try {
      const db = mongoose.connection.db;
      const supplier = await db
        .collection("suppliers")
        .findOne(
          { id: req.params.supplier_id, pharmacy_id: req.user.pharmacy_id },
          { projection: { _id: 0 } }
        );

      if (!supplier) {
        return res.status(404).json({ detail: "Supplier not found" });
      }

      // Get purchases from this supplier
      const purchases = await db
        .collection("purchases")
        .find({ supplier_id: req.params.supplier_id })
        .sort({ created_at: -1 })
        .project({ _id: 0 })
        .toArray();

      // Calculate total amount owed
      let totalAmountOwed = 0;
      purchases.forEach((p) => {
        const total = p.total_amount || 0;
        const paid = p.amount_paid || 0;
        if (p.payment_status !== "Paid" && total > paid) {
          totalAmountOwed += (total - paid);
        }
      });

      res.json({ supplier, purchases, total_amount_owed: totalAmountOwed });
    } catch (error) {
      next(error);
    }
  }
);

// PUT /api/suppliers/:supplier_id
router.put(
  "/:supplier_id",
  auth,
  requireSubscription(),
  async (req, res, next) => {
    try {
      const { name, contact, email, address, gst_no, notes } = req.body;
      const db = mongoose.connection.db;

      const result = await db
        .collection("suppliers")
        .updateOne(
          { id: req.params.supplier_id, pharmacy_id: req.user.pharmacy_id },
          { $set: { name, contact, email, address, gst_no, notes } }
        );

      if (result.matchedCount === 0) {
        return res.status(404).json({ detail: "Supplier not found" });
      }
      
      await logActivity(db, req.user.pharmacy_id, req.user.id, req.user.name, "UPDATE", "SUPPLIERS", req.params.supplier_id, `Updated Supplier ${name}`, `/suppliers`);

      const supplier = await db
        .collection("suppliers")
        .findOne({ id: req.params.supplier_id }, { projection: { _id: 0 } });

      res.json({ message: "Supplier updated", supplier });
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /api/suppliers/:supplier_id
router.delete(
  "/:supplier_id",
  auth,
  requireSubscription(),
  async (req, res, next) => {
    try {
      const db = mongoose.connection.db;
      const result = await db.collection("suppliers").deleteOne({
        id: req.params.supplier_id,
        pharmacy_id: req.user.pharmacy_id,
      });

      if (result.deletedCount === 0) {
        return res.status(404).json({ detail: "Supplier not found" });
      }
      
      await logActivity(db, req.user.pharmacy_id, req.user.id, req.user.name, "DELETE", "SUPPLIERS", req.params.supplier_id, `Deleted Supplier`, `/suppliers`);

      res.json({ message: "Supplier deleted" });
    } catch (error) {
      next(error);
    }
  }
);
// POST /api/suppliers/:supplier_id/pay-all
router.post(
  "/:supplier_id/pay-all",
  auth,
  requireSubscription(),
  async (req, res, next) => {
    try {
      const db = mongoose.connection.db;
      const purchases = await db.collection("purchases").find({
        supplier_id: req.params.supplier_id,
        pharmacy_id: req.user.pharmacy_id,
        payment_status: { $ne: "Paid" }
      }).toArray();

      if (purchases.length === 0) {
        return res.status(400).json({ detail: "No outstanding balances to pay" });
      }

      const timestamp = new Date().toISOString();
      let totalPaid = 0;

      for (const purchase of purchases) {
        const remaining = (purchase.total_amount || 0) - (purchase.amount_paid || 0);
        if (remaining > 0) {
          totalPaid += remaining;
          await db.collection("purchases").updateOne(
            { id: purchase.id },
            { 
              $set: { 
                payment_status: "Paid",
                amount_paid: purchase.total_amount,
                updated_at: timestamp
              },
              $push: {
                payments: {
                  amount: remaining,
                  date: timestamp,
                  notes: "Bulk Cleared via Supplier Dues",
                  recorded_by: req.user.id
                }
              }
            }
          );
        }
      }

      await logActivity(db, req.user.pharmacy_id, req.user.id, req.user.name, "PAYMENT", "SUPPLIERS", req.params.supplier_id, `Cleared all outstanding dues (₹${totalPaid.toFixed(2)})`, `/suppliers`);

      res.json({ message: "All outstanding dues cleared successfully", total_paid: totalPaid });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
