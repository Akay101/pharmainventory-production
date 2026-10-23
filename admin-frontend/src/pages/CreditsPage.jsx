import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Coins, Loader2, Save, Search, Plus, Minus, CalendarClock, History, Trash2, TrendingUp, Cpu, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { AdminAPI, apiError } from "../api";
import BottomDrawer from "../components/BottomDrawer";
import { useAuth } from "../context/AuthContext";

const PLAN_CODES = ["BASIC", "ADVANCED", "AGENTIC"];
const rupees = (n, d = 2) => `₹${(Number(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: d, minimumFractionDigits: d > 2 ? 0 : 0 })}`;
const cr = (n) => (Number(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: 1 });
const fmtDateTime = (d) => (d ? new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
const TASK_LABEL = { question: "Questions", lookup: "Lookups", report: "Reports", action: "Records", photo: "Photos in chat", voice: "Voice replies", scan: "Scans" };
const ENGINE_LABEL = { pro: "Precision", swift: "Swift" };
const TYPE_LABEL = {
  DAILY: "Daily credits",
  USAGE: "Used",
  FREE_USAGE: "Free (light mode)",
  PURCHASE: "Bought",
  ADMIN_GRANT: "Granted by admin",
  ADMIN_REMOVE: "Removed by admin",
  DAILY_OVERRIDE: "Daily allowance changed",
};

const inputCls = "w-full h-9 px-3 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:bg-slate-50";
function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && <span className="mt-1 block text-[11px] text-slate-400">{hint}</span>}
    </label>
  );
}
const Card = ({ title, icon: Icon, children, action }) => (
  <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
    <div className="flex items-center justify-between gap-3 mb-4">
      <h3 className="font-black text-slate-900 flex items-center gap-2">
        {Icon && <Icon className="w-4 h-4 text-orange-500" />} {title}
      </h3>
      {action}
    </div>
    {children}
  </div>
);

// ---------- Summary ----------
function Summary({ days, setDays, activeEnv }) {
  const [s, setS] = useState(null);
  useEffect(() => {
    setS(null);
    AdminAPI.getCreditSummary({ days })
      .then((r) => setS(r.data))
      .catch((err) => toast.error(apiError(err, "Couldn't load usage")));
  }, [days, activeEnv]);
  const margin = s ? s.credits_used_value_inr - s.charged_cost_inr : 0;
  return (
    <Card
      title="Cost and usage"
      icon={TrendingUp}
      action={
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="h-8 px-2 rounded-lg border border-slate-200 text-xs font-bold">
          {[1, 7, 30, 90].map((d) => (
            <option key={d} value={d}>
              Last {d} day{d > 1 ? "s" : ""}
            </option>
          ))}
        </select>
      }
    >
      {!s ? (
        <div className="py-6 flex justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              ["AI cost to us", rupees(s.ai_cost_inr), `${s.requests} requests`],
              ["Credits used (value)", rupees(s.credits_used_value_inr), `${cr(s.credits_used)} credits`],
              ["Margin on charged use", rupees(margin), s.charged_cost_inr ? `${Math.round((margin / s.charged_cost_inr) * 100)}% over cost` : "—"],
              ["Credit pack sales", rupees(s.pack_revenue_inr), `${s.pack_orders} orders`],
              ["Free light mode cost", rupees(s.free_cost_inr), `${s.free_requests} requests`],
              ["Daily credits given", cr(s.daily_credits_given), "credits"],
              ["Credits bought", cr(s.credits_purchased), "credits"],
              ["Credits granted", cr(s.credits_granted), "credits"],
            ].map(([k, v, sub]) => (
              <div key={k} className="rounded-xl border border-slate-200 p-3">
                <div className="text-[11px] font-bold uppercase text-slate-500">{k}</div>
                <div className="text-lg font-black text-slate-900">{v}</div>
                <div className="text-[11px] text-slate-400">{sub}</div>
              </div>
            ))}
          </div>
          {s.by_task.length > 0 && (
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-500 uppercase text-[10px]">
                  <tr>
                    <th className="text-left p-2">Task</th>
                    <th className="text-left p-2">Engine</th>
                    <th className="text-right p-2">Requests</th>
                    <th className="text-right p-2">Avg credits</th>
                    <th className="text-right p-2">Credits</th>
                    <th className="text-right p-2">AI cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {s.by_task
                    .sort((a, b) => b.cost_inr - a.cost_inr)
                    .map((r, i) => (
                      <tr key={i}>
                        <td className="p-2 font-bold">
                          {TASK_LABEL[r.task] || r.task || "—"}
                          {r.free && <span className="ml-1 text-[10px] text-amber-600">(free)</span>}
                        </td>
                        <td className="p-2">{ENGINE_LABEL[r.engine] || r.engine}</td>
                        <td className="p-2 text-right">{r.requests}</td>
                        <td className="p-2 text-right">{r.free ? "—" : cr(r.avg_credits)}</td>
                        <td className="p-2 text-right">{r.free ? "—" : cr(r.credits)}</td>
                        <td className="p-2 text-right font-bold">{rupees(r.cost_inr, 4)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// ---------- Settings ----------
function Settings({ canEdit, activeEnv }) {
  const [data, setData] = useState(null);
  const [cfg, setCfg] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showPrices, setShowPrices] = useState(false);

  const load = useCallback(() => {
    AdminAPI.getCreditConfig()
      .then((r) => {
        setData(r.data);
        setCfg(JSON.parse(JSON.stringify(r.data.config)));
      })
      .catch((err) => toast.error(apiError(err, "Couldn't load credit settings")));
  }, []);
  useEffect(() => {
    setData(null);
    load();
  }, [load, activeEnv]);

  const set = (path, value) =>
    setCfg((c) => {
      const next = JSON.parse(JSON.stringify(c));
      const keys = path.split(".");
      let o = next;
      keys.slice(0, -1).forEach((k) => (o = o[k]));
      o[keys[keys.length - 1]] = value;
      return next;
    });
  const num = (v) => (v === "" || v === null ? "" : Number(v));

  // Live: what ₹10 of AI cost becomes, and each pack's credits
  const preview = useMemo(() => {
    if (!cfg) return null;
    const value = (cfg.credit_value_paise || 1) / 100;
    const credits = (10 * (1 + (cfg.margin_percent || 0) / 100)) / value;
    const packs = (cfg.packs || []).map((p) => {
      const base = p.credits === null || p.credits === "" || p.credits === undefined ? Math.floor(p.price_paise / (1 + (cfg.gst_percent || 0) / 100) / (cfg.credit_value_paise || 1)) : Number(p.credits);
      return { id: p.id, credits: base + (Number(p.bonus_credits) || 0) };
    });
    return { credits: Math.ceil(credits * 10) / 10, value, packs };
  }, [cfg]);

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        ...cfg,
        credit_value_paise: Number(cfg.credit_value_paise),
        margin_percent: Number(cfg.margin_percent),
        usd_inr: Number(cfg.usd_inr),
        gst_percent: Number(cfg.gst_percent),
        min_charge_credits: Number(cfg.min_charge_credits),
        trial_daily_credits: Number(cfg.trial_daily_credits),
        daily_credits: Object.fromEntries(PLAN_CODES.map((p) => [p, Number(cfg.daily_credits[p]) || 0])),
        free_mode: { enabled: !!cfg.free_mode.enabled, messages_per_day: Number(cfg.free_mode.messages_per_day) || 0 },
        packs: cfg.packs.map((p) => ({
          id: String(p.id).trim(),
          label: String(p.label).trim(),
          price_paise: Math.round(Number(p.price_paise)),
          credits: p.credits === "" || p.credits === null || p.credits === undefined ? null : Number(p.credits),
          bonus_credits: Number(p.bonus_credits) || 0,
          active: p.active !== false,
        })),
        model_prices: Object.fromEntries(
          Object.entries(cfg.model_prices).map(([m, rows]) => [m, rows.map((r) => ({ from: r.from, input: Number(r.input), cached: Number(r.cached), output: Number(r.output) }))])
        ),
      };
      delete payload._id;
      delete payload.updated_at;
      delete payload.updated_by;
      await AdminAPI.updateCreditConfig(payload);
      toast.success("Credit settings saved. The app uses them within 30 seconds.");
      load();
    } catch (err) {
      toast.error(apiError(err, "Couldn't save"));
    } finally {
      setSaving(false);
    }
  };

  if (!cfg)
    return (
      <Card title="Credit settings" icon={Coins}>
        <div className="py-6 flex justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
        </div>
      </Card>
    );
  const dis = !canEdit;
  return (
    <Card
      title="Credit settings"
      icon={Coins}
      action={
        canEdit && (
          <button type="button" onClick={save} disabled={saving} className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-extrabold text-white bg-brand-500 hover:bg-brand-600 rounded-xl disabled:opacity-40">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save
          </button>
        )
      }
    >
      <div className="space-y-5">
        <div className="rounded-xl bg-orange-50 border border-orange-100 p-3 text-xs text-orange-800">
          1 credit = <b>₹{preview.value.toFixed(2)}</b>. ₹10 of AI cost uses <b>{preview.credits} credits</b> (₹{(preview.credits * preview.value).toFixed(2)}) at {cfg.margin_percent}% margin.
          {data.updated_by && <span className="block text-orange-600/80 mt-1">Last saved by {data.updated_by} · {fmtDateTime(data.updated_at)}</span>}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Field label="Credit value (paise)" hint="Price of 1 credit">
            <input type="number" className={inputCls} disabled={dis} value={cfg.credit_value_paise} onChange={(e) => set("credit_value_paise", num(e.target.value))} />
          </Field>
          <Field label="Margin %" hint="On top of AI cost">
            <input type="number" className={inputCls} disabled={dis} value={cfg.margin_percent} onChange={(e) => set("margin_percent", num(e.target.value))} />
          </Field>
          <Field label="USD → INR" hint="For AI prices in $">
            <input type="number" className={inputCls} disabled={dis} value={cfg.usd_inr} onChange={(e) => set("usd_inr", num(e.target.value))} />
          </Field>
          <Field label="GST % on packs" hint="Pack prices include it">
            <input type="number" className={inputCls} disabled={dis} value={cfg.gst_percent} onChange={(e) => set("gst_percent", num(e.target.value))} />
          </Field>
          <Field label="Min charge" hint="Credits per request">
            <input type="number" step="0.1" className={inputCls} disabled={dis} value={cfg.min_charge_credits} onChange={(e) => set("min_charge_credits", num(e.target.value))} />
          </Field>
        </div>

        <div>
          <h4 className="text-xs font-black text-slate-800 mb-2">Daily credits (refilled every day, India time; unused don't carry over)</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {PLAN_CODES.map((p) => (
              <Field key={p} label={`${p} plan`}>
                <input type="number" className={inputCls} disabled={dis} value={cfg.daily_credits[p]} onChange={(e) => set(`daily_credits.${p}`, num(e.target.value))} />
              </Field>
            ))}
            <Field label="Free trial">
              <input type="number" className={inputCls} disabled={dis} value={cfg.trial_daily_credits} onChange={(e) => set("trial_daily_credits", num(e.target.value))} />
            </Field>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-slate-200 p-3 space-y-2">
            <h4 className="text-xs font-black text-slate-800">When credits run out</h4>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" disabled={dis} checked={!!cfg.free_mode.enabled} onChange={(e) => set("free_mode.enabled", e.target.checked)} />
              Allow light mode (questions, lookups, reports on Swift)
            </label>
            <Field label="Free light messages per day, per pharmacy">
              <input type="number" className={inputCls} disabled={dis || !cfg.free_mode.enabled} value={cfg.free_mode.messages_per_day} onChange={(e) => set("free_mode.messages_per_day", num(e.target.value))} />
            </Field>
          </div>
          <div className="rounded-xl border border-slate-200 p-3 space-y-2">
            <h4 className="text-xs font-black text-slate-800">Engines users can pick</h4>
            {["pro", "swift"].map((e) => (
              <label key={e} className="flex items-center gap-2 text-sm">
                <input type="checkbox" disabled={dis} checked={cfg.engines[e].enabled !== false} onChange={(ev) => set(`engines.${e}.enabled`, ev.target.checked)} />
                <b>{ENGINE_LABEL[e]}</b> <span className="text-slate-400 text-xs">({e === "pro" ? "Gemini first, Groq fallback" : "Groq first, Gemini fallback"})</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-black text-slate-800">Credit packs (Cashfree)</h4>
            {canEdit && cfg.packs.length < 8 && (
              <button type="button" onClick={() => set("packs", [...cfg.packs, { id: `pack_${Date.now().toString(36).slice(-4)}`, label: "New pack", price_paise: 9900, credits: null, bonus_credits: 0, active: true }])} className="text-xs font-bold text-brand-600 flex items-center gap-1">
                <Plus className="w-3.5 h-3.5" /> Add pack
              </button>
            )}
          </div>
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-xs min-w-[640px]">
              <thead className="bg-slate-50 text-slate-500 uppercase text-[10px]">
                <tr>
                  <th className="text-left p-2">Id</th>
                  <th className="text-left p-2">Label</th>
                  <th className="text-left p-2">Price ₹ (incl. GST)</th>
                  <th className="text-left p-2">Credits (blank = auto)</th>
                  <th className="text-left p-2">Bonus</th>
                  <th className="text-left p-2">User gets</th>
                  <th className="p-2">On</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cfg.packs.map((p, i) => (
                  <tr key={i}>
                    <td className="p-1.5"><input className={inputCls} disabled={dis} value={p.id} onChange={(e) => set(`packs.${i}.id`, e.target.value)} /></td>
                    <td className="p-1.5"><input className={inputCls} disabled={dis} value={p.label} onChange={(e) => set(`packs.${i}.label`, e.target.value)} /></td>
                    <td className="p-1.5"><input type="number" className={inputCls} disabled={dis} value={p.price_paise / 100} onChange={(e) => set(`packs.${i}.price_paise`, Math.round(Number(e.target.value) * 100))} /></td>
                    <td className="p-1.5"><input type="number" className={inputCls} disabled={dis} value={p.credits ?? ""} placeholder="auto" onChange={(e) => set(`packs.${i}.credits`, e.target.value === "" ? null : Number(e.target.value))} /></td>
                    <td className="p-1.5"><input type="number" className={inputCls} disabled={dis} value={p.bonus_credits || 0} onChange={(e) => set(`packs.${i}.bonus_credits`, Number(e.target.value))} /></td>
                    <td className="p-1.5 font-black text-slate-900 whitespace-nowrap">{cr(preview.packs[i]?.credits)} credits</td>
                    <td className="p-1.5 text-center"><input type="checkbox" disabled={dis} checked={p.active !== false} onChange={(e) => set(`packs.${i}.active`, e.target.checked)} /></td>
                    <td className="p-1.5">
                      {canEdit && cfg.packs.length > 1 && (
                        <button type="button" onClick={() => set("packs", cfg.packs.filter((_, j) => j !== i))} className="text-slate-400 hover:text-rose-500" aria-label="Remove pack">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <button type="button" onClick={() => setShowPrices((v) => !v)} className="text-xs font-black text-slate-800 flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5" /> AI model prices (USD per 1M tokens) {showPrices ? "▾" : "▸"}
          </button>
          {showPrices && (
            <div className="mt-2 space-y-2">
              <p className="text-[11px] text-slate-500 flex items-start gap-1">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" /> Keep these in line with Google and Groq pricing. A row's "from" date is when it starts (Gemini prices double on 2027-01-01).
              </p>
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-xs min-w-[620px]">
                  <thead className="bg-slate-50 text-slate-500 uppercase text-[10px]">
                    <tr>
                      <th className="text-left p-2">Model</th>
                      <th className="text-left p-2">From</th>
                      <th className="text-left p-2">Input</th>
                      <th className="text-left p-2">Cached input</th>
                      <th className="text-left p-2">Output</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {Object.entries(cfg.model_prices).map(([model, rows]) =>
                      rows.map((r, j) => (
                        <tr key={`${model}-${j}`}>
                          <td className="p-1.5 font-mono text-[11px]">{j === 0 ? model : ""}</td>
                          {["from", "input", "cached", "output"].map((k) => (
                            <td key={k} className="p-1.5">
                              <input type={k === "from" ? "date" : "number"} step="0.001" className={inputCls} disabled={dis} value={r[k]} onChange={(e) => set(`model_prices.${model}.${j}.${k}`, k === "from" ? e.target.value : e.target.value)} />
                            </td>
                          ))}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

// ---------- Wallet drawers ----------
function AdjustDrawer({ row, kind, onClose, onDone }) {
  const [credits, setCredits] = useState(kind === "daily" ? row?.daily_override ?? "" : "");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  if (!row) return null;
  const title = kind === "grant" ? "Grant credits" : kind === "remove" ? "Remove credits" : "Daily credits for this pharmacy";
  const submit = async () => {
    setBusy(true);
    try {
      if (kind === "grant") await AdminAPI.grantCredits(row.pharmacy_id, { credits: Number(credits), reason });
      else if (kind === "remove") {
        const r = await AdminAPI.removeCredits(row.pharmacy_id, { credits: Number(credits), reason });
        if (r.data.removed < Number(credits)) toast.info(`Only ${cr(r.data.removed)} credits were in the balance; removed those.`);
      } else await AdminAPI.setDailyCredits(row.pharmacy_id, { credits: credits === "" ? null : Number(credits), reason });
      toast.success("Done");
      onDone();
      onClose();
    } catch (err) {
      toast.error(apiError(err, "Couldn't update credits"));
    } finally {
      setBusy(false);
    }
  };
  const valid = kind === "daily" ? credits === "" || Number(credits) >= 0 : Number(credits) > 0 && reason.trim().length >= 3;
  return (
    <BottomDrawer isOpen onClose={onClose} title={title} subtitle={row.pharmacy_name} maxWidth="max-w-md">
      <div className="space-y-3">
        <p className="text-xs text-slate-500">
          Balance <b>{cr(row.balance)}</b> · today {cr(row.daily_remaining)} / {cr(row.daily_allowance)} daily
          {kind === "remove" && " · only the balance (bought + granted) can be removed, never below zero"}
        </p>
        <Field label={kind === "daily" ? "Credits per day (blank = plan default)" : "Credits"} hint={kind === "daily" ? "Applies from today; today's remaining changes by the difference" : undefined}>
          <input type="number" min="0" className={inputCls} value={credits} onChange={(e) => setCredits(e.target.value)} autoFocus />
        </Field>
        <Field label={kind === "daily" ? "Reason (optional)" : "Reason (shown in the history)"}>
          <input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={kind === "grant" ? "e.g. Goodwill for downtime" : ""} />
        </Field>
        <button type="button" disabled={busy || !valid} onClick={submit} className="w-full h-10 rounded-xl text-sm font-extrabold text-white bg-brand-500 hover:bg-brand-600 disabled:opacity-40 flex items-center justify-center gap-2">
          {busy && <Loader2 className="w-4 h-4 animate-spin" />} {title}
        </button>
      </div>
    </BottomDrawer>
  );
}

function LedgerDrawer({ row, onClose }) {
  const [d, setD] = useState(null);
  useEffect(() => {
    if (!row) return;
    setD(null);
    AdminAPI.getCreditWallet(row.pharmacy_id)
      .then((r) => setD(r.data))
      .catch((err) => toast.error(apiError(err, "Couldn't load history")));
  }, [row]);
  if (!row) return null;
  return (
    <BottomDrawer isOpen onClose={onClose} title="Credit history" subtitle={row.pharmacy_name} maxWidth="max-w-2xl">
      {!d ? (
        <div className="py-10 flex justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
        </div>
      ) : (
        <div className="space-y-3 text-xs">
          <div className="grid grid-cols-3 gap-2">
            {[
              ["Available", d.wallet.available],
              ["Bought (all time)", d.totals.purchased || 0],
              ["Used (all time)", d.totals.used || 0],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl border border-slate-200 p-2">
                <div className="text-[10px] uppercase text-slate-500 font-bold">{k}</div>
                <div className="font-black text-slate-900 text-base">{cr(v)}</div>
              </div>
            ))}
          </div>
          <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl">
            {d.ledger.length === 0 && <p className="p-3 text-slate-400">No credit activity yet.</p>}
            {d.ledger.map((l) => (
              <div key={l.id} className="p-2.5 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-bold text-slate-800">
                    {TYPE_LABEL[l.type] || l.type}
                    {l.task ? ` · ${TASK_LABEL[l.task] || l.task}` : ""}
                    {l.engine ? ` · ${ENGINE_LABEL[l.engine] || l.engine}` : ""}
                    {l.fallback ? " · fallback" : ""}
                  </div>
                  <div className="text-slate-500 truncate">
                    {fmtDateTime(l.created_at)}
                    {l.note ? ` · ${l.note}` : ""}
                    {l.actor ? ` · by ${l.actor}` : ""}
                    {l.cost_inr !== null && l.cost_inr !== undefined ? ` · cost ${rupees(l.cost_inr, 4)}` : ""}
                  </div>
                </div>
                <span className={`font-black whitespace-nowrap ${l.credits > 0 ? "text-emerald-600" : l.credits < 0 ? "text-slate-900" : "text-slate-400"}`}>
                  {l.credits > 0 ? "+" : ""}
                  {cr(l.credits)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </BottomDrawer>
  );
}

// ---------- Page ----------
export default function CreditsPage({ activeEnv }) {
  const { user } = useAuth();
  const canEdit = user?.role === "SUPERADMIN";
  const [days, setDays] = useState(30);
  const [rows, setRows] = useState(null);
  const [search, setSearch] = useState("");
  const [drawer, setDrawer] = useState(null); // { kind, row }

  const load = useCallback(() => {
    AdminAPI.getCreditWallets({ days, search: search || undefined })
      .then((r) => setRows(r.data.rows))
      .catch((err) => toast.error(apiError(err, "Couldn't load wallets")));
  }, [days, search]);
  useEffect(() => {
    const t = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, search, activeEnv]);

  return (
    <div className="space-y-5">
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center">
            <Coins className="w-4 h-4" />
          </div>
          <h2 className="text-xl font-black text-slate-900 tracking-tight">AI Credits</h2>
          <span className="ml-1 px-2 py-0.5 rounded-lg bg-slate-900 text-white text-[10px] font-black uppercase">{activeEnv}</span>
        </div>
        <p className="text-xs text-slate-500 mt-1">
          What AI costs, what it earns, and every pharmacy's credits. {!canEdit && "Only superadmins can change settings or credits."}
        </p>
      </div>

      <Summary days={days} setDays={setDays} activeEnv={activeEnv} />
      <Settings canEdit={canEdit} activeEnv={activeEnv} />

      <Card title="Pharmacy wallets" icon={CalendarClock}>
        <div className="relative mb-3">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className={`${inputCls} pl-9`} placeholder="Search pharmacy or owner email" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {!rows ? (
          <div className="py-6 flex justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
          </div>
        ) : (
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-xs min-w-[860px]">
              <thead className="bg-slate-50 text-slate-500 uppercase text-[10px]">
                <tr>
                  <th className="text-left p-2">Pharmacy</th>
                  <th className="text-left p-2">Plan</th>
                  <th className="text-right p-2">Balance</th>
                  <th className="text-right p-2">Today (daily)</th>
                  <th className="text-right p-2">Used {days}d</th>
                  <th className="text-right p-2">AI cost {days}d</th>
                  <th className="text-right p-2">Free msgs today</th>
                  <th className="text-right p-2">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-4 text-center text-slate-400">
                      No pharmacies found.
                    </td>
                  </tr>
                )}
                {rows.map((r) => (
                  <tr key={r.pharmacy_id}>
                    <td className="p-2">
                      <div className="font-bold text-slate-900">{r.pharmacy_name}</div>
                      <div className="text-slate-400">{r.owner?.email || "—"}</div>
                    </td>
                    <td className="p-2">
                      {r.plan || "—"}
                      {r.plan_kind === "TRIAL" && <span className="ml-1 text-[10px] text-amber-600">trial</span>}
                      {r.plan && !r.plan_active && <span className="ml-1 text-[10px] text-rose-500">expired</span>}
                    </td>
                    <td className="p-2 text-right font-black">{cr(r.balance)}</td>
                    <td className="p-2 text-right">
                      {cr(r.daily_remaining)} / {cr(r.daily_allowance)}
                      {r.daily_override !== null && <span className="block text-[10px] text-brand-600">custom {cr(r.daily_override)}/day</span>}
                    </td>
                    <td className="p-2 text-right">{cr(r.stats.used_credits)}</td>
                    <td className="p-2 text-right">{rupees(r.stats.cost_inr + r.stats.free_cost_inr, 2)}</td>
                    <td className="p-2 text-right">{r.free_used_today}</td>
                    <td className="p-2">
                      <div className="flex justify-end gap-1">
                        <button type="button" title="History" onClick={() => setDrawer({ kind: "ledger", row: r })} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
                          <History className="w-4 h-4" />
                        </button>
                        {canEdit && (
                          <>
                            <button type="button" title="Grant credits" onClick={() => setDrawer({ kind: "grant", row: r })} className="p-1.5 rounded-lg hover:bg-emerald-50 text-emerald-600">
                              <Plus className="w-4 h-4" />
                            </button>
                            <button type="button" title="Remove credits" onClick={() => setDrawer({ kind: "remove", row: r })} className="p-1.5 rounded-lg hover:bg-rose-50 text-rose-500">
                              <Minus className="w-4 h-4" />
                            </button>
                            <button type="button" title="Daily credits" onClick={() => setDrawer({ kind: "daily", row: r })} className="p-1.5 rounded-lg hover:bg-orange-50 text-orange-600">
                              <CalendarClock className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {drawer?.kind === "ledger" && <LedgerDrawer row={drawer.row} onClose={() => setDrawer(null)} />}
      {drawer && drawer.kind !== "ledger" && <AdjustDrawer row={drawer.row} kind={drawer.kind} onClose={() => setDrawer(null)} onDone={load} />}
    </div>
  );
}
