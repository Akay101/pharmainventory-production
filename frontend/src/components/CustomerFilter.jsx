import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { Check, ChevronDown, Loader2, Search, Users } from "lucide-react";
import { API } from "../App";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

const PAGE_SIZE = 20;

// Searchable customer picker for list filters. Loads customers page by page
// from the server, so it works for pharmacies with thousands of customers.
export default function CustomerFilter({ value, onChange, className = "" }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedName, setSelectedName] = useState("");
  const requestRef = useRef(0);

  // Label for a customer selected from the URL before the list was opened
  useEffect(() => {
    if (!value || value === "all") {
      setSelectedName("");
      return;
    }
    const known = items.find((c) => c.id === value);
    if (known) {
      setSelectedName(known.name || known.mobile || "Customer");
      return;
    }
    let cancelled = false;
    axios
      .get(`${API}/customers/${value}`)
      .then((res) => {
        const c = res.data?.customer;
        if (!cancelled && c) setSelectedName(c.name || c.mobile || "Customer");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line
  }, [value]);

  const load = async (search, pageNum) => {
    const reqId = ++requestRef.current;
    setLoading(true);
    try {
      const res = await axios.get(`${API}/customers`, {
        params: { search: search || undefined, page: pageNum, limit: PAGE_SIZE },
      });
      if (reqId !== requestRef.current) return;
      const rows = res.data?.customers || [];
      setItems((prev) => (pageNum === 1 ? rows : [...prev, ...rows]));
      setPage(pageNum);
      setHasMore(pageNum < (res.data?.pagination?.total_pages || 1));
    } catch {
      if (reqId === requestRef.current) setHasMore(false);
    } finally {
      if (reqId === requestRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => load(query.trim(), 1), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line
  }, [open, query]);

  const onScroll = (e) => {
    const el = e.currentTarget;
    if (hasMore && !loading && el.scrollTop + el.clientHeight >= el.scrollHeight - 40) {
      load(query.trim(), page + 1);
    }
  };

  const pick = (id, name) => {
    setSelectedName(name || "");
    onChange(id);
    setOpen(false);
  };

  const isAll = !value || value === "all";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`h-9 w-44 px-3 inline-flex items-center justify-between gap-2 text-xs font-semibold border border-border/70 rounded-xl bg-card/60 backdrop-blur-md hover:bg-muted/50 transition-colors ${className}`}
          data-testid="customer-filter"
        >
          <span className="flex items-center gap-1.5 min-w-0">
            <Users className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{isAll ? "All Customers" : selectedName || "Customer"}</span>
          </span>
          <ChevronDown className="w-3.5 h-3.5 shrink-0 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0 overflow-hidden">
        <div className="flex items-center gap-2 px-3 border-b border-border">
          <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or mobile…"
            className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground shrink-0" />}
        </div>
        <div className="max-h-72 overflow-y-auto py-1" onScroll={onScroll}>
          {!query && (
            <button
              type="button"
              onClick={() => pick("all", "")}
              className="w-full px-3 py-2 text-left text-sm flex items-center justify-between hover:bg-muted/60"
            >
              <span className="font-medium">All Customers</span>
              {isAll && <Check className="w-3.5 h-3.5 text-primary" />}
            </button>
          )}
          {items.map((c) => (
            <button
              type="button"
              key={c.id}
              onClick={() => pick(c.id, c.name || c.mobile)}
              className="w-full px-3 py-2 text-left flex items-center justify-between gap-2 hover:bg-muted/60"
            >
              <span className="min-w-0">
                <span className="block text-sm truncate">{c.name || "Unknown"}</span>
                {c.mobile && <span className="block text-[11px] text-muted-foreground">{c.mobile}</span>}
              </span>
              {value === c.id && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
            </button>
          ))}
          {!loading && items.length === 0 && (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">No customers found</div>
          )}
          {loading && items.length > 0 && (
            <div className="py-2 flex justify-center">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
