import { Link, useLocation } from "wouter";
import { Users, Trophy, ListChecks, Eye, Shield, Lock, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { TournamentSelector } from "@/components/tournament-selector";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useViewMode } from "@/contexts/ViewModeContext";
import { useTournament } from "@/contexts/TournamentContext";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

export function Navigation() {
  const [location] = useLocation();
  const { isReadOnly, isMasterAdmin, viewToken, loginMasterAdmin, logoutMasterAdmin } = useViewMode();
  const { currentTournament } = useTournament();
  const [showLoginDialog, setShowLoginDialog] = useState(false);
  const [password, setPassword] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const { toast } = useToast();

  const handleMasterLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    
    const success = await loginMasterAdmin(password);
    
    if (!success) {
      toast({
        title: "Login failed",
        description: "Invalid master admin password",
        variant: "destructive",
        duration: Infinity,
      });
      setIsLoggingIn(false);
    }
    // If successful, page will reload with new token
  };

  // In teams view-only mode (accessed via share link), hide Matches and Results
  const isTeamsViewOnly = isReadOnly && (location === "/" || location === "/teams" || location.startsWith("/teams?"));
  
  const navItems = isTeamsViewOnly 
    ? [{ path: "/", label: "Teams", icon: Users }]
    : [
        { path: "/", label: "Teams", icon: Users },
        { path: "/matches", label: "Matches", icon: Trophy },
        { path: "/results", label: "Results", icon: ListChecks },
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
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        {/* Mobile and Desktop Layout */}
        <div className="py-3 space-y-3">
          {/* Top Row: Title and Master Admin */}
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-lg sm:text-xl font-semibold text-foreground">
              Boules Tournament Manager
            </h1>
            <div className="flex items-center gap-2 shrink-0">
              {isMasterAdmin ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={logoutMasterAdmin}
                  data-testid="button-master-admin-logout"
                  className="hidden sm:flex"
                >
                  <LogOut className="h-4 w-4 mr-2" />
                  Logout
                </Button>
              ) : (
                <Dialog open={showLoginDialog} onOpenChange={setShowLoginDialog}>
                  <DialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      data-testid="button-master-admin-login"
                      className="hidden sm:flex"
                    >
                      <Lock className="h-4 w-4 mr-2" />
                      Master Admin
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Master Admin Login</DialogTitle>
                      <DialogDescription>
                        Enter the master admin password to manage all tournaments
                      </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleMasterLogin} className="space-y-4">
                      <Input
                        type="password"
                        placeholder="Master password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        disabled={isLoggingIn}
                        autoFocus
                        data-testid="input-master-admin-password"
                      />
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setShowLoginDialog(false)}
                          disabled={isLoggingIn}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="submit"
                          disabled={isLoggingIn || !password}
                          data-testid="button-submit-master-admin"
                        >
                          {isLoggingIn ? "Logging in..." : "Login"}
                        </Button>
                      </div>
                    </form>
                  </DialogContent>
                </Dialog>
              )}
              {/* Mobile Master Admin button - icon only */}
              {isMasterAdmin ? (
                <Button
                  variant="outline"
                  size="icon"
                  onClick={logoutMasterAdmin}
                  data-testid="button-master-admin-logout-mobile"
                  className="sm:hidden"
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowLoginDialog(true)}
                  data-testid="button-master-admin-login-mobile"
                  className="sm:hidden"
                >
                  <Lock className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          {/* Second Row: Tournament Selector and Badge */}
          <div className="flex items-center gap-2 flex-wrap">
            <TournamentSelector />
            {currentTournament && (
              <>
                {isMasterAdmin ? (
                  <Badge variant="default" className="gap-1.5 bg-primary shrink-0" data-testid="badge-master-admin">
                    <Shield className="h-3 w-3" />
                    <span className="hidden sm:inline">Master Admin</span>
                    <span className="sm:hidden">Admin</span>
                  </Badge>
                ) : isReadOnly ? (
                  <Badge variant="secondary" className="gap-1.5 shrink-0" data-testid="badge-view-only">
                    <Eye className="h-3 w-3" />
                    <span className="hidden sm:inline">View Only</span>
                    <span className="sm:hidden">View</span>
                  </Badge>
                ) : viewToken ? (
                  <Badge variant="default" className="gap-1.5 bg-primary shrink-0" data-testid="badge-admin">
                    <Shield className="h-3 w-3" />
                    <span className="hidden sm:inline">Admin Access</span>
                    <span className="sm:hidden">Admin</span>
                  </Badge>
                ) : null}
              </>
            )}
          </div>

          {/* Third Row: Navigation Items */}
          <div className="flex gap-1 overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0">
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
                      "flex items-center gap-2 px-4 h-9 rounded-md text-sm font-medium transition-colors whitespace-nowrap",
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
    </nav>
  );
}
