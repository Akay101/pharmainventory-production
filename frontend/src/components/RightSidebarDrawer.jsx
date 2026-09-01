import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button } from "./ui/button";

export default function RightSidebarDrawer({
  open,
  onClose,
  title,
  subtitle,
  icon: Icon,
  tabs = [],
  activeTab,
  onTabChange,
  children,
  widthClass = "sm:w-[540px]"
}) {
  // Lock body scroll when drawer is open
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

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex justify-end">
      {/* Dark Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Slide-over Drawer Container */}
      <div className={`relative w-full ${widthClass} h-full bg-card/95 backdrop-blur-md border-l-2 border-border shadow-2xl flex flex-col z-10 animate-in slide-in-from-right duration-300`}>
        {/* Drawer Header */}
        <div className="p-4 border-b border-border bg-muted/40 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 overflow-hidden">
            {Icon && (
              <div className="p-2 rounded-xl bg-orange-500/10 text-orange-500 border border-orange-500/20 shrink-0">
                <Icon className="w-5 h-5" />
              </div>
            )}
            <div className="truncate">
              <h3 className="font-black text-sm text-foreground truncate">
                {title}
              </h3>
              {subtitle && (
                <p className="text-[11px] font-medium text-muted-foreground truncate">
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-8 w-8 p-0 rounded-xl hover:bg-muted shrink-0 cursor-pointer"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </Button>
        </div>

        {/* Navigation Tabs */}
        {tabs.length > 0 && (
          <div className="flex border-b border-border bg-muted/20 px-4 pt-2 gap-2 shrink-0">
            {tabs.map((tab) => {
              const TabIcon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onTabChange && onTabChange(tab.id)}
                  className={`pb-2.5 px-3 text-xs font-bold transition-all border-b-2 flex items-center gap-2 cursor-pointer ${
                    isActive
                      ? "border-orange-500 text-orange-500"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {TabIcon && <TabIcon className="w-3.5 h-3.5" />}
                  <span>{tab.label}</span>
                  {tab.badge !== undefined && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted font-mono font-bold border border-border">
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Drawer Body Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}
