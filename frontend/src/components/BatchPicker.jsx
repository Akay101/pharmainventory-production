import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Clock, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { formatExpiry } from "../pages/utils";

const PAGE = 15;

const expiryTime = (b) => {
  const t = b.expiry_date ? new Date(b.expiry_date).getTime() : Infinity;
  return isNaN(t) ? Infinity : t;
};

// Batch selector for a bill line: search by batch number, expiry or
// supplier, arrow keys + Enter to pick, optional earliest-expiry-first sort.
export default function BatchPicker({
  batches = [],
  value,
  fallbackLabel,
  onSelect,
  nearExpiry = false,
  onToggleNearExpiry,
  accent = "primary",
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [active, setActive] = useState(0);
  const listRef = useRef(null);

  const selected = batches.find((b) => b.id === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? batches.filter((b) =>
          [b.batch_no, b.expiry_date ? formatExpiry(b.expiry_date) : "", b.supplier_name]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(q))
        )
      : batches;
    return nearExpiry ? [...list].sort((a, b) => expiryTime(a) - expiryTime(b)) : list;
  }, [batches, query, nearExpiry]);

  const visible = filtered.slice(0, limit);

  useEffect(() => {
    if (open) {
      setQuery("");
      setLimit(PAGE);
      const i = batches.findIndex((b) => b.id === value);
      setActive(i >= 0 && !nearExpiry ? i : 0);
    }
    // eslint-disable-next-line
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [query, nearExpiry]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const pick = (b) => {
    onSelect(b.id);
    setOpen(false);
  };

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => {
        const next = Math.min(i + 1, filtered.length - 1);
        if (next >= limit) setLimit((l) => l + PAGE);
        return next;
      });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[active]) pick(filtered[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const ring = accent === "amber" ? "focus-visible:ring-amber-500" : "focus-visible:ring-primary";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`h-8 w-28 px-2.5 inline-flex items-center justify-between gap-1 text-xs font-mono font-bold border border-border/80 bg-background text-foreground rounded-lg shadow-2xs focus-visible:outline-none focus-visible:ring-1 ${ring}`}
        >
          <span className="truncate">{selected?.batch_no || fallbackLabel || "Select Batch"}</span>
          <ChevronDown className="w-3.5 h-3.5 shrink-0 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[460px] max-w-[calc(100vw-24px)] p-2 border-2 border-border shadow-2xl rounded-2xl z-[99999] bg-background text-foreground font-sans"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          e.currentTarget.querySelector("input")?.focus();
        }}
      >
        <div className="px-3 py-1.5 mb-1.5 border-b border-border/70 text-[11px] font-black uppercase text-muted-foreground flex items-center justify-between bg-muted/60 rounded-t-xl">
          <span>
            Available Batches <span className="font-semibold normal-case">({batches.length})</span>
          </span>
          {onToggleNearExpiry && (
            <button
              type="button"
              onClick={onToggleNearExpiry}
              className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border transition-all duration-150 flex items-center gap-1 cursor-pointer ${
                nearExpiry
                  ? "bg-amber-500 text-white border-amber-600 shadow-xs"
                  : "bg-background hover:bg-muted text-muted-foreground border-border"
              }`}
              title="Sort batches by earliest expiry date first"
            >
              <Clock className="w-3 h-3" />
              <span>Near Expiry {nearExpiry ? "ON" : ""}</span>
            </button>
          )}
        </div>

        <div className="relative mb-1.5">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search batch no, expiry (MM/YY) or supplier…"
            className="w-full h-8 pl-8 pr-2 text-xs rounded-lg border border-border bg-muted/30 outline-none focus:border-primary placeholder:text-muted-foreground"
          />
        </div>

        <div ref={listRef} className="max-h-72 overflow-y-auto">
          {visible.map((b, idx) => {
            const isActive = idx === active;
            const isSelected = b.id === value;
            return (
              <button
                type="button"
                key={b.id}
                data-idx={idx}
                onMouseEnter={() => setActive(idx)}
                onClick={() => pick(b)}
                className={`w-full text-left text-xs py-2.5 px-3 my-1 rounded-xl border transition-colors ${
                  isActive ? "bg-primary/10 border-primary/40" : "border-border/40 hover:border-border"
                }`}
              >
                <div className="flex flex-col gap-1 w-full">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono font-black text-foreground text-sm truncate">{b.batch_no}</span>
                      {nearExpiry && idx === 0 && !query && (
                        <span className="text-[10px] bg-amber-500/20 text-amber-600 border border-amber-500/40 px-2 py-0.5 rounded-md font-black">
                          Near Expiry
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`text-[11px] font-extrabold px-2.5 py-0.5 rounded-full border ${
                          (b.available_quantity || 0) > 0
                            ? "text-emerald-600 bg-emerald-500/15 border-emerald-500/30"
                            : "text-rose-600 bg-rose-500/10 border-rose-500/30"
                        }`}
                      >
                        {b.available_quantity || 0} units available
                      </span>
                      {isSelected && <Check className="w-3.5 h-3.5 text-primary" />}
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground font-mono pt-0.5">
                    <span>
                      Exp: <strong className="text-foreground font-bold">{b.expiry_date ? formatExpiry(b.expiry_date) : "N/A"}</strong>
                    </span>
                    <span className="font-semibold truncate max-w-[210px]" title={b.supplier_name || ""}>
                      Supp: <strong className="text-foreground/90">{b.supplier_name || "-"}</strong>
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div className="py-6 text-center text-xs text-muted-foreground">No batch matches “{query}”</div>
          )}
          {filtered.length > limit && (
            <button
              type="button"
              onClick={() => setLimit((l) => l + PAGE)}
              className="w-full h-7 mt-1 text-[10px] font-bold text-amber-500 hover:text-amber-600 hover:bg-amber-500/5 rounded-lg"
            >
              Show more batches ({filtered.length - limit} more)…
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
