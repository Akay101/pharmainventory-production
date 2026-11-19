import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Loader2, PackageCheck, PackageX, Undo2, AlertTriangle, Wallet, Banknote, Smartphone, CreditCard } from "lucide-react";
import { API } from "../../App";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Label } from "../ui/label";
import { Checkbox } from "../ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import Loader from "../Loader";

export const inr = (n) => `₹${(Number(n) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const todayIst = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
const MODES = [
  ["Cash", Banknote],
  ["UPI", Smartphone],
  ["Card", CreditCard],
  ["Advance", Wallet],
];

const packHint = (units, perPack) => {
  if (!perPack || perPack <= 1 || !units) return "";
  const packs = Math.floor(units / perPack);
  const rest = units % perPack;
  return packs ? `${packs} pack${packs > 1 ? "s" : ""}${rest ? ` + ${rest}` : ""}` : "loose";
};

/**
 * Return items, or the whole bill, against one bill.
 * mode "full" starts with every unit ticked.
 */
export default function SalesReturnDialog({ billId, open, onClose, onDone, mode = "pick" }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [qty, setQty] = useState({});
  const [restock, setRestock] = useState({});
  const [reason, setReason] = useState("Customer returned");
  const [notes, setNotes] = useState("");
  const [refundMode, setRefundMode] = useState("Cash");
  const [returnDate, setReturnDate] = useState(todayIst());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !billId) return;
    let live = true;
    setLoading(true);
    setData(null);
    axios
      .get(`${API}/sales-returns/bill/${billId}`)
      .then((res) => {
        if (!live) return;
        setData(res.data);
        const lines = res.data.bill.lines || [];
        setQty(Object.fromEntries(lines.map((l) => [l.line_index, mode === "full" ? l.returnable_qty : 0])));
        setRestock(Object.fromEntries(lines.map((l) => [l.line_index, l.can_restock && !l.expired])));
      })
      .catch((e) => {
        if (!live) return;
        toast.error(e?.response?.data?.detail || "Couldn't load the bill");
        onClose?.();
      })
      .finally(() => live && setLoading(false));
    setReason("Customer returned");
    setNotes("");
    setRefundMode("Cash");
    setReturnDate(todayIst());
    return () => {
      live = false;
    };
  }, [open, billId, mode]);

  const bill = data?.bill;
  const lines = useMemo(() => (bill?.lines || []).filter((l) => l.returnable_qty > 0 || l.returned_qty > 0), [bill]);

  const picked = useMemo(() => lines.filter((l) => Number(qty[l.line_index]) > 0), [lines, qty]);
  const allPicked = lines.length > 0 && lines.every((l) => l.returnable_qty <= 0 || Number(qty[l.line_index]) === l.returnable_qty);
  const errors = lines
    .map((l) => {
      const q = Number(qty[l.line_index]) || 0;
      if (!Number.isInteger(q) || q < 0) return `${l.product_name}: enter whole units`;
      if (q > l.returnable_qty) return `${l.product_name}: only ${l.returnable_qty} unit(s) can come back`;
      return null;
    })
    .filter(Boolean);

  // Same maths as the server, to show what happens before saving
  const value = bill
    ? allPicked
      ? bill.grand_total
      : r2(picked.reduce((s, l) => s + (Number(qty[l.line_index]) === l.returnable_qty ? l.returnable_value : l.refund_per_unit * Number(qty[l.line_index])), 0))
    : 0;
  const adjusted = bill ? r2(Math.min(value, bill.due)) : 0;
  const refund = bill ? r2(Math.max(0, bill.total_paid - (bill.grand_total - value))) : 0;
  const walkIn = !bill?.customer_id;

  useEffect(() => {
    if (walkIn && refundMode === "Advance") setRefundMode("Cash");
  }, [walkIn, refundMode]);

  const setAll = (on) => setQty(Object.fromEntries(lines.map((l) => [l.line_index, on ? l.returnable_qty : 0])));

  const submit = async () => {
    if (!picked.length) return toast.error("Enter how many units are coming back");
    if (errors.length) return toast.error(errors[0]);
    setSaving(true);
    try {
      const res = await axios.post(`${API}/sales-returns`, {
        bill_id: bill.id,
        items: picked.map((l) => ({ line_index: l.line_index, quantity: Number(qty[l.line_index]), restock: !!restock[l.line_index] })),
        reason,
        notes,
        return_date: returnDate,
        refund_mode: refund > 0 ? refundMode : undefined,
      });
      const r = res.data;
      toast.success(
        `${r.return_no} saved · ${inr(r.total_amount)}${
          r.refund_amount > 0 ? (r.refund_mode === "Advance" ? ` · ${inr(r.refund_amount)} kept as advance` : ` · give back ${inr(r.refund_amount)} in ${r.refund_mode}`) : r.adjusted_against_due > 0 ? " · taken off the dues" : ""
        }`
      );
      onDone?.(r);
      onClose?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Couldn't save the return");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !saving && onClose?.()}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto rounded-2xl p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-black">
            <Undo2 className="w-5 h-5 text-teal-600" />
            Sales return {bill ? <span className="font-mono text-sm text-muted-foreground">· {bill.bill_no}</span> : null}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {bill ? (
              <>
                {bill.customer_name} · billed {bill.billing_date} · total {inr(bill.grand_total)}
                {bill.returned_amount > 0 && <> (was {inr(bill.original_grand_total)}, {inr(bill.returned_amount)} returned)</>} ·{" "}
                {bill.due > 0 ? <span className="text-rose-600 font-bold">due {inr(bill.due)}</span> : <span className="text-emerald-600 font-bold">paid</span>}
              </>
            ) : (
              "Loading the bill…"
            )}
          </DialogDescription>
        </DialogHeader>

        {loading || !bill ? (
          <div className="py-12">
            <Loader size="md" text="Loading bill…" />
          </div>
        ) : bill.blocked ? (
          <div className="p-4 rounded-xl border border-amber-500/40 bg-amber-500/10 flex gap-2 text-sm">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
            <span>{bill.blocked}</span>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-bold text-muted-foreground">Units coming back, per item</p>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant={allPicked ? "default" : "outline"} className="h-8 rounded-lg text-xs font-bold" onClick={() => setAll(true)} data-testid="sr-return-all">
                  Return whole bill
                </Button>
                <Button type="button" size="sm" variant="ghost" className="h-8 rounded-lg text-xs" onClick={() => setAll(false)}>
                  Clear
                </Button>
              </div>
            </div>

            <div className="rounded-xl border border-border/70 divide-y divide-border/60">
              {lines.map((l) => {
                const q = Number(qty[l.line_index]) || 0;
                const done = l.returnable_qty <= 0;
                return (
                  <div key={l.line_index} className={`p-3 grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-3 sm:items-center ${done ? "opacity-60" : ""}`}>
                    <div className="min-w-0">
                      <p className="text-sm font-bold truncate">{l.product_name}</p>
                      <p className="text-[11px] text-muted-foreground font-mono">
                        {l.batch_no || "no batch"} · sold {l.sold_qty}
                        {l.returned_qty > 0 && <span className="text-teal-600"> · {l.returned_qty} returned</span>} · {inr(l.refund_per_unit)}/unit
                        {l.expired && <span className="text-rose-600 font-bold"> · expired</span>}
                      </p>
                    </div>
                    {done ? (
                      <span className="text-xs font-bold text-teal-600">All returned</span>
                    ) : (
                      <>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min={0}
                            max={l.returnable_qty}
                            step={1}
                            inputMode="numeric"
                            value={qty[l.line_index] ?? 0}
                            onChange={(e) => setQty((p) => ({ ...p, [l.line_index]: e.target.value === "" ? "" : Math.max(0, parseInt(e.target.value, 10) || 0) }))}
                            className="w-20 h-9 text-right font-mono"
                            aria-label={`Units of ${l.product_name} returned`}
                            data-testid={`sr-qty-${l.line_index}`}
                          />
                          <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                            of {l.returnable_qty}
                            {packHint(q, l.units_per_pack) && <span className="block">{packHint(q, l.units_per_pack)}</span>}
                          </span>
                        </div>
                        <label className={`flex items-center gap-2 text-xs font-semibold ${l.can_restock ? "cursor-pointer" : "opacity-60"}`} title={l.can_restock ? "" : "Typed in by hand, not from a stock batch"}>
                          <Checkbox checked={!!restock[l.line_index]} disabled={!l.can_restock} onCheckedChange={(v) => setRestock((p) => ({ ...p, [l.line_index]: !!v }))} />
                          {restock[l.line_index] ? <PackageCheck className="w-4 h-4 text-emerald-600" /> : <PackageX className="w-4 h-4 text-rose-500" />}
                          {restock[l.line_index] ? "Back to stock" : "Write off"}
                        </label>
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-bold">Reason</Label>
                <Select value={reason} onValueChange={setReason}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(data.reasons || []).map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-bold">Return date</Label>
                <Input type="date" value={returnDate} max={todayIst()} onChange={(e) => setReturnDate(e.target.value)} className="h-9 text-xs" />
              </div>
              <div className="space-y-1 sm:col-span-1">
                <Label className="text-xs font-bold">Note</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={1} maxLength={500} placeholder="Optional" className="min-h-9 text-xs" />
              </div>
            </div>

            {/* What happens to the money */}
            <div className="p-3 rounded-xl border border-teal-500/30 bg-teal-500/5 space-y-2" data-testid="sr-summary">
              <div className="flex justify-between text-sm">
                <span className="font-bold">Return value</span>
                <span className="font-mono font-black">{inr(value)}</span>
              </div>
              {adjusted > 0 && (
                <div className="flex justify-between text-xs">
                  <span>Taken off what's due on the bill</span>
                  <span className="font-mono">{inr(adjusted)}</span>
                </div>
              )}
              <div className="flex justify-between text-xs">
                <span>Bill total after return</span>
                <span className="font-mono">{inr(Math.max(0, bill.grand_total - value))}</span>
              </div>
              {refund > 0 ? (
                <div className="pt-2 border-t border-teal-500/20 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="font-bold text-teal-700 dark:text-teal-400">Give back to the customer</span>
                    <span className="font-mono font-black text-teal-700 dark:text-teal-400">{inr(refund)}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {MODES.map(([m, Icon]) => {
                      const off = m === "Advance" && walkIn;
                      return (
                        <button
                          key={m}
                          type="button"
                          disabled={off}
                          onClick={() => setRefundMode(m)}
                          title={off ? "Walk-in bill: no customer to hold the advance" : m === "Advance" ? "Keep it as the customer's advance, to use on later bills" : `Refund in ${m}`}
                          className={`inline-flex items-center gap-1.5 px-3 h-8 rounded-lg border text-xs font-bold transition-colors ${
                            refundMode === m ? "bg-teal-600 text-white border-teal-600" : "border-border hover:bg-muted"
                          } ${off ? "opacity-40 cursor-not-allowed" : ""}`}
                          data-testid={`sr-mode-${m}`}
                        >
                          <Icon className="w-3.5 h-3.5" />
                          {m === "Advance" ? "Keep as advance" : m}
                        </button>
                      );
                    })}
                  </div>
                  {refundMode === "Advance" && data.customer_advance > 0 && (
                    <p className="text-[11px] text-muted-foreground">Customer already has {inr(data.customer_advance)} advance.</p>
                  )}
                </div>
              ) : (
                value > 0 && <p className="text-[11px] text-muted-foreground">Nothing to give back: the return only reduces what is still owed.</p>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving} className="rounded-xl">
            Cancel
          </Button>
          {bill && !bill.blocked && (
            <Button onClick={submit} disabled={saving || !picked.length || errors.length > 0} className="rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold" data-testid="sr-submit">
              {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Undo2 className="w-4 h-4 mr-1.5" />}
              {allPicked ? "Return whole bill" : `Return ${picked.reduce((s, l) => s + (Number(qty[l.line_index]) || 0), 0)} unit(s)`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
