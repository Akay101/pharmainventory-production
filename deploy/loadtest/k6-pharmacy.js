// k6 load test: a pharmacy counter's day, compressed.
// Each virtual user (VU) logs in once, then loops: search medicines while
// billing, check stock, open lists, make a bill, now and then a purchase.
//   BASE=http://127.0.0.1:8090/api USERS=40 k6 run k6-pharmacy.js
import http from "k6/http";
import { check, sleep, group } from "k6";
import { Trend, Rate } from "k6/metrics";

const BASE = __ENV.BASE || "http://127.0.0.1:8090/api";
const ACCOUNTS = Number(__ENV.ACCOUNTS || 20);
const THINK = Number(__ENV.THINK || 1); // seconds between actions (1 = fast typist; real counters are slower)

export const options = {
  scenarios: {
    ramp: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: (__ENV.STAGES || "1m:20,2m:20,1m:60,2m:60,1m:120,2m:120,1m:0")
        .split(",")
        .map((s) => ({ duration: s.split(":")[0], target: Number(s.split(":")[1]) })),
      gracefulRampDown: "20s",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    "http_req_duration{kind:read}": ["p(95)<800"],
    "http_req_duration{kind:write}": ["p(95)<1500"],
  },
  summaryTrendStats: ["avg", "med", "p(90)", "p(95)", "p(99)", "max"],
};

const searchT = new Trend("t_search", true);
const billT = new Trend("t_bill_create", true);
const ok = new Rate("ok_business");
const TERMS = ["dolo", "paracetamol", "azithro", "pan 40", "amox", "cetirizine", "metformin", "atorva", "telma", "crocin", "vitamin", "omez", "augmentin", "calpol", "montair"];

export function setup() {
  const tokens = [];
  for (let i = 1; i <= ACCOUNTS; i++) {
    const r = http.post(`${BASE}/auth/login`, JSON.stringify({ email: `load${i}@loadtest.local`, password: "LoadTest@123" }), { headers: { "Content-Type": "application/json" } });
    if (r.status === 200) tokens.push(r.json("token"));
  }
  if (!tokens.length) throw new Error("no load test accounts could log in");
  return { tokens };
}

export default function (data) {
  const token = data.tokens[(__VU - 1) % data.tokens.length];
  const h = { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } };
  const R = { ...h, tags: { kind: "read" } };
  const W = { ...h, tags: { kind: "write" } };
  const term = TERMS[Math.floor(Math.random() * TERMS.length)];

  group("billing search", () => {
    // Typing in the billing search: suggestions as the term grows, then full search
    for (const n of [3, 5]) {
      const r = http.get(`${BASE}/medicines/search-suggestions?q=${encodeURIComponent(term.slice(0, n))}&limit=10`, { ...R, tags: { kind: "read", name: "suggestions" } });
      searchT.add(r.timings.duration);
      ok.add(r.status === 200);
    }
    const s = http.get(`${BASE}/medicines/search?q=${encodeURIComponent(term)}&limit=20`, { ...R, tags: { kind: "read", name: "medicine search" } });
    searchT.add(s.timings.duration);
    ok.add(check(s, { "search 200": (r) => r.status === 200 }));
  });
  sleep(THINK);

  let batch = null;
  group("stock", () => {
    const r = http.get(`${BASE}/inventory/search?q=${encodeURIComponent(term.slice(0, 4))}`, { ...R, tags: { kind: "read", name: "inventory search" } });
    ok.add(r.status === 200);
    try {
      const body = r.json();
      const list = body.results || body.inventory || body;
      const withStock = (Array.isArray(list) ? list : []).flatMap((x) => x.batches || [x]).filter((b) => (b.available_quantity || 0) > 5);
      batch = withStock[Math.floor(Math.random() * withStock.length)] || null;
    } catch {}
  });
  sleep(THINK);

  group("bill", () => {
    if (!batch) return;
    const r = http.post(
      `${BASE}/bills`,
      JSON.stringify({
        customer_name: "Walk-in",
        payment_mode: "Cash",
        is_paid: true,
        items: [{ product_name: batch.product_name, inventory_id: batch.id || batch.inventory_id, batch_no: batch.batch_no, quantity: 1, unit_price: batch.mrp_per_unit || batch.mrp || 5, units_per_pack: batch.units_per_pack || 10 }],
      }),
      { ...W, tags: { kind: "write", name: "create bill" } }
    );
    billT.add(r.timings.duration);
    ok.add(check(r, { "bill created": (x) => x.status === 201 || x.status === 200 }));
  });
  sleep(THINK);

  // Every few loops: dashboards and lists (heavier aggregations)
  if (Math.random() < 0.3) {
    group("lists", () => {
      ok.add(http.get(`${BASE}/dashboard/stats`, { ...R, tags: { kind: "read", name: "dashboard" } }).status === 200);
      ok.add(http.get(`${BASE}/bills?page=1&limit=20`, { ...R, tags: { kind: "read", name: "bills list" } }).status === 200);
      ok.add(http.get(`${BASE}/inventory?page=1&limit=50`, { ...R, tags: { kind: "read", name: "inventory list" } }).status === 200);
      ok.add(http.get(`${BASE}/purchases?page=1&limit=20`, { ...R, tags: { kind: "read", name: "purchases list" } }).status === 200);
    });
    sleep(THINK);
  }

  if (Math.random() < 0.05) {
    group("purchase", () => {
      const tag = `${__VU}-${__ITER}-${Date.now() % 100000}`;
      const r = http.post(
        `${BASE}/purchases`,
        JSON.stringify({
          supplier_name: `Load Supplier ${__VU % 5}`,
          invoice_no: `LT-${tag}`,
          purchase_date: "2026-10-25",
          payment_status: "Paid",
          payment_mode: "Cash",
          items: [{ product_name: `${term} load ${__VU % 7}`, batch_no: `B${tag}`, expiry_date: "2028-06-30", pack_quantity: 10, units_per_pack: 10, pack_price: 40, mrp_per_unit: 6 }],
        }),
        { ...W, tags: { kind: "write", name: "create purchase" } }
      );
      ok.add(check(r, { "purchase saved": (x) => x.status === 201 || x.status === 200 }));
    });
  }
  sleep(THINK);
}
