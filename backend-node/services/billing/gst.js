// GST rules for DavaDesk's own sales invoices (not the pharmacy's bills).
//
// Supply within the seller's state: CGST + SGST, half each. Anywhere else:
// IGST. Place of supply is the buyer's state: from their GSTIN when they give
// one, otherwise the state they pick at checkout.

const STATES = {
  "01": "Jammu and Kashmir",
  "02": "Himachal Pradesh",
  "03": "Punjab",
  "04": "Chandigarh",
  "05": "Uttarakhand",
  "06": "Haryana",
  "07": "Delhi",
  "08": "Rajasthan",
  "09": "Uttar Pradesh",
  "10": "Bihar",
  "11": "Sikkim",
  "12": "Arunachal Pradesh",
  "13": "Nagaland",
  "14": "Manipur",
  "15": "Mizoram",
  "16": "Tripura",
  "17": "Meghalaya",
  "18": "Assam",
  "19": "West Bengal",
  "20": "Jharkhand",
  "21": "Odisha",
  "22": "Chhattisgarh",
  "23": "Madhya Pradesh",
  "24": "Gujarat",
  "26": "Dadra and Nagar Haveli and Daman and Diu",
  "27": "Maharashtra",
  "29": "Karnataka",
  "30": "Goa",
  "31": "Lakshadweep",
  "32": "Kerala",
  "33": "Tamil Nadu",
  "34": "Puducherry",
  "35": "Andaman and Nicobar Islands",
  "36": "Telangana",
  "37": "Andhra Pradesh",
  "38": "Ladakh",
};

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

// The 15th character is a mod-36 checksum over the first 14
function gstinChecksum(first14) {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const v = CHARS.indexOf(first14[i]);
    const p = v * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(p / 36) + (p % 36);
  }
  return CHARS[(36 - (sum % 36)) % 36];
}

function normalizeGstin(raw) {
  return String(raw || "").trim().toUpperCase().replace(/\s+/g, "");
}

function isValidGstin(raw) {
  const g = normalizeGstin(raw);
  if (!GSTIN_RE.test(g)) return false;
  if (!STATES[g.slice(0, 2)]) return false;
  return gstinChecksum(g.slice(0, 14)) === g[14];
}

const stateName = (code) => STATES[code] || null;

/**
 * Split GST on a taxable amount (paise). Rounded so the parts always add up
 * to the total GST worked out at checkout.
 */
function splitTax({ taxablePaise, gstPaise, gstPercent, sellerStateCode, buyerStateCode }) {
  const intra = !!buyerStateCode && buyerStateCode === sellerStateCode;
  if (intra) {
    const cgst = Math.floor(gstPaise / 2);
    return {
      type: "INTRA",
      cgst_paise: cgst,
      sgst_paise: gstPaise - cgst,
      igst_paise: 0,
      cgst_percent: gstPercent / 2,
      sgst_percent: gstPercent / 2,
      igst_percent: 0,
      taxable_paise: taxablePaise,
    };
  }
  return {
    type: "INTER",
    cgst_paise: 0,
    sgst_paise: 0,
    igst_paise: gstPaise,
    cgst_percent: 0,
    sgst_percent: 0,
    igst_percent: gstPercent,
    taxable_paise: taxablePaise,
  };
}

// India's financial year (April to March) as "26-27"
function financialYear(date = new Date()) {
  const ist = new Date(date.getTime() + 5.5 * 60 * 60 * 1000);
  const y = ist.getUTCFullYear();
  const start = ist.getUTCMonth() >= 3 ? y : y - 1;
  return `${String(start).slice(2)}-${String(start + 1).slice(2)}`;
}

module.exports = { STATES, isValidGstin, normalizeGstin, gstinChecksum, stateName, splitTax, financialYear };
