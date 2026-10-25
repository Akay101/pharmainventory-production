import React, { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AdminAPI, apiError } from "../api";
import BottomDrawer from "./BottomDrawer";

export const STATUS_STYLE = {
  TRIAL: "bg-amber-50 text-amber-700 border-amber-200",
  ACTIVE: "bg-emerald-50 text-emerald-700 border-emerald-200",
  EXPIRED: "bg-rose-50 text-rose-700 border-rose-200",
  NONE: "bg-slate-100 text-slate-500 border-slate-200",
};
export const STATUS_LABEL = { TRIAL: "On trial", ACTIVE: "Paid / active", EXPIRED: "Expired", NONE: "No plan" };

export const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";
export const fmtDateTime = (d) => (d ? new Date(d).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—");

export function StatusPill({ sub }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-extrabold ${STATUS_STYLE[sub.status]}`}>
      {STATUS_LABEL[sub.status]}
      {sub.plan && sub.status !== "NONE" ? ` · ${sub.plan}` : ""}
    </span>
  );
}

const inputCls = "w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl focus:border-brand-500 focus:outline-none";
const labelCls = "text-[11px] font-bold text-slate-500 uppercase tracking-wide";
const PLANS = ["AGENTIC", "ADVANCED", "BASIC"];

/**
 * Extend / end / change plan / grant for one pharmacy.
 * row: { pharmacy_id, pharmacy_name, subscription }
 */
export default function SubscriptionActionDrawer({ action, row, onClose, onDone }) {
  const [days, setDays] = useState(7);
  const [plan, setPlan] = useState("AGENTIC");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDays(action === "grant" ? 30 : 7);
    setReason("");
    const current = row?.subscription?.plan;
    setPlan(action === "change" ? PLANS.find((p) => p !== current) || "AGENTIC" : "AGENTIC");
  }, [action, row]);

  if (!action || !row) return null;
  const isTrial = row.subscription.status === "TRIAL";
  const titles = {
    extend: isTrial ? "Extend trial" : "Extend plan",
    end: isTrial ? "End trial now" : "End subscription now",
    change: isTrial ? "Change trial plan" : "Change plan",
    grant: "Grant a plan",
  };

  const submit = async () => {
    setBusy(true);
    try {
      let res;
      if (action === "extend") res = await AdminAPI.extendSubscription(row.pharmacy_id, { days: Number(days), reason });
      if (action === "end") res = await AdminAPI.endSubscription(row.pharmacy_id, { reason });
      if (action === "change") res = await AdminAPI.changePlan(row.pharmacy_id, { plan, reason });
      if (action === "grant") res = await AdminAPI.grantSubscription(row.pharmacy_id, { plan, days: Number(days), reason });
      toast.success(res.data.message);
      onDone();
    } catch (err) {
      toast.error(apiError(err, "Action failed"));
    } finally {
      setBusy(false);
    }
  };

  const disabled =
    busy ||
    ((action === "extend" || action === "grant") && !(Number(days) > 0)) ||
    (action === "grant" && reason.trim().length < 3) ||
    (action === "change" && plan === row.subscription.plan);

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

        {(action === "grant" || action === "change") && (
          <div>
            <label className={labelCls}>{action === "change" ? "New plan" : "Plan"}</label>
            <div className="grid grid-cols-3 gap-2 mt-1">
              {PLANS.map((c) => (
                <button
                  key={c}
                  onClick={() => setPlan(c)}
                  disabled={action === "change" && c === row.subscription.plan}
                  className={`py-2 rounded-xl border text-xs font-extrabold disabled:opacity-40 ${
                    plan === c ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-200"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              {action === "change"
                ? `Switches the plan now. It still ends on ${fmtDate(row.subscription.ends_at)}.`
                : "Replaces the current plan, starting now."}
            </p>
          </div>
        )}

        {(action === "extend" || action === "grant") && (
          <div>
            <label className={labelCls}>Days</label>
            <div className="flex flex-wrap gap-1.5 mb-2 mt-1">
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
                <strong>{fmtDate(Math.max(new Date(row.subscription.ends_at).getTime(), Date.now()) + Number(days) * 86400000)}</strong>
              </p>
            )}
          </div>
        )}

        {action === "end" && (
          <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3 font-semibold">
            Access stops immediately for everyone in this pharmacy. Their data is kept and they can buy a plan again.
            {isTrial && " They can't start another free trial."}
          </p>
        )}

        <div>
          <label className={labelCls}>Reason {action === "grant" ? "(required)" : "(optional)"}</label>
          <textarea
            className={`${inputCls} min-h-[70px] mt-1`}
            maxLength={300}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={action === "end" ? "e.g. Duplicate account" : "e.g. Requested more time to evaluate"}
          />
          <p className="text-[11px] text-slate-400 mt-1">Saved to the audit log with your name.</p>
        </div>

        <button
          onClick={submit}
          disabled={disabled}
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
