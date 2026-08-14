import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams, useLocation } from "react-router-dom";
import { v4 as uuidv4 } from "uuid";
import { createPortal } from "react-dom";
import axios from "axios";
import { API, useAuth, getCookie } from "../App";
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
  History,
  ArrowRight,
  FileText,
  AlertCircle,
  CreditCard,
  CheckCircle2,
  Sparkles,
  SearchX,
  Info,
  Eye,
} from "lucide-react";
import { toast } from "sonner";
import PlanBadge from "../components/PlanBadge";
import Loader, { AiLoader } from "../components/Loader";
import { formatDate } from "./utils";
import CustomTooltip from "@/components/ui/CustomTooltip";
import { getOS } from "../hooks/useKeyboard";

const PACK_TYPES = ["Strip", "Bottle", "Tube", "Packet", "Box", "Unit"];

// [Issue #Suppliers] Premium Searchable & Infinite Scroll Dropdown
const SupplierSelector = ({
  selectedId,
  onSelect,
  knownSuppliers = [],
  placeholder = "Select Supplier",
  showAllOption = false,
  className = "",
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [suppliers, setSuppliers] = useState([]);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const dropdownRef = useRef(null);
  const scrollContainerRef = useRef(null);

  const fetchSuppliers = async (p = 1, s = "", append = false) => {
    if (loading) return;
    setLoading(true);
    try {
      const response = await axios.get(
        `${API}/suppliers?page=${p}&limit=20&search=${encodeURIComponent(s)}`
      );
      const data = response.data.suppliers || [];
      setSuppliers((prev) => (append ? [...prev, ...data] : data));
      setHasMore(data.length === 20);
      setPage(p);
    } catch (err) {
      console.error("Failed to fetch suppliers", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && suppliers.length === 0) {
      fetchSuppliers(1, search, false);
    }
    if (!isOpen) {
      setHighlightedIndex(-1);
    }
  }, [isOpen]);

  useEffect(() => {
    const delay = setTimeout(() => {
      if (isOpen) {
        fetchSuppliers(1, search, false);
        setHighlightedIndex(-1);
      }
    }, 300);
    return () => clearTimeout(delay);
  }, [search]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Keyboard navigation
  const handleKeyDown = (e) => {
    if (!isOpen) {
      if (e.key === "Enter" || e.key === "ArrowDown" || e.key === "ArrowUp") {
        setIsOpen(true);
      }
      return;
    }

    const maxIndex = suppliers.length - 1;
    const minIndex = showAllOption ? -1 : 0;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex((prev) => (prev < maxIndex ? prev + 1 : prev));
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > minIndex ? prev - 1 : prev));
        break;
      case "Enter":
        e.preventDefault();
        if (highlightedIndex === -1 && showAllOption) {
          onSelect({ id: "all", name: "All Suppliers" });
          setIsOpen(false);
        } else if (
          highlightedIndex >= 0 &&
          highlightedIndex < suppliers.length
        ) {
          onSelect(suppliers[highlightedIndex]);
          setIsOpen(false);
        }
        break;
      case "Escape":
        setIsOpen(false);
        break;
      case "Tab":
        setIsOpen(false);
        break;
    }
  };

  // Auto-scroll highlighted item into view
  useEffect(() => {
    if (highlightedIndex >= -1 && scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const highlightedElement = container.querySelector(
        `[data-index="${highlightedIndex}"]`
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
  }, [highlightedIndex]);

  // Combine local dropdown list with known suppliers from parent
  const allSuppliers = [...suppliers];
  if (Array.isArray(knownSuppliers)) {
    knownSuppliers.forEach((ks) => {
      if (ks && ks.id && !allSuppliers.find((s) => s.id === ks.id)) {
        allSuppliers.push(ks);
      }
    });
  }

  const selectedSupplier = allSuppliers.find((s) => s.id === selectedId);

  return (
    <div
      className={`relative ${className}`}
      ref={dropdownRef}
      onKeyDown={handleKeyDown}
    >
      <div
        className={`flex h-10 w-full items-center justify-between rounded-xl border bg-background/50 backdrop-blur-sm px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer hover:border-primary/50 transition-all ${isOpen ? "border-primary ring-2 ring-primary/10" : "border-border/70"}`}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        tabIndex={0}
      >
        <span
          className={`truncate ${!selectedId || selectedId === "" ? "text-muted-foreground/60" : "font-semibold text-foreground"}`}
        >
          {selectedId === "all"
            ? "All Suppliers"
            : selectedSupplier?.name || placeholder}
        </span>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
        />
      </div>

      {isOpen && (
        <div className="absolute z-[100] mt-2 max-h-60 w-full overflow-hidden rounded-xl border border-border/80 bg-card/95 backdrop-blur-xl text-popover-foreground shadow-2xl animate-in fade-in zoom-in-95 duration-200">
          <div className="flex items-center border-b border-border/40 px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <input
              className="flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground/60 disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="Search suppliers..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          <div
            ref={scrollContainerRef}
            className="max-h-[200px] overflow-y-auto p-1 custom-scrollbar"
            onScroll={(e) => {
              const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
              if (
                scrollHeight - scrollTop <= clientHeight + 50 &&
                hasMore &&
                !loading
              ) {
                fetchSuppliers(page + 1, search, true);
              }
            }}
          >
            {showAllOption && (
              <div
                data-index="-1"
                className={`relative flex w-full cursor-default select-none items-center rounded-lg py-2.5 pl-9 pr-2 text-sm outline-none transition-colors ${highlightedIndex === -1 ? "bg-primary/10 text-primary font-medium" : selectedId === "all" ? "bg-primary/20 text-primary font-bold" : "text-foreground/80 hover:bg-primary/5"}`}
                onClick={() => {
                  onSelect({ id: "all", name: "All Suppliers" });
                  setIsOpen(false);
                }}
                onMouseEnter={() => setHighlightedIndex(-1)}
              >
                {selectedId === "all" && (
                  <Check className="absolute left-3 h-4 w-4 text-primary" />
                )}
                All Suppliers
              </div>
            )}
            {suppliers.map((s, idx) => (
              <div
                key={s.id}
                data-index={idx}
                className={`relative flex w-full cursor-default select-none items-center rounded-lg py-2 pl-9 pr-2 text-sm outline-none transition-colors ${highlightedIndex === idx ? "bg-primary/10 text-primary font-medium" : selectedId === s.id ? "bg-primary/20 text-primary font-bold" : "text-foreground/80 hover:bg-primary/5"}`}
                onClick={() => {
                  onSelect(s);
                  setIsOpen(false);
                }}
                onMouseEnter={() => setHighlightedIndex(idx)}
              >
                {selectedId === s.id && (
                  <Check className="absolute left-3 h-4 w-4 text-primary" />
                )}
                <div className="flex flex-col overflow-hidden">
                  <span className="truncate">{s.name}</span>
                  {s.phone && (
                    <span className="text-[10px] opacity-60 font-mono">
                      {s.phone}
                    </span>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="p-4 text-center">
                <Loader2 className="h-5 w-5 animate-spin text-primary mx-auto" />
              </div>
            )}
            {!loading && suppliers.length === 0 && (
              <div className="p-8 text-center text-xs text-muted-foreground italic">
                No suppliers match "{search}"
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// Equal-sized SVG Icons for Payment Modes
const RupeeCircleIcon = ({ className = "w-4 h-4" }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M8.5 9.99984H15.5M8.5 6.5H15.5M14 18.0002L8.5 13.5002L10 13.5C14.4447 13.5 14.4447 6.5 10 6.5M22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12Z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const UpiIcon = ({ className = "w-4 h-4" }) => (
  <svg
    className={className}
    viewBox="0 0 120 60"
    xmlns="http://www.w3.org/2000/svg"
  >
    <rect width="120" height="60" rx="8" fill="#0F172A" />
    <path d="M95.678 42.9L110 29.835l-6.784-13.516z" fill="#097939" />
    <path d="M90.854 42.9l14.322-13.065-6.784-13.516z" fill="#ed752e" />
    <path
      d="M22.41 16.47l-6.03 21.475 21.407.15 5.88-21.625h5.427l-7.05 25.14c-.27.96-1.298 1.74-2.295 1.74H12.31c-1.664 0-2.65-1.3-2.2-2.9l6.724-23.98zm66.182-.15h5.427l-7.538 27.03h-5.58zM49.698 27.582l27.136-.15 1.81-5.707H51.054l1.658-5.256 29.4-.27c1.83-.017 2.92 1.4 2.438 3.167L81.78 29.49c-.483 1.766-2.36 3.197-4.19 3.197H53.316L50.454 43.8h-5.28z"
      fill="#FFFFFF"
    />
  </svg>
);

const CreditCardIcon = ({ className = "w-4 h-4" }) => (
  <svg
    className={className}
    viewBox="0 0 1024 1024"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M512 512m-480 0a480 480 0 1 0 960 0 480 480 0 1 0-960 0Z"
      fill="#F97316"
    />
    <path
      d="M224 364.8c0-25.6 19.2-44.8 51.2-44.8h480c25.6 0 51.2 19.2 51.2 44.8v288c0 25.6-19.2 44.8-51.2 44.8H275.2c-25.6 0-51.2-19.2-51.2-44.8V364.8z"
      fill="#FFFFFF"
    />
    <path d="M224 390.4h576v70.4h-576z" fill="#0F172A" />
    <path
      d="M633.6 608c0-12.8 12.8-25.6 25.6-25.6h70.4c12.8 0 25.6 12.8 25.6 25.6v25.6c0 12.8-12.8 25.6-25.6 25.6h-70.4c-12.8 0-25.6-12.8-25.6-25.6v-25.6z"
      fill="#F97316"
    />
  </svg>
);

const getPaymentModeIcon = (mode, sizeClass = "w-3.5 h-3.5") => {
  const m = String(mode || "").toLowerCase();
  if (m === "cash")
    return <RupeeCircleIcon className={`${sizeClass} text-emerald-500`} />;
  if (m === "upi") return <UpiIcon className={sizeClass} />;
  if (m === "card") return <CreditCardIcon className={sizeClass} />;
  return null;
};

export default function PurchasesPage() {
  // Data state
  const [purchases, setPurchases] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [medicineSuggestions, setMedicineSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const { user, settings } = useAuth();
  const [tabs, setTabs] = useState([]);
  const [activeTabId, setActiveTabId] = useState(null);

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
  const [isMouseOverSuggestions, setIsMouseOverSuggestions] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [processingRowId, setProcessingRowId] = useState(null);
  const [sparkleRowId, setSparkleRowId] = useState(null);

  // Payment Tracking State
  const [paymentStatus, setPaymentStatus] = useState("Unpaid");
  const [amountPaid, setAmountPaid] = useState("");
  const [paymentMode, setPaymentMode] = useState("");

  // Infinite scroll suggestion state
  const [suggestionPage, setSuggestionPage] = useState(1);
  const [hasMoreSuggestions, setHasMoreSuggestions] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  // Product Details Slideover Drawer State
  const [productSidebar, setProductSidebar] = useState({
    open: false,
    productName: "",
    itemId: null,
    activeTab: "batches", // "batches" or "history"
    loading: false,
    batches: [],
    history: [],
  });

  const handleOpenProductSidebar = async (productName, itemId = null) => {
    if (!productName || !productName.trim()) return;
    const cleanName = productName.trim();

    setProductSidebar({
      open: true,
      productName: cleanName,
      itemId,
      activeTab: "batches",
      loading: true,
      batches: [],
      history: [],
    });

    try {
      const token = localStorage.getItem("token");
      const headers = { Authorization: `Bearer ${token}` };
      const [batchesRes, historyRes] = await Promise.all([
        axios
          .get(
            `${API}/inventory/product-batches?product_name=${encodeURIComponent(cleanName)}`,
            { headers }
          )
          .then((r) => r.data)
          .catch(() => ({ batches: [] })),
        axios
          .get(
            `${API}/purchases/product-history?product_name=${encodeURIComponent(cleanName)}`,
            { headers }
          )
          .then((r) => r.data)
          .catch(() => ({ purchases: [] })),
      ]);

      setProductSidebar((prev) => ({
        ...prev,
        loading: false,
        batches: batchesRes.batches || [],
        history: historyRes.purchases || [],
      }));
    } catch (err) {
      console.error("Error fetching product sidebar details:", err);
      toast.error("Failed to load product details");
      setProductSidebar((prev) => ({ ...prev, loading: false }));
    }
  };

  const handleApplyBatchToRow = (batch) => {
    let targetId = productSidebar.itemId;
    if (!targetId) {
      const match = purchaseItems.find(
        (row) =>
          row.product_name &&
          row.product_name.trim().toLowerCase() ===
            productSidebar.productName.toLowerCase()
      );
      if (match) {
        targetId = match.id;
      } else if (purchaseItems.length > 0) {
        targetId = purchaseItems[0].id;
      }
    }

    if (!targetId) {
      toast.error("Please add a row in the invoice table first");
      return;
    }

    setPurchaseItems((prev) =>
      prev.map((row) => {
        if (row.id === targetId) {
          const qty =
            parseInt(row.quantity) || parseInt(row.pack_quantity) || 1;
          const ratePack =
            parseFloat(batch.pack_price || batch.purchase_price) ||
            parseFloat(row.rate_pack) ||
            0;
          return {
            ...row,
            product_name:
              batch.product_name ||
              row.product_name ||
              productSidebar.productName,
            batch_no: batch.batch_no || row.batch_no,
            expiry_date: batch.expiry_date || row.expiry_date,
            rate_pack: ratePack,
            pack_price: ratePack,
            mrp_pack:
              batch.mrp_pack ||
              (batch.mrp && batch.units_per_pack
                ? batch.mrp * batch.units_per_pack
                : row.mrp_pack),
            units_per_pack: batch.units_per_pack || row.units_per_pack || 1,
            units: batch.units_per_pack || row.units || 1,
            hsn_no: batch.hsn_no || row.hsn_no,
            manufacturer: batch.manufacturer || row.manufacturer,
            salt_composition: batch.salt_composition || row.salt_composition,
            pack_type: batch.pack_type || row.pack_type || "Strip",
            cgst: batch.cgst !== undefined ? batch.cgst : row.cgst,
            sgst: batch.sgst !== undefined ? batch.sgst : row.sgst,
            total_amount: (qty * ratePack).toFixed(2),
          };
        }
        return row;
      })
    );

    toast.success(`Applied Batch ${batch.batch_no || "details"}`);
    setProductSidebar((prev) => ({ ...prev, open: false }));
  };

  const handleApplyHistoryToRow = (record) => {
    let targetId = productSidebar.itemId;
    if (!targetId) {
      const match = purchaseItems.find(
        (row) =>
          row.product_name &&
          row.product_name.trim().toLowerCase() ===
            productSidebar.productName.toLowerCase()
      );
      if (match) {
        targetId = match.id;
      } else if (purchaseItems.length > 0) {
        targetId = purchaseItems[0].id;
      }
    }

    if (!targetId) {
      toast.error("Please add a row in the invoice table first");
      return;
    }

    setPurchaseItems((prev) =>
      prev.map((row) => {
        if (row.id === targetId) {
          const qty =
            parseInt(row.quantity) || parseInt(row.pack_quantity) || 1;
          const ratePack =
            parseFloat(record.pack_price) || parseFloat(row.rate_pack) || 0;
          return {
            ...row,
            product_name:
              record.product_name ||
              row.product_name ||
              productSidebar.productName,
            batch_no: record.batch_no || row.batch_no,
            expiry_date: record.expiry_date || row.expiry_date,
            rate_pack: ratePack,
            pack_price: ratePack,
            mrp_pack: record.mrp_pack || row.mrp_pack,
            units_per_pack: record.units_per_pack || row.units_per_pack || 1,
            units: record.units_per_pack || row.units || 1,
            discount: record.discount || row.discount || 0,
            scheme: record.scheme || row.scheme || 0,
            manufacturer: record.manufacturer || row.manufacturer,
            salt_composition: record.salt_composition || row.salt_composition,
            hsn_no: record.hsn_no || row.hsn_no,
            cgst: record.cgst !== undefined ? record.cgst : row.cgst,
            sgst: record.sgst !== undefined ? record.sgst : row.sgst,
            total_amount: (qty * ratePack).toFixed(2),
          };
        }
        return row;
      })
    );

    if (!selectedSupplier && record.supplier_id) {
      setSelectedSupplier(record.supplier_id);
    }

    toast.success(
      `Applied past purchase details from ${record.supplier_name || "Supplier"}`
    );
    setProductSidebar((prev) => ({ ...prev, open: false }));
  };

  const [applyCgstToAll, setApplyCgstToAll] = useState(false);
  const [applySgstToAll, setApplySgstToAll] = useState(false);

  const applyCgstToAllRef = useRef(applyCgstToAll);
  const applySgstToAllRef = useRef(applySgstToAll);

  useEffect(() => {
    applyCgstToAllRef.current = applyCgstToAll;
  }, [applyCgstToAll]);

  useEffect(() => {
    applySgstToAllRef.current = applySgstToAll;
  }, [applySgstToAll]);

  const handleApplyCgstToAllChange = (checked) => {
    setApplyCgstToAll(checked);
    if (checked) {
      setPurchaseItems((prevItems) => {
        if (prevItems.length === 0) return prevItems;
        const firstRowCgst = prevItems[0].cgst;
        const cgstVal = parseFloat(firstRowCgst) || 0;
        return prevItems.map((item) => {
          const updated = { ...item, cgst: firstRowCgst, sgst: firstRowCgst };
          const qty = parseInt(updated.quantity || updated.pack_quantity) || 1;
          const ratePack =
            parseFloat(updated.rate_pack || updated.pack_price) || 0;
          const base = qty * ratePack;
          updated.total_amount = (
            base *
            (1 + (cgstVal + cgstVal) / 100)
          ).toFixed(2);
          return updated;
        });
      });
    }
  };

  const handleApplySgstToAllChange = (checked) => {
    setApplySgstToAll(checked);
    if (checked) {
      setPurchaseItems((prevItems) => {
        if (prevItems.length === 0) return prevItems;
        const firstRowSgst = prevItems[0].sgst;
        const sgstVal = parseFloat(firstRowSgst) || 0;
        return prevItems.map((item) => {
          const updated = { ...item, cgst: firstRowSgst, sgst: firstRowSgst };
          const qty = parseInt(updated.quantity || updated.pack_quantity) || 1;
          const ratePack =
            parseFloat(updated.rate_pack || updated.pack_price) || 0;
          const base = qty * ratePack;
          updated.total_amount = (
            base *
            (1 + (sgstVal + sgstVal) / 100)
          ).toFixed(2);
          return updated;
        });
      });
    }
  };

  // Edit existing purchase
  const [editingPurchase, setEditingPurchase] = useState(null);

  // Expanded view
  const [expandedPurchase, setExpandedPurchase] = useState(null);

  // Add Partial Payment dialog
  const [paymentDialog, setPaymentDialog] = useState({
    open: false,
    purchase: null,
  });
  const [newPaymentAmount, setNewPaymentAmount] = useState("");
  const [newPaymentNotes, setNewPaymentNotes] = useState("");
  const [pdfConfirmDialog, setPdfConfirmDialog] = useState({
    open: false,
    purchaseId: null,
  });
  const [removeConfirmDialog, setRemoveConfirmDialog] = useState({
    open: false,
    itemId: null,
  });

  // Your existing state and refs are correct
  // Replace your current dropdownPosition state and updateDropdownPosition with this:
  // Track which item's dropdown is active
  const [activeItemId, setActiveItemId] = useState(null);
  const [dropdownPosition, setDropdownPosition] = useState({
    top: 0,
    left: 0,
    width: 0,
    transform: "none",
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
    const dropdownWidth = Math.max(620, Math.min(window.innerWidth * 0.5, 780));

    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const dropdownMaxHeight = 320;
    const positionAbove =
      spaceBelow < dropdownMaxHeight && spaceAbove > spaceBelow;

    let leftPos = rect.left;
    if (leftPos + dropdownWidth > window.innerWidth - 16) {
      leftPos = Math.max(16, window.innerWidth - dropdownWidth - 16);
    }

    setDropdownPosition({
      top: positionAbove ? rect.top - 4 : rect.bottom + 4,
      left: leftPos,
      width: dropdownWidth,
      transform: positionAbove ? "translateY(-100%)" : "none",
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

  // CSV Import & Supplier Template State
  const [csvDialog, setCsvDialog] = useState(false);
  const [csvFile, setCsvFile] = useState(null);
  const [csvColumns, setCsvColumns] = useState([]);
  const [csvSampleData, setCsvSampleData] = useState([]);
  const [csvParsedRows, setCsvParsedRows] = useState([]);
  const [csvR2Key, setCsvR2Key] = useState(null);
  const [csvR2Url, setCsvR2Url] = useState(null);
  const [csvReading, setCsvReading] = useState(false);
  const [supplierTemplateInfo, setSupplierTemplateInfo] = useState(null);
  const [saveTemplateChecked, setSaveTemplateChecked] = useState(true);
  const [csvMapping, setCsvMapping] = useState({
    product_name: "",
    batch_no: "",
    expiry_date: "",
    quantity: "",
    units: "",
    pack_type: "",
    rate_pack: "",
    mrp_pack: "",
    cgst: "",
    sgst: "",
    gst_percent: "",
    discount: "",
    scheme: "",
    hsn_no: "",
    manufacturer: "",
    salt_composition: "",
  });

  // Pagination and Filter State
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    total_pages: 1,
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const isInitialMount = useRef(true);
  const [filterSupplier, setFilterSupplier] = useState(
    searchParams.get("supplier_id") || "all"
  );

  const handleSupplierFilterChange = (val) => {
    setFilterSupplier(val);
    if (val === "all") searchParams.delete("supplier_id");
    else searchParams.set("supplier_id", val);
    setSearchParams(searchParams);
  };
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
    cgst: "", // CGST (%)
    sgst: "", // SGST (%)
    discount: "", // Discount (%)
    scheme: "", // Scheme Qty (free packs)
    shortage_threshold: "", // Shortage Threshold Qty
    _is_auto_filled_rate: true, // Prevent price history ping until manually edited
  };

  // ============ MULTI-TAB DRAFTS ============

  useEffect(() => {
    if (!user?.id) return;
    const STORAGE_KEY = `pharmalogy_purchase_drafts_${user.id}`;
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setTabs(parsed);
          const active = parsed[0];
          setActiveTabId(active.id);
          setSelectedSupplier(active.data.selectedSupplier || "");
          setInvoiceNo(active.data.invoiceNo || "");
          setPurchaseDate(
            active.data.purchaseDate || new Date().toISOString().slice(0, 10)
          );
          setPurchaseItems(active.data.purchaseItems || []);
          setPaymentStatus(active.data.paymentStatus || "Unpaid");
          setAmountPaid(active.data.amountPaid || "");
          setPaymentMode(active.data.paymentMode || "");
        }
      } catch (e) {
        console.error("Failed to parse purchase drafts", e);
      }
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || !activeTabId) return;
    const delay = setTimeout(() => {
      setTabs((prev) => {
        const newTabs = prev.map((t) =>
          t.id === activeTabId
            ? {
                ...t,
                data: {
                  selectedSupplier,
                  invoiceNo,
                  purchaseDate,
                  purchaseItems,
                  paymentStatus,
                  amountPaid,
                  paymentMode,
                },
              }
            : t
        );
        localStorage.setItem(
          `pharmalogy_purchase_drafts_${user.id}`,
          JSON.stringify(newTabs)
        );
        return newTabs;
      });
    }, 500);
    return () => clearTimeout(delay);
  }, [
    selectedSupplier,
    invoiceNo,
    purchaseDate,
    purchaseItems,
    paymentStatus,
    amountPaid,
    paymentMode,
    activeTabId,
    user?.id,
  ]);

  // Default payment mode settings synchronization
  useEffect(() => {
    if (paymentStatus === "Unpaid") {
      if (paymentMode !== "") {
        setPaymentMode("");
      }
      return;
    }
    const defaultMode = settings?.purchase_payment_mode_default;
    if (defaultMode && defaultMode !== "none" && paymentMode === "") {
      setPaymentMode(defaultMode);
    }
  }, [settings, paymentMode, paymentStatus]);

  useEffect(() => {
    const defaultPaymentStatus = settings?.purchase_payment_status;
    if (defaultPaymentStatus) {
      const initialStatus =
        settings?.purchase_payment_mode_mandatory &&
        defaultPaymentStatus === "Unpaid"
          ? "Paid"
          : defaultPaymentStatus;
      setPaymentStatus(initialStatus);
    }
  }, [settings]);

  // Ensure at least one item row is present when creating/viewing a new purchase
  useEffect(() => {
    if (showNewPurchase && purchaseItems.length === 0) {
      const defaultRow = { ...emptyItem, id: `temp-${Date.now()}` };
      setPurchaseItems([defaultRow]);
      setTimeout(() => productInputRef.current?.focus(), 150);
    }
  }, [showNewPurchase, purchaseItems.length]);

  const createNewTab = () => {
    if (tabs.length >= 10) {
      toast.error("Maximum 10 tabs allowed");
      return;
    }
    const newId = uuidv4();
    const defaultRow = { ...emptyItem, id: `temp-${Date.now()}` };
    const defaultMode = settings?.purchase_payment_mode_default;
    const initialMode =
      defaultMode && defaultMode !== "none" ? defaultMode : "";
    const defaultStatus = settings?.purchase_payment_status || "Unpaid";
    const initialStatus =
      settings?.purchase_payment_mode_mandatory && defaultStatus === "Unpaid"
        ? "Paid"
        : defaultStatus;
    const newTab = {
      id: newId,
      data: {
        selectedSupplier: "",
        invoiceNo: "",
        purchaseDate: new Date().toISOString().slice(0, 10),
        purchaseItems: [defaultRow],
        paymentStatus: initialStatus,
        amountPaid: "",
        paymentMode: initialMode,
      },
    };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newId);
    setSelectedSupplier("");
    setInvoiceNo("");
    setPurchaseDate(new Date().toISOString().slice(0, 10));
    setPurchaseItems([defaultRow]);
    setPaymentStatus(initialStatus);
    setAmountPaid("");
    setPaymentMode(initialMode);
    setShowNewPurchase(true);
    setTimeout(() => productInputRef.current?.focus(), 150);
  };

  const switchTab = (tabId) => {
    const target = tabs.find((t) => t.id === tabId);
    if (!target) return;

    // Save current active tab specifically before switching if needed (already handled by effect, but let's ensure states are swapped)
    setActiveTabId(tabId);
    setSelectedSupplier(target.data.selectedSupplier || "");
    setInvoiceNo(target.data.invoiceNo || "");
    setPurchaseDate(
      target.data.purchaseDate || new Date().toISOString().slice(0, 10)
    );
    setPurchaseItems(target.data.purchaseItems || []);
    setPaymentStatus(target.data.paymentStatus || "Unpaid");
    setAmountPaid(target.data.amountPaid || "");
    setPaymentMode(target.data.paymentMode || "");
    setShowNewPurchase(true);
  };

  const closeTab = (tabId) => {
    const isClosingActive = tabId === activeTabId;
    const remainingTabs = tabs.filter((t) => t.id !== tabId);

    setTabs(remainingTabs);

    if (remainingTabs.length > 0) {
      if (isClosingActive) {
        const next = remainingTabs[0];
        switchTab(next.id);
      }
    } else {
      setActiveTabId(null);
      setSelectedSupplier("");
      setInvoiceNo("");
      setPurchaseDate(new Date().toISOString().slice(0, 10));
      setPurchaseItems([]);
      setPaymentStatus("Unpaid");
      setAmountPaid("");
      setPaymentMode("");
      setShowNewPurchase(false);
    }

    if (user?.id) {
      localStorage.setItem(
        `pharmalogy_purchase_drafts_${user.id}`,
        JSON.stringify(remainingTabs)
      );
    }
  };

  const clearDraft = () => {
    if (activeTabId) closeTab(activeTabId);
  };

  // Refs for keyboard shortcuts to avoid stale closures
  const handlersRef = useRef({});

  // Keep refs updated
  useEffect(() => {
    handlersRef.current = {
      handleStartNewPurchase,
      handleSubmitPurchase,
      handleSaveEditPurchase,
      handleCancelAddItem,
      handleCancelNewPurchase,
      handleAddNewRow,
      handleAutofillWithAI,
      setShowShortcuts,
      showNewPurchase,
      newItemRow,
      editingPurchaseId,
    };
  });

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      const isInput = ["INPUT", "TEXTAREA", "SELECT"].includes(
        e.target?.tagName
      );
      if (
        isInput &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        e.key !== "Escape" &&
        e.key !== "Enter"
      )
        return;

      const {
        handleStartNewPurchase,
        handleSubmitPurchase,
        handleSaveEditPurchase,
        handleCancelAddItem,
        handleCancelNewPurchase,
        handleAddNewRow,
        handleAutofillWithAI,
        setShowShortcuts,
        showNewPurchase,
        newItemRow,
        editingPurchaseId,
      } = handlersRef.current;

      if (!handleStartNewPurchase) return;

      // Alt+N - New purchase
      if (e.altKey && (e.key === "n" || e.code === "KeyN")) {
        e.preventDefault();
        handleStartNewPurchase();
      }
      // Alt+S or Cmd+Enter - Save purchase
      if (
        (e.altKey && (e.key === "s" || e.code === "KeyS")) ||
        ((e.ctrlKey || e.metaKey) && (e.key === "Enter" || e.code === "Enter"))
      ) {
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
      // Alt+I - Autofill with AI
      if (
        e.altKey &&
        (e.key === "i" || e.key === "I" || e.code === "KeyI" || e.key === "ˆ")
      ) {
        if (showNewPurchase) {
          e.preventDefault();
          handleAutofillWithAI();
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
    async (page = 1, highlightId = undefined) => {
      try {
        const params = new URLSearchParams();
        if (!highlightId) {
          params.append("page", page);
        }
        params.append("limit", pagination.limit);
        params.append("sort_by", sortBy);
        params.append("sort_order", sortOrder);
        if (searchQuery) params.append("search", searchQuery);
        if (filterSupplier && filterSupplier !== "all")
          params.append("supplier_id", filterSupplier);
        if (startDate) params.append("start_date", startDate);
        if (endDate) params.append("end_date", endDate);
        if (highlightId) params.append("highlight_id", highlightId);

        const response = await axios.get(
          `${API}/purchases?${params.toString()}`
        );
        setPurchases(response.data.purchases);
        setPagination(response.data.pagination);

        if (highlightId) {
          setTimeout(() => {
            setExpandedPurchase(highlightId);
            const el = document.getElementById(`record-${highlightId}`);
            if (el) {
              el.scrollIntoView({ behavior: "smooth", block: "center" });
              el.classList.add(
                "bg-primary/20",
                "transition-all",
                "duration-1000"
              );
              setTimeout(() => {
                el.classList.remove("bg-primary/20");
              }, 3000);
            }
            window.history.replaceState({}, document.title);
          }, 300);
        }
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
    if (isInitialMount.current) {
      isInitialMount.current = false;
      if (location.state?.highlightId) {
        return;
      }
    }
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
      const initialSuppliers = [];
      const supplierIdFromUrl = searchParams.get("supplier_id");

      if (supplierIdFromUrl && supplierIdFromUrl !== "all") {
        try {
          const res = await axios.get(`${API}/suppliers/${supplierIdFromUrl}`);
          if (res.data?.supplier) initialSuppliers.push(res.data.supplier);
        } catch (e) {
          console.error("Filter supplier fetch error", e);
        }
      }

      const suppliersRes = await axios.get(`${API}/suppliers?limit=50`);
      const fetched = suppliersRes.data.suppliers || [];

      const combined = [...initialSuppliers];
      fetched.forEach((f) => {
        if (!combined.find((c) => c.id === f.id)) combined.push(f);
      });

      setSuppliers(combined);
      const hlId = location.state?.highlightId;
      if (hlId) {
        await fetchPurchases(1, hlId);
      } else {
        await fetchPurchases(1);
      }
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
    if (!showNewPurchase && tabs.length === 0) {
      createNewTab();
    } else {
      setShowNewPurchase(true);
      setTimeout(() => {
        if (productInputRef.current) {
          productInputRef.current.focus();
        } else {
          document.getElementById("search-medicine-input")?.focus();
        }
      }, 150);
    }
  };

  const handleCancelNewPurchase = () => {
    setShowNewPurchase(false);
    setEditingPurchaseId(null);
    setPurchaseItems([]);
    setSelectedSupplier("");
    setInvoiceNo("");
    setPurchaseDate(new Date().toISOString().slice(0, 10));
    setPaymentMode("");
    setNewItemRow(null);
    setShowSuggestions(false);
    setApplyCgstToAll(false);
    setApplySgstToAll(false);
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
    setPurchaseItems((prev) => {
      let cgst = "";
      let sgst = "";
      if (prev.length > 0) {
        if (applyCgstToAllRef.current) {
          cgst = prev[0].cgst;
        }
        if (applySgstToAllRef.current) {
          sgst = prev[0].sgst;
        }
      }
      const newRow = { ...emptyItem, id: `temp-${Date.now()}`, cgst, sgst };
      return [...prev, newRow];
    });
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
    setRemoveConfirmDialog({ open: true, itemId });
  };

  const confirmRemoveItem = () => {
    if (!removeConfirmDialog.itemId) return;
    setPurchaseItems((prev) =>
      prev.filter((item) => item.id !== removeConfirmDialog.itemId)
    );
    setRemoveConfirmDialog({ open: false, itemId: null });
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
    setPurchaseItems((prev) => {
      const isFirstRow = prev.length > 0 && prev[0].id === itemId;
      if (!isFirstRow) {
        if (field === "cgst" && applyCgstToAllRef.current) {
          setTimeout(() => setApplyCgstToAll(false), 0);
        }
        if (field === "sgst" && applySgstToAllRef.current) {
          setTimeout(() => setApplySgstToAll(false), 0);
        }
      }

      const shouldPropagateCgst =
        isFirstRow && field === "cgst" && applyCgstToAllRef.current;
      const shouldPropagateSgst =
        isFirstRow && field === "sgst" && applySgstToAllRef.current;

      return prev.map((item) => {
        const isTarget = item.id === itemId;
        if (!isTarget && !shouldPropagateCgst && !shouldPropagateSgst)
          return item;

        let updatedValue = isTarget ? value : item[field];
        if (field === "cgst" && shouldPropagateCgst) {
          updatedValue = value;
        }
        if (field === "sgst" && shouldPropagateSgst) {
          updatedValue = value;
        }

        const updated = { ...item, [field]: updatedValue };

        if (field === "cgst") {
          updated.sgst = updatedValue;
        } else if (field === "sgst") {
          updated.cgst = updatedValue;
        }

        if (isTarget && (field === "rate_pack" || field === "total_amount")) {
          updated._is_auto_filled_rate = false;
        }

        const qty =
          parseInt(
            field === "quantity" && isTarget
              ? value
              : updated.quantity || updated.pack_quantity
          ) || 1;
        const cgstVal = parseFloat(updated.cgst) || 0;
        const sgstVal = parseFloat(updated.sgst) || 0;

        if (
          (field === "cgst" && (isTarget || shouldPropagateCgst)) ||
          (field === "sgst" && (isTarget || shouldPropagateSgst)) ||
          (field === "quantity" && isTarget) ||
          (field === "rate_pack" && isTarget) ||
          (field === "discount" && isTarget)
        ) {
          const ratePack =
            parseFloat(
              field === "rate_pack" && isTarget
                ? value
                : updated.rate_pack || updated.pack_price
            ) || 0;
          const discountVal = parseFloat(updated.discount) || 0;
          const base = qty * ratePack * (1 - discountVal / 100);
          // Recalculate total_amount to include GST
          updated.total_amount = (
            base *
            (1 + (cgstVal + sgstVal) / 100)
          ).toFixed(2);
        } else if (field === "total_amount" && isTarget) {
          const newTotal = parseFloat(value) || 0;
          const discountVal = parseFloat(updated.discount) || 0;
          const gstMultiplier = 1 + (cgstVal + sgstVal) / 100;
          const discountMultiplier = 1 - discountVal / 100;
          const divisor = qty * discountMultiplier * gstMultiplier;
          if (divisor > 0) {
            updated.rate_pack = (newTotal / divisor).toFixed(2);
          } else {
            updated.rate_pack = "0";
          }
        }

        return updated;
      });
    });
  };
  // Optimize: Check price history silently (used onBlur and immediately on auto-fill)
  const checkPriceHistorySilent = async (
    itemId,
    productName,
    currentPriceParam
  ) => {
    const currentPrice = parseFloat(currentPriceParam);
    if (!productName || !currentPrice || currentPrice <= 0) return;

    try {
      const response = await axios.get(`${API}/purchases/price-history`, {
        params: { product_name: productName, current_price: currentPrice },
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
      const response = await axios.get(`${API}/purchases/price-history`, {
        params: { product_name: productName, current_price: currentPrice },
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

    const ratePackFixed = ratePack > 0 ? ratePack.toFixed(2) : "";
    const mrpPackFixed = mrpPack > 0 ? mrpPack.toFixed(2) : "";

    const hasValue = (val) => {
      if (val === null || val === undefined) return false;
      const str = String(val).trim();
      return (
        str !== "" &&
        str !== "0" &&
        str !== "0.00" &&
        str !== "null" &&
        str !== "undefined"
      );
    };

    setPurchaseItems((prev) => {
      const isFirstRow = prev.length > 0 && prev[0].id === itemId;
      const finalCgst =
        isInventory && medicine.cgst !== undefined ? String(medicine.cgst) : "";
      const finalSgst =
        isInventory && medicine.sgst !== undefined ? String(medicine.sgst) : "";

      const shouldPropagateCgst = isFirstRow && applyCgstToAllRef.current;
      const shouldPropagateSgst = isFirstRow && applySgstToAllRef.current;
      return prev.map((item) => {
        if (item.id !== itemId && !shouldPropagateCgst && !shouldPropagateSgst)
          return item;

        if (item.id === itemId) {
          const finalRatePack = hasValue(item.rate_pack)
            ? String(item.rate_pack)
            : hasValue(item.pack_price)
              ? String(item.pack_price)
              : ratePackFixed;

          const finalMrpPack = hasValue(item.mrp_pack)
            ? String(item.mrp_pack)
            : mrpPackFixed;

          const finalUnits = hasValue(item.units)
            ? String(item.units)
            : hasValue(item.units_per_pack)
              ? String(item.units_per_pack)
              : String(unitsPerPack);

          const finalManufacturer = hasValue(item.manufacturer)
            ? item.manufacturer
            : manufacturer;

          const finalSaltComposition = hasValue(item.salt_composition)
            ? item.salt_composition
            : salt_composition;

          const finalBatchNo = hasValue(item.batch_no)
            ? item.batch_no
            : isInventory && medicine.batch_no
              ? medicine.batch_no
              : "";

          const finalExpiryDate = hasValue(item.expiry_date)
            ? item.expiry_date
            : isInventory && medicine.expiry_date
              ? medicine.expiry_date
              : "";

          const finalHsn = hasValue(item.hsn_no)
            ? item.hsn_no
            : medicine.hsn_no || "";

          let cgstStr = hasValue(item.cgst) ? String(item.cgst) : finalCgst;
          let sgstStr = hasValue(item.sgst) ? String(item.sgst) : finalSgst;

          const qtyVal = parseInt(item.quantity || item.pack_quantity) || 1;
          const rateVal = parseFloat(finalRatePack) || 0;
          const cgstVal = parseFloat(cgstStr) || 0;
          const sgstVal = parseFloat(sgstStr) || 0;
          const baseAmt = qtyVal * rateVal;
          const calculatedTotal = (
            baseAmt *
            (1 + (cgstVal + sgstVal) / 100)
          ).toFixed(2);

          const finalTotalAmount =
            hasValue(item.total_amount) && hasValue(item.rate_pack)
              ? String(item.total_amount)
              : calculatedTotal;

          return {
            ...item,
            product_id:
              medicine.id || medicine.product_id || `med-${Date.now()}`,
            product_name: medicine.product_name || medicine.name,
            manufacturer: finalManufacturer,
            salt_composition: finalSaltComposition,
            units: finalUnits,
            rate_pack: finalRatePack,
            mrp_pack: finalMrpPack,
            batch_no: finalBatchNo || item.batch_no || "",
            expiry_date: finalExpiryDate || item.expiry_date || "",
            hsn_no: finalHsn || item.hsn_no || "",
            cgst: cgstStr,
            sgst: sgstStr,
            total_amount: finalTotalAmount,
            _is_auto_filled_rate: !hasValue(item.rate_pack),

            // Store inventory metadata for visual indicators
            _inventoryMeta: isInventory
              ? {
                  batch_no: medicine.batch_no,
                  expiry_date: medicine.expiry_date,
                  available_quantity: medicine.available_quantity,
                  stock_status: medicine.stock_status,
                  last_supplier: medicine.supplier_name,
                  match_quality: medicine.matchQuality,
                }
              : null,
          };
        } else {
          // Propagated row updates
          const updated = { ...item };
          if (shouldPropagateCgst) {
            updated.cgst = finalCgst;
          }
          if (shouldPropagateSgst) {
            updated.sgst = finalSgst;
          }
          return updated;
        }
      });
    });

    // Call silent ping immediately so if the loaded price is high, it highlights!
    checkPriceHistorySilent(
      itemId,
      medicine.product_name || medicine.name,
      ratePackFixed
    );

    setSearchMedicine("");
    setMedicineSuggestions([]);
    setShowSuggestions(false);
    setIsMouseOverSuggestions(false);
    setActiveItemId(null);

    // Optional: Show toast for fuzzy matches
    if (isInventory && medicine.matchQuality === "fuzzy") {
      toast.info(`Fuzzy match: "${medicine.name}" - verify before saving`);
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

  const handleAutofillWithAI = async () => {
    const candidates = purchaseItems.filter(
      (item) =>
        item.product_name &&
        item.product_name.trim().length > 0 &&
        (!item.salt_composition ||
          !item.salt_composition.trim() ||
          !item.manufacturer ||
          !item.manufacturer.trim())
    );

    if (candidates.length === 0) return;

    try {
      setIsAiLoading(true);
      let filledCount = 0;

      for (const item of candidates) {
        setProcessingRowId(item.id);

        try {
          const res = await axios.post(`${API}/medicines/enrich`, {
            product_name: item.product_name,
          });

          let itemFilled = false;
          const manufacturerVal = res.data.manufacturer || "";
          const saltVal = res.data.salt_composition || "";

          if (manufacturerVal || saltVal) {
            setPurchaseItems((prev) =>
              prev.map((pItem) => {
                if (pItem.id !== item.id) return pItem;
                const updated = { ...pItem };
                if (!updated.manufacturer && manufacturerVal) {
                  updated.manufacturer = manufacturerVal;
                  itemFilled = true;
                }
                if (!updated.salt_composition && saltVal) {
                  updated.salt_composition = saltVal;
                  itemFilled = true;
                }
                return updated;
              })
            );
          }

          if (itemFilled) {
            filledCount++;
          }
        } catch (err) {
          console.warn(`AI enrichment failed for ${item.product_name}:`, err);
        } finally {
          setProcessingRowId(null);
          // Sparkle pop animation delay (800ms) before moving to next row
          setSparkleRowId(item.id);
          await new Promise((resolve) => setTimeout(resolve, 800));
          setSparkleRowId(null);
        }
      }

      if (filledCount > 0) {
        toast.success(
          `AI Autofilled missing metadata for ${filledCount} item(s) ✨`
        );
      } else {
        toast.info("AI couldn't extract properties for the missing items.");
      }
    } catch (error) {
      console.error("Autofill with AI failed:", error);
      toast.error("AI Autofill encountered an error.");
    } finally {
      setProcessingRowId(null);
      setIsAiLoading(false);
    }
  };

  const handleSubmitPurchase = async () => {
    if (!selectedSupplier) {
      toast.error("Please select a supplier");
      return;
    }

    const isPaidOrPartial =
      paymentStatus === "Paid" || paymentStatus === "Partial";
    if (
      settings?.purchase_payment_mode_mandatory &&
      isPaidOrPartial &&
      (!paymentMode || paymentMode === "none")
    ) {
      toast.error(
        "Payment mode is mandatory for Paid or Partial purchases. Please select Cash, UPI, or Card."
      );
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
          cgst: parseFloat(item.cgst) || 0,
          sgst: parseFloat(item.sgst) || 0,
          discount: parseFloat(item.discount) || 0,
          scheme: parseInt(item.scheme) || 0,
          shortage_threshold:
            item.shortage_threshold !== "" &&
            item.shortage_threshold !== undefined &&
            item.shortage_threshold !== null
              ? Number(item.shortage_threshold)
              : null,
        })),
        payment_status: paymentStatus,
        amount_paid:
          paymentStatus === "Partial"
            ? parseFloat(amountPaid) || 0
            : paymentStatus === "Paid"
              ? undefined /* backend handles total */
              : 0,
        payment_mode:
          paymentMode && paymentMode !== "none" ? paymentMode : null,
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
          setPdfConfirmDialog({ open: true, purchaseId });
        }
      }

      setEditingPurchaseId(null);
      setPaymentStatus("Unpaid");
      setAmountPaid("");
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
    setPaymentStatus(purchase.payment_status || "Unpaid");
    setAmountPaid(purchase.amount_paid || "");
    setPaymentMode(purchase.payment_mode || "");

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
      total_amount:
        item.item_total !== undefined && item.item_total !== null
          ? String(item.item_total)
          : (
              (item.pack_quantity || item.quantity || 1) *
              (item.pack_price || 0) *
              (1 +
                ((parseFloat(item.cgst) || 0) + (parseFloat(item.sgst) || 0)) /
                  100)
            ).toFixed(2),
      cgst: item.cgst !== undefined ? item.cgst : "",
      sgst: item.sgst !== undefined ? item.sgst : "",
      discount: item.discount !== undefined ? item.discount : "",
      scheme: item.scheme !== undefined ? item.scheme : "",
      shortage_threshold:
        item.shortage_threshold !== undefined &&
        item.shortage_threshold !== null
          ? String(item.shortage_threshold)
          : "",
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
            cgst: parseFloat(item.cgst) || 0,
            sgst: parseFloat(item.sgst) || 0,
            discount: parseFloat(item.discount) || 0,
            scheme: parseInt(item.scheme) || 0,
            shortage_threshold:
              item.shortage_threshold !== "" &&
              item.shortage_threshold !== undefined &&
              item.shortage_threshold !== null
                ? Number(item.shortage_threshold)
                : null,
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

  // ============ CSV IMPORT & SUPPLIER TEMPLATES ============

  const formatCsvDate = (dateStr) => {
    if (!dateStr) return "";
    const str = String(dateStr).trim();
    if (!str) return "";

    // Standard YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

    // YYYY/MM/DD
    if (/^\d{4}\/\d{2}\/\d{2}$/.test(str)) return str.replace(/\//g, "-");

    // MM/YYYY or MM-YYYY
    const mY = str.match(/^(\d{1,2})[\/\-](\d{4})$/);
    if (mY) {
      const month = mY[1].padStart(2, "0");
      const year = mY[2];
      return `${year}-${month}-01`;
    }

    // MM/YY or MM-YY
    const mYShort = str.match(/^(\d{1,2})[\/\-](\d{2})$/);
    if (mYShort) {
      const month = mYShort[1].padStart(2, "0");
      const year = `20${mYShort[2]}`;
      return `${year}-${month}-01`;
    }

    // DD/MM/YYYY or DD-MM-YYYY
    const dMY = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (dMY) {
      const day = dMY[1].padStart(2, "0");
      const month = dMY[2].padStart(2, "0");
      const year = dMY[3];
      return `${year}-${month}-${day}`;
    }

    return str;
  };

  const convertCsvRowsToPurchaseItems = (rows, mapping) => {
    if (!rows || rows.length === 0 || !mapping.product_name) return [];

    return rows.map((row, idx) => {
      const rawName = row[mapping.product_name] || `Item #${idx + 1}`;
      const rawBatch = mapping.batch_no ? row[mapping.batch_no] : "";
      const rawExpiry = mapping.expiry_date ? row[mapping.expiry_date] : "";
      const rawQty =
        (mapping.quantity && row[mapping.quantity]) ||
        (mapping.pack_quantity && row[mapping.pack_quantity]) ||
        "1";
      const rawUnits =
        (mapping.units && row[mapping.units]) ||
        (mapping.units_per_pack && row[mapping.units_per_pack]) ||
        "1";
      const rawPackType = mapping.pack_type ? row[mapping.pack_type] : "Strip";
      const rawRatePack = mapping.rate_pack ? row[mapping.rate_pack] : "0";
      const rawMrpPack = mapping.mrp_pack ? row[mapping.mrp_pack] : "0";
      const rawCgst = mapping.cgst ? row[mapping.cgst] : "";
      const rawSgst = mapping.sgst ? row[mapping.sgst] : "";
      const rawGstTotal = mapping.gst_percent ? row[mapping.gst_percent] : "";
      const rawDiscount = mapping.discount ? row[mapping.discount] : "";
      const rawScheme = mapping.scheme ? row[mapping.scheme] : "";
      const rawHsn = mapping.hsn_no ? row[mapping.hsn_no] : "";
      const rawMfr = mapping.manufacturer ? row[mapping.manufacturer] : "";
      const rawComposition = mapping.salt_composition
        ? row[mapping.salt_composition]
        : "";

      const parseNum = (val) => {
        if (!val) return 0;
        const cleaned = String(val).replace(/[^0-9.]/g, "");
        return parseFloat(cleaned) || 0;
      };

      const packQty = parseNum(rawQty) || 1;
      const unitsPerPack = parseNum(rawUnits) || 1;
      const ratePack = parseNum(rawRatePack) || 0;
      const mrpPack = parseNum(rawMrpPack) || 0;
      let cgstVal = parseNum(rawCgst) || 0;
      let sgstVal = parseNum(rawSgst) || 0;

      if (!cgstVal && !sgstVal && rawGstTotal) {
        const totalGst = parseNum(rawGstTotal) || 0;
        cgstVal = totalGst / 2;
        sgstVal = totalGst / 2;
      }

      const discountVal = parseNum(rawDiscount) || 0;
      const schemeVal = parseNum(rawScheme) || 0;
      const totalAmount = packQty * ratePack;

      return {
        id: `csv-${Date.now()}-${idx}`,
        product_id: "",
        product_name: rawName.trim(),
        batch_no: (rawBatch || `BATCH-${Date.now()}-${idx}`).trim(),
        expiry_date: formatCsvDate(rawExpiry),
        quantity: String(packQty),
        units: String(unitsPerPack),
        pack_type: rawPackType || "Strip",
        rate_pack: ratePack > 0 ? String(ratePack) : "",
        mrp_pack: mrpPack > 0 ? String(mrpPack) : "",
        total_amount: totalAmount > 0 ? String(totalAmount) : "",
        cgst: cgstVal > 0 ? String(cgstVal) : "",
        sgst: sgstVal > 0 ? String(sgstVal) : "",
        discount: discountVal > 0 ? String(discountVal) : "",
        scheme: schemeVal > 0 ? String(schemeVal) : "",
        hsn_no: rawHsn ? rawHsn.trim() : "",
        manufacturer: rawMfr ? rawMfr.trim() : "",
        salt_composition: rawComposition ? rawComposition.trim() : "",
        selected_product_id: "NEW",
        _is_auto_filled_rate: true,
      };
    });
  };

  const handleCsvFileSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setCsvFile(file);
    setCsvReading(true);

    const formData = new FormData();
    formData.append("file", file);
    if (selectedSupplier) {
      formData.append("supplier_id", selectedSupplier);
    }

    try {
      const response = await axios.post(
        `${API}/purchases/parse-csv`,
        formData,
        {
          headers: { "Content-Type": "multipart/form-data" },
        }
      );

      const cols = response.data.columns || [];
      setCsvColumns(cols);
      setCsvSampleData(response.data.sample_data || []);
      setCsvParsedRows(response.data.parsed_rows || []);
      setCsvR2Key(response.data.r2_key || null);
      setCsvR2Url(response.data.r2_url || null);
      setSupplierTemplateInfo(response.data.supplier_template || null);

      // Auto-match column headers intelligently
      const newMapping = {
        product_name: "",
        batch_no: "",
        expiry_date: "",
        quantity: "",
        units: "",
        pack_type: "",
        rate_pack: "",
        mrp_pack: "",
        cgst: "",
        sgst: "",
        gst_percent: "",
        discount: "",
        scheme: "",
        hsn_no: "",
        manufacturer: "",
        salt_composition: "",
      };

      // 1. If saved supplier template exists
      if (response.data.supplier_template?.mapped_fields) {
        const savedMap = response.data.supplier_template.mapped_fields;
        Object.keys(newMapping).forEach((targetKey) => {
          if (savedMap[targetKey] && cols.includes(savedMap[targetKey])) {
            newMapping[targetKey] = savedMap[targetKey];
          }
        });
      }

      // 2. Smart column auto-detection for unmapped fields
      const lowerCols = cols.map((c) => ({
        original: c,
        lower: c.toLowerCase().trim(),
      }));
      const findBestCol = (keywords) => {
        const match = lowerCols.find((c) =>
          keywords.some((k) => c.lower.includes(k))
        );
        return match ? match.original : "";
      };

      if (!newMapping.product_name)
        newMapping.product_name = findBestCol([
          "item name",
          "product name",
          "product",
          "item",
          "description",
          "medicine",
          "name",
        ]);
      if (!newMapping.batch_no)
        newMapping.batch_no = findBestCol([
          "batch no",
          "batch number",
          "batch",
          "lot",
        ]);
      if (!newMapping.expiry_date)
        newMapping.expiry_date = findBestCol([
          "expiry date",
          "exp date",
          "expiry",
          "exp",
        ]);
      if (!newMapping.quantity)
        newMapping.quantity = findBestCol([
          "qty",
          "quantity",
          "packs",
          "pack qty",
          "pack quantity",
          "units",
        ]);
      if (!newMapping.units)
        newMapping.units = findBestCol([
          "units/pack",
          "units per pack",
          "pack size",
          "unit per pack",
          "strip size",
        ]);
      if (!newMapping.pack_type)
        newMapping.pack_type = findBestCol([
          "pack type",
          "packing",
          "form",
          "unit type",
        ]);
      if (!newMapping.rate_pack)
        newMapping.rate_pack = findBestCol([
          "purchase price",
          "rate",
          "cost",
          "purchase rate",
          "trade price",
          "price",
          "ftrate",
          "p rate",
        ]);
      if (!newMapping.mrp_pack)
        newMapping.mrp_pack = findBestCol([
          "mrp",
          "max retail price",
          "retail price",
        ]);
      if (!newMapping.cgst)
        newMapping.cgst = findBestCol(["cgst", "c gst", "cgst%"]);
      if (!newMapping.sgst)
        newMapping.sgst = findBestCol(["sgst", "s gst", "sgst%"]);
      if (!newMapping.gst_percent)
        newMapping.gst_percent = findBestCol([
          "gst",
          "gst%",
          "tax%",
          "tax",
          "igst",
        ]);
      if (!newMapping.discount)
        newMapping.discount = findBestCol(["discount", "disc", "disc%"]);
      if (!newMapping.scheme)
        newMapping.scheme = findBestCol(["scheme", "free", "scm"]);
      if (!newMapping.hsn_no)
        newMapping.hsn_no = findBestCol([
          "hsn code",
          "hsn",
          "hsncode",
          "hsn/sac",
        ]);
      if (!newMapping.manufacturer)
        newMapping.manufacturer = findBestCol([
          "manufacturer",
          "mfr",
          "company",
          "brand",
        ]);
      if (!newMapping.salt_composition)
        newMapping.salt_composition = findBestCol([
          "composition",
          "salt",
          "generic",
        ]);

      setCsvMapping(newMapping);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to parse CSV file");
    } finally {
      setCsvReading(false);
    }
  };

  const saveSupplierCsvTemplateIfNeeded = async () => {
    if (saveTemplateChecked && selectedSupplier && csvMapping.product_name) {
      try {
        await axios.post(`${API}/suppliers/${selectedSupplier}/csv-template`, {
          mapped_fields: csvMapping,
        });
      } catch (err) {
        console.error("Failed to auto-save supplier CSV template", err);
      }
    }
  };

  const handlePreviewPurchaseFromCsv = async () => {
    if (!selectedSupplier) {
      toast.error("Please select a supplier first");
      return;
    }
    if (
      !csvMapping.product_name ||
      (!csvMapping.quantity && !csvMapping.pack_quantity)
    ) {
      toast.error("Product Name and Quantity columns are required");
      return;
    }

    const items = convertCsvRowsToPurchaseItems(csvParsedRows, csvMapping);
    if (items.length === 0) {
      toast.error("No valid items found in CSV file");
      return;
    }

    await saveSupplierCsvTemplateIfNeeded();

    setPurchaseItems(items);
    setCsvDialog(false);
    setShowNewPurchase(true);
    toast.success(
      `Loaded ${items.length} CSV items into Purchase Draft for preview`
    );
  };

  const handleDirectCreatePurchaseFromCsv = async () => {
    if (!selectedSupplier) {
      toast.error("Please select a supplier first");
      return;
    }
    if (!csvMapping.product_name || !csvMapping.pack_quantity) {
      toast.error("Product Name and Quantity columns are required");
      return;
    }

    const items = convertCsvRowsToPurchaseItems(csvParsedRows, csvMapping);
    if (items.length === 0) {
      toast.error("No valid items found in CSV file");
      return;
    }

    const supplier = suppliers.find((s) => s.id === selectedSupplier);
    setSubmitting(true);
    try {
      await saveSupplierCsvTemplateIfNeeded();

      await axios.post(`${API}/purchases/bulk-import`, {
        supplier_id: selectedSupplier,
        supplier_name: supplier?.name || "Unknown Supplier",
        invoice_no: invoiceNo || `INV-CSV-${Date.now().toString().slice(-6)}`,
        items,
      });

      toast.success(
        `Purchase Invoice created with ${items.length} items from CSV`
      );
      setCsvDialog(false);
      setCsvFile(null);
      setCsvColumns([]);
      setCsvParsedRows([]);
      fetchPurchases(pagination.page);
    } catch (error) {
      toast.error(
        error.response?.data?.detail || "Failed to create purchase from CSV"
      );
    } finally {
      setSubmitting(false);
    }
  };

  // Calculate total - based on row totals (which include CGST/SGST and manual overrides)
  const totalAmount = purchaseItems.reduce((sum, item) => {
    return sum + (parseFloat(item.total_amount) || 0);
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
      const el = document.getElementById(
        `purchases-suggestion-${highlightedSuggestionIndex}`
      );
      if (el) el.scrollIntoView({ block: "nearest" });
    }
  }, [highlightedSuggestionIndex, showSuggestions]);

  // ============ ADD PARTIAL PAYMENT ============
  const handleAddNewPayment = async () => {
    if (!newPaymentAmount || parseFloat(newPaymentAmount) <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }
    setSubmitting(true);
    try {
      await axios.post(
        `${API}/purchases/${paymentDialog.purchase.id}/payments`,
        {
          amount: parseFloat(newPaymentAmount),
          notes: newPaymentNotes,
        }
      );
      toast.success("Payment added successfully");
      setPaymentDialog({ open: false, purchase: null });
      setNewPaymentAmount("");
      setNewPaymentNotes("");
      await fetchPurchases(pagination.page);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to add payment");
    } finally {
      setSubmitting(false);
    }
  };

  const handleMarkAsPaid = async (purchase) => {
    try {
      const remainingAmount =
        purchase.total_amount - (purchase.amount_paid || 0);
      if (remainingAmount <= 0) return;

      await axios.post(`${API}/purchases/${purchase.id}/payments`, {
        amount: remainingAmount,
        notes: "Marked as Paid in Full",
      });
      toast.success("Purchase marked as Paid");
      await fetchPurchases(pagination.page);
    } catch (error) {
      toast.error("Failed to mark as paid");
    }
  };

  if (loading) {
    return <Loader size="lg" text="Loading Purchases..." />;
  }

  return (
    <div
      className="space-y-3 animate-fade-in pb-12 select-none"
      data-testid="purchases-page"
    >
      <style>{`
        .ai-loading-row {
          background: linear-gradient(270deg, rgba(99, 102, 241, 0.08), rgba(168, 85, 247, 0.08), rgba(236, 72, 153, 0.08)) !important;
          background-size: 600% 600% !important;
          animation: gradientScroll 3s ease infinite !important;
          border-left: 3px solid #6366f1 !important;
        }
        @keyframes gradientScroll {
          0% { background-position: 0% 50% }
          50% { background-position: 100% 50% }
          100% { background-position: 0% 50% }
        }
        .ai-sparkle-row {
          animation: sparkleFlash 0.8s ease-out !important;
          border-left: 3px solid #10b981 !important;
        }
        @keyframes sparkleFlash {
          0% { background-color: rgba(99, 102, 241, 0.25); filter: brightness(1.1); }
          100% { background-color: transparent; }
        }
      `}</style>
      {/* Restore Draft Dialog */}
      <Dialog
        open={paymentDialog.open}
        onOpenChange={(open) =>
          !open && setPaymentDialog({ open: false, purchase: null })
        }
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Partial Payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Amount (₹)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={newPaymentAmount}
                onChange={(e) => setNewPaymentAmount(e.target.value)}
              />
              {paymentDialog.purchase && (
                <p className="text-xs text-muted-foreground">
                  Remaining Balance: ₹
                  {(
                    paymentDialog.purchase.total_amount -
                    (paymentDialog.purchase.amount_paid || 0)
                  ).toFixed(2)}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Input
                placeholder="Payment via UPI, Bank Transfer..."
                value={newPaymentNotes}
                onChange={(e) => setNewPaymentNotes(e.target.value)}
              />
            </div>
            <Button
              className="w-full btn-primary"
              onClick={handleAddNewPayment}
              disabled={submitting}
            >
              {submitting ? "Saving..." : "Save Payment"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
                {getOS() === "mac" ? "⌥ + N" : "Alt + N"}
              </kbd>
            </div>
            <div className="flex justify-between items-center p-2 bg-muted/30 rounded">
              <span>Add Item</span>
              <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono">
                {getOS() === "mac" ? "⌥ + A" : "Alt + A"}
              </kbd>
            </div>
            <div className="flex justify-between items-center p-2 bg-muted/30 rounded">
              <span>Autofill with AI</span>
              <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono">
                {getOS() === "mac" ? "⌥ + I" : "Alt + I"}
              </kbd>
            </div>
            <div className="flex justify-between items-center p-2 bg-muted/30 rounded">
              <span>Save Purchase</span>
              <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono">
                {getOS() === "mac" ? "⌘ + Enter" : "Ctrl + Enter"}
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

      {/* Purchases Page View Area */}

      {showNewPurchase && (
        <div
          className="!mt-0 space-y-3 px-0.5 animate-in fade-in duration-300 relative"
          data-testid="new-purchase-form"
        >
          {isAiLoading && (
            <div className="absolute inset-0 z-[100] flex flex-col items-center justify-center bg-card/85 backdrop-blur-md rounded-2xl transition-all duration-300 shadow-2xl">
              <AiLoader
                size="lg"
                text="Running AI Analysis & Extracting Properties..."
              />
            </div>
          )}

          {/* Unified Single Control Toolbar for New Purchase Entry */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-card border-2 border-border p-3 rounded-2xl backdrop-blur-xl shadow-md">
            {/* Left Fields Grid (Supplier, Invoice #, Date, Payment Status, Initial Amount Paid, Payment Mode) */}
            <div className="flex flex-wrap items-end gap-3 flex-1">
              <div className="space-y-1 w-full sm:w-[230px]">
                <Label className="text-[11px] font-extrabold text-foreground/80">
                  Supplier *
                </Label>
                <SupplierSelector
                  selectedId={selectedSupplier}
                  knownSuppliers={suppliers}
                  disabled={processingRowId !== null}
                  onSelect={(s) => {
                    setSelectedSupplier(s.id);
                    if (!suppliers.find((x) => x.id === s.id)) {
                      setSuppliers((prev) => [...prev, s]);
                    }
                  }}
                />
              </div>

              <div className="space-y-1 w-[145px]">
                <Label className="text-[11px] font-extrabold text-foreground/80">
                  Invoice Number
                </Label>
                <Input
                  placeholder="e.g. INV-001"
                  value={invoiceNo}
                  disabled={processingRowId !== null}
                  onChange={(e) => setInvoiceNo(e.target.value)}
                  className="h-9 text-xs font-semibold rounded-xl border-border bg-background text-foreground shadow-2xs focus-visible:ring-2 focus-visible:ring-orange-500/30 focus-visible:border-orange-500"
                  data-testid="invoice-no-input"
                />
              </div>

              <div className="space-y-1 w-[145px]">
                <Label className="text-[11px] font-extrabold text-foreground/80">
                  Purchase Date *
                </Label>
                <Input
                  type="date"
                  value={purchaseDate}
                  disabled={processingRowId !== null}
                  onChange={(e) => setPurchaseDate(e.target.value)}
                  className="h-9 text-xs font-semibold rounded-xl border-border bg-background text-foreground shadow-2xs focus-visible:ring-2 focus-visible:ring-orange-500/30 focus-visible:border-orange-500"
                />
              </div>

              <div className="space-y-1 w-[200px]">
                <Label className="text-[11px] font-extrabold text-foreground/80">
                  Payment Status
                </Label>
                <div className="flex bg-muted p-1 rounded-xl h-9 border border-border">
                  {["Unpaid", "Partial", "Paid"]
                    .filter(
                      (status) =>
                        !(
                          settings?.lock_unpaid_purchases && status === "Unpaid"
                        )
                    )
                    .map((status) => (
                      <button
                        key={status}
                        type="button"
                        disabled={processingRowId !== null}
                        onClick={() => {
                          setPaymentStatus(status);
                          if (status === "Unpaid") setPaymentMode("");
                        }}
                        className={`flex-1 text-[11px] font-bold rounded-lg transition-all px-1 ${
                          paymentStatus === status
                            ? status === "Paid"
                              ? "bg-emerald-500 text-white shadow-xs"
                              : status === "Unpaid"
                                ? "bg-rose-500 text-white shadow-xs"
                                : "bg-amber-500 text-white shadow-xs"
                            : "text-muted-foreground hover:bg-card"
                        }`}
                      >
                        {status === "Paid" ? "Fully Paid" : status}
                      </button>
                    ))}
                </div>
              </div>

              {paymentStatus === "Partial" && (
                <div className="space-y-1 w-[130px] animate-in fade-in zoom-in-95 duration-200">
                  <Label className="text-[11px] font-extrabold text-amber-500 whitespace-nowrap">
                    Initial Paid (₹)
                  </Label>
                  <div className="relative">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      disabled={processingRowId !== null}
                      value={amountPaid}
                      onChange={(e) => {
                        const val = e.target.value;
                        const numericVal = parseFloat(val);
                        if (numericVal && numericVal >= totalAmount) {
                          setPaymentStatus("Paid");
                          setAmountPaid("");
                          toast.success(
                            "Amount covers total. Marked as Fully Paid."
                          );
                        } else {
                          setAmountPaid(val);
                        }
                      }}
                      placeholder="e.g. 500"
                      className="h-9 text-xs font-bold w-full rounded-xl border-amber-500/60 bg-amber-500/10 text-amber-400 focus-visible:ring-2 focus-visible:ring-amber-500/30"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-1 w-[140px]">
                <Label className="text-[11px] font-extrabold text-foreground/80">
                  Payment Mode
                </Label>
                <Select
                  value={paymentMode}
                  onValueChange={setPaymentMode}
                  disabled={
                    processingRowId !== null || paymentStatus === "Unpaid"
                  }
                >
                  <SelectTrigger className="h-9 w-full bg-background border border-border rounded-xl text-xs font-semibold text-foreground">
                    <SelectValue placeholder="Mode" />
                  </SelectTrigger>
                  <SelectContent>
                    {!settings?.purchase_payment_mode_mandatory && (
                      <SelectItem value="none">
                        <span className="text-muted-foreground font-normal">
                          None
                        </span>
                      </SelectItem>
                    )}
                    <SelectItem value="Cash">
                      <div className="flex items-center gap-2 font-bold">
                        <RupeeCircleIcon className="w-4 h-4 text-emerald-500 shrink-0" />
                        <span>Cash</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="UPI">
                      <div className="flex items-center gap-2 font-bold">
                        <UpiIcon className="w-4 h-4 shrink-0" />
                        <span>UPI</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="Card">
                      <div className="flex items-center gap-2 font-bold">
                        <CreditCardIcon className="w-4 h-4 shrink-0" />
                        <span>Card</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Right: Stats Summary + AI Autofill + Close */}
            <div className="flex items-center gap-2 shrink-0 self-end lg:self-center">
              {/* Total Stats Pill */}
              <div className="flex items-center gap-2 bg-muted px-3 py-1 rounded-xl border border-border shadow-2xs h-9">
                <div className="flex items-center gap-1 border-r border-border pr-2.5">
                  <span className="text-[10px] uppercase font-extrabold text-muted-foreground">
                    Units:
                  </span>
                  <span className="text-xs font-black font-mono text-foreground">
                    {totalUnits}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] uppercase font-extrabold text-orange-500">
                    Total:
                  </span>
                  <span className="text-xs font-black font-mono text-orange-500">
                    ₹{totalAmount.toFixed(2)}
                  </span>
                </div>
                {paymentStatus === "Partial" && amountPaid && (
                  <div className="flex items-center gap-1 border-l border-border pl-2.5">
                    <span className="text-[10px] uppercase font-extrabold text-rose-500">
                      Bal:
                    </span>
                    <span className="text-xs font-black font-mono text-rose-500">
                      ₹{(totalAmount - parseFloat(amountPaid)).toFixed(2)}
                    </span>
                  </div>
                )}
              </div>
              {/* Re-map CSV Columns Button */}
              {csvColumns.length > 0 && (
                <Button
                  variant="outline"
                  onClick={() => setCsvDialog(true)}
                  className="h-9 px-3 text-xs font-extrabold border-orange-500/30 text-orange-500 hover:bg-orange-500/10 rounded-xl cursor-pointer flex items-center gap-1.5"
                  size="sm"
                  title="Re-open CSV mapping modal to adjust column selections"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-orange-500" />
                  <span>Re-map CSV Columns</span>
                </Button>
              )}

              {/* AI Autofill Button + Info Tooltip */}
              {purchaseItems.some(
                (item) =>
                  item.product_name &&
                  item.product_name.trim().length > 0 &&
                  (!item.salt_composition ||
                    !item.salt_composition.trim() ||
                    !item.manufacturer ||
                    !item.manufacturer.trim())
              ) && (
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="default"
                    onClick={handleAutofillWithAI}
                    className="relative overflow-hidden group bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white shadow-md border-none font-extrabold text-xs h-9 rounded-xl px-3 flex items-center gap-1.5"
                    size="sm"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-white" />
                    <span>Autofill ({getOS() === "mac" ? "⌥I" : "Alt+I"})</span>
                  </Button>
                  <CustomTooltip
                    position="bottom-right"
                    breakWords={true}
                    className="w-[300px] text-center font-medium leading-relaxed p-2.5 bg-slate-900 border border-slate-700 shadow-2xl rounded-xl text-white"
                    text="Generative AI may be inaccurate. Please review the autofilled details below before saving."
                  >
                    <button
                      type="button"
                      className="h-9 w-9 flex items-center justify-center rounded-xl bg-muted hover:bg-muted/80 text-orange-500 border border-border transition-colors cursor-pointer"
                    >
                      <Info className="h-4 w-4" />
                    </button>
                  </CustomTooltip>
                </div>
              )}

              <Button
                variant="ghost"
                size="sm"
                onClick={handleCancelNewPurchase}
                className="h-9 w-9 p-0 rounded-xl hover:bg-muted"
                title="Close"
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </Button>
            </div>
          </div>

          {/* Items Table Container */}

          {/* Items Table - Inline Editable with enhanced fields */}
          <div className="border-2 border-border rounded-2xl relative overflow-hidden bg-card shadow-sm">
            <Table wrapperClassName="h-[390px]">
              <TableHeader className="sticky top-0 bg-muted/90 backdrop-blur z-[50] border-b-2 border-border">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[260px] py-2.5 font-extrabold text-foreground">
                    Product / MFG / Salt
                  </TableHead>
                  <TableHead className="w-[130px] py-2.5 font-extrabold text-foreground">
                    Batch / Expiry
                  </TableHead>
                  <TableHead className="w-[140px] py-2.5 font-extrabold text-foreground">
                    HSN / Pack / Shortage
                  </TableHead>
                  <TableHead className="w-[140px] py-2.5 text-center font-extrabold text-foreground">
                    <div className="flex flex-col items-center gap-1">
                      <span>GST (CGST / SGST %)</span>
                      <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground">
                        <label className="flex items-center gap-1 cursor-pointer select-none hover:text-foreground">
                          <input
                            type="checkbox"
                            checked={applyCgstToAll}
                            onChange={(e) =>
                              handleApplyCgstToAllChange(e.target.checked)
                            }
                            className="h-3 w-3 rounded border border-border text-primary"
                          />
                          CGST
                        </label>
                        <label className="flex items-center gap-1 cursor-pointer select-none hover:text-foreground">
                          <input
                            type="checkbox"
                            checked={applySgstToAll}
                            onChange={(e) =>
                              handleApplySgstToAllChange(e.target.checked)
                            }
                            className="h-3 w-3 rounded border border-border text-primary"
                          />
                          SGST
                        </label>
                      </div>
                    </div>
                  </TableHead>
                  <TableHead className="w-[140px] py-2.5 text-center font-extrabold text-foreground">
                    Discount % / Scheme
                  </TableHead>
                  <TableHead className="w-[140px] py-2.5 text-center font-extrabold text-foreground">
                    Qty / Units (T.Units)
                  </TableHead>
                  <TableHead className="w-[150px] py-2.5 text-center font-extrabold text-foreground">
                    Rate / MRP (Pack)
                  </TableHead>
                  <TableHead className="w-[110px] py-2.5 text-center font-extrabold text-foreground">
                    Total
                  </TableHead>
                  <TableHead className="w-[50px] py-2.5 text-center font-extrabold text-foreground">
                    Action
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody
                className={
                  processingRowId !== null
                    ? "pointer-events-none opacity-80"
                    : ""
                }
              >
                {/* Editable Item Rows */}
                {purchaseItems.map((item, index) => {
                  const qty =
                    parseInt(item.quantity) ||
                    parseInt(item.pack_quantity) ||
                    1;
                  const scheme = parseFloat(item.scheme) || 0;
                  const units =
                    parseInt(item.units) || parseInt(item.units_per_pack) || 1;
                  const ratePack =
                    parseFloat(item.rate_pack) ||
                    parseFloat(item.pack_price) ||
                    0;
                  const mrpPack =
                    parseFloat(item.mrp_pack) ||
                    parseFloat(item.mrp_per_unit) * units ||
                    0;
                  const totalUnits = (qty + scheme) * units;
                  const mrpUnit = units > 0 ? mrpPack / units : 0;
                  const totalAmount =
                    parseFloat(item.total_amount) || qty * ratePack;

                  const hasScheme = scheme > 0;

                  return (
                    <TableRow
                      key={item.id || index}
                      className={`relative transition-all duration-200 border-b border-border ${
                        processingRowId === item.id ? "ai-loading-row" : ""
                      } ${sparkleRowId === item.id ? "ai-sparkle-row" : ""} ${
                        priceAlerts[item.id] ? "animate-row-alert" : ""
                      } ${
                        hasScheme
                          ? "bg-emerald-500/10 hover:bg-emerald-500/15 border-l-4 border-l-emerald-500"
                          : "bg-card hover:bg-muted/40"
                      }`}
                    >
                      <TableCell
                        className="w-[260px] p-2 align-top relative"
                        style={{ overflow: "visible" }}
                      >
                        {sparkleRowId === item.id && (
                          <div className="absolute right-2 top-2 flex items-center gap-1 bg-emerald-500 text-white dark:bg-emerald-600 shadow-lg px-2 py-0.5 rounded-md z-[99] border border-emerald-400 animate-bounce">
                            <Sparkles className="w-3.5 h-3.5 text-yellow-300 fill-yellow-200 animate-pulse" />
                            <span className="text-[10px] font-extrabold uppercase tracking-wider">
                              AI Done!
                            </span>
                          </div>
                        )}
                        <div className="flex flex-col gap-1.5 w-full">
                          <div className="flex items-center gap-1">
                            <Input
                              ref={(el) => {
                                setInputRef(el, item.id);
                                if (index === purchaseItems.length - 1) {
                                  productInputRef.current = el;
                                }
                              }}
                              value={item.product_name || ""}
                              disabled={processingRowId !== null}
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
                                const currentId = item.id;
                                setTimeout(() => {
                                  if (!isMouseOverSuggestions) {
                                    setActiveItemId((prev) => {
                                      if (prev === currentId) {
                                        setShowSuggestions(false);
                                        setHighlightedSuggestionIndex(-1);
                                        return null;
                                      }
                                      return prev;
                                    });
                                  }
                                }, 200);
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
                              placeholder="Search product..."
                              className={`h-8 text-xs font-bold border-border bg-background text-foreground focus:border-orange-500 rounded-lg ${
                                item._inventoryMeta
                                  ? item._inventoryMeta.stock_status ===
                                    "In Stock"
                                    ? "border-blue-500/60 bg-blue-500/10"
                                    : "border-orange-500/60 bg-orange-500/10"
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
                                  className={`w-4 h-4 shrink-0 ${
                                    item._inventoryMeta.stock_status ===
                                    "In Stock"
                                      ? "text-blue-500"
                                      : "text-orange-500"
                                  }`}
                                />
                              </CustomTooltip>
                            )}

                            {/* Product Info Button for Batches & History Sidebar */}
                            {item.product_name &&
                              item.product_name.trim().length > 0 && (
                                <CustomTooltip
                                  position="top"
                                  text="View all batches & past purchases for this product"
                                >
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleOpenProductSidebar(
                                        item.product_name,
                                        item.id
                                      )
                                    }
                                    className="p-1 rounded-md bg-muted hover:bg-orange-500/20 text-muted-foreground hover:text-orange-500 transition-colors shrink-0 cursor-pointer"
                                    title="Batches & History"
                                  >
                                    <Info className="w-3.5 h-3.5 text-orange-500" />
                                  </button>
                                </CustomTooltip>
                              )}
                          </div>

                          <div className="flex gap-1.5 items-center w-full">
                            <Input
                              value={item.manufacturer || ""}
                              onChange={(e) =>
                                handleItemFieldChange(
                                  item.id,
                                  "manufacturer",
                                  e.target.value
                                )
                              }
                              placeholder="MFG Brand"
                              className="h-7 text-xs w-1/2 rounded-lg border-border bg-background text-foreground"
                            />
                            <Button
                              id={`add-salt-${item.id}`}
                              type="button"
                              variant="outline"
                              className="h-7 text-xs w-1/2 justify-start truncate px-2 rounded-lg border-border font-medium text-foreground bg-background"
                              onClick={() =>
                                setSaltDialog({
                                  open: true,
                                  itemId: item.id,
                                  value: item.salt_composition || "",
                                })
                              }
                            >
                              <span className="truncate">
                                {item.salt_composition
                                  ? item.salt_composition.length > 12
                                    ? item.salt_composition.slice(0, 10) + "..."
                                    : item.salt_composition
                                  : "+ Salt"}
                              </span>
                            </Button>
                          </div>
                        </div>

                        {/* ========================================== */}
                        {/* SUGGESTIONS DROPDOWN VIA PORTAL            */}
                        {/* ========================================== */}
                        {showSuggestions &&
                          activeItemId === item.id &&
                          (medicineSuggestions.length > 0 ||
                            searchMedicine.length > 1 ||
                            loadingSuggestions) &&
                          createPortal(
                            <div
                              data-suggestions-dropdown="true"
                              className="bg-card border-2 border-border rounded-2xl shadow-2xl overflow-y-auto z-[99999]"
                              onMouseEnter={() =>
                                setIsMouseOverSuggestions(true)
                              }
                              onMouseLeave={() => {
                                setIsMouseOverSuggestions(false);
                                const activeInput =
                                  inputRefs.current[activeItemId];
                                if (
                                  activeInput &&
                                  document.activeElement !== activeInput
                                ) {
                                  setShowSuggestions(false);
                                  setActiveItemId(null);
                                }
                              }}
                              style={{
                                position: "fixed",
                                top: dropdownPosition.top,
                                left: dropdownPosition.left,
                                width: dropdownPosition.width || 640,
                                maxHeight: "320px",
                                transform: dropdownPosition.transform || "none",
                                overscrollBehavior: "contain",
                                WebkitOverflowScrolling: "touch",
                              }}
                              onScroll={handleScrollSuggestions}
                            >
                              {loadingSuggestions &&
                                medicineSuggestions.length === 0 && (
                                  <div className="h-[140px] w-full flex flex-col items-center justify-center bg-card backdrop-blur-md">
                                    <Loader
                                      size="sm"
                                      text="Searching medicines & inventory..."
                                      variant="inline"
                                    />
                                  </div>
                                )}

                              {medicineSuggestions[0]?.matchQuality && (
                                <div className="px-3.5 py-1.5 bg-muted border-b border-border text-xs font-semibold text-muted-foreground flex items-center justify-between sticky top-0 z-10">
                                  <span>
                                    Suggestions for "{searchMedicine}"
                                  </span>
                                  <span className="text-[10px] bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded-full font-bold border border-blue-500/20">
                                    {medicineSuggestions.length} matches
                                  </span>
                                </div>
                              )}

                              {medicineSuggestions.map((medicine, idx) => (
                                <div
                                  key={idx}
                                  id={`purchases-suggestion-${idx}`}
                                  className={`p-3 cursor-pointer border-b border-border/50 transition-colors last:border-0 ${
                                    highlightedSuggestionIndex === idx
                                      ? "bg-orange-500/15"
                                      : "hover:bg-muted/50"
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
                                  <div className="flex items-center justify-between gap-2 mb-1">
                                    <div className="font-bold text-sm text-foreground flex items-center gap-2 flex-wrap">
                                      {medicine.name}
                                      {medicine.source === "inventory" ? (
                                        <span className="text-[10px] px-2 py-0.5 bg-blue-500/10 text-blue-400 border border-blue-500/30 rounded-full font-bold">
                                          In Stock
                                        </span>
                                      ) : (
                                        <span className="text-[10px] px-2 py-0.5 bg-muted text-muted-foreground border border-border rounded-full font-bold">
                                          Global Catalog
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                      {medicine.stock_status && (
                                        <span
                                          className={`text-xs px-2 py-0.5 rounded-md font-bold ${
                                            medicine.stock_status === "In Stock"
                                              ? "bg-emerald-500/10 text-emerald-400"
                                              : "bg-rose-500/10 text-rose-400"
                                          }`}
                                        >
                                          {medicine.stock_status}:{" "}
                                          {medicine.available_quantity || 0}{" "}
                                          units
                                        </span>
                                      )}
                                      <button
                                        type="button"
                                        onMouseDown={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          handleOpenProductSidebar(
                                            medicine.name,
                                            item.id
                                          );
                                        }}
                                        className="p-1 rounded-md bg-muted hover:bg-orange-500/20 text-muted-foreground hover:text-orange-500 transition-colors shrink-0 cursor-pointer"
                                        title="View Batches & Past Purchases"
                                      >
                                        <Info className="w-3.5 h-3.5 text-orange-500" />
                                      </button>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                                    {medicine.manufacturer ||
                                    medicine.manufacturer_name ? (
                                      <span className="font-semibold text-foreground/90">
                                        MFG:{" "}
                                        {medicine.manufacturer ||
                                          medicine.manufacturer_name}
                                      </span>
                                    ) : null}
                                    {(medicine.salt_composition ||
                                      medicine.short_composition1) && (
                                      <span className="text-orange-400 font-medium">
                                        • Salt:{" "}
                                        {medicine.salt_composition ||
                                          medicine.short_composition1}
                                      </span>
                                    )}
                                  </div>

                                  <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground flex-wrap pt-1 border-t border-border/40">
                                    <div className="flex items-center gap-3">
                                      {medicine.source === "inventory" ? (
                                        <>
                                          <span className="font-mono font-bold text-orange-500">
                                            Rate: ₹
                                            {Number(
                                              medicine.purchase_price || 0
                                            ).toFixed(2)}
                                            /u
                                          </span>
                                          <span className="font-mono text-foreground/80">
                                            MRP: ₹
                                            {Number(
                                              medicine.mrp_per_unit ||
                                                medicine.mrp ||
                                                0
                                            ).toFixed(2)}
                                          </span>
                                        </>
                                      ) : (
                                        <span className="font-mono font-bold text-orange-500">
                                          MRP: ₹{medicine["price(₹)"] || 0} •{" "}
                                          {medicine.pack_size_label || "N/A"}
                                        </span>
                                      )}
                                    </div>
                                    {medicine.batch_no && (
                                      <span className="font-mono text-[11px] text-muted-foreground">
                                        Batch: {medicine.batch_no} | Exp:{" "}
                                        {medicine.expiry_date || "N/A"}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              ))}

                              {loadingSuggestions &&
                                medicineSuggestions.length > 0 && (
                                  <div className="p-3 text-center flex items-center justify-center bg-muted/80 border-t border-border">
                                    <Loader
                                      size="xs"
                                      text="Loading more suggestions..."
                                      variant="inline"
                                    />
                                  </div>
                                )}

                              {!loadingSuggestions &&
                                searchMedicine.length > 1 && (
                                  <div
                                    id={`purchases-suggestion-${medicineSuggestions.length}`}
                                    className={`p-3 cursor-pointer border-t border-orange-500/30 bg-orange-500/10 hover:bg-orange-500/20 transition-colors ${
                                      highlightedSuggestionIndex ===
                                      medicineSuggestions.length
                                        ? "bg-orange-500/25"
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
                                    <div className="flex items-center gap-2 text-orange-400 font-bold text-sm">
                                      <span className="p-1 bg-orange-500/20 rounded-md flex items-center justify-center">
                                        <Sparkles className="w-3.5 h-3.5" />
                                      </span>
                                      <span>
                                        Get AI facts for "{searchMedicine}"
                                      </span>
                                    </div>
                                  </div>
                                )}

                              {!loadingSuggestions &&
                                medicineSuggestions.length === 0 &&
                                searchMedicine.length > 1 && (
                                  <div className="p-6 text-center flex flex-col items-center justify-center bg-card border-t border-border animate-in fade-in zoom-in-95 duration-200">
                                    <div className="w-12 h-12 rounded-2xl bg-orange-500/10 border border-orange-500/30 flex items-center justify-center text-orange-400 mb-2.5 shadow-xs">
                                      <SearchX className="w-6 h-6" />
                                    </div>
                                    <h4 className="text-xs font-extrabold text-foreground tracking-wide">
                                      No results match your search
                                    </h4>
                                    <p className="text-[11px] font-medium text-muted-foreground mt-1 max-w-[340px] leading-relaxed">
                                      No medicines found matching "
                                      <span className="font-bold text-foreground">
                                        {searchMedicine}
                                      </span>
                                      ". Click{" "}
                                      <span className="font-bold text-orange-400">
                                        "Get AI facts"
                                      </span>{" "}
                                      above to auto-extract medicine details.
                                    </p>
                                  </div>
                                )}
                            </div>,
                            document.body
                          )}
                      </TableCell>

                      <TableCell className="w-[130px] p-2 align-top">
                        <div className="flex flex-col gap-1.5">
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
                                document
                                  .getElementById(`hsn-${item.id}`)
                                  ?.focus({ preventScroll: true });
                              }
                            }}
                            placeholder="Batch No"
                            className="h-8 text-xs font-semibold rounded-lg border-border bg-background text-foreground"
                          />
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
                                document
                                  .getElementById(`cgst-${item.id}`)
                                  ?.focus({ preventScroll: true });
                              }
                            }}
                            className="h-7 text-xs rounded-lg border-border bg-background text-foreground"
                          />
                        </div>
                      </TableCell>

                      <TableCell className="w-[140px] p-2 align-top">
                        <div className="flex flex-col gap-1.5">
                          <div className="flex gap-1 w-full">
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
                                  document
                                    .getElementById(`expiry-${item.id}`)
                                    ?.focus({ preventScroll: true });
                                }
                              }}
                              placeholder="HSN"
                              className="h-8 text-xs font-semibold w-1/2 rounded-lg border-border bg-background text-foreground"
                            />
                            <Select
                              value={item.pack_type || "Strip"}
                              onValueChange={(v) =>
                                handleItemFieldChange(item.id, "pack_type", v)
                              }
                            >
                              <SelectTrigger className="h-8 text-xs w-1/2 rounded-lg border-border bg-background text-foreground px-1.5">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {PACK_TYPES.map((type) => (
                                  <SelectItem
                                    key={type}
                                    value={type}
                                    className="text-xs"
                                  >
                                    {type}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <Input
                            type="number"
                            value={
                              item.shortage_threshold !== undefined
                                ? item.shortage_threshold
                                : ""
                            }
                            onChange={(e) =>
                              handleItemFieldChange(
                                item.id,
                                "shortage_threshold",
                                e.target.value
                              )
                            }
                            placeholder="Shortage Qty"
                            className="h-7 text-xs rounded-lg border-border bg-background text-foreground"
                          />
                        </div>
                      </TableCell>

                      <TableCell className="w-[140px] p-2 align-top">
                        <div className="flex flex-col gap-1.5">
                          <div className="flex gap-1 justify-center items-center w-full">
                            <Input
                              id={`cgst-${item.id}`}
                              type="number"
                              step="0.01"
                              value={item.cgst !== undefined ? item.cgst : ""}
                              onChange={(e) =>
                                handleItemFieldChangeWithCalc(
                                  item.id,
                                  "cgst",
                                  e.target.value
                                )
                              }
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  document
                                    .getElementById(`sgst-${item.id}`)
                                    ?.focus({ preventScroll: true });
                                }
                              }}
                              placeholder="CGST %"
                              className="h-8 text-xs text-center w-1/2 font-semibold rounded-lg border-border bg-background text-foreground"
                              min="0"
                            />
                            <Input
                              id={`sgst-${item.id}`}
                              type="number"
                              step="0.01"
                              value={item.sgst !== undefined ? item.sgst : ""}
                              onChange={(e) =>
                                handleItemFieldChangeWithCalc(
                                  item.id,
                                  "sgst",
                                  e.target.value
                                )
                              }
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  document
                                    .getElementById(`discount-${item.id}`)
                                    ?.focus({ preventScroll: true });
                                }
                              }}
                              placeholder="SGST %"
                              className="h-8 text-xs text-center w-1/2 font-semibold rounded-lg border-border bg-background text-foreground"
                              min="0"
                            />
                          </div>
                          <div className="h-7 text-[10px] font-bold text-foreground bg-muted border border-border rounded-lg flex items-center justify-center font-mono">
                            Tax: ₹
                            {(
                              ((((parseFloat(item.cgst) || 0) +
                                (parseFloat(item.sgst) || 0)) *
                                (parseFloat(item.rate_pack) || 0)) /
                                100) *
                              (parseInt(item.quantity) || 1)
                            ).toFixed(2)}
                          </div>
                        </div>
                      </TableCell>

                      <TableCell className="w-[140px] p-2 align-top">
                        <div className="flex flex-col gap-1.5">
                          <div className="flex gap-1 justify-center items-center w-full">
                            <Input
                              id={`discount-${item.id}`}
                              type="number"
                              step="0.01"
                              value={
                                item.discount !== undefined ? item.discount : ""
                              }
                              onChange={(e) =>
                                handleItemFieldChangeWithCalc(
                                  item.id,
                                  "discount",
                                  e.target.value
                                )
                              }
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  document
                                    .getElementById(`scheme-${item.id}`)
                                    ?.focus({ preventScroll: true });
                                }
                              }}
                              placeholder="Disc %"
                              className="h-8 text-xs text-center w-1/2 font-semibold rounded-lg border-border bg-background text-foreground"
                              min="0"
                            />
                            <Input
                              id={`scheme-${item.id}`}
                              type="number"
                              value={
                                item.scheme !== undefined ? item.scheme : ""
                              }
                              onChange={(e) =>
                                handleItemFieldChangeWithCalc(
                                  item.id,
                                  "scheme",
                                  e.target.value
                                )
                              }
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  document
                                    .getElementById(`qty-${item.id}`)
                                    ?.focus({ preventScroll: true });
                                }
                              }}
                              placeholder="Scheme"
                              className={`h-8 text-xs text-center w-1/2 font-semibold rounded-lg border-border bg-background text-foreground ${
                                hasScheme
                                  ? "border-emerald-500 bg-emerald-500/10 font-bold text-emerald-400"
                                  : ""
                              }`}
                              min="0"
                            />
                          </div>
                          {hasScheme ? (
                            <div className="h-7 text-[10px] font-bold text-emerald-300 bg-emerald-500/20 border border-emerald-500/30 rounded-lg flex items-center justify-center">
                              +{scheme} Free
                            </div>
                          ) : (
                            <div className="h-7 text-[10px] font-bold text-muted-foreground bg-muted flex items-center justify-center border border-border rounded-lg font-mono">
                              No Scheme
                            </div>
                          )}
                        </div>
                      </TableCell>

                      <TableCell className="w-[140px] p-2 align-top">
                        <div className="flex flex-col gap-1.5">
                          <div className="flex gap-1 justify-center items-center w-full">
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
                                  document
                                    .getElementById(`units-${item.id}`)
                                    ?.focus({ preventScroll: true });
                                }
                              }}
                              placeholder="Qty"
                              className="h-8 text-xs font-bold text-center w-1/2 rounded-lg border-border bg-background text-foreground"
                              min="1"
                            />
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
                                  document
                                    .getElementById(`rate-${item.id}`)
                                    ?.focus({ preventScroll: true });
                                }
                              }}
                              placeholder="Units"
                              className="h-8 text-xs font-semibold text-center w-1/2 rounded-lg border-border bg-background text-foreground"
                              min="1"
                            />
                          </div>
                          <div className="h-7 text-[10px] font-bold text-foreground bg-muted border border-border rounded-lg flex items-center justify-center font-mono">
                            Total:{" "}
                            <span className="text-orange-500 ml-1 font-bold">
                              {totalUnits} u
                            </span>
                          </div>
                        </div>
                      </TableCell>

                      <TableCell className="w-[150px] p-2 align-top">
                        <div className="flex flex-col gap-1.5">
                          <div className="flex gap-1 justify-center items-center w-full">
                            <div className="relative w-1/2">
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
                                onBlur={() =>
                                  checkPriceHistorySilent(
                                    item.id,
                                    item.product_name,
                                    item.rate_pack || item.pack_price
                                  )
                                }
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    document
                                      .getElementById(`mrp-${item.id}`)
                                      ?.focus({ preventScroll: true });
                                  }
                                }}
                                placeholder="Rate ₹"
                                className={`h-8 text-xs text-center w-full font-bold text-foreground rounded-lg border-border bg-background pr-5 ${
                                  priceAlerts[item.id]
                                    ? "border-amber-500 bg-amber-500/10 text-amber-400"
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
                                  className="absolute right-1 top-1/2 -translate-y-1/2 text-orange-500 hover:text-orange-600"
                                  title="Compare with past rates"
                                >
                                  <CustomTooltip
                                    position="top"
                                    text="Compare with past rates"
                                  >
                                    <ArrowUpDown
                                      className={`w-3.5 h-3.5 ${
                                        priceAlerts[item.id]
                                          ? "text-amber-500 animate-icon-alert cursor-pointer"
                                          : ""
                                      }`}
                                    />
                                  </CustomTooltip>
                                </button>
                              )}
                            </div>
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
                                  document
                                    .getElementById(`total-${item.id}`)
                                    ?.focus({ preventScroll: true });
                                }
                              }}
                              placeholder="MRP ₹"
                              className="h-8 text-xs text-center w-1/2 font-bold rounded-lg border-amber-500/40 bg-amber-500/10 text-amber-400"
                            />
                          </div>
                          <div className="h-7 text-[10px] font-semibold text-muted-foreground bg-muted border border-border rounded-lg flex items-center justify-center font-mono">
                            MRP/U:{" "}
                            {mrpPack && units ? `₹${mrpUnit.toFixed(2)}` : "-"}
                          </div>
                        </div>
                      </TableCell>

                      <TableCell className="w-[110px] p-2 align-top">
                        <div className="flex flex-col gap-1.5">
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
                                  document
                                    .querySelector(
                                      `[data-testid="item-name-${index + 1}"]`
                                    )
                                    ?.focus({ preventScroll: true });
                                }
                              }
                            }}
                            placeholder="Total ₹"
                            className="h-8 w-full text-xs text-center font-black text-foreground rounded-lg border-border bg-background"
                          />
                          <div className="h-7 text-[10px] font-mono font-semibold text-muted-foreground flex items-center justify-center border border-border rounded-lg bg-muted">
                            ₹
                            {(
                              (parseFloat(item.total_amount) || totalAmount) /
                              (totalUnits || 1)
                            ).toFixed(2)}
                            /u
                          </div>
                        </div>
                      </TableCell>

                      <TableCell className="w-[50px] p-2 align-top text-center">
                        <div className="h-[67px] flex items-center justify-center">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg transition-colors"
                            onClick={() => handleRemoveItem(item.id)}
                            title="Delete row"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}

                {purchaseItems.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={9}
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
            💡 <strong>Tip:</strong> Enter Qty and either Rate(Pack) OR Total -
            the other will auto-calculate. Salt, HSN, Batch, Expiry are
            optional.
          </p>

          {/* Action Buttons - Add Item always visible */}
          <div className="flex items-center justify-between pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleAddNewRow}
              disabled={processingRowId !== null}
              data-testid="add-item-btn"
            >
              <Plus className="h-4 w-4 mr-1" /> Add Item
            </Button>
            {/* Submit moved to fixed footer */}
          </div>
        </div>
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
                  <SupplierSelector 
                    selectedId={editingPurchase.supplier_id}
                    knownSuppliers={suppliers}
                    onSelect={(s) => {
                      setEditingPurchase((prev) => ({
                        ...prev,
                        supplier_id: s.id,
                        supplier_name: s.name,
                      }));
                      if (!suppliers.find(x => x.id === s.id)) {
                        setSuppliers(prev => [...prev, s]);
                      }
                    }}
                  />
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
                              <div className="flex flex-col gap-1">
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
                                  className="h-8 text-xs font-semibold"
                                />
                                <Input
                                  type="number"
                                  placeholder="Shortage Qty"
                                  value={item.shortage_threshold !== undefined ? item.shortage_threshold : ""}
                                  onChange={(e) => {
                                    const items = [...editingPurchase.items];
                                    items[idx] = {
                                      ...items[idx],
                                      shortage_threshold: e.target.value,
                                    };
                                    setEditingPurchase((prev) => ({
                                      ...prev,
                                      items,
                                    }));
                                  }}
                                  className="h-6 text-[10px]"
                                />
                              </div>
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
                                className="h-8 text-xs w-20 text-center font-bold border-amber-500/30 bg-amber-500/5 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400"
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

      {/* Unenclosed Seamless Top Header & Toolbar */}
      {!showNewPurchase && editingPurchaseId === null && (
        <>
          <div className="space-y-3 px-0.5 py-0.5">
            {/* Line 1: Page Title, Stats Badge & Action Buttons */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-black tracking-tight text-foreground">
                  Purchases
                </h1>
                <span className="px-2.5 py-0.5 rounded-full bg-orange-500/10 border border-orange-500/30 text-orange-600 dark:text-orange-400 font-mono font-bold text-xs">
                  {pagination.total} recorded
                </span>
                <span className="hidden md:inline-block text-xs font-semibold text-muted-foreground">
                  • Tracked in units
                </span>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowShortcuts(true)}
                  data-testid="shortcuts-btn"
                  className="h-8 text-xs font-bold rounded-xl border-border/70"
                >
                  <Keyboard className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
                  Shortcuts
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs font-bold rounded-xl bg-gradient-to-r from-orange-500/10 to-amber-500/10 border-orange-500/30 text-orange-600 dark:text-orange-400 hover:border-orange-500/50"
                  onClick={() => window.open("/scan", "_blank")}
                  data-testid="scan-products-btn"
                >
                  <Upload className="w-3.5 h-3.5 mr-1.5" />
                  Scan
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs font-bold rounded-xl border-border/70 cursor-pointer"
                  onClick={() => setCsvDialog(true)}
                  data-testid="csv-import-btn"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 mr-1.5 text-orange-500" />
                  CSV Import
                </Button>

                <Button
                  size="sm"
                  className="h-8 px-3.5 text-xs font-extrabold bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white rounded-xl shadow-xs border-none"
                  onClick={handleStartNewPurchase}
                  data-testid="add-purchase-btn"
                >
                  <Plus className="w-3.5 h-3.5 mr-1 stroke-[3]" />
                  {getOS() === "mac" ? "New (⌥N)" : "New (Alt+N)"}
                </Button>
              </div>
            </div>

            {/* Line 2: Search Input + Supplier & Date Filters */}
            <div className="flex flex-col md:flex-row items-center gap-3 pt-1">
              <div className="flex-1 w-full">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search purchases by supplier, invoice..."
                    className="pl-9 h-9 text-xs font-medium rounded-xl border-border/70 bg-card/60 backdrop-blur-md"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2 w-full md:w-auto flex-wrap">
                <SupplierSelector
                  selectedId={filterSupplier}
                  knownSuppliers={suppliers}
                  showAllOption={true}
                  className="w-44"
                  onSelect={(s) => {
                    handleSupplierFilterChange(s.id);
                    if (
                      s.id !== "all" &&
                      !suppliers.find((x) => x.id === s.id)
                    ) {
                      setSuppliers((prev) => [...prev, s]);
                    }
                  }}
                />
                <Input
                  type="date"
                  placeholder="Start date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-36 h-9 text-xs rounded-xl border-border/70 bg-card/60 backdrop-blur-md"
                />
                <Input
                  type="date"
                  placeholder="End date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-36 h-9 text-xs rounded-xl border-border/70 bg-card/60 backdrop-blur-md"
                />
                {(searchQuery ||
                  (filterSupplier && filterSupplier !== "all") ||
                  startDate ||
                  endDate) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 px-3 text-xs font-bold text-muted-foreground hover:text-foreground rounded-xl"
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
          </div>

          {/* Purchases Table */}
          <Card className="glass bg-card/35 backdrop-blur-xl border border-border/70 shadow-lg rounded-2xl overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]"></TableHead>
                  <TableHead>Invoice / Timestamp</TableHead>
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
                  <TableHead>Items</TableHead>
                  <TableHead className="text-center">Status</TableHead>
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
                {purchases.map((purchase, index) => (
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
                      <TableCell className="text-sm text-foreground py-2.5">
                        <div className="font-bold">
                          #
                          {pagination.total -
                            ((pagination.page - 1) * pagination.limit +
                              index)}{" "}
                          - {purchase.invoice_no || "-"}
                        </div>
                        <div className="text-[11px] text-muted-foreground font-medium mt-0.5">
                          {new Date(
                            purchase.purchase_date ||
                              purchase.created_at ||
                              new Date()
                          ).toLocaleString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: true,
                          })}
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">
                        {purchase.supplier_name}
                      </TableCell>
                      <TableCell className="text-sm">
                        {purchase.items?.length || 0} items
                      </TableCell>
                      <TableCell className="text-center">
                        <div>
                          <span
                            className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                              purchase.payment_status === "Paid"
                                ? "bg-green-500/10 text-green-500 border border-green-500/20"
                                : purchase.payment_status === "Partial"
                                  ? "bg-yellow-500/10 text-yellow-500 border border-yellow-500/20"
                                  : "bg-red-500/10 text-red-400 border border-red-500/20"
                            }`}
                          >
                            {purchase.payment_status || "Unpaid"}
                          </span>
                        </div>
                        {purchase.payment_mode &&
                          purchase.payment_mode !== "none" && (
                            <div className="text-[10px] text-muted-foreground/80 mt-1 font-bold uppercase tracking-wider flex items-center justify-center gap-1.5">
                              {getPaymentModeIcon(
                                purchase.payment_mode,
                                "w-3.5 h-3.5"
                              )}
                              <span>{purchase.payment_mode}</span>
                            </div>
                          )}
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
                                  <TableHead className="text-center font-bold text-primary bg-primary/5 dark:bg-primary/10">
                                    Cost/Unit
                                  </TableHead>
                                  <TableHead className="text-center font-bold text-amber-600 dark:text-amber-400 bg-amber-500/5 dark:bg-amber-500/10">
                                    MRP/Unit
                                  </TableHead>
                                  <TableHead className="text-center">
                                    CGST %
                                  </TableHead>
                                  <TableHead className="text-center">
                                    SGST %
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
                                        <div>{item.product_name}</div>
                                        {item.shortage_threshold !==
                                          undefined &&
                                          item.shortage_threshold !== null && (
                                            <div className="text-[10px] text-muted-foreground font-semibold">
                                              Shortage:{" "}
                                              {item.shortage_threshold} units
                                            </div>
                                          )}
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
                                      <TableCell className="text-center font-bold text-primary bg-primary/5 dark:bg-primary/10">
                                        ₹{costPerUnit.toFixed(2)}
                                      </TableCell>
                                      <TableCell className="text-center font-bold text-amber-600 dark:text-amber-400 bg-amber-500/5 dark:bg-amber-500/10">
                                        ₹{mrpPerUnit.toFixed(2)}
                                      </TableCell>
                                      <TableCell className="text-center font-mono">
                                        {item.cgst !== undefined
                                          ? `${item.cgst}%`
                                          : "0%"}
                                      </TableCell>
                                      <TableCell className="text-center font-mono">
                                        {item.sgst !== undefined
                                          ? `${item.sgst}%`
                                          : "0%"}
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

                          {/* Payment Timeline Section */}
                          <div className="mt-4 p-4 rounded-lg bg-card border border-border shadow-sm flex flex-col md:flex-row gap-6">
                            <div className="flex-1">
                              <h4 className="font-semibold text-sm mb-4 flex items-center gap-2">
                                <CreditCard className="w-4 h-4 text-primary" />
                                Payment History
                              </h4>
                              {purchase.payments &&
                              purchase.payments.length > 0 ? (
                                <div className="space-y-4">
                                  {purchase.payments.map((payment, i) => (
                                    <div
                                      key={i}
                                      className="flex relative pl-5 before:absolute before:left-[7px] before:top-5 before:bottom-[-20px] last:before:hidden before:w-[2px] before:bg-muted-foreground/20"
                                    >
                                      <div className="absolute left-0 top-1.5 w-[16px] h-[16px] rounded-full bg-primary/20 flex items-center justify-center ring-4 ring-background">
                                        <div className="w-[8px] h-[8px] rounded-full bg-primary"></div>
                                      </div>
                                      <div>
                                        <p className="text-sm font-bold text-foreground">
                                          ₹{payment.amount.toFixed(2)}
                                        </p>
                                        <p className="text-xs text-muted-foreground font-medium">
                                          {new Date(
                                            payment.date
                                          ).toLocaleString()}{" "}
                                          <span className="mx-1">•</span>{" "}
                                          {payment.notes || "Partial Payment"}
                                        </p>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="text-sm text-muted-foreground italic flex py-8 items-center justify-center bg-muted/20 rounded-lg border border-dashed border-border/50">
                                  No payment history recorded.
                                </div>
                              )}
                            </div>

                            <div className="w-full md:w-72 bg-muted/30 p-4 rounded-md border border-border/50 flex flex-col justify-center shadow-inner">
                              <div className="flex justify-between items-center mb-1">
                                <span className="text-sm text-muted-foreground">
                                  Total Billed:
                                </span>
                                <span className="text-sm font-mono font-medium">
                                  ₹{purchase.total_amount?.toFixed(2)}
                                </span>
                              </div>
                              <div className="flex justify-between items-center mb-3">
                                <span className="text-sm text-muted-foreground">
                                  Amount Paid:
                                </span>
                                <span className="text-sm font-mono font-medium text-green-500">
                                  ₹{(purchase.amount_paid || 0).toFixed(2)}
                                </span>
                              </div>
                              <div className="flex justify-between items-center pt-2 border-t border-border mb-4">
                                <span className="text-sm font-bold">
                                  Remaining:
                                </span>
                                <span className="text-base font-mono font-bold text-red-500">
                                  ₹
                                  {Math.max(
                                    0,
                                    purchase.total_amount -
                                      (purchase.amount_paid || 0)
                                  ).toFixed(2)}
                                </span>
                              </div>

                              <div className="flex gap-2">
                                {purchase.payment_status !== "Paid" && (
                                  <>
                                    <Button
                                      size="sm"
                                      className="flex-1 btn-primary"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setPaymentDialog({
                                          open: true,
                                          purchase,
                                        });
                                      }}
                                    >
                                      Pay Part
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="flex-1 hover:bg-green-50 hover:text-green-600 hover:border-green-200"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleMarkAsPaid(purchase);
                                      }}
                                    >
                                      Mark Paid
                                    </Button>
                                  </>
                                )}
                                {purchase.payment_status === "Paid" && (
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    className="w-full text-green-600 border-green-200 bg-green-50/50"
                                    disabled
                                  >
                                    <CheckCircle2 className="w-4 h-4 mr-1.5" />{" "}
                                    Fully Paid
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>
                          {/* Purchase Edit History Section */}
                          {purchase.history && purchase.history.length > 0 && (
                            <div className="mt-4 p-4 rounded-xl bg-muted/20 border border-border/60 shadow-sm space-y-3">
                              <h4 className="font-bold text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                                <History className="w-3.5 h-3.5 text-amber-500" />
                                Purchase Edit History ({purchase.history.length}
                                )
                              </h4>
                              <div className="space-y-4 max-h-60 overflow-y-auto pr-1">
                                {purchase.history.map((hist, hIdx) => {
                                  const name =
                                    hist.updated_by_name || "Unknown User";
                                  const initial = name.charAt(0).toUpperCase();
                                  return (
                                    <div
                                      key={hIdx}
                                      className="flex gap-3 text-xs border-b border-border/30 pb-3 last:border-0 last:pb-0 text-left"
                                    >
                                      {hist.updated_by_avatar ? (
                                        <img
                                          src={hist.updated_by_avatar}
                                          alt={name}
                                          className="w-7 h-7 rounded-full object-cover border border-border shrink-0"
                                        />
                                      ) : (
                                        <div className="w-7 h-7 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center font-bold border border-amber-500/20 shrink-0 text-[11px]">
                                          {initial}
                                        </div>
                                      )}
                                      <div className="flex-1 space-y-1.5">
                                        <div className="flex justify-between items-center text-[11px] text-muted-foreground font-semibold">
                                          <span className="text-foreground/95 font-bold">
                                            {name}
                                          </span>
                                          <span className="font-mono">
                                            {new Date(
                                              hist.updated_at
                                            ).toLocaleString("en-IN", {
                                              day: "2-digit",
                                              month: "short",
                                              year: "numeric",
                                              hour: "2-digit",
                                              minute: "2-digit",
                                              hour12: true,
                                            })}
                                          </span>
                                        </div>
                                        <div className="space-y-1 text-foreground/80 font-medium">
                                          {hist.changes.map((ch, cIdx) => (
                                            <div
                                              key={cIdx}
                                              className="bg-background/50 px-3 py-1.5 rounded-xl border border-border/40 text-[11px]"
                                            >
                                              {ch.description}
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
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
            {/* Pagination */}
            {pagination.total_pages > 1 && (
              <div className="flex items-center justify-between px-6 py-4 border-t border-border/40 bg-muted/5">
                <div className="text-xs font-bold text-muted-foreground/80">
                  Showing {(pagination.page - 1) * pagination.limit + 1} to{" "}
                  {Math.min(
                    pagination.page * pagination.limit,
                    pagination.total
                  )}{" "}
                  of {pagination.total} purchases
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fetchPurchases(pagination.page - 1)}
                    disabled={pagination.page <= 1}
                    className="h-8 text-xs font-bold border-border/80 hover:bg-muted rounded-lg"
                  >
                    <ChevronLeft className="h-3.5 w-3.5 mr-1 text-primary" />
                    Previous
                  </Button>

                  <div className="flex items-center gap-1">
                    {Array.from(
                      { length: Math.min(5, pagination.total_pages) },
                      (_, i) => {
                        const pageNum =
                          Math.max(
                            1,
                            Math.min(
                              pagination.total_pages - 4,
                              pagination.page - 2
                            )
                          ) + i;
                        if (pageNum > pagination.total_pages) return null;
                        return (
                          <Button
                            key={pageNum}
                            variant={
                              pageNum === pagination.page
                                ? "default"
                                : "outline"
                            }
                            size="sm"
                            onClick={() => fetchPurchases(pageNum)}
                            className={`w-8 h-8 p-0 text-xs font-bold rounded-lg border ${
                              pageNum === pagination.page
                                ? "bg-primary text-primary-foreground shadow-md shadow-primary/10 border-primary"
                                : "border-border/80 hover:bg-muted"
                            }`}
                          >
                            {pageNum}
                          </Button>
                        );
                      }
                    )}
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fetchPurchases(pagination.page + 1)}
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
        </>
      )}

      {/* salt dialog  */}
      <Dialog
        open={saltDialog.open}
        onOpenChange={(open) => {
          if (!open) {
            const idToFocus = saltDialog.itemId;
            setTimeout(
              () => document.getElementById(`add-salt-${idToFocus}`)?.focus(),
              50
            );
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
                setTimeout(
                  () =>
                    document.getElementById(`add-salt-${idToFocus}`)?.focus(),
                  50
                );
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
                setTimeout(
                  () =>
                    document.getElementById(`add-salt-${idToFocus}`)?.focus(),
                  50
                );
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
        <AlertDialogContent className="max-w-2xl w-[95%]">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Purchase</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this purchase from{" "}
              {deleteDialog.purchase?.supplier_name}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col-reverse md:flex-row gap-2 justify-end mt-6">
            <AlertDialogCancel className="w-full md:w-auto mt-0">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="w-full md:w-auto bg-destructive hover:bg-destructive/90 transition-colors"
              onClick={() => handleDeletePurchase(false)}
            >
              Force Delete (No Inventory Adjust)
            </AlertDialogAction>
            <AlertDialogAction
              className="w-full md:w-auto btn-primary"
              onClick={() => handleDeletePurchase(true)}
            >
              Delete & Decrease Stock
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={pdfConfirmDialog.open}
        onOpenChange={(open) =>
          setPdfConfirmDialog({ ...pdfConfirmDialog, open })
        }
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Generate Purchase PDF</AlertDialogTitle>
            <AlertDialogDescription>
              Would you like to generate and view a PDF receipt for this newly
              recorded purchase?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Skip</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                handleGeneratePurchasePdf(pdfConfirmDialog.purchaseId);
                setPdfConfirmDialog({ open: false, purchaseId: null });
              }}
              className="btn-primary"
            >
              Generate PDF
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
            setTimeout(
              () =>
                document.getElementById(`price-history-${idToFocus}`)?.focus(),
              50
            );
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

      <AlertDialog
        open={removeConfirmDialog.open}
        onOpenChange={(open) =>
          setRemoveConfirmDialog({ ...removeConfirmDialog, open })
        }
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Item</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove this item from the purchase
              invoice?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRemoveItem}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* TABS & ACTION NAVBAR */}
      {(showNewPurchase || editingPurchaseId) &&
        createPortal(
          <div className="fixed bottom-0 left-0 right-0 z-[100] flex items-center justify-between bg-card/95 backdrop-blur-xl border-t-2 border-border shadow-2xl px-6 py-3.5 gap-4 overflow-x-auto scroller-hide overflow-y-hidden mb-0 transition-all duration-300">
            <div className="flex items-center gap-2 overflow-x-auto scroller-hide">
              {showNewPurchase &&
                tabs.map((tab, idx) => {
                  const isActive = tab.id === activeTabId;
                  let tabName = `Tab ${idx + 1}`;
                  if (tab.data?.purchaseItems?.length > 0) {
                    const firstProduct =
                      tab.data.purchaseItems[0].product_name || "Unknown";
                    const extra = tab.data.purchaseItems.length - 1;
                    tabName =
                      extra > 0 ? `${firstProduct} +${extra}` : firstProduct;
                  }
                  return (
                    <div key={tab.id} className="relative group shrink-0">
                      <Button
                        variant={isActive ? "default" : "secondary"}
                        size="sm"
                        onClick={(e) => {
                          e.preventDefault();
                          switchTab(tab.id);
                        }}
                        className={`pr-8 h-9 rounded-full transition-all duration-200 ${isActive ? "bg-orange-500 text-white shadow-md shadow-orange-500/20 font-bold" : "bg-slate-100 hover:bg-slate-200 dark:bg-muted/65 dark:hover:bg-muted/90 text-slate-700 dark:text-muted-foreground border border-slate-200/80 dark:border-border/50 font-semibold"}`}
                      >
                        <FileText className="w-3.5 h-3.5 mr-1.5 opacity-70" />
                        <span className="max-w-[120px] truncate">
                          {tabName}
                        </span>
                      </Button>
                      {tabs.length > 0 && (
                        <div
                          className="absolute right-1.5 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full bg-background/50 hover:bg-destructive hover:text-destructive-foreground cursor-pointer transition-colors"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            closeTab(tab.id);
                          }}
                        >
                          <X className="w-3 h-3" />
                        </div>
                      )}
                    </div>
                  );
                })}
              {showNewPurchase && tabs.length < 10 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={createNewTab}
                  className="bg-primary/5 hover:bg-primary/10 border-primary/20 text-primary shrink-0 transition-colors shadow-sm h-9 rounded-full"
                >
                  <Plus className="w-4 h-4 mr-1" /> New Tab
                </Button>
              )}
              {editingPurchaseId && (
                <div className="flex items-center gap-2 px-3 py-1 bg-yellow-500/10 border border-yellow-500/20 rounded-md text-yellow-600 text-sm font-medium">
                  <Edit2 className="w-4 h-4" />
                  Editing Purchase #{editingPurchaseId}
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 shrink-0 ml-auto border-l border-border pl-6">
              <Button
                variant="ghost"
                onClick={handleCancelNewPurchase}
                disabled={processingRowId !== null}
                className="text-muted-foreground hover:text-foreground"
              >
                Cancel (Esc)
              </Button>

              <Button
                onClick={handleSubmitPurchase}
                disabled={
                  submitting ||
                  processingRowId !== null ||
                  purchaseItems.filter((i) => i.product_name).length === 0
                }
                className="btn-primary shadow-lg shadow-primary/20 min-w-[160px]"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <div className="flex items-center gap-2">
                    <Save className="w-4 h-4" />
                    <span>
                      {editingPurchaseId ? "Update Purchase" : "Save Purchase"}
                    </span>
                    <kbd className="hidden sm:inline-block ml-1 opacity-70 text-[9px] font-mono border border-white/20 px-1 rounded">
                      {getOS() === "mac" ? "⌘Enter" : "Ctrl+Enter"}
                    </kbd>
                  </div>
                )}
              </Button>
            </div>
          </div>,
          document.body
        )}

      {/* PRODUCT DETAILS & PAST PURCHASES SLIDE-OVER SIDEBAR */}
      {productSidebar.open &&
        createPortal(
          <div className="fixed inset-0 z-[99999] flex justify-end">
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
              onClick={() =>
                setProductSidebar((prev) => ({ ...prev, open: false }))
              }
            />

            {/* Slideover Drawer Container */}
            <div className="relative w-full sm:w-[540px] h-full bg-card border-l-2 border-border shadow-2xl flex flex-col z-10 animate-in slide-in-from-right duration-300">
              {/* Drawer Header */}
              <div className="p-4 border-b border-border bg-muted/40 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 overflow-hidden">
                  <div className="p-2 rounded-xl bg-orange-500/10 text-orange-500 border border-orange-500/20 shrink-0">
                    <Package className="w-5 h-5" />
                  </div>
                  <div className="truncate">
                    <h3 className="font-black text-sm text-foreground truncate">
                      {productSidebar.productName}
                    </h3>
                    <p className="text-[11px] font-medium text-muted-foreground truncate">
                      Inventory Batches & Historical Purchases
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setProductSidebar((prev) => ({ ...prev, open: false }))
                  }
                  className="h-8 w-8 p-0 rounded-xl hover:bg-muted shrink-0"
                >
                  <X className="w-4 h-4 text-muted-foreground" />
                </Button>
              </div>

              {/* Navigation Tabs */}
              <div className="flex border-b border-border bg-muted/20 px-4 pt-2 gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setProductSidebar((prev) => ({
                      ...prev,
                      activeTab: "batches",
                    }))
                  }
                  className={`pb-2.5 px-3 text-xs font-bold transition-all border-b-2 flex items-center gap-2 cursor-pointer ${
                    productSidebar.activeTab === "batches"
                      ? "border-orange-500 text-orange-500"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Package className="w-3.5 h-3.5" />
                  <span>All Batches</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted font-mono font-bold border border-border">
                    {productSidebar.batches.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setProductSidebar((prev) => ({
                      ...prev,
                      activeTab: "history",
                    }))
                  }
                  className={`pb-2.5 px-3 text-xs font-bold transition-all border-b-2 flex items-center gap-2 cursor-pointer ${
                    productSidebar.activeTab === "history"
                      ? "border-orange-500 text-orange-500"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <History className="w-3.5 h-3.5" />
                  <span>Past Purchases</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted font-mono font-bold border border-border">
                    {productSidebar.history.length}
                  </span>
                </button>
              </div>

              {/* Drawer Body Content */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {productSidebar.loading ? (
                  <div className="h-[240px] flex flex-col items-center justify-center">
                    <Loader
                      size="sm"
                      text="Loading details..."
                      variant="inline"
                    />
                  </div>
                ) : productSidebar.activeTab === "batches" ? (
                  /* TAB 1: ALL BATCHES */
                  productSidebar.batches.length === 0 ? (
                    <div className="p-8 text-center flex flex-col items-center justify-center text-muted-foreground border-2 border-dashed border-border rounded-2xl">
                      <Package className="w-8 h-8 mb-2 opacity-40 text-orange-500" />
                      <p className="text-xs font-bold text-foreground">
                        No active inventory batches
                      </p>
                      <p className="text-[11px] mt-0.5">
                        There are no existing inventory batches recorded for
                        this product.
                      </p>
                    </div>
                  ) : (
                    productSidebar.batches.map((batch, idx) => {
                      const packPrice = Number(
                        batch.pack_price || batch.purchase_price || 0
                      );
                      const mrpPrice = Number(
                        batch.mrp_pack ||
                          (batch.mrp
                            ? batch.mrp * (batch.units_per_pack || 1)
                            : 0)
                      );
                      return (
                        <div
                          key={batch.id || idx}
                          className="p-3.5 rounded-xl border border-border bg-card hover:border-orange-500/40 transition-all space-y-2.5 shadow-2xs"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-xs bg-muted px-2 py-0.5 rounded-md text-foreground border border-border">
                                Batch: {batch.batch_no || "N/A"}
                              </span>
                              <span
                                className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md ${
                                  (batch.available_quantity || 0) > 0
                                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                    : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                                }`}
                              >
                                Stock: {batch.available_quantity || 0} u
                              </span>
                            </div>
                            <Button
                              size="sm"
                              onClick={() => handleApplyBatchToRow(batch)}
                              className="h-8 px-3 text-xs font-extrabold bg-orange-500 hover:bg-orange-600 active:scale-95 text-white shadow-sm hover:shadow-orange-500/20 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shrink-0"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Use Batch</span>
                            </Button>
                          </div>

                          <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-border/40 font-mono">
                            <div>
                              <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                                Expiry Date:
                              </span>
                              <span className="font-semibold text-foreground">
                                {batch.expiry_date || "N/A"}
                              </span>
                            </div>
                            <div>
                              <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                                Supplier:
                              </span>
                              <span className="font-semibold text-foreground truncate block">
                                {batch.supplier_name || "Unknown"}
                              </span>
                            </div>
                            <div>
                              <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                                Pack Price:
                              </span>
                              <span className="font-bold text-orange-400">
                                ₹{packPrice.toFixed(2)}
                              </span>
                            </div>
                            <div>
                              <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                                MRP (Pack):
                              </span>
                              <span className="font-semibold text-foreground">
                                ₹{mrpPrice.toFixed(2)}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )
                ) : /* TAB 2: PAST PURCHASES */
                productSidebar.history.length === 0 ? (
                  <div className="p-8 text-center flex flex-col items-center justify-center text-muted-foreground border-2 border-dashed border-border rounded-2xl">
                    <History className="w-8 h-8 mb-2 opacity-40 text-orange-500" />
                    <p className="text-xs font-bold text-foreground">
                      No past purchases found
                    </p>
                    <p className="text-[11px] mt-0.5">
                      No previous purchase records found for this product.
                    </p>
                  </div>
                ) : (
                  productSidebar.history.map((record, idx) => {
                    const packPrice = Number(record.pack_price || 0);
                    return (
                      <div
                        key={record.purchase_id || idx}
                        className="p-3.5 rounded-xl border border-border bg-card hover:border-orange-500/40 transition-all space-y-2.5 shadow-2xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <span className="font-bold text-xs text-foreground block">
                              {record.supplier_name || "Unknown Supplier"}
                            </span>
                            <span className="text-[10px] font-mono text-muted-foreground">
                              {record.purchase_date} • Inv:{" "}
                              {record.invoice_no || "N/A"}
                            </span>
                          </div>
                          <Button
                            size="sm"
                            onClick={() => handleApplyHistoryToRow(record)}
                            className="h-8 px-3 text-xs font-extrabold bg-orange-500 hover:bg-orange-600 active:scale-95 text-white shadow-sm hover:shadow-orange-500/20 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shrink-0"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>Apply Rate</span>
                          </Button>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-border/40 font-mono">
                          <div>
                            <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                              Batch & Exp:
                            </span>
                            <span className="font-semibold text-foreground">
                              {record.batch_no || "N/A"} (
                              {record.expiry_date || "N/A"})
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                              Qty Purchased:
                            </span>
                            <span className="font-semibold text-foreground">
                              {record.pack_quantity} packs ({record.total_units}{" "}
                              u)
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                              Pack Price:
                            </span>
                            <span className="font-bold text-orange-400">
                              ₹{packPrice.toFixed(2)}
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                              Payment Status:
                            </span>
                            <span
                              className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded ${
                                record.payment_status === "Paid"
                                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                  : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                              }`}
                            >
                              {record.payment_status}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
      {/* Global CSV Import & Re-map Dialog Modal */}
      <Dialog open={csvDialog} onOpenChange={setCsvDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col p-6 rounded-2xl border border-border bg-background shadow-2xl">
          <DialogHeader className="shrink-0 mb-2">
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-orange-500" />
              <span>Import Purchases from CSV</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Upload any supplier CSV invoice to parse items, map columns, and
              preview purchase draft.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-5 pr-1 custom-scrollbar">
            {/* Supplier Selector */}
            <div className="space-y-1.5 bg-muted/20 p-3.5 rounded-xl border border-border/60">
              <Label className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
                Select Supplier *
              </Label>
              <SupplierSelector
                selectedId={selectedSupplier}
                knownSuppliers={suppliers}
                onSelect={(s) => {
                  setSelectedSupplier(s.id);
                  if (!suppliers.find((x) => x.id === s.id)) {
                    setSuppliers((prev) => [...prev, s]);
                  }
                }}
              />
            </div>

            {/* CSV File Upload Box */}
            <div className="space-y-1.5">
              <Label className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
                CSV File *
              </Label>
              <div className="relative border-2 border-dashed border-border hover:border-orange-500/50 rounded-xl p-5 text-center bg-muted/10 transition-colors">
                <Input
                  type="file"
                  accept=".csv,.txt"
                  onChange={handleCsvFileSelect}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <div className="flex flex-col items-center justify-center space-y-2 pointer-events-none">
                  <Upload className="w-7 h-7 text-orange-500 animate-bounce" />
                  <div className="text-xs font-bold text-foreground">
                    {csvFile
                      ? csvFile.name
                      : "Click or drag & drop CSV file to upload"}
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    Supports .csv, .txt, semicolon, and tab delimited files
                  </span>
                </div>
              </div>
            </div>

            {/* CSV Parsing Loader */}
            {csvReading && (
              <div className="py-6 text-center flex flex-col items-center justify-center space-y-2">
                <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
                <span className="text-xs text-muted-foreground font-medium">
                  Reading CSV and checking supplier template...
                </span>
              </div>
            )}

            {/* Template Match Status Banner */}
            {supplierTemplateInfo && !csvReading && (
              <div
                className={`p-3.5 rounded-xl border text-xs font-semibold flex items-center justify-between gap-2 ${
                  supplierTemplateInfo.matched
                    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                    : "bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400"
                }`}
              >
                <div className="flex items-center gap-2">
                  {supplierTemplateInfo.matched ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  ) : (
                    <Info className="w-4 h-4 text-amber-500 shrink-0" />
                  )}
                  <span>
                    {supplierTemplateInfo.matched
                      ? "Matched saved CSV template for this supplier! Column mappings auto-filled below."
                      : supplierTemplateInfo.missing_fields?.length > 0
                        ? `${supplierTemplateInfo.missing_fields.length} column(s) mismatched from saved supplier template. Please verify mappings below.`
                        : "No saved CSV template found for this supplier. Verify column mappings below."}
                  </span>
                </div>
              </div>
            )}

            {/* Column Mapping Section */}
            {csvColumns.length > 0 && !csvReading && (
              <div className="space-y-3 bg-muted/30 p-4 rounded-xl border border-border/60">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-orange-500" /> Map CSV
                    Columns to Purchase Fields
                  </h4>
                  <span className="text-[11px] font-mono text-muted-foreground font-bold">
                    {csvParsedRows.length} Rows Found
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
                  {[
                    { key: "product_name", label: "Product Name *", req: true },
                    { key: "batch_no", label: "Batch Number", req: false },
                    { key: "expiry_date", label: "Expiry Date", req: false },
                    { key: "quantity", label: "Quantity (Packs) *", req: true },
                    { key: "units", label: "Units Per Pack", req: false },
                    {
                      key: "pack_type",
                      label: "Pack Type (Strip/Box)",
                      req: false,
                    },
                    {
                      key: "rate_pack",
                      label: "Purchase Rate / Pack",
                      req: false,
                    },
                    { key: "mrp_pack", label: "MRP / Pack", req: false },
                    { key: "cgst", label: "CGST %", req: false },
                    { key: "sgst", label: "SGST %", req: false },
                    {
                      key: "gst_percent",
                      label: "GST % (Splits 50/50)",
                      req: false,
                    },
                    { key: "discount", label: "Discount %", req: false },
                    { key: "scheme", label: "Scheme Qty", req: false },
                    { key: "hsn_no", label: "HSN Code", req: false },
                    { key: "manufacturer", label: "Manufacturer", req: false },
                    {
                      key: "salt_composition",
                      label: "Salt Composition",
                      req: false,
                    },
                  ].map(({ key, label }) => (
                    <div key={key} className="space-y-1">
                      <Label className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">
                        {label}
                      </Label>
                      <Select
                        value={csvMapping[key] || "none"}
                        onValueChange={(v) =>
                          setCsvMapping({
                            ...csvMapping,
                            [key]: v === "none" ? "" : v,
                          })
                        }
                      >
                        <SelectTrigger className="h-8 text-xs bg-background border-border rounded-lg font-bold">
                          <SelectValue placeholder="Select CSV Column..." />
                        </SelectTrigger>
                        <SelectContent className="max-h-56">
                          <SelectItem value="none">-- Unmapped --</SelectItem>
                          {csvColumns.map((col) => (
                            <SelectItem key={col} value={col}>
                              {col}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>

                {/* Toggle to save supplier template */}
                {selectedSupplier && (
                  <div className="pt-2 flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="save-template-toggle"
                      checked={saveTemplateChecked}
                      onChange={(e) => setSaveTemplateChecked(e.target.checked)}
                      className="rounded border-border text-orange-500 focus:ring-orange-500 cursor-pointer"
                    />
                    <Label
                      htmlFor="save-template-toggle"
                      className="text-xs font-semibold text-muted-foreground cursor-pointer"
                    >
                      Save these column mappings as default template for
                      selected supplier
                    </Label>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Action Footer - Mandatory Preview */}
          <div className="pt-4 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
            <Button
              variant="outline"
              onClick={() => setCsvDialog(false)}
              className="w-full sm:w-auto h-9 text-xs font-bold rounded-xl border-border hover:bg-muted cursor-pointer"
            >
              Cancel
            </Button>

            <Button
              onClick={handlePreviewPurchaseFromCsv}
              disabled={submitting || csvColumns.length === 0 || csvReading}
              className="w-full sm:w-auto h-9 px-5 bg-orange-500 hover:bg-orange-600 text-white font-extrabold text-xs rounded-xl shadow-md cursor-pointer flex items-center justify-center gap-1.5"
            >
              <Eye className="w-4 h-4" />
              <span>Preview Purchase Draft</span>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
