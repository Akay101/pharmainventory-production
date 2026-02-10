import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { API } from "../App";
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
import { Search, Plus, Package, AlertTriangle, ChevronLeft, ChevronRight, ArrowUpDown, Trash2 } from "lucide-react";
import { toast } from "sonner";

export default function InventoryPage() {
  const [inventory, setInventory] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showLowStock, setShowLowStock] = useState(false);
  const [showExpiringSoon, setShowExpiringSoon] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState({ open: false, item: null, type: null });
  const [productDialog, setProductDialog] = useState(false);
  const [newProduct, setNewProduct] = useState({
    name: "",
    category: "medicine",
    hsn_no: "",
    description: "",
    low_stock_threshold: 10,
  });

  // Pagination State
  const [pagination, setPagination] = useState({ page: 1, limit: 30, total: 0, total_pages: 1 });
  const [sortBy, setSortBy] = useState("created_at");
  const [sortOrder, setSortOrder] = useState("desc");

  const fetchInventory = useCallback(async (page = 1) => {
    try {
      const params = new URLSearchParams();
      params.append("page", page);
      params.append("limit", pagination.limit);
      params.append("sort_by", sortBy);
      params.append("sort_order", sortOrder);
      if (search) params.append("search", search);
      if (showLowStock) params.append("low_stock", "true");
      if (showExpiringSoon) params.append("expiring_soon", "true");

      const response = await axios.get(`${API}/inventory?${params.toString()}`);
      setInventory(response.data.inventory);
      setPagination(response.data.pagination);
    } catch (error) {
      toast.error("Failed to load inventory");
    }
  }, [search, showLowStock, showExpiringSoon, sortBy, sortOrder, pagination.limit]);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    const debounce = setTimeout(() => {
      fetchInventory(1);
    }, 300);
    return () => clearTimeout(debounce);
  }, [search, showLowStock, showExpiringSoon, sortBy, sortOrder]);

  const fetchData = async () => {
    try {
      const prodRes = await axios.get(`${API}/products`);
      setProducts(prodRes.data.products);
      await fetchInventory(1);
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
      <div className="flex items-center justify-center h-64">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in" data-testid="inventory-page">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Inventory</h1>
          <p className="text-muted-foreground">
            {pagination.total} items in stock
          </p>
        </div>

        <Dialog open={productDialog} onOpenChange={setProductDialog}>
          <DialogTrigger asChild>
            <Button className="btn-primary" data-testid="add-product-btn">
              <Plus className="w-4 h-4 mr-2" />
              Add Product
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Product</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>Product Name *</Label>
                <Input
                  placeholder="Paracetamol 500mg"
                  value={newProduct.name}
                  onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                  data-testid="product-name-input"
                />
              </div>

              <div className="space-y-2">
                <Label>Category</Label>
                <Select
                  value={newProduct.category}
                  onValueChange={(v) => setNewProduct({ ...newProduct, category: v })}
                >
                  <SelectTrigger data-testid="product-category-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="medicine">Medicine</SelectItem>
                    <SelectItem value="cosmetic">Cosmetic</SelectItem>
                    <SelectItem value="consumable">Consumable</SelectItem>
                    <SelectItem value="equipment">Equipment</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>HSN Number</Label>
                <Input
                  placeholder="30049099"
                  value={newProduct.hsn_no}
                  onChange={(e) => setNewProduct({ ...newProduct, hsn_no: e.target.value })}
                  data-testid="product-hsn-input"
                />
              </div>

              <div className="space-y-2">
                <Label>Low Stock Threshold</Label>
                <Input
                  type="number"
                  placeholder="10"
                  value={newProduct.low_stock_threshold}
                  onChange={(e) =>
                    setNewProduct({ ...newProduct, low_stock_threshold: parseInt(e.target.value) || 10 })
                  }
                  data-testid="product-threshold-input"
                />
              </div>

              <Button onClick={handleCreateProduct} className="w-full btn-primary" data-testid="save-product-btn">
                Create Product
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <Card className="bg-card/50 backdrop-blur-sm border-white/5">
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by product name or batch..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
                data-testid="inventory-search"
              />
            </div>

            <div className="flex gap-2">
              <Button
                variant={showLowStock ? "default" : "outline"}
                onClick={() => setShowLowStock(!showLowStock)}
                className={showLowStock ? "bg-yellow-500/20 text-yellow-500 border-yellow-500/50" : ""}
                data-testid="low-stock-filter-btn"
              >
                <AlertTriangle className="w-4 h-4 mr-2" />
                Low Stock
              </Button>

              <Button
                variant={showExpiringSoon ? "default" : "outline"}
                onClick={() => setShowExpiringSoon(!showExpiringSoon)}
                className={showExpiringSoon ? "bg-destructive/20 text-destructive border-destructive/50" : ""}
                data-testid="expiring-filter-btn"
              >
                <AlertTriangle className="w-4 h-4 mr-2" />
                Expiring Soon
              </Button>
              
              {(search || showLowStock || showExpiringSoon) && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearch("");
                    setShowLowStock(false);
                    setShowExpiringSoon(false);
                  }}
                >
                  Clear
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Inventory Table */}
      <Card className="data-table">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <Button
                  variant="ghost"
                  onClick={() => handleSort("product_name")}
                  className="h-auto p-0 font-medium hover:bg-transparent"
                >
                  Product
                  <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
              </TableHead>
              <TableHead>MFG.</TableHead>
              <TableHead>Batch</TableHead>
              <TableHead>Pack Type</TableHead>
              <TableHead>
                <Button
                  variant="ghost"
                  onClick={() => handleSort("expiry_date")}
                  className="h-auto p-0 font-medium hover:bg-transparent"
                >
                  Expiry
                  <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
              </TableHead>
              <TableHead className="text-right">
                <Button
                  variant="ghost"
                  onClick={() => handleSort("available_quantity")}
                  className="h-auto p-0 font-medium hover:bg-transparent"
                >
                  Available Stock
                  <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
              </TableHead>
              <TableHead className="text-right">Cost/Unit</TableHead>
              <TableHead className="text-right">
                <Button
                  variant="ghost"
                  onClick={() => handleSort("mrp")}
                  className="h-auto p-0 font-medium hover:bg-transparent"
                >
                  MRP/Unit
                  <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
              </TableHead>
              <TableHead className="text-right">Stock Value</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {inventory.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
                  <Package className="w-10 h-10 mx-auto mb-2 opacity-50" />
                  No inventory items found
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
                  <TableRow key={item.id} data-testid={`inventory-row-${item.id}`}>
                    <TableCell className="font-medium">{item.product_name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{item.manufacturer || "-"}</TableCell>
                    <TableCell className="font-mono text-sm">{item.batch_no}</TableCell>
                    <TableCell className="text-sm">{packType}</TableCell>
                    <TableCell className="font-mono text-sm">{item.expiry_date}</TableCell>
                    <TableCell className="text-right">
                      <div className="font-mono font-medium text-primary">{stockDisplay}</div>
                      <div className="text-xs text-muted-foreground">({availableUnits} total units)</div>
                    </TableCell>
                    <TableCell className="text-right font-mono">₹{costPerUnit.toFixed(2)}</TableCell>
                    <TableCell className="text-right font-mono">₹{mrpPerUnit.toFixed(2)}</TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">₹{stockValue.toFixed(2)}</TableCell>
                    <TableCell>
                      {isExpired(item.expiry_date) ? (
                        <Badge variant="destructive">Expired</Badge>
                      ) : isExpiringSoon(item.expiry_date) ? (
                        <Badge className="bg-yellow-500/20 text-yellow-500 border-yellow-500/50">
                          Expiring Soon
                        </Badge>
                      ) : availableUnits <= 10 ? (
                        <Badge className="bg-orange-500/20 text-orange-500 border-orange-500/50">
                          Low Stock
                        </Badge>
                      ) : (
                        <Badge className="bg-primary/20 text-primary border-primary/50">In Stock</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setDeleteDialog({ open: true, item, type: "inventory" })}
                        data-testid={`delete-inventory-${item.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
        
        {/* Pagination */}
        {pagination.total_pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t">
            <div className="text-sm text-muted-foreground">
              Showing {((pagination.page - 1) * pagination.limit) + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} items
            </div>
            
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchInventory(pagination.page - 1)}
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
                      onClick={() => fetchInventory(pageNum)}
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
                onClick={() => fetchInventory(pagination.page + 1)}
                disabled={pagination.page >= pagination.total_pages}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Products List */}
      <Card className="bg-card/50 backdrop-blur-sm border-white/5">
        <CardHeader>
          <CardTitle className="text-lg">Products Catalog ({products.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {products.slice(0, 12).map((product) => (
              <div
                key={product.id}
                className="p-3 rounded-lg bg-muted/30 border border-white/5 hover:border-primary/20 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Package className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{product.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {product.category} • Threshold: {product.low_stock_threshold}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => setDeleteDialog({ open: true, item: product, type: "product" })}
                    data-testid={`delete-product-${product.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialog.open} onOpenChange={(open) => setDeleteDialog({ ...deleteDialog, open })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteDialog.type === "inventory" ? "Delete Inventory Item" : "Delete Product"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteDialog.type === "inventory" ? (
                <>
                  Are you sure you want to delete <strong>{deleteDialog.item?.product_name}</strong> (Batch: {deleteDialog.item?.batch_no})?
                  <br /><br />
                  This will remove {deleteDialog.item?.available_quantity} units from inventory.
                </>
              ) : (
                <>
                  Are you sure you want to delete the product <strong>{deleteDialog.item?.name}</strong>?
                  <br /><br />
                  This may affect related inventory items.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            {deleteDialog.type === "inventory" ? (
              <AlertDialogAction
                onClick={handleDeleteInventoryItem}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete Item
              </AlertDialogAction>
            ) : (
              <>
                <AlertDialogAction
                  onClick={() => handleDeleteProduct(false)}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Delete Product Only
                </AlertDialogAction>
                <AlertDialogAction
                  onClick={() => handleDeleteProduct(true)}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Delete with Inventory
                </AlertDialogAction>
              </>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
