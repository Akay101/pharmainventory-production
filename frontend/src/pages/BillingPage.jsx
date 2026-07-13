import React, { useState, useEffect, useRef, useCallback } from "react";
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
  CreditCard,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Save,
  Download,
  BarChart3,
  TrendingUp,
  AlertCircle,
  Edit,
} from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "./utils";
import { getOS } from "../hooks/useKeyboard";

const LOCAL_STORAGE_KEY_BILL = "pharmalogy_bill_draft";

export default function BillingPage() {
  // Data state
  const [bills, setBills] = useState([]);
  const [totalBills, setTotalBills] = useState(0);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user, settings } = useAuth();
  const [tabs, setTabs] = useState([]);
  const [activeTabId, setActiveTabId] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // New bill state - inline table approach
  const [showNewBill, setShowNewBill] = useState(false);
  const [billItems, setBillItems] = useState([]);
  const [visibleBatchesLimit, setVisibleBatchesLimit] = useState({});
  const [customerInfo, setCustomerInfo] = useState({
    customer_id: "",
    customer_name: "",
    customer_mobile: "",
    customer_email: "",
  });
  const [billDiscount, setBillDiscount] = useState(0);
  const [isPaid, setIsPaid] = useState(true);
  const [paymentMode, setPaymentMode] = useState("");
  
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

  // Refs for keyboard navigation
  const productInputRef = useRef(null);
  const quantityInputRef = useRef(null);
  const editingProductInputRef = useRef(null);

  // Keyboard shortcuts info
  const [showShortcuts, setShowShortcuts] = useState(false);

  // Dropdown keyboard navigation
  const [activeDropdownIndex, setActiveDropdownIndex] = useState(-1);
  const [highlightedSuggestion, setHighlightedSuggestion] = useState(-1);

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

  const [dropdownPosition, setDropdownPosition] = useState({
    top: 0,
    left: 0,
    width: 400,
    transform: "none",
  });

  const updatePos = () => {
    const el = showInventorySuggestions
      ? inputRefs.current[activeBillItemId]
      : editingInputRefs.current[activeEditingItemId];
    if (el) {
      const rect = el.getBoundingClientRect();
      const dropdownWidth = Math.max(rect.width, 400);

      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const dropdownMaxHeight = 260; // Max height in styling is 260px
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

  // Keyboard navigation scroll-into-view
  useEffect(() => {
    if (showInventorySuggestions && highlightedSuggestion >= 0) {
      const el = document.getElementById(`suggestion-new-${highlightedSuggestion}`);
      el?.scrollIntoView({ block: "nearest" });
    }
  }, [highlightedSuggestion, showInventorySuggestions]);

  useEffect(() => {
    if (showEditingInventorySuggestions && highlightedEditingSuggestion >= 0) {
      const el = document.getElementById(`suggestion-edit-${highlightedEditingSuggestion}`);
      el?.scrollIntoView({ block: "nearest" });
    }
  }, [highlightedEditingSuggestion, showEditingInventorySuggestions]);

  // Default payment mode settings synchronization
  useEffect(() => {
    if (!isPaid) {
      if (paymentMode !== "") {
        setPaymentMode("");
      }
      return;
    }
    const defaultMode = settings?.billing_payment_mode_default;
    if (defaultMode && defaultMode !== "none" && paymentMode === "") {
      setPaymentMode(defaultMode);
    }
  }, [settings, paymentMode, isPaid]);

  // Pagination
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [totalPages, setTotalPages] = useState(1);

  // Search
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [tableLoading, setTableLoading] = useState(false);

  // Filters and Insights
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
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
          setBillDiscount(active.data.billDiscount || 0);
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
        billDiscount: 0,
        isPaid: true,
        paymentMode: initialMode,
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
    setBillDiscount(0);
    setIsPaid(true);
    setPaymentMode(initialMode);
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
    setBillDiscount(target.data.billDiscount || 0);
    setIsPaid(target.data.isPaid !== false);
    setPaymentMode(target.data.paymentMode || "");
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
      setBillDiscount(0);
      setIsPaid(true);
      setPaymentMode("");
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
      setShowShortcuts,
      showNewBill,
      newItemRow,
      editingBillId,
    };
  });

  useEffect(() => {
    fetchData(true);

    // Global keyboard shortcuts
    const handleKeyDown = (e) => {
      // Avoid triggering when user is typing in generic inputs, UNLESS it's a modifier combo or Escape
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
        handleStartNewBill,
        handleSubmitBill,
        handleSaveEditBill,
        handleCancelAddItem,
        handleCancelNewBill,
        handleCancelEditBill,
        handleAddNewRow,
        setShowShortcuts,
        showNewBill,
        newItemRow,
        editingBillId,
      } = handlersRef.current;

      if (!handleStartNewBill) return;

      // Alt+N - New bill
      if (e.altKey && (e.key === "n" || e.code === "KeyN")) {
        e.preventDefault();
        handleStartNewBill();
      }
      // Alt+S or Cmd+Enter - Save bill
      if (
        (e.altKey && (e.key === "s" || e.code === "KeyS")) ||
        ((e.ctrlKey || e.metaKey) && (e.key === "Enter" || e.code === "Enter"))
      ) {
        if (showNewBill) {
          e.preventDefault();
          handleSubmitBill();
        }
      }
      // Alt+U or Cmd+Enter - Update bill (when editing)
      if (
        (e.altKey && (e.key === "u" || e.code === "KeyU")) ||
        ((e.ctrlKey || e.metaKey) && (e.key === "Enter" || e.code === "Enter"))
      ) {
        if (editingBillId) {
          e.preventDefault();
          handleSaveEditBill();
        }
      }
      // Escape - Cancel
      if (e.key === "Escape" || e.code === "Escape") {
        if (newItemRow) {
          handleCancelAddItem();
        } else if (showNewBill) {
          handleCancelNewBill();
        } else if (editingBillId) {
          handleCancelEditBill();
        }
      }
      // Alt+A - Add item (when in new bill mode)
      if (e.altKey && (e.key === "a" || e.code === "KeyA")) {
        if (showNewBill && !newItemRow) {
          e.preventDefault();
          handleStartAddItem();
        } else if (showNewBill) {
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
  }, [page, startDate, endDate, filterCustomer, debouncedSearchQuery]);


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

  // Server-side inventory search for new bills
  useEffect(() => {
    const searchInventory = async () => {
      if (inventorySearch.length >= 2) {
        try {
          const response = await axios.get(
            `${API}/inventory/search?q=${encodeURIComponent(inventorySearch)}&limit=15`
          );
          setInventorySuggestions(response.data.inventory);
          setShowInventorySuggestions(true);
        } catch (error) {
          console.error("Inventory search error:", error);
          // Fallback to paginated endpoint
          try {
            const response = await axios.get(
              `${API}/inventory?search=${encodeURIComponent(inventorySearch)}&limit=15`
            );
            setInventorySuggestions(response.data.inventory);
            setShowInventorySuggestions(true);
          } catch (e) {
            console.error("Fallback search error:", e);
          }
        }
      } else {
        setInventorySuggestions([]);
        setShowInventorySuggestions(false);
      }
    };

    const debounce = setTimeout(searchInventory, 200);
    return () => clearTimeout(debounce);
  }, [inventorySearch]);

  // Server-side inventory search for editing bills
  useEffect(() => {
    const searchInventory = async () => {
      if (editingInventorySearch.length >= 2) {
        try {
          const response = await axios.get(
            `${API}/inventory/search?q=${encodeURIComponent(editingInventorySearch)}&limit=15`
          );
          setEditingInventorySuggestions(response.data.inventory);
          setShowEditingInventorySuggestions(true);
        } catch (error) {
          console.error("Inventory search error:", error);
          try {
            const response = await axios.get(
              `${API}/inventory?search=${encodeURIComponent(editingInventorySearch)}&limit=15`
            );
            setEditingInventorySuggestions(response.data.inventory);
            setShowEditingInventorySuggestions(true);
          } catch (e) {
            console.error("Fallback search error:", e);
          }
        }
      } else {
        setEditingInventorySuggestions([]);
        setShowEditingInventorySuggestions(false);
      }
    };

    const debounce = setTimeout(searchInventory, 200);
    return () => clearTimeout(debounce);
  }, [editingInventorySearch]);

  // Server-side doctor search
  useEffect(() => {
    const searchDoctors = async () => {
      if (doctorSearch.length >= 1) {
        try {
          const response = await axios.get(
            `${API}/bills/doctors?search=${encodeURIComponent(doctorSearch)}`
          );
          setDoctorSuggestions(response.data.doctors || []);
        } catch (error) {
          console.error("Doctor search error:", error);
        }
      } else {
        setDoctorSuggestions([]);
      }
    };

    const debounce = setTimeout(searchDoctors, 200);
    return () => clearTimeout(debounce);
  }, [doctorSearch]);

  // Server-side customer search with infinite scroll
  useEffect(() => {
    const searchCustomers = async () => {
      if (customerSearch.trim().length >= 1) {
        setLoadingCustomerSuggestions(true);
        try {
          const response = await axios.get(
            `${API}/customers?search=${encodeURIComponent(customerSearch)}&page=1&limit=15`
          );
          setCustomerSuggestions(response.data.customers || []);
          setHasMoreCustomerSuggestions(
            response.data.pagination?.page < response.data.pagination?.total_pages
          );
          setCustomerSuggestionPage(1);
        } catch (error) {
          console.error("Customer search error:", error);
        } finally {
          setLoadingCustomerSuggestions(false);
        }
      } else {
        setCustomerSuggestions([]);
        setHasMoreCustomerSuggestions(false);
        setCustomerSuggestionPage(1);
      }
    };

    const debounce = setTimeout(searchCustomers, 300);
    return () => clearTimeout(debounce);
  }, [customerSearch]);

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

      const custRes = await axios.get(`${API}/customers`);
      setCustomers(custRes.data.customers);

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

  const searchLower = (customerSearch || "").trim().toLowerCase();

  const filteredCustomers = customers.filter(
    (customer) =>
      (customer.name ?? "").toLowerCase().includes(searchLower) ||
      (customer.mobile ?? "").toLowerCase().includes(searchLower) ||
      (customer.email ?? "").toLowerCase().includes(searchLower)
  );

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
    setBillDiscount(0);
    setNewItemRow(null);
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
    let availableBatches = (inventoryItem.batches || []).filter(b => (b.available_quantity || 0) > 0);
    if (availableBatches.length === 0) {
      availableBatches = inventoryItem.batches || [];
    }

    availableBatches.sort((a, b) => {
      if (!a.expiry_date) return 1;
      if (!b.expiry_date) return -1;
      return a.expiry_date.localeCompare(b.expiry_date);
    });

    const defaultBatch = availableBatches[0] || inventoryItem;

    setBillItems((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;

        const qty = parseInt(item.quantity) || 1;
        const unitPrice = defaultBatch.mrp_per_unit || defaultBatch.mrp || 0;
        const purchasePrice =
          defaultBatch.cost_per_unit || defaultBatch.purchase_price || 0;
        const cgstVal = defaultBatch.cgst !== undefined ? Math.max(0, parseFloat(defaultBatch.cgst) || 0) : 0;
        const sgstVal = defaultBatch.sgst !== undefined ? Math.max(0, parseFloat(defaultBatch.sgst) || 0) : 0;
        const exclPrice = unitPrice / (1 + (cgstVal + sgstVal) / 100);
        const itemDiscount = (qty * exclPrice) * ((parseFloat(item.discount_percent) || 0) / 100);
        const netTotal = (qty * exclPrice - itemDiscount) * (1 + (cgstVal + sgstVal) / 100);

        return {
          ...item,
          inventory_id: defaultBatch.id,
          product_name: inventoryItem.product_name,
          salt_composition: inventoryItem.salt_composition || "",
          batch_no: defaultBatch.batch_no,
          expiry_date: defaultBatch.expiry_date || "",
          unit_price: unitPrice,
          exclusive_price: exclPrice,
          net_total: netTotal,
          purchase_price: purchasePrice,
          available:
            defaultBatch.available_quantity ||
            defaultBatch.available_units ||
            0,
          units_per_pack: inventoryItem.units_per_pack || 1,
          is_manual: false,
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

  // Handle dropdown keyboard navigation
  const handleDropdownKeyDown = (e, itemId) => {
    if (!showInventorySuggestions) return;

    const totalOptions = 1 + inventorySuggestions.length;

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
      if (
        highlightedSuggestion === 0 &&
        inventorySearch &&
        inventorySearch.length >= 2
      ) {
        handleManualEntry(itemId, inventorySearch);
      } else if (
        highlightedSuggestion > 0 &&
        inventorySuggestions[highlightedSuggestion - 1]
      ) {
        handleSelectInventoryForRow(
          itemId,
          inventorySuggestions[highlightedSuggestion - 1]
        );
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
    }

    setCustomerSearch("");
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

          if (field === "unit_price" || updated.exclusive_price === undefined || updated.exclusive_price === null || isNaN(updated.exclusive_price) || updated.exclusive_price === 0) {
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

        return {
          ...item,
          quantity: checked ? item.units_per_pack : item.previousQuantity || 1,
          previousQuantity: checked ? item.quantity : undefined,
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

    if (settings?.billing_payment_mode_mandatory && (!paymentMode || paymentMode === "none")) {
      toast.error("Payment mode is mandatory. Please select Cash, UPI, or Card.");
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
            expiry_date: item.expiry_date,
            quantity: parseInt(item.quantity) || 1,
            unit_price: parseFloat(item.unit_price) || 0,
            purchase_price: parseFloat(item.purchase_price) || 0,
            discount_percent: parseFloat(item.discount_percent) || 0,
            cgst: parseFloat(item.cgst) || 0,
            sgst: parseFloat(item.sgst) || 0,
            item_total: parseFloat(net_total) || 0,
          })
        ),
        discount_percent: billDiscount,
        is_paid: isPaid,
        payment_mode: (paymentMode && paymentMode !== "none") ? paymentMode : null,
      });

      toast.success(`Bill ${response.data.bill.bill_no} created successfully`);

      setPdfConfirmDialog({ open: true, billId: response.data.bill.id });
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
      payment_mode: bill.payment_mode || "",
      billing_date: bill.billing_date || bill.created_at?.slice(0, 10),
      doctor: bill.doctor || "",
    });

    // Map existing items to editable format
    const mappedItems = await Promise.all(
      bill.items.map(async (item, idx) => {
        const qty = item.quantity || 1;
        const unitPrice = item.unit_price || item.mrp_per_unit || 0;
        const discPercent = item.discount_percent || 0;
        const cgstVal = item.cgst !== undefined ? Math.max(0, parseFloat(item.cgst) || 0) : 0;
        const sgstVal = item.sgst !== undefined ? Math.max(0, parseFloat(item.sgst) || 0) : 0;
        const exclPrice = unitPrice / (1 + (cgstVal + sgstVal) / 100);
        const itemDiscount = (qty * exclPrice) * (discPercent / 100);
        const netTotal = (qty * exclPrice - itemDiscount) * (1 + (cgstVal + sgstVal) / 100);

        let availableBatches = [];
        if (item.inventory_id && !item.is_manual) {
          try {
            const res = await axios.get(
              `${API}/inventory/search?q=${encodeURIComponent(item.product_name)}&limit=30`
            );
            const matchedProduct = res.data.inventory.find(
              (inv) => inv.product_name.toLowerCase() === item.product_name.toLowerCase()
            );
            if (matchedProduct) {
              availableBatches = matchedProduct.batches || [];
            }
          } catch (e) {
            console.error("Failed to load batches for existing item", e);
          }
        }

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
          original_quantity: item.quantity, // Track original for inventory adjustment
          cgst: item.cgst !== undefined ? item.cgst : "",
          sgst: item.sgst !== undefined ? item.sgst : "",
          available_batches: availableBatches,
        };
      })
    );

    setEditingBillItems(mappedItems);
  };

  const handleCancelEditBill = () => {
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

          if (field === "unit_price" || updated.exclusive_price === undefined || updated.exclusive_price === null || isNaN(updated.exclusive_price) || updated.exclusive_price === 0) {
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
    }
  };

  // Handle selecting inventory for editing items
  const handleSelectInventoryForEditRow = (itemId, inventoryItem) => {
    let availableBatches = (inventoryItem.batches || []).filter(b => (b.available_quantity || 0) > 0);
    if (availableBatches.length === 0) {
      availableBatches = inventoryItem.batches || [];
    }

    availableBatches.sort((a, b) => {
      if (!a.expiry_date) return 1;
      if (!b.expiry_date) return -1;
      return a.expiry_date.localeCompare(b.expiry_date);
    });

    const defaultBatch = availableBatches[0] || inventoryItem;

    setEditingBillItems((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;

        const qty = parseInt(item.quantity) || 1;
        const unitPrice = defaultBatch.mrp_per_unit || defaultBatch.mrp || 0;
        const purchasePrice =
          defaultBatch.cost_per_unit || defaultBatch.purchase_price || 0;
        const cgstVal = defaultBatch.cgst !== undefined ? Math.max(0, parseFloat(defaultBatch.cgst) || 0) : 0;
        const sgstVal = defaultBatch.sgst !== undefined ? Math.max(0, parseFloat(defaultBatch.sgst) || 0) : 0;
        const exclPrice = unitPrice / (1 + (cgstVal + sgstVal) / 100);
        const itemDiscount = (qty * exclPrice) * ((parseFloat(item.discount_percent) || 0) / 100);
        const netTotal = (qty * exclPrice - itemDiscount) * (1 + (cgstVal + sgstVal) / 100);

        return {
          ...item,
          inventory_id: defaultBatch.id,
          product_name: inventoryItem.product_name,
          salt_composition: inventoryItem.salt_composition || "",
          batch_no: defaultBatch.batch_no,
          expiry_date: defaultBatch.expiry_date || "",
          unit_price: unitPrice,
          exclusive_price: exclPrice,
          net_total: netTotal,
          purchase_price: purchasePrice,
          available:
            defaultBatch.available_quantity ||
            defaultBatch.available_units ||
            0,
          units_per_pack: inventoryItem.units_per_pack || 1,
          is_manual: false,
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

    const totalOptions = 1 + editingInventorySuggestions.length;

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
      if (
        highlightedEditingSuggestion === 0 &&
        editingInventorySearch &&
        editingInventorySearch.length >= 2
      ) {
        handleManualEntryForEdit(itemId, editingInventorySearch);
      } else if (
        highlightedEditingSuggestion > 0 &&
        editingInventorySuggestions[highlightedEditingSuggestion - 1]
      ) {
        handleSelectInventoryForEditRow(
          itemId,
          editingInventorySuggestions[highlightedEditingSuggestion - 1]
        );
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

    if (settings?.billing_payment_mode_mandatory && (!editingBillData.payment_mode || editingBillData.payment_mode === "none")) {
      toast.error("Payment mode is mandatory. Please select Cash, UPI, or Card.");
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
            expiry_date: item.expiry_date,
            quantity: parseInt(item.quantity) || 1,
            unit_price: parseFloat(item.unit_price) || 0,
            purchase_price: parseFloat(item.purchase_price) || 0,
            discount_percent: parseFloat(item.discount_percent) || 0,
            cgst: parseFloat(item.cgst) || 0,
            sgst: parseFloat(item.sgst) || 0,
            item_total: parseFloat(net_total) || 0,
          })
        ),
        discount_percent: parseFloat(editingBillData.discount_percent) || 0,
        is_paid: editingBillData.is_paid,
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

  const handleGeneratePdf = async (billId) => {
    try {
      toast.info("Generating PDF...");
      const response = await axios.post(`${API}/bills/${billId}/pdf`);
      if (response.data.pdf_url) {
        window.open(response.data.pdf_url, "_blank");
        toast.success("PDF generated successfully");
      }
    } catch (error) {
      console.error("PDF generation error:", error);
      toast.error(error.response?.data?.detail || "Failed to generate PDF");
    }
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
  const discountAmount = subtotal * (billDiscount / 100);
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

  // Auto-scroll logic for dropdown suggestions
  useEffect(() => {
    if (showInventorySuggestions) {
      const el = document.getElementById(
        `suggestion-new-${highlightedSuggestion}`
      );
      if (el) el.scrollIntoView({ block: "nearest" });
    }
  }, [highlightedSuggestion, showInventorySuggestions]);

  useEffect(() => {
    if (showEditingInventorySuggestions) {
      const el = document.getElementById(
        `suggestion-edit-${highlightedEditingSuggestion}`
      );
      if (el) el.scrollIntoView({ block: "nearest" });
    }
  }, [highlightedEditingSuggestion, showEditingInventorySuggestions]);

  const editTotalCost = validEditItems.reduce((sum, item) => {
    const qty = parseInt(item.quantity) || 0;
    const purchasePrice = parseFloat(item.purchase_price) || 0;
    return sum + qty * purchasePrice;
  }, 0);
  const editTotalProfit = editGrandTotal - editTotalCost;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className={`space-y-6 animate-fade-in ${(showNewBill || editingBillId) ? "pb-56" : "pb-12"}`} data-testid="billing-page">
      {/* Restore Draft Dialog */}
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-gradient-to-r from-card/30 via-transparent to-transparent p-4 rounded-2xl border border-border/20 backdrop-blur-sm">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/75">Billing</h1>
          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            {`${totalBills} bill${totalBills !== 1 ? "s" : ""} generated`}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={() => setShowShortcuts(true)}
            data-testid="shortcuts-btn"
            className="h-10 px-4 border-border/80 hover:bg-muted/60 rounded-xl transition-all duration-200"
          >
            <Keyboard className="w-4 h-4 mr-2 text-primary" />
            Shortcuts
          </Button>
          <Button
            className="h-10 px-4 bg-gradient-to-r from-primary to-primary/90 hover:from-primary/95 hover:to-primary text-primary-foreground shadow-md shadow-primary/20 rounded-xl font-medium transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
            onClick={handleStartNewBill}
            data-testid="new-bill-btn"
            disabled={showNewBill || editingBillId}
          >
            <Plus className="w-4 h-4 mr-2" />
            {getOS() === "mac" ? "New Bill (⌥N)" : "New Bill (Alt+N)"}
          </Button>
        </div>
      </div>

      {/* Keyboard Shortcuts Dialog */}
      <Dialog open={showShortcuts} onOpenChange={setShowShortcuts}>
        <DialogContent className="glass bg-card/95 backdrop-blur-xl border border-border/80 shadow-2xl rounded-2xl p-6 max-w-md">
          <DialogHeader className="pb-2 border-b border-border/50">
            <DialogTitle className="text-xl font-bold flex items-center gap-2 text-foreground">
              <Keyboard className="w-5 h-5 text-primary" />
              Keyboard Shortcuts
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-4 max-h-[380px] overflow-y-auto pr-1">
            <div className="flex justify-between items-center p-3 bg-muted/40 hover:bg-muted/65 border border-border/40 rounded-xl transition-all duration-200">
              <span className="text-sm font-semibold text-foreground/80">New Bill</span>
              <kbd className="px-2 py-1 bg-background border border-border/80 rounded-lg text-xs font-mono shadow-sm">
                {getOS() === "mac" ? "⌥ + N" : "Alt + N"}
              </kbd>
            </div>
            <div className="flex justify-between items-center p-3 bg-muted/40 hover:bg-muted/65 border border-border/40 rounded-xl transition-all duration-200">
              <span className="text-sm font-semibold text-foreground/80">Add Item</span>
              <kbd className="px-2 py-1 bg-background border border-border/80 rounded-lg text-xs font-mono shadow-sm">
                {getOS() === "mac" ? "⌥ + A" : "Alt + A"}
              </kbd>
            </div>
            <div className="flex justify-between items-center p-3 bg-muted/40 hover:bg-muted/65 border border-border/40 rounded-xl transition-all duration-200">
              <span className="text-sm font-semibold text-foreground/80">Save Bill</span>
              <kbd className="px-2 py-1 bg-background border border-border/80 rounded-lg text-xs font-mono shadow-sm">
                {getOS() === "mac" ? "⌘ + Enter / ⌥ + S" : "Ctrl + Enter / Alt + S"}
              </kbd>
            </div>
            <div className="flex justify-between items-center p-3 bg-muted/40 hover:bg-muted/65 border border-border/40 rounded-xl transition-all duration-200">
              <span className="text-sm font-semibold text-foreground/80">Update Bill</span>
              <kbd className="px-2 py-1 bg-background border border-border/80 rounded-lg text-xs font-mono shadow-sm">
                {getOS() === "mac" ? "⌘ + Enter / ⌥ + U" : "Ctrl + Enter / Alt + U"}
              </kbd>
            </div>
            <div className="flex justify-between items-center p-3 bg-muted/40 hover:bg-muted/65 border border-border/40 rounded-xl transition-all duration-200">
              <span className="text-sm font-semibold text-foreground/80">Save Item / Next Field</span>
              <kbd className="px-2 py-1 bg-background border border-border/80 rounded-lg text-xs font-mono shadow-sm">
                Enter / Tab
              </kbd>
            </div>
            <div className="flex justify-between items-center p-3 bg-muted/40 hover:bg-muted/65 border border-border/40 rounded-xl transition-all duration-200">
              <span className="text-sm font-semibold text-foreground/80">Fill Default (on empty field)</span>
              <kbd className="px-2 py-1 bg-background border border-border/80 rounded-lg text-xs font-mono shadow-sm">
                Tab
              </kbd>
            </div>
            <div className="flex justify-between items-center p-3 bg-muted/40 hover:bg-muted/65 border border-border/40 rounded-xl transition-all duration-200">
              <span className="text-sm font-semibold text-foreground/80">Cancel / Close</span>
              <kbd className="px-2 py-1 bg-background border border-border/80 rounded-lg text-xs font-mono shadow-sm">
                Escape
              </kbd>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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

                <div className="p-4 bg-indigo-500/10 border border-indigo-500/25 rounded-xl shadow-sm">
                  <span className="text-[10px] uppercase font-bold text-indigo-600 dark:text-indigo-400 tracking-wider">Total Profit Given</span>
                  <div className="text-xl font-extrabold font-mono text-indigo-600 dark:text-indigo-500 mt-1">
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
                  <Table>
                    <TableHeader className="sticky top-0 bg-muted/90 backdrop-blur-md z-[20]">
                      <TableRow>
                        <TableHead className="h-8 w-12"></TableHead>
                        <TableHead className="h-8 text-[11px] font-bold">Bill No</TableHead>
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
                                        <Table>
                                          <TableHeader className="bg-muted/40">
                                            <TableRow className="border-b border-border/40">
                                              <TableHead className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider py-1.5">
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
        <Card
          className="glass bg-card/45 backdrop-blur-xl border border-border/70 shadow-lg rounded-2xl p-6"
          data-testid="new-bill-form"
        >
          <CardHeader className="pb-4 px-0 pt-0">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xl font-bold flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-primary" />
                New Bill
              </CardTitle>
              <Button variant="ghost" size="icon" className="rounded-xl hover:bg-muted/80" onClick={handleCancelNewBill}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6 px-0 pb-0">
            {/* Customer Info */}
            <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold text-muted-foreground/80 uppercase tracking-wider">Billing Date *</Label>
                <Input
                  type="date"
                  value={billingDate}
                  onChange={(e) => setBillingDate(e.target.value)}
                  className="h-10 border-border/80 rounded-xl focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary transition-all duration-200"
                />
              </div>

              <div className="space-y-2 relative">
                <Label className="flex items-center justify-between text-xs font-bold text-muted-foreground/80 uppercase tracking-wider">
                  <span className="flex items-center gap-1">
                    <User className="w-3.5 h-3.5 text-primary" /> Customer
                  </span>
                  {customerInfo.customer_id && (
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      onClick={() => fetchCustomerProfileData(customerInfo.customer_id)}
                      className="h-auto p-0 text-primary font-bold text-xs flex items-center gap-1 animate-in fade-in"
                    >
                      <Eye className="w-3.5 h-3.5" /> See Profile
                    </Button>
                  )}
                </Label>
                <Input
                  placeholder="Search existing customer..."
                  value={customerSearch}
                  onChange={(e) => {
                    setCustomerSearch(e.target.value);
                    setShowCustomerSuggestions(true);
                  }}
                  onFocus={() => setShowCustomerSuggestions(true)}
                  onBlur={() =>
                    setTimeout(() => setShowCustomerSuggestions(false), 200)
                  }
                  className="h-10 border-border/80 rounded-xl focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary transition-all duration-200"
                  data-testid="customer-search"
                />
                {showCustomerSuggestions &&
                  customerSearch &&
                  (customerSuggestions.length > 0 || loadingCustomerSuggestions) && (
                    <div
                      onScroll={handleScrollCustomerSuggestions}
                      className="absolute z-[100] w-full mt-1 bg-card/95 backdrop-blur-md border border-border shadow-xl rounded-xl max-h-48 overflow-y-auto top-full overflow-x-hidden transition-all duration-150 animate-in fade-in slide-in-from-top-2"
                    >
                      {customerSuggestions.map((customer) => (
                        <div
                          key={customer.id}
                          className="p-2.5 hover:bg-primary/10 cursor-pointer border-b border-border/50 last:border-0 transition-colors duration-150"
                          onMouseDown={() => handleSelectCustomer(customer)}
                        >
                          <p className="font-semibold text-sm">{customer.name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {customer.mobile}
                          </p>
                        </div>
                      ))}
                      {loadingCustomerSuggestions && (
                        <div className="p-3 text-center text-xs text-muted-foreground">
                          Loading...
                        </div>
                      )}
                    </div>
                  )}
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold text-muted-foreground/80 uppercase tracking-wider">Name *</Label>
                <Input
                  placeholder="Customer name (Tab for 'Walk-in')"
                  value={customerInfo.customer_name}
                  onChange={(e) =>
                    setCustomerInfo({
                      ...customerInfo,
                      customer_name: e.target.value,
                    })
                  }
                  onKeyDown={(e) => handleTabDefault(e, "customer_name")}
                  className="h-10 border-border/80 rounded-xl focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary transition-all duration-200"
                  data-testid="customer-name"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold text-muted-foreground/80 uppercase tracking-wider">Mobile *</Label>
                <Input
                  placeholder="9876543210 (Tab for default)"
                  value={customerInfo.customer_mobile}
                  onChange={(e) =>
                    setCustomerInfo({
                      ...customerInfo,
                      customer_mobile: e.target.value,
                    })
                  }
                  onKeyDown={(e) => handleTabDefault(e, "customer_mobile")}
                  className="h-10 border-border/80 rounded-xl focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary transition-all duration-200"
                  data-testid="customer-mobile"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold text-muted-foreground/80 uppercase tracking-wider">Email</Label>
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
                  className="h-10 border-border/80 rounded-xl focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary transition-all duration-200"
                />
              </div>
              <div className="space-y-2 relative">
                <Label className="text-xs font-bold text-muted-foreground/80 uppercase tracking-wider">Doctor</Label>
                <Input
                  placeholder="Doctor's name..."
                  value={doctorName}
                  onChange={(e) => {
                    setDoctorName(e.target.value);
                    setDoctorSearch(e.target.value);
                    setShowDoctorSuggestions(true);
                  }}
                  onFocus={() => setShowDoctorSuggestions(true)}
                  onBlur={() =>
                    setTimeout(() => setShowDoctorSuggestions(false), 200)
                  }
                  className="h-10 border-border/80 rounded-xl focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary transition-all duration-200"
                  data-testid="doctor-search"
                />
                {showDoctorSuggestions &&
                  doctorSuggestions.length > 0 && (
                    <div className="absolute z-[100] w-full mt-1 bg-card/95 backdrop-blur-md border border-border shadow-xl rounded-xl max-h-48 overflow-y-auto top-full overflow-x-hidden transition-all duration-150 animate-in fade-in slide-in-from-top-2">
                      {doctorSuggestions.map((doc, idx) => (
                        <div
                          key={idx}
                          className="p-2.5 hover:bg-primary/10 cursor-pointer border-b border-border/50 last:border-0 transition-colors duration-150"
                          onMouseDown={() => {
                            setDoctorName(doc.name);
                            setDoctorSearch("");
                            setShowDoctorSuggestions(false);
                          }}
                        >
                          <p className="font-semibold text-sm">{doc.name}</p>
                        </div>
                      ))}
                    </div>
                  )}
              </div>
            </div>

            {/* Items Table - Inline Editable */}
            <div className="border border-border/70 rounded-xl overflow-hidden shadow-sm bg-background/50 backdrop-blur-md mt-4">
              <Table wrapperClassName="max-h-[300px]">
                <TableHeader className="sticky top-0 bg-muted/90 backdrop-blur-md z-[50] border-b border-border/80">
                  <TableRow className="hover:bg-transparent border-b border-border/80">
                    <TableHead className="w-[180px] font-bold text-foreground/80 text-xs uppercase tracking-wider">
                      Product *
                    </TableHead>
                    <TableHead className="w-[100px] font-bold text-foreground/80 text-xs uppercase tracking-wider">
                      Salt
                    </TableHead>
                    <TableHead className="w-[70px] font-bold text-foreground/80 text-xs uppercase tracking-wider">
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
                    <TableHead className="w-[60px] text-center font-bold text-foreground/80 text-xs uppercase tracking-wider">
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
                                className="bg-card/95 backdrop-blur-xl border border-border/80 rounded-xl shadow-2xl overflow-y-auto z-[99999] animate-in fade-in slide-in-from-top-2 duration-150"
                                onMouseEnter={() => setIsMouseOverSuggestions(true)}
                                onMouseLeave={() => {
                                  setIsMouseOverSuggestions(false);
                                  const activeInput = inputRefs.current[activeBillItemId];
                                  if (activeInput && document.activeElement !== activeInput) {
                                    setShowInventorySuggestions(false);
                                    setActiveBillItemId(null);
                                  }
                                }}
                                style={{
                                  position: "fixed",
                                  top: dropdownPosition.top,
                                  left: dropdownPosition.left,
                                  width: dropdownPosition.width || 400,
                                  maxHeight: "260px",
                                  transform: dropdownPosition.transform || "none",
                                }}
                              >
                                {/* Manual Entry Option */}
                                {inventorySearch &&
                                  inventorySearch.length >= 2 && (
                                    <div
                                      id="suggestion-new-0"
                                      className={`p-3 cursor-pointer border-b border-border transition-colors duration-150 ${highlightedSuggestion === 0 ? "bg-amber-500/20 text-amber-600 font-semibold" : "hover:bg-amber-500/10 bg-amber-500/5 text-amber-600"}`}
                                      onMouseDown={(e) => {
                                        e.preventDefault();
                                        handleManualEntry(
                                          item.id,
                                          inventorySearch
                                        );
                                      }}
                                      onMouseEnter={() =>
                                        setHighlightedSuggestion(0)
                                      }
                                    >
                                      <div className="flex items-center gap-2">
                                        <Plus className="w-4 h-4 text-amber-500" />
                                        <div>
                                          <p className="font-medium text-sm">
                                            Manual Entry: "{inventorySearch}"
                                          </p>
                                          <p className="text-xs text-muted-foreground font-normal">
                                            Add item not in inventory
                                          </p>
                                        </div>
                                      </div>
                                    </div>
                                  )}

                                {/* Inventory Items */}
                                {inventorySuggestions.map(
                                  (invItem, suggIdx) => (
                                    <div
                                      key={invItem.id}
                                      id={`suggestion-new-${suggIdx + 1}`}
                                      className={`p-3 cursor-pointer border-b border-border/60 last:border-0 transition-colors duration-150 ${highlightedSuggestion === suggIdx + 1 ? "bg-primary/20" : "hover:bg-primary/10"}`}
                                      onMouseDown={(e) => {
                                        e.preventDefault();
                                        handleSelectInventoryForRow(
                                          item.id,
                                          invItem
                                        );
                                      }}
                                      onMouseEnter={() =>
                                        setHighlightedSuggestion(suggIdx + 1)
                                      }
                                    >
                                      <div className="flex justify-between items-start gap-4">
                                        <div className="space-y-0.5">
                                          <p className="font-semibold text-sm text-foreground">
                                            {invItem.product_name}
                                          </p>
                                          {invItem.supplier_name && (
                                            <p className="text-xs text-primary font-bold flex items-center gap-1">
                                              <span className="w-1 h-1 rounded-full bg-primary" />
                                              Supplier:{" "}
                                              {invItem.supplier_name.length > 18
                                                ? invItem.supplier_name
                                                    .split(" ")
                                                    .map((word) => word[0])
                                                    .join("")
                                                    .toUpperCase()
                                                : invItem.supplier_name}
                                            </p>
                                          )}
                                          {invItem.salt_composition && (
                                            <p className="text-xs text-muted-foreground font-medium italic">
                                              {invItem.salt_composition.slice(
                                                0,
                                                40
                                              )}
                                              {invItem.salt_composition.length > 40 ? "..." : ""}
                                            </p>
                                          )}
                                          <p className="text-xs text-muted-foreground/80">
                                            Batch: <span className="font-mono">{invItem.batch_no}</span> | Exp:{" "}
                                            <span className="font-mono">{invItem.expiry_date}</span>
                                          </p>
                                        </div>
                                        <div className="text-right shrink-0">
                                          <p className="font-mono text-primary font-bold text-sm">
                                            ₹
                                            {Number(
                                              invItem.mrp_per_unit ||
                                                invItem.mrp || 0
                                            )
                                              .toFixed(2)
                                              .replace(/\.00$/, "")}
                                            /unit
                                          </p>
                                          <p className="text-xs font-bold mt-0.5">
                                            {(invItem.available_quantity ||
                                              invItem.available_units ||
                                              0) > 0 ? (
                                              <span className="text-emerald-500">
                                                {invItem.available_quantity || invItem.available_units} units
                                              </span>
                                            ) : (
                                              <span className="text-destructive">
                                                Out of Stock
                                              </span>
                                            )}
                                          </p>
                                          <p className="text-xs text-blue-500 font-bold mt-0.5">
                                            Rate: ₹
                                            {Number(
                                              invItem.purchase_price || 0
                                            ).toFixed(2)}
                                          </p>
                                        </div>
                                      </div>
                                    </div>
                                  )
                                )}
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
                            <Select
                              value={item.inventory_id}
                              onValueChange={(selectedInvId) => {
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
                            >
                              <SelectTrigger className="h-8 text-xs font-mono border-border/80 rounded-lg w-28">
                                <SelectValue placeholder="Select Batch" />
                              </SelectTrigger>
                              <SelectContent className="border border-border/40 shadow-xl rounded-xl z-[99999]">
                                {item.available_batches.slice(0, visibleBatchesLimit[item.id] || 10).map((b) => (
                                  <SelectItem key={b.id} value={b.id} className="text-xs font-mono">
                                    {b.batch_no} ({b.available_quantity || 0} units, exp: {b.expiry_date || "N/A"}{b.supplier_name ? `, Supp: ${b.supplier_name}` : ""})
                                  </SelectItem>
                                ))}
                                {item.available_batches.length > (visibleBatchesLimit[item.id] || 10) && (
                                  <div className="p-1 border-t border-border/20">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="w-full h-7 text-[10px] font-bold text-amber-500 hover:text-amber-600 hover:bg-amber-500/5 transition-all"
                                      onMouseDown={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setVisibleBatchesLimit(prev => ({
                                          ...prev,
                                          [item.id]: (visibleBatchesLimit[item.id] || 10) + 10
                                        }));
                                      }}
                                    >
                                      Show More Batches...
                                    </Button>
                                  </div>
                                )}
                              </SelectContent>
                            </Select>
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
            <p className="text-xs text-muted-foreground bg-muted/45 p-3 rounded-xl border border-border/50 backdrop-blur-sm">
              💡 <strong>Tip:</strong> Search by product name or salt composition. All fields are editable. Use Alt+A to quickly add a new row.
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
                    <Plus className="h-4 w-4 mr-1.5 text-primary" /> Add Item (Alt+A)
                  </Button>
                  <div className="flex items-center gap-2 bg-muted/20 px-3 h-9 rounded-xl border border-border/50">
                    <Checkbox
                      id="isPaid"
                      checked={isPaid}
                      disabled={settings?.billing_payment_mode_mandatory}
                      onCheckedChange={(val) => {
                        setIsPaid(val);
                        if (!val) {
                          setPaymentMode("");
                        }
                      }}
                    />
                    <Label htmlFor="isPaid" className="text-sm font-semibold text-foreground/80 cursor-pointer select-none">
                      Paid
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select
                      value={paymentMode}
                      onValueChange={setPaymentMode}
                      disabled={!isPaid}
                    >
                      <SelectTrigger className="h-9 w-36 bg-muted/20 border border-border/50 rounded-xl text-xs font-semibold" disabled={!isPaid}>
                        <SelectValue placeholder="Payment Mode" />
                      </SelectTrigger>
                      <SelectContent>
                        {!settings?.billing_payment_mode_mandatory && (
                          <SelectItem value="none">None</SelectItem>
                        )}
                        <SelectItem value="Cash">Cash</SelectItem>
                        <SelectItem value="UPI">UPI</SelectItem>
                        <SelectItem value="Card">Card</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {negativeBilledQty > 0 && (
                  <div className="p-3.5 bg-amber-500/10 border border-amber-500/25 rounded-xl text-sm animate-in fade-in duration-200">
                    <p className="text-amber-700 font-bold flex items-center gap-1.5">
                      ⚠️ Negative Billing Alert:
                    </p>
                    <p className="text-amber-600/90 mt-1 font-medium text-xs leading-relaxed">
                      {inventoryBilledQty} units from inventory, {negativeBilledQty} units negatively billed.
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-3.5">
                <div className="flex justify-between items-center gap-4 text-sm">
                  <span className="font-bold text-muted-foreground/85">Bill Discount %</span>
                  <Input
                    type="number"
                    value={billDiscount}
                    onChange={(e) =>
                      setBillDiscount(parseFloat(e.target.value) || 0)
                    }
                    min="0"
                    max="100"
                    className="h-9 w-24 text-center border-border/80 focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary rounded-xl transition-all duration-200 bg-background/50"
                  />
                </div>
                <div className="flex justify-between items-center text-sm font-semibold text-muted-foreground">
                  <span>Subtotal</span>
                  <span className="font-mono text-foreground">₹{subtotal.toFixed(2)}</span>
                </div>
                {billDiscount > 0 && (
                  <div className="flex justify-between items-center text-sm font-bold text-destructive">
                    <span>Discount ({billDiscount}%)</span>
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
                      onChange={(e) => setGrandTotalInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.target.blur();
                        }
                      }}
                      onBlur={() => {
                        setIsEditingGrandTotal(false);
                        const newGrandTotal = parseFloat(grandTotalInput);
                        if (!subtotal || subtotal <= 0) return;
                        if (isNaN(newGrandTotal)) {
                          setGrandTotalInput(grandTotal.toFixed(2));
                          return;
                        }
                        if (newGrandTotal > subtotal) {
                          setBillDiscount(0);
                          return;
                        }
                        if (newGrandTotal < 0) {
                          setGrandTotalInput(grandTotal.toFixed(2));
                          return;
                        }
                        const discountPercent =
                          ((subtotal - newGrandTotal) / subtotal) * 100;
                        setBillDiscount(parseFloat(discountPercent.toFixed(2)));
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

          </CardContent>
        </Card>
      )}

      {/* EDIT BILL - Full Inline Table Editing (Like PurchasesPage) */}
      {editingBillId && editingBillData && (
        <Card
          className="glass bg-card/45 backdrop-blur-xl border border-amber-500/40 shadow-lg rounded-2xl p-6"
          data-testid="edit-bill-form"
        >
          <CardHeader className="pb-4 px-0 pt-0">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xl font-bold flex items-center gap-2 text-amber-600 dark:text-amber-500">
                <Edit2 className="w-5 h-5" />
                Edit Bill - <span className="font-mono">{editingBillData.bill_no}</span>
              </CardTitle>
              <Button
                variant="ghost"
                size="icon"
                className="rounded-xl hover:bg-muted/80 text-muted-foreground hover:text-foreground"
                onClick={handleCancelEditBill}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6 px-0 pb-0">
            {/* Customer Info */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div className="space-y-2 relative">
                <Label className="flex items-center gap-1 text-xs font-bold text-muted-foreground/80 uppercase tracking-wider">
                  <User className="w-3.5 h-3.5 text-amber-500" /> Customer Name *
                </Label>
                <Input
                  placeholder="Search customer..."
                  value={editingBillData.customer_name || ""}
                  onChange={(e) => {
                    setEditingBillData({
                      ...editingBillData,
                      customer_name: e.target.value,
                    });
                    setCustomerSearch(e.target.value);
                    setShowCustomerSuggestions(true);
                  }}
                  onFocus={() => setShowCustomerSuggestions(true)}
                  onBlur={() =>
                    setTimeout(() => setShowCustomerSuggestions(false), 200)
                  }
                  className="h-10 border-border/80 rounded-xl focus-visible:ring-1 focus-visible:ring-amber-500 focus-visible:border-amber-500 transition-all duration-200"
                />
                {showCustomerSuggestions &&
                  customerSearch &&
                  (customerSuggestions.length > 0 || loadingCustomerSuggestions) && (
                    <div
                      onScroll={handleScrollCustomerSuggestions}
                      className="absolute z-[100] w-full mt-1 bg-card/95 backdrop-blur-md border border-border shadow-xl rounded-xl max-h-48 overflow-y-auto top-full overflow-x-hidden transition-all duration-150 animate-in fade-in slide-in-from-top-2"
                    >
                      {customerSuggestions.map((customer) => (
                        <div
                          key={customer.id}
                          className="p-2.5 hover:bg-amber-500/10 cursor-pointer border-b border-border/50 last:border-0 transition-colors duration-150"
                          onMouseDown={() => handleSelectCustomer(customer)}
                        >
                          <p className="font-semibold text-sm">{customer.name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {customer.mobile}
                          </p>
                        </div>
                      ))}
                      {loadingCustomerSuggestions && (
                        <div className="p-3 text-center text-xs text-muted-foreground">
                          Loading...
                        </div>
                      )}
                    </div>
                  )}
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold text-muted-foreground/80 uppercase tracking-wider">Mobile *</Label>
                <Input
                  placeholder="Mobile number"
                  value={editingBillData.customer_mobile || ""}
                  onChange={(e) =>
                    setEditingBillData({
                      ...editingBillData,
                      customer_mobile: e.target.value,
                    })
                  }
                  className="h-10 border-border/80 rounded-xl focus-visible:ring-1 focus-visible:ring-amber-500 focus-visible:border-amber-500 transition-all duration-200"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold text-muted-foreground/80 uppercase tracking-wider">Email</Label>
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
                  className="h-10 border-border/80 rounded-xl focus-visible:ring-1 focus-visible:ring-amber-500 focus-visible:border-amber-500 transition-all duration-200"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold text-muted-foreground/80 uppercase tracking-wider">Discount %</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={editingBillData.discount_percent || ""}
                  onChange={(e) =>
                    setEditingBillData({
                      ...editingBillData,
                      discount_percent: parseFloat(e.target.value) || 0,
                    })
                  }
                  min="0"
                  max="100"
                  className="h-10 border-border/80 rounded-xl focus-visible:ring-1 focus-visible:ring-amber-500 focus-visible:border-amber-500 transition-all duration-200"
                />
              </div>
              <div className="space-y-2 relative">
                <Label className="text-xs font-bold text-muted-foreground/80 uppercase tracking-wider">Doctor</Label>
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
                  onFocus={() => setShowDoctorSuggestions(true)}
                  onBlur={() =>
                    setTimeout(() => setShowDoctorSuggestions(false), 200)
                  }
                  className="h-10 border-border/80 rounded-xl focus-visible:ring-1 focus-visible:ring-amber-500 focus-visible:border-amber-500 transition-all duration-200"
                />
                {showDoctorSuggestions &&
                  doctorSuggestions.length > 0 && (
                    <div className="absolute z-[100] w-full mt-1 bg-card/95 backdrop-blur-md border border-border shadow-xl rounded-xl max-h-48 overflow-y-auto top-full overflow-x-hidden transition-all duration-150 animate-in fade-in slide-in-from-top-2">
                      {doctorSuggestions.map((doc, idx) => (
                        <div
                          key={idx}
                          className="p-2.5 hover:bg-amber-500/10 cursor-pointer border-b border-border/50 last:border-0 transition-colors duration-150"
                          onMouseDown={() => {
                            setEditingBillData({
                              ...editingBillData,
                              doctor: doc.name,
                            });
                            setDoctorSearch("");
                            setShowDoctorSuggestions(false);
                          }}
                        >
                          <p className="font-semibold text-sm">{doc.name}</p>
                        </div>
                      ))}
                    </div>
                  )}
              </div>
            </div>

            {/* Items Table - Inline Editable */}
            <div className="border border-border/70 rounded-xl overflow-hidden shadow-sm bg-background/50 backdrop-blur-md mt-4">
              <Table wrapperClassName="max-h-[300px]">
                <TableHeader className="sticky top-0 bg-muted/90 backdrop-blur-md z-[50] border-b border-border/80">
                  <TableRow className="hover:bg-transparent border-b border-border/80">
                    <TableHead className="w-[180px] font-bold text-foreground/80 text-xs uppercase tracking-wider">
                      Product *
                    </TableHead>
                    <TableHead className="w-[100px] font-bold text-foreground/80 text-xs uppercase tracking-wider">
                      Salt
                    </TableHead>
                    <TableHead className="w-[70px] font-bold text-foreground/80 text-xs uppercase tracking-wider">
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
                    <TableHead className="w-[60px] text-center font-bold text-foreground/80 text-xs uppercase tracking-wider">
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
                                className="bg-card/95 backdrop-blur-xl border border-border/80 rounded-xl shadow-2xl overflow-y-auto z-[99999] animate-in fade-in slide-in-from-top-2 duration-150"
                                onMouseEnter={() => setIsMouseOverEditingSuggestions(true)}
                                onMouseLeave={() => {
                                  setIsMouseOverEditingSuggestions(false);
                                  const activeInput = editingInputRefs.current[activeEditingItemId];
                                  if (activeInput && document.activeElement !== activeInput) {
                                    setShowEditingInventorySuggestions(false);
                                    setActiveEditingItemId(null);
                                  }
                                }}
                                style={{
                                  position: "fixed",
                                  top: dropdownPosition.top,
                                  left: dropdownPosition.left,
                                  width: dropdownPosition.width || 400,
                                  maxHeight: "260px",
                                  transform: dropdownPosition.transform || "none",
                                }}
                              >
                                {/* Manual Entry Option */}
                                {editingInventorySearch &&
                                  editingInventorySearch.length >= 2 && (
                                    <div
                                      id="suggestion-edit-0"
                                      className={`p-3 cursor-pointer border-b border-border transition-colors duration-150 ${highlightedEditingSuggestion === 0 ? "bg-amber-500/20 text-amber-600 font-semibold" : "hover:bg-amber-500/10 bg-amber-500/5 text-amber-600"}`}
                                      onMouseDown={(e) => {
                                        e.preventDefault();
                                        handleManualEntryForEdit(
                                          item.id,
                                          editingInventorySearch
                                        );
                                      }}
                                      onMouseEnter={() =>
                                        setHighlightedEditingSuggestion(0)
                                      }
                                    >
                                      <div className="flex items-center gap-2">
                                        <Plus className="w-4 h-4 text-amber-500" />
                                        <div>
                                          <p className="font-semibold text-sm">
                                            Manual Entry: "{editingInventorySearch}"
                                          </p>
                                          <p className="text-xs text-muted-foreground font-normal">
                                            Add item not in inventory
                                          </p>
                                        </div>
                                      </div>
                                    </div>
                                  )}

                                {/* Inventory Items */}
                                {editingInventorySuggestions.map(
                                  (invItem, suggIdx) => (
                                    <div
                                      key={invItem.id}
                                      id={`suggestion-edit-${suggIdx + 1}`}
                                      className={`p-3 cursor-pointer border-b border-border/60 last:border-0 transition-colors duration-150 ${highlightedEditingSuggestion === suggIdx + 1 ? "bg-amber-500/20" : "hover:bg-amber-500/10"}`}
                                      onMouseDown={(e) => {
                                        e.preventDefault();
                                        handleSelectInventoryForEditRow(
                                          item.id,
                                          invItem
                                        );
                                      }}
                                      onMouseEnter={() =>
                                        setHighlightedEditingSuggestion(
                                          suggIdx + 1
                                        )
                                      }
                                    >
                                      <div className="flex justify-between items-start gap-4">
                                        <div className="space-y-0.5">
                                          <p className="font-semibold text-sm text-foreground">
                                            {invItem.product_name}
                                          </p>
                                          {invItem.supplier_name && (
                                            <p className="text-xs text-amber-600 font-bold flex items-center gap-1">
                                              <span className="w-1 h-1 rounded-full bg-amber-500" />
                                              Supplier:{" "}
                                              {invItem.supplier_name.length > 18
                                                ? invItem.supplier_name
                                                    .split(" ")
                                                    .map((word) => word[0])
                                                    .join("")
                                                    .toUpperCase()
                                                : invItem.supplier_name}
                                            </p>
                                          )}
                                          {invItem.salt_composition && (
                                            <p className="text-xs text-muted-foreground font-medium italic">
                                              {invItem.salt_composition.slice(
                                                0,
                                                40
                                              )}
                                              {invItem.salt_composition.length > 40 ? "..." : ""}
                                            </p>
                                          )}
                                          <p className="text-xs text-muted-foreground/80">
                                            Batch: <span className="font-mono">{invItem.batch_no}</span> | Exp:{" "}
                                            <span className="font-mono">{invItem.expiry_date}</span>
                                          </p>
                                        </div>
                                        <div className="text-right shrink-0">
                                          <p className="font-mono text-amber-600 font-bold text-sm">
                                            ₹
                                            {Number(
                                              invItem.mrp_per_unit ||
                                                invItem.mrp || 0
                                            )
                                              .toFixed(2)
                                              .replace(/\.00$/, "")}
                                            /unit
                                          </p>
                                          <p className="text-xs font-bold mt-0.5">
                                            {(invItem.available_quantity ||
                                              invItem.available_units ||
                                              0) > 0 ? (
                                              <span className="text-emerald-500">
                                                {invItem.available_quantity || invItem.available_units} units
                                              </span>
                                            ) : (
                                              <span className="text-destructive font-bold">
                                                Out of Stock
                                              </span>
                                            )}
                                          </p>
                                          <p className="text-xs text-blue-500 font-bold mt-0.5">
                                            Rate: ₹
                                            {Number(
                                              invItem.purchase_price || 0
                                            ).toFixed(2)}
                                          </p>
                                        </div>
                                      </div>
                                    </div>
                                  )
                                )}
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
                          {(!item.is_manual && item.available_batches && item.available_batches.length > 0) ? (
                            <Select
                              value={item.inventory_id}
                              onValueChange={(selectedInvId) => {
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
                            >
                              <SelectTrigger className="h-8 text-xs font-mono border-border/80 rounded-lg w-28">
                                <SelectValue placeholder="Select Batch" />
                              </SelectTrigger>
                              <SelectContent className="border border-border/40 shadow-xl rounded-xl z-[99999]">
                                {item.available_batches.slice(0, visibleBatchesLimit[item.id] || 10).map((b) => (
                                  <SelectItem key={b.id} value={b.id} className="text-xs font-mono">
                                    {b.batch_no} ({b.available_quantity || 0} units, exp: {b.expiry_date || "N/A"}{b.supplier_name ? `, Supp: ${b.supplier_name}` : ""})
                                  </SelectItem>
                                ))}
                                {item.available_batches.length > (visibleBatchesLimit[item.id] || 10) && (
                                  <div className="p-1 border-t border-border/20">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="w-full h-7 text-[10px] font-bold text-amber-500 hover:text-amber-600 hover:bg-amber-500/5 transition-all"
                                      onMouseDown={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setVisibleBatchesLimit(prev => ({
                                          ...prev,
                                          [item.id]: (visibleBatchesLimit[item.id] || 10) + 10
                                        }));
                                      }}
                                    >
                                      Show More Batches...
                                    </Button>
                                  </div>
                                )}
                              </SelectContent>
                            </Select>
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
                          ) : (
                            <span className="text-xs font-semibold text-emerald-500">
                              {available > 0 ? available : "Out of Stock"}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Input
                            type="date"
                            value={item.expiry_date || ""}
                            onChange={(e) =>
                              handleEditItemFieldChange(
                                item.id,
                                "expiry_date",
                                e.target.value
                              )
                            }
                            className="h-8 text-xs text-center border-border/80 focus-visible:ring-1 focus-visible:ring-amber-500 focus-visible:border-amber-500 rounded-lg transition-all duration-200 w-28"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
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
                      disabled={settings?.billing_payment_mode_mandatory}
                      onCheckedChange={(v) =>
                        setEditingBillData({
                          ...editingBillData,
                          is_paid: v,
                          due_date: v ? null : editingBillData.due_date,
                          payment_mode: v ? editingBillData.payment_mode : "",
                        })
                      }
                    />
                    <Label htmlFor="editIsPaid" className="text-sm font-semibold text-foreground/80 cursor-pointer select-none">
                      Paid
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
                      disabled={!editingBillData.is_paid}
                    >
                      <SelectTrigger className="h-9 w-36 bg-muted/20 border border-border/50 rounded-xl text-xs font-semibold" disabled={!editingBillData.is_paid}>
                        <SelectValue placeholder="Payment Mode" />
                      </SelectTrigger>
                      <SelectContent>
                        {!settings?.billing_payment_mode_mandatory && (
                          <SelectItem value="none">None</SelectItem>
                        )}
                        <SelectItem value="Cash">Cash</SelectItem>
                        <SelectItem value="UPI">UPI</SelectItem>
                        <SelectItem value="Card">Card</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

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
                    <span>Discount ({editDiscountPercent}%)</span>
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
                      onChange={(e) => setEditGrandTotalInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.target.blur();
                        }
                      }}
                      onBlur={() => {
                        setIsEditingEditGrandTotal(false);
                        const newGrandTotal = parseFloat(editGrandTotalInput);
                        if (!editSubtotal || editSubtotal <= 0) return;
                        if (isNaN(newGrandTotal)) {
                          setEditGrandTotalInput(editGrandTotal.toFixed(2));
                          return;
                        }
                        if (newGrandTotal > editSubtotal) {
                          setEditingBillData({
                            ...editingBillData,
                            discount_percent: 0,
                          });
                          return;
                        }
                        if (newGrandTotal < 0) {
                          setEditGrandTotalInput(editGrandTotal.toFixed(2));
                          return;
                        }
                        const discountPercent =
                          ((editSubtotal - newGrandTotal) / editSubtotal) * 100;

                        setEditingBillData({
                          ...editingBillData,
                          discount_percent: parseFloat(
                            discountPercent.toFixed(2)
                          ),
                        });
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

            {/* Submit moved to fixed footer */}
          </CardContent>
        </Card>
      )}

      {!showNewBill && !editingBillId && (
        <Card className="glass bg-card/45 backdrop-blur-xl border border-border/70 shadow-lg rounded-2xl p-6 mb-6">
          <div className="flex flex-col gap-5">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search bills by bill number, customer, doctor, batch, product, notes..."
                    className="pl-10 h-10 border-border/80 rounded-xl focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary transition-all duration-200 bg-background/50"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-5">
              <div className="space-y-2">
                <Label className="text-xs font-bold text-muted-foreground/80 uppercase tracking-wider">Filter Customer</Label>
                <div className="mt-1">
                  <Select
                    value={filterCustomer}
                    onValueChange={handleCustomerFilterChange}
                  >
                    <SelectTrigger className="w-52 h-10 border-border/80 rounded-xl focus:ring-1 focus:ring-primary focus:border-primary transition-all duration-200 bg-background/50">
                      <SelectValue placeholder="All Customers" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Customers</SelectItem>
                      {customers?.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name || c.mobile || "Unknown"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold text-muted-foreground/80 uppercase tracking-wider">From Date</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setPage(1);
                    setStartDate(e.target.value);
                  }}
                  className="h-10 border-border/80 rounded-xl focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary transition-all duration-200 bg-background/50 w-44"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold text-muted-foreground/80 uppercase tracking-wider">To Date</Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => {
                    setPage(1);
                    setEndDate(e.target.value);
                  }}
                  className="h-10 border-border/80 rounded-xl focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary transition-all duration-200 bg-background/50 w-44"
                />
              </div>

              <div className="flex gap-2 h-10 items-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const today = new Date().toISOString().slice(0, 10);
                    setStartDate(today);
                    setEndDate(today);
                    setPage(1);
                  }}
                  className="h-10 text-xs font-bold border-border/80 hover:bg-muted rounded-xl transition-all"
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
                  className="h-10 text-xs font-bold border-border/80 hover:bg-muted rounded-xl transition-all"
                >
                  Yesterday
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearchQuery("");
                    setStartDate("");
                    setEndDate("");
                    handleCustomerFilterChange("all");
                    setPage(1);
                  }}
                  className="h-10 text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-xl transition-all"
                >
                  Reset Filter
                </Button>
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
                            <Table>
                              <TableHeader className="bg-muted/40">
                                <TableRow>
                                  <TableHead className="w-12 text-center text-xs font-bold text-muted-foreground uppercase tracking-wider">
                                    #
                                  </TableHead>
                                  <TableHead className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Product Name</TableHead>
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
        </Card>
      )}

      {!showNewBill && !editingBillId && (
        <Card className="data-table glass bg-card/45 backdrop-blur-xl border border-border/70 shadow-lg rounded-2xl overflow-hidden mt-6">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow className="border-b border-border/60">
                  <TableHead className="w-12"></TableHead>
                  <TableHead className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Bill No / Timestamp</TableHead>
                  <TableHead className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Customer</TableHead>
                  <TableHead className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Items</TableHead>
                  <TableHead className="text-right text-xs font-bold text-muted-foreground uppercase tracking-wider">Amount</TableHead>
                  <TableHead className="text-right text-xs font-bold text-muted-foreground uppercase tracking-wider">Profit</TableHead>
                  <TableHead className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Status</TableHead>
                  <TableHead className="text-center text-xs font-bold text-muted-foreground uppercase tracking-wider">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className={tableLoading ? "opacity-50 pointer-events-none transition-opacity duration-200" : "transition-opacity duration-200"}>
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
                            <div className="text-[11px] text-muted-foreground font-medium mt-0.5">
                              {new Date(bill.created_at || bill.billing_date || new Date()).toLocaleString("en-IN", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                                hour12: true
                              })}
                            </div>
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
                            ₹{bill.profit.toFixed(2)}
                          </TableCell>

                          <TableCell className="text-center">
                            <div>
                              {bill.is_paid ? (
                                <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20 rounded-full font-bold px-2.5 py-0.5 text-xs transition-colors">
                                  Paid
                                </Badge>
                              ) : (
                                <Badge className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 hover:bg-amber-500/20 rounded-full font-bold px-2.5 py-0.5 text-xs transition-colors">
                                  Unpaid
                                </Badge>
                              )}
                            </div>
                            {bill.payment_mode && bill.payment_mode !== "none" && (
                              <div className="text-[10px] text-muted-foreground/80 mt-1 font-bold uppercase tracking-wider">
                                {bill.payment_mode}
                              </div>
                            )}
                          </TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <div className="flex justify-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleStartEditBill(bill)}
                                title="Edit Bill"
                                className="h-8 w-8 rounded-xl hover:bg-amber-500/10 text-muted-foreground hover:text-amber-600 transition-all duration-200"
                                data-testid={`edit-bill-${bill.id}`}
                              >
                                <Edit2 className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleGeneratePdf(bill.id)}
                                title="Generate PDF"
                                className="h-8 w-8 rounded-xl hover:bg-primary/10 text-muted-foreground hover:text-primary transition-all duration-200"
                                data-testid={`pdf-btn-${bill.id}`}
                              >
                                <FileText className="w-4 h-4" />
                              </Button>
                              {!bill.is_paid && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleMarkPaid(bill.id)}
                                  title="Mark as Paid"
                                  className="h-8 w-8 rounded-xl hover:bg-emerald-500/10 text-muted-foreground hover:text-emerald-600 transition-all duration-200"
                                  data-testid={`mark-paid-btn-${bill.id}`}
                                >
                                  <Receipt className="w-4 h-4" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() =>
                                  setDeleteDialog({ open: true, bill })
                                }
                                title="Delete Bill"
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
                              <div className="p-6 pl-12">
                                <p className="text-xs font-bold text-muted-foreground/80 uppercase tracking-wider mb-3">
                                  Items Sold
                                </p>
                                <div className="border border-border/50 rounded-xl overflow-hidden bg-background/30">
                                  <Table>
                                    <TableHeader className="bg-muted/40">
                                      <TableRow className="border-b border-border/40">
                                        <TableHead className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
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
                                        ⚠️{" "}
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
            <div className="flex items-center justify-between px-6 py-4 border-t border-border/40 bg-muted/5">
              <div className="text-xs font-bold text-muted-foreground/80">
                Showing {((page - 1) * limit) + 1} to {Math.min(page * limit, totalBills)} of {totalBills} bills
              </div>
              
              <div className="flex items-center gap-2">
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
          <AlertDialogFooter className="flex-col sm:flex-row gap-2 mt-4">
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
        <AlertDialogContent className="glass bg-card/95 backdrop-blur-xl border border-border/80 shadow-2xl rounded-2xl p-6">
          <AlertDialogHeader className="space-y-3">
            <AlertDialogTitle className="text-xl font-bold flex items-center gap-2 text-primary">
              <FileText className="w-5 h-5 text-primary" />
              Generate Bill PDF
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-muted-foreground/90 font-medium leading-relaxed">
              Would you like to generate and view a PDF receipt for this newly recorded bill?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 mt-4">
            <AlertDialogCancel className="rounded-xl border-border/80 hover:bg-muted/80 h-10 px-4 transition-all">
              Skip
            </AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-gradient-to-r from-primary to-primary/90 hover:from-primary/95 hover:to-primary text-primary-foreground shadow-md shadow-primary/20 h-10 px-4 font-semibold transition-all hover:scale-[1.02] active:scale-[0.98]"
              onClick={async () => {
                if (!pdfConfirmDialog.billId) return;
                try {
                  const pdfRes = await axios.post(
                    `${API}/bills/${pdfConfirmDialog.billId}/pdf`
                  );
                  if (pdfRes.data.pdf_url) {
                    window.open(pdfRes.data.pdf_url, "_blank");
                  }
                } catch (e) {
                  toast.error("Failed to generate PDF");
                }
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

      {/* TABS & ACTION NAVBAR */}
      {(showNewBill || editingBillId) && createPortal(
        <div className="fixed bottom-0 left-0 md:left-[250px] right-0 z-[100] flex items-center justify-between bg-card/95 backdrop-blur-md border-t border-border shadow-[0_-8px_30px_rgba(0,0,0,0.12)] px-6 py-4 gap-4 overflow-x-auto scroller-hide overflow-y-hidden mb-0 transition-all duration-300">
          <div className="flex items-center gap-2 overflow-x-auto scroller-hide">
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
                      className={`pr-8 h-9 ${isActive ? "shadow-md ring-1 ring-primary/50" : "opacity-80 hover:opacity-100"}`}
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
                className="bg-primary/5 hover:bg-primary/10 border-primary/20 text-primary shrink-0 transition-colors shadow-sm h-9"
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

          <div className="flex items-center gap-3 shrink-0 ml-auto border-l border-border pl-6">
            <Button
              variant="ghost"
              onClick={showNewBill ? handleCancelNewBill : handleCancelEditBill}
              className="text-muted-foreground hover:text-foreground"
            >
              Cancel (Esc)
            </Button>

            {showNewBill ? (
              <Button
                onClick={handleSubmitBill}
                disabled={submitting || validItems.length === 0}
                className="btn-primary shadow-lg shadow-primary/20 min-w-[140px]"
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
                    <kbd className="hidden sm:inline-block ml-1 opacity-70 text-[9px] font-mono border border-white/20 px-1 rounded">
                      {getOS() === "mac" ? "⌘Enter" : "Ctrl+Enter"}
                    </kbd>
                  </div>
                )}
              </Button>
            ) : (
              <Button
                onClick={handleSaveEditBill}
                disabled={submitting || validEditItems.length === 0}
                className="btn-primary bg-yellow-600 hover:bg-yellow-700 shadow-lg shadow-yellow-600/20 min-w-[140px]"
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
                    <kbd className="hidden sm:inline-block ml-1 opacity-70 text-[9px] font-mono border border-white/20 px-1 rounded">
                      Alt+U
                    </kbd>
                  </div>
                )}
              </Button>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
