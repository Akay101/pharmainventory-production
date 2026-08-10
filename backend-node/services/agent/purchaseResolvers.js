const mongoose = require("mongoose");
const { GoogleGenerativeAI } = require("@google/generative-ai");

/**
 * Resolver 1: Supplier Resolver
 */
async function resolveSupplier(db, pharmacyId, supplierInput) {
  if (!supplierInput) return { matchedSupplier: null, suggestedSuppliers: [] };

  const cleanInput = supplierInput.trim();
  const exactMatch = await db.collection("suppliers").findOne({
    pharmacy_id: pharmacyId,
    name: { $regex: new RegExp("^" + cleanInput.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&") + "$", "i") },
  });

  if (exactMatch) {
    return { matchedSupplier: exactMatch, suggestedSuppliers: [exactMatch] };
  }

  // Partial match
  const partialMatches = await db
    .collection("suppliers")
    .find({
      pharmacy_id: pharmacyId,
      name: { $regex: cleanInput, $options: "i" },
    })
    .limit(5)
    .toArray();

  return {
    matchedSupplier: partialMatches.length === 1 ? partialMatches[0] : null,
    suggestedSuppliers: partialMatches,
  };
}

/**
 * Resolver 2: Medicine Resolver
 */
async function resolveMedicine(db, pharmacyId, medicineInput) {
  if (!medicineInput) return { matchedMedicine: null };

  const cleanInput = medicineInput.trim();

  // 1. Search User Inventory first
  const inventoryMatch = await db.collection("inventory").findOne({
    pharmacy_id: pharmacyId,
    product_name: { $regex: new RegExp("^" + cleanInput.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&") + "$", "i") },
  });

  if (inventoryMatch) {
    return {
      matchedMedicine: {
        product_id: inventoryMatch.product_id,
        product_name: inventoryMatch.product_name,
        manufacturer: inventoryMatch.manufacturer || "",
        salt_composition: inventoryMatch.salt_composition || "",
        units_per_pack: inventoryMatch.units_per_pack || 10,
        pack_type: inventoryMatch.pack_type || "Strip",
        pack_price: inventoryMatch.pack_price || 0,
        mrp_pack: inventoryMatch.mrp_pack || 0,
        hsn_no: inventoryMatch.hsn_no || "",
      },
    };
  }

  // 2. Search Global Medicines
  const globalMatch = await db.collection("global_medicines").findOne({
    name: { $regex: new RegExp("^" + cleanInput.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&") + "$", "i") },
  });

  let manufacturer = globalMatch ? globalMatch.manufacturer_name || "" : "";
  let salt_composition = globalMatch
    ? `${globalMatch.short_composition1 || ""} ${globalMatch.short_composition2 || ""}`.trim()
    : "";

  // 3. Optional AI Enrichment if manufacturer/salt composition missing
  if (!manufacturer || !salt_composition) {
    try {
      const apiKey = process.env.EMERGENT_LLM_KEY || process.env.GEMINI_API_KEY;
      if (apiKey) {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        const prompt = `Return JSON for medicine "${cleanInput}": {"salt_composition": "string", "manufacturer": "string"}`;
        const result = await model.generateContent(prompt);
        const text = result.response.text().replace(/```json/gi, "").replace(/```/g, "").trim();
        const parsed = JSON.parse(text);
        if (parsed.salt_composition && !salt_composition) salt_composition = parsed.salt_composition;
        if (parsed.manufacturer && !manufacturer) manufacturer = parsed.manufacturer;
      }
    } catch (e) {
      // Ignore AI enrichment error on fallback
    }
  }

  return {
    matchedMedicine: {
      product_name: cleanInput,
      manufacturer,
      salt_composition,
      units_per_pack: 10,
      pack_type: "Strip",
      pack_price: 0,
      mrp_pack: 0,
      hsn_no: "",
    },
  };
}

/**
 * Resolver 3: Settings Loader
 */
async function loadPurchaseSettings(db, userId) {
  const userPrefs = await db.collection("user_settings").findOne({ user_id: userId });
  const prefs = userPrefs?.preferences || {};

  return {
    payment_status: prefs.purchase_payment_status || "Unpaid",
    payment_mode_mandatory: prefs.purchase_payment_mode_mandatory === true,
    default_payment_mode: prefs.purchase_payment_mode_default || "none",
    lock_unpaid_purchases: prefs.lock_unpaid_purchases === true,
  };
}

/**
 * Resolver 4: Price History & Supplier Price Checker
 */
async function checkPriceHistory(db, pharmacyId, productName, currentPrice = 0) {
  if (!productName) return null;

  const purchases = await db
    .collection("purchases")
    .find({ pharmacy_id: pharmacyId })
    .sort({ created_at: -1 })
    .toArray();

  const supplierPrices = [];
  const cleanName = productName.toLowerCase();

  for (const purchase of purchases) {
    for (const item of purchase.items || []) {
      if ((item.product_name || "").toLowerCase().includes(cleanName)) {
        const packPrice = item.pack_price || item.rate_pack || 0;
        if (packPrice > 0) {
          supplierPrices.push({
            supplier_id: purchase.supplier_id,
            supplier_name: purchase.supplier_name,
            pack_price: packPrice,
            purchase_date: purchase.purchase_date || purchase.created_at,
            invoice_no: purchase.invoice_no,
          });
        }
      }
    }
  }

  supplierPrices.sort((a, b) => a.pack_price - b.pack_price);

  const cheapest = supplierPrices.length > 0 ? supplierPrices[0] : null;
  const isHigherThanHistory =
    currentPrice > 0 && cheapest !== null && currentPrice > cheapest.pack_price;

  return {
    product_name: productName,
    historical_prices: supplierPrices,
    cheapest_option: cheapest,
    is_higher_than_history: isHigherThanHistory,
    price_difference: isHigherThanHistory ? currentPrice - cheapest.pack_price : 0,
  };
}

module.exports = {
  resolveSupplier,
  resolveMedicine,
  loadPurchaseSettings,
  checkPriceHistory,
};
