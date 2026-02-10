import { useState, useEffect } from "react";
import axios from "axios";
import { API } from "../App";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { BarChart3, TrendingUp, TrendingDown, IndianRupee, Calendar } from "lucide-react";
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
} from "recharts";
import { toast } from "sonner";

const COLORS = ["#10B981", "#8B5CF6", "#3B82F6", "#F59E0B", "#EF4444"];

export default function ReportsPage() {
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState("30");
  const [salesTrend, setSalesTrend] = useState([]);
  const [topProducts, setTopProducts] = useState([]);
  const [supplierAnalysis, setSupplierAnalysis] = useState([]);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    fetchReports();
  }, [days]);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const [trendRes, productsRes, supplierRes, statsRes] = await Promise.all([
        axios.get(`${API}/dashboard/sales-trend?days=${days}`),
        axios.get(`${API}/dashboard/top-products?limit=10`),
        axios.get(`${API}/dashboard/supplier-analysis`),
        axios.get(`${API}/dashboard/stats`),
      ]);

      setSalesTrend(trendRes.data.trend);
      setTopProducts(productsRes.data.top_products);
      setSupplierAnalysis(supplierRes.data.supplier_analysis);
      setStats(statsRes.data);
    } catch (error) {
      toast.error("Failed to load reports");
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value) => `₹${(value || 0).toLocaleString("en-IN")}`;

  // Calculate totals from trend data
  const totalRevenue = salesTrend.reduce((sum, d) => sum + d.revenue, 0);
  const totalProfit = salesTrend.reduce((sum, d) => sum + d.profit, 0);
  const totalOrders = salesTrend.reduce((sum, d) => sum + d.orders, 0);
  const profitMargin = totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(1) : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in" data-testid="reports-page">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Reports & Analytics</h1>
          <p className="text-muted-foreground">Track your pharmacy performance</p>
        </div>

        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-muted-foreground" />
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-40" data-testid="days-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
              <SelectItem value="365">Last year</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="stat-card">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Total Revenue</p>
                <p className="text-2xl font-bold font-mono text-primary">{formatCurrency(totalRevenue)}</p>
              </div>
              <IndianRupee className="w-8 h-8 text-primary/30" />
            </div>
          </CardContent>
        </Card>

        <Card className="stat-card">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Total Profit</p>
                <p className={`text-2xl font-bold font-mono ${totalProfit >= 0 ? "text-primary" : "text-destructive"}`}>
                  {formatCurrency(totalProfit)}
                </p>
              </div>
              {totalProfit >= 0 ? (
                <TrendingUp className="w-8 h-8 text-primary/30" />
              ) : (
                <TrendingDown className="w-8 h-8 text-destructive/30" />
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="stat-card">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Total Orders</p>
                <p className="text-2xl font-bold font-mono">{totalOrders}</p>
              </div>
              <BarChart3 className="w-8 h-8 text-accent/30" />
            </div>
          </CardContent>
        </Card>

        <Card className="stat-card">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Profit Margin</p>
                <p className={`text-2xl font-bold font-mono ${profitMargin >= 0 ? "text-primary" : "text-destructive"}`}>
                  {profitMargin}%
                </p>
              </div>
              <TrendingUp className="w-8 h-8 text-primary/30" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Revenue & Profit Chart */}
      <Card className="bg-card/50 backdrop-blur-sm border-white/5">
        <CardHeader>
          <CardTitle className="text-lg">Revenue & Profit Trend</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-80">
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
                  formatter={(value, name) => [`₹${value.toLocaleString("en-IN")}`, name === "revenue" ? "Revenue" : "Profit"]}
                />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={false}
                  name="revenue"
                />
                <Line
                  type="monotone"
                  dataKey="profit"
                  stroke="hsl(var(--accent))"
                  strokeWidth={2}
                  dot={false}
                  name="profit"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Bottom Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Products */}
        <Card className="bg-card/50 backdrop-blur-sm border-white/5">
          <CardHeader>
            <CardTitle className="text-lg">Top Selling Products</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-80">
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
                    width={120}
                    tickFormatter={(value) => value.slice(0, 18)}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                    formatter={(value) => [`₹${value.toLocaleString("en-IN")}`, "Revenue"]}
                  />
                  <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Supplier Distribution */}
        <Card className="bg-card/50 backdrop-blur-sm border-white/5">
          <CardHeader>
            <CardTitle className="text-lg">Supplier Purchase Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {supplierAnalysis.length > 0 ? (
              <div className="h-80 flex items-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={supplierAnalysis.slice(0, 5)}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="amount"
                      nameKey="name"
                      label={({ name, percent }) => `${name.slice(0, 10)} (${(percent * 100).toFixed(0)}%)`}
                      labelLine={{ stroke: "hsl(var(--muted-foreground))" }}
                    >
                      {supplierAnalysis.slice(0, 5).map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                      }}
                      formatter={(value) => [`₹${value.toLocaleString("en-IN")}`, "Purchases"]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-80 flex items-center justify-center text-muted-foreground">
                No supplier data available
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Supplier Table */}
      {supplierAnalysis.length > 0 && (
        <Card className="bg-card/50 backdrop-blur-sm border-white/5">
          <CardHeader>
            <CardTitle className="text-lg">Supplier Analysis</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/5">
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Supplier</th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">Purchases</th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">Total Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {supplierAnalysis.map((supplier, index) => (
                    <tr key={index} className="border-b border-white/5 last:border-0">
                      <td className="py-3 px-4 font-medium">{supplier.name}</td>
                      <td className="py-3 px-4 text-right font-mono">{supplier.purchases}</td>
                      <td className="py-3 px-4 text-right font-mono text-primary">
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
  );
}
