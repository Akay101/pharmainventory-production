import React, { useState } from "react";
import {
  Ticket,
  Plus,
  Copy,
  Check,
  Search,
  CheckCircle2,
  XCircle,
  Trash2,
  Power,
  Building,
  User,
  Clock,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

export default function PromoCodesPage({
  promos,
  summary,
  searchQuery,
  onSearchChange,
  onOpenGenerateModal,
  onTogglePromo,
  onDeletePromo,
}) {
  const [copiedCode, setCopiedCode] = useState(null);
  const [filterKind, setFilterKind] = useState("ALL");

  const filtered = promos.filter((p) => {
    if (searchQuery) {
      const term = searchQuery.toLowerCase();
      const match =
        p.code?.toLowerCase().includes(term) ||
        p.used_by_pharmacy_name?.toLowerCase().includes(term);
      if (!match) return false;
    }
    if (filterKind === "TRIAL" && p.source !== "TRIAL") return false;
    if ((filterKind === "ACCESS" || filterKind === "DISCOUNT") && (p.type !== filterKind || p.source === "TRIAL")) return false;
    return true;
  });

  const handleCopy = (code) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    toast.success(`Code ${code} copied to clipboard!`);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const uses = (promo) => `${promo.used_count}/${promo.usage_limit || "∞"}`;

  const getStatusBadge = (promo) => {
    const label = {
      INACTIVE: "Inactive",
      EXHAUSTED: "Used up",
      EXPIRED: "Expired",
      SCHEDULED: "Scheduled",
      ACTIVE: "Active",
    }[promo.status] || promo.status;
    return (
      <span className={`status-pill ${promo.status === "ACTIVE" ? "status-pill-active" : "status-pill-inactive"}`}>
        {promo.status === "ACTIVE" && <CheckCircle2 className="w-3 h-3 text-emerald-600" />}
        {label} ({uses(promo)})
      </span>
    );
  };

  const benefit = (promo) => {
    if (promo.type === "DISCOUNT" && promo.discount) {
      const off = promo.discount.type === "PERCENT" ? `${promo.discount.value}% off` : `₹${promo.discount.value} off`;
      const cap = promo.discount.max_discount_rupees ? ` (max ₹${promo.discount.max_discount_rupees})` : "";
      return { title: off + cap, sub: promo.plans?.length ? promo.plans.join(", ") : "Any plan" };
    }
    return { title: `${promo.plan || "—"} access`, sub: `${promo.duration_days || "?"} days` };
  };

  return (
    <div className="space-y-5">
      {/* Top Header Card */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center font-bold">
              <Ticket className="w-4 h-4" />
            </div>
            <h2 className="text-xl font-black text-slate-900 tracking-tight">
              Promo, Discount & Trial Codes
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Access codes activate a plan for a set number of days. Discount codes reduce the price at checkout. Free-trial codes are created automatically.
          </p>
        </div>

        {/* Generate Button (Matching Reference 1 "+ Add Rebate / Code" orange button) */}
        <button
          onClick={onOpenGenerateModal}
          className="flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-extrabold text-white bg-brand-500 hover:bg-brand-600 rounded-xl shadow-md shadow-orange-500/20 active:scale-[0.98] transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>Create code</span>
        </button>
      </div>

      {/* Summary Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase">Total Generated</span>
          <div className="text-xl font-black text-slate-900 mt-0.5">{summary?.total || 0}</div>
        </div>
        <div className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase">Active for Use</span>
          <div className="text-xl font-black text-emerald-600 mt-0.5">{summary?.active || 0}</div>
        </div>
        <div className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase">Redeemed Codes</span>
          <div className="text-xl font-black text-brand-600 mt-0.5">{summary?.redeemed || 0}</div>
        </div>
        <div className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase">Fully Exhausted</span>
          <div className="text-xl font-black text-slate-500 mt-0.5">{summary?.exhausted || 0}</div>
        </div>
      </div>

      {/* Table Container */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        {/* Toolbar */}
        <div className="p-4 bg-slate-50/70 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {[
              ["ALL", "All codes"],
              ["ACCESS", "Access"],
              ["DISCOUNT", "Discount"],
              ["TRIAL", "Free trials"],
            ].map(([kind, label]) => (
              <button
                key={kind}
                onClick={() => setFilterKind(kind)}
                className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all ${
                  filterKind === kind
                    ? "bg-slate-900 text-white"
                    : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search code or pharmacy redeemed..."
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-xl focus:border-brand-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-50 text-slate-500 text-[10px] uppercase font-bold tracking-wider border-b border-slate-200">
              <tr>
                <th className="py-3 px-4 min-w-[150px] whitespace-nowrap">Promo Code</th>
                <th className="py-3 px-4 min-w-[150px] whitespace-nowrap">Benefit</th>
                <th className="py-3 px-4 min-w-[130px] whitespace-nowrap">Validity</th>
                <th className="py-3 px-4 min-w-[150px] whitespace-nowrap">Status & Uses</th>
                <th className="py-3 px-4 min-w-[200px]">Redemption Audit</th>
                <th className="py-3 px-4 min-w-[120px] whitespace-nowrap">Created Date</th>
                <th className="py-3 px-4 min-w-[120px] text-right whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400 space-y-2">
                    <Ticket className="w-8 h-8 text-slate-300 mx-auto" />
                    <div>No promo codes found matching criteria.</div>
                  </td>
                </tr>
              ) : (
                filtered.map((promo) => (
                  <tr key={promo.code} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-slate-900 bg-slate-100 px-2 py-1 rounded-lg border border-slate-200 text-xs tracking-wider">
                          {promo.code}
                        </span>
                        <button
                          onClick={() => handleCopy(promo.code)}
                          className="p-1 text-slate-400 hover:text-brand-600 rounded transition-colors"
                          title="Copy Code"
                        >
                          {copiedCode === promo.code ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="font-bold text-slate-800 flex items-center gap-1.5">
                        {benefit(promo).title}
                        {promo.source === "TRIAL" && (
                          <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">TRIAL</span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400">{benefit(promo).sub}</div>
                    </td>

                    <td className="py-3.5 px-4 text-[11px] text-slate-600">
                      {promo.valid_until
                        ? `Until ${new Date(promo.valid_until).toLocaleDateString()}`
                        : promo.valid_from
                          ? `From ${new Date(promo.valid_from).toLocaleDateString()}`
                          : "No expiry"}
                    </td>

                    <td className="py-3.5 px-4">{getStatusBadge(promo)}</td>

                    <td className="py-3.5 px-4">
                      {promo.used_by_pharmacy_name ? (
                        <div>
                          <div className="font-bold text-slate-800 flex items-center gap-1">
                            <Building className="w-3 h-3 text-slate-400" />
                            {promo.used_by_pharmacy_name}
                          </div>
                          {promo.used_at && (
                            <div className="text-[10px] text-slate-400">
                              Redeemed {new Date(promo.used_at).toLocaleDateString()}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400 text-[11px] italic">Not redeemed yet</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-slate-500">
                      {promo.created_at
                        ? new Date(promo.created_at).toLocaleDateString()
                        : "N/A"}
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => onTogglePromo(promo.code)}
                          className={`p-1.5 rounded-lg border transition-colors ${
                            promo.is_active
                              ? "text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100"
                              : "text-slate-500 bg-slate-100 border-slate-200 hover:bg-slate-200"
                          }`}
                          title={promo.is_active ? "Deactivate code" : "Activate code"}
                        >
                          <Power className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => onDeletePromo(promo.code)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                          title="Delete Code"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
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
