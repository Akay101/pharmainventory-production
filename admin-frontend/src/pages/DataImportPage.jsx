import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle, ArrowLeft, Check, CheckCircle2, Download, FileSpreadsheet, Loader2, PackagePlus, RefreshCw, Search, Trash2, Undo2, Upload, X,
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
const ROW_RESULT = { created: "Imported", merged: "Added to the row above", duplicate: "Already in DavaDesk", product_skipped: "Product left out" };

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
          <span className="text-slate-500">Optional. Leave blank to use the last day the report covers. Purchases are history: they don't add stock.</span>
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

function Rows({ pid, job }) {
  const [filter, setFilter] = useState(job.status === "ready" ? "error" : "");
  const [data, setData] = useState({ rows: [], total: 0 });
  const [page, setPage] = useState(1);
  useEffect(() => {
    AdminAPI.importRows(pid, job.id, { status: filter || undefined, page, limit: 50 })
      .then((r) => setData(r.data))
      .catch((e) => toast.error(apiError(e, "Couldn't load rows")));
  }, [pid, job.id, filter, page, job.status]);
  const tabs = [["error", "Problems"], ["skipped", "Skipped"], ["ok", "Good rows"], ["", "All"]];
  const show = (r) => {
    const d = r.data || {};
    if (job.entity === "stock") return [d.product_name, d.batch_no, d.expiry_date, d.units !== undefined && `${num(d.units)} units`, d.mrp_pack && `MRP ${inr(d.mrp_pack)}`];
    if (job.entity === "purchases") return [d.supplier_name, d.invoice_no && `Bill ${d.invoice_no}`, d.purchase_date, d.product_name, d.batch_no !== "NA" && d.batch_no, d.units !== undefined && `${num(d.units)} units`, d.net !== undefined && inr(d.net)];
    if (job.entity === "products") return [d.product_name, d.units_per_pack && `${d.units_per_pack}/pack`, d.manufacturer, d.mrp_pack && `MRP ${inr(d.mrp_pack)}`];
    return [d.name, d.contact || d.mobile, d.gst_no, d.address];
  };
  return (
    <div className="space-y-3">
      <div className="flex gap-1 overflow-x-auto">
        {tabs.map(([id, label]) => (
          <button key={id || "all"} onClick={() => { setFilter(id); setPage(1); }} className={`${btn} h-8 whitespace-nowrap ${filter === id ? "bg-slate-900 text-white" : "bg-white border border-slate-200 text-slate-600"}`}>{label}</button>
        ))}
      </div>
      <div className="overflow-x-auto border border-slate-200 rounded-xl">
        <table className="w-full text-xs min-w-[640px]">
          <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
            <tr><th className="px-3 py-2">Row</th><th className="px-3 py-2">Data</th><th className="px-3 py-2">Result</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.rows.map((r) => (
              <tr key={r.row_no}>
                <td className="px-3 py-2 tabular-nums text-slate-500">{r.row_no}</td>
                <td className="px-3 py-2 text-slate-800">{show(r).filter(Boolean).join(" · ") || <span className="text-slate-400">blank</span>}</td>
                <td className="px-3 py-2">
                  {r.errors?.length ? <span className="text-rose-600">{r.errors.join("; ")}</span>
                    : r.skip ? <span className="text-slate-500">{r.skip === "expired" ? "Expired" : "No stock"}</span>
                    : r.result ? <span className={r.result === "created" ? "text-emerald-700" : "text-slate-600"}>{ROW_RESULT[r.result] || r.result}</span>
                    : r.status === "ignored" ? <span className="text-slate-400">Total or blank line</span>
                    : <span className="text-slate-600">Good</span>}
                  {r.warnings?.length > 0 && <span className="block text-amber-700">{r.warnings.join("; ")}</span>}
                </td>
              </tr>
            ))}
            {!data.rows.length && <tr><td colSpan={3} className="px-3 py-6 text-center text-slate-500">No rows here.</td></tr>}
          </tbody>
        </table>
      </div>
      {data.total > 50 && (
        <div className="flex items-center justify-end gap-2 text-xs">
          <button className={btnGhost} disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
          <span>Page {page} of {Math.ceil(data.total / 50)}</span>
          <button className={btnGhost} disabled={page * 50 >= data.total} onClick={() => setPage(page + 1)}>Next</button>
        </div>
      )}
    </div>
  );
}

function DateFix({ job, busy, onApply }) {
  const [d, setD] = useState(job.options?.purchase_date || "");
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-amber-800 bg-amber-50 rounded-lg px-3 py-2">
      <AlertTriangle className="w-4 h-4 shrink-0" />
      <span className="flex-1 min-w-[14rem]">The file has no bill dates, so {num(job.counts.purchases.undated_lines)} lines are dated {job.options?.purchase_date || "nothing yet"}. For exact dates, ask for Marg's purchase register, which has them.</span>
      {job.status === "ready" && (
        <>
          <input type="date" className="h-8 px-2 rounded-lg border border-amber-200 bg-white" value={d} onChange={(e) => setD(e.target.value)} />
          <button className={`${btnGhost} h-8`} disabled={busy || !d || d === job.options?.purchase_date} onClick={() => onApply(d)}>Use this date</button>
        </>
      )}
    </div>
  );
}

// ---- One import ---------------------------------------------------------------------------------

function ImportView({ pid, jobId, onBack, onChanged }) {
  const [view, setView] = useState(null);
  const [busy, setBusy] = useState(false);
  const [section, setSection] = useState("products");
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
  useEffect(() => {
    if (view) onChanged();
    // Only when the status moves, not on every poll
  }, [view?.job.status]);

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
    } catch (e) {
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

  return (
    <div className="space-y-4">
      <button className="text-xs font-bold text-slate-500 hover:text-slate-800 flex items-center gap-1" onClick={onBack}><ArrowLeft className="w-3.5 h-3.5" /> All imports</button>
      <div className={`${card} p-4 flex flex-wrap items-start justify-between gap-3`}>
        <div className="min-w-0">
          <p className="text-base font-black text-slate-900 flex items-center gap-2 flex-wrap">
            <FileSpreadsheet className="w-4 h-4 text-brand-500" /> {job.file_name} <StatusPill status={job.status} />
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            {view.fields && ({ stock: "Stock with batches", products: "Product list", suppliers: "Suppliers", customers: "Customers", purchases: "Purchase history" })[job.entity]} · {job.source === "marg" ? "Marg ERP" : "Other software"} · {num(job.total_rows)} rows · uploaded by {job.created_by?.email || job.created_by?.name}
          </p>
          {job.meta?.label && <p className="text-xs text-slate-600 mt-1">Read as a {job.meta.label}{job.meta.period_from ? `, ${job.meta.period_from} to ${job.meta.period_to}` : ""}.</p>}
          {(job.meta?.warnings || []).map((w) => <p key={w} className="text-xs text-amber-700 mt-1 flex gap-1"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />{w}</p>)}
          {job.same_file_as && <p className="text-xs text-amber-700 mt-1">This exact file was imported before. Records already in DavaDesk will be skipped, not added twice.</p>}
          {job.error && <p className="text-xs text-rose-600 mt-1">{job.error}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {["committed", "partly_undone", "ready", "failed_commit"].includes(job.status) && <button className={btnGhost} onClick={download}><Download className="w-4 h-4" /> Problem rows</button>}
          {["mapped", "ready", "failed"].includes(job.status) && <button className={btnGhost} onClick={() => setConfirm("discard")}><Trash2 className="w-4 h-4" /> Discard</button>}
          {["committed", "partly_undone", "failed_commit"].includes(job.status) && <button className={btnGhost} onClick={() => setConfirm("undo")}><Undo2 className="w-4 h-4" /> Undo import</button>}
        </div>
      </div>

      {running && (
        <div className={`${card} p-4 space-y-2`}>
          <p className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-brand-500" />
            {job.status === "checking" ? (job.progress?.step === "matching" ? "Matching products with the catalog…" : "Checking rows…") : job.status === "committing" ? "Importing…" : "Undoing…"}
          </p>
          {job.progress?.total > 0 && (
            <>
              <div className="h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-brand-500 transition-all" style={{ width: `${Math.min(100, (job.progress.done / job.progress.total) * 100)}%` }} /></div>
              <p className="text-xs text-slate-500 tabular-nums">{num(job.progress.done)} of {num(job.progress.total)}</p>
            </>
          )}
          {view.stale && (
            <div className="flex items-center gap-3 text-xs text-amber-800 bg-amber-50 rounded-lg px-3 py-2">
              <AlertTriangle className="w-4 h-4" /> This hasn't moved for a while (the server may have restarted).
              <button className={`${btnGhost} h-7 ml-auto`} disabled={busy} onClick={() => act(() => AdminAPI.resumeImport(pid, jobId), "Started again")}><RefreshCw className="w-3.5 h-3.5" /> Start again</button>
            </div>
          )}
        </div>
      )}

      {(["mapped", "failed"].includes(job.status) || (remap && job.status === "ready")) && (
        <>
          {view.guide && <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2"><b>How to export:</b> {view.guide}</p>}
          <Mapping view={view} busy={busy} onSave={(mapping) => act(() => AdminAPI.mapImport(pid, jobId, { mapping })).then(() => setRemap(false))} />
          {remap && <button className={btnGhost} onClick={() => setRemap(false)}>Keep the current columns</button>}
        </>
      )}

      {!remap && ["ready", "committed", "partly_undone", "undone", "failed_commit"].includes(job.status) && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {job.status === "ready" ? (
              <>
                <Stat label="Rows to import" value={num(okRows)} tone="text-emerald-700" />
                <Stat label="Problem rows" value={num(rows.error || 0)} tone={rows.error ? "text-rose-600" : undefined} />
                {job.entity === "purchases" && c.purchases ? (
                  <Stat label="Bills" value={`${num(c.purchases.bills)} from ${num(c.purchases.suppliers)} suppliers`} />
                ) : (
                  <Stat label="Skipped" value={`${num(c.skipped?.expired || 0)} expired · ${num(c.skipped?.no_stock || 0)} no stock`} />
                )}
                {usesProducts ? <Stat label="Products" value={`${num(prod.match?.products || 0)} matched · ${num(prod.new?.products || 0)} new${open ? ` · ${num(open)} to decide` : ""}`} tone={open ? "text-amber-700" : undefined} /> : <Stat label="Total rows" value={num(job.total_rows)} />}
              </>
            ) : (
              <>
                <Stat label="Added" value={num(results.created || 0)} tone="text-emerald-700" />
                <Stat label="Already in DavaDesk" value={num(results.duplicate || 0)} />
                <Stat label="Merged into one batch" value={num(results.merged || 0)} />
                <Stat label="Not imported" value={num((rows.error || 0) + (rows.skipped || 0) + (results.product_skipped || 0))} tone={(rows.error || 0) ? "text-rose-600" : undefined} />
              </>
            )}
          </div>
          {job.entity === "purchases" && c.purchases && (
            <div className={`${card} px-4 py-3 text-sm text-slate-700 space-y-2`}>
              <div className="flex flex-wrap gap-x-6 gap-y-1">
                <span>Before GST <b className="tabular-nums">{inr(c.purchases.net)}</b></span>
                <span>With GST <b className="tabular-nums">{inr(c.purchases.gross)}</b></span>
                {job.meta?.file_net_total ? <span className={Math.abs(job.meta.file_net_total - c.purchases.net) < 0.5 ? "text-emerald-700" : "text-amber-700"}>Report's grand total <b className="tabular-nums">{inr(job.meta.file_net_total)}</b></span> : null}
              </div>
              <p className="text-xs text-slate-500">Imported as paid purchase records with their batches and expiry. They're history: stock isn't added (import the current stock separately).</p>
              {c.purchases.undated_lines > 0 && <DateFix job={job} busy={busy} onApply={(d) => act(() => AdminAPI.mapImport(pid, jobId, { mapping: job.mapping, options: { purchase_date: d } }), "Date updated")} />}
            </div>
          )}
          {job.entity === "stock" && c.stock && (
            <div className={`${card} px-4 py-3 text-sm text-slate-700 flex flex-wrap gap-x-6 gap-y-1`}>
              <span><b className="tabular-nums">{num(c.stock.units)}</b> units</span>
              <span>Stock at MRP <b className="tabular-nums">{inr(c.stock.mrp_value)}</b></span>
              <span>Stock at cost <b className="tabular-nums">{inr(c.stock.cost_value)}</b></span>
              <span className="text-xs text-slate-500 self-center">Compare these with the closing stock report in the old software before importing.</span>
            </div>
          )}
          {job.undo && (
            <p className="text-xs text-slate-600">
              Undone {new Date(job.undo.at).toLocaleString("en-IN")}: removed {Object.entries(job.undo.removed || {}).map(([k, v]) => `${v} ${k}`).join(", ") || "nothing"}.
              {Object.values(job.undo.kept || {}).some(Boolean) && ` Kept ${Object.entries(job.undo.kept).filter(([, v]) => v).map(([k, v]) => `${v} ${k}`).join(", ")} because they're already used in bills or purchases.`}
            </p>
          )}
          <div className="flex gap-1">
            {usesProducts && job.status === "ready" && <button onClick={() => setSection("products")} className={`${btn} ${section === "products" ? "bg-brand-500 text-white" : "bg-white border border-slate-200 text-slate-600"}`}>Products{open && job.status === "ready" ? ` (${open} to decide)` : ""}</button>}
            <button onClick={() => setSection("rows")} className={`${btn} ${section === "rows" || !usesProducts || job.status !== "ready" ? "bg-brand-500 text-white" : "bg-white border border-slate-200 text-slate-600"}`}>Rows</button>
          </div>
          <div className={`${card} p-4`}>
            {usesProducts && section === "products" && job.status === "ready" ? (
              <Products pid={pid} view={view} onChanged={(v) => setView(v)} />
            ) : (
              <Rows pid={pid} job={job} />
            )}
          </div>
          {job.status === "ready" && (
            <div className={`${card} p-4 flex flex-wrap items-center gap-3`}>
              <div className="text-sm text-slate-700 min-w-0 flex-1">
                {view.blockers.length ? <span className="text-amber-700 font-semibold">{view.blockers.join(". ")}.</span> : <span>Ready. Records already in DavaDesk will be skipped, not added twice.</span>}
              </div>
              <button className={btnGhost} onClick={() => setRemap(true)} disabled={busy}>Change columns</button>
              <button className={btnPrimary} disabled={busy || view.blockers.length > 0 || !okRows} onClick={() => setConfirm("commit")}>
                <CheckCircle2 className="w-4 h-4" /> Import {num(okRows)} rows
              </button>
            </div>
          )}
          {job.status === "failed_commit" && (
            <div className={`${card} p-4 flex items-center gap-3`}>
              <p className="text-sm text-rose-700 flex-1">The import stopped part-way. Starting again skips what's already in.</p>
              <button className={btnPrimary} disabled={busy} onClick={() => act(() => AdminAPI.commitImport(pid, jobId))}><RefreshCw className="w-4 h-4" /> Continue import</button>
            </div>
          )}
        </>
      )}

      <Confirm open={confirm === "commit"} title="Import into the pharmacy?" action={`Import ${num(okRows)} rows`} busy={busy} onClose={() => setConfirm(null)} onConfirm={() => act(() => AdminAPI.commitImport(pid, jobId), "Import started")}>
        <p>{num(okRows)} rows will be added to this pharmacy's {job.entity === "stock" ? "stock and catalog" : job.entity === "purchases" ? `purchases (${num(c.purchases?.bills || 0)} bills, as paid history without adding stock)` : job.entity}. Anything already in DavaDesk is skipped.</p>
        <p>You can undo this import later, as long as the records haven't been used in bills or purchases.</p>
      </Confirm>
      <Confirm open={confirm === "undo"} title="Undo this import?" action="Undo import" danger busy={busy} onClose={() => setConfirm(null)} onConfirm={() => act(() => AdminAPI.undoImport(pid, jobId), "Import undone")}>
        <p>Everything this import added is removed, except stock that has been sold, and products, suppliers or customers already used in bills or purchases. Those are kept and listed.</p>
      </Confirm>
      <Confirm open={confirm === "discard"} title="Discard this import?" action="Discard" danger busy={busy} onClose={() => setConfirm(null)} onConfirm={() => act(() => AdminAPI.discardImport(pid, jobId), "Discarded").then(onBack)}>
        <p>The uploaded rows and your choices are thrown away. Nothing was added to the pharmacy, so nothing there changes.</p>
      </Confirm>
    </div>
  );
}

// ---- Page ---------------------------------------------------------------------------------------

export default function DataImportPage({ activeEnv }) {
  const [pharmacy, setPharmacy] = useState(null);
  const [meta, setMeta] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [jobId, setJobId] = useState(null);

  useEffect(() => {
    setPharmacy(null);
    setJobId(null);
  }, [activeEnv]);

  const loadJobs = useCallback(() => {
    if (!pharmacy) return;
    AdminAPI.listImports(pharmacy.id).then((r) => setJobs(r.data.jobs || [])).catch((e) => toast.error(apiError(e, "Couldn't load imports")));
  }, [pharmacy]);

  useEffect(() => {
    if (!pharmacy) return;
    loadJobs();
    if (!meta) AdminAPI.importsMeta(pharmacy.id).then((r) => setMeta(r.data)).catch((e) => toast.error(apiError(e, "Imports aren't available")));
  }, [pharmacy, loadJobs, meta]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-slate-900 flex items-center gap-2"><Upload className="w-5 h-5 text-brand-500" /> Data Import</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Move a pharmacy's stock, products, suppliers and customers from Marg or any other software into DavaDesk. Working in the <b>{String(activeEnv).toUpperCase()}</b> database.
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

      {pharmacy && jobId && <ImportView pid={pharmacy.id} jobId={jobId} onBack={() => { setJobId(null); loadJobs(); }} onChanged={loadJobs} />}

      {pharmacy && !jobId && (
        <>
          <NewImport pharmacy={pharmacy} meta={meta} onCreated={(id) => { setJobId(id); loadJobs(); }} />
          <div className={`${card} p-4 space-y-2`}>
            <p className="text-sm font-bold text-slate-800">Imports for {pharmacy.name}</p>
            {!jobs.length && <p className="text-xs text-slate-500">None yet. Suggested order: suppliers, customers, current stock with batches, then purchase history.</p>}
            <div className="divide-y divide-slate-100">
              {jobs.map((j) => (
                <button key={j.id} onClick={() => setJobId(j.id)} className="w-full text-left py-2.5 px-2 rounded-lg hover:bg-slate-50 flex items-center justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-slate-900 truncate">{j.file_name}</span>
                    <span className="block text-xs text-slate-500">
                      {({ stock: "Stock", products: "Products", suppliers: "Suppliers", customers: "Customers", purchases: "Purchase history" })[j.entity]} · {num(j.total_rows)} rows · {new Date(j.created_at).toLocaleString("en-IN")}
                      {j.counts?.results?.created ? ` · ${num(j.counts.results.created)} added` : ""}
                    </span>
                  </span>
                  <StatusPill status={j.status} />
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
