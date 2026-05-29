import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import axios from "axios";
import { API } from "../App";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import {
  Search,
  Users,
  Phone,
  Mail,
  Receipt,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  CreditCard,
  ShieldCheck,
  Loader2,
  ExternalLink
} from "lucide-react";
import { toast } from "sonner";

export default function CustomersPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const isInitialMount = useRef(true);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerBills, setCustomerBills] = useState([]);
  const [detailsOpen, setDetailsOpen] = useState(false);

  //debt states
  const [unpaidBills, setUnpaidBills] = useState([]);
  const [unpaidTotal, setUnpaidTotal] = useState(0);
  const [loadingUnpaid, setLoadingUnpaid] = useState(false);
  const [payBillDialog, setPayBillDialog] = useState({
    open: false,
    bill: null,
  });
  const [clearDebtDialog, setClearDebtDialog] = useState({
    open: false,
    customerId: null,
    amount: null,
  });
  const [processingPayment, setProcessingPayment] = useState(false);

  // Pagination State
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 30,
    total: 0,
    total_pages: 1,
  });
  const [sortBy, setSortBy] = useState("created_at");
  const [sortOrder, setSortOrder] = useState("desc");

  const handleViewCustomer = async (customer) => {
    setSelectedCustomer(customer);
    setDetailsOpen(true);

    try {
      const [billsRes, unpaidRes] = await Promise.all([
        axios.get(`${API}/customers/${customer.id}`),
        axios.get(`${API}/customers/${customer.id}/unpaid-bills`),
      ]);

      setCustomerBills(billsRes.data.bills || []);
      setUnpaidBills(unpaidRes.data.unpaid_bills || []);
      setUnpaidTotal(unpaidRes.data.total_debt || 0);
    } catch (error) {
      toast.error("Failed to load customer details");
    }
  };

  const fetchCustomers = useCallback(
    async (page = 1, highlightId = undefined) => {
      try {
        const params = new URLSearchParams();
        if (!highlightId) {
          params.append("page", page);
        }
        params.append("limit", pagination.limit);
        params.append("sort_by", sortBy);
        params.append("sort_order", sortOrder);
        if (search) params.append("search", search);
        if (highlightId) params.append("highlight_id", highlightId);

        const response = await axios.get(
          `${API}/customers?${params.toString()}`
        );
        setCustomers(response.data.customers);
        setPagination(response.data.pagination);

        if (highlightId) {
          setTimeout(() => {
            const target = response.data.customers.find((c) => c.id === highlightId);
            if (target) {
              handleViewCustomer(target);
            }
            const el = document.getElementById(`record-${highlightId}`);
            if (el) {
              el.scrollIntoView({ behavior: "smooth", block: "center" });
              el.classList.add("bg-primary/20", "transition-all", "duration-1000");
              setTimeout(() => {
                el.classList.remove("bg-primary/20");
              }, 3000);
            }
            window.history.replaceState({}, document.title);
          }, 300);
        }
      } catch (error) {
        toast.error("Failed to load customers");
      } finally {
        setLoading(false);
      }
    },
    [search, sortBy, sortOrder, pagination.limit]
  );

  useEffect(() => {
    const hlId = location.state?.highlightId;
    if (hlId) {
      fetchCustomers(1, hlId);
    } else {
      fetchCustomers(1);
    }
  }, []);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      if (location.state?.highlightId) {
        return;
      }
    }
    const debounce = setTimeout(() => {
      fetchCustomers(1);
    }, 300);
    return () => clearTimeout(debounce);
  }, [search, sortBy, sortOrder]);

  const handlePayBill = (bill) => {
    setPayBillDialog({
      open: true,
      bill,
    });
  };

  const confirmPayBill = async () => {
    if (!payBillDialog.bill) return;

    try {
      setProcessingPayment(true);

      await axios.post(`${API}/bills/${payBillDialog.bill.id}/mark-paid`);

      toast.success("Bill marked as paid");

      // Refresh unpaid bills
      const unpaidRes = await axios.get(
        `${API}/customers/${selectedCustomer.id}/unpaid-bills`
      );

      setUnpaidBills(unpaidRes.data.unpaid_bills || []);
      setUnpaidTotal(unpaidRes.data.total_debt || 0);

      // Refresh purchase history
      const billsRes = await axios.get(
        `${API}/customers/${selectedCustomer.id}`
      );
      setCustomerBills(billsRes.data.bills || []);

      // Update Outstanding Debt immediately
      setSelectedCustomer((prev) => ({
        ...prev,
        total_debt: unpaidRes.data.total_debt || 0,
      }));

      // Refresh table
      fetchCustomers(pagination.page);

      setPayBillDialog({ open: false, bill: null });
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to mark bill paid");
    } finally {
      setProcessingPayment(false);
    }
  };

  const handleSort = (field) => {
    const newOrder = sortBy === field && sortOrder === "desc" ? "asc" : "desc";
    setSortBy(field);
    setSortOrder(newOrder);
  };

  const handleClearDebt = (customerId, amount = null) => {
    setClearDebtDialog({ open: true, customerId, amount });
  };

  const confirmClearDebt = async () => {
    const { customerId, amount } = clearDebtDialog;
    if (!customerId) return;
    
    try {
      const params = amount ? `?amount=${amount}` : "";
      const response = await axios.post(
        `${API}/customers/${customerId}/clear-debt${params}`
      );
      toast.success(response.data.message);
      if (response.data.bills_marked_paid > 0) {
        toast.info(`${response.data.bills_marked_paid} bills marked as paid`);
      }
      // Refresh customer data
      fetchCustomers(pagination.page);
      if (selectedCustomer && selectedCustomer.id === customerId) {
        // Refresh details dialog data
        setSelectedCustomer((prev) => ({
          ...prev,
          total_debt: response.data.remaining_debt,
        }));
        const response2 = await axios.get(`${API}/customers/${customerId}`);
        setCustomerBills(response2.data.bills || []);
      }
      setClearDebtDialog({ open: false, customerId: null, amount: null });
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to clear debt");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  // Stats calculation for the current page
  const totalDebtOnPage = customers.reduce((sum, c) => sum + (c.total_debt || 0), 0);
  const topDebtor = customers.reduce((max, c) => {
    if ((c.total_debt || 0) > (max?.total_debt || 0)) return c;
    return max;
  }, null);

  return (
    <div className="space-y-6 animate-fade-in" data-testid="customers-page">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">Customers</h1>
          <p className="text-sm font-semibold text-muted-foreground">
            {pagination.total} registered customers in database
          </p>
        </div>
      </div>

      {/* Metrics Dashboard Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Total Customers */}
        <Card className="glass bg-card/45 border-border/70 shadow-md rounded-2xl relative overflow-hidden group hover:border-primary/30 transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-full blur-2xl transform translate-x-4 -translate-y-4"></div>
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center border border-primary/20 shrink-0">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Registered Customers</p>
              <h3 className="text-2xl font-black font-mono tracking-tight mt-1">{pagination.total}</h3>
            </div>
          </CardContent>
        </Card>

        {/* Outstanding Page Debt */}
        <Card className="glass bg-card/45 border-border/70 shadow-md rounded-2xl relative overflow-hidden group hover:border-yellow-500/30 transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-yellow-500/5 rounded-full blur-2xl transform translate-x-4 -translate-y-4"></div>
          <CardContent className="p-6 flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center border shrink-0 ${
              totalDebtOnPage > 0 
                ? "bg-yellow-500/10 text-yellow-500 border-yellow-500/20 shadow-lg shadow-yellow-500/10" 
                : "bg-green-500/10 text-green-500 border-green-500/20 shadow-lg shadow-green-500/10"
            }`}>
              <CreditCard className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Page Outstanding Debt</p>
              <h3 className={`text-2xl font-black font-mono tracking-tight mt-1 ${
                totalDebtOnPage > 0 ? "text-yellow-500" : "text-green-500"
              }`}>
                ₹{totalDebtOnPage.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </h3>
            </div>
          </CardContent>
        </Card>

        {/* Top Page Debtor */}
        <Card className="glass bg-card/45 border-border/70 shadow-md rounded-2xl relative overflow-hidden group hover:border-red-500/30 transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-red-500/5 rounded-full blur-2xl transform translate-x-4 -translate-y-4"></div>
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-red-500/10 text-red-500 flex items-center justify-center border border-red-500/20 shrink-0">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Top Page Debtor</p>
              {topDebtor && topDebtor.total_debt > 0 ? (
                <div className="mt-1 flex items-baseline gap-2 min-w-0">
                  <h3 className="text-lg font-black text-red-500 truncate shrink-0 max-w-[120px]" title={topDebtor.name}>{topDebtor.name}</h3>
                  <span className="text-sm font-mono font-bold text-red-400">
                    ₹{topDebtor.total_debt.toLocaleString("en-IN")}
                  </span>
                </div>
              ) : (
                <h3 className="text-lg font-bold text-muted-foreground mt-1">None</h3>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <Card className="glass bg-card/45 border border-border/70 shadow-md rounded-2xl overflow-hidden">
        <CardContent className="p-4">
          <div className="flex gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-muted-foreground/60" />
              <Input
                placeholder="Search customers by name, mobile or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 h-11 bg-background/30 border-border/60 focus-visible:ring-primary focus-visible:ring-offset-0 rounded-xl transition-all"
                data-testid="customer-search"
              />
            </div>
            {search && (
              <Button 
                variant="outline" 
                onClick={() => setSearch("")}
                className="h-11 px-4 border-border/80 rounded-xl hover:bg-muted font-bold transition-all"
              >
                Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Customer Details Dialog */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col p-0 border border-border/70 bg-background/95 backdrop-blur-xl rounded-2xl shadow-2xl w-11/12">
          <DialogHeader className="p-6 pb-4 border-b border-border/40 shrink-0">
            <DialogTitle className="text-xl font-bold">Customer Details</DialogTitle>
          </DialogHeader>

          {selectedCustomer && (
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Customer Info */}
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary/10 to-accent/10 border border-primary/20 flex items-center justify-center shrink-0">
                  <Users className="w-7 h-7 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-xl font-bold text-foreground truncate">
                    {selectedCustomer.name}
                  </h3>
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2 text-xs font-semibold text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-primary/70 shrink-0" />
                      {selectedCustomer.mobile}
                    </span>
                    {selectedCustomer.email && (
                      <span className="flex items-center gap-1.5">
                        <Mail className="w-3.5 h-3.5 text-primary/70 shrink-0" />
                        {selectedCustomer.email}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Stats Overview */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-primary/5 border border-primary/10">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                    Total Purchases
                  </p>
                  <p className="text-2xl font-black font-mono tracking-tight text-primary">
                    ₹
                    {selectedCustomer.total_purchases?.toLocaleString(
                      "en-IN"
                    ) || 0}
                  </p>
                </div>
                <div
                  className={`p-4 rounded-xl relative overflow-hidden transition-all ${
                    selectedCustomer.total_debt > 0
                      ? "bg-yellow-500/5 border border-yellow-500/20"
                      : "bg-muted/30 border border-border/40"
                  }`}
                >
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                    Outstanding Debt
                  </p>
                  <p
                    className={`text-2xl font-black font-mono tracking-tight ${
                      selectedCustomer.total_debt > 0 ? "text-yellow-500" : "text-muted-foreground/60"
                    }`}
                  >
                    ₹{selectedCustomer.total_debt?.toLocaleString("en-IN") || 0}
                  </p>
                  {selectedCustomer.total_debt > 0 && (
                    <Button
                      size="sm"
                      className="mt-3 w-full bg-yellow-500 hover:bg-yellow-600 text-black font-bold shadow-md h-8 text-xs flex items-center justify-center gap-1"
                      onClick={() => handleClearDebt(selectedCustomer.id)}
                      data-testid="clear-debt-btn"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" /> Clear Full Debt
                    </Button>
                  )}
                </div>
              </div>

              {/* Unpaid Bills */}
              {unpaidBills.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-yellow-500 flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4" /> Outstanding Bills ({unpaidBills.length})
                  </h4>

                  <div className="space-y-2">
                    {unpaidBills.map((bill) => (
                      <div
                        key={bill.id}
                        className="flex items-center justify-between p-3.5 rounded-xl bg-yellow-500/5 border border-yellow-500/10 hover:border-yellow-500/20 transition-all shadow-sm"
                      >
                        <div>
                          <p className="font-mono text-sm font-bold text-foreground">{bill.bill_no}</p>
                          <p className="text-xs text-muted-foreground font-semibold mt-0.5">
                            {new Date(
                              bill.billing_date || bill.created_at
                            ).toLocaleDateString()}
                          </p>
                        </div>

                        <div className="flex items-center gap-3">
                          <span className="font-mono text-yellow-500 font-black text-sm">
                            ₹
                            {(
                              bill.grand_total ||
                              bill.total_amount ||
                              0
                            ).toFixed(2)}
                          </span>

                          <Button
                            size="sm"
                            className="btn-primary h-8 font-bold text-xs"
                            onClick={() => handlePayBill(bill)}
                          >
                            Mark Paid
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Purchase History */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Receipt className="w-4 h-4" /> Purchase History
                </h4>
                {customerBills.length === 0 ? (
                  <div className="text-center py-8 rounded-xl bg-muted/10 border border-dashed border-border/60">
                    <Receipt className="w-8 h-8 mx-auto mb-2 opacity-30 text-muted-foreground" />
                    <p className="text-xs font-semibold text-muted-foreground">No purchase history found</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {customerBills.map((bill) => (
                      <div
                        key={bill.id}
                        className="flex items-center justify-between p-3 rounded-xl bg-muted/20 border border-border/40 hover:border-primary/20 transition-all"
                      >
                        <div>
                          <p className="font-mono text-xs font-bold text-foreground">{bill.bill_no}</p>
                          <p className="text-[10px] text-muted-foreground font-semibold">
                            {new Date(bill.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-mono font-bold text-primary text-sm">
                            ₹{bill.grand_total?.toFixed(2)}
                          </p>
                          {bill.is_paid ? (
                            <Badge className="bg-primary/10 text-primary border border-primary/20 text-[9px] font-bold uppercase tracking-wider rounded-full mt-0.5">
                              Paid
                            </Badge>
                          ) : (
                            <Badge className="bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 text-[9px] font-bold uppercase tracking-wider rounded-full mt-0.5">
                              Unpaid
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Customers Table */}
      <Card className="glass bg-card/45 border border-border/40 backdrop-blur-sm shadow-sm rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="border-b border-border/40 bg-muted/20">
              <TableRow className="hover:bg-transparent">
                <TableHead className="font-bold text-xs text-muted-foreground uppercase tracking-wider h-11">
                  <Button
                    variant="ghost"
                    onClick={() => handleSort("name")}
                    className="h-auto p-0 font-bold text-xs uppercase tracking-wider hover:bg-transparent hover:text-foreground text-muted-foreground flex items-center gap-1.5"
                  >
                    Customer
                    <ArrowUpDown className="h-3.5 w-3.5 text-primary" />
                  </Button>
                </TableHead>
                <TableHead className="font-bold text-xs text-muted-foreground uppercase tracking-wider h-11">Contact</TableHead>
                <TableHead className="font-bold text-xs text-muted-foreground uppercase tracking-wider h-11 text-right">
                  <Button
                    variant="ghost"
                    onClick={() => handleSort("total_purchases")}
                    className="h-auto p-0 font-bold text-xs uppercase tracking-wider hover:bg-transparent hover:text-foreground text-muted-foreground ml-auto flex items-center gap-1.5"
                  >
                    Total Purchases
                    <ArrowUpDown className="h-3.5 w-3.5 text-primary" />
                  </Button>
                </TableHead>
                <TableHead className="font-bold text-xs text-muted-foreground uppercase tracking-wider h-11 text-right">
                  <Button
                    variant="ghost"
                    onClick={() => handleSort("total_debt")}
                    className="h-auto p-0 font-bold text-xs uppercase tracking-wider hover:bg-transparent hover:text-foreground text-muted-foreground ml-auto flex items-center gap-1.5"
                  >
                    Outstanding
                    <ArrowUpDown className="h-3.5 w-3.5 text-primary" />
                  </Button>
                </TableHead>
                <TableHead className="font-bold text-xs text-muted-foreground uppercase tracking-wider h-11">Status</TableHead>
                <TableHead className="font-bold text-xs text-muted-foreground uppercase tracking-wider h-11 text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center py-12 text-muted-foreground"
                  >
                    <Users className="w-10 h-10 mx-auto mb-2 opacity-50 text-muted-foreground/60" />
                    <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground/60">No customers found</p>
                  </TableCell>
                </TableRow>
              ) : (
                customers.map((customer) => (
                  <TableRow
                    key={customer.id}
                    id={`record-${customer.id}`}
                    className="cursor-pointer hover:bg-muted/15 border-b border-border/40 transition-colors"
                    onClick={() => handleViewCustomer(customer)}
                    data-testid={`customer-row-${customer.id}`}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary/10 to-accent/10 border border-primary/20 flex items-center justify-center">
                          <span className="font-bold text-primary">
                            {customer.name ? customer.name.charAt(0).toUpperCase() : "?"}
                          </span>
                        </div>
                        <span className="font-bold text-foreground hover:text-primary transition-colors">{customer.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <p className="font-mono text-xs font-semibold text-foreground/80">{customer.mobile}</p>
                      {customer.email && (
                        <p className="text-xs text-muted-foreground truncate max-w-[200px]" title={customer.email}>
                          {customer.email}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold text-foreground/90">
                      ₹{customer.total_purchases?.toLocaleString("en-IN") || 0}
                    </TableCell>
                    <TableCell className="text-right">
                      {customer.total_debt > 0 ? (
                        <span className="font-mono font-bold text-yellow-500">
                          ₹{customer.total_debt?.toLocaleString("en-IN")}
                        </span>
                      ) : (
                        <span className="font-mono font-semibold text-muted-foreground/60">
                          ₹0
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {customer.total_debt > 0 ? (
                        <Badge className="bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 font-bold text-[10px] uppercase tracking-wider rounded-full">
                          <AlertCircle className="w-3 h-3 mr-1" />
                          Has Debt
                        </Badge>
                      ) : (
                        <Badge className="bg-primary/10 text-primary border border-primary/20 font-bold text-[10px] uppercase tracking-wider rounded-full">
                          Clear
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell
                      className="text-center"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex justify-center items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-primary/50 text-primary hover:bg-primary/5 h-8 font-semibold rounded-lg text-xs"
                          onClick={() => navigate(`/billing?customer_id=${customer.id}`)}
                        >
                          See Bills
                        </Button>
                        
                        {customer.total_debt > 0 && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-yellow-500/50 text-yellow-500 hover:bg-yellow-500/10 h-8 font-semibold rounded-lg text-xs"
                            onClick={() => handleClearDebt(customer.id)}
                            data-testid={`clear-debt-${customer.id}`}
                          >
                            Clear Debt
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        {pagination.total_pages > 1 && (
          <div className="flex flex-col sm:flex-row items-center justify-between px-6 py-4 border-t border-border/40 bg-muted/5 gap-4">
            <div className="text-xs font-bold text-muted-foreground/80">
              Showing {((pagination.page - 1) * pagination.limit) + 1} to{" "}
              {Math.min(pagination.page * pagination.limit, pagination.total)}{" "}
              of {pagination.total} customers
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchCustomers(pagination.page - 1)}
                disabled={pagination.page <= 1}
                className="h-8 text-xs font-bold border-border/80 hover:bg-muted rounded-lg"
              >
                <ChevronLeft className="h-3.5 w-3.5 mr-1 text-primary" />
                Previous
              </Button>

              <div className="flex items-center gap-1">
                {Array.from(
                  { length: Math.min(5, pagination.total_pages) },
                  (_, i) => {
                    const pageNum =
                      Math.max(
                        1,
                        Math.min(
                          pagination.total_pages - 4,
                          pagination.page - 2
                        )
                      ) + i;
                    if (pageNum > pagination.total_pages) return null;
                    return (
                      <Button
                        key={pageNum}
                        variant={
                          pageNum === pagination.page ? "default" : "outline"
                        }
                        size="sm"
                        onClick={() => fetchCustomers(pageNum)}
                        className={`w-8 h-8 p-0 text-xs font-bold rounded-lg border ${
                          pageNum === pagination.page
                            ? "bg-primary text-primary-foreground shadow-md shadow-primary/10 border-primary"
                            : "border-border/80 hover:bg-muted"
                        }`}
                      >
                        {pageNum}
                      </Button>
                    );
                  }
                )}
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchCustomers(pagination.page + 1)}
                disabled={pagination.page >= pagination.total_pages}
                className="h-8 text-xs font-bold border-border/80 hover:bg-muted rounded-lg"
              >
                Next
                <ChevronRight className="h-3.5 w-3.5 ml-1 text-primary" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* AlertDialog components */}
      <AlertDialog
        open={payBillDialog.open}
        onOpenChange={(open) =>
          setPayBillDialog({ open, bill: open ? payBillDialog.bill : null })
        }
      >
        <AlertDialogContent className="rounded-2xl max-w-sm border border-border bg-background p-6 shadow-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-bold">Mark Bill as Paid</AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-muted-foreground mt-2">
              {payBillDialog.bill && (
                <>
                  Mark bill <strong>{payBillDialog.bill.bill_no}</strong> as
                  paid?
                  <br />
                  Amount: ₹
                  {(
                    payBillDialog.bill.grand_total ||
                    payBillDialog.bill.total_amount ||
                    0
                  ).toFixed(2)}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter className="mt-4 flex gap-2">
            <AlertDialogCancel className="h-10 rounded-xl border border-border hover:bg-muted font-semibold">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmPayBill}
              className="h-10 rounded-xl btn-primary font-semibold shadow-md"
              disabled={processingPayment}
            >
              {processingPayment ? "Processing..." : "Mark Paid"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={clearDebtDialog.open}
        onOpenChange={(open) =>
          setClearDebtDialog({ ...clearDebtDialog, open })
        }
      >
        <AlertDialogContent className="rounded-2xl max-w-sm border border-border bg-background p-6 shadow-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-bold">Clear Debt</AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-muted-foreground mt-2">
              Are you sure you want to clear {clearDebtDialog.amount ? `Rs. ${clearDebtDialog.amount.toFixed(2)}` : "all outstanding"} debt for this customer?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4 flex gap-2">
            <AlertDialogCancel className="h-10 rounded-xl border border-border hover:bg-muted font-semibold">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmClearDebt} className="h-10 rounded-xl btn-primary font-semibold shadow-md">
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
