import React from "react";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";

export default function MetricCard({
  title,
  value,
  subtext,
  change,
  isPositive = true,
  icon: Icon,
  variant = "emerald", // amber, emerald, green, rose, purple, cyan
  onClick,
}) {
  const variantStyles = {
    amber: {
      bg: "bg-[#fffbeb] hover:bg-[#fef3c7]/70",
      border: "border-amber-200/70",
      iconBg: "bg-amber-100 text-amber-700",
      trendBg: "bg-amber-100/80 text-amber-800",
    },
    emerald: {
      bg: "bg-[#ecfdf5] hover:bg-[#d1fae5]/70",
      border: "border-emerald-200/70",
      iconBg: "bg-emerald-100 text-emerald-700",
      trendBg: "bg-emerald-100/80 text-emerald-800",
    },
    green: {
      bg: "bg-[#f0fdf4] hover:bg-[#dcfce7]/70",
      border: "border-green-200/70",
      iconBg: "bg-green-100 text-green-700",
      trendBg: "bg-green-100/80 text-green-800",
    },
    rose: {
      bg: "bg-[#fff1f2] hover:bg-[#ffe4e6]/70",
      border: "border-rose-200/70",
      iconBg: "bg-rose-100 text-rose-700",
      trendBg: "bg-rose-100/80 text-rose-800",
    },
    purple: {
      bg: "bg-[#faf5ff] hover:bg-[#f3e8ff]/70",
      border: "border-purple-200/70",
      iconBg: "bg-purple-100 text-purple-700",
      trendBg: "bg-purple-100/80 text-purple-800",
    },
    cyan: {
      bg: "bg-[#ecfeff] hover:bg-[#cffafe]/70",
      border: "border-cyan-200/70",
      iconBg: "bg-cyan-100 text-cyan-700",
      trendBg: "bg-cyan-100/80 text-cyan-800",
    },
  };

  const style = variantStyles[variant] || variantStyles.emerald;

  return (
    <div
      onClick={onClick}
      className={`p-4 sm:p-4.5 rounded-2xl border ${style.bg} ${style.border} transition-all duration-200 shadow-2xs flex flex-col justify-between min-h-[120px] ${
        onClick ? "cursor-pointer active:scale-[0.99] hover:shadow-xs" : ""
      }`}
    >
      {/* Top Row: Icon on left, Trend/Change Pill on right */}
      <div className="flex items-center justify-between mb-2.5">
        {Icon && (
          <div className={`p-2 rounded-xl ${style.iconBg} shrink-0`}>
            <Icon className="w-4 h-4" />
          </div>
        )}

        {change && (
          <span
            className={`inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${style.trendBg}`}
          >
            {isPositive ? (
              <ArrowUpRight className="w-3 h-3 mr-0.5 shrink-0" />
            ) : (
              <ArrowDownRight className="w-3 h-3 mr-0.5 shrink-0" />
            )}
            {change}
          </span>
        )}
      </div>

      {/* Middle: Prominent Metric Value */}
      <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight leading-none mb-1">
        {value}
      </div>

      {/* Bottom: Clear, Simple Label (No wrapping issues) */}
      <div className="flex flex-col">
        <span className="text-xs font-bold text-slate-700 tracking-tight whitespace-nowrap">
          {title}
        </span>
        {subtext && (
          <span className="text-[11px] text-slate-500 font-medium truncate mt-0.5">
            {subtext}
          </span>
        )}
      </div>
    </div>
  );
}
