import React, { useCallback, useEffect, useState } from "react";
import { CalendarClock, CalendarPlus, Gift, Loader2, Search, ShieldOff, Receipt, History } from "lucide-react";
import { toast } from "sonner";
import { AdminAPI, apiError } from "../api";
import BottomDrawer from "../components/BottomDrawer";

const STATUS_STYLE = {
  TRIAL: "bg-amber-50 text-amber-700 border-amber-200",
  ACTIVE: "bg-emerald-50 text-emerald-700 border-emerald-200",
  EXPIRED: "bg-rose-50 text-rose-700 border-rose-200",
  NONE: "bg-slate-100 text-slate-500 border-slate-200",
};
const STATUS_LABEL = { TRIAL: "On trial", ACTIVE: "Paid / active", EXPIRED: "Expired", NONE: "No plan" };

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";
const fmtDateTime = (d) => (d ? new Date(d).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—");
const inr = (paise) => `₹${((paise || 0) / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

const inputCls = "w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl focus:border-brand-500 focus:outline-none";
const labelCls = "text-[11px] font-bold text-slate-500 uppercase tracking-wide";

function StatusPill({ sub }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-extrabold ${STATUS_STYLE[sub.status]}`}>
      {STATUS_LABEL[sub.status]}
      {sub.plan && sub.status !== "NONE" ? ` · ${sub.plan}` : ""}
    </span>
  );
}

// One drawer for Extend / End / Grant
function ActionDrawer({ action, row, onClose, onDone }) {
  const [days, setDays] = useState(7);
  const [plan, setPlan] = useState("AGENTIC");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDays(action === "grant" ? 30 : 7);
    setReason("");
  }, [action, row]);

  if (!action || !row) return null;
  const isTrial = row.subscription.status === "TRIAL";
  const titles = {
    extend: isTrial ? "Extend trial" : "Extend plan",
    end: isTrial ? "End trial now" : "End plan now",
    grant: "Grant a plan",
  };

  const submit = async () => {
    setBusy(true);
    try {
      let res;
      if (action === "extend") res = await AdminAPI.extendSubscription(row.pharmacy_id, { days: Number(days), reason });
      if (action === "end") res = await AdminAPI.endSubscription(row.pharmacy_id, { reason });
      if (action === "grant") res = await AdminAPI.grantSubscription(row.pharmacy_id, { plan, days: Number(days), reason });
      toast.success(res.data.message);
      onDone();
    } catch (err) {
      toast.error(apiError(err, "Action failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomDrawer isOpen onClose={onClose} title={titles[action]} subtitle={row.pharmacy_name} maxWidth="max-w-md">
      <div className="space-y-4">
        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-600 space-y-1">
          <div className="flex items-center justify-between">
            <span>Current</span>
            <StatusPill sub={row.subscription} />
          </div>
          {row.subscription.ends_at && (
            <div className="flex items-center justify-between">
              <span>{row.subscription.status === "EXPIRED" ? "Ended" : "Ends"}</span>
              <span className="text-slate-900">{fmtDateTime(row.subscription.ends_at)}</span>
            </div>
          )}
        </div>

        {action === "grant" && (
          <div>
            <label className={labelCls}>Plan</label>
            <select className={inputCls} value={plan} onChange={(e) => setPlan(e.target.value)}>
              {["AGENTIC", "ADVANCED", "BASIC"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <p className="text-[11px] text-slate-500 mt-1">Replaces the current plan, starting now.</p>
          </div>
        )}

        {action !== "end" && (
          <div>
            <label className={labelCls}>Days</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {[3, 7, 14, 30, 90, 365].map((d) => (
                <button
                  key={d}
                  onClick={() => setDays(d)}
                  className={`px-2.5 py-1 text-xs font-bold rounded-lg border ${
                    Number(days) === d ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200"
                  }`}
                >
                  +{d}
                </button>
              ))}
            </div>
            <input className={inputCls} type="number" min="1" max="3650" value={days} onChange={(e) => setDays(e.target.value)} />
            {action === "extend" && row.subscription.ends_at && Number(days) > 0 && (
              <p className="text-[11px] text-slate-500 mt-1">
                New end:{" "}
                <strong>
                  {fmtDate(
                    Math.max(new Date(row.subscription.ends_at).getTime(), Date.now()) + Number(days) * 86400000
                  )}
                </strong>
              </p>
            )}
          </div>
        )}

        <div>
          <label className={labelCls}>Reason {action === "grant" ? "(required)" : "(optional)"}</label>
          <textarea
            className={`${inputCls} min-h-[70px]`}
            maxLength={300}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={action === "end" ? "e.g. Abuse / duplicate account" : "e.g. Requested more time to evaluate"}
          />
          <p className="text-[11px] text-slate-400 mt-1">Saved to the audit log with your name.</p>
        </div>

        <button
          onClick={submit}
          disabled={busy || (action !== "end" && !(Number(days) > 0)) || (action === "grant" && reason.trim().length < 3)}
          className={`w-full flex items-center justify-center gap-2 py-2.5 text-sm font-extrabold text-white rounded-xl disabled:opacity-40 ${
            action === "end" ? "bg-rose-600 hover:bg-rose-700" : "bg-brand-500 hover:bg-brand-600"
          }`}
        >
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}
          {titles[action]}
        </button>
      </div>
    </BottomDrawer>
  );
}

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

      <ActionDrawer
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
