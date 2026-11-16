// Bill-level restrictions for pharmacists (set in access management):
// no credit/unpaid bills, a discount cap, and same-day-only edits.
const { restriction } = require("./permissions");

const istDay = (d) => new Date(new Date(d).getTime() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
const truthy = (v) => v === true || v === "true";
const blocked = (detail, key) => ({ status: 403, body: { code: "ACTION_BLOCKED", restriction: key, detail } });

// body: the bill as sent; existing: the stored bill for edits. Returns null or {status, body}.
function checkBill(eff, body = {}, existing = null) {
  if (!eff || eff.full) return null;
  if (existing && restriction(eff, "bill_edit_same_day_only")) {
    const made = existing.created_at || existing.billing_date;
    if (made && istDay(made) !== istDay(new Date())) return blocked("You can only change bills made today. Ask the pharmacy owner.", "bill_edit_same_day_only");
  }
  if (!body || typeof body !== "object") return null;
  if (restriction(eff, "no_credit_billing")) {
    const unpaid = body.is_paid !== undefined && !truthy(body.is_paid) && !truthy(body.is_advance_paid);
    if (truthy(body.is_credit) || unpaid) return blocked("Credit (udhar) and unpaid bills are switched off for you. Take the full payment.", "no_credit_billing");
  }
  const max = restriction(eff, "max_discount_percent");
  if (max !== null && max !== undefined) {
    const discounts = [Number(body.discount_percent) || 0, ...(Array.isArray(body.items) ? body.items.map((i) => Number(i?.discount_percent) || 0) : [])];
    if (discounts.some((d) => d > max + 1e-9)) return blocked(`You can give at most ${max}% discount. Ask the pharmacy owner for more.`, "max_discount_percent");
  }
  return null;
}

module.exports = { checkBill, istDay };
