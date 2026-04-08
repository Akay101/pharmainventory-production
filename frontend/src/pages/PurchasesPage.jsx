import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
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
import {
  Search,
  Plus,
  Trash2,
  Loader2,
  Upload,
  FileSpreadsheet,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  Save,
  X,
  Edit2,
  Check,
  Package,
  Keyboard,
  RotateCcw,
  ArrowRight,
  FileText,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "./utils";
import CustomTooltip from "@/components/ui/CustomTooltip";
import { getOS } from "../hooks/useKeyboard";

const PACK_TYPES = ["Strip", "Bottle", "Tube", "Packet", "Box", "Unit"];
const LOCAL_STORAGE_KEY = "pharmalogy_purchase_draft";

export default function PurchasesPage() {
  // Data state
  const [purchases, setPurchases] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [medicineSuggestions, setMedicineSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // New purchase state - inline table approach
  const [showNewPurchase, setShowNewPurchase] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [purchaseItems, setPurchaseItems] = useState([]);
  const [newItemRow, setNewItemRow] = useState(null);
  const [searchMedicine, setSearchMedicine] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [aiAutofillEnabled, setAiAutofillEnabled] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);

  // Infinite scroll suggestion state
  const [suggestionPage, setSuggestionPage] = useState(1);
  const [hasMoreSuggestions, setHasMoreSuggestions] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  // Edit existing purchase
  const [editingPurchase, setEditingPurchase] = useState(null);

  // Expanded view
  const [expandedPurchase, setExpandedPurchase] = useState(null);

  // Your existing state and refs are correct
  // Replace your current dropdownPosition state and updateDropdownPosition with this:
  // Track which item's dropdown is active
  const [activeItemId, setActiveItemId] = useState(null);
  const [dropdownPosition, setDropdownPosition] = useState({
    top: 0,
    left: 0,
    width: 0,
  });

  const setInputRef = (el, itemId) => {
    if (el) {
      inputRefs.current[itemId] = el;
    }
  };

  const inputRefs = useRef({});



  const updateDropdownPosition = (itemId) => {
    const inputElement = inputRefs.current[itemId];
    if (!inputElement) return;

    const rect = inputElement.getBoundingClientRect();
    const dropdownWidth = Math.max(rect.width, 480);

    setDropdownPosition({
      top: rect.bottom + 4,
      left: rect.left,
      width: dropdownWidth,
    });
  };

  // Bulletproof positioning sync
  useEffect(() => {
    if (!activeItemId || !showSuggestions) return;
    
    let rafId;
    const updatePosition = () => {
      updateDropdownPosition(activeItemId);
      rafId = requestAnimationFrame(updatePosition);
    };
    
    rafId = requestAnimationFrame(updatePosition);
    
    return () => cancelAnimationFrame(rafId);
  }, [activeItemId, showSuggestions]);
  // Delete dialog
  const [deleteDialog, setDeleteDialog] = useState({
    open: false,
    purchase: null,
  });

  // Keyboard shortcuts dialog
  const [showShortcuts, setShowShortcuts] = useState(false);

  // Restore draft dialog
  const [showRestoreDialog, setShowRestoreDialog] = useState(false);
  const [draftData, setDraftData] = useState(null);

  //show salt dialog
  const [saltDialog, setSaltDialog] = useState({
    open: false,
    itemId: null,
    value: "",
  });

  // Refs for keyboard navigation
  const productInputRef = useRef(null);

  // State for dropdown keyboard navigation
  const [highlightedSuggestionIndex, setHighlightedSuggestionIndex] =
    useState(-1);

  // Price history comparison state
  const [priceAlerts, setPriceAlerts] = useState({}); // { itemId: { productName, currentPrice, cheaperOptions, ... } }
  const [priceHistoryDialog, setPriceHistoryDialog] = useState({
    open: false,
    itemId: null,
    data: null,
  });

  // CSV Import State
  const [csvDialog, setCsvDialog] = useState(false);
  const [csvFile, setCsvFile] = useState(null);
  const [csvColumns, setCsvColumns] = useState([]);
  const [csvSampleData, setCsvSampleData] = useState([]);
  const [csvMapping, setCsvMapping] = useState({
    product_name_col: "",
    batch_no_col: "",
    expiry_date_col: "",
    quantity_col: "",
    purchase_price_col: "",
    mrp_col: "",
    hsn_col: "",
  });

  // Pagination and Filter State
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    total_pages: 1,
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [filterSupplier, setFilterSupplier] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [sortBy, setSortBy] = useState("purchase_date");
  const [sortOrder, setSortOrder] = useState("desc");

  const [editingPurchaseId, setEditingPurchaseId] = useState(null);

  // Empty item template with enhanced fields
  const emptyItem = {
    id: "",
    product_id: "",
    product_name: "",
    manufacturer: "",
    salt_composition: "",
    pack_type: "Strip",
    batch_no: "",
    hsn_no: "",
    expiry_date: "",
    quantity: "1", // Number of packs (renamed from pack_quantity)
    units: "1", // Units per pack (renamed from units_per_pack)
    rate_pack: "", // Rate per pack (purchase price per pack)
    total_amount: "", // Total amount (user can enter this OR rate_pack)
    mrp_pack: "", // MRP per pack (user enters this, MRP/Unit is auto-calculated)
    _is_auto_filled_rate: true, // Prevent price history ping until manually edited
  };

  // ============ AUTO-SAVE TO LOCALSTORAGE ============

  // Check for saved draft on mount
  useEffect(() => {
    const savedDraft = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (savedDraft) {
      try {
        const draft = JSON.parse(savedDraft);
        if (draft.items?.length > 0 || draft.supplier || draft.invoice) {
          setDraftData(draft);
          setShowRestoreDialog(true);
        }
      } catch (e) {
        localStorage.removeItem(LOCAL_STORAGE_KEY);
      }
    }
  }, []);

  // Auto-save draft when data changes
  useEffect(() => {
    if (
      showNewPurchase &&
      (purchaseItems.length > 0 || selectedSupplier || invoiceNo)
    ) {
      const draft = {
        supplier: selectedSupplier,
        invoice: invoiceNo,
        items: purchaseItems,
        savedAt: new Date().toISOString(),
      };
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(draft));
    }
  }, [showNewPurchase, purchaseItems, selectedSupplier, invoiceNo]);

  // Clear draft on successful save
  const clearDraft = () => {
    localStorage.removeItem(LOCAL_STORAGE_KEY);
  };

  const handleRestoreDraft = () => {
    if (draftData) {
      setShowNewPurchase(true);
      setSelectedSupplier(draftData.supplier || "");
      setInvoiceNo(draftData.invoice || "");
      setPurchaseItems(draftData.items || []);
      toast.success("Draft restored successfully");
    }
    setShowRestoreDialog(false);
    setDraftData(null);
  };

  const handleDiscardDraft = () => {
    clearDraft();
    setShowRestoreDialog(false);
    setDraftData(null);
  };

  // Refs for keyboard shortcuts to avoid stale closures
  const handlersRef = useRef({});

  // Keep refs updated
  useEffect(() => {
    handlersRef.current = {
      handleStartNewPurchase, handleSubmitPurchase, handleSaveEditPurchase,
      handleCancelAddItem, handleCancelNewPurchase,
      handleAddNewRow, setShowShortcuts, showNewPurchase, newItemRow, editingPurchaseId
    };
  });

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName);
      if (isInput && !e.ctrlKey && !e.metaKey && !e.altKey && e.key !== 'Escape' && e.key !== 'Enter') return;

      const {
        handleStartNewPurchase, handleSubmitPurchase, handleSaveEditPurchase,
        handleCancelAddItem, handleCancelNewPurchase, 
        handleAddNewRow, setShowShortcuts, showNewPurchase, newItemRow, editingPurchaseId
      } = handlersRef.current;

      if (!handleStartNewPurchase) return;

      // Alt+N - New purchase
      if (e.altKey && (e.key === "n" || e.code === "KeyN")) {
        e.preventDefault();
        handleStartNewPurchase();
      }
      // Alt+S or Cmd+Enter - Save purchase
      if ((((e.altKey && (e.key === "s" || e.code === "KeyS")) || ((e.ctrlKey || e.metaKey) && (e.key === "Enter" || e.code === "Enter"))))) {
        if (showNewPurchase) {
          e.preventDefault();
          handleSubmitPurchase();
        } else if (editingPurchaseId) {
          e.preventDefault();
          handleSaveEditPurchase();
        }
      }
      // Escape - Cancel
      if (e.key === "Escape" || e.code === "Escape") {
        if (newItemRow) {
          handleCancelAddItem();
        } else if (showNewPurchase) {
          handleCancelNewPurchase();
        }
      }
      // Alt+A - Add item row
      if (e.altKey && (e.key === "a" || e.code === "KeyA")) {
        if (showNewPurchase) {
          e.preventDefault();
          handleAddNewRow();
        }
      }
      // Alt+? - Show shortcuts
      if (e.altKey && (e.key === "/" || e.code === "Slash")) {
        e.preventDefault();
        setShowShortcuts(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const fetchPurchases = useCallback(
    async (page = 1) => {
      try {
        const params = new URLSearchParams();
        params.append("page", page);
        params.append("limit", pagination.limit);
        params.append("sort_by", sortBy);
        params.append("sort_order", sortOrder);
        if (searchQuery) params.append("search", searchQuery);
        if (filterSupplier && filterSupplier !== "all")
          params.append("supplier_id", filterSupplier);
        if (startDate) params.append("start_date", startDate);
        if (endDate) params.append("end_date", endDate);

        const response = await axios.get(
          `${API}/purchases?${params.toString()}`
        );
        setPurchases(response.data.purchases);
        setPagination(response.data.pagination);
      } catch (error) {
        toast.error("Failed to load purchases");
      }
    },
    [
      searchQuery,
      filterSupplier,
      startDate,
      endDate,
      sortBy,
      sortOrder,
      pagination.limit,
    ]
  );

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    const debounce = setTimeout(() => {
      fetchPurchases(1);
    }, 300);
    return () => clearTimeout(debounce);
  }, [searchQuery, filterSupplier, startDate, endDate, sortBy, sortOrder]);

  // Search medicines for suggestions with better ranking
  useEffect(() => {
    const searchMedicines = async () => {
      if (searchMedicine.length >= 2) {
        setLoadingSuggestions(true);
        try {
          const response = await axios.get(
            `${API}/medicines/search?q=${encodeURIComponent(searchMedicine)}&limit=20&fuzzy=true&page=1`
          );

          setMedicineSuggestions(response.data.medicines || []);
          setHasMoreSuggestions(response.data.meta?.has_more || false);
          setSuggestionPage(1);
          setShowSuggestions(true);
          setHighlightedSuggestionIndex(-1);
        } catch (error) {
          console.error("Medicine search error:", error);
        } finally {
          setLoadingSuggestions(false);
        }
      } else {
        setMedicineSuggestions([]);
        setShowSuggestions(false);
        setHighlightedSuggestionIndex(-1);
        setHasMoreSuggestions(false);
        setSuggestionPage(1);
      }
    };

    const debounce = setTimeout(searchMedicines, 300);
    return () => clearTimeout(debounce);
  }, [searchMedicine]);

  const loadMoreSuggestions = async () => {
    if (loadingSuggestions || !hasMoreSuggestions) return;

    setLoadingSuggestions(true);
    try {
      const nextPage = suggestionPage + 1;
      const response = await axios.get(
        `${API}/medicines/search?q=${encodeURIComponent(searchMedicine)}&limit=20&fuzzy=true&page=${nextPage}`
      );

      setMedicineSuggestions((prev) => [
        ...prev,
        ...(response.data.medicines || []),
      ]);
      setHasMoreSuggestions(response.data.meta?.has_more || false);
      setSuggestionPage(nextPage);
    } catch (error) {
      console.error("Load more medicines error:", error);
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const handleScrollSuggestions = (e) => {
    const bottom =
      e.target.scrollHeight - e.target.scrollTop - e.target.clientHeight < 50;
    if (bottom) {
      loadMoreSuggestions();
    }
  };

  const fetchData = async () => {
    try {
      const [suppliersRes] = await Promise.all([axios.get(`${API}/suppliers`)]);
      setSuppliers(suppliersRes.data.suppliers);
      await fetchPurchases(1);
    } catch (error) {
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  //Purchase pdf
  const handleGeneratePurchasePdf = async (purchaseId) => {
    try {
      const res = await axios.post(`${API}/purchases/${purchaseId}/pdf`);

      if (res.data?.pdf_url) {
        window.open(res.data.pdf_url, "_blank");
        toast.success("PDF generated");
      } else {
        toast.error("PDF generation failed");
      }
    } catch (error) {
      toast.error("Failed to generate PDF");
    }
  };

  // ============ NEW PURCHASE - INLINE TABLE ============

  const handleStartNewPurchase = () => {
    setShowNewPurchase(true);
    // Start with one default empty row
    const defaultRow = { ...emptyItem, id: `temp-${Date.now()}` };
    setPurchaseItems([defaultRow]);
    setSelectedSupplier("");
    setInvoiceNo("");
    setPurchaseDate(new Date().toISOString().slice(0, 10));
    setNewItemRow(null);
  };

  const handleCancelNewPurchase = () => {
    setShowNewPurchase(false);
    setEditingPurchaseId(null);
    setPurchaseItems([]);
    setSelectedSupplier("");
    setInvoiceNo("");
    setPurchaseDate(new Date().toISOString().slice(0, 10));
    setNewItemRow(null);
    setShowSuggestions(false);
    clearDraft();
  };

  const handleStartAddItem = () => {
    setNewItemRow({ ...emptyItem, id: `temp-${Date.now()}` });
    setSearchMedicine("");
    setShowSuggestions(false);
    // Focus product input after render
    setTimeout(() => productInputRef.current?.focus(), 100);
  };

  const handleCancelAddItem = () => {
    setNewItemRow(null);
    setSearchMedicine("");
    setMedicineSuggestions([]);
    setShowSuggestions(false);
  };

  // Add new empty row to items
  const handleAddNewRow = () => {
    const newRow = { ...emptyItem, id: `temp-${Date.now()}` };
    setPurchaseItems((prev) => [...prev, newRow]);
    // Focus the last row's product input after render
    setTimeout(() => productInputRef.current?.focus(), 100);
  };

  const handleNewItemChange = (field, value) => {
    setNewItemRow((prev) => {
      const updated = { ...prev, [field]: value };

      // Bidirectional calculation: Rate per Pack ↔ Total Amount
      const qty = parseInt(updated.quantity) || 1;

      if (field === "rate_pack" && value !== "") {
        // User entered rate_pack, calculate total_amount
        const ratePack = parseFloat(value) || 0;
        updated.total_amount = (qty * ratePack).toFixed(2);
      } else if (field === "total_amount" && value !== "") {
        // User entered total_amount, calculate rate_pack
        const totalAmt = parseFloat(value) || 0;
        updated.rate_pack = qty > 0 ? (totalAmt / qty).toFixed(2) : "0";
      } else if (field === "quantity" && value !== "") {
        // Quantity changed, recalculate based on which field has value
        if (updated.rate_pack && updated.rate_pack !== "") {
          const ratePack = parseFloat(updated.rate_pack) || 0;
          updated.total_amount = (qty * ratePack).toFixed(2);
        } else if (updated.total_amount && updated.total_amount !== "") {
          const totalAmt = parseFloat(updated.total_amount) || 0;
          updated.rate_pack = qty > 0 ? (totalAmt / qty).toFixed(2) : "0";
        }
      }

      return updated;
    });
    if (field === "product_name") {
      setSearchMedicine(value);
    }
  };

  const handleSelectMedicine = (medicine) => {
    const pricePerUnit = parseFloat(medicine["price(₹)"]) || 0;
    // Extract pack size info if available
    const packSizeMatch = medicine.pack_size?.match(/(\d+)/);
    const unitsPerPack = packSizeMatch ? parseInt(packSizeMatch[1]) : 1;

    // Calculate MRP per pack from MRP per unit
    const mrpPack = pricePerUnit * unitsPerPack;
    // Estimated purchase price per pack (70% of MRP)
    const ratePack = mrpPack * 0.7;

    setNewItemRow((prev) => ({
      ...prev,
      product_id: medicine.id || `med-${Date.now()}`,
      product_name: medicine.name,
      manufacturer: medicine.manufacturer || "",
      salt_composition: medicine.composition || "",
      units: String(unitsPerPack),
      rate_pack: ratePack.toFixed(2),
      mrp_pack: mrpPack.toFixed(2), // Now storing MRP per pack
    }));
    setSearchMedicine("");
    setMedicineSuggestions([]);
    setShowSuggestions(false);
  };

  const handleSaveNewItem = () => {
    // Only product_name, quantity, and rate_pack are mandatory
    if (!newItemRow.product_name) {
      toast.error("Please enter product name");
      return;
    }
    if (!newItemRow.quantity || !newItemRow.rate_pack) {
      toast.error("Please enter quantity and rate per pack");
      return;
    }

    const qty = parseInt(newItemRow.quantity) || 1;
    const units = parseInt(newItemRow.units) || 1;
    const ratePack = parseFloat(newItemRow.rate_pack) || 0;
    const mrpPack = parseFloat(newItemRow.mrp_pack) || 0;

    const totalUnits = qty * units;
    const rateUnit = units > 0 ? ratePack / units : ratePack;
    const mrpUnit = units > 0 ? mrpPack / units : mrpPack;
    const finalAmount = qty * ratePack;

    const item = {
      ...newItemRow,
      product_id: newItemRow.product_id || `temp-${Date.now()}`,
      // For API compatibility, map to expected field names
      pack_quantity: qty,
      units_per_pack: units,
      pack_price: ratePack,
      mrp_per_unit: mrpUnit,
      // Display fields
      quantity: qty,
      units: units,
      rate_pack: ratePack,
      rate_unit: rateUnit,
      mrp_unit: mrpUnit,
      mrp_pack: mrpPack,
      total_units: totalUnits,
      final_amount: finalAmount,
    };

    setPurchaseItems((prev) => [...prev, item]);
    setNewItemRow(null);
    setSearchMedicine("");
    setMedicineSuggestions([]);
    setShowSuggestions(false);
  };

  // Handle Tab key for default values
  const handleTabDefault = (e, field) => {
    if (e.key === "Tab" && !e.shiftKey) {
      const value = e.target.value;
      if (!value || value === "") {
        e.preventDefault();
        let defaultValue = "";
        switch (field) {
          case "quantity":
          case "units":
            defaultValue = "1";
            break;
          case "rate_pack":
          case "mrp_pack":
            defaultValue = "0";
            break;
          case "pack_type":
            defaultValue = "Strip";
            break;
          case "batch_no":
            defaultValue = `B${Date.now().toString().slice(-6)}`;
            break;
          default:
            // Move to next field without default
            return;
        }
        handleNewItemChange(field, defaultValue);
        // Move to next focusable element
        const form = e.target.form || e.target.closest("tr");
        const inputs = form?.querySelectorAll("input, select, button");
        const currentIndex = Array.from(inputs || []).indexOf(e.target);
        if (inputs && currentIndex >= 0 && currentIndex < inputs.length - 1) {
          setTimeout(() => inputs[currentIndex + 1]?.focus(), 0);
        }
      }
    }
  };

  // Handle keyboard events in item row
  const handleItemKeyDown = (e, field) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSaveNewItem();
    } else if (e.key === "Escape") {
      handleCancelAddItem();
    } else if (e.key === "Tab") {
      handleTabDefault(e, field);
    }
  };

  const handleRemoveItem = (itemId) => {
    setPurchaseItems((prev) => prev.filter((item) => item.id !== itemId));
  };

  const handleEditItem = (item) => {
    setPurchaseItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, _editing: true } : i))
    );
  };

  const handleSaveEditedItem = (itemId) => {
    setPurchaseItems((prev) =>
      prev.map((i) => {
        if (i.id === itemId) {
          const { _editing, ...rest } = i;
          const qty =
            parseInt(rest.quantity) || parseInt(rest.pack_quantity) || 1;
          const units =
            parseInt(rest.units) || parseInt(rest.units_per_pack) || 1;
          const ratePack =
            parseFloat(rest.rate_pack) || parseFloat(rest.pack_price) || 0;
          const mrpUnit =
            parseFloat(rest.mrp_unit) || parseFloat(rest.mrp_per_unit) || 0;

          return {
            ...rest,
            pack_quantity: qty,
            units_per_pack: units,
            pack_price: ratePack,
            mrp_per_unit: mrpUnit,
            quantity: qty,
            units: units,
            rate_pack: ratePack,
            rate_unit: units > 0 ? ratePack / units : ratePack,
            mrp_unit: mrpUnit,
            mrp_pack: mrpUnit * units,
            total_units: qty * units,
            final_amount: qty * ratePack,
          };
        }
        return i;
      })
    );
  };

  const handleCancelEditItem = (itemId) => {
    setPurchaseItems((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, _editing: false } : i))
    );
  };

  const handleItemFieldChange = (itemId, field, value) => {
    setPurchaseItems((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, [field]: value } : i))
    );

    // Update search for medicine suggestions
    if (field === "product_name") {
      setSearchMedicine(value);
    }
  };

  // Handle field change with bidirectional calculation for Rate/Total
  const handleItemFieldChangeWithCalc = (itemId, field, value) => {
    setPurchaseItems((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;

        const updated = { ...item, [field]: value };
        
        if (field === "rate_pack" || field === "total_amount") {
          updated._is_auto_filled_rate = false;
        }

        const qty =
          parseInt(updated.quantity) || parseInt(updated.pack_quantity) || 1;

        if (field === "rate_pack" && value !== "") {
          // User entered rate_pack, calculate total_amount
          const ratePack = parseFloat(value) || 0;
          updated.total_amount = (qty * ratePack).toFixed(2);
        } else if (field === "total_amount" && value !== "") {
          // User entered total_amount, calculate rate_pack
          const totalAmt = parseFloat(value) || 0;
          updated.rate_pack = qty > 0 ? (totalAmt / qty).toFixed(2) : "0";
        } else if (field === "quantity" && value !== "") {
          // Quantity changed, recalculate based on which field has value
          const newQty = parseInt(value) || 1;
          if (updated.rate_pack && updated.rate_pack !== "") {
            const ratePack = parseFloat(updated.rate_pack) || 0;
            updated.total_amount = (newQty * ratePack).toFixed(2);
          } else if (updated.total_amount && updated.total_amount !== "") {
            const totalAmt = parseFloat(updated.total_amount) || 0;
            updated.rate_pack =
              newQty > 0 ? (totalAmt / newQty).toFixed(2) : "0";
          }
        }

        return updated;
      })
    );

    // // Check price history when rate_pack is entered
    // if (field === "rate_pack" && value !== "") {
    //   const item = purchaseItems.find((i) => i.id === itemId);
    //   if (item?.product_name) {
    //     checkPriceHistory(itemId, item.product_name, parseFloat(value) || 0);
    //   }
    // }
  };
  // Optimize: Check price history silently (used onBlur and immediately on auto-fill)
  const checkPriceHistorySilent = async (itemId, productName, currentPriceParam) => {
    const currentPrice = parseFloat(currentPriceParam);
    if (!productName || !currentPrice || currentPrice <= 0) return;

    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API}/purchases/price-history`, {
        params: { product_name: productName, current_price: currentPrice },
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = response.data;
      if (data.is_higher_than_history && data.cheaper_options?.length > 0) {
        setPriceAlerts((prev) => ({
          ...prev,
          [itemId]: data,
        }));
      } else {
        // Clear alert if it's fine now
        setPriceAlerts((prev) => {
           const updated = { ...prev };
           delete updated[itemId];
           return updated;
        });
      }
    } catch (error) {
      console.error("Silent Check Price History Error:", error);
    }
  };

  // Check historical prices for a product
  const checkPriceHistory = async (itemId, productName, currentPrice) => {
    if (!productName || currentPrice <= 0) {
      toast.error("Invalid product or price");
      return;
    }

    try {
      const token = localStorage.getItem("token");

      const response = await axios.get(`${API}/purchases/price-history`, {
        params: { product_name: productName, current_price: currentPrice },
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = response.data;

      // CASE 1: Cheaper options exist
      if (data.is_higher_than_history && data.cheaper_options?.length > 0) {
        setPriceHistoryDialog({
          open: true,
          itemId,
          data: {
            type: "higher",
            searched_product_name: data.product_name,
            matched_product_name: data.matched_product_name, // if you added it
            currentPrice: data.current_price || 0,
            cheapestPrice: data.cheapest_historical_price || 0,
            priceDifference: data.price_difference || 0,
            cheaperOptions: data.cheaper_options || [],
          },
        });

        return;
      }

      // CASE 2: Current is cheapest
      if (
        data.cheapest_historical_price !== null &&
        currentPrice <= data.cheapest_historical_price
      ) {
        setPriceHistoryDialog({
          open: true,
          itemId,
          data: {
            type: "cheapest",
            ...data,
          },
        });
        return;
      }

      // CASE 3: No history
      setPriceHistoryDialog({
        open: true,
        itemId,
        data: {
          type: "no-history",
          ...data,
        },
      });
    } catch (error) {
      toast.error("Failed to compare prices");
    }
  };

  const buildSaltComposition = (medicine) => {
    return [medicine?.short_composition1, medicine?.short_composition2]
      .map((v) => v?.trim())
      .filter(Boolean)
      .join(", ");
  };

  // Handle selecting medicine from suggestions for an item row
  const handleSelectMedicineForItem = async (itemId, medicine) => {
    const isInventory = medicine.source === "inventory";

    // Extract pack size
    let unitsPerPack = 1;
    if (isInventory && medicine.pack_size) {
      const match = medicine.pack_size.match(/(\d+)/);
      unitsPerPack = match ? parseInt(match[1]) : 1;
    } else if (medicine.pack_size_label) {
      const match = medicine.pack_size_label.match(/(\d+)/);
      unitsPerPack = match ? parseInt(match[1]) : 1;
    }

    // Calculate prices
    const mrpPerUnit =
      parseFloat(
        medicine.mrp_per_unit || medicine.mrp || medicine["price(₹)"]
      ) || 0;
    const mrpPack = mrpPerUnit * unitsPerPack;

    // Use historical purchase price if inventory, else 70% of MRP
    const ratePerUnit =
      isInventory && medicine.purchase_price
        ? parseFloat(medicine.purchase_price)
        : mrpPerUnit * 0.7;
    const ratePack = ratePerUnit * unitsPerPack;

    let manufacturer =
      medicine.manufacturer || medicine.manufacturer_name || "";
    let salt_composition =
      medicine.salt_composition ||
      [medicine.short_composition1, medicine.short_composition2]
        .filter(Boolean)
        .join(", ") ||
      "";

    const ratePackFixed = ratePack.toFixed(2);
    setPurchaseItems((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;

        const qty = parseInt(item.quantity) || 1;

        return {
          ...item,
          product_id: medicine.id || `med-${Date.now()}`,
          product_name: medicine.product_name || medicine.name,
          manufacturer,
          salt_composition,
          units: String(unitsPerPack),
          rate_pack: ratePackFixed,
          mrp_pack: mrpPack.toFixed(2),
          total_amount: (qty * ratePack).toFixed(2),
          _is_auto_filled_rate: true,

          // Store inventory metadata for visual indicators
          _inventoryMeta: isInventory
            ? {
                batch_no: medicine.batch_no,
                expiry_date: medicine.expiry_date,
                available_quantity: medicine.available_quantity,
                stock_status: medicine.stock_status,
                last_supplier: medicine.supplier_name,
                match_quality: medicine.matchQuality, // 'exact', 'good', or 'fuzzy'
              }
            : null,
        };
      })
    );

    // Call silent ping immediately so if the loaded price is high, it highlights!
    checkPriceHistorySilent(itemId, medicine.product_name || medicine.name, ratePackFixed);

    setSearchMedicine("");
    setMedicineSuggestions([]);
    setShowSuggestions(false);

    // Optional: Show toast for fuzzy matches
    if (isInventory && medicine.matchQuality === "fuzzy") {
      toast.info(`Fuzzy match: "${medicine.name}" - verify before saving`);
    }

    // AI Enrichment Trigger
    if (aiAutofillEnabled && (!manufacturer || !salt_composition)) {
      try {
        setIsAiLoading(true);
        const res = await axios.post(`${API}/medicines/enrich`, {
          product_name: medicine.product_name || medicine.name,
        });

        if (res.data.manufacturer || res.data.salt_composition) {
          setPurchaseItems((prev) =>
            prev.map((item) => {
              if (item.id !== itemId) return item;
              return {
                ...item,
                manufacturer: item.manufacturer || res.data.manufacturer,
                salt_composition:
                  item.salt_composition || res.data.salt_composition,
              };
            })
          );
          toast.success("AI Autofilled missing metadata ✨");
        }
      } catch (err) {
        console.warn("AI enrichment request failed or timed out.");
      } finally {
        setIsAiLoading(false);
      }
    }
  };

  // Direct AI resolution when no suggestions are found or user overrides
  const handleSelectAiMedicineForItem = async (itemId, productName) => {
    // 1. Flush local search state and inject base product
    setPurchaseItems((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        return {
          ...item,
          product_id: `ai-${Date.now()}`,
          product_name: productName,
          manufacturer: "",
          salt_composition: "",
          units: "1",
          rate_pack: "",
          mrp_pack: "",
          total_amount: "",
          _inventoryMeta: null,
        };
      })
    );

    setSearchMedicine("");
    setMedicineSuggestions([]);
    setShowSuggestions(false);
    setHighlightedSuggestionIndex(-1);

    // 2. Force authoritative AI fetch
    try {
      setIsAiLoading(true);
      const res = await axios.post(`${API}/medicines/enrich`, {
        product_name: productName,
      });

      if (res.data.manufacturer || res.data.salt_composition) {
        setPurchaseItems((prev) =>
          prev.map((item) => {
            if (item.id !== itemId) return item;
            return {
              ...item,
              manufacturer: res.data.manufacturer || item.manufacturer,
              salt_composition:
                res.data.salt_composition || item.salt_composition,
            };
          })
        );
        toast.success("AI recovered global product attributes ✨");
      } else {
        toast.info("AI couldn't confidently extract properties for this item.");
      }
    } catch (err) {
      console.warn("AI direct lookup failed", err);
      toast.error("AI lookup failed to connect.");
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleSubmitPurchase = async () => {
    if (!selectedSupplier) {
      toast.error("Please select a supplier");
      return;
    }

    const validItems = purchaseItems.filter(
      (item) => item.product_name && item.product_name.trim() !== ""
    );

    if (validItems.length === 0) {
      toast.error("Please add at least one item");
      return;
    }

    const supplier = suppliers.find((s) => s.id === selectedSupplier);

    setSubmitting(true);

    try {
      const payload = {
        supplier_id: selectedSupplier,
        supplier_name: supplier?.name || "Unknown",
        invoice_no: invoiceNo || null,
        purchase_date: purchaseDate,
        items: validItems.map((item) => ({
          product_id: item.product_id,
          product_name: item.product_name,
          batch_no: item.batch_no || null,
          expiry_date: item.expiry_date || null,
          manufacturer: item.manufacturer || null,
          salt_composition: item.salt_composition || null,
          pack_type: item.pack_type || "Strip",
          pack_quantity: parseInt(item.quantity) || 1,
          units_per_pack: parseInt(item.units) || 1,
          pack_price: parseFloat(item.rate_pack) || 0,
          mrp_per_unit:
            (parseFloat(item.mrp_pack) || 0) / (parseInt(item.units) || 1),
          hsn_no: item.hsn_no || null,
        })),
      };

      if (editingPurchaseId) {
        await axios.put(
          `${API}/purchases/${editingPurchaseId}?update_inventory=true`,
          payload
        );
        toast.success("Purchase updated successfully");
      } else {
        const res = await axios.post(`${API}/purchases`, payload);
        toast.success("Purchase recorded successfully");

        const purchaseId = res.data?.purchase?.id;

        if (purchaseId) {
          setTimeout(() => {
            if (window.confirm("Generate purchase PDF?")) {
              handleGeneratePurchasePdf(purchaseId);
            }
          }, 300);
        }
      }

      setEditingPurchaseId(null);
      clearDraft();
      handleCancelNewPurchase();
      await fetchPurchases(pagination.page);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to save purchase");
    } finally {
      setSubmitting(false);
    }
  };
  // ============ EDIT EXISTING PURCHASE ============

  // const handleStartEditPurchase = (purchase) => {
  //   setEditingPurchase({
  //     ...purchase,
  //     items: purchase.items.map((item, idx) => ({
  //       ...item,
  //       id: item.id || `existing-${idx}`,
  //       pack_quantity: item.pack_quantity || item.quantity || 1,
  //       units_per_pack: item.units_per_pack || 1,
  //       pack_price:
  //         item.pack_price ||
  //         item.purchase_price * (item.units_per_pack || 1) ||
  //         0,
  //       mrp_per_unit: item.mrp_per_unit || item.mrp || 0,
  //     })),
  //   });
  // };

  const handleStartEditPurchase = (purchase) => {
    setShowNewPurchase(true);
    setEditingPurchaseId(purchase.id);

    setSelectedSupplier(purchase.supplier_id);
    setInvoiceNo(purchase.invoice_no || "");
    setPurchaseDate(
      purchase.purchase_date ||
        purchase.created_at?.slice(0, 10) ||
        new Date().toISOString().slice(0, 10)
    );

    const mappedItems = purchase.items.map((item, idx) => ({
      id: item.id || `edit-${idx}`,
      product_id: item.product_id,
      product_name: item.product_name,
      manufacturer: item.manufacturer || "",
      salt_composition: item.salt_composition || "",
      pack_type: item.pack_type || "Strip",
      batch_no: item.batch_no || "",
      hsn_no: item.hsn_no || "",
      expiry_date: item.expiry_date || "",
      quantity: item.pack_quantity || item.quantity || 1,
      units: item.units_per_pack || 1,
      rate_pack: item.pack_price || 0,
      mrp_pack:
        item.mrp_pack || (item.mrp_per_unit || 0) * (item.units_per_pack || 1),
      total_amount: (item.pack_quantity || 1) * (item.pack_price || 0),
    }));

    setPurchaseItems(mappedItems);
  };

  const handleSaveEditPurchase = async () => {
    if (!editingPurchase) return;

    setSubmitting(true);
    try {
      await axios.put(
        `${API}/purchases/${editingPurchase.id}?update_inventory=true`,
        {
          supplier_id: editingPurchase.supplier_id,
          supplier_name: editingPurchase.supplier_name,
          invoice_no: editingPurchase.invoice_no,
          purchase_date: editingPurchase.purchase_date,
          items: editingPurchase.items.map(({ id, _editing, ...item }) => ({
            product_id: item.product_id || `prod-${Date.now()}`,
            product_name: item.product_name,
            batch_no: item.batch_no,
            expiry_date: item.expiry_date,
            pack_quantity: parseInt(item.pack_quantity) || 1,
            units_per_pack: parseInt(item.units_per_pack) || 1,
            pack_price: parseFloat(item.pack_price) || 0,
            mrp_per_unit: parseFloat(item.mrp_per_unit) || 0,
            hsn_no: item.hsn_no || null,
          })),
        }
      );

      toast.success("Purchase updated successfully");
      setEditingPurchase(null);
      await fetchPurchases(pagination.page);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to update purchase");
    } finally {
      setSubmitting(false);
    }
  };

  // ============ DELETE PURCHASE ============

  const handleDeletePurchase = async (deleteInventory = false) => {
    if (!deleteDialog.purchase) return;

    try {
      const response = await axios.delete(
        `${API}/purchases/${deleteDialog.purchase.id}?delete_inventory=${deleteInventory}`
      );
      toast.success(response.data.message);
      if (deleteInventory && response.data.deleted_inventory_items > 0) {
        toast.info(
          `${response.data.deleted_inventory_items} inventory items also deleted`
        );
      }
      setDeleteDialog({ open: false, purchase: null });
      await fetchPurchases(pagination.page);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to delete purchase");
    }
  };

  // ============ CSV IMPORT ============

  const handleCsvFileSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setCsvFile(file);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await axios.post(
        `${API}/purchases/csv-columns`,
        formData,
        {
          headers: { "Content-Type": "multipart/form-data" },
        }
      );
      setCsvColumns(response.data.columns);
      setCsvSampleData(response.data.sample_data);
    } catch (error) {
      toast.error("Failed to read CSV file");
    }
  };

  const handleCsvImport = async () => {
    if (!selectedSupplier) {
      toast.error("Please select a supplier");
      return;
    }
    if (!csvFile) {
      toast.error("Please select a CSV file");
      return;
    }
    if (
      !csvMapping.product_name_col ||
      !csvMapping.batch_no_col ||
      !csvMapping.quantity_col ||
      !csvMapping.purchase_price_col ||
      !csvMapping.mrp_col ||
      !csvMapping.expiry_date_col
    ) {
      toast.error("Please map all required fields");
      return;
    }

    const supplier = suppliers.find((s) => s.id === selectedSupplier);
    const formData = new FormData();
    formData.append("file", csvFile);
    formData.append("supplier_id", selectedSupplier);
    formData.append("supplier_name", supplier?.name || "Unknown");
    formData.append("product_name_col", csvMapping.product_name_col);
    formData.append("batch_no_col", csvMapping.batch_no_col);
    formData.append("expiry_date_col", csvMapping.expiry_date_col);
    formData.append("quantity_col", csvMapping.quantity_col);
    formData.append("purchase_price_col", csvMapping.purchase_price_col);
    formData.append("mrp_col", csvMapping.mrp_col);
    if (csvMapping.hsn_col && csvMapping.hsn_col !== "none") {
      formData.append("hsn_col", csvMapping.hsn_col);
    }

    setSubmitting(true);
    try {
      const response = await axios.post(
        `${API}/purchases/import-csv`,
        formData,
        {
          headers: { "Content-Type": "multipart/form-data" },
        }
      );

      toast.success(
        `CSV imported: ${response.data.items_imported} items added`
      );
      if (response.data.errors?.length > 0) {
        toast.warning(`${response.data.errors.length} rows had errors`);
      }

      setCsvDialog(false);
      setCsvFile(null);
      setCsvColumns([]);
      setCsvSampleData([]);
      setCsvMapping({
        product_name_col: "",
        batch_no_col: "",
        expiry_date_col: "",
        quantity_col: "",
        purchase_price_col: "",
        mrp_col: "",
        hsn_col: "",
      });
      await fetchPurchases(pagination.page);
    } catch (error) {
      toast.error(error.response?.data?.detail || "CSV import failed");
    } finally {
      setSubmitting(false);
    }
  };

  // Calculate total - based on pack prices
  const totalAmount = purchaseItems.reduce((sum, item) => {
    const qty =
      parseFloat(item.quantity) || parseFloat(item.pack_quantity) || 0;
    const ratePack =
      parseFloat(item.rate_pack) || parseFloat(item.pack_price) || 0;
    return sum + qty * ratePack;
  }, 0);

  // Calculate total units
  const totalUnits = purchaseItems.reduce((sum, item) => {
    const qty = parseInt(item.quantity) || parseInt(item.pack_quantity) || 0;
    const units = parseInt(item.units) || parseInt(item.units_per_pack) || 1;
    return sum + qty * units;
  }, 0);

  // Calculate total packs
  const totalPacks = purchaseItems.reduce((sum, item) => {
    const qty = parseInt(item.quantity) || parseInt(item.pack_quantity) || 0;
    return sum + qty;
  }, 0);

  useEffect(() => {
    if (showSuggestions && highlightedSuggestionIndex >= 0) {
      const el = document.getElementById(`purchases-suggestion-${highlightedSuggestionIndex}`);
      if (el) el.scrollIntoView({ block: "nearest" });
    }
  }, [highlightedSuggestionIndex, showSuggestions]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in" data-testid="purchases-page">
      {/* Restore Draft Dialog */}
      <AlertDialog open={showRestoreDialog} onOpenChange={setShowRestoreDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <RotateCcw className="w-5 h-5 text-primary" />
              Restore Previous Work?
            </AlertDialogTitle>
            <AlertDialogDescription>
              You have an unsaved purchase from{" "}
              {draftData?.savedAt
                ? new Date(draftData.savedAt).toLocaleString()
                : "earlier"}
              .
              <br />
              <span className="text-foreground font-medium">
                {draftData?.items?.length || 0} items,{" "}
                {draftData?.supplier ? "supplier selected" : "no supplier"}
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleDiscardDraft}>
              Discard
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRestoreDraft}
              className="btn-primary"
            >
              Restore
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Keyboard Shortcuts Dialog */}
      <Dialog open={showShortcuts} onOpenChange={setShowShortcuts}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Keyboard className="w-5 h-5" />
              Keyboard Shortcuts
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-4">
            <div className="flex justify-between items-center p-2 bg-muted/30 rounded">
              <span>New Purchase</span>
              <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono">
                {getOS() === 'mac' ? '⌥ + N' : 'Alt + N'}
              </kbd>
            </div>
            <div className="flex justify-between items-center p-2 bg-muted/30 rounded">
              <span>Add Item</span>
              <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono">
                {getOS() === 'mac' ? '⌥ + A' : 'Alt + A'}
              </kbd>
            </div>
            <div className="flex justify-between items-center p-2 bg-muted/30 rounded">
              <span>Save Purchase</span>
              <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono">
                {getOS() === 'mac' ? '⌘ + Enter' : 'Ctrl + Enter'}
              </kbd>
            </div>
            <div className="flex justify-between items-center p-2 bg-muted/30 rounded">
              <span>Save Item / Next Field</span>
              <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono">
                Enter / Tab
              </kbd>
            </div>
            <div className="flex justify-between items-center p-2 bg-muted/30 rounded">
              <span>Fill Default (on empty field)</span>
              <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono">
                Tab
              </kbd>
            </div>
            <div className="flex justify-between items-center p-2 bg-muted/30 rounded">
              <span>Cancel / Close</span>
              <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono">
                Escape
              </kbd>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Purchases</h1>
          <p className="text-muted-foreground">
            {pagination.total} purchases recorded • Items tracked in units
          </p>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setShowShortcuts(true)}
            data-testid="shortcuts-btn"
          >
            <Keyboard className="w-4 h-4 mr-2" />
            Shortcuts
          </Button>

          <Button
            variant="outline"
            className="bg-gradient-to-r from-primary/10 to-primary/5 border-primary/30 hover:border-primary/50"
            onClick={() => window.open("/scan", "_blank")}
            data-testid="scan-products-btn"
          >
            <Upload className="w-4 h-4 mr-2" />
            Scan
          </Button>

          <Dialog open={csvDialog} onOpenChange={setCsvDialog}>
            <DialogTrigger asChild>
              <Button variant="outline" data-testid="csv-import-btn">
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                CSV
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Import Purchases from CSV</DialogTitle>
              </DialogHeader>
              <div className="space-y-6 pt-4">
                <div className="space-y-2">
                  <Label>Supplier *</Label>
                  <Select
                    value={selectedSupplier}
                    onValueChange={setSelectedSupplier}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select supplier" />
                    </SelectTrigger>
                    <SelectContent>
                      {suppliers.map((supplier) => (
                        <SelectItem key={supplier.id} value={supplier.id}>
                          {supplier.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>CSV File *</Label>
                  <Input
                    type="file"
                    accept=".csv"
                    onChange={handleCsvFileSelect}
                  />
                </div>

                {csvColumns.length > 0 && (
                  <div className="space-y-4">
                    <h4 className="font-medium">Map CSV Columns</h4>
                    <div className="grid grid-cols-2 gap-4">
                      {[
                        { key: "product_name_col", label: "Product Name *" },
                        { key: "batch_no_col", label: "Batch Number *" },
                        { key: "expiry_date_col", label: "Expiry Date *" },
                        { key: "quantity_col", label: "Quantity (Units) *" },
                        {
                          key: "purchase_price_col",
                          label: "Purchase Price/Unit *",
                        },
                        { key: "mrp_col", label: "MRP/Unit *" },
                      ].map(({ key, label }) => (
                        <div key={key} className="space-y-2">
                          <Label>{label}</Label>
                          <Select
                            value={csvMapping[key]}
                            onValueChange={(v) =>
                              setCsvMapping({ ...csvMapping, [key]: v })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select column" />
                            </SelectTrigger>
                            <SelectContent>
                              {csvColumns.map((col) => (
                                <SelectItem key={col} value={col}>
                                  {col}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ))}
                      <div className="space-y-2">
                        <Label>HSN Code (optional)</Label>
                        <Select
                          value={csvMapping.hsn_col}
                          onValueChange={(v) =>
                            setCsvMapping({ ...csvMapping, hsn_col: v })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select column" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            {csvColumns.map((col) => (
                              <SelectItem key={col} value={col}>
                                {col}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                )}

                <Button
                  onClick={handleCsvImport}
                  disabled={submitting || csvColumns.length === 0}
                  className="w-full btn-primary"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 mr-2" />
                      Import CSV
                    </>
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Button
            className="btn-primary"
            onClick={handleStartNewPurchase}
            data-testid="add-purchase-btn"
          >
            <Plus className="w-4 h-4 mr-2" />
            {getOS() === 'mac' ? 'New (⌥N)' : 'New (Alt+N)'}
          </Button>
        </div>
      </div>

      {/* New Purchase - Inline Table Entry with UNIT-BASED fields */}
      {showNewPurchase && (
        <Card
          className="border-primary/30 bg-primary/5 relative overflow-hidden"
          data-testid="new-purchase-form"
        >
          {isAiLoading && (
            <div className="absolute inset-0 z-[100] flex flex-col items-center justify-center bg-background/60 backdrop-blur-md transition-all duration-300">
              <div className="relative">
                <div className="absolute inset-0 bg-indigo-500/20 blur-xl rounded-full"></div>
                <Loader2 className="w-12 h-12 text-indigo-600 animate-spin relative z-10" />
              </div>
              <p className="mt-5 text-lg font-extrabold text-foreground tracking-wide animate-pulse">
                Running AI Analysis...
              </p>
              <p className="text-sm font-medium text-muted-foreground mt-1">
                Extracting properties
              </p>
            </div>
          )}
          <CardHeader className="pb-4">
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Package className="w-5 h-5" />
                  New Purchase
                  <span className="text-xs font-normal text-muted-foreground ml-2">
                    (
                    <kbd className="px-1 bg-muted rounded font-mono text-[10px]">
                      Enter
                    </kbd>{" "}
                    to save)
                  </span>
                </CardTitle>
                <div className="flex items-center gap-3">
                  <Button
                    variant={aiAutofillEnabled ? "default" : "outline"}
                    onClick={() => setAiAutofillEnabled(!aiAutofillEnabled)}
                    className={`relative overflow-hidden group ${
                      aiAutofillEnabled
                        ? "bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white shadow-lg shadow-indigo-500/30 border-none transition-all duration-300 font-bold"
                        : "text-indigo-600 border-indigo-200 hover:bg-indigo-50 transition-all font-medium"
                    }`}
                    size="sm"
                  >
                    {aiAutofillEnabled && (
                      <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 ease-in-out skew-x-12"></div>
                    )}
                    ✨ AI Autofill {aiAutofillEnabled ? "ON" : "OFF"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleCancelNewPurchase}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Warning Text Dropdown */}
              <div
                className={`flex justify-end pr-10 transition-all duration-300 overflow-hidden ${aiAutofillEnabled ? "max-h-12 opacity-100" : "max-h-0 opacity-0"}`}
              >
                <div className="text-[11px] font-medium text-amber-600 bg-amber-50 dark:bg-amber-500/10 px-3 py-1.5 rounded-md border border-amber-200/50 dark:border-amber-500/20 flex items-center gap-1.5 shadow-sm">
                  <AlertCircle className="w-3.5 h-3.5" />
                  Generative AI may be inaccurate. Please review the autofilled
                  details below before saving.
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Supplier & Invoice */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div className="space-y-2">
                <Label>Supplier *</Label>
                <Select
                  value={selectedSupplier}
                  onValueChange={setSelectedSupplier}
                >
                  <SelectTrigger data-testid="supplier-select">
                    <SelectValue placeholder="Select supplier" />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.map((supplier) => (
                      <SelectItem key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Invoice Number</Label>
                <Input
                  placeholder="INV-001"
                  value={invoiceNo}
                  onChange={(e) => setInvoiceNo(e.target.value)}
                  data-testid="invoice-no-input"
                />
              </div>
              <div className="space-y-2">
                <Label>Purchase Date *</Label>
                <Input
                  type="date"
                  value={purchaseDate}
                  onChange={(e) => setPurchaseDate(e.target.value)}
                />
              </div>

              <div className="text-center p-2 rounded-lg bg-muted/50">
                <span className="text-xs text-muted-foreground">
                  Total Units
                </span>
                <div className="text-lg font-bold text-primary">
                  {totalUnits}
                </div>
              </div>
              <div className="text-center p-2 rounded-lg bg-muted/50">
                <span className="text-xs text-muted-foreground">
                  Total Amount
                </span>
                <div className="text-lg font-bold font-mono text-primary">
                  ₹{totalAmount.toFixed(2)}
                </div>
              </div>
            </div>

            {/* Items Table - Inline Editable with enhanced fields */}
            <div className="border border-border rounded-lg relative overflow-hidden">
                <Table wrapperClassName="h-[350px]">
                  <TableHeader className="sticky top-0 bg-muted/95 backdrop-blur z-[50]">
                    <TableRow>
                      <TableHead className="w-[150px] font-bold text-foreground">
                        Product *
                      </TableHead>
                      <TableHead className="w-[100px] font-bold text-foreground">
                        MFG.
                      </TableHead>
                      <TableHead className="w-[100px] font-bold text-foreground">
                        Salt
                      </TableHead>
                      <TableHead className="w-[80px] font-bold text-foreground">
                        Pack Type
                      </TableHead>
                      <TableHead className="w-[80px] font-bold text-foreground">
                        Batch
                      </TableHead>
                      <TableHead className="w-[80px] font-bold text-foreground">
                        HSN
                      </TableHead>
                      <TableHead className="w-[100px] font-bold text-foreground">
                        Expiry
                      </TableHead>
                      <TableHead className="w-[60px] text-center font-bold text-foreground">
                        Qty *
                      </TableHead>
                      <TableHead className="w-[60px] text-center font-bold text-foreground">
                        Units
                      </TableHead>
                      <TableHead className="w-[60px] text-center font-bold text-foreground">
                        T.Units
                      </TableHead>
                      <TableHead className="w-[80px] text-center font-bold text-foreground">
                        Rate(Pack)*
                      </TableHead>

                      <TableHead className="w-[80px] text-center font-bold text-foreground">
                        MRP(Pack)
                      </TableHead>
                      <TableHead className="w-[70px] text-center font-bold text-foreground">
                        MRP/Unit
                      </TableHead>
                      <TableHead className="w-[80px] text-center font-bold text-foreground">
                        Total *
                      </TableHead>
                      <TableHead className="w-[70px] text-center font-bold text-foreground">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {/* Editable Item Rows */}
                    {purchaseItems.map((item, index) => {
                      const qty =
                        parseInt(item.quantity) ||
                        parseInt(item.pack_quantity) ||
                        1;
                      const units =
                        parseInt(item.units) ||
                        parseInt(item.units_per_pack) ||
                        1;
                      const ratePack =
                        parseFloat(item.rate_pack) ||
                        parseFloat(item.pack_price) ||
                        0;
                      const mrpPack =
                        parseFloat(item.mrp_pack) ||
                        parseFloat(item.mrp_per_unit) * units ||
                        0;
                      const totalUnits = qty * units;
                      const mrpUnit = units > 0 ? mrpPack / units : 0;
                      const totalAmount =
                        parseFloat(item.total_amount) || qty * ratePack;

                      return (
                        <TableRow
                          key={item.id || index}
                          className={`bg-primary/5 ${
                            priceAlerts[item.id] ? "animate-row-alert" : ""
                          }`}
                        >
                          <TableCell
                            className="relative"
                            style={{ overflow: "visible" }}
                          >
                            <div className="flex items-center gap-2">
                              <Input
                                ref={(el) => {
                                  setInputRef(el, item.id);
                                  if (index === purchaseItems.length - 1) {
                                    productInputRef.current = el;
                                  }
                                }}
                                value={item.product_name || ""}
                                onChange={(e) => {
                                  handleItemFieldChange(
                                    item.id,
                                    "product_name",
                                    e.target.value
                                  );
                                  setHighlightedSuggestionIndex(-1);
                                }}
                                onFocus={() => {
                                  setSearchMedicine(item.product_name || "");
                                  setShowSuggestions(true);
                                  setActiveItemId(item.id);
                                  setHighlightedSuggestionIndex(-1);
                                }}
                                onBlur={(e) => {
                                  // Check if focus is moving to the suggestions dropdown
                                  const relatedTarget = e.relatedTarget;
                                  const isMovingToSuggestions =
                                    relatedTarget?.closest?.(
                                      "[data-suggestions-dropdown]"
                                    );

                                  if (!isMovingToSuggestions) {
                                    setTimeout(() => {
                                      setShowSuggestions(false);
                                      setActiveItemId(null);
                                      setHighlightedSuggestionIndex(-1);
                                    }, 200);
                                  }
                                }}
                                onKeyDown={(e) => {
                                  const hasAiOption = searchMedicine.length > 1;
                                  const maxIndex = hasAiOption
                                    ? medicineSuggestions.length
                                    : medicineSuggestions.length - 1;

                                  if (
                                    !showSuggestions ||
                                    (medicineSuggestions.length === 0 &&
                                      !hasAiOption)
                                  )
                                    return;

                                  if (e.key === "ArrowDown") {
                                    e.preventDefault();
                                    setHighlightedSuggestionIndex((prev) =>
                                      prev < maxIndex ? prev + 1 : prev
                                    );
                                  } else if (e.key === "ArrowUp") {
                                    e.preventDefault();
                                    setHighlightedSuggestionIndex((prev) =>
                                      prev > 0 ? prev - 1 : -1
                                    );
                                  } else if (
                                    e.key === "Enter" &&
                                    highlightedSuggestionIndex >= 0
                                  ) {
                                    e.preventDefault();
                                    if (
                                      highlightedSuggestionIndex ===
                                      medicineSuggestions.length
                                    ) {
                                      // Trigger AI explicitly
                                      handleSelectAiMedicineForItem(
                                        item.id,
                                        searchMedicine
                                      );
                                    } else {
                                      handleSelectMedicineForItem(
                                        item.id,
                                        medicineSuggestions[
                                          highlightedSuggestionIndex
                                        ]
                                      );
                                    }
                                    setHighlightedSuggestionIndex(-1);
                                  } else if (e.key === "Escape") {
                                    setShowSuggestions(false);
                                    setHighlightedSuggestionIndex(-1);
                                  }
                                }}
                                placeholder="Search..."
                                className={`h-8 text-xs ${
                                  item._inventoryMeta
                                    ? item._inventoryMeta.stock_status ===
                                      "In Stock"
                                      ? "border-blue-300 bg-blue-50/30"
                                      : "border-orange-300 bg-orange-50/30"
                                    : ""
                                }`}
                                data-testid={`item-name-${index}`}
                                autoComplete="off"
                              />

                              {/* Inventory Indicator Icon */}
                              {item._inventoryMeta && (
                                <CustomTooltip
                                  position="top"
                                  text={
                                    item._inventoryMeta.stock_status ===
                                    "In Stock"
                                      ? `✅ In Stock: ${item._inventoryMeta.available_quantity} units\nBatch: ${item._inventoryMeta.batch_no || "N/A"}\nLast Supplier: ${item._inventoryMeta.last_supplier || "Unknown"}`
                                      : `⚠️ Out of Stock\nLast Supplier: ${item._inventoryMeta.last_supplier || "Unknown"}`
                                  }
                                >
                                  <Package
                                    className={`w-4 h-4 ${
                                      item._inventoryMeta.stock_status ===
                                      "In Stock"
                                        ? "text-blue-500"
                                        : "text-orange-500"
                                    }`}
                                  />
                                </CustomTooltip>
                              )}

                              {/* Fuzzy Match Warning */}
                              {/* {item._inventoryMeta?.match_quality ===
                                "fuzzy" && (
                                <CustomTooltip
                                  position="top"
                                  text="Fuzzy match - please verify details"
                                >
                                  <span className="text-yellow-500 text-xs">
                                    ⚠️
                                  </span>
                                </CustomTooltip>
                              )} */}
                            </div>

                            {/* ========================================== */}
                            {/* SUGGESTIONS DROPDOWN VIA PORTAL            */}
                            {/* ========================================== */}
                            {showSuggestions &&
                              activeItemId === item.id &&
                              (medicineSuggestions.length > 0 ||
                                searchMedicine.length > 1) &&
                              createPortal(
                                <div
                                  data-suggestions-dropdown="true"
                                  className="bg-card border border-border rounded-lg shadow-2xl overflow-y-auto z-[99999]"
                                  style={{
                                    position: "fixed",
                                    top: dropdownPosition.top,
                                    left: dropdownPosition.left,
                                    width: dropdownPosition.width || 480,
                                    maxHeight: "300px",
                                    overscrollBehavior: "contain",
                                    WebkitOverflowScrolling: "touch",
                                  }}
                                  onScroll={handleScrollSuggestions}
                                >
                                  {/* Match Quality Summary */}
                                  {medicineSuggestions[0]?.matchQuality && (
                                    <div className="px-3 py-2 bg-muted/50 border-b border-border text-xs text-muted-foreground flex gap-3 sticky top-0">
                                      {/* <span>
                                        Exact:{" "}
                                        {
                                          medicineSuggestions.filter(
                                            (m) => m.matchQuality === "exact"
                                          ).length
                                        }
                                      </span> */}
                                      <span>
                                        Good:{" "}
                                        {
                                          medicineSuggestions.filter(
                                            (m) => m.matchQuality === "good"
                                          ).length
                                        }
                                      </span>
                                      {/* <span>
                                        Fuzzy:{" "}
                                        {
                                          medicineSuggestions.filter(
                                            (m) => m.matchQuality === "fuzzy"
                                          ).length
                                        }
                                      </span> */}
                                    </div>
                                  )}

                                  {medicineSuggestions.map((medicine, idx) => (
                                    <div
                                      key={idx}
                                      id={`purchases-suggestion-${idx}`}
                                      className={`p-3 cursor-pointer border-b border-border last:border-0 ${
                                        highlightedSuggestionIndex === idx
                                          ? "bg-primary/20"
                                          : "hover:bg-primary/10"
                                      }`}
                                      // In your suggestion items, prevent mousedown from causing blur
                                      onMouseDown={(e) => {
                                        e.preventDefault(); // ← This prevents the blur from firing at all!
                                        handleSelectMedicineForItem(
                                          item.id,
                                          medicine
                                        );
                                        setHighlightedSuggestionIndex(-1);
                                      }}
                                      onMouseEnter={() =>
                                        setHighlightedSuggestionIndex(idx)
                                      }
                                    >
                                      {/* Header: Name + Source Badge + Match Quality */}
                                      <div className="flex items-center justify-between mb-1">
                                        <div className="font-medium text-sm flex items-center gap-2 flex-wrap">
                                          {medicine.name}

                                          {/* Source Badge */}
                                          {medicine.source === "inventory" && (
                                            <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded-full font-medium">
                                              Inventory
                                            </span>
                                          )}
                                          {medicine.source === "global" && (
                                            <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded-full font-medium">
                                              Not in Inventory
                                            </span>
                                          )}

                                          {/* Match Quality Indicator */}
                                          {/* {medicine.matchQuality ===
                                            "exact" && (
                                            <span className="text-[10px] px-1.5 py-0.5 bg-green-100 text-green-700 rounded-full">
                                              Exact
                                            </span>
                                          )} */}
                                          {/* {medicine.matchQuality ===
                                            "fuzzy" && (
                                            <span className="text-[10px] px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded-full">
                                              Fuzzy
                                            </span>
                                          )} */}
                                        </div>

                                        {/* Fuzzy Score */}
                                        {/* {medicine.fuzzyScore &&
                                          medicine.fuzzyScore < 90 && (
                                            <span className="text-[10px] text-muted-foreground">
                                              {Math.round(medicine.fuzzyScore)}%
                                              match
                                            </span>
                                          )} */}
                                      </div>

                                      {/* Manufacturer & Composition */}
                                      <div className="text-xs text-muted-foreground">
                                        <span>
                                          {medicine.manufacturer ||
                                            medicine.manufacturer_name}
                                        </span>
                                        {(medicine.salt_composition ||
                                          medicine.short_composition1) && (
                                          <span className="ml-2 text-primary/70">
                                            (
                                            {(
                                              medicine.salt_composition ||
                                              medicine.short_composition1
                                            )?.slice(0, 35)}
                                            ...)
                                          </span>
                                        )}
                                      </div>

                                      {/* Inventory-Specific Info */}
                                      {medicine.source === "inventory" && (
                                        <div className="mt-2 flex items-center gap-2 flex-wrap text-xs">
                                          <span
                                            className={`px-2 py-0.5 rounded font-medium ${
                                              medicine.stock_status ===
                                              "In Stock"
                                                ? "bg-green-500/20 text-green-700"
                                                : "bg-red-500/20 text-red-700"
                                            }`}
                                          >
                                            {medicine.stock_status}:{" "}
                                            {medicine.available_quantity || 0}{" "}
                                            units
                                          </span>

                                          {medicine.batch_no && (
                                            <span className="text-muted-foreground">
                                              Batch: {medicine.batch_no}
                                            </span>
                                          )}

                                          {medicine.expiry_date && (
                                            <span
                                              className={`${
                                                new Date(medicine.expiry_date) <
                                                new Date(
                                                  Date.now() +
                                                    90 * 24 * 60 * 60 * 1000
                                                )
                                                  ? "text-orange-600 font-medium"
                                                  : "text-muted-foreground"
                                              }`}
                                            >
                                              Exp: {medicine.expiry_date}
                                              {new Date(medicine.expiry_date) <
                                                new Date() && " ⚠️ Expired"}
                                            </span>
                                          )}
                                        </div>
                                      )}

                                      {/* Pricing Info Row */}
                                      <div className="mt-2 flex items-center gap-3 text-xs">
                                        {medicine.source === "inventory" ? (
                                          <>
                                            <span className="font-mono font-medium text-primary">
                                              Purchase: ₹
                                              {Number(
                                                medicine.purchase_price || 0
                                              ).toFixed(2)}
                                              /unit
                                            </span>
                                            <span className="font-mono text-muted-foreground">
                                              MRP: ₹
                                              {Number(
                                                medicine.mrp_per_unit ||
                                                  medicine.mrp ||
                                                  0
                                              ).toFixed(2)}
                                            </span>
                                            {medicine.supplier_name && (
                                              <span className="text-blue-600">
                                                Last: {medicine.supplier_name}
                                              </span>
                                            )}
                                          </>
                                        ) : (
                                          <span className="font-mono font-medium text-primary">
                                            MRP: ₹{medicine["price(₹)"] || 0} •{" "}
                                            {medicine.pack_size_label || "N/A"}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                  {loadingSuggestions && (
                                    <div className="p-3 text-center border-t border-border">
                                      <Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
                                    </div>
                                  )}

                                  {/* AI Fallback Option */}
                                  {!loadingSuggestions &&
                                    searchMedicine.length > 1 && (
                                      <div
                                        className={`p-3 cursor-pointer border-t border-indigo-100 dark:border-indigo-500/20 bg-indigo-50/50 dark:bg-indigo-500/10 hover:bg-indigo-100/50 dark:hover:bg-indigo-500/20 transition-colors ${
                                          highlightedSuggestionIndex ===
                                          medicineSuggestions.length
                                            ? "bg-indigo-100/80 dark:bg-indigo-500/30"
                                            : ""
                                        }`}
                                        onMouseDown={(e) => {
                                          e.preventDefault();
                                          handleSelectAiMedicineForItem(
                                            item.id,
                                            searchMedicine
                                          );
                                        }}
                                        onMouseEnter={() =>
                                          setHighlightedSuggestionIndex(
                                            medicineSuggestions.length
                                          )
                                        }
                                      >
                                        <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-400 font-semibold text-sm">
                                          <div className="p-1.5 bg-indigo-100 dark:bg-indigo-500/20 rounded-md shadow-sm">
                                            ✨
                                          </div>
                                          <span>
                                            Get AI facts for{" "}
                                            <span className="font-bold underline decoration-indigo-300 dark:decoration-indigo-600 underline-offset-2">
                                              "{searchMedicine}"
                                            </span>
                                          </span>
                                        </div>
                                        <p className="text-[10.5px] font-medium text-indigo-500/80 dark:text-indigo-400/70 mt-1 ml-9">
                                          Bypass search and instantly extract
                                          properties
                                        </p>
                                      </div>
                                    )}
                                </div>,
                                document.body
                              )}
                          </TableCell>
                          <TableCell>
                            <Input
                              value={item.manufacturer || ""}
                              onChange={(e) =>
                                handleItemFieldChange(
                                  item.id,
                                  "manufacturer",
                                  e.target.value
                                )
                              }
                              placeholder="MFG"
                              className="h-8 text-xs"
                            />
                          </TableCell>
                          <TableCell>
                            <Button
                              id={`add-salt-${item.id}`}
                              type="button"
                              variant="outline"
                              className="h-8 text-xs w-20 justify-start truncate"
                              onClick={() =>
                                setSaltDialog({
                                  open: true,
                                  itemId: item.id,
                                  value: item.salt_composition || "",
                                })
                              }
                            >
                              {item.salt_composition
                                ? item.salt_composition.length > 7
                                  ? item.salt_composition.slice(0, 7) + "..."
                                  : item.salt_composition
                                : "Add Salt"}
                            </Button>
                          </TableCell>

                          <TableCell>
                            <Select
                              value={item.pack_type || "Strip"}
                              onValueChange={(v) =>
                                handleItemFieldChange(item.id, "pack_type", v)
                              }
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {PACK_TYPES.map((type) => (
                                  <SelectItem key={type} value={type}>
                                    {type}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Input
                              id={`batch-${item.id}`}
                              value={item.batch_no || ""}
                              onChange={(e) =>
                                handleItemFieldChange(
                                  item.id,
                                  "batch_no",
                                  e.target.value
                                )
                              }
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  document.getElementById(`hsn-${item.id}`)?.focus({ preventScroll: true });
                                }
                              }}
                              placeholder="Batch"
                              className="h-8 text-xs"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              id={`hsn-${item.id}`}
                              value={item.hsn_no || ""}
                              onChange={(e) =>
                                handleItemFieldChange(
                                  item.id,
                                  "hsn_no",
                                  e.target.value
                                )
                              }
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  document.getElementById(`expiry-${item.id}`)?.focus({ preventScroll: true });
                                }
                              }}
                              placeholder="HSN"
                              className="h-8 text-xs"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              id={`expiry-${item.id}`}
                              type="date"
                              value={item.expiry_date || ""}
                              onChange={(e) =>
                                handleItemFieldChange(
                                  item.id,
                                  "expiry_date",
                                  e.target.value
                                )
                              }
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  document.getElementById(`qty-${item.id}`)?.focus({ preventScroll: true });
                                }
                              }}
                              className="h-8 text-xs"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              id={`qty-${item.id}`}
                              type="number"
                              value={item.quantity || item.pack_quantity || ""}
                              onChange={(e) =>
                                handleItemFieldChangeWithCalc(
                                  item.id,
                                  "quantity",
                                  e.target.value
                                )
                              }
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  document.getElementById(`units-${item.id}`)?.focus({ preventScroll: true });
                                }
                              }}
                              placeholder="1"
                              className="h-8 text-xs text-center w-14"
                              min="1"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              id={`units-${item.id}`}
                              type="number"
                              value={item.units || item.units_per_pack || ""}
                              onChange={(e) =>
                                handleItemFieldChange(
                                  item.id,
                                  "units",
                                  e.target.value
                                )
                              }
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  document.getElementById(`rate-${item.id}`)?.focus({ preventScroll: true });
                                }
                              }}
                              placeholder="1"
                              className="h-8 text-xs text-center w-14"
                              min="1"
                            />
                          </TableCell>
                          <TableCell className="text-center font-mono text-xs font-medium text-primary">
                            {totalUnits}
                          </TableCell>
                          <TableCell
                            className="relative"
                            style={{ position: "relative" }}
                          >
                            <div className="flex items-center gap-2">
                              <Input
                                id={`rate-${item.id}`}
                                type="number"
                                step="0.01"
                                value={item.rate_pack || item.pack_price || ""}
                                onChange={(e) =>
                                  handleItemFieldChangeWithCalc(
                                    item.id,
                                    "rate_pack",
                                    e.target.value
                                  )
                                }
                                onBlur={() => checkPriceHistorySilent(item.id, item.product_name, item.rate_pack || item.pack_price)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    document.getElementById(`mrp-${item.id}`)?.focus({ preventScroll: true });
                                  }
                                }}
                                placeholder="₹"
                                className={`h-8 text-xs text-center w-28 pr-6 ${
                                  priceAlerts[item.id]
                                    ? "border-yellow-500 bg-yellow-500/10"
                                    : ""
                                }`}
                              />

                              {(item.rate_pack || item.pack_price) && (
                                <button
                                  id={`price-history-${item.id}`}
                                  type="button"
                                  onClick={() => {
                                    const currentRate =
                                      parseFloat(item.rate_pack) ||
                                      parseFloat(item.pack_price) ||
                                      0;

                                    if (!item.product_name) {
                                      toast.error("Enter product name first");
                                      return;
                                    }

                                    checkPriceHistory(
                                      item.id,
                                      item.product_name,
                                      currentRate
                                    );
                                  }}
                                  className="absolute right-1 top-1/2 -translate-y-1/2 text-primary hover:text-primary/70"
                                  title="Compare with past rates"
                                >
                                  <CustomTooltip
                                    position="top"
                                    text="Compare with past rates"
                                  >
                                    <ArrowUpDown className={`w-4 h-4 ${priceAlerts[item.id] ? "text-yellow-500 animate-icon-alert cursor-pointer" : ""}`} />
                                  </CustomTooltip>
                                </button>
                              )}
                            </div>
                          </TableCell>

                          <TableCell>
                            <Input
                              id={`mrp-${item.id}`}
                              type="number"
                              step="0.01"
                              value={item.mrp_pack || ""}
                              onChange={(e) =>
                                handleItemFieldChange(
                                  item.id,
                                  "mrp_pack",
                                  e.target.value
                                )
                              }
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  document.getElementById(`total-${item.id}`)?.focus({ preventScroll: true });
                                }
                              }}
                              placeholder="₹"
                              className="h-8 w-28 text-xs text-center"
                            />
                          </TableCell>
                          <TableCell className="text-center font-mono text-xs text-muted-foreground">
                            {mrpPack && units ? `₹${mrpUnit.toFixed(2)}` : "-"}
                          </TableCell>
                          <TableCell>
                            <Input
                              id={`total-${item.id}`}
                              type="number"
                              step="0.01"
                              value={item.total_amount || ""}
                              onChange={(e) =>
                                handleItemFieldChangeWithCalc(
                                  item.id,
                                  "total_amount",
                                  e.target.value
                                )
                              }
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  if (index === purchaseItems.length - 1) {
                                    handleAddNewRow();
                                  } else {
                                    document.querySelector(`[data-testid="item-name-${index + 1}"]`)?.focus({ preventScroll: true });
                                  }
                                }
                              }}
                              placeholder="₹"
                              className="h-8 w-28 text-xs text-center "
                            />
                          </TableCell>
                          <TableCell>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              onClick={() => handleRemoveItem(item.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}

                    {purchaseItems.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={15}
                          className="text-center py-8 text-muted-foreground"
                        >
                          <Package className="w-8 h-8 mx-auto mb-2 opacity-50" />
                          No items. Click "Add Item" to add a row.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
            </div>

            {/* Hint for unit-based system */}
            <p className="text-xs text-muted-foreground bg-muted/30 p-2 rounded">
              💡 <strong>Tip:</strong> Enter Qty and either Rate(Pack) OR Total
              - the other will auto-calculate. Salt, HSN, Batch, Expiry are
              optional.
            </p>

            {/* Action Buttons - Add Item always visible */}
            <div className="flex items-center justify-between pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleAddNewRow}
                data-testid="add-item-btn"
              >
                <Plus className="h-4 w-4 mr-1" /> Add Item
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleCancelNewPurchase}>
                  Cancel
                </Button>
                <Button
                  onClick={handleSubmitPurchase}
                  disabled={
                    submitting ||
                    purchaseItems.filter((i) => i.product_name).length === 0
                  }
                  className="btn-primary"
                  data-testid="submit-purchase-btn"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <div className="flex items-center gap-2">
                       <Save className="w-4 h-4" />
                       <span>{editingPurchaseId ? "Update Purchase" : "Save Purchase"}</span>
                       <kbd className="hidden sm:inline-block ml-1 opacity-70 text-[9px] font-mono border border-white/20 px-1 rounded">
                         {getOS() === 'mac' ? '⌘Enter' : 'Ctrl+Enter'}
                       </kbd>
                    </div>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Edit Existing Purchase Modal */}
      {/* {editingPurchase && (
        <Dialog
          open={!!editingPurchase}
          onOpenChange={() => setEditingPurchase(null)}
        >
          <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
            <DialogHeader className="flex-shrink-0">
              <DialogTitle>
                Edit Purchase -{" "}
                {editingPurchase.invoice_no || editingPurchase.id.slice(0, 8)}
              </DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto space-y-4 pt-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Supplier</Label>
                  <Select
                    value={editingPurchase.supplier_id}
                    onValueChange={(v) => {
                      const supplier = suppliers.find((s) => s.id === v);
                      setEditingPurchase((prev) => ({
                        ...prev,
                        supplier_id: v,
                        supplier_name: supplier?.name,
                      }));
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {suppliers.map((supplier) => (
                        <SelectItem key={supplier.id} value={supplier.id}>
                          {supplier.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Invoice Number</Label>
                  <Input
                    value={editingPurchase.invoice_no || ""}
                    onChange={(e) =>
                      setEditingPurchase((prev) => ({
                        ...prev,
                        invoice_no: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Purchase Date</Label>
                  <Input
                    type="date"
                    value={editingPurchase.purchase_date || ""}
                    onChange={(e) =>
                      setEditingPurchase((prev) => ({
                        ...prev,
                        purchase_date: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>

              <div className="border border-border rounded-lg overflow-hidden">
                  <Table wrapperClassName="h-[400px]">
                    <TableHeader className="sticky top-0 bg-muted/95 backdrop-blur z-[50]">
                      <TableRow>
                        <TableHead>Product Name</TableHead>
                        <TableHead>Batch</TableHead>
                        <TableHead>Expiry</TableHead>
                        <TableHead className="text-center">Packs</TableHead>
                        <TableHead className="text-center">
                          Units/Pack
                        </TableHead>
                        <TableHead className="text-center">
                          Pack Price
                        </TableHead>
                        <TableHead className="text-center">MRP/Unit</TableHead>
                        <TableHead className="text-center">
                          Total Units
                        </TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {editingPurchase.items.map((item, idx) => {
                        const packQty = parseInt(item.pack_quantity) || 1;
                        const unitsPerPack = parseInt(item.units_per_pack) || 1;
                        const packPrice = parseFloat(item.pack_price) || 0;
                        const totalUnits = packQty * unitsPerPack;
                        const totalPrice = packQty * packPrice;

                        return (
                          <TableRow
                            key={idx}
                            className={`${
                              priceAlerts[item.id] ? "animate-row-alert" : ""
                            }`}
                          >
                            <TableCell>
                              <Input
                                value={item.product_name}
                                onChange={(e) => {
                                  const items = [...editingPurchase.items];
                                  items[idx] = {
                                    ...items[idx],
                                    product_name: e.target.value,
                                  };
                                  setEditingPurchase((prev) => ({
                                    ...prev,
                                    items,
                                  }));
                                }}
                                className="h-8 text-xs"
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                value={item.batch_no}
                                onChange={(e) => {
                                  const items = [...editingPurchase.items];
                                  items[idx] = {
                                    ...items[idx],
                                    batch_no: e.target.value,
                                  };
                                  setEditingPurchase((prev) => ({
                                    ...prev,
                                    items,
                                  }));
                                }}
                                className="h-8 text-xs w-20"
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                type="date"
                                value={item.expiry_date}
                                onChange={(e) => {
                                  const items = [...editingPurchase.items];
                                  items[idx] = {
                                    ...items[idx],
                                    expiry_date: e.target.value,
                                  };
                                  setEditingPurchase((prev) => ({
                                    ...prev,
                                    items,
                                  }));
                                }}
                                className="h-8 text-xs"
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                value={item.pack_quantity}
                                onChange={(e) => {
                                  const items = [...editingPurchase.items];
                                  items[idx] = {
                                    ...items[idx],
                                    pack_quantity: e.target.value,
                                  };
                                  setEditingPurchase((prev) => ({
                                    ...prev,
                                    items,
                                  }));
                                }}
                                className="h-8 text-xs w-16 text-center"
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                value={item.units_per_pack}
                                onChange={(e) => {
                                  const items = [...editingPurchase.items];
                                  items[idx] = {
                                    ...items[idx],
                                    units_per_pack: e.target.value,
                                  };
                                  setEditingPurchase((prev) => ({
                                    ...prev,
                                    items,
                                  }));
                                }}
                                className="h-8 text-xs w-16 text-center"
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                step="0.01"
                                value={item.pack_price}
                                onChange={(e) => {
                                  const items = [...editingPurchase.items];
                                  items[idx] = {
                                    ...items[idx],
                                    pack_price: e.target.value,
                                  };
                                  setEditingPurchase((prev) => ({
                                    ...prev,
                                    items,
                                  }));
                                }}
                                onBlur={() => checkPriceHistorySilent(item.id, item.product_name, item.pack_price)}
                                className={`h-8 text-xs w-20 text-center ${
                                  priceAlerts[item.id]
                                    ? "border-yellow-500 bg-yellow-500/10"
                                    : ""
                                }`}
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                step="0.01"
                                value={item.mrp_per_unit}
                                onChange={(e) => {
                                  const items = [...editingPurchase.items];
                                  items[idx] = {
                                    ...items[idx],
                                    mrp_per_unit: e.target.value,
                                  };
                                  setEditingPurchase((prev) => ({
                                    ...prev,
                                    items,
                                  }));
                                }}
                                className="h-8 text-xs w-20 text-center"
                              />
                            </TableCell>
                            <TableCell className="text-center font-mono font-medium text-primary">
                              {totalUnits}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              ₹{totalPrice.toFixed(2)}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setEditingPurchase(null)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSaveEditPurchase}
                  disabled={submitting}
                  className="btn-primary"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save Changes"
                  )}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )} */}

      {/* Search and Filters */}
      {editingPurchaseId === null && (
        <>
          <Card className="p-4">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search purchases by supplier, invoice..."
                    className="pl-10"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Select
                  value={filterSupplier}
                  onValueChange={setFilterSupplier}
                >
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Filter by supplier" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Suppliers</SelectItem>
                    {suppliers.map((supplier) => (
                      <SelectItem key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="date"
                  placeholder="Start date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-40"
                />
                <Input
                  type="date"
                  placeholder="End date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-40"
                />
                {(searchQuery ||
                  (filterSupplier && filterSupplier !== "all") ||
                  startDate ||
                  endDate) && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSearchQuery("");
                      setFilterSupplier("all");
                      setStartDate("");
                      setEndDate("");
                    }}
                  >
                    Clear
                  </Button>
                )}
              </div>
            </div>
          </Card>

          {/* Purchases Table */}
          <Card className="data-table">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]"></TableHead>
                  <TableHead>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setSortBy("purchase_date");
                        setSortOrder(
                          sortBy === "purchase_date" && sortOrder === "desc"
                            ? "asc"
                            : "desc"
                        );
                      }}
                    >
                      Date <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                  </TableHead>
                  <TableHead>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setSortBy("supplier_name");
                        setSortOrder(
                          sortBy === "supplier_name" && sortOrder === "desc"
                            ? "asc"
                            : "desc"
                        );
                      }}
                      className="h-auto p-0 font-medium hover:bg-transparent"
                    >
                      Supplier <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                  </TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead className="text-right">
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setSortBy("total_amount");
                        setSortOrder(
                          sortBy === "total_amount" && sortOrder === "desc"
                            ? "asc"
                            : "desc"
                        );
                      }}
                      className="h-auto p-0 font-medium hover:bg-transparent"
                    >
                      Amount <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                  </TableHead>
                  <TableHead className="text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchases.map((purchase) => (
                  <>
                    <TableRow
                      key={purchase.id}
                      id={`record-${purchase.id}`}
                      className="cursor-pointer"
                      onClick={() =>
                        setExpandedPurchase(
                          expandedPurchase === purchase.id ? null : purchase.id
                        )
                      }
                    >
                      <TableCell>
                        {expandedPurchase === purchase.id ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatDate(
                          purchase.purchase_date ||
                            purchase.created_at?.slice(0, 10)
                        )}
                      </TableCell>
                      <TableCell className="font-medium">
                        {purchase.supplier_name}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {purchase.invoice_no || "-"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {purchase.items?.length || 0} items
                      </TableCell>
                      <TableCell className="text-right font-mono text-primary">
                        ₹{purchase.total_amount?.toFixed(2)}
                      </TableCell>
                      <TableCell
                        className="text-center"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex justify-center gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-primary"
                            onClick={() =>
                              handleGeneratePurchasePdf(purchase.id)
                            }
                            data-testid={`pdf-purchase-${purchase.id}`}
                          >
                            <FileText className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => handleStartEditPurchase(purchase)}
                            data-testid={`edit-purchase-${purchase.id}`}
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-destructive"
                            onClick={() =>
                              setDeleteDialog({ open: true, purchase })
                            }
                            data-testid={`delete-purchase-${purchase.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    {expandedPurchase === purchase.id && (
                      <TableRow className="bg-muted/30">
                        <TableCell colSpan={7} className="p-4">
                          <div className="rounded-lg border border-border overflow-hidden">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Product</TableHead>
                                  <TableHead>Batch</TableHead>
                                  <TableHead>Expiry</TableHead>
                                  <TableHead className="text-center">
                                    Packs
                                  </TableHead>
                                  <TableHead className="text-center">
                                    Units/Pack
                                  </TableHead>
                                  <TableHead className="text-center">
                                    Total Units
                                  </TableHead>
                                  <TableHead className="text-center">
                                    Cost/Unit
                                  </TableHead>
                                  <TableHead className="text-center">
                                    MRP/Unit
                                  </TableHead>
                                  <TableHead className="text-right">
                                    Total
                                  </TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {purchase.items?.map((item, idx) => {
                                  const packQty =
                                    item.pack_quantity || item.quantity || 1;
                                  const unitsPerPack = item.units_per_pack || 1;
                                  const totalUnits =
                                    item.total_units || packQty * unitsPerPack;
                                  const costPerUnit =
                                    item.price_per_unit ||
                                    item.purchase_price ||
                                    0;
                                  const mrpPerUnit =
                                    item.mrp_per_unit || item.mrp || 0;
                                  const packPrice =
                                    item.pack_price ||
                                    costPerUnit * unitsPerPack;
                                  const total =
                                    item.item_total || packQty * packPrice;

                                  return (
                                    <TableRow key={idx}>
                                      <TableCell className="font-medium">
                                        {item.product_name}
                                      </TableCell>
                                      <TableCell>{item.batch_no}</TableCell>
                                      <TableCell>{item.expiry_date}</TableCell>
                                      <TableCell className="text-center">
                                        {packQty}
                                      </TableCell>
                                      <TableCell className="text-center">
                                        {unitsPerPack}
                                      </TableCell>
                                      <TableCell className="text-center font-medium text-primary">
                                        {totalUnits}
                                      </TableCell>
                                      <TableCell className="text-center">
                                        ₹{costPerUnit.toFixed(2)}
                                      </TableCell>
                                      <TableCell className="text-center">
                                        ₹{mrpPerUnit.toFixed(2)}
                                      </TableCell>
                                      <TableCell className="text-right font-mono">
                                        ₹{total.toFixed(2)}
                                      </TableCell>
                                    </TableRow>
                                  );
                                })}
                              </TableBody>
                            </Table>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                ))}
                {purchases.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="text-center py-8 text-muted-foreground"
                    >
                      No purchases found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>

          {/* Pagination */}
          {pagination.total_pages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Showing {(pagination.page - 1) * pagination.limit + 1} to{" "}
                {Math.min(pagination.page * pagination.limit, pagination.total)}{" "}
                of {pagination.total} purchases
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fetchPurchases(pagination.page - 1)}
                  disabled={pagination.page <= 1}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="flex items-center px-3 text-sm">
                  Page {pagination.page} of {pagination.total_pages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fetchPurchases(pagination.page + 1)}
                  disabled={pagination.page >= pagination.total_pages}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* salt dialog  */}
      <Dialog
        open={saltDialog.open}
        onOpenChange={(open) => {
          if (!open) {
            const idToFocus = saltDialog.itemId;
            setTimeout(() => document.getElementById(`add-salt-${idToFocus}`)?.focus(), 50);
          }
          setSaltDialog((prev) => ({ ...prev, open }));
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Salt Composition</DialogTitle>
          </DialogHeader>

          <textarea
            value={saltDialog.value}
            onChange={(e) =>
              setSaltDialog((prev) => ({
                ...prev,
                value: e.target.value,
              }))
            }
            rows={6}
            className="w-full border border-border rounded-md p-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="Enter full salt composition..."
          />

          <div className="flex justify-end gap-2 mt-4">
            <Button
              variant="outline"
              onClick={() => {
                const idToFocus = saltDialog.itemId;
                setSaltDialog({ open: false, itemId: null, value: "" });
                setTimeout(() => document.getElementById(`add-salt-${idToFocus}`)?.focus(), 50);
              }}
            >
              Cancel
            </Button>
            <Button
              className="btn-primary"
              onClick={() => {
                const idToFocus = saltDialog.itemId;
                handleItemFieldChange(
                  idToFocus,
                  "salt_composition",
                  saltDialog.value
                );
                setSaltDialog({ open: false, itemId: null, value: "" });
                setTimeout(() => document.getElementById(`add-salt-${idToFocus}`)?.focus(), 50);
              }}
            >
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog
        open={deleteDialog.open}
        onOpenChange={(open) =>
          setDeleteDialog({
            open,
            purchase: open ? deleteDialog.purchase : null,
          })
        }
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Purchase</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this purchase from{" "}
              {deleteDialog.purchase?.supplier_name}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleDeletePurchase(false)}
              className="bg-destructive hover:bg-destructive/90"
            >
              Delete Purchase Only
            </AlertDialogAction>
            <AlertDialogAction
              onClick={() => handleDeletePurchase(true)}
              className="bg-destructive hover:bg-destructive/90"
            >
              Delete with Inventory
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Price History Comparison Dialog */}
      <Dialog
        open={priceHistoryDialog.open}
        onOpenChange={(open) => {
          if (!open) {
            const idToFocus = priceHistoryDialog.itemId;
            setTimeout(() => document.getElementById(`price-history-${idToFocus}`)?.focus(), 50);
          }
          setPriceHistoryDialog({ open, itemId: null, data: null });
        }}
      >
        <DialogContent className="max-w-lg">
          {priceHistoryDialog?.data?.type === "higher" && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-yellow-600">
                  <span className="bg-yellow-500 text-yellow-950 rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold">
                    !
                  </span>
                  Higher Price Alert
                </DialogTitle>
                <DialogDescription>
                  You're paying more than your previous purchases for this
                  product.
                </DialogDescription>
              </DialogHeader>

              {priceHistoryDialog.data && (
                <div className="space-y-4">
                  {/* Current vs Best Price Summary */}
                  <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
                    <p className="text-sm text-muted-foreground mb-2">
                      <div className="flex items-center gap-2">
                        <strong>
                          {priceHistoryDialog.data.searched_product_name}
                        </strong>
                        <ArrowRight className="w-4 h-4 text-muted-foreground" />
                        <strong>
                          {priceHistoryDialog.data.matched_product_name}
                        </strong>
                      </div>
                    </p>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-muted-foreground">
                          Current Rate
                        </p>
                        <p className="text-lg font-bold text-yellow-600">
                          ₹
                          {Number(
                            priceHistoryDialog?.data?.currentPrice || 0
                          ).toFixed(2)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">
                          Best Historical Price
                        </p>
                        <p className="text-lg font-bold text-primary">
                          ₹
                          {Number(
                            priceHistoryDialog?.data?.cheapestPrice || 0
                          ).toFixed(2)}
                        </p>
                      </div>
                    </div>
                    <p className="text-sm text-yellow-600 mt-2 font-medium">
                      You're paying ₹
                      {Number(
                        priceHistoryDialog?.data?.priceDifference || 0
                      ).toFixed(2)}{" "}
                      more per pack!
                    </p>
                  </div>

                  {/* Cheaper Suppliers List */}
                  <div>
                    <h4 className="text-sm font-semibold mb-2">
                      Cheaper Options (Ranked by Price)
                    </h4>
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {priceHistoryDialog.data.cheaperOptions.map(
                        (option, idx) => (
                          <div
                            key={idx}
                            className={`flex items-center justify-between p-3 rounded-lg border ${
                              idx === 0
                                ? "bg-primary/10 border-primary/30"
                                : "bg-muted/50 border-border"
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <span
                                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                                  idx === 0
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-muted-foreground/20 text-muted-foreground"
                                }`}
                              >
                                {idx + 1}
                              </span>
                              <div>
                                <p className="font-medium text-sm">
                                  {option.supplier_name}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {option.purchase_date?.slice(0, 10)} •{" "}
                                  {option.invoice_no || "No Invoice"}
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p
                                className={`font-bold ${idx === 0 ? "text-primary" : "text-foreground"}`}
                              >
                                ₹{option.pack_price.toFixed(2)}
                              </p>
                              <p className="text-xs text-green-600">
                                Save ₹
                                {(
                                  priceHistoryDialog.data.currentPrice -
                                  option.pack_price
                                ).toFixed(2)}
                              </p>
                            </div>
                          </div>
                        )
                      )}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2 pt-2">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() =>
                        setPriceHistoryDialog({
                          open: false,
                          itemId: null,
                          data: null,
                        })
                      }
                    >
                      Keep Current Price
                    </Button>
                    <Button
                      className="flex-1"
                      onClick={() => {
                        // Apply the cheapest price
                        const cheapest =
                          priceHistoryDialog.data.cheaperOptions[0];
                        if (cheapest && priceHistoryDialog.itemId) {
                          handleItemFieldChangeWithCalc(
                            priceHistoryDialog.itemId,
                            "rate_pack",
                            cheapest.pack_price.toString()
                          );
                          // Clear the alert
                          setPriceAlerts((prev) => {
                            const updated = { ...prev };
                            delete updated[priceHistoryDialog.itemId];
                            return updated;
                          });
                        }
                        setPriceHistoryDialog({
                          open: false,
                          itemId: null,
                          data: null,
                        });
                        toast.success(
                          `Applied best price: ₹${cheapest.pack_price.toFixed(2)}`
                        );
                      }}
                    >
                      Apply Best Price
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
          {priceHistoryDialog?.data?.type === "cheapest" && (
            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
              <p className="font-semibold text-green-600">
                ✅ You are already at the best historical price!
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Current Rate: ₹
                {priceHistoryDialog.data.current_price.toFixed(2)}
              </p>
            </div>
          )}

          {priceHistoryDialog?.data?.type === "no-history" && (
            <div className="bg-muted/40 border border-border rounded-lg p-4">
              <p className="font-semibold text-muted-foreground">
                No past price comparison available.
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                This product has no previous purchase history yet.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
