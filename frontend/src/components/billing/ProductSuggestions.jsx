import { useEffect, useState } from "react";
import axios from "axios";
import { CalendarClock, Globe, Info, Layers, Loader2, PackageCheck, Plus, Replace } from "lucide-react";
import { API } from "../../App";
import Loader from "../Loader";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "../ui/sheet";

// Product search suggestions for billing: filter chips (All / In stock / Near
// expiry), a details button per medicine that opens a side panel with its
// batches and in-stock alternates by salt, and Manual entry at the bottom.
//
// Keyboard (from the product input): ↑/↓ move, Enter picks, Alt+1/2/3 switch
// filter, Alt+D opens details of the highlighted medicine.

export const SUGGESTION_FILTERS = [
  { id: "all", label: "All", key: "1" },
  { id: "stock", label: "In stock", key: "2" },
  { id: "expiring", label: "Near expiry", key: "3" },
];

// "2027-09-30", "09/27", "09/2027" -> Date (first of the month for MM/YY)
const expiryDate = (exp) => {
  if (!exp || exp === "-") return null;
  let m;
  if ((m = /^(\d{2})\/(\d{2})$/.exec(exp))) return new Date(2000 + +m[2], +m[1] - 1, 1);
  if ((m = /^(\d{2})\/(\d{4})$/.exec(exp))) return new Date(+m[2], +m[1] - 1, 1);
  const d = new Date(exp);
  return isNaN(d) ? null : d;
};
const stockOf = (it) => Number(it.available_quantity || it.available_units || 0);
const liveBatches = (it) => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return (it.batches || []).filter((b) => Number(b.available_quantity) > 0 && (!expiryDate(b.expiry_date) || expiryDate(b.expiry_date) >= now));
};
// Nearest expiry among in-stock, unexpired batches within the warning window
export const nearExpiryOf = (it, warningDays = 90) => {
  const limit = Date.now() + warningDays * 864e5;
  let best = null;
  for (const b of liveBatches(it)) {
    const d = expiryDate(b.expiry_date);
    if (d && d.getTime() <= limit && (!best || d < best.date)) best = { date: d, batch: b };
  }
  return best;
};

export function filterSuggestions(list, filter, warningDays) {
  if (filter === "stock") return list.filter((it) => it.source !== "global" && stockOf(it) > 0);
  if (filter === "expiring") {
    return list
      .map((it) => ({ it, near: it.source === "global" ? null : nearExpiryOf(it, warningDays) }))
      .filter((x) => x.near)
      .sort((a, b) => a.near.date - b.near.date)
      .map((x) => x.it);
  }
  return list;
}

export const suggestionCounts = (list, warningDays) => ({
  all: list.length,
  stock: filterSuggestions(list, "stock", warningDays).length,
  expiring: filterSuggestions(list, "expiring", warningDays).length,
});

const monthLabel = (d) => d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });

function StockBadge({ item }) {
  if (stockOf(item) > 0) {
    return (
      <span className="text-[10px] px-2 py-0.5 bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 border border-emerald-500/20 rounded-full font-bold">
        In Stock: {stockOf(item)} units
      </span>
    );
  }
  if (item.source === "global") {
    return (
      <span className="text-[10px] px-2 py-0.5 bg-blue-500/10 text-blue-500 dark:text-blue-400 border border-blue-500/20 rounded-full font-bold flex items-center gap-1">
        <Globe className="w-2.5 h-2.5" /> Global Medicine
      </span>
    );
  }
  if (item.is_custom_catalog || item.source === "catalog") {
    return <span className="text-[10px] px-2 py-0.5 bg-purple-500/10 text-purple-400 border border-purple-500/20 rounded-full font-bold">My Catalog</span>;
  }
  return <span className="text-[10px] px-2 py-0.5 bg-rose-500/10 text-rose-500 border border-rose-500/20 rounded-full font-bold">Out of Stock</span>;
}

// The dropdown body (the caller owns the portal/positioning)
export function SuggestionList({
  idPrefix,
  search,
  allSuggestions,
  suggestions,
  loading,
  highlighted,
  setHighlighted,
  filter,
  setFilter,
  warningDays,
  onSelect,
  onManual,
  onDetails,
  getNearestExpiryInfo,
}) {
  const counts = suggestionCounts(allSuggestions, warningDays);
  const showManual = search && search.length >= 2;
  const manualIndex = suggestions.length;
  return (
    <>
      <div className="sticky top-0 z-10 bg-muted/95 backdrop-blur-md border-b border-border">
        <div className="px-3.5 py-1.5 text-xs font-semibold text-muted-foreground flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="truncate">Suggestions for "{search}"</span>
            {allSuggestions.length > 0 && (
              <span className="shrink-0 text-[10px] bg-blue-500/10 text-blue-500 dark:text-blue-400 px-2 py-0.5 rounded-full font-bold border border-blue-500/20">
                {suggestions.length === allSuggestions.length ? `${allSuggestions.length} matches` : `${suggestions.length} of ${allSuggestions.length}`}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0" data-testid="suggestion-filters">
            {SUGGESTION_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                title={`Alt+${f.key}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  setFilter(f.id);
                  setHighlighted(-1);
                }}
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold transition-colors ${
                  filter === f.id
                    ? f.id === "expiring"
                      ? "border-amber-500 bg-amber-500 text-white"
                      : "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card hover:bg-muted text-foreground/80"
                }`}
              >
                {f.id === "expiring" && <CalendarClock className="h-3 w-3" />}
                {f.label}
                <span className="opacity-70">{counts[f.id]}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="h-[130px] w-full flex flex-col items-center justify-center p-4">
          <Loader size="sm" text="Searching inventory..." variant="inline" />
        </div>
      ) : (
        <>
          {suggestions.length === 0 && (
            <div className="px-4 py-6 text-center text-xs font-semibold text-muted-foreground">
              {filter === "expiring"
                ? `Nothing here expires in the next ${warningDays} days`
                : filter === "stock"
                ? "None of these are in stock"
                : "No matching medicines"}
            </div>
          )}
          {suggestions.map((invItem, i) => {
            const near = filter === "expiring" || invItem.source !== "global" ? nearExpiryOf(invItem, warningDays) : null;
            return (
              <div
                key={invItem.id || `${invItem.product_name}-${i}`}
                id={`${idPrefix}-${i}`}
                className={`group p-3 cursor-pointer border-b border-border/50 transition-colors duration-150 ${highlighted === i ? "bg-orange-500/15" : "hover:bg-muted/50"}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onSelect(invItem);
                }}
                onMouseEnter={() => setHighlighted(i)}
                data-testid="suggestion-row"
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="font-bold text-sm text-foreground flex items-center gap-2 flex-wrap min-w-0">
                    <span>{invItem.product_name}</span>
                    <StockBadge item={invItem} />
                    {near && (
                      <span className="text-[10px] px-2 py-0.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 rounded-full font-bold">
                        Expires {monthLabel(near.date)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-mono text-xs font-black text-orange-500">₹{Number(invItem.mrp_per_unit || invItem.mrp || 0).toFixed(2)}/unit</span>
                    <button
                      type="button"
                      title="Details & alternates (Alt+D)"
                      aria-label={`Details of ${invItem.product_name}`}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onDetails(invItem);
                      }}
                      className="inline-flex h-7 items-center gap-1 rounded-lg border border-border bg-card px-2 text-[11px] font-bold text-muted-foreground hover:border-primary hover:text-primary"
                      data-testid="suggestion-details"
                    >
                      <Info className="h-3.5 w-3.5" /> Details
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                  {invItem.supplier_name ? (
                    <span className="font-semibold text-foreground/80">Supplier: {invItem.supplier_name}</span>
                  ) : invItem.manufacturer || invItem.manufacturer_name ? (
                    <span className="font-semibold text-foreground/80">MFG: {invItem.manufacturer || invItem.manufacturer_name}</span>
                  ) : null}
                  {invItem.salt_composition && <span className="text-orange-400 font-medium">• Salt: {invItem.salt_composition}</span>}
                </div>

                {invItem.source === "global" ? (
                  <div className="mt-1.5 flex items-center justify-between text-xs text-muted-foreground/90 flex-wrap pt-1 border-t border-border/40 font-mono">
                    <div className="flex items-center gap-3">
                      {Number(invItem.purchase_price) > 0 && <span className="text-emerald-500 font-bold">PTR: ₹{Number(invItem.purchase_price).toFixed(2)}</span>}
                      <span className="text-orange-500 font-bold">MRP: ₹{Number(invItem.mrp_per_unit || invItem.mrp || 0).toFixed(2)}</span>
                      {invItem.pack_type && (
                        <span className="text-[10px] font-sans px-2 py-0.5 bg-muted rounded border border-border">
                          {invItem.pack_type} ({invItem.units_per_pack || 1}u)
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-blue-400 font-sans font-bold bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">Negative Billing Available</span>
                  </div>
                ) : (
                  (() => {
                    const exp = getNearestExpiryInfo(invItem);
                    return (
                      <div className="mt-1.5 flex items-center justify-between text-xs text-muted-foreground/90 flex-wrap pt-1 border-t border-border/40 font-mono">
                        <div className="flex items-center gap-3">
                          {invItem.purchase_price !== undefined && <span className="text-blue-500 font-bold">Rate: ₹{Number(invItem.purchase_price || 0).toFixed(2)}</span>}
                          <span>MRP: ₹{Number(invItem.mrp_per_unit || invItem.mrp || 0).toFixed(2)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {exp.isMultiple ? (
                            <>
                              <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 font-bold text-[10px] border border-amber-500/30">{exp.batchCount} Batches</span>
                              <span>
                                Nearest Exp: <span className="font-bold text-foreground">{exp.expiryLabel}</span>
                              </span>
                            </>
                          ) : (
                            <>
                              <span>
                                Batch: <span className="font-bold text-foreground">{exp.batchLabel}</span>
                              </span>
                              <span>
                                Exp: <span className="font-bold text-foreground">{exp.expiryLabel}</span>
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })()
                )}
              </div>
            );
          })}

          {/* Manual entry: last option, pinned to the bottom edge */}
          {showManual && (
            <div
              id={`${idPrefix}-${manualIndex}`}
              className={`sticky bottom-0 z-10 p-3 cursor-pointer border-t-2 border-amber-500/30 backdrop-blur-md transition-colors duration-150 ${
                highlighted === manualIndex ? "bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300" : "bg-amber-50/95 dark:bg-amber-950/80 hover:bg-amber-100 text-amber-600"
              }`}
              onMouseDown={(e) => {
                e.preventDefault();
                onManual();
              }}
              onMouseEnter={() => setHighlighted(manualIndex)}
              data-testid="suggestion-manual"
            >
              <div className="flex items-center gap-2">
                <Plus className="w-4 h-4 text-amber-500" />
                <div>
                  <p className="font-semibold text-sm">Manual Entry: "{search}"</p>
                  <p className="text-xs text-muted-foreground font-normal">Add item not in inventory</p>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}

// Side panel: everything about one medicine, its batches, and alternates in
// stock with the same salt. "Use this" puts it into the bill row.
export function ProductDetailsSheet({ item, open, onOpenChange, onUse, warningDays = 90 }) {
  const [alts, setAlts] = useState(null);
  const [altsLoading, setAltsLoading] = useState(false);
  const [altsError, setAltsError] = useState("");

  useEffect(() => {
    setAlts(null);
    setAltsError("");
  }, [item?.product_name]);

  const loadAlternates = async () => {
    if (!item?.salt_composition) return;
    setAltsLoading(true);
    setAltsError("");
    try {
      const res = await axios.get(`${API}/inventory/alternates`, { params: { salt: item.salt_composition, exclude: item.product_name } });
      setAlts(res.data.alternates || []);
    } catch (err) {
      setAltsError(err.response?.data?.detail || "Couldn't load alternates");
    } finally {
      setAltsLoading(false);
    }
  };

  if (!item) return null;
  const batches = [...(item.batches || [])].sort((a, b) => (expiryDate(a.expiry_date)?.getTime() || Infinity) - (expiryDate(b.expiry_date)?.getTime() || Infinity));
  const now = new Date();
  const warnLimit = Date.now() + warningDays * 864e5;
  const fact = (label, value) =>
    value !== undefined && value !== null && value !== "" ? (
      <div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="mt-0.5 text-sm font-bold text-foreground break-words">{value}</p>
      </div>
    ) : null;
  const gst = (Number(item.cgst) || 0) + (Number(item.sgst) || 0);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto z-[100000]" data-suggestions-dropdown-keep="true" data-testid="product-details-sheet">
        <SheetHeader className="text-left">
          <SheetTitle className="text-xl font-black pr-6">{item.product_name}</SheetTitle>
          <SheetDescription className="flex flex-wrap items-center gap-2">
            <StockBadge item={item} />
            {item.salt_composition && <span className="text-xs font-semibold text-orange-500">{item.salt_composition}</span>}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 grid grid-cols-2 gap-2">
          {fact("MRP / unit", `₹${Number(item.mrp_per_unit || item.mrp || 0).toFixed(2)}`)}
          {fact("Rate / unit", item.purchase_price !== undefined ? `₹${Number(item.purchase_price || 0).toFixed(2)}` : null)}
          {fact("Manufacturer", item.manufacturer || item.manufacturer_name)}
          {fact("Supplier", item.supplier_name)}
          {fact("Pack", item.pack_type || item.units_per_pack ? `${item.pack_type || "Pack"} of ${item.units_per_pack || 1}` : null)}
          {fact("GST", gst ? `${gst}% (CGST ${Number(item.cgst) || 0} + SGST ${Number(item.sgst) || 0})` : null)}
          {fact("HSN", item.hsn_no)}
          {fact("In stock", item.source === "global" ? null : `${stockOf(item)} units`)}
        </div>

        {item.source !== "global" && (
          <div className="mt-5">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-muted-foreground">
              <Layers className="h-3.5 w-3.5" /> Batches
            </p>
            {batches.length === 0 ? (
              <p className="text-xs text-muted-foreground">No batch details</p>
            ) : (
              <div className="overflow-hidden rounded-xl border border-border/60">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left">Batch</th>
                      <th className="px-3 py-2 text-left">Expiry</th>
                      <th className="px-3 py-2 text-right">Stock</th>
                      <th className="px-3 py-2 text-right">MRP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batches.map((b) => {
                      const d = expiryDate(b.expiry_date);
                      const expired = d && d < now;
                      const soon = d && !expired && d.getTime() <= warnLimit;
                      return (
                        <tr key={b.id || b.batch_no} className="border-t border-border/50">
                          <td className="px-3 py-2 font-mono font-bold">{b.batch_no || "-"}</td>
                          <td className={`px-3 py-2 font-semibold ${expired ? "text-rose-600" : soon ? "text-amber-600" : ""}`}>
                            {d ? monthLabel(d) : "-"}
                            {expired ? " · expired" : soon ? " · soon" : ""}
                          </td>
                          <td className="px-3 py-2 text-right font-mono">{Number(b.available_quantity) || 0}</td>
                          <td className="px-3 py-2 text-right font-mono">₹{Number(b.mrp || 0).toFixed(2)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={() => onUse(item)}
          className="mt-5 w-full rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90"
          data-testid="details-use"
        >
          Add {item.product_name} to the bill
        </button>

        <div className="mt-6 border-t border-border/60 pt-5">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-sm font-black">
              <Replace className="h-4 w-4 text-primary" /> Alternates in stock
            </p>
            {item.salt_composition && alts === null && (
              <button
                type="button"
                onClick={loadAlternates}
                disabled={altsLoading}
                className="inline-flex items-center gap-1.5 rounded-xl border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary/15"
                data-testid="see-alternates"
              >
                {altsLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Replace className="h-3.5 w-3.5" />} See alternates
              </button>
            )}
          </div>
          {!item.salt_composition ? (
            <p className="mt-2 text-xs text-muted-foreground">This medicine has no salt composition, so alternates can't be matched.</p>
          ) : alts === null ? (
            <p className="mt-2 text-xs text-muted-foreground">Finds medicines in your inventory with the same salt ({item.salt_composition}).</p>
          ) : null}
          {altsError && <p className="mt-2 text-xs font-semibold text-rose-500">{altsError}</p>}
          {alts && alts.length === 0 && (
            <p className="mt-3 rounded-xl border border-dashed border-border p-4 text-center text-xs font-semibold text-muted-foreground">No other medicine with this salt is in stock</p>
          )}
          {alts && alts.length > 0 && (
            <div className="mt-3 space-y-2" data-testid="alternates-list">
              {alts.map((a) => {
                const near = nearExpiryOf(a, warningDays);
                const diff = (Number(a.mrp_per_unit) || 0) - (Number(item.mrp_per_unit || item.mrp) || 0);
                return (
                  <div key={a.product_name} className="rounded-xl border border-border/70 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-1.5 text-sm font-bold">
                          {a.product_name}
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[10px] font-extrabold uppercase ${
                              a.match === "exact"
                                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
                                : a.match === "partial"
                                ? "border-amber-500/30 bg-amber-500/10 text-amber-600"
                                : "border-slate-400/30 bg-slate-500/10 text-slate-500"
                            }`}
                          >
                            {a.match === "exact" ? "Same salt & strength" : a.match === "partial" ? "Same salt, other strength" : "Shares part of the salt"}
                          </span>
                        </p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {a.salt_composition}
                          {a.manufacturer ? ` · ${a.manufacturer}` : ""}
                        </p>
                        <p className="mt-1 flex flex-wrap gap-x-3 text-[11px] font-semibold">
                          <span className="text-emerald-600">
                            <PackageCheck className="mr-0.5 inline h-3 w-3" />
                            {a.available_quantity} in stock
                          </span>
                          <span className="font-mono">
                            ₹{Number(a.mrp_per_unit || 0).toFixed(2)}/unit
                            {Math.abs(diff) >= 0.01 && (
                              <span className={diff < 0 ? "text-emerald-600" : "text-rose-500"}>
                                {" "}
                                ({diff < 0 ? "₹" + Math.abs(diff).toFixed(2) + " less" : "₹" + diff.toFixed(2) + " more"})
                              </span>
                            )}
                          </span>
                          {near && <span className="text-amber-600">Expires {monthLabel(near.date)}</span>}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onUse(a)}
                        className="shrink-0 rounded-lg border border-primary/40 px-2.5 py-1.5 text-xs font-bold text-primary hover:bg-primary/10"
                        data-testid="alternate-use"
                      >
                        Use this
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
