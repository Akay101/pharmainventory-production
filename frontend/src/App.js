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

// Layout
import DashboardLayout from "./components/DashboardLayout";
import UpgradePage from "./pages/UpgradePage";
import PaymentSuccessPage from "./pages/PaymentSuccessPage";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

axios.defaults.withCredentials = true;

export const getCookie = (name) => {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(';').shift();
  return null;
};

export const deleteCookie = (name) => {
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
};

let navigateGlobal = null;

const NavigationHandler = () => {
  const navigate = useNavigate();

  useEffect(() => {
    navigateGlobal = navigate;
  }, [navigate]);

  return null;
};

// Auth Context
const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);

const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [pharmacy, setPharmacy] = useState(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState(getCookie("pharmalogy_token"));
  const [settings, setSettings] = useState({});
  const [settingsDefinitions, setSettingsDefinitions] = useState([]);

  useEffect(() => {
    const handleTokenRefreshed = (e) => {
      setToken(e.detail.token);
    };

    const handleLogoutEvent = () => {
      logout();
    };

    window.addEventListener("auth-token-refreshed", handleTokenRefreshed);
    window.addEventListener("auth-logout", handleLogoutEvent);

    return () => {
      window.removeEventListener("auth-token-refreshed", handleTokenRefreshed);
      window.removeEventListener("auth-logout", handleLogoutEvent);
    };
  }, []);

  useEffect(() => {
    fetchUser();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await axios.get(`${API}/settings`);
      setSettings(response.data.preferences);
      setSettingsDefinitions(response.data.settings);
    } catch (error) {
      console.error("Settings error:", error);
    }
  };

  const updateSetting = async (key, value) => {
    try {
      // Optimistic update
      setSettings((prev) => ({ ...prev, [key]: value }));

      await axios.post(
        `${API}/settings/update`,
        { key, value }
      );

      // Refresh definitions as well
      const response = await axios.get(`${API}/settings`);
      setSettingsDefinitions(response.data.settings);
    } catch (error) {
      console.error("Failed to update setting:", error);
      // Rollback? Currently just logging.
    }
  };

  const fetchUser = async () => {
    try {
      const response = await axios.get(`${API}/auth/me`);
      setUser(response.data.user);
      setPharmacy(response.data.pharmacy);
      setToken("present");
      // Fetch settings after user is confirmed
      fetchSettings();
    } catch (error) {
      const status = error.response?.status;

      if (status === 401) {
        deleteCookie("pharmalogy_token");
        deleteCookie("pharmalogy_refresh_token");
        setToken(null);
        setUser(null);
        setPharmacy(null);
      } else {
        console.error("Auth error:", error);
      }
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    const response = await axios.post(`${API}/auth/login`, { email, password });
    const newToken = getCookie("pharmalogy_token") || "present";
    const userData = response.data.user;
    setToken(newToken);
    setUser(userData);
    await fetchUser();
    return userData;
  };

  const logout = async () => {
    try {
      await axios.post(`${API}/auth/logout`);
    } catch (error) {
      console.error("Failed to logout on backend:", error);
    } finally {
      deleteCookie("pharmalogy_token");
      deleteCookie("pharmalogy_refresh_token");
      setToken(null);
      setUser(null);
      setPharmacy(null);
      setSettings({});
      setSettingsDefinitions([]);
    }
  };

  const value = {
    user,
    pharmacy,
    token,
    loading,
    login,
    logout,
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
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
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

axios.interceptors.request.use(
  (config) => {
    const token = getCookie("pharmalogy_token");
    if (token && token !== "null" && token !== "undefined") {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

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

    // 🔐 Avoid infinite loop if refresh/logout request fails with 401
    if (originalRequest.url?.includes("/auth/logout")) {
      return Promise.reject(error);
    }

    if (originalRequest.url?.includes("/auth/refresh")) {
      deleteCookie("pharmalogy_token");
      deleteCookie("pharmalogy_refresh_token");
      window.dispatchEvent(new Event("auth-logout"));
      return Promise.reject(error);
    }

    // 🔐 Auth error
    if (status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            if (token && token !== "null" && token !== "undefined") {
              originalRequest.headers.Authorization = `Bearer ${token}`;
            }
            return axios(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        await axios.post(`${API}/auth/refresh`);
        const newToken = getCookie("pharmalogy_token");

        window.dispatchEvent(
          new CustomEvent("auth-token-refreshed", {
            detail: { token: newToken },
          })
        );

        if (newToken && newToken !== "null" && newToken !== "undefined") {
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
        }
        processQueue(null, newToken);
        return axios(originalRequest);
      } catch (refreshErr) {
        processQueue(refreshErr, null);
        deleteCookie("pharmalogy_token");
        deleteCookie("pharmalogy_refresh_token");
        window.dispatchEvent(new Event("auth-logout"));
        return Promise.reject(refreshErr);
      } finally {
        isRefreshing = false;
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

      return;
    }

    return Promise.reject(error);
  }
);

// axios.interceptors.response.use(
//   (response) => response,
//   (error) => {
//     if (error.response?.status === 401) {
//       localStorage.removeItem("pharmalogy_token");
//       window.location.href = "/login";
//     }
//     return Promise.reject(error);
//   }
// );

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
        <Routes>
          {/* Public Routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
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
