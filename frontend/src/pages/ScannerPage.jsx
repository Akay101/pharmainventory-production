import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  FileText,
  Link2,
  Loader2,
  Package,
  PlusCircle,
  Search,
  ShoppingCart,
  Sparkles,
  Trash2,
  Truck,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { API, useAuth } from "../App";
import { compressForScan, runQueuedScan, scanErrorMessage } from "../components/scan/scanClient";
import { AiAmbient, AiMark, ConfidencePill, PhotoTray, Pill, ScanningView, useScanSteps } from "../components/scan/ScanUI";

const MODES = {
  product: { label: "Product packs", icon: Package, max: 6, hint: "Front, back and the side with batch, expiry and MRP of ONE product." },
  bill: { label: "Supplier invoice", icon: FileText, max: 10, hint: "One photo per invoice page, flat and well lit. Pages are read in parallel." },
};
const STEPS = {
  product: ["Uploading photos", "Reading the pack with AI", "Linking to your catalog"],
  bill: ["Uploading invoice", "Reading every line with AI", "Linking lines to your catalog"],
};

const todayIst = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
const num = (v) => parseFloat(v) || 0;
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

// Pick the catalog product a scanned line should be added to
function linkFromMatch(match) {
  if (!match) return { selected_product_id: "NEW", match_badge: null, inventory_suggestions: [] };
  let selected_product_id = "NEW";
  let selected_product_name = "";
  let match_badge = null;
  if (match.batch_match) {
    selected_product_id = match.batch_match.product_id;
    selected_product_name = match.batch_match.product_name;
    match_badge = { type: "batch_exact", label: "Batch in stock" };
  } else if (match.exact_name_match) {
    selected_product_id = match.exact_name_match.product_id;
    selected_product_name = match.exact_name_match.product_name;
    match_badge = { type: "name_exact", label: "In your catalog" };
  } else if (match.suggestions?.length) {
    const top = match.suggestions[0];
    if (top.is_high_confidence) {
      selected_product_id = top.product_id;
      selected_product_name = top.product_name;
    }
    match_badge = { type: "suggestion", label: top.is_high_confidence ? "Likely in catalog" : `${match.suggestions.length} similar` };
  }
  return { selected_product_id, selected_product_name, match_badge, inventory_suggestions: match.suggestions || [] };
}

function itemsFromResult(mode, result) {
  if (mode === "product") {
    const p = result.scanned_product || {};
    return [
      {
        id: uid(),
        product_name: p.product_name || "",
        manufacturer: p.manufacturer || "",
        salt_composition: p.salt_composition || "",
        pack_type: p.pack_type || "Strip",
        batch_no: p.batch_no || "",
        hsn_no: p.hsn_no || "",
        expiry_date: p.expiry_date || "",
        pack_quantity: 1,
        free_quantity: 0,
        units_per_pack: p.units_per_pack || 1,
        rate_pack: 0,
        mrp_pack: p.mrp_pack || p.mrp || 0,
        discount: 0,
        // Packs don't print GST; most medicines are 5% since Sept 2025
        gst_percent: 5,
        confidence: p.confidence,
        batch_legible: p.batch_legible,
        ...linkFromMatch(result.match),
      },
    ];
  }
  const bill = result.purchase_data || {};
  return (bill.items || []).map((it, i) => ({
    id: uid(),
    product_name: it.product_name || "",
    manufacturer: it.manufacturer || "",
    salt_composition: it.salt_composition || "",
    pack_type: it.units_per_pack > 1 ? "Strip" : /ml/i.test(it.pack || "") ? "Bottle" : "Strip",
    batch_no: it.batch_no || "",
    hsn_no: it.hsn_no || "",
    expiry_date: it.expiry_date || "",
    pack_quantity: it.quantity || 0,
    free_quantity: it.free_quantity || 0,
    units_per_pack: it.units_per_pack || 1,
    rate_pack: it.rate_pack || 0,
    mrp_pack: it.mrp || 0,
    discount: it.discount_percent || 0,
    gst_percent: it.gst_percent || 0,
    confidence: bill.confidence,
    ...linkFromMatch(result.matches?.[i]),
  }));
}

const lineTotal = (it) => num(it.pack_quantity) * num(it.rate_pack) * (1 - num(it.discount) / 100) * (1 + num(it.gst_percent) / 100);

// Which existing catalog product this line goes into (or a new one)
function CatalogLink({ item, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const isNew = !item.selected_product_id || item.selected_product_id === "NEW";
  const selected = item.inventory_suggestions.find((s) => s.product_id === item.selected_product_id);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs font-semibold transition ${
          isNew ? "border-border bg-background" : "border-emerald-500/40 bg-emerald-500/10 text-emerald-500"
        }`}
      >
        {isNew ? <PlusCircle className="h-4 w-4 text-orange-500 shrink-0" /> : item.match_badge?.type === "batch_exact" ? <Zap className="h-4 w-4 shrink-0" /> : <Link2 className="h-4 w-4 shrink-0" />}
        <span className="truncate flex-1">{isNew ? "New catalog item" : `Adds to: ${selected?.product_name || item.selected_product_name || item.product_name}`}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full rounded-xl border border-border bg-card p-1 shadow-2xl ai-pop-in">
          <button
            type="button"
            onClick={() => {
              onChange({ selected_product_id: "NEW", selected_product_name: "" });
              setOpen(false);
            }}
            className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs ${isNew ? "bg-orange-500/10 text-orange-500" : "hover:bg-muted"}`}
          >
            <PlusCircle className="h-4 w-4" />
            <span className="flex-1">Create new catalog item "{item.product_name}"</span>
            {isNew && <Check className="h-4 w-4" />}
          </button>
          {item.inventory_suggestions.length > 0 && <p className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">In your catalog</p>}
          <div className="max-h-56 overflow-y-auto">
            {item.inventory_suggestions.map((s) => {
              const active = s.product_id === item.selected_product_id;
              return (
                <button
                  key={s.product_id}
                  type="button"
                  onClick={() => {
                    onChange({ selected_product_id: s.product_id, selected_product_name: s.product_name });
                    setOpen(false);
                  }}
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs ${active ? "bg-emerald-500/10 text-emerald-500" : "hover:bg-muted"}`}
                >
                  {s.is_batch_match ? <Zap className="h-4 w-4 text-amber-500" /> : <Link2 className="h-4 w-4 text-emerald-500" />}
                  <span className="flex-1 truncate">{s.product_name}</span>
                  {s.is_batch_match && <Pill tone="amber">batch</Pill>}
                  {active && <Check className="h-4 w-4" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children, className = "" }) {
  return (
    <label className={`block ${className}`}>
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
const inputCls = "mt-0.5 h-9 w-full rounded-lg border border-border bg-background px-2.5 text-sm outline-none focus:border-orange-500";

function ItemCard({ item, index, onChange, onRemove }) {
  const [expanded, setExpanded] = useState(index === 0);
  const set = (k) => (e) => onChange({ [k]: e.target.value });
  const units = (num(item.pack_quantity) + num(item.free_quantity)) * (num(item.units_per_pack) || 1);
  const mrpUnit = num(item.units_per_pack) > 1 ? num(item.mrp_pack) / num(item.units_per_pack) : num(item.mrp_pack);
  const missing = !item.product_name || !num(item.pack_quantity) || !num(item.rate_pack) || !num(item.mrp_pack);

  return (
    <div className={`rounded-2xl border bg-card shadow-sm ai-pop-in ${missing ? "border-amber-500/40" : "border-border"}`}>
      <div className="flex items-start gap-3 p-3 sm:p-4">
        <div className="h-8 w-8 shrink-0 rounded-lg bg-muted text-xs font-bold flex items-center justify-center">{index + 1}</div>
        <div className="min-w-0 flex-1">
          <input
            value={item.product_name}
            onChange={set("product_name")}
            placeholder="Product name"
            className="w-full bg-transparent font-semibold text-sm sm:text-base outline-none border-b border-transparent focus:border-orange-500"
          />
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
            {item.match_badge && <Pill tone={item.match_badge.type === "suggestion" ? "sky" : "emerald"}>{item.match_badge.label}</Pill>}
            {item.batch_legible === false && <Pill tone="amber">check batch</Pill>}
            <ConfidencePill value={item.confidence} />
            <span>
              {num(item.pack_quantity)}
              {num(item.free_quantity) ? `+${num(item.free_quantity)}` : ""} × {item.pack_type || "pack"} of {item.units_per_pack} = {units} units
            </span>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-bold">₹{lineTotal(item).toFixed(2)}</p>
          <div className="flex justify-end gap-1 mt-1">
            <button type="button" onClick={() => setExpanded((e) => !e)} className="h-7 w-7 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground" aria-label="Edit details">
              <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
            </button>
            <button type="button" onClick={onRemove} className="h-7 w-7 rounded-lg hover:bg-destructive/10 hover:text-destructive flex items-center justify-center text-muted-foreground" aria-label="Remove">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
      <div className="px-3 pb-3 sm:px-4">
        <CatalogLink item={item} onChange={onChange} />
      </div>
      {expanded && (
        <div className="grid grid-cols-2 gap-2 border-t border-border p-3 sm:grid-cols-4 sm:p-4">
          <Field label="Batch"><input value={item.batch_no} onChange={(e) => onChange({ batch_no: e.target.value.toUpperCase() })} className={`${inputCls} font-mono`} /></Field>
          <Field label="Expiry"><input type="date" value={item.expiry_date} onChange={set("expiry_date")} className={inputCls} /></Field>
          <Field label="Qty (packs)"><input type="number" inputMode="numeric" value={item.pack_quantity} onChange={set("pack_quantity")} className={inputCls} /></Field>
          <Field label="Free (packs)"><input type="number" inputMode="numeric" value={item.free_quantity} onChange={set("free_quantity")} className={inputCls} /></Field>
          <Field label="Units / pack"><input type="number" inputMode="numeric" value={item.units_per_pack} onChange={set("units_per_pack")} className={inputCls} /></Field>
          <Field label="Pack type">
            <select value={item.pack_type} onChange={set("pack_type")} className={inputCls}>
              {["Strip", "Bottle", "Tube", "Box", "Vial", "Ampoule", "Sachet", "Jar", "Packet"].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Field>
          <Field label="Rate / pack ₹"><input type="number" inputMode="decimal" value={item.rate_pack} onChange={set("rate_pack")} className={inputCls} /></Field>
          <Field label="MRP / pack ₹"><input type="number" inputMode="decimal" value={item.mrp_pack} onChange={set("mrp_pack")} className={inputCls} /></Field>
          <Field label="Discount %"><input type="number" inputMode="decimal" value={item.discount} onChange={set("discount")} className={inputCls} /></Field>
          <Field label="GST %">
            <select value={item.gst_percent} onChange={set("gst_percent")} className={inputCls}>
              {[0, 5, 12, 18, 28].map((g) => (
                <option key={g} value={g}>{g}%</option>
              ))}
            </select>
          </Field>
          <Field label="HSN"><input value={item.hsn_no} onChange={set("hsn_no")} className={inputCls} /></Field>
          <Field label="MRP / unit"><p className="mt-0.5 h-9 flex items-center text-sm font-semibold">₹{mrpUnit.toFixed(2)}</p></Field>
          <Field label="Manufacturer" className="col-span-2"><input value={item.manufacturer} onChange={set("manufacturer")} className={inputCls} /></Field>
          <Field label="Composition" className="col-span-2"><input value={item.salt_composition} onChange={set("salt_composition")} className={inputCls} /></Field>
        </div>
      )}
    </div>
  );
}

// Supplier search against the server; the supplier read from the invoice is
// matched by GSTIN or name, or offered as a new supplier.
function SupplierPicker({ value, onChange, detected }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    const q = query.trim();
    const s = ++seq.current;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await axios.get(`${API}/suppliers`, { params: { search: q || undefined, page: 1, limit: 12 } });
        if (s === seq.current) setResults(res.data.suppliers || []);
      } catch {
        if (s === seq.current) setResults([]);
      } finally {
        if (s === seq.current) setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  // Auto-pick the supplier printed on the invoice
  useEffect(() => {
    if (!detected?.name || value) return;
    (async () => {
      try {
        const res = await axios.get(`${API}/suppliers`, { params: { search: detected.gstin || detected.name, limit: 5 } });
        const list = res.data.suppliers || [];
        const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
        const hit =
          list.find((s) => detected.gstin && norm(s.gst_no || s.gstin) === norm(detected.gstin)) ||
          list.find((s) => norm(s.name) === norm(detected.name));
        if (hit) onChange({ id: hit.id, name: hit.name });
      } catch {}
    })();
    // eslint-disable-next-line
  }, [detected?.name, detected?.gstin]);

  return (
    <div>
      {value ? (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2.5">
          <Truck className="h-4 w-4 text-emerald-500 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold truncate">{value.name}</p>
            {value.isNew && <p className="text-[11px] text-muted-foreground">New supplier, will be added{value.gst_no ? ` · GSTIN ${value.gst_no}` : ""}</p>}
          </div>
          <button type="button" onClick={() => onChange(null)} className="text-xs font-semibold text-muted-foreground hover:text-foreground">
            Change
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-background">
          <div className="flex items-center gap-2 px-3 border-b border-border">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search supplier…" className="h-10 w-full bg-transparent text-sm outline-none" />
            {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
          <div className="max-h-52 overflow-y-auto p-1">
            {detected?.name && (
              <button
                type="button"
                onClick={() => onChange({ id: null, name: detected.name, gst_no: detected.gstin || "", isNew: true })}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-muted"
              >
                <Sparkles className="h-4 w-4 text-orange-500" />
                <span className="flex-1 truncate">
                  Add "{detected.name}" <span className="text-muted-foreground">(from invoice)</span>
                </span>
              </button>
            )}
            {results.map((s) => (
              <button key={s.id} type="button" onClick={() => onChange({ id: s.id, name: s.name })} className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-muted">
                <span className="truncate">{s.name}</span>
                {s.city && <span className="text-xs text-muted-foreground">{s.city}</span>}
              </button>
            ))}
            {!loading && results.length === 0 && <p className="px-3 py-4 text-center text-xs text-muted-foreground">No suppliers found</p>}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ScannerPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [mode, setMode] = useState("product");
  const [photos, setPhotos] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [items, setItems] = useState([]);
  const [detectedSupplier, setDetectedSupplier] = useState(null);
  const [supplier, setSupplier] = useState(null);
  const [invoiceNo, setInvoiceNo] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(todayIst());
  const [paid, setPaid] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const ctrlRef = useRef(null);
  const step = useScanSteps(scanning, mode === "bill" ? [700, 3500] : [600, 2200]);

  useEffect(() => () => ctrlRef.current?.abort(), []);

  const total = useMemo(() => items.reduce((s, it) => s + lineTotal(it), 0), [items]);

  const addPhotos = async (files) => {
    const compressed = await Promise.all(files.map((f) => compressForScan(f, { maxSide: mode === "bill" ? 2200 : 1600, quality: mode === "bill" ? 0.85 : 0.82 })));
    setPhotos((p) => [...p, ...compressed.map((file) => ({ file, preview: URL.createObjectURL(file) }))]);
  };

  const scan = async () => {
    if (!photos.length) return;
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    setScanning(true);
    try {
      const job = await runQueuedScan(mode, photos.map((p) => p.file), { signal: ctrl.signal });
      const result = job.result || {};
      const newItems = itemsFromResult(mode, result);
      if (!newItems.length) {
        toast.error(mode === "bill" ? "No product lines found on this invoice" : "Couldn't find a product in these photos");
        return;
      }
      setItems((prev) => [...prev, ...newItems]);
      if (mode === "bill") {
        const b = result.purchase_data || {};
        if (b.invoice_no) setInvoiceNo(b.invoice_no);
        if (b.invoice_date) setInvoiceDate(b.invoice_date);
        if (b.supplier_name) setDetectedSupplier({ name: b.supplier_name, gstin: b.supplier_gstin });
      }
      photos.forEach((p) => URL.revokeObjectURL(p.preview));
      setPhotos([]);
      toast.success(mode === "bill" ? `Read ${newItems.length} line${newItems.length > 1 ? "s" : ""}${job.cached ? " (cached)" : ""}` : `Read ${newItems[0].product_name || "product"}`);
    } catch (err) {
      const msg = scanErrorMessage(err);
      if (msg) toast.error(msg);
    } finally {
      setScanning(false);
      ctrlRef.current = null;
    }
  };

  const createPurchase = async () => {
    if (!supplier) return toast.error("Choose a supplier");
    const bad = items.findIndex((it) => !it.product_name || num(it.pack_quantity) <= 0);
    if (bad >= 0) return toast.error(`Line ${bad + 1} needs a name and quantity`);
    setSubmitting(true);
    try {
      await axios.post(`${API}/purchases`, {
        supplier_id: supplier.id || null,
        supplier_name: supplier.name,
        ...(supplier.isNew ? { supplier_data: { name: supplier.name, gst_no: supplier.gst_no || "" } } : {}),
        invoice_no: invoiceNo || `SCAN-${Date.now()}`,
        purchase_date: invoiceDate || todayIst(),
        payment_status: paid ? "Paid" : "Unpaid",
        items: items.map((it) => {
          const unitsPerPack = parseInt(it.units_per_pack) || 1;
          const linked = it.selected_product_id && it.selected_product_id !== "NEW";
          const gst = num(it.gst_percent);
          return {
            product_id: linked ? it.selected_product_id : `scanned_${uid()}`,
            selected_product_id: linked ? it.selected_product_id : undefined,
            product_name: linked && it.selected_product_name ? it.selected_product_name : it.product_name,
            manufacturer: it.manufacturer || null,
            salt_composition: it.salt_composition || null,
            pack_type: it.pack_type || "Strip",
            batch_no: it.batch_no || null,
            hsn_no: it.hsn_no || null,
            expiry_date: it.expiry_date || null,
            pack_quantity: parseInt(it.pack_quantity) || 1,
            scheme: parseInt(it.free_quantity) || 0,
            units_per_pack: unitsPerPack,
            pack_price: num(it.rate_pack),
            mrp_per_unit: unitsPerPack > 0 ? num(it.mrp_pack) / unitsPerPack : num(it.mrp_pack),
            discount: num(it.discount),
            cgst: gst / 2,
            sgst: gst / 2,
          };
        }),
      });
      toast.success("Purchase created and stock added");
      navigate("/purchases");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Couldn't create the purchase");
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) return null;
  const M = MODES[mode];

  return (
    <div className="relative isolate min-h-screen bg-background text-foreground pb-32" data-testid="scanner-page">
      <AiAmbient />
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
          <button type="button" onClick={() => navigate("/purchases")} className="h-9 w-9 rounded-xl hover:bg-muted flex items-center justify-center" aria-label="Back">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <AiMark />
          <div className="min-w-0 flex-1">
            <h1 className="text-base font-bold leading-tight">AI purchase scanner</h1>
            <p className="text-[11px] text-muted-foreground truncate">Scan packs or a supplier invoice into a purchase</p>
          </div>
          {items.length > 0 && <Pill tone="violet">{items.length} item{items.length > 1 ? "s" : ""}</Pill>}
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-3 px-4 py-4">
        <div className="grid grid-cols-2 gap-1 rounded-2xl border border-border bg-card p-1">
          {Object.entries(MODES).map(([key, m]) => (
            <button
              key={key}
              type="button"
              disabled={scanning}
              onClick={() => {
                setMode(key);
                photos.forEach((p) => URL.revokeObjectURL(p.preview));
                setPhotos([]);
              }}
              className={`flex h-10 items-center justify-center gap-2 rounded-xl text-sm font-semibold transition ${
                mode === key ? "bg-gradient-to-r from-orange-500 to-pink-500 text-white shadow" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <m.icon className="h-4 w-4" /> {m.label}
            </button>
          ))}
        </div>

        {scanning ? (
          <ScanningView photo={photos[0]?.preview} steps={STEPS[mode]} active={step} subtitle={`${photos.length} photo${photos.length > 1 ? "s" : ""}`} />
        ) : (
          <section className="rounded-2xl border border-border bg-card p-3 sm:p-4 shadow-sm">
            <PhotoTray photos={photos} onAdd={addPhotos} onRemove={(i) => setPhotos((p) => p.filter((_, idx) => idx !== i))} max={M.max} hint={M.hint} />
            <button
              type="button"
              disabled={!photos.length}
              onClick={scan}
              className="mt-3 h-12 w-full rounded-xl bg-gradient-to-r from-orange-500 via-pink-500 to-violet-500 text-white font-semibold flex items-center justify-center gap-2 shadow-lg shadow-fuchsia-500/20 disabled:opacity-40 active:scale-[0.99]"
            >
              <Sparkles className="h-4 w-4" /> Read {photos.length ? `${photos.length} photo${photos.length > 1 ? "s" : ""} ` : ""}with AI
            </button>
          </section>
        )}

        {items.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-sm font-semibold">Review before adding</h2>
              <button type="button" onClick={() => setItems([])} className="text-xs text-muted-foreground hover:text-destructive">
                Clear all
              </button>
            </div>
            {items.map((it, i) => (
              <ItemCard
                key={it.id}
                item={it}
                index={i}
                onChange={(patch) => setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, ...patch } : x)))}
                onRemove={() => setItems((prev) => prev.filter((x) => x.id !== it.id))}
              />
            ))}
          </section>
        )}

        {!items.length && !scanning && (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 pt-2">
            {[
              ["Batch-aware", "Lines whose batch you already stock are linked to that product automatically."],
              ["Every detail", "Pack size, free qty, discount, GST and expiry come straight off the invoice."],
              ["You confirm", "Nothing is saved until you review and create the purchase."],
            ].map(([t, d]) => (
              <div key={t} className="rounded-2xl border border-border bg-card/60 p-3">
                <p className="text-xs font-semibold">{t}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{d}</p>
              </div>
            ))}
          </div>
        )}
      </main>

      {items.length > 0 && sheetOpen && (
        <div className="fixed inset-0 z-30 bg-black/50 backdrop-blur-[2px] ai-pop-in" onClick={() => !submitting && setSheetOpen(false)} />
      )}
      {items.length > 0 && (
        <div
          className={`fixed inset-x-0 bottom-0 z-40 border-t border-border pb-[env(safe-area-inset-bottom)] ${
            sheetOpen ? "bg-background rounded-t-3xl shadow-2xl" : "bg-background/90 backdrop-blur-xl"
          }`}
        >
          <div className="mx-auto max-w-2xl px-4 py-3">
            {sheetOpen && (
              <div className="mb-3 space-y-3 ai-pop-in">
                <div className="mx-auto -mt-1 mb-1 h-1 w-10 rounded-full bg-border" />
                <SupplierPicker value={supplier} onChange={setSupplier} detected={detectedSupplier} />
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Invoice no">
                    <input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} placeholder="Auto if empty" className={inputCls} />
                  </Field>
                  <Field label="Invoice date">
                    <input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className={inputCls} />
                  </Field>
                </div>
                <div className="flex h-10 rounded-xl border border-border bg-background p-1 text-xs font-semibold">
                  {[["Unpaid", false], ["Paid", true]].map(([label, v]) => (
                    <button key={label} type="button" onClick={() => setPaid(v)} className={`flex-1 rounded-lg transition ${paid === v ? "bg-orange-500 text-white" : "text-muted-foreground"}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-lg font-bold leading-tight">₹{total.toFixed(2)}</p>
                <p className="text-[11px] text-muted-foreground">incl. GST · {items.length} line{items.length > 1 ? "s" : ""}</p>
              </div>
              {sheetOpen ? (
                <button
                  type="button"
                  onClick={createPurchase}
                  disabled={submitting || !supplier}
                  className="h-11 px-4 rounded-xl bg-gradient-to-r from-orange-500 to-pink-500 text-white text-sm font-semibold flex items-center gap-2 shadow-lg shadow-orange-500/20 disabled:opacity-40"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />} Create purchase
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setSheetOpen(true)}
                  className="h-11 px-4 rounded-xl bg-gradient-to-r from-orange-500 to-pink-500 text-white text-sm font-semibold flex items-center gap-2 shadow-lg shadow-orange-500/20"
                >
                  <Truck className="h-4 w-4" /> Supplier & save
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
