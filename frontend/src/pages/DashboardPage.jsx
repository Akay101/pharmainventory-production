import { useState, useEffect } from "react";
import axios from "axios";
import { API, useAuth, getCookie } from "../App";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Button } from "../components/ui/button";
import {
  IndianRupee,
  TrendingUp,
  TrendingDown,
  Package,
  Receipt,
  AlertTriangle,
  Clock,
  Sparkles,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  Check,
  Truck,
  Calendar,
  Layers,
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
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";
import { toast } from "sonner";
import PlanBadge from "../components/PlanBadge";

axios.interceptors.request.use(
  (config) => {
    const token = getCookie("pharmalogy_token");

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

const StatCard = ({
  title,
  value,
  icon: Icon,
  trend,
  trendValue,
  color = "primary",
}) => {
  const colorClasses = {
    primary: "text-primary shadow-primary/5",
    accent: "text-accent shadow-accent/5",
    destructive: "text-destructive shadow-destructive/5",
    yellow: "text-amber-500 shadow-amber-500/5",
  };

  const bgClasses = {
    primary: "bg-primary/10 border-primary/20",
    accent: "bg-accent/10 border-accent/20",
    destructive: "bg-destructive/10 border-destructive/20",
    yellow: "bg-amber-500/10 border-amber-500/20",
  };

  return (
    <Card className="group hover:border-primary/30 dark:hover:border-primary/20 transition-colors duration-300 relative overflow-hidden bg-card/90 border-border/40 shadow-sm hover:shadow-md rounded-xl">
      <div className="absolute top-0 left-0 w-full h-[1.5px] bg-gradient-to-r from-transparent via-primary/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      <CardContent className="p-5 flex items-start justify-between">
        <div className="space-y-1.5 min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">
            {title}
          </p>
          <p className="text-2xl font-black font-mono tracking-tight text-foreground truncate">
            {value}
          </p>
          {trend !== undefined && (
            <div className="flex items-center gap-1.5 pt-1">
              <span
                className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                  trend >= 0
                    ? "bg-primary/10 text-primary"
                    : "bg-destructive/10 text-destructive"
                }`}
              >
                {trend >= 0 ? (
                  <ArrowUpRight className="w-3 h-3" />
                ) : (
                  <ArrowDownRight className="w-3 h-3" />
                )}
                {Math.abs(trendValue || trend)}%
              </span>
              <span className="text-[10px] font-bold text-muted-foreground/60">
                vs last month
              </span>
            </div>
          )}
        </div>
        <div
          className={`p-3 rounded-2xl border transition-all duration-300 shadow-sm group-hover:scale-105 shrink-0 ${bgClasses[color]}`}
        >
          <Icon className={`w-5 h-5 ${colorClasses[color]}`} />
        </div>
      </CardContent>
    </Card>
  );
};

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
      setSalesTrend(trendRes.data.trend);
      setTopProducts(productsRes.data.top_products);
      setAlerts(alertsRes.data);
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
      toast.error("Failed to load AI tips");
    } finally {
      setTipsLoading(false);
    }
  };

  const formatCurrency = (value) => `₹${(value || 0).toLocaleString("en-IN")}`;

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
      toast.success("Partial payment registered successfully");
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
      toast.success("All supplier dues cleared successfully");
      fetchDashboardData();
      setSupplierClearDuesDialog({ ...supplierClearDuesDialog, open: false });
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to clear dues");
    } finally {
      setClearingDebt(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-4">
          <div className="relative w-12 h-12 mx-auto">
            <div className="absolute inset-0 rounded-full border-4 border-primary/20"></div>
            <div className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin"></div>
          </div>
          <p className="text-xs font-bold text-muted-foreground/80 uppercase tracking-widest animate-pulse">
            Loading Workspace Stats...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in" data-testid="dashboard-page">
      {/* Header Panel */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/40 pb-5">
        <div className="space-y-1">
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground">
            Dashboard
          </h1>
          <p className="text-xs font-medium text-muted-foreground">
            Welcome back! Here's what's happening at{" "}
            <span className="text-primary font-bold">{pharmacy?.name}</span>
          </p>
        </div>
        <Button
          variant="outline"
          onClick={fetchDashboardData}
          data-testid="refresh-dashboard-btn"
          className="h-10 border-border hover:bg-muted font-bold text-xs uppercase tracking-wide px-4 rounded-xl shrink-0 self-start sm:self-center"
        >
          <RefreshCw className="w-3.5 h-3.5 mr-2 text-primary" />
          Refresh Stats
        </Button>
      </div>

      {/* Main Stats Grid */}
      <div className="dashboard-grid">
        <StatCard
          title="Today's Revenue"
          value={formatCurrency(stats?.today?.revenue)}
          icon={IndianRupee}
          color="primary"
        />
        <StatCard
          title="Today's Profit"
          value={formatCurrency(stats?.today?.profit)}
          icon={TrendingUp}
          color="primary"
        />
        <StatCard
          title="Monthly Revenue"
          value={formatCurrency(stats?.month?.revenue)}
          icon={IndianRupee}
          color="accent"
        />
        <StatCard
          title="Stock Value"
          value={formatCurrency(stats?.inventory?.stock_value)}
          icon={Package}
          color="accent"
        />
      </div>

      {/* Secondary Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          title="Pending Payments"
          value={formatCurrency(stats?.pending?.amount)}
          icon={Clock}
          color="yellow"
        />
        <StatCard
          title="Low Stock Items"
          value={alerts.low_stock_alerts?.length || 0}
          icon={AlertTriangle}
          color={
            alerts.low_stock_alerts?.length > 0 ? "destructive" : "primary"
          }
        />
        <StatCard
          title="Expiring Soon"
          value={alerts.expiry_alerts?.length || 0}
          icon={AlertTriangle}
          color={alerts.expiry_alerts?.length > 0 ? "destructive" : "primary"}
        />
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sales Trend Chart */}
        <Card className="bg-card/90 border-border/40 shadow-sm rounded-xl overflow-hidden">
          <CardHeader className="border-b border-border/40 py-4">
            <CardTitle className="text-sm font-bold tracking-tight text-foreground flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              Sales Trend (30 Days)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={salesTrend}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="rgba(255,255,255,0.03)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="date"
                    stroke="hsl(var(--muted-foreground))"
                    tick={{ fontSize: 10, fontWeight: "bold" }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => value.slice(5)}
                  />
                  <YAxis
                    stroke="hsl(var(--muted-foreground))"
                    tick={{ fontSize: 10, fontWeight: "bold" }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => `₹${value / 1000}k`}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="bg-card/95 border border-border/50 rounded-xl p-3 shadow-xl">
                            <p className="text-[9px] font-bold text-muted-foreground/80 mb-1">
                              {label}
                            </p>
                            <p className="text-xs font-black font-mono text-primary">
                              ₹{payload[0].value.toLocaleString("en-IN")}
                            </p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="revenue"
                    stroke="hsl(var(--primary))"
                    strokeWidth={3}
                    dot={false}
                    isAnimationActive={false}
                    activeDot={{
                      r: 5,
                      strokeWidth: 0,
                      fill: "hsl(var(--primary))",
                    }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Top Selling Products Chart */}
        <Card className="bg-card/90 border-border/40 shadow-sm rounded-xl overflow-hidden">
          <CardHeader className="border-b border-border/40 py-4 flex flex-row items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="text-sm font-bold tracking-tight text-foreground flex items-center gap-2">
                <Layers className="w-4 h-4 text-accent" />
                Top Selling Products
              </CardTitle>
            </div>
            {/* {user?.subscription_plan && (
              <PlanBadge plan={user.subscription_plan} />
            )} */}
          </CardHeader>
          <CardContent className="p-6">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topProducts} layout="vertical" barSize={12}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="rgba(255,255,255,0.03)"
                    horizontal={false}
                  />
                  <XAxis
                    type="number"
                    stroke="hsl(var(--muted-foreground))"
                    tick={{ fontSize: 10, fontWeight: "bold" }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => `₹${value / 1000}k`}
                  />
                  <YAxis
                    dataKey="product_name"
                    type="category"
                    stroke="hsl(var(--muted-foreground))"
                    tick={{ fontSize: 9, fontWeight: "bold" }}
                    width={100}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) =>
                      value && value.length > 15
                        ? `${value.slice(0, 13)}...`
                        : value || ""
                    }
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="bg-card/95 border border-border/50 rounded-xl p-3 shadow-xl">
                            <p className="text-[9px] font-bold text-muted-foreground/80 mb-0.5 truncate max-w-[150px]">
                              {payload[0].payload.product_name}
                            </p>
                            <p className="text-xs font-black font-mono text-accent">
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
                    fill="hsl(var(--accent))"
                    radius={[0, 4, 4, 0]}
                    isAnimationActive={false}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Alerts and AI Insights Panel Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Inventory Alerts Card */}
        <Card className="bg-card/90 border-border/40 shadow-sm rounded-xl overflow-hidden">
          <CardHeader className="border-b border-border/40 py-4">
            <CardTitle className="text-sm font-bold tracking-tight text-foreground flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-primary" />
              Inventory Alerts
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            {/* Low Stock Alerts */}
            {alerts.low_stock_alerts?.length > 0 && (
              <div className="p-4 rounded-xl border border-yellow-500/30 bg-yellow-500/[0.04] space-y-2">
                <h4 className="font-bold text-yellow-500 text-xs uppercase tracking-wider flex items-center gap-2">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Low Stock ({alerts.low_stock_alerts.length})
                </h4>
                <ul className="space-y-1.5 text-xs">
                  {alerts.low_stock_alerts.slice(0, 5).map((item, i) => (
                    <li
                      key={i}
                      className="flex justify-between items-center py-0.5 border-b border-yellow-500/10 last:border-0"
                    >
                      <span className="font-medium text-foreground">
                        {item.product_name}
                      </span>
                      <span className="font-mono font-bold text-yellow-500 bg-yellow-500/10 px-1.5 py-0.5 rounded text-[10px]">
                        {item.quantity} units left
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Expiry Alerts */}
            {alerts.expiry_alerts?.length > 0 && (
              <div className="p-4 rounded-xl border border-destructive/30 bg-destructive/[0.04] space-y-2">
                <h4 className="font-bold text-destructive text-xs uppercase tracking-wider flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5" />
                  Expiring Soon ({alerts.expiry_alerts.length})
                </h4>
                <ul className="space-y-1.5 text-xs">
                  {alerts.expiry_alerts.slice(0, 5).map((item, i) => (
                    <li
                      key={i}
                      className="flex justify-between items-center py-0.5 border-b border-destructive/10 last:border-0"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-foreground">
                          {item.product_name}
                        </span>
                        <span className="font-mono text-[9px] text-muted-foreground/70 uppercase">
                          ({item.batch_no})
                        </span>
                      </div>
                      <span className="font-mono font-bold text-destructive flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {item.expiry_date}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {alerts.low_stock_alerts?.length === 0 &&
              alerts.expiry_alerts?.length === 0 && (
                <div className="p-4 rounded-xl border border-primary/20 bg-primary/[0.04]">
                  <p className="text-primary text-xs font-bold flex items-center gap-2">
                    <Check className="w-4 h-4 text-primary" />
                    All stock thresholds healthy. No alerts active.
                  </p>
                </div>
              )}
          </CardContent>
        </Card>

        {/* AI Business Insights Card */}
        <Card className="bg-card/90 border-border/40 shadow-sm rounded-xl overflow-hidden">
          <CardHeader className="border-b border-border/40 py-4 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-bold tracking-tight text-foreground flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-accent" />
              AI Business Insights
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchAiTips}
              disabled={tipsLoading}
              data-testid="get-ai-tips-btn"
              className="h-8 border border-border/40 hover:bg-muted font-bold text-[10px] uppercase px-3 rounded-lg text-muted-foreground hover:text-foreground"
            >
              {tipsLoading ? (
                <RefreshCw className="w-3 h-3 animate-spin text-accent" />
              ) : (
                "Get Analysis"
              )}
            </Button>
          </CardHeader>
          <CardContent className="p-6">
            {aiTips ? (
              <div className="prose prose-invert prose-xs max-w-none">
                <div className="whitespace-pre-wrap text-muted-foreground text-xs leading-relaxed font-medium bg-muted/20 p-4 border border-border/30 rounded-xl">
                  {aiTips.tips}
                </div>
                <p className="text-[9px] text-muted-foreground/45 mt-3 font-semibold text-right">
                  Generated: {new Date(aiTips.generated_at).toLocaleString()}
                </p>
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-3 shadow shadow-accent/5">
                  <Sparkles className="w-5 h-5 text-accent animate-pulse" />
                </div>
                <p className="text-xs font-bold text-foreground">
                  Awaiting Input Data
                </p>
                <p className="text-[10px] text-muted-foreground/60 max-w-[240px] mx-auto mt-1 leading-relaxed">
                  Trigger analysis to generate custom reports and stock
                  optimizations.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Debt summary Ledger Card */}
      {debtSummary && debtSummary.total_debt > 0 && (
        <Card className="bg-card/90 border-border/40 shadow-sm rounded-xl overflow-hidden">
          <CardHeader className="border-b border-border/40 py-4 bg-muted/20">
            <CardTitle className="text-sm font-bold tracking-tight text-foreground flex items-center gap-2">
              <Receipt className="w-4 h-4 text-amber-500" />
              Receivables Ledger (Customers)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="grid grid-cols-1 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-border/40 border-b border-border/40 bg-muted/[0.05]">
              <div className="p-5 bg-amber-500/[0.02]">
                <p className="text-[10px] text-amber-500 font-bold uppercase tracking-wider mb-1">
                  Total Outstanding
                </p>
                <p className="text-xl font-bold font-mono text-amber-500">
                  {formatCurrency(debtSummary.total_debt)}
                </p>
              </div>
              <div className="p-5 bg-destructive/[0.02]">
                <p className="text-[10px] text-destructive font-bold uppercase tracking-wider mb-1">
                  Overdue Amount
                </p>
                <p className="text-xl font-bold font-mono text-destructive">
                  {formatCurrency(debtSummary.overdue_amount)}
                </p>
              </div>
              <div className="p-5">
                <p className="text-[10px] text-muted-foreground/80 font-bold uppercase tracking-wider mb-1">
                  Unpaid Invoices
                </p>
                <p className="text-xl font-bold font-mono text-foreground">
                  {debtSummary.total_unpaid_bills}
                </p>
              </div>
              <div className="p-5">
                <p className="text-[10px] text-muted-foreground/80 font-bold uppercase tracking-wider mb-1">
                  Overdue Count
                </p>
                <p className="text-xl font-bold font-mono text-destructive/80">
                  {debtSummary.overdue_count}
                </p>
              </div>
            </div>

            {debtSummary.top_debtors?.length > 0 && (
              <div className="p-6 space-y-4">
                <h4 className="text-[10px] font-bold text-muted-foreground/85 uppercase tracking-widest">
                  Top Outstanding Debts
                </h4>
                <div className="space-y-2.5">
                  {debtSummary.top_debtors.map((debtor, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between p-3.5 rounded-xl bg-card/25 border border-border/40 hover:border-primary/20 transition-all group shadow-sm hover:shadow-black/5"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-full bg-primary/10 text-primary border border-primary/25 flex items-center justify-center font-extrabold text-xs shadow-sm shrink-0">
                          {debtor.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-xs text-foreground truncate">
                            {debtor.name}
                          </p>
                          <p className="text-[10px] text-muted-foreground font-semibold">
                            {debtor.bills_count} unpaid bills
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 shrink-0">
                        <div className="text-right">
                          <p className="font-mono font-bold text-xs text-amber-500">
                            {formatCurrency(debtor.total_debt)}
                          </p>
                          <p className="text-[8px] text-muted-foreground/60 uppercase font-bold tracking-wider">
                            Balance
                          </p>
                        </div>

                        <Button
                          size="sm"
                          variant="outline"
                          className="w-8 h-8 p-0 rounded-lg border-primary/20 text-primary hover:bg-primary hover:text-primary-foreground group-hover:border-primary transition-all duration-300"
                          onClick={() =>
                            handleClearDebt(debtor.id, debtor.name)
                          }
                          title="Mark Invoice as Settled"
                        >
                          <Check className="w-4 h-4 stroke-[3]" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Supplier payables ledger card */}
      {supplierDues && supplierDues.total_due > 0 && (
        <Card className="bg-card/90 border-border/40 shadow-sm rounded-xl overflow-hidden">
          <CardHeader className="border-b border-border/40 py-4 bg-muted/20">
            <CardTitle className="text-sm font-bold tracking-tight text-foreground flex items-center gap-2">
              <Truck className="w-4 h-4 text-primary" />
              Payables Ledger (Suppliers)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="grid grid-cols-1 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-border/40 border-b border-border/40 bg-muted/[0.05]">
              <div className="p-5 bg-primary/[0.02]">
                <p className="text-[10px] text-primary font-bold uppercase tracking-wider mb-1">
                  Total Outstanding
                </p>
                <p className="text-xl font-bold font-mono text-primary">
                  {formatCurrency(supplierDues.total_due)}
                </p>
              </div>
              <div className="p-5 bg-destructive/[0.02]">
                <p className="text-[10px] text-destructive font-bold uppercase tracking-wider mb-1">
                  Overdue Dues
                </p>
                <p className="text-xl font-bold font-mono text-destructive">
                  {formatCurrency(supplierDues.overdue_due)}
                </p>
              </div>
              <div className="p-5">
                <p className="text-[10px] text-muted-foreground/80 font-bold uppercase tracking-wider mb-1">
                  Unpaid Invoices
                </p>
                <p className="text-xl font-bold font-mono text-foreground">
                  {supplierDues.unpaid_purchases_count}
                </p>
              </div>
              <div className="p-5">
                <p className="text-[10px] text-muted-foreground/80 font-bold uppercase tracking-wider mb-1">
                  Overdue Count
                </p>
                <p className="text-xl font-bold font-mono text-destructive/80">
                  {supplierDues.overdue_count}
                </p>
              </div>
            </div>

            {supplierDues.top_suppliers?.length > 0 && (
              <div className="p-6 space-y-4">
                <h4 className="text-[10px] font-bold text-muted-foreground/85 uppercase tracking-widest">
                  Top Pending Supplier Invoices
                </h4>
                <div className="space-y-2.5">
                  {supplierDues.top_suppliers.map((supplier, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between p-3.5 rounded-xl bg-card/25 border border-border/40 hover:border-primary/20 transition-all group shadow-sm hover:shadow-black/5"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-full bg-accent/10 text-accent border border-accent/25 flex items-center justify-center shadow-sm shrink-0">
                          <Truck className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-xs text-foreground truncate">
                            {supplier.name}
                          </p>
                          <p className="text-[10px] text-muted-foreground font-semibold">
                            {supplier.purchase_count} unpaid purchases
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 shrink-0">
                        <div className="text-right">
                          <p className="font-mono font-bold text-xs text-primary">
                            {formatCurrency(supplier.total_debt)}
                          </p>
                          <p className="text-[8px] text-muted-foreground/60 uppercase font-bold tracking-wider">
                            Outstanding
                          </p>
                        </div>

                        <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-all duration-300">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-[10px] font-bold border-border/60 hover:bg-primary/20 hover:text-primary hover:border-primary px-3 rounded-lg"
                            onClick={() =>
                              handleSupplierPartialPayment(
                                supplier.id,
                                supplier.name
                              )
                            }
                          >
                            Pay Part
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-[10px] font-bold bg-primary/10 border-primary/20 text-primary hover:bg-primary hover:text-primary-foreground px-3 rounded-lg"
                            onClick={() =>
                              handleSupplierClearDues(
                                supplier.id,
                                supplier.name
                              )
                            }
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
          </CardContent>
        </Card>
      )}

      {/* Clear Debt Confirmation Dialog */}
      <AlertDialog
        open={clearDebtDialog.open}
        onOpenChange={(open) =>
          !open && setClearDebtDialog({ ...clearDebtDialog, open: false })
        }
      >
        <AlertDialogContent className="rounded-2xl border border-border/40 shadow-2xl max-w-md">
          <AlertDialogHeader className="space-y-2">
            <AlertDialogTitle className="font-extrabold text-base tracking-tight text-foreground flex items-center gap-2">
              <Receipt className="w-5 h-5 text-amber-500" />
              Settle Customer Account
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs leading-relaxed text-muted-foreground font-medium">
              This action registers cash completion for all outstanding items on{" "}
              <span className="font-extrabold text-foreground bg-muted/60 px-1.5 py-0.5 rounded">
                {clearDebtDialog.customerName}
              </span>
              . The customer's active outstanding balance will reset to zero.
              This ledger write is permanent.
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
              className="bg-primary hover:bg-primary/95 text-primary-foreground h-10 text-xs font-bold shadow-md shadow-primary/10 rounded-xl"
              onClick={(e) => {
                e.preventDefault();
                confirmClearDebt();
              }}
              disabled={clearingDebt}
            >
              {clearingDebt ? (
                <span className="flex items-center justify-center gap-1.5">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Processing...
                </span>
              ) : (
                <span>Yes, Settle Debt</span>
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
        <DialogContent className="rounded-2xl border border-border/40 shadow-2xl max-w-md p-6">
          <DialogHeader className="border-b border-border/40 pb-4">
            <DialogTitle className="font-extrabold text-base tracking-tight text-foreground flex items-center gap-2">
              <Truck className="w-5 h-5 text-primary" />
              Partial Supplier Payment
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-3">
            <div className="p-3 bg-muted/20 border border-border/40 rounded-xl">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
                Supplier Name
              </span>
              <p className="text-sm font-extrabold text-foreground mt-0.5">
                {supplierPartialPaymentDialog.supplierName}
              </p>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold text-muted-foreground/80">
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
                className="h-10 text-sm font-bold border-border/80 focus:border-primary bg-card/25"
              />
              <p className="text-[9px] text-muted-foreground/60 font-semibold leading-relaxed">
                This amount will clear purchases in First-In First-Out (FIFO)
                chronological sequence.
              </p>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold text-muted-foreground/80">
                Reference Notes
              </Label>
              <Input
                placeholder="Check #, UPI transaction ID, bank details..."
                value={supplierPartialPaymentDialog.notes}
                onChange={(e) =>
                  setSupplierPartialPaymentDialog({
                    ...supplierPartialPaymentDialog,
                    notes: e.target.value,
                  })
                }
                className="h-10 text-sm border-border/80 focus:border-primary bg-card/25"
              />
            </div>
            <Button
              onClick={confirmSupplierPartialPayment}
              disabled={clearingDebt}
              className="w-full btn-primary h-10 text-xs font-bold bg-primary hover:bg-primary/95 text-primary-foreground shadow-md shadow-primary/10 rounded-xl mt-2"
            >
              {clearingDebt ? (
                <span className="flex items-center justify-center gap-1.5">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
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
        <AlertDialogContent className="rounded-2xl border border-border/40 shadow-2xl max-w-md">
          <AlertDialogHeader className="space-y-2">
            <AlertDialogTitle className="font-extrabold text-base tracking-tight text-foreground flex items-center gap-2">
              <Truck className="w-5 h-5 text-primary" />
              Settle Supplier Dues
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs leading-relaxed text-muted-foreground font-medium">
              This action confirms full payment reconciliation for outstanding
              balances on{" "}
              <span className="font-extrabold text-foreground bg-muted/60 px-1.5 py-0.5 rounded">
                {supplierClearDuesDialog.supplierName}
              </span>
              . All unpaid invoice items will flag as settled. This action is
              irreversible.
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
              className="bg-primary hover:bg-primary/95 text-primary-foreground h-10 text-xs font-bold shadow-md shadow-primary/10 rounded-xl"
              onClick={(e) => {
                e.preventDefault();
                confirmSupplierClearAllDues();
              }}
              disabled={clearingDebt}
            >
              {clearingDebt ? (
                <span className="flex items-center justify-center gap-1.5">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Processing...
                </span>
              ) : (
                <span>Yes, Settle All Dues</span>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
