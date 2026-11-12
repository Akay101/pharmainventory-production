// Every GST invoice DavaDesk has issued in this environment: search, view the
// PDF the customer got, and resend it.
import React, { useCallback, useEffect, useState } from "react";
import { Download, FileText, Loader2, Mail, Search } from "lucide-react";
import { toast } from "sonner";
import { AdminAPI, apiError } from "../api";
import { openInvoicePdf } from "../components/AddonsPanel";

const inr = (paise) => `₹${((paise || 0) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmt = (d) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—");
const PURPOSE = { PLAN: "Plan", ADDON: "Add-on", CREDITS: "AI credits" };

export default function InvoicesPage({ activeEnv }) {
  const [data, setData] = useState(null);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(null);
  const [resendTo, setResendTo] = useState({ id: null, email: "" });

  const load = useCallback(async () => {
    try {
      const r = await AdminAPI.getInvoices({ search: query || undefined, page });
      setData(r.data);
    } catch (err) {
      toast.error(apiError(err, "Couldn't load invoices"));
    }
  }, [query, page]);
  useEffect(() => {
    setData(null);
    load();
  }, [load, activeEnv]);

  const resend = async (inv, to) => {
    setBusy(inv.id);
    try {
      const r = await AdminAPI.resendInvoice(inv.id, to ? { to } : {});
      toast.success(r.data.message);
      setResendTo({ id: null, email: "" });
      load();
    } catch (err) {
      toast.error(apiError(err, "Couldn't send"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-5" data-testid="invoices-page">
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center">
              <FileText className="w-4 h-4" />
            </div>
            <h2 className="text-xl font-black text-slate-900 tracking-tight">Invoices</h2>
            {data && <span className="ml-1 px-2 py-0.5 rounded-lg bg-slate-900 text-white text-[10px] font-black uppercase">{data.env}</span>}
          </div>
          {data && (
            <p className="text-xs text-slate-500 mt-1">
              {data.total} invoice{data.total === 1 ? "" : "s"} · {inr(data.sums.total_paise)} billed · taxable {inr(data.sums.taxable_paise)} · GST {inr(data.sums.gst_paise)}
            </p>
          )}
        </div>
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            setQuery(search.trim());
          }}
        >
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Invoice no, buyer, GSTIN, order" className="pl-8 pr-3 py-2 text-sm border border-slate-300 rounded-xl w-72 focus:border-brand-500 focus:outline-none" />
          </div>
          <button className="px-3 py-2 text-xs font-extrabold text-white bg-brand-500 rounded-xl">Search</button>
        </form>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="bg-slate-50 text-slate-500 text-[10px] uppercase font-bold tracking-wider border-b border-slate-200">
            <tr>
              <th className="py-3 px-4">Invoice</th>
              <th className="py-3 px-4">Buyer</th>
              <th className="py-3 px-4">For</th>
              <th className="py-3 px-4 text-right">Taxable</th>
              <th className="py-3 px-4 text-right">GST</th>
              <th className="py-3 px-4 text-right">Total</th>
              <th className="py-3 px-4">Emailed</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {!data ? (
              <tr>
                <td colSpan={8} className="py-12 text-center">
                  <Loader2 className="w-5 h-5 animate-spin text-slate-400 mx-auto" />
                </td>
              </tr>
            ) : data.invoices.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-slate-400">
                  No invoices.
                </td>
              </tr>
            ) : (
              data.invoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-slate-50/80 align-top">
                  <td className="py-3 px-4">
                    <div className="font-mono font-bold text-slate-900">{inv.invoice_no}</div>
                    <div className="text-[10px] text-slate-400">{fmt(inv.issued_at)}</div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="font-semibold text-slate-800">{inv.buyer?.name}</div>
                    <div className="text-[10px] text-slate-400">
                      {inv.buyer?.gstin || "Unregistered"} · {inv.place_of_supply}
                    </div>
                  </td>
                  <td className="py-3 px-4 max-w-[240px]">
                    <div className="font-semibold text-slate-700">{PURPOSE[inv.purpose] || inv.purpose}</div>
                    <div className="text-[10px] text-slate-400 truncate" title={inv.description}>
                      {inv.description}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right">{inr(inv.taxable_paise)}</td>
                  <td className="py-3 px-4 text-right">
                    {inr(inv.gst_paise)}
                    <div className="text-[10px] text-slate-400">{inv.type === "INTRA" ? "CGST+SGST" : "IGST"}</div>
                  </td>
                  <td className="py-3 px-4 text-right font-black text-slate-900">{inr(inv.total_paise)}</td>
                  <td className="py-3 px-4 text-slate-500">{inv.emailed_at ? fmt(inv.emailed_at) : <span className="font-bold text-amber-600">Not yet</span>}</td>
                  <td className="py-3 px-4">
                    <div className="flex justify-end gap-1.5">
                      <button onClick={() => openInvoicePdf(inv.id).catch((e) => toast.error(apiError(e, "Couldn't open PDF")))} className="flex items-center gap-1 px-2 py-1 text-[11px] font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg">
                        <Download className="w-3 h-3" /> View
                      </button>
                      <button disabled={busy === inv.id} onClick={() => resend(inv)} className="flex items-center gap-1 px-2 py-1 text-[11px] font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg disabled:opacity-40">
                        {busy === inv.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mail className="w-3 h-3" />} Resend
                      </button>
                      <button onClick={() => setResendTo({ id: resendTo.id === inv.id ? null : inv.id, email: "" })} className="px-2 py-1 text-[11px] font-bold text-slate-500 hover:text-slate-800">
                        To…
                      </button>
                    </div>
                    {resendTo.id === inv.id && (
                      <form
                        className="mt-2 flex justify-end gap-1.5"
                        onSubmit={(e) => {
                          e.preventDefault();
                          resend(inv, resendTo.email.trim());
                        }}
                      >
                        <input type="email" required value={resendTo.email} onChange={(e) => setResendTo({ ...resendTo, email: e.target.value })} placeholder="other@email.com" className="px-2 py-1 text-xs border border-slate-300 rounded-lg w-44" />
                        <button className="px-2 py-1 text-[11px] font-extrabold text-white bg-brand-500 rounded-lg">Send</button>
                      </form>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {data && data.pages > 1 && (
        <div className="flex justify-center gap-2">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1.5 text-xs font-bold bg-white border border-slate-200 rounded-lg disabled:opacity-40">
            Previous
          </button>
          <span className="px-2 py-1.5 text-xs font-bold text-slate-500">
            Page {page} of {data.pages}
          </span>
          <button disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)} className="px-3 py-1.5 text-xs font-bold bg-white border border-slate-200 rounded-lg disabled:opacity-40">
            Next
          </button>
        </div>
      )}
    </div>
  );
}
