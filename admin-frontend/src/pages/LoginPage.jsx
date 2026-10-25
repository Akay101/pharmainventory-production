import React, { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import {
  Lock,
  Mail,
  KeyRound,
  ShieldCheck,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  Eye,
  EyeOff,
} from "lucide-react";
import { toast } from "sonner";

export default function LoginPage() {
  const { loginInit, verifyOtp, setPassword, resendOtp, forgotPassword } = useAuth();

  // Wizard Stage: "LOGIN" | "OTP" | "SET_PASSWORD" | "FORGOT_PASSWORD"
  const [stage, setStage] = useState("LOGIN");

  // Form Fields
  const [email, setEmail] = useState("akay101685@gmail.com");
  const [password, setPasswordInput] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // OTP Fields
  const [otp, setOtp] = useState("");
  const [countdown, setCountdown] = useState(0);
  const [isFirstTime, setIsFirstTime] = useState(false);
  const [otpPurpose, setOtpPurpose] = useState("login"); // "login" | "setup" | "reset"

  // Set Password Fields
  const [tempToken, setTempToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);

  // Loading & Error States
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  // Countdown timer for OTP resend
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  // Stage 1: Submit Login
  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage("");

    if (!email.trim()) {
      setErrorMessage("Please enter your administrator email address.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await loginInit(email.trim(), password);

      if (res.step === "OTP_REQUIRED") {
        setIsFirstTime(!!res.firstTime);
        setOtpPurpose(res.firstTime ? "setup" : "login");
        setStage("OTP");
        setCountdown(45);
        setOtp("");
        toast.info(res.message || "Verification code sent to your email.");
      }
    } catch (err) {
      const msg = err.response?.data?.error || err.message || "Login failed. Please verify credentials.";
      setErrorMessage(msg);
      // If error indicates password required, highlight field
      if (err.response?.data?.code === "PASSWORD_REQUIRED") {
        setErrorMessage("Password is required for this activated account.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Stage 2: Submit OTP Verification
  const handleOtpSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage("");

    const cleanOtp = otp.trim();
    if (cleanOtp.length !== 6 || !/^\d{6}$/.test(cleanOtp)) {
      setErrorMessage("Please enter the complete 6-digit numerical code.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await verifyOtp(email.trim(), cleanOtp, otpPurpose);

      if (res.step === "SET_PASSWORD_REQUIRED") {
        setTempToken(res.tempToken);
        setStage("SET_PASSWORD");
        setNewPassword("");
        setConfirmPassword("");
        toast.info("Code verified. Please set your new secure password.");
      }
      // If AUTHENTICATED, AuthContext automatically updates user state and redirects!
    } catch (err) {
      const msg = err.response?.data?.error || err.message || "OTP verification failed.";
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Resend OTP handler
  const handleResend = async () => {
    if (countdown > 0) return;
    setErrorMessage("");
    try {
      await resendOtp(email.trim(), isFirstTime ? "FIRST_TIME_LOGIN" : "LOGIN_2FA");
      setCountdown(45);
    } catch (err) {
      setErrorMessage(err.response?.data?.error || "Could not resend verification code.");
    }
  };

  // Stage 3: Submit New Password
  const handleSetPasswordSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage("");

    if (newPassword !== confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    if (newPassword.length < 8) {
      setErrorMessage("Password must be at least 8 characters long.");
      return;
    }

    setIsSubmitting(true);
    try {
      await setPassword(tempToken, newPassword, confirmPassword);
      // Once set, AuthContext automatically authenticates and redirects!
    } catch (err) {
      const msg = err.response?.data?.error || err.message || "Failed to set password.";
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Stage 4: Submit Forgot Password
  const handleForgotPasswordSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage("");

    if (!email.trim()) {
      setErrorMessage("Please enter your registered email address.");
      return;
    }

    setIsSubmitting(true);
    try {
      await forgotPassword(email.trim());
      setOtpPurpose("reset");
      setStage("OTP");
      setCountdown(45);
      setOtp("");
    } catch (err) {
      setErrorMessage(err.response?.data?.error || "Failed to dispatch reset code.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Password validation checklist helpers
  const passHasLength = newPassword.length >= 8;
  const passHasUpper = /[A-Z]/.test(newPassword);
  const passHasLower = /[a-z]/.test(newPassword);
  const passHasNumber = /[0-9]/.test(newPassword);
  const passHasSpecial = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(newPassword);
  const isPasswordValid = passHasLength && passHasUpper && passHasLower && passHasNumber && passHasSpecial;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100 flex flex-col justify-center items-center px-4 py-8 sm:px-6 antialiased relative overflow-hidden">
      {/* Background Decorative Rings */}
      <div className="absolute top-1/4 -left-32 w-96 h-96 bg-orange-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Main Container */}
      <div className="w-full max-w-md relative z-10">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center gap-2 mb-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-600 p-2.5 shadow-lg shadow-orange-500/20 flex items-center justify-center">
              <ShieldCheck className="w-7 h-7 text-white" />
            </div>
            <div className="text-left">
              <span className="text-2xl font-black tracking-tight text-white block leading-none">
                <span className="text-orange-500">Dava</span>Desk
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Admin Control Center
              </span>
            </div>
          </div>
        </div>

        {/* Card Box */}
        <div className="bg-slate-900/90 backdrop-blur-xl border border-slate-800 rounded-2xl shadow-2xl p-6 sm:p-8">
          {/* Error Alert */}
          {errorMessage && (
            <div className="mb-6 p-3.5 bg-red-950/60 border border-red-800/80 rounded-xl text-red-200 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1 leading-relaxed">{errorMessage}</div>
            </div>
          )}

          {/* ========================================================= */}
          {/* STAGE 1: LOGIN (EMAIL & OPTIONAL PASSWORD) */}
          {/* ========================================================= */}
          {stage === "LOGIN" && (
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Email Address</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter email address"
                    className="w-full bg-slate-950 border border-slate-700/80 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-all"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-300">Password</label>
                  <button
                    type="button"
                    onClick={() => {
                      setErrorMessage("");
                      setStage("FORGOT_PASSWORD");
                    }}
                    className="text-[11px] text-slate-400 hover:text-orange-400 transition-colors"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    placeholder="Enter password"
                    className="w-full bg-slate-950 border border-slate-700/80 rounded-xl pl-10 pr-10 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full mt-2 bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white font-semibold py-2.5 px-4 rounded-xl text-sm shadow-lg shadow-orange-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Verifying...</span>
                  </>
                ) : (
                  <>
                    <span>Proceed with 2FA</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* ========================================================= */}
          {/* STAGE 2: 6-DIGIT OTP VERIFICATION */}
          {/* ========================================================= */}
          {stage === "OTP" && (
            <form onSubmit={handleOtpSubmit} className="space-y-5">
              <div className="text-center">
                <div className="w-12 h-12 bg-orange-500/10 border border-orange-500/20 text-orange-400 rounded-full flex items-center justify-center mx-auto mb-3">
                  <KeyRound className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-white">
                  {isFirstTime ? "Account Setup Verification" : "Enter Two-Factor Code"}
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  We sent a 6-digit code to <strong className="text-slate-200">{email}</strong>
                </p>
              </div>

              <div>
                <label className="block text-center text-xs font-semibold text-slate-400 mb-2">
                  6-Digit Verification Code
                </label>
                <input
                  type="text"
                  maxLength={6}
                  autoFocus
                  value={otp}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, "");
                    setOtp(val);
                  }}
                  placeholder="000000"
                  className="w-full bg-slate-950 border-2 border-orange-500/40 rounded-xl py-3 text-center text-2xl font-mono tracking-[0.5em] text-orange-400 focus:outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10 transition-all"
                />
              </div>

              <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setStage("LOGIN");
                    setErrorMessage("");
                  }}
                  className="hover:text-slate-200 flex items-center gap-1 transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Change email</span>
                </button>

                {countdown > 0 ? (
                  <span className="text-slate-500 font-mono">Resend code in {countdown}s</span>
                ) : (
                  <button
                    type="button"
                    onClick={handleResend}
                    className="text-orange-400 hover:text-orange-300 font-semibold transition-colors"
                  >
                    Resend Code
                  </button>
                )}
              </div>

              <button
                type="submit"
                disabled={isSubmitting || otp.length !== 6}
                className="w-full bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white font-semibold py-2.5 px-4 rounded-xl text-sm shadow-lg shadow-orange-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Verifying Code...</span>
                  </>
                ) : (
                  <>
                    <span>Verify & Continue</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* ========================================================= */}
          {/* STAGE 3: SET NEW SECURE PASSWORD */}
          {/* ========================================================= */}
          {stage === "SET_PASSWORD" && (
            <form onSubmit={handleSetPasswordSubmit} className="space-y-4">
              <div className="text-center mb-2">
                <div className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-2">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-white">Create Admin Password</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Set a strong password for future multi-factor logins
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">New Password</label>
                <div className="relative">
                  <input
                    type={showNewPassword ? "text" : "password"}
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password"
                    className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3.5 pr-10 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((prev) => !prev)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-500 hover:text-slate-300"
                  >
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Confirm Password</label>
                <input
                  type={showNewPassword ? "text" : "password"}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-type new password"
                  className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-all"
                />
              </div>

              {/* Password Requirement Badges */}
              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 space-y-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  Security Requirements
                </span>
                <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                  <div className={`flex items-center gap-1.5 ${passHasLength ? "text-emerald-400" : "text-slate-500"}`}>
                    {passHasLength ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                    <span>8+ characters</span>
                  </div>
                  <div className={`flex items-center gap-1.5 ${passHasUpper ? "text-emerald-400" : "text-slate-500"}`}>
                    {passHasUpper ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                    <span>Uppercase (A-Z)</span>
                  </div>
                  <div className={`flex items-center gap-1.5 ${passHasLower ? "text-emerald-400" : "text-slate-500"}`}>
                    {passHasLower ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                    <span>Lowercase (a-z)</span>
                  </div>
                  <div className={`flex items-center gap-1.5 ${passHasNumber ? "text-emerald-400" : "text-slate-500"}`}>
                    {passHasNumber ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                    <span>Numeric (0-9)</span>
                  </div>
                  <div className={`flex items-center gap-1.5 col-span-2 ${passHasSpecial ? "text-emerald-400" : "text-slate-500"}`}>
                    {passHasSpecial ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                    <span>Special character (!@#$%^&*)</span>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting || !isPasswordValid || newPassword !== confirmPassword}
                className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-semibold py-2.5 px-4 rounded-xl text-sm shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Encrypting & Saving...</span>
                  </>
                ) : (
                  <>
                    <span>Activate Account & Sign In</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* ========================================================= */}
          {/* STAGE 4: FORGOT PASSWORD */}
          {/* ========================================================= */}
          {stage === "FORGOT_PASSWORD" && (
            <form onSubmit={handleForgotPasswordSubmit} className="space-y-4">
              <div className="text-center mb-2">
                <div className="w-12 h-12 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-full flex items-center justify-center mx-auto mb-2">
                  <KeyRound className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-white">Reset Admin Password</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Enter your admin email to receive a recovery verification code
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Registered Email</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@davadesk.in"
                    className="w-full bg-slate-950 border border-slate-700/80 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-all"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between text-xs pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setStage("LOGIN");
                    setErrorMessage("");
                  }}
                  className="text-slate-400 hover:text-slate-200 flex items-center gap-1 transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back to login</span>
                </button>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white font-semibold py-2.5 px-4 rounded-xl text-sm shadow-lg shadow-orange-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Sending Code...</span>
                  </>
                ) : (
                  <>
                    <span>Send Verification Code</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
