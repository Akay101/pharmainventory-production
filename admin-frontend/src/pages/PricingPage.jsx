import React, { useCallback, useEffect, useState } from "react";
import { BadgePercent, Gift, IndianRupee, Loader2, Plus, Save, Star, Tag, Trash2, AlertTriangle, EyeOff, Eye } from "lucide-react";
import { toast } from "sonner";
import { AdminAPI, apiError } from "../api";
import { useAuth } from "../context/AuthContext";

const PLAN_CODES = ["BASIC", "ADVANCED", "AGENTIC"];

// <input type="datetime-local"> works in local time; the API wants ISO/UTC
const toLocalInput = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const fromLocalInput = (v) => (v ? new Date(v).toISOString() : null);

const rupees = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

function Card({ title, icon: Icon, subtitle, children, right }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs">
      <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center shrink-0">
            <Icon className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-black text-slate-900">{title}</h3>
            {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
        </div>
        {right}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

const inputCls =
  "w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl focus:border-brand-500 focus:outline-none disabled:bg-slate-50 disabled:text-slate-400";
const labelCls = "text-[11px] font-bold text-slate-500 uppercase tracking-wide";

function PlanEditor({ plan, offer, canEdit, onSaved }) {
  const [form, setForm] = useState(plan);
  const [saving, setSaving] = useState(false);
  useEffect(() => setForm(plan), [plan]);

  const dirty = JSON.stringify(form) !== JSON.stringify(plan);
  const offerLive =
    offer?.enabled &&
    (!offer.plans?.length || offer.plans.includes(plan.code)) &&
    (!offer.ends_at || new Date(offer.ends_at) > new Date()) &&
    (!offer.starts_at || new Date(offer.starts_at) <= new Date());
  const afterOffer = offerLive
    ? offer.type === "PERCENT"
      ? form.price_rupees * (1 - offer.value / 100)
      : Math.max(0, form.price_rupees - offer.value)
    : null;

  const save = async () => {
    setSaving(true);
    try {
      await AdminAPI.updatePlan(plan.code, {
        name: form.name.trim(),
        description: form.description.trim(),
        features: form.features.map((f) => f.trim()).filter(Boolean),
        price_rupees: Number(form.price_rupees),
        duration_days: Number(form.duration_days),
        is_active: form.is_active,
        highlight: form.highlight,
      });
      toast.success(`${form.name} saved. Live on the upgrade page within 30 seconds.`);
      onSaved();
    } catch (err) {
      toast.error(apiError(err, "Couldn't save plan"));
    } finally {
      setSaving(false);
    }
  };

  const setFeature = (i, v) => setForm((f) => ({ ...f, features: f.features.map((x, j) => (j === i ? v : x)) }));

  return (
    <div className={`rounded-2xl border p-4 space-y-3 ${form.is_active ? "border-slate-200" : "border-dashed border-slate-300 bg-slate-50/60"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-[11px] font-black text-slate-400">{plan.code}</span>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
            <input
              type="checkbox"
              checked={form.highlight}
              disabled={!canEdit}
              onChange={(e) => setForm({ ...form, highlight: e.target.checked })}
            />
            <Star className="w-3.5 h-3.5 text-amber-500" /> Popular
          </label>
          <label className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
            <input
              type="checkbox"
              checked={form.is_active}
              disabled={!canEdit}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
            />
            On sale
          </label>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Display name</label>
          <input className={inputCls} value={form.name} disabled={!canEdit} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <label className={labelCls}>Price / year (₹)</label>
          <input
            className={inputCls}
            type="number"
            min="1"
            step="1"
            value={form.price_rupees}
            disabled={!canEdit}
            onChange={(e) => setForm({ ...form, price_rupees: e.target.value === "" ? "" : Number(e.target.value) })}
          />
        </div>
      </div>
      <div>
        <label className={labelCls}>Description</label>
        <input className={inputCls} value={form.description} disabled={!canEdit} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <label className={labelCls}>Features</label>
        {form.features.map((f, i) => (
          <div key={i} className="flex gap-1.5">
            <input className={inputCls} value={f} disabled={!canEdit} onChange={(e) => setFeature(i, e.target.value)} />
            {canEdit && (
              <button
                onClick={() => setForm({ ...form, features: form.features.filter((_, j) => j !== i) })}
                className="p-2 text-slate-400 hover:text-rose-600 rounded-lg"
                aria-label="Remove feature"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}
        {canEdit && form.features.length < 12 && (
          <button
            onClick={() => setForm({ ...form, features: [...form.features, ""] })}
            className="flex items-center gap-1 text-xs font-bold text-brand-600 hover:text-brand-700"
          >
            <Plus className="w-3.5 h-3.5" /> Add feature
          </button>
        )}
      </div>
      <div className="flex items-center justify-between pt-1">
        <p className="text-xs text-slate-500 font-semibold">
          {afterOffer !== null ? (
            <>
              Customers pay <span className="text-emerald-600 font-black">{rupees(afterOffer)}</span>{" "}
              <span className="line-through">{rupees(form.price_rupees)}</span> with the live offer
            </>
          ) : (
            <>Customers pay {rupees(form.price_rupees)} / year</>
          )}
        </p>
        {canEdit && (
          <button
            onClick={save}
            disabled={!dirty || saving || !form.price_rupees}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-extrabold text-white bg-brand-500 hover:bg-brand-600 rounded-xl disabled:opacity-40"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save
          </button>
        )}
      </div>
    </div>
  );
}

export default function PricingPage({ activeEnv }) {
  const { user } = useAuth();
  const canEdit = user?.role === "SUPERADMIN";
  const [data, setData] = useState(null);
  const [offer, setOffer] = useState(null);
  const [trial, setTrial] = useState(null);
  const [savingOffer, setSavingOffer] = useState(false);
  const [savingTrial, setSavingTrial] = useState(false);
  const [display, setDisplay] = useState(null);
  const [savingDisplay, setSavingDisplay] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await AdminAPI.getPricing();
      setData(res.data);
      setOffer(res.data.offer);
      setTrial(res.data.trial);
      setDisplay(res.data.display || { hide_prices: false, label: "Launching soon" });
    } catch (err) {
      toast.error(apiError(err, "Couldn't load pricing"));
    }
  }, []);

  useEffect(() => {
    setData(null);
    load();
  }, [load, activeEnv]);

  const saveOffer = async () => {
    setSavingOffer(true);
    try {
      const res = await AdminAPI.updateOffer({
        enabled: offer.enabled,
        label: offer.label || "",
        type: offer.type,
        value: Number(offer.value),
        plans: offer.plans || [],
        starts_at: offer.starts_at ? new Date(offer.starts_at).toISOString() : null,
        ends_at: offer.ends_at ? new Date(offer.ends_at).toISOString() : null,
      });
      toast.success(res.data.message);
      load();
    } catch (err) {
      toast.error(apiError(err, "Couldn't save offer"));
    } finally {
      setSavingOffer(false);
    }
  };

  const saveTrial = async () => {
    setSavingTrial(true);
    try {
      await AdminAPI.updateTrial({ enabled: trial.enabled, days: Number(trial.days), plan: trial.plan });
      toast.success("Trial settings saved");
      load();
    } catch (err) {
      toast.error(apiError(err, "Couldn't save trial settings"));
    } finally {
      setSavingTrial(false);
    }
  };

  const saveDisplay = async () => {
    setSavingDisplay(true);
    try {
      const res = await AdminAPI.updatePriceDisplay({ hide_prices: !!display.hide_prices, label: (display.label || "").trim() || "Launching soon" });
      toast.success(res.data.message);
      load();
    } catch (err) {
      toast.error(apiError(err, "Couldn't save price visibility"));
    } finally {
      setSavingDisplay(false);
    }
  };

  if (!data) {
    return (
      <div className="py-20 flex justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center">
            <IndianRupee className="w-4 h-4" />
          </div>
          <h2 className="text-xl font-black text-slate-900 tracking-tight">Pricing & Offers</h2>
          <span className="ml-1 px-2 py-0.5 rounded-lg bg-slate-900 text-white text-[10px] font-black uppercase">{data.env}</span>
        </div>
        <p className="text-xs text-slate-500 mt-1">
          Yearly plan prices, a store-wide offer and the free-trial rules. Changes reach the app's upgrade page within 30 seconds.
          {!canEdit && " Only superadmins can make changes."}
        </p>
      </div>

      {!data.initialized && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-sm font-semibold flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          Plans haven't been set up in this environment yet. Run the billing migration on the server
          (backend-node/scripts/migrations/2026_10_billing.js) and refresh.
        </div>
      )}

      {display && (
        <Card
          title="Price visibility"
          icon={display.hide_prices ? EyeOff : Eye}
          subtitle="Early access: show the plans without prices. Plans can't be bought while hidden; access codes keep working."
        >
          <div className="space-y-3">
            <label className="flex items-start gap-2.5 text-sm font-bold text-slate-700">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={!!display.hide_prices}
                disabled={!canEdit}
                onChange={(e) => setDisplay({ ...display, hide_prices: e.target.checked })}
                data-testid="hide-prices"
              />
              <span>
                Hide prices on the upgrade page
                <span className="block text-xs font-semibold text-slate-500">
                  {display.hide_prices
                    ? "Customers see ₹XXX with the badge below. Untick and save to publish your prices."
                    : "Prices are public and plans can be bought."}
                </span>
              </span>
            </label>
            <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <div>
                <label className={labelCls}>Badge shown on each plan</label>
                <input
                  className={inputCls}
                  maxLength={40}
                  value={display.label || ""}
                  disabled={!canEdit || !display.hide_prices}
                  onChange={(e) => setDisplay({ ...display, label: e.target.value })}
                  placeholder="Launching soon"
                />
              </div>
              {canEdit && (
                <button
                  onClick={saveDisplay}
                  disabled={savingDisplay}
                  className="flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-extrabold text-white bg-brand-500 hover:bg-brand-600 rounded-xl disabled:opacity-40"
                  data-testid="save-price-display"
                >
                  {savingDisplay ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save
                </button>
              )}
            </div>
          </div>
        </Card>
      )}

      {data.initialized && (
        <Card title="Plans" icon={Tag} subtitle="Yearly prices, in rupees. Offers and promo codes are applied on top.">
          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {data.plans.map((p) => (
              <PlanEditor key={p.code} plan={p} offer={data.offer} canEdit={canEdit} onSaved={load} />
            ))}
          </div>
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card
          title="Store-wide offer"
          icon={BadgePercent}
          subtitle="Shown as a banner on the upgrade page and applied before any promo code."
          right={
            <span
              className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase ${
                offer.enabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
              }`}
            >
              {offer.enabled ? "On" : "Off"}
            </span>
          }
        >
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm font-bold text-slate-700">
              <input type="checkbox" checked={offer.enabled} disabled={!canEdit} onChange={(e) => setOffer({ ...offer, enabled: e.target.checked })} />
              Offer enabled
            </label>
            <div>
              <label className={labelCls}>Banner text</label>
              <input
                className={inputCls}
                placeholder="e.g. Diwali sale"
                value={offer.label || ""}
                maxLength={60}
                disabled={!canEdit}
                onChange={(e) => setOffer({ ...offer, label: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Discount type</label>
                <select className={inputCls} value={offer.type} disabled={!canEdit} onChange={(e) => setOffer({ ...offer, type: e.target.value })}>
                  <option value="PERCENT">Percentage off</option>
                  <option value="FLAT">Flat ₹ off</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>{offer.type === "PERCENT" ? "Percent (max 90)" : "Amount (₹)"}</label>
                <input
                  className={inputCls}
                  type="number"
                  min="1"
                  max={offer.type === "PERCENT" ? 90 : undefined}
                  value={offer.value}
                  disabled={!canEdit}
                  onChange={(e) => setOffer({ ...offer, value: e.target.value === "" ? "" : Number(e.target.value) })}
                />
              </div>
            </div>
            <div>
              <label className={labelCls}>Applies to</label>
              <div className="flex flex-wrap gap-2 mt-1">
                {PLAN_CODES.map((c) => {
                  const on = !offer.plans?.length || offer.plans.includes(c);
                  return (
                    <button
                      key={c}
                      disabled={!canEdit}
                      onClick={() => {
                        const current = offer.plans?.length ? offer.plans : [...PLAN_CODES];
                        const next = current.includes(c) ? current.filter((x) => x !== c) : [...current, c];
                        setOffer({ ...offer, plans: next.length === PLAN_CODES.length ? [] : next });
                      }}
                      className={`px-3 py-1.5 text-xs font-bold rounded-xl border ${
                        on ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-500 border-slate-200"
                      }`}
                    >
                      {c}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Starts (optional)</label>
                <input
                  className={inputCls}
                  type="datetime-local"
                  value={toLocalInput(offer.starts_at)}
                  disabled={!canEdit}
                  onChange={(e) => setOffer({ ...offer, starts_at: fromLocalInput(e.target.value) })}
                />
              </div>
              <div>
                <label className={labelCls}>Ends (optional)</label>
                <input
                  className={inputCls}
                  type="datetime-local"
                  value={toLocalInput(offer.ends_at)}
                  disabled={!canEdit}
                  onChange={(e) => setOffer({ ...offer, ends_at: fromLocalInput(e.target.value) })}
                />
              </div>
            </div>
            {canEdit && (
              <div className="flex justify-end">
                <button
                  onClick={saveOffer}
                  disabled={savingOffer || !offer.value}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-extrabold text-white bg-brand-500 hover:bg-brand-600 rounded-xl disabled:opacity-40"
                >
                  {savingOffer ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save offer
                </button>
              </div>
            )}
          </div>
        </Card>

        <Card title="Free trial" icon={Gift} subtitle="One trial per pharmacy, ever. The code is emailed and activates instantly.">
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm font-bold text-slate-700">
              <input type="checkbox" checked={trial.enabled} disabled={!canEdit} onChange={(e) => setTrial({ ...trial, enabled: e.target.checked })} />
              Offer a free trial to new pharmacies
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Length (days)</label>
                <input
                  className={inputCls}
                  type="number"
                  min="1"
                  max="60"
                  value={trial.days}
                  disabled={!canEdit}
                  onChange={(e) => setTrial({ ...trial, days: e.target.value === "" ? "" : Number(e.target.value) })}
                />
              </div>
              <div>
                <label className={labelCls}>Plan</label>
                <select className={inputCls} value={trial.plan} disabled={!canEdit} onChange={(e) => setTrial({ ...trial, plan: e.target.value })}>
                  <option value="BEST">Best plan on sale</option>
                  {PLAN_CODES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {canEdit && (
              <div className="flex justify-end">
                <button
                  onClick={saveTrial}
                  disabled={savingTrial || !trial.days}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-extrabold text-white bg-brand-500 hover:bg-brand-600 rounded-xl disabled:opacity-40"
                >
                  {savingTrial ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save trial
                </button>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
