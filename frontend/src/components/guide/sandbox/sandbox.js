import axios from "axios";
import { createDemoStore, insertBill, round2 } from "./demoData";

// Demo-data mode for guided tours.
//
// While a tour runs, every axios request goes through this adapter:
//   - module data the tour shows (bills, stock search, customers, doctors…)
//     is answered from an in-memory demo pharmacy;
//   - any other read passes through to the server (menus, settings, plan);
//   - session calls (/auth/…) pass through;
//   - any other write is swallowed and answered with a harmless success.
// So nothing a tour types, saves or deletes can reach real data. Browser
// storage writes go to a throwaway overlay, and window.open / print /
// non-GET fetches are stubbed for the same reason.

let active = null; // { store, restore: [] }
const listeners = new Set();
export const onSandboxEvent = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const emit = (type, detail) => listeners.forEach((fn) => fn({ type, detail }));

export const sandboxActive = () => !!active;
export const demoStore = () => active?.store || null;

const GUIDE_KEY_PREFIX = "dd_guide_";

function parse(config) {
  const base = config.baseURL && !/^https?:/i.test(config.url || "") ? config.baseURL.replace(/\/$/, "") + "/" : undefined;
  const u = new URL(config.url || "", base || window.location.origin);
  const query = Object.fromEntries(u.searchParams.entries());
  Object.entries(config.params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null) query[k] = String(v);
  });
  const i = u.pathname.indexOf("/api/");
  const path = i >= 0 ? u.pathname.slice(i + 4) : u.pathname;
  let body = config.data;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {}
  }
  return { method: (config.method || "get").toLowerCase(), path: path.replace(/\/+$/, "") || "/", query, body };
}

const ok = (config, data, status = 200) => ({ data, status, statusText: "OK", headers: { "x-demo": "1" }, config, request: {} });
const like = (v, q) => String(v || "").toLowerCase().includes(String(q || "").toLowerCase());
const paginate = (list, query, defLimit = 20) => {
  const page = Math.max(parseInt(query.page) || 1, 1);
  const limit = Math.max(parseInt(query.limit) || defLimit, 1);
  const total = list.length;
  return { items: list.slice((page - 1) * limit, page * limit), pagination: { page, limit, total, total_pages: Math.ceil(total / limit) || 1, has_more: page * limit < total } };
};

// Stock search, grouped by product with its batches (same shape as the server)
function searchInventory(store, q) {
  const groups = new Map();
  store.inventory
    .filter((i) => like(i.product_name, q) || like(i.salt_composition, q) || like(i.batch_no, q))
    .forEach((i) => {
      const g = groups.get(i.product_name) || {
        id: i.id,
        product_id: i.product_id,
        product_name: i.product_name,
        manufacturer: i.manufacturer,
        salt_composition: i.salt_composition,
        hsn_no: i.hsn_no,
        units_per_pack: i.units_per_pack,
        pack_type: i.pack_type,
        purchase_price: i.purchase_price,
        mrp: i.mrp,
        mrp_per_unit: i.mrp,
        cgst: i.cgst,
        sgst: i.sgst,
        supplier_name: i.supplier_name,
        schedule_h1: false,
        source: "inventory",
        available_quantity: 0,
        quantity: 0,
        batches: [],
      };
      g.available_quantity += i.available_quantity;
      g.quantity += i.quantity;
      g.batches.push({
        id: i.id,
        batch_no: i.batch_no,
        expiry_date: i.expiry_date,
        available_quantity: i.available_quantity,
        quantity: i.quantity,
        purchase_price: i.purchase_price,
        cost_per_unit: i.purchase_price,
        mrp: i.mrp,
        mrp_per_unit: i.mrp,
        units_per_pack: i.units_per_pack,
        pack_type: i.pack_type,
        cgst: i.cgst,
        sgst: i.sgst,
        supplier_name: i.supplier_name,
      });
      groups.set(i.product_name, g);
    });
  return [...groups.values()].map((g) => ({ ...g, available_units: g.available_quantity, stock_status: g.available_quantity > 0 ? "In Stock" : "Out of Stock" }));
}

function billsList(store, query) {
  let list = [...store.bills].sort((a, b) => (b.billing_date + b.created_at).localeCompare(a.billing_date + a.created_at));
  if (query.customer_id) list = list.filter((b) => b.customer_id === query.customer_id);
  if (query.is_advance_paid === "true") list = list.filter((b) => b.is_advance_paid);
  if (query.is_advance_paid === "false") list = list.filter((b) => !b.is_advance_paid);
  if (query.start_date) list = list.filter((b) => b.billing_date >= query.start_date);
  if (query.end_date) list = list.filter((b) => b.billing_date <= query.end_date);
  if (query.search) {
    const s = query.search;
    list = list.filter((b) => like(b.bill_no, s) || like(b.customer_name, s) || like(b.doctor, s) || b.items.some((i) => like(i.product_name, s) || like(i.batch_no, s)));
  }
  return list;
}

// Module handlers. Return undefined to fall through.
function route(store, { method, path, query, body }) {
  const seg = path.split("/").filter(Boolean);

  // ---- Bills
  if (seg[0] === "bills") {
    if (method === "get" && seg.length === 1) {
      const { items, pagination } = paginate(billsList(store, query), query);
      return { bills: items, pagination };
    }
    if (seg[1] === "drafts") {
      if (method === "get") return { drafts: store.drafts };
      return { message: "ok" };
    }
    if (seg[1] === "insights") {
      const list = billsList(store, query);
      const top = new Map();
      list.forEach((b) =>
        b.items.forEach((i) => {
          const t = top.get(i.product_name) || { name: i.product_name, profit: 0, revenue: 0, quantity: 0 };
          t.profit += i.profit;
          t.revenue += i.item_total;
          t.quantity += i.quantity;
          top.set(i.product_name, t);
        })
      );
      return {
        summary: {
          total_revenue: round2(list.reduce((s, b) => s + b.grand_total, 0)),
          total_profit: round2(list.reduce((s, b) => s + b.profit, 0)),
          total_bills: list.length,
          unpaid_bills: list.filter((b) => !b.is_paid).length,
          unpaid_amount: round2(list.reduce((s, b) => s + (b.remaining_amount || 0), 0)),
        },
        top_products: [...top.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 10),
      };
    }
    if (seg[1] === "doctors") {
      if (method === "get") {
        const list = store.doctors.filter((d) => !query.search || like(d.name, query.search) || like(d.clinic, query.search));
        const { items, pagination } = paginate(list, query);
        return { doctors: items, pagination };
      }
      const doc = store.doctors.find((d) => d.name === body?.name) || { id: `demo-doc-${Date.now()}`, ...body, source: "local" };
      if (!store.doctors.includes(doc)) store.doctors.unshift(doc);
      return { doctor: doc, existed: true };
    }
    if (seg[1] === "prescriptions") return method === "get" ? { id: seg[2], url: "" } : { id: `demo-rx-${Date.now()}`, prescription: { id: `demo-rx-${Date.now()}` } };
    if (method === "post" && seg.length === 1) {
      const bill = insertBill(store, body || {});
      emit("bill-created", bill);
      return { message: "Bill created", bill, ...bill };
    }
    const bill = store.bills.find((b) => b.id === seg[1]);
    if (bill) {
      if (method === "get" && seg.length === 2) return bill;
      if (method === "put" && seg.length === 2) {
        const idx = store.bills.indexOf(bill);
        store.bills.splice(idx, 1);
        const updated = insertBill(store, { ...bill, ...body, customer_id: body?.customer_id || bill.customer_id });
        Object.assign(updated, { id: bill.id, bill_no: bill.bill_no, created_at: bill.created_at });
        return { message: "Bill updated", bill: updated };
      }
      if (method === "delete") {
        store.bills.splice(store.bills.indexOf(bill), 1);
        return { message: "Bill deleted" };
      }
      if (seg[2] === "mark-paid") {
        Object.assign(bill, { is_paid: true, remaining_amount: 0, total_paid: bill.grand_total });
        return { message: "Bill marked as paid" };
      }
      if (seg[2] === "record-payment") {
        const amt = Number(body?.amount) || 0;
        bill.total_paid = round2((bill.total_paid || 0) + amt);
        bill.remaining_amount = round2(Math.max(0, bill.grand_total - bill.total_paid));
        bill.is_paid = bill.remaining_amount === 0;
        bill.payments = [...(bill.payments || []), { amount: amt, mode: body?.payment_mode || "Cash", date: new Date().toISOString() }];
        return { message: "Payment recorded successfully", total_paid: bill.total_paid, is_paid: bill.is_paid };
      }
      if (seg[2] === "pdf") {
        emit("pdf", bill);
        return { pdf_url: "about:blank#demo-bill", upi_qr: false, demo: true };
      }
      if (seg[2] === "delivery" || seg[2] === "delivery-all") return { message: "ok", delivery_status: "delivered" };
    }
  }

  // ---- Stock
  if (seg[0] === "inventory" && seg[1] === "search" && method === "get") {
    const all = searchInventory(store, query.q || query.query || "");
    const { items, pagination } = paginate(all, query, 15);
    return { inventory: items, count: all.length, pagination };
  }
  if (seg[0] === "inventory" && seg[1] === "alternates") return { alternates: [], items: [] };

  // ---- Customers
  if (seg[0] === "customers") {
    if (method === "get" && seg.length === 1) {
      const list = store.customers.filter((c) => !query.search || like(c.name, query.search) || like(c.mobile, query.search));
      const { items, pagination } = paginate(list, query, 15);
      return { customers: items, pagination };
    }
    const c = store.customers.find((x) => x.id === seg[1]);
    if (c && method === "get") {
      const bills = store.bills.filter((b) => b.customer_id === c.id);
      return { customer: c, bills, stats: { total_purchases: round2(bills.reduce((s, b) => s + b.grand_total, 0)), total_profit: round2(bills.reduce((s, b) => s + b.profit, 0)) } };
    }
  }

  // ---- Short book
  if (seg[0] === "shortbook" && method === "post") {
    const entry = { id: `demo-sb-${Date.now()}`, ...body, added_at: new Date().toISOString() };
    store.shortbook.push(entry);
    return { entry, item: entry };
  }
  return undefined;
}

function installAdapter() {
  const original = axios.defaults.adapter;
  const passThrough = axios.getAdapter ? axios.getAdapter(original) : original;
  axios.defaults.adapter = async (config) => {
    const req = parse(config);
    if (config.signal?.aborted) throw new axios.CanceledError("canceled", undefined, config);
    // A small delay so loaders and dropdowns behave like they do for real
    await new Promise((r) => setTimeout(r, 60));
    const data = active && route(active.store, req);
    if (data !== undefined) return ok(config, data);
    if (req.method === "get" || req.method === "head" || req.method === "options") return passThrough(config);
    // Signing in / refreshing the session isn't pharmacy data: let it through,
    // or the app would lose its login mid-tour
    if (/^\/auth\//.test(req.path)) return passThrough(config);
    emit("blocked-write", req);
    return ok(config, { message: "Demo mode: nothing was saved", demo: true });
  };
  return () => {
    axios.defaults.adapter = original;
  };
}

// While a tour runs, the page's localStorage writes go to an overlay that is
// thrown away afterwards (reads see the overlay first, then real storage)
function overlayStorage(clearKeys) {
  const P = Storage.prototype;
  const real = { get: P.getItem, set: P.setItem, remove: P.removeItem };
  const over = new Map();
  const gone = new Set();
  const mine = (store, k) => store === window.localStorage && !String(k).startsWith(GUIDE_KEY_PREFIX);
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (clearKeys.some((c) => (c.endsWith("*") ? k.startsWith(c.slice(0, -1)) : k === c))) gone.add(k);
    }
  } catch {}
  P.getItem = function (k) {
    if (!mine(this, k)) return real.get.call(this, k);
    if (over.has(k)) return over.get(k);
    return gone.has(k) ? null : real.get.call(this, k);
  };
  P.setItem = function (k, v) {
    if (!mine(this, k)) return real.set.call(this, k, v);
    over.set(k, String(v));
    gone.delete(k);
  };
  P.removeItem = function (k) {
    if (!mine(this, k)) return real.remove.call(this, k);
    over.delete(k);
    gone.add(k);
  };
  return () => {
    P.getItem = real.get;
    P.setItem = real.set;
    P.removeItem = real.remove;
  };
}

function stubWindow() {
  const restore = [];
  const origOpen = window.open;
  window.open = (url) => {
    emit("open", url);
    return null;
  };
  restore.push(() => (window.open = origOpen));
  const origPrint = window.print;
  window.print = () => emit("print");
  restore.push(() => (window.print = origPrint));
  const origFetch = window.fetch;
  window.fetch = (input, init = {}) => {
    const method = String(init.method || (input && input.method) || "GET").toUpperCase();
    const url = String(typeof input === "string" ? input : input?.url || "");
    if (method !== "GET" && /\/api\//.test(url)) {
      emit("blocked-write", { method, path: url });
      return Promise.resolve(new Response(JSON.stringify({ demo: true }), { status: 200, headers: { "content-type": "application/json" } }));
    }
    return origFetch(input, init);
  };
  restore.push(() => (window.fetch = origFetch));
  return () => restore.forEach((fn) => fn());
}

// clearKeys: storage keys (or prefixes ending in "*") the page should see as
// empty during the tour, e.g. the billing page's saved bill tabs
export function enterSandbox({ clearKeys = [] } = {}) {
  if (active) return active.store;
  active = { store: createDemoStore(), restore: [] };
  active.restore.push(overlayStorage(clearKeys), installAdapter(), stubWindow());
  document.documentElement.dataset.guideDemo = "1";
  return active.store;
}

export function exitSandbox() {
  if (!active) return;
  const { restore } = active;
  active = null;
  restore.reverse().forEach((fn) => fn());
  delete document.documentElement.dataset.guideDemo;
}
