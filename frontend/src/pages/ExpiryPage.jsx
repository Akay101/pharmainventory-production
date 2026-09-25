import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { API } from "../App";
import { toast } from "sonner";
import {
  CalendarX,
  Plus,
  Search,
  CheckCircle2,
  Clock,
  AlertCircle,
  Truck,
  Package,
  Layers,
  Printer,
  Trash2,
  Eye,
  CreditCard,
  Building2,
  ArrowRight,
  RefreshCw,
  X,
  ArrowUpRight
} from "lucide-react";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { Textarea } from "../components/ui/textarea";
import { Label } from "../components/ui/label";
import Loader from "../components/Loader";

const STATUS_CONFIG = {
  Draft: {
    label: "Draft / Pending Pick",
    color: "bg-zinc-500/10 text-zinc-500 border-zinc-500/30 dark:text-zinc-400",
    icon: Clock,
  },
  "Picked - Payment Pending": {
    label: "Picked - Payment Pending",
    color: "bg-amber-500/10 text-amber-500 border-amber-500/30 dark:text-amber-400",
    icon: Truck,
  },
  "Partial Paid": {
    label: "Partial Paid",
    color: "bg-blue-500/10 text-blue-500 border-blue-500/30 dark:text-blue-400",
    icon: CreditCard,
  },
  "Payment Done (Returned)": {
    label: "Returned & Settled",
    color: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30 dark:text-emerald-400",
    icon: CheckCircle2,
  },
};

export default function ExpiryPage() {
  const [activeTab, setActiveTab] = useState("bundles"); // "bundles" | "inventory"
  const [bundles, setBundles] = useState([]);
  const [unbundledBatches, setUnbundledBatches] = useState([]);
  const [stats, setStats] = useState({
    total_bundles: 0,
    total_value: 0,
    pending_payments: 0,
    completed_returns: 0,
    total_items: 0,
    unbundled_count: 0,
  });
  const [loading, setLoading] = useState(true);

  // Filters for bundles
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalBundles, setTotalBundles] = useState(0);

  // Expired Inventory Batches tab state
  const [expiredBatches, setExpiredBatches] = useState([]);
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [batchSearch, setBatchSearch] = useState("");
  const [batchStatusFilter, setBatchStatusFilter] = useState("all"); // "all", "unmoved", "moved", "returned"
  const [batchSupplierFilter, setBatchSupplierFilter] = useState("all");
  const [selectedBatchIds, setSelectedBatchIds] = useState(new Set());

  // Suppliers list
  const [suppliers, setSuppliers] = useState([]);

  // Create Bundle Modal state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [selectedSupplierForBundle, setSelectedSupplierForBundle] = useState("");
  const [supplierAvailableBatches, setSupplierAvailableBatches] = useState([]);
  const [loadingSupplierBatches, setLoadingSupplierBatches] = useState(false);
  const [bundleItemsDraft, setBundleItemsDraft] = useState([]);
  const [bundleNotes, setBundleNotes] = useState("");
  const [bundleReturnDate, setBundleReturnDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [creatingBundle, setCreatingBundle] = useState(false);

  // View / Details Modal
  const [detailBundle, setDetailBundle] = useState(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  // Payment Recording Modal
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [targetBundleForPayment, setTargetBundleForPayment] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMode, setPaymentMode] = useState("Cash");
  const [paymentDate, setPaymentDate] = useState(
    new Date().toISOString().slice(0, 16)
  );
  const [paymentRefNo, setPaymentRefNo] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [submittingPayment, setSubmittingPayment] = useState(false);

  // Delete Confirmation
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [bundleToDelete, setBundleToDelete] = useState(null);

  useEffect(() => {
    fetchSuppliers();
  }, []);

  useEffect(() => {
    if (activeTab === "bundles") {
      fetchBundles();
    } else {
      fetchExpiredBatches();
    }
  }, [activeTab, search, statusFilter, supplierFilter, page, batchSearch, batchStatusFilter, batchSupplierFilter]);

  // When supplier changes in create modal, load their available expired batches
  useEffect(() => {
    if (createModalOpen && selectedSupplierForBundle) {
      fetchBatchesForSelectedSupplier(selectedSupplierForBundle);
    }
  }, [selectedSupplierForBundle, createModalOpen]);

  const fetchSuppliers = async () => {
    try {
      const res = await axios.get(`${API}/suppliers?limit=200`);
      setSuppliers(res.data.suppliers || []);
    } catch (e) {
      console.error("Failed to fetch suppliers:", e);
    }
  };

  const fetchBundles = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: "15",
      });
      if (search) params.append("search", search);
      if (statusFilter !== "all") params.append("status", statusFilter);
      if (supplierFilter !== "all") params.append("supplier_id", supplierFilter);

      const res = await axios.get(`${API}/expiry?${params.toString()}`);
      setBundles(res.data.bundles || []);
      setUnbundledBatches(res.data.unbundled_batches || []);
      setStats(
        res.data.stats || {
          total_bundles: 0,
          total_value: 0,
          pending_payments: 0,
          completed_returns: 0,
          total_items: 0,
          unbundled_count: 0,
        }
      );
      setTotalPages(res.data.pagination?.total_pages || 1);
      setTotalBundles(res.data.pagination?.total || 0);
    } catch (e) {
      console.error("Failed to fetch expiry bundles:", e);
      toast.error("Failed to load expiry return notes");
    } finally {
      setLoading(false);
    }
  };

  const fetchExpiredBatches = async () => {
    setLoadingBatches(true);
    try {
      const params = new URLSearchParams();
      if (batchSearch) params.append("search", batchSearch);
      if (batchSupplierFilter !== "all") params.append("supplier_id", batchSupplierFilter);
      if (batchStatusFilter !== "all") params.append("status_filter", batchStatusFilter);

      const res = await axios.get(`${API}/expiry/batches?${params.toString()}`);
      setExpiredBatches(res.data.batches || []);
    } catch (e) {
      console.error("Failed to fetch expired batches:", e);
      toast.error("Failed to load expired inventory batches");
    } finally {
      setLoadingBatches(false);
    }
  };

  // Fetch all expired/moved batches for a specific supplier
  const fetchBatchesForSelectedSupplier = async (supId) => {
    setLoadingSupplierBatches(true);
    try {
      const res = await axios.get(`${API}/expiry/batches?supplier_id=${supId}`);
      const unbundledForSup = (res.data.batches || []).filter(
        (b) => b.expiry_status !== "Expired & Returned"
      );
      setSupplierAvailableBatches(unbundledForSup);

      // Auto-populate draft with all unbundled batches if draft is empty
      if (bundleItemsDraft.length === 0 && unbundledForSup.length > 0) {
        setBundleItemsDraft(
          unbundledForSup.map((b) => ({
            inventory_id: b.id,
            product_id: b.product_id,
            product_name: b.product_name,
            batch_no: b.batch_no,
            expiry_date: b.expiry_date,
            pack_type: b.pack_type || "Strip",
            units_per_pack: b.units_per_pack || 1,
            available_quantity: b.available_quantity || 0,
            quantity_units: b.available_quantity || 1,
            purchase_price: b.purchase_price || 0,
            mrp: b.mrp || 0,
            total_refund_amount: (b.available_quantity || 1) * (b.purchase_price || 0),
            notes: "",
          }))
        );
      }
    } catch (e) {
      console.error("Failed to fetch batches for supplier:", e);
    } finally {
      setLoadingSupplierBatches(false);
    }
  };

  // Toggle batch selection in Expired Batches table
  const handleToggleBatchSelect = (batchId) => {
    setSelectedBatchIds((prev) => {
      const next = new Set(prev);
      if (next.has(batchId)) next.delete(batchId);
      else next.add(batchId);
      return next;
    });
  };

  const handleSelectAllBatches = () => {
    if (selectedBatchIds.size === expiredBatches.length) {
      setSelectedBatchIds(new Set());
    } else {
      setSelectedBatchIds(new Set(expiredBatches.map((b) => b.id)));
    }
  };

  // Open Create Bundle Modal from selected batches or supplier
  const handleStartCreateBundle = (preselectedSupplierId = null, preselectedItems = null) => {
    if (preselectedSupplierId) {
      setSelectedSupplierForBundle(preselectedSupplierId);
      if (preselectedItems && preselectedItems.length > 0) {
        setBundleItemsDraft(
          preselectedItems.map((b) => ({
            inventory_id: b.id || b.inventory_id,
            product_id: b.product_id,
            product_name: b.product_name,
            batch_no: b.batch_no,
            expiry_date: b.expiry_date,
            pack_type: b.pack_type || "Strip",
            units_per_pack: b.units_per_pack || 1,
            available_quantity: b.available_quantity || 0,
            quantity_units: b.available_quantity || 1,
            purchase_price: b.purchase_price || 0,
            mrp: b.mrp || 0,
            total_refund_amount: (b.available_quantity || 1) * (b.purchase_price || 0),
            notes: "",
          }))
        );
      } else {
        setBundleItemsDraft([]);
      }
    } else {
      const selectedList = expiredBatches.filter((b) => selectedBatchIds.has(b.id));
      if (selectedList.length > 0) {
        const commonSup = selectedList[0]?.supplier_id;
        const allSame = selectedList.every((b) => b.supplier_id === commonSup);
        if (allSame && commonSup) {
          setSelectedSupplierForBundle(commonSup);
        } else if (suppliers.length > 0) {
          setSelectedSupplierForBundle(suppliers[0].id);
        }

        setBundleItemsDraft(
          selectedList.map((b) => ({
            inventory_id: b.id,
            product_id: b.product_id,
            product_name: b.product_name,
            batch_no: b.batch_no,
            expiry_date: b.expiry_date,
            pack_type: b.pack_type || "Strip",
            units_per_pack: b.units_per_pack || 1,
            available_quantity: b.available_quantity || 0,
            quantity_units: b.available_quantity || 1,
            purchase_price: b.purchase_price || 0,
            mrp: b.mrp || 0,
            total_refund_amount: (b.available_quantity || 1) * (b.purchase_price || 0),
            notes: "",
          }))
        );
      } else {
        setBundleItemsDraft([]);
        if (suppliers.length > 0) {
          setSelectedSupplierForBundle(suppliers[0].id);
        }
      }
    }

    setBundleNotes("");
    setBundleReturnDate(new Date().toISOString().split("T")[0]);
    setCreateModalOpen(true);
  };

  // Handle single batch quick move
  const handleQuickMoveBatch = async (batch) => {
    try {
      await axios.post(`${API}/expiry/move-batch`, {
        inventory_id: batch.id,
        batch_no: batch.batch_no,
        product_name: batch.product_name,
      });
      toast.success(`Batch ${batch.batch_no} marked as Moved to Expiry`, {
        action: {
          label: "Create Return Note",
          onClick: () => handleStartCreateBundle(batch.supplier_id, [batch]),
        },
      });
      fetchExpiredBatches();
      fetchBundles();
    } catch (e) {
      toast.error("Failed to move batch to expiry");
    }
  };

  // Add/Remove item in modal draft
  const handleToggleBatchInDraft = (batch) => {
    setBundleItemsDraft((prev) => {
      const exists = prev.some((it) => it.inventory_id === batch.id || (it.batch_no === batch.batch_no && it.product_name === batch.product_name));
      if (exists) {
        return prev.filter((it) => !(it.inventory_id === batch.id || (it.batch_no === batch.batch_no && it.product_name === batch.product_name)));
      } else {
        return [
          ...prev,
          {
            inventory_id: batch.id,
            product_id: batch.product_id,
            product_name: batch.product_name,
            batch_no: batch.batch_no,
            expiry_date: batch.expiry_date,
            pack_type: batch.pack_type || "Strip",
            units_per_pack: batch.units_per_pack || 1,
            available_quantity: batch.available_quantity || 0,
            quantity_units: batch.available_quantity || 1,
            purchase_price: batch.purchase_price || 0,
            mrp: batch.mrp || 0,
            total_refund_amount: (batch.available_quantity || 1) * (batch.purchase_price || 0),
            notes: "",
          },
        ];
      }
    });
  };

  // Submit Bundle Creation
  const handleCreateBundleSubmit = async () => {
    if (!selectedSupplierForBundle) {
      toast.error("Please select a supplier for this return bundle");
      return;
    }
    if (bundleItemsDraft.length === 0) {
      toast.error("Please add at least one expired batch to the bundle");
      return;
    }

    const supObj = suppliers.find((s) => s.id === selectedSupplierForBundle);
    const supplierName = supObj?.name || "Unknown Supplier";

    setCreatingBundle(true);
    try {
      const payload = {
        supplier_id: selectedSupplierForBundle,
        supplier_name: supplierName,
        return_date: bundleReturnDate,
        notes: bundleNotes,
        status: "Draft",
        items: bundleItemsDraft,
      };

      const res = await axios.post(`${API}/expiry`, payload);
      toast.success(`Expiry Return Note ${res.data.bundle_no} created successfully!`);
      setCreateModalOpen(false);
      setSelectedBatchIds(new Set());
      setActiveTab("bundles");
      fetchBundles();
      fetchExpiredBatches();
    } catch (e) {
      console.error("Failed to create bundle:", e);
      toast.error(e.response?.data?.detail || "Failed to create return bundle");
    } finally {
      setCreatingBundle(false);
    }
  };

  // Status transition handler
  const handleUpdateStatus = async (bundleId, newStatus) => {
    try {
      await axios.patch(`${API}/expiry/${bundleId}/status`, {
        status: newStatus,
      });
      toast.success(`Bundle status updated to "${newStatus}"`);
      fetchBundles();
      if (detailBundle?.id === bundleId) {
        setDetailBundle((prev) => ({ ...prev, status: newStatus }));
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to update status");
    }
  };

  // Open Payment Dialog
  const handleOpenPaymentDialog = (bundle) => {
    setTargetBundleForPayment(bundle);
    const remaining = (bundle.total_amount || 0) - (bundle.amount_paid || 0);
    setPaymentAmount(remaining > 0 ? String(remaining) : "");
    setPaymentMode("Cash");
    setPaymentDate(new Date().toISOString().slice(0, 16));
    setPaymentRefNo("");
    setPaymentNotes("");
    setPaymentModalOpen(true);
  };

  // Submit Recorded Payment
  const handleSubmitPayment = async () => {
    const amt = parseFloat(paymentAmount);
    if (isNaN(amt) || amt <= 0) {
      toast.error("Please enter a valid payment amount");
      return;
    }

    setSubmittingPayment(true);
    try {
      const res = await axios.post(
        `${API}/expiry/${targetBundleForPayment.id}/payments`,
        {
          amount: amt,
          payment_mode: paymentMode,
          payment_date: paymentDate,
          reference_no: paymentRefNo,
          notes: paymentNotes,
        }
      );

      toast.success("Payment recorded successfully!");
      setPaymentModalOpen(false);
      fetchBundles();
      if (detailBundle?.id === targetBundleForPayment.id) {
        setDetailBundle((prev) => ({
          ...prev,
          amount_paid: res.data.amount_paid,
          remaining_amount: res.data.remaining_amount,
          status: res.data.status,
          payments: [...(prev.payments || []), res.data.payment],
        }));
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to record payment");
    } finally {
      setSubmittingPayment(false);
    }
  };

  // Delete Draft Bundle
  const handleDeleteBundle = async () => {
    if (!bundleToDelete) return;
    try {
      await axios.delete(`${API}/expiry/${bundleToDelete.id}`);
      toast.success("Expiry Return Note deleted and batches restored");
      setDeleteConfirmOpen(false);
      setBundleToDelete(null);
      fetchBundles();
      fetchExpiredBatches();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to delete bundle");
    }
  };

  // Print Slip handler
  const handlePrintSlip = (bundle) => {
    setDetailBundle(bundle);
    setTimeout(() => {
      window.print();
    }, 300);
  };

  // Group unbundled batches by supplier
  const unbundledBySupplier = {};
  unbundledBatches.forEach((b) => {
    const sId = b.supplier_id || "unknown";
    const sName = b.supplier_name || "Unknown Supplier";
    if (!unbundledBySupplier[sId]) {
      unbundledBySupplier[sId] = {
        supplier_id: sId,
        supplier_name: sName,
        batches: [],
        total_value: 0,
      };
    }
    unbundledBySupplier[sId].batches.push(b);
    unbundledBySupplier[sId].total_value += (b.available_quantity || 0) * (b.purchase_price || 0);
  });
  const unbundledSupplierGroups = Object.values(unbundledBySupplier);

  return (
    <div className="space-y-4 pb-12 animate-in fade-in duration-300">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-border/60">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-500">
              <CalendarX className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-foreground tracking-tight">
                Expiry Management
              </h1>
              <p className="text-xs font-semibold text-muted-foreground">
                Track expired stock, create supplier return notes, and manage settlement ledgers
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              fetchBundles();
              fetchExpiredBatches();
            }}
            className="h-9 rounded-xl border-border/70 text-xs font-bold hover:bg-muted cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            Refresh
          </Button>

          <Button
            size="sm"
            onClick={() => handleStartCreateBundle()}
            className="h-9 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs shadow-md shadow-orange-600/20 cursor-pointer"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Create Expiry Bundle
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="rounded-2xl border-border/70 bg-card/60 backdrop-blur-md shadow-xs">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground">
                Active Return Notes
              </p>
              <p className="text-xl sm:text-2xl font-black font-mono text-foreground mt-0.5">
                {stats.total_bundles}
              </p>
              <p className="text-[10px] font-semibold text-muted-foreground mt-0.5">
                {stats.total_items} batch items bundled
              </p>
            </div>
            <div className="p-3 rounded-xl bg-orange-500/10 border border-orange-500/30 text-orange-500">
              <Layers className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border/70 bg-card/60 backdrop-blur-md shadow-xs">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground">
                Total Expiry Value
              </p>
              <p className="text-xl sm:text-2xl font-black font-mono text-rose-500 mt-0.5">
                ₹{(stats.total_value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </p>
              <p className="text-[10px] font-semibold text-muted-foreground mt-0.5">
                At cost price
              </p>
            </div>
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-500">
              <CalendarX className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border/70 bg-card/60 backdrop-blur-md shadow-xs">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground">
                Pending Settlements
              </p>
              <p className="text-xl sm:text-2xl font-black font-mono text-amber-500 mt-0.5">
                ₹{(stats.pending_payments || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </p>
              <p className="text-[10px] font-semibold text-amber-500/80 mt-0.5">
                Owed by suppliers
              </p>
            </div>
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-500">
              <Clock className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border/70 bg-card/60 backdrop-blur-md shadow-xs">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground">
                Completed & Settled
              </p>
              <p className="text-xl sm:text-2xl font-black font-mono text-emerald-500 mt-0.5">
                ₹{(stats.completed_returns || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </p>
              <p className="text-[10px] font-semibold text-emerald-500/80 mt-0.5">
                Refunds received
              </p>
            </div>
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-500">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* PENDING UNBUNDLED BATCHES CALLOUT (if any batches moved to expiry but not in a note yet) */}
      {unbundledSupplierGroups.length > 0 && (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-transparent border border-amber-500/30 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-500" />
              <div>
                <h3 className="text-xs sm:text-sm font-black text-foreground">
                  Unbundled Expired Batches ({unbundledBatches.length} items ready for return notes)
                </h3>
                <p className="text-[11px] text-muted-foreground">
                  You have batches marked for expiry. Click below to generate return notes for each supplier.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1">
            {unbundledSupplierGroups.map((grp) => (
              <div
                key={grp.supplier_id}
                className="p-3 rounded-xl bg-card/80 border border-border/70 flex items-center justify-between gap-2 shadow-2xs"
              >
                <div>
                  <p className="font-bold text-xs text-foreground flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="truncate max-w-[140px]">{grp.supplier_name}</span>
                  </p>
                  <p className="text-[10px] font-mono text-muted-foreground mt-0.5">
                    {grp.batches.length} batches • <span className="text-orange-500 font-bold">₹{grp.total_value.toFixed(2)}</span>
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => handleStartCreateBundle(grp.supplier_id !== "unknown" ? grp.supplier_id : null, grp.batches)}
                  className="h-7 text-[11px] font-bold rounded-lg bg-orange-600 hover:bg-orange-700 text-white shadow-xs cursor-pointer"
                >
                  Create Note
                  <ArrowUpRight className="w-3 h-3 ml-1" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-border/60">
        <button
          type="button"
          onClick={() => {
            setActiveTab("bundles");
            setPage(1);
          }}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-black border-b-2 transition-all cursor-pointer ${
            activeTab === "bundles"
              ? "border-orange-500 text-orange-600 dark:text-orange-400 bg-orange-500/5"
              : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30"
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Expiry Return Notes ({totalBundles})</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab("inventory");
          }}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-black border-b-2 transition-all cursor-pointer ${
            activeTab === "inventory"
              ? "border-orange-500 text-orange-600 dark:text-orange-400 bg-orange-500/5"
              : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30"
          }`}
        >
          <Package className="w-4 h-4" />
          <span>Browse Expired Inventory Batches</span>
          {expiredBatches.length > 0 && (
            <Badge className="px-1.5 py-0 text-[10px] font-extrabold bg-rose-500/20 text-rose-600 dark:text-rose-400 border-rose-500/30">
              {expiredBatches.length}
            </Badge>
          )}
        </button>
      </div>

      {/* TAB 1: EXPIRY BUNDLES LIST */}
      {activeTab === "bundles" && (
        <div className="space-y-3">
          {/* Filter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 p-3 rounded-2xl bg-card/60 border border-border/70 backdrop-blur-md">
            <div className="flex items-center gap-2 flex-1 min-w-[240px]">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Search by Note #, Supplier, Product, Batch..."
                  className="pl-9 h-9 text-xs rounded-xl bg-background border-border/70 font-semibold"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Select
                value={statusFilter}
                onValueChange={(val) => {
                  setStatusFilter(val);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-44 h-9 text-xs font-semibold rounded-xl bg-background border-border/70">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="Draft">Draft / Pending Pick</SelectItem>
                  <SelectItem value="Picked - Payment Pending">Picked - Payment Pending</SelectItem>
                  <SelectItem value="Partial Paid">Partial Paid</SelectItem>
                  <SelectItem value="Payment Done (Returned)">Returned & Settled</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={supplierFilter}
                onValueChange={(val) => {
                  setSupplierFilter(val);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-48 h-9 text-xs font-semibold rounded-xl bg-background border-border/70">
                  <SelectValue placeholder="All Suppliers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Suppliers</SelectItem>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Bundles Table */}
          <div className="rounded-2xl border border-border/70 bg-card/60 overflow-hidden backdrop-blur-md shadow-xs">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="font-extrabold text-[11px] uppercase tracking-wider h-10">
                    Return Note #
                  </TableHead>
                  <TableHead className="font-extrabold text-[11px] uppercase tracking-wider h-10">
                    Supplier
                  </TableHead>
                  <TableHead className="font-extrabold text-[11px] uppercase tracking-wider h-10">
                    Date
                  </TableHead>
                  <TableHead className="font-extrabold text-[11px] uppercase tracking-wider h-10 text-center">
                    Items
                  </TableHead>
                  <TableHead className="font-extrabold text-[11px] uppercase tracking-wider h-10 text-right">
                    Total Amount
                  </TableHead>
                  <TableHead className="font-extrabold text-[11px] uppercase tracking-wider h-10 text-right">
                    Paid / Settled
                  </TableHead>
                  <TableHead className="font-extrabold text-[11px] uppercase tracking-wider h-10 text-right">
                    Remaining Due
                  </TableHead>
                  <TableHead className="font-extrabold text-[11px] uppercase tracking-wider h-10 text-center">
                    Status
                  </TableHead>
                  <TableHead className="w-28 text-right font-extrabold text-[11px] uppercase tracking-wider h-10">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="py-12 text-center">
                      <Loader size="md" text="Loading Expiry Return Notes..." />
                    </TableCell>
                  </TableRow>
                ) : bundles.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="py-12 text-center text-muted-foreground">
                      <CalendarX className="w-10 h-10 mx-auto mb-2 opacity-40 text-muted-foreground" />
                      <p className="text-xs font-bold uppercase tracking-widest">No Expiry Return Notes created yet</p>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Select expired batches or click "Create Expiry Bundle" to bundle stock into supplier return notes.
                      </p>
                      <Button
                        size="sm"
                        onClick={() => handleStartCreateBundle()}
                        className="mt-3 h-8 text-xs font-bold rounded-xl bg-orange-600 hover:bg-orange-700 text-white"
                      >
                        <Plus className="w-3.5 h-3.5 mr-1" />
                        Create First Return Note
                      </Button>
                    </TableCell>
                  </TableRow>
                ) : (
                  bundles.map((bundle) => {
                    const statusConf = STATUS_CONFIG[bundle.status] || STATUS_CONFIG["Draft"];
                    const remaining = Math.max(0, (bundle.total_amount || 0) - (bundle.amount_paid || 0));

                    return (
                      <TableRow
                        key={bundle.id}
                        className="hover:bg-muted/40 transition-colors cursor-pointer"
                        onClick={() => {
                          setDetailBundle(bundle);
                          setDetailModalOpen(true);
                        }}
                      >
                        <TableCell className="font-mono text-xs font-black text-orange-600 dark:text-orange-400">
                          {bundle.bundle_no}
                        </TableCell>
                        <TableCell>
                          <div className="font-bold text-xs text-foreground flex items-center gap-1.5">
                            <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            <span className="truncate max-w-[180px]">{bundle.supplier_name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {bundle.return_date || bundle.created_at?.slice(0, 10)}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className="text-[10px] font-bold px-2 py-0">
                            {(bundle.items || []).length} batches
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs font-bold text-foreground">
                          ₹{(bundle.total_amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400">
                          ₹{(bundle.amount_paid || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs font-black">
                          {remaining > 0 ? (
                            <span className="text-rose-500 bg-rose-500/10 px-2 py-0.5 rounded-md border border-rose-500/30">
                              ₹{remaining.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                            </span>
                          ) : (
                            <span className="text-emerald-500 font-bold">Settled</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black border ${statusConf.color}`}
                          >
                            <statusConf.icon className="w-3 h-3 shrink-0" />
                            {statusConf.label}
                          </span>
                        </TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setDetailBundle(bundle);
                                setDetailModalOpen(true);
                              }}
                              className="h-7 w-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
                              title="View Details"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </Button>

                            {bundle.status !== "Payment Done (Returned)" && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleOpenPaymentDialog(bundle)}
                                className="h-7 w-7 rounded-lg text-blue-500 hover:text-blue-400 hover:bg-blue-500/10"
                                title="Record Payment / Settlement"
                              >
                                <CreditCard className="w-3.5 h-3.5" />
                              </Button>
                            )}

                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handlePrintSlip(bundle)}
                              className="h-7 w-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
                              title="Print Return Slip"
                            >
                              <Printer className="w-3.5 h-3.5" />
                            </Button>

                            {bundle.status !== "Payment Done (Returned)" && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  setBundleToDelete(bundle);
                                  setDeleteConfirmOpen(true);
                                }}
                                className="h-7 w-7 rounded-lg text-rose-500 hover:text-rose-400 hover:bg-rose-500/10"
                                title="Delete Draft Note"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Centered Pagination */}
          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
              <div className="text-xs text-muted-foreground sm:w-1/3 text-left">
                Showing page {page} of {totalPages} ({totalBundles} notes)
              </div>
              <div className="flex items-center justify-center gap-1 sm:w-1/3">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="h-8 px-3 text-xs rounded-xl font-bold cursor-pointer"
                >
                  Previous
                </Button>
                <div className="flex items-center gap-1 px-2">
                  <span className="text-xs font-black text-orange-500">{page}</span>
                  <span className="text-xs text-muted-foreground">/</span>
                  <span className="text-xs font-bold text-muted-foreground">{totalPages}</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="h-8 px-3 text-xs rounded-xl font-bold cursor-pointer"
                >
                  Next
                </Button>
              </div>
              <div className="sm:w-1/3"></div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: BROWSE EXPIRED INVENTORY BATCHES */}
      {activeTab === "inventory" && (
        <div className="space-y-3">
          {/* Action and Filter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 p-3 rounded-2xl bg-card/60 border border-border/70 backdrop-blur-md">
            <div className="flex items-center gap-2 flex-1 min-w-[240px]">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
                <Input
                  value={batchSearch}
                  onChange={(e) => setBatchSearch(e.target.value)}
                  placeholder="Search expired batches by Product, Batch #, Salt, MFG..."
                  className="pl-9 h-9 text-xs rounded-xl bg-background border-border/70 font-semibold"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Select value={batchStatusFilter} onValueChange={setBatchStatusFilter}>
                <SelectTrigger className="w-40 h-9 text-xs font-semibold rounded-xl bg-background border-border/70">
                  <SelectValue placeholder="All Batches" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Batches</SelectItem>
                  <SelectItem value="unmoved">Unmoved in Inventory</SelectItem>
                  <SelectItem value="moved">Moved to Expiry</SelectItem>
                  <SelectItem value="returned">Expired & Returned</SelectItem>
                </SelectContent>
              </Select>

              <Select value={batchSupplierFilter} onValueChange={setBatchSupplierFilter}>
                <SelectTrigger className="w-44 h-9 text-xs font-semibold rounded-xl bg-background border-border/70">
                  <SelectValue placeholder="All Suppliers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Suppliers</SelectItem>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {selectedBatchIds.size > 0 && (
                <Button
                  size="sm"
                  onClick={() => handleStartCreateBundle()}
                  className="h-9 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs shadow-md cursor-pointer"
                >
                  <Layers className="w-4 h-4 mr-1.5" />
                  Bundle {selectedBatchIds.size} Selected
                </Button>
              )}
            </div>
          </div>

          {/* Expired Batches Table */}
          <div className="rounded-2xl border border-border/70 bg-card/60 overflow-hidden backdrop-blur-md shadow-xs">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="w-10 text-center">
                    <input
                      type="checkbox"
                      checked={
                        expiredBatches.length > 0 &&
                        selectedBatchIds.size === expiredBatches.length
                      }
                      onChange={handleSelectAllBatches}
                      className="rounded border-border accent-orange-600 cursor-pointer"
                    />
                  </TableHead>
                  <TableHead className="font-extrabold text-[11px] uppercase tracking-wider h-10">
                    Product Details
                  </TableHead>
                  <TableHead className="font-extrabold text-[11px] uppercase tracking-wider h-10">
                    Batch #
                  </TableHead>
                  <TableHead className="font-extrabold text-[11px] uppercase tracking-wider h-10">
                    Expiry Date
                  </TableHead>
                  <TableHead className="font-extrabold text-[11px] uppercase tracking-wider h-10">
                    Supplier
                  </TableHead>
                  <TableHead className="font-extrabold text-[11px] uppercase tracking-wider h-10 text-right">
                    Available Units
                  </TableHead>
                  <TableHead className="font-extrabold text-[11px] uppercase tracking-wider h-10 text-right">
                    Cost / Unit
                  </TableHead>
                  <TableHead className="font-extrabold text-[11px] uppercase tracking-wider h-10 text-right">
                    Expired Value
                  </TableHead>
                  <TableHead className="font-extrabold text-[11px] uppercase tracking-wider h-10 text-center">
                    Status
                  </TableHead>
                  <TableHead className="w-28 text-right font-extrabold text-[11px] uppercase tracking-wider h-10">
                    Action
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingBatches ? (
                  <TableRow>
                    <TableCell colSpan={10} className="py-12 text-center">
                      <Loader size="md" text="Scanning expired inventory batches..." />
                    </TableCell>
                  </TableRow>
                ) : expiredBatches.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="py-12 text-center text-muted-foreground">
                      <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-emerald-500 opacity-60" />
                      <p className="text-xs font-bold uppercase tracking-widest text-foreground">
                        No Expired Batches in Catalog
                      </p>
                    </TableCell>
                  </TableRow>
                ) : (
                  expiredBatches.map((b) => {
                    const isSelected = selectedBatchIds.has(b.id);
                    const hasBundle = !!b.expiry_bundle_no;
                    const isMoved = b.expiry_status === "Moved to Expiry" || b.expiry_status === "Picked";
                    const isReturned = b.expiry_status === "Expired & Returned";
                    const batchValue = (b.available_quantity || 0) * (b.purchase_price || 0);

                    return (
                      <TableRow
                        key={b.id}
                        className={`hover:bg-muted/40 transition-colors ${
                          isSelected ? "bg-orange-500/10" : ""
                        }`}
                      >
                        <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleBatchSelect(b.id)}
                            className="rounded border-border accent-orange-600 cursor-pointer"
                          />
                        </TableCell>
                        <TableCell>
                          <div>
                            <span className="font-bold text-xs text-foreground">{b.product_name}</span>
                            {b.salt_composition && (
                              <p className="text-[10px] text-muted-foreground truncate max-w-[220px]">
                                {b.salt_composition}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs font-black text-foreground">
                          {b.batch_no}
                        </TableCell>
                        <TableCell className="font-mono text-xs font-bold text-rose-500">
                          {b.expiry_date || "-"}
                        </TableCell>
                        <TableCell>
                          <span className="text-xs font-semibold text-muted-foreground">
                            {b.supplier_name || "Unknown"}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs font-bold text-foreground">
                          {b.available_quantity || 0} {b.pack_type ? `(${b.pack_type})` : "u"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs text-muted-foreground">
                          ₹{Number(b.purchase_price || 0).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs font-black text-rose-500">
                          ₹{batchValue.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-center">
                          {isReturned ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black bg-emerald-500/15 text-emerald-500 border border-emerald-500/30">
                              <CheckCircle2 className="w-3 h-3" />
                              Expired & Returned
                            </span>
                          ) : hasBundle ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black bg-emerald-500/15 text-emerald-500 border border-emerald-500/30">
                              <CheckCircle2 className="w-3 h-3" />
                              In Note #{b.expiry_bundle_no}
                            </span>
                          ) : isMoved ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black bg-amber-500/15 text-amber-500 border border-amber-500/30">
                              <Clock className="w-3 h-3" />
                              Moved to Expiry
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-muted text-muted-foreground border border-border">
                              In Inventory
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {!isMoved && !isReturned ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleQuickMoveBatch(b)}
                              className="h-7 px-2 text-[11px] font-bold border-orange-500/30 text-orange-600 dark:text-orange-400 hover:bg-orange-500/10 cursor-pointer"
                            >
                              Move to Expiry
                            </Button>
                          ) : !hasBundle && !isReturned ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleStartCreateBundle(b.supplier_id, [b])}
                              className="h-7 px-2 text-[11px] font-bold bg-orange-600 hover:bg-orange-700 text-white border-transparent cursor-pointer shadow-2xs"
                            >
                              + Create Note
                            </Button>
                          ) : (
                            <span className="text-[11px] text-muted-foreground font-semibold">Bundled</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* CREATE EXPIRY BUNDLE MODAL WITH INLINE BATCH PICKER */}
      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto rounded-3xl p-6 bg-background/95 backdrop-blur-xl border-border/80">
          <DialogHeader>
            <DialogTitle className="text-lg font-black text-foreground flex items-center gap-2">
              <CalendarX className="w-5 h-5 text-orange-500" />
              Create Expiry Return Note
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Select a supplier and choose the expired batches to include in this return settlement.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-bold">Select Supplier *</Label>
                <Select
                  value={selectedSupplierForBundle}
                  onValueChange={(val) => {
                    setSelectedSupplierForBundle(val);
                    setBundleItemsDraft([]);
                  }}
                >
                  <SelectTrigger className="h-9 mt-1 rounded-xl text-xs font-semibold">
                    <SelectValue placeholder="Select Supplier" />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs font-bold">Return Date</Label>
                <Input
                  type="date"
                  value={bundleReturnDate}
                  onChange={(e) => setBundleReturnDate(e.target.value)}
                  className="h-9 mt-1 rounded-xl text-xs font-semibold cursor-pointer"
                  style={{ colorScheme: "dark light" }}
                />
              </div>
            </div>

            {/* INLINE BATCH PICKER FOR SELECTED SUPPLIER */}
            {selectedSupplierForBundle && (
              <div className="p-3.5 rounded-2xl bg-card/60 border border-border/70 space-y-2.5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-black text-foreground flex items-center gap-1.5">
                    <Package className="w-4 h-4 text-orange-500" />
                    Available Expired Batches for {suppliers.find((s) => s.id === selectedSupplierForBundle)?.name || "Supplier"} ({supplierAvailableBatches.length})
                  </p>
                  {supplierAvailableBatches.length > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setBundleItemsDraft(
                          supplierAvailableBatches.map((b) => ({
                            inventory_id: b.id,
                            product_id: b.product_id,
                            product_name: b.product_name,
                            batch_no: b.batch_no,
                            expiry_date: b.expiry_date,
                            pack_type: b.pack_type || "Strip",
                            units_per_pack: b.units_per_pack || 1,
                            available_quantity: b.available_quantity || 0,
                            quantity_units: b.available_quantity || 1,
                            purchase_price: b.purchase_price || 0,
                            mrp: b.mrp || 0,
                            total_refund_amount: (b.available_quantity || 1) * (b.purchase_price || 0),
                            notes: "",
                          }))
                        );
                      }}
                      className="h-6 text-[11px] text-orange-500 font-bold hover:bg-orange-500/10 cursor-pointer"
                    >
                      + Add All Batches
                    </Button>
                  )}
                </div>

                {loadingSupplierBatches ? (
                  <div className="py-4 text-center">
                    <Loader size="xs" text="Finding batches for supplier..." />
                  </div>
                ) : supplierAvailableBatches.length === 0 ? (
                  <div className="p-4 text-center rounded-xl bg-muted/20 border border-border/40 text-xs text-muted-foreground">
                    No unbundled expired batches currently found for this supplier.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-44 overflow-y-auto pr-1">
                    {supplierAvailableBatches.map((b) => {
                      const isAdded = bundleItemsDraft.some(
                        (it) => it.inventory_id === b.id || (it.batch_no === b.batch_no && it.product_name === b.product_name)
                      );

                      return (
                        <div
                          key={b.id}
                          onClick={() => handleToggleBatchInDraft(b)}
                          className={`p-2.5 rounded-xl border text-xs cursor-pointer transition-all flex items-center justify-between gap-2 ${
                            isAdded
                              ? "bg-orange-500/15 border-orange-500/50 text-foreground shadow-2xs"
                              : "bg-background border-border/70 hover:border-border text-muted-foreground"
                          }`}
                        >
                          <div className="truncate">
                            <p className="font-bold text-foreground truncate">{b.product_name}</p>
                            <p className="text-[10px] font-mono text-muted-foreground mt-0.5">
                              Batch: {b.batch_no} • Exp: <span className="text-rose-500">{b.expiry_date}</span> • {b.available_quantity || 0}u
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            <span className="font-mono font-bold text-xs text-foreground block">
                              ₹{((b.available_quantity || 0) * (b.purchase_price || 0)).toFixed(2)}
                            </span>
                            <span
                              className={`text-[9px] font-black px-1.5 py-0.2 rounded ${
                                isAdded ? "bg-orange-500 text-white" : "bg-muted text-muted-foreground"
                              }`}
                            >
                              {isAdded ? "Added" : "+ Add"}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Selected Batches Table in Creator */}
            <div className="space-y-2">
              <Label className="text-xs font-bold">
                Batches in Return Note ({bundleItemsDraft.length})
              </Label>

              {bundleItemsDraft.length === 0 ? (
                <div className="p-6 text-center border border-dashed border-border/70 rounded-2xl bg-muted/20 text-xs font-semibold text-muted-foreground">
                  No batches selected yet. Choose a supplier above to see and add their expired batches.
                </div>
              ) : (
                <div className="rounded-xl border border-border/70 overflow-hidden max-h-56 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40 text-[10px] uppercase">
                        <TableHead className="py-2">Product</TableHead>
                        <TableHead className="py-2">Batch #</TableHead>
                        <TableHead className="py-2">Expiry</TableHead>
                        <TableHead className="py-2 text-right">Units</TableHead>
                        <TableHead className="py-2 text-right">Rate (₹)</TableHead>
                        <TableHead className="py-2 text-right">Total (₹)</TableHead>
                        <TableHead className="py-2 w-8"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {bundleItemsDraft.map((item, idx) => (
                        <TableRow key={idx} className="text-xs">
                          <TableCell className="font-bold">{item.product_name}</TableCell>
                          <TableCell className="font-mono">{item.batch_no}</TableCell>
                          <TableCell className="font-mono text-rose-500">{item.expiry_date}</TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="number"
                              min="1"
                              value={item.quantity_units}
                              onChange={(e) => {
                                const val = parseInt(e.target.value) || 0;
                                setBundleItemsDraft((prev) =>
                                  prev.map((it, i) =>
                                    i === idx
                                      ? {
                                          ...it,
                                          quantity_units: val,
                                          total_refund_amount: val * (it.purchase_price || 0),
                                        }
                                      : it
                                  )
                                );
                              }}
                              className="h-7 w-20 text-xs text-right font-mono font-bold"
                            />
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            ₹{Number(item.purchase_price || 0).toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right font-mono font-bold text-orange-500">
                            ₹{Number(item.total_refund_amount || 0).toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setBundleItemsDraft((prev) => prev.filter((_, i) => i !== idx));
                              }}
                              className="h-6 w-6 text-rose-500 hover:text-rose-400"
                            >
                              <X className="w-3.5 h-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {/* Total Calculation */}
              {bundleItemsDraft.length > 0 && (
                <div className="flex justify-end pt-2">
                  <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl px-4 py-2 text-right">
                    <span className="text-xs font-bold text-muted-foreground mr-2">Estimated Return Value:</span>
                    <span className="text-base font-black font-mono text-orange-500">
                      ₹
                      {bundleItemsDraft
                        .reduce((acc, it) => acc + (it.total_refund_amount || 0), 0)
                        .toFixed(2)}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div>
              <Label className="text-xs font-bold">Notes / Reason for Return</Label>
              <Textarea
                value={bundleNotes}
                onChange={(e) => setBundleNotes(e.target.value)}
                placeholder="Add return terms, supplier pickup details, or reference remarks..."
                className="mt-1 text-xs rounded-xl"
                rows={2}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setCreateModalOpen(false)}
              className="rounded-xl text-xs font-bold cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              disabled={creatingBundle || bundleItemsDraft.length === 0}
              onClick={handleCreateBundleSubmit}
              className="rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs shadow-md cursor-pointer"
            >
              {creatingBundle ? "Creating..." : "Save Expiry Return Note"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* VIEW DETAILS & STATUS WORKFLOW MODAL */}
      <Dialog open={detailModalOpen} onOpenChange={setDetailModalOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto rounded-3xl p-6 bg-background/95 backdrop-blur-xl border-border/80">
          {detailBundle && (
            <div className="space-y-5">
              <DialogHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CalendarX className="w-5 h-5 text-orange-500" />
                    <DialogTitle className="text-lg font-black font-mono">
                      {detailBundle.bundle_no}
                    </DialogTitle>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-black border ${
                      STATUS_CONFIG[detailBundle.status]?.color || ""
                    }`}
                  >
                    {STATUS_CONFIG[detailBundle.status]?.label || detailBundle.status}
                  </span>
                </div>
                <DialogDescription className="text-xs text-muted-foreground">
                  Supplier: <strong className="text-foreground">{detailBundle.supplier_name}</strong> | Created:{" "}
                  {detailBundle.created_at?.slice(0, 10)}
                </DialogDescription>
              </DialogHeader>

              {/* Status Action Workflow Stepper */}
              <div className="p-3.5 rounded-2xl bg-muted/30 border border-border/70 space-y-2.5">
                <p className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">
                  Workflow Status Progression
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    size="sm"
                    variant={detailBundle.status === "Draft" ? "default" : "outline"}
                    onClick={() => handleUpdateStatus(detailBundle.id, "Draft")}
                    className="h-8 text-xs font-bold rounded-xl"
                  >
                    1. Draft
                  </Button>
                  <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
                  <Button
                    size="sm"
                    variant={detailBundle.status === "Picked - Payment Pending" ? "default" : "outline"}
                    onClick={() => handleUpdateStatus(detailBundle.id, "Picked - Payment Pending")}
                    className="h-8 text-xs font-bold rounded-xl"
                  >
                    2. Picked (Pending Payment)
                  </Button>
                  <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
                  <Button
                    size="sm"
                    variant={detailBundle.status === "Payment Done (Returned)" ? "default" : "outline"}
                    onClick={() => handleUpdateStatus(detailBundle.id, "Payment Done (Returned)")}
                    className="h-8 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    3. Mark Returned & Settled
                  </Button>
                </div>
              </div>

              {/* Items List */}
              <div className="space-y-2">
                <p className="text-xs font-extrabold text-foreground">
                  Items in Return Note ({detailBundle.items?.length || 0})
                </p>
                <div className="rounded-xl border border-border/70 overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40 text-[10px] uppercase">
                        <TableHead className="py-2">Product Name</TableHead>
                        <TableHead className="py-2">Batch #</TableHead>
                        <TableHead className="py-2">Expiry Date</TableHead>
                        <TableHead className="py-2 text-right">Units</TableHead>
                        <TableHead className="py-2 text-right">Rate</TableHead>
                        <TableHead className="py-2 text-right">Refund Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detailBundle.items?.map((it, idx) => (
                        <TableRow key={idx} className="text-xs">
                          <TableCell className="font-bold">{it.product_name}</TableCell>
                          <TableCell className="font-mono">{it.batch_no}</TableCell>
                          <TableCell className="font-mono text-rose-500">{it.expiry_date}</TableCell>
                          <TableCell className="text-right font-mono font-bold">{it.quantity_units}</TableCell>
                          <TableCell className="text-right font-mono">₹{Number(it.purchase_price || 0).toFixed(2)}</TableCell>
                          <TableCell className="text-right font-mono font-bold text-orange-500">
                            ₹{Number(it.total_refund_amount || 0).toFixed(2)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Financial Ledger & Payments */}
              <div className="p-4 rounded-2xl bg-card/80 border border-border/70 space-y-3">
                <div className="flex items-center justify-between border-b border-border/40 pb-2">
                  <p className="text-xs font-black uppercase tracking-wider text-foreground">
                    Settlement & Payment Ledger
                  </p>
                  {detailBundle.status !== "Payment Done (Returned)" && (
                    <Button
                      size="sm"
                      onClick={() => handleOpenPaymentDialog(detailBundle)}
                      className="h-7 text-xs font-bold rounded-lg bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      <Plus className="w-3.5 h-3.5 mr-1" />
                      Record Payment
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2.5 rounded-xl bg-muted/40">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase">Total Refund Value</p>
                    <p className="text-sm font-black font-mono text-foreground mt-0.5">
                      ₹{(detailBundle.total_amount || 0).toFixed(2)}
                    </p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                    <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase">
                      Total Received
                    </p>
                    <p className="text-sm font-black font-mono text-emerald-500 mt-0.5">
                      ₹{(detailBundle.amount_paid || 0).toFixed(2)}
                    </p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20">
                    <p className="text-[10px] font-bold text-rose-600 dark:text-rose-400 uppercase">
                      Remaining Due
                    </p>
                    <p className="text-sm font-black font-mono text-rose-500 mt-0.5">
                      ₹{Math.max(0, (detailBundle.total_amount || 0) - (detailBundle.amount_paid || 0)).toFixed(2)}
                    </p>
                  </div>
                </div>

                {/* Payments Timeline */}
                {detailBundle.payments && detailBundle.payments.length > 0 ? (
                  <div className="space-y-1.5 pt-2">
                    <p className="text-[11px] font-bold text-muted-foreground">Payment History:</p>
                    {detailBundle.payments.map((p, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-2 rounded-lg bg-muted/30 border border-border/40 text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <CreditCard className="w-3.5 h-3.5 text-blue-500" />
                          <span className="font-bold">{p.payment_mode}</span>
                          <span className="text-[10px] text-muted-foreground">
                            ({new Date(p.payment_date).toLocaleString()})
                          </span>
                          {p.reference_no && (
                            <span className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded">
                              Ref: {p.reference_no}
                            </span>
                          )}
                        </div>
                        <span className="font-mono font-black text-emerald-500">
                          +₹{Number(p.amount).toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    No payments recorded yet for this return note.
                  </p>
                )}
              </div>

              <DialogFooter className="gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePrintSlip(detailBundle)}
                  className="rounded-xl text-xs font-bold"
                >
                  <Printer className="w-3.5 h-3.5 mr-1.5" />
                  Print Return Note
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDetailModalOpen(false)}
                  className="rounded-xl text-xs font-bold"
                >
                  Close
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* RECORD PAYMENT DIALOG */}
      <Dialog open={paymentModalOpen} onOpenChange={setPaymentModalOpen}>
        <DialogContent className="max-w-md rounded-3xl p-6 bg-background/95 backdrop-blur-xl border-border/80">
          <DialogHeader>
            <DialogTitle className="text-base font-black flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-blue-500" />
              Record Supplier Payment
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Record settlement or partial reimbursement for Return Note {targetBundleForPayment?.bundle_no}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs font-bold">Payment Amount (₹) *</Label>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                placeholder="Enter amount paid"
                className="h-9 mt-1 rounded-xl text-xs font-mono font-bold"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs font-bold">Payment Mode</Label>
                <Select value={paymentMode} onValueChange={setPaymentMode}>
                  <SelectTrigger className="h-9 mt-1 rounded-xl text-xs font-semibold">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Cash">Cash</SelectItem>
                    <SelectItem value="UPI">UPI</SelectItem>
                    <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                    <SelectItem value="Credit Note">Credit Note</SelectItem>
                    <SelectItem value="Cheque">Cheque</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs font-bold">Date & Time</Label>
                <Input
                  type="datetime-local"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="h-9 mt-1 rounded-xl text-xs cursor-pointer font-semibold"
                  style={{ colorScheme: "dark light" }}
                />
              </div>
            </div>

            <div>
              <Label className="text-xs font-bold">Reference / Transaction ID</Label>
              <Input
                value={paymentRefNo}
                onChange={(e) => setPaymentRefNo(e.target.value)}
                placeholder="e.g. UPI Ref, Cheque #, Credit Note #"
                className="h-9 mt-1 rounded-xl text-xs font-mono"
              />
            </div>

            <div>
              <Label className="text-xs font-bold">Notes / Remarks</Label>
              <Input
                value={paymentNotes}
                onChange={(e) => setPaymentNotes(e.target.value)}
                placeholder="Optional remarks"
                className="h-9 mt-1 rounded-xl text-xs"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setPaymentModalOpen(false)}
              className="rounded-xl text-xs font-bold"
            >
              Cancel
            </Button>
            <Button
              disabled={submittingPayment}
              onClick={handleSubmitPayment}
              className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md"
            >
              {submittingPayment ? "Recording..." : "Save Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DELETE CONFIRMATION MODAL */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="max-w-md rounded-3xl p-6 bg-background/95 backdrop-blur-xl border-border/80">
          <DialogHeader>
            <DialogTitle className="text-base font-black text-rose-500 flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              Delete Expiry Return Note
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Are you sure you want to delete <strong>{bundleToDelete?.bundle_no}</strong>? The bundled batches will be restored back to active inventory.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setDeleteConfirmOpen(false)}
              className="rounded-xl text-xs font-bold"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteBundle}
              className="rounded-xl font-bold text-xs shadow-md"
            >
              Confirm Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
