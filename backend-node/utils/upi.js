// UPI payment links and QR codes (NPCI "upi://pay" deep links), shared by
// Settings, the QR dialog, bill PDFs and the assistant.
const QRCode = require("qrcode");

// handle@psp: 2-256 of letters, digits, . - _ ; the PSP handle starts with a letter
const UPI_ID_RE = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9.-]{1,63}$/;
// Most UPI apps cap a single payment to a merchant at ₹1,00,000
const MAX_AMOUNT = 100000;

const normalizeUpiId = (v) => String(v || "").trim().replace(/\s+/g, "");
const isValidUpiId = (v) => UPI_ID_RE.test(normalizeUpiId(v));

// Returns { amount } rounded to paise, or { error }
function parseAmount(v) {
  const s = String(v ?? "").replace(/[₹,\s]/g, "");
  if (!s) return { error: "Enter an amount" };
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return { error: "Enter a valid amount, up to 2 decimals" };
  const amount = Math.round(Number(s) * 100) / 100;
  if (!(amount >= 1)) return { error: "Amount must be at least ₹1" };
  if (amount > MAX_AMOUNT) return { error: `UPI payments are limited to ₹${MAX_AMOUNT.toLocaleString("en-IN")} at a time` };
  return { amount };
}

// upi://pay?pa=…&pn=…&am=…&cu=INR[&tn=…]
function buildUpiUri({ upiId, payeeName, amount, note }) {
  // "@" stays as it is: some UPI apps don't decode %40 in the payee address
  const params = [`pa=${encodeURIComponent(normalizeUpiId(upiId)).replace(/%40/g, "@")}`, `pn=${encodeURIComponent(String(payeeName || "").slice(0, 50))}`];
  if (amount) params.push(`am=${Number(amount).toFixed(2)}`);
  params.push("cu=INR");
  const tn = String(note || "").trim().slice(0, 50);
  if (tn) params.push(`tn=${encodeURIComponent(tn)}`);
  return `upi://pay?${params.join("&")}`;
}

/**
 * QR for a pharmacy and amount. Throws { status, code, detail } on bad input.
 * Returns { upi_id, payee_name, amount, note, upi_uri, qr }  (qr = PNG data URL)
 */
async function pharmacyUpiQr(pharmacy, { amount, note } = {}) {
  const upiId = normalizeUpiId(pharmacy?.upi_id);
  if (!upiId) throw Object.assign(new Error("No UPI ID is set for this pharmacy"), { status: 400, code: "NO_UPI_ID" });
  if (!isValidUpiId(upiId)) throw Object.assign(new Error(`The saved UPI ID "${upiId}" doesn't look right. Fix it in Settings.`), { status: 400, code: "BAD_UPI_ID" });
  const parsed = parseAmount(amount);
  if (parsed.error) throw Object.assign(new Error(parsed.error), { status: 400, code: "BAD_AMOUNT" });
  const payeeName = String(pharmacy?.name || "Pharmacy").trim();
  const upiUri = buildUpiUri({ upiId, payeeName, amount: parsed.amount, note });
  const qr = await QRCode.toDataURL(upiUri, { errorCorrectionLevel: "M", margin: 2, width: 480, color: { dark: "#000000", light: "#ffffff" } });
  return { upi_id: upiId, payee_name: payeeName, amount: parsed.amount, note: String(note || "").trim().slice(0, 50), upi_uri: upiUri, qr };
}

module.exports = { UPI_ID_RE, MAX_AMOUNT, normalizeUpiId, isValidUpiId, parseAmount, buildUpiUri, pharmacyUpiQr };
