// Reports → Product Performance: top sellers, demand against stock, profit
// per product, suppliers whose goods sell most, and "Add to Short Book".
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { ClipboardList, Loader2, Search } from "lucide-react";
import { API, useAuth } from "../../App";

const money = (n) => `₹${(Number(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const SORTS = [
  ["revenue", "Top revenue"],
  ["units_sold", "Most units sold"],
  ["profit", "Most profit"],
  ["demand", "Runs out soonest"],
];

export default function ProductPerformance() {
  const { can } = useAuth();
  const canShortBook = can("short_book", "create");
  const [days, setDays] = useState("30");
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState("revenue");
  const [q, setQ] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(null); // product row shown in detail
  const [adding, setAdding] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/dashboard/product-performance`, { params: { days, category } });
      setData(res.data);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Couldn't load product performance");
    } finally {
      setLoading(false);
    }
  }, [days, category]);
  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo(() => {
    let list = [...(data?.products || [])];
    const needle = q.trim().toLowerCase();
    if (needle) list = list.filter((r) => r.product_name.toLowerCase().includes(needle));
    if (sort === "demand") list.sort((a, b) => (a.days_of_stock ?? 1e9) - (b.days_of_stock ?? 1e9) || b.units_sold - a.units_sold);
    else list.sort((a, b) => (b[sort] || 0) - (a[sort] || 0));
    return list;
  }, [data, q, sort]);

  const addToShortBook = async (r) => {
    setAdding(r.product_name);
    try {
      const qty = Math.max(1, r.suggested_order || 1);
      const res = await axios.post(`${API}/shortbook`, { product_name: r.product_name, quantity: qty, unit: "units", notes: `From Reports: ${r.units_sold} sold in ${data.days} days, ${r.on_hand} in stock` });
      toast.success(res.data.merged ? `${r.product_name}: short book now ${res.data.entry.quantity} ${res.data.entry.unit}` : `${r.product_name} added to the short book (${qty} units)`);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Couldn't add to the short book");
    } finally {
      setAdding("");
    }
  };

  return (
    <div className="space-y-4" data-testid="product-performance">
      <div className="flex flex-wrap items-center gap-2">
        <select value={days} onChange={(e) => setDays(e.target.value)} className="h-9 rounded-xl border border-border bg-card px-2 text-xs font-semibold" aria-label="Period">
          {[["7", "Last 7 days"], ["30", "Last 30 days"], ["90", "Last 90 days"], ["365", "Last year"]].map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="h-9 rounded-xl border border-border bg-card px-2 text-xs font-semibold" aria-label="Category">
          <option value="all">All products</option>
          <option value="medicine">Medicines</option>
          <option value="cosmetic">Cosmetics</option>
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value)} className="h-9 rounded-xl border border-border bg-card px-2 text-xs font-semibold" aria-label="Sort">
          {SORTS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <div className="relative w-full sm:w-64 sm:ml-auto">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a product" className="h-9 w-full rounded-xl border border-border bg-card pl-9 pr-3 text-sm outline-none focus:border-primary" />
        </div>
        {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      {data && (
        <div className="grid grid-cols-3 gap-2">
          {[
            ["Products sold", data.totals.products],
            ["Revenue", money(data.totals.revenue)],
            ["Profit", money(data.totals.profit)],
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl border border-border/60 bg-card/50 px-3 py-2">
              <p className="text-[10px] font-bold uppercase text-muted-foreground">{k}</p>
              <p className="font-mono text-sm font-black">{v}</p>
            </div>
          ))}
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-border/60">
        <table className="w-full text-xs">
          <thead className="bg-muted/40 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Product</th>
              <th className="px-3 py-2 text-right">Sold</th>
              <th className="px-3 py-2 text-right">Revenue</th>
              <th className="px-3 py-2 text-right">Profit</th>
              <th className="px-3 py-2 text-right">In stock</th>
              <th className="px-3 py-2 text-right" title="How long the stock lasts at this period's sales rate">Lasts</th>
              <th className="px-3 py-2 text-right"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <Fragment key={r.product_name}>
                <tr className="border-t border-border/50 hover:bg-muted/30 cursor-pointer" onClick={() => setOpen(open === r.product_name ? null : r.product_name)}>
                  <td className="px-3 py-2 font-bold">
                    {r.product_name}
                    {r.category === "cosmetic" && <span className="ml-1.5 rounded border border-pink-500/30 bg-pink-500/10 px-1 text-[9px] font-black text-pink-600">COSMETIC</span>}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">{r.units_sold}</td>
                  <td className="px-3 py-2 text-right font-mono">{money(r.revenue)}</td>
                  <td className={`px-3 py-2 text-right font-mono ${r.profit < 0 ? "text-rose-500" : "text-emerald-600 dark:text-emerald-400"}`}>{money(r.profit)}</td>
                  <td className={`px-3 py-2 text-right font-mono ${r.on_hand <= 0 ? "text-rose-500 font-bold" : ""}`}>{r.on_hand}</td>
                  <td className={`px-3 py-2 text-right font-mono ${r.days_of_stock !== null && r.days_of_stock < 7 ? "text-rose-500 font-bold" : ""}`}>{r.days_of_stock === null ? "—" : `${r.days_of_stock} d`}</td>
                  <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                    {canShortBook && (
                      <button
                        type="button"
                        disabled={adding === r.product_name}
                        onClick={() => addToShortBook(r)}
                        className="inline-flex items-center gap-1 rounded-lg border border-orange-500/40 px-2 py-1 text-[11px] font-bold text-orange-600 hover:bg-orange-500/10"
                        title={`Add ${Math.max(1, r.suggested_order || 1)} units (30 days of sales less stock) to the short book`}
                        data-testid="report-add-shortbook"
                      >
                        {adding === r.product_name ? <Loader2 className="h-3 w-3 animate-spin" /> : <ClipboardList className="h-3 w-3" />} Short book
                      </button>
                    )}
                  </td>
                </tr>
                {open === r.product_name && (
                  <tr className="bg-muted/20">
                    <td colSpan={7} className="px-3 py-2 text-[11px] text-muted-foreground">
                      <div className="flex flex-wrap gap-x-5 gap-y-1">
                        <span>Bills: <b className="text-foreground">{r.bills}</b></span>
                        <span>Customers: <b className="text-foreground">{r.customers}</b></span>
                        <span>Margin: <b className="text-foreground">{r.margin_percent}%</b></span>
                        <span>Sells: <b className="text-foreground">{r.per_day}/day</b></span>
                        <span>Last sold: <b className="text-foreground">{r.last_sold || "—"}</b></span>
                        <span>Bought in period: <b className="text-foreground">{r.bought_units} units ({money(r.bought_amount)})</b></span>
                        <span>Last supplier: <b className="text-foreground">{r.last_supplier || "—"}</b></span>
                        <span>Suggested order (30 days): <b className="text-foreground">{r.suggested_order} units</b></span>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {data && rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">No sales in this period</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {data?.suppliers?.length > 0 && (
        <div className="rounded-2xl border border-border/60 p-3">
          <p className="mb-2 text-xs font-black">Suppliers whose goods sold most</p>
          <div className="space-y-1">
            {data.suppliers.slice(0, 10).map((s, i) => (
              <div key={s.supplier_name} className="flex justify-between text-xs">
                <span>
                  {i + 1}. {s.supplier_name} <span className="text-muted-foreground">· {s.units} units</span>
                </span>
                <span className="font-mono">
                  {money(s.revenue)} <span className="text-emerald-600 dark:text-emerald-400">({money(s.profit)} profit)</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
