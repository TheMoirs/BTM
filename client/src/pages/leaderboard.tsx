import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useTournament } from "@/contexts/TournamentContext";
import { useViewMode } from "@/contexts/ViewModeContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Users, FileText, Printer, Menu, MonitorSmartphone, HelpCircle } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { buildLeaderboardPdf, downloadAndPrintPdf } from "@/lib/pdf-reports";
import { exportFilename } from "@/lib/utils";
import { HelpDialog } from "@/components/help-dialog";
import { TeamPerformanceDialog } from "@/components/team-performance-dialog";
import { AddToHomeScreenButton } from "@/components/add-to-home-screen";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Result, Team, Match } from "@shared/schema";
import { calculateTeamSummariesByStageAndDivision, applyForecastSort } from "@/lib/leaderboard";

const stageLabels = {
  initial: "Stage 1",
  "quarter-finals": "Quarter-Finals",
  "semi-finals": "Semi-Finals",
  finals: "Finals",
};

const statusLabels = {
  scheduled: "Scheduled",
  "in-progress": "In Progress",
  completed: "Completed",
};

export default function Leaderboard() {
  const { currentTournament, isLoading: tournamentsLoading } = useTournament();
  const { viewToken, isReadOnly } = useViewMode();
  const [showMatchResults, setShowMatchResults] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [isForecast, setIsForecast] = useState(false);
  // Public page on phones: Shortcut and Help open from the ☰ menu
  const [showShortcut, setShowShortcut] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const { toast } = useToast();

  const { data: results, isLoading: resultsLoading } = useQuery<Result[]>({
    queryKey: ["/api/results", currentTournament?.id],
    queryFn: async () => {
      if (!currentTournament) return [];
      const response = await apiRequest("GET", `/api/results?tournamentId=${currentTournament.id}`);
      return response.json();
    },
    enabled: !!currentTournament,
  });

  const { data: teams, isLoading: teamsLoading } = useQuery<Team[]>({
    queryKey: ["/api/teams", currentTournament?.id],
    queryFn: async () => {
      if (!currentTournament) return [];
      const response = await apiRequest("GET", `/api/teams?tournamentId=${currentTournament.id}`);
      return response.json();
    },
    enabled: !!currentTournament,
  });

  const { data: matches, isLoading: matchesLoading } = useQuery<Match[]>({
    queryKey: ["/api/matches", currentTournament?.id],
    queryFn: async () => {
      if (!currentTournament) return [];
      const response = await apiRequest("GET", `/api/matches?tournamentId=${currentTournament.id}`);
      return response.json();
    },
    enabled: !!currentTournament,
  });

  const getTeamName = (teamId: string): string => {
    const team = teams?.find((t) => t.id === teamId);
    if (!team) return "Unknown Team";
    return team.teamDisplayId ? `${team.name} (${team.teamDisplayId})` : team.name;
  };

  const handleTeamClick = (teamId: string | null) => {
    if (teamId) {
      setSelectedTeamId(teamId);
      setShowMatchResults(true);
    }
  };

  const handleBackToLeaderboard = () => {
    setSelectedTeamId(null);
    setShowMatchResults(false);
  };

  const teamSummariesByStageAndDivision = useMemo(() => {
    return calculateTeamSummariesByStageAndDivision(results, teams);
  }, [results, teams]);

  const displayData = useMemo(() => {
    if (isForecast) {
      return applyForecastSort(teamSummariesByStageAndDivision);
    }
    return teamSummariesByStageAndDivision;
  }, [teamSummariesByStageAndDivision, isForecast]);

  const groupedMatchesByDivision = useMemo(() => {
    if (!matches) return [];

    const filteredMatches = selectedTeamId
      ? matches.filter(match => match.team1Id === selectedTeamId || match.team2Id === selectedTeamId)
      : matches;

    const groups = new Map<string, Match[]>();
    
    filteredMatches.forEach(match => {
      const division = match.division || 'No Division';
      if (!groups.has(division)) {
        groups.set(division, []);
      }
      groups.get(division)!.push(match);
    });
    
    // Sort matches: completed first, then in-progress, then scheduled
    // Within each status, sort by date (latest first)
    const statusOrder: Record<string, number> = {
      'completed': 0,
      'in-progress': 1,
      'scheduled': 2
    };

    Array.from(groups.values()).forEach(divisionMatches => {
      divisionMatches.sort((a, b) => {
        // Primary sort: by status (normalize to lowercase for case-insensitive comparison)
        const aStatusNormalized = (a.status || '').toLowerCase().trim();
        const bStatusNormalized = (b.status || '').toLowerCase().trim();
        const aStatusOrder = statusOrder[aStatusNormalized] ?? 999;
        const bStatusOrder = statusOrder[bStatusNormalized] ?? 999;
        const statusDiff = aStatusOrder - bStatusOrder;
        if (statusDiff !== 0) return statusDiff;
        
        // Secondary sort: by date (latest first)
        const aDate = a.matchDate ? new Date(a.matchDate).getTime() : 0;
        const bDate = b.matchDate ? new Date(b.matchDate).getTime() : 0;
        return bDate - aDate;
      });
    });
    
    // Sort divisions alphabetically (A, B, C, etc.), with "No Division" last
    return Array.from(groups.entries()).sort(([a], [b]) => {
      if (a === 'No Division') return 1;
      if (b === 'No Division') return -1;
      return a.localeCompare(b);
    });
  }, [matches, selectedTeamId]);

  // Print: save the standings (Leaderboard or Forecast, as on screen) as a PDF and print it
  // Score Flip opens on (and installs for) this tournament
  const openScoreFlip = () => {
    if (!currentTournament) return;
    const key = (currentTournament as any).slug || currentTournament.id;
    window.open(`/coin-toss/?t=${encodeURIComponent(key)}`, "btm-coin-toss", "popup,width=480,height=800");
  };

  const handlePrint = () => {
    if (!currentTournament || displayData.length === 0) {
      toast({ title: "Nothing to print yet", description: "There are no standings to print." });
      return;
    }
    const doc = buildLeaderboardPdf({
      tournamentName: currentTournament.name,
      description: (currentTournament as any).description,
      data: displayData,
      isForecast,
    });
    const filename = exportFilename(currentTournament.name, isForecast ? "Forecast" : "Leaderboard", [], "pdf");
    const outcome = downloadAndPrintPdf(doc, filename);
    if (outcome === "printing") {
      toast({ title: "PDF downloaded", description: "Saved to your Downloads folder. The print window is opening." });
    } else if (outcome === "failed") {
      toast({ title: "Couldn't create the PDF", description: "Please try again.", variant: "destructive" });
    }
  };

  // Show loading state while tournaments are being loaded, tournament is being resolved, or data is being fetched
  if (tournamentsLoading || resultsLoading || teamsLoading || matchesLoading) {
    return (
      <div className="container mx-auto py-12 text-center">
        <div className="space-y-4">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-primary border-r-transparent"></div>
          <p className="text-sm text-muted-foreground">Loading leaderboard...</p>
        </div>
      </div>
    );
  }

  // If tournaments have loaded but no tournament is selected, show error
  if (!currentTournament) {
    return (
      <div className="container mx-auto py-12 text-center">
        <p className="text-muted-foreground">No tournament found</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-3 space-y-4">
      {/* Compact header: one title row, one tab row (plus a team row when filtering) */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <img src="/ptm-logo.png?v=4" alt="PTM" className="h-12 w-12 rounded-md object-cover flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <h1 className="text-xl sm:text-2xl font-bold leading-tight tracking-tight break-words" data-testid="text-tournament-name">
              {currentTournament.name}
            </h1>
            <p className="flex flex-wrap items-baseline gap-x-2 text-sm text-muted-foreground" data-testid="text-title">
              <span className="text-xl sm:text-2xl font-bold leading-tight tracking-tight text-foreground">
                {isForecast && !showMatchResults ? "Forecast Leaderboard" : "Leaderboard"}
              </span>
              <span>
                ·{" "}
                {new Date().toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              </span>
            </p>
          </div>
          {/* Public page on phones: Score Flip and a ☰ menu (Print, Rules, Shortcut, Help)
              replace the button row below, so the tabs sit right under the title */}
          {isReadOnly && (
            <div className="flex items-center gap-1 self-start flex-shrink-0 sm:hidden">
              <Button variant="outline" size="icon" className="h-12 w-12" onClick={openScoreFlip} aria-label="Score Flip" data-testid="button-coin-toss-mobile">
                <img src="/coin-toss/favicon.png?v=3" alt="" className="h-9 w-9 rounded-sm" />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Menu" data-testid="button-mobile-menu">
                    <Menu className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem onClick={handlePrint} data-testid="menu-item-print-leaderboard">
                    <Printer className="h-4 w-4 mr-2" />
                    Print
                  </DropdownMenuItem>
                  {(currentTournament as any).rulesPdfName && (
                    <DropdownMenuItem
                      onClick={() => window.open(`/api/tournaments/${currentTournament.id}/rules`, "_blank", "noopener,noreferrer")}
                      data-testid="menu-item-rules"
                    >
                      <FileText className="h-4 w-4 mr-2" />
                      Rules
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => setShowShortcut(true)} data-testid="menu-item-shortcut-leaderboard">
                    <MonitorSmartphone className="h-4 w-4 mr-2" />
                    Shortcut
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setShowHelp(true)} data-testid="menu-item-help-leaderboard">
                    <HelpCircle className="h-4 w-4 mr-2" />
                    Help
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>

        {/* Action buttons with labels, on their own row (scrolls sideways on narrow phones) */}
        <div className={`${isReadOnly ? "hidden sm:flex" : "flex"} flex-wrap items-center gap-1`}>
            {/* Signed-in organisers only; visitors have a separate public Teams link */}
            {!isReadOnly && (
              <Link href={viewToken ? `/teams?token=${encodeURIComponent(viewToken)}&view=readonly` : "/teams"}>
                <Button variant="outline" size="sm" className="flex-shrink-0 px-1.5 sm:px-2" data-testid="button-view-teams">
                  <Users className="h-4 w-4 mr-1.5" />
                  Teams
                </Button>
              </Link>
            )}
            <Button variant="outline" size="sm" className="flex-shrink-0 px-1.5 sm:px-2" onClick={handlePrint} data-testid="button-print-leaderboard">
              <Printer className="h-4 w-4 mr-1.5" />
              Print
            </Button>
            {(currentTournament as any).rulesPdfName && (
              <a
                href={`/api/tournaments/${currentTournament.id}/rules`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button variant="outline" size="sm" className="flex-shrink-0 px-1.5 sm:px-2" data-testid="button-view-rules">
                  <FileText className="h-4 w-4 mr-1.5" />
                  Rules
                </Button>
              </a>
            )}
            <Button
              variant="outline"
              className="flex-shrink-0 h-11 px-3 sm:px-4 text-base font-semibold"
              onClick={openScoreFlip}
              data-testid="button-coin-toss"
            >
              <img src="/coin-toss/favicon.png?v=3" alt="" className="h-8 w-8 mr-2 rounded-sm" />
              Score Flip
            </Button>
            <AddToHomeScreenButton
              tournamentName={currentTournament.name}
              slug={(currentTournament as any).slug}
              page="leaderboard"
              variant="sm"
              label="Install"
              buttonClassName="px-1.5 sm:px-2"
              open={showShortcut}
              onOpenChange={setShowShortcut}
            />
            <HelpDialog title="Leaderboard - Help" label="Help" open={showHelp} onOpenChange={setShowHelp}>
              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold mb-2">What is this page?</h3>
                  <p>The Leaderboard page displays team standings and match results for the tournament. It's a shareable, read-only view of tournament progress.</p>
                </div>
            
                <div>
                  <h3 className="font-semibold mb-2">Team Leaderboard</h3>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>View team rankings grouped by Stage and Division</li>
                    <li>See statistics: Points, Games Played/Won/Drawn/Lost, Score For/Against</li>
                    <li><strong>Click on a team name</strong> to view only that team's match results</li>
                  </ul>
                </div>
            
                <div>
                  <h3 className="font-semibold mb-2">All Match Results</h3>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>Click "All Results" to see all matches with scores</li>
                    <li>Matches are grouped by division</li>
                    <li>View match stage, status, date, and game scores</li>
                  </ul>
                </div>
            
                <div>
                  <h3 className="font-semibold mb-2">Team Match Filter</h3>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>Click any team name in the leaderboard to filter matches</li>
                    <li>Shows only matches where that team participated</li>
                    <li>Click "Back" to return to the full view</li>
                  </ul>
                </div>
            
                <div>
                  <h3 className="font-semibold mb-2">Forecast View</h3>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>Click "Forecast" to see predicted final standings</li>
                    <li>Rankings are based on <strong>average points per game</strong> and <strong>average score difference per game</strong></li>
                    <li>Useful when teams have played different numbers of games</li>
                  </ul>
                </div>

                <div>
                  <h3 className="font-semibold mb-2">Points</h3>
                  <p>
                    Points are awarded for every game played: Win = {currentTournament.pointsForWin ?? 3},
                    Draw = {currentTournament.pointsForDraw ?? 2}, Loss = {currentTournament.pointsForLoss ?? 1}.
                    {" "}No-Show = the team present gains {currentTournament.pointsForWin ?? 3} league points per game, with a game winning score of 13-7.
                    Team not showing: {(currentTournament as any).pointsForNoShow ?? 0} league points per game (losing score of 7-13).
                  </p>
                </div>

                <div>
                  <h3 className="font-semibold mb-2">Understanding Rankings</h3>
                  <p>Teams are ranked by: 1) Total Points, 2) Score Difference. Competition ranking (1,1,3) is used for ties. In Forecast mode, rankings use averages per game instead.</p>
                </div>

                <div>
                  <h3 className="font-semibold mb-2">Score Flip</h3>
                  <p>Press <strong>Score Flip</strong> to open it in a new window, then choose:</p>
                  <ul className="list-disc pl-5 space-y-1">
                    <li><strong>Coin Flip</strong>: <strong>swipe up</strong> (or press the space bar) to flip; <strong>slide sideways</strong> to turn the coin over and see both sides.</li>
                    <li><strong>Log Score</strong>: enter the date and team names, then use the big arrows to keep the score for up to 3 games. Each game has a timer (30 minutes unless you change it) that sounds an alarm when time is up. <strong>End Match</strong> saves the result on your phone and lets you share it.</li>
                  </ul>
                  <p className="mt-1">Press <strong>Install</strong> in the Score Flip window to add it to your home screen or desktop; it then works even without an internet connection.</p>
                </div>

                <div>
                  <h3 className="font-semibold mb-2">Home Screen / Desktop Shortcut</h3>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>Press the <strong>shortcut</strong> button (screen and phone icon) to add this leaderboard to your home screen or desktop, with the PTM logo</li>
                    <li><strong>To remove it on a computer:</strong> open the shortcut, click the <strong>⋮</strong> menu at the top right of its window and choose <strong>Uninstall</strong>. Or type <strong>chrome://apps</strong> (or <strong>edge://apps</strong>) in the address bar, right-click it and choose <strong>Remove</strong></li>
                    <li><strong>To remove it on a phone:</strong> press and hold the icon on your home screen and choose <strong>Remove</strong> (or <strong>Delete Bookmark</strong> on an iPhone)</li>
                  </ul>
                </div>
              </div>
            </HelpDialog>
        </div>

        <div className="inline-flex w-full sm:w-auto rounded-md bg-muted p-1 gap-1" role="tablist">
          {[
            { key: "leaderboard", label: "Leaderboard", active: !showMatchResults && !isForecast, testId: "button-show-leaderboard",
              onClick: () => { setShowMatchResults(false); setSelectedTeamId(null); setIsForecast(false); } },
            { key: "forecast", label: "Forecast", active: !showMatchResults && isForecast, testId: "button-show-forecast",
              onClick: () => { setShowMatchResults(false); setSelectedTeamId(null); setIsForecast(true); } },
            { key: "results", label: "All Results", active: showMatchResults && !selectedTeamId, testId: "button-show-matches",
              onClick: () => { setShowMatchResults(true); setSelectedTeamId(null); } },
          ].map(tab => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={tab.active}
              onClick={tab.onClick}
              data-testid={tab.testId}
              className={`flex-1 sm:flex-none whitespace-nowrap rounded px-3 py-1 text-sm font-medium transition-colors ${
                tab.active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {selectedTeamId && (
          <div className="flex items-center gap-2 min-w-0">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 flex-shrink-0"
              onClick={handleBackToLeaderboard}
              data-testid="button-back-to-leaderboard"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
            <span className="hidden sm:inline text-sm text-muted-foreground flex-shrink-0">Matches for</span>
            <span className="text-sm font-semibold truncate">{getTeamName(selectedTeamId)}</span>
            <div className="ml-auto flex-shrink-0">
              <TeamPerformanceDialog
                teamId={selectedTeamId}
                teams={teams}
                matches={matches}
                results={results}
                tournamentName={currentTournament.name}
              />
            </div>
          </div>
        )}
      </div>

      {!showMatchResults ? (
        <>
          {displayData.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No leaderboard data available yet.</p>
            </div>
          ) : (
            <div className="space-y-6">
          <p className="text-sm text-muted-foreground -mb-3" data-testid="text-leaderboard-tip">
            Click your team name to see match results &amp; performance stats.
          </p>
          {displayData.map(([stage, divisions]) => (
            <div key={stage} className="space-y-4">
              <div className="flex items-center gap-2">
                <Badge variant="default" className="text-sm px-2.5 py-1" data-testid={`badge-stage-${stage}`}>
                  {stageLabels[stage as keyof typeof stageLabels]}
                </Badge>
              </div>
              
              {divisions.map(([division, divisionSummaries]) => (
                <div key={`${stage}-${division}`}>
                  <div className="mb-3">
                    <h3 className="text-base font-semibold flex items-center gap-2">
                      {division !== 'No Division' && (
                        <Badge variant="outline" className="px-2 py-1" data-testid={`badge-division-${division}`}>
                          Division {division}
                        </Badge>
                      )}
                      {division === 'No Division' && (
                        <span>No Division Assigned</span>
                      )}
                      <span className="text-muted-foreground text-sm font-normal">
                        ({divisionSummaries.length} {divisionSummaries.length === 1 ? 'team' : 'teams'})
                      </span>
                    </h3>
                  </div>
                  <div className="overflow-x-auto">
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-12 max-sm:w-10 text-center text-sm max-sm:text-xs">Position</TableHead>
                            <TableHead className="text-sm max-sm:text-xs">Team</TableHead>
                            <TableHead className="text-center text-sm max-sm:text-xs">Played</TableHead>
                            <TableHead className="text-center text-sm max-sm:text-xs">Won</TableHead>
                            <TableHead className="text-center text-sm max-sm:text-xs">Drawn</TableHead>
                            <TableHead className="text-center text-sm max-sm:text-xs">Lost</TableHead>
                            <TableHead className="text-center text-sm max-sm:text-xs">Points</TableHead>
                            <TableHead className="text-center text-sm max-sm:text-xs">Score For</TableHead>
                            <TableHead className="text-center text-sm max-sm:text-xs">Score Against</TableHead>
                            <TableHead className="text-center text-sm max-sm:text-xs">Diff</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {divisionSummaries.map((summary) => (
                            <TableRow key={summary.teamName} data-testid={`row-summary-${summary.teamName}`}>
                              <TableCell className="text-center text-sm max-sm:text-xs py-2 max-sm:py-1 px-1" data-testid={`text-position-${summary.teamName}`}>
                                <span className="font-mono font-semibold">
                                  {summary.position !== null ? summary.position : ''}
                                </span>
                              </TableCell>
                              <TableCell className="font-medium text-sm max-sm:text-xs py-2 max-sm:py-1 px-1" data-testid={`text-team-${summary.teamName}`}>
                                <button
                                  type="button"
                                  className="text-left text-primary hover:underline cursor-pointer"
                                  onClick={() => handleTeamClick(summary.teamId)}
                                  data-testid={`link-team-matches-${summary.teamName}`}
                                >
                                  {summary.teamName}
                                </button>
                              </TableCell>
                              <TableCell className="text-center text-sm max-sm:text-xs py-2 max-sm:py-1 px-1" data-testid={`text-played-${summary.teamName}`}>
                                <span className="font-mono">{summary.gamesPlayed}</span>
                              </TableCell>
                              <TableCell className="text-center text-sm max-sm:text-xs py-2 max-sm:py-1 px-1" data-testid={`text-won-${summary.teamName}`}>
                                <span className="font-mono">{summary.gamesWon}</span>
                              </TableCell>
                              <TableCell className="text-center text-sm max-sm:text-xs py-2 max-sm:py-1 px-1" data-testid={`text-drawn-${summary.teamName}`}>
                                <span className="font-mono">{summary.gamesDrawn}</span>
                              </TableCell>
                              <TableCell className="text-center text-sm max-sm:text-xs py-2 max-sm:py-1 px-1" data-testid={`text-lost-${summary.teamName}`}>
                                <span className="font-mono">{summary.gamesLost}</span>
                              </TableCell>
                              <TableCell className="text-center text-sm max-sm:text-xs py-2 max-sm:py-1 px-1" data-testid={`text-points-${summary.teamName}`}>
                                <Badge variant="default" className="font-mono text-xs">
                                  {summary.points}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-center text-sm max-sm:text-xs py-2 max-sm:py-1 px-1" data-testid={`text-score-for-${summary.teamName}`}>
                                <span className="font-mono">{summary.scoreFor}</span>
                              </TableCell>
                              <TableCell className="text-center text-sm max-sm:text-xs py-2 max-sm:py-1 px-1" data-testid={`text-score-against-${summary.teamName}`}>
                                <span className="font-mono">{summary.scoreAgainst}</span>
                              </TableCell>
                              <TableCell className="text-center text-sm max-sm:text-xs py-2 max-sm:py-1 px-1" data-testid={`text-score-difference-${summary.teamName}`}>
                                <Badge 
                                  variant={summary.scoreDifference > 0 ? "default" : summary.scoreDifference < 0 ? "destructive" : "secondary"}
                                  className="font-mono text-xs"
                                >
                                  {summary.scoreDifference > 0 ? '+' : ''}{summary.scoreDifference}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))}
            </div>
          )}
        </>
      ) : (
        <>
          {groupedMatchesByDivision.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No matches available yet.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {groupedMatchesByDivision.map(([division, divisionMatches]) => (
                <div key={division}>
                  <div className="mb-3">
                    <h3 className="text-base font-semibold flex items-center gap-2">
                      {division !== 'No Division' && (
                        <Badge variant="outline" className="px-2 py-1" data-testid={`badge-division-${division}`}>
                          Division {division}
                        </Badge>
                      )}
                      {division === 'No Division' && (
                        <span>No Division Assigned</span>
                      )}
                      <span className="text-muted-foreground text-sm font-normal">
                        ({divisionMatches.length} {divisionMatches.length === 1 ? 'match' : 'matches'})
                      </span>
                    </h3>
                  </div>
                  <div className="overflow-x-auto">
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-sm max-sm:text-xs">Stage</TableHead>
                            <TableHead className="text-sm max-sm:text-xs">Status</TableHead>
                            <TableHead className="text-sm max-sm:text-xs">Date</TableHead>
                            <TableHead className="text-sm max-sm:text-xs">Team 1</TableHead>
                            <TableHead className="text-center text-sm max-sm:text-xs">G1</TableHead>
                            <TableHead className="text-center text-sm max-sm:text-xs">G2</TableHead>
                            <TableHead className="text-center text-sm max-sm:text-xs">G3</TableHead>
                            <TableHead className="text-sm max-sm:text-xs">Team 2</TableHead>
                            <TableHead className="text-center text-sm max-sm:text-xs">G1</TableHead>
                            <TableHead className="text-center text-sm max-sm:text-xs">G2</TableHead>
                            <TableHead className="text-center text-sm max-sm:text-xs">G3</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {divisionMatches.map((match) => (
                            <TableRow key={match.id} data-testid={`row-match-${match.id}`}>
                              <TableCell className="font-medium text-sm max-sm:text-xs py-2 max-sm:py-1 px-1" data-testid={`text-stage-${match.id}`}>
                                {stageLabels[match.stage as keyof typeof stageLabels]}
                              </TableCell>
                              <TableCell className="text-sm max-sm:text-xs py-2 max-sm:py-1 px-1" data-testid={`text-status-${match.id}`}>
                                <Badge
                                  variant={
                                    match.status === 'completed'
                                      ? 'default'
                                      : match.status === 'in-progress'
                                      ? 'secondary'
                                      : 'outline'
                                  }
                                  className="text-xs"
                                >
                                  {statusLabels[match.status as keyof typeof statusLabels]}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-xs max-sm:text-[0.625rem] py-2 max-sm:py-1 px-1" data-testid={`text-date-${match.id}`}>
                                {match.matchDate
                                  ? new Date(match.matchDate).toLocaleDateString('en-US', {
                                      month: 'short',
                                      day: 'numeric',
                                      year: 'numeric',
                                    })
                                  : '-'}
                              </TableCell>
                              <TableCell className="font-medium text-sm max-sm:text-xs py-2 max-sm:py-1 px-1" data-testid={`text-team1-${match.id}`}>
                                {getTeamName(match.team1Id)}
                              </TableCell>
                              <TableCell className="text-center text-sm max-sm:text-xs py-2 max-sm:py-1 px-1" data-testid={`text-team1-g1-${match.id}`}>
                                <span className="font-mono">
                                  {match.team1Game1Score !== null ? match.team1Game1Score : '-'}
                                </span>
                              </TableCell>
                              <TableCell className="text-center text-sm max-sm:text-xs py-2 max-sm:py-1 px-1" data-testid={`text-team1-g2-${match.id}`}>
                                <span className="font-mono">
                                  {match.team1Game2Score !== null ? match.team1Game2Score : '-'}
                                </span>
                              </TableCell>
                              <TableCell className="text-center text-sm max-sm:text-xs py-2 max-sm:py-1 px-1" data-testid={`text-team1-g3-${match.id}`}>
                                <span className="font-mono">
                                  {match.team1Game3Score !== null ? match.team1Game3Score : '-'}
                                </span>
                              </TableCell>
                              <TableCell className="font-medium text-sm max-sm:text-xs py-2 max-sm:py-1 px-1" data-testid={`text-team2-${match.id}`}>
                                {getTeamName(match.team2Id)}
                              </TableCell>
                              <TableCell className="text-center text-sm max-sm:text-xs py-2 max-sm:py-1 px-1" data-testid={`text-team2-g1-${match.id}`}>
                                <span className="font-mono">
                                  {match.team2Game1Score !== null ? match.team2Game1Score : '-'}
                                </span>
                              </TableCell>
                              <TableCell className="text-center text-sm max-sm:text-xs py-2 max-sm:py-1 px-1" data-testid={`text-team2-g2-${match.id}`}>
                                <span className="font-mono">
                                  {match.team2Game2Score !== null ? match.team2Game2Score : '-'}
                                </span>
                              </TableCell>
                              <TableCell className="text-center text-sm max-sm:text-xs py-2 max-sm:py-1 px-1" data-testid={`text-team2-g3-${match.id}`}>
                                <span className="font-mono">
                                  {match.team2Game3Score !== null ? match.team2Game3Score : '-'}
                                </span>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
