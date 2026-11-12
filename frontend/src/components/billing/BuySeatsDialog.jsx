// Buy extra pharmacist users: how many, monthly or yearly. The yearly price
// is shown with what it saves over twelve months.
import { useEffect, useState } from "react";
import axios from "axios";
import { Minus, Plus } from "lucide-react";
import { API } from "../../App";
import AddonCheckoutDialog from "./AddonCheckoutDialog";
import { formatINR } from "../../lib/checkout";

export default function BuySeatsDialog({ open, onOpenChange }) {
  const [cycle, setCycle] = useState("YEARLY");
  const [qty, setQty] = useState(1);
  const [prices, setPrices] = useState(null);
  useEffect(() => {
    axios
      .get(`${API}/plans`)
      .then((r) => setPrices(r.data.addons?.user_seat || null))
      .catch(() => {});
  }, []);
  const saving = prices ? prices.monthly_paise * 12 - prices.yearly_paise : 0;
  return (
    <AddonCheckoutDialog
      open={open}
      onOpenChange={onOpenChange}
      request={{ kind: "USER_SEAT", cycle, quantity: qty }}
      title="Add pharmacist users"
      description="Each extra user gets their own login with the access you choose."
    >
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Billing cycle">
        {[
          ["MONTHLY", "Monthly", prices ? `${formatINR(prices.monthly_paise)}/user/month` : ""],
          ["YEARLY", "Yearly", prices ? `${formatINR(prices.yearly_paise)}/user/year${saving > 0 ? ` · save ${formatINR(saving)}` : ""}` : ""],
        ].map(([key, label, sub]) => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={cycle === key}
            onClick={() => setCycle(key)}
            className={`rounded-2xl border p-3 text-left transition ${cycle === key ? "border-orange-500 bg-orange-500/10 ring-1 ring-orange-500/40" : "border-border hover:bg-muted/40"}`}
            data-testid={`seat-cycle-${key}`}
          >
            <span className="block text-sm font-extrabold">{label}</span>
            <span className="block text-[11px] font-semibold text-muted-foreground">{sub} + GST</span>
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between rounded-2xl border border-border p-3">
        <span className="text-sm font-bold">Number of users</span>
        <div className="flex items-center gap-2">
          <button type="button" className="h-8 w-8 rounded-lg border border-border flex items-center justify-center disabled:opacity-40" disabled={qty <= 1} onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Fewer">
            <Minus className="w-4 h-4" />
          </button>
          <span className="w-8 text-center font-extrabold" data-testid="seat-qty">{qty}</span>
          <button type="button" className="h-8 w-8 rounded-lg border border-border flex items-center justify-center disabled:opacity-40" disabled={qty >= 20} onClick={() => setQty((q) => Math.min(20, q + 1))} aria-label="More">
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>
    </AddonCheckoutDialog>
  );
}
