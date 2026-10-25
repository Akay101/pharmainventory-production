// Support queries from every pharmacy (written by the app, backend-node/routes/support.js)
//   GET   /api/support            ?status=&category=&priority=&search=&pharmacy_id=&unread=1&page=&limit=
//   GET   /api/support/:id        one query (marks it read for the team)
//   POST  /api/support/:id/reply  {text, status?, internal?}  reply to the pharmacy (or an internal note)
//   PATCH /api/support/:id        {status?, priority?}
const express = require("express");
const { v4: uuidv4 } = require("uuid");
const { resolveDbEnv } = require("../db/connections");

const router = express.Router();
router.use(resolveDbEnv);

const STATUSES = ["open", "in_progress", "waiting_on_user", "resolved", "closed"];
const PRIORITIES = ["low", "normal", "high", "urgent"];
const CATEGORIES = ["bug", "question", "feature", "billing", "other"];
const escapeRegex = (s) => String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const adminName = (req) => req.adminUser?.name || req.adminUser?.email || "DavaDesk Support";

router.get("/", async (req, res, next) => {
  try {
    const db = req.db;
    const { status, category, priority, search, pharmacy_id, unread, page = 1, limit = 25 } = req.query;
    const q = {};
    if (status === "active") q.status = { $in: ["open", "in_progress", "waiting_on_user"] };
    else if (STATUSES.includes(status)) q.status = status;
    if (CATEGORIES.includes(category)) q.category = category;
    if (PRIORITIES.includes(priority)) q.priority = priority;
    if (pharmacy_id) q.pharmacy_id = String(pharmacy_id);
    if (unread === "1" || unread === "true") q.admin_unread = true;
    if (search) {
      const rx = { $regex: escapeRegex(String(search).slice(0, 80)), $options: "i" };
      q.$or = [{ ticket_no: rx }, { subject: rx }, { pharmacy_name: rx }, { "created_by.name": rx }, { "created_by.email": rx }, { "messages.text": rx }];
    }
    const lim = Math.min(100, Math.max(1, parseInt(limit) || 25));
    const pg = Math.max(1, parseInt(page) || 1);
    const col = db.collection("support_tickets");
    const [tickets, total, byStatus, unreadCount] = await Promise.all([
      col
        .find(q, { projection: { _id: 0, messages: { $slice: -1 } } })
        .sort({ admin_unread: -1, updated_at: -1 })
        .skip((pg - 1) * lim)
        .limit(lim)
        .toArray(),
      col.countDocuments(q),
      col.aggregate([{ $group: { _id: "$status", n: { $sum: 1 } } }]).toArray(),
      col.countDocuments({ admin_unread: true }),
    ]);
    res.json({
      tickets,
      total,
      page: pg,
      pages: Math.ceil(total / lim) || 1,
      counts: { ...Object.fromEntries(STATUSES.map((s) => [s, 0])), ...Object.fromEntries(byStatus.map((c) => [c._id, c.n])), unread: unreadCount },
      env: req.dbEnv,
    });
  } catch (err) {
    next(err);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const db = req.db;
    const t = await db
      .collection("support_tickets")
      .findOneAndUpdate({ id: req.params.id }, { $set: { admin_unread: false } }, { returnDocument: "after", projection: { _id: 0 } });
    if (!t) return res.status(404).json({ error: "Query not found" });
    const pharmacy = await db
      .collection("pharmacies")
      .findOne({ id: t.pharmacy_id }, { projection: { _id: 0, id: 1, name: 1, location: 1, contact: 1, subscription: 1 } });
    res.json({ ticket: t, pharmacy });
  } catch (err) {
    next(err);
  }
});

router.post("/:id/reply", async (req, res, next) => {
  try {
    const db = req.db;
    const text = String(req.body?.text || "").replace(/\r\n/g, "\n").trim().slice(0, 4000);
    if (!text) return res.status(400).json({ error: "Write a reply first" });
    const internal = req.body?.internal === true;
    const status = STATUSES.includes(req.body?.status) ? req.body.status : null;
    const t = await db.collection("support_tickets").findOne({ id: req.params.id }, { projection: { _id: 0, id: 1, pharmacy_id: 1, ticket_no: 1, subject: 1, status: 1, created_by: 1 } });
    if (!t) return res.status(404).json({ error: "Query not found" });

    const now = new Date().toISOString();
    const message = { id: uuidv4(), author: "admin", author_name: adminName(req), text, created_at: now, ...(internal ? { internal: true } : {}) };
    const $set = { updated_at: now, admin_unread: false };
    if (!internal) {
      $set.user_unread = true;
      $set.last_reply_by = "admin";
      $set.status = status || (t.status === "open" ? "waiting_on_user" : t.status);
    } else if (status) {
      $set.status = status;
    }
    if ($set.status === "resolved" || $set.status === "closed") $set.resolved_at = now;
    const updated = await db
      .collection("support_tickets")
      .findOneAndUpdate({ id: t.id }, { $push: { messages: message }, $set }, { returnDocument: "after", projection: { _id: 0 } });

    // The pharmacy sees the reply in its notification bell
    if (!internal) {
      await db
        .collection("notifications")
        .insertOne({
          id: uuidv4(),
          pharmacy_id: t.pharmacy_id,
          user_id: null,
          type: "SUPPORT_REPLY",
          title: `Reply on ${t.ticket_no}: ${t.subject}`.slice(0, 140),
          message: text.length > 160 ? `${text.slice(0, 157)}…` : text,
          priority: "MEDIUM",
          data: { ticket_id: t.id, link: `/support?ticket=${t.id}` },
          is_read: false,
          read_at: null,
          created_at: now,
          expires_at: null,
        })
        .catch((e) => console.warn("[support] notification failed:", e.message));
    }
    res.json({ ticket: updated });
  } catch (err) {
    next(err);
  }
});

router.patch("/:id", async (req, res, next) => {
  try {
    const db = req.db;
    const $set = { updated_at: new Date().toISOString() };
    if (req.body?.status !== undefined) {
      if (!STATUSES.includes(req.body.status)) return res.status(400).json({ error: "Invalid status" });
      $set.status = req.body.status;
      if (["resolved", "closed"].includes(req.body.status)) $set.resolved_at = $set.updated_at;
    }
    if (req.body?.priority !== undefined) {
      if (!PRIORITIES.includes(req.body.priority)) return res.status(400).json({ error: "Invalid priority" });
      $set.priority = req.body.priority;
    }
    const updated = await db.collection("support_tickets").findOneAndUpdate({ id: req.params.id }, { $set }, { returnDocument: "after", projection: { _id: 0 } });
    if (!updated) return res.status(404).json({ error: "Query not found" });
    res.json({ ticket: updated });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
