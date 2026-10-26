import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { AlertTriangle, Bell, CheckCircle2, Loader2, MessageCircle, Package, PackageCheck, RefreshCw, RotateCcw, Search, ShoppingCart } from "lucide-react";
import { API } from "../App";
import { Button } from "../components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../components/ui/alert-dialog";
import Loader from "../components/Loader";
import { openWhatsApp } from "../utils/whatsapp";

// Restock: medicines customers will come back for (from refill reminders on
// bills). Each one shows what's on the shelf against what's needed; it's done
// automatically once stock covers it, or by hand (an override).
const VIEWS = [
  ["open", "To restock"],
  ["due", "Due now"],
  ["done", "Done"],
  ["all", "All"],
];
const fmtDay = (ymd) =>
  /^\d{4}-\d{2}-\d{2}/.test(ymd || "") ? new Date(`${ymd.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "-";
const fmtStamp = (iso) => (iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: true }) : "");

function StatusBadge({ r, today }) {
  const st = r.restock?.status || "PENDING";
  if (st === "DONE") {
    return (
      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide ${r.restock.done_by === "manual" ? "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-300" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"}`}>
        <CheckCircle2 className="h-3 w-3" /> {r.restock.done_by === "manual" ? "Done · by hand" : "Restocked"}
      </span>
    );
  }
  if (st === "ORDERED") {
    return <span className="inline-flex items-center gap-1 rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-violet-600 dark:text-violet-300"><ShoppingCart className="h-3 w-3" /> Ordered</span>;
  }
  const due = r.reminder_date && r.reminder_date <= today;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide ${due ? "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-300" : "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-300"}`}>
      <AlertTriangle className="h-3 w-3" /> {due ? "Due · needs stock" : "Needs stock"}
    </span>
  );
}

export default function RestockPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [view, setView] = useState(location.state?.highlightId ? "all" : "open");
  const [search, setSearch] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null); // reminder id being worked on
  const [override, setOverride] = useState(null); // { reminder, short }
  const [highlight, setHighlight] = useState(location.state?.highlightId || null);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const n = ++seq.current;
    setLoading(true);
    try {
      const res = await axios.get(`${API}/reminders/restock`, { params: { view, search: search || undefined } });
      if (n === seq.current) setData(res.data);
    } catch (err) {
      if (n === seq.current) toast.error(err.response?.data?.detail || "Couldn't load restock list");
    } finally {
      if (n === seq.current) setLoading(false);
    }
  }, [view, search]);

  useEffect(() => {
    const t = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  useEffect(() => {
    document.title = "Restock - DavaDesk";
    if (location.state?.highlightId) window.history.replaceState({}, document.title);
  }, []); // eslint-disable-line

  // Scroll to and flash the reminder opened from a notification
  useEffect(() => {
    if (!highlight || !data) return;
    const el = document.getElementById(`restock-${highlight}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      const t = setTimeout(() => setHighlight(null), 2500);
      return () => clearTimeout(t);
    }
  }, [highlight, data]);

  const orderStock = async (r) => {
    setBusy(r.id);
    try {
      const res = await axios.post(`${API}/reminders/${r.id}/purchase-draft`);
      navigate("/purchases", { state: { openPurchaseDraft: res.data.draft.id } });
    } catch (err) {
      toast.error(err.response?.data?.detail || "Couldn't prepare the purchase");
      setBusy(null);
    }
  };

  const markDone = async (r, force = false) => {
    setBusy(r.id);
    try {
      const res = await axios.post(`${API}/reminders/${r.id}/restock`, { action: "done", force });
      toast.success(res.data.auto ? res.data.message : force ? "Marked done by hand" : "Marked done");
      setOverride(null);
      await load();
    } catch (err) {
      if (err.response?.status === 409 && err.response.data?.code === "STOCK_SHORT") {
        setOverride({ reminder: r, short: err.response.data.short || [] });
      } else {
        toast.error(err.response?.data?.detail || "Couldn't update");
      }
    } finally {
      setBusy(null);
    }
  };

  const reopen = async (r) => {
    setBusy(r.id);
    try {
      await axios.post(`${API}/reminders/${r.id}/restock`, { action: "reopen" });
      toast.success("Reopened");
      await load();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Couldn't reopen");
    } finally {
      setBusy(null);
    }
  };

  const counts = data?.counts || {};
  const list = data?.reminders || [];

  return (
    <div className="space-y-5 pb-16" data-testid="restock-page">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight">
            <PackageCheck className="h-6 w-6 text-orange-500" /> Restock
          </h1>
          <p className="mt-1 text-sm font-semibold text-muted-foreground">
            Medicines your customers will come back for. Each one closes by itself once the stock is back; you can also mark it done by hand.
          </p>
        </div>
        <Button variant="outline" onClick={load} disabled={loading} className="h-10 rounded-xl font-bold">
          <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Check stock
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {VIEWS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setView(id)}
            className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-xs font-bold transition-colors ${view === id ? "border-primary bg-primary text-primary-foreground shadow-xs" : "border-border/70 bg-card/60 hover:bg-muted"}`}
          >
            {label}
            {counts[id] !== undefined && <span className="opacity-70">{counts[id]}</span>}
          </button>
        ))}
        <div className="relative ml-auto w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Customer, mobile, medicine, bill"
            data-shortcut="search"
            className="h-9 w-full rounded-xl border border-border bg-card pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>
      </div>

      {!data && loading ? (
        <Loader size="md" text="Checking stock..." />
      ) : list.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center">
          <PackageCheck className="mx-auto h-10 w-10 text-muted-foreground/40" />
          <p className="mt-3 text-sm font-bold">{view === "done" ? "Nothing restocked yet" : "Nothing to restock"}</p>
          <p className="mt-1 text-xs text-muted-foreground">Turn on a refill reminder while billing and the medicines show up here.</p>
        </div>
      ) : (
        <div className={`grid gap-3 transition-opacity ${loading ? "opacity-60" : ""}`}>
          {list.map((r) => {
            const done = r.restock?.status === "DONE";
            const coveredCount = (r.items || []).filter((i) => i.covered).length;
            return (
              <div
                key={r.id}
                id={`restock-${r.id}`}
                className={`rounded-2xl border bg-card p-4 shadow-sm transition-all ${highlight === r.id ? "border-orange-500 ring-4 ring-orange-500/20" : "border-border/70"}`}
                data-testid="restock-card"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-base font-black">{r.customer_name || "Customer"}</p>
                      <StatusBadge r={r} today={data.today} />
                    </div>
                    <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs font-semibold text-muted-foreground">
                      {r.customer_mobile && <span>{r.customer_mobile}</span>}
                      {r.bill_no && <span>Bill {r.bill_no}</span>}
                      <span className="flex items-center gap-1">
                        <Bell className="h-3 w-3" /> Remind {fmtDay(r.reminder_date)}
                      </span>
                      <span>Runs out {fmtDay(r.refill_target_date)}</span>
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {r.customer_mobile && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          openWhatsApp({
                            phone: r.customer_mobile,
                            message: `Hello ${r.customer_name || ""}, your medicines (${(r.items || []).map((i) => i.product_name).join(", ")}) will run out around ${fmtDay(r.refill_target_date)}. They're ready for you at our pharmacy.`,
                          })
                        }
                        className="h-8 rounded-lg border-emerald-500/30 text-xs font-bold text-emerald-600"
                      >
                        <MessageCircle className="mr-1 h-3.5 w-3.5" /> WhatsApp
                      </Button>
                    )}
                    {!done && (
                      <Button size="sm" variant="outline" disabled={busy === r.id} onClick={() => orderStock(r)} className="h-8 rounded-lg border-orange-500/30 text-xs font-bold text-orange-600" data-testid="restock-order">
                        <Package className="mr-1 h-3.5 w-3.5" /> {r.purchase_draft_id ? "Open purchase draft" : "Order stock"}
                      </Button>
                    )}
                    {!done ? (
                      <Button size="sm" disabled={busy === r.id} onClick={() => markDone(r)} className="h-8 rounded-lg text-xs font-bold" data-testid="restock-done">
                        {busy === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-1 h-3.5 w-3.5" />} Mark done
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" disabled={busy === r.id} onClick={() => reopen(r)} className="h-8 rounded-lg text-xs font-bold">
                        <RotateCcw className="mr-1 h-3.5 w-3.5" /> Reopen
                      </Button>
                    )}
                  </div>
                </div>

                <div className="mt-3 overflow-hidden rounded-xl border border-border/60">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-left">Medicine</th>
                        <th className="px-3 py-2 text-right">Needed</th>
                        <th className="px-3 py-2 text-right">In stock</th>
                        <th className="px-3 py-2 text-left">Stock</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(r.items || []).map((i, k) => (
                        <tr key={`${i.product_name}-${k}`} className="border-t border-border/50">
                          <td className="px-3 py-2 font-bold">
                            {i.product_name}
                            {i.dose_per_day ? <span className="ml-1.5 text-[11px] font-semibold text-muted-foreground">{i.dose_per_day}/day</span> : null}
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-bold">{i.needed}</td>
                          <td className="px-3 py-2 text-right font-mono">{i.in_stock ?? "-"}</td>
                          <td className="px-3 py-2">
                            {i.covered === undefined ? (
                              <span className="text-xs text-muted-foreground">-</span>
                            ) : i.covered ? (
                              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                                Enough{i.purchased?.invoice_no ? ` · bought on ${i.purchased.invoice_no}` : ""}
                              </span>
                            ) : (
                              <span className="text-xs font-bold text-rose-600 dark:text-rose-400">Short by {Math.max(0, i.needed - (i.in_stock || 0))}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-[11px] font-semibold text-muted-foreground">
                  {done
                    ? `${r.restock.reason || "Done"} · ${fmtStamp(r.restock.done_at)}${r.restock.done_by_user ? ` · ${r.restock.done_by_user}` : ""}`
                    : `${coveredCount} of ${(r.items || []).length} medicine${(r.items || []).length === 1 ? "" : "s"} in stock${r.restock?.ordered_at ? ` · purchase draft made ${fmtStamp(r.restock.ordered_at)}` : ""}`}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* Manual override when stock is still short */}
      <AlertDialog open={!!override} onOpenChange={(o) => !o && setOverride(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Stock isn't back yet</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>For {override?.reminder?.customer_name || "this customer"}, these are still short:</p>
                <ul className="space-y-1">
                  {(override?.short || []).map((s) => (
                    <li key={s.product_name} className="flex justify-between gap-3 rounded-lg bg-muted/40 px-3 py-1.5 text-xs font-semibold">
                      <span className="text-foreground">{s.product_name}</span>
                      <span>
                        {s.in_stock} in stock · needs {s.needed}
                      </span>
                    </li>
                  ))}
                </ul>
                <p>Mark it done anyway? Use this when the stock came and was sold, or you've arranged it another way.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep open</AlertDialogCancel>
            <AlertDialogAction onClick={() => override && markDone(override.reminder, true)} data-testid="restock-force">
              Mark done anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
