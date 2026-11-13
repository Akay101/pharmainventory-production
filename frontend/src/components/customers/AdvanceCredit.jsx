// A customer's advance credit: money left with the pharmacy before any bill
// (medicines still to arrive) or extra paid on a bill and carried forward.
// Later bills are paid from it in Billing (Record payment → "From advance").
import { useEffect, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Loader2, Plus, Wallet } from "lucide-react";
import { API } from "../../App";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

const money = (n) => `₹${(Number(n) || 0).toFixed(2)}`;
const LABEL = { deposit: "Advance received", extra: "Extra kept from a bill", used: "Used on a bill" };

export default function AdvanceCredit({ customer, canTake = true, onChanged }) {
  const [credit, setCredit] = useState(Number(customer?.advance_credit) || 0);
  const [ledger, setLedger] = useState(customer?.advance_ledger || []);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ amount: "", payment_mode: "Cash", note: "" });
  const [saving, setSaving] = useState(false);
  const [showLedger, setShowLedger] = useState(false);

  useEffect(() => {
    setCredit(Number(customer?.advance_credit) || 0);
    setLedger(customer?.advance_ledger || []);
  }, [customer?.id, customer?.advance_credit, customer?.advance_ledger]);

  const save = async (e) => {
    e.preventDefault();
    const amount = Math.round((Number(form.amount) || 0) * 100) / 100;
    if (!(amount > 0)) return toast.error("Enter the advance amount");
    setSaving(true);
    try {
      const res = await axios.post(`${API}/customers/${customer.id}/advance`, { ...form, amount });
      setCredit(Number(res.data.customer.advance_credit) || 0);
      setLedger(res.data.customer.advance_ledger || []);
      setForm({ amount: "", payment_mode: "Cash", note: "" });
      setOpen(false);
      toast.success(`Advance of ${money(amount)} saved for ${customer.name}`);
      onChanged?.(res.data.customer);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Couldn't save the advance");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-blue-500/25 bg-blue-500/5 p-3 space-y-2" data-testid="customer-advance">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Wallet className="w-4 h-4 text-blue-500" />
          <div>
            <p className="text-[10px] font-bold uppercase text-muted-foreground">Advance credit</p>
            <p className="font-mono font-black text-blue-600 dark:text-blue-400" data-testid="customer-advance-balance">{money(credit)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {ledger.length > 0 && (
            <button type="button" onClick={() => setShowLedger((v) => !v)} className="text-[11px] font-bold text-primary hover:underline">
              {showLedger ? "Hide history" : `History (${ledger.length})`}
            </button>
          )}
          {canTake && (
            <Button size="sm" variant="outline" onClick={() => setOpen((v) => !v)} className="h-8 rounded-lg text-xs font-bold" data-testid="add-advance-btn">
              <Plus className="w-3.5 h-3.5 mr-1" /> Take advance
            </Button>
          )}
        </div>
      </div>
      {open && (
        <form onSubmit={save} className="flex flex-wrap items-end gap-2">
          <Input
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            autoFocus
            placeholder="Amount ₹"
            value={form.amount}
            onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
            className="h-8 w-28 text-xs font-mono font-bold"
            data-testid="advance-amount"
          />
          <select
            value={form.payment_mode}
            onChange={(e) => setForm((f) => ({ ...f, payment_mode: e.target.value }))}
            className="h-8 rounded-md border border-border bg-background px-2 text-xs font-semibold"
            aria-label="Paid by"
          >
            {["Cash", "UPI", "Card"].map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
          <Input
            placeholder="Note (e.g. for medicine to arrive)"
            value={form.note}
            maxLength={200}
            onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
            className="h-8 flex-1 min-w-[160px] text-xs"
          />
          <Button type="submit" size="sm" disabled={saving} className="h-8 rounded-lg text-xs font-bold" data-testid="advance-save">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Save"}
          </Button>
        </form>
      )}
      {showLedger && (
        <div className="divide-y divide-border/40 text-[11px]">
          {[...ledger].reverse().map((l) => (
            <div key={l.id} className="flex justify-between gap-2 py-1">
              <span className="text-muted-foreground">
                {new Date(l.at).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true })} · {LABEL[l.type] || l.type}
                {l.bill_no ? ` · ${l.bill_no}` : ""}
                {l.payment_mode && l.type !== "used" ? ` · ${l.payment_mode}` : ""}
                {l.note ? ` · ${l.note}` : ""}
              </span>
              <span className={`font-mono font-bold ${l.type === "used" ? "text-rose-500" : "text-emerald-600 dark:text-emerald-400"}`}>
                {l.type === "used" ? "-" : "+"}
                {money(l.amount)}
              </span>
            </div>
          ))}
        </div>
      )}
      <p className="text-[10px] text-muted-foreground">
        Use it on a bill: Billing → open the bill → Record part payment → Payment mode "From advance". Paying more than a bill's due can also keep the extra here.
      </p>
    </div>
  );
}
