import React, { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";
import { API } from "../App";
import { Search, ChevronDown, Check, X } from "lucide-react";
import Loader from "./Loader";

export default function ProductSearchDropdown({
  onSelect,
  placeholder = "Search and select product...",
  excludeProductName = null,
  className = "",
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [products, setProducts] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [selectedProduct, setSelectedProduct] = useState(null);

  const containerRef = useRef(null);
  const listRef = useRef(null);
  const inputRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Fetch product-grouped inventory from API
  const fetchProducts = useCallback(
    async (pageNum = 1, searchQuery = "", isNewQuery = false) => {
      try {
        if (pageNum === 1) setLoading(true);
        else setLoadingMore(true);

        const params = new URLSearchParams();
        params.append("page", pageNum);
        params.append("limit", 20);
        params.append("grouped", "true");
        if (searchQuery.trim()) params.append("search", searchQuery.trim());

        const res = await axios.get(`${API}/inventory?${params.toString()}`);
        let fetched = res.data.inventory || [];

        if (excludeProductName) {
          const excLower = excludeProductName.trim().toLowerCase();
          fetched = fetched.filter(
            (p) => (p.product_name || p.name || "").trim().toLowerCase() !== excLower
          );
        }

        if (pageNum === 1 || isNewQuery) {
          setProducts(fetched);
          setHighlightedIndex(fetched.length > 0 ? 0 : -1);
        } else {
          setProducts((prev) => [...prev, ...fetched]);
        }

        const totalPages = res.data.pagination?.total_pages || 1;
        setHasMore(pageNum < totalPages);
      } catch (err) {
        console.error("Failed to load inventory products in dropdown", err);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [excludeProductName]
  );

  // Debounced search trigger
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      setPage(1);
      fetchProducts(1, search, true);
    }, 250);
    return () => clearTimeout(timer);
  }, [search, open, fetchProducts]);

  // Handle scroll in dropdown list for infinite loading
  const handleScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target;
    if (scrollHeight - scrollTop - clientHeight < 40 && hasMore && !loading && !loadingMore) {
      const nextPage = page + 1;
      setPage(nextPage);
      fetchProducts(nextPage, search, false);
    }
  };

  const scrollItemIntoView = (index) => {
    if (!listRef.current) return;
    const el = listRef.current.children[index];
    if (el) {
      el.scrollIntoView({ block: "nearest" });
    }
  };

  // Keyboard navigation handler
  const handleKeyDown = (e) => {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter") {
        setOpen(true);
        e.preventDefault();
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) => {
        const nextIndex = Math.min(prev + 1, products.length - 1);
        scrollItemIntoView(nextIndex);
        return nextIndex;
      });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) => {
        const nextIndex = Math.max(prev - 1, 0);
        scrollItemIntoView(nextIndex);
        return nextIndex;
      });
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < products.length) {
        handleSelectProduct(products[highlightedIndex]);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  };

  const handleSelectProduct = (product) => {
    setSelectedProduct(product);
    setOpen(false);
    if (onSelect) onSelect(product);
  };

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      {/* Trigger Button / Selected Box */}
      <button
        type="button"
        onClick={() => {
          const nextState = !open;
          setOpen(nextState);
          if (nextState) {
            setTimeout(() => inputRef.current?.focus(), 50);
          }
        }}
        onKeyDown={handleKeyDown}
        className="w-full h-10 px-3 flex items-center justify-between gap-2 bg-background border border-border/80 hover:border-border rounded-xl text-xs text-foreground font-semibold shadow-xs transition-colors cursor-pointer"
      >
        <span className="truncate text-left flex-1">
          {selectedProduct ? (
            <span className="font-extrabold text-foreground">
              {selectedProduct.product_name || selectedProduct.name}
            </span>
          ) : (
            <span className="text-muted-foreground font-medium">{placeholder}</span>
          )}
        </span>
        <ChevronDown
          className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* Dropdown Panel */}
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1.5 bg-card/95 backdrop-blur-xl border border-border/80 shadow-2xl rounded-2xl z-[99999] overflow-hidden flex flex-col max-h-72 animate-in fade-in zoom-in-95 duration-150">
          {/* Search Input Bar */}
          <div className="p-2 border-b border-border/40 bg-muted/20 relative flex items-center">
            <Search className="w-4 h-4 text-muted-foreground absolute left-4" />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type to search product..."
              className="w-full pl-8 pr-8 py-1.5 text-xs font-semibold bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-4 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Scrollable Results List */}
          <div
            ref={listRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto p-1.5 space-y-1 divide-y divide-border/20 scrollbar-thin"
          >
            {loading ? (
              <div className="py-6 flex flex-col items-center justify-center">
                <Loader size="xs" variant="inline" text="Searching inventory..." />
              </div>
            ) : products.length === 0 ? (
              <div className="py-6 text-center text-xs font-semibold text-muted-foreground">
                No matching inventory products found.
              </div>
            ) : (
              products.map((product, idx) => {
                const pName = product.product_name || product.name;
                const isSelected = selectedProduct?.product_name === pName;
                const isHighlighted = idx === highlightedIndex;
                const availStock =
                  product.total_available_stock !== undefined
                    ? product.total_available_stock
                    : product.available_quantity || 0;
                const batchCount = product.batch_count || (product.batches ? product.batches.length : 1);

                return (
                  <div
                    key={product.id || pName + idx}
                    onClick={() => handleSelectProduct(product)}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    className={`p-2.5 rounded-xl cursor-pointer transition-all flex items-center justify-between gap-2 ${
                      isHighlighted || isSelected
                        ? "bg-orange-500/15 text-orange-500 font-bold"
                        : "hover:bg-muted/40 text-foreground"
                    }`}
                  >
                    <div className="truncate flex-1">
                      <p className="text-xs font-bold truncate leading-tight">{pName}</p>
                      <p className="text-[10px] text-muted-foreground font-semibold mt-0.5 truncate">
                        {product.manufacturer || "General"} • {batchCount} Batch{batchCount > 1 ? "es" : ""} ({availStock} u)
                      </p>
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-orange-500 shrink-0" />}
                  </div>
                );
              })
            )}

            {loadingMore && (
              <div className="py-3 flex items-center justify-center border-t border-border/20">
                <Loader size="xs" variant="inline" text="Loading more..." />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
