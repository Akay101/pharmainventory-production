import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { API, useAuth } from "../App";
import {
  Card,
  CardContent,
} from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import {
  Camera,
  Upload,
  X,
  Plus,
  Check,
  ArrowLeft,
  ShoppingCart,
  Trash2,
  Sparkles,
  ChevronDown,
  Search,
  CheckCircle2,
  Info,
  Layers,
  Zap,
  PlusCircle,
  Link2,
} from "lucide-react";
import { toast } from "sonner";
import Loader, { AiLoader } from "../components/ui/loader";

// Custom Premium Dropdown Component for Inventory Product Linking
function ProductLinkDropdown({ item, handleUpdateItem }) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const suggestions = item.inventory_suggestions || [];

  const filteredSuggestions = search.trim()
    ? suggestions.filter((s) =>
        s.product_name.toLowerCase().includes(search.toLowerCase().trim())
      )
    : suggestions;

  const isSelectedNew = !item.selected_product_id || item.selected_product_id === "NEW";
  const selectedSuggestion = suggestions.find((s) => s.product_id === item.selected_product_id);

  return (
    <div className="relative w-full" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full h-10 px-3.5 rounded-xl border flex items-center justify-between gap-2.5 text-xs font-bold transition-all cursor-pointer ${
          isOpen
            ? "border-orange-500 bg-background ring-2 ring-orange-500/15"
            : isSelectedNew
            ? "border-border bg-background hover:border-orange-500/50 text-foreground"
            : "border-emerald-500/40 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10"
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          {isSelectedNew ? (
            <PlusCircle className="w-4 h-4 text-orange-500 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
          )}
          <span className="truncate">
            {isSelectedNew
              ? `Create New Catalog Entry ("${item.product_name}")`
              : `This item will be added to: ${selectedSuggestion?.product_name || item.selected_product_name || item.product_name}`}
          </span>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform duration-200 ${
            isOpen ? "rotate-180 text-orange-500" : ""
          }`}
        />
      </button>

      {/* Animated Dropdown Menu with Fixed Height & Scrollable Container */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-1.5 z-50 w-full bg-card border border-border rounded-xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 flex flex-col">
          {/* Quick Search Header */}
          <div className="p-2 border-b border-border bg-muted/30">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                autoFocus
                placeholder="Search catalog suggestions..."
                className="pl-8 h-8 text-xs bg-background border-border rounded-lg"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          </div>

          {/* Fixed Height Scrollable Items List */}
          <div className="max-h-56 sm:max-h-64 overflow-y-auto p-1.5 space-y-1 custom-scrollbar">
            {/* Option: Create New Product */}
            <div
              className={`flex items-start gap-2.5 p-2.5 rounded-lg cursor-pointer transition-colors ${
                isSelectedNew
                  ? "bg-orange-500/10 text-orange-500 font-bold border border-orange-500/20"
                  : "hover:bg-muted/60 text-foreground"
              }`}
              onClick={() => {
                handleUpdateItem(item.id, "selected_product_id", "NEW");
                setIsOpen(false);
              }}
            >
              <PlusCircle className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-bold leading-tight truncate">
                  Create New Catalog Entry
                </span>
                <span className="text-[10px] text-muted-foreground font-normal leading-tight truncate">
                  Register as a new medicine product catalog item ("{item.product_name}")
                </span>
              </div>
              {isSelectedNew && <Check className="w-4 h-4 text-orange-500 ml-auto shrink-0" />}
            </div>

            {/* Option List: Inventory Suggestions */}
            {filteredSuggestions.length > 0 && (
              <div className="pt-1 space-y-1 border-t border-border/50">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground px-2 block">
                  Existing Inventory Catalog Suggestions ({filteredSuggestions.length})
                </span>
                {filteredSuggestions.map((sug) => {
                  const isThisSelected = item.selected_product_id === sug.product_id;
                  const isBatchMatch = sug.is_batch_match || item.match_badge?.type === "batch_exact" && item.selected_product_id === sug.product_id;

                  return (
                    <div
                      key={sug.product_id}
                      className={`flex items-start gap-2.5 p-2.5 rounded-lg cursor-pointer transition-colors ${
                        isThisSelected
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold border border-emerald-500/20"
                          : isBatchMatch
                          ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold border border-amber-500/20"
                          : "hover:bg-muted/60 text-foreground"
                      }`}
                      onClick={() => {
                        handleUpdateItem(item.id, "selected_product_id", sug.product_id);
                        handleUpdateItem(item.id, "product_name", sug.product_name);
                        setIsOpen(false);
                      }}
                    >
                      {isBatchMatch ? (
                        <Zap className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                      ) : (
                        <Link2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                      )}
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs font-bold leading-tight truncate">
                          {isBatchMatch ? `Exact Batch Match: ${sug.product_name}` : `Add to existing: ${sug.product_name}`}
                        </span>
                        <span className="text-[10px] text-muted-foreground font-normal leading-tight">
                          {isBatchMatch
                            ? `Batch matches existing product "${sug.product_name}" in inventory`
                            : "This item will be added to this existing inventory product"}
                        </span>
                      </div>
                      {isThisSelected && <Check className="w-4 h-4 text-emerald-500 ml-auto shrink-0" />}
                    </div>
                  );
                })}
              </div>
            )}

            {filteredSuggestions.length === 0 && search && (
              <div className="p-4 text-center text-xs text-muted-foreground italic">
                No inventory catalog products match "{search}"
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ScannerPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const fileInputRef = useRef(null);
  const billInputRef = useRef(null);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scannedItems, setScannedItems] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [selectedSupplier, setSelectedSupplier] = useState("");
  const [showSupplierSelect, setShowSupplierSelect] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [invoiceNo, setInvoiceNo] = useState("");

  // Infinite Scroll & Search for Suppliers
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
    if (user) {
      fetchSuppliers();
    }
  }, [user]);

  const fetchSuppliers = async (page = 1, search = "", append = false) => {
    if (loadingSuppliers) return;
    setLoadingSuppliers(true);
    try {
      const response = await axios.get(
        `${API}/suppliers?page=${page}&limit=20&search=${search}`
      );
      const newSuppliers = response.data.suppliers || [];

      if (append) {
        setSuppliers((prev) => [...prev, ...newSuppliers]);
      } else {
        setSuppliers(newSuppliers);
      }

      setHasMoreSuppliers(newSuppliers.length === 20);
      setSupplierPage(page);
    } catch (error) {
      console.error("Failed to fetch suppliers", error);
    } finally {
      setLoadingSuppliers(false);
    }
  };

  // Debounced supplier search
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
    if (isSupplierDropdownOpen && suppliers.length > 0 && highlightedSupplierIndex < 0) {
      setHighlightedSupplierIndex(0);
    }
  }, [isSupplierDropdownOpen, suppliers]);

  const handleSupplierKeyDown = (e) => {
    if (!isSupplierDropdownOpen) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedSupplierIndex((prev) =>
          prev < suppliers.length - 1 ? prev + 1 : prev < 0 ? 0 : prev
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedSupplierIndex((prev) => (prev > 0 ? prev - 1 : 0));
        break;
      case "Enter":
        e.preventDefault();
        const idxToSelect = highlightedSupplierIndex >= 0 ? highlightedSupplierIndex : 0;
        if (idxToSelect >= 0 && idxToSelect < suppliers.length) {
          const supplier = suppliers[idxToSelect];
          setSelectedSupplier(supplier.id);
          setIsSupplierDropdownOpen(false);
        }
        break;
      case "Escape":
      case "Tab":
        setIsSupplierDropdownOpen(false);
        break;
    }
  };

  useEffect(() => {
    if (highlightedSupplierIndex >= 0 && supplierScrollRef.current) {
      const container = supplierScrollRef.current;
      const highlightedElement = container.querySelector(
        `[data-index="${highlightedSupplierIndex}"]`
      );
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

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        supplierDropdownRef.current &&
        !supplierDropdownRef.current.contains(event.target)
      ) {
        setIsSupplierDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const formatDateForInput = (dateStr) => {
    if (!dateStr) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;

    const mmYyMatch = dateStr.match(/^(\d{2})[/.-](\d{2}|\d{4})$/);
    if (mmYyMatch) {
      const month = mmYyMatch[1];
      let year = mmYyMatch[2];
      if (year.length === 2) year = "20" + year;

      const lastDay = new Date(year, month, 0).getDate();
      return `${year}-${month}-${String(lastDay).padStart(2, "0")}`;
    }

    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      return d.toISOString().split("T")[0];
    }
    return dateStr;
  };

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    setSelectedFiles((prev) => [...prev, ...files]);

    const newUrls = files.map((f) => URL.createObjectURL(f));
    setPreviewUrls((prev) => [...prev, ...newUrls]);

    if (fileInputRef.current) fileInputRef.current.value = "";
    if (billInputRef.current) billInputRef.current.value = "";
  };

  const handleRemoveFile = (index) => {
    URL.revokeObjectURL(previewUrls[index]);
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
    setPreviewUrls((prev) => prev.filter((_, i) => i !== index));
  };

  const pollingRef = useRef(null);

  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  const handleConfirmAndAnalyze = async () => {
    if (selectedFiles.length === 0) return;

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
    const MAX_POLLING_MS = 3 * 60 * 1000;

    pollingRef.current = setInterval(async () => {
      try {
        if (Date.now() - startTime > MAX_POLLING_MS) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
          toast.error("Scanning timed out. Please try again.");
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

  // Fetch smart matching inventory suggestions for items
  const fetchInventorySuggestionsForItems = async (items) => {
    try {
      const response = await axios.post(`${API}/purchases/match-suggestions`, {
        items: items.map((i) => ({
          product_name: i.product_name,
          batch_no: i.batch_no,
        })),
      });

      if (response.data.success && response.data.matches) {
        const matches = response.data.matches;
        setScannedItems((prev) =>
          prev.map((item, idx) => {
            const match = matches[idx] || matches.find((m) => m.scanned_name === item.product_name);
            if (!match) return item;

            let selected_product_id = "NEW";
            let selected_product_name = "";
            let match_badge = null;

            if (match.batch_match) {
              selected_product_id = match.batch_match.product_id;
              selected_product_name = match.batch_match.product_name;
              match_badge = {
                type: "batch_exact",
                label: `Batch "${match.batch_match.batch_no}" matches existing product "${match.batch_match.product_name}"`,
              };
            } else if (match.exact_name_match) {
              selected_product_id = match.exact_name_match.product_id;
              selected_product_name = match.exact_name_match.product_name;
              match_badge = {
                type: "name_exact",
                label: `Matched existing inventory product "${match.exact_name_match.product_name}"`,
              };
            } else if (match.suggestions && match.suggestions.length > 0) {
              const topSug = match.suggestions[0];
              if (topSug.is_high_confidence) {
                selected_product_id = topSug.product_id;
                selected_product_name = topSug.product_name;
              }
              match_badge = {
                type: "suggestion",
                label: topSug.is_high_confidence
                  ? `Matched existing product "${topSug.product_name}"`
                  : `${match.suggestions.length} suggestions available`,
              };
            }

            return {
              ...item,
              selected_product_id,
              selected_product_name,
              match_badge,
              inventory_suggestions: match.suggestions || [],
            };
          })
        );
      }
    } catch (err) {
      console.error("Failed to fetch match suggestions", err);
    }
  };

  const processScanResult = (data) => {
    let newItems = [];
    if (scanMode === "product") {
      const scanned = data.scanned_product;
      const newItem = {
        id: Date.now() + Math.random(),
        product_name: scanned.product_name || "",
        manufacturer: scanned.manufacturer || "",
        salt_composition: scanned.salt_composition || "",
        pack_type: scanned.pack_type || "Strip",
        batch_no: scanned.batch_no || "",
        hsn_no: scanned.hsn_no || "",
        expiry_date: formatDateForInput(scanned.expiry_date),
        pack_quantity: 1,
        units_per_pack: scanned.units_per_pack || 1,
        rate_pack: scanned.purchase_price || 0,
        mrp_pack: scanned.mrp_pack || scanned.mrp || 0,
        confidence: scanned.confidence || 85,
        selected_product_id: "NEW",
        inventory_suggestions: [],
      };
      newItems = [newItem];
      setScannedItems((prev) => [...prev, newItem]);
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

      newItems = (billData.items || []).map((item) => ({
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
        selected_product_id: "NEW",
        inventory_suggestions: [],
      }));

      setScannedItems((prev) => [...prev, ...newItems]);
      toast.success(`Bill scanned: ${newItems.length} items detected`);
    }

    if (newItems.length > 0) {
      fetchInventorySuggestionsForItems(newItems);
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

          const chosenProductId =
            item.selected_product_id && item.selected_product_id !== "NEW"
              ? item.selected_product_id
              : `scanned_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

          return {
            product_id: chosenProductId,
            selected_product_id: chosenProductId,
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
      navigate("/purchases");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to create purchase");
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background text-foreground pb-24 select-none" data-testid="scanner-page">
      {/* Sticky Mobile Header */}
      <header className="sticky top-0 z-50 bg-card/85 backdrop-blur-xl border-b border-border px-3 sm:px-6 py-3.5 shadow-sm">
        <div className="flex items-center justify-between max-w-xl mx-auto">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-xl hover:bg-muted text-foreground transition-all shrink-0 cursor-pointer"
            onClick={() => navigate("/purchases")}
          >
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </Button>

          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-500">
              <Sparkles className="w-4 h-4 animate-pulse" />
            </div>
            <h1 className="text-base font-black tracking-tight text-foreground">
              Smart AI Scanner
            </h1>
          </div>

          <Badge className="bg-orange-500/10 text-orange-500 border border-orange-500/20 rounded-full px-3 py-1 font-bold text-xs shrink-0">
            {scannedItems.length} {scannedItems.length === 1 ? "item" : "items"}
          </Badge>
        </div>
      </header>

      {/* Main Responsive Column */}
      <main className="w-full max-w-xl mx-auto px-3 sm:px-6 pt-4 space-y-4">
        {/* Upload Card / Dropzone */}
        <Card className="border border-border/80 bg-card shadow-xl rounded-2xl overflow-hidden">
          <CardContent className="p-4 sm:p-6 space-y-5">
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

            {/* Mode Toggle Capsule */}
            <div className="grid grid-cols-2 p-1 bg-muted/60 rounded-xl border border-border">
              <button
                type="button"
                className={`py-2 px-3 text-xs font-extrabold rounded-lg transition-all cursor-pointer ${
                  scanMode === "product"
                    ? "bg-card text-orange-500 shadow-sm"
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
                className={`py-2 px-3 text-xs font-extrabold rounded-lg transition-all cursor-pointer ${
                  scanMode === "bill"
                    ? "bg-card text-orange-500 shadow-sm"
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

            {/* Scanner Processing Screen / Dropzone */}
            {scanning ? (
              <div className="py-6 px-4 flex flex-col items-center justify-center space-y-5 bg-card/60 rounded-2xl border border-border/60">
                <AiLoader
                  size="lg"
                  text={
                    scanProgress < 25
                      ? "Initializing High-Res Scan..."
                      : scanProgress < 55
                      ? "Processing Images with AI..."
                      : scanProgress < 85
                      ? "Extracting Product Properties..."
                      : "Finalizing Detection..."
                  }
                />

                <div className="w-full max-w-xs space-y-2">
                  <div className="flex justify-between text-xs font-mono font-bold text-orange-500">
                    <span className="uppercase text-[10px] tracking-wider text-muted-foreground">
                      AI Scan Progress
                    </span>
                    <span>{scanProgress}%</span>
                  </div>
                  <div className="w-full bg-muted h-2.5 rounded-full overflow-hidden border border-border p-0.5 shadow-inner">
                    <div
                      className="bg-gradient-to-r from-orange-500 to-amber-500 h-full rounded-full transition-all duration-500 ease-out"
                      style={{ width: `${scanProgress}%` }}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div
                  onClick={() =>
                    scanMode === "product"
                      ? fileInputRef.current?.click()
                      : billInputRef.current?.click()
                  }
                  className="border-2 border-dashed border-border hover:border-orange-500/60 bg-muted/20 rounded-2xl p-6 sm:p-8 text-center cursor-pointer transition-all duration-300 hover:bg-orange-500/5 group"
                >
                  <div className="w-14 h-14 mx-auto rounded-2xl bg-orange-500/10 border border-orange-500/20 text-orange-500 flex items-center justify-center mb-3 shadow-xs group-hover:scale-110 transition-transform">
                    <Camera className="w-7 h-7" />
                  </div>

                  {scanMode === "product" ? (
                    <>
                      <h2 className="text-sm sm:text-base font-bold text-foreground mb-1 group-hover:text-orange-500 transition-colors">
                        Scan Product Images
                      </h2>
                      <p className="text-xs text-muted-foreground max-w-xs mx-auto leading-relaxed">
                        Tap or drag images of a <b>single medicine product</b> (front, back, composition) for instant AI detail extraction.
                      </p>
                    </>
                  ) : (
                    <>
                      <h2 className="text-sm sm:text-base font-bold text-foreground mb-1 group-hover:text-orange-500 transition-colors">
                        Scan Invoice / Purchase Bill
                      </h2>
                      <p className="text-xs text-muted-foreground max-w-xs mx-auto leading-relaxed">
                        Tap or drag images of all pages of a <b>supplier purchase invoice</b>.
                      </p>
                    </>
                  )}
                </div>

                {/* Staged Images Preview Gallery */}
                {previewUrls.length > 0 && (
                  <div className="space-y-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block">
                      Selected Images ({previewUrls.length})
                    </span>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5 bg-muted/30 p-3 rounded-2xl border border-border">
                      {previewUrls.map((url, i) => (
                        <div
                          key={i}
                          className="relative aspect-square rounded-xl overflow-hidden border border-border shadow-xs group"
                        >
                          <img
                            src={url}
                            alt={`preview-${i}`}
                            className="w-full h-full object-cover"
                          />
                          <button
                            type="button"
                            className="absolute top-1 right-1 p-1 bg-slate-900/80 hover:bg-rose-600 text-white rounded-lg transition-colors cursor-pointer"
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
                        className="aspect-square flex flex-col items-center justify-center border-2 border-dashed border-orange-500/40 text-orange-500 hover:bg-orange-500/10 transition-colors rounded-xl text-xs font-bold bg-orange-500/5 cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (scanMode === "product") {
                            fileInputRef.current?.click();
                          } else {
                            billInputRef.current?.click();
                          }
                        }}
                      >
                        <Plus className="w-5 h-5 mb-1" />
                        <span>Add</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Scan Action Button */}
                <div>
                  {selectedFiles.length === 0 ? (
                    <Button
                      className="w-full h-11 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-extrabold text-xs shadow-md transition-all cursor-pointer flex items-center justify-center gap-2"
                      onClick={() =>
                        scanMode === "product"
                          ? fileInputRef.current?.click()
                          : billInputRef.current?.click()
                      }
                    >
                      <Upload className="w-4 h-4" />
                      <span>Select Images to Scan</span>
                    </Button>
                  ) : (
                    <Button
                      className="w-full h-11 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-extrabold text-xs shadow-lg transition-all cursor-pointer flex items-center justify-center gap-2"
                      onClick={handleConfirmAndAnalyze}
                    >
                      <Sparkles className="w-4 h-4 animate-pulse" />
                      <span>Confirm & Extract Details ({selectedFiles.length})</span>
                    </Button>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Scanned Items Cards List */}
        {scannedItems.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <h3 className="font-extrabold text-xs text-foreground uppercase tracking-wider flex items-center gap-1.5">
                <span>Scanned Items</span>
                <span className="px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-500 text-[10px] font-mono border border-orange-500/20">
                  {scannedItems.length}
                </span>
              </h3>
              <span className="text-[10px] text-muted-foreground italic">
                * Review details & catalog matches below
              </span>
            </div>

            {scannedItems.map((item) => {
              const { totalUnits, rateUnit, mrpUnit, totalAmount } =
                calculateItemTotals(item);

              return (
                <Card
                  key={item.id}
                  className="border border-border bg-card shadow-md rounded-2xl overflow-hidden space-y-3.5 p-4 sm:p-5"
                >
                  {/* Card Header Info */}
                  <div className="flex items-center justify-between gap-2 border-b border-border/50 pb-3">
                    <div className="flex items-center gap-2">
                      {item.confidence >= 70 ? (
                        <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-[10px] font-bold rounded-lg px-2 py-0.5">
                          {item.confidence}% Match
                        </Badge>
                      ) : (
                        <Badge className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 text-[10px] font-bold rounded-lg px-2 py-0.5">
                          Review Needed
                        </Badge>
                      )}
                      <span className="text-[11px] font-mono font-bold text-foreground">
                        Total: {totalUnits} u • <span className="text-orange-500">₹{totalAmount.toFixed(2)}</span>
                      </span>
                    </div>

                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-rose-500 hover:bg-rose-500/10 rounded-xl transition-colors shrink-0 cursor-pointer"
                      onClick={() => handleRemoveItem(item.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>

                  {/* Smart Inventory Catalog Matching Component */}
                  <div className="p-3.5 bg-gradient-to-r from-orange-500/5 via-amber-500/5 to-transparent rounded-xl border border-orange-500/20 space-y-2.5">
                    <div className="flex items-center justify-between flex-wrap gap-1.5">
                      <div className="flex items-center gap-1.5 text-orange-500 font-extrabold text-[11px] uppercase tracking-wider">
                        <Layers className="w-4 h-4" />
                        <span>Inventory Catalog Matching</span>
                      </div>

                      {item.match_badge && (
                        <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 px-2.5 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1">
                          {item.match_badge.type === "batch_exact" ? (
                            <Zap className="w-3 h-3 text-amber-500 shrink-0" />
                          ) : (
                            <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                          )}
                          <span>{item.match_badge.label}</span>
                        </Badge>
                      )}
                    </div>

                    {/* Custom Premium Dropdown Component */}
                    <ProductLinkDropdown item={item} handleUpdateItem={handleUpdateItem} />

                    {(!item.selected_product_id || item.selected_product_id === "NEW") && (
                      <p className="text-[11px] text-muted-foreground font-medium flex items-center gap-1.5 pt-0.5 leading-relaxed">
                        <Info className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                        <span>
                          {item.inventory_suggestions && item.inventory_suggestions.length > 0
                            ? `"${item.product_name}" didn't match closely to any inventory products. Here are suggestions that might help above, or a new catalog entry will be created.`
                            : `No matching inventory products found for "${item.product_name}". A new catalog entry will be created.`}
                        </span>
                      </p>
                    )}
                  </div>

                  {/* Form Inputs Grid */}
                  <div className="space-y-3">
                    {/* Product Name */}
                    <div className="space-y-1">
                      <Label className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">
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
                        className="font-bold text-xs h-9 rounded-xl bg-background border-border text-foreground focus:border-orange-500"
                        placeholder="Product Name"
                      />
                    </div>

                    {/* Manufacturer & Salt Composition */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
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
                          className="h-8 text-xs rounded-xl bg-background border-border text-foreground"
                          placeholder="e.g. Cipla"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          Salt / Composition
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
                          className="h-8 text-xs rounded-xl bg-background border-border text-foreground"
                          placeholder="Salt Composition"
                        />
                      </div>
                    </div>

                    {/* Pack Type, Batch, HSN */}
                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-1">
                        <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
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
                            className="w-full h-8 rounded-xl border border-border bg-background px-2 text-xs font-bold text-foreground focus:border-orange-500 appearance-none cursor-pointer pr-6"
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
                          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          Batch No
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
                          className="h-8 text-xs rounded-xl bg-background border-border text-foreground font-mono"
                          placeholder="Batch"
                        />
                      </div>

                      <div className="space-y-1">
                        <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          HSN Code
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
                          className="h-8 text-xs rounded-xl bg-background border-border text-foreground font-mono"
                          placeholder="HSN"
                        />
                      </div>
                    </div>

                    {/* Expiry Date & Units/Pack */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
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
                          className="h-8 text-xs rounded-xl bg-background border-border text-foreground"
                        />
                      </div>

                      <div className="space-y-1">
                        <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          Units / Pack
                        </Label>
                        <Input
                          type="number"
                          value={item.units_per_pack ?? ""}
                          onChange={(e) =>
                            handleUpdateItem(
                              item.id,
                              "units_per_pack",
                              e.target.value
                            )
                          }
                          className="h-8 text-xs rounded-xl bg-background border-border text-foreground"
                          min="1"
                        />
                      </div>
                    </div>

                    {/* Qty, Rate, MRP */}
                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-1">
                        <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          Packs Qty *
                        </Label>
                        <Input
                          type="number"
                          value={item.pack_quantity ?? ""}
                          onChange={(e) =>
                            handleUpdateItem(
                              item.id,
                              "pack_quantity",
                              e.target.value
                            )
                          }
                          className="h-8 text-xs rounded-xl bg-background border-border text-foreground font-bold"
                          min="1"
                        />
                      </div>

                      <div className="space-y-1">
                        <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          Rate (Pack)
                        </Label>
                        <div className="relative">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-mono">₹</span>
                          <Input
                            type="number"
                            value={item.rate_pack ?? ""}
                            onChange={(e) =>
                              handleUpdateItem(
                                item.id,
                                "rate_pack",
                                e.target.value
                              )
                            }
                            className="h-8 pl-5 text-xs rounded-xl bg-background border-border text-foreground font-mono"
                            step="0.01"
                            placeholder="0.00"
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          MRP (Pack)
                        </Label>
                        <div className="relative">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-mono">₹</span>
                          <Input
                            type="number"
                            value={item.mrp_pack ?? ""}
                            onChange={(e) =>
                              handleUpdateItem(
                                item.id,
                                "mrp_pack",
                                e.target.value
                              )
                            }
                            className="h-8 pl-5 text-xs rounded-xl bg-background border-border text-foreground font-mono"
                            step="0.01"
                            placeholder="0.00"
                          />
                        </div>
                      </div>
                    </div>

                    {(rateUnit > 0 || mrpUnit > 0) && (
                      <div className="pt-2 border-t border-border/40 flex justify-between text-[11px] font-mono text-muted-foreground">
                        <span>Rate/Unit: <b className="text-orange-500">₹{rateUnit.toFixed(2)}</b></span>
                        <span>MRP/Unit: <b className="text-foreground">₹{mrpUnit.toFixed(2)}</b></span>
                      </div>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {/* Sticky Mobile Supplier Selector & Purchase Confirmation Bar */}
        {scannedItems.length > 0 && (
          <Card className="sticky bottom-4 z-40 bg-card/95 backdrop-blur-xl border border-border shadow-2xl rounded-2xl overflow-visible">
            <CardContent className="p-3.5 space-y-3">
              {!showSupplierSelect ? (
                <Button
                  className="w-full h-11 bg-orange-500 hover:bg-orange-600 text-white font-extrabold text-xs rounded-xl shadow-md transition-all cursor-pointer flex items-center justify-center gap-2"
                  onClick={() => setShowSupplierSelect(true)}
                  data-testid="add-purchase-btn"
                >
                  <ShoppingCart className="w-4 h-4" />
                  <span>Create Purchase Invoice ({scannedItems.length} items)</span>
                </Button>
              ) : (
                <div className="space-y-3">
                  <div className="relative" ref={supplierDropdownRef}>
                    <Label className="mb-1 block text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">
                      Select Supplier *
                    </Label>
                    <div
                      className={`w-full h-10 rounded-xl border ${
                        isSupplierDropdownOpen
                          ? "border-orange-500 ring-2 ring-orange-500/20"
                          : "border-border"
                      } bg-background px-3 flex items-center justify-between cursor-pointer transition-all`}
                      onClick={() => {
                        setIsSupplierDropdownOpen(!isSupplierDropdownOpen);
                        if (!isSupplierDropdownOpen && suppliers.length === 0) {
                          fetchSuppliers(1, supplierSearch, false);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (
                          e.key === "Enter" ||
                          e.key === "ArrowDown" ||
                          e.key === "ArrowUp"
                        ) {
                          setIsSupplierDropdownOpen(true);
                        }
                      }}
                      tabIndex={0}
                    >
                      <span
                        className={`text-xs ${
                          !selectedSupplier
                            ? "text-muted-foreground"
                            : "font-bold text-foreground"
                        }`}
                      >
                        {selectedSupplier
                          ? suppliers.find((s) => s.id === selectedSupplier)
                              ?.name || "Select Supplier"
                          : "Choose a supplier..."}
                      </span>
                      <ChevronDown
                        className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${
                          isSupplierDropdownOpen ? "rotate-180" : ""
                        }`}
                      />
                    </div>

                    {isSupplierDropdownOpen && (
                      <div className="absolute bottom-full mb-2 left-0 z-[100] w-full bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
                        <div className="p-2 border-b border-border">
                          <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                            <Input
                              autoFocus
                              placeholder="Search suppliers..."
                              className="pl-8 h-8 text-xs bg-muted/50 border-border rounded-lg"
                              value={supplierSearch}
                              onChange={(e) => setSupplierSearch(e.target.value)}
                              onKeyDown={handleSupplierKeyDown}
                              onClick={(e) => e.stopPropagation()}
                            />
                          </div>
                        </div>

                        <div
                          ref={supplierScrollRef}
                          className="max-h-[180px] overflow-y-auto p-1 custom-scrollbar"
                          onScroll={(e) => {
                            const { scrollTop, scrollHeight, clientHeight } =
                              e.currentTarget;
                            if (
                              scrollHeight - scrollTop <= clientHeight + 50 &&
                              hasMoreSuppliers &&
                              !loadingSuppliers
                            ) {
                              fetchSuppliers(
                                supplierPage + 1,
                                supplierSearch,
                                true
                              );
                            }
                          }}
                        >
                          {suppliers.map((supplier, idx) => (
                            <div
                              key={supplier.id}
                              data-index={idx}
                              className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${
                                highlightedSupplierIndex === idx
                                  ? "bg-orange-500/20 text-orange-500 font-bold"
                                  : selectedSupplier === supplier.id
                                  ? "bg-orange-500/10 text-orange-500 font-bold"
                                  : "hover:bg-muted text-foreground"
                              }`}
                              onClick={() => {
                                setSelectedSupplier(supplier.id);
                                setIsSupplierDropdownOpen(false);
                              }}
                              onMouseEnter={() =>
                                setHighlightedSupplierIndex(idx)
                              }
                            >
                              <div className="flex flex-col">
                                <span className="text-xs font-bold">
                                  {supplier.name}
                                </span>
                                {supplier.phone && (
                                  <span className="text-[10px] text-muted-foreground font-mono">
                                    {supplier.phone}
                                  </span>
                                )}
                              </div>
                              {selectedSupplier === supplier.id && (
                                <Check className="w-4 h-4 text-orange-500" />
                              )}
                            </div>
                          ))}

                          {loadingSuppliers && (
                            <div className="p-3 text-center">
                              <Loader size="xs" variant="inline" text="Loading..." />
                            </div>
                          )}

                          {!loadingSuppliers && suppliers.length === 0 && (
                            <div className="p-4 text-center text-muted-foreground text-xs italic">
                              No suppliers match "{supplierSearch}"
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">
                      Invoice No (Optional)
                    </Label>
                    <Input
                      value={invoiceNo}
                      onChange={(e) => setInvoiceNo(e.target.value)}
                      placeholder="e.g. INV-2026-001"
                      className="h-9 text-xs rounded-xl bg-background border-border text-foreground font-mono"
                    />
                  </div>

                  <div className="flex gap-2 pt-1">
                    <Button
                      variant="outline"
                      className="flex-1 h-9 rounded-xl border-border hover:bg-muted font-bold text-xs cursor-pointer"
                      onClick={() => setShowSupplierSelect(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      className="flex-1 h-9 bg-orange-500 hover:bg-orange-600 text-white font-extrabold text-xs rounded-xl shadow-md cursor-pointer flex items-center justify-center gap-1.5"
                      onClick={handleCreatePurchase}
                      disabled={submitting || !selectedSupplier}
                    >
                      {submitting ? (
                        <Loader variant="button" text="Saving..." />
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Confirm Purchase</span>
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
