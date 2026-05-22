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
} from "lucide-react";

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
      localStorage.setItem("pharmalogy_token", response.data.token);
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
      className="min-h-screen w-full grid grid-cols-1 md:grid-cols-12 bg-background select-none overflow-hidden"
      data-testid="register-page"
    >
      {/* Left Panel: Aesthetic Sidebar with Step details (Hidden on mobile) */}
      <div className="hidden md:flex md:col-span-5 bg-zinc-950/20 border-r border-border/50 p-12 flex-col justify-between relative overflow-hidden">
        {/* Soft ambient light gradients (lag-free) */}
        <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] rounded-full bg-gradient-to-br from-primary/10 to-transparent pointer-events-none transform translate-z-0"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] rounded-full bg-gradient-to-tl from-accent/5 to-transparent pointer-events-none transform translate-z-0"></div>

        {/* Header Logo */}
        <div className="flex items-center gap-3 relative z-10">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
            <Activity className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="font-extrabold text-xl tracking-tight text-foreground bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text">
            Pharmalogy
          </span>
        </div>

        {/* Dynamic Progress Timeline */}
        <div className="my-auto space-y-8 relative z-10 max-w-sm">
          <div className="space-y-2">
            <h1 className="text-3xl font-black tracking-tight text-foreground leading-[1.15]">
              Get Started with <br />
              <span className="text-primary bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                Pharmacy Control.
              </span>
            </h1>
            <p className="text-muted-foreground text-sm font-medium leading-relaxed">
              Create your account and workspace parameters in three simple steps.
            </p>
          </div>

          {/* Step Progress Timeline list */}
          <div className="space-y-5 pt-2">
            {STEPS.map((s, i) => {
              const isActive = i === step;
              const isCompleted = i < step;
              return (
                <div
                  key={i}
                  className={`flex items-start gap-4 p-3.5 rounded-xl border transition-all duration-300 ${
                    isActive
                      ? "bg-primary/[0.04] border-primary/25 shadow-sm shadow-primary/[0.02]"
                      : "border-transparent"
                  }`}
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 transition-all duration-300 ${
                      isCompleted
                        ? "bg-green-500 text-white shadow-md shadow-green-500/20"
                        : isActive
                          ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                          : "bg-muted text-muted-foreground/60 border border-border"
                    }`}
                  >
                    {isCompleted ? <Check className="w-4 h-4 stroke-[3]" /> : i + 1}
                  </div>
                  <div className="space-y-0.5">
                    <h3
                      className={`text-sm font-bold transition-colors ${
                        isActive
                          ? "text-foreground"
                          : isCompleted
                            ? "text-foreground/80"
                            : "text-muted-foreground/60"
                      }`}
                    >
                      {s}
                    </h3>
                    <p
                      className={`text-xs transition-colors leading-normal ${
                        isActive
                          ? "text-muted-foreground"
                          : "text-muted-foreground/50"
                      }`}
                    >
                      {i === 0 && "Provide credentials for your secure administrator login."}
                      {i === 1 && "Configure names, licensing, and database properties."}
                      {i === 2 && "Authenticate your email using the verification code."}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="text-[10px] text-muted-foreground/50 font-medium relative z-10">
          © {new Date().getFullYear()} Pharmalogy Inc. All rights reserved.
        </div>
      </div>

      {/* Right Panel: Scrollable Input Forms */}
      <div className="col-span-12 md:col-span-7 flex items-center justify-center p-6 sm:p-12 bg-background relative overflow-y-auto h-screen">
        {/* Decorative backdrop light on mobile only */}
        <div className="md:hidden absolute top-[-20%] right-[-20%] w-[60%] h-[60%] rounded-full bg-primary/5 pointer-events-none blur-3xl"></div>

        <div className="w-full max-w-md space-y-8 my-auto relative z-10">
          {/* Header Mobile Logo */}
          <div className="md:hidden flex flex-col items-center text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
              <Activity className="w-6 h-6 text-primary-foreground" />
            </div>
            <div>
              <h2 className="text-2xl font-black tracking-tight text-foreground">
                Pharmalogy
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
                      ? "w-8 bg-primary"
                      : i < step
                        ? "w-2 bg-green-500"
                        : "w-2 bg-muted"
                  }`}
                ></div>
              ))}
            </div>
          </div>

          {/* Form Header (Desktop only) */}
          <div className="hidden md:block space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-primary px-2.5 py-1 bg-primary/10 rounded-full">
              Step {step + 1} of 3 • {STEPS[step]}
            </span>
            <h2 className="text-3xl font-extrabold tracking-tight text-foreground pt-2">
              {step === 0 && "Create Account"}
              {step === 1 && "Pharmacy Details"}
              {step === 2 && "Verify Email"}
            </h2>
            <p className="text-muted-foreground text-sm font-medium">
              {step === 0 && "Enter your contact and security details."}
              {step === 1 && "Set up workspace identifiers."}
              {step === 2 && `We sent a passcode to your verification address.`}
            </p>
          </div>

          {/* Form Content Wrapper */}
          <div className="bg-card/45 md:bg-transparent border border-border/50 md:border-0 rounded-2xl p-6 sm:p-8 md:p-0 shadow-xl md:shadow-none space-y-6">
            {/* Step 1: Personal Info */}
            {step === 0 && (
              <div className="space-y-5 animate-in fade-in duration-300">
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80">
                    Full Name *
                  </Label>
                  <div className="relative group">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 group-focus-within:text-primary transition-colors">
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
                      className="pl-10 h-11 border-border/80 focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary transition-all bg-card/25"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email" className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80">
                    Email Address *
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
                      data-testid="register-email-input"
                      className="pl-10 h-11 border-border/80 focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary transition-all bg-card/25"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="mobile" className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80">
                    Mobile Number *
                  </Label>
                  <div className="relative group">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 group-focus-within:text-primary transition-colors">
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
                      className="pl-10 h-11 border-border/80 focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary transition-all bg-card/25"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password" className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80">
                    Password *
                  </Label>
                  <div className="relative group">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 group-focus-within:text-primary transition-colors">
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
                      className="pl-10 pr-10 h-11 border-border/80 focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary transition-all bg-card/25"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 hover:bg-muted text-muted-foreground/50 hover:text-foreground"
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
                  <Label htmlFor="pharmacyName" className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80">
                    Pharmacy Name *
                  </Label>
                  <div className="relative group">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 group-focus-within:text-primary transition-colors">
                      <Building className="w-4 h-4" />
                    </span>
                    <Input
                      id="pharmacyName"
                      placeholder="City Pharmacy"
                      value={formData.pharmacyName}
                      onChange={(e) =>
                        setFormData({ ...formData, pharmacyName: e.target.value })
                      }
                      data-testid="register-pharmacy-name-input"
                      className="pl-10 h-11 border-border/80 focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary transition-all bg-card/25"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="location" className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80">
                    Location *
                  </Label>
                  <div className="relative group">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 group-focus-within:text-primary transition-colors">
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
                      className="pl-10 h-11 border-border/80 focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary transition-all bg-card/25"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="licenseNo" className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80">
                    License Number (Optional)
                  </Label>
                  <div className="relative group">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 group-focus-within:text-primary transition-colors">
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
                      className="pl-10 h-11 border-border/80 focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary transition-all bg-card/25"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="yearsOld" className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80">
                    Years in Business (Optional)
                  </Label>
                  <div className="relative group">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 group-focus-within:text-primary transition-colors">
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
                      className="pl-10 h-11 border-border/80 focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary transition-all bg-card/25"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: OTP Verification */}
            {step === 2 && (
              <div className="space-y-6 animate-in fade-in duration-300">
                <div className="text-center space-y-4">
                  <p className="text-muted-foreground text-sm font-medium">
                    We've sent a 6-digit OTP to{" "}
                    <span className="text-foreground font-semibold">
                      {formData.email}
                    </span>
                  </p>

                  {/* Fallback OTP Display banner (email failures) */}
                  {fallbackOtp && (
                    <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3 text-left animate-in fade-in duration-200">
                      <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <p className="text-amber-500 font-bold text-xs uppercase tracking-wider">
                          OTP Delivery Fallback
                        </p>
                        <p className="text-lg font-mono font-black text-amber-500 tracking-wider">
                          {fallbackOtp}
                        </p>
                        <p className="text-[10px] text-muted-foreground/85 leading-normal pt-1">
                          Configure Brevo account whitelist for IP <code className="font-mono bg-muted/60 px-1 py-0.5 rounded text-foreground">34.16.56.64</code>.
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
                      <InputOTPGroup className="gap-1.5">
                        <InputOTPSlot index={0} className="w-10 h-12 sm:w-12 sm:h-14 text-base border border-border/80 rounded-lg bg-card/25" />
                        <InputOTPSlot index={1} className="w-10 h-12 sm:w-12 sm:h-14 text-base border border-border/80 rounded-lg bg-card/25" />
                        <InputOTPSlot index={2} className="w-10 h-12 sm:w-12 sm:h-14 text-base border border-border/80 rounded-lg bg-card/25" />
                        <InputOTPSlot index={3} className="w-10 h-12 sm:w-12 sm:h-14 text-base border border-border/80 rounded-lg bg-card/25" />
                        <InputOTPSlot index={4} className="w-10 h-12 sm:w-12 sm:h-14 text-base border border-border/80 rounded-lg bg-card/25" />
                        <InputOTPSlot index={5} className="w-10 h-12 sm:w-12 sm:h-14 text-base border border-border/80 rounded-lg bg-card/25" />
                      </InputOTPGroup>
                    </InputOTP>
                  </div>

                  <Button
                    variant="link"
                    onClick={handleResendOTP}
                    disabled={loading}
                    className="text-xs text-muted-foreground hover:text-foreground font-semibold transition-colors mt-2"
                    data-testid="resend-otp-btn"
                  >
                    Didn't receive? Resend OTP
                  </Button>
                </div>

                <Button
                  className="w-full btn-primary h-11 font-bold text-sm bg-primary hover:bg-primary/95 text-primary-foreground shadow-lg shadow-primary/10 transition-all hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] mt-4"
                  onClick={handleVerifyOTP}
                  disabled={loading || otp.length !== 6}
                  data-testid="verify-otp-btn"
                >
                  {loading ? (
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-primary-foreground" />
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
                    className="h-11 px-5 border-border hover:bg-muted font-bold transition-all"
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
                  className="btn-primary h-11 px-6 font-bold text-sm bg-primary hover:bg-primary/95 text-primary-foreground shadow-lg shadow-primary/10 transition-all hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98]"
                  data-testid="next-btn"
                >
                  {loading ? (
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-primary-foreground" />
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
            <div className="text-center text-sm font-medium text-muted-foreground pt-4 border-t border-border/40 mt-6">
              Already have an account?{" "}
              <Link
                to="/login"
                className="text-primary hover:underline font-bold transition-all hover:text-primary/90"
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
