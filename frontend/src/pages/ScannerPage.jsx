import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { API, getCookie } from "../App";
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
  Sparkles,
  ChevronDown,
  Search,
} from "lucide-react";
import { toast } from "sonner";

export default function ScannerPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const billInputRef = useRef(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0); // [Issue #14] Progress UI
  const [scannedItems, setScannedItems] = useState([]);
  const [editingItem, setEditingItem] = useState(null);
  const [suppliers, setSuppliers] = useState([]);
  const [selectedSupplier, setSelectedSupplier] = useState("");
  const [showSupplierSelect, setShowSupplierSelect] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [invoiceNo, setInvoiceNo] = useState("");
  
  // [Issue #Suppliers] Infinite Scroll & Search
  const [supplierSearch, setSupplierSearch] = useState("");
  const [supplierPage, setSupplierPage] = useState(1);
  const [hasMoreSuppliers, setHasMoreSuppliers] = useState(true);
  const [loadingSuppliers, setLoadingSuppliers] = useState(false);
  const [isSupplierDropdownOpen, setIsSupplierDropdownOpen] = useState(false);
  const [highlightedSupplierIndex, setHighlightedSupplierIndex] = useState(-1);
  const supplierDropdownRef = useRef(null);
  const supplierScrollRef = useRef(null);

  const [scanMode, setScanMode] = useState("product"); // "product" | "bill"
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [previewUrls, setPreviewUrls] = useState([]);

  useEffect(() => {
    return () => {
      previewUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [previewUrls]);

  useEffect(() => {
    const token = getCookie("pharmalogy_token");
    if (token) {
      setIsAuthenticated(true);
      fetchSuppliers();
    }
  }, []);

  const fetchSuppliers = async (page = 1, search = "", append = false) => {
    if (loadingSuppliers) return;
    setLoadingSuppliers(true);
    try {
      const response = await axios.get(
        `${API}/suppliers?page=${page}&limit=20&search=${search}`
      );
      const newSuppliers = response.data.suppliers || [];
      
      if (append) {
        setSuppliers(prev => [...prev, ...newSuppliers]);
      } else {
        setSuppliers(newSuppliers);
      }
      
      setHasMoreSuppliers(newSuppliers.length === 20);
      setSupplierPage(page);
    } catch (error) {
      console.error("Failed to fetch suppliers");
    } finally {
      setLoadingSuppliers(false);
    }
  };

  // Debounced search
  useEffect(() => {
    const delay = setTimeout(() => {
      if (isSupplierDropdownOpen || supplierSearch) {
        fetchSuppliers(1, supplierSearch, false);
        setHighlightedSupplierIndex(-1);
      }
    }, 300);
    return () => clearTimeout(delay);
  }, [supplierSearch]);

  useEffect(() => {
    if (!isSupplierDropdownOpen) {
      setHighlightedSupplierIndex(-1);
    }
  }, [isSupplierDropdownOpen]);

  // Handle keyboard navigation for supplier dropdown
  const handleSupplierKeyDown = (e) => {
    if (!isSupplierDropdownOpen) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedSupplierIndex(prev => 
          prev < suppliers.length - 1 ? prev + 1 : prev
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedSupplierIndex(prev => 
          prev > 0 ? prev - 1 : prev
        );
        break;
      case "Enter":
        e.preventDefault();
        if (highlightedSupplierIndex >= 0 && highlightedSupplierIndex < suppliers.length) {
          const supplier = suppliers[highlightedSupplierIndex];
          setSelectedSupplier(supplier.id);
          setIsSupplierDropdownOpen(false);
        }
        break;
      case "Escape":
        setIsSupplierDropdownOpen(false);
        break;
      case "Tab":
        setIsSupplierDropdownOpen(false);
        break;
    }
  };

  // Auto-scroll highlighted supplier into view
  useEffect(() => {
    if (highlightedSupplierIndex >= 0 && supplierScrollRef.current) {
      const container = supplierScrollRef.current;
      const highlightedElement = container.querySelector(`[data-index="${highlightedSupplierIndex}"]`);
      if (highlightedElement) {
        const containerRect = container.getBoundingClientRect();
        const elementRect = highlightedElement.getBoundingClientRect();

        if (elementRect.bottom > containerRect.bottom) {
          container.scrollTop += elementRect.bottom - containerRect.bottom;
        } else if (elementRect.top < containerRect.top) {
          container.scrollTop -= containerRect.top - elementRect.top;
        }
      }
    }
  }, [highlightedSupplierIndex]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (supplierDropdownRef.current && !supplierDropdownRef.current.contains(event.target)) {
        setIsSupplierDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const formatDateForInput = (dateStr) => {
    if (!dateStr) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;

    // Handle MM/YY or MM/YYYY format
    const mmYyMatch = dateStr.match(/^(\d{2})[/.-](\d{2}|\d{4})$/);
    if (mmYyMatch) {
      const month = mmYyMatch[1];
      let year = mmYyMatch[2];
      if (year.length === 2) year = "20" + year; // Assume 20xx

      // Get last day of the month
      const lastDay = new Date(year, month, 0).getDate();
      return `${year}-${month}-${String(lastDay).padStart(2, "0")}`;
    }

    // Native date parsing
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      return d.toISOString().split("T")[0];
    }
    return dateStr;
  };

  // Unified file change handler (stages files)
  const handleFileChange = (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    setSelectedFiles((prev) => [...prev, ...files]);

    const newUrls = files.map((f) => URL.createObjectURL(f));
    setPreviewUrls((prev) => [...prev, ...newUrls]);

    // reset inputs
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (billInputRef.current) billInputRef.current.value = "";
  };

  const handleRemoveFile = (index) => {
    URL.revokeObjectURL(previewUrls[index]);
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
    setPreviewUrls((prev) => prev.filter((_, i) => i !== index));
  };

  // Perform the bulk upload
  const pollingRef = useRef(null);

  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  const handleConfirmAndAnalyze = async () => {
    if (selectedFiles.length === 0) return;

    // [Issue #15] Frontend Validation
    if (selectedFiles.length > 10) {
      toast.error("Maximum 10 images allowed per scan");
      return;
    }

    setScanning(true);

    try {
      const formData = new FormData();
      selectedFiles.forEach((file) => {
        formData.append("files", file);
      });

      const endpoint =
        scanMode === "product"
          ? "/purchases/scan-image"
          : "/purchases/scan-bill";
      const response = await axios.post(`${API}${endpoint}`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      if (response.data.success && response.data.jobId) {
        const jobId = response.data.jobId;
        pollJobStatus(jobId);
      } else {
        toast.error("Failed to start scan");
        setScanning(false);
      }
    } catch (error) {
      toast.error(
        `Failed to scan: ${error.response?.data?.detail || error.message}`
      );
      setScanning(false);
    }
  };

  const pollJobStatus = (jobId) => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    const startTime = Date.now();
    const MAX_POLLING_MS = 3 * 60 * 1000; // 3 minutes

    pollingRef.current = setInterval(async () => {
      try {
        // [Issue #11] Check for timeout
        if (Date.now() - startTime > MAX_POLLING_MS) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
          toast.error(
            "Scanning timed out. Please check the queue dashboard or try again."
          );
          setScanning(false);
          setScanProgress(0);
          return;
        }

        const response = await axios.get(
          `${API}/purchases/scan-status/${jobId}`
        );
        const job = response.data;

        if (job.progress) {
          setScanProgress(job.progress);
        }

        if (job.status === "completed") {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
          setScanProgress(100);
          processScanResult(job.result);
          setScanning(false);
          setScanProgress(0);
          setSelectedFiles([]);
          setPreviewUrls([]);
        } else if (job.status === "failed") {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
          toast.error(`Scan failed: ${job.errorMessage || "Unknown error"}`);
          setScanning(false);
          setScanProgress(0);
        }
      } catch (error) {
        if (error.response?.status !== 404) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
          toast.error("Error checking scan status");
          setScanning(false);
        }
      }
    }, 2000);
  };

  const processScanResult = (data) => {
    if (scanMode === "product") {
      const scanned = data.scanned_product;
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
          expiry_date: formatDateForInput(scanned.expiry_date),
          pack_quantity: 1, // Packs purchased
          units_per_pack: scanned.units_per_pack || 1,
          rate_pack: scanned.purchase_price || 0, // Rate per pack
          mrp_pack: scanned.mrp_pack || scanned.mrp || 0, // MRP per pack
          confidence: scanned.confidence || 75,
        },
      ]);
      toast.success(`Scanned: ${scanned.product_name || "Product detected"}`);
    } else {
      const billData = data.purchase_data;
      if (billData.invoice_no) setInvoiceNo(billData.invoice_no);

      const matchedSupplier = suppliers.find((s) =>
        s.name
          .toLowerCase()
          .includes((billData.supplier_name || "").toLowerCase())
      );
      if (matchedSupplier) setSelectedSupplier(matchedSupplier.id);

      const mappedItems = (billData.items || []).map((item) => ({
        id: Date.now() + Math.random(),
        product_name: item.product_name || "",
        manufacturer: item.manufacturer || "",
        salt_composition: item.salt_composition || "",
        pack_type: "Strip",
        batch_no: item.batch_no || "",
        hsn_no: item.hsn_no || "",
        expiry_date: formatDateForInput(item.expiry_date),
        pack_quantity: item.quantity || 1,
        units_per_pack: 1,
        rate_pack: item.rate_pack || 0,
        mrp_pack: item.mrp || 0,
        confidence: 85,
      }));

      setScannedItems((prev) => [...prev, ...mappedItems]);
      toast.success(`Bill scanned: ${mappedItems.length} items detected`);
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
        <Card className="w-full max-w-md glass bg-card/45 backdrop-blur-xl border border-border/70 shadow-2xl rounded-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-300">
          <CardHeader className="text-center pb-2">
            <CardTitle className="text-3xl font-extrabold bg-gradient-to-r from-primary to-primary/80 bg-clip-text text-transparent">
              Smart Scanner
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-2">
              Please login to use the scanner
            </p>
          </CardHeader>
          <CardContent className="pt-4">
            <Button
              className="w-full btn-primary h-11 rounded-xl shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all font-bold text-sm"
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
    <div className="min-h-screen bg-background pb-20" data-testid="scanner-page">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-card/45 backdrop-blur-xl border-b border-border/70 px-4 py-3 shadow-sm">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full hover:bg-primary/10 hover:text-primary transition-all duration-200"
            onClick={() => navigate("/purchases")}
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-lg font-bold bg-gradient-to-r from-primary to-primary/80 bg-clip-text text-transparent flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary animate-pulse" />
            Smart Scanner
          </h1>
          <Badge className="bg-primary/10 hover:bg-primary/20 text-primary border-primary/20 transition-all rounded-full px-3 py-1 font-semibold text-xs">
            {scannedItems.length} {scannedItems.length === 1 ? "item" : "items"}
          </Badge>
        </div>
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-4">
        {/* Scan Button Area */}
        <Card className="glass bg-card/45 backdrop-blur-xl border border-border/70 shadow-xl rounded-2xl overflow-hidden">
          <CardContent className="p-6">
            {/* Hidden Inputs */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="hidden"
            />

            <input
              type="file"
              ref={billInputRef}
              onChange={handleFileChange}
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="hidden"
            />

            <div className="text-center space-y-4">
              {/* Mode Toggle Capsule */}
              <div className="inline-flex p-1 bg-muted/40 dark:bg-muted/20 backdrop-blur-md rounded-full border border-border/50 max-w-md mx-auto mb-2">
                <button
                  type="button"
                  className={`px-4 py-2 text-xs font-semibold rounded-full transition-all duration-300 ${
                    scanMode === "product"
                      ? "bg-background text-primary shadow-sm scale-[1.02]"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => {
                    setScanMode("product");
                    setSelectedFiles([]);
                    setPreviewUrls([]);
                  }}
                  disabled={scanning}
                >
                  Scan Products
                </button>

                <button
                  type="button"
                  className={`px-4 py-2 text-xs font-semibold rounded-full transition-all duration-300 ${
                    scanMode === "bill"
                      ? "bg-background text-primary shadow-sm scale-[1.02]"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => {
                    setScanMode("bill");
                    setSelectedFiles([]);
                    setPreviewUrls([]);
                  }}
                  disabled={scanning}
                >
                  Scan Purchase Bill
                </button>
              </div>

              {scanning ? (
                <div className="flex flex-col items-center justify-center space-y-6 py-8">
                  {/* Glowing AI Spinner */}
                  <div className="relative w-28 h-28 flex items-center justify-center">
                    {/* Ring animations */}
                    <div className="absolute w-full h-full rounded-full border-2 border-primary/20"></div>
                    <div className="absolute w-full h-full rounded-full border-t-2 border-primary animate-spin duration-1000"></div>
                    <div className="absolute w-20 h-20 rounded-full border-2 border-primary/10"></div>
                    <div className="absolute w-20 h-20 rounded-full border-b-2 border-primary/60 animate-[spin_2s_linear_infinite_reverse]"></div>
                    <div className="absolute w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shadow-lg shadow-primary/20">
                      <Sparkles className="w-6 h-6 text-primary animate-pulse" />
                    </div>
                    <div className="absolute w-full h-full bg-primary/5 rounded-full animate-ping opacity-15"></div>
                  </div>
                  <div className="w-full max-w-[280px] space-y-3">
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs font-bold text-primary tracking-wide">
                        <span className="uppercase">
                          {scanProgress < 20
                            ? "Initializing..."
                            : scanProgress < 35
                              ? "Compressing..."
                              : scanProgress < 50
                                ? "Starting AI..."
                                : scanProgress < 85
                                  ? "AI Extraction..."
                                  : "Finalizing..."}
                        </span>
                        <span>{scanProgress}%</span>
                      </div>
                      <div className="w-full bg-primary/10 h-2 rounded-full overflow-hidden border border-primary/5 p-[1px]">
                        <div
                          className="bg-gradient-to-r from-primary to-primary/60 h-full rounded-full transition-all duration-700 ease-out shadow-sm"
                          style={{ width: `${scanProgress}%` }}
                        ></div>
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest text-center animate-pulse">
                      Processing high-fidelity data
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  {/* Upload Area */}
                  <div 
                    onClick={() =>
                      scanMode === "product"
                        ? fileInputRef.current?.click()
                        : billInputRef.current?.click()
                    }
                    className="border-2 border-dashed border-border/80 hover:border-primary/50 bg-muted/20 dark:bg-muted/10 rounded-2xl p-8 cursor-pointer transition-all duration-300 hover:scale-[1.01] hover:shadow-inner group"
                  >
                    <div className="w-14 h-14 mx-auto rounded-full bg-primary/10 group-hover:bg-primary/20 flex items-center justify-center mb-4 transition-all duration-300 group-hover:scale-110 shadow-sm">
                      <Camera className="w-6 h-6 text-primary group-hover:text-primary-foreground transition-all duration-300" />
                    </div>

                    {scanMode === "product" ? (
                      <>
                        <h2 className="text-base font-bold text-foreground mb-1 group-hover:text-primary transition-colors">
                          Scan Product Images
                        </h2>
                        <p className="text-xs text-muted-foreground max-w-sm mx-auto leading-relaxed">
                          Drag and drop or click to upload images of a <b>single product</b> (front, back, composition) to automatically extract complete details.
                        </p>
                      </>
                    ) : (
                      <>
                        <h2 className="text-base font-bold text-foreground mb-1 group-hover:text-primary transition-colors">
                          Scan Invoice Images
                        </h2>
                        <p className="text-xs text-muted-foreground max-w-sm mx-auto leading-relaxed">
                          Drag and drop or click to upload all pages of a <b>single purchase bill</b>.
                        </p>
                      </>
                    )}
                  </div>

                  {/* Staged Images Preview */}
                  {previewUrls.length > 0 && (
                    <div className="flex flex-wrap gap-3 justify-center mb-4 mt-6 bg-muted/30 dark:bg-muted/10 p-4 rounded-xl border border-border/40 shadow-inner">
                      {previewUrls.map((url, i) => (
                        <div
                          key={i}
                          className="relative group w-20 h-20 rounded-xl overflow-hidden ring-2 ring-border hover:ring-primary/50 shadow-md transition-all duration-200 hover:scale-105"
                        >
                          <img
                            src={url}
                            alt={`preview-${i}`}
                            className="w-full h-full object-cover"
                          />
                          <button
                            type="button"
                            className="absolute top-1 right-1 p-1 bg-black/60 hover:bg-destructive text-white rounded-full backdrop-blur-sm transition-all duration-200 opacity-90 hover:opacity-100 scale-90"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveFile(i);
                            }}
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        className="w-20 h-20 flex flex-col items-center justify-center border-2 border-dashed border-primary/40 text-primary hover:text-primary-foreground hover:bg-primary/20 hover:border-primary transition-all duration-200 rounded-xl text-xs font-semibold bg-primary/5"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (scanMode === "product") {
                            fileInputRef.current?.click();
                          } else {
                            billInputRef.current?.click();
                          }
                        }}
                      >
                        <Plus className="w-5 h-5 mb-1 animate-pulse" />
                        Add More
                      </button>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="mt-6">
                    {selectedFiles.length === 0 ? (
                      <Button
                        className="btn-primary w-full h-11 rounded-xl shadow-lg shadow-primary/20 hover:shadow-primary/30 text-sm font-semibold transition-all duration-300"
                        onClick={() =>
                          scanMode === "product"
                            ? fileInputRef.current?.click()
                            : billInputRef.current?.click()
                        }
                      >
                        <Upload className="w-4 h-4 mr-2" />
                        Select Images
                      </Button>
                    ) : (
                      <Button
                        className="btn-primary w-full h-11 rounded-xl shadow-lg shadow-primary/25 hover:shadow-primary/35 text-sm font-bold animate-in fade-in slide-in-from-bottom-2 duration-300"
                        onClick={handleConfirmAndAnalyze}
                      >
                        <Sparkles className="w-4 h-4 mr-2 animate-bounce" />
                        Confirm & Extract Details
                      </Button>
                    )}
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Scanned Items List */}
        {scannedItems.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between px-1">
              <h3 className="font-bold text-xs text-muted-foreground uppercase tracking-widest">
                Scanned Items ({scannedItems.length})
              </h3>
              <span className="text-[10px] text-muted-foreground/80 font-medium italic">
                * Edit fields if required
              </span>
            </div>

            {scannedItems.map((item) => {
              const { totalUnits, rateUnit, mrpUnit, totalAmount } =
                calculateItemTotals(item);

              return (
                <Card
                  key={item.id}
                  className="glass bg-card/45 backdrop-blur-xl border border-border/70 shadow-lg rounded-2xl overflow-hidden transition-all duration-200 hover:shadow-xl hover:border-primary/35"
                >
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0 space-y-4">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div className="flex items-center gap-2">
                            {item.confidence >= 70 ? (
                              <Badge className="bg-emerald-500/10 hover:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-[10px] font-bold rounded-full px-2.5 py-0.5">
                                {item.confidence}% match
                              </Badge>
                            ) : (
                              <Badge className="bg-amber-500/10 hover:bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20 text-[10px] font-bold rounded-full px-2.5 py-0.5">
                                Review needed
                              </Badge>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground font-semibold bg-muted/40 dark:bg-muted/20 px-2.5 py-1 rounded-full border border-border/30">
                            Total: {totalUnits} {totalUnits === 1 ? "unit" : "units"} | <span className="text-primary">₹{totalAmount.toFixed(2)}</span>
                          </span>
                        </div>

                        {/* Product Name Input */}
                        <div className="space-y-1.5">
                          <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">
                            Product Name *
                          </Label>
                          <Input
                            value={item.product_name}
                            onChange={(e) =>
                              handleUpdateItem(
                                item.id,
                                "product_name",
                                e.target.value
                              )
                            }
                            className="font-semibold text-sm h-10 rounded-xl bg-background/50 border-border focus:ring-2 focus:ring-primary/20 focus:border-primary"
                            placeholder="Enter Product Name"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">
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
                              className="h-9 text-xs rounded-xl bg-background/50 border-border"
                              placeholder="e.g. Cipla"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">
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
                              className="h-9 text-xs rounded-xl bg-background/50 border-border"
                              placeholder="Active Ingredients"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-3">
                          <div className="space-y-1.5">
                            <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">
                              Pack Type
                            </Label>
                            <div className="relative">
                              <select
                                value={item.pack_type || "Strip"}
                                onChange={(e) =>
                                  handleUpdateItem(
                                    item.id,
                                    "pack_type",
                                    e.target.value
                                  )
                                }
                                className="w-full h-9 rounded-xl border border-border bg-background/50 px-3 text-xs focus:ring-2 focus:ring-primary/20 focus:border-primary appearance-none cursor-pointer pr-8"
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
                              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/80 pointer-events-none" />
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">
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
                              className="h-9 text-xs rounded-xl bg-background/50 border-border"
                              placeholder="Batch No"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">
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
                              className="h-9 text-xs rounded-xl bg-background/50 border-border font-mono"
                              placeholder="HSN Code"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">
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
                              className="h-9 text-xs rounded-xl bg-background/50 border-border"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">
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
                              className="h-9 text-xs rounded-xl bg-background/50 border-border"
                              min="1"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-3">
                          <div className="space-y-1.5">
                            <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">
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
                              className="h-9 text-xs rounded-xl bg-background/50 border-border"
                              min="1"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">
                              Rate/Pack
                            </Label>
                            <div className="relative">
                              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">₹</span>
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
                                className="h-9 pl-6 text-xs rounded-xl bg-background/50 border-border"
                                step="0.01"
                                placeholder="0.00"
                              />
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">
                              MRP/Pack
                            </Label>
                            <div className="relative">
                              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">₹</span>
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
                                className="h-9 pl-6 text-xs rounded-xl bg-background/50 border-border"
                                step="0.01"
                                placeholder="0.00"
                              />
                            </div>
                          </div>
                        </div>

                        {(rateUnit > 0 || mrpUnit > 0) && (
                          <div className="pt-2 border-t border-border/40 flex justify-between text-[11px] text-muted-foreground/90">
                            <span>Rate/Unit: <b>₹{rateUnit.toFixed(2)}</b></span>
                            <span>MRP/Unit: <b>₹{mrpUnit.toFixed(2)}</b></span>
                          </div>
                        )}
                      </div>

                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive-foreground hover:bg-destructive/10 rounded-full h-8 w-8 transition-colors shrink-0"
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
          <Card className="glass bg-card/75 backdrop-blur-xl border border-border/80 sticky bottom-4 z-40 shadow-2xl rounded-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-5 duration-300">
            <CardContent className="p-4">
              {!showSupplierSelect ? (
                <Button
                  className="w-full btn-primary h-11 text-sm font-bold rounded-xl shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all duration-300"
                  onClick={() => setShowSupplierSelect(true)}
                  data-testid="add-purchase-btn"
                >
                  <ShoppingCart className="w-4 h-4 mr-2" />
                  Create Purchase ({scannedItems.length} {scannedItems.length === 1 ? "item" : "items"})
                </Button>
              ) : (
                <div className="space-y-4">
                  <div className="relative" ref={supplierDropdownRef}>
                    <Label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted-foreground/80">Select Supplier *</Label>
                    <div 
                      className={`w-full h-11 rounded-xl border ${isSupplierDropdownOpen ? 'border-primary ring-2 ring-primary/10' : 'border-border'} bg-background/50 backdrop-blur-sm px-4 flex items-center justify-between cursor-pointer transition-all hover:border-primary/50`}
                      onClick={() => {
                        setIsSupplierDropdownOpen(!isSupplierDropdownOpen);
                        if (!isSupplierDropdownOpen && suppliers.length === 0) {
                          fetchSuppliers(1, supplierSearch, false);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === "ArrowDown" || e.key === "ArrowUp") {
                          setIsSupplierDropdownOpen(true);
                        }
                      }}
                      tabIndex={0}
                    >
                      <span className={`text-sm ${!selectedSupplier ? 'text-muted-foreground' : 'font-semibold'}`}>
                        {selectedSupplier 
                          ? suppliers.find(s => s.id === selectedSupplier)?.name || "Select Supplier"
                          : "Choose a supplier..."
                        }
                      </span>
                      <ChevronDown className={`w-4 h-4 text-muted-foreground/80 transition-transform duration-200 ${isSupplierDropdownOpen ? 'rotate-180' : ''}`} />
                    </div>

                    {isSupplierDropdownOpen && (
                      <div className="absolute bottom-full mb-2 left-0 z-[100] w-full bg-card/95 backdrop-blur-xl border border-border/80 rounded-xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200">
                        <div className="p-2 border-b border-border/50">
                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                            <Input 
                              autoFocus
                              placeholder="Search suppliers..." 
                              className="pl-9 h-9 text-xs bg-muted/40 border-none rounded-lg focus-visible:ring-1 focus-visible:ring-primary/30"
                              value={supplierSearch}
                              onChange={(e) => setSupplierSearch(e.target.value)}
                              onKeyDown={handleSupplierKeyDown}
                              onClick={(e) => e.stopPropagation()}
                            />
                          </div>
                        </div>
                        
                        <div 
                          ref={supplierScrollRef}
                          className="max-h-[200px] overflow-y-auto p-1 custom-scrollbar"
                          onScroll={(e) => {
                            const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
                            if (scrollHeight - scrollTop <= clientHeight + 50 && hasMoreSuppliers && !loadingSuppliers) {
                              fetchSuppliers(supplierPage + 1, supplierSearch, true);
                            }
                          }}
                        >
                          {suppliers.map((supplier, idx) => (
                            <div
                              key={supplier.id}
                              data-index={idx}
                              className={`flex items-center justify-between p-2.5 rounded-lg cursor-pointer transition-colors ${
                                highlightedSupplierIndex === idx
                                  ? 'bg-primary/20 text-primary font-medium'
                                  : (selectedSupplier === supplier.id 
                                    ? 'bg-primary/10 text-primary font-bold' 
                                    : 'hover:bg-muted/50 text-foreground/80')
                              }`}
                              onClick={() => {
                                setSelectedSupplier(supplier.id);
                                setIsSupplierDropdownOpen(false);
                              }}
                              onMouseEnter={() => setHighlightedSupplierIndex(idx)}
                            >
                              <div className="flex flex-col">
                                <span className="text-sm font-semibold">{supplier.name}</span>
                                {supplier.phone && <span className="text-[10px] opacity-60 font-mono">{supplier.phone}</span>}
                              </div>
                              {selectedSupplier === supplier.id && <Check className="w-4 h-4 text-primary" />}
                            </div>
                          ))}
                          
                          {loadingSuppliers && (
                            <div className="p-4 text-center">
                              <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto"></div>
                            </div>
                          )}
                          
                          {!loadingSuppliers && suppliers.length === 0 && (
                            <div className="p-6 text-center text-muted-foreground text-xs italic">
                              No suppliers match "{supplierSearch}"
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80">Invoice No (Optional)</Label>
                    <Input
                      value={invoiceNo}
                      onChange={(e) => setInvoiceNo(e.target.value)}
                      placeholder="Enter Invoice Number"
                      className="h-10 rounded-xl bg-background/50 border-border"
                    />
                  </div>

                  <div className="flex gap-3 pt-2">
                    <Button
                      variant="outline"
                      className="flex-1 h-10 rounded-xl border-border hover:bg-muted/40 font-semibold"
                      onClick={() => setShowSupplierSelect(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      className="flex-1 btn-primary h-10 rounded-xl font-bold"
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
        <Card className="glass bg-card/25 backdrop-blur-md border border-border/50 shadow-md rounded-2xl overflow-hidden">
          <CardContent className="p-5">
            <h4 className="font-semibold mb-3 text-sm text-primary flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 animate-pulse" />
              Tips for Best Results
            </h4>
            <ul className="text-xs text-muted-foreground space-y-2 leading-relaxed">
              <li className="flex items-start gap-2">
                <span className="text-primary font-bold">•</span>
                <span>Ensure good lighting on the product label.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary font-bold">•</span>
                <span>Capture the full product name and details.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary font-bold">•</span>
                <span>Include batch number and expiry date in frame.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary font-bold">•</span>
                <span>Quantity must be entered manually.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary font-bold">•</span>
                <span>Review and edit detected fields as needed.</span>
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
