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
import { Search, Plus, Package, AlertTriangle, ChevronLeft, ChevronRight, ArrowUpDown, Trash2, Loader2, BellOff } from "lucide-react";
import { toast } from "sonner";

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
  const [sortBy, setSortBy] = useState("created_at");
  const [sortOrder, setSortOrder] = useState("desc");

  const handleOpenMergeDialog = () => {
    const selectedItems = inventory.filter((item) => selectedItemIds.includes(item.id));
    if (selectedItems.length < 2) return;

    // Prefill form using the first selected item
    const firstItem = selectedItems[0];
    setMergeFormData({
      merged_name: firstItem.product_name || "",
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
      await axios.post(`${API}/inventory/merge`, {
        inventory_ids: selectedItemIds,
        ...mergeFormData,
      });

      toast.success("Inventory items merged successfully");
      setMergeDialogOpen(false);
      setSelectedItemIds([]);
      await fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to merge inventory items");
    } finally {
      setMerging(false);
    }
  };

  const handleOpenProductDetails = async (product, autoOpenMerge = false) => {
    setDetailProduct(product);
    setLoadingDetails(true);
    setDetailBatches([]);
    if (autoOpenMerge) {
      setShowAddMergeForm(true);
    }
    try {
      const res = await axios.get(`${API}/inventory?product_id=${product.id}&limit=100`);
      setDetailBatches(res.data.inventory || []);
    } catch (err) {
      toast.error("Failed to load product details");
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleSelectProductToMerge = (productId) => {
    const matched = products.find(p => p.id === productId);
    if (!matched) return;
    if (productsToMerge.some(p => p.id === productId)) {
      toast.error("Product already selected");
      return;
    }
    setProductsToMerge(prev => [...prev, matched]);
  };

  const handleRemoveProductFromMerge = (productId) => {
    setProductsToMerge(prev => prev.filter(p => p.id !== productId));
  };

  const handleExecuteOtherMerge = async () => {
    if (productsToMerge.length === 0) {
      toast.error("Please select at least one product to merge");
      return;
    }
    setMergingOther(true);
    try {
      const targetInvIds = detailBatches.map(b => b.id);
      const batchResponses = await Promise.all(
        productsToMerge.map(p => axios.get(`${API}/inventory?product_id=${p.id}&limit=100`))
      );

      const otherInvIds = [];
      batchResponses.forEach(res => {
        const items = res.data.inventory || [];
        items.forEach(item => otherInvIds.push(item.id));
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

      const updatedBatchesRes = await axios.get(`${API}/inventory?product_id=${detailProduct.id}&limit=100`);
      setDetailBatches(updatedBatchesRes.data.inventory || []);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to merge products");
    } finally {
      setMergingOther(false);
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
      if (search) params.append("search", search);
      if (showLowStock) params.append("low_stock", "true");
      if (showShortage) params.append("shortage", "true");
      if (showExpiringSoon) params.append("expiring_soon", "true");
      if (highlightId) params.append("highlight_id", highlightId);

      const response = await axios.get(`${API}/inventory?${params.toString()}`);
      setInventory(response.data.inventory);
      setPagination(response.data.pagination);
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
  }, [search, showLowStock, showShortage, showExpiringSoon, sortBy, sortOrder, pagination.limit]);

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
      const prodRes = await axios.get(`${API}/products`);
      setProducts(prodRes.data.products);
      
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

  const isExpiringSoon = (expiryDate) => {
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
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-4">
          <div className="relative w-12 h-12 mx-auto">
            <div className="absolute inset-0 rounded-full border-4 border-primary/20"></div>
            <div className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin"></div>
          </div>
          <p className="text-xs font-bold text-muted-foreground/80 uppercase tracking-widest animate-pulse">Loading Inventory...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in" data-testid="inventory-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/40 pb-5">
        <div className="space-y-1">
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground">Inventory</h1>
          <p className="text-xs font-medium text-muted-foreground">
            <span className="text-primary font-extrabold">{pagination.total}</span> items in stock
          </p>
        </div>

        <div className="flex items-center gap-3">
          {selectedItemIds.length >= 2 && (
            <Button
              onClick={handleOpenMergeDialog}
              className="bg-amber-500 hover:bg-amber-600 text-white h-10 text-xs font-bold shadow-md rounded-xl px-4 flex items-center gap-2"
              data-testid="merge-products-btn"
            >
              Merge Selected ({selectedItemIds.length})
            </Button>
          )}

          <Dialog open={productDialog} onOpenChange={setProductDialog}>
            <DialogTrigger asChild>
              <Button className="bg-primary hover:bg-primary/95 text-primary-foreground h-10 text-xs font-bold shadow-md shadow-primary/10 rounded-xl px-4 flex items-center gap-2" data-testid="add-product-btn">
                <Plus className="w-4 h-4" />
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

      {/* Filters */}
      <Card className="bg-card/45 backdrop-blur-sm border border-border/40 shadow-sm rounded-xl overflow-hidden">
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4 items-center">
            <div className="flex-1 relative w-full">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
              <Input
                placeholder="Search by product name or batch..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 h-10 text-sm border-border/80 focus:border-primary bg-card/25 rounded-xl"
                data-testid="inventory-search"
              />
            </div>

            <div className="flex gap-2 w-full md:w-auto shrink-0 justify-end">
              <Button
                variant={showLowStock ? "default" : "outline"}
                onClick={() => {
                  setShowLowStock(!showLowStock);
                  setShowShortage(false);
                  setShowExpiringSoon(false);
                }}
                className={`h-10 text-xs font-bold px-4 rounded-xl border ${
                  showLowStock 
                    ? "bg-amber-500/10 text-amber-500 border-amber-500/30 hover:bg-amber-500/20" 
                    : "border-border/80 hover:bg-muted"
                }`}
                data-testid="low-stock-filter-btn"
              >
                <AlertTriangle className="w-3.5 h-3.5 mr-2" />
                Low Stock
              </Button>

              <Button
                variant={showShortage ? "default" : "outline"}
                onClick={() => {
                  setShowShortage(!showShortage);
                  setShowLowStock(false);
                  setShowExpiringSoon(false);
                }}
                className={`h-10 text-xs font-bold px-4 rounded-xl border ${
                  showShortage 
                    ? "bg-orange-500/10 text-orange-500 border-orange-500/30 hover:bg-orange-500/20" 
                    : "border-border/80 hover:bg-muted"
                }`}
                data-testid="shortage-filter-btn"
              >
                <AlertTriangle className="w-3.5 h-3.5 mr-2" />
                Shortage List {shortageCount > 0 && <Badge className="ml-1.5 bg-orange-500 text-white border-0 text-[10px] px-1.5 py-0.5 font-bold rounded-full">{shortageCount}</Badge>}
              </Button>

              <Button
                variant={showExpiringSoon ? "default" : "outline"}
                onClick={() => {
                  setShowExpiringSoon(!showExpiringSoon);
                  setShowLowStock(false);
                  setShowShortage(false);
                }}
                className={`h-10 text-xs font-bold px-4 rounded-xl border ${
                  showExpiringSoon 
                    ? "bg-destructive/10 text-destructive border-destructive/30 hover:bg-destructive/20" 
                    : "border-border/80 hover:bg-muted"
                }`}
                data-testid="expiring-filter-btn"
              >
                <AlertTriangle className="w-3.5 h-3.5 mr-2" />
                Expiring Soon
              </Button>
              
              {(search || showLowStock || showShortage || showExpiringSoon) && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearch("");
                    setShowLowStock(false);
                    setShowShortage(false);
                    setShowExpiringSoon(false);
                  }}
                  className="h-10 text-xs font-bold px-4 rounded-xl border border-border/80 hover:bg-muted"
                >
                  Clear
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Inventory Table */}
      <Card className="bg-card/45 border border-border/40 backdrop-blur-sm shadow-sm rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="border-b border-border/40 bg-muted/20">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-12 h-11 text-center">
                  <input
                    type="checkbox"
                    className="rounded border-border/80 focus:ring-primary w-4 h-4 cursor-pointer accent-primary"
                    checked={inventory.length > 0 && selectedItemIds.length === inventory.length}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedItemIds(inventory.map((item) => item.id));
                      } else {
                        setSelectedItemIds([]);
                      }
                    }}
                  />
                </TableHead>
                <TableHead className="font-bold text-xs text-muted-foreground uppercase tracking-wider h-11">
                  <Button
                    variant="ghost"
                    onClick={() => handleSort("product_name")}
                    className="h-auto p-0 font-bold text-xs uppercase tracking-wider hover:bg-transparent hover:text-foreground text-muted-foreground"
                  >
                    Product
                    <ArrowUpDown className="ml-1.5 h-3.5 w-3.5 text-primary" />
                  </Button>
                </TableHead>
                <TableHead className="font-bold text-xs text-muted-foreground uppercase tracking-wider h-11">MFG.</TableHead>
                <TableHead className="font-bold text-xs text-muted-foreground uppercase tracking-wider h-11">Batch</TableHead>
                <TableHead className="font-bold text-xs text-muted-foreground uppercase tracking-wider h-11">Pack Type</TableHead>
                <TableHead className="font-bold text-xs text-muted-foreground uppercase tracking-wider h-11">
                  <Button
                    variant="ghost"
                    onClick={() => handleSort("expiry_date")}
                    className="h-auto p-0 font-bold text-xs uppercase tracking-wider hover:bg-transparent hover:text-foreground text-muted-foreground"
                  >
                    Expiry
                    <ArrowUpDown className="ml-1.5 h-3.5 w-3.5 text-primary" />
                  </Button>
                </TableHead>
                <TableHead className="font-bold text-xs text-muted-foreground uppercase tracking-wider h-11 text-right">
                  <Button
                    variant="ghost"
                    onClick={() => handleSort("available_quantity")}
                    className="h-auto p-0 font-bold text-xs uppercase tracking-wider hover:bg-transparent hover:text-foreground text-muted-foreground ml-auto"
                  >
                    Available Stock
                    <ArrowUpDown className="ml-1.5 h-3.5 w-3.5 text-primary" />
                  </Button>
                </TableHead>
                <TableHead className="font-bold text-xs text-muted-foreground uppercase tracking-wider h-11 text-right">Cost/Unit</TableHead>
                <TableHead className="font-bold text-xs text-muted-foreground uppercase tracking-wider h-11 text-right">
                  <Button
                    variant="ghost"
                    onClick={() => handleSort("mrp")}
                    className="h-auto p-0 font-bold text-xs uppercase tracking-wider hover:bg-transparent hover:text-foreground text-muted-foreground ml-auto"
                  >
                    MRP/Unit
                    <ArrowUpDown className="ml-1.5 h-3.5 w-3.5 text-primary" />
                  </Button>
                </TableHead>
                <TableHead className="font-bold text-xs text-muted-foreground uppercase tracking-wider h-11 text-right">Stock Value</TableHead>
                <TableHead className="font-bold text-xs text-muted-foreground uppercase tracking-wider h-11">Status</TableHead>
                <TableHead className="w-12 h-11"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {inventory.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={12} className="text-center py-10 text-muted-foreground">
                    <Package className="w-10 h-10 mx-auto mb-2 opacity-55 text-muted-foreground/60" />
                    <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground/60">No inventory items found</p>
                  </TableCell>
                </TableRow>
              ) : (
                inventory.map((item) => {
                  const availableUnits = item.available_quantity || 0;
                  const unitsPerPack = item.units_per_pack || 1;
                  const packType = item.pack_type || "Strip";
                  const costPerUnit = item.purchase_price || 0;
                  const mrpPerUnit = item.mrp || 0;
                  const stockValue = availableUnits * costPerUnit;
                  const matchedProduct = products.find((p) => p.id === item.product_id);
                  
                  // Calculate packs + loose units display
                  const fullPacks = Math.floor(availableUnits / unitsPerPack);
                  const looseUnits = availableUnits % unitsPerPack;
                  
                  // Format the display
                  let stockDisplay = "";
                  if (unitsPerPack > 1) {
                    if (fullPacks > 0 && looseUnits > 0) {
                      stockDisplay = `${fullPacks} ${packType}${fullPacks > 1 ? 's' : ''} + ${looseUnits} units`;
                    } else if (fullPacks > 0) {
                      stockDisplay = `${fullPacks} ${packType}${fullPacks > 1 ? 's' : ''}`;
                    } else {
                      stockDisplay = `${looseUnits} units`;
                    }
                  } else {
                    stockDisplay = `${availableUnits} units`;
                  }
                  
                  return (
                    <TableRow key={item.id} id={`record-${item.id}`} data-testid={`inventory-row-${item.id}`} className="hover:bg-muted/15 border-b border-border/40 transition-colors">
                      <TableCell className="text-center">
                        <input
                          type="checkbox"
                          className="rounded border-border/80 focus:ring-primary w-4 h-4 cursor-pointer accent-primary"
                          checked={selectedItemIds.includes(item.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedItemIds((prev) => [...prev, item.id]);
                            } else {
                              setSelectedItemIds((prev) => prev.filter((id) => id !== item.id));
                            }
                          }}
                        />
                      </TableCell>
                      <TableCell className="font-bold text-sm text-foreground">
                        <div>{item.product_name}</div>
                        <div className="text-[10px] text-muted-foreground/80 font-semibold mt-0.5">
                          Shortage Thresh: {item.shortage_threshold !== undefined && item.shortage_threshold !== null ? item.shortage_threshold : (settings?.shortage_threshold || 10)} units
                        </div>
                      </TableCell>
                      <TableCell className="text-xs font-semibold text-muted-foreground">{item.manufacturer || "-"}</TableCell>
                      <TableCell className="font-mono text-xs font-semibold text-muted-foreground">{item.batch_no}</TableCell>
                      <TableCell className="text-xs font-semibold text-muted-foreground">{packType}</TableCell>
                      <TableCell className="font-mono text-xs font-semibold text-muted-foreground">{item.expiry_date}</TableCell>
                      <TableCell className="text-right">
                        <div className="font-mono text-xs font-bold text-primary">{stockDisplay}</div>
                        <div className="text-[10px] font-semibold text-muted-foreground/60">({availableUnits} total units)</div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs font-bold text-foreground">₹{costPerUnit.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-mono text-xs font-bold text-foreground">₹{mrpPerUnit.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-mono text-xs font-semibold text-muted-foreground">₹{stockValue.toFixed(2)}</TableCell>
                      <TableCell>
                        {availableUnits === 0 ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-destructive/10 text-destructive border border-destructive/20">Out of Stock</span>
                        ) : isExpired(item.expiry_date) ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-destructive/10 text-destructive border border-destructive/20">Expired</span>
                        ) : isExpiringSoon(item.expiry_date) ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20">
                            Expiring Soon
                          </span>
                        ) : availableUnits <= (item.shortage_threshold !== undefined && item.shortage_threshold !== null ? Number(item.shortage_threshold) : (settings?.shortage_threshold || 10)) ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-orange-600/10 text-orange-600 border border-orange-600/20 dark:text-orange-400 dark:border-orange-500/20">
                            Shortage
                          </span>
                        ) : availableUnits <= (matchedProduct?.low_stock_threshold || 10) ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20">
                            Low Stock
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-primary/10 text-primary border border-primary/20">In Stock</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 justify-end">
                          {showShortage && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-amber-500 hover:text-amber-600 hover:bg-amber-500/10 rounded-lg h-8 w-8 shrink-0"
                              onClick={() => setRemoveShortageDialog({ open: true, item, newThreshold: "" })}
                              title="Remove from shortage list"
                              data-testid={`remove-shortage-${item.id}`}
                            >
                              <BellOff className="w-4 h-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-primary hover:text-primary hover:bg-primary/10 rounded-lg h-8 w-8 shrink-0"
                            onClick={() => setAddStockDialog({ open: true, item, quantityToAdd: "" })}
                            title="Add Stock"
                            data-testid={`add-stock-${item.id}`}
                          >
                            <Plus className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive hover:bg-destructive/10 rounded-lg h-8 w-8 shrink-0"
                            onClick={() => setDeleteDialog({ open: true, item, type: "inventory" })}
                            data-testid={`delete-inventory-${item.id}`}
                            title="Delete Item"
                          >
                            <Trash2 className="w-4 h-4" />
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
          <div className="flex items-center justify-between px-6 py-4 border-t border-border/40 bg-muted/5">
            <div className="text-xs font-bold text-muted-foreground/80">
              Showing {((pagination.page - 1) * pagination.limit) + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} items
            </div>
            
            <div className="flex items-center gap-2">
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
          </div>
        )}
      </Card>

      {/* Products List */}
      <Card className="bg-card/45 border border-border/40 backdrop-blur-sm shadow-sm rounded-xl overflow-hidden">
        <CardHeader className="border-b border-border/40 py-4">
          <CardTitle className="text-sm font-extrabold text-foreground flex items-center gap-2">
            <Package className="w-4 h-4 text-primary" />
            Products Catalog ({products.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
             {products.slice(0, 12).map((product) => (
              <div
                key={product.id}
                onClick={() => handleOpenProductDetails(product)}
                className="p-4 rounded-xl bg-card/20 border border-border/40 hover:border-primary/30 dark:hover:border-primary/20 transition-all duration-300 group relative overflow-hidden cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform duration-300">
                    <Package className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-foreground truncate">{product.name}</p>
                    <p className="text-[10px] font-bold text-muted-foreground/80 mt-0.5 uppercase tracking-wide">
                      {product.category} • THRESHOLD: {product.low_stock_threshold} • SHORTAGE: {product.shortage_threshold !== undefined && product.shortage_threshold !== null ? product.shortage_threshold : (settings?.shortage_threshold || 10)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-primary hover:text-primary hover:bg-primary/10 rounded-lg"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenProductDetails(product, true);
                      }}
                      title="Merge Products"
                      data-testid={`merge-product-${product.id}`}
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10 rounded-lg"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteDialog({ open: true, item: product, type: "product" });
                      }}
                      data-testid={`delete-product-${product.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

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

      {/* Product Details Dialog */}
      <Dialog 
        open={!!detailProduct} 
        onOpenChange={(open) => {
          if (!open) {
            setDetailProduct(null);
            setShowAddMergeForm(false);
            setProductsToMerge([]);
          }
        }}
      >
        <DialogContent className="rounded-2xl border border-border/40 shadow-2xl max-w-2xl p-6 overflow-hidden bg-background">
          <DialogHeader className="border-b border-border/40 pb-4">
            <DialogTitle className="font-extrabold text-base tracking-tight text-foreground flex items-center justify-between w-full">
              <span className="flex items-center gap-2">
                <Package className="w-5 h-5 text-primary" />
                Product Catalog Details
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs font-bold border-amber-500/30 text-amber-500 hover:text-amber-600 hover:bg-amber-500/5 rounded-lg flex items-center gap-1.5"
                onClick={() => {
                  setShowAddMergeForm(!showAddMergeForm);
                  setProductsToMerge([]);
                }}
              >
                <Plus className="w-3.5 h-3.5" />
                {showAddMergeForm ? "Cancel Merge" : "Merge Another Product"}
              </Button>
            </DialogTitle>
          </DialogHeader>

          {loadingDetails ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-xs font-semibold text-muted-foreground">Loading associated inventory details...</p>
            </div>
          ) : (
            <div className="space-y-6 pt-4 overflow-y-auto max-h-[70vh] pr-1">
              
              {/* Merge Other Catalog Product Form */}
              {showAddMergeForm && (
                <div className="border border-amber-500/20 bg-amber-500/5 rounded-xl p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-extrabold text-amber-600 flex items-center gap-1.5">
                      <Package className="w-4 h-4" />
                      Merge Another Catalog Product
                    </p>
                    <span className="text-[10px] text-muted-foreground font-semibold">
                      This will move all stock and history of selected products into <strong>{detailProduct?.name}</strong>
                    </span>
                  </div>

                  <div className="flex gap-3 items-end">
                    <div className="flex-1 space-y-1.5">
                      <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Select Product to Merge</Label>
                      <Select 
                        onValueChange={(val) => {
                          handleSelectProductToMerge(val);
                        }}
                      >
                        <SelectTrigger className="h-9 text-xs border-border/80 focus:border-amber-500 bg-background rounded-lg">
                          <SelectValue placeholder="Choose product..." />
                        </SelectTrigger>
                        <SelectContent className="border border-border/40 shadow-xl rounded-xl z-[99999]">
                          {products
                            .filter(p => p.id !== detailProduct?.id)
                            .map(p => (
                              <SelectItem key={p.id} value={p.id} className="text-xs">
                                {p.name}
                              </SelectItem>
                            ))
                          }
                        </SelectContent>
                      </Select>
                    </div>

                    <Button
                      onClick={handleExecuteOtherMerge}
                      disabled={mergingOther || productsToMerge.length === 0}
                      className="bg-amber-500 hover:bg-amber-600 text-white h-9 text-xs font-bold px-4 rounded-lg shadow-sm flex items-center gap-2"
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
                        {productsToMerge.map(p => (
                          <Badge 
                            key={p.id} 
                            variant="secondary"
                            className="bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 text-xs font-semibold px-2 py-0.5 rounded-lg flex items-center gap-1 border border-amber-500/20"
                          >
                            {p.name}
                            <button
                              onClick={() => handleRemoveProductFromMerge(p.id)}
                              className="text-amber-500 hover:text-amber-700 font-bold ml-1 text-sm leading-none focus:outline-none"
                            >
                              ×
                            </button>
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Product Info Fields */}
              <div className="bg-muted/10 border border-border/30 rounded-xl p-4 grid grid-cols-2 md:grid-cols-3 gap-4">
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
                {detailBatches.length > 0 && (
                  <>
                    <div className="md:col-span-2">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Salt Composition</p>
                      <p className="text-xs font-semibold text-foreground mt-0.5">{detailBatches[0]?.salt_composition || "-"}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Manufacturer</p>
                      <p className="text-xs font-semibold text-foreground mt-0.5">{detailBatches[0]?.manufacturer || "-"}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">HSN Number</p>
                      <p className="text-xs font-mono font-semibold text-foreground mt-0.5">{detailBatches[0]?.hsn_no || "-"}</p>
                    </div>
                  </>
                )}
              </div>

              {/* Batches Table */}
              <div className="space-y-3">
                <p className="text-xs font-extrabold text-foreground flex items-center gap-1.5">
                  <Package className="w-4 h-4 text-muted-foreground" />
                  Associated Inventory Batches ({detailBatches.length})
                </p>
                
                <div className="border border-border/40 rounded-xl overflow-hidden bg-card/25">
                  <Table>
                    <TableHeader className="bg-muted/10 border-b border-border/40">
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="font-bold text-xs text-muted-foreground h-10">Batch No</TableHead>
                        <TableHead className="font-bold text-xs text-muted-foreground h-10">Expiry</TableHead>
                        <TableHead className="font-bold text-xs text-muted-foreground h-10">Available Stock</TableHead>
                        <TableHead className="font-bold text-xs text-muted-foreground h-10">Cost / MRP</TableHead>
                        <TableHead className="font-bold text-xs text-muted-foreground h-10">Supplier</TableHead>
                        <TableHead className="font-bold text-xs text-muted-foreground h-10 text-center">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detailBatches.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-6 text-xs text-muted-foreground font-semibold">
                            No active batches found in inventory for this product.
                          </TableCell>
                        </TableRow>
                      ) : (
                        detailBatches.map((batch) => {
                          const isExpired = batch.expiry_date && new Date(batch.expiry_date) < new Date();
                          const isShortage = batch.available_quantity <= (detailProduct?.shortage_threshold !== undefined && detailProduct?.shortage_threshold !== null ? Number(detailProduct.shortage_threshold) : (settings?.shortage_threshold || 10));
                          const isLowStock = batch.available_quantity <= (detailProduct?.low_stock_threshold || 10);
                          let statusLabel = "In Stock";
                          
                          if (isExpired) {
                            statusLabel = "Expired";
                          } else if (batch.available_quantity <= 0) {
                            statusLabel = "Out of Stock";
                          } else if (isShortage) {
                            statusLabel = "Shortage";
                          } else if (isLowStock) {
                            statusLabel = "Low Stock";
                          }

                          return (
                            <TableRow key={batch.id} className="hover:bg-muted/10 border-b border-border/30 last:border-0">
                              <TableCell className="font-mono text-xs font-bold text-foreground">{batch.batch_no}</TableCell>
                              <TableCell className="text-xs font-semibold text-muted-foreground">{batch.expiry_date || "N/A"}</TableCell>
                              <TableCell className="text-xs font-semibold text-foreground">
                                {batch.available_quantity || 0} units <span className="text-[10px] text-muted-foreground font-normal">(of {batch.quantity || 0})</span>
                              </TableCell>
                              <TableCell className="text-xs font-semibold text-foreground">
                                ₹{batch.purchase_price} / ₹{batch.mrp}
                              </TableCell>
                              <TableCell className="text-xs font-semibold text-muted-foreground truncate max-w-[120px]">
                                {batch.supplier_name || "-"}
                              </TableCell>
                              <TableCell className="text-center">
                                <Badge 
                                  className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                                    statusLabel === "Expired" || statusLabel === "Out of Stock"
                                      ? "bg-red-500/10 text-red-500 hover:bg-red-500/15"
                                      : statusLabel === "Shortage"
                                      ? "bg-orange-500/10 text-orange-500 hover:bg-orange-500/15"
                                      : statusLabel === "Low Stock"
                                      ? "bg-amber-500/10 text-amber-500 hover:bg-amber-500/15"
                                      : "bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/15"
                                  }`}
                                >
                                  {statusLabel}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

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
