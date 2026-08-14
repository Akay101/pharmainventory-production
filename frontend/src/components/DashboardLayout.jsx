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
  Activity,
  Sparkles,
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

export default function DashboardLayout() {
  const { user, pharmacy, logout, updateSetting, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(() => {
    return localStorage.getItem("activityOpen") === "true";
  });

  const [isDark, setIsDark] = useState(() => {
    return !document.documentElement.classList.contains("light");
  });

  const filteredItems = navItems.filter((item) => !item.adminOnly || isAdmin);

  // Keyboard Shortcuts
  useKeyboardShortcut(["alt", "i"], () => navigate("/inventory"));
  useKeyboardShortcut(["alt", "p"], () => navigate("/purchases"));
  useKeyboardShortcut(["alt", "b"], () => navigate("/billing"));
  useKeyboardShortcut(["alt", "s"], () => navigate("/suppliers"));
  useKeyboardShortcut(["alt", "c"], () => navigate("/customers"));
  useKeyboardShortcut(["alt", "a"], () => toggleActivity());

  // Listen to dark/light theme mutations
  useEffect(() => {
    const handleClassChange = () => {
      setIsDark(!document.documentElement.classList.contains("light"));
    };

    const observer = new MutationObserver(handleClassChange);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => observer.disconnect();
  }, []);

  // Highlight scroll handler
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

  const toggleTheme = () => {
    const nextDark = !isDark;
    setIsDark(nextDark);
    if (nextDark) {
      document.documentElement.classList.remove("light");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.add("light");
      localStorage.setItem("theme", "light");
    }
    updateSetting("theme", nextDark ? "dark" : "light");
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
    <TooltipProvider delayDuration={0}>
      <div
        className="min-h-screen bg-background flex flex-col select-none overflow-x-hidden"
        data-testid="dashboard-layout"
      >
        {/* Seamless Glassy Top Header Navigation Bar */}
        <header className="sticky top-0 z-40 w-full border-b border-border/80 dark:border-border/50 bg-background/85 dark:bg-zinc-950/85 backdrop-blur-xl transition-colors duration-200">
          <div className="w-full h-16 px-4 sm:px-6 flex items-center justify-between gap-4">
            {/* Left Brand Identifier */}
            <div className="flex items-center gap-3 shrink-0">
              {/* Mobile Drawer Sheet Trigger */}
              <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                <SheetTrigger asChild className="xl:hidden">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="hover:bg-muted/80 rounded-xl"
                    data-testid="mobile-menu-btn"
                  >
                    <Menu className="w-5 h-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent
                  side="left"
                  className="w-72 p-6 bg-background/95 backdrop-blur-xl border-r border-border/80 flex flex-col justify-between"
                >
                  <div className="space-y-6">
                    {/* Sheet Brand Logo */}
                    <div className="flex items-center gap-3 border-b border-border/50 pb-4">
                      {pharmacy?.logo_url ? (
                        <img
                          src={pharmacy.logo_url}
                          alt={pharmacy.name}
                          className="w-10 h-10 rounded-xl object-cover border border-border/50 shadow-sm"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center text-white font-black text-base shadow-md shadow-orange-500/20">
                          {pharmacy?.name?.charAt(0) || "P"}
                        </div>
                      )}
                      <div>
                        <h2 className="font-black text-sm text-foreground leading-tight">
                          {pharmacy?.name || "Pharmalogy"}
                        </h2>
                        <span className="text-[10px] text-orange-600 dark:text-orange-400 font-extrabold flex items-center gap-1 mt-0.5">
                          <Sparkles className="w-2.5 h-2.5 text-orange-500" />
                          {user?.subscription_plan
                            ? `${user.subscription_plan} Plan`
                            : "Agentic Plan"}
                        </span>
                      </div>
                    </div>

                    {/* Sheet Navigation Items */}
                    <nav className="space-y-1.5">
                      {filteredItems.map((item) => {
                        const isItemActive = location.pathname === item.path;
                        return (
                          <NavLink
                            key={item.path}
                            to={item.path}
                            onClick={() => setMobileOpen(false)}
                            className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${
                              isItemActive
                                ? "bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-md shadow-orange-500/25"
                                : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                            }`}
                          >
                            <item.icon className="w-5 h-5 shrink-0" />
                            <span>{item.label}</span>
                          </NavLink>
                        );
                      })}
                    </nav>
                  </div>

                  {/* Sheet Footer Logout */}
                  <div className="border-t border-border/50 pt-4">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setMobileOpen(false);
                        handleLogout();
                      }}
                      className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/20 font-bold rounded-xl h-10"
                    >
                      <LogOut className="w-4 h-4 mr-2" />
                      Logout
                    </Button>
                  </div>
                </SheetContent>
              </Sheet>

              {/* Desktop Logo & Name */}
              <div
                onClick={() => navigate("/dashboard")}
                className="flex items-center gap-3 cursor-pointer group"
              >
                {pharmacy?.logo_url ? (
                  <img
                    src={pharmacy.logo_url}
                    alt={pharmacy.name}
                    className="w-9 h-9 rounded-xl object-cover border border-border/60 shadow-sm group-hover:scale-105 transition-transform"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center text-white font-black text-sm shadow-md shadow-orange-500/20 group-hover:scale-105 transition-transform">
                    {pharmacy?.name?.charAt(0) || "P"}
                  </div>
                )}
                <div className="hidden sm:flex flex-col">
                  <span className="font-black text-sm tracking-tight text-foreground group-hover:text-orange-500 transition-colors leading-tight">
                    {pharmacy?.name || "Pharmalogy"}
                  </span>
                  <span className="text-[10px] text-orange-600 dark:text-orange-400 font-extrabold flex items-center gap-1">
                    <Sparkles className="w-2.5 h-2.5 text-orange-500" />
                    {user?.subscription_plan
                      ? `${user.subscription_plan} Plan`
                      : "Agentic Plan"}
                  </span>
                </div>
              </div>
            </div>

            {/* Center Top Horizontal Navigation Bar (Desktop / XL) */}
            <nav className="hidden xl:flex items-center gap-1 bg-muted/40 dark:bg-muted/20 p-1.5 rounded-2xl border border-border/60 dark:border-border/40 shadow-xs">
              {filteredItems.map((item) => {
                const isItemActive = location.pathname === item.path;
                return (
                  <Tooltip key={item.path}>
                    <TooltipTrigger asChild>
                      <NavLink
                        to={item.path}
                        className={`relative flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all duration-300 ease-out active:scale-95 ${
                          isItemActive
                            ? "bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-md shadow-orange-500/25 scale-[1.02]"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                        }`}
                        data-testid={`nav-${item.path.slice(1)}`}
                      >
                        <item.icon className="w-4 h-4 shrink-0 transition-transform duration-300" />
                        <span>{item.label}</span>
                      </NavLink>
                    </TooltipTrigger>
                    {item.shortcut && (
                      <TooltipContent
                        side="bottom"
                        className="font-mono text-[10px] font-bold"
                      >
                        Shortcut: {formatShortcut(item.shortcut)}
                      </TooltipContent>
                    )}
                  </Tooltip>
                );
              })}
            </nav>

            {/* Right Controls Panel */}
            <div className="flex items-center gap-2.5 shrink-0">
              {/* Theme Toggle Button */}
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleTheme}
                data-testid="theme-toggle-btn"
                className="relative hover:bg-muted/80 rounded-xl transition-all active:scale-95 border border-border/60 dark:border-border/40 h-9 w-9"
                title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
              >
                {isDark ? (
                  <Sun className="w-4.5 h-4.5 text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.4)]" />
                ) : (
                  <Moon className="w-4.5 h-4.5 text-orange-600 drop-shadow-[0_0_8px_rgba(234,88,12,0.3)]" />
                )}
              </Button>

              {/* Notification Button */}
              <Button
                variant="ghost"
                size="icon"
                className="relative hover:bg-muted/80 rounded-xl border border-border/60 dark:border-border/40 h-9 w-9"
                data-testid="notifications-btn"
              >
                <Bell className="w-4.5 h-4.5 text-foreground" />
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-destructive rounded-full shadow shadow-destructive/50 animate-pulse"></span>
              </Button>

              {/* Recent Activity Panel Toggle */}
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleActivity}
                className={`relative rounded-xl border border-border/60 dark:border-border/40 h-9 w-9 transition-all duration-200 ${
                  activityOpen
                    ? "bg-orange-500/15 text-orange-500 border-orange-500/40"
                    : "hover:bg-muted/80"
                }`}
                title="Recent Activity (Alt + A)"
              >
                <Activity className="w-4.5 h-4.5" />
              </Button>

              {/* User Avatar & Dropdown Menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="flex items-center gap-2 hover:bg-muted/80 px-2.5 py-1.5 rounded-xl border border-border/60 dark:border-border/40 transition-all h-9"
                    data-testid="user-menu-btn"
                  >
                    <Avatar className="w-7 h-7 ring-1 ring-border/60 shadow-xs shrink-0">
                      <AvatarImage src={user?.image_url} />
                      <AvatarFallback className="bg-orange-500/20 text-orange-600 dark:text-orange-400 text-xs font-black">
                        {user?.name?.charAt(0)?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="hidden sm:inline text-xs font-extrabold text-foreground max-w-[100px] truncate">
                      {user?.name}
                    </span>
                    <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="w-52 mt-1 border border-border/80 dark:border-border/50 shadow-xl rounded-2xl p-1.5 bg-background/95 backdrop-blur-xl"
                >
                  <DropdownMenuItem
                    onClick={() => navigate("/settings")}
                    data-testid="settings-dropdown"
                    className="cursor-pointer font-bold py-2 px-3 rounded-xl group hover:bg-orange-500/10 focus:bg-orange-500/10 focus:text-orange-600 dark:focus:text-orange-400"
                  >
                    <Settings className="w-4 h-4 mr-2.5 text-orange-500 group-hover:rotate-45 transition-transform" />
                    Settings
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-border/50 my-1" />
                  <DropdownMenuItem
                    onClick={handleLogout}
                    data-testid="logout-btn"
                    className="text-destructive focus:text-destructive-foreground focus:bg-destructive cursor-pointer font-bold py-2 px-3 rounded-xl group"
                  >
                    <LogOut className="w-4 h-4 mr-2.5 text-destructive group-focus:text-white transition-colors" />
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        {/* Full-Width Seamless Page Content Area */}
        <div className="flex-1 relative flex overflow-hidden w-full">
          <main className="flex-1 p-2 sm:p-3 lg:p-3 overflow-y-auto w-full flex flex-col">
            <div
              key={location.pathname}
              className="flex-1 w-full flex flex-col animate-in fade-in duration-300 ease-out"
            >
              <Outlet />
            </div>
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

        {/* Global AI Agent Interface widget */}
        <AgentWidget user={user} />
      </div>
    </TooltipProvider>
  );
}
