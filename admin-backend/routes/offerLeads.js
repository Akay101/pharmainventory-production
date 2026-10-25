// 50-50 Launch Offer section of the admin panel.
//   GET  /api/offer-leads                 ?search=&stage=&status=&page=&limit=   registrations + CRM + code + signup
//   GET  /api/offer-leads/:leadId         one registration with notes, codes, emails, DavaDesk account
//   POST /api/offer-leads/:leadId/code    {plan?, valid_days?, regenerate?}  50-day ACCESS code (reused while unused) + email draft
//   POST /api/offer-leads/:leadId/send    {subject, text, test?}  send the reviewed email (test = to the signed-in admin)
// Follow-ups use the normal lead endpoints (/api/leads/:leadId/status|connect|note)
// with lead ids "offer:<registration _id>".
const express = require("express");
const crypto = require("crypto");
const { z } = require("zod");
const { v4: uuidv4 } = require("uuid");
const { resolveDbEnv } = require("../db/connections");
const { audit, parseBody } = require("../services/audit");
const { describe } = require("../services/billing/subscriptions");
const { listOfferLeads, getOfferLead, SOURCE, LEAD_PREFIX, emailKey, mobileKey } = require("../services/offerLeads");
const { sendTextEmail } = require("../services/email");

const router = express.Router();
router.use(resolveDbEnv);

const OFFER_DAYS = 50;
const PLAN_CODES = ["BASIC", "ADVANCED", "AGENTIC"];
const appUrl = (env) =>
  (env === "prod" ? process.env.OFFER_APP_URL_PROD || "https://store.davadesk.in" : process.env.OFFER_APP_URL_DEV || "https://store-dev.davadesk.in").replace(/\/+$/, "");

// Codes look like FIFTY-7KQ2MX (no 0/O/1/I)
function newCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) out += chars[crypto.randomInt(chars.length)];
  return `FIFTY-${out}`;
}

const day = (d) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" }) : "");

function draftFor(lead, promo, env) {
  const first = lead.name.split(/\s+/)[0] || "there";
  const url = appUrl(env);
  return {
    subject: `Your ${OFFER_DAYS}-day DavaDesk access code · 50-50 Launch Offer`,
    text: [
      `Namaste ${first},`,
      `Thank you for registering for the DavaDesk 50-50 Launch Offer${lead.pharmacy_name && lead.pharmacy_name !== "—" ? ` for ${lead.pharmacy_name}` : ""}. As promised, here is your personal code for ${OFFER_DAYS} days of free access to DavaDesk (${promo.plans[0]} plan).`,
      `Your personal code:\n${promo.code}`,
      `How to activate:\n1. Create your account at ${url}/register using this email (${lead.email || "your email"}).\n2. After signing in, open Upgrade / Plans and enter the code under "Have a promo or discount code?".\n3. Your ${OFFER_DAYS} days start the moment the code is applied.`,
      promo.valid_until ? `Please apply the code before ${day(promo.valid_until)}. After that it stops working.` : null,
      `IMPORTANT: please read before you continue\n• This code is only for you and your pharmacy. Anyone who has it can activate a DavaDesk account for ${OFFER_DAYS} days, so do not share, forward or post it anywhere.\n• The code works only once. If someone else uses it first, it can't be used for your account.\n• DavaDesk will never ask you for this code on a call. If you think it has been shared or misused, reply to this email straight away and we will cancel it and send you a new one.`,
      `If you have any questions, just reply to this email and our team will help you get started.`,
      `Warm regards,\nTeam DavaDesk`,
    ]
      .filter(Boolean)
      .join("\n\n"),
  };
}

// Everything the panel shows about one registration in this environment
async function enrich(db, leads, env) {
  const ids = leads.map((l) => l.lead_id);
  const emails = leads.map((l) => l.email).filter(Boolean);
  const mobiles = leads.map((l) => l.mobile_key).filter(Boolean);
  const [crm, promos, users] = await Promise.all([
    db.collection("admin_leads").find({ lead_id: { $in: ids } }).toArray(),
    db.collection("promo_codes").find({ source: SOURCE, "offer_lead.lead_id": { $in: ids } }).sort({ created_at: -1 }).toArray(),
    db
      .collection("users")
      .find(
        { $or: [{ email: { $in: emails } }, ...(mobiles.length ? [{ mobile: { $regex: `(${mobiles.join("|")})$` } }] : [])] },
        { projection: { _id: 0, id: 1, name: 1, email: 1, mobile: 1, pharmacy_id: 1, created_at: 1, last_login_at: 1, is_primary_admin: 1 } }
      )
      .toArray(),
  ]);
  const codes = promos.map((p) => p.code);
  const [redemptions, pharmacies] = await Promise.all([
    db.collection("promo_redemptions").find({ code: { $in: codes }, status: "REDEEMED" }).toArray(),
    db
      .collection("pharmacies")
      .find({ id: { $in: [...new Set(users.map((u) => u.pharmacy_id).filter(Boolean))] } }, { projection: { _id: 0, id: 1, name: 1, subscription: 1 } })
      .toArray(),
  ]);
  const crmBy = new Map(crm.map((c) => [c.lead_id, c]));
  const pharmBy = new Map(pharmacies.map((p) => [p.id, p]));
  const now = new Date();

  return leads.map((l) => {
    const c = crmBy.get(l.lead_id) || {};
    const myCodes = promos.filter((p) => p.offer_lead?.lead_id === l.lead_id);
    const current = myCodes.find((p) => p.is_active) || myCodes[0] || null;
    const redeemed = redemptions.find((r) => myCodes.some((p) => p.code === r.code)) || null;
    const user =
      (redeemed && users.find((u) => u.id === redeemed.user_id)) ||
      users.find((u) => l.email && emailKey(u.email) === l.email && u.is_primary_admin) ||
      users.find((u) => l.email && emailKey(u.email) === l.email) ||
      users.find((u) => l.mobile_key && mobileKey(u.mobile) === l.mobile_key) ||
      null;
    const pharm = user ? pharmBy.get(user.pharmacy_id) : redeemed ? pharmBy.get(redeemed.pharmacy_id) : null;
    const sub = pharm?.subscription ? describe(pharm.subscription, now) : null;
    const emailsSent = (c.offer?.emails || []).filter((e) => !e.test);
    const stage = redeemed ? "ACTIVATED" : user ? "REGISTERED" : emailsSent.length ? "CODE_SENT" : current ? "CODE_READY" : "NOT_SENT";
    return {
      ...l,
      // CRM (same fields as the Leads CRM, so its notes modal works)
      is_connected: !!c.is_connected,
      crm_status: c.status || "NEW",
      notes: c.notes || [],
      last_connected_at: c.last_connected_at || null,
      assigned_to: c.assigned_to || "Operations Team",
      // Offer
      stage,
      code: current
        ? {
            code: current.code,
            plan: current.plans?.[0] || null,
            duration_days: current.duration_days,
            is_active: !!current.is_active,
            valid_until: current.valid_until || null,
            expired: !!(current.valid_until && new Date(current.valid_until) <= now),
            used: !!redeemed || (current.used_count || 0) > 0,
            created_at: current.created_at,
          }
        : null,
      codes_issued: myCodes.length,
      emails: (c.offer?.emails || []).slice(-10),
      last_email_at: emailsSent.length ? emailsSent[emailsSent.length - 1].at : null,
      redeemed_at: redeemed ? redeemed.updated_at || redeemed.created_at : null,
      account: user
        ? {
            user_id: user.id,
            name: user.name,
            email: user.email,
            pharmacy_id: user.pharmacy_id,
            pharmacy_name: pharm?.name || null,
            registered_at: user.created_at || null,
            last_login_at: user.last_login_at || null,
            plan: sub?.plan || null,
            plan_status: sub?.status || "NONE",
            plan_kind: sub?.kind || null,
            days_left: sub?.days_left ?? null,
            ends_at: sub?.ends_at || null,
          }
        : null,
    };
  });
}

router.get("/", async (req, res, next) => {
  try {
    const { search, stage, status, connected, page = 1, limit = 100 } = req.query;
    const all = await enrich(req.db, await listOfferLeads({ fresh: req.query.fresh === "1" }), req.dbEnv);
    const count = (fn) => all.filter(fn).length;
    const summary = {
      total: all.length,
      not_sent: count((l) => l.stage === "NOT_SENT" || l.stage === "CODE_READY"),
      code_sent: count((l) => l.stage === "CODE_SENT"),
      registered: count((l) => l.stage === "REGISTERED"),
      activated: count((l) => l.stage === "ACTIVATED"),
      connected: count((l) => l.is_connected),
      uncontacted: count((l) => !l.is_connected && l.crm_status === "NEW"),
    };
    let rows = all;
    if (search) {
      const t = String(search).toLowerCase();
      rows = rows.filter((l) => `${l.name} ${l.email} ${l.mobile} ${l.pharmacy_name} ${l.location} ${l.registration_id} ${l.code?.code || ""}`.toLowerCase().includes(t));
    }
    if (stage && stage !== "ALL") rows = rows.filter((l) => (stage === "NOT_SENT" ? l.stage === "NOT_SENT" || l.stage === "CODE_READY" : l.stage === stage));
    if (status && status !== "ALL") rows = rows.filter((l) => l.crm_status === status);
    if (connected === "true") rows = rows.filter((l) => l.is_connected);
    if (connected === "false") rows = rows.filter((l) => !l.is_connected);
    const lim = Math.min(500, Math.max(1, parseInt(limit) || 100));
    const pg = Math.max(1, parseInt(page) || 1);
    res.json({ env: req.dbEnv, app_url: appUrl(req.dbEnv), offer_days: OFFER_DAYS, summary, total: rows.length, page: pg, leads: rows.slice((pg - 1) * lim, pg * lim) });
  } catch (err) {
    if (err.status === 503) return res.status(503).json({ error: err.message });
    next(err);
  }
});

router.get("/:leadId", async (req, res, next) => {
  try {
    const lead = await getOfferLead(req.params.leadId);
    if (!lead) return res.status(404).json({ error: "Registration not found" });
    const [row] = await enrich(req.db, [lead], req.dbEnv);
    res.json({ env: req.dbEnv, lead: row });
  } catch (err) {
    next(err);
  }
});

const codeSchema = z.object({
  plan: z.enum(PLAN_CODES).default("AGENTIC"),
  valid_days: z.number().int().min(1).max(365).default(30), // days to apply the code
  regenerate: z.boolean().default(false),
});

router.post("/:leadId/code", async (req, res, next) => {
  try {
    const d = parseBody(codeSchema, req, res);
    if (!d) return;
    const lead = await getOfferLead(req.params.leadId);
    if (!lead) return res.status(404).json({ error: "Registration not found" });
    const db = req.db;
    const now = new Date();

    const existing = await db.collection("promo_codes").find({ source: SOURCE, "offer_lead.lead_id": lead.lead_id }).sort({ created_at: -1 }).toArray();
    const usedOne = existing.find((p) => (p.used_count || 0) > 0);
    if (usedOne) return res.status(409).json({ error: `${lead.name} already activated with ${usedOne.code}` });

    let promo = existing.find((p) => p.is_active && (!p.valid_until || new Date(p.valid_until) > now));
    const replaced = promo && d.regenerate ? promo.code : null;
    if (promo && d.regenerate) {
      // A fresh code cancels the old one (it was never used)
      await db.collection("promo_codes").updateMany({ source: SOURCE, "offer_lead.lead_id": lead.lead_id, used_count: { $in: [0, null] } }, { $set: { is_active: false, cancelled_at: now.toISOString() } });
      await audit(req, "OFFER_CODE_CANCELLED", promo.code, { lead_id: lead.lead_id });
      promo = null;
    }
    if (!promo) {
      for (let i = 0; i < 5 && !promo; i++) {
        const doc = {
          code: newCode(),
          type: "ACCESS",
          plans: [d.plan],
          duration_days: OFFER_DAYS,
          discount: null,
          usage_limit: 1,
          used_count: 0,
          per_account_limit: 1,
          is_active: true,
          source: SOURCE,
          offer_lead: { lead_id: lead.lead_id, registration_id: lead.registration_id, name: lead.name, email: lead.email, mobile: lead.mobile },
          valid_from: null,
          valid_until: new Date(now.getTime() + d.valid_days * 864e5),
          notes: `50-50 Launch Offer · ${lead.name} · ${lead.registration_id || lead.source_id}`,
          created_by: req.adminUser?.email || "Admin Panel",
          created_at: now.toISOString(),
        };
        try {
          await db.collection("promo_codes").insertOne(doc);
          promo = doc;
        } catch (err) {
          if (err.code !== 11000) throw err; // code collision: try another
        }
      }
      await audit(req, "OFFER_CODE_CREATED", promo.code, { lead_id: lead.lead_id, plan: d.plan, days: OFFER_DAYS });
      await db.collection("admin_leads").updateOne(
        { lead_id: lead.lead_id },
        {
          $push: { notes: { id: uuidv4(), text: `Generated ${OFFER_DAYS}-day ${d.plan} code ${promo.code}${replaced ? ` (replaces ${replaced}, now cancelled)` : ""}`, author: req.adminUser?.name || req.adminUser?.email || "Admin", outcome: "50-50 code generated", follow_up_date: null, created_at: now.toISOString(), system: true } },
          $set: { updated_at: now.toISOString(), source_type: SOURCE },
          $setOnInsert: { lead_id: lead.lead_id, created_at: now.toISOString(), status: "NEW", is_connected: false, assigned_to: "Operations Team" },
        },
        { upsert: true }
      );
    }
    res.json({
      code: promo.code,
      plan: promo.plans[0],
      duration_days: promo.duration_days,
      valid_until: promo.valid_until,
      reused: !!existing.find((p) => p.code === promo.code),
      draft: draftFor(lead, promo, req.dbEnv),
      to: { email: lead.email, name: lead.name },
      app_url: appUrl(req.dbEnv),
    });
  } catch (err) {
    next(err);
  }
});

const sendSchema = z.object({
  subject: z.string().trim().min(5).max(200),
  text: z.string().trim().min(40).max(8000),
  test: z.boolean().default(false),
});

router.post("/:leadId/send", async (req, res, next) => {
  try {
    const d = parseBody(sendSchema, req, res);
    if (!d) return;
    const lead = await getOfferLead(req.params.leadId);
    if (!lead) return res.status(404).json({ error: "Registration not found" });
    const db = req.db;
    const now = new Date();
    const promo = await db
      .collection("promo_codes")
      .findOne({ source: SOURCE, "offer_lead.lead_id": lead.lead_id, is_active: true }, { sort: { created_at: -1 } });
    if (!promo) return res.status(400).json({ error: "Generate the code first" });
    if (promo.valid_until && new Date(promo.valid_until) <= now) return res.status(400).json({ error: "This code has expired. Generate a new one." });
    if ((promo.used_count || 0) > 0) return res.status(409).json({ error: "This code has already been used" });
    if (!d.text.includes(promo.code)) return res.status(400).json({ error: `The email must contain the code ${promo.code}` });

    const to = d.test ? req.adminUser?.email : lead.email;
    if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return res.status(400).json({ error: d.test ? "Your admin account has no email" : "This registration has no valid email" });

    let sent;
    try {
      sent = await sendTextEmail({ toEmail: to, toName: d.test ? req.adminUser?.name : lead.name, subject: d.test ? `[TEST] ${d.subject}` : d.subject, text: d.text, highlight: promo.code, replyTo: process.env.MAIL_REPLY_TO || undefined });
    } catch (err) {
      console.error("[offer-leads] email failed:", err.response?.body || err.message);
      return res.status(err.status === 503 ? 503 : 502).json({ error: err.message || "The email could not be sent. Please try again." });
    }

    const entry = { id: uuidv4(), at: now.toISOString(), to, subject: d.subject, code: promo.code, test: d.test, by: req.adminUser?.email || null, message_id: sent.message_id, provider: sent.provider };
    const update = { $push: { "offer.emails": entry }, $set: { updated_at: now.toISOString(), source_type: SOURCE }, $setOnInsert: { lead_id: lead.lead_id, created_at: now.toISOString(), status: "NEW", is_connected: false, assigned_to: "Operations Team" } };
    if (!d.test) {
      update.$push.notes = { id: uuidv4(), text: `Emailed ${OFFER_DAYS}-day code ${promo.code} to ${to}`, author: req.adminUser?.name || req.adminUser?.email || "Admin", outcome: "50-50 code emailed", follow_up_date: null, created_at: now.toISOString(), system: true };
    }
    await db.collection("admin_leads").updateOne({ lead_id: lead.lead_id }, update, { upsert: true });
    await audit(req, d.test ? "OFFER_EMAIL_TEST" : "OFFER_EMAIL_SENT", promo.code, { lead_id: lead.lead_id, to });
    res.json({ message: `${d.test ? "Test sent" : "Sent"} to ${to} via ${sent.provider === "ses" ? "Amazon SES" : "Brevo"}`, email: entry });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
module.exports.LEAD_PREFIX = LEAD_PREFIX;
