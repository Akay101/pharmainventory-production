// The signed-in user's account: login sessions (Device manager) and the
// pharmacies they can switch between.
//   GET    /api/account/sessions        this user's live and past sessions,
//                                       plus the team's live ones for admins
//   DELETE /api/account/sessions/:id    sign a session out
//   GET    /api/account/pharmacies      pharmacies this user can open
//   GET    /api/account/owner           who to ask for access (name only)
//   POST   /api/account/access-request  ask the owner for access to a section
const express = require("express");
const mongoose = require("mongoose");
const { rateLimit } = require("express-rate-limit");
const { auth } = require("../middleware/auth");
const sessions = require("../services/auth/sessions");
const tokens = require("../services/auth/tokens");
const { pharmaciesView } = require("./auth");
const { createNotification } = require("../services/notifications");

const router = express.Router();
const db = () => mongoose.connection.db;

const perUser = (limit) =>
  rateLimit({ windowMs: 60 * 1000, limit, keyGenerator: (req) => `u:${req.user.id}`, standardHeaders: "draft-8", legacyHeaders: false, message: { detail: "Too many requests. Please slow down." } });

router.get("/sessions", auth, async (req, res, next) => {
  try {
    const mine = await sessions.history(db(), [req.user.id], { limit: 40 });
    const out = {
      current_session_id: req.sessionId,
      sessions: mine.map((s) => sessions.publicSession(s, req.sessionId)),
      desktop_devices: [],
      team: [],
    };
    out.desktop_devices = await db()
      .collection("desktop_devices")
      .find({ user_id: req.user.id, revoked_at: null }, { projection: { _id: 0, id: 1, name: 1, created_at: 1, last_seen_at: 1, pharmacy_id: 1 } })
      .sort({ created_at: 1 })
      .toArray();
    if (req.user.role === "ADMIN") {
      const team = await db()
        .collection("users")
        .find({ pharmacy_id: req.account_id, id: { $ne: req.user.id } }, { projection: { _id: 0, id: 1, name: 1, email: 1, active_session_id: 1, active_sessions: 1, is_primary_admin: 1 } })
        .toArray();
      const live = await db()
        .collection(sessions.SESSIONS)
        .find({ id: { $in: team.flatMap((u) => sessions.liveIds(u)) }, ended_at: null }, { projection: { _id: 0, family: 0, device_key: 0 } })
        .toArray();
      const byId = Object.fromEntries(live.map((s) => [s.id, s]));
      out.team = team.map((u) => {
        const live = sessions.liveIds(u).map((id) => byId[id]).filter((s) => s && sessions.isLive(s)).map((s) => sessions.publicSession(s));
        return { user_id: u.id, name: u.name, email: u.email, is_owner: !!u.is_primary_admin, session: live[0] || null, sessions: live };
      });
    }
    res.json(out);
  } catch (err) {
    next(err);
  }
});

router.delete("/sessions/:id", auth, perUser(20), async (req, res, next) => {
  try {
    const id = String(req.params.id || "");
    if (!/^[A-Za-z0-9_-]{10,64}$/.test(id)) return res.status(404).json({ detail: "Session not found" });
    const s = await db().collection(sessions.SESSIONS).findOne({ id }, { projection: { _id: 0, id: 1, user_id: 1, ended_at: 1 } });
    if (!s) return res.status(404).json({ detail: "Session not found" });
    if (s.user_id !== req.user.id) {
      // Admins can sign out the team, never the owner (unless they are the owner)
      const target = await db().collection("users").findOne({ id: s.user_id, pharmacy_id: req.account_id }, { projection: { is_primary_admin: 1, name: 1 } });
      if (!target || req.user.role !== "ADMIN" || (target.is_primary_admin && !req.user.is_primary_admin)) {
        return res.status(404).json({ detail: "Session not found" });
      }
    }
    if (s.ended_at) return res.json({ message: "That session had already ended" });
    await sessions.end(db(), s.id, s.user_id === req.user.id ? "REMOTE_LOGOUT" : "ADMIN_LOGOUT", req.user.id);
    const self = s.id === req.sessionId;
    if (self) tokens.clearRefreshCookie(req, res);
    res.json({ message: self ? "Signed out" : "Device signed out", signed_out_self: self });
  } catch (err) {
    next(err);
  }
});

router.get("/pharmacies", auth, async (req, res, next) => {
  try {
    res.json(await pharmaciesView(req.user, req.user.pharmacy_id));
  } catch (err) {
    next(err);
  }
});

router.get("/owner", auth, async (req, res, next) => {
  try {
    const owner = await db().collection("users").findOne({ pharmacy_id: req.account_id, is_primary_admin: true }, { projection: { _id: 0, name: 1 } });
    res.json({ name: owner?.name || null });
  } catch (err) {
    next(err);
  }
});

// A pharmacist asks for a section they can't open. The owner gets an in-app
// notification; one request per user, section and action a day.
router.post("/access-request", auth, perUser(10), async (req, res, next) => {
  try {
    const permissions = require("../services/access/permissions");
    const mod = permissions.MODULES.find((m) => m.key === req.body?.module);
    const action = ["read", "create", "update", "delete"].includes(req.body?.action) ? req.body.action : "read";
    const isUsers = req.body?.module === "users";
    if (!mod && !isUsers) return res.status(400).json({ detail: "Unknown section" });
    if (req.user.role === "ADMIN") return res.json({ message: "You already have full access" });
    const label = isUsers ? "Users" : mod.label;
    const day = new Date().toISOString().slice(0, 10);
    const key = `access:${req.user.id}:${req.body.module}:${action}:${day}`;
    try {
      await db().collection("access_requests").insertOne({ _id: key, user_id: req.user.id, account_id: req.account_id, pharmacy_id: req.user.pharmacy_id, module: req.body.module, action, created_at: new Date(), expires_at: new Date(Date.now() + 2 * 864e5) });
    } catch (err) {
      if (err.code === 11000) return res.json({ message: "Already sent today. The owner has been told.", already: true });
      throw err;
    }
    const owner = await db().collection("users").findOne({ pharmacy_id: req.account_id, is_primary_admin: true }, { projection: { _id: 0, id: 1 } });
    const verb = { read: "open", create: "add to", update: "edit in", delete: "delete in" }[action];
    await createNotification(db(), {
      pharmacy_id: req.account_id,
      user_id: owner?.id || null,
      type: "SYSTEM",
      admins_only: true,
      title: `${req.user.name || "A pharmacist"} asked for access`,
      message: `${req.user.name || "A pharmacist"} wants to ${verb} ${label}. Change their access from Users.`,
      priority: "MEDIUM",
      data: { kind: "ACCESS_REQUEST", user_id: req.user.id, module: req.body.module, action, link: "/users" },
    });
    res.json({ message: "Request sent. The owner will see it in their notifications." });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
