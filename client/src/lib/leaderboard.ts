import type { Result, Team } from "@shared/schema";

export type TeamSummary = {
  teamId: string | null;
  teamName: string;
  gamesPlayed: number;
  gamesWon: number;
  gamesDrawn: number;
  gamesLost: number;
  points: number;
  scoreFor: number;
  scoreAgainst: number;
  scoreDifference: number;
  position: number | null;
};

type TeamSummaryWithDivision = TeamSummary & { division: string | null };

export function calculateTeamSummariesByStageAndDivision(
  results: Result[] | undefined,
  teams: Team[] | undefined
): [string, [string, TeamSummaryWithDivision[]][]][] {
  const stageGroups = new Map<string, Map<string, TeamSummaryWithDivision>>();

  // Add Initial stage with all teams if teams data is available
  if (teams && teams.length > 0) {
    const initialTeamMap = new Map<string, TeamSummaryWithDivision>();
    
    // Initialize all teams with zero stats
    teams.forEach(team => {
      const displayName = team.teamDisplayId ? `${team.name} (${team.teamDisplayId})` : team.name;
      initialTeamMap.set(team.name, {
        teamId: team.id,
        teamName: displayName,
        division: team.division,
        gamesPlayed: 0,
        gamesWon: 0,
        gamesDrawn: 0,
        gamesLost: 0,
        points: 0,
        scoreFor: 0,
        scoreAgainst: 0,
        scoreDifference: 0,
        position: null,
      });
    });
    
    stageGroups.set('initial', initialTeamMap);
  }

  // Process results and update team stats
  if (results && results.length > 0) {
    results.forEach(result => {
      const stage = result.stage;
      
      if (!stageGroups.has(stage)) {
        stageGroups.set(stage, new Map<string, TeamSummaryWithDivision>());
      }
      
      const teamMap = stageGroups.get(stage)!;
      
      if (!teamMap.has(result.teamName)) {
        const team = teams?.find(t => t.name === result.teamName);
        const displayName = team?.teamDisplayId ? `${result.teamName} (${team.teamDisplayId})` : result.teamName;
        teamMap.set(result.teamName, {
          teamId: team?.id || null,
          teamName: displayName,
          division: result.division,
          gamesPlayed: 0,
          gamesWon: 0,
          gamesDrawn: 0,
          gamesLost: 0,
          points: 0,
          scoreFor: 0,
          scoreAgainst: 0,
          scoreDifference: 0,
          position: null,
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

  // For each stage, group teams by division and calculate positions
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

    // Group by division
    const divisionGroups = new Map<string, TeamSummaryWithDivision[]>();
    summaries.forEach(summary => {
      const division = summary.division || 'No Division';
      if (!divisionGroups.has(division)) {
        divisionGroups.set(division, []);
      }
      // Deep clone the summary to avoid mutation issues across divisions
      divisionGroups.get(division)!.push({ ...summary });
    });

    // Calculate positions for each division
    divisionGroups.forEach((divisionTeams) => {
      applyCompetitionRanking(divisionTeams);
    });

    const sortedDivisions = Array.from(divisionGroups.entries()).sort(([a], [b]) => {
      if (a === 'No Division') return 1;
      if (b === 'No Division') return -1;
      return a.localeCompare(b);
    });

    return [stage, sortedDivisions] as [string, [string, TeamSummaryWithDivision[]][]];
  });
}

export function applyCompetitionRanking(teams: TeamSummary[]): void {
  // Separate ranked teams (with games played) from unranked teams
  const rankedTeams = teams.filter(t => t.gamesPlayed > 0);
  
  // Calculate positions for ranked teams using competition ranking (1,1,3)
  let currentPosition = 1;
  let teamsAtCurrentRank = 0;
  let lastPoints: number | null = null;
  let lastScoreDifference: number | null = null;
  
  rankedTeams.forEach((team) => {
    // Check if this team has same points AND score difference as previous team
    const isTied = lastPoints !== null && 
                  lastScoreDifference !== null &&
                  team.points === lastPoints && 
                  team.scoreDifference === lastScoreDifference;
    
    if (!isTied) {
      // New rank: current position + number of teams at previous rank
      currentPosition += teamsAtCurrentRank;
      teamsAtCurrentRank = 1;
    } else {
      // Same rank as previous team (tie)
      teamsAtCurrentRank++;
    }
    
    team.position = currentPosition;
    lastPoints = team.points;
    lastScoreDifference = team.scoreDifference;
  });
  
  // Unranked teams keep position = null (already initialized)
}
