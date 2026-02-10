import { useState, useEffect } from "react";
import axios from "axios";
import { API, useAuth } from "../App";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
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
} from "lucide-react";
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

const StatCard = ({ title, value, icon: Icon, trend, trendValue, color = "primary" }) => {
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
            <p className={`text-2xl font-bold font-mono ${colorClasses[color]}`}>{value}</p>
            {trend !== undefined && (
              <div className="flex items-center gap-1 mt-2">
                {trend >= 0 ? (
                  <ArrowUpRight className="w-4 h-4 text-primary" />
                ) : (
                  <ArrowDownRight className="w-4 h-4 text-destructive" />
                )}
                <span className={`text-xs ${trend >= 0 ? "text-primary" : "text-destructive"}`}>
                  {Math.abs(trendValue || trend)}%
                </span>
                <span className="text-xs text-muted-foreground">vs last month</span>
              </div>
            )}
          </div>
          <div className={`p-3 rounded-xl bg-${color}/10 ${colorClasses[color]}`}>
            <Icon className="w-6 h-6" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default function DashboardPage() {
  const { pharmacy } = useAuth();
  const [stats, setStats] = useState(null);
  const [salesTrend, setSalesTrend] = useState([]);
  const [topProducts, setTopProducts] = useState([]);
  const [alerts, setAlerts] = useState({ low_stock_alerts: [], expiry_alerts: [] });
  const [debtSummary, setDebtSummary] = useState(null);
  const [aiTips, setAiTips] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tipsLoading, setTipsLoading] = useState(false);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const [statsRes, trendRes, productsRes, alertsRes, debtRes] = await Promise.all([
        axios.get(`${API}/dashboard/stats`),
        axios.get(`${API}/dashboard/sales-trend?days=30`),
        axios.get(`${API}/dashboard/top-products?limit=5`),
        axios.get(`${API}/inventory/alerts`),
        axios.get(`${API}/dashboard/debt-summary`),
      ]);

      setStats(statsRes.data);
      setSalesTrend(trendRes.data.trend);
      setTopProducts(productsRes.data.top_products);
      setAlerts(alertsRes.data);
      setDebtSummary(debtRes.data);
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
        <Button variant="outline" onClick={fetchDashboardData} data-testid="refresh-dashboard-btn">
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
          color={alerts.low_stock_alerts?.length > 0 ? "destructive" : "primary"}
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
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
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
                    formatter={(value) => [`₹${value.toLocaleString("en-IN")}`, "Revenue"]}
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
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topProducts} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
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
                    formatter={(value) => [`₹${value.toLocaleString("en-IN")}`, "Revenue"]}
                  />
                  <Bar dataKey="revenue" fill="hsl(var(--accent))" radius={[0, 4, 4, 0]} />
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
                      <span className="font-mono text-yellow-400">{item.quantity} left</span>
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
                      <span className="font-mono text-destructive">{item.expiry_date}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {alerts.low_stock_alerts?.length === 0 && alerts.expiry_alerts?.length === 0 && (
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
                <div className="whitespace-pre-wrap text-muted-foreground">{aiTips.tips}</div>
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
        <Card className="bg-card/50 backdrop-blur-sm border-white/5">
          <CardHeader>
            <CardTitle className="text-lg">Payment Receivables</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
              <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                <p className="text-sm text-muted-foreground">Total Outstanding</p>
                <p className="text-xl font-bold font-mono text-yellow-500">
                  {formatCurrency(debtSummary.total_debt)}
                </p>
              </div>
              <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20">
                <p className="text-sm text-muted-foreground">Overdue</p>
                <p className="text-xl font-bold font-mono text-destructive">
                  {formatCurrency(debtSummary.overdue_amount)}
                </p>
              </div>
              <div className="p-4 rounded-lg bg-muted/50">
                <p className="text-sm text-muted-foreground">Unpaid Bills</p>
                <p className="text-xl font-bold font-mono">{debtSummary.total_unpaid_bills}</p>
              </div>
              <div className="p-4 rounded-lg bg-muted/50">
                <p className="text-sm text-muted-foreground">Overdue Bills</p>
                <p className="text-xl font-bold font-mono">{debtSummary.overdue_count}</p>
              </div>
            </div>

            {debtSummary.top_debtors?.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-2">Top Debtors</h4>
                <div className="space-y-2">
                  {debtSummary.top_debtors.slice(0, 5).map((debtor, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between p-2 rounded-lg bg-muted/30"
                    >
                      <span>{debtor.name}</span>
                      <span className="font-mono text-yellow-500">
                        {formatCurrency(debtor.amount)} ({debtor.bills} bills)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
