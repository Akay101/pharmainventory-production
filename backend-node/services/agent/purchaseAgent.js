const BaseAgent = require("./agentContract");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const {
  resolveSupplier,
  resolveMedicine,
  loadPurchaseSettings,
  checkPriceHistory,
} = require("./purchaseResolvers");

function normalizeDate(d) {
  if (!d) return new Date().toISOString().slice(0, 10);
  const str = String(d).trim().toLowerCase();
  if (str === "today" || str === "aaj" || str === "now") {
    return new Date().toISOString().slice(0, 10);
  }
  if (str === "yesterday" || str === "kal") {
    const yest = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return yest.toISOString().slice(0, 10);
  }
  const parsed = new Date(d);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return new Date().toISOString().slice(0, 10);
}

class PurchaseAgent extends BaseAgent {
  constructor() {
    super({
      name: "PurchaseAgent",
      domain: "purchase",
      description: "Handles purchase creation, listing, price history, supplier integration, and analytical queries",
      intents: ["create_purchase", "list_purchases", "delete_purchase", "check_price_history"],
      tools: ["searchSupplier", "searchMedicine", "createPurchase", "checkPriceHistory", "listPurchases"],
    });
  }

  async synthesizeResponse({ message, history = [], dataSummary }) {
    try {
      const apiKey = process.env.EMERGENT_LLM_KEY || process.env.GEMINI_API_KEY;
      if (!apiKey) return null;

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        systemInstruction: `You are Pharmalogy's intelligent AI Operations Assistant.
Your task is to provide a natural, highly intelligent, conversational answer to the user's question based strictly on the provided database query results and conversation history.

STRICT LANGUAGE PERSISTENCE RULES:
1. DETECT USER LANGUAGE & SCRIPT:
   - If the user wrote in HINGLISH (Hindi written using English/Latin alphabets like "aaj ki kitni purchase ho gayi", "thik hai to fir dekhna sabse mehngi konsi hai"):
     * MUST RESPOND STRICTLY IN HINGLISH USING LATIN ALPHABETS ONLY!
     * DO NOT switch to English!
     * DO NOT mix Devanagari script characters (NEVER write "तारीख़", "आज", "खरीद" in Devanagari script inside Hinglish!). Write "date" or "tareekh" in Latin characters!
   - If the user wrote in Pure Devanagari Hindi (e.g. "आज की कुल खरीद कितनी है"):
     * MUST respond in pure Devanagari Hindi.
   - If the user wrote in English:
     * MUST respond in English.
2. CONTINUITY:
   - Maintain the user's preferred language across multi-turn questions unless the user explicitly switches language.

RESPONSE QUALITY & COMPLETENESS:
- Be direct, concise, and complete (1 to 3 sentences). NEVER leave sentences cut off or truncated.
- DO NOT use emojis.
- Reference exact numbers, dates (formatted cleanly like "1st September 2026"), suppliers, and medicine names directly from the data.
- If user asked if any other supplier was used (e.g. "om medicose ke alawa kisi aur se bhi liya aaj?"), analyze the data and answer directly e.g. "Nahi, aaj aapne Om Medicose ke alawa kisi aur supplier se purchase nahi ki hai. Aaj ki saari 3 purchases Om Medicose se hi hain."`,
      });

      const prompt = `User Message: "${message}"\nRecent Chat Context: ${JSON.stringify(
        history.slice(-4).map((h) => ({ role: h.role, text: typeof h.text === "string" ? h.text : JSON.stringify(h.text) }))
      )}\nDatabase Query Data: ${JSON.stringify(dataSummary)}`;

      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 1000 },
      });

      return result.response.text().trim();
    } catch (err) {
      console.error("[PurchaseAgent] Error synthesizing response:", err.message);
      return null;
    }
  }

  async process({ db, message, history, userContext, draftState = null, intent, entities = {} }) {
    const userId = userContext.id;
    const pharmacyId = userContext.pharmacy_id;

    // Load user purchase settings
    const settings = await loadPurchaseSettings(db, userId);

    // Initialize or clone draft state
    let currentState = draftState ? { ...draftState } : this.initDraftState(settings);

    // If intent is check_price_history
    if (intent === "check_price_history") {
      return await this.handleCheckPriceHistory(db, pharmacyId, message, history, entities);
    }

    // If intent is list_purchases (including analytical queries like "past 7 days", "highest amount")
    if (intent === "list_purchases") {
      return await this.handleListPurchases(db, pharmacyId, message, history, entities);
    }

    // If intent is delete_purchase
    if (intent === "delete_purchase") {
      return this.handleDeletePurchase(entities);
    }

    // Default intent: create_purchase workflow state machine
    return await this.handleCreatePurchaseWorkflow(db, pharmacyId, message, history, entities, currentState, settings);
  }

  initDraftState(settings) {
    return {
      supplier_id: null,
      supplier_name: null,
      invoice_no: null,
      purchase_date: normalizeDate(null),
      items: [],
      payment_status: settings.payment_status || "Unpaid",
      amount_paid: 0,
      payment_mode: settings.default_payment_mode !== "none" ? settings.default_payment_mode : null,
      total_amount: 0,
      ready_to_create: false,
    };
  }

  async handleCreatePurchaseWorkflow(db, pharmacyId, message, history = [], entities, state, settings) {
    const chips = [];

    // Duplicate guardrail: Block if draft was already recorded in DB
    if (state.recorded) {
      return this.buildResponse({
        content: "ℹ️ **This purchase order has already been recorded in your ledger.**\n\nIf you want to create a new purchase, please specify the new medicine and supplier details.",
        intent: "create_purchase",
        draftState: state,
        action: null,
        chips: ["Create new purchase", "Past 7 days purchases"],
      });
    }

    // 1. Resolve Supplier if entities provided or mentioned in message
    if (entities.supplier && !state.supplier_name) {
      const { matchedSupplier, suggestedSuppliers } = await resolveSupplier(db, pharmacyId, entities.supplier);
      if (matchedSupplier) {
        state.supplier_id = matchedSupplier.id;
        state.supplier_name = matchedSupplier.name;
      } else if (suggestedSuppliers.length > 0) {
        state.supplier_name = suggestedSuppliers[0].name;
        state.supplier_id = suggestedSuppliers[0].id;
      } else {
        state.supplier_name = entities.supplier;
      }
    }

    // 2. Resolve Products if provided
    if (entities.products && Array.isArray(entities.products) && entities.products.length > 0) {
      for (const prod of entities.products) {
        if (prod.name) {
          const { matchedMedicine } = await resolveMedicine(db, pharmacyId, prod.name);
          const packQty = prod.quantity || 1;
          const packPrice = prod.pack_price || prod.rate || prod.price || matchedMedicine.pack_price || 0;
          const unitsPerPack = prod.units_per_pack || matchedMedicine.units_per_pack || 10;
          const mrpPack = prod.mrp_pack || prod.mrp || matchedMedicine.mrp_pack || 0;
          const discount = prod.discount || 0;
          const cgst = prod.cgst !== undefined && prod.cgst !== null ? prod.cgst : (matchedMedicine.cgst || 0);
          const sgst = prod.sgst !== undefined && prod.sgst !== null ? prod.sgst : (matchedMedicine.sgst || 0);
          const batchNo = prod.batch_no || matchedMedicine.batch_no || `B-${Math.floor(100 + Math.random() * 900)}`;
          const expiryDate = prod.expiry_date || matchedMedicine.expiry_date || `${new Date().getFullYear() + 1}-12-31`;
          const packType = prod.pack_type || matchedMedicine.pack_type || "Strip";

          const baseTotal = packQty * packPrice;
          const discountedTotal = baseTotal * (1 - discount / 100);
          const itemTotal = discountedTotal * (1 + (cgst + sgst) / 100);

          const newItem = {
            product_name: matchedMedicine.product_name || prod.name,
            manufacturer: matchedMedicine.manufacturer || "",
            salt_composition: matchedMedicine.salt_composition || "",
            pack_quantity: packQty,
            units_per_pack: unitsPerPack,
            pack_price: packPrice,
            mrp_pack: mrpPack,
            batch_no: batchNo,
            expiry_date: expiryDate,
            hsn_no: matchedMedicine.hsn_no || "3004",
            pack_type: packType,
            cgst: cgst,
            sgst: sgst,
            discount: discount,
            free_quantity: prod.free_quantity || 0,
            item_total: itemTotal,
          };

          const existingIdx = state.items.findIndex(
            (i) => i.product_name.toLowerCase() === prod.name.toLowerCase()
          );

          if (existingIdx !== -1) {
            state.items[existingIdx] = newItem;
          } else {
            state.items.push(newItem);
          }
        }
      }
    }

    // 3. Extract invoice number or payment mode if present
    if (entities.invoice_no) state.invoice_no = entities.invoice_no;
    if (entities.payment_mode) state.payment_mode = entities.payment_mode;
    if (entities.payment_status) state.payment_status = entities.payment_status;
    if (entities.purchase_date) state.purchase_date = normalizeDate(entities.purchase_date);
    else state.purchase_date = normalizeDate(state.purchase_date);

    // Calculate total amount
    state.total_amount = state.items.reduce((acc, item) => acc + (item.item_total || 0), 0);

    if (state.payment_status === "Paid") {
      state.amount_paid = state.total_amount;
    }

    // 4. Validate missing mandatory fields and build prompt response
    const missingFields = [];

    if (!state.supplier_name) {
      missingFields.push("Supplier Name");
    }

    if (state.items.length === 0) {
      missingFields.push("Medicine Items");
    }

    if (
      settings.payment_mode_mandatory &&
      (state.payment_status === "Paid" || state.payment_status === "Partial") &&
      !state.payment_mode
    ) {
      missingFields.push("Payment Mode");
    }

    if (missingFields.length === 0) {
      state.ready_to_create = true;
    }

    const isUserConfirming =
      message.toLowerCase().includes("confirm") ||
      message.toLowerCase().includes("record") ||
      message.toLowerCase().includes("save purchase");

    let action = null;

    if (state.ready_to_create && isUserConfirming) {
      action = {
        intent: "create_purchase",
        data: {
          supplier_id: state.supplier_id,
          supplier_name: state.supplier_name,
          invoice_no: state.invoice_no,
          purchase_date: state.purchase_date,
          items: state.items,
          payment_status: state.payment_status,
          amount_paid: state.amount_paid,
          payment_mode: state.payment_mode,
        },
      };
    }

    const workflowSummary = {
      workflow: "create_purchase",
      missing_fields: missingFields,
      ready_to_create: state.ready_to_create,
      is_user_confirming: isUserConfirming,
      supplier_name: state.supplier_name,
      items_count: state.items.length,
      items: state.items.map((i) => i.product_name),
      total_amount: state.total_amount,
    };

    const aiWorkflowText = await this.synthesizeResponse({
      message,
      history,
      dataSummary: workflowSummary,
    });

    let content = "";
    if (aiWorkflowText) {
      content = aiWorkflowText;
    } else if (missingFields.length > 0) {
      content = `I'm setting up your **Purchase**. Please provide the missing details: ${missingFields.join(", ")}.`;
    } else {
      content = `**Draft Purchase Ready** for **₹${state.total_amount.toFixed(2)}**. Click Confirm Purchase below to save.`;
    }

    if (!state.supplier_name) {
      const topSuppliers = await db.collection("suppliers").find({ pharmacy_id: pharmacyId }).limit(3).toArray();
      topSuppliers.forEach((s) => chips.push(`Supplier: ${s.name}`));
      if (topSuppliers.length === 0) chips.push("Supplier: ABC Pharma");
    }

    if (state.items.length === 0) {
      chips.push("Add Dolo 650 mg 10 packs", "Add Paracetamol 500 mg 5 packs");
    }

    if (settings.payment_mode_mandatory && !state.payment_mode) {
      chips.push("Payment Mode: Cash", "Payment Mode: UPI", "Payment Mode: Card");
    }

    if (state.ready_to_create && !state.recorded) {
      chips.push("Confirm Purchase", "Set Payment Status: Paid", "Set Payment Status: Unpaid", "Add another product");
    }

    return this.buildResponse({
      content,
      intent: "create_purchase",
      draftState: state,
      action,
      chips,
    });
  }

  async handleListPurchases(db, pharmacyId, message, history = [], entities) {
    const query = { pharmacy_id: pharmacyId };
    const msgLower = message.toLowerCase();

    // Helper for date filter
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    if (entities.date_range === "today" || msgLower.includes("today") || msgLower.includes("aaj")) {
      query.purchase_date = { $gte: todayStr, $lte: todayStr };
    } else if (entities.date_range === "yesterday" || msgLower.includes("yesterday") || msgLower.includes("kal")) {
      const yest = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      query.purchase_date = { $gte: yest, $lte: yest };
    } else if (entities.date_range === "this_week" || msgLower.includes("this week") || msgLower.includes("is hafte") || msgLower.includes("week")) {
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      query.purchase_date = { $gte: weekAgo };
    } else if (entities.date_range === "this_month" || msgLower.includes("this month") || msgLower.includes("is mahine") || msgLower.includes("month")) {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      query.purchase_date = { $gte: startOfMonth };
    } else if (entities.days) {
      const sinceDate = new Date(Date.now() - entities.days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      query.purchase_date = { $gte: sinceDate };
    }

    // Payment status filter
    if (entities.payment_status || entities.filter_payment_status || msgLower.includes("unpaid") || msgLower.includes("baaki")) {
      query.payment_status = entities.payment_status || entities.filter_payment_status || (msgLower.includes("unpaid") || msgLower.includes("baaki") ? "Unpaid" : "Paid");
    }

    // Supplier & Negation Filter Handling ("ke alawa", "other than", "except")
    const isNegation = msgLower.includes("ke alawa") || msgLower.includes("other than") || msgLower.includes("except") || msgLower.includes("chhod kar");
    if (isNegation) {
      let excludedName = entities.supplier || entities.filter_supplier;
      if (!excludedName) {
        const match = message.match(/(.*?)(?:ke alawa|other than|except|chhod kar)/i);
        if (match && match[1]) {
          excludedName = match[1].replace(/thik|thike|aaj|mujhe|bhi|dikhao|dikhana|dikho|aur|se/gi, "").trim();
        }
      }
      if (excludedName) {
        query.supplier_name = { $not: new RegExp(excludedName.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&"), "i") };
      }
    } else {
      const supplierTerm = entities.supplier || entities.filter_supplier;
      if (supplierTerm) {
        query.supplier_name = { $regex: supplierTerm.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&"), $options: "i" };
      }
    }

    // Product search inside purchase items (e.g., "Calpol 650")
    const productSearchTerm = entities.filter_product || (entities.products && entities.products[0]?.name);
    if (productSearchTerm) {
      query["items.product_name"] = { $regex: productSearchTerm.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&"), $options: "i" };
    }

    // Sorting
    let sortField = "purchase_date";
    let sortOrder = -1;
    if (entities.sort_by === "total_amount" || entities.highest_only || msgLower.includes("most expensive") || msgLower.includes("highest") || msgLower.includes("mehenga")) {
      sortField = "total_amount";
      sortOrder = -1;
    } else if (entities.sort_order === "asc" || msgLower.includes("cheapest") || msgLower.includes("sasta")) {
      sortField = "total_amount";
      sortOrder = 1;
    }

    const limitVal = entities.highest_only ? 1 : 50;

    const purchases = await db
      .collection("purchases")
      .find(query, { projection: { _id: 0 } })
      .sort({ [sortField]: sortOrder })
      .limit(limitVal)
      .toArray();

    // Compute summary metrics
    const totalSpend = purchases.reduce((sum, p) => sum + (p.total_amount || 0), 0);
    const paidCount = purchases.filter((p) => p.payment_status === "Paid").length;
    const unpaidCount = purchases.filter((p) => p.payment_status === "Unpaid").length;
    const uniqueSuppliers = [...new Set(purchases.map((p) => p.supplier_name).filter(Boolean))];

    const dataSummary = {
      total_records_found: purchases.length,
      date_filter_applied: query.purchase_date || "all",
      total_spend: totalSpend,
      unique_suppliers: uniqueSuppliers,
      purchases_preview: purchases.slice(0, 10).map((p) => ({
        supplier_name: p.supplier_name,
        invoice_no: p.invoice_no,
        purchase_date: p.purchase_date,
        total_amount: p.total_amount,
        payment_status: p.payment_status,
        items: (p.items || []).map((i) => i.product_name),
      })),
    };

    const aiSynthesizedText = await this.synthesizeResponse({ message, dataSummary });

    let textContent = "";
    if (aiSynthesizedText) {
      textContent = aiSynthesizedText;
    } else if (purchases.length === 0) {
      textContent = "No purchase records matched your search query.";
    } else if (entities.highest_only || msgLower.includes("most expensive") || msgLower.includes("highest")) {
      const topP = purchases[0];
      textContent = `**Highest Amount Purchase Record:**\n\n- **Supplier**: ${topP.supplier_name}\n- **Invoice**: ${topP.invoice_no || "N/A"}\n- **Date**: ${new Date(topP.purchase_date).toLocaleDateString()}\n- **Total Amount**: **₹${topP.total_amount.toFixed(2)}** (${topP.payment_status})`;
    } else {
      textContent = `Found **${purchases.length}** purchase record(s) matching your request (Total spend: **₹${totalSpend.toFixed(2)}**):`;
    }

    return {
      module: "purchase",
      intent: "list_purchases",
      content: textContent,
      viewType: "purchase_table",
      purchasesData: {
        purchases,
        summary: {
          total_spend: totalSpend,
          total_orders: purchases.length,
          paid_count: paidCount,
          unpaid_count: unpaidCount,
        },
      },
      action: null,
      chips: ["Past 7 days purchases", "Highest amount purchase", "Unpaid purchases", "Create new purchase"],
      confidence: 1.0,
    };
  }

  async handleCheckPriceHistory(db, pharmacyId, message, entities) {
    const productName = entities.query || entities.products?.[0]?.name || message.replace(/check price history for|price history|price|for/gi, "").trim();

    if (!productName) {
      return this.buildResponse({
        content: "Please specify the medicine name to check price history. (e.g., *'Check price history for Dolo 650'*).",
        intent: "check_price_history",
        chips: ["Check price history for Dolo 650", "Check price history for Crocin"],
      });
    }

    const priceData = await checkPriceHistory(db, pharmacyId, productName);

    let content = `### Price History for **${productName}**\n\n`;

    if (!priceData || priceData.historical_prices.length === 0) {
      content += `No historical purchase records found for **${productName}**.`;
    } else {
      content += `| Date | Supplier | Pack Price | Invoice |\n|---|---|---|---|\n`;
      priceData.historical_prices.slice(0, 5).forEach((hp) => {
        const dateStr = new Date(hp.purchase_date).toLocaleDateString();
        content += `| ${dateStr} | ${hp.supplier_name} | ₹${hp.pack_price} | ${hp.invoice_no || "N/A"} |\n`;
      });

      if (priceData.cheapest_option) {
        content += `\n> **Cheapest Historical Price**: **₹${priceData.cheapest_option.pack_price}** from **${priceData.cheapest_option.supplier_name}**.`;
      }
    }

    return this.buildResponse({
      content,
      intent: "check_price_history",
      action: {
        intent: "check_price_history",
        data: { product_name: productName },
      },
      chips: [`Create purchase for ${productName}`],
    });
  }

  handleDeletePurchase(entities) {
    return this.buildResponse({
      content: entities.purchase_id
        ? `Are you sure you want to delete purchase record **${entities.purchase_id}**?`
        : "Please specify the Purchase ID to delete.",
      intent: "delete_purchase",
      action: entities.purchase_id
        ? {
            intent: "delete_purchase",
            data: { purchase_id: entities.purchase_id },
          }
        : null,
      chips: [],
    });
  }
}

module.exports = new PurchaseAgent();
