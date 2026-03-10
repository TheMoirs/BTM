import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TournamentProvider } from "@/contexts/TournamentContext";
import { ViewModeProvider } from "@/contexts/ViewModeContext";
import { Navigation } from "@/components/navigation";
import Teams from "@/pages/teams";
import Matches from "@/pages/matches";
import Results from "@/pages/results";
import Leaderboard from "@/pages/leaderboard";
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

function Router() {
  return (
    <Switch>
      <Route path="/" component={Teams} />
      <Route path="/teams" component={Teams} />
      <Route path="/matches" component={Matches} />
      <Route path="/results" component={Results} />
      <Route path="/leaderboard" component={Leaderboard} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const [location] = useLocation();
  const showNavigation = location !== "/leaderboard";

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ServerStartupGuard>
          <ViewModeProvider>
            <TournamentProvider>
              <div className="min-h-screen bg-background">
                {showNavigation && <Navigation />}
                <Router />
              </div>
              <Toaster />
            </TournamentProvider>
          </ViewModeProvider>
        </ServerStartupGuard>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
