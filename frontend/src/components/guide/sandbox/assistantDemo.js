import { insertPurchase, iso, round2 } from "./demoData";

// The AI assistant in demo mode: scripted replies built from the demo
// pharmacy, streamed with the same events the real assistant sends (meta,
// route, status, block, delta, done). No AI is called and no credits are used.

const inr = (n) => `₹${(Number(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const today = () => iso(new Date());

const AGENTS = {
  billing: "Billing agent",
  purchase: "Purchase agent",
  inventory: "Inventory agent",
  customer: "Customer agent",
  supplier: "Supplier agent",
  medi: "Medi expert",
  app: "App assistant",
};

function chatFor(store, body) {
  store.chats = store.chats || [];
  let chat = body.conversation_id && store.chats.find((c) => c.id === body.conversation_id);
  if (!chat) {
    chat = { id: `demo-chat-${Date.now()}`, title: "", pinned: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), messages: [] };
    store.chats.unshift(chat);
  }
  return chat;
}

// Today's sales from the demo bills
function sales(store) {
  const bills = store.bills.filter((b) => b.billing_date === today());
  const total = round2(bills.reduce((s, b) => s + b.grand_total, 0));
  const profit = round2(bills.reduce((s, b) => s + b.profit, 0));
  const due = round2(bills.reduce((s, b) => s + (b.remaining_amount || 0), 0));
  return {
    title: "Aaj ki sale",
    agent: "billing",
    loader: "Aaj ke bills dekh raha hoon…",
    status: "Billing data se aaj ke bills nikal raha hoon",
    blocks: [
      {
        type: "stats",
        title: "Aaj, " + new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
        items: [
          { label: "Sale", value: inr(total) },
          { label: "Bills", value: String(bills.length) },
          { label: "Profit", value: inr(profit), hint: total ? `${Math.round((profit / total) * 100)}% margin` : undefined },
          { label: "Udhar", value: inr(due) },
        ],
      },
      {
        type: "table",
        title: "Aaj ke bills",
        open: "/billing",
        columns: [
          { key: "bill_no", label: "Bill" },
          { key: "customer", label: "Customer" },
          { key: "amount", label: "Amount", align: "right", format: "inr" },
          { key: "status", label: "Status", format: "badge" },
        ],
        rows: bills.map((b) => ({ id: b.id, bill_no: b.bill_no, customer: b.customer_name, amount: b.grand_total, status: b.is_paid ? "Paid" : "Unpaid" })),
        chart: { x: "customer", y: "amount" },
      },
      {
        type: "choices",
        options: [
          { label: "Is hafte ki sale", reply: "Is hafte ki sale dikhao" },
          { label: "Kin customers ka udhaar baaki hai?", reply: "Kin customers ka udhaar baaki hai?" },
        ],
      },
    ],
    text: `Aaj ${bills.length} bills bane, kul sale ${inr(total)} aur profit ${inr(profit)}. Sabse bada bill ${bills[0]?.customer_name || "—"} ka hai.`,
  };
}

function dues(store) {
  const rows = store.customers.filter((c) => (c.total_debt || 0) > 0).sort((a, b) => b.total_debt - a.total_debt);
  const total = round2(rows.reduce((s, c) => s + c.total_debt, 0));
  return {
    title: "Customer udhaar",
    agent: "customer",
    loader: "Customers ka hisaab dekh raha hoon…",
    status: "Udhaar wale customers dhoondh raha hoon",
    blocks: [
      {
        type: "table",
        title: "Udhaar baaki",
        open: "/customers",
        columns: [
          { key: "name", label: "Customer" },
          { key: "mobile", label: "Mobile" },
          { key: "due", label: "Baaki", align: "right", format: "inr" },
        ],
        rows: rows.map((c) => ({ id: c.id, name: c.name, mobile: c.mobile, due: c.total_debt })),
        footer: `Kul ${inr(total)}`,
      },
    ],
    text: `${rows.length} customers ka kul ${inr(total)} udhaar baaki hai. Customer page se unhe WhatsApp par yaad dila sakte hain.`,
  };
}

function expiry(store) {
  const soon = [...store.inventory].filter((i) => i.expiry_date).sort((a, b) => a.expiry_date.localeCompare(b.expiry_date)).slice(0, 5);
  return {
    title: "Jaldi expire hone wali dawaiyan",
    agent: "inventory",
    loader: "Stock ki expiry dekh raha hoon…",
    status: "Sabse paas wali expiry ke batches nikal raha hoon",
    blocks: [
      {
        type: "table",
        title: "Sabse pehle expire hone wale batches",
        open: "/expiry",
        columns: [
          { key: "name", label: "Dawa" },
          { key: "batch", label: "Batch" },
          { key: "expiry", label: "Expiry" },
          { key: "units", label: "Stock", align: "right" },
        ],
        rows: soon.map((i) => ({ id: i.id, name: i.product_name, batch: i.batch_no, expiry: i.expiry_date.slice(0, 7), units: i.available_quantity })),
      },
    ],
    text: `${soon[0]?.product_name} ka batch ${soon[0]?.batch_no} sabse pehle expire hoga. Billing mein Near Expiry on karke ise pehle bechiye, ya Returns se supplier ko wapas kijiye.`,
  };
}

function medi() {
  return {
    title: "Azithromycin: kab nahi leni chahiye",
    agent: "medi",
    loader: "Dawa ki jaankari dekh raha hoon…",
    status: "Medicine reference dekh raha hoon",
    blocks: [{ type: "notice", tone: "info", text: "Yeh general jaankari hai. Patient ke liye doctor ki salah zaroori hai." }],
    text:
      "Azithromycin in haalaton mein nahi deni chahiye, ya bahut dhyaan se:\n" +
      "• Azithromycin ya kisi macrolide (jaise erythromycin) se allergy ho\n" +
      "• Pehle azithromycin lene par jaundice ya liver ki problem hui ho\n" +
      "• Dil ki dhadkan ki problem ho (QT prolongation), ya aisi dawa chal rahi ho jo QT badhati ho\n" +
      "• Antacid saath mein lena ho to dono ke beech kuch ghante ka gap rakhein\n" +
      "Course poora karna zaroori hai, beech mein na chhodein.",
  };
}

function purchaseDraft(store, chat) {
  const supplier = store.suppliers[0];
  const draft_id = `demo-draft-${Date.now()}`;
  chat.draft = { draft_id, supplier };
  const total = round2(10 * 21.3 * 1.12);
  return {
    title: "Dolo 650 ki purchase",
    agent: "purchase",
    loader: "Purchase ki details samajh raha hoon…",
    status: "Dolo 650 aapke stock aur supplier list se mila raha hoon",
    blocks: [
      {
        type: "draft",
        kind: "purchase",
        draft_id,
        title: `Purchase draft · ${supplier.name}`,
        fields: [
          { label: "Supplier", value: supplier.name },
          { label: "Invoice", value: "Not given", missing: true },
          { label: "Date", value: new Date().toLocaleDateString("en-IN") },
          { label: "Payment", value: "Unpaid" },
        ],
        columns: [
          { key: "name", label: "Product" },
          { key: "batch", label: "Batch" },
          { key: "expiry", label: "Expiry" },
          { key: "qty", label: "Qty", align: "right" },
          { key: "rate", label: "Rate", align: "right", format: "inr" },
          { key: "mrp", label: "MRP", align: "right", format: "inr" },
          { key: "amount", label: "Amount", align: "right", format: "inr" },
        ],
        rows: [{ name: "Dolo 650 Tablet", batch: "DL25110", expiry: "09/28", qty: "10 strips", rate: 21.3, mrp: 31.95, amount: total }],
        missing: ["Invoice number not given (optional)"],
        totals: [{ label: "Total", value: total }],
        actions: [
          { label: "Save purchase", style: "primary", action: { type: "commit", draft_id } },
          { label: "Save as draft", style: "secondary", action: { type: "save_draft", draft_id } },
          { label: "Discard", action: { type: "discard", draft_id } },
        ],
      },
    ],
    text: "Yeh draft bana diya: Shree Ganesh Pharma se Dolo 650 ki 10 strips, batch DL25110, expiry 09/28, rate ₹21.30. Theek lage to Save purchase dabaiye, ya mujhe likh kar badal dijiye, jaise \"qty 12 kar do\".",
  };
}

function commit(store, chat, action) {
  const supplier = chat.draft?.supplier || store.suppliers[0];
  if (action.type === "discard") return { agent: "purchase", blocks: [{ type: "result", tone: "info", title: "Draft discarded", text: "Kuch save nahi hua." }], text: "Theek hai, draft hata diya." };
  if (action.type === "save_draft") {
    return { agent: "purchase", blocks: [{ type: "result", tone: "info", title: "Saved as draft", text: "Purchases → Drafts mein milega. Stock abhi nahi juda.", closes_draft: action.draft_id }], text: "Draft save ho gaya." };
  }
  const inv = store.inventory.find((i) => i.product_name === "Dolo 650 Tablet");
  insertPurchase(store, {
    supplier_id: supplier.id,
    supplier_name: supplier.name,
    purchase_date: today(),
    payment_status: "Unpaid",
    items: [{ product_id: inv?.product_id, product_name: "Dolo 650 Tablet", batch_no: "DL25110", expiry_date: "2028-09-30", manufacturer: inv?.manufacturer, salt_composition: inv?.salt_composition, pack_quantity: 10, units_per_pack: 15, pack_price: 21.3, mrp: 31.95, cgst: 6, sgst: 6 }],
  });
  return {
    agent: "purchase",
    blocks: [
      {
        type: "result",
        tone: "success",
        title: "Purchase saved",
        text: "Dolo 650 ki 150 tablets (batch DL25110) stock mein jud gayi.",
        actions: [{ label: "Open", action: { type: "navigate", to: "/purchases" } }],
      },
    ],
    text: "Ho gaya! Purchase save hai aur stock update ho gaya. Shree Ganesh Pharma ke khaate mein ₹238.56 baaki dikhega.",
  };
}

function fallback() {
  return {
    agent: "app",
    loader: "Soch raha hoon…",
    blocks: [],
    text: "Demo mein main bills, purchases, stock, expiry, udhaar aur dawaiyon ke sawaal dikha sakta hoon. Asli app mein aap kuch bhi pooch sakte hain, Hindi, English ya Hinglish mein.",
  };
}

function plan(store, body) {
  const chat = chatFor(store, body);
  let r;
  if (body.action) r = commit(store, chat, body.action);
  else {
    const m = String(body.message || "").toLowerCase();
    if (/purchase|kharid|ख़रीद|chadha/.test(m)) r = purchaseDraft(store, chat);
    else if (/udhaar|udhar|baaki|dues/.test(m)) r = dues(store);
    else if (/expir/.test(m)) r = expiry(store);
    else if (/azithro|kab nahi|side effect/.test(m)) r = medi();
    else if (/sale|बिक्री/.test(m)) r = sales(store);
    else r = fallback();
  }
  if (!chat.title) chat.title = r.title || "Demo chat";
  chat.updated_at = new Date().toISOString();
  return { chat, r };
}

// The events of one turn, with the pauses between them (ms)
export function demoTurn(store, body) {
  const { chat, r } = plan(store, body);
  const ev = [];
  ev.push(["meta", { conversation_id: chat.id, title: chat.title }, 120]);
  ev.push(["route", { agent: r.agent, label: AGENTS[r.agent], loader: r.loader || "Kaam par laga hoon…" }, 500]);
  if (r.status) ev.push(["status", { text: r.status }, 900]);
  (r.blocks || []).filter((b) => b.type !== "choices").forEach((b) => ev.push(["block", { block: b }, 700]));
  const words = String(r.text || "").split(/(\s+)/);
  for (let i = 0; i < words.length; i += 6) ev.push(["delta", { text: words.slice(i, i + 6).join("") }, 70]);
  const msgId = `demo-msg-${Date.now()}`;
  const userMsg = { id: `demo-u-${Date.now()}`, role: "user", text: body.message || body.label || "" };
  const asstMsg = { id: msgId, role: "assistant", agent: r.agent, agentLabel: AGENTS[r.agent], text: r.text, blocks: r.blocks || [], language: "hi" };
  chat.messages.push(userMsg, asstMsg);
  ev.push(["done", { message: asstMsg, mode: "full" }, 200]);
  return ev;
}

// A streamed Response carrying those events as server-sent events
export function demoTurnResponse(store, body) {
  const events = demoTurn(store, body);
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      for (const [name, data, wait] of events) {
        await new Promise((r) => setTimeout(r, wait));
        controller.enqueue(enc.encode(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`));
      }
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { "content-type": "text/event-stream" } });
}

// GET /assistant/conversations and /assistant/conversations/:id
export function demoConversations(store, id) {
  const chats = store.chats || [];
  if (id) {
    const c = chats.find((x) => x.id === id);
    return c ? { conversation: { id: c.id, title: c.title }, messages: c.messages, open_drafts: [] } : null;
  }
  return { conversations: chats.map(({ messages, draft, ...c }) => c), retention_days: 30 };
}
