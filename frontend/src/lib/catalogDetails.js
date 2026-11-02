// What a product needs before it can be bought into stock. Same rules as
// backend-node/utils/catalogDetails.js.
const filled = (v) => String(v ?? "").trim().length > 0;
export const needsSalt = (p) => !filled(p.category) || p.category === "medicine";

// Missing on a purchase row: what the catalog entry must supply
export function rowCatalogGaps(row = {}) {
  const gaps = [];
  if (!filled(row.manufacturer)) gaps.push("manufacturer");
  if (needsSalt(row) && !filled(row.salt_composition)) gaps.push("salt");
  return gaps;
}

// { field: message } for the catalog form
export function catalogFormErrors(form = {}) {
  const errors = {};
  if (!filled(form.name)) errors.name = "Enter the product name";
  if (!filled(form.manufacturer)) errors.manufacturer = "Enter the manufacturer";
  if (needsSalt(form) && !filled(form.salt_composition)) errors.salt_composition = "Enter the salt";
  if (!(parseInt(form.units_per_pack) >= 1)) errors.units_per_pack = "At least 1";
  if (!(parseFloat(form.mrp) > 0)) errors.mrp = "Enter the MRP";
  return errors;
}
