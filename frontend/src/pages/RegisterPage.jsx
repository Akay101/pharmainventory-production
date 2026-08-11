import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import axios from "axios";
import { API } from "../App";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "../components/ui/input-otp";
import { toast } from "sonner";
import {
  Eye,
  EyeOff,
  Loader2,
  ArrowLeft,
  ArrowRight,
  Check,
  Activity,
  User,
  Mail,
  Phone,
  Lock,
  Building,
  MapPin,
  FileText,
  Calendar,
  AlertTriangle,
  Sparkles,
} from "lucide-react";
import FluidLinePattern from "../components/ui/FluidLinePattern";
import ThemeToggle from "../components/ui/ThemeToggle";
import CornerPattern from "../components/ui/CornerPattern";

const STEPS = ["Personal Info", "Pharmacy Details", "Verify Email"];

export default function RegisterPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [otp, setOtp] = useState("");
  const [fallbackOtp, setFallbackOtp] = useState(""); // OTP returned when email fails
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    mobile: "",
    password: "",
    pharmacyName: "",
    location: "",
    licenseNo: "",
    yearsOld: "",
  });

  const handleNext = () => {
    if (step === 0) {
      if (
        !formData.name ||
        !formData.email ||
        !formData.mobile ||
        !formData.password
      ) {
        toast.error("Please fill all required fields");
        return;
      }
      if (formData.password.length < 6) {
        toast.error("Password must be at least 6 characters");
        return;
      }
    }
    if (step === 1) {
      if (!formData.pharmacyName || !formData.location) {
        toast.error("Please fill pharmacy name and location");
        return;
      }
      handleRegister();
      return;
    }
    setStep(step + 1);
  };

  const handleBack = () => {
    setStep(step - 1);
  };

  const handleRegister = async () => {
    setLoading(true);
    try {
      const response = await axios.post(`${API}/auth/register`, {
        name: formData.name,
        email: formData.email,
        mobile: formData.mobile,
        password: formData.password,
        pharmacy: {
          name: formData.pharmacyName,
          location: formData.location,
          license_no: formData.licenseNo || null,
          years_old: formData.yearsOld ? parseInt(formData.yearsOld) : null,
        },
      });

      // Check if OTP was returned (email delivery failed)
      if (response.data.otp) {
        setFallbackOtp(response.data.otp);
        toast.warning("Email delivery failed. Your OTP is displayed below.");
      } else {
        toast.success("OTP sent to your email!");
      }
      setStep(2);
    } catch (error) {
      console.error("Registration error:", error);
      toast.error(error.response?.data?.detail || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    if (otp.length !== 6) {
      toast.error("Please enter complete OTP");
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post(`${API}/auth/verify-otp`, {
        email: formData.email,
        otp: otp,
      });
      toast.success("Registration successful!");
      window.location.href = "/dashboard";
    } catch (error) {
      console.error("Verification error:", error);
      toast.error(error.response?.data?.detail || "Invalid OTP");
    } finally {
      setLoading(false);
    }
  };

  const handleResendOTP = async () => {
    setLoading(true);
    try {
      const response = await axios.post(
        `${API}/auth/resend-otp`,
        {
          email: formData.email,
        },
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (response.data.otp) {
        setFallbackOtp(response.data.otp);
        toast.warning("Email delivery failed. OTP displayed below.");
      } else {
        setFallbackOtp("");
        toast.success("OTP resent successfully!");
      }
    } catch (error) {
      console.error("Resend OTP error:", error);
      toast.error(error.response?.data?.detail || "Failed to resend OTP");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen w-full grid grid-cols-1 md:grid-cols-12 bg-background select-none overflow-hidden relative"
      data-testid="register-page"
    >
      {/* Left Panel: Aesthetic Sidebar with Interactive Fluid Wave Mesh */}
      <div className="hidden md:flex md:col-span-5 bg-card/70 dark:bg-zinc-950/75 border-r border-border/80 dark:border-border/50 p-8 lg:p-12 flex-col justify-between relative overflow-hidden transition-colors duration-300">
        {/* Interactive Canvas Line Pattern */}
        <FluidLinePattern />

        {/* Ambient Light Orbs */}
        <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] rounded-full bg-gradient-to-br from-orange-500/15 via-amber-500/8 to-transparent pointer-events-none blur-2xl"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] rounded-full bg-gradient-to-tl from-orange-500/15 via-amber-500/8 to-transparent pointer-events-none blur-2xl"></div>

        {/* Header Logo */}
        <div className="flex items-center gap-3 relative z-10">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shadow-lg shadow-orange-500/25 shrink-0">
            <Activity className="w-5 h-5 text-white" />
          </div>
          <span className="font-extrabold text-lg lg:text-xl tracking-tight text-foreground">
            Pharmacy - Test Instance
          </span>
        </div>

        {/* Dynamic Progress Timeline */}
        <div className="my-auto space-y-8 relative z-10 max-w-sm py-6">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-orange-500/10 border border-orange-500/30 text-orange-600 dark:text-orange-400 text-xs font-extrabold uppercase tracking-wider shadow-2xs">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Workspace Setup</span>
            </div>
            <h1 className="text-3xl lg:text-4xl font-black tracking-tight text-foreground leading-[1.15]">
              Get Started with <br />
              <span className="bg-gradient-to-r from-orange-500 via-amber-500 to-orange-600 bg-clip-text text-transparent">
                Pharmacy Control.
              </span>
            </h1>
            <p className="text-muted-foreground text-sm font-semibold leading-relaxed">
              Create your account and workspace parameters in three simple steps.
            </p>
          </div>

          {/* Step Progress Timeline list with Distinguished Light Mode Borders */}
          <div className="space-y-4 pt-2">
            {STEPS.map((s, i) => {
              const isActive = i === step;
              const isCompleted = i < step;
              return (
                <div
                  key={i}
                  className={`flex items-start gap-4 p-4 rounded-2xl border-2 transition-all duration-300 backdrop-blur-md ${
                    isActive
                      ? "bg-card border-orange-500/50 dark:border-orange-500/40 shadow-md shadow-orange-500/10"
                      : isCompleted
                        ? "bg-card border-border/90 dark:border-border/60 shadow-2xs"
                        : "bg-card/50 border-border/70 dark:border-border/40"
                  }`}
                >
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 transition-all duration-300 ${
                      isCompleted
                        ? "bg-emerald-500 text-white shadow-md shadow-emerald-500/20"
                        : isActive
                          ? "bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-md shadow-orange-500/30"
                          : "bg-muted text-muted-foreground border border-border/80"
                    }`}
                  >
                    {isCompleted ? (
                      <Check className="w-4 h-4 stroke-[3]" />
                    ) : (
                      i + 1
                    )}
                  </div>
                  <div className="space-y-1">
                    <h3
                      className={`text-sm font-extrabold transition-colors ${
                        isActive
                          ? "text-orange-600 dark:text-orange-400"
                          : isCompleted
                            ? "text-foreground"
                            : "text-muted-foreground"
                      }`}
                    >
                      {s}
                    </h3>
                    <p className="text-xs text-muted-foreground font-semibold leading-relaxed">
                      {i === 0 &&
                        "Provide credentials for your secure administrator login."}
                      {i === 1 &&
                        "Configure names, licensing, and database properties."}
                      {i === 2 &&
                        "Authenticate your email using the verification code."}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="text-xs text-muted-foreground font-semibold relative z-10">
          © {new Date().getFullYear()} Krishna Medicose Inc. All rights reserved.
        </div>
      </div>

      {/* Right Panel: Scrollable Input Forms with Theme Toggle & Corner Pattern */}
      <div className="col-span-12 md:col-span-7 flex items-center justify-center p-6 sm:p-12 bg-background relative overflow-y-auto h-screen">
        {/* Top-Right Theme Toggle Switch */}
        <div className="absolute top-6 right-6 z-20">
          <ThemeToggle />
        </div>

        {/* Bottom-Right Decorative Corner Pattern */}
        <CornerPattern />

        {/* Decorative backdrop light on mobile */}
        <div className="md:hidden absolute top-[-20%] right-[-20%] w-[60%] h-[60%] rounded-full bg-orange-500/5 pointer-events-none blur-3xl"></div>

        <div className="w-full max-w-md space-y-8 my-auto relative z-10">
          {/* Header Mobile Logo */}
          <div className="md:hidden flex flex-col items-center text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shadow-lg shadow-orange-500/25">
              <Activity className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-black tracking-tight text-foreground">
                Pharmacy management
              </h2>
              <p className="text-muted-foreground text-xs font-semibold">
                Setup your pharmacy store workspace
              </p>
            </div>

            {/* Mobile progress indicators */}
            <div className="flex items-center gap-1.5 pt-2">
              {STEPS.map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    i === step
                      ? "w-8 bg-orange-500"
                      : i < step
                        ? "w-2 bg-emerald-500"
                        : "w-2 bg-muted"
                  }`}
                ></div>
              ))}
            </div>
          </div>

          {/* Form Header (Desktop only) */}
          <div className="hidden md:block space-y-2">
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-orange-600 dark:text-orange-400 px-3 py-1 bg-orange-500/10 rounded-full border border-orange-500/30 inline-block shadow-2xs">
              Step {step + 1} of 3 • {STEPS[step]}
            </span>
            <h2 className="text-3xl font-extrabold tracking-tight text-foreground pt-2">
              {step === 0 && "Create Account"}
              {step === 1 && "Pharmacy Details"}
              {step === 2 && "Verify Email"}
            </h2>
            <p className="text-muted-foreground text-sm font-semibold">
              {step === 0 && "Enter your contact and security details."}
              {step === 1 && "Set up workspace identifiers."}
              {step === 2 && `We sent a passcode to your verification address.`}
            </p>
          </div>

          {/* Form Content Wrapper with Crisp Light Mode Borders */}
          <div className="bg-card/90 md:bg-transparent border border-border/80 md:border-0 rounded-2xl p-6 sm:p-8 md:p-0 shadow-xl md:shadow-none space-y-6">
            {/* Step 1: Personal Info */}
            {step === 0 && (
              <div className="space-y-5 animate-in fade-in duration-300">
                <div className="space-y-2">
                  <Label
                    htmlFor="name"
                    className="text-xs font-bold uppercase tracking-wider text-foreground/90"
                  >
                    Full Name *
                  </Label>
                  <div className="relative group">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-orange-500 transition-colors">
                      <User className="w-4 h-4" />
                    </span>
                    <Input
                      id="name"
                      placeholder="John Doe"
                      value={formData.name}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                      data-testid="register-name-input"
                      className="pl-10 h-11 border-border/90 dark:border-border/80 focus-visible:ring-1 focus-visible:ring-orange-500 focus-visible:border-orange-500 transition-all bg-background dark:bg-card/25 text-foreground font-semibold rounded-xl shadow-xs"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label
                    htmlFor="email"
                    className="text-xs font-bold uppercase tracking-wider text-foreground/90"
                  >
                    Email Address *
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
                      data-testid="register-email-input"
                      className="pl-10 h-11 border-border/90 dark:border-border/80 focus-visible:ring-1 focus-visible:ring-orange-500 focus-visible:border-orange-500 transition-all bg-background dark:bg-card/25 text-foreground font-semibold rounded-xl shadow-xs"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label
                    htmlFor="mobile"
                    className="text-xs font-bold uppercase tracking-wider text-foreground/90"
                  >
                    Mobile Number *
                  </Label>
                  <div className="relative group">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-orange-500 transition-colors">
                      <Phone className="w-4 h-4" />
                    </span>
                    <Input
                      id="mobile"
                      type="tel"
                      placeholder="+91 9876543210"
                      value={formData.mobile}
                      onChange={(e) =>
                        setFormData({ ...formData, mobile: e.target.value })
                      }
                      data-testid="register-mobile-input"
                      className="pl-10 h-11 border-border/90 dark:border-border/80 focus-visible:ring-1 focus-visible:ring-orange-500 focus-visible:border-orange-500 transition-all bg-background dark:bg-card/25 text-foreground font-semibold rounded-xl shadow-xs"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label
                    htmlFor="password"
                    className="text-xs font-bold uppercase tracking-wider text-foreground/90"
                  >
                    Password *
                  </Label>
                  <div className="relative group">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-orange-500 transition-colors">
                      <Lock className="w-4 h-4" />
                    </span>
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Min 6 characters"
                      value={formData.password}
                      onChange={(e) =>
                        setFormData({ ...formData, password: e.target.value })
                      }
                      data-testid="register-password-input"
                      className="pl-10 pr-10 h-11 border-border/90 dark:border-border/80 focus-visible:ring-1 focus-visible:ring-orange-500 focus-visible:border-orange-500 transition-all bg-background dark:bg-card/25 text-foreground font-semibold rounded-xl shadow-xs"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-9 w-9 hover:bg-muted text-muted-foreground hover:text-foreground rounded-lg"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Pharmacy Details */}
            {step === 1 && (
              <div className="space-y-5 animate-in fade-in duration-300">
                <div className="space-y-2">
                  <Label
                    htmlFor="pharmacyName"
                    className="text-xs font-bold uppercase tracking-wider text-foreground/90"
                  >
                    Pharmacy Name *
                  </Label>
                  <div className="relative group">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-orange-500 transition-colors">
                      <Building className="w-4 h-4" />
                    </span>
                    <Input
                      id="pharmacyName"
                      placeholder="City Pharmacy"
                      value={formData.pharmacyName}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          pharmacyName: e.target.value,
                        })
                      }
                      data-testid="register-pharmacy-name-input"
                      className="pl-10 h-11 border-border/90 dark:border-border/80 focus-visible:ring-1 focus-visible:ring-orange-500 focus-visible:border-orange-500 transition-all bg-background dark:bg-card/25 text-foreground font-semibold rounded-xl shadow-xs"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label
                    htmlFor="location"
                    className="text-xs font-bold uppercase tracking-wider text-foreground/90"
                  >
                    Location *
                  </Label>
                  <div className="relative group">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-orange-500 transition-colors">
                      <MapPin className="w-4 h-4" />
                    </span>
                    <Input
                      id="location"
                      placeholder="123 Main Street, City"
                      value={formData.location}
                      onChange={(e) =>
                        setFormData({ ...formData, location: e.target.value })
                      }
                      data-testid="register-location-input"
                      className="pl-10 h-11 border-border/90 dark:border-border/80 focus-visible:ring-1 focus-visible:ring-orange-500 focus-visible:border-orange-500 transition-all bg-background dark:bg-card/25 text-foreground font-semibold rounded-xl shadow-xs"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label
                    htmlFor="licenseNo"
                    className="text-xs font-bold uppercase tracking-wider text-foreground/90"
                  >
                    License Number (Optional)
                  </Label>
                  <div className="relative group">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-orange-500 transition-colors">
                      <FileText className="w-4 h-4" />
                    </span>
                    <Input
                      id="licenseNo"
                      placeholder="DL-12345"
                      value={formData.licenseNo}
                      onChange={(e) =>
                        setFormData({ ...formData, licenseNo: e.target.value })
                      }
                      data-testid="register-license-input"
                      className="pl-10 h-11 border-border/90 dark:border-border/80 focus-visible:ring-1 focus-visible:ring-orange-500 focus-visible:border-orange-500 transition-all bg-background dark:bg-card/25 text-foreground font-semibold rounded-xl shadow-xs"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label
                    htmlFor="yearsOld"
                    className="text-xs font-bold uppercase tracking-wider text-foreground/90"
                  >
                    Years in Business (Optional)
                  </Label>
                  <div className="relative group">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-orange-500 transition-colors">
                      <Calendar className="w-4 h-4" />
                    </span>
                    <Input
                      id="yearsOld"
                      type="number"
                      placeholder="e.g. 5"
                      value={formData.yearsOld}
                      onChange={(e) =>
                        setFormData({ ...formData, yearsOld: e.target.value })
                      }
                      data-testid="register-years-input"
                      className="pl-10 h-11 border-border/90 dark:border-border/80 focus-visible:ring-1 focus-visible:ring-orange-500 focus-visible:border-orange-500 transition-all bg-background dark:bg-card/25 text-foreground font-semibold rounded-xl shadow-xs"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: OTP Verification */}
            {step === 2 && (
              <div className="space-y-6 animate-in fade-in duration-300">
                <div className="text-center space-y-4">
                  <p className="text-muted-foreground text-sm font-semibold">
                    We've sent a 6-digit OTP to{" "}
                    <span className="text-foreground font-extrabold">
                      {formData.email}
                    </span>
                  </p>

                  {/* Fallback OTP Display banner (email failures) */}
                  {fallbackOtp && (
                    <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/40 flex items-start gap-3 text-left animate-in fade-in duration-200">
                      <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <p className="text-amber-500 font-bold text-xs uppercase tracking-wider">
                          OTP Delivery Fallback
                        </p>
                        <p className="text-lg font-mono font-black text-amber-500 tracking-wider">
                          {fallbackOtp}
                        </p>
                        <p className="text-[10px] text-muted-foreground leading-normal pt-1 font-semibold">
                          Configure Brevo account whitelist for IP{" "}
                          <code className="font-mono bg-muted px-1 py-0.5 rounded text-foreground font-bold">
                            34.16.56.64
                          </code>
                          .
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="flex justify-center pt-2">
                    <InputOTP
                      maxLength={6}
                      value={otp}
                      onChange={setOtp}
                      data-testid="otp-input"
                    >
                      <InputOTPGroup className="gap-2">
                        <InputOTPSlot
                          index={0}
                          className="w-10 h-12 sm:w-12 sm:h-14 text-base border border-border/90 dark:border-border/80 rounded-xl bg-background dark:bg-card/25 font-bold text-foreground shadow-xs"
                        />
                        <InputOTPSlot
                          index={1}
                          className="w-10 h-12 sm:w-12 sm:h-14 text-base border border-border/90 dark:border-border/80 rounded-xl bg-background dark:bg-card/25 font-bold text-foreground shadow-xs"
                        />
                        <InputOTPSlot
                          index={2}
                          className="w-10 h-12 sm:w-12 sm:h-14 text-base border border-border/90 dark:border-border/80 rounded-xl bg-background dark:bg-card/25 font-bold text-foreground shadow-xs"
                        />
                        <InputOTPSlot
                          index={3}
                          className="w-10 h-12 sm:w-12 sm:h-14 text-base border border-border/90 dark:border-border/80 rounded-xl bg-background dark:bg-card/25 font-bold text-foreground shadow-xs"
                        />
                        <InputOTPSlot
                          index={4}
                          className="w-10 h-12 sm:w-12 sm:h-14 text-base border border-border/90 dark:border-border/80 rounded-xl bg-background dark:bg-card/25 font-bold text-foreground shadow-xs"
                        />
                        <InputOTPSlot
                          index={5}
                          className="w-10 h-12 sm:w-12 sm:h-14 text-base border border-border/90 dark:border-border/80 rounded-xl bg-background dark:bg-card/25 font-bold text-foreground shadow-xs"
                        />
                      </InputOTPGroup>
                    </InputOTP>
                  </div>

                  <Button
                    variant="link"
                    onClick={handleResendOTP}
                    disabled={loading}
                    className="text-xs text-muted-foreground hover:text-orange-500 font-extrabold transition-colors mt-2"
                    data-testid="resend-otp-btn"
                  >
                    Didn't receive? Resend OTP
                  </Button>
                </div>

                <Button
                  className="w-full h-11 font-bold text-sm bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white shadow-lg shadow-orange-500/25 transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 rounded-xl border-none mt-4"
                  onClick={handleVerifyOTP}
                  disabled={loading || otp.length !== 6}
                  data-testid="verify-otp-btn"
                >
                  {loading ? (
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                      <span>Verifying...</span>
                    </div>
                  ) : (
                    <span>Verify & Complete Registration</span>
                  )}
                </Button>
              </div>
            )}

            {/* Navigation Buttons for step 0 and 1 */}
            {step < 2 && (
              <div className="flex justify-between items-center gap-4 pt-4 border-t border-border/40 mt-6">
                {step > 0 ? (
                  <Button
                    variant="outline"
                    onClick={handleBack}
                    data-testid="back-btn"
                    className="h-11 px-5 border-border/90 hover:bg-muted font-bold transition-all rounded-xl"
                  >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back
                  </Button>
                ) : (
                  <div></div>
                )}

                <Button
                  onClick={handleNext}
                  disabled={loading}
                  className="h-11 px-6 font-bold text-sm bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white shadow-lg shadow-orange-500/25 transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 rounded-xl border-none"
                  data-testid="next-btn"
                >
                  {loading ? (
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                      <span>Processing...</span>
                    </div>
                  ) : step === 1 ? (
                    <span>Register</span>
                  ) : (
                    <span className="flex items-center gap-2">
                      Next
                      <ArrowRight className="w-4 h-4" />
                    </span>
                  )}
                </Button>
              </div>
            )}

            {/* Sign in fallback link */}
            <div className="text-center text-sm font-semibold text-muted-foreground pt-4 border-t border-border/40 mt-6">
              Already have an account?{" "}
              <Link
                to="/login"
                className="text-orange-500 hover:text-orange-600 font-extrabold transition-all underline-offset-4 hover:underline"
                data-testid="login-link"
              >
                Sign in
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
