const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");
const { auth } = require("../middleware/auth");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { requireSubscription } = require("../middleware/subscription");

const SCHEMA = {
  description: "Structure of the Agent response",
  type: "object",
  properties: {
    type: { type: "string", enum: ["text", "action"] },
    content: { type: "string", description: "The message to show the user" },
    action: {
      type: "object",
      properties: {
        intent: {
          type: "string",
          enum: [
            "create_purchase",
            "list_purchases",
            "delete_purchase",
            "check_price_history",
          ],
        },
        data: {
          type: "object",
          properties: {
            supplier_name: { type: "string" },
            purchase_date: { type: "string" },
            invoice_no: { type: "string" },
            items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  product_name: { type: "string" },
                  pack_quantity: { type: "number" },
                  units_per_pack: { type: "number" },
                  pack_price: { type: "number" },
                  mrp_pack: { type: "number" },
                  batch_no: { type: "string" },
                  expiry_date: { type: "string" },
                  hsn_no: { type: "string" },
                  pack_type: {
                    type: "string",
                    enum: ["Strip", "Bottle", "Tube", "Packet", "Box", "Unit"],
                  },
                },
                required: ["product_name", "pack_quantity", "pack_price"],
              },
            },
            purchase_id: { type: "string" },
          },
        },
      },
    },
    chips: { type: "array", items: { type: "string" } },
  },
  required: ["type", "content"],
};

const SYSTEM_INSTRUCTION = `YOU ARE THE PHARMALOGY EXPERT AGENT. 

IDENTITY:
- You are a Pharmacy management assistant developed by **Team Pharmalogy** to help manage pharmacies efficiently.
- If asked "Who made you?" or similar, answer: "I am a Pharmacy management assistant developed by team Pharmalogy to help you manage your pharmacy efficiently."

PHARMACY EXPERTISE:
- You are a specialist in Medicines, Salts, Dosages, and Side Effects.
- BUSINESS EXPERT: You also helps with Pharmacy Business Management, profit margins, inventory optimization, and sales strategy.
- You can discuss Generic vs. Patent medicines, profit-earning strategies in a pharmacy, and how to manage inventory for better growth.
- Provide detailed, professional, and beautifully formatted information.
- Use Markdown: ## Headers, **Bold** for medicine names, > Blockquotes for warnings, and | Tables | for comparisons/dosages.

GUARDRAILS (STRICT):
- If the user asks anything completely UNRELATED to pharmacy, health, medicines, business operations, or your specific actions, you MUST politely refuse.
- Refusal Message: "I am designed to help you with your pharmacy needs. Please let me know if you have a question about a medication, purchase, or billing."
- This does NOT apply to basic greetings ("Hi", "How are you?"), your identity, or pharmacy business/growth strategy questions.

ACTION ENGINE:
1. IDENTIFY INTENTS: create_purchase, list_purchases, delete_purchase, check_price_history.
2. SMART CALCULATIONS:
   - If user says "₹100 total for 5 packs", calculate pack_price = 20.
   - Default units_per_pack = 1, pack_type = "Strip", batch_no = "BT-" + random, expiry_date = 1 year from now.
   - MRP: If user says "MRP 20 per unit" and "10 units per pack", calculate mrp_pack = 200.
3. ENTITY MAPPING: Handle "Supplier X" by populating supplier_name.
4. MULTI-ITEM SUPPORT: Support adding multiple products in one go.

RULES:
- RETURN ONLY JSON.
- If data is missing for create_purchase, set type="text" and ask using chips.
- Mandatory fields for create_purchase: supplier_name, items (product_name, pack_quantity, pack_price).
- Always include the 'items' array inside 'data' for create_purchase.`;

// GET /conversations - List all conversations for the authenticated user
router.get("/conversations", auth, async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const conversations = await db
      .collection("conversations")
      .find({ user_id: req.user.id })
      .sort({ updated_at: -1 })
      .project({ messages: 0 }) // Don't return messages in list view
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

// POST / - Chat with the agent
router.post("/", auth, requireSubscription(), async (req, res, next) => {
  try {
    const { message, conversationId, conversationHistory = [] } = req.body;
    if (!message)
      return res.status(400).json({ detail: "Message is required" });

    const db = mongoose.connection.db;
    let historyToUse = conversationHistory;
    let currentConversation = null;

    // 1. Manage/Restore Conversation from DB if ID provided
    if (conversationId) {
      currentConversation = await db.collection("conversations").findOne({
        id: conversationId,
        user_id: req.user.id,
      });
      if (currentConversation) {
        historyToUse = currentConversation.messages;
      }
    }

    const apiKey = process.env.EMERGENT_LLM_KEY || process.env.GEMINI_API_KEY;
    const genAI = new GoogleGenerativeAI(apiKey);

    const model = genAI.getGenerativeModel(
      {
        model: "gemini-2.0-flash",
        systemInstruction: SYSTEM_INSTRUCTION,
      },
      { apiVersion: "v1beta" }
    );

    // Filter and format history for Gemini (limit to last 15 for efficiency)
    const recentHistory = historyToUse.slice(-15);
    const firstUserIndex = recentHistory.findIndex((m) => m.role === "user");

    const cleanHistory = (
      firstUserIndex === -1 ? [] : recentHistory.slice(firstUserIndex)
    ).map((m) => ({
      role: m.role === "model" ? "model" : "user",
      parts: [
        { text: typeof m.text === "string" ? m.text : JSON.stringify(m.text) },
      ],
    }));

    const chat = model.startChat({
      history: cleanHistory,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: SCHEMA,
        temperature: 0.1,
      },
    });

    const result = await chat.sendMessage(message);
    const response = await result.response;
    const jsonResponse = JSON.parse(response.text());

    // 2. Save Conversation to DB
    const userMsg = { role: "user", text: message, timestamp: new Date() };
    const modelMsg = {
      role: "model",
      text: jsonResponse.content,
      chips: jsonResponse.chips || [],
      action: jsonResponse.action || null,
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
    console.error("Agent Error:", error);
    res.status(500).json({ detail: error.message });
  }
});

module.exports = router;
