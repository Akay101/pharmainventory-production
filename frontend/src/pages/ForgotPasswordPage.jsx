import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import { API } from "../App";
import { Button } from "../components/ui/button";
import WaveInput from "../components/ui/WaveInput";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "../components/ui/input-otp";
import { toast } from "sonner";
import { ArrowLeft, Eye, EyeOff, KeyRound, Loader2, Lock, Mail } from "lucide-react";
import ThemeToggle from "../components/ui/ThemeToggle";
import FluidLinePattern from "../components/ui/FluidLinePattern";
import AuthLeftPanel from "../components/ui/AuthLeftPanel";

const RESEND_COOLDOWN_S = 60;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPasswordPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [step, setStep] = useState(0); // 0 = email, 1 = code + new password
  const [email, setEmail] = useState(location.state?.email || "");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return undefined;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const requestCode = async () => {
    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed)) {
      setErrors({ email: "Enter a valid email address" });
      return;
    }
    setLoading(true);
    try {
      await axios.post(`${API}/auth/forgot-password`, { email: trimmed });
      toast.success("If an account exists for this email, a reset code is on its way.");
      setResendIn(RESEND_COOLDOWN_S);
      setOtp("");
      setStep(1);
    } catch (error) {
      const data = error.response?.data || {};
      if (data.retry_after) {
        setResendIn(data.retry_after);
        setStep(1);
      }
      toast.error(data.detail || "Couldn't send the code. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async () => {
    const next = {};
    if (otp.length !== 6) next.otp = "Enter the 6-digit code";
    if (password.length < 8) next.password = "Password must be at least 8 characters";
    else if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) next.password = "Use at least one letter and one number";
    if (confirm !== password) next.confirm = "Passwords don't match";
    setErrors(next);
    if (Object.keys(next).length) return;

    setLoading(true);
    try {
      await axios.post(`${API}/auth/reset-password`, { email: email.trim(), otp, password });
      toast.success("Password updated. Please sign in with your new password.");
      navigate("/login", { replace: true });
    } catch (error) {
      const data = error.response?.data || {};
      setOtp("");
      toast.error(
        data.attempts_left !== undefined
          ? `${data.detail}. ${data.attempts_left} attempt(s) left.`
          : data.detail || "Couldn't reset the password"
      );
    } finally {
      setLoading(false);
    }
  };

  const primaryBtn =
    "w-full h-12 font-bold text-sm bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white shadow-lg shadow-orange-500/25 transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 rounded-xl border-none";

  return (
    <div
      className="min-h-screen w-full grid grid-cols-1 md:grid-cols-12 bg-background select-none overflow-hidden relative"
      data-testid="forgot-password-page"
    >
      <div className="hidden md:block md:col-span-6 lg:col-span-7 relative overflow-hidden">
        <AuthLeftPanel autoPlayInterval={4500} />
      </div>

      <div className="col-span-12 md:col-span-6 lg:col-span-5 flex items-center justify-center p-6 sm:p-12 bg-background relative overflow-y-auto">
        <FluidLinePattern />
        <div className="absolute top-6 right-6 z-20">
          <ThemeToggle />
        </div>

        <div className="w-full max-w-md space-y-8 relative z-10 my-auto">
          <div className="flex items-center gap-3">
            <img
              src="/assets/svgs/logoBrand/logoOnlyWithoutBackground.svg"
              alt="DavaDesk"
              className="w-12 h-12 object-contain shrink-0 drop-shadow-sm"
            />
            <div className="flex flex-col">
              <span className="font-extrabold text-2xl tracking-tight text-foreground leading-tight">DavaDesk</span>
              <span className="text-xs font-semibold text-muted-foreground">Smart Pharmacy Software</span>
            </div>
          </div>

          <div className="space-y-1.5 pt-1">
            <h2 className="text-3xl font-extrabold tracking-tight text-foreground">
              {step === 0 ? "Reset your password" : "Enter your code"}
            </h2>
            <p className="text-muted-foreground text-sm font-semibold">
              {step === 0 ? (
                "We'll email you a 6-digit code to set a new password."
              ) : (
                <>
                  We sent a code to <span className="text-foreground font-extrabold">{email.trim()}</span> if it has an
                  account. It expires in 10 minutes.
                </>
              )}
            </p>
          </div>

          {step === 0 ? (
            <form
              className="space-y-6"
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                requestCode();
              }}
            >
              <WaveInput
                id="email"
                type="email"
                label="Email Address"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (errors.email) setErrors({});
                }}
                leftIcon={Mail}
                required
                error={errors.email}
                autoComplete="email"
                data-testid="forgot-email-input"
              />
              <Button type="submit" className={primaryBtn} disabled={loading} data-testid="send-reset-code-btn">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Send reset code"}
              </Button>
            </form>
          ) : (
            <form
              className="space-y-6"
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                resetPassword();
              }}
            >
              <div className="space-y-2">
                <div className="flex justify-center">
                  <InputOTP maxLength={6} value={otp} onChange={setOtp} data-testid="reset-otp-input">
                    <InputOTPGroup className="gap-2">
                      {[0, 1, 2, 3, 4, 5].map((idx) => (
                        <InputOTPSlot
                          key={idx}
                          index={idx}
                          className="w-10 h-12 sm:w-12 sm:h-14 text-base border border-border/90 rounded-xl bg-background dark:bg-card/25 font-bold text-foreground focus:ring-2 focus:ring-orange-500"
                        />
                      ))}
                    </InputOTPGroup>
                  </InputOTP>
                </div>
                {errors.otp && <p className="text-xs text-center font-semibold text-destructive">{errors.otp}</p>}
                <div className="text-center">
                  <Button
                    type="button"
                    variant="link"
                    onClick={requestCode}
                    disabled={loading || resendIn > 0}
                    className="text-xs text-muted-foreground hover:text-orange-500 font-extrabold"
                  >
                    {resendIn > 0 ? `Resend code in ${resendIn}s` : "Didn't receive it? Resend code"}
                  </Button>
                </div>
              </div>

              <WaveInput
                id="new-password"
                type={showPassword ? "text" : "password"}
                label="New password"
                helperText="At least 8 characters, with letters and numbers"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                leftIcon={Lock}
                required
                error={errors.password}
                autoComplete="new-password"
                data-testid="new-password-input"
                rightElement={
                  <button
                    type="button"
                    tabIndex={-1}
                    className="p-1 text-muted-foreground hover:text-foreground rounded-lg"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                }
              />
              <WaveInput
                id="confirm-password"
                type={showPassword ? "text" : "password"}
                label="Confirm new password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                leftIcon={KeyRound}
                required
                error={errors.confirm}
                autoComplete="new-password"
                data-testid="confirm-password-input"
              />
              <Button type="submit" className={primaryBtn} disabled={loading} data-testid="reset-password-btn">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Set new password"}
              </Button>
              <button
                type="button"
                onClick={() => setStep(0)}
                className="w-full text-xs font-bold text-muted-foreground hover:text-foreground"
              >
                Use a different email
              </button>
            </form>
          )}

          <div className="text-center text-sm font-semibold text-muted-foreground pt-2">
            <Link
              to="/login"
              className="inline-flex items-center gap-1.5 text-orange-500 hover:text-orange-600 font-extrabold underline-offset-4 hover:underline"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
