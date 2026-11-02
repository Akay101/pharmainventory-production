// Purchase margin: the % wanted over a batch's landed cost (GST in, net of
// discount and free units). Billing sells at cost x (1 + margin%), never above
// MRP. Same rules as backend-node/utils/margin.js.

// null when blank or invalid: no margin, bill at MRP as before
export const parseMargin = (v) => {
  if (v === undefined || v === null || String(v).trim() === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(Math.min(n, 1000) * 100) / 100;
};

// { price, margin, capped } for a batch ({ mrp | mrp_per_unit, purchase_price | cost_per_unit, margin_percent })
export const marginPrice = (batch = {}) => {
  const mrp = Number(batch.mrp_per_unit || batch.mrp) || 0;
  const margin = parseMargin(batch.margin_percent);
  const cost = Number(batch.cost_per_unit || batch.purchase_price) || 0;
  if (margin === null || cost <= 0) return { price: mrp, margin: null, capped: false };
  const price = Math.round(cost * (1 + margin / 100) * 100) / 100;
  if (mrp > 0 && price > mrp) return { price: mrp, margin, capped: true };
  return { price, margin, capped: false };
};

// Bill-line fields for a batch: the price to sell at, and the margin that set
// it (kept on the line so the bill can show it)
export const marginLine = (batch) => {
  const mp = marginPrice(batch);
  return {
    unit_price: mp.price,
    margin_percent: mp.margin,
    margin_capped: mp.capped,
    margin_price: mp.margin === null ? null : mp.price,
  };
};

// The margin badge is shown only while the line still sells at the margin price
export const marginApplied = (line) =>
  line?.margin_percent !== null &&
  line?.margin_percent !== undefined &&
  line?.margin_price !== null &&
  line?.margin_price !== undefined &&
  Math.abs((parseFloat(line.unit_price) || 0) - line.margin_price) < 0.005;

export const marginLabel = (line) =>
  line.margin_capped ? `${line.margin_percent}% margin · capped at MRP` : `${line.margin_percent}% margin`;
