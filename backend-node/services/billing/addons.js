// Add-on checkout: extra pharmacist seats, a linked pharmacy, and renewals.
//
// The request names only what to buy (kind, cycle, quantity, pharmacy
// details, or which add-on to renew). Every price, count limit and tax is
// worked out here from the admin-set config and snapshotted on the order, so
// nothing the client sends can change the amount.
const crypto = require("crypto");
const { BillingError } = require("./errors");
const pricing = require("./pricing");
const subscriptions = require("./subscriptions");
const account = require("../account");
const gst = require("./gst");

const KINDS = ["USER_SEAT", "PHARMACY", "RENEW"];
const CYCLES = ["MONTHLY", "YEARLY"];

const assertOwner = (user) => {
  if (user.role !== "ADMIN") throw new BillingError("OWNER_ONLY", "Only the pharmacy admin can buy add-ons", 403);
};

function cleanPharmacyDetails(raw) {
  const t = (v, n) => String(v ?? "").replace(/[\u0000-\u001f<>]/g, " ").trim().slice(0, n);
  const d = raw || {};
  const out = {
    name: t(d.name, 80),
    location: t(d.location, 200),
    license_no: t(d.license_no, 60) || null,
    contact: t(d.contact, 20) || "",
    gst_no: t(d.gst_no, 20).toUpperCase() || "",
  };
  if (out.name.length < 2) throw new BillingError("PHARMACY_NAME_REQUIRED", "Enter the pharmacy's name");
  if (out.location.length < 2) throw new BillingError("PHARMACY_LOCATION_REQUIRED", "Enter the pharmacy's address or city");
  if (out.gst_no && !gst.isValidGstin(out.gst_no)) throw new BillingError("INVALID_GSTIN", "That pharmacy GSTIN doesn't look right. Check it, or leave it empty.");
  if (out.contact && !/^[0-9+\-\s]{7,20}$/.test(out.contact)) throw new BillingError("INVALID_CONTACT", "Enter a valid contact number");
  return out;
}

// What one unit costs (paise, before GST) and for how long
function unitPrice(cfg, type, cycle) {
  if (type === "USER_SEAT") {
    if (!cfg.user_seat.enabled) throw new BillingError("ADDON_UNAVAILABLE", "Extra users can't be bought right now");
    const p = cycle === "MONTHLY" ? cfg.user_seat.monthly_paise : cfg.user_seat.yearly_paise;
    if (!(p >= 100)) throw new BillingError("ADDON_UNAVAILABLE", "Extra users can't be bought right now");
    return { unit: p, days: account.cycleDays(cycle) };
  }
  if (type === "PHARMACY") {
    if (!cfg.pharmacy.enabled || !(cfg.pharmacy.yearly_paise >= 100)) throw new BillingError("ADDON_UNAVAILABLE", "Linking another pharmacy isn't available right now");
    return { unit: cfg.pharmacy.yearly_paise, days: 365 };
  }
  throw new BillingError("INVALID_REQUEST", "Invalid add-on");
}

/**
 * Work out an add-on order. Returns everything to snapshot.
 * req: { kind, cycle?, quantity?, pharmacy?, addon_id? }
 */
async function buildOrder(db, { user, pharmacy, req }) {
  assertOwner(user);
  const accountId = pharmacy.id;
  if (account.isLinked(pharmacy)) throw new BillingError("LINKED_PHARMACY", "Open your main pharmacy to buy add-ons", 409);
  const sub = pharmacy.subscription;
  if (!subscriptions.isActive(sub) || sub.kind === "TRIAL") {
    throw new BillingError("ADDON_NEEDS_PLAN", "Add-ons need an active paid DavaDesk plan. Buy or renew the plan first.", 409);
  }
  const kind = req?.kind;
  if (!KINDS.includes(kind)) throw new BillingError("INVALID_REQUEST", "Invalid add-on");
  const cfg = await pricing.getAddonConfig(db);
  const gstPercent = await pricing.getGstPercent(db);

  let type;
  let cycle;
  let quantity = 1;
  let renewOf = null;
  let pharmacyDetails = null;

  if (kind === "RENEW") {
    if (typeof req.addon_id !== "string" || req.addon_id.length > 80) throw new BillingError("INVALID_REQUEST", "Invalid add-on");
    renewOf = await db.collection(account.ADDONS).findOne({ id: req.addon_id, account_id: accountId, kind: "PAID" });
    if (!renewOf) throw new BillingError("ADDON_NOT_FOUND", "That add-on wasn't found", 404);
    if (renewOf.status === "ENDED" && renewOf.end_reason === "ADMIN") throw new BillingError("ADDON_ENDED", "This add-on was closed. Contact support to restore it.", 409);
    type = renewOf.type;
    cycle = type === "PHARMACY" ? "YEARLY" : CYCLES.includes(req.cycle) ? req.cycle : renewOf.cycle || "YEARLY";
    if (type === "PHARMACY") {
      const linked = await db.collection("pharmacies").findOne({ id: renewOf.pharmacy_id, account_id: accountId });
      if (!linked || linked.removed_at) throw new BillingError("ADDON_NOT_FOUND", "That pharmacy is no longer linked", 404);
    }
  } else if (kind === "USER_SEAT") {
    type = "USER_SEAT";
    if (!CYCLES.includes(req.cycle)) throw new BillingError("INVALID_REQUEST", "Choose monthly or yearly");
    cycle = req.cycle;
    quantity = Number(req.quantity);
    const max = Math.max(1, Math.min(50, Number(cfg.user_seat.max_per_order) || 20));
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > max) throw new BillingError("INVALID_QUANTITY", `Choose between 1 and ${max} users`);
    const live = await db.collection(account.ADDONS).countDocuments({ account_id: accountId, type: "USER_SEAT", kind: "PAID", status: "ACTIVE", ends_at: { $gt: new Date() } });
    if (live + quantity > 100) throw new BillingError("SEAT_LIMIT", "That's more users than one account can have. Contact support.", 409);
  } else {
    type = "PHARMACY";
    cycle = "YEARLY";
    pharmacyDetails = cleanPharmacyDetails(req.pharmacy);
    const linkedCount = await db.collection("pharmacies").countDocuments({ account_id: accountId, id: { $ne: accountId }, removed_at: { $in: [null, undefined] } });
    if (linkedCount >= (Number(cfg.pharmacy.max_linked) || 20)) throw new BillingError("PHARMACY_LIMIT", "You've linked the most pharmacies one account can have. Contact support.", 409);
  }

  const { unit, days } = unitPrice(cfg, type, cycle);
  const taxable = unit * quantity;
  const gstPaise = pricing.gstOn(taxable, gstPercent);
  const label =
    type === "USER_SEAT"
      ? `Extra pharmacist user${quantity > 1 ? "s" : ""} (${cycle === "MONTHLY" ? "monthly, 30 days" : "yearly, 365 days"})`
      : renewOf
        ? `Linked pharmacy renewal (365 days)`
        : `Linked pharmacy: ${pharmacyDetails.name} (365 days)`;
  const description = renewOf ? `${label}${type === "USER_SEAT" ? ", renewal" : ""}` : label;

  return {
    account_id: accountId,
    addon: { kind, type, cycle, quantity, days, unit_paise: unit, renew_addon_id: renewOf?.id || null, pharmacy: pharmacyDetails },
    lines: [{ description, qty: quantity, unit_paise: unit, gross_paise: taxable, discount_paise: 0, taxable_paise: taxable }],
    tax: { gst_percent: gstPercent, gst_paise: gstPaise, taxable_paise: taxable },
    amount_paise: taxable + gstPaise,
  };
}

async function quote(db, { user, pharmacy, req }) {
  const o = await buildOrder(db, { user, pharmacy, req });
  return { ...o.addon, lines: o.lines, taxable_paise: o.tax.taxable_paise, gst_percent: o.tax.gst_percent, gst_paise: o.tax.gst_paise, amount_paise: o.amount_paise };
}

async function createCheckout(db, { user, pharmacy, req, billing }) {
  const orders = require("./orders");
  const built = await buildOrder(db, { user, pharmacy, req });
  const profile = await orders.billingProfile(db, pharmacy, billing, user);
  await orders.supersedeOpenOrders(db, pharmacy.id, "ADDON");
  const now = new Date();
  const orderId = orders.newOrderId();
  const order = {
    order_id: orderId,
    purpose: "ADDON",
    pharmacy_id: pharmacy.id,
    account_id: built.account_id,
    user_id: user.id,
    plan: null,
    addon: built.addon,
    // Linked pharmacy id fixed now, so settling twice can't create two
    new_pharmacy_id: built.addon.type === "PHARMACY" && !built.addon.renew_addon_id ? crypto.randomUUID() : null,
    invoice_lines: built.lines,
    tax: built.tax,
    billing_profile: profile,
    amount_paise: built.amount_paise,
    status: "CREATED",
    gateway: "CASHFREE",
    created_at: now,
    updated_at: now,
    expires_at: new Date(now.getTime() + orders.ORDER_TTL_MS),
  };
  await db.collection("payment_orders").insertOne(order);
  return orders.openGatewayOrder(db, order, user, { purpose: "ADDON", addon: built.addon.type, pharmacy_id: pharmacy.id });
}

// Grant what an ADDON order paid for. Idempotent: every row is keyed on the order.
async function settle(db, order, { source, paymentId }) {
  const a = order.addon;
  const accountId = order.account_id;
  const actor = { user_id: order.user_id, source };
  const granted = [];
  if (a.renew_addon_id) {
    const r = await account.grantAddon(db, { accountId, type: a.type, cycle: a.cycle, sourceRef: `order:${order.order_id}`, orderId: order.order_id, renewId: a.renew_addon_id, actor });
    granted.push(r.addon);
  } else if (a.type === "USER_SEAT") {
    for (let i = 0; i < a.quantity; i++) {
      const r = await account.grantAddon(db, { accountId, type: "USER_SEAT", cycle: a.cycle, sourceRef: `order:${order.order_id}:${i}`, orderId: order.order_id, actor });
      granted.push(r.addon);
      if (!r.duplicate) await account.reassignSeatToWaitingUser(db, accountId, r.addon);
    }
  } else if (a.type === "PHARMACY") {
    const pid = order.new_pharmacy_id;
    const r = await account.grantAddon(db, { accountId, type: "PHARMACY", cycle: "YEARLY", sourceRef: `order:${order.order_id}`, orderId: order.order_id, pharmacyId: pid, actor });
    const now = new Date();
    await db.collection("pharmacies").updateOne(
      { id: pid },
      {
        $setOnInsert: {
          id: pid,
          account_id: accountId,
          name: a.pharmacy.name,
          location: a.pharmacy.location,
          license_no: a.pharmacy.license_no,
          contact: a.pharmacy.contact,
          gst_no: a.pharmacy.gst_no,
          logo_url: null,
          years_old: null,
          created_by: order.user_id,
          created_at: now.toISOString(),
        },
        $set: { addon_id: r.addon.id },
      },
      { upsert: true }
    );
    granted.push(r.addon);
  }
  await subscriptions.syncLinkedPharmacies(db, accountId);
  await db.collection("payment_orders").updateOne(
    { order_id: order.order_id },
    { $set: { status: "PAID", activated: true, paid_at: order.paid_at || new Date(), payment_id: paymentId, finalized_by: source, granted_addon_ids: granted.map((g) => g?.id).filter(Boolean), updated_at: new Date() } }
  );
  return { addons: granted };
}

module.exports = { KINDS, CYCLES, buildOrder, quote, createCheckout, settle, cleanPharmacyDetails };
