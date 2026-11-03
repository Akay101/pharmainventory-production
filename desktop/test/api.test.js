// End-to-end through the backend's real routes on the local database, with no
// network or cloud services. Run with: npm run test:api
const test = require("node:test");
const assert = require("node:assert");
const crypto = require("crypto");
const fs = require("fs");
const https = require("https");
const os = require("os");
const path = require("path");
const { startServer, WINDOW_HEADER } = require("../server");
const { clientProof, serverProof, LAN_PORT } = require("../server/lan");

const root = path.join(__dirname, "..");
const backendDir = path.join(root, "backend");
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-api-"));
const quiet = { warn() {}, error: console.error, log() {} };
let s, base, token;

const call = async (method, url, body, { headers = {}, device = "win", raw = false, form } = {}) => {
  const res = await fetch(base + url, {
    method,
    headers: {
      ...(device ? { [WINDOW_HEADER]: device } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...headers,
    },
    body: form || (body !== undefined ? JSON.stringify(body) : undefined),
  });
  if (raw) return res;
  const text = await res.text();
  let data = text;
  try {
    data = JSON.parse(text);
  } catch {}
  return { status: res.status, data };
};
const ok = async (method, url, body, opts) => {
  const r = await call(method, url, body, opts);
  assert.ok(r.status < 400, `${method} ${url} -> ${r.status} ${JSON.stringify(r.data).slice(0, 400)}`);
  return r.data;
};

test.before(async () => {
  // A computer already signed in, with the cloud out of reach
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const config = { cloudUrl: "http://127.0.0.1:9", licencePublicKey: publicKey.export({ type: "spki", format: "pem" }) };
  s = await startServer({ dataDir, backendDir, webDir: null, dbKey: "ab".repeat(32), catalogKey: "cd".repeat(32), windowSecret: "win", config, port: 0, log: quiet });
  const body = Buffer.from(JSON.stringify({ device_id: "d1", pharmacy_id: "ph1", user_id: "u1", plan: "ADVANCED", valid_until: Date.now() + 86400000 })).toString("base64url");
  const licence = `${body}.${crypto.sign(null, Buffer.from(body), privateKey).toString("base64url")}`;
  for (const [k, v] of Object.entries({ device_token: "t", device_id: "d1", pharmacy_id: "ph1", user_id: "u1", licence, snapshot_done: "1" })) s.db.setMeta(k, v);
  const sub = { plan: "ADVANCED", kind: "PAID", status: "ACTIVE", starts_at: new Date().toISOString(), ends_at: new Date(Date.now() + 864e5).toISOString() };
  await s.db.collection("pharmacies")._putRaw({ _id: "a".repeat(24), id: "ph1", name: "Test Shop", subscription: sub });
  await s.db.collection("users")._putRaw({ _id: "b".repeat(24), id: "u1", name: "Owner", email: "o@example.test", role: "ADMIN", pharmacy_id: "ph1", is_primary_admin: true, verified: true, token_version: 0 });
  base = `http://127.0.0.1:${s.port}`;
});

test.after(async () => {
  await s.stop();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test("calls without the device secret are refused", async () => {
  const r = await call("POST", "/api/auth/refresh", undefined, { device: null });
  assert.strictEqual(r.status, 401);
  assert.strictEqual(r.data.code, "DEVICE_NOT_PAIRED");
  assert.strictEqual((await call("POST", "/api/auth/refresh", undefined, { device: "guess" })).status, 401);
});

test("the app signs in with no setup and /auth/me shows a working shop", async () => {
  token = (await ok("POST", "/api/auth/refresh")).token;
  const me = await ok("GET", "/api/auth/me");
  assert.strictEqual(me.role || me.user?.role, "ADMIN");
  const sub = me.subscription || me.user?.subscription;
  assert.strictEqual(sub.status, "ACTIVE");
});

let supplier, customer, batch;

test("supplier and customer: create, read, edit", async () => {
  supplier = (await ok("POST", "/api/suppliers", { name: "Sai Distributors", contact: "9000000001", address: "Pune", gst_no: "27ABCDE1234F1Z5" })).supplier;
  assert.ok(supplier.id);
  await ok("PUT", `/api/suppliers/${supplier.id}`, { ...supplier, name: "Sai Distributors Pvt" });
  const list = await ok("GET", "/api/suppliers");
  const rows = list.suppliers || list.data || list;
  assert.ok(rows.some((x) => x.name === "Sai Distributors Pvt"));

  customer = (await ok("POST", "/api/customers", { name: "Asha Patil", mobile: "9000000002", address: "Pune" })).customer;
  assert.ok(customer.id);
  const edited = await ok("PUT", `/api/customers/${customer.id}`, { name: "Asha P", mobile: "9000000002" });
  assert.ok(edited);
});

test("purchase by hand adds stock", async () => {
  for (const name of ["Dolo 650", "Crocin Advance"]) {
    await ok("POST", "/api/products", { name, manufacturer: "Micro Labs", salt_composition: "Paracetamol", category: "Tablet", units_per_pack: 15, mrp: 30, gst_percent: 12 });
  }
  const purchase = await ok("POST", "/api/purchases", {
    supplier_id: supplier.id,
    supplier_name: "Sai Distributors Pvt",
    invoice_no: "INV-1001",
    purchase_date: "2026-11-01",
    payment_status: "Paid",
    amount_paid: 900,
    payment_mode: "Cash",
    items: [
      { product_name: "Dolo 650", batch_no: "D1", expiry_date: "2028-06", quantity: 10, units_per_pack: 15, purchase_price: 20, mrp: 30, selling_price: 30, gst_percent: 12, hsn_no: "3004" },
      { product_name: "Crocin Advance", batch_no: "C1", expiry_date: "2028-01", quantity: 5, units_per_pack: 10, purchase_price: 15, mrp: 25, selling_price: 25, gst_percent: 12 },
    ],
  });
  assert.ok(purchase.id || purchase.purchase?.id);
  const inv = await ok("GET", "/api/inventory?search=Dolo");
  const rows = inv.items || inv.inventory || inv.data || inv;
  batch = rows.find((r) => /Dolo/.test(r.product_name) || (r.batches || []).length);
  assert.ok(batch, "Dolo shows in stock");
  if (batch.batches?.length) batch = batch.batches[0];
  assert.ok(batch.quantity > 0, `stock quantity ${batch.quantity}`);
});

test("a repeated purchase invoice from the same supplier is caught", async () => {
  const r = await call("POST", "/api/purchases", {
    supplier_id: supplier.id,
    invoice_no: "INV-1001",
    purchase_date: "2026-11-01",
    items: [{ product_name: "Dolo 650", batch_no: "D1", expiry_date: "2028-06", quantity: 1, purchase_price: 20, mrp: 30 }],
  });
  assert.ok(r.status >= 400 && r.status < 500, `got ${r.status}`);
});

test("CSV invoice reads with no internet", async () => {
  const form = new FormData();
  const csv = "Item,Batch,Expiry,Qty,Rate,MRP\nAzee 500,AZ1,12/28,3,60,90\nPan 40,P1,10/28,8,30,50\n";
  form.append("file", new Blob([csv], { type: "text/csv" }), "invoice.csv");
  form.append("supplier_id", supplier.id);
  const r = await call("POST", "/api/purchases/parse-csv", undefined, { form });
  assert.ok(r.status < 400, JSON.stringify(r.data).slice(0, 300));
  assert.strictEqual(r.data.parsed_rows.length, 2);
});

let bill;

test("a bill takes stock, and shows in lists and dashboard", async () => {
  const before = (await s.db.collection("inventory").findOne({ id: batch.id })).available_quantity;
  bill = await ok("POST", "/api/bills", {
    customer_id: customer.id,
    customer_name: "Asha P",
    customer_mobile: "9000000002",
    payment_mode: "Cash",
    is_paid: true,
    items: [{ inventory_id: batch.id, product_name: batch.product_name, batch_no: batch.batch_no, expiry_date: batch.expiry_date, quantity: 3, unit_price: 2, purchase_price: 1.33, gst_percent: 12, units_per_pack: 15 }],
  });
  assert.ok(bill.id && bill.bill_no);
  const after = await s.db.collection("inventory").findOne({ id: batch.id });
  assert.strictEqual(after.available_quantity, before - 3);
  const list = await ok("GET", "/api/bills");
  assert.ok(JSON.stringify(list).includes(bill.id));
  await ok("GET", `/api/bills/${bill.id}`);
  await ok("GET", "/api/dashboard/stats");
});

test("a bill makes a PDF that opens from local storage", async () => {
  const r = await ok("POST", `/api/bills/${bill.id}/pdf`, {});
  assert.ok(r.pdf_url.startsWith("/files/"), r.pdf_url);
  const pdf = await call("GET", r.pdf_url, undefined, { raw: true });
  assert.strictEqual(pdf.status, 200);
  assert.strictEqual(Buffer.from(await pdf.arrayBuffer()).subarray(0, 4).toString(), "%PDF");
  assert.strictEqual((await call("GET", r.pdf_url, undefined, { device: null, raw: true })).status, 401);
});

test("selling more than stock still works: billing is never blocked", async () => {
  const b = await ok("POST", "/api/bills", {
    customer_name: "Walk-in",
    payment_mode: "Cash",
    is_paid: true,
    items: [{ inventory_id: batch.id, product_name: batch.product_name, batch_no: batch.batch_no, quantity: 100000, unit_price: 2, purchase_price: 1 }],
  });
  const stored = await s.db.collection("inventory").findOne({ id: batch.id });
  assert.strictEqual(stored.available_quantity, 0);
  assert.ok(b.bill.items[0].stock_deducted < 100000);
});

test("a failed write request leaves nothing behind", async () => {
  const c = s.db.collection("customers");
  const before = await c.countDocuments({});
  // A bill with a malformed item fails inside the route, after earlier items moved stock
  const r = await call("POST", "/api/bills", { customer_name: "Crash", is_paid: true, payment_mode: "Cash", items: [null] });
  assert.ok(r.status >= 400);
  assert.strictEqual(await c.countDocuments({}), before);
  // The lock is free again
  await ok("POST", "/api/customers", { name: "After failure", mobile: "9000000099" });
});

test("delete works", async () => {
  const c = (await ok("POST", "/api/customers", { name: "Temp", mobile: "9000000003" })).customer;
  await ok("DELETE", `/api/customers/${c.id}`);
  assert.strictEqual(await s.db.collection("customers").findOne({ id: c.id }), null);
});

test("scanning and AI answer with a clear needs-internet message", async () => {
  for (const [m, u] of [["POST", "/api/assistant/chat"], ["POST", "/api/bills/scan-product"], ["POST", "/api/purchases/scan-bill"]]) {
    const r = await call(m, u, {});
    assert.strictEqual(r.status, 503, u);
    assert.strictEqual(r.data.code, "NEEDS_INTERNET");
  }
});

test("no read endpoint fails on the local database", async () => {
  const mounts = {
    users: "/api/users", suppliers: "/api/suppliers", products: "/api/products", purchases: "/api/purchases", inventory: "/api/inventory",
    customers: "/api/customers", bills: "/api/bills", dashboard: "/api/dashboard", medicines: "/api/medicines", pharmacy: "/api/pharmacy",
    activities: "/api/activities", settings: "/api/settings", expiry: "/api/expiry", returns: "/api/returns", reminders: "/api/reminders",
    notifications: "/api/notifications", broadcasts: "/api/broadcasts", billing: "/api/billing", shortbook: "/api/shortbook",
  };
  const failures = [];
  let checked = 0;
  for (const [file, mount] of Object.entries(mounts)) {
    const src = fs.readFileSync(path.join(backendDir, "routes", `${file}.js`), "utf8");
    for (const m of src.matchAll(/router\.get\(\s*["'`]([^"'`]+)["'`]/g)) {
      const url = mount + m[1]
        .replace(/:supplier_id|:supplierId/g, supplier.id)
        .replace(/:customer_id|:customerId/g, customer.id)
        .replace(/:bill_id|:billId/g, bill.id)
        .replace(/:[a-zA-Z_]+/g, batch.id)
        .replace(/\/$/, "");
      const r = await call("GET", url + "?search=do&q=do&page=1&limit=5&start_date=2026-01-01&end_date=2026-12-31");
      checked++;
      if (r.status >= 500 && r.data?.code !== "NEEDS_INTERNET") failures.push(`${url} -> ${r.status} ${JSON.stringify(r.data).slice(0, 120)}`);
    }
  }
  assert.ok(checked >= 50, `only ${checked} routes found`);
  assert.deepStrictEqual(failures, []);
});

test("a counter pairs with the right code and can then work; wrong code and revoked device can't", async () => {
  const status = await s.network.enable();
  const cert = await new Promise((resolve, reject) => {
    const req = https.request({ host: "127.0.0.1", port: LAN_PORT, path: "/health", rejectUnauthorized: false }, (res) => {
      resolve(res.socket.getPeerCertificate().fingerprint256);
      res.resume();
    });
    req.on("error", reject);
    req.end();
  });
  const post = (url, body, headers = {}) =>
    new Promise((resolve, reject) => {
      const data = body ? JSON.stringify(body) : "";
      const req = https.request(
        { host: "127.0.0.1", port: LAN_PORT, path: url, method: body ? "POST" : "GET", rejectUnauthorized: false, headers: { ...(body ? { "content-type": "application/json", "content-length": Buffer.byteLength(data) } : {}), ...headers } },
        (res) => {
          let t = "";
          res.on("data", (c) => (t += c));
          res.on("end", () => resolve({ status: res.statusCode, data: JSON.parse(t || "{}") }));
        }
      );
      req.on("error", reject);
      req.end(data);
    });

  const nonce = crypto.randomBytes(16).toString("hex");
  const wrong = await post("/api/desktop/pair", { nonce, proof: clientProof("000000x", nonce, cert), name: "Counter 2" });
  assert.strictEqual(wrong.status, 401);
  // A proof made for another certificate (a machine in the middle) is refused too
  const mitm = await post("/api/desktop/pair", { nonce, proof: clientProof(status.code, nonce, "AA:BB"), name: "Counter 2" });
  assert.strictEqual(mitm.status, 401);

  const good = await post("/api/desktop/pair", { nonce, proof: clientProof(status.code, nonce, cert), name: "Counter 2" });
  assert.strictEqual(good.status, 200);
  assert.strictEqual(good.data.proof, serverProof(status.code, nonce, cert));

  const header = { [WINDOW_HEADER]: good.data.token };
  const counterToken = (await post("/api/auth/refresh", {}, header)).data.token;
  const fromCounter = await post("/api/customers", { name: "From counter", mobile: "9000000055" }, { ...header, authorization: `Bearer ${counterToken}` });
  assert.ok(fromCounter.data.customer?.id, "counter writes to the main computer's data");
  assert.ok(await s.db.collection("customers").findOne({ id: fromCounter.data.customer.id }));

  // The window secret is only good on this computer's own loopback path, and
  // no request gets in without a device token
  assert.strictEqual((await post("/api/customers", { name: "x" })).status, 401);

  const again = await post("/api/desktop/pair", { nonce, proof: clientProof(status.code, nonce, cert), name: "Other" });
  assert.strictEqual(again.status, 403, "a code works once");

  const [device] = (await s.network.status()).devices;
  await s.network.revoke(device.id);
  assert.strictEqual((await post("/api/auth/refresh", {}, header)).status, 401);
  await s.network.disable();
});

test("no create, edit or delete route fails on the local database with no internet", async () => {
  const mounts = {
    suppliers: "/api/suppliers", products: "/api/products", purchases: "/api/purchases", inventory: "/api/inventory", customers: "/api/customers",
    bills: "/api/bills", medicines: "/api/medicines", activities: "/api/activities", settings: "/api/settings", expiry: "/api/expiry", returns: "/api/returns",
    reminders: "/api/reminders", notifications: "/api/notifications", shortbook: "/api/shortbook", users: "/api/users", pharmacy: "/api/pharmacy",
  };
  const failures = [];
  const logged = [];
  const originalError = console.error;
  console.error = (...args) => logged.push(args.map((a) => a?.message || String(a)).join(" "));
  let checked = 0;
  try {
    for (const [file, mount] of Object.entries(mounts)) {
      const src = fs.readFileSync(path.join(backendDir, "routes", `${file}.js`), "utf8");
      for (const m of src.matchAll(/router\.(post|put|patch|delete)\(\s*["'`]([^"'`]+)["'`]/g)) {
        const url = mount + m[2].replace(/:[a-zA-Z_]+/g, "does-not-exist").replace(/\/$/, "");
        logged.length = 0;
        const r = await call(m[1].toUpperCase(), url, {});
        checked++;
        if (r.status >= 500 && r.data?.code !== "NEEDS_INTERNET") failures.push(`${m[1].toUpperCase()} ${url}: ${r.status} ${logged.join(" ").slice(0, 160)}`);
      }
    }
  } finally {
    console.error = originalError;
  }
  assert.ok(checked >= 60, `only ${checked} routes found`);
  // Writing code for an unsupported database feature fails loudly here
  assert.deepStrictEqual(failures, []);
});

test("real offline work: edits, deletes, drafts, reminders, debts and settings", async () => {
  const outcomes = [];
  const step = async (name, method, url, body) => {
    const r = await call(method, url, body);
    outcomes.push(`${name}:${r.status}`);
    assert.ok(r.status < 500, `${name} ${method} ${url} -> ${r.status} ${JSON.stringify(r.data).slice(0, 200)}`);
    return r;
  };
  const pending = () => s.db._db.prepare("SELECT count(*) n FROM outbox WHERE status = 'pending'").get().n;
  const before = pending();

  const customers = (await step("customer", "POST", "/api/customers", { name: "Debt Customer", mobile: "9000000123" })).data.customer;
  const product = await s.db.collection("products").findOne({ name: "Dolo 650" });
  await step("edit product", "PUT", `/api/products/${product.id}`, { ...product, _id: undefined, mrp: 35 });
  const stock = await s.db.collection("inventory").findOne({ product_name: "Crocin Advance" });
  await step("add stock", "POST", `/api/inventory/${stock.id}/add-quantity`, { quantity: 5, add_quantity: 5 });
  await step("edit stock", "PUT", `/api/inventory/${stock.id}`, { mrp: 26, selling_price: 26 });
  await step("low stock level", "PUT", "/api/inventory/threshold", { product_id: stock.product_id, product_name: stock.product_name, threshold: 3 });

  const credit = (await step("bill on credit", "POST", "/api/bills", { customer_id: customers.id, customer_name: customers.name, customer_mobile: customers.mobile, is_credit: true, is_paid: false, paid_now: 0, items: [{ inventory_id: stock.id, product_name: stock.product_name, batch_no: stock.batch_no, quantity: 2, unit_price: 25, purchase_price: 15 }] })).data;
  assert.ok((await s.db.collection("customers").findOne({ id: customers.id })).total_debt > 0, "debt recorded");
  await step("clear debt", "POST", `/api/customers/${customers.id}/clear-debt`, { amount: 10, payment_mode: "Cash" });

  await step("edit bill", "PUT", `/api/bills/${credit.id}`, { customer_id: customers.id, customer_name: customers.name, customer_mobile: customers.mobile, is_credit: true, is_paid: false, items: [{ inventory_id: stock.id, product_name: stock.product_name, batch_no: stock.batch_no, quantity: 1, unit_price: 25, purchase_price: 15 }] });
  const drafted = (await step("bill draft", "POST", "/api/bills/drafts", { customer_name: "Draft", items: [{ product_name: "Dolo 650", quantity: 1 }] })).data.draft;
  if (drafted?.id) await step("delete bill draft", "DELETE", `/api/bills/drafts/${drafted.id}`);
  await step("delete bill", "DELETE", `/api/bills/${credit.id}`);

  const purchases = (await step("list purchases", "GET", "/api/purchases")).data.purchases || [];
  if (purchases[0]) await step("edit purchase", "PUT", `/api/purchases/${purchases[0].id}`, { ...purchases[0], _id: undefined, invoice_no: "INV-EDITED" });
  await step("purchase draft", "POST", "/api/purchases/drafts", { supplier_name: "Sai", items: [{ product_name: "Dolo 650", quantity: 2 }] });

  const reminder = (await step("reminder", "POST", "/api/reminders", { customer_id: customers.id, customer_name: customers.name, customer_mobile: customers.mobile, refill_target_date: "2027-01-10", reminder_date: "2027-01-05", items: [{ product_name: "Dolo 650", quantity: 1 }] })).data;
  const reminderId = reminder.id || reminder.reminder?.id;
  if (reminderId) await step("delete reminder", "DELETE", `/api/reminders/${reminderId}`);
  const short = (await step("short book", "POST", "/api/shortbook", { product_name: "Azee 500", quantity: 3 })).data;
  const shortId = short.id || short.item?.id;
  if (shortId) await step("delete short book", "DELETE", `/api/shortbook/${shortId}`);
  await step("preferences", "POST", "/api/settings/update", { key: "theme", value: "dark" });
  await step("notifications", "GET", "/api/notifications");
  await step("reports", "GET", "/api/dashboard/stats");

  const made = outcomes.filter((o) => /:2\d\d$/.test(o)).length;
  assert.ok(made >= outcomes.length - 2, `Too many steps refused: ${outcomes.join(" ")}`);
  assert.ok(pending() > before + 5, "the work is waiting to sync");
  const queued = s.db._db.prepare("SELECT DISTINCT json_extract(value, '$.coll') c FROM outbox, json_each(outbox.changes)").all().map((r) => r.c);
  for (const coll of ["bills", "customers", "inventory", "products"]) assert.ok(queued.includes(coll), `${coll} queued for sync`);
});

