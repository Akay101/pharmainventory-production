import React, { useState } from "react";
import {
  Users,
  Search,
  CheckCircle2,
  Flame,
  Building,
  Mail,
  Phone,
  Calendar,
  Shield,
  Layers,
  Clock,
  Hourglass,
  MailX,
  ChevronRight,
} from "lucide-react";

// Older API responses only had is_subscribed; newer ones carry status.
const statusOf = (u) => u.status || (u.is_subscribed ? "SUBSCRIBED" : "LEAD");

const FILTERS = [
  ["ALL", "All"],
  ["SUBSCRIBED", "Paid"],
  ["TRIAL", "On trial"],
  ["EXPIRED", "Expired"],
  ["LEAD", "Leads"],
  ["INCOMPLETE", "Incomplete signup"],
  ["OFFER_5050", "50-50 users"],
];

// Lifetime amount the pharmacy has paid (all successful checkouts)
function PaidLine({ user }) {
  if (!user.total_paid_paise) return null;
  const p = user.total_paid_paise;
  return (
    <div className="text-[10px] font-bold text-emerald-700 mt-0.5">
      ₹{(p / 100).toLocaleString("en-IN", { minimumFractionDigits: p % 100 ? 2 : 0, maximumFractionDigits: 2 })} paid
      {user.payments > 1 ? ` · ${user.payments} payments` : ""}
    </div>
  );
}

function SubscriptionCell({ user }) {
  const status = statusOf(user);
  const sub = user.subscription;
  if (status === "TRIAL") {
    return (
      <div>
        <span className="status-pill bg-amber-50 text-amber-700 border border-amber-200">
          <Clock className="w-3 h-3" />
          On trial · {sub?.plan || user.subscription_plan}
        </span>
        <div className={`text-[10px] mt-0.5 font-semibold ${user.days_left <= 2 ? "text-rose-600" : "text-slate-500"}`}>
          {user.days_left} day(s) left · ends {new Date(sub?.ends_at || user.subscription_expiry).toLocaleDateString()}
        </div>
      </div>
    );
  }
  if (status === "SUBSCRIBED") {
    return (
      <div>
        <span className="status-pill status-pill-active">
          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
          {sub?.plan || user.subscription_plan || "Active"}
          {sub?.kind && sub.kind !== "PAID" ? " · free" : ""}
        </span>
        {(sub?.ends_at || user.subscription_expiry) && (
          <div className="text-[10px] text-slate-400 mt-0.5">
            {user.days_left != null ? `${user.days_left} day(s) left · ` : ""}Exp: {new Date(sub?.ends_at || user.subscription_expiry).toLocaleDateString()}
          </div>
        )}
        <PaidLine user={user} />
      </div>
    );
  }
  if (status === "EXPIRED") {
    return (
      <div>
        <PaidLine user={user} />
        <span className="status-pill bg-rose-50 text-rose-700 border border-rose-200">
          <Hourglass className="w-3 h-3" />
          {sub?.kind === "TRIAL" ? "Trial ended" : "Plan expired"}
        </span>
        {sub?.ends_at && <div className="text-[10px] text-slate-400 mt-0.5">on {new Date(sub.ends_at).toLocaleDateString()}</div>}
      </div>
    );
  }
  if (status === "INCOMPLETE") {
    return (
      <span className="status-pill bg-slate-100 text-slate-600 border border-slate-200">
        <MailX className="w-3 h-3" />
        Didn't verify email
      </span>
    );
  }
  return (
    <span className="status-pill status-pill-lead">
      <Flame className="w-3 h-3 text-rose-600" />
      Unpaid Lead
    </span>
  );
}

export default function UsersPage({
  users,
  searchQuery,
  onSearchChange,
  onOpenLeadModal,
  onOpenPharmacyModal,
  onOpenUser,
}) {
  const [filterSub, setFilterSub] = useState("ALL"); // ALL, SUBSCRIBED, TRIAL, EXPIRED, LEAD, INCOMPLETE
  const [filterRole, setFilterRole] = useState("ALL"); // ALL, ADMIN, STAFF

  const filtered = users.filter((u) => {
    if (searchQuery) {
      const term = searchQuery.toLowerCase();
      const match =
        u.name?.toLowerCase().includes(term) ||
        u.email?.toLowerCase().includes(term) ||
        u.mobile?.includes(term) ||
        u.pharmacy_name?.toLowerCase().includes(term);
      if (!match) return false;
    }
    if (filterSub === "LEAD" && u.is_subscribed) return false;
    if (["SUBSCRIBED", "TRIAL", "EXPIRED", "INCOMPLETE"].includes(filterSub) && statusOf(u) !== filterSub) return false;
    if (filterSub === "OFFER_5050" && !u.offer_5050) return false;
    if (filterRole === "ADMIN" && !u.is_primary_admin) return false;
    if (filterRole === "STAFF" && u.is_primary_admin) return false;
    return true;
  });

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              <Users className="w-4 h-4" />
            </div>
            <h2 className="text-xl font-black text-slate-900 tracking-tight">
              User Accounts Directory
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Browse all user accounts registered on Pharmalogy, their assigned pharmacy store, and subscription status.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs font-bold text-slate-700 bg-slate-50 px-3.5 py-1.5 rounded-xl border border-slate-200">
          {users.length} Total Users Across All Stores
        </div>
      </div>

      {/* Table Container */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        {/* Filters */}
        <div className="p-4 bg-slate-50/70 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center bg-white border border-slate-200 rounded-xl p-0.5">
              {FILTERS.map(([f, label]) => (
                <button
                  key={f}
                  onClick={() => setFilterSub(f)}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                    filterSub === f
                      ? "bg-slate-900 text-white shadow-2xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {label}
                  {f !== "ALL" && (
                    <span className="ml-1 opacity-60">
                      {f === "LEAD" ? users.filter((u) => !u.is_subscribed).length : f === "OFFER_5050" ? users.filter((u) => u.offer_5050).length : users.filter((u) => statusOf(u) === f).length}
                    </span>
                  )}
                </button>
              ))}
            </div>

            <select
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value)}
              className="text-xs font-semibold px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-slate-700 focus:outline-none"
            >
              <option value="ALL">All Roles</option>
              <option value="ADMIN">Primary Admins</option>
              <option value="STAFF">Pharmacy Staff</option>
            </select>
          </div>

          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search user name, email, phone, pharmacy..."
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-xl focus:border-brand-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-50 text-slate-500 text-[10px] uppercase font-bold tracking-wider border-b border-slate-200">
              <tr>
                <th className="py-3 px-4 min-w-[200px]">User Account</th>
                <th className="py-3 px-4 min-w-[220px]">Pharmacy Store</th>
                <th className="py-3 px-4 min-w-[160px] whitespace-nowrap">Contact</th>
                <th className="py-3 px-4 min-w-[100px] whitespace-nowrap">Role</th>
                <th className="py-3 px-4 min-w-[140px] whitespace-nowrap">Subscription</th>
                <th className="py-3 px-4 min-w-[120px] whitespace-nowrap">Registration</th>
                <th className="py-3 px-4 min-w-[110px] text-right whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    No users matching filter criteria.
                  </td>
                </tr>
              ) : (
                filtered.map((user) => (
                  <tr
                    key={user.id}
                    onClick={() => onOpenUser?.(user.id)}
                    className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                  >
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-700 font-bold flex items-center justify-center text-xs shrink-0">
                          {user.name?.charAt(0)?.toUpperCase() || "U"}
                        </div>
                        <div>
                          <div className="font-bold text-slate-900 flex items-center gap-1.5">
                            {user.name}
                            {user.offer_5050 && (
                              <span
                                className={`rounded-full px-1.5 py-0.5 text-[9px] font-black ${user.offer_5050.code_redeemed ? "bg-emerald-100 text-emerald-700" : "bg-orange-100 text-orange-700"}`}
                                title={user.offer_5050.code_redeemed ? `50-50 launch offer · code ${user.offer_5050.code} applied` : `Registered for the 50-50 launch offer (${user.offer_5050.registration_id || ""}); offer code not applied yet`}
                              >
                                50-50{user.offer_5050.code_redeemed ? " ✓" : ""}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400">{user.email}</div>
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          user.pharmacy_id && onOpenPharmacyModal(user.pharmacy_id);
                        }}
                        className="font-semibold text-brand-600 hover:underline cursor-pointer flex items-center gap-1"
                      >
                        <Building className="w-3 h-3 text-slate-400" />
                        <span>{user.pharmacy_name}</span>
                      </div>
                      <div className="text-[10px] text-slate-400 truncate max-w-xs">
                        {user.pharmacy_location}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 font-medium text-slate-800">
                      {user.mobile || "N/A"}
                    </td>

                    <td className="py-3.5 px-4">
                      <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-slate-100 text-slate-700">
                        {user.role}
                      </span>
                    </td>

                    <td className="py-3.5 px-4">
                      <SubscriptionCell user={user} />
                    </td>

                    <td className="py-3.5 px-4 text-slate-500">
                      {user.created_at ? new Date(user.created_at).toLocaleDateString() : "N/A"}
                    </td>

                    <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                      {!user.is_subscribed && statusOf(user) !== "INCOMPLETE" ? (
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
                              created_at: user.created_at,
                              notes: [],
                            })
                          }
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-white bg-brand-500 hover:bg-brand-600 rounded-xl shadow-xs transition-colors"
                        >
                          <Phone className="w-3 h-3" />
                          <span>Connect</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => onOpenUser?.(user.id)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
                        >
                          <span>{statusOf(user) === "INCOMPLETE" ? "Details" : "Manage"}</span>
                          <ChevronRight className="w-3 h-3" />
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
