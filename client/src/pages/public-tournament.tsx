import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { TournamentProvider } from "@/contexts/TournamentContext";
import { ViewModeProvider } from "@/contexts/ViewModeContext";
import { Navigation } from "@/components/navigation";
import Teams from "@/pages/teams";
import Leaderboard from "@/pages/leaderboard";

// Same key the rest of the app uses for share-link access codes
const VIEW_TOKEN_STORAGE_KEY = "boules_view_token";

// Public, read-only tournament pages with readable addresses:
//   /teams/summer-league-2026  and  /leaderboard/summer-league-2026
// The name is looked up to get the tournament's view-only access code, which is
// kept in this browser tab (like a normal share link) so the address stays clean.
export default function PublicTournamentPage({ slug, page }: { slug: string; page: "teams" | "leaderboard" }) {
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading");

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    fetch(`/api/public/tournament/${encodeURIComponent(slug)}`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (cancelled) return;
        if (!data?.viewToken) {
          setState("missing");
          return;
        }
        // Select this tournament, so a signed-in organiser opening the link sees it too
        // (rather than whichever tournament they last had open)
        if (data.tournamentId) localStorage.setItem("boules-selected-tournament-id", data.tournamentId);
        if (sessionStorage.getItem(VIEW_TOKEN_STORAGE_KEY) !== data.viewToken) {
          sessionStorage.setItem(VIEW_TOKEN_STORAGE_KEY, data.viewToken);
          queryClient.clear(); // a different tournament: don't show cached data from another one
        }
        setState("ready");
      })
      .catch(() => !cancelled && setState("missing"));
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (state === "loading") {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (state === "missing") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background p-6 text-center gap-3">
        <img src="/ptm-logo.png?v=3" alt="PTM" className="h-20 w-20 rounded-xl object-cover" />
        <h1 className="text-xl font-semibold">Tournament not found</h1>
        <p className="text-muted-foreground max-w-sm">
          There's no tournament at this address. It may have been renamed, so please ask the organiser for the latest link.
        </p>
      </div>
    );
  }

  return (
    <ViewModeProvider>
      <TournamentProvider>
        <div className="min-h-screen bg-background">
          {page === "teams" && <Navigation />}
          {page === "teams" ? <Teams /> : <Leaderboard />}
        </div>
      </TournamentProvider>
    </ViewModeProvider>
  );
}
