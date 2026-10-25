import React, { useCallback, useEffect, useRef, useState } from "react";
import { Bug, CircleHelp, CreditCard, Lightbulb, LifeBuoy, Loader2, Lock, MessageSquare, RefreshCw, Search, Send, Store } from "lucide-react";
import { toast } from "sonner";
import { AdminAPI, apiError } from "../api";
import BottomDrawer from "../components/BottomDrawer";

const STATUS = {
  open: { label: "Open", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  in_progress: { label: "In progress", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  waiting_on_user: { label: "Replied", cls: "bg-violet-50 text-violet-700 border-violet-200" },
  resolved: { label: "Resolved", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  closed: { label: "Closed", cls: "bg-slate-100 text-slate-600 border-slate-200" },
};
const CATEGORY = {
  bug: { label: "Bug", icon: Bug, cls: "text-rose-600 bg-rose-50" },
  question: { label: "Question", icon: CircleHelp, cls: "text-sky-600 bg-sky-50" },
  feature: { label: "Idea", icon: Lightbulb, cls: "text-violet-600 bg-violet-50" },
  billing: { label: "Plan & payments", icon: CreditCard, cls: "text-amber-600 bg-amber-50" },
  other: { label: "Other", icon: MessageSquare, cls: "text-slate-600 bg-slate-100" },
};
const PRIORITY = {
  low: "text-slate-500",
  normal: "text-slate-700",
  high: "text-orange-600 font-bold",
  urgent: "text-rose-600 font-black",
};
const STATUS_TABS = [
  ["active", "Active"],
  ["open", "Open"],
  ["in_progress", "In progress"],
  ["waiting_on_user", "Replied"],
  ["resolved", "Resolved"],
  ["closed", "Closed"],
  ["all", "All"],
];
const inputCls = "h-9 px-3 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30";
const ago = (iso) => {
  if (!iso) return "";
  const m = Math.round((Date.now() - new Date(iso)) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  if (m < 1440) return `${Math.round(m / 60)}h`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
};

const StatusPill = ({ status }) => (
  <span className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-bold ${(STATUS[status] || STATUS.open).cls}`}>{(STATUS[status] || STATUS.open).label}</span>
);

function Thread({ data, onChanged }) {
  const { ticket, pharmacy } = data;
  const [text, setText] = useState("");
  const [internal, setInternal] = useState(false);
  const [after, setAfter] = useState("waiting_on_user");
  const [busy, setBusy] = useState(false);
  const end = useRef(null);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [ticket.messages?.length]);

  const send = async (e) => {
    e?.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    try {
      const res = await AdminAPI.replySupport(ticket.id, { text, internal, status: after === "keep" ? undefined : after });
      setText("");
      toast.success(internal ? "Internal note added" : "Reply sent to the pharmacy");
      onChanged(res.data.ticket);
    } catch (err) {
      toast.error(apiError(err, "Couldn't send"));
    } finally {
      setBusy(false);
    }
  };

  const patch = async (body) => {
    try {
      const res = await AdminAPI.updateSupport(ticket.id, body);
      onChanged(res.data.ticket);
    } catch (err) {
      toast.error(apiError(err, "Couldn't update"));
    }
  };

  const cat = CATEGORY[ticket.category] || CATEGORY.other;
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs font-bold text-slate-500">{ticket.ticket_no}</span>
          <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${cat.cls}`}>
            <cat.icon className="h-3 w-3" /> {cat.label}
          </span>
          <StatusPill status={ticket.status} />
        </div>
        <h3 className="text-base font-black text-slate-900">{ticket.subject}</h3>
        <div className="grid grid-cols-1 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs sm:grid-cols-2">
          <div className="flex items-start gap-2">
            <Store className="mt-0.5 h-3.5 w-3.5 text-slate-400" />
            <div>
              <p className="font-bold text-slate-800">{pharmacy?.name || ticket.pharmacy_name || "Unknown pharmacy"}</p>
              <p className="text-slate-500">{[pharmacy?.location, pharmacy?.contact, pharmacy?.subscription?.plan].filter(Boolean).join(" · ") || "—"}</p>
            </div>
          </div>
          <div className="text-slate-500">
            <p>
              <span className="font-bold text-slate-700">{ticket.created_by?.name || "User"}</span> {ticket.created_by?.role ? `(${ticket.created_by.role})` : ""}
            </p>
            <p className="truncate">{[ticket.created_by?.email, ticket.created_by?.mobile].filter(Boolean).join(" · ")}</p>
            {ticket.page && <p>From page: {ticket.page}</p>}
            {ticket.meta?.viewport && <p title={ticket.meta.user_agent}>Screen {ticket.meta.viewport}</p>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <select aria-label="Status" value={ticket.status} onChange={(e) => patch({ status: e.target.value })} className={inputCls}>
            {Object.entries(STATUS).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
          <select aria-label="Priority" value={ticket.priority || "normal"} onChange={(e) => patch({ priority: e.target.value })} className={inputCls}>
            {Object.keys(PRIORITY).map((p) => (
              <option key={p} value={p}>Priority: {p}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="min-h-[180px] flex-1 space-y-2 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/60 p-3">
        {(ticket.messages || []).map((m) => {
          const team = m.author === "admin";
          return (
            <div key={m.id} className={`flex ${team ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                  m.internal ? "border border-dashed border-amber-300 bg-amber-50 text-amber-900" : team ? "rounded-br-md bg-orange-600 text-white" : "rounded-bl-md border border-slate-200 bg-white text-slate-800"
                }`}
              >
                <p className={`mb-0.5 text-[10px] font-bold uppercase tracking-wide ${team && !m.internal ? "text-white/80" : "text-slate-500"}`}>
                  {m.internal ? "Internal note · " : ""}
                  {m.author_name || (team ? "Support" : "User")}
                </p>
                <p className="whitespace-pre-wrap break-words">{m.text}</p>
                <p className={`mt-1 text-[10px] ${team && !m.internal ? "text-white/70" : "text-slate-400"}`}>{new Date(m.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</p>
              </div>
            </div>
          );
        })}
        <div ref={end} />
      </div>

      <form onSubmit={send} className="space-y-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          maxLength={4000}
          placeholder={internal ? "Internal note (only the team sees this)…" : "Reply to the pharmacy…"}
          className={`w-full rounded-xl border p-3 text-sm focus:outline-none focus:ring-2 ${internal ? "border-amber-300 bg-amber-50/50 focus:ring-amber-400/30" : "border-slate-200 focus:ring-orange-500/30"}`}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send(e);
          }}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-slate-600">
              <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} className="accent-amber-500" />
              <Lock className="h-3 w-3" /> Internal note
            </label>
            {!internal && (
              <select aria-label="Status after sending" value={after} onChange={(e) => setAfter(e.target.value)} className={`${inputCls} h-8 text-xs`}>
                <option value="waiting_on_user">Then: Replied (waiting on user)</option>
                <option value="in_progress">Then: In progress</option>
                <option value="resolved">Then: Resolved</option>
                <option value="keep">Then: keep status</option>
              </select>
            )}
          </div>
          <button type="submit" disabled={busy || !text.trim()} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-orange-600 px-4 text-sm font-bold text-white hover:bg-orange-700 disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {internal ? "Add note" : "Send reply"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function SupportPage({ activeEnv, onUnreadChange }) {
  const [status, setStatus] = useState("active");
  const [category, setCategory] = useState("");
  const [priority, setPriority] = useState("");
  const [search, setSearch] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [list, setList] = useState({ tickets: [], counts: {}, pages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(null); // { ticket, pharmacy }
  const [isWide, setIsWide] = useState(() => typeof window !== "undefined" && window.innerWidth >= 1024);

  useEffect(() => {
    const onResize = () => setIsWide(window.innerWidth >= 1024);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await AdminAPI.getSupportTickets({
        status: status === "all" ? undefined : status,
        category: category || undefined,
        priority: priority || undefined,
        search: search.trim() || undefined,
        unread: unreadOnly ? 1 : undefined,
        page,
        limit: 25,
      });
      setList(res.data);
      onUnreadChange?.(res.data.counts?.unread || 0);
    } catch (err) {
      toast.error(apiError(err, "Couldn't load support queries"));
    } finally {
      setLoading(false);
    }
  }, [status, category, priority, search, unreadOnly, page, onUnreadChange]);

  useEffect(() => {
    const t = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, search, activeEnv]);

  const openTicket = async (id) => {
    try {
      const res = await AdminAPI.getSupportTicket(id);
      setOpen(res.data);
      const wasUnread = list.tickets.some((t) => t.id === id && t.admin_unread);
      setList((l) => ({
        ...l,
        counts: wasUnread ? { ...l.counts, unread: Math.max(0, (l.counts?.unread || 0) - 1) } : l.counts,
        tickets: l.tickets.map((t) => (t.id === id ? { ...t, admin_unread: false } : t)),
      }));
      if (wasUnread) onUnreadChange?.(Math.max(0, (list.counts?.unread || 0) - 1));
    } catch (err) {
      toast.error(apiError(err, "Couldn't open this query"));
    }
  };

  const changed = (ticket) => {
    setOpen((o) => (o ? { ...o, ticket } : o));
    load();
  };

  const counts = list.counts || {};
  const tabCount = (id) => (id === "active" ? (counts.open || 0) + (counts.in_progress || 0) + (counts.waiting_on_user || 0) : id === "all" ? null : counts[id] || 0);

  const listView = (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5 overflow-x-auto">
        {STATUS_TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setStatus(id);
              setPage(1);
            }}
            className={`whitespace-nowrap rounded-full border px-3 py-1 text-xs font-bold ${status === id ? "border-orange-500 bg-orange-50 text-orange-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}
          >
            {label}
            {tabCount(id) !== null ? ` ${tabCount(id)}` : ""}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search ticket, pharmacy, user, text…"
            className={`${inputCls} w-full pl-9`}
          />
        </div>
        <select aria-label="Category" value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }} className={inputCls}>
          <option value="">All types</option>
          {Object.entries(CATEGORY).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <select aria-label="Priority" value={priority} onChange={(e) => { setPriority(e.target.value); setPage(1); }} className={inputCls}>
          <option value="">Any priority</option>
          {Object.keys(PRIORITY).map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <label className="flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600">
          <input type="checkbox" checked={unreadOnly} onChange={(e) => { setUnreadOnly(e.target.checked); setPage(1); }} className="accent-orange-500" />
          Unread {counts.unread ? `(${counts.unread})` : ""}
        </label>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : list.tickets.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-500">
            <LifeBuoy className="mx-auto mb-2 h-8 w-8 text-slate-300" />
            No queries match.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {list.tickets.map((t) => {
              const cat = CATEGORY[t.category] || CATEGORY.other;
              const last = (t.messages || [])[0];
              const active = open?.ticket?.id === t.id;
              return (
                <li key={t.id}>
                  <button type="button" onClick={() => openTicket(t.id)} className={`flex w-full items-start gap-3 p-3 text-left hover:bg-slate-50 ${active ? "bg-orange-50/70" : ""}`}>
                    <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${cat.cls}`}>
                      <cat.icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        {t.admin_unread && <span className="h-2 w-2 shrink-0 rounded-full bg-orange-500" aria-label="Unread" />}
                        <span className={`truncate text-sm ${t.admin_unread ? "font-black text-slate-900" : "font-semibold text-slate-800"}`}>{t.subject}</span>
                      </span>
                      <span className="block truncate text-xs text-slate-500">
                        {t.pharmacy_name || "—"} · {t.created_by?.name || "User"}
                      </span>
                      {last && <span className="block truncate text-xs text-slate-400">{last.author === "admin" ? "You: " : ""}{last.text}</span>}
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <StatusPill status={t.status} />
                      <span className={`text-[10px] ${PRIORITY[t.priority] || ""}`}>{t.priority}</span>
                      <span className="text-[10px] text-slate-400">{ago(t.updated_at)}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {list.pages > 1 && (
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>
            {list.total} queries · page {list.page} of {list.pages}
          </span>
          <div className="flex gap-1">
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="h-8 rounded-lg border border-slate-200 bg-white px-3 font-bold disabled:opacity-40">
              Previous
            </button>
            <button type="button" disabled={page >= list.pages} onClick={() => setPage((p) => p + 1)} className="h-8 rounded-lg border border-slate-200 bg-white px-3 font-bold disabled:opacity-40">
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-black text-slate-900">
            <LifeBuoy className="h-5 w-5 text-orange-500" /> Support queries
          </h1>
          <p className="text-xs text-slate-500">Bug reports and questions from every pharmacy ({(activeEnv || "dev").toUpperCase()} database)</p>
        </div>
        <button type="button" onClick={load} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 hover:bg-slate-50">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {isWide ? (
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-4">
          {listView}
          <div className="sticky top-4 h-[calc(100vh-7rem)] rounded-2xl border border-slate-200 bg-white p-4">
            {open ? <Thread key={open.ticket.id} data={open} onChanged={changed} /> : <div className="flex h-full items-center justify-center text-sm text-slate-400">Pick a query to read and reply.</div>}
          </div>
        </div>
      ) : (
        <>
          {listView}
          <BottomDrawer isOpen={!!open} onClose={() => setOpen(null)} title={open?.ticket?.ticket_no || "Query"} subtitle={open?.ticket?.pharmacy_name}>
            {open && <Thread key={open.ticket.id} data={open} onChanged={changed} />}
          </BottomDrawer>
        </>
      )}
    </div>
  );
}
