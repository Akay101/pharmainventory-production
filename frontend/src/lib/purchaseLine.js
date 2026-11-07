// A purchase line's value before GST: packs x rate, less the trade discount %,
// less the supplier's scheme discount (a % of the line or a ₹ amount off it).
// Free packs only add units. Same rules as backend-node/utils/purchaseLine.js.
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export function schemeDiscountOf(item = {}) {
  const type = item.scheme_discount_type === "amount" ? "amount" : "percent";
  const v = Math.max(0, num(item.scheme_discount));
  return { type, value: type === "percent" ? Math.min(100, v) : v };
}

export function lineNet(packQty, packPrice, discountPct, item = {}) {
  const afterTrade = num(packQty) * num(packPrice) * (1 - Math.min(100, Math.max(0, num(discountPct))) / 100);
  const s = schemeDiscountOf(item);
  const off = s.type === "amount" ? Math.min(s.value, afterTrade) : (afterTrade * s.value) / 100;
  return { net: Math.max(0, afterTrade - off), schemeOff: off, scheme: s };
}

// Rate per pack that gives this GST-inclusive line total (Total typed by hand)
export function rateFromTotal(total, packQty, discountPct, gstPct, item = {}) {
  const pre = num(total) / (1 + num(gstPct) / 100);
  const s = schemeDiscountOf(item);
  const afterTrade = s.type === "amount" ? pre + s.value : s.value >= 100 ? 0 : pre / (1 - s.value / 100);
  const d = num(packQty) * (1 - Math.min(100, Math.max(0, num(discountPct))) / 100);
  return d > 0 ? afterTrade / d : 0;
}

export const schemeLabel = (item) => {
  const s = schemeDiscountOf(item);
  if (!s.value) return "";
  return s.type === "amount" ? `₹${s.value.toFixed(2)} off` : `${s.value}% off`;
};

// Packs can be part of a pack: a supplier bills 1.75 and gives 0.25 free, so two
// strips arrive and 1.75 are paid for. Stock stays in whole units.
export const packCount = (v) => Math.max(0, Math.round(num(parseFloat(v)) * 1000) / 1000);
export const stockUnits = (packs, free, perPack) =>
  Math.round((packCount(packs) + packCount(free)) * (num(perPack) || 1) * 1000) / 1000;
export const unitsAreWhole = (units) => Number.isInteger(units);
