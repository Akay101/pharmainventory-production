import { useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, CloudOff, Cloud, Database, Loader2, LogOut, RefreshCw } from "lucide-react";
import { API } from "../App";
import { Button } from "../components/ui/button";
import { signOutDesktop, useDesktopStatus } from "../lib/desktop";

const LABELS = {
  bills: "Bills", bill_drafts: "Bill drafts", purchases: "Purchases", purchase_drafts: "Purchase drafts", inventory: "Stock", products: "Products",
  customers: "Customers", suppliers: "Suppliers", reminders: "Reminders", doctors: "Doctors", short_book: "Short book", activities: "Activity log",
  notifications: "Notifications", user_settings: "Settings", bill_prescriptions: "Prescriptions", return_bundles: "Returns", expiry_bundles: "Expiry returns",
};
const when = (ms) => (ms ? new Date(ms).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "Not yet");
const pct = (done, total) => (total ? Math.min(100, Math.round((done / total) * 100)) : 0);

function Bar({ done, total, label }) {
  const value = pct(done, total);
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between gap-3 text-sm"><span>{label}</span><span className="font-mono tabular-nums text-muted-foreground">{done.toLocaleString("en-IN")} / {total.toLocaleString("en-IN")}</span></div>
      <div className="h-2 rounded-full bg-muted overflow-hidden" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className="h-full bg-orange-500 transition-all duration-300" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

const Card = ({ title, children }) => (
  <section className="rounded-2xl border border-border/60 bg-card p-5 space-y-3">
    <h2 className="font-bold">{title}</h2>
    {children}
  </section>
);

export default function SyncCenterPage() {
  const s = useDesktopStatus();
  const [busy, setBusy] = useState(false);
  if (!s) return <div className="p-8 flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading…</div>;

  const syncNow = async () => {
    await axios.post(`${API}/desktop/sync-now`).catch(() => {});
    toast.info(s.online ? "Syncing now" : "No internet right now. It will sync when you're back online.");
  };
  const retry = (seq) => axios.post(`${API}/desktop/conflicts/${seq}/retry`).catch(() => {});
  const signOut = async () => {
    if (!window.confirm("Sign out of this computer? Its copy of your shop's data will be removed. Everything already synced stays safe in your account.")) return;
    setBusy(true);
    try {
      await signOutDesktop(false);
    } catch (err) {
      toast.error(String(err.message || err).replace(/^Error invoking remote method '[^']*': (Error: )?/, ""));
    } finally {
      setBusy(false);
    }
  };

  const synced = s.online && !s.pending && s.phase === "idle" && !s.conflicts.length;
  const StatusIcon = !s.online ? CloudOff : synced ? CheckCircle2 : Cloud;
  const headline = !s.online
    ? s.pending ? `Offline. ${s.pending} change${s.pending === 1 ? "" : "s"} waiting to sync` : "Offline. Everything so far is synced"
    : s.pending ? `Syncing ${s.pending} change${s.pending === 1 ? "" : "s"}` : synced ? "Everything is synced" : "Connected";
  const catalog = s.catalog || {};

  return (
    <div className="max-w-3xl mx-auto space-y-5" data-testid="sync-center">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Sync Center</h1>
          <p className="text-muted-foreground">This computer and your cloud account, kept the same.</p>
        </div>
        <Button variant="outline" onClick={syncNow} disabled={s.phase !== "idle"}><RefreshCw className={`h-4 w-4 mr-2 ${s.phase !== "idle" ? "animate-spin" : ""}`} aria-hidden="true" />Sync now</Button>
      </div>

      <section className="rounded-2xl border border-border/60 bg-card p-5 space-y-4" aria-live="polite">
        <div className="flex items-center gap-3">
          <StatusIcon className={`h-7 w-7 shrink-0 ${!s.online ? "text-amber-500" : synced ? "text-emerald-500" : "text-orange-500"}`} aria-hidden="true" />
          <div>
            <p className="text-lg font-bold" data-testid="sync-headline">{headline}</p>
            <p className="text-sm text-muted-foreground">Last synced: {when(s.last_sync_at)}</p>
          </div>
        </div>
        {s.progress && <Bar done={s.progress.done} total={s.progress.total} label={s.progress.label} />}
        {s.last_error && <p className="text-sm font-semibold text-destructive" role="alert">{s.last_error}</p>}
      </section>

      <Card title="Waiting to reach the cloud">
        {s.pending_by_collection.length ? (
          <ul className="divide-y divide-border/50">
            {s.pending_by_collection.map((row) => (
              <li key={row.coll} className="flex justify-between py-2 text-sm"><span>{LABELS[row.coll] || row.coll}</span><span className="font-mono tabular-nums">{row.n}</span></li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Nothing is waiting.</p>
        )}
      </Card>

      {s.conflicts.length > 0 && (
        <Card title="Needs your attention">
          <ul className="space-y-2">
            {s.conflicts.map((c) => (
              <li key={c.seq} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="flex gap-2 min-w-0"><AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-500" aria-hidden="true" /><span>{[...new Set(c.records.map((r) => LABELS[r] || r))].join(", ")}: {c.detail}</span></span>
                <Button size="sm" variant="outline" onClick={() => retry(c.seq)}>Try again</Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Medicine, doctor and distributor search">
        {catalog.state === "ready" ? (
          <p className="flex items-center gap-2 text-sm"><Database className="h-4 w-4 text-emerald-500" aria-hidden="true" />Ready for offline search.</p>
        ) : catalog.total ? (
          <Bar done={catalog.done} total={catalog.total} label={catalog.state === "paused" ? "Paused. Continues when you're online" : "Downloading"} />
        ) : (
          <p className="text-sm text-muted-foreground">Downloads automatically when you're online.</p>
        )}
      </Card>

      <Card title="Recent activity">
        {s.events.length ? (
          <ul className="space-y-1.5 text-sm">
            {s.events.map((e) => (
              <li key={`${e.at}-${e.text}`} className="flex justify-between gap-4"><span>{e.text}</span><span className="shrink-0 text-muted-foreground">{new Date(e.at).toLocaleTimeString("en-IN", { timeStyle: "short" })}</span></li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Nothing yet.</p>
        )}
      </Card>

      <Card title="This computer">
        <p className="text-sm text-muted-foreground">Works offline until {when(s.licence_valid_until)}. Connect to the internet before then to renew automatically. Version {s.version}.</p>
        <Button variant="outline" className="text-destructive" onClick={signOut} disabled={busy}><LogOut className="h-4 w-4 mr-2" aria-hidden="true" />Sign out of this computer</Button>
      </Card>
    </div>
  );
}
