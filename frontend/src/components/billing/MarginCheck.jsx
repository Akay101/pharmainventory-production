import { AlertTriangle, TrendingDown, Scale } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/alert-dialog";

// Profit within ±₹0.50 of zero is "no profit, no loss"; below that, a loss.
// Same band as BREAK_EVEN_BAND in backend-node/routes/bills.js.
export const BREAK_EVEN_BAND = 0.5;

export const marginStatusOf = (profit) => {
  const p = Number(profit) || 0;
  if (p <= -BREAK_EVEN_BAND) return "loss";
  if (p < BREAK_EVEN_BAND) return "break_even";
  return "profit";
};

const money = (n) => {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  return `${v < 0 ? "-" : ""}₹${Math.abs(v).toFixed(2)}`;
};

// Before a bill is saved: null when it makes a profit, else what the dialog
// shows. `lines` are the bill's rows; billDiscountPct spreads over them.
export function marginCheckOf(lines, { total, cost, roundOff = 0, billDiscountPct = 0 }) {
  const profit = (Number(total) || 0) + roundOff - (Number(cost) || 0);
  const status = marginStatusOf(profit);
  if (status === "profit") return null;
  const share = 1 - (Number(billDiscountPct) || 0) / 100;
  const atLoss = [];
  for (const it of lines) {
    if (!it.product_name) continue;
    const qty = parseInt(it.quantity) || 0;
    const buy = parseFloat(it.purchase_price) || 0;
    if (!qty || !buy) continue;
    const sale = qty * (parseFloat(it.unit_price) || 0) * (1 - (parseFloat(it.discount_percent) || 0) / 100) * share;
    const diff = sale - qty * buy;
    if (diff < BREAK_EVEN_BAND) atLoss.push({ name: it.product_name, sale, cost: qty * buy, diff });
  }
  return { status, profit, total: (Number(total) || 0) + roundOff, cost: Number(cost) || 0, lines: atLoss.slice(0, 10) };
}

const TONE = {
  loss: {
    border: "border-red-500/60",
    head: "text-red-600 dark:text-red-400",
    icon: TrendingDown,
    title: "This bill sells at a loss",
    action: "bg-red-600 hover:bg-red-700",
    box: "border-red-500/30 bg-red-500/10",
  },
  break_even: {
    border: "border-amber-400/70",
    head: "text-amber-600 dark:text-amber-400",
    icon: Scale,
    title: "No profit, no loss on this bill",
    action: "bg-amber-500 hover:bg-amber-600 text-amber-950",
    box: "border-amber-400/40 bg-amber-400/10",
  },
};

// Yellow (break-even) / red (loss) warning before the bill is saved
export default function MarginCheckDialog({ check, onCancel, onConfirm }) {
  const tone = TONE[check?.status] || TONE.break_even;
  const Icon = tone.icon;
  return (
    <AlertDialog open={!!check} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent className={`bg-card border-2 ${tone.border} shadow-2xl rounded-2xl p-6`} data-testid="margin-check-dialog" data-status={check?.status}>
        <AlertDialogHeader className="space-y-3">
          <AlertDialogTitle className={`text-xl font-bold flex items-center gap-2 ${tone.head}`}>
            <Icon className="w-5 h-5" />
            {tone.title}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm text-muted-foreground">
              <div className={`grid grid-cols-3 gap-2 rounded-xl border p-3 text-center ${tone.box}`}>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider">Bill total</p>
                  <p className="font-mono font-bold text-foreground">{money(check?.total)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider">Cost</p>
                  <p className="font-mono font-bold text-foreground">{money(check?.cost)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider">{check?.status === "loss" ? "Loss" : "Profit"}</p>
                  <p className={`font-mono font-black ${tone.head}`} data-testid="margin-check-amount">
                    {check?.status === "loss" ? `-${money(Math.abs(check?.profit))}` : money(check?.profit)}
                  </p>
                </div>
              </div>
              {check?.lines?.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-bold text-foreground">Lines at or below cost</p>
                  {check.lines.map((l, i) => (
                    <p key={i} className="flex justify-between gap-3 text-xs">
                      <span className="truncate font-semibold text-foreground">{l.name}</span>
                      <span className="shrink-0 font-mono">
                        {money(l.sale)} vs cost {money(l.cost)}
                      </span>
                    </p>
                  ))}
                </div>
              )}
              <p className="flex items-start gap-1.5 text-xs">
                <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
                Check the discount and the rates. The bill is marked in All bills either way.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 mt-2">
          <AlertDialogCancel className="rounded-xl border-border/80 h-10 px-4" data-testid="margin-check-back">Go back and fix</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className={`rounded-xl text-white h-10 px-4 font-semibold ${tone.action}`} data-testid="margin-check-continue">
            Save anyway
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// Tag for a saved bill's row in All bills
export function ProfitFlag({ status, profit, className = "" }) {
  if (status !== "loss" && status !== "break_even") return null;
  const loss = status === "loss";
  return (
    <span
      data-testid={`margin-tag-${status}`}
      title={loss ? `Sold at a loss of ${money(Math.abs(profit))}` : "No profit, no loss"}
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-1.5 py-[3px] text-[10px] font-bold leading-none ${
        loss ? "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400" : "border-amber-400/60 bg-amber-400/15 text-amber-700 dark:text-amber-300"
      } ${className}`}
    >
      {loss ? <TrendingDown className="h-2.5 w-2.5" /> : <Scale className="h-2.5 w-2.5" />}
      {loss ? `Loss ${money(Math.abs(profit))}` : "No profit"}
    </span>
  );
}

// Row tint in All bills
export const marginRowClass = (status) =>
  status === "loss" ? "bg-red-500/[0.06]" : status === "break_even" ? "bg-amber-400/[0.08]" : "";
