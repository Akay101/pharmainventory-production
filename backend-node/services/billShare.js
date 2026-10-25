// Sharing a bill with its customer (WhatsApp): a secure, expiring link to the
// bill PDF, and the ready-written message.
//
// A link is a random 128-bit token stored in `bill_shares` with an expiry
// (BILL_SHARE_DAYS, default 30). The PDF is made when the link is opened, so it
// always shows the bill as it is now. Links can be revoked per bill.
const crypto = require("crypto");

const COLLECTION = "bill_shares";
const SHARE_DAYS = Math.max(1, parseInt(process.env.BILL_SHARE_DAYS || "30", 10) || 30);
const DAY_MS = 24 * 60 * 60 * 1000;
const TOKEN_RE = /^[A-Za-z0-9_-]{22}$/;

// Indian mobile -> "91XXXXXXXXXX" (what wa.me wants), else null.
// Accepts +91 / 91 / 0 prefixes, spaces and dashes. A number written with
// another country code (+44…) is kept as it is.
function normalizeMobile(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  let d = s.replace(/[^\d+]/g, "");
  if (d.startsWith("+") && !d.startsWith("+91")) {
    d = d.slice(1).replace(/\D/g, "");
    return /^[1-9]\d{7,14}$/.test(d) ? d : null;
  }
  d = d.replace(/\D/g, "");
  if (d.length === 13 && d.startsWith("091")) d = d.slice(3);
  else if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? `91${d}` : null;
}

const newToken = () => crypto.randomBytes(16).toString("base64url"); // 22 chars

// Reuses a live link with at least a week left, else makes a new one
async function getOrCreateLink(db, { bill, pharmacyId, userId }) {
  const now = new Date();
  const live = await db
    .collection(COLLECTION)
    .findOne({ bill_id: bill.id, pharmacy_id: pharmacyId, revoked: { $ne: true }, expires_at: { $gt: new Date(now.getTime() + 7 * DAY_MS) } }, { sort: { expires_at: -1 } });
  if (live) return live;
  const doc = {
    token: newToken(),
    bill_id: bill.id,
    bill_no: bill.bill_no,
    pharmacy_id: pharmacyId,
    created_by: userId,
    created_at: now,
    expires_at: new Date(now.getTime() + SHARE_DAYS * DAY_MS),
    revoked: false,
    views: 0,
  };
  await db.collection(COLLECTION).insertOne(doc);
  return doc;
}

async function revokeLinks(db, { billId, pharmacyId }) {
  const r = await db.collection(COLLECTION).updateMany({ bill_id: billId, pharmacy_id: pharmacyId, revoked: { $ne: true } }, { $set: { revoked: true, revoked_at: new Date() } });
  return r.modifiedCount;
}

// The share behind a token, if it is still valid
async function resolveToken(db, token) {
  if (!TOKEN_RE.test(String(token || ""))) return null;
  const share = await db.collection(COLLECTION).findOne({ token });
  if (!share || share.revoked || share.expires_at <= new Date()) return { expired: !!share };
  await db.collection(COLLECTION).updateOne({ token }, { $inc: { views: 1 }, $set: { last_viewed_at: new Date() } });
  return { share };
}

// Public base for links: SHARE_BASE_URL, BACKEND_URL, else the request's host
function publicBase(req) {
  const env = process.env.SHARE_BASE_URL || process.env.BACKEND_URL || "";
  const base = env ? env.replace(/["']/g, "").trim() : `${req.protocol}://${req.get("host")}`;
  return base.replace(/\/+$/, "").replace(/\/api$/, "");
}

const money = (n) => `₹${(Number(n) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (d) =>
  new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

function billAmounts(bill) {
  const total = Number(bill.grand_total ?? bill.total_amount) || 0;
  const paid = bill.total_paid !== undefined ? Number(bill.total_paid) || 0 : bill.is_paid ? total : Number(bill.advance_amount) || 0;
  return { total, paid: Math.min(total, paid), due: Math.max(0, Math.round((total - paid) * 100) / 100) };
}

// WhatsApp message (*bold* is WhatsApp formatting)
function buildMessage({ bill, pharmacy, url, expiresAt }) {
  const { total, paid, due } = billAmounts(bill);
  const name = String(bill.customer_name || "").trim();
  const items = (bill.items || []).length;
  const lines = [
    name && !/^walk[- ]?in/i.test(name) ? `Namaste ${name} 🙏` : "Namaste 🙏",
    `Your bill from *${pharmacy?.name || "our pharmacy"}*`,
    "",
    `Bill No: ${bill.bill_no}`,
    `Date: ${day(bill.billing_date || bill.created_at || Date.now())}`,
    `Items: ${items}`,
    `Total: *${money(total)}*`,
  ];
  if (due > 0) {
    lines.push(paid > 0 ? `Paid: ${money(paid)} · Due: *${money(due)}*` : `Amount due: *${money(due)}*`);
    if (pharmacy?.upi_id) lines.push(`Pay by UPI: ${pharmacy.upi_id}`);
  } else {
    lines.push("Paid in full ✅");
  }
  lines.push("", `View or download your bill (PDF):`, url, `(link valid till ${day(expiresAt)})`, "", `Thank you for choosing ${pharmacy?.name || "us"}. Get well soon!`);
  return lines.join("\n");
}

// The pharmacy fields the bill PDF prints
function pdfPharmacy(doc) {
  const d = doc || {};
  const pick = (k) => d[k] || "";
  return {
    id: d.id || null,
    name: pick("name"),
    location: pick("location"),
    license_no: pick("license_no"),
    years_old: d.years_old || null,
    logo_url: d.logo_url || null,
    contact: pick("contact"),
    pan: pick("pan"),
    bank_name: pick("bank_name"),
    bank_ifsc: pick("bank_ifsc"),
    bank_acc_no: pick("bank_acc_no"),
    bank_holder: pick("bank_holder"),
    upi_id: pick("upi_id"),
    gst_no: pick("gst_no"),
  };
}

async function ensureIndexes(db) {
  await db.collection(COLLECTION).createIndex({ token: 1 }, { unique: true });
  await db.collection(COLLECTION).createIndex({ bill_id: 1, pharmacy_id: 1 });
  // Expired links are removed a while after they lapse
  await db.collection(COLLECTION).createIndex({ expires_at: 1 }, { expireAfterSeconds: 7 * 24 * 3600 });
}

module.exports = { SHARE_DAYS, pdfPharmacy, normalizeMobile, getOrCreateLink, revokeLinks, resolveToken, publicBase, buildMessage, billAmounts, ensureIndexes };
