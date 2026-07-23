import { Switch, Route, useLocation, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TournamentProvider } from "@/contexts/TournamentContext";
import { ViewModeProvider } from "@/contexts/ViewModeContext";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { Navigation } from "@/components/navigation";
import Teams from "@/pages/teams";
import Matches from "@/pages/matches";
import Results from "@/pages/results";
import Leaderboard from "@/pages/leaderboard";
import Login from "@/pages/login";
import AdminUsers from "@/pages/admin-users";
import NotFound from "@/pages/not-found";
import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";

function ServerStartupGuard({ children }: { children: React.ReactNode }) {
  const [serverReady, setServerReady] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;

    const checkServer = async () => {
      try {
        await fetch("/api/auth/check-access");
        setServerReady(true);
      } catch {
        setAttempt(prev => prev + 1);
        timeoutId = setTimeout(checkServer, 3000);
      }
    };

    checkServer();
    return () => clearTimeout(timeoutId);
  }, []);

  if (!serverReady) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 bg-background text-foreground">
        <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
        <p className="text-lg font-medium">Starting up, please wait…</p>
        {attempt > 1 && (
          <p className="text-sm text-muted-foreground">This may take a few seconds on first load.</p>
        )}
      </div>
    );
  }

  return <>{children}</>;
}

function AppContent() {
  const { user, isLoading } = useAuth();
  const [location] = useLocation();

  // For a persisted view token (from a previous share-link visit), we know it's view-only.
  // Admin tokens stored in localStorage do NOT bypass login — those require the user to log in.
  const hasPersistedViewToken =
    typeof window !== "undefined" && !!localStorage.getItem("boules_view_token");

  // When a ?token= is present in the URL we don't know its type yet — check-access tells us.
  // null = still resolving, true = view-only (bypass login), false = admin (require login)
  const urlToken =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("token")
      : null;
  const [urlTokenIsView, setUrlTokenIsView] = useState<boolean | null>(
    urlToken ? null : false
  );

  useEffect(() => {
    if (!urlToken) { setUrlTokenIsView(false); return; }
    fetch("/api/auth/check-access", { credentials: "include" })
      .then(r => r.json())
      .then(data => setUrlTokenIsView(!!data.isViewOnlyAccess))
      .catch(() => setUrlTokenIsView(false));
  }, [urlToken]);

  // Show spinner while auth or URL-token type is still resolving
  if (isLoading || urlTokenIsView === null) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // View-only share link access (URL token confirmed as view-only, or persisted view token)
  const isViewLinkAccess = urlTokenIsView || hasPersistedViewToken;

  // /login always shows the login page (or redirects to /teams if already logged in).
  // Must come before share-link bypass so visiting /login directly always works.
  if (location === "/login") {
    if (user) return <Redirect to="/teams" />;
    return (
      <>
        <Login />
        <Toaster />
      </>
    );
  }

  // View-only share-link visitors bypass the login gate
  if (isViewLinkAccess) {
    const showNavigation = location !== "/leaderboard";
    return (
      <ViewModeProvider>
        <TournamentProvider>
          <div className="min-h-screen bg-background">
            {showNavigation && <Navigation />}
            <Switch>
              <Route path="/" component={Teams} />
              <Route path="/teams" component={Teams} />
              <Route path="/matches" component={Matches} />
              <Route path="/results" component={Results} />
              <Route path="/leaderboard" component={Leaderboard} />
              <Route component={NotFound} />
            </Switch>
          </div>
          <Toaster />
        </TournamentProvider>
      </ViewModeProvider>
    );
  }

  // Not logged in (and no view token) → redirect to /login
  if (!user) {
    return (
      <>
        <Redirect to="/login" />
        <Toaster />
      </>
    );
  }

  // Logged in → show the full app
  const showNavigation = location !== "/leaderboard";

  return (
    <ViewModeProvider>
      <TournamentProvider>
        <div className="min-h-screen bg-background">
          {showNavigation && <Navigation />}
          <Switch>
            <Route path="/" component={Teams} />
            <Route path="/teams" component={Teams} />
            <Route path="/matches" component={Matches} />
            <Route path="/results" component={Results} />
            <Route path="/leaderboard" component={Leaderboard} />
            <Route path="/admin/users" component={AdminUsers} />
            <Route component={NotFound} />
          </Switch>
        </div>
        <Toaster />
      </TournamentProvider>
    </ViewModeProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ServerStartupGuard>
          <AuthProvider>
            <AppContent />
          </AuthProvider>
        </ServerStartupGuard>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
