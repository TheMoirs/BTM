import type { Match, Result, Team } from "@shared/schema";
import { calculateTeamSummariesByStageAndDivision } from "@/lib/leaderboard";

export type MatchOutcome = "W" | "D" | "L";

export type TeamPerformance = {
  team: Team;
  displayName: string;
  division: string | null;
  // League (Stage 1) standing
  position: number | null;
  divisionSize: number;
  leaguePoints: number;
  // Furthest knockout stage reached, if any
  furthestStage: string | null;
  // Matches (a match is a set of games against one opponent)
  matchesPlayed: number;
  matchesWon: number;
  matchesDrawn: number;
  matchesLost: number;
  // Games
  gamesPlayed: number;
  gamesWon: number;
  gamesDrawn: number;
  gamesLost: number;
  gameWinPct: number | null;
  // Boules points scored in games
  scoreFor: number;
  scoreAgainst: number;
  scoreDifference: number;
  avgFor: number | null;
  avgAgainst: number | null;
  // 13-0 games ("fannys")
  fannysFor: number;
  fannysAgainst: number;
  noShows: number;
  // Most recent first
  form: MatchOutcome[];
  longestWinStreak: number;
  bestWin: { score: string; opponent: string } | null;
  closestGame: { score: string; opponent: string; won: boolean } | null;
};

const stageNames: Record<string, string> = {
  "quarter-finals": "Quarter-Finals",
  "semi-finals": "Semi-Finals",
  finals: "Finals",
};
const stageOrder = ["initial", "quarter-finals", "semi-finals", "finals"];

export function calculateTeamPerformance(
  teamId: string,
  teams: Team[] | undefined,
  matches: Match[] | undefined,
  results: Result[] | undefined,
): TeamPerformance | null {
  const team = teams?.find((t) => t.id === teamId);
  if (!team) return null;

  const nameOf = (id: string) => {
    const t = teams?.find((x) => x.id === id);
    if (!t) return "Unknown";
    return t.teamDisplayId ? `${t.name} (${t.teamDisplayId})` : t.name;
  };
  const displayName = nameOf(team.id);

  // League standing (Stage 1) from the same calculation the leaderboard uses
  const byStage = calculateTeamSummariesByStageAndDivision(results, teams);
  let position: number | null = null;
  let divisionSize = 0;
  let leaguePoints = 0;
  const initial = byStage.find(([stage]) => stage === "initial");
  initial?.[1].forEach(([, summaries]) => {
    const s = summaries.find((x) => x.teamId === team.id);
    if (s) {
      position = s.position;
      divisionSize = summaries.length;
      leaguePoints = s.points;
    }
  });

  // This team's result rows (one per scored match) are the authority on games and points
  // Result rows store the display name ("Name (A3)"), older rows may store just the name
  const isThisTeam = (rowName: string) =>
    rowName === displayName || rowName === team.name || rowName.startsWith(team.name + " (");
  const myMatchIds = new Set(
    (matches ?? []).filter((m) => m.team1Id === team.id || m.team2Id === team.id).map((m) => m.id),
  );
  const teamResults = (results ?? []).filter((r) => myMatchIds.has(r.matchId) && isThisTeam(r.teamName));
  const resultByMatch = new Map(teamResults.map((r) => [r.matchId, r]));

  let gamesPlayed = 0, gamesWon = 0, gamesDrawn = 0, gamesLost = 0;
  let scoreFor = 0, scoreAgainst = 0;
  teamResults.forEach((r) => {
    gamesPlayed += r.gamesPlayed;
    gamesWon += r.gamesWon;
    gamesDrawn += r.gamesDrawn;
    gamesLost += r.gamesLost;
    scoreFor += r.scoreFor;
    scoreAgainst += r.scoreAgainst;
  });

  let furthestStage: string | null = null;
  teamResults.forEach((r) => {
    if (r.stage !== "initial" && stageNames[r.stage]) {
      if (!furthestStage || stageOrder.indexOf(r.stage) > stageOrder.indexOf(furthestStage)) {
        furthestStage = r.stage;
      }
    }
  });

  // Played matches, oldest first
  const played = (matches ?? [])
    .filter((m) => (m.team1Id === team.id || m.team2Id === team.id) && resultByMatch.has(m.id))
    .sort((a, b) => {
      const ad = a.matchDate ? new Date(a.matchDate).getTime() : 0;
      const bd = b.matchDate ? new Date(b.matchDate).getTime() : 0;
      return ad - bd;
    });

  let matchesWon = 0, matchesDrawn = 0, matchesLost = 0;
  let fannysFor = 0, fannysAgainst = 0, noShows = 0;
  let streak = 0, longestWinStreak = 0;
  let bestWin: TeamPerformance["bestWin"] = null;
  let bestMargin = -1;
  let closestGame: TeamPerformance["closestGame"] = null;
  let closestMargin = Infinity;
  const outcomes: MatchOutcome[] = [];

  played.forEach((m) => {
    const r = resultByMatch.get(m.id)!;
    const outcome: MatchOutcome = r.gamesWon > r.gamesLost ? "W" : r.gamesWon < r.gamesLost ? "L" : "D";
    outcomes.push(outcome);
    if (outcome === "W") matchesWon++;
    else if (outcome === "D") matchesDrawn++;
    else matchesLost++;
    streak = outcome === "W" ? streak + 1 : 0;
    longestWinStreak = Math.max(longestWinStreak, streak);

    const isTeam1 = m.team1Id === team.id;
    const myNoShow = isTeam1 ? m.team1NoShow : m.team2NoShow;
    const theirNoShow = isTeam1 ? m.team2NoShow : m.team1NoShow;
    if (myNoShow) noShows++;
    if (myNoShow || theirNoShow) return; // no real games were played

    const opponent = nameOf(isTeam1 ? m.team2Id : m.team1Id);
    const games: [number | null, number | null][] = [
      [m.team1Game1Score, m.team2Game1Score],
      [m.team1Game2Score, m.team2Game2Score],
      [m.team1Game3Score, m.team2Game3Score],
    ];
    games.forEach(([s1, s2]) => {
      if (s1 === null || s2 === null) return;
      const mine = isTeam1 ? s1 : s2;
      const theirs = isTeam1 ? s2 : s1;
      if (mine === 13 && theirs === 0) fannysFor++;
      if (theirs === 13 && mine === 0) fannysAgainst++;
      const margin = mine - theirs;
      if (margin > bestMargin && margin > 0) {
        bestMargin = margin;
        bestWin = { score: `${mine}–${theirs}`, opponent };
      }
      if (margin !== 0 && Math.abs(margin) < closestMargin) {
        closestMargin = Math.abs(margin);
        closestGame = { score: `${mine}–${theirs}`, opponent, won: margin > 0 };
      }
    });
  });

  return {
    team,
    displayName,
    division: team.division ?? null,
    position,
    divisionSize,
    leaguePoints,
    furthestStage: furthestStage ? stageNames[furthestStage] : null,
    matchesPlayed: played.length,
    matchesWon,
    matchesDrawn,
    matchesLost,
    gamesPlayed,
    gamesWon,
    gamesDrawn,
    gamesLost,
    gameWinPct: gamesPlayed > 0 ? Math.round((gamesWon / gamesPlayed) * 100) : null,
    scoreFor,
    scoreAgainst,
    scoreDifference: scoreFor - scoreAgainst,
    avgFor: gamesPlayed > 0 ? Math.round((scoreFor / gamesPlayed) * 10) / 10 : null,
    avgAgainst: gamesPlayed > 0 ? Math.round((scoreAgainst / gamesPlayed) * 10) / 10 : null,
    fannysFor,
    fannysAgainst,
    noShows,
    form: outcomes.slice(-5).reverse(),
    longestWinStreak,
    bestWin,
    closestGame,
  };
}

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
