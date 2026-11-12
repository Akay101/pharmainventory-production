// Fails the build when new backend code needs a decision for the desktop app, and
// says which line to add. This is what keeps one codebase working in both places.
const fs = require("fs");
const path = require("path");

const backend = path.join(__dirname, "..", "..", "backend-node");
const FOLDERS = ["routes", "services", "utils", "middleware", "models"];
const { TWO_WAY, PULL_ONLY } = require(path.join(backend, "services", "desktop", "collections.js"));
const pkg = require("../package.json");
const hooks = fs.readFileSync(path.join(__dirname, "..", "server", "hooks.js"), "utf8");

// Kept in the cloud on purpose: accounts, payments, AI, platform settings
const CLOUD_ONLY = new Set([
  "assistant_conversations", "assistant_messages", "auth_attempts", "bill_shares", "broadcast_assets", "broadcast_receipts", "broadcasts", "credit_transactions", "credit_wallets", "global_review_queue", "password_reset_links", "counters", "credit_config", "desktop_auth_codes", "desktop_catalog_log", "desktop_devices", "desktop_sync_state",
  "dev_outbox", "file_purge_requests", "global_distributors", "global_doctors", "global_medicines", "job_locks", "medicines", "otp_challenges", "payment_logs", "payment_orders", "pending_registrations",
  "plans", "pricing_config", "promo_codes", "promo_redemptions", "refresh_tokens", "settings_registry", "stt_sessions", "subscriptions", "support_tickets", "sync_applied", "sync_conflicts", "sync_log",
  // Data import jobs run in the cloud; what they create syncs down like any other change
  "migration_jobs", "migration_rows", "migration_products", "import_keys", "import_changes",
  // Accounts and DavaDesk's own billing: sessions, add-ons, invoices, notices
  "user_sessions", "login_tickets", "account_addons", "billing_invoices", "billing_notices",
]);
const NODE_BUILTINS = new Set(require("module").builtinModules);

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return files(full);
    return e.name.endsWith(".js") ? [full] : [];
  });
}

const source = FOLDERS.flatMap((f) => files(path.join(backend, f))).map((f) => [f, fs.readFileSync(f, "utf8")]);
const known = new Set([...TWO_WAY, ...PULL_ONLY, ...CLOUD_ONLY]);
const problems = [];

const seenCollections = new Map();
const constants = /(?:const|let)\s+([A-Z_]+)\s*=\s*"([a-z_]+)"/g;
for (const [file, text] of source) {
  for (const m of text.matchAll(/\.collection\(\s*["'`]([a-z_0-9]+)["'`]/g)) seenCollections.set(m[1], file);
  const named = new Map([...text.matchAll(constants)].map((m) => [m[1], m[2]]));
  for (const m of text.matchAll(/\.collection\(\s*([A-Z_]+)\s*\)/g)) if (named.has(m[1])) seenCollections.set(named.get(m[1]), file);
}
for (const [name, file] of seenCollections) {
  if (!known.has(name)) problems.push(`Collection "${name}" (${path.relative(backend, file)}): add it to TWO_WAY in backend-node/services/desktop/collections.js so it syncs, or to CLOUD_ONLY in this script.`);
}

const seenPackages = new Map();
for (const [file, text] of source) {
  for (const m of text.matchAll(/require\(\s*["']([^."'][^"']*)["']\s*\)/g)) {
    const name = m[1].startsWith("@") ? m[1].split("/").slice(0, 2).join("/") : m[1].split("/")[0];
    if (!NODE_BUILTINS.has(name) && !name.startsWith("node:")) seenPackages.set(name, file);
  }
}
for (const [name, file] of seenPackages) {
  const handled = pkg.dependencies[name] || hooks.includes(`"${name}"`) || hooks.includes(`${name}:`);
  if (!handled) problems.push(`Library "${name}" (${path.relative(backend, file)}): add it to desktop/package.json, or stub it in desktop/server/hooks.js if it only serves online features.`);
}

if (problems.length) {
  console.error(`The desktop app needs ${problems.length} decision(s):\n\n- ${problems.join("\n- ")}\n`);
  process.exit(1);
}
console.log(`Desktop coverage OK: ${seenCollections.size} collections, ${seenPackages.size} libraries.`);
