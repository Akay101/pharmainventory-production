import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import axios from "axios";
import { API } from "../App";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
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
      className="min-h-screen w-full flex items-center justify-center bg-background relative overflow-hidden p-4"
      data-testid="register-page"
    >
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-1/2 -right-1/2 w-full h-full bg-primary/5 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-1/2 -left-1/2 w-full h-full bg-accent/5 rounded-full blur-3xl"></div>
      </div>

      <Card className="w-full max-w-lg relative z-10 bg-card/80 backdrop-blur-xl border-white/10">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/20 flex items-center justify-center mb-2">
            <span className="text-3xl font-bold text-primary">P</span>
          </div>
          <CardTitle className="text-2xl font-bold">
            Register Your Pharmacy
          </CardTitle>
          <CardDescription>Create an account to get started</CardDescription>

          {/* Progress Steps */}
          <div className="flex items-center justify-center gap-2 pt-4">
            {STEPS.map((s, i) => (
              <div key={i} className="flex items-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                    i < step
                      ? "bg-primary text-primary-foreground"
                      : i === step
                        ? "bg-primary/20 text-primary border-2 border-primary"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {i < step ? <Check className="w-4 h-4" /> : i + 1}
                </div>
                {i < STEPS.length - 1 && (
                  <div
                    className={`w-12 h-0.5 mx-1 ${i < step ? "bg-primary" : "bg-muted"}`}
                  ></div>
                )}
              </div>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">{STEPS[step]}</p>
        </CardHeader>

        <CardContent>
          {/* Step 1: Personal Info */}
          {step === 0 && (
            <div className="space-y-4 animate-fade-in">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name *</Label>
                <Input
                  id="name"
                  placeholder="John Doe"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  data-testid="register-name-input"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                  data-testid="register-email-input"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="mobile">Mobile Number *</Label>
                <Input
                  id="mobile"
                  type="tel"
                  placeholder="+91 9876543210"
                  value={formData.mobile}
                  onChange={(e) =>
                    setFormData({ ...formData, mobile: e.target.value })
                  }
                  data-testid="register-mobile-input"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password *</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Min 6 characters"
                    value={formData.password}
                    onChange={(e) =>
                      setFormData({ ...formData, password: e.target.value })
                    }
                    data-testid="register-password-input"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full"
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
            <div className="space-y-4 animate-fade-in">
              <div className="space-y-2">
                <Label htmlFor="pharmacyName">Pharmacy Name *</Label>
                <Input
                  id="pharmacyName"
                  placeholder="City Pharmacy"
                  value={formData.pharmacyName}
                  onChange={(e) =>
                    setFormData({ ...formData, pharmacyName: e.target.value })
                  }
                  data-testid="register-pharmacy-name-input"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="location">Location *</Label>
                <Input
                  id="location"
                  placeholder="123 Main Street, City"
                  value={formData.location}
                  onChange={(e) =>
                    setFormData({ ...formData, location: e.target.value })
                  }
                  data-testid="register-location-input"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="licenseNo">License Number (Optional)</Label>
                <Input
                  id="licenseNo"
                  placeholder="DL-12345"
                  value={formData.licenseNo}
                  onChange={(e) =>
                    setFormData({ ...formData, licenseNo: e.target.value })
                  }
                  data-testid="register-license-input"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="yearsOld">Years in Business (Optional)</Label>
                <Input
                  id="yearsOld"
                  type="number"
                  placeholder="5"
                  value={formData.yearsOld}
                  onChange={(e) =>
                    setFormData({ ...formData, yearsOld: e.target.value })
                  }
                  data-testid="register-years-input"
                />
              </div>
            </div>
          )}

          {/* Step 3: OTP Verification */}
          {step === 2 && (
            <div className="space-y-6 animate-fade-in">
              <div className="text-center">
                <p className="text-muted-foreground mb-4">
                  We've sent a 6-digit OTP to{" "}
                  <span className="text-foreground font-medium">
                    {formData.email}
                  </span>
                </p>

                {/* Show OTP if email delivery failed */}
                {fallbackOtp && (
                  <div className="mb-4 p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
                    <p className="text-yellow-500 text-sm mb-2">
                      Email delivery failed. Use this OTP:
                    </p>
                    <p className="text-2xl font-mono font-bold text-yellow-500">
                      {fallbackOtp}
                    </p>
                    <p className="text-xs text-muted-foreground mt-2">
                      To fix: Whitelist IP 34.16.56.64 in your Brevo account
                    </p>
                  </div>
                )}

                <div className="flex justify-center mb-6">
                  <InputOTP
                    maxLength={6}
                    value={otp}
                    onChange={setOtp}
                    data-testid="otp-input"
                  >
                    <InputOTPGroup>
                      <InputOTPSlot index={0} />
                      <InputOTPSlot index={1} />
                      <InputOTPSlot index={2} />
                      <InputOTPSlot index={3} />
                      <InputOTPSlot index={4} />
                      <InputOTPSlot index={5} />
                    </InputOTPGroup>
                  </InputOTP>
                </div>

                <Button
                  variant="link"
                  onClick={handleResendOTP}
                  disabled={loading}
                  className="text-muted-foreground"
                  data-testid="resend-otp-btn"
                >
                  Didn't receive? Resend OTP
                </Button>
              </div>

              <Button
                className="w-full btn-primary"
                onClick={handleVerifyOTP}
                disabled={loading || otp.length !== 6}
                data-testid="verify-otp-btn"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  "Verify & Complete Registration"
                )}
              </Button>
            </div>
          )}

          {/* Navigation Buttons */}
          {step < 2 && (
            <div className="flex justify-between mt-6">
              {step > 0 ? (
                <Button
                  variant="outline"
                  onClick={handleBack}
                  data-testid="back-btn"
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
                className="btn-primary"
                data-testid="next-btn"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : step === 1 ? (
                  "Register"
                ) : (
                  <>
                    Next
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </>
                )}
              </Button>
            </div>
          )}

          <div className="mt-6 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link
              to="/login"
              className="text-primary hover:underline font-medium"
              data-testid="login-link"
            >
              Sign in
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
