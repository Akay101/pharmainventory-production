// Offboarding: permanently delete an account and everything tied to it.
//
// An owner (primary admin), or the only user of a pharmacy, takes the whole
// pharmacy with them: every staff login and every document in any collection
// keyed by its pharmacy id or by one of its users' ids. Collections are found
// by scanning the database, so new tenant collections are covered without
// changes here. A staff member takes only their own login-scoped data; the
// pharmacy's records stay with the owner.
//
// Global catalogues and admin/config collections are never touched. Files in
// R2 are queued in `file_purge_requests` for the main API (which holds the R2
// keys) to delete.
const crypto = require("crypto");

// Platform-level collections that may carry ids but are not the tenant's data
const KEEP = new Set([
  "admin_users",
  "admin_audit_log",
  "admin_leads",
  "admin_visitors",
  "admin_events",
  "admin_action_otps",
  "plans",
  "pricing_config",
  "credit_config",
  "settings_registry",
  "counters",
  "job_locks",
  "promo_codes",
  "dev_outbox",
  "file_purge_requests",
  "broadcasts",
  "broadcast_assets",
]);
const isProtected = (name) => KEEP.has(name) || name.startsWith("global_") || name.startsWith("system.");

// What a staff member's own deletion covers (besides the login itself)
const STAFF_SCOPED = new Set(["refresh_tokens", "user_settings", "assistant_conversations", "stt_sessions", "notifications", "broadcast_receipts", "password_reset_links"]);

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const nonEmpty = (v) => typeof v === "string" && v.trim().length > 0;

// The filter for one collection, or null when it isn't part of this deletion.
// Every branch matches on a concrete non-empty id: an empty id would match
// every document lacking the field.
function filterFor(name, scope) {
  const { pharmacyId, userIds, emails, conversationIds } = scope;
  const byUser = [{ user_id: { $in: userIds } }, { userId: { $in: userIds } }];
  const byEmail = emails.length ? { email: { $in: emails } } : null;

  if (name === "users") return scope.kind === "PHARMACY" ? { $or: [{ pharmacy_id: pharmacyId }, { id: { $in: userIds } }] } : { id: { $in: userIds } };
  if (name === "pending_registrations") return byEmail;
  if (name === "otp_challenges")
    return emails.length ? { $or: emails.map((e) => ({ _id: { $regex: `^[^:]+:${escapeRegex(e)}$` } })) } : null;
  if (name === "auth_attempts")
    return emails.length ? { $or: emails.map((e) => ({ key: { $regex: `:${escapeRegex(e)}$` } })) } : null;
  if (name === "assistant_messages")
    return conversationIds.length ? { conversation_id: { $in: conversationIds } } : null;

  if (scope.kind === "PHARMACY") {
    const or = [{ pharmacy_id: pharmacyId }, { pharmacyId }, ...byUser];
    if (name === "pharmacies") or.push({ id: pharmacyId });
    return { $or: or };
  }
  return STAFF_SCOPED.has(name) ? { $or: byUser } : null;
}

async function resolveScope(db, userId) {
  const user = await db.collection("users").findOne({ id: userId }, { projection: { _id: 0, password_hash: 0, password: 0 } });
  if (!user) return null;
  const pharmacy = nonEmpty(user.pharmacy_id)
    ? await db.collection("pharmacies").findOne({ id: user.pharmacy_id }, { projection: { _id: 0, id: 1, name: 1, location: 1 } })
    : null;
  const members = nonEmpty(user.pharmacy_id)
    ? await db.collection("users").find({ pharmacy_id: user.pharmacy_id }, { projection: { _id: 0, id: 1, name: 1, email: 1, role: 1, is_primary_admin: 1 } }).toArray()
    : [user];
  const wholePharmacy = nonEmpty(user.pharmacy_id) && (user.is_primary_admin || members.every((m) => m.id === user.id));
  const users = (wholePharmacy ? members : [user]).filter((u) => nonEmpty(u.id));
  const userIds = users.map((u) => u.id);
  const emails = [...new Set(users.map((u) => String(u.email || "").trim().toLowerCase()).filter(Boolean))];
  const conversationIds = (
    await db
      .collection("assistant_conversations")
      .find(wholePharmacy ? { $or: [{ pharmacy_id: user.pharmacy_id }, { user_id: { $in: userIds } }] } : { user_id: { $in: userIds } }, { projection: { _id: 0, id: 1 } })
      .toArray()
      .catch(() => [])
  )
    .map((c) => c.id)
    .filter(nonEmpty);

  const kind = wholePharmacy ? "PHARMACY" : "USER";
  // What the admin must type to confirm
  const confirmName = (kind === "PHARMACY" ? pharmacy?.name : null) || user.name || user.email;
  const filePrefixes = [
    ...(kind === "PHARMACY" ? ["bills", "purchases", "csv-imports"].map((d) => `${d}/${user.pharmacy_id}/`).concat(`logos/${user.pharmacy_id}-`) : []),
    ...userIds.map((id) => `avatars/${id}-`),
  ];
  return { kind, user, pharmacy, users, pharmacyId: kind === "PHARMACY" ? user.pharmacy_id : null, userIds, emails, conversationIds, confirmName, filePrefixes };
}

// Counts of what would be deleted, per collection
async function buildPlan(db, userId) {
  const scope = await resolveScope(db, userId);
  if (!scope) return null;
  const names = (await db.listCollections({}, { nameOnly: true }).toArray()).filter((c) => !c.type || c.type === "collection").map((c) => c.name);
  const targets = [];
  await Promise.all(
    names
      .filter((n) => !isProtected(n))
      .map(async (name) => {
        const filter = filterFor(name, scope);
        if (!filter) return;
        const count = await db.collection(name).countDocuments(filter);
        if (count > 0) targets.push({ collection: name, count, filter });
      })
  );
  targets.sort((a, b) => b.count - a.count || a.collection.localeCompare(b.collection));
  return { scope, targets, total: targets.reduce((s, t) => s + t.count, 0) };
}

const publicPlan = ({ scope, targets, total }) => ({
  kind: scope.kind,
  user: { id: scope.user.id, name: scope.user.name, email: scope.user.email, role: scope.user.role, is_primary_admin: !!scope.user.is_primary_admin },
  pharmacy: scope.pharmacy,
  users: scope.users.map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, is_primary_admin: !!u.is_primary_admin })),
  confirm_name: scope.confirmName,
  collections: targets.map(({ collection, count }) => ({ collection, count })),
  total,
  files: scope.filePrefixes,
});

// Delete per a freshly built plan. Sessions go first (signed-in devices stop
// at once); users and the pharmacy go last, so a run that fails midway can be
// retried from the same user.
async function execute(db, plan, actor) {
  const { scope, targets } = plan;
  const order = (n) => (n === "refresh_tokens" ? 0 : n === "users" ? 3 : n === "pharmacies" ? 2 : 1);
  const deleted = {};
  if (scope.filePrefixes.length) {
    await db.collection("file_purge_requests").insertOne({
      id: crypto.randomUUID(),
      reason: "OFFBOARD",
      pharmacy_id: scope.pharmacyId,
      user_ids: scope.userIds,
      prefixes: scope.filePrefixes,
      status: "PENDING",
      requested_by: actor,
      created_at: new Date(),
    });
  }
  for (const t of [...targets].sort((a, b) => order(a.collection) - order(b.collection))) {
    const r = await db.collection(t.collection).deleteMany(t.filter);
    deleted[t.collection] = r.deletedCount;
  }
  // The Global Data review queue keeps the names, not who created them
  if (scope.pharmacyId) {
    await db
      .collection("global_review_queue")
      .updateMany({ "sources.pharmacy_id": scope.pharmacyId }, { $pull: { sources: { pharmacy_id: scope.pharmacyId } }, $inc: { pharmacy_count: -1 } })
      .catch((err) => console.warn("[Offboard] review queue cleanup:", err.message));
  }
  return { deleted, total: Object.values(deleted).reduce((s, n) => s + n, 0) };
}

const sameName = (a, b) => String(a || "").trim().replace(/\s+/g, " ").toLowerCase() === String(b || "").trim().replace(/\s+/g, " ").toLowerCase();

module.exports = { buildPlan, publicPlan, execute, sameName, filterFor, isProtected };
