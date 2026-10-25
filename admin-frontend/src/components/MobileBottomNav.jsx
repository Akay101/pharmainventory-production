import React from "react";
import {
  LayoutDashboard,
  Building2,
  Flame,
  Ticket,
  ShieldCheck,
  CalendarClock,
  Coins,
} from "lucide-react";

export default function MobileBottomNav({ activeTab, onTabChange, leadCount = 0 }) {
  const tabs = [
    { id: "dashboard", label: "Overview", icon: LayoutDashboard },
    { id: "pharmacies", label: "Stores", icon: Building2 },
    {
      id: "leads",
      label: "Leads",
      icon: Flame,
      badge: leadCount > 0 ? leadCount : null,
    },
    { id: "subscriptions", label: "Plans", icon: CalendarClock },
    { id: "credits", label: "Credits", icon: Coins },
    { id: "promos", label: "Promos", icon: Ticket },
    { id: "team", label: "Team", icon: ShieldCheck },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-lg border-t border-slate-200/90 lg:hidden shadow-[0_-4px_20px_rgba(0,0,0,0.05)] bottom-nav-safe">
      <div className="flex items-center justify-around h-16 px-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`relative flex flex-col items-center justify-center flex-1 h-full py-1 transition-all ${
                isActive ? "text-orange-600 font-bold" : "text-slate-400 hover:text-slate-600 font-medium"
              }`}
            >
              <div className="relative">
                <Icon
                  className={`w-5 h-5 transition-transform ${
                    isActive ? "scale-110 text-orange-600" : ""
                  }`}
                />
                {tab.badge && (
                  <span className="absolute -top-1 -right-2 px-1.5 py-0.2 min-w-4 text-[9px] font-extrabold text-white bg-rose-500 rounded-full border border-white text-center leading-tight">
                    {tab.badge}
                  </span>
                )}
              </div>
              <span className="text-[10px] mt-1 tracking-tight">{tab.label}</span>
              {isActive && (
                <span className="absolute bottom-1 w-6 h-1 rounded-full bg-orange-500" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
