import { useState, useEffect } from "react";
import axios from "axios";
import { API, useAuth } from "../App";
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
  CreditCard,
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

axios.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("pharmalogy_token");

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
    primary: "text-primary",
    accent: "text-accent",
    destructive: "text-destructive",
    yellow: "text-yellow-500",
  };

  return (
    <Card className="stat-card group hover:border-primary/20 transition-all duration-300">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground mb-1">{title}</p>
            <p
              className={`text-2xl font-bold font-mono ${colorClasses[color]}`}
            >
              {value}
            </p>
            {trend !== undefined && (
              <div className="flex items-center gap-1 mt-2">
                {trend >= 0 ? (
                  <ArrowUpRight className="w-4 h-4 text-primary" />
                ) : (
                  <ArrowDownRight className="w-4 h-4 text-destructive" />
                )}
                <span
                  className={`text-xs ${trend >= 0 ? "text-primary" : "text-destructive"}`}
                >
                  {Math.abs(trendValue || trend)}%
                </span>
                <span className="text-xs text-muted-foreground">
                  vs last month
                </span>
              </div>
            )}
          </div>
          <div
            className={`p-3 rounded-xl bg-${color}/10 ${colorClasses[color]}`}
          >
            <Icon className="w-6 h-6" />
          </div>
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
  const [supplierPartialPaymentDialog, setSupplierPartialPaymentDialog] = useState({
    open: false,
    supplierId: null,
    supplierName: "",
    amount: "0",
    notes: ""
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
      const response = await axios.post(`${API}/customers/${customerId}/clear-debt`);
      toast.success(response.data.message);
      // Refresh dashboard data
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
      notes: ""
    });
  };

  const handleSupplierClearDues = (supplierId, supplierName) => {
    setSupplierClearDuesDialog({
      open: true,
      supplierId,
      supplierName
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
      await axios.post(`${API}/suppliers/${supplierId}/pay-part`, { amount: parseFloat(amount), notes });
      toast.success("Partial payment registered successfully");
      fetchDashboardData();
      setSupplierPartialPaymentDialog({ ...supplierPartialPaymentDialog, open: false });
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
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in" data-testid="dashboard-page">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">
            Welcome back! Here's what's happening at {pharmacy?.name}
          </p>
        </div>
        <Button
          variant="outline"
          onClick={fetchDashboardData}
          data-testid="refresh-dashboard-btn"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Stats Grid */}
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
          icon={Receipt}
          color="accent"
        />
        <StatCard
          title="Stock Value"
          value={formatCurrency(stats?.inventory?.stock_value)}
          icon={Package}
          color="accent"
        />
      </div>

      {/* Second Row Stats */}
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

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sales Trend Chart */}
        <Card className="bg-card/50 backdrop-blur-sm border-white/5">
          <CardHeader>
            <CardTitle className="text-lg">Sales Trend (30 Days)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={salesTrend}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="hsl(var(--border))"
                  />
                  <XAxis
                    dataKey="date"
                    stroke="hsl(var(--muted-foreground))"
                    tick={{ fontSize: 12 }}
                    tickFormatter={(value) => value.slice(5)}
                  />
                  <YAxis
                    stroke="hsl(var(--muted-foreground))"
                    tick={{ fontSize: 12 }}
                    tickFormatter={(value) => `₹${value / 1000}k`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                    formatter={(value) => [
                      `₹${value.toLocaleString("en-IN")}`,
                      "Revenue",
                    ]}
                  />
                  <Line
                    type="monotone"
                    dataKey="revenue"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Top Products Chart */}
        <Card className="bg-card/50 backdrop-blur-sm border-white/5">
          <CardHeader>
            <CardTitle className="text-lg">Top Selling Products</CardTitle>
            {user?.subscription_plan && (
              <div className="text-sm text-muted-foreground mt-1">
                Plan:{" "}
                <span className="font-semibold">{user.subscription_plan}</span>{" "}
                | Expiry:{" "}
                {new Date(user.subscription_expiry).toLocaleDateString()}
              </div>
            )}
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topProducts} layout="vertical">
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="hsl(var(--border))"
                  />
                  <XAxis
                    type="number"
                    stroke="hsl(var(--muted-foreground))"
                    tick={{ fontSize: 12 }}
                    tickFormatter={(value) => `₹${value / 1000}k`}
                  />
                  <YAxis
                    dataKey="name"
                    type="category"
                    stroke="hsl(var(--muted-foreground))"
                    tick={{ fontSize: 11 }}
                    width={100}
                    tickFormatter={(value) => value.slice(0, 15)}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                    formatter={(value) => [
                      `₹${value.toLocaleString("en-IN")}`,
                      "Revenue",
                    ]}
                  />
                  <Bar
                    dataKey="revenue"
                    fill="hsl(var(--accent))"
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Alerts and AI Tips Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Alerts */}
        <Card className="bg-card/50 backdrop-blur-sm border-white/5">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Inventory Alerts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Low Stock Alerts */}
            {alerts.low_stock_alerts?.length > 0 && (
              <div className="alert-warning">
                <h4 className="font-medium text-yellow-400 mb-2 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  Low Stock ({alerts.low_stock_alerts.length})
                </h4>
                <ul className="space-y-1 text-sm">
                  {alerts.low_stock_alerts.slice(0, 5).map((item, i) => (
                    <li key={i} className="flex justify-between">
                      <span>{item.product_name}</span>
                      <span className="font-mono text-yellow-400">
                        {item.quantity} left
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Expiry Alerts */}
            {alerts.expiry_alerts?.length > 0 && (
              <div className="alert-danger">
                <h4 className="font-medium text-destructive mb-2 flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Expiring Soon ({alerts.expiry_alerts.length})
                </h4>
                <ul className="space-y-1 text-sm">
                  {alerts.expiry_alerts.slice(0, 5).map((item, i) => (
                    <li key={i} className="flex justify-between">
                      <span>
                        {item.product_name} ({item.batch_no})
                      </span>
                      <span className="font-mono text-destructive">
                        {item.expiry_date}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {alerts.low_stock_alerts?.length === 0 &&
              alerts.expiry_alerts?.length === 0 && (
                <div className="alert-success">
                  <p className="text-primary flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" />
                    All good! No alerts at the moment.
                  </p>
                </div>
              )}
          </CardContent>
        </Card>

        {/* AI Tips */}
        <Card className="bg-card/50 backdrop-blur-sm border-white/5">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-accent" />
              AI Business Tips
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchAiTips}
              disabled={tipsLoading}
              data-testid="get-ai-tips-btn"
            >
              {tipsLoading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                "Get Tips"
              )}
            </Button>
          </CardHeader>
          <CardContent>
            {aiTips ? (
              <div className="prose prose-invert prose-sm max-w-none">
                <div className="whitespace-pre-wrap text-muted-foreground">
                  {aiTips.tips}
                </div>
                <p className="text-xs text-muted-foreground/50 mt-4">
                  Generated: {new Date(aiTips.generated_at).toLocaleString()}
                </p>
              </div>
            ) : (
              <div className="text-center py-8">
                <Sparkles className="w-10 h-10 mx-auto text-accent/50 mb-3" />
                <p className="text-muted-foreground text-sm">
                  Click "Get Tips" to receive AI-powered business insights
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Debt Summary */}
      {debtSummary && debtSummary.total_debt > 0 && (
        <Card className="bg-card/50 backdrop-blur-sm border-white/5 overflow-hidden">
          <CardHeader className="border-b border-white/5 bg-white/5">
            <CardTitle className="text-lg">Payment Receivables</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="grid grid-cols-1 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-white/10 border-b border-white/5">
              <div className="p-6 bg-yellow-500/5">
                <p className="text-sm text-yellow-500/70 mb-1 font-medium">
                  Total Outstanding
                </p>
                <p className="text-2xl font-bold font-mono text-yellow-500">
                  {formatCurrency(debtSummary.total_debt)}
                </p>
              </div>
              <div className="p-6 bg-destructive/5">
                <p className="text-sm text-destructive/70 mb-1 font-medium font-medium">Overdue</p>
                <p className="text-2xl font-bold font-mono text-destructive">
                  {formatCurrency(debtSummary.overdue_amount)}
                </p>
              </div>
              <div className="p-6">
                <p className="text-sm text-muted-foreground mb-1">Unpaid Bills</p>
                <p className="text-2xl font-bold font-mono">
                  {debtSummary.total_unpaid_bills}
                </p>
              </div>
              <div className="p-6">
                <p className="text-sm text-muted-foreground mb-1 font-medium">Overdue Bills</p>
                <p className="text-2xl font-bold font-mono text-destructive/80">
                  {debtSummary.overdue_count}
                </p>
              </div>
            </div>

            {debtSummary.top_debtors?.length > 0 && (
              <div className="p-6">
                <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
                  Top Debtors
                </h4>
                <div className="space-y-3">
                  {debtSummary.top_debtors.map((debtor, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/5 hover:border-primary/20 transition-all group"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                          {debtor.name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-semibold">{debtor.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {debtor.bills_count} unpaid bills
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <p className="font-mono font-bold text-yellow-500">
                            {formatCurrency(debtor.total_debt)}
                          </p>
                          <p className="text-[10px] text-muted-foreground uppercase">Outstanding</p>
                        </div>
                        
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-10 h-10 p-0 rounded-full border-primary/20 hover:bg-primary hover:text-primary-foreground group-hover:border-primary transition-all"
                          onClick={() => handleClearDebt(debtor.id, debtor.name)}
                          title="Mark as Paid"
                        >
                          <Check className="w-5 h-5" />
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

      {/* Supplier Dues Summary */}
      {supplierDues && supplierDues.total_due > 0 && (
        <Card className="bg-card/50 backdrop-blur-sm border-white/5 overflow-hidden">
          <CardHeader className="border-b border-white/5 bg-white/5">
            <CardTitle className="text-lg">Payment Due (Suppliers)</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="grid grid-cols-1 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-white/10 border-b border-white/5">
              <div className="p-6 bg-primary/5">
                <p className="text-sm text-primary/70 mb-1 font-medium">
                  Total Outstanding
                </p>
                <p className="text-2xl font-bold font-mono text-primary">
                  {formatCurrency(supplierDues.total_due)}
                </p>
              </div>
              <div className="p-6 bg-destructive/5">
                <p className="text-sm text-destructive/70 mb-1 font-medium">Overdue Dues</p>
                <p className="text-2xl font-bold font-mono text-destructive">
                  {formatCurrency(supplierDues.overdue_due)}
                </p>
              </div>
              <div className="p-6">
                <p className="text-sm text-muted-foreground mb-1">Unpaid Purchases</p>
                <p className="text-2xl font-bold font-mono">
                  {supplierDues.unpaid_purchases_count}
                </p>
              </div>
              <div className="p-6">
                <p className="text-sm text-muted-foreground mb-1 font-medium text-destructive/70 px-2 rounded-full border border-destructive/20 inline-block">Overdue Purchases</p>
                <div className="mt-1">
                  <p className="text-2xl font-bold font-mono text-destructive/80 inline-block">
                    {supplierDues.overdue_count}
                  </p>
                </div>
              </div>
            </div>

            {supplierDues.top_suppliers?.length > 0 && (
              <div className="p-6">
                <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
                  Top Suppliers to Pay
                </h4>
                <div className="space-y-3">
                  {supplierDues.top_suppliers.map((supplier, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/5 hover:border-primary/20 transition-all group"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center text-accent font-bold">
                          <Truck className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="font-semibold">{supplier.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {supplier.purchase_count} unpaid purchases
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-4">
                        <div className="text-right mr-4">
                          <p className="font-mono font-bold text-primary">
                            {formatCurrency(supplier.total_debt)}
                          </p>
                          <p className="text-[10px] text-muted-foreground uppercase">Outstanding</p>
                        </div>
                        
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="bg-white/5 border-white/10 hover:bg-primary/20 hover:text-primary hover:border-primary"
                            onClick={() => handleSupplierPartialPayment(supplier.id, supplier.name)}
                          >
                            Pay Part
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="bg-primary/10 border-primary/20 text-primary hover:bg-primary hover:text-primary-foreground"
                            onClick={() => handleSupplierClearDues(supplier.id, supplier.name)}
                          >
                            Fully Paid
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
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear Customer Debt?</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark all unpaid bills for{" "}
              <span className="font-bold text-foreground">
                {clearDebtDialog.customerName}
              </span>{" "}
              as paid and clear their outstanding balance. This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={clearingDebt}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-primary hover:bg-primary/90"
              onClick={(e) => {
                e.preventDefault();
                confirmClearDebt();
              }}
              disabled={clearingDebt}
            >
              {clearingDebt ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                "Yes, Clear Debt"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Supplier Partial Payment Dialog */}
      <Dialog 
        open={supplierPartialPaymentDialog.open} 
        onOpenChange={(open) => !open && setSupplierPartialPaymentDialog({ ...supplierPartialPaymentDialog, open: false })}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Register Partial Supplier Payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-3">
            <div className="space-y-2">
              <Label>Paying to: {supplierPartialPaymentDialog.supplierName}</Label>
            </div>
            <div className="space-y-2">
              <Label>Amount Paid (₹)</Label>
              <Input 
                type="number" 
                min="0" 
                step="0.01" 
                placeholder="Enter amount"
                value={supplierPartialPaymentDialog.amount} 
                onChange={(e) => setSupplierPartialPaymentDialog({ ...supplierPartialPaymentDialog, amount: e.target.value })} 
              />
              <p className="text-[10px] text-muted-foreground">This amount will be applied to the oldest unpaid purchases first (FIFO).</p>
            </div>
            <div className="space-y-2">
              <Label>Reference Notes</Label>
              <Input 
                placeholder="Check #, UPI Ref, etc." 
                value={supplierPartialPaymentDialog.notes} 
                onChange={(e) => setSupplierPartialPaymentDialog({ ...supplierPartialPaymentDialog, notes: e.target.value })} 
              />
            </div>
            <Button 
              onClick={confirmSupplierPartialPayment} 
              disabled={clearingDebt} 
              className="w-full btn-primary"
            >
              {clearingDebt ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                "Confirm Payment"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Supplier Fully Paid Confirmation Dialog */}
      <AlertDialog
        open={supplierClearDuesDialog.open}
        onOpenChange={(open) =>
          !open && setSupplierClearDuesDialog({ ...supplierClearDuesDialog, open: false })
        }
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear All Dues for {supplierClearDuesDialog.supplierName}?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to clear all outstanding dues for this supplier? 
              This will mark all unpaid purchases as fully paid. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={clearingDebt}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-primary hover:bg-primary/90"
              onClick={(e) => {
                e.preventDefault();
                confirmSupplierClearAllDues();
              }}
              disabled={clearingDebt}
            >
              {clearingDebt ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                "Yes, Clear All Dues"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
