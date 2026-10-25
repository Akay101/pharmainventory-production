import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { CheckCircle2, ClipboardList, Copy, Loader2, PackageCheck, Plus, RefreshCw, RotateCcw, Search, Trash2, Truck } from "lucide-react";
import { API } from "../App";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
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
import { formatCombo } from "../lib/shortcuts";

const TABS = [
  ["pending", "To order"],
  ["ordered", "Ordered"],
  ["received", "Received"],
  ["all", "All"],
];
const STATUS_TONE = {
  pending: "bg-amber-500/10 text-amber-600 border-amber-500/30 dark:text-amber-400",
  ordered: "bg-blue-500/10 text-blue-600 border-blue-500/30 dark:text-blue-400",
  received: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30 dark:text-emerald-400",
  cancelled: "bg-muted text-muted-foreground border-border",
};
const STATUS_LABEL = { pending: "To order", ordered: "Ordered", received: "Received", cancelled: "Cancelled" };
const err = (e, f) => e?.response?.data?.detail || f;
const day = (iso) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "");
const qtyText = (e) => `${e.quantity} ${e.unit === "packs" ? (e.quantity === 1 ? "pack" : "packs") : e.quantity === 1 ? "unit" : "units"}`;

export default function ShortBookPage() {
  const [tab, setTab] = useState("pending");
  const [search, setSearch] = useState("");
  const [data, setData] = useState({ entries: [], counts: {} });
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ product_name: "", quantity: "", unit: "packs", notes: "" });
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState(null);
  const [editing, setEditing] = useState({}); // id -> quantity being typed

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/shortbook`, { params: { status: tab, search: search.trim() || undefined } });
      setData(res.data);
    } catch (e) {
      toast.error(err(e, "Couldn't load the short book"));
    } finally {
      setLoading(false);
    }
  }, [tab, search]);

  useEffect(() => {
    const t = setTimeout(load, search ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  const update = async (entry, patch, msg) => {
    try {
      await axios.patch(`${API}/shortbook/${entry.id}`, patch);
      if (msg) toast.success(msg);
      load();
    } catch (e) {
      toast.error(err(e, "Couldn't update"));
    }
  };

  const saveQty = (entry) => {
    const v = editing[entry.id];
    setEditing((m) => {
      const next = { ...m };
      delete next[entry.id];
      return next;
    });
    if (v === undefined || Number(v) === entry.quantity) return;
    if (!(Number(v) > 0)) return toast.error("Quantity must be more than 0");
    update(entry, { quantity: Number(v) });
  };

  const addManual = async (e) => {
    e?.preventDefault();
    if (!form.product_name.trim()) return toast.error("Enter the medicine");
    if (!(Number(form.quantity) > 0)) return toast.error("Enter a quantity");
    setSaving(true);
    try {
      const res = await axios.post(`${API}/shortbook`, { ...form, quantity: Number(form.quantity) });
      toast.success(res.data.merged ? `Added to ${res.data.entry.product_name} (now ${qtyText(res.data.entry)})` : `${res.data.entry.product_name} added`);
      setAddOpen(false);
      setForm({ product_name: "", quantity: "", unit: "packs", notes: "" });
      if (tab !== "pending") setTab("pending");
      else load();
    } catch (e2) {
      toast.error(err(e2, "Couldn't add"));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    const entry = toDelete;
    setToDelete(null);
    try {
      await axios.delete(`${API}/shortbook/${entry.id}`);
      toast.success(`${entry.product_name} removed`);
      load();
    } catch (e) {
      toast.error(err(e, "Couldn't remove"));
    }
  };

  // Plain-text order list, grouped by last supplier, for WhatsApp / a call
  const orderText = useMemo(() => {
    const pending = data.entries.filter((e) => e.status === "pending");
    if (!pending.length) return "";
    const groups = new Map();
    for (const e of pending) {
      const k = e.last_supplier?.name || "Any supplier";
      groups.set(k, [...(groups.get(k) || []), e]);
    }
    return [...groups.entries()].map(([sup, list]) => `*${sup}*\n${list.map((e, i) => `${i + 1}. ${e.product_name} - ${qtyText(e)}`).join("\n")}`).join("\n\n");
  }, [data.entries]);

  const counts = data.counts || {};
  return (
    <div className="space-y-4 pb-12 animate-in fade-in duration-300">
      <div className="flex flex-col justify-between gap-3 border-b border-border/60 pb-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2.5">
          <div className="rounded-xl border border-orange-500/30 bg-orange-500/10 p-2 text-orange-500">
            <ClipboardList className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight text-foreground sm:text-2xl">Short Book</h1>
            <p className="text-xs font-semibold text-muted-foreground">Medicines to reorder. Add them from a bill's items or by hand.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} className="h-9 rounded-xl" aria-label="Refresh">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          {tab === "pending" && orderText && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigator.clipboard?.writeText(orderText).then(() => toast.success("Order list copied"), () => toast.error("Couldn't copy"))}
              className="h-9 rounded-xl text-xs font-bold"
              title="Copy the list grouped by supplier, to paste in WhatsApp"
            >
              <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy order list
            </Button>
          )}
          <Button size="sm" onClick={() => setAddOpen(true)} className="h-9 rounded-xl bg-orange-600 text-xs font-bold text-white hover:bg-orange-700" data-shortcut="new" data-kbd={formatCombo("alt+n")}>
            <Plus className="mr-1.5 h-4 w-4" /> Add item
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1 overflow-x-auto border-b border-border/60" role="tablist">
          {TABS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`whitespace-nowrap border-b-2 px-4 py-2.5 text-xs font-black transition-colors ${tab === id ? "border-orange-500 bg-orange-500/5 text-orange-600 dark:text-orange-400" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              {label}
              {id !== "all" && counts[id] ? ` (${counts[id]})` : ""}
            </button>
          ))}
        </div>
        <div className="relative sm:w-72">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search medicine, bill no, supplier…" className="h-9 rounded-xl pl-9 text-xs" data-shortcut="search" />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border/70 bg-card/60 shadow-xs">
        <Table mobileCards>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead data-card="title" className="h-10 text-[11px] font-extrabold uppercase tracking-wider">Medicine</TableHead>
              <TableHead className="h-10 text-[11px] font-extrabold uppercase tracking-wider">Reorder qty</TableHead>
              <TableHead className="h-10 text-right text-[11px] font-extrabold uppercase tracking-wider">In stock now</TableHead>
              <TableHead className="h-10 text-[11px] font-extrabold uppercase tracking-wider">Last supplier</TableHead>
              <TableHead className="h-10 text-[11px] font-extrabold uppercase tracking-wider">Noted from</TableHead>
              <TableHead className="h-10 text-center text-[11px] font-extrabold uppercase tracking-wider">Status</TableHead>
              <TableHead data-card="actions" className="h-10 text-right text-[11px] font-extrabold uppercase tracking-wider">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody data-rows>
            {loading && !data.entries.length ? (
              <TableRow>
                <TableCell colSpan={7} className="py-12 text-center">
                  <Loader size="md" text="Loading short book…" />
                </TableCell>
              </TableRow>
            ) : data.entries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                  <ClipboardList className="mx-auto mb-2 h-10 w-10 opacity-40" />
                  <p className="text-xs font-bold uppercase tracking-widest">{search ? "Nothing matches" : tab === "pending" ? "Nothing to reorder" : "Nothing here yet"}</p>
                  <p className="mt-1 text-[11px]">In Billing, open a bill and press “Short book” on an item, or add one here.</p>
                </TableCell>
              </TableRow>
            ) : (
              data.entries.map((e) => (
                <TableRow key={e.id} data-row tabIndex={0} className="hover:bg-muted/40">
                  <TableCell>
                    <p className="text-sm font-bold text-foreground">{e.product_name}</p>
                    {e.notes && <p className="text-[11px] text-muted-foreground">{e.notes}</p>}
                  </TableCell>
                  <TableCell>
                    {e.status === "pending" ? (
                      <div className="flex items-center gap-1.5">
                        <Input
                          type="number"
                          min="1"
                          step="1"
                          inputMode="numeric"
                          aria-label={`Reorder quantity for ${e.product_name}`}
                          value={editing[e.id] ?? e.quantity}
                          onChange={(ev) => setEditing((m) => ({ ...m, [e.id]: ev.target.value }))}
                          onBlur={() => saveQty(e)}
                          onKeyDown={(ev) => ev.key === "Enter" && ev.currentTarget.blur()}
                          className="h-8 w-20 text-center font-mono text-sm font-bold"
                        />
                        <span className="text-xs text-muted-foreground">{e.unit}</span>
                      </div>
                    ) : (
                      <span className="font-mono text-sm font-bold">{qtyText(e)}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    <span className={e.on_hand <= 0 ? "font-bold text-rose-500" : "text-foreground"}>{e.on_hand} units</span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{e.last_supplier?.name || "—"}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(e.sources || []).slice(-3).map((s, i) => (
                        <span key={i} className="rounded-md border border-border bg-muted/50 px-1.5 py-0.5 font-mono text-[10px]" title={`${s.customer_name || ""} · sold ${s.sold_units} · +${s.quantity} ${s.unit}`}>
                          {s.bill_no}
                        </span>
                      ))}
                      {(e.sources || []).length > 3 && <span className="text-[10px] text-muted-foreground">+{e.sources.length - 3}</span>}
                      {!(e.sources || []).length && <span className="text-[11px] text-muted-foreground">Added by hand</span>}
                      <span className="w-full text-[10px] text-muted-foreground">{day(e.created_at)}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-black ${STATUS_TONE[e.status]}`}>{STATUS_LABEL[e.status]}</span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-wrap items-center justify-end gap-1">
                      {e.status === "pending" && (
                        <Button variant="outline" size="sm" onClick={() => update(e, { status: "ordered" }, `${e.product_name} marked ordered`)} className="h-8 rounded-lg px-2 text-[11px] font-bold" data-row-key="o" title="Mark ordered (O)">
                          <Truck className="mr-1 h-3.5 w-3.5" /> Ordered
                        </Button>
                      )}
                      {(e.status === "pending" || e.status === "ordered") && (
                        <Button variant="outline" size="sm" onClick={() => update(e, { status: "received" }, `${e.product_name} received`)} className="h-8 rounded-lg px-2 text-[11px] font-bold text-emerald-600" data-row-key="r" title="Mark received (R)">
                          <PackageCheck className="mr-1 h-3.5 w-3.5" /> Received
                        </Button>
                      )}
                      {e.status !== "pending" && (
                        <Button variant="ghost" size="sm" onClick={() => update(e, { status: "pending" }, `${e.product_name} is back on the list`)} className="h-8 rounded-lg px-2 text-[11px] font-bold" title="Back to the list">
                          <RotateCcw className="mr-1 h-3.5 w-3.5" /> Reopen
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" onClick={() => setToDelete(e)} className="h-8 w-8 rounded-lg text-rose-500 hover:bg-rose-500/10" data-row-key="delete" aria-label={`Remove ${e.product_name}`} title="Remove (Del)">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md rounded-3xl p-5 sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-black">Add to short book</DialogTitle>
            <DialogDescription className="text-xs">If it's already on the list, the quantity is added to it.</DialogDescription>
          </DialogHeader>
          <form onSubmit={addManual} className="space-y-3">
            <div>
              <Label htmlFor="sb-name" className="text-xs font-bold">Medicine</Label>
              <Input id="sb-name" autoFocus value={form.product_name} onChange={(e) => setForm((f) => ({ ...f, product_name: e.target.value }))} placeholder="e.g. Dolo 650" className="mt-1 h-10 rounded-xl" maxLength={200} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="sb-qty" className="text-xs font-bold">Quantity</Label>
                <Input id="sb-qty" type="number" min="1" inputMode="numeric" value={form.quantity} onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))} className="mt-1 h-10 rounded-xl font-mono font-bold" />
              </div>
              <div>
                <Label className="text-xs font-bold">In</Label>
                <div className="mt-1 grid h-10 grid-cols-2 gap-1 rounded-xl border border-border p-1" role="radiogroup">
                  {["packs", "units"].map((u) => (
                    <button key={u} type="button" role="radio" aria-checked={form.unit === u} onClick={() => setForm((f) => ({ ...f, unit: u }))} className={`rounded-lg text-xs font-bold ${form.unit === u ? "bg-orange-600 text-white" : "text-muted-foreground"}`}>
                      {u === "packs" ? "Packs" : "Units"}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div>
              <Label htmlFor="sb-notes" className="text-xs font-bold">Note</Label>
              <Input id="sb-notes" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Optional, e.g. customer waiting" className="mt-1 h-10 rounded-xl" maxLength={300} />
            </div>
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)} className="rounded-xl text-xs font-bold">
                Cancel
              </Button>
              <Button type="submit" disabled={saving} className="rounded-xl bg-orange-600 text-xs font-bold text-white hover:bg-orange-700" data-shortcut="save">
                {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-4 w-4" />}
                Add
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {toDelete?.product_name}?</AlertDialogTitle>
            <AlertDialogDescription>It leaves the short book, and the bills it came from no longer show it as added.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <AlertDialogAction className="bg-rose-600 text-white hover:bg-rose-700" onClick={remove}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
