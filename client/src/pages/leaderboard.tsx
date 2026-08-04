import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useTournament } from "@/contexts/TournamentContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Users } from "lucide-react";
import { HelpDialog } from "@/components/help-dialog";
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
  initial: "Initial",
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
  const [showMatchResults, setShowMatchResults] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [isForecast, setIsForecast] = useState(false);

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
    <div className="container mx-auto py-6 space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight" data-testid="text-title">
          {isForecast ? "Forecast Leaderboard" : "Leaderboard"}
        </h1>
        <div className="flex flex-col gap-1">
          <p className="text-lg font-semibold">{currentTournament.name}</p>
          <p className="text-sm text-muted-foreground">
            Points: Win={currentTournament.pointsForWin ?? 2}, Draw={currentTournament.pointsForDraw ?? 1}, Loss={currentTournament.pointsForLoss ?? 0}
          </p>
          <p className="text-sm text-muted-foreground">
            {new Date().toLocaleString()}
          </p>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Button
          variant={!showMatchResults && !isForecast ? "default" : "outline"}
          onClick={() => { setShowMatchResults(false); setSelectedTeamId(null); setIsForecast(false); }}
          data-testid="button-show-leaderboard"
        >
          Leaderboard
        </Button>
        <Button
          variant={!showMatchResults && isForecast ? "default" : "outline"}
          onClick={() => { setShowMatchResults(false); setSelectedTeamId(null); setIsForecast(true); }}
          data-testid="button-show-forecast"
        >
          Forecast
        </Button>
        <Button
          variant={showMatchResults && !selectedTeamId ? "default" : "outline"}
          onClick={() => { setShowMatchResults(true); setSelectedTeamId(null); }}
          data-testid="button-show-matches"
        >
          All Match Results
        </Button>
        <Link href="/teams">
          <Button
            variant="outline"
            data-testid="button-view-teams"
          >
            <Users className="h-4 w-4 mr-1" />
            View Teams
          </Button>
        </Link>
        {selectedTeamId && (
          <Button
            variant="secondary"
            onClick={handleBackToLeaderboard}
            data-testid="button-back-to-leaderboard"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Leaderboard
          </Button>
        )}
        <HelpDialog title="Leaderboard - Help">
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
                <li>Click "All Match Results" to see all matches with scores</li>
                <li>Matches are grouped by division</li>
                <li>View match stage, status, date, and game scores</li>
              </ul>
            </div>
            
            <div>
              <h3 className="font-semibold mb-2">Team Match Filter</h3>
              <ul className="list-disc pl-5 space-y-1">
                <li>Click any team name in the leaderboard to filter matches</li>
                <li>Shows only matches where that team participated</li>
                <li>Click "Back to Leaderboard" to return to the full view</li>
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
              <h3 className="font-semibold mb-2">Understanding Rankings</h3>
              <p>Teams are ranked by: 1) Total Points, 2) Score Difference. Competition ranking (1,1,3) is used for ties. In Forecast mode, rankings use averages per game instead.</p>
            </div>
          </div>
        </HelpDialog>
      </div>

      {selectedTeamId && (
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-sm px-3 py-1">
            Showing matches for: {getTeamName(selectedTeamId)}
          </Badge>
        </div>
      )}

      {!showMatchResults ? (
        <>
          {displayData.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No leaderboard data available yet.</p>
            </div>
          ) : (
            <div className="space-y-8">
          {displayData.map(([stage, divisions]) => (
            <div key={stage} className="space-y-4">
              <div className="flex items-center gap-2">
                <Badge variant="default" className="text-lg px-3 py-1.5" data-testid={`badge-stage-${stage}`}>
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
            <div className="space-y-8">
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
