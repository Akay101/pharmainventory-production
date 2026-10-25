const express = require("express");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");
const { resolveDbEnv } = require("../db/connections");
const { describe } = require("../services/billing/subscriptions");

router.use(resolveDbEnv);

// GET /api/leads - List all leads (unsubscribed users + pending registrations)
router.get("/", async (req, res, next) => {
  try {
    const db = req.db;
    const { status, connected, search, page = 1, limit = 50 } = req.query;
    const now = new Date();

    const [users, pharmacies, subscriptions, pendingRegs, crmLeads] = await Promise.all([
      db.collection("users").find({}).toArray(),
      db.collection("pharmacies").find({}).toArray(),
      db.collection("subscriptions").find({}).toArray(),
      db.collection("pending_registrations").find({}).toArray().catch(() => []),
      db.collection("admin_leads").find({}).toArray().catch(() => []),
    ]);

    const pharmacyMap = new Map();
    pharmacies.forEach((p) => {
      pharmacyMap.set(p.id, {
        name: p.name || p.pharmacy_name || "Unknown Pharmacy",
        location: p.location || "N/A",
        contact: p.contact || null,
        // undefined = pharmacy not migrated to pharmacy-level subscriptions yet
        subscription: p.subscription === undefined ? undefined : describe(p.subscription),
      });
    });

    const activeUserIds = new Set();
    subscriptions.forEach((s) => {
      if (s.status === "ACTIVE" && s.end_date && new Date(s.end_date) > now) {
        activeUserIds.add(s.user_id);
      }
    });

    const crmMap = new Map();
    crmLeads.forEach((c) => {
      crmMap.set(c.lead_id, c);
    });

    const leads = [];

    // 1. Unsubscribed registered users
    users.forEach((u) => {
      const pharmSub = pharmacyMap.get(u.pharmacy_id)?.subscription;
      const isTrial = pharmSub?.status === "TRIAL";
      // Paying customers are not leads; trial users are (hottest ones)
      const isSubscribed = pharmSub
        ? pharmSub.status === "ACTIVE"
        : (u.subscription_plan && u.subscription_expiry && new Date(u.subscription_expiry) > now) ||
          activeUserIds.has(u.id);

      if (!isSubscribed) {
        const crmData = crmMap.get(u.id) || {
          is_connected: false,
          status: "NEW",
          notes: [],
          last_connected_at: null,
          assigned_to: "Operations Team",
        };

        const pharm = pharmacyMap.get(u.pharmacy_id) || {
          name: "Unassigned Pharmacy",
          location: "N/A",
        };

        const isExpired = u.subscription_plan || subscriptions.some((s) => s.user_id === u.id);

        leads.push({
          lead_id: u.id,
          user_id: u.id,
          source_type: "REGISTERED_USER",
          name: u.name || "Customer",
          email: u.email,
          mobile: u.mobile || "N/A",
          role: u.role || "ADMIN",
          pharmacy_id: u.pharmacy_id,
          pharmacy_name: pharm.name,
          pharmacy_location: pharm.location,
          is_primary_admin: !!u.is_primary_admin,
          verified: !!u.verified,
          created_at: u.created_at,
          lead_category: isTrial ? "ON_TRIAL" : isExpired ? "SUBSCRIPTION_EXPIRED" : "NEW_REGISTRATION_UNPAID",
          trial_ends_at: isTrial ? pharmSub.ends_at : null,
          previous_plan: u.subscription_plan || null,
          subscription_expiry: u.subscription_expiry || null,
          is_connected: !!crmData.is_connected,
          crm_status: crmData.status || "NEW",
          notes: crmData.notes || [],
          last_connected_at: crmData.last_connected_at,
          assigned_to: crmData.assigned_to || "Operations Team",
        });
      }
    });

    // 2. Pending registrations (dropped off at OTP)
    pendingRegs.forEach((p) => {
      const crmData = crmMap.get(p.id) || {
        is_connected: false,
        status: "NEW",
        notes: [],
        last_connected_at: null,
        assigned_to: "Operations Team",
      };

      leads.push({
        lead_id: p.id,
        user_id: null,
        source_type: "PENDING_REGISTRATION",
        name: p.name || "Pending Applicant",
        email: p.email,
        mobile: p.mobile || "N/A",
        role: "ADMIN",
        pharmacy_id: null,
        pharmacy_name: p.pharmacy?.name || "Pending Registration",
        pharmacy_location: p.pharmacy?.location || "N/A",
        is_primary_admin: true,
        verified: false,
        created_at: p.created_at,
        lead_category: "DROPPED_AT_OTP",
        previous_plan: null,
        subscription_expiry: null,
        is_connected: !!crmData.is_connected,
        crm_status: crmData.status || "NEW",
        notes: crmData.notes || [],
        last_connected_at: crmData.last_connected_at,
        assigned_to: crmData.assigned_to || "Operations Team",
      });
    });

    // Filtering
    let filtered = leads;

    if (search) {
      const term = search.toLowerCase();
      filtered = filtered.filter(
        (l) =>
          l.name.toLowerCase().includes(term) ||
          l.email.toLowerCase().includes(term) ||
          l.mobile.toLowerCase().includes(term) ||
          l.pharmacy_name.toLowerCase().includes(term)
      );
    }

    if (status && status !== "ALL") {
      filtered = filtered.filter((l) => l.crm_status === status);
    }

    if (connected === "true") {
      filtered = filtered.filter((l) => l.is_connected);
    } else if (connected === "false") {
      filtered = filtered.filter((l) => !l.is_connected);
    }

    // Sort by most recent registration
    filtered.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

    // Stats
    const totalLeads = leads.length;
    const connectedLeads = leads.filter((l) => l.is_connected).length;
    const freshLeads = leads.filter((l) => !l.is_connected && l.crm_status === "NEW").length;
    const wonLeads = leads.filter((l) => l.crm_status === "WON").length;

    const startIndex = (parseInt(page) - 1) * parseInt(limit);
    const paginated = filtered.slice(startIndex, startIndex + parseInt(limit));

    res.json({
      env: req.dbEnv,
      summary: {
        total_leads: totalLeads,
        connected_leads: connectedLeads,
        fresh_uncontacted: freshLeads,
        converted_leads: wonLeads,
      },
      total: filtered.length,
      page: parseInt(page),
      limit: parseInt(limit),
      leads: paginated,
    });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/leads/:leadId/status - Update CRM lead status & connection state
router.patch("/:leadId/status", async (req, res, next) => {
  try {
    const db = req.db;
    const { leadId } = req.params;
    const { status, is_connected } = req.body;

    const updateFields = {
      lead_id: leadId,
      updated_at: new Date().toISOString(),
    };

    if (status) updateFields.status = status;
    if (is_connected !== undefined) {
      updateFields.is_connected = is_connected;
      if (is_connected) {
        updateFields.last_connected_at = new Date().toISOString();
      }
    }

    await db.collection("admin_leads").updateOne(
      { lead_id: leadId },
      {
        $set: updateFields,
        $setOnInsert: { created_at: new Date().toISOString(), notes: [] },
      },
      { upsert: true }
    );

    const updated = await db.collection("admin_leads").findOne({ lead_id: leadId });
    res.json({ message: "Lead status updated", lead: updated });
  } catch (error) {
    next(error);
  }
});

// POST /api/leads/:leadId/note - Add note, timestamp, author & mark as connected
router.patch("/:leadId/connect", async (req, res, next) => {
  try {
    const db = req.db;
    const { leadId } = req.params;
    const now = new Date().toISOString();

    await db.collection("admin_leads").updateOne(
      { lead_id: leadId },
      {
        $set: {
          is_connected: true,
          status: "CONNECTED",
          last_connected_at: now,
          updated_at: now,
        },
        $setOnInsert: { created_at: now, notes: [] },
      },
      { upsert: true }
    );

    res.json({ message: "Lead marked as connected", lead_id: leadId, connected_at: now });
  } catch (error) {
    next(error);
  }
});

// POST /api/leads/:leadId/note - Add note and follow-up
router.post("/:leadId/note", async (req, res, next) => {
  try {
    const db = req.db;
    const { leadId } = req.params;
    const { text, author = "Admin Team", outcome = "Connected via phone", follow_up_date } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ detail: "Note text is required" });
    }

    const noteObj = {
      id: uuidv4(),
      text: text.trim(),
      author: author.trim(),
      outcome: outcome.trim(),
      follow_up_date: follow_up_date || null,
      created_at: new Date().toISOString(),
    };

    const now = new Date().toISOString();

    await db.collection("admin_leads").updateOne(
      { lead_id: leadId },
      {
        $push: { notes: noteObj },
        $set: {
          is_connected: true,
          last_connected_at: now,
          updated_at: now,
        },
        $setOnInsert: {
          created_at: now,
          status: "CONNECTED",
          assigned_to: "Operations Team",
        },
      },
      { upsert: true }
    );

    const updatedLead = await db.collection("admin_leads").findOne({ lead_id: leadId });

    res.json({
      message: "Note added successfully",
      note: noteObj,
      lead: updatedLead,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
