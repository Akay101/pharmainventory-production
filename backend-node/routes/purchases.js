const express = require("express");
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const router = express.Router();
const mongoose = require("mongoose");
const { queueGlobalCheck } = require("../services/globalReview");
const { v4: uuidv4 } = require("uuid");
const axios = require("axios");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { auth } = require("../middleware/auth");
const { normalizeName, normalizeExpiryDate } = require("../utils/helpers");
const { generatePurchasePDF } = require("../services/pdf");
const { uploadToR2 } = require("../services/r2");
const { logActivity } = require("../utils/activityLogger");
const { requireSubscription } = require("../middleware/subscription");
const {
  purchaseStockImpact,
  publicImpact,
  findBatch,
} = require("../services/stock");
const {
  getGlobalDistributorsCollection,
  clearCachePattern,
} = require("../utils/globalDb");

const escapeRegex = (str) => {
  if (!str) return "";
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

const {
  acceptImages,
  enqueueScan,
  scanStatus,
} = require("../services/ai/scanService");
const { matchForPurchase } = require("../services/ai/inventoryMatch");

// Multer Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), "tmp/uploads");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${uuidv4()}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB limit
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "text/csv",
      "text/plain",
      "application/vnd.ms-excel",
      "application/csv",
      "text/x-csv",
      "application/x-csv",
      "text/comma-separated-values",
    ];
    if (
      allowedTypes.includes(file.mimetype) ||
      ext === ".csv" ||
      ext === ".txt"
    ) {
      cb(null, true);
    } else {
      cb(
        new Error(
          "Invalid file type. Only PNG, JPEG, WebP, and CSV files are allowed."
        )
      );
    }
  },
});

// POST /api/purchases/match-suggestions - Link scanned lines to existing catalog products
router.post(
  "/match-suggestions",
  auth,
  requireSubscription(),
  async (req, res, next) => {
    try {
      const db = mongoose.connection.db;
      const { items } = req.body;
      if (!Array.isArray(items) || items.length === 0) {
        return res.json({ success: true, matches: [] });
      }
      const matches = await Promise.all(
        items.slice(0, 100).map((i) =>
          matchForPurchase(db, req.user.pharmacy_id, {
            product_name: String(i?.product_name || ""),
            batch_no: String(i?.batch_no || ""),
          })
        )
      );
      res.json({ success: true, matches });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/purchases/product-history - Fetch all historical purchases for a product
router.get(
  "/product-history",
  auth,
  requireSubscription(),
  async (req, res, next) => {
    try {
      const db = mongoose.connection.db;
      const { product_name } = req.query;

      if (!product_name) {
        return res.status(400).json({ detail: "product_name is required" });
      }

      const normalizedInput = (product_name || "").trim().toLowerCase();

      const purchases = await db
        .collection("purchases")
        .find(
          {
            pharmacy_id: req.user.pharmacy_id,
            "items.product_name": {
              $regex: normalizedInput.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&"),
              $options: "i",
            },
          },
          { projection: { _id: 0 } }
        )
        .sort({ purchase_date: -1, created_at: -1 })
        .toArray();

      const historyRecords = [];

      for (const p of purchases) {
        for (const item of p.items || []) {
          const itemProdName = (item.product_name || "").toLowerCase();
          if (
            itemProdName === normalizedInput ||
            itemProdName.includes(normalizedInput) ||
            normalizedInput.includes(itemProdName)
          ) {
            historyRecords.push({
              purchase_id: p.id,
              purchase_date: p.purchase_date,
              invoice_no: p.invoice_no,
              supplier_id: p.supplier_id,
              supplier_name: p.supplier_name,
              payment_status: p.payment_status,
              payment_mode: p.payment_mode,
              product_name: item.product_name,
              batch_no: item.batch_no,
              expiry_date: item.expiry_date,
              pack_quantity: item.pack_quantity || item.quantity || 0,
              units_per_pack: item.units_per_pack || 1,
              total_units: item.total_units || item.quantity || 0,
              pack_price: item.pack_price || item.rate_pack || 0,
              price_per_unit: item.price_per_unit || item.purchase_price || 0,
              mrp_pack: item.mrp_pack || 0,
              mrp_per_unit: item.mrp_per_unit || item.mrp || 0,
              discount: item.discount || 0,
              scheme: item.scheme || 0,
              cgst: item.cgst || 0,
              sgst: item.sgst || 0,
              item_total: item.item_total || 0,
              manufacturer: item.manufacturer,
              salt_composition: item.salt_composition,
              hsn_no: item.hsn_no,
              pack_type: item.pack_type,
            });
          }
        }
      }

      res.json({
        product_name,
        count: historyRecords.length,
        purchases: historyRecords,
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/purchases/price-history - Check historical prices and MRP trend for a product
router.get(
  "/price-history",
  auth,
  requireSubscription(),
  async (req, res, next) => {
    try {
      const db = mongoose.connection.db;
      const { product_name, current_price, current_rate, current_mrp } =
        req.query;

      if (!product_name) {
        return res.status(400).json({ detail: "product_name is required" });
      }

      const currentRateNum =
        parseFloat(
          req.query.current_price ||
            req.query.current_rate ||
            req.query.rate_pack
        ) || 0;
      const currentMrpNum =
        parseFloat(
          req.query.current_mrp ||
            req.query.current_mrp_pack ||
            req.query.mrp_pack
        ) || 0;

      // Find all purchases containing this product (case-insensitive match, with normalized name)
      const normalizedInput = normalizeName(product_name);

      const purchases = await db
        .collection("purchases")
        .find(
          {
            pharmacy_id: req.user.pharmacy_id,
          },
          { projection: { _id: 0 } }
        )
        .toArray();

      const historicalRecords = [];
      let matchedProductName = null;

      for (const purchase of purchases) {
        for (const item of purchase.items || []) {
          const normalizedStored = normalizeName(item.product_name);

          if (
            normalizedStored === normalizedInput ||
            normalizedStored.includes(normalizedInput) ||
            normalizedInput.includes(normalizedStored)
          ) {
            if (!matchedProductName) {
              matchedProductName = item.product_name;
            }

            const packPrice = parseFloat(
              item.rate_pack || item.pack_price || 0
            );
            const unitsPerPack =
              parseInt(item.units_per_pack || item.units) || 1;
            const mrpPack = parseFloat(
              item.mrp_pack ||
                (item.mrp_per_unit
                  ? item.mrp_per_unit * unitsPerPack
                  : item.mrp || 0)
            );

            if (packPrice > 0) {
              historicalRecords.push({
                purchase_id: purchase.id || purchase._id,
                supplier_id: purchase.supplier_id,
                supplier_name: purchase.supplier_name || "Unknown Supplier",
                rate_pack: packPrice,
                mrp_pack: mrpPack,
                units_per_pack: unitsPerPack,
                price_per_unit: packPrice / unitsPerPack,
                purchase_date: purchase.created_at || purchase.purchase_date,
                invoice_no: purchase.invoice_no || "N/A",
                batch_no: item.batch_no || "N/A",
                expiry_date: item.expiry_date || "N/A",
              });
            }
          }
        }
      }

      // Sort chronologically (ascending) for trend chart
      const sortedByDate = [...historicalRecords].sort(
        (a, b) => new Date(a.purchase_date) - new Date(b.purchase_date)
      );

      // Sort by rate (cheapest first)
      const sortedByRate = [...historicalRecords].sort(
        (a, b) => a.rate_pack - b.rate_pack
      );

      const latestRecord =
        sortedByDate.length > 0 ? sortedByDate[sortedByDate.length - 1] : null;
      const cheapestRecord = sortedByRate.length > 0 ? sortedByRate[0] : null;

      const latestRate = latestRecord ? latestRecord.rate_pack : 0;
      const latestMrp = latestRecord ? latestRecord.mrp_pack : 0;

      const rate_increased =
        currentRateNum > 0 &&
        latestRate > 0 &&
        currentRateNum - latestRate >= 0.5;
      const rate_difference = rate_increased
        ? Number((currentRateNum - latestRate).toFixed(2))
        : 0;

      const mrp_increased =
        currentMrpNum > 0 && latestMrp > 0 && currentMrpNum - latestMrp >= 0.5;
      const mrp_difference = mrp_increased
        ? Number((currentMrpNum - latestMrp).toFixed(2))
        : 0;

      const mrp_lowered =
        currentMrpNum > 0 && latestMrp > 0 && latestMrp - currentMrpNum >= 0.5;
      const mrp_drop_difference = mrp_lowered
        ? Number((latestMrp - currentMrpNum).toFixed(2))
        : 0;

      // ALERT CONDITION: Rate increased while MRP remained SAME (neither increased nor lowered)
      const is_higher_price_alert =
        rate_increased && !mrp_increased && !mrp_lowered;
      const is_mrp_lowered_alert = mrp_lowered;

      const alert_type = mrp_lowered
        ? rate_increased
          ? "MRP_LOWERED_HIGHER_RATE"
          : "MRP_LOWERED"
        : is_higher_price_alert
          ? "SAME_MRP_HIGHER_RATE"
          : mrp_increased
            ? "MRP_HIKE"
            : "NORMAL";

      // Filter cheaper supplier options
      const cheaperOptions =
        currentRateNum > 0
          ? sortedByRate.filter((r) => r.rate_pack < currentRateNum)
          : [];

      res.json({
        searched_product_name: product_name,
        matched_product_name: matchedProductName || product_name,
        current_rate: currentRateNum,
        current_mrp: currentMrpNum,
        latest_rate: latestRate,
        latest_mrp: latestMrp,
        cheapest_rate: cheapestRecord ? cheapestRecord.rate_pack : null,
        rate_increased,
        rate_difference,
        mrp_increased,
        mrp_difference,
        mrp_lowered,
        mrp_drop_difference,
        is_higher_price_alert,
        is_mrp_lowered_alert,
        alert_type,
        cheaper_options: cheaperOptions,
        price_history_trend: sortedByDate,
        all_historical_prices: sortedByRate,
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/purchases
router.get("/", auth, requireSubscription(), async (req, res, next) => {
  try {
    const db = mongoose.connection.db;
    const {
      search,
      supplier_id,
      start_date,
      end_date,
      page = 1,
      limit = 20,
      sort_by = "purchase_date",
      sort_order = "desc",
      highlight_id,
    } = req.query;

    const query = { pharmacy_id: req.user.pharmacy_id };

    if (search) {
      const escapedSearch = escapeRegex(search);
      query.$or = [
        { invoice_no: { $regex: escapedSearch, $options: "i" } },
        { supplier_name: { $regex: escapedSearch, $options: "i" } },
        { "items.product_name": { $regex: escapedSearch, $options: "i" } },
      ];
    }
    if (supplier_id) query.supplier_id = supplier_id;
    if (start_date || end_date) {
      query.purchase_date = {};
      if (start_date) query.purchase_date.$gte = start_date;
      if (end_date) query.purchase_date.$lte = end_date;
    }

    const sortDir = sort_order === "asc" ? 1 : -1;

    const sortOptions =
      sort_by === "purchase_date"
        ? { purchase_date: sortDir, created_at: sortDir }
        : { [sort_by]: sortDir };

    let pageNum = parseInt(page);
    if (highlight_id) {
      const allPurchasesIds = await db
        .collection("purchases")
        .find(query)
        .sort(sortOptions)
        .project({ id: 1 })
        .toArray();
      const targetIndex = allPurchasesIds.findIndex(
        (p) => p.id === highlight_id
      );
      if (targetIndex !== -1) {
        pageNum = Math.floor(targetIndex / parseInt(limit)) + 1;
      }
    }

    const skip = (parseInt(pageNum) - 1) * parseInt(limit);

    const purchases = await db
      .collection("purchases")
      .find(query, { projection: { _id: 0 } })
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit))
      .toArray();

    const total = await db.collection("purchases").countDocuments(query);

    res.json({
      purchases,
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

// POST /api/purchases
router.post("/", auth, requireSubscription(), async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const {
      supplier_id,
      supplier_name,
      supplier_data,
      invoice_no,
      purchase_date,
      items,
      payment_status,
      amount_paid,
      payment_mode,
    } = req.body;
    const db = mongoose.connection.db;

    // Validate payment mode against mandatory settings preference
    const userPrefs = await db
      .collection("user_settings")
      .findOne({ user_id: req.user.id });
    const preferences = userPrefs?.preferences || {};
    const isModeMandatory =
      preferences.purchase_payment_mode_mandatory === true;

    const isPaidOrPartial =
      payment_status === "Paid" || payment_status === "Partial";
    if (
      isModeMandatory &&
      isPaidOrPartial &&
      (!payment_mode || !["Cash", "UPI", "Card"].includes(payment_mode))
    ) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ detail: "Payment mode is mandatory" });
    }

    if (payment_status === "Partial") {
      const pAmount = parseFloat(amount_paid);
      if (isNaN(pAmount) || pAmount <= 0) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          detail: "Initial paid amount is mandatory for Partial payment",
        });
      }
    }

    if (!items || items.length === 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ detail: "At least one item is required" });
    }

    // Resolve or Auto-Create Supplier into local suppliers collection upon purchase creation
    let resolvedSupplierId = supplier_id;
    let resolvedSupplierName = supplier_name || "Unknown";

    let localSup = null;
    if (supplier_id) {
      localSup = await db.collection("suppliers").findOne(
        {
          pharmacy_id: req.user.pharmacy_id,
          $or: [{ id: supplier_id }, { global_code: supplier_id }],
        },
        { session }
      );
    }

    if (!localSup && supplier_data?.gst_no) {
      localSup = await db.collection("suppliers").findOne(
        {
          pharmacy_id: req.user.pharmacy_id,
          $or: [
            { gst_no: supplier_data.gst_no },
            { gstin: supplier_data.gst_no },
          ],
        },
        { session }
      );
    }

    if (!localSup && supplier_name && supplier_name !== "Unknown") {
      localSup = await db.collection("suppliers").findOne(
        {
          pharmacy_id: req.user.pharmacy_id,
          name: {
            $regex: new RegExp(`^${escapeRegex(supplier_name.trim())}$`, "i"),
          },
        },
        { session }
      );
    }

    let createdSupplier = null;
    if (localSup) {
      resolvedSupplierId = localSup.id;
      resolvedSupplierName = localSup.name;
    } else if (supplier_id || (supplier_data && supplier_data.name)) {
      // Distributor selected from global catalog or newly provided supplier:
      // Insert into local suppliers collection now that purchase is actually being created
      let distDetails = supplier_data || {};
      if (!distDetails.name && supplier_id) {
        try {
          const globalDistCol = await getGlobalDistributorsCollection();
          if (globalDistCol) {
            const rawId =
              typeof supplier_id === "string" && supplier_id.startsWith("DST-")
                ? parseInt(supplier_id.replace("DST-", ""))
                : supplier_id;
            const foundDist = await globalDistCol.findOne({
              $or: [{ supplier_code: supplier_id }, { supplier_id: rawId }],
            });
            if (foundDist) {
              distDetails = {
                name: foundDist.agency_name,
                phone: foundDist.contact_number,
                gst_no: foundDist.gst_number,
                address: [foundDist.locality, foundDist.city, foundDist.state]
                  .filter(Boolean)
                  .join(", "),
                city: foundDist.city,
                state: foundDist.state,
                global_id:
                  foundDist.supplier_code || `DST-${foundDist.supplier_id}`,
              };
            }
          }
        } catch (e) {
          console.warn(
            "Global dist lookup fallback during purchase creation:",
            e.message
          );
        }
      }

      const finalName = distDetails.name || supplier_name || "Unknown Supplier";
      const newLocalSupId = uuidv4();
      const newLocalSup = {
        id: newLocalSupId,
        pharmacy_id: req.user.pharmacy_id,
        name: finalName.trim(),
        contact:
          (distDetails.phone || distDetails.contact || "").trim() || null,
        phone: (distDetails.phone || distDetails.contact || "").trim() || null,
        email: distDetails.email || null,
        address:
          distDetails.address ||
          [distDetails.city, distDetails.state].filter(Boolean).join(", ") ||
          null,
        city: distDetails.city || null,
        state: distDetails.state || null,
        gst_no: (distDetails.gst_no || distDetails.gstin || "").trim() || null,
        gstin: (distDetails.gst_no || distDetails.gstin || "").trim() || null,
        global_code: distDetails.global_id || supplier_id || null,
        created_at: new Date().toISOString(),
      };

      await db.collection("suppliers").insertOne(newLocalSup, { session });
      if (!distDetails.global_id) queueGlobalCheck("distributor", req.user.pharmacy_id, newLocalSup);
      resolvedSupplierId = newLocalSupId;
      resolvedSupplierName = newLocalSup.name;
      createdSupplier = newLocalSup;

      clearCachePattern(`sups:${req.user.pharmacy_id}`);
    }

    // [Issue #11] Idempotency Check
    if (invoice_no) {
      const existingPurchase = await db.collection("purchases").findOne(
        {
          pharmacy_id: req.user.pharmacy_id,
          supplier_id: resolvedSupplierId,
          invoice_no,
          created_at: {
            $gt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          },
        },
        { session }
      );

      if (existingPurchase) {
        await session.abortTransaction();
        session.endSession();
        return res.status(409).json({
          detail:
            "Duplicate purchase detected (same invoice and supplier in last 30 days)",
        });
      }
    }

    const purchaseId = uuidv4();
    let totalAmount = 0;
    const processedItems = [];

    if (items.some((it) => !String(it?.product_name || "").trim())) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(400)
        .json({ detail: "Every item needs a product name" });
    }

    for (const item of items) {
      // Find or create product in products collection (unique product directory)
      const normalizedName = item.product_name.trim();
      let matchedProduct = null;

      const pId = item.selected_product_id || item.product_id;
      const strPid =
        pId !== undefined && pId !== null ? String(pId).trim() : "";
      const isScanned = strPid.startsWith("scanned_");

      if (pId && !isScanned) {
        matchedProduct = await db.collection("products").findOne(
          {
            pharmacy_id: req.user.pharmacy_id,
            $or: [
              { id: pId },
              { id: strPid },
              { product_id: pId },
              { product_id: strPid },
            ],
          },
          { session }
        );
      }

      if (!matchedProduct) {
        matchedProduct = await db.collection("products").findOne(
          {
            pharmacy_id: req.user.pharmacy_id,
            name: {
              $regex: new RegExp(
                "^" +
                  normalizedName.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&") +
                  "$",
                "i"
              ),
            },
          },
          { session }
        );
      }

      let resolvedProductId;
      if (matchedProduct) {
        resolvedProductId = matchedProduct.id;
      } else {
        resolvedProductId = pId && !isScanned ? pId : uuidv4();
        await db.collection("products").insertOne(
          {
            id: resolvedProductId,
            product_id: resolvedProductId,
            pharmacy_id: req.user.pharmacy_id,
            name: normalizedName,
            product_name: normalizedName,
            category: item.category || "medicine",
            dosage_form: item.dosage_form || item.pack_type || "tablet",
            manufacturer: item.manufacturer || "",
            salt_composition: item.salt_composition || "",
            pack_type: item.pack_type || "Strip",
            units_per_pack: item.units_per_pack || item.units || 1,
            hsn_no: item.hsn_no || "",
            tax_rate:
              (parseFloat(item.cgst) || 0) + (parseFloat(item.sgst) || 0),
            cgst: parseFloat(item.cgst) || 0,
            sgst: parseFloat(item.sgst) || 0,
            mrp:
              (item.mrp_per_unit || item.mrp_unit || 0) *
              (item.units_per_pack || item.units || 1),
            trade_price: item.pack_price || item.rate_pack || 0,
            purchase_price: item.pack_price || item.rate_pack || 0,
            source: "catalog",
            is_custom_catalog: true,
            low_stock_threshold:
              item.low_stock_threshold !== undefined &&
              item.low_stock_threshold !== "" &&
              item.low_stock_threshold !== null
                ? Number(item.low_stock_threshold)
                : 10,
            shortage_threshold:
              item.shortage_threshold !== undefined &&
              item.shortage_threshold !== "" &&
              item.shortage_threshold !== null
                ? Number(item.shortage_threshold)
                : 10,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { session }
        );
        queueGlobalCheck("medicine", req.user.pharmacy_id, { ...item, id: resolvedProductId, name: normalizedName });
      }

      let packQty = item.pack_quantity || item.quantity || 1;
      let unitsPerPack = item.units_per_pack || item.units || 1;
      let packPrice = item.pack_price || item.rate_pack || 0;
      let mrpPerUnit = item.mrp_per_unit || item.mrp_unit || 0;
      if (mrpPerUnit) {
        mrpPerUnit = Math.round(Number(mrpPerUnit) * 100) / 100;
      }
      const discount = parseFloat(item.discount) || 0;
      const scheme = parseFloat(item.scheme) || 0;

      if (item.quantity && !item.pack_quantity && item.purchase_price) {
        packQty = item.quantity;
        unitsPerPack = 1;
        packPrice = item.purchase_price;
      }

      const totalPacks = packQty + scheme;
      const totalUnits = totalPacks * unitsPerPack;

      const netBasePrice = packQty * packPrice * (1 - discount / 100);
      const cgst = parseFloat(item.cgst) || 0;
      const sgst = parseFloat(item.sgst) || 0;
      const itemTotal = netBasePrice * (1 + (cgst + sgst) / 100);
      totalAmount += itemTotal;

      // True Net Landing Cost per unit (inclusive of GST and net of discounts/scheme)
      const pricePerUnit =
        totalUnits > 0
          ? itemTotal / totalUnits
          : unitsPerPack > 0
            ? (packPrice * (1 - discount / 100) * (1 + (cgst + sgst) / 100)) /
              unitsPerPack
            : 0;

      const normalizedExpiry = normalizeExpiryDate(item.expiry_date);

      const processedItem = {
        product_id: resolvedProductId,
        product_name: item.product_name,
        batch_no: item.batch_no,
        expiry_date: normalizedExpiry,
        manufacturer: item.manufacturer || null,
        salt_composition: item.salt_composition || null,
        pack_type: item.pack_type || "Strip",
        quantity: totalUnits,
        pack_quantity: packQty,
        scheme: scheme,
        units_per_pack: unitsPerPack,
        total_units: totalUnits,
        purchase_price: Math.round(pricePerUnit * 10000) / 10000,
        pack_price: packPrice,
        price_per_unit: Math.round(pricePerUnit * 10000) / 10000,
        cost_per_unit: Math.round(pricePerUnit * 10000) / 10000,
        mrp: mrpPerUnit,
        mrp_per_unit: mrpPerUnit,
        mrp_pack: mrpPerUnit
          ? Math.round(mrpPerUnit * unitsPerPack * 100) / 100
          : null,
        hsn_no: item.hsn_no || null,
        item_total: itemTotal,
        cgst: cgst,
        sgst: sgst,
        discount: discount,
        shortage_threshold:
          item.shortage_threshold !== undefined &&
          item.shortage_threshold !== null &&
          item.shortage_threshold !== ""
            ? Number(item.shortage_threshold)
            : null,
      };
      processedItems.push(processedItem);

      // Update inventory (with session)
      const existingInventory = await db.collection("inventory").findOne(
        {
          pharmacy_id: req.user.pharmacy_id,
          product_id: resolvedProductId,
          batch_no: item.batch_no,
        },
        { session }
      );

      if (existingInventory) {
        await db.collection("inventory").updateOne(
          { id: existingInventory.id },
          {
            $inc: { quantity: totalUnits, available_quantity: totalUnits },
            $set: {
              purchase_price: pricePerUnit,
              mrp: mrpPerUnit,
              units_per_pack: unitsPerPack,
              pack_type: item.pack_type || "Strip",
              manufacturer: item.manufacturer,
              salt_composition: item.salt_composition,
              pack_price: packPrice,
              mrp_pack: mrpPerUnit ? mrpPerUnit * unitsPerPack : null,
              expiry_date: normalizedExpiry,
              cgst: cgst,
              sgst: sgst,
              discount: discount,
              scheme: scheme,
              shortage_threshold:
                item.shortage_threshold !== undefined &&
                item.shortage_threshold !== null &&
                item.shortage_threshold !== ""
                  ? Number(item.shortage_threshold)
                  : existingInventory.shortage_threshold !== undefined
                    ? existingInventory.shortage_threshold
                    : null,
            },
          },
          { session }
        );
      } else {
        const inventoryId = uuidv4();
        await db.collection("inventory").insertOne(
          {
            id: inventoryId,
            pharmacy_id: req.user.pharmacy_id,
            product_id: resolvedProductId,
            product_name: item.product_name,
            batch_no: item.batch_no,
            hsn_no: item.hsn_no || null,
            expiry_date: normalizedExpiry,
            manufacturer: item.manufacturer || null,
            salt_composition: item.salt_composition || null,
            pack_type: item.pack_type || "Strip",
            quantity: totalUnits,
            available_quantity: totalUnits,
            pack_quantity: packQty,
            scheme: scheme,
            units_per_pack: unitsPerPack,
            purchase_price: pricePerUnit,
            mrp: mrpPerUnit,
            pack_price: packPrice,
            mrp_pack: mrpPerUnit ? mrpPerUnit * unitsPerPack : null,
            cgst: cgst,
            sgst: sgst,
            discount: discount,
            purchase_id: purchaseId,
            supplier_id: resolvedSupplierId || null,
            shortage_threshold:
              item.shortage_threshold !== undefined &&
              item.shortage_threshold !== null &&
              item.shortage_threshold !== ""
                ? Number(item.shortage_threshold)
                : null,
            created_at: new Date().toISOString(),
          },
          { session }
        );
      }
    }

    const pStatus = payment_status || "Unpaid";
    let pAmount = parseFloat(amount_paid) || 0;

    if (pStatus === "Paid") pAmount = totalAmount;
    else if (pStatus === "Unpaid") pAmount = 0;
    else if (pAmount > round2(totalAmount) + 0.005) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        detail: `Paid amount ₹${pAmount.toFixed(2)} is more than the purchase total ₹${totalAmount.toFixed(2)}. Choose Paid for the full amount.`,
      });
    }

    const payments = [];
    if (pAmount > 0) {
      payments.push({
        id: uuidv4(),
        amount: pAmount,
        date: new Date().toISOString(),
        notes: "Initial Payment",
      });
    }

    const purchaseData = {
      id: purchaseId,
      pharmacy_id: req.user.pharmacy_id,
      supplier_id: resolvedSupplierId,
      supplier_name: resolvedSupplierName,
      invoice_no: invoice_no || null,
      purchase_date: purchase_date || new Date().toISOString().slice(0, 10),
      items: processedItems,
      total_amount: totalAmount,
      payment_status: pStatus,
      amount_paid: pAmount,
      payments: payments,
      payment_mode: payment_mode || null,
      created_by: req.user.id,
      created_at: new Date().toISOString(),
    };

    await db.collection("purchases").insertOne(purchaseData, { session });

    // Saved from a draft: the draft is done (same transaction)
    if (req.body.draft_id) {
      await db.collection("purchase_drafts").deleteOne({ id: String(req.body.draft_id), pharmacy_id: req.user.pharmacy_id }, { session });
    }

    await logActivity(
      db,
      req.user.pharmacy_id,
      req.user.id,
      req.user.name,
      "CREATE",
      "PURCHASES",
      purchaseId,
      `Created purchase for ₹${totalAmount}`,
      `/purchases`,
      { session }
    );

    await session.commitTransaction();
    session.endSession();
    res.status(201).json({
      message: "Purchase recorded",
      purchase: purchaseData,
      created_supplier: createdSupplier,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    next(error);
  }
});

// ============ PURCHASE DRAFTS ============
// A purchase kept for review before it touches stock: from the AI chat, the
// scanner, or saved by hand. Same body as POST /api/purchases.
const DRAFT_SOURCES = ["assistant", "scanner", "manual", "reminder"];
const draftTotal = (items = []) =>
  Math.round(
    items.reduce((s, i) => {
      const packs = parseFloat(i.pack_quantity) || 0;
      const rate = parseFloat(i.pack_price) || 0;
      const disc = parseFloat(i.discount) || 0;
      const gst = (parseFloat(i.cgst) || 0) + (parseFloat(i.sgst) || 0);
      return s + packs * rate * (1 - disc / 100) * (1 + gst / 100);
    }, 0) * 100
  ) / 100;
const draftFields = (b) => ({
  supplier_id: b.supplier_id || null,
  supplier_name: b.supplier_name || "",
  supplier_data: b.supplier_data || null,
  invoice_no: b.invoice_no || "",
  purchase_date: b.purchase_date || new Date().toISOString().slice(0, 10),
  payment_status: b.payment_status || "Unpaid",
  amount_paid: b.amount_paid || 0,
  payment_mode: b.payment_mode || null,
  items: Array.isArray(b.items) ? b.items.slice(0, 300) : [],
  note: b.note ? String(b.note).slice(0, 300) : "",
});

// GET /api/purchases/drafts
router.get("/drafts", auth, requireSubscription(), async (req, res, next) => {
  try {
    const drafts = await mongoose.connection.db
      .collection("purchase_drafts")
      .find({ pharmacy_id: req.user.pharmacy_id }, { projection: { _id: 0 } })
      .sort({ updated_at: -1 })
      .limit(200)
      .toArray();
    res.json({ drafts });
  } catch (error) {
    next(error);
  }
});

// POST /api/purchases/drafts {...purchase body, source}
router.post("/drafts", auth, requireSubscription(), async (req, res, next) => {
  try {
    const fields = draftFields(req.body);
    if (!fields.items.length) return res.status(400).json({ detail: "Add at least one item to save a draft" });
    const now = new Date().toISOString();
    const draft = {
      id: uuidv4(),
      draft_no: `PD-${Date.now().toString().slice(-6)}`,
      pharmacy_id: req.user.pharmacy_id,
      source: DRAFT_SOURCES.includes(req.body.source) ? req.body.source : "manual",
      ...fields,
      total: draftTotal(fields.items),
      created_by: req.user.id,
      created_by_name: req.user.name || "",
      created_at: now,
      updated_at: now,
    };
    await mongoose.connection.db.collection("purchase_drafts").insertOne({ ...draft });
    res.status(201).json({ message: "Purchase draft saved", draft });
  } catch (error) {
    next(error);
  }
});

// PUT /api/purchases/drafts/:draft_id
router.put("/drafts/:draft_id", auth, requireSubscription(), async (req, res, next) => {
  try {
    const fields = draftFields(req.body);
    if (!fields.items.length) return res.status(400).json({ detail: "Add at least one item to save a draft" });
    const col = mongoose.connection.db.collection("purchase_drafts");
    const q = { id: req.params.draft_id, pharmacy_id: req.user.pharmacy_id };
    const r = await col.updateOne(q, { $set: { ...fields, total: draftTotal(fields.items), updated_at: new Date().toISOString() } });
    if (!r.matchedCount) return res.status(404).json({ detail: "Draft not found" });
    res.json({ message: "Purchase draft updated", draft: await col.findOne(q, { projection: { _id: 0 } }) });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/purchases/drafts/:draft_id
router.delete("/drafts/:draft_id", auth, requireSubscription(), async (req, res, next) => {
  try {
    const r = await mongoose.connection.db.collection("purchase_drafts").deleteOne({ id: req.params.draft_id, pharmacy_id: req.user.pharmacy_id });
    if (!r.deletedCount) return res.status(404).json({ detail: "Draft not found" });
    res.json({ message: "Purchase draft deleted" });
  } catch (error) {
    next(error);
  }
});

// GET /api/purchases/:purchase_id
router.get(
  "/:purchase_id",
  auth,
  requireSubscription(),
  async (req, res, next) => {
    try {
      const db = mongoose.connection.db;
      const purchase = await db
        .collection("purchases")
        .findOne(
          { id: req.params.purchase_id, pharmacy_id: req.user.pharmacy_id },
          { projection: { _id: 0 } }
        );

      if (!purchase) {
        return res.status(404).json({ detail: "Purchase not found" });
      }

      res.json(purchase);
    } catch (error) {
      next(error);
    }
  }
);

// PUT /api/purchases/:purchase_id
router.put(
  "/:purchase_id",
  auth,
  requireSubscription(),
  async (req, res, next) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const {
        items,
        purchase_date,
        invoice_no,
        supplier_id,
        supplier_name,
        payment_status,
        amount_paid,
        payment_mode,
      } = req.body;
      const db = mongoose.connection.db;

      // Validate payment mode against mandatory settings preference
      const userPrefs = await db
        .collection("user_settings")
        .findOne({ user_id: req.user.id });
      const preferences = userPrefs?.preferences || {};
      const isModeMandatory =
        preferences.purchase_payment_mode_mandatory === true;

      const isPaidOrPartial =
        payment_status === "Paid" || payment_status === "Partial";
      if (
        isModeMandatory &&
        isPaidOrPartial &&
        (!payment_mode || !["Cash", "UPI", "Card"].includes(payment_mode))
      ) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ detail: "Payment mode is mandatory" });
      }

      const purchase = await db.collection("purchases").findOne(
        {
          id: req.params.purchase_id,
          pharmacy_id: req.user.pharmacy_id,
        },
        { session }
      );

      if (!purchase) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ detail: "Purchase not found" });
      }

      if (!Array.isArray(items) || items.length === 0) {
        await session.abortTransaction();
        session.endSession();
        return res
          .status(400)
          .json({ detail: "At least one item is required" });
      }

      const pharmacyId = req.user.pharmacy_id;
      const updateInventory = req.query.update_inventory !== "false";

      // Process new items
      let totalAmount = 0;
      const processedItems = [];

      for (const item of items) {
        const normalizedName = String(item.product_name || "").trim();
        if (!normalizedName) {
          await session.abortTransaction();
          session.endSession();
          return res
            .status(400)
            .json({ detail: "Every item needs a product name" });
        }

        // Prefer the catalog entry the line already points at, then match by name
        const pId =
          item.product_id !== undefined && item.product_id !== null
            ? String(item.product_id).trim()
            : "";
        let matchedProduct = null;
        if (pId && !pId.startsWith("scanned_") && !pId.startsWith("prod-")) {
          matchedProduct = await db.collection("products").findOne(
            {
              pharmacy_id: pharmacyId,
              $or: [{ id: pId }, { product_id: pId }],
            },
            { session }
          );
        }
        if (!matchedProduct) {
          matchedProduct = await db.collection("products").findOne(
            {
              pharmacy_id: pharmacyId,
              name: {
                $regex: new RegExp(
                  "^" + escapeRegex(normalizedName) + "$",
                  "i"
                ),
              },
            },
            { session }
          );
        }

        let resolvedProductId;
        if (matchedProduct) {
          resolvedProductId = matchedProduct.id;
        } else {
          resolvedProductId = uuidv4();
          await db.collection("products").insertOne(
            {
              id: resolvedProductId,
              product_id: resolvedProductId,
              pharmacy_id: pharmacyId,
              name: normalizedName,
              product_name: normalizedName,
              category: item.category || "medicine",
              dosage_form: item.dosage_form || item.pack_type || "tablet",
              manufacturer: item.manufacturer || "",
              salt_composition: item.salt_composition || "",
              pack_type: item.pack_type || "Strip",
              units_per_pack: parseInt(item.units_per_pack) || 1,
              hsn_no: item.hsn_no || "",
              tax_rate:
                (parseFloat(item.cgst) || 0) + (parseFloat(item.sgst) || 0),
              cgst: parseFloat(item.cgst) || 0,
              sgst: parseFloat(item.sgst) || 0,
              mrp:
                (parseFloat(item.mrp_per_unit) || 0) *
                (parseInt(item.units_per_pack) || 1),
              trade_price: parseFloat(item.pack_price) || 0,
              purchase_price: parseFloat(item.pack_price) || 0,
              source: "catalog",
              is_custom_catalog: true,
              low_stock_threshold: 10,
              shortage_threshold:
                item.shortage_threshold !== undefined &&
                item.shortage_threshold !== null &&
                item.shortage_threshold !== ""
                  ? Number(item.shortage_threshold)
                  : 10,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            { session }
          );
          queueGlobalCheck("medicine", pharmacyId, { ...item, id: resolvedProductId, name: normalizedName });
        }

        const packQty =
          parseInt(item.pack_quantity) || parseInt(item.quantity) || 1;
        const unitsPerPack =
          parseInt(item.units_per_pack) || parseInt(item.units) || 1;
        const packPrice =
          parseFloat(item.pack_price) || parseFloat(item.rate_pack) || 0;
        const mrpPerUnit =
          Math.round(
            (parseFloat(item.mrp_per_unit) || parseFloat(item.mrp_unit) || 0) *
              100
          ) / 100;
        const discount = parseFloat(item.discount) || 0;
        const scheme = parseFloat(item.scheme) || 0;

        const totalPacks = packQty + scheme;
        const totalUnits = totalPacks * unitsPerPack;

        const netBasePrice = packQty * packPrice * (1 - discount / 100);
        const cgst = parseFloat(item.cgst) || 0;
        const sgst = parseFloat(item.sgst) || 0;
        const itemTotal = netBasePrice * (1 + (cgst + sgst) / 100);
        totalAmount += itemTotal;

        // True Net Landing Cost per unit (inclusive of GST and net of discounts/scheme)
        const pricePerUnit =
          totalUnits > 0
            ? itemTotal / totalUnits
            : unitsPerPack > 0
              ? (packPrice * (1 - discount / 100) * (1 + (cgst + sgst) / 100)) /
                unitsPerPack
              : 0;

        processedItems.push({
          ...item,
          product_id: resolvedProductId,
          product_name: normalizedName,
          expiry_date:
            normalizeExpiryDate(item.expiry_date) || item.expiry_date || null,
          quantity: totalUnits,
          pack_quantity: packQty,
          scheme: scheme,
          units_per_pack: unitsPerPack,
          pack_price: packPrice,
          mrp: mrpPerUnit,
          mrp_per_unit: mrpPerUnit,
          mrp_pack: mrpPerUnit
            ? Math.round(mrpPerUnit * unitsPerPack * 100) / 100
            : null,
          total_units: totalUnits,
          price_per_unit: Math.round(pricePerUnit * 10000) / 10000,
          purchase_price: Math.round(pricePerUnit * 10000) / 10000,
          cost_per_unit: Math.round(pricePerUnit * 10000) / 10000,
          item_total: itemTotal,
          cgst: cgst,
          sgst: sgst,
          discount: discount,
          shortage_threshold:
            item.shortage_threshold !== undefined &&
            item.shortage_threshold !== null &&
            item.shortage_threshold !== ""
              ? Number(item.shortage_threshold)
              : null,
        });
      }

      if (updateInventory) {
        // Apply only the per-batch difference between the old and new lines,
        // so editing prices, expiry or GST works even after part of the stock
        // has been sold. A batch can't drop below what has already left it.
        const before = await purchaseStockImpact(
          db,
          pharmacyId,
          purchase.items,
          session
        );
        const plan = new Map();
        for (const b of before.batches) {
          plan.set(b.inventory_id, {
            ...b,
            old_units: b.purchased,
            new_units: 0,
            line: null,
          });
        }
        const inserts = new Map();
        for (const line of processedItems) {
          const inv = await findBatch(db, pharmacyId, line, session);
          if (inv) {
            const p = plan.get(inv.id) || {
              inventory_id: inv.id,
              product_name: inv.product_name || line.product_name,
              batch_no: inv.batch_no,
              on_hand: Math.max(0, Number(inv.available_quantity) || 0),
              old_units: 0,
              new_units: 0,
            };
            p.new_units += line.total_units;
            p.line = line;
            plan.set(inv.id, p);
          } else {
            const key = `${line.product_id}::${line.batch_no}`;
            const ins = inserts.get(key) || { units: 0 };
            ins.units += line.total_units;
            ins.line = line;
            inserts.set(key, ins);
          }
        }

        const conflicts = [];
        for (const p of plan.values()) {
          const delta = p.new_units - p.old_units;
          if (delta < 0 && p.on_hand + delta < 0) {
            const used = p.old_units - p.on_hand;
            conflicts.push({
              product_name: p.product_name,
              batch_no: p.batch_no,
              purchased: p.old_units,
              on_hand: p.on_hand,
              consumed: used,
              min_units: used,
              requested: p.new_units,
            });
          }
        }
        if (conflicts.length > 0) {
          await session.abortTransaction();
          session.endSession();
          const c = conflicts[0];
          const detail =
            c.requested === 0
              ? `${c.product_name} (batch ${c.batch_no}) can't be removed: ${c.consumed} of ${c.purchased} units from this purchase are already sold.`
              : `${c.product_name} (batch ${c.batch_no}): ${c.consumed} of ${c.purchased} units are already sold, so quantity can't go below ${c.min_units} units.`;
          return res
            .status(409)
            .json({ code: "STOCK_CONSUMED", detail, conflicts });
        }

        const batchFields = (line) => {
          const set = {
            purchase_price: line.purchase_price,
            mrp: line.mrp_per_unit,
            mrp_pack: line.mrp_pack,
            pack_price: line.pack_price,
            units_per_pack: line.units_per_pack,
            cgst: line.cgst,
            sgst: line.sgst,
            discount: line.discount,
            scheme: line.scheme,
            updated_at: new Date().toISOString(),
          };
          if (line.expiry_date) set.expiry_date = line.expiry_date;
          if (line.pack_type) set.pack_type = line.pack_type;
          if (line.hsn_no) set.hsn_no = line.hsn_no;
          if (
            line.shortage_threshold !== null &&
            line.shortage_threshold !== undefined
          )
            set.shortage_threshold = line.shortage_threshold;
          return set;
        };

        for (const [invId, p] of plan) {
          const delta = p.new_units - p.old_units;
          const update = {};
          if (delta !== 0)
            update.$inc = { quantity: delta, available_quantity: delta };
          if (p.line) update.$set = batchFields(p.line);
          if (update.$inc || update.$set) {
            await db
              .collection("inventory")
              .updateOne({ id: invId, pharmacy_id: pharmacyId }, update, {
                session,
              });
          }
        }

        const lineSupplierId =
          supplier_id !== undefined ? supplier_id : purchase.supplier_id;
        for (const { line, units } of inserts.values()) {
          await db.collection("inventory").insertOne(
            {
              id: uuidv4(),
              pharmacy_id: pharmacyId,
              product_id: line.product_id,
              product_name: line.product_name,
              batch_no: line.batch_no,
              hsn_no: line.hsn_no || null,
              manufacturer: line.manufacturer || null,
              salt_composition: line.salt_composition || null,
              pack_type: line.pack_type || "Strip",
              quantity: units,
              available_quantity: units,
              pack_quantity: line.pack_quantity,
              supplier_id: lineSupplierId || null,
              ...batchFields(line),
              expiry_date: line.expiry_date || null,
              shortage_threshold: line.shortage_threshold,
              purchase_id: req.params.purchase_id,
              created_at: new Date().toISOString(),
            },
            { session }
          );
        }
      }

      const finalStatus =
        payment_status !== undefined
          ? payment_status
          : purchase.payment_status || "Unpaid";
      let finalAmountPaid = purchase.amount_paid || 0;
      if (payment_status !== undefined) {
        finalAmountPaid =
          amount_paid !== undefined ? parseFloat(amount_paid) : finalAmountPaid;
      }
      if (finalStatus === "Paid") {
        finalAmountPaid = totalAmount;
      } else if (finalStatus === "Unpaid") {
        finalAmountPaid = 0;
      } else if (finalStatus === "Partial") {
        if (isNaN(finalAmountPaid) || finalAmountPaid <= 0) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({
            detail: "Initial paid amount is mandatory for Partial payment",
          });
        }
        if (finalAmountPaid > round2(totalAmount) + 0.005) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({
            detail: `Paid amount ₹${finalAmountPaid.toFixed(2)} is more than the purchase total ₹${totalAmount.toFixed(2)}. Choose Paid for the full amount.`,
          });
        }
      }

      // Return-note links live on the stored lines; the edit form doesn't send them
      for (const item of processedItems) {
        const old = (purchase.items || []).find(
          (o) =>
            o.return_refs?.length &&
            o.batch_no === item.batch_no &&
            (o.product_id === item.product_id ||
              String(o.product_name || "").toLowerCase() === String(item.product_name || "").toLowerCase())
        );
        if (!old) continue;
        for (const k of ["return_refs", "returned_units", "return_bundle_no", "returned_at", "status"]) {
          if (old[k] !== undefined) item[k] = old[k];
        }
      }

      const updatePayload = {
        items: processedItems,
        total_amount: totalAmount,
        purchase_date: purchase_date || purchase.purchase_date,
        invoice_no: invoice_no || purchase.invoice_no,
        payment_status: finalStatus,
        amount_paid: finalAmountPaid,
        payment_mode: payment_mode || null,
        updated_at: new Date().toISOString(),
      };

      let finalSupplierId =
        supplier_id !== undefined ? supplier_id : purchase.supplier_id;
      let finalSupplierName = supplier_name;
      if (!finalSupplierName || finalSupplierName === "Unknown") {
        if (finalSupplierId) {
          const s = await db
            .collection("suppliers")
            .findOne({ id: finalSupplierId });
          if (s && s.name) finalSupplierName = s.name;
        }
        if (!finalSupplierName || finalSupplierName === "Unknown") {
          finalSupplierName =
            purchase.supplier_name && purchase.supplier_name !== "Unknown"
              ? purchase.supplier_name
              : "Unknown";
        }
      }

      if (finalSupplierId !== undefined)
        updatePayload.supplier_id = finalSupplierId;
      if (finalSupplierName !== undefined)
        updatePayload.supplier_name = finalSupplierName;

      // Calculate Edit History Changes
      const changes = [];
      const compareField = (fieldName, label, formatter = (v) => v) => {
        const oldVal = purchase[fieldName];
        const newVal = updatePayload[fieldName];
        const normalizedOld =
          oldVal === undefined || oldVal === null ? "" : oldVal;
        const normalizedNew =
          newVal === undefined || newVal === null ? "" : newVal;
        if (normalizedOld !== normalizedNew) {
          changes.push({
            field: fieldName,
            old_value: formatter(oldVal),
            new_value: formatter(newVal),
            description: `Changed ${label} from "${formatter(oldVal) || "none"}" to "${formatter(newVal) || "none"}"`,
          });
        }
      };

      compareField("supplier_name", "Supplier Name");
      compareField("invoice_no", "Invoice Number");
      compareField("purchase_date", "Purchase Date", (v) =>
        v ? new Date(v).toLocaleDateString() : ""
      );
      compareField("payment_status", "Payment Status");
      compareField("amount_paid", "Amount Paid", (v) =>
        v !== undefined && v !== null ? `₹${Number(v).toFixed(2)}` : "₹0.00"
      );
      compareField("payment_mode", "Payment Mode");
      compareField("total_amount", "Total Amount", (v) =>
        v !== undefined && v !== null ? `₹${Number(v).toFixed(2)}` : "₹0.00"
      );

      // Items Comparison
      const oldItemsMap = {};
      const oldCounts = {};
      (purchase.items || []).forEach((item) => {
        const pId = item.product_id || item.product_name;
        oldCounts[pId] = (oldCounts[pId] || 0) + 1;
        const key = `${pId}_${oldCounts[pId]}`;
        oldItemsMap[key] = item;
      });

      const newItemsMap = {};
      const newCounts = {};
      processedItems.forEach((item) => {
        const pId = item.product_id || item.product_name;
        newCounts[pId] = (newCounts[pId] || 0) + 1;
        const key = `${pId}_${newCounts[pId]}`;
        newItemsMap[key] = item;
      });

      const itemChanges = [];
      processedItems.forEach((item) => {
        const pId = item.product_id || item.product_name;
        const count = newCounts[pId] || 0;
        const key = `${pId}_${count}`;
        const oldItem = oldItemsMap[key];

        if (!oldItem) {
          itemChanges.push(
            `Added item ${item.product_name} (Qty: ${item.total_units || item.quantity})`
          );
        } else {
          const changesList = [];

          const checkItemField = (
            oldField,
            newField,
            label,
            formatter = (v) => v
          ) => {
            const oldVal = oldItem[oldField];
            const newVal = item[newField];
            const normalizedOld =
              oldVal === undefined || oldVal === null
                ? ""
                : String(oldVal).trim();
            const normalizedNew =
              newVal === undefined || newVal === null
                ? ""
                : String(newVal).trim();
            if (normalizedOld !== normalizedNew) {
              changesList.push(
                `${label}: ${formatter(oldVal) || "none"} -> ${formatter(newVal) || "none"}`
              );
            }
          };

          const oldQty =
            oldItem.total_units !== undefined
              ? oldItem.total_units
              : oldItem.quantity;
          const newQty =
            item.total_units !== undefined ? item.total_units : item.quantity;
          if (parseInt(oldQty) !== parseInt(newQty)) {
            changesList.push(`Qty: ${oldQty} -> ${newQty}`);
          }

          checkItemField("batch_no", "batch_no", "Batch");
          checkItemField("hsn_no", "hsn_no", "HSN");
          checkItemField("expiry_date", "expiry_date", "Expiry");
          checkItemField("cgst", "cgst", "CGST", (v) => `${v}%`);
          checkItemField("sgst", "sgst", "SGST", (v) => `${v}%`);
          checkItemField("discount", "discount", "Discount", (v) => `${v}%`);
          checkItemField("scheme", "scheme", "Scheme");
          checkItemField(
            "shortage_threshold",
            "shortage_threshold",
            "Shortage Threshold"
          );

          const oldPrice = oldItem.purchase_price || oldItem.pack_price || 0;
          const newPrice = item.purchase_price || item.pack_price || 0;
          if (
            parseFloat(oldPrice).toFixed(2) !== parseFloat(newPrice).toFixed(2)
          ) {
            changesList.push(
              `Price: ₹${parseFloat(oldPrice).toFixed(2)} -> ₹${parseFloat(newPrice).toFixed(2)}`
            );
          }

          const oldMrp = oldItem.mrp || oldItem.mrp_per_unit || 0;
          const newMrp = item.mrp || item.mrp_per_unit || 0;
          if (parseFloat(oldMrp).toFixed(2) !== parseFloat(newMrp).toFixed(2)) {
            changesList.push(
              `MRP: ₹${parseFloat(oldMrp).toFixed(2)} -> ₹${parseFloat(newMrp).toFixed(2)}`
            );
          }

          if (changesList.length > 0) {
            itemChanges.push(
              `Updated item ${item.product_name} (${changesList.join(", ")})`
            );
          }
        }
      });

      (purchase.items || []).forEach((item) => {
        const pId = item.product_id || item.product_name;
        const key = `${pId}_${oldCounts[pId] || 1}`;
        if (!newItemsMap[key]) {
          itemChanges.push(`Removed item ${item.product_name}`);
        }
      });

      if (itemChanges.length > 0) {
        changes.push({
          field: "items",
          description: itemChanges.join("; "),
        });
      }

      if (changes.length > 0) {
        const historyEntry = {
          updated_at: new Date().toISOString(),
          updated_by_id: req.user.id,
          updated_by_name: req.user.name,
          updated_by_avatar: req.user.image_url || null,
          changes: changes,
        };
        updatePayload.history = [...(purchase.history || []), historyEntry];
      }

      await db
        .collection("purchases")
        .updateOne(
          { id: req.params.purchase_id },
          { $set: updatePayload },
          { session }
        );

      await logActivity(
        db,
        req.user.pharmacy_id,
        req.user.id,
        req.user.name,
        "UPDATE",
        "PURCHASES",
        req.params.purchase_id,
        `Updated purchase`,
        `/purchases`,
        { session }
      );

      await session.commitTransaction();
      session.endSession();

      const updated = await db
        .collection("purchases")
        .findOne({ id: req.params.purchase_id }, { projection: { _id: 0 } });

      res.json({ message: "Purchase updated", purchase: updated });
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      next(error);
    }
  }
);

// GET /api/purchases/:purchase_id/stock-impact
// What deleting this purchase would do to stock: per batch, units purchased,
// still on the shelf, and already sold.
router.get(
  "/:purchase_id/stock-impact",
  auth,
  requireSubscription(),
  async (req, res, next) => {
    try {
      const db = mongoose.connection.db;
      const purchase = await db
        .collection("purchases")
        .findOne(
          { id: req.params.purchase_id, pharmacy_id: req.user.pharmacy_id },
          { projection: { _id: 0, items: 1 } }
        );
      if (!purchase)
        return res.status(404).json({ detail: "Purchase not found" });
      res.json(
        publicImpact(
          await purchaseStockImpact(db, req.user.pharmacy_id, purchase.items)
        )
      );
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /api/purchases/:purchase_id
router.delete(
  "/:purchase_id",
  auth,
  requireSubscription(),
  async (req, res, next) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const db = mongoose.connection.db;
      // "true": take back all of this purchase's stock (refused if some was
      // already sold), "unsold": take back only what is still on the shelf,
      // "false": delete the record and leave inventory as it is.
      const mode =
        req.query.delete_inventory === "unsold"
          ? "unsold"
          : req.query.delete_inventory === "false"
            ? "keep"
            : "all";

      const purchase = await db.collection("purchases").findOne(
        {
          id: req.params.purchase_id,
          pharmacy_id: req.user.pharmacy_id,
        },
        { session }
      );

      if (!purchase) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ detail: "Purchase not found" });
      }

      let removedUnits = 0;
      let adjustedBatches = 0;
      if (mode !== "keep") {
        const impact = await purchaseStockImpact(
          db,
          req.user.pharmacy_id,
          purchase.items,
          session
        );
        if (mode === "all" && impact.consumed) {
          await session.abortTransaction();
          session.endSession();
          const sold = impact.batches.filter((b) => b.consumed > 0);
          return res.status(409).json({
            code: "STOCK_CONSUMED",
            detail: `Some stock from this purchase is already sold (${sold.map((b) => `${b.product_name}: ${b.consumed} units`).join(", ")}). Remove only the unsold stock, or keep the stock and delete the record.`,
            impact: publicImpact(impact),
          });
        }
        for (const b of impact.batches) {
          const units = mode === "unsold" ? b.removable : b.purchased;
          if (units <= 0) continue;
          await db.collection("inventory").updateOne(
            { id: b.inventory_id, pharmacy_id: req.user.pharmacy_id },
            {
              $inc: { quantity: -units, available_quantity: -units },
              $set: { updated_at: new Date().toISOString() },
            },
            { session }
          );
          removedUnits += units;
          adjustedBatches += 1;
        }
      }

      await db
        .collection("purchases")
        .deleteOne({ id: req.params.purchase_id }, { session });

      await logActivity(
        db,
        req.user.pharmacy_id,
        req.user.id,
        req.user.name,
        "DELETE",
        "PURCHASES",
        req.params.purchase_id,
        `Deleted purchase`,
        `/purchases`,
        { session }
      );

      await session.commitTransaction();
      session.endSession();
      res.json({
        message: "Purchase deleted",
        deleted_inventory_items: adjustedBatches,
        removed_units: removedUnits,
      });
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      next(error);
    }
  }
);

// POST /api/purchases/:purchase_id/labels {lines: [{line, copies}], layout?, skip?}
// Mini QR labels for the purchase's items (PDF to print and stick on packs)
router.post("/:purchase_id/labels", auth, requireSubscription(), async (req, res, next) => {
  try {
    const { labelsPdf, LAYOUTS } = require("../services/itemLabels");
    const { findBatch } = require("../services/stock");
    const db = mongoose.connection.db;
    const purchase = await db.collection("purchases").findOne({ id: req.params.purchase_id, pharmacy_id: req.user.pharmacy_id }, { projection: { _id: 0, items: 1, invoice_no: 1 } });
    if (!purchase) return res.status(404).json({ detail: "Purchase not found" });
    const layout = LAYOUTS[req.body?.layout] ? req.body.layout : "a4_65";
    const asked = Array.isArray(req.body?.lines) ? req.body.lines : [];
    if (!asked.length) return res.status(400).json({ detail: "Choose at least one item" });
    let total = 0;
    const lines = [];
    for (const a of asked.slice(0, 200)) {
      const item = purchase.items?.[Number(a.line)];
      const copies = Math.min(500, Math.max(0, parseInt(a.copies, 10) || 0));
      if (!item || !copies) continue;
      const batch = await findBatch(db, req.user.pharmacy_id, item);
      if (!batch) return res.status(400).json({ detail: `${item.product_name} (${item.batch_no || "no batch"}) is not in stock any more, so it can't get a label` });
      lines.push({ batch, copies });
      total += copies;
    }
    if (!lines.length) return res.status(400).json({ detail: "Set how many labels to print" });
    if (total > 2000) return res.status(400).json({ detail: "That's more than 2,000 labels. Print them in parts." });
    const pharmacy = await db.collection("pharmacies").findOne({ id: req.user.pharmacy_id }, { projection: { _id: 0, name: 1 } });
    const pdf = await labelsPdf({ lines, layout, skip: Math.max(0, parseInt(req.body?.skip, 10) || 0), pharmacyName: pharmacy?.name || "" });
    res.set("Content-Type", "application/pdf");
    res.set("Content-Disposition", `inline; filename="labels-${String(purchase.invoice_no || req.params.purchase_id).replace(/[^A-Za-z0-9_-]/g, "")}.pdf"`);
    res.set("Cache-Control", "private, no-store");
    res.send(pdf);
  } catch (error) {
    next(error);
  }
});

// POST /api/purchases/:purchase_id/pdf
router.post(
  "/:purchase_id/pdf",
  auth,
  requireSubscription(),
  async (req, res, next) => {
    try {
      const db = mongoose.connection.db;

      const purchase = await db.collection("purchases").findOne({
        id: req.params.purchase_id,
        pharmacy_id: req.user.pharmacy_id,
      });

      if (!purchase) {
        return res.status(404).json({ detail: "Purchase not found" });
      }

      const pharmacy = await db
        .collection("pharmacies")
        .findOne({ id: req.user.pharmacy_id }, { projection: { _id: 0 } });

      const pdfBuffer = await generatePurchasePDF(purchase, pharmacy);

      const key = `purchases/${req.user.pharmacy_id}/${purchase.invoice_no || purchase.id}.pdf`;

      const pdfUrl = await uploadToR2(key, pdfBuffer, "application/pdf");

      res.json({ pdf_url: pdfUrl });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/purchases/scan-status/:jobId[?wait=1] - long-polls until the scan finishes
router.get("/scan-status/:jobId", auth, scanStatus);

// POST /api/purchases/scan-image - read product pack photos (queued)
router.post(
  "/scan-image",
  auth,
  requireSubscription(),
  acceptImages(6),
  enqueueScan("product")
);

// POST /api/purchases/scan-bill - read supplier invoice pages (queued)
router.post(
  "/scan-bill",
  auth,
  requireSubscription(),
  acceptImages(10),
  enqueueScan("bill")
);

// Helper for parsing CSV lines with quote support and delimiter detection
function parseCSVRow(line, delimiter = ",") {
  const result = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === delimiter && !inQuotes) {
      result.push(cur.trim());
      cur = "";
    } else {
      cur += c;
    }
  }
  result.push(cur.trim());
  return result;
}

function detectCSVDelimiter(firstLine) {
  if (firstLine.includes("\t")) return "\t";
  if (firstLine.includes(";")) return ";";
  return ",";
}

const handleParseCsvUpload = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ detail: "No CSV file provided" });
    }

    const db = mongoose.connection.db;
    const fileBuffer = fs.readFileSync(req.file.path);
    const content = fileBuffer.toString("utf-8");
    const lines = content.split(/\r?\n/).filter((l) => l.trim());

    if (lines.length < 2) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (e) {}
      return res.status(400).json({
        detail: "CSV file must contain a header row and at least 1 data row",
      });
    }

    // Upload to Cloudflare R2
    const r2Key = `csv-imports/${req.user.pharmacy_id}/${Date.now()}-${uuidv4()}-${req.file.originalname}`;
    let r2Url = null;
    try {
      r2Url = await uploadToR2(
        r2Key,
        fileBuffer,
        req.file.mimetype || "text/csv"
      );
    } catch (r2Err) {
      console.error("R2 Upload failed for CSV:", r2Err);
    }

    // Cleanup local temp file
    try {
      fs.unlinkSync(req.file.path);
    } catch (e) {}

    const delimiter = detectCSVDelimiter(lines[0]);
    const headers = parseCSVRow(lines[0], delimiter).map((h) =>
      h.replace(/^["']|["']$/g, "").trim()
    );

    const sampleRows = lines.slice(1, 11).map((line) => {
      const values = parseCSVRow(line, delimiter).map((v) =>
        v.replace(/^["']|["']$/g, "").trim()
      );
      const row = {};
      headers.forEach((h, i) => {
        if (h) row[h] = values[i] !== undefined ? values[i] : "";
      });
      return row;
    });

    const parsedAllRows = lines.slice(1).map((line) => {
      const values = parseCSVRow(line, delimiter).map((v) =>
        v.replace(/^["']|["']$/g, "").trim()
      );
      const row = {};
      headers.forEach((h, i) => {
        if (h) row[h] = values[i] !== undefined ? values[i] : "";
      });
      return row;
    });

    // Supplier Template Check if supplier_id is provided
    let templateMatch = {
      matched: false,
      missing_fields: [],
      mapped_fields: null,
    };
    const supplierId = req.body.supplier_id || req.query.supplier_id;

    if (supplierId) {
      const supplier = await db.collection("suppliers").findOne({
        id: supplierId,
        pharmacy_id: req.user.pharmacy_id,
      });

      if (
        supplier &&
        supplier.csv_template &&
        supplier.csv_template.mapped_fields
      ) {
        const savedMap = supplier.csv_template.mapped_fields;
        const missing = [];
        const normalizedHeaders = new Set(headers.map((h) => h.toLowerCase()));

        Object.entries(savedMap).forEach(([targetField, csvCol]) => {
          if (
            csvCol &&
            csvCol !== "none" &&
            !normalizedHeaders.has(csvCol.toLowerCase())
          ) {
            missing.push({ field: targetField, csv_col: csvCol });
          }
        });

        templateMatch = {
          matched: missing.length === 0,
          mapped_fields: savedMap,
          missing_fields: missing,
        };
      }
    }

    res.json({
      success: true,
      r2_key: r2Key,
      r2_url: r2Url,
      columns: headers,
      sample_data: sampleRows,
      parsed_rows: parsedAllRows,
      total_rows: parsedAllRows.length,
      supplier_template: templateMatch,
    });
  } catch (error) {
    next(error);
  }
};

// Map all CSV parse endpoints for backward & forward compatibility
router.post(
  "/parse-csv",
  auth,
  requireSubscription(),
  upload.single("file"),
  handleParseCsvUpload
);
router.post(
  "/csv-columns",
  auth,
  requireSubscription(),
  upload.single("file"),
  handleParseCsvUpload
);
router.post(
  "/csv",
  auth,
  requireSubscription(),
  upload.single("file"),
  handleParseCsvUpload
);

// POST /api/purchases/bulk-import
router.post(
  "/bulk-import",
  auth,
  requireSubscription(),
  async (req, res, next) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const { supplier_id, supplier_name, invoice_no, items } = req.body;
      const db = mongoose.connection.db;

      if (!items || items.length === 0) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ detail: "No items provided" });
      }

      const purchaseId = uuidv4();
      let totalAmount = 0;
      const processedItems = [];

      for (const item of items) {
        const packQty =
          parseInt(item.pack_quantity) || parseInt(item.quantity) || 1;
        const scheme = parseFloat(item.scheme) || 0;
        const unitsPerPack = parseInt(item.units_per_pack) || 1;
        const packPrice =
          parseFloat(item.pack_price) ||
          parseFloat(item.rate_pack) ||
          parseFloat(item.purchase_price) ||
          0;
        const mrpPack = parseFloat(item.mrp_pack) || parseFloat(item.mrp) || 0;
        const discount = parseFloat(item.discount) || 0;

        const totalPacks = packQty + scheme;
        const totalUnits = totalPacks * unitsPerPack;
        const cgst = parseFloat(item.cgst) || 0;
        const sgst = parseFloat(item.sgst) || 0;
        const netBasePrice = packQty * packPrice * (1 - discount / 100);
        const itemTotal = netBasePrice * (1 + (cgst + sgst) / 100);
        totalAmount += itemTotal;
        const pricePerUnit =
          totalUnits > 0
            ? itemTotal / totalUnits
            : unitsPerPack > 0
              ? (packPrice * (1 - discount / 100) * (1 + (cgst + sgst) / 100)) /
                unitsPerPack
              : packPrice;
        const mrpPerUnit = unitsPerPack > 0 ? mrpPack / unitsPerPack : mrpPack;

        const processedItem = {
          product_id: item.product_id || `csv-${uuidv4().slice(0, 8)}`,
          product_name: item.product_name,
          manufacturer: item.manufacturer || null,
          salt_composition: item.salt_composition || null,
          pack_type: item.pack_type || "Strip",
          batch_no: item.batch_no || `BATCH-${Date.now()}`,
          hsn_no: item.hsn_no || null,
          expiry_date:
            normalizeExpiryDate(item.expiry_date) ||
            new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
              .toISOString()
              .split("T")[0],
          pack_quantity: packQty,
          scheme: scheme,
          units_per_pack: unitsPerPack,
          total_units: totalUnits,
          pack_price: packPrice,
          price_per_unit: Math.round(pricePerUnit * 10000) / 10000,
          purchase_price: Math.round(pricePerUnit * 10000) / 10000,
          cost_per_unit: Math.round(pricePerUnit * 10000) / 10000,
          mrp_pack: mrpPack,
          mrp_per_unit: mrpPerUnit,
          item_total: itemTotal,
        };

        processedItems.push(processedItem);

        const existingInventory = await db.collection("inventory").findOne(
          {
            pharmacy_id: req.user.pharmacy_id,
            product_name: item.product_name,
            batch_no: processedItem.batch_no,
          },
          { session }
        );

        if (existingInventory) {
          await db.collection("inventory").updateOne(
            { id: existingInventory.id },
            {
              $inc: { quantity: totalUnits, available_quantity: totalUnits },
              $set: {
                purchase_price: pricePerUnit,
                mrp: mrpPerUnit,
                units_per_pack: unitsPerPack,
                pack_type: item.pack_type || "Strip",
                pack_price: packPrice,
                mrp_pack: mrpPack,
              },
            },
            { session }
          );
        } else {
          await db.collection("inventory").insertOne(
            {
              id: uuidv4(),
              pharmacy_id: req.user.pharmacy_id,
              product_id: processedItem.product_id,
              product_name: item.product_name,
              batch_no: processedItem.batch_no,
              expiry_date: processedItem.expiry_date,
              quantity: totalUnits,
              available_quantity: totalUnits,
              units_per_pack: unitsPerPack,
              purchase_price: pricePerUnit,
              mrp: mrpPerUnit,
              pack_price: packPrice,
              mrp_pack: mrpPack,
              purchase_id: purchaseId,
              supplier_id: supplier_id,
              created_at: new Date().toISOString(),
            },
            { session }
          );
        }
      }

      const purchaseData = {
        id: purchaseId,
        pharmacy_id: req.user.pharmacy_id,
        supplier_id,
        supplier_name: supplier_name || "CSV Import",
        invoice_no: invoice_no || `CSV-${Date.now()}`,
        items: processedItems,
        total_amount: totalAmount,
        created_by: req.user.id,
        created_at: new Date().toISOString(),
      };

      await db.collection("purchases").insertOne(purchaseData, { session });
      await session.commitTransaction();
      session.endSession();

      res.json({
        message: `Imported ${processedItems.length} items successfully`,
        purchase_id: purchaseId,
        total_amount: totalAmount,
      });
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      next(error);
    }
  }
);

// POST /api/purchases/:purchase_id/payments
router.post(
  "/:purchase_id/payments",
  auth,
  requireSubscription(),
  async (req, res, next) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const { amount, date, notes, payment_mode } = req.body;
      const db = mongoose.connection.db;

      if (!amount || amount <= 0) {
        await session.abortTransaction();
        session.endSession();
        return res
          .status(400)
          .json({ detail: "Payment amount must be greater than 0" });
      }

      const purchase = await db.collection("purchases").findOne({
        id: req.params.purchase_id,
        pharmacy_id: req.user.pharmacy_id,
      });

      if (!purchase) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ detail: "Purchase not found" });
      }

      const paymentAmount = round2(parseFloat(amount));
      const total = round2(purchase.total_amount);
      const remaining = round2(Math.max(0, total - (purchase.amount_paid || 0)));
      if (remaining <= 0) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ detail: "This purchase is already fully paid" });
      }
      if (paymentAmount > remaining) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          detail: `Only ₹${remaining.toFixed(2)} is left to pay on this purchase (₹${total.toFixed(2)} total, ₹${round2(purchase.amount_paid || 0).toFixed(2)} paid). Enter ₹${remaining.toFixed(2)} or less.`,
          remaining,
        });
      }
      const newAmountPaid = round2((purchase.amount_paid || 0) + paymentAmount);
      let newStatus = "Partial";

      if (newAmountPaid >= total) {
        newStatus = "Paid";
      }

      const newPayment = {
        id: uuidv4(),
        amount: paymentAmount,
        date: date || new Date().toISOString(),
        notes: notes || "Partial Payment",
        payment_mode: payment_mode || "UPI",
      };

      await db.collection("purchases").updateOne(
        { id: req.params.purchase_id },
        {
          $push: { payments: newPayment },
          $set: {
            amount_paid: newAmountPaid,
            payment_status: newStatus,
            payment_mode: payment_mode || purchase.payment_mode || "UPI",
            updated_at: new Date().toISOString(),
          },
        },
        { session }
      );

      await logActivity(
        db,
        req.user.pharmacy_id,
        req.user.id,
        req.user.name,
        "UPDATE",
        "PURCHASES",
        req.params.purchase_id,
        `Added payment of ₹${paymentAmount}`,
        `/purchases`,
        { session }
      );

      await session.commitTransaction();
      session.endSession();

      res.status(200).json({
        message: "Payment added successfully",
        payment_status: newStatus,
        amount_paid: newAmountPaid,
        payment: newPayment,
      });
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      next(error);
    }
  }
);

module.exports = router;
