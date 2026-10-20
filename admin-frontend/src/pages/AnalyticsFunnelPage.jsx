import React, { useState, useEffect } from "react";
import { AdminAPI } from "../api";
import {
  BarChart3,
  Globe,
  UserCheck,
  CheckCircle2,
  TrendingDown,
  ArrowRight,
  Activity,
  Receipt,
  Layers,
  Sparkles,
  Users,
} from "lucide-react";

export default function AnalyticsFunnelPage({ funnelData, metrics }) {
  const [activities, setActivities] = useState([]);
  const [loadingActivities, setLoadingActivities] = useState(false);

  useEffect(() => {
    setLoadingActivities(true);
    AdminAPI.getActivityFeed()
      .then((res) => setActivities(res.data.activities || []))
      .catch((err) => console.error("Error loading activities:", err))
      .finally(() => setLoadingActivities(false));
  }, []);

  const stages = funnelData?.funnel || [];
  const conversionRate = funnelData?.conversion_rate || "0.0";
  const dropoffs = funnelData?.total_dropoffs || 0;

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-cyan-50 text-cyan-600 flex items-center justify-center font-bold">
              <BarChart3 className="w-4 h-4" />
            </div>
            <h2 className="text-xl font-black text-slate-900 tracking-tight">
              Traffic & Signup Conversion Funnel
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            End-to-end conversion analytics from visitor arrival to registration completion and paid subscription.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="px-3.5 py-1.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-bold text-emerald-800">
            {conversionRate}% Paid Conversion Rate
          </div>
        </div>
      </div>

      {/* Visual Conversion Funnel Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 sm:gap-4">
        {stages.map((stage, idx) => {
          const colors = [
            { bg: "bg-blue-50/70 border-blue-200", bar: "bg-blue-500", text: "text-blue-900" },
            { bg: "bg-amber-50/70 border-amber-200", bar: "bg-amber-500", text: "text-amber-900" },
            { bg: "bg-purple-50/70 border-purple-200", bar: "bg-purple-500", text: "text-purple-900" },
            { bg: "bg-emerald-50/70 border-emerald-200", bar: "bg-emerald-500", text: "text-emerald-900" },
          ];
          const c = colors[idx] || colors[0];

          return (
            <div
              key={stage.stage}
              className={`p-4 sm:p-5 rounded-2xl border ${c.bg} shadow-2xs relative flex flex-col justify-between`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">
                    Stage {idx + 1}
                  </span>
                  <span className="text-xs font-bold text-slate-700">{stage.percent}%</span>
                </div>
                <h3 className="text-sm font-bold text-slate-900 tracking-tight">{stage.stage}</h3>
                <div className="text-2xl sm:text-3xl font-black text-slate-900 mt-2">
                  {stage.count}
                </div>
                <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                  {stage.description}
                </p>
              </div>

              {/* Progress bar */}
              <div className="w-full h-1.5 bg-white/80 rounded-full overflow-hidden mt-4">
                <div
                  className={`h-full ${c.bar} rounded-full transition-all duration-500`}
                  style={{ width: `${Math.max(stage.percent, 8)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Funnel Insights Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Dropoff Breakdown */}
        <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-2xs space-y-3">
          <h3 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-1.5">
            <TrendingDown className="w-4 h-4 text-rose-500" />
            Drop-off & Intent Analysis
          </h3>
          <p className="text-xs text-slate-500">
            Users who started sign up or experienced friction before payment activation.
          </p>

          <div className="space-y-2 pt-2 text-xs">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
              <span className="text-slate-600">Pending OTP Drop-offs:</span>
              <span className="font-extrabold text-slate-900">
                {metrics?.metrics?.pending_registrations || 0}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
              <span className="text-slate-600">Unpaid / Expired Leads:</span>
              <span className="font-extrabold text-rose-600">
                {metrics?.metrics?.total_leads || 0}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
              <span className="text-slate-600">Active Paid Customers:</span>
              <span className="font-extrabold text-emerald-600">
                {metrics?.metrics?.active_subscribers || 0}
              </span>
            </div>
          </div>
        </div>

        {/* Live System Activity Feed (audit log) */}
        <div className="lg:col-span-2 p-5 bg-white rounded-2xl border border-slate-200 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-brand-500" />
              Live Platform Operations Feed ({activities.length})
            </h3>
            <span className="text-[10px] text-slate-400">Streamed from database</span>
          </div>

          <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
            {loadingActivities ? (
              <div className="py-8 text-center text-xs text-slate-400">
                Loading activities stream...
              </div>
            ) : activities.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                No recent activity records found.
              </div>
            ) : (
              activities.map((act, i) => (
                <div
                  key={act.id || i}
                  className="p-3 rounded-xl bg-slate-50/80 border border-slate-200/80 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <span className="w-2 h-2 rounded-full bg-brand-500 shrink-0" />
                    <div className="truncate">
                      <span className="font-bold text-slate-800">{act.user_name || "User"}</span>{" "}
                      <span className="text-slate-500">[{act.module || "ACTION"}]</span>{" "}
                      <span className="text-slate-700">{act.description || "Performed action"}</span>
                    </div>
                  </div>

                  <span className="text-[10px] text-slate-400 shrink-0">
                    {act.created_at ? new Date(act.created_at).toLocaleTimeString() : "Recent"}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
