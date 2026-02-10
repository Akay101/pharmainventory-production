import { useState, useEffect, useCallback } from "react";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { Search, Users, Phone, Mail, Receipt, AlertCircle, ChevronLeft, ChevronRight, ArrowUpDown } from "lucide-react";
import { toast } from "sonner";

export default function CustomersPage() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerBills, setCustomerBills] = useState([]);
  const [detailsOpen, setDetailsOpen] = useState(false);

  // Pagination State
  const [pagination, setPagination] = useState({ page: 1, limit: 30, total: 0, total_pages: 1 });
  const [sortBy, setSortBy] = useState("created_at");
  const [sortOrder, setSortOrder] = useState("desc");

  const fetchCustomers = useCallback(async (page = 1) => {
    try {
      const params = new URLSearchParams();
      params.append("page", page);
      params.append("limit", pagination.limit);
      params.append("sort_by", sortBy);
      params.append("sort_order", sortOrder);
      if (search) params.append("search", search);

      const response = await axios.get(`${API}/customers?${params.toString()}`);
      setCustomers(response.data.customers);
      setPagination(response.data.pagination);
    } catch (error) {
      toast.error("Failed to load customers");
    } finally {
      setLoading(false);
    }
  }, [search, sortBy, sortOrder, pagination.limit]);

  useEffect(() => {
    fetchCustomers(1);
  }, []);

  useEffect(() => {
    const debounce = setTimeout(() => {
      fetchCustomers(1);
    }, 300);
    return () => clearTimeout(debounce);
  }, [search, sortBy, sortOrder]);

  const handleViewCustomer = async (customer) => {
    setSelectedCustomer(customer);
    setDetailsOpen(true);

    try {
      const response = await axios.get(`${API}/customers/${customer.id}`);
      setCustomerBills(response.data.bills || []);
    } catch (error) {
      toast.error("Failed to load customer details");
    }
  };

  const handleSort = (field) => {
    const newOrder = sortBy === field && sortOrder === "desc" ? "asc" : "desc";
    setSortBy(field);
    setSortOrder(newOrder);
  };

  const handleClearDebt = async (customerId, amount = null) => {
    const amountStr = amount ? `Rs. ${amount.toFixed(2)}` : 'all';
    if (!window.confirm(`Are you sure you want to clear ${amountStr} debt for this customer?`)) {
      return;
    }
    try {
      const params = amount ? `?amount=${amount}` : '';
      const response = await axios.post(`${API}/customers/${customerId}/clear-debt${params}`);
      toast.success(response.data.message);
      if (response.data.bills_marked_paid > 0) {
        toast.info(`${response.data.bills_marked_paid} bills marked as paid`);
      }
      // Refresh customer data
      fetchCustomers(pagination.page);
      if (selectedCustomer && selectedCustomer.id === customerId) {
        // Refresh details dialog data
        setSelectedCustomer(prev => ({
          ...prev,
          total_debt: response.data.remaining_debt
        }));
        const response2 = await axios.get(`${API}/customers/${customerId}`);
        setCustomerBills(response2.data.bills || []);
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to clear debt");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in" data-testid="customers-page">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Customers</h1>
          <p className="text-muted-foreground">{pagination.total} customers registered</p>
        </div>
      </div>

      {/* Search */}
      <Card className="bg-card/50 backdrop-blur-sm border-white/5">
        <CardContent className="p-4">
          <div className="flex gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search customers by name, mobile or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
                data-testid="customer-search"
              />
            </div>
            {search && (
              <Button variant="outline" onClick={() => setSearch("")}>
                Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Customer Details Dialog */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Customer Details</DialogTitle>
          </DialogHeader>

          {selectedCustomer && (
            <div className="space-y-6 pt-4">
              {/* Customer Info */}
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Users className="w-7 h-7 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-semibold">{selectedCustomer.name}</h3>
                  <div className="flex flex-wrap gap-4 mt-2 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Phone className="w-4 h-4" />
                      {selectedCustomer.mobile}
                    </span>
                    {selectedCustomer.email && (
                      <span className="flex items-center gap-1">
                        <Mail className="w-4 h-4" />
                        {selectedCustomer.email}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
                  <p className="text-sm text-muted-foreground mb-1">Total Purchases</p>
                  <p className="text-xl font-bold font-mono text-primary">
                    ₹{selectedCustomer.total_purchases?.toLocaleString("en-IN") || 0}
                  </p>
                </div>
                <div
                  className={`p-4 rounded-lg ${
                    selectedCustomer.total_debt > 0
                      ? "bg-yellow-500/10 border border-yellow-500/20"
                      : "bg-muted/30 border border-white/5"
                  }`}
                >
                  <p className="text-sm text-muted-foreground mb-1">Outstanding Debt</p>
                  <p
                    className={`text-xl font-bold font-mono ${
                      selectedCustomer.total_debt > 0 ? "text-yellow-500" : ""
                    }`}
                  >
                    ₹{selectedCustomer.total_debt?.toLocaleString("en-IN") || 0}
                  </p>
                  {selectedCustomer.total_debt > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2 w-full border-yellow-500/50 text-yellow-500 hover:bg-yellow-500/10"
                      onClick={() => handleClearDebt(selectedCustomer.id)}
                      data-testid="clear-debt-btn"
                    >
                      Clear Full Debt
                    </Button>
                  )}
                </div>
              </div>

              {/* Purchase History */}
              <div>
                <h4 className="font-medium mb-3">Purchase History</h4>
                {customerBills.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground">
                    <Receipt className="w-10 h-10 mx-auto mb-2 opacity-50" />
                    <p>No purchase history</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {customerBills.map((bill) => (
                      <div
                        key={bill.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-white/5"
                      >
                        <div>
                          <p className="font-mono text-sm">{bill.bill_no}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(bill.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-mono text-primary">₹{bill.grand_total?.toFixed(2)}</p>
                          {bill.is_paid ? (
                            <Badge className="bg-primary/20 text-primary text-xs">Paid</Badge>
                          ) : (
                            <Badge className="bg-yellow-500/20 text-yellow-500 text-xs">Unpaid</Badge>
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
      <Card className="data-table">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <Button
                  variant="ghost"
                  onClick={() => handleSort("name")}
                  className="h-auto p-0 font-medium hover:bg-transparent"
                >
                  Customer
                  <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
              </TableHead>
              <TableHead>Contact</TableHead>
              <TableHead className="text-right">
                <Button
                  variant="ghost"
                  onClick={() => handleSort("total_purchases")}
                  className="h-auto p-0 font-medium hover:bg-transparent"
                >
                  Total Purchases
                  <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
              </TableHead>
              <TableHead className="text-right">
                <Button
                  variant="ghost"
                  onClick={() => handleSort("total_debt")}
                  className="h-auto p-0 font-medium hover:bg-transparent"
                >
                  Outstanding
                  <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
              </TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-center">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {customers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  <Users className="w-10 h-10 mx-auto mb-2 opacity-50" />
                  No customers found
                </TableCell>
              </TableRow>
            ) : (
              customers.map((customer) => (
                <TableRow
                  key={customer.id}
                  className="cursor-pointer"
                  onClick={() => handleViewCustomer(customer)}
                  data-testid={`customer-row-${customer.id}`}
                >
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                        <span className="font-medium text-primary">
                          {customer.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <span className="font-medium">{customer.name}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <p className="font-mono text-sm">{customer.mobile}</p>
                    {customer.email && (
                      <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                        {customer.email}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    ₹{customer.total_purchases?.toLocaleString("en-IN") || 0}
                  </TableCell>
                  <TableCell className="text-right">
                    {customer.total_debt > 0 ? (
                      <span className="font-mono text-yellow-500">
                        ₹{customer.total_debt?.toLocaleString("en-IN")}
                      </span>
                    ) : (
                      <span className="font-mono text-muted-foreground">₹0</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {customer.total_debt > 0 ? (
                      <Badge className="bg-yellow-500/20 text-yellow-500 border-yellow-500/50">
                        <AlertCircle className="w-3 h-3 mr-1" />
                        Has Debt
                      </Badge>
                    ) : (
                      <Badge className="bg-primary/20 text-primary border-primary/50">
                        Clear
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                    {customer.total_debt > 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-yellow-500/50 text-yellow-500 hover:bg-yellow-500/10"
                        onClick={() => handleClearDebt(customer.id)}
                        data-testid={`clear-debt-${customer.id}`}
                      >
                        Clear Debt
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        
        {/* Pagination */}
        {pagination.total_pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t">
            <div className="text-sm text-muted-foreground">
              Showing {((pagination.page - 1) * pagination.limit) + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} customers
            </div>
            
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchCustomers(pagination.page - 1)}
                disabled={pagination.page <= 1}
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, pagination.total_pages) }, (_, i) => {
                  const pageNum = Math.max(1, Math.min(pagination.total_pages - 4, pagination.page - 2)) + i;
                  if (pageNum > pagination.total_pages) return null;
                  return (
                    <Button
                      key={pageNum}
                      variant={pageNum === pagination.page ? "default" : "outline"}
                      size="sm"
                      onClick={() => fetchCustomers(pageNum)}
                      className="w-8 h-8 p-0"
                    >
                      {pageNum}
                    </Button>
                  );
                })}
              </div>
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchCustomers(pagination.page + 1)}
                disabled={pagination.page >= pagination.total_pages}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
