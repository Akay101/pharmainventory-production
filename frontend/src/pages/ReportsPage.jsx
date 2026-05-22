import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import axios from "axios";
import { API } from "../App";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  IndianRupee,
  Calendar,
  Search,
  AlertTriangle,
  Clock,
  ArrowUpRight,
  Activity,
  ShieldAlert,
  Users,
  ShoppingBag,
  Package,
  History,
  Truck,
  CheckCircle2,
  AlertCircle,
  Info,
  Sparkles,
  Percent
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
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
} from "recharts";
import { toast } from "sonner";

const COLORS = ["#10B981", "#8B5CF6", "#3B82F6", "#F59E0B", "#EF4444"];

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState("financial");

  // Original states (strictly preserved)
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState("30");
  const [salesTrend, setSalesTrend] = useState([]);
  const [topProducts, setTopProducts] = useState([]);
  const [supplierAnalysis, setSupplierAnalysis] = useState([]);
  const [stats, setStats] = useState(null);

  // New states for Inventory Alerts
  const [inventoryAlerts, setInventoryAlerts] = useState(null);
  const [loadingInventory, setLoadingInventory] = useState(false);

  // New states for Sourcing Price Auditor & Autocomplete Suggestions
  const [sourcingSearch, setSourcingSearch] = useState("");
  const [sourcingSuggestions, setSourcingSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlightedSuggestionIndex, setHighlightedSuggestionIndex] = useState(-1);
  const [sourcingResults, setSourcingResults] = useState(null);
  const [loadingSourcing, setLoadingSourcing] = useState(false);
  const [sourcingComparePrice, setSourcingComparePrice] = useState("");

  // Ref and position states for floating autocomplete
  const sourcingInputRef = useRef(null);
  const [dropdownPosition, setDropdownPosition] = useState({
    top: 0,
    left: 0,
    width: 0,
  });

  const updateDropdownPosition = () => {
    if (!sourcingInputRef.current) return;
    const rect = sourcingInputRef.current.getBoundingClientRect();
    const dropdownWidth = Math.max(rect.width, 350);
    setDropdownPosition({
      top: rect.bottom + 4,
      left: rect.left,
      width: dropdownWidth,
    });
  };

  useEffect(() => {
    if (!showSuggestions || sourcingSuggestions.length === 0) return;

    let rafId;
    const updatePosition = () => {
      updateDropdownPosition();
      rafId = requestAnimationFrame(updatePosition);
    };

    rafId = requestAnimationFrame(updatePosition);

    return () => cancelAnimationFrame(rafId);
  }, [showSuggestions, sourcingSuggestions]);

  // New states for Debt & Liabilities
  const [debtCustomers, setDebtCustomers] = useState([]);
  const [dueSuppliers, setDueSuppliers] = useState([]);
  const [loadingDebtDues, setLoadingDebtDues] = useState(false);

  useEffect(() => {
    fetchReports();
  }, [days]);

  useEffect(() => {
    fetchAdditionalData();
  }, []);

  // Fetch suggestions for medicine autocomplete in Sourcing Auditor
  useEffect(() => {
    const fetchSuggestions = async () => {
      if (sourcingSearch.trim().length >= 2) {
        try {
          const response = await axios.get(
            `${API}/medicines/search?q=${encodeURIComponent(sourcingSearch)}&limit=15&fuzzy=true`
          );
          setSourcingSuggestions(response.data.medicines || []);
        } catch (error) {
          console.error("Failed to fetch autocomplete suggestions", error);
        }
      } else {
        setSourcingSuggestions([]);
      }
    };

    const delayDebounceFn = setTimeout(() => {
      fetchSuggestions();
    }, 200);

    return () => clearTimeout(delayDebounceFn);
  }, [sourcingSearch]);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const [trendRes, productsRes, supplierRes, statsRes] = await Promise.all([
        axios.get(`${API}/dashboard/sales-trend?days=${days}`),
        axios.get(`${API}/dashboard/top-products?limit=10`),
        axios.get(`${API}/dashboard/supplier-analysis`),
        axios.get(`${API}/dashboard/stats`),
      ]);

      setSalesTrend(trendRes.data.trend || []);
      setTopProducts(productsRes.data.top_products || []);
      setSupplierAnalysis(supplierRes.data.supplier_analysis || []);
      setStats(statsRes.data);
    } catch (error) {
      toast.error("Failed to load core reports");
    } finally {
      setLoading(false);
    }
  };

  const fetchAdditionalData = async () => {
    setLoadingInventory(true);
    setLoadingDebtDues(true);
    try {
      const [inventoryRes, customersRes, suppliersRes] = await Promise.all([
        axios.get(`${API}/inventory/alerts`),
        axios.get(`${API}/customers?has_debt=true&limit=100`),
        axios.get(`${API}/suppliers?limit=100`),
      ]);

      setInventoryAlerts(inventoryRes.data);
      setDebtCustomers(customersRes.data.customers || []);
      
      const suppliersWithOwed = (suppliersRes.data.suppliers || []).filter(
        (s) => (s.total_amount_owed || 0) > 0
      );
      setDueSuppliers(suppliersWithOwed);
    } catch (error) {
      console.error("Failed to load secondary reports data", error);
    } finally {
      setLoadingInventory(false);
      setLoadingDebtDues(false);
    }
  };

  const handleSourcingSearch = async (e) => {
    if (e) e.preventDefault();
    if (!sourcingSearch.trim()) {
      toast.error("Please enter a product name to audit");
      return;
    }
    setShowSuggestions(false);
    setLoadingSourcing(true);
    try {
      const response = await axios.get(
        `${API}/purchases/price-history?product_name=${encodeURIComponent(
          sourcingSearch.trim()
        )}&current_price=${sourcingComparePrice || 0}`
      );
      setSourcingResults(response.data);
      toast.success("Sourcing history analyzed successfully");
    } catch (error) {
      toast.error("Failed to fetch product sourcing history");
    } finally {
      setLoadingSourcing(false);
    }
  };

  const handleSuggestionClick = async (medName) => {
    setSourcingSearch(medName);
    setShowSuggestions(false);
    setLoadingSourcing(true);
    try {
      const response = await axios.get(
        `${API}/purchases/price-history?product_name=${encodeURIComponent(
          medName
        )}&current_price=${sourcingComparePrice || 0}`
      );
      setSourcingResults(response.data);
      toast.success("Sourcing history analyzed successfully");
    } catch (error) {
      toast.error("Failed to fetch product sourcing history");
    } finally {
      setLoadingSourcing(false);
    }
  };

  const formatCurrency = (value) => `₹${(value || 0).toLocaleString("en-IN")}`;

  // Calculate totals from trend data
  const totalRevenue = salesTrend.reduce((sum, d) => sum + d.revenue, 0);
  const totalProfit = salesTrend.reduce((sum, d) => sum + d.profit, 0);
  const totalOrders = salesTrend.reduce((sum, d) => sum + d.orders, 0);
  const profitMargin = totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(1) : 0;

  // Map charts data to handle backend key differences
  const mappedTopProducts = topProducts.map((p) => ({
    ...p,
    name: p.name || p.product_name || "Unknown Product",
  }));

  const mappedSupplierAnalysis = supplierAnalysis.map((s) => ({
    ...s,
    purchases: s.purchases || s.purchase_count || s.total_purchases || 0,
    amount: s.amount || s.total_amount || 0,
  }));

  // Calculate debt sums
  const totalCustomerDebt = debtCustomers.reduce((sum, c) => sum + (c.total_debt || 0), 0);
  const totalSupplierLiabilities = dueSuppliers.reduce((sum, s) => sum + (s.total_amount_owed || 0), 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          <p className="text-muted-foreground text-sm font-medium animate-pulse">Loading analytics dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in" data-testid="reports-page">
      {/* Elegantly Designed Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-white/5 pb-5">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-foreground via-foreground to-muted-foreground">
            Reports & Analytics
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Real-time business insights, inventory metrics, and supplier audit tools
          </p>
        </div>

        {/* Global Days Selector */}
        {activeTab === "financial" && (
          <div className="flex items-center gap-3 bg-card/40 border border-white/5 rounded-xl px-3 py-1.5 backdrop-blur-sm self-start md:self-auto">
            <Calendar className="w-4 h-4 text-primary" />
            <Select value={days} onValueChange={setDays}>
              <SelectTrigger className="w-40 border-0 bg-transparent focus:ring-0 focus:ring-offset-0 text-sm font-medium p-0 h-auto" data-testid="days-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-card/95 border-white/5 backdrop-blur-md">
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
                <SelectItem value="365">Last year</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Modern Pill-Shaped Tab Switcher */}
      <div className="flex overflow-x-auto space-x-1 p-1 bg-card/40 border border-white/5 rounded-xl max-w-2xl backdrop-blur-md">
        {[
          { id: "financial", label: "Financial Metrics", icon: BarChart3 },
          { id: "inventory", label: "Inventory Health", icon: ShieldAlert },
          { id: "sourcing", label: "Sourcing Price Auditor", icon: Sparkles },
          { id: "dues", label: "Debt & liabilities", icon: Users },
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 text-xs md:text-sm font-medium rounded-lg whitespace-nowrap transition-all duration-200 ${
                activeTab === tab.id
                  ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20 scale-[1.02]"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/5"
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* TAB 1: FINANCIAL PERFORMANCE */}
      {activeTab === "financial" && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="stat-card bg-gradient-to-br from-primary/5 to-transparent hover:border-primary/30 transition-all duration-300">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Total Revenue</p>
                    <p className="text-2xl font-bold font-mono text-primary">{formatCurrency(totalRevenue)}</p>
                  </div>
                  <div className="p-3 bg-primary/10 rounded-xl">
                    <IndianRupee className="w-6 h-6 text-primary" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="stat-card bg-gradient-to-br from-emerald-500/5 to-transparent hover:border-emerald-500/30 transition-all duration-300">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Total Profit</p>
                    <p className={`text-2xl font-bold font-mono ${totalProfit >= 0 ? "text-emerald-500" : "text-destructive"}`}>
                      {formatCurrency(totalProfit)}
                    </p>
                  </div>
                  <div className={`p-3 rounded-xl ${totalProfit >= 0 ? "bg-emerald-500/10" : "bg-destructive/10"}`}>
                    {totalProfit >= 0 ? (
                      <TrendingUp className="w-6 h-6 text-emerald-500" />
                    ) : (
                      <TrendingDown className="w-6 h-6 text-destructive" />
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="stat-card bg-gradient-to-br from-purple-500/5 to-transparent hover:border-purple-500/30 transition-all duration-300">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Total Orders</p>
                    <p className="text-2xl font-bold font-mono text-purple-400">{totalOrders}</p>
                  </div>
                  <div className="p-3 bg-purple-500/10 rounded-xl">
                    <ShoppingBag className="w-6 h-6 text-purple-400" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="stat-card bg-gradient-to-br from-amber-500/5 to-transparent hover:border-amber-500/30 transition-all duration-300">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Profit Margin</p>
                    <p className={`text-2xl font-bold font-mono ${profitMargin >= 0 ? "text-amber-500" : "text-destructive"}`}>
                      {profitMargin}%
                    </p>
                  </div>
                  <div className="p-3 bg-amber-500/10 rounded-xl">
                    <Percent className="w-6 h-6 text-amber-500" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Revenue & Profit Graph Card */}
          <Card className="glass border-white/5 overflow-hidden shadow-lg">
            <CardHeader className="border-b border-white/5 bg-white/[0.01] px-6 py-4">
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                <Activity className="w-5 h-5 text-primary" />
                Revenue & Profit Trend
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={salesTrend}>
                    <defs>
                      <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.01}/>
                      </linearGradient>
                      <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10B981" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="#10B981" stopOpacity={0.01}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                    <XAxis
                      dataKey="date"
                      stroke="hsl(var(--muted-foreground))"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(value) => value.slice(5)}
                    />
                    <YAxis
                      stroke="hsl(var(--muted-foreground))"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(value) => typeof value === 'number' ? `₹${value / 1000}k` : ""}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "12px",
                        backdropFilter: "blur(8px)",
                        boxShadow: "0 10px 15px -3px rgba(0,0,0,0.3)"
                      }}
                      formatter={(value, name) => [
                        <span className="font-mono font-bold text-foreground">{formatCurrency(value)}</span>,
                        name === "revenue" ? "Revenue" : "Profit"
                      ]}
                    />
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2.5}
                      fillOpacity={1}
                      fill="url(#colorRevenue)"
                      name="revenue"
                    />
                    <Area
                      type="monotone"
                      dataKey="profit"
                      stroke="#10B981"
                      strokeWidth={2.5}
                      fillOpacity={1}
                      fill="url(#colorProfit)"
                      name="profit"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Bottom Grid Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top Selling Products */}
            <Card className="glass border-white/5 overflow-hidden shadow-lg">
              <CardHeader className="border-b border-white/5 bg-white/[0.01] px-6 py-4">
                <CardTitle className="text-lg font-bold flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-primary" />
                  Top Selling Products (by Revenue)
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={mappedTopProducts} layout="vertical">
                      <defs>
                        <linearGradient id="barGlow" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.6}/>
                          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={1}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                      <XAxis
                        type="number"
                        stroke="hsl(var(--muted-foreground))"
                        tick={{ fontSize: 11 }}
                        tickFormatter={(value) => `₹${value / 1000}k`}
                      />
                      <YAxis
                        dataKey="name"
                        type="category"
                        stroke="hsl(var(--muted-foreground))"
                        tick={{ fontSize: 11 }}
                        width={120}
                        tickFormatter={(value) => (value && typeof value === 'string' ? (value.length > 18 ? `${value.slice(0, 16)}...` : value) : "")}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "12px",
                          backdropFilter: "blur(8px)"
                        }}
                        formatter={(value) => [<span className="font-mono font-bold text-primary">{formatCurrency(value)}</span>, "Revenue"]}
                      />
                      <Bar dataKey="revenue" fill="url(#barGlow)" radius={[0, 6, 6, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Supplier Distribution */}
            <Card className="glass border-white/5 overflow-hidden shadow-lg">
              <CardHeader className="border-b border-white/5 bg-white/[0.01] px-6 py-4">
                <CardTitle className="text-lg font-bold flex items-center gap-2">
                  <Truck className="w-5 h-5 text-accent" />
                  Supplier Purchase Distribution
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                {mappedSupplierAnalysis.length > 0 ? (
                  <div className="h-80 flex items-center justify-center">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={mappedSupplierAnalysis.slice(0, 5)}
                          cx="50%"
                          cy="50%"
                          innerRadius={65}
                          outerRadius={105}
                          paddingAngle={3}
                          dataKey="amount"
                          nameKey="name"
                          label={({ name, percent }) => {
                            const pct = typeof percent === 'number' && !isNaN(percent) ? percent : 0;
                            return `${(name || "Unknown").slice(0, 10)} (${(pct * 100).toFixed(0)}%)`;
                          }}
                          labelLine={{ stroke: "hsl(var(--muted-foreground))", strokeWidth: 1 }}
                        >
                          {mappedSupplierAnalysis.slice(0, 5).map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "hsl(var(--card))",
                            border: "1px solid hsl(var(--border))",
                            borderRadius: "12px",
                            backdropFilter: "blur(8px)"
                          }}
                          formatter={(value) => [<span className="font-mono font-bold text-foreground">{formatCurrency(value)}</span>, "Purchases"]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-80 flex flex-col items-center justify-center text-muted-foreground gap-2">
                    <Info className="w-8 h-8 opacity-40" />
                    <p className="text-sm">No supplier purchase distribution data available</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Supplier Analysis Table */}
          {mappedSupplierAnalysis.length > 0 && (
            <Card className="glass border-white/5 overflow-hidden shadow-lg">
              <CardHeader className="border-b border-white/5 bg-white/[0.01] px-6 py-4">
                <CardTitle className="text-lg font-bold flex items-center gap-2">
                  <Users className="w-5 h-5 text-muted-foreground" />
                  Supplier Sourcing Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/5 bg-white/[0.01]">
                        <th className="text-left py-3.5 px-6 font-semibold text-muted-foreground">Supplier</th>
                        <th className="text-center py-3.5 px-6 font-semibold text-muted-foreground">Total Invoices</th>
                        <th className="text-right py-3.5 px-6 font-semibold text-muted-foreground">Purchases Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {mappedSupplierAnalysis.map((supplier, index) => (
                        <tr key={index} className="hover:bg-white/[0.02] transition-colors">
                          <td className="py-3.5 px-6 font-medium text-foreground">{supplier.name}</td>
                          <td className="py-3.5 px-6 text-center font-mono text-muted-foreground">{supplier.purchases}</td>
                          <td className="py-3.5 px-6 text-right font-mono font-semibold text-primary">
                            {formatCurrency(supplier.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* TAB 2: INVENTORY & EXPIRY HEALTH */}
      {activeTab === "inventory" && (
        <div className="space-y-6">
          {loadingInventory ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
              <p className="text-muted-foreground text-sm">Analyzing inventory stock and batch health...</p>
            </div>
          ) : inventoryAlerts ? (
            <div className="space-y-6 animate-fade-in">
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="stat-card bg-gradient-to-br from-rose-500/10 to-transparent border-rose-500/20 hover:border-rose-500/30">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-semibold text-rose-400 uppercase tracking-wider mb-1">Expired Batches</p>
                        <p className="text-3xl font-extrabold font-mono text-rose-500">
                          {(inventoryAlerts.expired || []).length}
                        </p>
                      </div>
                      <div className="p-3 bg-rose-500/10 rounded-xl">
                        <ShieldAlert className="w-6 h-6 text-rose-500" />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="stat-card bg-gradient-to-br from-amber-500/10 to-transparent border-amber-500/20 hover:border-amber-500/30">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-1">Expiring Soon (90 Days)</p>
                        <p className="text-3xl font-extrabold font-mono text-amber-500">
                          {(inventoryAlerts.expiry_alerts || []).length}
                        </p>
                      </div>
                      <div className="p-3 bg-amber-500/10 rounded-xl">
                        <AlertTriangle className="w-6 h-6 text-amber-500" />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="stat-card bg-gradient-to-br from-blue-500/10 to-transparent border-blue-500/20 hover:border-blue-500/30">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-1">Low Stock Alerts</p>
                        <p className="text-3xl font-extrabold font-mono text-blue-500">
                          {(inventoryAlerts.low_stock_alerts || []).length}
                        </p>
                      </div>
                      <div className="p-3 bg-blue-500/10 rounded-xl">
                        <Package className="w-6 h-6 text-blue-500" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Detail Grids */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Expired Batches */}
                <Card className="glass border-white/5 shadow-lg flex flex-col h-[400px]">
                  <CardHeader className="border-b border-white/5 bg-rose-500/[0.02] px-6 py-4 flex flex-row items-center justify-between">
                    <CardTitle className="text-base font-bold text-rose-400 flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4 text-rose-500" />
                      Expired Medicines (Action Required)
                    </CardTitle>
                    <Badge variant="destructive" className="font-mono bg-rose-500/10 text-rose-400 border-rose-500/20">
                      {(inventoryAlerts.expired || []).length} Batches
                    </Badge>
                  </CardHeader>
                  <CardContent className="p-0 flex-1 overflow-y-auto">
                    {(inventoryAlerts.expired || []).length > 0 ? (
                      <div className="divide-y divide-white/5">
                        {(inventoryAlerts.expired || []).map((item, idx) => (
                          <div key={idx} className="p-4 hover:bg-white/[0.01] transition-colors flex items-center justify-between text-sm">
                            <div className="space-y-1">
                              <p className="font-semibold text-foreground">{item.product_name}</p>
                              <div className="flex gap-3 text-xs text-muted-foreground font-mono">
                                <span>Batch: {item.batch_no}</span>
                                <span>Expired: {item.expiry_date}</span>
                              </div>
                            </div>
                            <div className="text-right">
                              <Badge className="font-mono bg-rose-500/20 text-rose-400 border border-rose-500/30">
                                {item.available_quantity} Units Left
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-6 gap-2">
                        <CheckCircle2 className="w-8 h-8 text-emerald-500 opacity-60" />
                        <p className="text-sm">No expired products in stock</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Expiring Soon */}
                <Card className="glass border-white/5 shadow-lg flex flex-col h-[400px]">
                  <CardHeader className="border-b border-white/5 bg-amber-500/[0.02] px-6 py-4 flex flex-row items-center justify-between">
                    <CardTitle className="text-base font-bold text-amber-400 flex items-center gap-2">
                      <Clock className="w-4 h-4 text-amber-500" />
                      Expiring Soon (Next 90 Days)
                    </CardTitle>
                    <Badge className="font-mono bg-amber-500/10 text-amber-400 border-amber-500/20">
                      {(inventoryAlerts.expiry_alerts || []).length} Batches
                    </Badge>
                  </CardHeader>
                  <CardContent className="p-0 flex-1 overflow-y-auto">
                    {(inventoryAlerts.expiry_alerts || []).length > 0 ? (
                      <div className="divide-y divide-white/5">
                        {(inventoryAlerts.expiry_alerts || []).map((item, idx) => (
                          <div key={idx} className="p-4 hover:bg-white/[0.01] transition-colors flex items-center justify-between text-sm">
                            <div className="space-y-1">
                              <p className="font-semibold text-foreground">{item.product_name}</p>
                              <div className="flex gap-3 text-xs text-muted-foreground font-mono">
                                <span>Batch: {item.batch_no}</span>
                                <span>Expires: {item.expiry_date}</span>
                              </div>
                            </div>
                            <div className="text-right">
                              <Badge className="font-mono bg-amber-500/20 text-amber-400 border border-amber-500/30">
                                {item.available_quantity} Units
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-6 gap-2">
                        <CheckCircle2 className="w-8 h-8 text-emerald-500 opacity-60" />
                        <p className="text-sm">No batches expiring in the next 90 days</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Low Stock Alerts */}
                <Card className="glass border-white/5 shadow-lg flex flex-col h-[400px] lg:col-span-2">
                  <CardHeader className="border-b border-white/5 bg-blue-500/[0.02] px-6 py-4 flex flex-row items-center justify-between">
                    <CardTitle className="text-base font-bold text-blue-400 flex items-center gap-2">
                      <Package className="w-4 h-4 text-blue-500" />
                      Low Stock Safety Inventory Warnings
                    </CardTitle>
                    <Badge className="font-mono bg-blue-500/10 text-blue-400 border-blue-500/20">
                      {(inventoryAlerts.low_stock_alerts || []).length} Products
                    </Badge>
                  </CardHeader>
                  <CardContent className="p-0 flex-1 overflow-y-auto">
                    {(inventoryAlerts.low_stock_alerts || []).length > 0 ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-white/5 bg-white/[0.01]">
                              <th className="text-left py-3.5 px-6 font-semibold text-muted-foreground">Product Name</th>
                              <th className="text-center py-3.5 px-6 font-semibold text-muted-foreground">Current Stock</th>
                              <th className="text-center py-3.5 px-6 font-semibold text-muted-foreground">Reorder Threshold</th>
                              <th className="text-right py-3.5 px-6 font-semibold text-muted-foreground">Status Badge</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5">
                            {(inventoryAlerts.low_stock_alerts || []).map((item, idx) => (
                              <tr key={idx} className="hover:bg-white/[0.01] transition-colors">
                                <td className="py-3 px-6 font-medium text-foreground">{item.product_name}</td>
                                <td className="py-3 px-6 text-center font-mono font-bold text-rose-400">{item.available_quantity}</td>
                                <td className="py-3 px-6 text-center font-mono text-muted-foreground">{item.threshold}</td>
                                <td className="py-3 px-6 text-right">
                                  <Badge className="bg-rose-500/15 text-rose-400 border border-rose-500/30">
                                    {item.available_quantity === 0 ? "Out of Stock" : "Restock Needed"}
                                  </Badge>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-6 gap-2">
                        <CheckCircle2 className="w-8 h-8 text-emerald-500 opacity-60" />
                        <p className="text-sm">All products maintain safe inventory thresholds</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          ) : (
            <div className="text-center py-10 text-muted-foreground text-sm">
              Failed to load inventory alerts dataset.
            </div>
          )}
        </div>
      )}

      {/* TAB 3: SOURCING PRICE AUDITOR */}
      {activeTab === "sourcing" && (
        <div className="space-y-6">
          <Card className="glass border-white/5 shadow-md overflow-visible">
            <CardHeader className="border-b border-white/5 bg-white/[0.01] px-6 py-4">
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                <Search className="w-5 h-5 text-primary" />
                Historical Sourcing Price Lookup
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <form onSubmit={handleSourcingSearch} className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    ref={sourcingInputRef}
                    placeholder="Enter Medicine Name (e.g. Paracetamol)..."
                    value={sourcingSearch}
                    onChange={(e) => {
                      setSourcingSearch(e.target.value);
                      setShowSuggestions(true);
                      setHighlightedSuggestionIndex(-1);
                    }}
                    onFocus={() => setShowSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                    onKeyDown={(e) => {
                      if (!showSuggestions || sourcingSuggestions.length === 0) return;
                      if (e.key === "ArrowDown") {
                        e.preventDefault();
                        setHighlightedSuggestionIndex((prev) =>
                          prev < sourcingSuggestions.length - 1 ? prev + 1 : prev
                        );
                      } else if (e.key === "ArrowUp") {
                        e.preventDefault();
                        setHighlightedSuggestionIndex((prev) => (prev > -1 ? prev - 1 : prev));
                      } else if (e.key === "Enter") {
                        if (highlightedSuggestionIndex >= 0 && highlightedSuggestionIndex < sourcingSuggestions.length) {
                          e.preventDefault();
                          handleSuggestionClick(sourcingSuggestions[highlightedSuggestionIndex].name);
                          setHighlightedSuggestionIndex(-1);
                        }
                      } else if (e.key === "Escape") {
                        setShowSuggestions(false);
                        setHighlightedSuggestionIndex(-1);
                      }
                    }}
                    className="pl-9 bg-background/50 border-white/10 focus:border-primary/50 focus:ring-primary/20"
                  />
                  {/* Medicine Autocomplete Suggestions Dropdown */}
                  {showSuggestions && sourcingSuggestions.length > 0 && createPortal(
                    <div
                      data-suggestions-dropdown="true"
                      className="bg-card/95 backdrop-blur-xl border border-border/80 rounded-xl shadow-2xl overflow-y-auto divide-y divide-white/5 z-[99999]"
                      style={{
                        position: "fixed",
                        top: dropdownPosition.top,
                        left: dropdownPosition.left,
                        width: dropdownPosition.width || 350,
                        maxHeight: "300px",
                        overscrollBehavior: "contain",
                        WebkitOverflowScrolling: "touch",
                      }}
                    >
                      {sourcingSuggestions.map((med, idx) => (
                        <div
                          key={idx}
                          className={`p-3 cursor-pointer border-b border-white/5 last:border-0 text-sm transition-colors ${
                            highlightedSuggestionIndex === idx
                              ? "bg-primary/20"
                              : "hover:bg-primary/10"
                          }`}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            handleSuggestionClick(med.name);
                            setHighlightedSuggestionIndex(-1);
                          }}
                          onMouseEnter={() => setHighlightedSuggestionIndex(idx)}
                        >
                          {/* Header: Name + Source Badge */}
                          <div className="flex items-center justify-between mb-1">
                            <div className="font-medium text-sm flex items-center gap-2 flex-wrap">
                              {med.name}
                              {med.source === "inventory" ? (
                                <span className="text-[10px] px-1.5 py-0.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-full font-medium">
                                  Inventory
                                </span>
                              ) : (
                                <span className="text-[10px] px-1.5 py-0.5 bg-muted text-muted-foreground border border-white/5 rounded-full font-medium">
                                  Not in Inventory
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Manufacturer & Composition */}
                          <div className="text-xs text-muted-foreground">
                            <span>{med.manufacturer || med.manufacturer_name}</span>
                            {(med.salt_composition || med.short_composition1) && (
                              <span className="ml-2 text-primary/70">
                                (
                                {(
                                  med.salt_composition ||
                                  med.short_composition1
                                )?.slice(0, 35)}
                                ...)
                              </span>
                            )}
                          </div>

                          {/* Inventory-Specific Info */}
                          {med.source === "inventory" && (
                            <div className="mt-2 flex items-center gap-2 flex-wrap text-xs">
                              <span
                                className={`px-2 py-0.5 rounded font-medium ${
                                  med.stock_status === "In Stock"
                                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                    : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                                }`}
                              >
                                {med.stock_status}: {med.available_quantity || 0} units
                              </span>
                              {med.batch_no && (
                                <span className="text-muted-foreground">
                                  Batch: {med.batch_no}
                                </span>
                              )}
                              {med.expiry_date && (
                                <span
                                  className={`${
                                    new Date(med.expiry_date) <
                                    new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
                                      ? "text-orange-400 font-medium"
                                      : "text-muted-foreground"
                                  }`}
                                >
                                  Exp: {med.expiry_date}
                                  {new Date(med.expiry_date) < new Date() && " ⚠️ Expired"}
                                </span>
                              )}
                            </div>
                          )}

                          {/* Pricing Info Row */}
                          <div className="mt-2 flex items-center gap-3 text-xs">
                            {med.source === "inventory" ? (
                              <>
                                <span className="font-mono font-medium text-primary">
                                  Purchase: ₹{Number(med.purchase_price || 0).toFixed(2)}/unit
                                </span>
                                <span className="font-mono text-muted-foreground">
                                  MRP: ₹{Number(med.mrp_per_unit || med.mrp || 0).toFixed(2)}
                                </span>
                                {med.supplier_name && (
                                  <span className="text-blue-400">
                                    Last: {med.supplier_name}
                                  </span>
                                )}
                              </>
                            ) : (
                              <span className="font-mono font-medium text-primary">
                                MRP: ₹{med["price(₹)"] || 0} • {med.pack_size_label || "N/A"}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>,
                    document.body
                  )}
                </div>
                <div>
                  <Input
                    placeholder="Offered Purchase Price (Optional)..."
                    type="number"
                    step="0.01"
                    value={sourcingComparePrice}
                    onChange={(e) => setSourcingComparePrice(e.target.value)}
                    className="bg-background/50 border-white/10 focus:border-primary/50 focus:ring-primary/20"
                  />
                </div>
                <Button type="submit" disabled={loadingSourcing} className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold">
                  {loadingSourcing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin mr-2"></div>
                      Auditing Prices...
                    </>
                  ) : (
                    "Analyze Sourcing History"
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          {sourcingResults ? (
            <div className="space-y-6 animate-fade-in">
              {/* Sourcing Summary Metric Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="stat-card bg-gradient-to-br from-emerald-500/5 to-transparent">
                  <CardContent className="p-6 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Cheapest Historical Rate</p>
                      <p className="text-2xl font-bold font-mono text-emerald-400">
                        {sourcingResults.cheapest_historical_price
                          ? formatCurrency(sourcingResults.cheapest_historical_price)
                          : "N/A"}
                      </p>
                    </div>
                    <div className="p-3 bg-emerald-500/10 rounded-xl">
                      <TrendingDown className="w-6 h-6 text-emerald-400" />
                    </div>
                  </CardContent>
                </Card>

                <Card className="stat-card bg-gradient-to-br from-blue-500/5 to-transparent">
                  <CardContent className="p-6 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Matched Product Name</p>
                      <p className="text-lg font-bold truncate max-w-[200px]" title={sourcingResults.matched_product_name || sourcingResults.searched_product_name}>
                        {sourcingResults.matched_product_name || sourcingResults.searched_product_name}
                      </p>
                    </div>
                    <div className="p-3 bg-blue-500/10 rounded-xl">
                      <Package className="w-6 h-6 text-blue-400" />
                    </div>
                  </CardContent>
                </Card>

                <Card className="stat-card bg-gradient-to-br from-purple-500/5 to-transparent">
                  <CardContent className="p-6 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Total Purchases Logs</p>
                      <p className="text-2xl font-bold font-mono text-purple-400">
                        {(sourcingResults.all_historical_prices || []).length}
                      </p>
                    </div>
                    <div className="p-3 bg-purple-500/10 rounded-xl">
                      <History className="w-6 h-6 text-purple-400" />
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Deal Comparison Alert Banner */}
              {sourcingComparePrice && (
                <div className={`p-4 rounded-xl border flex items-start gap-3 backdrop-blur-sm ${
                  sourcingResults.is_higher_than_history
                    ? "bg-rose-500/10 border-rose-500/20 text-rose-400"
                    : "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                }`}>
                  <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-sm">
                      {sourcingResults.is_higher_than_history ? "High Sourcing Surcharge Warning" : "Optimal Purchase Deal Verified"}
                    </h4>
                    <p className="text-xs mt-0.5 opacity-90 leading-relaxed">
                      {sourcingResults.is_higher_than_history
                        ? `The offered rate of ${formatCurrency(parseFloat(sourcingComparePrice))} is ${formatCurrency(sourcingResults.price_difference)} HIGHER (${(sourcingResults.price_difference / sourcingResults.cheapest_historical_price * 100).toFixed(1)}% premium) than your cheapest historical purchase price of ${formatCurrency(sourcingResults.cheapest_historical_price)}. Suggest negotiating or buying from the cheaper alternatives listed below.`
                        : `Excellent pricing! The offered price of ${formatCurrency(parseFloat(sourcingComparePrice))} matches or beats the cheapest historical sourcing rate of ${formatCurrency(sourcingResults.cheapest_historical_price || 0)}.`
                      }
                    </p>
                  </div>
                </div>
              )}

              {/* Graph of Pricing Timeline */}
              {(sourcingResults.all_historical_prices || []).length > 1 && (
                <Card className="glass border-white/5 overflow-hidden">
                  <CardHeader className="border-b border-white/5 bg-white/[0.01] px-6 py-4">
                    <CardTitle className="text-base font-bold flex items-center gap-2">
                      <Activity className="w-4 h-4 text-primary" />
                      Sourcing Price Log Timeline
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-6">
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                          data={[...(sourcingResults.all_historical_prices || [])].reverse()}
                        >
                          <defs>
                            <linearGradient id="priceLineGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.01}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.2} />
                          <XAxis
                            dataKey="purchase_date"
                            stroke="hsl(var(--muted-foreground))"
                            tick={{ fontSize: 10 }}
                            tickFormatter={(val) => {
                              if (!val) return "";
                              const d = new Date(val);
                              return isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-IN", {month: "short", day: "numeric"});
                            }}
                          />
                          <YAxis
                            stroke="hsl(var(--muted-foreground))"
                            tick={{ fontSize: 10 }}
                            tickFormatter={(val) => typeof val === 'number' ? `₹${val}` : ""}
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "hsl(var(--card))",
                              border: "1px solid hsl(var(--border))",
                              borderRadius: "12px",
                            }}
                            formatter={(value) => [<span className="font-mono font-bold text-primary">{formatCurrency(value)}</span>, "Pack Price"]}
                          />
                          <Area
                            type="monotone"
                            dataKey="pack_price"
                            stroke="hsl(var(--primary))"
                            strokeWidth={2}
                            fillOpacity={1}
                            fill="url(#priceLineGradient)"
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Supplier Sourcing Log Table */}
              <Card className="glass border-white/5 overflow-hidden">
                <CardHeader className="border-b border-white/5 bg-white/[0.01] px-6 py-4">
                  <CardTitle className="text-base font-bold flex items-center gap-2">
                    <History className="w-4 h-4 text-muted-foreground" />
                    Supplier Pricing Ledgers
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {(sourcingResults.all_historical_prices || []).length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-white/5 bg-white/[0.01]">
                            <th className="text-left py-3 px-6 font-semibold text-muted-foreground">Purchase Date</th>
                            <th className="text-left py-3 px-6 font-semibold text-muted-foreground">Supplier</th>
                            <th className="text-center py-3 px-6 font-semibold text-muted-foreground">Invoice / Batch No</th>
                            <th className="text-right py-3 px-6 font-semibold text-muted-foreground">Pack Price</th>
                            <th className="text-center py-3 px-6 font-semibold text-muted-foreground">Units/Pack</th>
                            <th className="text-right py-3 px-6 font-semibold text-muted-foreground">Unit Cost</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {(sourcingResults.all_historical_prices || []).map((log, idx) => (
                            <tr key={idx} className="hover:bg-white/[0.01] transition-colors">
                              <td className="py-3 px-6 text-muted-foreground font-mono">
                                {log.purchase_date ? new Date(log.purchase_date).toLocaleDateString("en-IN", {
                                  year: "numeric",
                                  month: "short",
                                  day: "numeric",
                                }) : "N/A"}
                              </td>
                              <td className="py-3 px-6 font-medium text-foreground">{log.supplier_name}</td>
                              <td className="py-3 px-6 text-center text-xs font-mono text-muted-foreground">
                                <div>Inv: {log.invoice_no || "N/A"}</div>
                                <div>Batch: {log.batch_no || "N/A"}</div>
                              </td>
                              <td className="py-3 px-6 text-right font-mono font-bold text-foreground">
                                {formatCurrency(log.pack_price)}
                              </td>
                              <td className="py-3 px-6 text-center font-mono text-muted-foreground">
                                {log.units_per_pack || 1}
                              </td>
                              <td className="py-3 px-6 text-right font-mono text-emerald-400 font-semibold">
                                {formatCurrency(log.price_per_unit)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="p-8 text-center text-muted-foreground">No historical record found for this product.</div>
                  )}
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card className="glass border-white/5 p-12 text-center text-muted-foreground shadow-inner flex flex-col items-center gap-3">
              <Sparkles className="w-10 h-10 opacity-30 text-primary animate-pulse" />
              <div className="space-y-1">
                <p className="font-semibold text-sm text-foreground">Awaiting Product Analysis</p>
                <p className="text-xs">Type a medicine product name above to compare pricing records across suppliers.</p>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* TAB 4: DEBT & CREDIT RISKS */}
      {activeTab === "dues" && (
        <div className="space-y-6">
          {loadingDebtDues ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
              <p className="text-muted-foreground text-sm">Calculating outstanding accounts receivables and payables...</p>
            </div>
          ) : (
            <div className="space-y-6 animate-fade-in">
              {/* Summary Dashboard Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="stat-card bg-gradient-to-br from-amber-500/10 to-transparent border-amber-500/20">
                  <CardContent className="p-6 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-1">Customer Receivables (Outstanding)</p>
                      <p className="text-3xl font-extrabold font-mono text-amber-500">
                        {formatCurrency(totalCustomerDebt)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">Pending payments from customer credit books</p>
                    </div>
                    <div className="p-4 bg-amber-500/10 rounded-2xl">
                      <TrendingUp className="w-8 h-8 text-amber-500" />
                    </div>
                  </CardContent>
                </Card>

                <Card className="stat-card bg-gradient-to-br from-rose-500/10 to-transparent border-rose-500/20">
                  <CardContent className="p-6 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-rose-400 uppercase tracking-wider mb-1">Supplier Liabilities (Payables)</p>
                      <p className="text-3xl font-extrabold font-mono text-rose-500">
                        {formatCurrency(totalSupplierLiabilities)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">Owed invoices for supplier sourcing purchase bills</p>
                    </div>
                    <div className="p-4 bg-rose-500/10 rounded-2xl">
                      <TrendingDown className="w-8 h-8 text-rose-500" />
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Details Tables Side-By-Side */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Outstanding Customers List */}
                <Card className="glass border-white/5 overflow-hidden shadow-lg h-[450px] flex flex-col">
                  <CardHeader className="border-b border-white/5 bg-amber-500/[0.02] px-6 py-4 flex flex-row items-center justify-between">
                    <CardTitle className="text-base font-bold text-amber-400 flex items-center gap-2">
                      <Users className="w-4 h-4 text-amber-500" />
                      Pending Customer Ledger Debt
                    </CardTitle>
                    <Badge className="font-mono bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      {debtCustomers.length} Accounts
                    </Badge>
                  </CardHeader>
                  <CardContent className="p-0 flex-1 overflow-y-auto">
                    {debtCustomers.length > 0 ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-white/5 bg-white/[0.01]">
                              <th className="text-left py-3 px-6 font-semibold text-muted-foreground">Customer</th>
                              <th className="text-left py-3 px-6 font-semibold text-muted-foreground">Contact</th>
                              <th className="text-right py-3 px-6 font-semibold text-muted-foreground">Total Debt</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5">
                            {debtCustomers.map((customer, idx) => (
                              <tr key={idx} className="hover:bg-white/[0.01] transition-colors">
                                <td className="py-3 px-6 font-medium text-foreground">{customer.name}</td>
                                <td className="py-3 px-6 font-mono text-muted-foreground">{customer.mobile || "N/A"}</td>
                                <td className="py-3 px-6 text-right font-mono font-bold text-amber-400">
                                  {formatCurrency(customer.total_debt)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-6 gap-2">
                        <CheckCircle2 className="w-8 h-8 text-emerald-500 opacity-60" />
                        <p className="text-sm">No customers have outstanding credit book debts</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Outstanding Suppliers List */}
                <Card className="glass border-white/5 overflow-hidden shadow-lg h-[450px] flex flex-col">
                  <CardHeader className="border-b border-white/5 bg-rose-500/[0.02] px-6 py-4 flex flex-row items-center justify-between">
                    <CardTitle className="text-base font-bold text-rose-400 flex items-center gap-2">
                      <Truck className="w-4 h-4 text-rose-500" />
                      Pending Supplier Account Payables
                    </CardTitle>
                    <Badge className="font-mono bg-rose-500/10 text-rose-400 border border-rose-500/20">
                      {dueSuppliers.length} Payables
                    </Badge>
                  </CardHeader>
                  <CardContent className="p-0 flex-1 overflow-y-auto">
                    {dueSuppliers.length > 0 ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-white/5 bg-white/[0.01]">
                              <th className="text-left py-3 px-6 font-semibold text-muted-foreground">Supplier</th>
                              <th className="text-left py-3 px-6 font-semibold text-muted-foreground">GST No / Contact</th>
                              <th className="text-right py-3 px-6 font-semibold text-muted-foreground">Owed Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5">
                            {dueSuppliers.map((supplier, idx) => (
                              <tr key={idx} className="hover:bg-white/[0.01] transition-colors">
                                <td className="py-3 px-6 font-medium text-foreground">{supplier.name}</td>
                                <td className="py-3 px-6 text-xs text-muted-foreground font-mono">
                                  <div>GST: {supplier.gst_no || "N/A"}</div>
                                  <div>Tel: {supplier.contact || "N/A"}</div>
                                </td>
                                <td className="py-3 px-6 text-right font-mono font-bold text-rose-500">
                                  {formatCurrency(supplier.total_amount_owed)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-6 gap-2">
                        <CheckCircle2 className="w-8 h-8 text-emerald-500 opacity-60" />
                        <p className="text-sm">All supplier accounts settled. Zero liabilities.</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
