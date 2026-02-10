const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

// GET /api/medicines/search
router.get("/search", async (req, res, next) => {
  try {
    const { q, limit = 20 } = req.query;
    const db = mongoose.connection.db;

    if (!q || q.length < 2) {
      return res
        .status(400)
        .json({ detail: "Search query must be at least 2 characters" });
    }

    const searchRegex = { $regex: q, $options: "i" };

    let medicines = await db
      .collection("global_medicines")
      .find(
        {
          $or: [
            { name: searchRegex },
            { short_composition1: searchRegex },
            { short_composition2: searchRegex },
          ],
        },
        {
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
        }
      )
      .limit(parseInt(limit) * 2)
      .toArray();

    const searchLower = q.toLowerCase();

    medicines.sort((a, b) => {
      const aName = (a.name || "").toLowerCase();
      const bName = (b.name || "").toLowerCase();

      const aComp =
        `${a.short_composition1 || ""} ${a.short_composition2 || ""}`.toLowerCase();
      const bComp =
        `${b.short_composition1 || ""} ${b.short_composition2 || ""}`.toLowerCase();

      // Exact match (name)
      if (aName === searchLower) return -1;
      if (bName === searchLower) return 1;

      // Starts with (name)
      if (aName.startsWith(searchLower) && !bName.startsWith(searchLower))
        return -1;
      if (!aName.startsWith(searchLower) && bName.startsWith(searchLower))
        return 1;

      // Starts with (composition)
      if (aComp.startsWith(searchLower) && !bComp.startsWith(searchLower))
        return -1;
      if (!aComp.startsWith(searchLower) && bComp.startsWith(searchLower))
        return 1;

      // Contains
      if (aName.includes(searchLower) && !bName.includes(searchLower))
        return -1;
      if (!aName.includes(searchLower) && bName.includes(searchLower)) return 1;

      return 0;
    });

    res.json({
      medicines: medicines.slice(0, parseInt(limit)),
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
