// A customer's account for one month: every bill with what is paid and due,
// filters for all / paid / pending, and the statement as a PDF in two
// layouts (detailed date-wise with items, or a summary of dates and amounts).
import { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Download, Loader2, Receipt } from "lucide-react";
import { API } from "../../App";
import { Button } from "../ui/button";

const thisMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const monthLabel = (m) => {
  if (!m || m === "all") return "All months";
  const [y, mo] = m.split("-").map(Number);
  return new Date(y, mo - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
};
const money = (n) => `₹${(Number(n) || 0).toFixed(2)}`;

export default function MonthlyAccount({ customerId, customerName, onOpenBill }) {
  const [month, setMonth] = useState(thisMonth);
  const [status, setStatus] = useState("all");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showMrp, setShowMrp] = useState(false);
  const [showBalance, setShowBalance] = useState(true);
  const [downloading, setDownloading] = useState("");

  const load = useCallback(async () => {
    if (!customerId) return;
    setLoading(true);
    try {
      const res = await axios.get(`${API}/customers/${customerId}/statement`, {
        params: { month: month === "all" ? undefined : month, status },
      });
      setData(res.data);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Couldn't load the account");
    } finally {
      setLoading(false);
    }
  }, [customerId, month, status]);

  useEffect(() => {
    load();
  }, [load]);

  const download = async (format) => {
    setDownloading(format);
    try {
      const res = await axios.get(`${API}/customers/${customerId}/statement`, {
        params: { month: month === "all" ? undefined : month, status, format, mrp: showMrp ? 1 : 0, balance: showBalance ? 1 : 0 },
        responseType: "blob",
      });
      const url = URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(customerName || "customer").replace(/[^a-z0-9]+/gi, "-")}-${month}-${format}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch {
      toast.error("Couldn't make the PDF");
    } finally {
      setDownloading("");
    }
  };

  // Month picker: this month, months with bills, and "all"
  const months = [...new Set([thisMonth(), ...(data?.months || []).map((m) => m.month)])].sort().reverse();
  const t = data?.month_totals;

  return (
    <div className="space-y-3 animate-in fade-in duration-200" data-testid="customer-monthly-account">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="h-8 rounded-lg border border-border bg-background px-2 text-xs font-semibold"
          aria-label="Month"
          data-testid="statement-month"
        >
          {months.map((m) => (
            <option key={m} value={m}>
              {monthLabel(m)}
            </option>
          ))}
          <option value="all">All months</option>
        </select>
        <div className="flex h-8 rounded-lg border border-border/70 bg-muted/30 p-0.5" role="group" aria-label="Bills">
          {[["all", "All bills"], ["paid", "Paid"], ["pending", "Pending"]].map(([v, label]) => (
            <button
              key={v}
              type="button"
              aria-pressed={status === v}
              onClick={() => setStatus(v)}
              className={`px-2.5 text-[11px] font-bold rounded-md ${status === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {label}
            </button>
          ))}
        </div>
        {loading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
      </div>

      {t && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            ["Bills", t.count, ""],
            ["Billed", money(t.total), ""],
            ["Paid", money(t.paid), "text-emerald-600 dark:text-emerald-400"],
            ["Pending", money(t.due), t.due > 0 ? "text-red-500" : ""],
          ].map(([k, v, c]) => (
            <div key={k} className="rounded-xl border border-border/50 bg-muted/20 px-3 py-2">
              <p className="text-[10px] font-bold uppercase text-muted-foreground">{k}</p>
              <p className={`font-mono font-black text-sm ${c}`}>{v}</p>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-border/50 p-3 space-y-2">
        <p className="text-xs font-bold text-foreground">Monthly invoice PDF · {monthLabel(month)}</p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={showMrp} onChange={(e) => setShowMrp(e.target.checked)} /> Show MRP
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={showBalance} onChange={(e) => setShowBalance(e.target.checked)} /> Show paid and balance
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" className="h-8 text-xs font-bold rounded-lg" disabled={!!downloading} onClick={() => download("detailed")} data-testid="statement-pdf-detailed">
            {downloading === "detailed" ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Download className="w-3.5 h-3.5 mr-1" />}
            Detailed (date-wise, all items)
          </Button>
          <Button size="sm" variant="outline" className="h-8 text-xs font-bold rounded-lg" disabled={!!downloading} onClick={() => download("summary")} data-testid="statement-pdf-summary">
            {downloading === "summary" ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Download className="w-3.5 h-3.5 mr-1" />}
            Summary (date and amount)
          </Button>
        </div>
      </div>

      {data && data.bills.length === 0 ? (
        <div className="text-center py-6 rounded-xl bg-muted/10 border border-dashed border-border/60">
          <Receipt className="w-7 h-7 mx-auto mb-1.5 opacity-30 text-muted-foreground" />
          <p className="text-xs font-semibold text-muted-foreground">No bills for {monthLabel(month)}</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {(data?.bills || []).map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => onOpenBill?.(b)}
              className="w-full text-left flex items-center justify-between p-2.5 rounded-xl bg-muted/20 border border-border/40 hover:border-primary/30 transition-all"
            >
              <div className="min-w-0">
                <p className="font-mono text-xs font-bold text-foreground truncate">{b.bill_no}</p>
                <p className="text-[10px] text-muted-foreground font-semibold">
                  {new Date(b.billing_date || b.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} · {(b.items || []).length} items
                </p>
              </div>
              <div className="text-right">
                <p className="font-mono font-bold text-sm text-foreground">{money(b.total)}</p>
                <p className={`text-[10px] font-bold ${b.due > 0 ? "text-red-500" : "text-emerald-600 dark:text-emerald-400"}`}>
                  {b.due > 0 ? `Pending ${money(b.due)}` : "Paid"}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
