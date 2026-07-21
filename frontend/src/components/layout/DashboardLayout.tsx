import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";

interface DashboardLayoutProps {
  darkMode: boolean;
  onToggleDarkMode: () => void;
}

/**
 * Main application shell with sidebar and header.
 * Redirects to /login if the user is not authenticated.
 */
export function DashboardLayout({ darkMode, onToggleDarkMode }: DashboardLayoutProps) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center gradient-mesh">
        <div className="w-8 h-8 rounded-full gradient-primary animate-pulse" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background gradient-mesh">
      <Sidebar darkMode={darkMode} onToggleDarkMode={onToggleDarkMode} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
