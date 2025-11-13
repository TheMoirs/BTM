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

const stageLabels = {
  initial: "Initial",
  "quarter-finals": "Quarter-Finals",
  "semi-finals": "Semi-Finals",
  finals: "Finals",
};

type TeamSummary = {
  teamName: string;
  gamesPlayed: number;
  gamesWon: number;
  gamesDrawn: number;
  gamesLost: number;
  points: number;
  scoreFor: number;
  scoreAgainst: number;
  scoreDifference: number;
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
    // Group results by stage and team (use all results, not filtered)
    const stageGroups = new Map<string, Map<string, (TeamSummary & { division: string | null })>>();

    // Add Initial stage with all teams if teams data is available
    if (teams && teams.length > 0) {
      const initialTeamMap = new Map<string, TeamSummary & { division: string | null }>();
      
      // Initialize all teams with zero stats
      teams.forEach(team => {
        initialTeamMap.set(team.name, {
          teamName: team.name,
          division: team.division,
          gamesPlayed: 0,
          gamesWon: 0,
          gamesDrawn: 0,
          gamesLost: 0,
          points: 0,
          scoreFor: 0,
          scoreAgainst: 0,
          scoreDifference: 0,
        });
      });
      
      stageGroups.set('initial', initialTeamMap);
    }

    // Process results and update team stats
    if (results && results.length > 0) {
      results.forEach(result => {
        const stage = result.stage;
        
        if (!stageGroups.has(stage)) {
          stageGroups.set(stage, new Map<string, TeamSummary & { division: string | null }>());
        }
        
        const teamMap = stageGroups.get(stage)!;
        
        if (!teamMap.has(result.teamName)) {
          teamMap.set(result.teamName, {
            teamName: result.teamName,
            division: result.division,
            gamesPlayed: 0,
            gamesWon: 0,
            gamesDrawn: 0,
            gamesLost: 0,
            points: 0,
            scoreFor: 0,
            scoreAgainst: 0,
            scoreDifference: 0,
          });
        }

        const summary = teamMap.get(result.teamName)!;
        if (result.division && !summary.division) {
          summary.division = result.division;
        }
        summary.gamesPlayed += result.gamesPlayed;
        summary.gamesWon += result.gamesWon;
        summary.gamesLost += result.gamesLost;
        summary.gamesDrawn += result.gamesDrawn;
        summary.points += result.points;
        summary.scoreFor += result.scoreFor;
        summary.scoreAgainst += result.scoreAgainst;
        summary.scoreDifference += result.scoreDifference;
      });
    }

    // If no stages exist, return empty array
    if (stageGroups.size === 0) return [];

    // Sort stages in tournament progression order
    const stageOrder = ['initial', 'quarter-finals', 'semi-finals', 'finals'];
    const sortedStages = Array.from(stageGroups.entries()).sort(([a], [b]) => {
      return stageOrder.indexOf(a) - stageOrder.indexOf(b);
    });

    // For each stage, group teams by division
    return sortedStages.map(([stage, teamMap]) => {
      const allSummaries = Array.from(teamMap.values());
      
      // Separate teams with results from teams without results
      const teamsWithResults = allSummaries.filter(s => s.gamesPlayed > 0);
      const teamsWithoutResults = allSummaries.filter(s => s.gamesPlayed === 0);
      
      // Sort teams with results by points and score difference
      teamsWithResults.sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        return b.scoreDifference - a.scoreDifference;
      });
      
      // Sort teams without results alphabetically
      teamsWithoutResults.sort((a, b) => a.teamName.localeCompare(b.teamName));
      
      // Combine: teams with results first, then teams without results
      const summaries = [...teamsWithResults, ...teamsWithoutResults];

      const divisionGroups = new Map<string, (TeamSummary & { division: string | null })[]>();
      summaries.forEach(summary => {
        const division = summary.division || 'No Division';
        if (!divisionGroups.has(division)) {
          divisionGroups.set(division, []);
        }
        divisionGroups.get(division)!.push(summary);
      });

      const sortedDivisions = Array.from(divisionGroups.entries()).sort(([a], [b]) => {
        if (a === 'No Division') return 1;
        if (b === 'No Division') return -1;
        return a.localeCompare(b);
      });

      return [stage, sortedDivisions] as [string, [string, (TeamSummary & { division: string | null })[]][]];
    });
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
