// Shared bits of DavaDesk's own checkout (plan, add-ons): money format, the
// Cashfree page, and the GST state list.
import axios from "axios";
import { API } from "../App";

export const formatINR = (paise) => {
  const rupees = (paise || 0) / 100;
  return `₹${rupees.toLocaleString("en-IN", { minimumFractionDigits: paise % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
};

export const formatDay = (d) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "");

export const loadCashfree = () =>
  new Promise((resolve, reject) => {
    if (window.Cashfree) return resolve(window.Cashfree);
    const s = document.createElement("script");
    s.src = "https://sdk.cashfree.com/js/v3/cashfree.js";
    s.onload = () => resolve(window.Cashfree);
    s.onerror = () => reject(new Error("Couldn't load the payment page"));
    document.body.appendChild(s);
  });

// Send the browser to Cashfree for a checkout the server created. It comes
// back to /payment-success?order_id=..., which confirms with the server.
export async function openGateway(checkout) {
  const Cashfree = await loadCashfree();
  const cashfree = Cashfree({ mode: checkout.mode });
  await cashfree.checkout({ paymentSessionId: checkout.payment_session_id, redirectTarget: "_self" });
}

let statesCache = null;
export async function gstStates() {
  if (statesCache) return statesCache;
  const res = await axios.get(`${API}/billing/gst-states`);
  statesCache = res.data.states;
  return statesCache;
}

// GSTIN shape check for the form (the server also checks the checksum)
export const looksLikeGstin = (v) => /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(String(v || "").trim().toUpperCase());

export const PLAN_NAMES = { COMPLETE: "DavaDesk Complete", BASIC: "Basic", ADVANCED: "Advanced", AGENTIC: "Agentic" };
