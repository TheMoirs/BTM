import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useTournament } from "@/contexts/TournamentContext";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Result, Team } from "@shared/schema";
import { calculateTeamSummariesByStageAndDivision } from "@/lib/leaderboard";

const stageLabels = {
  initial: "Initial",
  "quarter-finals": "Quarter-Finals",
  "semi-finals": "Semi-Finals",
  finals: "Finals",
};

export default function Leaderboard() {
  const { currentTournament, isLoading: tournamentsLoading } = useTournament();

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

  const teamSummariesByStageAndDivision = useMemo(() => {
    return calculateTeamSummariesByStageAndDivision(results, teams);
  }, [results, teams]);

  // Show loading state while tournaments are being loaded, tournament is being resolved, or data is being fetched
  if (tournamentsLoading || resultsLoading || teamsLoading) {
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
          Team Leaderboard
        </h1>
        <div className="flex flex-col gap-1">
          <p className="text-lg font-semibold">{currentTournament.name}</p>
          <p className="text-sm text-muted-foreground">
            {new Date().toLocaleString()}
          </p>
        </div>
      </div>

      {teamSummariesByStageAndDivision.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No leaderboard data available yet.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {teamSummariesByStageAndDivision.map(([stage, divisions]) => (
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
                            <TableHead className="w-20 text-center">Position</TableHead>
                            <TableHead>Team</TableHead>
                            <TableHead className="text-center">Played</TableHead>
                            <TableHead className="text-center">Won</TableHead>
                            <TableHead className="text-center">Drawn</TableHead>
                            <TableHead className="text-center">Lost</TableHead>
                            <TableHead className="text-center">Points</TableHead>
                            <TableHead className="text-center">Score For</TableHead>
                            <TableHead className="text-center">Score Against</TableHead>
                            <TableHead className="text-center">Score Difference</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {divisionSummaries.map((summary) => (
                            <TableRow key={summary.teamName} data-testid={`row-summary-${summary.teamName}`}>
                              <TableCell className="text-center" data-testid={`text-position-${summary.teamName}`}>
                                <span className="font-mono font-semibold">
                                  {summary.position !== null ? summary.position : ''}
                                </span>
                              </TableCell>
                              <TableCell className="font-medium" data-testid={`text-team-${summary.teamName}`}>
                                {summary.teamName}
                              </TableCell>
                              <TableCell className="text-center" data-testid={`text-played-${summary.teamName}`}>
                                <span className="font-mono">{summary.gamesPlayed}</span>
                              </TableCell>
                              <TableCell className="text-center" data-testid={`text-won-${summary.teamName}`}>
                                <span className="font-mono">{summary.gamesWon}</span>
                              </TableCell>
                              <TableCell className="text-center" data-testid={`text-drawn-${summary.teamName}`}>
                                <span className="font-mono">{summary.gamesDrawn}</span>
                              </TableCell>
                              <TableCell className="text-center" data-testid={`text-lost-${summary.teamName}`}>
                                <span className="font-mono">{summary.gamesLost}</span>
                              </TableCell>
                              <TableCell className="text-center" data-testid={`text-points-${summary.teamName}`}>
                                <Badge variant="default" className="font-mono">
                                  {summary.points}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-center" data-testid={`text-score-for-${summary.teamName}`}>
                                <span className="font-mono">{summary.scoreFor}</span>
                              </TableCell>
                              <TableCell className="text-center" data-testid={`text-score-against-${summary.teamName}`}>
                                <span className="font-mono">{summary.scoreAgainst}</span>
                              </TableCell>
                              <TableCell className="text-center" data-testid={`text-score-difference-${summary.teamName}`}>
                                <Badge 
                                  variant={summary.scoreDifference > 0 ? "default" : summary.scoreDifference < 0 ? "destructive" : "secondary"}
                                  className="font-mono"
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
    </div>
  );
}
