import { useState, useEffect, useMemo, useCallback } from "react";
import axios from "axios";
import { API } from "../../App";
import { toast } from "sonner";
import {
  CalendarX,
  Undo2,
  Plus,
  Search,
  CheckCircle2,
  Clock,
  Truck,
  Package,
  Layers,
  Printer,
  Trash2,
  CreditCard,
  Building2,
  RefreshCw,
  X,
  ArrowUpRight,
  RotateCcw,
  Info,
  ChevronRight,
  Wallet,
  Loader2,
} from "lucide-react";
import { Card, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Textarea } from "../ui/textarea";
import { Label } from "../ui/label";
import Loader from "../Loader";
import { formatExpiry } from "../../pages/utils";
import { formatCombo } from "../../lib/shortcuts";

// Returns and Expiry share one workflow; only the stock they deal with differs.
const KINDS = {
  expiry: {
    api: "expiry",
    title: "Expiry",
    subtitle: "Expired stock, your expiry list, and expiry returns to suppliers",
    icon: CalendarX,
    noteName: "Expiry Return Note",
    stockTab: "Expired Stock",
    emptyStock: "No expired stock. Nothing to do here.",
    pendingTitle: "In your expiry list",
    pendingHint: "These expired batches are off the shelf. Create a return note for each supplier to claim credit.",
    steps: [
      ["Mark expired", "Expired units leave sellable stock and go to your expiry list"],
      ["Create return note", "Pick the supplier and the units you are sending back"],
      ["Hand over", "Mark the note handed over when the supplier collects"],
      ["Get credit", "Record the refund, or adjust it against what you owe them"],
    ],
  },
  return: {
    api: "returns",
    title: "Returns",
    subtitle: "Send unexpired stock back to suppliers and track the credit",
    icon: Undo2,
    noteName: "Purchase Return Note",
    stockTab: "Returnable Stock",
    emptyStock: "No returnable stock found.",
    pendingTitle: "Marked for return",
    pendingHint: "These batches are flagged to go back. Create a return note to take the units out of stock.",
    steps: [
      ["Pick stock", "Choose batches and how many units go back"],
      ["Create return note", "Those units leave sellable stock straight away"],
      ["Hand over", "Mark the note handed over when the supplier collects"],
      ["Get credit", "Record the refund, or adjust it against what you owe them"],
    ],
  },
};

const DRAFT = "Draft";
const PICKED = "Picked - Payment Pending";
const PARTIAL = "Partial Paid";
const SETTLED = "Payment Done (Returned)";
const DUES_MODE = "Adjust against dues";

const NOTE_STATUS = {
  [DRAFT]: { label: "Draft · not handed over", short: "Draft", color: "bg-zinc-500/10 text-zinc-600 border-zinc-500/30 dark:text-zinc-300", icon: Clock },
  [PICKED]: { label: "Handed over · credit due", short: "Credit due", color: "bg-amber-500/10 text-amber-600 border-amber-500/30 dark:text-amber-400", icon: Truck },
  [PARTIAL]: { label: "Part credited", short: "Part credited", color: "bg-blue-500/10 text-blue-600 border-blue-500/30 dark:text-blue-400", icon: CreditCard },
  [SETTLED]: { label: "Returned & settled", short: "Settled", color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30 dark:text-emerald-400", icon: CheckCircle2 },
};

const STOCK_STATUS_COLOR = {
  "In Stock": "bg-muted text-muted-foreground border-border",
  Expired: "bg-rose-500/10 text-rose-600 border-rose-500/30 dark:text-rose-400",
  "Expired · In Expiry List": "bg-amber-500/10 text-amber-600 border-amber-500/30 dark:text-amber-400",
  "Expired · In Return Note": "bg-blue-500/10 text-blue-600 border-blue-500/30 dark:text-blue-400",
  "Marked for Return": "bg-amber-500/10 text-amber-600 border-amber-500/30 dark:text-amber-400",
  "In Return Note": "bg-blue-500/10 text-blue-600 border-blue-500/30 dark:text-blue-400",
  "Expired & Returned": "bg-emerald-500/10 text-emerald-600 border-emerald-500/30 dark:text-emerald-400",
  Returned: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30 dark:text-emerald-400",
  "Partly Returned": "bg-teal-500/10 text-teal-600 border-teal-500/30 dark:text-teal-400",
  "Expired · Partly Returned": "bg-teal-500/10 text-teal-600 border-teal-500/30 dark:text-teal-400",
};

const inr = (n) => `₹${(Number(n) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const today = () => new Date().toISOString().split("T")[0];
const errText = (e, fallback) => e?.response?.data?.detail || fallback;
export const StockStatusBadge = ({ status }) => (
  <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black border whitespace-nowrap ${STOCK_STATUS_COLOR[status] || STOCK_STATUS_COLOR["In Stock"]}`}>
    {status || "In Stock"}
  </span>
);

const NoteStatusBadge = ({ status, long }) => {
  const conf = NOTE_STATUS[status] || NOTE_STATUS[DRAFT];
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black border whitespace-nowrap ${conf.color}`}>
      <conf.icon className="w-3 h-3 shrink-0" />
      {long ? conf.label : conf.short}
    </span>
  );
};

const toDraftItem = (b) => {
  const max = Number(b.returnable_units ?? b.available_quantity) || 0;
  return {
    inventory_id: b.id || b.inventory_id,
    product_name: b.product_name,
    batch_no: b.batch_no,
    expiry_date: b.expiry_date,
    supplier_name: b.supplier_name,
    max_units: max,
    quantity_units: max,
    purchase_price: Number(b.purchase_price) || 0,
  };
};

export default function ReturnNotesPage({ kind }) {
  const K = KINDS[kind];
  const base = `${API}/${K.api}`;

  const [activeTab, setActiveTab] = useState("notes");
  const [bundles, setBundles] = useState([]);
  const [unbundled, setUnbundled] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, total_pages: 1 });

  const [batches, setBatches] = useState([]);
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [batchSearch, setBatchSearch] = useState("");
  const [batchStatus, setBatchStatus] = useState("all");
  const [batchSupplier, setBatchSupplier] = useState("all");
  const [selected, setSelected] = useState(new Set());
  const [suppliers, setSuppliers] = useState([]);
  const [stepsOpen, setStepsOpen] = useState(false);

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [draftSupplier, setDraftSupplier] = useState("");
  const [draftItems, setDraftItems] = useState([]);
  const [draftNotes, setDraftNotes] = useState("");
  const [draftDate, setDraftDate] = useState(today());
  const [draftReason, setDraftReason] = useState("Excess Stock");
  const [draftHandedOver, setDraftHandedOver] = useState(false);
  const [pickerBatches, setPickerBatches] = useState([]);
  const [pickerAll, setPickerAll] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [loadingPicker, setLoadingPicker] = useState(false);
  const [creating, setCreating] = useState(false);

  // Detail / payment / confirms
  const [detail, setDetail] = useState(null);
  const [payFor, setPayFor] = useState(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMode, setPayMode] = useState("Cash");
  const [payDate, setPayDate] = useState("");
  const [payRef, setPayRef] = useState("");
  const [payNotes, setPayNotes] = useState("");
  const [paying, setPaying] = useState(false);
  const [confirm, setConfirm] = useState(null); // { title, body, action, label, destructive }
  const [busy, setBusy] = useState(false);

  // The note as a PDF (same format as purchase invoices and bills), in a new tab to print or save
  const [pdfBusy, setPdfBusy] = useState(null);
  const openNotePdf = async (bundle) => {
    const win = window.open("", "_blank"); // inside the click, so pop-up blockers allow it
    setPdfBusy(bundle.id);
    try {
      const res = await axios.get(`${base}/${bundle.id}/pdf`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      if (win) win.location.href = url;
      else window.location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      win?.close();
      toast.error("Couldn't make the PDF. Please try again.");
    } finally {
      setPdfBusy(null);
    }
  };

  const supplierById = useMemo(() => Object.fromEntries(suppliers.map((s) => [s.id, s])), [suppliers]);

  const fetchSuppliers = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/suppliers?limit=500`);
      setSuppliers(res.data.suppliers || []);
    } catch {
      /* the picker shows an empty list */
    }
  }, []);

  const fetchBundles = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "15" });
      if (search) params.append("search", search);
      if (statusFilter !== "all") params.append("status", statusFilter);
      if (supplierFilter !== "all") params.append("supplier_id", supplierFilter);
      const res = await axios.get(`${base}?${params}`);
      setBundles(res.data.bundles || []);
      setUnbundled(res.data.unbundled_batches || []);
      setStats(res.data.stats || {});
      setPagination(res.data.pagination || { total: 0, total_pages: 1 });
    } catch (e) {
      toast.error(errText(e, `Failed to load ${K.noteName}s`));
    } finally {
      setLoading(false);
    }
  }, [base, page, search, statusFilter, supplierFilter, K.noteName]);

  const fetchBatches = useCallback(async () => {
    setLoadingBatches(true);
    try {
      const params = new URLSearchParams();
      if (batchSearch) params.append("search", batchSearch);
      if (batchSupplier !== "all") params.append("supplier_id", batchSupplier);
      if (batchStatus !== "all") params.append("status_filter", batchStatus);
      const res = await axios.get(`${base}/batches?${params}`);
      setBatches(res.data.batches || []);
    } catch (e) {
      toast.error(errText(e, "Failed to load stock"));
    } finally {
      setLoadingBatches(false);
    }
  }, [base, batchSearch, batchSupplier, batchStatus]);

  const refreshAll = () => {
    fetchBundles();
    fetchBatches();
    fetchSuppliers();
  };

  useEffect(() => {
    fetchSuppliers();
  }, [fetchSuppliers]);

  useEffect(() => {
    const t = setTimeout(fetchBundles, search ? 250 : 0);
    return () => clearTimeout(t);
  }, [fetchBundles, search]);

  useEffect(() => {
    const t = setTimeout(fetchBatches, batchSearch ? 250 : 0);
    return () => clearTimeout(t);
  }, [fetchBatches, batchSearch]);

  // Batches the create dialog can add
  useEffect(() => {
    if (!createOpen) return;
    if (!draftSupplier && !pickerAll) {
      setPickerBatches([]);
      return;
    }
    let live = true;
    setLoadingPicker(true);
    const params = new URLSearchParams({ returnable: "1" });
    if (!pickerAll && draftSupplier) params.append("supplier_id", draftSupplier);
    axios
      .get(`${base}/batches?${params}`)
      .then((res) => live && setPickerBatches(res.data.batches || []))
      .catch(() => live && setPickerBatches([]))
      .finally(() => live && setLoadingPicker(false));
    return () => {
      live = false;
    };
  }, [createOpen, draftSupplier, pickerAll, base]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const openCreate = (supplierId = "", items = []) => {
    const ids = [...new Set(items.map((b) => b.supplier_id).filter(Boolean))];
    setDraftSupplier(supplierId || (ids.length === 1 ? ids[0] : ""));
    setDraftItems(items.filter((b) => (b.returnable_units ?? 0) > 0).map(toDraftItem));
    setDraftNotes("");
    setDraftDate(today());
    setDraftReason("Excess Stock");
    setDraftHandedOver(false);
    setPickerAll(false);
    setPickerSearch("");
    setCreateOpen(true);
  };

  const toggleDraftBatch = (b) =>
    setDraftItems((prev) => (prev.some((it) => it.inventory_id === b.id) ? prev.filter((it) => it.inventory_id !== b.id) : [...prev, toDraftItem(b)]));

  const setDraftField = (id, field, value) =>
    setDraftItems((prev) => prev.map((it) => (it.inventory_id === id ? { ...it, [field]: value } : it)));

  const draftErrors = draftItems
    .map((it) => {
      const u = Number(it.quantity_units);
      if (!Number.isInteger(u) || u <= 0) return `${it.product_name}: enter whole units`;
      if (u > it.max_units) return `${it.product_name}: only ${it.max_units} unit(s) available`;
      if (!(Number(it.purchase_price) >= 0)) return `${it.product_name}: invalid rate`;
      return null;
    })
    .filter(Boolean);
  const draftTotal = draftItems.reduce((s, it) => s + (Number(it.quantity_units) || 0) * (Number(it.purchase_price) || 0), 0);

  const submitCreate = async () => {
    if (!draftSupplier) return toast.error("Choose the supplier you are returning to");
    if (!draftItems.length) return toast.error("Add at least one batch");
    if (draftErrors.length) return toast.error(draftErrors[0]);
    setCreating(true);
    try {
      const res = await axios.post(base, {
        supplier_id: draftSupplier,
        supplier_name: supplierById[draftSupplier]?.name,
        return_date: draftDate,
        notes: draftNotes,
        reason: kind === "return" ? draftReason : undefined,
        handed_over: draftHandedOver,
        items: draftItems.map((it) => ({
          inventory_id: it.inventory_id,
          quantity_units: Number(it.quantity_units),
          purchase_price: Number(it.purchase_price),
        })),
      });
      toast.success(`${res.data.bundle_no} created · ${draftItems.length} batch(es) taken out of stock`);
      setCreateOpen(false);
      setSelected(new Set());
      setActiveTab("notes");
      refreshAll();
      setDetail(res.data);
    } catch (e) {
      toast.error(errText(e, "Could not create the note"));
    } finally {
      setCreating(false);
    }
  };

  const reloadDetail = async (id) => {
    try {
      const res = await axios.get(`${base}/${id}`);
      setDetail(res.data);
    } catch {
      setDetail(null);
    }
  };

  const changeStatus = async (bundle, status, successMsg) => {
    setBusy(true);
    try {
      await axios.patch(`${base}/${bundle.id}/status`, { status });
      toast.success(successMsg);
      fetchBundles();
      fetchBatches();
      if (detail?.id === bundle.id) reloadDetail(bundle.id);
    } catch (e) {
      toast.error(errText(e, "Could not update the note"));
    } finally {
      setBusy(false);
    }
  };

  const deleteNote = async (bundle) => {
    setBusy(true);
    try {
      const res = await axios.delete(`${base}/${bundle.id}`);
      toast.success(res.data.message || "Note deleted");
      if (detail?.id === bundle.id) setDetail(null);
      fetchBundles();
      fetchBatches();
    } catch (e) {
      toast.error(errText(e, "Could not delete the note"));
    } finally {
      setBusy(false);
    }
  };

  const moveBatches = async (list) => {
    if (!list.length) return;
    try {
      const res = await axios.post(`${base}/move-batch`, { inventory_ids: list.map((b) => b.id) });
      const moved = res.data.moved?.length || 0;
      const skipped = res.data.skipped || [];
      if (moved) toast.success(res.data.message);
      if (skipped.length) toast.warning(`${skipped.length} skipped: ${skipped.slice(0, 3).map((s) => `${s.batch_no} (${s.reason})`).join(", ")}`);
      setSelected(new Set());
      fetchBatches();
      fetchBundles();
    } catch (e) {
      toast.error(errText(e, "Could not move the batch"));
    }
  };

  const restoreBatch = async (b) => {
    try {
      await axios.post(`${base}/restore-batch`, { inventory_id: b.id });
      toast.success(`${b.batch_no} is back in stock`);
      fetchBatches();
      fetchBundles();
    } catch (e) {
      toast.error(errText(e, "Could not restore the batch"));
    }
  };

  const openPayment = (bundle) => {
    const remaining = Math.max(0, (bundle.total_amount || 0) - (bundle.amount_paid || 0));
    setPayFor(bundle);
    setPayAmount(remaining ? remaining.toFixed(2) : "");
    setPayMode("Cash");
    setPayDate(new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16));
    setPayRef("");
    setPayNotes("");
    fetchSuppliers();
  };

  const payRemaining = payFor ? Math.max(0, (payFor.total_amount || 0) - (payFor.amount_paid || 0)) : 0;
  const supplierOwed = payFor ? Number(supplierById[payFor.supplier_id]?.total_amount_owed) || 0 : 0;
  const payNum = parseFloat(payAmount);
  const payError = !payFor
    ? null
    : !(payNum > 0)
      ? "Enter an amount"
      : payNum > payRemaining + 0.001
        ? `Only ${inr(payRemaining)} is still due on this note`
        : payMode === DUES_MODE && payNum > supplierOwed + 0.001
          ? supplierOwed > 0
            ? `You owe this supplier ${inr(supplierOwed)}; adjust up to that`
            : "You owe this supplier nothing to adjust against"
          : null;

  const submitPayment = async () => {
    if (payError) return toast.error(payError);
    setPaying(true);
    try {
      const res = await axios.post(`${base}/${payFor.id}/payments`, {
        amount: payNum,
        payment_mode: payMode,
        payment_date: payDate ? new Date(payDate).toISOString() : undefined,
        reference_no: payRef,
        notes: payNotes,
      });
      toast.success(
        payMode === DUES_MODE ? `${inr(payNum)} adjusted against ${payFor.supplier_name}'s dues` : `${inr(payNum)} credit recorded`
      );
      const id = payFor.id;
      setPayFor(null);
      fetchBundles();
      fetchBatches();
      fetchSuppliers();
      if (detail?.id === id) reloadDetail(id);
      if (res.data.status === SETTLED) toast.success("Note fully settled");
    } catch (e) {
      toast.error(errText(e, "Could not record the payment"));
    } finally {
      setPaying(false);
    }
  };

  // ── Derived ───────────────────────────────────────────────────────────────

  const pendingGroups = useMemo(() => {
    const groups = {};
    for (const b of unbundled) {
      const id = b.supplier_id || "unknown";
      groups[id] = groups[id] || { supplier_id: b.supplier_id || "", supplier_name: b.supplier_name || "Unknown supplier", batches: [], value: 0 };
      groups[id].batches.push(b);
      groups[id].value += (b.returnable_units || 0) * (b.purchase_price || 0);
    }
    return Object.values(groups);
  }, [unbundled]);

  const pickerList = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    return q ? pickerBatches.filter((b) => `${b.product_name} ${b.batch_no}`.toLowerCase().includes(q)) : pickerBatches;
  }, [pickerBatches, pickerSearch]);

  const selectedBatches = batches.filter((b) => selected.has(b.id));
  const selectedMovable = selectedBatches.filter((b) =>
    kind === "expiry" ? b.stock_status === "Expired" : b.stock_status === "In Stock" || b.stock_status === "Partly Returned"
  );
  const selectedReturnable = selectedBatches.filter((b) => (b.returnable_units || 0) > 0 && !String(b.stock_status).includes("Return Note"));

  const statCards = [
    { label: `${K.noteName}s`, value: stats.total_bundles || 0, hint: `${stats.draft_count || 0} not handed over yet`, icon: Layers, tone: "orange", mono: true },
    { label: "Value in notes", value: inr(stats.total_value), hint: "At landing cost", icon: K.icon, tone: "rose" },
    { label: "Credit due", value: inr(stats.pending_payments), hint: `${inr(stats.awaiting_credit)} already handed over`, icon: Clock, tone: "amber" },
    { label: "Settled", value: inr(stats.completed_returns), hint: "Refunded or adjusted", icon: CheckCircle2, tone: "emerald" },
  ];
  const toneClass = {
    orange: "bg-orange-500/10 border-orange-500/30 text-orange-500",
    rose: "bg-rose-500/10 border-rose-500/30 text-rose-500",
    amber: "bg-amber-500/10 border-amber-500/30 text-amber-500",
    emerald: "bg-emerald-500/10 border-emerald-500/30 text-emerald-500",
  };

  const detailRemaining = detail ? Math.max(0, (detail.total_amount || 0) - (detail.amount_paid || 0)) : 0;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 pb-12 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-border/60">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-2 rounded-xl bg-orange-500/10 border border-orange-500/30 text-orange-500 shrink-0">
            <K.icon className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-black text-foreground tracking-tight">{K.title}</h1>
            <p className="text-xs font-semibold text-muted-foreground">{K.subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setStepsOpen((v) => !v)} className="h-9 rounded-xl text-xs font-bold" aria-expanded={stepsOpen}>
            <Info className="w-3.5 h-3.5 mr-1.5" />
            How it works
          </Button>
          <Button variant="outline" size="sm" onClick={refreshAll} className="h-9 rounded-xl text-xs font-bold" title="Refresh">
            <RefreshCw className="w-3.5 h-3.5 sm:mr-1.5" />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          <Button size="sm" onClick={() => openCreate()} className="h-9 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs shadow-md shadow-orange-600/20" data-shortcut="new" data-kbd={formatCombo("alt+n")}>
            <Plus className="w-4 h-4 mr-1.5" />
            New Return Note
          </Button>
        </div>
      </div>

      {stepsOpen && (
        <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {K.steps.map(([title, text], i) => (
            <li key={title} className="p-3 rounded-2xl border border-border/70 bg-card/60 flex gap-2.5">
              <span className="w-6 h-6 shrink-0 rounded-full bg-orange-500/15 text-orange-600 dark:text-orange-400 text-xs font-black flex items-center justify-center">{i + 1}</span>
              <div>
                <p className="text-xs font-black text-foreground">{title}</p>
                <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">{text}</p>
              </div>
            </li>
          ))}
        </ol>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {statCards.map((c) => (
          <Card key={c.label} className="rounded-2xl border-border/70 bg-card/60 shadow-xs">
            <CardContent className="p-3 sm:p-4 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] sm:text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground truncate">{c.label}</p>
                <p className="text-lg sm:text-2xl font-black font-mono text-foreground mt-0.5 truncate">{c.value}</p>
                <p className="text-[10px] font-semibold text-muted-foreground mt-0.5 truncate">{c.hint}</p>
              </div>
              <div className={`hidden sm:block p-3 rounded-xl border ${toneClass[c.tone]}`}>
                <c.icon className="w-5 h-5" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Batches waiting for a note */}
      {pendingGroups.length > 0 && (
        <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/30 space-y-3">
          <div className="flex items-start gap-2">
            <Clock className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-xs sm:text-sm font-black text-foreground">
                {K.pendingTitle} · {unbundled.length} batch{unbundled.length === 1 ? "" : "es"}
              </h3>
              <p className="text-[11px] text-muted-foreground">{K.pendingHint}</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {pendingGroups.map((g) => (
              <div key={g.supplier_id || "unknown"} className="p-3 rounded-xl bg-card border border-border/70 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-bold text-xs text-foreground flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="truncate">{g.supplier_name}</span>
                  </p>
                  <p className="text-[10px] font-mono text-muted-foreground mt-0.5">
                    {g.batches.length} batch{g.batches.length === 1 ? "" : "es"} · <span className="text-orange-500 font-bold">{inr(g.value)}</span>
                  </p>
                </div>
                <Button size="sm" onClick={() => openCreate(g.supplier_id, g.batches)} className="h-8 text-[11px] font-bold rounded-lg bg-orange-600 hover:bg-orange-700 text-white shrink-0">
                  Create note
                  <ArrowUpRight className="w-3 h-3 ml-1" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border/60 overflow-x-auto" role="tablist">
        {[
          ["notes", `Return Notes (${pagination.total || 0})`, Layers],
          ["stock", K.stockTab, Package],
        ].map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={activeTab === id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-black border-b-2 whitespace-nowrap transition-colors ${
              activeTab === id ? "border-orange-500 text-orange-600 dark:text-orange-400 bg-orange-500/5" : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30"
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Notes tab */}
      {activeTab === "notes" && (
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 p-3 rounded-2xl bg-card/60 border border-border/70">
            <div className="relative flex-1 min-w-0 sm:min-w-[240px]">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search note #, supplier, product, batch…"
                className="pl-9 h-9 text-xs rounded-xl bg-background"
                data-shortcut="search"
              />
            </div>
            <div className="grid grid-cols-2 sm:flex gap-2">
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
                <SelectTrigger className="sm:w-48 h-9 text-xs font-semibold rounded-xl bg-background">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {Object.entries(NOTE_STATUS).map(([v, c]) => (
                    <SelectItem key={v} value={v}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={supplierFilter} onValueChange={(v) => { setSupplierFilter(v); setPage(1); }}>
                <SelectTrigger className="sm:w-48 h-9 text-xs font-semibold rounded-xl bg-background">
                  <SelectValue placeholder="All suppliers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All suppliers</SelectItem>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="rounded-2xl border border-border/70 bg-card/60 overflow-hidden shadow-xs">
            <Table mobileCards>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead data-card="title" className="font-extrabold text-[11px] uppercase tracking-wider h-10">Note #</TableHead>
                  <TableHead className="font-extrabold text-[11px] uppercase tracking-wider h-10">Supplier</TableHead>
                  <TableHead className="font-extrabold text-[11px] uppercase tracking-wider h-10">Date</TableHead>
                  <TableHead className="font-extrabold text-[11px] uppercase tracking-wider h-10 text-center">Items</TableHead>
                  <TableHead className="font-extrabold text-[11px] uppercase tracking-wider h-10 text-right">Value</TableHead>
                  <TableHead className="font-extrabold text-[11px] uppercase tracking-wider h-10 text-right">Credit due</TableHead>
                  <TableHead className="font-extrabold text-[11px] uppercase tracking-wider h-10 text-center">Status</TableHead>
                  <TableHead data-card="actions" className="w-32 text-right font-extrabold text-[11px] uppercase tracking-wider h-10">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody data-rows>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-12 text-center">
                      <Loader size="md" text="Loading notes…" />
                    </TableCell>
                  </TableRow>
                ) : bundles.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-12 text-center text-muted-foreground">
                      <K.icon className="w-10 h-10 mx-auto mb-2 opacity-40" />
                      <p className="text-xs font-bold uppercase tracking-widest">
                        {search || statusFilter !== "all" || supplierFilter !== "all" ? "No notes match these filters" : "No return notes yet"}
                      </p>
                      <Button size="sm" onClick={() => openCreate()} className="mt-3 h-8 text-xs font-bold rounded-xl bg-orange-600 hover:bg-orange-700 text-white">
                        <Plus className="w-3.5 h-3.5 mr-1" />
                        New Return Note
                      </Button>
                    </TableCell>
                  </TableRow>
                ) : (
                  bundles.map((b) => {
                    const remaining = Math.max(0, (b.total_amount || 0) - (b.amount_paid || 0));
                    const deletable = b.status !== SETTLED && !(b.payments || []).length;
                    return (
                      <TableRow key={b.id} className="hover:bg-muted/40 cursor-pointer" onClick={() => setDetail(b)} tabIndex={0} data-row>
                        <TableCell className="font-mono text-xs font-black text-orange-600 dark:text-orange-400">
                          {b.bundle_no}
                          {b.reason && <span className="block text-[10px] font-sans font-semibold text-muted-foreground">{b.reason}</span>}
                        </TableCell>
                        <TableCell>
                          <span className="font-bold text-xs text-foreground truncate block max-w-[200px]">{b.supplier_name}</span>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{b.return_date || b.created_at?.slice(0, 10)}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className="text-[10px] font-bold px-2 py-0">
                            {(b.items || []).length} · {(b.items || []).reduce((s, it) => s + (it.quantity_units || 0), 0)}u
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs font-bold text-foreground">{inr(b.total_amount)}</TableCell>
                        <TableCell className="text-right font-mono text-xs font-black">
                          {remaining > 0 ? <span className="text-rose-500">{inr(remaining)}</span> : <span className="text-emerald-500">Nil</span>}
                        </TableCell>
                        <TableCell className="text-center">
                          <NoteStatusBadge status={b.status} />
                        </TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            {b.status === DRAFT && (
                              <Button variant="ghost" size="icon" disabled={busy} onClick={() => changeStatus(b, PICKED, `${b.bundle_no} handed over`)} className="h-8 w-8 rounded-lg text-amber-600 hover:bg-amber-500/10" title="Mark handed over to supplier (H)" aria-label="Mark handed over" data-row-key="h">
                                <Truck className="w-4 h-4" />
                              </Button>
                            )}
                            {b.status !== SETTLED && (
                              <Button variant="ghost" size="icon" onClick={() => openPayment(b)} className="h-8 w-8 rounded-lg text-blue-600 hover:bg-blue-500/10" title="Record credit (C)" aria-label="Record credit" data-row-key="c">
                                <CreditCard className="w-4 h-4" />
                              </Button>
                            )}
                            <Button variant="ghost" size="icon" onClick={() => openNotePdf(b)} disabled={pdfBusy === b.id} className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground" title="Note PDF to print or save (P)" aria-label="Note PDF" data-row-key="p">
                              {pdfBusy === b.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
                            </Button>
                            {deletable && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() =>
                                  setConfirm({
                                    title: `Delete ${b.bundle_no}?`,
                                    body: `Its ${(b.items || []).reduce((s, it) => s + (it.quantity_units || 0), 0)} unit(s) go back to stock and its purchase records are cleared.`,
                                    label: "Delete note",
                                    destructive: true,
                                    action: () => deleteNote(b),
                                  })
                                }
                                className="h-8 w-8 rounded-lg text-rose-500 hover:bg-rose-500/10"
                                title="Delete note (Del)"
                                data-row-key="delete"
                                aria-label="Delete note"
                              >
                                <Trash2 className="w-4 h-4" />
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

          {pagination.total_pages > 1 && (
            <div className="flex items-center justify-between gap-3 pt-1">
              <span className="text-xs text-muted-foreground">
                Page {page} of {pagination.total_pages}
              </span>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="h-8 px-3 text-xs rounded-xl font-bold">
                  Previous
                </Button>
                <Button variant="outline" size="sm" disabled={page >= pagination.total_pages} onClick={() => setPage((p) => p + 1)} className="h-8 px-3 text-xs rounded-xl font-bold">
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Stock tab */}
      {activeTab === "stock" && (
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 p-3 rounded-2xl bg-card/60 border border-border/70">
            <div className="relative flex-1 min-w-0 sm:min-w-[240px]">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
              <Input value={batchSearch} onChange={(e) => setBatchSearch(e.target.value)} placeholder="Search product, batch, salt, maker…" className="pl-9 h-9 text-xs rounded-xl bg-background" data-shortcut="search" />
            </div>
            <div className="grid grid-cols-2 sm:flex gap-2">
              <Select value={batchStatus} onValueChange={setBatchStatus}>
                <SelectTrigger className="sm:w-48 h-9 text-xs font-semibold rounded-xl bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="unmoved">{kind === "expiry" ? "Expired, on the shelf" : "In stock"}</SelectItem>
                  <SelectItem value="moved">{kind === "expiry" ? "In expiry list / note" : "Marked / in a note"}</SelectItem>
                  <SelectItem value="returned">{kind === "expiry" ? "Expired & returned" : "Returned"}</SelectItem>
                </SelectContent>
              </Select>
              <Select value={batchSupplier} onValueChange={setBatchSupplier}>
                <SelectTrigger className="sm:w-48 h-9 text-xs font-semibold rounded-xl bg-background">
                  <SelectValue placeholder="All suppliers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All suppliers</SelectItem>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {selected.size > 0 && (
            <div className="sticky top-2 z-10 flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-2xl bg-orange-500/10 border border-orange-500/30 backdrop-blur-md">
              <span className="text-xs font-black text-foreground pl-1">{selected.size} selected</span>
              <div className="flex flex-wrap gap-2">
                {kind === "expiry" && selectedMovable.length > 0 && (
                  <Button size="sm" variant="outline" onClick={() => moveBatches(selectedMovable)} className="h-8 rounded-xl text-xs font-bold">
                    <CalendarX className="w-3.5 h-3.5 mr-1.5" />
                    Mark {selectedMovable.length} expired
                  </Button>
                )}
                {selectedReturnable.length > 0 && (
                  <Button size="sm" onClick={() => openCreate("", selectedReturnable)} className="h-8 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold">
                    <Layers className="w-3.5 h-3.5 mr-1.5" />
                    Return {selectedReturnable.length} to supplier
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())} className="h-8 rounded-xl text-xs font-bold">
                  Clear
                </Button>
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-border/70 bg-card/60 overflow-hidden shadow-xs">
            <Table mobileCards>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead data-card="corner" className="w-10 text-center">
                    <input
                      type="checkbox"
                      aria-label="Select all"
                      checked={batches.length > 0 && selected.size === batches.length}
                      onChange={() => setSelected(selected.size === batches.length ? new Set() : new Set(batches.map((b) => b.id)))}
                      className="rounded border-border accent-orange-600 cursor-pointer w-4 h-4"
                    />
                  </TableHead>
                  <TableHead data-card="title" className="font-extrabold text-[11px] uppercase tracking-wider h-10">Product</TableHead>
                  <TableHead className="font-extrabold text-[11px] uppercase tracking-wider h-10">Batch</TableHead>
                  <TableHead className="font-extrabold text-[11px] uppercase tracking-wider h-10">Expiry</TableHead>
                  <TableHead className="font-extrabold text-[11px] uppercase tracking-wider h-10">Supplier</TableHead>
                  <TableHead className="font-extrabold text-[11px] uppercase tracking-wider h-10 text-right">{kind === "expiry" ? "Expired units" : "On shelf"}</TableHead>
                  <TableHead className="font-extrabold text-[11px] uppercase tracking-wider h-10 text-right">Returned</TableHead>
                  <TableHead className="font-extrabold text-[11px] uppercase tracking-wider h-10 text-right">Value</TableHead>
                  <TableHead className="font-extrabold text-[11px] uppercase tracking-wider h-10 text-center">Status</TableHead>
                  <TableHead data-card="actions" className="text-right font-extrabold text-[11px] uppercase tracking-wider h-10">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingBatches ? (
                  <TableRow>
                    <TableCell colSpan={10} className="py-12 text-center">
                      <Loader size="md" text="Loading stock…" />
                    </TableCell>
                  </TableRow>
                ) : batches.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="py-12 text-center text-muted-foreground">
                      <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-emerald-500 opacity-60" />
                      <p className="text-xs font-bold uppercase tracking-widest text-foreground">{K.emptyStock}</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  batches.map((b) => {
                    const units = b.returnable_units || 0;
                    const status = b.stock_status;
                    const inNote = String(status).includes("Return Note");
                    const canMark = kind === "expiry" ? status === "Expired" : status === "In Stock" || status === "Partly Returned";
                    const canRestore = (status === "Expired · In Expiry List" || status === "Marked for Return") && !inNote;
                    const canReturn = units > 0 && !inNote;
                    return (
                      <TableRow key={b.id} className={`hover:bg-muted/40 ${selected.has(b.id) ? "bg-orange-500/10" : ""}`}>
                        <TableCell className="text-center">
                          <input
                            type="checkbox"
                            aria-label={`Select ${b.product_name} ${b.batch_no}`}
                            checked={selected.has(b.id)}
                            onChange={() =>
                              setSelected((prev) => {
                                const next = new Set(prev);
                                next.has(b.id) ? next.delete(b.id) : next.add(b.id);
                                return next;
                              })
                            }
                            className="rounded border-border accent-orange-600 cursor-pointer w-4 h-4"
                          />
                        </TableCell>
                        <TableCell>
                          <span className="font-bold text-xs text-foreground">{b.product_name}</span>
                          {b.salt_composition && <p className="text-[10px] text-muted-foreground truncate max-w-[220px]">{b.salt_composition}</p>}
                        </TableCell>
                        <TableCell className="font-mono text-xs font-black text-foreground">{b.batch_no}</TableCell>
                        <TableCell className={`font-mono text-xs font-bold ${kind === "expiry" ? "text-rose-500" : "text-foreground"}`}>{formatExpiry(b.expiry_date)}</TableCell>
                        <TableCell className="text-xs font-semibold text-muted-foreground">{b.supplier_name || "—"}</TableCell>
                        <TableCell className="text-right font-mono text-xs font-bold text-foreground">{units}</TableCell>
                        <TableCell className="text-right font-mono text-xs text-muted-foreground">{b.returned_quantity || 0}</TableCell>
                        <TableCell className="text-right font-mono text-xs font-black text-foreground">{inr(units * (b.purchase_price || 0))}</TableCell>
                        <TableCell className="text-center">
                          <StockStatusBadge status={status} />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1 flex-wrap">
                            {canMark && kind === "expiry" && (
                              <Button variant="outline" size="sm" onClick={() => moveBatches([b])} className="h-8 px-2 text-[11px] font-bold border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10" title="Take these expired units off the shelf into the expiry list">
                                Mark expired
                              </Button>
                            )}
                            {canReturn && (
                              <Button size="sm" onClick={() => openCreate(b.supplier_id || "", [b])} className="h-8 px-2 text-[11px] font-bold bg-orange-600 hover:bg-orange-700 text-white" title="Create a return note for this batch">
                                Return
                              </Button>
                            )}
                            {canRestore && (
                              <Button variant="ghost" size="sm" onClick={() => restoreBatch(b)} className="h-8 px-2 text-[11px] font-bold text-muted-foreground" title={kind === "expiry" ? "Undo: put the units back on the shelf" : "Remove the return flag"}>
                                <RotateCcw className="w-3.5 h-3.5 mr-1" />
                                Undo
                              </Button>
                            )}
                            {inNote && (
                              <span className="text-[11px] font-semibold text-muted-foreground font-mono">{b[kind === "expiry" ? "expiry_bundle_no" : "return_bundle_no"]}</span>
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
        </div>
      )}

      {/* Create note */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-4xl rounded-3xl p-5 sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-black text-foreground flex items-center gap-2">
              <K.icon className="w-5 h-5 text-orange-500" />
              New {K.noteName}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              The units you add leave sellable stock as soon as you save. Deleting the note puts them back.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className={`grid grid-cols-1 gap-3 ${kind === "return" ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
              <div>
                <Label className="text-xs font-bold">Return to supplier *</Label>
                <Select value={draftSupplier} onValueChange={setDraftSupplier}>
                  <SelectTrigger className="h-10 mt-1 rounded-xl text-xs font-semibold" autoFocus>
                    <SelectValue placeholder="Choose supplier" />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {kind === "return" && (
                <div>
                  <Label className="text-xs font-bold">Reason</Label>
                  <Select value={draftReason} onValueChange={setDraftReason}>
                    <SelectTrigger className="h-10 mt-1 rounded-xl text-xs font-semibold">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["Excess Stock", "Damaged Stock", "Near Expiry Recall", "Slow Moving", "Supplier Callback", "Wrong Item Received"].map((r) => (
                        <SelectItem key={r} value={r}>{r}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <Label className="text-xs font-bold">Return date</Label>
                <Input type="date" value={draftDate} max={today()} onChange={(e) => setDraftDate(e.target.value)} className="h-10 mt-1 rounded-xl text-xs font-semibold" />
              </div>
            </div>

            {/* Batch picker */}
            <div className="p-3 rounded-2xl bg-muted/20 border border-border/70 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-black text-foreground flex items-center gap-1.5">
                  <Package className="w-4 h-4 text-orange-500" />
                  {kind === "expiry" ? "Expired stock" : "Returnable stock"}
                  {!pickerAll && draftSupplier ? ` from ${supplierById[draftSupplier]?.name || "this supplier"}` : pickerAll ? " from all suppliers" : ""}
                </p>
                <label className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground cursor-pointer">
                  <input type="checkbox" checked={pickerAll} onChange={(e) => setPickerAll(e.target.checked)} className="accent-orange-600 w-3.5 h-3.5" />
                  Show batches from all suppliers
                </label>
              </div>
              {(draftSupplier || pickerAll) && pickerBatches.length > 6 && (
                <Input value={pickerSearch} onChange={(e) => setPickerSearch(e.target.value)} placeholder="Filter batches…" className="h-8 text-xs rounded-lg bg-background" />
              )}
              {!draftSupplier && !pickerAll ? (
                <p className="text-xs text-muted-foreground py-3 text-center">Choose a supplier to see their batches.</p>
              ) : loadingPicker ? (
                <div className="py-4 text-center">
                  <Loader size="xs" text="Finding batches…" />
                </div>
              ) : pickerList.length === 0 ? (
                <p className="text-xs text-muted-foreground py-3 text-center">
                  No {kind === "expiry" ? "expired" : "returnable"} stock {pickerAll ? "" : "bought from this supplier"}.
                  {!pickerAll && " Tick “all suppliers” to pick any batch."}
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                  {pickerList.map((b) => {
                    const added = draftItems.some((it) => it.inventory_id === b.id);
                    return (
                      <button
                        type="button"
                        key={b.id}
                        onClick={() => toggleDraftBatch(b)}
                        aria-pressed={added}
                        className={`p-2.5 rounded-xl border text-left text-xs transition-colors flex items-center justify-between gap-2 ${
                          added ? "bg-orange-500/15 border-orange-500/50" : "bg-background border-border/70 hover:border-orange-500/40"
                        }`}
                      >
                        <span className="min-w-0">
                          <span className="font-bold text-foreground truncate block">{b.product_name}</span>
                          <span className="text-[10px] font-mono text-muted-foreground">
                            {b.batch_no} · Exp {formatExpiry(b.expiry_date)} · {b.returnable_units}u{pickerAll && b.supplier_name ? ` · ${b.supplier_name}` : ""}
                          </span>
                        </span>
                        <span className={`text-[10px] font-black px-1.5 py-0.5 rounded shrink-0 ${added ? "bg-orange-500 text-white" : "bg-muted text-muted-foreground"}`}>{added ? "Added" : "+ Add"}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Lines */}
            <div className="space-y-2">
              <Label className="text-xs font-bold">In this note ({draftItems.length})</Label>
              {draftItems.length === 0 ? (
                <div className="p-5 text-center border border-dashed border-border/70 rounded-2xl text-xs font-semibold text-muted-foreground">Add batches from the list above.</div>
              ) : (
                <div className="rounded-xl border border-border/70 overflow-hidden">
                  <Table mobileCards>
                    <TableHeader>
                      <TableRow className="bg-muted/40 text-[10px] uppercase">
                        <TableHead data-card="title" className="py-2">Product</TableHead>
                        <TableHead className="py-2">Batch / Expiry</TableHead>
                        <TableHead className="py-2 text-right">Units</TableHead>
                        <TableHead className="py-2 text-right">Credit rate ₹/unit</TableHead>
                        <TableHead className="py-2 text-right">Amount</TableHead>
                        <TableHead data-card="corner" className="py-2 w-8"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {draftItems.map((it) => {
                        const u = Number(it.quantity_units);
                        const bad = !Number.isInteger(u) || u <= 0 || u > it.max_units;
                        return (
                          <TableRow key={it.inventory_id} className="text-xs">
                            <TableCell className="font-bold">{it.product_name}</TableCell>
                            <TableCell className="font-mono text-[11px]">
                              {it.batch_no} · <span className={kind === "expiry" ? "text-rose-500" : ""}>{formatExpiry(it.expiry_date)}</span>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="inline-flex flex-col items-end">
                                <Input
                                  type="number"
                                  inputMode="numeric"
                                  min="1"
                                  max={it.max_units}
                                  step="1"
                                  value={it.quantity_units}
                                  onChange={(e) => setDraftField(it.inventory_id, "quantity_units", e.target.value)}
                                  aria-invalid={bad}
                                  className={`h-8 w-20 text-xs text-right font-mono font-bold ${bad ? "border-rose-500 focus-visible:ring-rose-500" : ""}`}
                                />
                                <span className={`text-[10px] mt-0.5 ${bad ? "text-rose-500" : "text-muted-foreground"}`}>of {it.max_units}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <Input
                                type="number"
                                inputMode="decimal"
                                min="0"
                                step="0.01"
                                value={it.purchase_price}
                                onChange={(e) => setDraftField(it.inventory_id, "purchase_price", e.target.value)}
                                className="h-8 w-24 text-xs text-right font-mono ml-auto"
                                title="Landing cost by default. Change it if the supplier credits a different rate."
                              />
                            </TableCell>
                            <TableCell className="text-right font-mono font-bold text-orange-500">{inr((Number(it.quantity_units) || 0) * (Number(it.purchase_price) || 0))}</TableCell>
                            <TableCell className="text-right">
                              <Button variant="ghost" size="icon" onClick={() => setDraftItems((p) => p.filter((x) => x.inventory_id !== it.inventory_id))} className="h-7 w-7 text-rose-500" aria-label={`Remove ${it.product_name}`}>
                                <X className="w-3.5 h-3.5" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
              {draftItems.length > 0 && (
                <div className="flex justify-end">
                  <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl px-4 py-2 text-right">
                    <span className="text-xs font-bold text-muted-foreground mr-2">Credit due:</span>
                    <span className="text-base font-black font-mono text-orange-500">{inr(draftTotal)}</span>
                  </div>
                </div>
              )}
            </div>

            <div>
              <Label className="text-xs font-bold">Notes</Label>
              <Textarea value={draftNotes} onChange={(e) => setDraftNotes(e.target.value)} placeholder="Pickup details, supplier reference, remarks…" className="mt-1 text-xs rounded-xl" rows={2} maxLength={1000} />
            </div>

            <label className="flex items-start gap-2.5 p-3 rounded-xl border border-border/70 cursor-pointer">
              <input type="checkbox" checked={draftHandedOver} onChange={(e) => setDraftHandedOver(e.target.checked)} className="accent-orange-600 w-4 h-4 mt-0.5" />
              <span>
                <span className="text-xs font-bold text-foreground block">Already handed over to the supplier</span>
                <span className="text-[11px] text-muted-foreground">The note starts as “handed over · credit due” and the purchase records show these items as returned.</span>
              </span>
            </label>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCreateOpen(false)} className="rounded-xl text-xs font-bold">
              Cancel
            </Button>
            <Button disabled={creating || !draftItems.length || !draftSupplier} onClick={submitCreate} className="rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs" data-shortcut="save">
              {creating ? "Saving…" : `Save note · ${inr(draftTotal)}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Note detail */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-3xl rounded-3xl p-5 sm:p-6">
          {detail && (
            <div className="space-y-4">
              <DialogHeader>
                <div className="flex items-center justify-between gap-2 flex-wrap pr-6">
                  <DialogTitle className="text-lg font-black font-mono flex items-center gap-2">
                    <K.icon className="w-5 h-5 text-orange-500" />
                    {detail.bundle_no}
                  </DialogTitle>
                  <NoteStatusBadge status={detail.status} long />
                </div>
                <DialogDescription className="text-xs text-muted-foreground">
                  {detail.supplier_name}
                  {detail.reason ? ` · ${detail.reason}` : ""} · {detail.return_date || detail.created_at?.slice(0, 10)}
                </DialogDescription>
              </DialogHeader>

              {/* Progress */}
              <ol className="flex items-center gap-1 text-[11px] font-bold overflow-x-auto">
                {[
                  ["Note created", true],
                  ["Handed over", detail.status !== DRAFT],
                  ["Credit settled", detail.status === SETTLED],
                ].map(([label, done], i) => (
                  <li key={label} className="flex items-center gap-1 shrink-0">
                    {i > 0 && <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
                    <span className={`px-2.5 py-1 rounded-full border ${done ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400" : "border-border text-muted-foreground"}`}>
                      {done ? "✓ " : ""}
                      {label}
                    </span>
                  </li>
                ))}
              </ol>

              {detail.status !== SETTLED && (
                <div className="flex flex-wrap gap-2">
                  {detail.status === DRAFT && (
                    <Button size="sm" disabled={busy} onClick={() => changeStatus(detail, PICKED, `${detail.bundle_no} handed over`)} className="h-9 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white">
                      <Truck className="w-4 h-4 mr-1.5" />
                      Mark handed over
                    </Button>
                  )}
                  <Button size="sm" onClick={() => openPayment(detail)} className="h-9 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white">
                    <CreditCard className="w-4 h-4 mr-1.5" />
                    Record credit
                  </Button>
                  {detail.status === PICKED && !(detail.payments || []).length && (
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => changeStatus(detail, DRAFT, `${detail.bundle_no} back to draft`)} className="h-9 rounded-xl text-xs font-bold">
                      Undo hand-over
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      setConfirm({
                        title: `Close ${detail.bundle_no} as settled?`,
                        body:
                          detailRemaining > 0
                            ? `${inr(detailRemaining)} is still due. It will be written off as “Marked settled”, with no money or dues adjustment recorded. Use Record credit instead if the supplier paid or gave credit.`
                            : "The note will be marked settled.",
                        label: "Close as settled",
                        action: () => changeStatus(detail, SETTLED, `${detail.bundle_no} settled`),
                      })
                    }
                    className="h-9 rounded-xl text-xs font-bold"
                  >
                    <CheckCircle2 className="w-4 h-4 mr-1.5" />
                    Close as settled
                  </Button>
                </div>
              )}

              <div className="rounded-xl border border-border/70 overflow-hidden">
                <Table mobileCards>
                  <TableHeader>
                    <TableRow className="bg-muted/40 text-[10px] uppercase">
                      <TableHead data-card="title" className="py-2">Product</TableHead>
                      <TableHead className="py-2">Batch</TableHead>
                      <TableHead className="py-2">Expiry</TableHead>
                      <TableHead className="py-2 text-right">Units</TableHead>
                      <TableHead className="py-2 text-right">Rate</TableHead>
                      <TableHead className="py-2 text-right">Amount</TableHead>
                      <TableHead className="py-2">From purchase</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(detail.items || []).map((it, i) => (
                      <TableRow key={i} className="text-xs">
                        <TableCell className="font-bold">{it.product_name}</TableCell>
                        <TableCell className="font-mono">{it.batch_no}</TableCell>
                        <TableCell className={`font-mono ${kind === "expiry" ? "text-rose-500" : ""}`}>{formatExpiry(it.expiry_date)}</TableCell>
                        <TableCell className="text-right font-mono font-bold">{it.quantity_units}</TableCell>
                        <TableCell className="text-right font-mono">{inr(it.purchase_price)}</TableCell>
                        <TableCell className="text-right font-mono font-bold text-orange-500">{inr(it.total_refund_amount)}</TableCell>
                        <TableCell className="text-[11px] text-muted-foreground">
                          {(it.purchase_refs || []).length
                            ? it.purchase_refs.map((r) => `${r.invoice_no || "Purchase"} (${r.units}u)`).join(", ")
                            : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="p-4 rounded-2xl bg-card border border-border/70 space-y-3">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2.5 rounded-xl bg-muted/40">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase">Credit value</p>
                    <p className="text-sm font-black font-mono text-foreground mt-0.5">{inr(detail.total_amount)}</p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                    <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase">Received</p>
                    <p className="text-sm font-black font-mono text-emerald-600 dark:text-emerald-400 mt-0.5">{inr(detail.amount_paid)}</p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20">
                    <p className="text-[10px] font-bold text-rose-600 dark:text-rose-400 uppercase">Still due</p>
                    <p className="text-sm font-black font-mono text-rose-600 dark:text-rose-400 mt-0.5">{inr(detailRemaining)}</p>
                  </div>
                </div>
                {(detail.payments || []).length > 0 ? (
                  <div className="space-y-1.5">
                    {detail.payments.map((p) => (
                      <div key={p.id} className="flex items-start justify-between gap-2 p-2 rounded-lg bg-muted/30 border border-border/40 text-xs">
                        <div className="min-w-0">
                          <p className="font-bold flex items-center gap-1.5">
                            {p.payment_mode === DUES_MODE ? <Wallet className="w-3.5 h-3.5 text-violet-500" /> : <CreditCard className="w-3.5 h-3.5 text-blue-500" />}
                            {p.payment_mode}
                            {p.reference_no && <span className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded">Ref {p.reference_no}</span>}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {new Date(p.payment_date).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                            {p.recorded_by?.name ? ` · ${p.recorded_by.name}` : ""}
                          </p>
                          {(p.adjusted_purchases || []).length > 0 && (
                            <p className="text-[10px] text-muted-foreground">
                              Adjusted on {p.adjusted_purchases.map((a) => `${a.invoice_no || "purchase"} ${inr(a.amount)}`).join(", ")}
                            </p>
                          )}
                          {p.notes && <p className="text-[10px] text-muted-foreground">{p.notes}</p>}
                        </div>
                        <span className="font-mono font-black text-emerald-600 dark:text-emerald-400 shrink-0">{inr(p.amount)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground text-center">No credit recorded yet.</p>
                )}
              </div>

              {detail.notes && <p className="text-xs text-muted-foreground"><span className="font-bold text-foreground">Notes:</span> {detail.notes}</p>}

              <DialogFooter className="gap-2">
                {detail.status !== SETTLED && !(detail.payments || []).length && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setConfirm({
                        title: `Delete ${detail.bundle_no}?`,
                        body: "Its units go back to stock and its purchase records are cleared.",
                        label: "Delete note",
                        destructive: true,
                        action: () => deleteNote(detail),
                      })
                    }
                    className="rounded-xl text-xs font-bold text-rose-500 hover:bg-rose-500/10 sm:mr-auto"
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                    Delete
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => openNotePdf(detail)} disabled={pdfBusy === detail.id} className="rounded-xl text-xs font-bold">
                  <Printer className="w-3.5 h-3.5 mr-1.5" />
                  Print
                </Button>
                <Button variant="outline" size="sm" onClick={() => setDetail(null)} className="rounded-xl text-xs font-bold">
                  Close
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Record credit */}
      <Dialog open={!!payFor} onOpenChange={(o) => !o && setPayFor(null)}>
        <DialogContent className="max-w-md rounded-3xl p-5 sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-black flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-blue-500" />
              Record credit
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {payFor?.bundle_no} · {payFor?.supplier_name} · {inr(payRemaining)} due
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              submitPayment();
            }}
          >
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="How the supplier settled">
              {[
                ["refund", "Refund received", "Cash, UPI, bank, cheque"],
                ["dues", "Adjust against dues", supplierOwed > 0 ? `You owe ${inr(supplierOwed)}` : "You owe them nothing"],
              ].map(([id, label, hint]) => {
                const active = id === "dues" ? payMode === DUES_MODE : payMode !== DUES_MODE;
                return (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={active}
                    key={id}
                    onClick={() => setPayMode(id === "dues" ? DUES_MODE : "Cash")}
                    className={`p-2.5 rounded-xl border text-left ${active ? "border-blue-500 bg-blue-500/10" : "border-border hover:border-blue-500/40"}`}
                  >
                    <span className="text-xs font-black text-foreground block">{label}</span>
                    <span className="text-[10px] text-muted-foreground">{hint}</span>
                  </button>
                );
              })}
            </div>
            {payMode === DUES_MODE && (
              <p className="text-[11px] text-muted-foreground p-2.5 rounded-xl bg-violet-500/5 border border-violet-500/20">
                The amount is applied to {payFor?.supplier_name}'s unpaid purchases, oldest first, and lowers what you owe them.
              </p>
            )}
            <div>
              <Label className="text-xs font-bold">Amount (₹) *</Label>
              <Input
                type="number"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                className={`h-10 mt-1 rounded-xl text-sm font-mono font-bold ${payError && payAmount ? "border-rose-500" : ""}`}
                autoFocus
              />
              {payError && payAmount !== "" && <p className="text-[11px] text-rose-500 mt-1">{payError}</p>}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {payMode !== DUES_MODE && (
                <div>
                  <Label className="text-xs font-bold">Mode</Label>
                  <Select value={payMode} onValueChange={setPayMode}>
                    <SelectTrigger className="h-10 mt-1 rounded-xl text-xs font-semibold">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["Cash", "UPI", "Bank Transfer", "Cheque", "Credit Note"].map((m) => (
                        <SelectItem key={m} value={m}>{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className={payMode === DUES_MODE ? "col-span-2" : ""}>
                <Label className="text-xs font-bold">Date & time</Label>
                <Input type="datetime-local" value={payDate} onChange={(e) => setPayDate(e.target.value)} className="h-10 mt-1 rounded-xl text-xs font-semibold" />
              </div>
            </div>
            <div>
              <Label className="text-xs font-bold">Reference</Label>
              <Input value={payRef} onChange={(e) => setPayRef(e.target.value)} placeholder="UPI ref, cheque #, credit note #" className="h-10 mt-1 rounded-xl text-xs font-mono" maxLength={100} />
            </div>
            <div>
              <Label className="text-xs font-bold">Remarks</Label>
              <Input value={payNotes} onChange={(e) => setPayNotes(e.target.value)} placeholder="Optional" className="h-10 mt-1 rounded-xl text-xs" maxLength={300} />
            </div>
            <DialogFooter className="gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => setPayFor(null)} className="rounded-xl text-xs font-bold">
                Cancel
              </Button>
              <Button type="submit" disabled={paying || !!payError} className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs" data-shortcut="save">
                {paying ? "Saving…" : payMode === DUES_MODE ? "Adjust against dues" : "Save credit"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirm?.body}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={confirm?.destructive ? "bg-rose-600 hover:bg-rose-700 text-white" : ""}
              onClick={() => {
                const action = confirm?.action;
                setConfirm(null);
                action?.();
              }}
            >
              {confirm?.label || "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
