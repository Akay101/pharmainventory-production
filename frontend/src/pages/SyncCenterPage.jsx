import { useEffect, useState } from "react";
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

const SINGULAR = { bills: "Bill", purchases: "Purchase", inventory: "Batch", products: "Product", customers: "Customer", suppliers: "Supplier", doctors: "Doctor", reminders: "Reminder" };
const fieldName = (f) => f.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
// Values arrive as the cloud stores them: dates as { $date }, lists as arrays
const show = (v) => {
  if (v === null || v === undefined || v === "") return "(empty)";
  if (typeof v === "object" && typeof v.$date === "number") return new Date(v.$date).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  if (Array.isArray(v)) return `${v.length} item${v.length === 1 ? "" : "s"}`;
  if (typeof v === "object") return "(details)";
  return String(v);
};

// One change the cloud held back, with the choices that settle it
function ReviewItem({ item }) {
  const [busy, setBusy] = useState(false);
  const [count, setCount] = useState("");
  const name = `${SINGULAR[item.coll] || LABELS[item.coll] || item.coll}${item.title ? ` "${item.title}"` : ""}`;
  const choose = async (choice, extra = {}) => {
    setBusy(true);
    try {
      await axios.post(`${API}/desktop/review/${item.id}`, { choice, ...extra });
    } catch (err) {
      toast.error(err.response?.data?.detail || "Couldn't save that choice");
    } finally {
      setBusy(false);
    }
  };
  const Choice = ({ choice, children, variant = "outline", extra }) => (
    <Button size="sm" variant={variant} disabled={busy} onClick={() => choose(choice, extra)}>{children}</Button>
  );

  let text;
  let actions;
  if (item.kind === "edited") {
    text = `${name} was changed on another computer or the web while this one changed it too.`;
    actions = <><Choice choice="mine" variant="default">Keep this computer's</Choice><Choice choice="cloud">Keep the other</Choice></>;
  } else if (item.kind === "deleted") {
    text = `${name} was deleted elsewhere, but this computer changed it${item.coll === "inventory" ? " or sold from it" : ""}. Any bill made here is saved either way.`;
    actions = <>{item.can_restore && <Choice choice="restore" variant="default">Bring it back</Choice>}<Choice choice="accept">Leave it deleted</Choice></>;
  } else if (item.kind === "changed_before_delete") {
    text = `${name} was deleted here, but changed elsewhere first (${item.fields.map(fieldName).join(", ")}). It has been kept for now.`;
    actions = <><Choice choice="keep" variant="default">Keep it</Choice><Choice choice="delete">Delete anyway</Choice></>;
  } else if (item.kind === "stock_short") {
    text = `${name}: ${item.short} more ${item.short === 1 ? "unit was" : "units were"} sold than the stock had, across computers. Every bill stands; the stock is now 0. Count the shelf and enter what's there.`;
    actions = (
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (count !== "") choose("count", { quantity: Number(count) }); }}>
        <input type="number" min="0" inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value)} aria-label="Count on the shelf" placeholder="On shelf" className="w-24 rounded-md border border-input bg-background px-2 text-sm" />
        <Button size="sm" type="submit" disabled={busy || count === ""}>Save count</Button>
        <Choice choice="ok">It's right at 0</Choice>
      </form>
    );
  } else if (item.kind === "duplicate_bill_no") {
    text = `Bill number ${item.bill_no} was also used on another computer. Both bills are saved; tell your accountant if it was already filed.`;
    actions = <Choice choice="ok">OK</Choice>;
  }

  return (
    <li className="rounded-xl border border-border/60 p-3 space-y-2 text-sm" data-testid="review-item">
      <p className="flex gap-2"><AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-500" aria-hidden="true" /><span>{text}</span></p>
      {item.kind === "edited" && (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="text-muted-foreground"><tr><th className="font-medium py-1 pr-3">Field</th><th className="font-medium py-1 pr-3">This computer</th><th className="font-medium py-1">Other</th></tr></thead>
            <tbody>
              {Object.entries(item.fields).map(([f, v]) => (
                <tr key={f} className="border-t border-border/50"><td className="py-1 pr-3">{fieldName(f)}</td><td className="py-1 pr-3 font-medium">{show(v.mine)}</td><td className="py-1">{show(v.cloud)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex flex-wrap gap-2">{actions}</div>
    </li>
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
  const [update, setUpdate] = useState(null);
  useEffect(() => {
    const read = () => window.davadeskDesktop?.updateState?.().then(setUpdate).catch(() => {});
    read();
    const t = setInterval(read, 5000);
    return () => clearInterval(t);
  }, []);
  if (!s) return <div className="p-8 flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading…</div>;

  const syncNow = async () => {
    await axios.post(`${API}/desktop/sync-now`).catch(() => {});
    toast.info(s.online ? "Syncing now" : "No internet right now. It will sync when you're back online.");
  };
  const retry = (seq) => axios.post(`${API}/desktop/conflicts/${seq}/retry`).catch(() => {});
  const discard = async (seq) => {
    if (!window.confirm("Drop this change? This computer goes back to the cloud's copy of these records.")) return;
    await axios.post(`${API}/desktop/conflicts/${seq}/discard`).catch((err) => toast.error(err.response?.data?.detail || "Couldn't drop the change"));
  };
  const reviews = s.reviews || [];
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

  const synced = s.online && !s.pending && s.phase === "idle" && !s.conflicts.length && !reviews.length;
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

      {(s.conflicts.length > 0 || reviews.length > 0) && (
        <Card title="Needs your attention">
          <p className="text-sm text-muted-foreground">Everything else has synced. These changes clashed with work done elsewhere, so nothing was overwritten. Choose what to keep.</p>
          <ul className="space-y-2">
            {reviews.map((item) => <ReviewItem key={item.id} item={item} />)}
            {s.conflicts.map((c) => (
              <li key={c.seq} className="rounded-xl border border-border/60 p-3 space-y-2 text-sm">
                <p className="flex gap-2"><AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-500" aria-hidden="true" /><span>The cloud refused a change to {[...new Set(c.records.map((r) => LABELS[r] || r))].join(", ")}: {c.detail}</span></p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => retry(c.seq)}>Try again</Button>
                  <Button size="sm" variant="outline" onClick={() => discard(c.seq)}>Drop this change</Button>
                </div>
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

      {update && update.status !== "none" && (
        <Card title="Update available">
          <p className="text-sm text-muted-foreground">
            {update.status === "ready" ? `Version ${update.latest} is ready. It installs when you close DavaDesk, or now if you restart.` : update.status === "downloading" ? `Downloading version ${update.latest}. You can keep working.` : `Version ${update.latest} is available. Download it and install it over this one; your data stays.`}
          </p>
          {update.status !== "downloading" && <Button onClick={() => window.davadeskDesktop?.applyUpdate()}>{update.status === "ready" ? "Restart to update" : "Download update"}</Button>}
        </Card>
      )}

      <Card title="This computer">
        <p className="text-sm text-muted-foreground">Works offline until {when(s.licence_valid_until)}. Connect to the internet before then to renew automatically. Version {s.version}.</p>
        <Button variant="outline" className="text-destructive" onClick={signOut} disabled={busy}><LogOut className="h-4 w-4 mr-2" aria-hidden="true" />Sign out / switch account</Button>
      </Card>
    </div>
  );
}
