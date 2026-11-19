import { useEffect, useState } from "react";
import axios from "axios";
import { BadgePercent } from "lucide-react";
import { API } from "../../App";

const money = (n) => `₹${(Math.round((Number(n) || 0) * 100) / 100).toFixed(2)}`;
const day = (ymd) => {
  if (!ymd) return "";
  const d = new Date(`${String(ymd).slice(0, 10)}T12:00:00`);
  return isNaN(d) ? "" : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};

// A repeat customer whose last bill had a discount: a reminder of how much,
// while billing them again (only a reminder; nothing is applied)
export default function LastDiscountReminder({ customerId, mobile, excludeBillId, className = "" }) {
  const [last, setLast] = useState(null);
  const digits = String(mobile || "").replace(/\D/g, "").slice(-10);

  useEffect(() => {
    if (!customerId && digits.length !== 10) {
      setLast(null);
      return;
    }
    let alive = true;
    const t = setTimeout(async () => {
      try {
        const { data } = await axios.get(`${API}/bills/last-discount`, {
          params: { customer_id: customerId || undefined, mobile: digits.length === 10 ? digits : undefined, exclude_bill_id: excludeBillId || undefined },
        });
        if (alive) setLast(data.last || null);
      } catch {
        if (alive) setLast(null);
      }
    }, 300);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [customerId, digits, excludeBillId]);

  if (!last) return null;
  const parts = [];
  if (last.bill_discount_percent > 0) parts.push(`${last.bill_discount_percent}% on the bill`);
  if (last.discounted_lines?.length) {
    parts.push(last.discounted_lines.map((l) => `${l.discount_percent}% on ${l.product_name}`).join(", "));
  }
  return (
    <div
      data-testid="last-discount-reminder"
      className={`flex items-start gap-2.5 rounded-xl border border-sky-500/40 bg-sky-500/10 p-3 text-xs ${className}`}
    >
      <BadgePercent className="mt-0.5 h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" />
      <div className="min-w-0">
        <p className="font-bold text-foreground">
          Last time they got <span className="font-mono text-sky-700 dark:text-sky-300">{money(last.discount_total)}</span> off
          {last.discount_share_percent > 0 ? ` (${last.discount_share_percent}%)` : ""}
        </p>
        <p className="mt-0.5 text-muted-foreground">
          Bill {last.bill_no}
          {day(last.billing_date) ? ` · ${day(last.billing_date)}` : ""}
          {parts.length ? ` · ${parts.join("; ")}` : ""}
        </p>
      </div>
    </div>
  );
}
