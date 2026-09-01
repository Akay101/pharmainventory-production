import { useState, useEffect } from "react";
import axios from "axios";
import { API, useAuth } from "../App";
import { Button } from "../components/ui/button";
import {
  IndianRupee,
  TrendingUp,
  Package,
  Receipt,
  AlertTriangle,
  Clock,
  Sparkles,
  RefreshCw,
  ArrowUpRight,
  Check,
  Truck,
  Calendar,
  Layers,
  Zap,
  ShieldCheck,
  AlertCircle,
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { Label } from "../components/ui/label";
import { Input } from "../components/ui/input";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";
import { toast } from "sonner";
import Loader from "../components/Loader";

export default function DashboardPage() {
  const { pharmacy, user } = useAuth();
  const [stats, setStats] = useState(null);
  const [salesTrend, setSalesTrend] = useState([]);
  const [topProducts, setTopProducts] = useState([]);
  const [alerts, setAlerts] = useState({
    low_stock_alerts: [],
    expiry_alerts: [],
  });
  const [debtSummary, setDebtSummary] = useState(null);
  const [supplierDues, setSupplierDues] = useState(null);
  const [clearDebtDialog, setClearDebtDialog] = useState({
    open: false,
    customerId: null,
    customerName: "",
  });
  const [supplierClearDuesDialog, setSupplierClearDuesDialog] = useState({
    open: false,
    supplierId: null,
    supplierName: "",
  });
  const [supplierPartialPaymentDialog, setSupplierPartialPaymentDialog] =
    useState({
      open: false,
      supplierId: null,
      supplierName: "",
      amount: "0",
      notes: "",
    });
  const [aiTips, setAiTips] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tipsLoading, setTipsLoading] = useState(false);
  const [clearingDebt, setClearingDebt] = useState(false);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const [statsRes, trendRes, productsRes, alertsRes, debtRes, supplierRes] =
        await Promise.all([
          axios.get(`${API}/dashboard/stats`),
          axios.get(`${API}/dashboard/sales-trend?days=30`),
          axios.get(`${API}/dashboard/top-products?limit=5`),
          axios.get(`${API}/inventory/alerts`),
          axios.get(`${API}/dashboard/debt-summary`),
          axios.get(`${API}/dashboard/supplier-dues`),
        ]);

      setStats(statsRes.data);
      setSalesTrend(trendRes.data.trend || []);
      setTopProducts(productsRes.data.top_products || []);
      setAlerts(alertsRes.data || { low_stock_alerts: [], expiry_alerts: [] });
      setDebtSummary(debtRes.data);
      setSupplierDues(supplierRes.data);
    } catch (error) {
      console.error("Dashboard fetch error:", error);
      toast.error("Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  };

  const fetchAiTips = async () => {
    setTipsLoading(true);
    try {
      const response = await axios.get(`${API}/dashboard/ai-tips`);
      setAiTips(response.data);
    } catch (error) {
      console.error("AI tips error:", error);
      toast.error("Failed to load tips");
    } finally {
      setTipsLoading(false);
    }
  };

  const formatCurrency = (value) => `₹${(value || 0).toLocaleString("en-IN")}`;

  // Helper function to extract stock count cleanly
  const getStockCount = (item) => {
    if (item.quantity !== undefined && item.quantity !== null) return item.quantity;
    if (item.stock !== undefined && item.stock !== null) return item.stock;
    if (item.available_stock !== undefined && item.available_stock !== null) return item.available_stock;
    if (item.current_stock !== undefined && item.current_stock !== null) return item.current_stock;
    return 0;
  };

  // Sales Trend peak and daily average calculations for chart summary
  const peakSales = salesTrend.reduce((max, item) => (item.revenue > max ? item.revenue : max), 0);
  const totalPeriodSales = salesTrend.reduce((sum, item) => sum + (item.revenue || 0), 0);
  const avgDailySales = salesTrend.length ? Math.round(totalPeriodSales / salesTrend.length) : 0;

  const handleClearDebt = (customerId, customerName) => {
    setClearDebtDialog({ open: true, customerId, customerName });
  };

  const confirmClearDebt = async () => {
    const { customerId } = clearDebtDialog;
    if (!customerId) return;

    setClearingDebt(true);
    try {
      const response = await axios.post(
        `${API}/customers/${customerId}/clear-debt`
      );
      toast.success(response.data.message);
      fetchDashboardData();
      setClearDebtDialog({ open: false, customerId: null, customerName: "" });
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to clear debt");
    } finally {
      setClearingDebt(false);
    }
  };

  const handleSupplierPartialPayment = (supplierId, supplierName) => {
    setSupplierPartialPaymentDialog({
      open: true,
      supplierId,
      supplierName,
      amount: "0",
      notes: "",
    });
  };

  const handleSupplierClearDues = (supplierId, supplierName) => {
    setSupplierClearDuesDialog({
      open: true,
      supplierId,
      supplierName,
    });
  };

  const confirmSupplierPartialPayment = async () => {
    const { supplierId, amount, notes } = supplierPartialPaymentDialog;
    if (!supplierId || parseFloat(amount) <= 0) {
      toast.error("Please enter a valid payment amount");
      return;
    }

    setClearingDebt(true);
    try {
      await axios.post(`${API}/suppliers/${supplierId}/pay-part`, {
        amount: parseFloat(amount),
        notes,
      });
      toast.success("Payment registered successfully");
      fetchDashboardData();
      setSupplierPartialPaymentDialog({
        ...supplierPartialPaymentDialog,
        open: false,
      });
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to process payment");
    } finally {
      setClearingDebt(false);
    }
  };

  const confirmSupplierClearAllDues = async () => {
    const { supplierId } = supplierClearDuesDialog;
    if (!supplierId) return;

    setClearingDebt(true);
    try {
      await axios.post(`${API}/suppliers/${supplierId}/pay-all`);
      toast.success("Supplier dues cleared successfully");
      fetchDashboardData();
      setSupplierClearDuesDialog({ ...supplierClearDuesDialog, open: false });
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to clear dues");
    } finally {
      setClearingDebt(false);
    }
  };

  if (loading) {
    return <Loader size="lg" text="Loading Dashboard..." />;
  }

  return (
    <div className="space-y-8 pb-12 select-none animate-in fade-in slide-in-from-bottom-2 duration-500 ease-out" data-testid="dashboard-page">
      
      {/* Asymmetric Top Hero & Key Metrics Bento Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Featured Ultra-Sleek Glass Hero Bento Card (Top Left) */}
        <div className="lg:col-span-5 relative overflow-hidden rounded-[32px] bg-gradient-to-br from-orange-500 via-orange-600 to-amber-500 p-8 text-white shadow-2xl shadow-orange-500/25 border border-orange-400/40 group hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between min-h-[260px]">
          {/* Smooth Radial Ambient Glow Overlay */}
          <div className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-bl from-white/25 via-white/5 to-transparent blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-black/10 blur-2xl pointer-events-none" />

          <div className="relative z-10 space-y-6">
            <div className="flex items-center justify-between">
              <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-white/20 backdrop-blur-md border border-white/30 text-xs font-extrabold uppercase tracking-wider text-white shadow-xs">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Pharmacy Overview</span>
              </div>
              <Button
                size="sm"
                onClick={fetchDashboardData}
                data-testid="refresh-dashboard-btn"
                className="h-9 px-3.5 font-bold text-xs bg-white/20 hover:bg-white/30 text-white backdrop-blur-md border border-white/30 rounded-xl transition-transform active:scale-95 shadow-xs"
              >
                <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>

            <div className="space-y-1">
              <p className="text-xs font-extrabold uppercase tracking-wider text-white/85">
                Today's Sales
              </p>
              {loading && !stats ? (
                <div className="h-12 w-48 bg-white/20 animate-pulse rounded-2xl" />
              ) : (
                <h2 className="text-4xl sm:text-5xl font-black font-mono tracking-tight text-white drop-shadow-sm transition-all duration-300">
                  {formatCurrency(stats?.today?.revenue)}
                </h2>
              )}
              <p className="text-xs font-semibold text-white/90 pt-1">
                Welcome back, <span className="font-extrabold">{user?.name || "Pharmacist"}</span>! Store total for <span className="font-extrabold">{pharmacy?.name}</span>.
              </p>
            </div>
          </div>

          <div className="relative z-10 pt-4 border-t border-white/20 flex items-center justify-between">
            <span className="text-xs font-extrabold text-white/90 flex items-center gap-1.5">
              <IndianRupee className="w-3.5 h-3.5" />
              Daily Billing Summary
            </span>
            <span className="text-[10px] font-mono font-bold bg-white/20 px-2.5 py-0.5 rounded-full border border-white/25">
              POS ACTIVE
            </span>
          </div>
        </div>

        {/* Top Right Key Metrics Bento Grid (Stagger Delay 100ms) */}
        <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-3 gap-6">
          {/* Today's Profit */}
          <div className="group relative overflow-hidden rounded-[28px] bg-card/85 dark:bg-card/70 border-2 border-border/80 dark:border-border/60 p-6 backdrop-blur-xl shadow-md hover:shadow-xl hover:border-emerald-500/40 hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <p className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
                Today's Profit
              </p>
              <div className="p-2.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 group-hover:scale-110 transition-transform shadow-xs">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
            <div className="space-y-1 py-3">
              {loading && !stats ? (
                <div className="h-8 w-28 bg-muted/60 animate-pulse rounded-xl" />
              ) : (
                <h3 className="text-2xl sm:text-3xl font-black font-mono tracking-tight text-foreground">
                  {formatCurrency(stats?.today?.profit)}
                </h3>
              )}
              <p className="text-[11px] font-semibold text-muted-foreground">
                Calculated net gain
              </p>
            </div>
            <div className="pt-2 border-t border-border/50">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-extrabold uppercase tracking-wider">
                <ArrowUpRight className="w-3 h-3" />
                Net Margin
              </span>
            </div>
          </div>

          {/* Monthly Sales */}
          <div className="group relative overflow-hidden rounded-[28px] bg-card/85 dark:bg-card/70 border-2 border-border/80 dark:border-border/60 p-6 backdrop-blur-xl shadow-md hover:shadow-xl hover:border-amber-500/40 hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <p className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
                Monthly Sales
              </p>
              <div className="p-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-500 group-hover:scale-110 transition-transform shadow-xs">
                <IndianRupee className="w-4 h-4" />
              </div>
            </div>
            <div className="space-y-1 py-3">
              {loading && !stats ? (
                <div className="h-8 w-28 bg-muted/60 animate-pulse rounded-xl" />
              ) : (
                <h3 className="text-2xl sm:text-3xl font-black font-mono tracking-tight text-foreground">
                  {formatCurrency(stats?.month?.revenue)}
                </h3>
              )}
              <p className="text-[11px] font-semibold text-muted-foreground">
                Total 30-day billing
              </p>
            </div>
            <div className="pt-2 border-t border-border/50">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px] font-extrabold uppercase tracking-wider">
                <Zap className="w-3 h-3" />
                30-Day Total
              </span>
            </div>
          </div>

          {/* Total Stock Value */}
          <div className="group relative overflow-hidden rounded-[28px] bg-card/85 dark:bg-card/70 border-2 border-border/80 dark:border-border/60 p-6 backdrop-blur-xl shadow-md hover:shadow-xl hover:border-orange-500/40 hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <p className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
                Total Stock Value
              </p>
              <div className="p-2.5 rounded-2xl bg-orange-500/10 border border-orange-500/30 text-orange-500 group-hover:scale-110 transition-transform shadow-xs">
                <Package className="w-4 h-4" />
              </div>
            </div>
            <div className="space-y-1 py-3">
              {loading && !stats ? (
                <div className="h-8 w-32 bg-muted/60 animate-pulse rounded-xl" />
              ) : (
                <h3 className="text-2xl sm:text-3xl font-black font-mono tracking-tight text-foreground">
                  {formatCurrency(stats?.inventory?.stock_value)}
                </h3>
              )}
              <p className="text-[11px] font-semibold text-muted-foreground">
                Current inventory value
              </p>
            </div>
            <div className="pt-2 border-t border-border/50">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border border-orange-500/30 bg-orange-500/10 text-orange-600 dark:text-orange-400 text-[10px] font-extrabold uppercase tracking-wider">
                <Layers className="w-3 h-3" />
                Active Assets
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Attention Bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Pending Payments */}
        <div className="group relative overflow-hidden rounded-[24px] bg-card/85 dark:bg-card/70 border-2 border-border/80 dark:border-border/60 p-6 backdrop-blur-xl shadow-md hover:shadow-lg hover:border-amber-500/40 hover:-translate-y-1 transition-all duration-300 flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
              Pending Payments
            </p>
            {loading && !stats ? (
              <div className="h-7 w-24 bg-muted/60 animate-pulse rounded-lg" />
            ) : (
              <h4 className="text-2xl font-black font-mono text-foreground">
                {formatCurrency(stats?.pending?.amount)}
              </h4>
            )}
            <p className="text-[11px] font-semibold text-muted-foreground">
              Uncollected customer dues
            </p>
          </div>
          <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-500 shadow-xs shrink-0">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        {/* Low Stock Items */}
        <div className="group relative overflow-hidden rounded-[24px] bg-card/85 dark:bg-card/70 border-2 border-border/80 dark:border-border/60 p-6 backdrop-blur-xl shadow-md hover:shadow-lg hover:border-rose-500/40 hover:-translate-y-1 transition-all duration-300 flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
              Low Stock Items
            </p>
            {loading && !alerts ? (
              <div className="h-7 w-16 bg-muted/60 animate-pulse rounded-lg" />
            ) : (
              <h4 className="text-2xl font-black font-mono text-foreground">
                {alerts.low_stock_alerts?.length || 0}
              </h4>
            )}
            <p className="text-[11px] font-semibold text-muted-foreground">
              Products near shortage limit
            </p>
          </div>
          <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-500 shadow-xs shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>

        {/* Expiring Soon */}
        <div className="group relative overflow-hidden rounded-[24px] bg-card/85 dark:bg-card/70 border-2 border-border/80 dark:border-border/60 p-6 backdrop-blur-xl shadow-md hover:shadow-lg hover:border-rose-500/40 hover:-translate-y-1 transition-all duration-300 flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
              Expiring Soon
            </p>
            {loading && !alerts ? (
              <div className="h-7 w-16 bg-muted/60 animate-pulse rounded-lg" />
            ) : (
              <h4 className="text-2xl font-black font-mono text-foreground">
                {alerts.expiry_alerts?.length || 0}
              </h4>
            )}
            <p className="text-[11px] font-semibold text-muted-foreground">
              Batches expiring in 90 days
            </p>
          </div>
          <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-500 shadow-xs shrink-0">
            <Calendar className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Upgraded Analytics Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Sales Trend AreaChart */}
        <div className="lg:col-span-7 rounded-[28px] bg-card/85 dark:bg-card/70 border-2 border-border/80 dark:border-border/60 p-6 sm:p-8 backdrop-blur-xl shadow-lg space-y-6 relative overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-border/60 pb-4 gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-orange-500/10 border border-orange-500/30 text-orange-500 shadow-xs">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-foreground">Sales Trend (30 Days)</h3>
                <p className="text-xs font-semibold text-muted-foreground">Daily sales history trajectory</p>
              </div>
            </div>

            {/* Quick Chart Summary Pills */}
            <div className="flex items-center gap-3 self-start sm:self-center font-mono">
              <div className="px-3 py-1 rounded-xl bg-orange-500/10 border border-orange-500/20 text-right">
                <span className="text-[9px] uppercase font-bold text-muted-foreground block leading-tight">Peak Single Day</span>
                <span className="text-xs font-black text-orange-500">{formatCurrency(peakSales)}</span>
              </div>
              <div className="px-3 py-1 rounded-xl bg-muted/60 border border-border/60 text-right">
                <span className="text-[9px] uppercase font-bold text-muted-foreground block leading-tight">Daily Avg</span>
                <span className="text-xs font-black text-foreground">{formatCurrency(avgDailySales)}</span>
              </div>
            </div>
          </div>

          <div className="h-72 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={salesTrend}>
                <defs>
                  <linearGradient id="colorSalesGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f97316" stopOpacity={0.45} />
                    <stop offset="95%" stopColor="#f97316" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 4" stroke="rgba(249,115,22,0.12)" vertical={false} />
                <XAxis
                  dataKey="date"
                  stroke="hsl(var(--muted-foreground))"
                  tick={{ fontSize: 10, fontWeight: "bold" }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(val) => val ? val.slice(5) : ""}
                />
                <YAxis
                  stroke="hsl(var(--muted-foreground))"
                  tick={{ fontSize: 10, fontWeight: "bold" }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(val) => `₹${val / 1000}k`}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="bg-card/95 border-2 border-orange-500/40 rounded-2xl p-3.5 shadow-2xl backdrop-blur-xl space-y-1">
                          <p className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-wider">
                            Date: {label}
                          </p>
                          <p className="text-base font-black font-mono text-orange-500">
                            ₹{payload[0].value.toLocaleString("en-IN")}
                          </p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#f97316"
                  strokeWidth={3.5}
                  fillOpacity={1}
                  fill="url(#colorSalesGradient)"
                  activeDot={{
                    r: 6,
                    stroke: "#ffffff",
                    strokeWidth: 3,
                    fill: "#f97316",
                  }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Selling Products Recharts BarChart */}
        <div className="lg:col-span-5 rounded-[28px] bg-card/85 dark:bg-card/70 border-2 border-border/80 dark:border-border/60 p-6 sm:p-8 backdrop-blur-xl shadow-lg space-y-6 relative overflow-hidden">
          <div className="flex items-center justify-between border-b border-border/60 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-500 shadow-xs">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-foreground">Top Selling Products</h3>
                <p className="text-xs font-semibold text-muted-foreground">Ranked by revenue volume</p>
              </div>
            </div>
          </div>

          <div className="h-72 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topProducts} layout="vertical" barSize={18}>
                <defs>
                  <linearGradient id="topProductsGradient" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#f97316" />
                    <stop offset="100%" stopColor="#f59e0b" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 4" stroke="rgba(249,115,22,0.12)" horizontal={false} />
                <XAxis
                  type="number"
                  stroke="hsl(var(--muted-foreground))"
                  tick={{ fontSize: 10, fontWeight: "bold" }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(val) => `₹${val / 1000}k`}
                />
                <YAxis
                  dataKey="product_name"
                  type="category"
                  stroke="hsl(var(--muted-foreground))"
                  tick={{ fontSize: 10, fontWeight: "bold" }}
                  width={120}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(val) =>
                    val && val.length > 15 ? `${val.slice(0, 13)}...` : val || ""
                  }
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="bg-card/95 border-2 border-amber-500/40 rounded-2xl p-3 shadow-2xl backdrop-blur-xl space-y-1">
                          <p className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-wider truncate max-w-[180px]">
                            {payload[0].payload.product_name}
                          </p>
                          <p className="text-sm font-black font-mono text-amber-500">
                            ₹{payload[0].value.toLocaleString("en-IN")}
                          </p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar
                  dataKey="revenue"
                  fill="url(#topProductsGradient)"
                  radius={[0, 6, 6, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Stock Warnings & Smart Business Tips */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Stock Warnings Component with Clean Number Badges */}
        <div className="lg:col-span-6 rounded-[28px] bg-card/85 dark:bg-card/70 border-2 border-border/80 dark:border-border/60 p-6 sm:p-8 backdrop-blur-xl shadow-lg space-y-6">
          <div className="flex items-center justify-between border-b border-border/60 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-500 shadow-xs">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-foreground">Stock Warnings</h3>
                <p className="text-xs font-semibold text-muted-foreground">Reorder thresholds and batch expiries</p>
              </div>
            </div>
          </div>

          <div className="space-y-5">
            {/* Low Stock Items Section */}
            {alerts.low_stock_alerts?.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-extrabold text-amber-600 dark:text-amber-400 text-xs uppercase tracking-wider flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                    Low Stock ({alerts.low_stock_alerts.length})
                  </h4>
                </div>
                <div className="space-y-2">
                  {alerts.low_stock_alerts.slice(0, 4).map((item, i) => {
                    const count = getStockCount(item);
                    return (
                      <div
                        key={i}
                        className="flex justify-between items-center p-3 rounded-2xl bg-background/80 border-2 border-amber-500/25 shadow-2xs"
                      >
                        <span className="font-bold text-xs text-foreground truncate max-w-[220px]">
                          {item.product_name}
                        </span>
                        <span className="font-mono font-black text-amber-600 dark:text-amber-400 bg-amber-500/15 border border-amber-500/30 px-3 py-1 rounded-xl text-xs shrink-0">
                          {count} units left
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Expiring Batches Section */}
            {alerts.expiry_alerts?.length > 0 && (
              <div className="space-y-3 pt-2">
                <h4 className="font-extrabold text-rose-600 dark:text-rose-400 text-xs uppercase tracking-wider flex items-center gap-2">
                  <Clock className="w-4 h-4 text-rose-500" />
                  Expiring Batches ({alerts.expiry_alerts.length})
                </h4>
                <div className="space-y-2">
                  {alerts.expiry_alerts.slice(0, 4).map((item, i) => (
                    <div
                      key={i}
                      className="flex justify-between items-center p-3 rounded-2xl bg-background/80 border-2 border-rose-500/25 shadow-2xs"
                    >
                      <div className="space-y-0.5">
                        <p className="font-bold text-xs text-foreground truncate max-w-[180px]">
                          {item.product_name}
                        </p>
                        <span className="font-mono text-[10px] text-muted-foreground uppercase font-semibold block">
                          Batch: {item.batch_no}
                        </span>
                      </div>
                      <span className="font-mono font-black text-rose-500 bg-rose-500/10 border border-rose-500/20 px-2.5 py-1 rounded-xl text-[11px] flex items-center gap-1.5 shrink-0">
                        <Calendar className="w-3.5 h-3.5" />
                        {item.expiry_date}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {alerts.low_stock_alerts?.length === 0 &&
              alerts.expiry_alerts?.length === 0 && (
                <div className="p-6 rounded-2xl border-2 border-emerald-500/30 bg-emerald-500/5 flex items-center gap-3">
                  <ShieldCheck className="w-6 h-6 text-emerald-500 shrink-0" />
                  <div>
                    <p className="text-sm font-extrabold text-foreground">
                      All Inventory Metrics Healthy
                    </p>
                    <p className="text-xs text-muted-foreground font-semibold">
                      No stock shortages or expiring batches flagged.
                    </p>
                  </div>
                </div>
              )}
          </div>
        </div>

        {/* Smart Business Tips Component */}
        <div className="lg:col-span-6 rounded-[28px] bg-card/85 dark:bg-card/70 border-2 border-border/80 dark:border-border/60 p-6 sm:p-8 backdrop-blur-xl shadow-lg flex flex-col justify-between space-y-6">
          <div className="flex items-center justify-between border-b border-border/60 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-orange-500/10 border border-orange-500/30 text-orange-500 shadow-xs">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-foreground">Smart Business Tips</h3>
                <p className="text-xs font-semibold text-muted-foreground">Actionable advice to improve sales</p>
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={fetchAiTips}
              disabled={tipsLoading}
              data-testid="get-ai-tips-btn"
              className="h-9 px-4 font-bold text-xs border-orange-500/30 text-orange-600 dark:text-orange-400 hover:bg-orange-500/10 rounded-xl"
            >
              {tipsLoading ? (
                <RefreshCw className="w-4 h-4 animate-spin text-orange-500" />
              ) : (
                <span className="flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5" />
                  Get Smart Tips
                </span>
              )}
            </Button>
          </div>

          <div className="flex-1 flex flex-col justify-center">
            {aiTips ? (
              <div className="space-y-3">
                <div className="text-foreground/90 text-xs sm:text-sm leading-relaxed font-semibold bg-background/80 p-5 border-2 border-orange-500/25 rounded-2xl shadow-inner space-y-3">
                  {aiTips.tips.split('\n').filter(t => t.trim()).map((tip, idx) => (
                    <div key={idx} className="flex items-start gap-2.5">
                      <span className="w-5 h-5 rounded-lg bg-orange-500/15 text-orange-500 font-extrabold text-xs flex items-center justify-center shrink-0 mt-0.5">
                        {idx + 1}
                      </span>
                      <p className="text-foreground font-semibold">{tip.replace(/^\d+\.\s*/, '')}</p>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground font-bold text-right">
                  Generated: {new Date(aiTips.generated_at).toLocaleString()}
                </p>
              </div>
            ) : (
              <div className="text-center py-10 space-y-3">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-500/15 to-amber-500/15 border-2 border-orange-500/30 flex items-center justify-center mx-auto shadow-md shadow-orange-500/10">
                  <Sparkles className="w-7 h-7 text-orange-500 animate-pulse" />
                </div>
                <div>
                  <h4 className="text-sm font-extrabold text-foreground">
                    Get Customized Business Tips
                  </h4>
                  <p className="text-xs text-muted-foreground font-semibold max-w-xs mx-auto mt-1">
                    Click "Get Smart Tips" above to load stock and sales suggestions.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Customer Dues Card */}
      {debtSummary && debtSummary.total_debt > 0 && (
        <div className="rounded-[28px] bg-card/85 dark:bg-card/70 border-2 border-border/80 dark:border-border/60 p-6 sm:p-8 backdrop-blur-xl shadow-lg space-y-6">
          <div className="flex items-center justify-between border-b border-border/60 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-500 shadow-xs">
                <Receipt className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-foreground">Customer Dues</h3>
                <p className="text-xs font-semibold text-muted-foreground">Uncollected customer balances and bills</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 p-4 rounded-2xl bg-background/80 border-2 border-border/60">
            <div className="p-3">
              <p className="text-[10px] text-amber-500 font-extrabold uppercase tracking-wider">Total Outstanding</p>
              <p className="text-2xl font-black font-mono text-amber-500 mt-1">{formatCurrency(debtSummary.total_debt)}</p>
            </div>
            <div className="p-3">
              <p className="text-[10px] text-rose-500 font-extrabold uppercase tracking-wider">Overdue Amount</p>
              <p className="text-2xl font-black font-mono text-rose-500 mt-1">{formatCurrency(debtSummary.overdue_amount)}</p>
            </div>
            <div className="p-3">
              <p className="text-[10px] text-muted-foreground font-extrabold uppercase tracking-wider">Unpaid Bills</p>
              <p className="text-2xl font-black font-mono text-foreground mt-1">{debtSummary.total_unpaid_bills}</p>
            </div>
            <div className="p-3">
              <p className="text-[10px] text-rose-500/80 font-extrabold uppercase tracking-wider">Overdue Count</p>
              <p className="text-2xl font-black font-mono text-rose-500 mt-1">{debtSummary.overdue_count}</p>
            </div>
          </div>

          {debtSummary.top_debtors?.length > 0 && (
            <div className="space-y-3 pt-2">
              <h4 className="text-xs font-extrabold text-muted-foreground uppercase tracking-wider">
                Customers with Pending Dues
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {debtSummary.top_debtors.map((debtor, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-4 rounded-2xl bg-background/80 border-2 border-border/60 hover:border-orange-500/40 transition-all shadow-xs"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-orange-500/15 border border-orange-500/30 text-orange-600 dark:text-orange-400 font-black text-sm flex items-center justify-center shadow-xs shrink-0">
                        {debtor.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-extrabold text-sm text-foreground">{debtor.name}</p>
                        <p className="text-xs font-semibold text-muted-foreground">{debtor.bills_count} unpaid bills</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="font-mono font-black text-sm text-amber-500">{formatCurrency(debtor.total_debt)}</span>
                      <Button
                        size="sm"
                        className="h-9 px-3.5 font-bold text-xs bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl shadow-xs border-none"
                        onClick={() => handleClearDebt(debtor.id, debtor.name)}
                      >
                        <Check className="w-4 h-4 mr-1 stroke-[3]" />
                        Settle
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Supplier Dues Card */}
      {supplierDues && supplierDues.total_due > 0 && (
        <div className="rounded-[28px] bg-card/85 dark:bg-card/70 border-2 border-border/80 dark:border-border/60 p-6 sm:p-8 backdrop-blur-xl shadow-lg space-y-6">
          <div className="flex items-center justify-between border-b border-border/60 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-orange-500/10 border border-orange-500/30 text-orange-500 shadow-xs">
                <Truck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-foreground">Supplier Dues</h3>
                <p className="text-xs font-semibold text-muted-foreground">Pending supplier bills and payments</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 p-4 rounded-2xl bg-background/80 border-2 border-border/60">
            <div className="p-3">
              <p className="text-[10px] text-orange-500 font-extrabold uppercase tracking-wider">Total Outstanding</p>
              <p className="text-2xl font-black font-mono text-orange-500 mt-1">{formatCurrency(supplierDues.total_due)}</p>
            </div>
            <div className="p-3">
              <p className="text-[10px] text-rose-500 font-extrabold uppercase tracking-wider">Overdue Dues</p>
              <p className="text-2xl font-black font-mono text-rose-500 mt-1">{formatCurrency(supplierDues.overdue_due)}</p>
            </div>
            <div className="p-3">
              <p className="text-[10px] text-muted-foreground font-extrabold uppercase tracking-wider">Unpaid Bills</p>
              <p className="text-2xl font-black font-mono text-foreground mt-1">{supplierDues.unpaid_purchases_count}</p>
            </div>
            <div className="p-3">
              <p className="text-[10px] text-rose-500/80 font-extrabold uppercase tracking-wider">Overdue Count</p>
              <p className="text-2xl font-black font-mono text-rose-500 mt-1">{supplierDues.overdue_count}</p>
            </div>
          </div>

          {supplierDues.top_suppliers?.length > 0 && (
            <div className="space-y-3 pt-2">
              <h4 className="text-xs font-extrabold text-muted-foreground uppercase tracking-wider">
                Suppliers with Pending Bills
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {supplierDues.top_suppliers.map((supplier, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-4 rounded-2xl bg-background/80 border-2 border-border/60 hover:border-orange-500/40 transition-all shadow-xs"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-orange-500/15 border border-orange-500/30 text-orange-600 dark:text-orange-400 font-black text-sm flex items-center justify-center shadow-xs shrink-0">
                        <Truck className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="font-extrabold text-sm text-foreground">{supplier.name}</p>
                        <p className="text-xs font-semibold text-muted-foreground">{supplier.purchase_count} unpaid purchases</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="font-mono font-black text-sm text-orange-500">{formatCurrency(supplier.total_debt)}</span>
                      <div className="flex items-center gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-9 px-3 font-bold text-xs border-border/80 hover:bg-orange-500/10 hover:text-orange-500 rounded-xl"
                          onClick={() => handleSupplierPartialPayment(supplier.id, supplier.name)}
                        >
                          Pay Part
                        </Button>
                        <Button
                          size="sm"
                          className="h-9 px-3 font-bold text-xs bg-orange-500 hover:bg-orange-600 text-white rounded-xl shadow-xs border-none"
                          onClick={() => handleSupplierClearDues(supplier.id, supplier.name)}
                        >
                          Fully Settled
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Clear Customer Debt Dialog */}
      <AlertDialog
        open={clearDebtDialog.open}
        onOpenChange={(open) =>
          !open && setClearDebtDialog({ ...clearDebtDialog, open: false })
        }
      >
        <AlertDialogContent className="rounded-3xl border-2 border-border/80 shadow-2xl max-w-md bg-background/95 backdrop-blur-xl">
          <AlertDialogHeader className="space-y-2">
            <AlertDialogTitle className="font-black text-lg tracking-tight text-foreground flex items-center gap-2">
              <Receipt className="w-5 h-5 text-amber-500" />
              Settle Customer Account
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs leading-relaxed text-muted-foreground font-semibold">
              This action clears all pending dues for{" "}
              <span className="font-black text-foreground bg-muted px-1.5 py-0.5 rounded-md">
                {clearDebtDialog.customerName}
              </span>
              . The customer's balance will reset to zero.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4 gap-2">
            <AlertDialogCancel
              className="h-10 text-xs font-bold border-border/80 hover:bg-muted rounded-xl"
              disabled={clearingDebt}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-orange-500 hover:bg-orange-600 text-white h-10 text-xs font-bold shadow-md shadow-orange-500/25 rounded-xl border-none"
              onClick={(e) => {
                e.preventDefault();
                confirmClearDebt();
              }}
              disabled={clearingDebt}
            >
              {clearingDebt ? (
                <span className="flex items-center justify-center gap-1.5">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Processing...
                </span>
              ) : (
                <span>Yes, Settle Dues</span>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Supplier Partial Payment Dialog */}
      <Dialog
        open={supplierPartialPaymentDialog.open}
        onOpenChange={(open) =>
          !open &&
          setSupplierPartialPaymentDialog({
            ...supplierPartialPaymentDialog,
            open: false,
          })
        }
      >
        <DialogContent className="rounded-3xl border-2 border-border/80 shadow-2xl max-w-md p-6 bg-background/95 backdrop-blur-xl">
          <DialogHeader className="border-b border-border/60 pb-4">
            <DialogTitle className="font-black text-lg tracking-tight text-foreground flex items-center gap-2">
              <Truck className="w-5 h-5 text-orange-500" />
              Pay Part to Supplier
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-3">
            <div className="p-3 bg-muted/40 border border-border/60 rounded-2xl">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">
                Supplier Name
              </span>
              <p className="text-sm font-black text-foreground mt-0.5">
                {supplierPartialPaymentDialog.supplierName}
              </p>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-extrabold uppercase tracking-wider text-foreground">
                Amount Paid (₹)
              </Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={supplierPartialPaymentDialog.amount}
                onChange={(e) =>
                  setSupplierPartialPaymentDialog({
                    ...supplierPartialPaymentDialog,
                    amount: e.target.value,
                  })
                }
                className="h-11 text-sm font-bold border-border/90 focus-visible:ring-1 focus-visible:ring-orange-500 bg-background rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-extrabold uppercase tracking-wider text-foreground">
                Payment Notes / Ref ID
              </Label>
              <Input
                placeholder="Check #, UPI ID, bank reference..."
                value={supplierPartialPaymentDialog.notes}
                onChange={(e) =>
                  setSupplierPartialPaymentDialog({
                    ...supplierPartialPaymentDialog,
                    notes: e.target.value,
                  })
                }
                className="h-11 text-sm font-semibold border-border/90 focus-visible:ring-1 focus-visible:ring-orange-500 bg-background rounded-xl"
              />
            </div>
            <Button
              onClick={confirmSupplierPartialPayment}
              disabled={clearingDebt}
              className="w-full h-11 text-xs font-bold bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white shadow-lg shadow-orange-500/25 rounded-xl border-none mt-2"
            >
              {clearingDebt ? (
                <span className="flex items-center justify-center gap-1.5">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Processing...
                </span>
              ) : (
                <span>Confirm Payment</span>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Supplier Fully Paid Confirmation Dialog */}
      <AlertDialog
        open={supplierClearDuesDialog.open}
        onOpenChange={(open) =>
          !open &&
          setSupplierClearDuesDialog({
            ...supplierClearDuesDialog,
            open: false,
          })
        }
      >
        <AlertDialogContent className="rounded-3xl border-2 border-border/80 shadow-2xl max-w-md bg-background/95 backdrop-blur-xl">
          <AlertDialogHeader className="space-y-2">
            <AlertDialogTitle className="font-black text-lg tracking-tight text-foreground flex items-center gap-2">
              <Truck className="w-5 h-5 text-orange-500" />
              Settle Supplier Dues
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs leading-relaxed text-muted-foreground font-semibold">
              This action confirms full payment for all bills on{" "}
              <span className="font-black text-foreground bg-muted px-1.5 py-0.5 rounded-md">
                {supplierClearDuesDialog.supplierName}
              </span>
              . All pending bills will be marked as settled.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4 gap-2">
            <AlertDialogCancel
              className="h-10 text-xs font-bold border-border/80 hover:bg-muted rounded-xl"
              disabled={clearingDebt}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-orange-500 hover:bg-orange-600 text-white h-10 text-xs font-bold shadow-md shadow-orange-500/25 rounded-xl border-none"
              onClick={(e) => {
                e.preventDefault();
                confirmSupplierClearAllDues();
              }}
              disabled={clearingDebt}
            >
              {clearingDebt ? (
                <span className="flex items-center justify-center gap-1.5">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Processing...
                </span>
              ) : (
                <span>Yes, Settle Dues</span>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
