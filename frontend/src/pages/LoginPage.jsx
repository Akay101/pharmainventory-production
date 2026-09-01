import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth, API } from "../App";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { toast } from "sonner";
import {
  Eye,
  EyeOff,
  Loader2,
  Activity,
  CheckCircle2,
  Lock,
  Mail,
  Sparkles,
  Zap,
} from "lucide-react";
import FluidLinePattern from "../components/ui/FluidLinePattern";
import ThemeToggle from "../components/ui/ThemeToggle";
import CornerPattern from "../components/ui/CornerPattern";

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  // Redirect if already logged in
  if (user) {
    navigate("/dashboard");
    return null;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      await login(formData.email, formData.password);
      toast.success("Login successful!");
      navigate("/dashboard");
    } catch (error) {
      console.error("Login error:", error);
      toast.error(error.response?.data?.detail || "Invalid credentials");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen w-full grid grid-cols-1 md:grid-cols-12 bg-background select-none overflow-hidden relative"
      data-testid="login-page"
    >
      {/* Left Panel: Aesthetic Brand Sidebar with Interactive Fluid Wave Mesh */}
      <div className="hidden md:flex md:col-span-6 lg:col-span-7 bg-card/70 dark:bg-zinc-950/75 border-r border-border/80 dark:border-border/50 p-8 lg:p-12 flex-col justify-between relative overflow-hidden transition-colors duration-300">
        {/* Interactive Fluid Line Pattern Canvas Background */}
        <FluidLinePattern />

        {/* Ambient Light Orbs */}
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-gradient-to-br from-orange-500/15 via-amber-500/8 to-transparent pointer-events-none blur-2xl"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-gradient-to-tl from-orange-500/15 via-amber-500/8 to-transparent pointer-events-none blur-2xl"></div>

        {/* Header Logo */}
        <div className="flex items-center gap-3 relative z-10">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shadow-lg shadow-orange-500/25 shrink-0">
            <Activity className="w-5 h-5 text-white" />
          </div>
          <span className="font-extrabold text-lg lg:text-xl tracking-tight text-foreground">
            Test Instance - Pharmacy management software
          </span>
        </div>

        {/* Hero Section */}
        <div className="my-auto space-y-8 relative z-10 max-w-lg py-6">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-orange-500/10 border border-orange-500/30 text-orange-600 dark:text-orange-400 text-xs font-extrabold uppercase tracking-wider shadow-2xs">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Next-Gen Pharmacy OS</span>
            </div>
            <h1 className="text-4xl lg:text-5xl font-black tracking-tight text-foreground leading-[1.12]">
              Streamlining <br />
              <span className="bg-gradient-to-r from-orange-500 via-amber-500 to-orange-600 bg-clip-text text-transparent">
                Pharmacy Intelligence.
              </span>
            </h1>
            <p className="text-muted-foreground text-base lg:text-lg font-semibold leading-relaxed">
              Experience intelligent pharmacy operations. Scan bills with AI OCR, track live batch inventory, and manage cashflows effortlessly.
            </p>
          </div>

          {/* Interactive Feature Mockup Box with Crisp Borders */}
          <div className="rounded-2xl border-2 border-border/90 dark:border-border/70 bg-card/85 dark:bg-card/70 backdrop-blur-xl p-6 space-y-4 shadow-xl relative overflow-hidden group hover:border-orange-500/50 transition-all duration-300">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-500 via-amber-500 to-orange-400 opacity-90" />

            <div className="flex items-center justify-between border-b border-border/70 dark:border-border/50 pb-3">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-red-500/80 shadow-sm"></span>
                <span className="w-3 h-3 rounded-full bg-amber-500/80 shadow-sm"></span>
                <span className="w-3 h-3 rounded-full bg-emerald-500/80 shadow-sm"></span>
              </div>
              <span className="text-[10px] font-mono font-bold text-orange-600 dark:text-orange-400 uppercase tracking-widest flex items-center gap-1.5">
                <Zap className="w-3 h-3" />
                AI DETECTION ENGINE
              </span>
            </div>

            <div className="space-y-3">
              <div className="h-2.5 w-3/4 rounded-full bg-orange-500/25 animate-pulse"></div>
              <div className="h-2 w-1/2 rounded-full bg-muted border border-border/40"></div>
              <div className="grid grid-cols-3 gap-2.5 pt-2">
                <div className="h-9 rounded-xl bg-background border border-border/80 flex items-center justify-center shadow-xs">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 mr-2 animate-ping"></span>
                  <span className="text-[10px] font-bold text-foreground font-mono">
                    Stock OK
                  </span>
                </div>
                <div className="h-9 rounded-xl bg-gradient-to-r from-orange-500/15 to-amber-500/15 border border-orange-500/40 flex items-center justify-center col-span-2 shadow-xs">
                  <span className="text-[10px] font-mono text-orange-600 dark:text-orange-400 font-extrabold flex items-center gap-1">
                    <Sparkles className="w-3 h-3" />
                    Autofill Using AI
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Core Highlights */}
          <div className="grid grid-cols-1 gap-3 pt-1">
            {[
              "AI-Powered Bill Scanner with OCR Extraction",
              "Real-time Inventory Tracking and Expiry Alerts",
              "Your Debts and Cashflow Management on your tips",
              "Real Time Analytics and One-Click Overview Reports",
            ].map((text, i) => (
              <div
                key={i}
                className="flex items-center gap-3 text-sm text-foreground font-semibold"
              >
                <div className="p-1 rounded-full bg-orange-500/15 border border-orange-500/30 shrink-0">
                  <CheckCircle2 className="w-4 h-4 text-orange-500" />
                </div>
                <span>{text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="text-xs text-muted-foreground font-semibold relative z-10">
          © {new Date().getFullYear()} Krishna Medicose Inc. All rights reserved.
        </div>
      </div>

      {/* Right Panel: Clean, Modern Login Form with Theme Toggle & Decorative Corner Pattern */}
      <div className="col-span-12 md:col-span-6 lg:col-span-5 flex items-center justify-center p-6 sm:p-12 bg-background relative overflow-hidden">
        {/* Top-Right Theme Toggle Switch */}
        <div className="absolute top-6 right-6 z-20">
          <ThemeToggle />
        </div>

        {/* Bottom-Right Decorative Corner Pattern */}
        <CornerPattern />

        {/* Decorative backdrop light on mobile */}
        <div className="md:hidden absolute top-[-20%] right-[-20%] w-[60%] h-[60%] rounded-full bg-orange-500/5 pointer-events-none blur-3xl"></div>

        <div className="w-full max-w-md space-y-8 relative z-10">
          {/* Header Mobile Logo */}
          <div className="md:hidden flex flex-col items-center text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shadow-lg shadow-orange-500/25">
              <Activity className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-black tracking-tight text-foreground">
                Test Instance - Pharmacy management software
              </h2>
              <p className="text-muted-foreground text-xs font-semibold">
                Sign in to manage your pharmacy
              </p>
            </div>
          </div>

          {/* Form Header (Desktop only) */}
          <div className="hidden md:block space-y-2">
            <h2 className="text-3xl font-extrabold tracking-tight text-foreground">
              Sign In
            </h2>
            <p className="text-muted-foreground text-sm font-semibold">
              Enter your credentials to access your store dashboard.
            </p>
          </div>

          {/* Form Container with Distinguished Light Mode Borders */}
          <div className="bg-card/90 md:bg-transparent border border-border/80 md:border-0 rounded-2xl p-6 sm:p-8 md:p-0 shadow-xl md:shadow-none space-y-6">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label
                  htmlFor="email"
                  className="text-xs font-bold uppercase tracking-wider text-foreground/90"
                >
                  Email Address
                </Label>
                <div className="relative group">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-orange-500 transition-colors">
                    <Mail className="w-4 h-4" />
                  </span>
                  <Input
                    id="email"
                    type="email"
                    placeholder="name@pharmacy.com"
                    value={formData.email}
                    onChange={(e) =>
                      setFormData({ ...formData, email: e.target.value })
                    }
                    required
                    data-testid="login-email-input"
                    className="pl-10 h-11 border-border/90 dark:border-border/80 focus-visible:ring-1 focus-visible:ring-orange-500 focus-visible:border-orange-500 transition-all bg-background dark:bg-card/25 text-foreground font-semibold rounded-xl shadow-xs"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label
                    htmlFor="password"
                    className="text-xs font-bold uppercase tracking-wider text-foreground/90"
                  >
                    Password
                  </Label>
                </div>
                <div className="relative group">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-orange-500 transition-colors">
                    <Lock className="w-4 h-4" />
                  </span>
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={formData.password}
                    onChange={(e) =>
                      setFormData({ ...formData, password: e.target.value })
                    }
                    required
                    data-testid="login-password-input"
                    className="pl-10 pr-10 h-11 border-border/90 dark:border-border/80 focus-visible:ring-1 focus-visible:ring-orange-500 focus-visible:border-orange-500 transition-all bg-background dark:bg-card/25 text-foreground font-semibold rounded-xl shadow-xs"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-9 w-9 hover:bg-muted text-muted-foreground hover:text-foreground rounded-lg"
                    onClick={() => setShowPassword(!showPassword)}
                    data-testid="toggle-password-btn"
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full h-11 font-bold text-sm bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white shadow-lg shadow-orange-500/25 transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 rounded-xl border-none mt-2"
                disabled={loading}
                data-testid="login-submit-btn"
              >
                {loading ? (
                  <div className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                    <span>Signing in...</span>
                  </div>
                ) : (
                  <span>Sign In</span>
                )}
              </Button>
            </form>

            <div className="text-center text-sm font-semibold text-muted-foreground pt-2">
              Don't have an account?{" "}
              <Link
                to="/register"
                className="text-orange-500 hover:text-orange-600 font-extrabold transition-all underline-offset-4 hover:underline"
                data-testid="register-link"
              >
                Register your pharmacy
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
