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
  ExternalLink,
  Bell,
  RotateCcw,
  Plus,
  Trash2,
  CheckCircle2,
  MessageCircle,
  Calendar,
  Clock,
  Check,
  Send,
  AlertTriangle,
  Save,
  Pill,
  Package,
} from "lucide-react";
import { toast } from "sonner";
import Loader from "../components/Loader";
import { openWhatsApp } from "../utils/whatsapp";

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

  // Refill Reminders State
  const [customerReminders, setCustomerReminders] = useState([]);
  const [loadingReminders, setLoadingReminders] = useState(false);
  const [activeDetailTab, setActiveDetailTab] = useState("reminders");
  const [addReminderDialog, setAddReminderDialog] = useState({
    open: false,
    medicineName: "",
    quantity: 1,
    daysSupply: 30,
    remindBefore: 5,
    refillTargetDate: "",
    reminderDate: "",
    notes: "",
  });
  const [actionLoading, setActionLoading] = useState({});

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

  const computeReminderDates = (daysSupply = 30, remindBefore = 5, baseDate = new Date()) => {
    try {
      const base = new Date(baseDate);
      const target = new Date(base);
      target.setDate(target.getDate() + parseInt(daysSupply || 30));
      const targetDate = target.toISOString().slice(0, 10);

      const reminder = new Date(target);
      reminder.setDate(reminder.getDate() - parseInt(remindBefore || 5));
      const reminderDate = reminder.toISOString().slice(0, 10);

      return { targetDate, reminderDate };
    } catch (e) {
      return { targetDate: "", reminderDate: "" };
    }
  };

  const handleViewCustomer = async (customer) => {
    setSelectedCustomer(customer);
    setDetailsOpen(true);
    setActiveDetailTab("reminders");
    setLoadingReminders(true);

    try {
      const [billsRes, unpaidRes, remindersRes] = await Promise.all([
        axios.get(`${API}/customers/${customer.id}`),
        axios.get(`${API}/customers/${customer.id}/unpaid-bills`),
        axios.get(`${API}/reminders?customer_id=${customer.id}`).catch(() => ({ data: { reminders: [] } })),
      ]);

      setCustomerBills(billsRes.data.bills || []);
      setUnpaidBills(unpaidRes.data.unpaid_bills || []);
      setUnpaidTotal(unpaidRes.data.total_debt || 0);
      setCustomerReminders(remindersRes.data.reminders || []);
    } catch (error) {
      toast.error("Failed to load customer details");
    } finally {
      setLoadingReminders(false);
    }
  };

  const handleToggleReminder = async (reminderId) => {
    try {
      setActionLoading((prev) => ({ ...prev, [reminderId]: true }));
      const res = await axios.put(`${API}/reminders/${reminderId}/toggle`);
      setCustomerReminders((prev) =>
        prev.map((r) => (r.id === reminderId ? { ...r, is_active: res.data.is_active } : r))
      );
      toast.success(res.data.message || "Reminder updated");
    } catch (err) {
      toast.error("Failed to toggle reminder status");
    } finally {
      setActionLoading((prev) => ({ ...prev, [reminderId]: false }));
    }
  };

  const handleCompleteReminder = async (reminderId) => {
    try {
      setActionLoading((prev) => ({ ...prev, [reminderId]: true }));
      await axios.post(`${API}/reminders/${reminderId}/complete`);
      setCustomerReminders((prev) =>
        prev.map((r) => (r.id === reminderId ? { ...r, status: "COMPLETED", is_active: false } : r))
      );
      toast.success("Reminder marked as completed");
    } catch (err) {
      toast.error("Failed to complete reminder");
    } finally {
      setActionLoading((prev) => ({ ...prev, [reminderId]: false }));
    }
  };

  const handleDeleteReminder = async (reminderId) => {
    try {
      setActionLoading((prev) => ({ ...prev, [reminderId]: true }));
      await axios.delete(`${API}/reminders/${reminderId}`);
      setCustomerReminders((prev) => prev.filter((r) => r.id !== reminderId));
      toast.success("Reminder deleted");
    } catch (err) {
      toast.error("Failed to delete reminder");
    } finally {
      setActionLoading((prev) => ({ ...prev, [reminderId]: false }));
    }
  };

  const handleSendWhatsApp = (reminder) => {
    if (!selectedCustomer?.mobile) {
      toast.error("Customer mobile number not available");
      return;
    }
    const medNames = (reminder.items || []).map((i) => `${i.product_name}${i.quantity ? ` (${i.quantity} units)` : ""}`).join(", ") || "medicines";
    const msg = `Hello ${selectedCustomer.name},\n\nThis is a friendly restock reminder from our pharmacy regarding your medicines:\n*${medNames}*\n\nYour expected refill date is *${reminder.refill_target_date}*.\n\nPlease visit us or reply to have your prescription order packed and ready.\n\nThank you!`;
    openWhatsApp({
      phone: selectedCustomer.mobile,
      message: msg,
    });
  };

  const handleCreateCustomReminder = async () => {
    if (!addReminderDialog.medicineName.trim()) {
      toast.error("Please enter medicine name");
      return;
    }
    try {
      const dates = computeReminderDates(addReminderDialog.daysSupply, addReminderDialog.remindBefore);
      const targetDate = addReminderDialog.refillTargetDate || dates.targetDate;
      const reminderDate = addReminderDialog.reminderDate || dates.reminderDate;

      const payload = {
        customer_id: selectedCustomer.id,
        customer_name: selectedCustomer.name,
        customer_mobile: selectedCustomer.mobile,
        items: [
          {
            product_name: addReminderDialog.medicineName.trim(),
            quantity: parseInt(addReminderDialog.quantity) || 1,
            days_supply: parseInt(addReminderDialog.daysSupply) || 30,
          },
        ],
        refill_target_date: targetDate,
        reminder_date: reminderDate,
        notes: addReminderDialog.notes || `Refill reminder for ${selectedCustomer.name}`,
      };

      const res = await axios.post(`${API}/reminders`, payload);
      setCustomerReminders((prev) => [res.data.reminder, ...prev]);
      toast.success("Refill reminder created successfully");
      setAddReminderDialog({
        open: false,
        medicineName: "",
        quantity: 1,
        daysSupply: 30,
        remindBefore: 5,
        refillTargetDate: "",
        reminderDate: "",
        notes: "",
      });
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to create reminder");
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
    return <Loader size="lg" text="Loading Customers Directory..." />;
  }

  // Stats calculation for the current page
  const totalDebtOnPage = customers.reduce((sum, c) => sum + (c.total_debt || 0), 0);
  const totalAdvanceOnPage = customers.reduce((sum, c) => sum + (c.total_advance || 0), 0);
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
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mobile-stat-grid">
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

        {/* Total Page Advance */}
        <Card className="glass bg-card/45 border-border/70 shadow-md rounded-2xl relative overflow-hidden group hover:border-emerald-500/30 transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl transform translate-x-4 -translate-y-4"></div>
          <CardContent className="p-6 flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center border shrink-0 ${
              totalAdvanceOnPage > 0 
                ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20 shadow-lg shadow-emerald-500/10" 
                : "bg-muted/10 text-muted-foreground border-border/20 shadow-lg"
            }`}>
              <CreditCard className="w-6 h-6 text-emerald-500" />
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Page Total Advance</p>
              <h3 className={`text-2xl font-black font-mono tracking-tight mt-1 ${
                totalAdvanceOnPage > 0 ? "text-emerald-500" : "text-muted-foreground"
              }`}>
                ₹{totalAdvanceOnPage.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
        <DialogContent className="max-w-3xl max-h-[88vh] overflow-hidden flex flex-col p-0 border border-border/70 bg-background/95 backdrop-blur-xl rounded-2xl shadow-2xl w-11/12">
          <DialogHeader className="p-5 pb-3 border-b border-border/40 shrink-0 flex flex-row items-center justify-between">
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" /> Customer Profile & History
            </DialogTitle>
            {selectedCustomer && (
              <Button
                size="sm"
                onClick={() => {
                  const dates = computeReminderDates(30, 5);
                  setAddReminderDialog({
                    open: true,
                    medicineName: "",
                    quantity: 1,
                    daysSupply: 30,
                    remindBefore: 5,
                    refillTargetDate: dates.targetDate,
                    reminderDate: dates.reminderDate,
                    notes: "",
                  });
                }}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold h-8 text-xs rounded-xl shadow-xs flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" /> New Refill Reminder
              </Button>
            )}
          </DialogHeader>

          {selectedCustomer && (
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* Customer Info Card */}
              <div className="flex items-start justify-between gap-4 p-4 rounded-2xl bg-muted/20 border border-border/50">
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/15 to-indigo-500/15 border border-primary/20 flex items-center justify-center shrink-0">
                    <Users className="w-6 h-6 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-lg font-bold text-foreground truncate">
                      {selectedCustomer.name}
                    </h3>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs font-semibold text-muted-foreground">
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

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    openWhatsApp({
                      phone: selectedCustomer.mobile,
                      message: `Hello ${selectedCustomer.name}, this is from pharmacy.`,
                    });
                  }}
                  className="shrink-0 h-8 border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10 font-bold text-xs rounded-xl"
                >
                  <MessageCircle className="w-3.5 h-3.5 mr-1 text-emerald-500" /> WhatsApp
                </Button>
              </div>

              {/* Stats Overview */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3.5 rounded-xl bg-primary/5 border border-primary/10">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-0.5">
                    Total Purchases
                  </p>
                  <p className="text-xl font-black font-mono tracking-tight text-primary">
                    ₹{selectedCustomer.total_purchases?.toLocaleString("en-IN") || 0}
                  </p>
                </div>
                <div
                  onClick={() => setActiveDetailTab("reminders")}
                  className="p-3.5 rounded-xl bg-indigo-500/5 border border-indigo-500/20 cursor-pointer hover:bg-indigo-500/10 transition-colors"
                >
                  <div className="flex items-center justify-between mb-0.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-500">
                      Refill Reminders
                    </p>
                    <Badge className="bg-indigo-500/20 text-indigo-500 border-0 text-[10px] font-extrabold h-4 px-1.5 rounded-full">
                      {customerReminders.filter((r) => r.is_active).length} Active
                    </Badge>
                  </div>
                  <p className="text-xl font-black font-mono tracking-tight text-indigo-600 dark:text-indigo-400">
                    {customerReminders.length} Total
                  </p>
                </div>
                <div
                  className={`p-3.5 rounded-xl relative overflow-hidden transition-all ${
                    selectedCustomer.total_debt > 0
                      ? "bg-yellow-500/5 border border-yellow-500/20"
                      : "bg-muted/30 border border-border/40"
                  }`}
                >
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-0.5">
                    Outstanding Debt
                  </p>
                  <p
                    className={`text-xl font-black font-mono tracking-tight ${
                      selectedCustomer.total_debt > 0 ? "text-yellow-500" : "text-muted-foreground/60"
                    }`}
                  >
                    ₹{selectedCustomer.total_debt?.toLocaleString("en-IN") || 0}
                  </p>
                </div>
              </div>

              {/* Tabs Navigation */}
              <div className="flex items-center gap-2 border-b border-border/60 pb-2">
                <Button
                  type="button"
                  variant={activeDetailTab === "reminders" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setActiveDetailTab("reminders")}
                  className={`h-8 px-3.5 font-bold text-xs rounded-xl transition-all ${
                    activeDetailTab === "reminders"
                      ? "bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                  Refill Reminders ({customerReminders.length})
                </Button>
                <Button
                  type="button"
                  variant={activeDetailTab === "purchases" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setActiveDetailTab("purchases")}
                  className={`h-8 px-3.5 font-bold text-xs rounded-xl transition-all ${
                    activeDetailTab === "purchases"
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Receipt className="w-3.5 h-3.5 mr-1.5" />
                  Purchase Bills ({customerBills.length})
                </Button>
                {unpaidBills.length > 0 && (
                  <Button
                    type="button"
                    variant={activeDetailTab === "unpaid" ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setActiveDetailTab("unpaid")}
                    className={`h-8 px-3.5 font-bold text-xs rounded-xl transition-all ${
                      activeDetailTab === "unpaid"
                        ? "bg-yellow-500 hover:bg-yellow-600 text-black shadow-xs"
                        : "text-yellow-600 dark:text-yellow-400 hover:text-foreground"
                    }`}
                  >
                    <AlertCircle className="w-3.5 h-3.5 mr-1.5" />
                    Unpaid / Khata ({unpaidBills.length})
                  </Button>
                )}
              </div>

              {/* TAB 1: REFILL REMINDERS */}
              {activeDetailTab === "reminders" && (
                <div className="space-y-3 animate-in fade-in duration-200">
                  {loadingReminders ? (
                    <div className="text-center py-10">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto text-indigo-500" />
                      <p className="text-xs text-muted-foreground mt-2 font-medium">Loading reminders...</p>
                    </div>
                  ) : customerReminders.length === 0 ? (
                    <div className="text-center py-10 rounded-2xl bg-indigo-500/5 border border-dashed border-indigo-500/20 space-y-3">
                      <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center mx-auto">
                        <RotateCcw className="w-6 h-6" />
                      </div>
                      <div className="max-w-xs mx-auto">
                        <h4 className="text-sm font-bold text-foreground">No Refill Reminders Yet</h4>
                        <p className="text-xs text-muted-foreground mt-1">
                          Set automatic refill alerts to notify you when this customer's medicine is running low.
                        </p>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => {
                          const dates = computeReminderDates(30, 5);
                          setAddReminderDialog({
                            open: true,
                            medicineName: "",
                            quantity: 1,
                            daysSupply: 30,
                            remindBefore: 5,
                            refillTargetDate: dates.targetDate,
                            reminderDate: dates.reminderDate,
                            notes: "",
                          });
                        }}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold h-8 text-xs rounded-xl shadow-xs"
                      >
                        <Plus className="w-3.5 h-3.5 mr-1" /> Create First Refill Alert
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {customerReminders.map((rem) => {
                        const todayStr = new Date().toISOString().slice(0, 10);
                        const isDue = rem.is_active && rem.reminder_date <= todayStr;
                        const isCompleted = rem.status === "COMPLETED";

                        return (
                          <div
                            key={rem.id}
                            className={`p-4 rounded-2xl border transition-all duration-200 ${
                              isCompleted
                                ? "bg-muted/15 border-border/40 opacity-75"
                                : isDue
                                ? "bg-amber-500/10 border-amber-500/30 shadow-xs"
                                : rem.is_active
                                ? "bg-indigo-500/5 border-indigo-500/20 hover:border-indigo-500/30"
                                : "bg-muted/10 border-border/40 opacity-60"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="space-y-1.5 flex-1 min-w-0">
                                {/* Medicine Tags */}
                                <div className="flex flex-wrap items-center gap-1.5">
                                  {(rem.items && rem.items.length > 0 ? rem.items : [{ product_name: "Medicines", quantity: 1 }]).map((item, idx) => (
                                    <span
                                      key={idx}
                                      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-xs font-bold bg-background border border-border text-foreground shadow-2xs"
                                    >
                                      <Pill className="w-3 h-3 text-primary shrink-0" />
                                      <span>{item.product_name}</span>
                                      {item.quantity ? <span className="text-muted-foreground font-normal">(Qty: {item.quantity})</span> : null}
                                    </span>
                                  ))}
                                  {rem.bill_no && (
                                    <span className="text-[10px] font-mono text-muted-foreground font-semibold">
                                      Bill #{rem.bill_no}
                                    </span>
                                  )}
                                </div>

                                {/* Dates info */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 pt-1 text-xs text-muted-foreground font-semibold">
                                  <div className="flex items-center gap-1.5">
                                    <Calendar className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                                    <span>Expected Refill:</span>
                                    <span className="font-bold text-foreground">
                                      {new Date(rem.refill_target_date).toLocaleDateString("en-IN", {
                                        day: "numeric",
                                        month: "short",
                                        year: "numeric",
                                      })}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <Bell className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                    <span>Alert Date:</span>
                                    <span className={`font-bold ${isDue ? "text-amber-600 dark:text-amber-400" : "text-foreground"}`}>
                                      {new Date(rem.reminder_date).toLocaleDateString("en-IN", {
                                        day: "numeric",
                                        month: "short",
                                        year: "numeric",
                                      })}
                                    </span>
                                    {isDue && (
                                      <Badge className="bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 text-[9px] font-bold py-0 px-1.5 rounded-full animate-pulse">
                                        Due Now
                                      </Badge>
                                    )}
                                  </div>
                                </div>

                                {rem.notes && (
                                  <p className="text-[11px] text-muted-foreground italic pt-0.5">
                                    "{rem.notes}"
                                  </p>
                                )}
                              </div>

                              {/* Status & Active Toggle */}
                              <div className="flex flex-col items-end gap-2 shrink-0">
                                <div className="flex items-center gap-2">
                                  <span className={`text-[10px] font-bold uppercase tracking-wider ${
                                    rem.is_active ? "text-indigo-500" : "text-muted-foreground"
                                  }`}>
                                    {rem.is_active ? "Active" : "Paused"}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleToggleReminder(rem.id)}
                                    disabled={actionLoading[rem.id]}
                                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                                      rem.is_active ? "bg-indigo-600" : "bg-muted-foreground/30"
                                    }`}
                                  >
                                    <span
                                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                                        rem.is_active ? "translate-x-4" : "translate-x-0"
                                      }`}
                                    />
                                  </button>
                                </div>

                                <Badge
                                  className={`text-[9px] font-bold uppercase rounded-full ${
                                    isCompleted
                                      ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                                      : !rem.is_active
                                      ? "bg-muted text-muted-foreground"
                                      : isDue
                                      ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                                      : "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20"
                                  }`}
                                >
                                  {isCompleted
                                    ? "Completed"
                                    : !rem.is_active
                                    ? "OFF"
                                    : isDue
                                    ? "Due Alert"
                                    : "Scheduled"}
                                </Badge>
                              </div>
                            </div>

                            {/* Action Toolbar */}
                            <div className="flex flex-wrap items-center justify-between gap-2 pt-3 mt-3 border-t border-border/40">
                              <div className="flex flex-wrap items-center gap-2">
                                <Button
                                  size="sm"
                                  onClick={() => handleSendWhatsApp(rem)}
                                  className="h-7 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs flex items-center gap-1"
                                >
                                  <MessageCircle className="w-3 h-3" /> WhatsApp Reminder
                                </Button>

                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setDetailsOpen(false);
                                    navigate("/purchases", {
                                      state: {
                                        openNew: true,
                                        restockItems: rem.items || [],
                                      },
                                    });
                                  }}
                                  className="h-7 px-2.5 border-orange-500/30 text-orange-600 dark:text-orange-400 hover:bg-orange-500/10 font-bold text-xs rounded-xl flex items-center gap-1"
                                >
                                  <Package className="w-3 h-3" /> Purchase Now
                                </Button>

                                {!isCompleted && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleCompleteReminder(rem.id)}
                                    disabled={actionLoading[rem.id]}
                                    className="h-7 px-2.5 border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10 font-bold text-xs rounded-xl"
                                  >
                                    <CheckCircle2 className="w-3 h-3 mr-1" /> Mark Done
                                  </Button>
                                )}
                              </div>

                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleDeleteReminder(rem.id)}
                                disabled={actionLoading[rem.id]}
                                className="h-7 w-7 p-0 text-destructive/70 hover:text-destructive hover:bg-destructive/10 rounded-lg"
                                title="Delete reminder"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: PURCHASE HISTORY */}
              {activeDetailTab === "purchases" && (
                <div className="space-y-3 animate-in fade-in duration-200">
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
                            <div className="flex items-center gap-1 mt-0.5 justify-end">
                              {bill.is_paid ? (
                                <Badge className="bg-primary/10 text-primary border border-primary/20 text-[9px] font-bold uppercase tracking-wider rounded-full">
                                  Paid
                                </Badge>
                              ) : (
                                <Badge className="bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 text-[9px] font-bold uppercase tracking-wider rounded-full">
                                  Unpaid
                                </Badge>
                              )}
                              {bill.is_advance_paid && (
                                <Badge className="bg-blue-500/10 text-blue-500 border border-blue-500/20 text-[9px] font-bold uppercase tracking-wider rounded-full">
                                  Advance
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: UNPAID BILLS */}
              {activeDetailTab === "unpaid" && unpaidBills.length > 0 && (
                <div className="space-y-2 animate-in fade-in duration-200">
                  {unpaidBills.map((bill) => (
                    <div
                      key={bill.id}
                      className="flex items-center justify-between p-3.5 rounded-xl bg-yellow-500/5 border border-yellow-500/10 hover:border-yellow-500/20 transition-all shadow-xs"
                    >
                      <div>
                        <p className="font-mono text-sm font-bold text-foreground">{bill.bill_no}</p>
                        <p className="text-xs text-muted-foreground font-semibold mt-0.5">
                          {new Date(bill.billing_date || bill.created_at).toLocaleDateString()}
                        </p>
                      </div>

                      <div className="flex items-center gap-3 flex-wrap">
                        {bill.is_advance_paid ? (() => {
                          const currentPaid = bill.total_paid !== undefined ? bill.total_paid : (bill.is_paid ? (bill.grand_total || bill.total_amount || 0) : (bill.advance_amount || 0));
                          const remainingUnpaid = Math.max(0, (bill.grand_total || bill.total_amount || 0) - currentPaid);
                          return (
                            <div className="flex items-center gap-2">
                              <Badge className={`font-bold rounded-full py-0.5 px-2 text-[10px] uppercase ${
                                bill.delivery_status === "Delivered" 
                                  ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20" 
                                  : (bill.delivery_status === "Partially Delivered" ? "bg-blue-500/10 text-blue-500 border border-blue-500/20" : "bg-yellow-500/10 text-yellow-600 border border-yellow-500/20 animate-pulse")
                              }`}>
                                {bill.delivery_status}
                              </Badge>
                              {remainingUnpaid > 0 ? (
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-red-500 font-bold text-xs">
                                    Unpaid: ₹{remainingUnpaid.toFixed(2)}
                                  </span>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="border-primary/50 text-primary hover:bg-primary/5 h-8 font-bold text-xs"
                                    onClick={() => {
                                      setDetailsOpen(false);
                                      navigate(`/billing?highlightId=${bill.id}`);
                                    }}
                                  >
                                    Pay
                                  </Button>
                                </div>
                              ) : (
                                <span className="font-mono text-emerald-500 font-bold text-xs">
                                  Paid
                                </span>
                              )}
                            </div>
                          );
                        })() : (
                          <>
                            <span className="font-mono text-yellow-500 font-black text-sm">
                              ₹{(bill.grand_total || bill.total_amount || 0).toFixed(2)}
                            </span>
                            <Button
                              size="sm"
                              className="btn-primary h-8 font-bold text-xs"
                              onClick={() => handlePayBill(bill)}
                            >
                              Mark Paid
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Custom Refill Reminder Modal */}
      <Dialog
        open={addReminderDialog.open}
        onOpenChange={(open) => setAddReminderDialog((prev) => ({ ...prev, open }))}
      >
        <DialogContent className="max-w-md p-6 border border-border/70 bg-background/95 backdrop-blur-xl rounded-2xl shadow-2xl">
          <DialogHeader className="pb-3 border-b border-border/40">
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <RotateCcw className="w-4 h-4 text-indigo-500" /> Add Refill Reminder
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground">Medicine Name *</label>
              <Input
                placeholder="e.g., Telmisartan 40mg"
                value={addReminderDialog.medicineName}
                onChange={(e) =>
                  setAddReminderDialog((prev) => ({ ...prev, medicineName: e.target.value }))
                }
                className="h-9 text-xs font-semibold rounded-xl"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground">Quantity / Packs</label>
                <Input
                  type="number"
                  min="1"
                  value={addReminderDialog.quantity}
                  onChange={(e) =>
                    setAddReminderDialog((prev) => ({ ...prev, quantity: e.target.value }))
                  }
                  className="h-9 text-xs font-semibold rounded-xl"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground">Days Supply</label>
                <Input
                  type="number"
                  min="1"
                  value={addReminderDialog.daysSupply}
                  onChange={(e) => {
                    const days = parseInt(e.target.value) || 30;
                    const dates = computeReminderDates(days, addReminderDialog.remindBefore);
                    setAddReminderDialog((prev) => ({
                      ...prev,
                      daysSupply: days,
                      refillTargetDate: dates.targetDate,
                      reminderDate: dates.reminderDate,
                    }));
                  }}
                  className="h-9 text-xs font-semibold rounded-xl"
                />
              </div>
            </div>

            {/* Quick Presets */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3 text-indigo-500" /> Quick Duration Presets:
              </label>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { days: 15, remindBefore: 3, label: "15 Days" },
                  { days: 30, remindBefore: 5, label: "30 Days (1 Mo)" },
                  { days: 45, remindBefore: 5, label: "45 Days" },
                  { days: 60, remindBefore: 7, label: "60 Days (2 Mo)" },
                  { days: 90, remindBefore: 10, label: "90 Days (3 Mo)" },
                ].map((preset) => {
                  const isSelected =
                    addReminderDialog.daysSupply === preset.days &&
                    addReminderDialog.remindBefore === preset.remindBefore;
                  return (
                    <Button
                      key={preset.days}
                      type="button"
                      size="sm"
                      variant={isSelected ? "default" : "outline"}
                      onClick={() => {
                        const dates = computeReminderDates(preset.days, preset.remindBefore);
                        setAddReminderDialog((prev) => ({
                          ...prev,
                          daysSupply: preset.days,
                          remindBefore: preset.remindBefore,
                          refillTargetDate: dates.targetDate,
                          reminderDate: dates.reminderDate,
                        }));
                      }}
                      className={`h-6 px-2 text-[10px] font-bold rounded-lg transition-all ${
                        isSelected
                          ? "bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs"
                          : "border-border/70 hover:bg-indigo-500/10 hover:text-indigo-600"
                      }`}
                    >
                      {preset.label}
                    </Button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground">Expected Refill Date</label>
                <Input
                  type="date"
                  value={addReminderDialog.refillTargetDate}
                  onChange={(e) => {
                    const target = e.target.value;
                    const d = new Date(target);
                    d.setDate(d.getDate() - (parseInt(addReminderDialog.remindBefore) || 5));
                    setAddReminderDialog((prev) => ({
                      ...prev,
                      refillTargetDate: target,
                      reminderDate: !isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : prev.reminderDate,
                    }));
                  }}
                  className="h-9 text-xs font-semibold rounded-xl"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-indigo-600 dark:text-indigo-400">Alert Reminder Date *</label>
                <Input
                  type="date"
                  value={addReminderDialog.reminderDate}
                  onChange={(e) =>
                    setAddReminderDialog((prev) => ({ ...prev, reminderDate: e.target.value }))
                  }
                  className="h-9 text-xs font-semibold rounded-xl border-indigo-500/40"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground">Notes / Dosage</label>
              <Input
                placeholder="e.g. 1 tablet daily after breakfast"
                value={addReminderDialog.notes}
                onChange={(e) =>
                  setAddReminderDialog((prev) => ({ ...prev, notes: e.target.value }))
                }
                className="h-9 text-xs font-semibold rounded-xl"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/40">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setAddReminderDialog((prev) => ({ ...prev, open: false }))}
                className="text-xs font-bold"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleCreateCustomReminder}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs"
              >
                <Save className="w-3.5 h-3.5 mr-1" /> Save Reminder
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Customers Table */}
      <Card className="glass bg-card/45 border border-border/40 backdrop-blur-sm shadow-sm rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <Table mobileCards>
            <TableHeader className="border-b border-border/40 bg-muted/20">
              <TableRow className="hover:bg-transparent">
                <TableHead data-card="title" className="font-bold text-xs text-muted-foreground uppercase tracking-wider h-11">
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
                <TableHead data-card="actions" className="font-bold text-xs text-muted-foreground uppercase tracking-wider h-11 text-center">Actions</TableHead>
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
                      {customer.total_advance > 0 && (
                        <div className="text-[10px] text-emerald-500 font-extrabold mt-0.5" title="Customer active advance payments">
                          Advance: ₹{customer.total_advance?.toLocaleString("en-IN")}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
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
                        {customer.total_advance > 0 && (
                          <Badge className="bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 font-bold text-[10px] uppercase tracking-wider rounded-full">
                            Advance
                          </Badge>
                        )}
                      </div>
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
            <div className="text-xs font-bold text-muted-foreground/80 sm:w-1/3 text-left">
              Showing {((pagination.page - 1) * pagination.limit) + 1} to{" "}
              {Math.min(pagination.page * pagination.limit, pagination.total)}{" "}
              of {pagination.total} customers
            </div>

            <div className="flex items-center justify-center gap-2 sm:w-1/3">
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

            <div className="hidden sm:block sm:w-1/3 text-right text-xs font-bold text-muted-foreground/60">
              Page {pagination.page} of {pagination.total_pages}
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

          <AlertDialogFooter className="mt-4 flex flex-wrap sm:justify-end gap-2">
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
        <AlertDialogContent className="rounded-2xl max-w-sm sm:max-w-md border border-border bg-background p-6 shadow-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-bold">Clear Debt</AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-muted-foreground mt-2">
              Are you sure you want to clear {clearDebtDialog.amount ? `Rs. ${clearDebtDialog.amount.toFixed(2)}` : "all outstanding"} debt for this customer?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4 flex flex-wrap sm:justify-end gap-2">
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
