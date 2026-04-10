import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { API } from "../App";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { Search, Plus, Truck, Edit2, Trash2, Loader2, Phone, Mail, MapPin, ChevronLeft, ChevronRight, FileText, CreditCard, ExternalLink, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "./utils";

export default function SuppliersPage() {
  const navigate = useNavigate();
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
    gst_no: "",
  });

  // Pagination State
  const [pagination, setPagination] = useState({ page: 1, limit: 30, total: 0, total_pages: 1 });

  // Details Dialog State
  const [detailsDialog, setDetailsDialog] = useState({ open: false, data: null, loading: false });
  // Payment Dialog
  const [paymentDialog, setPaymentDialog] = useState({ open: false, purchase: null });
  const [newPaymentAmount, setNewPaymentAmount] = useState("");
  const [newPaymentNotes, setNewPaymentNotes] = useState("");

  const [deleteConfirm, setDeleteConfirm] = useState({ open: false, supplierId: null });
  const [clearDuesConfirm, setClearDuesConfirm] = useState({ open: false, supplierId: null });

  const fetchSuppliers = useCallback(async (page = 1) => {
    try {
      const params = new URLSearchParams();
      params.append("page", page);
      params.append("limit", pagination.limit);
      params.append("sort_by", "created_at");
      params.append("sort_order", "desc");
      if (search) params.append("search", search);

      const response = await axios.get(`${API}/suppliers?${params.toString()}`);
      setSuppliers(response.data.suppliers);
      setPagination(response.data.pagination);
    } catch (error) {
      toast.error("Failed to load suppliers");
    } finally {
      setLoading(false);
    }
  }, [search, pagination.limit]);

  useEffect(() => {
    fetchSuppliers(1);
  }, []);

  useEffect(() => {
    const debounce = setTimeout(() => {
      fetchSuppliers(1);
    }, 300);
    return () => clearTimeout(debounce);
  }, [search]);

  const handleSubmit = async () => {
    if (!formData.name) {
      toast.error("Supplier name is required");
      return;
    }

    setSubmitting(true);
    try {
      if (editingSupplier) {
        await axios.put(`${API}/suppliers/${editingSupplier.id}`, formData);
        toast.success("Supplier updated successfully");
      } else {
        await axios.post(`${API}/suppliers`, formData);
        toast.success("Supplier added successfully");
      }

      setDialogOpen(false);
      resetForm();
      fetchSuppliers(pagination.page);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Operation failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (supplier) => {
    setEditingSupplier(supplier);
    setFormData({
      name: supplier.name,
      phone: supplier.phone || "",
      email: supplier.email || "",
      address: supplier.address || "",
      gst_no: supplier.gst_no || "",
    });
    setDialogOpen(true);
  };

  const handleDelete = (supplierId) => {
    setDeleteConfirm({ open: true, supplierId });
  };

  const confirmDelete = async () => {
    const { supplierId } = deleteConfirm;
    if (!supplierId) return;

    try {
      await axios.delete(`${API}/suppliers/${supplierId}`);
      toast.success("Supplier deleted successfully");
      setDeleteConfirm({ open: false, supplierId: null });
      fetchSuppliers(pagination.page);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to delete supplier");
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      phone: "",
      email: "",
      address: "",
      gst_no: "",
    });
    setEditingSupplier(null);
  };

  const handleViewDetails = async (supplierId) => {
    setDetailsDialog({ open: true, data: null, loading: true });
    try {
      const response = await axios.get(`${API}/suppliers/${supplierId}`);
      setDetailsDialog({ open: true, data: response.data, loading: false });
    } catch (error) {
      toast.error("Failed to load supplier details");
      setDetailsDialog({ open: false, data: null, loading: false });
    }
  };

  const handleAddNewPayment = async () => {
    if (!newPaymentAmount || parseFloat(newPaymentAmount) <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }
    setSubmitting(true);
    try {
      await axios.post(`${API}/purchases/${paymentDialog.purchase.id}/payments`, {
        amount: parseFloat(newPaymentAmount),
        notes: newPaymentNotes,
      });
      toast.success("Payment added successfully");
      setPaymentDialog({ open: false, purchase: null });
      setNewPaymentAmount("");
      setNewPaymentNotes("");
      // Refresh details
      if (detailsDialog.data?.supplier) {
        handleViewDetails(detailsDialog.data.supplier.id);
      }
      fetchSuppliers(pagination.page);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to add payment");
    } finally {
      setSubmitting(false);
    }
  };

  const handleMarkAsPaid = async (purchase) => {
    try {
      const remainingAmount = purchase.total_amount - (purchase.amount_paid || 0);
      if (remainingAmount <= 0) return;
      
      await axios.post(`${API}/purchases/${purchase.id}/payments`, {
        amount: remainingAmount,
        notes: "Marked as Paid in Full",
      });
      toast.success("Purchase marked as Paid");
      // Refresh details
      if (detailsDialog.data?.supplier) {
        handleViewDetails(detailsDialog.data.supplier.id);
      }
      fetchSuppliers(pagination.page);
    } catch (error) {
      toast.error("Failed to mark as paid");
    }
  };

  const handleClearAllDues = (supplierId) => {
    setClearDuesConfirm({ open: true, supplierId });
  };

  const confirmClearAllDues = async () => {
    const { supplierId } = clearDuesConfirm;
    if (!supplierId) return;
    
    try {
      await axios.post(`${API}/suppliers/${supplierId}/pay-all`);
      toast.success("All outstanding dues for this supplier cleared successfully!");
      setClearDuesConfirm({ open: false, supplierId: null });
      // Refresh details
      handleViewDetails(supplierId);
      fetchSuppliers(pagination.page);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to clear dues");
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
    <div className="space-y-6 animate-fade-in" data-testid="suppliers-page">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Suppliers</h1>
          <p className="text-muted-foreground">{pagination.total} suppliers registered</p>
        </div>

        <Dialog
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) resetForm();
          }}
        >
          <DialogTrigger asChild>
            <Button className="btn-primary" data-testid="add-supplier-btn">
              <Plus className="w-4 h-4 mr-2" />
              Add Supplier
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingSupplier ? "Edit Supplier" : "Add New Supplier"}</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>Supplier Name *</Label>
                <Input
                  placeholder="ABC Pharmaceuticals"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  data-testid="supplier-name-input"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input
                    placeholder="+91 9876543210"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    data-testid="supplier-phone-input"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    placeholder="supplier@email.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    data-testid="supplier-email-input"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Address</Label>
                <Input
                  placeholder="123 Business Street, City"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  data-testid="supplier-address-input"
                />
              </div>

              <div className="space-y-2">
                <Label>GST Number</Label>
                <Input
                  placeholder="29ABCDE1234F1Z5"
                  value={formData.gst_no}
                  onChange={(e) => setFormData({ ...formData, gst_no: e.target.value })}
                  data-testid="supplier-gst-input"
                />
              </div>

              <Button
                onClick={handleSubmit}
                disabled={submitting}
                className="w-full btn-primary"
                data-testid="save-supplier-btn"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : editingSupplier ? (
                  "Update Supplier"
                ) : (
                  "Add Supplier"
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Supplier Details Modal */}
      <Dialog open={detailsDialog.open} onOpenChange={(open) => !open && setDetailsDialog({ open: false, data: null, loading: false })}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto w-11/12 p-0 border-0 bg-background/95 backdrop-blur-xl">
          {detailsDialog.loading ? (
             <div className="flex items-center justify-center h-64">
               <Loader2 className="w-8 h-8 animate-spin text-primary" />
             </div>
          ) : detailsDialog.data ? (
             <div className="space-y-0">
               {/* Header Section */}
               <div className="bg-primary/10 p-6 md:p-8 flex flex-col md:flex-row justify-between items-start md:items-center border-b border-primary/20">
                 <div>
                   <h2 className="text-3xl font-extrabold flex items-center gap-3">
                     <Truck className="w-8 h-8 text-primary" />
                     {detailsDialog.data.supplier.name}
                   </h2>
                   <div className="flex flex-wrap gap-4 mt-3 text-sm text-foreground/80 font-medium">
                     {detailsDialog.data.supplier.phone && <span className="flex items-center"><Phone className="w-4 h-4 mr-1.5 opacity-70"/>{detailsDialog.data.supplier.phone}</span>}
                     {detailsDialog.data.supplier.email && <span className="flex items-center"><Mail className="w-4 h-4 mr-1.5 opacity-70"/>{detailsDialog.data.supplier.email}</span>}
                     {detailsDialog.data.supplier.gst_no && <span className="flex items-center text-primary font-mono"><FileText className="w-4 h-4 mr-1.5 opacity-70"/>GST: {detailsDialog.data.supplier.gst_no}</span>}
                   </div>
                 </div>
                  <div className="mt-6 md:mt-0 bg-background/50 rounded-xl p-4 border border-primary/20 shadow-lg min-w-[200px] text-center flex flex-col justify-center gap-2">
                    <div>
                      <p className="text-xs uppercase tracking-widest font-semibold text-muted-foreground mb-1">Total Amount Owed</p>
                      <p className={`text-3xl font-black font-mono tracking-tight ${detailsDialog.data.total_amount_owed > 0 ? 'text-red-500' : 'text-green-500'}`}>
                        ₹{(detailsDialog.data.total_amount_owed || 0).toFixed(2)}
                      </p>
                    </div>
                    {detailsDialog.data.total_amount_owed > 0 && (
                      <Button 
                        onClick={() => handleClearAllDues(detailsDialog.data.supplier.id)} 
                        size="sm" 
                        variant="default"
                        className="w-full mt-1 font-bold text-xs shadow-md border border-primary/20"
                      >
                        <ShieldCheck className="w-3.5 h-3.5 mr-1" /> Clear All Dues
                      </Button>
                    )}
                  </div>
               </div>
               
               {/* Body Section */}
               <div className="p-6 md:p-8">
                 <div className="flex justify-between items-center mb-6">
                   <h3 className="text-xl font-bold flex items-center gap-2">
                     <CreditCard className="w-5 h-5 text-primary" /> Purchase Ledger
                   </h3>
                   <Button variant="outline" size="sm" onClick={() => navigate(`/purchases?supplier_id=${detailsDialog.data.supplier.id}`)} className="text-xs">
                     See all purchases <ExternalLink className="w-3.5 h-3.5 ml-1.5" />
                   </Button>
                 </div>
                 
                 {detailsDialog.data.purchases?.length === 0 ? (
                   <p className="text-muted-foreground italic py-8 text-center bg-muted/30 rounded-lg border border-dashed border-border text-lg">No purchases exist for this supplier.</p>
                 ) : (
                   <div className="space-y-6">
                     {detailsDialog.data.purchases.map(purchase => {
                       const isPaid = purchase.payment_status === "Paid";
                       const remaining = (purchase.total_amount || 0) - (purchase.amount_paid || 0);
                       return (
                         <div key={purchase.id} className="bg-card border border-border/50 rounded-xl p-6 flex flex-col md:flex-row justify-between gap-6 overflow-hidden relative group hover:border-primary/30 transition-colors shadow-sm">
                           {/* Purchase Info */}
                           <div className="flex-1 space-y-3">
                             <div className="flex items-center gap-3">
                               <div className="bg-muted px-3 py-1 rounded-md">
                                 <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Invoice</span>
                                 <p className="text-sm font-mono font-bold">{purchase.invoice_no || "N/A"}</p>
                               </div>
                               <span className="text-sm font-medium bg-muted/40 px-3 py-1 rounded-md">{formatDate(purchase.purchase_date)}</span>
                               <span className={`px-2.5 py-1 text-xs font-bold uppercase rounded-full tracking-wider border ${
                                 isPaid ? 'bg-green-500/10 text-green-500 border-green-500/20' : 
                                 purchase.payment_status === 'Partial' ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' : 
                                 'bg-red-500/10 text-red-500 border-red-500/20'
                               }`}>
                                 {purchase.payment_status || "Unpaid"}
                               </span>
                             </div>
                             
                             <div className="text-sm font-medium">Billed: <span className="font-mono font-bold">₹{purchase.total_amount?.toFixed(2)}</span></div>
                             
                             <div className="flex gap-4 items-center">
                               {purchase.payments?.length > 0 && (
                                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary group-hover:scale-110 transition-transform cursor-pointer" title={`${purchase.payments.length} partial payments recorded`}>
                                    <FileText className="w-4 h-4" />
                                  </div>
                               )}
                               <p className="text-xs text-muted-foreground max-w-sm leading-relaxed">{purchase.items?.length || 0} product lines purchased.</p>
                             </div>
                           </div>
                           
                           {/* Action Info */}
                           <div className="md:w-64 shrink-0 flex flex-col justify-center border-l-0 md:border-l border-border pl-0 md:pl-6 pt-4 md:pt-0 border-t md:border-t-0 space-y-3">
                             <div className="flex justify-between items-center bg-muted/30 p-2.5 rounded-lg border border-border/50">
                               <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Remaining</span>
                               <span className={`text-lg font-mono font-black ${remaining > 0 ? "text-red-500" : "text-green-500"}`}>₹{Math.max(0, remaining).toFixed(2)}</span>
                             </div>
                             {!isPaid && (
                               <div className="flex gap-2">
                                 <Button size="sm" onClick={() => setPaymentDialog({ open: true, purchase })} className="flex-1 btn-primary text-xs shadow-md"><Plus className="w-3.5 h-3.5 mr-1" /> Pay Part</Button>
                                 <Button size="sm" onClick={() => handleMarkAsPaid(purchase)} variant="outline" className="flex-1 text-xs hover:bg-green-500/10 hover:text-green-500 hover:border-green-500/30 transition-colors"><ShieldCheck className="w-3.5 h-3.5 mr-1" /> Paid Full</Button>
                               </div>
                             )}
                           </div>
                         </div>
                       )
                     })}
                   </div>
                 )}
               </div>
             </div>
          ) : null}
        </DialogContent>
      </Dialog>
      
      {/* Partial Payment Prompt Dialog */}
      <Dialog open={paymentDialog.open} onOpenChange={(open) => !open && setPaymentDialog({ open: false, purchase: null })}>
        <DialogContent>
          <DialogHeader><DialogTitle>Register Partial Payment</DialogTitle></DialogHeader>
          <div className="space-y-4 py-3">
            <div className="space-y-2">
              <Label>Amount Paid Today (₹)</Label>
              <Input type="number" min="0" step="0.01" value={newPaymentAmount} onChange={(e) => setNewPaymentAmount(e.target.value)} />
              {paymentDialog.purchase && (
                <p className="text-xs text-muted-foreground mt-1">Outstanding Balance: ₹{(paymentDialog.purchase.total_amount - (paymentDialog.purchase.amount_paid || 0)).toFixed(2)}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Reference Notes</Label>
              <Input placeholder="Check #, UPI Ref, Bank..." value={newPaymentNotes} onChange={(e) => setNewPaymentNotes(e.target.value)} />
            </div>
            <Button onClick={handleAddNewPayment} disabled={submitting} className="w-full btn-primary">{submitting ? "Processing..." : "Confirm Payment"}</Button>
          </div>
        </DialogContent>
      </Dialog>


      <AlertDialog open={deleteConfirm.open} onOpenChange={(open) => setDeleteConfirm({ ...deleteConfirm, open })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Supplier</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this supplier? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={clearDuesConfirm.open} onOpenChange={(open) => setClearDuesConfirm({ ...clearDuesConfirm, open })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear All Dues</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to clear all outstanding dues for this supplier? This will mark all unpaid purchases as fully paid.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmClearAllDues} className="btn-primary">
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Search */}
      <Card className="bg-card/50 backdrop-blur-sm border-white/5">
        <CardContent className="p-4">
          <div className="flex gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search suppliers by name, phone or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
                data-testid="supplier-search"
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

      {/* Suppliers Grid */}
      {suppliers.length === 0 ? (
        <Card className="bg-card/50 backdrop-blur-sm border-white/5">
          <CardContent className="py-12 text-center">
            <Truck className="w-12 h-12 mx-auto mb-3 text-muted-foreground/50" />
            <p className="text-muted-foreground">No suppliers found</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {suppliers.map((supplier) => (
              <Card
                key={supplier.id}
                id={`record-${supplier.id}`}
                className="bg-card/50 backdrop-blur-sm border-white/5 hover:border-primary/20 transition-colors"
                data-testid={`supplier-card-${supplier.id}`}
              >
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center cursor-pointer hover:bg-primary/20 transition-colors" onClick={() => handleViewDetails(supplier.id)}>
                        <Truck className="w-5 h-5 text-primary" />
                      </div>
                      <div className="cursor-pointer group" onClick={() => handleViewDetails(supplier.id)}>
                        <h3 className="font-semibold text-primary hover:underline transition-colors flex items-center gap-1.5">{supplier.name} <ExternalLink className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" /></h3>
                        {supplier.gst_no && (
                          <p className="text-xs text-muted-foreground font-mono">GST: {supplier.gst_no}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEdit(supplier)}
                        data-testid={`edit-supplier-${supplier.id}`}
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(supplier.id)}
                        className="text-destructive hover:text-destructive"
                        data-testid={`delete-supplier-${supplier.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Outstanding Balance Banner */}
                  <div className={`-mx-5 px-5 py-2 mt-2 mb-4 flex justify-between items-center border-y ${supplier.total_amount_owed > 0 ? "bg-red-500/5 border-red-500/10" : "bg-green-500/5 border-green-500/10"} cursor-pointer hover:bg-muted/40 transition-colors`} onClick={() => handleViewDetails(supplier.id)}>
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Outstanding</span>
                    <span className={`font-mono font-black ${supplier.total_amount_owed > 0 ? "text-red-500" : "text-green-500"}`}>₹{(supplier.total_amount_owed || 0).toFixed(2)}</span>
                  </div>

                  <div className="space-y-2 text-sm">
                    {supplier.phone && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Phone className="w-4 h-4" />
                        <span>{supplier.phone}</span>
                      </div>
                    )}
                    {supplier.email && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Mail className="w-4 h-4" />
                        <span className="truncate">{supplier.email}</span>
                      </div>
                    )}
                    {supplier.address && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <MapPin className="w-4 h-4 flex-shrink-0" />
                        <span className="truncate">{supplier.address}</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Pagination */}
          {pagination.total_pages > 1 && (
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                Showing {((pagination.page - 1) * pagination.limit) + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} suppliers
              </div>
              
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fetchSuppliers(pagination.page - 1)}
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
                        onClick={() => fetchSuppliers(pageNum)}
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
                  onClick={() => fetchSuppliers(pagination.page + 1)}
                  disabled={pagination.page >= pagination.total_pages}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
