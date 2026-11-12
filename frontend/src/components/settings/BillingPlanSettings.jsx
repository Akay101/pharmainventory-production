// Settings › Billing & plan (owner and admins): the plan, add-ons with their
// end dates and renewals, extra users, linked pharmacies, and GST invoices.
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Building2, CalendarClock, Download, FileText, Loader2, Mail, Plus, RefreshCw, UserPlus } from "lucide-react";
import { API, useAuth } from "../../App";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import AddonCheckoutDialog from "../billing/AddonCheckoutDialog";
import BuySeatsDialog from "../billing/BuySeatsDialog";
import { LinkPharmacyDialog } from "../billing/PharmacySwitcher";
import { formatDay, formatINR, PLAN_NAMES } from "../../lib/checkout";

const STATUS_TONE = {
  ACTIVE: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  TRIAL: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  EXPIRED: "bg-rose-500/10 text-rose-700 dark:text-rose-400",
  ENDED: "bg-muted text-muted-foreground",
  NONE: "bg-muted text-muted-foreground",
};
const Pill = ({ status, children }) => <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-extrabold ${STATUS_TONE[status] || STATUS_TONE.NONE}`}>{children || status}</span>;
const daysLeft = (d) => Math.ceil((new Date(d) - Date.now()) / 86400000);

export async function downloadInvoice(inv) {
  const r = await axios.get(`${API}/billing/invoices/${inv.id}/pdf`, { responseType: "blob" });
  const url = URL.createObjectURL(r.data);
  const a = document.createElement("a");
  a.href = url;
  a.download = `DavaDesk-Invoice-${inv.invoice_no.replace(/\//g, "-")}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export default function BillingPlanSettings({ active }) {
  const navigate = useNavigate();
  const { isOwner } = useAuth();
  const [status, setStatus] = useState(null);
  const [invoices, setInvoices] = useState(null);
  const [renew, setRenew] = useState(null);
  const [seatsOpen, setSeatsOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    try {
      const [s, i] = await Promise.all([axios.get(`${API}/billing/status`), axios.get(`${API}/billing/invoices`)]);
      setStatus(s.data);
      setInvoices(i.data.invoices);
    } catch (e) {
      if (!e.permissionToastShown) toast.error(e.response?.data?.detail || "Couldn't load billing");
    }
  }, []);
  useEffect(() => {
    if (active) load();
  }, [active, load]);

  if (!status) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  const sub = status.subscription;
  const paid = sub.status === "ACTIVE" && sub.kind !== "TRIAL";
  const seats = status.addons?.filter((a) => a.type === "USER_SEAT") || [];
  const linked = status.addons?.filter((a) => a.type === "PHARMACY") || [];

  const email = async (inv) => {
    setBusy(inv.id);
    try {
      const r = await axios.post(`${API}/billing/invoices/${inv.id}/email`);
      toast.success(r.data.message);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Couldn't send the invoice");
    } finally {
      setBusy(null);
    }
  };
  const download = async (inv) => {
    setBusy(`d${inv.id}`);
    try {
      await downloadInvoice(inv);
    } catch {
      toast.error("Couldn't download the invoice");
    } finally {
      setBusy(null);
    }
  };

  const RenewBtn = ({ a }) =>
    a.status !== "ENDED" && (
      <Button size="sm" variant={a.status === "EXPIRED" || daysLeft(a.ends_at) <= 7 ? "default" : "outline"} className="rounded-xl h-8" disabled={!paid} onClick={() => setRenew(a)} data-testid={`renew-${a.id}`}>
        <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Renew
      </Button>
    );

  return (
    <div className="space-y-6" data-testid="billing-plan">
      <Card className="bg-card/50 backdrop-blur-sm border-white/5">
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CalendarClock className="w-5 h-5 text-primary" /> {PLAN_NAMES[sub.plan] || sub.plan || "No plan"}
            </CardTitle>
            <CardDescription>
              {sub.status === "NONE"
                ? "Choose a plan to start using DavaDesk."
                : sub.status === "EXPIRED"
                  ? `Ended on ${formatDay(sub.ends_at)}. Renew to turn everything back on; your records are safe.`
                  : `${sub.status === "TRIAL" ? "Free trial" : "Active"} until ${formatDay(sub.ends_at)} · ${sub.days_left} day${sub.days_left === 1 ? "" : "s"} left`}
            </CardDescription>
          </div>
          <Pill status={sub.status}>{sub.status === "NONE" ? "No plan" : sub.status}</Pill>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button className="rounded-xl font-bold text-white bg-gradient-to-r from-orange-500 to-amber-500" onClick={() => navigate("/upgrade")} data-testid="renew-plan-btn">
            {paid ? "Renew plan" : "Choose plan"}
          </Button>
        </CardContent>
      </Card>

      <Card className="bg-card/50 backdrop-blur-sm border-white/5">
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-primary" /> Pharmacist users
            </CardTitle>
            <CardDescription>
              {status.seats ? `${status.seats.total} licence${status.seats.total === 1 ? "" : "s"} (${status.seats.included} included with the plan, ${status.seats.purchased} extra) · ${status.seats.free} free` : ""}
            </CardDescription>
          </div>
          {isOwner && (
            <Button size="sm" variant="outline" className="rounded-xl" disabled={!paid} onClick={() => setSeatsOpen(true)} data-testid="buy-seats-btn">
              <Plus className="w-4 h-4 mr-1" /> Add users
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-2">
          {!paid && <p className="text-xs font-semibold text-muted-foreground">Extra users and pharmacies can be added once you're on a paid plan.</p>}
          {seats.length === 0 ? (
            <p className="text-sm text-muted-foreground font-semibold">No extra users yet.</p>
          ) : (
            seats.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-border/70 bg-card/60 p-3 text-sm" data-testid="seat-row">
                <div className="min-w-0 flex-1">
                  <p className="font-bold">{a.user_name ? `Licence for ${a.user_name}` : "Unassigned licence"}</p>
                  <p className="text-xs font-semibold text-muted-foreground">
                    {a.cycle === "MONTHLY" ? "Monthly" : a.cycle === "YEARLY" ? "Yearly" : "Complimentary"} · {a.status === "ACTIVE" ? `until ${formatDay(a.ends_at)}` : `${a.status === "ENDED" ? "ended" : "expired"} ${formatDay(a.ends_at)}`}
                  </p>
                </div>
                <Pill status={a.status} />
                {isOwner && <RenewBtn a={a} />}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card className="bg-card/50 backdrop-blur-sm border-white/5">
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-primary" /> Linked pharmacies
            </CardTitle>
            <CardDescription>Other pharmacies on this account, each with separate records. Switch between them from the pharmacy name at the top left.</CardDescription>
          </div>
          {isOwner && (
            <Button size="sm" variant="outline" className="rounded-xl" disabled={!paid} onClick={() => setLinkOpen(true)}>
              <Plus className="w-4 h-4 mr-1" /> Link pharmacy
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-2">
          {linked.length === 0 ? (
            <p className="text-sm text-muted-foreground font-semibold">No linked pharmacies.</p>
          ) : (
            linked.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-border/70 bg-card/60 p-3 text-sm" data-testid="linked-row">
                <div className="min-w-0 flex-1">
                  <p className="font-bold">{a.pharmacy_name || "Pharmacy"}</p>
                  <p className="text-xs font-semibold text-muted-foreground">{a.status === "ACTIVE" ? `Yearly · until ${formatDay(a.ends_at)}` : `Switched off · ${a.status === "ENDED" ? "ended" : "expired"} ${formatDay(a.ends_at)}`}</p>
                </div>
                <Pill status={a.status} />
                {isOwner && <RenewBtn a={a} />}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card className="bg-card/50 backdrop-blur-sm border-white/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" /> Invoices
          </CardTitle>
          <CardDescription>GST tax invoices for your DavaDesk payments.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {!invoices?.length ? (
            <p className="text-sm text-muted-foreground font-semibold">No invoices yet.</p>
          ) : (
            invoices.map((inv) => (
              <div key={inv.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-border/70 bg-card/60 p-3 text-sm" data-testid="invoice-row">
                <div className="min-w-0 flex-1">
                  <p className="font-bold">
                    {inv.invoice_no} · {formatINR(inv.total_paise)}
                  </p>
                  <p className="text-xs font-semibold text-muted-foreground truncate">
                    {formatDay(inv.issued_at)} · {inv.description}
                  </p>
                </div>
                <Button size="sm" variant="outline" className="rounded-xl h-8" disabled={busy === `d${inv.id}`} onClick={() => download(inv)}>
                  {busy === `d${inv.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Download className="w-3.5 h-3.5 mr-1.5" /> PDF</>}
                </Button>
                <Button size="sm" variant="ghost" className="rounded-xl h-8" disabled={busy === inv.id} onClick={() => email(inv)}>
                  {busy === inv.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Mail className="w-3.5 h-3.5 mr-1.5" /> Email</>}
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {renew && (
        <AddonCheckoutDialog
          open={!!renew}
          onOpenChange={(o) => !o && setRenew(null)}
          request={renew.type === "USER_SEAT" ? { kind: "RENEW", addon_id: renew.id, cycle: renew.cycle === "MONTHLY" ? "MONTHLY" : "YEARLY" } : { kind: "RENEW", addon_id: renew.id }}
          title={renew.type === "USER_SEAT" ? "Renew user licence" : `Renew ${renew.pharmacy_name || "linked pharmacy"}`}
          description={renew.status === "ACTIVE" ? `Adds time after the current end date (${formatDay(renew.ends_at)}).` : "Turns it back on from today."}
        />
      )}
      {seatsOpen && <BuySeatsDialog open={seatsOpen} onOpenChange={setSeatsOpen} />}
      {linkOpen && <LinkPharmacyDialog open={linkOpen} onOpenChange={setLinkOpen} />}
    </div>
  );
}
