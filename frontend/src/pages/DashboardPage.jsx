import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { API, useAuth } from "../App";
import { Button } from "../components/ui/button";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Ban,
  CalendarClock,
  CheckCircle2,
  Clock,
  CreditCard,
  IndianRupee,
  Minus,
  Package,
  PackageX,
  PiggyBank,
  Plus,
  Receipt,
  RefreshCw,
  ScanLine,
  ShoppingCart,
  TrendingUp,
  Truck,
  Users,
  Wallet,
} from "lucide-react";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Label } from "../components/ui/label";
import { Input } from "../components/ui/input";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import Loader from "../components/Loader";

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------
const inr = (v, { decimals = 0 } = {}) =>
  `₹${Number(v || 0).toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;

// ₹1.2L / ₹3.4Cr for compact axes and chips
const inrCompact = (v) => {
  const n = Number(v || 0);
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(1)}Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(1)}L`;
  if (n >= 1e3) return `₹${(n / 1e3).toFixed(1)}k`;
  return `₹${Math.round(n)}`;
};

const dayLabel = (ymd) =>
  new Date(`${ymd}T00:00:00+05:30`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

// "12 Mar" this year, "12 Mar 2027" otherwise
const dateLabel = (ymd) => {
  const d = new Date(`${String(ymd).slice(0, 10)}T00:00:00+05:30`);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) });
};

const hourLabel = (h) => `${h % 12 || 12}${h < 12 ? "am" : "pm"}`;

const timeAgo = (iso) => {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
};

const greeting = () => {
  const h = Number(new Date().toLocaleString("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }));
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
};

// The app's dark theme is the default; `.light` on <html> switches it off.
function useIsDark() {
  const [dark, setDark] = useState(() => !document.documentElement.classList.contains("light"));
  useEffect(() => {
    const obs = new MutationObserver(() => setDark(!document.documentElement.classList.contains("light")));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return dark;
}

const BRAND = "#f97316";
const MIX_COLORS = ["#f97316", "#10b981", "#0ea5e9", "#8b5cf6", "#eab308", "#f43f5e", "#64748b"];

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------
function Card({ className = "", children }) {
  // min-w-0 lets grid columns shrink on phones instead of overflowing
  return <div className={`min-w-0 rounded-3xl border border-border bg-card shadow-sm ${className}`}>{children}</div>;
}

function CardHeader({ icon: Icon, tone = "orange", title, subtitle, action }) {
  const tones = {
    orange: "bg-orange-500/10 text-orange-500",
    emerald: "bg-emerald-500/10 text-emerald-500",
    sky: "bg-sky-500/10 text-sky-500",
    violet: "bg-violet-500/10 text-violet-500",
    rose: "bg-rose-500/10 text-rose-500",
    amber: "bg-amber-500/10 text-amber-500",
  };
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${tones[tone]}`}>
          <Icon className="w-[18px] h-[18px]" />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-extrabold text-foreground leading-tight truncate">{title}</h3>
          {subtitle && <p className="text-[11px] font-semibold text-muted-foreground truncate">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

function LinkAction({ label, onClick }) {
  return (
    <button
      onClick={onClick}
      className="shrink-0 inline-flex items-center gap-1 text-[11px] font-bold text-orange-500 hover:text-orange-600 hover:underline underline-offset-4"
    >
      {label} <ArrowRight className="w-3 h-3" />
    </button>
  );
}

function Delta({ value, suffix = "", invert = false }) {
  if (value === null || value === undefined) return null;
  const up = value > 0;
  const flat = value === 0;
  const good = invert ? !up : up;
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-extrabold ${
        flat ? "bg-muted text-muted-foreground" : good ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"
      }`}
    >
      <Icon className="w-3 h-3" />
      {Math.abs(value).toFixed(value % 1 ? 1 : 0)}%{suffix}
    </span>
  );
}

function Sparkline({ data, dataKey = "revenue", color = BRAND, id }) {
  return (
    <div className="h-12 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} fill={`url(#${id})`} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function KpiCard({ icon: Icon, tone, label, value, delta, deltaLabel, footer, spark }) {
  const tones = {
    orange: "from-orange-500/15 to-amber-500/5 text-orange-500",
    emerald: "from-emerald-500/15 to-emerald-500/5 text-emerald-500",
    sky: "from-sky-500/15 to-sky-500/5 text-sky-500",
    violet: "from-violet-500/15 to-violet-500/5 text-violet-500",
  };
  return (
    <Card className="relative overflow-hidden p-5 flex flex-col gap-3">
      <div className={`absolute -top-10 -right-10 w-36 h-36 rounded-full bg-gradient-to-br blur-2xl opacity-60 ${tones[tone]}`} />
      <div className="relative flex items-center justify-between">
        <span className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground">{label}</span>
        <div className={`w-8 h-8 rounded-xl bg-gradient-to-br flex items-center justify-center ${tones[tone]}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <div className="relative">
        <div className="text-[28px] leading-none font-black tracking-tight text-foreground tabular-nums">{value}</div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
          {delta}
          {deltaLabel && <span>{deltaLabel}</span>}
        </div>
      </div>
      {spark}
      {footer && <div className="relative border-t border-border pt-3 text-[11px] font-semibold text-muted-foreground">{footer}</div>}
    </Card>
  );
}

function ChartTooltip({ active, payload, label, metric }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-xl border border-border bg-card/95 backdrop-blur px-3 py-2 shadow-xl space-y-0.5">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{dayLabel(label)}</p>
      <p className="text-sm font-black text-foreground tabular-nums">
        {metric === "bills" ? `${p.bills} bills` : inr(p[metric], { decimals: 2 })}
      </p>
      {metric !== "bills" && <p className="text-[10px] font-semibold text-muted-foreground">{p.bills} bills</p>}
    </div>
  );
}

function SegmentedToggle({ value, onChange, options }) {
  return (
    <div className="inline-flex items-center rounded-xl border border-border bg-muted/60 p-0.5">
      {options.map(([v, label]) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-colors ${
            value === v ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function AttentionRow({ icon: Icon, tone, title, detail, onClick }) {
  const tones = {
    rose: "bg-rose-500/10 text-rose-500",
    amber: "bg-amber-500/10 text-amber-500",
    sky: "bg-sky-500/10 text-sky-500",
    slate: "bg-muted text-muted-foreground",
  };
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 rounded-2xl border border-border bg-background/40 px-3 py-2.5 text-left transition-colors hover:border-orange-500/40 hover:bg-orange-500/5 group"
    >
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${tones[tone]}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-extrabold text-foreground line-clamp-2 sm:line-clamp-1">{title}</p>
        <p className="text-[11px] font-semibold text-muted-foreground line-clamp-2 sm:line-clamp-1">{detail}</p>
      </div>
      <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-orange-500 group-hover:translate-x-0.5 transition-all shrink-0" />
    </button>
  );
}

function EmptyState({ icon: Icon = CheckCircle2, text }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
      <Icon className="w-6 h-6 text-muted-foreground/60" />
      <p className="text-xs font-semibold text-muted-foreground">{text}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function DashboardPage() {
  const navigate = useNavigate();
  const { pharmacy, user } = useAuth();
  const isDark = useIsDark();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [metric, setMetric] = useState("revenue");
  const [expiryTab, setExpiryTab] = useState("upcoming");
  const [range, setRange] = useState(30);

  const [clearDebtDialog, setClearDebtDialog] = useState({ open: false, customerId: null, customerName: "" });
  const [supplierClearDuesDialog, setSupplierClearDuesDialog] = useState({ open: false, supplierId: null, supplierName: "" });
  const [supplierPartialPaymentDialog, setSupplierPartialPaymentDialog] = useState({
    open: false,
    supplierId: null,
    supplierName: "",
    amount: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (initial = false) => {
    initial ? setLoading(true) : setRefreshing(true);
    try {
      const res = await axios.get(`${API}/dashboard/overview`);
      setData(res.data);
    } catch (error) {
      if (error.response?.status !== 403) toast.error("Failed to load dashboard data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load(true);
    // Keep the counter screen fresh without a manual refresh
    const t = setInterval(() => load(false), 2 * 60 * 1000);
    return () => clearInterval(t);
  }, [load]);

  const trend = useMemo(() => (data?.trend || []).slice(-range), [data, range]);
  const rangeTotals = useMemo(() => {
    const revenue = trend.reduce((s, d) => s + d.revenue, 0);
    const profit = trend.reduce((s, d) => s + d.profit, 0);
    const bills = trend.reduce((s, d) => s + d.bills, 0);
    const best = trend.reduce((m, d) => (d.revenue > (m?.revenue || 0) ? d : m), null);
    return { revenue, profit, bills, best, avg: trend.length ? revenue / trend.length : 0 };
  }, [trend]);

  const hours = useMemo(() => {
    const all = data?.busy_hours || [];
    const active = all.filter((h) => h.bills > 0);
    if (!active.length) return { rows: [], peak: null };
    const first = Math.max(0, Math.min(...active.map((h) => h.hour)) - 1);
    const last = Math.min(23, Math.max(...active.map((h) => h.hour)) + 1);
    const rows = all.filter((h) => h.hour >= first && h.hour <= last);
    const peak = rows.reduce((m, h) => (h.bills > (m?.bills || 0) ? h : m), null);
    return { rows, peak };
  }, [data]);

  const axisColor = isDark ? "rgba(255,255,255,0.45)" : "rgba(15,23,42,0.45)";
  const gridColor = isDark ? "rgba(255,255,255,0.06)" : "rgba(15,23,42,0.06)";

  // ---------------- actions (unchanged endpoints) ----------------
  const confirmClearDebt = async () => {
    if (!clearDebtDialog.customerId) return;
    setSaving(true);
    try {
      const response = await axios.post(`${API}/customers/${clearDebtDialog.customerId}/clear-debt`);
      toast.success(response.data.message || "Dues settled");
      setClearDebtDialog({ open: false, customerId: null, customerName: "" });
      load(false);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to clear debt");
    } finally {
      setSaving(false);
    }
  };

  const confirmSupplierPartialPayment = async () => {
    const { supplierId, amount, notes } = supplierPartialPaymentDialog;
    if (!supplierId || !(parseFloat(amount) > 0)) {
      toast.error("Enter a valid payment amount");
      return;
    }
    setSaving(true);
    try {
      await axios.post(`${API}/suppliers/${supplierId}/pay-part`, { amount: parseFloat(amount), notes });
      toast.success("Payment recorded");
      setSupplierPartialPaymentDialog((d) => ({ ...d, open: false }));
      load(false);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to record payment");
    } finally {
      setSaving(false);
    }
  };

  const confirmSupplierClearAllDues = async () => {
    if (!supplierClearDuesDialog.supplierId) return;
    setSaving(true);
    try {
      await axios.post(`${API}/suppliers/${supplierClearDuesDialog.supplierId}/pay-all`);
      toast.success("Supplier dues settled");
      setSupplierClearDuesDialog((d) => ({ ...d, open: false }));
      load(false);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to clear dues");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Loader size="lg" text="Loading Dashboard..." />;
  if (!data) {
    return (
      <div className="py-24 flex flex-col items-center gap-3">
        <p className="text-sm font-semibold text-muted-foreground">We couldn't load your dashboard.</p>
        <Button variant="outline" onClick={() => load(true)}>
          Try again
        </Button>
      </div>
    );
  }

  const { today, month, inventory: inv, receivables: recv, payables: pay } = data;
  const noSalesYet = today.bills === 0;
  const mixTotal = data.payment_mix.reduce((s, m) => s + m.amount, 0);
  const topMax = Math.max(1, ...data.top_products.map((p) => p.revenue));

  const attention = [
    inv.expired.batches > 0 && {
      icon: Ban,
      tone: "rose",
      title: `${inv.expired.batches} expired batch${inv.expired.batches === 1 ? "" : "es"} still in stock`,
      detail: `${inr(inv.expired.value)} at cost · return or write off`,
      to: "/expiry",
    },
    inv.expiring_critical.batches > 0 && {
      icon: CalendarClock,
      tone: "rose",
      title: `${inv.expiring_critical.batches} batch${inv.expiring_critical.batches === 1 ? "" : "es"} expire within ${inv.thresholds.expiryCriticalDays} days`,
      detail: `${inr(inv.expiring_critical.value)} at cost · sell first or return`,
      to: "/expiry",
    },
    inv.low_stock_selling_count > 0 && {
      icon: AlertTriangle,
      tone: "amber",
      title: `${inv.low_stock_selling_count} fast-moving medicine${inv.low_stock_selling_count === 1 ? "" : "s"} running low`,
      detail: `Sold in the last 30 days and at or below ${inv.thresholds.lowStock} units`,
      to: "/inventory",
    },
    recv.overdue > 0 && {
      icon: Wallet,
      tone: "amber",
      title: `${inr(recv.overdue)} udhar overdue`,
      detail: `${recv.overdue_bills} bill${recv.overdue_bills === 1 ? "" : "s"} unpaid for over 30 days`,
      to: "/customers",
    },
    pay.overdue > 0 && {
      icon: Truck,
      tone: "sky",
      title: `${inr(pay.overdue)} owed to suppliers for 30+ days`,
      detail: `${pay.overdue_purchases} purchase bill${pay.overdue_purchases === 1 ? "" : "s"}`,
      to: "/suppliers",
    },
    inv.expiring_warning.batches > 0 && {
      icon: Clock,
      tone: "slate",
      title: `${inv.expiring_warning.batches} more expire within ${inv.thresholds.expiryWarningDays} days`,
      detail: `${inr(inv.expiring_warning.value)} at cost`,
      to: "/expiry",
    },
    inv.bad_expiry_dates > 0 && {
      icon: PackageX,
      tone: "slate",
      title: `${inv.bad_expiry_dates} batch${inv.bad_expiry_dates === 1 ? " has" : "es have"} an invalid expiry date`,
      detail: "Fix them in Inventory so expiry alerts stay accurate",
      to: "/inventory",
    },
  ].filter(Boolean);

  return (
    <div className="space-y-6 pb-16" data-testid="dashboard-page">
      {/* ------------------------------------------------------------ Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-bold text-muted-foreground">
            {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" })}
          </p>
          <h1 className="mt-1 text-2xl sm:text-3xl font-black tracking-tight text-foreground truncate">
            {greeting()}, {user?.name?.split(" ")[0] || "there"}
          </h1>
          <p className="mt-1 text-sm font-semibold text-muted-foreground truncate">
            Here's how <span className="text-foreground">{pharmacy?.name || "your pharmacy"}</span> is doing.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2" data-tour="dashboard-actions">
          <span className="hidden sm:inline text-[11px] font-semibold text-muted-foreground mr-1">Updated {timeAgo(data.as_of)}</span>
          <Button
            variant="outline"
            size="icon"
            onClick={() => load(false)}
            className="h-10 w-10 rounded-xl"
            title="Refresh"
            data-testid="dashboard-refresh"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
          </Button>
          <Button variant="outline" onClick={() => navigate("/purchases")} className="h-10 rounded-xl font-bold">
            <ShoppingCart className="w-4 h-4 mr-1.5 text-orange-500" /> Add purchase
          </Button>
          <Button variant="outline" onClick={() => window.open("/scan", "_blank")} className="h-10 rounded-xl font-bold hidden sm:inline-flex">
            <ScanLine className="w-4 h-4 mr-1.5 text-orange-500" /> Scan bill
          </Button>
          <Button
            onClick={() => navigate("/billing")}
            className="h-10 rounded-xl font-bold text-white bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 shadow-lg shadow-orange-500/25"
          >
            <Plus className="w-4 h-4 mr-1.5" /> New bill
          </Button>
        </div>
      </div>

      {/* ------------------------------------------------------------ KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" data-tour="dashboard-kpis">
        <KpiCard
          icon={IndianRupee}
          tone="orange"
          label="Today's sales"
          value={inr(today.revenue)}
          delta={!noSalesYet && <Delta value={today.vs_yesterday_pct} />}
          deltaLabel={noSalesYet ? `No bills yet today · yesterday ${inr(today.yesterday_revenue)}` : "vs yesterday"}
          spark={<Sparkline id="spark-today" data={(data.trend || []).slice(-14)} />}
          footer={
            <div className="flex justify-between">
              <span>{today.bills} bills</span>
              <span>Avg bill {inr(today.avg_bill)}</span>
            </div>
          }
        />
        <KpiCard
          icon={TrendingUp}
          tone="sky"
          label="This month"
          value={inr(month.revenue)}
          delta={<Delta value={month.vs_last_month_pct} />}
          deltaLabel={month.vs_last_month_pct === null ? "First month of sales" : "vs same days last month"}
          footer={
            <div className="flex justify-between">
              <span>{month.bills} bills</span>
              <span>Avg {inr(month.avg_bill)}</span>
            </div>
          }
        />
        <KpiCard
          icon={PiggyBank}
          tone="emerald"
          label="Gross profit · month"
          value={inr(month.profit)}
          delta={<Delta value={month.profit_vs_last_month_pct} />}
          deltaLabel={`${month.margin_pct}% margin`}
          footer={
            <div className="flex justify-between">
              <span>Purchases {inr(month.purchases.amount)}</span>
              <span>{month.purchases.count} bills</span>
            </div>
          }
        />
        <KpiCard
          icon={Package}
          tone="violet"
          label="Stock value"
          value={inr(inv.stock_value)}
          deltaLabel={`${inr(inv.stock_mrp_value)} at MRP`}
          footer={
            <div className="flex justify-between">
              <span>{inv.medicines_in_stock.toLocaleString("en-IN")} medicines</span>
              <span>{inv.batches_in_stock.toLocaleString("en-IN")} batches</span>
            </div>
          }
        />
      </div>

      {/* ------------------------------------------------------------ Trend + attention */}
      <div className="grid gap-4 xl:grid-cols-12">
        <Card className="xl:col-span-8 pb-4">
          <CardHeader
            icon={TrendingUp}
            title="Sales performance"
            subtitle={`${inr(rangeTotals.revenue)} revenue · ${inr(rangeTotals.profit)} profit · ${rangeTotals.bills} bills in ${range} days`}
            action={
              <div className="flex flex-wrap justify-end gap-2">
                <SegmentedToggle
                  value={metric}
                  onChange={setMetric}
                  options={[
                    ["revenue", "Revenue"],
                    ["profit", "Profit"],
                    ["bills", "Bills"],
                  ]}
                />
                <SegmentedToggle
                  value={range}
                  onChange={setRange}
                  options={[
                    [7, "7D"],
                    [14, "14D"],
                    [30, "30D"],
                  ]}
                />
              </div>
            }
          />
          <div className="px-5 pt-4 flex flex-wrap gap-2">
            <span className="rounded-lg bg-muted px-2.5 py-1 text-[11px] font-bold text-muted-foreground">
              Daily avg <span className="text-foreground">{inr(rangeTotals.avg)}</span>
            </span>
            {rangeTotals.best && (
              <span className="rounded-lg bg-orange-500/10 px-2.5 py-1 text-[11px] font-bold text-orange-500">
                Best day {dayLabel(rangeTotals.best.date)} · {inr(rangeTotals.best.revenue)}
              </span>
            )}
          </div>
          <div className="h-72 px-2 pt-3">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={metric === "profit" ? "#10b981" : BRAND} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={metric === "profit" ? "#10b981" : BRAND} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={gridColor} vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={dayLabel}
                  tick={{ fontSize: 10, fontWeight: 600, fill: axisColor }}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={18}
                />
                <YAxis
                  tickFormatter={(v) => (metric === "bills" ? v : inrCompact(v))}
                  tick={{ fontSize: 10, fontWeight: 600, fill: axisColor }}
                  tickLine={false}
                  axisLine={false}
                  width={52}
                  allowDecimals={false}
                />
                <Tooltip content={<ChartTooltip metric={metric} />} cursor={{ stroke: axisColor, strokeDasharray: "4 4" }} />
                <Area
                  type="monotone"
                  dataKey={metric}
                  stroke={metric === "profit" ? "#10b981" : BRAND}
                  strokeWidth={2.5}
                  fill="url(#trendFill)"
                  activeDot={{ r: 5, strokeWidth: 2, stroke: isDark ? "#0a0a0a" : "#ffffff" }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="xl:col-span-4 flex flex-col">
          <CardHeader
            icon={AlertTriangle}
            tone="rose"
            title="Needs your attention"
            subtitle={attention.length ? `${attention.length} thing${attention.length === 1 ? "" : "s"} to act on` : "All clear"}
          />
          <div className="p-5 pt-4 space-y-2 flex-1">
            {attention.length ? (
              attention.map((a, i) => <AttentionRow key={i} {...a} onClick={() => navigate(a.to)} />)
            ) : (
              <EmptyState text="Nothing urgent. Stock, expiry and dues all look healthy." />
            )}
          </div>
        </Card>
      </div>

      {/* ------------------------------------------------------------ Mix row */}
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-12">
        <Card className="xl:col-span-5">
          <CardHeader
            icon={Receipt}
            tone="amber"
            title="Top selling medicines"
            subtitle="Last 30 days, by revenue"
            action={<LinkAction label="Reports" onClick={() => navigate("/reports")} />}
          />
          <div className="p-5 pt-4 space-y-3.5">
            {data.top_products.length === 0 ? (
              <EmptyState icon={Receipt} text="No sales in the last 30 days yet" />
            ) : (
              data.top_products.map((p, i) => (
                <div key={p.product_name} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black shrink-0 ${
                          i === 0 ? "bg-orange-500 text-white" : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {i + 1}
                      </span>
                      <span className="font-bold text-foreground truncate">{p.product_name}</span>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="font-black text-foreground tabular-nums">{inr(p.revenue)}</span>
                      <span className="ml-2 text-[10px] font-semibold text-muted-foreground">{p.quantity} units</span>
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-orange-500 to-amber-400"
                      style={{ width: `${Math.max(4, (p.revenue / topMax) * 100)}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card className="xl:col-span-3">
          <CardHeader icon={CreditCard} tone="sky" title="How customers paid" subtitle="This month" />
          <div className="p-5 pt-2">
            {mixTotal === 0 ? (
              <EmptyState icon={CreditCard} text="No payments recorded this month" />
            ) : (
              <>
                <div className="relative h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={data.payment_mix} dataKey="amount" nameKey="mode" innerRadius="68%" outerRadius="95%" paddingAngle={2} stroke="none">
                        {data.payment_mix.map((m, i) => (
                          <Cell key={m.mode} fill={m.mode.startsWith("Credit") ? "#f43f5e" : MIX_COLORS[i % MIX_COLORS.length]} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-lg font-black text-foreground tabular-nums">{inrCompact(mixTotal)}</span>
                    <span className="text-[10px] font-bold text-muted-foreground uppercase">billed</span>
                  </div>
                </div>
                <div className="mt-3 space-y-1.5">
                  {data.payment_mix.map((m, i) => (
                    <div key={m.mode} className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-2 font-semibold text-foreground min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ background: m.mode.startsWith("Credit") ? "#f43f5e" : MIX_COLORS[i % MIX_COLORS.length] }}
                        />
                        <span className="truncate">{m.mode}</span>
                      </span>
                      <span className="font-bold text-muted-foreground tabular-nums">
                        {Math.round((m.amount / mixTotal) * 100)}% · {inrCompact(m.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </Card>

        <Card className="lg:col-span-2 xl:col-span-4">
          <CardHeader
            icon={Clock}
            tone="violet"
            title="Busiest hours"
            subtitle={hours.peak ? `Peak ${hourLabel(hours.peak.hour)}–${hourLabel((hours.peak.hour + 1) % 24)} · last 30 days` : "Last 30 days"}
          />
          <div className="h-56 px-2 pt-3 pb-3">
            {hours.rows.length === 0 ? (
              <EmptyState icon={Clock} text="Not enough bills yet" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hours.rows} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
                  <CartesianGrid stroke={gridColor} vertical={false} />
                  <XAxis dataKey="hour" tickFormatter={hourLabel} tick={{ fontSize: 10, fontWeight: 600, fill: axisColor }} tickLine={false} axisLine={false} interval={1} />
                  <YAxis tick={{ fontSize: 10, fontWeight: 600, fill: axisColor }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip
                    cursor={{ fill: gridColor }}
                    content={({ active, payload }) =>
                      active && payload?.length ? (
                        <div className="rounded-xl border border-border bg-card px-3 py-2 shadow-xl">
                          <p className="text-[10px] font-bold uppercase text-muted-foreground">
                            {hourLabel(payload[0].payload.hour)}–{hourLabel((payload[0].payload.hour + 1) % 24)}
                          </p>
                          <p className="text-sm font-black text-foreground">{payload[0].payload.bills} bills</p>
                          <p className="text-[10px] font-semibold text-muted-foreground">{inr(payload[0].payload.revenue)}</p>
                        </div>
                      ) : null
                    }
                  />
                  <Bar dataKey="bills" radius={[6, 6, 0, 0]}>
                    {hours.rows.map((h) => (
                      <Cell key={h.hour} fill={h.hour === hours.peak?.hour ? "#8b5cf6" : isDark ? "rgba(139,92,246,0.35)" : "rgba(139,92,246,0.3)"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>

      {/* ------------------------------------------------------------ Stock row */}
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader
            icon={ShoppingCart}
            tone="amber"
            title="Reorder soon"
            subtitle={`${inv.low_stock_count.toLocaleString("en-IN")} medicines at or below ${inv.thresholds.lowStock} units · ${inv.out_of_stock_count.toLocaleString("en-IN")} out of stock`}
            action={<LinkAction label="Inventory" onClick={() => navigate("/inventory")} />}
          />
          <div className="p-5 pt-4">
            {inv.low_stock.length === 0 ? (
              <EmptyState text="Every medicine is above your low-stock level" />
            ) : (
              <div className="divide-y divide-border">
                {inv.low_stock.map((p) => (
                  <div key={p.product_id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-foreground truncate">{p.product_name}</p>
                      <p className="text-[11px] font-semibold text-muted-foreground">
                        {p.sold_30d > 0 ? `${p.sold_30d} units sold in 30 days` : "No recent sales"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2.5 shrink-0">
                      <span
                        className={`rounded-lg px-2 py-0.5 text-[11px] font-black tabular-nums ${
                          p.units <= Math.max(1, inv.thresholds.lowStock / 3) ? "bg-rose-500/10 text-rose-500" : "bg-amber-500/10 text-amber-500"
                        }`}
                      >
                        {p.units} left
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 rounded-lg text-[11px] font-bold"
                        onClick={() => navigate("/purchases", { state: { openNew: true, prefillName: p.product_name } })}
                      >
                        Reorder
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader
            icon={CalendarClock}
            tone="rose"
            title="Expiry watch"
            subtitle={
              expiryTab === "upcoming"
                ? `In stock, expiring within ${inv.thresholds.expiryWarningDays} days`
                : `${inv.expired.batches} expired batches still in stock · ${inr(inv.expired.value)}`
            }
            action={
              <SegmentedToggle
                value={expiryTab}
                onChange={setExpiryTab}
                options={[
                  ["upcoming", `Upcoming ${inv.expiring_critical.batches + inv.expiring_warning.batches}`],
                  ["expired", `Expired ${inv.expired.batches}`],
                ]}
              />
            }
          />
          <div className="p-5 pt-4">
            {(expiryTab === "upcoming" ? inv.expiring_soon : inv.expired_list).length === 0 ? (
              <EmptyState
                text={
                  expiryTab === "upcoming"
                    ? `Nothing in stock expires in the next ${inv.thresholds.expiryWarningDays} days`
                    : "No expired stock on the shelf"
                }
              />
            ) : (
              <div className="divide-y divide-border">
                {(expiryTab === "upcoming" ? inv.expiring_soon : inv.expired_list).map((b) => {
                  const expired = expiryTab === "expired";
                  const critical = !expired && b.days_left <= inv.thresholds.expiryCriticalDays;
                  return (
                    <div key={b.id || `${b.product_name}-${b.batch_no}`} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-foreground truncate">{b.product_name}</p>
                        <p className="text-[11px] font-semibold text-muted-foreground truncate">
                          Batch {b.batch_no || "—"} · {b.available_quantity} units · {inr(b.value)}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-lg px-2 py-0.5 text-[11px] font-black ${
                          expired ? "bg-rose-500/10 text-rose-500" : critical ? "bg-rose-500/10 text-rose-500" : "bg-amber-500/10 text-amber-500"
                        }`}
                      >
                        {expired ? `Expired ${dateLabel(b.expiry_date)}` : b.days_left === 0 ? "Expires today" : `${b.days_left}d · ${dateLabel(b.expiry_date)}`}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
            <button
              onClick={() => navigate("/expiry")}
              className="mt-3 w-full rounded-xl border border-border py-2 text-[11px] font-bold text-muted-foreground hover:text-orange-500 hover:border-orange-500/40"
            >
              {expiryTab === "expired" ? "Create a return for expired stock" : "Open expiry management"}
            </button>
          </div>
        </Card>
      </div>

      {/* ------------------------------------------------------------ Money row */}
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader
            icon={Wallet}
            tone="amber"
            title="Customer khata (udhar)"
            subtitle="Money customers owe you"
            action={<LinkAction label="Customers" onClick={() => navigate("/customers")} />}
          />
          <div className="p-5 pt-4 space-y-4">
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-2xl bg-muted/60 p-3">
                <p className="text-[10px] font-extrabold uppercase text-muted-foreground">To collect</p>
                <p className="mt-0.5 text-lg font-black text-foreground tabular-nums">{inr(recv.total)}</p>
              </div>
              <div className="rounded-2xl bg-rose-500/10 p-3">
                <p className="text-[10px] font-extrabold uppercase text-rose-500">Overdue 30d+</p>
                <p className="mt-0.5 text-lg font-black text-rose-500 tabular-nums">{inr(recv.overdue)}</p>
              </div>
              <div className="rounded-2xl bg-muted/60 p-3">
                <p className="text-[10px] font-extrabold uppercase text-muted-foreground">Unpaid bills</p>
                <p className="mt-0.5 text-lg font-black text-foreground tabular-nums">{recv.bills}</p>
              </div>
            </div>
            {recv.top.length === 0 ? (
              <EmptyState text="No outstanding customer balances" />
            ) : (
              <div className="divide-y divide-border">
                {recv.top.map((d) => (
                  <div key={d.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-amber-500/10 text-amber-500 text-xs font-black flex items-center justify-center shrink-0">
                        {(d.name || "?").charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-foreground truncate">{d.name}</p>
                        <p className="text-[11px] font-semibold text-muted-foreground truncate">
                          {d.bills_count} bill{d.bills_count === 1 ? "" : "s"}
                          {d.oldest ? ` · since ${dayLabel(d.oldest)}` : ""}
                          {d.mobile ? ` · ${d.mobile}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-black text-foreground tabular-nums">{inr(d.total_debt)}</span>
                      <Button
                        size="sm"
                        className="h-7 rounded-lg text-[11px] font-bold bg-emerald-500 hover:bg-emerald-600 text-white"
                        onClick={() => setClearDebtDialog({ open: true, customerId: d.id, customerName: d.name })}
                      >
                        Settle
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader
            icon={Truck}
            tone="sky"
            title="Supplier payments"
            subtitle="Money you owe distributors"
            action={<LinkAction label="Suppliers" onClick={() => navigate("/suppliers")} />}
          />
          <div className="p-5 pt-4 space-y-4">
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-2xl bg-muted/60 p-3">
                <p className="text-[10px] font-extrabold uppercase text-muted-foreground">To pay</p>
                <p className="mt-0.5 text-lg font-black text-foreground tabular-nums">{inr(pay.total)}</p>
              </div>
              <div className="rounded-2xl bg-rose-500/10 p-3">
                <p className="text-[10px] font-extrabold uppercase text-rose-500">Overdue 30d+</p>
                <p className="mt-0.5 text-lg font-black text-rose-500 tabular-nums">{inr(pay.overdue)}</p>
              </div>
              <div className="rounded-2xl bg-muted/60 p-3">
                <p className="text-[10px] font-extrabold uppercase text-muted-foreground">Unpaid bills</p>
                <p className="mt-0.5 text-lg font-black text-foreground tabular-nums">{pay.purchases}</p>
              </div>
            </div>
            {pay.top.length === 0 ? (
              <EmptyState text="No pending supplier payments" />
            ) : (
              <div className="divide-y divide-border">
                {pay.top.map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-sky-500/10 text-sky-500 flex items-center justify-center shrink-0">
                        <Truck className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-foreground truncate">{s.name}</p>
                        <p className="text-[11px] font-semibold text-muted-foreground truncate">
                          {s.purchase_count} unpaid purchase{s.purchase_count === 1 ? "" : "s"}
                          {s.overdue > 0 ? ` · ${inr(s.overdue)} overdue` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-xs font-black text-foreground tabular-nums mr-1">{inr(s.total_debt)}</span>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 rounded-lg text-[11px] font-bold"
                        onClick={() => setSupplierPartialPaymentDialog({ open: true, supplierId: s.id, supplierName: s.name, amount: "", notes: "" })}
                      >
                        Pay part
                      </Button>
                      <Button
                        size="sm"
                        className="h-7 rounded-lg text-[11px] font-bold bg-orange-500 hover:bg-orange-600 text-white"
                        onClick={() => setSupplierClearDuesDialog({ open: true, supplierId: s.id, supplierName: s.name })}
                      >
                        Settle
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* ------------------------------------------------------------ Recent bills */}
      <Card>
        <CardHeader
          icon={Users}
          tone="emerald"
          title="Recent bills"
          subtitle={`${data.customers.total.toLocaleString("en-IN")} customers · ${data.customers.new_this_month} new this month`}
          action={<LinkAction label="All bills" onClick={() => navigate("/billing")} />}
        />
        <div className="p-5 pt-4">
          {data.recent_bills.length === 0 ? (
            <EmptyState icon={Receipt} text="No bills yet. Create your first bill to see it here." />
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {data.recent_bills.map((b) => (
                <div key={b.id} className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-background/40 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-foreground truncate">{b.customer_name}</p>
                    <p className="text-[11px] font-semibold text-muted-foreground truncate">
                      {b.bill_no} · {timeAgo(b.created_at)}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-black text-foreground tabular-nums">{inr(b.amount, { decimals: 2 })}</p>
                    <span className={`text-[10px] font-extrabold ${b.is_paid ? "text-emerald-500" : "text-rose-500"}`}>
                      {b.is_paid ? "Paid" : "Udhar"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* ------------------------------------------------------------ Dialogs */}
      <AlertDialog open={clearDebtDialog.open} onOpenChange={(open) => !open && setClearDebtDialog((d) => ({ ...d, open: false }))}>
        <AlertDialogContent className="rounded-3xl max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-black flex items-center gap-2">
              <Wallet className="w-5 h-5 text-amber-500" /> Settle customer account
            </AlertDialogTitle>
            <AlertDialogDescription>
              This marks every pending bill of <span className="font-bold text-foreground">{clearDebtDialog.customerName}</span> as paid and
              resets their balance to zero.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving} className="rounded-xl">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white"
              disabled={saving}
              onClick={(e) => {
                e.preventDefault();
                confirmClearDebt();
              }}
            >
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : "Yes, settle"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={supplierPartialPaymentDialog.open}
        onOpenChange={(open) => !open && setSupplierPartialPaymentDialog((d) => ({ ...d, open: false }))}
      >
        <DialogContent className="rounded-3xl max-w-md">
          <DialogHeader>
            <DialogTitle className="font-black flex items-center gap-2">
              <Truck className="w-5 h-5 text-orange-500" /> Pay part to {supplierPartialPaymentDialog.supplierName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-xs font-bold">Amount paid (₹)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={supplierPartialPaymentDialog.amount}
                onChange={(e) => setSupplierPartialPaymentDialog((d) => ({ ...d, amount: e.target.value }))}
                className="h-11 rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold">Reference / notes</Label>
              <Input
                placeholder="Cheque no., UPI ref, bank ref..."
                value={supplierPartialPaymentDialog.notes}
                onChange={(e) => setSupplierPartialPaymentDialog((d) => ({ ...d, notes: e.target.value }))}
                className="h-11 rounded-xl"
              />
            </div>
            <Button
              onClick={confirmSupplierPartialPayment}
              disabled={saving}
              className="w-full h-11 rounded-xl font-bold text-white bg-gradient-to-r from-orange-500 to-amber-500"
            >
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : "Record payment"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={supplierClearDuesDialog.open}
        onOpenChange={(open) => !open && setSupplierClearDuesDialog((d) => ({ ...d, open: false }))}
      >
        <AlertDialogContent className="rounded-3xl max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-black flex items-center gap-2">
              <Truck className="w-5 h-5 text-orange-500" /> Settle supplier dues
            </AlertDialogTitle>
            <AlertDialogDescription>
              This marks every pending purchase from <span className="font-bold text-foreground">{supplierClearDuesDialog.supplierName}</span>{" "}
              as fully paid.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving} className="rounded-xl">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-orange-500 hover:bg-orange-600 text-white"
              disabled={saving}
              onClick={(e) => {
                e.preventDefault();
                confirmSupplierClearAllDues();
              }}
            >
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : "Yes, settle"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
