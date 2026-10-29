import React, { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Mail, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AdminAPI, apiError } from "../api";
import BottomDrawer from "./BottomDrawer";

const inputCls = "w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/30";
const label = (c) => c.replace(/_/g, " ");

// Permanently delete a user (an owner takes the whole pharmacy). Shows what
// will go, emails the signed-in admin a code, and needs the name typed.
export default function OffboardUserModal({ userId, onClose, onDeleted }) {
  const [plan, setPlan] = useState(null);
  const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState(null);

  useEffect(() => {
    AdminAPI.offboardPreview(userId)
      .then((r) => setPlan(r.data))
      .catch((err) => {
        toast.error(apiError(err, "Couldn't load what would be deleted"));
        onClose();
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const sendCode = async () => {
    setBusy("code");
    setError("");
    try {
      const r = await AdminAPI.offboardSendCode(userId);
      setChallenge(r.data);
      setCode("");
      toast.success(`Code sent to ${r.data.sent_to}`);
    } catch (err) {
      setError(apiError(err, "Couldn't send the code"));
    } finally {
      setBusy(null);
    }
  };

  const nameOk = plan && typed.trim().replace(/\s+/g, " ").toLowerCase() === String(plan.confirm_name).trim().replace(/\s+/g, " ").toLowerCase();
  const ready = challenge && /^\d{6}$/.test(code) && nameOk;

  const remove = async () => {
    if (!ready) return;
    setBusy("delete");
    setError("");
    try {
      const r = await AdminAPI.offboardUser(userId, { challenge_id: challenge.challenge_id, otp: code, confirm_name: typed });
      setDone(r.data);
      toast.success(`Deleted ${r.data.total} records`);
    } catch (err) {
      setError(apiError(err, "Couldn't delete"));
      if (err?.response?.data?.code === "OTP_INVALID_OR_EXPIRED") setChallenge(null);
    } finally {
      setBusy(null);
    }
  };

  const close = () => (done ? onDeleted?.() : onClose());

  return (
    <BottomDrawer isOpen onClose={busy === "delete" ? () => {} : close} title="Offboard & delete permanently" subtitle={plan ? `${plan.user.name} · ${plan.user.email}` : ""} maxWidth="max-w-lg">
      {!plan ? (
        <div className="py-12 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        </div>
      ) : done ? (
        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-2 text-emerald-700 font-bold">
            <CheckCircle2 className="w-5 h-5" /> Deleted {done.total} records
          </div>
          <ul className="text-xs text-slate-600 grid grid-cols-2 gap-x-4 gap-y-1">
            {Object.entries(done.deleted).map(([c, n]) => (
              <li key={c} className="flex justify-between gap-2">
                <span className="capitalize">{label(c)}</span>
                <b>{n}</b>
              </li>
            ))}
          </ul>
          <p className="text-xs text-slate-500">Uploaded files (bill PDFs, logos, photos) are removed by the main server within about 10 minutes.</p>
          <button onClick={close} className="w-full h-10 rounded-xl text-sm font-bold bg-slate-900 text-white">
            Done
          </button>
        </div>
      ) : (
        <div className="space-y-4 text-xs">
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="font-semibold">
              {plan.kind === "PHARMACY" ? (
                <>
                  This deletes the pharmacy <b>{plan.pharmacy?.name}</b>, all {plan.users.length} login(s) in it and all of its data in the{" "}
                  <b>{plan.env?.toUpperCase()}</b> database. This cannot be undone.
                </>
              ) : (
                <>
                  This deletes the staff login of <b>{plan.user.name}</b> and their own sessions and settings in the <b>{plan.env?.toUpperCase()}</b> database. The
                  pharmacy's records stay with its owner. This cannot be undone.
                </>
              )}
            </div>
          </div>

          {plan.kind === "PHARMACY" && plan.users.length > 1 && (
            <div>
              <div className="font-bold text-slate-700 mb-1">Logins that will be removed</div>
              <ul className="text-slate-600 space-y-0.5">
                {plan.users.map((u) => (
                  <li key={u.id}>
                    {u.name} · {u.email} {u.is_primary_admin ? "(owner)" : `(${u.role})`}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <div className="font-bold text-slate-700 mb-1">
              What will be deleted · {plan.total.toLocaleString("en-IN")} records
            </div>
            <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
              {plan.collections.map((c) => (
                <div key={c.collection} className="px-3 py-1.5 flex justify-between">
                  <span className="capitalize text-slate-700">{label(c.collection)}</span>
                  <b className="text-slate-900">{c.count.toLocaleString("en-IN")}</b>
                </div>
              ))}
              {plan.files.length > 0 && (
                <div className="px-3 py-1.5 flex justify-between text-slate-500">
                  <span>Uploaded files (PDFs, logo, photos)</span>
                  <span>all</span>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <div className="font-bold text-slate-700">1. Verify it's you</div>
            {!challenge ? (
              <button
                onClick={sendCode}
                disabled={!!busy}
                className="w-full h-10 rounded-xl text-sm font-bold border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {busy === "code" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />} Email me a code
              </button>
            ) : (
              <div className="space-y-1">
                <input
                  className={`${inputCls} tracking-[0.4em] font-mono text-center`}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="6-digit code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  autoFocus
                />
                <div className="flex justify-between text-[11px] text-slate-500">
                  <span>
                    Sent to {challenge.sent_to}, valid {plan.otp_ttl_minutes} min, one use
                  </span>
                  <button onClick={sendCode} disabled={!!busy} className="font-bold text-slate-700 hover:underline disabled:opacity-50">
                    Send a new code
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-1">
            <div className="font-bold text-slate-700">
              2. Type <span className="font-mono bg-slate-100 px-1 rounded">{plan.confirm_name}</span> to confirm
            </div>
            <input className={inputCls} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={plan.confirm_name} autoComplete="off" />
          </div>

          {error && <div className="p-2.5 rounded-xl bg-rose-50 text-rose-700 font-semibold">{error}</div>}

          <button
            onClick={remove}
            disabled={!ready || !!busy}
            className="w-full h-11 rounded-xl text-sm font-extrabold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {busy === "delete" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Delete permanently
          </button>
        </div>
      )}
    </BottomDrawer>
  );
}
