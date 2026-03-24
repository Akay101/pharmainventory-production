import { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { API, useAuth } from "../App";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { toast } from "sonner";
import { Check, Sparkles, Zap, Shield, LogOut } from "lucide-react";

const plans = [
  {
    name: "BASIC",
    rank: 1,
    price: parseInt(process.env.REACT_APP_PLAN_BASIC_PRICE) || 20,
    description: "Essential tools for small pharmacies to streamline operations.",
    icon: <Shield className="w-6 h-6 text-blue-500" />,
    features: [
      "Up to 1,000 Invoices per year",
      "Standard Inventory Management",
      "Basic Analytics Dashboard",
      "Email Support",
    ],
    iconBg: "bg-blue-100",
    theme: "light",
    gradientClass: "bg-gradient-to-br from-white/90 to-blue-50/50 border border-white/60",
    textClass: "text-slate-900",
    subTextClass: "text-slate-500",
  },
  {
    name: "ADVANCED",
    rank: 2,
    price: parseInt(process.env.REACT_APP_PLAN_ADV_PRICE) || 40,
    popular: true,
    description: "Advanced tracking and metrics for growing pharmacy businesses.",
    icon: <Zap className="w-6 h-6 text-indigo-300" />,
    features: [
      "Unlimited Invoices",
      "Real-time Inventory Alerts",
      "Advanced Sales Forecasting",
      "Priority 24/7 Support",
      "Multi-user Access",
    ],
    iconBg: "bg-indigo-900/50 backdrop-blur-sm",
    theme: "dark",
    gradientClass: "bg-gradient-to-br from-indigo-900 via-purple-900 to-slate-900 border border-indigo-500/30",
    textClass: "text-white",
    subTextClass: "text-indigo-200",
  },
  {
    name: "AGENTIC",
    rank: 3,
    price: parseInt(process.env.REACT_APP_PLAN_AGENTIC_PRICE) || 80,
    description: "AI-powered automation for maximum efficiency and growth.",
    icon: <Sparkles className="w-6 h-6 text-purple-500" />,
    features: [
      "Everything in Advanced",
      "AI Inventory Predictions",
      "Automated Supplier Reordering",
      "Custom Data Integrations",
      "Dedicated Account Manager",
    ],
    iconBg: "bg-purple-100",
    theme: "light",
    gradientClass: "bg-gradient-to-br from-white/90 to-purple-50/50 border border-white/60",
    textClass: "text-slate-900",
    subTextClass: "text-slate-500",
  },
];

export default function UpgradePage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [loadingPlan, setLoadingPlan] = useState(null);
  const [promoCode, setPromoCode] = useState("");
  const [isApplyingPromo, setIsApplyingPromo] = useState(false);

  const currentPlanName = user?.subscription_plan;
  const currentPlan = plans.find((p) => p.name === currentPlanName);
  const currentRank = currentPlan ? currentPlan.rank : 0;

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const handleBuy = async (plan) => {
    try {
      setLoadingPlan(plan);

      const res = await axios.post(`${API}/payments/create-order`, {
        plan,
      });

      const { payment_session_id } = res.data;

      // 🚀 Load Cashfree checkout
      const cashfree = new window.Cashfree({
        mode: process.env.REACT_APP_CASHFREE_MODE || "sandbox",
      });

      cashfree.checkout({
        paymentSessionId: payment_session_id,
        redirectTarget: "_self",
      });
    } catch (err) {
      console.error(err);
      toast.error("Payment failed");
    } finally {
      setLoadingPlan(null);
    }
  };

  const handleApplyPromo = async () => {
    if (!promoCode.trim()) {
      toast.error("Please enter a promo code");
      return;
    }
    try {
      setIsApplyingPromo(true);
      const res = await axios.post(`${API}/payments/apply-code`, {
        code: promoCode.trim().toUpperCase(),
      });
      toast.success(res.data.message || "Promo code applied successfully!");
      // Wait for toast then reload correctly
      setTimeout(() => {
        window.location.href = "/dashboard";
      }, 1500);
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.detail || "Invalid or expired promo code");
    } finally {
      setIsApplyingPromo(false);
    }
  };

  return (
    <>
      {/* Inject custom animation keyframes and utilities */}
      <style>{`
        @keyframes blob {
          0% { transform: translate(0px, 0px) scale(1); }
          33% { transform: translate(30px, -50px) scale(1.1); }
          66% { transform: translate(-20px, 20px) scale(0.9); }
          100% { transform: translate(0px, 0px) scale(1); }
        }
        .animate-blob {
          animation: blob 7s infinite alternate ease-in-out;
        }
        .animation-delay-2000 {
          animation-delay: 2s;
        }
        .animation-delay-4000 {
          animation-delay: 4s;
        }
      `}</style>
      
      <div className="min-h-screen bg-slate-50 relative overflow-hidden py-20 px-4 sm:px-6 lg:px-8 flex items-center justify-center">

        {/* Header / Logout */}
        <div className="absolute top-6 right-6 lg:right-10 z-50">
          <Button variant="ghost" onClick={handleLogout} className="bg-white/50 backdrop-blur border border-slate-200/50 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-full px-5 py-2 font-semibold shadow-sm transition-all hover:shadow">
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>
        </div>
        
        {/* Moving Gradient Background */}
        <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
          <div className="absolute top-0 -left-4 w-96 h-96 bg-purple-300 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-blob" />
          <div className="absolute top-0 -right-4 w-96 h-96 bg-yellow-300 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-blob animation-delay-2000" />
          <div className="absolute -bottom-8 left-20 w-96 h-96 bg-pink-300 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-blob animation-delay-4000" />
          <div className="absolute -bottom-8 right-20 w-96 h-96 bg-blue-300 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-blob" />
        </div>

        <div className="relative max-w-7xl mx-auto z-10 w-full">
          <div className="text-center max-w-3xl mx-auto mb-16 animate-in fade-in slide-in-from-bottom-8 duration-700">
            <h1 className="text-5xl md:text-6xl font-extrabold text-slate-900 tracking-tight mb-6 drop-shadow-sm">
              Unlock the Full Potential of <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600">Pharmalogy</span>
            </h1>
            <p className="text-lg md:text-xl text-slate-600 leading-relaxed font-medium">
              Choose the perfect plan to grow your pharmacy. Simple, transparent pricing tailored for modern healthcare teams.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto items-stretch">
            {plans.map((plan, index) => (
              <Card
                key={plan.name}
                className={`relative overflow-hidden transition-all duration-500 hover:shadow-2xl hover:-translate-y-3 ${plan.gradientClass} shadow-xl backdrop-blur-xl animate-in fade-in slide-in-from-bottom-8 flex flex-col`}
                style={{ animationDelay: `${index * 150}ms` }}
              >
                {plan.popular && (
                  <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-pink-500 via-red-500 to-yellow-500" />
                )}
                
                <CardContent className="p-8 flex-1 flex flex-col">
                  {plan.popular && (
                    <span className="inline-block px-4 py-1.5 bg-indigo-500/20 text-indigo-200 text-xs font-bold tracking-wider rounded-full mb-6 uppercase border border-indigo-400/30">
                      MOST POPULAR
                    </span>
                  )}
                  
                  <div className="flex items-center gap-4 mb-6">
                    <div className={`p-3 rounded-2xl shadow-sm ${plan.iconBg}`}>
                      {plan.icon}
                    </div>
                    <h2 className={`text-2xl font-black tracking-tight ${plan.textClass}`}>{plan.name}</h2>
                  </div>
                  
                  <div className="mb-8">
                    <span className={`text-5xl font-black tracking-tighter ${plan.textClass}`}>₹{plan.price.toLocaleString()}</span>
                    <span className={`ml-2 text-lg font-medium ${plan.subTextClass}`}>/year</span>
                  </div>
                  
                  <p className={`mb-8 leading-relaxed font-medium min-h-[50px] ${plan.subTextClass}`}>
                    {plan.description}
                  </p>

                  <Button
                    onClick={() => handleBuy(plan.name)}
                    disabled={loadingPlan === plan.name || plan.rank <= currentRank}
                    className={`w-full mb-10 py-6 text-lg font-bold rounded-xl transition-all duration-300 ring-offset-2 hover:ring-2 ${
                      plan.theme === "dark"
                        ? "bg-white text-indigo-900 hover:bg-slate-50 ring-indigo-400 shadow-[0_0_20px_rgba(255,255,255,0.3)] disabled:bg-indigo-800 disabled:text-indigo-300 disabled:ring-0 disabled:shadow-none"
                        : "bg-slate-900 text-white hover:bg-slate-800 ring-slate-900 shadow-xl shadow-slate-900/10 disabled:bg-slate-200 disabled:text-slate-400 disabled:ring-0 disabled:shadow-none"
                    }`}
                  >
                    {loadingPlan === plan.name ? (
                      <div className="flex items-center gap-3">
                        <div className="w-5 h-5 border-3 border-current border-t-transparent rounded-full animate-spin" />
                        Processing...
                      </div>
                    ) : plan.rank === currentRank ? (
                      "Current Plan"
                    ) : plan.rank < currentRank ? (
                      "Included"
                    ) : (
                      "Upgrade to " + plan.name
                    )}
                  </Button>

                  <div className="space-y-5 mt-auto">
                    {plan.features.map((feature, i) => (
                      <div key={i} className="flex items-start gap-3">
                        <div className={`mt-1 rounded-full p-1 shadow-sm shrink-0 ${
                          plan.theme === "dark" ? "bg-indigo-800 text-green-400" : "bg-white text-green-500 shadow-slate-200/50"
                        }`}>
                          <Check className="w-4 h-4 stroke-[3]" />
                        </div>
                        <span className={`text-base font-medium leading-relaxed ${
                          plan.theme === "dark" ? "text-indigo-100" : "text-slate-700"
                        }`}>{feature}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Promo Code Section */}
          <div className="mt-16 max-w-lg mx-auto relative z-10 animate-in fade-in slide-in-from-bottom-8 duration-700" style={{ animationDelay: "500ms" }}>
            <Card className="bg-white/90 backdrop-blur-xl border border-white shadow-xl overflow-hidden rounded-2xl">
              <CardContent className="p-2">
                <div className="flex items-center gap-2 bg-white p-2 rounded-xl border border-slate-100 shadow-sm">
                  <input
                    type="text"
                    value={promoCode}
                    onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                    placeholder="ENTER PROMO CODE"
                    className="flex-1 bg-transparent px-4 py-3 text-slate-700 font-bold focus:outline-none placeholder:text-slate-300 placeholder:font-medium tracking-widest uppercase transition-all"
                  />
                  <Button
                    onClick={handleApplyPromo}
                    disabled={isApplyingPromo}
                    className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-8 py-6 rounded-xl shadow-none transition-all active:scale-95 font-bold border border-indigo-100/50"
                  >
                    {isApplyingPromo ? (
                      <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    ) : (
                      "Apply Code"
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

        </div>
      </div>
    </>
  );
}
