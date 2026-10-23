const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const { auth } = require("../middleware/auth");

const { requireSubscription } = require("../middleware/subscription");
const { medicineKey } = require("../services/search/normalize");

const {
  searchGlobalMedicines,
  tenantTokenMatch,
  scoreMatch,
  batchMatchScore,
} = require("../services/search/medicineSearch");

// Safe regex escaping helper
const escapeRegex = (str) => {
  if (!str) return "";
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

// Normalize medicine name for cross-collection deduplication
// Same medicine, same key: pack counts, punctuation and form spellings
// ("TAB"/"Tablet") don't make catalog and global results look different
const normalizeMedName = (str) => medicineKey(str);

// POST & GET /api/medicines/enrich (AI Autofill)
router.all("/enrich", auth, requireSubscription(), async (req, res, next) => {
  try {
    const productNameRaw =
      req.body?.product_name ||
      req.body?.name ||
      req.query?.product_name ||
      req.query?.name ||
      req.query?.q;

    const product_name = (productNameRaw || "").trim();
    if (!product_name) {
      return res.status(400).json({ detail: "Product name required" });
    }

    const { GoogleGenerativeAI } = require("@google/generative-ai");
    const apiKey = process.env.EMERGENT_LLM_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.json({ salt_composition: "", manufacturer: "" });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt = `You are a pharmaceutical database system.

For the medicine named "${product_name}", return:
1. Exact active salt composition
2. Official marketing company (brand owner / manufacturer)
3. Standard dosage form (e.g. tablet, capsule, syrup, injection, ointment, drops, etc.)
4. Standard pack type (Strip, Bottle, Tube, Packet, Box, Unit)
5. Standard units per pack (integer number)

STRICT RULES:
- Do NOT guess
- Do NOT hallucinate
- If unsure of a field, return empty string or null
- Prefer well-known verified pharma companies only

Respond ONLY in JSON format:
{
  "salt_composition": "string",
  "manufacturer": "string",
  "dosage_form": "string",
  "pack_type": "string",
  "units_per_pack": 10
}
`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    // Parse JSON safely
    const jsonStr = text
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();
    let parsed = {};
    try {
      parsed = JSON.parse(jsonStr);
    } catch (e) {
      console.error("Failed to parse Gemini JSON:", jsonStr);
    }

    res.json({
      salt_composition: parsed.salt_composition || "",
      manufacturer: parsed.manufacturer || "",
      dosage_form: parsed.dosage_form || "",
      pack_type: parsed.pack_type || "",
      units_per_pack: parsed.units_per_pack || null,
    });
  } catch (error) {
    console.error("Gemini enrichment error:", error);
    res.json({ salt_composition: "", manufacturer: "" }); // Safe fallback
  }
});

// GET /api/medicines/search
router.get("/search", auth, requireSubscription(), async (req, res, next) => {
  try {
    const { q, limit = 20, fuzzy = "true", page = 1 } = req.query;
    const db = mongoose.connection.db;
    const pharmacyId = req.user.pharmacy_id;

    if (!q || q.length < 2) {
      return res
        .status(400)
        .json({ detail: "Search query must be at least 2 characters" });
    }

    // Not cached: results carry live stock. The global catalogue layer is
    // cached inside searchGlobalMedicines.
    const trimmedQ = String(q).trim();
    const searchLower = trimmedQ.toLowerCase();
    const parsedLimit = Math.min(parseInt(limit) || 20, 100);
    const parsedPage = Math.max(parseInt(page) || 1, 1);
    const skip = (parsedPage - 1) * parsedLimit;
    // Fixed candidate pool so ranking (and therefore paging) is stable
    const internalLimit = Math.max(200, parsedLimit * parsedPage);
    const enableFuzzy = fuzzy === "true";

    const escapedQ = escapeRegex(trimmedQ);

    // ========== 1. SEARCH USER'S CUSTOM PRODUCT CATALOG (products collection) ==========
    let processedCatalog = [];
    const seenNormalizedNames = new Set();
    const seenProductIds = new Set();
    const catalogProductNames = new Set();
    try {
      const catalogQuery = {
        pharmacy_id: pharmacyId,
        ...tenantTokenMatch(trimmedQ, ["name", "product_name", "salt_composition", "manufacturer"]),
      };

      const catalogMatches = await db
        .collection("products")
        .find(catalogQuery)
        .limit(internalLimit)
        .toArray();

      // Batch-fetch inventory batches for all catalog items in ONE query
      const catalogIds = catalogMatches.map(c => c.id).filter(Boolean);
      const catalogNames = catalogMatches.map(c => c.name || c.product_name).filter(Boolean);
      let allCatalogBatches = [];
      if (catalogIds.length > 0 || catalogNames.length > 0) {
        allCatalogBatches = await db.collection("inventory").find({
          pharmacy_id: pharmacyId,
          $or: [
            ...(catalogIds.length > 0 ? [{ product_id: { $in: catalogIds } }] : []),
            ...(catalogNames.length > 0 ? [{ product_name: { $in: catalogNames } }] : [])
          ]
        }).toArray();
      }

      const batchesByProductId = new Map();
      const batchesByProductName = new Map();
      for (const b of allCatalogBatches) {
        if (b.product_id) {
          const pid = String(b.product_id);
          if (!batchesByProductId.has(pid)) batchesByProductId.set(pid, []);
          batchesByProductId.get(pid).push(b);
        }
        if (b.product_name) {
          const pnm = b.product_name.toLowerCase();
          if (!batchesByProductName.has(pnm)) batchesByProductName.set(pnm, []);
          batchesByProductName.get(pnm).push(b);
        }
      }

      for (const cp of catalogMatches) {
        const pName = (cp.name || cp.product_name || "").trim();
        if (!pName) continue;
        const norm = normalizeMedName(pName);
        if (seenNormalizedNames.has(norm)) continue;
        seenNormalizedNames.add(norm);
        if (cp.id) seenProductIds.add(String(cp.id));
        if (cp.product_id) seenProductIds.add(String(cp.product_id));
        catalogProductNames.add(pName.toLowerCase());

        const batches = (cp.id && batchesByProductId.get(String(cp.id))) ||
          batchesByProductName.get(pName.toLowerCase()) || [];
        const totalStock = batches.reduce((sum, b) => sum + (b.available_quantity || 0), 0);
        const firstBatch = batches[0] || null;

        const pUnits = cp.units_per_pack || firstBatch?.units_per_pack || 1;
        const pMrp = typeof cp.mrp === "number" && cp.mrp > 0
          ? cp.mrp
          : (firstBatch?.mrp_pack || (firstBatch?.mrp ? firstBatch.mrp * pUnits : 0));
        const pUnitMrp = typeof cp.unit_mrp === "number" && cp.unit_mrp > 0
          ? cp.unit_mrp
          : (pMrp > 0 && pUnits > 0 ? parseFloat((pMrp / pUnits).toFixed(2)) : 0);
        const pTrade = typeof cp.trade_price === "number" && cp.trade_price > 0
          ? cp.trade_price
          : (typeof cp.purchase_price === "number" && cp.purchase_price > 0
            ? cp.purchase_price
            : (firstBatch?.pack_price || (firstBatch?.purchase_price ? firstBatch.purchase_price * pUnits : (pMrp > 0 ? parseFloat((pMrp * 0.7).toFixed(2)) : 0))));

        const pPack = cp.package_details || cp.packaging_label || `${pUnits} ${cp.dosage_form || "units"}`;
        const pTaxRate = cp.tax_rate !== undefined ? cp.tax_rate : 5;
        const pCgst = cp.cgst !== undefined ? cp.cgst : pTaxRate / 2;
        const pSgst = cp.sgst !== undefined ? cp.sgst : pTaxRate / 2;
        const pHsn = cp.hsn_no || cp.hsn_code || firstBatch?.hsn_no || "";

        // Matched every query token in the DB filter, so floor the score
        const bestSim = scoreMatch(trimmedQ, pName, cp.salt_composition || "") || 35;

        processedCatalog.push({
          _id: cp._id ? String(cp._id) : undefined,
          id: cp.id,
          product_id: cp.id,
          product_code: `MED-${cp.id}`,
          name: pName,
          product_name: pName,
          source: totalStock > 0 ? "inventory" : "catalog",
          is_custom_catalog: true,
          manufacturer: cp.manufacturer || firstBatch?.manufacturer || "",
          manufacturer_name: cp.manufacturer || firstBatch?.manufacturer || "",
          salt_composition: cp.salt_composition || firstBatch?.salt_composition || "",
          short_composition1: cp.salt_composition || firstBatch?.salt_composition || "",
          category: cp.category || "medicine",
          dosage_form: cp.dosage_form || firstBatch?.pack_type || "tablet",
          pack_type: cp.pack_type || firstBatch?.pack_type || "Strip",
          units_per_pack: pUnits,
          units: pUnits,
          packaging_label: cp.packaging_label || pPack,
          package_details: pPack,
          pack_size: pPack,
          pack_size_label: pPack,
          hsn_no: pHsn,
          hsn_code: pHsn,
          tax_rate: pTaxRate,
          cgst: pCgst,
          sgst: pSgst,
          mrp: pMrp,
          "price(₹)": pMrp,
          unit_mrp: pUnitMrp,
          mrp_per_unit: pUnitMrp,
          trade_price: pTrade,
          purchase_price: pTrade,
          rate_pack: pTrade,
          available_quantity: totalStock,
          stock_status: totalStock > 0 ? "In Stock" : "My Catalog",
          batch_no: firstBatch?.batch_no || "",
          expiry_date: firstBatch?.expiry_date || "",
          batches: batches.map(b => ({
            id: b.id,
            batch_no: b.batch_no,
            expiry_date: b.expiry_date,
            available_quantity: b.available_quantity,
            purchase_price: b.purchase_price,
            mrp: b.mrp,
          })),
          fuzzyScore: 100 + bestSim,
          matchQuality: "exact",
        });
      }
    } catch (catErr) {
      console.error("Catalog search error in medicines route:", catErr.message);
    }

    // ========== 2. SEARCH USER'S INVENTORY ==========
    const inventoryMatchStage = {
      pharmacy_id: pharmacyId,
      ...(catalogProductNames.size > 0
        ? { product_name: { $nin: Array.from(catalogProductNames).map(n => new RegExp(`^${escapeRegex(n)}$`, "i")) } }
        : {}),
      ...tenantTokenMatch(trimmedQ, ["product_name", "salt_composition"], {
        wholeQueryFields: ["batch_no"],
      }),
    };

    const inventoryPipeline = [
      { $match: inventoryMatchStage },
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
          product_id: { $first: "$product_id" },
          product_name: { $first: "$product_name" },
          manufacturer: { $first: "$manufacturer" },
          salt_composition: { $first: "$salt_composition" },
          hsn_no: { $first: "$hsn_no" },
          pack_type: { $first: "$pack_type" },
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
              units_per_pack: "$units_per_pack",
              pack_type: "$pack_type",
              pack_price: "$pack_price",
              mrp_pack: "$mrp_pack",
              purchase_price: "$purchase_price",
              mrp: "$mrp",
              cgst: "$cgst",
              sgst: "$sgst",
              supplier_name: "$batch_supplier.name"
            }
          }
        }
      },
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
      {
        $addFields: {
          // Calculate relevance scores for ranking
          nameScore: {
            $let: {
              vars: {
                nameLower: { $toLower: "$product_name" },
                queryLower: searchLower,
              },
              in: {
                $switch: {
                  branches: [
                    {
                      case: { $eq: ["$$nameLower", "$$queryLower"] },
                      then: 100,
                    },
                    {
                      case: {
                        $regexMatch: {
                          input: "$$nameLower",
                          regex: `^${escapedQ}`,
                          options: "i",
                        },
                      },
                      then: 90,
                    },
                    {
                      case: {
                        $regexMatch: {
                          input: "$$nameLower",
                          regex: escapedQ,
                          options: "i",
                        },
                      },
                      then: 70,
                    },
                  ],
                  default: 50,
                },
              },
            },
          },
          stockScore: {
            $cond: {
              if: { $gt: ["$available_quantity", 0] },
              then: 10,
              else: 0,
            },
          },
        },
      },
      {
        $addFields: {
          totalScore: { $add: ["$nameScore", "$stockScore"] },
        },
      },
      {
        $project: {
          _id: 0,
          id: "$product_id",
          name: "$product_name",
          product_name: "$product_name",
          manufacturer: "$manufacturer",
          manufacturer_name: "$manufacturer",
          salt_composition: "$salt_composition",
          short_composition1: "$salt_composition",
          pack_size: { $concat: [{ $toString: { $ifNull: ["$units_per_pack", 1] } }, " units"] },
          pack_size_label: {
            $concat: [{ $toString: { $ifNull: ["$units_per_pack", 1] } }, " units"],
          },
          source: "inventory",
          batches: "$batches",
          batch_no: { $let: { vars: { firstBatch: { $first: "$batches" } }, in: "$$firstBatch.batch_no" } },
          expiry_date: { $let: { vars: { firstBatch: { $first: "$batches" } }, in: "$$firstBatch.expiry_date" } },
          available_quantity: "$available_quantity",
          quantity: "$quantity",
          stock_status: {
            $cond: {
              if: { $gt: ["$available_quantity", 0] },
              then: "In Stock",
              else: "Out of Stock",
            },
          },
          purchase_price: "$purchase_price",
          mrp_per_unit: "$mrp",
          mrp: "$mrp",
          units_per_pack: "$units_per_pack",
          pack_type: "$pack_type",
          hsn_no: "$hsn_no",
          cgst: "$cgst",
          sgst: "$sgst",
          "price(₹)": "$mrp",
          supplier_name: "$supplier.name",
          supplier_id: "$supplier_id",
          last_purchase_date: "$created_at",
          relevanceScore: "$totalScore",
          _fuzzyMatch: enableFuzzy,
        },
      },
      { $sort: { relevanceScore: -1 } },
      { $limit: internalLimit }, // Get more for fuzzy filtering
    ];

    const inventoryResults = await db
      .collection("inventory")
      .aggregate(inventoryPipeline)
      .toArray();

    // Post-process fuzzy scoring for inventory
    let processedInventory = inventoryResults;
    if (enableFuzzy) {
      processedInventory = inventoryResults
        .map((item) => {
          const bestSim =
            Math.max(
              scoreMatch(trimmedQ, item.product_name, item.salt_composition || ""),
              batchMatchScore(trimmedQ, item.batches)
            ) || 35;

          // Boost score for in-stock items
          const stockBoost = item.stock_status === "In Stock" ? 10 : 0;

          return {
            ...item,
            fuzzyScore: bestSim + stockBoost,
            matchQuality:
              bestSim >= 90 ? "exact" : bestSim >= 70 ? "good" : "fuzzy",
          };
        })
        .filter((item) => item.fuzzyScore > 30) // Filter low-quality matches
        .sort((a, b) => b.fuzzyScore - a.fuzzyScore);
    }

    // Deduplicate inventory against custom catalog
    const deduplicatedInventory = [];
    for (const item of processedInventory) {
      const norm = normalizeMedName(item.product_name);
      if (seenNormalizedNames.has(norm)) continue;
      if (item.id && seenProductIds.has(String(item.id))) continue;
      if (item.product_id && seenProductIds.has(String(item.product_id))) continue;

      seenNormalizedNames.add(norm);
      if (item.id) seenProductIds.add(String(item.id));
      if (item.product_id) seenProductIds.add(String(item.product_id));
      deduplicatedInventory.push(item);
    }

    // ========== 3. SEARCH GLOBAL MEDICINES (Centralized Prod DB) ==========
    let processedGlobal = [];
    try {
      // Index-backed n-gram lookup, ranked and deduped by normalised name
      const rawGlobal = await searchGlobalMedicines(trimmedQ, { limit: internalLimit });

      // Map raw documents into unified contract for frontend and DEDUPLICATE against local catalog/inventory!
      const deduplicatedGlobal = [];
      for (const med of rawGlobal) {
        const medName = (med.name || med.product_name || "").trim();
        if (!medName) continue;
        const norm = normalizeMedName(medName);

        // Strict Check: If this medicine is already in local catalog or local inventory, SKIP IT!
        if (seenNormalizedNames.has(norm)) continue;
        if (med.product_id && seenProductIds.has(String(med.product_id))) continue;
        if (med.id && seenProductIds.has(String(med.id))) continue;

        seenNormalizedNames.add(norm);
        if (med.product_id) seenProductIds.add(String(med.product_id));
        if (med.id) seenProductIds.add(String(med.id));

        const medMfg = med.manufacturer_name || med.manufacturer || "";
        const medSalt = med.active_ingredients || [med.short_composition1, med.short_composition2].map(s => (s || "").trim()).filter(Boolean).join(", ") || "";
        const medMrp = typeof med.mrp === "number" ? med.mrp : (parseFloat(med["price(₹)"]) || 0);

        // Parse units per pack from pack_size_label if units_per_pack is missing
        let medUnits = typeof med.units_per_pack === "number" && med.units_per_pack > 0 ? med.units_per_pack : 1;
        const packLabel = med.packaging_label || med.package_details || med.pack_size_label || med.pack_size || "";
        if (medUnits <= 1 && packLabel) {
          const matchNum = packLabel.match(/\d+/);
          if (matchNum) {
            const parsed = parseInt(matchNum[0]);
            if (!isNaN(parsed) && parsed > 0 && parsed <= 500) {
              medUnits = parsed;
            }
          }
        }

        const medUnitMrp = typeof med.unit_mrp === "number" && med.unit_mrp > 0
          ? med.unit_mrp
          : (medUnits > 0 && medMrp > 0 ? parseFloat((medMrp / medUnits).toFixed(2)) : medMrp);
        const medSellingPrice = typeof med.selling_price === "number" ? med.selling_price : (parseFloat(med.price) || medMrp);
        const medTradePrice = typeof med.trade_price === "number" && med.trade_price > 0
          ? med.trade_price
          : (typeof med.purchase_price === "number" && med.purchase_price > 0 ? med.purchase_price : parseFloat((medMrp * 0.7).toFixed(2)));
        const medTaxRate = typeof med.tax_rate === "number" ? med.tax_rate : (med.gst_percentage || 5);
        const medHsn = med.hsn_code || med.hsn_no || "300490";

        // Extract dosage form
        let medDosage = med.dosage_form || "";
        if (!medDosage && packLabel) {
          const lowerPack = packLabel.toLowerCase();
          if (lowerPack.includes("tablet")) medDosage = "tablet";
          else if (lowerPack.includes("capsule")) medDosage = "capsule";
          else if (lowerPack.includes("syrup") || lowerPack.includes("suspension")) medDosage = "syrup";
          else if (lowerPack.includes("injection")) medDosage = "injection";
          else if (lowerPack.includes("gel") || lowerPack.includes("ointment")) medDosage = "gel";
          else if (lowerPack.includes("drop")) medDosage = "drops";
        }

        const bestSim = med._score || 0;

        deduplicatedGlobal.push({
          _id: med._id ? String(med._id) : undefined,
          id: med.product_id || med.id || (med._id ? String(med._id) : undefined),
          product_id: med.product_id || med.id || (med._id ? String(med._id) : undefined),
          product_code: med.product_code || `MED-${med.product_id || med.id || ""}`,
          product_slug: med.product_slug || "",
          name: medName,
          product_name: medName,
          brand: med.brand || "",
          manufacturer: medMfg,
          manufacturer_name: medMfg,
          dosage_form: medDosage || "tablet",
          product_category: med.product_category || med.type || "allopathy",
          packaging_label: packLabel || `${medUnits} units`,
          package_details: packLabel || `${medUnits} units`,
          pack_size: packLabel || `${medUnits} units`,
          pack_size_label: packLabel || `${medUnits} units`,
          pack_type: med.pack_type || (medDosage === "syrup" ? "Bottle" : "Strip"),
          units_per_pack: medUnits,
          mrp: medMrp,
          "price(₹)": medMrp,
          unit_mrp: medUnitMrp,
          mrp_per_unit: medUnitMrp,
          selling_price: medSellingPrice,
          trade_price: medTradePrice,
          purchase_price: medTradePrice,
          rate_pack: medTradePrice,
          tax_rate: medTaxRate,
          cgst: medTaxRate / 2,
          sgst: medTaxRate / 2,
          hsn_code: medHsn,
          hsn_no: medHsn,
          salt_composition: medSalt,
          short_composition1: medSalt,
          short_composition2: "",
          active_ingredients: medSalt,
          prescription_required: med.prescription_required || false,
          image_url: med.image_url || med.image || "",
          thumbnail_url: med.thumbnail_url || med.thumb_image || "",
          rank_score: med.rank_score || med.popularity_score || 0,
          source: "global",
          stock_status: "Global Catalog",
          available_quantity: 0,
          fuzzyScore: bestSim,
          matchQuality: bestSim >= 90 ? "exact" : bestSim >= 70 ? "good" : "fuzzy",
        });
      }
      processedGlobal = deduplicatedGlobal;
    } catch (globalErr) {
      console.error("Global medicines search error:", globalErr.message);
    }

    // ========== 4. COMBINE AND FINAL SORT ==========
    // "if keywords matches closely to any catalog in inventory show that first below from. global_medicines"
    const allResults = [...processedCatalog, ...deduplicatedInventory, ...processedGlobal];

    const rankedResults = allResults.sort((a, b) => {
      const aIsLocal = a.is_custom_catalog || a.source === "catalog" || a.source === "inventory";
      const bIsLocal = b.is_custom_catalog || b.source === "catalog" || b.source === "inventory";

      const aScore = a.fuzzyScore || 0;
      const bScore = b.fuzzyScore || 0;

      // Close match threshold: score >= 60 means name starts with or closely matches keyword
      const aCloseMatch = aIsLocal && aScore >= 60;
      const bCloseMatch = bIsLocal && bScore >= 60;

      // 1. Closely matching catalog/inventory items ALWAYS come FIRST!
      if (aCloseMatch && !bCloseMatch) return -1;
      if (!aCloseMatch && bCloseMatch) return 1;

      // 2. If both are closely matching local items:
      if (aCloseMatch && bCloseMatch) {
        if (bScore !== aScore) return bScore - aScore;
        const aInStock = (a.available_quantity || 0) > 0;
        const bInStock = (b.available_quantity || 0) > 0;
        if (aInStock && !bInStock) return -1;
        if (!aInStock && bInStock) return 1;
        if (a.is_custom_catalog && !b.is_custom_catalog) return -1;
        if (!a.is_custom_catalog && b.is_custom_catalog) return 1;
      }

      // 3. Otherwise sort by relevance / fuzzy score
      if (bScore !== aScore) {
        return bScore - aScore;
      }

      // 4. If same relevance score, prefer local over global
      if (aIsLocal && !bIsLocal) return -1;
      if (!aIsLocal && bIsLocal) return 1;

      // 5. Deterministic order for local ties so pages never overlap
      // (global items keep their popularity order from the catalogue).
      if (aIsLocal && bIsLocal) {
        return (a.product_name || "").localeCompare(b.product_name || "");
      }
      return 0;
    });

    const paginatedResults = rankedResults.slice(skip, skip + parsedLimit);
    const has_more = rankedResults.length > skip + parsedLimit;

    const responsePayload = {
      medicines: paginatedResults,
      meta: {
        total_catalog: processedCatalog.length,
        total_inventory: processedInventory.length,
        total_global: processedGlobal.length,
        returned: paginatedResults.length,
        has_more,
        current_page: parsedPage,
        query: q,
        fuzzy_enabled: enableFuzzy,
        match_breakdown: {
          exact: paginatedResults.filter((r) => r.matchQuality === "exact")
            .length,
          good: paginatedResults.filter((r) => r.matchQuality === "good")
            .length,
          fuzzy: paginatedResults.filter((r) => r.matchQuality === "fuzzy")
            .length,
        },
      },
    };

    res.json(responsePayload);
  } catch (error) {
    next(error);
  }
});

// GET /api/medicines/search-suggestions
// Lightweight endpoint for autocomplete with fuzzy support
router.get(
  "/search-suggestions",
  auth,
  requireSubscription(),
  async (req, res, next) => {
    try {
      const { q, limit = 10 } = req.query;
      const db = mongoose.connection.db;
      const pharmacyId = req.user.pharmacy_id;

      if (!q || q.length < 1) {
        return res.json({ suggestions: [] });
      }

      const parsedLimit = Math.min(parseInt(limit) || 10, 50);

      let inventoryResults = await db
        .collection("inventory")
        .aggregate([
          {
            $match: {
              pharmacy_id: pharmacyId,
              ...tenantTokenMatch(q, ["product_name"], { wholeQueryFields: ["batch_no"] }),
            }
          },
          {
            $group: {
              _id: "$product_name",
              product_name: { $first: "$product_name" },
              product_id: { $first: "$product_id" },
              batch_no: { $first: "$batch_no" },
              mrp: { $first: "$mrp" },
              units_per_pack: { $first: "$units_per_pack" },
              pack_type: { $first: "$pack_type" },
              available_quantity: { $sum: "$available_quantity" }
            }
          },
          { $limit: parsedLimit }
        ])
        .toArray();

      // Global medicines suggestions with projection
      let globalResults = [];
      try {
        globalResults = await searchGlobalMedicines(q, { limit: parsedLimit });
      } catch (err2) {
        console.warn("Global suggestions lookup failed:", err2.message);
      }

      // Combine and deduplicate
      const seen = new Set(
        inventoryResults.map((r) => r.product_name.toLowerCase())
      );
      const combined = [
        ...inventoryResults.map((r) => ({
          text: r.product_name,
          value: r.product_id,
          source: "inventory",
          inStock: r.available_quantity > 0,
        })),
        ...globalResults
          .filter((r) => !seen.has((r.product_name || r.name || "").toLowerCase()))
          .map((r) => ({
            text: r.name || r.product_name,
            value: r.product_id || r.id,
            source: "global",
            inStock: false,
            manufacturer: r.manufacturer_name || r.manufacturer,
            mrp: r.mrp,
          })),
      ].slice(0, parsedLimit);

      const resultPayload = {
        suggestions: combined,
        query: q,
      };

      res.json(resultPayload);
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
