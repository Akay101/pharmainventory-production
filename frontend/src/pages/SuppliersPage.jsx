import { useState, useEffect, useCallback } from "react";
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
import { Search, Plus, Truck, Edit2, Trash2, Loader2, Phone, Mail, MapPin, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";

export default function SuppliersPage() {
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

  const handleDelete = async (supplierId) => {
    if (!window.confirm("Are you sure you want to delete this supplier?")) return;

    try {
      await axios.delete(`${API}/suppliers/${supplierId}`);
      toast.success("Supplier deleted successfully");
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
                className="bg-card/50 backdrop-blur-sm border-white/5 hover:border-primary/20 transition-colors"
                data-testid={`supplier-card-${supplier.id}`}
              >
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Truck className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold">{supplier.name}</h3>
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
