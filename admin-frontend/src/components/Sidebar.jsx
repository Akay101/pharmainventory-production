import React from "react";
import {
  LayoutDashboard,
  Building2,
  Users,
  Flame,
  Ticket,
  BarChart3,
  Server,
  ShieldCheck,
  LogOut,
  Clock,
  Shield,
  CalendarClock,
  IndianRupee,
  Coins,
  LifeBuoy,
  Gift,
  Database,
  Megaphone,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";

export default function Sidebar({
  activeTab,
  onTabChange,
  leadCount = 0,
  promoCount = 0,
  supportCount = 0,
  offerCount = 0,
  activeEnv,
  envStatus,
  isOpen,
  onCloseMobile,
}) {
  const { user, sessionRemainingText, logout } = useAuth();

  const navItems = [
    {
      id: "dashboard",
      label: "Dashboard",
      icon: LayoutDashboard,
      section: "MONITORING",
    },
    {
      id: "pharmacies",
      label: "Pharmacies",
      icon: Building2,
      section: "MONITORING",
    },
    {
      id: "users",
      label: "All Users",
      icon: Users,
      section: "MONITORING",
    },
    {
      id: "globaldata",
      label: "Global Data",
      icon: Database,
      section: "MONITORING",
    },
    {
      id: "support",
      label: "Support Queries",
      icon: LifeBuoy,
      badge: supportCount > 0 ? supportCount : null,
      badgeColor: "bg-orange-500 text-white font-bold",
      section: "MONITORING",
    },
    {
      id: "leads",
      label: "Leads CRM",
      icon: Flame,
      badge: leadCount > 0 ? leadCount : null,
      badgeColor: "bg-rose-500 text-white font-bold",
      section: "SALES & CRM",
    },
    {
      id: "offer5050",
      label: "50-50 Launch Offer",
      icon: Gift,
      badge: offerCount > 0 ? `${offerCount} to send` : null,
      badgeColor: "bg-orange-100 text-orange-700",
      section: "SALES & CRM",
    },
    {
      id: "promos",
      label: "Promo Codes",
      icon: Ticket,
      badge: promoCount > 0 ? `${promoCount} active` : null,
      badgeColor: "bg-emerald-100 text-emerald-700",
      section: "MARKETING & OFFERS",
    },
    {
      id: "subscriptions",
      label: "Subscriptions",
      icon: CalendarClock,
      section: "SALES & CRM",
    },
    {
      id: "broadcasts",
      label: "Broadcasts",
      icon: Megaphone,
      section: "MARKETING & OFFERS",
    },
    {
      id: "pricing",
      label: "Pricing & Offers",
      icon: IndianRupee,
      section: "MARKETING & OFFERS",
    },
    {
      id: "credits",
      label: "AI Credits",
      icon: Coins,
      section: "SALES & CRM",
    },
    {
      id: "analytics",
      label: "Funnel & Traffic",
      icon: BarChart3,
      section: "ANALYTICS",
    },
    {
      id: "team",
      label: "Admin Team",
      icon: ShieldCheck,
      section: "ACCESS & SECURITY",
    },
  ];

  const sections = ["MONITORING", "SALES & CRM", "MARKETING & OFFERS", "ANALYTICS", "ACCESS & SECURITY"];
  const currentDb = envStatus?.[activeEnv] || {};

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm lg:hidden animate-fade-in"
          onClick={onCloseMobile}
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-40 w-64 bg-white border-r border-slate-200/90 flex flex-col transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Brand Header */}
        <div className="h-16 px-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/assets/logoBrand/logoFullWithoutBackground.svg"
              alt="DavaDesk Logo"
              className="h-8 w-auto object-contain max-w-[150px]"
            />
            <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-orange-50 text-orange-600 border border-orange-200 tracking-wider">
              Deck
            </span>
          </div>
        </div>

        {/* Navigation list */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
          {sections.map((sec) => {
            const items = navItems.filter((i) => i.section === sec);
            if (!items.length) return null;
            return (
              <div key={sec} className="space-y-1">
                <div className="px-3 text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                  {sec}
                </div>
                {items.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        onTabChange(item.id);
                        if (onCloseMobile) onCloseMobile();
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all group ${
                        isActive
                          ? "bg-orange-50 text-orange-600 shadow-xs border border-orange-200/60"
                          : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon
                          className={`w-4 h-4 transition-colors ${
                            isActive ? "text-orange-500" : "text-slate-400 group-hover:text-slate-600"
                          }`}
                        />
                        <span>{item.label}</span>
                      </div>
                      {item.badge ? (
                        <span
                          className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${item.badgeColor}`}
                        >
                          {item.badge}
                        </span>
                      ) : (
                        isActive && (
                          <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                        )
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Database Status & Admin Session Footer */}
        <div className="p-3 border-t border-slate-100 bg-slate-50/70 space-y-2.5">
          {/* Target DB Pill */}
          <div className="bg-white p-2.5 rounded-xl border border-slate-200/80 shadow-2xs">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-bold text-slate-700 flex items-center gap-1">
                <Server className="w-3 h-3 text-slate-400" />
                Target Database
              </span>
              <span
                className={`text-[9px] font-bold px-1.5 py-0.2 rounded uppercase ${
                  currentDb.connected
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : "bg-amber-50 text-amber-700 border border-amber-200"
                }`}
              >
                {activeEnv.toUpperCase()}
              </span>
            </div>
            <div className="flex items-center justify-between text-[10px] text-slate-500">
              <span className="truncate max-w-[130px] font-mono">{currentDb.dbName || "pharmalogy_db"}</span>
              {currentDb.latencyMs && <span className="text-emerald-600 font-semibold">{currentDb.latencyMs}ms</span>}
            </div>
          </div>

          {/* Authenticated Admin User Profile */}
          {user && (
            <div className="bg-white p-2.5 rounded-xl border border-slate-200/80 shadow-2xs">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-orange-500 to-amber-600 text-white font-bold flex items-center justify-center text-xs shrink-0 uppercase">
                    {user.name?.charAt(0) || "A"}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-900 truncate">{user.name}</div>
                    <div className="text-[10px] text-slate-400 truncate">{user.email}</div>
                  </div>
                </div>

                <button
                  onClick={logout}
                  className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors shrink-0"
                  title="Sign out of Admin Deck"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* 24-Hour Session Timer */}
              <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-500">
                <span className="flex items-center gap-1 text-slate-400">
                  <Clock className="w-3 h-3 text-orange-500" />
                  <span>Session:</span>
                </span>
                <span className="font-mono font-bold text-slate-700">{sessionRemainingText}</span>
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
