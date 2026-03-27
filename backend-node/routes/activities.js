const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const { auth } = require("../middleware/auth");
const { requireSubscription } = require("../middleware/subscription");

// GET /api/activities
router.get("/", auth, requireSubscription(), async (req, res, next) => {
  try {
    const { page = 1, limit = 30, module } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const db = mongoose.connection.db;

    const query = { pharmacy_id: req.user.pharmacy_id };
    if (module) {
        query.module = module;
    }

    const activities = await db.collection("activities").aggregate([
      { $match: query },
      { $sort: { created_at: -1 } },
      { $skip: skip },
      { $limit: parseInt(limit) },
      {
        $lookup: {
          from: "users",
          localField: "user_id",
          foreignField: "id",
          as: "user"
        }
      },
      {
        $unwind: {
          path: "$user",
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $project: {
          _id: 0,
          id: 1,
          pharmacy_id: 1,
          user_id: 1,
          user_name: 1,
          type: 1,
          module: 1,
          entity_id: 1,
          description: 1,
          link: 1,
          created_at: 1,
          user_image: "$user.image_url"
        }
      }
    ]).toArray();

    const total = await db.collection("activities").countDocuments(query);
    const has_more = skip + activities.length < total;

    res.json({ activities, has_more, total });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
