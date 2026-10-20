const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");
const { auth } = require("../middleware/auth");
const { requireSubscription } = require("../middleware/subscription");
const { logActivity } = require("../utils/activityLogger");
const { getCached, setCached, getGlobalMedicinesCollection } = require("../utils/globalDb");

// Medicine normalization for deduplicating inventory vs global products
const normalizeMedKey = (str) => {
  if (!str) return "";
  return String(str)
    .toLowerCase()
    .replace(/\b(tablet|tablets|tab|capsule|capsules|cap|syrup|syr|suspension|susp|injection|inj|drops|drop|ointment|gel|cream)\b/g, "")
    .replace(/(\d+)\s*(mg|ml|gm|g|mcg|iu)\b/g, "$1")
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
};

const escapeRegex = (str) => {
  if (!str) return "";
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

// GET /api/inventory
router.get("/", auth, requireSubscription(), async (req, res, next) => {
  try {
    const db = mongoose.connection.db;
    const {
      search,
      low_stock,
      shortage,
      expiring_soon,
      expired,
      grouped,
      page = 1,
      limit = 50,
      sort_by = "created_at",
      sort_order = "desc",
      highlight_id,
      product_id,
    } = req.query;

    const todayStr = new Date().toISOString().split("T")[0];

    const query = {
      pharmacy_id: req.user.pharmacy_id,
    };
    if (product_id) {
      query.product_id = product_id;
    }
    if (search) {
      const escapedSearch = escapeRegex(search);
      query.$or = [
        { product_name: { $regex: escapedSearch, $options: "i" } },
        { batch_no: { $regex: escapedSearch, $options: "i" } },
        { salt_composition: { $regex: escapedSearch, $options: "i" } },
      ];
    }

    // Fetch user settings for global shortage threshold
    const userSettings = await db
      .collection("user_settings")
      .findOne({ user_id: req.user.id });
    const globalThreshold =
      userSettings?.preferences?.shortage_threshold !== undefined
        ? Number(userSettings.preferences.shortage_threshold)
        : 10;

    // Fetch all active inventory to calculate shortage per item
    const allInventoryForShortage = await db
      .collection("inventory")
      .find({ pharmacy_id: req.user.pharmacy_id })
      .toArray();
    const shortageInventoryIds = [];
    allInventoryForShortage.forEach((item) => {
      const thresh =
        item.shortage_threshold !== undefined &&
        item.shortage_threshold !== null
          ? Number(item.shortage_threshold)
          : globalThreshold;
      if (item.available_quantity <= thresh) {
        shortageInventoryIds.push(item.id);
      }
    });

    const shortageCount = shortageInventoryIds.length;

    // Filter low stock (database query filter based on threshold comparison)
    if (low_stock === "true") {
      const stockSummary = await db
        .collection("inventory")
        .aggregate([
          { $match: { pharmacy_id: req.user.pharmacy_id } },
          {
            $group: {
              _id: "$product_id",
              total_stock: { $sum: "$available_quantity" },
            },
          },
        ])
        .toArray();

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

    // Filter shortage
    if (shortage === "true") {
      query.id = { $in: shortageInventoryIds };
    }

    // Filter expiring soon
    if (expiring_soon === "true") {
      const cutoff = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0];
      query.expiry_date = { $lte: cutoff };
    }

    // Filter expired
    if (expired === "true") {
      query.expiry_date = { $lt: todayStr };
    }

    const sortDir = sort_order === "asc" ? 1 : -1;
    const parsedLimit = parseInt(limit);
    let pageNum = parseInt(page);
    let total = 0;

    if (grouped === "true") {
      // Aggregate by product_name to produce product-grouped rows
      const pipeline = [
        { $match: query },
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
          $addFields: {
            supplier_name: "$supplier_info.name",
          },
        },
        {
          $group: {
            _id: "$product_name",
            product_name: { $first: "$product_name" },
            product_id: { $first: "$product_id" },
            manufacturer: { $first: "$manufacturer" },
            salt_composition: { $first: "$salt_composition" },
            hsn_no: { $first: "$hsn_no" },
            pack_type: { $first: "$pack_type" },
            units_per_pack: { $first: "$units_per_pack" },
            purchase_price: { $first: "$purchase_price" },
            mrp: { $first: "$mrp" },
            total_available_stock: { $sum: "$available_quantity" },
            total_stock_value: {
              $sum: { $multiply: ["$available_quantity", "$purchase_price"] },
            },
            earliest_expiry: { $min: "$expiry_date" },
            latest_created: { $max: "$created_at" },
            shortage_threshold: { $first: "$shortage_threshold" },
            batch_count: { $sum: 1 },
            batches: {
              $push: {
                id: "$id",
                batch_no: "$batch_no",
                expiry_date: "$expiry_date",
                available_quantity: "$available_quantity",
                pack_type: "$pack_type",
                units_per_pack: "$units_per_pack",
                purchase_price: "$purchase_price",
                mrp: "$mrp",
                shortage_threshold: "$shortage_threshold",
                supplier_name: "$supplier_name",
                expiry_status: "$expiry_status",
                return_status: "$return_status",
                expiry_bundle_id: "$expiry_bundle_id",
                return_bundle_id: "$return_bundle_id",
                expiry_bundle_no: "$expiry_bundle_no",
                return_bundle_no: "$return_bundle_no",
                status: "$status",
                created_at: "$created_at",
              },
            },
          },
        },
        {
          $sort: {
            [sort_by === "created_at" ? "latest_created" : sort_by]: sortDir,
          },
        },
      ];

      const allGrouped = await db
        .collection("inventory")
        .aggregate(pipeline)
        .toArray();

      // Merge products from products catalog that don't have inventory batches yet
      const existingProductNames = new Set(
        allGrouped.map((g) => (g.product_name || g._id || "").toLowerCase())
      );
      const productQuery = { pharmacy_id: req.user.pharmacy_id };
      if (search) {
        productQuery.$or = [
          { name: { $regex: escapeRegex(search), $options: "i" } },
          { product_name: { $regex: escapeRegex(search), $options: "i" } },
          { salt_composition: { $regex: escapeRegex(search), $options: "i" } },
        ];
      }
      const allCatalog = await db
        .collection("products")
        .find(productQuery)
        .toArray();

      for (const cp of allCatalog) {
        const pName = (cp.name || cp.product_name || "").trim();
        if (!pName || existingProductNames.has(pName.toLowerCase())) continue;
        existingProductNames.add(pName.toLowerCase());

        allGrouped.push({
          _id: pName,
          product_name: pName,
          product_id: cp.id,
          manufacturer: cp.manufacturer || "",
          salt_composition: cp.salt_composition || "",
          hsn_no: cp.hsn_no || "",
          pack_type: cp.pack_type || "Strip",
          units_per_pack: cp.units_per_pack || 1,
          purchase_price: cp.trade_price || cp.purchase_price || 0,
          mrp: cp.mrp || 0,
          total_available_stock: 0,
          total_stock_value: 0,
          earliest_expiry: null,
          latest_created: cp.created_at || new Date().toISOString(),
          shortage_threshold: cp.shortage_threshold || 10,
          batch_count: 0,
          batches: [],
          is_catalog_only: true,
        });
      }

      total = allGrouped.length;
      const skip = (pageNum - 1) * parsedLimit;
      const paginatedGrouped =
        parsedLimit > 0
          ? allGrouped.slice(skip, skip + parsedLimit)
          : allGrouped;

      const sanitizedGrouped = paginatedGrouped.map((item) => ({
        ...item,
        purchase_price:
          item.purchase_price !== undefined && item.purchase_price !== null
            ? Math.round(Number(item.purchase_price) * 100) / 100
            : item.purchase_price,
        mrp:
          item.mrp !== undefined && item.mrp !== null
            ? Math.round(Number(item.mrp) * 100) / 100
            : item.mrp,
        batches: Array.isArray(item.batches)
          ? item.batches.map((b) => ({
              ...b,
              purchase_price:
                b.purchase_price !== undefined && b.purchase_price !== null
                  ? Math.round(Number(b.purchase_price) * 100) / 100
                  : b.purchase_price,
              mrp:
                b.mrp !== undefined && b.mrp !== null
                  ? Math.round(Number(b.mrp) * 100) / 100
                  : b.mrp,
            }))
          : item.batches,
      }));

      return res.json({
        inventory: sanitizedGrouped,
        shortage_count: shortageCount,
        pagination: {
          page: pageNum,
          limit: parsedLimit,
          total,
          total_pages: Math.ceil(total / parsedLimit) || 1,
        },
      });
    }

    if (highlight_id) {
      // Find all IDs in sort order to calculate index for highlighting
      const allMatching = await db
        .collection("inventory")
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
    const inventory = await db
      .collection("inventory")
      .aggregate([
        { $match: query },
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
          $addFields: {
            supplier_name: "$supplier_info.name",
          },
        },
        {
          $project: {
            supplier_info: 0,
            _id: 0,
          },
        },
        { $sort: { [sort_by]: sortDir } },
        { $skip: skip },
        { $limit: parsedLimit },
      ])
      .toArray();

    const sanitizedInventory = inventory.map((b) => ({
      ...b,
      purchase_price:
        b.purchase_price !== undefined && b.purchase_price !== null
          ? Math.round(Number(b.purchase_price) * 100) / 100
          : b.purchase_price,
      mrp:
        b.mrp !== undefined && b.mrp !== null
          ? Math.round(Number(b.mrp) * 100) / 100
          : b.mrp,
    }));

    res.json({
      inventory: sanitizedInventory,
      shortage_count: shortageCount,
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

// GET /api/inventory/product-batches - Fetch all inventory batches for a specific product
router.get(
  "/product-batches",
  auth,
  requireSubscription(),
  async (req, res, next) => {
    try {
      const db = mongoose.connection.db;
      const { product_name, product_id } = req.query;

      if (!product_name && !product_id) {
        return res.status(400).json({ detail: "product_name or product_id is required" });
      }

      const orConditions = [];
      if (product_id) {
        orConditions.push({ product_id });
      }
      if (product_name) {
        const normalizedInput = (product_name || "").trim().toLowerCase();
        const escaped = normalizedInput.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
        orConditions.push(
          { product_name: { $regex: new RegExp("^" + escaped + "$", "i") } },
          { product_name: { $regex: escaped, $options: "i" } }
        );
      }

      const batches = await db
        .collection("inventory")
        .aggregate([
          {
            $match: {
              pharmacy_id: req.user.pharmacy_id,
              $or: orConditions,
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
            $addFields: {
              supplier_name: "$supplier_info.name",
            },
          },
          {
            $project: {
              supplier_info: 0,
              _id: 0,
            },
          },
          { $sort: { expiry_date: 1, created_at: -1 } },
        ])
        .toArray();

      const formattedBatches = batches.map((b) => ({
        ...b,
        purchase_price:
          b.purchase_price !== undefined && b.purchase_price !== null
            ? Math.round(Number(b.purchase_price) * 100) / 100
            : b.purchase_price,
        mrp:
          b.mrp !== undefined && b.mrp !== null
            ? Math.round(Number(b.mrp) * 100) / 100
            : b.mrp,
      }));

      res.json({
        product_name,
        count: formattedBatches.length,
        batches: formattedBatches,
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/inventory/search
router.get("/search", auth, requireSubscription(), async (req, res, next) => {
  try {
    const q = (req.query.q || req.query.query || "").trim();
    const { page = 1, limit = 15 } = req.query;
    const db = mongoose.connection.db;

    if (!q || q.length < 1) {
      return res.status(400).json({ detail: "Search query required" });
    }

    const parsedLimit = parseInt(limit);
    const parsedPage = parseInt(page);
    const trimmedQ = q;
    const cacheKey = `inv_search:${req.user.pharmacy_id}:${trimmedQ.toLowerCase()}:${parsedPage}:${parsedLimit}`;
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    const escapedQ = escapeRegex(q);

    const query = {
      pharmacy_id: req.user.pharmacy_id,
      status: { $nin: ["Returned", "Expired & Returned"] },
      $or: [
        { product_name: { $regex: escapedQ, $options: "i" } },
        { batch_no: { $regex: escapedQ, $options: "i" } },
        { salt_composition: { $regex: escapedQ, $options: "i" } },
      ],
    };

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
            as: "batch_supplier",
          },
        },
        {
          $unwind: {
            path: "$batch_supplier",
            preserveNullAndEmptyArrays: true,
          },
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
            pack_type: { $first: "$pack_type" },
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
                units_per_pack: "$units_per_pack",
                pack_type: "$pack_type",
                cgst: "$cgst",
                sgst: "$sgst",
                supplier_name: "$batch_supplier.name",
              },
            },
          },
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
            source: "inventory",
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

    // 1. Process inventory items & register for deduplication
    const seenNormKeys = new Set();
    const seenExactNames = new Set();
    const seenProductIds = new Set();

    const processedInventory = inventory.map((inv) => {
      const pName = (inv.product_name || "").trim();
      const exactLower = pName.toLowerCase();
      const normKey = normalizeMedKey(pName);

      seenExactNames.add(exactLower);
      if (normKey) seenNormKeys.add(normKey);
      if (inv.id) seenProductIds.add(String(inv.id));
      if (inv.product_id) seenProductIds.add(String(inv.product_id));

      const uPack = inv.units_per_pack || 1;
      const uMrp =
        inv.mrp_per_unit ||
        (inv.mrp && uPack > 0
          ? parseFloat((inv.mrp / uPack).toFixed(2))
          : inv.mrp || 0);

      return {
        ...inv,
        source: "inventory",
        stock_status:
          (inv.available_quantity || 0) > 0 ? "In Stock" : "Out of Stock",
        available_units: inv.available_quantity || 0,
        mrp_per_unit: uMrp,
      };
    });

    // 2. Search custom catalog (products collection)
    let customCatalog = [];
    try {
      const catMatches = await db
        .collection("products")
        .find({
          pharmacy_id: req.user.pharmacy_id,
          $or: [
            { name: { $regex: escapedQ, $options: "i" } },
            { product_name: { $regex: escapedQ, $options: "i" } },
            { salt_composition: { $regex: escapedQ, $options: "i" } },
          ],
        })
        .limit(20)
        .toArray();

      for (const cp of catMatches) {
        const cpName = (cp.name || cp.product_name || "").trim();
        if (!cpName) continue;
        const exactLower = cpName.toLowerCase();
        const normKey = normalizeMedKey(cpName);

        if (seenExactNames.has(exactLower) || seenNormKeys.has(normKey))
          continue;
        if (cp.id && seenProductIds.has(String(cp.id))) continue;

        seenExactNames.add(exactLower);
        if (normKey) seenNormKeys.add(normKey);
        if (cp.id) seenProductIds.add(String(cp.id));

        const uPack = cp.units_per_pack || 1;
        const pMrp = cp.mrp || 0;
        const uMrp =
          cp.unit_mrp ||
          (pMrp > 0 && uPack > 0
            ? parseFloat((pMrp / uPack).toFixed(2))
            : pMrp);

        customCatalog.push({
          id: cp.id || uuidv4(),
          product_id: cp.id,
          product_name: cpName,
          manufacturer: cp.manufacturer || "",
          salt_composition: cp.salt_composition || "",
          hsn_no: cp.hsn_no || cp.hsn_code || "300490",
          available_quantity: 0,
          available_units: 0,
          quantity: 0,
          units_per_pack: uPack,
          pack_type: cp.pack_type || cp.dosage_form || "Strip",
          purchase_price: cp.trade_price || cp.purchase_price || 0,
          mrp: pMrp,
          mrp_per_unit: uMrp,
          cgst:
            cp.cgst !== undefined
              ? cp.cgst
              : cp.tax_rate
                ? cp.tax_rate / 2
                : 2.5,
          sgst:
            cp.sgst !== undefined
              ? cp.sgst
              : cp.tax_rate
                ? cp.tax_rate / 2
                : 2.5,
          source: "catalog",
          is_custom_catalog: true,
          stock_status: "My Catalog",
          batches: [],
        });
      }
    } catch (catErr) {
      console.warn("Catalog search warning in inventory/search:", catErr.message);
    }

    // 3. Search Centralized Global Medicines (4.09L+ Records)
    let globalMedicines = [];
    try {
      const globalCol = await getGlobalMedicinesCollection();
      const isMultiWord = trimmedQ.includes(" ");
      const globalProjection = {
        _id: 1,
        id: 1,
        product_id: 1,
        name: 1,
        product_name: 1,
        brand: 1,
        manufacturer: 1,
        manufacturer_name: 1,
        dosage_form: 1,
        packaging_label: 1,
        package_details: 1,
        pack_size_label: 1,
        pack_size: 1,
        pack_type: 1,
        units_per_pack: 1,
        mrp: 1,
        "price(₹)": 1,
        unit_mrp: 1,
        trade_price: 1,
        purchase_price: 1,
        tax_rate: 1,
        gst_percentage: 1,
        hsn_code: 1,
        hsn_no: 1,
        salt_composition: 1,
        short_composition1: 1,
        short_composition2: 1,
        active_ingredients: 1,
        search_keyword: 1,
      };

      let rawGlobal = [];
      if (isMultiWord) {
        try {
          rawGlobal = await globalCol
            .find(
              { $text: { $search: q } },
              { score: { $meta: "textScore" }, projection: globalProjection }
            )
            .sort({ score: { $meta: "textScore" } })
            .limit(40)
            .toArray();
        } catch (e) {}

        if (rawGlobal.length < 15) {
          const firstWord = trimmedQ.split(/\s+/)[0];
          if (firstWord.length >= 2) {
            const extra = await globalCol
              .find(
                {
                  $or: [
                    {
                      product_name: {
                        $regex: `^${escapeRegex(firstWord)}`,
                        $options: "i",
                      },
                    },
                    {
                      search_keyword: {
                        $regex: `^${escapeRegex(firstWord)}`,
                        $options: "i",
                      },
                    },
                    {
                      brand: {
                        $regex: `^${escapeRegex(firstWord)}`,
                        $options: "i",
                      },
                    },
                    {
                      name: {
                        $regex: `^${escapeRegex(firstWord)}`,
                        $options: "i",
                      },
                    },
                  ],
                },
                { projection: globalProjection }
              )
              .limit(40 - rawGlobal.length)
              .toArray()
              .catch(() => []);
            const seenGIds = new Set(rawGlobal.map((r) => String(r._id)));
            for (const g of extra) {
              if (!seenGIds.has(String(g._id))) {
                seenGIds.add(String(g._id));
                rawGlobal.push(g);
              }
            }
          }
        }
      } else {
        const [prefixRes, textRes] = await Promise.all([
          globalCol
            .find(
              {
                $or: [
                  { product_name: { $regex: `^${escapedQ}`, $options: "i" } },
                  { search_keyword: { $regex: `^${escapedQ}`, $options: "i" } },
                  { brand: { $regex: `^${escapedQ}`, $options: "i" } },
                  { name: { $regex: `^${escapedQ}`, $options: "i" } },
                ],
              },
              { projection: globalProjection }
            )
            .limit(40)
            .toArray()
            .catch(() => []),
          globalCol
            .find(
              { $text: { $search: q } },
              { score: { $meta: "textScore" }, projection: globalProjection }
            )
            .sort({ score: { $meta: "textScore" } })
            .limit(20)
            .toArray()
            .catch(() => []),
        ]);

        const seenGIds = new Set(prefixRes.map((r) => String(r._id)));
        rawGlobal = [...prefixRes];
        for (const tm of textRes) {
          if (!seenGIds.has(String(tm._id))) {
            seenGIds.add(String(tm._id));
            rawGlobal.push(tm);
          }
        }

        if (rawGlobal.length < 15 && q.length >= 3) {
          const containsRes = await globalCol
            .find(
              {
                $or: [
                  { product_name: { $regex: escapedQ, $options: "i" } },
                  { search_keyword: { $regex: escapedQ, $options: "i" } },
                  { brand: { $regex: escapedQ, $options: "i" } },
                  { name: { $regex: escapedQ, $options: "i" } },
                ],
              },
              { projection: globalProjection }
            )
            .limit(40 - rawGlobal.length)
            .toArray()
            .catch(() => []);
          for (const cm of containsRes) {
            if (!seenGIds.has(String(cm._id))) {
              seenGIds.add(String(cm._id));
              rawGlobal.push(cm);
            }
          }
        }
      }

      // DEDUPLICATION: Prevent duplicate suggestions for products already in inventory / catalog
      for (const med of rawGlobal) {
        const medName = (med.product_name || med.name || "").trim();
        if (!medName) continue;
        const exactLower = medName.toLowerCase();
        const normKey = normalizeMedKey(medName);

        // Strict Check: If this medicine is already in local inventory or catalog, SKIP IT!
        if (seenExactNames.has(exactLower) || seenNormKeys.has(normKey))
          continue;
        if (med.product_id && seenProductIds.has(String(med.product_id)))
          continue;
        if (med.id && seenProductIds.has(String(med.id))) continue;

        seenExactNames.add(exactLower);
        if (normKey) seenNormKeys.add(normKey);
        if (med.product_id) seenProductIds.add(String(med.product_id));
        if (med.id) seenProductIds.add(String(med.id));

        let medUnits =
          typeof med.units_per_pack === "number" && med.units_per_pack > 0
            ? med.units_per_pack
            : 1;
        const packLabel =
          med.packaging_label ||
          med.package_details ||
          med.pack_size_label ||
          med.pack_size ||
          "";
        if (medUnits <= 1 && packLabel) {
          const matchNum = packLabel.match(/\d+/);
          if (matchNum) {
            const parsed = parseInt(matchNum[0]);
            if (!isNaN(parsed) && parsed > 0 && parsed <= 500)
              medUnits = parsed;
          }
        }

        const medMrp =
          typeof med.mrp === "number"
            ? med.mrp
            : parseFloat(med["price(₹)"]) || 0;
        const medUnitMrp =
          typeof med.unit_mrp === "number" && med.unit_mrp > 0
            ? med.unit_mrp
            : medUnits > 0 && medMrp > 0
              ? parseFloat((medMrp / medUnits).toFixed(2))
              : medMrp;
        const medTrade =
          typeof med.trade_price === "number" && med.trade_price > 0
            ? med.trade_price
            : typeof med.purchase_price === "number" && med.purchase_price > 0
              ? med.purchase_price
              : parseFloat((medMrp * 0.7).toFixed(2));
        const medTax =
          typeof med.tax_rate === "number"
            ? med.tax_rate
            : med.gst_percentage || 5;
        const medMfg = med.manufacturer_name || med.manufacturer || "";
        const medSalt =
          med.active_ingredients ||
          [med.short_composition1, med.short_composition2]
            .map((s) => (s || "").trim())
            .filter(Boolean)
            .join(", ") ||
          "";

        globalMedicines.push({
          id: `global-${med._id || med.id || uuidv4()}`,
          product_id:
            med.product_id || med.id || (med._id ? String(med._id) : undefined),
          product_name: medName,
          manufacturer: medMfg,
          manufacturer_name: medMfg,
          salt_composition: medSalt,
          hsn_no: med.hsn_code || med.hsn_no || "300490",
          available_quantity: 0,
          available_units: 0,
          quantity: 0,
          units_per_pack: medUnits,
          pack_type:
            med.pack_type ||
            (med.dosage_form === "syrup" ? "Bottle" : "Strip"),
          purchase_price: medTrade,
          cost_per_unit:
            medUnits > 0
              ? parseFloat((medTrade / medUnits).toFixed(2))
              : medTrade,
          mrp: medMrp,
          mrp_per_unit: medUnitMrp,
          cgst: medTax / 2,
          sgst: medTax / 2,
          source: "global",
          stock_status: "Global Catalog",
          is_manual: true,
          batches: [],
        });
      }
    } catch (gErr) {
      console.warn("Global search warning in inventory/search:", gErr.message);
    }

    // 4. Priority Ranking:
    // Tier 1: In-stock local inventory (available_quantity > 0) ALWAYS comes first!
    // Tier 2: Out-of-stock local inventory & custom catalog comes second!
    // Tier 3: Global medicines come third!
    const searchLower = q.toLowerCase();
    const scoreItem = (item) => {
      const name = (item.product_name || "").toLowerCase();
      const salt = (item.salt_composition || "").toLowerCase();
      let matchScore = 0;
      if (name === searchLower) matchScore = 100;
      else if (name.startsWith(searchLower)) matchScore = 80;
      else if (name.includes(searchLower)) matchScore = 60;
      else if (salt.startsWith(searchLower)) matchScore = 50;
      else if (salt.includes(searchLower)) matchScore = 40;
      else matchScore = 10;

      let sourceTier = 0;
      if (item.source === "inventory" && (item.available_quantity || 0) > 0) {
        sourceTier = 3000; // In-stock inventory
      } else if (item.source === "inventory" || item.source === "catalog") {
        sourceTier = 2000; // Local catalog / out-of-stock
      } else {
        sourceTier = 1000; // Global medicines
      }

      return sourceTier + matchScore;
    };

    const combined = [
      ...processedInventory,
      ...customCatalog,
      ...globalMedicines,
    ];
    combined.sort((a, b) => scoreItem(b) - scoreItem(a));

    const total = combined.length;
    const paginatedInventory = combined.slice(
      (parsedPage - 1) * parsedLimit,
      parsedPage * parsedLimit
    );

    const responsePayload = {
      inventory: paginatedInventory,
      count: total,
      pagination: {
        page: parsedPage,
        limit: parsedLimit,
        total: total,
        total_pages: Math.ceil(total / parsedLimit) || 1,
      },
    };

    if (paginatedInventory.length > 0) {
      setCached(cacheKey, responsePayload);
    }

    res.json(responsePayload);
  } catch (error) {
    next(error);
  }
});

// GET /api/inventory/shortage
router.get("/shortage", auth, requireSubscription(), async (req, res, next) => {
  try {
    const db = mongoose.connection.db;

    // Fetch user settings for global shortage threshold
    const userSettings = await db
      .collection("user_settings")
      .findOne({ user_id: req.user.id });
    const globalThreshold =
      userSettings?.preferences?.shortage_threshold !== undefined
        ? Number(userSettings.preferences.shortage_threshold)
        : 10;

    const allInventory = await db
      .collection("inventory")
      .find({ pharmacy_id: req.user.pharmacy_id })
      .toArray();
    const shortageItems = [];
    allInventory.forEach((item) => {
      const thresh =
        item.shortage_threshold !== undefined &&
        item.shortage_threshold !== null
          ? Number(item.shortage_threshold)
          : globalThreshold;
      if (item.available_quantity <= thresh) {
        shortageItems.push(item);
      }
    });

    res.json({
      inventory: shortageItems,
      count: shortageItems.length,
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
      .find({ pharmacy_id: req.user.pharmacy_id }, { projection: { _id: 0 } })
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
router.patch(
  "/:id/add-quantity",
  auth,
  requireSubscription(),
  async (req, res, next) => {
    try {
      const db = mongoose.connection.db;
      const { add_quantity } = req.body;

      if (!add_quantity || isNaN(add_quantity) || Number(add_quantity) <= 0) {
        return res
          .status(400)
          .json({ detail: "Please provide a valid quantity to add (> 0)" });
      }

      const { id } = req.params;
      const item = await db
        .collection("inventory")
        .findOne({ id, pharmacy_id: req.user.pharmacy_id });

      if (!item) {
        return res.status(404).json({ detail: "Inventory item not found" });
      }

      await db.collection("inventory").updateOne(
        { id, pharmacy_id: req.user.pharmacy_id },
        {
          $inc: { available_quantity: Number(add_quantity) },
          $set: { updated_at: new Date().toISOString() },
        }
      );

      await logActivity(
        db,
        req.user.pharmacy_id,
        req.user.id,
        req.user.name,
        "UPDATE",
        "INVENTORY",
        id,
        `Increased stock of ${item.product_name} by ${add_quantity} units`,
        `/inventory`
      );

      res.json({ message: "Stock updated successfully" });
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /api/inventory/:id
router.delete("/:id", auth, requireSubscription(), async (req, res, next) => {
  try {
    const db = mongoose.connection.db;
    const { id } = req.params;

    const item = await db
      .collection("inventory")
      .findOne({ id, pharmacy_id: req.user.pharmacy_id });
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
      merged_hsn,
    } = req.body;

    if (
      !inventory_ids ||
      !Array.isArray(inventory_ids) ||
      inventory_ids.length < 2
    ) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(400)
        .json({
          detail: "At least two inventory items must be selected to merge",
        });
    }

    if (!merged_name || !merged_name.trim()) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(400)
        .json({ detail: "Merged product name is required" });
    }

    const cleanMergedName = merged_name.trim();

    // 1. Fetch the target inventory documents
    const items = await db
      .collection("inventory")
      .find(
        {
          pharmacy_id: req.user.pharmacy_id,
          id: { $in: inventory_ids },
        },
        { session }
      )
      .toArray();

    if (items.length !== inventory_ids.length) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(404)
        .json({
          detail: "One or more selected inventory items were not found",
        });
    }

    // Capture the list of old product names and product IDs to update history
    const oldProductNames = [
      ...new Set(items.map((item) => item.product_name)),
    ];
    const oldProductIds = [
      ...new Set(items.map((item) => item.product_id).filter((id) => id)),
    ];

    // 2. Find or create the unified product in the products catalog
    let matchedProduct = await db.collection("products").findOne(
      {
        pharmacy_id: req.user.pharmacy_id,
        name: {
          $regex: new RegExp(
            "^" +
              cleanMergedName.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&") +
              "$",
            "i"
          ),
        },
      },
      { session }
    );

    let unifiedProductId;
    if (matchedProduct) {
      unifiedProductId = matchedProduct.id;
    } else {
      unifiedProductId = uuidv4();
      await db.collection("products").insertOne(
        {
          id: unifiedProductId,
          pharmacy_id: req.user.pharmacy_id,
          name: cleanMergedName,
          low_stock_threshold: 10,
          created_at: new Date().toISOString(),
        },
        { session }
      );
    }

    // 3. Check for batch conflicts (multiple inventory records with the same batch number)
    const batchesMap = {};
    items.forEach((item) => {
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
          totalQty += duplicate.quantity || 0;
          totalAvailable += duplicate.available_quantity || 0;
          deletedToPrimary[duplicate.id] = primary.id;

          // Delete duplicate inventory item
          await db
            .collection("inventory")
            .deleteOne({ id: duplicate.id }, { session });
        }

        // Update primary batch quantities
        await db.collection("inventory").updateOne(
          { id: primary.id },
          {
            $set: {
              quantity: totalQty,
              available_quantity: totalAvailable,
            },
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
        id: { $in: inventoryIdsToKeep },
      },
      {
        $set: {
          product_id: unifiedProductId,
          product_name: cleanMergedName,
          manufacturer: merged_manufacturer || null,
          salt_composition: merged_salt || null,
          hsn_no: merged_hsn || null,
        },
      },
      { session }
    );

    // 5. Update historical purchases
    if (oldProductNames.length > 0 || oldProductIds.length > 0) {
      const purchaseQuery = {
        pharmacy_id: req.user.pharmacy_id,
        $or: [],
      };
      if (oldProductNames.length > 0) {
        purchaseQuery.$or.push({
          "items.product_name": { $in: oldProductNames },
        });
      }
      if (oldProductIds.length > 0) {
        purchaseQuery.$or.push({ "items.product_id": { $in: oldProductIds } });
      }

      const matchingPurchases = await db
        .collection("purchases")
        .find(purchaseQuery, { session })
        .toArray();

      for (const purchase of matchingPurchases) {
        const updatedItems = purchase.items.map((item) => {
          const nameMatches = oldProductNames.includes(item.product_name);
          const idMatches =
            item.product_id && oldProductIds.includes(item.product_id);

          if (nameMatches || idMatches) {
            return {
              ...item,
              product_id: unifiedProductId,
              product_name: cleanMergedName,
              manufacturer: merged_manufacturer || item.manufacturer,
              salt_composition: merged_salt || item.salt_composition,
              hsn_no: merged_hsn || item.hsn_no,
            };
          }
          return item;
        });

        await db
          .collection("purchases")
          .updateOne(
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
        { "items.inventory_id": { $in: inventory_ids } },
      ],
    };

    const matchingBills = await db
      .collection("bills")
      .find(billQuery, { session })
      .toArray();

    for (const bill of matchingBills) {
      const updatedItems = bill.items.map((item) => {
        const nameMatches = oldProductNames.includes(item.product_name);
        const invIdMatches =
          item.inventory_id && inventory_ids.includes(item.inventory_id);

        if (nameMatches || invIdMatches) {
          let targetInvId = item.inventory_id;
          if (targetInvId && deletedToPrimary[targetInvId]) {
            targetInvId = deletedToPrimary[targetInvId];
          }

          return {
            ...item,
            inventory_id: targetInvId,
            product_name: cleanMergedName,
            salt_composition: merged_salt || item.salt_composition,
          };
        }
        return item;
      });

      await db
        .collection("bills")
        .updateOne(
          { id: bill.id },
          { $set: { items: updatedItems } },
          { session }
        );
    }

    // 7. Clean up old catalog products
    const productsToDelete = oldProductIds.filter(
      (id) => id !== unifiedProductId
    );
    if (productsToDelete.length > 0) {
      await db.collection("products").deleteMany(
        {
          pharmacy_id: req.user.pharmacy_id,
          id: { $in: productsToDelete },
        },
        { session }
      );
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
      consolidated_batches: Object.keys(deletedToPrimary).length,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    next(error);
  }
});

// PUT /api/inventory/:id
router.put("/:id", auth, requireSubscription(), async (req, res, next) => {
  try {
    const db = mongoose.connection.db;
    const { shortage_threshold } = req.body;

    const updateDoc = {};
    if (shortage_threshold !== undefined) {
      updateDoc.shortage_threshold =
        shortage_threshold === null || shortage_threshold === ""
          ? null
          : Number(shortage_threshold);
    }

    const result = await db
      .collection("inventory")
      .updateOne(
        { id: req.params.id, pharmacy_id: req.user.pharmacy_id },
        { $set: updateDoc }
      );

    if (result.matchedCount === 0) {
      return res.status(404).json({ detail: "Inventory item not found" });
    }

    res.json({ message: "Inventory item updated successfully" });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
