// Knockout draw logic: qualification from the group stage, seeding, first-round
// pairings (keeping teams from the same division apart where possible) and a
// fixed bracket for later rounds.
import type { Match, Result, Team } from "@shared/schema";
import { bracketSeedOrder, qualificationPlan } from "@shared/knockoutFormat";

export interface Standing {
  team: Team;
  division: string;
  divisionPosition: number; // 1 = division winner
  points: number;
  scoreDifference: number;
  matchesPlayed: number;
  pointsPerMatch: number;
  scoreDifferencePerMatch: number;
}

/** Results store the team name with its display ID when it has one, e.g. "Ace (A2)". */
function resultNameOf(team: Team): string {
  return team.teamDisplayId ? `${team.name} (${team.teamDisplayId})` : team.name;
}

function teamNameLookup(teams: Team[]): Map<string, Team> {
  const map = new Map<string, Team>();
  for (const t of teams) {
    map.set(t.name, t);
    map.set(resultNameOf(t), t);
  }
  return map;
}

/** Group-stage standings. Teams are ranked within their division by points, then score difference. */
export function computeStandings(results: Result[], teams: Team[]): Standing[] {
  const byName = teamNameLookup(teams);
  const totals = new Map<string, { team: Team; points: number; sd: number; matches: number }>();

  for (const r of results) {
    const team = byName.get(r.teamName);
    if (!team) continue;
    const t = totals.get(team.id) ?? { team, points: 0, sd: 0, matches: 0 };
    t.points += r.points;
    t.sd += r.scoreDifference;
    t.matches += 1;
    totals.set(team.id, t);
  }

  const byDivision = new Map<string, Standing[]>();
  for (const t of Array.from(totals.values())) {
    const division = t.team.division || "";
    const s: Standing = {
      team: t.team,
      division,
      divisionPosition: 0,
      points: t.points,
      scoreDifference: t.sd,
      matchesPlayed: t.matches,
      pointsPerMatch: t.matches ? t.points / t.matches : 0,
      scoreDifferencePerMatch: t.matches ? t.sd / t.matches : 0,
    };
    if (!byDivision.has(division)) byDivision.set(division, []);
    byDivision.get(division)!.push(s);
  }

  const all: Standing[] = [];
  for (const list of Array.from(byDivision.values())) {
    list.sort(
      (a, b) =>
        b.points - a.points ||
        b.scoreDifference - a.scoreDifference ||
        b.pointsPerMatch - a.pointsPerMatch ||
        a.team.name.localeCompare(b.team.name),
    );
    list.forEach((s, i) => (s.divisionPosition = i + 1));
    all.push(...list);
  }
  return all;
}

/** Compare teams from different divisions: average points per match, then average score difference. */
function compareAcrossDivisions(a: Standing, b: Standing): number {
  return (
    b.pointsPerMatch - a.pointsPerMatch ||
    b.scoreDifferencePerMatch - a.scoreDifferencePerMatch ||
    b.points - a.points ||
    b.scoreDifference - a.scoreDifference ||
    a.team.name.localeCompare(b.team.name)
  );
}

/** Seeding order: all division winners first, then runners-up, etc.; within each, the better record first. */
function compareSeeding(a: Standing, b: Standing): number {
  return a.divisionPosition - b.divisionPosition || compareAcrossDivisions(a, b);
}

/**
 * Choose the qualifiers for the first knockout round and return them in seed order (seed 1 first).
 * Every division gets an equal number of automatic places; any places left over go to the
 * best next-placed teams across all divisions.
 */
export function selectAndSeedQualifiers(standings: Standing[], size: number): Standing[] {
  const divisions = new Set(standings.map((s) => s.division));
  const { perDivision } = qualificationPlan(size, divisions.size);

  const automatic = standings.filter((s) => s.divisionPosition <= perDivision);
  const pool = standings.filter((s) => s.divisionPosition > perDivision).sort(compareSeeding);
  const qualifiers = [...automatic, ...pool.slice(0, Math.max(0, size - automatic.length))];

  return qualifiers.sort(compareSeeding).slice(0, size);
}

/**
 * First-round pairings in bracket order. Uses the standard seeding (1v8, 4v5, 2v7, 3v6), then
 * swaps opponents between ties where needed so teams from the same division don't meet.
 */
export function firstRoundPairings(seeded: Standing[]): Array<[Team, Team]> {
  const order = bracketSeedOrder(seeded.length);
  const pairs: Array<[Standing, Standing]> = order.map(([hi, lo]) => [seeded[hi - 1], seeded[lo - 1]]);
  const seedOf = (s: Standing) => seeded.indexOf(s) + 1;

  for (let i = 0; i < pairs.length; i++) {
    const [hi, lo] = pairs[i];
    if (hi.division !== lo.division) continue;

    // Find another tie whose lower seed can be swapped in without creating a new clash.
    let best = -1;
    for (let j = 0; j < pairs.length; j++) {
      if (j === i) continue;
      const [hiJ, loJ] = pairs[j];
      if (loJ.division === hi.division || lo.division === hiJ.division) continue;
      if (best === -1 || Math.abs(seedOf(loJ) - seedOf(lo)) < Math.abs(seedOf(pairs[best][1]) - seedOf(lo))) {
        best = j;
      }
    }
    if (best !== -1) {
      const swap = pairs[best][1];
      pairs[best][1] = lo;
      pairs[i][1] = swap;
    }
  }

  return pairs.map(([a, b]) => [a.team, b.team]);
}

/** Winner of a knockout match: the recorded winner, otherwise the better result (points, then score difference). */
function matchWinner(match: Match, results: Result[], teamsById: Map<string, Team>): Team | undefined {
  if (match.winnerId) return teamsById.get(match.winnerId);
  const t1 = teamsById.get(match.team1Id);
  const t2 = teamsById.get(match.team2Id);
  const isTeam = (r: Result, t?: Team) => !!t && (r.teamName === t.name || r.teamName === resultNameOf(t));
  const r1 = results.find((r) => r.matchId === match.id && isTeam(r, t1));
  const r2 = results.find((r) => r.matchId === match.id && isTeam(r, t2));
  if (!r1 || !r2) return t1;
  if (r2.points !== r1.points) return r2.points > r1.points ? t2 : t1;
  if (r2.scoreDifference !== r1.scoreDifference) return r2.scoreDifference > r1.scoreDifference ? t2 : t1;
  return t1; // level: the higher seed (team 1) goes through
}

/** How convincingly a team won its match (used only when the bracket can't decide the pairing). */
function winningMargin(team: Team, match: Match, results: Result[]): [number, number] {
  const r = results.find(
    (x) => x.matchId === match.id && (x.teamName === team.name || x.teamName === resultNameOf(team)),
  );
  return [r?.points ?? 0, r?.scoreDifference ?? 0];
}

/**
 * Pairings for a later knockout round from the previous round's matches.
 * With bracket positions: winner of match 1 v winner of match 2, match 3 v match 4, and so on.
 * If more winners than places (e.g. quarter-finals straight to a final), the winners with the
 * best results go through. Matches created before bracket positions existed fall back to that too.
 */
export function nextRoundPairings(
  previousMatches: Match[],
  results: Result[],
  teams: Team[],
  size: number,
): Array<[Team, Team]> {
  const teamsById = new Map(teams.map((t) => [t.id, t]));
  const hasBracket = previousMatches.length > 0 && previousMatches.every((m) => m.bracketPosition != null);
  const ordered = hasBracket
    ? [...previousMatches].sort((a, b) => (a.bracketPosition ?? 0) - (b.bracketPosition ?? 0))
    : previousMatches;

  const winners = ordered
    .map((m) => ({ match: m, team: matchWinner(m, results, teamsById) }))
    .filter((w): w is { match: Match; team: Team } => !!w.team);

  if (hasBracket && winners.length === size) {
    const pairs: Array<[Team, Team]> = [];
    for (let i = 0; i + 1 < winners.length; i += 2) pairs.push([winners[i].team, winners[i + 1].team]);
    return pairs;
  }

  // Fallback: rank the winners by their result, take the best `size`, pair 1 v last, 2 v second-last...
  const ranked = winners
    .map((w) => ({ team: w.team, margin: winningMargin(w.team, w.match, results) }))
    .sort((a, b) => b.margin[0] - a.margin[0] || b.margin[1] - a.margin[1])
    .slice(0, size)
    .map((w) => w.team);
  if (ranked.length < size) return [];
  return bracketSeedOrder(size).map(([hi, lo]) => [ranked[hi - 1], ranked[lo - 1]]);
}
