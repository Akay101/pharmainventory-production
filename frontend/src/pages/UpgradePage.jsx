import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import { API, useAuth } from "../App";
import { Button } from "../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { Skeleton } from "../components/ui/skeleton";
import Loader from "../components/Loader";
import ThemeToggle from "../components/ui/ThemeToggle";
import { toast } from "sonner";
import {
  ArrowLeft,
  BadgePercent,
  CalendarClock,
  Check,
  Clock,
  Gift,
  Loader2,
  Lock,
  LogOut,
  ShieldCheck,
  Sparkles,
  Tag,
  X,
  Zap,
  Shield,
} from "lucide-react";

const PLAN_ICONS = { BASIC: Shield, ADVANCED: Zap, AGENTIC: Sparkles };

const formatINR = (paise) => {
  const rupees = (paise || 0) / 100;
  return `₹${rupees.toLocaleString("en-IN", {
    minimumFractionDigits: paise % 100 ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
};

const formatDate = (d) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "";

// "2d 4h 10m" until `to`, ticking every 30s
function useCountdown(to) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!to) return undefined;
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, [to]);
  if (!to) return null;
  const ms = new Date(to) - now;
  if (ms <= 0) return null;
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return d > 0 ? `${d}d ${h}h` : `${h}h ${m}m`;
}

const loadCashfree = () =>
  new Promise((resolve, reject) => {
    if (window.Cashfree) return resolve(window.Cashfree);
    const s = document.createElement("script");
    s.src = "https://sdk.cashfree.com/js/v3/cashfree.js";
    s.onload = () => resolve(window.Cashfree);
    s.onerror = () => reject(new Error("Couldn't load the payment page"));
    document.body.appendChild(s);
  });

function StatusCard({ subscription, plansByCode }) {
  if (!subscription || subscription.status === "NONE") return null;
  const plan = plansByCode[subscription.plan];
  const tone = {
    TRIAL: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    ACTIVE: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    EXPIRED: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
  }[subscription.status];
  const text = {
    TRIAL: `Free trial of ${plan?.name || subscription.plan} · ${subscription.days_left} day${subscription.days_left === 1 ? "" : "s"} left (ends ${formatDate(subscription.ends_at)})`,
    ACTIVE: `${plan?.name || subscription.plan} plan · active until ${formatDate(subscription.ends_at)}`,
    EXPIRED:
      subscription.kind === "TRIAL"
        ? "Your free trial has ended. Choose a plan to keep using DavaDesk."
        : `Your ${plan?.name || subscription.plan} plan ended on ${formatDate(subscription.ends_at)}. Renew to continue.`,
  }[subscription.status];
  return (
    <div className={`mx-auto max-w-3xl rounded-2xl border px-5 py-3 flex items-center gap-3 text-sm font-semibold ${tone}`} data-testid="subscription-status">
      <CalendarClock className="w-5 h-5 shrink-0" />
      <span>{text}</span>
    </div>
  );
}

export default function UpgradePage() {
  const { user, loading: authLoading, logout, fetchUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [catalogue, setCatalogue] = useState(null);
  const [status, setStatus] = useState(null);
  const [loadError, setLoadError] = useState(false);

  const [codeInput, setCodeInput] = useState("");
  const [appliedCode, setAppliedCode] = useState(null);
  const [codeQuotes, setCodeQuotes] = useState({}); // plan -> quote | {error}
  const [applyingCode, setApplyingCode] = useState(false);

  const [summary, setSummary] = useState(null); // quote shown in the checkout dialog
  const [quoting, setQuoting] = useState(null);
  const [paying, setPaying] = useState(false);
  const [startingTrial, setStartingTrial] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoadError(false);
      const [plansRes, statusRes] = await Promise.all([
        axios.get(`${API}/plans`),
        axios.get(`${API}/billing/status`),
      ]);
      setCatalogue(plansRes.data);
      setStatus(statusRes.data);
    } catch (err) {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  const offerCountdown = useCountdown(catalogue?.offer?.ends_at);
  const plansByCode = useMemo(
    () => Object.fromEntries((catalogue?.plans || []).map((p) => [p.code, p])),
    [catalogue]
  );

  if (authLoading) return <Loader fullScreen text="Loading plans..." />;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;

  const sub = status?.subscription;
  const canManage = !!status?.can_manage;
  const isLive = sub && (sub.status === "ACTIVE" || sub.status === "TRIAL");
  const currentPaid = sub?.status === "ACTIVE" && sub?.kind === "PAID" ? plansByCode[sub.plan] : null;

  const buttonState = (plan) => {
    if (!canManage) return { label: "Admin only", disabled: true };
    if (currentPaid && plan.code === currentPaid.code) return { label: "Renew plan", disabled: false };
    if (currentPaid && plan.rank < currentPaid.rank) return { label: "Available after current plan", disabled: true };
    if (isLive && sub.plan === plan.code && sub.status === "TRIAL") return { label: `Buy ${plan.name}`, disabled: false };
    return { label: isLive || sub?.status === "EXPIRED" ? `Choose ${plan.name}` : `Get ${plan.name}`, disabled: false };
  };

  const startTrial = async () => {
    setStartingTrial(true);
    try {
      const res = await axios.post(`${API}/billing/free-trial`);
      await fetchUser();
      toast.success(`Your ${res.data.days}-day free trial is active. We've emailed you the details.`);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      toast.error(err.response?.data?.detail || "Couldn't start the trial");
      load();
    } finally {
      setStartingTrial(false);
    }
  };

  // Access codes activate immediately; discount codes re-price every plan.
  const applyCode = async () => {
    const code = codeInput.trim().toUpperCase();
    if (code.length < 4) {
      toast.error("Enter a valid code");
      return;
    }
    setApplyingCode(true);
    try {
      const res = await axios.post(`${API}/billing/redeem`, { code });
      await fetchUser();
      toast.success(`${plansByCode[res.data.plan]?.name || res.data.plan} activated for ${res.data.days} days`);
      navigate("/dashboard", { replace: true });
      return;
    } catch (err) {
      const errCode = err.response?.data?.code;
      if (errCode !== "NOT_AN_ACCESS_CODE") {
        toast.error(err.response?.data?.detail || "This code is invalid or has expired");
        setApplyingCode(false);
        return;
      }
    }
    // Discount code: quote each plan with it
    const entries = await Promise.all(
      catalogue.plans.map(async (p) => {
        try {
          const r = await axios.post(`${API}/billing/quote`, { plan: p.code, code });
          return [p.code, r.data];
        } catch (e) {
          return [p.code, { error: e.response?.data?.detail || "Not valid for this plan" }];
        }
      })
    );
    const quotes = Object.fromEntries(entries);
    if (Object.values(quotes).every((q) => q.error)) {
      toast.error(Object.values(quotes)[0].error);
      setApplyingCode(false);
      return;
    }
    setCodeQuotes(quotes);
    setAppliedCode(code);
    toast.success(`Code ${code} applied`);
    setApplyingCode(false);
  };

  const clearCode = () => {
    setAppliedCode(null);
    setCodeQuotes({});
    setCodeInput("");
  };

  const openSummary = async (plan) => {
    setQuoting(plan.code);
    try {
      const useCode = appliedCode && !codeQuotes[plan.code]?.error ? appliedCode : undefined;
      const res = await axios.post(`${API}/billing/quote`, { plan: plan.code, code: useCode });
      setSummary({ ...res.data, code: useCode || null });
    } catch (err) {
      toast.error(err.response?.data?.detail || "Couldn't price this plan");
    } finally {
      setQuoting(null);
    }
  };

  const pay = async () => {
    setPaying(true);
    try {
      const res = await axios.post(`${API}/billing/checkout`, {
        plan: summary.plan.code,
        code: summary.code || undefined,
      });
      if (res.data.free) {
        await fetchUser();
        toast.success("Plan activated");
        navigate("/dashboard", { replace: true });
        return;
      }
      const Cashfree = await loadCashfree();
      const cashfree = Cashfree({ mode: res.data.mode });
      // Redirects to Cashfree, then back to /payment-success?order_id=...
      await cashfree.checkout({ paymentSessionId: res.data.payment_session_id, redirectTarget: "_self" });
    } catch (err) {
      toast.error(err.response?.data?.detail || err.message || "Couldn't start the payment");
      setPaying(false);
    }
  };

  const displayPrice = (plan) => {
    const q = appliedCode ? codeQuotes[plan.code] : null;
    if (q && !q.error) return { amount: q.amount_paise, base: q.base_paise, promo: q.promo, offer: q.offer };
    return { amount: plan.amount_paise, base: plan.base_paise, offer: plan.offer, promo: null };
  };

  return (
    <div className="min-h-screen bg-background text-foreground relative overflow-x-hidden" data-testid="upgrade-page">
      {/* Soft brand glow */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(60%_60%_at_50%_0%,rgba(249,115,22,0.18),transparent)]" />

      {/* Top bar */}
      <header className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 pt-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <img src="/assets/svgs/logoBrand/logoOnlyWithoutBackground.svg" alt="DavaDesk" className="w-10 h-10 shrink-0" />
          <div className="min-w-0">
            <p className="font-extrabold leading-tight">DavaDesk</p>
            <p className="text-xs text-muted-foreground font-semibold truncate">{user.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isLive && (
            <Button variant="outline" className="rounded-full max-md:px-3" onClick={() => navigate("/dashboard")} aria-label="Dashboard">
              <ArrowLeft className="w-4 h-4 mr-1.5 max-md:mr-0" />
              <span className="max-md:hidden">Dashboard</span>
            </Button>
          )}
          <ThemeToggle />
          <Button
            variant="ghost"
            className="rounded-full max-md:px-3"
            aria-label="Logout"
            onClick={async () => {
              await logout();
              navigate("/login");
            }}
          >
            <LogOut className="w-4 h-4 mr-1.5 max-md:mr-0" />
            <span className="max-md:hidden">Logout</span>
          </Button>
        </div>
      </header>

      <main className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 pb-20">
        <section className="text-center max-w-2xl mx-auto pt-12 pb-8 space-y-4">
          <h1 className="text-4xl sm:text-5xl font-black tracking-tight">
            Plans that grow with your{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-amber-500">pharmacy</span>
          </h1>
          <p className="text-muted-foreground text-base sm:text-lg font-medium">
            Billing, inventory, purchases and expiry tracking in one place. Simple yearly pricing, no hidden fees.
          </p>
        </section>

        <div className="space-y-4 mb-10">
          <StatusCard subscription={sub} plansByCode={plansByCode} />

          {catalogue?.offer && (
            <div
              className="mx-auto max-w-3xl rounded-2xl bg-gradient-to-r from-orange-500 to-amber-500 text-white px-5 py-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm font-bold shadow-lg shadow-orange-500/20"
              data-testid="offer-banner"
            >
              <BadgePercent className="w-5 h-5" />
              <span>
                {catalogue.offer.label || "Limited-time offer"}:{" "}
                {catalogue.offer.type === "PERCENT" ? `${catalogue.offer.value}% off` : `${formatINR(catalogue.offer.value)} off`}
                {catalogue.offer.plans?.length ? ` on ${catalogue.offer.plans.map((c) => plansByCode[c]?.name || c).join(", ")}` : " on every plan"}
              </span>
              {offerCountdown && (
                <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-0.5 text-xs">
                  <Clock className="w-3.5 h-3.5" /> ends in {offerCountdown}
                </span>
              )}
            </div>
          )}

          {status?.trial?.eligible && canManage && (
            <div
              className="mx-auto max-w-3xl rounded-3xl border border-orange-500/30 bg-card shadow-xl p-6 sm:p-8 flex flex-col sm:flex-row items-center gap-6"
              data-testid="trial-card"
            >
              <div className="p-4 rounded-2xl bg-orange-500/10 text-orange-500 shrink-0">
                <Gift className="w-8 h-8" />
              </div>
              <div className="flex-1 text-center sm:text-left space-y-1">
                <h2 className="text-xl font-extrabold">Try every feature free for {status.trial.days} days</h2>
                <p className="text-sm text-muted-foreground font-medium">
                  Full access to our top plan. No card needed. We'll remind you a day before it ends.
                </p>
              </div>
              <Button
                onClick={startTrial}
                disabled={startingTrial}
                className="h-12 px-6 rounded-xl font-bold text-white bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 shadow-lg shadow-orange-500/25 shrink-0"
                data-testid="start-trial-btn"
              >
                {startingTrial ? <Loader2 className="w-4 h-4 animate-spin" /> : `Start ${status.trial.days}-day free trial`}
              </Button>
            </div>
          )}

          {status && !canManage && (
            <p className="text-center text-sm font-semibold text-muted-foreground">
              Only your pharmacy admin can change the plan. Ask them to upgrade from this page.
            </p>
          )}
        </div>

        {loadError && (
          <div className="text-center space-y-3 py-10">
            <p className="font-semibold text-muted-foreground">We couldn't load plans right now.</p>
            <Button variant="outline" onClick={load}>
              Try again
            </Button>
          </div>
        )}

        {/* Plans */}
        <div className="grid gap-6 md:grid-cols-3 items-stretch">
          {!catalogue && !loadError
            ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-[520px] rounded-3xl" />)
            : catalogue?.plans.map((plan) => {
                const Icon = PLAN_ICONS[plan.code] || Shield;
                const price = displayPrice(plan);
                const discounted = price.amount < price.base;
                const btn = buttonState(plan);
                const codeError = appliedCode && codeQuotes[plan.code]?.error;
                const isCurrent = isLive && sub.plan === plan.code;
                return (
                  <div
                    key={plan.code}
                    className={`relative flex flex-col rounded-3xl border bg-card p-7 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl ${
                      plan.highlight ? "border-orange-500/60 shadow-orange-500/10 ring-1 ring-orange-500/40" : "border-border"
                    }`}
                    data-testid={`plan-card-${plan.code}`}
                  >
                    {plan.highlight && (
                      <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-orange-500 to-amber-500 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-white shadow">
                        Most popular
                      </span>
                    )}
                    <div className="flex items-center justify-between mb-5">
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-orange-500/10 text-orange-500">
                          <Icon className="w-5 h-5" />
                        </div>
                        <h3 className="text-xl font-extrabold">{plan.name}</h3>
                      </div>
                      {isCurrent && (
                        <span className="rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[11px] font-extrabold px-2.5 py-1">
                          {sub.status === "TRIAL" ? "On trial" : "Current"}
                        </span>
                      )}
                    </div>

                    <div className="mb-1 flex items-end gap-2 flex-wrap">
                      <span className="text-4xl font-black tracking-tight">{formatINR(price.amount)}</span>
                      <span className="text-sm font-semibold text-muted-foreground mb-1">/year</span>
                    </div>
                    <div className="min-h-[22px] mb-4 text-sm font-semibold">
                      {discounted ? (
                        <span className="text-muted-foreground">
                          <span className="line-through mr-2">{formatINR(price.base)}</span>
                          <span className="text-emerald-600 dark:text-emerald-400">
                            Save {formatINR(price.base - price.amount)}
                          </span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">≈ {formatINR(Math.round(price.amount / 12))} per month</span>
                      )}
                    </div>

                    <p className="text-sm text-muted-foreground font-medium mb-6 min-h-[40px]">{plan.description}</p>

                    <Button
                      onClick={() => openSummary(plan)}
                      disabled={btn.disabled || quoting === plan.code}
                      className={`h-12 rounded-xl font-bold mb-2 ${
                        plan.highlight
                          ? "text-white bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 shadow-lg shadow-orange-500/25"
                          : ""
                      }`}
                      variant={plan.highlight ? "default" : "outline"}
                      data-testid={`choose-${plan.code}`}
                    >
                      {quoting === plan.code ? <Loader2 className="w-4 h-4 animate-spin" /> : btn.label}
                    </Button>
                    <p className="min-h-[18px] mb-4 text-xs font-semibold text-center text-muted-foreground">
                      {codeError ? `Code ${appliedCode}: ${codeError}` : ""}
                    </p>

                    <ul className="space-y-3 mt-auto">
                      {plan.features.map((f) => (
                        <li key={f} className="flex items-start gap-2.5 text-sm font-medium">
                          <Check className="w-4 h-4 mt-0.5 text-emerald-500 shrink-0" strokeWidth={3} />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
        </div>

        {/* Codes */}
        {canManage && catalogue && (
          <div className="mt-10 mx-auto max-w-xl">
            {appliedCode ? (
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-bold text-emerald-700 dark:text-emerald-300">
                <span className="flex items-center gap-2">
                  <Tag className="w-4 h-4" /> Code {appliedCode} applied to eligible plans
                </span>
                <button onClick={clearCode} className="p-1 rounded-lg hover:bg-emerald-500/10" aria-label="Remove code">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <form
                className="flex items-center gap-2 rounded-2xl border border-border bg-card p-2 shadow-sm"
                onSubmit={(e) => {
                  e.preventDefault();
                  applyCode();
                }}
              >
                <Tag className="w-4 h-4 ml-3 text-muted-foreground shrink-0" />
                <input
                  value={codeInput}
                  onChange={(e) => setCodeInput(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 32))}
                  placeholder="Have a promo or discount code?"
                  className="flex-1 bg-transparent px-2 py-2.5 text-sm font-bold tracking-wider focus:outline-none placeholder:font-medium placeholder:tracking-normal placeholder:text-muted-foreground"
                  aria-label="Promo code"
                  data-testid="promo-input"
                />
                <Button type="submit" disabled={applyingCode || !codeInput} className="rounded-xl font-bold" data-testid="apply-code-btn">
                  {applyingCode ? <Loader2 className="w-4 h-4 animate-spin" /> : "Apply"}
                </Button>
              </form>
            )}
          </div>
        )}

        <div className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-xs font-semibold text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-500" /> Payments secured by Cashfree
          </span>
          <span className="flex items-center gap-1.5">
            <Lock className="w-4 h-4" /> UPI, cards and netbanking
          </span>
          <span className="flex items-center gap-1.5">
            <Zap className="w-4 h-4 text-amber-500" /> Plan activates as soon as payment succeeds
          </span>
        </div>
      </main>

      {/* Order summary */}
      <Dialog open={!!summary} onOpenChange={(open) => !open && !paying && setSummary(null)}>
        <DialogContent className="sm:max-w-md rounded-3xl" data-testid="order-summary">
          {summary && (
            <>
              <DialogHeader>
                <DialogTitle className="text-xl font-extrabold">{summary.plan.name} plan · 1 year</DialogTitle>
                <DialogDescription>Review your order before paying.</DialogDescription>
              </DialogHeader>
              <div className="space-y-2.5 text-sm font-semibold">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Plan price</span>
                  <span>{formatINR(summary.base_paise)}</span>
                </div>
                {summary.offer && (
                  <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                    <span>{summary.offer.label || "Offer"}</span>
                    <span>− {formatINR(summary.offer.discount_paise)}</span>
                  </div>
                )}
                {summary.promo && (
                  <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                    <span>Code {summary.promo.code}</span>
                    <span>− {formatINR(summary.promo.discount_paise)}</span>
                  </div>
                )}
                <div className="border-t border-border pt-3 flex justify-between text-base font-extrabold">
                  <span>Total</span>
                  <span>{formatINR(summary.amount_paise)}</span>
                </div>
                <div className="rounded-xl bg-muted/60 px-3 py-2.5 text-xs text-muted-foreground space-y-1">
                  <p>
                    Access for <strong className="text-foreground">{summary.total_days} days</strong>
                    {summary.credit_days > 0 && (
                      <>
                        {" "}
                        (includes <strong className="text-foreground">{summary.credit_days} bonus days</strong> for the unused part of
                        your current plan)
                      </>
                    )}
                    , until {formatDate(Date.now() + summary.total_days * 86400000)}.
                  </p>
                  <p>You'll complete the payment on Cashfree's secure page.</p>
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={pay}
                  disabled={paying}
                  className="w-full h-12 rounded-xl font-bold text-white bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600"
                  data-testid="pay-btn"
                >
                  {paying ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : summary.amount_paise === 0 ? (
                    "Activate plan"
                  ) : (
                    <>
                      <Lock className="w-4 h-4 mr-2" /> Pay {formatINR(summary.amount_paise)} securely
                    </>
                  )}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
