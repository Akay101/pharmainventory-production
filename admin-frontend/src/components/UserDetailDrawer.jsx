import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowUpDown,
  Building,
  CalendarPlus,
  Clock,
  FileText,
  Gift,
  Loader2,
  Mail,
  Package,
  Phone,
  Receipt,
  ShieldOff,
  ShoppingCart,
  Truck,
  Users,
  UserRound,
  Boxes,
  Coins,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { AdminAPI, apiError } from "../api";
import BottomDrawer from "./BottomDrawer";
import SubscriptionActionDrawer, { StatusPill, fmtDate, fmtDateTime } from "./SubscriptionActionDrawer";
import OffboardUserModal from "./OffboardUserModal";
import { useAuth } from "../context/AuthContext";

const TONE = {
  emerald: "bg-emerald-50 border-emerald-200 text-emerald-800",
  amber: "bg-amber-50 border-amber-200 text-amber-800",
  rose: "bg-rose-50 border-rose-200 text-rose-800",
};

const inr = (rupees) => `₹${Number(rupees || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const inrPaise = (paise) =>
  `₹${((paise || 0) / 100).toLocaleString("en-IN", { minimumFractionDigits: (paise || 0) % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;

const ago = (d) => {
  if (!d) return "never";
  const ms = Date.now() - new Date(d).getTime();
  const days = Math.floor(ms / 86400000);
  if (days > 0) return `${days} day${days === 1 ? "" : "s"} ago`;
  const hours = Math.floor(ms / 3600000);
  if (hours > 0) return `${hours}h ago`;
  return "just now";
};

const EVENT_DOT = {
  PURCHASED: "bg-emerald-500",
  TRIAL_STARTED: "bg-amber-500",
  TRIAL_CLAIMED: "bg-amber-300",
  EXTENDED: "bg-sky-500",
  PLAN_CHANGED: "bg-sky-500",
  GRANTED: "bg-violet-500",
  PROMO: "bg-violet-400",
  ENDED: "bg-rose-500",
  EXPIRED: "bg-rose-400",
  CHECKOUT: "bg-orange-400",
};

function Stat({ icon: Icon, label, value, sub }) {
  return (
    <div className="p-3 rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase">
        <Icon className="w-3.5 h-3.5" /> {label}
      </div>
      <div className="text-lg font-black text-slate-900 mt-0.5">{value}</div>
      {sub && <div className="text-[10px] text-slate-500 font-semibold">{sub}</div>}
    </div>
  );
}

const inputCls = "w-full h-9 px-3 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30";

// Add AI credits to the user's pharmacy wallet (shared by its staff)
function GrantCreditsDrawer({ user, pharmacy, balance, onClose, onDone }) {
  const [credits, setCredits] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  // One id per open dialog: a double click or retry grants once
  const [requestId] = useState(() => crypto.randomUUID());
  const valid = Number(credits) > 0 && Number(credits) <= 1000000 && reason.trim().length >= 3;
  const submit = async () => {
    setBusy(true);
    try {
      const r = await AdminAPI.grantUserCredits(user.id, { credits: Number(credits), reason: reason.trim(), request_id: requestId });
      toast.success(`Added ${credits} credits · balance ${r.data.balance}`);
      onDone();
    } catch (err) {
      toast.error(apiError(err, "Couldn't add credits"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <BottomDrawer isOpen onClose={onClose} title="Add AI credits" subtitle={`${pharmacy.name} · ${user.email}`} maxWidth="max-w-md">
      <div className="space-y-3 text-xs">
        <p className="text-slate-500">
          Current balance <b>{balance ?? 0}</b> credits. Credits go to the pharmacy's wallet, shared by everyone in it, and never expire.
        </p>
        <label className="block">
          <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Credits</span>
          <input type="number" min="0" className={`${inputCls} mt-1`} value={credits} onChange={(e) => setCredits(e.target.value)} autoFocus />
        </label>
        <label className="block">
          <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Reason (shown in the credit history)</span>
          <input className={`${inputCls} mt-1`} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Goodwill for downtime" maxLength={300} />
        </label>
        <button
          type="button"
          disabled={busy || !valid}
          onClick={submit}
          className="w-full h-10 rounded-xl text-sm font-extrabold text-white bg-brand-500 hover:bg-brand-600 disabled:opacity-40 flex items-center justify-center gap-2"
        >
          {busy && <Loader2 className="w-4 h-4 animate-spin" />} Add credits
        </button>
      </div>
    </BottomDrawer>
  );
}

export default function UserDetailDrawer({ userId, onClose, onChanged, onDeleted }) {
  const { user: admin } = useAuth();
  const isSuper = admin?.role === "SUPERADMIN";
  const [data, setData] = useState(null);
  const [action, setAction] = useState(null);
  const [panel, setPanel] = useState(null);
  // Parent passes a fresh onClose each render; keep the latest without refetching
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await AdminAPI.getUser(userId);
      setData(res.data);
    } catch (err) {
      toast.error(apiError(err, "Couldn't load user"));
      onCloseRef.current();
    }
  }, [userId]);

  useEffect(() => {
    setData(null);
    load();
  }, [load]);

  if (!userId) return null;

  const sub = data?.subscription;
  const live = sub && (sub.status === "TRIAL" || sub.status === "ACTIVE");
  const isPending = data?.kind === "PENDING_SIGNUP";
  const usage = data?.usage;
  const actionRow = data?.pharmacy?.id ? { pharmacy_id: data.pharmacy.id, pharmacy_name: data.pharmacy.name, subscription: sub } : null;

  // Share of the current term already used, for the progress bar
  let usedPct = null;
  if (live && sub.starts_at && sub.ends_at) {
    const total = new Date(sub.ends_at) - new Date(sub.starts_at);
    usedPct = Math.min(100, Math.max(0, ((Date.now() - new Date(sub.starts_at)) / total) * 100));
  }

  return (
    <>
      <BottomDrawer isOpen onClose={onClose} title={data?.user?.name || "User"} subtitle={data?.user?.email} maxWidth="max-w-3xl">
        {!data ? (
          <div className="py-16 flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
          </div>
        ) : (
          <div className="space-y-5 text-xs">
            {/* Identity */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="flex items-center gap-1.5 font-semibold text-slate-700 min-w-0">
                <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="truncate">{data.user.email}</span>
              </div>
              <div className="flex items-center gap-1.5 font-semibold text-slate-700">
                <Phone className="w-3.5 h-3.5 text-slate-400" /> {data.user.mobile || "—"}
              </div>
              <div className="flex items-center gap-1.5 font-semibold text-slate-700 min-w-0">
                <Building className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="truncate">{data.pharmacy?.name || "—"}</span>
              </div>
              <div className="flex items-center gap-1.5 font-semibold text-slate-700">
                <UserRound className="w-3.5 h-3.5 text-slate-400" /> {data.user.is_primary_admin ? "Owner" : data.user.role}
              </div>
              <div className="text-slate-500">Registered {fmtDate(data.user.created_at)}</div>
              <div className="text-slate-500">Last sign-in {data.user.last_login_at ? ago(data.user.last_login_at) : "—"}</div>
              {usage && <div className="text-slate-500">Last activity {ago(usage.last_active_at)}</div>}
              {data.owner && <div className="text-slate-500 truncate">Owner: {data.owner.name}</div>}
            </div>

            {/* Funnel stage */}
            <div className={`p-4 rounded-2xl border ${TONE[data.stage.tone]}`}>
              <div className="text-sm font-black">{data.stage.label}</div>
              <div className="mt-0.5 font-semibold opacity-90">{data.stage.detail}</div>
              {usage?.during_trial && (
                <div className="mt-2 font-semibold">
                  During the trial: {usage.during_trial.bills} bills, {usage.during_trial.purchases} purchases, {usage.during_trial.inventory} inventory
                  items, {usage.during_trial.customers} customers.
                </div>
              )}
              {isPending && data.otp && (
                <div className="mt-2 font-semibold">
                  Codes sent: {data.otp.sends} · wrong code attempts: {data.otp.wrong_attempts}
                </div>
              )}
            </div>

            {/* Subscription */}
            {!isPending && (
              <section className="p-4 rounded-2xl border border-slate-200 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="font-black text-slate-900 text-sm">Subscription</h4>
                  <StatusPill sub={sub} />
                </div>
                {data.payments_summary?.payments > 0 && (
                  <div className="flex flex-wrap items-baseline justify-between gap-2 p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                    <div>
                      <div className="text-[10px] font-bold text-emerald-700 uppercase">Total paid</div>
                      <div className="text-xl font-black text-emerald-800">{inrPaise(data.payments_summary.total_paid_paise)}</div>
                    </div>
                    <div className="text-[11px] font-semibold text-emerald-800 text-right">
                      {data.payments_summary.payments} payment{data.payments_summary.payments === 1 ? "" : "s"}
                      {data.payments_summary.last_paid_at ? ` · last ${fmtDate(data.payments_summary.last_paid_at)}` : ""}
                      {data.payments_summary.discount_codes.length ? (
                        <div>Codes used: {data.payments_summary.discount_codes.join(", ")}</div>
                      ) : null}
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase">Started</div>
                    <div className="font-bold text-slate-800">{fmtDate(sub.starts_at)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase">{sub.status === "EXPIRED" ? "Ended" : "Ends"}</div>
                    <div className="font-bold text-slate-800">{fmtDateTime(sub.ends_at)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase">Time left</div>
                    <div className={`font-black ${live && sub.days_left <= 2 ? "text-rose-600" : "text-slate-900"}`}>
                      {live ? `${sub.days_left} day(s)` : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase">Free trial</div>
                    <div className="font-bold text-slate-800">
                      {sub.trial_claimed_at ? `Used ${fmtDate(sub.trial_claimed_at)}` : sub.trial_used ? "Used" : "Not used"}
                    </div>
                  </div>
                </div>
                {usedPct !== null && (
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div className={`h-full ${sub.status === "TRIAL" ? "bg-amber-400" : "bg-emerald-500"}`} style={{ width: `${usedPct}%` }} />
                  </div>
                )}
                {actionRow && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {sub.plan && (
                      <button
                        onClick={() => setAction("extend")}
                        className="flex items-center gap-1 px-3 py-2 text-[11px] font-bold rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
                      >
                        <CalendarPlus className="w-3.5 h-3.5" /> {sub.status === "TRIAL" ? "Extend trial" : "Extend subscription"}
                      </button>
                    )}
                    {live && (
                      <button
                        onClick={() => setAction("change")}
                        className="flex items-center gap-1 px-3 py-2 text-[11px] font-bold rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
                      >
                        <ArrowUpDown className="w-3.5 h-3.5" /> Upgrade / change plan
                      </button>
                    )}
                    <button
                      onClick={() => setAction("grant")}
                      className="flex items-center gap-1 px-3 py-2 text-[11px] font-bold rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
                    >
                      <Gift className="w-3.5 h-3.5" /> Grant plan
                    </button>
                    {live && (
                      <button
                        onClick={() => setAction("end")}
                        className="flex items-center gap-1 px-3 py-2 text-[11px] font-bold rounded-xl bg-white border border-rose-200 text-rose-600 hover:bg-rose-50"
                      >
                        <ShieldOff className="w-3.5 h-3.5" /> {sub.status === "TRIAL" ? "End trial" : "End subscription"}
                      </button>
                    )}
                  </div>
                )}
                {!data.user.is_primary_admin && (
                  <p className="text-[11px] text-slate-500">Staff account: the plan belongs to the pharmacy and changes apply to everyone in it.</p>
                )}
              </section>
            )}

            {/* AI credits */}
            {!isPending && data.pharmacy?.id && (
              <section className="p-4 rounded-2xl border border-slate-200 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="font-black text-slate-900 text-sm flex items-center gap-1.5">
                    <Coins className="w-4 h-4 text-amber-500" /> AI credits
                  </h4>
                  <div className="text-slate-500 mt-0.5">
                    Balance <b className="text-slate-900">{data.credits?.balance ?? 0}</b> · shared by the pharmacy
                  </div>
                </div>
                {isSuper && (
                  <button
                    onClick={() => setPanel("credits")}
                    className="flex items-center gap-1 px-3 py-2 text-[11px] font-bold rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add credits
                  </button>
                )}
              </section>
            )}

            {/* Usage */}
            {usage && (
              <section className="space-y-2">
                <h4 className="font-black text-slate-900 text-sm">What they've done in the app</h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <Stat
                    icon={Receipt}
                    label="Bills"
                    value={usage.counts.bills}
                    sub={usage.counts.bills ? `${inr(usage.bills.total_amount)} · last ${ago(usage.bills.last_at)}` : "None yet"}
                  />
                  <Stat
                    icon={ShoppingCart}
                    label="Purchases"
                    value={usage.counts.purchases}
                    sub={usage.counts.purchases ? `${inr(usage.purchases.total_amount)} · last ${ago(usage.purchases.last_at)}` : "None yet"}
                  />
                  <Stat icon={Boxes} label="Inventory" value={usage.counts.inventory} sub="batches" />
                  <Stat icon={Package} label="Products" value={usage.counts.products} sub="in catalog" />
                  <Stat icon={Users} label="Customers" value={usage.counts.customers} />
                  <Stat icon={Truck} label="Suppliers" value={usage.counts.suppliers} />
                  <Stat icon={UserRound} label="Staff" value={usage.counts.staff} />
                  <Stat icon={Activity} label="Actions logged" value={usage.counts.activities} />
                </div>
              </section>
            )}

            {/* Timeline */}
            <section className="space-y-2">
              <h4 className="font-black text-slate-900 text-sm flex items-center gap-1.5">
                <Clock className="w-4 h-4" /> Timeline
              </h4>
              <ol className="relative border-l border-slate-200 ml-1.5 space-y-3">
                {data.timeline.map((e, i) => (
                  <li key={i} className="ml-4">
                    <span className={`absolute -left-[5px] mt-1 w-2.5 h-2.5 rounded-full ${EVENT_DOT[e.type] || "bg-slate-300"}`} />
                    <div className="font-bold text-slate-800">
                      {e.label}
                      {e.amount_paise ? <span className="text-slate-500 font-semibold"> · {inrPaise(e.amount_paise)}</span> : null}
                      {e.credit_days ? <span className="text-slate-500 font-semibold"> · +{e.credit_days} credit days</span> : null}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {fmtDateTime(e.at)}
                      {e.by ? ` · by ${e.by}` : ""}
                      {e.reason ? ` · “${e.reason}”` : ""}
                    </div>
                  </li>
                ))}
              </ol>
            </section>

            {/* Payments */}
            {data.orders?.length > 0 && (
              <section className="space-y-2">
                <h4 className="font-black text-slate-900 text-sm flex items-center gap-1.5">
                  <FileText className="w-4 h-4" /> Payments
                </h4>
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl">
                  {data.orders.map((o) => (
                    <div key={o.order_id} className="p-3 flex items-start justify-between gap-3">
                      <div>
                        <div className="font-bold text-slate-800">
                          {o.plan} · {o.status}
                          {o.last_payment_status && o.status !== "PAID" ? ` (${o.last_payment_status})` : ""}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {o.order_id} · {fmtDateTime(o.created_at)}
                          {o.promo_code ? ` · code ${o.promo_code}` : ""}
                        </div>
                      </div>
                      <span className="font-black text-slate-900">{inrPaise(o.amount_paise)}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Recent activity */}
            {usage?.recent_activity?.length > 0 && (
              <section className="space-y-2">
                <h4 className="font-black text-slate-900 text-sm flex items-center gap-1.5">
                  <Activity className="w-4 h-4" /> Recent activity
                </h4>
                <ul className="space-y-1.5">
                  {usage.recent_activity.map((a, i) => (
                    <li key={i} className="flex items-start justify-between gap-3">
                      <span className="text-slate-700 font-semibold">
                        {a.description || `${a.action} ${a.module}`}
                        {a.user_name ? <span className="text-slate-400"> · {a.user_name}</span> : null}
                      </span>
                      <span className="text-[10px] text-slate-400 shrink-0">{ago(a.created_at)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Danger zone */}
            {!isPending && isSuper && (
              <section className="p-4 rounded-2xl border border-rose-200 bg-rose-50/40 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="font-black text-rose-700 text-sm">Offboard & delete</h4>
                  <div className="text-slate-600 mt-0.5">
                    {data.user.is_primary_admin
                      ? "Permanently deletes this owner, their pharmacy, staff logins and all its data."
                      : "Permanently deletes this login. The pharmacy's data stays."}
                  </div>
                </div>
                <button
                  onClick={() => setPanel("offboard")}
                  className="flex items-center gap-1 px-3 py-2 text-[11px] font-bold rounded-xl bg-white border border-rose-300 text-rose-600 hover:bg-rose-50"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Offboard & delete
                </button>
              </section>
            )}
          </div>
        )}
      </BottomDrawer>

      {panel === "credits" && data?.pharmacy && (
        <GrantCreditsDrawer
          user={data.user}
          pharmacy={data.pharmacy}
          balance={data.credits?.balance}
          onClose={() => setPanel(null)}
          onDone={() => {
            setPanel(null);
            load();
          }}
        />
      )}

      {panel === "offboard" && (
        <OffboardUserModal
          userId={userId}
          onClose={() => setPanel(null)}
          onDeleted={() => {
            setPanel(null);
            onDeleted?.();
          }}
        />
      )}

      {action && actionRow && (
        <SubscriptionActionDrawer
          action={action}
          row={actionRow}
          onClose={() => setAction(null)}
          onDone={() => {
            setAction(null);
            load();
            onChanged?.();
          }}
        />
      )}
    </>
  );
}
