// Expiry of the plan and add-ons: status flips, reminders before the end
// date and a notice when it passes, by email and in-app notification.
//
// Each notice is sent once: billing_notices has a unique key per item, end
// date and stage (D7, D3, D1, EXPIRED), so a renewal (new end date) starts
// the reminders afresh.
const { createNotification } = require("../notifications");
const subscriptions = require("./subscriptions");
const account = require("../account");
const receipts = require("./receipts");

const NOTICES = "billing_notices";
const DAY = 24 * 60 * 60 * 1000;
const STAGES = [1, 3, 7];

function stageFor(endsAt, now) {
  const ms = new Date(endsAt) - now;
  if (ms <= 0) return "EXPIRED";
  const daysLeft = Math.ceil(ms / DAY);
  const s = STAGES.find((d) => daysLeft <= d);
  return s ? `D${s}` : null;
}

// Add-ons past their end date become EXPIRED; linked pharmacies follow
async function expireAddons(db, now = new Date()) {
  const due = await db.collection(account.ADDONS).find({ kind: "PAID", status: "ACTIVE", ends_at: { $lte: now } }, { projection: { _id: 0, id: 1, account_id: 1 } }).toArray();
  if (!due.length) return 0;
  await db.collection(account.ADDONS).updateMany({ id: { $in: due.map((d) => d.id) }, status: "ACTIVE" }, { $set: { status: "EXPIRED", expired_at: now, updated_at: now } });
  for (const accountId of new Set(due.map((d) => d.account_id))) await subscriptions.syncLinkedPharmacies(db, accountId, now);
  return due.length;
}

async function collectItems(db, now) {
  const from = new Date(now.getTime() - 2 * DAY);
  const to = new Date(now.getTime() + 7 * DAY);
  const items = [];
  const plans = await db
    .collection("pharmacies")
    .find(
      { "subscription.kind": { $in: ["PAID", "PROMO", "ADMIN"] }, "subscription.ends_at": { $gt: from, $lte: to }, "subscription.linked": { $ne: true } },
      { projection: { _id: 0, id: 1, name: 1, account_id: 1, subscription: 1 } }
    )
    .toArray();
  for (const p of plans) {
    if (p.account_id && p.account_id !== p.id) continue;
    items.push({ key: `plan:${p.id}`, account_id: p.id, pharmacy_ids: [p.id], label: "Your DavaDesk plan", ends_at: p.subscription.ends_at, kind: "PLAN" });
  }
  const addons = await db
    .collection(account.ADDONS)
    .find({ kind: "PAID", status: { $in: ["ACTIVE", "EXPIRED"] }, ends_at: { $gt: from, $lte: to } }, { projection: { _id: 0 } })
    .toArray();
  for (const a of addons) {
    let label;
    const pharmacyIds = [a.account_id];
    if (a.type === "PHARMACY") {
      const ph = await db.collection("pharmacies").findOne({ id: a.pharmacy_id }, { projection: { name: 1, removed_at: 1 } });
      if (!ph || ph.removed_at) continue;
      label = `Linked pharmacy "${ph.name}"`;
      pharmacyIds.push(a.pharmacy_id);
    } else {
      const u = a.assigned_user_id ? await db.collection("users").findOne({ id: a.assigned_user_id }, { projection: { name: 1 } }) : null;
      label = u ? `Pharmacist user licence for ${u.name}` : "An extra pharmacist user licence";
    }
    items.push({ key: `addon:${a.id}`, account_id: a.account_id, pharmacy_ids: pharmacyIds, label, ends_at: a.ends_at, kind: a.type });
  }
  return items;
}

async function sendNotices(db, now = new Date()) {
  const items = await collectItems(db, now);
  let sent = 0;
  for (const item of items) {
    const stage = stageFor(item.ends_at, now);
    if (!stage) continue;
    const key = `${item.key}:${new Date(item.ends_at).toISOString()}:${stage}`;
    try {
      await db.collection(NOTICES).insertOne({ key, item: item.key, account_id: item.account_id, stage, ends_at: new Date(item.ends_at), created_at: now });
    } catch (err) {
      if (err.code === 11000) continue;
      throw err;
    }
    const owner = await db.collection("users").findOne({ pharmacy_id: item.account_id, is_primary_admin: true }, { projection: { _id: 0, id: 1, name: 1, email: 1 } });
    const expired = stage === "EXPIRED";
    const daysLeft = Math.max(1, Math.ceil((new Date(item.ends_at) - now) / DAY));
    const title = expired ? `${item.label} has expired` : `${item.label} expires ${daysLeft <= 1 ? "tomorrow" : `in ${daysLeft} days`}`;
    const message = expired
      ? `It ended on ${new Date(item.ends_at).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })} and is switched off. Renew it from Settings, Billing & plan.`
      : `It ends on ${new Date(item.ends_at).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}. Renew it from Settings, Billing & plan to avoid a break.`;
    for (const pid of item.pharmacy_ids) {
      await createNotification(db, {
        pharmacy_id: pid,
        user_id: owner?.id || null,
        type: "SUBSCRIPTION",
        admins_only: true,
        title,
        message,
        priority: expired || stage === "D1" ? "HIGH" : "MEDIUM",
        data: { item: item.key, kind: item.kind, stage, ends_at: item.ends_at, link: "/settings?tab=billing" },
      }).catch((err) => console.warn("[Expiry] notification failed:", err.message));
    }
    const ok = await receipts.sendExpiryEmail(db, { owner, itemLabel: item.label, endsAt: item.ends_at, expired, daysLeft }).catch((err) => {
      console.warn("[Expiry] email failed:", err.message);
      return false;
    });
    await db.collection(NOTICES).updateOne({ key }, { $set: { emailed: !!ok } });
    sent++;
  }
  return sent;
}

// Paid orders whose invoice or receipt email didn't go out (crash, mail outage)
async function retryInvoices(db, now = new Date()) {
  const invoices = require("./invoices");
  const missing = await db
    .collection("payment_orders")
    .find({ status: "PAID", activated: true, amount_paise: { $gt: 0 }, invoice_id: { $exists: false }, paid_at: { $gte: new Date(now.getTime() - 30 * DAY), $lte: new Date(now.getTime() - 2 * 60 * 1000) } })
    .limit(50)
    .toArray();
  for (const o of missing) {
    try {
      const inv = await invoices.createForOrder(db, o);
      await receipts.sendPaymentEmail(db, o, inv, null);
    } catch (err) {
      console.warn(`[Invoices] retry for ${o.order_id} failed:`, err.message);
    }
  }
  const unsent = await db
    .collection(invoices.INVOICES)
    .find({ emailed_at: { $exists: false }, $or: [{ email_failures: { $exists: false } }, { email_failures: { $lt: 5 } }], created_at: { $gte: new Date(now.getTime() - 3 * DAY), $lte: new Date(now.getTime() - 10 * 60 * 1000) } }, { projection: { pdf: 0 } })
    .limit(50)
    .toArray();
  for (const inv of unsent) {
    const order = await db.collection("payment_orders").findOne({ order_id: inv.order_id });
    if (order) await receipts.sendPaymentEmail(db, order, inv, null).catch(() => {});
  }
  return missing.length + unsent.length;
}

module.exports = { NOTICES, stageFor, expireAddons, sendNotices, retryInvoices };
