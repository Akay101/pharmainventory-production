import { useState, useEffect } from "react";
import { Outlet, NavLink, useNavigate } from "react-router-dom";
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
} from "lucide-react";

const navItems = [
  { path: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { path: "/inventory", label: "Inventory", icon: Package },
  { path: "/purchases", label: "Purchases", icon: ShoppingCart },
  { path: "/billing", label: "Billing", icon: Receipt },
  { path: "/suppliers", label: "Suppliers", icon: Truck },
  { path: "/customers", label: "Customers", icon: Users },
  { path: "/users", label: "Users", icon: UserCog, adminOnly: true },
  { path: "/reports", label: "Reports", icon: BarChart3 },
  { path: "/settings", label: "Settings", icon: Settings },
];

const Sidebar = ({ mobile = false, onClose, collapsed = false, onToggle }) => {
  const { user, pharmacy, isAdmin } = useAuth();

  const filteredItems = navItems.filter((item) => !item.adminOnly || isAdmin);

  return (
    <TooltipProvider delayDuration={0}>
      <div className="flex flex-col h-full">
        {/* Logo */}
        <div className={`p-4 border-b border-white/5 ${collapsed ? 'px-2' : 'p-6'}`}>
          <div className={`flex items-center ${collapsed ? 'justify-center' : 'gap-3'}`}>
            {pharmacy?.logo_url ? (
              <img
                src={pharmacy.logo_url}
                alt={pharmacy.name}
                className={`rounded-lg object-cover ${collapsed ? 'w-8 h-8' : 'w-10 h-10'}`}
              />
            ) : (
              <div className={`rounded-lg bg-primary/20 flex items-center justify-center ${collapsed ? 'w-8 h-8' : 'w-10 h-10'}`}>
                <span className={`text-primary font-bold ${collapsed ? 'text-sm' : 'text-lg'}`}>P</span>
              </div>
            )}
            {!collapsed && (
              <div>
                <h1 className="font-bold text-lg text-foreground truncate max-w-[140px]">
                  {pharmacy?.name || "Pharmalogy"}
                </h1>
                <p className="text-xs text-muted-foreground truncate max-w-[140px]">
                  {pharmacy?.location}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Collapse Toggle - Desktop only */}
        {!mobile && (
          <div className={`px-2 py-2 border-b border-white/5 ${collapsed ? 'flex justify-center' : ''}`}>
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggle}
              className={`w-full ${collapsed ? 'px-2' : ''}`}
              data-testid="sidebar-toggle"
            >
              {collapsed ? (
                <PanelLeft className="w-4 h-4" />
              ) : (
                <>
                  <PanelLeftClose className="w-4 h-4 mr-2" />
                  <span>Collapse</span>
                </>
              )}
            </Button>
          </div>
        )}

        {/* Navigation */}
        <nav className={`flex-1 p-2 space-y-1 overflow-y-auto ${collapsed ? 'px-1' : 'p-4'}`}>
          {filteredItems.map((item) => (
            collapsed ? (
              <Tooltip key={item.path}>
                <TooltipTrigger asChild>
                  <NavLink
                    to={item.path}
                    onClick={onClose}
                    className={({ isActive }) =>
                      `sidebar-link justify-center px-2 ${isActive ? "active" : ""}`
                    }
                    data-testid={`nav-${item.path.slice(1)}`}
                  >
                    <item.icon className="w-5 h-5" />
                  </NavLink>
                </TooltipTrigger>
                <TooltipContent side="right">
                  {item.label}
                </TooltipContent>
              </Tooltip>
            ) : (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={onClose}
                className={({ isActive }) =>
                  `sidebar-link ${isActive ? "active" : ""}`
                }
                data-testid={`nav-${item.path.slice(1)}`}
              >
                <item.icon className="w-5 h-5" />
                <span>{item.label}</span>
              </NavLink>
            )
          ))}
        </nav>

        {/* User Info */}
        <div className={`p-2 border-t border-white/5 ${collapsed ? 'px-1' : 'p-4'}`}>
          {collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex justify-center">
                  <Avatar className="w-8 h-8">
                    <AvatarImage src={user?.image_url} />
                    <AvatarFallback className="bg-primary/20 text-primary text-sm">
                      {user?.name?.charAt(0)?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </div>
              </TooltipTrigger>
              <TooltipContent side="right">
                {user?.name} ({user?.role})
              </TooltipContent>
            </Tooltip>
          ) : (
            <div className="flex items-center gap-3">
              <Avatar className="w-9 h-9">
                <AvatarImage src={user?.image_url} />
                <AvatarFallback className="bg-primary/20 text-primary">
                  {user?.name?.charAt(0)?.toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{user?.name}</p>
                <p className="text-xs text-muted-foreground">{user?.role}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
};

export default function DashboardLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const stored = localStorage.getItem('sidebarCollapsed');
    return stored === 'true';
  });
  const [isDark, setIsDark] = useState(() => {
    // Check localStorage or default to dark
    const stored = localStorage.getItem('theme');
    return stored ? stored === 'dark' : true;
  });

  useEffect(() => {
    // Apply theme to document
    if (isDark) {
      document.documentElement.classList.remove('light');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.add('light');
      localStorage.setItem('theme', 'light');
    }
  }, [isDark]);

  const toggleTheme = () => {
    setIsDark(!isDark);
  };

  const toggleSidebar = () => {
    const newState = !sidebarCollapsed;
    setSidebarCollapsed(newState);
    localStorage.setItem('sidebarCollapsed', String(newState));
  };

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-background flex" data-testid="dashboard-layout">
      {/* Desktop Sidebar */}
      <aside 
        className={`border-r border-white/5 bg-card/30 backdrop-blur-xl hidden md:flex flex-col fixed h-full z-50 transition-all duration-300 ${
          sidebarCollapsed ? 'w-16' : 'w-64'
        }`}
      >
        <Sidebar collapsed={sidebarCollapsed} onToggle={toggleSidebar} />
      </aside>

      {/* Main Content */}
      <div className={`flex-1 flex flex-col min-h-screen transition-all duration-300 ${
        sidebarCollapsed ? 'md:ml-16' : 'md:ml-64'
      }`}>
        {/* Header */}
        <header className="h-16 border-b border-white/5 bg-card/30 backdrop-blur-xl sticky top-0 z-40">
          <div className="h-full px-4 md:px-6 flex items-center justify-between">
            {/* Mobile Menu */}
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild className="md:hidden">
                <Button variant="ghost" size="icon" data-testid="mobile-menu-btn">
                  <Menu className="w-5 h-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 p-0 bg-card border-white/5">
                <Sidebar mobile onClose={() => setMobileOpen(false)} />
              </SheetContent>
            </Sheet>

            <div className="hidden md:block" />

            {/* Right Actions */}
            <div className="flex items-center gap-2">
              {/* Theme Toggle */}
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={toggleTheme}
                data-testid="theme-toggle-btn"
                className="relative"
              >
                {isDark ? (
                  <Sun className="w-5 h-5 text-yellow-400" />
                ) : (
                  <Moon className="w-5 h-5 text-purple-500" />
                )}
              </Button>

              <Button variant="ghost" size="icon" className="relative" data-testid="notifications-btn">
                <Bell className="w-5 h-5" />
                <span className="absolute top-1 right-1 w-2 h-2 bg-destructive rounded-full"></span>
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="flex items-center gap-2" data-testid="user-menu-btn">
                    <Avatar className="w-8 h-8">
                      <AvatarImage src={user?.image_url} />
                      <AvatarFallback className="bg-primary/20 text-primary text-sm">
                        {user?.name?.charAt(0)?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="hidden sm:inline text-sm">{user?.name}</span>
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onClick={() => navigate("/settings")} data-testid="settings-dropdown">
                    <Settings className="w-4 h-4 mr-2" />
                    Settings
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} className="text-destructive" data-testid="logout-btn">
                    <LogOut className="w-4 h-4 mr-2" />
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-4 md:p-6 lg:p-8 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
