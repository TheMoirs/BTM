// Parses a match result pasted from a chat message, e.g.
//
//   Wed 28 Oct 2026
//   Total Shambolics v Shamblers
//   Game 1: 13–5
//   Game 2: 13–3
//   Total Shambolics win 2–0
//
// Forgiving of typos in the day name, ordinal dates ("28th"), and the
// different dash characters phones insert. Any summary line is ignored;
// the app works out the winner from the game scores.

export type ParsedGame = { game: number; score1: number; score2: number };

export type ParsedResult = {
  date: string | null; // YYYY-MM-DD
  team1: string;
  team2: string;
  games: ParsedGame[];
};

export type ParseOutcome =
  | { ok: true; result: ParsedResult }
  | { ok: false; error: string };

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const pad = (n: number) => String(n).padStart(2, "0");

function toIsoDate(day: number, month: number, year: number): string | null {
  if (year < 100) year += 2000;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
    return null;
  }
  return `${year}-${pad(month)}-${pad(day)}`;
}

// A date with no year: this year, or last year if that date hasn't happened yet
// (so a late-December result pasted in January lands in the right year).
function inferYear(day: number, month: number, now: Date): string | null {
  const year = now.getFullYear();
  const thisYear = toIsoDate(day, month, year);
  if (!thisYear) return toIsoDate(day, month, year - 1); // e.g. 29 Feb
  const today = toIsoDate(now.getDate(), now.getMonth() + 1, year)!;
  return thisYear > today ? toIsoDate(day, month, year - 1) : thisYear;
}

function parseDate(line: string, now: Date): string | null {
  // "28 Oct 2026", "28th October 2026", "28 Oct, 2026"
  const named = line.match(/(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3,})\.?,?\s+(\d{4})/i);
  if (named) {
    const month = MONTHS[named[2].slice(0, 3).toLowerCase()];
    if (month) return toIsoDate(+named[1], month, +named[3]);
  }
  // "Oct 28 2026", "October 28th, 2026"
  const monthFirst = line.match(/([a-z]{3,})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/i);
  if (monthFirst) {
    const month = MONTHS[monthFirst[1].slice(0, 3).toLowerCase()];
    if (month) return toIsoDate(+monthFirst[2], month, +monthFirst[3]);
  }
  // "28/10/2026" or "28-10-26" (UK day-first)
  const numeric = line.match(/\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2}|\d{4})\b/);
  if (numeric) return toIsoDate(+numeric[1], +numeric[2], +numeric[3]);
  // "2026-10-28"
  const iso = line.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) return toIsoDate(+iso[3], +iso[2], +iso[1]);
  // No year. Only when the line is just the date, so scores like "13-8" aren't mistaken for one.
  // "28/10", "Wed 28/10", "28.10"
  const short = line.match(/^(?:[a-z']{2,}\.?,?\s+)?(\d{1,2})[\/.](\d{1,2})$/i);
  if (short) return inferYear(+short[1], +short[2], now);
  // "28 Oct", "Wed 28th October"
  const shortNamed = line.match(/^(?:[a-z']{2,}\.?,?\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3,})\.?$/i);
  if (shortNamed) {
    const month = MONTHS[shortNamed[2].slice(0, 3).toLowerCase()];
    if (month) return inferYear(+shortNamed[1], month, now);
  }
  return null;
}

const GAME_RE = /^(?:game|g)\s*(\d)\s*[:.)\-]?\s*(\d{1,2})\s*-\s*(\d{1,2})\s*$/i;
const VS_RE = /^(.+?)\s+(?:v|vs|versus)\.?\s+(.+)$/i;
// A line of nothing but scores: "13-8 & 13-7", "13-8, 13-7", "13-8 and 13-7", "13-8"
const SCORE_RE = /(\d{1,2})\s*-\s*(\d{1,2})/g;
function scoresOnlyLine(line: string): Array<[number, number]> | null {
  const rest = line.replace(SCORE_RE, " ").replace(/&|,|;|\/|\band\b|\+/gi, " ").trim();
  if (rest !== "") return null;
  const found = Array.from(line.matchAll(SCORE_RE), m => [+m[1], +m[2]] as [number, number]);
  return found.length > 0 ? found : null;
}

// A numbered game with short team names and each team's score:
// "1) CB-13 - S-0", "2) CB+13 - S-1", "Game 3: S 13, CB 9"
// The -/+/: after a short name separates it from its score; it isn't a sign.
const LABELLED_RE =
  /^(?:(?:game|g)\s*)?(\d)\s*[).:]\s*([a-z][a-z'&.]*)\s*[-+:=]?\s*(\d{1,2})\s*(?:-|,|&|\bv\b|\bvs\b)?\s*([a-z][a-z'&.]*)\s*[-+:=]?\s*(\d{1,2})\s*$/i;

type LabelledGame = { game: number; abbr1: string; s1: number; abbr2: string; s2: number };

/** "Créme Bouleé" -> "Creme Boulee": accents don't count when comparing names */
const foldAccents = (s: string) => s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");

/**
 * Does a short name ("CB", "S", "Sham") stand for this team? By initials or how the name starts.
 * `loose` also tries the last few words of the name, in case chat crept in before it
 * ("Great games between Shoscombe Shambolics" still fits "SS").
 */
function shortNameFits(abbr: string, rawTeamName: string, loose = false): boolean {
  const a = foldAccents(abbr).toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!a) return false;
  const words = foldAccents(rawTeamName).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const starts = loose ? words.length : 1;
  for (let i = 0; i < starts; i++) {
    const tail = words.slice(i);
    if (a === tail.map(w => w[0]).join("") || tail.join("").startsWith(a)) return true;
  }
  return false;
}

// Teams joined by "&" or "and" instead of "v": "... between Shoscombe Shambolics & LCC Snowblowers."
const AND_RE = /^(.+?)\s+(?:&|and)\s+(.+)$/i;
/** Drop chat before the first team ("Most enjoyable games between ...") and after the second */
function teamsFromAndLine(line: string): { team1: string; team2: string } | null {
  const m = line.match(AND_RE);
  if (!m) return null;
  const team1 = cleanTeam(m[1].replace(/^.*\b(?:between|against|with)\s+/i, ""));
  const team2 = cleanTeam(m[2].split(/[.!?]\s/)[0]);
  return team1 && team2 ? { team1, team2 } : null;
}

/** Team names without trailing/leading chatter punctuation: "Shamblers..." -> "Shamblers" */
const cleanTeam = (s: string) => s.replace(/^[\s.,:;!-]+|[\s.,:;!-]+$/g, "");

export function parseMatchResult(text: string, now: Date = new Date()): ParseOutcome {
  const lines = text
    // Phones use en dash, em dash, minus sign, etc. in place of a hyphen
    .replace(/[‐-―−﹘﹣－]/g, "-")
    .replace(/ /g, " ")
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);

  if (lines.length === 0) return { ok: false, error: "Nothing was pasted." };

  let date: string | null = null;
  let teams: { team1: string; team2: string } | null = null;
  let andTeams: { team1: string; team2: string } | null = null; // used only if there's no "v" line
  const games: ParsedGame[] = [];
  const looseScores: Array<Array<[number, number]>> = []; // score lines without "Game N:"
  const labelled: LabelledGame[] = []; // "1) CB-13 - S-0" — sorted out once the teams are known

  for (const line of lines) {
    const game = line.match(GAME_RE);
    if (game) {
      const num = +game[1];
      if (games.some(g => g.game === num)) {
        return { ok: false, error: `Game ${num} appears more than once.` };
      }
      games.push({ game: num, score1: +game[2], score2: +game[3] });
      continue;
    }
    const lab = foldAccents(line).match(LABELLED_RE);
    if (lab) {
      labelled.push({ game: +lab[1], abbr1: lab[2], s1: +lab[3], abbr2: lab[4], s2: +lab[5] });
      continue;
    }
    const loose = scoresOnlyLine(line);
    if (loose) { looseScores.push(loose); continue; }
    if (!date) {
      const d = parseDate(line, now);
      if (d) { date = d; continue; }
    }
    if (!teams) {
      const vs = line.match(VS_RE);
      if (vs) {
        teams = { team1: cleanTeam(vs[1]), team2: cleanTeam(vs[2]) };
        continue;
      }
      if (!andTeams) {
        andTeams = teamsFromAndLine(line);
        if (andTeams) continue;
      }
    }
    // Anything else (e.g. "Each win one game") is ignored
  }

  if (!teams) teams = andTeams;
  if (!teams) {
    return { ok: false, error: 'Couldn\'t find the teams. Expected a line like "Team A v Team B".' };
  }
  // Numbered lines with short names: give each score to the team its short name stands for
  for (const g of labelled) {
    const { team1, team2 } = teams;
    let straight = shortNameFits(g.abbr1, team1) && shortNameFits(g.abbr2, team2);
    let reversed = shortNameFits(g.abbr1, team2) && shortNameFits(g.abbr2, team1);
    if (!straight && !reversed) {
      // Try the last words of each name too, in case chat crept in before it
      straight = shortNameFits(g.abbr1, team1, true) && shortNameFits(g.abbr2, team2, true);
      reversed = shortNameFits(g.abbr1, team2, true) && shortNameFits(g.abbr2, team1, true);
    }
    if (!straight && !reversed) {
      return { ok: false, error: `Game ${g.game}: couldn't tell which team "${g.abbr1}" and "${g.abbr2}" are.` };
    }
    if (straight && reversed) {
      return { ok: false, error: `Game ${g.game}: "${g.abbr1}" and "${g.abbr2}" could be either team.` };
    }
    if (games.some(x => x.game === g.game)) {
      return { ok: false, error: `Game ${g.game} appears more than once.` };
    }
    games.push(straight
      ? { game: g.game, score1: g.s1, score2: g.s2 }
      : { game: g.game, score1: g.s2, score2: g.s1 });
  }

  // No "Game 1:" lines: take the scores in order, from one line ("13-8 & 13-7") or one per line
  if (games.length === 0 && looseScores.length > 0) {
    const flat = looseScores.flat();
    // A trailing lone score that's just the games-won tally ("2-0") is a summary, not a game
    if (flat.length >= 2 && looseScores[looseScores.length - 1].length === 1) {
      const [a, b] = flat[flat.length - 1];
      const before = flat.slice(0, -1);
      const w1 = before.filter(([x, y]) => x > y).length;
      const w2 = before.filter(([x, y]) => y > x).length;
      if ((a === w1 && b === w2) || (a === w2 && b === w1)) flat.pop();
    }
    flat.forEach(([score1, score2], i) => games.push({ game: i + 1, score1, score2 }));
  }

  if (games.length === 0) {
    return { ok: false, error: 'Couldn\'t find any scores. Expected lines like "Game 1: 13 - 8".' };
  }
  games.sort((a, b) => a.game - b.game);
  return { ok: true, result: { date, ...teams, games } };
}

// ---------- Matching against fixtures ----------

const normName = (s: string) => foldAccents(s).toLowerCase().replace(/[^a-z0-9]/g, "");

/** Number of single-letter changes (add, remove, swap one letter) between two strings */
function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

export type TeamLike = { id: string; name: string; teamDisplayId?: string | null };

/**
 * 3 = exact name/ID match, 2 = partial match, 1 = close spelling (a letter or two out),
 * 0 = no match. Accents are ignored throughout.
 */
export function teamMatchStrength(query: string, team: TeamLike | undefined): 0 | 1 | 2 | 3 {
  if (!team) return 0;
  const q = normName(query);
  if (!q) return 0;
  const name = normName(team.name);
  const display = team.teamDisplayId ? normName(team.teamDisplayId) : "";
  if (q === name || (display && q === display)) return 3;
  if (name.includes(q) || (q.length >= 4 && q.includes(name) && name.length >= 4)) return 2;
  // Typos: short names may be one letter out, longer ones two
  if (q.length >= 4 && name.length >= 4) {
    const allowed = Math.min(q.length, name.length) <= 6 ? 1 : 2;
    if (editDistance(q, name) <= allowed) return 1;
  }
  return 0;
}

export type MatchLike = {
  id: string;
  team1Id: string;
  team2Id: string;
  team1Game1Score: number | null;
};

export type FixtureCandidate<M> = {
  match: M;
  /** true when the pasted message lists the teams the other way round */
  flipped: boolean;
  strength: number;
};

/**
 * Finds the fixtures that fit the pasted team names, strongest first.
 * Exact name matches beat partial ones, which beat close spellings; unplayed fixtures beat
 * fixtures that already have a score.
 */
export function findFixtureCandidates<M extends MatchLike>(
  parsed: ParsedResult,
  matches: M[],
  teams: TeamLike[],
): FixtureCandidate<M>[] {
  const byId = new Map(teams.map(t => [t.id, t]));
  const found: FixtureCandidate<M>[] = [];

  for (const match of matches) {
    const t1 = byId.get(match.team1Id);
    const t2 = byId.get(match.team2Id);
    const straight = Math.min(teamMatchStrength(parsed.team1, t1), teamMatchStrength(parsed.team2, t2));
    const reversed = Math.min(teamMatchStrength(parsed.team1, t2), teamMatchStrength(parsed.team2, t1));
    if (straight === 0 && reversed === 0) continue;
    const flipped = reversed > straight;
    found.push({ match, flipped, strength: Math.max(straight, reversed) });
  }

  if (found.length <= 1) return found;

  // Keep only the strongest name matches
  const best = Math.max(...found.map(c => c.strength));
  let narrowed = found.filter(c => c.strength === best);
  // Prefer fixtures that haven't been scored yet
  const unplayed = narrowed.filter(c => c.match.team1Game1Score === null);
  if (unplayed.length > 0) narrowed = unplayed;
  return narrowed;
}

/** Same rules as typing scores in by hand. Returns an error message or null. */
export function validateParsedGames(games: ParsedGame[], gamesPerMatch: number): string | null {
  for (const g of games) {
    if (g.game < 1 || g.game > gamesPerMatch) {
      return `Game ${g.game} doesn't exist — this tournament has ${gamesPerMatch} game${gamesPerMatch === 1 ? "" : "s"} per match.`;
    }
    if (g.score1 > 13 || g.score2 > 13) return `Game ${g.game}: maximum score is 13.`;
    if (g.score1 === 13 && g.score2 === 13) return `Game ${g.game}: both teams can't score 13.`;
  }
  return null;
}
