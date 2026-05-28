import React from "react";
import { Shield, Zap, Sparkles } from "lucide-react";

export default function PlanBadge({ plan, className = "" }) {
  const planNormalized = (plan || "").toUpperCase();

  if (planNormalized === "BASIC") {
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-extrabold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/30 shadow-sm transition-all hover:bg-blue-500/15 ${className}`}
        data-testid="plan-badge-basic"
      >
        <Shield className="w-3.5 h-3.5 text-blue-500 shrink-0" />
        <span className="tracking-wide">BASIC</span>
      </span>
    );
  }

  if (planNormalized === "ADVANCED") {
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-extrabold bg-gradient-to-r from-indigo-500/15 to-purple-500/10 border border-indigo-500/40 shadow-[0_0_10px_rgba(99,102,241,0.15)] hover:shadow-[0_0_12px_rgba(99,102,241,0.25)] transition-all ${className}`}
        data-testid="plan-badge-advanced"
      >
        <Zap className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400 shrink-0 animate-pulse" />
        <span className="bg-gradient-to-r from-indigo-600 to-purple-600 dark:from-indigo-400 dark:to-purple-400 bg-clip-text text-transparent tracking-wide">
          ADVANCED
        </span>
      </span>
    );
  }

  if (planNormalized === "AGENTIC") {
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black bg-gradient-to-r from-purple-500/20 via-pink-500/15 to-amber-500/10 border border-purple-500/50 shadow-[0_0_15px_rgba(168,85,247,0.3)] hover:shadow-[0_0_20px_rgba(168,85,247,0.4)] transition-all animate-pulse ${className}`}
        data-testid="plan-badge-agentic"
      >
        <Sparkles className="w-3.5 h-3.5 text-purple-500 dark:text-purple-400 shrink-0" />
        <span className="bg-gradient-to-r from-purple-600 via-pink-500 to-amber-500 dark:from-purple-400 dark:via-pink-400 dark:to-amber-400 bg-clip-text text-transparent tracking-wider">
          AGENTIC
        </span>
      </span>
    );
  }

  // Fallback badge if no plan or unexpected plan is found
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[9px] font-bold bg-muted text-muted-foreground border border-border/40 ${className}`}
    >
      {plan || "NO PLAN"}
    </span>
  );
}
