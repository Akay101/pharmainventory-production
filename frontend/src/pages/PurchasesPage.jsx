import { useState, useEffect, useCallback, useRef } from "react";
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
} from "lucide-react";
import { toast } from "sonner";

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
  const [purchaseItems, setPurchaseItems] = useState([]);
  const [newItemRow, setNewItemRow] = useState(null);
  const [searchMedicine, setSearchMedicine] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Edit existing purchase
  const [editingPurchase, setEditingPurchase] = useState(null);

  // Expanded view
  const [expandedPurchase, setExpandedPurchase] = useState(null);

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

  // Refs for keyboard navigation
  const productInputRef = useRef(null);

  // State for dropdown keyboard navigation
  const [highlightedSuggestionIndex, setHighlightedSuggestionIndex] =
    useState(-1);
  const [activeItemId, setActiveItemId] = useState(null); // Track which item's dropdown is active

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
  const [sortBy, setSortBy] = useState("created_at");
  const [sortOrder, setSortOrder] = useState("desc");

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

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Alt+N - New purchase
      if (e.altKey && e.key === "n") {
        e.preventDefault();
        handleStartNewPurchase();
      }
      // Alt+S - Save purchase
      if (e.altKey && e.key === "s" && showNewPurchase) {
        e.preventDefault();
        handleSubmitPurchase();
      }
      // Escape - Cancel
      if (e.key === "Escape") {
        if (newItemRow) {
          handleCancelAddItem();
        } else if (showNewPurchase) {
          handleCancelNewPurchase();
        }
      }
      // Alt+A - Add item row
      if (e.altKey && e.key === "a" && showNewPurchase) {
        e.preventDefault();
        handleAddNewRow();
      }
      // Alt+? - Show shortcuts
      if (e.altKey && e.key === "/") {
        e.preventDefault();
        setShowShortcuts(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showNewPurchase, newItemRow]);

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
        try {
          const response = await axios.get(
            `${API}/medicines/search?q=${encodeURIComponent(searchMedicine)}&limit=20`
          );
          let medicines = response.data.medicines || [];

          // Sort results: exact match first, then starts with, then contains
          const searchLower = searchMedicine.toLowerCase();
          medicines.sort((a, b) => {
            const aName = (a.name || "").toLowerCase();
            const bName = (b.name || "").toLowerCase();
            const aComp = (a.composition || "").toLowerCase();
            const bComp = (b.composition || "").toLowerCase();

            // Exact match
            if (aName === searchLower) return -1;
            if (bName === searchLower) return 1;

            // Starts with search term (name)
            const aStartsName = aName.startsWith(searchLower);
            const bStartsName = bName.startsWith(searchLower);
            if (aStartsName && !bStartsName) return -1;
            if (!aStartsName && bStartsName) return 1;

            // Starts with search term (composition/salt)
            const aStartsComp = aComp.startsWith(searchLower);
            const bStartsComp = bComp.startsWith(searchLower);
            if (aStartsComp && !bStartsComp) return -1;
            if (!aStartsComp && bStartsComp) return 1;

            // Contains search term
            const aContainsName = aName.includes(searchLower);
            const bContainsName = bName.includes(searchLower);
            if (aContainsName && !bContainsName) return -1;
            if (!aContainsName && bContainsName) return 1;

            return 0;
          });

          setMedicineSuggestions(medicines.slice(0, 10));
          setShowSuggestions(true);
          setHighlightedSuggestionIndex(-1); // Reset highlight when suggestions change
        } catch (error) {
          console.error("Medicine search error:", error);
        }
      } else {
        setMedicineSuggestions([]);
        setShowSuggestions(false);
        setHighlightedSuggestionIndex(-1);
      }
    };

    const debounce = setTimeout(searchMedicines, 300);
    return () => clearTimeout(debounce);
  }, [searchMedicine]);

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

  // ============ NEW PURCHASE - INLINE TABLE ============

  const handleStartNewPurchase = () => {
    setShowNewPurchase(true);
    // Start with one default empty row
    const defaultRow = { ...emptyItem, id: `temp-${Date.now()}` };
    setPurchaseItems([defaultRow]);
    setSelectedSupplier("");
    setInvoiceNo("");
    setNewItemRow(null);
  };

  const handleCancelNewPurchase = () => {
    setShowNewPurchase(false);
    setPurchaseItems([]);
    setSelectedSupplier("");
    setInvoiceNo("");
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
  };

  const buildSaltComposition = (medicine) => {
    return [medicine?.short_composition1, medicine?.short_composition2]
      .map((v) => v?.trim())
      .filter(Boolean)
      .join(", ");
  };

  // Handle selecting medicine from suggestions for an item row
  const handleSelectMedicineForItem = (itemId, medicine) => {
    const pricePerUnit = parseFloat(medicine["price(₹)"]) || 0;
    const packSizeMatch = medicine.pack_size?.match(/(\d+)/);
    const unitsPerPack = packSizeMatch ? parseInt(packSizeMatch[1]) : 1;

    const mrpPack = pricePerUnit * unitsPerPack;
    const ratePack = mrpPack * 0.7;

    setPurchaseItems((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;

        const qty = parseInt(item.quantity) || 1;
        return {
          ...item,
          product_id: medicine.id || `med-${Date.now()}`,
          product_name: medicine.name,
          manufacturer: medicine.manufacturer || "",
          salt_composition: buildSaltComposition(medicine),
          units: String(unitsPerPack),
          rate_pack: ratePack.toFixed(2),
          mrp_pack: mrpPack.toFixed(2),
          total_amount: (qty * ratePack).toFixed(2),
        };
      })
    );

    setSearchMedicine("");
    setMedicineSuggestions([]);
    setShowSuggestions(false);
  };

  const handleSubmitPurchase = async () => {
    if (!selectedSupplier) {
      toast.error("Please select a supplier");
      return;
    }

    // Filter out empty rows (rows without product_name)
    const validItems = purchaseItems.filter(
      (item) => item.product_name && item.product_name.trim() !== ""
    );

    if (validItems.length === 0) {
      toast.error("Please add at least one item with a product name");
      return;
    }

    const supplier = suppliers.find((s) => s.id === selectedSupplier);

    setSubmitting(true);
    try {
      await axios.post(`${API}/purchases`, {
        supplier_id: selectedSupplier,
        supplier_name: supplier?.name || "Unknown",
        invoice_no: invoiceNo || null,
        items: validItems.map(
          ({
            _editing,
            id,
            total_units,
            rate_unit,
            final_amount,
            total_amount,
            ...item
          }) => {
            const unitsPerPack =
              parseInt(item.units) || parseInt(item.units_per_pack) || 1;
            const mrpPack = parseFloat(item.mrp_pack) || 0;
            // Calculate mrp_per_unit from mrp_pack if not directly available
            const mrpPerUnit =
              mrpPack > 0 && unitsPerPack > 0
                ? mrpPack / unitsPerPack
                : parseFloat(item.mrp_unit) ||
                  parseFloat(item.mrp_per_unit) ||
                  0;

            return {
              product_id: item.product_id || `prod-${Date.now()}`,
              product_name: item.product_name,
              batch_no: item.batch_no || null,
              expiry_date: item.expiry_date || null,
              manufacturer: item.manufacturer || null,
              salt_composition: item.salt_composition || null,
              pack_type: item.pack_type || "Strip",
              pack_quantity:
                parseInt(item.quantity) || parseInt(item.pack_quantity) || 1,
              units_per_pack: unitsPerPack,
              pack_price:
                parseFloat(item.rate_pack) || parseFloat(item.pack_price) || 0,
              mrp_per_unit: mrpPerUnit,
              mrp_pack: mrpPack,
              hsn_no: item.hsn_no || null,
            };
          }
        ),
      });

      toast.success("Purchase recorded! Items added to inventory (in units)");
      clearDraft();
      handleCancelNewPurchase();
      await fetchPurchases(pagination.page);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to record purchase");
    } finally {
      setSubmitting(false);
    }
  };

  // ============ EDIT EXISTING PURCHASE ============

  const handleStartEditPurchase = (purchase) => {
    setEditingPurchase({
      ...purchase,
      items: purchase.items.map((item, idx) => ({
        ...item,
        id: item.id || `existing-${idx}`,
        pack_quantity: item.pack_quantity || item.quantity || 1,
        units_per_pack: item.units_per_pack || 1,
        pack_price:
          item.pack_price ||
          item.purchase_price * (item.units_per_pack || 1) ||
          0,
        mrp_per_unit: item.mrp_per_unit || item.mrp || 0,
      })),
    });
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
                Alt + N
              </kbd>
            </div>
            <div className="flex justify-between items-center p-2 bg-muted/30 rounded">
              <span>Add Item</span>
              <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono">
                Alt + A
              </kbd>
            </div>
            <div className="flex justify-between items-center p-2 bg-muted/30 rounded">
              <span>Save Purchase</span>
              <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono">
                Alt + S
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
            New (Alt+N)
          </Button>
        </div>
      </div>

      {/* New Purchase - Inline Table Entry with UNIT-BASED fields */}
      {showNewPurchase && (
        <Card
          className="border-primary/30 bg-primary/5"
          data-testid="new-purchase-form"
        >
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Package className="w-5 h-5" />
                New Purchase •{" "}
                <kbd className="px-1 bg-muted rounded text-xs font-mono">
                  Enter
                </kbd>{" "}
                to save item
              </CardTitle>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleCancelNewPurchase}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Supplier & Invoice */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
            <div
              className="border border-border rounded-lg relative"
              style={{ overflow: "visible" }}
            >
              <div
                className="max-h-[400px] overflow-x-auto"
                style={{ overflowY: "visible" }}
              >
                <Table>
                  <TableHeader className="sticky top-0 bg-muted/95 backdrop-blur z-10">
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
                        Total *
                      </TableHead>
                      <TableHead className="w-[80px] text-center font-bold text-foreground">
                        MRP(Pack)
                      </TableHead>
                      <TableHead className="w-[70px] text-center font-bold text-foreground">
                        MRP/Unit
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
                          className="bg-primary/5"
                        >
                          <TableCell
                            className="relative"
                            style={{ overflow: "visible" }}
                          >
                            <Input
                              ref={
                                index === purchaseItems.length - 1
                                  ? productInputRef
                                  : null
                              }
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
                              onBlur={() =>
                                setTimeout(() => {
                                  setShowSuggestions(false);
                                  setActiveItemId(null);
                                  setHighlightedSuggestionIndex(-1);
                                }, 200)
                              }
                              onKeyDown={(e) => {
                                if (
                                  !showSuggestions ||
                                  medicineSuggestions.length === 0
                                )
                                  return;

                                if (e.key === "ArrowDown") {
                                  e.preventDefault();
                                  setHighlightedSuggestionIndex((prev) =>
                                    prev < medicineSuggestions.length - 1
                                      ? prev + 1
                                      : prev
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
                                  handleSelectMedicineForItem(
                                    item.id,
                                    medicineSuggestions[
                                      highlightedSuggestionIndex
                                    ]
                                  );
                                  setHighlightedSuggestionIndex(-1);
                                } else if (e.key === "Escape") {
                                  setShowSuggestions(false);
                                  setHighlightedSuggestionIndex(-1);
                                }
                              }}
                              placeholder="Search..."
                              className="h-8 text-xs"
                              data-testid={`item-name-${index}`}
                              autoComplete="off"
                            />
                            {/* Search Suggestions Dropdown */}
                            {showSuggestions &&
                              activeItemId === item.id &&
                              medicineSuggestions.length > 0 && (
                                <div
                                  className="fixed bg-card border border-border rounded-lg shadow-2xl max-h-64 overflow-y-auto"
                                  style={{
                                    width: "400px",
                                    zIndex: 9999,
                                    marginTop: "4px",
                                  }}
                                >
                                  {medicineSuggestions.map((medicine, idx) => (
                                    <div
                                      key={idx}
                                      className={`p-3 cursor-pointer border-b border-border last:border-0 ${
                                        highlightedSuggestionIndex === idx
                                          ? "bg-primary/20"
                                          : "hover:bg-primary/10"
                                      }`}
                                      onMouseDown={(e) => {
                                        e.preventDefault();
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
                                      <div className="font-medium text-sm">
                                        {medicine.name}
                                      </div>
                                      <div className="text-xs text-muted-foreground">
                                        <span>{medicine.manufacturer}</span>
                                        {medicine.composition && (
                                          <span className="ml-2 text-primary/70">
                                            (
                                            {medicine.composition?.slice(0, 30)}
                                            ...)
                                          </span>
                                        )}
                                      </div>
                                      <div className="text-xs text-primary font-mono mt-1">
                                        ₹{medicine["price(₹)"]} •{" "}
                                        {medicine.pack_size}
                                      </div>
                                    </div>
                                  ))}
                                </div>
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
                            <Input
                              value={item.salt_composition || ""}
                              onChange={(e) =>
                                handleItemFieldChange(
                                  item.id,
                                  "salt_composition",
                                  e.target.value
                                )
                              }
                              placeholder="Salt"
                              className="h-8 text-xs"
                            />
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
                              value={item.batch_no || ""}
                              onChange={(e) =>
                                handleItemFieldChange(
                                  item.id,
                                  "batch_no",
                                  e.target.value
                                )
                              }
                              placeholder="Batch"
                              className="h-8 text-xs"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={item.hsn_no || ""}
                              onChange={(e) =>
                                handleItemFieldChange(
                                  item.id,
                                  "hsn_no",
                                  e.target.value
                                )
                              }
                              placeholder="HSN"
                              className="h-8 text-xs"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="date"
                              value={item.expiry_date || ""}
                              onChange={(e) =>
                                handleItemFieldChange(
                                  item.id,
                                  "expiry_date",
                                  e.target.value
                                )
                              }
                              className="h-8 text-xs"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              value={item.quantity || item.pack_quantity || ""}
                              onChange={(e) =>
                                handleItemFieldChangeWithCalc(
                                  item.id,
                                  "quantity",
                                  e.target.value
                                )
                              }
                              placeholder="1"
                              className="h-8 text-xs text-center w-14"
                              min="1"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              value={item.units || item.units_per_pack || ""}
                              onChange={(e) =>
                                handleItemFieldChange(
                                  item.id,
                                  "units",
                                  e.target.value
                                )
                              }
                              placeholder="1"
                              className="h-8 text-xs text-center w-14"
                              min="1"
                            />
                          </TableCell>
                          <TableCell className="text-center font-mono text-xs font-medium text-primary">
                            {totalUnits}
                          </TableCell>
                          <TableCell>
                            <Input
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
                              placeholder="₹"
                              className="h-8 text-xs text-center w-16"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
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
                              placeholder="₹"
                              className="h-8 text-xs text-center w-16"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
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
                              placeholder="₹"
                              className="h-8 text-xs text-center w-16"
                            />
                          </TableCell>
                          <TableCell className="text-center font-mono text-xs text-muted-foreground">
                            {mrpPack && units ? `₹${mrpUnit.toFixed(2)}` : "-"}
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
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      Save Purchase
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Edit Existing Purchase Modal */}
      {editingPurchase && (
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
              <div className="grid grid-cols-2 gap-4">
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
              </div>

              <div className="border border-border rounded-lg">
                <div className="max-h-[40vh] overflow-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-muted/95 backdrop-blur z-10">
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
                          <TableRow key={idx}>
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
                                className="h-8 text-xs w-20 text-center"
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
      )}

      {/* Search and Filters */}
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
            <Select value={filterSupplier} onValueChange={setFilterSupplier}>
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
                    setSortBy("created_at");
                    setSortOrder(
                      sortBy === "created_at" && sortOrder === "desc"
                        ? "asc"
                        : "desc"
                    );
                  }}
                  className="h-auto p-0 font-medium hover:bg-transparent"
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
                    {purchase.created_at?.slice(0, 10)}
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
                                item.price_per_unit || item.purchase_price || 0;
                              const mrpPerUnit =
                                item.mrp_per_unit || item.mrp || 0;
                              const packPrice =
                                item.pack_price || costPerUnit * unitsPerPack;
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
            {Math.min(pagination.page * pagination.limit, pagination.total)} of{" "}
            {pagination.total} purchases
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
    </div>
  );
}
