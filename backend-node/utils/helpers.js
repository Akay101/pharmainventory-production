//normalizing name for comparision
function normalizeName(name) {
  return name
    ?.toLowerCase()
    .replace(/mg/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeExpiryDate(expiry) {
  if (!expiry) return null;
  const str = String(expiry).trim();
  if (!str || str === "-" || str === "N/A" || str === "null" || str === "undefined") return null;

  // If already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }

  // MM/YY (e.g. "10/27")
  const mmYy = str.match(/^(\d{1,2})\/(\d{2})$/);
  if (mmYy) {
    const m = parseInt(mmYy[1], 10);
    if (m >= 1 && m <= 12) {
      const y = 2000 + parseInt(mmYy[2], 10);
      const lastDay = new Date(y, m, 0).getDate();
      return `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    }
  }

  // MM/YYYY (e.g. "10/2027")
  const mmYyyy = str.match(/^(\d{1,2})\/(\d{4})$/);
  if (mmYyyy) {
    const m = parseInt(mmYyyy[1], 10);
    if (m >= 1 && m <= 12) {
      const y = parseInt(mmYyyy[2], 10);
      const lastDay = new Date(y, m, 0).getDate();
      return `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    }
  }

  // YYYY-MM
  const yyyyMm = str.match(/^(\d{4})-(\d{1,2})$/);
  if (yyyyMm) {
    const y = parseInt(yyyyMm[1], 10);
    const m = parseInt(yyyyMm[2], 10);
    if (m >= 1 && m <= 12) {
      const lastDay = new Date(y, m, 0).getDate();
      return `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    }
  }

  // DD-MM-YYYY or DD/MM/YYYY
  const ddMmYyyy = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (ddMmYyyy) {
    const d = parseInt(ddMmYyyy[1], 10);
    const m = parseInt(ddMmYyyy[2], 10);
    let y = parseInt(ddMmYyyy[3], 10);
    if (y < 100) y += 2000;
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
  }

  // Fallback Date parser
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  return str;
}

module.exports = {
  normalizeName,
  normalizeExpiryDate,
};

