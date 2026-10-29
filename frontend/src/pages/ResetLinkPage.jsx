import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";
import { API } from "../App";
import { Button } from "../components/ui/button";
import WaveInput from "../components/ui/WaveInput";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, Clock, Eye, EyeOff, KeyRound, Loader2, Lock, ShieldAlert, ShieldCheck } from "lucide-react";
import ThemeToggle from "../components/ui/ThemeToggle";
import FluidLinePattern from "../components/ui/FluidLinePattern";
import AuthLeftPanel from "../components/ui/AuthLeftPanel";

// A password reset link sent by DavaDesk support (admin panel). The token is
// in the URL fragment (/reset-password/link#<token>): browsers never send it
// to a server or in Referer. It is read once, then removed from the address
// bar and history, and only ever sent in a POST body.

const primaryBtn =
  "w-full h-12 font-bold text-sm bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white shadow-lg shadow-orange-500/25 transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 rounded-xl border-none";

const until = (d) => new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export default function ResetLinkPage() {
  const navigate = useNavigate();
  const token = useRef(null);
  const [state, setState] = useState("checking"); // checking | ready | invalid | done
  const [info, setInfo] = useState(null);
  const [invalidMsg, setInvalidMsg] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // No Referer to anything this page loads
    const meta = document.createElement("meta");
    meta.name = "referrer";
    meta.content = "no-referrer";
    document.head.appendChild(meta);

    if (token.current === null) {
      token.current = window.location.hash.replace(/^#/, "");
      window.history.replaceState(null, "", window.location.pathname);
    }
    const t = token.current;
    if (!t) {
      setState("invalid");
      return () => meta.remove();
    }
    axios
      .post(`${API}/auth/reset-link/check`, { token: t })
      .then((r) => {
        setInfo(r.data);
        setState("ready");
      })
      .catch((err) => {
        setInvalidMsg(err.response?.status === 429 ? "Too many tries. Please wait a few minutes and open the link again." : err.response?.data?.detail || "");
        setState("invalid");
      });
    return () => meta.remove();
  }, []);

  const submit = async () => {
    const next = {};
    if (password.length < 8) next.password = "Password must be at least 8 characters";
    else if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) next.password = "Use at least one letter and one number";
    if (confirm !== password) next.confirm = "Passwords don't match";
    setErrors(next);
    if (Object.keys(next).length) return;
    setLoading(true);
    try {
      const r = await axios.post(`${API}/auth/reset-link/complete`, { token: token.current, password });
      token.current = "";
      setInfo((i) => ({ ...i, email: r.data.email || i?.email }));
      setState("done");
    } catch (err) {
      const data = err.response?.data || {};
      if (data.field === "password") setErrors({ password: data.detail });
      else if (err.response?.status === 410) {
        setInvalidMsg(data.detail);
        setState("invalid");
      } else toast.error(data.detail || "Couldn't update the password. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full grid grid-cols-1 md:grid-cols-12 bg-background select-none overflow-hidden relative" data-testid="reset-link-page">
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
            <img src="/assets/svgs/logoBrand/logoOnlyWithoutBackground.svg" alt="DavaDesk" className="w-12 h-12 object-contain shrink-0 drop-shadow-sm" />
            <div className="flex flex-col">
              <span className="font-extrabold text-2xl tracking-tight text-foreground leading-tight">DavaDesk</span>
              <span className="text-xs font-semibold text-muted-foreground">Smart Pharmacy Software</span>
            </div>
          </div>

          {state === "checking" && (
            <div className="flex items-center gap-3 text-sm font-semibold text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin text-orange-500" /> Checking your link…
            </div>
          )}

          {state === "invalid" && (
            <div className="space-y-5">
              <div className="w-12 h-12 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div className="space-y-1.5">
                <h2 className="text-3xl font-extrabold tracking-tight text-foreground">This link can't be used</h2>
                <p className="text-muted-foreground text-sm font-semibold">
                  {invalidMsg || "This link is invalid or has expired. Ask DavaDesk support for a new one, or use Forgot password."}
                </p>
              </div>
              <Button className={primaryBtn} onClick={() => navigate("/forgot-password")}>
                Reset with an email code instead
              </Button>
            </div>
          )}

          {state === "ready" && (
            <>
              <div className="space-y-1.5 pt-1">
                <h2 className="text-3xl font-extrabold tracking-tight text-foreground">{info?.name ? `Hi ${info.name}, set a new password` : "Set a new password"}</h2>
                <p className="text-muted-foreground text-sm font-semibold">
                  For <span className="text-foreground font-extrabold">{info?.email}</span>. You'll be signed out on every device and can sign in with the new password.
                </p>
                {info?.expires_at && (
                  <p className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground pt-1">
                    <Clock className="w-3.5 h-3.5" /> Link valid until {until(info.expires_at)} · works once
                  </p>
                )}
              </div>
              <form
                className="space-y-6"
                noValidate
                onSubmit={(e) => {
                  e.preventDefault();
                  submit();
                }}
              >
                <WaveInput
                  id="new-password"
                  type={show ? "text" : "password"}
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
                    <button type="button" tabIndex={-1} className="p-1 text-muted-foreground hover:text-foreground rounded-lg" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"}>
                      {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  }
                />
                <WaveInput
                  id="confirm-password"
                  type={show ? "text" : "password"}
                  label="Confirm new password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  leftIcon={KeyRound}
                  required
                  error={errors.confirm}
                  autoComplete="new-password"
                  data-testid="confirm-password-input"
                />
                <Button type="submit" className={primaryBtn} disabled={loading} data-testid="reset-link-submit">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Set new password"}
                </Button>
                <p className="flex items-start gap-2 text-[11px] font-semibold text-muted-foreground">
                  <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-500" /> This link was made for your account only. Don't share it.
                </p>
              </form>
            </>
          )}

          {state === "done" && (
            <div className="space-y-5" data-testid="reset-link-done">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div className="space-y-1.5">
                <h2 className="text-3xl font-extrabold tracking-tight text-foreground">Password updated</h2>
                <p className="text-muted-foreground text-sm font-semibold">Sign in with your new password. Any other signed-in devices have been signed out.</p>
              </div>
              <Button className={primaryBtn} onClick={() => navigate("/login", { replace: true })}>
                Sign in
              </Button>
            </div>
          )}

          {state !== "done" && (
            <div className="text-center text-sm font-semibold text-muted-foreground pt-2">
              <Link to="/login" className="inline-flex items-center gap-1.5 text-orange-500 hover:text-orange-600 font-extrabold underline-offset-4 hover:underline">
                <ArrowLeft className="w-4 h-4" />
                Back to sign in
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
