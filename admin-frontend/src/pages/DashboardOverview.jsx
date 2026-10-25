import React from "react";
import MetricCard from "../components/MetricCard";
import {
  Users,
  Building2,
  Flame,
  Ticket,
  Receipt,
  Globe,
  ArrowRight,
  Phone,
  CheckCircle2,
  Plus,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
} from "recharts";

export default function DashboardOverview({
  metrics,
  trends,
  onNavigateTab,
  onOpenLeadModal,
  onOpenPharmacyModal,
  activeEnv,
}) {
  const m = metrics?.metrics || {};
  const planData = metrics?.plan_breakdown || {};
  const recent = metrics?.recent_registrations || [];
  const timeline = trends?.timeline || [];

  const planChartData = [
    { name: "AGENTIC", count: planData.AGENTIC || 0, color: "#f59e0b" },
    { name: "ADVANCED", count: planData.ADVANCED || 0, color: "#f97316" },
    { name: "BASIC", count: planData.BASIC || 0, color: "#3b82f6" },
    { name: "PRO", count: planData.PRO || 0, color: "#8b5cf6" },
    { name: "FREE", count: planData.NONE || 0, color: "#ef4444" },
  ];

  return (
    <div className="space-y-6">
      {/* Clean Top Header (Simple words, proper padding) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white px-5 py-4 rounded-2xl border border-slate-200/90 shadow-2xs">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
              Dashboard Overview
            </h2>
            <span
              className={`px-2.5 py-0.5 text-[10px] font-bold rounded-full uppercase tracking-wider whitespace-nowrap ${
                activeEnv === "prod"
                  ? "bg-amber-100 text-amber-800 border border-amber-300"
                  : "bg-emerald-100 text-emerald-800 border border-emerald-300"
              }`}
            >
              {activeEnv.toUpperCase()}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Summary of your users, pharmacies, sales leads, and promo codes.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            onClick={() => onNavigateTab("leads")}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs transition-colors whitespace-nowrap"
          >
            <Flame className="w-3.5 h-3.5 shrink-0" />
            <span>Review Leads ({m.total_leads || 0})</span>
          </button>
          <button
            onClick={() => onNavigateTab("promos")}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5 text-brand-500 shrink-0" />
            <span>Create Promo</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Row (Spacious vertical hierarchy, no cramped wrapping) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3.5">
        <MetricCard
          title="Total Users"
          value={m.total_users ?? "—"}
          subtext="Accounts created"
          change="+12%"
          isPositive={true}
          icon={Users}
          variant="rose"
          onClick={() => onNavigateTab("users")}
        />

        <MetricCard
          title="Pharmacies"
          value={m.total_pharmacies ?? "—"}
          subtext="Stores registered"
          change="+8%"
          isPositive={true}
          icon={Building2}
          variant="purple"
          onClick={() => onNavigateTab("pharmacies")}
        />

        <MetricCard
          title="Active Paid"
          value={m.active_subscribers ?? "—"}
          subtext="Subscribed stores"
          change="+18%"
          isPositive={true}
          icon={Receipt}
          variant="emerald"
        />

        <MetricCard
          title="Unpaid Leads"
          value={m.total_leads ?? "—"}
          subtext="Pending follow-up"
          change="Pending"
          isPositive={false}
          icon={Flame}
          variant="amber"
          onClick={() => onNavigateTab("leads")}
        />

        <MetricCard
          title="Promo Codes"
          value={m.active_promo_codes ?? "—"}
          subtext={`${m.used_promo_codes || 0} redeemed`}
          icon={Ticket}
          variant="green"
          onClick={() => onNavigateTab("promos")}
        />

        <MetricCard
          title="Total Visitors"
          value={m.funnel?.visitors ?? "—"}
          subtext={`${m.funnel?.conversion_rate || "0"}% converted`}
          icon={Globe}
          variant="cyan"
          onClick={() => onNavigateTab("analytics")}
        />
      </div>

      {/* Charts Section: Activity Timeline & Plan Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left 2 Cols: Signups Timeline */}
        <div className="lg:col-span-2 bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                Signups & Subscriptions
              </h3>
              <p className="text-[11px] text-slate-400">
                Last 14 days activity trend
              </p>
            </div>
            <div className="flex items-center gap-3 text-[11px] whitespace-nowrap">
              <span className="flex items-center gap-1.5 text-brand-600 font-semibold">
                <span className="w-2.5 h-2.5 rounded-full bg-brand-500" /> Signups
              </span>
              <span className="flex items-center gap-1.5 text-emerald-600 font-semibold">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Subscriptions
              </span>
            </div>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={timeline} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorSignups" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f97316" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#f97316" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="colorSubs" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#94a3b8" }} stroke="#e2e8f0" />
                <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} stroke="#e2e8f0" allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0f172a",
                    borderRadius: "12px",
                    border: "none",
                    color: "#fff",
                    fontSize: "12px",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="signups"
                  stroke="#f97316"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#colorSignups)"
                />
                <Area
                  type="monotone"
                  dataKey="subscriptions"
                  stroke="#10b981"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#colorSubs)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Right Col: Active Plans */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                Active Plans
              </h3>
              <span className="text-[10px] font-bold text-brand-600 bg-brand-50 px-2 py-0.5 rounded-full whitespace-nowrap">
                Tier Breakdown
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mb-4">
              Users per subscription plan
            </p>

            <div className="h-44 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={planChartData} layout="vertical" margin={{ left: -10, right: 10 }}>
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fill: "#475569" }} width={80} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#0f172a",
                      borderRadius: "10px",
                      color: "#fff",
                      fontSize: "11px",
                    }}
                  />
                  <Bar dataKey="count" radius={[0, 6, 6, 0]}>
                    {planChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Quick status summary cards */}
          <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 gap-2 text-xs">
            <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200/60">
              <div className="text-[10px] font-bold text-emerald-700 uppercase whitespace-nowrap">Paid Rate</div>
              <div className="text-lg font-black text-emerald-900 mt-0.5">
                {m.funnel?.conversion_rate || 0}%
              </div>
            </div>
            <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200/60">
              <div className="text-[10px] font-bold text-rose-700 uppercase whitespace-nowrap">Unpaid Leads</div>
              <div className="text-lg font-black text-rose-900 mt-0.5">
                {m.total_leads || 0}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Section: Recent Signups Table */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                Recent Signups
              </h3>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              New user registrations and payment status
            </p>
          </div>

          <button
            onClick={() => onNavigateTab("leads")}
            className="flex items-center gap-1 text-xs font-bold text-brand-600 hover:text-brand-700 hover:underline whitespace-nowrap"
          >
            <span>View All Leads</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Responsive Table with Non-Wrapping Columns */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-50 text-slate-500 text-[10px] uppercase font-bold tracking-wider border-b border-slate-200">
              <tr>
                <th className="py-3 px-4 min-w-[220px]">Customer / Pharmacy</th>
                <th className="py-3 px-4 min-w-[190px]">Contact</th>
                <th className="py-3 px-4 min-w-[140px] whitespace-nowrap">Plan</th>
                <th className="py-3 px-4 min-w-[130px] whitespace-nowrap">Status</th>
                <th className="py-3 px-4 min-w-[160px] text-right whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recent.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400">
                    No signups found in this database.
                  </td>
                </tr>
              ) : (
                recent.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 min-w-[220px]">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-slate-200 to-slate-300 text-slate-700 font-bold flex items-center justify-center text-xs shrink-0">
                          {user.name?.charAt(0)?.toUpperCase() || "U"}
                        </div>
                        <div>
                          <div className="font-bold text-slate-900">{user.name}</div>
                          <div
                            onClick={() => user.pharmacy_id && onOpenPharmacyModal(user.pharmacy_id)}
                            className="text-[11px] text-brand-600 hover:underline cursor-pointer flex items-center gap-1 font-medium mt-0.5"
                          >
                            <Building2 className="w-3 h-3 shrink-0" />
                            <span>{user.pharmacy_name}</span>
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="py-3 px-4 min-w-[190px]">
                      <div className="text-slate-800 font-medium whitespace-nowrap">{user.mobile || "N/A"}</div>
                      <div className="text-[11px] text-slate-400 truncate max-w-[180px]">
                        {user.email}
                      </div>
                    </td>

                    <td className="py-3 px-4 min-w-[140px] whitespace-nowrap">
                      <div className="font-semibold text-slate-800">
                        {user.subscription_plan || "None"}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {user.subscription_expiry
                          ? `Exp: ${new Date(user.subscription_expiry).toLocaleDateString()}`
                          : "No subscription"}
                      </div>
                    </td>

                    <td className="py-3 px-4 min-w-[130px] whitespace-nowrap">
                      {user.is_subscribed ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold rounded-lg border bg-emerald-50 text-emerald-700 border-emerald-300 uppercase tracking-wide whitespace-nowrap">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          Subscribed
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-extrabold rounded-lg border bg-rose-50 text-rose-700 border-rose-200 uppercase tracking-wide whitespace-nowrap">
                          <Flame className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                          Unpaid Lead
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-4 min-w-[160px] text-right whitespace-nowrap">
                      {user.is_lead ? (
                        <button
                          onClick={() =>
                            onOpenLeadModal({
                              lead_id: user.id,
                              user_id: user.id,
                              name: user.name,
                              email: user.email,
                              mobile: user.mobile,
                              pharmacy_name: user.pharmacy_name,
                              is_connected: false,
                              crm_status: "NEW",
                              lead_category: user.lead_category,
                              created_at: user.created_at,
                              notes: [],
                            })
                          }
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-brand-500 hover:bg-brand-600 rounded-xl shadow-xs transition-colors whitespace-nowrap"
                        >
                          <Phone className="w-3.5 h-3.5 shrink-0" />
                          <span>Connect & Notes</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => user.pharmacy_id && onOpenPharmacyModal(user.pharmacy_id)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors whitespace-nowrap"
                        >
                          <span>Inspect</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
