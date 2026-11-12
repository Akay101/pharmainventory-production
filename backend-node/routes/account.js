// The signed-in user's account: login sessions (Device manager) and the
// pharmacies they can switch between.
//   GET    /api/account/sessions        this user's live and past sessions,
//                                       plus the team's live ones for admins
//   DELETE /api/account/sessions/:id    sign a session out
//   GET    /api/account/pharmacies      pharmacies this user can open
const express = require("express");
const mongoose = require("mongoose");
const { rateLimit } = require("express-rate-limit");
const { auth } = require("../middleware/auth");
const sessions = require("../services/auth/sessions");
const tokens = require("../services/auth/tokens");
const { pharmaciesView } = require("./auth");

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
        .find({ pharmacy_id: req.account_id, id: { $ne: req.user.id } }, { projection: { _id: 0, id: 1, name: 1, email: 1, active_session_id: 1, is_primary_admin: 1 } })
        .toArray();
      const live = await db()
        .collection(sessions.SESSIONS)
        .find({ id: { $in: team.map((u) => u.active_session_id).filter(Boolean) }, ended_at: null }, { projection: { _id: 0, family: 0, device_key: 0 } })
        .toArray();
      const byId = Object.fromEntries(live.map((s) => [s.id, s]));
      out.team = team.map((u) => {
        const s = byId[u.active_session_id];
        return { user_id: u.id, name: u.name, email: u.email, is_owner: !!u.is_primary_admin, session: s && sessions.isLive(s) ? sessions.publicSession(s) : null };
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

module.exports = router;
