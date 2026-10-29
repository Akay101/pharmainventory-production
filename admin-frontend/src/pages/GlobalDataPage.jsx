import React, { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, Database, Loader2, Pencil, Plus, RefreshCw, Search, Store, X } from "lucide-react";
import { toast } from "sonner";
import { AdminAPI, apiError } from "../api";
import BottomDrawer from "../components/BottomDrawer";

const inputCls = "w-full h-9 px-3 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30";

// Catalogues: API kind, review-queue kind, labels and the editable fields
const KINDS = {
  medicines: {
    queue: "medicine",
    label: "Medicines",
    one: "medicine",
    name: "product_name",
    code: "product_code",
    sub: (r) => [r.manufacturer, r.packaging_label, r.mrp ? `MRP ₹${r.mrp}` : null].filter(Boolean).join(" · "),
    fields: [
      ["product_name", "Name", "text", true],
      ["manufacturer", "Manufacturer"],
      ["active_ingredients", "Salt / composition"],
      ["dosage_form", "Dosage form (tablet, syrup…)"],
      ["packaging_label", "Pack label (e.g. strip of 10 tablets)"],
      ["package_details", "Package details"],
      ["units_per_pack", "Units per pack", "int"],
      ["mrp", "MRP (pack) ₹", "number"],
      ["trade_price", "Trade price ₹", "number"],
      ["tax_rate", "GST %", "number"],
      ["hsn_code", "HSN code"],
      ["product_category", "Category (drug, otc…)"],
      ["prescription_required", "Prescription required", "bool"],
      ["is_discontinued", "Discontinued", "bool"],
    ],
  },
  doctors: {
    queue: "doctor",
    label: "Doctors",
    one: "doctor",
    name: "full_name",
    code: "practitioner_code",
    sub: (r) => [r.clinic_hospital, r.medical_registration_no && `Reg ${r.medical_registration_no}`, r.city, r.state].filter(Boolean).join(" · "),
    fields: [
      ["full_name", "Full name (e.g. Dr. A. Sharma)", "text", true],
      ["clinic_hospital", "Clinic / hospital"],
      ["medical_registration_no", "Registration no."],
      ["locality", "Locality"],
      ["city", "City"],
      ["state", "State"],
    ],
  },
  distributors: {
    queue: "distributor",
    label: "Distributors",
    one: "distributor",
    name: "agency_name",
    code: "supplier_code",
    sub: (r) => [r.gst_number, r.contact_number, r.city, r.state].filter(Boolean).join(" · "),
    fields: [
      ["agency_name", "Agency name", "text", true],
      ["contact_person", "Contact person"],
      ["contact_number", "Phone"],
      ["gst_number", "GSTIN"],
      ["locality", "Locality"],
      ["city", "City"],
      ["state", "State"],
    ],
  },
};
const KIND_BY_QUEUE = Object.fromEntries(Object.entries(KINDS).map(([k, v]) => [v.queue, k]));

function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

// Search box over one global catalogue with a results dropdown.
// onPick(record) for the chosen row; `actionLabel` names what picking does.
function GlobalSearchDropdown({ kind, initial = "", onPick, actionLabel = "Select", autoFocus }) {
  const k = KINDS[kind];
  const [q, setQ] = useState(initial);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(!!initial);
  const [active, setActive] = useState(0);
  const dq = useDebounced(q);
  const box = useRef(null);

  useEffect(() => {
    let live = true;
    if (!dq.trim()) {
      setRows([]);
      return;
    }
    setLoading(true);
    AdminAPI.searchGlobal(kind, { q: dq, limit: 15 })
      .then((r) => live && (setRows(r.data.rows), setActive(0)))
      .catch((err) => live && toast.error(apiError(err, "Search failed")))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [dq, kind]);

  useEffect(() => {
    const away = (e) => box.current && !box.current.contains(e.target) && setOpen(false);
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, []);

  const onKey = (e) => {
    if (!rows.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(rows.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter" && open) {
      e.preventDefault();
      onPick(rows[active]);
      setOpen(false);
    } else if (e.key === "Escape") setOpen(false);
  };

  return (
    <div className="relative" ref={box}>
      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
      <input
        className={`${inputCls} pl-9`}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKey}
        placeholder={`Search ${k.label.toLowerCase()} by name or ${k.code.split("_")[1]}…`}
        autoFocus={autoFocus}
        role="combobox"
        aria-expanded={open}
      />
      {loading && <Loader2 className="w-4 h-4 animate-spin text-slate-400 absolute right-3 top-2.5" />}
      {open && dq.trim() && (
        <div className="absolute z-20 mt-1 w-full max-h-72 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-xl" role="listbox">
          {!loading && rows.length === 0 && <div className="p-3 text-xs text-slate-400">No match in the global {k.label.toLowerCase()}.</div>}
          {rows.map((r, i) => (
            <button
              type="button"
              key={r._id}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onClick={() => {
                onPick(r);
                setOpen(false);
              }}
              className={`w-full text-left px-3 py-2 flex items-start justify-between gap-3 ${i === active ? "bg-slate-50" : ""}`}
            >
              <div className="min-w-0">
                <div className="text-xs font-bold text-slate-900 truncate">{r[k.name]}</div>
                <div className="text-[11px] text-slate-500 truncate">{k.sub(r) || "—"}</div>
              </div>
              <span className="shrink-0 text-[10px] font-mono text-slate-400 flex items-center gap-1">
                {r[k.code]} <span className="text-brand-600 font-sans font-bold">{actionLabel}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Form for one record; values as strings, converted on submit
function RecordForm({ kind, initial, submitLabel, onSubmit, busy, hint }) {
  const k = KINDS[kind];
  const [v, setV] = useState(() =>
    Object.fromEntries(k.fields.map(([f, , type]) => [f, type === "bool" ? !!initial?.[f] : initial?.[f] === undefined || initial?.[f] === null ? "" : String(initial[f])]))
  );
  const set = (f, x) => setV((s) => ({ ...s, [f]: x }));
  const build = () => {
    const out = {};
    for (const [f, , type] of k.fields) {
      const x = v[f];
      if (type === "bool") out[f] = !!x;
      else if (type === "int" || type === "number") {
        if (String(x).trim() !== "") out[f] = type === "int" ? parseInt(x, 10) : Number(x);
      } else out[f] = String(x).trim();
    }
    return out;
  };
  const missing = k.fields.some(([f, , , req]) => req && String(v[f]).trim().length < 2);
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!missing) onSubmit(build());
      }}
    >
      {hint}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {k.fields.map(([f, label, type, req]) =>
          type === "bool" ? (
            <label key={f} className="flex items-center gap-2 text-xs font-semibold text-slate-700 sm:col-span-1">
              <input type="checkbox" checked={!!v[f]} onChange={(e) => set(f, e.target.checked)} /> {label}
            </label>
          ) : (
            <label key={f} className={`block ${req ? "sm:col-span-2" : ""}`}>
              <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                {label}
                {req && " *"}
              </span>
              <input
                className={`${inputCls} mt-1`}
                type={type === "int" || type === "number" ? "number" : "text"}
                step={type === "number" ? "any" : undefined}
                min={type === "int" || type === "number" ? 0 : undefined}
                value={v[f]}
                onChange={(e) => set(f, e.target.value)}
              />
            </label>
          )
        )}
      </div>
      <button
        type="submit"
        disabled={busy || missing}
        className="w-full h-10 rounded-xl text-sm font-extrabold text-white bg-brand-500 hover:bg-brand-600 disabled:opacity-40 flex items-center justify-center gap-2"
      >
        {busy && <Loader2 className="w-4 h-4 animate-spin" />} {submitLabel}
      </button>
    </form>
  );
}

// Save with a duplicate check; a 409 asks before adding anyway
async function saveWithDupCheck(call, data, setDup) {
  try {
    return await call({ ...data });
  } catch (err) {
    if (err?.response?.status === 409 && err.response.data?.code === "DUPLICATE") {
      setDup({ existing: err.response.data.existing, data });
      return null;
    }
    throw err;
  }
}

function DuplicateNotice({ kind, dup, onForce, onCancel, busy }) {
  const k = KINDS[kind];
  return (
    <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs space-y-2">
      <div className="font-bold text-amber-800">Looks like this is already in the catalogue:</div>
      <div className="font-semibold text-slate-800">
        {dup.existing[k.name]} <span className="font-mono text-slate-500">{dup.existing[k.code]}</span>
        <div className="text-slate-500 font-normal">{k.sub(dup.existing)}</div>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 font-bold">
          Go back
        </button>
        <button type="button" onClick={onForce} disabled={busy} className="px-3 py-1.5 rounded-lg bg-amber-600 text-white font-bold disabled:opacity-50">
          It's different, add anyway
        </button>
      </div>
    </div>
  );
}

function EditDrawer({ kind, record, onClose, onSaved }) {
  const k = KINDS[kind];
  const [busy, setBusy] = useState(false);
  const [dup, setDup] = useState(null);
  const isNew = !record?._id;
  const run = async (data, force = false) => {
    setBusy(true);
    try {
      const r = isNew
        ? await saveWithDupCheck((d) => AdminAPI.createGlobal(kind, { ...d, ...(force ? { force: true } : {}) }), data, setDup)
        : await AdminAPI.updateGlobal(kind, record._id, data);
      if (!r) return;
      toast.success(isNew ? `Added ${r.data.record[k.code]}` : "Saved");
      onSaved(r.data.record);
    } catch (err) {
      toast.error(apiError(err, "Couldn't save"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <BottomDrawer isOpen onClose={onClose} title={isNew ? `Add ${k.one}` : `Edit ${k.one}`} subtitle={isNew ? "Goes into the global catalogue every pharmacy searches" : record[k.code]} maxWidth="max-w-2xl">
      {dup ? (
        <DuplicateNotice kind={kind} dup={dup} busy={busy} onCancel={() => setDup(null)} onForce={() => (setDup(null), run(dup.data, true))} />
      ) : (
        <RecordForm kind={kind} initial={record} submitLabel={isNew ? "Add to catalogue" : "Save changes"} onSubmit={(d) => run(d)} busy={busy} />
      )}
    </BottomDrawer>
  );
}

function CatalogueTab({ kind }) {
  const k = KINDS[kind];
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const [rows, setRows] = useState(null);
  const [edit, setEdit] = useState(null);

  const load = useCallback(() => {
    setRows(null);
    AdminAPI.searchGlobal(kind, { q: dq, limit: 50 })
      .then((r) => setRows(r.data.rows))
      .catch((err) => {
        setRows([]);
        toast.error(apiError(err, "Search failed"));
      });
  }, [kind, dq]);
  useEffect(load, [load]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input className={`${inputCls} pl-9`} value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${k.label.toLowerCase()} by name, code${kind === "distributors" ? ", GSTIN" : ""}…`} />
        </div>
        <button onClick={() => setEdit({})} className="h-9 px-3 rounded-xl text-xs font-bold text-white bg-brand-500 hover:bg-brand-600 flex items-center gap-1">
          <Plus className="w-4 h-4" /> Add {k.one}
        </button>
      </div>
      {!dq.trim() && <p className="text-[11px] text-slate-400">Showing the most recently added. Type to search.</p>}
      <div className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100">
        {rows === null ? (
          <div className="py-10 flex justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
          </div>
        ) : rows.length === 0 ? (
          <p className="p-4 text-xs text-slate-400">Nothing found.</p>
        ) : (
          rows.map((r) => (
            <div key={r._id} className="px-4 py-2.5 flex items-center justify-between gap-3 text-xs">
              <div className="min-w-0">
                <div className="font-bold text-slate-900 truncate">
                  {r[k.name]}
                  {r.source === "admin" && <span className="ml-1.5 px-1.5 py-0.5 rounded bg-violet-50 text-violet-700 text-[9px] font-black">ADDED BY ADMIN</span>}
                </div>
                <div className="text-slate-500 truncate">{k.sub(r) || "—"}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="font-mono text-[10px] text-slate-400">{r[k.code]}</span>
                <button onClick={() => setEdit(r)} title="Edit" className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
      {edit && (
        <EditDrawer
          kind={kind}
          record={edit}
          onClose={() => setEdit(null)}
          onSaved={() => {
            setEdit(null);
            load();
          }}
        />
      )}
    </div>
  );
}

// One review-queue entry: check by hand, then dismiss as duplicate or add
function ReviewDrawer({ entry, onClose, onDone }) {
  const kind = KIND_BY_QUEUE[entry.kind];
  const k = KINDS[kind];
  const [picked, setPicked] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dup, setDup] = useState(null);
  const initial = { ...entry.details, [k.name]: entry.name };

  const dismiss = async (duplicateOf) => {
    setBusy(true);
    try {
      await AdminAPI.dismissReview(entry.id, {
        reason: duplicateOf ? "Duplicate" : "Not needed",
        duplicate_of: duplicateOf ? { code: duplicateOf[k.code], name: duplicateOf[k.name] } : null,
      });
      toast.success("Dismissed");
      onDone();
    } catch (err) {
      toast.error(apiError(err, "Couldn't dismiss"));
    } finally {
      setBusy(false);
    }
  };
  const add = async (data, force = false) => {
    setBusy(true);
    try {
      const r = await saveWithDupCheck((d) => AdminAPI.addReview(entry.id, { ...d, ...(force ? { force: true } : {}) }), data, setDup);
      if (!r) return;
      toast.success(`Added ${r.data.record[k.code]} to global ${k.label.toLowerCase()}`);
      onDone();
    } catch (err) {
      toast.error(apiError(err, "Couldn't add"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomDrawer isOpen onClose={onClose} title={entry.name} subtitle={`Possibly missing ${k.one} · created by ${entry.pharmacy_count || 1} pharmacy(ies)`} maxWidth="max-w-2xl">
      <div className="space-y-4 text-xs">
        <section className="space-y-2">
          <h4 className="font-black text-slate-900 text-sm">1. Check the global {k.label.toLowerCase()}</h4>
          <GlobalSearchDropdown kind={kind} initial={entry.name} onPick={setPicked} actionLabel="Pick" />
          {entry.candidates?.length > 0 && !picked && (
            <div className="space-y-1">
              <div className="text-[11px] text-slate-500">Closest names the background check found:</div>
              {entry.candidates.map((c, i) => (
                <div key={i} className="flex justify-between gap-2 text-slate-700">
                  <span className="truncate">
                    {c.name} <span className="text-slate-400">{c.detail}</span>
                  </span>
                  <span className="font-mono text-[10px] text-slate-400 shrink-0">
                    {c.code} · {Math.round((c.similarity || 0) * 100)}%
                  </span>
                </div>
              ))}
            </div>
          )}
          {picked && (
            <div className="p-3 rounded-xl border border-slate-200 bg-slate-50 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-bold text-slate-900">{picked[k.name]}</div>
                <div className="text-slate-500">{k.sub(picked)}</div>
                <div className="font-mono text-[10px] text-slate-400">{picked[k.code]}</div>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <button onClick={() => setPicked(null)} className="p-1.5 rounded-lg hover:bg-white text-slate-500" title="Clear">
                  <X className="w-4 h-4" />
                </button>
                <button
                  onClick={() => dismiss(picked)}
                  disabled={busy}
                  className="px-3 py-1.5 rounded-lg bg-slate-900 text-white font-bold flex items-center gap-1 disabled:opacity-50"
                >
                  <Copy className="w-3.5 h-3.5" /> Same thing: dismiss as duplicate
                </button>
              </div>
            </div>
          )}
        </section>

        <section className="space-y-2">
          <h4 className="font-black text-slate-900 text-sm">2. Not there? Complete the details and add it</h4>
          {entry.details?.address && <p className="text-[11px] text-slate-500">Address the pharmacy entered: {entry.details.address}</p>}
          {dup ? (
            <DuplicateNotice kind={kind} dup={dup} busy={busy} onCancel={() => setDup(null)} onForce={() => (setDup(null), add(dup.data, true))} />
          ) : (
            <RecordForm kind={kind} initial={initial} submitLabel={`Add to global ${k.label.toLowerCase()}`} onSubmit={(d) => add(d)} busy={busy} />
          )}
        </section>

        <button onClick={() => dismiss(null)} disabled={busy} className="text-[11px] font-bold text-slate-500 hover:underline disabled:opacity-50">
          Dismiss without adding (junk or test entry)
        </button>
      </div>
    </BottomDrawer>
  );
}

function QueueTab({ activeEnv, onPending }) {
  const [kind, setKind] = useState("");
  const [status, setStatus] = useState("PENDING");
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(null);

  const load = useCallback(() => {
    AdminAPI.getReviewQueue({ kind: kind || undefined, status, search: dq || undefined, limit: 50 })
      .then((r) => {
        setData(r.data);
        onPending?.(Object.values(r.data.pending || {}).reduce((s, n) => s + n, 0));
      })
      .catch((err) => {
        setData({ rows: [], pending: {} });
        toast.error(apiError(err, "Couldn't load the review queue"));
      });
  }, [kind, status, dq, onPending]);
  useEffect(load, [load, activeEnv]);

  const pending = data?.pending || {};
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        When a pharmacy adds a product, doctor or supplier, a background check looks for it in the global catalogue. Names it couldn't find land here, one entry per name.
      </p>
      <div className="flex flex-wrap gap-2 items-center">
        {[["", "All"], ...Object.values(KINDS).map((x) => [x.queue, x.label])].map(([id, label]) => (
          <button
            key={id || "all"}
            onClick={() => setKind(id)}
            className={`px-3 h-8 rounded-xl text-xs font-bold border ${kind === id ? "bg-slate-900 text-white border-slate-900" : "bg-white border-slate-200 text-slate-600"}`}
          >
            {label}
            {id && pending[id] ? <span className="ml-1 opacity-70">{pending[id]}</span> : null}
          </button>
        ))}
        <select className="h-8 px-2 rounded-xl border border-slate-200 text-xs bg-white" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="PENDING">To review</option>
          <option value="ADDED">Added</option>
          <option value="DISMISSED">Dismissed</option>
        </select>
        <div className="relative flex-1 min-w-[160px]">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
          <input className={`${inputCls} h-8 pl-8 text-xs`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by name" />
        </div>
        <button onClick={load} className="h-8 w-8 rounded-xl border border-slate-200 bg-white flex items-center justify-center" title="Refresh">
          <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
        </button>
      </div>
      <div className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100">
        {!data ? (
          <div className="py-10 flex justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
          </div>
        ) : data.rows.length === 0 ? (
          <p className="p-4 text-xs text-slate-400">{status === "PENDING" ? "Nothing to review." : "Nothing here."}</p>
        ) : (
          data.rows.map((e) => {
            const k = KINDS[KIND_BY_QUEUE[e.kind]];
            return (
              <div key={e.id} className="px-4 py-3 flex items-center justify-between gap-3 text-xs">
                <div className="min-w-0">
                  <div className="font-bold text-slate-900 truncate">
                    <span className="mr-1.5 px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[9px] font-black uppercase">{k?.one}</span>
                    {e.name}
                  </div>
                  <div className="text-slate-500 truncate flex items-center gap-1">
                    <Store className="w-3 h-3" /> {(e.sources || []).map((s) => s.pharmacy_name || "Unnamed").slice(0, 3).join(", ")}
                    {e.pharmacy_count > 3 ? ` +${e.pharmacy_count - 3} more` : ""} · last {new Date(e.last_seen_at).toLocaleDateString()}
                  </div>
                  {e.status === "ADDED" && e.global_ref && <div className="text-emerald-700 font-semibold">Added as {e.global_ref.code}</div>}
                  {e.status === "DISMISSED" && (
                    <div className="text-slate-500">
                      Dismissed{e.resolution?.duplicate_of ? ` as duplicate of ${e.resolution.duplicate_of.name} (${e.resolution.duplicate_of.code})` : ""} by {e.resolved_by}
                    </div>
                  )}
                </div>
                {e.status === "PENDING" && (
                  <button onClick={() => setOpen(e)} className="shrink-0 px-3 py-1.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-bold flex items-center gap-1">
                    <Check className="w-3.5 h-3.5" /> Review
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
      {open && (
        <ReviewDrawer
          entry={open}
          onClose={() => setOpen(null)}
          onDone={() => {
            setOpen(null);
            load();
          }}
        />
      )}
    </div>
  );
}

export default function GlobalDataPage({ activeEnv }) {
  const [tab, setTab] = useState("queue");
  const [pending, setPending] = useState(null);
  const tabs = [["queue", `Review queue${pending ? ` (${pending})` : ""}`], ...Object.entries(KINDS).map(([id, k]) => [id, k.label])];
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
          <Database className="w-5 h-5 text-brand-500" /> Global Data Manager
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          The shared medicine, doctor and distributor catalogues every pharmacy's suggestions come from. Edits apply to all environments; the review queue is for the{" "}
          <b>{String(activeEnv).toUpperCase()}</b> database.
        </p>
      </div>
      <div className="flex gap-1 overflow-x-auto">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-3 h-9 rounded-xl text-xs font-bold whitespace-nowrap ${tab === id ? "bg-brand-500 text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "queue" ? <QueueTab activeEnv={activeEnv} onPending={setPending} /> : <CatalogueTab key={tab} kind={tab} />}
    </div>
  );
}
