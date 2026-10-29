// Broadcasts: notifications, offers and coming-soon features shown to app
// users as banners, in their notifications and in a details modal.
//
// Documents go into the selected environment's `broadcasts`; the main API
// decides per request what is live for each user (see backend-node/routes/
// broadcasts.js). Reach comes from `broadcast_receipts`, which the app writes.
//
// Drafts: SUPERADMIN, ADMIN, OPERATOR. Publishing, changing a published
// broadcast, archiving and deleting: SUPERADMIN, ADMIN.
const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const { resolveDbEnv } = require("../db/connections");
const { requireRole } = require("../middleware/auth");
const { audit, parseBody } = require("../services/audit");
const B = require("../services/broadcasts");

router.use(resolveDbEnv);

const COL = "broadcasts";
const RECEIPTS = "broadcast_receipts";
const ASSETS = "broadcast_assets";
const canWrite = requireRole("SUPERADMIN", "ADMIN", "OPERATOR");
const canPublish = requireRole("SUPERADMIN", "ADMIN");
const PUBLISHERS = new Set(["SUPERADMIN", "ADMIN"]);
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const actor = (req) => ({ id: req.adminUser?._id ? String(req.adminUser._id) : null, email: req.adminUser?.email || null, name: req.adminUser?.name || null });

// Reach per broadcast: unique users who saw, opened, clicked, dismissed, cleared
async function receiptStats(db, ids) {
  if (!ids.length) return new Map();
  const rows = await db
    .collection(RECEIPTS)
    .aggregate([
      { $match: { broadcast_id: { $in: ids } } },
      {
        $group: {
          _id: "$broadcast_id",
          seen: { $sum: { $cond: [{ $ifNull: ["$seen_at", false] }, 1, 0] } },
          opened: { $sum: { $cond: [{ $ifNull: ["$opened_at", false] }, 1, 0] } },
          clicked: { $sum: { $cond: [{ $ifNull: ["$clicked_at", false] }, 1, 0] } },
          dismissed: { $sum: { $cond: [{ $ifNull: ["$banner_dismissed_at", false] }, 1, 0] } },
          cleared: { $sum: { $cond: [{ $ifNull: ["$cleared_at", false] }, 1, 0] } },
          clicks: { $sum: { $ifNull: ["$click_count", 0] } },
        },
      },
    ])
    .toArray();
  return new Map(rows.map(({ _id, ...s }) => [_id, s]));
}

const EMPTY_STATS = { seen: 0, opened: 0, clicked: 0, dismissed: 0, cleared: 0, clicks: 0 };

async function withStats(db, docs) {
  const stats = await receiptStats(db, docs.map((d) => d.id));
  const now = new Date();
  return Promise.all(
    docs.map(async ({ _id, ...d }) => ({
      ...d,
      state: B.statusOf(d, now),
      stats: { ...EMPTY_STATS, ...(stats.get(d.id) || {}), targeted: await db.collection("users").countDocuments(B.audienceUserFilter(d.audience)) },
    }))
  );
}

// GET /api/broadcasts?state=LIVE&kind=PROMOTION&q=
router.get("/", async (req, res, next) => {
  try {
    const { state, kind, q } = req.query;
    const filter = {};
    if (B.KINDS.includes(kind)) filter.kind = kind;
    if (q) filter.$or = [{ title: { $regex: escapeRegex(q), $options: "i" } }, { summary: { $regex: escapeRegex(q), $options: "i" } }];
    const docs = await req.db.collection(COL).find(filter, { projection: { blocks: 0 } }).sort({ updated_at: -1 }).limit(300).toArray();
    let rows = await withStats(req.db, docs);
    const counts = rows.reduce((acc, r) => ((acc[r.state] = (acc[r.state] || 0) + 1), acc), {});
    if (state) rows = rows.filter((r) => r.state === state);
    res.json({ rows, counts });
  } catch (err) {
    next(err);
  }
});

// GET /api/broadcasts/audience/search?q=  users and pharmacies to target
router.get("/audience/search", async (req, res, next) => {
  try {
    const q = String(req.query.q || "").trim();
    if (q.length < 2) return res.json({ users: [], pharmacies: [] });
    const rx = { $regex: escapeRegex(q), $options: "i" };
    const [users, pharmacies] = await Promise.all([
      req.db
        .collection("users")
        .find({ $or: [{ name: rx }, { email: rx }, { mobile: rx }, { id: q }] }, { projection: { _id: 0, id: 1, name: 1, email: 1, role: 1, pharmacy_id: 1 } })
        .limit(15)
        .toArray(),
      req.db
        .collection("pharmacies")
        .find({ $or: [{ name: rx }, { id: q }, { "location.city": rx }] }, { projection: { _id: 0, id: 1, name: 1, location: 1 } })
        .limit(15)
        .toArray(),
    ]);
    const pnames = new Map(
      (await req.db.collection("pharmacies").find({ id: { $in: users.map((u) => u.pharmacy_id).filter(Boolean) } }, { projection: { _id: 0, id: 1, name: 1 } }).toArray()).map((p) => [p.id, p.name])
    );
    res.json({
      users: users.map((u) => ({ ...u, pharmacy_name: pnames.get(u.pharmacy_id) || null })),
      pharmacies: pharmacies.map((p) => ({ id: p.id, name: p.name, city: p.location?.city || null })),
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/broadcasts/audience/resolve { user_ids, pharmacy_ids } -> labels for chips
router.post("/audience/resolve", async (req, res, next) => {
  try {
    const ids = (v) => (Array.isArray(v) ? v.map(String).slice(0, 5000) : []);
    const [users, pharmacies] = await Promise.all([
      req.db.collection("users").find({ id: { $in: ids(req.body?.user_ids) } }, { projection: { _id: 0, id: 1, name: 1, email: 1 } }).toArray(),
      req.db.collection("pharmacies").find({ id: { $in: ids(req.body?.pharmacy_ids) } }, { projection: { _id: 0, id: 1, name: 1 } }).toArray(),
    ]);
    res.json({ users, pharmacies });
  } catch (err) {
    next(err);
  }
});

// POST /api/broadcasts/audience/count { audience } -> how many users it reaches
router.post("/audience/count", async (req, res, next) => {
  try {
    const a = req.body?.audience || {};
    const audience = {
      type: ["ALL", "PHARMACIES", "USERS"].includes(a.type) ? a.type : "ALL",
      pharmacy_ids: Array.isArray(a.pharmacy_ids) ? a.pharmacy_ids.map(String) : [],
      user_ids: Array.isArray(a.user_ids) ? a.user_ids.map(String) : [],
      admins_only: !!a.admins_only,
    };
    res.json({ users: await req.db.collection("users").countDocuments(B.audienceUserFilter(audience)) });
  } catch (err) {
    next(err);
  }
});

// POST /api/broadcasts/assets { data: base64, name } -> { id }
router.post("/assets", canWrite, async (req, res, next) => {
  try {
    const raw = String(req.body?.data || "").replace(/^data:[^,]*,/, "");
    const buf = Buffer.from(raw, "base64");
    if (!buf.length) return res.status(400).json({ error: "No image received" });
    if (buf.length > B.MAX_ASSET_BYTES) return res.status(413).json({ error: "Image is over 2 MB; use a smaller one" });
    const mime = B.sniffImage(buf);
    if (!mime) return res.status(415).json({ error: "Use a PNG, JPEG, WebP or GIF image" });
    const id = crypto.randomUUID();
    await req.db.collection(ASSETS).insertOne({
      id,
      mime,
      size: buf.length,
      name: String(req.body?.name || "").slice(0, 120),
      data: buf,
      uploaded_by: actor(req),
      created_at: new Date(),
    });
    res.status(201).json({ id, mime, size: buf.length });
  } catch (err) {
    next(err);
  }
});

// GET /api/broadcasts/:id  full document, reach and recent viewers
router.get("/:id", async (req, res, next) => {
  try {
    const doc = await req.db.collection(COL).findOne({ id: req.params.id });
    if (!doc) return res.status(404).json({ error: "Broadcast not found" });
    const [row] = await withStats(req.db, [doc]);
    const recent = await req.db.collection(RECEIPTS).find({ broadcast_id: doc.id, seen_at: { $ne: null } }, { projection: { _id: 0 } }).sort({ seen_at: -1 }).limit(50).toArray();
    const users = new Map(
      (await req.db.collection("users").find({ id: { $in: recent.map((r) => r.user_id) } }, { projection: { _id: 0, id: 1, name: 1, email: 1, pharmacy_id: 1 } }).toArray()).map((u) => [u.id, u])
    );
    const pharmacies = new Map(
      (await req.db.collection("pharmacies").find({ id: { $in: recent.map((r) => r.pharmacy_id).filter(Boolean) } }, { projection: { _id: 0, id: 1, name: 1 } }).toArray()).map((p) => [p.id, p.name])
    );
    row.viewers = recent.map((r) => ({
      user_id: r.user_id,
      name: users.get(r.user_id)?.name || "Deleted user",
      email: users.get(r.user_id)?.email || null,
      pharmacy: pharmacies.get(r.pharmacy_id) || null,
      seen_at: r.seen_at,
      opened_at: r.opened_at || null,
      clicked_at: r.clicked_at || null,
      cleared_at: r.cleared_at || null,
    }));
    res.json(row);
  } catch (err) {
    next(err);
  }
});

function prepare(data) {
  return { ...data, starts_at: data.starts_at ? new Date(data.starts_at) : null, expires_at: data.expires_at ? new Date(data.expires_at) : null, asset_ids: B.assetIdsOf(data) };
}

// POST /api/broadcasts { ...content, publish?: true }
router.post("/", canWrite, async (req, res, next) => {
  try {
    const data = parseBody(B.broadcastSchema, req, res);
    if (!data) return;
    const publish = req.body?.publish === true;
    if (publish && !PUBLISHERS.has(req.adminUser.role)) return res.status(403).json({ error: "Only Superadmin or Admin can publish" });
    const now = new Date();
    const doc = {
      id: crypto.randomUUID(),
      ...prepare(data),
      status: publish ? "PUBLISHED" : "DRAFT",
      starts_at: publish ? (data.starts_at ? new Date(data.starts_at) : now) : data.starts_at ? new Date(data.starts_at) : null,
      published_at: publish ? now : null,
      created_by: actor(req),
      updated_by: actor(req),
      created_at: now,
      updated_at: now,
    };
    await req.db.collection(COL).insertOne(doc);
    await audit(req, publish ? "BROADCAST_PUBLISHED" : "BROADCAST_DRAFTED", { type: "broadcast", id: doc.id }, { title: doc.title, kind: doc.kind, audience: summary(doc.audience) });
    const { _id, ...out } = doc;
    res.status(201).json(out);
  } catch (err) {
    next(err);
  }
});

const summary = (a) => ({ type: a.type, pharmacies: a.pharmacy_ids?.length || 0, users: a.user_ids?.length || 0, admins_only: !!a.admins_only });

// PUT /api/broadcasts/:id  edit; a published broadcast stays published
router.put("/:id", canWrite, async (req, res, next) => {
  try {
    const existing = await req.db.collection(COL).findOne({ id: req.params.id });
    if (!existing) return res.status(404).json({ error: "Broadcast not found" });
    if (existing.status !== "DRAFT" && !PUBLISHERS.has(req.adminUser.role)) return res.status(403).json({ error: "Only Superadmin or Admin can change a published broadcast" });
    const data = parseBody(B.broadcastSchema, req, res);
    if (!data) return;
    const set = { ...prepare(data), updated_by: actor(req), updated_at: new Date() };
    // A published broadcast keeps its start unless a new one is given
    if (existing.status === "PUBLISHED" && !data.starts_at) set.starts_at = existing.starts_at;
    await req.db.collection(COL).updateOne({ id: existing.id }, { $set: set });
    await audit(req, "BROADCAST_UPDATED", { type: "broadcast", id: existing.id }, { title: set.title, status: existing.status });
    await removeUnusedAssets(req.db, existing.asset_ids || []);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Lifecycle: publish (from draft or archived), archive (stop showing it)
router.post("/:id/publish", canPublish, async (req, res, next) => {
  try {
    const doc = await req.db.collection(COL).findOne({ id: req.params.id });
    if (!doc) return res.status(404).json({ error: "Broadcast not found" });
    const now = new Date();
    if (doc.expires_at && doc.expires_at <= now) return res.status(400).json({ error: "This broadcast has already expired; set a new expiry first" });
    // Re-check: a draft may have been saved before rules tightened
    const check = B.broadcastSchema.safeParse({ ...doc, starts_at: doc.starts_at ? doc.starts_at.toISOString() : null, expires_at: doc.expires_at ? doc.expires_at.toISOString() : null });
    if (!check.success) return res.status(400).json({ error: `${check.error.issues[0].path.join(".")}: ${check.error.issues[0].message}` });
    const startsAt = doc.starts_at && doc.starts_at > now ? doc.starts_at : now;
    await req.db.collection(COL).updateOne({ id: doc.id }, { $set: { status: "PUBLISHED", starts_at: startsAt, published_at: now, updated_by: actor(req), updated_at: now } });
    await audit(req, "BROADCAST_PUBLISHED", { type: "broadcast", id: doc.id }, { title: doc.title, kind: doc.kind, audience: summary(doc.audience), starts_at: startsAt });
    res.json({ ok: true, starts_at: startsAt });
  } catch (err) {
    next(err);
  }
});

router.post("/:id/archive", canPublish, async (req, res, next) => {
  try {
    const now = new Date();
    const r = await req.db.collection(COL).updateOne({ id: req.params.id }, { $set: { status: "ARCHIVED", archived_at: now, updated_by: actor(req), updated_at: now } });
    if (!r.matchedCount) return res.status(404).json({ error: "Broadcast not found" });
    await audit(req, "BROADCAST_ARCHIVED", { type: "broadcast", id: req.params.id }, {});
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/broadcasts/:id/duplicate -> new draft with the same content
router.post("/:id/duplicate", canWrite, async (req, res, next) => {
  try {
    const doc = await req.db.collection(COL).findOne({ id: req.params.id });
    if (!doc) return res.status(404).json({ error: "Broadcast not found" });
    const now = new Date();
    const { _id, published_at, archived_at, ...rest } = doc;
    const copy = { ...rest, id: crypto.randomUUID(), title: `${doc.title} (copy)`.slice(0, 120), status: "DRAFT", starts_at: null, created_by: actor(req), updated_by: actor(req), created_at: now, updated_at: now };
    await req.db.collection(COL).insertOne(copy);
    await audit(req, "BROADCAST_DRAFTED", { type: "broadcast", id: copy.id }, { title: copy.title, duplicated_from: doc.id });
    res.status(201).json({ id: copy.id });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/broadcasts/:id  drafts and archived ones only
router.delete("/:id", canPublish, async (req, res, next) => {
  try {
    const doc = await req.db.collection(COL).findOne({ id: req.params.id });
    if (!doc) return res.status(404).json({ error: "Broadcast not found" });
    if (doc.status === "PUBLISHED") return res.status(409).json({ error: "Archive it before deleting" });
    await req.db.collection(COL).deleteOne({ id: doc.id });
    const receipts = await req.db.collection(RECEIPTS).deleteMany({ broadcast_id: doc.id });
    await removeUnusedAssets(req.db, doc.asset_ids || []);
    await audit(req, "BROADCAST_DELETED", { type: "broadcast", id: doc.id }, { title: doc.title, receipts: receipts.deletedCount });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Uploads no broadcast refers to any more (replaced images, deleted drafts).
// Fresh uploads are left alone: the composer may not have saved them yet.
async function removeUnusedAssets(db, ids) {
  if (!ids.length) return;
  const used = new Set((await db.collection(COL).find({ asset_ids: { $in: ids } }, { projection: { _id: 0, asset_ids: 1 } }).toArray()).flatMap((d) => d.asset_ids || []));
  const unused = ids.filter((id) => !used.has(id));
  if (unused.length) await db.collection(ASSETS).deleteMany({ id: { $in: unused }, created_at: { $lt: new Date(Date.now() - 3600 * 1000) } }).catch(() => {});
}

// Public: <img> tags in the composer preview can't send the admin token.
// GET /api/broadcast-assets/:id?env=prod
const assetsRouter = express.Router();
assetsRouter.get("/:id", resolveDbEnv, async (req, res, next) => {
  try {
    if (!/^[0-9a-f-]{36}$/.test(req.params.id)) return res.status(404).end();
    const asset = await req.db.collection(ASSETS).findOne({ id: req.params.id }, { projection: { _id: 0, mime: 1, data: 1 } });
    if (!asset) return res.status(404).end();
    res.set({ "Content-Type": asset.mime, "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" });
    res.send(Buffer.from(asset.data.buffer || asset.data));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
module.exports.assetsRouter = assetsRouter;
