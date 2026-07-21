import { useState } from "react";
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Database,
  BarChart3,
  Brain,
  TrendingUp,
  FileText,
  ShoppingCart,
  Users,
  DollarSign,
  Settings,
  ChevronLeft,
  ChevronRight,
  Boxes,
  Briefcase,
  LogOut,
  Moon,
  Sun,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";

interface NavItem {
  label: string;
  path: string;
  icon: React.ElementType;
  disabled?: boolean;
}

const navItems: NavItem[] = [
  { label: "Dashboard", path: "/", icon: LayoutDashboard },
  { label: "Datasets", path: "/datasets", icon: Database },
  { label: "Sales Analytics", path: "/analytics/sales", icon: TrendingUp, disabled: true },
  { label: "Marketing", path: "/analytics/marketing", icon: BarChart3, disabled: true },
  { label: "Finance", path: "/analytics/finance", icon: DollarSign, disabled: true },
  { label: "Operations", path: "/analytics/operations", icon: Settings, disabled: true },
  { label: "Inventory", path: "/analytics/inventory", icon: Boxes, disabled: true },
  { label: "Customers", path: "/analytics/customers", icon: Users, disabled: true },
  { label: "HR", path: "/analytics/hr", icon: Briefcase, disabled: true },
  { label: "Procurement", path: "/analytics/procurement", icon: ShoppingCart, disabled: true },
  { label: "ML Models", path: "/ml", icon: Brain, disabled: true },
  { label: "Reports", path: "/reports", icon: FileText, disabled: true },
];

interface SidebarProps {
  darkMode: boolean;
  onToggleDarkMode: () => void;
}

export function Sidebar({ darkMode, onToggleDarkMode }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const { logout, user } = useAuth();

  return (
    <aside
      className={cn(
        "flex flex-col h-screen border-r border-border bg-card/50 backdrop-blur-sm transition-all duration-300",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 h-16 border-b border-border">
        <div className="flex-shrink-0 w-8 h-8 rounded-lg gradient-primary flex items-center justify-center">
          <span className="text-white font-bold text-sm">E</span>
        </div>
        {!collapsed && (
          <span className="font-bold text-base tracking-tight animate-fade-in">
            EDIP
          </span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;

          if (item.disabled) {
            return (
              <div
                key={item.path}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm text-muted-foreground/40 cursor-not-allowed",
                  collapsed && "justify-center px-0"
                )}
                title={collapsed ? item.label : undefined}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </div>
            );
          }

          return (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === "/"}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-all duration-200",
                  isActive
                    ? "bg-primary/10 text-primary shadow-sm"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  collapsed && "justify-center px-0"
                )
              }
              title={collapsed ? item.label : undefined}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {!collapsed && <span className="animate-fade-in">{item.label}</span>}
            </NavLink>
          );
        })}
      </nav>

      {/* Bottom section */}
      <div className="border-t border-border p-2 space-y-1">
        <Button
          variant="ghost"
          size="sm"
          className={cn("w-full", collapsed ? "justify-center" : "justify-start")}
          onClick={onToggleDarkMode}
          title={darkMode ? "Switch to light mode" : "Switch to dark mode"}
        >
          {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          {!collapsed && (
            <span className="ml-2">{darkMode ? "Light Mode" : "Dark Mode"}</span>
          )}
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "w-full text-muted-foreground hover:text-destructive",
            collapsed ? "justify-center" : "justify-start"
          )}
          onClick={logout}
          title="Log out"
        >
          <LogOut className="w-4 h-4" />
          {!collapsed && <span className="ml-2">Log Out</span>}
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="w-full h-8"
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronLeft className="w-4 h-4" />
          )}
        </Button>
      </div>
    </aside>
  );
}
