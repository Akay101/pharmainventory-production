const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");
const { auth } = require("../middleware/auth");
const { logActivity } = require("../utils/activityLogger");

const { requireSubscription } = require("../middleware/subscription");

const escapeRegex = (str) => {
  if (!str) return "";
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

// GET /api/products
router.get("/", auth, requireSubscription(), async (req, res, next) => {
  try {
    const db = mongoose.connection.db;
    const { search, page = 1, limit = 12, all } = req.query;

    const query = { pharmacy_id: req.user.pharmacy_id };
    if (search) {
      query.name = { $regex: escapeRegex(search), $options: "i" };
    }

    const pageNum = parseInt(page) || 1;
    const isAll = all === "true" || limit === "all";
    const limitNum = isAll ? 0 : parseInt(limit) || 12;
    const skip = isAll ? 0 : (pageNum - 1) * limitNum;

    const pipeline = [
      { $match: query },
      {
        $lookup: {
          from: "inventory",
          let: { pId: "$id", pName: "$name" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$pharmacy_id", req.user.pharmacy_id] },
                    {
                      $or: [
                        { $eq: ["$product_id", "$$pId"] },
                        { $eq: ["$product_name", "$$pName"] }
                      ]
                    }
                  ]
                }
              }
            }
          ],
          as: "batches"
        }
      },
      {
        $addFields: {
          total_batches: { $size: "$batches" },
          total_stock: { $sum: "$batches.available_quantity" }
        }
      },
      {
        $project: {
          batches: 0,
          _id: 0
        }
      },
      { $sort: { name: 1 } }
    ];

    if (!isAll) {
      pipeline.push({ $skip: skip });
      pipeline.push({ $limit: limitNum });
    }

    const products = await db
      .collection("products")
      .aggregate(pipeline)
      .toArray();

    const total = await db.collection("products").countDocuments(query);
    const effectiveLimit = isAll ? (total || 1) : limitNum;

    res.json({
      products,
      pagination: {
        page: pageNum,
        limit: effectiveLimit,
        total,
        total_pages: isAll ? 1 : (Math.ceil(total / limitNum) || 1),
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/products
router.post("/", auth, requireSubscription(), async (req, res, next) => {
  try {
    const {
      name,
      product_name,
      category = "medicine",
      dosage_form = "tablet",
      manufacturer = "",
      salt_composition = "",
      pack_type = "Strip",
      units_per_pack = 1,
      packaging_label = "",
      package_details = "",
      hsn_no = "",
      tax_rate = 5,
      cgst,
      sgst,
      mrp = 0,
      unit_mrp,
      trade_price,
      purchase_price,
      low_stock_threshold = 10,
      shortage_threshold = 10,
      rack_location = "",
      description,
      image_url,
    } = req.body;
    const db = mongoose.connection.db;

    const finalName = (name || product_name || "").trim();
    if (!finalName) {
      return res.status(400).json({ detail: "Product name is required" });
    }

    const parsedUnits = parseInt(units_per_pack) || 1;
    const parsedMrp = parseFloat(mrp) || 0;
    const parsedUnitMrp = unit_mrp !== undefined && unit_mrp !== null && unit_mrp !== ""
      ? parseFloat(unit_mrp)
      : (parsedMrp > 0 && parsedUnits > 0 ? parseFloat((parsedMrp / parsedUnits).toFixed(2)) : 0);

    const parsedTradePrice = trade_price !== undefined && trade_price !== null && trade_price !== ""
      ? parseFloat(trade_price)
      : (purchase_price !== undefined && purchase_price !== null && purchase_price !== ""
        ? parseFloat(purchase_price)
        : (parsedMrp > 0 ? parseFloat((parsedMrp * 0.7).toFixed(2)) : 0));

    const parsedTaxRate = tax_rate !== undefined && tax_rate !== null && tax_rate !== ""
      ? parseFloat(tax_rate)
      : ((parseFloat(cgst) || 0) + (parseFloat(sgst) || 0));

    const finalCgst = cgst !== undefined && cgst !== null && cgst !== ""
      ? parseFloat(cgst)
      : parsedTaxRate / 2;

    const finalSgst = sgst !== undefined && sgst !== null && sgst !== ""
      ? parseFloat(sgst)
      : parsedTaxRate / 2;

    const finalPackageDetails = (package_details || packaging_label || `${parsedUnits} ${dosage_form || "units"}`).trim();
    const finalPackagingLabel = (packaging_label || `${parsedUnits} ${dosage_form || "units"}`).trim();

    const productId = uuidv4();
    const productData = {
      id: productId,
      pharmacy_id: req.user.pharmacy_id,
      name: finalName,
      product_name: finalName,
      category: category || "medicine",
      dosage_form: dosage_form || "tablet",
      manufacturer: (manufacturer || "").trim(),
      salt_composition: (salt_composition || "").trim(),
      pack_type: pack_type || "Strip",
      units_per_pack: parsedUnits,
      packaging_label: finalPackagingLabel,
      package_details: finalPackageDetails,
      hsn_no: (hsn_no || "").trim(),
      hsn_code: (hsn_no || "").trim(),
      tax_rate: parsedTaxRate,
      cgst: finalCgst,
      sgst: finalSgst,
      mrp: parsedMrp,
      unit_mrp: parsedUnitMrp,
      trade_price: parsedTradePrice,
      purchase_price: parsedTradePrice,
      low_stock_threshold: low_stock_threshold !== undefined ? Number(low_stock_threshold) : 10,
      shortage_threshold: shortage_threshold !== undefined && shortage_threshold !== "" && shortage_threshold !== null ? Number(shortage_threshold) : 10,
      rack_location: (rack_location || "").trim(),
      description: description || null,
      image_url: image_url || null,
      source: "catalog",
      is_custom_catalog: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await db.collection("products").insertOne(productData);
    const { _id, ...product } = productData;
    await logActivity(db, req.user.pharmacy_id, req.user.id, req.user.name, "CREATE", "PRODUCTS", productId, `Added Product Catalog ${finalName}`, `/inventory`);

    res.status(201).json({ message: "Product catalog created", product });
  } catch (error) {
    next(error);
  }
});

// PUT /api/products/:product_id
router.put(
  "/:product_id",
  auth,
  requireSubscription(),
  async (req, res, next) => {
    try {
      const {
        name,
        product_name,
        category,
        dosage_form,
        manufacturer,
        salt_composition,
        pack_type,
        units_per_pack,
        packaging_label,
        package_details,
        hsn_no,
        tax_rate,
        cgst,
        sgst,
        mrp,
        unit_mrp,
        trade_price,
        purchase_price,
        low_stock_threshold,
        shortage_threshold,
        rack_location,
        description,
        image_url,
      } = req.body;
      const db = mongoose.connection.db;

      const finalName = (name || product_name || "").trim();
      const updateDoc = {
        updated_at: new Date().toISOString(),
      };

      if (finalName) {
        updateDoc.name = finalName;
        updateDoc.product_name = finalName;
      }
      if (category !== undefined) updateDoc.category = category;
      if (dosage_form !== undefined) updateDoc.dosage_form = dosage_form;
      if (manufacturer !== undefined) updateDoc.manufacturer = manufacturer.trim();
      if (salt_composition !== undefined) updateDoc.salt_composition = salt_composition.trim();
      if (pack_type !== undefined) updateDoc.pack_type = pack_type;
      if (units_per_pack !== undefined) updateDoc.units_per_pack = parseInt(units_per_pack) || 1;
      if (packaging_label !== undefined) updateDoc.packaging_label = packaging_label.trim();
      if (package_details !== undefined) updateDoc.package_details = package_details.trim();
      if (hsn_no !== undefined) {
        updateDoc.hsn_no = hsn_no.trim();
        updateDoc.hsn_code = hsn_no.trim();
      }
      if (tax_rate !== undefined) updateDoc.tax_rate = parseFloat(tax_rate) || 0;
      if (cgst !== undefined) updateDoc.cgst = parseFloat(cgst) || 0;
      if (sgst !== undefined) updateDoc.sgst = parseFloat(sgst) || 0;
      if (mrp !== undefined) updateDoc.mrp = parseFloat(mrp) || 0;
      if (unit_mrp !== undefined) updateDoc.unit_mrp = parseFloat(unit_mrp) || 0;
      if (trade_price !== undefined) updateDoc.trade_price = parseFloat(trade_price) || 0;
      if (purchase_price !== undefined) updateDoc.purchase_price = parseFloat(purchase_price) || 0;
      if (low_stock_threshold !== undefined) updateDoc.low_stock_threshold = Number(low_stock_threshold);
      if (shortage_threshold !== undefined) updateDoc.shortage_threshold = shortage_threshold !== "" && shortage_threshold !== null ? Number(shortage_threshold) : null;
      if (rack_location !== undefined) updateDoc.rack_location = (rack_location || "").trim();
      if (description !== undefined) updateDoc.description = description;
      if (image_url !== undefined) updateDoc.image_url = image_url;

      const result = await db
        .collection("products")
        .updateOne(
          { id: req.params.product_id, pharmacy_id: req.user.pharmacy_id },
          { $set: updateDoc }
        );

      if (result.matchedCount === 0) {
        return res.status(404).json({ detail: "Product not found" });
      }

      await logActivity(db, req.user.pharmacy_id, req.user.id, req.user.name, "UPDATE", "PRODUCTS", req.params.product_id, `Updated Product ${finalName || req.params.product_id}`, `/inventory`);

      const product = await db
        .collection("products")
        .findOne({ id: req.params.product_id }, { projection: { _id: 0 } });

      res.json({ message: "Product updated", product });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/products/bulk-delete
router.post(
  "/bulk-delete",
  auth,
  requireSubscription(),
  async (req, res, next) => {
    try {
      const db = mongoose.connection.db;
      const { product_ids = [], delete_inventory = false } = req.body;

      if (!Array.isArray(product_ids) || product_ids.length === 0) {
        return res.status(400).json({ detail: "No product IDs provided" });
      }

      const allIds = [];
      const names = [];
      for (const id of product_ids) {
        allIds.push(String(id));
        if (!isNaN(Number(id))) {
          allIds.push(Number(id));
        }
        if (typeof id === "string" && isNaN(Number(id))) {
          names.push(id);
        }
      }

      const products = await db.collection("products").find({
        pharmacy_id: req.user.pharmacy_id,
        $or: [
          { id: { $in: allIds } },
          { product_id: { $in: allIds } },
          ...(names.length > 0 ? [{ name: { $in: names.map(n => new RegExp("^" + escapeRegex(n) + "$", "i")) } }] : [])
        ]
      }).toArray();

      for (const p of products) {
        if (p.id) allIds.push(p.id);
        if (p.product_id) allIds.push(p.product_id);
        if (p.name) names.push(p.name);
      }

      let deletedInventoryItemsCount = 0;
      if (delete_inventory) {
        const invOr = [{ product_id: { $in: allIds } }];
        if (names.length > 0) {
          invOr.push({
            product_name: { $in: names.map(n => new RegExp("^" + escapeRegex(n) + "$", "i")) }
          });
        }
        const invResult = await db.collection("inventory").deleteMany({
          pharmacy_id: req.user.pharmacy_id,
          $or: invOr
        });
        deletedInventoryItemsCount = invResult.deletedCount;
      }

      const prodOr = [
        { id: { $in: allIds } },
        { product_id: { $in: allIds } }
      ];
      if (names.length > 0) {
        prodOr.push({
          name: { $in: names.map(n => new RegExp("^" + escapeRegex(n) + "$", "i")) }
        });
      }

      const prodResult = await db.collection("products").deleteMany({
        pharmacy_id: req.user.pharmacy_id,
        $or: prodOr
      });

      await logActivity(
        db,
        req.user.pharmacy_id,
        req.user.id,
        req.user.name,
        "DELETE",
        "PRODUCTS",
        "bulk",
        `Bulk deleted ${prodResult.deletedCount} catalog products`,
        "/inventory"
      );

      res.json({
        message: `Successfully deleted ${prodResult.deletedCount} catalog product(s)`,
        deleted_products: prodResult.deletedCount,
        deleted_inventory_items: deletedInventoryItemsCount
      });
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /api/products/:product_id
router.delete(
  "/:product_id",
  auth,
  requireSubscription(),
  async (req, res, next) => {
    try {
      const db = mongoose.connection.db;
      const rawId = req.params.product_id;
      const productName = (req.query.product_name || req.query.name || "").trim();
      const deleteInventory = req.query.delete_inventory === "true";

      const numId = !isNaN(Number(rawId)) ? Number(rawId) : null;
      const orConditions = [];

      if (rawId && rawId !== "undefined" && rawId !== "null") {
        orConditions.push({ id: rawId });
        orConditions.push({ product_id: rawId });
      }
      if (numId !== null) {
        orConditions.push({ id: numId });
        orConditions.push({ product_id: numId });
      }
      if (productName) {
        orConditions.push({
          name: { $regex: new RegExp("^" + escapeRegex(productName) + "$", "i") }
        });
        orConditions.push({
          product_name: { $regex: new RegExp("^" + escapeRegex(productName) + "$", "i") }
        });
      }
      if (rawId && isNaN(Number(rawId)) && rawId.length < 100) {
        orConditions.push({
          name: { $regex: new RegExp("^" + escapeRegex(rawId) + "$", "i") }
        });
        orConditions.push({
          product_name: { $regex: new RegExp("^" + escapeRegex(rawId) + "$", "i") }
        });
      }

      let product = null;
      if (orConditions.length > 0) {
        product = await db.collection("products").findOne({
          pharmacy_id: req.user.pharmacy_id,
          $or: orConditions
        });
      }

      const allIds = new Set();
      if (rawId && rawId !== "undefined" && rawId !== "null") allIds.add(rawId);
      if (numId !== null) allIds.add(numId);
      if (product?.id) allIds.add(product.id);
      if (product?.product_id) allIds.add(product.product_id);
      const idList = Array.from(allIds);

      const resolvedName = product?.name || product?.product_name || productName || (rawId !== "undefined" ? rawId : "Product");

      // Delete associated inventory items if requested
      let deletedInventoryItemsCount = 0;
      if (deleteInventory) {
        const invOr = [];
        if (idList.length > 0) {
          invOr.push({ product_id: { $in: idList } });
        }
        if (resolvedName) {
          invOr.push({ product_name: { $regex: new RegExp("^" + escapeRegex(resolvedName) + "$", "i") } });
        }
        if (invOr.length > 0) {
          const inventoryResult = await db.collection("inventory").deleteMany({
            pharmacy_id: req.user.pharmacy_id,
            $or: invOr
          });
          deletedInventoryItemsCount = inventoryResult.deletedCount;
        }
      }

      // Delete the product itself from products collection
      let deletedProductCount = 0;
      const prodDeleteOr = [];
      if (idList.length > 0) {
        prodDeleteOr.push({ id: { $in: idList } });
        prodDeleteOr.push({ product_id: { $in: idList } });
      }
      if (resolvedName) {
        prodDeleteOr.push({ name: { $regex: new RegExp("^" + escapeRegex(resolvedName) + "$", "i") } });
        prodDeleteOr.push({ product_name: { $regex: new RegExp("^" + escapeRegex(resolvedName) + "$", "i") } });
      }
      if (prodDeleteOr.length > 0) {
        const prodResult = await db.collection("products").deleteMany({
          pharmacy_id: req.user.pharmacy_id,
          $or: prodDeleteOr
        });
        deletedProductCount = prodResult.deletedCount;
      }

      if (deletedProductCount === 0 && deletedInventoryItemsCount === 0) {
        return res.status(404).json({ detail: "Product or catalog item not found" });
      }

      await logActivity(
        db,
        req.user.pharmacy_id,
        req.user.id,
        req.user.name,
        "DELETE",
        "PRODUCTS",
        String(rawId),
        `Deleted Catalog Product ${resolvedName}`,
        "/inventory"
      );

      res.json({
        message: `Catalog product "${resolvedName}" deleted successfully`,
        deleted_inventory_items: deletedInventoryItemsCount,
        deleted_products: deletedProductCount
      });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
