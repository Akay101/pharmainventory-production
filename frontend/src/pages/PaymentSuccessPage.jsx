import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { CheckCircle2, ArrowRight, XCircle, Loader2 } from "lucide-react";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import axios from "axios";
import { API } from "../App";

export default function PaymentSuccessPage() {
  const location = useLocation();
  const [countdown, setCountdown] = useState(3);
  const [status, setStatus] = useState("verifying"); // verifying | success | error

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const order_id = searchParams.get("order_id");

    if (!order_id) {
      setStatus("error");
      return;
    }

    const verifyPayment = async () => {
      try {
        const res = await axios.post(
          `${API}/payments/verify`,
          { order_id },
          { headers: { Authorization: `Bearer ${localStorage.getItem("pharmalogy_token")}` } }
        );
        if (res.data.status === "already_processed" || res.data.status === "success") {
          setStatus("success");
        } else {
          setStatus("error");
        }
      } catch (err) {
        console.error(err);
        setStatus("error");
      }
    };
    verifyPayment();
  }, [location]);

  useEffect(() => {
    if (status !== "success") return;

    const timer = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    const redirect = setTimeout(() => {
      window.location.href = "/dashboard";
    }, 3000);

    return () => {
      clearInterval(timer);
      clearTimeout(redirect);
    };
  }, [status]);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 relative overflow-hidden">
      {/* Background decoration */}
      <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full blur-3xl opacity-50 animate-pulse pointer-events-none ${status === "success" ? "bg-green-400/20" : status === "error" ? "bg-red-400/20" : "bg-blue-400/20"}`} />
      
      <div className="max-w-md w-full relative z-10 animate-in fade-in slide-in-from-bottom-8 duration-700">
        <Card className="border-0 shadow-2xl bg-white/80 backdrop-blur-xl">
          <CardContent className="pt-10 pb-8 px-8 text-center flex flex-col items-center">
            
            {status === "verifying" && (
              <>
                <div className="relative mb-6">
                  <div className="relative bg-blue-100 text-blue-600 p-4 rounded-full">
                    <Loader2 className="w-12 h-12 animate-spin" />
                  </div>
                </div>
                <h2 className="text-2xl font-extrabold text-slate-900 mb-3 tracking-tight">Verifying Payment...</h2>
                <p className="text-slate-500 mb-8 max-w-[280px]">Please hold on while we confirm your payment securely.</p>
              </>
            )}

            {status === "success" && (
              <>
                <div className="relative mb-6">
                  <div className="absolute inset-0 bg-green-100 rounded-full animate-ping opacity-75" />
                  <div className="relative bg-green-100 text-green-600 p-4 rounded-full">
                    <CheckCircle2 className="w-12 h-12" />
                  </div>
                </div>
                <h2 className="text-3xl font-extrabold text-slate-900 mb-3 tracking-tight">Payment Successful!</h2>
                <p className="text-slate-500 mb-8 max-w-[280px]">Your account has been instantly activated with your new plan features!</p>
                <div className="w-full bg-slate-100 rounded-full h-1.5 mb-6 overflow-hidden">
                  <div className="bg-green-500 h-full rounded-full transition-all duration-1000 ease-linear" style={{ width: `${((3 - countdown) / 3) * 100}%` }} />
                </div>
                <Button onClick={() => window.location.href = "/dashboard"} className="w-full group" size="lg">
                  Go to Dashboard Now
                  <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                </Button>
                <p className="text-xs text-slate-400 mt-4 h-4">
                  {countdown > 0 ? `Redirecting automatically in ${countdown}s...` : "Redirecting..."}
                </p>
              </>
            )}

            {status === "error" && (
              <>
                <div className="relative mb-6">
                  <div className="relative bg-red-100 text-red-600 p-4 rounded-full">
                    <XCircle className="w-12 h-12" />
                  </div>
                </div>
                <h2 className="text-2xl font-extrabold text-slate-900 mb-3 tracking-tight">Verification Failed</h2>
                <p className="text-slate-500 mb-8 max-w-[280px]">We couldn't confirm your payment automatically. If the amount was deducted from your account, please contact support.</p>
                <Button onClick={() => window.location.href = "/dashboard"} className="w-full group bg-slate-900" size="lg">
                  Return to Dashboard
                </Button>
              </>
            )}

          </CardContent>
        </Card>
      </div>
    </div>
  );
}
