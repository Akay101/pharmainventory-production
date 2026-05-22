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
import { Checkbox } from "../components/ui/checkbox";
import { 
  Search, 
  Plus, 
  Truck, 
  Edit2, 
  Trash2, 
  Loader2, 
  Phone, 
  Mail, 
  MapPin, 
  ChevronLeft, 
  ChevronRight, 
  FileText, 
  CreditCard, 
  ExternalLink, 
  ShieldCheck,
  Users,
  Layers
} from "lucide-react";
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

  // Merge Dialog State
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [mergeSearch, setMergeSearch] = useState("");
  const [mergeCandidates, setMergeCandidates] = useState([]);
  const [mergeSelected, setMergeSelected] = useState({});
  const [mergePreview, setMergePreview] = useState(null);
  const [mergeNewName, setMergeNewName] = useState("");
  const [mergeLoading, setMergeLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);

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

  const openMergeDialog = () => {
    setMergeDialogOpen(true);
    setMergeSelected({});
    setMergePreview(null);
    setMergeNewName("");
    setMergeSearch("");
    fetchMergeCandidates("");
  };

  const fetchMergeCandidates = async (term) => {
    try {
      const resp = await axios.get(`${API}/suppliers?limit=200&search=${term}`);
      setMergeCandidates(resp.data.suppliers || []);
    } catch (e) {
      toast.error("Failed to fetch merge candidates");
    }
  };

  useEffect(() => {
    if (mergeDialogOpen) {
      const delay = setTimeout(() => fetchMergeCandidates(mergeSearch), 300);
      return () => clearTimeout(delay);
    }
  }, [mergeSearch, mergeDialogOpen]);

  const toggleMergeSelection = (id) => {
    setMergeSelected(prev => {
      const next = { ...prev };
      if (next[id]) delete next[id];
      else next[id] = true;
      return next;
    });
  };

  const handleFetchMergePreview = async () => {
    const ids = Object.keys(mergeSelected);
    if (ids.length < 2) return toast.error("Select at least 2 suppliers to merge");

    setPreviewLoading(true);
    try {
      const res = await axios.post(`${API}/suppliers/merge-preview`, { supplier_ids: ids });
      setMergePreview(res.data);
    } catch(err) {
      toast.error("Failed to load preview");
    } finally {
      setPreviewLoading(false);
    }
  };

  const executeMerge = async () => {
    const ids = Object.keys(mergeSelected);
    if (ids.length < 2) return toast.error("Select at least 2 suppliers");
    if (!mergeNewName || mergeNewName.trim() === "") return toast.error("Enter a robust new supplier name");

    setMergeLoading(true);
    try {
      await axios.post(`${API}/suppliers/merge`, {
        supplier_ids: ids,
        new_name: mergeNewName
      });
      toast.success("Suppliers seamlessly merged!");
      setMergeDialogOpen(false);
      setMergeSelected({});
      setMergePreview(null);
      setMergeNewName("");
      fetchSuppliers(1);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to execute merge operation");
    } finally {
      setMergeLoading(false);
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
          <p className="text-xs font-bold text-muted-foreground/80 uppercase tracking-widest animate-pulse">Loading Suppliers...</p>
        </div>
      </div>
    );
  }

  // Active page statistics calculations
  const totalDuesOnPage = suppliers.reduce((acc, curr) => acc + (curr.total_amount_owed || 0), 0);
  const totalMergedOnPage = suppliers.filter(s => s.merge_history && s.merge_history.length > 0).length;

  return (
    <div className="space-y-6 animate-fade-in pb-12" data-testid="suppliers-page">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-border/40 pb-6">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-foreground to-foreground/75 bg-clip-text text-transparent flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10 text-primary border border-primary/20 shrink-0">
              <Truck className="w-8 h-8" />
            </div>
            Suppliers Directory
          </h1>
          <p className="text-sm text-muted-foreground mt-1.5 font-medium">
            Manage pharmaceutical vendors, review ledger invoices, and resolve outstanding balances.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Merge Suppliers Dialog */}
          <Dialog open={mergeDialogOpen} onOpenChange={setMergeDialogOpen}>
            <Button 
              variant="outline" 
              className="h-10 text-sm font-semibold border-border/80 hover:bg-muted rounded-xl transition-all flex items-center gap-2" 
              onClick={openMergeDialog}
            >
              <Layers className="w-4 h-4 text-primary" />
              Merge Suppliers
            </Button>
            <DialogContent className="max-w-xl max-h-[85vh] overflow-hidden flex flex-col p-6 rounded-2xl border border-border bg-background shadow-2xl">
              <DialogHeader className="shrink-0 mb-4">
                <DialogTitle className="text-xl font-bold flex items-center gap-2">
                  <Layers className="w-5 h-5 text-primary" />
                  Merge Multiple Suppliers
                </DialogTitle>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  Select duplicate or overlapping legacy suppliers to seamlessly amalgamate their accounts, catalogs, and purchase transactions into a single master profile.
                </p>
              </DialogHeader>

              {!mergePreview ? (
                <>
                  <div className="py-2 flex-1 overflow-hidden flex flex-col min-h-0">
                    <div className="relative mb-4 shrink-0">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
                      <Input 
                        placeholder="Search candidates by name..." 
                        className="pl-9 h-10 border-border/80 focus-visible:ring-primary focus-visible:ring-offset-0 rounded-xl" 
                        value={mergeSearch} 
                        onChange={(e) => setMergeSearch(e.target.value)} 
                      />
                    </div>
                    <div className="border border-border/80 rounded-2xl flex-1 overflow-y-auto p-3 bg-muted/5 space-y-1.5 min-h-[300px]">
                      {mergeCandidates.map((c) => (
                        <div 
                          key={c.id} 
                          className={`flex items-center space-x-3 p-3 hover:bg-muted rounded-xl transition-all cursor-pointer border ${
                            mergeSelected[c.id] ? "bg-primary/5 border-primary/20" : "border-transparent"
                          }`}
                          onClick={() => toggleMergeSelection(c.id)}
                        >
                          <Checkbox checked={!!mergeSelected[c.id]} className="pointer-events-none rounded border-border" />
                          <div className="flex flex-col min-w-0">
                            <span className="text-sm font-semibold text-foreground truncate">{c.name}</span>
                            <span className="text-xs text-muted-foreground truncate mt-0.5">
                              {c.phone || c.email || c.gst_no || "No Contact info"}
                            </span>
                          </div>
                        </div>
                      ))}
                      {mergeCandidates.length === 0 && (
                        <p className="text-center text-xs text-muted-foreground font-medium py-16">
                          No candidates found
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="pt-4 border-t border-border/45 flex justify-between items-center bg-background shrink-0">
                    <span className="text-xs font-semibold text-muted-foreground">{Object.keys(mergeSelected).length} selected</span>
                    <Button 
                      onClick={handleFetchMergePreview} 
                      className="btn-primary h-10 px-4 rounded-xl font-bold shadow-md" 
                      disabled={Object.keys(mergeSelected).length < 2 || previewLoading}
                    >
                      {previewLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                      Preview Merge Details
                    </Button>
                  </div>
                </>
              ) : (
                <div className="space-y-4 pt-2 flex-1 overflow-y-auto min-h-0">
                  <div className="bg-primary/5 border border-primary/20 rounded-2xl p-5">
                    <h4 className="font-bold text-primary text-sm mb-3">Merge Blueprint Matrix</h4>
                    <div className="space-y-2 max-h-[150px] overflow-y-auto pr-1">
                      {mergePreview.preview.map(p => (
                        <div key={p.id} className="flex justify-between items-center text-xs border-b border-primary/10 pb-2 last:border-0 last:pb-0 font-medium">
                          <span className="text-foreground/80 truncate max-w-[250px]">{p.name}</span>
                          <span className="text-muted-foreground font-mono shrink-0">{p.purchases} Purchases</span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 pt-3 border-t border-primary/20 flex justify-between items-center text-primary font-bold text-sm">
                      <span>Total Consolidated Purchases</span>
                      <span className="font-mono">{mergePreview.totalPurchases} Purchases</span>
                    </div>
                  </div>

                  <div className="space-y-3 bg-muted/20 p-5 rounded-2xl border border-border/60">
                    <Label className="text-xs font-bold text-muted-foreground uppercase">Name for the Master Merged Supplier</Label>
                    <Input 
                      placeholder="E.g., ABC Pharma Merged Entity" 
                      value={mergeNewName} 
                      onChange={(e) => setMergeNewName(e.target.value)} 
                      className="bg-background h-10 border-border/80 focus-visible:ring-primary focus-visible:ring-offset-0 rounded-xl"
                    />
                    <p className="text-[11px] text-muted-foreground/80 leading-relaxed font-medium">
                      All older mapped inventory and historical purchase invoices will automatically reroute seamlessly to this newly typed name. This cannot be undone.
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-border/40 shrink-0 mt-4">
                    <Button variant="ghost" onClick={() => setMergePreview(null)} className="h-10 text-sm font-semibold rounded-xl hover:bg-muted">
                      Back to Selection
                    </Button>
                    <Button 
                      onClick={executeMerge} 
                      disabled={mergeLoading || !mergeNewName} 
                      className="btn-primary h-10 px-4 rounded-xl font-bold shadow-md"
                    >
                      {mergeLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                      Confirm Consolidation
                    </Button>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>

          <Dialog
            open={dialogOpen}
            onOpenChange={(open) => {
              setDialogOpen(open);
              if (!open) resetForm();
            }}
          >
            <DialogTrigger asChild>
              <Button className="btn-primary flex items-center gap-2 rounded-xl h-10" data-testid="add-supplier-btn">
                <Plus className="w-4 h-4" />
                Add Supplier
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md rounded-2xl border border-border bg-background shadow-2xl p-6">
              <DialogHeader>
                <DialogTitle className="text-xl font-bold">
                  {editingSupplier ? "Edit Supplier" : "Add New Supplier"}
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-muted-foreground uppercase">Supplier Name *</Label>
                  <Input
                    placeholder="E.g. ABC Pharmaceuticals"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="h-10 border-border/80 focus-visible:ring-primary focus-visible:ring-offset-0 rounded-xl"
                    data-testid="supplier-name-input"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-muted-foreground uppercase">Phone</Label>
                    <Input
                      placeholder="E.g. +91 98765 43210"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="h-10 border-border/80 focus-visible:ring-primary focus-visible:ring-offset-0 rounded-xl"
                      data-testid="supplier-phone-input"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-muted-foreground uppercase">Email</Label>
                    <Input
                      type="email"
                      placeholder="E.g. info@abc.com"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="h-10 border-border/80 focus-visible:ring-primary focus-visible:ring-offset-0 rounded-xl"
                      data-testid="supplier-email-input"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-bold text-muted-foreground uppercase">Address</Label>
                  <Input
                    placeholder="E.g. 123 Business Street, Sector 4, Mumbai"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    className="h-10 border-border/80 focus-visible:ring-primary focus-visible:ring-offset-0 rounded-xl"
                    data-testid="supplier-address-input"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-bold text-muted-foreground uppercase">GST Number</Label>
                  <Input
                    placeholder="E.g. 27ABCDE1234F1Z5"
                    value={formData.gst_no}
                    onChange={(e) => setFormData({ ...formData, gst_no: e.target.value })}
                    className="h-10 border-border/80 focus-visible:ring-primary focus-visible:ring-offset-0 rounded-xl"
                    data-testid="supplier-gst-input"
                  />
                </div>

                <Button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="w-full btn-primary h-10 rounded-xl flex items-center justify-center font-bold text-sm shadow-md mt-2"
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
      </div>

      {/* Top Stat Overview Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Total Suppliers */}
        <Card className="glass bg-card/45 border-border/70 shadow-md rounded-2xl relative overflow-hidden group hover:border-primary/30 transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-full blur-2xl transform translate-x-4 -translate-y-4"></div>
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center border border-primary/20 shrink-0">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Registered Vendors</p>
              <h3 className="text-2xl font-black font-mono tracking-tight mt-1">{pagination.total}</h3>
            </div>
          </CardContent>
        </Card>

        {/* Outstanding Balance */}
        <Card className="glass bg-card/45 border-border/70 shadow-md rounded-2xl relative overflow-hidden group hover:border-red-500/30 transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-red-500/5 rounded-full blur-2xl transform translate-x-4 -translate-y-4"></div>
          <CardContent className="p-6 flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center border shrink-0 ${
              totalDuesOnPage > 0 
                ? "bg-red-500/10 text-red-500 border-red-500/20 shadow-lg shadow-red-500/10" 
                : "bg-green-500/10 text-green-500 border-green-500/20 shadow-lg shadow-green-500/10"
            }`}>
              <CreditCard className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Page Dues Owed</p>
              <h3 className={`text-2xl font-black font-mono tracking-tight mt-1 ${
                totalDuesOnPage > 0 ? "text-red-500" : "text-green-500"
              }`}>
                ₹{totalDuesOnPage.toFixed(2)}
              </h3>
            </div>
          </CardContent>
        </Card>

        {/* Consolidated Accounts */}
        <Card className="glass bg-card/45 border-border/70 shadow-md rounded-2xl relative overflow-hidden group hover:border-accent/30 transition-all">
          <div className="absolute top-0 right-0 w-24 h-24 bg-accent/5 rounded-full blur-2xl transform translate-x-4 -translate-y-4"></div>
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-accent/10 text-accent flex items-center justify-center border border-accent/20 shrink-0">
              <Layers className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Merged (This Page)</p>
              <h3 className="text-2xl font-black font-mono tracking-tight mt-1">
                {totalMergedOnPage}
              </h3>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Supplier Details Modal */}
      <Dialog open={detailsDialog.open} onOpenChange={(open) => !open && setDetailsDialog({ open: false, data: null, loading: false })}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-0 border border-border/70 bg-background/95 backdrop-blur-xl rounded-2xl shadow-2xl w-11/12">
          {detailsDialog.loading ? (
            <div className="flex items-center justify-center h-64 shrink-0">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : detailsDialog.data ? (
            <div className="flex-1 overflow-hidden flex flex-col min-h-0">
              {/* Header Section */}
              <div className="bg-gradient-to-br from-primary/10 to-accent/5 p-6 md:p-8 flex flex-col md:flex-row justify-between items-start md:items-center border-b border-border/40 gap-4 shrink-0">
                <div>
                  <h2 className="text-2xl font-black tracking-tight text-foreground flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center border border-primary/20 shrink-0">
                      <Truck className="w-5 h-5" />
                    </div>
                    {detailsDialog.data.supplier.name}
                  </h2>
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3 text-xs text-muted-foreground font-semibold">
                    {detailsDialog.data.supplier.phone && (
                      <span className="flex items-center gap-1">
                        <Phone className="w-3.5 h-3.5 text-primary/70 shrink-0" />
                        {detailsDialog.data.supplier.phone}
                      </span>
                    )}
                    {detailsDialog.data.supplier.email && (
                      <span className="flex items-center gap-1">
                        <Mail className="w-3.5 h-3.5 text-primary/70 shrink-0" />
                        {detailsDialog.data.supplier.email}
                      </span>
                    )}
                    {detailsDialog.data.supplier.gst_no && (
                      <span className="flex items-center gap-1 font-mono text-primary">
                        <FileText className="w-3.5 h-3.5 text-primary/70 shrink-0" />
                        GST: {detailsDialog.data.supplier.gst_no}
                      </span>
                    )}
                  </div>
                </div>
                
                <div className="bg-background/80 rounded-2xl p-4 border border-border/80 shadow-md min-w-[200px] text-center flex flex-col justify-center gap-2 shrink-0 self-stretch md:self-auto">
                  <div>
                    <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-0.5">Total Amount Owed</p>
                    <p className={`text-2xl font-black font-mono tracking-tight ${detailsDialog.data.total_amount_owed > 0 ? 'text-red-500' : 'text-green-500'}`}>
                      ₹{(detailsDialog.data.total_amount_owed || 0).toFixed(2)}
                    </p>
                  </div>
                  {detailsDialog.data.total_amount_owed > 0 && (
                    <Button 
                      onClick={() => handleClearAllDues(detailsDialog.data.supplier.id)} 
                      size="sm" 
                      className="w-full font-bold text-xs shadow-md btn-primary h-8 flex items-center justify-center gap-1 rounded-lg"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" /> Clear All Dues
                    </Button>
                  )}
                </div>
              </div>
              
              {/* Body Section */}
              <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6">
                {/* Merge Protocol Banner */}
                {detailsDialog.data.supplier.merge_history && detailsDialog.data.supplier.merge_history.length > 0 && (
                  <div className="bg-accent/5 border border-accent/20 rounded-2xl p-5 shadow-sm relative overflow-hidden shrink-0">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-accent/10 rounded-full blur-2xl transform translate-x-1/2 -translate-y-1/2"></div>
                    <h4 className="text-accent font-bold text-sm mb-2 flex items-center gap-2">
                      <ShieldCheck className="w-4.5 h-4.5" /> Consolidated Entity History
                    </h4>
                    <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
                      This merged supplier profile incorporates ledger records, inventory catalogs, and transactions from the following legacy suppliers:
                    </p>
                    <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 relative z-10">
                      {detailsDialog.data.supplier.merge_history.map(mh => (
                        <div key={mh.id} className="bg-background/50 p-2.5 rounded-xl border border-border/60 flex justify-between items-center text-xs shadow-sm">
                          <span className="font-semibold text-foreground/80 truncate pr-2">{mh.name}</span>
                          <span className="text-[10px] text-muted-foreground font-mono font-bold bg-muted px-2 py-0.5 rounded border border-border/30 shrink-0">
                            {mh.purchases} invoices
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-bold flex items-center gap-2 text-foreground">
                    <CreditCard className="w-4.5 h-4.5 text-primary" /> Purchase Ledger
                  </h3>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => navigate(`/purchases?supplier_id=${detailsDialog.data.supplier.id}`)} 
                    className="text-xs font-semibold h-8 rounded-lg border-border/80 hover:bg-muted flex items-center gap-1"
                  >
                    See all purchases <ExternalLink className="w-3 h-3" />
                  </Button>
                </div>
                
                {detailsDialog.data.purchases?.length === 0 ? (
                  <div className="text-center py-12 bg-muted/20 rounded-2xl border border-dashed border-border p-6 shrink-0">
                    <FileText className="w-10 h-10 mx-auto mb-2 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground font-medium">No purchases exist for this supplier.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {detailsDialog.data.purchases.map(purchase => {
                      const isPaid = purchase.payment_status === "Paid";
                      const remaining = (purchase.total_amount || 0) - (purchase.amount_paid || 0);
                      return (
                        <div 
                          key={purchase.id} 
                          className="bg-card border border-border/50 rounded-2xl p-5 flex flex-col md:flex-row justify-between gap-5 relative overflow-hidden group hover:border-primary/20 transition-all shadow-sm"
                        >
                          {/* Purchase Info */}
                          <div className="flex-1 space-y-3 min-w-0">
                            <div className="flex flex-wrap items-center gap-2.5">
                              <div className="bg-muted px-2.5 py-0.5 rounded border border-border/50">
                                <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider block leading-tight">Invoice No</span>
                                <p className="text-xs font-mono font-bold text-foreground">{purchase.invoice_no || "N/A"}</p>
                              </div>
                              <span className="text-xs font-semibold text-muted-foreground/90 bg-muted/40 px-2.5 py-1 rounded border border-border/30">
                                {formatDate(purchase.purchase_date)}
                              </span>
                              <span className={`px-2.5 py-0.5 text-[10px] font-extrabold uppercase rounded-full tracking-wider border ${
                                isPaid ? 'bg-green-500/10 text-green-500 border-green-500/20' : 
                                purchase.payment_status === 'Partial' ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' : 
                                'bg-red-500/10 text-red-500 border-red-500/20'
                              }`}>
                                {purchase.payment_status || "Unpaid"}
                              </span>
                            </div>
                            
                            <div className="text-sm font-semibold text-foreground/80">
                              Billed: <span className="font-mono font-bold text-foreground text-base">₹{purchase.total_amount?.toFixed(2)}</span>
                            </div>
                            
                            <div className="flex items-center gap-3">
                              {purchase.payments?.length > 0 && (
                                <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary border border-primary/20 shrink-0" title={`${purchase.payments.length} partial payments recorded`}>
                                  <FileText className="w-3 h-3" />
                                </div>
                              )}
                              <p className="text-xs text-muted-foreground font-medium truncate">
                                {purchase.items?.length || 0} product lines purchased.
                              </p>
                            </div>
                          </div>
                          
                          {/* Action Info */}
                          <div className="md:w-56 shrink-0 flex flex-col justify-center border-l-0 md:border-l border-border pl-0 md:pl-5 pt-3 md:pt-0 border-t md:border-t-0 space-y-3">
                            <div className="flex justify-between items-center bg-muted/30 p-2.5 rounded-xl border border-border/50">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Remaining</span>
                              <span className={`text-base font-mono font-extrabold ${remaining > 0 ? "text-red-500" : "text-green-500"}`}>₹{Math.max(0, remaining).toFixed(2)}</span>
                            </div>
                            {!isPaid && (
                              <div className="flex gap-2">
                                <Button 
                                  size="sm" 
                                  onClick={() => setPaymentDialog({ open: true, purchase })} 
                                  className="flex-1 btn-primary text-xs shadow-md h-8 rounded-lg flex items-center justify-center gap-1"
                                >
                                  <Plus className="w-3 h-3" /> Pay Part
                                </Button>
                                <Button 
                                  size="sm" 
                                  onClick={() => handleMarkAsPaid(purchase)} 
                                  variant="outline" 
                                  className="flex-1 text-xs h-8 rounded-lg border-border/80 hover:bg-green-500/10 hover:text-green-500 hover:border-green-500/30 transition-all flex items-center justify-center gap-1"
                                >
                                  <ShieldCheck className="w-3 h-3" /> Paid Full
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
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
        <DialogContent className="max-w-md rounded-2xl border border-border bg-background shadow-2xl p-6">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Register Partial Payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label className="text-xs font-bold text-muted-foreground uppercase">Amount Paid Today (₹)</Label>
              <Input 
                type="number" 
                min="0" 
                step="0.01" 
                value={newPaymentAmount} 
                onChange={(e) => setNewPaymentAmount(e.target.value)} 
                className="h-10 border-border/80 focus-visible:ring-primary focus-visible:ring-offset-0 rounded-xl"
                placeholder="0.00"
              />
              {paymentDialog.purchase && (
                <p className="text-[11px] font-semibold text-muted-foreground/80 mt-1.5 flex justify-between">
                  <span>Total Bill: ₹{paymentDialog.purchase.total_amount.toFixed(2)}</span>
                  <span>Outstanding: ₹{(paymentDialog.purchase.total_amount - (paymentDialog.purchase.amount_paid || 0)).toFixed(2)}</span>
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold text-muted-foreground uppercase">Reference Notes</Label>
              <Input 
                placeholder="E.g. Check #, UPI Ref, Bank Transfer..." 
                value={newPaymentNotes} 
                onChange={(e) => setNewPaymentNotes(e.target.value)} 
                className="h-10 border-border/80 focus-visible:ring-primary focus-visible:ring-offset-0 rounded-xl"
              />
            </div>
            <Button 
              onClick={handleAddNewPayment} 
              disabled={submitting} 
              className="w-full btn-primary h-10 rounded-xl flex items-center justify-center font-bold text-sm shadow-md mt-2"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Confirm Payment
            </Button>
          </div>
        </DialogContent>
      </Dialog>


      <AlertDialog open={deleteConfirm.open} onOpenChange={(open) => setDeleteConfirm({ ...deleteConfirm, open })}>
        <AlertDialogContent className="rounded-2xl max-w-sm border border-border bg-background p-6 shadow-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-bold">Delete Supplier</AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-muted-foreground">
              Are you sure you want to delete this supplier? This action is permanent and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4 flex gap-2">
            <AlertDialogCancel className="h-10 rounded-xl border border-border hover:bg-muted font-semibold">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmDelete} 
              className="h-10 rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90 font-semibold shadow-md shadow-destructive/10"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={clearDuesConfirm.open} onOpenChange={(open) => setClearDuesConfirm({ ...clearDuesConfirm, open })}>
        <AlertDialogContent className="rounded-2xl max-w-sm border border-border bg-background p-6 shadow-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-bold">Clear All Dues</AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-muted-foreground">
              Are you sure you want to clear all outstanding dues for this supplier? This will mark all unpaid purchase invoices as fully paid.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4 flex gap-2">
            <AlertDialogCancel className="h-10 rounded-xl border border-border hover:bg-muted font-semibold">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmClearAllDues} 
              className="h-10 rounded-xl btn-primary font-semibold shadow-md"
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Search */}
      <Card className="glass bg-card/45 border border-border/70 shadow-md rounded-2xl overflow-hidden">
        <CardContent className="p-4">
          <div className="flex gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-muted-foreground/60" />
              <Input
                placeholder="Search suppliers by name, phone, email or GST..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 h-11 bg-background/30 border-border/60 focus-visible:ring-primary focus-visible:ring-offset-0 rounded-xl transition-all"
                data-testid="supplier-search"
              />
            </div>
            {search && (
              <Button 
                variant="outline" 
                onClick={() => setSearch("")}
                className="h-11 px-4 border-border/80 rounded-xl hover:bg-muted font-semibold transition-all"
              >
                Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Suppliers Grid */}
      {suppliers.length === 0 ? (
        <Card className="glass bg-card/45 border border-border/70 shadow-md rounded-2xl">
          <CardContent className="py-16 text-center">
            <div className="w-16 h-16 rounded-full bg-muted/50 text-muted-foreground flex items-center justify-center mx-auto mb-4 border border-border/50">
              <Truck className="w-8 h-8 opacity-60" />
            </div>
            <h3 className="text-lg font-bold text-foreground">No suppliers found</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-xs mx-auto">
              Try modifying your search keywords or register a new supplier to get started.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {suppliers.map((supplier) => {
              const initial = supplier.name ? supplier.name.charAt(0).toUpperCase() : "?";
              return (
                <Card
                  key={supplier.id}
                  id={`record-${supplier.id}`}
                  className="glass bg-card/45 border-border/70 shadow-md hover:shadow-lg rounded-2xl hover:border-primary/30 transition-all duration-300 relative overflow-hidden group p-5"
                  data-testid={`supplier-card-${supplier.id}`}
                >
                  <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary/30 to-accent/30 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                  
                  <div className="flex items-start justify-between mb-4 gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div 
                        className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/10 to-accent/10 border border-primary/20 flex items-center justify-center text-primary font-bold text-lg cursor-pointer hover:scale-105 transition-transform shrink-0" 
                        onClick={() => handleViewDetails(supplier.id)}
                      >
                        {initial}
                      </div>
                      <div className="cursor-pointer min-w-0 flex-1" onClick={() => handleViewDetails(supplier.id)}>
                        <h3 className="font-bold text-foreground group-hover:text-primary transition-colors flex items-center gap-1.5 text-base truncate">
                          {supplier.name} 
                          <ExternalLink className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 text-muted-foreground" />
                        </h3>
                        {supplier.gst_no ? (
                          <p className="inline-block mt-1 font-mono text-[10px] font-bold text-primary/80 bg-primary/5 px-2 py-0.5 rounded border border-primary/10">
                            GST: {supplier.gst_no}
                          </p>
                        ) : (
                          <p className="inline-block mt-1 font-mono text-[10px] font-medium text-muted-foreground/60 bg-muted/20 px-2 py-0.5 rounded border border-border/50">
                            NO GST
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-0.5 bg-muted/20 p-0.5 rounded-lg border border-border/50 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEdit(supplier)}
                        className="w-8 h-8 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all"
                        data-testid={`edit-supplier-${supplier.id}`}
                        title="Edit Supplier"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(supplier.id)}
                        className="w-8 h-8 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
                        data-testid={`delete-supplier-${supplier.id}`}
                        title="Delete Supplier"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* Outstanding Balance Banner */}
                  <div 
                    className={`-mx-5 px-5 py-2.5 mt-2 mb-4 flex justify-between items-center border-y cursor-pointer hover:bg-muted/40 transition-colors ${
                      supplier.total_amount_owed > 0 
                        ? "bg-red-500/5 border-red-500/10 hover:border-red-500/20" 
                        : "bg-green-500/5 border-green-500/10 hover:border-green-500/20"
                    }`} 
                    onClick={() => handleViewDetails(supplier.id)}
                  >
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Outstanding</span>
                    <span className={`font-mono font-bold text-sm ${supplier.total_amount_owed > 0 ? "text-red-500" : "text-green-500"}`}>
                      ₹{(supplier.total_amount_owed || 0).toFixed(2)}
                    </span>
                  </div>

                  <div className="space-y-2 text-xs">
                    {supplier.phone && (
                      <div className="flex items-center gap-2.5 text-muted-foreground/80 hover:text-foreground transition-colors">
                        <Phone className="w-4 h-4 text-primary/70 shrink-0" />
                        <span className="font-medium truncate">{supplier.phone}</span>
                      </div>
                    )}
                    {supplier.email && (
                      <div className="flex items-center gap-2.5 text-muted-foreground/80 hover:text-foreground transition-colors">
                        <Mail className="w-4 h-4 text-primary/70 shrink-0" />
                        <span className="font-medium truncate" title={supplier.email}>{supplier.email}</span>
                      </div>
                    )}
                    {supplier.address && (
                      <div className="flex items-center gap-2.5 text-muted-foreground/80 hover:text-foreground transition-colors">
                        <MapPin className="w-4 h-4 text-primary/70 shrink-0" />
                        <span className="font-medium truncate" title={supplier.address}>{supplier.address}</span>
                      </div>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>

          {/* Pagination */}
          {pagination.total_pages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between px-6 py-4 border border-border/40 bg-muted/5 rounded-2xl gap-4 mt-6">
              <div className="text-xs font-bold text-muted-foreground/80">
                Showing {((pagination.page - 1) * pagination.limit) + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} suppliers
              </div>
              
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fetchSuppliers(pagination.page - 1)}
                  disabled={pagination.page <= 1}
                  className="h-8 text-xs font-bold border-border/80 hover:bg-muted rounded-lg"
                >
                  <ChevronLeft className="h-3.5 w-3.5 mr-1 text-primary" />
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
                        className={`w-8 h-8 p-0 text-xs font-bold rounded-lg border ${
                          pageNum === pagination.page
                            ? "bg-primary text-primary-foreground shadow-md shadow-primary/10 border-primary"
                            : "border-border/80 hover:bg-muted"
                        }`}
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
                  className="h-8 text-xs font-bold border-border/80 hover:bg-muted rounded-lg"
                >
                  Next
                  <ChevronRight className="h-3.5 w-3.5 ml-1 text-primary" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
