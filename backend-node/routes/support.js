// Help & support: a pharmacy's bug reports and questions, with replies from
// the DavaDesk team (admin panel, admin-backend/routes/support.js).
//   GET    /api/support                ?status=open|resolved|all&page=   the pharmacy's queries
//   GET    /api/support/unread         {count} queries with a reply not seen yet
//   POST   /api/support                {category, subject, description, page?, meta?}
//   GET    /api/support/:id            one query with its conversation (marks replies seen)
//   POST   /api/support/:id/messages   {text} add to the conversation (reopens a resolved query)
//   POST   /api/support/:id/resolve    the user says it's sorted
const express = require("express");
const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");
const { auth } = require("../middleware/auth");

const router = express.Router();
const col = () => mongoose.connection.db.collection("support_tickets");

const CATEGORIES = ["bug", "question", "feature", "billing", "other"];
const OPEN = ["open", "in_progress", "waiting_on_user"];
const DONE = ["resolved", "closed"];
const LIMITS = { subject: [5, 120], description: [10, 4000], message: [1, 4000] };
const MAX_NEW_PER_HOUR = 10;

const clean = (v, max) => String(v ?? "").replace(/\r\n/g, "\n").trim().slice(0, max);

// What the pharmacy may see (internal notes stay in the admin panel)
const forUser = (t) => {
  if (!t) return t;
  const { _id, internal_notes, admin_unread, assignee, ...rest } = t;
  return { ...rest, messages: (rest.messages || []).filter((m) => !m.internal) };
};

async function nextTicketNo(db) {
  const r = await db.collection("counters").findOneAndUpdate({ _id: "support_ticket" }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: "after" });
  return `SUP-${String(r.seq).padStart(5, "0")}`;
}

router.get("/", auth, async (req, res, next) => {
  try {
    const { status = "all", page = 1, limit = 20 } = req.query;
    const q = { pharmacy_id: req.user.pharmacy_id };
    if (status === "open") q.status = { $in: OPEN };
    else if (status === "resolved") q.status = { $in: DONE };
    const lim = Math.min(50, Math.max(1, parseInt(limit) || 20));
    const pg = Math.max(1, parseInt(page) || 1);
    const [items, total, counts] = await Promise.all([
      col()
        .find(q, { projection: { _id: 0, messages: { $slice: -1 }, internal_notes: 0 } })
        .sort({ updated_at: -1 })
        .skip((pg - 1) * lim)
        .limit(lim)
        .toArray(),
      col().countDocuments(q),
      col()
        .aggregate([{ $match: { pharmacy_id: req.user.pharmacy_id } }, { $group: { _id: "$status", n: { $sum: 1 } } }])
        .toArray(),
    ]);
    const by = Object.fromEntries(counts.map((c) => [c._id, c.n]));
    res.json({
      tickets: items.map(forUser),
      total,
      page: pg,
      pages: Math.ceil(total / lim) || 1,
      counts: { open: OPEN.reduce((s, k) => s + (by[k] || 0), 0), resolved: DONE.reduce((s, k) => s + (by[k] || 0), 0) },
    });
  } catch (err) {
    next(err);
  }
});

router.get("/unread", auth, async (req, res, next) => {
  try {
    res.json({ count: await col().countDocuments({ pharmacy_id: req.user.pharmacy_id, user_unread: true }) });
  } catch (err) {
    next(err);
  }
});

router.post("/", auth, async (req, res, next) => {
  try {
    const db = mongoose.connection.db;
    const body = req.body || {};
    const category = CATEGORIES.includes(body.category) ? body.category : "other";
    const subject = clean(body.subject, LIMITS.subject[1]);
    const description = clean(body.description, LIMITS.description[1]);
    if (subject.length < LIMITS.subject[0]) return res.status(400).json({ detail: "Add a short title (at least 5 characters)" });
    if (description.length < LIMITS.description[0]) return res.status(400).json({ detail: "Describe the problem in a little more detail (at least 10 characters)" });

    const recent = await col().countDocuments({ pharmacy_id: req.user.pharmacy_id, created_at: { $gt: new Date(Date.now() - 3600 * 1000).toISOString() } });
    if (recent >= MAX_NEW_PER_HOUR) return res.status(429).json({ detail: "You've sent a lot of reports in the last hour. Please add details to an existing one." });

    const pharmacy = await db.collection("pharmacies").findOne({ id: req.user.pharmacy_id }, { projection: { _id: 0, name: 1, contact: 1, subscription: 1 } });
    const meta = body.meta && typeof body.meta === "object" ? body.meta : {};
    const now = new Date().toISOString();
    const ticket = {
      id: uuidv4(),
      ticket_no: await nextTicketNo(db),
      pharmacy_id: req.user.pharmacy_id,
      pharmacy_name: pharmacy?.name || "",
      created_by: { id: req.user.id, name: req.user.name || "", email: req.user.email || "", mobile: req.user.mobile || "", role: req.user.role || "" },
      category,
      subject,
      status: "open",
      priority: category === "bug" ? "normal" : "low",
      page: clean(body.page, 200),
      meta: {
        user_agent: clean(meta.user_agent || req.get("user-agent"), 300),
        viewport: clean(meta.viewport, 40),
        app_version: clean(meta.app_version, 40),
        plan: pharmacy?.subscription?.plan || null,
      },
      messages: [{ id: uuidv4(), author: "user", author_name: req.user.name || "", text: description, created_at: now }],
      user_unread: false,
      admin_unread: true,
      last_reply_by: "user",
      created_at: now,
      updated_at: now,
    };
    await col().insertOne({ ...ticket });
    res.status(201).json(forUser(ticket));
  } catch (err) {
    next(err);
  }
});

router.get("/:id", auth, async (req, res, next) => {
  try {
    const t = await col().findOneAndUpdate(
      { id: req.params.id, pharmacy_id: req.user.pharmacy_id },
      { $set: { user_unread: false } },
      { returnDocument: "after", projection: { _id: 0 } }
    );
    if (!t) return res.status(404).json({ detail: "Query not found" });
    res.json(forUser(t));
  } catch (err) {
    next(err);
  }
});

router.post("/:id/messages", auth, async (req, res, next) => {
  try {
    const text = clean(req.body?.text, LIMITS.message[1]);
    if (!text) return res.status(400).json({ detail: "Write a message first" });
    const t = await col().findOne({ id: req.params.id, pharmacy_id: req.user.pharmacy_id }, { projection: { status: 1 } });
    if (!t) return res.status(404).json({ detail: "Query not found" });
    const now = new Date().toISOString();
    const message = { id: uuidv4(), author: "user", author_name: req.user.name || "", text, created_at: now };
    const updated = await col().findOneAndUpdate(
      { id: req.params.id, pharmacy_id: req.user.pharmacy_id },
      {
        $push: { messages: message },
        // Writing back reopens a resolved query and puts it in the team's queue
        $set: { status: DONE.includes(t.status) || t.status === "waiting_on_user" ? "open" : t.status, admin_unread: true, user_unread: false, last_reply_by: "user", updated_at: now },
      },
      { returnDocument: "after", projection: { _id: 0 } }
    );
    res.json(forUser(updated));
  } catch (err) {
    next(err);
  }
});

router.post("/:id/resolve", auth, async (req, res, next) => {
  try {
    const now = new Date().toISOString();
    const updated = await col().findOneAndUpdate(
      { id: req.params.id, pharmacy_id: req.user.pharmacy_id },
      { $set: { status: "resolved", resolved_at: now, resolved_by: "user", updated_at: now, user_unread: false } },
      { returnDocument: "after", projection: { _id: 0 } }
    );
    if (!updated) return res.status(404).json({ detail: "Query not found" });
    res.json(forUser(updated));
  } catch (err) {
    next(err);
  }
});

async function ensureIndexes(db) {
  await db.collection("support_tickets").createIndex({ id: 1 }, { unique: true });
  await db.collection("support_tickets").createIndex({ pharmacy_id: 1, updated_at: -1 });
  await db.collection("support_tickets").createIndex({ status: 1, updated_at: -1 });
}

module.exports = router;
module.exports.ensureIndexes = ensureIndexes;
