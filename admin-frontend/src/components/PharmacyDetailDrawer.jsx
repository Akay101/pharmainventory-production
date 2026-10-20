import React, { useState, useEffect } from "react";
import BottomDrawer from "./BottomDrawer";
import { AdminAPI } from "../api";
import {
  Building2,
  Users,
  MapPin,
  FileText,
  Phone,
  Calendar,
  Shield,
  Layers,
  Receipt,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

export default function PharmacyDetailDrawer({ isOpen, onClose, pharmacyId }) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);

  useEffect(() => {
    if (isOpen && pharmacyId) {
      setLoading(true);
      AdminAPI.getPharmacy(pharmacyId)
        .then((res) => setData(res.data.pharmacy))
        .catch((err) => console.error("Error loading pharmacy details:", err))
        .finally(() => setLoading(false));
    } else {
      setData(null);
    }
  }, [isOpen, pharmacyId]);

  if (!isOpen) return null;

  return (
    <BottomDrawer
      isOpen={isOpen}
      onClose={onClose}
      title={data?.name || "Pharmacy Details"}
      subtitle={`ID: ${pharmacyId}`}
      maxWidth="max-w-3xl"
    >
      {loading ? (
        <div className="py-12 flex flex-col items-center justify-center text-slate-400 space-y-2">
          <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs">Loading pharmacy profile...</span>
        </div>
      ) : data ? (
        <div className="space-y-6">
          {/* Pharmacy Info Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Users Onboarded</span>
              <div className="text-xl font-extrabold text-slate-900 mt-1 flex items-center gap-1.5">
                <Users className="w-4 h-4 text-brand-500" />
                {data.users?.length || data.users_count || 0}
              </div>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Total Bills</span>
              <div className="text-xl font-extrabold text-slate-900 mt-1 flex items-center gap-1.5">
                <Receipt className="w-4 h-4 text-emerald-600" />
                {data.bills_count || 0}
              </div>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Products</span>
              <div className="text-xl font-extrabold text-slate-900 mt-1 flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-blue-600" />
                {data.products_count || 0}
              </div>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
              <span className="text-[10px] font-bold text-slate-400 uppercase">License</span>
              <div className="text-sm font-bold text-slate-800 mt-1.5 truncate">
                {data.license_no || "Not submitted"}
              </div>
            </div>
          </div>

          {/* Details list */}
          <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs space-y-2 text-xs text-slate-600">
            <div className="flex items-center justify-between py-1 border-b border-slate-100">
              <span className="text-slate-400 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5" /> Address / Location
              </span>
              <span className="font-semibold text-slate-800 text-right">
                {data.location || "N/A"}
              </span>
            </div>

            <div className="flex items-center justify-between py-1 border-b border-slate-100">
              <span className="text-slate-400 flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5" /> Contact Phone
              </span>
              <span className="font-semibold text-slate-800">
                {data.contact || "N/A"}
              </span>
            </div>

            <div className="flex items-center justify-between py-1 border-b border-slate-100">
              <span className="text-slate-400 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5" /> GST / PAN
              </span>
              <span className="font-semibold text-slate-800">
                GST: {data.gst_no || "N/A"} | PAN: {data.pan || "N/A"}
              </span>
            </div>

            <div className="flex items-center justify-between py-1">
              <span className="text-slate-400 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" /> Onboarding Date
              </span>
              <span className="font-semibold text-slate-800">
                {data.created_at ? new Date(data.created_at).toLocaleString() : "N/A"}
              </span>
            </div>
          </div>

          {/* Users List Under This Pharmacy */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <Users className="w-4 h-4 text-brand-500" />
                Users Registered Under This Pharmacy ({data.users?.length || 0})
              </h4>
            </div>

            {data.users && data.users.length > 0 ? (
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
                {data.users.map((u) => (
                  <div key={u.id} className="p-3.5 flex items-center justify-between gap-3 text-xs">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900">{u.name || "User"}</span>
                        {u.is_primary_admin && (
                          <span className="px-1.5 py-0.2 text-[9px] font-extrabold uppercase rounded bg-brand-100 text-brand-800">
                            Primary Admin
                          </span>
                        )}
                        <span className="text-[10px] font-semibold text-slate-400 px-1.5 py-0.2 bg-slate-100 rounded">
                          {u.role || "STAFF"}
                        </span>
                      </div>
                      <div className="text-slate-500 text-[11px] mt-0.5">
                        {u.email} • {u.mobile || "No mobile"}
                      </div>
                    </div>

                    <div className="text-right">
                      <span
                        className={`inline-block px-2 py-0.5 text-[10px] font-bold rounded-full ${
                          u.subscription_plan && u.subscription_plan !== "NONE"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-rose-100 text-rose-800"
                        }`}
                      >
                        {u.subscription_plan ? `Plan: ${u.subscription_plan}` : "No Active Plan"}
                      </span>
                      {u.subscription_expiry && (
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          Exp: {new Date(u.subscription_expiry).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 text-center rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-400">
                No users currently registered under this pharmacy.
              </div>
            )}
          </div>
        </div>
      ) : null}
    </BottomDrawer>
  );
}
