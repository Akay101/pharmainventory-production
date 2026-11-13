// What a product needs before it can be bought into stock. The salt is what
// Schedule H1 detection reads, so medicines must have one; other categories
// (surgical, cosmetic...) need not. Same rules in frontend/src/lib/catalogDetails.js.
const filled = (v) => String(v ?? "").trim().length > 0;
const needsSalt = (p) => !filled(p.category) || p.category === "medicine";

// Labels missing on a purchase line, or on a product's identity
function identityGaps(p = {}) {
  const gaps = [];
  if (!filled(p.manufacturer)) gaps.push("manufacturer");
  if (needsSalt(p) && !filled(p.salt_composition)) gaps.push("salt");
  return gaps;
}

// Everything the catalog form requires
function catalogGaps(p = {}) {
  const gaps = identityGaps(p);
  // Medicine type (tablet, syrup...) is required only for medicines, and only
  // when the request carries it (older clients default it)
  if (needsSalt(p) && p.dosage_form !== undefined && !filled(p.dosage_form)) gaps.push("medicine type");
  if (!(parseInt(p.units_per_pack) >= 1)) gaps.push("units per pack");
  if (!(parseFloat(p.mrp) > 0)) gaps.push("MRP");
  return gaps;
}

module.exports = { identityGaps, catalogGaps };
