export const formatDate = (dateString) => {
  if (!dateString) return "-";
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return String(dateString);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
};

/**
 * Format any expiry date representation to MM/YY (e.g. "10/27")
 * Used across the entire application for displaying expiry dates
 */
export const formatExpiry = (expiry) => {
  if (!expiry) return "-";
  const str = String(expiry).trim();
  if (
    !str ||
    str === "-" ||
    str === "N/A" ||
    str === "null" ||
    str === "undefined"
  ) {
    return "-";
  }

  // Already MM/YY (e.g. "10/27")
  const mmYyMatch = str.match(/^(\d{1,2})\/(\d{2})$/);
  if (mmYyMatch) {
    const m = mmYyMatch[1].padStart(2, "0");
    const y = mmYyMatch[2];
    return `${m}/${y}`;
  }

  // MM/YYYY (e.g. "10/2027")
  const mmYyyyMatch = str.match(/^(\d{1,2})\/(\d{4})$/);
  if (mmYyyyMatch) {
    const m = mmYyyyMatch[1].padStart(2, "0");
    const y = mmYyyyMatch[2].slice(-2);
    return `${m}/${y}`;
  }

  // YYYY-MM-DD or YYYY-MM (e.g. "2027-10-31" or "2027-10")
  const yyyyMmMatch = str.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?/);
  if (yyyyMmMatch) {
    const y = yyyyMmMatch[1].slice(-2);
    const m = yyyyMmMatch[2].padStart(2, "0");
    return `${m}/${y}`;
  }

  // DD-MM-YYYY or DD/MM/YYYY
  const ddMmYyyyMatch = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (ddMmYyyyMatch) {
    const m = ddMmYyyyMatch[2].padStart(2, "0");
    const y = ddMmYyyyMatch[3].slice(-2);
    return `${m}/${y}`;
  }

  // Fallback Date parser
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const y = String(d.getFullYear()).slice(-2);
    return `${m}/${y}`;
  }

  return str;
};

/**
 * Converts user-typed MM/YY (or MM/YYYY) into ISO YYYY-MM-DD (end of month)
 * for saving to database and backend sorting
 */
export const expiryToIso = (expiry) => {
  if (!expiry) return null;
  const str = String(expiry).trim();
  if (!str || str === "-") return null;

  // MM/YY e.g. "10/27"
  const mmYyMatch = str.match(/^(\d{1,2})\/(\d{2})$/);
  if (mmYyMatch) {
    const m = parseInt(mmYyMatch[1], 10);
    if (m < 1 || m > 12) return str;
    const y = 2000 + parseInt(mmYyMatch[2], 10);
    const lastDay = new Date(y, m, 0).getDate();
    return `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  }

  // MM/YYYY e.g. "10/2027"
  const mmYyyyMatch = str.match(/^(\d{1,2})\/(\d{4})$/);
  if (mmYyyyMatch) {
    const m = parseInt(mmYyyyMatch[1], 10);
    if (m < 1 || m > 12) return str;
    const y = parseInt(mmYyyyMatch[2], 10);
    const lastDay = new Date(y, m, 0).getDate();
    return `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }

  if (/^\d{4}-\d{2}$/.test(str)) {
    const [y, m] = str.split("-").map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    return `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  }

  return str;
};

/**
 * Handles typing into an MM/YY input field with smart auto-formatting
 */
export const formatExpiryInput = (rawVal) => {
  if (!rawVal) return "";
  const str = String(rawVal).trim();

  // If already in ISO format e.g. "2027-10-31" or "2027-10", format to MM/YY
  if (/^\d{4}-\d{2}/.test(str)) {
    return formatExpiry(str);
  }

  // Strip non-digits except slash
  let clean = str.replace(/[^\d/]/g, "");

  // If user pasted or typed >2 digits without slash (e.g. "1027" or "102")
  if (!clean.includes("/") && clean.length > 2) {
    let month = clean.slice(0, 2);
    let monthNum = parseInt(month, 10);
    if (monthNum > 12) month = "12";
    if (monthNum === 0) month = "01";
    const year = clean.slice(2, 4);
    return year ? `${month}/${year}` : `${month}/`;
  }

  // If starts with single digit 2..9, auto-prefix "0" and add "/"
  if (/^[2-9]$/.test(clean)) {
    return `0${clean}/`;
  }

  // If user entered single digit with slash, e.g. "5/" -> "05/"
  if (/^[1-9]\/$/.test(clean)) {
    return `0${clean[0]}/`;
  }

  // Split by slash
  const parts = clean.split("/");
  let m = parts[0].slice(0, 2);
  let y = (parts[1] || "").slice(0, 2);

  if (m.length === 2) {
    let mNum = parseInt(m, 10);
    if (mNum > 12) m = "12";
    if (mNum === 0) m = "01";
  }

  if (clean.includes("/")) {
    return `${m}/${y}`;
  }

  return m;
};

