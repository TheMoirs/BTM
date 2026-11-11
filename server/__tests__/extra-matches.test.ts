import { describe, it, expect } from "vitest";
import { losersPlatePairing, thirdPlacePairing, type Standing } from "../knockout";
import { gamesForStage } from "@shared/knockoutFormat";

const team = (id: string, division: string) => ({ id, name: id, division, teamDisplayId: null }) as any;
const st = (id: string, division: string, pos: number, ppm = 1): Standing => ({
  team: team(id, division), division, divisionPosition: pos, points: ppm * 3, scoreDifference: 0,
  matchesPlayed: 3, pointsPerMatch: ppm, scoreDifferencePerMatch: 0,
});

describe("Loser Plate pairing", () => {
  it("two divisions: bottom of A v bottom of B", () => {
    const p = losersPlatePairing([st("a1", "A", 1), st("a2", "A", 2), st("a3", "A", 3), st("b1", "B", 1), st("b2", "B", 2)]);
    expect(p!.map((t) => t.id)).toEqual(["a3", "b2"]);
  });
  it("one division: bottom two", () => {
    const p = losersPlatePairing([st("x1", "A", 1), st("x2", "A", 2), st("x3", "A", 3), st("x4", "A", 4)]);
    expect(p!.map((t) => t.id)).toEqual(["x3", "x4"]);
  });
  it("three divisions: the two weakest last-placed teams", () => {
    const p = losersPlatePairing([st("a2", "A", 2, 2), st("b2", "B", 2, 0.5), st("c2", "C", 2, 1)]);
    expect(p!.map((t) => t.id).sort()).toEqual(["b2", "c2"]);
  });
});

describe("3rd/4th pairing", () => {
  it("losers of SF1 and SF2", () => {
    const teams = ["s1", "s2", "s3", "s4"].map((id) => team(id, "A"));
    const semis = [
      { id: "m1", team1Id: "s1", team2Id: "s4", winnerId: "s1", status: "completed", bracketPosition: 0 },
      { id: "m2", team1Id: "s2", team2Id: "s3", winnerId: "s3", status: "completed", bracketPosition: 1 },
    ] as any;
    expect(thirdPlacePairing(semis, [], teams)!.map((t) => t.id)).toEqual(["s4", "s2"]);
  });
  it("waits until both semis are complete", () => {
    const semis = [{ id: "m1", status: "completed" }, { id: "m2", status: "scheduled" }] as any;
    expect(thirdPlacePairing(semis, [], [])).toBeNull();
  });
});

describe("games per stage", () => {
  const t = { gamesPerMatch: 1, finalStagesGamesPerMatch: 3 };
  it("Stage 1 uses its own setting, knockouts the final-stages setting", () => {
    expect(gamesForStage(t, "initial")).toBe(1);
    expect(gamesForStage(t, "semi-finals")).toBe(3);
    expect(gamesForStage(t, "losers-plate")).toBe(3);
  });
});
