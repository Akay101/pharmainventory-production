// Buyer details for DavaDesk's GST invoice: state (needed for CGST/SGST vs
// IGST), optional GSTIN, legal name and address. Prefilled from last time.
import { useEffect, useState } from "react";
import { gstStates, looksLikeGstin } from "../../lib/checkout";

const inputCls =
  "w-full h-10 rounded-xl border border-border bg-background px-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500/40";

export function initialBilling(profile, pharmacy) {
  const gstin = profile?.gstin || (looksLikeGstin(pharmacy?.gst_no) ? pharmacy.gst_no : "") || "";
  return {
    state_code: profile?.state_code || (gstin ? gstin.slice(0, 2) : ""),
    gstin,
    legal_name: profile?.legal_name || pharmacy?.name || "",
    address: profile?.address || pharmacy?.location || "",
  };
}

export const billingError = (b) => {
  if (b.gstin && !looksLikeGstin(b.gstin)) return "Check the GSTIN, or leave it empty";
  if (!b.gstin && !b.state_code) return "Choose your state for the GST invoice";
  return null;
};

export default function BillingDetailsFields({ value, onChange }) {
  const [states, setStates] = useState([]);
  useEffect(() => {
    gstStates().then(setStates).catch(() => {});
  }, []);
  const set = (k, v) => onChange({ ...value, [k]: v });
  const gstinOk = !value.gstin || looksLikeGstin(value.gstin);
  return (
    <div className="space-y-2.5 rounded-2xl border border-border/70 bg-muted/30 p-3" data-testid="billing-details">
      <p className="text-xs font-extrabold uppercase tracking-wide text-muted-foreground">GST invoice details</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <label className="space-y-1">
          <span className="text-[11px] font-bold text-muted-foreground">GSTIN (optional)</span>
          <input
            className={`${inputCls} uppercase ${gstinOk ? "" : "border-rose-500"}`}
            value={value.gstin}
            maxLength={15}
            placeholder="09ABCDE1234F1Z5"
            onChange={(e) => {
              const g = e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 15);
              onChange({ ...value, gstin: g, ...(looksLikeGstin(g) ? { state_code: g.slice(0, 2) } : {}) });
            }}
            data-testid="billing-gstin"
          />
        </label>
        <label className="space-y-1">
          <span className="text-[11px] font-bold text-muted-foreground">State</span>
          <select className={inputCls} value={value.state_code} disabled={looksLikeGstin(value.gstin)} onChange={(e) => set("state_code", e.target.value)} data-testid="billing-state">
            <option value="">Choose state</option>
            {states.map((s) => (
              <option key={s.code} value={s.code}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block space-y-1">
        <span className="text-[11px] font-bold text-muted-foreground">Name on invoice</span>
        <input className={inputCls} value={value.legal_name} maxLength={120} onChange={(e) => set("legal_name", e.target.value)} />
      </label>
      <label className="block space-y-1">
        <span className="text-[11px] font-bold text-muted-foreground">Billing address</span>
        <input className={inputCls} value={value.address} maxLength={300} onChange={(e) => set("address", e.target.value)} />
      </label>
    </div>
  );
}
