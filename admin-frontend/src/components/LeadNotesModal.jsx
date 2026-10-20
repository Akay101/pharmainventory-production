import React, { useState } from "react";
import BottomDrawer from "./BottomDrawer";
import {
  Phone,
  MessageCircle,
  Mail,
  CheckCircle2,
  Clock,
  User,
  Building,
  Calendar,
  Send,
  Sparkles,
} from "lucide-react";

export default function LeadNotesModal({
  isOpen,
  onClose,
  lead,
  onMarkConnected,
  onAddNote,
  onStatusChange,
}) {
  const [noteText, setNoteText] = useState("");
  const [author, setAuthor] = useState("DavaDesk Team");
  const [outcome, setOutcome] = useState("Spoke on phone - Interested");
  const [followUpDate, setFollowUpDate] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!lead) return null;

  const handleConnect = async () => {
    setIsSubmitting(true);
    try {
      await onMarkConnected(lead.lead_id);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddNoteSubmit = async (e) => {
    e.preventDefault();
    if (!noteText.trim()) return;

    setIsSubmitting(true);
    try {
      await onAddNote(lead.lead_id, {
        text: noteText.trim(),
        author: author.trim() || "DavaDesk Team",
        outcome,
        follow_up_date: followUpDate || null,
      });
      setNoteText("");
      setFollowUpDate("");
    } finally {
      setIsSubmitting(false);
    }
  };

  const cleanPhone = lead.mobile ? lead.mobile.replace(/\D/g, "") : "";
  const whatsappUrl = cleanPhone
    ? `https://wa.me/${cleanPhone.startsWith("91") ? cleanPhone : "91" + cleanPhone}?text=${encodeURIComponent(
        `Hi ${lead.name || ""}, I am reaching out from DavaDesk regarding your pharmacy registration for ${lead.pharmacy_name || "your store"}. How can we assist you with onboarding?`
      )}`
    : "#";

  return (
    <BottomDrawer
      isOpen={isOpen}
      onClose={onClose}
      title={lead.name || "Customer Lead"}
      subtitle={`${lead.pharmacy_name || "Pharmacy"} • ${lead.mobile || "No phone"}`}
      maxWidth="max-w-2xl"
    >
      <div className="space-y-6">
        {/* Customer Quick Overview Card */}
        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <span
                className={`px-2.5 py-1 text-xs font-bold rounded-lg uppercase tracking-wide whitespace-nowrap ${
                  lead.is_connected
                    ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                    : "bg-rose-100 text-rose-800 border border-rose-300 animate-pulse"
                }`}
              >
                {lead.is_connected ? "Connected" : "Uncontacted Lead"}
              </span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-200 text-slate-700 whitespace-nowrap">
                {lead.lead_category || "NEW LEAD"}
              </span>
            </div>

            {/* Quick Contact Actions */}
            <div className="flex items-center gap-2">
              {lead.mobile && (
                <>
                  <a
                    href={`tel:${lead.mobile}`}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition-colors whitespace-nowrap"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    <span>Call</span>
                  </a>

                  <a
                    href={whatsappUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition-colors whitespace-nowrap"
                  >
                    <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                    <span>WhatsApp</span>
                  </a>
                </>
              )}

              {lead.email && (
                <a
                  href={`mailto:${lead.email}`}
                  className="p-1.5 text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors"
                  title="Send Email"
                >
                  <Mail className="w-4 h-4" />
                </a>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-600">
            <div className="flex items-center gap-2">
              <Building className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="font-medium truncate">{lead.pharmacy_name || "N/A"}</span>
            </div>
            <div className="flex items-center gap-2">
              <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="font-medium truncate">{lead.email}</span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="whitespace-nowrap">Registered: {new Date(lead.created_at).toLocaleDateString()}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span>
                Status: <strong className="text-slate-900">{lead.crm_status || "NEW"}</strong>
              </span>
            </div>
          </div>
        </div>

        {/* Mark Connected & Stage Selector */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-brand-50/60 rounded-xl border border-brand-200/70">
          <div>
            <div className="text-xs font-bold text-brand-900">Connection Status</div>
            <div className="text-[11px] text-brand-700">
              {lead.is_connected
                ? `Last contacted: ${
                    lead.last_connected_at
                      ? new Date(lead.last_connected_at).toLocaleString()
                      : "Recently"
                  }`
                : "Not yet contacted. Mark connected after calling customer."}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!lead.is_connected && (
              <button
                type="button"
                onClick={handleConnect}
                disabled={isSubmitting}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-brand-500 hover:bg-brand-600 rounded-xl shadow-xs transition-colors whitespace-nowrap"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Mark as Connected</span>
              </button>
            )}

            <select
              value={lead.crm_status || "NEW"}
              onChange={(e) => onStatusChange(lead.lead_id, e.target.value)}
              className="text-xs font-semibold px-2.5 py-1.5 bg-white border border-slate-300 rounded-xl text-slate-700 focus:outline-none focus:border-brand-500"
            >
              <option value="NEW">Stage: New</option>
              <option value="CONNECTED">Stage: Connected</option>
              <option value="FOLLOW_UP">Stage: Follow Up</option>
              <option value="WON">Stage: Won (Subscribed)</option>
              <option value="LOST">Stage: Lost / Uninterested</option>
            </select>
          </div>
        </div>

        {/* Add Note Form */}
        <form onSubmit={handleAddNoteSubmit} className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-800 tracking-tight flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-brand-500" />
              Add Customer Note / Call Log
            </label>
            <span className="text-[11px] text-slate-400">Notes are visible to the entire DavaDesk team</span>
          </div>

          <textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="Type in notes here (e.g. Spoke with pharmacy owner; interested in DavaDesk Agentic plan; follow-up scheduled for Friday)..."
            rows={3}
            className="w-full p-3 text-xs sm:text-sm bg-white border border-slate-300 rounded-xl focus:border-brand-500 focus:outline-none transition-all resize-none shadow-2xs"
            required
          />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                Outcome
              </label>
              <select
                value={outcome}
                onChange={(e) => setOutcome(e.target.value)}
                className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none"
              >
                <option value="Spoke on phone - Interested">Phone: Interested</option>
                <option value="Left WhatsApp message">WhatsApp Sent</option>
                <option value="Demo Scheduled">Demo Scheduled</option>
                <option value="Pricing negotiation">Pricing Negotiation</option>
                <option value="Follow-up requested">Callback Requested</option>
                <option value="Not interested right now">Not Interested</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                Logged By
              </label>
              <input
                type="text"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="Your name"
                className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                Follow Up Date
              </label>
              <input
                type="date"
                value={followUpDate}
                onChange={(e) => setFollowUpDate(e.target.value)}
                className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isSubmitting || !noteText.trim()}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded-xl shadow-xs transition-colors"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Save Note & Log</span>
            </button>
          </div>
        </form>

        {/* Existing Notes Timeline */}
        <div className="space-y-3 pt-2 border-t border-slate-100">
          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            Interaction History ({lead.notes?.length || 0})
          </h4>

          {lead.notes && lead.notes.length > 0 ? (
            <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
              {lead.notes
                .slice()
                .reverse()
                .map((n, idx) => (
                  <div
                    key={n.id || idx}
                    className="p-3 bg-white rounded-xl border border-slate-200/90 shadow-2xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-bold text-slate-800">{n.author || "DavaDesk Team"}</span>
                      <span className="text-slate-400">
                        {n.created_at ? new Date(n.created_at).toLocaleString() : "Recently"}
                      </span>
                    </div>

                    {n.outcome && (
                      <span className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded bg-brand-50 text-brand-700 border border-brand-200">
                        {n.outcome}
                      </span>
                    )}

                    <p className="text-xs text-slate-700 leading-relaxed">{n.text}</p>

                    {n.follow_up_date && (
                      <div className="text-[10px] text-amber-700 flex items-center gap-1 font-medium mt-1">
                        <Calendar className="w-3 h-3" />
                        Next Follow-up: {n.follow_up_date}
                      </div>
                    )}
                  </div>
                ))}
            </div>
          ) : (
            <div className="p-4 text-center rounded-xl bg-slate-50 border border-dashed border-slate-200 text-xs text-slate-400">
              No notes recorded yet. Type a note above to record the first contact.
            </div>
          )}
        </div>
      </div>
    </BottomDrawer>
  );
}
