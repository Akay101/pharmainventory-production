import React, { useCallback, useEffect, useState } from "react";
import { Check, Copy, KeyRound, Loader2, Mail, MessageCircle, ShieldAlert, XCircle } from "lucide-react";
import { toast } from "sonner";
import { AdminAPI, apiError } from "../api";
import BottomDrawer from "./BottomDrawer";

const inputCls = "w-full h-9 px-3 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30";

const DURATIONS = [
  [15, "15 min"],
  [60, "1 hour"],
  [6 * 60, "6 hours"],
  [24 * 60, "24 hours"],
  [3 * 24 * 60, "3 days"],
  [7 * 24 * 60, "7 days"],
];
const STATUS = {
  ACTIVE: "bg-emerald-100 text-emerald-700",
  USED: "bg-sky-100 text-sky-700",
  EXPIRED: "bg-slate-100 text-slate-600",
  REVOKED: "bg-rose-100 text-rose-700",
};
const REASON = { REPLACED: "replaced by a newer link", REVOKED_BY_ADMIN: "revoked", PASSWORD_CHANGED: "password changed" };
const fmt = (d) => (d ? new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "—");
const toLocal = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

// Create a one-time password reset link for a user and send it by email
// and/or the admin's WhatsApp. The link is shown only here, right after making it.
export default function ResetLinkDrawer({ user, onClose }) {
  const [minutes, setMinutes] = useState(24 * 60);
  const [custom, setCustom] = useState("");
  const [sendEmail, setSendEmail] = useState(true);
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState(null);
  const [copied, setCopied] = useState(false);
  const [links, setLinks] = useState([]);

  const loadLinks = useCallback(() => {
    AdminAPI.getResetLinks(user.id)
      .then((r) => setLinks(r.data.links))
      .catch(() => {});
  }, [user.id]);
  useEffect(loadLinks, [loadLinks]);

  const create = async () => {
    setBusy(true);
    try {
      const body = { send_email: sendEmail, ...(minutes === "custom" ? { expires_at: new Date(custom).toISOString() } : { expires_in_minutes: minutes }) };
      const r = await AdminAPI.createResetLink(user.id, body);
      setMade(r.data);
      if (r.data.email?.sent) toast.success(`Link emailed to ${user.email}`);
      else if (r.data.email && !r.data.email.sent) toast.error(`Link made, but the email failed: ${r.data.email.error}`);
      else toast.success("Link ready");
      loadLinks();
    } catch (err) {
      toast.error(apiError(err, "Couldn't make the link"));
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(made.link.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy; select the link and copy it");
    }
  };

  const whatsapp = () => {
    window.open(made.whatsapp_url, "_blank", "noopener,noreferrer");
    AdminAPI.markResetLinkWhatsapp(user.id, made.link.id).then(loadLinks).catch(() => {});
  };

  const revoke = async (id) => {
    try {
      await AdminAPI.revokeResetLink(user.id, id);
      toast.success("Link revoked");
      if (made?.link.id === id) setMade(null);
      loadLinks();
    } catch (err) {
      toast.error(apiError(err, "Couldn't revoke"));
    }
  };

  const customOk = minutes !== "custom" || (custom && new Date(custom) - Date.now() >= 14 * 60000 && new Date(custom) - Date.now() <= 7 * 864e5);
  const now = new Date();

  return (
    <BottomDrawer isOpen onClose={onClose} title="Password reset link" subtitle={`${user.name || ""} · ${user.email}`} maxWidth="max-w-lg">
      <div className="space-y-4 text-xs">
        {!made ? (
          <>
            <p className="text-slate-500">
              The user opens the link and sets a new password; no code needed. It works once, only for this account, and stops at the time you pick. Making a new link cancels the old one.
            </p>
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Link stays valid for</span>
              <div className="mt-1.5 grid grid-cols-3 gap-1.5 sm:grid-cols-7">
                {DURATIONS.map(([m, l]) => (
                  <button key={m} type="button" onClick={() => setMinutes(m)} className={`rounded-lg border px-2 py-2 font-bold ${minutes === m ? "border-brand-300 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                    {l}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => (setMinutes("custom"), custom || setCustom(toLocal(new Date(Date.now() + 2 * 864e5))))}
                  className={`rounded-lg border px-2 py-2 font-bold ${minutes === "custom" ? "border-brand-300 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                >
                  Until…
                </button>
              </div>
              {minutes === "custom" && (
                <div className="mt-2">
                  <input type="datetime-local" className={inputCls} value={custom} min={toLocal(new Date(Date.now() + 15 * 60000))} max={toLocal(new Date(Date.now() + 7 * 864e5))} onChange={(e) => setCustom(e.target.value)} />
                  {!customOk && <p className="mt-1 text-rose-600">Pick a time between 15 minutes and 7 days from now.</p>}
                </div>
              )}
            </div>
            <label className="flex items-center gap-2 rounded-xl border border-slate-200 p-3">
              <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} className="h-4 w-4 accent-orange-500" />
              <Mail className="h-4 w-4 text-slate-400" />
              <span className="font-semibold text-slate-700">Email it to {user.email}</span>
            </label>
            <p className="text-slate-400">You can also send it on WhatsApp{user.mobile ? ` to ${user.mobile}` : ""} on the next step.</p>
            <button
              type="button"
              disabled={busy || !customOk}
              onClick={create}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-brand-500 text-sm font-extrabold text-white hover:bg-brand-600 disabled:opacity-40"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />} Create link
            </button>
          </>
        ) : (
          <div className="space-y-3">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-emerald-800">
              <p className="font-bold">Link ready · valid until {fmt(made.link.expires_at)}</p>
              <p className="mt-0.5">
                {made.email?.sent ? `Emailed to ${user.email}.` : made.email ? `Email failed: ${String(made.email.error).replace(/\.?$/, ".")}` : "Not emailed."} This link is shown only now; it isn't stored.
              </p>
            </div>
            <div className="flex gap-1.5">
              <input readOnly value={made.link.url} onFocus={(e) => e.target.select()} className={`${inputCls} font-mono text-[11px]`} />
              <button type="button" onClick={copy} className="flex shrink-0 items-center gap-1 rounded-xl border border-slate-200 px-3 font-bold text-slate-700 hover:bg-slate-50">
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />} {copied ? "Copied" : "Copy"}
              </button>
            </div>
            {made.whatsapp_url ? (
              <button type="button" onClick={whatsapp} className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 text-sm font-extrabold text-white hover:bg-emerald-700">
                <MessageCircle className="h-4 w-4" /> Send on WhatsApp to {user.mobile}
              </button>
            ) : (
              <p className="rounded-xl bg-slate-50 p-3 text-slate-500">No valid mobile number on this account for WhatsApp. Copy the link instead.</p>
            )}
            <p className="flex items-start gap-1.5 text-amber-700">
              <ShieldAlert className="h-4 w-4 shrink-0" /> Anyone with this link can set the password until it's used or expires. Send it only to the account owner.
            </p>
            <button type="button" onClick={() => setMade(null)} className="w-full text-center font-bold text-slate-500 hover:text-slate-700">
              Make another link
            </button>
          </div>
        )}

        {links.length > 0 && (
          <div>
            <h4 className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">Recent links</h4>
            <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
              {links.map((l) => (
                <div key={l.id} className="flex items-center justify-between gap-2 p-2.5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${STATUS[l.status]}`}>{l.status}</span>
                      <span className="text-slate-500">
                        made {fmt(l.created_at)} by {l.created_by?.admin_email || "—"}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[10px] text-slate-400">
                      {l.status === "USED" ? `used ${fmt(l.used_at)}` : l.status === "REVOKED" ? `${REASON[l.revoked_reason] || "revoked"} ${fmt(l.revoked_at)}` : `${new Date(l.expires_at) > now ? "valid until" : "expired"} ${fmt(l.expires_at)}`}
                      {l.channels?.email ? " · emailed" : ""}
                      {l.channels?.whatsapp ? " · WhatsApp" : ""}
                      {l.opened_at ? ` · opened ${fmt(l.opened_at)}` : ""}
                    </div>
                  </div>
                  {l.status === "ACTIVE" && (
                    <button type="button" onClick={() => revoke(l.id)} className="flex shrink-0 items-center gap-1 rounded-lg border border-rose-200 px-2 py-1 font-bold text-rose-600 hover:bg-rose-50">
                      <XCircle className="h-3.5 w-3.5" /> Revoke
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </BottomDrawer>
  );
}
