import { Link, useLocation } from "wouter";
import { Users, Trophy, ListChecks, Grid3x3, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { TournamentSelector } from "@/components/tournament-selector";
import { Badge } from "@/components/ui/badge";
import { useViewMode } from "@/contexts/ViewModeContext";

export function Navigation() {
  const [location] = useLocation();
  const { isReadOnly } = useViewMode();

  const navItems = [
    { path: "/", label: "Teams", icon: Users },
    { path: "/matches", label: "Matches", icon: Trophy },
    { path: "/results", label: "Results", icon: ListChecks },
    { path: "/bracket", label: "Bracket", icon: Grid3x3 },
  ];

  // Helper function to add query parameters to path
  const getPathWithQuery = (path: string) => {
    if (isReadOnly) {
      return `${path}?view=readonly`;
    }
    return path;
  };

  return (
    <nav className="border-b bg-background sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-8">
            <h1 className="text-xl font-semibold text-foreground">
              Boules Tournament Manager
            </h1>
            <TournamentSelector />
            {isReadOnly && (
              <Badge variant="secondary" className="gap-1.5" data-testid="badge-view-only">
                <Eye className="h-3 w-3" />
                View Only
              </Badge>
            )}
            <div className="flex gap-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                // Strip query parameters from location for active state comparison
                const currentPath = location.split('?')[0];
                const isActive = currentPath === item.path;
                const pathWithQuery = getPathWithQuery(item.path);
                return (
                  <Link
                    key={item.path}
                    href={pathWithQuery}
                    data-testid={`link-nav-${item.label.toLowerCase()}`}
                  >
                    <button
                      className={cn(
                        "flex items-center gap-2 px-4 h-9 rounded-md text-sm font-medium transition-colors",
                        isActive
                          ? "bg-secondary text-secondary-foreground"
                          : "text-muted-foreground hover-elevate"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </button>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
