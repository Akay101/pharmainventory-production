import { useEffect, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { CheckCircle2, ArrowRight, XCircle, Loader2, Clock } from "lucide-react";
import { Button } from "../components/ui/button";
import axios from "axios";
import { API, useAuth } from "../App";
import Loader from "../components/Loader";

// Cashfree redirects here after checkout. The webhook is the source of truth;
// this page asks the API to reconcile the order and polls briefly while the
// payment settles.
const POLL_DELAYS_MS = [0, 2000, 3000, 5000, 8000, 10000, 15000, 15000];

const ORDER_ID_RE = /^[A-Za-z0-9_-]{3,64}$/;

export default function PaymentSuccessPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, loading: authLoading, fetchUser } = useAuth();
  const [state, setState] = useState({ status: "verifying" });
  const [countdown, setCountdown] = useState(5);
  const cancelled = useRef(false);

  const orderId = new URLSearchParams(location.search).get("order_id") || "";

  useEffect(() => {
    if (authLoading || !user) return undefined;
    cancelled.current = false;
    if (!ORDER_ID_RE.test(orderId)) {
      setState({ status: "error", message: "We couldn't find this payment." });
      return undefined;
    }

    const poll = async () => {
      for (const delay of POLL_DELAYS_MS) {
        if (delay) await new Promise((r) => setTimeout(r, delay));
        if (cancelled.current) return;
        try {
          const res = await axios.post(`${API}/billing/orders/${orderId}/confirm`);
          const { status, reason } = res.data;
          const isCredits = res.data.purpose === "CREDITS";
          if (status === "PAID") {
            if (!isCredits) await fetchUser().catch(() => {});
            setState({ status: "success", subscription: res.data.subscription, credits: isCredits ? res.data.credits : null, wallet: res.data.credit_wallet, isCredits });
            return;
          }
          if (status === "FAILED") {
            setState({
              status: "failed",
              isCredits,
              message:
                reason === "USER_DROPPED" || reason === "CANCELLED"
                  ? "The payment was cancelled. No money was taken."
                  : "The payment didn't go through. If money was deducted, it will be refunded by your bank.",
            });
            return;
          }
          if (status === "EXPIRED" || status === "SUPERSEDED") {
            setState({ status: "failed", isCredits, message: isCredits ? "This checkout has expired. Please buy the credits again from DavaDesk AI." : "This checkout has expired. Please start again from the plans page." });
            return;
          }
        } catch (err) {
          if (err.response?.status === 404) {
            setState({ status: "error", message: "We couldn't find this payment for your account." });
            return;
          }
          // Network blips: keep polling
        }
      }
      setState({ status: "pending" });
    };
    poll();
    return () => {
      cancelled.current = true;
    };
  }, [orderId, authLoading, user?.id]);

  useEffect(() => {
    if (state.status !== "success") return undefined;
    const timer = setInterval(() => setCountdown((c) => (c > 0 ? c - 1 : 0)), 1000);
    const redirect = setTimeout(() => navigate(state.isCredits ? "/assistant" : "/dashboard", { replace: true }), 5000);
    return () => {
      clearInterval(timer);
      clearTimeout(redirect);
    };
  }, [state.status, state.isCredits, navigate]);

  if (authLoading) return <Loader fullScreen text="Confirming your payment..." />;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;

  const views = {
    verifying: {
      icon: <Loader2 className="w-14 h-14 text-orange-500 animate-spin" />,
      title: "Confirming your payment",
      body: "This usually takes a few seconds. Please don't close this page.",
    },
    success: {
      icon: <CheckCircle2 className="w-14 h-14 text-emerald-500" />,
      title: "Payment successful",
      body: state.isCredits
        ? `${Number(state.credits || 0).toLocaleString("en-IN")} AI credits were added${state.wallet ? `; you now have ${Number(state.wallet.available).toLocaleString("en-IN", { maximumFractionDigits: 1 })}` : ""}. Taking you back to DavaDesk AI in ${countdown}s.`
        : state.subscription?.plan
        ? `Your ${state.subscription.plan} plan is active until ${new Date(state.subscription.ends_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}. Taking you to your dashboard in ${countdown}s.`
        : `Your plan is active. Taking you to your dashboard in ${countdown}s.`,
    },
    pending: {
      icon: <Clock className="w-14 h-14 text-amber-500" />,
      title: "Payment is still processing",
      body: "Your bank hasn't confirmed it yet. It will be applied automatically as soon as it does, so please don't pay again. If it doesn't go through, any amount debited is returned by your bank.",
    },
    failed: {
      icon: <XCircle className="w-14 h-14 text-rose-500" />,
      title: "Payment not completed",
      body: state.message,
    },
    error: {
      icon: <XCircle className="w-14 h-14 text-rose-500" />,
      title: "Something went wrong",
      body: state.message,
    },
  };
  const v = views[state.status];

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6" data-testid="payment-result">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card shadow-xl p-8 text-center space-y-5">
        <div className="flex justify-center">{v.icon}</div>
        <h1 className="text-2xl font-extrabold tracking-tight">{v.title}</h1>
        <p className="text-sm text-muted-foreground font-medium leading-relaxed">{v.body}</p>
        <p className="text-[11px] text-muted-foreground font-mono break-all">Order {orderId}</p>
        <div className="flex flex-col gap-2 pt-2">
          {(state.status === "success" || state.status === "pending") && (
            <Button
              className="h-11 rounded-xl font-bold text-white bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600"
              onClick={() => navigate(state.isCredits ? "/assistant" : "/dashboard", { replace: true })}
            >
              {state.isCredits ? "Back to DavaDesk AI" : "Go to dashboard"} <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          )}
          {(state.status === "failed" || state.status === "error" || state.status === "pending") && (
            <Button variant="outline" className="h-11 rounded-xl font-bold" onClick={() => navigate(state.isCredits ? "/assistant" : "/upgrade", { replace: true })}>
              {state.isCredits ? "Back to DavaDesk AI" : "Back to plans"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
