const BaseAgent = require("./agentContract");
const {
  resolveSupplier,
  resolveMedicine,
  loadPurchaseSettings,
  checkPriceHistory,
} = require("./purchaseResolvers");

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

  async process({ db, message, history, userContext, draftState = null, intent, entities = {} }) {
    const userId = userContext.id;
    const pharmacyId = userContext.pharmacy_id;

    // Load user purchase settings
    const settings = await loadPurchaseSettings(db, userId);

    // Initialize or clone draft state
    let currentState = draftState ? { ...draftState } : this.initDraftState(settings);

    // If intent is check_price_history
    if (intent === "check_price_history") {
      return await this.handleCheckPriceHistory(db, pharmacyId, message, entities);
    }

    // If intent is list_purchases (including analytical queries like "past 7 days", "highest amount")
    if (intent === "list_purchases") {
      return await this.handleListPurchases(db, pharmacyId, message, entities);
    }

    // If intent is delete_purchase
    if (intent === "delete_purchase") {
      return this.handleDeletePurchase(entities);
    }

    // Default intent: create_purchase workflow state machine
    return await this.handleCreatePurchaseWorkflow(db, pharmacyId, message, entities, currentState, settings);
  }

  initDraftState(settings) {
    return {
      supplier_id: null,
      supplier_name: null,
      invoice_no: null,
      purchase_date: new Date().toISOString().slice(0, 10),
      items: [],
      payment_status: settings.payment_status || "Unpaid",
      amount_paid: 0,
      payment_mode: settings.default_payment_mode !== "none" ? settings.default_payment_mode : null,
      total_amount: 0,
      ready_to_create: false,
    };
  }

  async handleCreatePurchaseWorkflow(db, pharmacyId, message, entities, state, settings) {
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
          const packPrice = prod.pack_price || matchedMedicine.pack_price || 100;
          const unitsPerPack = matchedMedicine.units_per_pack || 10;
          const mrpPack = matchedMedicine.mrp_pack || Math.round(packPrice * 1.3);

          const existingIdx = state.items.findIndex(
            (i) => i.product_name.toLowerCase() === prod.name.toLowerCase()
          );

          const newItem = {
            product_name: matchedMedicine.product_name || prod.name,
            manufacturer: matchedMedicine.manufacturer || "",
            salt_composition: matchedMedicine.salt_composition || "",
            pack_quantity: packQty,
            units_per_pack: unitsPerPack,
            pack_price: packPrice,
            mrp_pack: mrpPack,
            batch_no: `BT-${Math.floor(100000 + Math.random() * 900000)}`,
            expiry_date: `${new Date().getFullYear() + 1}-12-31`,
            hsn_no: matchedMedicine.hsn_no || "3004",
            pack_type: matchedMedicine.pack_type || "Strip",
            cgst: 6,
            sgst: 6,
            discount: 0,
            scheme: 0,
            item_total: packQty * packPrice * 1.12,
          };

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

    // Calculate total amount
    state.total_amount = state.items.reduce((acc, item) => {
      const base = (item.pack_quantity || 1) * (item.pack_price || 0);
      const tax = base * (((item.cgst || 0) + (item.sgst || 0)) / 100);
      return acc + base + tax;
    }, 0);

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

    let content = "";

    if (missingFields.length > 0) {
      content = `I'm setting up your **Purchase Order**. Please provide the following missing details:\n\n`;
      missingFields.forEach((field) => {
        content += `- 📌 **${field}**\n`;
      });

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
    } else {
      state.ready_to_create = true;
      content = `✅ **Draft Purchase Ready!**\n\n- **Supplier**: ${state.supplier_name}\n- **Invoice No**: ${state.invoice_no || "N/A"}\n- **Items**: ${state.items.length} product(s)\n- **Total Amount**: **₹${state.total_amount.toFixed(2)}**\n\nClick **"Confirm Purchase"** below to record this purchase immediately.`;

      chips.push("Confirm Purchase", "Set Payment Status: Paid", "Set Payment Status: Unpaid", "Add another product");
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
      content = `⚡ **Recording Purchase for ₹${state.total_amount.toFixed(2)}...**`;
    }

    return this.buildResponse({
      content,
      intent: "create_purchase",
      draftState: state,
      action,
      chips,
    });
  }

  async handleListPurchases(db, pharmacyId, message, entities) {
    const query = { pharmacy_id: pharmacyId };

    // Handle date range (e.g. past 7 days, past 30 days)
    if (entities.days || message.toLowerCase().includes("7 days") || message.toLowerCase().includes("week")) {
      const numDays = entities.days || (message.toLowerCase().includes("7 days") ? 7 : 30);
      const sinceDate = new Date(Date.now() - numDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      query.purchase_date = { $gte: sinceDate };
    }

    // Handle payment status filter
    if (entities.payment_status || message.toLowerCase().includes("unpaid")) {
      query.payment_status = entities.payment_status || (message.toLowerCase().includes("unpaid") ? "Unpaid" : "Paid");
    }

    // Handle supplier filter
    if (entities.supplier) {
      query.supplier_name = { $regex: entities.supplier, $options: "i" };
    }

    // Handle sorting
    const sortField = entities.sort_by || (entities.highest_only || message.toLowerCase().includes("most") || message.toLowerCase().includes("highest") ? "total_amount" : "purchase_date");
    const sortOrder = entities.sort_order === "asc" ? 1 : -1;

    const limitVal = entities.highest_only ? 1 : 20;

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

    let textContent = "";
    if (purchases.length === 0) {
      textContent = "No purchase records matched your search query.";
    } else if (entities.highest_only || message.toLowerCase().includes("most") || message.toLowerCase().includes("highest")) {
      const topP = purchases[0];
      textContent = `🏆 **Highest Amount Purchase Record:**\n\n- **Supplier**: ${topP.supplier_name}\n- **Invoice**: ${topP.invoice_no || "N/A"}\n- **Date**: ${new Date(topP.purchase_date).toLocaleDateString()}\n- **Total Amount**: **₹${topP.total_amount.toFixed(2)}** (${topP.payment_status})`;
    } else {
      textContent = `Here are your purchase records matching your request (${purchases.length} total orders, Total spend: **₹${totalSpend.toFixed(2)}**):`;
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

    let content = `### 💰 Price History for **${productName}**\n\n`;

    if (!priceData || priceData.historical_prices.length === 0) {
      content += `No historical purchase records found for **${productName}**.`;
    } else {
      content += `| Date | Supplier | Pack Price | Invoice |\n|---|---|---|---|\n`;
      priceData.historical_prices.slice(0, 5).forEach((hp) => {
        const dateStr = new Date(hp.purchase_date).toLocaleDateString();
        content += `| ${dateStr} | ${hp.supplier_name} | ₹${hp.pack_price} | ${hp.invoice_no || "N/A"} |\n`;
      });

      if (priceData.cheapest_option) {
        content += `\n> 💡 **Cheapest Historical Price**: **₹${priceData.cheapest_option.pack_price}** from **${priceData.cheapest_option.supplier_name}**.`;
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
