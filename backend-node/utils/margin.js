// Purchase margin: the % a pharmacy wants over its landed cost on a batch.
// The landed cost per unit (purchase_price on a batch) already includes GST
// and is net of discount and free scheme units, and billing prices are
// GST-inclusive like MRP, so selling price = landed cost x (1 + margin%).
// The price never goes above MRP.

const MAX_MARGIN = 1000;

// A margin typed on a purchase line or supplier: null when blank or invalid,
// which keeps today's behaviour (bill at MRP)
const parseMargin = (v) => {
  if (v === undefined || v === null || String(v).trim() === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(Math.min(n, MAX_MARGIN) * 100) / 100;
};

// { price, margin, capped } for a batch; margin null -> price is MRP
const marginPrice = (batch = {}) => {
  const mrp = Number(batch.mrp_per_unit || batch.mrp) || 0;
  const margin = parseMargin(batch.margin_percent);
  const cost = Number(batch.cost_per_unit || batch.purchase_price) || 0;
  if (margin === null || cost <= 0) return { price: mrp, margin: null, capped: false };
  const price = Math.round(cost * (1 + margin / 100) * 100) / 100;
  if (mrp > 0 && price > mrp) return { price: mrp, margin, capped: true };
  return { price, margin, capped: false };
};

module.exports = { parseMargin, marginPrice, MAX_MARGIN };
