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
  const [token, setToken] = useState(localStorage.getItem("pharmalogy_token"));
  const [settings, setSettings] = useState({});
  const [settingsDefinitions, setSettingsDefinitions] = useState([]);

  useEffect(() => {
    if (token) {
      fetchUser();
    } else {
      setLoading(false);
    }
  }, [token]);

  const fetchSettings = async () => {
    try {
      const response = await axios.get(`${API}/settings`, {
        headers: { Authorization: `Bearer ${token}` },
      });
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
      
      await axios.post(`${API}/settings/update`, { key, value }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      // Refresh definitions as well
      const response = await axios.get(`${API}/settings`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setSettingsDefinitions(response.data.settings);
    } catch (error) {
      console.error("Failed to update setting:", error);
      // Rollback? Currently just logging.
    }
  };

  const fetchUser = async () => {
    try {
      const response = await axios.get(`${API}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setUser(response.data.user);
      setPharmacy(response.data.pharmacy);
      // Fetch settings after user is confirmed
      fetchSettings();
    } catch (error) {
      const status = error.response?.status;

      if (status === 401) {
        logout(); // only logout if token invalid
      } else {
        console.error("Auth error:", error);
      }
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    const response = await axios.post(`${API}/auth/login`, { email, password });
    const { token: newToken, user: userData } = response.data;
    localStorage.setItem("pharmalogy_token", newToken);
    setToken(newToken);
    setUser(userData);
    return userData;
  };

  const logout = () => {
    localStorage.removeItem("pharmalogy_token");
    setToken(null);
    setUser(null);
    setPharmacy(null);
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

  // if (!user) {
  //   return <Navigate to="/login" state={{ from: location }} replace />;
  // }

  if (adminOnly && !isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
};

let isRedirecting = false;

axios.interceptors.response.use(
  (response) => {
    const method = response.config?.method?.toLowerCase();
    if (['post', 'put', 'delete', 'patch'].includes(method)) {
      window.dispatchEvent(new Event('activity-updated'));
    }
    return response;
  },
  (error) => {
    const status = error.response?.status;
    const code = error.response?.data?.code;

    // 🔐 Auth error
    if (status === 401) {
      localStorage.removeItem("pharmalogy_token");
      // window.location.href = "/login";
      return;
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
      <BrowserRouter>
        <NavigationHandler />
        <Routes>
          {/* Public Routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/upgrade" element={<UpgradePage />} />
          <Route path="/payment-success" element={<PaymentSuccessPage />} />

          {/* Scanner Route - Standalone for mobile */}
          <Route path="/scan" element={<ScannerPage />} />

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
