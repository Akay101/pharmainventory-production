import { useEffect, useState } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, ArrowUpRight, BarChart3, Check, CheckCircle2, ChevronDown, ClipboardList, Globe, Info, Loader2, Package, Plus, Receipt, Search, ShoppingCart, Table2, Truck, X } from "lucide-react";
import { assistantApi, inr } from "./assistantClient";

const BADGE = {
  paid: "bg-emerald-500/10 text-emerald-500 border-emerald-500/25",
  "in stock": "bg-emerald-500/10 text-emerald-500 border-emerald-500/25",
  unpaid: "bg-amber-500/10 text-amber-500 border-amber-500/25",
  partial: "bg-sky-500/10 text-sky-500 border-sky-500/25",
  expired: "bg-rose-500/10 text-rose-500 border-rose-500/25",
  returned: "bg-muted text-muted-foreground border-border",
  empty: "bg-muted text-muted-foreground border-border",
};

function Cell({ value, format }) {
  if (value === null || value === undefined || value === "") return <span className="text-muted-foreground">—</span>;
  if (format === "inr") return <span className="tabular-nums">{inr(value)}</span>;
  if (format === "badge") {
    const cls = BADGE[String(value).toLowerCase()] || "bg-muted text-foreground border-border";
    return <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}>{value}</span>;
  }
  return <span>{String(value)}</span>;
}

function Shell({ children, className = "" }) {
  return <div className={`ai-pop-in overflow-hidden rounded-2xl border border-border bg-card shadow-sm ${className}`}>{children}</div>;
}

export function TableBlock({ block, onAction }) {
  const [view, setView] = useState("table");
  const [expanded, setExpanded] = useState(false);
  const rows = block.rows || [];
  const visible = expanded ? rows : rows.slice(0, 8);
  const chart = block.chart && rows.length > 1;
  return (
    <Shell>
      <div className="flex items-center justify-between gap-2 border-b border-border px-3.5 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <Table2 className="h-4 w-4 shrink-0 text-orange-500" />
          <p className="truncate text-sm font-semibold">{block.title}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {chart && (
            <button
              type="button"
              onClick={() => setView((v) => (v === "table" ? "chart" : "table"))}
              className="h-7 rounded-lg px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground flex items-center gap-1"
            >
              {view === "table" ? <BarChart3 className="h-3.5 w-3.5" /> : <Table2 className="h-3.5 w-3.5" />}
              {view === "table" ? "Chart" : "Table"}
            </button>
          )}
          {block.open && (
            <button type="button" onClick={() => onAction({ type: "navigate", to: block.open })} className="h-7 rounded-lg px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground flex items-center gap-1">
              Open <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
      {view === "chart" ? (
        <div className="h-56 px-2 py-3">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={[...rows].slice(0, 15).reverse()}>
              <XAxis dataKey={block.chart.x} tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={50} stroke="currentColor" className="text-muted-foreground" />
              <YAxis tick={{ fontSize: 10 }} width={50} stroke="currentColor" className="text-muted-foreground" tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)} />
              <Tooltip formatter={(v) => inr(v)} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
              <Bar dataKey={block.chart.y} radius={[6, 6, 0, 0]} fill="url(#aiBar)" />
              <defs>
                <linearGradient id="aiBar" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f97316" />
                  <stop offset="100%" stopColor="#a855f7" />
                </linearGradient>
              </defs>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs sm:text-sm">
            <thead>
              <tr className="bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                {block.columns.map((c) => (
                  <th key={c.key} className={`whitespace-nowrap px-3 py-2 font-semibold ${c.align === "right" ? "text-right" : "text-left"}`}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((r, i) => (
                <tr key={r.id || i} className="border-t border-border/60 hover:bg-muted/30">
                  {block.columns.map((c) => (
                    <td key={c.key} className={`px-3 py-2 align-top ${c.align === "right" ? "text-right whitespace-nowrap" : ""} ${c.key === "items" ? "min-w-[180px] text-muted-foreground" : ""}`}>
                      <Cell value={r[c.key]} format={c.format} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {(rows.length > 8 || block.footer) && (
        <div className="flex items-center justify-between gap-2 border-t border-border px-3.5 py-2 text-xs text-muted-foreground">
          <span className="truncate">{block.footer}</span>
          {rows.length > 8 && view === "table" && (
            <button type="button" onClick={() => setExpanded((e) => !e)} className="shrink-0 font-semibold text-orange-500 hover:underline">
              {expanded ? "Show less" : `Show all ${rows.length}`}
            </button>
          )}
        </div>
      )}
    </Shell>
  );
}

export function StatsBlock({ block }) {
  return (
    <Shell className="p-3">
      {block.title && <p className="mb-2 px-0.5 text-xs font-semibold text-muted-foreground">{block.title}</p>}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {block.items.map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-background/60 p-2.5">
            <p className="text-[11px] text-muted-foreground">{s.label}</p>
            <p className="mt-0.5 text-base font-bold tabular-nums sm:text-lg">{s.value}</p>
            {s.hint && <p className="text-[11px] text-muted-foreground truncate">{s.hint}</p>}
          </div>
        ))}
      </div>
    </Shell>
  );
}

function ActionButton({ a, onAction, busy, done, locked }) {
  const style =
    a.style === "primary"
      ? "bg-gradient-to-r from-orange-500 to-pink-500 text-white shadow-md shadow-orange-500/20"
      : a.style === "danger"
      ? "bg-rose-500 text-white"
      : a.style === "secondary"
      ? "border border-border bg-background text-foreground"
      : "text-muted-foreground hover:bg-muted hover:text-foreground";
  return (
    <button
      type="button"
      disabled={a.disabled || busy || done || locked}
      title={locked ? "Wait for the reply to finish" : undefined}
      onClick={() => onAction(a.action, a.label)}
      className={`h-9 rounded-xl px-3.5 text-sm font-semibold transition active:scale-[0.98] disabled:opacity-40 ${style}`}
    >
      {a.label}
    </button>
  );
}

function Actions({ actions = [], onAction, busy, settled, locked }) {
  if (!actions.length) return null;
  if (settled) {
    return (
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Check className="h-3.5 w-3.5 text-emerald-500" /> {settled}
      </p>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      {actions.map((a) => (
        <ActionButton key={a.label} a={a} onAction={onAction} busy={busy} locked={locked} />
      ))}
      {busy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
    </div>
  );
}

// Lines still to pick are listed once, as a count: the picker cards below say which
function MissingChips({ missing }) {
  const toPick = missing.filter((m) => /not found/.test(m));
  const offline = toPick.some((m) => /unreachable/.test(m));
  const rest = missing.filter((m) => !/not found/.test(m));
  const chips = [
    ...(toPick.length
      ? [toPick.length === 1 ? toPick[0].replace(/ \(medicine database unreachable.*?\)/, "") : `${toPick.length} items to pick or add (cards below)`]
      : []),
    ...(offline ? ["Medicine database unreachable right now, so those couldn't be checked"] : []),
    ...rest,
  ];
  return (
    <div className="flex flex-wrap gap-1.5 border-t border-border px-3.5 py-2.5">
      {chips.map((m) => (
        <span key={m} className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-500">
          <AlertTriangle className="h-3 w-3 shrink-0" /> {m}
        </span>
      ))}
    </div>
  );
}

export function DraftBlock({ block, onAction, busy, settled, locked }) {
  const Icon = block.kind === "bill" ? Receipt : ShoppingCart;
  return (
    <Shell className="ai-glow-border">
      <div className="flex items-center gap-2 border-b border-border bg-gradient-to-r from-orange-500/10 via-pink-500/5 to-transparent px-3.5 py-2.5">
        <Icon className="h-4 w-4 text-orange-500" />
        <p className="text-sm font-semibold">{block.title}</p>
        <span className={`ml-auto rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${settled === "Saved" || settled === "Saved as draft" ? "border-emerald-500/30 text-emerald-500" : "border-border text-muted-foreground"}`}>
          {settled || "Not saved yet"}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 px-3.5 py-3 sm:grid-cols-4">
        {block.fields.map((f) => (
          <div key={f.label} className="min-w-0">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{f.label}</p>
            <p className={`truncate text-sm font-medium ${f.missing ? "text-amber-500" : ""}`}>{f.value}</p>
          </div>
        ))}
      </div>
      <div className="overflow-x-auto border-t border-border">
        <table className="w-full text-xs sm:text-sm">
          <thead>
            <tr className="bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
              {block.columns.map((c) => (
                <th key={c.key} className={`whitespace-nowrap px-3 py-2 font-semibold ${c.align === "right" ? "text-right" : "text-left"}`}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((r, i) => (
              <tr key={i} className="border-t border-border/60">
                {block.columns.map((c) => (
                  <td key={c.key} className={`px-3 py-2 ${c.align === "right" ? "text-right whitespace-nowrap" : ""} ${r[c.key] === "?" ? "text-amber-500 font-semibold" : ""}`}>
                    <Cell value={r[c.key]} format={c.format} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {block.missing?.length > 0 && !settled && <MissingChips missing={block.missing} />}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-3.5 py-3">
        <div className="text-sm">
          {block.totals?.map((t) => (
            <span key={t.label} className="mr-3">
              <span className="text-muted-foreground">{t.label} </span>
              <span className="font-bold tabular-nums">{inr(t.value)}</span>
            </span>
          ))}
        </div>
        <Actions actions={block.actions} onAction={onAction} busy={busy} settled={settled} locked={locked} />
      </div>
    </Shell>
  );
}

export function ConfirmBlock({ block, onAction, busy, settled, locked }) {
  const danger = block.tone === "danger";
  return (
    <Shell className={danger ? "border-rose-500/30" : ""}>
      <div className="flex items-start gap-3 px-3.5 py-3">
        <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${danger ? "bg-rose-500/10 text-rose-500" : "bg-orange-500/10 text-orange-500"}`}>
          {danger ? <AlertTriangle className="h-4 w-4" /> : <ClipboardList className="h-4 w-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{block.title}</p>
          {block.text && <p className="mt-0.5 text-xs text-muted-foreground">{block.text}</p>}
          {block.fields && (
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
              {block.fields.map((f) => (
                <div key={f.label} className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{f.label}</p>
                  <p className="truncate text-sm">{f.value}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {block.rows?.length > 0 && (
        <div className="overflow-x-auto border-t border-border">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
                {block.columns.map((c) => (
                  <th key={c.key} className={`px-3 py-1.5 font-semibold ${c.align === "right" ? "text-right" : "text-left"}`}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((r, i) => (
                <tr key={i} className="border-t border-border/60">
                  {block.columns.map((c) => (
                    <td key={c.key} className={`px-3 py-1.5 ${c.align === "right" ? "text-right" : ""}`}>
                      <Cell value={r[c.key]} format={c.format} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="border-t border-border px-3.5 py-2.5">
        <Actions actions={block.actions} onAction={onAction} busy={busy} settled={settled} locked={locked} />
      </div>
    </Shell>
  );
}

export function ResultBlock({ block, onAction }) {
  const tone = block.tone === "success" ? "text-emerald-500 bg-emerald-500/10" : "text-sky-500 bg-sky-500/10";
  return (
    <Shell className="flex flex-wrap items-center gap-3 px-3.5 py-3">
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${tone}`}>
        {block.tone === "success" ? <CheckCircle2 className="h-4 w-4" /> : <Info className="h-4 w-4" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{block.title}</p>
        {block.text && <p className="text-xs text-muted-foreground">{block.text}</p>}
      </div>
      {block.actions?.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {block.actions.map((a) => (
            <button
              key={a.label}
              type="button"
              onClick={() => onAction(a.action, a.label)}
              className="h-8 rounded-lg border border-border bg-background px-3 text-xs font-semibold hover:bg-muted flex items-center gap-1"
            >
              {a.label} <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          ))}
        </div>
      )}
    </Shell>
  );
}

export function NoticeBlock({ block }) {
  const danger = block.tone === "danger";
  return (
    <div className={`ai-pop-in flex items-start gap-2 rounded-xl border px-3 py-2 text-sm ${danger ? "border-rose-500/30 bg-rose-500/10 text-rose-500" : "border-sky-500/30 bg-sky-500/10 text-sky-500"}`}>
      {danger ? <X className="mt-0.5 h-4 w-4 shrink-0" /> : <Info className="mt-0.5 h-4 w-4 shrink-0" />}
      <span>{block.text}</span>
    </div>
  );
}

export function ChoicesBlock({ block, onReply, disabled }) {
  const [pick, setPick] = useState("");
  if (!block.options?.length) return null;
  if (block.style === "dropdown") {
    return (
      <div className="ai-pop-in flex flex-wrap items-center gap-2">
        {block.question && <span className="text-xs text-muted-foreground">{block.question}</span>}
        <div className="relative min-w-[220px] flex-1 sm:flex-none">
          <select
            value={pick}
            disabled={disabled}
            onChange={(e) => setPick(e.target.value)}
            className="h-9 w-full appearance-none rounded-xl border border-border bg-card pl-3 pr-8 text-sm"
          >
            <option value="">Choose an option…</option>
            {block.options.map((o, i) => (
              <option key={i} value={i}>
                {o.label}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        </div>
        <button
          type="button"
          disabled={disabled || pick === ""}
          onClick={() => onReply(block.options[pick].reply, block.options[pick].label)}
          className="h-9 rounded-xl bg-gradient-to-r from-orange-500 to-pink-500 px-3.5 text-sm font-semibold text-white disabled:opacity-40"
        >
          Send
        </button>
      </div>
    );
  }
  return (
    <div className="ai-pop-in flex flex-wrap gap-2">
      {block.question && <p className="w-full text-xs text-muted-foreground">{block.question}</p>}
      {block.options.map((o, i) => (
        <button
          key={i}
          type="button"
          disabled={disabled}
          onClick={() => onReply(o.reply, o.label)}
          className="rounded-full border border-orange-500/30 bg-orange-500/5 px-3 py-1.5 text-xs font-semibold text-orange-500 transition hover:bg-orange-500/15 active:scale-[0.98] disabled:opacity-40 sm:text-sm"
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// "Which medicine is X?" — closest matches from the catalog, then the medicine
// database (or your suppliers, then distributors), a search box, and "add as
// new" last, so new catalog items/suppliers are only created on purpose
const PICK_GROUPS = {
  medicine: [
    { source: "catalog", label: "Your catalog", icon: Package },
    { source: "global", label: "Medicine database", icon: Globe },
  ],
  supplier: [
    { source: "yours", label: "Your suppliers", icon: Truck },
    { source: "global", label: "Distributors", icon: Globe },
  ],
};

export function PickerBlock({ block, onAction, busy, settled, locked }) {
  const [q, setQ] = useState(block.query || "");
  const [options, setOptions] = useState(block.options || []);
  const [offline, setOffline] = useState(!!block.offline);
  const [state, setState] = useState("idle"); // idle | loading | error
  const [retry, setRetry] = useState(0);
  const [picked, setPicked] = useState(null);
  const done = settled || picked;

  useEffect(() => {
    const term = q.trim();
    // Empty box or the card's own query: the server's matches for it
    if (term.length < 2 || term === (block.query || "").trim()) {
      setOptions(block.options || []);
      setState("idle");
      return;
    }
    let alive = true;
    setState("loading");
    const t = setTimeout(() => {
      assistantApi
        .lookup(block.kind, term)
        .then((r) => {
          if (!alive) return;
          setOptions(r.options || []);
          if (block.kind === "medicine") setOffline(!!r.medicine_db_offline);
          setState("idle");
        })
        .catch(() => alive && setState("error"));
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q, block.kind, block.query, block.options, retry]);

  const choose = (pick) => {
    if (locked || busy) return;
    setPicked(pick.name);
    onAction(
      { type: "op", op: "resolve_purchase_line", draft_id: block.draft_id, target: block.target, line: block.line, pick },
      pick.source === "new" ? `Add ${pick.name} as new` : `Use ${pick.name}`,
      (ok) => !ok && setPicked(null) // didn't go through: let them pick again
    );
  };
  const newName = (q.trim() || block.new_name || "").slice(0, 80);
  const groups = PICK_GROUPS[block.kind] || PICK_GROUPS.medicine;
  const disabled = busy || locked;
  const loading = state === "loading";

  return (
    <Shell>
      <div className="flex items-center gap-2 border-b border-border bg-gradient-to-r from-sky-500/10 via-violet-500/5 to-transparent px-3.5 py-2.5">
        <Search className="h-4 w-4 shrink-0 text-sky-500" />
        <p className="min-w-0 flex-1 truncate text-sm font-semibold" title={block.title}>{block.title}</p>
        {done && (
          <span className="shrink-0 rounded-full border border-emerald-500/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-500">
            {picked ? "Picked" : settled}
          </span>
        )}
      </div>
      {done ? (
        picked && (
          <p className="flex items-center gap-2 px-3.5 py-2.5 text-sm text-muted-foreground">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4 text-emerald-500" />}
            {picked}
          </p>
        )
      ) : (
        <div className="space-y-2 p-3">
          {offline && block.kind === "medicine" && (
            <p className="flex items-start gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-xs text-amber-600 dark:text-amber-400">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              The medicine database can't be reached right now, so only your catalog is searched. If you're unsure, save the purchase as a draft and finish it later.
            </p>
          )}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={block.kind === "supplier" ? "Search suppliers and distributors" : "Search your catalog and medicine database"}
              className="h-10 w-full rounded-xl border border-border bg-background pl-9 pr-9 text-sm outline-none focus:border-orange-500/60 focus:ring-2 focus:ring-orange-500/15"
            />
            {loading && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-orange-500" />}
          </div>
          <div className={`max-h-72 space-y-2 overflow-y-auto transition-opacity ${loading ? "opacity-50" : ""}`}>
            {groups.map((g) => {
              const list = options.filter((o) => o.source === g.source);
              if (!list.length) return null;
              const Icon = g.icon;
              return (
                <div key={g.source}>
                  <p className="mb-1 flex items-center gap-1.5 px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <Icon className="h-3 w-3" /> {g.label}
                  </p>
                  <div className="overflow-hidden rounded-xl border border-border">
                    {list.map((o, i) => (
                      <button
                        key={`${o.source}:${o.id || o.name}:${i}`}
                        type="button"
                        disabled={disabled}
                        onClick={() => choose({ source: o.source, id: o.id, name: o.name })}
                        className="flex w-full items-center gap-3 border-b border-border px-3 py-2 text-left last:border-b-0 hover:bg-muted/60 disabled:opacity-50"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{o.name}</span>
                          {o.detail && <span className="block truncate text-xs text-muted-foreground">{o.detail}</span>}
                        </span>
                        <Check className="h-4 w-4 shrink-0 text-muted-foreground/40" />
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
            {loading && !options.length && (
              <div className="space-y-1.5">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-11 animate-pulse rounded-xl bg-muted/60" />
                ))}
              </div>
            )}
            {state === "error" && (
              <p className="flex items-center gap-2 px-1 py-2 text-xs text-rose-500">
                Search failed.
                <button type="button" onClick={() => setRetry((n) => n + 1)} className="font-semibold underline">
                  Try again
                </button>
              </p>
            )}
            {state === "idle" && !options.length && (
              <p className="px-1 py-2 text-xs text-muted-foreground">
                {offline && block.kind === "medicine" ? "Not in your catalog." : `No match in your ${block.kind === "supplier" ? "suppliers or the distributor directory" : "catalog or the medicine database"}.`}
              </p>
            )}
          </div>
          {newName && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => choose({ source: "new", name: newName })}
              className="flex w-full items-center gap-2 rounded-xl border border-dashed border-orange-500/40 bg-orange-500/5 px-3 py-2 text-left text-sm font-semibold text-orange-500 hover:bg-orange-500/10 disabled:opacity-50"
            >
              <Plus className="h-4 w-4 shrink-0" />
              <span className="min-w-0 truncate">
                Add "{newName}" as a new {block.kind === "supplier" ? "supplier" : "item"}
              </span>
            </button>
          )}
          {locked && <p className="px-1 text-[11px] text-muted-foreground">You can pick once the reply finishes.</p>}
        </div>
      )}
    </Shell>
  );
}
