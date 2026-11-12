// Payment details for every DavaDesk checkout (plan, add-ons, AI credits):
// the payer's mobile (Cashfree needs a 10-digit Indian number), name and
// state for the receipt, and an optional GSTIN for a business tax invoice.
// When everything is already known it shows as a one-line summary with Edit.
import { useEffect, useMemo, useState } from "react";
import { Building2, ChevronDown, Lock, MapPin, Pencil, Phone, User } from "lucide-react";
import { gstStates, looksLikeGstin } from "../../lib/checkout";

const inputCls =
  "w-full h-11 rounded-xl border border-border bg-background px-3 text-sm font-semibold placeholder:font-medium placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500/60";

// "+91 98765 43210", "098765 43210" -> "9876543210"; anything else -> ""
export const cleanPhone = (v) => {
  let d = String(v || "").replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : "";
};

export function initialBilling(profile, pharmacy, user) {
  const gstin = profile?.gstin || (looksLikeGstin(pharmacy?.gst_no) ? pharmacy.gst_no : "") || "";
  return {
    phone: cleanPhone(profile?.phone) || cleanPhone(user?.mobile) || "",
    state_code: profile?.state_code || (gstin ? gstin.slice(0, 2) : ""),
    gstin,
    legal_name: profile?.legal_name || pharmacy?.name || "",
    address: profile?.address || pharmacy?.location || "",
  };
}

export const billingError = (b) => {
  if (!cleanPhone(b.phone)) return "Enter your 10-digit mobile number";
  if (b.gstin && !looksLikeGstin(b.gstin)) return "Check the GSTIN, or remove it";
  if (!b.gstin && !b.state_code) return "Choose your state";
  if (!String(b.legal_name || "").trim()) return "Enter the name for the receipt";
  return null;
};

// What the server gets
export const billingPayload = (b) => ({
  phone: cleanPhone(b.phone),
  state_code: b.gstin && looksLikeGstin(b.gstin) ? b.gstin.slice(0, 2) : b.state_code || undefined,
  gstin: b.gstin || null,
  legal_name: String(b.legal_name || "").trim(),
  address: String(b.address || "").trim(),
});

function Field({ icon: Icon, label, hint, error, children }) {
  return (
    <label className="block space-y-1.5">
      <span className="flex items-center gap-1.5 text-xs font-bold text-foreground/80">
        {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground" />} {label}
      </span>
      {children}
      {error ? <span className="block text-[11px] font-semibold text-rose-600 dark:text-rose-400">{error}</span> : hint ? <span className="block text-[11px] text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

export default function BillingDetailsFields({ value, onChange, showErrors = false }) {
  const [states, setStates] = useState([]);
  // Everything already known: start as a summary
  const [editing, setEditing] = useState(() => !!billingError(value));
  const [business, setBusiness] = useState(() => !!value.gstin);
  useEffect(() => {
    gstStates().then(setStates).catch(() => {});
  }, []);
  // A problem found on Pay opens the form
  useEffect(() => {
    if (showErrors && billingError(value)) setEditing(true);
  }, [showErrors]); // eslint-disable-line

  const set = (k, v) => onChange({ ...value, [k]: v });
  const stateCode = looksLikeGstin(value.gstin) ? value.gstin.slice(0, 2) : value.state_code;
  const stateName = useMemo(() => states.find((s) => s.code === stateCode)?.name || "", [states, stateCode]);
  const phoneOk = !!cleanPhone(value.phone);
  const gstinOk = !value.gstin || looksLikeGstin(value.gstin);

  if (!editing) {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-border/70 bg-muted/30 p-3.5" data-testid="billing-details">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
          <Lock className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1 text-sm">
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Paying as</p>
          <p className="font-extrabold truncate">{value.legal_name}</p>
          <p className="text-xs font-semibold text-muted-foreground">
            +91 {String(value.phone).replace(/(\d{5})(\d{5})/, "$1 $2")}
            {stateName ? ` · ${stateName}` : ""}
            {value.gstin ? ` · GSTIN ${value.gstin}` : ""}
          </p>
        </div>
        <button type="button" onClick={() => setEditing(true)} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold text-orange-600 hover:bg-orange-500/10" data-testid="billing-edit">
          <Pencil className="h-3 w-3" /> Edit
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3.5 rounded-2xl border border-border/70 bg-muted/20 p-4" data-testid="billing-details">
      <div>
        <p className="flex items-center gap-1.5 text-sm font-extrabold">
          <Lock className="h-4 w-4 text-emerald-600" /> Payment details
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">For your payment receipt. You'll choose UPI, card or netbanking on Cashfree's secure page next.</p>
      </div>

      <Field icon={Phone} label="Mobile number" hint="Payment updates and the receipt come here" error={showErrors && !phoneOk ? "Enter a 10-digit mobile number" : null}>
        <div className={`flex h-11 items-center rounded-xl border bg-background focus-within:ring-2 focus-within:ring-orange-500/40 ${showErrors && !phoneOk ? "border-rose-500" : "border-border"}`}>
          <span className="pl-3 pr-2 text-sm font-bold text-muted-foreground">+91</span>
          <input
            className="h-full w-full rounded-r-xl bg-transparent pr-3 text-sm font-semibold tracking-wide focus:outline-none"
            inputMode="numeric"
            autoComplete="tel-national"
            placeholder="98765 43210"
            value={value.phone}
            maxLength={10}
            onChange={(e) => set("phone", e.target.value.replace(/\D/g, "").slice(0, 10))}
            data-testid="billing-phone"
          />
        </div>
      </Field>

      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        <Field icon={User} label="Name on receipt" error={showErrors && !String(value.legal_name || "").trim() ? "Enter a name" : null}>
          <input className={inputCls} value={value.legal_name} maxLength={120} autoComplete="organization" placeholder="Pharmacy or your name" onChange={(e) => set("legal_name", e.target.value)} data-testid="billing-name" />
        </Field>
        <Field icon={MapPin} label="State" error={showErrors && !value.gstin && !value.state_code ? "Choose your state" : null}>
          <select className={inputCls} value={stateCode || ""} disabled={looksLikeGstin(value.gstin)} onChange={(e) => set("state_code", e.target.value)} data-testid="billing-state">
            <option value="">Choose state</option>
            {states.map((s) => (
              <option key={s.code} value={s.code}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {!business ? (
        <button type="button" onClick={() => setBusiness(true)} className="flex items-center gap-1.5 text-xs font-bold text-orange-600 hover:underline" data-testid="billing-add-gstin">
          <Building2 className="h-3.5 w-3.5" /> Have a GSTIN? Add it to claim GST input credit
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      ) : (
        <div className="space-y-3.5 rounded-xl border border-dashed border-border p-3">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-xs font-extrabold">
              <Building2 className="h-3.5 w-3.5 text-muted-foreground" /> Business invoice (optional)
            </p>
            <button
              type="button"
              onClick={() => {
                setBusiness(false);
                onChange({ ...value, gstin: "" });
              }}
              className="text-[11px] font-bold text-muted-foreground hover:text-foreground"
            >
              Remove
            </button>
          </div>
          <Field label="GSTIN" error={!gstinOk ? "This GSTIN doesn't look right" : null} hint="Your state is taken from the GSTIN">
            <input
              className={`${inputCls} uppercase tracking-wider ${gstinOk ? "" : "border-rose-500"}`}
              value={value.gstin}
              maxLength={15}
              placeholder="09ABCDE1234F1Z5"
              onChange={(e) => {
                const g = e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 15);
                onChange({ ...value, gstin: g, ...(looksLikeGstin(g) ? { state_code: g.slice(0, 2) } : {}) });
              }}
              data-testid="billing-gstin"
            />
          </Field>
          <Field label="Billing address">
            <input className={inputCls} value={value.address} maxLength={300} autoComplete="street-address" placeholder="Shop address, city" onChange={(e) => set("address", e.target.value)} />
          </Field>
        </div>
      )}
    </div>
  );
}
