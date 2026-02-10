import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { API } from "../App";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import {
  Camera,
  Upload,
  X,
  Plus,
  Check,
  Loader2,
  ArrowLeft,
  ShoppingCart,
  Trash2,
  Edit2,
} from "lucide-react";
import { toast } from "sonner";

export default function ScannerPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scannedItems, setScannedItems] = useState([]);
  const [editingItem, setEditingItem] = useState(null);
  const [suppliers, setSuppliers] = useState([]);
  const [selectedSupplier, setSelectedSupplier] = useState("");
  const [showSupplierSelect, setShowSupplierSelect] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [invoiceNo, setInvoiceNo] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("pharmalogy_token");
    if (token) {
      setIsAuthenticated(true);
      fetchSuppliers();
    }
  }, []);

  const fetchSuppliers = async () => {
    try {
      const response = await axios.get(`${API}/suppliers`);
      setSuppliers(response.data.suppliers || []);
    } catch (error) {
      console.error("Failed to fetch suppliers");
    }
  };

  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    setScanning(true);

    for (const file of files) {
      try {
        const formData = new FormData();
        formData.append("file", file);

        const response = await axios.post(
          `${API}/purchases/scan-image`,
          formData,
          {
            headers: { "Content-Type": "multipart/form-data" },
          }
        );

        if (response.data.success) {
          const scanned = response.data.scanned_product;
          setScannedItems((prev) => [
            ...prev,
            {
              id: Date.now() + Math.random(),
              product_name: scanned.product_name || "",
              manufacturer: scanned.manufacturer || "",
              salt_composition: scanned.salt_composition || "",
              pack_type: scanned.pack_type || "Strip",
              batch_no: scanned.batch_no || "",
              hsn_no: scanned.hsn_no || "",
              expiry_date: scanned.expiry_date || "",
              pack_quantity: 1, // Packs purchased
              units_per_pack: scanned.units_per_pack || 1,
              rate_pack: scanned.purchase_price || 0, // Rate per pack
              mrp_pack: scanned.mrp_pack || scanned.mrp || 0, // MRP per pack
              confidence: scanned.confidence || 75,
            },
          ]);
          toast.success(
            `Scanned: ${scanned.product_name || "Product detected"}`
          );
        } else {
          toast.error("Failed to scan - no product data found");
        }
      } catch (error) {
        toast.error(
          `Failed to scan ${file.name}: ${error.response?.data?.detail || error.message}`
        );
      }
    }

    setScanning(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleUpdateItem = (id, field, value) => {
    setScannedItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  };

  const handleRemoveItem = (id) => {
    setScannedItems((prev) => prev.filter((item) => item.id !== id));
  };

  // Calculate totals for an item
  const calculateItemTotals = (item) => {
    const packQty = parseInt(item.pack_quantity) || 1;
    const unitsPerPack = parseInt(item.units_per_pack) || 1;
    const ratePack = parseFloat(item.rate_pack) || 0;
    const mrpPack = parseFloat(item.mrp_pack) || 0;

    const totalUnits = packQty * unitsPerPack;
    const rateUnit = unitsPerPack > 0 ? ratePack / unitsPerPack : ratePack;
    const mrpUnit = unitsPerPack > 0 ? mrpPack / unitsPerPack : mrpPack;
    const totalAmount = packQty * ratePack;

    return { totalUnits, rateUnit, mrpUnit, totalAmount };
  };

  const handleCreatePurchase = async () => {
    if (!selectedSupplier) {
      toast.error("Please select a supplier");
      return;
    }

    if (scannedItems.length === 0) {
      toast.error("No items to add");
      return;
    }

    // Validate items
    const invalidItems = scannedItems.filter(
      (item) =>
        !item.product_name || !item.pack_quantity || item.pack_quantity <= 0
    );
    if (invalidItems.length > 0) {
      toast.error(
        "Please ensure all items have a product name and valid quantity"
      );
      return;
    }

    setSubmitting(true);
    try {
      const supplier = suppliers.find((s) => s.id === selectedSupplier);
      const purchaseData = {
        supplier_id: selectedSupplier,
        supplier_name: supplier?.name || "Unknown",
        invoice_no: invoiceNo || `SCAN-${Date.now()}`,
        items: scannedItems.map((item) => {
          const packQty = parseInt(item.pack_quantity) || 1;
          const unitsPerPack = parseInt(item.units_per_pack) || 1;
          const ratePack = parseFloat(item.rate_pack) || 0;
          const mrpPack = parseFloat(item.mrp_pack) || 0;
          const mrpUnit = unitsPerPack > 0 ? mrpPack / unitsPerPack : mrpPack;

          return {
            product_id: `scanned_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            product_name: item.product_name,
            manufacturer: item.manufacturer || null,
            salt_composition: item.salt_composition || null,
            pack_type: item.pack_type || "Strip",
            batch_no: item.batch_no || null,
            hsn_no: item.hsn_no || null,
            expiry_date: item.expiry_date || null,
            pack_quantity: packQty,
            units_per_pack: unitsPerPack,
            pack_price: ratePack,
            mrp_per_unit: mrpUnit,
          };
        }),
      };

      await axios.post(`${API}/purchases`, purchaseData);
      toast.success("Purchase created successfully!");
      setScannedItems([]);
      setSelectedSupplier("");
      setInvoiceNo("");
      setShowSupplierSelect(false);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to create purchase");
    } finally {
      setSubmitting(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl text-primary">
              Smart Scanner
            </CardTitle>
            <p className="text-muted-foreground">
              Please login to use the scanner
            </p>
          </CardHeader>
          <CardContent>
            <Button
              className="w-full btn-primary"
              onClick={() => navigate("/login")}
            >
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background" data-testid="scanner-page">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-card/95 backdrop-blur border-b border-white/10 px-4 py-3">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/purchases")}
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-lg font-bold text-primary">Smart Scanner</h1>
          <Badge variant="outline" className="text-primary border-primary">
            {scannedItems.length} items
          </Badge>
        </div>
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-4">
        {/* Scan Button Area */}
        <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
          <CardContent className="p-6">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="hidden"
            />

            <div className="text-center space-y-4">
              <div className="w-20 h-20 mx-auto rounded-full bg-primary/20 flex items-center justify-center">
                {scanning ? (
                  <Loader2 className="w-10 h-10 text-primary animate-spin" />
                ) : (
                  <Camera className="w-10 h-10 text-primary" />
                )}
              </div>

              <div>
                <h2 className="text-xl font-bold mb-1">Scan Products</h2>
                <p className="text-sm text-muted-foreground">
                  Take photos of medicine packaging to auto-detect product
                  details
                </p>
              </div>

              <div className="flex gap-2 justify-center">
                <Button
                  className="btn-primary"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={scanning}
                  data-testid="scan-btn"
                >
                  {scanning ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Scanning...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 mr-2" />
                      Upload Images
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Scanned Items List */}
        {scannedItems.length > 0 && (
          <div className="space-y-3">
            <h3 className="font-semibold text-sm text-muted-foreground">
              SCANNED ITEMS ({scannedItems.length})
            </h3>

            {scannedItems.map((item) => {
              const { totalUnits, rateUnit, mrpUnit, totalAmount } =
                calculateItemTotals(item);

              return (
                <Card
                  key={item.id}
                  className="bg-card/50 backdrop-blur border-white/10"
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          {item.confidence >= 70 ? (
                            <Badge className="bg-primary/20 text-primary text-xs">
                              {item.confidence}% match
                            </Badge>
                          ) : (
                            <Badge className="bg-yellow-500/20 text-yellow-500 text-xs">
                              Review needed
                            </Badge>
                          )}
                          <span className="text-xs text-muted-foreground">
                            Total: {totalUnits} units | ₹
                            {totalAmount.toFixed(2)}
                          </span>
                        </div>

                        <Input
                          value={item.product_name}
                          onChange={(e) =>
                            handleUpdateItem(
                              item.id,
                              "product_name",
                              e.target.value
                            )
                          }
                          className="font-medium mb-2"
                          placeholder="Product Name *"
                        />

                        <div className="grid grid-cols-2 gap-2 text-sm mb-2">
                          <div>
                            <Label className="text-xs text-muted-foreground">
                              Manufacturer
                            </Label>
                            <Input
                              value={item.manufacturer || ""}
                              onChange={(e) =>
                                handleUpdateItem(
                                  item.id,
                                  "manufacturer",
                                  e.target.value
                                )
                              }
                              className="h-8 text-sm"
                              placeholder="Manufacturer"
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">
                              Salt/Composition
                            </Label>
                            <Input
                              value={item.salt_composition || ""}
                              onChange={(e) =>
                                handleUpdateItem(
                                  item.id,
                                  "salt_composition",
                                  e.target.value
                                )
                              }
                              className="h-8 text-sm"
                              placeholder="Salt Composition"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2 text-sm mb-2">
                          <div>
                            <Label className="text-xs text-muted-foreground">
                              Pack Type
                            </Label>
                            <select
                              value={item.pack_type || "Strip"}
                              onChange={(e) =>
                                handleUpdateItem(
                                  item.id,
                                  "pack_type",
                                  e.target.value
                                )
                              }
                              className="w-full h-8 rounded-md border border-input bg-background px-2 text-sm"
                            >
                              <option value="Strip">Strip</option>
                              <option value="Bottle">Bottle</option>
                              <option value="Tube">Tube</option>
                              <option value="Box">Box</option>
                              <option value="Vial">Vial</option>
                              <option value="Syrup">Syrup</option>
                              <option value="Cream">Cream</option>
                              <option value="Injection">Injection</option>
                            </select>
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">
                              Batch
                            </Label>
                            <Input
                              value={item.batch_no || ""}
                              onChange={(e) =>
                                handleUpdateItem(
                                  item.id,
                                  "batch_no",
                                  e.target.value
                                )
                              }
                              className="h-8 text-sm"
                              placeholder="Batch No"
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">
                              HSN
                            </Label>
                            <Input
                              value={item.hsn_no || ""}
                              onChange={(e) =>
                                handleUpdateItem(
                                  item.id,
                                  "hsn_no",
                                  e.target.value
                                )
                              }
                              className="h-8 text-sm"
                              placeholder="HSN Code"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-sm mb-2">
                          <div>
                            <Label className="text-xs text-muted-foreground">
                              Expiry Date
                            </Label>
                            <Input
                              type="date"
                              value={item.expiry_date || ""}
                              onChange={(e) =>
                                handleUpdateItem(
                                  item.id,
                                  "expiry_date",
                                  e.target.value
                                )
                              }
                              className="h-8 text-sm"
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">
                              Units/Pack
                            </Label>
                            <Input
                              type="number"
                              value={item.units_per_pack || 1}
                              onChange={(e) =>
                                handleUpdateItem(
                                  item.id,
                                  "units_per_pack",
                                  e.target.value
                                )
                              }
                              className="h-8 text-sm"
                              min="1"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2 text-sm">
                          <div>
                            <Label className="text-xs text-muted-foreground">
                              Qty (Packs) *
                            </Label>
                            <Input
                              type="number"
                              value={item.pack_quantity || 1}
                              onChange={(e) =>
                                handleUpdateItem(
                                  item.id,
                                  "pack_quantity",
                                  e.target.value
                                )
                              }
                              className="h-8 text-sm"
                              min="1"
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">
                              Rate/Pack
                            </Label>
                            <Input
                              type="number"
                              value={item.rate_pack || ""}
                              onChange={(e) =>
                                handleUpdateItem(
                                  item.id,
                                  "rate_pack",
                                  e.target.value
                                )
                              }
                              className="h-8 text-sm"
                              step="0.01"
                              placeholder="₹"
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">
                              MRP/Pack
                            </Label>
                            <Input
                              type="number"
                              value={item.mrp_pack || ""}
                              onChange={(e) =>
                                handleUpdateItem(
                                  item.id,
                                  "mrp_pack",
                                  e.target.value
                                )
                              }
                              className="h-8 text-sm"
                              step="0.01"
                              placeholder="₹"
                            />
                          </div>
                        </div>

                        {(rateUnit > 0 || mrpUnit > 0) && (
                          <p className="text-xs text-muted-foreground mt-2">
                            Rate/Unit: ₹{rateUnit.toFixed(2)} | MRP/Unit: ₹
                            {mrpUnit.toFixed(2)}
                          </p>
                        )}
                      </div>

                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => handleRemoveItem(item.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Add to Purchase Button */}
        {scannedItems.length > 0 && (
          <Card className="bg-card/50 backdrop-blur border-white/10 sticky bottom-4">
            <CardContent className="p-4">
              {!showSupplierSelect ? (
                <Button
                  className="w-full btn-primary"
                  onClick={() => setShowSupplierSelect(true)}
                  data-testid="add-purchase-btn"
                >
                  <ShoppingCart className="w-4 h-4 mr-2" />
                  Create Purchase ({scannedItems.length} items)
                </Button>
              ) : (
                <div className="space-y-3">
                  <div>
                    <Label>Select Supplier *</Label>
                    <select
                      value={selectedSupplier}
                      onChange={(e) => setSelectedSupplier(e.target.value)}
                      className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="">Select a supplier...</option>
                      {suppliers.map((supplier) => (
                        <option key={supplier.id} value={supplier.id}>
                          {supplier.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <Label>Invoice No (Optional)</Label>
                    <Input
                      value={invoiceNo}
                      onChange={(e) => setInvoiceNo(e.target.value)}
                      placeholder="Invoice Number"
                      className="h-10"
                    />
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => setShowSupplierSelect(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      className="flex-1 btn-primary"
                      onClick={handleCreatePurchase}
                      disabled={submitting || !selectedSupplier}
                    >
                      {submitting ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Creating...
                        </>
                      ) : (
                        <>
                          <Check className="w-4 h-4 mr-2" />
                          Confirm
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Tips */}
        <Card className="bg-muted/30 border-white/5">
          <CardContent className="p-4">
            <h4 className="font-medium mb-2 text-sm">Tips for Best Results</h4>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li>• Ensure good lighting on the product label</li>
              <li>• Capture the full product name and details</li>
              <li>• Include batch number and expiry date in frame</li>
              <li>• Quantity must be entered manually</li>
              <li>• Review and edit detected fields as needed</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
