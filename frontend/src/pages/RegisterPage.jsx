import { useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { API } from "../App";
import { Button } from "../components/ui/button";
import WaveInput from "../components/ui/WaveInput";
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
import ThemeToggle from "../components/ui/ThemeToggle";
import FluidLinePattern from "../components/ui/FluidLinePattern";
import AuthLeftPanel from "../components/ui/AuthLeftPanel";

const STEPS = ["Personal Info", "Pharmacy Details", "Verify Email"];

export default function RegisterPage() {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [otp, setOtp] = useState("");
  const [fallbackOtp, setFallbackOtp] = useState("");
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

  const [errors, setErrors] = useState({});

  // Clean and format mobile input to strictly 10 digits
  const handleMobileChange = (e) => {
    const rawVal = e.target.value;
    const digitsOnly = rawVal.replace(/\D/g, "").slice(0, 10);
    setFormData((prev) => ({ ...prev, mobile: digitsOnly }));

    if (errors.mobile) {
      if (digitsOnly.length === 10) {
        setErrors((prev) => ({ ...prev, mobile: "" }));
      }
    }
  };

  const validateStep0 = () => {
    const newErrors = {};
    let valid = true;

    const trimmedName = formData.name.trim();
    if (!trimmedName) {
      newErrors.name = "Full name is required";
      valid = false;
    } else if (trimmedName.length < 2) {
      newErrors.name = "Name must be at least 2 characters";
      valid = false;
    } else if (trimmedName.length > 50) {
      newErrors.name = "Name cannot exceed 50 characters";
      valid = false;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!formData.email.trim()) {
      newErrors.email = "Email address is required";
      valid = false;
    } else if (!emailRegex.test(formData.email.trim())) {
      newErrors.email = "Please enter a valid email address";
      valid = false;
    }

    if (!formData.mobile) {
      newErrors.mobile = "10-digit mobile number is required";
      valid = false;
    } else if (!/^\d{10}$/.test(formData.mobile)) {
      newErrors.mobile = `Enter complete 10 digits (${formData.mobile.length}/10 entered)`;
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

  const validateStep1 = () => {
    const newErrors = {};
    let valid = true;

    const trimmedPharm = formData.pharmacyName.trim();
    if (!trimmedPharm) {
      newErrors.pharmacyName = "Pharmacy name is required";
      valid = false;
    } else if (trimmedPharm.length < 2) {
      newErrors.pharmacyName = "Pharmacy name must be at least 2 characters";
      valid = false;
    } else if (trimmedPharm.length > 60) {
      newErrors.pharmacyName = "Pharmacy name cannot exceed 60 characters";
      valid = false;
    }

    const trimmedLoc = formData.location.trim();
    if (!trimmedLoc) {
      newErrors.location = "Store address / location is required";
      valid = false;
    } else if (trimmedLoc.length < 3) {
      newErrors.location = "Please enter a detailed location";
      valid = false;
    } else if (trimmedLoc.length > 120) {
      newErrors.location = "Location cannot exceed 120 characters";
      valid = false;
    }

    if (formData.licenseNo && formData.licenseNo.length > 35) {
      newErrors.licenseNo = "License number cannot exceed 35 characters";
      valid = false;
    }

    if (formData.yearsOld) {
      const parsedYears = parseInt(formData.yearsOld, 10);
      if (isNaN(parsedYears) || parsedYears < 0 || parsedYears > 150) {
        newErrors.yearsOld = "Enter valid years between 0 and 150";
        valid = false;
      }
    }

    setErrors(newErrors);
    return valid;
  };

  const handleNext = () => {
    if (step === 0) {
      if (!validateStep0()) {
        toast.error("Please fill all required fields correctly");
        return;
      }
      setStep(1);
      return;
    }

    if (step === 1) {
      if (!validateStep1()) {
        toast.error("Please complete pharmacy details correctly");
        return;
      }
      handleRegister();
      return;
    }
  };

  const handleBack = () => {
    setErrors({});
    setStep((prev) => Math.max(0, prev - 1));
  };

  const handleRegister = async () => {
    setLoading(true);
    try {
      const response = await axios.post(`${API}/auth/register`, {
        name: formData.name.trim(),
        email: formData.email.trim(),
        mobile: formData.mobile,
        password: formData.password,
        pharmacy: {
          name: formData.pharmacyName.trim(),
          location: formData.location.trim(),
          license_no: formData.licenseNo.trim() || null,
          years_old: formData.yearsOld ? parseInt(formData.yearsOld, 10) : null,
        },
      });

      if (response.data.otp) {
        setFallbackOtp(response.data.otp);
        toast.warning("Email delivery failed. Your OTP is displayed below.");
      } else {
        toast.success("OTP sent to your email address!");
      }
      setStep(2);
    } catch (error) {
      console.error("Registration error:", error);
      const errMsg =
        error.response?.data?.detail || "Registration failed. Please check inputs.";
      toast.error(errMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    if (otp.length !== 6) {
      toast.error("Please enter the complete 6-digit OTP");
      return;
    }

    setLoading(true);
    try {
      await axios.post(`${API}/auth/verify-otp`, {
        email: formData.email.trim(),
        otp: otp,
      });
      toast.success("Account verified successfully! Welcome to DavaDesk.");
      window.location.href = "/dashboard";
    } catch (error) {
      console.error("Verification error:", error);
      toast.error(error.response?.data?.detail || "Invalid OTP entered");
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
          email: formData.email.trim(),
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
      {/* Left Panel: Full Background Image Slideshow with Step Progress */}
      <div className="hidden md:block md:col-span-5 relative overflow-hidden">
        <AuthLeftPanel
          steps={STEPS}
          currentStep={step}
          autoPlayInterval={5000}
        />
      </div>

      {/* Right Panel: Clean Subtle Pattern & Scrollable Input Form */}
      <div className="col-span-12 md:col-span-7 flex items-center justify-center p-6 sm:p-12 bg-background relative overflow-y-auto max-h-screen">
        {/* Soft, Subtle Fluid Pattern Background */}
        <FluidLinePattern />

        {/* Top-Right Theme Toggle Switch */}
        <div className="absolute top-6 right-6 z-20">
          <ThemeToggle />
        </div>

        <div className="w-full max-w-md space-y-7 my-auto relative z-10">
          {/* Brand Logo & Header */}
          <div className="flex items-center gap-3">
            <img
              src="/assets/svgs/logoBrand/logoOnlyWithoutBackground.svg"
              alt="DavaDesk"
              className="w-12 h-12 object-contain shrink-0 drop-shadow-sm"
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
          <div className="space-y-1.5 pt-1">
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-orange-600 dark:text-orange-400 px-3 py-1 bg-orange-500/10 rounded-full border border-orange-500/30 inline-block">
              Step {step + 1} of 3 • {STEPS[step]}
            </span>
            <h2 className="text-3xl font-extrabold tracking-tight text-foreground pt-1">
              {step === 0 && "Create Account"}
              {step === 1 && "Pharmacy Details"}
              {step === 2 && "Verify Email"}
            </h2>
            <p className="text-muted-foreground text-sm font-semibold">
              {step === 0 && "Enter your contact and administrator details."}
              {step === 1 && "Enter your pharmacy name and location."}
              {step === 2 && `Enter the 6-digit OTP sent to ${formData.email}`}
            </p>
          </div>

          {/* Form Content */}
          <div className="space-y-5">
            {/* Step 0: Personal Info */}
            {step === 0 && (
              <div className="space-y-4 animate-in fade-in duration-300">
                <WaveInput
                  id="name"
                  type="text"
                  label="Full Name"
                  value={formData.name}
                  onChange={(e) => {
                    setFormData({ ...formData, name: e.target.value });
                    if (errors.name) setErrors({ ...errors, name: "" });
                  }}
                  leftIcon={User}
                  required
                  maxLength={50}
                  error={errors.name}
                  data-testid="register-name-input"
                  autoComplete="name"
                />

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
                  maxLength={80}
                  error={errors.email}
                  data-testid="register-email-input"
                  autoComplete="email"
                />

                <WaveInput
                  id="mobile"
                  type="tel"
                  label="Mobile Number (10 Digits)"
                  value={formData.mobile}
                  onChange={handleMobileChange}
                  leftIcon={Phone}
                  required
                  maxLength={10}
                  error={errors.mobile}
                  helperText="Enter 10-digit Indian mobile number"
                  data-testid="register-mobile-input"
                  autoComplete="tel"
                />

                <WaveInput
                  id="password"
                  type={showPassword ? "text" : "password"}
                  label="Password (Min 6 chars)"
                  value={formData.password}
                  onChange={(e) => {
                    setFormData({ ...formData, password: e.target.value });
                    if (errors.password) setErrors({ ...errors, password: "" });
                  }}
                  leftIcon={Lock}
                  required
                  maxLength={64}
                  error={errors.password}
                  data-testid="register-password-input"
                  autoComplete="new-password"
                  rightElement={
                    <button
                      type="button"
                      tabIndex={-1}
                      className="p-1 text-muted-foreground hover:text-foreground transition-colors rounded-lg focus:outline-none"
                      onClick={() => setShowPassword(!showPassword)}
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
              </div>
            )}

            {/* Step 1: Pharmacy Details */}
            {step === 1 && (
              <div className="space-y-4 animate-in fade-in duration-300">
                <WaveInput
                  id="pharmacyName"
                  type="text"
                  label="Pharmacy Name"
                  value={formData.pharmacyName}
                  onChange={(e) => {
                    setFormData({ ...formData, pharmacyName: e.target.value });
                    if (errors.pharmacyName) setErrors({ ...errors, pharmacyName: "" });
                  }}
                  leftIcon={Building}
                  required
                  maxLength={60}
                  error={errors.pharmacyName}
                  data-testid="register-pharmacy-name-input"
                  autoComplete="organization"
                />

                <WaveInput
                  id="location"
                  type="text"
                  label="Store Location / Address"
                  value={formData.location}
                  onChange={(e) => {
                    setFormData({ ...formData, location: e.target.value });
                    if (errors.location) setErrors({ ...errors, location: "" });
                  }}
                  leftIcon={MapPin}
                  required
                  maxLength={120}
                  error={errors.location}
                  data-testid="register-location-input"
                  autoComplete="street-address"
                />

                <WaveInput
                  id="licenseNo"
                  type="text"
                  label="Drug License Number (Optional)"
                  value={formData.licenseNo}
                  onChange={(e) => {
                    setFormData({ ...formData, licenseNo: e.target.value });
                    if (errors.licenseNo) setErrors({ ...errors, licenseNo: "" });
                  }}
                  leftIcon={FileText}
                  maxLength={35}
                  error={errors.licenseNo}
                  helperText="e.g. DL-20B/21B-XXXX"
                  data-testid="register-license-input"
                />

                <WaveInput
                  id="yearsOld"
                  type="number"
                  label="Years in Business (Optional)"
                  value={formData.yearsOld}
                  onChange={(e) => {
                    setFormData({ ...formData, yearsOld: e.target.value });
                    if (errors.yearsOld) setErrors({ ...errors, yearsOld: "" });
                  }}
                  leftIcon={Calendar}
                  min="0"
                  max="150"
                  error={errors.yearsOld}
                  helperText="e.g. 5"
                  data-testid="register-years-input"
                />
              </div>
            )}

            {/* Step 2: OTP Verification */}
            {step === 2 && (
              <div className="space-y-6 animate-in fade-in duration-300">
                <div className="text-center space-y-4">
                  <p className="text-muted-foreground text-sm font-semibold">
                    We've sent a 6-digit OTP to{" "}
                    <span className="text-foreground font-extrabold">
                      {formData.email}
                    </span>
                  </p>

                  {fallbackOtp && (
                    <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/40 flex items-start gap-3 text-left animate-in fade-in duration-200">
                      <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <p className="text-amber-500 font-bold text-xs uppercase tracking-wider">
                          OTP Delivery Fallback
                        </p>
                        <p className="text-xl font-mono font-black text-amber-500 tracking-wider">
                          {fallbackOtp}
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
                        {[0, 1, 2, 3, 4, 5].map((idx) => (
                          <InputOTPSlot
                            key={idx}
                            index={idx}
                            className="w-10 h-12 sm:w-12 sm:h-14 text-base border border-border/90 dark:border-border/80 rounded-xl bg-background dark:bg-card/25 font-bold text-foreground shadow-xs focus:ring-2 focus:ring-orange-500"
                          />
                        ))}
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
                  className="w-full h-12 font-bold text-sm bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white shadow-lg shadow-orange-500/25 transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 rounded-xl border-none mt-4"
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
              <div className="flex justify-between items-center gap-4 pt-4 border-t border-border/40 mt-5">
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
                  <div />
                )}

                <Button
                  onClick={handleNext}
                  disabled={loading}
                  className="h-11 px-6 font-bold text-sm bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white shadow-lg shadow-orange-500/25 transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 rounded-xl border-none ml-auto"
                  data-testid="next-btn"
                >
                  {loading ? (
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                      <span>Processing...</span>
                    </div>
                  ) : step === 1 ? (
                    <span className="flex items-center gap-2">
                      Complete Registration
                      <ArrowRight className="w-4 h-4" />
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      Next Step
                      <ArrowRight className="w-4 h-4" />
                    </span>
                  )}
                </Button>
              </div>
            )}

            {/* Sign in link */}
            <div className="text-center text-sm font-semibold text-muted-foreground pt-3 border-t border-border/40">
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
