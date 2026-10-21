import React, { useState } from "react";
import BottomDrawer from "./BottomDrawer";
import { Copy, Check, Sparkles, KeyRound, BadgePercent } from "lucide-react";
import { toast } from "sonner";
import { apiError } from "../api";

const PLANS = [
  { id: "BASIC", label: "Basic" },
  { id: "ADVANCED", label: "Advanced" },
  { id: "AGENTIC", label: "Agentic" },
];

const durationPresets = [7, 14, 30, 90, 365];

const fieldLabel = "block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5";
const inputCls = "w-full p-2 text-xs bg-white border border-slate-300 rounded-lg text-slate-800 focus:border-brand-500 focus:outline-none";

const toIso = (local) => (local ? new Date(local).toISOString() : null);

export default function PromoGeneratorModal({ isOpen, onClose, onGenerate }) {
  const [type, setType] = useState("ACCESS");
  const [accessPlan, setAccessPlan] = useState("AGENTIC");
  const [discountPlans, setDiscountPlans] = useState([]); // [] = all plans
  const [durationDays, setDurationDays] = useState(30);
  const [discountType, setDiscountType] = useState("PERCENT");
  const [discountValue, setDiscountValue] = useState(20);
  const [maxDiscount, setMaxDiscount] = useState("");
  const [customCode, setCustomCode] = useState("");
  const [usageLimit, setUsageLimit] = useState(1);
  const [validFrom, setValidFrom] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(null);
  const [copied, setCopied] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setCopied(false);
    try {
      const payload =
        type === "ACCESS"
          ? { type, plans: [accessPlan], duration_days: Number(durationDays) }
          : {
              type,
              plans: discountPlans,
              discount_type: discountType,
              discount_value: Number(discountValue),
              max_discount_rupees: discountType === "PERCENT" && maxDiscount ? Number(maxDiscount) : null,
            };
      const res = await onGenerate({
        ...payload,
        code: customCode.trim() || undefined,
        usage_limit: Number(usageLimit) || 0,
        valid_from: toIso(validFrom),
        valid_until: toIso(validUntil),
        notes: notes.trim() || undefined,
      });
      if (res?.data?.promo?.code) {
        setGenerated(res.data.promo);
        navigator.clipboard?.writeText(res.data.promo.code).catch(() => {});
        setCopied(true);
        toast.success(`Code ${res.data.promo.code} created & copied`);
      }
    } catch (err) {
      toast.error(apiError(err, "Failed to generate promo code"));
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setGenerated(null);
    setCustomCode("");
    setNotes("");
  };

  const summary = generated
    ? generated.type === "ACCESS"
      ? `${generated.duration_days} days of ${generated.plans[0]} access`
      : `${generated.discount.type === "PERCENT" ? `${generated.discount.value}%` : `₹${generated.discount.value / 100}`} off ${
          generated.plans.length ? generated.plans.join(", ") : "any plan"
        }`
    : "";

  return (
    <BottomDrawer
      isOpen={isOpen}
      onClose={() => {
        handleReset();
        onClose();
      }}
      title="Create Promo Code"
      subtitle="Grant free access, or give a discount at checkout"
      maxWidth="max-w-xl"
    >
      {generated ? (
        <div className="py-6 text-center space-y-4">
          <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-sm">
            <Check className="w-8 h-8" />
          </div>
          <div>
            <h4 className="text-base font-bold text-slate-900">Code created</h4>
            <p className="text-xs text-slate-500 mt-1">
              {summary}
              {generated.usage_limit ? ` · ${generated.usage_limit} use(s)` : " · unlimited uses"}
            </p>
          </div>
          <div className="p-4 bg-slate-100 rounded-2xl border border-slate-300 max-w-sm mx-auto flex items-center justify-between gap-3">
            <span className="font-mono text-2xl font-black tracking-widest text-slate-900">{generated.code}</span>
            <button
              onClick={() => {
                navigator.clipboard?.writeText(generated.code).catch(() => {});
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="p-2.5 bg-brand-500 hover:bg-brand-600 text-white rounded-xl flex items-center gap-1.5 text-xs font-bold"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? "Copied" : "Copy"}</span>
            </button>
          </div>
          <div className="flex justify-center gap-3 pt-3">
            <button onClick={handleReset} className="px-4 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl">
              Create another
            </button>
            <button
              onClick={() => {
                handleReset();
                onClose();
              }}
              className="px-4 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl"
            >
              Done
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Type */}
          <div className="grid grid-cols-2 gap-2">
            {[
              { id: "ACCESS", icon: KeyRound, label: "Access code", desc: "Activates a plan for N days, no payment" },
              { id: "DISCOUNT", icon: BadgePercent, label: "Discount code", desc: "Reduces the price at checkout" },
            ].map((t) => (
              <button
                type="button"
                key={t.id}
                onClick={() => setType(t.id)}
                className={`p-3 rounded-xl border text-left ${
                  type === t.id ? "bg-brand-50 border-brand-500 ring-1 ring-brand-500" : "bg-white border-slate-200 hover:border-slate-300"
                }`}
              >
                <span className="flex items-center gap-1.5 text-xs font-extrabold text-slate-900">
                  <t.icon className="w-3.5 h-3.5" /> {t.label}
                </span>
                <span className="text-[10px] text-slate-500 block mt-0.5">{t.desc}</span>
              </button>
            ))}
          </div>

          {type === "ACCESS" ? (
            <>
              <div>
                <label className={fieldLabel}>Plan granted</label>
                <div className="grid grid-cols-3 gap-2">
                  {PLANS.map((p) => (
                    <button
                      type="button"
                      key={p.id}
                      onClick={() => setAccessPlan(p.id)}
                      className={`py-2 rounded-xl border text-xs font-extrabold ${
                        accessPlan === p.id ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-200"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className={fieldLabel}>Duration (days)</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {durationPresets.map((d) => (
                    <button
                      type="button"
                      key={d}
                      onClick={() => setDurationDays(d)}
                      className={`px-3 py-1.5 text-xs font-bold rounded-xl border ${
                        Number(durationDays) === d ? "bg-slate-900 text-white border-slate-900" : "bg-slate-50 text-slate-600 border-slate-200"
                      }`}
                    >
                      {d} days
                    </button>
                  ))}
                </div>
                <input type="number" min="1" max="3650" value={durationDays} onChange={(e) => setDurationDays(e.target.value)} className={`${inputCls} w-28`} />
              </div>
            </>
          ) : (
            <>
              <div>
                <label className={fieldLabel}>Valid for plans</label>
                <div className="flex flex-wrap gap-2">
                  {PLANS.map((p) => {
                    const on = discountPlans.length === 0 || discountPlans.includes(p.id);
                    return (
                      <button
                        type="button"
                        key={p.id}
                        onClick={() => {
                          const current = discountPlans.length ? discountPlans : PLANS.map((x) => x.id);
                          const next = current.includes(p.id) ? current.filter((x) => x !== p.id) : [...current, p.id];
                          setDiscountPlans(next.length === PLANS.length || next.length === 0 ? [] : next);
                        }}
                        className={`px-3 py-1.5 text-xs font-bold rounded-xl border ${
                          on ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-500 border-slate-200"
                        }`}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={fieldLabel}>Type</label>
                  <select value={discountType} onChange={(e) => setDiscountType(e.target.value)} className={inputCls}>
                    <option value="PERCENT">% off</option>
                    <option value="FLAT">₹ off</option>
                  </select>
                </div>
                <div>
                  <label className={fieldLabel}>{discountType === "PERCENT" ? "Percent" : "Rupees"}</label>
                  <input
                    type="number"
                    min="1"
                    max={discountType === "PERCENT" ? 100 : undefined}
                    value={discountValue}
                    onChange={(e) => setDiscountValue(e.target.value)}
                    className={inputCls}
                  />
                </div>
                {discountType === "PERCENT" && (
                  <div>
                    <label className={fieldLabel}>Max off (₹)</label>
                    <input
                      type="number"
                      min="1"
                      placeholder="No cap"
                      value={maxDiscount}
                      onChange={(e) => setMaxDiscount(e.target.value)}
                      className={inputCls}
                    />
                  </div>
                )}
              </div>
            </>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={fieldLabel}>Custom code (optional)</label>
              <input
                type="text"
                value={customCode}
                onChange={(e) => setCustomCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 32))}
                placeholder="Random if empty, e.g. DIWALI20"
                className={`${inputCls} font-mono`}
              />
            </div>
            <div>
              <label className={fieldLabel}>Total uses</label>
              <input type="number" min="0" max="1000000" value={usageLimit} onChange={(e) => setUsageLimit(e.target.value)} className={inputCls} />
              <span className="text-[10px] text-slate-400">0 = unlimited · each pharmacy can use a code once</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={fieldLabel}>Valid from (optional)</label>
              <input type="datetime-local" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={fieldLabel}>Valid until (optional)</label>
              <input type="datetime-local" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} className={inputCls} />
            </div>
          </div>

          <div>
            <label className={fieldLabel}>Recipient / reason</label>
            <input type="text" maxLength={300} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Dr. Verma demo" className={inputCls} />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button type="button" onClick={onClose} className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl">
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-brand-500 hover:bg-brand-600 rounded-xl disabled:opacity-50"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{loading ? "Creating..." : "Create code"}</span>
            </button>
          </div>
        </form>
      )}
    </BottomDrawer>
  );
}
