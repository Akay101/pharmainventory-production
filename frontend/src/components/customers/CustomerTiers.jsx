import { useEffect, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Crown, Repeat, Sparkles, Clock, UserPlus, Moon, Loader2, Settings2, Percent } from "lucide-react";
import { API } from "../../App";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";

// Customer tiers (worked out on the server from bills: services/customerTiers.js)
export const TIER_META = {
  PERMANENT: { label: "Permanent", icon: Crown, cls: "bg-violet-500/12 text-violet-600 dark:text-violet-300 border-violet-500/30", dot: "bg-violet-500", hint: "Comes in regularly" },
  RUNNING: { label: "Running", icon: Repeat, cls: "bg-sky-500/12 text-sky-600 dark:text-sky-300 border-sky-500/30", dot: "bg-sky-500", hint: "Visits now and then" },
  OCCASIONAL: { label: "Occasional", icon: Clock, cls: "bg-amber-500/12 text-amber-600 dark:text-amber-300 border-amber-500/30", dot: "bg-amber-500", hint: "Rare visits" },
  NEW: { label: "New", icon: UserPlus, cls: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-300 border-emerald-500/30", dot: "bg-emerald-500", hint: "First purchase recently" },
  INACTIVE: { label: "Inactive", icon: Moon, cls: "bg-zinc-500/12 text-zinc-600 dark:text-zinc-300 border-zinc-500/30", dot: "bg-zinc-400", hint: "Hasn't come back in a while" },
};
export const TIER_ORDER = ["PERMANENT", "RUNNING", "OCCASIONAL", "NEW", "INACTIVE"];

const inr = (n) => `₹${(Number(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
export const visitLine = (c) => {
  const s = c?.stats;
  if (!s || !s.visits_total) return "No purchases yet";
  const parts = [];
  if (s.avg_gap_days) parts.push(`every ~${s.avg_gap_days} day${s.avg_gap_days === 1 ? "" : "s"}`);
  parts.push(s.days_since_last === 0 ? "came today" : `last ${s.days_since_last}d ago`);
  return parts.join(" · ");
};

export function TierBadge({ customer, tier, compact = false }) {
  const t = tier || customer?.tier;
  const meta = TIER_META[t];
  if (!meta) return null;
  const Icon = meta.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide ${meta.cls}`}
      title={`${meta.label} customer${customer?.tier_source === "manual" ? " (set by hand)" : ""}`}
      data-testid="tier-badge"
    >
      <Icon className="h-3 w-3" />
      {!compact && meta.label}
      {customer?.tier_source === "manual" && !compact && <span className="opacity-60">·</span>}
      {customer?.tier_source === "manual" && !compact && <span className="normal-case">pinned</span>}
    </span>
  );
}

// Chips: All + one per tier with counts
export function TierFilterBar({ value, onChange, counts, onRules, canEdit }) {
  const total = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : null;
  const chip = (active) =>
    `inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-bold transition-colors ${active ? "border-primary bg-primary text-primary-foreground shadow-xs" : "border-border/70 bg-card/60 text-foreground hover:bg-muted"}`;
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="tier-filter">
      <button type="button" onClick={() => onChange("")} className={chip(!value)}>
        All {total !== null && <span className="opacity-70">{total}</span>}
      </button>
      {TIER_ORDER.map((t) => {
        const m = TIER_META[t];
        const Icon = m.icon;
        return (
          <button key={t} type="button" onClick={() => onChange(value === t ? "" : t)} className={chip(value === t)} title={m.hint}>
            <Icon className="h-3.5 w-3.5" /> {m.label}
            {counts && <span className="opacity-70">{counts[t] || 0}</span>}
          </button>
        );
      })}
      {canEdit && (
        <Button variant="outline" size="sm" onClick={onRules} className="ml-auto h-8 rounded-full text-xs font-bold" data-testid="tier-rules-btn">
          <Settings2 className="mr-1.5 h-3.5 w-3.5" /> Tier rules & discounts
        </Button>
      )}
    </div>
  );
}

// Admin: how tiers are decided and each tier's default discount
export function TierRulesDialog({ open, onClose, onSaved }) {
  const [cfg, setCfg] = useState(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    setCfg(null);
    axios
      .get(`${API}/customers/tiers/config`)
      .then((r) => setCfg(r.data.config))
      .catch(() => toast.error("Couldn't load tier rules"));
  }, [open]);

  const num = (k) => (
    <input
      type="number"
      min="0"
      value={cfg[k]}
      onChange={(e) => setCfg({ ...cfg, [k]: e.target.value })}
      className="h-8 w-20 rounded-lg border border-border bg-background px-2 text-center text-sm font-bold outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
    />
  );
  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        ...cfg,
        window_days: Number(cfg.window_days),
        permanent_min_visits: Number(cfg.permanent_min_visits),
        running_min_visits: Number(cfg.running_min_visits),
        new_within_days: Number(cfg.new_within_days),
        inactive_after_days: Number(cfg.inactive_after_days),
        discounts: Object.fromEntries(TIER_ORDER.map((t) => [t, Number(cfg.discounts[t]) || 0])),
      };
      const r = await axios.put(`${API}/customers/tiers/config`, payload);
      toast.success("Tier rules saved");
      onSaved?.(r.data.config);
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Couldn't save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-primary" /> Customer tiers
          </DialogTitle>
          <DialogDescription>Tiers update by themselves from each customer's visits. A visit is a day they bought something.</DialogDescription>
        </DialogHeader>
        {!cfg ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4 text-sm">
            <div className="space-y-2.5 rounded-xl border border-border/70 p-3">
              <p className="flex flex-wrap items-center gap-2 font-semibold">
                Look at the last {num("window_days")} days
              </p>
              <p className="flex flex-wrap items-center gap-2">
                <TierBadge tier="PERMANENT" /> {num("permanent_min_visits")} or more visits
              </p>
              <p className="flex flex-wrap items-center gap-2">
                <TierBadge tier="RUNNING" /> {num("running_min_visits")} or more visits
              </p>
              <p className="flex flex-wrap items-center gap-2">
                <TierBadge tier="OCCASIONAL" /> fewer visits than that
              </p>
              <p className="flex flex-wrap items-center gap-2">
                <TierBadge tier="NEW" /> first and only visit within {num("new_within_days")} days
              </p>
              <p className="flex flex-wrap items-center gap-2">
                <TierBadge tier="INACTIVE" /> no visit for more than {num("inactive_after_days")} days
              </p>
            </div>

            <div className="rounded-xl border border-border/70 p-3">
              <p className="mb-2 flex items-center gap-1.5 font-bold">
                <Percent className="h-4 w-4 text-primary" /> Default discount per tier
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {TIER_ORDER.map((t) => (
                  <label key={t} className="flex items-center justify-between gap-3 rounded-lg bg-muted/30 px-3 py-1.5">
                    <span className="text-xs font-bold">{TIER_META[t].label}</span>
                    <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-muted-foreground">
                      <input
                        type="number"
                        min="0"
                        max="50"
                        step="0.5"
                        value={cfg.discounts[t]}
                        onChange={(e) => setCfg({ ...cfg, discounts: { ...cfg.discounts, [t]: e.target.value } })}
                        className="h-7 w-14 rounded-md border border-border bg-background px-1.5 text-center text-xs font-bold outline-none focus:border-primary"
                        aria-label={`${TIER_META[t].label} discount`}
                      />
                      %
                    </span>
                  </label>
                ))}
              </div>
              <label className="mt-3 flex items-center gap-2 text-xs font-semibold">
                <input type="checkbox" checked={cfg.auto_apply_discount} onChange={(e) => setCfg({ ...cfg, auto_apply_discount: e.target.checked })} className="accent-primary" />
                Fill in the customer's discount automatically when billing
              </label>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={save} disabled={saving} className="font-bold">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save rules"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Profile card: tier, stats, and (admin) pin a tier / set a personal discount
export function CustomerTierCard({ customer, canEdit, onChanged }) {
  const [pin, setPin] = useState(customer?.tier_override || "");
  const [disc, setDisc] = useState(customer?.custom_discount ?? "");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setPin(customer?.tier_override || "");
    setDisc(customer?.custom_discount ?? "");
  }, [customer?.id, customer?.tier_override, customer?.custom_discount]);
  if (!customer?.tier) return null;
  const s = customer.stats || {};

  const save = async () => {
    setSaving(true);
    try {
      const r = await axios.put(`${API}/customers/${customer.id}/tier`, { tier_override: pin || null, custom_discount: disc === "" ? null : Number(disc) });
      toast.success("Saved");
      onChanged?.(r.data.customer);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Couldn't save");
    } finally {
      setSaving(false);
    }
  };

  const stat = (label, value) => (
    <div className="rounded-lg bg-muted/30 px-2.5 py-1.5">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-sm font-black tabular-nums">{value}</p>
    </div>
  );

  return (
    <div className="space-y-3 rounded-2xl border border-border/60 bg-muted/10 p-4" data-testid="customer-tier-card">
      <div className="flex flex-wrap items-center gap-2">
        <TierBadge customer={customer} />
        <span className="text-xs font-semibold text-muted-foreground">{visitLine(customer)}</span>
        <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-bold text-primary">
          <Percent className="h-3 w-3" /> {customer.discount_percent || 0}% discount
          <span className="font-semibold opacity-70">{customer.discount_source === "customer" ? "· personal" : "· tier"}</span>
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {stat("Visits (window)", s.visits_window || 0)}
        {stat("All visits", s.visits_total || 0)}
        {stat("Spent", inr(s.spend_total))}
        {stat("Discount given", inr(s.discount_total))}
      </div>
      {canEdit && (
        <div className="flex flex-wrap items-end gap-2 border-t border-border/50 pt-3">
          <label className="text-xs font-bold">
            Tier
            <select
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              className="mt-1 block h-8 rounded-lg border border-border bg-background px-2 text-xs font-bold outline-none focus:border-primary"
              aria-label="Pin a tier"
            >
              <option value="">Automatic ({TIER_META[customer.auto_tier]?.label})</option>
              {TIER_ORDER.map((t) => (
                <option key={t} value={t}>
                  Always {TIER_META[t].label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-bold">
            Personal discount
            <span className="mt-1 flex items-center gap-1">
              <input
                type="number"
                min="0"
                max="50"
                step="0.5"
                value={disc}
                placeholder="tier's"
                onChange={(e) => setDisc(e.target.value)}
                className="h-8 w-20 rounded-lg border border-border bg-background px-2 text-center text-xs font-bold outline-none focus:border-primary"
              />
              %
            </span>
          </label>
          <Button size="sm" onClick={save} disabled={saving} className="h-8 rounded-lg text-xs font-bold">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
          </Button>
        </div>
      )}
    </div>
  );
}

export const TierIcon = Sparkles;
