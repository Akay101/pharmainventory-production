const { GoogleGenerativeAI } = require("@google/generative-ai");

const ROUTER_SYSTEM_INSTRUCTION = `You are the AI Gateway & Intent Router for a Pharmacy Management System.
Your job is to analyze the user's natural language input (English, Hindi, Hinglish) and classify it into a specific module and intent with rich entity extraction.

Available Modules & Intents:
1. Module: "purchase"
   - Intents:
     * "create_purchase": User wants to record/create a purchase, add stock from supplier, or log a purchase invoice.
     * "list_purchases": User wants to list, view, search, analyze, calculate metrics, or query purchase records (e.g., "most expensive purchase", "unpaid purchases", "purchases of Calpol 650", "supplier discount summary", "average price of Dolo").
     * "delete_purchase": User wants to delete or cancel a purchase record.
     * "check_price_history": User wants to compare or check historical purchase rates for a specific medicine.

2. Module: "inventory"
   - Intents: "view_inventory", "adjust_stock", "check_expiry", "merge_batches"

3. Module: "billing"
   - Intents: "create_bill", "list_bills", "delete_bill"

4. Module: "suppliers"
   - Intents: "list_suppliers", "create_supplier", "pay_supplier"

5. Module: "general"
   - Intents: "medicine_query", "greeting", "pharmacy_advice", "unknown"

EXTRACTION RULES:
- Extract all natural language parameters into structured JSON.
- Parse Hinglish / Hindi terms:
  * "li", "khareeda", "le ke aaya", "purchase kiya" -> create_purchase
  * "patta", "strip" -> pack_type: "Strip", quantity: 1 (unless number specified e.g. "5 patta" -> quantity: 5)
  * "10 tab ka", "10 tablets" -> units_per_pack: 10
  * "40 rupe ka", "rate 40", "cost 40" -> pack_price: 40
  * "mrp 80 rupe", "mrp 80" -> mrp_pack: 80
  * "10% discount pe", "10% off" -> discount: 10
  * "batch hai B8997", "batch B8997" -> batch_no: "B8997"
  * "aaj" -> today, "kal" -> yesterday, "is hafte" -> this_week, "is mahine" -> this_month
  * "sabse mehenga", "highest amount", "maximum spend" -> highest_only / sort_by total_amount desc
  * "unpaid", "baaki", "udhaar", "dues" -> payment_status: "Unpaid"

JSON SCHEMA:
{
  "module": "string",
  "intent": "string",
  "confidence": number,
  "entities": {
    "supplier": "string or null",
    "invoice_no": "string or null",
    "purchase_date": "string or null",
    "payment_status": "Paid | Unpaid | Partial | null",
    "payment_mode": "Cash | UPI | Card | Net Banking | Credit | null",
    "amount_paid": "number or null",
    "products": [
      {
        "name": "string",
        "batch_no": "string or null",
        "expiry_date": "string or null",
        "quantity": "number or null",
        "pack_type": "Strip | Box | Bottle | Vial | Tablet | Pack | null",
        "units_per_pack": "number or null",
        "pack_price": "number or null",
        "mrp_pack": "number or null",
        "discount": "number or null",
        "cgst": "number or null",
        "sgst": "number or null",
        "free_quantity": "number or null"
      }
    ],
    "query_type": "list | highest_amount | cheapest_amount | product_purchases | supplier_summary | average_price | max_discount | unpaid_dues | custom_query | null",
    "date_range": "today | yesterday | this_week | this_month | last_30_days | all_time | null",
    "days": "number or null",
    "filter_product": "string or null",
    "filter_supplier": "string or null",
    "filter_payment_status": "string or null",
    "sort_by": "total_amount | purchase_date | discount | pack_price | null",
    "sort_order": "desc | asc | null",
    "highest_only": "boolean or null",
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
