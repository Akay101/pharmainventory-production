// Global Data Manager: search, add and edit the shared catalogues, and work
// through the review queue of names pharmacies created that the background
// check couldn't find in the catalogue. The queue lives in the selected
// environment's database (each environment's worker fills its own); the
// catalogues are shared. All writes are audited.
const express = require("express");
const router = express.Router();
const { ObjectId } = require("mongodb");
const { resolveDbEnv, getGlobalDb } = require("../db/connections");
const { requireRole } = require("../middleware/auth");
const { audit, actorOf, parseBody } = require("../services/audit");
const G = require("../services/globalData");
const { escapeRegex } = require("../services/search/normalize");

router.use(resolveDbEnv);

const QUEUE = "global_review_queue";
const canEdit = requireRole("SUPERADMIN", "ADMIN", "OPERATOR");

const kindOf = (req, res) => {
  const kind = String(req.params.kind || "");
  if (!G.KINDS[kind]) {
    res.status(400).json({ error: "Unknown catalogue" });
    return null;
  }
  return kind;
};
const oid = (v) => (ObjectId.isValid(String(v)) && String(v).length === 24 ? new ObjectId(String(v)) : null);
const publicDoc = ({ s_name_grams, s_salt_grams, ...d }) => d;

// ---------------------------------------------------------------------------
// Review queue (static paths first so they don't hit /:kind)

// GET /api/global-data/queue?kind=medicine&status=PENDING&search=&page=1
router.get("/queue", async (req, res, next) => {
  try {
    const status = ["PENDING", "ADDED", "DISMISSED"].includes(req.query.status) ? req.query.status : "PENDING";
    const filter = { status };
    if (G.KIND_BY_QUEUE[req.query.kind]) filter.kind = req.query.kind;
    if (req.query.search) filter.name = { $regex: escapeRegex(String(req.query.search).trim().slice(0, 100)), $options: "i" };
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 30));
    const col = req.db.collection(QUEUE);
    const [rows, total, counts] = await Promise.all([
      col.find(filter).sort({ last_seen_at: -1 }).skip((page - 1) * limit).limit(limit).toArray(),
      col.countDocuments(filter),
      col.aggregate([{ $match: { status: "PENDING" } }, { $group: { _id: "$kind", n: { $sum: 1 } } }]).toArray(),
    ]);
    res.json({
      env: req.dbEnv,
      total,
      page,
      limit,
      pending: Object.fromEntries(counts.map((c) => [c._id, c.n])),
      rows: rows.map((r) => ({ ...r, id: String(r._id), _id: undefined })),
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/global-data/queue/:id/dismiss { reason, duplicate_of }
router.post("/queue/:id/dismiss", canEdit, async (req, res, next) => {
  try {
    const _id = oid(req.params.id);
    if (!_id) return res.status(400).json({ error: "Invalid entry" });
    const reason = String(req.body?.reason || "Duplicate").trim().slice(0, 300);
    const dup = req.body?.duplicate_of && typeof req.body.duplicate_of === "object" ? { code: String(req.body.duplicate_of.code || "").slice(0, 40), name: String(req.body.duplicate_of.name || "").slice(0, 200) } : null;
    const r = await req.db.collection(QUEUE).findOneAndUpdate(
      { _id, status: "PENDING" },
      { $set: { status: "DISMISSED", resolution: { reason, duplicate_of: dup }, resolved_at: new Date(), resolved_by: actorOf(req).admin_email } },
      { returnDocument: "after" }
    );
    if (!r) return res.status(409).json({ error: "This entry was already handled" });
    await audit(req, "GLOBAL_QUEUE_DISMISS", String(_id), { kind: r.kind, name: r.name, reason, duplicate_of: dup });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/global-data/queue/:id/add { ...fields, force }
// Claims the entry first so two admins can't add it twice.
router.post("/queue/:id/add", canEdit, async (req, res, next) => {
  const _id = oid(req.params.id);
  if (!_id) return res.status(400).json({ error: "Invalid entry" });
  const col = req.db.collection(QUEUE);
  let claimed = null;
  try {
    const entry = await col.findOne({ _id });
    if (!entry) return res.status(404).json({ error: "Entry not found" });
    const kind = G.KIND_BY_QUEUE[entry.kind];
    const data = parseBody(G.SCHEMAS[kind], req, res);
    if (!data) return;
    const gdb = await getGlobalDb();
    if (!req.body.force) {
      const dup = await G.findDuplicate(gdb, kind, data);
      if (dup) return res.status(409).json({ error: "A matching record is already in the catalogue", code: "DUPLICATE", existing: publicDoc(dup) });
    }
    claimed = await col.findOneAndUpdate({ _id, status: "PENDING" }, { $set: { status: "ADDING", claimed_at: new Date() } });
    if (!claimed) return res.status(409).json({ error: "This entry was already handled" });
    const doc = await G.create(gdb, kind, data, actorOf(req));
    const k = G.KINDS[kind];
    await col.updateOne(
      { _id },
      { $set: { status: "ADDED", global_ref: { code: doc[k.codeField], name: doc[k.nameField] }, resolved_at: new Date(), resolved_by: actorOf(req).admin_email } }
    );
    await audit(req, "GLOBAL_QUEUE_ADD", String(_id), { kind, code: doc[k.codeField], name: doc[k.nameField] });
    res.status(201).json({ ok: true, record: publicDoc(doc) });
  } catch (err) {
    if (claimed) await col.updateOne({ _id, status: "ADDING" }, { $set: { status: "PENDING" } }).catch(() => {});
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Catalogues

// GET /api/global-data/:kind/search?q=
router.get("/:kind/search", async (req, res, next) => {
  try {
    const kind = kindOf(req, res);
    if (!kind) return;
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const gdb = await getGlobalDb();
    const rows = await G.search(gdb, kind, req.query.q, limit);
    res.json({ kind, rows: rows.map((r) => ({ ...r, _id: String(r._id) })) });
  } catch (err) {
    next(err);
  }
});

// GET /api/global-data/:kind/:id
router.get("/:kind/:id", async (req, res, next) => {
  try {
    const kind = kindOf(req, res);
    if (!kind) return;
    const _id = oid(req.params.id);
    if (!_id) return res.status(400).json({ error: "Invalid id" });
    const gdb = await getGlobalDb();
    const doc = await gdb.collection(G.KINDS[kind].col).findOne({ _id }, { projection: G.PUBLIC_PROJECTION });
    if (!doc) return res.status(404).json({ error: "Not found" });
    res.json({ kind, record: { ...doc, _id: String(doc._id) } });
  } catch (err) {
    next(err);
  }
});

// POST /api/global-data/:kind { ...fields, force }
router.post("/:kind", canEdit, async (req, res, next) => {
  try {
    const kind = kindOf(req, res);
    if (!kind) return;
    const data = parseBody(G.SCHEMAS[kind], req, res);
    if (!data) return;
    const gdb = await getGlobalDb();
    if (!req.body.force) {
      const dup = await G.findDuplicate(gdb, kind, data);
      if (dup) return res.status(409).json({ error: "A matching record is already in the catalogue", code: "DUPLICATE", existing: publicDoc(dup) });
    }
    const doc = await G.create(gdb, kind, data, actorOf(req));
    const k = G.KINDS[kind];
    await audit(req, "GLOBAL_DATA_ADD", doc[k.codeField], { kind, name: doc[k.nameField], fields: data });
    res.status(201).json({ ok: true, record: { ...publicDoc(doc), _id: String(doc._id) } });
  } catch (err) {
    next(err);
  }
});

// PUT /api/global-data/:kind/:id { ...fields }
router.put("/:kind/:id", canEdit, async (req, res, next) => {
  try {
    const kind = kindOf(req, res);
    if (!kind) return;
    const _id = oid(req.params.id);
    if (!_id) return res.status(400).json({ error: "Invalid id" });
    const data = parseBody(G.SCHEMAS[kind].partial(), req, res);
    if (!data) return;
    if (!Object.keys(data).length) return res.status(400).json({ error: "Nothing to change" });
    const gdb = await getGlobalDb();
    const r = await G.update(gdb, kind, _id, data, actorOf(req));
    if (!r) return res.status(404).json({ error: "Not found" });
    const k = G.KINDS[kind];
    await audit(req, "GLOBAL_DATA_EDIT", r.after[k.codeField] || String(_id), {
      kind,
      changes: Object.fromEntries(Object.keys(data).map((f) => [f, { from: r.before[f] ?? null, to: data[f] }])),
    });
    res.json({ ok: true, record: { ...r.after, _id: String(r.after._id) } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
