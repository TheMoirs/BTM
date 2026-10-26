// Shared knockout-format rules, used by the server (to build the draw) and the
// client (to explain the chosen settings). Keep the two in step by changing them here.

export type KnockoutStage = "quarter-finals" | "semi-finals" | "finals";

export interface StageFlags {
  hasQuarterFinals: boolean;
  hasSemiFinals: boolean;
  hasFinals: boolean;
}

/** Number of teams in the first knockout round (0 = no knockout). */
export function firstKnockoutSize(flags: StageFlags): 0 | 2 | 4 | 8 {
  if (flags.hasQuarterFinals) return 8;
  if (flags.hasSemiFinals) return 4;
  if (flags.hasFinals) return 2;
  return 0;
}

/** The knockout stages that will be played, in order. */
export function knockoutStages(flags: StageFlags): KnockoutStage[] {
  const stages: KnockoutStage[] = [];
  if (flags.hasQuarterFinals) stages.push("quarter-finals");
  if (flags.hasSemiFinals) stages.push("semi-finals");
  if (flags.hasFinals) stages.push("finals");
  return stages;
}

/**
 * How qualifying places are shared out between divisions.
 * Every division gets `perDivision` automatic places; the remaining `extra`
 * places go to the best teams that finished in position `extraPosition`
 * (compared across divisions).
 */
export function qualificationPlan(qualifiers: number, divisions: number) {
  const d = Math.max(1, divisions);
  const perDivision = Math.floor(qualifiers / d);
  const extra = qualifiers - perDivision * d;
  return { perDivision, extra, extraPosition: perDivision + 1 };
}

/**
 * Seed pairings for the first knockout round, listed in bracket order so that
 * winners of consecutive matches meet in the next round
 * (e.g. QF1 v QF2 and QF3 v QF4 in the semis). Seeds 1 and 2 can only meet in the final.
 */
export function bracketSeedOrder(size: number): Array<[number, number]> {
  if (size === 8) return [[1, 8], [4, 5], [2, 7], [3, 6]];
  if (size === 4) return [[1, 4], [2, 3]];
  if (size === 2) return [[1, 2]];
  return [];
}

export const STAGE_SHORT_LABEL: Record<KnockoutStage, string> = {
  "quarter-finals": "QF",
  "semi-finals": "SF",
  finals: "Final",
};

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
