import React, { useState, useEffect, useRef, useCallback } from "react";
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
import { Checkbox } from "../components/ui/checkbox";
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
} from "lucide-react";
import { toast } from "sonner";

const LOCAL_STORAGE_KEY_BILL = "pharmalogy_bill_draft";

export default function BillingPage() {
  // Data state
  const [bills, setBills] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
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
  const [billDiscount, setBillDiscount] = useState(0);
  const [isPaid, setIsPaid] = useState(true);

  // New item row state
  const [newItemRow, setNewItemRow] = useState(null);
  const [inventorySearch, setInventorySearch] = useState("");
  const [inventorySuggestions, setInventorySuggestions] = useState([]);
  const [showInventorySuggestions, setShowInventorySuggestions] =
    useState(false);

  // Customer search
  const [customerSearch, setCustomerSearch] = useState("");
  const [showCustomerSuggestions, setShowCustomerSuggestions] = useState(false);

  // Edit bill dialog
  const [editingBill, setEditingBill] = useState(null);

  // Delete dialog
  const [deleteDialog, setDeleteDialog] = useState({ open: false, bill: null });

  // Expanded bill rows
  const [expandedBills, setExpandedBills] = useState({});

  // Restore draft dialog
  const [showRestoreDialog, setShowRestoreDialog] = useState(false);
  const [draftData, setDraftData] = useState(null);

  // Refs for keyboard navigation
  const productInputRef = useRef(null);
  const quantityInputRef = useRef(null);

  // Keyboard shortcuts info
  const [showShortcuts, setShowShortcuts] = useState(false);

  // Dropdown keyboard navigation
  const [activeDropdownIndex, setActiveDropdownIndex] = useState(-1);
  const [highlightedSuggestion, setHighlightedSuggestion] = useState(-1);

  const emptyItem = {
    id: "",
    inventory_id: "",
    product_name: "",
    batch_no: "",
    expiry_date: "",
    quantity: 1,
    unit_price: 0,
    purchase_price: 0,
    available: 0,
    discount_percent: 0,
    is_manual: false, // Flag for manual entry (not from inventory)
    salt_composition: "",
  };

  // Check for saved draft on mount
  useEffect(() => {
    const savedDraft = localStorage.getItem(LOCAL_STORAGE_KEY_BILL);
    if (savedDraft) {
      try {
        const draft = JSON.parse(savedDraft);
        if (draft.items?.length > 0 || draft.customer?.customer_name) {
          setDraftData(draft);
          setShowRestoreDialog(true);
        }
      } catch (e) {
        localStorage.removeItem(LOCAL_STORAGE_KEY_BILL);
      }
    }
  }, []);

  // Auto-save draft when data changes
  useEffect(() => {
    if (showNewBill && (billItems.length > 0 || customerInfo.customer_name)) {
      const draft = {
        customer: customerInfo,
        items: billItems,
        discount: billDiscount,
        isPaid: isPaid,
        savedAt: new Date().toISOString(),
      };
      localStorage.setItem(LOCAL_STORAGE_KEY_BILL, JSON.stringify(draft));
    }
  }, [showNewBill, billItems, customerInfo, billDiscount, isPaid]);

  const clearDraft = () => {
    localStorage.removeItem(LOCAL_STORAGE_KEY_BILL);
  };

  const handleRestoreDraft = () => {
    if (draftData) {
      setShowNewBill(true);
      setCustomerInfo(
        draftData.customer || {
          customer_id: "",
          customer_name: "",
          customer_mobile: "",
          customer_email: "",
        }
      );
      setBillItems(draftData.items || []);
      setBillDiscount(draftData.discount || 0);
      setIsPaid(draftData.isPaid !== false);
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

  useEffect(() => {
    fetchData();

    // Global keyboard shortcuts
    const handleKeyDown = (e) => {
      // Alt+N - New bill
      if (e.altKey && e.key === "n") {
        e.preventDefault();
        handleStartNewBill();
      }
      // Alt+S - Save bill
      if (e.altKey && e.key === "s" && showNewBill) {
        e.preventDefault();
        handleSubmitBill();
      }
      // Escape - Cancel
      if (e.key === "Escape") {
        if (newItemRow) {
          handleCancelAddItem();
        } else if (showNewBill) {
          handleCancelNewBill();
        }
      }
      // Alt+A - Add item (when in new bill mode)
      if (e.altKey && e.key === "a" && showNewBill && !newItemRow) {
        e.preventDefault();
        handleStartAddItem();
      }
      // Alt+? - Show shortcuts
      if (e.altKey && e.key === "/") {
        e.preventDefault();
        setShowShortcuts(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showNewBill, newItemRow]);

  // Server-side inventory search
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

  const fetchData = async () => {
    try {
      const [billsRes, custRes] = await Promise.all([
        axios.get(`${API}/bills`),
        axios.get(`${API}/customers`),
      ]);

      setBills(billsRes.data.bills);
      setCustomers(custRes.data.customers);
    } catch (error) {
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
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
    setShowNewBill(true);
    // Start with one default empty row
    const defaultRow = { ...emptyItem, id: `temp-${Date.now()}` };
    setBillItems([defaultRow]);
    setCustomerInfo({
      customer_id: "",
      customer_name: "",
      customer_mobile: "",
      customer_email: "",
    });
    setBillDiscount(0);
    setIsPaid(true);
    setNewItemRow(null);
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
    setBillItems((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;

        const qty = parseInt(item.quantity) || 1;
        const unitPrice = inventoryItem.mrp_per_unit || inventoryItem.mrp || 0;
        const purchasePrice =
          inventoryItem.cost_per_unit || inventoryItem.purchase_price || 0;

        return {
          ...item,
          inventory_id: inventoryItem.id,
          product_name: inventoryItem.product_name,
          salt_composition: inventoryItem.salt_composition || "",
          batch_no: inventoryItem.batch_no,
          expiry_date: inventoryItem.expiry_date || "",
          unit_price: unitPrice,
          purchase_price: purchasePrice,
          available:
            inventoryItem.available_quantity ||
            inventoryItem.available_units ||
            0,
          units_per_pack: inventoryItem.units_per_pack || 1,
          is_manual: false,
        };
      })
    );
    setInventorySearch("");
    setInventorySuggestions([]);
    setShowInventorySuggestions(false);
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
          available: 0, // No inventory available
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
    // Focus on price input for manual entry
    setTimeout(() => quantityInputRef.current?.focus(), 100);
  };

  // Handle dropdown keyboard navigation
  const handleDropdownKeyDown = (e, itemId) => {
    if (!showInventorySuggestions) return;

    // Total options = 1 (manual entry) + inventory suggestions
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
        // Manual entry selected
        handleManualEntry(itemId, inventorySearch);
      } else if (
        highlightedSuggestion > 0 &&
        inventorySuggestions[highlightedSuggestion - 1]
      ) {
        // Inventory item selected
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
    setNewItemRow({
      ...newItemRow,
      inventory_id: item.id,
      product_name: item.product_name,
      salt_composition: item.salt_composition || "",
      batch_no: item.batch_no,
      expiry_date: item.expiry_date || "",
      unit_price: item.mrp_per_unit || item.mrp || 0,
      purchase_price: item.cost_per_unit || item.purchase_price || 0,
      available: item.available_quantity || item.available_units || 0,
      units_per_pack: item.units_per_pack || 1,
    });
    setInventorySearch("");
    setInventorySuggestions([]);
    setShowInventorySuggestions(false);
    // Focus quantity input
    setTimeout(() => quantityInputRef.current?.focus(), 100);
  };

  const handleSelectCustomer = (customer) => {
    setCustomerInfo({
      customer_id: customer.id,
      customer_name: customer.name,
      customer_mobile: customer.mobile,
      customer_email: customer.email || "",
    });
    setCustomerSearch("");
    setShowCustomerSuggestions(false);
  };

  // Handle item field change for editable rows
  const handleItemFieldChange = (itemId, field, value) => {
    setBillItems((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;

        const updated = { ...item, [field]: value };

        // Recalculate totals when quantity, price, or discount changes
        if (
          field === "quantity" ||
          field === "unit_price" ||
          field === "discount_percent"
        ) {
          const qty = parseInt(updated.quantity) || 1;
          const unitPrice = parseFloat(updated.unit_price) || 0;
          const discPercent = parseFloat(updated.discount_percent) || 0;
          const purchasePrice = parseFloat(updated.purchase_price) || 0;

          const itemTotal = qty * unitPrice;
          const itemDiscount = itemTotal * (discPercent / 100);
          updated.net_total = itemTotal - itemDiscount;
          updated.profit = (unitPrice - purchasePrice) * qty - itemDiscount;
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

    const itemTotal = newItemRow.quantity * newItemRow.unit_price;
    const itemDiscount = itemTotal * (newItemRow.discount_percent / 100);

    const item = {
      ...newItemRow,
      net_total: itemTotal - itemDiscount,
      profit:
        (newItemRow.unit_price - newItemRow.purchase_price) *
        newItemRow.quantity,
    };

    setBillItems((prev) => [...prev, item]);
    setNewItemRow(null);
    setInventorySearch("");
  };

  const handleRemoveItem = (itemId) => {
    setBillItems((prev) => prev.filter((item) => item.id !== itemId));
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
        // Move to next focusable element
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

  const handleSubmitBill = async () => {
    if (!customerInfo.customer_name || !customerInfo.customer_mobile) {
      toast.error("Please enter customer name and mobile");
      return;
    }

    // Filter out empty rows (rows without product_name)
    const validItems = billItems.filter(
      (item) => item.product_name && item.product_name.trim() !== ""
    );

    if (validItems.length === 0) {
      toast.error("Please add at least one item with a product");
      return;
    }

    setSubmitting(true);
    try {
      const response = await axios.post(`${API}/bills`, {
        customer_id: customerInfo.customer_id || null,
        customer_name: customerInfo.customer_name,
        customer_mobile: customerInfo.customer_mobile,
        customer_email: customerInfo.customer_email || null,
        items: validItems.map(
          ({
            id,
            net_total,
            profit,
            available,
            units_per_pack,
            salt_composition,
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
          })
        ),
        discount_percent: billDiscount,
        is_paid: isPaid,
      });

      toast.success(`Bill ${response.data.bill.bill_no} created successfully`);

      // Ask to generate PDF
      if (window.confirm("Generate PDF for this bill?")) {
        try {
          const pdfRes = await axios.post(
            `${API}/bills/${response.data.bill.id}/pdf`
          );
          if (pdfRes.data.pdf_url) {
            window.open(pdfRes.data.pdf_url, "_blank");
          }
        } catch (e) {
          toast.error("Failed to generate PDF");
        }
      }

      handleCancelNewBill();
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to create bill");
    } finally {
      setSubmitting(false);
    }
  };

  // ============ EDIT BILL ============

  const handleStartEditBill = (bill) => {
    setEditingBill({
      ...bill,
      customer_name: bill.customer_name || "",
      customer_mobile: bill.customer_mobile || "",
      customer_email: bill.customer_email || "",
      discount_percent: bill.discount_percent || 0,
      notes: bill.notes || "",
    });
  };

  const handleSaveEditBill = async () => {
    if (!editingBill) return;

    setSubmitting(true);
    try {
      await axios.put(`${API}/bills/${editingBill.id}`, {
        customer_name: editingBill.customer_name,
        customer_mobile: editingBill.customer_mobile,
        customer_email: editingBill.customer_email,
        discount_percent: parseFloat(editingBill.discount_percent) || 0,
        is_paid: editingBill.is_paid,
        notes: editingBill.notes,
      });

      toast.success("Bill updated successfully");
      setEditingBill(null);
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

  // Calculate totals - only for items with product_name
  const validItems = billItems.filter(
    (item) => item.product_name && item.product_name.trim() !== ""
  );
  const subtotal = validItems.reduce((sum, item) => {
    const qty = parseInt(item.quantity) || 0;
    const unitPrice = parseFloat(item.unit_price) || 0;
    const discPercent = parseFloat(item.discount_percent) || 0;
    const itemTotal = qty * unitPrice * (1 - discPercent / 100);
    return sum + itemTotal;
  }, 0);
  const discountAmount = subtotal * (billDiscount / 100);
  const grandTotal = subtotal - discountAmount;

  // Calculate profit: (selling price - cost) for each item, then apply bill discount
  const itemProfitBeforeDiscount = validItems.reduce((sum, item) => {
    const qty = parseInt(item.quantity) || 0;
    const unitPrice = parseFloat(item.unit_price) || 0;
    const purchasePrice = parseFloat(item.purchase_price) || 0;
    const discPercent = parseFloat(item.discount_percent) || 0;
    // Item profit = (MRP - Cost) * Qty * (1 - item discount)
    return sum + (unitPrice - purchasePrice) * qty * (1 - discPercent / 100);
  }, 0);
  // Bill discount reduces the profit proportionally
  const totalProfit = itemProfitBeforeDiscount * (1 - billDiscount / 100);

  // Calculate inventory vs negative billing totals
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in" data-testid="billing-page">
      {/* Restore Draft Dialog */}
      <AlertDialog open={showRestoreDialog} onOpenChange={setShowRestoreDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <RotateCcw className="w-5 h-5 text-primary" />
              Restore Previous Bill?
            </AlertDialogTitle>
            <AlertDialogDescription>
              You have an unsaved bill from{" "}
              {draftData?.savedAt
                ? new Date(draftData.savedAt).toLocaleString()
                : "earlier"}
              .
              <br />
              <span className="text-foreground font-medium">
                {draftData?.items?.length || 0} items, Customer:{" "}
                {draftData?.customer?.customer_name || "None"}
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

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Billing</h1>
          <p className="text-muted-foreground">
            {bills.length} bills generated
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
            className="btn-primary"
            onClick={handleStartNewBill}
            data-testid="new-bill-btn"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Bill (Alt+N)
          </Button>
        </div>
      </div>

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
              <span>New Bill</span>
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
              <span>Save Bill</span>
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

      {/* New Bill - Inline Table Entry */}
      {showNewBill && (
        <Card
          className="border-primary/30 bg-primary/5"
          data-testid="new-bill-form"
        >
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <ShoppingCart className="w-5 h-5" />
                New Bill
              </CardTitle>
              <Button variant="ghost" size="icon" onClick={handleCancelNewBill}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Customer Info */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-2 relative">
                <Label className="flex items-center gap-1">
                  <User className="w-3 h-3" /> Customer
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
                  data-testid="customer-search"
                />
                {showCustomerSuggestions &&
                  customerSearch &&
                  filteredCustomers.length > 0 && (
                    <div className="absolute z-50 w-full mt-1 bg-card border border-border rounded-lg shadow-xl max-h-48 overflow-y-auto top-full">
                      {filteredCustomers.slice(0, 5).map((customer) => (
                        <div
                          key={customer.id}
                          className="p-2 hover:bg-primary/10 cursor-pointer border-b border-border last:border-0"
                          onMouseDown={() => handleSelectCustomer(customer)}
                        >
                          <p className="font-medium text-sm">{customer.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {customer.mobile}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
              </div>
              <div className="space-y-2">
                <Label>Name *</Label>
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
                  data-testid="customer-name"
                />
              </div>
              <div className="space-y-2">
                <Label>Mobile *</Label>
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
                  data-testid="customer-mobile"
                />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
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
                />
              </div>
            </div>

            {/* Items Table - Inline Editable */}
            <div
              className="border border-border rounded-lg relative"
              style={{ overflow: "visible" }}
            >
              <div
                className="max-h-[350px] overflow-x-auto"
                style={{ overflowY: "visible" }}
              >
                <Table>
                  <TableHeader className="sticky top-0 bg-muted/95 backdrop-blur z-10">
                    <TableRow>
                      <TableHead className="w-[180px] font-bold text-foreground">
                        Product *
                      </TableHead>
                      <TableHead className="w-[100px] font-bold text-foreground">
                        Salt
                      </TableHead>
                      <TableHead className="w-[70px] font-bold text-foreground">
                        Batch
                      </TableHead>
                      <TableHead className="w-[60px] text-center font-bold text-foreground">
                        Avail.
                      </TableHead>
                      <TableHead className="w-[60px] text-center font-bold text-foreground">
                        Qty *
                      </TableHead>
                      <TableHead className="w-[80px] text-center font-bold text-foreground">
                        Cost/Unit
                      </TableHead>
                      <TableHead className="w-[80px] text-center font-bold text-foreground">
                        MRP/Unit *
                      </TableHead>
                      <TableHead className="w-[60px] text-center font-bold text-foreground">
                        Disc %
                      </TableHead>
                      <TableHead className="w-[80px] text-right font-bold text-foreground">
                        Total
                      </TableHead>
                      <TableHead className="w-[60px] text-center font-bold text-foreground">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {/* Editable Item Rows */}
                    {billItems.map((item, index) => {
                      const qty = parseInt(item.quantity) || 0;
                      const unitPrice = parseFloat(item.unit_price) || 0;
                      const discPercent =
                        parseFloat(item.discount_percent) || 0;
                      const purchasePrice =
                        parseFloat(item.purchase_price) || 0;
                      const itemTotal =
                        qty * unitPrice * (1 - discPercent / 100);
                      const available = parseInt(item.available) || 0;

                      // Calculate inventory vs negative billing
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
                            hasOverflow ? "bg-yellow-500/10" : "bg-primary/5"
                          }
                        >
                          <TableCell
                            className="relative"
                            style={{ overflow: "visible" }}
                          >
                            <Input
                              ref={
                                index === billItems.length - 1
                                  ? productInputRef
                                  : null
                              }
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
                              }}
                              onBlur={() =>
                                setTimeout(
                                  () => setShowInventorySuggestions(false),
                                  200
                                )
                              }
                              onKeyDown={(e) =>
                                handleDropdownKeyDown(e, item.id)
                              }
                              placeholder="Search product or salt..."
                              className="h-8 text-xs"
                              data-testid={`item-product-${index}`}
                              autoComplete="off"
                            />
                            {/* Search Suggestions Dropdown */}
                            {showInventorySuggestions &&
                              index === billItems.length - 1 && (
                                <div
                                  className="fixed bg-card border border-border rounded-lg shadow-2xl max-h-64 overflow-y-auto"
                                  style={{
                                    width: "400px",
                                    zIndex: 9999,
                                    marginTop: "4px",
                                  }}
                                >
                                  {/* Manual Entry Option - Always show at top */}
                                  {inventorySearch &&
                                    inventorySearch.length >= 2 && (
                                      <div
                                        className={`p-3 cursor-pointer border-b border-border ${highlightedSuggestion === 0 ? "bg-yellow-500/20" : "hover:bg-yellow-500/10 bg-yellow-500/5"}`}
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
                                          <Plus className="w-4 h-4 text-yellow-500" />
                                          <div>
                                            <p className="font-medium text-sm text-yellow-500">
                                              Manual Entry: "{inventorySearch}"
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                              Add item not in inventory
                                              (negative billing)
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
                                        className={`p-3 cursor-pointer border-b border-border last:border-0 ${highlightedSuggestion === suggIdx + 1 ? "bg-primary/20" : "hover:bg-primary/10"}`}
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
                                        <div className="flex justify-between items-start">
                                          <div>
                                            <p className="font-medium text-sm">
                                              {invItem.product_name}
                                            </p>

                                            {invItem.supplier_name && (
                                              <p className="text-xs text-purple-500 font-medium">
                                                Supplier:{" "}
                                                {invItem.supplier_name.length >
                                                18
                                                  ? invItem.supplier_name
                                                      .split(" ")
                                                      .map((word) => word[0])
                                                      .join("")
                                                      .toUpperCase()
                                                  : invItem.supplier_name}
                                              </p>
                                            )}

                                            {invItem.salt_composition && (
                                              <p className="text-xs text-primary/70">
                                                {invItem.salt_composition.slice(
                                                  0,
                                                  40
                                                )}
                                                ...
                                              </p>
                                            )}

                                            <p className="text-xs text-muted-foreground">
                                              Batch: {invItem.batch_no} | Exp:{" "}
                                              {invItem.expiry_date}
                                            </p>
                                          </div>

                                          <div className="text-right">
                                            <p className="font-mono text-primary text-sm">
                                              ₹
                                              {Number(
                                                invItem.mrp_per_unit ||
                                                  invItem.mrp
                                              )
                                                .toFixed(2)
                                                .replace(/\.00$/, "")}
                                              /unit
                                            </p>

                                            <p className="text-xs text-muted-foreground font-medium">
                                              {invItem.available_quantity ||
                                                invItem.available_units}{" "}
                                              units
                                            </p>

                                            <p className="text-xs text-blue-400 font-bold">
                                              Rate : ₹{invItem.purchase_price}
                                            </p>
                                          </div>
                                        </div>
                                      </div>
                                    )
                                  )}

                                  {/* No results message */}
                                  {inventorySuggestions.length === 0 &&
                                    inventorySearch &&
                                    inventorySearch.length >= 2 && (
                                      <div className="p-3 text-center text-muted-foreground text-sm">
                                        No inventory items found. Use manual
                                        entry above.
                                      </div>
                                    )}
                                </div>
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
                                placeholder="Salt"
                                className="h-8 text-xs w-20"
                              />
                            ) : (
                              <span className="text-xs text-muted-foreground">
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
                                className="h-8 text-xs w-14"
                              />
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                {item.batch_no || "-"}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {item.is_manual ? (
                              <span className="text-xs font-medium text-yellow-500">
                                Manual
                              </span>
                            ) : hasOverflow ? (
                              <div className="text-center">
                                <span className="text-xs font-medium text-yellow-500">
                                  {available}
                                </span>
                                <p className="text-[10px] text-yellow-500">
                                  ({negativeBilled} neg)
                                </p>
                              </div>
                            ) : (
                              <span className="text-xs font-medium text-primary">
                                {available || "-"}
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
                                onChange={(e) =>
                                  handleItemFieldChange(
                                    item.id,
                                    "quantity",
                                    e.target.value
                                  )
                                }
                                min="1"
                                placeholder="1"
                                className={`h-8 text-xs text-center w-14 ${
                                  hasOverflow ? "border-yellow-500" : ""
                                }`}
                              />

                              {/* Show only for inventory items */}
                              {!item.isManual && item.units_per_pack && (
                                <label className="flex items-center gap-2 cursor-pointer select-none text-[11px] font-medium text-gray-600">
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
                                    className="
      h-4 w-4 rounded
      border border-gray-300
      text-primary
      focus:ring-1 focus:ring-primary
      cursor-pointer
    "
                                  />
                                  Full Pack
                                </label>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
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
                                className="h-8 text-xs text-center w-16"
                              />
                            ) : (
                              <span className="text-xs text-muted-foreground font-mono">
                                ₹{purchasePrice.toFixed(2)}
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Input
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
                              placeholder="MRP"
                              className="h-8 text-xs text-center w-16"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              value={item.discount_percent || ""}
                              onChange={(e) =>
                                handleItemFieldChange(
                                  item.id,
                                  "discount_percent",
                                  e.target.value
                                )
                              }
                              min="0"
                              max="100"
                              placeholder="0"
                              className="h-8 text-xs text-center w-14"
                            />
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm font-medium">
                            ₹{itemTotal.toFixed(2)}
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

                    {billItems.length === 0 && (
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
            </div>

            {/* Tip */}
            <p className="text-xs text-muted-foreground bg-muted/30 p-2 rounded">
              💡 <strong>Tip:</strong> Search by product name or salt
              composition. All fields are editable.
            </p>

            {/* Totals & Actions */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleAddNewRow}
                    data-testid="add-item-btn"
                  >
                    <Plus className="h-4 w-4 mr-1" /> Add Item
                  </Button>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="isPaid"
                      checked={isPaid}
                      onCheckedChange={setIsPaid}
                    />
                    <Label htmlFor="isPaid" className="text-sm">
                      Paid
                    </Label>
                  </div>
                </div>
                {/* Inventory vs Negative billing warning */}
                {negativeBilledQty > 0 && (
                  <div className="p-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-sm">
                    <p className="text-yellow-600 font-medium">
                      ⚠️ Negative Billing Alert:
                    </p>
                    <p className="text-yellow-600">
                      {inventoryBilledQty} units from inventory,{" "}
                      {negativeBilledQty} units negatively billed
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-2 text-right">
                <div className="flex justify-end items-center gap-4">
                  <Label>Bill Discount %</Label>
                  <Input
                    type="number"
                    value={billDiscount}
                    onChange={(e) =>
                      setBillDiscount(parseFloat(e.target.value) || 0)
                    }
                    min="0"
                    max="100"
                    className="w-20 text-center"
                  />
                </div>
                <div className="text-sm text-muted-foreground">
                  Subtotal: ₹{subtotal.toFixed(2)}
                </div>
                {billDiscount > 0 && (
                  <div className="text-sm text-red-500">
                    Discount ({billDiscount}%): -₹{discountAmount.toFixed(2)}
                  </div>
                )}
                <div className="text-xl font-bold text-primary">
                  Grand Total: ₹{grandTotal.toFixed(2)}
                </div>
                <div
                  className={`text-sm font-medium ${totalProfit >= 0 ? "text-green-500" : "text-red-500"}`}
                >
                  Est. Profit: ₹{totalProfit.toFixed(2)}
                </div>
              </div>
            </div>

            {/* Submit */}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={handleCancelNewBill}>
                Cancel (Esc)
              </Button>
              <Button
                onClick={handleSubmitBill}
                disabled={submitting || validItems.length === 0}
                className="btn-primary"
                data-testid="submit-bill-btn"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <CreditCard className="w-4 h-4 mr-2" />
                    Create Bill (Alt+S)
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Edit Bill Dialog */}
      {editingBill && (
        <Dialog open={!!editingBill} onOpenChange={() => setEditingBill(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Edit Bill - {editingBill.bill_no}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Customer Name</Label>
                  <Input
                    value={editingBill.customer_name}
                    onChange={(e) =>
                      setEditingBill({
                        ...editingBill,
                        customer_name: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Mobile</Label>
                  <Input
                    value={editingBill.customer_mobile}
                    onChange={(e) =>
                      setEditingBill({
                        ...editingBill,
                        customer_mobile: e.target.value,
                      })
                    }
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={editingBill.customer_email}
                  onChange={(e) =>
                    setEditingBill({
                      ...editingBill,
                      customer_email: e.target.value,
                    })
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Discount %</Label>
                  <Input
                    type="number"
                    value={editingBill.discount_percent}
                    onChange={(e) =>
                      setEditingBill({
                        ...editingBill,
                        discount_percent: parseFloat(e.target.value) || 0,
                      })
                    }
                  />
                </div>
                <div className="space-y-2 flex items-end">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="editIsPaid"
                      checked={editingBill.is_paid}
                      onCheckedChange={(v) =>
                        setEditingBill({ ...editingBill, is_paid: v })
                      }
                    />
                    <Label htmlFor="editIsPaid">Paid</Label>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Input
                  value={editingBill.notes}
                  onChange={(e) =>
                    setEditingBill({ ...editingBill, notes: e.target.value })
                  }
                  placeholder="Add notes..."
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setEditingBill(null)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleSaveEditBill}
                  disabled={submitting}
                  className="btn-primary"
                >
                  {submitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    "Save Changes"
                  )}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Bills Table */}
      <Card className="data-table">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10"></TableHead>
              <TableHead>Bill No</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Items</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">Profit</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-center">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {bills.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="text-center py-8 text-muted-foreground"
                >
                  <Receipt className="w-10 h-10 mx-auto mb-2 opacity-50" />
                  No bills yet
                </TableCell>
              </TableRow>
            ) : (
              bills.map((bill) => {
                const isExpanded = expandedBills[bill.id];
                const billTotal = bill.grand_total || bill.total_amount || 0;
                return (
                  <React.Fragment key={bill.id}>
                    <TableRow
                      data-testid={`bill-row-${bill.id}`}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => toggleBillExpand(bill.id)}
                    >
                      <TableCell className="w-10">
                        <Button variant="ghost" size="icon" className="h-6 w-6">
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </Button>
                      </TableCell>
                      <TableCell className="font-mono font-medium">
                        {bill.bill_no}
                      </TableCell>
                      <TableCell className="text-sm">
                        {bill.created_at?.slice(0, 10)}
                      </TableCell>
                      <TableCell>
                        <p className="font-medium">{bill.customer_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {bill.customer_mobile}
                        </p>
                      </TableCell>
                      <TableCell className="text-sm">
                        {bill.items?.length || 0} items
                      </TableCell>
                      <TableCell className="text-right font-mono text-blue-400 font-semibold">
                        ₹{billTotal.toFixed(2)}
                      </TableCell>
                      <TableCell
                        className={`text-right font-mono font-semibold ${
                          bill.profit >= 0 ? "text-green-600" : "text-red-600"
                        }`}
                      >
                        ₹{bill.profit.toFixed(2)}
                      </TableCell>

                      <TableCell>
                        {bill.is_paid ? (
                          <Badge className="bg-primary/20 text-primary border-primary/50">
                            Paid
                          </Badge>
                        ) : (
                          <Badge className="bg-yellow-500/20 text-yellow-500 border-yellow-500/50">
                            Unpaid
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleStartEditBill(bill)}
                            title="Edit Bill"
                            data-testid={`edit-bill-${bill.id}`}
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleGeneratePdf(bill.id)}
                            title="Generate PDF"
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
                              className="text-primary"
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
                            className="text-destructive"
                            data-testid={`delete-bill-btn-${bill.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    {/* Expanded Items Row */}
                    {isExpanded && bill.items && bill.items.length > 0 && (
                      <TableRow className="bg-muted/30">
                        <TableCell colSpan={12} className="p-0">
                          <div className="p-4 pl-12">
                            <p className="text-sm font-semibold mb-3 text-muted-foreground">
                              Items Sold:
                            </p>
                            <Table>
                              <TableHeader>
                                <TableRow className="bg-muted/50">
                                  <TableHead className="text-xs font-bold">
                                    Product
                                  </TableHead>
                                  <TableHead className="text-xs font-bold">
                                    Batch
                                  </TableHead>
                                  <TableHead className="text-xs font-bold text-center">
                                    Qty (Units)
                                  </TableHead>
                                  <TableHead className="text-xs font-bold text-right">
                                    Rate/Unit
                                  </TableHead>
                                  <TableHead className="text-xs font-bold text-center">
                                    Disc%
                                  </TableHead>
                                  <TableHead className="text-xs font-bold text-right">
                                    Total
                                  </TableHead>
                                  <TableHead className="text-xs font-bold text-right">
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
                                      className={`border-b border-border/50 ${item.is_manual ? "bg-yellow-500/5" : ""}`}
                                    >
                                      <TableCell className="text-sm font-medium">
                                        {item.product_name}
                                        {item.is_manual && (
                                          <span className="ml-2 text-xs text-yellow-500">
                                            (Manual)
                                          </span>
                                        )}
                                      </TableCell>
                                      <TableCell className="text-xs text-muted-foreground">
                                        {item.batch_no || "-"}
                                      </TableCell>
                                      <TableCell className="text-sm text-center">
                                        {qty}
                                      </TableCell>
                                      <TableCell className="text-sm text-right font-mono">
                                        ₹{unitPrice.toFixed(2)}
                                      </TableCell>
                                      <TableCell className="text-sm text-center">
                                        {discPercent}%
                                      </TableCell>
                                      <TableCell className="text-sm text-right font-mono font-medium">
                                        ₹{itemTotal.toFixed(2)}
                                      </TableCell>
                                      <TableCell
                                        className={`text-sm text-right font-mono font-medium ${
                                          item.profit >= 0
                                            ? "text-green-600"
                                            : "text-red-600"
                                        }`}
                                      >
                                        ₹{item.profit.toFixed(2)}
                                      </TableCell>
                                    </TableRow>
                                  );
                                })}
                              </TableBody>
                            </Table>
                            <div className="mt-3 pt-3 border-t border-border/50 flex justify-between items-center text-sm">
                              {/* Inventory vs Negative billing info */}
                              <div>
                                {(bill.negative_billed_qty > 0 ||
                                  bill.items?.some((i) => i.is_manual)) && (
                                  <span className="text-yellow-600 text-xs">
                                    ⚠️{" "}
                                    {bill.inventory_billed_qty ||
                                      bill.items
                                        ?.filter((i) => !i.is_manual)
                                        .reduce((s, i) => s + i.quantity, 0) ||
                                      0}{" "}
                                    from inventory,{" "}
                                    {bill.negative_billed_qty ||
                                      bill.items
                                        ?.filter((i) => i.is_manual)
                                        .reduce((s, i) => s + i.quantity, 0) ||
                                      0}{" "}
                                    negatively billed
                                  </span>
                                )}
                              </div>
                              <div className="flex gap-6">
                                <span className="text-muted-foreground">
                                  Subtotal:{" "}
                                  <span className="font-mono">
                                    ₹{(bill.subtotal || billTotal).toFixed(2)}
                                  </span>
                                </span>
                                {(bill.discount_amount || 0) > 0 && (
                                  <span className="text-muted-foreground">
                                    Discount:{" "}
                                    <span className="font-mono text-red-500">
                                      -₹{bill.discount_amount.toFixed(2)}
                                    </span>
                                  </span>
                                )}
                                <span className="font-semibold">
                                  Grand Total:{" "}
                                  <span className="font-mono text-primary">
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
      </Card>

      {/* Delete Dialog */}
      <AlertDialog
        open={deleteDialog.open}
        onOpenChange={(open) =>
          setDeleteDialog({ open, bill: open ? deleteDialog.bill : null })
        }
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Bill</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete bill {deleteDialog.bill?.bill_no}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleDeleteBill(deleteDialog.bill?.id, false)}
              className="bg-destructive hover:bg-destructive/90"
            >
              Delete Only
            </AlertDialogAction>
            <AlertDialogAction
              onClick={() => handleDeleteBill(deleteDialog.bill?.id, true)}
              className="bg-destructive hover:bg-destructive/90"
            >
              Delete & Restore Inventory
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
