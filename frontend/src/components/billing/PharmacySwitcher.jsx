// The pharmacy name at the top left: switch between the account's
// pharmacies, or link a new one (paid add-on, owner only).
import { useState } from "react";
import { toast } from "sonner";
import { Building2, Check, ChevronDown, Loader2, Lock, Plus } from "lucide-react";
import { useAuth } from "../../App";
import { IS_DESKTOP } from "../../lib/desktop";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "../ui/dropdown-menu";
import { Dialog, DialogContent } from "../ui/dialog";
import AddonCheckoutDialog from "./AddonCheckoutDialog";
import { formatDay } from "../../lib/checkout";

const inputCls =
  "w-full h-10 rounded-xl border border-border bg-background px-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500/40";

export function LinkPharmacyDialog({ open, onOpenChange }) {
  const [details, setDetails] = useState({ name: "", location: "", license_no: "", contact: "", gst_no: "" });
  const [request, setRequest] = useState(null);
  const set = (k, v) => setDetails((d) => ({ ...d, [k]: v }));
  const close = (o) => {
    onOpenChange(o);
    if (!o) setRequest(null);
  };
  const next = (e) => {
    e.preventDefault();
    if (details.name.trim().length < 2) return toast.error("Enter the pharmacy's name");
    if (details.location.trim().length < 2) return toast.error("Enter the pharmacy's address or city");
    const clean = Object.fromEntries(Object.entries(details).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v));
    setRequest({ kind: "PHARMACY", pharmacy: clean });
  };
  if (request) {
    return (
      <AddonCheckoutDialog
        open={open}
        onOpenChange={close}
        request={request}
        title="Link a new pharmacy"
        description={`${request.pharmacy.name} gets its own stock, bills and records, and you switch to it from the pharmacy name. Billed yearly.`}
      >
        <button type="button" className="text-xs font-bold text-orange-600 hover:underline text-left" onClick={() => setRequest(null)}>
          ← Edit pharmacy details
        </button>
      </AddonCheckoutDialog>
    );
  }
  return (
    <AddonCheckoutShell open={open} onOpenChange={close}>
      <form onSubmit={next} className="space-y-3" data-testid="link-pharmacy-form">
        <div>
          <h2 className="text-xl font-extrabold">Link a new pharmacy</h2>
          <p className="text-sm text-muted-foreground">Its records are kept fully separate. You can give each pharmacist access to one, some or all pharmacies.</p>
        </div>
        <label className="block space-y-1">
          <span className="text-xs font-bold text-muted-foreground">Pharmacy name *</span>
          <input className={inputCls} value={details.name} maxLength={80} onChange={(e) => set("name", e.target.value)} autoFocus data-testid="link-pharmacy-name" />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-bold text-muted-foreground">Address / city *</span>
          <input className={inputCls} value={details.location} maxLength={200} onChange={(e) => set("location", e.target.value)} data-testid="link-pharmacy-location" />
        </label>
        <div className="grid grid-cols-2 gap-2.5">
          <label className="block space-y-1">
            <span className="text-xs font-bold text-muted-foreground">Drug licence no.</span>
            <input className={inputCls} value={details.license_no} maxLength={60} onChange={(e) => set("license_no", e.target.value)} />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-bold text-muted-foreground">Contact</span>
            <input className={inputCls} value={details.contact} maxLength={20} onChange={(e) => set("contact", e.target.value.replace(/[^0-9+\- ]/g, ""))} />
          </label>
        </div>
        <label className="block space-y-1">
          <span className="text-xs font-bold text-muted-foreground">Pharmacy GSTIN</span>
          <input className={`${inputCls} uppercase`} value={details.gst_no} maxLength={15} onChange={(e) => set("gst_no", e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, ""))} />
        </label>
        <button type="submit" className="w-full h-11 rounded-xl font-bold text-white bg-gradient-to-r from-orange-500 to-amber-500" data-testid="link-pharmacy-next">
          Continue to payment
        </button>
      </form>
    </AddonCheckoutShell>
  );
}

// Plain dialog frame for the details step
function AddonCheckoutShell({ open, onOpenChange, children }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-3xl">{children}</DialogContent>
    </Dialog>
  );
}

export default function PharmacySwitcher({ children }) {
  const { pharmacies, activePharmacyId, switchPharmacy, isOwner } = useAuth();
  const [switching, setSwitching] = useState(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const canLink = isOwner && !IS_DESKTOP;
  // One pharmacy and nothing to offer: just the name, as before
  if ((pharmacies?.length || 0) <= 1 && !canLink) return children;

  const go = async (p) => {
    if (p.id === activePharmacyId) return;
    if (!p.active) {
      toast.error(`${p.name}'s plan has ended. Renew it from Settings, Billing & plan.`);
    }
    setSwitching(p.id);
    try {
      await switchPharmacy(p.id);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Couldn't switch pharmacy");
      setSwitching(null);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className="flex items-center gap-1 min-w-0 rounded-xl text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40" data-testid="pharmacy-switcher">
            {children}
            <ChevronDown className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72 rounded-2xl p-1.5">
          <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">Your pharmacies</DropdownMenuLabel>
          {(pharmacies || []).map((p) => (
            <DropdownMenuItem key={p.id} onSelect={(e) => { e.preventDefault(); go(p); }} className="rounded-xl py-2 gap-2.5 cursor-pointer" data-testid={`pharmacy-option-${p.id}`}>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-500/10 text-orange-600">
                {p.logo_url ? <img src={p.logo_url} alt="" className="h-8 w-8 rounded-lg object-cover" /> : <Building2 className="w-4 h-4" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold">{p.name}</span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {p.primary ? "Main pharmacy" : p.active ? `Linked · until ${formatDay(p.ends_at)}` : "Linked · expired"}
                </span>
              </span>
              {switching === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : p.id === activePharmacyId ? <Check className="w-4 h-4 text-emerald-500" /> : !p.active ? <Lock className="w-3.5 h-3.5 text-rose-500" /> : null}
            </DropdownMenuItem>
          ))}
          {canLink && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setLinkOpen(true)} className="rounded-xl py-2 gap-2.5 cursor-pointer font-bold text-orange-600" data-testid="link-new-pharmacy">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-dashed border-orange-500/50">
                  <Plus className="w-4 h-4" />
                </span>
                Link new pharmacy
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {linkOpen && <LinkPharmacyDialog open={linkOpen} onOpenChange={setLinkOpen} />}
    </>
  );
}
