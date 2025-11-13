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
        <ViewModeProvider>
          <TournamentProvider>
            <div className="min-h-screen bg-background">
              {showNavigation && <Navigation />}
              <Router />
            </div>
            <Toaster />
          </TournamentProvider>
        </ViewModeProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
