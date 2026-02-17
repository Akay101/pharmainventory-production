const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");
const axios = require("axios");
const multer = require("multer");
const { auth } = require("../middleware/auth");
const { normalizeName } = require("../utils/helpers");

const upload = multer({ storage: multer.memoryStorage() });

// GET /api/purchases/price-history - Check historical prices for a product
router.get("/price-history", auth, async (req, res, next) => {
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
});

// GET /api/purchases
router.get("/", auth, async (req, res, next) => {
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

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sortDir = sort_order === "asc" ? 1 : -1;

    const sortOptions =
      sort_by === "purchase_date"
        ? { purchase_date: sortDir, created_at: sortDir }
        : { [sort_by]: sortDir };

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

// POST /api/purchases
router.post("/", auth, async (req, res, next) => {
  try {
    const { supplier_id, supplier_name, invoice_no, purchase_date, items } =
      req.body;
    const db = mongoose.connection.db;

    if (!items || items.length === 0) {
      return res.status(400).json({ detail: "At least one item is required" });
    }

    const purchaseId = uuidv4();
    let totalAmount = 0;
    const processedItems = [];

    for (const item of items) {
      // Handle both old and new format
      let packQty = item.pack_quantity || item.quantity || 1;
      let unitsPerPack = item.units_per_pack || 1;
      let packPrice = item.pack_price || item.purchase_price || 0;
      let mrpPerUnit = item.mrp_per_unit || item.mrp || 0;

      // If old format (simple quantity and price per unit)
      if (item.quantity && !item.pack_quantity && item.purchase_price) {
        packQty = item.quantity;
        unitsPerPack = 1;
        packPrice = item.purchase_price;
      }

      const totalUnits = packQty * unitsPerPack;
      const pricePerUnit =
        unitsPerPack > 0 ? packPrice / unitsPerPack : packPrice;
      const itemTotal = packQty * packPrice;
      totalAmount += itemTotal;

      const processedItem = {
        product_id: item.product_id,
        product_name: item.product_name,
        batch_no: item.batch_no,
        expiry_date: item.expiry_date,
        manufacturer: item.manufacturer || null,
        salt_composition: item.salt_composition || null,
        pack_type: item.pack_type || "Strip",
        quantity: totalUnits,
        pack_quantity: packQty,
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
      };
      processedItems.push(processedItem);

      // Update inventory
      const existingInventory = await db.collection("inventory").findOne({
        pharmacy_id: req.user.pharmacy_id,
        product_name: item.product_name,
        batch_no: item.batch_no,
      });

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
            },
          }
        );
      } else {
        const inventoryId = uuidv4();
        await db.collection("inventory").insertOne({
          id: inventoryId,
          pharmacy_id: req.user.pharmacy_id,
          product_id: item.product_id,
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
          units_per_pack: unitsPerPack,
          purchase_price: pricePerUnit,
          mrp: mrpPerUnit,
          pack_price: packPrice,
          mrp_pack: mrpPerUnit ? mrpPerUnit * unitsPerPack : null,
          purchase_id: purchaseId,
          supplier_id: supplier_id,
          created_at: new Date().toISOString(),
        });
      }
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
      created_by: req.user.id,
      created_at: new Date().toISOString(),
    };

    await db.collection("purchases").insertOne(purchaseData);
    const { _id, ...purchase } = purchaseData;

    res.status(201).json({ message: "Purchase recorded", purchase });
  } catch (error) {
    next(error);
  }
});

// GET /api/purchases/:purchase_id
router.get("/:purchase_id", auth, async (req, res, next) => {
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
});

// PUT /api/purchases/:purchase_id
router.put("/:purchase_id", auth, async (req, res, next) => {
  try {
    const { items, purchase_date } = req.body;
    const db = mongoose.connection.db;

    const purchase = await db.collection("purchases").findOne({
      id: req.params.purchase_id,
      pharmacy_id: req.user.pharmacy_id,
    });

    if (!purchase) {
      return res.status(404).json({ detail: "Purchase not found" });
    }

    // Reverse old inventory
    for (const oldItem of purchase.items) {
      await db.collection("inventory").updateOne(
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
        }
      );
    }

    // Process new items
    let totalAmount = 0;
    const processedItems = [];

    for (const item of items) {
      const packQty =
        parseInt(item.pack_quantity) || parseInt(item.quantity) || 1;
      const unitsPerPack =
        parseInt(item.units_per_pack) || parseInt(item.units) || 1;
      const packPrice =
        parseFloat(item.pack_price) || parseFloat(item.rate_pack) || 0;
      const mrpPerUnit =
        parseFloat(item.mrp_per_unit) || parseFloat(item.mrp_unit) || 0;

      const totalUnits = packQty * unitsPerPack;
      const pricePerUnit =
        unitsPerPack > 0 ? packPrice / unitsPerPack : packPrice;
      const itemTotal = packQty * packPrice;
      totalAmount += itemTotal;

      processedItems.push({
        ...item,
        pack_quantity: packQty,
        units_per_pack: unitsPerPack,
        pack_price: packPrice,
        mrp_per_unit: mrpPerUnit,
        total_units: totalUnits,
        price_per_unit: pricePerUnit,
        item_total: itemTotal,
      });

      // Add to inventory
      const existingInventory = await db.collection("inventory").findOne({
        pharmacy_id: req.user.pharmacy_id,
        product_name: item.product_name,
        batch_no: item.batch_no,
      });

      if (existingInventory) {
        await db.collection("inventory").updateOne(
          { id: existingInventory.id },
          {
            $inc: { quantity: totalUnits, available_quantity: totalUnits },
            $set: { purchase_price: pricePerUnit, mrp: mrpPerUnit },
          }
        );
      } else {
        await db.collection("inventory").insertOne({
          id: uuidv4(),
          pharmacy_id: req.user.pharmacy_id,
          product_id: item.product_id,
          product_name: item.product_name,
          batch_no: item.batch_no,
          expiry_date: item.expiry_date,
          quantity: totalUnits,
          available_quantity: totalUnits,
          units_per_pack: unitsPerPack,
          purchase_price: pricePerUnit,
          mrp: mrpPerUnit,
          purchase_id: req.params.purchase_id,
          created_at: new Date().toISOString(),
        });
      }
    }

    await db.collection("purchases").updateOne(
      { id: req.params.purchase_id },
      {
        $set: {
          items: processedItems,
          total_amount: totalAmount,
          purchase_date: purchase_date || purchase.purchase_date,
          updated_at: new Date().toISOString(),
        },
      }
    );

    const updated = await db
      .collection("purchases")
      .findOne({ id: req.params.purchase_id }, { projection: { _id: 0 } });

    res.json({ message: "Purchase updated", purchase: updated });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/purchases/:purchase_id
router.delete("/:purchase_id", auth, async (req, res, next) => {
  try {
    const db = mongoose.connection.db;
    const purchase = await db.collection("purchases").findOne({
      id: req.params.purchase_id,
      pharmacy_id: req.user.pharmacy_id,
    });

    if (!purchase) {
      return res.status(404).json({ detail: "Purchase not found" });
    }

    // Reverse inventory
    for (const item of purchase.items) {
      await db.collection("inventory").updateOne(
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
        }
      );
    }

    await db.collection("purchases").deleteOne({ id: req.params.purchase_id });
    res.json({ message: "Purchase deleted" });
  } catch (error) {
    next(error);
  }
});

// POST /api/purchases/scan-image
router.post(
  "/scan-image",
  auth,
  upload.single("file"),
  async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({ detail: "No image provided" });
      }

      const { GoogleGenerativeAI } = require("@google/generative-ai");
      const { execSync } = require("child_process");
      const fs = require("fs");
      const path = require("path");

      // Use Emergent LLM Key (platform) or direct Gemini API Key (local development)
      const apiKey = process.env.EMERGENT_LLM_KEY || process.env.GEMINI_API_KEY;

      if (!apiKey) {
        return res.status(500).json({
          detail:
            "No API key configured. Set EMERGENT_LLM_KEY (for Emergent platform) or GEMINI_API_KEY (for local dev with Google AI key)",
          success: false,
        });
      }

      // Create client with Emergent's baseURL for the universal key
      const genAI = new GoogleGenerativeAI(apiKey);

      // Use Python helper for both Emergent key and direct Gemini key
      // The Python helper now supports both key formats
      if (apiKey.startsWith("sk-emergent") || apiKey.startsWith("AIza")) {
        // Save the uploaded file temporarily
        const tempDir = "/tmp";
        const tempFile = path.join(
          tempDir,
          `scan_${Date.now()}_${Math.random().toString(36).slice(2)}.${req.file.mimetype.split("/")[1] || "png"}`
        );
        fs.writeFileSync(tempFile, req.file.buffer);

        try {
          // Call Python helper script
          const helperPath = path.join(__dirname, "../services/scan_helper.py");
          const result = execSync(
            `python3 "${helperPath}" "${tempFile}" "${apiKey}"`,
            {
              timeout: 120000,
              encoding: "utf-8",
              maxBuffer: 10 * 1024 * 1024,
            }
          );

          // Parse the result
          const scanResult = JSON.parse(result.trim());

          // Clean up temp file
          fs.unlinkSync(tempFile);

          if (!scanResult.success) {
            return res.status(400).json({
              detail: scanResult.error || "Failed to scan image",
              success: false,
            });
          }

          return res.json(scanResult);
        } catch (execError) {
          // Clean up temp file on error
          try {
            fs.unlinkSync(tempFile);
          } catch (e) {}
          console.error("Scan helper error:", execError.message);
          return res.status(500).json({
            detail:
              "Failed to scan image: " +
              (execError.stderr || execError.message),
            success: false,
          });
        }
      }

      // Fallback: Unknown key format
      return res.status(500).json({
        detail:
          "Unknown API key format. Use EMERGENT_LLM_KEY (sk-emergent...) or GEMINI_API_KEY (AIza...)",
        success: false,
      });
    } catch (error) {
      console.error("Scan error:", error);
      res.status(500).json({
        detail: "Failed to scan image: " + error.message,
        success: false,
      });
    }
  }
);

// POST /api/purchases/csv
router.post("/csv", auth, upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ detail: "No file provided" });
    }

    const content = req.file.buffer.toString("utf-8");
    const lines = content.split("\n").filter((l) => l.trim());

    if (lines.length < 2) {
      return res
        .status(400)
        .json({ detail: "CSV file must have header and data rows" });
    }

    const headers = lines[0].split(",").map((h) => h.trim().replace(/"/g, ""));
    const sampleData = lines.slice(1, 4).map((line) => {
      const values = line.split(",").map((v) => v.trim().replace(/"/g, ""));
      const row = {};
      headers.forEach((h, i) => (row[h] = values[i] || ""));
      return row;
    });

    res.json({ columns: headers, sample_data: sampleData });
  } catch (error) {
    next(error);
  }
});

// POST /api/purchases/csv/import
router.post("/csv/import", auth, async (req, res, next) => {
  try {
    const { supplier_id, supplier_name, invoice_no, items } = req.body;
    const db = mongoose.connection.db;

    if (!items || items.length === 0) {
      return res.status(400).json({ detail: "No items provided" });
    }

    const purchaseId = uuidv4();
    let totalAmount = 0;
    const processedItems = [];

    for (const item of items) {
      // Parse values with fallbacks
      const packQty =
        parseInt(item.pack_quantity) || parseInt(item.quantity) || 1;
      const unitsPerPack = parseInt(item.units_per_pack) || 1;
      const packPrice =
        parseFloat(item.pack_price) ||
        parseFloat(item.rate_pack) ||
        parseFloat(item.purchase_price) ||
        0;
      const mrpPack = parseFloat(item.mrp_pack) || parseFloat(item.mrp) || 0;

      const totalUnits = packQty * unitsPerPack;
      const pricePerUnit =
        unitsPerPack > 0 ? packPrice / unitsPerPack : packPrice;
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
        expiry_date:
          item.expiry_date ||
          new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split("T")[0],
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

      // Add to inventory
      const existingInventory = await db.collection("inventory").findOne({
        pharmacy_id: req.user.pharmacy_id,
        product_name: item.product_name,
        batch_no: processedItem.batch_no,
      });

      if (existingInventory) {
        await db.collection("inventory").updateOne(
          { id: existingInventory.id },
          {
            $inc: { quantity: totalUnits, available_quantity: totalUnits },
            $set: {
              purchase_price: pricePerUnit,
              mrp: mrpPerUnit,
              mrp_per_unit: mrpPerUnit,
              units_per_pack: unitsPerPack,
              pack_type: item.pack_type || "Strip",
              manufacturer: item.manufacturer,
              salt_composition: item.salt_composition,
              pack_price: packPrice,
              mrp_pack: mrpPack,
            },
          }
        );
      } else {
        await db.collection("inventory").insertOne({
          id: uuidv4(),
          pharmacy_id: req.user.pharmacy_id,
          product_id: processedItem.product_id,
          product_name: item.product_name,
          manufacturer: item.manufacturer || null,
          salt_composition: item.salt_composition || null,
          pack_type: item.pack_type || "Strip",
          batch_no: processedItem.batch_no,
          hsn_no: item.hsn_no || null,
          expiry_date: processedItem.expiry_date,
          quantity: totalUnits,
          available_quantity: totalUnits,
          units_per_pack: unitsPerPack,
          purchase_price: pricePerUnit,
          cost_per_unit: pricePerUnit,
          mrp: mrpPerUnit,
          mrp_per_unit: mrpPerUnit,
          pack_price: packPrice,
          mrp_pack: mrpPack,
          purchase_id: purchaseId,
          supplier_id: supplier_id,
          created_at: new Date().toISOString(),
        });
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

    await db.collection("purchases").insertOne(purchaseData);

    res.json({
      message: `Imported ${processedItems.length} items successfully`,
      purchase_id: purchaseId,
      total_amount: totalAmount,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
