import { Switch, Route, useLocation, Redirect, Router as WouterRouter } from "wouter";
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
import LoginPage from "@/pages/login";
import ResetPasswordPage from "@/pages/reset-password";
import PublicTournamentPage from "@/pages/public-tournament";
import RegisterTeamPage from "@/pages/register-team";
import AdminUsers from "@/pages/admin-users";
import NotFound from "@/pages/not-found";
import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

// ── Server startup guard ──────────────────────────────────────────────────
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

// ── Main app content (authenticated routes) ───────────────────────────────
function AppContent() {
  const { user, isLoading } = useAuth();
  const [location] = useLocation();

  const hasPersistedViewToken =
    typeof window !== "undefined" && !!sessionStorage.getItem("boules_view_token");

  const urlToken =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("token")
      : null;
  const [urlTokenIsView, setUrlTokenIsView] = useState<boolean | null>(
    urlToken ? null : false
  );

  useEffect(() => {
    if (!urlToken) { setUrlTokenIsView(false); return; }
    fetch(`/api/auth/check-access${window.location.search}`, { credentials: "omit" })
      .then(r => r.json())
      .then(data => setUrlTokenIsView(!!data.isViewOnlyAccess))
      .catch(() => setUrlTokenIsView(false));
  }, [urlToken]);

  if (isLoading || urlTokenIsView === null) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // A share-link code left in this tab from visiting a public page shouldn't put a
  // signed-in organiser into view-only, locked mode in the main app
  if (user && !urlToken && hasPersistedViewToken) {
    sessionStorage.removeItem("boules_view_token");
    queryClient.clear();
  }
  const isViewLinkAccess = urlTokenIsView || (hasPersistedViewToken && !user);

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
        </TournamentProvider>
      </ViewModeProvider>
    );
  }

  if (!user) {
    return (
      <>
        <Redirect to="/sign-in" />
      </>
    );
  }

  const showNavigation = location !== "/leaderboard";

  return (
    <ViewModeProvider>
      <TournamentProvider>
        <div className="min-h-screen bg-background">
          {showNavigation && <Navigation />}
          <Switch>
            <Route path="/" component={Teams} />
            <Route path="/teams" component={Teams} />
            {/* Opened by an organiser's "Teams Edit" home-screen / desktop shortcut */}
            <Route path="/edit/teams" component={Teams} />
            <Route path="/matches" component={Matches} />
            <Route path="/results" component={Results} />
            <Route path="/leaderboard" component={Leaderboard} />
            <Route path="/admin/users" component={AdminUsers} />
            <Route component={NotFound} />
          </Switch>
        </div>
      </TournamentProvider>
    </ViewModeProvider>
  );
}

// ── Router ────────────────────────────────────────────────────────────────
function AppRouter() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ServerStartupGuard>
          <AuthProvider>
            <Switch>
              <Route path="/sign-in/*?">{() => <LoginPage />}</Route>
              <Route path="/sign-up/*?">{() => <LoginPage defaultTab="register" />}</Route>
              <Route path="/reset-password" component={ResetPasswordPage} />
              {/* Public read-only pages with readable addresses */}
              <Route path="/teams/:slug">{(p) => <PublicTournamentPage key={`t-${p.slug}`} slug={p.slug} page="teams" />}</Route>
              <Route path="/register/:slug">{(p) => <RegisterTeamPage key={`r-${p.slug}`} slug={p.slug} />}</Route>
              <Route path="/leaderboard/:slug">{(p) => <PublicTournamentPage key={`l-${p.slug}`} slug={p.slug} page="leaderboard" />}</Route>
              {/* Legacy /login redirect */}
              <Route path="/login">
                <Redirect to="/sign-in" />
              </Route>
              <Route component={AppContent} />
            </Switch>
            <Toaster />
          </AuthProvider>
        </ServerStartupGuard>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <AppRouter />
    </WouterRouter>
  );
}

export default App;
