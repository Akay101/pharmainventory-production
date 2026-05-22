import React, { useState, useEffect, useRef, useCallback } from "react";
import { formatDistanceToNow } from "date-fns";
import axios from "axios";
import { API } from "../App";
import { useAuth } from "../App";
import { useNavigate } from "react-router-dom";
import {
  Receipt,
  ShoppingCart,
  Users,
  Truck,
  Package,
  Activity,
  X,
  FileEdit,
  Trash2,
  PlusCircle,
  Clock,
  Loader2,
} from "lucide-react";
import { Button } from "./ui/button";

const MODULE_CONFIG = {
  BILLING: { icon: Receipt, color: "text-sky-500", bg: "bg-sky-500/10", border: "border-sky-500/20" },
  PURCHASES: { icon: ShoppingCart, color: "text-violet-500", bg: "bg-violet-500/10", border: "border-violet-500/20" },
  CUSTOMERS: { icon: Users, color: "text-emerald-500", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
  SUPPLIERS: { icon: Truck, color: "text-amber-500", bg: "bg-amber-500/10", border: "border-amber-500/20" },
  INVENTORY: { icon: Package, color: "text-indigo-500", bg: "bg-indigo-500/10", border: "border-indigo-500/20" },
  PRODUCTS: { icon: Package, color: "text-rose-500", bg: "bg-rose-500/10", border: "border-rose-500/20" },
  USERS: { icon: Users, color: "text-cyan-500", bg: "bg-cyan-500/10", border: "border-cyan-500/20" },
};

const MODULE_OPTIONS = ["ALL", "BILLING", "PURCHASES", "CUSTOMERS", "SUPPLIERS", "INVENTORY", "PRODUCTS", "USERS"];

const ACTION_ICONS = {
  CREATE: PlusCircle,
  UPDATE: FileEdit,
  DELETE: Trash2,
};

export default function RecentActivitySidebar({ open, onClose }) {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterModule, setFilterModule] = useState("ALL");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const { token, pharmacy } = useAuth();
  const navigate = useNavigate();
  const observerRef = useRef();

  // Lock body scroll when sidebar is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // Observer callback for infinite scroll
  const handleObserver = useCallback(
    (entries) => {
      const target = entries[0];
      if (target.isIntersecting && !loading && hasMore) {
        setPage((prev) => prev + 1);
      }
    },
    [loading, hasMore]
  );

  // Setup Observer
  useEffect(() => {
    const observer = new IntersectionObserver(handleObserver, {
      root: null,
      rootMargin: "20px",
      threshold: 0,
    });
    if (observerRef.current) observer.observe(observerRef.current);

    return () => {
      if (observerRef.current) observer.unobserve(observerRef.current);
    };
  }, [handleObserver, hasMore]);

  // Fetch paginated activities
  useEffect(() => {
    if (!open || !token || !pharmacy) return;

    const fetchActivities = async (pageNum) => {
      try {
        if (pageNum === 1) setLoading(true);
        const url =
          filterModule === "ALL"
            ? `${API}/activities?limit=30&page=${pageNum}`
            : `${API}/activities?limit=30&page=${pageNum}&module=${filterModule}`;

        const res = await axios.get(url, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (pageNum === 1) {
          setActivities(res.data.activities);
        } else {
          setActivities((prev) => [...prev, ...res.data.activities]);
        }
        setHasMore(res.data.has_more);
      } catch (error) {
        console.error("Failed to fetch activities", error);
      } finally {
        setLoading(false);
      }
    };

    fetchActivities(page);
  }, [page, open, token, pharmacy, filterModule]);

  // Real-time polling (reset to page 1 to ensure freshness)
  useEffect(() => {
    if (!open) return;
    const fetchLatest = async () => {
      try {
        const url =
          filterModule === "ALL"
            ? `${API}/activities?limit=30&page=1`
            : `${API}/activities?limit=30&page=1&module=${filterModule}`;
        const res = await axios.get(url, { headers: { Authorization: `Bearer ${token}` } });
        setActivities(res.data.activities);
        setPage(1);
        setHasMore(res.data.has_more);
      } catch (e) {
        console.error(e);
      }
    };

    const interval = setInterval(fetchLatest, 30000);
    window.addEventListener("activity-updated", fetchLatest);
    return () => {
      clearInterval(interval);
      window.removeEventListener("activity-updated", fetchLatest);
    };
  }, [open, token, filterModule]);

  // Reset pagination on filter change
  useEffect(() => {
    setPage(1);
    setActivities([]);
  }, [filterModule]);

  return (
    <div className="w-80 h-full bg-card/90 dark:bg-zinc-950/85 backdrop-blur-2xl border-l border-border/40 flex flex-col transition-all duration-300">
      {/* Sidebar Header */}
      <div className="p-4 md:h-16 border-b border-border/40 flex items-center justify-between bg-card/30 shrink-0 z-10">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-primary/10 text-primary shadow shadow-primary/5">
            <Activity className="w-4 h-4" />
          </div>
          <h2 className="font-bold text-sm text-foreground tracking-tight">Recent Activity</h2>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="h-8 w-8 hover:bg-muted text-muted-foreground hover:text-foreground rounded-lg transition-transform active:scale-90"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Module Horizontal Filters */}
      <div className="flex px-4 py-2.5 gap-2 overflow-x-auto shrink-0 border-b border-border/30 bg-card/15 backdrop-blur-xs select-none scrollbar-none">
        {MODULE_OPTIONS.map((mod) => (
          <button
            key={mod}
            onClick={() => setFilterModule(mod)}
            className={`px-3 py-1 rounded-full text-[10px] font-bold tracking-wide uppercase whitespace-nowrap transition-all duration-200 border ${
              filterModule === mod
                ? "bg-primary text-primary-foreground border-primary shadow-sm shadow-primary/10"
                : "bg-muted/45 border-border/50 hover:bg-muted hover:border-border text-muted-foreground hover:text-foreground active:scale-95"
            }`}
          >
            {mod === "ALL" ? "All Logs" : mod.toLowerCase()}
          </button>
        ))}
      </div>

      {/* Timeline Scrollable Content */}
      <div className="flex-1 overflow-y-auto overscroll-contain p-4 scrollbar-thin scrollbar-thumb-muted">
        {loading && activities.length === 0 ? (
          <div className="space-y-5 animate-pulse">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-muted min-w-[32px] shrink-0"></div>
                <div className="space-y-2 flex-1 pt-1">
                  <div className="h-3.5 bg-muted rounded w-5/6"></div>
                  <div className="h-2.5 bg-muted rounded w-2/5"></div>
                </div>
              </div>
            ))}
          </div>
        ) : activities.length === 0 ? (
          <div className="text-center text-muted-foreground flex flex-col items-center justify-center h-48 py-8">
            <div className="w-10 h-10 rounded-full bg-muted/40 flex items-center justify-center mb-3">
              <Clock className="w-5 h-5 opacity-40" />
            </div>
            <p className="text-xs font-semibold">No recent activity found.</p>
            <p className="text-[10px] opacity-60 mt-1">Actions in modules will appear here.</p>
          </div>
        ) : (
          <div className="relative">
            {/* Timeline Vertical Thread Line */}
            <div className="absolute top-4 bottom-4 left-4 w-[1.5px] bg-gradient-to-b from-primary/30 via-border/60 to-transparent pointer-events-none"></div>

            <div className="space-y-5 relative">
              {activities.map((activity) => {
                const config = MODULE_CONFIG[activity.module] || {
                  icon: Activity,
                  color: "text-muted-foreground",
                  bg: "bg-muted",
                  border: "border-muted",
                };
                const ModuleIcon = config.icon;
                const ActionIcon = ACTION_ICONS[activity.type] || Activity;

                return (
                  <div
                    key={activity.id}
                    className="flex gap-4 group cursor-pointer transition-all duration-200 hover:bg-white/[0.04] p-2.5 -mx-2.5 rounded-xl border border-transparent hover:border-border/30 shadow-sm hover:shadow-black/5"
                    onClick={() => {
                      if (activity.link) {
                        navigate(activity.link, { state: { highlightId: activity.entity_id } });
                        onClose();
                      }
                    }}
                  >
                    {/* Timeline Bubble Node */}
                    <div className="relative flex flex-col items-center">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center ${config.bg} ${config.border} border shadow-sm z-10 shrink-0 group-hover:scale-105 transition-transform duration-300`}
                      >
                        <ModuleIcon className={`w-3.5 h-3.5 ${config.color}`} />
                      </div>
                    </div>

                    {/* Timeline Item Description Body */}
                    <div className="flex-1 pt-0.5 min-w-0">
                      <p className="text-xs font-bold text-foreground leading-normal line-clamp-2 mb-1.5 transition-colors group-hover:text-primary">
                        {activity.description}
                      </p>
                      
                      {/* Meta Footer */}
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground/80 font-semibold mb-2">
                        <span
                          className={`inline-flex items-center gap-1 font-bold ${
                            activity.type === "DELETE"
                              ? "text-rose-500/90"
                              : activity.type === "UPDATE"
                              ? "text-amber-500/90"
                              : "text-emerald-500/90"
                          }`}
                        >
                          <ActionIcon className="w-2.5 h-2.5" />
                          {activity.type}
                        </span>
                        <span>•</span>
                        <span className="font-medium text-[9px] opacity-70">
                          {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}
                        </span>
                      </div>

                      {/* User Badge */}
                      <div className="flex items-center gap-1.5">
                        {activity.user_image ? (
                          <img
                            src={activity.user_image}
                            alt={activity.user_name || "User"}
                            className="w-4 h-4 rounded-full object-cover shadow-sm bg-primary/10 border border-primary/20"
                          />
                        ) : (
                          <div className="w-4 h-4 rounded-full bg-primary/20 flex items-center justify-center text-[9px] font-bold text-primary border border-primary/20">
                            {activity.user_name ? activity.user_name.charAt(0).toUpperCase() : "S"}
                          </div>
                        )}
                        <span className="text-[10px] text-muted-foreground font-semibold">
                          {activity.user_name || "System"}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}

              {hasMore && (
                <div ref={observerRef} className="h-10 flex items-center justify-center pb-2 mt-1">
                  <Loader2 className="w-4 h-4 text-primary animate-spin" />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
