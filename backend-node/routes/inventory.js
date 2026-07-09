const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");
const { auth } = require("../middleware/auth");
const { requireSubscription } = require("../middleware/subscription");
const { logActivity } = require("../utils/activityLogger");

// GET /api/inventory
router.get("/", auth, requireSubscription(), async (req, res, next) => {
  try {
    const db = mongoose.connection.db;
    const {
      search,
      low_stock,
      expiring_soon,
      page = 1,
      limit = 50,
      sort_by = "created_at",
      sort_order = "desc",
      highlight_id,
      product_id,
    } = req.query;

    const query = {
      pharmacy_id: req.user.pharmacy_id,
    };
    if (product_id) {
      query.product_id = product_id;
    }
    if (search) {
      query.$or = [
        { product_name: { $regex: search, $options: "i" } },
        { batch_no: { $regex: search, $options: "i" } },
        { salt_composition: { $regex: search, $options: "i" } },
      ];
    }

    // Filter low stock (database query filter based on threshold comparison)
    if (low_stock === "true") {
      const stockSummary = await db.collection("inventory").aggregate([
        { $match: { pharmacy_id: req.user.pharmacy_id } },
        {
          $group: {
            _id: "$product_id",
            total_stock: { $sum: "$available_quantity" }
          }
        }
      ]).toArray();

      const products = await db
        .collection("products")
        .find({ pharmacy_id: req.user.pharmacy_id })
        .toArray();

      const thresholds = {};
      products.forEach((p) => (thresholds[p.id] = p.low_stock_threshold || 10));

      const lowStockProductIds = stockSummary
        .filter((s) => s.total_stock <= (thresholds[s._id] || 10))
        .map((s) => s._id);

      query.product_id = { $in: lowStockProductIds };
    }

    // Filter expiring soon
    if (expiring_soon === "true") {
      const cutoff = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0];
      query.expiry_date = { $lte: cutoff };
    }

    const sortDir = sort_order === "asc" ? 1 : -1;
    const parsedLimit = parseInt(limit);
    let pageNum = parseInt(page);
    let total = 0;

    if (highlight_id) {
      // Find all IDs in sort order to calculate index for highlighting
      const allMatching = await db.collection("inventory")
        .find(query, { projection: { id: 1 } })
        .sort({ [sort_by]: sortDir })
        .toArray();

      total = allMatching.length;
      const targetIndex = allMatching.findIndex((i) => i.id === highlight_id);
      if (targetIndex !== -1) {
        pageNum = Math.floor(targetIndex / parsedLimit) + 1;
      }
    } else {
      total = await db.collection("inventory").countDocuments(query);
    }

    const skip = (pageNum - 1) * parsedLimit;
    const inventory = await db.collection("inventory")
      .aggregate([
        { $match: query },
        {
          $lookup: {
            from: "suppliers",
            localField: "supplier_id",
            foreignField: "id",
            as: "supplier_info"
          }
        },
        {
          $unwind: {
            path: "$supplier_info",
            preserveNullAndEmptyArrays: true
          }
        },
        {
          $addFields: {
            supplier_name: "$supplier_info.name"
          }
        },
        {
          $project: {
            supplier_info: 0,
            _id: 0
          }
        },
        { $sort: { [sort_by]: sortDir } },
        { $skip: skip },
        { $limit: parsedLimit }
      ])
      .toArray();

    res.json({
      inventory,
      pagination: {
        page: pageNum,
        limit: parsedLimit,
        total,
        total_pages: Math.ceil(total / parsedLimit) || 1,
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/inventory/search
router.get("/search", auth, requireSubscription(), async (req, res, next) => {
  try {
    const { q, page = 1, limit = 15 } = req.query;
    const db = mongoose.connection.db;

    if (!q || q.length < 1) {
      return res.status(400).json({ detail: "Search query required" });
    }

    const parsedLimit = parseInt(limit);
    const parsedPage = parseInt(page);

    const query = {
      pharmacy_id: req.user.pharmacy_id,
      $or: [
        { product_name: { $regex: q, $options: "i" } },
        { batch_no: { $regex: q, $options: "i" } },
        { salt_composition: { $regex: q, $options: "i" } },
      ],
    };

    // To get the total count for pagination, group by product name first
    const allGrouped = await db.collection("inventory").aggregate([
      { $match: query },
      {
        $group: {
          _id: "$product_name"
        }
      }
    ]).toArray();

    const total = allGrouped.length;

    let inventory = await db
      .collection("inventory")
      .aggregate([
        { $match: query },
        // Lookup supplier for EACH inventory batch BEFORE grouping
        {
          $lookup: {
            from: "suppliers",
            localField: "supplier_id",
            foreignField: "id",
            as: "batch_supplier"
          }
        },
        {
          $unwind: {
            path: "$batch_supplier",
            preserveNullAndEmptyArrays: true
          }
        },
        {
          $group: {
            _id: "$product_name",
            id: { $first: "$id" },
            product_id: { $first: "$product_id" },
            product_name: { $first: "$product_name" },
            manufacturer: { $first: "$manufacturer" },
            salt_composition: { $first: "$salt_composition" },
            hsn_no: { $first: "$hsn_no" },
            available_quantity: { $sum: "$available_quantity" },
            quantity: { $sum: "$quantity" },
            units_per_pack: { $first: "$units_per_pack" },
            purchase_price: { $first: "$purchase_price" },
            mrp: { $first: "$mrp" },
            created_at: { $max: "$created_at" },
            supplier_id: { $first: "$supplier_id" },
            cgst: { $first: "$cgst" },
            sgst: { $first: "$sgst" },
            batches: {
              $push: {
                id: "$id",
                batch_no: "$batch_no",
                expiry_date: "$expiry_date",
                available_quantity: "$available_quantity",
                quantity: "$quantity",
                purchase_price: "$purchase_price",
                mrp: "$mrp",
                cgst: "$cgst",
                sgst: "$sgst",
                supplier_name: "$batch_supplier.name"
              }
            }
          }
        },
        // ✅ Lookup product-level supplier for compatibility
        {
          $lookup: {
            from: "suppliers",
            localField: "supplier_id",
            foreignField: "id",
            as: "supplier",
          },
        },
        {
          $unwind: {
            path: "$supplier",
            preserveNullAndEmptyArrays: true,
          },
        },
        // ✅ Keep ALL original fields + add supplier_name
        {
          $addFields: {
            supplier_name: "$supplier.name",
          },
        },
        {
          $project: {
            supplier: 0,
            _id: 0,
          },
        },
      ])
      .toArray();

    // 🔎 Keep your ranking logic unchanged
    const searchLower = q.toLowerCase();
    inventory.sort((a, b) => {
      const aName = (a.product_name || "").toLowerCase();
      const bName = (b.product_name || "").toLowerCase();
      const aSalt = (a.salt_composition || "").toLowerCase();
      const bSalt = (b.salt_composition || "").toLowerCase();

      if (aName === searchLower) return -1;
      if (bName === searchLower) return 1;

      if (aName.startsWith(searchLower) && !bName.startsWith(searchLower))
        return -1;
      if (!aName.startsWith(searchLower) && bName.startsWith(searchLower))
        return 1;

      if (aSalt.startsWith(searchLower) && !bSalt.startsWith(searchLower))
        return -1;
      if (!aSalt.startsWith(searchLower) && bSalt.startsWith(searchLower))
        return 1;

      return 0;
    });

    const paginatedInventory = inventory.slice((parsedPage - 1) * parsedLimit, parsedPage * parsedLimit);

    res.json({
      inventory: paginatedInventory,
      count: total,
      pagination: {
        page: parsedPage,
        limit: parsedLimit,
        total: total,
        total_pages: Math.ceil(total / parsedLimit) || 1
      }
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/inventory/alerts
router.get("/alerts", auth, requireSubscription(), async (req, res, next) => {
  try {
    const db = mongoose.connection.db;

    const inventory = await db
      .collection("inventory")
      .find(
        { pharmacy_id: req.user.pharmacy_id },
        { projection: { _id: 0 } }
      )
      .toArray();

    const products = await db
      .collection("products")
      .find({ pharmacy_id: req.user.pharmacy_id }, { projection: { _id: 0 } })
      .toArray();

    const thresholds = {};
    products.forEach((p) => (thresholds[p.id] = p.low_stock_threshold || 10));

    // Aggregate stock by product
    const productStock = {};
    inventory.forEach((item) => {
      const pid = item.product_id || item.product_name;
      if (!productStock[pid]) {
        productStock[pid] = { name: item.product_name, total: 0, items: [] };
      }
      productStock[pid].total += item.available_quantity;
      productStock[pid].items.push(item);
    });

    // Low stock items
    const lowStock = Object.values(productStock)
      .filter((p) => p.total <= (thresholds[p.id] || 10))
      .map((p) => ({
        product_name: p.name,
        available_quantity: p.total,
        threshold: thresholds[p.id] || 10,
      }));

    // Expiring soon (90 days)
    const cutoff = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];
    const expiringSoon = inventory
      .filter((i) => i.expiry_date && i.expiry_date <= cutoff)
      .map((i) => ({
        product_name: i.product_name,
        batch_no: i.batch_no,
        expiry_date: i.expiry_date,
        available_quantity: i.available_quantity,
      }));

    // Expired items
    const today = new Date().toISOString().split("T")[0];
    const expired = inventory
      .filter((i) => i.expiry_date && i.expiry_date < today)
      .map((i) => ({
        product_name: i.product_name,
        batch_no: i.batch_no,
        expiry_date: i.expiry_date,
        available_quantity: i.available_quantity,
      }));

    res.json({
      low_stock_alerts: lowStock,
      expiry_alerts: expiringSoon,
      expired,
    });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/inventory/:id/add-quantity
router.patch("/:id/add-quantity", auth, requireSubscription(), async (req, res, next) => {
  try {
    const db = mongoose.connection.db;
    const { add_quantity } = req.body;
    
    if (!add_quantity || isNaN(add_quantity) || Number(add_quantity) <= 0) {
      return res.status(400).json({ detail: "Please provide a valid quantity to add (> 0)" });
    }

    const { id } = req.params;
    const item = await db.collection("inventory").findOne({ id, pharmacy_id: req.user.pharmacy_id });
    
    if (!item) {
      return res.status(404).json({ detail: "Inventory item not found" });
    }

    await db.collection("inventory").updateOne(
      { id, pharmacy_id: req.user.pharmacy_id },
      { 
        $inc: { available_quantity: Number(add_quantity) },
        $set: { updated_at: new Date().toISOString() }
      }
    );

    await logActivity(db, req.user.pharmacy_id, req.user.id, req.user.name, "UPDATE", "INVENTORY", id, `Increased stock of ${item.product_name} by ${add_quantity} units`, `/inventory`);

    res.json({ message: "Stock updated successfully" });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/inventory/:id
router.delete("/:id", auth, requireSubscription(), async (req, res, next) => {
  try {
    const db = mongoose.connection.db;
    const { id } = req.params;

    const item = await db.collection("inventory").findOne({ id, pharmacy_id: req.user.pharmacy_id });
    if (!item) {
      return res.status(404).json({ detail: "Inventory item not found" });
    }

    const result = await db.collection("inventory").deleteOne({
      id,
      pharmacy_id: req.user.pharmacy_id,
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ detail: "Inventory item not found" });
    }

    await logActivity(
      db,
      req.user.pharmacy_id,
      req.user.id,
      req.user.name,
      "DELETE",
      "INVENTORY",
      id,
      `Deleted inventory item of ${item.product_name} (Batch: ${item.batch_no})`,
      "/inventory"
    );

    res.json({ message: "Inventory item deleted successfully" });
  } catch (error) {
    next(error);
  }
});

// POST /api/inventory/merge
router.post("/merge", auth, requireSubscription(), async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const db = mongoose.connection.db;
    const {
      inventory_ids,
      merged_name,
      merged_manufacturer,
      merged_salt,
      merged_hsn
    } = req.body;

    if (!inventory_ids || !Array.isArray(inventory_ids) || inventory_ids.length < 2) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ detail: "At least two inventory items must be selected to merge" });
    }

    if (!merged_name || !merged_name.trim()) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ detail: "Merged product name is required" });
    }

    const cleanMergedName = merged_name.trim();

    // 1. Fetch the target inventory documents
    const items = await db.collection("inventory").find({
      pharmacy_id: req.user.pharmacy_id,
      id: { $in: inventory_ids }
    }, { session }).toArray();

    if (items.length !== inventory_ids.length) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ detail: "One or more selected inventory items were not found" });
    }

    // Capture the list of old product names and product IDs to update history
    const oldProductNames = [...new Set(items.map(item => item.product_name))];
    const oldProductIds = [...new Set(items.map(item => item.product_id).filter(id => id))];

    // 2. Find or create the unified product in the products catalog
    let matchedProduct = await db.collection("products").findOne({
      pharmacy_id: req.user.pharmacy_id,
      name: { $regex: new RegExp("^" + cleanMergedName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + "$", "i") }
    }, { session });

    let unifiedProductId;
    if (matchedProduct) {
      unifiedProductId = matchedProduct.id;
    } else {
      unifiedProductId = uuidv4();
      await db.collection("products").insertOne({
        id: unifiedProductId,
        pharmacy_id: req.user.pharmacy_id,
        name: cleanMergedName,
        low_stock_threshold: 10,
        created_at: new Date().toISOString()
      }, { session });
    }

    // 3. Check for batch conflicts (multiple inventory records with the same batch number)
    const batchesMap = {};
    items.forEach(item => {
      if (!batchesMap[item.batch_no]) {
        batchesMap[item.batch_no] = [];
      }
      batchesMap[item.batch_no].push(item);
    });

    const deletedToPrimary = {};
    const inventoryIdsToKeep = [];

    for (const batchNo of Object.keys(batchesMap)) {
      const batchItems = batchesMap[batchNo];
      if (batchItems.length > 1) {
        // Duplicate records for the same batch number - consolidate them!
        const primary = batchItems[0];
        inventoryIdsToKeep.push(primary.id);

        let totalQty = primary.quantity || 0;
        let totalAvailable = primary.available_quantity || 0;

        for (let i = 1; i < batchItems.length; i++) {
          const duplicate = batchItems[i];
          totalQty += (duplicate.quantity || 0);
          totalAvailable += (duplicate.available_quantity || 0);
          deletedToPrimary[duplicate.id] = primary.id;

          // Delete duplicate inventory item
          await db.collection("inventory").deleteOne({ id: duplicate.id }, { session });
        }

        // Update primary batch quantities
        await db.collection("inventory").updateOne(
          { id: primary.id },
          {
            $set: {
              quantity: totalQty,
              available_quantity: totalAvailable
            }
          },
          { session }
        );
      } else {
        inventoryIdsToKeep.push(batchItems[0].id);
      }
    }

    // 4. Update remaining inventory batches to use the unified product details
    await db.collection("inventory").updateMany(
      {
        pharmacy_id: req.user.pharmacy_id,
        id: { $in: inventoryIdsToKeep }
      },
      {
        $set: {
          product_id: unifiedProductId,
          product_name: cleanMergedName,
          manufacturer: merged_manufacturer || null,
          salt_composition: merged_salt || null,
          hsn_no: merged_hsn || null
        }
      },
      { session }
    );

    // 5. Update historical purchases
    if (oldProductNames.length > 0 || oldProductIds.length > 0) {
      const purchaseQuery = {
        pharmacy_id: req.user.pharmacy_id,
        $or: []
      };
      if (oldProductNames.length > 0) {
        purchaseQuery.$or.push({ "items.product_name": { $in: oldProductNames } });
      }
      if (oldProductIds.length > 0) {
        purchaseQuery.$or.push({ "items.product_id": { $in: oldProductIds } });
      }

      const matchingPurchases = await db.collection("purchases").find(purchaseQuery, { session }).toArray();

      for (const purchase of matchingPurchases) {
        const updatedItems = purchase.items.map(item => {
          const nameMatches = oldProductNames.includes(item.product_name);
          const idMatches = item.product_id && oldProductIds.includes(item.product_id);

          if (nameMatches || idMatches) {
            return {
              ...item,
              product_id: unifiedProductId,
              product_name: cleanMergedName,
              manufacturer: merged_manufacturer || item.manufacturer,
              salt_composition: merged_salt || item.salt_composition,
              hsn_no: merged_hsn || item.hsn_no
            };
          }
          return item;
        });

        await db.collection("purchases").updateOne(
          { id: purchase.id },
          { $set: { items: updatedItems } },
          { session }
        );
      }
    }

    // 6. Update historical bills
    const billQuery = {
      pharmacy_id: req.user.pharmacy_id,
      $or: [
        { "items.product_name": { $in: oldProductNames } },
        { "items.inventory_id": { $in: inventory_ids } }
      ]
    };

    const matchingBills = await db.collection("bills").find(billQuery, { session }).toArray();

    for (const bill of matchingBills) {
      const updatedItems = bill.items.map(item => {
        const nameMatches = oldProductNames.includes(item.product_name);
        const invIdMatches = item.inventory_id && inventory_ids.includes(item.inventory_id);

        if (nameMatches || invIdMatches) {
          let targetInvId = item.inventory_id;
          if (targetInvId && deletedToPrimary[targetInvId]) {
            targetInvId = deletedToPrimary[targetInvId];
          }

          return {
            ...item,
            inventory_id: targetInvId,
            product_name: cleanMergedName,
            salt_composition: merged_salt || item.salt_composition
          };
        }
        return item;
      });

      await db.collection("bills").updateOne(
        { id: bill.id },
        { $set: { items: updatedItems } },
        { session }
      );
    }

    // 7. Clean up old catalog products
    const productsToDelete = oldProductIds.filter(id => id !== unifiedProductId);
    if (productsToDelete.length > 0) {
      await db.collection("products").deleteMany({
        pharmacy_id: req.user.pharmacy_id,
        id: { $in: productsToDelete }
      }, { session });
    }

    await logActivity(
      db,
      req.user.pharmacy_id,
      req.user.id,
      req.user.name,
      "UPDATE",
      "INVENTORY",
      unifiedProductId,
      `Merged ${items.length} inventory batches into product: ${cleanMergedName}`,
      "/inventory",
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    res.json({
      message: "Inventory items merged successfully",
      unified_product_id: unifiedProductId,
      merged_batches_count: inventoryIdsToKeep.length,
      consolidated_batches: Object.keys(deletedToPrimary).length
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    next(error);
  }
});

module.exports = router;
