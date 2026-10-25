import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { useLocation, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Bug, CheckCircle2, CircleHelp, CreditCard, LifeBuoy, Lightbulb, Loader2, MessageSquare, Plus, RefreshCw, Send } from "lucide-react";
import { API } from "../App";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import Loader from "../components/Loader";

export const SUPPORT_CATEGORIES = {
  bug: { label: "Something's broken", short: "Bug", icon: Bug, tone: "text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-500/30" },
  question: { label: "How do I…?", short: "Question", icon: CircleHelp, tone: "text-sky-600 dark:text-sky-400 bg-sky-500/10 border-sky-500/30" },
  feature: { label: "Idea / request", short: "Idea", icon: Lightbulb, tone: "text-violet-600 dark:text-violet-400 bg-violet-500/10 border-violet-500/30" },
  billing: { label: "Plan & payments", short: "Plan", icon: CreditCard, tone: "text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/30" },
  other: { label: "Something else", short: "Other", icon: MessageSquare, tone: "text-muted-foreground bg-muted border-border" },
};

export const SUPPORT_STATUS = {
  open: { label: "Open", tone: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30" },
  in_progress: { label: "Being worked on", tone: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30" },
  waiting_on_user: { label: "Replied", tone: "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/30" },
  resolved: { label: "Resolved", tone: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30" },
  closed: { label: "Closed", tone: "bg-muted text-muted-foreground border-border" },
};

const when = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  if (mins < 24 * 60) return `${Math.round(mins / 60)} h ago`;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
};
const err = (e, f) => e?.response?.data?.detail || f;

const StatusBadge = ({ status }) => {
  const s = SUPPORT_STATUS[status] || SUPPORT_STATUS.open;
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-black ${s.tone}`}>{s.label}</span>;
};

export default function SupportPage() {
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState("open");
  const [data, setData] = useState({ tickets: [], counts: {}, pages: 1 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const [newOpen, setNewOpen] = useState(false);
  const [form, setForm] = useState({ category: "bug", subject: "", description: "" });
  const [creating, setCreating] = useState(false);

  const [ticket, setTicket] = useState(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const threadEnd = useRef(null);
  const fromPage = location.state?.from || "";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/support`, { params: { status: tab, page } });
      setData(res.data);
    } catch (e) {
      toast.error(err(e, "Couldn't load your queries"));
    } finally {
      setLoading(false);
    }
  }, [tab, page]);

  useEffect(() => {
    load();
  }, [load]);

  const openTicket = useCallback(
    async (id) => {
      try {
        const res = await axios.get(`${API}/support/${id}`);
        setTicket(res.data);
        setReply("");
        setData((d) => ({ ...d, tickets: d.tickets.map((t) => (t.id === id ? { ...t, user_unread: false } : t)) }));
        window.dispatchEvent(new Event("support-read"));
      } catch (e) {
        toast.error(err(e, "Couldn't open this query"));
        params.delete("ticket");
        setParams(params, { replace: true });
      }
    },
    [params, setParams]
  );

  // Deep link from a notification: /support?ticket=<id>; ?new=1 opens the form
  useEffect(() => {
    const id = params.get("ticket");
    if (id && id !== ticket?.id) openTicket(id);
    if (params.get("new") === "1") setNewOpen(true);
    // eslint-disable-next-line
  }, [params]);

  useEffect(() => {
    threadEnd.current?.scrollIntoView({ block: "end" });
  }, [ticket?.messages?.length]);

  const closeTicket = () => {
    setTicket(null);
    if (params.get("ticket")) {
      params.delete("ticket");
      setParams(params, { replace: true });
    }
  };

  const subjectOk = form.subject.trim().length >= 5;
  const descOk = form.description.trim().length >= 10;

  const create = async (e) => {
    e?.preventDefault();
    if (!subjectOk || !descOk) return toast.error(!subjectOk ? "Add a short title (at least 5 characters)" : "Describe it in a little more detail");
    setCreating(true);
    try {
      const res = await axios.post(`${API}/support`, {
        ...form,
        page: fromPage,
        meta: { user_agent: navigator.userAgent, viewport: `${window.innerWidth}x${window.innerHeight}`, app_version: process.env.REACT_APP_VERSION || "" },
      });
      toast.success(`Sent as ${res.data.ticket_no}. We'll reply here.`);
      setNewOpen(false);
      setForm({ category: "bug", subject: "", description: "" });
      if (params.get("new")) {
        params.delete("new");
        setParams(params, { replace: true });
      }
      setTab("open");
      setPage(1);
      load();
    } catch (e) {
      toast.error(err(e, "Couldn't send your report"));
    } finally {
      setCreating(false);
    }
  };

  const sendReply = async (e) => {
    e?.preventDefault();
    if (!reply.trim() || !ticket) return;
    setSending(true);
    try {
      const res = await axios.post(`${API}/support/${ticket.id}/messages`, { text: reply });
      setTicket(res.data);
      setReply("");
      load();
    } catch (e) {
      toast.error(err(e, "Couldn't send"));
    } finally {
      setSending(false);
    }
  };

  const resolve = async () => {
    try {
      const res = await axios.post(`${API}/support/${ticket.id}/resolve`);
      setTicket(res.data);
      toast.success("Marked as resolved. Write again any time to reopen it.");
      load();
    } catch (e) {
      toast.error(err(e, "Couldn't update"));
    }
  };

  const tabs = [
    ["open", `Open${data.counts?.open ? ` (${data.counts.open})` : ""}`],
    ["resolved", `Resolved${data.counts?.resolved ? ` (${data.counts.resolved})` : ""}`],
    ["all", "All"],
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-4 pb-12 animate-in fade-in duration-300">
      <div className="flex flex-col justify-between gap-3 border-b border-border/60 pb-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2.5">
          <div className="rounded-xl border border-orange-500/30 bg-orange-500/10 p-2 text-orange-500">
            <LifeBuoy className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight text-foreground sm:text-2xl">Help & Support</h1>
            <p className="text-xs font-semibold text-muted-foreground">Report a problem or ask a question. The DavaDesk team replies here.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} className="h-9 rounded-xl text-xs font-bold" aria-label="Refresh">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" onClick={() => setNewOpen(true)} className="h-9 flex-1 rounded-xl bg-orange-600 text-xs font-bold text-white hover:bg-orange-700 sm:flex-none" data-shortcut="new">
            <Plus className="mr-1.5 h-4 w-4" /> Report a problem
          </Button>
        </div>
      </div>

      <div className="flex gap-1 border-b border-border/60" role="tablist">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => {
              setTab(id);
              setPage(1);
            }}
            className={`border-b-2 px-4 py-2.5 text-xs font-black transition-colors ${tab === id ? "border-orange-500 bg-orange-500/5 text-orange-600 dark:text-orange-400" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-16">
          <Loader size="md" text="Loading your queries…" />
        </div>
      ) : data.tickets.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/70 p-10 text-center">
          <LifeBuoy className="mx-auto mb-2 h-10 w-10 text-muted-foreground opacity-50" />
          <p className="text-sm font-bold text-foreground">{tab === "resolved" ? "Nothing resolved yet" : "No open queries"}</p>
          <p className="mt-1 text-xs text-muted-foreground">Found a bug or stuck somewhere? Tell us and we'll get back to you.</p>
          <Button size="sm" onClick={() => setNewOpen(true)} className="mt-4 rounded-xl bg-orange-600 text-xs font-bold text-white hover:bg-orange-700">
            <Plus className="mr-1.5 h-4 w-4" /> Report a problem
          </Button>
        </div>
      ) : (
        <ul className="space-y-2" data-rows>
          {data.tickets.map((t) => {
            const cat = SUPPORT_CATEGORIES[t.category] || SUPPORT_CATEGORIES.other;
            const last = (t.messages || [])[0];
            return (
              <li key={t.id}>
                <button
                  type="button"
                  data-row
                  onClick={() => openTicket(t.id)}
                  className={`flex w-full items-start gap-3 rounded-2xl border p-3.5 text-left transition-colors hover:border-orange-500/40 ${t.user_unread ? "border-violet-500/40 bg-violet-500/5" : "border-border/70 bg-card/60"}`}
                >
                  <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${cat.tone}`}>
                    <cat.icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="truncate text-sm font-bold text-foreground">{t.subject}</span>
                      {t.user_unread && <span className="rounded-full bg-violet-600 px-1.5 py-0.5 text-[9px] font-black uppercase text-white">New reply</span>}
                    </span>
                    {last && (
                      <span className="mt-0.5 line-clamp-1 block text-xs text-muted-foreground">
                        {last.author === "admin" ? "DavaDesk team: " : "You: "}
                        {last.text}
                      </span>
                    )}
                    <span className="mt-1 flex items-center gap-2 text-[10px] font-semibold text-muted-foreground">
                      <span className="font-mono">{t.ticket_no}</span>· {cat.short} · {when(t.updated_at)}
                    </span>
                  </span>
                  <StatusBadge status={t.status} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {data.pages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            Page {page} of {data.pages}
          </span>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="h-8 rounded-xl text-xs font-bold">
              Previous
            </Button>
            <Button variant="outline" size="sm" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)} className="h-8 rounded-xl text-xs font-bold">
              Next
            </Button>
          </div>
        </div>
      )}

      {/* New report */}
      <Dialog
        open={newOpen}
        onOpenChange={(o) => {
          setNewOpen(o);
          if (!o && params.get("new")) {
            params.delete("new");
            setParams(params, { replace: true });
          }
        }}
      >
        <DialogContent className="max-w-lg rounded-3xl p-5 sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-black">Report a problem</DialogTitle>
            <DialogDescription className="text-xs">
              {fromPage ? `From ${fromPage}. ` : ""}Your browser and screen size are attached to help us fix it faster.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={create} className="space-y-3">
            <div role="radiogroup" aria-label="What is it about?" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {Object.entries(SUPPORT_CATEGORIES).map(([id, c]) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={form.category === id}
                  onClick={() => setForm((f) => ({ ...f, category: id }))}
                  className={`flex items-center gap-2 rounded-xl border p-2.5 text-left text-xs font-bold transition-colors ${form.category === id ? "border-orange-500 bg-orange-500/10 text-foreground" : "border-border text-muted-foreground hover:border-orange-500/40"}`}
                >
                  <c.icon className="h-4 w-4 shrink-0" />
                  {c.label}
                </button>
              ))}
            </div>
            <div>
              <Label htmlFor="sup-subject" className="text-xs font-bold">Title</Label>
              <Input
                id="sup-subject"
                autoFocus
                value={form.subject}
                maxLength={120}
                onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                placeholder={form.category === "bug" ? "e.g. Bill PDF doesn't open" : "One line about it"}
                className="mt-1 h-10 rounded-xl"
              />
            </div>
            <div>
              <Label htmlFor="sup-desc" className="text-xs font-bold">Details</Label>
              <Textarea
                id="sup-desc"
                value={form.description}
                maxLength={4000}
                rows={6}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder={form.category === "bug" ? "What did you do, what happened, and what did you expect? Bill / invoice numbers help." : "Tell us more…"}
                className="mt-1 rounded-xl text-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) create(e);
                }}
              />
              <p className="mt-1 text-right text-[10px] text-muted-foreground">{form.description.length}/4000</p>
            </div>
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setNewOpen(false)} className="rounded-xl text-xs font-bold">
                Cancel
              </Button>
              <Button type="submit" disabled={creating || !subjectOk || !descOk} className="rounded-xl bg-orange-600 text-xs font-bold text-white hover:bg-orange-700" data-shortcut="save">
                {creating ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
                Send report
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Conversation */}
      <Dialog open={!!ticket} onOpenChange={(o) => !o && closeTicket()}>
        <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col gap-3 rounded-3xl p-5 sm:p-6">
          {ticket && (
            <>
              <DialogHeader>
                <div className="flex flex-wrap items-center gap-2 pr-6">
                  <DialogTitle className="text-base font-black">{ticket.subject}</DialogTitle>
                  <StatusBadge status={ticket.status} />
                </div>
                <DialogDescription className="text-xs">
                  <span className="font-mono">{ticket.ticket_no}</span> · {(SUPPORT_CATEGORIES[ticket.category] || SUPPORT_CATEGORIES.other).short} · opened {when(ticket.created_at)}
                  {ticket.created_by?.name ? ` by ${ticket.created_by.name}` : ""}
                </DialogDescription>
              </DialogHeader>
              <div className="min-h-[160px] flex-1 space-y-2.5 overflow-y-auto rounded-2xl border border-border/60 bg-muted/20 p-3" aria-live="polite">
                {(ticket.messages || []).map((m) => {
                  const mine = m.author === "user";
                  return (
                    <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm ${mine ? "rounded-br-md bg-orange-600 text-white" : "rounded-bl-md border border-border bg-card text-foreground"}`}>
                        {!mine && <p className="mb-0.5 text-[10px] font-black uppercase tracking-wide text-orange-600 dark:text-orange-400">{m.author_name || "DavaDesk team"}</p>}
                        <p className="whitespace-pre-wrap break-words">{m.text}</p>
                        <p className={`mt-1 text-[10px] ${mine ? "text-white/70" : "text-muted-foreground"}`}>
                          {mine && m.author_name ? `${m.author_name} · ` : ""}
                          {new Date(m.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                        </p>
                      </div>
                    </div>
                  );
                })}
                <div ref={threadEnd} />
              </div>
              {(ticket.status === "resolved" || ticket.status === "closed") && (
                <p className="text-center text-[11px] text-muted-foreground">This query is {SUPPORT_STATUS[ticket.status].label.toLowerCase()}. Writing again reopens it.</p>
              )}
              <form onSubmit={sendReply} className="flex items-end gap-2">
                <Textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder="Write a reply…"
                  rows={2}
                  maxLength={4000}
                  className="min-h-[44px] flex-1 rounded-xl text-sm"
                  aria-label="Reply"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) sendReply(e);
                  }}
                />
                <Button type="submit" disabled={sending || !reply.trim()} className="h-11 rounded-xl bg-orange-600 px-4 font-bold text-white hover:bg-orange-700" aria-label="Send reply">
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </form>
              {!["resolved", "closed"].includes(ticket.status) && (
                <Button type="button" variant="ghost" size="sm" onClick={resolve} className="self-start rounded-xl text-xs font-bold text-emerald-600 hover:bg-emerald-500/10 dark:text-emerald-400">
                  <CheckCircle2 className="mr-1.5 h-4 w-4" /> It's sorted, mark resolved
                </Button>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
