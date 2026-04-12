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
  avgPoints: number | null;
  avgScoreDifference: number | null;
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
        avgPoints: null,
        avgScoreDifference: null,
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
      
      // Find the team - try exact match first, then check if result.teamName includes team name
      // This handles cases where result.teamName might include the display ID suffix
      let team = teams?.find(t => t.name === result.teamName);
      let lookupKey = result.teamName;
      
      // If no exact match, try to find by checking if result.teamName starts with team name
      if (!team && teams) {
        team = teams.find(t => result.teamName.startsWith(t.name + ' (') || result.teamName === t.name);
        if (team) {
          lookupKey = team.name; // Use the clean team name as the key
        }
      }
      
      if (!teamMap.has(lookupKey)) {
        const displayName = team?.teamDisplayId ? `${team.name} (${team.teamDisplayId})` : (team?.name || result.teamName);
        teamMap.set(lookupKey, {
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
          avgPoints: null,
          avgScoreDifference: null,
        });
      }

      const summary = teamMap.get(lookupKey)!;
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
  const stageOrder = ['finals', 'semi-finals', 'quarter-finals', 'initial'];
  const sortedStages = Array.from(stageGroups.entries()).sort(([a], [b]) => {
    return stageOrder.indexOf(a) - stageOrder.indexOf(b);
  });

  // For each stage, group teams by division and calculate positions
  return sortedStages.map(([stage, teamMap]) => {
    const allSummaries = Array.from(teamMap.values());
    
    // Calculate averages for all teams
    allSummaries.forEach(summary => {
      if (summary.gamesPlayed > 0) {
        summary.avgPoints = summary.points / summary.gamesPlayed;
        summary.avgScoreDifference = summary.scoreDifference / summary.gamesPlayed;
      }
    });
    
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

export function applyForecastSort(
  data: [string, [string, TeamSummaryWithDivision[]][]][]
): [string, [string, TeamSummaryWithDivision[]][]][] {
  return data.map(([stage, divisions]) => {
    const newDivisions = divisions.map(([division, summaries]) => {
      const cloned = summaries.map(s => ({ ...s }));
      
      const teamsWithResults = cloned.filter(s => s.gamesPlayed > 0);
      const teamsWithoutResults = cloned.filter(s => s.gamesPlayed === 0);
      
      // Sort by average points per game, then average score difference per game
      teamsWithResults.sort((a, b) => {
        const aAvgPts = a.avgPoints ?? 0;
        const bAvgPts = b.avgPoints ?? 0;
        if (bAvgPts !== aAvgPts) return bAvgPts - aAvgPts;
        const aAvgDiff = a.avgScoreDifference ?? 0;
        const bAvgDiff = b.avgScoreDifference ?? 0;
        return bAvgDiff - aAvgDiff;
      });
      
      teamsWithoutResults.sort((a, b) => a.teamName.localeCompare(b.teamName));
      
      const sorted = [...teamsWithResults, ...teamsWithoutResults];
      applyForecastRanking(sorted);
      
      return [division, sorted] as [string, TeamSummaryWithDivision[]];
    });
    
    return [stage, newDivisions] as [string, [string, TeamSummaryWithDivision[]][]];
  });
}

export function applyForecastRanking(teams: TeamSummary[]): void {
  const rankedTeams = teams.filter(t => t.gamesPlayed > 0);
  
  let currentPosition = 1;
  let teamsAtCurrentRank = 0;
  let lastAvgPts: number | null = null;
  let lastAvgDiff: number | null = null;
  
  rankedTeams.forEach((team) => {
    const avgPts = team.avgPoints ?? 0;
    const avgDiff = team.avgScoreDifference ?? 0;
    
    const isTied = lastAvgPts !== null && 
                  lastAvgDiff !== null &&
                  Math.abs(avgPts - lastAvgPts) < 0.0001 && 
                  Math.abs(avgDiff - lastAvgDiff) < 0.0001;
    
    if (!isTied) {
      currentPosition += teamsAtCurrentRank;
      teamsAtCurrentRank = 1;
    } else {
      teamsAtCurrentRank++;
    }
    
    team.position = currentPosition;
    lastAvgPts = avgPts;
    lastAvgDiff = avgDiff;
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
