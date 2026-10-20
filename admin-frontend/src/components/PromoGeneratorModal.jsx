import React, { useState } from "react";
import BottomDrawer from "./BottomDrawer";
import { Ticket, Sparkles, Copy, Check, Shield, Zap, Info } from "lucide-react";
import { toast } from "sonner";

export default function PromoGeneratorModal({ isOpen, onClose, onGenerate }) {
  const [plan, setPlan] = useState("AGENTIC");
  const [durationDays, setDurationDays] = useState(30);
  const [customCode, setCustomCode] = useState("");
  const [usageLimit, setUsageLimit] = useState(1);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [generatedCode, setGeneratedCode] = useState(null);
  const [copied, setCopied] = useState(false);

  const durationPresets = [
    { label: "7 Days", value: 7 },
    { label: "14 Days", value: 14 },
    { label: "30 Days (1 Mo)", value: 30 },
    { label: "90 Days", value: 90 },
    { label: "365 Days (1 Yr)", value: 365 },
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setCopied(false);

    try {
      const res = await onGenerate({
        plan,
        duration_days: durationDays,
        code: customCode ? customCode.trim().toUpperCase() : undefined,
        usage_limit: usageLimit,
        notes: notes.trim() || undefined,
      });

      if (res?.data?.promo?.code) {
        setGeneratedCode(res.data.promo.code);
        navigator.clipboard.writeText(res.data.promo.code);
        setCopied(true);
        toast.success(`Promo code ${res.data.promo.code} generated & copied!`);
      }
    } catch (err) {
      console.error("Failed to generate promo code:", err);
      toast.error(err.response?.data?.detail || "Failed to generate promo code");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (generatedCode) {
      navigator.clipboard.writeText(generatedCode);
      setCopied(true);
      toast.success("Code copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleReset = () => {
    setGeneratedCode(null);
    setCustomCode("");
    setNotes("");
  };

  return (
    <BottomDrawer
      isOpen={isOpen}
      onClose={() => {
        handleReset();
        onClose();
      }}
      title="Generate Promo Code"
      subtitle="Issue complimentary subscription access to pharmacies or leads"
      maxWidth="max-w-xl"
    >
      {generatedCode ? (
        <div className="py-6 text-center space-y-4">
          <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-sm">
            <Check className="w-8 h-8" />
          </div>

          <div>
            <h4 className="text-base font-bold text-slate-900">
              Promo Code Successfully Created!
            </h4>
            <p className="text-xs text-slate-500 mt-1">
              Active for {durationDays} days of <strong>{plan}</strong> plan access.
            </p>
          </div>

          <div className="p-4 bg-slate-100 rounded-2xl border border-slate-300 max-w-sm mx-auto flex items-center justify-between gap-3">
            <span className="font-mono text-2xl font-black tracking-widest text-slate-900">
              {generatedCode}
            </span>
            <button
              onClick={handleCopy}
              className="p-2.5 bg-brand-500 hover:bg-brand-600 text-white rounded-xl shadow-xs transition-colors flex items-center gap-1.5 text-xs font-bold"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? "Copied" : "Copy"}</span>
            </button>
          </div>

          <div className="flex justify-center gap-3 pt-3">
            <button
              onClick={handleReset}
              className="px-4 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
            >
              Create Another Code
            </button>
            <button
              onClick={() => {
                handleReset();
                onClose();
              }}
              className="px-4 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Plan Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              Select Subscription Plan
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: "BASIC", label: "Basic", desc: "Core tools" },
                { id: "ADVANCED", label: "Advanced", desc: "Full inventory" },
                { id: "AGENTIC", label: "Agentic", desc: "AI Automated", popular: true },
              ].map((p) => (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => setPlan(p.id)}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    plan === p.id
                      ? "bg-brand-50 border-brand-500 text-brand-900 shadow-xs ring-1 ring-brand-500"
                      : "bg-white border-slate-200 hover:border-slate-300 text-slate-700"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold">{p.label}</span>
                    {p.popular && (
                      <span className="text-[9px] font-bold px-1.5 py-0.2 bg-brand-200 text-brand-800 rounded">
                        PRO
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-400 block mt-0.5">{p.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Duration Presets */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              Duration (Days)
            </label>
            <div className="flex flex-wrap gap-2 mb-2">
              {durationPresets.map((preset) => (
                <button
                  type="button"
                  key={preset.value}
                  onClick={() => setDurationDays(preset.value)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-xl border transition-all ${
                    durationDays === preset.value
                      ? "bg-slate-900 text-white border-slate-900"
                      : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs text-slate-500">Custom Days:</span>
              <input
                type="number"
                min="1"
                max="1000"
                value={durationDays}
                onChange={(e) => setDurationDays(parseInt(e.target.value) || 1)}
                className="w-24 p-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none"
              />
            </div>
          </div>

          {/* Custom Code Optional */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Custom Code (Optional)
            </label>
            <input
              type="text"
              value={customCode}
              onChange={(e) => setCustomCode(e.target.value.toUpperCase())}
              placeholder="Leave blank for random 8-letter code (e.g. AGENTIC30)"
              className="w-full p-2.5 text-xs sm:text-sm font-mono bg-white border border-slate-300 rounded-xl focus:border-brand-500 focus:outline-none"
              maxLength={15}
            />
            <span className="text-[10px] text-slate-400 mt-0.5 block">
              Auto-generates if left empty. Uppercase alphanumeric.
            </span>
          </div>

          {/* Usage Limit & Target Notes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Usage Limit
              </label>
              <input
                type="number"
                min="1"
                max="1000"
                value={usageLimit}
                onChange={(e) => setUsageLimit(parseInt(e.target.value) || 1)}
                className="w-full p-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none"
              />
              <span className="text-[10px] text-slate-400">1 = single pharmacy redemption</span>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Recipient / Reason
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Dr. Verma demo trial"
                className="w-full p-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none"
              />
            </div>
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-brand-500 hover:bg-brand-600 rounded-xl shadow-xs transition-colors disabled:opacity-50"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{loading ? "Generating..." : "Generate Code"}</span>
            </button>
          </div>
        </form>
      )}
    </BottomDrawer>
  );
}
