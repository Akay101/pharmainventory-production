// Accounts: one owner, one primary pharmacy, optional linked pharmacies and
// paid pharmacist seats.
//
// - The account id is the primary pharmacy's id. A linked pharmacy has
//   `account_id` pointing at it; the primary has none (or its own id).
// - Users live under the primary pharmacy (users.pharmacy_id = account id);
//   which pharmacy they are working in travels in the access token.
// - account_addons rows: USER_SEAT (INCLUDED or PAID, MONTHLY/YEARLY) and
//   PHARMACY (YEARLY). A seat is held by at most one user (assigned_user_id).
const crypto = require("crypto");

const ADDONS = "account_addons";
const DAY_MS = 24 * 60 * 60 * 1000;

const accountIdOf = (pharmacy) => (pharmacy ? pharmacy.account_id || pharmacy.id : null);
const isLinked = (pharmacy) => !!pharmacy?.account_id && pharmacy.account_id !== pharmacy.id;

const addonActive = (a, now = new Date()) =>
  !!a && a.status === "ACTIVE" && (a.kind === "INCLUDED" || (!!a.ends_at && new Date(a.ends_at) > now));

const isOwner = (user) => !!user?.is_primary_admin;
// Full access inside the account: the owner and legacy co-admins
const hasFullAccess = (user) => user?.role === "ADMIN";

async function accountPharmacies(db, accountId, { includeRemoved = false } = {}) {
  const filter = { $or: [{ id: accountId }, { account_id: accountId }] };
  if (!includeRemoved) filter.removed_at = { $in: [null, undefined] };
  const list = await db
    .collection("pharmacies")
    .find(filter, { projection: { _id: 0, id: 1, name: 1, location: 1, logo_url: 1, account_id: 1, subscription: 1, addon_id: 1, created_at: 1, removed_at: 1 } })
    .toArray();
  // Primary first, then linked in the order they were added
  return list.sort((a, b) => (a.id === accountId ? -1 : b.id === accountId ? 1 : String(a.created_at).localeCompare(String(b.created_at))));
}

// Pharmacies this user may work in (ids), within their account
function allowedPharmacyIds(user, pharmacies) {
  const ids = pharmacies.map((p) => p.id);
  if (hasFullAccess(user)) return ids;
  const grant = user?.permissions?.pharmacies;
  if (!grant || grant === "ALL") return ids;
  if (!Array.isArray(grant)) return [];
  return ids.filter((id) => grant.includes(id));
}

// Which pharmacy a session should open in: the one asked for if allowed,
// else the last one used, else the first allowed.
async function resolveActivePharmacy(db, user, requested) {
  const accountId = user.pharmacy_id;
  const pharmacies = await accountPharmacies(db, accountId);
  const allowed = allowedPharmacyIds(user, pharmacies);
  for (const id of [requested, user.last_pharmacy_id, accountId]) {
    if (id && allowed.includes(id)) return { pharmacyId: id, allowed, pharmacies };
  }
  return { pharmacyId: allowed[0] || null, allowed, pharmacies };
}

// ---- Seats -----------------------------------------------------------------------

// The plan's included seats exist as rows so that holding one is atomic.
async function ensureIncludedSeats(db, accountId, includedUsers) {
  const now = new Date();
  for (let i = 0; i < includedUsers; i++) {
    await db.collection(ADDONS).updateOne(
      { id: `${accountId}:included:${i}` },
      {
        $setOnInsert: {
          id: `${accountId}:included:${i}`,
          account_id: accountId,
          type: "USER_SEAT",
          kind: "INCLUDED",
          cycle: null,
          assigned_user_id: null,
          starts_at: now,
          ends_at: null,
          created_at: now,
        },
        $set: { status: "ACTIVE", updated_at: now },
      },
      { upsert: true }
    );
  }
  // Fewer included seats than before (changed in the admin panel)
  await db.collection(ADDONS).updateMany(
    { account_id: accountId, type: "USER_SEAT", kind: "INCLUDED", id: { $nin: Array.from({ length: includedUsers }, (_, i) => `${accountId}:included:${i}`) }, status: "ACTIVE" },
    { $set: { status: "ENDED", end_reason: "INCLUDED_USERS_REDUCED", updated_at: now } }
  );
}

async function seatSummary(db, accountId, includedUsers) {
  await ensureIncludedSeats(db, accountId, includedUsers);
  const now = new Date();
  const seats = await db.collection(ADDONS).find({ account_id: accountId, type: "USER_SEAT" }, { projection: { _id: 0 } }).toArray();
  const live = seats.filter((s) => addonActive(s, now));
  return {
    included: live.filter((s) => s.kind === "INCLUDED").length,
    purchased: live.filter((s) => s.kind === "PAID").length,
    total: live.length,
    used: live.filter((s) => s.assigned_user_id).length,
    free: live.filter((s) => !s.assigned_user_id).length,
    seats,
  };
}

// Give a user a free live seat (the plan's own first). Atomic per seat row.
async function claimSeat(db, accountId, userId, includedUsers) {
  await ensureIncludedSeats(db, accountId, includedUsers);
  const now = new Date();
  for (const kind of ["INCLUDED", "PAID"]) {
    const filter = { account_id: accountId, type: "USER_SEAT", kind, status: "ACTIVE", assigned_user_id: null };
    if (kind === "PAID") filter.ends_at = { $gt: now };
    const seat = await db.collection(ADDONS).findOneAndUpdate(
      filter,
      { $set: { assigned_user_id: userId, assigned_at: now, updated_at: now } },
      { sort: { ends_at: -1, created_at: 1 }, returnDocument: "after" }
    );
    if (seat) {
      await db.collection("users").updateOne({ id: userId }, { $set: { seat_id: seat.id }, $unset: { seat_exempt: "" } });
      return seat;
    }
  }
  return null;
}

async function releaseSeat(db, userId) {
  await db.collection(ADDONS).updateMany({ assigned_user_id: userId }, { $set: { assigned_user_id: null, released_at: new Date(), updated_at: new Date() } });
  await db.collection("users").updateOne({ id: userId }, { $unset: { seat_id: "" } });
}

// Can this user use the product right now as far as seats go?
// Returns null when fine, or a reason code.
async function seatProblem(db, user) {
  if (!user || user.is_primary_admin) return null;
  if (user.seat_id) {
    const seat = await db.collection(ADDONS).findOne({ id: user.seat_id }, { projection: { _id: 0, status: 1, kind: 1, ends_at: 1, assigned_user_id: 1 } });
    if (seat && addonActive(seat) && seat.assigned_user_id === user.id) return null;
    return "SEAT_EXPIRED";
  }
  // Users from before seats existed are marked once (ensureSeatGrandfathering)
  if (user.seat_exempt === "LEGACY") return null;
  return "SEAT_REQUIRED";
}

// One-time, at the first start with seats: every pharmacist user that already
// exists keeps working without a seat. Later users always need one.
async function ensureSeatGrandfathering(db) {
  const res = await db.collection("pricing_config").updateOne(
    { _id: "global", "launch_migrations.seats_at": { $exists: false } },
    { $set: { "launch_migrations.seats_at": new Date() } }
  );
  if (!res.modifiedCount) {
    // Fresh database without a config doc yet: create it with the marker
    const ins = await db.collection("pricing_config").updateOne({ _id: "global" }, { $setOnInsert: { launch_migrations: { seats_at: new Date() } } }, { upsert: true });
    if (!ins.upsertedCount) return 0;
  }
  const r = await db.collection("users").updateMany(
    { is_primary_admin: { $ne: true }, seat_id: { $exists: false }, seat_exempt: { $exists: false } },
    { $set: { seat_exempt: "LEGACY" } }
  );
  if (r.modifiedCount) console.log(`[Account] ${r.modifiedCount} existing user(s) kept without a seat`);
  return r.modifiedCount;
}

// ---- Add-on rows -----------------------------------------------------------------

async function listAddons(db, accountId) {
  return db.collection(ADDONS).find({ account_id: accountId }, { projection: { _id: 0 } }).sort({ type: 1, created_at: 1 }).toArray();
}

const cycleDays = (cycle) => (cycle === "MONTHLY" ? 30 : 365);

// Create or renew add-on rows for a paid order. Idempotent on source_ref.
async function grantAddon(db, { accountId, type, cycle, sourceRef, orderId, pharmacyId = null, renewId = null, actor = null }) {
  const now = new Date();
  const days = cycleDays(cycle);
  if (renewId) {
    const existing = await db.collection(ADDONS).findOne({ id: renewId, account_id: accountId, type });
    if (!existing) throw new Error(`Add-on ${renewId} not found for renewal`);
    if ((existing.renewals || []).some((r) => r.source_ref === sourceRef)) return { duplicate: true, addon: existing };
    const from = addonActive(existing, now) ? new Date(existing.ends_at) : now;
    const endsAt = new Date(from.getTime() + days * DAY_MS);
    const updated = await db.collection(ADDONS).findOneAndUpdate(
      { id: renewId, "renewals.source_ref": { $ne: sourceRef } },
      {
        $set: { status: "ACTIVE", ends_at: endsAt, cycle, updated_at: now, ...(existing.status !== "ACTIVE" ? { starts_at: now } : {}) },
        $unset: { end_reason: "", ended_at: "", notices: "" },
        $push: { renewals: { source_ref: sourceRef, order_id: orderId, days, at: now, actor } },
      },
      { returnDocument: "after" }
    );
    return { duplicate: !updated, addon: updated || existing };
  }
  const row = {
    id: crypto.randomUUID(),
    account_id: accountId,
    type,
    kind: "PAID",
    cycle,
    status: "ACTIVE",
    source_ref: sourceRef,
    order_id: orderId,
    pharmacy_id: pharmacyId,
    assigned_user_id: null,
    starts_at: now,
    ends_at: new Date(now.getTime() + days * DAY_MS),
    renewals: [],
    actor,
    created_at: now,
    updated_at: now,
  };
  try {
    await db.collection(ADDONS).insertOne(row);
  } catch (err) {
    if (err.code === 11000) return { duplicate: true, addon: await db.collection(ADDONS).findOne({ source_ref: sourceRef }) };
    throw err;
  }
  return { duplicate: false, addon: row };
}

// Users whose seats lapsed get a newly bought seat first
async function reassignSeatToWaitingUser(db, accountId, seat) {
  const waiting = await db
    .collection("users")
    .find({ pharmacy_id: accountId, is_primary_admin: { $ne: true }, verified: { $ne: false }, seat_id: { $exists: true } }, { projection: { _id: 0, id: 1, seat_id: 1 } })
    .toArray();
  for (const u of waiting) {
    const held = await db.collection(ADDONS).findOne({ id: u.seat_id });
    if (held && addonActive(held) && held.assigned_user_id === u.id) continue;
    const claimed = await db.collection(ADDONS).findOneAndUpdate(
      { id: seat.id, assigned_user_id: null },
      { $set: { assigned_user_id: u.id, assigned_at: new Date(), updated_at: new Date() } },
      { returnDocument: "after" }
    );
    if (!claimed) return null;
    if (held && held.assigned_user_id === u.id) await db.collection(ADDONS).updateOne({ id: held.id }, { $set: { assigned_user_id: null, updated_at: new Date() } });
    await db.collection("users").updateOne({ id: u.id }, { $set: { seat_id: seat.id } });
    return u.id;
  }
  return null;
}

module.exports = {
  ADDONS,
  DAY_MS,
  accountIdOf,
  isLinked,
  isOwner,
  hasFullAccess,
  addonActive,
  accountPharmacies,
  allowedPharmacyIds,
  resolveActivePharmacy,
  ensureIncludedSeats,
  seatSummary,
  claimSeat,
  releaseSeat,
  seatProblem,
  ensureSeatGrandfathering,
  listAddons,
  grantAddon,
  cycleDays,
  reassignSeatToWaitingUser,
};
