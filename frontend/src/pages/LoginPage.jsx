import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../App";
import { Button } from "../components/ui/button";
import WaveInput from "../components/ui/WaveInput";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2, Lock, Mail, ArrowRight } from "lucide-react";
import ThemeToggle from "../components/ui/ThemeToggle";
import FluidLinePattern from "../components/ui/FluidLinePattern";
import AuthLeftPanel from "../components/ui/AuthLeftPanel";

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });
  const [errors, setErrors] = useState({
    email: "",
    password: "",
  });

  // Redirect if already logged in
  if (user) {
    navigate("/dashboard");
    return null;
  }

  const validateForm = () => {
    let valid = true;
    const newErrors = { email: "", password: "" };

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!formData.email.trim()) {
      newErrors.email = "Email is required";
      valid = false;
    } else if (!emailRegex.test(formData.email.trim())) {
      newErrors.email = "Please enter a valid email address";
      valid = false;
    }

    if (!formData.password) {
      newErrors.password = "Password is required";
      valid = false;
    } else if (formData.password.length < 6) {
      newErrors.password = "Password must be at least 6 characters";
      valid = false;
    }

    setErrors(newErrors);
    return valid;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) {
      toast.error("Please resolve form errors before continuing");
      return;
    }

    setLoading(true);
    try {
      await login(formData.email.trim(), formData.password);
      toast.success("Welcome back! Login successful.");
      navigate("/dashboard");
    } catch (error) {
      console.error("Login error:", error);
      const errMsg =
        error.response?.data?.detail || "Invalid email or password";
      toast.error(errMsg);
      setErrors((prev) => ({
        ...prev,
        password: "Authentication failed. Check credentials.",
      }));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen w-full grid grid-cols-1 md:grid-cols-12 bg-background select-none overflow-hidden relative"
      data-testid="login-page"
    >
      {/* Left Panel: Full Background Image Slideshow with Simple Copy */}
      <div className="hidden md:block md:col-span-6 lg:col-span-7 relative overflow-hidden">
        <AuthLeftPanel autoPlayInterval={4500} />
      </div>

      {/* Right Panel: Clean Light Subtle Pattern & Modern Borderless Form */}
      <div className="col-span-12 md:col-span-6 lg:col-span-5 flex items-center justify-center p-6 sm:p-12 bg-background relative overflow-y-auto">
        {/* Soft, Subtle Fluid Pattern Background */}
        <FluidLinePattern />

        {/* Top-Right Theme Toggle Switch */}
        <div className="absolute top-6 right-6 z-20">
          <ThemeToggle />
        </div>

        <div className="w-full max-w-md space-y-8 relative z-10 my-auto">
          {/* Brand Logo & Header */}
          <div className="flex items-center gap-3 animate-stagger-1">
            <img
              src="/assets/svgs/logoBrand/logoOnlyWithoutBackground.svg"
              alt="DavaDesk"
              className="w-12 h-12 object-contain shrink-0 drop-shadow-sm hover:scale-105 transition-transform duration-300"
            />
            <div className="flex flex-col">
              <span className="font-extrabold text-2xl tracking-tight text-foreground leading-tight">
                DavaDesk
              </span>
              <span className="text-xs font-semibold text-muted-foreground">
                Smart Pharmacy Software
              </span>
            </div>
          </div>

          {/* Form Header */}
          <div className="space-y-1.5 pt-1 animate-stagger-2">
            <h2 className="text-3xl font-extrabold tracking-tight text-foreground">
              Sign In
            </h2>
            <p className="text-muted-foreground text-sm font-semibold">
              Enter your credentials to access your pharmacy store workspace.
            </p>
          </div>

          {/* Form Container */}
          <form onSubmit={handleSubmit} className="space-y-6 animate-stagger-3" noValidate>
            {/* Wave Animated Floating Email Input */}
            <WaveInput
              id="email"
              type="email"
              label="Email Address"
              value={formData.email}
              onChange={(e) => {
                setFormData({ ...formData, email: e.target.value });
                if (errors.email) setErrors({ ...errors, email: "" });
              }}
              leftIcon={Mail}
              required
              error={errors.email}
              data-testid="login-email-input"
              autoComplete="email"
            />

            {/* Wave Animated Floating Password Input */}
            <WaveInput
              id="password"
              type={showPassword ? "text" : "password"}
              label="Password"
              value={formData.password}
              onChange={(e) => {
                setFormData({ ...formData, password: e.target.value });
                if (errors.password) setErrors({ ...errors, password: "" });
              }}
              leftIcon={Lock}
              required
              error={errors.password}
              data-testid="login-password-input"
              autoComplete="current-password"
              rightElement={
                <button
                  type="button"
                  tabIndex={-1}
                  className="p-1 text-muted-foreground hover:text-foreground transition-colors rounded-lg focus:outline-none"
                  onClick={() => setShowPassword(!showPassword)}
                  data-testid="toggle-password-btn"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              }
            />

            <Button
              type="submit"
              className="w-full h-12 font-bold text-sm bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white shadow-lg shadow-orange-500/25 transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 rounded-xl border-none mt-4 btn-shine group"
              disabled={loading}
              data-testid="login-submit-btn"
            >
              {loading ? (
                <div className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span>Signing in...</span>
                </div>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  Sign In
                  <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
                </span>
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
  );
}
