// Admin broadcasts (announcements, offers, coming-soon features) as the
// signed-in user sees them.
//
// Broadcasts are written by the admin panel into `broadcasts`; nothing is
// pushed to users. Each request returns what is live for this user right now,
// so someone who was signed out when a broadcast went out sees it on their
// next visit, and an expired one is simply gone. COMING_SOON items stay in the
// "Coming soon" list until the admin archives them, and can't be cleared.
//
// Per-user state (seen, opened, clicked, banner dismissed, cleared) lives in
// `broadcast_receipts`, one row per broadcast and user; the admin panel counts
// those rows for reach.
const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const { z } = require("zod");
const { auth } = require("../middleware/auth");

const BROADCASTS = "broadcasts";
const RECEIPTS = "broadcast_receipts";
const ASSETS = "broadcast_assets";

async function ensureIndexes(db) {
  await Promise.all([
    db.collection(RECEIPTS).createIndex({ broadcast_id: 1, user_id: 1 }, { unique: true, name: "broadcast_user" }),
    db.collection(RECEIPTS).createIndex({ user_id: 1 }, { name: "user" }),
    db.collection(BROADCASTS).createIndex({ id: 1 }, { unique: true, name: "id" }),
    db.collection(BROADCASTS).createIndex({ status: 1, starts_at: 1 }, { name: "status_start" }),
    db.collection(ASSETS).createIndex({ id: 1 }, { unique: true, name: "id" }),
  ]);
}

// Live for this user: published, started, not expired (coming-soon items
// outlive their banner window) and in the audience.
function liveFilter(user, now = new Date()) {
  const audience = [
    { "audience.type": "ALL" },
    { "audience.type": "PHARMACIES", "audience.pharmacy_ids": user.pharmacy_id },
    { "audience.type": "USERS", "audience.user_ids": user.id },
  ];
  const filter = {
    status: "PUBLISHED",
    starts_at: { $lte: now },
    $and: [
      { $or: [{ kind: "COMING_SOON" }, { expires_at: null }, { expires_at: { $gt: now } }] },
      { $or: audience },
    ],
  };
  // "Pharmacy admins only" broadcasts skip staff logins
  if (user.role !== "ADMIN") filter["audience.admins_only"] = { $ne: true };
  return filter;
}

// What the app needs; audience lists and admin bookkeeping stay server-side
const PUBLIC_PROJECTION = {
  _id: 0,
  id: 1,
  kind: 1,
  title: 1,
  summary: 1,
  emoji: 1,
  theme: 1,
  banner: 1,
  cover: 1,
  blocks: 1,
  cta: 1,
  display: 1,
  pinned: 1,
  eta_label: 1,
  starts_at: 1,
  expires_at: 1,
  published_at: 1,
};

// The banner stops at expires_at even for coming-soon items
const bannerLive = (b, now) => !b.expires_at || new Date(b.expires_at) > now;

/**
 * GET /api/broadcasts
 * Everything live for the current user, newest first, with their own state.
 */
router.get("/", auth, async (req, res, next) => {
  try {
    const db = mongoose.connection.db;
    const now = new Date();
    const rows = await db.collection(BROADCASTS).find(liveFilter(req.user, now), { projection: PUBLIC_PROJECTION }).sort({ pinned: -1, starts_at: -1 }).limit(100).toArray();
    const receipts = rows.length
      ? await db
          .collection(RECEIPTS)
          .find({ user_id: req.user.id, broadcast_id: { $in: rows.map((r) => r.id) } }, { projection: { _id: 0 } })
          .toArray()
      : [];
    const byId = new Map(receipts.map((r) => [r.broadcast_id, r]));
    const items = rows
      .map((b) => {
        const r = byId.get(b.id) || {};
        return {
          ...b,
          state: {
            seen: !!r.seen_at,
            opened: !!r.opened_at,
            banner_dismissed: !!r.banner_dismissed_at,
            cleared: !!r.cleared_at,
            banner_live: bannerLive(b, now),
          },
        };
      })
      // Cleared updates are gone for this user; coming-soon items can't be cleared
      .filter((b) => b.kind === "COMING_SOON" || !b.state.cleared);
    res.json({ items, unread: items.filter((b) => !b.state.opened && (b.kind !== "COMING_SOON" || b.state.banner_live)).length });
  } catch (error) {
    next(error);
  }
});

const eventSchema = z.object({ type: z.enum(["seen", "open", "click", "dismiss", "clear"]) });

// Receipt update per event. $min sets a timestamp the first time only.
const EVENT_UPDATE = {
  seen: (now) => ({ $min: { seen_at: now } }),
  open: (now) => ({ $min: { seen_at: now, opened_at: now } }),
  click: (now) => ({ $min: { seen_at: now, opened_at: now, clicked_at: now }, $inc: { click_count: 1 } }),
  dismiss: (now) => ({ $min: { seen_at: now }, $set: { banner_dismissed_at: now } }),
  clear: (now) => ({ $min: { seen_at: now }, $set: { cleared_at: now, banner_dismissed_at: now } }),
};

async function recordEvent(db, user, broadcast, type, now = new Date()) {
  const update = EVENT_UPDATE[type](now);
  update.$setOnInsert = { broadcast_id: broadcast.id, user_id: user.id, pharmacy_id: user.pharmacy_id, created_at: now };
  update.$set = { ...(update.$set || {}), updated_at: now };
  await db.collection(RECEIPTS).updateOne({ broadcast_id: broadcast.id, user_id: user.id }, update, { upsert: true }).catch(async (err) => {
    // Two first events at once: the other upsert created the row
    if (err.code !== 11000) throw err;
    delete update.$setOnInsert;
    await db.collection(RECEIPTS).updateOne({ broadcast_id: broadcast.id, user_id: user.id }, update);
  });
}

/**
 * POST /api/broadcasts/:id/event  { type: seen | open | click | dismiss | clear }
 * Only for a broadcast that is live for this user.
 */
router.post("/:id/event", auth, async (req, res, next) => {
  try {
    const parsed = eventSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ detail: "Unknown event" });
    const { type } = parsed.data;
    const db = mongoose.connection.db;
    const broadcast = await db.collection(BROADCASTS).findOne({ ...liveFilter(req.user), id: String(req.params.id) }, { projection: { _id: 0, id: 1, kind: 1 } });
    if (!broadcast) return res.status(404).json({ detail: "This update is no longer available" });
    if (type === "clear" && broadcast.kind === "COMING_SOON") return res.status(400).json({ detail: "Coming-soon items stay until the feature ships" });
    await recordEvent(db, req.user, broadcast, type);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/broadcasts/clear-all
 * Clears every live update for this user (coming-soon items stay).
 */
router.post("/clear-all", auth, async (req, res, next) => {
  try {
    const db = mongoose.connection.db;
    const rows = await db
      .collection(BROADCASTS)
      .find({ ...liveFilter(req.user), kind: { $ne: "COMING_SOON" } }, { projection: { _id: 0, id: 1, kind: 1 } })
      .toArray();
    const now = new Date();
    for (const b of rows) await recordEvent(db, req.user, b, "clear", now);
    res.json({ cleared: rows.length });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/broadcasts/assets/:id
 * Images uploaded in the admin composer. Public (an <img> can't send the
 * token); ids are random and the content is what the broadcast shows anyway.
 */
router.get("/assets/:id", async (req, res, next) => {
  try {
    if (!/^[0-9a-f-]{36}$/.test(req.params.id)) return res.status(404).end();
    const asset = await mongoose.connection.db.collection(ASSETS).findOne({ id: req.params.id }, { projection: { _id: 0, mime: 1, data: 1 } });
    if (!asset) return res.status(404).end();
    res.set({
      "Content-Type": asset.mime,
      "Cache-Control": "public, max-age=31536000, immutable",
      "Cross-Origin-Resource-Policy": "cross-origin",
      "X-Content-Type-Options": "nosniff",
    });
    res.send(Buffer.from(asset.data.buffer || asset.data));
  } catch (error) {
    next(error);
  }
});

module.exports = router;
module.exports.ensureIndexes = ensureIndexes;
module.exports.liveFilter = liveFilter;
