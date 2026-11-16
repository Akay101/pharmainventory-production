// One account's add-ons (extra pharmacist users, linked pharmacies) with end
// dates, and controls to extend or end each; plus its GST invoices.
import React, { useState } from "react";
import { Building2, CalendarPlus, Download, Loader2, Mail, ShieldOff, UserPlus, Users, FileText } from "lucide-react";
import { toast } from "sonner";
import { AdminAPI, apiError } from "../api";

const fmt = (d) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—");
const inr = (paise) => `₹${((paise || 0) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const TONE = { ACTIVE: "bg-emerald-50 text-emerald-700 border-emerald-200", EXPIRED: "bg-rose-50 text-rose-700 border-rose-200", ENDED: "bg-slate-100 text-slate-500 border-slate-200" };
const inputCls = "px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:border-brand-500 focus:outline-none";

export async function openInvoicePdf(id) {
  const r = await AdminAPI.getInvoicePdf(id);
  const url = URL.createObjectURL(r.data);
  window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function AddonRow({ a, accountId, onChanged }) {
  const [mode, setMode] = useState(null); // extend | end
  const [days, setDays] = useState(a.type === "PHARMACY" ? 365 : 30);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      const r = mode === "extend" ? await AdminAPI.extendAddon(accountId, a.id, { days: Number(days), reason }) : await AdminAPI.endAddon(accountId, a.id, { reason });
      toast.success(r.data.message);
      setMode(null);
      onChanged();
    } catch (err) {
      toast.error(apiError(err, "Action failed"));
    } finally {
      setBusy(false);
    }
  };
  const label = a.type === "PHARMACY" ? `Linked pharmacy: ${a.pharmacy_name || a.pharmacy_id}` : a.kind === "INCLUDED" ? "Included pharmacist user" : "Extra pharmacist user";
  return (
    <div className="p-3 space-y-2" data-testid="admin-addon-row">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="font-bold text-slate-800 flex items-center gap-1.5">
            {a.type === "PHARMACY" ? <Building2 className="w-3.5 h-3.5" /> : <Users className="w-3.5 h-3.5" />} {label}
          </div>
          <div className="text-slate-500">
            {a.kind === "INCLUDED" ? "Follows the plan" : `${a.cycle || ""} · ${fmt(a.starts_at)} → ${fmt(a.ends_at)}`}
            {a.user_name ? ` · held by ${a.user_name}` : a.type === "USER_SEAT" ? " · unassigned" : ""}
            {a.renewals?.length ? ` · renewed ${a.renewals.length}×` : ""}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`px-2 py-0.5 rounded-lg border text-[10px] font-extrabold ${TONE[a.state] || TONE.ENDED}`}>{a.state}</span>
          {a.kind !== "INCLUDED" && (
            <>
              <button onClick={() => setMode(mode === "extend" ? null : "extend")} className="flex items-center gap-1 px-2 py-1 text-[11px] font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg">
                <CalendarPlus className="w-3 h-3" /> Extend
              </button>
              {a.state === "ACTIVE" && (
                <button onClick={() => setMode(mode === "end" ? null : "end")} className="flex items-center gap-1 px-2 py-1 text-[11px] font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg">
                  <ShieldOff className="w-3 h-3" /> End
                </button>
              )}
            </>
          )}
        </div>
      </div>
      {mode && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-2">
          {mode === "extend" && (
            <label className="flex items-center gap-1 font-bold text-slate-600">
              Days <input type="number" min="1" max="3650" className={`${inputCls} w-20`} value={days} onChange={(e) => setDays(e.target.value)} />
            </label>
          )}
          <input className={`${inputCls} flex-1 min-w-[160px]`} placeholder="Reason (kept in the audit log)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <button disabled={busy || reason.trim().length < 3 || (mode === "extend" && !(Number(days) > 0))} onClick={go} className={`px-3 py-1.5 text-[11px] font-extrabold text-white rounded-lg disabled:opacity-40 ${mode === "end" ? "bg-rose-600" : "bg-brand-500"}`}>
            {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : mode === "end" ? "End now" : "Extend"}
          </button>
        </div>
      )}
    </div>
  );
}

export default function AddonsPanel({ detail, onChanged }) {
  const [grant, setGrant] = useState(false);
  const [count, setCount] = useState(1);
  const [days, setDays] = useState(30);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(null);
  const addons = detail.addons || [];

  const grantSeats = async () => {
    setBusy("grant");
    try {
      const r = await AdminAPI.grantSeats(detail.pharmacy_id, { count: Number(count), days: Number(days), reason });
      toast.success(r.data.message);
      setGrant(false);
      setReason("");
      onChanged();
    } catch (err) {
      toast.error(apiError(err, "Couldn't grant"));
    } finally {
      setBusy(null);
    }
  };
  const resend = async (inv) => {
    setBusy(inv.id);
    try {
      const r = await AdminAPI.resendInvoice(inv.id, {});
      toast.success(r.data.message);
    } catch (err) {
      toast.error(apiError(err, "Couldn't send"));
    } finally {
      setBusy(null);
    }
  };

  if (detail.linked_to) {
    return <p className="p-3 rounded-xl bg-amber-50 text-amber-800 font-semibold">This is a linked pharmacy. Its plan and add-on are managed on the account's main pharmacy.</p>;
  }

  return (
    <>
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h4 className="font-black text-slate-900 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" /> Add-ons
          </h4>
          <button onClick={() => setGrant((g) => !g)} className="flex items-center gap-1 px-2 py-1 text-[11px] font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg">
            <UserPlus className="w-3 h-3" /> Grant users
          </button>
        </div>
        {grant && (
          <div className="mb-2 flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 p-2.5 border border-slate-200">
            <label className="flex items-center gap-1 font-bold text-slate-600">
              Users <input type="number" min="1" max="20" className={`${inputCls} w-16`} value={count} onChange={(e) => setCount(e.target.value)} />
            </label>
            <label className="flex items-center gap-1 font-bold text-slate-600">
              Days <input type="number" min="1" max="3650" className={`${inputCls} w-20`} value={days} onChange={(e) => setDays(e.target.value)} />
            </label>
            <input className={`${inputCls} flex-1 min-w-[160px]`} placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
            <button disabled={busy === "grant" || reason.trim().length < 3} onClick={grantSeats} className="px-3 py-1.5 text-[11px] font-extrabold text-white bg-brand-500 rounded-lg disabled:opacity-40">
              {busy === "grant" ? <Loader2 className="w-3 h-3 animate-spin" /> : "Grant free"}
            </button>
          </div>
        )}
        <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl">
          {addons.length === 0 && <p className="p-3 text-slate-400">No add-ons.</p>}
          {addons.map((a) => (
            <AddonRow key={a.id} a={a} accountId={detail.pharmacy_id} onChanged={onChanged} />
          ))}
        </div>
      </section>

      <section>
        <h4 className="font-black text-slate-900 mb-2 flex items-center gap-1.5">
          <FileText className="w-3.5 h-3.5" /> Invoices
        </h4>
        <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl">
          {!detail.invoices?.length && <p className="p-3 text-slate-400">No invoices yet.</p>}
          {(detail.invoices || []).map((inv) => (
            <div key={inv.id} className="p-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-bold text-slate-800">
                  {inv.invoice_no} · {inr(inv.total_paise)}
                </div>
                <div className="text-slate-500">
                  {fmt(inv.issued_at)} · {inv.purpose} · {inv.type === "INTRA" ? "CGST+SGST" : "IGST"} {inr(inv.gst_paise)} · {inv.emailed_at ? `emailed ${fmt(inv.emailed_at)}` : "not emailed yet"}
                </div>
              </div>
              <div className="flex gap-1.5">
                <button onClick={() => openInvoicePdf(inv.id).catch((e) => toast.error(apiError(e, "Couldn't open PDF")))} className="flex items-center gap-1 px-2 py-1 text-[11px] font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg">
                  <Download className="w-3 h-3" /> View
                </button>
                <button disabled={busy === inv.id} onClick={() => resend(inv)} className="flex items-center gap-1 px-2 py-1 text-[11px] font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg disabled:opacity-40">
                  {busy === inv.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mail className="w-3 h-3" />} Resend
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
