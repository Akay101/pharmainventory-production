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
  Clock
} from "lucide-react";
import { Button } from "./ui/button";

const MODULE_CONFIG = {
  BILLING: { icon: Receipt, color: "text-blue-500", bg: "bg-blue-500/10", border: "border-blue-500/20" },
  PURCHASES: { icon: ShoppingCart, color: "text-purple-500", bg: "bg-purple-500/10", border: "border-purple-500/20" },
  CUSTOMERS: { icon: Users, color: "text-emerald-500", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
  SUPPLIERS: { icon: Truck, color: "text-amber-500", bg: "bg-amber-500/10", border: "border-amber-500/20" },
  INVENTORY: { icon: Package, color: "text-indigo-500", bg: "bg-indigo-500/10", border: "border-indigo-500/20" },
  PRODUCTS: { icon: Package, color: "text-rose-500", bg: "bg-rose-500/10", border: "border-rose-500/20" },
  USERS: { icon: Users, color: "text-cyan-500", bg: "bg-cyan-500/10", border: "border-cyan-500/20" }
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
        const url = filterModule === "ALL" 
          ? `${API}/activities?limit=30&page=${pageNum}` 
          : `${API}/activities?limit=30&page=${pageNum}&module=${filterModule}`;
        
        const res = await axios.get(url, {
          headers: { Authorization: `Bearer ${token}` }
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

  // Real-time polling / event listening (reset to page 1 to ensure freshness)
  useEffect(() => {
    if (!open) return;
    const fetchLatest = async () => {
      try {
        const url = filterModule === "ALL" 
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
    <div className={`w-80 h-full bg-card/90 backdrop-blur-3xl flex flex-col transition-all duration-300`}>
      <div className="p-4 border-b border-white/5 flex items-center justify-between bg-card/30 backdrop-blur-md z-10 w-full md:h-16 shrink-0">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-primary" />
          <h2 className="font-semibold text-foreground tracking-tight">Recent Activity</h2>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="">
          <X className="w-4 h-4" />
        </Button>
      </div>

      <div className="flex px-4 py-2 gap-2 overflow-x-auto custom-scrollbar border-b border-white/5 shrink-0 bg-card/20 backdrop-blur-md">
        {MODULE_OPTIONS.map((mod) => (
          <button
            key={mod}
            onClick={() => setFilterModule(mod)}
            className={`px-3 py-1 rounded-full text-[11px] font-medium whitespace-nowrap transition-colors border ${
              filterModule === mod
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-white/5 border-white/10 hover:bg-white/10 text-muted-foreground hover:text-foreground"
            }`}
          >
            {mod.charAt(0) + mod.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain p-4 custom-scrollbar">
        {loading && activities.length === 0 ? (
          <div className="flex flex-col gap-4 animate-pulse">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-muted min-w-[32px]"></div>
                <div className="space-y-2 flex-1 pt-1">
                  <div className="h-4 bg-muted rounded w-3/4"></div>
                  <div className="h-3 bg-muted rounded w-1/2"></div>
                </div>
              </div>
            ))}
          </div>
        ) : activities.length === 0 ? (
          <div className="text-center text-muted-foreground flex flex-col items-center justify-center h-40">
            <Clock className="w-8 h-8 opacity-20 mb-2" />
            <p className="text-sm">No recent activity found.</p>
          </div>
        ) : (
          <div className="relative">
            {/* Git Graph Vertical Line */}
            <div className="absolute top-4 bottom-4 left-4 w-[2px] bg-gradient-to-b from-white/10 via-white/10 to-transparent"></div>
            
            <div className="space-y-6 relative">
              {activities.map((activity, idx) => {
                const config = MODULE_CONFIG[activity.module] || { icon: Activity, color: "text-muted-foreground", bg: "bg-muted", border: "border-muted" };
                const ModuleIcon = config.icon;
                const ActionIcon = ACTION_ICONS[activity.type] || Activity;
                
                return (
                  <div 
                    key={activity.id} 
                    className="flex gap-4 group cursor-pointer transition-all hover:bg-white/5 p-2 -mx-2 rounded-xl"
                    onClick={() => {
                      if (activity.link) {
                        navigate(activity.link, { state: { highlightId: activity.entity_id } });
                        onClose();
                      }
                    }}
                  >
                    {/* Timeline Node */}
                    <div className="relative flex flex-col items-center">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${config.bg} ${config.border} border shadow-sm z-10 relative group-hover:scale-110 transition-transform`}>
                        <ModuleIcon className={`w-4 h-4 ${config.color}`} />
                      </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 pt-0.5 min-w-0">
                      <div className="flex items-start justify-between gap-1 mb-1">
                        <p className="text-sm font-medium text-foreground leading-tight line-clamp-2">
                          {activity.description}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span className={`flex items-center gap-1 font-medium ${activity.type === 'DELETE' ? 'text-rose-500/80' : activity.type === 'UPDATE' ? 'text-amber-500/80' : 'text-emerald-500/80'}`}>
                          <ActionIcon className="w-3 h-3" />
                          {activity.type}
                        </span>
                        <span>•</span>
                        <span>{formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}</span>
                      </div>
                      <div className="mt-1.5 flex items-center gap-1.5 z-10 relative">
                        {activity.user_image ? (
                          <img src={activity.user_image} alt={activity.user_name || "User"} className="w-5 h-5 rounded-full object-cover shadow-sm bg-primary/10 border border-primary/20" />
                        ) : (
                          <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary border border-primary/20">
                            {activity.user_name ? activity.user_name.charAt(0).toUpperCase() : 'S'}
                          </div>
                        )}
                        <span className="text-xs text-muted-foreground/80 font-medium">{activity.user_name || 'System'}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
              
              {hasMore && (
                <div ref={observerRef} className="h-12 flex items-center justify-center pb-4 mt-2">
                  <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
