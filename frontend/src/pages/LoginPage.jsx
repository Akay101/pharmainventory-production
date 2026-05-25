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
} from "lucide-react";

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
      className="min-h-screen w-full grid grid-cols-1 md:grid-cols-12 bg-background select-none overflow-hidden"
      data-testid="login-page"
    >
      {/* Left Panel: Aesthetic Brand Sidebar (Hidden on mobile) */}
      <div className="hidden md:flex md:col-span-6 lg:col-span-7 bg-zinc-950/20 border-r border-border/50 p-12 flex-col justify-between relative overflow-hidden">
        {/* Soft, lightweight ambient lights (GPU accelerated, no heavy blur-3xl lag) */}
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-gradient-to-br from-primary/10 to-transparent pointer-events-none transform translate-z-0"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-gradient-to-tl from-accent/5 to-transparent pointer-events-none transform translate-z-0"></div>

        {/* Header Logo */}
        <div className="flex items-center gap-3 relative z-10">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
            <Activity className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="font-extrabold text-xl tracking-tight text-foreground bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text">
            Test Instance - Pharmacy management software
          </span>
        </div>

        {/* Hero Section */}
        <div className="my-auto space-y-8 relative z-10 max-w-lg">
          <div className="space-y-4">
            <h1 className="text-4xl lg:text-5xl font-black tracking-tight text-foreground leading-[1.1]">
              Streamlining <br />
              <span className="text-primary bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                Pharmacy Intelligence.
              </span>
            </h1>
            <p className="text-muted-foreground text-base lg:text-lg font-medium leading-relaxed">
              Experience the next generation of smart pharmacy management. Scan,
              log, track, and bill in real-time.
            </p>
          </div>

          {/* Simple Vector Mockup Box - Highly Performant CSS */}
          <div className="rounded-xl border border-border/60 bg-card/40 backdrop-blur-md p-6 space-y-4 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-border/40 pb-3">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-red-500/80"></span>
                <span className="w-3 h-3 rounded-full bg-yellow-500/80"></span>
                <span className="w-3 h-3 rounded-full bg-green-500/80"></span>
              </div>
              <span className="text-[10px] font-mono text-muted-foreground/60 uppercase tracking-widest">
                AI DETECTION
              </span>
            </div>

            <div className="space-y-3">
              <div className="h-2 w-3/4 rounded bg-primary/20 animate-pulse"></div>
              <div className="h-2 w-1/2 rounded bg-muted"></div>
              <div className="grid grid-cols-3 gap-2 pt-2">
                <div className="h-8 rounded bg-card border border-border/40 flex items-center justify-center">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 mr-1.5"></span>
                  <span className="text-[8px] font-mono opacity-60">
                    Stock OK
                  </span>
                </div>
                <div className="h-8 rounded bg-card border border-border/40 flex items-center justify-center col-span-2">
                  <span className="text-[8px] font-mono text-primary font-bold">
                    Autofill Using AI
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Core Highlights */}
          <div className="space-y-3 pt-2">
            {[
              "AI-Powered Bill Scanner with OCR Extraction",
              "Real-time Inventory Tracking and Expiry Alerts",
              "Your Debts and Cashflow Management on your tips",
              "Real Time Analytics and One-Click Overview Reports",
            ].map((text, i) => (
              <div
                key={i}
                className="flex items-center gap-3 text-sm text-foreground/80 font-medium"
              >
                <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                <span>{text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="text-xs text-muted-foreground/60 font-medium relative z-10">
          © {new Date().getFullYear()} Krishna Medicose Inc. All rights
          reserved.
        </div>
      </div>

      {/* Right Panel: Clean, Modern Login Form */}
      <div className="col-span-12 md:col-span-6 lg:col-span-5 flex items-center justify-center p-6 sm:p-12 bg-background relative">
        {/* Decorative backdrop light on mobile only */}
        <div className="md:hidden absolute top-[-20%] right-[-20%] w-[60%] h-[60%] rounded-full bg-primary/5 pointer-events-none blur-3xl"></div>

        <div className="w-full max-w-md space-y-8 relative z-10">
          {/* Header Mobile Logo */}
          <div className="md:hidden flex flex-col items-center text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
              <Activity className="w-6 h-6 text-primary-foreground" />
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
            <p className="text-muted-foreground text-sm font-medium">
              Enter your credentials to access your store dashboard.
            </p>
          </div>

          {/* Form Container */}
          <div className="bg-card/40 md:bg-transparent border border-border/50 md:border-0 rounded-2xl p-6 sm:p-8 md:p-0 shadow-xl md:shadow-none space-y-6">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label
                  htmlFor="email"
                  className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80"
                >
                  Email Address
                </Label>
                <div className="relative group">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 group-focus-within:text-primary transition-colors">
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
                    className="pl-10 h-11 border-border/80 focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary transition-all bg-card/25"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label
                    htmlFor="password"
                    className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80"
                  >
                    Password
                  </Label>
                </div>
                <div className="relative group">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 group-focus-within:text-primary transition-colors">
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
                    className="pl-10 pr-10 h-11 border-border/80 focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary transition-all bg-card/25"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 hover:bg-muted text-muted-foreground/50 hover:text-foreground"
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
                className="w-full btn-primary h-11 font-bold text-sm bg-primary hover:bg-primary/95 text-primary-foreground shadow-lg shadow-primary/10 transition-all hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] mt-2"
                disabled={loading}
                data-testid="login-submit-btn"
              >
                {loading ? (
                  <div className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-primary-foreground" />
                    <span>Signing in...</span>
                  </div>
                ) : (
                  <span>Sign In</span>
                )}
              </Button>
            </form>

            <div className="text-center text-sm font-medium text-muted-foreground pt-2">
              Don't have an account?{" "}
              <Link
                to="/register"
                className="text-primary hover:underline font-bold transition-all hover:text-primary/90"
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
