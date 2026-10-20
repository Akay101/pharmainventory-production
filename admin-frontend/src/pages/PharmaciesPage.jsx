import React, { useState } from "react";
import {
  Building2,
  Users,
  Search,
  MapPin,
  Receipt,
  FileText,
  ExternalLink,
  Shield,
  Layers,
  Calendar,
} from "lucide-react";

export default function PharmaciesPage({
  pharmacies,
  searchQuery,
  onSearchChange,
  onOpenPharmacyModal,
  onRefresh,
}) {
  const [filterView, setFilterView] = useState("ALL"); // ALL, ACTIVE, NO_USERS

  const filtered = pharmacies.filter((p) => {
    if (searchQuery) {
      const term = searchQuery.toLowerCase();
      const match =
        p.name?.toLowerCase().includes(term) ||
        p.location?.toLowerCase().includes(term) ||
        p.license_no?.toLowerCase().includes(term);
      if (!match) return false;
    }
    if (filterView === "ACTIVE") return p.user_count > 0;
    if (filterView === "NO_USERS") return p.user_count === 0;
    return true;
  });

  return (
    <div className="space-y-5">
      {/* Top Header Card */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
              <Building2 className="w-4 h-4" />
            </div>
            <h2 className="text-xl font-black text-slate-900 tracking-tight">
              Onboarded Pharmacies Directory
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Browse all onboarded pharmacies, see active registered staff count per store, billing totals, and license information.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="px-3.5 py-1.5 bg-purple-50 border border-purple-200 rounded-xl text-xs font-bold text-purple-700">
            {pharmacies.length} Total Stores Onboarded
          </div>
        </div>
      </div>

      {/* Table Container */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        {/* Filter bar */}
        <div className="p-4 bg-slate-50/70 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {[
              { id: "ALL", label: `All Stores (${pharmacies.length})` },
              {
                id: "ACTIVE",
                label: `With Users (${pharmacies.filter((p) => p.user_count > 0).length})`,
              },
              {
                id: "NO_USERS",
                label: `Empty (${pharmacies.filter((p) => p.user_count === 0).length})`,
              },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setFilterView(tab.id)}
                className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all ${
                  filterView === tab.id
                    ? "bg-slate-900 text-white shadow-xs"
                    : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search pharmacy name, location, license..."
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-xl focus:border-brand-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-50 text-slate-500 text-[10px] uppercase font-bold tracking-wider border-b border-slate-200">
              <tr>
                <th className="py-3 px-4 min-w-[240px]">Pharmacy Store</th>
                <th className="py-3 px-4 min-w-[220px]">Location / Address</th>
                <th className="py-3 px-4 min-w-[140px] whitespace-nowrap">Users Registered</th>
                <th className="py-3 px-4 min-w-[130px] whitespace-nowrap">Drug License</th>
                <th className="py-3 px-4 min-w-[120px] whitespace-nowrap">Invoices Created</th>
                <th className="py-3 px-4 min-w-[120px] whitespace-nowrap">Status</th>
                <th className="py-3 px-4 min-w-[120px] text-right whitespace-nowrap">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    No pharmacies matching filter criteria.
                  </td>
                </tr>
              ) : (
                filtered.map((pharmacy) => (
                  <tr
                    key={pharmacy.id}
                    className="hover:bg-slate-50/80 transition-colors"
                  >
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-purple-100 text-purple-700 font-extrabold flex items-center justify-center text-sm shrink-0">
                          {pharmacy.name?.charAt(0)?.toUpperCase() || "P"}
                        </div>
                        <div>
                          <div className="font-bold text-slate-900">{pharmacy.name}</div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            ID: {pharmacy.id.slice(0, 8)}...
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-1.5 text-slate-700 max-w-xs truncate">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">{pharmacy.location}</span>
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-800">
                        <Users className="w-3 h-3 text-brand-500" />
                        <span>
                          {pharmacy.user_count}{" "}
                          {pharmacy.user_count === 1 ? "User" : "Users"}
                        </span>
                      </div>
                    </td>

                    <td className="py-3.5 px-4 font-mono text-slate-700">
                      {pharmacy.license_no || "N/A"}
                    </td>

                    <td className="py-3.5 px-4 font-semibold text-slate-800">
                      {pharmacy.bills_count || 0}
                    </td>

                    <td className="py-3.5 px-4">
                      {pharmacy.user_count > 0 ? (
                        <span className="status-pill status-pill-active">
                          Active Store
                        </span>
                      ) : (
                        <span className="status-pill status-pill-inactive">
                          No Users Yet
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={() => onOpenPharmacyModal(pharmacy.id)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
                      >
                        <span>View Users</span>
                        <ExternalLink className="w-3 h-3" />
                      </button>
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
