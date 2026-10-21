// Checkout and payment finalisation.
//
// payment_orders.status: CREATED → PAID | EXPIRED | SUPERSEDED | AMOUNT_MISMATCH
// finalizeOrder() is the only place that activates a paid plan. It always
// re-reads the order from Cashfree, checks the amount against our snapshot,
// and flips the status atomically, so webhook + return page + reconcile can
// all call it concurrently without double-activating.
const crypto = require("crypto");
const { BillingError } = require("./errors");
const pricing = require("./pricing");
const promos = require("./promos");
const subscriptions = require("./subscriptions");
const cashfree = require("./cashfree");

const ORDER_TTL_MS = 30 * 60 * 1000;

const newOrderId = () => `dd_${Date.now().toString(36)}_${crypto.randomBytes(6).toString("hex")}`;

const trimUrl = (u) => (u || "").replace(/\/+$/, "");

const customerPhone = (mobile) => {
  const digits = String(mobile || "").replace(/\D/g, "").slice(-10);
  if (!/^[6-9]\d{9}$/.test(digits)) {
    throw new BillingError("PHONE_REQUIRED", "Add a valid 10-digit mobile number to your profile before paying");
  }
  return digits;
};

async function planContext(db, { pharmacy, planCode, promoCode, allowOwnReservation = false }) {
  const plan = await pricing.requireActivePlan(db, planCode);
  const current = pharmacy.subscription || null;

  if (subscriptions.isActive(current) && current.kind === "PAID" && current.plan !== plan.code) {
    const currentPlan = await pricing.getPlan(db, current.plan);
    if (currentPlan && plan.rank < currentPlan.rank) {
      throw new BillingError(
        "DOWNGRADE_NOT_ALLOWED",
        `You're on ${currentPlan.name} until ${new Date(current.ends_at).toLocaleDateString("en-IN")}. You can move to a lower plan after it ends.`
      );
    }
  }

  let promo = null;
  if (promoCode) {
    promo = await promos.findUsable(db, promoCode, { pharmacyId: pharmacy.id, allowOwnReservation });
    promos.assertDiscountFor(promo, plan.code);
  }

  const offer = await pricing.getOffer(db);
  const breakdown = pricing.priceBreakdown(plan, offer, promo);
  const credit = subscriptions.creditDays(current, plan);
  return { plan, promo, breakdown, credit };
}

async function quote(db, { pharmacy, planCode, promoCode }) {
  const { plan, breakdown, credit } = await planContext(db, { pharmacy, planCode, promoCode, allowOwnReservation: true });
  return {
    plan: { code: plan.code, name: plan.name, duration_days: plan.duration_days },
    ...breakdown,
    credit_days: credit,
    total_days: plan.duration_days + credit,
  };
}

async function supersedeOpenOrders(db, pharmacyId) {
  const open = await db
    .collection("payment_orders")
    .find({ pharmacy_id: pharmacyId, status: "CREATED" }, { projection: { order_id: 1 } })
    .toArray();
  for (const o of open) {
    const res = await db
      .collection("payment_orders")
      .updateOne({ order_id: o.order_id, status: "CREATED" }, { $set: { status: "SUPERSEDED", updated_at: new Date() } });
    if (res.modifiedCount) await promos.releaseForOrder(db, o.order_id);
  }
}

async function createCheckout(db, { user, pharmacy, planCode, promoCode }) {
  if (user.role !== "ADMIN") {
    throw new BillingError("OWNER_ONLY", "Only the pharmacy admin can manage the subscription", 403);
  }
  // Validate cheaply first (own pending reservation allowed), then release
  // any open checkout so its reserved code can be claimed again here.
  await planContext(db, { pharmacy, planCode, promoCode, allowOwnReservation: true });
  await supersedeOpenOrders(db, pharmacy.id);
  const { plan, promo, breakdown, credit } = await planContext(db, { pharmacy, planCode, promoCode });
  const phone = breakdown.amount_paise > 0 ? customerPhone(user.mobile) : null;

  const now = new Date();
  const orderId = newOrderId();
  const order = {
    order_id: orderId,
    pharmacy_id: pharmacy.id,
    user_id: user.id,
    plan: plan.code,
    plan_snapshot: { code: plan.code, name: plan.name, price_paise: plan.price_paise, duration_days: plan.duration_days, rank: plan.rank },
    pricing: breakdown,
    amount_paise: breakdown.amount_paise,
    credit_days_quoted: credit,
    promo_code: promo?.code || null,
    status: "CREATED",
    gateway: breakdown.amount_paise > 0 ? "CASHFREE" : "NONE",
    created_at: now,
    updated_at: now,
    expires_at: new Date(now.getTime() + ORDER_TTL_MS),
  };
  await db.collection("payment_orders").insertOne(order);

  try {
    if (promo) await promos.reserve(db, promo, { pharmacyId: pharmacy.id, userId: user.id, orderId });
  } catch (err) {
    await db.collection("payment_orders").updateOne({ order_id: orderId }, { $set: { status: "SUPERSEDED", updated_at: new Date() } });
    throw err;
  }

  // 100% discount: nothing to collect, activate straight away.
  if (breakdown.amount_paise === 0) {
    const result = await settlePaid(db, order, { source: "FREE_CHECKOUT", paymentId: null });
    return { order_id: orderId, free: true, status: "PAID", subscription: result.subscription };
  }

  try {
    const cf = await cashfree.createOrder({
      orderId,
      amountPaise: breakdown.amount_paise,
      customer: { customer_id: user.id, customer_email: user.email, customer_phone: phone, customer_name: user.name || undefined },
      returnUrl: `${trimUrl(process.env.FRONTEND_URL)}/payment-success?order_id={order_id}`,
      notifyUrl: process.env.BACKEND_URL ? `${trimUrl(process.env.BACKEND_URL)}/api/webhook/cashfree` : undefined,
      tags: { plan: plan.code, pharmacy_id: pharmacy.id },
      expiresAt: order.expires_at,
    });
    await db.collection("payment_orders").updateOne(
      { order_id: orderId },
      { $set: { cf_order_id: cf.cf_order_id, payment_session_id: cf.payment_session_id, updated_at: new Date() } }
    );
    return {
      order_id: orderId,
      free: false,
      payment_session_id: cf.payment_session_id,
      mode: cashfree.mode(),
      amount_paise: breakdown.amount_paise,
    };
  } catch (err) {
    console.error("[Billing] Cashfree create order failed:", err.response?.data || err.message);
    await db.collection("payment_orders").updateOne(
      { order_id: orderId },
      { $set: { status: "GATEWAY_ERROR", gateway_error: err.response?.data?.message || err.message, updated_at: new Date() } }
    );
    await promos.releaseForOrder(db, orderId);
    throw new BillingError("GATEWAY_ERROR", "Could not start the payment. Please try again in a moment.", 502);
  }
}

// Activate the plan for a paid order (idempotent; safe to retry).
async function settlePaid(db, order, { source, paymentId }) {
  const snap = order.plan_snapshot;
  const result = await subscriptions.activate(db, {
    pharmacyId: order.pharmacy_id,
    plan: { code: snap.code, price_paise: snap.price_paise, duration_days: snap.duration_days },
    days: snap.duration_days,
    kind: "PAID",
    sourceRef: `order:${order.order_id}`,
    amountPaise: order.amount_paise,
    actor: { user_id: order.user_id },
    meta: { order_id: order.order_id, payment_id: paymentId, source, promo_code: order.promo_code },
  });
  await promos.markRedeemedForOrder(db, order.order_id);
  await db.collection("payment_orders").updateOne(
    { order_id: order.order_id },
    { $set: { status: "PAID", activated: true, paid_at: order.paid_at || new Date(), payment_id: paymentId, finalized_by: source, updated_at: new Date() } }
  );
  return result;
}

/**
 * Bring our order in line with Cashfree. Returns { status, plan, subscription? }.
 * status: PAID | PENDING | FAILED | EXPIRED | NOT_FOUND
 */
async function finalizeOrder(db, orderId, { source }) {
  const order = await db.collection("payment_orders").findOne({ order_id: orderId });
  if (!order) return { status: "NOT_FOUND" };
  if (order.status === "PAID" && order.activated) return { status: "PAID", plan: order.plan, already: true };
  if (order.gateway !== "CASHFREE") return { status: order.status, plan: order.plan };

  const cf = await cashfree.fetchOrder(orderId);

  if (cf.order_status === "PAID") {
    const paidPaise = Math.round(Number(cf.order_amount) * 100);
    if (paidPaise !== order.amount_paise || cf.order_currency !== "INR") {
      await db.collection("payment_orders").updateOne(
        { order_id: orderId },
        { $set: { status: "AMOUNT_MISMATCH", cf_amount: cf.order_amount, updated_at: new Date() } }
      );
      console.error(`[Billing] Amount mismatch on ${orderId}: expected ${order.amount_paise}p, Cashfree says ${cf.order_amount}`);
      return { status: "FAILED", plan: order.plan, reason: "AMOUNT_MISMATCH" };
    }

    // Claim the transition; whoever wins activates. A PAID-but-not-activated
    // order (crash mid-way) is re-activated idempotently.
    const claimed = await db.collection("payment_orders").findOneAndUpdate(
      { order_id: orderId, $or: [{ status: { $in: ["CREATED", "SUPERSEDED", "EXPIRED"] } }, { status: "PAID", activated: { $ne: true } }] },
      { $set: { status: "PAID", paid_at: new Date(), updated_at: new Date() } },
      { returnDocument: "after" }
    );
    if (!claimed) return { status: "PAID", plan: order.plan, already: true };

    const payments = await cashfree.fetchPayments(orderId).catch(() => []);
    const success = payments.find((p) => p.payment_status === "SUCCESS");
    const result = await settlePaid(db, claimed, { source, paymentId: success?.cf_payment_id ? String(success.cf_payment_id) : null });
    return { status: "PAID", plan: order.plan, subscription: result.subscription };
  }

  if (["EXPIRED", "TERMINATED"].includes(cf.order_status)) {
    const res = await db.collection("payment_orders").updateOne(
      { order_id: orderId, status: { $in: ["CREATED", "SUPERSEDED"] } },
      { $set: { status: "EXPIRED", updated_at: new Date() } }
    );
    if (res.modifiedCount) await promos.releaseForOrder(db, orderId);
    return { status: "EXPIRED", plan: order.plan };
  }

  // Order still ACTIVE at Cashfree: report the latest attempt, if any.
  const payments = await cashfree.fetchPayments(orderId).catch(() => []);
  const latest = payments.sort((a, b) => new Date(b.payment_time || 0) - new Date(a.payment_time || 0))[0];
  const last = latest?.payment_status || null;
  if (last) {
    await db.collection("payment_orders").updateOne({ order_id: orderId }, { $set: { last_payment_status: last, updated_at: new Date() } });
  }
  if (last === "FAILED" || last === "USER_DROPPED" || last === "CANCELLED") {
    return { status: "FAILED", plan: order.plan, reason: last };
  }
  return { status: "PENDING", plan: order.plan };
}

// Cron: catch missed webhooks and close abandoned orders.
async function reconcile(db) {
  const now = Date.now();
  const candidates = await db
    .collection("payment_orders")
    .find({
      gateway: "CASHFREE",
      $or: [
        { status: { $in: ["CREATED", "SUPERSEDED"] }, created_at: { $lte: new Date(now - 5 * 60 * 1000), $gte: new Date(now - 3 * 24 * 60 * 60 * 1000) } },
        { status: "PAID", activated: { $ne: true } },
      ],
    })
    .limit(200)
    .toArray();
  let changed = 0;
  for (const o of candidates) {
    try {
      const r = await finalizeOrder(db, o.order_id, { source: "RECONCILE" });
      if (r.status === "PAID" && !r.already) changed++;
      // Past our own TTL with no payment: close it locally too.
      if (r.status !== "PAID" && o.expires_at && new Date(o.expires_at).getTime() + 10 * 60 * 1000 < now) {
        const res = await db.collection("payment_orders").updateOne(
          { order_id: o.order_id, status: { $in: ["CREATED", "SUPERSEDED"] } },
          { $set: { status: "EXPIRED", updated_at: new Date() } }
        );
        if (res.modifiedCount) await promos.releaseForOrder(db, o.order_id);
      }
    } catch (err) {
      console.warn(`[Billing] Reconcile ${o.order_id} failed:`, err.message);
    }
  }
  return { checked: candidates.length, activated: changed };
}

module.exports = { quote, createCheckout, finalizeOrder, reconcile, settlePaid };
