// Keeps this computer and the cloud the same. Rule: the cloud holds the official
// record, this computer's unsent changes sit on top of it. So changes always go
// up before anything comes down, and a pull is applied only when nothing is
// waiting to be sent.
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");

const BUSY_INTERVAL_MS = 3 * 1000;
const IDLE_INTERVAL_MS = 15 * 1000;
const PUSH_BATCH = 50;
const TOKEN_LIFE_MS = 10 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 30 * 1000;
const CATALOG_REFRESH_MS = 30 * 24 * 60 * 60 * 1000;
const PULL_EVERY_PAGES = 5;
const CLOCK_TOLERANCE_MS = 10 * 60 * 1000;

class CloudError extends Error {
  constructor(status, body) {
    super(body?.detail || `Cloud answered ${status}`);
    this.status = status;
    this.code = body?.code;
  }
}

function verifyLicence(text, publicKeyPem) {
  try {
    const [body, signature] = String(text).split(".");
    const key = crypto.createPublicKey(publicKeyPem);
    if (!crypto.verify(null, Buffer.from(body), key, Buffer.from(signature, "base64url"))) return null;
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

class SyncEngine {
  constructor({ db, config, withWriteLock, collections, catalog, filesRoot, log }) {
    this.db = db;
    this.config = config;
    this.withWriteLock = withWriteLock;
    this.c = collections;
    this.catalog = catalog;
    this.filesRoot = filesRoot;
    this.log = log;
    this.online = false;
    this.phase = "idle";
    this.progress = null;
    this.lastError = null;
    this.blocked = null; // "revoked" | "expired"
    this.events = [];
    this.token = null;
    this.tokenAt = 0;
    this.catalogState = { state: "idle", done: 0, total: 0 };
    this.running = false;
    this.stopped = false;
    this.lastClockCheck = 0;
    // What the cloud couldn't apply as sent, waiting for the shop to decide
    db._db.exec("CREATE TABLE IF NOT EXISTS review (id TEXT PRIMARY KEY, data TEXT NOT NULL, created_at INTEGER NOT NULL)");
    db.onChange(() => this.wake());
    this.resetIfCloudChanged();
    this.useDeviceNo();
  }

  // Bills made here carry this computer's number, so no other computer repeats them
  useDeviceNo() {
    const no = this.meta("device_no");
    if (no) process.env.DAVADESK_BILL_TAG = `D${no}`;
    else delete process.env.DAVADESK_BILL_TAG;
  }

  meta(key) {
    return this.db.getMeta(key);
  }

  // Data from one cloud (say a test copy) must never mix with another's
  resetIfCloudChanged() {
    const previous = this.meta("cloud_url");
    if (previous && previous !== this.config.cloudUrl) {
      this.wipeShopData();
      for (const key of ["device_token", "device_id", "device_no", "licence", "user_id", "pharmacy_id", "last_seen_at", "catalog_done_at", "catalog_after_medicines", "catalog_after_doctors", "catalog_after_distributors"]) {
        this.db._db.prepare("DELETE FROM meta WHERE key = ?").run(key);
      }
      this.catalog?.clear();
    }
    this.db.setMeta("cloud_url", this.config.cloudUrl);
  }

  note(text) {
    this.events.unshift({ at: Date.now(), text });
    this.events.length = Math.min(this.events.length, 30);
  }

  // ---- Licence --------------------------------------------------------------------
  licence() {
    return verifyLicence(this.meta("licence"), this.config.licencePublicKey);
  }

  // Why this computer may not run the app right now, or null
  accessProblem() {
    if (!this.meta("device_token")) return "not_signed_in";
    if (this.blocked) return this.blocked;
    const licence = this.licence();
    if (!licence) return "not_signed_in";
    if (licence.device_id !== this.meta("device_id") || licence.pharmacy_id !== this.meta("pharmacy_id")) return "not_signed_in";
    const now = Date.now();
    // A clock wound back to stretch the licence
    const seen = Number(this.meta("last_seen_at")) || 0;
    if (now < seen - CLOCK_TOLERANCE_MS) return "clock";
    if (now > licence.valid_until) return "licence_expired";
    if (now - this.lastClockCheck > 60 * 1000) {
      this.lastClockCheck = now;
      this.db.setMeta("last_seen_at", String(Math.max(now, seen)));
    }
    if (this.meta("snapshot_done") !== "1") return "first_copy";
    return null;
  }

  // ---- Talking to the cloud ---------------------------------------------------------
  request(method, url, { body, headers = {}, raw = false } = {}) {
    return new Promise((resolve, reject) => {
      if (this.signingOut) return reject(Object.assign(new Error("Signing out"), { network: true }));
      const target = new URL(url, this.config.cloudUrl);
      const lib = target.protocol === "https:" ? https : http;
      const payload = body === undefined ? null : Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body));
      const req = lib.request(
        target,
        {
          method,
          timeout: REQUEST_TIMEOUT_MS,
          headers: {
            ...headers,
            ...(this.meta("device_token") ? { "x-device-token": this.meta("device_token") } : {}),
            ...(payload ? { "content-type": Buffer.isBuffer(body) ? "application/octet-stream" : "application/json", "content-length": payload.length } : {}),
          },
        },
        (res) => {
          const chunks = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () => {
            const text = Buffer.concat(chunks).toString("utf8");
            let data = null;
            try {
              data = JSON.parse(text);
            } catch {}
            if (res.statusCode >= 400) reject(new CloudError(res.statusCode, data));
            else resolve(raw ? text : data);
          });
        }
      );
      req.on("timeout", () => req.destroy(new Error("timed out")));
      req.on("error", (err) => reject(Object.assign(err, { network: true })));
      req.end(payload);
    });
  }

  // First sign-in on this computer, with the code from the browser
  async activate({ code, verifier }) {
    const out = await this.request("POST", "/api/desktop/token", { body: { code, code_verifier: verifier } });
    const licence = verifyLicence(out.licence, this.config.licencePublicKey);
    if (!licence) throw new Error("The server's answer couldn't be verified.");
    const previous = this.meta("pharmacy_id");
    if (previous && previous !== licence.pharmacy_id) {
      if (this.pendingCount() > 0) throw new Error("This computer still has unsent work from another pharmacy. Connect that account first.");
      this.wipeShopData();
    }
    this.db.setMeta("device_token", out.device_token);
    this.db.setMeta("device_id", out.device_id);
    // A new sign-in is a new computer on the account, with a number of its own
    this.db._db.prepare("DELETE FROM meta WHERE key = 'device_no'").run();
    this.useDeviceNo();
    this.db.setMeta("licence", out.licence);
    this.db.setMeta("pharmacy_id", licence.pharmacy_id);
    this.db.setMeta("user_id", licence.user_id);
    this.blocked = null;
    this.token = null;
    this.note("Signed in");
    this.wake();
  }

  async signOut({ force = false } = {}) {
    if (!force && this.pendingCount() > 0) throw new Error(`${this.pendingCount()} changes haven't reached the cloud yet. Connect to the internet first, so nothing is lost.`);
    // Stops any sync in progress, so nothing arrives after the wipe
    this.signingOut = true;
    for (let i = 0; this.running && i < 100; i++) await new Promise((r) => setTimeout(r, 100));
    this.signingOut = false;
    // Best effort: offline, the computer simply stays listed until removed in Settings
    await this.request("POST", "/api/desktop/sign-out", { body: {} }).catch(() => {});
    await this.withWriteLock(async () => this.wipeShopData());
    for (const key of ["device_token", "device_id", "device_no", "licence", "user_id", "pharmacy_id"]) this.db._db.prepare("DELETE FROM meta WHERE key = ?").run(key);
    this.useDeviceNo();
    this.token = null;
    this.blocked = null;
    this.online = false;
    this.note("Signed out");
  }

  // Removes everything from this account on this computer
  wipeShopData() {
    const database = this.db._db;
    database.exec("DELETE FROM docs; DELETE FROM idx; DELETE FROM outbox; DELETE FROM review;");
    for (const key of ["snapshot_done", "cursor"]) database.prepare("DELETE FROM meta WHERE key = ?").run(key);
    if (this.filesRoot) fs.rmSync(this.filesRoot, { recursive: true, force: true });
  }

  async cloudToken() {
    if (this.token && Date.now() - this.tokenAt < TOKEN_LIFE_MS) return this.token;
    const out = await this.request("POST", "/api/desktop/session", { body: {} });
    this.token = out.token;
    this.tokenAt = Date.now();
    if (verifyLicence(out.licence, this.config.licencePublicKey)) this.db.setMeta("licence", out.licence);
    if (Number.isInteger(out.device_no) && out.device_no > 0 && this.meta("device_no") !== String(out.device_no)) {
      this.db.setMeta("device_no", String(out.device_no));
      this.useDeviceNo();
    }
    this.blocked = null;
    return this.token;
  }

  // ---- Outbox --------------------------------------------------------------------------
  pendingCount() {
    return this.db._db.prepare("SELECT count(*) AS n FROM outbox WHERE status = 'pending'").get().n;
  }

  pendingByCollection() {
    return this.db._db
      .prepare("SELECT json_extract(value, '$.coll') AS coll, count(*) AS n FROM outbox, json_each(outbox.changes) WHERE status = 'pending' GROUP BY coll ORDER BY n DESC")
      .all();
  }

  conflicts() {
    return this.db._db
      .prepare("SELECT seq, detail, created_at, changes FROM outbox WHERE status = 'conflict' ORDER BY seq DESC LIMIT 50")
      .all()
      .map((r) => ({ seq: r.seq, detail: r.detail, created_at: r.created_at, records: JSON.parse(r.changes).map((c) => c.coll) }));
  }

  retryConflict(seq) {
    this.db._db.prepare("UPDATE outbox SET status = 'pending', detail = NULL WHERE seq = ? AND status = 'conflict'").run(seq);
    this.wake();
  }

  // Drops a change the cloud refused, and puts the cloud's copy of its records back here
  async discardConflict(seq) {
    const row = this.db._db.prepare("SELECT changes FROM outbox WHERE seq = ? AND status = 'conflict'").get(seq);
    if (!row) return;
    const items = [...new Map(JSON.parse(row.changes).map((c) => [`${c.coll}:${c.key}`, { coll: c.coll, key: c.key }])).values()];
    const { docs } = await this.request("POST", "/api/desktop/sync/docs", { body: { items } });
    await this.withWriteLock(async () => {
      this.db._db.transaction(() => {
        for (const d of docs) {
          const col = this.db.collection(d.coll);
          if (d.doc) col._putRaw(reviveDoc(d.doc));
          else col._deleteRaw(d.key);
        }
        this.db._db.prepare("DELETE FROM outbox WHERE seq = ?").run(seq);
      })();
    });
    this.db._emit();
  }

  // ---- Review: changes the cloud held back ----------------------------------------------
  // Kinds: edited (someone else changed the same fields), deleted (the record was
  // deleted elsewhere), changed_before_delete (deleted here, but changed elsewhere),
  // stock_short (more sold than the batch had), duplicate_bill_no.
  recordReview(items) {
    const database = this.db._db;
    for (const item of items) {
      const local = this.db.collection(item.coll)._getRaw(item.key);
      const existing = database.prepare("SELECT id, data FROM review").all().map((r) => ({ id: r.id, ...JSON.parse(r.data) })).find((r) => r.kind === item.kind && r.coll === item.coll && r.key === item.key);
      const data = { ...item, title: titleOf(item.coll, local), snapshot: local ? JSON.parse(require("./docdb/values").encode(local)) : existing?.snapshot || null };
      if (existing && item.kind === "edited") {
        // A later change to the same field replaces "mine"; the cloud's value stays the first one seen
        const fields = { ...existing.fields };
        for (const [f, v] of Object.entries(item.fields)) fields[f] = { mine: v.mine, cloud: fields[f]?.cloud ?? v.cloud };
        data.fields = fields;
      }
      if (existing && item.kind === "stock_short") data.short = (existing.short || 0) + item.short;
      if (existing) database.prepare("UPDATE review SET data = ? WHERE id = ?").run(JSON.stringify(data), existing.id);
      else database.prepare("INSERT INTO review (id, data, created_at) VALUES (?, ?, ?)").run(crypto.randomUUID(), JSON.stringify(data), Date.now());
    }
    if (items.length) this.note(`${items.length} change${items.length === 1 ? " needs" : "s need"} your review`);
  }

  reviews() {
    return this.db._db
      .prepare("SELECT id, data, created_at FROM review ORDER BY created_at DESC LIMIT 100")
      .all()
      .map((r) => {
        const { snapshot, ...data } = JSON.parse(r.data);
        return { id: r.id, created_at: r.created_at, can_restore: !!snapshot, ...data };
      });
  }

  // The shop's decision on one review item. Runs inside a write request, so any
  // change made here is sent to the cloud like any other.
  resolveReview(id, choice, { quantity } = {}) {
    const row = this.db._db.prepare("SELECT data FROM review WHERE id = ?").get(id);
    if (!row) throw Object.assign(new Error("Already resolved"), { status: 404 });
    const item = JSON.parse(row.data);
    const col = this.db.collection(item.coll);
    const send = (change) => (this.db._capture ? this.db._capture.push(change) : this.db._outboxAdd([change]));
    const decode = (obj) => require("./docdb/values").decode(JSON.stringify(obj));
    const putLocal = (fields) => {
      const doc = col._getRaw(item.key);
      if (doc) col._putRaw({ ...doc, ...decode(fields) });
    };
    const pick = (side) => Object.fromEntries(Object.entries(item.fields).map(([f, v]) => [f, v[side]]));
    const valid = {
      edited: ["mine", "cloud"],
      deleted: item.snapshot ? ["restore", "accept"] : ["accept"],
      changed_before_delete: ["delete", "keep"],
      stock_short: ["count", "ok"],
      duplicate_bill_no: ["ok"],
    }[item.kind];
    if (!valid?.includes(choice)) throw Object.assign(new Error("That choice isn't available here"), { status: 400 });

    if (choice === "mine") {
      // Sent with the cloud's value as the starting point: applied unless it changed yet again
      send({ coll: item.coll, key: item.key, op: "upsert", set: pick("mine"), inc: {}, unset: [], was: pick("cloud") });
      putLocal(pick("mine"));
    } else if (choice === "cloud") {
      putLocal(pick("cloud"));
    } else if (choice === "restore") {
      const { _id, ...fields } = item.snapshot;
      send({ coll: item.coll, key: item.key, op: "upsert", new: true, set: fields, ...(fields.id ? { ref: String(fields.id) } : {}) });
      col._putRaw(decode(item.snapshot));
    } else if (choice === "accept" || choice === "delete") {
      if (choice === "delete") send({ coll: item.coll, key: item.key, op: "delete" });
      col._deleteRaw(item.key);
    } else if (choice === "count") {
      const n = Number(quantity);
      if (!Number.isFinite(n) || n < 0) throw Object.assign(new Error("Enter the count on the shelf"), { status: 400 });
      // A shelf count is a fact, not a difference: it replaces whatever the record says
      send({ coll: item.coll, key: item.key, op: "upsert", set: { available_quantity: n }, inc: {}, unset: [], force: true });
      putLocal({ available_quantity: n });
    }
    this.db._db.prepare("DELETE FROM review WHERE id = ?").run(id);
    this.db._emit();
  }

  async push() {
    const total = this.pendingCount();
    if (!total) return;
    this.phase = "pushing";
    let done = 0;
    for (;;) {
      const rows = this.db._db.prepare("SELECT seq, id, changes FROM outbox WHERE status = 'pending' ORDER BY seq LIMIT ?").all(PUSH_BATCH);
      if (!rows.length) break;
      this.progress = { label: "Sending changes to the cloud", done, total: Math.max(total, done + rows.length) };
      const changesets = rows.map((r) => ({ id: r.id, changes: r.changes }));
      const { results } = await this.request("POST", "/api/desktop/sync/push", { body: { changesets } });
      for (const result of results) {
        const row = rows.find((r) => r.id === result.id);
        if (result.result === "conflict") {
          this.db._db.prepare("UPDATE outbox SET status = 'conflict', detail = ? WHERE seq = ?").run(String(result.detail || "Refused"), row.seq);
          this.note(`A record needs review: ${result.detail}`);
        } else {
          await this.sendFilesFor(JSON.parse(row.changes));
          // Read before the next pull replaces this computer's copy of those records.
          // Under the write lock, so no request's rollback can take the review with it.
          await this.withWriteLock(async () => {
            this.db._db.transaction(() => {
              if (result.review?.length) this.recordReview(result.review);
              this.db._db.prepare("DELETE FROM outbox WHERE seq = ?").run(row.seq);
            })();
          });
        }
        done++;
        this.progress = { label: "Sending changes to the cloud", done, total: Math.max(total, done) };
      }
    }
    this.db.setMeta("last_push_at", String(Date.now()));
    this.note(`Sent ${done} change${done === 1 ? "" : "s"} to the cloud`);
  }

  // Prescriptions saved while offline travel with their record
  async sendFilesFor(changes) {
    for (const change of changes) {
      const key = change.coll === "bill_prescriptions" ? change.set?.s3_key : null;
      if (!key || !this.filesRoot) continue;
      const file = path.join(this.filesRoot, "private", key);
      if (fs.existsSync(file)) await this.request("POST", `/api/desktop/sync/file?key=${encodeURIComponent(key)}`, { body: fs.readFileSync(file) });
    }
  }

  // ---- First copy ------------------------------------------------------------------------
  async firstCopy() {
    this.phase = "copying";
    await this.withWriteLock(async () => {
      if (this.pendingCount() === 0) {
        for (const coll of this.c.ALL) this.db.collection(coll).drop();
      }
    });
    const { collections, cursor } = await this.request("GET", "/api/desktop/sync/manifest");
    const total = Object.values(collections).reduce((a, b) => a + b, 0);
    let done = 0;
    for (const coll of this.c.ALL) {
      let after = "";
      for (;;) {
        this.progress = { label: "Getting your shop's data", done, total };
        const page = await this.request("GET", `/api/desktop/sync/snapshot?coll=${coll}${after ? `&after=${encodeURIComponent(after)}` : ""}`);
        await this.withWriteLock(async () => this.applyDocs(coll, page.docs));
        done += page.docs.length;
        if (page.done || !page.docs.length) break;
        after = page.docs[page.docs.length - 1]._id;
      }
    }
    this.db.setMeta("cursor", String(cursor));
    this.db.setMeta("snapshot_done", "1");
    this.note(`Copied ${done} records from the cloud`);
  }

  applyDocs(coll, docs) {
    const col = this.db.collection(coll);
    this.db._db.transaction(() => {
      for (const encoded of docs) col._putRaw(reviveDoc(encoded));
    })();
    if (docs.length) this.db._emit();
  }

  // ---- From the cloud -----------------------------------------------------------------------
  async pull() {
    for (;;) {
      const cursor = this.meta("cursor") || "0";
      const page = await this.request("GET", `/api/desktop/sync/pull?cursor=${cursor}`);
      if (page.reset) {
        // Away longer than the cloud keeps its log: unsent work goes first, then a fresh copy
        this.db._db.prepare("DELETE FROM meta WHERE key = 'snapshot_done'").run();
        this.note("Refreshing this computer's copy from the cloud");
        return;
      }
      if (page.changes.length) this.phase = "pulling";
      const applied = await this.withWriteLock(async () => {
        if (this.pendingCount() > 0) return false; // New local work: send it first
        const database = this.db._db;
        database.transaction(() => {
          for (const change of page.changes) {
            if (!this.c.ALL.includes(change.coll)) continue;
            const col = this.db.collection(change.coll);
            if (change.op === "delete") col._deleteRaw(change.key);
            else col._putRaw(reviveDoc(change.doc));
          }
          this.db.setMeta("cursor", String(page.cursor));
        })();
        return true;
      });
      if (!applied) return;
      if (page.changes.length) this.note(`Received ${page.changes.length} update${page.changes.length === 1 ? "" : "s"} from the cloud`);
      if (!page.more) return;
    }
  }

  // ---- Offline catalogue ---------------------------------------------------------------------
  async downloadCatalog() {
    if (!this.catalog) return;
    const finished = Number(this.meta("catalog_done_at")) || 0;
    if (finished && Date.now() - finished < CATALOG_REFRESH_MS) {
      this.catalogState.state = "ready";
      return;
    }
    const { catalogs } = await this.request("GET", "/api/desktop/catalog/manifest");
    const total = Object.values(catalogs).reduce((a, b) => a + b, 0);
    this.catalogState = { state: "downloading", done: 0, total };
    let pages = 0;
    for (const kind of Object.keys(catalogs)) {
      let after = this.meta(`catalog_after_${kind}`) || "";
      if (after === "done") {
        this.catalogState.done += catalogs[kind];
        continue;
      }
      for (;;) {
        const page = await this.request("GET", `/api/desktop/catalog/page?kind=${kind}${after ? `&after=${encodeURIComponent(after)}` : ""}`);
        this.catalog.addPage(kind, page.docs.map(reviveDoc));
        this.catalogState.done += page.docs.length;
        if (page.docs.length) after = String(page.docs[page.docs.length - 1]._id);
        this.db.setMeta(`catalog_after_${kind}`, page.done ? "done" : after);
        if (page.done) break;
        // Bills and web changes keep flowing during a long download
        if (this.pendingCount() > 0) await this.push();
        if (++pages % PULL_EVERY_PAGES === 0) await this.pull();
        if (this.stopped) return;
      }
    }
    for (const kind of Object.keys(catalogs)) this.db._db.prepare("DELETE FROM meta WHERE key = ?").run(`catalog_after_${kind}`);
    this.db.setMeta("catalog_done_at", String(Date.now()));
    this.catalogState.state = "ready";
    this.note("Medicine catalogue ready for offline search");
  }

  // ---- The loop ---------------------------------------------------------------------------------
  async cycle() {
    if (!this.meta("device_token")) {
      this.online = false;
      this.phase = "idle";
      return;
    }
    try {
      // Unsent work is sent even when the subscription has lapsed: it's the shop's data
      try {
        await this.cloudToken();
      } catch (err) {
        if (err.status === 403 && err.code === "SUBSCRIPTION_EXPIRED") {
          this.blocked = "expired";
          this.token = null;
          this.online = true;
          await this.push();
          this.phase = "idle";
          this.progress = null;
          return;
        }
        throw err;
      }
      this.online = true;
      this.lastError = null;
      await this.push();
      if (this.meta("snapshot_done") !== "1") await this.firstCopy();
      await this.pull();
      await this.push();
      this.db.setMeta("last_sync_at", String(Date.now()));
      this.phase = "idle";
      this.progress = null;
      if (this.catalogState.state !== "ready") await this.downloadCatalog();
    } catch (err) {
      this.phase = "idle";
      this.progress = null;
      if (err.status === 401) {
        // The account ended this sign-in: same as a browser session being ended
        this.blocked = "revoked";
        this.online = true;
        this.token = null;
        this.note("This computer's sign-in has ended");
        return;
      }
      if (err.network) {
        if (this.online) this.note("Internet connection lost. Working offline");
        this.online = false;
        this.token = null;
      } else {
        this.lastError = err.message;
        this.log.warn("[Sync]", err.message);
      }
      if (this.catalogState.state === "downloading") this.catalogState.state = "paused";
    }
  }

  wake() {
    if (this.wakeTimer) return;
    this.wakeTimer = setTimeout(() => {
      this.wakeTimer = null;
      this.run();
    }, 400);
    this.wakeTimer.unref?.();
  }

  async run() {
    if (this.running || this.stopped) {
      if (this.running) this.again = true;
      return;
    }
    this.running = true;
    clearTimeout(this.timer);
    do {
      this.again = false;
      await this.cycle();
    } while (this.again && !this.stopped);
    this.running = false;
    if (this.stopped) return;
    this.timer = setTimeout(() => this.run(), this.pendingCount() > 0 ? BUSY_INTERVAL_MS : IDLE_INTERVAL_MS);
    this.timer.unref?.();
  }

  start() {
    this.run();
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    clearTimeout(this.wakeTimer);
  }

  // Sends waiting work before a feature that reads it from the cloud
  async flush(waitMs = 15000) {
    const end = Date.now() + waitMs;
    this.wake();
    while (this.pendingCount() > 0 && Date.now() < end) await new Promise((r) => setTimeout(r, 200));
  }

  status() {
    const licence = this.licence();
    return {
      online: this.online,
      phase: this.phase,
      progress: this.progress,
      pending: this.pendingCount(),
      pending_by_collection: this.pendingByCollection(),
      conflicts: this.conflicts(),
      reviews: this.reviews(),
      last_sync_at: Number(this.meta("last_sync_at")) || null,
      last_error: this.lastError,
      access_problem: this.accessProblem(),
      // First setup waits for the catalogue, unless the user chooses to carry on
      setup_pending: !this.meta("catalog_done_at") && this.meta("catalog_skip") !== "1",
      licence_valid_until: licence?.valid_until || null,
      plan: licence?.plan || null,
      catalog: this.catalogState,
      events: this.events.slice(0, 15),
    };
  }
}

// A name the shop recognises a record by
function titleOf(coll, doc) {
  if (!doc) return null;
  if (coll === "inventory") return [doc.product_name, doc.batch_no && `batch ${doc.batch_no}`].filter(Boolean).join(", ") || null;
  if (coll === "bills" || coll === "purchases") return doc.bill_no || doc.invoice_no || doc.purchase_no || null;
  return doc.name || doc.product_name || doc.supplier_name || doc.customer_name || doc.title || null;
}

function reviveDoc(encoded) {
  return require("./docdb/values").decode(JSON.stringify(encoded));
}

module.exports = { SyncEngine, verifyLicence };
