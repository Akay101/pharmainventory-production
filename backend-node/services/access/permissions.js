// Pharmacist access: which modules and actions a user may use, behaviours
// that are blocked, and which pharmacies of the account they may open.
//
// users.permissions = {
//   version: 1,
//   preset: "BILLING_COUNTER" | ... | "CUSTOM",
//   modules: { billing: { read, create, update, delete }, ... },
//   restrictions: { no_credit_billing, max_discount_percent, bill_edit_same_day_only, ... },
//   pharmacies: "ALL" | [pharmacy ids],
// }
//
// The owner and co-admins (role ADMIN) always have full access. Pharmacists
// added before access management (no `permissions`) keep full module access.
// Shared by the API and the desktop app (which runs this file offline).

const ACTIONS = ["read", "create", "update", "delete"];

const MODULES = [
  { key: "dashboard", label: "Dashboard & reports", actions: ["read"], hint: "Sales, profit and dues on the dashboard and in Reports" },
  { key: "billing", label: "Billing", actions: ACTIONS, hint: "Sale bills, drafts, payments on bills" },
  { key: "purchases", label: "Purchases", actions: ACTIONS, hint: "Purchase bills, scanning, CSV import" },
  { key: "inventory", label: "Inventory", actions: ACTIONS, hint: "Stock, batches, products, thresholds" },
  { key: "customers", label: "Customers", actions: ACTIONS, hint: "Customer records, dues and tiers" },
  { key: "suppliers", label: "Suppliers", actions: ACTIONS, hint: "Supplier records and supplier payments" },
  { key: "returns", label: "Returns", actions: ACTIONS, hint: "Purchase return notes" },
  { key: "expiry", label: "Expiry", actions: ACTIONS, hint: "Expired stock and expiry return notes" },
  { key: "short_book", label: "Short book", actions: ACTIONS, hint: "Items to order" },
  { key: "restock", label: "Restock & reminders", actions: ACTIONS, hint: "Refill reminders for customers" },
  { key: "assistant", label: "DavaDesk AI", actions: ["read"], hint: "AI assistant and voice (uses AI credits)" },
  { key: "imports", label: "Data import", actions: ["read", "create"], hint: "Importing data from other software" },
  { key: "settings", label: "Pharmacy settings", actions: ["read", "update"], hint: "Pharmacy details, bill formats, preferences for everyone" },
  { key: "activities", label: "Activity log", actions: ["read"], hint: "Who did what, and when" },
];

const RESTRICTIONS = [
  { key: "no_credit_billing", type: "boolean", label: "No credit (udhar) or unpaid bills", hint: "Every bill must be paid in full when it is made" },
  { key: "max_discount_percent", type: "number", min: 0, max: 100, label: "Highest discount allowed on a bill (%)", hint: "Empty means no limit" },
  { key: "bill_edit_same_day_only", type: "boolean", label: "Edit or cancel only today's bills", hint: "Older bills can't be changed by this user" },
  { key: "no_customer_debt_clear", type: "boolean", label: "Can't clear customer dues", hint: "Blocks recording payments against customer dues" },
  { key: "no_supplier_payments", type: "boolean", label: "Can't record supplier payments", hint: "Blocks paying suppliers and purchase payments" },
  { key: "no_stock_edit", type: "boolean", label: "Can't change stock quantities by hand", hint: "Stock still moves through bills and purchases" },
];

const all = (v) => Object.fromEntries(ACTIONS.map((a) => [a, v]));
const modulesWith = (fn) => Object.fromEntries(MODULES.map((m) => [m.key, Object.fromEntries(m.actions.map((a) => [a, !!fn(m.key, a)]))]));

const PRESETS = {
  FULL: { label: "Full access", modules: modulesWith(() => true), restrictions: {} },
  BILLING_COUNTER: {
    label: "Billing counter",
    modules: modulesWith((m, a) =>
      ({
        billing: ["read", "create", "update"],
        customers: ["read", "create", "update"],
        inventory: ["read"],
        returns: ["read"],
        expiry: ["read"],
        short_book: ["read", "create", "update"],
        restock: ["read", "create", "update"],
        assistant: ["read"],
        settings: ["read"],
      })[m]?.includes(a)
    ),
    restrictions: { no_credit_billing: false, max_discount_percent: 10, bill_edit_same_day_only: true, no_customer_debt_clear: false, no_supplier_payments: true, no_stock_edit: true },
  },
  PURCHASE_MANAGER: {
    label: "Purchase & stock manager",
    modules: modulesWith((m, a) =>
      ({
        purchases: ACTIONS,
        suppliers: ACTIONS,
        inventory: ACTIONS,
        returns: ACTIONS,
        expiry: ACTIONS,
        short_book: ACTIONS,
        billing: ["read"],
        dashboard: ["read"],
        assistant: ["read"],
        imports: ["read", "create"],
        settings: ["read"],
      })[m]?.includes(a)
    ),
    restrictions: {},
  },
  READ_ONLY: { label: "View only", modules: modulesWith((m, a) => a === "read" && m !== "assistant" && m !== "imports"), restrictions: {} },
};

const LEGACY_FULL = { version: 1, preset: "FULL", modules: PRESETS.FULL.modules, restrictions: {}, pharmacies: "ALL", legacy: true };

// Validate and normalise a permissions object from the client.
// Unknown modules/actions/keys are dropped; nothing is granted by default.
function sanitize(input, accountPharmacyIds) {
  const src = input && typeof input === "object" ? input : {};
  const modules = {};
  for (const m of MODULES) {
    const given = src.modules?.[m.key] || {};
    modules[m.key] = Object.fromEntries(m.actions.map((a) => [a, given[a] === true]));
    // Anything beyond read needs read
    if (m.actions.some((a) => a !== "read" && modules[m.key][a])) modules[m.key].read = true;
  }
  const restrictions = {};
  for (const r of RESTRICTIONS) {
    const v = src.restrictions?.[r.key];
    if (r.type === "boolean") restrictions[r.key] = v === true;
    else if (v === null || v === undefined || v === "") restrictions[r.key] = null;
    else {
      const n = Number(v);
      if (!Number.isFinite(n) || n < r.min || n > r.max) {
        const err = new Error(`${r.label}: enter a number from ${r.min} to ${r.max}`);
        err.status = 400;
        throw err;
      }
      restrictions[r.key] = Math.round(n * 100) / 100;
    }
  }
  let pharmacies = "ALL";
  if (Array.isArray(src.pharmacies)) {
    const list = [...new Set(src.pharmacies.filter((id) => typeof id === "string" && accountPharmacyIds.includes(id)))];
    if (!list.length) {
      const err = new Error("Give access to at least one pharmacy");
      err.status = 400;
      throw err;
    }
    pharmacies = list.length === accountPharmacyIds.length ? "ALL" : list;
  }
  const preset = typeof src.preset === "string" && (PRESETS[src.preset] || src.preset === "CUSTOM") ? src.preset : "CUSTOM";
  return { version: 1, preset, modules, restrictions, pharmacies };
}

// What a user may do, ready for checks
function effective(user) {
  if (!user) return null;
  if (user.role === "ADMIN") return { full: true, modules: PRESETS.FULL.modules, restrictions: {}, pharmacies: "ALL" };
  const p = user.permissions || LEGACY_FULL;
  return { full: false, modules: p.modules || {}, restrictions: p.restrictions || {}, pharmacies: p.pharmacies || "ALL", legacy: !user.permissions };
}

function can(eff, module, action) {
  if (!eff) return false;
  if (eff.full) return true;
  return eff.modules?.[module]?.[action] === true;
}

const restriction = (eff, key) => (eff && !eff.full ? eff.restrictions?.[key] ?? null : null);

module.exports = { ACTIONS, MODULES, RESTRICTIONS, PRESETS, LEGACY_FULL, sanitize, effective, can, restriction };
