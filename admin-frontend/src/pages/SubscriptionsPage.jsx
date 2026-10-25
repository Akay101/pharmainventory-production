import React, { useCallback, useEffect, useState } from "react";
import { CalendarClock, CalendarPlus, Gift, Loader2, Search, ShieldOff, Receipt, History, ArrowUpDown } from "lucide-react";
import { toast } from "sonner";
import { AdminAPI, apiError } from "../api";
import BottomDrawer from "../components/BottomDrawer";
import SubscriptionActionDrawer, { StatusPill, STATUS_LABEL, fmtDate, fmtDateTime } from "../components/SubscriptionActionDrawer";

const inr = (paise) => `₹${((paise || 0) / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

function HistoryDrawer({ row, onClose }) {
  const [detail, setDetail] = useState(null);
  useEffect(() => {
    if (!row) return;
    setDetail(null);
    AdminAPI.getSubscription(row.pharmacy_id)
      .then((r) => setDetail(r.data))
      .catch((err) => toast.error(apiError(err, "Couldn't load history")));
  }, [row]);
  if (!row) return null;
  return (
    <BottomDrawer isOpen onClose={onClose} title="Subscription history" subtitle={row.pharmacy_name} maxWidth="max-w-2xl">
      {!detail ? (
        <div className="py-10 flex justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
        </div>
      ) : (
        <div className="space-y-5 text-xs">
          <section>
            <h4 className="font-black text-slate-900 mb-2 flex items-center gap-1.5">
              <History className="w-3.5 h-3.5" /> Plan changes
            </h4>
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl">
              {detail.ledger.length === 0 && <p className="p-3 text-slate-400">No history yet.</p>}
              {detail.ledger.map((l) => (
                <div key={l.id || l.source_ref} className="p-3 flex items-start justify-between gap-3">
                  <div>
                    <div className="font-bold text-slate-800">
                      {l.kind || "LEGACY"} · {l.plan}
                      {l.metadata?.action === "EXTEND" ? ` · +${l.days} days` : ""}
                      {l.credit_days ? ` · +${l.credit_days} credit days` : ""}
                    </div>
                    <div className="text-slate-500">
                      {fmtDate(l.start_date)} → {fmtDate(l.end_date)} · {l.status}
                      {l.actor?.admin_email ? ` · by ${l.actor.admin_email}` : ""}
                    </div>
                    {(l.metadata?.reason || l.end_reason) && <div className="text-slate-400 italic">“{l.metadata?.reason || l.end_reason}”</div>}
                  </div>
                  {l.amount_paise ? <span className="font-black text-slate-900">{inr(l.amount_paise)}</span> : null}
                </div>
              ))}
            </div>
          </section>
          <section>
            <h4 className="font-black text-slate-900 mb-2 flex items-center gap-1.5">
              <Receipt className="w-3.5 h-3.5" /> Payments
            </h4>
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl">
              {detail.orders.length === 0 && <p className="p-3 text-slate-400">No checkouts yet.</p>}
              {detail.orders.map((o) => (
                <div key={o.order_id} className="p-3 flex items-start justify-between gap-3">
                  <div>
                    <div className="font-bold text-slate-800">
                      {o.plan} · <span className="font-mono">{o.order_id}</span>
                    </div>
                    <div className="text-slate-500">
                      {fmtDateTime(o.created_at)} · {o.status}
                      {o.last_payment_status && o.status !== "PAID" ? ` (${o.last_payment_status})` : ""}
                      {o.promo_code ? ` · code ${o.promo_code}` : ""}
                    </div>
                  </div>
                  <span className="font-black text-slate-900">{inr(o.amount_paise)}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </BottomDrawer>
  );
}

export default function SubscriptionsPage({ activeEnv }) {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState("ALL");
  const [search, setSearch] = useState("");
  const [action, setAction] = useState(null); // { type, row }
  const [historyRow, setHistoryRow] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await AdminAPI.getSubscriptions({ status });
      setData(res.data);
    } catch (err) {
      toast.error(apiError(err, "Couldn't load subscriptions"));
    }
  }, [status]);

  useEffect(() => {
    load();
  }, [load, activeEnv]);

  const rows = (data?.pharmacies || []).filter((r) => {
    if (!search) return true;
    const t = search.toLowerCase();
    return r.pharmacy_name.toLowerCase().includes(t) || (r.owner?.email || "").toLowerCase().includes(t) || (r.owner?.name || "").toLowerCase().includes(t);
  });

  return (
    <div className="space-y-5">
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center">
            <CalendarClock className="w-4 h-4" />
          </div>
          <h2 className="text-xl font-black text-slate-900 tracking-tight">Subscriptions & Trials</h2>
        </div>
        <p className="text-xs text-slate-500 mt-1">
          Every pharmacy's plan, soonest-ending first. Extend or end trials, or grant a plan. All actions are audited.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {["TRIAL", "ACTIVE", "EXPIRED", "NONE"].map((s) => (
          <button
            key={s}
            onClick={() => setStatus(status === s ? "ALL" : s)}
            className={`p-3.5 text-left bg-white rounded-xl border shadow-2xs transition-all ${
              status === s ? "border-slate-900 ring-1 ring-slate-900" : "border-slate-200 hover:border-slate-300"
            }`}
          >
            <span className="text-[10px] font-bold text-slate-400 uppercase">{STATUS_LABEL[s]}</span>
            <div className="text-xl font-black text-slate-900 mt-0.5">{data?.summary?.[s] ?? "—"}</div>
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-4 bg-slate-50/70 border-b border-slate-200 flex items-center justify-between gap-3">
          <span className="text-xs font-bold text-slate-500">
            {status === "ALL" ? "All pharmacies" : STATUS_LABEL[status]} · {rows.length}
          </span>
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search pharmacy or owner..."
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-xl focus:border-brand-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-50 text-slate-500 text-[10px] uppercase font-bold tracking-wider border-b border-slate-200">
              <tr>
                <th className="py-3 px-4 min-w-[180px]">Pharmacy</th>
                <th className="py-3 px-4 min-w-[190px]">Owner</th>
                <th className="py-3 px-4 min-w-[150px]">Status</th>
                <th className="py-3 px-4 min-w-[150px]">Ends</th>
                <th className="py-3 px-4 min-w-[260px] text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {!data ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center">
                    <Loader2 className="w-5 h-5 animate-spin text-slate-400 mx-auto" />
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400">
                    No pharmacies match.
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const s = r.subscription;
                  const live = s.status === "TRIAL" || s.status === "ACTIVE";
                  const soon = live && s.days_left <= 2;
                  return (
                    <tr key={r.pharmacy_id} className="hover:bg-slate-50/80">
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900">{r.pharmacy_name}</div>
                        <div className="text-[10px] text-slate-400">{r.location || "—"}</div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-800">{r.owner?.name || "—"}</div>
                        <div className="text-[10px] text-slate-400">{r.owner?.email || ""}</div>
                      </td>
                      <td className="py-3.5 px-4">
                        <StatusPill sub={s} />
                        {r.trial_claimed_at && s.status !== "TRIAL" && (
                          <div className="text-[10px] text-slate-400 mt-1">Trial used {fmtDate(r.trial_claimed_at)}</div>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className={`font-semibold ${soon ? "text-rose-600" : "text-slate-700"}`}>{fmtDate(s.ends_at)}</div>
                        {live && <div className={`text-[10px] ${soon ? "text-rose-500 font-bold" : "text-slate-400"}`}>{s.days_left} day(s) left</div>}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center justify-end gap-1.5 flex-wrap">
                          {s.plan && (
                            <button
                              onClick={() => setAction({ type: "extend", row: r })}
                              className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
                            >
                              <CalendarPlus className="w-3.5 h-3.5" /> {s.status === "TRIAL" ? "Extend trial" : "Extend"}
                            </button>
                          )}
                          {live && (
                            <button
                              onClick={() => setAction({ type: "change", row: r })}
                              className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
                            >
                              <ArrowUpDown className="w-3.5 h-3.5" /> Change plan
                            </button>
                          )}
                          {live && (
                            <button
                              onClick={() => setAction({ type: "end", row: r })}
                              className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold rounded-lg bg-white border border-rose-200 text-rose-600 hover:bg-rose-50"
                            >
                              <ShieldOff className="w-3.5 h-3.5" /> {s.status === "TRIAL" ? "End trial" : "End"}
                            </button>
                          )}
                          <button
                            onClick={() => setAction({ type: "grant", row: r })}
                            className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
                          >
                            <Gift className="w-3.5 h-3.5" /> Grant
                          </button>
                          <button
                            onClick={() => setHistoryRow(r)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                            title="History"
                          >
                            <History className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <SubscriptionActionDrawer
        action={action?.type}
        row={action?.row}
        onClose={() => setAction(null)}
        onDone={() => {
          setAction(null);
          load();
        }}
      />
      <HistoryDrawer row={historyRow} onClose={() => setHistoryRow(null)} />
    </div>
  );
}
