import { useState, useEffect, createContext, useContext } from "react";
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

// Pages
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
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

// Layout
import DashboardLayout from "./components/DashboardLayout";
import UpgradePage from "./pages/UpgradePage";
import PaymentSuccessPage from "./pages/PaymentSuccessPage";
import Loader from "./components/Loader";
import { getPageTitle } from "./hooks/useDocumentTitle";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

// The refresh token lives in an httpOnly cookie scoped to /api/auth, so the
// browser must send credentials on those calls.
axios.defaults.withCredentials = true;

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
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState({});
  const [settingsDefinitions, setSettingsDefinitions] = useState([]);

  const clearSession = () => {
    setAccessToken(null);
    setUser(null);
    setPharmacy(null);
    setSettings({});
    setSettingsDefinitions([]);
  };

  useEffect(() => {
    const handleLogoutEvent = () => clearSession();
    window.addEventListener("auth-logout", handleLogoutEvent);

    // Sign-out in another tab signs this tab out too
    const onMessage = (e) => {
      if (e.data === "logout") clearSession();
      if (e.data === "login") restoreSession();
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
    return response.data.user;
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
    fetchSettings();
    authChannel?.postMessage("login");
    return data.user;
  };

  const login = async (email, password) => {
    const response = await axios.post(`${API}/auth/login`, { email, password });
    return completeLogin(response.data);
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
    completeLogin,
    logout,
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

  return children;
};

let isRedirecting = false;

const isApiUrl = (url = "") => url.startsWith(API) || url.startsWith("/api");

axios.interceptors.request.use(
  (config) => {
    // Only ever attach the token to our own API
    if (accessToken && isApiUrl(config.url)) {
      config.headers.Authorization = `Bearer ${accessToken}`;
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

    if (!originalRequest) {
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
        <PageTitleHandler />
        <Routes>
          {/* Public Routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/upgrade" element={<UpgradePage />} />
          <Route path="/payment-success" element={<PaymentSuccessPage />} />

          {/* Scanner Route - Standalone for mobile */}
          <Route
            path="/scan"
            element={
              <ProtectedRoute>
                <ScannerPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/assistant"
            element={
              <ProtectedRoute>
                <AssistantPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/scan-bill"
            element={
              <ProtectedRoute>
                <BillingScannerPage />
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
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="inventory" element={<InventoryPage />} />
            <Route path="purchases" element={<PurchasesPage />} />
            <Route path="billing" element={<BillingPage />} />
            <Route path="suppliers" element={<SuppliersPage />} />
            <Route path="customers" element={<CustomersPage />} />
            <Route path="expiry" element={<ExpiryPage />} />
            <Route path="returns" element={<ReturnsPage />} />
            <Route
              path="users"
              element={
                <ProtectedRoute adminOnly>
                  <UsersPage />
                </ProtectedRoute>
              }
            />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="support" element={<SupportPage />} />
            <Route path="short-book" element={<ShortBookPage />} />
          </Route>

          {/* Catch all */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
      <Toaster position="top-right" richColors />
    </AuthProvider>
  );
}

export default App;
