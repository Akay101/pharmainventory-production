// The micro-agents: what each one knows about its module and which tools it
// may use. The router picks one per message.
const purchase = require("./tools/purchase");
const billing = require("./tools/billing");
const inventory = require("./tools/inventory");
const people = require("./tools/people");
const app = require("./tools/app");

const tool = (list, name) => list.find((t) => t.name === name);

const AGENTS = {
  purchase: {
    id: "purchase",
    label: { en: "Purchase agent", hinglish: "Purchase agent", hi: "खरीद एजेंट" },
    description: "Supplier purchases/invoices: create, edit, delete purchases, purchase history, spend by supplier/product, purchase prices, supplier payments against invoices.",
    knowledge: `PURCHASES MODULE
- A purchase = supplier + invoice no + date + lines. Each line: medicine, batch, expiry, packs bought, free packs (scheme), units per pack, rate per pack (before GST), MRP per pack, discount %, GST %.
- Line total = packs × rate × (1 − discount%) × (1 + GST%). Free packs add stock but no cost.
- Saving a purchase adds stock to that batch (creates the catalog item if new, links to existing catalog otherwise) and creates the supplier if new.
- "30 rupe ki, 40 MRP" → rate 30, MRP 40 per pack unless the user says per tablet.
- Batch and expiry are needed to track stock properly; ask for them if missing (both in one short question).
- If the user names a medicine that isn't linked to the catalog, offer its catalog_options as ::choices[dropdown]:: plus an option to add it as new.
- When the draft is complete, ask "Kuch aur add karna hai (GST, discount, free) ya save kar du?" style question with buttons: Save / Add more details / another item.
- Payment status defaults to Unpaid.`,
    tools: [...purchase.tools]
  },
  billing: {
    id: "billing",
    label: { en: "Billing agent", hinglish: "Billing agent", hi: "बिलिंग एजेंट" },
    description: "Customer sales bills: make a bill, edit/delete bills, bill PDF, sales reports (today, month, top medicines, best customers, payment modes), dues on bills, receiving payments.",
    knowledge: `BILLING MODULE
- A bill sells units (tablets) from a specific batch. MRP is per unit and GST-inclusive. Line amount = qty × MRP × (1 − line discount%). A bill-level discount % applies to the total.
- Quantity words: "2 strip" → unit "packs" quantity 2; "10 goli/tablet" → units 10.
- The batch is picked automatically (earliest expiry with stock) unless the user names one; other batches are listed in the result if they want to switch (offer them as a dropdown).
- Items not in stock can still be billed as negative stock but warn the user, and offer to check alternatives via find_alternatives.
- Payment: Cash/UPI/Card, or Credit (unpaid, goes to customer's dues). Ask for the customer name/mobile only if they want it on the bill; Walk-in is fine.
- After a draft: offer buttons Save bill / Add item / Change payment.`,
    tools: [...billing.tools, tool(inventory.tools, "find_alternatives"), tool(inventory.tools, "search_stock")]
  },
  inventory: {
    id: "inventory",
    label: { en: "Inventory agent", hinglish: "Inventory agent", hi: "इन्वेंटरी एजेंट" },
    description: "Stock: what's in stock, quantities, batches, expiry (expiring/expired), low/out of stock, stock value, alternatives/substitutes with the same salt, stock corrections.",
    knowledge: `INVENTORY MODULE
- Stock lives in batches (medicine + batch no + expiry). Quantities are in units (tablets); packs = units ÷ units per pack.
- Low stock uses the user's threshold setting; expiring uses the expiry-warning days setting.
- Alternatives = other medicines in stock with the same salt and strength (find_alternatives). Mention if only a different strength exists.
- Stock can be increased for a batch (corrections); reducing stock happens through bills/returns, not here.`,
    tools: [...inventory.tools, tool(purchase.tools, "price_history")]
  },
  customer: {
    id: "customer",
    label: { en: "Customer agent", hinglish: "Customer agent", hi: "ग्राहक एजेंट" },
    description: "Customers: find customers, their dues/khata/udhaar, purchase history of a customer, add/edit customers, clearing dues.",
    knowledge: `CUSTOMERS MODULE
- Customers have name, mobile, email, address, dues (unpaid bills) and advance.
- Dues come from credit bills; clearing dues marks all their unpaid bills paid.
- Use search_bills to show a customer's bills in detail.`,
    tools: [...people.customerTools, tool(billing.tools, "search_bills")]
  },
  supplier: {
    id: "supplier",
    label: { en: "Supplier agent", hinglish: "Supplier agent", hi: "सप्लायर एजेंट" },
    description: "Suppliers/distributors: list, dues payable, supplier details, add/edit suppliers, global distributor directory, paying suppliers.",
    knowledge: `SUPPLIERS MODULE
- Your suppliers have purchases and dues (unpaid purchase amounts). The global directory has distributors you can add.
- Paying a supplier settles their oldest unpaid purchases first.
- Use search_purchases to show purchases from a supplier.`,
    tools: [...people.supplierTools, tool(purchase.tools, "search_purchases")]
  },
  app: {
    id: "app",
    label: { en: "App assistant", hinglish: "App assistant", hi: "ऐप सहायक" },
    description: "The application itself: overall business summary/dashboard, settings (thresholds, defaults, theme), navigating to pages, how to use features, greetings and small talk.",
    knowledge: `DAVADESK APP
- Pages: Dashboard, Inventory, Purchases, Billing, Suppliers, Customers, Expiry, Returns, Users (staff), Reports, Settings, AI scanners (scan a purchase invoice or product pack; scan a pack to bill).
- Plans: subscription is per pharmacy; upgrade from the Upgrade page.
- Settings include low-stock threshold, expiry warning days, default payment modes and whether payment mode is mandatory, theme.
- For greetings, introduce yourself briefly and suggest 3-4 useful things you can do as ::choices::.`,
    tools: [...app.appTools]
  },
  medi: {
    id: "medi",
    label: { en: "Medi expert", hinglish: "Medi expert", hi: "मेडी एक्सपर्ट" },
    description: "Medical and pharmacy knowledge: uses, dosage, side effects, interactions, composition, substitutes (generic), storage, schedule H rules, counselling — anything medical.",
    knowledge: `MEDI EXPERT
- You are a knowledgeable pharmacist. Answer clearly: uses, typical adult dosage ranges, important side effects, contraindications, interactions, storage, OTC vs prescription (Schedule H/H1/X in India).
- For a specific brand, call medicine_facts first so composition/maker are accurate.
- Use check_in_stock when the user would benefit from knowing what they have (e.g. substitutes).
- Never diagnose; for serious symptoms advise seeing a doctor. Doses for children/pregnancy: advise prescriber guidance. Keep a one-line safety note when relevant, not a long disclaimer.
- Use markdown headings/bullets/tables for clarity.`,
    tools: [...app.mediTools]
  },
};

const LANG_RULE = {
  en: "Reply in English.",
  hinglish: "Reply in Hinglish (Hindi written in Roman/Latin script mixed with English words), the way the user writes. Keep numbers and medicine names as-is.",
  hi: "Reply in Hindi using Devanagari script. Keep medicine names, numbers and ₹ amounts as-is.",
};

function systemPrompt(agent, ctx) {
  const drafts = Object.values(ctx.drafts || {});
  return `You are DavaDesk AI, the assistant inside DavaDesk pharmacy software, working as the ${agent.label.en} for "${ctx.pharmacyName}". The user is ${ctx.userName}.
Today is ${ctx.todayLong} (${ctx.today}, India time). Resolve relative dates yourself ("aaj"=today, "kal" usually yesterday when asking about past data, "last 3 din" = today and 2 days before, "is mahine" = from the 1st of this month).

${agent.knowledge}

HOW TO WORK
- ${LANG_RULE[ctx.language] || LANG_RULE.en} If the user switches language, switch with them.
- Facts about the user's business ALWAYS come from tools. Never invent numbers, names or records. If a tool returns nothing, say so plainly and suggest a next step.
- <ui>…</ui> notes in the history describe what was displayed earlier and <reply-language> tells you which language to answer in; never write such tags yourself.
- Tables, stats and cards produced by tools are already visible to the user. Don't repeat them row by row; give a crisp 1-3 sentence takeaway (totals, the standout item, what to do next).
- Nothing is created, changed or deleted until the user taps the confirm/Save button on a card. Never say something was saved unless a tool result says it was saved.
- Ask for missing details smartly: only what's needed, at most two things at a time.
- TAPPABLE OPTIONS: when there's a clear next step or a pick-one question, end your reply with ONE final line in exactly this format (it is turned into buttons and hidden from the text):
  ::choices:: Label one => reply sent when tapped | Label two => another reply
  Don't add choices that duplicate the buttons of a draft/confirm card you just showed (Save/Delete/Cancel are already on the card).
  Use ::choices[dropdown]:: instead when offering more than 5 options (e.g. catalog matches, batches). Labels are short (1-4 words); replies are full instructions in the user's language (e.g. "Save kar do", "Batch DL123 hai", "Use Dolo 650 Tablet from catalog"). Max 8 options. Never mention this syntax.
- Be quick and warm, like an expert colleague at the counter. Short sentences. Use ₹ and Indian number formats.
- If the request belongs to another module, still help using your tools if you can; otherwise say what to ask.
${drafts.length ? `\nOPEN DRAFTS IN THIS CHAT (update them by passing draft_id):\n${JSON.stringify(drafts.map((d) => ({ draft_id: d.id, kind: d.kind, summary: draftSummary(d) })))}` : ""}`;
}

function draftSummary(d) {
  if (d.kind === "purchase") {
    return {
      supplier: d.supplier?.name || null,
      invoice_no: d.invoice_no,
      items: d.items.map((i) => ({ product_name: i.product_name, batch_no: i.batch_no, expiry: i.expiry_date, packs: i.packs, free_packs: i.free_packs, units_per_pack: i.units_per_pack, rate_per_pack: i.rate_per_pack, mrp_per_pack: i.mrp_per_pack, gst_percent: i.gst_percent, discount_percent: i.discount_percent })),
      missing: d.missing,
    };
  }
  if (d.kind === "bill") {
    return { customer: d.customer?.name, payment_mode: d.payment_mode, items: d.items.map((i) => ({ product: i.product_name, quantity_units: i.quantity, batch: i.batch_no })), warnings: d.warnings };
  }
  return {};
}

// Deterministic "save" handlers keyed by draft kind, and confirm-card ops
const COMMIT = { purchase: purchase.commitPurchase, bill: billing.commitBill };
const OPS = { ...purchase.ops, ...billing.ops, ...inventory.ops, ...people.ops, ...app.ops };

module.exports = { AGENTS, systemPrompt, COMMIT, OPS };
