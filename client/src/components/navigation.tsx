import { Link, useLocation } from "wouter";
import { Users, Trophy, ListChecks, Eye, Shield, LogOut, LogIn, UserCog, User, UserPen } from "lucide-react";
import { cn } from "@/lib/utils";
import { TournamentSelector } from "@/components/tournament-selector";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useViewMode } from "@/contexts/ViewModeContext";
import { useTournament } from "@/contexts/TournamentContext";
import { useAuth } from "@/contexts/AuthContext";
import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

export function Navigation() {
  const [location] = useLocation();
  const { isReadOnly, isMasterAdmin, viewToken } = useViewMode();
  const { currentTournament } = useTournament();
  const { user, logout, updateProfile, refreshUser } = useAuth();
  const { toast } = useToast();

  // Profile/settings dialog state
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  // Google-only accounts have no current password to confirm
  const needsCurrentPassword = user?.hasPassword !== false;

  // Display name state
  const [displayName, setDisplayName] = useState("");
  const [isUpdatingName, setIsUpdatingName] = useState(false);

  useEffect(() => {
    if (showChangePassword) {
      setDisplayName(user?.displayName ?? "");
    }
  }, [showChangePassword, user?.displayName]);

  const handleLogout = async () => {
    await logout();
    window.location.href = "/login";
  };

  const handleUpdateDisplayName = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUpdatingName(true);
    try {
      const result = await updateProfile(displayName.trim() || null);
      if (!result.success) {
        toast({ title: "Update failed", description: result.error || "Could not update display name.", variant: "destructive", duration: Infinity });
      } else {
        toast({ title: "Display name updated", description: "Your display name has been saved.", duration: Infinity });
      }
    } catch {
      toast({ title: "Update failed", description: "An unexpected error occurred.", variant: "destructive", duration: Infinity });
    } finally {
      setIsUpdatingName(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast({ title: "Passwords don't match", description: "Please make sure both new passwords are the same.", variant: "destructive", duration: Infinity });
      return;
    }
    if (newPassword.length < 8) {
      toast({ title: "Password too short", description: "New password must be at least 8 characters.", variant: "destructive", duration: Infinity });
      return;
    }
    setIsChangingPassword(true);
    try {
      const res = await apiRequest("PATCH", "/api/auth/password", { currentPassword, newPassword });
      if (!res.ok) {
        const data = await res.json();
        toast({ title: "Change failed", description: data.error || "Could not change password.", variant: "destructive", duration: Infinity });
      } else {
        toast({ title: needsCurrentPassword ? "Password changed" : "Password set", description: "Your password has been saved.", duration: Infinity });
        await refreshUser();
        setShowChangePassword(false);
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      }
    } catch {
      toast({ title: "Change failed", description: "An unexpected error occurred.", variant: "destructive", duration: Infinity });
    } finally {
      setIsChangingPassword(false);
    }
  };

  // In teams view-only mode (accessed via share link), hide Matches and Results
  const isTeamsViewOnly = isReadOnly && (location === "/" || location === "/teams" || location.startsWith("/teams?") || location.startsWith("/teams/"));

  const navItems = isTeamsViewOnly
    ? [{ path: "/", label: "Teams", icon: Users }]
    : [
        { path: "/", label: "Teams", icon: Users },
        { path: "/matches", label: "Matches", icon: Trophy },
        { path: "/results", label: "Results", icon: ListChecks },
      ];

  const getPathWithQuery = (path: string) => {
    if (isReadOnly && viewToken) return `${path}?token=${encodeURIComponent(viewToken)}&view=readonly`;
    if (isReadOnly) return `${path}?view=readonly`;
    return path;
  };

  return (
    <nav className="border-b bg-background sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="py-2 space-y-2">
          {/* Top Row: logo, tournament picker and account buttons on one line */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <img src="/btm-logo.png" alt="BTM" className="h-8 w-8 rounded-md object-cover flex-shrink-0" />
              <h1 className="hidden lg:block text-lg font-semibold text-foreground whitespace-nowrap">
                Boules Tournament Manager
              </h1>
              <div className="min-w-0 flex-1 lg:flex-none">
                <TournamentSelector />
              </div>
              {currentTournament && (
                isMasterAdmin ? (
                  <Badge variant="default" className="gap-1.5 bg-primary shrink-0" data-testid="badge-master-admin">
                    <Shield className="h-3 w-3" />
                    <span className="hidden sm:inline">System Admin</span>
                  </Badge>
                ) : isReadOnly ? null : viewToken ? (
                  <Badge variant="default" className="gap-1.5 bg-primary shrink-0" data-testid="badge-admin">
                    <Shield className="h-3 w-3" />
                    <span className="hidden sm:inline">Admin Access</span>
                  </Badge>
                ) : null
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {/* View-only badge sits at the top right so it doesn't need its own line */}
              {currentTournament && isReadOnly && !isMasterAdmin && (
                <Badge variant="secondary" className="gap-1.5 shrink-0" data-testid="badge-view-only">
                  <Eye className="h-3 w-3" />
                  <span className="hidden sm:inline">View Only</span>
                </Badge>
              )}
              {/* Logged-in user section */}
              {user ? (
                <>
                  {/* System admin Users link */}
                  {user.isSystemAdmin && (
                    <Link href="/admin/users">
                      <Button
                        variant="ghost"
                        size="sm"
                        data-testid="button-admin-users"
                        className="hidden sm:flex"
                      >
                        <UserCog className="h-4 w-4 mr-2" />
                        Users
                      </Button>
                    </Link>
                  )}
                  {user.isSystemAdmin && (
                    <Link href="/admin/users">
                      <Button
                        variant="ghost"
                        size="icon"
                        data-testid="button-admin-users-mobile"
                        className="sm:hidden"
                      >
                        <UserCog className="h-4 w-4" />
                      </Button>
                    </Link>
                  )}

                  {/* User dropdown (desktop) */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        data-testid="button-user-menu"
                        className="hidden sm:flex"
                      >
                        <User className="h-4 w-4 mr-2" />
                        <span className="max-w-[120px] truncate">{user.displayName || user.email.split("@")[0]}</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem
                        onClick={() => setShowChangePassword(true)}
                        data-testid="menu-item-change-password"
                      >
                        <UserPen className="h-4 w-4 mr-2" />
                        Profile Settings
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={handleLogout}
                        data-testid="menu-item-logout"
                        className="text-destructive focus:text-destructive"
                      >
                        <LogOut className="h-4 w-4 mr-2" />
                        Log out
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  {/* Mobile: separate icon buttons */}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowChangePassword(true)}
                    data-testid="button-change-password-mobile"
                    className="sm:hidden"
                  >
                    <UserPen className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleLogout}
                    data-testid="button-user-logout-mobile"
                    className="sm:hidden"
                  >
                    <LogOut className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                // Visitors on a shared view link: organisers can still sign in from here
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    sessionStorage.removeItem("boules_view_token");
                    queryClient.clear();
                    window.location.href = "/sign-in";
                  }}
                  data-testid="button-sign-in"
                >
                  <LogIn className="h-4 w-4 mr-1.5" />
                  Sign in
                </Button>
              )}
            </div>
          </div>

          {/* Second Row: Navigation Items (hidden when Teams is the only item, e.g. shared Teams view) */}
          {navItems.length > 1 && (
          <div className="flex gap-1 overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0">
            {navItems.map((item) => {
              const Icon = item.icon;
              const rawPath = location.split("?")[0];
              const currentPath = rawPath === "/edit/teams" ? "/" : rawPath;
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
                      "flex items-center gap-2 px-3 sm:px-4 h-8 rounded-md text-sm font-medium transition-colors whitespace-nowrap",
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
          )}
        </div>
      </div>

      {/* Profile Settings Dialog */}
      <Dialog open={showChangePassword} onOpenChange={open => {
        if (!open) { setCurrentPassword(""); setNewPassword(""); setConfirmPassword(""); }
        setShowChangePassword(open);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Profile Settings</DialogTitle>
            <DialogDescription>
              Update your display name or change your password.
            </DialogDescription>
          </DialogHeader>

          {/* Display name section */}
          <form onSubmit={handleUpdateDisplayName} className="space-y-3 py-2 border-b pb-4">
            <p className="text-sm font-medium">Display name</p>
            <div className="flex gap-2">
              <Input
                id="display-name"
                type="text"
                placeholder={user?.email.split("@")[0] ?? "Your name"}
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                disabled={isUpdatingName}
                data-testid="input-display-name"
              />
              <Button
                type="submit"
                disabled={isUpdatingName || displayName === (user?.displayName ?? "")}
                data-testid="button-submit-display-name"
              >
                {isUpdatingName ? "Saving…" : "Save"}
              </Button>
            </div>
          </form>

          {/* Change password section */}
          <form onSubmit={handleChangePassword} className="space-y-3 pt-2">
            <p className="text-sm font-medium">{needsCurrentPassword ? "Change password" : "Set a password"}</p>
            {!needsCurrentPassword && (
              <p className="text-xs text-muted-foreground">
                You sign in with Google. Set a password if you'd also like to sign in with your email address.
              </p>
            )}
            {needsCurrentPassword && (
            <div className="space-y-2">
              <Label htmlFor="current-password">Current password</Label>
              <Input
                id="current-password"
                type="password"
                placeholder="Your current password"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                disabled={isChangingPassword}
                data-testid="input-current-password"
              />
            </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                placeholder="At least 8 characters"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                disabled={isChangingPassword}
                data-testid="input-new-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm new password</Label>
              <Input
                id="confirm-password"
                type="password"
                placeholder="Repeat your new password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                disabled={isChangingPassword}
                data-testid="input-confirm-password"
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowChangePassword(false)}
                disabled={isChangingPassword}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isChangingPassword || (needsCurrentPassword && !currentPassword) || !newPassword || !confirmPassword}
                data-testid="button-submit-change-password"
              >
                {isChangingPassword ? "Saving…" : needsCurrentPassword ? "Change password" : "Set password"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </nav>
  );
}
