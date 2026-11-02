import { useState } from "react";
import { Check, ChevronDown, Link2, Plus } from "lucide-react";

const sourceLabel = (s) => (s.source === "global" ? "Medicine database" : "Your catalog");

// Under a purchase row whose name isn't in the catalog yet: the closest products
// we hold, for the user to map it to, or to confirm that it really is new.
export default function MatchChooser({ item, onPick, onNew }) {
  const [more, setMore] = useState(false);
  const suggestions = item._match?.suggestions || [];
  if (!suggestions.length) return null;
  const shown = more ? suggestions : suggestions.slice(0, 1);

  return (
    <div data-testid="match-chooser" className="mt-1.5 rounded-lg border border-amber-500/40 bg-amber-500/5 p-2 text-[11px]">
      <p className="font-semibold text-foreground">Is this the same product?</p>
      <div className="mt-1.5 space-y-1">
        {shown.map((s) => (
          <button
            key={`${s.source}-${s.product_id}`}
            type="button"
            data-testid="match-option"
            onClick={() => onPick(s)}
            className="group flex w-full items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5 text-left transition-colors hover:border-primary cursor-pointer"
          >
            <Link2 className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-bold text-foreground">{s.product_name}</span>
              <span className="block truncate text-[10px] text-muted-foreground">
                {sourceLabel(s)}
                {s.manufacturer ? ` · ${s.manufacturer}` : ""}
              </span>
            </span>
            <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-primary px-1.5 py-1 text-[10px] font-bold leading-none text-primary-foreground">
              <Check className="h-3 w-3" aria-hidden="true" /> Use
            </span>
          </button>
        ))}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        {suggestions.length > 1 ? (
          <button type="button" onClick={() => setMore((v) => !v)} className="inline-flex items-center gap-0.5 font-semibold text-muted-foreground hover:text-foreground cursor-pointer">
            <ChevronDown className={`h-3 w-3 transition-transform ${more ? "rotate-180" : ""}`} aria-hidden="true" />
            {more ? "Fewer" : `${suggestions.length - 1} more`}
          </button>
        ) : (
          <span />
        )}
        <button type="button" data-testid="match-new" onClick={onNew} className="inline-flex items-center gap-0.5 font-semibold text-primary hover:underline cursor-pointer">
          <Plus className="h-3 w-3" aria-hidden="true" /> It's new: create catalog
        </button>
      </div>
    </div>
  );
}
