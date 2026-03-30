//normalizing name for comparision
function normalizeName(name) {
  return name
    ?.toLowerCase()
    .replace(/mg/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

module.exports = {
  normalizeName,
};
