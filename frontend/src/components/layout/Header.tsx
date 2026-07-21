import { useLocation } from "react-router-dom";

const pageTitles: Record<string, string> = {
  "/": "Dashboard",
  "/datasets": "Datasets",
};

export function Header() {
  const location = useLocation();
  const title = pageTitles[location.pathname] || "EDIP";

  return (
    <header className="h-16 border-b border-border bg-card/30 backdrop-blur-sm flex items-center justify-between px-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        <p className="text-xs text-muted-foreground">
          Enterprise Decision Intelligence Platform
        </p>
      </div>

      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full gradient-primary flex items-center justify-center">
          <span className="text-white text-xs font-bold">U</span>
        </div>
      </div>
    </header>
  );
}
