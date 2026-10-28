import React, { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams, useLocation, useNavigate } from "react-router-dom";
import { v4 as uuidv4 } from "uuid";
import { createPortal } from "react-dom";
import axios from "axios";
import RecordDates from "../components/RecordDates";
import { API, useAuth } from "../App";
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
import { Checkbox } from "../components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../components/ui/popover";
import {
  Search,
  Plus,
  Eye,
  Trash2,
  Loader2,
  FileText,
  Receipt,
  ChevronLeft,
  ChevronRight,
  Keyboard,
  X,
  Check,
  Edit2,
  User,
  ShoppingCart,
  Package,
  Globe,
  CreditCard,
  RotateCcw,
  History,
  ChevronDown,
  ChevronUp,
  Save,
  Download,
  BarChart3,
  TrendingUp,
  AlertCircle,
  Clock,
  Edit,
  Camera,
  SlidersHorizontal,
  Filter,
  Calendar,
  Bell,
  AlertTriangle,
  Sparkles,
  QrCode,
} from "lucide-react";
import { toast } from "sonner";
import CustomerFilter from "../components/CustomerFilter";
import BatchPicker from "../components/BatchPicker";
import PlanBadge from "../components/PlanBadge";
import { TierBadge } from "../components/customers/CustomerTiers";
import Loader from "../components/Loader";
import BillingScannerModal from "../components/BillingScannerModal";
import { formatDate, formatExpiry, formatExpiryInput, expiryToIso, openScanner } from "./utils";
import { formatCombo } from "../lib/shortcuts";
import { fmtDay, parseDose, refillPlan, reminderOn } from "../lib/refill";
import { useShortcuts, useShortcutLayer } from "../components/shortcuts/Shortcuts";
import UpiQrDialog from "../components/UpiQr";
import { useWhatsAppShare, WhatsAppIcon } from "../components/ShareBillWhatsApp";
import { ItemQrScanDialog, findItemLabel, resolveItemLabel } from "../components/ItemQr";
import { SuggestionList, ProductDetailsSheet, SUGGESTION_FILTERS, filterSuggestions } from "../components/billing/ProductSuggestions";

const LOCAL_STORAGE_KEY_BILL = "pharmalogy_bill_draft";

// Equal-sized SVG Icons for Payment Modes (matching PurchasesPage.jsx)
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

// Udhar payments: never more than what's still due on the bill
const billPaymentError = ({ amount, remainingUnpaid }) => {
  if (amount === "" || amount === null || amount === undefined) return "";
  const amt = Math.round(Number(amount) * 100) / 100;
  const left = Math.round((Number(remainingUnpaid) || 0) * 100) / 100;
  if (!Number.isFinite(amt) || amt <= 0) return "Enter an amount more than ₹0";
  if (left <= 0) return "This bill is already fully paid";
  if (amt > left) return `Only ₹${left.toFixed(2)} is due. Enter ₹${left.toFixed(2)} or less.`;
  return "";
};

// Bill discount % that turns `subtotal` into the typed grand total. Two
// decimals when that lands on the exact rupee-paisa total, more when it doesn't
// (so ₹15 saves as ₹15.00, not ₹15.01).
const discountForTotal = (subtotal, target) => {
  const exact = ((subtotal - target) / subtotal) * 100;
  for (const d of [2, 3, 4]) {
    const pct = Number(exact.toFixed(d));
    if (Math.abs(subtotal * (1 - pct / 100) - target) < 0.005) return pct;
  }
  return Number(exact.toFixed(6));
};
const fmtPct = (v) => Number((parseFloat(v) || 0).toFixed(2));

export default function BillingPage() {
  const location = useLocation();
  // Data state
  const navigate = useNavigate();
  const [bills, setBills] = useState([]);
  const [totalBills, setTotalBills] = useState(0);
  const [loading, setLoading] = useState(true);
  const { user, settings } = useAuth();
  const [tabs, setTabs] = useState([]);
  const [activeTabId, setActiveTabId] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // New bill state - inline table approach
  const [showNewBill, setShowNewBill] = useState(false);
  const [billItems, setBillItems] = useState([]);
  const [customerInfo, setCustomerInfo] = useState({
    customer_id: "",
    customer_name: "",
    customer_mobile: "",
    customer_email: "",
  });
  const [selectedCustomerStats, setSelectedCustomerStats] = useState(null);
  const [billDiscount, setBillDiscount] = useState(""); // text so it can be cleared; parse when used
  const [isPaid, setIsPaid] = useState(true);
  const [paymentMode, setPaymentMode] = useState("");
  const [isAdvancePaid, setIsAdvancePaid] = useState(false);
  const [advanceAmount, setAdvanceAmount] = useState("");
  // Udhar: goods handed over now, part (or none) paid now, the rest owed by the customer
  const [isCredit, setIsCredit] = useState(false);
  // Tier of the customer picked for this bill (badge + automatic discount)
  const [pickedCustomerTier, setPickedCustomerTier] = useState(null);
  const [paidNow, setPaidNow] = useState("");
  const [recordPaymentDialog, setRecordPaymentDialog] = useState({
    open: false,
    billId: "",
    billNo: "",
    remainingUnpaid: 0,
    amount: "",
    paymentMode: "Cash"
  });
  const [activeCustomerSuggestionIndex, setActiveCustomerSuggestionIndex] = useState(-1);

  // Patient Restock / Refill Reminder State
  const [refillReminder, setRefillReminder] = useState({
    enabled: false,
    days_supply: 30,
    remind_before_days: 5,
    refill_target_date: "",
    reminder_date: "",
    notes: "",
    selected_items: [],
    // auto: dates follow the dose calculator; custom: the user picked a date
    mode: "auto",
    doses: {}, // product_name -> { dose: "1", days: "", reorder: packs or units to order }
    lead: null, // remind this many days before it runs out (null = recommended)
  });

  const reminderDateRef = useRef(null);

  const calculateReminderDates = useCallback((bDate, daysSupply = 30, remindBefore = 5) => {
    try {
      const base = bDate ? new Date(bDate) : new Date();
      if (isNaN(base.getTime())) return { targetDate: "", reminderDate: "" };

      const target = new Date(base);
      target.setDate(target.getDate() + parseInt(daysSupply || 30));
      const targetDate = target.toISOString().slice(0, 10);

      const reminder = new Date(target);
      reminder.setDate(reminder.getDate() - parseInt(remindBefore || 5));
      const reminderDate = reminder.toISOString().slice(0, 10);

      return { targetDate, reminderDate };
    } catch (e) {
      return { targetDate: "", reminderDate: "" };
    }
  }, []);
  
  // Customer Profile Modal state
  const [showCustomerProfileModal, setShowCustomerProfileModal] = useState(false);
  const [customerProfileData, setCustomerProfileData] = useState(null);
  const [customerBills, setCustomerBills] = useState([]);
  const [customerBillsPage, setCustomerBillsPage] = useState(1);
  const [hasMoreCustomerBills, setHasMoreCustomerBills] = useState(false);
  const [loadingCustomerBills, setLoadingCustomerBills] = useState(false);
  const [customerBillsSearch, setCustomerBillsSearch] = useState("");
  const [expandedCustomerBills, setExpandedCustomerBills] = useState({});

  const [doctorName, setDoctorName] = useState("");
  const [doctorSearch, setDoctorSearch] = useState("");
  const [doctorSuggestions, setDoctorSuggestions] = useState([]);
  const [showDoctorSuggestions, setShowDoctorSuggestions] = useState(false);
  const [doctorPage, setDoctorPage] = useState(1);
  const [hasMoreDoctors, setHasMoreDoctors] = useState(false);
  const [loadingDoctors, setLoadingDoctors] = useState(false);

  // Customer suggestions pagination state
  const [customerSuggestions, setCustomerSuggestions] = useState([]);
  const [customerSuggestionPage, setCustomerSuggestionPage] = useState(1);
  const [hasMoreCustomerSuggestions, setHasMoreCustomerSuggestions] = useState(false);
  const [loadingCustomerSuggestions, setLoadingCustomerSuggestions] = useState(false);

  //billing date
  const [billingDate, setBillingDate] = useState(
    new Date().toISOString().slice(0, 10)
  );

  // New item row state
  const [newItemRow, setNewItemRow] = useState(null);
  const [inventorySearch, setInventorySearch] = useState("");
  const [inventorySuggestions, setInventorySuggestions] = useState([]);
  const [showInventorySuggestions, setShowInventorySuggestions] =
    useState(false);

  // Customer search
  const [customerSearch, setCustomerSearch] = useState("");
  const [showCustomerSuggestions, setShowCustomerSuggestions] = useState(false);

  //grand total editing state
  const [grandTotalInput, setGrandTotalInput] = useState("");
  const [isEditingGrandTotal, setIsEditingGrandTotal] = useState(false);
  const [editGrandTotalInput, setEditGrandTotalInput] = useState("");
  const [isEditingEditGrandTotal, setIsEditingEditGrandTotal] = useState(false);

  // Edit bill state - NEW: Full inline editing like PurchasesPage
  const [editingBillId, setEditingBillId] = useState(null);
  const [editingBillItems, setEditingBillItems] = useState([]);
  const [editingBillData, setEditingBillData] = useState(null);
  const [editingInventorySearch, setEditingInventorySearch] = useState("");
  const [editingInventorySuggestions, setEditingInventorySuggestions] =
    useState([]);
  const [showEditingInventorySuggestions, setShowEditingInventorySuggestions] =
    useState(false);
  const [activeEditingItemId, setActiveEditingItemId] = useState(null);
  const [highlightedEditingSuggestion, setHighlightedEditingSuggestion] =
    useState(-1);

  // Delete dialog
  const [deleteDialog, setDeleteDialog] = useState({ open: false, bill: null });

  // High-performance search cache & abort controllers
  const invSearchCacheRef = useRef(new Map());
  const invAbortRef = useRef(null);
  const editingInvSearchCacheRef = useRef(new Map());
  const editingInvAbortRef = useRef(null);
  const editLoadRef = useRef(0); // which bill's batches are loading
  const docSearchCacheRef = useRef(new Map());
  const docAbortRef = useRef(null);
  const custSearchCacheRef = useRef(new Map());
  const custAbortRef = useRef(null);

  // Expanded bill rows
  const [expandedBills, setExpandedBills] = useState({});
  const [pendingBillNo, setPendingBillNo] = useState("");
  const [pdfConfirmDialog, setPdfConfirmDialog] = useState({
    open: false,
    billId: null,
  });
  const [removeConfirmDialog, setRemoveConfirmDialog] = useState({
    open: false,
    itemId: null,
  });
  const [showMrpWarning, setShowMrpWarning] = useState(false);
  const [isEditModeWarning, setIsEditModeWarning] = useState(false);
  const [scannerModalOpen, setScannerModalOpen] = useState(false);

  // Draft bills state & handlers
  const [activeViewTab, setActiveViewTab] = useState("all");
  const [drafts, setDrafts] = useState([]);
  const [draftsLoading, setDraftsLoading] = useState(false);
  const [pendingDraftId, setPendingDraftId] = useState(null);
  // Helper to extract batch count and nearest expiry among all batches
  const getNearestExpiryInfo = (invItem) => {
    const batches = invItem?.batches || [];
    const batchCount = batches.length > 0 ? batches.length : (invItem?.batch_no ? 1 : 0);
    
    if (batches.length === 0) {
      return {
        batchCount,
        batchLabel: invItem?.batch_no || "-",
        expiryLabel: formatExpiry(invItem?.expiry_date),
        isMultiple: false
      };
    }

    let nearestExp = "-";
    let minTime = Infinity;

    batches.forEach((b) => {
      const exp = b.expiry_date;
      if (!exp || exp === "-") return;
      
      let dateObj = null;
      if (/^\d{2}\/\d{2}$/.test(exp)) {
        const [m, y] = exp.split("/");
        dateObj = new Date(2000 + parseInt(y), parseInt(m) - 1, 1);
      } else if (/^\d{2}\/\d{4}$/.test(exp)) {
        const [m, y] = exp.split("/");
        dateObj = new Date(parseInt(y), parseInt(m) - 1, 1);
      } else {
        dateObj = new Date(exp);
      }

      const t = isNaN(dateObj?.getTime()) ? Infinity : dateObj.getTime();
      if (t < minTime) {
        minTime = t;
        nearestExp = exp;
      }
    });

    if (nearestExp === "-" && invItem.expiry_date) {
      nearestExp = invItem.expiry_date;
    }

    return {
      batchCount,
      batchLabel: batches.length > 1 ? `${batches.length} Batches` : (batches[0]?.batch_no || invItem.batch_no || "-"),
      expiryLabel: formatExpiry(nearestExp),
      isMultiple: batches.length > 1
    };
  };

  const fetchDrafts = async () => {
    try {
      setDraftsLoading(true);
      const res = await axios.get(`${API}/bills/drafts`);
      setDrafts(res.data.drafts || []);
    } catch (e) {
      console.error("Failed to fetch drafts:", e);
    } finally {
      setDraftsLoading(false);
    }
  };

  useEffect(() => {
    fetchDrafts();
  }, []);

  const handleDeleteDraft = async (draftId) => {
    try {
      await axios.delete(`${API}/bills/drafts/${draftId}`);
      toast.success("Draft bill deleted successfully");
      fetchDrafts();
    } catch (e) {
      toast.error("Failed to delete draft bill");
    }
  };

  const handleLoadDraftToBill = (draft) => {
    setPendingDraftId(draft.id);
    setShowNewBill(true);

    if (draft.customer_name) {
      setCustomerInfo({
        customer_id: draft.customer_id || "",
        customer_name: draft.customer_name || "Walk-in Customer",
        customer_mobile: draft.customer_mobile || "",
        customer_email: draft.customer_email || "",
      });
    }

    if (draft.doctor) setDoctorName(draft.doctor);
    if (draft.billing_date) setBillingDate(draft.billing_date);
    if (draft.is_paid !== undefined) setIsPaid(draft.is_paid);
    if (draft.payment_mode) setPaymentMode(draft.payment_mode);

    if (draft.items && draft.items.length > 0) {
      handleTransferScannedItemsToBill(draft.items);
    }

    toast.success(`Loaded Draft ${draft.draft_no} into New Bill layout!`);
  };

  // Scanned lines arrive already matched to stock (inventory_id + that
  // product's batches). Older drafts carry only the inventory_id, so their
  // batch list is looked up for that exact product.
  const handleTransferScannedItemsToBill = async (scannedItems) => {
    if (!scannedItems || scannedItems.length === 0) return;

    const batchLists = await Promise.all(
      scannedItems.map(async (item) => {
        if (!item.inventory_id || item.available_batches?.length) return item.available_batches || [];
        try {
          const res = await axios.get(`${API}/inventory/search`, { params: { q: item.product_name, limit: 5 } });
          const group = (res.data.inventory || []).find((g) => (g.batches || []).some((b) => b.id === item.inventory_id));
          return (group?.batches || []).filter((b) => (b.available_quantity || 0) > 0 || b.id === item.inventory_id);
        } catch {
          return [];
        }
      })
    );

    setBillItems((prev) => {
      const isFirstRowEmpty =
        prev.length === 1 &&
        !prev[0].product_name &&
        !prev[0].inventory_id &&
        !prev[0].batch_no;

      const newRows = scannedItems.map((item, idx) => {
        const qty = parseInt(item.quantity) || 1;
        const mrp = parseFloat(item.mrp) || parseFloat(item.unit_price) || 0;
        const purchasePrice = parseFloat(item.purchase_price) || 0;
        const cgstVal = parseFloat(item.cgst) || 0;
        const sgstVal = parseFloat(item.sgst) || 0;
        const exclPrice = mrp / (1 + (cgstVal + sgstVal) / 100);
        const invId = item.inventory_id || null;
        const avail = item.available !== undefined ? item.available : item.available_quantity || 0;

        return {
          id: uuidv4(),
          inventory_id: invId,
          product_name: item.product_name || "",
          salt_composition: item.salt_composition || "",
          batch_no: item.batch_no || "",
          available_batches: batchLists[idx],
          quantity: qty,
          available: avail,
          available_quantity: avail,
          unit_price: mrp,
          exclusive_price: exclPrice,
          net_total: qty * mrp,
          mrp: mrp,
          purchase_price: purchasePrice,
          discount_percent: 0,
          cgst: item.cgst || 0,
          sgst: item.sgst || 0,
          hsn_no: item.hsn_no || "",
          units_per_pack: item.units_per_pack || 1,
          profit: (mrp - purchasePrice) * qty,
          is_manual: !invId,
          source: invId ? "inventory" : "manual",
          expiry_date: item.expiry_date || "",
        };
      });

      if (isFirstRowEmpty) {
        return newRows;
      }
      return [...prev, ...newRows];
    });
  };

  // Automatically open New Bill form and populate scanned items & customer details when returning from /scan-bill
  const consumedScanNavRef = useRef(null);
  useEffect(() => {
    // Each navigation hands its scanned items over once (StrictMode re-runs effects)
    if (location.state?.scannedItems && consumedScanNavRef.current !== location.key) {
      consumedScanNavRef.current = location.key;
      const { scannedItems, customerDetails } = location.state;
      setShowNewBill(true);
      if (scannedItems && scannedItems.length > 0) {
        handleTransferScannedItemsToBill(scannedItems);
      }
      if (customerDetails) {
        if (customerDetails.customer_name) {
          setCustomerInfo((prev) => ({
            ...prev,
            customer_id: customerDetails.customer_id || null,
            customer_name: customerDetails.customer_name,
            customer_mobile: customerDetails.customer_mobile || "0000000000",
            customer_email: customerDetails.customer_email || "",
          }));
        }
        if (customerDetails.doctor) {
          setDoctorName(customerDetails.doctor);
        }
        if (customerDetails.billing_date) {
          setBillingDate(customerDetails.billing_date);
        }
        if (customerDetails.is_paid !== undefined) {
          setIsPaid(customerDetails.is_paid);
        }
        if (customerDetails.payment_mode) {
          setPaymentMode(customerDetails.payment_mode);
        }
      }
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  // Refs for keyboard navigation
  const productInputRef = useRef(null);
  const quantityInputRef = useRef(null);
  // Row whose batch picker should open right after a product is chosen
  const [autoOpenBatchFor, setAutoOpenBatchFor] = useState(null);
  const focusQtyFor = (itemId) =>
    setTimeout(() => {
      const el = document.querySelector(`[data-qty-for="${itemId}"]`);
      if (el) {
        el.focus();
        el.select?.();
      }
    }, 30);
  const editingProductInputRef = useRef(null);

  // Keyboard shortcuts info

  // UPI QR: { amount, note } (amount "" asks for one)
  const [upiQr, setUpiQr] = useState(null);
  const whatsApp = useWhatsAppShare();
  // Bill line being added to the short book: { bill, line, item, quantity, unit, notes }
  const [shortBookFor, setShortBookFor] = useState(null);
  const [shortBookSaving, setShortBookSaving] = useState(false);
  const saveShortBook = async (e) => {
    e?.preventDefault();
    const sb = shortBookFor;
    if (!(Number(sb.quantity) > 0)) return toast.error("Enter the quantity to reorder");
    setShortBookSaving(true);
    try {
      const res = await axios.post(`${API}/shortbook`, { bill_id: sb.bill.id, line: sb.line, quantity: Number(sb.quantity), unit: sb.unit, notes: sb.notes });
      toast.success(res.data.merged ? `${sb.item.product_name} was already in the short book: now ${res.data.entry.quantity} ${res.data.entry.unit}` : `${sb.item.product_name} added to the short book`, {
        action: { label: "Open", onClick: () => navigate("/short-book") },
      });
      const mark = { entry_id: res.data.entry.id, quantity: Number(sb.quantity), unit: sb.unit, added_at: new Date().toISOString() };
      setBills((prev) => prev.map((b) => (b.id === sb.bill.id ? { ...b, items: b.items.map((it, i) => (i === sb.line ? { ...it, short_book: mark } : it)) } : b)));
      setShortBookFor(null);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Couldn't add to the short book");
    } finally {
      setShortBookSaving(false);
    }
  };

  // Dropdown keyboard navigation
  const [activeDropdownIndex, setActiveDropdownIndex] = useState(-1);
  const [highlightedSuggestion, setHighlightedSuggestion] = useState(-1);
  // Product suggestions: All / In stock / Near expiry, and the details panel
  const [suggestionFilter, setSuggestionFilter] = useState("all");
  const [detailsFor, setDetailsFor] = useState(null); // { item, rowId, mode: "new" | "edit" }

  const [activeBillItemId, setActiveBillItemId] = useState(null);
  const [isMouseOverSuggestions, setIsMouseOverSuggestions] = useState(false);
  const [isMouseOverEditingSuggestions, setIsMouseOverEditingSuggestions] = useState(false);
  const inputRefs = useRef({});
  const editingInputRefs = useRef({});

  const setInputRef = (el, itemId) => {
    if (el) {
      inputRefs.current[itemId] = el;
    }
  };
  const setEditingInputRef = (el, itemId) => {
    if (el) {
      editingInputRefs.current[itemId] = el;
    }
  };

  const [nearExpiryBatchFilter, setNearExpiryBatchFilter] = useState(false);

  const [dropdownPosition, setDropdownPosition] = useState({
    top: 0,
    left: 0,
    width: 540,
    transform: "none",
  });

  const updatePos = () => {
    const el = showInventorySuggestions
      ? inputRefs.current[activeBillItemId]
      : editingInputRefs.current[activeEditingItemId];
    if (el) {
      const rect = el.getBoundingClientRect();
      const dropdownWidth = Math.max(rect.width, 540);

      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const dropdownMaxHeight = 320;
      const positionAbove = spaceBelow < dropdownMaxHeight && spaceAbove > spaceBelow;

      setDropdownPosition({
        top: positionAbove ? rect.top - 4 : rect.bottom + 4,
        left: rect.left,
        width: dropdownWidth,
        transform: positionAbove ? "translateY(-100%)" : "none",
      });
    }
  };

  useEffect(() => {
    if (!showInventorySuggestions && !showEditingInventorySuggestions) return;

    let rafId;
    const runUpdate = () => {
      updatePos();
      rafId = requestAnimationFrame(runUpdate);
    };

    rafId = requestAnimationFrame(runUpdate);
    return () => cancelAnimationFrame(rafId);
  }, [showInventorySuggestions, showEditingInventorySuggestions, activeBillItemId, activeEditingItemId]);

  // Keyboard navigation scroll-into-view. The first option scrolls the list to
  // the very top so the sticky header never hides it.
  const revealSuggestion = (id, index) => {
    const el = document.getElementById(id);
    if (!el) return;
    const list = el.closest('[data-suggestions-dropdown="true"]');
    if (index === 0 && list) list.scrollTop = 0;
    else el.scrollIntoView({ block: "nearest" });
  };
  useEffect(() => {
    if (showInventorySuggestions && highlightedSuggestion >= 0) revealSuggestion(`suggestion-new-${highlightedSuggestion}`, highlightedSuggestion);
  }, [highlightedSuggestion, showInventorySuggestions]);

  useEffect(() => {
    if (showEditingInventorySuggestions && highlightedEditingSuggestion >= 0) revealSuggestion(`suggestion-edit-${highlightedEditingSuggestion}`, highlightedEditingSuggestion);
  }, [highlightedEditingSuggestion, showEditingInventorySuggestions]);

  useEffect(() => {
    if (showCustomerSuggestions && activeCustomerSuggestionIndex >= 0) {
      const el = document.getElementById(`customer-suggestion-${activeCustomerSuggestionIndex}`);
      el?.scrollIntoView({ block: "nearest" });
    }
  }, [activeCustomerSuggestionIndex, showCustomerSuggestions]);

  useEffect(() => {
    setActiveCustomerSuggestionIndex(-1);
  }, [customerSuggestions, showCustomerSuggestions]);

  // Default payment mode settings synchronization
  useEffect(() => {
    if (!isPaid && !isAdvancePaid && !(isCredit && parseFloat(paidNow) > 0)) {
      if (paymentMode !== "") {
        setPaymentMode("");
      }
      return;
    }
    const defaultMode = settings?.billing_payment_mode_default;
    if (defaultMode && defaultMode !== "none" && paymentMode === "") {
      setPaymentMode(defaultMode);
    }
  }, [settings, paymentMode, isPaid, isAdvancePaid, isCredit, paidNow]);

  // Pagination
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [filterBillType, setFilterBillType] = useState("all");

  // Search
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [tableLoading, setTableLoading] = useState(false);

  // Filters and Insights
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();
  const isInitialMount = useRef(true);
  const [filterCustomer, setFilterCustomer] = useState(
    searchParams.get("customer_id") || "all"
  );
  const [insightsData, setInsightsData] = useState(null);
  const [insightsLoading, setInsightsLoading] = useState(false);

  const handleCustomerFilterChange = (val) => {
    setFilterCustomer(val);
    setPage(1);
    if (val === "all") searchParams.delete("customer_id");
    else searchParams.set("customer_id", val);
    setSearchParams(searchParams);
  };

  const emptyItem = {
    id: "",
    inventory_id: "",
    product_name: "",
    batch_no: "",
    expiry_date: "",
    quantity: 1,
    unit_price: 0,
    exclusive_price: 0,
    net_total: 0,
    purchase_price: 0,
    available: 0,
    discount_percent: 0,
    is_manual: false,
    salt_composition: "",
    cgst: "",
    sgst: "",
    available_batches: [],
  };

  // ============ MULTI-TAB DRAFTS ============

  useEffect(() => {
    if (!user?.id) return;
    const STORAGE_KEY = `pharmalogy_billing_drafts_${user.id}`;
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setTabs(parsed);
          const active = parsed[0];
          setActiveTabId(active.id);
          setCustomerInfo(
            active.data.customerInfo || {
              customer_id: "",
              customer_name: "",
              customer_mobile: "",
              customer_email: "",
            }
          );
          setDoctorName(active.data.doctorName || "");
          setBillingDate(
            active.data.billingDate || new Date().toISOString().slice(0, 10)
          );
          setBillItems(active.data.billItems || []);
          setBillDiscount(active.data.billDiscount || "");
          setIsPaid(active.data.isPaid !== false);
          setPaymentMode(active.data.paymentMode || "");
        }
      } catch (e) {
        console.error("Failed to parse billing drafts", e);
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
                  customerInfo,
                  billingDate,
                  billItems,
                  billDiscount,
                  isPaid,
                  paymentMode,
                  doctorName,
                  isAdvancePaid,
                  advanceAmount,
                  isCredit,
                  paidNow,
                },
              }
            : t
        );
        localStorage.setItem(
          `pharmalogy_billing_drafts_${user.id}`,
          JSON.stringify(newTabs)
        );
        return newTabs;
      });
    }, 500);
    return () => clearTimeout(delay);
  }, [
    customerInfo,
    billingDate,
    billItems,
    billDiscount,
    isPaid,
    paymentMode,
    doctorName,
    isAdvancePaid,
    advanceAmount,
    isCredit,
    paidNow,
    activeTabId,
    user?.id,
  ]);

  // Ensure at least one item row is present when creating/viewing a new bill
  useEffect(() => {
    if (showNewBill && billItems.length === 0) {
      const defaultRow = { ...emptyItem, id: `temp-${Date.now()}` };
      setBillItems([defaultRow]);
      setTimeout(() => productInputRef.current?.focus(), 150);
    }
  }, [showNewBill, billItems.length]);

  const createNewTab = () => {
    if (tabs.length >= 10) {
      toast.error("Maximum 10 tabs allowed");
      return;
    }
    const newId = uuidv4();
    const defaultRow = { ...emptyItem, id: `temp-${Date.now()}` };
    const defaultMode = settings?.billing_payment_mode_default;
    const initialMode = defaultMode && defaultMode !== "none" ? defaultMode : "";
    const newTab = {
      id: newId,
      data: {
        customerInfo: {
          customer_id: "",
          customer_name: "",
          customer_mobile: "",
          customer_email: "",
        },
        doctorName: "",
        billingDate: new Date().toISOString().slice(0, 10),
        billItems: [defaultRow],
        billDiscount: "",
        isPaid: true,
        paymentMode: initialMode,
        isAdvancePaid: false,
        advanceAmount: "",
      },
    };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newId);
    setCustomerInfo({
      customer_id: "",
      customer_name: "",
      customer_mobile: "",
      customer_email: "",
    });
    setDoctorName("");
    setBillingDate(new Date().toISOString().slice(0, 10));
    setBillItems([defaultRow]);
    setBillDiscount("");
    setIsPaid(true);
    setPaymentMode(initialMode);
    setIsAdvancePaid(false);
    setAdvanceAmount("");
    setIsCredit(false);
    setPaidNow("");
    setShowNewBill(true);
    setTimeout(() => productInputRef.current?.focus(), 150);
  };

  const switchTab = (tabId) => {
    const target = tabs.find((t) => t.id === tabId);
    if (!target) return;

    // Switch state directly
    setActiveTabId(tabId);
    setCustomerInfo(
      target.data.customerInfo || {
        customer_id: "",
        customer_name: "",
        customer_mobile: "",
        customer_email: "",
      }
    );
    setDoctorName(target.data.doctorName || "");
    setBillingDate(
      target.data.billingDate || new Date().toISOString().slice(0, 10)
    );
    setBillItems(target.data.billItems || []);
    setBillDiscount(target.data.billDiscount || "");
    setIsPaid(target.data.isPaid !== false);
    setPaymentMode(target.data.paymentMode || "");
    setIsAdvancePaid(target.data.isAdvancePaid || false);
    setAdvanceAmount(target.data.advanceAmount || "");
    setIsCredit(target.data.isCredit || false);
    setPaidNow(target.data.paidNow || "");
    setShowNewBill(true);
    setTimeout(() => productInputRef.current?.focus(), 150);
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
      setCustomerInfo({
        customer_id: "",
        customer_name: "",
        customer_mobile: "",
        customer_email: "",
      });
      setDoctorName("");
      setBillingDate(new Date().toISOString().slice(0, 10));
      setBillItems([]);
      setBillDiscount("");
      setIsPaid(true);
      setPaymentMode("");
      setIsAdvancePaid(false);
      setAdvanceAmount("");
      setIsCredit(false);
      setPaidNow("");
      setShowNewBill(false);
    }

    if (user?.id) {
      localStorage.setItem(
        `pharmalogy_billing_drafts_${user.id}`,
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
      handleStartNewBill,
      handleSubmitBill,
      handleSaveEditBill,
      handleCancelAddItem,
      handleCancelNewBill,
      handleCancelEditBill,
      handleAddNewRow,
      showNewBill,
      newItemRow,
      editingBillId,
    };
  });

  // Keyboard: same keys as before, now through the app's shortcut layer so
  // they no longer collide with navigation (Alt+S used to open Suppliers)
  const shortcutLayer = useShortcutLayer();
  const [confirmDiscardBill, setConfirmDiscardBill] = useState(false);
  const billFormOpen = () => showNewBill || !!editingBillId;
  const saveOpenBill = () => (showNewBill ? handleSubmitBill() : handleSaveEditBill());
  // A suggestion list on screen closes first (its input handles Esc)
  const anyBillPopupOpen = () =>
    [...document.querySelectorAll('[id^="suggestion-new-"], [id^="suggestion-edit-"], [id^="customer-suggestion-"]')].some((el) => el.getClientRects().length > 0) ||
    (showDoctorSuggestions && doctorSuggestions.length > 0);
  useShortcuts(
    [
      { combo: "alt+n", label: "New bill", run: () => handleStartNewBill() },
      { combo: "alt+a", label: "Add an item line", when: () => showNewBill, run: () => handleAddNewRow() },
      { combo: "mod+enter", label: "Save the bill", when: billFormOpen, run: () => saveOpenBill() },
      { combo: "alt+s", label: "Save the bill (while one is open)", when: billFormOpen, run: () => saveOpenBill() },
      { combo: "alt+u", label: "Update the bill being edited", hidden: true, when: () => !!editingBillId, run: () => handleSaveEditBill() },
      { combo: "alt+q", label: "UPI payment QR", run: () => setUpiQr({ amount: "", note: "" }) },
      {
        combo: "escape",
        label: "Cancel the line, then the bill",
        inInputs: true,
        when: () => !!newItemRow || billFormOpen(),
        run: () => {
          if (anyBillPopupOpen()) return false; // the dropdown closes first
          if (newItemRow) return handleCancelAddItem();
          if (showNewBill) {
            if (billItems.some((i) => i.product_name)) return setConfirmDiscardBill(true);
            return handleCancelNewBill();
          }
          handleCancelEditBill();
        },
      },
    ],
    "Billing"
  );
  useEffect(() => {
    if (location.state?.newBill) {
      handleStartNewBill();
      window.history.replaceState({}, document.title);
    }
    // eslint-disable-next-line
  }, [location.state]);

  useEffect(() => {
    fetchData(true);
    // eslint-disable-next-line
  }, []);

  // Debounce search query changes
  useEffect(() => {
    const handler = setTimeout(() => {
      setPage(1);
      setDebouncedSearchQuery(searchQuery);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      if (location.state?.highlightId) {
        return;
      }
    }
    fetchData();
  }, [page, startDate, endDate, filterCustomer, debouncedSearchQuery, filterBillType]);


  // Fetch Insights when dates change
  useEffect(() => {
    if (startDate || endDate) {
      fetchInsights();
    } else {
      setInsightsData(null);
    }
  }, [startDate, endDate]);

  const fetchInsights = async () => {
    try {
      setInsightsLoading(true);
      const res = await axios.get(`${API}/bills/insights`, {
        params: {
          start_date: startDate || undefined,
          end_date: endDate || undefined,
        },
      });
      // Simulate slight delay for premium feeling load animation if network is too fast
      await new Promise((r) => setTimeout(r, 600));
      setInsightsData(res.data);
    } catch (e) {
      toast.error("Failed to load insights");
    } finally {
      setInsightsLoading(false);
    }
  };

  const handleDownloadInsights = () => {
    if (!insightsData) return;

    let csv = "Billing Insights Report\n";
    csv += `Period,${startDate || "Start"} to ${endDate || "End"}\n\n`;
    csv += `Summary Metrics\n`;
    csv += `Total Revenue,${insightsData.summary.total_revenue}\n`;
    csv += `Total Profit,${insightsData.summary.total_profit}\n`;
    csv += `Total Bills Created,${insightsData.summary.total_bills}\n`;
    csv += `Unpaid Bills Count,${insightsData.summary.unpaid_bills}\n`;
    csv += `Total Unpaid Debt,${insightsData.summary.unpaid_amount}\n\n`;

    csv += `Top 10 Products by Revenue\n`;
    csv += `Rank,Product Name,Quantity Sold,Revenue Generated,Profit Generated\n`;
    insightsData.top_products.forEach((p, idx) => {
      csv += `${idx + 1},"${p.name}",${p.quantity},${p.revenue},${p.profit}\n`;
    });

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `Billing_Insights_${startDate || "Start"}_to_${endDate || "End"}.csv`
    );
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success("Insights Report Downloaded");
  };

  const [loadingInventorySuggestions, setLoadingInventorySuggestions] = useState(false);
  const [loadingEditingInventorySuggestions, setLoadingEditingInventorySuggestions] = useState(false);

  // Server-side inventory search for new bills with instant cache & 120ms debounce
  useEffect(() => {
    const trimmed = (inventorySearch || "").trim();
    if (trimmed.length < 2) {
      if (invAbortRef.current) {
        invAbortRef.current.abort();
      }
      setInventorySuggestions([]);
      setShowInventorySuggestions(false);
      setLoadingInventorySuggestions(false);
      return;
    }

    const cacheKey = trimmed.toLowerCase();
    // ⚡ Instant Cache Hit (0ms)
    if (invSearchCacheRef.current.has(cacheKey)) {
      setInventorySuggestions(invSearchCacheRef.current.get(cacheKey));
      setShowInventorySuggestions(true);
    }

    const searchInventory = async () => {
      if (invAbortRef.current) {
        invAbortRef.current.abort();
      }
      const controller = new AbortController();
      invAbortRef.current = controller;

      if (!invSearchCacheRef.current.has(cacheKey)) {
        setLoadingInventorySuggestions(true);
      }

      try {
        const response = await axios.get(
          `${API}/inventory/search?q=${encodeURIComponent(trimmed)}&limit=30`,
          { signal: controller.signal }
        );
        const data = response.data.inventory || response.data.medicines || [];
        invSearchCacheRef.current.set(cacheKey, data);
        setInventorySuggestions(data);
        setShowInventorySuggestions(true);
      } catch (error) {
        if (!axios.isCancel(error)) {
          console.error("Inventory search error:", error);
        }
      } finally {
        if (invAbortRef.current === controller) {
          setLoadingInventorySuggestions(false);
        }
      }
    };

    const debounce = setTimeout(searchInventory, 120);
    return () => clearTimeout(debounce);
  }, [inventorySearch]);

  // Server-side inventory search for editing bills with instant cache
  useEffect(() => {
    const trimmed = (editingInventorySearch || "").trim();
    if (trimmed.length < 2) {
      if (editingInvAbortRef.current) {
        editingInvAbortRef.current.abort();
      }
      setEditingInventorySuggestions([]);
      setShowEditingInventorySuggestions(false);
      setLoadingEditingInventorySuggestions(false);
      return;
    }

    const cacheKey = trimmed.toLowerCase();
    // ⚡ Instant Cache Hit (0ms)
    if (editingInvSearchCacheRef.current.has(cacheKey)) {
      setEditingInventorySuggestions(editingInvSearchCacheRef.current.get(cacheKey));
      setShowEditingInventorySuggestions(true);
    }

    const searchInventory = async () => {
      if (editingInvAbortRef.current) {
        editingInvAbortRef.current.abort();
      }
      const controller = new AbortController();
      editingInvAbortRef.current = controller;

      if (!editingInvSearchCacheRef.current.has(cacheKey)) {
        setLoadingEditingInventorySuggestions(true);
      }

      try {
        const response = await axios.get(
          `${API}/inventory/search?q=${encodeURIComponent(trimmed)}&limit=30`,
          { signal: controller.signal }
        );
        const data = response.data.inventory || response.data.medicines || [];
        editingInvSearchCacheRef.current.set(cacheKey, data);
        setEditingInventorySuggestions(data);
        setShowEditingInventorySuggestions(true);
      } catch (error) {
        if (!axios.isCancel(error)) {
          console.error("Inventory search error:", error);
        }
      } finally {
        if (editingInvAbortRef.current === controller) {
          setLoadingEditingInventorySuggestions(false);
        }
      }
    };

    const debounce = setTimeout(searchInventory, 120);
    return () => clearTimeout(debounce);
  }, [editingInventorySearch]);

  // Server-side doctor search with instant cache & infinite scroll
  const fetchDoctors = async (page = 1, search = "", append = false) => {
    const trimmed = (search || "").trim();
    const cacheKey = `${page}:${trimmed.toLowerCase()}`;

    if (!append && docSearchCacheRef.current.has(cacheKey)) {
      const cached = docSearchCacheRef.current.get(cacheKey);
      setDoctorSuggestions(cached.doctors || []);
      setHasMoreDoctors(cached.has_more ?? false);
      setDoctorPage(page);
    }

    if (docAbortRef.current) {
      docAbortRef.current.abort();
    }
    const controller = new AbortController();
    docAbortRef.current = controller;

    if (!append && !docSearchCacheRef.current.has(cacheKey)) {
      setLoadingDoctors(true);
    }

    try {
      const response = await axios.get(
        `${API}/bills/doctors?search=${encodeURIComponent(trimmed)}&page=${page}&limit=20`,
        { signal: controller.signal }
      );
      const data = response.data.doctors || [];
      const hasMoreData = response.data.pagination?.has_more ?? data.length === 20;

      docSearchCacheRef.current.set(cacheKey, { doctors: data, has_more: hasMoreData });
      setDoctorSuggestions((prev) => (append ? [...prev, ...data] : data));
      setHasMoreDoctors(hasMoreData);
      setDoctorPage(page);
    } catch (error) {
      if (!axios.isCancel(error)) {
        console.error("Doctor search error:", error);
      }
    } finally {
      if (docAbortRef.current === controller) {
        setLoadingDoctors(false);
      }
    }
  };

  const loadMoreDoctors = () => {
    if (loadingDoctors || !hasMoreDoctors) return;
    fetchDoctors(doctorPage + 1, doctorSearch, true);
  };

  const handleSelectDoctor = async (doc) => {
    if (!doc) return;
    setDoctorName(doc.name);
    setDoctorSearch("");
    setShowDoctorSuggestions(false);
    if (doc.source === "global") {
      try {
        await axios.post(`${API}/bills/doctors/ensure-global`, doc);
      } catch (e) {}
    }
  };

  const handleSelectEditingDoctor = async (doc) => {
    if (!doc) return;
    setEditingBillData((prev) => ({
      ...prev,
      doctor: doc.name,
    }));
    setDoctorSearch("");
    setShowDoctorSuggestions(false);
    if (doc.source === "global") {
      try {
        await axios.post(`${API}/bills/doctors/ensure-global`, doc);
      } catch (e) {}
    }
  };

  useEffect(() => {
    const debounce = setTimeout(() => {
      fetchDoctors(1, doctorSearch, false);
    }, 120);
    return () => clearTimeout(debounce);
  }, [doctorSearch]);

  // Server-side customer search with instant cache & infinite scroll
  useEffect(() => {
    const trimmed = (customerSearch || "").trim();
    if (trimmed.length < 1) {
      if (custAbortRef.current) {
        custAbortRef.current.abort();
      }
      setCustomerSuggestions([]);
      setHasMoreCustomerSuggestions(false);
      setCustomerSuggestionPage(1);
      return;
    }

    const cacheKey = trimmed.toLowerCase();
    // ⚡ Instant Cache Hit (0ms)
    if (custSearchCacheRef.current.has(cacheKey)) {
      const cached = custSearchCacheRef.current.get(cacheKey);
      setCustomerSuggestions(cached.customers || []);
      setHasMoreCustomerSuggestions(cached.has_more ?? false);
    }

    const searchCustomers = async () => {
      if (custAbortRef.current) {
        custAbortRef.current.abort();
      }
      const controller = new AbortController();
      custAbortRef.current = controller;

      if (!custSearchCacheRef.current.has(cacheKey)) {
        setLoadingCustomerSuggestions(true);
      }

      try {
        const response = await axios.get(
          `${API}/customers?search=${encodeURIComponent(trimmed)}&page=1&limit=15`,
          { signal: controller.signal }
        );
        const data = response.data.customers || [];
        const hasMore = response.data.pagination?.page < response.data.pagination?.total_pages;

        custSearchCacheRef.current.set(cacheKey, { customers: data, has_more: hasMore });
        setCustomerSuggestions(data);
        setHasMoreCustomerSuggestions(hasMore);
        setCustomerSuggestionPage(1);
      } catch (error) {
        if (!axios.isCancel(error)) {
          console.error("Customer search error:", error);
        }
      } finally {
        if (custAbortRef.current === controller) {
          setLoadingCustomerSuggestions(false);
        }
      }
    };

    const debounce = setTimeout(searchCustomers, 120);
    return () => clearTimeout(debounce);
  }, [customerSearch]);

  // Fetch real-time stats for the selected customer
  useEffect(() => {
    const custId = editingBillId ? editingBillData?.customer_id : customerInfo?.customer_id;
    if (!custId) {
      setSelectedCustomerStats(null);
      return;
    }

    const fetchSelectedCustomerStats = async () => {
      try {
        const res = await axios.get(`${API}/customers/${custId}`);
        const customer = res.data.customer;
        const bills = res.data.bills || [];
        
        const totalDebt = customer?.total_debt || 0;
        const totalBills = bills.length;
        const totalItems = bills.reduce((acc, b) => acc + (b.items?.length || 0), 0);

        setSelectedCustomerStats({
          totalDebt,
          totalBills,
          totalItems
        });
      } catch (err) {
        console.error("Failed to fetch selected customer stats", err);
      }
    };

    fetchSelectedCustomerStats();
  }, [customerInfo?.customer_id, editingBillData?.customer_id, editingBillId]);

  const loadMoreCustomerSuggestions = async () => {
    if (loadingCustomerSuggestions || !hasMoreCustomerSuggestions) return;

    setLoadingCustomerSuggestions(true);
    try {
      const nextPage = customerSuggestionPage + 1;
      const response = await axios.get(
        `${API}/customers?search=${encodeURIComponent(customerSearch)}&page=${nextPage}&limit=15`
      );
      setCustomerSuggestions((prev) => [
        ...prev,
        ...(response.data.customers || []),
      ]);
      setHasMoreCustomerSuggestions(
        response.data.pagination?.page < response.data.pagination?.total_pages
      );
      setCustomerSuggestionPage(nextPage);
    } catch (error) {
      console.error("Failed to load more customers:", error);
    } finally {
      setLoadingCustomerSuggestions(false);
    }
  };

  const handleScrollCustomerSuggestions = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target;
    if (scrollHeight - scrollTop - clientHeight < 30) {
      loadMoreCustomerSuggestions();
    }
  };

  const fetchCustomerProfileData = async (customerId) => {
    if (!customerId) return;
    try {
      const res = await axios.get(`${API}/customers/${customerId}`);
      setCustomerProfileData(res.data);
      setExpandedCustomerBills({});
      // Fetch initial bills page
      setCustomerBillsPage(1);
      setCustomerBillsSearch("");
      fetchCustomerBills(customerId, 1, "", false);
      setShowCustomerProfileModal(true);
    } catch (err) {
      console.error("Failed to fetch customer profile data", err);
      toast.error("Failed to load customer profile details");
    }
  };

  const fetchCustomerBills = async (customerId, pageNum, searchTerm, isLoadMore = false) => {
    if (!customerId) return;
    setLoadingCustomerBills(true);
    try {
      const res = await axios.get(`${API}/bills`, {
        params: {
          customer_id: customerId,
          search: searchTerm || undefined,
          page: pageNum,
          limit: 10,
        },
      });

      if (isLoadMore) {
        setCustomerBills((prev) => [...prev, ...res.data.bills]);
      } else {
        setCustomerBills(res.data.bills);
      }

      const total = res.data.pagination?.total || 0;
      const loaded = isLoadMore ? (customerBills.length + res.data.bills.length) : res.data.bills.length;
      setHasMoreCustomerBills(loaded < total);
      setCustomerBillsPage(pageNum);
    } catch (err) {
      console.error("Failed to fetch customer bills", err);
      toast.error("Failed to load customer bills");
    } finally {
      setLoadingCustomerBills(false);
    }
  };

  const toggleCustomerBillExpand = (billId) => {
    setExpandedCustomerBills((prev) => ({
      ...prev,
      [billId]: !prev[billId],
    }));
  };

  const fetchData = async (isInitial = false) => {
    try {
      if (isInitial) {
        setLoading(true);
      } else {
        setTableLoading(true);
      }

      const hlId = isInitial ? location.state?.highlightId : undefined;

      const billsRes = await axios.get(`${API}/bills`, {
        params: {
          page: hlId ? undefined : page,
          limit,
          start_date: startDate || undefined,
          end_date: endDate || undefined,
          customer_id: filterCustomer !== "all" ? filterCustomer : undefined,
          search: debouncedSearchQuery || undefined,
          highlight_id: hlId || undefined,
          is_advance_paid: filterBillType === "advance" ? "true" : (filterBillType === "regular" ? "false" : undefined),
        },
      });

      let finalBills = billsRes?.data?.bills || [];

      // Strict fallback filter: ensure backend results physically match the selected dropdown customer UI
      if (filterCustomer && filterCustomer !== "all") {
        finalBills = finalBills.filter((b) => b.customer_id === filterCustomer);
      }

      setBills(finalBills);
      setTotalBills(billsRes?.data?.pagination?.total);

      if (hlId && billsRes.data.pagination?.page) {
        setPage(billsRes.data.pagination.page);
      } else {
        setTotalPages(billsRes.data.pagination.total_pages);
      }

      if (hlId) {
        setTimeout(() => {
          setExpandedBills((prev) => ({ ...prev, [hlId]: true }));
          const el = document.getElementById(`record-${hlId}`);
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
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
      setTableLoading(false);
    }
  };



  // ============ NEW BILL - INLINE TABLE ============

  const handleStartNewBill = () => {
    if (!showNewBill && tabs.length === 0) {
      createNewTab();
    } else {
      setShowNewBill(true);
      setTimeout(() => productInputRef.current?.focus(), 150);
    }
  };

  const handleCancelNewBill = () => {
    setShowNewBill(false);
    setBillItems([]);
    setCustomerInfo({
      customer_id: "",
      customer_name: "",
      customer_mobile: "",
      customer_email: "",
    });
    setBillDiscount("");
    setIsPaid(true);
    setIsAdvancePaid(false);
    setAdvanceAmount("");
    setIsCredit(false);
    setPaidNow("");
    setPaymentMode("");
    setNewItemRow(null);
    setRefillReminder((prev) => ({ ...prev, enabled: false, refill_target_date: "", reminder_date: "", notes: "", selected_items: [], mode: "auto", doses: {}, lead: null }));
    clearDraft();
  };

  // Add new empty row
  const handleAddNewRow = () => {
    const newRow = { ...emptyItem, id: `temp-${Date.now()}` };
    setBillItems((prev) => [...prev, newRow]);
    setTimeout(() => productInputRef.current?.focus(), 100);
  };

  const handleStartAddItem = () => {
    handleAddNewRow();
  };

  const handleCancelAddItem = () => {
    setNewItemRow(null);
    setInventorySearch("");
    setInventorySuggestions([]);
    setShowInventorySuggestions(false);
  };

  // Handle selecting inventory item for a specific row
  const handleSelectInventoryForRow = (itemId, inventoryItem) => {
    const isGlobalOrEmpty =
      inventoryItem.source === "global" ||
      !inventoryItem.batches ||
      inventoryItem.batches.length === 0;

    let availableBatches = (inventoryItem.batches || []).filter(
      (b) => (b.available_quantity || 0) > 0
    );
    if (availableBatches.length === 0) {
      availableBatches = inventoryItem.batches || [];
    }

    if (nearExpiryBatchFilter && availableBatches.length > 0) {
      availableBatches.sort((a, b) => {
        if (!a.expiry_date) return 1;
        if (!b.expiry_date) return -1;
        return a.expiry_date.localeCompare(b.expiry_date);
      });
    }

    const defaultBatch = availableBatches[0] || inventoryItem;

    setBillItems((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;

        const qty = parseInt(item.quantity) || 1;
        const unitPrice =
          defaultBatch.mrp_per_unit ||
          defaultBatch.mrp ||
          inventoryItem.mrp_per_unit ||
          inventoryItem.mrp ||
          0;
        const purchasePrice =
          defaultBatch.cost_per_unit ||
          defaultBatch.purchase_price ||
          inventoryItem.purchase_price ||
          0;
        const cgstVal =
          defaultBatch.cgst !== undefined
            ? Math.max(0, parseFloat(defaultBatch.cgst) || 0)
            : 0;
        const sgstVal =
          defaultBatch.sgst !== undefined
            ? Math.max(0, parseFloat(defaultBatch.sgst) || 0)
            : 0;
        const exclPrice = unitPrice / (1 + (cgstVal + sgstVal) / 100);
        const itemDiscount =
          qty * exclPrice * ((parseFloat(item.discount_percent) || 0) / 100);
        const netTotal =
          (qty * exclPrice - itemDiscount) * (1 + (cgstVal + sgstVal) / 100);

        return {
          ...item,
          inventory_id: isGlobalOrEmpty ? null : defaultBatch.id,
          product_name: inventoryItem.product_name || inventoryItem.name,
          salt_composition: inventoryItem.salt_composition || "",
          batch_no: isGlobalOrEmpty ? "" : defaultBatch.batch_no || "",
          expiry_date: isGlobalOrEmpty ? "" : defaultBatch.expiry_date || "",
          unit_price: unitPrice,
          exclusive_price: exclPrice,
          net_total: netTotal,
          purchase_price: purchasePrice,
          available: isGlobalOrEmpty
            ? 0
            : defaultBatch.available_quantity ||
              defaultBatch.available_units ||
              0,
          units_per_pack: inventoryItem.units_per_pack || 1,
          is_manual: isGlobalOrEmpty,
          source: inventoryItem.source || "inventory",
          cgst: defaultBatch.cgst !== undefined ? defaultBatch.cgst : "",
          sgst: defaultBatch.sgst !== undefined ? defaultBatch.sgst : "",
          available_batches: availableBatches,
        };
      })
    );
    setInventorySearch("");
    setInventorySuggestions([]);
    setShowInventorySuggestions(false);
    setIsMouseOverSuggestions(false);
    setActiveBillItemId(null);
    if (!isGlobalOrEmpty && availableBatches.length > 0) setAutoOpenBatchFor(itemId);
    else focusQtyFor(itemId);
  };

  // Handle manual entry for items not in inventory
  const handleManualEntry = (itemId, productName) => {
    setBillItems((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;

        return {
          ...item,
          inventory_id: null,
          product_name: productName || item.product_name,
          is_manual: true,
          available: 0,
          batch_no: "",
          expiry_date: "",
          unit_price: 0,
          purchase_price: 0,
        };
      })
    );
    setInventorySearch("");
    setInventorySuggestions([]);
    setShowInventorySuggestions(false);
    setHighlightedSuggestion(-1);
    setIsMouseOverSuggestions(false);
    setActiveBillItemId(null);
    setTimeout(() => quantityInputRef.current?.focus(), 100);
  };

  // Item QR labels (printed from Purchases): scanned with the camera, or by a
  // QR scanner typing into the product search
  const [labelScanOpen, setLabelScanOpen] = useState(false);
  const addFromLabel = (item, fromRowId = null) => {
    if (!showNewBill) {
      if (editingBillId) return toast.info("Scan item labels in a new bill");
      handleStartNewBill();
    }
    if (item.returned) toast.warning(`${item.product_name} (${item.batch_no}) was returned to the supplier`);
    else if (item.expired) toast.warning(`${item.product_name} batch ${item.batch_no} has expired`);
    else if (item.available_quantity <= 0) toast.info(`${item.product_name} shows no stock; it will be billed as negative stock`);
    const existing = billItems.find((r) => r.inventory_id === item.inventory_id && r.id !== fromRowId);
    setBillItems((prev) => prev.filter((r) => r.id !== fromRowId && r.product_name && !findItemLabel(r.product_name)));
    if (existing) {
      toast.info(`${item.product_name} is already in this bill: change its quantity`);
      return focusQtyFor(existing.id);
    }
    handleTransferScannedItemsToBill([{ ...item, quantity: 1, unit_price: item.mrp, available: item.available_quantity, available_batches: [] }]);
    // Next: the quantity of the added line
    setTimeout(() => {
      const qty = [...document.querySelectorAll("[data-qty-for]")].pop();
      qty?.focus();
      qty?.select?.();
    }, 200);
  };

  const expiryWarningDays = Number(settings?.expiry_warning_days) || 90;
  const visibleSuggestions = filterSuggestions(inventorySuggestions, suggestionFilter, expiryWarningDays);
  const visibleEditingSuggestions = filterSuggestions(editingInventorySuggestions, suggestionFilter, expiryWarningDays);
  // Alt+1/2/3: suggestion filter; Alt+D: details of the highlighted medicine
  const suggestionHotkey = (e, list, highlighted, setHighlighted, rowId, mode) => {
    if (!e.altKey || e.ctrlKey || e.metaKey) return false;
    const f = SUGGESTION_FILTERS.find((x) => e.code === `Digit${x.key}`);
    if (f) {
      e.preventDefault();
      setSuggestionFilter(f.id);
      setHighlighted(-1);
      return true;
    }
    if (e.code === "KeyD") {
      e.preventDefault();
      const item = list[highlighted] || list[0];
      if (item) openSuggestionDetails(item, rowId, mode);
      return true;
    }
    return false;
  };
  // Width/position shared with Purchases: ~72% of the screen, 860-1100 px
  const suggestionBoxStyle = () => {
    const vw = window.innerWidth || 1200;
    const width = Math.min(vw - 32, Math.max(860, Math.min(vw * 0.72, 1100)));
    return {
      position: "fixed",
      top: dropdownPosition.top,
      left: Math.max(16, Math.min(dropdownPosition.left, vw - width - 16)),
      width,
      maxHeight: "440px",
      transform: dropdownPosition.transform || "none",
      overscrollBehavior: "contain",
      // Keyboard-highlighted rows stop below the sticky header, not under it
      scrollPaddingTop: "44px",
      scrollPaddingBottom: "64px",
      WebkitOverflowScrolling: "touch",
    };
  };
  // The details panel replaces the dropdown while it's open
  const openSuggestionDetails = (item, rowId, mode) => {
    if (mode === "edit") {
      setShowEditingInventorySuggestions(false);
      setIsMouseOverEditingSuggestions(false);
    } else {
      setShowInventorySuggestions(false);
      setIsMouseOverSuggestions(false);
    }
    setDetailsFor({ item, rowId, mode });
  };
  const pickDetailsItem = (item) => {
    const target = detailsFor;
    setDetailsFor(null);
    if (!target) return;
    if (target.mode === "edit") handleSelectInventoryForEditRow(target.rowId, item);
    else handleSelectInventoryForRow(target.rowId, item);
  };

  // Handle dropdown keyboard navigation
  const handleDropdownKeyDown = (e, itemId) => {
    const label = e.key === "Enter" ? findItemLabel(e.currentTarget.value) : null;
    if (label) {
      e.preventDefault();
      setShowInventorySuggestions(false);
      setInventorySearch("");
      // The row keeps what it had before the scan; an empty row is replaced
      handleItemFieldChange(itemId, "product_name", label.before);
      resolveItemLabel(label.code)
        .then((item) => addFromLabel(item, label.before ? null : itemId))
        .catch((err) => toast.error(err.message));
      return;
    }
    if (!showInventorySuggestions) return;
    if (suggestionHotkey(e, visibleSuggestions, highlightedSuggestion, setHighlightedSuggestion, itemId, "new")) return;

    // Medicines first, Manual entry last
    const hasManual = !!(inventorySearch && inventorySearch.length >= 2);
    const totalOptions = visibleSuggestions.length + (hasManual ? 1 : 0);
    if (totalOptions === 0 && e.key !== "Escape") return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedSuggestion((prev) => (prev + 1) % totalOptions);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedSuggestion((prev) =>
        prev <= 0 ? totalOptions - 1 : prev - 1
      );
    } else if (e.key === "Enter" && highlightedSuggestion >= 0) {
      e.preventDefault();
      if (visibleSuggestions[highlightedSuggestion]) {
        handleSelectInventoryForRow(itemId, visibleSuggestions[highlightedSuggestion]);
      } else if (hasManual && highlightedSuggestion === visibleSuggestions.length) {
        handleManualEntry(itemId, inventorySearch);
      }
      setHighlightedSuggestion(-1);
    } else if (e.key === "Escape") {
      setShowInventorySuggestions(false);
      setHighlightedSuggestion(-1);
    }
  };

  const handleSelectInventoryItem = (item) => {
    const cgstVal = item.cgst !== undefined ? Math.max(0, parseFloat(item.cgst) || 0) : 0;
    const sgstVal = item.sgst !== undefined ? Math.max(0, parseFloat(item.sgst) || 0) : 0;
    const unitPrice = item.mrp_per_unit || item.mrp || 0;
    const exclPrice = unitPrice / (1 + (cgstVal + sgstVal) / 100);

    setNewItemRow({
      ...newItemRow,
      inventory_id: item.id,
      product_name: item.product_name,
      salt_composition: item.salt_composition || "",
      batch_no: item.batch_no,
      expiry_date: item.expiry_date || "",
      unit_price: unitPrice,
      exclusive_price: exclPrice,
      purchase_price: item.cost_per_unit || item.purchase_price || 0,
      available: item.available_quantity || item.available_units || 0,
      units_per_pack: item.units_per_pack || 1,
      cgst: item.cgst !== undefined ? item.cgst : "",
      sgst: item.sgst !== undefined ? item.sgst : "",
    });
    setInventorySearch("");
    setInventorySuggestions([]);
    setShowInventorySuggestions(false);
    setTimeout(() => quantityInputRef.current?.focus(), 100);
  };

  const handleSelectCustomer = (customer) => {
    if (editingBillId) {
      setEditingBillData({
        ...editingBillData,
        customer_id: customer.id,
        customer_name: customer.name,
        customer_mobile: customer.mobile,
        customer_email: customer.email || "",
      });
    } else {
      setCustomerInfo({
        customer_id: customer.id,
        customer_name: customer.name,
        customer_mobile: customer.mobile,
        customer_email: customer.email || "",
      });
      setPickedCustomerTier(customer.tier ? customer : null);
      // Their tier / personal discount, unless a discount was already typed
      if (customer.auto_apply_discount && customer.discount_percent > 0 && !(parseFloat(billDiscount) > 0)) {
        setBillDiscount(customer.discount_percent);
        toast.success(`${customer.discount_percent}% ${customer.discount_source === "customer" ? "personal" : (customer.tier_label || "").toLowerCase()} discount applied for ${customer.name}`);
      }
    }

    setCustomerSearch(customer.name);
    setShowCustomerSuggestions(false);
  };

  // Handle item field change for editable rows
  const handleItemFieldChange = (itemId, field, value) => {
    setBillItems((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;

        // Clamp cgst/sgst values to a minimum of 0
        let val = value;
        if (field === "cgst" || field === "sgst") {
          val = value === "" ? "" : Math.max(0, parseFloat(value) || 0).toString();
        }

        const updated = { ...item, [field]: val };

        if (
          field === "quantity" ||
          field === "unit_price" ||
          field === "discount_percent" ||
          field === "cgst" ||
          field === "sgst"
        ) {
          const qty = parseInt(updated.quantity) || 1;
          const unitPrice = parseFloat(updated.unit_price) || 0;
          const discPercent = parseFloat(updated.discount_percent) || 0;
          const purchasePrice = parseFloat(updated.purchase_price) || 0;
          const cgstVal = Math.max(0, parseFloat(updated.cgst) || 0);
          const sgstVal = Math.max(0, parseFloat(updated.sgst) || 0);

          if (field === "unit_price" || field === "cgst" || field === "sgst" || updated.exclusive_price === undefined || updated.exclusive_price === null || isNaN(updated.exclusive_price) || updated.exclusive_price === 0) {
            updated.exclusive_price = unitPrice / (1 + (cgstVal + sgstVal) / 100);
          }

          const exclPrice = parseFloat(updated.exclusive_price) || 0;
          const itemTotal = qty * exclPrice;
          const itemDiscount = itemTotal * (discPercent / 100);
          const taxableValue = itemTotal - itemDiscount;
          updated.net_total = taxableValue * (1 + (cgstVal + sgstVal) / 100);
          updated.profit = (unitPrice - purchasePrice) * qty - (qty * unitPrice * (discPercent / 100));
        }

        return updated;
      })
    );

    if (field === "product_name") {
      setInventorySearch(value);
      setShowInventorySuggestions(true);
      setActiveBillItemId(itemId);
    }
  };

  const handleNewItemChange = (field, value) => {
    setNewItemRow((prev) => ({ ...prev, [field]: value }));
    if (field === "product_name") {
      setInventorySearch(value);
    }
  };

  const handleSaveNewItem = () => {
    if (!newItemRow.product_name) {
      toast.error("Please select a product");
      return;
    }
    if (newItemRow.inventory_id && newItemRow.quantity > newItemRow.available) {
      toast.error(`Only ${newItemRow.available} units available`);
      return;
    }
    if (newItemRow.quantity < 1 || newItemRow.unit_price <= 0) {
      toast.error("Invalid quantity or price");
      return;
    }

    const cgstVal = Math.max(0, parseFloat(newItemRow.cgst) || 0);
    const sgstVal = Math.max(0, parseFloat(newItemRow.sgst) || 0);
    const unitPrice = parseFloat(newItemRow.unit_price) || 0;
    const exclPrice = unitPrice / (1 + (cgstVal + sgstVal) / 100);
    const itemTotal = newItemRow.quantity * exclPrice;
    const itemDiscount = itemTotal * (newItemRow.discount_percent / 100);
    const taxableValue = itemTotal - itemDiscount;

    const item = {
      ...newItemRow,
      exclusive_price: exclPrice,
      net_total: taxableValue * (1 + (cgstVal + sgstVal) / 100),
      profit:
        (newItemRow.unit_price - newItemRow.purchase_price) *
        newItemRow.quantity - (newItemRow.quantity * newItemRow.unit_price * (newItemRow.discount_percent / 100)),
    };

    setBillItems((prev) => [...prev, item]);
    setNewItemRow(null);
    setInventorySearch("");
  };

  const handleRemoveItem = (itemId) => {
    setRemoveConfirmDialog({ open: true, itemId });
  };

  const confirmRemoveItem = () => {
    if (!removeConfirmDialog.itemId) return;
    setBillItems((prev) =>
      prev.filter((item) => item.id !== removeConfirmDialog.itemId)
    );
    setRemoveConfirmDialog({ open: false, itemId: null });
  };

  const handleFullPackToggle = (itemId, checked) => {
    setBillItems((prevItems) =>
      prevItems.map((item) => {
        if (item.id !== itemId) return item;

        const newQty = checked ? (parseInt(item.units_per_pack) || 1) : (parseInt(item.previousQuantity) || 1);
        const cgstVal = Math.max(0, parseFloat(item.cgst) || 0);
        const sgstVal = Math.max(0, parseFloat(item.sgst) || 0);
        const unitPrice = parseFloat(item.unit_price) || 0;
        const purchasePrice = parseFloat(item.purchase_price) || 0;
        const discPercent = parseFloat(item.discount_percent) || 0;
        const exclPrice = parseFloat(item.exclusive_price) || (unitPrice / (1 + (cgstVal + sgstVal) / 100));
        const itemTotal = newQty * exclPrice;
        const itemDiscount = itemTotal * (discPercent / 100);
        const taxableValue = itemTotal - itemDiscount;
        const netTotal = taxableValue * (1 + (cgstVal + sgstVal) / 100);
        const profit = (unitPrice - purchasePrice) * newQty - (newQty * unitPrice * (discPercent / 100));

        return {
          ...item,
          quantity: newQty,
          previousQuantity: checked ? item.quantity : undefined,
          exclusive_price: exclPrice,
          net_total: netTotal,
          profit: profit,
        };
      })
    );
  };

  // Handle Tab key for default values
  const handleTabDefault = (e, field) => {
    if (e.key === "Tab" && !e.shiftKey) {
      const value = e.target.value;
      if (!value || value === "" || value === "0") {
        let defaultValue = "";
        switch (field) {
          case "quantity":
            defaultValue = "1";
            e.preventDefault();
            handleNewItemChange("quantity", 1);
            break;
          case "discount_percent":
            defaultValue = "0";
            e.preventDefault();
            handleNewItemChange("discount_percent", 0);
            break;
          case "customer_name":
            defaultValue = "Walk-in";
            e.preventDefault();
            setCustomerInfo((prev) => ({
              ...prev,
              customer_name: defaultValue,
            }));
            break;
          case "customer_mobile":
            defaultValue = "0000000000";
            e.preventDefault();
            setCustomerInfo((prev) => ({
              ...prev,
              customer_mobile: defaultValue,
            }));
            break;
          default:
            return;
        }
        const form = e.target.form || e.target.closest("tr, .space-y-4");
        const inputs = form?.querySelectorAll("input, select, button");
        const currentIndex = Array.from(inputs || []).indexOf(e.target);
        if (inputs && currentIndex >= 0 && currentIndex < inputs.length - 1) {
          setTimeout(() => inputs[currentIndex + 1]?.focus(), 0);
        }
      }
    }
  };

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

  const handleSubmitBill = async (force = false) => {
    if (!customerInfo.customer_name || !customerInfo.customer_mobile) {
      toast.error("Please enter customer name and mobile");
      return;
    }

    if (settings?.billing_payment_mode_mandatory && (isPaid || isAdvancePaid || (isCredit && parseFloat(paidNow) > 0)) && (!paymentMode || paymentMode === "none")) {
      toast.error("Payment mode is mandatory for paid or advance paid bills. Please select Cash, UPI, or Card.");
      return;
    }
    if (isCredit && (parseFloat(paidNow) || 0) < 0) {
      toast.error("Paid now can't be negative");
      return;
    }
    if (isCredit && grandTotal > 0 && Math.round((parseFloat(paidNow) || 0) * 100) > Math.round(grandTotal * 100)) {
      toast.error(`Paid now can't be more than the bill total ₹${grandTotal.toFixed(2)}. Turn off Udhar if it's fully paid.`);
      return;
    }

    const validItems = billItems.filter(
      (item) => item.product_name && item.product_name.trim() !== ""
    );

    if (validItems.length === 0) {
      toast.error("Please add at least one item with a product");
      return;
    }

    const hasEmptyMrp = validItems.some(
      (item) => !item.unit_price || parseFloat(item.unit_price) === 0
    );

    if (hasEmptyMrp && force !== true) {
      setIsEditModeWarning(false);
      setShowMrpWarning(true);
      return;
    }

    setSubmitting(true);
    try {
      const response = await axios.post(`${API}/bills`, {
        customer_id: customerInfo.customer_id || null,
        customer_name: customerInfo.customer_name,
        customer_mobile: customerInfo.customer_mobile,
        customer_email: customerInfo.customer_email || null,
        billing_date: billingDate,
        doctor: doctorName || null,
        items: validItems.map(
          ({
            id,
            net_total,
            profit,
            available,
            units_per_pack,
            salt_composition,
            exclusive_price,
            ...item
          }) => ({
            inventory_id: item.inventory_id || null,
            product_name: item.product_name,
            batch_no: item.batch_no,
            hsn_no: item.hsn_no || null,
            expiry_date: item.expiry_date ? expiryToIso(item.expiry_date) || item.expiry_date : null,
            quantity: parseInt(item.quantity) || 1,
            unit_price: parseFloat(item.unit_price) || 0,
            purchase_price: parseFloat(item.purchase_price) || 0,
            discount_percent: parseFloat(item.discount_percent) || 0,
            cgst: parseFloat(item.cgst) || 0,
            sgst: parseFloat(item.sgst) || 0,
            units_per_pack: parseInt(units_per_pack) || null,
            item_total: parseFloat(net_total) || 0,
          })
        ),
        discount_percent: parseFloat(billDiscount) || 0,
        is_paid: isPaid,
        payment_mode: (paymentMode && paymentMode !== "none") ? paymentMode : null,
        is_advance_paid: isAdvancePaid,
        advance_amount: isAdvancePaid ? (parseFloat(advanceAmount) || 0) : 0,
        is_credit: isCredit,
        paid_now: isCredit ? (parseFloat(paidNow) || 0) : 0,
        draft_id: pendingDraftId || null,
        refill_reminder: refillReminder.enabled ? {
          enabled: true,
          days_supply: refillReminder.days_supply,
          remind_before_days: refillReminder.remind_before_days,
          refill_target_date: refillReminder.refill_target_date || calculateReminderDates(billingDate, refillReminder.days_supply, refillReminder.remind_before_days).targetDate,
          reminder_date: refillReminder.reminder_date || calculateReminderDates(billingDate, refillReminder.days_supply, refillReminder.remind_before_days).reminderDate,
          notes: refillReminder.notes || `Refill reminder for ${customerInfo.customer_name}`,
          items: refillCalc.rows.map((r) => ({
            product_name: r.product_name,
            batch_no: r.batch_no,
            quantity: r.quantity,
            unit_price: r.unit_price,
            dose_per_day: r.days_input ? null : r.dose_per_day,
            days_supply: r.days || refillReminder.days_supply,
            runs_out_on: r.runs_out_on,
            product_id: r.product_id,
            inventory_id: r.inventory_id,
            units_per_pack: r.units_per_pack,
            reorder_units: r.reorder_units,
          })),
        } : null,
      });

      toast.success(`Bill ${response.data.bill?.bill_no || response.data.bill_no} created successfully`);
      setPendingDraftId(null);
      fetchDrafts();

      setPdfConfirmDialog({ open: true, billId: response.data.bill?.id || response.data.id });
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to create bill");
    } finally {
      setSubmitting(false);
    }
  };

  // ============ EDIT BILL - FULL INLINE TABLE EDITING ============

  const handleStartEditBill = async (bill) => {
    setEditingBillId(bill.id);
    setEditingBillData({
      ...bill,
      customer_name: bill.customer_name || "",
      customer_mobile: bill.customer_mobile || "",
      customer_email: bill.customer_email || "",
      discount_percent: bill.discount_percent || 0,
      notes: bill.notes || "",
      is_paid: bill.is_paid,
      is_credit: !!bill.is_credit,
      paid_now: bill.is_credit && Number(bill.total_paid) > 0 ? String(bill.total_paid) : "",
      payment_mode: bill.payment_mode || "",
      billing_date: bill.billing_date || bill.created_at?.slice(0, 10),
      doctor: bill.doctor || "",
    });

    // The bill's own lines show at once; each line's batches (for the batch
    // picker and stock) load in the background and fill in when they arrive
    const load = ++editLoadRef.current;
    const rows = bill.items.map((item, idx) => {
      const qty = item.quantity || 1;
      const unitPrice = item.unit_price || item.mrp_per_unit || 0;
      const discPercent = item.discount_percent || 0;
      const cgstVal = item.cgst !== undefined ? Math.max(0, parseFloat(item.cgst) || 0) : 0;
      const sgstVal = item.sgst !== undefined ? Math.max(0, parseFloat(item.sgst) || 0) : 0;
      const exclPrice = unitPrice / (1 + (cgstVal + sgstVal) / 100);
      const itemDiscount = (qty * exclPrice) * (discPercent / 100);
      const netTotal = (qty * exclPrice - itemDiscount) * (1 + (cgstVal + sgstVal) / 100);
      const needsBatches = !!item.inventory_id && !item.is_manual;
      return {
        id: item.id || `edit-${idx}-${Date.now()}`,
        inventory_id: item.inventory_id || null,
        product_name: item.product_name,
        batch_no: item.batch_no || "",
        expiry_date: item.expiry_date || "",
        quantity: qty,
        unit_price: unitPrice,
        exclusive_price: exclPrice,
        net_total: netTotal,
        purchase_price: item.purchase_price || 0,
        discount_percent: discPercent,
        available: item.available_quantity || 0,
        is_manual: !item.inventory_id,
        salt_composition: item.salt_composition || "",
        units_per_pack: item.units_per_pack || 1,
        hsn_no: item.hsn_no || "",
        original_quantity: item.quantity, // Track original for inventory adjustment
        cgst: item.cgst !== undefined ? item.cgst : "",
        sgst: item.sgst !== undefined ? item.sgst : "",
        available_batches: [],
        batches_loading: needsBatches,
      };
    });
    setEditingBillItems(rows);

    bill.items.forEach(async (item, idx) => {
      if (!rows[idx].batches_loading) return;
      let availableBatches = [];
      try {
        const res = await axios.get(
          `${API}/inventory/search?q=${encodeURIComponent(item.product_name)}&limit=30`
        );
        const matchedProduct = res.data.inventory.find(
          (inv) => inv.product_name.toLowerCase() === item.product_name.toLowerCase()
        );
        if (matchedProduct) availableBatches = matchedProduct.batches || [];
      } catch (e) {
        console.error("Failed to load batches for existing item", e);
      }
      if (load !== editLoadRef.current) return; // another bill opened meanwhile
      // What this line could use: the batch's shelf stock plus the units it already holds
      const batch = availableBatches.find((b) => b.id === item.inventory_id);
      const held = item.stock_deducted !== undefined ? Number(item.stock_deducted) || 0 : rows[idx].quantity;
      setEditingBillItems((prev) =>
        prev.map((bi) =>
          bi.id === rows[idx].id
            ? {
                ...bi,
                available_batches: availableBatches,
                batches_loading: false,
                // Only while the line still uses its original batch
                ...(batch && bi.inventory_id === item.inventory_id
                  ? { available: (parseInt(batch.available_quantity ?? batch.available_units) || 0) + held }
                  : {}),
              }
            : bi
        )
      );
    });
  };

  const handleCancelEditBill = () => {
    editLoadRef.current++;
    setEditingBillId(null);
    setEditingBillItems([]);
    setEditingBillData(null);
    setEditingInventorySearch("");
    setEditingInventorySuggestions([]);
    setShowEditingInventorySuggestions(false);
  };

  const handleAddEditRow = () => {
    const newRow = { ...emptyItem, id: `temp-${Date.now()}` };
    setEditingBillItems((prev) => [...prev, newRow]);
    setTimeout(() => editingProductInputRef.current?.focus(), 100);
  };

  const handleRemoveEditItem = (itemId) => {
    setEditingBillItems((prev) => prev.filter((item) => item.id !== itemId));
  };

  // Handle field changes during editing with bidirectional calculation
  const handleEditItemFieldChange = (itemId, field, value) => {
    setEditingBillItems((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;

        // Clamp cgst/sgst values to a minimum of 0
        let val = value;
        if (field === "cgst" || field === "sgst") {
          val = value === "" ? "" : Math.max(0, parseFloat(value) || 0).toString();
        }

        const updated = { ...item, [field]: val };

        if (
          field === "quantity" ||
          field === "unit_price" ||
          field === "discount_percent" ||
          field === "cgst" ||
          field === "sgst"
        ) {
          const qty = parseInt(updated.quantity) || 1;
          const unitPrice = parseFloat(updated.unit_price) || 0;
          const discPercent = parseFloat(updated.discount_percent) || 0;
          const purchasePrice = parseFloat(updated.purchase_price) || 0;
          const cgstVal = Math.max(0, parseFloat(updated.cgst) || 0);
          const sgstVal = Math.max(0, parseFloat(updated.sgst) || 0);

          if (field === "unit_price" || field === "cgst" || field === "sgst" || updated.exclusive_price === undefined || updated.exclusive_price === null || isNaN(updated.exclusive_price) || updated.exclusive_price === 0) {
            updated.exclusive_price = unitPrice / (1 + (cgstVal + sgstVal) / 100);
          }

          const exclPrice = parseFloat(updated.exclusive_price) || 0;
          const itemTotal = qty * exclPrice;
          const itemDiscount = itemTotal * (discPercent / 100);
          const taxableValue = itemTotal - itemDiscount;
          updated.net_total = taxableValue * (1 + (cgstVal + sgstVal) / 100);
          updated.profit = (unitPrice - purchasePrice) * qty - (qty * unitPrice * (discPercent / 100));
        }

        return updated;
      })
    );

    if (field === "product_name") {
      setEditingInventorySearch(value);
      setShowEditingInventorySuggestions(true);
      setActiveEditingItemId(itemId);
    }
  };

  // Handle selecting inventory for editing items
  const handleSelectInventoryForEditRow = (itemId, inventoryItem) => {
    const isGlobalOrEmpty =
      inventoryItem.source === "global" ||
      !inventoryItem.batches ||
      inventoryItem.batches.length === 0;

    let availableBatches = (inventoryItem.batches || []).filter(
      (b) => (b.available_quantity || 0) > 0
    );
    if (availableBatches.length === 0) {
      availableBatches = inventoryItem.batches || [];
    }

    if (nearExpiryBatchFilter && availableBatches.length > 0) {
      availableBatches.sort((a, b) => {
        if (!a.expiry_date) return 1;
        if (!b.expiry_date) return -1;
        return a.expiry_date.localeCompare(b.expiry_date);
      });
    }

    const defaultBatch = availableBatches[0] || inventoryItem;

    setEditingBillItems((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;

        const qty = parseInt(item.quantity) || 1;
        const unitPrice =
          defaultBatch.mrp_per_unit ||
          defaultBatch.mrp ||
          inventoryItem.mrp_per_unit ||
          inventoryItem.mrp ||
          0;
        const purchasePrice =
          defaultBatch.cost_per_unit ||
          defaultBatch.purchase_price ||
          inventoryItem.purchase_price ||
          0;
        const cgstVal =
          defaultBatch.cgst !== undefined
            ? Math.max(0, parseFloat(defaultBatch.cgst) || 0)
            : 0;
        const sgstVal =
          defaultBatch.sgst !== undefined
            ? Math.max(0, parseFloat(defaultBatch.sgst) || 0)
            : 0;
        const exclPrice = unitPrice / (1 + (cgstVal + sgstVal) / 100);
        const itemDiscount =
          qty * exclPrice * ((parseFloat(item.discount_percent) || 0) / 100);
        const netTotal =
          (qty * exclPrice - itemDiscount) * (1 + (cgstVal + sgstVal) / 100);

        return {
          ...item,
          inventory_id: isGlobalOrEmpty ? null : defaultBatch.id,
          product_name: inventoryItem.product_name || inventoryItem.name,
          salt_composition: inventoryItem.salt_composition || "",
          batch_no: isGlobalOrEmpty ? "" : defaultBatch.batch_no || "",
          expiry_date: isGlobalOrEmpty ? "" : defaultBatch.expiry_date || "",
          unit_price: unitPrice,
          exclusive_price: exclPrice,
          net_total: netTotal,
          purchase_price: purchasePrice,
          available: isGlobalOrEmpty
            ? 0
            : defaultBatch.available_quantity ||
              defaultBatch.available_units ||
              0,
          units_per_pack: inventoryItem.units_per_pack || 1,
          is_manual: isGlobalOrEmpty,
          source: inventoryItem.source || "inventory",
          cgst: defaultBatch.cgst !== undefined ? defaultBatch.cgst : "",
          sgst: defaultBatch.sgst !== undefined ? defaultBatch.sgst : "",
          available_batches: availableBatches,
        };
      })
    );
    setEditingInventorySearch("");
    setEditingInventorySuggestions([]);
    setShowEditingInventorySuggestions(false);
    setHighlightedEditingSuggestion(-1);
    setIsMouseOverEditingSuggestions(false);
    setActiveEditingItemId(null);
    if (!isGlobalOrEmpty && availableBatches.length > 0) setAutoOpenBatchFor(itemId);
    else focusQtyFor(itemId);
  };

  const handleManualEntryForEdit = (itemId, productName) => {
    setEditingBillItems((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;

        return {
          ...item,
          inventory_id: null,
          product_name: productName || item.product_name,
          is_manual: true,
          available: 0,
          batch_no: "",
          expiry_date: "",
        };
      })
    );
    setEditingInventorySearch("");
    setEditingInventorySuggestions([]);
    setShowEditingInventorySuggestions(false);
    setHighlightedEditingSuggestion(-1);
    setIsMouseOverEditingSuggestions(false);
    setActiveEditingItemId(null);
  };

  const handleEditDropdownKeyDown = (e, itemId) => {
    if (!showEditingInventorySuggestions) return;
    if (suggestionHotkey(e, visibleEditingSuggestions, highlightedEditingSuggestion, setHighlightedEditingSuggestion, itemId, "edit")) return;

    const hasManual = !!(editingInventorySearch && editingInventorySearch.length >= 2);
    const totalOptions = visibleEditingSuggestions.length + (hasManual ? 1 : 0);
    if (totalOptions === 0 && e.key !== "Escape") return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedEditingSuggestion((prev) => (prev + 1) % totalOptions);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedEditingSuggestion((prev) =>
        prev <= 0 ? totalOptions - 1 : prev - 1
      );
    } else if (e.key === "Enter" && highlightedEditingSuggestion >= 0) {
      e.preventDefault();
      if (visibleEditingSuggestions[highlightedEditingSuggestion]) {
        handleSelectInventoryForEditRow(itemId, visibleEditingSuggestions[highlightedEditingSuggestion]);
      } else if (hasManual && highlightedEditingSuggestion === visibleEditingSuggestions.length) {
        handleManualEntryForEdit(itemId, editingInventorySearch);
      }
      setHighlightedEditingSuggestion(-1);
    } else if (e.key === "Escape") {
      setShowEditingInventorySuggestions(false);
      setHighlightedEditingSuggestion(-1);
    }
  };

  const handleSaveEditBill = async (force = false) => {
    if (!editingBillData) return;

    const validItems = editingBillItems.filter(
      (item) => item.product_name && item.product_name.trim() !== ""
    );

    if (validItems.length === 0) {
      toast.error("Please add at least one item");
      return;
    }

    const hasEmptyMrp = validItems.some(
      (item) => !item.unit_price || parseFloat(item.unit_price) === 0
    );

    if (hasEmptyMrp && force !== true) {
      setIsEditModeWarning(true);
      setShowMrpWarning(true);
      return;
    }

    const editPaidNow = parseFloat(editingBillData.paid_now) || 0;
    if (settings?.billing_payment_mode_mandatory && (editingBillData.is_paid || editingBillData.is_advance_paid || (editingBillData.is_credit && editPaidNow > 0)) && (!editingBillData.payment_mode || editingBillData.payment_mode === "none")) {
      toast.error("Payment mode is mandatory for paid or advance paid bills. Please select Cash, UPI, or Card.");
      return;
    }
    if (editingBillData.is_credit && editPaidNow < 0) {
      toast.error("Paid now can't be negative");
      return;
    }
    if (editingBillData.is_credit && Math.round(editPaidNow * 100) > Math.round(editGrandTotal * 100)) {
      toast.error(`Paid now can't be more than the bill total ₹${editGrandTotal.toFixed(2)}. Mark it Paid instead.`);
      return;
    }

    setSubmitting(true);
    try {
      const response = await axios.put(`${API}/bills/${editingBillId}`, {
        customer_id: editingBillData.customer_id || null,
        customer_name: editingBillData.customer_name,
        customer_mobile: editingBillData.customer_mobile,
        customer_email: editingBillData.customer_email || null,
        billing_date: editingBillData.billing_date,
        doctor: editingBillData.doctor || null,
        items: validItems.map(
          ({
            id,
            net_total,
            profit,
            available,
            units_per_pack,
            salt_composition,
            original_quantity,
            exclusive_price,
            ...item
          }) => ({
            inventory_id: item.inventory_id || null,
            product_name: item.product_name,
            batch_no: item.batch_no,
            hsn_no: item.hsn_no || null,
            expiry_date: item.expiry_date ? expiryToIso(item.expiry_date) || item.expiry_date : null,
            quantity: parseInt(item.quantity) || 1,
            unit_price: parseFloat(item.unit_price) || 0,
            purchase_price: parseFloat(item.purchase_price) || 0,
            discount_percent: parseFloat(item.discount_percent) || 0,
            cgst: parseFloat(item.cgst) || 0,
            sgst: parseFloat(item.sgst) || 0,
            units_per_pack: parseInt(units_per_pack) || null,
            item_total: parseFloat(net_total) || 0,
          })
        ),
        discount_percent: parseFloat(editingBillData.discount_percent) || 0,
        is_paid: editingBillData.is_credit ? false : editingBillData.is_paid,
        is_credit: !!editingBillData.is_credit,
        ...(editingBillData.is_credit ? { paid_now: editPaidNow, is_advance_paid: false } : {}),
        payment_mode: (editingBillData.payment_mode && editingBillData.payment_mode !== "none") ? editingBillData.payment_mode : null,
        notes: editingBillData.notes || null,
      });

      toast.success("Bill updated successfully");
      handleCancelEditBill();
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to update bill");
    } finally {
      setSubmitting(false);
    }
  };

  // ============ BILL ACTIONS ============

  const handleUpdateItemDelivery = async (billId, itemIndex, status) => {
    try {
      await axios.put(`${API}/bills/${billId}/delivery`, {
        item_index: itemIndex,
        delivery_status: status
      });
      toast.success(`Item delivery status updated to ${status}`);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to update item delivery status");
    }
  };

  const handleDeliverAllItems = async (billId) => {
    try {
      await axios.put(`${API}/bills/${billId}/delivery-all`);
      toast.success("All items marked as delivered");
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to deliver all items");
    }
  };

  const handleRecordPaymentSubmit = async () => {
    try {
      const err = billPaymentError(recordPaymentDialog);
      if (err || recordPaymentDialog.amount === "") {
        toast.error(err || "Enter the amount paid");
        return;
      }
      const amt = Math.round(parseFloat(recordPaymentDialog.amount) * 100) / 100;
      await axios.post(`${API}/bills/${recordPaymentDialog.billId}/record-payment`, {
        amount: amt,
        payment_mode: recordPaymentDialog.paymentMode
      });
      toast.success("Payment recorded successfully");
      setRecordPaymentDialog({
        open: false,
        billId: "",
        billNo: "",
        remainingUnpaid: 0,
        amount: "",
        paymentMode: "Cash"
      });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to record payment");
    }
  };

  const handleMarkPaid = async (billId) => {
    try {
      await axios.post(`${API}/bills/${billId}/mark-paid`);
      toast.success("Bill marked as paid");
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to mark as paid");
    }
  };

  const handleDeleteBill = async (billId, restoreInventory = false) => {
    try {
      const response = await axios.delete(
        `${API}/bills/${billId}?restore_inventory=${restoreInventory}`
      );
      toast.success(response.data.message);
      if (restoreInventory && response.data.restored_inventory_items > 0) {
        toast.info(
          `${response.data.restored_inventory_items} inventory items restored`
        );
      }
      setDeleteDialog({ open: false, bill: null });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to delete bill");
    }
  };

  // Bill PDF with or without the UPI payment QR (the choice is remembered)
  const { pharmacy: authPharmacy } = useAuth() || {};
  const hasUpiId = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9.-]{1,63}$/.test(String(authPharmacy?.upi_id || "").trim());
  const [pdfWithQr, setPdfWithQr] = useState(() => {
    try {
      return localStorage.getItem("dd-bill-pdf-qr") !== "0";
    } catch {
      return true;
    }
  });
  const choosePdfQr = (v) => {
    setPdfWithQr(v);
    try {
      localStorage.setItem("dd-bill-pdf-qr", v ? "1" : "0");
    } catch {}
  };
  const [pdfFor, setPdfFor] = useState(null); // bill picked from the list
  const generateBillPdf = async (billId, withQr) => {
    const win = window.open("", "_blank"); // inside the click, so pop-up blockers allow it
    try {
      const response = await axios.post(`${API}/bills/${billId}/pdf`, { upi_qr: !!(withQr && hasUpiId) });
      if (response.data.pdf_url) {
        if (win) win.location.href = response.data.pdf_url;
        else window.open(response.data.pdf_url, "_blank");
      } else win?.close();
    } catch (error) {
      win?.close();
      console.error("PDF generation error:", error);
      toast.error(error.response?.data?.detail || "Failed to generate PDF");
    }
  };
  const handleGeneratePdf = (billId) => setPdfFor(bills.find((b) => b.id === billId) || { id: billId });

  // "With UPI QR" / "Without QR" choice, used by both PDF prompts
  const pdfQrChoice = (bill) => {
    const total = Number(bill?.grand_total ?? bill?.total_amount) || 0;
    const paid = bill?.total_paid !== undefined ? Number(bill.total_paid) || 0 : bill?.is_paid ? total : Number(bill?.advance_amount) || 0;
    const due = Math.max(0, Math.round((total - paid) * 100) / 100);
    const qrAmount = due > 0 ? due : total;
    return (
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="UPI payment QR on the bill">
        {[
          [true, "With UPI QR", hasUpiId ? (bill ? `Scan to pay ₹${qrAmount.toFixed(2)}${due > 0 ? "" : " (bill total)"}` : "Scan to pay the bill amount") : "Add your UPI ID in Settings"],
          [false, "Without QR", "Plain bill"],
        ].map(([v, label, hint]) => {
          const active = (pdfWithQr && hasUpiId) === v;
          const disabled = v && !hasUpiId;
          return (
            <button
              key={label}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => choosePdfQr(v)}
              className={`rounded-xl border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${active ? "border-orange-500 bg-orange-500/10" : "border-border hover:border-orange-500/40"}`}
            >
              <span className="flex items-center gap-1.5 text-sm font-bold text-foreground">
                {v ? <QrCode className="h-4 w-4 text-orange-500" /> : <FileText className="h-4 w-4 text-muted-foreground" />}
                {label}
              </span>
              <span className="mt-0.5 block text-[11px] text-muted-foreground">{hint}</span>
            </button>
          );
        })}
      </div>
    );
  };

  // Toggle expanded bill row
  const toggleBillExpand = (billId) => {
    setExpandedBills((prev) => ({
      ...prev,
      [billId]: !prev[billId],
    }));
  };

  // Helper to format quantity as packs + units
  const formatQuantityAsPacks = (quantity, unitsPerPack) => {
    if (!unitsPerPack || unitsPerPack <= 1) return `${quantity} units`;
    const packs = Math.floor(quantity / unitsPerPack);
    const remainingUnits = quantity % unitsPerPack;
    if (packs === 0) return `${remainingUnits} units`;
    if (remainingUnits === 0) return `${packs} pack${packs > 1 ? "s" : ""}`;
    return `${packs} pack${packs > 1 ? "s" : ""} + ${remainingUnits} units`;
  };

  // Calculate totals for new bill
  const validItems = billItems.filter(
    (item) => item.product_name && item.product_name.trim() !== ""
  );

  // Refill reminder: when each chosen medicine runs out at its daily dose
  const reminderItems = (refillReminder.selected_items.length
    ? validItems.filter((i) => refillReminder.selected_items.some((s) => s.product_name === i.product_name))
    : validItems
  ).map((i) => {
    const d = refillReminder.doses[i.product_name] || {};
    const upp = parseInt(i.units_per_pack) || 1;
    const sold = parseInt(i.quantity) || 0;
    // What to order when the reminder comes: by default what was sold, in packs when packed
    const reorderInput = d.reorder ?? String(upp > 1 ? Math.max(1, Math.ceil(sold / upp)) : Math.max(1, sold));
    return {
      product_name: i.product_name,
      product_id: i.product_id || null,
      inventory_id: i.inventory_id || null,
      units_per_pack: upp,
      reorder_input: reorderInput,
      reorder_units: Math.max(0, parseFloat(reorderInput) || 0) * (upp > 1 ? upp : 1),
      batch_no: i.batch_no || null,
      quantity: sold,
      unit_price: i.unit_price,
      units: sold,
      dose_input: d.dose ?? "1",
      dose_per_day: parseDose(d.dose ?? "1"),
      days: d.days || "",
      days_input: d.days || "",
    };
  });
  const refillCalc = refillPlan(billingDate, reminderItems);
  const refillRec = refillCalc.recommendation;
  const setDose = (name, patch) =>
    setRefillReminder((prev) => ({ ...prev, mode: "auto", doses: { ...prev.doses, [name]: { dose: "1", days: "", ...prev.doses[name], ...patch } } }));
  // Auto mode keeps the dates on the calculation: N days before the first
  // medicine runs out (N recommended, or the chip the user picked)
  const refillLead = refillReminder.lead ?? refillRec?.remind_before_days ?? 0;
  const autoReminderDate = refillRec ? reminderOn(billingDate, refillRec.refill_target_date, refillLead) : "";
  useEffect(() => {
    if (!refillReminder.enabled || refillReminder.mode !== "auto" || !refillRec) return;
    if (refillReminder.reminder_date === autoReminderDate && refillReminder.refill_target_date === refillRec.refill_target_date && refillReminder.days_supply === refillRec.days_supply) return;
    setRefillReminder((prev) => ({
      ...prev,
      days_supply: refillRec.days_supply,
      remind_before_days: refillLead,
      refill_target_date: refillRec.refill_target_date,
      reminder_date: autoReminderDate,
    }));
    // eslint-disable-next-line
  }, [refillReminder.enabled, refillReminder.mode, autoReminderDate, refillRec?.refill_target_date, refillRec?.days_supply]);
  const subtotal = validItems.reduce((sum, item) => {
    const qty = parseInt(item.quantity) || 0;
    const unitPrice = parseFloat(item.unit_price) || 0;
    const discPercent = parseFloat(item.discount_percent) || 0;
    const cgstVal = parseFloat(item.cgst) || 0;
    const sgstVal = parseFloat(item.sgst) || 0;
    const exclPrice = item.exclusive_price !== undefined && item.exclusive_price !== null && !isNaN(item.exclusive_price)
      ? parseFloat(item.exclusive_price)
      : (unitPrice / (1 + (cgstVal + sgstVal) / 100));
    const itemTotal = qty * exclPrice * (1 - discPercent / 100) * (1 + (cgstVal + sgstVal) / 100);
    return sum + itemTotal;
  }, 0);
  const discountAmount = subtotal * ((parseFloat(billDiscount) || 0) / 100);
  const grandTotal = subtotal - discountAmount;

  useEffect(() => {
    if (!isEditingGrandTotal) {
      setGrandTotalInput(grandTotal.toFixed(2));
    }
  }, [grandTotal, isEditingGrandTotal]);

  // Calculate profit for new bill
  const totalCost = validItems.reduce((sum, item) => {
    const qty = parseInt(item.quantity) || 0;
    const purchasePrice = parseFloat(item.purchase_price) || 0;
    return sum + qty * purchasePrice;
  }, 0);
  const totalProfit = grandTotal - totalCost;

  // Calculate inventory vs negative billing totals for new bill
  const inventoryBilledQty = validItems.reduce((sum, item) => {
    if (item.is_manual) return sum;
    const qty = parseInt(item.quantity) || 0;
    const available = parseInt(item.available) || 0;
    return sum + Math.min(qty, available);
  }, 0);
  const negativeBilledQty = validItems.reduce((sum, item) => {
    if (item.is_manual) return sum + (parseInt(item.quantity) || 0);
    const qty = parseInt(item.quantity) || 0;
    const available = parseInt(item.available) || 0;
    return sum + Math.max(0, qty - available);
  }, 0);

  // Calculate totals for editing bill
  const validEditItems = editingBillItems.filter(
    (item) => item.product_name && item.product_name.trim() !== ""
  );
  const editSubtotal = validEditItems.reduce((sum, item) => {
    const qty = parseInt(item.quantity) || 0;
    const unitPrice = parseFloat(item.unit_price) || 0;
    const discPercent = parseFloat(item.discount_percent) || 0;
    const cgstVal = parseFloat(item.cgst) || 0;
    const sgstVal = parseFloat(item.sgst) || 0;
    const exclPrice = item.exclusive_price !== undefined && item.exclusive_price !== null && !isNaN(item.exclusive_price)
      ? parseFloat(item.exclusive_price)
      : (unitPrice / (1 + (cgstVal + sgstVal) / 100));
    const itemTotal = qty * exclPrice * (1 - discPercent / 100) * (1 + (cgstVal + sgstVal) / 100);
    return sum + itemTotal;
  }, 0);
  const editDiscountPercent = editingBillData?.discount_percent || 0;
  const editDiscountAmount = editSubtotal * (editDiscountPercent / 100);
  const editGrandTotal = editSubtotal - editDiscountAmount;

  useEffect(() => {
    if (!isEditingEditGrandTotal) {
      setEditGrandTotalInput(editGrandTotal.toFixed(2));
    }
  }, [editGrandTotal, isEditingEditGrandTotal]);

  const editTotalCost = validEditItems.reduce((sum, item) => {
    const qty = parseInt(item.quantity) || 0;
    const purchasePrice = parseFloat(item.purchase_price) || 0;
    return sum + qty * purchasePrice;
  }, 0);
  const editTotalProfit = editGrandTotal - editTotalCost;

  if (loading) {
    return <Loader size="lg" text="Loading Billing Workspace..." />;
  }

  return (
    <div className={`space-y-4 animate-fade-in ${(showNewBill || editingBillId) ? "pb-24" : "pb-12"}`} data-testid="billing-page">
      {/* Header */}
      {!showNewBill && editingBillId === null && (
        <div className="space-y-3 px-0.5 py-0.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-black tracking-tight text-foreground">
                Billing
              </h1>
              <span className="px-2.5 py-0.5 rounded-full bg-orange-500/10 border border-orange-500/30 text-orange-600 dark:text-orange-400 font-mono font-bold text-xs">
                {`${totalBills} bill${totalBills !== 1 ? "s" : ""} generated`}
              </span>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={() => shortcutLayer?.toggleHelp(true)}
                data-testid="shortcuts-btn"
                title={`Keyboard shortcuts (?)`}
                className="h-8 text-xs font-bold rounded-xl border-border/70 max-md:hidden"
              >
                <Keyboard className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
                Shortcuts
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setUpiQr({ amount: "", note: "" })}
                data-testid="upi-qr-btn"
                data-kbd={formatCombo("alt+q")}
                title={`Show a UPI QR for any amount (${formatCombo("alt+q")})`}
                className="h-8 text-xs font-bold rounded-xl border-border/70"
              >
                <QrCode className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
                UPI QR
              </Button>
              <Button
                size="sm"
                className="h-8 px-3.5 text-xs font-extrabold bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white rounded-xl shadow-xs border-none"
                onClick={handleStartNewBill}
                data-testid="new-bill-btn"
                data-shortcut="new"
                data-kbd={formatCombo("alt+n")}
                disabled={showNewBill || editingBillId}
              >
                <Plus className="w-3.5 h-3.5 mr-1 stroke-[3]" />
                New Bill<span className="max-md:hidden"> ({formatCombo("alt+n")})</span>
              </Button>
            </div>
          </div>
        </div>
      )}



      {/* Customer Profile Modal */}
      <Dialog
        open={showCustomerProfileModal}
        onOpenChange={setShowCustomerProfileModal}
      >
        <DialogContent className="glass bg-card/95 backdrop-blur-xl border border-border/80 shadow-2xl rounded-2xl p-6 max-w-5xl w-[90vw]">
          <DialogHeader className="pb-3 border-b border-border/50">
            <DialogTitle className="text-xl font-bold flex items-center gap-2 text-foreground">
              <User className="w-5 h-5 text-primary" />
              Customer Profile Details
            </DialogTitle>
          </DialogHeader>

          {customerProfileData && (
            <div className="space-y-6 py-4">
              {/* Contact Information */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-3.5 bg-muted/40 border border-border/40 rounded-xl">
                  <p className="text-[10px] uppercase font-bold text-muted-foreground/80 tracking-wider">Customer Name</p>
                  <p className="text-sm font-semibold text-foreground mt-1">{customerProfileData.customer?.name}</p>
                </div>
                <div className="p-3.5 bg-muted/40 border border-border/40 rounded-xl">
                  <p className="text-[10px] uppercase font-bold text-muted-foreground/80 tracking-wider">Mobile Number</p>
                  <p className="text-sm font-semibold text-foreground mt-1">{customerProfileData.customer?.mobile || "N/A"}</p>
                </div>
                <div className="p-3.5 bg-muted/40 border border-border/40 rounded-xl">
                  <p className="text-[10px] uppercase font-bold text-muted-foreground/80 tracking-wider">Email Address</p>
                  <p className="text-sm font-semibold text-foreground mt-1 truncate">{customerProfileData.customer?.email || "N/A"}</p>
                </div>
              </div>

              {/* Statistics & Debt Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 bg-emerald-500/10 border border-emerald-500/25 rounded-xl shadow-sm">
                  <span className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400 tracking-wider">Total Purchases</span>
                  <div className="text-xl font-extrabold font-mono text-emerald-600 dark:text-emerald-500 mt-1">
                    ₹{(customerProfileData.stats?.total_purchases || 0).toFixed(2)}
                  </div>
                </div>

                <div className="p-4 bg-orange-500/10 border border-orange-500/25 rounded-xl shadow-sm">
                  <span className="text-[10px] uppercase font-bold text-orange-600 dark:text-orange-400 tracking-wider">Total Profit Given</span>
                  <div className="text-xl font-extrabold font-mono text-orange-600 dark:text-orange-500 mt-1">
                    ₹{(customerProfileData.stats?.total_profit || 0).toFixed(2)}
                  </div>
                </div>

                <div className={`p-4 rounded-xl shadow-sm border ${
                  (customerProfileData.customer?.total_debt || 0) > 0
                    ? "bg-red-500/10 border-red-500/25 text-red-500"
                    : "bg-muted/40 border-border/40 text-muted-foreground"
                }`}>
                  <span className="text-[10px] uppercase font-bold tracking-wider">Active Debts</span>
                  <div className="text-xl font-extrabold font-mono mt-1">
                    ₹{(customerProfileData.customer?.total_debt || 0).toFixed(2)}
                  </div>
                </div>
              </div>

              {/* Past Bills Section */}
              <div className="space-y-3 pt-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <h3 className="text-sm font-bold text-foreground/90 uppercase tracking-wide">Past Bills History</h3>
                  
                  {/* Bill Search Bar */}
                  <div className="relative w-full sm:w-64">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search bills..."
                      value={customerBillsSearch}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCustomerBillsSearch(val);
                        setCustomerBillsPage(1);
                        fetchCustomerBills(customerProfileData.customer?.id, 1, val, false);
                      }}
                      className="pl-9 h-9 text-xs border-border/80 rounded-xl focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary"
                    />
                  </div>
                </div>

                {/* Infinite Scrollable / Paginated bills viewport */}
                <div className="border border-border/50 rounded-xl overflow-hidden bg-background/30 backdrop-blur-sm max-h-[420px] overflow-y-auto">
                  <Table mobileCards>
                    <TableHeader className="sticky top-0 bg-muted/90 backdrop-blur-md z-[20]">
                      <TableRow>
                        <TableHead data-card="corner" className="h-8 w-12"></TableHead>
                        <TableHead data-card="title" className="h-8 text-[11px] font-bold">Bill No</TableHead>
                        <TableHead className="h-8 text-[11px] font-bold">Date</TableHead>
                        <TableHead className="h-8 text-[11px] font-bold text-center">Items</TableHead>
                        <TableHead className="h-8 text-[11px] font-bold text-right">Amount</TableHead>
                        <TableHead className="h-8 text-[11px] font-bold text-right">Profit</TableHead>
                        <TableHead className="h-8 text-[11px] font-bold text-center">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="text-xs">
                      {customerBills.length > 0 ? (
                        customerBills.map((bill) => {
                          const billTotal = bill.items?.reduce((sum, item) => sum + (item.item_total || 0), 0) || 0;
                          const isExpanded = expandedCustomerBills[bill.id];
                          return (
                            <React.Fragment key={bill.id}>
                              <TableRow
                                className={`cursor-pointer hover:bg-muted/30 transition-all border-b border-border/40 ${isExpanded ? "bg-muted/10" : ""}`}
                                onClick={() => toggleCustomerBillExpand(bill.id)}
                              >
                                <TableCell className="w-12 text-center py-2.5" onClick={(e) => e.stopPropagation()}>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => toggleCustomerBillExpand(bill.id)}
                                    className="h-7 w-7 rounded-lg hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-all duration-200"
                                  >
                                    {isExpanded ? (
                                      <ChevronUp className="h-3.5 w-3.5" />
                                    ) : (
                                      <ChevronDown className="h-3.5 w-3.5" />
                                    )}
                                  </Button>
                                </TableCell>
                                <TableCell className="font-semibold text-foreground/80 py-2.5">
                                  {bill.bill_no}
                                </TableCell>
                                <TableCell className="text-muted-foreground py-2.5">
                                  {new Date(bill.created_at || bill.billing_date).toLocaleDateString()}
                                </TableCell>
                                <TableCell className="text-center py-2.5">
                                  {bill.items?.length || 0}
                                </TableCell>
                                <TableCell className="text-right font-semibold py-2.5 font-mono">
                                  ₹{billTotal.toFixed(2)}
                                </TableCell>
                                <TableCell className={`text-right font-semibold py-2.5 font-mono ${bill.profit >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                                  ₹{(bill.profit || 0).toFixed(2)}
                                </TableCell>
                                <TableCell className="text-center py-2.5">
                                  <Badge className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                                    bill.is_paid
                                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                                      : "bg-amber-500/10 text-amber-500 border border-amber-500/20"
                                  }`}>
                                    {bill.is_paid ? "Paid" : "Unpaid"}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                              {/* Expanded items section */}
                              {isExpanded && bill.items && bill.items.length > 0 && (
                                <TableRow className="bg-muted/15 border-b border-border/40" onClick={(e) => e.stopPropagation()}>
                                  <TableCell colSpan={7} className="p-0">
                                    <div className="p-4 pl-12 bg-muted/5">
                                      <p className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wider mb-2">
                                        Items Sold
                                      </p>
                                      <div className="border border-border/50 rounded-xl overflow-hidden bg-background/30 max-h-48 overflow-y-auto">
                                        <Table mobileCards>
                                          <TableHeader className="bg-muted/40">
                                            <TableRow className="border-b border-border/40">
                                              <TableHead data-card="title" className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider py-1.5">
                                                Product
                                              </TableHead>
                                              <TableHead className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider py-1.5">
                                                Batch
                                              </TableHead>
                                              <TableHead className="text-[10px] font-bold text-center text-muted-foreground uppercase tracking-wider py-1.5">
                                                Qty (Units)
                                              </TableHead>
                                              <TableHead className="text-[10px] font-bold text-right text-amber-600 dark:text-amber-400 bg-amber-500/5 dark:bg-amber-500/10 uppercase tracking-wider py-1.5">
                                                Rate/Unit (MRP)
                                              </TableHead>
                                              <TableHead className="text-[10px] font-bold text-center text-muted-foreground uppercase tracking-wider py-1.5">
                                                Disc%
                                              </TableHead>
                                              <TableHead className="text-[10px] font-bold text-center text-muted-foreground uppercase tracking-wider py-1.5">
                                                CGST %
                                              </TableHead>
                                              <TableHead className="text-[10px] font-bold text-center text-muted-foreground uppercase tracking-wider py-1.5">
                                                SGST %
                                              </TableHead>
                                              <TableHead className="text-[10px] font-bold text-right text-muted-foreground uppercase tracking-wider py-1.5">
                                                Total
                                              </TableHead>
                                              <TableHead className="text-[10px] font-bold text-right text-muted-foreground uppercase tracking-wider py-1.5">
                                                Profit
                                              </TableHead>
                                            </TableRow>
                                          </TableHeader>
                                          <TableBody>
                                            {bill.items.map((item, idx) => {
                                              const unitPrice = item.unit_price || item.mrp_per_unit || 0;
                                              const qty = item.quantity || item.sold_units || 1;
                                              const discPercent = item.discount_percent || 0;
                                              const itemTotal = item.total || item.item_total || (qty * unitPrice * (1 - discPercent / 100));
                                              return (
                                                <TableRow
                                                  key={`${bill.id}-item-${idx}`}
                                                  className={`border-b border-border/40 hover:bg-muted/20 transition-colors ${item.is_manual ? "bg-amber-500/5 text-amber-900/80 dark:text-amber-200/80" : ""}`}
                                                >
                                                  <TableCell className="text-xs font-semibold py-1.5">
                                                    {item.product_name}
                                                    {item.is_manual && (
                                                      <Badge
                                                        variant="outline"
                                                        className="ml-2 bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 text-[9px] font-extrabold rounded px-1 py-0"
                                                      >
                                                        Manual
                                                      </Badge>
                                                    )}
                                                  </TableCell>
                                                  <TableCell className="text-xs py-1.5 font-mono">
                                                    {item.batch_no || "-"}
                                                  </TableCell>
                                                  <TableCell className="text-center text-xs py-1.5 font-semibold font-mono">
                                                    {qty}
                                                  </TableCell>
                                                  <TableCell className="text-right text-xs py-1.5 font-mono text-amber-600 dark:text-amber-400 bg-amber-500/5 dark:bg-amber-500/10 font-bold">
                                                    ₹{unitPrice.toFixed(2)}
                                                  </TableCell>
                                                  <TableCell className="text-center text-xs py-1.5 font-mono">
                                                    {discPercent}%
                                                  </TableCell>
                                                  <TableCell className="text-center text-xs py-1.5 font-mono">
                                                    {item.cgst}%
                                                  </TableCell>
                                                  <TableCell className="text-center text-xs py-1.5 font-mono">
                                                    {item.sgst}%
                                                  </TableCell>
                                                  <TableCell className="text-right text-xs py-1.5 font-bold font-mono">
                                                    ₹{itemTotal.toFixed(2)}
                                                  </TableCell>
                                                  <TableCell className={`text-right text-xs py-1.5 font-bold font-mono ${(item.profit || 0) >= 0 ? "text-emerald-500" : "text-destructive"}`}>
                                                    ₹{(item.profit || 0).toFixed(2)}
                                                  </TableCell>
                                                </TableRow>
                                              );
                                            })}
                                          </TableBody>
                                        </Table>
                                      </div>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              )}
                            </React.Fragment>
                          );
                        })
                      ) : (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-8 text-muted-foreground/60">
                            No bills found
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>

                {/* Paginated Loading triggers */}
                {hasMoreCustomerBills && (
                  <div className="flex justify-center pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fetchCustomerBills(customerProfileData.customer?.id, customerBillsPage + 1, customerBillsSearch, true)}
                      disabled={loadingCustomerBills}
                      className="text-xs h-8 px-4 border-border/80 rounded-xl hover:bg-muted/50"
                    >
                      {loadingCustomerBills ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Loading...
                        </>
                      ) : (
                        "Load More Bills"
                      )}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* New Bill - Inline Table Entry */}
      {showNewBill && (
        <div
          className="!mt-0 space-y-3 px-0.5 animate-in fade-in duration-300 relative"
          data-testid="new-bill-form"
        >
          {/* Unified Single Control Toolbar for New Bill Entry */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-card border-2 border-border p-3 rounded-2xl backdrop-blur-xl shadow-md">
            {/* Left Fields Grid (Billing Date, Customer Name, Mobile, Email, Doctor) */}
            <div className="flex flex-wrap items-end gap-3 flex-1">
              <div className="space-y-1 w-[145px]">
                <Label className="text-[11px] font-extrabold text-foreground/80">
                  Billing Date *
                </Label>
                <Input
                  type="date"
                  value={billingDate}
                  onChange={(e) => setBillingDate(e.target.value)}
                  className="h-9 text-xs font-semibold rounded-xl border-border bg-background text-foreground shadow-2xs focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary"
                />
              </div>

              <div className="space-y-1 w-full sm:w-[230px] relative">
                <Label className="flex items-center justify-between text-[11px] font-extrabold text-foreground/80">
                  <span className="flex items-center gap-1">
                    Customer Name *
                    {pickedCustomerTier && pickedCustomerTier.id === customerInfo.customer_id && <TierBadge customer={pickedCustomerTier} />}
                  </span>
                  {customerInfo.customer_id && (
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      onClick={() => fetchCustomerProfileData(customerInfo.customer_id)}
                      className="h-auto p-0 text-primary font-bold text-[10px] flex items-center gap-1 animate-in fade-in"
                    >
                      <Eye className="w-3 h-3" /> Profile
                    </Button>
                  )}
                </Label>
                <Input
                  placeholder="Search existing customer..."
                  value={customerSearch}
                  onChange={(e) => {
                    const val = e.target.value;
                    setCustomerSearch(val);
                    setCustomerInfo((prev) => ({
                      ...prev,
                      customer_id: "",
                      customer_name: val,
                    }));
                    setShowCustomerSuggestions(true);
                  }}
                  onFocus={() => setShowCustomerSuggestions(true)}
                  onBlur={() =>
                    setTimeout(() => setShowCustomerSuggestions(false), 200)
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Tab" && !e.shiftKey) {
                      const value = e.target.value;
                      if (!value || value.trim() === "") {
                        e.preventDefault();
                        setCustomerSearch("Walk-in");
                        setCustomerInfo((prev) => ({
                          ...prev,
                          customer_name: "Walk-in",
                          customer_id: "",
                        }));
                        setTimeout(() => {
                          document.querySelector('[data-testid="customer-mobile"]')?.focus();
                        }, 50);
                        return;
                      }
                    }
                    if (!showCustomerSuggestions) return;
                    const maxIndex = customerSuggestions.length; // customerSuggestions (0 to length-1) + New Customer (index length)
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      setActiveCustomerSuggestionIndex((prev) => (prev < maxIndex ? prev + 1 : 0));
                    } else if (e.key === "ArrowUp") {
                      e.preventDefault();
                      setActiveCustomerSuggestionIndex((prev) => (prev > 0 ? prev - 1 : maxIndex));
                    } else if (e.key === "Enter") {
                      if (activeCustomerSuggestionIndex >= 0 && activeCustomerSuggestionIndex < customerSuggestions.length) {
                        e.preventDefault();
                        handleSelectCustomer(customerSuggestions[activeCustomerSuggestionIndex]);
                      } else if (activeCustomerSuggestionIndex === customerSuggestions.length) {
                        e.preventDefault();
                        setCustomerInfo((prev) => ({
                          ...prev,
                          customer_id: "",
                          customer_name: customerSearch,
                        }));
                        setShowCustomerSuggestions(false);
                        setSelectedCustomerStats(null);
                      }
                    } else if (e.key === "Escape") {
                      setShowCustomerSuggestions(false);
                    }
                  }}
                  className="h-9 text-xs font-semibold rounded-xl border-border bg-background text-foreground shadow-2xs focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary"
                  data-testid="customer-search"
                />
                {showCustomerSuggestions && customerSearch && (
                  <div
                    onScroll={handleScrollCustomerSuggestions}
                    className="absolute z-[100] w-full mt-1 bg-card/95 backdrop-blur-md border border-border shadow-xl rounded-xl max-h-48 overflow-y-auto top-full overflow-x-hidden transition-all duration-150 animate-in fade-in slide-in-from-top-2"
                  >
                    {customerSuggestions.map((customer, idx) => (
                      <div
                        key={customer.id}
                        id={`customer-suggestion-${idx}`}
                        className={`p-2.5 cursor-pointer border-b border-border/50 last:border-0 transition-colors duration-150 ${
                          activeCustomerSuggestionIndex === idx
                            ? "bg-primary/20"
                            : "hover:bg-primary/10"
                        }`}
                        onMouseDown={() => handleSelectCustomer(customer)}
                      >
                        <p className="font-semibold text-sm">{customer.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {customer.mobile}
                        </p>
                      </div>
                    ))}
                    {loadingCustomerSuggestions && (
                      <div className="p-3 text-center text-xs text-muted-foreground border-b border-border/50">
                        Loading...
                      </div>
                    )}
                    <div
                      id={`customer-suggestion-${customerSuggestions.length}`}
                      className={`p-2.5 cursor-pointer font-bold text-primary text-xs flex items-center justify-between sticky bottom-0 border-t border-border/60 ${
                        activeCustomerSuggestionIndex === customerSuggestions.length
                          ? "bg-primary/20"
                          : "bg-card/95 hover:bg-primary/10"
                      }`}
                      onMouseDown={() => {
                        setCustomerInfo((prev) => ({
                          ...prev,
                          customer_id: "",
                          customer_name: customerSearch,
                        }));
                        setShowCustomerSuggestions(false);
                        setSelectedCustomerStats(null);
                      }}
                    >
                      <span className="flex items-center gap-1">
                        <Plus className="w-3.5 h-3.5" /> New Customer "{customerSearch}"
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-1 w-[130px]">
                <Label className="text-[11px] font-extrabold text-foreground/80">
                  Mobile *
                </Label>
                <Input
                  placeholder="9876543210"
                  value={customerInfo.customer_mobile}
                  onChange={(e) =>
                    setCustomerInfo({
                      ...customerInfo,
                      customer_mobile: e.target.value,
                    })
                  }
                  onKeyDown={(e) => handleTabDefault(e, "customer_mobile")}
                  className="h-9 text-xs font-semibold rounded-xl border-border bg-background text-foreground shadow-2xs focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary"
                  data-testid="customer-mobile"
                />
              </div>

              <div className="space-y-1 w-[150px]">
                <Label className="text-[11px] font-extrabold text-foreground/80">
                  Email
                </Label>
                <Input
                  type="email"
                  placeholder="customer@email.com"
                  value={customerInfo.customer_email}
                  onChange={(e) =>
                    setCustomerInfo({
                      ...customerInfo,
                      customer_email: e.target.value,
                    })
                  }
                  className="h-9 text-xs font-semibold rounded-xl border-border bg-background text-foreground shadow-2xs focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary"
                />
              </div>

              <div className="space-y-1 w-[140px] relative">
                <Label className="text-[11px] font-extrabold text-foreground/80">
                  Doctor
                </Label>
                <Input
                  placeholder="Doctor's name..."
                  value={doctorName}
                  onChange={(e) => {
                    setDoctorName(e.target.value);
                    setDoctorSearch(e.target.value);
                    setShowDoctorSuggestions(true);
                  }}
                  onFocus={() => {
                    setShowDoctorSuggestions(true);
                    if (doctorSuggestions.length === 0) {
                      fetchDoctors(1, doctorSearch, false);
                    }
                  }}
                  onBlur={() =>
                    setTimeout(() => setShowDoctorSuggestions(false), 250)
                  }
                  className="h-9 text-xs font-semibold rounded-xl border-border bg-background text-foreground shadow-2xs focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary"
                  data-testid="doctor-search"
                />
                {showDoctorSuggestions && (
                  <div
                    className="absolute z-[100] w-[320px] -left-36 sm:left-0 mt-1 bg-card/95 backdrop-blur-md border border-border shadow-2xl rounded-xl max-h-60 overflow-y-auto top-full custom-scrollbar transition-all duration-150 animate-in fade-in slide-in-from-top-2"
                    onScroll={(e) => {
                      const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
                      if (scrollHeight - scrollTop <= clientHeight + 40 && hasMoreDoctors && !loadingDoctors) {
                        loadMoreDoctors();
                      }
                    }}
                  >
                    {doctorSuggestions.map((doc, idx) => (
                      <div
                        key={`${doc.id || doc.name}-${idx}`}
                        className="p-2.5 hover:bg-primary/10 cursor-pointer border-b border-border/40 last:border-0 transition-colors duration-150"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleSelectDoctor(doc);
                        }}
                      >
                        <div className="flex items-center justify-between gap-1.5 mb-0.5">
                          <p className="font-semibold text-xs text-foreground truncate">
                            {doc.name}
                          </p>
                          {doc.source === "global" ? (
                            <span className="text-[9px] px-1.5 py-0.2 rounded-full font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20 shrink-0">
                              Verified
                            </span>
                          ) : (
                            <span className="text-[9px] px-1.5 py-0.2 rounded-full font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20 shrink-0">
                              My Doctor
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground truncate font-mono">
                          {doc.license_number || doc.registration_no ? (
                            <span>Reg: {doc.license_number || doc.registration_no}</span>
                          ) : null}
                          {doc.clinic ? <span>• {doc.clinic}</span> : null}
                          {doc.city || doc.state ? (
                            <span>• {[doc.city, doc.state].filter(Boolean).join(", ")}</span>
                          ) : null}
                        </div>
                      </div>
                    ))}
                    {loadingDoctors && (
                      <div className="py-2.5 text-center flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                        <span>Loading doctors...</span>
                      </div>
                    )}
                    {!loadingDoctors && doctorSuggestions.length === 0 && (
                      <div className="p-3 text-center text-xs text-muted-foreground italic">
                        No doctors match "{doctorSearch}"
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Right: Customer Stats + Units / Total Summary Pill + Close */}
            <div className="flex items-center gap-2 shrink-0 self-end lg:self-center max-md:w-full max-md:flex-wrap max-md:self-stretch">
              {selectedCustomerStats && (
                <div className="flex items-center gap-2 bg-primary/5 px-3 py-1 rounded-xl border border-primary/15 h-9 text-xs font-semibold animate-in fade-in">
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-muted-foreground uppercase font-extrabold">Debt:</span>
                    <span className="text-xs font-black font-mono text-red-500">₹{selectedCustomerStats.totalDebt.toFixed(2)}</span>
                  </div>
                  <div className="h-3.5 w-[1px] bg-border/60" />
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-muted-foreground uppercase font-extrabold">Adv:</span>
                    <span className="text-xs font-black font-mono text-emerald-500">₹{(selectedCustomerStats.totalAdvance || 0).toFixed(2)}</span>
                  </div>
                  <div className="h-3.5 w-[1px] bg-border/60" />
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-muted-foreground uppercase font-extrabold">Bills:</span>
                    <span className="text-xs font-black font-mono text-foreground">{selectedCustomerStats.totalBills}</span>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2 bg-muted px-3 py-1 rounded-xl border border-border shadow-2xs h-9">
                <div className="flex items-center gap-1 border-r border-border pr-2.5">
                  <span className="text-[10px] uppercase font-extrabold text-muted-foreground">
                    Units:
                  </span>
                  <span className="text-xs font-black font-mono text-foreground">
                    {billItems.length}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] uppercase font-extrabold text-orange-500">
                    Total:
                  </span>
                  <span className="text-xs font-black font-mono text-orange-500">
                    ₹{grandTotal.toFixed(2)}
                  </span>
                </div>
              </div>

              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-xl hover:bg-muted/80 text-muted-foreground hover:text-foreground max-md:hidden"
                onClick={handleCancelNewBill}
                title="Close"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

            {/* Items Table - Inline Editable */}
            <div className="border border-border/70 rounded-xl overflow-hidden shadow-sm bg-background/50 backdrop-blur-md mt-4">
              <Table mobileCards wrapperClassName="max-h-[300px]">
                <TableHeader className="sticky top-0 bg-muted/90 backdrop-blur-md z-[50] border-b border-border/80">
                  <TableRow className="hover:bg-transparent border-b border-border/80">
                    <TableHead data-card="title" className="w-[180px] font-bold text-foreground/80 text-xs uppercase tracking-wider">
                      Product *
                    </TableHead>
                    <TableHead className="w-[100px] font-bold text-foreground/80 text-xs uppercase tracking-wider">
                      Salt
                    </TableHead>
                    <TableHead data-card="full" className="w-[70px] font-bold text-foreground/80 text-xs uppercase tracking-wider">
                      Batch
                    </TableHead>
                    <TableHead className="w-[60px] text-center font-bold text-foreground/80 text-xs uppercase tracking-wider">
                      Avail.
                    </TableHead>
                    <TableHead className="w-[60px] text-center font-bold text-foreground/80 text-xs uppercase tracking-wider">
                      Qty *
                    </TableHead>
                    <TableHead className="w-[80px] text-center font-bold text-foreground/80 text-xs uppercase tracking-wider">
                      Cost/Unit
                    </TableHead>
                    <TableHead className="w-[80px] text-center font-bold text-foreground/80 text-xs uppercase tracking-wider">
                      MRP/Unit
                    </TableHead>
                    <TableHead className="w-[60px] text-center font-bold text-foreground/80 text-xs uppercase tracking-wider">
                      Disc %
                    </TableHead>
                    <TableHead className="w-[60px] text-center font-bold text-foreground/80 text-xs uppercase tracking-wider">
                      CGST %
                    </TableHead>
                    <TableHead className="w-[60px] text-center font-bold text-foreground/80 text-xs uppercase tracking-wider">
                      SGST %
                    </TableHead>
                    <TableHead className="w-[80px] text-right font-bold text-foreground/80 text-xs uppercase tracking-wider">
                      Total
                    </TableHead>
                    <TableHead data-card="corner" className="w-[60px] text-center font-bold text-foreground/80 text-xs uppercase tracking-wider">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {/* Editable Item Rows */}
                  {billItems.map((item, index) => {
                    const qty = parseInt(item.quantity) || 0;
                    const unitPrice = parseFloat(item.unit_price) || 0;
                    const discPercent = parseFloat(item.discount_percent) || 0;
                    const purchasePrice = parseFloat(item.purchase_price) || 0;
                    const cgstVal = parseFloat(item.cgst) || 0;
                    const sgstVal = parseFloat(item.sgst) || 0;
                    const exclPrice = item.exclusive_price !== undefined && item.exclusive_price !== null && !isNaN(item.exclusive_price)
                      ? parseFloat(item.exclusive_price)
                      : (unitPrice / (1 + (cgstVal + sgstVal) / 100));
                    const itemTotal = qty * exclPrice * (1 - discPercent / 100) * (1 + (cgstVal + sgstVal) / 100);
                    const available = parseInt(item.available) || 0;

                    const fromInventory = item.is_manual
                      ? 0
                      : Math.min(qty, available);
                    const negativeBilled = item.is_manual
                      ? qty
                      : Math.max(0, qty - available);
                    const hasOverflow =
                      !item.is_manual && qty > available && available > 0;

                    return (
                      <TableRow
                        key={item.id || index}
                        className={
                          hasOverflow ? "bg-amber-500/10 border-b border-border/80" : "hover:bg-muted/30 border-b border-border/50"
                        }
                      >
                        <TableCell
                          className="relative"
                          style={{ overflow: "visible" }}
                        >
                          <Input
                            ref={(el) => {
                              setInputRef(el, item.id);
                              if (index === billItems.length - 1) {
                                productInputRef.current = el;
                              }
                            }}
                            value={item.product_name || ""}
                            onChange={(e) =>
                              handleItemFieldChange(
                                item.id,
                                "product_name",
                                e.target.value
                              )
                            }
                            onFocus={() => {
                              setInventorySearch(item.product_name || "");
                              setShowInventorySuggestions(true);
                              setActiveDropdownIndex(index);
                              setActiveBillItemId(item.id);
                            }}
                            onBlur={() => {
                              const currentId = item.id;
                              setTimeout(
                                () => {
                                  if (!isMouseOverSuggestions) {
                                    setActiveBillItemId((prev) => {
                                      if (prev === currentId) {
                                        setShowInventorySuggestions(false);
                                        return null;
                                      }
                                      return prev;
                                    });
                                  }
                                },
                                200
                              );
                            }}
                            onKeyDown={(e) => handleDropdownKeyDown(e, item.id)}
                            placeholder="Search product or salt..."
                            className="h-8 text-xs border-border/80 focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary rounded-lg transition-all duration-200"
                            data-testid={`item-product-${index}`}
                            autoComplete="off"
                          />
                          {/* Search Suggestions Dropdown */}
                          {showInventorySuggestions &&
                            activeBillItemId === item.id &&
                            createPortal(
                              <div
                                data-suggestions-dropdown="true"
                                className="bg-card/95 backdrop-blur-xl border border-border/80 rounded-xl shadow-2xl overflow-y-auto z-[99999] animate-in fade-in slide-in-from-top-2 duration-150 scroller-hide"
                                onMouseEnter={() => setIsMouseOverSuggestions(true)}
                                onMouseLeave={() => {
                                  setIsMouseOverSuggestions(false);
                                  const activeInput = inputRefs.current[activeBillItemId];
                                  if (activeInput && document.activeElement !== activeInput) {
                                    setShowInventorySuggestions(false);
                                    setActiveBillItemId(null);
                                  }
                                }}
                                style={suggestionBoxStyle()}
                              >
                                <SuggestionList
                                  idPrefix="suggestion-new"
                                  search={inventorySearch}
                                  allSuggestions={inventorySuggestions}
                                  suggestions={visibleSuggestions}
                                  loading={loadingInventorySuggestions}
                                  highlighted={highlightedSuggestion}
                                  setHighlighted={setHighlightedSuggestion}
                                  filter={suggestionFilter}
                                  setFilter={setSuggestionFilter}
                                  warningDays={expiryWarningDays}
                                  getNearestExpiryInfo={getNearestExpiryInfo}
                                  onSelect={(invItem) => handleSelectInventoryForRow(item.id, invItem)}
                                  onManual={() => handleManualEntry(item.id, inventorySearch)}
                                  onDetails={(invItem) => openSuggestionDetails(invItem, item.id, "new")}
                                />
                              </div>,
                              document.body
                            )}
                        </TableCell>
                        <TableCell>
                          {item.is_manual ? (
                            <Input
                              value={item.salt_composition || ""}
                              onChange={(e) =>
                                handleItemFieldChange(
                                  item.id,
                                  "salt_composition",
                                  e.target.value
                                )
                              }
                              placeholder="Composition"
                              className="h-8 text-xs border-border/80 focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary rounded-lg transition-all duration-200 w-28"
                            />
                          ) : (
                            <span className="text-xs text-muted-foreground font-medium">
                              {item.salt_composition?.slice(0, 15) || "-"}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {item.is_manual ? (
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
                              className="h-8 text-xs border-border/80 focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary rounded-lg transition-all duration-200 w-16"
                            />
                          ) : (item.available_batches && item.available_batches.length > 0) ? (
                            <BatchPicker
                              batches={item.available_batches}
                              value={item.inventory_id}
                              fallbackLabel={item.batch_no}
                              autoOpen={autoOpenBatchFor === item.id}
                              onAutoOpened={() => setAutoOpenBatchFor(null)}
                              onPicked={() => focusQtyFor(item.id)}
                              nearExpiry={nearExpiryBatchFilter}
                              onToggleNearExpiry={() => setNearExpiryBatchFilter((prev) => !prev)}
                              accent="primary"
                              onSelect={(selectedInvId) => {
                                const selectedBatch = item.available_batches.find(b => b.id === selectedInvId);
                                if (selectedBatch) {
                                  const qty = parseInt(item.quantity) || 1;
                                  const unitPrice = selectedBatch.mrp_per_unit || selectedBatch.mrp || 0;
                                  const purchasePrice = selectedBatch.cost_per_unit || selectedBatch.purchase_price || 0;
                                  const cgstVal = selectedBatch.cgst !== undefined ? Math.max(0, parseFloat(selectedBatch.cgst) || 0) : 0;
                                  const sgstVal = selectedBatch.sgst !== undefined ? Math.max(0, parseFloat(selectedBatch.sgst) || 0) : 0;
                                  
                                  const exclPrice = unitPrice / (1 + (cgstVal + sgstVal) / 100);
                                  const itemDiscount = (qty * exclPrice) * ((parseFloat(item.discount_percent) || 0) / 100);
                                  const netTotal = (qty * exclPrice - itemDiscount) * (1 + (cgstVal + sgstVal) / 100);
                                  const profit = (unitPrice - purchasePrice) * qty - (qty * unitPrice * ((parseFloat(item.discount_percent) || 0) / 100));

                                  setBillItems((prev) =>
                                    prev.map((bi) =>
                                      bi.id === item.id
                                        ? {
                                            ...bi,
                                            inventory_id: selectedInvId,
                                            batch_no: selectedBatch.batch_no,
                                            expiry_date: selectedBatch.expiry_date || "",
                                            unit_price: unitPrice,
                                            exclusive_price: exclPrice,
                                            net_total: netTotal,
                                            purchase_price: purchasePrice,
                                            available: selectedBatch.available_quantity || 0,
                                            cgst: selectedBatch.cgst !== undefined ? selectedBatch.cgst : "",
                                            sgst: selectedBatch.sgst !== undefined ? selectedBatch.sgst : "",
                                            profit: profit
                                          }
                                        : bi
                                    )
                                  );
                                }
                              }}
                            />
                          ) : (
                            <span className="text-xs text-muted-foreground font-mono">
                              {item.batch_no || "-"}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {item.is_manual ? (
                            <span className="text-xs font-bold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded">
                              Manual
                            </span>
                          ) : hasOverflow ? (
                            <div className="text-center">
                              <span className="text-xs font-bold text-amber-500">
                                {available > 0 ? available : "0"}
                              </span>
                              <p className="text-[10px] text-amber-500 font-medium">
                                ({negativeBilled} neg)
                              </p>
                            </div>
                          ) : (
                            <span className="text-xs font-semibold text-emerald-500">
                              {available > 0 ? available : "Out of Stock"}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Input
                              ref={
                                index === billItems.length - 1
                                  ? quantityInputRef
                                  : null
                              }
                              type="number"
                              data-qty-for={item.id}
                              value={item.quantity || ""}
                              onFocus={(e) => e.target.select()}
                              onChange={(e) =>
                                handleItemFieldChange(
                                  item.id,
                                  "quantity",
                                  e.target.value
                                )
                              }
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  if (item.is_manual) {
                                    document
                                      .getElementById(`mrp-${item.id}`)
                                      ?.focus({ preventScroll: true });
                                  } else {
                                    document
                                      .getElementById(`discount-${item.id}`)
                                      ?.focus({ preventScroll: true });
                                  }
                                }
                              }}
                              min="1"
                              placeholder="1"
                              className={`h-8 text-xs text-center border-border/80 focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary rounded-lg transition-all duration-200 w-14 ${
                                hasOverflow ? "border-amber-500 focus-visible:ring-amber-500 focus-visible:border-amber-500 bg-amber-500/5 text-amber-600" : ""
                              }`}
                            />
                            {!item.is_manual && item.units_per_pack && (
                              <label className="flex items-center gap-1 cursor-pointer select-none text-[11px] font-bold text-muted-foreground/90 hover:text-foreground shrink-0 transition-colors">
                                <input
                                  type="checkbox"
                                  checked={
                                    item.quantity === item.units_per_pack
                                  }
                                  onChange={(e) =>
                                    handleFullPackToggle(
                                      item.id,
                                      e.target.checked
                                    )
                                  }
                                  className="h-3.5 w-3.5 rounded border border-border/80 text-primary focus:ring-1 focus:ring-primary cursor-pointer transition-colors"
                                />
                                Pack
                              </label>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          {item.is_manual ? (
                            <Input
                              type="number"
                              step="0.01"
                              value={item.purchase_price || ""}
                              onChange={(e) =>
                                handleItemFieldChange(
                                  item.id,
                                  "purchase_price",
                                  e.target.value
                                )
                              }
                              placeholder="Cost"
                              className="h-8 text-xs text-center border-primary/30 bg-primary/5 text-primary font-bold focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary rounded-lg transition-all duration-200 w-16"
                            />
                          ) : (
                            <span className="text-xs text-primary font-mono font-bold">
                              ₹{purchasePrice.toFixed(2)}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Input
                            id={`mrp-${item.id}`}
                            type="number"
                            step="0.01"
                            value={item.unit_price || ""}
                            onChange={(e) =>
                              handleItemFieldChange(
                                item.id,
                                "unit_price",
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
                            placeholder="MRP"
                            className="h-8 text-xs text-center border-amber-500/30 bg-amber-500/5 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold focus-visible:ring-1 focus-visible:ring-amber-500 focus-visible:border-amber-500 rounded-lg transition-all duration-200 w-20"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            id={`discount-${item.id}`}
                            type="number"
                            value={item.discount_percent || ""}
                            onChange={(e) =>
                              handleItemFieldChange(
                                item.id,
                                "discount_percent",
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
                            min="0"
                            max="100"
                            placeholder="0"
                            className="h-8 text-xs text-center border-border/80 focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary rounded-lg transition-all duration-200 w-16"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            id={`cgst-${item.id}`}
                            type="number"
                            step="0.01"
                            value={item.cgst !== undefined ? item.cgst : ""}
                            onChange={(e) =>
                              handleItemFieldChange(
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
                            min="0"
                            max="100"
                            placeholder="0"
                            className="h-8 text-xs text-center border-border/80 focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary rounded-lg transition-all duration-200 w-14"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            id={`sgst-${item.id}`}
                            type="number"
                            step="0.01"
                            value={item.sgst !== undefined ? item.sgst : ""}
                            onChange={(e) =>
                              handleItemFieldChange(
                                item.id,
                                "sgst",
                                e.target.value
                              )
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                if (index === billItems.length - 1) {
                                  handleAddNewRow();
                                } else {
                                  document
                                    .querySelector(
                                      `[data-testid="item-product-${index + 1}"]`
                                    )
                                    ?.focus({ preventScroll: true });
                                }
                              }
                            }}
                            min="0"
                            max="100"
                            placeholder="0"
                            className="h-8 text-xs text-center border-border/80 focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary rounded-lg transition-all duration-200 w-14"
                          />
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm font-semibold text-foreground">
                          ₹{itemTotal.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-center">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-all"
                            onClick={() => handleRemoveItem(item.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}

                  {billItems.length === 0 && (
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

            {/* Tip */}
            <p className="text-xs text-muted-foreground bg-muted/45 p-3 rounded-xl border border-border/50 backdrop-blur-sm flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-primary shrink-0" />
              <span><strong>Tip:</strong> Search by product name or salt composition. All fields are editable. Enter moves to the next field; {formatCombo("alt+a")} adds a row, {formatCombo("mod+enter")} saves.</span>
            </p>

            {/* Totals & Actions */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-border/55">
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleAddNewRow}
                    data-testid="add-item-btn"
                    className="h-9 px-4 border-border/80 hover:bg-muted/60 rounded-xl transition-all duration-200"
                  >
                    <Plus className="h-4 w-4 mr-1.5 text-primary" /> Add Item<span className="max-md:hidden">&nbsp;({formatCombo("alt+a")})</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setScannerModalOpen(true)}
                    data-testid="scan-for-bill-btn"
                    className="h-9 px-4 border-amber-500/40 text-amber-600 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 rounded-xl transition-all duration-200 shadow-2xs font-extrabold cursor-pointer"
                  >
                    <Camera className="h-4 w-4 mr-1.5" /> Scan for Bill
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setLabelScanOpen(true)}
                    data-testid="scan-item-qr-btn"
                    title="Scan the QR label stuck on a pack (printed from Purchases)"
                    className="h-9 px-4 border-border/80 hover:bg-muted/60 rounded-xl transition-all duration-200 font-bold"
                  >
                    <QrCode className="h-4 w-4 mr-1.5" /> Scan item QR
                  </Button>
                  <div className="flex items-center gap-2 bg-muted/20 px-3 h-9 rounded-xl border border-border/50">
                    <Checkbox
                      id="isPaid"
                      checked={isPaid}
                      disabled={isAdvancePaid || settings?.lock_unpaid_bills}
                      onCheckedChange={(val) => {
                        setIsPaid(val);
                        if (val) {
                          setIsAdvancePaid(false);
                          setAdvanceAmount("");
                          setIsCredit(false);
                          setPaidNow("");
                        } else {
                          setPaymentMode("");
                        }
                      }}
                    />
                    <Label htmlFor="isPaid" className="text-sm font-semibold text-foreground/80 cursor-pointer select-none">
                      Paid
                    </Label>
                  </div>

                  <div className="flex items-center gap-2 bg-muted/20 px-3 h-9 rounded-xl border border-border/50">
                    <Checkbox
                      id="isAdvancePaid"
                      checked={isAdvancePaid}
                      disabled={isPaid || settings?.lock_unpaid_bills}
                      onCheckedChange={(val) => {
                        setIsAdvancePaid(val);
                        if (val) {
                          setIsPaid(false);
                          setIsCredit(false);
                          setPaidNow("");
                        } else {
                          setAdvanceAmount("");
                          setPaymentMode("");
                        }
                      }}
                    />
                    <Label htmlFor="isAdvancePaid" className="text-sm font-semibold text-foreground/80 cursor-pointer select-none">
                      Advance Paid
                    </Label>
                  </div>

                  {/* Udhar: hand over the goods, take what they pay now, the rest goes to their dues */}
                  <div className={`flex items-center gap-2 px-3 h-9 rounded-xl border transition-colors ${isCredit ? "bg-rose-500/10 border-rose-500/40" : "bg-muted/20 border-border/50"}`}>
                    <Checkbox
                      id="isCredit"
                      checked={isCredit}
                      disabled={settings?.lock_unpaid_bills}
                      onCheckedChange={(val) => {
                        setIsCredit(!!val);
                        if (val) {
                          setIsPaid(false);
                          setIsAdvancePaid(false);
                          setAdvanceAmount("");
                        } else {
                          setPaidNow("");
                          setIsPaid(true);
                        }
                      }}
                      className="data-[state=checked]:bg-rose-600 data-[state=checked]:border-rose-600"
                      data-testid="credit-toggle"
                    />
                    <Label htmlFor="isCredit" className="text-sm font-semibold text-foreground/80 cursor-pointer select-none">
                      Udhar (Credit)
                    </Label>
                  </div>

                  {isCredit && (
                    <div className="flex flex-wrap items-center gap-2 animate-in fade-in slide-in-from-left-2 duration-200">
                      <div className="relative">
                        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">₹</span>
                        <input
                          type="number"
                          min="0"
                          inputMode="decimal"
                          placeholder="Paid now"
                          value={paidNow}
                          onChange={(e) => setPaidNow(e.target.value)}
                          className="h-9 w-32 rounded-xl border border-border/80 bg-background pl-6 pr-2 text-xs font-semibold outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20"
                          aria-label="Amount paid now"
                          data-testid="paid-now"
                        />
                      </div>
                      <span className="rounded-lg bg-rose-500/10 px-2.5 py-1 text-xs font-bold text-rose-600 dark:text-rose-400" data-testid="udhar-amount">
                        Udhar ₹{Math.max(0, grandTotal - (parseFloat(paidNow) || 0)).toFixed(2)}
                        <span className="ml-1 font-semibold text-rose-600/80 dark:text-rose-400/80">
                          → {customerInfo.customer_name ? `${customerInfo.customer_name.split(" ")[0]}'s dues` : "customer's dues"}
                        </span>
                      </span>
                      {(parseFloat(paidNow) || 0) > grandTotal && grandTotal > 0 && (
                        <span className="text-[11px] font-semibold text-red-500">More than the bill total ₹{grandTotal.toFixed(2)}</span>
                      )}
                    </div>
                  )}

                  {isAdvancePaid && (
                    <div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-2 duration-200">
                      <Input
                        type="number"
                        placeholder="Advance Amount *"
                        value={advanceAmount}
                        onChange={(e) => setAdvanceAmount(e.target.value)}
                        className="h-9 w-36 border-border/80 focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary rounded-xl text-xs font-semibold"
                      />
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <Select
                      value={paymentMode}
                      onValueChange={setPaymentMode}
                      disabled={!isPaid && !isAdvancePaid && !(isCredit && parseFloat(paidNow) > 0)}
                    >
                      <SelectTrigger className="h-9 w-36 bg-muted/20 border border-border/50 rounded-xl text-xs font-semibold" disabled={!isPaid && !isAdvancePaid && !(isCredit && parseFloat(paidNow) > 0)}>
                        <SelectValue placeholder="Payment Mode">
                          {paymentMode && paymentMode !== "none" ? (
                            <div className="flex items-center gap-1.5">
                              {getPaymentModeIcon(paymentMode, "w-3.5 h-3.5")}
                              <span>{paymentMode}</span>
                            </div>
                          ) : null}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {(!settings?.billing_payment_mode_mandatory && !isAdvancePaid) && (
                          <SelectItem value="none">None</SelectItem>
                        )}
                        <SelectItem value="Cash">
                          <div className="flex items-center gap-2">
                            {getPaymentModeIcon("Cash", "w-3.5 h-3.5")}
                            <span>Cash</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="UPI">
                          <div className="flex items-center gap-2">
                            {getPaymentModeIcon("UPI", "w-3.5 h-3.5")}
                            <span>UPI</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="Card">
                          <div className="flex items-center gap-2">
                            {getPaymentModeIcon("Card", "w-3.5 h-3.5")}
                            <span>Card</span>
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {negativeBilledQty > 0 && (
                  <div className="p-3.5 bg-amber-500/10 border border-amber-500/25 rounded-xl text-sm animate-in fade-in duration-200">
                    <p className="text-amber-700 font-bold flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                      Negative Billing Alert:
                    </p>
                    <p className="text-amber-600/90 mt-1 font-medium text-xs leading-relaxed">
                      {inventoryBilledQty} units from inventory, {negativeBilledQty} units negatively billed.
                    </p>
                  </div>
                )}

                {/* Patient Restock / Refill Reminder Card */}
                <div className={`p-3.5 rounded-2xl border transition-all duration-200 ${
                  refillReminder.enabled 
                    ? "bg-gradient-to-br from-indigo-500/10 via-purple-500/5 to-primary/5 border-indigo-500/30 shadow-sm" 
                    : "bg-muted/15 border-border/60 hover:border-border"
                }`}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${
                        refillReminder.enabled ? "bg-indigo-500 text-white shadow-xs" : "bg-muted text-muted-foreground"
                      }`}>
                        <RotateCcw className={`w-4 h-4 ${refillReminder.enabled ? "text-white" : ""}`} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <Label htmlFor="enable-refill-reminder" className="text-xs font-bold text-foreground cursor-pointer select-none">
                            Patient Refill / Restock Reminder
                          </Label>
                          <Badge className={refillReminder.enabled ? "bg-indigo-500/15 text-indigo-500 border border-indigo-500/30 text-[9px] font-bold" : "bg-muted text-muted-foreground text-[9px]"}>
                            {refillReminder.enabled ? "Active" : "Optional"}
                          </Badge>
                        </div>
                        <p className="text-[11px] text-muted-foreground font-medium">
                          Alert pharmacy when customer's medicine supply runs low
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="enable-refill-reminder"
                        checked={refillReminder.enabled}
                        onCheckedChange={(val) => {
                          const isEnabled = !!val;
                          const { targetDate, reminderDate } = calculateReminderDates(billingDate, refillReminder.days_supply, refillReminder.remind_before_days);
                          setRefillReminder((prev) => ({
                            ...prev,
                            enabled: isEnabled,
                            refill_target_date: targetDate,
                            reminder_date: reminderDate,
                            selected_items: isEnabled && prev.selected_items.length === 0 ? validItems : prev.selected_items,
                          }));
                        }}
                        className="data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600"
                      />
                      <Label htmlFor="enable-refill-reminder" className="text-xs font-semibold text-foreground/80 cursor-pointer select-none">
                        {refillReminder.enabled ? "Enabled" : "Enable Reminder"}
                      </Label>
                    </div>
                  </div>

                  {refillReminder.enabled && (
                    <div className="mt-3 pt-3 border-t border-indigo-500/20 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200" data-testid="refill-card">
                      {validItems.length === 0 ? (
                        <p className="text-[11px] font-semibold text-muted-foreground">Add medicines to the bill first.</p>
                      ) : (
                        <>
                          {/* One card per medicine: dose a day -> how long it lasts -> what to restock */}
                          <div className="space-y-2">
                            {validItems.map((item) => {
                              const on = refillReminder.selected_items.length === 0 || refillReminder.selected_items.some((x) => x.product_name === item.product_name);
                              const r = refillCalc.rows.find((x) => x.product_name === item.product_name);
                              const upp = parseInt(item.units_per_pack) || 1;
                              const toggle = () =>
                                setRefillReminder((prev) => {
                                  const cur = prev.selected_items.length === 0 ? [...validItems] : [...prev.selected_items];
                                  const has = cur.some((x) => x.product_name === item.product_name);
                                  const next = has ? cur.filter((x) => x.product_name !== item.product_name) : [...cur, item];
                                  return { ...prev, selected_items: next.length ? next : prev.selected_items };
                                });
                              const boxInput =
                                "h-8 rounded-lg border border-border bg-background px-2 text-center text-xs font-bold text-foreground outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20";
                              return (
                                <div
                                  key={item.product_name}
                                  className={`rounded-xl border p-3 transition-colors ${on ? "border-indigo-500/25 bg-background/80" : "border-border/50 bg-muted/20 opacity-60"}`}
                                >
                                  <label className="flex cursor-pointer items-center gap-2">
                                    <Checkbox checked={on} onCheckedChange={toggle} className="data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600" />
                                    <span className="min-w-0 truncate text-sm font-bold text-foreground" title={item.product_name}>{item.product_name}</span>
                                    <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold text-muted-foreground">{parseInt(item.quantity) || 0} sold</span>
                                  </label>

                                  {on && r && (
                                    <div className="mt-3 grid gap-3 sm:grid-cols-[1.4fr_1fr_1fr] sm:items-end">
                                      <div>
                                        <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Dose per day</p>
                                        <div className="flex flex-wrap items-center gap-1.5">
                                          {["0.5", "1", "2", "3"].map((v) => (
                                            <button
                                              key={v}
                                              type="button"
                                              onClick={() => setDose(item.product_name, { dose: v, days: "" })}
                                              className={`h-8 min-w-[2.25rem] rounded-lg border px-2 text-xs font-bold transition-colors ${!r.days_input && String(r.dose_input) === v ? "border-indigo-600 bg-indigo-600 text-white" : "border-border text-foreground hover:border-indigo-500/60"}`}
                                            >
                                              {v === "0.5" ? "½" : v}
                                            </button>
                                          ))}
                                          <input
                                            aria-label={`Other dose per day for ${item.product_name}`}
                                            inputMode="decimal"
                                            value={["0.5", "1", "2", "3"].includes(String(r.dose_input)) ? "" : r.dose_input}
                                            placeholder="1½"
                                            onChange={(e) => setDose(item.product_name, { dose: e.target.value || "1", days: "" })}
                                            className={`${boxInput} w-16`}
                                          />
                                        </div>
                                      </div>
                                      <div>
                                        <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Lasts</p>
                                        <p className={`flex h-8 items-center text-xs font-bold ${r.days ? "text-indigo-600 dark:text-indigo-400" : "text-rose-500"}`}>
                                          {r.days ? `${r.days} day${r.days === 1 ? "" : "s"} · till ${fmtDay(r.runs_out_on)}` : "Pick a dose"}
                                        </p>
                                      </div>
                                      <div>
                                        <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Restock</p>
                                        <div className="flex items-center gap-1.5">
                                          <input
                                            aria-label={`Quantity to restock for ${item.product_name}`}
                                            inputMode="numeric"
                                            value={r.reorder_input}
                                            onChange={(e) => setDose(item.product_name, { reorder: e.target.value.replace(/[^\d]/g, "").slice(0, 4) })}
                                            className={`${boxInput} w-16`}
                                          />
                                          <span className="text-xs font-semibold text-muted-foreground">
                                            {upp > 1 ? `pack${r.reorder_input === "1" ? "" : "s"} of ${upp}` : `unit${r.reorder_input === "1" ? "" : "s"}`}
                                          </span>
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>

                          {/* When to be reminded */}
                          {refillRec && (
                            <div className="space-y-2 rounded-xl bg-indigo-500/10 px-3 py-2.5">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="mr-1 flex items-center gap-1 text-[11px] font-bold text-indigo-700 dark:text-indigo-300">
                                  <Bell className="h-3.5 w-3.5" /> Remind me
                                </span>
                                {[0, 1, 2, 3].map((n) => {
                                  const active = refillReminder.mode === "auto" && refillLead === n;
                                  return (
                                    <button
                                      key={n}
                                      type="button"
                                      onClick={() => setRefillReminder((prev) => ({ ...prev, mode: "auto", lead: n }))}
                                      className={`h-7 rounded-lg border px-2.5 text-[11px] font-bold transition-colors ${active ? "border-indigo-600 bg-indigo-600 text-white" : "border-indigo-500/30 text-indigo-700 hover:bg-indigo-500/10 dark:text-indigo-300"}`}
                                    >
                                      {n === 0 ? "On the day" : `${n} day${n === 1 ? "" : "s"} before`}
                                    </button>
                                  );
                                })}
                                <span className="relative inline-flex">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const el = reminderDateRef.current;
                                      if (!el) return;
                                      try {
                                        el.showPicker();
                                      } catch {
                                        el.focus();
                                        el.click();
                                      }
                                    }}
                                    className={`flex h-7 items-center gap-1 rounded-lg border px-2.5 text-[11px] font-bold transition-colors ${refillReminder.mode === "custom" ? "border-indigo-600 bg-indigo-600 text-white" : "border-indigo-500/30 text-indigo-700 hover:bg-indigo-500/10 dark:text-indigo-300"}`}
                                  >
                                    <Calendar className="h-3.5 w-3.5" />
                                    {refillReminder.mode === "custom" && refillReminder.reminder_date ? fmtDay(refillReminder.reminder_date) : "Pick a date"}
                                  </button>
                                  {/* Native picker anchored under the button (opened with showPicker) */}
                                  <input
                                    ref={reminderDateRef}
                                    type="date"
                                    tabIndex={-1}
                                    aria-label="Reminder date"
                                    min={billingDate}
                                    value={refillReminder.reminder_date || ""}
                                    onChange={(e) => e.target.value && setRefillReminder((prev) => ({ ...prev, mode: "custom", reminder_date: e.target.value }))}
                                    className="pointer-events-none absolute bottom-0 left-0 h-0 w-full opacity-0"
                                  />
                                </span>
                              </div>
                              <p className="text-[11px] leading-relaxed text-indigo-800 dark:text-indigo-200">
                                <strong>{customerInfo.customer_name || "The customer"}</strong> runs out of {refillRec.driver}
                                {reminderItems.length > 1 ? " (first)" : ""} on <strong>{fmtDay(refillRec.refill_target_date)}</strong>. You'll be reminded on{" "}
                                <strong>{fmtDay(refillReminder.reminder_date)}</strong>, and tapping the reminder opens a purchase ready to restock{" "}
                                {refillCalc.rows
                                  .filter((x) => x.reorder_units > 0)
                                  .map((x) =>
                                    x.units_per_pack > 1
                                      ? `${x.reorder_input} pack${x.reorder_input === "1" ? "" : "s"} of ${x.product_name}`
                                      : `${x.reorder_input} unit${x.reorder_input === "1" ? "" : "s"} of ${x.product_name}`
                                  )
                                  .join(", ") || "these medicines"}.
                              </p>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-3.5">
                <div className="flex justify-between items-center gap-4 text-sm">
                  <span className="font-bold text-muted-foreground/85">Bill Discount %</span>
                  <Input
                    type="number"
                    value={billDiscount}
                    placeholder="0"
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "") return setBillDiscount("");
                      const n = parseFloat(v);
                      if (isNaN(n) || n < 0) return;
                      if (n > 100) {
                        toast.error("Discount can't be more than 100%");
                        return setBillDiscount("100");
                      }
                      setBillDiscount(v);
                    }}
                    min="0"
                    max="100"
                    className="h-9 w-24 text-center border-border/80 focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary rounded-xl transition-all duration-200 bg-background/50"
                  />
                </div>
                <div className="flex justify-between items-center text-sm font-semibold text-muted-foreground">
                  <span>Subtotal</span>
                  <span className="font-mono text-foreground">₹{subtotal.toFixed(2)}</span>
                </div>
                {(parseFloat(billDiscount) || 0) > 0 && (
                  <div className="flex justify-between items-center text-sm font-bold text-destructive">
                    <span>Discount ({fmtPct(billDiscount)}%)</span>
                    <span className="font-mono">-₹{discountAmount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center gap-4 border-t border-dashed border-border/60 pt-3">
                  <span className="text-base font-extrabold text-foreground">Grand Total</span>
                  <div className="relative">
                    <Input
                      type="number"
                      step="0.01"
                      value={grandTotalInput}
                      onFocus={() => setIsEditingGrandTotal(true)}
                      onChange={(e) => {
                        // Applied as typed, so any way of saving (button,
                        // shortcut) gets the new total
                        setGrandTotalInput(e.target.value);
                        const v = parseFloat(e.target.value);
                        if (subtotal > 0 && !isNaN(v) && v >= 0 && v <= subtotal) setBillDiscount(discountForTotal(subtotal, v));
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) {
                          e.target.blur();
                        }
                      }}
                      onBlur={() => {
                        const v = parseFloat(grandTotalInput);
                        if (subtotal > 0 && !isNaN(v) && v > subtotal) setBillDiscount("");
                        setIsEditingGrandTotal(false);
                      }}
                      className="w-36 h-9 text-right pr-3 text-lg font-black text-primary border-border/80 focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary rounded-xl transition-all duration-200 bg-background/50"
                    />
                  </div>
                </div>
                <div className="flex justify-between items-center pt-1">
                  <span className="text-xs font-bold text-muted-foreground/80">Estimated Profit</span>
                  <div
                    className={`text-xs font-bold px-2.5 py-1 rounded-full border ${totalProfit >= 0 ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/25" : "bg-destructive/10 text-destructive border-destructive/20"}`}
                  >
                    ₹{totalProfit.toFixed(2)}
                  </div>
                </div>
              </div>
            </div>
        </div>
      )}

      {/* EDIT BILL - Full Inline Table Editing (Like PurchasesPage) */}
      {editingBillId && editingBillData && (
        <div
          className="!mt-0 space-y-3 px-0.5 animate-in fade-in duration-300 relative"
          data-testid="edit-bill-form"
        >
          {/* Unified Single Control Toolbar for Edit Bill Entry */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-card border-2 border-amber-500/40 p-3 rounded-2xl backdrop-blur-xl shadow-md">
            {/* Left Fields Grid (Customer Name, Mobile, Email, Discount, Doctor) */}
            <div className="flex flex-wrap items-end gap-3 flex-1">
              <div className="space-y-1 w-full sm:w-[230px] relative">
                <Label className="flex items-center justify-between text-[11px] font-extrabold text-foreground/80">
                  <span className="flex items-center gap-1">
                    Customer Name *
                  </span>
                  {editingBillData.customer_id && (
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      onClick={() => fetchCustomerProfileData(editingBillData.customer_id)}
                      className="h-auto p-0 text-amber-500 font-bold text-[10px] flex items-center gap-1 animate-in fade-in"
                    >
                      <Eye className="w-3 h-3" /> Profile
                    </Button>
                  )}
                </Label>
                <Input
                  placeholder="Search existing customer..."
                  value={editingBillData.customer_name || ""}
                  onChange={(e) => {
                    const val = e.target.value;
                    setEditingBillData({
                      ...editingBillData,
                      customer_id: "",
                      customer_name: val,
                    });
                    setCustomerSearch(val);
                    setShowCustomerSuggestions(true);
                  }}
                  onFocus={() => setShowCustomerSuggestions(true)}
                  onBlur={() =>
                    setTimeout(() => setShowCustomerSuggestions(false), 200)
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Tab" && !e.shiftKey) {
                      const value = e.target.value;
                      if (!value || value.trim() === "") {
                        e.preventDefault();
                        setCustomerSearch("Walk-in");
                        setEditingBillData((prev) => ({
                          ...prev,
                          customer_name: "Walk-in",
                          customer_id: "",
                        }));
                        setTimeout(() => {
                          document.querySelector('[data-testid="edit-customer-mobile"]')?.focus();
                        }, 50);
                        return;
                      }
                    }
                    if (!showCustomerSuggestions) return;
                    const maxIndex = customerSuggestions.length;
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      setActiveCustomerSuggestionIndex((prev) => (prev < maxIndex ? prev + 1 : 0));
                    } else if (e.key === "ArrowUp") {
                      e.preventDefault();
                      setActiveCustomerSuggestionIndex((prev) => (prev > 0 ? prev - 1 : maxIndex));
                    } else if (e.key === "Enter") {
                      if (activeCustomerSuggestionIndex >= 0 && activeCustomerSuggestionIndex < customerSuggestions.length) {
                        e.preventDefault();
                        handleSelectCustomer(customerSuggestions[activeCustomerSuggestionIndex]);
                      } else if (activeCustomerSuggestionIndex === customerSuggestions.length) {
                        e.preventDefault();
                        setEditingBillData((prev) => ({
                          ...prev,
                          customer_id: "",
                          customer_name: customerSearch,
                        }));
                        setShowCustomerSuggestions(false);
                        setSelectedCustomerStats(null);
                      }
                    } else if (e.key === "Escape") {
                      setShowCustomerSuggestions(false);
                    }
                  }}
                  className="h-9 text-xs font-semibold rounded-xl border-border bg-background text-foreground shadow-2xs focus-visible:ring-2 focus-visible:ring-amber-500/30 focus-visible:border-amber-500"
                />
                {showCustomerSuggestions && customerSearch && (
                  <div
                    onScroll={handleScrollCustomerSuggestions}
                    className="absolute z-[100] w-full mt-1 bg-card/95 backdrop-blur-md border border-border shadow-xl rounded-xl max-h-48 overflow-y-auto top-full overflow-x-hidden transition-all duration-150 animate-in fade-in slide-in-from-top-2"
                  >
                    {customerSuggestions.map((customer, idx) => (
                      <div
                        key={customer.id}
                        id={`customer-suggestion-${idx}`}
                        className={`p-2.5 cursor-pointer border-b border-border/50 last:border-0 transition-colors duration-150 ${
                          activeCustomerSuggestionIndex === idx
                            ? "bg-amber-500/20"
                            : "hover:bg-amber-500/10"
                        }`}
                        onMouseDown={() => handleSelectCustomer(customer)}
                      >
                        <p className="font-semibold text-sm">{customer.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {customer.mobile}
                        </p>
                      </div>
                    ))}
                    {loadingCustomerSuggestions && (
                      <div className="p-3 text-center text-xs text-muted-foreground border-b border-border/50">
                        Loading...
                      </div>
                    )}
                    <div
                      id={`customer-suggestion-${customerSuggestions.length}`}
                      className={`p-2.5 cursor-pointer font-bold text-amber-600 text-xs flex items-center justify-between sticky bottom-0 border-t border-border/60 ${
                        activeCustomerSuggestionIndex === customerSuggestions.length
                          ? "bg-amber-500/20"
                          : "bg-card/95 hover:bg-amber-500/10"
                      }`}
                      onMouseDown={() => {
                        setEditingBillData((prev) => ({
                          ...prev,
                          customer_id: "",
                          customer_name: customerSearch,
                        }));
                        setShowCustomerSuggestions(false);
                        setSelectedCustomerStats(null);
                      }}
                    >
                      <span className="flex items-center gap-1">
                        <Plus className="w-3.5 h-3.5" /> New Customer "{customerSearch}"
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-1 w-[130px]">
                <Label className="text-[11px] font-extrabold text-foreground/80">
                  Mobile *
                </Label>
                <Input
                  placeholder="Mobile number"
                  value={editingBillData.customer_mobile || ""}
                  onChange={(e) =>
                    setEditingBillData({
                      ...editingBillData,
                      customer_mobile: e.target.value,
                    })
                  }
                  data-testid="edit-customer-mobile"
                  className="h-9 text-xs font-semibold rounded-xl border-border bg-background text-foreground shadow-2xs focus-visible:ring-2 focus-visible:ring-amber-500/30 focus-visible:border-amber-500"
                />
              </div>

              <div className="space-y-1 w-[150px]">
                <Label className="text-[11px] font-extrabold text-foreground/80">
                  Email
                </Label>
                <Input
                  type="email"
                  placeholder="Email"
                  value={editingBillData.customer_email || ""}
                  onChange={(e) =>
                    setEditingBillData({
                      ...editingBillData,
                      customer_email: e.target.value,
                    })
                  }
                  className="h-9 text-xs font-semibold rounded-xl border-border bg-background text-foreground shadow-2xs focus-visible:ring-2 focus-visible:ring-amber-500/30 focus-visible:border-amber-500"
                />
              </div>

              <div className="space-y-1 w-[100px]">
                <Label className="text-[11px] font-extrabold text-foreground/80">
                  Disc %
                </Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={editingBillData.discount_percent || ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    const n = parseFloat(v);
                    if (v !== "" && (isNaN(n) || n < 0)) return;
                    setEditingBillData({
                      ...editingBillData,
                      discount_percent: v === "" ? "" : n > 100 ? "100" : v,
                    });
                  }}
                  min="0"
                  max="100"
                  className="h-9 text-xs font-semibold rounded-xl border-border bg-background text-foreground shadow-2xs focus-visible:ring-2 focus-visible:ring-amber-500/30 focus-visible:border-amber-500"
                />
              </div>

              <div className="space-y-1 w-[140px] relative">
                <Label className="text-[11px] font-extrabold text-foreground/80">
                  Doctor
                </Label>
                <Input
                  placeholder="Doctor's name..."
                  value={editingBillData.doctor || ""}
                  onChange={(e) => {
                    setEditingBillData({
                      ...editingBillData,
                      doctor: e.target.value,
                    });
                    setDoctorSearch(e.target.value);
                    setShowDoctorSuggestions(true);
                  }}
                  onFocus={() => {
                    setShowDoctorSuggestions(true);
                    if (doctorSuggestions.length === 0) {
                      fetchDoctors(1, doctorSearch, false);
                    }
                  }}
                  onBlur={() =>
                    setTimeout(() => setShowDoctorSuggestions(false), 250)
                  }
                  className="h-9 text-xs font-semibold rounded-xl border-border bg-background text-foreground shadow-2xs focus-visible:ring-2 focus-visible:ring-amber-500/30 focus-visible:border-amber-500"
                />
                {showDoctorSuggestions && (
                  <div
                    className="absolute z-[100] w-[320px] -left-36 sm:left-0 mt-1 bg-card/95 backdrop-blur-md border border-border shadow-2xl rounded-xl max-h-60 overflow-y-auto top-full custom-scrollbar transition-all duration-150 animate-in fade-in slide-in-from-top-2"
                    onScroll={(e) => {
                      const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
                      if (scrollHeight - scrollTop <= clientHeight + 40 && hasMoreDoctors && !loadingDoctors) {
                        loadMoreDoctors();
                      }
                    }}
                  >
                    {doctorSuggestions.map((doc, idx) => (
                      <div
                        key={`${doc.id || doc.name}-${idx}`}
                        className="p-2.5 hover:bg-amber-500/10 cursor-pointer border-b border-border/40 last:border-0 transition-colors duration-150"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleSelectEditingDoctor(doc);
                        }}
                      >
                        <div className="flex items-center justify-between gap-1.5 mb-0.5">
                          <p className="font-semibold text-xs text-foreground truncate">
                            {doc.name}
                          </p>
                          {doc.source === "global" ? (
                            <span className="text-[9px] px-1.5 py-0.2 rounded-full font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20 shrink-0">
                              Verified
                            </span>
                          ) : (
                            <span className="text-[9px] px-1.5 py-0.2 rounded-full font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20 shrink-0">
                              My Doctor
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground truncate font-mono">
                          {doc.license_number || doc.registration_no ? (
                            <span>Reg: {doc.license_number || doc.registration_no}</span>
                          ) : null}
                          {doc.clinic ? <span>• {doc.clinic}</span> : null}
                          {doc.city || doc.state ? (
                            <span>• {[doc.city, doc.state].filter(Boolean).join(", ")}</span>
                          ) : null}
                        </div>
                      </div>
                    ))}
                    {loadingDoctors && (
                      <div className="py-2.5 text-center flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-500" />
                        <span>Loading doctors...</span>
                      </div>
                    )}
                    {!loadingDoctors && doctorSuggestions.length === 0 && (
                      <div className="p-3 text-center text-xs text-muted-foreground italic">
                        No doctors match "{doctorSearch}"
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Right: Customer Financial Summary Pill + Units / Total Stats Summary Pill + Close */}
            <div className="flex items-center gap-2 shrink-0 self-end lg:self-center max-md:w-full max-md:flex-wrap max-md:self-stretch">
              {selectedCustomerStats && (
                <div className="hidden sm:flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 px-3 py-1 rounded-xl shadow-2xs h-9 text-[10px] font-bold font-mono">
                  <span className="text-muted-foreground uppercase text-[9px]">Debt:</span>
                  <span className="text-red-500 font-extrabold">₹{selectedCustomerStats.totalDebt.toFixed(2)}</span>
                  <span className="text-muted-foreground/40">|</span>
                  <span className="text-muted-foreground uppercase text-[9px]">Adv:</span>
                  <span className="text-emerald-500 font-extrabold">₹{(selectedCustomerStats.totalAdvance || 0).toFixed(2)}</span>
                  <span className="text-muted-foreground/40">|</span>
                  <span className="text-muted-foreground uppercase text-[9px]">Bills:</span>
                  <span className="text-foreground font-extrabold">{selectedCustomerStats.totalBills}</span>
                </div>
              )}
              <div className="flex items-center gap-2 bg-muted px-3 py-1 rounded-xl border border-border shadow-2xs h-9">
                <div className="flex items-center gap-1 border-r border-border pr-2.5">
                  <span className="text-[10px] uppercase font-extrabold text-muted-foreground">
                    Units:
                  </span>
                  <span className="text-xs font-black font-mono text-foreground">
                    {editingBillItems.length}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] uppercase font-extrabold text-amber-500">
                    Total:
                  </span>
                  <span className="text-xs font-black font-mono text-amber-500">
                    ₹{editGrandTotal.toFixed(2)}
                  </span>
                </div>
              </div>

              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-xl hover:bg-muted/80 text-muted-foreground hover:text-foreground max-md:hidden"
                onClick={handleCancelEditBill}
                title="Close"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

            {/* Items Table - Inline Editable */}
            <div className="border border-border/70 rounded-xl overflow-hidden shadow-sm bg-background/50 backdrop-blur-md mt-4">
              <Table mobileCards wrapperClassName="max-h-[300px]">
                <TableHeader className="sticky top-0 bg-muted/90 backdrop-blur-md z-[50] border-b border-border/80">
                  <TableRow className="hover:bg-transparent border-b border-border/80">
                    <TableHead data-card="title" className="w-[180px] font-bold text-foreground/80 text-xs uppercase tracking-wider">
                      Product *
                    </TableHead>
                    <TableHead className="w-[100px] font-bold text-foreground/80 text-xs uppercase tracking-wider">
                      Salt
                    </TableHead>
                    <TableHead data-card="full" className="w-[70px] font-bold text-foreground/80 text-xs uppercase tracking-wider">
                      Batch
                    </TableHead>
                    <TableHead className="w-[60px] text-center font-bold text-foreground/80 text-xs uppercase tracking-wider">
                      Avail.
                    </TableHead>
                    <TableHead className="w-[60px] text-center font-bold text-foreground/80 text-xs uppercase tracking-wider">
                      Expiry
                    </TableHead>
                    <TableHead className="w-[60px] text-center font-bold text-foreground/80 text-xs uppercase tracking-wider">
                      Qty *
                    </TableHead>
                    <TableHead className="w-[80px] text-center font-bold text-foreground/80 text-xs uppercase tracking-wider">
                      Cost/Unit
                    </TableHead>
                    <TableHead className="w-[80px] text-center font-bold text-foreground/80 text-xs uppercase tracking-wider">
                      MRP/Unit
                    </TableHead>
                    <TableHead className="w-[60px] text-center font-bold text-foreground/80 text-xs uppercase tracking-wider">
                      Disc %
                    </TableHead>
                    <TableHead className="w-[60px] text-center font-bold text-foreground/80 text-xs uppercase tracking-wider">
                      CGST %
                    </TableHead>
                    <TableHead className="w-[60px] text-center font-bold text-foreground/80 text-xs uppercase tracking-wider">
                      SGST %
                    </TableHead>
                    <TableHead className="w-[80px] text-right font-bold text-foreground/80 text-xs uppercase tracking-wider">
                      Total
                    </TableHead>
                    <TableHead data-card="corner" className="w-[60px] text-center font-bold text-foreground/80 text-xs uppercase tracking-wider">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {editingBillItems.map((item, index) => {
                    const qty = parseInt(item.quantity) || 0;
                    const unitPrice = parseFloat(item.unit_price) || 0;
                    const discPercent = parseFloat(item.discount_percent) || 0;
                    const purchasePrice = parseFloat(item.purchase_price) || 0;
                    const cgstVal = parseFloat(item.cgst) || 0;
                    const sgstVal = parseFloat(item.sgst) || 0;
                    const exclPrice = item.exclusive_price !== undefined && item.exclusive_price !== null && !isNaN(item.exclusive_price)
                      ? parseFloat(item.exclusive_price)
                      : (unitPrice / (1 + (cgstVal + sgstVal) / 100));
                    const itemTotal = qty * exclPrice * (1 - discPercent / 100) * (1 + (cgstVal + sgstVal) / 100);
                    const available = parseInt(item.available) || 0;

                    const hasOverflow =
                      !item.is_manual && qty > available && available > 0;

                    return (
                      <TableRow
                        key={item.id || index}
                        className={
                          hasOverflow ? "bg-amber-500/10 border-b border-border/80" : "hover:bg-muted/30 border-b border-border/50"
                        }
                      >
                        <TableCell
                          className="relative"
                          style={{ overflow: "visible" }}
                        >
                          <Input
                            ref={(el) => {
                              setEditingInputRef(el, item.id);
                              if (index === editingBillItems.length - 1) {
                                editingProductInputRef.current = el;
                              }
                            }}
                            value={item.product_name || ""}
                            onChange={(e) =>
                              handleEditItemFieldChange(
                                item.id,
                                "product_name",
                                e.target.value
                              )
                            }
                            onFocus={() => {
                              setEditingInventorySearch(
                                item.product_name || ""
                              );
                              setShowEditingInventorySuggestions(true);
                              setActiveEditingItemId(item.id);
                              setHighlightedEditingSuggestion(-1);
                            }}
                            onBlur={() => {
                              const currentId = item.id;
                              setTimeout(
                                () => {
                                  if (!isMouseOverEditingSuggestions) {
                                    setActiveEditingItemId((prev) => {
                                      if (prev === currentId) {
                                        setShowEditingInventorySuggestions(false);
                                        return null;
                                      }
                                      return prev;
                                    });
                                  }
                                },
                                200
                              );
                            }}
                            onKeyDown={(e) =>
                              handleEditDropdownKeyDown(e, item.id)
                            }
                            placeholder="Search product or salt..."
                            className="h-8 text-xs border-border/80 focus-visible:ring-1 focus-visible:ring-amber-500 focus-visible:border-amber-500 rounded-lg transition-all duration-200"
                            autoComplete="off"
                          />
                          {/* Search Suggestions Dropdown for Editing */}
                          {showEditingInventorySuggestions &&
                            activeEditingItemId === item.id &&
                            createPortal(
                              <div
                                data-suggestions-dropdown="true"
                                className="bg-card/95 backdrop-blur-xl border border-border/80 rounded-xl shadow-2xl overflow-y-auto z-[99999] animate-in fade-in slide-in-from-top-2 duration-150 scroller-hide"
                                onMouseEnter={() => setIsMouseOverEditingSuggestions(true)}
                                onMouseLeave={() => {
                                  setIsMouseOverEditingSuggestions(false);
                                  const activeInput = editingInputRefs.current[activeEditingItemId];
                                  if (activeInput && document.activeElement !== activeInput) {
                                    setShowEditingInventorySuggestions(false);
                                    setActiveEditingItemId(null);
                                  }
                                }}
                                style={suggestionBoxStyle()}
                              >
                                <SuggestionList
                                  idPrefix="suggestion-edit"
                                  search={editingInventorySearch}
                                  allSuggestions={editingInventorySuggestions}
                                  suggestions={visibleEditingSuggestions}
                                  loading={loadingEditingInventorySuggestions}
                                  highlighted={highlightedEditingSuggestion}
                                  setHighlighted={setHighlightedEditingSuggestion}
                                  filter={suggestionFilter}
                                  setFilter={setSuggestionFilter}
                                  warningDays={expiryWarningDays}
                                  getNearestExpiryInfo={getNearestExpiryInfo}
                                  onSelect={(invItem) => handleSelectInventoryForEditRow(item.id, invItem)}
                                  onManual={() => handleManualEntryForEdit(item.id, editingInventorySearch)}
                                  onDetails={(invItem) => openSuggestionDetails(invItem, item.id, "edit")}
                                />
                              </div>,
                              document.body
                            )}
                        </TableCell>
                        <TableCell>
                          <Input
                            value={item.salt_composition || ""}
                            onChange={(e) =>
                              handleEditItemFieldChange(
                                item.id,
                                "salt_composition",
                                e.target.value
                              )
                            }
                            placeholder="Salt"
                            className="h-8 text-xs border-border/80 focus-visible:ring-1 focus-visible:ring-amber-500 focus-visible:border-amber-500 rounded-lg transition-all duration-200 w-24"
                          />
                        </TableCell>
                        <TableCell>
                          {item.batches_loading ? (
                            <div className="h-8 w-24 rounded-lg border border-border/60 bg-muted/60 animate-pulse flex items-center px-2 text-[11px] font-mono text-muted-foreground" title="Loading batches…">
                              {item.batch_no || "…"}
                            </div>
                          ) : (!item.is_manual && item.available_batches && item.available_batches.length > 0) ? (
                            <BatchPicker
                              batches={item.available_batches}
                              value={item.inventory_id}
                              fallbackLabel={item.batch_no}
                              autoOpen={autoOpenBatchFor === item.id}
                              onAutoOpened={() => setAutoOpenBatchFor(null)}
                              onPicked={() => focusQtyFor(item.id)}
                              nearExpiry={nearExpiryBatchFilter}
                              onToggleNearExpiry={() => setNearExpiryBatchFilter((prev) => !prev)}
                              accent="amber"
                              onSelect={(selectedInvId) => {
                                const selectedBatch = item.available_batches.find(b => b.id === selectedInvId);
                                if (selectedBatch) {
                                  const qty = parseInt(item.quantity) || 1;
                                  const unitPrice = selectedBatch.mrp_per_unit || selectedBatch.mrp || 0;
                                  const purchasePrice = selectedBatch.cost_per_unit || selectedBatch.purchase_price || 0;
                                  const cgstVal = selectedBatch.cgst !== undefined ? Math.max(0, parseFloat(selectedBatch.cgst) || 0) : 0;
                                  const sgstVal = selectedBatch.sgst !== undefined ? Math.max(0, parseFloat(selectedBatch.sgst) || 0) : 0;
                                  
                                  const exclPrice = unitPrice / (1 + (cgstVal + sgstVal) / 100);
                                  const itemDiscount = (qty * exclPrice) * ((parseFloat(item.discount_percent) || 0) / 100);
                                  const netTotal = (qty * exclPrice - itemDiscount) * (1 + (cgstVal + sgstVal) / 100);
                                  const profit = (unitPrice - purchasePrice) * qty - (qty * unitPrice * ((parseFloat(item.discount_percent) || 0) / 100));

                                  setEditingBillItems((prev) =>
                                    prev.map((bi) =>
                                      bi.id === item.id
                                        ? {
                                            ...bi,
                                            inventory_id: selectedInvId,
                                            batch_no: selectedBatch.batch_no,
                                            expiry_date: selectedBatch.expiry_date || "",
                                            unit_price: unitPrice,
                                            exclusive_price: exclPrice,
                                            net_total: netTotal,
                                            purchase_price: purchasePrice,
                                            available: selectedBatch.available_quantity || 0,
                                            cgst: selectedBatch.cgst !== undefined ? selectedBatch.cgst : "",
                                            sgst: selectedBatch.sgst !== undefined ? selectedBatch.sgst : "",
                                            profit: profit
                                          }
                                        : bi
                                    )
                                  );
                                }
                              }}
                            />
                          ) : (
                            <Input
                              value={item.batch_no || ""}
                              onChange={(e) =>
                                handleEditItemFieldChange(
                                  item.id,
                                  "batch_no",
                                  e.target.value
                                )
                              }
                              placeholder="Batch"
                              className="h-8 text-xs text-center border-border/80 focus-visible:ring-1 focus-visible:ring-amber-500 focus-visible:border-amber-500 rounded-lg transition-all duration-200 w-20"
                            />
                          )}
                        </TableCell>
                        <TableCell className="text-center font-medium">
                          {item.is_manual ? (
                            <span className="text-xs font-bold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded">
                              Manual
                            </span>
                          ) : item.batches_loading ? (
                            <span className="inline-block h-3 w-8 rounded bg-muted animate-pulse align-middle" />
                          ) : (
                            <span className="text-xs font-semibold text-emerald-500">
                              {available > 0 ? available : "Out of Stock"}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Input
                            type="text"
                            inputMode="numeric"
                            placeholder="MM/YY"
                            maxLength={5}
                            value={formatExpiryInput(item.expiry_date || "")}
                            onChange={(e) =>
                              handleEditItemFieldChange(
                                item.id,
                                "expiry_date",
                                formatExpiryInput(e.target.value)
                              )
                            }
                            className="h-8 text-xs text-center border-border/80 focus-visible:ring-1 focus-visible:ring-amber-500 focus-visible:border-amber-500 rounded-lg transition-all duration-200 w-24"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            data-qty-for={item.id}
                            value={item.quantity || ""}
                            onFocus={(e) => e.target.select()}
                            onChange={(e) =>
                              handleEditItemFieldChange(
                                item.id,
                                "quantity",
                                e.target.value
                              )
                            }
                            min="1"
                            placeholder="1"
                            className={`h-8 text-xs text-center border-border/80 focus-visible:ring-1 focus-visible:ring-amber-500 focus-visible:border-amber-500 rounded-lg transition-all duration-200 w-16 ${
                              hasOverflow ? "border-amber-500 focus-visible:ring-amber-500 focus-visible:border-amber-500 bg-amber-500/5 text-amber-600" : ""
                            }`}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step="0.01"
                            value={item.purchase_price || ""}
                            onFocus={(e) => e.target.select()}
                            onChange={(e) =>
                              handleEditItemFieldChange(
                                item.id,
                                "purchase_price",
                                e.target.value
                              )
                            }
                            placeholder="Cost"
                            className="h-8 text-xs text-center border-primary/30 bg-primary/5 text-primary font-bold focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary rounded-lg transition-all duration-200 w-20"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step="0.01"
                            value={item.unit_price || ""}
                            onFocus={(e) => e.target.select()}
                            onChange={(e) =>
                              handleEditItemFieldChange(
                                item.id,
                                "unit_price",
                                e.target.value
                              )
                            }
                            placeholder="MRP"
                            className="h-8 text-xs text-center border-amber-500/30 bg-amber-500/5 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold focus-visible:ring-1 focus-visible:ring-amber-500 focus-visible:border-amber-500 rounded-lg transition-all duration-200 w-24"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            value={item.discount_percent || ""}
                            onFocus={(e) => e.target.select()}
                            onChange={(e) =>
                              handleEditItemFieldChange(
                                item.id,
                                "discount_percent",
                                e.target.value
                              )
                            }
                            min="0"
                            max="100"
                            placeholder="0"
                            className="h-8 text-xs text-center border-border/80 focus-visible:ring-1 focus-visible:ring-amber-500 focus-visible:border-amber-500 rounded-lg transition-all duration-200 w-16"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step="0.01"
                            value={item.cgst !== undefined ? item.cgst : ""}
                            onFocus={(e) => e.target.select()}
                            onChange={(e) =>
                              handleEditItemFieldChange(
                                item.id,
                                "cgst",
                                e.target.value
                              )
                            }
                            min="0"
                            max="100"
                            placeholder="0"
                            className="h-8 text-xs text-center border-border/80 focus-visible:ring-1 focus-visible:ring-amber-500 focus-visible:border-amber-500 rounded-lg transition-all duration-200 w-16"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step="0.01"
                            value={item.sgst !== undefined ? item.sgst : ""}
                            onFocus={(e) => e.target.select()}
                            onChange={(e) =>
                              handleEditItemFieldChange(
                                item.id,
                                "sgst",
                                e.target.value
                              )
                            }
                            min="0"
                            max="100"
                            placeholder="0"
                            className="h-8 text-xs text-center border-border/80 focus-visible:ring-1 focus-visible:ring-amber-500 focus-visible:border-amber-500 rounded-lg transition-all duration-200 w-16"
                          />
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm font-semibold text-foreground">
                          ₹{itemTotal.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-center">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-all"
                            onClick={() => handleRemoveEditItem(item.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}

                  {editingBillItems.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={13}
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

            {/* Notes */}
            <div className="space-y-2">
              <Label className="text-xs font-bold text-muted-foreground/80 uppercase tracking-wider">Notes</Label>
              <Input
                value={editingBillData.notes || ""}
                onChange={(e) =>
                  setEditingBillData({
                    ...editingBillData,
                    notes: e.target.value,
                  })
                }
                placeholder="Add notes..."
                className="h-10 border-border/80 rounded-xl focus-visible:ring-1 focus-visible:ring-amber-500 focus-visible:border-amber-500 transition-all duration-200"
              />
            </div>

            {/* Totals & Actions */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-border/55">
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleAddEditRow}
                    className="h-9 px-4 border-border/80 hover:bg-muted/60 rounded-xl transition-all duration-200"
                  >
                    <Plus className="h-4 w-4 mr-1.5 text-amber-500" /> Add Item
                  </Button>
                  <div className="flex items-center gap-2 bg-muted/20 px-3 h-9 rounded-xl border border-border/50">
                    <Checkbox
                      id="editIsPaid"
                      checked={editingBillData.is_paid}
                      disabled={settings?.lock_unpaid_bills}
                      onCheckedChange={(v) =>
                        setEditingBillData({
                          ...editingBillData,
                          is_paid: v,
                          is_credit: v ? false : editingBillData.is_credit,
                          due_date: v ? null : editingBillData.due_date,
                          payment_mode: v ? (editingBillData.payment_mode || "Cash") : "",
                        })
                      }
                    />
                    <Label htmlFor="editIsPaid" className="text-sm font-semibold text-foreground/80 cursor-pointer select-none">
                      Paid
                    </Label>
                  </div>
                  <div className={`flex items-center gap-2 px-3 h-9 rounded-xl border ${editingBillData.is_credit ? "border-rose-500/40 bg-rose-500/10" : "border-border/50 bg-muted/20"}`}>
                    <Checkbox
                      id="editIsCredit"
                      data-testid="edit-credit-toggle"
                      checked={!!editingBillData.is_credit}
                      disabled={settings?.lock_unpaid_bills}
                      onCheckedChange={(v) =>
                        setEditingBillData({
                          ...editingBillData,
                          is_credit: !!v,
                          is_paid: v ? false : editingBillData.is_paid,
                          is_advance_paid: v ? false : editingBillData.is_advance_paid,
                          paid_now: v ? editingBillData.paid_now : "",
                          payment_mode: v ? editingBillData.payment_mode : editingBillData.is_paid ? editingBillData.payment_mode : "",
                        })
                      }
                    />
                    <Label htmlFor="editIsCredit" className="text-sm font-semibold text-foreground/80 cursor-pointer select-none">
                      Udhar
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select
                      value={editingBillData.payment_mode || "none"}
                      onValueChange={(val) =>
                        setEditingBillData({
                          ...editingBillData,
                          payment_mode: val,
                        })
                      }
                      disabled={!editingBillData.is_paid && !(editingBillData.is_credit && parseFloat(editingBillData.paid_now) > 0)}
                    >
                      <SelectTrigger className="h-9 w-36 bg-muted/20 border border-border/50 rounded-xl text-xs font-semibold" disabled={!editingBillData.is_paid && !(editingBillData.is_credit && parseFloat(editingBillData.paid_now) > 0)}>
                        <SelectValue placeholder="Payment Mode">
                          {editingBillData.payment_mode && editingBillData.payment_mode !== "none" ? (
                            <div className="flex items-center gap-1.5">
                              {getPaymentModeIcon(editingBillData.payment_mode, "w-3.5 h-3.5")}
                              <span>{editingBillData.payment_mode}</span>
                            </div>
                          ) : null}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {!settings?.billing_payment_mode_mandatory && (
                          <SelectItem value="none">None</SelectItem>
                        )}
                        <SelectItem value="Cash">
                          <div className="flex items-center gap-2">
                            {getPaymentModeIcon("Cash", "w-3.5 h-3.5")}
                            <span>Cash</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="UPI">
                          <div className="flex items-center gap-2">
                            {getPaymentModeIcon("UPI", "w-3.5 h-3.5")}
                            <span>UPI</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="Card">
                          <div className="flex items-center gap-2">
                            {getPaymentModeIcon("Card", "w-3.5 h-3.5")}
                            <span>Card</span>
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {editingBillData.is_credit && (
                  <div className="flex flex-wrap items-center gap-2 animate-in fade-in slide-in-from-left-2 duration-200">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Paid now ₹"
                      value={editingBillData.paid_now}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v !== "" && Number(v) < 0) return;
                        setEditingBillData({ ...editingBillData, paid_now: v });
                      }}
                      className={`h-9 w-32 rounded-xl text-sm font-semibold ${(parseFloat(editingBillData.paid_now) || 0) > editGrandTotal + 0.004 ? "border-red-500" : ""}`}
                      data-testid="edit-paid-now"
                    />
                    <span className="text-xs font-bold text-rose-600 dark:text-rose-400">
                      Udhar ₹{Math.max(0, editGrandTotal - (parseFloat(editingBillData.paid_now) || 0)).toFixed(2)}
                      <span className="ml-1 font-semibold text-rose-600/80 dark:text-rose-400/80">
                        → {editingBillData.customer_name ? `${editingBillData.customer_name.split(" ")[0]}'s dues` : "customer's dues"}
                      </span>
                    </span>
                    {(parseFloat(editingBillData.paid_now) || 0) > editGrandTotal + 0.004 && (
                      <span className="text-[11px] font-semibold text-red-500">More than the bill total ₹{editGrandTotal.toFixed(2)}</span>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap gap-4 items-end">
                  {/* Due Date */}
                  {!editingBillData.is_paid && (
                    <div className="space-y-2">
                      <Label className="text-xs font-bold text-muted-foreground/80 uppercase tracking-wider">Due Date</Label>
                      <Input
                        type="date"
                        value={editingBillData.due_date || ""}
                        onChange={(e) =>
                          setEditingBillData({
                            ...editingBillData,
                            due_date: e.target.value,
                          })
                        }
                        className="h-10 border-border/80 rounded-xl focus-visible:ring-1 focus-visible:ring-amber-500 focus-visible:border-amber-500 transition-all duration-200 bg-background/50 w-40"
                      />
                    </div>
                  )}
                  {/* Billing Date */}
                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-muted-foreground/80 uppercase tracking-wider">Billing Date</Label>
                    <Input
                      type="date"
                      value={editingBillData.billing_date || ""}
                      onChange={(e) =>
                        setEditingBillData({
                          ...editingBillData,
                          billing_date: e.target.value,
                        })
                      }
                      className="h-10 border-border/80 rounded-xl focus-visible:ring-1 focus-visible:ring-amber-500 focus-visible:border-amber-500 transition-all duration-200 bg-background/50 w-40"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-3.5">
                <div className="flex justify-between items-center text-sm font-semibold text-muted-foreground">
                  <span>Subtotal</span>
                  <span className="font-mono text-foreground">₹{editSubtotal.toFixed(2)}</span>
                </div>
                {editDiscountPercent > 0 && (
                  <div className="flex justify-between items-center text-sm font-bold text-destructive">
                    <span>Discount ({fmtPct(editDiscountPercent)}%)</span>
                    <span className="font-mono">-₹{editDiscountAmount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center gap-4 border-t border-dashed border-border/60 pt-3">
                  <span className="text-base font-extrabold text-foreground">Grand Total</span>
                  <div className="relative">
                    <Input
                      type="number"
                      step="0.01"
                      className="w-36 h-9 text-right pr-3 text-lg font-black text-amber-600 border-border/80 focus-visible:ring-1 focus-visible:ring-amber-500 focus-visible:border-amber-500 rounded-xl transition-all duration-200 bg-background/50"
                      value={editGrandTotalInput}
                      onFocus={() => setIsEditingEditGrandTotal(true)}
                      onChange={(e) => {
                        // Applied as typed, so any way of saving (button,
                        // shortcut) gets the new total
                        setEditGrandTotalInput(e.target.value);
                        const v = parseFloat(e.target.value);
                        if (editSubtotal > 0 && !isNaN(v) && v >= 0 && v <= editSubtotal)
                          setEditingBillData((d) => ({ ...d, discount_percent: discountForTotal(editSubtotal, v) }));
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) {
                          e.target.blur();
                        }
                      }}
                      onBlur={() => {
                        const v = parseFloat(editGrandTotalInput);
                        if (editSubtotal > 0 && !isNaN(v) && v > editSubtotal) setEditingBillData((d) => ({ ...d, discount_percent: 0 }));
                        setIsEditingEditGrandTotal(false);
                      }}
                    />
                  </div>
                </div>
                <div className="flex justify-between items-center pt-1">
                  <span className="text-xs font-bold text-muted-foreground/80">Estimated Profit</span>
                  <div
                    className={`text-xs font-bold px-2.5 py-1 rounded-full border ${editTotalProfit >= 0 ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/25" : "bg-destructive/10 text-destructive border-destructive/20"}`}
                  >
                    ₹{editTotalProfit.toFixed(2)}
                  </div>
                </div>
              </div>
            </div>
        </div>
      )}

      {!showNewBill && !editingBillId && (
        <div className="space-y-3">
          <div className="flex flex-col md:flex-row items-center gap-3 pt-1">
            <div className="flex-1 w-full">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search bills by bill number, customer, doctor, batch, product, notes..."
                  data-shortcut="search"
                  className="pl-9 h-9 text-xs font-medium rounded-xl border-border/70 bg-card/60 backdrop-blur-md"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
            <div className="flex items-center gap-2 w-full md:w-auto flex-wrap">
              <Button
                variant="outline"
                size="sm"
                className="h-9 text-xs font-bold rounded-xl bg-gradient-to-r from-amber-500/10 to-orange-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400 hover:border-amber-500/50 cursor-pointer shadow-2xs"
                onClick={() => openScanner("/scan-bill")}
                data-testid="scan-bill-list-btn"
              >
                <Camera className="w-4 h-4 mr-1.5 text-amber-500" />
                <span>Scan for Bill</span>
              </Button>
              <CustomerFilter
                value={filterCustomer}
                onChange={handleCustomerFilterChange}
              />

              <Select
                value={filterBillType}
                onValueChange={(val) => {
                  setPage(1);
                  setFilterBillType(val);
                }}
              >
                <SelectTrigger className="w-32 h-9 text-xs font-semibold border-border/70 rounded-xl bg-card/60 backdrop-blur-md">
                  <SelectValue placeholder="All Bills" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Bills</SelectItem>
                  <SelectItem value="regular">Regular Bills</SelectItem>
                  <SelectItem value="advance">Advance Bills</SelectItem>
                </SelectContent>
              </Select>

              <Button
                variant={activeViewTab === "drafts" ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setActiveViewTab((prev) => (prev === "drafts" ? "all" : "drafts"));
                  if (activeViewTab !== "drafts") fetchDrafts();
                }}
                className={`h-9 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                  activeViewTab === "drafts"
                    ? "bg-orange-600 hover:bg-orange-700 text-white shadow-md"
                    : "border-orange-500/30 text-orange-600 dark:text-orange-400 bg-orange-500/10 hover:bg-orange-500/20"
                }`}
              >
                <FileText className="w-3.5 h-3.5 mr-1.5" />
                <span>Draft Bills</span>
                {drafts.length > 0 && (
                  <Badge className="ml-1.5 px-1.5 py-0 text-[9px] bg-white text-orange-600 font-extrabold rounded-full">
                    {drafts.length}
                  </Badge>
                )}
              </Button>

              {/* More Filters Popover Menu */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant={startDate || endDate ? "default" : "outline"}
                    size="sm"
                    className={`h-9 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                      startDate || endDate
                        ? "bg-orange-600 hover:bg-orange-700 text-white shadow-md"
                        : "border-border/70 hover:bg-muted"
                    }`}
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5 mr-1.5" />
                    <span>More Filters</span>
                    {(startDate || endDate) && (
                      <Badge className="ml-1.5 px-1.5 py-0 text-[9px] bg-white text-orange-600 font-extrabold rounded-full">
                        {(startDate ? 1 : 0) + (endDate ? 1 : 0)}
                      </Badge>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-80 p-4 space-y-4 rounded-2xl shadow-xl border-border bg-card/95 backdrop-blur-md">
                  <div className="flex items-center justify-between pb-2 border-b border-border/50">
                    <div className="flex items-center gap-2">
                      <Filter className="w-4 h-4 text-orange-500" />
                      <h4 className="text-xs font-extrabold uppercase tracking-wider text-foreground">
                        Date & Filter Options
                      </h4>
                    </div>
                    {(startDate || endDate || searchQuery || filterCustomer !== "all" || filterBillType !== "all") && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSearchQuery("");
                          setStartDate("");
                          setEndDate("");
                          handleCustomerFilterChange("all");
                          setFilterBillType("all");
                          setPage(1);
                        }}
                        className="h-7 px-2 text-[11px] font-bold text-muted-foreground hover:text-foreground"
                      >
                        Reset All
                      </Button>
                    )}
                  </div>

                  {/* Date Pickers */}
                  <div className="space-y-2">
                    <Label className="text-[11px] font-extrabold text-muted-foreground uppercase flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-orange-500" /> Date Range
                    </Label>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-[10px] text-muted-foreground font-semibold block mb-1">From Date</span>
                        <Input
                          type="date"
                          value={startDate}
                          onChange={(e) => {
                            setPage(1);
                            setStartDate(e.target.value);
                          }}
                          className="h-8 text-xs font-semibold rounded-xl border-border/70 bg-background"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-muted-foreground font-semibold block mb-1">To Date</span>
                        <Input
                          type="date"
                          value={endDate}
                          onChange={(e) => {
                            setPage(1);
                            setEndDate(e.target.value);
                          }}
                          className="h-8 text-xs font-semibold rounded-xl border-border/70 bg-background"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Quick Presets */}
                  <div className="space-y-2 pt-1 border-t border-border/40">
                    <Label className="text-[10px] font-extrabold text-muted-foreground uppercase">Quick Presets</Label>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const today = new Date().toISOString().slice(0, 10);
                          setStartDate(today);
                          setEndDate(today);
                          setPage(1);
                        }}
                        className="h-7 text-[11px] font-bold rounded-xl flex-1"
                      >
                        Today
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const yesterday = new Date();
                          yesterday.setDate(yesterday.getDate() - 1);
                          const iso = yesterday.toISOString().slice(0, 10);
                          setStartDate(iso);
                          setEndDate(iso);
                          setPage(1);
                        }}
                        className="h-7 text-[11px] font-bold rounded-xl flex-1"
                      >
                        Yesterday
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const now = new Date();
                          const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
                          const today = now.toISOString().slice(0, 10);
                          setStartDate(firstDay);
                          setEndDate(today);
                          setPage(1);
                        }}
                        className="h-7 text-[11px] font-bold rounded-xl flex-1"
                      >
                        This Month
                      </Button>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>

            {/* Premium Insights Dashboard */}
            {(startDate || endDate) && (
              <div className="mt-4 border border-border/70 rounded-2xl overflow-hidden glass bg-card/35 backdrop-blur-xl shadow-lg transition-all duration-700 ease-in-out">
                {insightsLoading ? (
                  <div className="p-10 flex flex-col items-center justify-center space-y-4 bg-muted/20 animate-pulse min-h-[250px]">
                    <div className="relative">
                      <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full"></div>
                      <Loader2 className="w-10 h-10 animate-spin text-primary relative z-10" />
                    </div>
                    <p className="text-sm font-semibold text-primary/80 animate-bounce">
                      Generating Deep Insights...
                    </p>
                  </div>
                ) : insightsData ? (
                  <div className="animate-in fade-in slide-in-from-top-4 duration-700">
                    <div className="p-6 border-b border-border/50 flex justify-between items-center bg-gradient-to-r from-primary/5 to-transparent">
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-primary/10 rounded-xl">
                          <BarChart3 className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <h3 className="text-base font-extrabold tracking-tight">
                            Period Analytics
                          </h3>
                          <p className="text-xs text-muted-foreground/80 font-medium">
                            {startDate || "Start"} to {endDate || "End"}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleDownloadInsights}
                        className="gap-2 border-border/80 hover:bg-muted rounded-xl text-xs font-bold h-9"
                      >
                        <Download className="w-4 h-4" /> Download Report
                      </Button>
                    </div>

                    <div className="p-6">
                      {/* Top Metrics Row */}
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                        <div className="p-5 rounded-2xl border border-border/70 glass bg-card/45 shadow-sm relative overflow-hidden group hover:border-primary/40 transition-all duration-300">
                          <div className="absolute top-0 right-0 w-20 h-20 bg-primary/5 rounded-full -mr-10 -mt-10 blur-xl group-hover:bg-primary/10 transition-colors"></div>
                          <p className="text-xs font-bold text-muted-foreground tracking-widest uppercase mb-1.5">
                            Total Revenue
                          </p>
                          <p className="text-3xl font-black text-foreground tracking-tight">
                            ₹
                            {insightsData.summary.total_revenue?.toFixed(2) ||
                              "0.00"}
                          </p>
                          <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1 font-medium">
                            <Receipt className="w-3.5 h-3.5 opacity-70" /> From{" "}
                            <span className="font-semibold text-foreground">{insightsData.summary.total_bills}</span> bills
                          </p>
                        </div>

                        <div className="p-5 rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 to-transparent shadow-sm relative overflow-hidden group hover:border-emerald-500/40 transition-all duration-300">
                          <div className="absolute top-0 right-0 w-20 h-20 bg-emerald-500/10 rounded-full -mr-10 -mt-10 blur-xl group-hover:bg-emerald-500/20 transition-colors"></div>
                          <p className="text-xs font-bold text-emerald-700/80 dark:text-emerald-400/80 tracking-widest uppercase mb-1.5">
                            Net Profit
                          </p>
                          <p className="text-3xl font-black text-emerald-600 dark:text-emerald-500 tracking-tight">
                            ₹
                            {insightsData.summary.total_profit?.toFixed(2) ||
                              "0.00"}
                          </p>
                          <p className="text-xs text-emerald-700/70 dark:text-emerald-400/70 mt-2 flex items-center gap-1 font-semibold">
                            <TrendingUp className="w-3.5 h-3.5" />{" "}
                            {(
                              (insightsData.summary.total_profit /
                                (insightsData.summary.total_revenue || 1)) *
                              100
                            ).toFixed(1)}
                            % Margin
                          </p>
                        </div>

                        <div className="p-5 rounded-2xl border border-red-500/20 bg-gradient-to-br from-red-500/5 to-transparent shadow-sm relative overflow-hidden group hover:border-red-500/40 transition-all duration-300">
                          <div className="absolute top-0 right-0 w-20 h-20 bg-red-500/10 rounded-full -mr-10 -mt-10 blur-xl group-hover:bg-red-500/20 transition-colors"></div>
                          <p className="text-xs font-bold text-red-700/80 dark:text-red-400/80 tracking-widest uppercase mb-1.5">
                            Unpaid Debt
                          </p>
                          <p className="text-3xl font-black text-red-600 dark:text-red-500 tracking-tight">
                            ₹
                            {insightsData.summary.unpaid_amount?.toFixed(2) ||
                              "0.00"}
                          </p>
                          <p className="text-xs text-red-700/70 dark:text-red-400/70 mt-2 flex items-center gap-1 font-semibold">
                            <AlertCircle className="w-3.5 h-3.5" /> Across{" "}
                            <span className="font-extrabold">{insightsData.summary.unpaid_bills}</span> unpaid bills
                          </p>
                        </div>

                        <div className="p-5 rounded-2xl border border-blue-500/20 bg-gradient-to-br from-blue-500/5 to-transparent shadow-sm relative overflow-hidden group hover:border-blue-500/40 transition-all duration-300">
                          <div className="absolute top-0 right-0 w-20 h-20 bg-blue-500/10 rounded-full -mr-10 -mt-10 blur-xl group-hover:bg-blue-500/20 transition-colors"></div>
                          <p className="text-xs font-bold text-blue-700/80 dark:text-blue-400/80 tracking-widest uppercase mb-1.5">
                            Total Bills
                          </p>
                          <p className="text-3xl font-black text-blue-600 dark:text-blue-500 tracking-tight">
                            {insightsData.summary.total_bills}
                          </p>
                          <p className="text-xs text-blue-700/70 dark:text-blue-400/70 mt-2 flex items-center gap-1 font-semibold">
                            <Check className="w-3.5 h-3.5" /> Successfully Generated
                          </p>
                        </div>
                      </div>

                      {/* Top 10 Products Row */}
                      {insightsData.top_products?.length > 0 && (
                        <div>
                          <h4 className="text-xs font-bold tracking-widest uppercase text-muted-foreground/80 mb-4">
                            Top Grossing Products
                          </h4>
                          <div className="border border-border/70 rounded-2xl overflow-hidden glass bg-card/20">
                            <Table mobileCards>
                              <TableHeader className="bg-muted/40">
                                <TableRow>
                                  <TableHead data-card="hide" className="w-12 text-center text-xs font-bold text-muted-foreground uppercase tracking-wider">
                                    #
                                  </TableHead>
                                  <TableHead data-card="title" className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Product Name</TableHead>
                                  <TableHead className="text-center text-xs font-bold text-muted-foreground uppercase tracking-wider">
                                    Units Sold
                                  </TableHead>
                                  <TableHead className="text-right text-xs font-bold text-muted-foreground uppercase tracking-wider">
                                    Revenue
                                  </TableHead>
                                  <TableHead className="text-right text-xs font-bold text-muted-foreground uppercase tracking-wider">
                                    Profit Contribution
                                  </TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {insightsData.top_products.map((p, idx) => (
                                  <TableRow
                                    key={idx}
                                    className="hover:bg-muted/10 border-b border-border/40 transition-colors"
                                  >
                                    <TableCell className="font-bold text-muted-foreground/70 text-center">
                                      {idx + 1}
                                    </TableCell>
                                    <TableCell className="font-bold text-foreground">
                                      {p.name}
                                    </TableCell>
                                    <TableCell className="text-center">
                                      <Badge
                                        variant="outline"
                                        className="bg-primary/5 text-primary border-primary/20 rounded-md font-bold px-2 py-0.5"
                                      >
                                        {p.quantity} units
                                      </Badge>
                                    </TableCell>
                                    <TableCell className="text-right font-mono font-bold">
                                      ₹{p.revenue?.toFixed(2)}
                                    </TableCell>
                                    <TableCell className="text-right">
                                      <div className="flex flex-col items-end gap-1.5">
                                        <span className="font-mono font-bold text-emerald-600 dark:text-emerald-500">
                                          ₹{p.profit?.toFixed(2)}
                                        </span>
                                        <div className="h-1.5 w-20 bg-muted rounded-full overflow-hidden">
                                          <div
                                            className="h-full bg-emerald-500 rounded-full"
                                            style={{
                                              width: `${Math.max(10, (p.profit / insightsData.summary.total_profit) * 100)}%`,
                                            }}
                                          ></div>
                                        </div>
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            )}
        </div>
      )}

      {!showNewBill && !editingBillId && activeViewTab === "drafts" && (
        <Card className="data-table glass bg-card/45 backdrop-blur-xl border border-border/70 shadow-lg rounded-2xl overflow-hidden mt-3">
          <CardHeader className="p-4 bg-muted/30 border-b border-border/50 flex flex-row items-center justify-between space-y-0">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-orange-500" />
              <CardTitle className="text-sm font-extrabold">Draft Bills Queue ({drafts.length})</CardTitle>
            </div>
            <p className="text-xs text-muted-foreground font-medium hidden sm:block">
              Click "Complete Bill" to open in Manual Bill Creation layout and finalize checkout
            </p>
          </CardHeader>
          <CardContent className="p-0">
            {draftsLoading ? (
              <div className="p-12 text-center flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : drafts.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground space-y-2">
                <FileText className="w-10 h-10 mx-auto text-muted-foreground/30" />
                <p className="text-sm font-bold text-foreground">No pending draft bills found</p>
                <p className="text-xs text-muted-foreground">Scan products from "Scan for Bill" page to create draft bills.</p>
              </div>
            ) : (
              <Table mobileCards>
                <TableHeader className="bg-muted/40">
                  <TableRow className="border-b border-border/60">
                    <TableHead data-card="title" className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Draft No / Timestamp</TableHead>
                    <TableHead className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Customer Name</TableHead>
                    <TableHead className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Items</TableHead>
                    <TableHead className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Est. Amount</TableHead>
                    <TableHead data-card="actions" className="text-right text-xs font-bold text-muted-foreground uppercase tracking-wider">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {drafts.map((d) => {
                    const itemCount = d.items?.length || 0;
                    const totalEst = (d.items || []).reduce((sum, i) => sum + (parseFloat(i.unit_price || i.mrp || 0) * (parseInt(i.quantity) || 1)), 0);
                    return (
                      <TableRow key={d.id} className="hover:bg-muted/30 border-b border-border/40">
                        <TableCell>
                          <div className="font-black text-xs text-orange-600 dark:text-orange-400">{d.draft_no}</div>
                          <div className="text-[10px] text-muted-foreground font-mono">{formatDate(d.created_at || d.billing_date)}</div>
                        </TableCell>
                        <TableCell>
                          <div className="font-extrabold text-xs text-foreground">{d.customer_name || "Walk-in Customer"}</div>
                          {d.customer_mobile && <div className="text-[10px] text-muted-foreground font-mono">{d.customer_mobile}</div>}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px] font-extrabold border-orange-500/30 text-orange-600 bg-orange-500/10">
                            {itemCount} item(s)
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono font-black text-xs">
                          ₹{totalEst.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="sm"
                              onClick={() => handleLoadDraftToBill(d)}
                              className="h-8 px-3 text-xs font-black bg-orange-600 hover:bg-orange-700 text-white rounded-xl shadow-xs cursor-pointer"
                            >
                              <ChevronRight className="w-3.5 h-3.5 mr-1" /> Complete Bill
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleDeleteDraft(d.id)}
                              className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-xl"
                              title="Delete Draft"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {!showNewBill && !editingBillId && activeViewTab !== "drafts" && (
        <Card className="data-table glass bg-card/45 backdrop-blur-xl border border-border/70 shadow-lg rounded-2xl overflow-hidden mt-3">
          <div className="overflow-x-auto">
            <Table mobileCards>
              <TableHeader className="bg-muted/40">
                <TableRow className="border-b border-border/60">
                  <TableHead className="w-12" data-card="corner"></TableHead>
                  <TableHead className="text-xs font-bold text-muted-foreground uppercase tracking-wider" data-card="title">Bill No / Dates</TableHead>
                  <TableHead className="text-xs font-bold text-muted-foreground uppercase tracking-wider" data-card="full">Customer</TableHead>
                  <TableHead className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Items</TableHead>
                  <TableHead className="text-right text-xs font-bold text-muted-foreground uppercase tracking-wider">Amount</TableHead>
                  <TableHead className="text-right text-xs font-bold text-muted-foreground uppercase tracking-wider">Profit</TableHead>
                  <TableHead className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Status</TableHead>
                  <TableHead className="text-center text-xs font-bold text-muted-foreground uppercase tracking-wider" data-card="actions">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody data-rows className={tableLoading ? "opacity-50 pointer-events-none transition-opacity duration-200" : "transition-opacity duration-200"}>
                {bills.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="text-center py-12 text-muted-foreground"
                    >
                      <Receipt className="w-12 h-12 mx-auto mb-3 opacity-30 animate-pulse text-primary" />
                      <p className="text-base font-bold">No bills found</p>
                      <p className="text-xs opacity-70">Adjust filters or create a new bill to begin.</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  bills.map((bill, index) => {
                    const isExpanded = expandedBills[bill.id];
                    const billTotal = bill.grand_total || bill.total_amount || 0;
                    const serialNum = totalBills - ((page - 1) * limit + index);
                    return (
                      <React.Fragment key={bill.id}>
                        <TableRow
                          id={`record-${bill.id}`}
                          data-testid={`bill-row-${bill.id}`}
                          data-row
                          tabIndex={0}
                          aria-expanded={!!isExpanded}
                          className={`cursor-pointer hover:bg-muted/30 transition-all border-b border-border/40 ${isExpanded ? "bg-muted/10" : ""}`}
                          onClick={() => toggleBillExpand(bill.id)}
                        >
                          <TableCell className="w-12 text-center">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 rounded-xl hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-all duration-200"
                            >
                              {isExpanded ? (
                                <ChevronUp className="h-4 w-4" />
                              ) : (
                                <ChevronDown className="h-4 w-4" />
                              )}
                            </Button>
                          </TableCell>
                          <TableCell className="font-mono text-sm text-foreground py-2.5">
                            <div className="font-bold">#{serialNum} - {bill.bill_no}</div>
                            <RecordDates date={bill.billing_date} createdAt={bill.created_at} dateLabel="Billed" />
                          </TableCell>

                          <TableCell className="py-3">
                            <p className="font-bold text-sm text-foreground">{bill.customer_name}</p>
                            <p className="text-xs text-muted-foreground font-mono">
                              {bill.customer_mobile}
                            </p>
                            {bill.doctor && (
                              <p className="text-xs text-primary/80 font-semibold mt-0.5">
                                Dr: {bill.doctor}
                              </p>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 rounded-md font-bold text-xs">
                              {bill.items?.length || 0} items
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono text-foreground font-extrabold">
                            ₹{billTotal.toFixed(2)}
                          </TableCell>
                          <TableCell
                            className={`text-right font-mono font-bold ${
                              bill.profit >= 0 ? "text-emerald-600 dark:text-emerald-500" : "text-destructive"
                            }`}
                          >
                            ₹{(Number(bill.profit) || 0).toFixed(2)}
                          </TableCell>

                          <TableCell className="text-center">
                            <div className="flex flex-col items-center gap-1 justify-center">
                              {bill.is_paid ? (
                                <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20 rounded-full font-bold px-2.5 py-0.5 text-xs transition-colors">
                                  Paid
                                </Badge>
                              ) : (
                                <Badge className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 hover:bg-amber-500/20 rounded-full font-bold px-2.5 py-0.5 text-xs transition-colors">
                                  Unpaid
                                </Badge>
                              )}
                              {bill.is_advance_paid && (
                                <Badge className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20 rounded-full font-bold px-2.5 py-0.5 text-[10px] whitespace-nowrap">
                                  Advance Paid
                                </Badge>
                              )}
                            </div>
                            {bill.payment_mode && bill.payment_mode !== "none" && (
                              <div className="text-[10px] text-muted-foreground/80 mt-1 font-bold uppercase tracking-wider flex items-center justify-center gap-1.5">
                                {getPaymentModeIcon(bill.payment_mode, "w-3.5 h-3.5")}
                                <span>{bill.payment_mode}</span>
                              </div>
                            )}
                          </TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <div className="flex justify-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleStartEditBill(bill)}
                                title="Edit Bill (E)"
                                data-row-key="e"
                                className="h-8 w-8 rounded-xl hover:bg-amber-500/10 text-muted-foreground hover:text-amber-600 transition-all duration-200"
                                data-testid={`edit-bill-${bill.id}`}
                              >
                                <Edit2 className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleGeneratePdf(bill.id)}
                                title="Generate PDF (P)"
                                data-row-key="p"
                                className="h-8 w-8 rounded-xl hover:bg-primary/10 text-muted-foreground hover:text-primary transition-all duration-200"
                                data-testid={`pdf-btn-${bill.id}`}
                              >
                                <FileText className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => whatsApp.share(bill)}
                                disabled={whatsApp.busyId === bill.id}
                                title={`${bill.customer_mobile ? `Send on WhatsApp to ${bill.customer_mobile}` : "Send on WhatsApp"} (W)`}
                                data-row-key="w"
                                aria-label="Send bill on WhatsApp"
                                className="h-8 w-8 rounded-xl hover:bg-[#25D366]/10 text-muted-foreground hover:text-[#1da851] transition-all duration-200"
                                data-testid={`whatsapp-bill-${bill.id}`}
                              >
                                {whatsApp.busyId === bill.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <WhatsAppIcon className="w-4 h-4" />}
                              </Button>
                              {!bill.is_paid && (() => {
                                const paid = bill.total_paid !== undefined ? Number(bill.total_paid) || 0 : Number(bill.advance_amount) || 0;
                                const due = Math.max(0, Math.round((billTotal - paid) * 100) / 100);
                                return due >= 1 ? (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setUpiQr({ amount: due, note: bill.bill_no, auto: true })}
                                    title={`UPI QR for the ₹${due.toFixed(2)} due (Q)`}
                                    data-row-key="q"
                                    aria-label="UPI QR for the amount due"
                                    className="h-8 w-8 rounded-xl hover:bg-orange-500/10 text-muted-foreground hover:text-orange-600 transition-all duration-200"
                                    data-testid={`upi-qr-bill-${bill.id}`}
                                  >
                                    <QrCode className="w-4 h-4" />
                                  </Button>
                                ) : null;
                              })()}
                              {!bill.is_paid && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleMarkPaid(bill.id)}
                                  title="Mark as Paid (M)"
                                  data-row-key="m"
                                  className="h-8 w-8 rounded-xl hover:bg-emerald-500/10 text-muted-foreground hover:text-emerald-600 transition-all duration-200"
                                  data-testid={`mark-paid-btn-${bill.id}`}
                                >
                                  <Check className="w-4 h-4" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() =>
                                  setDeleteDialog({ open: true, bill })
                                }
                                title="Delete Bill (Del)"
                                data-row-key="delete"
                                className="h-8 w-8 rounded-xl hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all duration-200"
                                data-testid={`delete-bill-btn-${bill.id}`}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                        {/* Expanded Items Row */}
                        {isExpanded && bill.items && bill.items.length > 0 && (
                          <TableRow className="bg-muted/15 border-b border-border/40">
                            <TableCell colSpan={8} className="p-0">
                              <div className="p-6 pl-12 max-md:p-3">
                                <p className="text-xs font-bold text-muted-foreground/80 uppercase tracking-wider mb-3">
                                  Items Sold
                                </p>
                                <div className="border border-border/50 rounded-xl overflow-hidden bg-background/30">
                                  <Table mobileCards>
                                    <TableHeader className="bg-muted/40">
                                      <TableRow className="border-b border-border/40">
                                        <TableHead data-card="title" className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                                          Product
                                        </TableHead>
                                        <TableHead className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                                          Batch
                                        </TableHead>
                                        <TableHead className="text-xs font-bold text-center text-muted-foreground uppercase tracking-wider">
                                          Qty (Units)
                                        </TableHead>
                                        <TableHead className="text-xs font-bold text-right text-amber-600 dark:text-amber-400 bg-amber-500/5 dark:bg-amber-500/10 uppercase tracking-wider">
                                          Rate/Unit (MRP)
                                        </TableHead>
                                        <TableHead className="text-xs font-bold text-center text-muted-foreground uppercase tracking-wider">
                                          Disc%
                                        </TableHead>
                                        <TableHead className="text-xs font-bold text-center text-muted-foreground uppercase tracking-wider">
                                          CGST %
                                        </TableHead>
                                        <TableHead className="text-xs font-bold text-center text-muted-foreground uppercase tracking-wider">
                                          SGST %
                                        </TableHead>
                                        <TableHead className="text-xs font-bold text-right text-muted-foreground uppercase tracking-wider">
                                          Total
                                        </TableHead>
                                        <TableHead className="text-xs font-bold text-right text-muted-foreground uppercase tracking-wider">
                                          Profit
                                        </TableHead>
                                        <TableHead data-card-label="Short book" className="text-xs font-bold text-center text-muted-foreground uppercase tracking-wider">
                                          Short book
                                        </TableHead>
                                        {bill.is_advance_paid && (
                                          <TableHead className="text-xs font-bold text-center text-muted-foreground uppercase tracking-wider">
                                            Delivery
                                          </TableHead>
                                        )}
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {bill.items.map((item, idx) => {
                                        const unitPrice =
                                          item.unit_price || item.mrp_per_unit || 0;
                                        const qty =
                                          item.quantity || item.sold_units || 1;
                                        const discPercent =
                                          item.discount_percent || 0;
                                        const itemTotal =
                                          item.total ||
                                          item.item_total ||
                                          qty * unitPrice * (1 - discPercent / 100);
                                        return (
                                          <TableRow
                                            key={`${bill.id}-item-${idx}`}
                                            className={`border-b border-border/40 hover:bg-muted/20 transition-colors ${item.is_manual ? "bg-amber-500/5 text-amber-900/80 dark:text-amber-200/80" : ""}`}
                                          >
                                            <TableCell className="text-sm font-semibold">
                                              {item.product_name}
                                              {item.is_manual && (
                                                <Badge
                                                  variant="outline"
                                                  className="ml-2 bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 text-[10px] font-extrabold rounded px-1.5 py-0"
                                                >
                                                  Manual
                                                </Badge>
                                              )}
                                            </TableCell>
                                            <TableCell className="text-xs font-mono font-semibold text-muted-foreground/80">
                                              {item.batch_no || "-"}
                                            </TableCell>
                                            <TableCell className="text-sm font-bold text-center text-foreground">
                                              {qty}
                                            </TableCell>
                                            <TableCell className="text-sm font-mono text-right font-bold text-amber-600 dark:text-amber-400 bg-amber-500/5 dark:bg-amber-500/10">
                                              ₹{unitPrice.toFixed(2)}
                                            </TableCell>
                                            <TableCell className="text-sm text-center font-bold text-muted-foreground">
                                              {discPercent}%
                                            </TableCell>
                                            <TableCell className="text-sm text-center font-mono font-semibold text-muted-foreground">
                                              {item.cgst !== undefined ? `${item.cgst}%` : "0%"}
                                            </TableCell>
                                            <TableCell className="text-sm text-center font-mono font-semibold text-muted-foreground">
                                              {item.sgst !== undefined ? `${item.sgst}%` : "0%"}
                                            </TableCell>
                                            <TableCell className="text-sm text-right font-mono font-bold text-foreground">
                                              ₹{itemTotal.toFixed(2)}
                                            </TableCell>
                                            <TableCell
                                              className={`text-sm text-right font-mono font-bold ${
                                                item.profit >= 0
                                                  ? "text-emerald-600 dark:text-emerald-500"
                                                  : "text-destructive"
                                              }`}
                                            >
                                              ₹{item.profit.toFixed(2)}
                                            </TableCell>
                                            <TableCell className="text-center">
                                              {item.short_book ? (
                                                <button
                                                  type="button"
                                                  onClick={() => navigate("/short-book")}
                                                  className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400"
                                                  title={`Added ${new Date(item.short_book.added_at).toLocaleDateString("en-IN")} · open Short Book`}
                                                >
                                                  <Check className="h-3 w-3" /> {item.short_book.quantity} {item.short_book.unit}
                                                </button>
                                              ) : (
                                                <Button
                                                  variant="outline"
                                                  size="sm"
                                                  onClick={() =>
                                                    setShortBookFor({
                                                      bill,
                                                      line: idx,
                                                      item,
                                                      quantity: item.units_per_pack > 1 ? String(Math.max(1, Math.ceil(qty / item.units_per_pack))) : String(qty),
                                                      unit: item.units_per_pack > 1 ? "packs" : "units",
                                                      notes: "",
                                                    })
                                                  }
                                                  className="h-7 rounded-lg px-2 text-[11px] font-bold"
                                                  title="Note this medicine to reorder"
                                                >
                                                  <Plus className="mr-1 h-3 w-3" /> Short book
                                                </Button>
                                              )}
                                            </TableCell>
                                            {bill.is_advance_paid && (
                                              <TableCell className="text-center">
                                                {item.delivery_status === "Delivered" ? (
                                                  <Badge className="bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 font-bold rounded-full py-0.5 px-2">
                                                    ✓ Delivered
                                                  </Badge>
                                                ) : (
                                                  <div className="flex justify-center items-center gap-1.5">
                                                    <Badge className="bg-yellow-500/10 text-yellow-600 border border-yellow-500/20 font-bold rounded-full py-0.5 px-2 animate-pulse">
                                                      Pending
                                                    </Badge>
                                                    <Button
                                                      variant="outline"
                                                      size="xs"
                                                      className="h-6 text-[10px] font-bold border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10 rounded-lg py-0 px-2 transition-all"
                                                      onClick={() => handleUpdateItemDelivery(bill.id, idx, "Delivered")}
                                                    >
                                                      Deliver
                                                    </Button>
                                                  </div>
                                                )}
                                              </TableCell>
                                            )}
                                          </TableRow>
                                        );
                                      })}
                                    </TableBody>
                                  </Table>
                                </div>
                                <div className="mt-3 pt-3 border-t border-border/40 flex flex-col md:flex-row justify-between items-start md:items-center gap-3 text-sm">
                                   <div className="space-y-1">
                                     {bill.doctor && (
                                       <p className="text-xs font-bold text-foreground">
                                         Prescribing Doctor: <span className="text-primary font-extrabold">{bill.doctor}</span>
                                       </p>
                                     )}
                                     {(bill.negative_billed_qty > 0 ||
                                       bill.items?.some((i) => i.is_manual)) && (
                                      <span className="text-amber-600 dark:text-amber-400 text-xs font-semibold flex items-center gap-1">
                                        <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 inline" />{" "}
                                        {bill.inventory_billed_qty ||
                                          bill.items
                                            ?.filter((i) => !i.is_manual)
                                            .reduce(
                                              (s, i) => s + i.quantity,
                                              0
                                            ) ||
                                          0}{" "}
                                        from inventory,{" "}
                                        {bill.negative_billed_qty ||
                                          bill.items
                                            ?.filter((i) => i.is_manual)
                                            .reduce(
                                              (s, i) => s + i.quantity,
                                              0
                                            ) ||
                                          0}{" "}
                                        negatively billed
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex gap-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                                    <span>
                                      Subtotal:{" "}
                                      <span className="font-mono text-foreground text-sm font-bold normal-case">
                                        ₹{(bill.subtotal || billTotal).toFixed(2)}
                                      </span>
                                    </span>
                                    {(bill.discount_amount || 0) > 0 && (
                                      <span>
                                        Discount:{" "}
                                        <span className="font-mono text-destructive text-sm font-bold normal-case">
                                          -₹{bill.discount_amount.toFixed(2)}
                                        </span>
                                      </span>
                                    )}
                                    <span>
                                      Grand Total:{" "}
                                      <span className="font-mono text-primary text-sm font-extrabold normal-case">
                                        ₹{billTotal.toFixed(2)}
                                      </span>
                                    </span>
                                  </div>
                                </div>

                                {/* Advance Paid Summary, Payments Timeline and Edit History */}
                                {bill.is_advance_paid && (() => {
                                  const currentPaid = bill.total_paid !== undefined ? bill.total_paid : (bill.is_paid ? billTotal : (bill.advance_amount || 0));
                                  const deliveredValue = (bill.items || []).reduce((sum, item) => item.delivery_status === "Delivered" ? sum + (item.item_total || 0) : sum, 0);
                                  const remainingUnpaid = Math.max(0, billTotal - currentPaid);
                                  return (
                                    <div className="mt-4 p-4 bg-muted/40 rounded-xl border border-border/60 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 w-full">
                                      <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                          <span className="text-xs font-bold text-muted-foreground uppercase">Delivery Status:</span>
                                          <Badge className={`font-bold rounded-full py-0.5 px-2.5 text-xs ${
                                            bill.delivery_status === "Delivered" 
                                              ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20" 
                                              : (bill.delivery_status === "Partially Delivered" ? "bg-blue-500/10 text-blue-500 border border-blue-500/20" : "bg-yellow-500/10 text-yellow-600 border border-yellow-500/20 animate-pulse")
                                          }`}>
                                            {bill.delivery_status}
                                          </Badge>
                                        </div>
                                        <p className="text-xs font-medium text-muted-foreground">
                                          Delivered value: ₹{deliveredValue.toFixed(2)} of ₹{billTotal.toFixed(2)}
                                        </p>
                                      </div>
                                      <div className="flex flex-col md:flex-row items-stretch md:items-center gap-4">
                                        <div className="text-right">
                                          <p className="text-xs font-bold text-muted-foreground uppercase">Remaining to Pay</p>
                                          <p className={`text-base font-mono font-extrabold ${remainingUnpaid > 0 ? "text-red-500" : "text-emerald-500"}`}>
                                            ₹{remainingUnpaid.toFixed(2)}
                                          </p>
                                        </div>
                                        {remainingUnpaid > 0 && (
                                          <Button
                                            size="sm"
                                            onClick={() => setRecordPaymentDialog({
                                              open: true,
                                              billId: bill.id,
                                              billNo: bill.bill_no,
                                              remainingUnpaid: remainingUnpaid,
                                              amount: remainingUnpaid.toFixed(2),
                                              paymentMode: "Cash"
                                            })}
                                            className="rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold h-9 px-4 shadow-md shadow-emerald-500/10 transition-all hover:scale-[1.02] active:scale-[0.98]"
                                          >
                                            Record Payment
                                          </Button>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })()}

                                {/* Payments Timeline */}
                                {bill.is_advance_paid && (
                                  <div className="mt-4 p-4 rounded-xl bg-card border border-border/50 shadow-sm space-y-3">
                                    <h4 className="font-bold text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                                      <CreditCard className="w-3.5 h-3.5 text-primary" />
                                      Payment Timeline
                                    </h4>
                                    <div className="space-y-4">
                                      {/* Initial Advance Payment */}
                                      <div className="flex relative pl-5 before:absolute before:left-[7px] before:top-2 before:bottom-[-20px] last:before:hidden before:w-[2px] before:bg-muted-foreground/20 text-xs">
                                        <div className="absolute left-0 top-1.5 w-[16px] h-[16px] rounded-full bg-primary/20 flex items-center justify-center ring-4 ring-background">
                                          <div className="w-[8px] h-[8px] rounded-full bg-primary"></div>
                                        </div>
                                        <div className="flex justify-between items-center text-[11px] text-muted-foreground font-semibold w-full">
                                          <div>
                                            <p className="text-foreground/90 font-bold text-sm">₹{(bill.advance_amount || 0).toFixed(2)}</p>
                                            <p className="text-[10px] text-muted-foreground/80 font-semibold uppercase mt-0.5">{bill.payment_mode || "Cash"} • Advance Paid</p>
                                          </div>
                                          <span className="font-mono">{new Date(bill.created_at || bill.billing_date).toLocaleString("en-IN", {
                                            day: "2-digit",
                                            month: "short",
                                            hour: "2-digit",
                                            minute: "2-digit",
                                            hour12: true
                                          })}</span>
                                        </div>
                                      </div>

                                      {/* Subsequent Payments */}
                                      {bill.payments && bill.payments.map((pmt, pIdx) => (
                                        <div key={pIdx} className="flex relative pl-5 before:absolute before:left-[7px] before:top-2 before:bottom-[-20px] last:before:hidden before:w-[2px] before:bg-muted-foreground/20 text-xs">
                                          <div className="absolute left-0 top-1.5 w-[16px] h-[16px] rounded-full bg-primary/20 flex items-center justify-center ring-4 ring-background">
                                            <div className="w-[8px] h-[8px] rounded-full bg-primary"></div>
                                          </div>
                                          <div className="flex justify-between items-center text-[11px] text-muted-foreground font-semibold w-full">
                                            <div>
                                              <p className="text-foreground/90 font-bold text-sm">₹{(pmt.amount || 0).toFixed(2)}</p>
                                              <p className="text-[10px] text-muted-foreground/80 font-semibold uppercase mt-0.5">{pmt.payment_mode || "Cash"} • Subsequent Payment</p>
                                            </div>
                                            <span className="font-mono">{new Date(pmt.paid_at).toLocaleString("en-IN", {
                                              day: "2-digit",
                                              month: "short",
                                              hour: "2-digit",
                                              minute: "2-digit",
                                              hour12: true
                                            })}</span>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* Edit History Section */}
                                {bill.history && bill.history.length > 0 && (
                                  <div className="mt-4 p-4 rounded-xl bg-muted/20 border border-border/60 shadow-sm space-y-3">
                                    <h4 className="font-bold text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                                      <History className="w-3.5 h-3.5 text-amber-500" />
                                      Bill Edit History ({bill.history.length})
                                    </h4>
                                    <div className="space-y-4 max-h-60 overflow-y-auto pr-1">
                                      {bill.history.map((hist, hIdx) => {
                                        const name = hist.updated_by_name || "Unknown User";
                                        const initial = name.charAt(0).toUpperCase();
                                        return (
                                          <div key={hIdx} className="flex gap-3 text-xs border-b border-border/30 pb-3 last:border-0 last:pb-0">
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
                                                <span className="text-foreground/95 font-bold">{name}</span>
                                                <span className="font-mono">
                                                  {new Date(hist.updated_at).toLocaleString("en-IN", {
                                                    day: "2-digit",
                                                    month: "short",
                                                    year: "numeric",
                                                    hour: "2-digit",
                                                    minute: "2-digit",
                                                    hour12: true
                                                  })}
                                                </span>
                                              </div>
                                              <div className="space-y-1 text-foreground/80 font-medium">
                                                {hist.changes.map((ch, cIdx) => (
                                                  <div key={cIdx} className="bg-background/50 px-3 py-1.5 rounded-xl border border-border/40 text-[11px]">
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
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination matched to InventoryPage */}
          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-6 py-4 border-t border-border/40 bg-muted/5">
              <div className="text-xs font-bold text-muted-foreground/80 sm:w-1/3 text-left">
                Showing {((page - 1) * limit) + 1} to {Math.min(page * limit, totalBills)} of {totalBills} bills
              </div>
              
              <div className="flex items-center justify-center gap-2 sm:w-1/3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((prev) => prev - 1)}
                  disabled={page <= 1}
                  className="h-8 text-xs font-bold border-border/80 hover:bg-muted rounded-lg"
                >
                  <ChevronLeft className="h-3.5 w-3.5 mr-1 text-primary" />
                  Previous
                </Button>
                
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const pageNum = Math.max(1, Math.min(totalPages - 4, page - 2)) + i;
                    if (pageNum > totalPages) return null;
                    return (
                      <Button
                        key={pageNum}
                        variant={pageNum === page ? "default" : "outline"}
                        size="sm"
                        onClick={() => setPage(pageNum)}
                        className={`w-8 h-8 p-0 text-xs font-bold rounded-lg border ${
                          pageNum === page
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
                  onClick={() => setPage((prev) => prev + 1)}
                  disabled={page >= totalPages}
                  className="h-8 text-xs font-bold border-border/80 hover:bg-muted rounded-lg"
                >
                  Next
                  <ChevronRight className="h-3.5 w-3.5 ml-1 text-primary" />
                </Button>
              </div>

              <div className="hidden sm:block sm:w-1/3 text-right text-xs font-bold text-muted-foreground/60">
                Page {page} of {totalPages}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Delete Dialog */}
      <AlertDialog
        open={deleteDialog.open}
        onOpenChange={(open) =>
          setDeleteDialog({ open, bill: open ? deleteDialog.bill : null })
        }
      >
        <AlertDialogContent className="glass bg-card/95 backdrop-blur-xl border border-border/80 shadow-2xl rounded-2xl p-6">
          <AlertDialogHeader className="space-y-3">
            <AlertDialogTitle className="text-xl font-bold flex items-center gap-2 text-destructive">
              <AlertCircle className="w-5 h-5 text-destructive animate-pulse" />
              Delete Bill
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-muted-foreground/90 font-medium leading-relaxed">
              Are you sure you want to delete bill <span className="font-mono font-bold text-foreground">{deleteDialog.bill?.bill_no}</span>? This action is permanent.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row flex-wrap sm:justify-end gap-2 mt-4">
            <AlertDialogCancel className="rounded-xl border-border/80 hover:bg-muted/80 h-10 px-4 transition-all">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleDeleteBill(deleteDialog.bill?.id, false)}
              className="rounded-xl border border-destructive/30 bg-destructive/15 text-destructive hover:bg-destructive/25 h-10 px-4 font-semibold transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              Delete Only
            </AlertDialogAction>
            <AlertDialogAction
              onClick={() => handleDeleteBill(deleteDialog.bill?.id, true)}
              className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-md shadow-destructive/10 h-10 px-4 font-semibold transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              Delete & Restore Inventory
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={pdfConfirmDialog.open}
        onOpenChange={(open) => {
          if (!open && pdfConfirmDialog.open) {
            // Only process cleanup if it was open and is now closing
            setPdfConfirmDialog({ open: false, billId: null });
            handleCancelNewBill();
            fetchData();
          } else {
            setPdfConfirmDialog({ ...pdfConfirmDialog, open });
          }
        }}
      >
        <AlertDialogContent
          className="glass bg-card/95 backdrop-blur-xl border border-border/80 shadow-2xl rounded-2xl p-6"
          onCloseAutoFocus={(e) => {
            // Next customer: Enter on New Bill
            e.preventDefault();
            setTimeout(() => document.querySelector('[data-testid="new-bill-btn"]')?.focus(), 50);
          }}
        >
          <AlertDialogHeader className="space-y-3">
            <AlertDialogTitle className="text-xl font-bold flex items-center gap-2 text-primary">
              <FileText className="w-5 h-5 text-primary" />
              Generate Bill PDF
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-muted-foreground/90 font-medium leading-relaxed">
              Would you like to generate and view a PDF receipt for this newly recorded bill?
            </AlertDialogDescription>
          </AlertDialogHeader>
          {pdfQrChoice(bills.find((b) => b.id === pdfConfirmDialog.billId) || null)}
          <AlertDialogFooter className="gap-2 mt-4">
            <AlertDialogCancel className="rounded-xl border-border/80 hover:bg-muted/80 h-10 px-4 transition-all">
              Skip
            </AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-gradient-to-r from-primary to-primary/90 hover:from-primary/95 hover:to-primary text-primary-foreground shadow-md shadow-primary/20 h-10 px-4 font-semibold transition-all hover:scale-[1.02] active:scale-[0.98]"
              onClick={async () => {
                if (!pdfConfirmDialog.billId) return;
                await generateBillPdf(pdfConfirmDialog.billId, pdfWithQr);
                setPdfConfirmDialog({ open: false, billId: null });
                handleCancelNewBill();
                fetchData();
              }}
            >
              Generate PDF
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={removeConfirmDialog.open}
        onOpenChange={(open) =>
          setRemoveConfirmDialog({ ...removeConfirmDialog, open })
        }
      >
        <AlertDialogContent className="glass bg-card/95 backdrop-blur-xl border border-border/80 shadow-2xl rounded-2xl p-6">
          <AlertDialogHeader className="space-y-3">
            <AlertDialogTitle className="text-xl font-bold flex items-center gap-2 text-destructive">
              <AlertCircle className="w-5 h-5 text-destructive animate-pulse" />
              Remove Item
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-muted-foreground/90 font-medium leading-relaxed">
              Are you sure you want to remove this item from the bill?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 mt-4">
            <AlertDialogCancel className="rounded-xl border-border/80 hover:bg-muted/80 h-10 px-4 transition-all">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRemoveItem}
              className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-md shadow-destructive/10 h-10 px-4 font-semibold transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showMrpWarning} onOpenChange={setShowMrpWarning}>
        <AlertDialogContent className="glass bg-card/95 backdrop-blur-xl border border-amber-500/40 shadow-2xl rounded-2xl p-6">
          <AlertDialogHeader className="space-y-3">
            <AlertDialogTitle className="text-xl font-bold flex items-center gap-2 text-amber-600 dark:text-amber-500">
              <AlertCircle className="w-5 h-5 text-amber-500 animate-pulse" />
              Missing MRP/Unit
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-muted-foreground/90 font-semibold leading-relaxed">
              {isEditModeWarning
                ? "Are you sure that you want to update bill without entering MRP?"
                : "Are you sure that you want to create bill without entering MRP?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 mt-4">
            <AlertDialogCancel onClick={() => setShowMrpWarning(false)} className="rounded-xl border-border/80 hover:bg-muted/80 h-10 px-4 transition-all">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowMrpWarning(false);
                if (isEditModeWarning) {
                  handleSaveEditBill(true);
                } else {
                  handleSubmitBill(true);
                }
              }}
              className="rounded-xl bg-amber-600 hover:bg-amber-700 text-white shadow-md shadow-amber-600/20 h-10 px-4 font-semibold transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Record Payment Dialog */}
      <AlertDialog
        open={recordPaymentDialog.open}
        onOpenChange={(open) =>
          setRecordPaymentDialog((prev) => ({ ...prev, open }))
        }
      >
        <AlertDialogContent className="glass bg-card/95 backdrop-blur-xl border border-border/80 shadow-2xl rounded-2xl p-6 max-w-sm">
          <AlertDialogHeader className="space-y-3">
            <AlertDialogTitle className="text-xl font-bold flex items-center gap-2 text-foreground">
              <CreditCard className="w-5 h-5 text-primary" />
              Record Payment
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-muted-foreground/90 font-medium leading-relaxed">
              Record subsequent payment for Bill <span className="font-mono font-bold text-foreground">#{recordPaymentDialog.billNo}</span>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4 my-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-muted-foreground/80 uppercase tracking-wider">Amount Paid (₹)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                max={recordPaymentDialog.remainingUnpaid}
                placeholder="0.00"
                value={recordPaymentDialog.amount}
                onChange={(e) => setRecordPaymentDialog((prev) => ({ ...prev, amount: e.target.value }))}
                aria-invalid={!!billPaymentError(recordPaymentDialog)}
                className={`h-10 border-border/80 rounded-xl focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary font-mono font-bold ${billPaymentError(recordPaymentDialog) ? "border-red-500" : ""}`}
                data-testid="record-payment-amount"
              />
              <div className="flex items-center justify-between mt-0.5">
                <span className="text-[10px] text-muted-foreground/80">Due on this bill: <b className="text-foreground">₹{recordPaymentDialog.remainingUnpaid.toFixed(2)}</b></span>
                <button
                  type="button"
                  className="text-[10px] font-bold text-primary hover:underline"
                  onClick={() => setRecordPaymentDialog((prev) => ({ ...prev, amount: prev.remainingUnpaid.toFixed(2) }))}
                >
                  Pay all
                </button>
              </div>
              {billPaymentError(recordPaymentDialog) && (
                <p className="text-xs font-semibold text-red-500" data-testid="record-payment-error">{billPaymentError(recordPaymentDialog)}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-muted-foreground/80 uppercase tracking-wider">Payment Mode</Label>
              <Select
                value={recordPaymentDialog.paymentMode}
                onValueChange={(val) => setRecordPaymentDialog((prev) => ({ ...prev, paymentMode: val }))}
              >
                <SelectTrigger className="h-10 border-border/80 rounded-xl focus:ring-1 focus:ring-primary focus:border-primary bg-background/50 text-xs font-semibold">
                  <SelectValue placeholder="Select Payment Mode">
                    {recordPaymentDialog.paymentMode ? (
                      <div className="flex items-center gap-1.5">
                        {getPaymentModeIcon(recordPaymentDialog.paymentMode, "w-3.5 h-3.5")}
                        <span>{recordPaymentDialog.paymentMode}</span>
                      </div>
                    ) : null}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Cash">
                    <div className="flex items-center gap-2">
                      {getPaymentModeIcon("Cash", "w-3.5 h-3.5")}
                      <span>Cash</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="UPI">
                    <div className="flex items-center gap-2">
                      {getPaymentModeIcon("UPI", "w-3.5 h-3.5")}
                      <span>UPI</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="Card">
                    <div className="flex items-center gap-2">
                      {getPaymentModeIcon("Card", "w-3.5 h-3.5")}
                      <span>Card</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="rounded-xl border-border/80 hover:bg-muted/80 h-10 px-4 transition-all">
              Cancel
            </AlertDialogCancel>
            <Button
              onClick={handleRecordPaymentSubmit}
              disabled={recordPaymentDialog.amount === "" || !!billPaymentError(recordPaymentDialog)}
              className="rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 shadow-md shadow-primary/10 h-10 px-4 font-semibold transition-all"
            >
              Record Payment
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* TABS & ACTION NAVBAR */}
      {(showNewBill || editingBillId) && createPortal(
        <div className="fixed bottom-0 left-0 right-0 z-[100] flex items-center justify-between bg-card/95 backdrop-blur-xl border-t-2 border-border shadow-2xl px-6 py-3.5 gap-4 overflow-x-auto scroller-hide overflow-y-hidden mb-0 transition-all duration-300 mobile-action-bar max-md:flex-wrap max-md:gap-2 max-md:px-3 max-md:pt-2.5 max-md:pb-[calc(0.625rem+env(safe-area-inset-bottom))]">
          <div className="flex items-center gap-2 overflow-x-auto scroller-hide max-md:w-full empty:hidden">
            {showNewBill &&
              tabs.map((tab, idx) => {
                const isActive = tab.id === activeTabId;
                let tabName = `Tab ${idx + 1}`;
                if (tab.data?.billItems?.length > 0) {
                  const firstProduct =
                    tab.data.billItems[0].product_name || "Unknown";
                  const extra = tab.data.billItems.length - 1;
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
                      <span className="max-w-[120px] truncate">{tabName}</span>
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
            {showNewBill && tabs.length < 10 && (
              <Button
                variant="outline"
                size="sm"
                onClick={createNewTab}
                className="bg-primary/5 hover:bg-primary/10 border-primary/20 text-primary shrink-0 transition-colors shadow-sm h-9 rounded-full"
              >
                <Plus className="w-4 h-4 mr-1" /> New Tab
              </Button>
            )}
            {editingBillId && (
              <div className="flex items-center gap-2 px-3 py-1 bg-yellow-500/10 border border-yellow-500/20 rounded-md text-yellow-600 text-sm font-medium">
                <Edit className="w-4 h-4" />
                Editing Bill #{editingBillData?.bill_no}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 shrink-0 ml-auto border-l border-border pl-6 max-md:w-full max-md:ml-0 max-md:border-l-0 max-md:pl-0 max-md:gap-2">
            <Button
              variant="ghost"
              onClick={showNewBill ? handleCancelNewBill : handleCancelEditBill}
              className="text-muted-foreground hover:text-foreground max-md:flex-1 max-md:border max-md:border-border"
            >
              Cancel<span className="max-md:hidden">&nbsp;(Esc)</span>
            </Button>

            {showNewBill ? (
              <Button
                onClick={handleSubmitBill}
                data-shortcut="save"
                data-kbd={formatCombo("mod+enter")}
                disabled={submitting || validItems.length === 0}
                className="btn-primary shadow-lg shadow-primary/20 min-w-[140px] max-md:flex-[2] max-md:min-w-0"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-4 h-4" />
                    <span>Create Bill</span>
                    <kbd className="hidden md:inline-block ml-1 opacity-70 text-[9px] font-mono border border-white/20 px-1 rounded">
                      {formatCombo("mod+enter")}
                    </kbd>
                  </div>
                )}
              </Button>
            ) : (
              <Button
                onClick={handleSaveEditBill}
                data-shortcut="save"
                data-kbd={formatCombo("mod+enter")}
                disabled={submitting || validEditItems.length === 0}
                className="btn-primary bg-yellow-600 hover:bg-yellow-700 shadow-lg shadow-yellow-600/20 min-w-[140px] max-md:flex-[2] max-md:min-w-0"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Updating...
                  </>
                ) : (
                  <div className="flex items-center gap-2">
                    <Save className="w-4 h-4" />
                    <span>Update Bill</span>
                    <kbd className="hidden md:inline-block ml-1 opacity-70 text-[9px] font-mono border border-white/20 px-1 rounded">
                      {formatCombo("mod+enter")}
                    </kbd>
                  </div>
                )}
              </Button>
            )}
          </div>
        </div>,
        document.body
      )}
      <BillingScannerModal
        open={scannerModalOpen}
        onOpenChange={setScannerModalOpen}
        onTransferToBill={handleTransferScannedItemsToBill}
      />
      <AlertDialog open={confirmDiscardBill} onOpenChange={setConfirmDiscardBill}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard this bill?</AlertDialogTitle>
            <AlertDialogDescription>The items you added will be cleared. Press Esc or Keep editing to go back.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 text-white hover:bg-rose-700"
              onClick={() => {
                setConfirmDiscardBill(false);
                handleCancelNewBill();
              }}
            >
              Discard bill
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={!!shortBookFor} onOpenChange={(o) => !o && setShortBookFor(null)}>
        <DialogContent className="max-w-md rounded-3xl p-5 sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-black">Add to short book</DialogTitle>
            <DialogDescription className="text-xs">
              {shortBookFor?.item.product_name} · sold {shortBookFor?.item.quantity} units on {shortBookFor?.bill.bill_no}
            </DialogDescription>
          </DialogHeader>
          {shortBookFor && (
            <form onSubmit={saveShortBook} className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label htmlFor="sb-qty" className="text-xs font-bold">Reorder quantity</Label>
                  <Input
                    id="sb-qty"
                    type="number"
                    min="1"
                    inputMode="numeric"
                    autoFocus
                    value={shortBookFor.quantity}
                    onChange={(e) => setShortBookFor((s) => ({ ...s, quantity: e.target.value }))}
                    className="mt-1 h-10 rounded-xl font-mono text-base font-bold"
                  />
                </div>
                <div>
                  <Label className="text-xs font-bold">In</Label>
                  <div className="mt-1 grid h-10 grid-cols-2 gap-1 rounded-xl border border-border p-1" role="radiogroup">
                    {["packs", "units"].map((u) => (
                      <button key={u} type="button" role="radio" aria-checked={shortBookFor.unit === u} onClick={() => setShortBookFor((s) => ({ ...s, unit: u }))} className={`rounded-lg text-xs font-bold ${shortBookFor.unit === u ? "bg-orange-600 text-white" : "text-muted-foreground"}`}>
                        {u === "packs" ? `Packs${shortBookFor.item.units_per_pack > 1 ? ` of ${shortBookFor.item.units_per_pack}` : ""}` : "Units"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div>
                <Label htmlFor="sb-note" className="text-xs font-bold">Note</Label>
                <Input id="sb-note" value={shortBookFor.notes} onChange={(e) => setShortBookFor((s) => ({ ...s, notes: e.target.value }))} placeholder="Optional, e.g. regular customer" className="mt-1 h-10 rounded-xl" maxLength={300} />
              </div>
              <DialogFooter className="gap-2">
                <Button type="button" variant="outline" onClick={() => setShortBookFor(null)} className="rounded-xl text-xs font-bold">
                  Cancel
                </Button>
                <Button type="submit" disabled={shortBookSaving} className="rounded-xl bg-orange-600 text-xs font-bold text-white hover:bg-orange-700" data-shortcut="save">
                  {shortBookSaving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Plus className="mr-1.5 h-4 w-4" />}
                  Add to short book
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={!!pdfFor} onOpenChange={(o) => !o && setPdfFor(null)}>
        <DialogContent className="max-w-md rounded-3xl p-5 sm:p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-black">
              <FileText className="h-5 w-5 text-orange-500" /> Bill PDF
            </DialogTitle>
            <DialogDescription className="text-xs">{pdfFor?.bill_no ? `${pdfFor.bill_no} · ${pdfFor.customer_name || "Walk-in"}` : ""}</DialogDescription>
          </DialogHeader>
          {pdfFor && pdfQrChoice(pdfFor.bill_no ? pdfFor : null)}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setPdfFor(null)} className="rounded-xl text-xs font-bold">
              Cancel
            </Button>
            <Button
              type="button"
              autoFocus
              data-shortcut="save"
              onClick={() => {
                const id = pdfFor.id;
                setPdfFor(null);
                generateBillPdf(id, pdfWithQr);
              }}
              className="rounded-xl bg-orange-600 text-xs font-bold text-white hover:bg-orange-700"
            >
              <FileText className="mr-1.5 h-4 w-4" /> Generate PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ItemQrScanDialog
        open={labelScanOpen}
        onClose={() => setLabelScanOpen(false)}
        onItem={(item) => {
          setLabelScanOpen(false);
          addFromLabel(item);
        }}
      />
      <ProductDetailsSheet
        item={detailsFor?.item}
        open={!!detailsFor}
        onOpenChange={(o) => !o && setDetailsFor(null)}
        onUse={pickDetailsItem}
        warningDays={expiryWarningDays}
      />
      <UpiQrDialog open={!!upiQr} onOpenChange={(o) => !o && setUpiQr(null)} initialAmount={upiQr?.amount ?? ""} note={upiQr?.note || ""} autoGenerate={!!upiQr?.auto} />
      {whatsApp.dialog}
    </div>
  );
}
