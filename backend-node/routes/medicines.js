const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const { auth } = require("../middleware/auth");

const { requireSubscription } = require("../middleware/subscription");

// Helper function to create fuzzy regex patterns
const createFuzzyRegex = (query) => {
  if (!query || query.length < 2) return null;

  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Create pattern that allows 1-2 character differences for longer words
  const chars = escaped.split("");
  const patterns = [];

  // Exact match
  patterns.push(escaped);

  // Allow one character to be optional (for typos like "para" -> "para" with missing 'c')
  if (chars.length > 3) {
    for (let i = 1; i < chars.length - 1; i++) {
      const fuzzy = [...chars.slice(0, i), "?", ...chars.slice(i + 1)].join("");
      patterns.push(fuzzy);
    }
  }

  // Allow character swaps (for typos like "acetaminophen" -> "acetaminophen")
  if (chars.length > 4) {
    for (let i = 0; i < chars.length - 1; i++) {
      const swapped = [...chars];
      [swapped[i], swapped[i + 1]] = [swapped[i + 1], swapped[i]];
      patterns.push(swapped.join(""));
    }
  }

  return patterns;
};

// Helper to calculate Levenshtein distance for ranking
const levenshteinDistance = (str1, str2) => {
  const matrix = [];
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[str2.length][str1.length];
};

// Calculate similarity score (0-100)
const calculateSimilarity = (query, text) => {
  if (!text) return 0;
  const queryLower = query.toLowerCase();
  const textLower = text.toLowerCase();

  // Exact match
  if (textLower === queryLower) return 100;

  // Starts with
  if (textLower.startsWith(queryLower)) return 90;

  // Contains
  if (textLower.includes(queryLower)) return 70;

  // Fuzzy match using Levenshtein
  const distance = levenshteinDistance(queryLower, textLower);
  const maxLen = Math.max(queryLower.length, textLower.length);
  const similarity = ((maxLen - distance) / maxLen) * 60;

  return Math.max(0, similarity);
};

// GET /api/medicines/search
router.get("/search", auth, requireSubscription(), async (req, res, next) => {
  try {
    const { q, limit = 20, fuzzy = "true" } = req.query;
    const db = mongoose.connection.db;
    const pharmacyId = req.user.pharmacy_id;

    if (!q || q.length < 2) {
      return res
        .status(400)
        .json({ detail: "Search query must be at least 2 characters" });
    }

    const searchLower = q.toLowerCase();
    const parsedLimit = parseInt(limit);
    const enableFuzzy = fuzzy === "true";

    // Build search conditions
    const searchRegex = { $regex: q, $options: "i" };

    // Create fuzzy regex patterns if enabled
    let fuzzyConditions = [];
    if (enableFuzzy && q.length > 3) {
      const fuzzyPatterns = createFuzzyRegex(q);
      fuzzyConditions = fuzzyPatterns.map((pattern) => ({
        $or: [
          { product_name: { $regex: pattern, $options: "i" } },
          { salt_composition: { $regex: pattern, $options: "i" } },
        ],
      }));
    }

    // ========== 1. SEARCH USER'S INVENTORY ==========
    const inventoryMatchStage = {
      pharmacy_id: pharmacyId,
      $or: [
        { product_name: searchRegex },
        { salt_composition: searchRegex },
        ...(enableFuzzy && fuzzyConditions.length > 0 ? fuzzyConditions : []),
      ],
    };

    const inventoryPipeline = [
      { $match: inventoryMatchStage },
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
                          regex: `^${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
                        },
                      },
                      then: 90,
                    },
                    {
                      case: {
                        $regexMatch: {
                          input: "$$nameLower",
                          regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
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
          pack_size: { $concat: [{ $toString: "$units_per_pack" }, " units"] },
          pack_size_label: {
            $concat: [{ $toString: "$units_per_pack" }, " units"],
          },
          source: "inventory",
          batch_no: "$batch_no",
          expiry_date: "$expiry_date",
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
          pack_price: "$pack_price",
          mrp_per_unit: "$mrp",
          mrp: "$mrp",
          "price(₹)": "$mrp",
          supplier_name: "$supplier.name",
          supplier_id: "$supplier_id",
          last_purchase_date: "$created_at",
          relevanceScore: "$totalScore",
          _fuzzyMatch: enableFuzzy,
        },
      },
      { $sort: { relevanceScore: -1 } },
      { $limit: parsedLimit * 3 }, // Get more for fuzzy filtering
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
          const nameSim = calculateSimilarity(q, item.product_name);
          const saltSim = calculateSimilarity(q, item.salt_composition);
          const bestSim = Math.max(nameSim, saltSim);

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

    // Get inventory product names to exclude from global search
    const inventoryProductNames = processedInventory.map((item) =>
      item.product_name?.toLowerCase()
    );

    // ========== 2. SEARCH GLOBAL MEDICINES ==========
    const globalMatchConditions = {
      $or: [
        { name: searchRegex },
        { short_composition1: searchRegex },
        { short_composition2: searchRegex },
        ...(enableFuzzy && fuzzyConditions.length > 0
          ? fuzzyConditions.map((fc) => ({
              $or: [
                { name: fc.$or[0].product_name || fc.$or[0].salt_composition },
                {
                  short_composition1:
                    fc.$or[0].product_name || fc.$or[0].salt_composition,
                },
                {
                  short_composition2:
                    fc.$or[0].product_name || fc.$or[0].salt_composition,
                },
              ],
            }))
          : []),
      ],
    };

    // Exclude inventory matches if we have them
    if (inventoryProductNames.length > 0) {
      globalMatchConditions.name = {
        ...globalMatchConditions.name,
        $nin: inventoryProductNames.map((name) => new RegExp(`^${name}$`, "i")),
      };
    }

    const globalMedicines = await db
      .collection("global_medicines")
      .find(globalMatchConditions, {
        projection: {
          _id: 0,
          id: 1,
          name: 1,
          "price(₹)": 1,
          manufacturer_name: 1,
          pack_size_label: 1,
          short_composition1: 1,
          short_composition2: 1,
        },
      })
      .limit(parsedLimit * 3)
      .toArray();

    // Process global results with fuzzy scoring
    let processedGlobal = globalMedicines.map((med) => {
      const nameSim = calculateSimilarity(q, med.name);
      const compSim = calculateSimilarity(
        q,
        `${med.short_composition1 || ""} ${med.short_composition2 || ""}`
      );
      const bestSim = Math.max(nameSim, compSim);

      return {
        ...med,
        source: "global",
        product_name: med.name,
        manufacturer: med.manufacturer_name,
        stock_status: "Not in inventory",
        available_quantity: 0,
        fuzzyScore: bestSim,
        matchQuality:
          bestSim >= 90 ? "exact" : bestSim >= 70 ? "good" : "fuzzy",
      };
    });

    if (enableFuzzy) {
      processedGlobal = processedGlobal
        .filter((item) => item.fuzzyScore > 30)
        .sort((a, b) => b.fuzzyScore - a.fuzzyScore);
    } else {
      // Standard sorting without fuzzy
      processedGlobal.sort((a, b) => {
        const aName = (a.name || "").toLowerCase();
        const bName = (b.name || "").toLowerCase();
        const aComp =
          `${a.short_composition1 || ""} ${a.short_composition2 || ""}`.toLowerCase();
        const bComp =
          `${b.short_composition1 || ""} ${b.short_composition2 || ""}`.toLowerCase();

        if (aName === searchLower) return -1;
        if (bName === searchLower) return 1;
        if (aName.startsWith(searchLower) && !bName.startsWith(searchLower))
          return -1;
        if (!aName.startsWith(searchLower) && bName.startsWith(searchLower))
          return 1;
        if (aComp.startsWith(searchLower) && !bComp.startsWith(searchLower))
          return -1;
        if (!aComp.startsWith(searchLower) && bComp.startsWith(searchLower))
          return 1;
        return 0;
      });
    }

    // ========== 3. COMBINE AND FINAL SORT ==========
    // Merge and re-rank all results
    const allResults = [...processedInventory, ...processedGlobal];

    // Final ranking: Inventory first (especially in-stock), then by fuzzy score
    const rankedResults = allResults
      .sort((a, b) => {
        // Source priority: inventory > global
        if (a.source === "inventory" && b.source === "global") {
          // Check if inventory item is in stock
          if (a.stock_status === "In Stock") return -1;
          // Out-of-stock inventory still comes before global if fuzzy score is close
          if ((a.fuzzyScore || 0) >= (b.fuzzyScore || 0) - 10) return -1;
          return 1;
        }
        if (a.source === "global" && b.source === "inventory") {
          if (b.stock_status === "In Stock") return 1;
          if ((b.fuzzyScore || 0) >= (a.fuzzyScore || 0) - 10) return 1;
          return -1;
        }

        // Both same source: sort by fuzzy score
        return (b.fuzzyScore || 0) - (a.fuzzyScore || 0);
      })
      .slice(0, parsedLimit);

    res.json({
      medicines: rankedResults,
      meta: {
        total_inventory: processedInventory.length,
        total_global: processedGlobal.length,
        returned: rankedResults.length,
        query: q,
        fuzzy_enabled: enableFuzzy,
        match_breakdown: {
          exact: rankedResults.filter((r) => r.matchQuality === "exact").length,
          good: rankedResults.filter((r) => r.matchQuality === "good").length,
          fuzzy: rankedResults.filter((r) => r.matchQuality === "fuzzy").length,
        },
      },
    });
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

      const parsedLimit = parseInt(limit);
      const searchLower = q.toLowerCase();

      // Quick prefix search with fallback to fuzzy
      let inventoryResults = await db
        .collection("inventory")
        .find(
          {
            pharmacy_id: pharmacyId,
            $or: [
              { product_name: { $regex: `^${q}`, $options: "i" } },
              { product_name: { $regex: q, $options: "i" } },
            ],
          },
          {
            projection: {
              _id: 0,
              product_name: 1,
              product_id: 1,
              available_quantity: 1,
              source: { $literal: "inventory" },
            },
          }
        )
        .limit(parsedLimit)
        .toArray();

      // If few results, try fuzzy
      if (inventoryResults.length < 3 && q.length > 3) {
        const fuzzyPattern = q.split("").join(".*?");
        const fuzzyResults = await db
          .collection("inventory")
          .find(
            {
              pharmacy_id: pharmacyId,
              product_name: { $regex: fuzzyPattern, $options: "i" },
              product_name: { $not: { $regex: `^${q}`, $options: "i" } }, // Exclude already found
            },
            {
              projection: {
                _id: 0,
                product_name: 1,
                product_id: 1,
                available_quantity: 1,
                source: { $literal: "inventory" },
              },
            }
          )
          .limit(parsedLimit - inventoryResults.length)
          .toArray();

        inventoryResults = [...inventoryResults, ...fuzzyResults];
      }

      // Global medicines suggestions
      const globalResults = await db
        .collection("global_medicines")
        .find(
          {
            name: { $regex: `^${q}`, $options: "i" },
          },
          {
            projection: {
              _id: 0,
              name: 1,
              id: 1,
              source: { $literal: "global" },
            },
          }
        )
        .limit(parsedLimit)
        .toArray();

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
          .filter((r) => !seen.has(r.name.toLowerCase()))
          .map((r) => ({
            text: r.name,
            value: r.id,
            source: "global",
            inStock: false,
          })),
      ].slice(0, parsedLimit);

      res.json({
        suggestions: combined,
        query: q,
      });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
