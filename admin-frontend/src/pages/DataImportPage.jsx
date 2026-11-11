import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle, ArrowLeft, Check, CheckCircle2, ChevronRight, Download, FileSpreadsheet, FileText, Loader2, PackagePlus, RefreshCw, Search, Trash2, Undo2, Upload, X,
} from "lucide-react";
import { toast } from "sonner";
import { AdminAPI, apiError } from "../api";
import BottomDrawer from "../components/BottomDrawer";

const inputCls = "w-full h-9 px-3 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30";
const btn = "inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-xl text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed";
const btnPrimary = `${btn} bg-brand-500 text-white hover:bg-brand-600`;
const btnGhost = `${btn} bg-white border border-slate-200 text-slate-700 hover:bg-slate-50`;
const card = "bg-white rounded-2xl border border-slate-200/80 shadow-sm";
const inr = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const num = (n) => Number(n || 0).toLocaleString("en-IN");

const STATUS = {
  mapped: ["Choose columns", "bg-amber-100 text-amber-800"],
  checking: ["Checking", "bg-sky-100 text-sky-800"],
  ready: ["Ready to import", "bg-amber-100 text-amber-800"],
  committing: ["Importing", "bg-sky-100 text-sky-800"],
  committed: ["Imported", "bg-emerald-100 text-emerald-800"],
  undoing: ["Undoing", "bg-sky-100 text-sky-800"],
  undone: ["Undone", "bg-slate-100 text-slate-600"],
  partly_undone: ["Partly undone", "bg-slate-100 text-slate-700"],
  failed: ["Stopped", "bg-rose-100 text-rose-800"],
  failed_commit: ["Import stopped", "bg-rose-100 text-rose-800"],
};
const RUNNING = ["checking", "committing", "undoing"];
const PRODUCT_STATUS = {
  match: ["Matched", "text-emerald-700"],
  check: ["Pick one", "text-amber-700"],
  new: ["New", "text-sky-700"],
  needs_details: ["Needs details", "text-amber-700"],
  skip: ["Left out", "text-slate-500"],
};

function StatusPill({ status }) {
  const [label, cls] = STATUS[status] || [status, "bg-slate-100 text-slate-600"];
  return <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold whitespace-nowrap ${cls}`}>{label}</span>;
}

function Stat({ label, value, tone }) {
  return (
    <div className={`${card} px-4 py-3`}>
      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`text-lg font-black tabular-nums ${tone || "text-slate-900"}`}>{value}</p>
    </div>
  );
}

function Confirm({ open, title, children, action, danger, busy, onConfirm, onClose }) {
  return (
    <BottomDrawer isOpen={open} onClose={() => !busy && onClose()} title={title} maxWidth="max-w-md">
      <div className="p-5 space-y-4">
        <div className="text-sm text-slate-600 space-y-2">{children}</div>
        <div className="flex gap-2 justify-end">
          <button className={btnGhost} onClick={onClose} disabled={busy}>Cancel</button>
          <button className={danger ? `${btn} bg-rose-600 text-white hover:bg-rose-700` : btnPrimary} onClick={onConfirm} disabled={busy}>
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {action}
          </button>
        </div>
      </div>
    </BottomDrawer>
  );
}

// ---- Pharmacy picker ----------------------------------------------------------------------------

function PharmacyPicker({ onPick }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => {
      setLoading(true);
      AdminAPI.getPharmacies({ search: q, limit: 12 })
        .then((r) => setRows(r.data?.pharmacies || []))
        .catch((e) => toast.error(apiError(e, "Couldn't load pharmacies")))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <div className={`${card} p-4 space-y-3 max-w-2xl`}>
      <p className="text-sm font-bold text-slate-800">Which pharmacy is moving to DavaDesk?</p>
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
        <input className={`${inputCls} pl-9`} placeholder="Search by pharmacy name, email or phone" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      </div>
      <div className="divide-y divide-slate-100">
        {loading && <p className="text-xs text-slate-500 py-2">Searching…</p>}
        {!loading && !rows.length && <p className="text-xs text-slate-500 py-2">No pharmacies found.</p>}
        {rows.map((p) => (
          <button key={p.id} onClick={() => onPick(p)} className="w-full text-left py-2.5 px-2 rounded-lg hover:bg-slate-50 flex items-center justify-between gap-3">
            <span className="min-w-0">
              <span className="block text-sm font-bold text-slate-900 truncate">{p.name}</span>
              <span className="block text-xs text-slate-500 truncate">{[p.location, p.owner_email || p.users?.[0]?.email].filter(Boolean).join(" · ")}</span>
            </span>
            <span className="text-xs font-bold text-brand-600 shrink-0">Choose</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ---- New import ----------------------------------------------------------------------------------

function NewImport({ pharmacy, meta, onCreated }) {
  const [entity, setEntity] = useState("stock");
  const [source, setSource] = useState("marg");
  const [quantityIn, setQuantityIn] = useState("packs");
  const [includeExpired, setIncludeExpired] = useState(false);
  const [purchaseDate, setPurchaseDate] = useState("");
  const [addToStock, setAddToStock] = useState(true);
  const [file, setFile] = useState(null);
  const [percent, setPercent] = useState(null);
  const inputRef = useRef(null);
  const guide = meta?.sources?.find((s) => s.key === source)?.guides?.[entity];

  const submit = async () => {
    if (!file) return toast.error("Choose the Excel or CSV file first");
    const form = new FormData();
    form.append("entity", entity);
    form.append("source", source);
    form.append("quantity_in", quantityIn);
    form.append("include_expired", includeExpired ? "true" : "false");
    if (purchaseDate) form.append("purchase_date", purchaseDate);
    if (entity === "purchases") form.append("add_to_stock", addToStock ? "true" : "false");
    form.append("file", file);
    setPercent(0);
    try {
      const r = await AdminAPI.createImport(pharmacy.id, form, (e) => e.total && setPercent(Math.round((e.loaded / e.total) * 100)));
      if (r.data.job.same_file_as) toast.warning("This exact file was imported before. Records already in DavaDesk will be skipped.");
      setFile(null);
      onCreated(r.data.job.id);
    } catch (e) {
      toast.error(apiError(e, "Couldn't read the file"));
    } finally {
      setPercent(null);
    }
  };

  return (
    <div className={`${card} p-4 space-y-4`}>
      <p className="text-sm font-bold text-slate-800">New import</p>
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <p className="text-xs font-bold text-slate-500">What's in the file</p>
          <div className="flex flex-wrap gap-1.5">
            {(meta?.entities || []).map((e) => (
              <button key={e.key} onClick={() => setEntity(e.key)} className={`${btn} ${entity === e.key ? "bg-brand-500 text-white" : "bg-white border border-slate-200 text-slate-600"}`}>{e.label}</button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <p className="text-xs font-bold text-slate-500">Exported from</p>
          <div className="flex flex-wrap gap-1.5">
            {(meta?.sources || []).map((s) => (
              <button key={s.key} onClick={() => setSource(s.key)} className={`${btn} ${source === s.key ? "bg-brand-500 text-white" : "bg-white border border-slate-200 text-slate-600"}`}>{s.label}</button>
            ))}
          </div>
        </div>
      </div>
      {guide && <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2"><b>How to export:</b> {guide}</p>}
      {entity === "stock" && (
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-slate-700">
          <label className="flex items-center gap-2">
            Stock quantity is in
            <select className="h-8 px-2 rounded-lg border border-slate-200 bg-white" value={quantityIn} onChange={(e) => setQuantityIn(e.target.value)}>
              <option value="packs">packs (strips, bottles)</option>
              <option value="units">units (tablets)</option>
            </select>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={includeExpired} onChange={(e) => setIncludeExpired(e.target.checked)} />
            Also bring in expired batches (for returns)
          </label>
        </div>
      )}
      {entity === "purchases" && (
        <label className="flex flex-wrap items-center gap-2 text-xs text-slate-700">
          Date for bills the file doesn't date
          <input type="date" className="h-8 px-2 rounded-lg border border-slate-200 bg-white" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
          <span className="text-slate-500">Optional. You can also fill dates after reading the file.</span>
        </label>
      )}
      {entity === "purchases" && (
        <label className="flex items-center gap-2 text-xs text-slate-700">
          <input type="checkbox" checked={addToStock} onChange={(e) => setAddToStock(e.target.checked)} />
          Add the purchased quantities to stock, so they show in Inventory and in billing suggestions
          <span className="text-slate-500">(sales from the old software aren't in this file, so stock may run high)</span>
        </label>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv,.txt" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        <button className={btnGhost} onClick={() => inputRef.current?.click()} disabled={percent !== null}>
          <FileSpreadsheet className="w-4 h-4" /> {file ? "Change file" : "Choose Excel or CSV"}
        </button>
        {file && <span className="text-xs text-slate-600 truncate max-w-[16rem]">{file.name} · {(file.size / 1024).toFixed(0)} KB</span>}
        <button className={`${btnPrimary} ml-auto`} onClick={submit} disabled={!file || percent !== null}>
          {percent !== null ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          {percent !== null ? (percent < 100 ? `Uploading ${percent}%` : "Reading the file…") : "Upload and read"}
        </button>
      </div>
      <p className="text-[11px] text-slate-500">Excel (.xlsx or .xls) or CSV, up to {meta?.max_file_mb || 25} MB. Nothing is added to the pharmacy until you press Import at the end.</p>
    </div>
  );
}

// ---- Column mapping -----------------------------------------------------------------------------

function Mapping({ view, onSave, busy }) {
  const { job, fields, samples } = view;
  const [mapping, setMapping] = useState(job.mapping || {});
  useEffect(() => setMapping(job.mapping || {}), [job.id, job.mapping]);
  const used = new Map(Object.entries(mapping).map(([k, v]) => [v, k]));
  return (
    <div className={`${card} p-4 space-y-3`}>
      <div>
        <p className="text-sm font-bold text-slate-800">Match the file's columns</p>
        <p className="text-xs text-slate-500">
          {job.header_row ? `Read from sheet "${job.sheet}", headings on row ${job.header_row}` : `Read as a ${job.meta?.label || "report"}`}, {num(job.total_rows)} rows. Columns were guessed from their headings; check each one against the sample values.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
              <th className="py-2 pr-3">DavaDesk field</th>
              <th className="py-2 pr-3">Column in the file</th>
              <th className="py-2">Sample values</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {fields.map((f) => {
              const col = mapping[f.key];
              return (
                <tr key={f.key}>
                  <td className="py-2 pr-3 font-semibold text-slate-800 whitespace-nowrap">
                    {f.label}
                    {f.required && <span className="text-rose-500"> *</span>}
                  </td>
                  <td className="py-2 pr-3">
                    <select
                      className={`${inputCls} ${f.required && col === undefined ? "border-rose-300" : ""}`}
                      value={col === undefined ? "" : String(col)}
                      onChange={(e) => {
                        const next = { ...mapping };
                        if (e.target.value === "") delete next[f.key];
                        else {
                          const v = Number(e.target.value);
                          for (const [k, c] of Object.entries(next)) if (c === v) delete next[k];
                          next[f.key] = v;
                        }
                        setMapping(next);
                      }}
                    >
                      <option value="">Not in this file</option>
                      {job.headers.map((h, i) => (
                        <option key={i} value={i}>
                          {h || `Column ${i + 1}`}
                          {used.has(i) && used.get(i) !== f.key ? " (used)" : ""}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 text-xs text-slate-500 font-mono truncate max-w-[18rem]">{col === undefined ? "" : (samples[col] || []).filter(Boolean).slice(0, 3).join(" · ")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex justify-end">
        <button className={btnPrimary} onClick={() => onSave(mapping)} disabled={busy}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Check the rows
        </button>
      </div>
    </div>
  );
}

// ---- Product decisions --------------------------------------------------------------------------

function ProductCard({ p, onDecide, busy }) {
  const [details, setDetails] = useState({ manufacturer: p.details?.manufacturer || "", salt_composition: p.details?.salt_composition || "", category: p.details?.category || "medicine" });
  const [label, cls] = PRODUCT_STATUS[p.status] || [p.status, "text-slate-600"];
  const own = (p.candidates || []).filter((c) => c.source === "catalog");
  const s = p.sample;
  return (
    <div className="border border-slate-200 rounded-xl p-3 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-900">{s.product_name}</p>
          <p className="text-xs text-slate-500">
            {[s.manufacturer, `${s.units_per_pack} per pack`, s.mrp_pack ? `MRP ${inr(s.mrp_pack)}` : null, `${p.row_count} row${p.row_count === 1 ? "" : "s"}`].filter(Boolean).join(" · ")}
          </p>
        </div>
        <span className={`text-xs font-bold shrink-0 ${cls}`}>{label}</span>
      </div>
      {p.status === "match" && <p className="text-xs text-emerald-700">Uses <b>{p.matched_name}</b> ({p.reason.toLowerCase()})</p>}
      {own.length > 0 && p.status !== "match" && (
        <div className="space-y-1">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Already in this pharmacy's catalog</p>
          {own.map((c) => (
            <div key={c.product_id} className="flex items-center justify-between gap-2 text-xs bg-slate-50 rounded-lg px-2 py-1.5">
              <span className="min-w-0 truncate">
                <b>{c.product_name}</b> {[c.manufacturer, c.units_per_pack && `${c.units_per_pack}/pack`, c.mrp && `MRP ${inr(c.mrp)}`].filter(Boolean).join(" · ")} <span className="text-slate-400">{c.score}%</span>
              </span>
              <button className={`${btnGhost} h-7 shrink-0`} disabled={busy} onClick={() => onDecide(p.key, { action: "use", product_id: c.product_id })}>Use this</button>
            </div>
          ))}
        </div>
      )}
      {p.status !== "match" && (
        <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-2 items-end">
          <label className="text-[11px] font-bold text-slate-500 space-y-1">
            Manufacturer
            <input className={inputCls} value={details.manufacturer} onChange={(e) => setDetails({ ...details, manufacturer: e.target.value })} />
          </label>
          <label className="text-[11px] font-bold text-slate-500 space-y-1">
            Salt {details.category === "medicine" ? "" : "(optional)"}
            <input className={inputCls} value={details.salt_composition} onChange={(e) => setDetails({ ...details, salt_composition: e.target.value })} placeholder="e.g. Paracetamol 650mg" />
          </label>
          <label className="text-[11px] font-bold text-slate-500 flex items-center gap-1.5 h-9">
            <input type="checkbox" checked={details.category !== "medicine"} onChange={(e) => setDetails({ ...details, category: e.target.checked ? "general" : "medicine" })} />
            Not a medicine
          </label>
        </div>
      )}
      <div className="flex flex-wrap gap-2 justify-end">
        {p.status !== "skip" && <button className={`${btnGhost} h-8`} disabled={busy} onClick={() => onDecide(p.key, { action: "skip" })}>Leave out</button>}
        {p.status !== "match" && (
          <button className={`${btnPrimary} h-8`} disabled={busy} onClick={() => onDecide(p.key, { action: "new", details })}>
            <PackagePlus className="w-3.5 h-3.5" /> {p.status === "new" ? "Save details" : "Add as new product"}
          </button>
        )}
        {p.status === "match" && <button className={`${btnGhost} h-8`} disabled={busy} onClick={() => onDecide(p.key, { action: "new", details: p.details })}>Add as a new product instead</button>}
      </div>
    </div>
  );
}

function Products({ pid, view, onChanged }) {
  const [filter, setFilter] = useState("open");
  const [data, setData] = useState({ products: [], total: 0 });
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    AdminAPI.importProducts(pid, view.job.id, { status: filter === "all" ? undefined : filter, page, limit: 20 })
      .then((r) => setData(r.data))
      .catch((e) => toast.error(apiError(e, "Couldn't load products")));
  }, [pid, view.job.id, filter, page]);
  useEffect(load, [load]);
  const decide = async (key, body) => {
    setBusy(true);
    try {
      const r = await AdminAPI.decideImportProduct(pid, view.job.id, { key, ...body });
      onChanged(r.data);
      load();
    } catch (e) {
      toast.error(apiError(e, "Couldn't save that"));
    } finally {
      setBusy(false);
    }
  };
  const tabs = [["open", "Needs a decision"], ["match", "Matched"], ["new", "New"], ["skip", "Left out"], ["all", "All"]];
  const prod = view.job.counts?.products || {};
  const close = prod.check?.products || 0;
  const bulk = async (body, ok) => {
    setBusy(true);
    try {
      const r = await AdminAPI.decideAllImportProducts(pid, view.job.id, body);
      onChanged(r.data);
      load();
      toast.success(ok);
    } catch (e) {
      toast.error(apiError(e, "Couldn't save that"));
    } finally {
      setBusy(false);
    }
  };
  const openCount = (prod.needs_details?.products || 0) + close;
  return (
    <div className="space-y-3">
      {openCount > 0 && (
        <div className="flex flex-wrap items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700">
          <span className="flex-1 min-w-[12rem]">
            {prod.needs_details?.products ? `${prod.needs_details.products} new to this pharmacy` : ""}
            {prod.needs_details?.products && close ? " · " : ""}
            {close ? `${close} with a close name in the catalog (check these one by one, or add them as new)` : ""}
          </span>
          {prod.needs_details?.products > 0 && <button className={`${btnPrimary} h-8`} disabled={busy} onClick={() => bulk({ action: "new" }, "Added as new products")}>Add {prod.needs_details.products} new products</button>}
          {close > 0 && <button className={`${btnGhost} h-8`} disabled={busy} onClick={() => bulk({ action: "new", include_close: true }, "All remaining added as new")}>Add all remaining as new</button>}
        </div>
      )}
      <div className="flex gap-1 overflow-x-auto">
        {tabs.map(([id, label]) => (
          <button key={id} onClick={() => { setFilter(id); setPage(1); }} className={`${btn} h-8 whitespace-nowrap ${filter === id ? "bg-slate-900 text-white" : "bg-white border border-slate-200 text-slate-600"}`}>{label}</button>
        ))}
      </div>
      {!data.products.length && <p className="text-sm text-slate-500 py-4">{filter === "open" ? "Every product has a decision." : "Nothing here."}</p>}
      <div className="space-y-2">
        {data.products.map((p) => <ProductCard key={`${p.key}-${p.status}-${p.product_id}`} p={p} onDecide={decide} busy={busy} />)}
      </div>
      {data.total > 20 && (
        <div className="flex items-center justify-end gap-2 text-xs">
          <button className={btnGhost} disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
          <span>Page {page} of {Math.ceil(data.total / 20)}</span>
          <button className={btnGhost} disabled={page * 20 >= data.total} onClick={() => setPage(page + 1)}>Next</button>
        </div>
      )}
    </div>
  );
}

// ---- Review table -------------------------------------------------------------------------------

const PAGE = 100;
const DATE_FIELDS = new Set(["invoice_date"]);
const FIELD_HINT = { expiry_date: "MM/YY", invoice_date: "dd-mm-yyyy", batch_no: "Batch", quantity: "0", free: "0" };
const ENTITY_LABEL = { stock: "Stock with batches", products: "Product list", suppliers: "Suppliers", customers: "Customers", purchases: "Purchase history" };
const RESULT_LABEL = { created: "Imported", merged: "Added to the same batch", duplicate: "Already in DavaDesk", product_skipped: "Product left out" };

const cellKey = (rowNo, field) => `${rowNo}:${field}`;
const needsLook = (row, field) => row.bad?.includes(field) || row.missing?.includes(field);

function Cell({ row, field, readOnly, onSave, register, onNext }) {
  const initial = row.values?.[field] ?? "";
  const [v, setV] = useState(initial);
  useEffect(() => setV(initial), [initial]);
  const bad = row.bad?.includes(field);
  const missing = row.missing?.includes(field);
  const tone = bad ? "bg-rose-50 border-rose-300 text-rose-900" : missing ? "bg-amber-50 border-amber-300" : "bg-white border-transparent hover:border-slate-200";
  if (readOnly) return <span className={`block px-2 py-1 rounded-md text-xs whitespace-nowrap ${bad ? "text-rose-700" : ""}`}>{initial || <span className="text-slate-300">—</span>}</span>;
  const save = async () => {
    if (v === initial) return false;
    await onSave(row.row_no, { [field]: v });
    return true;
  };
  return (
    <input
      ref={(el) => register(cellKey(row.row_no, field), el)}
      value={v}
      type="text"
      placeholder={missing || bad ? (DATE_FIELDS.has(field) ? "dd-mm-yyyy" : FIELD_HINT[field] || "Fill in") : ""}
      onChange={(e) => setV(e.target.value)}
      onBlur={save}
      onKeyDown={async (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          await save();
          onNext(cellKey(row.row_no, field));
        } else if (e.key === "Escape") setV(initial);
      }}
      className={`w-full min-w-[6.5rem] h-8 px-2 rounded-md border text-xs focus:outline-none focus:ring-2 focus:ring-brand-500/40 ${tone}`}
      aria-label={`${field} for row ${row.row_no}`}
    />
  );
}

function ReviewTable({ pid, view, filter, setFilter, onView, readOnly }) {
  const { job, fields } = view;
  const [data, setData] = useState({ rows: [], total: 0 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const refs = useRef(new Map());
  const focusAfterLoad = useRef(null);
  const register = (k, el) => (el ? refs.current.set(k, el) : refs.current.delete(k));

  const load = useCallback(() => {
    setLoading(true);
    return AdminAPI.importRows(pid, job.id, { status: filter || undefined, page, limit: PAGE })
      .then((r) => setData(r.data))
      .catch((e) => toast.error(apiError(e, "Couldn't load rows")))
      .finally(() => setLoading(false));
  }, [pid, job.id, filter, page]);
  useEffect(() => {
    load();
  }, [load, job.counts?.rows?.ok, job.status]);

  // After a page change from "Next missing", land on that page's first missing cell
  useEffect(() => {
    if (!focusAfterLoad.current || loading) return;
    focusAfterLoad.current = null;
    const first = order()[0];
    if (first) focusCell(first);
  }, [data, loading]);

  const order = () => data.rows.flatMap((r) => fields.filter((f) => needsLook(r, f.key)).map((f) => cellKey(r.row_no, f.key)));
  const focusCell = (k) => {
    const el = refs.current.get(k);
    if (el) {
      el.scrollIntoView({ block: "center", inline: "center" });
      el.focus();
      el.select?.();
    }
  };
  const next = (fromKey) => {
    const list = order();
    const at = fromKey ? list.indexOf(fromKey) : -1;
    const target = list.find((k, i) => i > at && k !== fromKey);
    if (target) return focusCell(target);
    if (page * PAGE < data.total) {
      focusAfterLoad.current = true;
      setPage(page + 1);
    } else toast.success("No more missing fields on these rows");
  };

  const save = async (rowNo, values) => {
    try {
      const r = await AdminAPI.editImportRow(pid, job.id, rowNo, values);
      setData((d) => ({ ...d, rows: d.rows.map((x) => (x.row_no === rowNo ? r.data.row : x)) }));
      onView(r.data);
    } catch (e) {
      toast.error(apiError(e, "Couldn't save that"));
    }
  };

  const c = job.counts || {};
  const tabs = readOnly
    ? [["", "All rows"], ["error", "Not imported"]]
    : [["attention", `Needs attention (${num(c.attention || 0)})`], ["", `All rows (${num(job.total_rows)})`], ["error", `Problems (${num(c.rows?.error || 0)})`], ["skipped", `Skipped (${num(c.rows?.skipped || 0)})`]];
  const from = data.total ? (page - 1) * PAGE + 1 : 0;
  const to = Math.min(page * PAGE, data.total);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 overflow-x-auto">
          {tabs.map(([id, label]) => (
            <button key={id || "all"} onClick={() => { setFilter(id); setPage(1); }} className={`${btn} h-8 whitespace-nowrap ${filter === id ? "bg-slate-900 text-white" : "bg-white border border-slate-200 text-slate-600"}`}>{label}</button>
          ))}
        </div>
        {!readOnly && (
          <button className={`${btnPrimary} h-8 ml-auto`} onClick={() => next(document.activeElement && [...refs.current.entries()].find(([, el]) => el === document.activeElement)?.[0])} title="Or press Enter in a cell">
            Next missing <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {!readOnly && <p className="text-[11px] text-slate-500">Amber cells are empty, red cells have a problem. Type a value and press Enter to save it and jump to the next one. Esc puts the cell back.</p>}
      <div className="overflow-auto border border-slate-200 rounded-xl max-h-[65vh]">
        <table className="text-xs border-separate border-spacing-0">
          <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500 sticky top-0 z-10">
            <tr>
              <th className="px-2 py-2 sticky left-0 bg-slate-50 border-b border-slate-200">Row</th>
              {fields.map((f) => (
                <th key={f.key} className="px-2 py-2 whitespace-nowrap border-b border-slate-200">
                  {f.label}
                  {c.missing?.[f.key] ? <span className="ml-1 text-amber-600 normal-case">({num(c.missing[f.key])})</span> : null}
                </th>
              ))}
              <th className="px-2 py-2 border-b border-slate-200 min-w-[14rem]">Status</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.row_no} className="align-top">
                <td className="px-2 py-1.5 sticky left-0 bg-white border-b border-slate-100 tabular-nums text-slate-400">{r.row_no}</td>
                {fields.map((f) => (
                  <td key={f.key} className="px-1 py-1 border-b border-slate-100">
                    <Cell row={r} field={f.key} readOnly={readOnly} onSave={save} register={register} onNext={next} />
                  </td>
                ))}
                <td className="px-2 py-1.5 border-b border-slate-100">
                  {r.errors?.length ? <span className="text-rose-600">{r.errors.join("; ")}</span>
                    : r.skip ? <span className="text-slate-500">{r.skip === "expired" ? "Expired, skipped" : "No stock, skipped"}</span>
                    : r.result ? <span className={r.result === "created" ? "text-emerald-700" : "text-slate-600"}>{RESULT_LABEL[r.result] || r.result}</span>
                    : <span className="text-emerald-700">Ready</span>}
                  {r.warnings?.length > 0 && <span className="block text-amber-700">{r.warnings.join("; ")}</span>}
                </td>
              </tr>
            ))}
            {!data.rows.length && (
              <tr><td colSpan={fields.length + 2} className="px-3 py-8 text-center text-slate-500">{loading ? "Loading rows…" : filter === "attention" ? "Nothing needs attention." : "No rows here."}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
        <span className="tabular-nums">{data.total ? `Rows ${num(from)}–${num(to)} of ${num(data.total)}` : ""}</span>
        {data.total > PAGE && (
          <div className="flex items-center gap-2">
            <button className={btnGhost} disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
            <span>Page {page} of {Math.ceil(data.total / PAGE)}</span>
            <button className={btnGhost} disabled={page * PAGE >= data.total} onClick={() => setPage(page + 1)}>Next page</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Missing fields: show them, or fill them all at once ----------------------------------------

const today = () => new Date().toISOString().slice(0, 10);

function FillRow({ field, label, count, current, isDate, reportEnd, busy, onFill, onShow, canLeave, left, onLeave }) {
  const [v, setV] = useState(current || "");
  useEffect(() => setV(current || ""), [current]);
  return (
    <div className="flex flex-wrap items-center gap-2 py-2">
      <span className="text-sm font-semibold text-slate-800 min-w-[9rem]">{label}</span>
      <span className={`text-xs font-semibold min-w-[7rem] ${left ? "text-slate-500" : "text-amber-700"}`}>{left ? "Left empty" : count ? `${num(count)} rows empty` : "Filled"}</span>
      <button className={`${btnGhost} h-8`} onClick={onShow} disabled={!count}>Show them</button>
      <span className="text-xs text-slate-500">Fill every empty one with</span>
      <input type={isDate ? "date" : "text"} className="h-8 px-2 rounded-lg border border-slate-200 bg-white text-xs w-40" value={v} onChange={(e) => setV(e.target.value)} placeholder={isDate ? "" : FIELD_HINT[field] || "Value"} />
      {isDate && <button className={`${btnGhost} h-8`} disabled={busy} onClick={() => setV(today())}>Today</button>}
      {isDate && reportEnd && <button className={`${btnGhost} h-8`} disabled={busy} onClick={() => setV(reportEnd)}>Report's last day</button>}
      <button className={`${btnPrimary} h-8`} disabled={busy || !v || v === current} onClick={() => onFill(field, v)}>Fill all</button>
      {current && <button className={`${btnGhost} h-8`} disabled={busy} onClick={() => onFill(field, "")} title="Stop filling this field">Clear fill ({current})</button>}
      {canLeave && !current && (
        left ? (
          <button className={`${btnGhost} h-8`} disabled={busy} onClick={() => onLeave(field, false)} title="Show these empty cells again">Undo leave empty</button>
        ) : (
          <button className={`${btnGhost} h-8`} disabled={busy || !count} onClick={() => onLeave(field, true)} title="Import these rows with this field empty">Leave empty</button>
        )
      )}
    </div>
  );
}

// Fields a row can import without; a bill date or a required field can't be left empty
const CAN_LEAVE_EMPTY = { purchases: ["invoice_no", "batch_no", "expiry_date"], stock: ["batch_no", "expiry_date", "purchase_rate"], products: ["mrp", "manufacturer"], suppliers: ["contact"], customers: ["mobile"] };

function MissingPanel({ view, busy, onFill, onShow, onLeave }) {
  const { job, fields } = view;
  const counts = job.counts?.missing || {};
  const fills = job.fills || {};
  const left = new Set(job.leave_empty || []);
  const list = fields.filter((f) => counts[f.key] || fills[f.key] || left.has(f.key));
  if (!list.length) return null;
  return (
    <div className={`${card} p-4`}>
      <p className="text-sm font-bold text-slate-800 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-600" /> Missing in the file</p>
      <p className="text-xs text-slate-500">Fill them one by one in the table below, give one value for every empty cell, or leave them empty and import the rows as they are. Rows with a red problem (like a missing bill date) aren't imported until it's fixed.</p>
      <div className="divide-y divide-slate-100 mt-1">
        {list.map((f) => (
          <FillRow
            key={f.key}
            field={f.key}
            label={f.label}
            count={counts[f.key] || 0}
            current={fills[f.key]}
            isDate={DATE_FIELDS.has(f.key)}
            reportEnd={job.meta?.period_to}
            busy={busy}
            onFill={onFill}
            onShow={() => onShow(f.key)}
            canLeave={(CAN_LEAVE_EMPTY[job.entity] || []).includes(f.key)}
            left={left.has(f.key)}
            onLeave={onLeave}
          />
        ))}
      </div>
    </div>
  );
}

// ---- Undo, with what it will do ---------------------------------------------------------------------

const PLURAL = { purchases: "purchase bills", inventory: "stock batches", products: "products", suppliers: "suppliers", customers: "customers" };

function UndoDialog({ open, pid, job, onClose, onDone }) {
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open || !job) return;
    setPlan(null);
    AdminAPI.importUndoPreview(pid, job.id).then((r) => setPlan(r.data)).catch((e) => { toast.error(apiError(e, "Couldn't check what undo would do")); onClose(); });
  }, [open, pid, job?.id]);
  const go = async () => {
    setBusy(true);
    try {
      await AdminAPI.undoImport(pid, job.id);
      toast.success("Import undone");
      onDone();
    } catch (e) {
      toast.error(apiError(e, "Couldn't undo"));
    } finally {
      setBusy(false);
    }
  };
  const removeList = plan ? Object.entries(plan.remove).filter(([, n]) => n) : [];
  const keepList = plan ? Object.entries(plan.keep).filter(([, n]) => n) : [];
  return (
    <BottomDrawer isOpen={open} onClose={() => !busy && onClose()} title="Are you sure you want to undo this import?" subtitle={job ? `${job.file_name} · ${job.pharmacy_name || ""}` : ""} maxWidth="max-w-lg">
      <div className="p-5 space-y-4 text-sm text-slate-700">
        {!plan ? (
          <p className="flex items-center gap-2 text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> Checking what this import added…</p>
        ) : (
          <>
            <div>
              <p className="font-bold text-slate-900">This removes</p>
              {removeList.length ? (
                <ul className="list-disc pl-5 mt-1 space-y-0.5">
                  {removeList.map(([k, n]) => <li key={k}>{num(n)} {PLURAL[k]}</li>)}
                  {plan.stock_taken_back > 0 && <li>the units it added to {num(plan.stock_taken_back)} batches that already existed</li>}
                </ul>
              ) : <p className="text-slate-500">Nothing is left to remove.</p>}
            </div>
            {keepList.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                <p className="font-bold text-amber-900">Kept, because the pharmacy has used them since</p>
                <ul className="list-disc pl-5 mt-1 space-y-0.5 text-amber-900">
                  {keepList.map(([k, n]) => <li key={k}>{num(n)} {PLURAL[k]}</li>)}
                </ul>
                {plan.kept_reasons?.length > 0 && <ul className="mt-1 text-xs text-amber-800 space-y-0.5">{plan.kept_reasons.slice(0, 8).map((r) => <li key={r}>{r}</li>)}</ul>}
              </div>
            )}
            <p className="text-xs text-slate-500">Everything the pharmacy had before this import stays as it was. This can't be reversed, but the file can be imported again.</p>
          </>
        )}
        <div className="flex gap-2 justify-end">
          <button className={btnGhost} onClick={onClose} disabled={busy}>Cancel</button>
          <button className={`${btn} bg-rose-600 text-white hover:bg-rose-700`} onClick={go} disabled={busy || !plan}>
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Yes, undo it
          </button>
        </div>
      </div>
    </BottomDrawer>
  );
}

// ---- One import ---------------------------------------------------------------------------------

function Steps({ job }) {
  const step = job.status === "checking" ? (job.progress?.step === "matching" ? 2 : 1) : job.status === "committing" ? 4 : ["ready"].includes(job.status) ? 3 : job.status === "mapped" ? 1 : 5;
  const items = [
    ["Read the file", `${num(job.total_rows)} rows`],
    ["Check every row", job.progress?.step === "checking" && job.progress.total ? `${num(job.progress.done)} of ${num(job.progress.total)}` : null],
    ["Match products", job.progress?.step === "matching" && job.progress.total ? `${num(job.progress.done)} of ${num(job.progress.total)}` : null],
    ["Review and fill", null],
    ["Import", job.status === "committing" && job.progress?.total ? `${num(job.progress.done)} of ${num(job.progress.total)}` : null],
  ];
  return (
    <ol className="flex flex-wrap gap-2">
      {items.map(([label, detail], i) => {
        const done = i < step;
        const now = i === step && (RUNNING.includes(job.status) || job.status === "ready" || job.status === "mapped");
        return (
          <li key={label} className={`flex items-center gap-1.5 px-3 h-8 rounded-full text-xs font-bold ${done ? "bg-emerald-50 text-emerald-700" : now ? "bg-brand-50 text-brand-700 ring-1 ring-brand-200" : "bg-slate-50 text-slate-400"}`}>
            {done ? <Check className="w-3.5 h-3.5" /> : now && RUNNING.includes(job.status) ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <span className="w-3.5 text-center">{i + 1}</span>}
            {label}
            {detail && <span className="font-medium tabular-nums">· {detail}</span>}
          </li>
        );
      })}
    </ol>
  );
}

async function downloadReport(pid, job) {
  const t = toast.loading("Preparing the report…");
  try {
    const r = await AdminAPI.importReportPdf(pid, job.id);
    const url = URL.createObjectURL(r.data);
    const a = document.createElement("a");
    a.href = url;
    a.download = `DavaDesk import report - ${(job.pharmacy_name || "pharmacy").replace(/[^\w.\- ]/g, "_")} - ${job.file_name.replace(/\.[^.]+$/, "")}.pdf`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success("Report downloaded", { id: t });
  } catch (e) {
    toast.error("Couldn't make the report", { id: t });
  }
}

function ImportView({ pid, pharmacyName, jobId, onBack, onChanged }) {
  const [view, setView] = useState(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState("rows");
  const [filter, setFilter] = useState("attention");
  const [confirm, setConfirm] = useState(null);
  const [remap, setRemap] = useState(false);

  const load = useCallback(() => AdminAPI.getImport(pid, jobId).then((r) => setView(r.data)).catch((e) => toast.error(apiError(e, "Couldn't load the import"))), [pid, jobId]);
  useEffect(() => { load(); }, [load]);
  const running = view && RUNNING.includes(view.job.status);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(load, 1500);
    return () => clearInterval(t);
  }, [running, load]);
  const status = view?.job.status;
  useEffect(() => {
    if (status) onChanged();
    if (status && !["ready", "mapped", "checking"].includes(status)) setFilter("");
  }, [status]);

  const act = async (fn, ok) => {
    setBusy(true);
    try {
      const r = await fn();
      if (r?.data?.job) setView(r.data);
      else await load();
      if (ok) toast.success(ok);
      return r;
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  const download = async () => {
    try {
      const r = await AdminAPI.importProblemsCsv(pid, jobId);
      const url = URL.createObjectURL(r.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `problem-rows-${view.job.file_name.replace(/\.[^.]+$/, "")}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      toast.error("Couldn't download the problem rows");
    }
  };

  if (!view) return <div className="py-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>;
  const { job } = view;
  const c = job.counts || {};
  const rows = c.rows || {};
  const results = c.results || {};
  const prod = c.products || {};
  const usesProducts = ["stock", "products", "purchases"].includes(job.entity);
  const open = (prod.check?.products || 0) + (prod.needs_details?.products || 0);
  const okRows = rows.ok || 0;
  const done = ["committed", "partly_undone", "undone", "failed_commit"].includes(job.status);

  return (
    <div className="space-y-4">
      <button className="text-xs font-bold text-slate-500 hover:text-slate-800 flex items-center gap-1" onClick={onBack}><ArrowLeft className="w-3.5 h-3.5" /> All imports</button>
      <div className={`${card} p-4 space-y-3`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-base font-black text-slate-900 flex items-center gap-2 flex-wrap">
              <FileSpreadsheet className="w-4 h-4 text-brand-500" /> {job.file_name} <StatusPill status={job.status} />
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              {ENTITY_LABEL[job.entity]} for {pharmacyName} · {job.source === "marg" ? "Marg ERP" : "Other software"} · {num(job.total_rows)} rows · uploaded by {job.created_by?.email || job.created_by?.name} on {new Date(job.created_at).toLocaleString("en-IN")}
            </p>
            {job.meta?.label && <p className="text-xs text-slate-600 mt-1">Read as a {job.meta.label}{job.meta.period_from ? `, ${job.meta.period_from} to ${job.meta.period_to}` : ""}.</p>}
            {(job.meta?.warnings || []).map((w) => <p key={w} className="text-xs text-amber-700 mt-1 flex gap-1"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />{w}</p>)}
            {job.same_file_as && <p className="text-xs text-amber-700 mt-1">This exact file was imported before. Records already in DavaDesk are skipped, not added twice.</p>}
            {job.error && <p className="text-xs text-rose-600 mt-1">{job.error}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            {done && <button className={btnPrimary} onClick={() => downloadReport(pid, { ...job, pharmacy_name: pharmacyName })}><FileText className="w-4 h-4" /> Import report (PDF)</button>}
            {(done || job.status === "ready") && <button className={btnGhost} onClick={download}><Download className="w-4 h-4" /> Problem rows</button>}
            {["mapped", "ready", "failed"].includes(job.status) && <button className={btnGhost} onClick={() => setConfirm("discard")}><Trash2 className="w-4 h-4" /> Discard</button>}
            {["committed", "partly_undone", "failed_commit"].includes(job.status) && <button className={`${btn} bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100`} onClick={() => setConfirm("undo")}><Undo2 className="w-4 h-4" /> Undo import</button>}
          </div>
        </div>
        <Steps job={job} />
        {view.stale && (
          <div className="flex items-center gap-3 text-xs text-amber-800 bg-amber-50 rounded-lg px-3 py-2">
            <AlertTriangle className="w-4 h-4" /> This hasn't moved for a while (the server may have restarted).
            <button className={`${btnGhost} h-7 ml-auto`} disabled={busy} onClick={() => act(() => AdminAPI.resumeImport(pid, jobId), "Started again")}><RefreshCw className="w-3.5 h-3.5" /> Start again</button>
          </div>
        )}
      </div>

      {(["mapped", "failed"].includes(job.status) || (remap && job.status === "ready")) && (
        <>
          {view.guide && <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2"><b>How to export:</b> {view.guide}</p>}
          <Mapping view={view} busy={busy} onSave={(mapping) => act(() => AdminAPI.mapImport(pid, jobId, { mapping })).then(() => setRemap(false))} />
          {remap && <button className={btnGhost} onClick={() => setRemap(false)}>Keep the current columns</button>}
        </>
      )}

      {!remap && (job.status === "ready" || done) && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {job.status === "ready" ? (
              <>
                <Stat label="Ready to import" value={`${num(okRows)} of ${num(job.total_rows - (rows.ignored || 0))} rows`} tone="text-emerald-700" />
                <Stat label="Need attention" value={num(c.attention || 0)} tone={c.attention ? "text-amber-700" : undefined} />
                {job.entity === "purchases" && c.purchases ? <Stat label="Bills" value={`${num(c.purchases.bills)} from ${num(c.purchases.suppliers)} suppliers`} /> : <Stat label="Skipped" value={`${num(c.skipped?.expired || 0)} expired · ${num(c.skipped?.no_stock || 0)} no stock`} />}
                {usesProducts ? <Stat label="Products" value={`${num(prod.match?.products || 0)} matched · ${num(prod.new?.products || 0)} new${open ? ` · ${num(open)} to decide` : ""}`} tone={open ? "text-amber-700" : undefined} /> : <Stat label="Problems" value={num(rows.error || 0)} />}
              </>
            ) : (
              <>
                <Stat label="Added" value={num(results.created || 0)} tone="text-emerald-700" />
                <Stat label="Already in DavaDesk" value={num(results.duplicate || 0)} />
                <Stat label="Same batch, added together" value={num(results.merged || 0)} />
                <Stat label="Not imported" value={num((rows.error || 0) + (rows.skipped || 0) + (results.product_skipped || 0))} tone={(rows.error || 0) ? "text-rose-600" : undefined} />
              </>
            )}
          </div>
          {job.entity === "purchases" && c.purchases && (
            <div className={`${card} px-4 py-3 text-sm text-slate-700 flex flex-wrap gap-x-6 gap-y-1`}>
              <span>Before GST <b className="tabular-nums">{inr(c.purchases.net)}</b></span>
              <span>With GST <b className="tabular-nums">{inr(c.purchases.gross)}</b></span>
              {job.meta?.file_net_total ? <span className={Math.abs(job.meta.file_net_total - c.purchases.net) < 0.5 ? "text-emerald-700" : "text-amber-700"}>Report's grand total <b className="tabular-nums">{inr(job.meta.file_net_total)}</b></span> : null}
              <span className="text-xs text-slate-500 basis-full">
                Saved as paid purchase bills with batch and expiry.{job.options?.add_to_stock !== false ? " The quantities are added to stock, so they show in Inventory and in billing suggestions." : " Stock isn't changed."}
              </span>
            </div>
          )}
          {job.entity === "stock" && c.stock && (
            <div className={`${card} px-4 py-3 text-sm text-slate-700 flex flex-wrap gap-x-6 gap-y-1`}>
              <span><b className="tabular-nums">{num(c.stock.units)}</b> units</span>
              <span>Stock at MRP <b className="tabular-nums">{inr(c.stock.mrp_value)}</b></span>
              <span>Stock at cost <b className="tabular-nums">{inr(c.stock.cost_value)}</b></span>
            </div>
          )}
          {job.undo && (
            <p className="text-xs text-slate-600">
              Undone {new Date(job.undo.at).toLocaleString("en-IN")} by {job.undo.by?.email || job.undo.by?.name}: removed {Object.entries(job.undo.removed || {}).filter(([, v]) => v).map(([k, v]) => `${num(v)} ${PLURAL[k] || k}`).join(", ") || "nothing"}.
              {Object.values(job.undo.kept || {}).some(Boolean) && ` Kept ${Object.entries(job.undo.kept).filter(([, v]) => v).map(([k, v]) => `${num(v)} ${PLURAL[k] || k}`).join(", ")} the pharmacy had used since.`}
            </p>
          )}

          {job.status === "ready" && (
            <MissingPanel
              view={view}
              busy={busy}
              onFill={(field, value) => act(() => AdminAPI.fillImport(pid, jobId, field, value), value ? "Filling every empty cell…" : "Fill removed")}
              onShow={(field) => { setTab("rows"); setFilter(`missing:${field}`); }}
              onLeave={(field, leave) => act(() => AdminAPI.leaveImportFieldEmpty(pid, jobId, field, leave), leave ? "These rows will import with it empty" : "Showing them again")}
            />
          )}

          <div className="flex gap-1">
            <button onClick={() => setTab("rows")} className={`${btn} ${tab === "rows" || !usesProducts || done ? "bg-brand-500 text-white" : "bg-white border border-slate-200 text-slate-600"}`}>Rows</button>
            {usesProducts && job.status === "ready" && <button onClick={() => setTab("products")} className={`${btn} ${tab === "products" ? "bg-brand-500 text-white" : "bg-white border border-slate-200 text-slate-600"}`}>Products{open ? ` (${num(open)} to decide)` : ""}</button>}
          </div>
          <div className={`${card} p-4`}>
            {usesProducts && tab === "products" && job.status === "ready" ? (
              <Products pid={pid} view={view} onChanged={(v) => setView(v)} />
            ) : (
              <ReviewTable pid={pid} view={view} filter={filter} setFilter={setFilter} onView={(v) => setView(v)} readOnly={job.status !== "ready"} />
            )}
          </div>

          {job.status === "ready" && (
            <div className={`${card} p-4 flex flex-wrap items-center gap-3 sticky bottom-2 z-20`}>
              <div className="text-sm text-slate-700 min-w-0 flex-1">
                {view.blockers.length ? (
                  <span className="text-amber-700 font-semibold">{view.blockers.join(". ")}. Open Products to decide them.</span>
                ) : rows.error ? (
                  <span><b className="text-rose-600">{num(rows.error)} rows</b> still have a problem and won't be imported unless you fix them.</span>
                ) : (
                  <span>All {num(okRows)} rows are ready. Records already in DavaDesk are skipped, not added twice.</span>
                )}
              </div>
              <button className={btnGhost} onClick={() => setRemap(true)} disabled={busy}>Change columns</button>
              <button className={btnPrimary} disabled={busy || view.blockers.length > 0 || !okRows} onClick={() => setConfirm("commit")}>
                <CheckCircle2 className="w-4 h-4" /> Import {num(okRows)} rows
              </button>
            </div>
          )}
          {job.status === "failed_commit" && (
            <div className={`${card} p-4 flex items-center gap-3`}>
              <p className="text-sm text-rose-700 flex-1">The import stopped part-way. Continuing skips what's already in.</p>
              <button className={btnPrimary} disabled={busy} onClick={() => act(() => AdminAPI.commitImport(pid, jobId))}><RefreshCw className="w-4 h-4" /> Continue import</button>
            </div>
          )}
        </>
      )}

      <Confirm open={confirm === "commit"} title={`Import into ${pharmacyName}?`} action={`Import ${num(okRows)} rows`} busy={busy} onClose={() => setConfirm(null)} onConfirm={() => act(() => AdminAPI.commitImport(pid, jobId), "Import started")}>
        <p>
          {num(okRows)} rows go into this pharmacy's{" "}
          {job.entity === "stock" ? "stock and catalog" : job.entity === "purchases" ? `purchases as ${num(c.purchases?.bills || 0)} paid bills${job.options?.add_to_stock !== false ? ", with their quantities added to stock" : ""}` : job.entity}.
        </p>
        {rows.error > 0 && <p className="text-rose-600">{num(rows.error)} rows with a problem are left out.</p>}
        <p>It appears under Import history, where you can undo it.</p>
      </Confirm>
      <UndoDialog open={confirm === "undo"} pid={pid} job={{ ...job, pharmacy_name: pharmacyName }} onClose={() => setConfirm(null)} onDone={() => { setConfirm(null); load(); }} />
      <Confirm open={confirm === "discard"} title="Discard this import?" action="Discard" danger busy={busy} onClose={() => setConfirm(null)} onConfirm={() => act(() => AdminAPI.discardImport(pid, jobId), "Discarded").then(onBack)}>
        <p>The uploaded rows and your edits are thrown away. Nothing was added to the pharmacy, so nothing there changes.</p>
      </Confirm>
    </div>
  );
}

// ---- Import history (every pharmacy) --------------------------------------------------------------

function History({ pharmacyId, onOpen, refreshKey }) {
  const [jobs, setJobs] = useState(null);
  const [undo, setUndo] = useState(null);
  const load = useCallback(() => {
    AdminAPI.importHistory({ pharmacy_id: pharmacyId || undefined, limit: 100 }).then((r) => setJobs(r.data.jobs || [])).catch((e) => toast.error(apiError(e, "Couldn't load import history")));
  }, [pharmacyId]);
  useEffect(load, [load, refreshKey]);
  return (
    <div className={`${card} p-4 space-y-2`}>
      <p className="text-sm font-bold text-slate-800">Import history{pharmacyId ? "" : " (all pharmacies)"}</p>
      {jobs === null ? <p className="text-xs text-slate-500">Loading…</p> : !jobs.length ? <p className="text-xs text-slate-500">No imports yet. Suggested order: suppliers, customers, current stock with batches, then purchase history.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[760px]">
            <thead className="text-left text-[11px] uppercase tracking-wide text-slate-500">
              <tr><th className="py-2 pr-3">When</th><th className="py-2 pr-3">Pharmacy</th><th className="py-2 pr-3">What</th><th className="py-2 pr-3">File</th><th className="py-2 pr-3">Added</th><th className="py-2 pr-3">Status</th><th className="py-2 pr-3">By</th><th className="py-2" /></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {jobs.map((j) => (
                <tr key={j.id}>
                  <td className="py-2 pr-3 whitespace-nowrap tabular-nums">{new Date(j.committed_at || j.created_at).toLocaleString("en-IN")}</td>
                  <td className="py-2 pr-3 font-semibold text-slate-800">{j.pharmacy_name || j.pharmacy_id}</td>
                  <td className="py-2 pr-3">{ENTITY_LABEL[j.entity]}</td>
                  <td className="py-2 pr-3 truncate max-w-[14rem]">{j.file_name}</td>
                  <td className="py-2 pr-3 tabular-nums">{j.counts?.results?.created ? num(j.counts.results.created) : "—"}{j.entity === "purchases" && j.counts?.purchases?.bills ? ` (${num(j.counts.purchases.bills)} bills)` : ""}</td>
                  <td className="py-2 pr-3"><StatusPill status={j.status} /></td>
                  <td className="py-2 pr-3 truncate max-w-[10rem]">{j.committed_by?.email || j.created_by?.email || ""}</td>
                  <td className="py-2 text-right whitespace-nowrap">
                    <button className={`${btnGhost} h-7`} onClick={() => onOpen(j)}>Open</button>
                    {["committed", "partly_undone", "undone", "failed_commit"].includes(j.status) && (
                      <button className={`${btnGhost} h-7 ml-1`} onClick={() => downloadReport(j.pharmacy_id, j)} title="Download the import report"><FileText className="w-3.5 h-3.5" /> Report</button>
                    )}
                    {["committed", "partly_undone", "failed_commit"].includes(j.status) && (
                      <button className={`${btn} h-7 ml-1 bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100`} onClick={() => setUndo(j)}><Undo2 className="w-3.5 h-3.5" /> Undo</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <UndoDialog open={!!undo} pid={undo?.pharmacy_id} job={undo} onClose={() => setUndo(null)} onDone={() => { setUndo(null); load(); }} />
    </div>
  );
}

// ---- Page ---------------------------------------------------------------------------------------

export default function DataImportPage({ activeEnv }) {
  const [pharmacy, setPharmacy] = useState(null);
  const [meta, setMeta] = useState(null);
  const [jobId, setJobId] = useState(null);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    setPharmacy(null);
    setJobId(null);
  }, [activeEnv]);

  useEffect(() => {
    if (pharmacy && !meta) AdminAPI.importsMeta(pharmacy.id).then((r) => setMeta(r.data)).catch((e) => toast.error(apiError(e, "Imports aren't available")));
  }, [pharmacy, meta]);

  const bump = useCallback(() => setRefresh((n) => n + 1), []);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-slate-900 flex items-center gap-2"><Upload className="w-5 h-5 text-brand-500" /> Data Import</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Move a pharmacy's purchases, stock, products, suppliers and customers from Marg or any other software into DavaDesk. Working in the <b>{String(activeEnv).toUpperCase()}</b> database.
          </p>
        </div>
        {pharmacy && (
          <div className={`${card} px-3 py-2 flex items-center gap-3`}>
            <span className="text-sm"><span className="text-slate-500">Pharmacy:</span> <b>{pharmacy.name}</b></span>
            <button className="text-slate-400 hover:text-slate-700" title="Choose another pharmacy" onClick={() => { setPharmacy(null); setJobId(null); }}><X className="w-4 h-4" /></button>
          </div>
        )}
      </div>

      {!pharmacy && <PharmacyPicker onPick={setPharmacy} />}

      {pharmacy && jobId && <ImportView pid={pharmacy.id} pharmacyName={pharmacy.name} jobId={jobId} onBack={() => { setJobId(null); bump(); }} onChanged={bump} />}

      {pharmacy && !jobId && <NewImport pharmacy={pharmacy} meta={meta} onCreated={(id) => { setJobId(id); bump(); }} />}

      {!jobId && (
        <History
          pharmacyId={pharmacy?.id}
          refreshKey={refresh}
          onOpen={(j) => { setPharmacy({ id: j.pharmacy_id, name: j.pharmacy_name || j.pharmacy_id }); setJobId(j.id); }}
        />
      )}
    </div>
  );
}
