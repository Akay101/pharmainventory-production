import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Coins, Loader2, Zap, Target, History, ShoppingBag, Info, Sparkles, Mic, ImageIcon, Check, Clock, ArrowLeftRight } from "lucide-react";
import { API } from "../../App";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../ui/dialog";

export const creditsApi = {
  get: () => axios.get(`${API}/credits`).then((r) => r.data),
  history: (before) => axios.get(`${API}/credits/history`, { params: { before, limit: 40 } }).then((r) => r.data.items || []),
  checkout: (packId) => axios.post(`${API}/credits/checkout`, { pack_id: packId }).then((r) => r.data),
};

const fmt = (n) => (Number(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: 1 });
const inr = (paise) => `₹${((paise || 0) / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const ENGINE_ICON = { pro: Target, swift: Zap };

const loadCashfree = () =>
  new Promise((resolve, reject) => {
    if (window.Cashfree) return resolve(window.Cashfree);
    const s = document.createElement("script");
    s.src = "https://sdk.cashfree.com/js/v3/cashfree.js";
    s.onload = () => resolve(window.Cashfree);
    s.onerror = () => reject(new Error("Couldn't load the payment page"));
    document.body.appendChild(s);
  });

// Credits state for the chat: what's left, packs, engines, what tasks cost
export function useCredits() {
  const [data, setData] = useState(null);
  const refresh = useCallback(async () => {
    try {
      setData(await creditsApi.get());
    } catch {
      /* the chat still works; the pill just stays hidden */
    }
  }, []);
  useEffect(() => {
    refresh();
    // Scans, chat replies and top-ups elsewhere in the app announce changes
    const onChange = () => refresh();
    const onVisible = () => document.visibilityState === "visible" && refresh();
    window.addEventListener("credits-updated", onChange);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("credits-updated", onChange);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);
  const setWallet = useCallback((wallet) => wallet && setData((d) => (d ? { ...d, wallet } : d)), []);
  // Credits a task typically uses on the engine that handles it in this mode
  const estimate = useCallback((task) => data?.tasks?.find((t) => t.id === task)?.credits ?? null, [data]);
  return { data, refresh, setWallet, estimate };
}

export const hasCredits = (wallet) => (wallet?.available || 0) >= 1;

export function CreditsPill({ wallet, onOpen }) {
  if (!wallet) return null;
  const low = wallet.available < 5;
  return (
    <button
      type="button"
      onClick={onOpen}
      title="AI credits"
      className={`flex h-9 shrink-0 items-center gap-1.5 rounded-xl border px-2.5 text-xs font-bold transition hover:bg-muted ${low ? "border-amber-500/40 text-amber-600 dark:text-amber-400" : "border-border"}`}
    >
      <Coins className={`h-4 w-4 ${low ? "text-amber-500" : "text-orange-500"}`} />
      <span className="tabular-nums">{fmt(wallet.available)}</span>
      <span className="hidden font-medium text-muted-foreground sm:inline">credits</span>
    </button>
  );
}

const ENGINE_NAME = { pro: "Precision", swift: "Swift" };
const cheaperBy = (data) => {
  const t = data?.tasks?.find((x) => x.id === "action")?.credits;
  return t?.pro && t?.swift ? Math.max(1, Math.round(t.pro / t.swift)) : null;
};

// Which engine is answering: chosen per task by the admin's mode, not by the
// user. `active` lights up the engine of the reply being written (or the last
// one); an engine that can't answer right now is marked unavailable.
export function EngineSwitch({ data, active, live = false, compact = false }) {
  if (!data?.engines?.length) return null;
  const auto = (data.ai_mode || "auto") === "auto";
  const ratio = cheaperBy(data);
  return (
    <div
      className="flex h-9 shrink-0 items-center rounded-xl border border-border bg-muted/60 p-0.5"
      role="status"
      aria-label={active ? `Answering with ${ENGINE_NAME[active]}` : "AI engine"}
      title={auto ? "Chosen automatically: Swift for questions and lookups, Precision for records, reports and photos" : "Set by DavaDesk"}
    >
      {auto && !compact && <span className="px-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Auto</span>}
      {data.engines.map((e) => {
        const Icon = ENGINE_ICON[e.id] || Sparkles;
        const on = active === e.id;
        const off = e.ready === false;
        if (compact && !on && !off && active) return null; // phones: just the one answering
        return (
          <span
            key={e.id}
            className={`flex h-full items-center gap-1 rounded-lg px-2 text-xs font-bold transition ${
              on ? "bg-background text-foreground shadow-sm ring-1 ring-border" : off ? "text-muted-foreground/50" : "text-muted-foreground"
            }`}
          >
            <Icon className={`h-3.5 w-3.5 ${on ? (e.id === "swift" ? "text-emerald-500" : "text-orange-500") : ""} ${on && live ? "animate-pulse" : ""}`} />
            {(!compact || on) && e.name}
            {!compact && off && <span className="text-[10px] font-medium">· unavailable</span>}
            {!compact && !off && e.id === "swift" && ratio && <span className="hidden rounded bg-emerald-500/10 px-1 text-[10px] text-emerald-600 dark:text-emerald-400 lg:inline">{ratio}× cheaper</span>}
          </span>
        );
      })}
    </div>
  );
}

// The two engines and what each handles (credits sheet); nothing to pick
const HANDLES = { pro: "records, reports and photos", swift: "questions and lookups" };
function EngineCards({ data }) {
  const auto = (data.ai_mode || "auto") === "auto";
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {data.engines.map((e) => {
        const Icon = ENGINE_ICON[e.id] || Sparkles;
        const off = e.ready === false;
        return (
          <div key={e.id} className={`rounded-2xl border-2 p-3 ${off ? "border-border opacity-60" : e.id === "swift" ? "border-emerald-500/40 bg-emerald-500/5" : "border-orange-500/40 bg-orange-500/5"}`}>
            <span className="flex items-center gap-1.5 text-sm font-bold">
              <Icon className={`h-4 w-4 ${e.id === "swift" ? "text-emerald-500" : "text-orange-500"}`} /> {e.name}
              {off && <span className="ml-auto text-[10px] font-semibold text-muted-foreground">Unavailable</span>}
            </span>
            <span className="mt-1 block text-xs text-muted-foreground">{e.blurb}</span>
            {auto && !off && <span className="mt-1.5 block text-[11px] font-semibold text-muted-foreground">Answers {HANDLES[e.id]}</span>}
          </div>
        );
      })}
    </div>
  );
}

// Shown on a reply that another engine answered, or the slow last resort
export function EngineNote({ note, usage }) {
  const n = note || (usage?.switched_from || usage?.slow ? { engine: usage.engine, from: usage.switched_from, slow: usage.slow } : null);
  if (!n) return null;
  const switched = n.from && n.from !== n.engine ? `${ENGINE_NAME[n.from] || "Your engine"} is busy right now, so ${ENGINE_NAME[n.engine] || "the other engine"} is answering.` : "";
  const text = [switched, n.slow ? "Due to high traffic, responses may be slow." : ""].filter(Boolean).join(" ");
  const Icon = n.slow ? Clock : ArrowLeftRight;
  return (
    <p className="ai-pop-in flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
      <Icon className="h-3.5 w-3.5 shrink-0" /> {text}
    </p>
  );
}

// "≈ 2 credits" under the composer, for what's about to be sent
export function ComposerHint({ data, hasPhotos, listening, spokenReply, estimate }) {
  if (!data?.wallet) return null;

  if (!hasCredits(data.wallet)) {
    const left = Math.max(0, (data.free_mode?.messages_per_day || 0) - (data.wallet.free_used_today || 0));
    return (
      <p className="flex flex-wrap items-center justify-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
        <Info className="h-3 w-3" />
        {data.free_mode?.enabled && left > 0
          ? `Out of credits: light mode (questions, lookups, reports), ${left} free message${left === 1 ? "" : "s"} left today. Photos and voice replies need credits.`
          : "Out of credits for today. Buy credits to keep chatting."}
      </p>
    );
  }
  const parts = [];
  if (hasPhotos) parts.push({ icon: ImageIcon, text: `photo ≈ ${fmt(estimate("photo"))} credits` });
  else parts.push({ icon: Coins, text: `≈ ${fmt(estimate("question"))}–${fmt(estimate("action"))} credits a message` });
  if (listening) parts.push({ icon: Mic, text: `voice typing ≈ ${fmt(estimate("dictation"))}` });
  if (spokenReply) parts.push({ icon: Mic, text: `spoken reply +${fmt(estimate("voice"))}` });
  return (
    <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
      {parts.map((p, i) => (
        <span key={i} className="flex items-center gap-1">
          <p.icon className="h-3 w-3" /> {p.text}
        </span>
      ))}
    </p>
  );
}

export function UsageChip({ usage }) {
  if (!usage) return null;
  if (usage.mode === "free") return <span className="ml-1 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">Free · light mode</span>;
  if (!usage.credits) return null;
  return (
    <span
      className="ml-1 flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground"
      title={`Credits this reply used, answered by ${ENGINE_NAME[usage.engine] || "Precision"}${usage.switched_from ? ` (${ENGINE_NAME[usage.switched_from]} was busy)` : ""}`}
    >
      <Coins className="h-3 w-3" /> {fmt(usage.credits)} · {ENGINE_NAME[usage.engine] || "Precision"}
      {usage.switched_from && <ArrowLeftRight className="h-3 w-3" />}
    </span>
  );
}

export function CreditsBlock({ block, onBuy }) {
  return (
    <div className="ai-pop-in flex flex-wrap items-center gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-3">
      <Coins className="h-5 w-5 shrink-0 text-amber-500" />
      <p className="min-w-0 flex-1 text-sm font-medium">{block.text}</p>
      <button type="button" onClick={onBuy} className="h-9 rounded-xl bg-gradient-to-r from-orange-500 to-pink-500 px-3.5 text-sm font-semibold text-white">
        Buy credits
      </button>
    </div>
  );
}

const HISTORY_LABEL = {
  DAILY: "Daily credits",
  USAGE: "Used",
  FREE_USAGE: "Free (light mode)",
  PURCHASE: "Bought",
  ADMIN_GRANT: "Added by DavaDesk",
  ADMIN_REMOVE: "Removed by DavaDesk",
  DAILY_OVERRIDE: "Daily credits changed",
};
const TASK_LABEL = { question: "Question", lookup: "Lookup", report: "Report", action: "Records", photo: "Photo", voice: "Spoken reply", scan: "Scan", dictation: "Voice typing" };

export function CreditsSheet({ open, onClose, data, refresh }) {
  const [tab, setTab] = useState("balance");
  const [buying, setBuying] = useState(null);
  const [items, setItems] = useState(null);
  const [more, setMore] = useState(true);

  useEffect(() => {
    if (open) refresh?.();
  }, [open, refresh]);
  useEffect(() => {
    if (!open || tab !== "history") return;
    setItems(null);
    creditsApi
      .history()
      .then((rows) => {
        setItems(rows);
        setMore(rows.length >= 40);
      })
      .catch(() => setItems([]));
  }, [open, tab]);

  const buy = async (pack) => {
    setBuying(pack.id);
    try {
      const order = await creditsApi.checkout(pack.id);
      const Cashfree = await loadCashfree();
      const cashfree = Cashfree({ mode: order.mode });
      await cashfree.checkout({ paymentSessionId: order.payment_session_id, redirectTarget: "_self" });
    } catch (err) {
      toast.error(err.response?.data?.detail || err.message || "Couldn't start the payment");
      setBuying(null);
    }
  };

  const w = data?.wallet;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Coins className="h-5 w-5 text-orange-500" /> AI credits
          </DialogTitle>
          <DialogDescription>Shared by everyone in your pharmacy. Daily credits come first and refresh every day; bought credits never expire.</DialogDescription>
        </DialogHeader>
        {!data ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              {[
                ["Available", w.available, "credits"],
                ["Today's daily", `${fmt(w.daily.remaining)} / ${fmt(w.daily.allowance)}`, "resets at midnight"],
                ["Bought", w.balance, "never expire"],
              ].map(([k, v, sub]) => (
                <div key={k} className="rounded-2xl border border-border p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{k}</p>
                  <p className="text-xl font-black tabular-nums">{typeof v === "number" ? fmt(v) : v}</p>
                  <p className="text-[10px] text-muted-foreground">{sub}</p>
                </div>
              ))}
            </div>

            <div className="flex gap-1 rounded-xl border border-border bg-muted/60 p-1 text-sm font-semibold" role="tablist">
              {[
                ["balance", "Buy credits", ShoppingBag],
                ["usage", "What costs what", Info],
                ["history", "History", History],
              ].map(([id, label, Icon]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={tab === id}
                  onClick={() => setTab(id)}
                  className={`flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg px-1 py-2 text-xs transition sm:text-sm ${
                    tab === id ? "bg-background text-foreground shadow-sm ring-1 ring-orange-500/40" : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
                  }`}
                >
                  <Icon className={`h-3.5 w-3.5 shrink-0 ${tab === id ? "text-orange-500" : ""}`} /> <span className="truncate">{label}</span>
                </button>
              ))}
            </div>

            {tab === "balance" && (
              <div className="space-y-3">
                <div className="grid gap-2 sm:grid-cols-3">
                  {data.packs.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      disabled={!data.can_buy || !!buying}
                      onClick={() => buy(p)}
                      className="rounded-2xl border border-border p-3 text-left transition hover:border-orange-500/50 hover:bg-orange-500/5 disabled:opacity-60"
                    >
                      <p className="text-xs font-semibold text-muted-foreground">{p.label}</p>
                      <p className="text-2xl font-black tabular-nums">{fmt(p.credits)}</p>
                      <p className="text-xs text-muted-foreground">credits{p.bonus_credits ? ` (incl. ${fmt(p.bonus_credits)} bonus)` : ""}</p>
                      <p className="mt-2 flex items-center gap-1.5 text-sm font-bold text-orange-500">
                        {buying === p.id && <Loader2 className="h-4 w-4 animate-spin" />} {inr(p.price_paise)}
                        <span className="text-[10px] font-medium text-muted-foreground">incl. {data.gst_percent}% GST</span>
                      </p>
                    </button>
                  ))}
                </div>
                {!data.can_buy && <p className="text-xs text-muted-foreground">Only your pharmacy admin can buy credits. Ask them to top up.</p>}
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">AI engines</p>
                  <EngineCards data={data} />
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    {(data.ai_mode || "auto") === "auto" ? "The right engine is picked for each message; if one is busy the other answers and the reply says so." : "DavaDesk has set one engine for all messages right now."}
                  </p>
                </div>
              </div>
            )}

            {tab === "usage" && (
              <div className="space-y-2">
                <div className="overflow-hidden rounded-2xl border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-[11px] uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-left">Task</th>
                        <th className="px-3 py-2 text-right">Credits</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {data.tasks.map((t) => (
                        <tr key={t.id}>
                          <td className="px-3 py-2">
                            <p className="font-medium">{t.label}</p>
                            <p className="text-xs text-muted-foreground">
                              {t.hint}
                              {t.engine ? ` · ${ENGINE_NAME[t.engine]}` : ""}
                            </p>
                          </td>
                          <td className="px-3 py-2 text-right font-semibold tabular-nums">{t.credits === null || t.credits === undefined ? "—" : `≈ ${fmt(t.credits)}`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-muted-foreground">
                  Typical credits per request; longer chats and bigger invoices use a little more. 1 credit = ₹{((data.credit_value_paise || 10) / 100).toFixed(2)}.
                  {data.free_mode?.enabled && ` With no credits left you still get ${data.free_mode.messages_per_day} free light messages a day (questions, lookups, reports).`}
                </p>
              </div>
            )}

            {tab === "history" && (
              <div className="max-h-80 overflow-y-auto rounded-2xl border border-border">
                {!items ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : !items.length ? (
                  <p className="p-4 text-center text-sm text-muted-foreground">No credit activity yet.</p>
                ) : (
                  <div className="divide-y divide-border">
                    {items.map((r) => (
                      <div key={r.id} className="flex items-center justify-between gap-3 px-3 py-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium">
                            {HISTORY_LABEL[r.type] || r.type}
                            {r.task ? ` · ${TASK_LABEL[r.task] || r.task}` : ""}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {new Date(r.created_at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                            {r.note ? ` · ${r.note}` : ""}
                          </p>
                        </div>
                        <span className={`shrink-0 text-sm font-bold tabular-nums ${r.credits > 0 ? "text-emerald-500" : ""}`}>
                          {r.credits > 0 ? "+" : ""}
                          {fmt(r.credits)}
                        </span>
                      </div>
                    ))}
                    {more && (
                      <button
                        type="button"
                        onClick={async () => {
                          const next = await creditsApi.history(items[items.length - 1]?.created_at).catch(() => []);
                          setItems((x) => [...x, ...next]);
                          setMore(next.length >= 40);
                        }}
                        className="w-full py-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
                      >
                        Load more
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
