import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import axios from "axios";
import { API, useAuth } from "../App";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
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
import { Search, Plus, Package, AlertTriangle, ChevronLeft, ChevronRight, ArrowUpDown, Trash2, Loader2, BellOff, Info, X, CalendarX, RotateCcw, CheckCircle2, Clock } from "lucide-react";
import { toast } from "sonner";
import Loader from "../components/Loader";
import RightSidebarDrawer from "../components/RightSidebarDrawer";
import ProductSearchDropdown from "../components/ProductSearchDropdown";

export default function InventoryPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { settings } = useAuth();
  const isInitialMount = useRef(true);
  const [inventory, setInventory] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showLowStock, setShowLowStock] = useState(false);
  const [showShortage, setShowShortage] = useState(false);
  const [showExpiringSoon, setShowExpiringSoon] = useState(false);
  const [showExpired, setShowExpired] = useState(false);
  const [sidebarTab, setSidebarTab] = useState("batches");
  const [shortageCount, setShortageCount] = useState(0);
  const [deleteDialog, setDeleteDialog] = useState({ open: false, item: null, type: null });
  const [removeShortageDialog, setRemoveShortageDialog] = useState({ open: false, item: null, newThreshold: "" });
  const [addStockDialog, setAddStockDialog] = useState({ open: false, item: null, quantityToAdd: "" });
  const [productDialog, setProductDialog] = useState(false);
  const [newProduct, setNewProduct] = useState({
    name: "",
    category: "medicine",
    hsn_no: "",
    description: "",
    low_stock_threshold: 10,
    shortage_threshold: 10,
  });

  // Merge States
  const [selectedItemIds, setSelectedItemIds] = useState([]);
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [mergeFormData, setMergeFormData] = useState({
    merged_name: "",
    merged_manufacturer: "",
    merged_salt: "",
    merged_hsn: "",
  });
  const [merging, setMerging] = useState(false);

  // Product Catalog Details State
  const [detailProduct, setDetailProduct] = useState(null);
  const [detailBatches, setDetailBatches] = useState([]);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Merge Other Catalog Product States
  const [showAddMergeForm, setShowAddMergeForm] = useState(false);
  const [productsToMerge, setProductsToMerge] = useState([]);
  const [mergingOther, setMergingOther] = useState(false);

  // Pagination State
  const [pagination, setPagination] = useState({ page: 1, limit: 30, total: 0, total_pages: 1 });
  const [catalogPagination, setCatalogPagination] = useState({ page: 1, limit: 12, total: 0, total_pages: 1 });
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [allProductsForMerge, setAllProductsForMerge] = useState([]);
  const [sortBy, setSortBy] = useState("created_at");
  const [sortOrder, setSortOrder] = useState("desc");

  const handleOpenMergeDialog = () => {
    const selectedItems = inventory.filter((item) => selectedItemIds.includes(item.id || item.product_id));
    if (selectedItems.length < 2) return;

    // Prefill form using the first selected item
    const firstItem = selectedItems[0];
    setMergeFormData({
      merged_name: firstItem.product_name || firstItem.name || "",
      merged_manufacturer: firstItem.manufacturer || "",
      merged_salt: firstItem.salt_composition || "",
      merged_hsn: firstItem.hsn_no || "",
    });
    setMergeDialogOpen(true);
  };

  const handleMergeSubmit = async () => {
    if (!mergeFormData.merged_name.trim()) {
      toast.error("Please enter a merged product name");
      return;
    }

    setMerging(true);
    try {
      // Gather all batch inventory IDs for the selected product groups
      const selectedGroups = inventory.filter(item => selectedItemIds.includes(item.id || item.product_id));
      const allBatchIds = [];
      selectedGroups.forEach(grp => {
        if (grp.batches && grp.batches.length > 0) {
          grp.batches.forEach(b => allBatchIds.push(b.id));
        } else if (grp.id) {
          allBatchIds.push(grp.id);
        }
      });

      await axios.post(`${API}/inventory/merge`, {
        inventory_ids: allBatchIds.length > 0 ? allBatchIds : selectedItemIds,
        ...mergeFormData,
      });

      toast.success("Products merged successfully");
      setMergeDialogOpen(false);
      setSelectedItemIds([]);
      await fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to merge products");
    } finally {
      setMerging(false);
    }
  };

  const handleOpenProductDetails = async (productGroup, autoOpenMerge = false) => {
    setDetailProduct({
      id: productGroup.product_id || productGroup.id,
      name: productGroup.product_name || productGroup.name,
      manufacturer: productGroup.manufacturer,
      salt_composition: productGroup.salt_composition,
      hsn_no: productGroup.hsn_no,
      category: productGroup.category || "medicine",
      low_stock_threshold: productGroup.low_stock_threshold || 10,
      shortage_threshold: productGroup.shortage_threshold,
      total_available_stock: productGroup.total_available_stock !== undefined ? productGroup.total_available_stock : productGroup.available_quantity,
      total_stock_value: productGroup.total_stock_value,
      batch_count: productGroup.batch_count || (productGroup.batches ? productGroup.batches.length : 1)
    });
    setDetailBatches(productGroup.batches || [productGroup]);
    if (autoOpenMerge) {
      setShowAddMergeForm(true);
    }
  };

  const handleSelectProductToMerge = (product) => {
    if (!product) return;
    const pName = (product.product_name || product.name || "").trim();
    if (productsToMerge.some(p => (p.product_name || p.name || "").trim().toLowerCase() === pName.toLowerCase())) {
      toast.error("Product already selected");
      return;
    }
    setProductsToMerge(prev => [...prev, product]);
  };

  const handleRemoveProductFromMerge = (productName) => {
    setProductsToMerge(prev => prev.filter(p => (p.product_name || p.name) !== productName));
  };

  const handleExecuteOtherMerge = async () => {
    if (productsToMerge.length === 0) {
      toast.error("Please select at least one product to merge");
      return;
    }
    setMergingOther(true);
    try {
      const targetInvIds = detailBatches.map(b => b.id);
      const otherInvIds = [];
      
      productsToMerge.forEach(p => {
        if (p.batches && p.batches.length > 0) {
          p.batches.forEach(b => otherInvIds.push(b.id));
        } else if (p.id) {
          otherInvIds.push(p.id);
        }
      });

      const allInvIds = [...targetInvIds, ...otherInvIds];

      if (allInvIds.length === 0) {
        toast.error("No inventory items found to perform merge");
        return;
      }

      const firstBatch = detailBatches[0] || {};
      await axios.post(`${API}/inventory/merge`, {
        inventory_ids: allInvIds,
        merged_name: detailProduct.name,
        merged_manufacturer: firstBatch.manufacturer || "",
        merged_salt: firstBatch.salt_composition || "",
        merged_hsn: firstBatch.hsn_no || ""
      });

      toast.success("Products merged successfully into " + detailProduct.name);
      setProductsToMerge([]);
      setShowAddMergeForm(false);
      await fetchData();

      // Refresh batches for current product
      const res = await axios.get(`${API}/inventory?grouped=true&search=${encodeURIComponent(detailProduct.name)}`);
      const matched = (res.data.inventory || []).find(g => (g.product_name || g.name) === detailProduct.name);
      setDetailBatches(matched?.batches || []);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to merge products");
    } finally {
      setMergingOther(false);
    }
  };

  const handleMoveBatchToExpiry = async (batch) => {
    try {
      await axios.post(`${API}/expiry/move-batch`, {
        inventory_id: batch.id,
        batch_no: batch.batch_no,
        product_name: detailProduct?.name || batch.product_name,
      });
      toast.success(`Batch ${batch.batch_no} moved to Expiry`);
      await fetchData();
      if (detailProduct?.name) {
        const res = await axios.get(`${API}/inventory?grouped=true&search=${encodeURIComponent(detailProduct.name)}`);
        const matched = (res.data.inventory || []).find(g => (g.product_name || g.name) === detailProduct.name);
        if (matched?.batches) setDetailBatches(matched.batches);
      }
    } catch (e) {
      toast.error("Failed to move batch to expiry");
    }
  };

  const handleMoveBatchToReturns = async (batch) => {
    try {
      await axios.post(`${API}/returns/move-batch`, {
        inventory_id: batch.id,
        batch_no: batch.batch_no,
        product_name: detailProduct?.name || batch.product_name,
      });
      toast.success(`Batch ${batch.batch_no} moved to Returns`);
      await fetchData();
      if (detailProduct?.name) {
        const res = await axios.get(`${API}/inventory?grouped=true&search=${encodeURIComponent(detailProduct.name)}`);
        const matched = (res.data.inventory || []).find(g => (g.product_name || g.name) === detailProduct.name);
        if (matched?.batches) setDetailBatches(matched.batches);
      }
    } catch (e) {
      toast.error("Failed to move batch to returns");
    }
  };

  const fetchInventory = useCallback(async (page = 1, highlightId = undefined) => {
    try {
      const params = new URLSearchParams();
      if (!highlightId) {
        params.append("page", page);
      }
      params.append("limit", pagination.limit);
      params.append("sort_by", sortBy);
      params.append("sort_order", sortOrder);
      params.append("grouped", "true");
      if (search) params.append("search", search);
      if (showLowStock) params.append("low_stock", "true");
      if (showShortage) params.append("shortage", "true");
      if (showExpiringSoon) params.append("expiring_soon", "true");
      if (showExpired) params.append("expired", "true");
      if (highlightId) params.append("highlight_id", highlightId);

      const response = await axios.get(`${API}/inventory?${params.toString()}`);
      let fetched = response.data.inventory || [];
      const todayStr = new Date().toISOString().split("T")[0];

      // Default View Filter: If no filter pills are active, show only in-stock & non-expired items
      const isNoFilterActive = !showLowStock && !showShortage && !showExpiringSoon && !showExpired && !search;
      if (isNoFilterActive) {
        fetched = fetched.filter((item) => {
          const totalStock = item.total_available_stock !== undefined ? item.total_available_stock : (item.available_quantity || 0);
          const earliestExp = item.earliest_expiry || item.expiry_date;
          const isNotExpired = !earliestExp || earliestExp >= todayStr;
          return totalStock > 0 && isNotExpired;
        });
      }

      setInventory(fetched);
      setPagination(response.data.pagination || { page: 1, limit: 30, total: fetched.length, total_pages: 1 });
      if (response.data.shortage_count !== undefined) {
        setShortageCount(response.data.shortage_count);
      }

      if (highlightId) {
        setTimeout(() => {
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
      toast.error("Failed to load inventory");
    }
  }, [search, showLowStock, showShortage, showExpiringSoon, showExpired, sortBy, sortOrder, pagination.limit]);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      if (location.state?.highlightId) {
        return;
      }
    }
    const debounce = setTimeout(() => {
      fetchInventory(1);
    }, 300);
    return () => clearTimeout(debounce);
  }, [search, showLowStock, showShortage, showExpiringSoon, sortBy, sortOrder]);

  const fetchData = async () => {
    try {
      const hlId = location.state?.highlightId;
      if (hlId) {
        await fetchInventory(1, hlId);
      } else {
        await fetchInventory(1);
      }
    } catch (error) {
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProduct = async () => {
    try {
      await axios.post(`${API}/products`, newProduct);
      toast.success("Product created successfully");
      setProductDialog(false);
      setNewProduct({
        name: "",
        category: "medicine",
        hsn_no: "",
        description: "",
        low_stock_threshold: 10,
        shortage_threshold: 10,
      });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to create product");
    }
  };

  const handleDeleteInventoryItem = async () => {
    if (!deleteDialog.item) return;
    try {
      await axios.delete(`${API}/inventory/${deleteDialog.item.id}`);
      toast.success("Inventory item deleted successfully");
      setDeleteDialog({ open: false, item: null, type: null });
      await fetchInventory(pagination.page);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to delete inventory item");
    }
  };

  const handleAddStock = async () => {
    if (!addStockDialog.quantityToAdd || Number(addStockDialog.quantityToAdd) <= 0) {
      toast.error("Please enter a valid quantity greater than 0");
      return;
    }
    try {
      await axios.patch(`${API}/inventory/${addStockDialog.item.id}/add-quantity`, {
        add_quantity: Number(addStockDialog.quantityToAdd)
      });
      toast.success("Stock increased successfully");
      setAddStockDialog({ open: false, item: null, quantityToAdd: "" });
      await fetchInventory(pagination.page);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to update stock");
    }
  };

  const handleDeleteProduct = async (deleteInventory = false) => {
    if (!deleteDialog.item) return;
    try {
      const response = await axios.delete(
        `${API}/products/${deleteDialog.item.id}?delete_inventory=${deleteInventory}`
      );
      toast.success(response.data.message);
      if (deleteInventory && response.data.deleted_inventory_items > 0) {
        toast.info(`${response.data.deleted_inventory_items} inventory items also deleted`);
      }
      setDeleteDialog({ open: false, item: null, type: null });
      await fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to delete product");
    }
  };

  const isExpiringSoonCheck = (expiryDate) => {
    if (!expiryDate || expiryDate === "-") return false;
    const expiry = new Date(expiryDate);
    const today = new Date();
    const diffDays = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
    return diffDays <= 90;
  };

  const isExpired = (expiryDate) => {
    return new Date(expiryDate) < new Date();
  };

  const handleSort = (field) => {
    const newOrder = sortBy === field && sortOrder === "desc" ? "asc" : "desc";
    setSortBy(field);
    setSortOrder(newOrder);
  };

  if (loading) {
    return <Loader size="lg" text="Loading Inventory..." />;
  }

  return (
    <div className="space-y-6 animate-fade-in" data-testid="inventory-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-border/40 pb-3">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-black tracking-tight text-foreground">Inventory</h1>
          <span className="text-[10px] font-black bg-orange-500/15 text-orange-500 border border-orange-500/30 px-2 py-0.5 rounded-md font-mono">
            {pagination.total} items in stock
          </span>
        </div>

        <div className="flex items-center gap-2">
          {selectedItemIds.length >= 2 && (
            <Button
              onClick={handleOpenMergeDialog}
              className="bg-amber-500 hover:bg-amber-600 text-white h-9 text-xs font-extrabold shadow-sm rounded-xl px-3 flex items-center gap-1.5 cursor-pointer"
              data-testid="merge-products-btn"
            >
              Merge Selected ({selectedItemIds.length})
            </Button>
          )}

          <Dialog open={productDialog} onOpenChange={setProductDialog}>
            <DialogTrigger asChild>
              <Button className="h-9 px-3.5 text-xs font-extrabold bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white rounded-xl shadow-xs border-none flex items-center gap-1.5 cursor-pointer" data-testid="add-product-btn">
                <Plus className="w-3.5 h-3.5 stroke-[3]" />
                Add Product
              </Button>
            </DialogTrigger>
          <DialogContent className="rounded-2xl border border-border/40 shadow-2xl max-w-md p-6">
            <DialogHeader className="border-b border-border/40 pb-4">
              <DialogTitle className="font-extrabold text-base tracking-tight text-foreground flex items-center gap-2">
                <Plus className="w-5 h-5 text-primary" />
                Add New Product
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold text-muted-foreground/80">Product Name *</Label>
                <Input
                  placeholder="Paracetamol 500mg"
                  value={newProduct.name}
                  onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                  data-testid="product-name-input"
                  className="h-10 text-sm font-bold border-border/80 focus:border-primary bg-card/25"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold text-muted-foreground/80">Category</Label>
                <Select
                  value={newProduct.category}
                  onValueChange={(v) => setNewProduct({ ...newProduct, category: v })}
                >
                  <SelectTrigger data-testid="product-category-select" className="h-10 text-sm border-border/80 bg-card/25">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border border-border/40 shadow-xl rounded-xl">
                    <SelectItem value="medicine" className="font-medium">Medicine</SelectItem>
                    <SelectItem value="cosmetic" className="font-medium">Cosmetic</SelectItem>
                    <SelectItem value="consumable" className="font-medium">Consumable</SelectItem>
                    <SelectItem value="equipment" className="font-medium">Equipment</SelectItem>
                    <SelectItem value="other" className="font-medium">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold text-muted-foreground/80">HSN Number</Label>
                <Input
                  placeholder="30049099"
                  value={newProduct.hsn_no}
                  onChange={(e) => setNewProduct({ ...newProduct, hsn_no: e.target.value })}
                  data-testid="product-hsn-input"
                  className="h-10 text-sm font-bold border-border/80 focus:border-primary bg-card/25"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold text-muted-foreground/80">Low Stock Threshold</Label>
                <Input
                  type="number"
                  placeholder="10"
                  value={newProduct.low_stock_threshold}
                  onChange={(e) =>
                    setNewProduct({ ...newProduct, low_stock_threshold: parseInt(e.target.value) || 10 })
                  }
                  data-testid="product-threshold-input"
                  className="h-10 text-sm font-bold border-border/80 focus:border-primary bg-card/25"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold text-muted-foreground/80">Shortage List Threshold</Label>
                <Input
                  type="number"
                  placeholder="10"
                  value={newProduct.shortage_threshold}
                  onChange={(e) =>
                    setNewProduct({ ...newProduct, shortage_threshold: parseInt(e.target.value) || 10 })
                  }
                  data-testid="product-shortage-threshold-input"
                  className="h-10 text-sm font-bold border-border/80 focus:border-primary bg-card/25"
                />
              </div>

              <Button onClick={handleCreateProduct} className="w-full bg-primary hover:bg-primary/95 text-primary-foreground h-10 text-xs font-bold shadow-md shadow-primary/10 rounded-xl mt-2" data-testid="save-product-btn">
                Create Product
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col md:flex-row items-center gap-3">
        <div className="flex-1 w-full relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by product name or batch..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 text-xs font-medium rounded-xl border-border/70 bg-card/60 backdrop-blur-md"
            data-testid="inventory-search"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto shrink-0 justify-end flex-wrap">
          <Button
            onClick={() => {
              setShowLowStock(!showLowStock);
              setShowShortage(false);
              setShowExpiringSoon(false);
              setShowExpired(false);
            }}
            className={`h-9 text-xs font-extrabold px-3.5 rounded-xl border transition-all duration-200 cursor-pointer ${
              showLowStock 
                ? "bg-amber-500 text-white border-amber-500 hover:bg-amber-600 shadow-xs" 
                : "bg-card/60 border-border/70 text-foreground hover:bg-muted"
            }`}
            data-testid="low-stock-filter-btn"
          >
            <AlertTriangle className={`w-3.5 h-3.5 mr-1.5 ${showLowStock ? "text-white" : "text-amber-500"}`} />
            Low Stock
          </Button>

          <Button
            onClick={() => {
              setShowShortage(!showShortage);
              setShowLowStock(false);
              setShowExpiringSoon(false);
              setShowExpired(false);
            }}
            className={`h-9 text-xs font-extrabold px-3.5 rounded-xl border transition-all duration-200 cursor-pointer ${
              showShortage 
                ? "bg-orange-500 text-white border-orange-500 hover:bg-orange-600 shadow-xs" 
                : "bg-card/60 border-border/70 text-foreground hover:bg-muted"
            }`}
            data-testid="shortage-filter-btn"
          >
            <AlertTriangle className={`w-3.5 h-3.5 mr-1.5 ${showShortage ? "text-white" : "text-orange-500"}`} />
            Shortage List {shortageCount > 0 && <Badge className={`ml-1.5 border-0 text-[10px] px-1.5 py-0.5 font-black rounded-full ${showShortage ? "bg-white text-orange-600" : "bg-orange-500 text-white"}`}>{shortageCount}</Badge>}
          </Button>

          <Button
            onClick={() => {
              setShowExpiringSoon(!showExpiringSoon);
              setShowLowStock(false);
              setShowShortage(false);
              setShowExpired(false);
            }}
            className={`h-9 text-xs font-extrabold px-3.5 rounded-xl border transition-all duration-200 cursor-pointer ${
              showExpiringSoon 
                ? "bg-amber-500 text-white border-amber-500 hover:bg-amber-600 shadow-xs" 
                : "bg-card/60 border-border/70 text-foreground hover:bg-muted"
            }`}
            data-testid="expiring-filter-btn"
          >
            <AlertTriangle className={`w-3.5 h-3.5 mr-1.5 ${showExpiringSoon ? "text-white" : "text-amber-500"}`} />
            Expiring Soon
          </Button>

          <Button
            onClick={() => {
              setShowExpired(!showExpired);
              setShowLowStock(false);
              setShowShortage(false);
              setShowExpiringSoon(false);
            }}
            className={`h-9 text-xs font-extrabold px-3.5 rounded-xl border transition-all duration-200 cursor-pointer ${
              showExpired 
                ? "bg-rose-600 text-white border-rose-600 hover:bg-rose-700 shadow-xs" 
                : "bg-card/60 border-border/70 text-foreground hover:bg-muted"
            }`}
            data-testid="expired-filter-btn"
          >
            <AlertTriangle className={`w-3.5 h-3.5 mr-1.5 ${showExpired ? "text-white" : "text-rose-500"}`} />
            Expired
          </Button>
          
          {(search || showLowStock || showShortage || showExpiringSoon || showExpired) && (
            <Button
              variant="outline"
              onClick={() => {
                setSearch("");
                setShowLowStock(false);
                setShowShortage(false);
                setShowExpiringSoon(false);
                setShowExpired(false);
              }}
              className="h-9 text-xs font-extrabold px-3 rounded-xl border border-border/70 hover:bg-muted cursor-pointer"
            >
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Inventory Table Container (Single Product per Row) */}
      <div className="border border-border/60 rounded-2xl relative overflow-hidden bg-card/60 backdrop-blur-md shadow-xs">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="border-b border-border bg-muted/60">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-10 h-9 text-center py-1.5">
                  <input
                    type="checkbox"
                    className="rounded border-border/80 focus:ring-primary w-4 h-4 cursor-pointer accent-primary"
                    checked={inventory.length > 0 && selectedItemIds.length === inventory.length}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedItemIds(inventory.map((item) => item.product_id || item.id));
                      } else {
                        setSelectedItemIds([]);
                      }
                    }}
                  />
                </TableHead>
                <TableHead className="font-extrabold text-[11px] text-muted-foreground uppercase tracking-wider h-9 py-1.5">
                  <Button
                    variant="ghost"
                    onClick={() => handleSort("product_name")}
                    className="h-auto p-0 font-extrabold text-[11px] uppercase tracking-wider hover:bg-transparent hover:text-foreground text-muted-foreground"
                  >
                    Product
                    <ArrowUpDown className="ml-1 h-3 w-3 text-orange-500" />
                  </Button>
                </TableHead>
                <TableHead className="font-extrabold text-[11px] text-muted-foreground uppercase tracking-wider h-9 py-1.5">Batches</TableHead>
                <TableHead className="font-extrabold text-[11px] text-muted-foreground uppercase tracking-wider h-9 py-1.5">Pack Type</TableHead>
                <TableHead className="font-extrabold text-[11px] text-muted-foreground uppercase tracking-wider h-9 py-1.5">
                  <Button
                    variant="ghost"
                    onClick={() => handleSort("expiry_date")}
                    className="h-auto p-0 font-extrabold text-[11px] uppercase tracking-wider hover:bg-transparent hover:text-foreground text-muted-foreground"
                  >
                    Expiry
                    <ArrowUpDown className="ml-1 h-3 w-3 text-orange-500" />
                  </Button>
                </TableHead>
                <TableHead className="font-extrabold text-[11px] text-muted-foreground uppercase tracking-wider h-9 py-1.5 text-right">
                  <Button
                    variant="ghost"
                    onClick={() => handleSort("available_quantity")}
                    className="h-auto p-0 font-extrabold text-[11px] uppercase tracking-wider hover:bg-transparent hover:text-foreground text-muted-foreground ml-auto"
                  >
                    Available Stock
                    <ArrowUpDown className="ml-1 h-3 w-3 text-orange-500" />
                  </Button>
                </TableHead>
                <TableHead className="font-extrabold text-[11px] text-muted-foreground uppercase tracking-wider h-9 py-1.5 text-right">Cost/Unit</TableHead>
                <TableHead className="font-extrabold text-[11px] text-muted-foreground uppercase tracking-wider h-9 py-1.5 text-right">
                  <Button
                    variant="ghost"
                    onClick={() => handleSort("mrp")}
                    className="h-auto p-0 font-extrabold text-[11px] uppercase tracking-wider hover:bg-transparent hover:text-foreground text-muted-foreground ml-auto"
                  >
                    MRP/Unit
                    <ArrowUpDown className="ml-1 h-3 w-3 text-orange-500" />
                  </Button>
                </TableHead>
                <TableHead className="font-extrabold text-[11px] text-muted-foreground uppercase tracking-wider h-9 py-1.5 text-right">Stock Value</TableHead>
                <TableHead className="font-extrabold text-[11px] text-muted-foreground uppercase tracking-wider h-9 py-1.5">Status</TableHead>
                <TableHead className="w-16 h-9 py-1.5"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {inventory.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="text-center py-10 text-muted-foreground">
                    <Package className="w-9 h-9 mx-auto mb-2 opacity-40 text-muted-foreground" />
                    <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">No matching products found</p>
                  </TableCell>
                </TableRow>
              ) : (
                inventory.map((item) => {
                  const itemId = item.product_id || item.id;
                  const availableUnits = item.total_available_stock !== undefined ? item.total_available_stock : (item.available_quantity || 0);
                  const unitsPerPack = item.units_per_pack || 1;
                  const packType = item.pack_type || "Strip";
                  const costPerUnit = item.purchase_price || item.cost_unit || 0;
                  const mrpPerUnit = item.mrp || item.mrp_unit || 0;
                  const stockValue = item.total_stock_value !== undefined ? item.total_stock_value : availableUnits * costPerUnit;
                  const batchCount = item.batch_count || (item.batches ? item.batches.length : 1);
                  const earliestExpiry = item.earliest_expiry || item.expiry_date || "-";
                  
                  // Calculate packs + loose units display
                  const fullPacks = Math.floor(availableUnits / unitsPerPack);
                  const looseUnits = availableUnits % unitsPerPack;
                  
                  let stockDisplay = "";
                  if (unitsPerPack > 1) {
                    if (fullPacks > 0 && looseUnits > 0) {
                      stockDisplay = `${fullPacks} ${packType}${fullPacks > 1 ? 's' : ''} + ${looseUnits} u`;
                    } else if (fullPacks > 0) {
                      stockDisplay = `${fullPacks} ${packType}${fullPacks > 1 ? 's' : ''}`;
                    } else {
                      stockDisplay = `${looseUnits} u`;
                    }
                  } else {
                    stockDisplay = `${availableUnits} u`;
                  }

                  const todayStr = new Date().toISOString().split("T")[0];
                  const isExpired = earliestExpiry !== "-" && earliestExpiry < todayStr;
                  const isExpiringSoon = earliestExpiry !== "-" && !isExpired && isExpiringSoonCheck(earliestExpiry);
                  const shortageThresh = item.shortage_threshold !== undefined && item.shortage_threshold !== null ? Number(item.shortage_threshold) : (settings?.shortage_threshold || 10);
                  const isShortage = availableUnits <= shortageThresh;
                  const isLowStock = availableUnits <= (item.low_stock_threshold || 10);
                  
                  return (
                    <TableRow 
                      key={itemId} 
                      id={`record-${itemId}`} 
                      data-testid={`inventory-row-${itemId}`} 
                      onClick={() => handleOpenProductDetails(item)}
                      className="hover:bg-muted/20 border-b border-border/40 transition-colors cursor-pointer group"
                    >
                      <TableCell className="text-center py-2" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          className="rounded border-border/80 focus:ring-primary w-4 h-4 cursor-pointer accent-primary"
                          checked={selectedItemIds.includes(itemId)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedItemIds((prev) => [...prev, itemId]);
                            } else {
                              setSelectedItemIds((prev) => prev.filter((id) => id !== itemId));
                            }
                          }}
                        />
                      </TableCell>
                      <TableCell className="py-2 font-bold text-xs text-foreground">
                        <div className="font-extrabold text-xs text-foreground group-hover:text-primary transition-colors flex items-center gap-1.5">
                          {item.product_name || item.name}
                        </div>
                        <div className="text-[10px] text-muted-foreground font-semibold mt-0.5">
                          {item.manufacturer || "General"} {item.salt_composition ? `• ${item.salt_composition}` : ""}
                        </div>
                      </TableCell>
                      <TableCell className="py-2 text-xs font-semibold">
                        <Badge variant="outline" className="text-[10px] font-bold border-orange-500/30 text-orange-500 bg-orange-500/5">
                          {batchCount} Batch{batchCount > 1 ? "es" : ""}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-2 text-xs font-semibold text-muted-foreground">{packType}</TableCell>
                      <TableCell className="py-2 font-mono text-xs font-semibold text-muted-foreground">{earliestExpiry}</TableCell>
                      <TableCell className="py-2 text-right">
                        <div className="font-mono text-xs font-extrabold text-orange-500">{stockDisplay}</div>
                        <div className="text-[10px] font-semibold text-muted-foreground font-mono">({availableUnits} total units)</div>
                      </TableCell>
                      <TableCell className="py-2 text-right font-mono text-xs font-bold text-foreground">₹{Number(costPerUnit).toFixed(2)}</TableCell>
                      <TableCell className="py-2 text-right font-mono text-xs font-bold text-foreground">₹{Number(mrpPerUnit).toFixed(2)}</TableCell>
                      <TableCell className="py-2 text-right font-mono text-xs font-semibold text-muted-foreground">₹{Number(stockValue).toFixed(2)}</TableCell>
                      <TableCell className="py-2">
                        {availableUnits === 0 ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black bg-rose-500/15 text-rose-400 border border-rose-500/30">Out of Stock</span>
                        ) : isExpired ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black bg-rose-500/15 text-rose-400 border border-rose-500/30">Expired</span>
                        ) : isExpiringSoon ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black bg-amber-500/15 text-amber-400 border border-amber-500/30">Expiring Soon</span>
                        ) : isShortage ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black bg-orange-500/15 text-orange-400 border border-orange-500/30">Shortage</span>
                        ) : isLowStock ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black bg-amber-500/15 text-amber-400 border border-amber-500/30">Low Stock</span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">In Stock</span>
                        )}
                      </TableCell>
                      <TableCell className="py-2" onClick={(e) => e.stopPropagation()}>
                        <div className="flex gap-1 justify-end items-center">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-orange-500 hover:text-orange-400 hover:bg-orange-500/15 rounded-lg h-7 w-7 shrink-0 cursor-pointer"
                            onClick={() => handleOpenProductDetails(item)}
                            title="View Product Batches & Details"
                            data-testid={`view-details-${itemId}`}
                          >
                            <Package className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
        
        {/* Pagination */}
        {pagination.total_pages > 1 && (
          <div className="flex flex-col sm:flex-row items-center justify-between px-6 py-4 border-t border-border/40 bg-muted/5 gap-4">
            <div className="text-xs font-bold text-muted-foreground/80 sm:w-1/3 text-left">
              Showing {((pagination.page - 1) * pagination.limit) + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} items
            </div>
            
            <div className="flex items-center justify-center gap-2 sm:w-1/3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchInventory(pagination.page - 1)}
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
                      onClick={() => fetchInventory(pageNum)}
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
                onClick={() => fetchInventory(pagination.page + 1)}
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
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialog.open} onOpenChange={(open) => setDeleteDialog({ ...deleteDialog, open })}>
        <AlertDialogContent className="rounded-2xl border border-border/40 shadow-2xl max-w-md">
          <AlertDialogHeader className="space-y-2">
            <AlertDialogTitle className="font-extrabold text-base tracking-tight text-foreground flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-destructive" />
              {deleteDialog.type === "inventory" ? "Delete Inventory Item" : "Delete Product"}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs leading-relaxed text-muted-foreground font-medium">
              {deleteDialog.type === "inventory" ? (
                <>
                  Are you sure you want to delete <strong className="text-foreground">{deleteDialog.item?.product_name}</strong> (Batch: {deleteDialog.item?.batch_no})?
                  <br /><br />
                  This will remove <span className="font-bold text-foreground">{deleteDialog.item?.available_quantity}</span> units from inventory.
                </>
              ) : (
                <>
                  Are you sure you want to delete the product <strong className="text-foreground">{deleteDialog.item?.name}</strong>?
                  <br /><br />
                  This may affect related inventory items.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4 gap-2 flex-col sm:flex-row">
            <AlertDialogCancel className="h-10 text-xs font-bold border-border/80 hover:bg-muted rounded-xl">
              Cancel
            </AlertDialogCancel>
            {deleteDialog.type === "inventory" ? (
              <AlertDialogAction
                onClick={handleDeleteInventoryItem}
                className="bg-destructive hover:bg-destructive/95 text-destructive-foreground h-10 text-xs font-bold shadow-md rounded-xl"
              >
                Delete Item
              </AlertDialogAction>
            ) : (
              <div className="flex flex-col sm:flex-row gap-2">
                <AlertDialogAction
                  onClick={() => handleDeleteProduct(false)}
                  className="bg-destructive/80 hover:bg-destructive/90 text-destructive-foreground h-10 text-xs font-bold shadow-md rounded-xl"
                >
                  Delete Product Only
                </AlertDialogAction>
                <AlertDialogAction
                  onClick={() => handleDeleteProduct(true)}
                  className="bg-destructive hover:bg-destructive/95 text-destructive-foreground h-10 text-xs font-bold shadow-md rounded-xl"
                >
                  Delete with Inventory
                </AlertDialogAction>
              </div>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add Stock Dialog */}
      <Dialog open={addStockDialog.open} onOpenChange={(open) => setAddStockDialog({ ...addStockDialog, open })}>
        <DialogContent className="rounded-2xl border border-border/40 shadow-2xl max-w-md p-6">
          <DialogHeader className="border-b border-border/40 pb-4">
            <DialogTitle className="font-extrabold text-base tracking-tight text-foreground flex items-center gap-2">
              <Plus className="w-5 h-5 text-primary" />
              Quick Add Stock
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="p-3 bg-muted/20 border border-border/40 rounded-xl">
              <p className="text-sm font-extrabold text-foreground">{addStockDialog.item?.product_name}</p>
              <div className="flex items-center gap-4 mt-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">
                <span>Batch: {addStockDialog.item?.batch_no}</span>
                <span>Current Stock: {addStockDialog.item?.available_quantity} units</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold text-muted-foreground/80">Quantity to Add (Units) *</Label>
              <Input
                type="number"
                placeholder="e.g. 50"
                value={addStockDialog.quantityToAdd}
                onChange={(e) => setAddStockDialog({ ...addStockDialog, quantityToAdd: e.target.value })}
                min="1"
                autoFocus
                className="h-10 text-sm font-bold border-border/80 focus:border-primary bg-card/25"
              />
            </div>
            <Button onClick={handleAddStock} className="w-full bg-primary hover:bg-primary/95 text-primary-foreground h-10 text-xs font-bold shadow-md shadow-primary/10 rounded-xl mt-2">
              Update Stock
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Merge Dialog */}
      <Dialog open={mergeDialogOpen} onOpenChange={setMergeDialogOpen}>
        <DialogContent className="rounded-2xl border border-border/40 shadow-2xl max-w-lg p-6">
          <DialogHeader className="border-b border-border/40 pb-4">
            <DialogTitle className="font-extrabold text-base tracking-tight text-foreground flex items-center gap-2">
              <Package className="w-5 h-5 text-amber-500" />
              Merge Selected Products
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="text-xs text-muted-foreground/80 leading-relaxed bg-amber-500/5 border border-amber-500/10 p-3 rounded-xl">
              <strong className="text-amber-600 font-semibold block mb-0.5">⚠️ Important Warning</strong>
              This will merge all selected batches under a single unified product name. Historical billing and purchase records will be updated to point to the unified name.
            </div>

            <div className="max-h-32 overflow-y-auto p-2 border border-border/40 rounded-xl bg-muted/10 space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80 mb-1">Items being merged:</p>
              {inventory
                .filter(item => selectedItemIds.includes(item.id))
                .map(item => (
                  <div key={item.id} className="text-xs flex justify-between py-1 border-b border-border/20 last:border-0">
                    <span className="font-semibold">{item.product_name} <span className="text-muted-foreground font-mono">({item.batch_no})</span></span>
                    <span className="text-muted-foreground font-semibold">{item.available_quantity || 0} units</span>
                  </div>
                ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold text-muted-foreground/80">Unified Product Name *</Label>
                <Input
                  value={mergeFormData.merged_name}
                  onChange={(e) => setMergeFormData({ ...mergeFormData, merged_name: e.target.value })}
                  placeholder="e.g. Dolo 650mg Tablet"
                  className="h-10 text-sm font-bold border-border/80 focus:border-primary bg-card/25"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold text-muted-foreground/80">Manufacturer</Label>
                <Input
                  value={mergeFormData.merged_manufacturer}
                  onChange={(e) => setMergeFormData({ ...mergeFormData, merged_manufacturer: e.target.value })}
                  placeholder="e.g. Micro Labs Ltd"
                  className="h-10 text-sm font-bold border-border/80 focus:border-primary bg-card/25"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label className="text-xs font-bold text-muted-foreground/80">Salt Composition</Label>
                <Input
                  value={mergeFormData.merged_salt}
                  onChange={(e) => setMergeFormData({ ...mergeFormData, merged_salt: e.target.value })}
                  placeholder="e.g. Paracetamol 650mg"
                  className="h-10 text-sm font-bold border-border/80 focus:border-primary bg-card/25"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label className="text-xs font-bold text-muted-foreground/80">HSN Number</Label>
                <Input
                  value={mergeFormData.merged_hsn}
                  onChange={(e) => setMergeFormData({ ...mergeFormData, merged_hsn: e.target.value })}
                  placeholder="e.g. 30049099"
                  className="h-10 text-sm font-bold border-border/80 focus:border-primary bg-card/25"
                />
              </div>
            </div>

            <Button
              onClick={handleMergeSubmit}
              disabled={merging}
              className="w-full bg-amber-500 hover:bg-amber-600 text-white h-10 text-xs font-bold shadow-md rounded-xl mt-2 flex items-center justify-center gap-2"
            >
              {merging ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Merging Products...
                </>
              ) : (
                "Confirm and Merge Products"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Product Details Right Sidebar Drawer */}
      <RightSidebarDrawer
        open={!!detailProduct}
        onClose={() => {
          setDetailProduct(null);
          setShowAddMergeForm(false);
          setProductsToMerge([]);
        }}
        title={detailProduct?.name || "Product Details"}
        subtitle="Inventory Batches & Product Details"
        icon={Package}
        tabs={[
          { id: "batches", label: "All Batches", icon: Package, badge: detailBatches.length },
          { id: "info", label: "Product Info", icon: Info },
          { id: "merge", label: "Merge Products", icon: Plus }
        ]}
        activeTab={sidebarTab}
        onTabChange={(tabId) => setSidebarTab(tabId)}
        widthClass="sm:w-[540px]"
      >
        {loadingDetails ? (
          <Loader size="md" text="Loading Product Details..." />
        ) : (
          <>
            {sidebarTab === "batches" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-extrabold text-foreground flex items-center gap-1.5">
                    <Package className="w-4 h-4 text-orange-500" />
                    Batches List ({detailBatches.length})
                  </p>
                </div>

                <div className="space-y-2.5">
                  {detailBatches.length === 0 ? (
                    <div className="p-8 text-center border border-border/40 rounded-xl bg-card/25 text-muted-foreground text-xs font-semibold">
                      No active batches found in inventory for this product.
                    </div>
                  ) : (
                    detailBatches.map((batch) => {
                      const isExpired = batch.expiry_date && batch.expiry_date !== "-" && new Date(batch.expiry_date) < new Date();
                      const isExpiryMoved = batch.expiry_status === "Moved to Expiry" || batch.expiry_status === "Picked";
                      const isExpiryReturned = batch.expiry_status === "Expired & Returned";
                      const isReturnMoved = batch.return_status === "Moved to Returns" || batch.return_status === "Picked";
                      const isGeneralReturned = batch.return_status === "Returned";

                      const shortageThresh = detailProduct?.shortage_threshold !== undefined && detailProduct?.shortage_threshold !== null ? Number(detailProduct.shortage_threshold) : (settings?.shortage_threshold || 10);
                      const isShortage = batch.available_quantity <= shortageThresh;
                      const isLowStock = batch.available_quantity <= (detailProduct?.low_stock_threshold || 10);
                      
                      let statusLabel = "In Stock";
                      let statusColor = "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";

                      if (isExpiryReturned) {
                        statusLabel = "Expired & Returned";
                        statusColor = "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
                      } else if (isExpiryMoved) {
                        statusLabel = "Moved to Expiry";
                        statusColor = "bg-amber-500/15 text-amber-400 border-amber-500/30";
                      } else if (isGeneralReturned) {
                        statusLabel = "Returned";
                        statusColor = "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
                      } else if (isReturnMoved) {
                        statusLabel = "Moved to Returns";
                        statusColor = "bg-blue-500/15 text-blue-400 border-blue-500/30";
                      } else if (isExpired) {
                        statusLabel = "Expired";
                        statusColor = "bg-rose-500/15 text-rose-400 border-rose-500/30";
                      } else if (batch.available_quantity <= 0) {
                        statusLabel = "Out of Stock";
                        statusColor = "bg-rose-500/15 text-rose-400 border-rose-500/30";
                      } else if (isShortage) {
                        statusLabel = "Shortage";
                        statusColor = "bg-orange-500/15 text-orange-400 border-orange-500/30";
                      } else if (isLowStock) {
                        statusLabel = "Low Stock";
                        statusColor = "bg-amber-500/15 text-amber-400 border-amber-500/30";
                      }

                      return (
                        <div key={batch.id} className="p-3.5 rounded-xl bg-card/40 border border-border/40 space-y-2 hover:border-border/70 transition-colors">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-black text-foreground">Batch: {batch.batch_no}</span>
                              <span className="text-[10px] font-semibold text-muted-foreground">({batch.pack_type || "Strip"})</span>
                            </div>
                            <span className={`text-[9px] font-black px-2 py-0.5 rounded-md border ${statusColor}`}>
                              {statusLabel}
                            </span>
                          </div>

                          <div className="grid grid-cols-3 gap-2 text-xs pt-2 border-t border-border/20">
                            <div>
                              <p className="text-[10px] font-bold text-muted-foreground uppercase">Expiry</p>
                              <p className={`font-mono font-bold text-xs mt-0.5 ${isExpired ? "text-rose-500" : "text-foreground"}`}>
                                {batch.expiry_date || "-"}
                              </p>
                            </div>
                            <div>
                              <p className="text-[10px] font-bold text-muted-foreground uppercase">Stock</p>
                              <p className="font-mono font-extrabold text-orange-500 text-xs mt-0.5">{batch.available_quantity || 0} units</p>
                            </div>
                            <div>
                              <p className="text-[10px] font-bold text-muted-foreground uppercase">Cost / MRP</p>
                              <p className="font-mono font-bold text-foreground text-xs mt-0.5">₹{batch.purchase_price} / ₹{batch.mrp}</p>
                            </div>
                          </div>

                          <div className="flex items-center justify-between pt-2 border-t border-border/20 gap-1 flex-wrap">
                            <span className="text-[10px] text-muted-foreground font-semibold truncate max-w-[150px]">
                              Supplier: {batch.supplier_name || "-"}
                            </span>

                            <div className="flex items-center gap-1">
                              {/* Move to Expiry or Returns Action */}
                              {isExpired && !isExpiryMoved && !isExpiryReturned && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-6 px-2 text-[10px] font-bold border-rose-500/30 text-rose-500 hover:bg-rose-500/10 rounded-md cursor-pointer"
                                  onClick={() => handleMoveBatchToExpiry(batch)}
                                  title="Move this expired batch to Expiry management"
                                >
                                  <CalendarX className="w-3 h-3 mr-1" />
                                  Move to Expiry
                                </Button>
                              )}

                              {!isExpired && !isReturnMoved && !isGeneralReturned && batch.available_quantity > 0 && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-6 px-2 text-[10px] font-bold border-blue-500/30 text-blue-500 hover:bg-blue-500/10 rounded-md cursor-pointer"
                                  onClick={() => handleMoveBatchToReturns(batch)}
                                  title="Move this batch to Returns management"
                                >
                                  <RotateCcw className="w-3 h-3 mr-1" />
                                  Move to Returns
                                </Button>
                              )}

                              {isExpiryMoved && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 px-1.5 text-[10px] font-bold text-amber-500 hover:bg-amber-500/10 rounded-md cursor-pointer"
                                  onClick={() => navigate("/expiry")}
                                  title="View in Expiry Management"
                                >
                                  <Clock className="w-3 h-3 mr-1" />
                                  In Expiry
                                </Button>
                              )}

                              {isReturnMoved && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 px-1.5 text-[10px] font-bold text-blue-500 hover:bg-blue-500/10 rounded-md cursor-pointer"
                                  onClick={() => navigate("/returns")}
                                  title="View in Returns Management"
                                >
                                  <RotateCcw className="w-3 h-3 mr-1" />
                                  In Returns
                                </Button>
                              )}

                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-orange-500 hover:text-orange-400 hover:bg-orange-500/15 rounded-lg h-6 w-6 cursor-pointer"
                                onClick={() => setAddStockDialog({ open: true, item: batch, quantityToAdd: "" })}
                                title="Add Stock"
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-rose-400 hover:text-rose-300 hover:bg-rose-500/15 rounded-lg h-6 w-6 cursor-pointer"
                                onClick={() => setDeleteDialog({ open: true, item: batch, type: "inventory" })}
                                title="Delete Batch"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {sidebarTab === "info" && (
              <div className="bg-muted/10 border border-border/30 rounded-xl p-4 grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Product Name</p>
                  <p className="text-sm font-extrabold text-foreground mt-0.5">{detailProduct?.name}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Category</p>
                  <p className="text-sm font-semibold text-foreground mt-0.5 capitalize">{detailProduct?.category || "Medicine"}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Low Stock Threshold</p>
                  <p className="text-sm font-semibold text-foreground mt-0.5">{detailProduct?.low_stock_threshold || 10} units</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Shortage Threshold</p>
                  <p className="text-sm font-semibold text-foreground mt-0.5">{detailProduct?.shortage_threshold !== undefined && detailProduct?.shortage_threshold !== null ? detailProduct.shortage_threshold : (settings?.shortage_threshold || 10)} units</p>
                </div>
                <div className="col-span-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Salt Composition</p>
                  <p className="text-xs font-semibold text-foreground mt-0.5">{detailProduct?.salt_composition || detailBatches[0]?.salt_composition || "-"}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Manufacturer</p>
                  <p className="text-xs font-semibold text-foreground mt-0.5">{detailProduct?.manufacturer || detailBatches[0]?.manufacturer || "-"}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">HSN Number</p>
                  <p className="text-xs font-mono font-semibold text-foreground mt-0.5">{detailProduct?.hsn_no || detailBatches[0]?.hsn_no || "-"}</p>
                </div>
              </div>
            )}

            {sidebarTab === "merge" && (
              <div className="border border-amber-500/20 bg-amber-500/5 rounded-xl p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-extrabold text-amber-600 flex items-center gap-1.5">
                    <Package className="w-4 h-4" />
                    Merge Another Catalog Product
                  </p>
                </div>
                <p className="text-[11px] text-muted-foreground font-medium">
                  This will merge all stock and batches of selected catalog products into <strong>{detailProduct?.name}</strong>.
                </p>

                <div className="flex gap-3 items-end">
                  <div className="flex-1 space-y-1.5">
                    <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Select Product to Merge</Label>
                    <ProductSearchDropdown
                      excludeProductName={detailProduct?.name}
                      placeholder="Choose product..."
                      onSelect={(product) => {
                        handleSelectProductToMerge(product);
                      }}
                    />
                  </div>

                  <Button
                    onClick={handleExecuteOtherMerge}
                    disabled={mergingOther || productsToMerge.length === 0}
                    className="bg-amber-500 hover:bg-amber-600 text-white h-9 text-xs font-bold px-4 rounded-lg shadow-sm flex items-center gap-2 cursor-pointer"
                  >
                    {mergingOther ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Merging...
                      </>
                    ) : (
                      "Merge Group"
                    )}
                  </Button>
                </div>

                {productsToMerge.length > 0 && (
                  <div className="space-y-1.5 pt-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Selected products to merge:</p>
                    <div className="flex flex-wrap gap-2">
                      {productsToMerge.map(p => {
                        const pName = p.product_name || p.name;
                        return (
                          <Badge 
                            key={p.id || pName} 
                            variant="secondary"
                            className="bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 text-xs font-semibold px-2 py-0.5 rounded-lg flex items-center gap-1 border border-amber-500/20"
                          >
                            {pName}
                            <button
                              onClick={() => handleRemoveProductFromMerge(pName)}
                              className="text-amber-500 hover:text-amber-700 font-bold ml-1 text-sm leading-none focus:outline-none cursor-pointer"
                            >
                              ×
                            </button>
                          </Badge>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </RightSidebarDrawer>

      {/* Remove from Shortage Dialog */}
      <Dialog open={removeShortageDialog.open} onOpenChange={(o) => setRemoveShortageDialog(prev => ({ ...prev, open: o }))}>
        <DialogContent className="max-w-md rounded-2xl border border-border/40 shadow-2xl p-6">
          <DialogHeader className="border-b border-border/40 pb-4">
            <DialogTitle className="font-extrabold text-base tracking-tight text-foreground flex items-center gap-2">
              <BellOff className="w-5 h-5 text-amber-500" />
              Remove Item from Shortage List
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="text-xs font-semibold text-muted-foreground">
              To remove <span className="text-foreground font-bold">{removeShortageDialog.item?.product_name}</span> (Current stock: <span className="text-primary font-bold">{removeShortageDialog.item?.available_quantity} units</span>) from the shortage list, set a shortage threshold lower than the current stock.
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold text-muted-foreground/80">New Shortage Threshold</Label>
              <Input
                type="number"
                placeholder={`Must be less than ${removeShortageDialog.item?.available_quantity || 0}`}
                value={removeShortageDialog.newThreshold}
                onChange={(e) => setRemoveShortageDialog(prev => ({ ...prev, newThreshold: e.target.value }))}
                className="h-10 text-sm font-bold border-border/80 focus:border-primary bg-card/25"
              />
            </div>

            <Button
              onClick={async () => {
                const { item, newThreshold } = removeShortageDialog;
                if (!item) return;
                
                try {
                  const newThreshVal = newThreshold === "" ? null : Number(newThreshold);

                  await axios.put(`${API}/inventory/${item.id}`, {
                    shortage_threshold: newThreshVal
                  });

                  toast.success("Shortage threshold updated and item removed from shortage list");
                  setRemoveShortageDialog({ open: false, item: null, newThreshold: "" });
                  fetchData(); // refresh inventory list
                } catch (error) {
                  toast.error("Failed to remove item from shortage list");
                }
              }}
              className="w-full bg-primary hover:bg-primary/95 text-primary-foreground h-10 text-xs font-bold shadow-md shadow-primary/10 rounded-xl mt-2"
            >
              Save New Threshold
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
