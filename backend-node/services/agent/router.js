const { GoogleGenerativeAI } = require("@google/generative-ai");

const ROUTER_SYSTEM_INSTRUCTION = `You are the AI Gateway & Intent Router for a Pharmacy Management System.
Your job is to analyze the user's input and classify it into a specific module and intent.

Available Modules & Intents:
1. Module: "purchase"
   - Intents:
     * "create_purchase": User wants to create/record a purchase, buy medicines from supplier, or add invoice stock.
     * "list_purchases": User wants to view, list, search, or analyze historical purchases (e.g., "past 7 days purchases", "highest amount purchase", "unpaid purchases", "purchases from Apollo").
     * "delete_purchase": User wants to delete or cancel a purchase record.
     * "check_price_history": User wants to check or compare historical purchase prices for a medicine.

2. Module: "inventory"
   - Intents: "view_inventory", "adjust_stock", "check_expiry", "merge_batches"

3. Module: "billing"
   - Intents: "create_bill", "list_bills", "delete_bill"

4. Module: "suppliers"
   - Intents: "list_suppliers", "create_supplier", "pay_supplier"

5. Module: "general"
   - Intents: "medicine_query", "greeting", "pharmacy_advice", "unknown"

STRICT RULES:
- Return ONLY valid JSON in the specified schema.
- Extract candidate entities and analytical filter parameters if mentioned:
  * "days": number (e.g., 7 for "past 7 days", 30 for "this month")
  * "sort_by": "total_amount" or "purchase_date"
  * "sort_order": "desc" or "asc"
  * "highest_only": boolean (true if user asks for "highest amount", "most expensive purchase", etc.)
  * "payment_status": "Paid", "Unpaid", or "Partial"
  * "supplier": string or null
  * "product_name": string or null

JSON SCHEMA:
{
  "module": "string",
  "intent": "string",
  "confidence": number,
  "entities": {
    "supplier": "string or null",
    "products": [
      {
        "name": "string",
        "quantity": number or null,
        "unit": "string or null",
        "pack_price": number or null
      }
    ],
    "invoice_no": "string or null",
    "payment_mode": "string or null",
    "payment_status": "string or null",
    "days": number or null,
    "sort_by": "string or null",
    "sort_order": "string or null",
    "highest_only": boolean or null,
    "query": "string or null"
  }
}`;

/**
 * Fallback keyword-based router if Gemini API fails or key missing
 */
function fallbackRoute(message) {
  const text = message.toLowerCase();

  if (
    text.includes("purchase") ||
    text.includes("buy") ||
    text.includes("supplier") ||
    text.includes("invoice")
  ) {
    if (text.includes("price") || text.includes("history") || text.includes("rate")) {
      return { module: "purchase", intent: "check_price_history", confidence: 0.8, entities: {} };
    }
    if (text.includes("list") || text.includes("view") || text.includes("show") || text.includes("past") || text.includes("most") || text.includes("highest")) {
      const days = text.includes("7 days") ? 7 : text.includes("30 days") || text.includes("month") ? 30 : null;
      const highest_only = text.includes("most") || text.includes("highest") || text.includes("expensive");
      return {
        module: "purchase",
        intent: "list_purchases",
        confidence: 0.85,
        entities: {
          days,
          sort_by: highest_only ? "total_amount" : "purchase_date",
          sort_order: "desc",
          highest_only,
        },
      };
    }
    if (text.includes("delete") || text.includes("remove")) {
      return { module: "purchase", intent: "delete_purchase", confidence: 0.8, entities: {} };
    }
    return { module: "purchase", intent: "create_purchase", confidence: 0.85, entities: {} };
  }

  if (text.includes("stock") || text.includes("inventory") || text.includes("expiry")) {
    return { module: "inventory", intent: "view_inventory", confidence: 0.75, entities: {} };
  }

  if (text.includes("bill") || text.includes("sale") || text.includes("patient")) {
    return { module: "billing", intent: "create_bill", confidence: 0.75, entities: {} };
  }

  return { module: "general", intent: "medicine_query", confidence: 0.7, entities: {} };
}

/**
 * AI Gateway Intent Router
 */
async function routeIntent(message, history = []) {
  try {
    const apiKey = process.env.EMERGENT_LLM_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return fallbackRoute(message);
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel(
      {
        model: "gemini-2.5-flash",
        systemInstruction: ROUTER_SYSTEM_INSTRUCTION,
      },
      { apiVersion: "v1beta" }
    );

    const prompt = `User Message: "${message}"\nRecent Context: ${JSON.stringify(
      history.slice(-4).map((h) => ({ role: h.role, text: typeof h.text === "string" ? h.text : JSON.stringify(h.text) }))
    )}`;

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.1,
      },
    });

    const text = result.response.text();
    const parsed = JSON.parse(text);

    return {
      module: parsed.module || "general",
      intent: parsed.intent || "medicine_query",
      confidence: parsed.confidence || 0.9,
      entities: parsed.entities || {},
    };
  } catch (error) {
    console.error("[Intent Router] Error in AI router, using fallback:", error.message);
    return fallbackRoute(message);
  }
}

module.exports = { routeIntent };
