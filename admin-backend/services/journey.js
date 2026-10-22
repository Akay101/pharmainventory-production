// Customer journey for the admin user drawer: where a user is in the
// funnel, what happened when, and how much they actually used the product.
const { describe } = require("./billing/subscriptions");

const STAGES = {
  DROPPED_AT_OTP: { label: "Dropped at email verification", tone: "rose", detail: "Filled the signup form but never entered the emailed code. No account or pharmacy exists yet." },
  UNVERIFIED: { label: "Registered, email not verified", tone: "rose", detail: "Account created under the old signup flow but the email was never verified." },
  SIGNED_UP_NO_PLAN: { label: "Signed up, never started", tone: "rose", detail: "Verified their email but never started the free trial or bought a plan." },
  CHECKOUT_ABANDONED: { label: "Abandoned checkout", tone: "amber", detail: "Started a payment but didn't complete it." },
  TRIAL_ACTIVE_ENGAGED: { label: "On trial, actively using", tone: "amber", detail: "Trial is running and they are creating records." },
  TRIAL_ACTIVE_IDLE: { label: "On trial, not using yet", tone: "amber", detail: "Trial is running but nothing has been created yet." },
  TRIAL_ENDED_USED: { label: "Trial ended, used it but didn't buy", tone: "rose", detail: "Created records during the trial but didn't purchase. Strong follow-up candidate." },
  TRIAL_ENDED_UNUSED: { label: "Trial ended unused", tone: "rose", detail: "Started a trial but never created any records." },
  PAYING: { label: "Paying customer", tone: "emerald", detail: "Has an active paid plan." },
  COMPLIMENTARY: { label: "Complimentary access", tone: "emerald", detail: "Active plan from a promo code or admin grant (not paid)." },
  CHURNED: { label: "Paid plan expired, not renewed", tone: "rose", detail: "Was a paying customer; the plan lapsed." },
  EXPIRED: { label: "Plan expired", tone: "rose", detail: "Had complimentary access that has ended." },
};

const stageInfo = (code) => ({ code, ...STAGES[code] });

async function usageStats(db, pharmacyId, trialWindow) {
  const inTrial = trialWindow
    ? { created_at: { $gte: trialWindow.start, $lte: trialWindow.end } }
    : null;
  const count = (c, extra = {}) => db.collection(c).countDocuments({ pharmacy_id: pharmacyId, ...extra }).catch(() => 0);
  const span = (c) =>
    db
      .collection(c)
      .aggregate([
        { $match: { pharmacy_id: pharmacyId } },
        { $group: { _id: null, first: { $min: "$created_at" }, last: { $max: "$created_at" }, total: { $sum: { $ifNull: ["$total_amount", 0] } } } },
      ])
      .next()
      .catch(() => null);

  const [bills, purchases, inventory, products, customers, suppliers, staff, activities, billSpan, purchaseSpan, lastActivity] = await Promise.all([
    count("bills"),
    count("purchases"),
    count("inventory"),
    count("products"),
    count("customers"),
    count("suppliers"),
    db.collection("users").countDocuments({ pharmacy_id: pharmacyId, is_primary_admin: { $ne: true } }).catch(() => 0),
    count("activities"),
    span("bills"),
    span("purchases"),
    db.collection("activities").find({ pharmacy_id: pharmacyId }, { projection: { _id: 0, created_at: 1, action: 1, module: 1, description: 1, user_name: 1 } }).sort({ created_at: -1 }).limit(8).toArray().catch(() => []),
  ]);

  let during_trial = null;
  if (inTrial) {
    const [tb, tp, ti, tc] = await Promise.all([count("bills", inTrial), count("purchases", inTrial), count("inventory", inTrial), count("customers", inTrial)]);
    during_trial = { bills: tb, purchases: tp, inventory: ti, customers: tc };
  }

  return {
    counts: { bills, purchases, inventory, products, customers, suppliers, staff, activities },
    bills: { total_amount: billSpan?.total || 0, first_at: billSpan?.first || null, last_at: billSpan?.last || null },
    purchases: { total_amount: purchaseSpan?.total || 0, first_at: purchaseSpan?.first || null, last_at: purchaseSpan?.last || null },
    recent_activity: lastActivity,
    last_active_at: lastActivity[0]?.created_at || null,
    during_trial,
    has_records: bills + purchases + inventory + products + customers > 0,
  };
}

function pickStage({ user, sub, ledger, orders, usage }) {
  if (user.verified === false) return "UNVERIFIED";
  const everTrial = ledger.some((l) => l.kind === "TRIAL");
  const everPaid = ledger.some((l) => l.kind === "PAID");
  if (sub.status === "ACTIVE") return sub.kind === "PAID" ? "PAYING" : "COMPLIMENTARY";
  if (sub.status === "TRIAL") return usage.has_records ? "TRIAL_ACTIVE_ENGAGED" : "TRIAL_ACTIVE_IDLE";
  if (sub.status === "EXPIRED") {
    if (everPaid) return "CHURNED";
    if (everTrial || sub.kind === "TRIAL") return usage.has_records ? "TRIAL_ENDED_USED" : "TRIAL_ENDED_UNUSED";
    return "EXPIRED";
  }
  if (orders.some((o) => o.status !== "PAID")) return "CHECKOUT_ABANDONED";
  return "SIGNED_UP_NO_PLAN";
}

function buildTimeline({ user, pharmacy, ledger, orders, redemptions, usage }) {
  const ev = [];
  const push = (at, type, label, meta = {}) => at && ev.push({ at: new Date(at), type, label, ...meta });

  push(user.created_at, "REGISTERED", "Account created");
  if (user.verified_at) push(user.verified_at, "VERIFIED", "Email verified");
  push(pharmacy?.trial_claimed_at, "TRIAL_CLAIMED", "Clicked “Start free trial”");
  for (const l of ledger) {
    const a = l.metadata?.action;
    if (a === "EXTEND") push(l.created_at, "EXTENDED", `${l.plan} extended by ${l.days} day(s)`, { by: l.actor?.admin_email, reason: l.metadata?.reason });
    else if (a === "CHANGE_PLAN") push(l.created_at, "PLAN_CHANGED", `Plan changed ${l.metadata.from} → ${l.metadata.to}`, { by: l.actor?.admin_email, reason: l.metadata?.reason });
    else if (l.kind === "TRIAL") push(l.start_date || l.created_at, "TRIAL_STARTED", `Free trial started (${l.plan}, ${l.days} days)`);
    else if (l.kind === "PAID") push(l.start_date || l.created_at, "PURCHASED", `Bought ${l.plan}`, { amount_paise: l.amount_paise, credit_days: l.credit_days });
    else if (l.kind === "PROMO") push(l.start_date || l.created_at, "PROMO", `Activated ${l.plan} with code ${l.metadata?.promo_code || ""}`.trim());
    else if (l.kind === "ADMIN") push(l.start_date || l.created_at, "GRANTED", `${l.plan} granted by admin for ${l.days} day(s)`, { by: l.actor?.admin_email, reason: l.metadata?.reason });
    else push(l.start_date || l.created_at, "LEGACY", `${l.plan} plan (${l.metadata?.source || "legacy"})`);
    if (l.status === "ENDED") push(l.end_date, "ENDED", `${l.plan} ended early`, { by: l.ended_by?.admin_email, reason: l.end_reason });
  }
  for (const o of orders) {
    if (o.status !== "PAID") push(o.created_at, "CHECKOUT", `Started checkout for ${o.plan} (${o.status.toLowerCase()}${o.last_payment_status ? `, ${o.last_payment_status.toLowerCase()}` : ""})`, { amount_paise: o.amount_paise });
  }
  for (const r of redemptions) {
    if (r.type === "DISCOUNT" && r.status === "REDEEMED") push(r.updated_at || r.created_at, "DISCOUNT", `Used discount code ${r.code}`);
  }
  push(usage.bills.first_at, "FIRST_BILL", "Created first bill");
  push(usage.purchases.first_at, "FIRST_PURCHASE", "Recorded first purchase");
  const sub = pharmacy?.subscription;
  if (sub?.plan && sub.ends_at) {
    const ended = new Date(sub.ends_at) <= new Date();
    // An admin "end now" already shows as "ended early"
    const endedEarly = ledger.some((l) => l.status === "ENDED" && l.id === sub.ledger_id);
    if (ended && sub.status !== "ACTIVE" && !endedEarly) push(sub.ends_at, "EXPIRED", `${sub.kind === "TRIAL" ? "Trial" : "Plan"} expired`);
  }
  push(user.last_login_at, "LAST_LOGIN", "Last sign-in");
  return ev.sort((a, b) => b.at - a.at);
}

async function userJourney(db, user) {
  const pharmacy = user.pharmacy_id ? await db.collection("pharmacies").findOne({ id: user.pharmacy_id }, { projection: { _id: 0 } }) : null;
  const pid = pharmacy?.id;
  const [ledger, orders, redemptions] = pid
    ? await Promise.all([
        db.collection("subscriptions").find({ pharmacy_id: pid }, { projection: { _id: 0 } }).sort({ created_at: -1 }).limit(100).toArray(),
        db.collection("payment_orders").find({ pharmacy_id: pid }, { projection: { _id: 0, payment_session_id: 0 } }).sort({ created_at: -1 }).limit(50).toArray(),
        db.collection("promo_redemptions").find({ pharmacy_id: pid }, { projection: { _id: 0 } }).sort({ created_at: -1 }).limit(50).toArray(),
      ])
    : [[], [], []];

  const sub = describe(pharmacy?.subscription);
  const trialRow = ledger.find((l) => l.kind === "TRIAL");
  const trialWindow = trialRow
    ? { start: trialRow.start_date, end: (sub.kind === "TRIAL" && sub.ends_at ? new Date(sub.ends_at).toISOString() : trialRow.end_date) }
    : null;
  const usage = pid ? await usageStats(db, pid, trialWindow) : { counts: {}, bills: {}, purchases: {}, recent_activity: [], has_records: false };

  const stage = stageInfo(pickStage({ user, sub, ledger, orders, usage }));
  const paid = orders.filter((o) => o.status === "PAID");
  return {
    stage,
    payments_summary: {
      total_paid_paise: paid.reduce((sum, o) => sum + (o.amount_paise || 0), 0),
      payments: paid.length,
      last_paid_at: paid.reduce((m, o) => (!m || new Date(o.paid_at || o.created_at) > new Date(m) ? o.paid_at || o.created_at : m), null),
      discount_codes: [...new Set(paid.map((o) => o.promo_code).filter(Boolean))],
    },
    subscription: { ...sub, trial_claimed_at: pharmacy?.trial_claimed_at || null, trial_window: trialWindow },
    usage,
    ledger,
    orders,
    redemptions,
    timeline: buildTimeline({ user, pharmacy, ledger, orders, redemptions, usage }),
  };
}

async function pendingJourney(db, pending) {
  const challenge = await db.collection("otp_challenges").findOne(
    { _id: `signup:${pending.email}` },
    { projection: { send_count: 1, last_sent_at: 1, attempts: 1 } }
  );
  const timeline = [
    { at: pending.created_at, type: "SIGNUP_FORM", label: "Submitted the signup form" },
    ...(challenge?.last_sent_at ? [{ at: challenge.last_sent_at, type: "CODE_SENT", label: `Verification code sent (${challenge.send_count || 1} time(s) this hour)` }] : []),
  ].sort((a, b) => new Date(b.at) - new Date(a.at));
  return {
    stage: stageInfo("DROPPED_AT_OTP"),
    payments_summary: { total_paid_paise: 0, payments: 0, last_paid_at: null, discount_codes: [] },
    subscription: describe(null),
    usage: null,
    ledger: [],
    orders: [],
    redemptions: [],
    otp: challenge ? { wrong_attempts: challenge.attempts || 0, sends: challenge.send_count || 0 } : null,
    timeline,
  };
}

module.exports = { userJourney, pendingJourney, STAGES };
