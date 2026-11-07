// A purchase line's value before GST. Suppliers' schemes come two ways, and a
// line can have both: free packs (`scheme`, they only add units) and a scheme
// discount (`scheme_discount`), either a % of the line or a ₹ amount off it
// (`scheme_discount_type` "percent" | "amount"). The scheme discount applies
// after the trade discount (`discount` %) and before GST, so it lowers the
// taxable value and the landed cost. Same rules in frontend/src/lib/purchaseLine.js.

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// { type, value } with value clamped (0-100 for %, >= 0 for ₹)
function schemeDiscountOf(item = {}) {
  const type = item.scheme_discount_type === "amount" ? "amount" : "percent";
  const v = Math.max(0, num(item.scheme_discount));
  return { type, value: type === "percent" ? Math.min(100, v) : v };
}

// packs x rate, less trade discount %, less the scheme discount
function lineNet(packQty, packPrice, discountPct, item = {}) {
  const afterTrade = num(packQty) * num(packPrice) * (1 - Math.min(100, Math.max(0, num(discountPct))) / 100);
  const s = schemeDiscountOf(item);
  const off = s.type === "amount" ? Math.min(s.value, afterTrade) : (afterTrade * s.value) / 100;
  return { net: Math.max(0, afterTrade - off), schemeOff: round2(off), scheme: s };
}

// Packs can be part of a pack: a supplier bills 1.75 and gives 0.25 free, so two
// strips arrive and 1.75 are paid for. Stock stays in whole units.
const packCount = (v) => Math.max(0, Math.round(num(v) * 1000) / 1000);
const stockUnits = (packs, free, perPack) =>
  Math.round((packCount(packs) + packCount(free)) * (num(perPack) || 1) * 1000) / 1000;
const unitsAreWhole = (units) => Number.isInteger(units);
// A quantity written as billed + free: "1.75+0.25" -> { packs: 1.75, free: 0.25 }
function billedAndFree(qty, free) {
  const [billed, inline] = String(qty ?? "").split("+");
  return { packs: packCount(billed), free: packCount(free) || packCount(inline) };
}

// Fields stored on purchase lines and batches
const schemeFields = (item) => {
  const s = schemeDiscountOf(item);
  return { scheme_discount: s.value, scheme_discount_type: s.type };
};

module.exports = { schemeDiscountOf, lineNet, schemeFields, packCount, stockUnits, unitsAreWhole, billedAndFree };
