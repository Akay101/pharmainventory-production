import { ArrowRight } from "lucide-react";

// The landing page's orange arrow circle, placed at the end of a primary pill.
export function ArrowChip({ className = "h-7 w-7", iconClassName = "h-3.5 w-3.5" }) {
  return (
    <span aria-hidden className={`arrow-chip ${className}`}>
      <ArrowRight className={iconClassName} strokeWidth={2.5} />
    </span>
  );
}
