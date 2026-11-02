// The desktop app against a real private copy of the cloud. Run: npm run test:sync
const test = require("node:test");
const assert = require("node:assert");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { MongoClient, ObjectId } = require(path.join(__dirname, "..", "..", "backend-node", "node_modules", "mongodb"));
const jwt = require("jsonwebtoken");
const { startServer, WINDOW_HEADER } = require("../server");

const CLOUD = process.env.DD_TEST_CLOUD;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-sync-"));
const quiet = { warn() {}, error: console.error, log() {} };
const PHARMACY = "ph-1";
const USER = "user-1";
const config = { cloudUrl: CLOUD, licencePublicKey: process.env.DD_TEST_PUBLIC_KEY };
let client, cdb, s, base, localToken;

const until = async (fn, what, ms = 20000) => {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`Timed out waiting for: ${what}`);
    await new Promise((r) => setTimeout(r, 150));
  }
};

const webToken = (user = USER, version = 0) => jwt.sign({ user_id: user, token_type: "access", token_version: version }, process.env.DD_TEST_JWT, { expiresIn: "15m", audience: "davadesk-api" });
const send = async (root, method, url, body, headers = {}) => {
  const res = await fetch(root + url, { method, headers: { ...(body !== undefined ? { "content-type": "application/json" } : {}), ...headers }, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data = text;
  try {
    data = JSON.parse(text);
  } catch {}
  return { status: res.status, data };
};
const web = (method, url, body) => send(CLOUD, method, url, body, { authorization: `Bearer ${webToken()}` });
const local = (method, url, body) => send(base, method, url, body, { [WINDOW_HEADER]: "win", ...(localToken ? { authorization: `Bearer ${localToken}` } : {}) });
const ok = (r, what) => {
  assert.ok(r.status < 400, `${what}: ${r.status} ${JSON.stringify(r.data).slice(0, 300)}`);
  return r.data;
};

const subscription = (over = {}) => ({ plan: "ADVANCED", kind: "PAID", status: "ACTIVE", starts_at: new Date(Date.now() - 86400000).toISOString(), ends_at: new Date(Date.now() + 365 * 86400000).toISOString(), ...over });
const startCode = async () => {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  const r = ok(await web("POST", "/api/desktop/authorize", { code_challenge: challenge, device_name: "Test PC" }), "authorize");
  return { code: r.code, verifier };
};

test.before(async () => {
  client = await MongoClient.connect(process.env.DD_TEST_MONGO);
  cdb = client.db();
  await cdb.collection("pharmacies").insertMany([
    { id: PHARMACY, name: "Sai Medicals", location: "Pune", subscription: subscription(), created_at: new Date().toISOString() },
    { id: "ph-other", name: "Other Shop", location: "Delhi", subscription: subscription(), created_at: new Date().toISOString() },
  ]);
  await cdb.collection("users").insertMany([
    { id: USER, name: "Asha", email: "asha@example.test", mobile: "9000000000", password_hash: "$2a$12$secretsecretsecretsecret", otp: "123456", role: "ADMIN", pharmacy_id: PHARMACY, is_primary_admin: true, verified: true, token_version: 0, created_at: new Date().toISOString() },
    { id: "user-other", name: "Other", email: "other@example.test", role: "ADMIN", pharmacy_id: "ph-other", verified: true, token_version: 0 },
  ]);
  await cdb.collection("customers").insertMany([
    { id: "c-mine", pharmacy_id: PHARMACY, name: "Existing Customer", mobile: "9111111111" },
    { id: "c-theirs", pharmacy_id: "ph-other", name: "Secret Customer of Another Shop", mobile: "9222222222" },
  ]);
  await cdb.collection("inventory").insertOne({ id: "b-1", pharmacy_id: PHARMACY, product_id: "p-1", product_name: "Dolo 650", batch_no: "D1", expiry_date: "2028-06-30", quantity: 100, available_quantity: 100, purchase_price: 20, mrp: 30, units_per_pack: 1, created_at: new Date().toISOString() });
  await cdb.collection("global_medicines").insertMany([
    { name: "Azithral 500 Tablet", product_name: "Azithral 500 Tablet", manufacturer: "Alembic", active_ingredients: "Azithromycin", rank_score: 90, s_name: "azithral 500 tablet", s_name_grams: ["azithr", "500"], mrp: 120, internal_cost_note: "never ship" },
    { name: "Crocin Advance", product_name: "Crocin Advance", manufacturer: "GSK", active_ingredients: "Paracetamol", rank_score: 80, s_name: "crocin advance", s_name_grams: ["crocin"], mrp: 30 },
  ]);
  await cdb.collection("global_doctors").insertOne({ full_name: "Dr Meera Kulkarni", practitioner_id: 7 });
  await cdb.collection("global_distributors").insertOne({ agency_name: "Pune Pharma Agency", supplier_id: 9 });
  s = await startServer({ dataDir, backendDir: path.join(__dirname, "..", "backend"), webDir: null, dbKey: "ab".repeat(32), catalogKey: "cd".repeat(32), windowSecret: "win", config, port: 0, log: quiet });
  base = `http://127.0.0.1:${s.port}`;
});

test.after(async () => {
  await s.stop();
  await client.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test("before sign-in the app gives nothing", async () => {
  const r = await local("GET", "/api/customers");
  assert.strictEqual(r.status, 403);
  assert.strictEqual(r.data.code, "LICENCE_REQUIRED");
  assert.strictEqual((await local("POST", "/api/auth/refresh")).status, 403);
  assert.strictEqual((await local("GET", "/api/desktop/status")).data.access_problem, "not_signed_in");
});

test("browser approval: wrong proof and a reused code are refused", async () => {
  const { code, verifier } = await startCode();
  const wrong = await send(CLOUD, "POST", "/api/desktop/token", { code, code_verifier: "someone-else" });
  assert.strictEqual(wrong.status, 400);
  // The failed try used the code up, so an attacker gets one guess at most
  assert.strictEqual((await send(CLOUD, "POST", "/api/desktop/token", { code, code_verifier: verifier })).status, 400);
  assert.strictEqual((await send(CLOUD, "POST", "/api/desktop/authorize", { code_challenge: "x".repeat(43) })).status, 401);
});

test("an expired subscription can't approve a computer", async () => {
  await cdb.collection("pharmacies").updateOne({ id: PHARMACY }, { $set: { subscription: subscription({ ends_at: new Date(Date.now() - 1000).toISOString() }) } });
  const r = await web("POST", "/api/desktop/authorize", { code_challenge: "x".repeat(43) });
  assert.strictEqual(r.status, 403);
  await cdb.collection("pharmacies").updateOne({ id: PHARMACY }, { $set: { subscription: subscription() } });
});

test("sign-in copies this shop's data and nothing of anyone else's", async () => {
  const { code, verifier } = await startCode();
  await s.sync.activate({ code, verifier });
  await until(() => s.sync.accessProblem() === null, "first copy");
  localToken = ok(await local("POST", "/api/auth/refresh"), "refresh").token;
  const me = ok(await local("GET", "/api/auth/me"), "me");
  assert.strictEqual(me.email || me.user?.email, "asha@example.test");
  assert.ok(await s.db.collection("customers").findOne({ id: "c-mine" }));
  assert.strictEqual(await s.db.collection("customers").findOne({ id: "c-theirs" }), null);
  assert.strictEqual(await s.db.collection("pharmacies").findOne({ id: "ph-other" }), null);
  assert.strictEqual(await s.db.collection("users").findOne({ id: "user-other" }), null);
  const user = await s.db.collection("users").findOne({ id: USER });
  assert.strictEqual(user.password_hash, undefined, "password hash never reaches the device");
  assert.strictEqual(user.otp, undefined);
});

test("a bill made here reaches the cloud, with stock moved", async () => {
  const bill = ok(await local("POST", "/api/bills", { customer_name: "Walk-in", customer_mobile: "9000000001", payment_mode: "Cash", is_paid: true, items: [{ inventory_id: "b-1", product_name: "Dolo 650", batch_no: "D1", quantity: 5, unit_price: 30, purchase_price: 20 }] }), "bill");
  await until(async () => s.sync.pendingCount() === 0, "push");
  const cloudBill = await cdb.collection("bills").findOne({ id: bill.id });
  assert.ok(cloudBill, "bill in cloud");
  assert.strictEqual(cloudBill.pharmacy_id, PHARMACY);
  assert.strictEqual((await cdb.collection("inventory").findOne({ id: "b-1" })).available_quantity, 95);
});

test("a change on the web reaches this computer", async () => {
  const made = ok(await web("POST", "/api/customers", { name: "Added On Web", mobile: "9333333333" }), "web customer").customer;
  const here = await until(() => s.db.collection("customers").findOne({ id: made.id }), "web change arrives");
  assert.strictEqual(here.name, "Added On Web");
  ok(await web("PUT", `/api/customers/${made.id}`, { name: "Edited On Web", mobile: "9333333333" }), "web edit");
  await until(async () => (await s.db.collection("customers").findOne({ id: made.id }))?.name === "Edited On Web", "web edit arrives");
  ok(await web("DELETE", `/api/customers/${made.id}`), "web delete");
  await until(async () => !(await s.db.collection("customers").findOne({ id: made.id })), "web delete arrives");
});

test("offline: work continues and queues; online features say so; back online both sales count", async () => {
  s.sync.config.cloudUrl = "http://127.0.0.1:9";
  s.sync.wake();
  await until(() => !s.sync.online, "goes offline");

  const r = await local("GET", "/api/credits");
  assert.strictEqual(r.status, 503);
  assert.strictEqual(r.data.code, "NEEDS_INTERNET");

  const offlineBill = ok(await local("POST", "/api/bills", { customer_name: "Offline Sale", customer_mobile: "9000000002", payment_mode: "Cash", is_paid: true, items: [{ inventory_id: "b-1", product_name: "Dolo 650", batch_no: "D1", quantity: 10, unit_price: 30, purchase_price: 20 }] }), "offline bill");
  const madeOffline = ok(await local("POST", "/api/customers", { name: "Made Offline", mobile: "9444444444" }), "offline customer").customer;
  const status = ok(await local("GET", "/api/desktop/status"), "status");
  assert.ok(status.pending >= 2, `pending ${status.pending}`);
  assert.ok(status.pending_by_collection.some((p) => p.coll === "bills"));
  assert.strictEqual(status.online, false);
  assert.strictEqual(await cdb.collection("bills").findOne({ id: offlineBill.id }), null);

  // Meanwhile the owner sells from the same batch on the web
  ok(await web("POST", "/api/bills", { customer_name: "Web Sale", customer_mobile: "9000000003", payment_mode: "Cash", is_paid: true, items: [{ inventory_id: "b-1", product_name: "Dolo 650", batch_no: "D1", quantity: 7, unit_price: 30, purchase_price: 20 }] }), "web bill");

  s.sync.config.cloudUrl = CLOUD;
  s.sync.wake();
  await until(async () => s.sync.online && s.sync.pendingCount() === 0, "back online and sent");
  assert.ok(await cdb.collection("bills").findOne({ id: offlineBill.id }));
  assert.ok(await cdb.collection("customers").findOne({ id: madeOffline.id }));
  // 95 - 10 here - 7 there
  assert.strictEqual((await cdb.collection("inventory").findOne({ id: "b-1" })).available_quantity, 78);
  await until(async () => (await s.db.collection("inventory").findOne({ id: "b-1" })).available_quantity === 78, "local stock agrees");
});

test("a repeated push doesn't apply twice", async () => {
  const token = s.db.getMeta("device_token");
  const id = crypto.randomUUID();
  const body = { changesets: [{ id, changes: JSON.stringify([{ coll: "inventory", key: String((await cdb.collection("inventory").findOne({ id: "b-1" }))._id), op: "upsert", inc: { available_quantity: -1 } }]) }] };
  const headers = { "x-device-token": token };
  const a = ok(await send(CLOUD, "POST", "/api/desktop/sync/push", body, headers), "first");
  const b = ok(await send(CLOUD, "POST", "/api/desktop/sync/push", body, headers), "second");
  assert.strictEqual(a.results[0].result, "applied");
  assert.strictEqual(b.results[0].result, "duplicate");
  assert.strictEqual((await cdb.collection("inventory").findOne({ id: "b-1" })).available_quantity, 77);
});

test("a tampered app still can't do anything the server forbids", async () => {
  const headers = { "x-device-token": s.db.getMeta("device_token") };
  const push = async (change) => (await send(CLOUD, "POST", "/api/desktop/sync/push", { changesets: [{ id: crypto.randomUUID(), changes: JSON.stringify([change]) }] }, headers)).data.results?.[0];
  const myPharmacy = await cdb.collection("pharmacies").findOne({ id: PHARMACY });

  // Make itself free forever
  assert.strictEqual((await push({ coll: "pharmacies", key: String(myPharmacy._id), op: "upsert", set: { subscription: { plan: "AGENTIC", ends_at: "2099-01-01" } } })).result, "conflict");
  assert.strictEqual((await cdb.collection("pharmacies").findOne({ id: PHARMACY })).subscription.plan, "ADVANCED");
  // Promote or take over a login
  const me = await cdb.collection("users").findOne({ id: USER });
  assert.strictEqual((await push({ coll: "users", key: String(me._id), op: "upsert", set: { role: "SUPERADMIN", password_hash: "x" } })).result, "conflict");
  // Credits, payments and collections outside the list
  for (const coll of ["credit_wallets", "payment_orders", "subscriptions", "refresh_tokens", "global_medicines"]) {
    assert.strictEqual((await push({ coll, key: "x", op: "upsert", set: { a: 1 } })).result, "conflict", coll);
  }
  // Another pharmacy's record, by its real id
  const theirs = await cdb.collection("customers").findOne({ id: "c-theirs" });
  assert.strictEqual((await push({ coll: "customers", key: String(theirs._id), op: "upsert", set: { name: "Hacked" } })).result, "conflict");
  assert.strictEqual((await push({ coll: "customers", key: String(theirs._id), op: "delete" })).result, "applied");
  const after = await cdb.collection("customers").findOne({ id: "c-theirs" });
  assert.strictEqual(after.name, "Secret Customer of Another Shop", "delete was scoped to this shop, so nothing happened");
  // Putting a record in another pharmacy, or using Mongo operators
  const mine = await push({ coll: "customers", key: new ObjectId().toHexString(), op: "upsert", set: { id: "c-planted", name: "Planted", pharmacy_id: "ph-other" } });
  assert.strictEqual(mine.result, "applied");
  assert.strictEqual((await cdb.collection("customers").findOne({ id: "c-planted" })).pharmacy_id, PHARMACY);
  assert.strictEqual((await push({ coll: "customers", key: new ObjectId().toHexString(), op: "upsert", set: { name: { $gt: "" } } })).result, "conflict");
  assert.strictEqual((await push({ coll: "inventory", key: new ObjectId().toHexString(), op: "upsert", inc: { mrp: 5 } })).result, "conflict");
  // Dates survive the trip as real dates
  const dated = new ObjectId().toHexString();
  assert.strictEqual((await push({ coll: "customers", key: dated, op: "upsert", set: { id: "c-dated", name: "Dated", at: { $date: 1700000000000 } } })).result, "applied");
  assert.ok((await cdb.collection("customers").findOne({ id: "c-dated" })).at instanceof Date);
  await cdb.collection("customers").deleteOne({ id: "c-dated" });
  // Reading without a device, or as someone else
  assert.strictEqual((await send(CLOUD, "GET", "/api/desktop/sync/pull?cursor=0")).status, 401);
  assert.strictEqual((await send(CLOUD, "GET", "/api/desktop/catalog/page?kind=medicines")).status, 401);
  assert.strictEqual((await send(CLOUD, "GET", "/api/desktop/catalog/page?kind=medicines", undefined, { "x-device-token": "guess" })).status, 401);
  assert.strictEqual((await send(CLOUD, "GET", "/api/desktop/sync/snapshot?coll=credit_wallets", undefined, headers)).status, 400);
  const pulled = (await send(CLOUD, "GET", "/api/desktop/sync/snapshot?coll=customers", undefined, headers)).data.docs;
  assert.ok(!pulled.some((d) => d.pharmacy_id === "ph-other"));
  assert.ok(!(await send(CLOUD, "GET", "/api/desktop/sync/snapshot?coll=users", undefined, headers)).data.docs.some((d) => d.password_hash));
  await cdb.collection("customers").deleteOne({ id: "c-planted" });
});

test("a forged or wound-back licence stops the app", async () => {
  const good = s.db.getMeta("licence");
  const [body, signature] = good.split(".");
  const payload = JSON.parse(Buffer.from(body, "base64url").toString());

  // Extending the date breaks the signature
  const extended = Buffer.from(JSON.stringify({ ...payload, valid_until: Date.now() + 1e12 })).toString("base64url");
  s.db.setMeta("licence", `${extended}.${signature}`);
  assert.strictEqual(s.sync.accessProblem(), "not_signed_in");
  assert.strictEqual((await local("GET", "/api/customers")).status, 403);

  // Signing with a key of one's own doesn't help
  const { privateKey } = crypto.generateKeyPairSync("ed25519");
  s.db.setMeta("licence", `${extended}.${crypto.sign(null, Buffer.from(extended), privateKey).toString("base64url")}`);
  assert.strictEqual(s.sync.accessProblem(), "not_signed_in");

  // Another computer's real licence
  const otherDevice = Buffer.from(JSON.stringify({ ...payload, device_id: "other" })).toString("base64url");
  s.db.setMeta("licence", `${otherDevice}.${signature}`);
  assert.strictEqual(s.sync.accessProblem(), "not_signed_in");

  s.db.setMeta("licence", good);
  assert.strictEqual(s.sync.accessProblem(), null);

  // Setting the clock back
  const seen = s.db.getMeta("last_seen_at");
  s.db.setMeta("last_seen_at", String(Date.now() + 86400000));
  assert.strictEqual(s.sync.accessProblem(), "clock");
  s.db.setMeta("last_seen_at", seen || String(Date.now()));
  assert.strictEqual(s.sync.accessProblem(), null);
});

test("the catalogue downloads, works offline, and is encrypted on disk", async () => {
  await until(() => s.sync.catalogState.state === "ready", "catalogue");
  assert.strictEqual(s.catalog.count("medicines"), 2);
  assert.strictEqual(s.catalog.count("doctors"), 1);
  s.sync.config.cloudUrl = "http://127.0.0.1:9";
  s.sync.wake();
  await until(() => !s.sync.online, "offline");
  const r = ok(await local("GET", "/api/medicines/search?q=azithr"), "search");
  assert.ok(JSON.stringify(r).includes("Azithral 500"), JSON.stringify(r).slice(0, 300));
  assert.ok(!JSON.stringify(r).includes("internal_cost_note"), "fields outside the published list don't ship");
  const doctors = ok(await local("GET", "/api/bills/doctors?search=Meera"), "doctors");
  assert.ok(JSON.stringify(doctors).includes("Meera"), JSON.stringify(doctors).slice(0, 300));
  const suppliers = ok(await local("GET", "/api/suppliers?search=Pune&include_global=true"), "distributors");
  assert.ok(JSON.stringify(suppliers).includes("Pune Pharma"), JSON.stringify(suppliers).slice(0, 300));
  s.sync.config.cloudUrl = CLOUD;
  s.sync.wake();
  await until(() => s.sync.online, "online again");
  s.catalog.db.pragma("wal_checkpoint(TRUNCATE)");
  for (const f of fs.readdirSync(dataDir).filter((x) => x.startsWith("catalog.db"))) {
    assert.ok(!fs.readFileSync(path.join(dataDir, f)).includes("Azithral"), `${f} is readable`);
  }
  assert.ok(!fs.readFileSync(path.join(dataDir, "davadesk.db")).includes("Dolo 650"));
});

test("online features go through the cloud with its usual checks", async () => {
  const r = await local("GET", "/api/billing/status");
  assert.notStrictEqual(r.status, 503, JSON.stringify(r.data));
  assert.notStrictEqual(r.data?.code, "NEEDS_INTERNET");
  await until(() => s.sync.online, "online");
  const plans = await local("GET", "/api/plans");
  assert.strictEqual(plans.status, 200, JSON.stringify(plans.data).slice(0, 200));
});

test("a lapsed subscription stops the app, and unsent work still reaches the cloud", async () => {
  await until(async () => s.sync.pendingCount() === 0, "clear");
  s.sync.config.cloudUrl = "http://127.0.0.1:9";
  s.sync.wake();
  await until(() => !s.sync.online, "offline");
  const late = ok(await local("POST", "/api/customers", { name: "Unsent Before Expiry", mobile: "9555555555" }), "unsent").customer;
  await cdb.collection("pharmacies").updateOne({ id: PHARMACY }, { $set: { subscription: subscription({ ends_at: new Date(Date.now() - 1000).toISOString() }) } });
  s.sync.token = null;
  s.sync.config.cloudUrl = CLOUD;
  s.sync.wake();
  await until(() => s.sync.blocked === "expired", "blocked");
  assert.strictEqual((await local("GET", "/api/customers")).status, 403);
  await until(async () => cdb.collection("customers").findOne({ id: late.id }), "unsent work arrives");
  await cdb.collection("pharmacies").updateOne({ id: PHARMACY }, { $set: { subscription: subscription() } });
  s.sync.wake();
  await until(() => s.sync.accessProblem() === null, "renewed");
  assert.strictEqual((await local("GET", "/api/customers")).status, 200);
});

test("removing the computer, or changing the password, ends its access like a browser session", async () => {
  const devices = ok(await web("GET", "/api/desktop/devices"), "devices").devices;
  assert.strictEqual(devices.length, 1);
  await cdb.collection("users").updateOne({ id: USER }, { $set: { token_version: 1 } });
  s.sync.token = null;
  s.sync.wake();
  await until(() => s.sync.blocked === "revoked", "password change ends it");
  assert.strictEqual((await local("GET", "/api/customers")).status, 403);
  await cdb.collection("users").updateOne({ id: USER }, { $set: { token_version: 0 } });
  ok(await web("DELETE", `/api/desktop/devices/${devices[0].id}`), "remove");
  s.sync.token = null;
  s.sync.wake();
  await until(() => s.sync.blocked === "revoked", "removal ends it");
  const r = await send(CLOUD, "POST", "/api/desktop/session", {}, { "x-device-token": s.db.getMeta("device_token") });
  assert.strictEqual(r.status, 401);
});

test("signing in again, then signing out, removes the shop's data from this computer", async () => {
  const { code, verifier } = await startCode();
  await s.sync.activate({ code, verifier });
  await until(() => s.sync.accessProblem() === null, "signed in again");
  await until(async () => s.sync.pendingCount() === 0, "nothing waiting");
  await s.sync.signOut();
  assert.strictEqual(s.sync.accessProblem(), "not_signed_in");
  assert.strictEqual(await s.db.collection("customers").countDocuments({}), 0);
  assert.strictEqual(await s.db.collection("bills").countDocuments({}), 0);
  assert.strictEqual((await local("GET", "/api/customers")).status, 403);
});
