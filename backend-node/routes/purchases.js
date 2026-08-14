const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");
const axios = require("axios");
const multer = require("multer");
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");
const rateLimit = require("express-rate-limit");
const { auth } = require("../middleware/auth");
const { normalizeName } = require("../utils/helpers");
const { generatePurchasePDF } = require("../services/pdf");
const { uploadToR2, deleteFromR2 } = require("../services/r2");
const { logActivity } = require("../utils/activityLogger");
const { requireSubscription } = require("../middleware/subscription");

const ScanJob = require("../models/scanJob");
const { scanQueue } = require("../services/ai/queue");
const { compressImage } = require("../services/ai/image_processor");

const pythonPath = process.env.PYTHON_PATH || "python3";

// Rate limiter for scanning endpoints
const scanRateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 20, // 20 requests per user
  message: { detail: "Too many scan requests. Please try again in 5 minutes." },
  keyGenerator: (req) => req.user.id, // Limit per user
});

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
    if (allowedTypes.includes(file.mimetype) || ext === ".csv" || ext === ".txt") {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Only PNG, JPEG, WebP, and CSV files are allowed."));
    }
  },
});

// POST /api/purchases/match-suggestions - Smart matching against inventory & products
router.post(
  "/match-suggestions",
  auth,
  requireSubscription(),
  async (req, res, next) => {
    try {
      const db = mongoose.connection.db;
      const { items } = req.body;

      if (!items || !Array.isArray(items)) {
        return res.json({ success: true, matches: [] });
      }

      // Query both inventory AND products collections for maximum recall
      const allInventoryItems = await db
        .collection("inventory")
        .find({ pharmacy_id: req.user.pharmacy_id })
        .toArray();

      const allProductItems = await db
        .collection("products")
        .find({ pharmacy_id: req.user.pharmacy_id })
        .toArray();

      // Build unified catalog map indexed by product_id and product_name
      const catalogMap = new Map();

      for (const p of allProductItems) {
        if (p.name) {
          const pName = p.name.trim();
          const pId = p.id || p._id.toString();
          catalogMap.set(pId, {
            product_id: pId,
            product_name: pName,
            manufacturer: p.manufacturer || "",
            batches: [],
          });
        }
      }

      for (const inv of allInventoryItems) {
        if (inv.product_name) {
          const invName = inv.product_name.trim();
          const invId = inv.product_id || inv.id || inv._id.toString();
          const existing = catalogMap.get(invId) || {
            product_id: invId,
            product_name: invName,
            manufacturer: inv.manufacturer || "",
            batches: [],
          };
          if (inv.batch_no) {
            existing.batches.push(inv.batch_no.trim());
          }
          catalogMap.set(invId, existing);
        }
      }

      const catalogList = Array.from(catalogMap.values());

      const cleanAlphanumeric = (str) =>
        (str || "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase().replace(/^0+/, "");

      const COMMON_DOSAGE_WORDS = new Set([
        "ds", "cap", "capsule", "capsules", "tab", "tablet", "tablets",
        "syp", "syrup", "dry", "inj", "injection", "gel", "cream",
        "ointment", "suspension", "solution", "drops", "lotion", "mg", "ml", "gm", "g", "100mg", "200mg", "500mg", "650mg"
      ]);

      const getBrandCoreTokens = (name) => {
        return (name || "")
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, " ")
          .split(/\s+/)
          .filter((t) => t.length > 0 && !COMMON_DOSAGE_WORDS.has(t));
      };

      const matches = items.map((item) => {
        const scannedName = (item.product_name || "").trim();
        const scannedBatch = (item.batch_no || "").trim();
        const cleanScannedBatch = cleanAlphanumeric(scannedBatch);

        let batchMatch = null;
        let exactNameMatch = null;
        const rawSuggestions = [];

        // 1. Batch Match (Highest priority - strict exact batch matching)
        if (cleanScannedBatch && cleanScannedBatch.length >= 2) {
          const foundInv = allInventoryItems.find((inv) => {
            const cleanInvBatch = cleanAlphanumeric(inv.batch_no);
            if (!cleanInvBatch || cleanInvBatch.length < 2) return false;

            // Exact match after normalization (e.g. "b525" === "b525" or "00.b525" === "b525")
            if (cleanInvBatch === cleanScannedBatch) return true;

            // Direct case-insensitive raw batch match
            const rawInvBatch = (inv.batch_no || "").trim().toLowerCase();
            const rawScannedBatch = scannedBatch.toLowerCase();
            if (rawInvBatch && rawScannedBatch && rawInvBatch === rawScannedBatch) return true;

            return false;
          });

          if (foundInv) {
            batchMatch = {
              product_id: foundInv.product_id || foundInv.id,
              product_name: foundInv.product_name,
              batch_no: foundInv.batch_no,
              type: "batch_exact",
            };
          }
        }

        // 2. Name Match & Brand Core Similarity Scoring
        if (scannedName) {
          const normScannedName = scannedName.toLowerCase();
          const scannedBrandTokens = getBrandCoreTokens(scannedName);

          catalogList.forEach((prod) => {
            if (!prod.product_name) return;
            const normProdName = prod.product_name.toLowerCase();
            const prodBrandTokens = getBrandCoreTokens(prod.product_name);

            let score = 0;
            let isHighConfidence = false;

            if (normProdName === normScannedName) {
              score = 100;
              isHighConfidence = true;
              exactNameMatch = {
                product_id: prod.product_id,
                product_name: prod.product_name,
                type: "name_exact",
              };
            } else if (normProdName.includes(normScannedName) || normScannedName.includes(normProdName)) {
              score = 90;
              isHighConfidence = true;
            } else {
              // Strict Brand Core Token Match (excluding generic words like DS, SYRUP, CAP)
              if (scannedBrandTokens.length > 0 && prodBrandTokens.length > 0) {
                let brandMatchCount = 0;
                scannedBrandTokens.forEach((tok) => {
                  if (prodBrandTokens.includes(tok)) brandMatchCount++;
                });

                const matchRatio = brandMatchCount / scannedBrandTokens.length;

                if (brandMatchCount > 0 && matchRatio >= 0.5) {
                  score = Math.round(50 + matchRatio * 40);
                  if (matchRatio >= 0.75) {
                    isHighConfidence = true;
                  }
                }
              }
            }

            if (score >= 40) {
              rawSuggestions.push({
                product_id: prod.product_id,
                product_name: prod.product_name,
                score: Math.round(score),
                is_high_confidence: isHighConfidence,
              });
            }
          });
        }

        // 3. Ensure Batch Match is at position #1 in suggestions
        if (batchMatch) {
          rawSuggestions.unshift({
            product_id: batchMatch.product_id,
            product_name: batchMatch.product_name,
            score: 10000,
            is_batch_match: true,
            is_high_confidence: true,
            batch_no: batchMatch.batch_no,
          });
        }

        rawSuggestions.sort((a, b) => b.score - a.score);

        // Deduplicate suggestions by product_id (keeping highest score/batchMatch)
        const uniqueSuggestions = [];
        const seenIds = new Set();
        for (const sug of rawSuggestions) {
          if (!seenIds.has(sug.product_id)) {
            seenIds.add(sug.product_id);
            uniqueSuggestions.push(sug);
          }
        }

        const topSuggestions = uniqueSuggestions.slice(0, 12);

        return {
          scanned_name: scannedName,
          scanned_batch: scannedBatch,
          batch_match: batchMatch,
          exact_name_match: exactNameMatch,
          suggestions: topSuggestions,
        };
      });

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
            "items.product_name": { $regex: normalizedInput.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), $options: "i" }
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
        purchases: historyRecords
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/purchases/price-history - Check historical prices for a product
router.get(
  "/price-history",
  auth,
  requireSubscription(),
  async (req, res, next) => {
    try {
      const db = mongoose.connection.db;
      const { product_name, current_price } = req.query;

      if (!product_name) {
        return res.status(400).json({ detail: "product_name is required" });
      }

      const currentPriceNum = parseFloat(current_price) || 0;

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

      // Extract unique supplier prices for this product
      const supplierPrices = [];
      const seenSuppliers = new Set();
      let matchedProductName = null;

      for (const purchase of purchases) {
        for (const item of purchase.items || []) {
          // Match product name (case-insensitive)
          const normalizedStored = normalizeName(item.product_name);

          if (
            normalizedStored === normalizedInput ||
            normalizedStored.includes(normalizedInput) ||
            normalizedInput.includes(normalizedStored)
          ) {
            // Save first matched actual product name
            if (!matchedProductName) {
              matchedProductName = item.product_name;
            }

            const packPrice = item.pack_price || item.rate_pack || 0;
            const key = `${purchase.supplier_id || purchase.supplier_name}-${packPrice}`;

            if (!seenSuppliers.has(key) && packPrice > 0) {
              seenSuppliers.add(key);
              supplierPrices.push({
                supplier_id: purchase.supplier_id,
                supplier_name: purchase.supplier_name,
                pack_price: packPrice,
                units_per_pack: item.units_per_pack || 1,
                price_per_unit: packPrice / (item.units_per_pack || 1),
                purchase_date: purchase.created_at,
                invoice_no: purchase.invoice_no,
                batch_no: item.batch_no,
              });
            }
          }
        }
      }

      // Sort by pack price (cheapest first)
      supplierPrices.sort((a, b) => a.pack_price - b.pack_price);

      // Find cheaper options (only those with price < current price)
      const cheaperOptions =
        currentPriceNum > 0
          ? supplierPrices.filter((sp) => sp.pack_price < currentPriceNum)
          : [];

      // Get the cheapest historical price
      const cheapestPrice =
        supplierPrices.length > 0 ? supplierPrices[0].pack_price : null;
      const isHigherThanHistory =
        currentPriceNum > 0 &&
        cheapestPrice !== null &&
        currentPriceNum > cheapestPrice;

      res.json({
        searched_product_name: product_name,
        matched_product_name: matchedProductName,
        current_price: currentPriceNum,
        cheapest_historical_price: cheapestPrice,
        is_higher_than_history: isHigherThanHistory,
        price_difference: isHigherThanHistory
          ? currentPriceNum - cheapestPrice
          : 0,
        cheaper_options: cheaperOptions,
        all_historical_prices: supplierPrices,
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
      query.$or = [
        { invoice_no: { $regex: search, $options: "i" } },
        { supplier_name: { $regex: search, $options: "i" } },
        { "items.product_name": { $regex: search, $options: "i" } },
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
      const targetIndex = allPurchasesIds.findIndex((p) => p.id === highlight_id);
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
    const { supplier_id, supplier_name, invoice_no, purchase_date, items, payment_status, amount_paid, payment_mode } =
      req.body;
    const db = mongoose.connection.db;

    // Validate payment mode against mandatory settings preference
    const userPrefs = await db.collection("user_settings").findOne({ user_id: req.user.id });
    const preferences = userPrefs?.preferences || {};
    const isModeMandatory = preferences.purchase_payment_mode_mandatory === true;

    const isPaidOrPartial = payment_status === "Paid" || payment_status === "Partial";
    if (isModeMandatory && isPaidOrPartial && (!payment_mode || !["Cash", "UPI", "Card"].includes(payment_mode))) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ detail: "Payment mode is mandatory" });
    }

    if (!items || items.length === 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ detail: "At least one item is required" });
    }

    // [Issue #11] Idempotency Check
    if (invoice_no) {
      const existingPurchase = await db.collection("purchases").findOne({
        pharmacy_id: req.user.pharmacy_id,
        supplier_id,
        invoice_no,
        created_at: { $gt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString() }
      }, { session });

      if (existingPurchase) {
        await session.abortTransaction();
        session.endSession();
        return res.status(409).json({ detail: "Duplicate purchase detected (same invoice and supplier in last 30 days)" });
      }
    }

    const purchaseId = uuidv4();
    let totalAmount = 0;
    const processedItems = [];

    for (const item of items) {
      // Find or create product in products collection (unique product directory)
      const normalizedName = item.product_name.trim();
      let matchedProduct = null;

      const pId = item.selected_product_id || item.product_id;
      if (pId && !pId.startsWith("scanned_")) {
        matchedProduct = await db.collection("products").findOne({
          pharmacy_id: req.user.pharmacy_id,
          id: pId,
        }, { session });
      }

      if (!matchedProduct) {
        matchedProduct = await db.collection("products").findOne({
          pharmacy_id: req.user.pharmacy_id,
          name: { $regex: new RegExp("^" + normalizedName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + "$", "i") },
        }, { session });
      }

      let resolvedProductId;
      if (matchedProduct) {
        resolvedProductId = matchedProduct.id;
      } else {
        resolvedProductId = (pId && !pId.startsWith("scanned_")) ? pId : uuidv4();
        await db.collection("products").insertOne({
          id: resolvedProductId,
          pharmacy_id: req.user.pharmacy_id,
          name: normalizedName,
          low_stock_threshold: 10,
          created_at: new Date().toISOString(),
        }, { session });
      }

      let packQty = item.pack_quantity || item.quantity || 1;
      let unitsPerPack = item.units_per_pack || item.units || 1;
      let packPrice = item.pack_price || item.rate_pack || 0;
      let mrpPerUnit = item.mrp_per_unit || item.mrp_unit || 0;
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
      const pricePerUnit = totalUnits > 0 ? netBasePrice / totalUnits : 0;

      const cgst = parseFloat(item.cgst) || 0;
      const sgst = parseFloat(item.sgst) || 0;
      const itemTotal = netBasePrice * (1 + (cgst + sgst) / 100);
      totalAmount += itemTotal;

      const processedItem = {
        product_id: resolvedProductId,
        product_name: item.product_name,
        batch_no: item.batch_no,
        expiry_date: item.expiry_date,
        manufacturer: item.manufacturer || null,
        salt_composition: item.salt_composition || null,
        pack_type: item.pack_type || "Strip",
        quantity: totalUnits,
        pack_quantity: packQty,
        scheme: scheme,
        units_per_pack: unitsPerPack,
        total_units: totalUnits,
        purchase_price: Math.round(pricePerUnit * 100) / 100,
        pack_price: packPrice,
        price_per_unit: Math.round(pricePerUnit * 100) / 100,
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
        shortage_threshold: item.shortage_threshold !== undefined && item.shortage_threshold !== null && item.shortage_threshold !== "" ? Number(item.shortage_threshold) : null,
      };
      processedItems.push(processedItem);

      // Update inventory (with session)
      const existingInventory = await db.collection("inventory").findOne({
        pharmacy_id: req.user.pharmacy_id,
        product_id: resolvedProductId,
        batch_no: item.batch_no,
      }, { session });

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
              expiry_date: item.expiry_date,
              cgst: cgst,
              sgst: sgst,
              discount: discount,
              scheme: scheme,
              shortage_threshold: item.shortage_threshold !== undefined && item.shortage_threshold !== null && item.shortage_threshold !== "" ? Number(item.shortage_threshold) : (existingInventory.shortage_threshold !== undefined ? existingInventory.shortage_threshold : null),
            },
          },
          { session }
        );
      } else {
        const inventoryId = uuidv4();
        await db.collection("inventory").insertOne({
          id: inventoryId,
          pharmacy_id: req.user.pharmacy_id,
          product_id: resolvedProductId,
          product_name: item.product_name,
          batch_no: item.batch_no,
          hsn_no: item.hsn_no || null,
          expiry_date: item.expiry_date,
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
          supplier_id: supplier_id,
          shortage_threshold: item.shortage_threshold !== undefined && item.shortage_threshold !== null && item.shortage_threshold !== "" ? Number(item.shortage_threshold) : null,
          created_at: new Date().toISOString(),
        }, { session });
      }
    }

    const pStatus = payment_status || "Unpaid";
    let pAmount = parseFloat(amount_paid) || 0;
    
    if (pStatus === "Paid") pAmount = totalAmount;
    else if (pStatus === "Unpaid") pAmount = 0;

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
      supplier_id,
      supplier_name,
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
    res.status(201).json({ message: "Purchase recorded", purchase: purchaseData });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
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
      const { items, purchase_date, invoice_no, supplier_id, supplier_name, payment_status, amount_paid, payment_mode } = req.body;
      const db = mongoose.connection.db;

      // Validate payment mode against mandatory settings preference
      const userPrefs = await db.collection("user_settings").findOne({ user_id: req.user.id });
      const preferences = userPrefs?.preferences || {};
      const isModeMandatory = preferences.purchase_payment_mode_mandatory === true;

      const isPaidOrPartial = payment_status === "Paid" || payment_status === "Partial";
      if (isModeMandatory && isPaidOrPartial && (!payment_mode || !["Cash", "UPI", "Card"].includes(payment_mode))) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ detail: "Payment mode is mandatory" });
      }

      const purchase = await db.collection("purchases").findOne({
        id: req.params.purchase_id,
        pharmacy_id: req.user.pharmacy_id,
      }, { session });

      if (!purchase) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ detail: "Purchase not found" });
      }

      // Check if items changed
      let itemsChanged = false;
      if (!purchase.items || purchase.items.length !== items.length) {
        itemsChanged = true;
      } else {
        for (let i = 0; i < purchase.items.length; i++) {
          const oldItem = purchase.items[i];
          const newItem = items[i];

          const newPackQty = parseInt(newItem.pack_quantity) || parseInt(newItem.quantity) || 1;
          const newUnitsPerPack = parseInt(newItem.units_per_pack) || parseInt(newItem.units) || 1;
          const newPackPrice = parseFloat(newItem.pack_price) || parseFloat(newItem.rate_pack) || 0;
          const newMrpPerUnit = parseFloat(newItem.mrp_per_unit) || parseFloat(newItem.mrp_unit) || 0;

          if (
            oldItem.product_name !== newItem.product_name ||
            oldItem.batch_no !== newItem.batch_no ||
            oldItem.pack_quantity !== newPackQty ||
            oldItem.units_per_pack !== newUnitsPerPack ||
            oldItem.pack_price !== newPackPrice ||
            oldItem.mrp_per_unit !== newMrpPerUnit
          ) {
            itemsChanged = true;
            break;
          }
        }
      }

      const updateInventory = req.query.update_inventory !== "false" && itemsChanged;

      if (updateInventory) {
        // Reverse old inventory
        for (const oldItem of purchase.items) {
          const updateResult = await db.collection("inventory").findOneAndUpdate(
            {
              pharmacy_id: req.user.pharmacy_id,
              product_name: oldItem.product_name,
              batch_no: oldItem.batch_no,
            },
            {
              $inc: {
                quantity: -oldItem.total_units,
                available_quantity: -oldItem.total_units,
              },
            },
            { session, returnDocument: "after" }
          );

          // [Issue #1] Handle Missing Inventory Record + Negative Protection
          if (!updateResult) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({
              detail: `Inventory record missing for ${oldItem.product_name}. Cannot update.`,
            });
          }

          if (updateResult.quantity < 0 || updateResult.available_quantity < 0) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({
              detail: `Update failed: Inventory for ${oldItem.product_name} would become negative.`,
            });
          }
        }
      }

      // Process new items
      let totalAmount = 0;
      const processedItems = [];

      for (const item of items) {
        // Find or create product in products collection (unique product directory)
        const normalizedName = item.product_name.trim();
        let matchedProduct = await db.collection("products").findOne({
          pharmacy_id: req.user.pharmacy_id,
          name: { $regex: new RegExp("^" + normalizedName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + "$", "i") }
        }, { session });

        let resolvedProductId;
        if (matchedProduct) {
          resolvedProductId = matchedProduct.id;
        } else {
          resolvedProductId = uuidv4();
          await db.collection("products").insertOne({
            id: resolvedProductId,
            pharmacy_id: req.user.pharmacy_id,
            name: normalizedName,
            low_stock_threshold: 10,
            created_at: new Date().toISOString(),
          }, { session });
        }

        const packQty =
          parseInt(item.pack_quantity) || parseInt(item.quantity) || 1;
        const unitsPerPack =
          parseInt(item.units_per_pack) || parseInt(item.units) || 1;
        const packPrice =
          parseFloat(item.pack_price) || parseFloat(item.rate_pack) || 0;
        const mrpPerUnit =
          parseFloat(item.mrp_per_unit) || parseFloat(item.mrp_unit) || 0;
        const discount = parseFloat(item.discount) || 0;
        const scheme = parseFloat(item.scheme) || 0;

        const totalPacks = packQty + scheme;
        const totalUnits = totalPacks * unitsPerPack;
        
        const netBasePrice = packQty * packPrice * (1 - discount / 100);
        const pricePerUnit = totalUnits > 0 ? netBasePrice / totalUnits : 0;

        const cgst = parseFloat(item.cgst) || 0;
        const sgst = parseFloat(item.sgst) || 0;
        const itemTotal = netBasePrice * (1 + (cgst + sgst) / 100);
        totalAmount += itemTotal;

        processedItems.push({
          ...item,
          product_id: resolvedProductId,
          pack_quantity: packQty,
          scheme: scheme,
          units_per_pack: unitsPerPack,
          pack_price: packPrice,
          mrp_per_unit: mrpPerUnit,
          total_units: totalUnits,
          price_per_unit: pricePerUnit,
          item_total: itemTotal,
          cgst: cgst,
          sgst: sgst,
          discount: discount,
          shortage_threshold: item.shortage_threshold !== undefined && item.shortage_threshold !== null && item.shortage_threshold !== "" ? Number(item.shortage_threshold) : null,
        });

        if (updateInventory) {
          // Add to inventory
          const existingInventory = await db.collection("inventory").findOne({
            pharmacy_id: req.user.pharmacy_id,
            product_id: resolvedProductId,
            batch_no: item.batch_no,
          }, { session });

          if (existingInventory) {
            await db.collection("inventory").updateOne(
              { id: existingInventory.id },
              {
                $inc: { quantity: totalUnits, available_quantity: totalUnits },
                $set: {
                  purchase_price: pricePerUnit,
                  mrp: mrpPerUnit,
                  cgst: cgst,
                  sgst: sgst,
                  discount: discount,
                  scheme: scheme,
                  shortage_threshold: item.shortage_threshold !== undefined && item.shortage_threshold !== null && item.shortage_threshold !== "" ? Number(item.shortage_threshold) : (existingInventory.shortage_threshold !== undefined ? existingInventory.shortage_threshold : null),
                },
              },
              { session }
            );
          } else {
            await db.collection("inventory").insertOne({
              id: uuidv4(),
              pharmacy_id: req.user.pharmacy_id,
              product_id: resolvedProductId,
              product_name: item.product_name,
              batch_no: item.batch_no,
              expiry_date: item.expiry_date,
              quantity: totalUnits,
              available_quantity: totalUnits,
              pack_quantity: packQty,
              scheme: scheme,
              units_per_pack: unitsPerPack,
              purchase_price: pricePerUnit,
              mrp: mrpPerUnit,
              cgst: cgst,
              sgst: sgst,
              discount: discount,
              purchase_id: req.params.purchase_id,
              shortage_threshold: item.shortage_threshold !== undefined && item.shortage_threshold !== null && item.shortage_threshold !== "" ? Number(item.shortage_threshold) : null,
              created_at: new Date().toISOString(),
            }, { session });
          }
        }
      }

      const finalStatus = payment_status !== undefined ? payment_status : (purchase.payment_status || "Unpaid");
      let finalAmountPaid = purchase.amount_paid || 0;
      if (payment_status !== undefined) {
        finalAmountPaid = amount_paid !== undefined ? parseFloat(amount_paid) : finalAmountPaid;
      }
      if (finalStatus === "Paid") {
        finalAmountPaid = totalAmount;
      } else if (finalStatus === "Unpaid") {
        finalAmountPaid = 0;
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

      if (supplier_id !== undefined) updatePayload.supplier_id = supplier_id;
      if (supplier_name !== undefined) updatePayload.supplier_name = supplier_name;

      // Calculate Edit History Changes
      const changes = [];
      const compareField = (fieldName, label, formatter = (v) => v) => {
        const oldVal = purchase[fieldName];
        const newVal = updatePayload[fieldName];
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

      compareField("supplier_name", "Supplier Name");
      compareField("invoice_no", "Invoice Number");
      compareField("purchase_date", "Purchase Date", (v) => v ? new Date(v).toLocaleDateString() : "");
      compareField("payment_status", "Payment Status");
      compareField("amount_paid", "Amount Paid", (v) => v !== undefined && v !== null ? `₹${Number(v).toFixed(2)}` : "₹0.00");
      compareField("payment_mode", "Payment Mode");
      compareField("total_amount", "Total Amount", (v) => v !== undefined && v !== null ? `₹${Number(v).toFixed(2)}` : "₹0.00");

      // Items Comparison
      const oldItemsMap = {};
      const oldCounts = {};
      (purchase.items || []).forEach(item => {
        const pId = item.product_id || item.product_name;
        oldCounts[pId] = (oldCounts[pId] || 0) + 1;
        const key = `${pId}_${oldCounts[pId]}`;
        oldItemsMap[key] = item;
      });

      const newItemsMap = {};
      const newCounts = {};
      processedItems.forEach(item => {
        const pId = item.product_id || item.product_name;
        newCounts[pId] = (newCounts[pId] || 0) + 1;
        const key = `${pId}_${newCounts[pId]}`;
        newItemsMap[key] = item;
      });

      const itemChanges = [];
      processedItems.forEach(item => {
        const pId = item.product_id || item.product_name;
        const count = newCounts[pId] || 0;
        const key = `${pId}_${count}`;
        const oldItem = oldItemsMap[key];
        
        if (!oldItem) {
          itemChanges.push(`Added item ${item.product_name} (Qty: ${item.total_units || item.quantity})`);
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

          const oldQty = oldItem.total_units !== undefined ? oldItem.total_units : oldItem.quantity;
          const newQty = item.total_units !== undefined ? item.total_units : item.quantity;
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
          checkItemField("shortage_threshold", "shortage_threshold", "Shortage Threshold");

          const oldPrice = oldItem.purchase_price || oldItem.pack_price || 0;
          const newPrice = item.purchase_price || item.pack_price || 0;
          if (parseFloat(oldPrice).toFixed(2) !== parseFloat(newPrice).toFixed(2)) {
            changesList.push(`Price: ₹${parseFloat(oldPrice).toFixed(2)} -> ₹${parseFloat(newPrice).toFixed(2)}`);
          }

          const oldMrp = oldItem.mrp || oldItem.mrp_per_unit || 0;
          const newMrp = item.mrp || item.mrp_per_unit || 0;
          if (parseFloat(oldMrp).toFixed(2) !== parseFloat(newMrp).toFixed(2)) {
            changesList.push(`MRP: ₹${parseFloat(oldMrp).toFixed(2)} -> ₹${parseFloat(newMrp).toFixed(2)}`);
          }

          if (changesList.length > 0) {
            itemChanges.push(`Updated item ${item.product_name} (${changesList.join(", ")})`);
          }
        }
      });

      (purchase.items || []).forEach(item => {
        const pId = item.product_id || item.product_name;
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
        updatePayload.history = [...(purchase.history || []), historyEntry];
      }

      await db.collection("purchases").updateOne(
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
      const adjustInventory = req.query.delete_inventory !== "false";

      const purchase = await db.collection("purchases").findOne({
        id: req.params.purchase_id,
        pharmacy_id: req.user.pharmacy_id,
      }, { session });

      if (!purchase) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ detail: "Purchase not found" });
      }

      // Reverse inventory if requested
      if (adjustInventory) {
        for (const item of purchase.items) {
          const updateResult = await db.collection("inventory").findOneAndUpdate(
            {
              pharmacy_id: req.user.pharmacy_id,
              product_name: item.product_name,
              batch_no: item.batch_no,
            },
            {
              $inc: {
                quantity: -item.total_units,
                available_quantity: -item.total_units,
              },
            },
            { session, returnDocument: "after" }
          );

          // [Issue #1] Handle Missing Inventory Record + Negative Protection
          if (!updateResult) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({
              detail: `Inventory record missing for ${item.product_name}. Cannot delete.`,
            });
          }

          if (updateResult.quantity < 0 || updateResult.available_quantity < 0) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({
              detail: `Delete failed: Inventory for ${item.product_name} would become negative.`,
            });
          }
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
        deleted_inventory_items: adjustInventory ? purchase.items.length : 0
      });
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      next(error);
    }
  }
);

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

// GET /api/purchases/scan-status/:jobId
router.get("/scan-status/:jobId", auth, async (req, res) => {
  try {
    const job = await ScanJob.findOne({
      jobId: req.params.jobId,
      pharmacyId: req.user.pharmacy_id
    });
    
    if (!job) {
      return res.status(404).json({ detail: "Job not found", success: false });
    }

    // [Issue #5] Fetch progress from BullMQ
    const bullJob = await scanQueue.getJob(req.params.jobId);
    const progress = bullJob?.progress || 0;

    res.json({
      ...job.toObject(),
      progress
    });
  } catch (error) {
    res.status(500).json({ detail: error.message, success: false });
  }
});

// Helper for Scan Queueing
async function queueScan(req, res, type) {
  try {
    // [Issue #15] File count limit
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ detail: "No images provided" });
    }
    if (req.files.length > 10) {
      return res.status(400).json({ detail: "Maximum 10 files allowed" });
    }

    // [Issue #11] MIME Spoofing Protection (Sharp Validation)
    const compressedFiles = [];
    for (const file of req.files) {
      try {
        // Validate it's a real image
        await sharp(file.path).metadata();
        
        const compressedPath = await compressImage(file.path);
        compressedFiles.push(compressedPath);
      } catch (e) {
        console.error(`File validation/compression failed for ${file.path}:`, e);
      } finally {
        // [Issue #6] Always cleanup original upload
        try { fs.unlinkSync(file.path); } catch (e) {}
      }
    }

    if (compressedFiles.length === 0) {
      return res.status(400).json({ detail: "No valid images could be processed" });
    }

    const jobId = uuidv4();
    
    // Create job record in MongoDB
    await ScanJob.create({
      jobId,
      pharmacyId: req.user.pharmacy_id,
      userId: req.user.id,
      status: "pending",
      type: type
    });

    // [Issue #R2] Upload to Cloudflare R2
    const r2Keys = [];
    for (const compressedPath of compressedFiles) {
      try {
        const key = `scans/${jobId}/${path.basename(compressedPath)}`;
        const ext = path.extname(compressedPath).toLowerCase();
        let mimeType = 'image/jpeg';
        if (ext === '.png') mimeType = 'image/png';
        else if (ext === '.webp') mimeType = 'image/webp';

        const buffer = fs.readFileSync(compressedPath);
        await uploadToR2(key, buffer, mimeType);
        r2Keys.push(key);
      } catch (r2Error) {
        console.error(`R2 upload failed for ${compressedPath}:`, r2Error);
      } finally {
        // Always cleanup local compressed file after trying to upload
        try { fs.unlinkSync(compressedPath); } catch (e) {}
      }
    }

    if (r2Keys.length === 0) {
      return res.status(500).json({ detail: "Failed to upload images for processing", success: false });
    }

    try {
      // Add to BullMQ [Issue #6] Set jobId, [Issue #19] Remove secrets, [R2] Pass keys
      await scanQueue.add("scan", {
        jobId,
        r2Keys,
        type: type
      }, { jobId });
    } catch (queueError) {
      // [Issue #4] Cleanup R2 files if queue fails
      for (const key of r2Keys) {
        try { await deleteFromR2(key); } catch (e) {}
      }
      // [Issue #3] Cleanup Orphaned ScanJob in DB
      try { await ScanJob.deleteOne({ jobId }); } catch (dbErr) {}
      
      throw queueError;
    }

    res.json({ success: true, jobId });
  } catch (error) {
    console.error("Scan error:", error);
    res.status(500).json({ detail: error.message, success: false });
  }
}

// POST /api/purchases/scan-image
router.post(
  "/scan-image",
  auth,
  requireSubscription(),
  scanRateLimiter,
  upload.array("files", 10),
  async (req, res) => {
    await queueScan(req, res, "product");
  }
);

// POST /api/purchases/scan-bill
router.post(
  "/scan-bill",
  auth,
  requireSubscription(),
  scanRateLimiter,
  upload.array("files", 10),
  async (req, res) => {
    await queueScan(req, res, "bill");
  }
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
      try { fs.unlinkSync(req.file.path); } catch (e) {}
      return res
        .status(400)
        .json({ detail: "CSV file must contain a header row and at least 1 data row" });
    }

    // Upload to Cloudflare R2
    const r2Key = `csv-imports/${req.user.pharmacy_id}/${Date.now()}-${uuidv4()}-${req.file.originalname}`;
    let r2Url = null;
    try {
      r2Url = await uploadToR2(r2Key, fileBuffer, req.file.mimetype || "text/csv");
    } catch (r2Err) {
      console.error("R2 Upload failed for CSV:", r2Err);
    }

    // Cleanup local temp file
    try { fs.unlinkSync(req.file.path); } catch (e) {}

    const delimiter = detectCSVDelimiter(lines[0]);
    const headers = parseCSVRow(lines[0], delimiter).map((h) => h.replace(/^["']|["']$/g, "").trim());

    const sampleRows = lines.slice(1, 11).map((line) => {
      const values = parseCSVRow(line, delimiter).map((v) => v.replace(/^["']|["']$/g, "").trim());
      const row = {};
      headers.forEach((h, i) => {
        if (h) row[h] = values[i] !== undefined ? values[i] : "";
      });
      return row;
    });

    const parsedAllRows = lines.slice(1).map((line) => {
      const values = parseCSVRow(line, delimiter).map((v) => v.replace(/^["']|["']$/g, "").trim());
      const row = {};
      headers.forEach((h, i) => {
        if (h) row[h] = values[i] !== undefined ? values[i] : "";
      });
      return row;
    });

    // Supplier Template Check if supplier_id is provided
    let templateMatch = { matched: false, missing_fields: [], mapped_fields: null };
    const supplierId = req.body.supplier_id || req.query.supplier_id;

    if (supplierId) {
      const supplier = await db.collection("suppliers").findOne({
        id: supplierId,
        pharmacy_id: req.user.pharmacy_id,
      });

      if (supplier && supplier.csv_template && supplier.csv_template.mapped_fields) {
        const savedMap = supplier.csv_template.mapped_fields;
        const missing = [];
        const normalizedHeaders = new Set(headers.map((h) => h.toLowerCase()));

        Object.entries(savedMap).forEach(([targetField, csvCol]) => {
          if (csvCol && csvCol !== "none" && !normalizedHeaders.has(csvCol.toLowerCase())) {
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
router.post("/parse-csv", auth, requireSubscription(), upload.single("file"), handleParseCsvUpload);
router.post("/csv-columns", auth, requireSubscription(), upload.single("file"), handleParseCsvUpload);
router.post("/csv", auth, requireSubscription(), upload.single("file"), handleParseCsvUpload);

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
        const packQty = parseInt(item.pack_quantity) || parseInt(item.quantity) || 1;
        const unitsPerPack = parseInt(item.units_per_pack) || 1;
        const packPrice = parseFloat(item.pack_price) || parseFloat(item.rate_pack) || parseFloat(item.purchase_price) || 0;
        const mrpPack = parseFloat(item.mrp_pack) || parseFloat(item.mrp) || 0;

        const totalUnits = packQty * unitsPerPack;
        const pricePerUnit = unitsPerPack > 0 ? packPrice / unitsPerPack : packPrice;
        const mrpPerUnit = unitsPerPack > 0 ? mrpPack / unitsPerPack : mrpPack;
        const itemTotal = packQty * packPrice;
        totalAmount += itemTotal;

        const processedItem = {
          product_id: item.product_id || `csv-${uuidv4().slice(0, 8)}`,
          product_name: item.product_name,
          manufacturer: item.manufacturer || null,
          salt_composition: item.salt_composition || null,
          pack_type: item.pack_type || "Strip",
          batch_no: item.batch_no || `BATCH-${Date.now()}`,
          hsn_no: item.hsn_no || null,
          expiry_date: item.expiry_date || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
          pack_quantity: packQty,
          units_per_pack: unitsPerPack,
          total_units: totalUnits,
          pack_price: packPrice,
          price_per_unit: pricePerUnit,
          mrp_pack: mrpPack,
          mrp_per_unit: mrpPerUnit,
          item_total: itemTotal,
        };

        processedItems.push(processedItem);

        const existingInventory = await db.collection("inventory").findOne({
          pharmacy_id: req.user.pharmacy_id,
          product_name: item.product_name,
          batch_no: processedItem.batch_no,
        }, { session });

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
          await db.collection("inventory").insertOne({
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
          }, { session });
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
      const { amount, date, notes } = req.body;
      const db = mongoose.connection.db;

      if (!amount || amount <= 0) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ detail: "Payment amount must be greater than 0" });
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

      const paymentAmount = parseFloat(amount);
      const newAmountPaid = (purchase.amount_paid || 0) + paymentAmount;
      let newStatus = "Partial";

      if (newAmountPaid >= purchase.total_amount) {
        newStatus = "Paid";
      }

      const newPayment = {
        id: uuidv4(),
        amount: paymentAmount,
        date: date || new Date().toISOString(),
        notes: notes || "Partial Payment",
      };

      await db.collection("purchases").updateOne(
        { id: req.params.purchase_id },
        {
          $push: { payments: newPayment },
          $set: {
            amount_paid: newAmountPaid,
            payment_status: newStatus,
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
