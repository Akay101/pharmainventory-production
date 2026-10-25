import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowUp,
  Boxes,
  Check,
  Copy,
  LayoutGrid,
  Loader2,
  Menu,
  MessageSquarePlus,
  Mic,
  Paperclip,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Receipt,
  Search,
  ShoppingCart,
  Square,
  Stethoscope,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  Truck,
  Users,
  Volume2,
  X,
} from "lucide-react";
import { useAuth } from "../App";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../components/ui/alert-dialog";
import { AGENT_META, assistantApi, streamTurn } from "../components/assistant/assistantClient";
import { ChoicesBlock, ConfirmBlock, DraftBlock, NoticeBlock, PickerBlock, QrBlock, ResultBlock, StatsBlock, TableBlock } from "../components/assistant/Blocks";
import ChartBlock from "../components/assistant/ChartBlock";
import ParticleOrb from "../components/assistant/ParticleOrb";
import { ComposerHint, CreditsBlock, CreditsPill, CreditsSheet, EngineNote, EngineSwitch, UsageChip, useCredits } from "../components/assistant/Credits";
import { useVoiceInput } from "../components/assistant/useVoice";
import { dictationSupported, useDictation } from "../components/assistant/useDictation";
import { onSpeakingChange, primeVoice, speakReply, stopVoice } from "../components/assistant/voicePlayer";
import { AI_LOGO_SRC, AiAmbient } from "../components/scan/ScanUI";
import { compressForScan } from "../components/scan/scanClient";

const MAX_PHOTOS = 4;

const AGENT_ICON = { purchase: ShoppingCart, billing: Receipt, inventory: Boxes, customer: Users, supplier: Truck, app: LayoutGrid, medi: Stethoscope };

const SUGGESTIONS = [
  { agent: "purchase", title: "Add a purchase", text: "Ek purchase add karni hai, Dolo 650 Neelkanth se li hai" },
  { agent: "billing", title: "Today's sales", text: "Aaj ki sale kitni hui?" },
  { agent: "inventory", title: "Find a substitute", text: "Dolo 650 ka koi alternative stock mein hai?" },
  { agent: "inventory", title: "Expiry check", text: "Kaun si dawaiyan jaldi expire hone wali hain?" },
  { agent: "customer", title: "Customer dues", text: "Kin customers ka udhaar baaki hai?" },
  { agent: "supplier", title: "Supplier payments", text: "Kis supplier ko kitna payment dena hai?" },
  { agent: "medi", title: "Ask Medi expert", text: "Azithromycin kab nahi leni chahiye?" },
  { agent: "app", title: "Business overview", text: "Mere business ka aaj ka overview do" },
];

const DAY = 86400000;
function groupChats(chats) {
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const groups = { Pinned: [], Today: [], Yesterday: [], "Previous 7 days": [], Older: [] };
  for (const c of chats) {
    const t = new Date(c.updated_at).getTime();
    if (c.pinned) groups.Pinned.push(c);
    else if (t >= startToday) groups.Today.push(c);
    else if (t >= startToday - DAY) groups.Yesterday.push(c);
    else if (t >= startToday - 7 * DAY) groups["Previous 7 days"].push(c);
    else groups.Older.push(c);
  }
  return Object.entries(groups).filter(([, v]) => v.length);
}

const md = {
  table: (p) => (
    <div className="my-2 overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm" {...p} />
    </div>
  ),
  th: (p) => <th className="bg-muted/50 px-3 py-1.5 text-left text-xs font-semibold" {...p} />,
  td: (p) => <td className="border-t border-border px-3 py-1.5" {...p} />,
  a: (p) => <a className="text-orange-500 underline" target="_blank" rel="noreferrer" {...p} />,
  h2: (p) => <h3 className="mt-3 mb-1 text-base font-semibold" {...p} />,
  h3: (p) => <h4 className="mt-2 mb-1 text-sm font-semibold" {...p} />,
  ul: (p) => <ul className="my-1 list-disc space-y-0.5 pl-5" {...p} />,
  ol: (p) => <ol className="my-1 list-decimal space-y-0.5 pl-5" {...p} />,
  blockquote: (p) => <blockquote className="my-2 border-l-2 border-amber-500/60 pl-3 text-muted-foreground" {...p} />,
  code: (p) => <code className="rounded bg-muted px-1 py-0.5 text-[0.85em]" {...p} />,
  p: (p) => <p className="my-1 leading-relaxed" {...p} />,
};

function AgentChip({ agent, label }) {
  if (!agent) return null;
  const Icon = AGENT_ICON[agent] || LayoutGrid;
  const meta = AGENT_META[agent] || {};
  return (
    <span className={`inline-flex items-center gap-1 rounded-full bg-gradient-to-r ${meta.tone || "from-slate-500 to-zinc-500"} px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white shadow-sm`}>
      <Icon className="h-3 w-3" /> {label || meta.label}
    </span>
  );
}

function ThinkingLine({ text }) {
  return (
    <div className="flex items-center gap-2 py-0.5" role="status" aria-live="polite">
      <ParticleOrb size={30} />
      <span className="text-sm font-medium ai-shimmer-text">{text || "Thinking…"}</span>
    </div>
  );
}

function AssistantMessage({ msg, onAction, onReply, busyKey, settled, openDrafts, streaming, onFeedback, latestDraftMsg, isLast, onBuyCredits }) {
  const [copied, setCopied] = useState(false);
  const blocks = msg.blocks || [];
  const main = blocks.filter((b) => b.type !== "choices");
  const choices = blocks.filter((b) => b.type === "choices");
  const showLoader = msg.pending && !msg.text;

  return (
    <div className="flex gap-3">
      <span className="relative mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center">
        {msg.pending && <ParticleOrb size={48} count={34} className="pointer-events-none absolute -inset-2" />}
        <img src={AI_LOGO_SRC} alt="" className="relative h-8 w-8 rounded-full ring-1 ring-indigo-500/20" />
      </span>
      <div className="min-w-0 flex-1 space-y-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">DavaDesk AI</span>
          <AgentChip agent={msg.agent} label={msg.agentLabel} />
        </div>
        <EngineNote note={msg.pending ? msg.engineNote : null} usage={msg.pending ? null : msg.usage} />
        {showLoader && <ThinkingLine text={msg.status || msg.loader} />}
        {main.map((b, i) => {
          const key = `${msg.id}:${i}`;
          const props = { block: b, onAction: (a, label, cb) => onAction(a, label, key, b, cb), busy: busyKey === key, locked: streaming && busyKey !== key };
          if (b.type === "table") return <TableBlock key={key} {...props} />;
          if (b.type === "stats") return <StatsBlock key={key} {...props} />;
          if (b.type === "chart") return <ChartBlock key={key} block={b} />;
          if (b.type === "draft") {
            const superseded = latestDraftMsg?.[b.draft_id] && latestDraftMsg[b.draft_id] !== msg.id ? "Updated below" : null;
            const closed = !msg.pending && openDrafts && !openDrafts.includes(b.draft_id) ? "Closed" : null;
            return <DraftBlock key={key} {...props} settled={settled[key] || superseded || closed} />;
          }
          if (b.type === "picker") {
            // Only the pickers under the newest version of a draft can be used
            const stale = latestDraftMsg?.[b.draft_id] && latestDraftMsg[b.draft_id] !== msg.id ? "Updated below" : null;
            const closed = !msg.pending && openDrafts && !openDrafts.includes(b.draft_id) ? "Closed" : null;
            return <PickerBlock key={key} {...props} settled={settled[key] || stale || closed} />;
          }
          if (b.type === "confirm") return <ConfirmBlock key={key} {...props} settled={settled[key]} />;
          if (b.type === "result") return <ResultBlock key={key} {...props} />;
          if (b.type === "notice") return <NoticeBlock key={key} block={b} />;
          if (b.type === "qr") return <QrBlock key={key} block={b} />;
          if (b.type === "credits") return <CreditsBlock key={key} block={b} onBuy={onBuyCredits} />;
          return null;
        })}
        {msg.pending && msg.text && msg.status && !msg.textStarted && <ThinkingLine text={msg.status} />}
        {msg.text && (
          <div className="prose-sm max-w-none text-[15px] text-foreground">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={md}>
              {msg.text}
            </ReactMarkdown>
            {msg.pending && <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-orange-500 align-middle" />}
          </div>
        )}
        {msg.error && (
          <div className="flex flex-wrap items-center gap-2">
            <NoticeBlock block={{ tone: msg.errorTone || "danger", text: msg.error }} />
            {isLast && msg.retry && (
              <button type="button" disabled={streaming} onClick={msg.retry} className="h-8 rounded-lg border border-border px-3 text-xs font-semibold hover:bg-muted disabled:opacity-40">
                Retry
              </button>
            )}
          </div>
        )}
        {!msg.pending && isLast && choices.map((b, i) => <ChoicesBlock key={i} block={b} onReply={onReply} disabled={streaming} />)}
        {!msg.pending && msg.text && (
          <div className="flex items-center gap-1 text-muted-foreground">
            <button
              type="button"
              title="Copy"
              onClick={() => {
                navigator.clipboard?.writeText(msg.text);
                setCopied(true);
                setTimeout(() => setCopied(false), 1200);
              }}
              className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-muted hover:text-foreground"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              title="Read aloud"
              onClick={() => {
                primeVoice();
                speakReply(msg.text, msg.language);
              }}
              className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-muted hover:text-foreground"
            >
              <Volume2 className="h-3.5 w-3.5" />
            </button>
            {msg.id && !String(msg.id).startsWith("local-") && (
              <>
                <button type="button" title="Good answer" onClick={() => onFeedback(msg, msg.feedback === "up" ? null : "up")} className={`flex h-7 w-7 items-center justify-center rounded-lg hover:bg-muted ${msg.feedback === "up" ? "text-emerald-500" : "hover:text-foreground"}`}>
                  <ThumbsUp className="h-3.5 w-3.5" />
                </button>
                <button type="button" title="Bad answer" onClick={() => onFeedback(msg, msg.feedback === "down" ? null : "down")} className={`flex h-7 w-7 items-center justify-center rounded-lg hover:bg-muted ${msg.feedback === "down" ? "text-rose-500" : "hover:text-foreground"}`}>
                  <ThumbsDown className="h-3.5 w-3.5" />
                </button>
              </>
            )}
            <UsageChip usage={msg.usage} />
          </div>
        )}
      </div>
    </div>
  );
}

function ChatItem({ chat, active, onOpen, onRename, onPin, onDelete }) {
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(chat.title);
  useEffect(() => setTitle(chat.title), [chat.title]);
  return (
    <div className={`group relative flex items-center rounded-xl ${active ? "bg-muted" : "hover:bg-muted/60"}`}>
      {editing ? (
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => {
            setEditing(false);
            if (title.trim() && title !== chat.title) onRename(title.trim());
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              setTitle(chat.title);
              setEditing(false);
            }
          }}
          className="m-1 h-8 w-full rounded-lg border border-orange-500 bg-background px-2 text-sm outline-none"
        />
      ) : (
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 px-3 py-2 text-left">
          <p className="truncate text-sm">{chat.title || "New chat"}</p>
        </button>
      )}
      {!editing && (
        <button
          type="button"
          onClick={() => setMenu((m) => !m)}
          className={`mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-background hover:text-foreground ${menu ? "" : "opacity-0 group-hover:opacity-100 max-md:opacity-100"}`}
          aria-label="Chat options"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      )}
      {menu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenu(false)} />
          <div className="absolute right-1 top-9 z-50 w-40 rounded-xl border border-border bg-card p-1 shadow-xl ai-pop-in">
            <button type="button" onClick={() => { setMenu(false); setEditing(true); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm hover:bg-muted">
              <Pencil className="h-3.5 w-3.5" /> Rename
            </button>
            <button type="button" onClick={() => { setMenu(false); onPin(); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm hover:bg-muted">
              {chat.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />} {chat.pinned ? "Unpin" : "Pin"}
            </button>
            <button type="button" onClick={() => { setMenu(false); onDelete(); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm text-rose-500 hover:bg-rose-500/10">
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default function AssistantPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const activeId = params.get("c");

  const [chats, setChats] = useState([]);
  const [chatsLoading, setChatsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [retention, setRetention] = useState(30);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [messages, setMessages] = useState([]);
  const [title, setTitle] = useState("");
  const [openDrafts, setOpenDrafts] = useState(null);
  const credits = useCredits();
  // Engine of the reply being written, else of the latest reply; a fixed admin
  // mode shows its engine from the start
  const activeEngine = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role !== "assistant") continue;
      const e = m.engineNote?.engine || m.usage?.engine;
      if (e) return e;
      if (m.pending) break;
    }
    const mode = credits.data?.ai_mode;
    return mode === "gemini" ? "pro" : mode === "groq" || mode === "nemotron" ? "swift" : null;
  }, [messages, credits.data?.ai_mode]);
  const creditsRef = useRef(credits);
  creditsRef.current = credits;
  const [creditsOpen, setCreditsOpen] = useState(false);
  const [loadingChat, setLoadingChat] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [busyKey, setBusyKey] = useState(null);
  const [settled, setSettled] = useState({});
  const [input, setInput] = useState("");
  // Voice typing script: auto (English and Hinglish in Roman letters) or hi (Devanagari)
  const [sttLang, setSttLang] = useState(() => {
    try {
      return localStorage.getItem("dd-stt-lang") === "hi" ? "hi" : "auto";
    } catch {
      return "auto";
    }
  });
  const voiceLang = "hi-IN"; // browser fallback: understands Hindi, Hinglish and English
  // The input came from the mic: its reply is read aloud, as before
  const [dictated, setDictated] = useState(false);
  const dictBaseRef = useRef("");
  const [photos, setPhotos] = useState([]); // [{file, preview}]
  const [speaking, setSpeaking] = useState(false);
  const fileRef = useRef(null);
  useEffect(() => onSpeakingChange(setSpeaking), []);
  useEffect(() => () => stopVoice(), []);

  const addPhotos = async (fileList) => {
    const files = Array.from(fileList || []).filter((f) => f.type?.startsWith("image/"));
    if (!files.length) return;
    const room = MAX_PHOTOS - photos.length;
    if (room <= 0) return toast.error(`Up to ${MAX_PHOTOS} photos per message`);
    const compressed = await Promise.all(files.slice(0, room).map((f) => compressForScan(f, { maxSide: 2200, quality: 0.85 })));
    setPhotos((p) => [...p, ...compressed.map((file) => ({ file, preview: URL.createObjectURL(file) }))]);
  };
  const ctrlRef = useRef(null);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const convRef = useRef(activeId);
  const stickRef = useRef(true);
  const skipLoadRef = useRef(null);

  const loadChats = useCallback(async (q = "") => {
    try {
      const data = await assistantApi.list({ search: q || undefined, limit: 50 });
      setChats(data.conversations || []);
      setRetention(data.retention_days || 30);
    } catch {
      // list is non-critical
    } finally {
      setChatsLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => loadChats(search.trim()), search ? 250 : 0);
    return () => clearTimeout(t);
  }, [search, loadChats]);

  // Open a chat from the URL
  useEffect(() => {
    convRef.current = activeId;
    if (!activeId) {
      setMessages([]);
      setTitle("");
      setOpenDrafts(null);
      return;
    }
    if (skipLoadRef.current === activeId) {
      skipLoadRef.current = null;
      return;
    }
    let cancelled = false;
    setLoadingChat(true);
    assistantApi
      .get(activeId)
      .then((d) => {
        if (cancelled) return;
        setMessages(d.messages || []);
        setTitle(d.conversation?.title || "");
        setOpenDrafts(d.open_drafts || []);
        setSettled({});
      })
      .catch((err) => {
        if (cancelled) return;
        toast.error(err.response?.data?.detail || "Couldn't open this chat");
        setParams({}, { replace: true });
      })
      .finally(() => !cancelled && setLoadingChat(false));
    return () => {
      cancelled = true;
    };
  }, [activeId, setParams]);

  // Follow the conversation unless the user scrolled up to read
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickRef.current) el.scrollTo({ top: el.scrollHeight, behavior: streaming ? "auto" : "smooth" });
  }, [messages, streaming]);

  useEffect(() => () => ctrlRef.current?.abort(), []);

  const updatePending = (patch) =>
    setMessages((prev) => {
      const next = [...prev];
      let i = next.length - 1;
      while (i >= 0 && !next[i].pending) i--;
      if (i >= 0) next[i] = typeof patch === "function" ? patch(next[i]) : { ...next[i], ...patch };
      return next;
    });

  const run = useCallback(
    async (body, userText, { onDone, files = [], previews = [], speak = false } = {}) => {
      if (streaming) return;
      stopVoice();
      stickRef.current = true;
      const ctrl = new AbortController();
      ctrlRef.current = ctrl;
      setStreaming(true);
      setMessages((prev) => [
        ...prev,
        { id: `local-u-${Date.now()}`, role: "user", text: userText, action: !!body.action, images: previews, voice: !!body.voice },
        { id: `local-a-${Date.now()}`, role: "assistant", pending: true, text: "", blocks: [], loader: body.action ? "Working on it…" : "Understanding your request…" },
      ]);
      let ok = false;
      let failed = false; // the server answered, but with an error notice
      try {
        await streamTurn(
          { ...body, conversation_id: convRef.current || undefined },
          {
            signal: ctrl.signal,
            files,
            onEvent: (name, data) => {
              if (name === "meta") {
                if (data.conversation_id && data.conversation_id !== convRef.current) {
                  convRef.current = data.conversation_id;
                  skipLoadRef.current = data.conversation_id;
                  setParams({ c: data.conversation_id }, { replace: true });
                  setOpenDrafts([]);
                }
                if (data.title) setTitle(data.title);
              } else if (name === "route") updatePending({ agent: data.agent, agentLabel: data.label, loader: data.loader, status: null });
              else if (name === "status") updatePending({ status: data.text });
              else if (name === "engine") updatePending({ engineNote: data });
              else if (name === "block") {
                if (data.block.type === "notice" && data.block.tone === "danger") failed = true;
                updatePending((m) => ({ ...m, blocks: [...(m.blocks || []), data.block] }));
                if (data.block.type === "draft") setOpenDrafts((d) => [...new Set([...(d || []), data.block.draft_id])]);
                // Saved as a draft by request in words: that chat draft is closed
                if (data.block.closes_draft) setOpenDrafts((d) => (d || []).filter((x) => x !== data.block.closes_draft));
              } else if (name === "delta") updatePending((m) => ({ ...m, text: (m.text || "") + data.text, textStarted: true, status: null }));
              else if (name === "error") {
                // Every engine is down: calm notice, and reload which engines can run
                if (data.code === "all_busy") creditsRef.current.refresh();
                updatePending({ error: data.detail, errorTone: data.code === "all_busy" ? "info" : "danger", retry: body.message ? () => runRef.current?.({ message: body.message }, body.message) : null });
              } else if (name === "done") {
                ok = true;
                if (data.credits) {
                  creditsRef.current.setWallet(data.credits);
                  window.dispatchEvent(new Event("credits-updated"));
                }
                // Spoken question -> spoken answer (spoken replies use credits)
                if (speak && data.message?.text && data.mode === "full") speakReply(data.message.text, data.message.language);
                updatePending((m) => ({ ...m, ...data.message, blocks: data.message.blocks?.length ? data.message.blocks : m.blocks, agentLabel: m.agentLabel, pending: false }));
              }
            },
          }
        );
      } catch (err) {
        if (err.name !== "AbortError") updatePending({ error: err.message || "Something went wrong", retry: body.message ? () => runRef.current?.({ message: body.message }, body.message) : null });
      } finally {
        updatePending((m) => ({ ...m, pending: false }));
        setStreaming(false);
        ctrlRef.current = null;
        onDone?.(ok && !failed);
        loadChats(search.trim());
      }
    },
    // eslint-disable-next-line
    [streaming, setParams, loadChats, search]
  );

  const runRef = useRef(null);
  runRef.current = run;

  const send = (text, { voice = false } = {}) => {
    const t = (text ?? input).trim();
    if ((!t && !photos.length) || streaming) return;
    const files = photos.map((p) => p.file);
    const previews = photos.map((p) => p.preview);
    setInput("");
    setDictated(false);
    setPhotos([]);
    run({ message: t, ...(voice ? { voice: true } : {}) }, t || (files.length ? `📷 ${files.length} photo${files.length > 1 ? "s" : ""}` : ""), { files, previews, speak: voice });
    if (!voice) inputRef.current?.focus();
  };

  const onAction = (action, label, key, block, cb) => {
    if (!action) return;
    if (action.type === "navigate") return navigate(action.to, { state: action.state });
    if (action.type === "url") return window.open(action.href, "_blank", "noopener");
    if (streaming) return cb?.(false);
    setBusyKey(key);
    run({ action, label }, label || action.type, {
      onDone: (ok) => {
        setBusyKey(null);
        cb?.(ok);
        if (!ok) return;
        const outcome =
          action.type === "commit"
            ? "Saved"
            : action.type === "save_draft"
              ? "Saved as draft"
              : action.type === "discard"
                ? "Discarded"
                : action.type === "dismiss"
                  ? "Cancelled"
                  : "Done";
        if (block?.type === "draft" || block?.type === "confirm" || block?.type === "picker") setSettled((s) => ({ ...s, [key]: outcome }));
        if (block?.draft_id && ["commit", "save_draft", "discard"].includes(action.type)) setOpenDrafts((d) => (d || []).filter((x) => x !== block.draft_id));
      },
    });
  };

  // Dictated text goes into the box for the user to review and send
  const insertDictation = (text) => {
    const base = dictBaseRef.current;
    const t = String(text || "").trim();
    setInput(t ? `${base}${base && !/\s$/.test(base) ? " " : ""}${t}` : base);
    if (t) setDictated(true);
    setTimeout(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
    }, 0);
  };

  const voice = useVoiceInput({
    lang: voiceLang,
    onFinal: (text, info) => {
      if (info?.error) toast.error("Microphone access is blocked. Allow it in your browser's site settings.");
      insertDictation(text);
    },
  });

  const dictation = useDictation({
    lang: sttLang,
    onEnd: (text, { limit } = {}) => {
      if (limit) toast.info("Voice typing stops after 3 minutes. Tap the mic to continue.");
      insertDictation(text);
    },
    onFatal: ({ code, detail }) => {
      // No credits or the service is down: the browser's own recognizer still works
      if ((code === "NO_CREDITS" || code === "STT_UNAVAILABLE") && voice.supported) {
        toast.info(code === "NO_CREDITS" ? "Basic voice typing (no credits for accurate voice typing)" : "Using basic voice typing for now");
        voice.start();
        return;
      }
      toast.error(detail || "Voice typing isn't available right now");
    },
  });
  const micBusy = dictation.active || voice.listening;
  const micSupported = dictationSupported() || voice.supported;
  const toggleMic = () => {
    if (dictation.finishing) return;
    if (dictation.active) return dictation.stop();
    if (voice.listening) return voice.stop();
    dictBaseRef.current = input;
    primeVoice(); // unlock audio now so the spoken reply can play
    stopVoice();
    if (dictationSupported()) dictation.start();
    else voice.start();
  };
  const composerValue = dictation.active
    ? [dictBaseRef.current, dictation.text].filter(Boolean).join(dictBaseRef.current && !/\s$/.test(dictBaseRef.current) ? " " : "")
    : voice.listening
      ? [dictBaseRef.current, voice.interim].filter(Boolean).join(dictBaseRef.current ? " " : "")
      : input;
  // Grow the box with live dictation (value changes don't fire onInput)
  useEffect(() => {
    const el = inputRef.current;
    if (!el || !micBusy) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
    el.scrollTop = el.scrollHeight;
  }, [composerValue, micBusy]);

  const newChat = () => {
    ctrlRef.current?.abort();
    setParams({});
    setSidebarOpen(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  // { chat } for one chat, { all: true } for every chat; null when closed
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const confirmDelete = async () => {
    const target = pendingDelete;
    if (!target) return;
    setDeleting(true);
    try {
      if (target.all) {
        await assistantApi.removeAll();
        setChats([]);
        newChat();
      } else {
        await assistantApi.remove(target.chat.id);
        setChats((c) => c.filter((x) => x.id !== target.chat.id));
        if (target.chat.id === activeId) newChat();
      }
      setPendingDelete(null);
    } catch {
      toast.error("Couldn't delete. Please try again.");
    } finally {
      setDeleting(false);
    }
  };

  const grouped = useMemo(() => groupChats(chats), [chats]);
  // Only the newest card of a draft is actionable; only the newest reply keeps its suggestions
  const { latestDraftMsg, lastAssistantId } = useMemo(() => {
    const latest = {};
    let last = null;
    messages.forEach((m) => {
      if (m.role !== "assistant") return;
      last = m.id;
      (m.blocks || []).forEach((b) => b.type === "draft" && (latest[b.draft_id] = m.id));
    });
    return { latestDraftMsg: latest, lastAssistantId: last };
  }, [messages]);
  const firstName = (user?.name || "").split(" ")[0];

  const sidebar = (
    <aside className="flex h-full w-[280px] flex-col border-r border-border bg-card/70 backdrop-blur-xl">
      <div className="flex items-center gap-2.5 px-4 pb-3 pt-4">
        <img src={AI_LOGO_SRC} alt="" className="h-9 w-9 rounded-full ring-1 ring-indigo-500/20" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold leading-tight">DavaDesk AI</p>
          <p className="text-[11px] text-muted-foreground">Your pharmacy co-pilot</p>
        </div>
        <button type="button" onClick={() => setSidebarOpen(false)} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-muted md:hidden" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="px-3">
        <button
          type="button"
          onClick={newChat}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-pink-500 text-sm font-semibold text-white shadow-md shadow-orange-500/20 active:scale-[0.99]"
        >
          <MessageSquarePlus className="h-4 w-4" /> New chat
        </button>
        <div className="mt-2 flex items-center gap-2 rounded-xl border border-border bg-background px-2.5">
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search chats" className="h-9 w-full bg-transparent text-sm outline-none" />
        </div>
      </div>
      <div className="mt-2 flex-1 space-y-3 overflow-y-auto px-2 pb-3">
        {chatsLoading ? (
          <div className="space-y-2 px-2 pt-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-8 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : grouped.length ? (
          grouped.map(([label, list]) => (
            <div key={label}>
              <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
              {list.map((c) => (
                <ChatItem
                  key={c.id}
                  chat={c}
                  active={c.id === activeId}
                  onOpen={() => {
                    setParams({ c: c.id });
                    setSidebarOpen(false);
                  }}
                  onRename={async (t) => {
                    await assistantApi.update(c.id, { title: t }).catch(() => {});
                    setChats((list2) => list2.map((x) => (x.id === c.id ? { ...x, title: t } : x)));
                    if (c.id === activeId) setTitle(t);
                  }}
                  onPin={async () => {
                    await assistantApi.update(c.id, { pinned: !c.pinned }).catch(() => {});
                    loadChats(search.trim());
                  }}
                  onDelete={() => setPendingDelete({ chat: c })}
                />
              ))}
            </div>
          ))
        ) : (
          <p className="px-3 pt-6 text-center text-xs text-muted-foreground">{search ? "No chats match" : "Your chats will appear here"}</p>
        )}
      </div>
      <div className="border-t border-border px-4 py-3 text-[11px] text-muted-foreground">
        <p>Chats are kept for {retention} days, then deleted automatically.</p>
        {chats.length > 0 && (
          <button type="button" onClick={() => setPendingDelete({ all: true })} className="mt-1 font-semibold text-rose-500 hover:underline">
            Delete all chats
          </button>
        )}
      </div>
    </aside>
  );

  const empty = !activeId && messages.length === 0;

  return (
    <div className="relative isolate flex h-[100dvh] overflow-hidden bg-background text-foreground">
      <AiAmbient />
      <div className="hidden md:block">{sidebar}</div>
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="ai-pop-in h-full">{sidebar}</div>
          <div className="flex-1 bg-black/50" onClick={() => setSidebarOpen(false)} />
        </div>
      )}

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b border-border bg-background/70 px-3 py-2.5 backdrop-blur-xl sm:px-4">
          <button type="button" onClick={() => setSidebarOpen(true)} className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-muted md:hidden" aria-label="Chats">
            <Menu className="h-5 w-5" />
          </button>
          <button type="button" onClick={() => navigate("/dashboard")} className="hidden h-9 items-center gap-1.5 rounded-xl px-2.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground md:flex">
            <ArrowLeft className="h-4 w-4" /> App
          </button>
          {/* Which engine is answering, top left; picked per task, not by hand */}
          <div className="hidden md:block">
            <EngineSwitch data={credits.data} active={activeEngine} live={streaming} />
          </div>
          <div className="md:hidden">
            <EngineSwitch data={credits.data} active={activeEngine} live={streaming} compact />
          </div>
          <p className="min-w-0 flex-1 truncate text-sm font-semibold md:pl-2">{empty ? "New chat" : title || "Chat"}</p>
          <CreditsPill wallet={credits.data?.wallet} onOpen={() => setCreditsOpen(true)} />
          <button type="button" onClick={newChat} className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-muted md:hidden" aria-label="New chat">
            <MessageSquarePlus className="h-5 w-5" />
          </button>
          <button type="button" onClick={() => navigate("/dashboard")} className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-muted md:hidden" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div
          ref={scrollRef}
          onScroll={(e) => {
            const el = e.currentTarget;
            stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
          }}
          className="flex-1 overflow-y-auto"
        >
          <div className="mx-auto w-full max-w-3xl lg:max-w-[900px] xl:max-w-[1000px] 2xl:max-w-[1150px] px-3 py-5 sm:px-6 lg:px-8">
            {loadingChat ? (
              <div className="flex justify-center pt-20">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : empty ? (
              <div className="flex flex-col items-center pt-6 text-center sm:pt-14">
                <div className="relative">
                  <div className="absolute inset-0 -z-10 animate-pulse rounded-full bg-gradient-to-br from-orange-500/40 via-pink-500/30 to-violet-500/40 blur-2xl" />
                  <img src={AI_LOGO_SRC} alt="" className="h-20 w-20 rounded-full sm:h-24 sm:w-24" />
                </div>
                <h1 className="mt-5 text-2xl font-bold sm:text-3xl">
                  Namaste{firstName ? `, ${firstName}` : ""} <span className="ai-shimmer-text">how can I help?</span>
                </h1>
                <p className="mt-2 max-w-md text-sm text-muted-foreground">
                  Ask in English, Hindi or Hinglish, type or speak. I can create purchases and bills, find anything in your data, check stock and answer medicine questions.
                </p>
                <div className="mt-6 grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
                  {SUGGESTIONS.map((s) => {
                    const Icon = AGENT_ICON[s.agent];
                    return (
                      <button
                        key={s.text}
                        type="button"
                        onClick={() => send(s.text)}
                        className="group flex items-start gap-3 rounded-2xl border border-border bg-card/70 p-3 text-left transition hover:border-orange-500/40 hover:bg-card active:scale-[0.99]"
                      >
                        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${AGENT_META[s.agent].tone} text-white`}>
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-xs font-semibold text-muted-foreground">{s.title}</span>
                          <span className="block text-sm">{s.text}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {messages.map((m) =>
                  m.role === "user" ? (
                    <div key={m.id} className="flex flex-col items-end gap-1.5">
                      {m.images?.length > 0 && (
                        <div className="flex max-w-[85%] flex-wrap justify-end gap-1.5">
                          {m.images.map((src, i) => (
                            <a key={i} href={src} target="_blank" rel="noreferrer">
                              <img src={src} alt="" className="h-24 w-24 rounded-xl border border-border object-cover sm:h-28 sm:w-28" />
                            </a>
                          ))}
                        </div>
                      )}
                      {m.text && (
                        <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md px-4 py-2.5 text-[15px] ${m.action ? "border border-border bg-card italic text-muted-foreground" : "bg-gradient-to-br from-orange-500 to-pink-500 text-white shadow-md shadow-orange-500/15"}`}>
                          {m.voice && <Mic className="mr-1 inline h-3.5 w-3.5 opacity-80" />}
                          {m.text}
                        </div>
                      )}
                    </div>
                  ) : (
                    <AssistantMessage
                      key={m.id}
                      msg={m}
                      onAction={onAction}
                      onReply={(reply) => send(reply)}
                      busyKey={busyKey}
                      settled={settled}
                      openDrafts={openDrafts}
                      streaming={streaming}
                      latestDraftMsg={latestDraftMsg}
                      isLast={m.id === lastAssistantId}
                      onBuyCredits={() => setCreditsOpen(true)}
                      onFeedback={async (msg, value) => {
                        setMessages((prev) => prev.map((x) => (x.id === msg.id ? { ...x, feedback: value } : x)));
                        await assistantApi.feedback(msg.id, value).catch(() => {});
                      }}
                    />
                  )
                )}
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-border bg-background/80 px-3 pb-[max(env(safe-area-inset-bottom),12px)] pt-3 backdrop-blur-xl sm:px-6">
          <div
            className="mx-auto w-full max-w-3xl lg:max-w-[900px] xl:max-w-[1000px] 2xl:max-w-[1150px]"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              addPhotos(e.dataTransfer.files);
            }}
          >
            {speaking && (
              <div className="mb-2 flex justify-center">
                <button
                  type="button"
                  onClick={stopVoice}
                  className="ai-pop-in flex items-center gap-2 rounded-full border border-orange-500/30 bg-card px-3 py-1.5 text-xs font-semibold shadow-sm"
                >
                  <span className="flex h-3 items-end gap-0.5">
                    {[0, 1, 2, 3].map((i) => (
                      <span key={i} className="w-0.5 animate-pulse rounded-full bg-orange-500" style={{ height: `${6 + (i % 2) * 6}px`, animationDelay: `${i * 0.15}s` }} />
                    ))}
                  </span>
                  Speaking… <span className="text-muted-foreground">Tap to stop</span>
                </button>
              </div>
            )}
            {photos.length > 0 && (
              <div className="mb-2 flex gap-2 overflow-x-auto">
                {photos.map((p, i) => (
                  <div key={p.preview} className="ai-pop-in relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-border">
                    <img src={p.preview} alt="" className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => {
                        URL.revokeObjectURL(p.preview);
                        setPhotos((list) => list.filter((_, idx) => idx !== i));
                      }}
                      className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white"
                      aria-label="Remove photo"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                addPhotos(e.target.files);
                e.target.value = "";
              }}
            />
            <div className={`flex items-end gap-2 rounded-2xl border bg-card p-2 shadow-sm transition ${micBusy ? "border-rose-500/50 ring-2 ring-rose-500/20" : "border-border focus-within:border-orange-500/50 focus-within:ring-2 focus-within:ring-orange-500/15"}`}>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={streaming || photos.length >= MAX_PHOTOS}
                title="Attach photo (invoice or medicine pack)"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
              >
                <Paperclip className="h-5 w-5" />
              </button>
              <textarea
                ref={inputRef}
                onPaste={(e) => {
                  const imgs = Array.from(e.clipboardData?.files || []).filter((f) => f.type.startsWith("image/"));
                  if (imgs.length) {
                    e.preventDefault();
                    addPhotos(imgs);
                  }
                }}
                rows={1}
                value={composerValue}
                readOnly={micBusy}
                aria-live={micBusy ? "polite" : undefined}
                onChange={(e) => {
                  setInput(e.target.value);
                  if (!e.target.value.trim()) setDictated(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    // While dictating, Enter only stops the mic; the user still reviews and sends
                    if (micBusy) return toggleMic();
                    send(undefined, { voice: dictated });
                  }
                  if (e.key === "Escape" && micBusy) {
                    e.preventDefault();
                    toggleMic();
                  }
                }}
                onInput={(e) => {
                  e.currentTarget.style.height = "auto";
                  e.currentTarget.style.height = `${Math.min(e.currentTarget.scrollHeight, 160)}px`;
                }}
                placeholder={dictation.status === "starting" ? "Opening the mic…" : micBusy ? "Listening… speak now, tap the mic to stop" : photos.length ? "Say what to do with the photo… e.g. “iski purchase chadha do”" : "Ask anything… e.g. “Last 3 din ki purchase dikhao”"}
                className="max-h-40 min-h-[40px] flex-1 resize-none bg-transparent px-2 py-2 text-[15px] outline-none placeholder:text-muted-foreground"
              />
              {micSupported && (
                <div className="flex items-center">
                  <button
                    type="button"
                    onClick={() => {
                      const next = sttLang === "hi" ? "auto" : "hi";
                      setSttLang(next);
                      try {
                        localStorage.setItem("dd-stt-lang", next);
                      } catch {}
                    }}
                    disabled={micBusy}
                    title={sttLang === "hi" ? "Voice typing writes Hindi in हिंदी script. Tap for English / Hinglish in Roman letters." : "Voice typing writes English and Hinglish in Roman letters. Tap for हिंदी script."}
                    aria-label="Voice typing script"
                    className="h-10 min-w-[2.25rem] rounded-xl px-1.5 text-[11px] font-bold text-muted-foreground hover:bg-muted disabled:opacity-50"
                  >
                    {sttLang === "hi" ? "हि" : "Aa"}
                  </button>
                  <button
                    type="button"
                    onClick={toggleMic}
                    disabled={streaming || dictation.finishing}
                    title={dictation.finishing ? "Finishing…" : micBusy ? "Stop (Esc)" : "Voice typing"}
                    aria-label={micBusy ? "Stop voice typing" : "Start voice typing"}
                    aria-pressed={micBusy}
                    className={`relative flex h-10 w-10 items-center justify-center rounded-xl transition disabled:opacity-60 ${micBusy ? "bg-rose-500 text-white" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                  >
                    {micBusy && !dictation.finishing && (
                      <span
                        className="pointer-events-none absolute inset-0 rounded-xl ring-4 ring-rose-500/40 transition-transform duration-100"
                        style={{ transform: `scale(${1 + (dictation.active ? dictation.level : 0.15) * 0.35})` }}
                      />
                    )}
                    {dictation.finishing ? <Loader2 className="h-5 w-5 animate-spin" /> : micBusy ? <Square className="h-4 w-4 fill-current" /> : <Mic className="h-5 w-5" />}
                  </button>
                </div>
              )}
              {streaming ? (
                <button type="button" onClick={() => ctrlRef.current?.abort()} title="Stop" className="flex h-10 w-10 items-center justify-center rounded-xl bg-foreground text-background">
                  <Square className="h-4 w-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => send(undefined, { voice: dictated })}
                  disabled={micBusy || (!input.trim() && !photos.length)}
                  title="Send"
                  className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-pink-500 text-white shadow-md shadow-orange-500/20 transition active:scale-95 disabled:opacity-40"
                >
                  <ArrowUp className="h-5 w-5" />
                </button>
              )}
            </div>
            <div className="mt-1.5 space-y-0.5">
              <ComposerHint data={credits.data} hasPhotos={photos.length > 0} listening={dictation.active} spokenReply={dictated && !micBusy} estimate={credits.estimate} />
              <p className="text-center text-[11px] text-muted-foreground">Nothing is saved until you confirm on a card. AI can make mistakes; check important details.</p>
            </div>
          </div>
        </div>
      </main>

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && !deleting && setPendingDelete(null)}>
        <AlertDialogContent className="rounded-2xl max-w-sm border border-border bg-background p-6 shadow-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-bold">{pendingDelete?.all ? "Delete all chats" : "Delete chat"}</AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-muted-foreground">
              {pendingDelete?.all ? (
                "All your conversations with DavaDesk AI will be deleted. This can't be undone."
              ) : (
                <>
                  <span className="font-semibold text-foreground">"{pendingDelete?.chat?.title || "Untitled chat"}"</span> will be deleted. This can't be undone.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4 flex flex-wrap sm:justify-end gap-2">
            <AlertDialogCancel disabled={deleting} className="h-10 rounded-xl border border-border hover:bg-muted font-semibold">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault(); // keep the dialog open until the delete finishes
                confirmDelete();
              }}
              className="h-10 rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90 font-semibold shadow-md shadow-destructive/10"
            >
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {pendingDelete?.all ? "Delete all" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <CreditsSheet open={creditsOpen} onClose={() => setCreditsOpen(false)} data={credits.data} refresh={credits.refresh} />
    </div>
  );
}
