import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  FileText,
  Gift,
  Loader2,
  Mail,
  MessageCircle,
  Phone,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  StickyNote,
  UserCheck,
} from "lucide-react";
import { toast } from "sonner";
import { AdminAPI, apiError } from "../api";
import BottomDrawer from "../components/BottomDrawer";
import LeadNotesModal from "../components/LeadNotesModal";

const STAGES = {
  NOT_SENT: { label: "Code not sent", cls: "bg-slate-100 text-slate-700 border-slate-200" },
  CODE_READY: { label: "Code ready, not sent", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  CODE_SENT: { label: "Code emailed", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  REGISTERED: { label: "Registered, code not applied", cls: "bg-violet-50 text-violet-700 border-violet-200" },
  ACTIVATED: { label: "Activated", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
};
const STAGE_TABS = [
  ["ALL", "All"],
  ["NOT_SENT", "Code not sent"],
  ["CODE_SENT", "Code emailed"],
  ["REGISTERED", "Registered"],
  ["ACTIVATED", "Activated"],
];
const CRM = { NEW: "New", CONNECTED: "Connected", FOLLOW_UP: "Follow up", WON: "Won", LOST: "Lost" };
const inputCls = "h-9 px-3 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30";
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—");
const fmtDateTime = (d) => (d ? new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const StagePill = ({ stage }) => (
  <span className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-bold ${(STAGES[stage] || STAGES.NOT_SENT).cls}`}>{(STAGES[stage] || STAGES.NOT_SENT).label}</span>
);

// Same layout the recipient gets (services/email.js buildTextEmail)
function EmailPreview({ text, code }) {
  const html = String(text || "")
    .split(/\n{2,}/)
    .map((p) => {
      const safe = esc(p);
      if (code && safe.includes(code)) {
        const rest = safe.replace(code, "").replace(/\n/g, "<br/>").trim();
        return `${rest ? `<p style="margin:0 0 6px">${rest}</p>` : ""}<div style="margin:4px 0 14px;padding:12px;border:2px dashed #ea580c;border-radius:10px;text-align:center;font:800 20px Menlo,monospace;letter-spacing:3px;background:#fff7ed">${code}</div>`;
      }
      return `<p style="margin:0 0 10px">${safe.replace(/\n/g, "<br/>")}</p>`;
    })
    .join("");
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200">
      <div className="bg-gradient-to-r from-orange-500 to-amber-500 px-4 py-2 text-sm font-black text-white">DavaDesk</div>
      <div className="max-h-[320px] overflow-y-auto bg-white p-4 text-[13px] leading-relaxed text-slate-800" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}

function EmailDraftDrawer({ lead, env, onClose, onChanged }) {
  const [plan, setPlan] = useState("AGENTIC");
  const [validDays, setValidDays] = useState(30);
  const [data, setData] = useState(null); // response of POST /code
  const [subject, setSubject] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(null); // "code" | "test" | "send" | "regen"
  const [confirmSend, setConfirmSend] = useState(false);
  const [confirmRegen, setConfirmRegen] = useState(false);
  const [tab, setTab] = useState("edit");

  const makeCode = useCallback(
    async (regenerate = false) => {
      setBusy(regenerate ? "regen" : "code");
      try {
        const res = await AdminAPI.offerLeadCode(lead.lead_id, { plan, valid_days: Number(validDays) || 30, regenerate });
        setData(res.data);
        setSubject(res.data.draft.subject);
        setText(res.data.draft.text);
        if (regenerate) toast.success(`New code ${res.data.code}; the old one is cancelled`);
        onChanged?.();
      } catch (err) {
        toast.error(apiError(err, "Couldn't prepare the code"));
      } finally {
        setBusy(null);
        setConfirmRegen(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lead.lead_id, plan, validDays]
  );

  // An existing unused code is reused, so opening this never makes duplicates
  useEffect(() => {
    if (lead.code && !lead.code.used && lead.code.is_active && !lead.code.expired) makeCode(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.lead_id]);

  const missingCode = data && !text.includes(data.code);
  const send = async (test) => {
    setBusy(test ? "test" : "send");
    try {
      const res = await AdminAPI.offerLeadSend(lead.lead_id, { subject, text, test });
      toast.success(res.data.message);
      if (!test) {
        onChanged?.();
        onClose();
      }
    } catch (err) {
      toast.error(apiError(err, "Couldn't send the email"));
    } finally {
      setBusy(null);
      setConfirmSend(false);
    }
  };

  return (
    <BottomDrawer isOpen onClose={onClose} title={`50-day access code · ${lead.name}`} subtitle={`${lead.pharmacy_name} · ${lead.email || "no email"}`} maxWidth="max-w-3xl">
      <div className="space-y-4 p-5">
        <div className={`flex items-start gap-2 rounded-xl border p-3 text-xs ${env === "prod" ? "border-rose-200 bg-rose-50 text-rose-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {env === "prod"
              ? "PRODUCTION: the code works on the live app and the email goes to this customer."
              : "DEV database: the code only works on the dev app (store-dev). The email still goes to the real person, so use “Send test to me” while trying it out."}
          </span>
        </div>

        {!lead.email && <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">This registration has no email address. Generate the code and share it by phone or WhatsApp instead.</p>}

        {!data ? (
          <div className="space-y-3 rounded-xl border border-slate-200 p-4">
            <p className="text-sm font-bold text-slate-900">Generate a personal, single-use code</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="text-xs font-bold text-slate-500">
                Plan for 50 days
                <select value={plan} onChange={(e) => setPlan(e.target.value)} className={`${inputCls} mt-1 w-full`}>
                  <option value="AGENTIC">AGENTIC (full)</option>
                  <option value="ADVANCED">ADVANCED</option>
                  <option value="BASIC">BASIC</option>
                </select>
              </label>
              <label className="text-xs font-bold text-slate-500">
                Must be applied within (days)
                <input type="number" min="1" max="365" value={validDays} onChange={(e) => setValidDays(e.target.value)} className={`${inputCls} mt-1 w-full`} />
              </label>
              <div className="flex items-end">
                <button type="button" onClick={() => makeCode(false)} disabled={!!busy || lead.code?.used} className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-xl bg-orange-600 px-4 text-sm font-bold text-white hover:bg-orange-700 disabled:opacity-50">
                  {busy === "code" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gift className="h-4 w-4" />} Generate code & draft
                </button>
              </div>
            </div>
            <p className="text-[11px] text-slate-500">One code per person: usable once, grants 50 days of the plan when they apply it after signing up.</p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-orange-200 bg-orange-50 p-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-orange-700">Code {data.reused ? "(already generated)" : "(new)"}</p>
                <p className="font-mono text-xl font-black tracking-widest text-slate-900">{data.code}</p>
                <p className="text-[11px] text-slate-600">
                  {data.duration_days} days · {data.plan} · apply by {fmtDate(data.valid_until)}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => navigator.clipboard?.writeText(data.code).then(() => toast.success("Code copied"))}
                  className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700"
                >
                  <Copy className="h-3.5 w-3.5" /> Copy
                </button>
                {confirmRegen ? (
                  <span className="flex items-center gap-1">
                    <button type="button" onClick={() => makeCode(true)} disabled={!!busy} className="h-8 rounded-lg bg-rose-600 px-3 text-xs font-bold text-white">
                      {busy === "regen" ? "…" : "Cancel old & make new"}
                    </button>
                    <button type="button" onClick={() => setConfirmRegen(false)} className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold text-slate-600">
                      Keep
                    </button>
                  </span>
                ) : (
                  <button type="button" onClick={() => setConfirmRegen(true)} className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700">
                    <RefreshCw className="h-3.5 w-3.5" /> New code
                  </button>
                )}
              </div>
            </div>

            <div className="flex gap-1 border-b border-slate-200">
              {[
                ["edit", "Edit draft"],
                ["preview", "Preview"],
              ].map(([id, label]) => (
                <button key={id} type="button" onClick={() => setTab(id)} className={`border-b-2 px-3 py-2 text-xs font-bold ${tab === id ? "border-orange-500 text-orange-700" : "border-transparent text-slate-500"}`}>
                  {label}
                </button>
              ))}
            </div>
            {tab === "edit" ? (
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-500">
                  To
                  <input value={data.to.email || ""} readOnly className={`${inputCls} mt-1 w-full bg-slate-50`} />
                </label>
                <label className="block text-xs font-bold text-slate-500">
                  Subject
                  <input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} className={`${inputCls} mt-1 w-full`} />
                </label>
                <label className="block text-xs font-bold text-slate-500">
                  Message
                  <textarea value={text} onChange={(e) => setText(e.target.value)} rows={14} maxLength={8000} className="mt-1 w-full rounded-xl border border-slate-200 p-3 font-sans text-[13px] leading-relaxed focus:outline-none focus:ring-2 focus:ring-orange-500/30" />
                </label>
                {missingCode && (
                  <p className="flex items-center gap-1 text-xs font-semibold text-rose-600">
                    <AlertTriangle className="h-3.5 w-3.5" /> The message must contain the code {data.code}.
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-1">
                <p className="text-xs text-slate-500">
                  <strong>Subject:</strong> {subject}
                </p>
                <EmailPreview text={text} code={data.code} />
              </div>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-3">
              <button type="button" onClick={() => send(true)} disabled={!!busy || missingCode} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                {busy === "test" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />} Send test to me
              </button>
              {confirmSend ? (
                <span className="flex flex-wrap items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5">
                  <span className="text-xs font-semibold text-rose-800">Send to {lead.email}?</span>
                  <button type="button" onClick={() => send(false)} disabled={!!busy} className="h-8 rounded-lg bg-orange-600 px-3 text-xs font-bold text-white">
                    {busy === "send" ? "Sending…" : "Yes, send"}
                  </button>
                  <button type="button" onClick={() => setConfirmSend(false)} className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold text-slate-600">
                    Back
                  </button>
                </span>
              ) : (
                <button type="button" onClick={() => setConfirmSend(true)} disabled={!!busy || missingCode || !lead.email} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-orange-600 px-4 text-sm font-bold text-white hover:bg-orange-700 disabled:opacity-50">
                  <Send className="h-4 w-4" /> Send to {lead.name.split(" ")[0]}
                </button>
              )}
            </div>
            {lead.emails?.length > 0 && (
              <div className="rounded-xl border border-slate-200 p-3">
                <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">Emails so far</p>
                <ul className="space-y-1 text-xs text-slate-600">
                  {lead.emails
                    .slice()
                    .reverse()
                    .map((e) => (
                      <li key={e.id}>
                        {fmtDateTime(e.at)} · {e.test ? "Test to " : "To "}
                        {e.to} · <span className="font-mono">{e.code}</span>
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </BottomDrawer>
  );
}

export default function OfferLeadsPage({ activeEnv, onOpenUser, onSummary }) {
  const [data, setData] = useState({ leads: [], summary: {}, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stage, setStage] = useState("ALL");
  const [crm, setCrm] = useState("ALL");
  const [search, setSearch] = useState("");
  const [notesFor, setNotesFor] = useState(null);
  const [draftFor, setDraftFor] = useState(null);

  const load = useCallback(
    async (fresh = false) => {
      setLoading(true);
      try {
        const res = await AdminAPI.getOfferLeads({ limit: 500, ...(fresh ? { fresh: 1 } : {}) });
        setData(res.data);
        setError(null);
        onSummary?.(res.data.summary);
      } catch (err) {
        setError(apiError(err, "Couldn't load the 50-50 registrations"));
      } finally {
        setLoading(false);
      }
    },
    [onSummary]
  );

  useEffect(() => {
    load();
  }, [load, activeEnv]);

  // Keep the open notes / draft in sync with fresh data
  useEffect(() => {
    if (notesFor) setNotesFor(data.leads.find((l) => l.lead_id === notesFor.lead_id) || notesFor);
    if (draftFor) setDraftFor(data.leads.find((l) => l.lead_id === draftFor.lead_id) || draftFor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const rows = useMemo(() => {
    const t = search.trim().toLowerCase();
    return data.leads.filter((l) => {
      if (stage !== "ALL" && (stage === "NOT_SENT" ? !["NOT_SENT", "CODE_READY"].includes(l.stage) : l.stage !== stage)) return false;
      if (crm !== "ALL" && l.crm_status !== crm) return false;
      if (t && !`${l.name} ${l.email} ${l.mobile} ${l.pharmacy_name} ${l.location} ${l.registration_id} ${l.code?.code || ""}`.toLowerCase().includes(t)) return false;
      return true;
    });
  }, [data.leads, stage, crm, search]);

  const s = data.summary || {};
  const cards = [
    ["Registrations", s.total, Gift, "text-orange-600 bg-orange-50"],
    ["Code not sent", s.not_sent, Clock, "text-slate-600 bg-slate-100"],
    ["Code emailed", s.code_sent, Mail, "text-blue-600 bg-blue-50"],
    ["Registered", s.registered, UserCheck, "text-violet-600 bg-violet-50"],
    ["Activated", s.activated, CheckCircle2, "text-emerald-600 bg-emerald-50"],
    ["Not contacted yet", s.uncontacted, Phone, "text-rose-600 bg-rose-50"],
  ];
  const tabCount = (id) => (id === "ALL" ? s.total : id === "NOT_SENT" ? s.not_sent : id === "CODE_SENT" ? s.code_sent : id === "REGISTERED" ? s.registered : s.activated);

  const crmAction = async (fn, ok) => {
    try {
      await fn();
      if (ok) toast.success(ok);
      await load();
    } catch (err) {
      toast.error(apiError(err, "Couldn't update the lead"));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-black text-slate-900">
            <Gift className="h-5 w-5 text-orange-500" /> 50-50 Launch Offer
          </h1>
          <p className="text-xs text-slate-500">
            Website registrations for early access · follow up, then email each one a personal {data.offer_days || 50}-day code ({(activeEnv || "dev").toUpperCase()} · {data.app_url || "—"})
          </p>
        </div>
        <button type="button" onClick={() => load(true)} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 hover:bg-slate-50">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {cards.map(([label, value, Icon, tone]) => (
          <div key={label} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3">
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tone}`}>
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
              <p className="text-xl font-black text-slate-900">{value ?? "—"}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {STAGE_TABS.map(([id, label]) => (
          <button key={id} type="button" onClick={() => setStage(id)} className={`rounded-full border px-3 py-1 text-xs font-bold ${stage === id ? "border-orange-500 bg-orange-50 text-orange-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}>
            {label} {tabCount(id) ?? ""}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, pharmacy, city, phone, email, KM- id, code…" className={`${inputCls} w-full pl-9`} />
        </div>
        <select aria-label="Follow-up status" value={crm} onChange={(e) => setCrm(e.target.value)} className={inputCls}>
          <option value="ALL">Any follow-up status</option>
          {Object.entries(CRM).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {loading && !data.leads.length ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading registrations…
          </div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-500">No registrations match.</div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((l) => {
              const phone = (l.mobile || "").replace(/\D/g, "");
              const wa = phone ? `https://wa.me/${phone.length === 10 ? `91${phone}` : phone}` : null;
              return (
                <li key={l.lead_id} className="grid grid-cols-1 gap-3 p-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-bold text-slate-900">{l.name}</p>
                      <StagePill stage={l.stage} />
                      {!l.is_connected && <span className="rounded-full bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-600">Not contacted</span>}
                    </div>
                    <p className="truncate text-xs text-slate-600">
                      {l.pharmacy_name}
                      {l.location ? ` · ${l.location}` : ""}
                    </p>
                    <p className="truncate text-xs text-slate-400">
                      <span className="font-mono">{l.registration_id}</span> · registered {fmtDate(l.created_at)}
                      {l.current_software ? ` · uses ${l.current_software}` : ""}
                    </p>
                  </div>
                  <div className="min-w-0 text-xs text-slate-600">
                    <p className="truncate">{l.mobile || "No phone"}</p>
                    <p className="truncate">{l.email || "No email"}</p>
                    <p className="text-slate-400">
                      Follow-up: <strong className="text-slate-600">{CRM[l.crm_status] || l.crm_status}</strong>
                      {l.notes?.length ? ` · ${l.notes.length} note${l.notes.length === 1 ? "" : "s"}` : ""}
                    </p>
                  </div>
                  <div className="min-w-0 text-xs text-slate-600">
                    {l.account ? (
                      <button type="button" onClick={() => onOpenUser?.(l.account.user_id)} className="text-left hover:underline">
                        <p className="font-semibold text-slate-800">
                          {l.account.plan ? `${l.account.plan} · ${l.account.plan_status}` : "No plan yet"}
                          {l.account.days_left != null && l.account.plan_status !== "EXPIRED" ? ` · ${l.account.days_left}d left` : ""}
                        </p>
                        <p className="text-slate-400">Last login {fmtDateTime(l.account.last_login_at)}</p>
                      </button>
                    ) : l.code ? (
                      <>
                        <p className="font-mono font-bold text-slate-800">{l.code.code}</p>
                        <p className="text-slate-400">{l.last_email_at ? `Emailed ${fmtDateTime(l.last_email_at)}` : "Not emailed yet"}{l.code.expired ? " · expired" : ""}</p>
                      </>
                    ) : (
                      <p className="text-slate-400">No code yet</p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 lg:justify-end">
                    {phone && (
                      <a href={`tel:${l.mobile}`} title="Call" className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">
                        <Phone className="h-4 w-4" />
                      </a>
                    )}
                    {wa && (
                      <a href={wa} target="_blank" rel="noreferrer" title="WhatsApp" className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-emerald-600 hover:bg-emerald-50">
                        <MessageCircle className="h-4 w-4" />
                      </a>
                    )}
                    {l.license_photo && (
                      <a href={l.license_photo} target="_blank" rel="noreferrer" title="Drug licence" className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">
                        <FileText className="h-4 w-4" />
                      </a>
                    )}
                    <button type="button" onClick={() => setNotesFor(l)} title="Follow-up notes" className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50">
                      <StickyNote className="h-3.5 w-3.5" /> Notes
                    </button>
                    {l.stage !== "ACTIVATED" && (
                      <button type="button" onClick={() => setDraftFor(l)} className="inline-flex h-8 items-center gap-1 rounded-lg bg-orange-600 px-2.5 text-xs font-bold text-white hover:bg-orange-700">
                        <Mail className="h-3.5 w-3.5" /> {l.code ? "Email code" : "Draft email"}
                      </button>
                    )}
                    {l.account && (
                      <button type="button" onClick={() => onOpenUser?.(l.account.user_id)} title="Open user" className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">
                        <ExternalLink className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  {(l.problems || l.website_notes) && (
                    <p className="text-[11px] text-slate-500 lg:col-span-4">
                      {l.problems ? `Problems: ${l.problems}` : ""}
                      {l.problems && l.website_notes ? " · " : ""}
                      {l.website_notes ? `Website note: ${l.website_notes}` : ""}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <LeadNotesModal
        isOpen={!!notesFor}
        onClose={() => setNotesFor(null)}
        lead={notesFor ? { ...notesFor, lead_category: "50-50 LAUNCH OFFER" } : null}
        onMarkConnected={(id) => crmAction(() => AdminAPI.markConnected(id), "Marked as connected")}
        onAddNote={(id, note) => crmAction(() => AdminAPI.addLeadNote(id, note), "Note saved")}
        onStatusChange={(id, status) => crmAction(() => AdminAPI.updateLeadStatus(id, { status }), "Follow-up status updated")}
      />
      {draftFor && <EmailDraftDrawer key={draftFor.lead_id} lead={draftFor} env={activeEnv} onClose={() => setDraftFor(null)} onChanged={() => load()} />}
    </div>
  );
}
