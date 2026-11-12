// Which permission each API route needs. Checked centrally by the auth
// middleware on every request, so no route can forget it.
//
// For each mount: an ordered list of rules [methods, path, need, restrict?].
//   methods: "*" or "GET,POST"   path: RegExp on the path inside the mount
//   need:    "ANY" (any signed-in user) or a list of [module, action] pairs,
//            any one of which is enough
//   restrict: restriction keys that block the request when set for the user
// A request no rule matches falls back to the mount's module with the action
// from its method (GET read, POST create, PUT/PATCH update, DELETE delete).
// Mounts not listed here are refused for users without full access.
const { can, restriction } = require("./permissions");

// `when(req)`: the restrictions apply only when it returns true
const R = (methods, path, need, restrict = [], when = null) => ({ methods: methods === "*" ? null : methods.split(","), path, need, restrict, when });
const STOCK_FIELDS = ["quantity", "available_quantity", "pack_quantity", "loose_quantity", "stock"];
const touchesStock = (req) => !!req?.body && typeof req.body === "object" && STOCK_FIELDS.some((f) => f in req.body);
const ALL = /^\/.*/;

// Reading stock / customers / suppliers is part of making bills and purchases
const STOCK_LOOKUP = [["inventory", "read"], ["billing", "create"], ["billing", "update"], ["purchases", "create"], ["purchases", "update"], ["returns", "create"], ["expiry", "create"], ["short_book", "create"], ["restock", "create"]];
const CUSTOMER_LOOKUP = [["customers", "read"], ["billing", "create"], ["billing", "update"], ["restock", "create"]];
const SUPPLIER_LOOKUP = [["suppliers", "read"], ["purchases", "create"], ["purchases", "update"], ["returns", "create"], ["expiry", "create"], ["short_book", "create"]];

const MOUNTS = {
  "/api/auth": { rules: [R("*", ALL, "ANY")] },
  "/api/sessions": { rules: [R("*", ALL, "ANY")] },
  "/api/account": { rules: [R("*", ALL, "ANY")] },
  "/api/billing": { rules: [R("*", ALL, "ANY")] },
  "/api/notifications": { rules: [R("*", ALL, "ANY")] },
  "/api/support": { rules: [R("*", ALL, "ANY")] },
  "/api/broadcasts": { rules: [R("*", ALL, "ANY")] },
  "/api/credits": { rules: [R("GET", ALL, "ANY"), R("POST", /^\/checkout/, "ANY"), R("*", ALL, [["assistant", "read"]])] },
  "/api/medicines": { rules: [R("GET", ALL, "ANY"), R("*", ALL, [["inventory", "create"], ["inventory", "update"], ["purchases", "create"]])] },
  "/api/pharmacy": { rules: [R("GET", ALL, "ANY"), R("*", ALL, [["settings", "update"]])] },
  "/api/settings": {
    rules: [R("POST", /^\/(request-lock-otp|verify-and-update-lock)/, [["settings", "update"]]), R("*", ALL, "ANY")],
  },
  "/api/users": {
    // Team management itself is owner/admin-only in the routes
    rules: [R("*", ALL, "ANY")],
  },
  "/api/desktop": {
    rules: [R("DELETE", /^\/devices\//, [["settings", "update"]]), R("*", ALL, "ANY")],
  },
  "/api/assistant": { module: "assistant", rules: [R("*", ALL, [["assistant", "read"]])] },
  "/api/dashboard": { module: "dashboard", rules: [R("GET", /^\/ai-tips/, [["assistant", "read"], ["dashboard", "read"]]), R("*", ALL, [["dashboard", "read"]])] },
  "/api/activities": { module: "activities", rules: [R("*", ALL, [["activities", "read"]])] },
  "/api/bills": {
    module: "billing",
    rules: [
      R("*", /^\/drafts(\/|$)/, [["billing", "create"], ["billing", "update"]]),
      R("POST", /^\/prescriptions\/?$/, [["billing", "create"], ["billing", "update"]]),
      R("POST", /^\/(match-inventory|scan-product|doctors\/ensure-global)\/?$/, [["billing", "create"], ["billing", "update"]]),
      R("GET", /^\/doctors/, [["billing", "read"], ["billing", "create"]]),
      R("POST", /^\/[^/]+\/(pdf|email)\/?$/, [["billing", "read"]]),
      R("*", /^\/[^/]+\/share\/?$/, [["billing", "read"]]),
      R("POST", /^\/[^/]+\/(mark-paid|record-payment)\/?$/, [["billing", "update"]], ["no_customer_debt_clear"]),
      R("POST", /^\/[^/]+\/update-delivery\/?$/, [["billing", "update"]]),
    ],
  },
  "/api/purchases": {
    module: "purchases",
    rules: [
      R("*", /^\/drafts(\/|$)/, [["purchases", "create"], ["purchases", "update"]]),
      R("POST", /^\/(match-suggestions|scan-image|scan-bill|parse-csv|csv-columns|csv|bulk-import)\/?$/, [["purchases", "create"]]),
      R("GET", /^\/scan-status\//, [["purchases", "create"]]),
      R("GET", /^\/(product-history|price-history)/, [["purchases", "read"], ["billing", "create"], ["inventory", "read"]]),
      R("POST", /^\/[^/]+\/(pdf|labels)\/?$/, [["purchases", "read"], ["inventory", "read"]]),
      R("POST", /^\/[^/]+\/payments\/?$/, [["purchases", "update"], ["suppliers", "update"]], ["no_supplier_payments"]),
    ],
  },
  "/api/inventory": {
    module: "inventory",
    rules: [
      R("GET", ALL, STOCK_LOOKUP),
      R("PATCH", /^\/[^/]+\/add-quantity\/?$/, [["inventory", "update"]], ["no_stock_edit"]),
      R("POST", /^\/merge\/?$/, [["inventory", "update"]], ["no_stock_edit"]),
      R("PUT", /^\/threshold\/?$/, [["inventory", "update"]]),
      R("PUT", /^\/[^/]+\/?$/, [["inventory", "update"]], ["no_stock_edit"], touchesStock),
    ],
  },
  "/api/products": {
    module: "inventory",
    rules: [
      R("GET", ALL, STOCK_LOOKUP),
      R("POST", /^\/?$/, [["inventory", "create"], ["purchases", "create"]]),
      R("POST", /^\/bulk-delete\/?$/, [["inventory", "delete"]]),
    ],
  },
  "/api/customers": {
    module: "customers",
    rules: [
      R("GET", /^\/[^/]+\/unpaid-bills\/?$/, [["customers", "read"], ["billing", "update"]]),
      R("GET", ALL, CUSTOMER_LOOKUP),
      R("POST", /^\/?$/, [["customers", "create"], ["billing", "create"]]),
      R("POST", /^\/[^/]+\/clear-debt\/?$/, [["customers", "update"]], ["no_customer_debt_clear"]),
      R("PUT", /^\/tiers\/config\/?$/, [["customers", "update"]]),
    ],
  },
  "/api/suppliers": {
    module: "suppliers",
    rules: [
      R("GET", ALL, SUPPLIER_LOOKUP),
      R("POST", /^\/(ensure-global)?\/?$/, [["suppliers", "create"], ["purchases", "create"]]),
      R("POST", /^\/[^/]+\/(pay-all|pay-part)\/?$/, [["suppliers", "update"]], ["no_supplier_payments"]),
      R("POST", /^\/merge-preview\/?$/, [["suppliers", "read"]]),
      R("POST", /^\/merge\/?$/, [["suppliers", "update"]]),
      R("*", /^\/[^/]+\/csv-template\/?$/, [["suppliers", "update"], ["purchases", "create"]]),
    ],
  },
  "/api/returns": {
    module: "returns",
    rules: [
      R("GET", ALL, [["returns", "read"]]),
      R("POST", /^\/[^/]+\/payments\/?$/, [["returns", "update"]], ["no_supplier_payments"]),
      R("POST", /^\/(move-batch|restore-batch)\/?$/, [["returns", "create"]]),
    ],
  },
  "/api/expiry": {
    module: "expiry",
    rules: [
      R("GET", ALL, [["expiry", "read"]]),
      R("POST", /^\/[^/]+\/payments\/?$/, [["expiry", "update"]], ["no_supplier_payments"]),
      R("POST", /^\/(move-batch|restore-batch)\/?$/, [["expiry", "create"]]),
    ],
  },
  "/api/reminders": {
    module: "restock",
    rules: [R("POST", /^\/[^/]+\/purchase-draft\/?$/, [["purchases", "create"]]), R("POST", /^\/check-due\/?$/, [["restock", "read"]])],
  },
  "/api/shortbook": { module: "short_book", rules: [] },
  "/api/imports": { module: "imports", rules: [R("GET", ALL, [["imports", "read"]]), R("*", ALL, [["imports", "create"]])] },
  "/api/migrate": { module: "imports", rules: [R("GET", ALL, [["imports", "read"]]), R("*", ALL, [["imports", "create"]])] },
};

const METHOD_ACTION = { GET: "read", HEAD: "read", POST: "create", PUT: "update", PATCH: "update", DELETE: "delete" };

// Decide one request. Returns null when allowed, or { code, detail, need }.
function decide(eff, { method, baseUrl, path, req = null }) {
  if (!eff || eff.full) return null;
  const mount = MOUNTS[baseUrl];
  if (!mount) return { code: "PERMISSION_DENIED", detail: "You don't have access to this. Ask the pharmacy owner." };
  const m = String(method || "GET").toUpperCase();
  const p = path || "/";
  let rule = mount.rules.find((r) => (!r.methods || r.methods.includes(m)) && r.path.test(p));
  if (!rule) {
    if (!mount.module) return { code: "PERMISSION_DENIED", detail: "You don't have access to this. Ask the pharmacy owner." };
    rule = { need: [[mount.module, METHOD_ACTION[m] || "update"]], restrict: [] };
  }
  if (rule.need !== "ANY" && !rule.need.some(([mod, act]) => can(eff, mod, act))) {
    const [mod, act] = rule.need[0];
    return { code: "PERMISSION_DENIED", detail: `You don't have permission to ${act === "read" ? "view" : act} ${labelOf(mod)}. Ask the pharmacy owner for access.`, need: rule.need };
  }
  if (rule.when && !rule.when(req)) return null;
  for (const key of rule.restrict || []) {
    if (restriction(eff, key)) return { code: "ACTION_BLOCKED", detail: blockedText(key), restriction: key };
  }
  return null;
}

const LABELS = {
  dashboard: "reports",
  billing: "bills",
  purchases: "purchases",
  inventory: "inventory",
  customers: "customers",
  suppliers: "suppliers",
  returns: "returns",
  expiry: "expiry",
  short_book: "the short book",
  restock: "reminders",
  assistant: "DavaDesk AI",
  imports: "data import",
  settings: "pharmacy settings",
  activities: "the activity log",
};
const labelOf = (m) => LABELS[m] || m;

const BLOCKED = {
  no_customer_debt_clear: "You can't record payments against dues. Ask the pharmacy owner.",
  no_supplier_payments: "You can't record supplier payments. Ask the pharmacy owner.",
  no_stock_edit: "You can't change stock quantities by hand. Ask the pharmacy owner.",
  no_credit_billing: "Credit (udhar) and unpaid bills are switched off for you. Take the full payment.",
};
const blockedText = (k) => BLOCKED[k] || "This action is switched off for you. Ask the pharmacy owner.";

module.exports = { MOUNTS, decide, blockedText };
