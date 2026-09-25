const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");
const { auth } = require("../middleware/auth");
const { requireSubscription } = require("../middleware/subscription");
const { logActivity } = require("../utils/activityLogger");

const escapeRegex = (str) => {
  if (!str) return "";
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

// GET /api/expiry - List all expiry bundles
router.get("/", auth, requireSubscription(), async (req, res, next) => {
  try {
    const db = mongoose.connection.db;
    const {
      search,
      status,
      supplier_id,
      start_date,
      end_date,
      page = 1,
      limit = 20,
      sort_by = "created_at",
      sort_order = "desc",
    } = req.query;

    const query = { pharmacy_id: req.user.pharmacy_id };

    if (status && status !== "all") {
      query.status = status;
    }

    if (supplier_id && supplier_id !== "all") {
      query.supplier_id = supplier_id;
    }

    if (search) {
      const escaped = escapeRegex(search);
      query.$or = [
        { bundle_no: { $regex: escaped, $options: "i" } },
        { supplier_name: { $regex: escaped, $options: "i" } },
        { "items.product_name": { $regex: escaped, $options: "i" } },
        { "items.batch_no": { $regex: escaped, $options: "i" } },
      ];
    }

    if (start_date || end_date) {
      query.created_at = {};
      if (start_date) query.created_at.$gte = start_date;
      if (end_date) query.created_at.$lte = end_date + "T23:59:59.999Z";
    }

    const sortDir = sort_order === "asc" ? 1 : -1;
    const parsedPage = parseInt(page) || 1;
    const parsedLimit = parseInt(limit) || 20;
    const skip = (parsedPage - 1) * parsedLimit;

    const total = await db.collection("expiry_bundles").countDocuments(query);
    const bundles = await db
      .collection("expiry_bundles")
      .find(query, { projection: { _id: 0 } })
      .sort({ [sort_by]: sortDir })
      .skip(skip)
      .limit(parsedLimit)
      .toArray();

    // Summary stats
    const allBundles = await db
      .collection("expiry_bundles")
      .find({ pharmacy_id: req.user.pharmacy_id }, { projection: { _id: 0 } })
      .toArray();

    let totalValue = 0;
    let pendingPayments = 0;
    let completedReturns = 0;
    let totalItems = 0;

    allBundles.forEach((b) => {
      totalValue += b.total_amount || 0;
      const remaining = (b.total_amount || 0) - (b.amount_paid || 0);
      if (b.status !== "Payment Done (Returned)") {
        pendingPayments += Math.max(0, remaining);
      } else {
        completedReturns += b.total_amount || 0;
      }
      totalItems += (b.items || []).length;
    });

    // Fetch unbundled batches marked as Moved to Expiry
    const unbundledBatches = await db
      .collection("inventory")
      .aggregate([
        {
          $match: {
            pharmacy_id: req.user.pharmacy_id,
            expiry_status: "Moved to Expiry",
            $or: [
              { expiry_bundle_id: null },
              { expiry_bundle_id: "" },
              { expiry_bundle_id: { $exists: false } },
            ],
          },
        },
        {
          $lookup: {
            from: "suppliers",
            localField: "supplier_id",
            foreignField: "id",
            as: "supplier_info",
          },
        },
        {
          $unwind: {
            path: "$supplier_info",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $project: {
            _id: 0,
            id: 1,
            product_id: 1,
            product_name: 1,
            batch_no: 1,
            expiry_date: 1,
            available_quantity: 1,
            pack_type: 1,
            units_per_pack: 1,
            purchase_price: 1,
            mrp: 1,
            supplier_id: 1,
            supplier_name: { $ifNull: ["$supplier_name", "$supplier_info.name", "Unknown Supplier"] },
            expiry_status: 1,
          },
        },
      ])
      .toArray();

    res.json({
      bundles,
      unbundled_batches: unbundledBatches,
      stats: {
        total_bundles: allBundles.length,
        total_value: totalValue,
        pending_payments: pendingPayments,
        completed_returns: completedReturns,
        total_items: totalItems,
        unbundled_count: unbundledBatches.length,
      },
      pagination: {
        page: parsedPage,
        limit: parsedLimit,
        total,
        total_pages: Math.ceil(total / parsedLimit) || 1,
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/expiry/batches - Browse expired batches from inventory
router.get("/batches", auth, requireSubscription(), async (req, res, next) => {
  try {
    const db = mongoose.connection.db;
    const { search, supplier_id, status_filter } = req.query;

    const todayStr = new Date().toISOString().split("T")[0];

    const matchQuery = {
      pharmacy_id: req.user.pharmacy_id,
      $or: [
        { expiry_date: { $ne: null, $lt: todayStr } },
        { expiry_status: { $in: ["Moved to Expiry", "Picked", "Expired & Returned"] } },
      ],
    };

    if (supplier_id && supplier_id !== "all") {
      matchQuery.supplier_id = supplier_id;
    }

    if (search) {
      const escaped = escapeRegex(search);
      matchQuery.$and = [
        {
          $or: [
            { product_name: { $regex: escaped, $options: "i" } },
            { batch_no: { $regex: escaped, $options: "i" } },
            { salt_composition: { $regex: escaped, $options: "i" } },
            { manufacturer: { $regex: escaped, $options: "i" } },
          ],
        },
      ];
    }

    if (status_filter === "unmoved") {
      matchQuery.expiry_status = { $in: [null, "", "Not Moved"] };
      matchQuery.available_quantity = { $gt: 0 };
    } else if (status_filter === "moved") {
      matchQuery.expiry_status = { $in: ["Moved to Expiry", "Picked"] };
    } else if (status_filter === "returned") {
      matchQuery.expiry_status = "Expired & Returned";
    }

    const batches = await db
      .collection("inventory")
      .aggregate([
        { $match: matchQuery },
        {
          $lookup: {
            from: "suppliers",
            localField: "supplier_id",
            foreignField: "id",
            as: "supplier_info",
          },
        },
        {
          $unwind: {
            path: "$supplier_info",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $project: {
            _id: 0,
            id: 1,
            product_id: 1,
            product_name: 1,
            batch_no: 1,
            expiry_date: 1,
            available_quantity: 1,
            quantity: 1,
            pack_type: 1,
            units_per_pack: 1,
            purchase_price: 1,
            mrp: 1,
            manufacturer: 1,
            salt_composition: 1,
            supplier_id: 1,
            supplier_name: { $ifNull: ["$supplier_name", "$supplier_info.name"] },
            expiry_status: 1,
            expiry_bundle_id: 1,
            expiry_bundle_no: 1,
            created_at: 1,
          },
        },
        { $sort: { expiry_date: 1 } },
      ])
      .toArray();

    res.json({
      batches,
      count: batches.length,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/expiry/:id - Get single expiry bundle
router.get("/:id", auth, requireSubscription(), async (req, res, next) => {
  try {
    const db = mongoose.connection.db;
    const bundle = await db.collection("expiry_bundles").findOne(
      { id: req.params.id, pharmacy_id: req.user.pharmacy_id },
      { projection: { _id: 0 } }
    );

    if (!bundle) {
      return res.status(404).json({ detail: "Expiry bundle not found" });
    }

    res.json(bundle);
  } catch (error) {
    next(error);
  }
});

// POST /api/expiry - Create new expiry bundle
router.post("/", auth, requireSubscription(), async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const db = mongoose.connection.db;
    const {
      supplier_id,
      supplier_name,
      items,
      notes,
      status = "Draft",
      return_date = new Date().toISOString().split("T")[0],
    } = req.body;

    if (!supplier_id) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ detail: "Supplier is required" });
    }

    if (!items || items.length === 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ detail: "At least one batch item is required" });
    }

    // Generate bundle number EXP-YYYYMM-XXXX
    const datePrefix = new Date().toISOString().slice(0, 7).replace("-", "");
    const count = await db.collection("expiry_bundles").countDocuments({
      pharmacy_id: req.user.pharmacy_id,
    });
    const bundleNo = `EXP-${datePrefix}-${String(count + 1).padStart(4, "0")}`;

    const bundleId = uuidv4();
    let totalAmount = 0;

    const processedItems = items.map((item) => {
      const units = Number(item.quantity_units) || Number(item.available_quantity) || 0;
      const rate = Number(item.purchase_price) || 0;
      const itemTotal = Number(item.total_refund_amount) || units * rate;
      totalAmount += itemTotal;

      return {
        inventory_id: item.inventory_id || item.id,
        product_id: item.product_id,
        product_name: item.product_name,
        batch_no: item.batch_no,
        expiry_date: item.expiry_date,
        pack_type: item.pack_type || "Strip",
        units_per_pack: Number(item.units_per_pack) || 1,
        quantity_units: units,
        pack_quantity: Number(item.pack_quantity) || (units / (Number(item.units_per_pack) || 1)),
        purchase_price: rate,
        mrp: Number(item.mrp) || 0,
        total_refund_amount: itemTotal,
        notes: item.notes || "",
      };
    });

    const bundleData = {
      id: bundleId,
      pharmacy_id: req.user.pharmacy_id,
      bundle_no: bundleNo,
      supplier_id,
      supplier_name: supplier_name || "Unknown Supplier",
      status: status || "Draft",
      return_type: "Expiry",
      return_date,
      items: processedItems,
      total_amount: Math.round(totalAmount * 100) / 100,
      amount_paid: 0,
      remaining_amount: Math.round(totalAmount * 100) / 100,
      payments: [],
      notes: notes || "",
      created_by: req.user.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await db.collection("expiry_bundles").insertOne(bundleData, { session });

    // Mark matching inventory batches as "Moved to Expiry"
    for (const item of processedItems) {
      if (item.inventory_id) {
        await db.collection("inventory").updateOne(
          { id: item.inventory_id, pharmacy_id: req.user.pharmacy_id },
          {
            $set: {
              expiry_status: "Moved to Expiry",
              expiry_bundle_id: bundleId,
              expiry_bundle_no: bundleNo,
              updated_at: new Date().toISOString(),
            },
          },
          { session }
        );
      } else if (item.batch_no && item.product_name) {
        await db.collection("inventory").updateOne(
          {
            pharmacy_id: req.user.pharmacy_id,
            product_name: item.product_name,
            batch_no: item.batch_no,
          },
          {
            $set: {
              expiry_status: "Moved to Expiry",
              expiry_bundle_id: bundleId,
              expiry_bundle_no: bundleNo,
              updated_at: new Date().toISOString(),
            },
          },
          { session }
        );
      }
    }

    await session.commitTransaction();
    session.endSession();

    await logActivity({
      pharmacy_id: req.user.pharmacy_id,
      user_id: req.user.id,
      user_name: req.user.name,
      action: "CREATE_EXPIRY_BUNDLE",
      details: `Created Expiry Return Note ${bundleNo} for supplier ${supplier_name} with ${processedItems.length} items (₹${bundleData.total_amount})`,
    });

    res.status(201).json(bundleData);
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    next(error);
  }
});

// POST /api/expiry/move-batch - Quick action to mark a batch as moved to expiry
router.post("/move-batch", auth, requireSubscription(), async (req, res, next) => {
  try {
    const db = mongoose.connection.db;
    const { inventory_id, batch_no, product_name } = req.body;

    const query = { pharmacy_id: req.user.pharmacy_id };
    if (inventory_id) {
      query.id = inventory_id;
    } else if (batch_no && product_name) {
      query.batch_no = batch_no;
      query.product_name = product_name;
    } else {
      return res.status(400).json({ detail: "inventory_id or batch_no + product_name is required" });
    }

    const batch = await db.collection("inventory").findOne(query);
    if (!batch) {
      return res.status(404).json({ detail: "Batch not found in inventory" });
    }

    await db.collection("inventory").updateOne(query, {
      $set: {
        expiry_status: "Moved to Expiry",
        updated_at: new Date().toISOString(),
      },
    });

    res.json({ message: "Batch marked as Moved to Expiry", batch_id: batch.id });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/expiry/:id/status - Advance or update status
router.patch("/:id/status", auth, requireSubscription(), async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const db = mongoose.connection.db;
    const { status } = req.body;

    const validStatuses = [
      "Draft",
      "Picked - Payment Pending",
      "Partial Paid",
      "Payment Done (Returned)",
    ];

    if (!validStatuses.includes(status)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ detail: "Invalid status" });
    }

    const bundle = await db.collection("expiry_bundles").findOne(
      { id: req.params.id, pharmacy_id: req.user.pharmacy_id },
      { session }
    );

    if (!bundle) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ detail: "Expiry bundle not found" });
    }

    const updateFields = {
      status,
      updated_at: new Date().toISOString(),
    };

    if (status === "Payment Done (Returned)") {
      updateFields.returned_at = new Date().toISOString();
      updateFields.remaining_amount = 0;
      updateFields.amount_paid = bundle.total_amount;

      // Deduct/Zero out inventory stock for these batches & mark Expired & Returned
      for (const item of bundle.items || []) {
        if (item.inventory_id) {
          await db.collection("inventory").updateOne(
            { id: item.inventory_id, pharmacy_id: req.user.pharmacy_id },
            {
              $set: {
                available_quantity: 0,
                expiry_status: "Expired & Returned",
                status: "Expired & Returned",
                updated_at: new Date().toISOString(),
              },
            },
            { session }
          );
        }

        // Update purchase record items matching this product & batch
        await db.collection("purchases").updateMany(
          {
            pharmacy_id: req.user.pharmacy_id,
            "items.batch_no": item.batch_no,
            "items.product_name": item.product_name,
          },
          {
            $set: {
              "items.$[elem].status": "Expired & Returned",
              "items.$[elem].returned_at": new Date().toISOString(),
              "items.$[elem].return_bundle_no": bundle.bundle_no,
            },
          },
          {
            arrayFilters: [
              {
                "elem.batch_no": item.batch_no,
                "elem.product_name": item.product_name,
              },
            ],
            session,
          }
        );
      }
    } else if (status === "Picked - Payment Pending") {
      // Mark inventory batches as Picked
      for (const item of bundle.items || []) {
        if (item.inventory_id) {
          await db.collection("inventory").updateOne(
            { id: item.inventory_id, pharmacy_id: req.user.pharmacy_id },
            {
              $set: {
                expiry_status: "Picked",
                updated_at: new Date().toISOString(),
              },
            },
            { session }
          );
        }
      }
    }

    await db.collection("expiry_bundles").updateOne(
      { id: bundle.id },
      { $set: updateFields },
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    await logActivity({
      pharmacy_id: req.user.pharmacy_id,
      user_id: req.user.id,
      user_name: req.user.name,
      action: "UPDATE_EXPIRY_STATUS",
      details: `Updated Expiry Bundle ${bundle.bundle_no} status to "${status}"`,
    });

    res.json({ message: "Status updated successfully", status });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    next(error);
  }
});

// POST /api/expiry/:id/payments - Record partial or full payment
router.post("/:id/payments", auth, requireSubscription(), async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const db = mongoose.connection.db;
    const {
      amount,
      payment_mode = "Cash",
      payment_date = new Date().toISOString(),
      reference_no,
      notes,
    } = req.body;

    const payAmount = parseFloat(amount);
    if (isNaN(payAmount) || payAmount <= 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ detail: "Valid positive payment amount is required" });
    }

    const bundle = await db.collection("expiry_bundles").findOne(
      { id: req.params.id, pharmacy_id: req.user.pharmacy_id },
      { session }
    );

    if (!bundle) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ detail: "Expiry bundle not found" });
    }

    const newPayment = {
      id: uuidv4(),
      amount: payAmount,
      payment_mode,
      payment_date: payment_date || new Date().toISOString(),
      reference_no: reference_no || "",
      notes: notes || "",
      recorded_by: {
        id: req.user.id,
        name: req.user.name,
      },
      created_at: new Date().toISOString(),
    };

    const updatedPayments = [...(bundle.payments || []), newPayment];
    const newTotalPaid = updatedPayments.reduce((acc, p) => acc + (p.amount || 0), 0);
    const newRemaining = Math.max(0, (bundle.total_amount || 0) - newTotalPaid);

    let nextStatus = bundle.status;
    if (newRemaining <= 0) {
      nextStatus = "Payment Done (Returned)";
    } else if (newTotalPaid > 0) {
      nextStatus = "Partial Paid";
    }

    const updateData = {
      payments: updatedPayments,
      amount_paid: Math.round(newTotalPaid * 100) / 100,
      remaining_amount: Math.round(newRemaining * 100) / 100,
      status: nextStatus,
      updated_at: new Date().toISOString(),
    };

    if (nextStatus === "Payment Done (Returned)") {
      updateData.returned_at = new Date().toISOString();

      // Zero out inventory batches & mark purchase items
      for (const item of bundle.items || []) {
        if (item.inventory_id) {
          await db.collection("inventory").updateOne(
            { id: item.inventory_id, pharmacy_id: req.user.pharmacy_id },
            {
              $set: {
                available_quantity: 0,
                expiry_status: "Expired & Returned",
                status: "Expired & Returned",
                updated_at: new Date().toISOString(),
              },
            },
            { session }
          );
        }

        await db.collection("purchases").updateMany(
          {
            pharmacy_id: req.user.pharmacy_id,
            "items.batch_no": item.batch_no,
            "items.product_name": item.product_name,
          },
          {
            $set: {
              "items.$[elem].status": "Expired & Returned",
              "items.$[elem].returned_at": new Date().toISOString(),
              "items.$[elem].return_bundle_no": bundle.bundle_no,
            },
          },
          {
            arrayFilters: [
              {
                "elem.batch_no": item.batch_no,
                "elem.product_name": item.product_name,
              },
            ],
            session,
          }
        );
      }
    }

    await db.collection("expiry_bundles").updateOne(
      { id: bundle.id },
      { $set: updateData },
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    await logActivity({
      pharmacy_id: req.user.pharmacy_id,
      user_id: req.user.id,
      user_name: req.user.name,
      action: "RECORD_EXPIRY_PAYMENT",
      details: `Recorded payment of ₹${payAmount} via ${payment_mode} for Expiry Bundle ${bundle.bundle_no}`,
    });

    res.json({
      message: "Payment recorded successfully",
      payment: newPayment,
      amount_paid: updateData.amount_paid,
      remaining_amount: updateData.remaining_amount,
      status: updateData.status,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    next(error);
  }
});

// DELETE /api/expiry/:id - Cancel/Delete draft expiry bundle
router.delete("/:id", auth, requireSubscription(), async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const db = mongoose.connection.db;
    const bundle = await db.collection("expiry_bundles").findOne(
      { id: req.params.id, pharmacy_id: req.user.pharmacy_id },
      { session }
    );

    if (!bundle) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ detail: "Expiry bundle not found" });
    }

    if (bundle.status === "Payment Done (Returned)") {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ detail: "Cannot delete a settled/returned bundle" });
    }

    // Reset inventory batch status back to active
    for (const item of bundle.items || []) {
      if (item.inventory_id) {
        await db.collection("inventory").updateOne(
          { id: item.inventory_id, pharmacy_id: req.user.pharmacy_id },
          {
            $unset: {
              expiry_bundle_id: "",
              expiry_bundle_no: "",
            },
            $set: {
              expiry_status: "Not Moved",
              updated_at: new Date().toISOString(),
            },
          },
          { session }
        );
      }
    }

    await db.collection("expiry_bundles").deleteOne({ id: bundle.id }, { session });

    await session.commitTransaction();
    session.endSession();

    res.json({ message: "Expiry bundle deleted and inventory batches restored" });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    next(error);
  }
});

module.exports = router;
