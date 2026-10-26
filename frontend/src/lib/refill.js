// Refill reminder maths: how long the units sold last at a daily dose, and
// when to remind the customer before they run out.
//
// A strip of 15 at 1 a day, sold on day 0, covers days 0-14, so the customer
// needs more on day 15 and is reminded a couple of days earlier (day 13).
// Doses can be fractions (½ tablet = 0.5). Dates are YYYY-MM-DD.

// "0.5", "½", "1/2", "1½", "1 1/2" -> number; anything else -> null
export function parseDose(v) {
  const parts = String(v ?? "")
    .trim()
    .replace(/½/g, " 1/2")
    .replace(/¼/g, " 1/4")
    .replace(/¾/g, " 3/4")
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return null;
  let total = 0;
  for (const p of parts) {
    if (/^\d*\.?\d+$/.test(p)) total += Number(p);
    else if (/^\d+\/\d+$/.test(p)) {
      const [a, b] = p.split("/").map(Number);
      if (!b) return null;
      total += a / b;
    } else return null;
  }
  return total > 0 && total <= 100 ? Math.round(total * 1000) / 1000 : null;
}

// Whole days the units last; a partial last day doesn't count
export function daysOfSupply(units, dosePerDay) {
  const u = Number(units);
  const d = Number(dosePerDay);
  if (!(u > 0) || !(d > 0)) return null;
  return Math.max(1, Math.floor(u / d + 1e-9));
}

// How many days before running out to remind: ~2 for a 2-week supply
export function recommendedLead(days) {
  if (days <= 1) return 0;
  if (days <= 7) return 1;
  if (days <= 30) return 2;
  if (days <= 60) return 3;
  return 5;
}

export function addDays(ymd, n) {
  const d = new Date(`${ymd}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const fmtDay = (ymd) =>
  ymd ? new Date(`${ymd}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "";

/**
 * items: [{ product_name, units, dose_per_day?, days?(manual override) }]
 * Returns per-item days / run-out dates and the recommendation, driven by the
 * medicine that runs out first. null when no item has a dose or days.
 */
export function refillPlan(billingDate, items) {
  const base = /^\d{4}-\d{2}-\d{2}$/.test(billingDate || "") ? billingDate : new Date().toISOString().slice(0, 10);
  const rows = items.map((it) => {
    const manual = parseInt(it.days, 10);
    const days = manual > 0 ? manual : daysOfSupply(it.units, it.dose_per_day);
    return { ...it, days: days || null, runs_out_on: days ? addDays(base, days) : null };
  });
  const known = rows.filter((r) => r.days);
  if (!known.length) return { rows, recommendation: null };
  const first = known.reduce((a, b) => (b.days < a.days ? b : a));
  const lead = recommendedLead(first.days);
  // Never before tomorrow (or the billing day for a 1-day supply)
  const reminder = addDays(base, Math.max(first.days - lead, Math.min(1, first.days)));
  return {
    rows,
    recommendation: {
      days_supply: first.days,
      remind_before_days: Math.round((new Date(`${first.runs_out_on}T00:00:00Z`) - new Date(`${reminder}T00:00:00Z`)) / 864e5),
      refill_target_date: first.runs_out_on,
      reminder_date: reminder,
      driver: first.product_name,
    },
  };
}

// Reminder date `lead` days before the medicine runs out, never before the
// day after billing (or the billing day itself for a 1-day supply)
export function reminderOn(billingDate, runsOutOn, lead) {
  if (!runsOutOn) return "";
  const base = /^\d{4}-\d{2}-\d{2}$/.test(billingDate || "") ? billingDate : new Date().toISOString().slice(0, 10);
  const days = Math.round((new Date(`${runsOutOn}T00:00:00Z`) - new Date(`${base}T00:00:00Z`)) / 864e5);
  const earliest = addDays(base, Math.min(1, Math.max(0, days)));
  const want = addDays(runsOutOn, -Math.max(0, lead || 0));
  return want < earliest ? earliest : want;
}
