const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");
const { auth } = require("../middleware/auth");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { requireSubscription } = require("../middleware/subscription");

const { routeIntent } = require("../services/agent/router");
const purchaseAgent = require("../services/agent/purchaseAgent");

const GENERAL_SYSTEM_INSTRUCTION = `YOU ARE THE PHARMALOGY EXPERT AGENT. 

IDENTITY:
- You are a Pharmacy management assistant developed by **Team pharmacy** to help manage pharmacies efficiently.
- If asked "Who made you?" or similar, answer: "I am a Pharmacy management assistant developed by team pharmacy to help you manage your pharmacy efficiently."

PHARMACY EXPERTISE:
- You are a specialist in Medicines, Salts, Dosages, Side Effects, and Pharmacy Business Strategy.
- Provide detailed, professional, and beautifully formatted information using Markdown (Headers, Bold, Blockquotes, Tables).

GUARDRAILS (STRICT):
- If the user asks anything completely UNRELATED to pharmacy, health, medicines, business operations, or your specific actions, politely refuse: "I am designed to help you with your pharmacy needs. Please let me know if you have a question about a medication, purchase, or billing."`;

// GET /stats - Fetch real-time pharmacy metrics for the agent sidebar
router.get("/stats", auth, async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const pharmacyId = req.user.pharmacy_id;

    // Start of current month (YYYY-MM-01)
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);

    // 1. MTD Purchases Total
    const mtdPurchasesRes = await db
      .collection("purchases")
      .aggregate([
        {
          $match: {
            pharmacy_id: pharmacyId,
            purchase_date: { $gte: startOfMonth },
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: "$total_amount" },
          },
        },
      ])
      .toArray();
    const mtd_purchases = mtdPurchasesRes.length > 0 ? mtdPurchasesRes[0].total : 0;

    // 2. Active Suppliers Count
    const active_suppliers = await db.collection("suppliers").countDocuments({ pharmacy_id: pharmacyId });

    // 3. Supplier Dues Total
    const unpaidPurchases = await db
      .collection("purchases")
      .find({
        pharmacy_id: pharmacyId,
        payment_status: { $ne: "Paid" },
      })
      .project({ total_amount: 1, amount_paid: 1 })
      .toArray();

    let supplier_dues = 0;
    unpaidPurchases.forEach((p) => {
      const remaining = (p.total_amount || 0) - (p.amount_paid || 0);
      if (remaining > 0) supplier_dues += remaining;
    });

    // 4. Low Stock Alerts Count
    const low_stock_count = await db.collection("inventory").countDocuments({
      pharmacy_id: pharmacyId,
      $expr: {
        $lte: ["$available_quantity", { $ifNull: ["$shortage_threshold", 10] }],
      },
    });

    res.json({
      mtd_purchases,
      active_suppliers,
      supplier_dues,
      low_stock_count,
    });
  } catch (error) {
    console.error("Agent Stats Error:", error);
    res.status(500).json({ detail: error.message });
  }
});

// POST /mark-recorded - Persist draft purchase recorded status in MongoDB
router.post("/mark-recorded", auth, async (req, res) => {
  try {
    const { conversationId, purchase_id } = req.body;
    if (!conversationId) {
      return res.status(400).json({ detail: "conversationId is required" });
    }

    const db = mongoose.connection.db;

    await db.collection("conversations").updateOne(
      { id: conversationId, user_id: req.user.id },
      {
        $set: {
          "messages.$[elem].draftState.recorded": true,
          "messages.$[elem].draftState.purchase_id": purchase_id || null,
        },
      },
      { arrayFilters: [{ "elem.draftState": { $exists: true } }] }
    );

    res.json({ detail: "Draft marked as recorded in DB" });
  } catch (error) {
    console.error("Mark Recorded Error:", error);
    res.status(500).json({ detail: error.message });
  }
});

// GET /conversations - List all conversations for the authenticated user
router.get("/conversations", auth, async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const conversations = await db
      .collection("conversations")
      .find({ user_id: req.user.id })
      .sort({ updated_at: -1 })
      .project({ messages: 0 })
      .toArray();

    res.json(conversations);
  } catch (error) {
    res.status(500).json({ detail: error.message });
  }
});

// GET /conversations/:id - Get specific conversation history
router.get("/conversations/:id", auth, async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const conversation = await db
      .collection("conversations")
      .findOne({ id: req.params.id, user_id: req.user.id });

    if (!conversation) {
      return res.status(404).json({ detail: "Conversation not found" });
    }

    res.json(conversation);
  } catch (error) {
    res.status(500).json({ detail: error.message });
  }
});

// DELETE /conversations/:id - Delete a conversation
router.delete("/conversations/:id", auth, async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const result = await db
      .collection("conversations")
      .deleteOne({ id: req.params.id, user_id: req.user.id });

    if (result.deletedCount === 0) {
      return res.status(404).json({ detail: "Conversation not found" });
    }

    res.json({ detail: "Conversation deleted" });
  } catch (error) {
    res.status(500).json({ detail: error.message });
  }
});

// POST / - Chat with the Modular Agent Gateway
router.post("/", auth, requireSubscription(), async (req, res, next) => {
  try {
    const { message, conversationId, conversationHistory = [], draftState = null } = req.body;
    if (!message)
      return res.status(400).json({ detail: "Message is required" });

    const db = mongoose.connection.db;
    let historyToUse = conversationHistory;
    let currentConversation = null;

    if (conversationId) {
      currentConversation = await db.collection("conversations").findOne({
        id: conversationId,
        user_id: req.user.id,
      });
      if (currentConversation) {
        historyToUse = currentConversation.messages;
      }
    }

    // AI Gateway & Intent Router
    const routeResult = await routeIntent(message, historyToUse);

    let agentResponse = null;

    if (routeResult.module === "purchase") {
      agentResponse = await purchaseAgent.process({
        db,
        message,
        history: historyToUse,
        userContext: req.user,
        draftState,
        intent: routeResult.intent,
        entities: routeResult.entities,
      });
    } else {
      const apiKey = process.env.EMERGENT_LLM_KEY || process.env.GEMINI_API_KEY;
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        systemInstruction: GENERAL_SYSTEM_INSTRUCTION,
      });

      const recentHistory = historyToUse.slice(-10);
      const cleanHistory = recentHistory.map((m) => ({
        role: m.role === "model" ? "model" : "user",
        parts: [{ text: typeof m.text === "string" ? m.text : JSON.stringify(m.text) }],
      }));

      const chat = model.startChat({ history: cleanHistory });
      const result = await chat.sendMessage(message);
      const text = result.response.text();

      agentResponse = {
        module: "general",
        intent: "general_chat",
        content: text,
        draftState: null,
        action: null,
        chips: ["How to manage inventory?", "Check price history for Dolo 650", "Create purchase for Crocin"],
        confidence: 1.0,
      };
    }

    // Standardize output payload format
    const jsonResponse = {
      type: agentResponse.action ? "action" : "text",
      content: agentResponse.content,
      module: agentResponse.module,
      intent: agentResponse.intent,
      viewType: agentResponse.viewType || null,
      purchasesData: agentResponse.purchasesData || null,
      draftState: agentResponse.draftState,
      action: agentResponse.action,
      chips: agentResponse.chips || [],
    };

    // Save Conversation to DB
    const userMsg = { role: "user", text: message, timestamp: new Date() };
    const modelMsg = {
      role: "model",
      text: jsonResponse.content,
      viewType: jsonResponse.viewType || null,
      purchasesData: jsonResponse.purchasesData || null,
      chips: jsonResponse.chips || [],
      action: jsonResponse.action || null,
      draftState: jsonResponse.draftState || null,
      timestamp: new Date(),
    };

    if (currentConversation) {
      await db.collection("conversations").updateOne(
        { id: conversationId },
        {
          $push: { messages: { $each: [userMsg, modelMsg] } },
          $set: {
            updated_at: new Date(),
            last_message: jsonResponse.content.substring(0, 50),
          },
        }
      );
      jsonResponse.conversationId = conversationId;
    } else {
      const newId = uuidv4();
      await db.collection("conversations").insertOne({
        id: newId,
        user_id: req.user.id,
        pharmacy_id: req.user.pharmacy_id,
        title: message.substring(0, 40) + (message.length > 40 ? "..." : ""),
        last_message: jsonResponse.content.substring(0, 50),
        messages: [userMsg, modelMsg],
        created_at: new Date(),
        updated_at: new Date(),
      });
      jsonResponse.conversationId = newId;
    }

    return res.json(jsonResponse);
  } catch (error) {
    console.error("Agent Gateway Error:", error);
    res.status(500).json({ detail: error.message });
  }
});

module.exports = router;
