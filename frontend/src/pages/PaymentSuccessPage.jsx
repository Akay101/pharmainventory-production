import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, ArrowRight } from "lucide-react";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";

export default function PaymentSuccessPage() {
  const navigate = useNavigate();
  const [countdown, setCountdown] = useState(3);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    const redirect = setTimeout(() => {
      navigate("/dashboard");
    }, 3000);

    return () => {
      clearInterval(timer);
      clearTimeout(redirect);
    };
  }, [navigate]);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-green-400/20 rounded-full blur-3xl opacity-50 animate-pulse pointer-events-none" />
      
      <div className="max-w-md w-full relative z-10 animate-in fade-in slide-in-from-bottom-8 duration-700">
        <Card className="border-0 shadow-2xl bg-white/80 backdrop-blur-xl">
          <CardContent className="pt-10 pb-8 px-8 text-center flex flex-col items-center">
            {/* Success Icon */}
            <div className="relative mb-6">
              <div className="absolute inset-0 bg-green-100 rounded-full animate-ping opacity-75" />
              <div className="relative bg-green-100 text-green-600 p-4 rounded-full">
                <CheckCircle2 className="w-12 h-12" />
              </div>
            </div>

            <h2 className="text-3xl font-extrabold text-slate-900 mb-3 tracking-tight">
              Payment Successful!
            </h2>
            <p className="text-slate-500 mb-8 max-w-[280px]">
              Thank you for upgrading. Your account has been instantly activated with your new plan features.
            </p>

            <div className="w-full bg-slate-100 rounded-full h-1.5 mb-6 overflow-hidden">
              <div 
                className="bg-green-500 h-full rounded-full transition-all duration-1000 ease-linear"
                style={{ width: `${((3 - countdown) / 3) * 100}%` }}
              />
            </div>

            <Button 
              onClick={() => navigate("/dashboard")} 
              className="w-full group"
              size="lg"
            >
              Go to Dashboard Now
              <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
            </Button>
            
            <p className="text-xs text-slate-400 mt-4 h-4">
              {countdown > 0 ? `Redirecting automatically in ${countdown}s...` : "Redirecting..."}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
