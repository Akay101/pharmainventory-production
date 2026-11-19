import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Undo2, Plus, Search, RefreshCw, Printer, Loader2, Ban, ReceiptText, Wallet, Banknote, ArrowLeftRight, ChevronLeft, ChevronRight, PackageCheck, PackageX } from "lucide-react";
import { API } from "../../App";
import { useAccess } from "../access/Can";
import { Card, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import Loader from "../Loader";
import { formatCombo } from "../../lib/shortcuts";
import SalesReturnDialog, { inr } from "./SalesReturnDialog";

const errText = (e, f) => e?.response?.data?.detail || f;

const RefundBadge = ({ r }) => {
  if (r.status === "Cancelled") return <Badge variant="outline" className="text-[10px] font-bold text-muted-foreground">Cancelled</Badge>;
  if (!r.refund_amount) return <Badge className="text-[10px] font-bold bg-blue-500/10 text-blue-600 border-blue-500/30">Off dues</Badge>;
  if (r.refund_mode === "Advance") return <Badge className="text-[10px] font-bold bg-violet-500/10 text-violet-600 border-violet-500/30">To advance</Badge>;
  return <Badge className="text-[10px] font-bold bg-teal-500/10 text-teal-600 border-teal-500/30">Refund · {r.refund_mode}</Badge>;
};

// Finds the bill a return is made against
function BillPicker({ open, onClose, onPick }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!open) return;
    let live = true;
    setLoading(true);
    const t = setTimeout(() => {
      axios
        .get(`${API}/sales-returns/bills`, { params: { search: q } })
        .then((res) => live && setRows(res.data.bills || []))
        .catch(() => live && setRows([]))
        .finally(() => live && setLoading(false));
    }, q ? 250 : 0);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [open, q]);
  useEffect(() => {
    if (open) setQ("");
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl rounded-2xl p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-lg font-black">Which bill is this return against?</DialogTitle>
          <DialogDescription className="text-xs">Search by bill number, customer name or mobile, or a medicine on the bill.</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
          <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="BILL-2026…, Asha, 98…, Dolo" className="pl-9 h-9 text-sm" data-testid="sr-bill-search" />
        </div>
        <div className="max-h-[50vh] overflow-y-auto rounded-xl border border-border/70 divide-y divide-border/60">
          {loading ? (
            <div className="py-10">
              <Loader size="sm" text="Finding bills…" />
            </div>
          ) : rows.length === 0 ? (
            <p className="py-10 text-center text-xs text-muted-foreground font-bold">No bills found{q ? ` for "${q}"` : ""}</p>
          ) : (
            rows.map((b) => (
              <button key={b.id} type="button" onClick={() => onPick(b)} className="w-full text-left p-3 hover:bg-muted/50 flex items-center justify-between gap-3" data-testid={`sr-pick-${b.id}`}>
                <div className="min-w-0">
                  <p className="text-sm font-bold truncate">
                    <span className="font-mono text-primary">{b.bill_no}</span> · {b.customer_name || "Walk-in"}
                  </p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {b.billing_date} · {b.item_count} item(s): {(b.items || []).join(", ")}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-mono font-black">{inr(b.grand_total)}</p>
                  {b.return_status && <p className="text-[10px] font-bold text-teal-600">Part returned</p>}
                </div>
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function SalesReturnsPage({ onSwitch }) {
  const acc = useAccess("returns");
  const bill = useAccess("billing");
  const canCreate = acc.create || bill.update;
  const canCancel = acc.delete || bill.delete;

  const [rows, setRows] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("Completed");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, total_pages: 1 });
  const [picker, setPicker] = useState(false);
  const [returnFor, setReturnFor] = useState(null);
  const [detail, setDetail] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: 15, status };
      if (search) params.search = search;
      const res = await axios.get(`${API}/sales-returns`, { params });
      setRows(res.data.returns || []);
      setStats(res.data.stats || {});
      setPagination(res.data.pagination || { total: 0, total_pages: 1 });
    } catch (e) {
      toast.error(errText(e, "Couldn't load sales returns"));
    } finally {
      setLoading(false);
    }
  }, [page, search, status]);

  useEffect(() => {
    const t = setTimeout(load, search ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  const openPdf = async (r) => {
    const win = window.open("", "_blank");
    setPdfBusy(r.id);
    try {
      const res = await axios.get(`${API}/sales-returns/${r.id}/pdf`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      if (win) win.location.href = url;
      else window.location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch {
      win?.close();
      toast.error("Couldn't make the PDF. Please try again.");
    } finally {
      setPdfBusy(null);
    }
  };

  const cancelReturn = async (r) => {
    setBusy(true);
    try {
      const res = await axios.post(`${API}/sales-returns/${r.id}/cancel`, {});
      toast.success(res.data.message);
      if (res.data.refund_to_recover > 0) toast.warning(`Take back the ${inr(res.data.refund_to_recover)} refunded to the customer.`);
      if (res.data.stock_shortfall?.length) {
        toast.warning(`Some returned units were already sold again: ${res.data.stock_shortfall.map((s) => `${s.product_name} ${s.units}u`).join(", ")}. Check stock.`);
      }
      setDetail(null);
      setConfirm(null);
      load();
    } catch (e) {
      toast.error(errText(e, "Couldn't cancel the return"));
    } finally {
      setBusy(false);
    }
  };

  const cards = [
    { label: "Sales returns", value: stats.count || 0, hint: `${stats.full_bills || 0} whole bill(s) · ${stats.units || 0} units`, icon: Undo2, tone: "text-teal-600 bg-teal-500/10 border-teal-500/30" },
    { label: "Return value", value: inr(stats.value), hint: "Taken off sales", icon: ReceiptText, tone: "text-rose-600 bg-rose-500/10 border-rose-500/30" },
    { label: "Refunded", value: inr(stats.refunded), hint: "Cash, UPI and card", icon: Banknote, tone: "text-amber-600 bg-amber-500/10 border-amber-500/30" },
    { label: "Off dues / advance", value: inr((stats.adjusted || 0) + (stats.to_advance || 0)), hint: `${inr(stats.to_advance)} kept as advance`, icon: Wallet, tone: "text-violet-600 bg-violet-500/10 border-violet-500/30" },
  ];

  return (
    <div className="space-y-4 pb-12 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-border/60">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-2 rounded-xl bg-teal-500/10 border border-teal-500/30 text-teal-600 shrink-0">
            <Undo2 className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-black text-foreground tracking-tight">Sales Returns</h1>
            <p className="text-xs font-semibold text-muted-foreground">Goods customers bring back against their bills</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={onSwitch} className="h-9 rounded-xl text-xs font-bold" data-testid="switch-to-purchase-returns">
            <ArrowLeftRight className="w-3.5 h-3.5 mr-1.5" />
            Purchase returns
          </Button>
          <Button variant="outline" size="sm" onClick={load} className="h-9 rounded-xl text-xs font-bold" title="Refresh">
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
          <Button size="sm" hidden={!canCreate} onClick={() => setPicker(true)} className="h-9 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-md" data-shortcut="new" data-kbd={formatCombo("alt+n")} data-testid="new-sales-return">
            <Plus className="w-4 h-4 mr-1.5" />
            New Sales Return
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((c) => (
          <Card key={c.label} className="rounded-2xl border-border/70 bg-card/60 shadow-xs">
            <CardContent className="p-3 sm:p-4 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] sm:text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground truncate">{c.label}</p>
                <p className="text-lg sm:text-2xl font-black font-mono text-foreground mt-0.5 truncate">{c.value}</p>
                <p className="text-[10px] font-semibold text-muted-foreground mt-0.5 truncate">{c.hint}</p>
              </div>
              <div className={`hidden sm:block p-3 rounded-xl border ${c.tone}`}>
                <c.icon className="w-5 h-5" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-2 p-3 rounded-2xl bg-card/60 border border-border/70">
        <div className="relative flex-1 min-w-0">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search return #, bill #, customer, product…"
            className="pl-9 h-9 text-xs rounded-xl bg-background"
            data-shortcut="search"
          />
        </div>
        <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
          <SelectTrigger className="sm:w-44 h-9 text-xs font-semibold rounded-xl bg-background">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Completed">Active returns</SelectItem>
            <SelectItem value="Cancelled">Cancelled</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-2xl border border-border/70 bg-card/60 overflow-hidden shadow-xs">
        <Table mobileCards>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead data-card="title" className="font-extrabold text-[11px] uppercase tracking-wider h-10">Return #</TableHead>
              <TableHead className="font-extrabold text-[11px] uppercase tracking-wider h-10">Bill</TableHead>
              <TableHead className="font-extrabold text-[11px] uppercase tracking-wider h-10">Customer</TableHead>
              <TableHead className="font-extrabold text-[11px] uppercase tracking-wider h-10">Date</TableHead>
              <TableHead className="font-extrabold text-[11px] uppercase tracking-wider h-10 text-center">Items</TableHead>
              <TableHead className="font-extrabold text-[11px] uppercase tracking-wider h-10 text-right">Value</TableHead>
              <TableHead className="font-extrabold text-[11px] uppercase tracking-wider h-10 text-center">Settled as</TableHead>
              <TableHead data-card="actions" className="w-24 text-right font-extrabold text-[11px] uppercase tracking-wider h-10">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody data-rows>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="py-12 text-center">
                  <Loader size="md" text="Loading returns…" />
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-12 text-center text-muted-foreground">
                  <Undo2 className="w-10 h-10 mx-auto mb-2 opacity-40" />
                  <p className="text-xs font-bold uppercase tracking-widest">{search ? "No returns match" : "No sales returns yet"}</p>
                  <p className="text-[11px] mt-1">Start one here, or from the bill with its return button.</p>
                  <Button size="sm" hidden={!canCreate} onClick={() => setPicker(true)} className="mt-3 h-8 text-xs font-bold rounded-xl bg-teal-600 hover:bg-teal-700 text-white">
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    New Sales Return
                  </Button>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.id} className={`hover:bg-muted/40 cursor-pointer ${r.status === "Cancelled" ? "opacity-60" : ""}`} onClick={() => setDetail(r)} tabIndex={0} data-row>
                  <TableCell className="font-mono text-xs font-black text-teal-600 dark:text-teal-400">
                    {r.return_no}
                    <span className="block text-[10px] font-sans font-semibold text-muted-foreground">{r.type === "full" ? "Whole bill" : "Part"} · {r.reason}</span>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{r.bill_no}</TableCell>
                  <TableCell className="text-xs font-bold truncate max-w-[180px]">{r.customer_name}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{r.return_date}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant="outline" className="text-[10px] font-bold px-2 py-0">
                      {(r.items || []).length} · {r.total_units}u
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs font-bold">{inr(r.total_amount)}</TableCell>
                  <TableCell className="text-center">
                    <RefundBadge r={r} />
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openPdf(r)} disabled={pdfBusy === r.id} className="h-8 w-8 rounded-lg" title="Credit note PDF (P)" data-row-key="p" aria-label="Credit note PDF">
                        {pdfBusy === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
                      </Button>
                      {r.status !== "Cancelled" && canCancel && (
                        <Button variant="ghost" size="icon" onClick={() => setConfirm(r)} className="h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive" title="Cancel this return" aria-label="Cancel return">
                          <Ban className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {pagination.total_pages > 1 && (
        <div className="flex items-center justify-end gap-2 text-xs">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="h-8 rounded-lg">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="font-bold">
            Page {page} of {pagination.total_pages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= pagination.total_pages} onClick={() => setPage((p) => p + 1)} className="h-8 rounded-lg">
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}

      <BillPicker
        open={picker}
        onClose={() => setPicker(false)}
        onPick={(b) => {
          setPicker(false);
          setReturnFor(b.id);
        }}
      />
      <SalesReturnDialog billId={returnFor} open={!!returnFor} onClose={() => setReturnFor(null)} onDone={(r) => { load(); setDetail(r); }} />

      {/* Detail */}
      <Dialog open={!!detail} onOpenChange={(v) => !v && setDetail(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl p-4 sm:p-6">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center gap-2 text-lg font-black">
                  <span className="font-mono text-teal-600">{detail.return_no}</span>
                  <RefundBadge r={detail} />
                </DialogTitle>
                <DialogDescription className="text-xs">
                  Bill {detail.bill_no} · {detail.customer_name} · {detail.return_date} · {detail.type === "full" ? "whole bill" : "part return"} · {detail.reason}
                  {detail.created_by_name ? ` · by ${detail.created_by_name}` : ""}
                </DialogDescription>
              </DialogHeader>
              <div className="rounded-xl border border-border/70 divide-y divide-border/60">
                {(detail.items || []).map((it) => (
                  <div key={it.line_index} className="p-3 flex items-center justify-between gap-3 text-xs">
                    <div className="min-w-0">
                      <p className="font-bold truncate">{it.product_name}</p>
                      <p className="text-muted-foreground font-mono">
                        {it.batch_no || "-"} · {it.quantity}u × {inr(it.refund_per_unit)}
                      </p>
                    </div>
                    <span className={`inline-flex items-center gap-1 font-semibold ${it.restocked_units ? "text-emerald-600" : "text-rose-500"}`}>
                      {it.restocked_units ? <PackageCheck className="w-3.5 h-3.5" /> : <PackageX className="w-3.5 h-3.5" />}
                      {it.restocked_units ? "Back in stock" : "Written off"}
                    </span>
                    <span className="font-mono font-bold">{inr(it.amount)}</span>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {[
                  ["Return value", detail.total_amount],
                  ["Bill total", `${inr(detail.bill_total_before)} → ${inr(detail.bill_total_after)}`],
                  ["Taken off dues", detail.adjusted_against_due],
                  [detail.refund_mode === "Advance" ? "Kept as advance" : `Refunded${detail.refund_mode ? ` (${detail.refund_mode})` : ""}`, detail.refund_amount],
                ].map(([k, v]) => (
                  <div key={k} className="p-2.5 rounded-lg bg-muted/40">
                    <p className="text-muted-foreground font-bold">{k}</p>
                    <p className="font-mono font-black text-sm">{typeof v === "number" ? inr(v) : v}</p>
                  </div>
                ))}
              </div>
              {detail.notes && <p className="text-xs text-muted-foreground">Note: {detail.notes}</p>}
              {detail.status === "Cancelled" && (
                <p className="text-xs text-muted-foreground">
                  Cancelled {detail.cancelled_at?.slice(0, 10)}
                  {detail.cancelled_by_name ? ` by ${detail.cancelled_by_name}` : ""}.
                </p>
              )}
              <DialogFooter className="gap-2">
                {detail.status !== "Cancelled" && canCancel && (
                  <Button variant="outline" onClick={() => setConfirm(detail)} className="rounded-xl text-destructive">
                    <Ban className="w-4 h-4 mr-1.5" />
                    Cancel return
                  </Button>
                )}
                <Button onClick={() => openPdf(detail)} disabled={pdfBusy === detail.id} className="rounded-xl">
                  <Printer className="w-4 h-4 mr-1.5" />
                  Credit note PDF
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Cancel confirm */}
      <Dialog open={!!confirm} onOpenChange={(v) => !v && !busy && setConfirm(null)}>
        <DialogContent className="max-w-md rounded-2xl">
          {confirm && (
            <>
              <DialogHeader>
                <DialogTitle>Cancel {confirm.return_no}?</DialogTitle>
                <DialogDescription>
                  Bill {confirm.bill_no} goes back to {inr(confirm.bill_total_before)}. Units put back in stock are taken out again.
                  {confirm.refund_amount > 0 &&
                    (confirm.refund_mode === "Advance"
                      ? ` The ${inr(confirm.refund_amount)} added to the customer's advance is removed.`
                      : ` Take back the ${inr(confirm.refund_amount)} given in ${confirm.refund_mode}.`)}{" "}
                  Only the latest return on a bill can be cancelled.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setConfirm(null)} disabled={busy} className="rounded-xl">
                  Keep it
                </Button>
                <Button variant="destructive" onClick={() => cancelReturn(confirm)} disabled={busy} className="rounded-xl" data-testid="confirm-cancel-return">
                  {busy && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
                  Cancel return
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
