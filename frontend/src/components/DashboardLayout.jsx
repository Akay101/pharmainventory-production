import { useState, useEffect } from "react";
import { Outlet, NavLink, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../App";
import { Button } from "./ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Sheet, SheetContent, SheetTrigger } from "./ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Receipt,
  Truck,
  Users,
  UserCog,
  Settings,
  BarChart3,
  LogOut,
  Menu,
  ChevronDown,
  Bell,
  Sun,
  Moon,
  PanelLeftClose,
  PanelLeft,
  Activity,
} from "lucide-react";

import RecentActivitySidebar from "./RecentActivitySidebar";
import { useKeyboardShortcut, formatShortcut } from "../hooks/useKeyboard";
import AgentWidget from "./Agent/AgentWidget";
import PlanBadge from "./PlanBadge";

const navItems = [
  { path: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  {
    path: "/inventory",
    label: "Inventory",
    icon: Package,
    shortcut: ["alt", "i"],
  },
  {
    path: "/purchases",
    label: "Purchases",
    icon: ShoppingCart,
    shortcut: ["alt", "p"],
  },
  { path: "/billing", label: "Billing", icon: Receipt, shortcut: ["alt", "b"] },
  {
    path: "/suppliers",
    label: "Suppliers",
    icon: Truck,
    shortcut: ["alt", "s"],
  },
  {
    path: "/customers",
    label: "Customers",
    icon: Users,
    shortcut: ["alt", "c"],
  },
  { path: "/users", label: "Users", icon: UserCog, adminOnly: true },
  { path: "/reports", label: "Reports", icon: BarChart3 },
  { path: "/settings", label: "Settings", icon: Settings },
];

const Sidebar = ({ mobile = false, onClose, collapsed = false, onToggle }) => {
  const { user, pharmacy, isAdmin } = useAuth();
  const location = useLocation();

  const filteredItems = navItems.filter((item) => !item.adminOnly || isAdmin);

  return (
    <TooltipProvider delayDuration={0}>
      <div className="flex flex-col h-full bg-zinc-950/10 dark:bg-zinc-950/30">
        {/* Logo Section */}
        <div
          className={`p-4 border-b border-border/40 ${collapsed ? "px-2" : "p-6"}`}
        >
          <div
            className={`flex items-center ${collapsed ? "justify-center" : "gap-3"}`}
          >
            {pharmacy?.logo_url ? (
              <img
                src={pharmacy.logo_url}
                alt={pharmacy.name}
                className={`rounded-xl object-cover border border-border/50 shadow-md shadow-primary/5 transition-transform duration-300 ${
                  collapsed ? "w-8 h-8" : "w-10 h-10"
                }`}
              />
            ) : (
              <div
                className={`rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20 transition-all duration-300 ${
                  collapsed ? "w-9 h-9" : "w-10 h-10"
                }`}
              >
                <span
                  className={`text-primary-foreground font-black tracking-wider ${collapsed ? "text-base" : "text-lg"}`}
                >
                  P
                </span>
              </div>
            )}
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <h1 className="font-extrabold text-base text-foreground truncate tracking-tight">
                  {pharmacy?.name || "Test Instance"}
                </h1>
                <p className="text-[10px] font-semibold text-muted-foreground/80 truncate">
                  {pharmacy?.location}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Collapse Toggle - Desktop only */}
        {!mobile && (
          <div
            className={`px-3 py-2 border-b border-border/40 ${collapsed ? "flex justify-center" : ""}`}
          >
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggle}
              className={`w-full text-muted-foreground hover:text-foreground h-9 hover:bg-white/5 active:scale-[0.98] ${
                collapsed ? "px-2" : "justify-start px-3"
              }`}
              data-testid="sidebar-toggle"
            >
              {collapsed ? (
                <PanelLeft className="w-4 h-4 text-primary" />
              ) : (
                <div className="flex items-center gap-2">
                  <PanelLeftClose className="w-4 h-4 text-primary" />
                  <span className="text-xs font-bold uppercase tracking-wider">
                    Collapse Sidebar
                  </span>
                </div>
              )}
            </Button>
          </div>
        )}

        {/* Navigation Section */}
        <nav
          className={`flex-1 p-2 space-y-1.5 overflow-y-auto ${collapsed ? "px-1" : "p-4"}`}
        >
          {filteredItems.map((item) => {
            const isItemActive =
              location.pathname === item.path ||
              (item.path !== "/dashboard" &&
                location.pathname.startsWith(item.path));

            return collapsed ? (
              <Tooltip key={item.path}>
                <TooltipTrigger asChild>
                  <NavLink
                    to={item.path}
                    onClick={onClose}
                    className={`flex items-center justify-center w-10 h-10 mx-auto rounded-xl transition-all duration-250 cursor-pointer ${
                      isItemActive
                        ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20 font-bold opacity-100"
                        : "text-muted-foreground hover:text-foreground hover:bg-white/5 opacity-70 hover:opacity-100"
                    }`}
                    data-testid={`nav-${item.path.slice(1)}`}
                  >
                    <item.icon
                      className={`w-5 h-5 shrink-0 ${isItemActive ? "text-primary-foreground" : "text-muted-foreground"}`}
                    />
                  </NavLink>
                </TooltipTrigger>
                <TooltipContent side="right" className="font-bold text-xs">
                  {item.label}
                </TooltipContent>
              </Tooltip>
            ) : (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={onClose}
                className={`sidebar-link flex justify-between items-center group py-2.5 px-4 transition-all duration-200 ${
                  isItemActive ? "nav-item-active" : ""
                }`}
                data-testid={`nav-${item.path.slice(1)}`}
              >
                <div className="flex items-center gap-3">
                  <item.icon className="w-5 h-5 shrink-0" />
                  <span className="text-sm font-semibold">{item.label}</span>
                </div>
                {item.shortcut && (
                  <kbd className="opacity-0 group-hover:opacity-100 transition-opacity text-[9px] font-mono font-bold text-muted-foreground/60 bg-muted/80 dark:bg-white/10 px-1.5 py-0.5 rounded border border-border/30 shadow-sm uppercase">
                    {formatShortcut(item.shortcut)}
                  </kbd>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* User Profile Container */}
        <div
          className={`p-2 border-t border-border/40 ${collapsed ? "px-1" : "p-4"}`}
        >
          {collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex justify-center p-1 cursor-pointer">
                  <Avatar className="w-8 h-8 ring-1 ring-border/50 shadow-md">
                    <AvatarImage src={user?.image_url} />
                    <AvatarFallback className="bg-primary/20 text-primary font-bold text-xs">
                      {user?.name?.charAt(0)?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </div>
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs font-bold">
                {user?.name} • {user?.role}
              </TooltipContent>
            </Tooltip>
          ) : (
            <div className="flex items-center gap-3 p-2.5 rounded-xl bg-card/40 border border-border/30 shadow-sm">
              <Avatar className="w-9 h-9 ring-1 ring-border/50 shadow-md shrink-0">
                <AvatarImage src={user?.image_url} />
                <AvatarFallback className="bg-primary/20 text-primary font-bold">
                  {user?.name?.charAt(0)?.toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-foreground truncate leading-tight">
                  {user?.name}
                </p>
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-primary/10 text-primary uppercase tracking-wide mt-1">
                  {user?.role}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
};

export default function DashboardLayout() {
  const { user, logout, settings, updateSetting } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  useKeyboardShortcut("b", () => navigate("/billing"), { alt: true });
  useKeyboardShortcut("p", () => navigate("/purchases"), { alt: true });
  useKeyboardShortcut("i", () => navigate("/inventory"), { alt: true });
  useKeyboardShortcut("s", () => navigate("/suppliers"), { alt: true });
  useKeyboardShortcut("c", () => navigate("/customers"), { alt: true });

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const stored = localStorage.getItem("sidebarCollapsed");
    return stored === "true";
  });

  const [isDark, setIsDark] = useState(() => {
    const stored = localStorage.getItem("theme");
    return stored ? stored === "dark" : true;
  });

  const [activityOpen, setActivityOpen] = useState(() => {
    const stored = localStorage.getItem("activityOpen");
    return stored ? stored === "true" : window.innerWidth >= 1024;
  });

  // Sync settings when loaded
  useEffect(() => {
    if (settings) {
      if (settings.sidebar_collapsed !== undefined) {
        setSidebarCollapsed(settings.sidebar_collapsed);
      }
      if (settings.theme !== undefined) {
        setIsDark(settings.theme === "dark");
      }
      if (settings.activity_sidebar_open !== undefined) {
        setActivityOpen(settings.activity_sidebar_open);
      }
    }
  }, [settings]);

  useKeyboardShortcut("a", () => toggleActivity(), {
    alt: true,
  });

  const location = useLocation();

  useEffect(() => {
    if (location.state?.highlightId) {
      const id = location.state.highlightId;
      let attempts = 0;
      const interval = setInterval(() => {
        const el = document.getElementById(`record-${id}`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          el.classList.add(
            "bg-primary/20",
            "transition-colors",
            "duration-1000"
          );
          setTimeout(() => {
            el.classList.remove("bg-primary/20");
          }, 2000);
          clearInterval(interval);
        } else if (attempts > 10) {
          clearInterval(interval);
        }
        attempts++;
      }, 500);

      return () => clearInterval(interval);
    }
  }, [location.state?.highlightId]);

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.remove("light");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.add("light");
      localStorage.setItem("theme", "light");
    }
  }, [isDark]);

  const toggleTheme = () => {
    const nextDark = !isDark;
    setIsDark(nextDark);
    updateSetting("theme", nextDark ? "dark" : "light");
  };

  const toggleSidebar = () => {
    const nextCollapsed = !sidebarCollapsed;
    setSidebarCollapsed(nextCollapsed);
    updateSetting("sidebar_collapsed", nextCollapsed);
    localStorage.setItem("sidebarCollapsed", String(nextCollapsed));
  };

  const toggleActivity = () => {
    const nextOpen = !activityOpen;
    setActivityOpen(nextOpen);
    updateSetting("activity_sidebar_open", nextOpen);
    localStorage.setItem("activityOpen", String(nextOpen));
  };

  const closeActivity = () => {
    setActivityOpen(false);
    updateSetting("activity_sidebar_open", false);
    localStorage.setItem("activityOpen", "false");
  };

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div
      className="min-h-screen bg-background flex select-none overflow-hidden"
      data-testid="dashboard-layout"
    >
      {/* Desktop Sidebar (Collapsible) */}
      <aside
        className={`border-r border-border/40 bg-card/25 backdrop-blur-xl hidden md:flex flex-col fixed h-full z-50 transition-all duration-300 ease-in-out ${
          sidebarCollapsed ? "w-16" : "w-64"
        }`}
      >
        <Sidebar collapsed={sidebarCollapsed} onToggle={toggleSidebar} />
      </aside>

      {/* Main Content Layout Wrapper */}
      <div
        className={`flex-1 flex flex-col min-h-screen transition-all duration-300 ease-in-out ${
          sidebarCollapsed ? "md:ml-16" : "md:ml-64"
        }`}
      >
        {/* Floating Glassy Header */}
        <header className="h-16 border-b border-border/40 bg-card/25 backdrop-blur-xl sticky top-0 z-40 w-full transition-all">
          <div className="h-full px-4 md:px-6 flex items-center justify-between">
            {/* Mobile Menu Trigger */}
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild className="md:hidden">
                <Button
                  variant="ghost"
                  size="icon"
                  className="hover:bg-muted"
                  data-testid="mobile-menu-btn"
                >
                  <Menu className="w-5 h-5" />
                </Button>
              </SheetTrigger>
              <SheetContent
                side="left"
                className="w-64 p-0 bg-card border-r border-border/40"
              >
                <Sidebar mobile onClose={() => setMobileOpen(false)} />
              </SheetContent>
            </Sheet>

            <div className="hidden md:block" />

            {/* Right Header Navigation Panel */}
            <div className="flex items-center gap-3">
              {user?.subscription_plan && (
                <PlanBadge plan={user.subscription_plan} />
              )}

              {/* Theme Toggle Button */}
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleTheme}
                data-testid="theme-toggle-btn"
                className="relative hover:bg-muted transition-transform active:scale-95"
              >
                {isDark ? (
                  <Sun className="w-5 h-5 text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.3)]" />
                ) : (
                  <Moon className="w-5 h-5 text-violet-600 drop-shadow-[0_0_8px_rgba(124,58,237,0.2)]" />
                )}
              </Button>

              {/* Notification Button */}
              <Button
                variant="ghost"
                size="icon"
                className="relative hover:bg-muted"
                data-testid="notifications-btn"
              >
                <Bell className="w-5 h-5" />
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-destructive rounded-full shadow shadow-destructive/50 animate-pulse"></span>
              </Button>

              {/* Recent Activity Panel Toggle */}
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleActivity}
                className={`relative hover:bg-muted transition-all duration-200 ${
                  activityOpen
                    ? "bg-primary/10 text-primary hover:bg-primary/20"
                    : ""
                }`}
                title="Recent Activity (Alt + A)"
              >
                <Activity className="w-5 h-5" />
              </Button>

              {/* User Dropdown Menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="flex items-center gap-2 hover:bg-muted px-2 py-1.5 rounded-xl transition-all"
                    data-testid="user-menu-btn"
                  >
                    <Avatar className="w-8 h-8 ring-1 ring-border/50 shadow-sm shrink-0">
                      <AvatarImage src={user?.image_url} />
                      <AvatarFallback className="bg-primary/20 text-primary text-xs font-bold">
                        {user?.name?.charAt(0)?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="hidden sm:inline text-sm font-bold text-foreground">
                      {user?.name}
                    </span>
                    <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="w-48 mt-1 border border-border/40 shadow-xl rounded-xl"
                >
                  <DropdownMenuItem
                    onClick={() => navigate("/settings")}
                    data-testid="settings-dropdown"
                    className="cursor-pointer font-medium py-2 rounded-lg"
                  >
                    <Settings className="w-4 h-4 mr-2 text-primary" />
                    Settings
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-border/40" />
                  <DropdownMenuItem
                    onClick={handleLogout}
                    data-testid="logout-btn"
                    className="text-destructive focus:text-destructive cursor-pointer font-medium py-2 rounded-lg"
                  >
                    <LogOut className="w-4 h-4 mr-2" />
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        {/* Inner Page View Controller */}
        <div className="flex-1 relative flex overflow-hidden">
          <main className="flex-1 p-4 md:p-6 lg:p-8 overflow-y-auto w-full">
            <Outlet />
          </main>

          {/* Activity Sidebar overlay backdrop */}
          {activityOpen && (
            <div
              className="fixed inset-0 z-45 bg-black/40 backdrop-blur-xs transition-opacity duration-300 md:hidden"
              onClick={closeActivity}
            />
          )}

          {/* Activity Sidebar drawer panel overlay */}
          <div
            className={`fixed right-0 top-0 bottom-0 z-50 shadow-2xl transition-transform duration-300 ease-in-out transform activity-sidebar ${
              activityOpen ? "translate-x-0" : "translate-x-full"
            }`}
          >
            <RecentActivitySidebar
              open={activityOpen}
              onClose={closeActivity}
            />
          </div>
        </div>
      </div>

      {/* Global AI Agent Interface widget */}
      <AgentWidget user={user} />
    </div>
  );
}
