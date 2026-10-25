import React from "react";
import {
  Server,
  RefreshCw,
  Search,
  Menu,
  Clock,
  LogOut,
  ShieldCheck,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";

export default function Header({
  activeEnv,
  onEnvChange,
  envStatus,
  onRefresh,
  isRefreshing,
  onToggleMobileMenu,
  searchQuery,
  onSearchChange,
}) {
  const { user, sessionRemainingText, logout } = useAuth();
  const currentStatus = envStatus?.[activeEnv] || {};

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-4 sm:px-6 py-2.5 transition-all">
      <div className="flex items-center justify-between gap-3">
        {/* Left: Mobile hamburger & DavaDesk Brand */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={onToggleMobileMenu}
            className="lg:hidden p-2 text-slate-600 hover:bg-slate-100 rounded-lg"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2.5">
            <img
              src="/assets/logoBrand/logoOnlyWithoutBackground.svg"
              alt="DavaDesk Icon"
              className="w-7 h-7 sm:w-8 sm:h-8 object-contain"
            />
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-slate-900 tracking-tight text-base sm:text-lg">
                DavaDesk
              </span>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-orange-50 text-orange-600 border border-orange-200 hidden sm:inline-block whitespace-nowrap">
                Control Deck
              </span>
            </div>
          </div>
        </div>

        {/* Center: Search (Desktop) */}
        <div className="hidden md:flex items-center flex-1 max-w-md mx-3">
          <div className="relative w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search customers, pharmacies, leads, promo codes..."
              className="w-full pl-9 pr-10 py-1.5 text-xs sm:text-sm bg-slate-100/80 hover:bg-slate-100 focus:bg-white text-slate-800 placeholder:text-slate-400 rounded-xl border border-transparent focus:border-orange-500 focus:outline-none transition-all shadow-inner"
            />
            <kbd className="hidden lg:inline-flex items-center gap-0.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 bg-white px-1.5 py-0.5 rounded border border-slate-200">
              ⌘K
            </kbd>
          </div>
        </div>

        {/* Right: DEV vs PROD Toggle & Admin User Pill */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* 24h Session Timer Badge */}
          {user && (
            <div
              className="hidden xl:flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-100 text-slate-600 border border-slate-200 text-xs font-mono"
              title="24-Hour Session Lifetime Countdown"
            >
              <Clock className="w-3.5 h-3.5 text-orange-500" />
              <span>{sessionRemainingText}</span>
            </div>
          )}

          {/* Dev/Prod Segmented Pill Switch */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-xs">
            <button
              onClick={() => onEnvChange("dev")}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-lg transition-all whitespace-nowrap ${
                activeEnv === "dev"
                  ? "bg-white text-emerald-800 shadow-sm border border-emerald-200"
                  : "text-slate-500 hover:text-slate-900"
              }`}
              title="Development (Atlas Cloud)"
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  envStatus?.dev?.connected
                    ? "bg-emerald-500 animate-pulse"
                    : "bg-amber-400"
                }`}
              />
              <span>DEV</span>
              {envStatus?.dev?.latencyMs && activeEnv === "dev" && (
                <span className="hidden sm:inline text-[10px] font-normal text-emerald-600">
                  {envStatus.dev.latencyMs}ms
                </span>
              )}
            </button>

            <button
              onClick={() => onEnvChange("prod")}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-lg transition-all whitespace-nowrap ${
                activeEnv === "prod"
                  ? "bg-white text-emerald-800 shadow-sm border border-emerald-200"
                  : "text-slate-500 hover:text-slate-900"
              }`}
              title="Production (Lightsail Cluster)"
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  envStatus?.prod?.connected
                    ? "bg-emerald-500 animate-pulse"
                    : "bg-amber-500"
                }`}
              />
              <span>PROD</span>
              {envStatus?.prod?.latencyMs && activeEnv === "prod" && (
                <span className="hidden sm:inline text-[10px] font-normal text-emerald-600">
                  {envStatus.prod.latencyMs}ms
                </span>
              )}
            </button>
          </div>

          {/* Refresh Button */}
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="p-2 text-slate-600 hover:text-orange-600 hover:bg-slate-100 rounded-xl transition-colors border border-slate-200/60"
            title="Refresh current data"
            aria-label="Refresh"
          >
            <RefreshCw
              className={`w-4 h-4 ${isRefreshing ? "animate-spin text-orange-600" : ""}`}
            />
          </button>

          {/* User Profile & Quick Logout on Header */}
          {user && (
            <div className="flex items-center gap-1.5 pl-1 sm:pl-2 border-l border-slate-200">
              <div
                className="w-8 h-8 rounded-xl bg-orange-100 border border-orange-200 text-orange-700 font-bold flex items-center justify-center text-xs uppercase"
                title={`${user.name} (${user.role})`}
              >
                {user.name?.charAt(0) || "A"}
              </div>
              <button
                onClick={logout}
                className="hidden sm:flex p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                title="Sign out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
