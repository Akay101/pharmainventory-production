import { IS_DESKTOP, useOnlineFeatures } from "./lib/desktop";
import DesktopAuthorizePage from "./pages/DesktopAuthorizePage";
import DownloadPage from "./pages/DownloadPage";
import SyncCenterPage from "./pages/SyncCenterPage";
import { useState, useEffect, useRef, createContext, useContext } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useNavigate,
  useLocation,
} from "react-router-dom";
import axios from "axios";
import { Toaster } from "./components/ui/sonner";
import { toast } from "sonner";

// Pages
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetLinkPage from "./pages/ResetLinkPage";
import DashboardPage from "./pages/DashboardPage";
import InventoryPage from "./pages/InventoryPage";
import PurchasesPage from "./pages/PurchasesPage";
import BillingPage from "./pages/BillingPage";
import SuppliersPage from "./pages/SuppliersPage";
import CustomersPage from "./pages/CustomersPage";
import UsersPage from "./pages/UsersPage";
import SettingsPage from "./pages/SettingsPage";
import ReportsPage from "./pages/ReportsPage";
import ScannerPage from "./pages/ScannerPage";
import BillingScannerPage from "./pages/BillingScannerPage";
import AssistantPage from "./pages/AssistantPage";
import ExpiryPage from "./pages/ExpiryPage";
import ReturnsPage from "./pages/ReturnsPage";
import SupportPage from "./pages/SupportPage";
import ShortBookPage from "./pages/ShortBookPage";
import RestockPage from "./pages/RestockPage";
import LimitedHome from "./components/access/LimitedHome";

// Layout
import DashboardLayout from "./components/DashboardLayout";
import UpgradePage from "./pages/UpgradePage";
import EarlyAccessTermsPage, { needsEarlyAccessTerms } from "./pages/EarlyAccessTermsPage";
import PaymentSuccessPage from "./pages/PaymentSuccessPage";
import Loader from "./components/Loader";
import ErrorBoundary from "./components/ErrorBoundary";
import { GuideProvider, GuideStage } from "./components/guide/GuideProvider";
import { getPageTitle } from "./hooks/useDocumentTitle";
import { deviceProof, proofActionFor, setServerTime } from "./lib/deviceIdentity";
import { RequireAccess } from "./components/access/Can";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

// The refresh token lives in an httpOnly cookie scoped to /api/auth, so the
// browser must send credentials on those calls.
axios.defaults.withCredentials = true;

// A random id for this browser, used only when it can't hold a device key
// (lib/deviceIdentity.js). Not a secret; the server only stores its hash.
const DEVICE_KEY = "dd_device_id";
export const getDeviceId = () => {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id || !/^[A-Za-z0-9_-]{16,64}$/.test(id)) {
      const bytes = new Uint8Array(18);
      (window.crypto || {}).getRandomValues?.(bytes);
      id = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("") || `d${Date.now()}${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
};
const clientTimeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch {
    return "";
  }
};

// Why the last session ended, shown once on the sign-in page
export const SIGNED_OUT_REASON_KEY = "dd_signed_out_reason";
const rememberSignOutReason = (text) => {
  try {
    if (text) sessionStorage.setItem(SIGNED_OUT_REASON_KEY, text);
  } catch {
    /* private mode */
  }
};
const SESSION_END_TEXT = {
  SIGNED_IN_ELSEWHERE: "You were signed out because your account was signed in on another device of the same kind.",
  DEVICE_MISMATCH: "This sign-in belongs to another device. Please sign in again.",
  SEAT_EXPIRED: "Your user licence has expired. Ask the pharmacy owner to renew it.",
  SEAT_REQUIRED: "Your user account doesn't have a licence. Ask the pharmacy owner.",
  USER_DISABLED: "Your user has been switched off by the pharmacy owner.",
  NO_PHARMACY_ACCESS: "You don't have access to any pharmacy on this account. Ask the owner.",
};

// ---------------------------------------------------------------------------
// Session tokens
//
// The short-lived access token is kept in memory only (never localStorage or
// a JS-readable cookie), so injected scripts can't lift a long-lived session.
// On page load the session is restored by calling /auth/refresh, which reads
// the httpOnly refresh cookie and rotates it.
// ---------------------------------------------------------------------------
let accessToken = null;
let refreshTimer = null;
let refreshPromise = null;

const authChannel =
  typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("davadesk-auth") : null;

const tokenExpiryMs = (token) => {
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return payload.exp * 1000;
  } catch {
    return 0;
  }
};

export const getAccessToken = () => accessToken;

const setAccessToken = (token) => {
  accessToken = token || null;
  clearTimeout(refreshTimer);
  if (!accessToken) return;
  // Renew a minute before expiry so requests rarely see a 401
  const delay = Math.max(tokenExpiryMs(accessToken) - Date.now() - 60 * 1000, 5 * 1000);
  refreshTimer = setTimeout(() => {
    refreshSession().catch(() => {});
  }, delay);
};

// Single-flight refresh shared by every caller
const refreshSession = () => {
  if (!refreshPromise) {
    refreshPromise = axios
      .post(`${API}/auth/refresh`, null, { _skipAuthRetry: true })
      .then((res) => {
        setAccessToken(res.data.token);
        return res.data.token;
      })
      .catch((err) => {
        setAccessToken(null);
        const code = err.response?.data?.code;
        if (SESSION_END_TEXT[code]) rememberSignOutReason(err.response.data.detail || SESSION_END_TEXT[code]);
        throw err;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
};

// For fetch-based callers (streaming) that can't use the axios interceptor
export const refreshAccessToken = () => refreshSession();

// Drop pre-redesign tokens that older builds kept in localStorage
["pharmalogy_token", "pharmalogy_refresh_token"].forEach((k) => localStorage.removeItem(k));

let navigateGlobal = null;

// On the desktop app: sign-in lives in the browser, and pages that need the cloud
// wait for internet, including when reached through shortcuts
const DESKTOP_ONLINE_PATHS = ["/assistant", "/scan", "/scan-bill", "/support"];
const DESKTOP_NEVER_PATHS = ["/login", "/register", "/forgot-password", "/upgrade", "/download", "/desktop/authorize"];
const DesktopRouteGuard = () => {
  const { pathname } = useLocation();
  const online = useOnlineFeatures();
  if (!IS_DESKTOP) return null;
  if (DESKTOP_NEVER_PATHS.includes(pathname) || (!online && DESKTOP_ONLINE_PATHS.includes(pathname))) return <Navigate to="/dashboard" replace />;
  return null;
};

const NavigationHandler = () => {
  const navigate = useNavigate();

  useEffect(() => {
    navigateGlobal = navigate;
  }, [navigate]);

  return null;
};

const PageTitleHandler = () => {
  const location = useLocation();

  useEffect(() => {
    document.title = getPageTitle(location.pathname);
  }, [location.pathname]);

  return null;
};

// Auth Context
const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);

const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [pharmacy, setPharmacy] = useState(null);
  const [pharmacies, setPharmacies] = useState([]);
  const [activePharmacyId, setActivePharmacyId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState({});
  const [settingsDefinitions, setSettingsDefinitions] = useState([]);

  const applyPharmacies = (data) => {
    if (Array.isArray(data?.pharmacies)) setPharmacies(data.pharmacies);
    if (data?.active_pharmacy_id) setActivePharmacyId(data.active_pharmacy_id);
  };

  const clearSession = () => {
    setAccessToken(null);
    setUser(null);
    setPharmacy(null);
    setPharmacies([]);
    setActivePharmacyId(null);
    setSettings({});
    setSettingsDefinitions([]);
  };

  useEffect(() => {
    const handleLogoutEvent = () => clearSession();
    window.addEventListener("auth-logout", handleLogoutEvent);

    // Sign-out in another tab signs this tab out too; a pharmacy switch
    // reloads the other tabs so no page keeps another pharmacy's data
    const onMessage = (e) => {
      if (e.data === "logout") clearSession();
      if (e.data === "login") restoreSession();
      if (e.data === "pharmacy-switched") window.location.reload();
    };
    authChannel?.addEventListener("message", onMessage);

    return () => {
      window.removeEventListener("auth-logout", handleLogoutEvent);
      authChannel?.removeEventListener("message", onMessage);
    };
  }, []);

  useEffect(() => {
    restoreSession();
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme === "light") {
      document.documentElement.classList.add("light");
    } else if (savedTheme === "dark") {
      document.documentElement.classList.remove("light");
    }
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await axios.get(`${API}/settings`);
      const prefs = response.data.preferences || {};
      setSettings(prefs);
      setSettingsDefinitions(response.data.settings || []);

      if (prefs.theme) {
        localStorage.setItem("theme", prefs.theme);
        if (prefs.theme === "light") {
          document.documentElement.classList.add("light");
        } else if (prefs.theme === "dark") {
          document.documentElement.classList.remove("light");
        }
      }
    } catch (error) {
      console.error("Settings error:", error);
    }
  };

  const updateSetting = async (key, value) => {
    try {
      // Optimistic update
      setSettings((prev) => ({ ...prev, [key]: value }));

      if (key === "theme") {
        localStorage.setItem("theme", value);
        if (value === "light") {
          document.documentElement.classList.add("light");
        } else if (value === "dark") {
          document.documentElement.classList.remove("light");
        }
      }

      await axios.post(
        `${API}/settings/update`,
        { key, value }
      );

      // Refresh definitions as well
      const response = await axios.get(`${API}/settings`);
      setSettingsDefinitions(response.data.settings);
    } catch (error) {
      console.error("Failed to update setting:", error);
    }
  };

  // Re-read the signed-in user (e.g. after a plan change)
  const fetchUser = async () => {
    const response = await axios.get(`${API}/auth/me`);
    setUser(response.data.user);
    setPharmacy(response.data.pharmacy);
    applyPharmacies(response.data);
    return response.data.user;
  };

  // Access changes made by the owner reach an open app: when the server says
  // no, and when the tab comes back after a while, re-read this user's access
  const lastAccessCheck = useRef(Date.now());
  useEffect(() => {
    if (!user || user.access?.full) return undefined;
    const recheck = (force) => {
      if (!force && Date.now() - lastAccessCheck.current < 60 * 1000) return;
      lastAccessCheck.current = Date.now();
      fetchUser().catch(() => {});
    };
    const onDenied = () => recheck(true);
    const onVisible = () => document.visibilityState === "visible" && recheck(false);
    window.addEventListener("access-changed", onDenied);
    document.addEventListener("visibilitychange", onVisible);
    const t = setInterval(() => recheck(false), 2 * 60 * 1000);
    return () => {
      window.removeEventListener("access-changed", onDenied);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(t);
    };
  }, [user?.id, user?.access?.full]); // eslint-disable-line

  // Work in another pharmacy of the account. The page reloads so nothing on
  // screen belongs to the previous pharmacy.
  const switchPharmacy = async (pharmacyId) => {
    const res = await axios.post(`${API}/auth/switch-pharmacy`, { pharmacy_id: pharmacyId });
    setAccessToken(res.data.token);
    authChannel?.postMessage("pharmacy-switched");
    window.location.assign("/dashboard");
  };

  const restoreSession = async () => {
    try {
      if (!accessToken) await refreshSession();
      await fetchUser();
      fetchSettings();
    } catch (error) {
      if (error.response?.status === 401) {
        clearSession();
      } else {
        console.error("Auth error:", error);
      }
    } finally {
      setLoading(false);
    }
  };

  // Accepts a response from /auth/login or /auth/verify-otp
  const completeLogin = (data) => {
    setAccessToken(data.token);
    setUser(data.user);
    setPharmacy(data.pharmacy || null);
    applyPharmacies(data);
    try {
      sessionStorage.removeItem(SIGNED_OUT_REASON_KEY);
    } catch {
      /* private mode */
    }
    fetchSettings();
    authChannel?.postMessage("login");
    return data.user;
  };

  // Throws with code SESSION_ACTIVE_ELSEWHERE (and a ticket) when another
  // device holds the session; continueLogin(ticket) then takes it over.
  const login = async (email, password) => {
    const response = await axios.post(`${API}/auth/login`, { email, password });
    return completeLogin(response.data);
  };
  const continueLogin = async (ticket) => {
    const response = await axios.post(`${API}/auth/login/continue`, { ticket });
    return completeLogin(response.data);
  };

  // Permission check for showing/hiding UI (the server enforces the same)
  const can = (module, action = "read") => {
    const a = user?.access;
    if (!a || a.full) return true;
    return a.modules?.[module]?.[action] === true;
  };
  // A behaviour rule on this user (no_credit_billing, max_discount_percent, ...), or null
  const rule = (key) => {
    const a = user?.access;
    if (!a || a.full) return null;
    return a.restrictions?.[key] ?? null;
  };

  const logout = async (notifyBackend = true) => {
    if (notifyBackend) {
      try {
        await axios.post(`${API}/auth/logout`, null, { _skipAuthRetry: true });
      } catch (error) {
        console.error("Failed to logout on backend:", error);
      }
    }
    clearSession();
    authChannel?.postMessage("logout");
  };

  const value = {
    user,
    pharmacy,
    token: accessToken,
    loading,
    login,
    continueLogin,
    completeLogin,
    logout,
    pharmacies,
    activePharmacyId,
    switchPharmacy,
    can,
    rule,
    isOwner: !!user?.is_primary_admin,
    fetchUser,
    setUser,
    setPharmacy,
    settings,
    settingsDefinitions,
    updateSetting,
    fetchSettings,
    isAdmin: user?.role === "ADMIN",
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// Protected Route
const ProtectedRoute = ({ children, adminOnly = false }) => {
  const { user, loading, isAdmin } = useAuth();
  const location = useLocation();

  if (loading) {
    return <Loader fullScreen text="Loading Workspace..." />;
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (adminOnly && !isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  // Early access pharmacies: each user accepts the early access terms first
  if (needsEarlyAccessTerms(user)) {
    return <Navigate to="/early-access/terms" replace />;
  }

  return children;
};

// Pharmacists without access to the figures get a page of shortcuts instead
const DashboardGate = () => {
  const { can } = useAuth();
  return can("dashboard", "read") ? <DashboardPage /> : <LimitedHome />;
};

let isRedirecting = false;

const isApiUrl = (url = "") => url.startsWith(API) || url.startsWith("/api");

axios.interceptors.request.use(
  async (config) => {
    // Only ever attach the token to our own API
    if (isApiUrl(config.url)) {
      if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
      const device = getDeviceId();
      if (device) config.headers["X-Device-Id"] = device;
      const tz = clientTimeZone();
      if (tz) config.headers["X-Client-Timezone"] = tz;
      // Sign-in and refresh prove they come from this device's key
      const action = proofActionFor(config.url);
      if (action) {
        const proof = await deviceProof(action);
        if (proof) config.headers["X-Device-Proof"] = proof;
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

axios.interceptors.response.use(
  (response) => {
    const method = response.config?.method?.toLowerCase();
    if (["post", "put", "delete", "patch"].includes(method)) {
      window.dispatchEvent(new Event("activity-updated"));
    }
    return response;
  },
  async (error) => {
    const originalRequest = error.config;
    const status = error.response?.status;
    const code = error.response?.data?.code;

    // Desktop app with no internet: one clear message, whichever feature asked
    if (code === "NEEDS_INTERNET") {
      toast.info(error.response.data.detail, { id: "needs-internet" });
      return Promise.reject(error);
    }

    if (!originalRequest) {
      return Promise.reject(error);
    }

    // This device's clock is off: learn the server time and sign again once
    if (code === "DEVICE_CLOCK" && !originalRequest._clockRetry) {
      setServerTime(Number(error.response.data.server_time));
      originalRequest._clockRetry = true;
      return axios(originalRequest);
    }

    // Rate limited (by the API or nginx, whose 429 has no JSON detail):
    // one clear toast, and the message pages show uses it too
    if (status === 429) {
      const detail = error.response?.data?.detail || "Too many requests. Please wait a few seconds and try again.";
      if (error.response && typeof error.response.data !== "object") error.response.data = { detail, code: "RATE_LIMITED" };
      toast.warning(detail, { id: "rate-limited" });
      return Promise.reject(error);
    }

    // This user can't use the app any more (licence ended, switched off)
    if (status === 403 && ["SEAT_EXPIRED", "SEAT_REQUIRED", "USER_DISABLED", "NO_PHARMACY_ACCESS"].includes(code)) {
      rememberSignOutReason(error.response.data.detail || SESSION_END_TEXT[code]);
      toast.error(error.response.data.detail || SESSION_END_TEXT[code], { id: "session-ended" });
      window.dispatchEvent(new Event("auth-logout"));
      return Promise.reject(error);
    }

    // Access management: one clear message, whichever page asked
    if (status === 403 && (code === "PERMISSION_DENIED" || code === "ACTION_BLOCKED")) {
      toast.error(error.response.data.detail, { id: `perm-${code}` });
      error.permissionToastShown = true;
      if (code === "PERMISSION_DENIED") window.dispatchEvent(new Event("access-changed"));
      return Promise.reject(error);
    }

    // 🔐 Never retry the auth endpoints themselves
    if (originalRequest._skipAuthRetry || originalRequest.url?.includes("/auth/")) {
      return Promise.reject(error);
    }

    // 🔐 Expired access token: refresh once (shared) and replay
    if (status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const newToken = await refreshSession();
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return axios(originalRequest);
      } catch (refreshErr) {
        const why = refreshErr.response?.data?.code;
        if (SESSION_END_TEXT[why]) toast.error(SESSION_END_TEXT[why], { id: "session-ended", duration: 8000 });
        window.dispatchEvent(new Event("auth-logout"));
        return Promise.reject(error);
      }
    }

    // 💳 Subscription error
    if (
      status === 403 &&
      !isRedirecting &&
      (code === "SUBSCRIPTION_REQUIRED" ||
        code === "SUBSCRIPTION_EXPIRED" ||
        code === "PLAN_UPGRADE_REQUIRED")
    ) {
      isRedirecting = true;

      if (navigateGlobal) {
        navigateGlobal("/upgrade");
      }

      setTimeout(() => {
        isRedirecting = false;
      }, 1000);

      return Promise.reject(error);
    }

    return Promise.reject(error);
  }
);

function App() {
  return (
    <AuthProvider>
      {/* <div
        id="under-development-banner"
        style={{ height: "28px" }}
        className="fixed top-0 left-0 right-0 bg-amber-600 text-white text-center text-[10px] sm:text-xs font-semibold select-none flex items-center justify-center gap-1.5 z-[999999] border-b border-amber-500/20 shadow-sm px-4"
      >
        <span>⚠️</span>
        <span className="truncate">
          You are currently using the under development version of the
          application which may have bugs and performance issues so please
          contact support team in case of errors
        </span>
      </div> */}
      <BrowserRouter>
        <NavigationHandler />
        <DesktopRouteGuard />
        <PageTitleHandler />
        <GuideProvider>
        <ErrorBoundary>
        <Routes>
          {/* Public Routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password/link" element={<ResetLinkPage />} />
          <Route path="/upgrade" element={<UpgradePage />} />
          <Route path="/download" element={<DownloadPage />} />
          <Route
            path="/desktop/authorize"
            element={
              <ProtectedRoute>
                <DesktopAuthorizePage />
              </ProtectedRoute>
            }
          />
          <Route path="/early-access/terms" element={<EarlyAccessTermsPage />} />
          <Route path="/payment-success" element={<PaymentSuccessPage />} />

          {/* Scanner Route - Standalone for mobile */}
          <Route
            path="/scan"
            element={
              <ProtectedRoute>
                <RequireAccess module="purchases" action="create">
                  <ScannerPage />
                </RequireAccess>
              </ProtectedRoute>
            }
          />
          <Route
            path="/assistant"
            element={
              <ProtectedRoute>
                <RequireAccess module="assistant">
                  <GuideStage>
                    <AssistantPage />
                  </GuideStage>
                </RequireAccess>
              </ProtectedRoute>
            }
          />
          <Route
            path="/scan-bill"
            element={
              <ProtectedRoute>
                <RequireAccess module="billing" action="create">
                  <BillingScannerPage />
                </RequireAccess>
              </ProtectedRoute>
            }
          />

          {/* Protected Routes */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <DashboardLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<DashboardGate />} />
            <Route path="inventory" element={<RequireAccess module="inventory"><InventoryPage /></RequireAccess>} />
            <Route path="purchases" element={<RequireAccess module="purchases"><PurchasesPage /></RequireAccess>} />
            <Route path="billing" element={<RequireAccess module="billing"><BillingPage /></RequireAccess>} />
            <Route path="suppliers" element={<RequireAccess module="suppliers"><SuppliersPage /></RequireAccess>} />
            <Route path="customers" element={<RequireAccess module="customers"><CustomersPage /></RequireAccess>} />
            <Route path="expiry" element={<RequireAccess module="expiry"><ExpiryPage /></RequireAccess>} />
            <Route path="returns" element={<RequireAccess module="returns"><ReturnsPage /></RequireAccess>} />
            <Route
              path="users"
              element={
                <RequireAccess adminOnly>
                  <UsersPage />
                </RequireAccess>
              }
            />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="reports" element={<RequireAccess module="dashboard"><ReportsPage /></RequireAccess>} />
            <Route path="support" element={<SupportPage />} />
            <Route path="short-book" element={<RequireAccess module="short_book"><ShortBookPage /></RequireAccess>} />
            <Route path="restock" element={<RequireAccess module="restock"><RestockPage /></RequireAccess>} />
            {IS_DESKTOP && <Route path="sync" element={<SyncCenterPage />} />}
          </Route>

          {/* Catch all */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
        </ErrorBoundary>
        </GuideProvider>
      </BrowserRouter>
      <Toaster position="top-right" richColors />
    </AuthProvider>
  );
}

export default App;
