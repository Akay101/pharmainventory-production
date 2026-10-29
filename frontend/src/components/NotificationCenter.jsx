import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { API } from "../App";
import {
  Bell,
  Check,
  CheckCheck,
  Clock,
  ExternalLink,
  Loader2,
  MessageCircle,
  Package,
  Pill,
  Receipt,
  RotateCcw,
  Sparkles,
  Trash2,
  Users,
  X,
  AlertTriangle,
  Calendar,
  Phone,
  Rocket,
  Megaphone,
} from "lucide-react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { toast } from "sonner";
import { openWhatsApp } from "../utils/whatsapp";
import { useBroadcasts, assetUrl } from "./broadcast/BroadcastProvider";
import { BroadcastThumb, KIND_META, heroStyle } from "./broadcast/BroadcastRender";

// "Ends in 3 days" for an update's expiry
const endsIn = (d) => {
  if (!d) return null;
  const days = Math.ceil((new Date(d) - Date.now()) / 864e5);
  return days <= 1 ? "Ends today" : `Ends in ${days} days`;
};

export default function NotificationCenter() {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("ALL"); // ALL, REFILL_REMINDER, ALERTS, UPDATES, COMING_SOON
  const broadcasts = useBroadcasts();
  const updates = broadcasts?.updates || [];
  const comingSoon = broadcasts?.comingSoon || [];
  const totalUnread = unreadCount + (broadcasts?.unread || 0);
  const containerRef = useRef(null);

  // Fetch notifications
  const fetchNotifications = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/notifications?limit=40`);
      setNotifications(res.data.notifications || []);
      setUnreadCount(res.data.unread_count || 0);
    } catch (err) {
      console.error("Error fetching notifications:", err);
    }
  }, []);

  // Poll unread count periodically
  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60000); // every 60s
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // Handle outside click to close dropdown
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const handleMarkAsRead = async (id, e) => {
    if (e) e.stopPropagation();
    try {
      await axios.put(`${API}/notifications/${id}/read`);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      toast.error("Failed to mark as read");
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await axios.put(`${API}/notifications/mark-all-read`);
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
      toast.success("All notifications marked as read");
    } catch (err) {
      toast.error("Failed to mark all as read");
    }
  };

  const handleDeleteNotification = async (id, e) => {
    if (e) e.stopPropagation();
    try {
      await axios.delete(`${API}/notifications/${id}`);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      toast.error("Failed to delete notification");
    }
  };

  const handleOpenWhatsApp = (notification, e) => {
    if (e) e.stopPropagation();
    const { customer_name, customer_mobile, items, refill_target_date } =
      notification.data || {};

    const itemsList = (items || []).map((i) => i.product_name).join(", ");
    const message = `Hello ${customer_name || "Sir/Madam"},\n\nThis is a gentle refill reminder from our pharmacy regarding your medicines (${
      itemsList || "regular prescription"
    }).\n\nYour estimated refill date is around ${
      refill_target_date || "this week"
    }.\n\nPlease let us know if you would like us to keep your stock ready for pickup or home delivery!\n\nThank you!`;

    openWhatsApp({
      phone: customer_mobile,
      message,
    });
  };

  // Refill reminder -> a purchase draft filled from the reminder (last
  // supplier, pack, rates, quantity); the user checks batch and expiry
  const [orderingId, setOrderingId] = useState(null);
  const orderRestock = async (notification, e) => {
    e?.stopPropagation();
    const reminderId = notification.data?.reminder_id;
    if (!reminderId || orderingId) return;
    if (!notification.is_read) handleMarkAsRead(notification.id);
    setOrderingId(notification.id);
    try {
      const res = await axios.post(`${API}/reminders/${reminderId}/purchase-draft`);
      setIsOpen(false);
      navigate("/purchases", { state: { openPurchaseDraft: res.data.draft.id } });
    } catch (err) {
      // Older reminders without stored items: fall back to a blank purchase with the names
      setIsOpen(false);
      navigate("/purchases", { state: { openNew: true, restockItems: notification.data?.items || [] } });
      if (err.response?.status !== 404) toast.error(err.response?.data?.detail || "Couldn't prepare the purchase; opened a new one instead");
    } finally {
      setOrderingId(null);
    }
  };

  const handleNotificationClick = (notification) => {
    // Refill reminders open the Restock section on that reminder
    if (notification.type === "REFILL_REMINDER" && notification.data?.reminder_id) {
      if (!notification.is_read) handleMarkAsRead(notification.id);
      setIsOpen(false);
      navigate("/restock", { state: { highlightId: notification.data.reminder_id } });
      return;
    }
    if (!notification.is_read) {
      handleMarkAsRead(notification.id);
    }
    if (notification.data?.link) {
      setIsOpen(false);
      navigate(notification.data.link);
    }
  };

  const filteredNotifications = notifications.filter((n) => {
    if (activeTab === "ALL") return true;
    if (activeTab === "REFILL_REMINDER") return n.type === "REFILL_REMINDER";
    if (activeTab === "ALERTS") return n.type !== "REFILL_REMINDER";
    return true;
  });

  return (
    <div className="relative" ref={containerRef}>
      {/* Bell Trigger Button */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen) {
            fetchNotifications();
            broadcasts?.refresh();
          }
        }}
        className={`group relative rounded-xl border border-border/60 dark:border-border/40 h-9 w-9 transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer ${
          isOpen
            ? "bg-orange-500/15 text-orange-500 border-orange-500/40 shadow-xs"
            : "hover:bg-muted/80"
        }`}
        data-testid="notifications-btn"
        title="Notifications & Refill Reminders"
      >
        <Bell className={`w-4.5 h-4.5 text-foreground transition-transform duration-200 ${totalUnread > 0 ? "animate-bell-wiggle" : "group-hover:rotate-12"}`} />
        {totalUnread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-orange-500 text-white text-[10px] font-black rounded-full flex items-center justify-center px-1 shadow-md shadow-orange-500/30 animate-in zoom-in-50 duration-200">
            {totalUnread > 99 ? "99+" : totalUnread}
          </span>
        )}
      </Button>

      {/* Floating Notifications Dropdown Panel */}
      {isOpen && (
        <div className="absolute right-0 top-12 w-[360px] sm:w-[420px] max-h-[540px] max-md:fixed max-md:left-2 max-md:right-2 max-md:top-[calc(3.75rem+env(safe-area-inset-top))] max-md:w-auto max-md:max-h-[75dvh] bg-card border border-border/90 dark:border-border/60 rounded-2xl shadow-2xl z-50 flex flex-col overflow-hidden backdrop-blur-2xl animate-in fade-in-0 zoom-in-95 slide-in-from-top-2 duration-200 origin-top-right">
          {/* Header */}
          <div className="p-4 border-b border-border/70 flex items-center justify-between bg-muted/30">
            <div className="flex items-center gap-2">
              <h3 className="font-extrabold text-sm text-foreground">
                Notifications
              </h3>
              {totalUnread > 0 && (
                <Badge className="bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-500/30 text-[10px] font-extrabold px-1.5 py-0.5">
                  {totalUnread} new
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleMarkAllRead}
                  className="text-xs font-bold text-muted-foreground hover:text-foreground h-7 px-2"
                >
                  <CheckCheck className="w-3.5 h-3.5 mr-1 text-orange-500" />
                  Mark all read
                </Button>
              )}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1 text-muted-foreground hover:text-foreground rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Filter Tabs */}
          <div className="flex flex-wrap items-center gap-1 p-2 bg-muted/20 border-b border-border/50 text-xs">
            <button
              type="button"
              onClick={() => setActiveTab("ALL")}
              className={`px-3 py-1 rounded-lg font-bold transition-all ${
                activeTab === "ALL"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              All ({notifications.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("REFILL_REMINDER")}
              className={`px-3 py-1 rounded-lg font-bold transition-all flex items-center gap-1.5 ${
                activeTab === "REFILL_REMINDER"
                  ? "bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-500/30 shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <RotateCcw className="w-3 h-3" />
              Refills (
              {
                notifications.filter((n) => n.type === "REFILL_REMINDER").length
              }
              )
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("ALERTS")}
              className={`px-3 py-1 rounded-lg font-bold transition-all ${
                activeTab === "ALERTS"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Alerts (
              {
                notifications.filter((n) => n.type !== "REFILL_REMINDER").length
              }
              )
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("UPDATES")}
              data-testid="notif-tab-updates"
              className={`px-3 py-1 rounded-lg font-bold transition-all flex items-center gap-1.5 ${
                activeTab === "UPDATES"
                  ? "bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-500/30 shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Megaphone className="w-3 h-3" />
              Updates ({updates.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("COMING_SOON")}
              data-testid="notif-tab-coming-soon"
              className={`px-3 py-1 rounded-lg font-bold transition-all flex items-center gap-1.5 ${
                activeTab === "COMING_SOON"
                  ? "bg-violet-500/15 text-violet-600 dark:text-violet-400 border border-violet-500/30 shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Rocket className="w-3 h-3" />
              Upcoming ({comingSoon.length})
            </button>
          </div>

          {/* Notifications List */}
          <div className="flex-1 overflow-y-auto divide-y divide-border/40 max-h-[380px] p-1">
            {activeTab === "UPDATES" || activeTab === "COMING_SOON" ? (
              <BroadcastList
                kind={activeTab}
                rows={activeTab === "UPDATES" ? updates : comingSoon}
                ctx={broadcasts}
                onOpen={(b) => {
                  setIsOpen(false);
                  broadcasts.open(b.id);
                }}
              />
            ) : (
            <>
            {activeTab === "ALL" && updates.length > 0 && (
              <BroadcastList
                kind="UPDATES"
                compact
                rows={updates.slice(0, 3)}
                ctx={broadcasts}
                onMore={updates.length > 3 ? () => setActiveTab("UPDATES") : null}
                onOpen={(b) => {
                  setIsOpen(false);
                  broadcasts.open(b.id);
                }}
              />
            )}
            {filteredNotifications.length === 0 ? (
              activeTab === "ALL" && updates.length > 0 ? null : (
              <div className="py-12 px-4 text-center space-y-2">
                <div className="w-10 h-10 rounded-full bg-muted/50 flex items-center justify-center mx-auto text-muted-foreground">
                  <Bell className="w-5 h-5 opacity-40" />
                </div>
                <p className="text-xs font-bold text-foreground">
                  No notifications
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {activeTab === "REFILL_REMINDER"
                    ? "No restock or refill reminders due right now."
                    : "You are completely caught up!"}
                </p>
              </div>
              )
            ) : (
              filteredNotifications.map((n) => {
                const isRefill = n.type === "REFILL_REMINDER";
                const isUnread = !n.is_read;

                return (
                  <div
                    key={n.id}
                    onClick={() => handleNotificationClick(n)}
                    className={`p-3.5 rounded-xl transition-all cursor-pointer group flex gap-3 relative ${
                      isUnread
                        ? "bg-orange-500/[0.04] hover:bg-orange-500/[0.08]"
                        : "hover:bg-muted/50 opacity-80 hover:opacity-100"
                    }`}
                  >
                    {/* Icon Badge */}
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        isRefill
                          ? "bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-500/30"
                          : "bg-blue-500/15 text-blue-500 border border-blue-500/30"
                      }`}
                    >
                      {isRefill ? (
                        <RotateCcw className="w-4 h-4" />
                      ) : (
                        <AlertTriangle className="w-4 h-4" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="text-xs font-extrabold text-foreground truncate">
                          {n.title}
                        </h4>
                        {isUnread && (
                          <span className="w-2 h-2 rounded-full bg-orange-500 shrink-0" />
                        )}
                      </div>

                      <p className="text-[11px] text-muted-foreground font-medium leading-relaxed line-clamp-2">
                        {n.message}
                      </p>

                      {/* Refill details badge */}
                      {isRefill && n.data && (
                        <div className="pt-1 flex flex-wrap items-center gap-1.5 text-[10px]">
                          {n.data.customer_mobile && (
                            <span className="font-mono bg-muted/60 px-1.5 py-0.5 rounded text-foreground font-bold flex items-center gap-1">
                              <Phone className="w-2.5 h-2.5 text-muted-foreground" />
                              {n.data.customer_mobile}
                            </span>
                          )}
                          {n.data.refill_target_date && (
                            <span className="bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20 px-1.5 py-0.5 rounded font-bold">
                              Refill: {n.data.refill_target_date}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Action buttons row */}
                      <div className="pt-2 flex items-center justify-between gap-2">
                        <span className="text-[10px] text-muted-foreground font-medium flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(n.created_at).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                          })}
                        </span>

                        <div className="flex items-center gap-1">
                          {isRefill && n.data?.customer_mobile && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => handleOpenWhatsApp(n, e)}
                              className="h-6 px-2 text-[10px] font-extrabold text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10 rounded-lg"
                            >
                              <MessageCircle className="w-3 h-3 mr-1" />
                              WhatsApp
                            </Button>
                          )}

                          {isRefill && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => orderRestock(n, e)}
                              disabled={orderingId === n.id}
                              className="h-6 px-2 text-[10px] font-extrabold text-orange-600 dark:text-orange-400 border-orange-500/30 hover:bg-orange-500/10 rounded-lg"
                              data-testid="order-restock"
                            >
                              <Package className="w-3 h-3 mr-1" />
                              {orderingId === n.id ? "Preparing..." : "Order stock"}
                            </Button>
                          )}

                          <button
                            type="button"
                            onClick={(e) =>
                              handleDeleteNotification(n.id, e)
                            }
                            className="p-1 text-muted-foreground hover:text-destructive transition-colors rounded"
                            title="Dismiss"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Admin broadcasts inside the panel. Updates can be cleared (and go by
// themselves when they expire); coming-soon items stay until the feature ships.
function BroadcastList({ kind, rows, ctx, onOpen, onMore, compact = false }) {
  const isSoon = kind === "COMING_SOON";
  const markSeen = ctx?.markSeen;
  useEffect(() => {
    rows.forEach((b) => !b.state.seen && markSeen?.(b.id));
  }, [rows, markSeen]);

  if (!rows.length) {
    return (
      <div className="py-12 px-4 text-center space-y-2">
        <div className="w-10 h-10 rounded-full bg-muted/50 flex items-center justify-center mx-auto text-muted-foreground">
          {isSoon ? <Rocket className="w-5 h-5 opacity-40" /> : <Megaphone className="w-5 h-5 opacity-40" />}
        </div>
        <p className="text-xs font-bold text-foreground">{isSoon ? "Nothing announced yet" : "No updates"}</p>
        <p className="text-[11px] text-muted-foreground">{isSoon ? "Features we're building for you will show up here." : "News and offers from DavaDesk show up here."}</p>
      </div>
    );
  }

  if (isSoon) {
    return (
      <div className="space-y-2 p-1.5">
        {rows.map((b) => (
          <button
            key={b.id}
            type="button"
            onClick={() => onOpen(b)}
            className="relative w-full overflow-hidden rounded-xl p-3.5 text-left text-white shadow-sm transition-transform duration-200 hover:scale-[1.01]"
            style={heroStyle(b.theme)}
          >
            <div className="flex items-start gap-3">
              <span className="text-2xl leading-none">{b.emoji || "🚀"}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="rounded-full bg-white/20 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider">Coming soon</span>
                  {b.eta_label && <span className="text-[10px] font-bold opacity-90">{b.eta_label}</span>}
                  {!b.state.opened && <span className="ml-auto h-2 w-2 rounded-full bg-white" />}
                </div>
                <p className="mt-1 text-[13px] font-extrabold leading-snug">{b.title}</p>
                <p className="mt-0.5 line-clamp-2 text-[11px] font-medium opacity-90">{b.summary}</p>
              </div>
            </div>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className={compact ? "pb-1" : ""}>
      {compact && <p className="px-3 pt-2 pb-1 text-[10px] font-black uppercase tracking-wider text-muted-foreground">From DavaDesk</p>}
      {rows.map((b) => (
        <div
          key={b.id}
          onClick={() => onOpen(b)}
          className={`p-3 rounded-xl transition-all cursor-pointer group flex gap-3 ${!b.state.opened ? "bg-orange-500/[0.04] hover:bg-orange-500/[0.08]" : "hover:bg-muted/50"}`}
          data-testid="broadcast-item"
        >
          <BroadcastThumb b={b} assetUrl={assetUrl} size={40} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <h4 className="truncate text-xs font-extrabold text-foreground">{b.title}</h4>
              {!b.state.opened && <span className="h-2 w-2 shrink-0 rounded-full bg-orange-500" />}
            </div>
            <p className="line-clamp-2 text-[11px] font-medium leading-relaxed text-muted-foreground">{b.summary}</p>
            <div className="flex items-center justify-between gap-2 pt-1.5">
              <span className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground">
                <span className="rounded bg-muted px-1.5 py-0.5 font-bold text-foreground/80">{KIND_META[b.kind]?.short}</span>
                {endsIn(b.expires_at)}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  ctx.clear(b.id);
                }}
                className="rounded p-1 text-muted-foreground transition-colors hover:text-destructive"
                title="Clear"
                data-testid="broadcast-clear"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          </div>
        </div>
      ))}
      {onMore && (
        <button type="button" onClick={onMore} className="w-full px-3 py-1.5 text-left text-[11px] font-bold text-orange-600 hover:underline dark:text-orange-400">
          See all updates
        </button>
      )}
      {!compact && rows.length > 1 && (
        <button type="button" onClick={ctx.clearAll} className="w-full px-3 py-2 text-center text-[11px] font-bold text-muted-foreground hover:text-destructive" data-testid="broadcast-clear-all">
          Clear all updates
        </button>
      )}
    </div>
  );
}
