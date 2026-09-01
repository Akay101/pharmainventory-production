import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { API, useAuth } from "../App";
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
  Camera,
  Upload,
  X,
  Plus,
  Check,
  ArrowLeft,
  Trash2,
  Sparkles,
  ChevronDown,
  Search,
  CheckCircle2,
  Layers,
  RefreshCw,
  User,
  Phone,
  Mail,
  Stethoscope,
  Calendar,
  CreditCard,
  Loader2,
  FileText,
  CornerDownLeft,
} from "lucide-react";
import { toast } from "sonner";
import { AiLoader } from "../components/ui/loader";

export default function BillingScannerPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  // Bill & Customer Details State
  const [billingDate, setBillingDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [customerInfo, setCustomerInfo] = useState({
    customer_id: null,
    customer_name: "Walk-in Customer",
    customer_mobile: "",
    customer_email: "",
  });
  const [doctorName, setDoctorName] = useState("");
  const [isPaid, setIsPaid] = useState(true);
  const [paymentMode, setPaymentMode] = useState("Cash");
  const [submittingBill, setSubmittingBill] = useState(false);

  // Customer Autocomplete Suggestions
  const [customerSuggestions, setCustomerSuggestions] = useState([]);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);

  // Product Queue State
  const [productCards, setProductCards] = useState([
    {
      id: "prod-1",
      photos: [],
      status: "draft",
      scannedResult: null,
      matchedItem: null,
    },
  ]);

  // Load existing customers for autocomplete
  useEffect(() => {
    fetchCustomers();
  }, []);

  const fetchCustomers = async () => {
    try {
      const res = await axios.get(`${API}/customers?limit=50`);
      setCustomerSuggestions(res.data.customers || []);
    } catch (e) {
      console.error("Failed to load customers:", e);
    }
  };

  // Handle Enter keypress to trigger AI extraction for ready draft cards
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        const tag = document.activeElement?.tagName?.toLowerCase();
        if (tag === "input" || tag === "textarea" || tag === "select") return;

        const readyCard = productCards.find(
          (c) => c.status === "draft" && c.photos.length > 0
        );
        if (readyCard) {
          e.preventDefault();
          handleStartScanForCard(readyCard);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [productCards]);

  const handleSelectCustomer = (cust) => {
    setCustomerInfo({
      customer_id: cust.id || cust._id,
      customer_name: cust.name || "",
      customer_mobile: cust.mobile || "",
      customer_email: cust.email || "",
    });
    setShowCustomerDropdown(false);
  };

  const compressImageFile = (file) => {
    return new Promise((resolve) => {
      if (!file || !file.type.startsWith("image/")) return resolve(file);
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const canvas = document.createElement("canvas");
        const MAX_SIZE = 1024;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_SIZE) {
            height = Math.round((height * MAX_SIZE) / width);
            width = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width = Math.round((width * MAX_SIZE) / height);
            height = MAX_SIZE;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (!blob) return resolve(file);
            const compressedFile = new File([blob], file.name, {
              type: "image/jpeg",
              lastModified: Date.now(),
            });
            resolve(compressedFile);
          },
          "image/jpeg",
          0.75
        );
      };
      img.onerror = () => resolve(file);
      img.src = url;
    });
  };

  const handleAddPhotos = async (cardId, files) => {
    if (!files || files.length === 0) return;

    const fileList = Array.from(files);
    const compressedFiles = await Promise.all(
      fileList.map((f) => compressImageFile(f))
    );

    const newPhotoObjs = compressedFiles.map((file) => ({
      file,
      preview: URL.createObjectURL(file),
    }));

    setProductCards((prev) =>
      prev.map((c) =>
        c.id === cardId
          ? { ...c, photos: [...c.photos, ...newPhotoObjs] }
          : c
      )
    );
  };

  const handleRemovePhoto = (cardId, photoIdx) => {
    setProductCards((prev) =>
      prev.map((c) =>
        c.id === cardId
          ? {
              ...c,
              photos: c.photos.filter((_, idx) => idx !== photoIdx),
            }
          : c
      )
    );
  };

  const handleAddNewProductCard = () => {
    const newId = `prod-${Date.now()}`;
    setProductCards((prev) => [
      ...prev,
      {
        id: newId,
        photos: [],
        status: "draft",
        scannedResult: null,
        matchedItem: null,
      },
    ]);
  };

  const handleRemoveProductCard = (cardId) => {
    if (productCards.length <= 1) {
      toast.error("At least one product card is required");
      return;
    }
    setProductCards((prev) => prev.filter((c) => c.id !== cardId));
  };

  const handleStartScanForCard = async (card) => {
    if (card.photos.length === 0) {
      toast.error("Please capture or upload at least 1 photo for this product");
      return;
    }

    setProductCards((prev) =>
      prev.map((c) =>
        c.id === card.id ? { ...c, status: "scanning" } : c
      )
    );

    try {
      const formData = new FormData();
      card.photos.forEach((p) => {
        formData.append("files", p.file);
      });

      // Ultra-fast direct 2-second AI scan & batch matching endpoint
      const res = await axios.post(`${API}/bills/scan-product`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      if (res.data.success && res.data.matched_item) {
        const extracted = res.data.extracted_data || {};
        const matched = res.data.matched_item;

        setProductCards((prev) =>
          prev.map((c) =>
            c.id === card.id
              ? {
                  ...c,
                  status: "done",
                  scannedResult: extracted,
                  matchedItem: matched,
                }
              : c
          )
        );

        if (matched.match_type === "batch_exact") {
          toast.success(`Exact Batch Match found: ${matched.product_name} (Batch ${matched.batch_no})`);
        } else if (matched.match_type === "name_suggested") {
          toast.success(`Matched to inventory: ${matched.product_name}`);
        } else {
          toast.info(`Product extracted: ${matched.product_name} (Prepared as Unstocked / Negative Billing)`);
        }
      } else {
        throw new Error(res.data.detail || "AI scan failed");
      }
    } catch (err) {
      console.error("Billing scan error:", err);
      toast.error(err.response?.data?.detail || err.message || "Failed to scan product");
      setProductCards((prev) =>
        prev.map((c) =>
          c.id === card.id ? { ...c, status: "error" } : c
        )
      );
    }
  };

  // Save Draft Bill via POST /api/bills/drafts
  const handleSaveDraftBill = async () => {
    const completedCards = productCards.filter(
      (c) => c.status === "done" && c.matchedItem
    );

    if (completedCards.length === 0) {
      toast.error("Please complete AI scan for at least 1 product");
      return;
    }

    if (!customerInfo.customer_name || !customerInfo.customer_name.trim()) {
      toast.error("Customer name is required");
      return;
    }

    const validItems = completedCards.map((c) => {
      const m = c.matchedItem;
      const mrpVal = parseFloat(m.mrp) || parseFloat(m.unit_price) || 0;
      const availVal = m.available !== undefined ? m.available : (m.available_quantity || 0);

      return {
        inventory_id: m.inventory_id || null,
        product_name: m.product_name || "Scanned Product",
        salt_composition: m.salt_composition || "",
        batch_no: m.batch_no || "",
        expiry_date: m.expiry_date || "",
        available: availVal,
        available_quantity: availVal,
        quantity: parseInt(m.quantity) || 1,
        unit_price: mrpVal,
        mrp: mrpVal,
        purchase_price: parseFloat(m.purchase_price) || 0,
        discount_percent: 0,
        cgst: parseFloat(m.cgst) || 0,
        sgst: parseFloat(m.sgst) || 0,
      };
    });

    setSubmittingBill(true);

    try {
      const payload = {
        customer_id: customerInfo.customer_id || null,
        customer_name: customerInfo.customer_name.trim(),
        customer_mobile: customerInfo.customer_mobile.trim() || "",
        customer_email: customerInfo.customer_email.trim() || "",
        billing_date: billingDate,
        doctor: doctorName.trim() || "",
        is_paid: isPaid,
        payment_mode: isPaid ? paymentMode : "none",
        items: validItems,
      };

      const res = await axios.post(`${API}/bills/drafts`, payload);
      const draftData = res.data?.draft || res.data;

      if (draftData) {
        toast.success(`Draft Bill #${draftData.draft_no || "saved"} created successfully!`);
        navigate("/billing?tab=drafts", { state: { activeTab: "drafts" } });
      } else {
        throw new Error("Draft bill creation failed");
      }
    } catch (err) {
      console.error("Draft bill creation error:", err);
      toast.error(err.response?.data?.detail || err.message || "Failed to create draft bill");
    } finally {
      setSubmittingBill(false);
    }
  };

  // Transfer Items & Customer Info to Billing Form Drawer
  const handleOpenInBillingDrawer = () => {
    const completedCards = productCards.filter(
      (c) => c.status === "done" && c.matchedItem
    );

    if (completedCards.length === 0) {
      toast.error("No completed scanned items to transfer");
      return;
    }

    const billItemsToInject = completedCards.map((c) => {
      const m = c.matchedItem;
      return {
        inventory_id: m.inventory_id || "",
        product_name: m.product_name || "Scanned Product",
        salt_composition: m.salt_composition || "",
        batch_no: m.batch_no || "",
        quantity: m.quantity || 1,
        available_quantity: m.available_quantity || 0,
        mrp: m.mrp || 0,
        unit_price: m.mrp || 0,
        purchase_price: m.purchase_price || 0,
        cgst: m.cgst || 0,
        sgst: m.sgst || 0,
        expiry_date: m.expiry_date || "",
        is_negative_billed: !m.inventory_id,
      };
    });

    navigate("/billing", {
      state: {
        scannedItems: billItemsToInject,
        customerDetails: {
          ...customerInfo,
          doctor: doctorName,
          billing_date: billingDate,
          is_paid: isPaid,
          payment_mode: paymentMode,
        },
      },
    });
    toast.success(`Transferred ${billItemsToInject.length} product(s) to Billing Form!`);
  };

  const doneCount = productCards.filter((c) => c.status === "done").length;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Top Mobile-Responsive Navigation Header */}
      <header className="sticky top-0 z-40 bg-card/95 backdrop-blur-md border-b border-border px-4 py-3 flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/billing")}
            className="h-9 w-9 rounded-xl hover:bg-muted"
          >
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </Button>
          <div>
            <h1 className="text-base font-extrabold flex items-center gap-2">
              <Camera className="w-5 h-5 text-orange-500" />
              <span>Smart Product Scanner</span>
              <Badge className="bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/30 text-[10px] font-extrabold">
                AI Powered
              </Badge>
            </h1>
            <p className="text-[11px] text-muted-foreground font-medium hidden sm:block">
              Scan customer products & auto-generate verified draft medical bills
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={handleSaveDraftBill}
            disabled={doneCount === 0 || submittingBill}
            className="h-9 px-4 text-xs font-black bg-orange-600 hover:bg-orange-700 text-white rounded-xl shadow-md shadow-orange-600/20 transition-all hover:scale-[1.02] cursor-pointer"
          >
            {submittingBill ? (
              <>
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Check className="w-4 h-4 mr-1.5" />
                <span>Save as Draft Bill ({doneCount})</span>
              </>
            )}
          </Button>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {/* 1. Customer & Bill Information Details Card */}
        <div className="bg-card border border-border/80 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-border/50">
            <User className="w-4 h-4 text-orange-500" />
            <h2 className="text-xs font-extrabold uppercase tracking-wider text-foreground">
              Customer & Bill Details
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Billing Date */}
            <div>
              <Label className="text-[11px] font-extrabold text-muted-foreground uppercase flex items-center gap-1 mb-1">
                <Calendar className="w-3 h-3 text-orange-500" /> Billing Date *
              </Label>
              <Input
                type="date"
                value={billingDate}
                onChange={(e) => setBillingDate(e.target.value)}
                className="h-9 text-xs font-semibold rounded-xl border-border"
              />
            </div>

            {/* Customer Name */}
            <div className="relative">
              <Label className="text-[11px] font-extrabold text-muted-foreground uppercase flex items-center gap-1 mb-1">
                <User className="w-3 h-3 text-orange-500" /> Customer Name *
              </Label>
              <Input
                placeholder="Search or enter customer..."
                value={customerInfo.customer_name}
                onFocus={() => setShowCustomerDropdown(true)}
                onChange={(e) => {
                  setCustomerInfo((prev) => ({
                    ...prev,
                    customer_name: e.target.value,
                    customer_id: null,
                  }));
                  setShowCustomerDropdown(true);
                }}
                className="h-9 text-xs font-bold rounded-xl border-border"
              />

              {/* Customer Autocomplete Dropdown */}
              {showCustomerDropdown && customerSuggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-card border border-border rounded-xl shadow-2xl max-h-48 overflow-y-auto p-1">
                  {customerSuggestions
                    .filter((c) =>
                      (c.name || "")
                        .toLowerCase()
                        .includes(
                          (customerInfo.customer_name || "").toLowerCase()
                        )
                    )
                    .slice(0, 8)
                    .map((cust) => (
                      <button
                        key={cust.id || cust._id}
                        type="button"
                        onClick={() => handleSelectCustomer(cust)}
                        className="w-full text-left px-3 py-2 text-xs font-medium hover:bg-orange-500/10 rounded-lg flex items-center justify-between transition-colors"
                      >
                        <span className="font-bold text-foreground">
                          {cust.name}
                        </span>
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {cust.mobile}
                        </span>
                      </button>
                    ))}
                  <button
                    type="button"
                    onClick={() => setShowCustomerDropdown(false)}
                    className="w-full text-center py-1 text-[10px] font-bold text-muted-foreground hover:text-foreground border-t border-border mt-1"
                  >
                    Close Dropdown
                  </button>
                </div>
              )}
            </div>

            {/* Mobile Number */}
            <div>
              <Label className="text-[11px] font-extrabold text-muted-foreground uppercase flex items-center gap-1 mb-1">
                <Phone className="w-3 h-3 text-muted-foreground" /> Mobile (Optional)
              </Label>
              <Input
                placeholder="e.g. 9876543210"
                value={customerInfo.customer_mobile}
                onChange={(e) =>
                  setCustomerInfo((prev) => ({
                    ...prev,
                    customer_mobile: e.target.value,
                  }))
                }
                className="h-9 text-xs font-mono font-medium rounded-xl border-border"
              />
            </div>

            {/* Doctor Name */}
            <div>
              <Label className="text-[11px] font-extrabold text-muted-foreground uppercase flex items-center gap-1 mb-1">
                <Stethoscope className="w-3 h-3 text-muted-foreground" /> Doctor (Optional)
              </Label>
              <Input
                placeholder="Dr. Name..."
                value={doctorName}
                onChange={(e) => setDoctorName(e.target.value)}
                className="h-9 text-xs font-medium rounded-xl border-border"
              />
            </div>
          </div>

          {/* Payment Status & Mode Row */}
          <div className="flex flex-wrap items-center gap-5 pt-2 border-t border-border/40">
            <div className="flex items-center gap-2">
              <Checkbox
                id="isPaidScan"
                checked={isPaid}
                onCheckedChange={(val) => setIsPaid(!!val)}
              />
              <Label
                htmlFor="isPaidScan"
                className="text-xs font-bold text-foreground cursor-pointer select-none"
              >
                Mark as Paid
              </Label>
            </div>

            {isPaid && (
              <div className="flex items-center gap-2">
                <Label className="text-xs font-bold text-muted-foreground">
                  Payment Mode:
                </Label>
                <Select value={paymentMode} onValueChange={setPaymentMode}>
                  <SelectTrigger className="w-28 h-8 text-xs font-extrabold rounded-lg border-border">
                    <SelectValue placeholder="Mode" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Cash">Cash</SelectItem>
                    <SelectItem value="UPI">UPI</SelectItem>
                    <SelectItem value="Card">Card</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </div>

        {/* 2. Product Queue & AI Scan Cards Header */}
        <div className="flex items-center justify-between gap-3 bg-card p-4 rounded-2xl border border-border/80 shadow-xs">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-500 font-bold">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-xs font-black uppercase text-foreground tracking-wider">
                Scanned Products ({productCards.length})
              </h2>
              <p className="text-[11px] text-muted-foreground font-medium">
                Snap 1-3 photos per product. Fast AI extracts batch & matches stock.
              </p>
            </div>
          </div>

          <Button
            size="sm"
            variant="outline"
            onClick={handleAddNewProductCard}
            className="h-8 text-xs font-black border-orange-500/40 text-orange-600 dark:text-orange-400 bg-orange-500/10 hover:bg-orange-500/20 rounded-xl transition-all"
          >
            <Plus className="w-3.5 h-3.5 mr-1" /> Add Product Card
          </Button>
        </div>

        {/* 3. Product Queue Cards */}
        <div className="space-y-4">
          {productCards.map((card, cardIdx) => {
            const isScanning = card.status === "scanning";
            const isDone = card.status === "done";
            const isError = card.status === "error";

            return (
              <div
                key={card.id}
                className={`border rounded-2xl p-4 sm:p-5 transition-all duration-200 ${
                  isDone
                    ? "bg-orange-500/5 border-orange-500/30 shadow-xs"
                    : isScanning
                    ? "bg-amber-500/5 border-amber-500/30 shadow-md"
                    : isError
                    ? "bg-destructive/5 border-destructive/30"
                    : "bg-card border-border/80 shadow-xs"
                }`}
              >
                {/* Card Title & Status Header */}
                <div className="flex items-center justify-between mb-4 pb-2.5 border-b border-border/50">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="w-7 h-7 rounded-full bg-orange-500/15 text-orange-500 text-xs font-black flex items-center justify-center">
                      #{cardIdx + 1}
                    </span>
                    <span className="text-sm font-extrabold text-foreground">
                      {card.matchedItem?.product_name || `Product #${cardIdx + 1}`}
                    </span>

                    {/* Status Badges */}
                    {isDone && card.matchedItem && (
                      <Badge
                        className={`text-[10px] font-black rounded-full px-2.5 py-0.5 border ${
                          card.matchedItem.match_type === "batch_exact"
                            ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                            : card.matchedItem.match_type === "name_suggested"
                            ? "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30"
                            : "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30"
                        }`}
                      >
                        {card.matchedItem.match_type === "batch_exact" && "⚡ Batch Exact Match"}
                        {card.matchedItem.match_type === "name_suggested" && "✓ Name Matched"}
                        {card.matchedItem.match_type === "negative_billing" && "⚠️ Negative Billing"}
                      </Badge>
                    )}

                    {isScanning && (
                      <Badge className="bg-amber-500 text-white border-0 text-[10px] font-extrabold flex items-center gap-1.5">
                        <RefreshCw className="w-3 h-3 animate-spin" />
                        <span>Extracting AI Details...</span>
                      </Badge>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    {productCards.length > 1 && (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleRemoveProductCard(card.id)}
                        className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-xl"
                        title="Remove Product"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>

                {/* Photo Capture Section (Mobile Optimized) */}
                <div className="space-y-2 mb-4">
                  <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">
                    Product Photos ({card.photos.length}) - Front, Side/Batch, MRP
                  </Label>

                  <div className="flex flex-wrap items-center gap-3">
                    {card.photos.map((photo, pIdx) => (
                      <div
                        key={pIdx}
                        className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-2xl overflow-hidden border-2 border-orange-500/30 shadow-xs group bg-black/5"
                      >
                        <img
                          src={photo.preview}
                          alt={`Product photo ${pIdx + 1}`}
                          className="w-full h-full object-cover"
                        />
                        {!isScanning && (
                          <button
                            type="button"
                            onClick={() => handleRemovePhoto(card.id, pIdx)}
                            className="absolute top-1.5 right-1.5 bg-black/75 text-white p-1 rounded-full opacity-90 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}

                    {!isScanning && card.photos.length < 5 && (
                      <div className="flex gap-2.5">
                        {/* File Upload Button */}
                        <label className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl border-2 border-dashed border-border/80 hover:border-orange-500 bg-muted/20 hover:bg-orange-500/5 flex flex-col items-center justify-center cursor-pointer transition-all">
                          <Upload className="w-6 h-6 text-muted-foreground mb-1.5" />
                          <span className="text-xs font-bold text-muted-foreground">Upload</span>
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            className="hidden"
                            onChange={(e) => handleAddPhotos(card.id, e.target.files)}
                          />
                        </label>

                        {/* Camera Capture Button (Mobile Camera Trigger) */}
                        <label className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl border-2 border-dashed border-orange-500/40 hover:border-orange-500 bg-orange-500/5 flex flex-col items-center justify-center cursor-pointer transition-all">
                          <Camera className="w-6 h-6 text-orange-500 mb-1.5" />
                          <span className="text-xs font-bold text-orange-500">Camera</span>
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            className="hidden"
                            onChange={(e) => handleAddPhotos(card.id, e.target.files)}
                          />
                        </label>
                      </div>
                    )}
                  </div>
                </div>

                {/* Extracted & Matched Details Box */}
                {isDone && card.matchedItem && (
                  <div className="mt-4 bg-background border border-border/80 rounded-2xl p-4 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                      <div className="sm:col-span-2">
                        <Label className="text-[10px] font-extrabold text-muted-foreground uppercase">Product Name</Label>
                        <Input
                          value={card.matchedItem.product_name}
                          onChange={(e) =>
                            setProductCards((prev) =>
                              prev.map((c) =>
                                c.id === card.id
                                  ? {
                                      ...c,
                                      matchedItem: {
                                        ...c.matchedItem,
                                        product_name: e.target.value,
                                      },
                                    }
                                  : c
                              )
                            )
                          }
                          className="h-9 text-xs font-bold rounded-xl"
                        />
                      </div>
                      <div>
                        <Label className="text-[10px] font-extrabold text-muted-foreground uppercase">Batch Number</Label>
                        <Input
                          value={card.matchedItem.batch_no}
                          onChange={(e) =>
                            setProductCards((prev) =>
                              prev.map((c) =>
                                c.id === card.id
                                  ? {
                                      ...c,
                                      matchedItem: {
                                        ...c.matchedItem,
                                        batch_no: e.target.value,
                                      },
                                    }
                                  : c
                              )
                            )
                          }
                          className="h-9 text-xs font-mono font-bold rounded-xl"
                        />
                      </div>
                      <div>
                        <Label className="text-[10px] font-extrabold text-muted-foreground uppercase">MRP (₹)</Label>
                        <Input
                          type="number"
                          value={card.matchedItem.mrp}
                          onChange={(e) =>
                            setProductCards((prev) =>
                              prev.map((c) =>
                                c.id === card.id
                                  ? {
                                      ...c,
                                      matchedItem: {
                                        ...c.matchedItem,
                                        mrp: parseFloat(e.target.value) || 0,
                                      },
                                    }
                                  : c
                              )
                            )
                          }
                          className="h-9 text-xs font-mono font-bold rounded-xl"
                        />
                      </div>
                    </div>

                    {card.matchedItem.inventory_id ? (
                      <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-between text-xs font-bold text-emerald-600 dark:text-emerald-400">
                        <span className="flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4" />
                          Linked to Inventory Batch: {card.matchedItem.batch_no}
                        </span>
                        <span className="bg-emerald-500/20 px-2.5 py-0.5 rounded-full text-[11px]">
                          {card.matchedItem.available_quantity} units available
                        </span>
                      </div>
                    ) : (
                      <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs font-bold text-amber-600 dark:text-amber-400">
                        ⚠️ Unstocked Item (Will add to bill as Negative Billing)
                      </div>
                    )}
                  </div>
                )}

                {/* AI Scanning State Loading Display */}
                {isScanning && (
                  <div className="my-4 p-6 bg-orange-500/5 border border-orange-500/20 rounded-2xl flex flex-col items-center justify-center animate-pulse">
                    <AiLoader size="md" text="Extracting product name, batch & MRP with AI..." />
                  </div>
                )}

                {/* Scan Trigger Button */}
                {card.status === "draft" && card.photos.length > 0 && (
                  <Button
                    size="sm"
                    onClick={() => handleStartScanForCard(card)}
                    className="mt-3 w-full h-10 text-xs font-black bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white rounded-xl transition-all shadow-md shadow-orange-500/20 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Sparkles className="w-4 h-4 text-white animate-pulse" />
                    <span>Start Instant AI Extraction</span>
                    <kbd className="hidden sm:inline-flex items-center gap-0.5 px-2 py-0.5 text-[10px] font-bold bg-white/20 text-white rounded-md border border-white/30 ml-2">
                      <CornerDownLeft className="w-3 h-3" /> Enter
                    </kbd>
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </main>

      {/* Fixed Bottom Action Toolbar */}
      <footer className="sticky bottom-0 z-40 bg-card border-t border-border p-4 shadow-lg flex flex-col sm:flex-row items-center justify-between max-w-4xl w-full mx-auto gap-3">
        <Button
          variant="outline"
          onClick={() => navigate("/billing")}
          className="h-10 w-full sm:w-auto px-4 text-xs font-bold rounded-xl border-border"
        >
          Cancel
        </Button>

        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          <Button
            variant="outline"
            onClick={handleOpenInBillingDrawer}
            disabled={doneCount === 0}
            className="h-10 flex-1 sm:flex-none px-4 text-xs font-bold border-orange-500/40 text-orange-600 dark:text-orange-400 hover:bg-orange-500/10 rounded-xl"
          >
            <FileText className="w-4 h-4 mr-1.5" />
            Open in Billing Drawer
          </Button>

          <Button
            onClick={handleSaveDraftBill}
            disabled={doneCount === 0 || submittingBill}
            className="h-10 flex-1 sm:flex-none px-6 text-xs font-black bg-orange-600 hover:bg-orange-700 text-white rounded-xl shadow-md shadow-orange-600/20 transition-all hover:scale-[1.02] cursor-pointer"
          >
            {submittingBill ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Check className="w-4 h-4 mr-1.5" />
                Save as Draft Bill ({doneCount})
              </>
            )}
          </Button>
        </div>
      </footer>
    </div>
  );
}
