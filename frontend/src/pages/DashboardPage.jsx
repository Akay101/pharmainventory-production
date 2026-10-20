import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
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
  ShoppingCart,
  ScanLine,
  ArrowRight,
  Users,
  ChevronRight,
  Play,
  Pause,
  CheckCircle2,
  Boxes,
  FileText,
  BadgeAlert,
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
} from "recharts";
import { toast } from "sonner";
import Loader from "../components/Loader";

export default function DashboardPage() {
  const navigate = useNavigate();
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
  const [hoveredDayIndex, setHoveredDayIndex] = useState(null);

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

  // Sales calculations
  const peakSales = salesTrend.reduce((max, item) => (item.revenue > max ? item.revenue : max), 0);
  const totalPeriodSales = salesTrend.reduce((sum, item) => sum + (item.revenue || 0), 0);
  const avgDailySales = salesTrend.length ? Math.round(totalPeriodSales / salesTrend.length) : 0;
  const maxProductRevenue = topProducts.reduce((max, p) => (p.revenue > max ? p.revenue : max), 0) || 1;

  // Last 7 days slice for weekly micro-bars
  const last7Days = salesTrend.slice(-7);
  while (last7Days.length < 7) {
    last7Days.unshift({ date: `Day ${last7Days.length + 1}`, revenue: 0 });
  }
  const maxLast7 = last7Days.reduce((max, d) => (d.revenue > max ? d.revenue : max), 0) || 1;
  const dayLabels = ["S", "M", "T", "W", "T", "F", "S"];

  // Currently active/hovered bar details
  const activeIndex = hoveredDayIndex !== null ? hoveredDayIndex : 6;
  const activeDayData = last7Days[activeIndex] || { revenue: stats?.today?.revenue || 0 };

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

  const lowStockCount = alerts.low_stock_alerts?.length || 0;
  const expiryCount = alerts.expiry_alerts?.length || 0;
  const totalCustomerDebt = debtSummary?.total_debt || stats?.pending?.amount || 0;
  const totalSupplierDue = supplierDues?.total_due || 0;

  return (
    <div className="space-y-7 pb-16 select-none animate-in fade-in slide-in-from-bottom-2 duration-300 ease-out" data-testid="dashboard-page">
      
      {/* =========================================================================
          TOP HEADER GREETING & SIMPLE SUMMARY METRICS (Reference Match)
          ========================================================================= */}
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-6 pt-1">
        <div className="space-y-3">
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground font-sans">
            Welcome in, {user?.name || "Pharmacist"}
          </h1>

          {/* Simple, real status pills */}
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
            <div className="inline-flex items-center gap-2 bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 px-3.5 py-1.5 rounded-full shadow-xs font-bold">
              <span>Medicines in Stock</span>
              <span className="bg-white/20 dark:bg-black/10 px-1.5 py-0.5 rounded text-[10px]">
                {stats?.inventory?.total_items || 0}
              </span>
            </div>

            <div className="inline-flex items-center gap-1.5 bg-amber-500/15 text-amber-800 dark:text-amber-300 px-3 py-1.5 rounded-full border border-amber-500/30">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
              <span>Low Stock: {lowStockCount} items</span>
            </div>

            <div className="inline-flex items-center gap-1.5 bg-rose-500/10 text-rose-700 dark:text-rose-300 px-3 py-1.5 rounded-full border border-rose-500/20">
              <Clock className="w-3.5 h-3.5 text-rose-500" />
              <span>Expiring Soon: {expiryCount} batches</span>
            </div>

            <div className="inline-flex items-center gap-1.5 bg-black/[0.04] dark:bg-white/[0.05] text-foreground px-3 py-1.5 rounded-full border border-black/[0.06] dark:border-white/[0.08]">
              <Receipt className="w-3.5 h-3.5 text-orange-500" />
              <span>Customer Udhar: {formatCurrency(totalCustomerDebt)}</span>
            </div>
          </div>
        </div>

        {/* Right Stats Trio + Action Buttons */}
        <div className="flex flex-wrap items-center gap-6 sm:gap-8 xl:justify-end">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-orange-500/10 text-orange-600 flex items-center justify-center">
              <IndianRupee className="w-4 h-4" />
            </div>
            <div>
              <span className="text-2xl font-black font-mono tracking-tight text-foreground block leading-tight">
                {formatCurrency(stats?.today?.revenue)}
              </span>
              <span className="text-[11px] font-semibold text-muted-foreground">Today's Sales</span>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-amber-500/10 text-amber-600 flex items-center justify-center">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <span className="text-2xl font-black font-mono tracking-tight text-foreground block leading-tight">
                {formatCurrency(stats?.month?.revenue)}
              </span>
              <span className="text-[11px] font-semibold text-muted-foreground">This Month</span>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
              <Package className="w-4 h-4" />
            </div>
            <div>
              <span className="text-2xl font-black font-mono tracking-tight text-foreground block leading-tight">
                {formatCurrency(stats?.inventory?.stock_value)}
              </span>
              <span className="text-[11px] font-semibold text-muted-foreground">Stock Value</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 pt-1 sm:pt-0">
            <Button
              size="sm"
              onClick={() => navigate("/billing")}
              className="h-9 px-4 font-bold text-xs bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white rounded-full shadow-sm hover:scale-105 active:scale-95 transition-all"
            >
              <Receipt className="w-3.5 h-3.5 mr-1" />
              Quick Bill
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigate("/purchases")}
              className="h-9 px-3.5 font-bold text-xs rounded-full border-border/80 hover:bg-muted text-foreground hover:scale-105 active:scale-95 transition-all"
            >
              <ShoppingCart className="w-3.5 h-3.5 mr-1 text-orange-500" />
              Restock
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={fetchDashboardData}
              className="h-9 w-9 p-0 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-all group cursor-pointer"
              title="Refresh Data"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : "group-hover:rotate-180 transition-transform duration-500"}`} />
            </Button>
          </div>
        </div>
      </div>

      {/* =========================================================================
          MAIN BENTO GRID (UPPER DECK - 4 Tailored Cards Matching Reference)
          ========================================================================= */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-5 lg:gap-6">
        
        {/* Card 1: Pharmacy Store & Quick Menu List (Span 3) */}
        <div className="md:col-span-12 lg:col-span-3 rounded-[32px] bg-card border border-black/[0.06] dark:border-white/[0.08] p-6 flex flex-col justify-between shadow-sm hover:shadow-md transition-all duration-300 relative overflow-hidden">
          <div className="space-y-4">
            <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-amber-500/15 via-orange-500/10 to-orange-500/20 p-5 border border-orange-500/20">
              <div className="flex items-center gap-3">
                {pharmacy?.logo_url ? (
                  <img
                    src={pharmacy.logo_url}
                    alt={pharmacy.name}
                    className="w-12 h-12 rounded-xl object-cover border border-white/40 shadow-xs"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-orange-500 text-white font-black text-lg flex items-center justify-center shadow-xs">
                    {pharmacy?.name?.charAt(0) || "P"}
                  </div>
                )}
                <div>
                  <h3 className="font-extrabold text-sm text-foreground leading-tight">
                    {pharmacy?.name || "My Pharmacy"}
                  </h3>
                  <span className="text-[11px] font-bold text-orange-600 dark:text-orange-400 flex items-center gap-1 mt-0.5">
                    <Sparkles className="w-3 h-3 text-orange-500" />
                    {user?.role === "ADMIN" ? "Store Admin" : "Pharmacist"}
                  </span>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-orange-500/20 flex items-center justify-between">
                <span className="text-[10px] uppercase font-extrabold text-muted-foreground">Today's Sales</span>
                <span className="text-xs font-black font-mono text-orange-600 dark:text-orange-400 bg-white/60 dark:bg-black/40 px-2.5 py-0.5 rounded-full">
                  {formatCurrency(stats?.today?.revenue)}
                </span>
              </div>
            </div>

            {/* Quick Links List */}
            <div className="space-y-1.5 pt-1">
              <div
                onClick={() => navigate("/inventory")}
                className="flex items-center justify-between p-2.5 rounded-xl hover:bg-black/[0.03] dark:hover:bg-white/[0.04] cursor-pointer text-xs font-semibold text-foreground transition-colors group"
              >
                <span className="flex items-center gap-2">
                  <Package className="w-3.5 h-3.5 text-muted-foreground group-hover:text-orange-500 transition-colors" />
                  Medicine Inventory
                </span>
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
              </div>

              <div
                onClick={() => navigate("/suppliers")}
                className="flex items-center justify-between p-2.5 rounded-xl hover:bg-black/[0.03] dark:hover:bg-white/[0.04] cursor-pointer text-xs font-semibold text-foreground transition-colors group"
              >
                <span className="flex items-center gap-2">
                  <Truck className="w-3.5 h-3.5 text-muted-foreground group-hover:text-orange-500 transition-colors" />
                  Supplier Dues
                </span>
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
              </div>

              <div
                onClick={() => navigate("/customers")}
                className="flex items-center justify-between p-2.5 rounded-xl hover:bg-black/[0.03] dark:hover:bg-white/[0.04] cursor-pointer text-xs font-semibold text-foreground transition-colors group"
              >
                <span className="flex items-center gap-2">
                  <Users className="w-3.5 h-3.5 text-muted-foreground group-hover:text-orange-500 transition-colors" />
                  Customer Khata (Udhar)
                </span>
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
              </div>
            </div>
          </div>
        </div>

        {/* Card 2: Weekly Sales with Interactive Hover Values (Span 3 - Matches Reference Progress Card) */}
        <div className="md:col-span-6 lg:col-span-3 rounded-[32px] bg-card border border-black/[0.06] dark:border-white/[0.08] p-6 flex flex-col justify-between shadow-sm hover:shadow-md transition-all duration-300">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
              Weekly Sales
            </span>
            <button
              onClick={() => navigate("/billing")}
              className="w-8 h-8 rounded-full border border-black/10 dark:border-white/15 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
              title="Open Billing"
            >
              <ArrowUpRight className="w-4 h-4" />
            </button>
          </div>

          <div className="py-2">
            <h3 className="text-3xl font-black font-mono tracking-tight text-foreground">
              {formatCurrency(stats?.today?.revenue)}
            </h3>
            <p className="text-[11px] font-semibold text-muted-foreground mt-0.5">
              Today's sales total
            </p>
          </div>

          {/* Reference Vertical Micro-Bars with Dynamic Floating Tooltip Badge on Hover */}
          <div className="pt-3 border-t border-border/40 relative">
            {/* Floating Value Pill matching Reference */}
            <div className="h-6 mb-1 flex items-center justify-center">
              <span className="inline-flex items-center gap-1 bg-amber-400/20 text-amber-800 dark:text-amber-300 border border-amber-400/40 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full shadow-xs animate-in fade-in-0 duration-150">
                <span>{dayLabels[activeIndex]}:</span>
                <span className="font-mono font-black">{formatCurrency(activeDayData.revenue)}</span>
              </span>
            </div>

            <div className="flex items-end justify-between h-20 px-2 gap-2">
              {dayLabels.map((d, i) => {
                const dayData = last7Days[i];
                const rev = dayData?.revenue || 0;
                const barHeight = Math.max(15, Math.min(100, Math.round((rev / maxLast7) * 100)));
                const isHovered = hoveredDayIndex === i;
                const isToday = i === 6;

                return (
                  <div
                    key={i}
                    onMouseEnter={() => setHoveredDayIndex(i)}
                    onMouseLeave={() => setHoveredDayIndex(null)}
                    className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end cursor-pointer group"
                  >
                    <div className="relative w-full flex items-end justify-center h-14">
                      {/* Vertical dotted background track like reference */}
                      <div className="absolute inset-y-0 w-0.5 border-l border-dotted border-muted-foreground/20" />
                      <div
                        className={`w-2.5 rounded-full transition-all duration-300 relative z-10 ${
                          isHovered || (hoveredDayIndex === null && isToday)
                            ? "bg-amber-500 scale-y-105 shadow-sm shadow-amber-500/40 ring-2 ring-amber-400/30"
                            : "bg-muted-foreground/30 group-hover:bg-muted-foreground/50"
                        }`}
                        style={{ height: `${barHeight}%` }}
                      />
                    </div>
                    <span className={`text-[10px] font-bold transition-colors ${
                      isHovered || (hoveredDayIndex === null && isToday)
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-muted-foreground"
                    }`}>
                      {d}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Card 3: Profit Tracker Dial (Exact Replication of Reference Time Tracker) */}
        <div className="md:col-span-6 lg:col-span-3 rounded-[32px] bg-card border border-black/[0.06] dark:border-white/[0.08] p-6 flex flex-col justify-between shadow-sm hover:shadow-md transition-all duration-300">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
              Profit Tracker
            </span>
            <button
              onClick={() => navigate("/reports")}
              className="w-8 h-8 rounded-full border border-black/10 dark:border-white/15 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
              title="Reports & Profit"
            >
              <ArrowUpRight className="w-4 h-4" />
            </button>
          </div>

          {/* Precision Circular Dial like Reference Time Tracker */}
          <div className="py-2 flex flex-col items-center justify-center">
            <div className="relative w-32 h-32 flex items-center justify-center">
              {/* SVG Ring with Tick Marks and Yellow Progress Arc */}
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 120 120">
                {/* Background Dash Circle */}
                <circle
                  cx="60"
                  cy="60"
                  r="48"
                  fill="none"
                  stroke="currentColor"
                  className="text-muted/40"
                  strokeWidth="2.5"
                  strokeDasharray="2 4"
                />
                {/* Sweeping Bold Progress Arc */}
                <circle
                  cx="60"
                  cy="60"
                  r="48"
                  fill="none"
                  stroke="#fbbf24"
                  strokeWidth="7"
                  strokeDasharray="301.6"
                  strokeDashoffset="100"
                  strokeLinecap="round"
                  className="drop-shadow-sm"
                />
              </svg>

              {/* Central Text Readout */}
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-xl font-black font-mono tracking-tight text-foreground leading-tight">
                  {formatCurrency(stats?.today?.profit)}
                </span>
                <span className="text-[10px] font-extrabold uppercase text-muted-foreground mt-0.5">
                  Today Profit
                </span>
              </div>
            </div>
          </div>

          {/* Bottom Controls like Reference (Play, Pause, Clock) */}
          <div className="pt-3 border-t border-border/40 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => navigate("/billing")}
                className="h-7 px-3 rounded-full border border-black/10 dark:border-white/15 bg-black/[0.03] dark:bg-white/[0.04] text-[11px] font-bold hover:bg-muted transition-colors flex items-center gap-1 cursor-pointer"
                title="Create New Bill"
              >
                <Play className="w-2.5 h-2.5 fill-current" />
                <span>Bill</span>
              </button>
              <button
                onClick={() => navigate("/customers")}
                className="h-7 px-3 rounded-full border border-black/10 dark:border-white/15 bg-black/[0.03] dark:bg-white/[0.04] text-[11px] font-bold hover:bg-muted transition-colors flex items-center gap-1 cursor-pointer"
                title="View Customer Khata"
              >
                <Pause className="w-2.5 h-2.5 fill-current" />
                <span>Khata</span>
              </button>
            </div>

            <div
              onClick={() => navigate("/reports")}
              className="w-7 h-7 rounded-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 flex items-center justify-center cursor-pointer shadow-xs hover:scale-105 transition-transform"
              title="30-Day Total"
            >
              <Clock className="w-3.5 h-3.5" />
            </div>
          </div>
        </div>

        {/* Card 4: Dark Obsidian Urgent Tasks Card (Exact Match to Reference Onboarding Tasks) */}
        <div className="md:col-span-12 lg:col-span-3 rounded-[32px] bg-zinc-900 text-white dark:bg-zinc-950 p-6 flex flex-col justify-between shadow-xl border border-white/10 relative overflow-hidden">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase tracking-wider text-zinc-400">
                Pending Tasks
              </span>
              <span className="text-xs font-black font-mono bg-white/10 px-2.5 py-0.5 rounded-full border border-white/15">
                {lowStockCount + expiryCount} Items
              </span>
            </div>

            {/* Micro checklist items matching Reference Onboarding Task card */}
            <div className="space-y-2 pt-1">
              {alerts.low_stock_alerts?.length > 0 ? (
                <div
                  onClick={() => navigate("/purchases", { state: { openNew: true, prefillName: alerts.low_stock_alerts[0]?.product_name } })}
                  className="p-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 cursor-pointer transition-colors flex items-center justify-between group"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                      <AlertTriangle className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white truncate max-w-[130px]">
                        {alerts.low_stock_alerts[0]?.product_name}
                      </p>
                      <span className="text-[10px] text-zinc-400 font-semibold">Low Stock</span>
                    </div>
                  </div>
                  <div className="w-4 h-4 rounded-full bg-amber-500/30 border border-amber-400 flex items-center justify-center shrink-0">
                    <Check className="w-2.5 h-2.5 text-amber-300 stroke-[3]" />
                  </div>
                </div>
              ) : (
                <div className="p-3 rounded-2xl bg-white/5 border border-white/10 flex items-center gap-2 text-xs font-semibold text-emerald-400">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>Inventory stocks good</span>
                </div>
              )}

              {alerts.expiry_alerts?.length > 0 && (
                <div
                  onClick={() => navigate("/expiry")}
                  className="p-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 cursor-pointer transition-colors flex items-center justify-between group"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-6 h-6 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center shrink-0">
                      <Clock className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white truncate max-w-[130px]">
                        {alerts.expiry_alerts[0]?.product_name}
                      </p>
                      <span className="text-[10px] text-zinc-400 font-semibold">Expires soon</span>
                    </div>
                  </div>
                  <div className="w-4 h-4 rounded-full border border-zinc-500 flex items-center justify-center shrink-0" />
                </div>
              )}

              {totalCustomerDebt > 0 && (
                <div
                  onClick={() => navigate("/customers")}
                  className="p-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 cursor-pointer transition-colors flex items-center justify-between group"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                      <Receipt className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white truncate max-w-[130px]">
                        Customer Udhar
                      </p>
                      <span className="text-[10px] text-zinc-400 font-semibold">{formatCurrency(totalCustomerDebt)}</span>
                    </div>
                  </div>
                  <div className="w-4 h-4 rounded-full border border-zinc-500 flex items-center justify-center shrink-0" />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
          LOWER BENTO DECK (30-DAY SALES TREND & TOP SELLING MEDICINES)
          ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-6">
        
        {/* Sales Trend (30 Days) AreaChart (Span 7) */}
        <div className="lg:col-span-7 rounded-[32px] bg-card border border-black/[0.06] dark:border-white/[0.08] p-6 sm:p-7 shadow-sm space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-border/40 pb-4 gap-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-600 dark:text-orange-400">
                <TrendingUp className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-foreground">30-Day Sales Trend</h3>
                <p className="text-[11px] font-semibold text-muted-foreground">Daily store billing performance history</p>
              </div>
            </div>

            <div className="flex items-center gap-2 font-mono text-xs">
              <div className="px-2.5 py-1 rounded-lg bg-orange-500/10 border border-orange-500/20 text-right">
                <span className="text-[9px] uppercase font-bold text-muted-foreground block leading-tight">Highest Day</span>
                <span className="text-xs font-black text-orange-600 dark:text-orange-400">{formatCurrency(peakSales)}</span>
              </div>
              <div className="px-2.5 py-1 rounded-lg bg-muted/60 border border-border/60 text-right">
                <span className="text-[9px] uppercase font-bold text-muted-foreground block leading-tight">Daily Average</span>
                <span className="text-xs font-black text-foreground">{formatCurrency(avgDailySales)}</span>
              </div>
            </div>
          </div>

          <div className="h-64 w-full pt-1">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={salesTrend}>
                <defs>
                  <linearGradient id="colorSalesGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f97316" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#f97316" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(249,115,22,0.08)" vertical={false} />
                <XAxis
                  dataKey="date"
                  stroke="hsl(var(--muted-foreground))"
                  tick={{ fontSize: 10, fontWeight: "600" }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(val) => val ? val.slice(5) : ""}
                />
                <YAxis
                  stroke="hsl(var(--muted-foreground))"
                  tick={{ fontSize: 10, fontWeight: "600" }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(val) => `₹${val / 1000}k`}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="bg-card border border-orange-500/40 rounded-xl p-3 shadow-xl backdrop-blur-md space-y-0.5">
                          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                            {label}
                          </p>
                          <p className="text-sm font-black font-mono text-orange-600 dark:text-orange-400">
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
                  strokeWidth={3}
                  fillOpacity={1}
                  fill="url(#colorSalesGradient)"
                  activeDot={{
                    r: 5,
                    stroke: "#ffffff",
                    strokeWidth: 2,
                    fill: "#f97316",
                  }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Selling Products Leaderboard (Span 5) */}
        <div className="lg:col-span-5 rounded-[32px] bg-card border border-black/[0.06] dark:border-white/[0.08] p-6 sm:p-7 shadow-sm space-y-4 flex flex-col justify-between">
          <div className="flex items-center justify-between border-b border-border/40 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400">
                <Layers className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-foreground">Top Selling Medicines</h3>
                <p className="text-[11px] font-semibold text-muted-foreground">Ranked by revenue sales</p>
              </div>
            </div>
          </div>

          <div className="space-y-3 flex-1 flex flex-col justify-around">
            {topProducts.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground font-semibold">
                No billing recorded yet
              </div>
            ) : (
              topProducts.map((p, idx) => {
                const percent = Math.round((p.revenue / maxProductRevenue) * 100);
                return (
                  <div key={idx} className="space-y-1.5 group">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-black shrink-0 ${
                          idx === 0
                            ? "bg-amber-500 text-white shadow-xs"
                            : idx === 1
                            ? "bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900"
                            : "bg-muted text-muted-foreground"
                        }`}>
                          #{idx + 1}
                        </span>
                        <span className="font-bold text-foreground truncate max-w-[180px] sm:max-w-[220px]">
                          {p.product_name}
                        </span>
                      </div>
                      <span className="font-mono font-black text-xs text-foreground shrink-0">
                        {formatCurrency(p.revenue)}
                      </span>
                    </div>

                    <div className="h-1.5 w-full bg-muted/60 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-orange-500 to-amber-500 rounded-full transition-all duration-500"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* =========================================================================
          WORKING CAPITAL BENTO (CUSTOMER KHATA & SUPPLIER DUES)
          ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-6">
        
        {/* Customer Khata (Udhar) Bento (Span 6) */}
        {debtSummary && (
          <div className="lg:col-span-6 rounded-[32px] bg-card border border-black/[0.06] dark:border-white/[0.08] p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-border/40 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400">
                  <Receipt className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-foreground">Customer Khata (Udhar)</h3>
                  <p className="text-[11px] font-semibold text-muted-foreground">Outstanding customer credit accounts</p>
                </div>
              </div>

              <span
                onClick={() => navigate("/customers")}
                className="text-[11px] font-bold text-amber-600 dark:text-amber-400 hover:underline cursor-pointer flex items-center gap-1"
              >
                All Customers <ArrowRight className="w-3 h-3" />
              </span>
            </div>

            {/* Metrics Row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 rounded-2xl bg-muted/30 border border-border/50">
              <div>
                <span className="text-[10px] text-amber-600 dark:text-amber-400 font-extrabold uppercase">Total Udhar</span>
                <p className="text-base font-black font-mono text-foreground mt-0.5">{formatCurrency(debtSummary.total_debt)}</p>
              </div>
              <div>
                <span className="text-[10px] text-rose-500 font-extrabold uppercase">Overdue</span>
                <p className="text-base font-black font-mono text-rose-500 mt-0.5">{formatCurrency(debtSummary.overdue_amount)}</p>
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground font-extrabold uppercase">Unpaid Bills</span>
                <p className="text-base font-black font-mono text-foreground mt-0.5">{debtSummary.total_unpaid_bills || 0}</p>
              </div>
              <div>
                <span className="text-[10px] text-rose-500 font-extrabold uppercase">Overdue Count</span>
                <p className="text-base font-black font-mono text-rose-500 mt-0.5">{debtSummary.overdue_count || 0}</p>
              </div>
            </div>

            {/* Debtors List */}
            {debtSummary.top_debtors?.length > 0 ? (
              <div className="space-y-2 pt-1">
                {debtSummary.top_debtors.slice(0, 3).map((debtor, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-3 rounded-2xl bg-muted/20 border border-border/50 hover:border-amber-500/30 transition-all"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 font-black text-xs flex items-center justify-center shrink-0">
                        {debtor.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-bold text-xs text-foreground">{debtor.name}</p>
                        <p className="text-[10px] font-semibold text-muted-foreground">{debtor.bills_count} unpaid bills</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <span className="font-mono font-black text-xs text-amber-600 dark:text-amber-400">
                        {formatCurrency(debtor.total_debt)}
                      </span>
                      <Button
                        size="sm"
                        className="h-7 px-3 font-bold text-[11px] bg-emerald-500 hover:bg-emerald-600 text-white rounded-full border-none"
                        onClick={() => handleClearDebt(debtor.id, debtor.name)}
                      >
                        <Check className="w-3 h-3 mr-1" />
                        Settle
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-4 text-center text-xs text-muted-foreground font-semibold">
                No customer balances outstanding
              </div>
            )}
          </div>
        )}

        {/* Supplier Dues Bento (Span 6) */}
        {supplierDues && (
          <div className="lg:col-span-6 rounded-[32px] bg-card border border-black/[0.06] dark:border-white/[0.08] p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-border/40 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-600 dark:text-orange-400">
                  <Truck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-foreground">Supplier Payments</h3>
                  <p className="text-[11px] font-semibold text-muted-foreground">Distributor bills and pending payments</p>
                </div>
              </div>

              <span
                onClick={() => navigate("/suppliers")}
                className="text-[11px] font-bold text-orange-600 dark:text-orange-400 hover:underline cursor-pointer flex items-center gap-1"
              >
                All Suppliers <ArrowRight className="w-3 h-3" />
              </span>
            </div>

            {/* Metrics Row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 rounded-2xl bg-muted/30 border border-border/50">
              <div>
                <span className="text-[10px] text-orange-600 dark:text-orange-400 font-extrabold uppercase">Total Due</span>
                <p className="text-base font-black font-mono text-foreground mt-0.5">{formatCurrency(supplierDues.total_due)}</p>
              </div>
              <div>
                <span className="text-[10px] text-rose-500 font-extrabold uppercase">Overdue</span>
                <p className="text-base font-black font-mono text-rose-500 mt-0.5">{formatCurrency(supplierDues.overdue_due)}</p>
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground font-extrabold uppercase">Unpaid Bills</span>
                <p className="text-base font-black font-mono text-foreground mt-0.5">{supplierDues.unpaid_purchases_count || 0}</p>
              </div>
              <div>
                <span className="text-[10px] text-rose-500 font-extrabold uppercase">Overdue Count</span>
                <p className="text-base font-black font-mono text-rose-500 mt-0.5">{supplierDues.overdue_count || 0}</p>
              </div>
            </div>

            {/* Suppliers List */}
            {supplierDues.top_suppliers?.length > 0 ? (
              <div className="space-y-2 pt-1">
                {supplierDues.top_suppliers.slice(0, 3).map((supplier, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-3 rounded-2xl bg-muted/20 border border-border/50 hover:border-orange-500/30 transition-all"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-orange-500/15 text-orange-600 dark:text-orange-400 font-black text-xs flex items-center justify-center shrink-0">
                        <Truck className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <p className="font-bold text-xs text-foreground">{supplier.name}</p>
                        <p className="text-[10px] font-semibold text-muted-foreground">{supplier.purchase_count} unpaid purchases</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="font-mono font-black text-xs text-orange-600 dark:text-orange-400">
                        {formatCurrency(supplier.total_debt)}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2.5 font-bold text-[11px] rounded-full border-border/80 hover:bg-orange-500/10 hover:text-orange-600"
                        onClick={() => handleSupplierPartialPayment(supplier.id, supplier.name)}
                      >
                        Pay Part
                      </Button>
                      <Button
                        size="sm"
                        className="h-7 px-2.5 font-bold text-[11px] bg-orange-500 hover:bg-orange-600 text-white rounded-full border-none"
                        onClick={() => handleSupplierClearDues(supplier.id, supplier.name)}
                      >
                        Settle
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-4 text-center text-xs text-muted-foreground font-semibold">
                No distributor payables outstanding
              </div>
            )}
          </div>
        )}
      </div>

      {/* =========================================================================
          BOTTOM DIALOGS (CUSTOMER DEBT, SUPPLIER PAYMENTS)
          ========================================================================= */}

      {/* Clear Customer Debt Dialog */}
      <AlertDialog
        open={clearDebtDialog.open}
        onOpenChange={(open) =>
          !open && setClearDebtDialog({ ...clearDebtDialog, open: false })
        }
      >
        <AlertDialogContent className="rounded-3xl border border-border/80 shadow-2xl max-w-md bg-background/95 backdrop-blur-xl">
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
          <AlertDialogFooter className="mt-4 gap-2 flex-wrap sm:justify-end">
            <AlertDialogCancel
              className="h-10 text-xs font-bold border-border/80 hover:bg-muted rounded-full"
              disabled={clearingDebt}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-orange-500 hover:bg-orange-600 text-white h-10 text-xs font-bold shadow-md shadow-orange-500/25 rounded-full border-none"
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
              className="w-full h-11 text-xs font-bold bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white shadow-lg shadow-orange-500/25 rounded-full border-none mt-2"
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
          <AlertDialogFooter className="mt-4 gap-2 flex-wrap sm:justify-end">
            <AlertDialogCancel
              className="h-10 text-xs font-bold border-border/80 hover:bg-muted rounded-full"
              disabled={clearingDebt}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-orange-500 hover:bg-orange-600 text-white h-10 text-xs font-bold shadow-md shadow-orange-500/25 rounded-full border-none"
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
