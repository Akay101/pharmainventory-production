import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import {
  AdminAPI,
  getStoredToken,
  getStoredUser,
  setAuthSession,
  clearAuthSession,
  isSessionExpired,
  getRemainingSessionMs,
} from "../api";
import { toast } from "sonner";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionRemainingMs, setSessionRemainingMs] = useState(0);

  // Initialize session from storage
  useEffect(() => {
    const token = getStoredToken();
    const storedUser = getStoredUser();

    if (token && storedUser && !isSessionExpired()) {
      setUser(storedUser);
      setSessionRemainingMs(getRemainingSessionMs());

      // Silently verify user profile with server
      AdminAPI.getMe()
        .then((res) => {
          if (res.data?.user) {
            setUser(res.data.user);
          }
        })
        .catch((err) => {
          // If server rejects token, clear session
          if (err.response?.status === 401 || err.response?.status === 403) {
            clearAuthSession();
            setUser(null);
          }
        })
        .finally(() => {
          setIsLoading(false);
        });
    } else {
      clearAuthSession();
      setUser(null);
      setIsLoading(false);
    }
  }, []);

  // 24-hour Session Countdown & Auto-logout interval
  useEffect(() => {
    if (!user) return;

    const interval = setInterval(() => {
      const remaining = getRemainingSessionMs();
      setSessionRemainingMs(remaining);

      if (remaining <= 0) {
        clearInterval(interval);
        handleSessionExpired("Your 24-hour session has reached its security limit. Please sign in again.");
      }
    }, 15000); // Check every 15 seconds

    return () => clearInterval(interval);
  }, [user]);

  // Listen for session expired events from Axios interceptor
  useEffect(() => {
    const handleExpiredEvent = () => {
      handleSessionExpired("Your session expired. Please sign in again.");
    };

    window.addEventListener("davadesk:session_expired", handleExpiredEvent);
    return () => window.removeEventListener("davadesk:session_expired", handleExpiredEvent);
  }, []);

  const handleSessionExpired = (message) => {
    clearAuthSession();
    setUser(null);
    setSessionRemainingMs(0);
    toast.error(message || "Session expired. Please log in again.");
  };

  // Login Step 1: Initiate Login
  const loginInit = async (email, password = "") => {
    const res = await AdminAPI.loginInit({ email, password });
    return res.data;
  };

  // Login Step 2: Verify OTP
  const verifyOtp = async (email, otp, purpose = "login") => {
    const res = await AdminAPI.verifyOtp({ email, otp, purpose });
    const data = res.data;

    if (data.step === "AUTHENTICATED" && data.accessToken) {
      setAuthSession({
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        user: data.user,
      });
      setUser(data.user);
      setSessionRemainingMs(getRemainingSessionMs());
      toast.success(data.message || `Welcome back, ${data.user.name}!`);
    }

    return data;
  };

  // Login Step 3: Set Password
  const setPassword = async (tempToken, newPassword, confirmPassword) => {
    const res = await AdminAPI.setPassword({ tempToken, newPassword, confirmPassword });
    const data = res.data;

    if (data.success && data.accessToken) {
      setAuthSession({
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        user: data.user,
      });
      setUser(data.user);
      setSessionRemainingMs(getRemainingSessionMs());
      toast.success(data.message || "Password updated successfully. You are now logged in.");
    }

    return data;
  };

  // Resend OTP
  const resendOtp = async (email, scenario) => {
    const res = await AdminAPI.resendOtp({ email, scenario });
    toast.success(res.data?.message || "Verification code resent.");
    return res.data;
  };

  // Forgot Password
  const forgotPassword = async (email) => {
    const res = await AdminAPI.forgotPassword({ email });
    toast.info(res.data?.message || "Verification code dispatched.");
    return res.data;
  };

  // Logout
  const logout = async () => {
    try {
      await AdminAPI.logout();
    } catch (e) {
      // Ignore network errors on logout
    } finally {
      clearAuthSession();
      setUser(null);
      setSessionRemainingMs(0);
      toast.info("Signed out successfully.");
    }
  };

  // Format session remaining time
  const formatSessionRemaining = () => {
    if (!sessionRemainingMs || sessionRemainingMs <= 0) return "Expired";
    const totalMinutes = Math.floor(sessionRemainingMs / (1000 * 60));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}h ${minutes}m left`;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user && !isSessionExpired(),
        isLoading,
        sessionRemainingText: formatSessionRemaining(),
        sessionRemainingMs,
        loginInit,
        verifyOtp,
        setPassword,
        resendOtp,
        forgotPassword,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
