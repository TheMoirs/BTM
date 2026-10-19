// Plain-English explanation of how a tournament's settings will play out.
// Uses the same rules as the server's knockout draw (shared/knockoutFormat.ts).
import {
  firstKnockoutSize,
  knockoutStages,
  ordinal,
  qualificationPlan,
  type KnockoutStage,
} from "@shared/knockoutFormat";

export interface FormatSettings {
  numberOfDivisions: number;
  gamesPerMatch: number;
  hasQuarterFinals: boolean;
  hasSemiFinals: boolean;
  hasFinals: boolean;
  pointsForWin?: number | null;
  pointsForDraw?: number | null;
  pointsForLoss?: number | null;
  pointsForNoShow?: number | null;
}

export interface FormatSection {
  title: string;
  lines: string[];
}

export interface FormatExplanation {
  sections: FormatSection[];
  warnings: string[];
}

const STAGE_NAME: Record<KnockoutStage, string> = {
  "quarter-finals": "Quarter-finals",
  "semi-finals": "Semi-finals",
  finals: "Final",
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function describeTournamentFormat(s: FormatSettings): FormatExplanation {
  const divisions = Math.max(1, s.numberOfDivisions || 1);
  const games = s.gamesPerMatch || 1;
  const win = s.pointsForWin ?? 3;
  const draw = s.pointsForDraw ?? 2;
  const loss = s.pointsForLoss ?? 1;
  const noShow = s.pointsForNoShow ?? 3;
  const sections: FormatSection[] = [];
  const warnings: string[] = [];

  // ── Group stage ─────────────────────────────────────────────────────────
  sections.push({
    title: "Group stage",
    lines: [
      divisions === 1
        ? "All teams are in one division and play every other team once."
        : `Teams are split into ${divisions} divisions. Each team plays every other team in its own division once.`,
      `Each match is ${plural(games, "game")}. Points are awarded for every game: ${win} for a win, ${draw} for a draw, ${loss} for a loss.`,
      `No-Show = The team present gains ${noShow} league point${noShow === 1 ? "" : "s"} per game, with a game winning score of 13-7. Team not showing: 0 league points (losing score of 7-13 per game).`,
      "Teams are ranked within their division by total points, then score difference.",
    ],
  });

  // ── Knockout ────────────────────────────────────────────────────────────
  const size = firstKnockoutSize(s);
  const stages = knockoutStages(s);

  if (size === 0) {
    sections.push({
      title: "No knockout stage",
      lines: [
        divisions === 1
          ? "The team at the top of the table at the end is the winner."
          : "Each division's table is the final result. The top team in each division is that division's winner.",
      ],
    });
    return { sections, warnings };
  }

  // Qualification
  const { perDivision, extra, extraPosition } = qualificationPlan(size, divisions);
  const qualLines: string[] = [];
  if (divisions === 1) {
    qualLines.push(`The top ${size} teams in the table go through to the ${STAGE_NAME[stages[0]].toLowerCase()}.`);
  } else {
    if (perDivision > 0) {
      qualLines.push(
        perDivision === 1
          ? "The winner of each division goes through."
          : `The top ${perDivision} in each division go through.`,
      );
    }
    if (extra > 0) {
      const who =
        extraPosition === 1 ? "division winners" : `${ordinal(extraPosition)}-placed teams`;
      qualLines.push(
        perDivision === 0
          ? `Only ${size} places are available, so the best ${size} ${who} go through.`
          : extra === 1
            ? `The remaining place goes to the best ${who.replace(/s$/, "")} across all divisions.`
            : `The remaining ${extra} places go to the best ${who} across all divisions.`,
      );
      qualLines.push(
        "Teams from different divisions are compared on average points per match, then average score difference, so different-sized divisions are compared fairly.",
      );
    }
    qualLines.push(
      perDivision > 0 && extra > 0
        ? `That's ${size} teams in total: ${perDivision * divisions} automatic places plus ${extra} best ${ordinal(extraPosition)}-placed.`
        : `That's ${size} teams in total.`,
    );
  }
  sections.push({ title: "Who qualifies", lines: qualLines });

  // Seeding and the draw
  const drawLines: string[] = [];
  if (size >= 4) {
    drawLines.push(
      divisions === 1
        ? "Teams are seeded by their league position (1st = seed 1)."
        : "Teams are seeded on their group results: division winners first, then runners-up, and so on. Within each group, the better record gets the higher seed.",
    );
    drawLines.push(
      size === 8
        ? "Quarter-finals: seed 1 v 8, 4 v 5, 2 v 7 and 3 v 6, so the top two seeds can only meet in the final."
        : "Semi-finals: seed 1 v 4 and 2 v 3.",
    );
    if (divisions > 1) {
      drawLines.push(
        "Where possible, teams from the same division are kept apart in this first round. If needed, opponents are swapped with a neighbouring tie.",
      );
    }
  } else {
    drawLines.push("The two qualifiers meet in the final.");
  }
  sections.push({ title: "Seeding and draw", lines: drawLines });

  // Bracket progression
  const bracketLines: string[] = [];
  bracketLines.push("Every knockout match is sudden death. The loser is out.");
  if (s.hasQuarterFinals && s.hasSemiFinals) {
    bracketLines.push("Semi-finals: winner of QF1 v winner of QF2, and winner of QF3 v winner of QF4.");
  }
  if (s.hasSemiFinals && s.hasFinals) {
    bracketLines.push("Final: winner of SF1 v winner of SF2.");
  }
  if (s.hasQuarterFinals && !s.hasSemiFinals && s.hasFinals) {
    bracketLines.push(
      "There are no semi-finals, so the four quarter-final winners can't all play on. The two winners with the best quarter-final results (points, then score difference) go to the final.",
    );
    warnings.push("Quarter-finals going straight to a final means two quarter-final winners miss out. Consider adding semi-finals.");
  }
  if (!s.hasFinals) {
    const last = stages[stages.length - 1];
    bracketLines.push(
      `There's no final, so the competition ends after the ${STAGE_NAME[last].toLowerCase()} with ${last === "quarter-finals" ? "four" : "two"} winners.`,
    );
    warnings.push("No final is selected, so there won't be a single overall winner.");
  }
  bracketLines.push(
    "If a knockout match ends level, the team with the better score difference goes through. If it's still level, the higher seed goes through.",
  );
  sections.push({ title: "Knockout rounds", lines: bracketLines });

  // Warnings about division counts
  if (divisions > size) {
    warnings.push(
      `With ${divisions} divisions and only ${size} knockout places, ${divisions - size} division winner${divisions - size === 1 ? "" : "s"} won't qualify.`,
    );
  }
  if (games % 2 === 0) {
    warnings.push(
      `With ${games} games per match, knockout matches can finish level on games. Score difference will then decide who goes through.`,
    );
  }
  warnings.push(`At least ${size} teams need to have played group matches before the knockout can be generated.`);

  return { sections, warnings };
}
