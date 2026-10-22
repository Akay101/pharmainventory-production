import { useState, useEffect, useCallback, useRef, Fragment } from "react";
import { useSearchParams, useLocation } from "react-router-dom";
import { v4 as uuidv4 } from "uuid";
import { createPortal } from "react-dom";
import axios from "axios";
import { API, useAuth } from "../App";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../components/ui/popover";
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
  Globe,
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
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  PackagePlus,
} from "lucide-react";
import { toast } from "sonner";
import PlanBadge from "../components/PlanBadge";
import Loader, { AiLoader } from "../components/Loader";
import { formatDate, formatExpiry, formatExpiryInput, expiryToIso, openScanner } from "./utils";
import CustomTooltip from "@/components/ui/CustomTooltip";
import { getOS } from "../hooks/useKeyboard";
import ProductCatalogModal from "../components/ProductCatalogModal";

const PACK_TYPES = ["Strip", "Bottle", "Tube", "Packet", "Box", "Unit"];

const derivePackType = (med) => {
  if (med?.pack_type && PACK_TYPES.includes(med.pack_type)) return med.pack_type;
  const text = `${med?.package_details || ""} ${med?.packaging_label || ""} ${med?.dosage_form || ""} ${med?.pack_size_label || ""}`.toLowerCase();
  if (text.includes("strip")) return "Strip";
  if (
    text.includes("bottle") ||
    text.includes("syrup") ||
    text.includes("suspension") ||
    text.includes("drops") ||
    text.includes("liquid") ||
    text.includes("solution") ||
    text.includes("lotion") ||
    text.includes("tonic")
  ) {
    return "Bottle";
  }
  if (
    text.includes("tube") ||
    text.includes("cream") ||
    text.includes("ointment") ||
    text.includes("gel")
  ) {
    return "Tube";
  }
  if (
    text.includes("packet") ||
    text.includes("pouch") ||
    text.includes("sachet")
  ) {
    return "Packet";
  }
  if (text.includes("box") || text.includes("carton") || text.includes("kit")) {
    return "Box";
  }
  if (
    text.includes("unit") ||
    text.includes("device") ||
    text.includes("inhaler") ||
    text.includes("spray") ||
    text.includes("pen")
  ) {
    return "Unit";
  }
  if (text.includes("tablet") || text.includes("capsule")) return "Strip";
  return "Strip";
};

const deriveUnitsPerPack = (med) => {
  if (
    med?.units_per_pack !== undefined &&
    med?.units_per_pack !== null &&
    !isNaN(parseInt(med.units_per_pack)) &&
    parseInt(med.units_per_pack) > 0
  ) {
    return parseInt(med.units_per_pack);
  }
  if (
    med?.units !== undefined &&
    med?.units !== null &&
    !isNaN(parseInt(med.units)) &&
    parseInt(med.units) > 0
  ) {
    return parseInt(med.units);
  }
  if (med?.packaging_label) {
    const match = String(med.packaging_label).match(/(\d+)/);
    if (match) return parseInt(match[1]);
  }
  if (med?.package_details) {
    const match =
      String(med.package_details).match(
        /(?:of\s+)?(\d+)\s*(?:tablet|capsule|pill|unit|strip|tab|cap|ml|gm|g)/i
      ) || String(med.package_details).match(/(\d+)/);
    if (match) return parseInt(match[1]);
  }
  if (med?.pack_size_label) {
    const match = String(med.pack_size_label).match(/(\d+)/);
    if (match) return parseInt(match[1]);
  }
  if (med?.pack_size) {
    const match = String(med.pack_size).match(/(\d+)/);
    if (match) return parseInt(match[1]);
  }
  return 1;
};

const isCatalogLinked = (it) => {
  if (!it) return false;
  if (it._selectedFromCatalog) return true;
  if (it.inventory_id) return true;
  if (typeof it.product_id === "number") return true;
  if (
    it.product_id &&
    typeof it.product_id === "string" &&
    !it.product_id.startsWith("med-") &&
    !it.product_id.startsWith("ai-") &&
    !it.product_id.startsWith("scanned_")
  ) {
    return true;
  }
  return false;
};

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
  const [showAddSupplierDialog, setShowAddSupplierDialog] = useState(false);
  const [newSupName, setNewSupName] = useState("");
  const [newSupPhone, setNewSupPhone] = useState("");
  const [newSupGstin, setNewSupGstin] = useState("");
  const [newSupEmail, setNewSupEmail] = useState("");
  const [newSupAddress, setNewSupAddress] = useState("");
  const [creatingSup, setCreatingSup] = useState(false);
  const dropdownRef = useRef(null);
  const scrollContainerRef = useRef(null);

  const handleCreateSupplier = async () => {
    if (!newSupName.trim()) return;
    setCreatingSup(true);
    try {
      const res = await axios.post(`${API}/suppliers`, {
        name: newSupName.trim(),
        phone: newSupPhone.trim() || null,
        gstin: newSupGstin.trim() || null,
        email: newSupEmail.trim() || null,
        address: newSupAddress.trim() || null,
      });
      const created = res.data.supplier || res.data;
      setSuppliers((prev) => [created, ...prev]);
      onSelect(created);
      setShowAddSupplierDialog(false);
      setNewSupName("");
      setNewSupPhone("");
      setNewSupGstin("");
      setNewSupEmail("");
      setNewSupAddress("");
      toast.success(`Supplier "${created.name}" created and selected!`);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to create supplier");
    } finally {
      setCreatingSup(false);
    }
  };

  const [selectingGlobal, setSelectingGlobal] = useState(false);
  const supCacheRef = useRef(new Map());
  const supAbortRef = useRef(null);

  const fetchSuppliers = async (p = 1, s = "", append = false) => {
    const trimmed = (s || "").trim();
    const cacheKey = `${p}:${trimmed.toLowerCase()}`;

    if (!append && supCacheRef.current.has(cacheKey)) {
      const cached = supCacheRef.current.get(cacheKey);
      setSuppliers(cached.suppliers || []);
      setHasMore(cached.has_more ?? false);
      setPage(p);
    }

    if (supAbortRef.current) {
      supAbortRef.current.abort();
    }
    const controller = new AbortController();
    supAbortRef.current = controller;

    if (!append && !supCacheRef.current.has(cacheKey)) {
      setLoading(true);
    }

    try {
      const response = await axios.get(
        `${API}/suppliers?page=${p}&limit=20&search=${encodeURIComponent(trimmed)}&include_global=true`,
        { signal: controller.signal }
      );
      const data = response.data.suppliers || [];
      const hasMoreData = response.data.pagination?.has_more ?? data.length === 20;

      supCacheRef.current.set(cacheKey, { suppliers: data, has_more: hasMoreData });
      setSuppliers((prev) => (append ? [...prev, ...data] : data));
      setHasMore(hasMoreData);
      setPage(p);
    } catch (err) {
      if (!axios.isCancel(err)) {
        console.error("Failed to fetch suppliers", err);
      }
    } finally {
      if (supAbortRef.current === controller) {
        setLoading(false);
      }
    }
  };

  const handleSelectSupplier = (supplier) => {
    if (!supplier) return;
    if (supplier.id === "all") {
      onSelect({ id: "all", name: "All Suppliers" });
      setIsOpen(false);
      return;
    }
    onSelect(supplier);
    setIsOpen(false);
  };

  useEffect(() => {
    if (isOpen) {
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
    }, 120);
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
          handleSelectSupplier({ id: "all", name: "All Suppliers" });
        } else if (
          highlightedIndex >= 0 &&
          highlightedIndex < suppliers.length
        ) {
          handleSelectSupplier(suppliers[highlightedIndex]);
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
        className={`flex h-9 w-full items-center justify-between border-0 border-b border-[#515151] light:border-slate-300 rounded-none bg-transparent px-2 py-2 text-sm placeholder:text-muted-foreground/60 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer transition-all ${
          isOpen
            ? "border-b-orange-500 shadow-[0_1px_0_#ff751f,0_0_8px_rgba(255,117,31,0.4)]"
            : "hover:border-b-orange-400"
        }`}
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
          className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${isOpen ? "rotate-180 text-orange-500" : ""}`}
        />
      </div>

      {isOpen && (
        <div className="absolute z-[100] mt-2 max-h-72 w-full min-w-[320px] overflow-hidden rounded-xl border border-border/80 bg-card/95 backdrop-blur-xl text-popover-foreground shadow-2xl animate-in fade-in zoom-in-95 duration-200">
          <div className="flex items-center border-b border-border/40 px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <input
              className="flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground/60 disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="Search suppliers or global distributors..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
            {search && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSearch("");
                }}
                className="text-muted-foreground/60 hover:text-foreground px-2 py-1 text-xs font-bold transition-colors"
                title="Clear search"
              >
                ✕
              </button>
            )}
          </div>
          <div
            ref={scrollContainerRef}
            className="max-h-[220px] overflow-y-auto p-1 custom-scrollbar"
            onScroll={(e) => {
              const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
              if (
                scrollHeight - scrollTop <= clientHeight + 40 &&
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
                  handleSelectSupplier({ id: "all", name: "All Suppliers" });
                }}
                onMouseEnter={() => setHighlightedIndex(-1)}
              >
                {selectedId === "all" && (
                  <Check className="absolute left-3 h-4 w-4 text-primary" />
                )}
                All Suppliers
              </div>
            )}
            {suppliers.map((s, idx) => {
              const isSelected = selectedId === s.id;
              const isHighlighted = highlightedIndex === idx;
              return (
                <div
                  key={`${s.id}-${idx}`}
                  data-index={idx}
                  className={`relative flex w-full cursor-pointer select-none items-start rounded-lg py-2 pl-8 pr-2.5 text-xs outline-none transition-colors border-b border-border/20 last:border-0 ${
                    isHighlighted
                      ? "bg-orange-500/15 text-foreground"
                      : isSelected
                        ? "bg-primary/15 text-primary font-bold"
                        : "text-foreground/90 hover:bg-muted/50"
                  }`}
                  onClick={() => handleSelectSupplier(s)}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                >
                  {isSelected && (
                    <Check className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-orange-500" />
                  )}
                  <div className="flex flex-col flex-1 min-w-0 pr-1">
                    <div className="flex items-center justify-between gap-1.5 mb-0.5">
                      <span className="font-bold text-xs truncate text-foreground">
                        {s.name}
                      </span>
                      {s.is_local || s.source === "local" ? (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 shrink-0 flex items-center gap-1">
                          <Check className="w-2.5 h-2.5" />
                          Your Supplier
                        </span>
                      ) : (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold bg-sky-500/10 text-sky-400 border border-sky-500/20 shrink-0">
                          Global Distributor
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground truncate font-mono">
                      {s.gstin || s.gst_no ? (
                        <span className="font-semibold text-foreground/75">
                          GST: {s.gstin || s.gst_no}
                        </span>
                      ) : null}
                      {s.city || s.state ? (
                        <span>
                          {[s.city, s.state].filter(Boolean).join(", ")}
                        </span>
                      ) : null}
                      {s.phone || s.contact ? (
                        <span>
                          📞 {s.phone || s.contact}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
            {loading && (
              <div className="py-3 text-center flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-orange-500" />
                <span>Loading distributors...</span>
              </div>
            )}
            {!loading && suppliers.length === 0 && (
              <div className="p-8 text-center text-xs text-muted-foreground italic">
                No suppliers or distributors match "{search}"
              </div>
            )}
          </div>
          <div className="p-1.5 border-t border-border/40 bg-muted/20">
            <button
              type="button"
              className="w-full flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-bold text-primary hover:bg-primary/10 rounded-lg transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                setShowAddSupplierDialog(true);
                setIsOpen(false);
              }}
            >
              <Plus className="w-4 h-4" />
              Add New Supplier
            </button>
          </div>
        </div>
      )}

      {/* Quick Add Supplier Dialog */}
      <Dialog open={showAddSupplierDialog} onOpenChange={setShowAddSupplierDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Supplier</DialogTitle>
            <DialogDescription>
              Create a supplier directly from the purchase flow.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs font-semibold">Supplier Name *</Label>
              <Input
                placeholder="e.g. Acme Pharmaceuticals"
                value={newSupName}
                onChange={(e) => setNewSupName(e.target.value)}
                className="mt-1 h-9 text-xs"
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs font-semibold">Phone</Label>
                <Input
                  placeholder="e.g. 9876543210"
                  value={newSupPhone}
                  onChange={(e) => setNewSupPhone(e.target.value)}
                  className="mt-1 h-9 text-xs"
                />
              </div>
              <div>
                <Label className="text-xs font-semibold">GSTIN</Label>
                <Input
                  placeholder="e.g. 27ABCDE1234F1Z5"
                  value={newSupGstin}
                  onChange={(e) => setNewSupGstin(e.target.value)}
                  className="mt-1 h-9 text-xs"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs font-semibold">Email (optional)</Label>
              <Input
                type="email"
                placeholder="e.g. supplier@example.com"
                value={newSupEmail}
                onChange={(e) => setNewSupEmail(e.target.value)}
                className="mt-1 h-9 text-xs"
              />
            </div>
            <div>
              <Label className="text-xs font-semibold">Address (optional)</Label>
              <Input
                placeholder="e.g. Wholesale Market, Mumbai"
                value={newSupAddress}
                onChange={(e) => setNewSupAddress(e.target.value)}
                className="mt-1 h-9 text-xs"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowAddSupplierDialog(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              className="btn-primary"
              disabled={creatingSup || !newSupName.trim()}
              onClick={handleCreateSupplier}
            >
              {creatingSup ? "Creating..." : "Create Supplier"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
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

// Super Clear, Simple Price History Bar Chart (Rate vs MRP) with Auto-Scroll & Dual Highlights
const PriceTrendChart = ({
  trendData = [],
  currentRate = 0,
  currentMrp = 0,
}) => {
  const [hoveredItem, setHoveredItem] = useState(null);
  const scrollContainerRef = useRef(null);

  if (!trendData || trendData.length === 0) return null;

  // 1. Sanitize & filter valid historical items
  let validItems = trendData
    .map((d) => ({
      date: d.purchase_date,
      supplier: d.supplier_name || "Unknown Supplier",
      rate: Number(d.rate_pack || 0),
      mrp: Number(d.mrp_pack || 0),
    }))
    .filter((d) => d.rate > 0);

  // Fallback corrupt MRP (> 10x rate or 0)
  validItems = validItems.map((d) => {
    let cleanMrp = d.mrp;
    if (cleanMrp <= 0 || cleanMrp > d.rate * 10) {
      cleanMrp = d.rate * 1.25;
    }
    return { ...d, mrp: cleanMrp };
  });

  // Identify lowest historical rate
  const historicalItems = validItems.filter((d) => !d.isCurrent);
  const minHistoricalRate =
    historicalItems.length > 0
      ? Math.min(...historicalItems.map((d) => d.rate))
      : null;

  let lowestMarked = false;
  validItems = validItems.map((d) => {
    if (
      minHistoricalRate !== null &&
      d.rate === minHistoricalRate &&
      !lowestMarked
    ) {
      lowestMarked = true;
      return { ...d, isLowest: true };
    }
    return d;
  });

  // Include current entry if available
  if (currentRate > 0) {
    validItems.push({
      date: new Date().toISOString(),
      supplier: "Current Draft Entry",
      rate: Number(currentRate),
      mrp: Number(currentMrp || currentRate * 1.25),
      isCurrent: true,
    });
  }

  if (validItems.length === 0) return null;

  // 2. Find max scale value across all items
  const maxVal =
    Math.max(...validItems.map((d) => Math.max(d.rate, d.mrp))) * 1.2 || 100;

  // 3. Auto-scroll to far right (Current Entry) whenever validItems loads
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollLeft =
        scrollContainerRef.current.scrollWidth;
    }
  }, [validItems.length, currentRate, currentMrp]);

  return (
    <div className="bg-card border border-border/80 rounded-2xl p-4 space-y-2.5 shadow-xs">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-black text-foreground flex items-center gap-1.5 uppercase tracking-wide">
          <TrendingUp className="w-4 h-4 text-orange-500" />
          <span>Price History (Rate vs MRP)</span>
        </h4>
        <div className="flex items-center gap-3 text-[11px] font-bold">
          <div className="flex items-center gap-1.5 text-orange-500">
            <span className="w-2.5 h-2.5 rounded-full bg-orange-500 inline-block shadow-xs"></span>
            <span>Rate</span>
          </div>
          <div className="flex items-center gap-1.5 text-sky-400">
            <span className="w-2.5 h-2.5 rounded-full bg-sky-400 inline-block shadow-xs"></span>
            <span>MRP</span>
          </div>
        </div>
      </div>

      {/* Non-clipped Hover Details Header Strip */}
      <div className="h-6 px-2.5 py-1 rounded-xl bg-muted/50 border border-border/40 text-[10px] font-mono flex items-center justify-between transition-all">
        {hoveredItem ? (
          <>
            <span className="truncate max-w-[55%]">
              <strong className="text-foreground">
                {hoveredItem.supplier}
              </strong>{" "}
              <span className="text-muted-foreground font-sans">
                (
                {hoveredItem.isCurrent
                  ? "Current"
                  : hoveredItem.date
                    ? new Date(hoveredItem.date).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })
                    : ""}
                )
              </span>
            </span>
            <span className="flex items-center gap-2 shrink-0">
              <span>
                Rate:{" "}
                <strong className="text-orange-500 font-extrabold">
                  ₹{hoveredItem.rate.toFixed(2)}
                </strong>
              </span>
              <span>
                MRP:{" "}
                <strong className="text-sky-400 font-extrabold">
                  ₹{hoveredItem.mrp.toFixed(2)}
                </strong>
              </span>
            </span>
          </>
        ) : (
          <span className="text-muted-foreground italic text-[10px] font-sans">
            Hover over any bar to inspect supplier details
          </span>
        )}
      </div>

      {/* Horizontal Scrollable Bar Chart Container with Auto-Scroll Ref */}
      <div
        ref={scrollContainerRef}
        className="w-full overflow-x-auto pb-2 pt-2 px-1 scrollbar-thin scroll-smooth"
      >
        <div className="flex items-end gap-3 min-w-max min-h-[145px] border-b border-border/50 pb-2">
          {validItems.map((item, idx) => {
            const rateHeight = Math.max(
              12,
              Math.round((item.rate / maxVal) * 100)
            );
            const mrpHeight = Math.max(
              12,
              Math.round((item.mrp / maxVal) * 100)
            );
            const formattedDate = item.date
              ? new Date(item.date).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })
              : "N/A";

            return (
              <div
                key={idx}
                onMouseEnter={() => setHoveredItem(item)}
                onMouseLeave={() => setHoveredItem(null)}
                title={`${item.supplier}\nRate: ₹${item.rate.toFixed(2)}\nMRP: ₹${item.mrp.toFixed(2)}`}
                className={`flex flex-col items-center gap-1.5 group cursor-pointer px-2.5 py-2 rounded-2xl min-w-[85px] shrink-0 transition-all ${
                  item.isCurrent
                    ? "ring-2 ring-orange-500 bg-orange-500/10 shadow-md shadow-orange-500/20"
                    : item.isLowest
                      ? "ring-2 ring-sky-400 bg-sky-400/10 shadow-md shadow-sky-400/20"
                      : "hover:bg-muted/40 border border-transparent hover:border-border/60"
                }`}
              >
                {/* Direct Price Labels (Non-overlapping Stacked Header) */}
                <div className="flex flex-col items-center text-[9px] font-black font-mono leading-tight mb-1">
                  <span className="text-sky-400" title="MRP">
                    ₹{Math.round(item.mrp)}
                  </span>
                  <span className="text-orange-500" title="Rate">
                    ₹{Math.round(item.rate)}
                  </span>
                </div>

                {/* Side-by-side Bars */}
                <div className="flex items-end gap-1.5 h-[80px] w-full justify-center">
                  {/* Rate Bar */}
                  <div className="flex flex-col items-center w-4 h-full justify-end">
                    <div
                      style={{ height: `${rateHeight}%` }}
                      className={`w-full rounded-t-md transition-all duration-300 ${
                        item.isCurrent
                          ? "bg-gradient-to-t from-orange-600 to-amber-400"
                          : item.isLowest
                            ? "bg-sky-400"
                            : "bg-orange-500/80 group-hover:bg-orange-500"
                      }`}
                    />
                  </div>

                  {/* MRP Bar */}
                  <div className="flex flex-col items-center w-4 h-full justify-end">
                    <div
                      style={{ height: `${mrpHeight}%` }}
                      className="w-full bg-sky-400/80 group-hover:bg-sky-400 rounded-t-md transition-all duration-300"
                    />
                  </div>
                </div>

                {/* Date / Status Tag */}
                <span
                  className={`text-[10px] font-extrabold tracking-tight px-2 py-0.5 rounded-full mt-1 ${
                    item.isCurrent
                      ? "bg-orange-500 text-white shadow-xs"
                      : item.isLowest
                        ? "bg-sky-400 text-slate-950 font-black shadow-xs"
                        : "text-muted-foreground bg-muted/60"
                  }`}
                >
                  {item.isCurrent
                    ? "Current"
                    : item.isLowest
                      ? `Lowest (${formattedDate})`
                      : formattedDate}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
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

  // Batch Suggestions State (eVital style)
  const [activeBatchItemId, setActiveBatchItemId] = useState(null);
  const [showBatchSuggestions, setShowBatchSuggestions] = useState(false);
  const [batchSuggestions, setBatchSuggestions] = useState([]);
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [hideZeroQuantity, setHideZeroQuantity] = useState(true);
  const [highlightedBatchIndex, setHighlightedBatchIndex] = useState(-1);
  const isMouseOverBatchDropdownRef = useRef(false);
  const batchCacheRef = useRef(new Map());
  const [batchDropdownPosition, setBatchDropdownPosition] = useState({
    top: 0,
    left: 0,
    width: 490,
    transform: "none",
  });

  // Product Catalog Creation Modal State
  const [catalogModalOpen, setCatalogModalOpen] = useState(false);
  const [catalogModalInitialName, setCatalogModalInitialName] = useState("");
  const [catalogModalTargetRowId, setCatalogModalTargetRowId] = useState(null);

  const handleOpenCreateCatalog = (rowId, name = "") => {
    setCatalogModalTargetRowId(rowId);
    setCatalogModalInitialName(name);
    setCatalogModalOpen(true);
    setShowSuggestions(false);
  };

  // Payment Tracking State
  const [paymentStatus, setPaymentStatus] = useState("Unpaid");
  const [amountPaid, setAmountPaid] = useState("");
  const [paymentMode, setPaymentMode] = useState("");

  // Infinite scroll suggestion state
  const [suggestionPage, setSuggestionPage] = useState(1);
  const [hasMoreSuggestions, setHasMoreSuggestions] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const medicineSearchCacheRef = useRef(new Map());
  const medicineAbortControllerRef = useRef(null);

  // Product Details Slideover Drawer State
  const [productSidebar, setProductSidebar] = useState({
    open: false,
    productName: "",
    itemId: null,
    activeTab: "batches", // "batches" or "history"
    loading: false,
    batches: [],
    history: [],
    priceHistoryDetail: null,
  });

  const handleOpenProductSidebar = async (
    productName,
    itemId = null,
    initialTab = "batches",
    currentRate = 0,
    currentMrp = 0
  ) => {
    if (!productName || !productName.trim()) return;
    const cleanName = productName.trim();

    setProductSidebar({
      open: true,
      productName: cleanName,
      itemId,
      activeTab: initialTab,
      loading: true,
      batches: [],
      history: [],
      priceHistoryDetail: null,
    });

    try {
      const headers = {};
      const [batchesRes, historyRes, priceHistRes] = await Promise.all([
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
        axios
          .get(
            `${API}/purchases/price-history?product_name=${encodeURIComponent(cleanName)}&current_rate=${currentRate}&current_mrp=${currentMrp}`,
            { headers }
          )
          .then((r) => r.data)
          .catch(() => null),
      ]);

      setProductSidebar((prev) => ({
        ...prev,
        loading: false,
        batches: batchesRes.batches || [],
        history: historyRes.purchases || [],
        priceHistoryDetail: priceHistRes,
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
  const [applyGstToAll, setApplyGstToAll] = useState(false);
  const [editingUnitsItemId, setEditingUnitsItemId] = useState(null);

  const applyCgstToAllRef = useRef(applyCgstToAll);
  const applySgstToAllRef = useRef(applySgstToAll);
  const applyGstToAllRef = useRef(applyGstToAll);

  useEffect(() => {
    applyCgstToAllRef.current = applyCgstToAll;
  }, [applyCgstToAll]);

  useEffect(() => {
    applySgstToAllRef.current = applySgstToAll;
  }, [applySgstToAll]);

  useEffect(() => {
    applyGstToAllRef.current = applyGstToAll;
    applyCgstToAllRef.current = applyGstToAll;
    applySgstToAllRef.current = applyGstToAll;
  }, [applyGstToAll]);

  const handleApplyGstToAllChange = (checked) => {
    setApplyGstToAll(checked);
    setApplyCgstToAll(checked);
    setApplySgstToAll(checked);
    if (checked) {
      setPurchaseItems((prevItems) => {
        if (prevItems.length === 0) return prevItems;
        const firstRow = prevItems[0];
        const firstGst =
          firstRow.gst !== undefined && firstRow.gst !== ""
            ? firstRow.gst
            : String(
                (parseFloat(firstRow.cgst) || 0) +
                  (parseFloat(firstRow.sgst) || 0)
              );
        const gstNum = parseFloat(firstGst) || 0;
        const halfTax = firstGst === "" ? "" : (gstNum / 2).toString();

        return prevItems.map((item) => {
          const updated = {
            ...item,
            gst: firstGst,
            cgst: halfTax,
            sgst: halfTax,
          };
          const qty = parseInt(updated.quantity || updated.pack_quantity) || 1;
          const ratePack =
            parseFloat(updated.rate_pack || updated.pack_price) || 0;
          const discountVal = parseFloat(updated.discount) || 0;
          const base = qty * ratePack * (1 - discountVal / 100);
          updated.total_amount = (base * (1 + gstNum / 100)).toFixed(2);
          return updated;
        });
      });
    }
  };

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
  const [newPaymentMode, setNewPaymentMode] = useState("UPI");
  const [pdfConfirmDialog, setPdfConfirmDialog] = useState({
    open: false,
    purchaseId: null,
  });
  const [removeConfirmDialog, setRemoveConfirmDialog] = useState({
    open: false,
    itemId: null,
  });
  const [showDiscardConfirmDialog, setShowDiscardConfirmDialog] = useState(false);

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

    const nextPos = {
      top: positionAbove ? rect.top - 4 : rect.bottom + 4,
      left: leftPos,
      width: dropdownWidth,
      transform: positionAbove ? "translateY(-100%)" : "none",
    };

    setDropdownPosition((prev) => {
      if (
        Math.abs(prev.top - nextPos.top) < 1 &&
        Math.abs(prev.left - nextPos.left) < 1 &&
        prev.width === nextPos.width &&
        prev.transform === nextPos.transform
      ) {
        return prev;
      }
      return nextPos;
    });
  };

  // Sync dropdown positioning smoothly on scroll or resize without infinite RAF re-renders
  useEffect(() => {
    if (!activeItemId || !showSuggestions) return;

    updateDropdownPosition(activeItemId);

    const handleSync = () => {
      updateDropdownPosition(activeItemId);
    };

    window.addEventListener("scroll", handleSync, true);
    window.addEventListener("resize", handleSync);

    return () => {
      window.removeEventListener("scroll", handleSync, true);
      window.removeEventListener("resize", handleSync);
    };
  }, [activeItemId, showSuggestions]);

  // Clean, rock-solid outside click handler for suggestions dropdown
  useEffect(() => {
    if (!showSuggestions || !activeItemId) return;

    const handleOutsideClick = (e) => {
      const activeInput = inputRefs.current[activeItemId];
      const dropdownEl = document.querySelector(
        '[data-suggestions-dropdown="true"]'
      );

      if (
        activeInput &&
        (activeInput === e.target || activeInput.contains(e.target))
      ) {
        return;
      }
      if (
        dropdownEl &&
        (dropdownEl === e.target || dropdownEl.contains(e.target))
      ) {
        return;
      }

      setShowSuggestions(false);
      setActiveItemId(null);
      setHighlightedSuggestionIndex(-1);
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [showSuggestions, activeItemId]);

  // Batch Suggestions Helpers & Position Management (eVital style)
  const updateBatchDropdownPosition = (itemId) => {
    const el = document.getElementById(`batch-${itemId}`);
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const dropdownWidth = Math.min(500, Math.max(420, window.innerWidth - 32));
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const dropdownHeight = 240;
    const positionAbove = spaceBelow < dropdownHeight && spaceAbove > spaceBelow;

    let leftPos = rect.left;
    if (leftPos + dropdownWidth > window.innerWidth - 16) {
      leftPos = Math.max(16, window.innerWidth - dropdownWidth - 16);
    }

    const nextPos = {
      top: positionAbove ? rect.top - 4 : rect.bottom + 4,
      left: leftPos,
      width: dropdownWidth,
      transform: positionAbove ? "translateY(-100%)" : "none",
    };

    setBatchDropdownPosition((prev) => {
      if (
        Math.abs(prev.top - nextPos.top) < 1 &&
        Math.abs(prev.left - nextPos.left) < 1 &&
        prev.width === nextPos.width &&
        prev.transform === nextPos.transform
      ) {
        return prev;
      }
      return nextPos;
    });
  };

  useEffect(() => {
    if (!activeBatchItemId || !showBatchSuggestions) return;

    updateBatchDropdownPosition(activeBatchItemId);

    const handleSync = () => {
      updateBatchDropdownPosition(activeBatchItemId);
    };

    window.addEventListener("scroll", handleSync, true);
    window.addEventListener("resize", handleSync);

    return () => {
      window.removeEventListener("scroll", handleSync, true);
      window.removeEventListener("resize", handleSync);
    };
  }, [activeBatchItemId, showBatchSuggestions]);

  useEffect(() => {
    if (!showBatchSuggestions || !activeBatchItemId) return;

    const handleOutsideClick = (e) => {
      const activeInput = document.getElementById(`batch-${activeBatchItemId}`);
      const dropdownEl = document.querySelector('[data-batch-dropdown="true"]');

      if (
        activeInput &&
        (activeInput === e.target || activeInput.contains(e.target))
      ) {
        return;
      }
      if (
        dropdownEl &&
        (dropdownEl === e.target || dropdownEl.contains(e.target))
      ) {
        return;
      }

      setShowBatchSuggestions(false);
      setActiveBatchItemId(null);
      setHighlightedBatchIndex(-1);
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [showBatchSuggestions, activeBatchItemId]);

  const fetchBatchesForProduct = async (productName, productId = null) => {
    if (!productName && !productId) {
      setBatchSuggestions([]);
      return;
    }
    const cleanName = (productName || "").trim();
    // Global catalogue ids are numbers, so normalise before using as a key
    const cacheKey = String(productId || cleanName).toLowerCase();
    if (batchCacheRef.current.has(cacheKey)) {
      setBatchSuggestions(batchCacheRef.current.get(cacheKey) || []);
      return;
    }

    setLoadingBatches(true);
    try {
      const headers = {};
      const params = new URLSearchParams();
      if (productId) params.append("product_id", productId);
      if (cleanName) params.append("product_name", cleanName);

      const res = await axios.get(
        `${API}/inventory/product-batches?${params.toString()}`,
        { headers }
      );
      const list = res.data?.batches || res.data || [];
      const validBatches = Array.isArray(list) ? list : [];
      batchCacheRef.current.set(cacheKey, validBatches);
      setBatchSuggestions(validBatches);
    } catch (err) {
      console.error("Failed to fetch batches:", err);
      setBatchSuggestions([]);
    } finally {
      setLoadingBatches(false);
    }
  };

  const handleOpenBatchSuggestions = (itemId, item) => {
    setActiveBatchItemId(itemId);
    setHighlightedBatchIndex(-1);
    updateBatchDropdownPosition(itemId);
    setShowBatchSuggestions(true);
    if (item.product_name || item.product_id) {
      fetchBatchesForProduct(item.product_name, item.product_id);
    } else {
      setBatchSuggestions([]);
    }
  };

  const handleSelectBatchForItem = (itemId, batch) => {
    const units =
      parseInt(batch.units_per_pack || batch.units) ||
      parseInt(purchaseItems.find((i) => i.id === itemId)?.units) ||
      1;
    const ratePack =
      parseFloat(batch.pack_price || batch.purchase_price) || 0;
    const mrpPack =
      parseFloat(batch.mrp_pack) ||
      (batch.mrp ? parseFloat(batch.mrp) * units : 0);

    setPurchaseItems((prev) =>
      prev.map((row) => {
        if (row.id === itemId) {
          const qty =
            parseInt(row.quantity) || parseInt(row.pack_quantity) || 1;
          const finalRate =
            ratePack > 0 ? ratePack : parseFloat(row.rate_pack) || 0;
          return {
            ...row,
            batch_no: batch.batch_no || row.batch_no,
            expiry_date: batch.expiry_date
              ? formatExpiry(batch.expiry_date)
              : row.expiry_date,
            mrp_pack: mrpPack > 0 ? mrpPack : row.mrp_pack,
            rate_pack: finalRate > 0 ? finalRate : row.rate_pack,
            pack_price: finalRate > 0 ? finalRate : row.pack_price,
            units: units > 0 ? units : row.units || 1,
            units_per_pack: units > 0 ? units : row.units_per_pack || 1,
            hsn_no: batch.hsn_no || row.hsn_no,
            manufacturer: batch.manufacturer || row.manufacturer,
            salt_composition: batch.salt_composition || row.salt_composition,
            pack_type: batch.pack_type || row.pack_type || "Strip",
            total_amount: (
              qty * (finalRate > 0 ? finalRate : parseFloat(row.rate_pack) || 0)
            ).toFixed(2),
          };
        }
        return row;
      })
    );

    setShowBatchSuggestions(false);
    setActiveBatchItemId(null);
    setHighlightedBatchIndex(-1);
    toast.success(`Selected batch ${batch.batch_no}`);

    setTimeout(() => {
      document.getElementById(`expiry-${itemId}`)?.focus();
    }, 60);
  };

  // Delete dialog
  const [deleteDialog, setDeleteDialog] = useState({
    open: false,
    purchase: null,
  });
  // Per-batch stock effect of deleting the purchase in the dialog
  const [deleteImpact, setDeleteImpact] = useState({ loading: false, data: null });
  const [deletingPurchase, setDeletingPurchase] = useState(false);
  const [listLoading, setListLoading] = useState(false);

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
    gst: "", // Total GST (%)
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

  // Handle Restock Reminder items transferred from notification or reminder center
  useEffect(() => {
    if (location.state?.openNew || location.state?.restockItems) {
      const restockItems = location.state.restockItems;
      const mappedRows = Array.isArray(restockItems) && restockItems.length > 0
        ? restockItems.map((item, idx) => ({
            ...emptyItem,
            id: `restock-${Date.now()}-${idx}`,
            product_name: item.product_name || "",
            quantity: String(item.quantity || "10"),
            batch_no: item.batch_no || "",
            mrp_per_unit: item.unit_price ? String(item.unit_price) : "",
          }))
        : [{ ...emptyItem, id: `temp-${Date.now()}` }];

      setShowNewPurchase(true);
      setPurchaseItems(mappedRows);

      const newTabId = uuidv4();
      const defaultMode = settings?.purchase_payment_mode_default || "";
      const defaultStatus = settings?.purchase_payment_status || "Unpaid";
      setTabs((prev) => [
        ...prev,
        {
          id: newTabId,
          data: {
            selectedSupplier: "",
            invoiceNo: "",
            purchaseDate: new Date().toISOString().slice(0, 10),
            purchaseItems: mappedRows,
            paymentStatus: defaultStatus,
            amountPaid: "",
            paymentMode: defaultMode !== "none" ? defaultMode : "",
          },
        },
      ]);
      setActiveTabId(newTabId);

      // Clean history state so refresh does not re-open
      window.history.replaceState({}, document.title);
      toast.info("Restock items prefilled in Purchase Order");
    }
  }, [location.state, settings]);

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
      setListLoading(true);
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
      } finally {
        setListLoading(false);
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

  // Search medicines for suggestions with high-speed ranking & instant client cache
  useEffect(() => {
    const trimmed = (searchMedicine || "").trim();
    if (trimmed.length < 2) {
      if (medicineAbortControllerRef.current) {
        medicineAbortControllerRef.current.abort();
      }
      setMedicineSuggestions([]);
      setShowSuggestions(false);
      setHighlightedSuggestionIndex(-1);
      setHasMoreSuggestions(false);
      setSuggestionPage(1);
      return;
    }

    // Immediately show suggestions for search queries >= 2 chars
    setShowSuggestions(true);

    const cacheKey = trimmed.toLowerCase();
    // ⚡ INSTANT CACHE HIT (0ms): If previously searched, render immediately without any delay!
    if (medicineSearchCacheRef.current.has(cacheKey)) {
      const cached = medicineSearchCacheRef.current.get(cacheKey);
      setMedicineSuggestions(cached.medicines || []);
      setHasMoreSuggestions(cached.has_more ?? false);
      setSuggestionPage(1);
      setShowSuggestions(true);
      setHighlightedSuggestionIndex(-1);
    }

    const searchMedicines = async () => {
      if (medicineAbortControllerRef.current) {
        medicineAbortControllerRef.current.abort();
      }
      const controller = new AbortController();
      medicineAbortControllerRef.current = controller;

      if (!medicineSearchCacheRef.current.has(cacheKey)) {
        setLoadingSuggestions(true);
      }

      try {
        const response = await axios.get(
          `${API}/medicines/search?q=${encodeURIComponent(trimmed)}&limit=20&fuzzy=true&page=1`,
          { signal: controller.signal }
        );

        const meds = response.data.medicines || [];
        const hasMore = response.data.meta?.has_more || false;

        medicineSearchCacheRef.current.set(cacheKey, { medicines: meds, has_more: hasMore });
        setMedicineSuggestions(meds);
        setHasMoreSuggestions(hasMore);
        setSuggestionPage(1);
        setShowSuggestions(true);
        setHighlightedSuggestionIndex(-1);
      } catch (error) {
        if (!axios.isCancel(error)) {
          console.error("Medicine search error:", error);
        }
      } finally {
        if (medicineAbortControllerRef.current === controller) {
          setLoadingSuggestions(false);
        }
      }
    };

    // ⚡ Snappy 120ms debounce for instantaneous feel
    const debounce = setTimeout(searchMedicines, 120);
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

  const handleCancelNewPurchase = (force = false) => {
    const hasUnsavedData = purchaseItems.some(
      (i) => i.product_name && i.product_name.trim() !== ""
    );
    if (!force && hasUnsavedData) {
      setShowDiscardConfirmDialog(true);
      return;
    }
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
    setShowDiscardConfirmDialog(false);
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
      let gst = "";
      if (prev.length > 0) {
        if (
          applyGstToAllRef.current ||
          applyCgstToAllRef.current ||
          applySgstToAllRef.current
        ) {
          cgst = prev[0].cgst;
          sgst = prev[0].sgst;
          gst =
            prev[0].gst !== undefined && prev[0].gst !== ""
              ? prev[0].gst
              : String(
                  (parseFloat(cgst) || 0) + (parseFloat(sgst) || 0) || ""
                );
        }
      }
      const newRow = {
        ...emptyItem,
        id: `temp-${Date.now()}`,
        cgst,
        sgst,
        gst,
      };
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
    const rateUnit = units > 0 ? parseFloat((ratePack / units).toFixed(4)) : ratePack;
    const mrpUnit = units > 0 ? parseFloat((mrpPack / units).toFixed(2)) : mrpPack;
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
      prev.map((i) => {
        if (i.id !== itemId) return i;
        const updated = { ...i, [field]: value };
        if (field === "units") {
          updated.units_per_pack = value;
        } else if (field === "units_per_pack") {
          updated.units = value;
        }
        return updated;
      })
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
      const isTaxField =
        field === "gst" || field === "cgst" || field === "sgst";

      if (!isFirstRow && isTaxField) {
        if (field === "cgst" && applyCgstToAllRef.current) {
          setTimeout(() => setApplyCgstToAll(false), 0);
        }
        if (field === "sgst" && applySgstToAllRef.current) {
          setTimeout(() => setApplySgstToAll(false), 0);
        }
        if (field === "gst" && applyGstToAllRef.current) {
          setTimeout(() => setApplyGstToAll(false), 0);
        }
      }

      const shouldPropagateCgst =
        isFirstRow && field === "cgst" && applyCgstToAllRef.current;
      const shouldPropagateSgst =
        isFirstRow && field === "sgst" && applySgstToAllRef.current;
      const shouldPropagateGst =
        isFirstRow &&
        (field === "gst" ||
          (isTaxField && applyGstToAllRef.current)) &&
        applyGstToAllRef.current;

      return prev.map((item) => {
        const isTarget = item.id === itemId;
        if (
          !isTarget &&
          !shouldPropagateCgst &&
          !shouldPropagateSgst &&
          !shouldPropagateGst
        )
          return item;

        let updatedValue = isTarget ? value : item[field];
        if (field === "cgst" && shouldPropagateCgst) {
          updatedValue = value;
        }
        if (field === "sgst" && shouldPropagateSgst) {
          updatedValue = value;
        }
        if (field === "gst" && shouldPropagateGst) {
          updatedValue = value;
        }

        const updated = { ...item, [field]: updatedValue };

        if (field === "gst") {
          const gstNum = parseFloat(updatedValue) || 0;
          const halfTax =
            updatedValue === "" ? "" : (gstNum / 2).toString();
          updated.cgst = halfTax;
          updated.sgst = halfTax;
          updated.gst = updatedValue;
        } else if (field === "cgst") {
          updated.sgst = updatedValue;
          const totalGst = (parseFloat(updatedValue) || 0) * 2;
          updated.gst = updatedValue === "" ? "" : totalGst.toString();
        } else if (field === "sgst") {
          updated.cgst = updatedValue;
          const totalGst = (parseFloat(updatedValue) || 0) * 2;
          updated.gst = updatedValue === "" ? "" : totalGst.toString();
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
          (field === "gst" && (isTarget || shouldPropagateGst)) ||
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
  // Check price history silently (used onBlur and immediately on auto-fill)
  const checkPriceHistorySilent = async (
    itemId,
    productName,
    currentRateParam,
    currentMrpParam
  ) => {
    const currentRate = parseFloat(currentRateParam);
    const currentMrp = parseFloat(currentMrpParam);
    if (!productName || !currentRate || currentRate <= 0) return;

    try {
      const response = await axios.get(`${API}/purchases/price-history`, {
        params: {
          product_name: productName,
          current_rate: currentRate,
          current_mrp: currentMrp || 0,
        },
      });

      const data = response.data;
      if (
        data.is_higher_price_alert ||
        data.mrp_increased ||
        data.is_mrp_lowered_alert ||
        data.mrp_lowered
      ) {
        setPriceAlerts((prev) => ({
          ...prev,
          [itemId]: data,
        }));
      } else {
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

  // Real-time automatic evaluation of price history as soon as user types or lands on draft
  useEffect(() => {
    if (!showNewPurchase || purchaseItems.length === 0) return;

    const timer = setTimeout(() => {
      purchaseItems.forEach((item) => {
        const rate = parseFloat(item.rate_pack || item.pack_price || 0);
        const mrp =
          parseFloat(
            item.mrp_pack ||
              (item.mrp_unit && item.units ? item.mrp_unit * item.units : 0)
          ) || 0;
        if (
          item.product_name &&
          item.product_name.trim().length > 0 &&
          rate > 0
        ) {
          checkPriceHistorySilent(item.id, item.product_name, rate, mrp);
        }
      });
    }, 300);

    return () => clearTimeout(timer);
  }, [purchaseItems, showNewPurchase]);

  // Check historical prices & open right sidebar on history tab
  const checkPriceHistory = async (
    itemId,
    productName,
    currentRate,
    currentMrp
  ) => {
    if (!productName) {
      toast.error("Enter product name first");
      return;
    }
    handleOpenProductSidebar(
      productName,
      itemId,
      "history",
      currentRate,
      currentMrp
    );
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

    // Extract pack units & pack type
    const unitsPerPack = deriveUnitsPerPack(medicine);
    const derivedPackType = derivePackType(medicine);

    // Calculate Pack MRP and Unit MRP
    let mrpPackNum = 0;
    if (
      medicine.mrp !== undefined &&
      medicine.mrp !== null &&
      !isNaN(parseFloat(medicine.mrp)) &&
      parseFloat(medicine.mrp) > 0
    ) {
      mrpPackNum = parseFloat(medicine.mrp);
    } else if (
      medicine["price(₹)"] !== undefined &&
      medicine["price(₹)"] !== null &&
      !isNaN(parseFloat(medicine["price(₹)"])) &&
      parseFloat(medicine["price(₹)"]) > 0
    ) {
      mrpPackNum = parseFloat(medicine["price(₹)"]);
    } else if (medicine.mrp_per_unit && !isNaN(parseFloat(medicine.mrp_per_unit))) {
      mrpPackNum = parseFloat(medicine.mrp_per_unit) * unitsPerPack;
    }

    const mrpPackFixed = mrpPackNum > 0 ? mrpPackNum.toFixed(2) : "";

    let mrpUnitNum = 0;
    if (
      medicine.unit_mrp !== undefined &&
      medicine.unit_mrp !== null &&
      !isNaN(parseFloat(medicine.unit_mrp)) &&
      parseFloat(medicine.unit_mrp) > 0
    ) {
      mrpUnitNum = parseFloat(medicine.unit_mrp);
    } else if (
      medicine.mrp_per_unit &&
      !isNaN(parseFloat(medicine.mrp_per_unit)) &&
      parseFloat(medicine.mrp_per_unit) > 0
    ) {
      mrpUnitNum = parseFloat(medicine.mrp_per_unit);
    } else if (mrpPackNum > 0 && unitsPerPack > 0) {
      mrpUnitNum = parseFloat((mrpPackNum / unitsPerPack).toFixed(2));
    }

    // Determine purchase rate (trade price PTR or inventory historical price or 70% of MRP)
    let suggestedRatePack = 0;
    if (isInventory && medicine.purchase_price && !isNaN(parseFloat(medicine.purchase_price))) {
      const pPrice = parseFloat(medicine.purchase_price);
      suggestedRatePack = pPrice > mrpUnitNum ? pPrice : pPrice * unitsPerPack;
    } else if (
      medicine.trade_price !== undefined &&
      medicine.trade_price !== null &&
      !isNaN(parseFloat(medicine.trade_price)) &&
      parseFloat(medicine.trade_price) > 0
    ) {
      suggestedRatePack = parseFloat(medicine.trade_price);
    } else if (
      medicine.rate_pack !== undefined &&
      medicine.rate_pack !== null &&
      !isNaN(parseFloat(medicine.rate_pack)) &&
      parseFloat(medicine.rate_pack) > 0
    ) {
      suggestedRatePack = parseFloat(medicine.rate_pack);
    } else if (mrpPackNum > 0) {
      suggestedRatePack = parseFloat((mrpPackNum * 0.7).toFixed(2));
    }

    const ratePackFixed = suggestedRatePack > 0 ? suggestedRatePack.toFixed(2) : "";

    // Manufacturer & Salt composition
    const manufacturer =
      medicine.manufacturer || medicine.manufacturer_name || "";
    const salt_composition =
      medicine.salt_composition ||
      medicine.active_ingredients ||
      [medicine.short_composition1, medicine.short_composition2]
        .filter(Boolean)
        .join(", ") ||
      "";

    // Taxes (CGST & SGST)
    let finalCgst = "";
    let finalSgst = "";
    if (medicine.cgst !== undefined && medicine.cgst !== null && medicine.cgst !== "") {
      finalCgst = String(medicine.cgst);
    } else if (medicine.tax_rate !== undefined && medicine.tax_rate !== null && medicine.tax_rate !== "") {
      finalCgst = String(parseFloat(medicine.tax_rate) / 2);
    }

    if (medicine.sgst !== undefined && medicine.sgst !== null && medicine.sgst !== "") {
      finalSgst = String(medicine.sgst);
    } else if (medicine.tax_rate !== undefined && medicine.tax_rate !== null && medicine.tax_rate !== "") {
      finalSgst = String(parseFloat(medicine.tax_rate) / 2);
    }

    // HSN Code
    const hsnCode = String(medicine.hsn_code || medicine.hsn_no || "").trim();

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
      const shouldPropagateCgst = isFirstRow && applyCgstToAllRef.current;
      const shouldPropagateSgst = isFirstRow && applySgstToAllRef.current;
      const shouldPropagateGst = isFirstRow && applyGstToAllRef.current;

      return prev.map((item) => {
        if (
          item.id !== itemId &&
          !shouldPropagateCgst &&
          !shouldPropagateSgst &&
          !shouldPropagateGst
        )
          return item;

        if (item.id === itemId) {
          // If the user already manually typed a rate, keep it; otherwise fill suggested wholesale trade rate
          const finalRatePack = hasValue(item.rate_pack)
            ? String(item.rate_pack)
            : hasValue(item.pack_price)
              ? String(item.pack_price)
              : ratePackFixed;

          // MRP pack comes from catalog
          const finalMrpPack = mrpPackFixed || (hasValue(item.mrp_pack) ? String(item.mrp_pack) : "");

          // Units per pack comes from catalog
          const finalUnits = String(unitsPerPack);

          // Manufacturer & Salt from catalog
          const finalManufacturer = manufacturer || (hasValue(item.manufacturer) ? item.manufacturer : "");
          const finalSaltComposition = salt_composition || (hasValue(item.salt_composition) ? item.salt_composition : "");

          // Batch & Expiry: keep if existing, or if inventory batch available
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

          // HSN
          const finalHsn = hsnCode || (hasValue(item.hsn_no) ? item.hsn_no : "");

          // Taxes
          let cgstStr = finalCgst !== "" ? finalCgst : (hasValue(item.cgst) ? String(item.cgst) : "");
          let sgstStr = finalSgst !== "" ? finalSgst : (hasValue(item.sgst) ? String(item.sgst) : "");
          const calculatedGst =
            (parseFloat(cgstStr) || 0) + (parseFloat(sgstStr) || 0) > 0
              ? String((parseFloat(cgstStr) || 0) + (parseFloat(sgstStr) || 0))
              : "";

          const qtyVal = parseInt(item.quantity || item.pack_quantity) || 1;
          const rateVal = parseFloat(finalRatePack) || 0;
          const cgstVal = parseFloat(cgstStr) || 0;
          const sgstVal = parseFloat(sgstStr) || 0;
          const baseAmt = qtyVal * rateVal;
          const calculatedTotal = (
            baseAmt *
            (1 + (cgstVal + sgstVal) / 100)
          ).toFixed(2);

          return {
            ...item,
            product_id:
              medicine.id || medicine.product_id || (medicine._id ? String(medicine._id) : `med-${Date.now()}`),
            product_name: medicine.product_name || medicine.name,
            _selectedFromCatalog: true,
            manufacturer: finalManufacturer,
            salt_composition: finalSaltComposition,
            pack_type: derivedPackType,
            units: finalUnits,
            units_per_pack: finalUnits,
            rate_pack: finalRatePack,
            mrp_pack: finalMrpPack,
            mrp_unit: mrpUnitNum > 0 ? mrpUnitNum.toFixed(2) : "",
            batch_no: finalBatchNo,
            expiry_date: finalExpiryDate ? formatExpiry(finalExpiryDate) : "",
            hsn_no: finalHsn,
            cgst: cgstStr,
            sgst: sgstStr,
            gst: calculatedGst,
            total_amount: calculatedTotal,
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
          if ((shouldPropagateCgst || shouldPropagateGst) && finalCgst !== "") {
            updated.cgst = finalCgst;
          }
          if ((shouldPropagateSgst || shouldPropagateGst) && finalSgst !== "") {
            updated.sgst = finalSgst;
          }
          if (shouldPropagateGst) {
            const tot =
              (parseFloat(finalCgst) || 0) + (parseFloat(finalSgst) || 0);
            if (tot > 0) updated.gst = String(tot);
          }
          return updated;
        }
      });
    });

    // Call silent ping immediately so if the loaded price is high, it highlights!
    checkPriceHistorySilent(
      itemId,
      medicine.product_name || medicine.name,
      ratePackFixed,
      mrpPackFixed
    );

    setSearchMedicine("");
    setMedicineSuggestions([]);
    setShowSuggestions(false);
    setIsMouseOverSuggestions(false);
    setActiveItemId(null);

    // Auto-focus the batch number input so the user can immediately type the batch number!
    setTimeout(() => {
      const batchInput = document.getElementById(`batch-${itemId}`);
      if (batchInput) {
        batchInput.focus({ preventScroll: true });
        batchInput.select?.();
      }
    }, 60);

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
        toast.success("AI recovered global product attributes");
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
          `AI Autofilled missing metadata for ${filledCount} item(s)`
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

    if (paymentStatus === "Partial") {
      const pAmount = parseFloat(amountPaid);
      if (isNaN(pAmount) || pAmount <= 0) {
        toast.error("Please enter a valid Initial Paid amount for Partial payment");
        return;
      }
    }

    const validItems = purchaseItems.filter(
      (item) => item.product_name && item.product_name.trim() !== ""
    );

    if (validItems.length === 0) {
      toast.error("Please add at least one item");
      return;
    }

    const uncatalogedItems = validItems.filter((item) => !isCatalogLinked(item));
    if (uncatalogedItems.length > 0) {
      const firstUncataloged = uncatalogedItems[0];
      toast.error(
        `"${firstUncataloged.product_name}" is not in the Product Catalog. Please select it from suggestions or create its catalog entry.`
      );
      handleOpenCreateCatalog(firstUncataloged.id, firstUncataloged.product_name);
      return;
    }

    const supplier = suppliers.find((s) => s.id === selectedSupplier);

    setSubmitting(true);

    try {
      let itemsToProcess = [...validItems];
      if (settings?.purchase_permanent_autofill !== false) {
        const missingCandidates = itemsToProcess.filter(
          (item) =>
            (!item.salt_composition || !item.salt_composition.trim()) ||
            (!item.manufacturer || !item.manufacturer.trim())
        );
        if (missingCandidates.length > 0) {
          try {
            await Promise.all(
              missingCandidates.map(async (cItem) => {
                try {
                  const enrichRes = await axios.post(`${API}/medicines/enrich`, {
                    product_name: cItem.product_name,
                  }, { timeout: 3500 });
                  if (enrichRes.data) {
                    if (!cItem.manufacturer && enrichRes.data.manufacturer) {
                      cItem.manufacturer = enrichRes.data.manufacturer;
                    }
                    if (!cItem.salt_composition && enrichRes.data.salt_composition) {
                      cItem.salt_composition = enrichRes.data.salt_composition;
                    }
                  }
                } catch (e) {
                  console.warn(`Permanent autofill fallback for ${cItem.product_name}:`, e.message);
                }
              })
            );
          } catch (e) {
            console.warn("Permanent autofill error fallback:", e);
          }
        }
      }

      const payload = {
        supplier_id: selectedSupplier,
        supplier_name: supplier?.name || "Unknown",
        supplier_data: supplier
          ? {
              name: supplier.name,
              phone: supplier.phone || supplier.contact,
              gst_no: supplier.gstin || supplier.gst_no,
              address: supplier.address,
              city: supplier.city,
              state: supplier.state,
              global_id: supplier.global_id || supplier.id,
            }
          : null,
        invoice_no: invoiceNo || null,
        purchase_date: purchaseDate,
        items: itemsToProcess.map((item) => ({
          product_id: item.product_id,
          product_name: item.product_name,
          batch_no: item.batch_no || null,
          expiry_date: item.expiry_date ? expiryToIso(item.expiry_date) || item.expiry_date : null,
          manufacturer: item.manufacturer || null,
          salt_composition: item.salt_composition || null,
          pack_type: item.pack_type || "Strip",
          pack_quantity: parseInt(item.quantity) || 1,
          units_per_pack: parseInt(item.units) || 1,
          pack_price: parseFloat(item.rate_pack) || 0,
          mrp_per_unit:
            (parseFloat(item.mrp_pack) || 0) > 0 && (parseInt(item.units) || 1) > 0
              ? parseFloat(
                  (
                    (parseFloat(item.mrp_pack) || 0) /
                    (parseInt(item.units) || 1)
                  ).toFixed(2)
                )
              : 0,
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

        if (res.data?.created_supplier) {
          const newSup = res.data.created_supplier;
          setSuppliers((prev) => {
            const filtered = prev.filter(
              (s) => s.id !== newSup.id && s.id !== newSup.global_code
            );
            return [newSup, ...filtered];
          });
        }

        const purchaseId = res.data?.purchase?.id;

        if (purchaseId) {
          setPdfConfirmDialog({ open: true, purchaseId });
        }
      }

      setEditingPurchaseId(null);
      setPaymentStatus("Unpaid");
      setAmountPaid("");
      clearDraft();
      handleCancelNewPurchase(true);
      await fetchPurchases(pagination.page);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to save purchase", {
        duration: error.response?.data?.code === "STOCK_CONSUMED" ? 9000 : undefined,
      });
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
      expiry_date: item.expiry_date ? formatExpiry(item.expiry_date) : "",
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
            expiry_date: item.expiry_date ? expiryToIso(item.expiry_date) || item.expiry_date : null,
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
      toast.error(error.response?.data?.detail || "Failed to update purchase", {
        duration: error.response?.data?.code === "STOCK_CONSUMED" ? 9000 : undefined,
      });
    } finally {
      setSubmitting(false);
    }
  };

  // ============ DELETE PURCHASE ============

  useEffect(() => {
    const id = deleteDialog.open ? deleteDialog.purchase?.id : null;
    if (!id) {
      setDeleteImpact({ loading: false, data: null });
      return;
    }
    let cancelled = false;
    setDeleteImpact({ loading: true, data: null });
    axios
      .get(`${API}/purchases/${id}/stock-impact`)
      .then((res) => !cancelled && setDeleteImpact({ loading: false, data: res.data }))
      .catch(() => !cancelled && setDeleteImpact({ loading: false, data: null }));
    return () => {
      cancelled = true;
    };
  }, [deleteDialog.open, deleteDialog.purchase?.id]);

  // mode: true = remove all its stock, "unsold" = remove what's left on the shelf, false = keep stock
  const handleDeletePurchase = async (deleteInventory = false) => {
    if (!deleteDialog.purchase) return;

    setDeletingPurchase(true);
    try {
      const response = await axios.delete(
        `${API}/purchases/${deleteDialog.purchase.id}?delete_inventory=${deleteInventory}`
      );
      toast.success(response.data.message);
      if (deleteInventory && response.data.removed_units > 0) {
        toast.info(
          `${response.data.removed_units} units removed from ${response.data.deleted_inventory_items} batch(es)`
        );
      }
      setDeleteDialog({ open: false, purchase: null });
      await fetchPurchases(pagination.page);
    } catch (error) {
      if (error.response?.data?.impact) {
        setDeleteImpact({ loading: false, data: error.response.data.impact });
      }
      toast.error(error.response?.data?.detail || "Failed to delete purchase");
    } finally {
      setDeletingPurchase(false);
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
        expiry_date: rawExpiry ? formatExpiry(rawExpiry) : "",
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
          payment_mode: newPaymentMode || "UPI",
        }
      );
      toast.success("Payment added successfully");
      setPaymentDialog({ open: false, purchase: null });
      setNewPaymentAmount("");
      setNewPaymentNotes("");
      setNewPaymentMode("UPI");
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
              <Label>Payment Mode *</Label>
              <Select
                value={newPaymentMode || "UPI"}
                onValueChange={(val) => setNewPaymentMode(val)}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select Mode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="UPI">UPI</SelectItem>
                  <SelectItem value="Cash">Cash</SelectItem>
                  <SelectItem value="Card">Card</SelectItem>
                  <SelectItem value="Net Banking">Net Banking</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Input
                placeholder="Payment reference or notes..."
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

      {/* Discard / Close Confirmation Dialog */}
      <AlertDialog
        open={showDiscardConfirmDialog}
        onOpenChange={setShowDiscardConfirmDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-amber-500">
              <AlertTriangle className="w-5 h-5" /> Unsaved Purchase Items
            </AlertDialogTitle>
            <AlertDialogDescription>
              You have entered items in the purchase invoice. Do you want to save
              this draft before closing or discard all changes?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row flex-wrap sm:justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDiscardConfirmDialog(false)}
            >
              Keep Editing
            </Button>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              onClick={() => handleCancelNewPurchase(true)}
            >
              Discard Changes
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
                  style={{ colorScheme: "dark light" }}
                  className="h-9 text-xs font-semibold rounded-xl border-border bg-background text-foreground shadow-2xs focus-visible:ring-2 focus-visible:ring-orange-500/30 focus-visible:border-orange-500 cursor-pointer"
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
            <div className="flex items-center gap-2 shrink-0 self-end lg:self-center max-md:w-full max-md:flex-wrap max-md:self-stretch">
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
                    <span>Autofill<span className="max-md:hidden"> ({getOS() === "mac" ? "⌥I" : "Alt+I"})</span></span>
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
                className="h-9 w-9 p-0 rounded-xl hover:bg-muted max-md:hidden"
                title="Close"
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </Button>
            </div>
          </div>

          {/* Items Table Container */}

          {/* Items Table - Inline Editable with enhanced fields */}
          <div className="border-2 border-border rounded-2xl relative overflow-hidden bg-card shadow-sm">
            <Table mobileCards className="table-fixed min-w-[1100px] w-full" wrapperClassName="h-[420px]">
              <TableHeader className="sticky top-0 bg-muted/95 backdrop-blur z-[50] border-b-2 border-border shadow-xs">
                <TableRow className="hover:bg-transparent">
                  <TableHead data-card="title" className="min-w-[260px] py-2.5 font-extrabold text-foreground text-left">
                    Item Name
                  </TableHead>
                  <TableHead className="w-[130px] py-2.5 font-extrabold text-foreground text-left">
                    Batch
                  </TableHead>
                  <TableHead className="w-[105px] py-2.5 text-center font-extrabold text-foreground">
                    Expiry
                  </TableHead>
                  <TableHead className="w-[105px] py-2.5 text-center font-extrabold text-foreground">
                    MRP
                  </TableHead>
                  <TableHead className="w-[115px] py-2.5 text-center font-extrabold text-foreground">
                    PTR (Rate)
                  </TableHead>
                  <TableHead className="w-[85px] py-2.5 text-center font-extrabold text-foreground">
                    Qty.
                  </TableHead>
                  <TableHead className="w-[75px] py-2.5 text-center font-extrabold text-foreground">
                    Free
                  </TableHead>
                  <TableHead className="w-[80px] py-2.5 text-center font-extrabold text-foreground">
                    Disc %
                  </TableHead>
                  <TableHead data-card-label="GST %" className="w-[90px] py-2.5 text-center font-extrabold text-foreground">
                    <div className="flex items-center justify-center gap-1.5">
                      <span>GST %</span>
                      <label className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground cursor-pointer select-none hover:text-foreground">
                        <input
                          type="checkbox"
                          checked={applyGstToAll}
                          onChange={(e) =>
                            handleApplyGstToAllChange(e.target.checked)
                          }
                          className="h-3 w-3 rounded border border-border text-primary cursor-pointer"
                        />
                        <span>All</span>
                      </label>
                    </div>
                  </TableHead>
                  <TableHead className="w-[115px] py-2.5 text-center font-extrabold text-foreground">
                    Amount
                  </TableHead>
                  <TableHead data-card="corner" className="w-[48px] py-2.5 text-center font-extrabold text-foreground">
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
                        priceAlerts[item.id]?.is_higher_price_alert ||
                        priceAlerts[item.id]?.rate_increased
                          ? "price-alert-row-blink"
                          : ""
                      } ${
                        hasScheme
                          ? "bg-emerald-500/10 hover:bg-emerald-500/15 border-l-4 border-l-emerald-500"
                          : "bg-card hover:bg-muted/40"
                      }`}
                    >
                      <TableCell
                        className="min-w-[260px] p-2 align-top relative"
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
                                const val = e.target.value;
                                handleItemFieldChange(
                                  item.id,
                                  "product_name",
                                  val
                                );
                                setActiveItemId(item.id);
                                if (val.trim().length >= 2) {
                                  setShowSuggestions(true);
                                  updateDropdownPosition(item.id);
                                }
                                setHighlightedSuggestionIndex(-1);
                              }}
                              onFocus={() => {
                                const val = item.product_name || "";
                                setSearchMedicine(val);
                                setActiveItemId(item.id);
                                updateDropdownPosition(item.id);
                                if (val.trim().length >= 2) {
                                  setShowSuggestions(true);
                                }
                                setHighlightedSuggestionIndex(-1);
                              }}
                              onBlur={(e) => {
                                if (
                                  e.relatedTarget &&
                                  e.relatedTarget.closest &&
                                  e.relatedTarget.closest(
                                    '[data-suggestions-dropdown="true"]'
                                  )
                                ) {
                                  return;
                                }
                              }}
                              onKeyDown={(e) => {
                                const hasAiOption = searchMedicine.length > 1;
                                const maxIndex = hasAiOption
                                  ? medicineSuggestions.length
                                  : medicineSuggestions.length - 1;

                                if (e.key === "Escape") {
                                  setShowSuggestions(false);
                                  setActiveItemId(null);
                                  setHighlightedSuggestionIndex(-1);
                                  return;
                                }

                                if (
                                  !showSuggestions ||
                                  (medicineSuggestions.length === 0 &&
                                    !hasAiOption)
                                )
                                  return;

                                if (e.key === "ArrowDown") {
                                  e.preventDefault();
                                  setHighlightedSuggestionIndex((prev) =>
                                    prev < maxIndex ? prev + 1 : 0
                                  );
                                } else if (e.key === "ArrowUp") {
                                  e.preventDefault();
                                  setHighlightedSuggestionIndex((prev) =>
                                    prev > 0 ? prev - 1 : maxIndex
                                  );
                                } else if (e.key === "Enter") {
                                  e.preventDefault();
                                  if (
                                    highlightedSuggestionIndex >= 0 &&
                                    highlightedSuggestionIndex <
                                      medicineSuggestions.length
                                  ) {
                                    handleSelectMedicineForItem(
                                      item.id,
                                      medicineSuggestions[
                                        highlightedSuggestionIndex
                                      ]
                                    );
                                  } else if (
                                    highlightedSuggestionIndex ===
                                    medicineSuggestions.length
                                  ) {
                                    handleOpenCreateCatalog(
                                      item.id,
                                      searchMedicine
                                    );
                                  } else if (
                                    medicineSuggestions.length > 0
                                  ) {
                                    handleSelectMedicineForItem(
                                      item.id,
                                      medicineSuggestions[0]
                                    );
                                  } else if (searchMedicine.length > 1) {
                                    handleOpenCreateCatalog(
                                      item.id,
                                      searchMedicine
                                    );
                                  } else {
                                    document
                                      .getElementById(`batch-${item.id}`)
                                      ?.focus({ preventScroll: true });
                                  }
                                } else if (e.key === "Tab") {
                                  setShowSuggestions(false);
                                  setActiveItemId(null);
                                  setHighlightedSuggestionIndex(-1);
                                }
                              }}
                              placeholder="Product Name"
                              className="h-8 text-xs font-semibold rounded-lg border-border bg-background text-foreground"
                              data-testid={`item-name-${index}`}
                              autoComplete="off"
                            />

                            {/* Uncataloged Warning / Quick Create Pill */}
                            {item.product_name && !isCatalogLinked(item) && (
                              <button
                                type="button"
                                onClick={() =>
                                  handleOpenCreateCatalog(
                                    item.id,
                                    item.product_name
                                  )
                                }
                                className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 hover:bg-amber-500/25 border border-amber-500/30 shrink-0 whitespace-nowrap transition-colors flex items-center gap-1 cursor-pointer"
                                title="Product not linked to catalog. Click to create master catalog entry."
                              >
                                <PackagePlus className="w-3 h-3 text-amber-500" />
                                <span>+ Catalog</span>
                              </button>
                            )}

                            {/* Inventory Indicator Icon */}
                            {item._inventoryMeta && (
                              <CustomTooltip
                                position="top"
                                text={`In Catalog (${item._inventoryMeta.available_quantity || 0} units available)`}
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
                                        item.id,
                                        "history",
                                        ratePack,
                                        mrpPack
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

                          {/* Metadata Subtitle (Manufacturer, Pack size, HSN, Salt) */}
                          {(item.product_name ||
                            item.manufacturer ||
                            item.units ||
                            item.hsn_no ||
                            item.salt_composition) && (
                            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground flex-wrap leading-tight mt-0.5">
                              {item.manufacturer ? (
                                <span className="font-medium text-foreground/85">
                                  <span className="text-muted-foreground/80">
                                    Mfg:
                                  </span>{" "}
                                  {item.manufacturer}
                                </span>
                              ) : null}
                              <button
                                type="button"
                                onClick={() => setEditingUnitsItemId(item.id)}
                                className="inline-flex items-center gap-0.5 hover:text-foreground cursor-pointer group"
                                title="Click to edit pack units"
                              >
                                <span className="text-muted-foreground/80">
                                  {item.manufacturer ? "• " : ""}Pack:
                                </span>
                                <span className="font-semibold text-foreground/90 group-hover:underline">
                                  {item.pack_type || "Strip"} of{" "}
                                  {item.units || 1}
                                </span>
                                <Edit2 className="w-2 h-2 opacity-0 group-hover:opacity-100 text-primary transition-opacity ml-0.5" />
                              </button>
                              {item.hsn_no ? (
                                <span>
                                  <span className="text-muted-foreground/80">
                                    • HSN:
                                  </span>{" "}
                                  <span className="font-mono">
                                    {item.hsn_no}
                                  </span>
                                </span>
                              ) : null}
                              {item.salt_composition ? (
                                <span
                                  className="truncate max-w-[180px]"
                                  title={item.salt_composition}
                                >
                                  <span className="text-muted-foreground/80">
                                    • Salt:
                                  </span>{" "}
                                  {item.salt_composition}
                                </span>
                              ) : null}

                              {/* Quick Popover to Edit/Override Details */}
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button
                                    type="button"
                                    className="text-[10px] text-primary hover:text-primary/80 font-bold ml-0.5 inline-flex items-center gap-0.5 px-1 py-0.5 rounded hover:bg-primary/10 transition-colors cursor-pointer"
                                    title="Edit Pack, Units, HSN, MFG or Salt"
                                  >
                                    <Edit2 className="w-2.5 h-2.5" />
                                    <span>Edit</span>
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent
                                  className="w-80 p-3 shadow-xl border-border bg-card"
                                  align="start"
                                >
                                  <div className="space-y-2.5">
                                    <div className="font-bold text-xs text-foreground pb-1 border-b border-border flex items-center justify-between">
                                      <span>Edit Medicine Details</span>
                                      <span className="text-[10px] text-muted-foreground font-normal">
                                        Overrides catalog
                                      </span>
                                    </div>
                                    <div className="space-y-1">
                                      <Label className="text-[11px] font-semibold">
                                        Manufacturer
                                      </Label>
                                      <Input
                                        value={item.manufacturer || ""}
                                        onChange={(e) =>
                                          handleItemFieldChange(
                                            item.id,
                                            "manufacturer",
                                            e.target.value
                                          )
                                        }
                                        placeholder="Manufacturer / Brand"
                                        className="h-7 text-xs"
                                      />
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                      <div className="space-y-1">
                                        <Label className="text-[11px] font-semibold">
                                          Pack Type
                                        </Label>
                                        <Select
                                          value={item.pack_type || "Strip"}
                                          onValueChange={(v) =>
                                            handleItemFieldChange(
                                              item.id,
                                              "pack_type",
                                              v
                                            )
                                          }
                                        >
                                          <SelectTrigger className="h-7 text-xs">
                                            <SelectValue />
                                          </SelectTrigger>
                                          <SelectContent className="z-[999999]">
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
                                      <div className="space-y-1">
                                        <Label className="text-[11px] font-semibold">
                                          Units / Pack
                                        </Label>
                                        <Input
                                          type="number"
                                          min="1"
                                          value={
                                            item.units ||
                                            item.units_per_pack ||
                                            "1"
                                          }
                                          onChange={(e) =>
                                            handleItemFieldChange(
                                              item.id,
                                              "units",
                                              e.target.value
                                            )
                                          }
                                          placeholder="e.g. 10 or 15"
                                          className="h-7 text-xs"
                                        />
                                      </div>
                                    </div>
                                    <div className="space-y-1">
                                      <Label className="text-[11px] font-semibold">
                                        HSN Code
                                      </Label>
                                      <Input
                                        value={item.hsn_no || ""}
                                        onChange={(e) =>
                                          handleItemFieldChange(
                                            item.id,
                                            "hsn_no",
                                            e.target.value
                                          )
                                        }
                                        placeholder="HSN Code"
                                        className="h-7 text-xs font-mono"
                                      />
                                    </div>
                                    <div className="space-y-1">
                                      <div className="flex items-center justify-between">
                                        <Label className="text-[11px] font-semibold">
                                          Salt Composition
                                        </Label>
                                        <button
                                          type="button"
                                          id={`add-salt-${item.id}`}
                                          onClick={() =>
                                            setSaltDialog({
                                              open: true,
                                              itemId: item.id,
                                              value:
                                                item.salt_composition || "",
                                            })
                                          }
                                          className="text-[10px] text-orange-500 hover:underline cursor-pointer"
                                        >
                                          Expand Salt
                                        </button>
                                      </div>
                                      <Input
                                        value={item.salt_composition || ""}
                                        onChange={(e) =>
                                          handleItemFieldChange(
                                            item.id,
                                            "salt_composition",
                                            e.target.value
                                          )
                                        }
                                        placeholder="Active ingredients / Salt"
                                        className="h-7 text-xs"
                                      />
                                    </div>
                                  </div>
                                </PopoverContent>
                              </Popover>
                            </div>
                          )}

                          {/* Rate & MRP Alert Inline Badges */}
                          {priceAlerts[item.id]?.is_higher_price_alert && (
                            <button
                              type="button"
                              onClick={() =>
                                handleOpenProductSidebar(
                                  item.product_name,
                                  item.id,
                                  "history",
                                  ratePack,
                                  mrpPack
                                )
                              }
                              className="flex items-center gap-1 bg-amber-500/15 text-amber-500 hover:bg-amber-500/25 border border-amber-500/40 px-2 py-0.5 rounded-lg text-[10px] font-extrabold transition-all cursor-pointer shadow-2xs shrink-0 self-start mt-1"
                              title="Higher rate than past purchases for the same MRP. Click to view history graph."
                            >
                              <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
                              <span>
                                Paying +₹
                                {priceAlerts[item.id].rate_difference?.toFixed(
                                  2
                                )}{" "}
                                Extra (Same MRP)
                              </span>
                            </button>
                          )}
                          {priceAlerts[item.id]?.mrp_increased &&
                            !priceAlerts[item.id]?.is_higher_price_alert && (
                              <button
                                type="button"
                                onClick={() =>
                                  handleOpenProductSidebar(
                                    item.product_name,
                                    item.id,
                                    "history",
                                    ratePack,
                                    mrpPack
                                  )
                                }
                                className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-extrabold transition-all cursor-pointer shadow-2xs shrink-0 self-start mt-1 ${
                                  priceAlerts[item.id]?.rate_increased
                                    ? "bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 border border-amber-500/40"
                                    : "bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 border border-blue-500/40"
                                }`}
                                title="MRP and Rate trends from past purchases. Click to view price history."
                              >
                                <TrendingUp
                                  className={`w-3 h-3 shrink-0 ${priceAlerts[item.id]?.rate_increased ? "text-amber-400" : "text-blue-400"}`}
                                />
                                <span>
                                  MRP Hike (+₹
                                  {priceAlerts[item.id].mrp_difference?.toFixed(
                                    2
                                  )}
                                  )
                                  {priceAlerts[item.id]?.rate_increased && (
                                    <>
                                      {" "}
                                      & Rate +₹
                                      {priceAlerts[
                                        item.id
                                      ].rate_difference?.toFixed(2)}
                                    </>
                                  )}
                                </span>
                              </button>
                            )}
                          {(priceAlerts[item.id]?.mrp_lowered ||
                            priceAlerts[item.id]?.is_mrp_lowered_alert) && (
                            <button
                              type="button"
                              onClick={() =>
                                handleOpenProductSidebar(
                                  item.product_name,
                                  item.id,
                                  "history",
                                  ratePack,
                                  mrpPack
                                )
                              }
                              className={`flex items-center gap-1 border px-2 py-0.5 rounded-lg text-[10px] font-extrabold transition-all cursor-pointer shadow-2xs shrink-0 self-start mt-1 ${
                                priceAlerts[item.id]?.rate_increased
                                  ? "bg-rose-500/15 text-rose-400 hover:bg-rose-500/25 border-rose-500/40 animate-pulse"
                                  : "bg-purple-500/15 text-purple-400 hover:bg-purple-500/25 border-purple-500/40"
                              }`}
                              title="MRP lowered from past purchases. Click to view price comparison."
                            >
                              {priceAlerts[item.id]?.rate_increased ? (
                                <AlertTriangle className="w-3 h-3 text-rose-400 shrink-0" />
                              ) : (
                                <TrendingDown className="w-3 h-3 text-purple-400 shrink-0" />
                              )}
                              <span>
                                MRP Drop (-₹
                                {priceAlerts[
                                  item.id
                                ].mrp_drop_difference?.toFixed(2)}
                                )
                                {priceAlerts[item.id].rate_increased
                                  ? ` & Rate +₹${priceAlerts[item.id].rate_difference?.toFixed(2)}`
                                  : ""}
                              </span>
                            </button>
                          )}
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
                              onMouseLeave={() =>
                                setIsMouseOverSuggestions(false)
                              }
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

                              {medicineSuggestions.map((medicine, idx) => {
                                const isSelected = highlightedSuggestionIndex === idx;
                                const isInv = medicine.source === "inventory";
                                // Your own items (inventory + catalog) come first, then the global database
                                const isLocalSuggestion = (m) =>
                                  m.source === "inventory" || m.source === "catalog" || m.is_custom_catalog;
                                const isLocal = isLocalSuggestion(medicine);
                                const startsGroup =
                                  idx === 0 || isLocalSuggestion(medicineSuggestions[idx - 1]) !== isLocal;
                                const packDetailsText =
                                  medicine.package_details ||
                                  medicine.packaging_label ||
                                  medicine.pack_size_label ||
                                  (medicine.units_per_pack
                                    ? `${medicine.units_per_pack} units`
                                    : "");
                                const mfgText =
                                  medicine.manufacturer ||
                                  medicine.manufacturer_name ||
                                  "";
                                const saltText =
                                  medicine.salt_composition ||
                                  medicine.active_ingredients ||
                                  medicine.short_composition1 ||
                                  "";
                                const mrpVal = Number(
                                  medicine.mrp !== undefined && medicine.mrp !== null
                                    ? medicine.mrp
                                    : medicine["price(₹)"] || 0
                                );
                                const unitMrpVal = medicine.unit_mrp
                                  ? Number(medicine.unit_mrp)
                                  : mrpVal > 0 && medicine.units_per_pack
                                    ? Number(
                                        (mrpVal / medicine.units_per_pack).toFixed(2)
                                      )
                                    : 0;
                                const tradePriceVal = Number(
                                  medicine.trade_price || medicine.purchase_price || 0
                                );
                                const gstRate =
                                  medicine.tax_rate !== undefined &&
                                  medicine.tax_rate !== null
                                    ? medicine.tax_rate
                                    : medicine.cgst
                                      ? medicine.cgst * 2
                                      : null;
                                const hsnCode =
                                  medicine.hsn_code || medicine.hsn_no || "";

                                return (
                                  <Fragment key={idx}>
                                  {startsGroup && (
                                    <div
                                      className={`px-3.5 py-1 text-[10px] font-bold uppercase tracking-wider border-b border-border flex items-center gap-1.5 ${
                                        isLocal
                                          ? "bg-emerald-500/10 text-emerald-500"
                                          : "bg-muted/70 text-muted-foreground"
                                      }`}
                                    >
                                      {isLocal ? (
                                        <>
                                          <Package className="w-3 h-3" /> Your inventory & catalog
                                        </>
                                      ) : (
                                        <>
                                          <Globe className="w-3 h-3" /> Global medicine database
                                        </>
                                      )}
                                    </div>
                                  )}
                                  <div
                                    id={`purchases-suggestion-${idx}`}
                                    className={`p-3 cursor-pointer border-b border-border/50 transition-colors last:border-0 border-l-[3px] ${
                                      isLocal ? "border-l-emerald-500/70" : "border-l-transparent"
                                    } ${
                                      isSelected
                                        ? "bg-orange-500/15"
                                        : isLocal
                                          ? "bg-emerald-500/[0.03] hover:bg-muted/50"
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
                                        <span>
                                          {medicine.product_name || medicine.name}
                                        </span>
                                        {medicine.dosage_form && (
                                          <span className="text-[10px] px-2 py-0.5 bg-purple-500/10 text-purple-400 border border-purple-500/30 rounded-full font-semibold capitalize">
                                            {medicine.dosage_form}
                                          </span>
                                        )}
                                        {medicine.is_custom_catalog || medicine.source === "catalog" ? (
                                          <span className="text-[10px] px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-full font-bold flex items-center gap-1">
                                            <Package className="w-2.5 h-2.5" />
                                            My Catalog
                                          </span>
                                        ) : isInv ? (
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
                                              medicine.product_name ||
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

                                    <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap mb-1.5">
                                      {mfgText ? (
                                        <span className="font-semibold text-foreground/90">
                                          MFG: {mfgText}
                                        </span>
                                      ) : null}
                                      {saltText ? (
                                        <span className="text-orange-400 font-medium">
                                          • Salt: {saltText}
                                        </span>
                                      ) : null}
                                    </div>

                                    <div className="flex items-center justify-between text-xs text-muted-foreground flex-wrap gap-2 pt-1.5 border-t border-border/40">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        {/* Packaging Details Badge */}
                                        {packDetailsText && (
                                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-500 border border-amber-500/20 font-bold text-[11px]">
                                            <Package className="w-3 h-3" />
                                            {packDetailsText}
                                          </span>
                                        )}

                                        {/* Price Info */}
                                        {isInv ? (
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
                                          <div className="flex items-center gap-2 font-mono">
                                            <span className="font-bold text-orange-500">
                                              MRP: ₹{mrpVal.toFixed(2)}
                                              {unitMrpVal > 0 && (
                                                <span className="text-[11px] font-normal text-muted-foreground ml-1">
                                                  (₹{unitMrpVal.toFixed(2)}/u)
                                                </span>
                                              )}
                                            </span>

                                            {tradePriceVal > 0 && (
                                              <span className="text-emerald-400 font-semibold text-[11px]">
                                                • PTR: ₹{tradePriceVal.toFixed(2)}
                                              </span>
                                            )}
                                          </div>
                                        )}

                                        {/* Tax / GST */}
                                        {gstRate !== null &&
                                          gstRate !== undefined && (
                                            <span className="text-[11px] text-muted-foreground font-medium">
                                              • GST: {gstRate}%
                                            </span>
                                          )}

                                        {/* HSN Code */}
                                        {hsnCode && (
                                          <span className="text-[11px] text-muted-foreground font-mono">
                                            • HSN: {hsnCode}
                                          </span>
                                        )}
                                      </div>

                                      {medicine.batch_no && (
                                        <span className="font-mono text-[11px] text-muted-foreground">
                                          Batch: {medicine.batch_no} | Exp:{" "}
                                          {medicine.expiry_date ? formatExpiry(medicine.expiry_date) : "N/A"}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  </Fragment>
                                );
                              })}

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
                                    className={`p-3 cursor-pointer border-t border-orange-500/30 bg-orange-500/10 hover:bg-orange-500/20 transition-colors flex items-center justify-between ${
                                      highlightedSuggestionIndex ===
                                      medicineSuggestions.length
                                        ? "bg-orange-500/25"
                                        : ""
                                    }`}
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      handleOpenCreateCatalog(
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
                                    <div className="flex items-center gap-2 text-orange-400 font-bold text-xs">
                                      <span className="p-1 bg-orange-500/20 rounded-md flex items-center justify-center">
                                        <PackagePlus className="w-3.5 h-3.5" />
                                      </span>
                                      <span>
                                        Create "{searchMedicine}" in Product Catalog
                                      </span>
                                    </div>
                                    <span className="text-[10px] font-bold text-orange-400 bg-orange-500/20 px-2 py-0.5 rounded border border-orange-500/30">
                                      + New Catalog
                                    </span>
                                  </div>
                                )}

                              {!loadingSuggestions &&
                                medicineSuggestions.length === 0 &&
                                searchMedicine.length > 1 && (
                                  <div className="p-6 text-center flex flex-col items-center justify-center bg-card border-t border-border animate-in fade-in zoom-in-95 duration-200">
                                    <div className="w-12 h-12 rounded-2xl bg-orange-500/10 border border-orange-500/30 flex items-center justify-center text-orange-400 mb-2.5 shadow-xs">
                                      <PackagePlus className="w-6 h-6" />
                                    </div>
                                    <h4 className="text-xs font-extrabold text-foreground tracking-wide">
                                      "{searchMedicine}" not in Catalog
                                    </h4>
                                    <p className="text-[11px] font-medium text-muted-foreground mt-1 max-w-[340px] leading-relaxed">
                                      To purchase this medicine, please create its master product catalog first.
                                    </p>
                                    <button
                                      type="button"
                                      onMouseDown={(e) => {
                                        e.preventDefault();
                                        handleOpenCreateCatalog(
                                          item.id,
                                          searchMedicine
                                        );
                                      }}
                                      className="mt-3 inline-flex items-center gap-2 px-3.5 py-1.5 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-xs font-bold shadow-sm transition-all cursor-pointer"
                                    >
                                      <PackagePlus className="w-3.5 h-3.5" />
                                      Create in Product Catalog
                                    </button>
                                  </div>
                                )}
                            </div>,
                            document.body
                          )}
                      </TableCell>

                      {/* 2. BATCH */}
                      <TableCell className="w-[130px] p-2 align-top relative">
                        <Input
                          id={`batch-${item.id}`}
                          value={item.batch_no || ""}
                          onChange={(e) => {
                            handleItemFieldChange(
                              item.id,
                              "batch_no",
                              e.target.value
                            );
                            if (!showBatchSuggestions) {
                              handleOpenBatchSuggestions(item.id, item);
                            }
                            setHighlightedBatchIndex(-1);
                          }}
                          onFocus={() => handleOpenBatchSuggestions(item.id, item)}
                          onClick={() => handleOpenBatchSuggestions(item.id, item)}
                          onBlur={() => {
                            setTimeout(() => {
                              if (!isMouseOverBatchDropdownRef.current) {
                                setShowBatchSuggestions(false);
                                setActiveBatchItemId(null);
                              }
                            }, 150);
                          }}
                          onKeyDown={(e) => {
                            const curBatches = batchSuggestions.filter((b) => {
                              if (
                                hideZeroQuantity &&
                                (Number(b.available_quantity) || 0) <= 0
                              )
                                return false;
                              const typed = (item.batch_no || "")
                                .trim()
                                .toLowerCase();
                              if (
                                typed &&
                                b.batch_no &&
                                !b.batch_no.toLowerCase().includes(typed)
                              )
                                return false;
                              return true;
                            });

                            if (e.key === "Escape") {
                              setShowBatchSuggestions(false);
                              setActiveBatchItemId(null);
                              setHighlightedBatchIndex(-1);
                              return;
                            }

                            if (showBatchSuggestions && curBatches.length > 0) {
                              if (e.key === "ArrowDown") {
                                e.preventDefault();
                                setHighlightedBatchIndex((prev) =>
                                  prev < curBatches.length - 1 ? prev + 1 : 0
                                );
                                return;
                              }
                              if (e.key === "ArrowUp") {
                                e.preventDefault();
                                setHighlightedBatchIndex((prev) =>
                                  prev > 0 ? prev - 1 : curBatches.length - 1
                                );
                                return;
                              }
                              if (e.key === "Enter") {
                                e.preventDefault();
                                if (
                                  highlightedBatchIndex >= 0 &&
                                  highlightedBatchIndex < curBatches.length
                                ) {
                                  handleSelectBatchForItem(
                                    item.id,
                                    curBatches[highlightedBatchIndex]
                                  );
                                  return;
                                }
                                setShowBatchSuggestions(false);
                                setActiveBatchItemId(null);
                                document
                                  .getElementById(`expiry-${item.id}`)
                                  ?.focus({ preventScroll: true });
                                return;
                              }
                              if (e.key === "Tab") {
                                setShowBatchSuggestions(false);
                                setActiveBatchItemId(null);
                                return;
                              }
                            } else if (e.key === "Enter") {
                              e.preventDefault();
                              setShowBatchSuggestions(false);
                              setActiveBatchItemId(null);
                              document
                                .getElementById(`expiry-${item.id}`)
                                ?.focus({ preventScroll: true });
                            }
                          }}
                          placeholder="Batch No"
                          autoComplete="off"
                          className="h-8 text-xs font-semibold rounded-lg border-border bg-background text-foreground"
                        />

                        {/* Batch suggestions floating dropdown via Portal (eVital style) */}
                        {showBatchSuggestions &&
                          activeBatchItemId === item.id &&
                          createPortal(
                            <div
                              data-batch-dropdown="true"
                              className="bg-card border-2 border-border rounded-xl shadow-2xl overflow-hidden z-[99999]"
                              onMouseEnter={() => {
                                isMouseOverBatchDropdownRef.current = true;
                              }}
                              onMouseLeave={() => {
                                isMouseOverBatchDropdownRef.current = false;
                              }}
                              style={{
                                position: "fixed",
                                top: batchDropdownPosition.top,
                                left: batchDropdownPosition.left,
                                width: batchDropdownPosition.width || 490,
                                transform:
                                  batchDropdownPosition.transform || "none",
                              }}
                            >
                              {/* Header bar with title and Hide Zero Quantity toggle */}
                              <div className="flex items-center justify-between px-3 py-2 bg-muted/80 border-b border-border">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs font-bold text-foreground">
                                    Existing Batches
                                  </span>
                                  <span className="text-[10px] text-muted-foreground font-mono">
                                    (
                                    {
                                      batchSuggestions.filter((b) => {
                                        if (
                                          hideZeroQuantity &&
                                          (Number(b.available_quantity) || 0) <=
                                            0
                                        )
                                          return false;
                                        const typed = (item.batch_no || "")
                                          .trim()
                                          .toLowerCase();
                                        if (
                                          typed &&
                                          b.batch_no &&
                                          !b.batch_no
                                            .toLowerCase()
                                            .includes(typed)
                                        )
                                          return false;
                                        return true;
                                      }).length
                                    }
                                    )
                                  </span>
                                </div>
                                <label className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={hideZeroQuantity}
                                    onChange={(e) =>
                                      setHideZeroQuantity(e.target.checked)
                                    }
                                    className="h-3.5 w-3.5 rounded border border-border text-primary cursor-pointer"
                                  />
                                  <span>Hide Zero Quantity</span>
                                </label>
                              </div>

                              {/* Column headers */}
                              <div className="grid grid-cols-5 px-3 py-1.5 bg-muted/40 border-b border-border text-[11px] font-bold text-muted-foreground select-none">
                                <div className="text-left col-span-1">
                                  Batch
                                </div>
                                <div className="text-center col-span-1">
                                  Expiry
                                </div>
                                <div className="text-right col-span-1">
                                  MRP
                                </div>
                                <div className="text-right col-span-1">
                                  PTR
                                </div>
                                <div className="text-right col-span-1 flex items-center justify-end gap-1">
                                  <span>Stock</span>
                                  <CustomTooltip text="Current available quantity in inventory">
                                    <Info className="w-3 h-3 text-muted-foreground inline" />
                                  </CustomTooltip>
                                </div>
                              </div>

                              {/* Batch records list */}
                              <div className="max-h-[200px] overflow-y-auto divide-y divide-border/50">
                                {loadingBatches ? (
                                  <div className="py-6 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                                    <span>Loading batches...</span>
                                  </div>
                                ) : (() => {
                                    const curBatches = batchSuggestions.filter(
                                      (b) => {
                                        if (
                                          hideZeroQuantity &&
                                          (Number(b.available_quantity) || 0) <=
                                            0
                                        )
                                          return false;
                                        const typed = (item.batch_no || "")
                                          .trim()
                                          .toLowerCase();
                                        if (
                                          typed &&
                                          b.batch_no &&
                                          !b.batch_no
                                            .toLowerCase()
                                            .includes(typed)
                                        )
                                          return false;
                                        return true;
                                      }
                                    );

                                    if (curBatches.length > 0) {
                                      return curBatches.map((batch, bIdx) => {
                                        const isSelected =
                                          highlightedBatchIndex === bIdx;
                                        const stock =
                                          Number(batch.available_quantity) || 0;
                                        const bUnits =
                                          Number(
                                            batch.units_per_pack || batch.units
                                          ) || 1;
                                        const mrp =
                                          batch.mrp_pack ||
                                          (batch.mrp
                                            ? Number(batch.mrp) * bUnits
                                            : 0);
                                        const ptr =
                                          batch.pack_price ||
                                          batch.purchase_price ||
                                          0;

                                        return (
                                          <div
                                            key={
                                              batch.id ||
                                              batch.batch_no ||
                                              bIdx
                                            }
                                            onClick={() =>
                                              handleSelectBatchForItem(
                                                item.id,
                                                batch
                                              )
                                            }
                                            className={`grid grid-cols-5 px-3 py-2 text-xs cursor-pointer transition-colors items-center ${
                                              isSelected
                                                ? "bg-primary/15 font-semibold text-foreground"
                                                : "hover:bg-muted/70 text-foreground"
                                            }`}
                                          >
                                            <div className="font-mono font-bold text-foreground truncate">
                                              {batch.batch_no || "—"}
                                            </div>
                                            <div className="text-center font-mono font-medium text-foreground">
                                              {formatExpiry(
                                                batch.expiry_date
                                              ) || "—"}
                                            </div>
                                            <div className="text-right font-semibold text-amber-500 dark:text-amber-400">
                                              ₹{Number(mrp).toFixed(2)}
                                            </div>
                                            <div className="text-right font-semibold text-foreground">
                                              ₹{Number(ptr).toFixed(2)}
                                            </div>
                                            <div className="text-right">
                                              <span
                                                className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                                  stock > 0
                                                    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                                                    : "bg-muted text-muted-foreground"
                                                }`}
                                              >
                                                {stock}
                                              </span>
                                            </div>
                                          </div>
                                        );
                                      });
                                    }

                                    return (
                                      <div className="py-6 px-4 text-center text-xs text-muted-foreground">
                                        {batchSuggestions.length === 0 ? (
                                          item.product_name ? (
                                            <span>
                                              No previous batches found for this product. You can type a new batch number.
                                            </span>
                                          ) : (
                                            <span>
                                              Enter or select a product name first to see previous batches.
                                            </span>
                                          )
                                        ) : hideZeroQuantity ? (
                                          <span>
                                            All existing batches have 0 quantity in stock. Uncheck "Hide Zero Quantity" to view past batches.
                                          </span>
                                        ) : (
                                          <span>
                                            No matching batches found.
                                          </span>
                                        )}
                                      </div>
                                    );
                                  })()}
                              </div>
                            </div>,
                            document.body
                          )}
                      </TableCell>

                      {/* 3. EXPIRY */}
                      <TableCell className="w-[105px] p-2 align-top">
                        <Input
                          id={`expiry-${item.id}`}
                          type="text"
                          inputMode="numeric"
                          placeholder="MM/YY"
                          maxLength={5}
                          value={formatExpiryInput(item.expiry_date || "")}
                          onChange={(e) =>
                            handleItemFieldChange(
                              item.id,
                              "expiry_date",
                              formatExpiryInput(e.target.value)
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
                          className="h-8 text-xs font-semibold text-center rounded-lg border-border bg-background text-foreground px-2"
                        />
                      </TableCell>

                      {/* 4. MRP */}
                      <TableCell className="w-[105px] p-2 align-top">
                        <div className="flex flex-col gap-1 items-center">
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
                            onBlur={() =>
                              checkPriceHistorySilent(
                                item.id,
                                item.product_name,
                                item.rate_pack || item.pack_price,
                                item.mrp_pack ||
                                  (item.mrp_unit && item.units
                                    ? item.mrp_unit * item.units
                                    : 0)
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
                            placeholder="MRP ₹"
                            className="h-8 text-xs text-center font-bold rounded-lg border-amber-500/40 bg-amber-500/10 text-amber-500 dark:text-amber-400"
                          />
                          <div className="text-[10px] font-semibold text-muted-foreground font-mono leading-none">
                            {mrpPack && units ? `₹${mrpUnit.toFixed(2)}/u` : "—"}
                          </div>
                        </div>
                      </TableCell>

                      {/* 5. PTR (RATE) */}
                      <TableCell className="w-[115px] p-2 align-top">
                        <div className="flex flex-col gap-1 items-center">
                          <div className="relative w-full">
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
                                  item.rate_pack || item.pack_price,
                                  item.mrp_pack ||
                                    (item.mrp_unit && item.units
                                      ? item.mrp_unit * item.units
                                      : 0)
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
                              placeholder="Rate ₹"
                              className={`h-8 text-xs text-center w-full font-bold text-foreground rounded-lg border-border bg-background pr-5 ${
                                priceAlerts[item.id]
                                  ? "border-amber-500 bg-amber-500/10 text-amber-500 dark:text-amber-400"
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
                                  const currentMrp =
                                    parseFloat(item.mrp_pack) ||
                                    (item.mrp_unit && item.units
                                      ? parseFloat(item.mrp_unit) *
                                        parseInt(item.units)
                                      : 0);

                                  if (!item.product_name) {
                                    toast.error("Enter product name first");
                                    return;
                                  }

                                  checkPriceHistory(
                                    item.id,
                                    item.product_name,
                                    currentRate,
                                    currentMrp
                                  );
                                }}
                                className="absolute right-1 top-1/2 -translate-y-1/2 text-orange-500 hover:text-orange-600 cursor-pointer"
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
                          <div className="text-[10px] font-semibold text-muted-foreground font-mono leading-none">
                            {ratePack && units ? `₹${(ratePack / units).toFixed(2)}/u` : "—"}
                          </div>
                        </div>
                      </TableCell>

                      {/* 6. QTY */}
                      <TableCell className="w-[85px] p-2 align-top">
                        <div className="flex flex-col gap-1 items-center">
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
                                  .getElementById(`scheme-${item.id}`)
                                  ?.focus({ preventScroll: true });
                              }
                            }}
                            placeholder="Qty"
                            className="h-8 text-xs font-bold text-center w-full rounded-lg border-border bg-background text-foreground"
                            min="1"
                          />
                          {editingUnitsItemId === item.id ? (
                            <div className="flex items-center gap-0.5 bg-background border border-primary/50 shadow-xs rounded px-1 py-0.5 animate-in fade-in zoom-in-95 duration-150">
                              <input
                                type="number"
                                min="1"
                                autoFocus
                                value={item.units || item.units_per_pack || "1"}
                                onChange={(e) =>
                                  handleItemFieldChange(
                                    item.id,
                                    "units",
                                    e.target.value
                                  )
                                }
                                onBlur={() => setEditingUnitsItemId(null)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === "Escape") {
                                    e.preventDefault();
                                    setEditingUnitsItemId(null);
                                  }
                                }}
                                className="h-4 w-9 text-[10px] font-bold text-center bg-transparent border-none p-0 focus:outline-none text-foreground"
                                title="Units per pack"
                              />
                              <span className="text-[9px] font-bold text-orange-500">
                                u/p
                              </span>
                              <button
                                type="button"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  setEditingUnitsItemId(null);
                                }}
                                className="text-emerald-500 hover:text-emerald-600 cursor-pointer ml-0.5"
                                title="Save units per pack"
                              >
                                <Check className="w-2.5 h-2.5 stroke-[2.5]" />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setEditingUnitsItemId(item.id)}
                              className="text-[10px] font-bold text-muted-foreground hover:text-foreground font-mono leading-none flex items-center gap-0.5 px-1 py-0.5 rounded hover:bg-muted/80 transition-colors cursor-pointer group"
                              title={`Click to edit pack units (${item.units || 1} units/pack)`}
                            >
                              <span>{totalUnits}</span>
                              <span className="text-orange-500">u</span>
                              <Edit2 className="w-2.5 h-2.5 opacity-40 group-hover:opacity-100 text-primary transition-opacity ml-0.5" />
                            </button>
                          )}
                        </div>
                      </TableCell>

                      {/* 7. FREE (SCHEME) */}
                      <TableCell className="w-[75px] p-2 align-top">
                        <div className="flex flex-col gap-1 items-center">
                          <Input
                            id={`scheme-${item.id}`}
                            type="number"
                            value={item.scheme !== undefined ? item.scheme : ""}
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
                                  .getElementById(`discount-${item.id}`)
                                  ?.focus({ preventScroll: true });
                              }
                            }}
                            placeholder="0"
                            className={`h-8 text-xs text-center w-full font-semibold rounded-lg border-border bg-background text-foreground ${
                              hasScheme
                                ? "border-emerald-500 bg-emerald-500/10 font-bold text-emerald-500 dark:text-emerald-400"
                                : ""
                            }`}
                            min="0"
                          />
                          {hasScheme ? (
                            <div className="text-[10px] font-bold text-emerald-500 dark:text-emerald-400 leading-none">
                              +{scheme} Free
                            </div>
                          ) : (
                            <div className="text-[10px] text-muted-foreground/60 leading-none">—</div>
                          )}
                        </div>
                      </TableCell>

                      {/* 8. DISCOUNT % */}
                      <TableCell className="w-[80px] p-2 align-top">
                        <div className="flex flex-col gap-1 items-center">
                          <Input
                            id={`discount-${item.id}`}
                            type="number"
                            step="0.01"
                            value={item.discount !== undefined ? item.discount : ""}
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
                                  .getElementById(`gst-${item.id}`)
                                  ?.focus({ preventScroll: true });
                              }
                            }}
                            placeholder="0%"
                            className="h-8 text-xs text-center w-full font-semibold rounded-lg border-border bg-background text-foreground"
                            min="0"
                          />
                          {parseFloat(item.discount) > 0 ? (
                            <div className="text-[10px] font-semibold text-emerald-500 leading-none">
                              -₹{((qty * ratePack * (parseFloat(item.discount) || 0)) / 100).toFixed(1)}
                            </div>
                          ) : (
                            <div className="text-[10px] text-muted-foreground/60 leading-none">—</div>
                          )}
                        </div>
                      </TableCell>

                      {/* 9. GST % */}
                      <TableCell className="w-[90px] p-2 align-top">
                        <div className="flex flex-col gap-1 items-center">
                          <Input
                            id={`gst-${item.id}`}
                            type="number"
                            step="0.01"
                            value={
                              item.gst !== undefined && item.gst !== ""
                                ? item.gst
                                : (parseFloat(item.cgst) || 0) + (parseFloat(item.sgst) || 0) > 0
                                  ? String((parseFloat(item.cgst) || 0) + (parseFloat(item.sgst) || 0))
                                  : ""
                            }
                            onChange={(e) =>
                              handleItemFieldChangeWithCalc(
                                item.id,
                                "gst",
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
                            placeholder="GST %"
                            className="h-8 text-xs text-center w-full font-semibold rounded-lg border-border bg-background text-foreground"
                            min="0"
                          />
                          <div className="text-[10px] font-semibold text-muted-foreground font-mono leading-none">
                            Tax: ₹{(
                              ((((parseFloat(item.cgst) || 0) + (parseFloat(item.sgst) || 0)) *
                                ratePack) /
                                100) *
                              qty
                            ).toFixed(2)}
                          </div>
                        </div>
                      </TableCell>

                      {/* 10. TOTAL AMOUNT */}
                      <TableCell className="w-[115px] p-2 align-top">
                        <div className="flex flex-col gap-1 items-center">
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
                          <div className="text-[10px] font-mono font-semibold text-muted-foreground leading-none">
                            ₹{(
                              (parseFloat(item.total_amount) || totalAmount) /
                              ((qty * units) || 1)
                            ).toFixed(2)}/u
                          </div>
                        </div>
                      </TableCell>

                      {/* 11. ACTION */}
                      <TableCell className="w-[48px] p-2 align-top text-center">
                        <div className="h-8 flex items-center justify-center">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-muted-foreground hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
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
                      colSpan={11}
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
          <p className="text-xs text-muted-foreground bg-muted/30 p-2 rounded flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-orange-500 shrink-0" />
            <span>
              <strong>Tip:</strong> Enter Qty and either Rate(Pack) OR Total -
              the other will auto-calculate. Salt, HSN, Batch, Expiry are
              optional.
            </span>
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
                  <Table mobileCards wrapperClassName="h-[400px]">
                    <TableHeader className="sticky top-0 bg-muted/95 backdrop-blur z-[50]">
                      <TableRow>
                        <TableHead data-card="title">Product Name</TableHead>
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
                                type="text"
                                inputMode="numeric"
                                placeholder="MM/YY"
                                maxLength={5}
                                value={formatExpiryInput(item.expiry_date || "")}
                                onChange={(e) => {
                                  const formatted = formatExpiryInput(e.target.value);
                                  const items = [...editingPurchase.items];
                                  items[idx] = {
                                    ...items[idx],
                                    expiry_date: formatted,
                                  };
                                  setEditingPurchase((prev) => ({
                                    ...prev,
                                    items,
                                  }));
                                }}
                                className="h-8 text-xs text-center w-24"
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
                  className="h-8 text-xs font-bold rounded-xl border-border/70 max-md:hidden"
                >
                  <Keyboard className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
                  Shortcuts
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs font-bold rounded-xl bg-gradient-to-r from-orange-500/10 to-amber-500/10 border-orange-500/30 text-orange-600 dark:text-orange-400 hover:border-orange-500/50"
                  onClick={() => openScanner("/scan")}
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
                  New<span className="max-md:hidden">{getOS() === "mac" ? " (⌥N)" : " (Alt+N)"}</span>
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
            <Table mobileCards>
              <TableHeader>
                <TableRow>
                  <TableHead data-card="corner" className="w-[40px]"></TableHead>
                  <TableHead data-card="title">Invoice / Timestamp</TableHead>
                  <TableHead data-card="full">
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
                  <TableHead data-card="actions" className="text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody
                className={`transition-opacity duration-200 ${listLoading ? "opacity-50 pointer-events-none" : ""}`}
              >
                {purchases.map((purchase, index) => (
                  <Fragment key={purchase.id}>
                    <TableRow
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
                            <Table mobileCards>
                              <TableHeader>
                                <TableRow>
                                  <TableHead data-card="title">Product</TableHead>
                                  <TableHead>Batch</TableHead>
                                  <TableHead>Expiry</TableHead>
                                  <TableHead className="text-center">
                                    Packs
                                  </TableHead>
                                  <TableHead className="text-center text-emerald-600 dark:text-emerald-400">
                                    Scheme
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
                                  const scheme = parseFloat(item.scheme) || 0;
                                  const hasScheme = scheme > 0;
                                  const unitsPerPack = item.units_per_pack || 1;
                                  const totalUnits =
                                    item.total_units || (packQty + scheme) * unitsPerPack;
                                  const packPrice =
                                    item.pack_price ||
                                    (item.purchase_price ? item.purchase_price * unitsPerPack : 0);
                                  const discount = parseFloat(item.discount) || 0;
                                  const costPerUnit =
                                    item.price_per_unit ||
                                    (unitsPerPack > 0 && packPrice > 0
                                      ? (packPrice * (1 - discount / 100)) / unitsPerPack
                                      : item.purchase_price || 0);
                                  const mrpPerUnit =
                                    item.mrp_per_unit || item.mrp || 0;
                                  const total =
                                    item.item_total ||
                                    packQty *
                                      packPrice *
                                      (1 - discount / 100) *
                                      (1 + ((parseFloat(item.cgst) || 0) + (parseFloat(item.sgst) || 0)) / 100);

                                  return (
                                    <TableRow key={idx}>
                                      <TableCell className="font-medium">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                          <span>{item.product_name}</span>
                                          {item.status === "Expired & Returned" && (
                                            <Badge className="px-1.5 py-0 text-[9px] font-black bg-rose-500/15 text-rose-500 border-rose-500/30">
                                              Expired & Returned
                                            </Badge>
                                          )}
                                          {item.status === "Returned" && (
                                            <Badge className="px-1.5 py-0 text-[9px] font-black bg-blue-500/15 text-blue-500 border-blue-500/30">
                                              Returned
                                            </Badge>
                                          )}
                                        </div>
                                      </TableCell>
                                      <TableCell>{item.batch_no}</TableCell>
                                      <TableCell>{formatExpiry(item.expiry_date)}</TableCell>
                                      <TableCell className="text-center">
                                        {packQty}
                                      </TableCell>
                                      <TableCell className="text-center">
                                        {hasScheme ? (
                                          <div className="flex flex-col items-center">
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                              +{scheme} Free
                                            </span>
                                            <span className="text-[10px] text-muted-foreground font-mono">
                                              (+{scheme * unitsPerPack} u)
                                            </span>
                                          </div>
                                        ) : (
                                          <span className="text-muted-foreground text-xs font-mono">-</span>
                                        )}
                                      </TableCell>
                                      <TableCell className="text-center">
                                        {unitsPerPack}
                                      </TableCell>
                                      <TableCell className="text-center font-medium text-primary">
                                        <div>{totalUnits}</div>
                                        {hasScheme && (
                                          <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono">
                                            ({packQty * unitsPerPack} + {scheme * unitsPerPack} free)
                                          </div>
                                        )}
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
                  </Fragment>
                ))}
                {purchases.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="text-center py-8 text-muted-foreground"
                    >
                      {listLoading ? (
                        <span className="inline-flex items-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin" /> Loading purchases…
                        </span>
                      ) : (
                        "No purchases found"
                      )}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            {/* Pagination */}
            {pagination.total_pages > 1 && (
              <div className="flex flex-col sm:flex-row items-center justify-between px-6 py-4 border-t border-border/40 bg-muted/5 gap-4">
                <div className="text-xs font-bold text-muted-foreground/80 sm:w-1/3 text-left">
                  Showing {(pagination.page - 1) * pagination.limit + 1} to{" "}
                  {Math.min(
                    pagination.page * pagination.limit,
                    pagination.total
                  )}{" "}
                  of {pagination.total} purchases
                </div>

                <div className="flex items-center justify-center gap-2 sm:w-1/3">
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

                <div className="hidden sm:block sm:w-1/3 text-right text-xs font-bold text-muted-foreground/60">
                  Page {pagination.page} of {pagination.total_pages}
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
              Delete the purchase
              {deleteDialog.purchase?.invoice_no ? ` #${deleteDialog.purchase.invoice_no}` : ""} from{" "}
              <span className="font-medium text-foreground">{deleteDialog.purchase?.supplier_name}</span>?
            </AlertDialogDescription>
          </AlertDialogHeader>

          {deleteImpact.loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 className="w-4 h-4 animate-spin" /> Checking stock from this purchase…
            </div>
          ) : deleteImpact.data?.batches?.length > 0 ? (
            <div className="space-y-2">
              {deleteImpact.data.consumed && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-600">
                  Some of this stock is already sold, so it can't all be taken back. You can remove only the
                  unsold units, or keep the stock and delete just the purchase record.
                </div>
              )}
              <div className="rounded-lg border border-border overflow-hidden">
                <div className="max-h-56 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-xs text-muted-foreground sticky top-0">
                      <tr>
                        <th className="text-left font-medium px-3 py-2">Item / Batch</th>
                        <th className="text-right font-medium px-3 py-2">Purchased</th>
                        <th className="text-right font-medium px-3 py-2">Sold</th>
                        <th className="text-right font-medium px-3 py-2">In stock</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deleteImpact.data.batches.map((b) => (
                        <tr key={b.inventory_id} className="border-t border-border/60">
                          <td className="px-3 py-2">
                            <div className="font-medium truncate max-w-[220px]">{b.product_name}</div>
                            <div className="text-xs text-muted-foreground">Batch {b.batch_no || "—"}</div>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{b.purchased}</td>
                          <td className={`px-3 py-2 text-right tabular-nums ${b.consumed > 0 ? "text-amber-600 font-medium" : "text-muted-foreground"}`}>
                            {b.consumed}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{b.on_hand}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Quantities are in units.</p>
            </div>
          ) : null}

          <div className="flex flex-col-reverse md:flex-row gap-2 justify-end mt-4">
            <AlertDialogCancel className="w-full md:w-auto mt-0" disabled={deletingPurchase}>
              Cancel
            </AlertDialogCancel>
            <Button
              variant="outline"
              className="w-full md:w-auto text-destructive border-destructive/40 hover:bg-destructive/10"
              disabled={deletingPurchase}
              onClick={() => handleDeletePurchase(false)}
            >
              Keep stock, delete record
            </Button>
            {deleteImpact.data?.consumed ? (
              <Button
                className="w-full md:w-auto btn-primary"
                disabled={deletingPurchase}
                onClick={() => handleDeletePurchase("unsold")}
              >
                {deletingPurchase && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Delete & remove unsold stock
              </Button>
            ) : (
              <Button
                className="w-full md:w-auto btn-primary"
                disabled={deletingPurchase || deleteImpact.loading}
                onClick={() => handleDeletePurchase(true)}
              >
                {deletingPurchase && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Delete & decrease stock
              </Button>
            )}
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
              <p className="font-semibold text-green-600 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                You are already at the best historical price!
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
          <div className="fixed bottom-0 left-0 right-0 z-[100] flex items-center justify-between bg-card/95 backdrop-blur-xl border-t-2 border-border shadow-2xl px-6 py-3.5 gap-4 overflow-x-auto scroller-hide overflow-y-hidden mb-0 transition-all duration-300 mobile-action-bar max-md:flex-wrap max-md:gap-2 max-md:px-3 max-md:pt-2.5 max-md:pb-[calc(0.625rem+env(safe-area-inset-bottom))]">
            <div className="flex items-center gap-2 overflow-x-auto scroller-hide max-md:w-full empty:hidden">
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

            <div className="flex items-center gap-3 shrink-0 ml-auto border-l border-border pl-6 max-md:w-full max-md:ml-0 max-md:border-l-0 max-md:pl-0 max-md:gap-2">
              <Button
                variant="ghost"
                onClick={handleCancelNewPurchase}
                disabled={processingRowId !== null}
                className="text-muted-foreground hover:text-foreground max-md:flex-1 max-md:border max-md:border-border"
              >
                Cancel<span className="max-md:hidden">&nbsp;(Esc)</span>
              </Button>

              <Button
                onClick={handleSubmitPurchase}
                disabled={
                  submitting ||
                  processingRowId !== null ||
                  purchaseItems.filter((i) => i.product_name).length === 0
                }
                className="btn-primary shadow-lg shadow-primary/20 min-w-[160px] max-md:flex-[2] max-md:min-w-0"
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
                    <kbd className="hidden md:inline-block ml-1 opacity-70 text-[9px] font-mono border border-white/20 px-1 rounded">
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
          <div className="fixed inset-0 z-[80] flex justify-end">
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
                            <div className="space-y-1 truncate">
                              <span
                                className="font-extrabold text-xs text-foreground block truncate"
                                title={
                                  batch.product_name ||
                                  productSidebar.productName
                                }
                              >
                                {batch.product_name ||
                                  productSidebar.productName}
                              </span>
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
                                {batch.expiry_date ? formatExpiry(batch.expiry_date) : "N/A"}
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
                ) : (
                  /* TAB 2: PAST PURCHASES & PRICE HISTORY */ <div className="space-y-4">
                    {/* Price Trend Trajectory Chart */}
                    {productSidebar.priceHistoryDetail?.price_history_trend
                      ?.length > 0 && (
                      <PriceTrendChart
                        trendData={
                          productSidebar.priceHistoryDetail.price_history_trend
                        }
                        currentRate={
                          productSidebar.priceHistoryDetail.current_rate
                        }
                        currentMrp={
                          productSidebar.priceHistoryDetail.current_mrp
                        }
                      />
                    )}

                    {/* Rate & MRP Comparison Summary Card */}
                    {productSidebar.priceHistoryDetail && (
                      <div className="p-3.5 rounded-2xl border border-border bg-muted/20 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black uppercase text-foreground tracking-tight">
                            Rate & MRP Comparison
                          </span>
                          {productSidebar.priceHistoryDetail
                            .is_mrp_lowered_alert ||
                          productSidebar.priceHistoryDetail.mrp_lowered ? (
                            productSidebar.priceHistoryDetail.rate_increased ? (
                              <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/30 flex items-center gap-1 animate-pulse">
                                <AlertTriangle className="w-3 h-3" />
                                <span>MRP Drop & Rate Hike</span>
                              </span>
                            ) : (
                              <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-purple-500/15 text-purple-400 border border-purple-500/30 flex items-center gap-1">
                                <TrendingDown className="w-3 h-3" />
                                <span>MRP Drop</span>
                              </span>
                            )
                          ) : productSidebar.priceHistoryDetail
                              .is_higher_price_alert ? (
                            <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-500 border border-amber-500/30 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              <span>Higher Rate (Same MRP)</span>
                            </span>
                          ) : productSidebar.priceHistoryDetail
                              .mrp_increased ? (
                            <span
                              className={`text-[10px] font-black px-2.5 py-0.5 rounded-full flex items-center gap-1 ${
                                productSidebar.priceHistoryDetail.rate_increased
                                  ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                                  : "bg-blue-500/15 text-blue-400 border border-blue-500/30"
                              }`}
                            >
                              <TrendingUp className="w-3 h-3" />
                              <span>
                                MRP Hike
                                {productSidebar.priceHistoryDetail
                                  .rate_increased && " & Rate Hike"}
                              </span>
                            </span>
                          ) : (
                            <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>Normal Price</span>
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-3 gap-2 font-mono text-xs">
                          <div className="p-2 rounded-xl bg-card border border-border/60">
                            <span className="text-[10px] text-muted-foreground uppercase font-extrabold block">
                              Entered Rate
                            </span>
                            <span className="font-extrabold text-orange-500">
                              ₹
                              {(
                                productSidebar.priceHistoryDetail
                                  .current_rate || 0
                              ).toFixed(2)}
                            </span>
                          </div>

                          <div className="p-2 rounded-xl bg-card border border-border/60">
                            <span className="text-[10px] text-muted-foreground uppercase font-extrabold block">
                              Latest Rate
                            </span>
                            <span className="font-extrabold text-foreground">
                              ₹
                              {(
                                productSidebar.priceHistoryDetail.latest_rate ||
                                0
                              ).toFixed(2)}
                            </span>
                          </div>

                          <div className="p-2 rounded-xl bg-card border border-border/60">
                            <span className="text-[10px] text-muted-foreground uppercase font-extrabold block">
                              Best Rate
                            </span>
                            <span className="font-extrabold text-emerald-400">
                              ₹
                              {(
                                productSidebar.priceHistoryDetail
                                  .cheapest_rate || 0
                              ).toFixed(2)}
                            </span>
                          </div>
                        </div>

                        {productSidebar.priceHistoryDetail
                          .is_higher_price_alert && (
                          <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] font-semibold text-amber-500 leading-relaxed flex items-start gap-2">
                            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-500 mt-0.5" />
                            <div>
                              <strong>Higher Rate Warning:</strong> Purchasing
                              at +₹
                              {productSidebar.priceHistoryDetail.rate_difference?.toFixed(
                                2
                              )}{" "}
                              higher than previous purchases for the same MRP (₹
                              {productSidebar.priceHistoryDetail.latest_mrp?.toFixed(
                                2
                              )}
                              ).
                            </div>
                          </div>
                        )}

                        {productSidebar.priceHistoryDetail.mrp_increased && (
                          <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-[11px] font-semibold text-blue-400 leading-relaxed flex items-start gap-2">
                            <Info className="w-4 h-4 shrink-0 text-blue-400 mt-0.5" />
                            <div>
                              <strong>MRP Hike Detected:</strong> Product MRP
                              increased by +₹
                              {productSidebar.priceHistoryDetail.mrp_difference?.toFixed(
                                2
                              )}{" "}
                              (from ₹
                              {productSidebar.priceHistoryDetail.latest_mrp?.toFixed(
                                2
                              )}{" "}
                              to ₹
                              {productSidebar.priceHistoryDetail.current_mrp?.toFixed(
                                2
                              )}
                              ). Rate increased proportionally (+₹
                              {productSidebar.priceHistoryDetail.rate_difference?.toFixed(
                                2
                              )}
                              ).
                            </div>
                          </div>
                        )}

                        {(productSidebar.priceHistoryDetail
                          .is_mrp_lowered_alert ||
                          productSidebar.priceHistoryDetail.mrp_lowered) &&
                          (productSidebar.priceHistoryDetail.rate_increased ? (
                            <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-[11px] font-semibold text-rose-400 leading-relaxed flex items-start gap-2">
                              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                              <div>
                                <strong>Higher Rate Warning:</strong> Product
                                MRP dropped by -₹
                                {productSidebar.priceHistoryDetail.mrp_drop_difference?.toFixed(
                                  2
                                )}{" "}
                                (from ₹
                                {productSidebar.priceHistoryDetail.latest_mrp?.toFixed(
                                  2
                                )}{" "}
                                to ₹
                                {productSidebar.priceHistoryDetail.current_mrp?.toFixed(
                                  2
                                )}
                                ), BUT Rate increased by +₹
                                {productSidebar.priceHistoryDetail.rate_difference?.toFixed(
                                  2
                                )}{" "}
                                (from ₹
                                {productSidebar.priceHistoryDetail.latest_rate?.toFixed(
                                  2
                                )}{" "}
                                to ₹
                                {productSidebar.priceHistoryDetail.current_rate?.toFixed(
                                  2
                                )}
                                ).
                              </div>
                            </div>
                          ) : (
                            <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-[11px] font-semibold text-purple-400 leading-relaxed flex items-start gap-2">
                              <TrendingDown className="w-4 h-4 shrink-0 text-purple-400 mt-0.5" />
                              <div>
                                <strong>MRP Drop Detected:</strong> Product MRP
                                dropped by -₹
                                {productSidebar.priceHistoryDetail.mrp_drop_difference?.toFixed(
                                  2
                                )}{" "}
                                (from ₹
                                {productSidebar.priceHistoryDetail.latest_mrp?.toFixed(
                                  2
                                )}{" "}
                                to ₹
                                {productSidebar.priceHistoryDetail.current_mrp?.toFixed(
                                  2
                                )}
                                ).
                              </div>
                            </div>
                          ))}
                      </div>
                    )}

                    {/* Historical Purchases List */}
                    {productSidebar.history.length === 0 ? (
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
                        const packPrice = Number(
                          record.pack_price || record.rate_pack || 0
                        );
                        const mrpPrice = Number(record.mrp_pack || 0);
                        const isCheapest =
                          productSidebar.priceHistoryDetail?.cheapest_rate ===
                          packPrice;

                        return (
                          <div
                            key={record.purchase_id || idx}
                            className={`p-3.5 rounded-2xl border transition-all space-y-2.5 shadow-2xs ${
                              isCheapest
                                ? "border-emerald-500/40 bg-emerald-500/5"
                                : "border-border bg-card hover:border-orange-500/40"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="space-y-0.5 truncate">
                                <span
                                  className="font-extrabold text-xs text-orange-400 block truncate"
                                  title={
                                    record.product_name ||
                                    productSidebar.productName
                                  }
                                >
                                  {record.product_name ||
                                    productSidebar.productName}
                                </span>
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-xs text-foreground block">
                                    {record.supplier_name || "Unknown Supplier"}
                                  </span>
                                  {isCheapest && (
                                    <span className="text-[9px] font-black uppercase px-1.5 py-0.2 bg-emerald-500/20 text-emerald-400 rounded-md border border-emerald-500/30">
                                      Lowest Rate
                                    </span>
                                  )}
                                </div>
                                <span className="text-[10px] font-mono text-muted-foreground block">
                                  {record.purchase_date?.slice(0, 10)} • Inv:{" "}
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

                            <div className="grid grid-cols-3 gap-2 text-xs pt-2 border-t border-border/40 font-mono">
                              <div>
                                <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                                  Batch & Exp:
                                </span>
                                <span className="font-semibold text-foreground">
                                  {record.batch_no || "N/A"}
                                  {record.expiry_date ? ` (${formatExpiry(record.expiry_date)})` : ""}
                                </span>
                              </div>
                              <div>
                                <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                                  Pack Rate:
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
                    )}
                  </div>
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
                    { key: "expiry_date", label: "Expiry Date (MM/YY)", req: false },
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

      {/* Product Catalog Modal */}
      <ProductCatalogModal
        isOpen={catalogModalOpen}
        onClose={() => setCatalogModalOpen(false)}
        initialName={catalogModalInitialName}
        onSuccess={(created) => {
          if (catalogModalTargetRowId) {
            handleSelectMedicineForItem(catalogModalTargetRowId, created);
          }
        }}
      />
    </div>
  );
}
