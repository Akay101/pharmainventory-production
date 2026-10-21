import axios from "axios";

// Storage Keys
export const STORAGE_KEYS = {
  TOKEN: "davadesk_admin_token",
  REFRESH: "davadesk_admin_refresh",
  USER: "davadesk_admin_user",
  SESSION_START: "davadesk_session_start",
  ENV: "davadesk_admin_env",
};

export const SESSION_MAX_DURATION_MS = 24 * 60 * 60 * 1000; // 24 Hours in milliseconds

// Base API instance
export const getBaseUrl = () => {
  const envUrl =
    import.meta.env.ADMIN_BASE_URL ||
    import.meta.env.VITE_ADMIN_BASE_URL ||
    (typeof process !== "undefined" && process.env?.ADMIN_BASE_URL) ||
    import.meta.env.VITE_API_URL;

  if (envUrl) {
    return String(envUrl).trim().replace(/\/+$/, "");
  }

  // Fallback for local development if not configured
  if (
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1")
  ) {
    return "http://localhost:8002/api";
  }

  return "/api";
};

export const api = axios.create({
  baseURL: getBaseUrl(),
  timeout: 15000,
});

// Environment state management
let currentEnv = localStorage.getItem(STORAGE_KEYS.ENV) || "dev";

export const getActiveEnv = () => currentEnv;

export const setActiveEnv = (env) => {
  currentEnv = env === "prod" || env === "production" ? "prod" : "dev";
  localStorage.setItem(STORAGE_KEYS.ENV, currentEnv);
  return currentEnv;
};

// Token helpers
export const getStoredToken = () => localStorage.getItem(STORAGE_KEYS.TOKEN);
export const getStoredRefreshToken = () =>
  localStorage.getItem(STORAGE_KEYS.REFRESH);
export const getStoredUser = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.USER);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
};
export const getSessionStartTime = () => {
  const ts = localStorage.getItem(STORAGE_KEYS.SESSION_START);
  return ts ? parseInt(ts, 10) : null;
};

export const setAuthSession = ({ accessToken, refreshToken, user }) => {
  if (accessToken) localStorage.setItem(STORAGE_KEYS.TOKEN, accessToken);
  if (refreshToken) localStorage.setItem(STORAGE_KEYS.REFRESH, refreshToken);
  if (user) localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
  if (!localStorage.getItem(STORAGE_KEYS.SESSION_START)) {
    localStorage.setItem(STORAGE_KEYS.SESSION_START, Date.now().toString());
  }
};

export const clearAuthSession = () => {
  localStorage.removeItem(STORAGE_KEYS.TOKEN);
  localStorage.removeItem(STORAGE_KEYS.REFRESH);
  localStorage.removeItem(STORAGE_KEYS.USER);
  localStorage.removeItem(STORAGE_KEYS.SESSION_START);
};

export const isSessionExpired = () => {
  const start = getSessionStartTime();
  if (!start) return true;
  return Date.now() - start >= SESSION_MAX_DURATION_MS;
};

export const getRemainingSessionMs = () => {
  const start = getSessionStartTime();
  if (!start) return 0;
  const elapsed = Date.now() - start;
  return Math.max(0, SESSION_MAX_DURATION_MS - elapsed);
};

// Request Interceptor
api.interceptors.request.use((config) => {
  config.headers["x-admin-env"] = currentEnv;

  const token = getStoredToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response Interceptor for auto-refresh and session expiry handling
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

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Check if 24-hour hard session has expired
    if (isSessionExpired() && getStoredToken()) {
      clearAuthSession();
      window.dispatchEvent(new CustomEvent("davadesk:session_expired"));
      return Promise.reject(
        new Error("Your 24-hour session has expired. Please sign in again.")
      );
    }

    // Don't intercept auth endpoints
    if (
      originalRequest.url?.includes("/auth/login") ||
      originalRequest.url?.includes("/auth/verify-otp")
    ) {
      return Promise.reject(error);
    }

    if (error.response?.status === 401 && !originalRequest._retry) {
      const refreshToken = getStoredRefreshToken();

      if (!refreshToken || isSessionExpired()) {
        clearAuthSession();
        window.dispatchEvent(new CustomEvent("davadesk:session_expired"));
        return Promise.reject(error);
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return api(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const res = await axios.post(`${getBaseUrl()}/auth/refresh`, {
          refreshToken,
        });
        const { accessToken } = res.data;
        if (accessToken) {
          localStorage.setItem(STORAGE_KEYS.TOKEN, accessToken);
          api.defaults.headers.common.Authorization = `Bearer ${accessToken}`;
          processQueue(null, accessToken);
          originalRequest.headers.Authorization = `Bearer ${accessToken}`;
          return api(originalRequest);
        }
      } catch (refreshErr) {
        processQueue(refreshErr, null);
        clearAuthSession();
        window.dispatchEvent(new CustomEvent("davadesk:session_expired"));
        return Promise.reject(refreshErr);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

// Admin API Methods
export const AdminAPI = {
  // Authentication & Session
  loginInit: (data) => api.post("/auth/login-init", data),
  verifyOtp: (data) => api.post("/auth/verify-otp", data),
  resendOtp: (data) => api.post("/auth/resend-otp", data),
  setPassword: (data) => api.post("/auth/set-password", data),
  forgotPassword: (data) => api.post("/auth/forgot-password", data),
  getMe: () => api.get("/auth/me"),
  logout: () => api.post("/auth/logout"),

  // Team Management (Superadmin)
  getTeam: () => api.get("/auth/team"),
  createTeamMember: (data) => api.post("/auth/team/create", data),
  deleteTeamMember: (id) => api.delete(`/auth/team/${id}`),

  // Environment
  getEnvStatus: () => api.get("/env/status"),
  pingEnv: (env) => api.post("/env/ping", { env }),

  // Dashboard
  getMetrics: () => api.get("/dashboard/metrics"),
  getTrends: () => api.get("/dashboard/trends"),

  // Pharmacies
  getPharmacies: (params) => api.get("/pharmacies", { params }),
  getPharmacy: (id) => api.get(`/pharmacies/${id}`),

  // Users
  getUsers: (params) => api.get("/users", { params }),
  getUser: (id) => api.get(`/users/${id}`),

  // Leads CRM
  getLeads: (params) => api.get("/leads", { params }),
  markConnected: (leadId) => api.patch(`/leads/${leadId}/connect`),
  updateLeadStatus: (leadId, data) =>
    api.patch(`/leads/${leadId}/status`, data),
  addLeadNote: (leadId, noteData) =>
    api.post(`/leads/${leadId}/note`, noteData),

  // Promo Codes
  getPromos: (params) => api.get("/promos", { params }),
  generatePromo: (data) => api.post("/promos/generate", data),
  togglePromo: (code) => api.patch(`/promos/${code}/toggle`),
  deletePromo: (code) => api.delete(`/promos/${code}`),
  getPromoRedemptions: (code) => api.get(`/promos/${code}/redemptions`),

  // Pricing (plans, global offer, free trial)
  getPricing: () => api.get("/pricing"),
  updatePlan: (code, data) => api.put(`/pricing/plans/${code}`, data),
  updateOffer: (data) => api.put("/pricing/offer", data),
  updateTrial: (data) => api.put("/pricing/trial", data),

  // Subscriptions
  getSubscriptions: (params) => api.get("/subscriptions", { params }),
  getSubscription: (pharmacyId) => api.get(`/subscriptions/${pharmacyId}`),
  extendSubscription: (pharmacyId, data) => api.post(`/subscriptions/${pharmacyId}/extend`, data),
  endSubscription: (pharmacyId, data) => api.post(`/subscriptions/${pharmacyId}/end`, data),
  grantSubscription: (pharmacyId, data) => api.post(`/subscriptions/${pharmacyId}/grant`, data),

  // Analytics & Traffic
  getFunnel: () => api.get("/analytics/funnel"),
  getActivityFeed: () => api.get("/analytics/activity-feed"),
};

// Error text from either API style ({ error } or { detail })
export const apiError = (err, fallback = "Something went wrong") =>
  err?.response?.data?.error || err?.response?.data?.detail || fallback;
