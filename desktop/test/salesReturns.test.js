// Sales returns end to end on the local database: part and whole-bill
// returns, refunds, dues, advance credit, stock, locks and cancelling.
// Run with: npm run prepare:backend && ELECTRON_RUN_AS_NODE=1 electron --test test/salesReturns.test.js
const test = require("node:test");
const assert = require("node:assert");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { startServer, WINDOW_HEADER } = require("../server");

const root = path.join(__dirname, "..");
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-sr-"));
const quiet = { warn() {}, error: console.error, log() {} };
let s, base, token;

const call = async (method, url, body) => {
  const res = await fetch(base + url, {
    method,
    headers: { [WINDOW_HEADER]: "win", ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { "content-type": "application/json" } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = text;
  try {
    data = JSON.parse(text);
  } catch {}
  return { status: res.status, data };
};
const ok = async (method, url, body) => {
  const r = await call(method, url, body);
  assert.ok(r.status < 400, `${method} ${url} -> ${r.status} ${JSON.stringify(r.data).slice(0, 400)}`);
  return r.data;
};
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.011, `${msg}: ${a} vs ${b}`);
const inv = (id) => s.db.collection("inventory").findOne({ id });
const billDoc = (id) => s.db.collection("bills").findOne({ id });
const cust = (id) => s.db.collection("customers").findOne({ id });

let customer, dolo, crocin;

test.before(async () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const config = { cloudUrl: "http://127.0.0.1:9", licencePublicKey: publicKey.export({ type: "spki", format: "pem" }) };
  s = await startServer({ dataDir, backendDir: path.join(root, "backend"), webDir: null, dbKey: "ab".repeat(32), catalogKey: "cd".repeat(32), windowSecret: "win", config, port: 0, log: quiet });
  const body = Buffer.from(JSON.stringify({ device_id: "d1", pharmacy_id: "ph1", user_id: "u1", plan: "ADVANCED", valid_until: Date.now() + 86400000 })).toString("base64url");
  const licence = `${body}.${crypto.sign(null, Buffer.from(body), privateKey).toString("base64url")}`;
  for (const [k, v] of Object.entries({ device_token: "t", device_id: "d1", pharmacy_id: "ph1", user_id: "u1", licence, snapshot_done: "1" })) s.db.setMeta(k, v);
  const sub = { plan: "ADVANCED", kind: "PAID", status: "ACTIVE", starts_at: new Date().toISOString(), ends_at: new Date(Date.now() + 864e5).toISOString() };
  await s.db.collection("pharmacies")._putRaw({ _id: "a".repeat(24), id: "ph1", name: "Test Shop", subscription: sub });
  await s.db.collection("users")._putRaw({ _id: "b".repeat(24), id: "u1", name: "Owner", email: "o@example.test", role: "ADMIN", pharmacy_id: "ph1", is_primary_admin: true, verified: true, token_version: 0 });
  base = `http://127.0.0.1:${s.port}`;
  token = (await ok("POST", "/api/auth/refresh")).token;

  customer = (await ok("POST", "/api/customers", { name: "Asha Patil", mobile: "9000000002" })).customer;
  const supplier = (await ok("POST", "/api/suppliers", { name: "Sai Distributors", contact: "9000000001" })).supplier;
  await ok("POST", "/api/purchases", {
    supplier_id: supplier.id,
    invoice_no: "INV-1",
    purchase_date: "2026-11-01",
    payment_status: "Paid",
    amount_paid: 1000,
    payment_mode: "Cash",
    items: [
      { product_name: "Dolo 650", batch_no: "D1", expiry_date: "2028-06", quantity: 10, units_per_pack: 10, purchase_price: 20, mrp: 30, gst_percent: 12 },
      { product_name: "Crocin", batch_no: "C1", expiry_date: "2028-01", quantity: 10, units_per_pack: 10, purchase_price: 15, mrp: 25, gst_percent: 12 },
    ],
  });
  const rows = await s.db.collection("inventory").find({ pharmacy_id: "ph1" }).toArray();
  dolo = rows.find((r) => r.batch_no === "D1");
  crocin = rows.find((r) => r.batch_no === "C1");
  assert.ok(dolo && crocin);
});

test.after(async () => {
  await s.stop();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

const line = (b, quantity, unit_price, purchase_price) => ({
  inventory_id: b.id,
  product_name: b.product_name,
  batch_no: b.batch_no,
  expiry_date: b.expiry_date,
  quantity,
  unit_price,
  purchase_price,
  units_per_pack: 10,
});

test("part return on a paid bill: stock back, cash refund, totals net down", async () => {
  const stock0 = (await inv(dolo.id)).available_quantity;
  const { id } = await ok("POST", "/api/bills", { customer_id: customer.id, customer_name: "Asha Patil", is_paid: true, payment_mode: "Cash", items: [line(dolo, 10, 3, 2), line(crocin, 4, 2.5, 1.5)] });
  const b0 = await billDoc(id);
  near(b0.grand_total, 40, "bill total");

  const view = await ok("GET", `/api/sales-returns/bill/${id}`);
  assert.strictEqual(view.bill.lines[0].returnable_qty, 10);
  assert.strictEqual(view.bill.blocked, null);

  // Refund mode is required when money goes back
  const noMode = await call("POST", "/api/sales-returns", { bill_id: id, items: [{ line_index: 0, quantity: 4, restock: true }] });
  assert.strictEqual(noMode.status, 400);
  near(noMode.data.refund, 12, "refund asked");

  // More than sold is refused
  assert.strictEqual((await call("POST", "/api/sales-returns", { bill_id: id, refund_mode: "Cash", items: [{ line_index: 0, quantity: 11 }] })).status, 400);

  const ret = await ok("POST", "/api/sales-returns", { bill_id: id, refund_mode: "Cash", reason: "Wrong item", items: [{ line_index: 0, quantity: 4, restock: true }] });
  assert.match(ret.return_no, /^SR-\d{6}-0001/);
  near(ret.total_amount, 12, "return value");
  near(ret.refund_amount, 12, "refund");
  assert.strictEqual(ret.type, "partial");
  assert.strictEqual((await inv(dolo.id)).available_quantity, stock0 - 10 + 4);

  const b1 = await billDoc(id);
  near(b1.grand_total, 28, "net total");
  near(b1.total_paid, 28, "paid after refund");
  assert.strictEqual(b1.is_paid, true);
  assert.strictEqual(b1.items[0].quantity, 6);
  assert.strictEqual(b1.items[0].original_quantity, 10);
  near(b1.profit, b0.profit - 4, "profit drops by (3-2) x 4");
  assert.strictEqual(b1.return_status, "Partially Returned");
  assert.ok(b1.payments.some((p) => p.amount === -12 && p.kind === "refund"));

  // A returned bill is locked
  assert.strictEqual((await call("PUT", `/api/bills/${id}`, { items: b1.items })).status, 409);
  assert.strictEqual((await call("DELETE", `/api/bills/${id}`)).status, 409);

  // The bill PDF still prints as invoiced
  const pdf = await ok("POST", `/api/bills/${id}/pdf`, {});
  assert.ok(pdf.pdf_url);
  const note = await fetch(`${base}/api/sales-returns/${ret.id}/pdf`, { headers: { [WINDOW_HEADER]: "win", authorization: `Bearer ${token}` } });
  assert.strictEqual(note.status, 200);
  assert.strictEqual(Buffer.from(await note.arrayBuffer()).subarray(0, 4).toString(), "%PDF");

  // Whole remaining bill, damaged goods not restocked, refund kept as advance
  const stock1 = (await inv(crocin.id)).available_quantity;
  const adv0 = (await cust(customer.id)).advance_credit || 0;
  const full = await ok("POST", "/api/sales-returns", { bill_id: id, full: true, restock_all: false, reason: "Damaged", refund_mode: "Advance" });
  assert.strictEqual(full.type, "full");
  near(full.total_amount, 28, "rest of bill");
  assert.strictEqual((await inv(crocin.id)).available_quantity, stock1, "not restocked");
  near(((await cust(customer.id)).advance_credit || 0) - adv0, 28, "advance credit");
  const b2 = await billDoc(id);
  assert.strictEqual(b2.grand_total, 0);
  assert.strictEqual(b2.profit, 0);
  assert.strictEqual(b2.return_status, "Returned");
  assert.strictEqual((await call("POST", "/api/sales-returns", { bill_id: id, full: true, refund_mode: "Cash" })).status, 400);

  // Only the latest return can be cancelled
  assert.strictEqual((await call("POST", `/api/sales-returns/${ret.id}/cancel`)).status, 400);
  await ok("POST", `/api/sales-returns/${full.id}/cancel`);
  near(((await cust(customer.id)).advance_credit || 0) - adv0, 0, "advance taken back");
  await ok("POST", `/api/sales-returns/${ret.id}/cancel`);
  const b3 = await billDoc(id);
  near(b3.grand_total, 40, "bill restored");
  near(b3.total_paid, 40, "paid restored");
  assert.strictEqual(b3.items[0].quantity, 10);
  assert.strictEqual(b3.items[0].original_quantity, undefined);
  assert.strictEqual(b3.return_status, undefined);
  assert.strictEqual((await inv(dolo.id)).available_quantity, stock0 - 10, "restocked units taken back");
  assert.strictEqual(b3.payments.filter((p) => p.kind === "refund").length, 0);

  // Unlocked again
  assert.strictEqual((await call("DELETE", `/api/bills/${id}?restore_inventory=true`)).status, 200);
});

test("return on an udhar bill reduces what the customer owes first", async () => {
  const debt0 = (await cust(customer.id)).total_debt || 0;
  const { id } = await ok("POST", "/api/bills", { customer_id: customer.id, customer_name: "Asha Patil", is_credit: true, paid_now: 10, payment_mode: "Cash", items: [line(dolo, 10, 3, 2)] });
  near(((await cust(customer.id)).total_debt || 0) - debt0, 20, "owes 20");

  // Return 5 x 3 = 15: all of it comes off the 20 due, nothing to refund
  const r1 = await ok("POST", "/api/sales-returns", { bill_id: id, items: [{ line_index: 0, quantity: 5 }] });
  near(r1.adjusted_against_due, 15, "adjusted");
  near(r1.refund_amount, 0, "no refund");
  near(((await cust(customer.id)).total_debt || 0) - debt0, 5, "owes 5");

  // Return 4 more = 12: 5 clears the due, 7 is refunded
  const r2 = await ok("POST", "/api/sales-returns", { bill_id: id, refund_mode: "UPI", items: [{ line_index: 0, quantity: 4 }] });
  near(r2.adjusted_against_due, 5, "adjusted");
  near(r2.refund_amount, 7, "refund");
  near(((await cust(customer.id)).total_debt || 0) - debt0, 0, "owes nothing");
  const b = await billDoc(id);
  near(b.grand_total, 3, "one unit left");
  near(b.total_paid, 3, "paid 10 less 7 refunded");
  assert.strictEqual(b.is_paid, true);

  const list = await ok("GET", "/api/sales-returns?search=" + encodeURIComponent(b.bill_no));
  assert.strictEqual(list.returns.length, 2);
  assert.ok(list.stats.count >= 2);
});

test("walk-in bills can't refund to advance; bill discounts are honoured", async () => {
  const { id } = await ok("POST", "/api/bills", { customer_name: "", is_paid: true, payment_mode: "Cash", discount_percent: 10, items: [line(crocin, 4, 2.5, 1.5)] });
  const b = await billDoc(id);
  near(b.grand_total, 9, "10 less 10%");
  const r = await call("POST", "/api/sales-returns", { bill_id: id, refund_mode: "Advance", items: [{ line_index: 0, quantity: 2 }] });
  assert.strictEqual(r.status, 400);
  const ok2 = await ok("POST", "/api/sales-returns", { bill_id: id, refund_mode: "Cash", items: [{ line_index: 0, quantity: 2 }] });
  near(ok2.total_amount, 4.5, "refund at the discounted rate");
});
