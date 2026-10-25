import React, { useState } from "react";
import {
  Flame,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  Phone,
  MessageCircle,
  MessageSquare,
  Building,
  User,
  Calendar,
  Sparkles,
  RefreshCw,
} from "lucide-react";

export default function LeadsCRM({
  leads,
  summary,
  searchQuery,
  onSearchChange,
  onOpenLeadModal,
  onMarkConnected,
  onRefresh,
}) {
  const [selectedFilter, setSelectedFilter] = useState("ALL"); // ALL, UNCONTACTED, CONNECTED, DROPPED_OTP, WON
  const [selectedLeads, setSelectedLeads] = useState(new Set());

  // Filter leads by tab
  const filteredLeads = leads.filter((lead) => {
    if (searchQuery) {
      const term = searchQuery.toLowerCase();
      const match =
        lead.name?.toLowerCase().includes(term) ||
        lead.email?.toLowerCase().includes(term) ||
        lead.mobile?.includes(term) ||
        lead.pharmacy_name?.toLowerCase().includes(term);
      if (!match) return false;
    }

    if (selectedFilter === "UNCONTACTED") {
      return !lead.is_connected && lead.crm_status === "NEW";
    }
    if (selectedFilter === "CONNECTED") {
      return lead.is_connected;
    }
    if (selectedFilter === "DROPPED_OTP") {
      return lead.source_type === "PENDING_REGISTRATION" || lead.lead_category === "DROPPED_AT_OTP";
    }
    if (selectedFilter === "WON") {
      return lead.crm_status === "WON";
    }
    return true;
  });

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedLeads(new Set(filteredLeads.map((l) => l.lead_id)));
    } else {
      setSelectedLeads(new Set());
    }
  };

  const handleToggleSelect = (id) => {
    const next = new Set(selectedLeads);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedLeads(next);
  };

  const getStatusBadge = (lead) => {
    if (lead.crm_status === "WON") {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold rounded-lg border bg-emerald-50 text-emerald-700 border-emerald-300 uppercase tracking-wide whitespace-nowrap">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          Converted
        </span>
      );
    }
    if (lead.is_connected) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold rounded-lg border bg-indigo-50 text-indigo-700 border-indigo-200 uppercase tracking-wide whitespace-nowrap">
          <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
          Connected
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-extrabold rounded-lg border bg-rose-50 text-rose-700 border-rose-200 uppercase tracking-wide whitespace-nowrap shadow-2xs">
        <Flame className="w-3.5 h-3.5 text-rose-600 shrink-0" />
        Fresh Lead
      </span>
    );
  };

  const getCategoryLabel = (cat) => {
    switch (cat) {
      case "NEW_REGISTRATION_UNPAID":
        return { label: "New Unpaid", color: "bg-amber-50 text-amber-800 border-amber-200" };
      case "SUBSCRIPTION_EXPIRED":
        return { label: "Expired Sub", color: "bg-purple-50 text-purple-800 border-purple-200" };
      case "DROPPED_AT_OTP":
        return { label: "OTP Drop-off", color: "bg-sky-50 text-sky-800 border-sky-200" };
      default:
        return { label: "Lead", color: "bg-slate-50 text-slate-800 border-slate-200" };
    }
  };

  return (
    <div className="space-y-5">
      {/* Top Header Card */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold">
              <Flame className="w-4 h-4" />
            </div>
            <h2 className="text-xl font-black text-slate-900 tracking-tight">
              Customer Leads & Follow-up CRM
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Track all users who haven't paid or completed signup. Connect, log call notes, and nurture into active DavaDesk subscriptions.
          </p>
        </div>

        {/* Stats Pill Badges */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="px-3.5 py-1.5 bg-rose-50 border border-rose-200 rounded-xl text-xs font-bold text-rose-700 flex items-center gap-1.5 whitespace-nowrap">
            <Flame className="w-3.5 h-3.5" />
            <span>{summary?.fresh_uncontacted || 0} Uncontacted</span>
          </div>

          <div className="px-3.5 py-1.5 bg-indigo-50 border border-indigo-200 rounded-xl text-xs font-bold text-indigo-700 flex items-center gap-1.5 whitespace-nowrap">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{summary?.connected_leads || 0} In Discussion</span>
          </div>
        </div>
      </div>

      {/* Tabs and Toolbar */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        {/* Navigation Tabs Header */}
        <div className="flex items-center justify-between px-4 pt-3 border-b border-slate-200 overflow-x-auto">
          <div className="flex items-center gap-1 sm:gap-2">
            {[
              { id: "ALL", label: `All Leads (${leads.length})` },
              { id: "UNCONTACTED", label: `Fresh Uncontacted (${summary?.fresh_uncontacted || 0})` },
              { id: "CONNECTED", label: `Connected (${summary?.connected_leads || 0})` },
              { id: "DROPPED_OTP", label: "OTP Drop-offs" },
              { id: "WON", label: "Converted / Won" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setSelectedFilter(tab.id)}
                className={`px-3 py-2.5 text-xs font-bold border-b-2 transition-all whitespace-nowrap ${
                  selectedFilter === tab.id
                    ? "border-brand-500 text-brand-600"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="hidden sm:flex items-center gap-2 pb-2">
            <button
              onClick={onRefresh}
              className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
              title="Reload Leads"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Action Toolbar */}
        <div className="p-3 sm:p-4 bg-slate-50/70 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search leads by customer, mobile, pharmacy..."
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-xl focus:border-brand-500 focus:outline-none shadow-2xs"
            />
          </div>

          <div className="flex items-center gap-3">
            {selectedLeads.size > 0 && (
              <span className="text-xs font-bold text-slate-700 bg-white px-2.5 py-1 rounded-lg border border-slate-300 shadow-2xs">
                {selectedLeads.size} selected
              </span>
            )}

            <span className="text-xs text-slate-500 font-medium whitespace-nowrap">
              Showing <strong>{filteredLeads.length}</strong> of {leads.length} leads
            </span>
          </div>
        </div>

        {/* Table Content with Non-Wrapping Columns */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-50 text-slate-500 text-[10px] uppercase font-bold tracking-wider border-b border-slate-200">
              <tr>
                <th className="py-3 px-4 w-10 text-center">
                  <input
                    type="checkbox"
                    onChange={handleSelectAll}
                    checked={
                      filteredLeads.length > 0 &&
                      selectedLeads.size === filteredLeads.length
                    }
                    className="rounded text-brand-600 focus:ring-brand-500"
                  />
                </th>
                <th className="py-3 px-4 min-w-[240px]">Customer & Pharmacy</th>
                <th className="py-3 px-4 min-w-[190px]">Contact Details</th>
                <th className="py-3 px-4 min-w-[130px] whitespace-nowrap">Lead Type</th>
                <th className="py-3 px-4 min-w-[130px] whitespace-nowrap">CRM Status</th>
                <th className="py-3 px-4 min-w-[130px] whitespace-nowrap">Notes History</th>
                <th className="py-3 px-4 min-w-[180px] text-right whitespace-nowrap">Connect & Log</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredLeads.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400 space-y-2">
                    <Flame className="w-8 h-8 text-slate-300 mx-auto" />
                    <div>No leads found in this view.</div>
                  </td>
                </tr>
              ) : (
                filteredLeads.map((lead) => {
                  const cat = getCategoryLabel(lead.lead_category);
                  const isChecked = selectedLeads.has(lead.lead_id);
                  const cleanPhone = lead.mobile ? lead.mobile.replace(/\D/g, "") : "";
                  const waUrl = cleanPhone
                    ? `https://wa.me/${cleanPhone.startsWith("91") ? cleanPhone : "91" + cleanPhone}`
                    : "#";

                  return (
                    <tr
                      key={lead.lead_id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isChecked ? "bg-brand-50/30" : ""
                      }`}
                    >
                      <td className="py-3.5 px-4 text-center">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleSelect(lead.lead_id)}
                          className="rounded text-brand-600 focus:ring-brand-500"
                        />
                      </td>

                      <td className="py-3.5 px-4 min-w-[240px]">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-rose-100 text-rose-700 font-bold flex items-center justify-center text-xs shrink-0">
                            {lead.name?.charAt(0)?.toUpperCase() || "L"}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900">{lead.name}</div>
                            <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                              <Building className="w-3 h-3 text-slate-400 shrink-0" />
                              <span className="font-medium text-slate-700">
                                {lead.pharmacy_name || "Unassigned"}
                              </span>
                              {lead.pharmacy_location && (
                                <span className="text-slate-400">
                                  • {lead.pharmacy_location}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 min-w-[190px]">
                        <div className="flex items-center gap-2 whitespace-nowrap">
                          <span className="font-bold text-slate-800">
                            {lead.mobile || "No phone"}
                          </span>
                          {cleanPhone && (
                            <a
                              href={waUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-emerald-600 hover:text-emerald-700 p-0.5 rounded hover:bg-emerald-50 transition-colors shrink-0"
                              title="Chat on WhatsApp"
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 truncate max-w-[190px]">
                          {lead.email}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 min-w-[130px] whitespace-nowrap">
                        <span
                          className={`inline-flex items-center text-[10px] font-bold px-2.5 py-0.5 rounded-full border whitespace-nowrap ${cat.color}`}
                        >
                          {cat.label}
                        </span>
                        <div className="text-[10px] text-slate-400 mt-1 whitespace-nowrap">
                          {lead.created_at
                            ? new Date(lead.created_at).toLocaleDateString()
                            : "N/A"}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 min-w-[130px] whitespace-nowrap">
                        {getStatusBadge(lead)}
                      </td>

                      <td className="py-3.5 px-4 min-w-[130px] whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => onOpenLeadModal(lead)}
                          className="inline-flex items-center gap-1.5 text-xs text-slate-600 hover:text-brand-600 font-medium transition-colors"
                        >
                          <MessageSquare className="w-3.5 h-3.5 text-slate-400" />
                          <span>
                            {lead.notes?.length > 0
                              ? `${lead.notes.length} note${
                                  lead.notes.length > 1 ? "s" : ""
                                }`
                              : "No notes yet"}
                          </span>
                        </button>
                        {lead.last_connected_at && (
                          <div className="text-[10px] text-slate-400 mt-0.5 whitespace-nowrap">
                            Last: {new Date(lead.last_connected_at).toLocaleDateString()}
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-4 min-w-[180px] text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          {!lead.is_connected && (
                            <button
                              onClick={() => onMarkConnected(lead.lead_id)}
                              className="p-1.5 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors border border-transparent hover:border-emerald-200"
                              title="Quick Mark Connected"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                            </button>
                          )}

                          <button
                            onClick={() => onOpenLeadModal(lead)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-brand-500 hover:bg-brand-600 rounded-xl shadow-xs transition-colors whitespace-nowrap"
                          >
                            <Phone className="w-3.5 h-3.5 shrink-0" />
                            <span>Connect & Notes</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
