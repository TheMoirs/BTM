import { describe, it, expect } from "vitest";
import {
  parseMatchResult,
  findFixtureCandidates,
  validateParsedGames,
} from "../parse-match-result";

describe("parseMatchResult", () => {
  it("reads a message with a typo in the day and spaced hyphens", () => {
    const out = parseMatchResult(
      "We'd 28th Oct 2026\nTandeM v LCC Snowblowers\nGame 1: 13 - 8\nGame 2: 4 - 13\nEach win one game",
    );
    expect(out).toEqual({
      ok: true,
      result: {
        date: "2026-10-28",
        team1: "TandeM",
        team2: "LCC Snowblowers",
        games: [
          { game: 1, score1: 13, score2: 8 },
          { game: 2, score1: 4, score2: 13 },
        ],
      },
    });
  });

  it("reads en dashes and ignores the summary line", () => {
    const out = parseMatchResult(
      "Wed 28 Oct 2026\nTotal Shambolics v Shamblers\nGame 1: 13–5\nGame 2: 13–3\nTotal Shambolics win 2–0",
    );
    expect(out.ok && out.result).toMatchObject({
      date: "2026-10-28",
      team1: "Total Shambolics",
      team2: "Shamblers",
      games: [
        { game: 1, score1: 13, score2: 5 },
        { game: 2, score1: 13, score2: 3 },
      ],
    });
  });

  it("accepts 'vs' and numeric UK dates", () => {
    const out = parseMatchResult("3/11/2026\nA Team vs B Team\nGame 1: 13-0");
    expect(out.ok && out.result.date).toBe("2026-11-03");
    expect(out.ok && out.result.team2).toBe("B Team");
  });

  it("allows a missing date", () => {
    const out = parseMatchResult("A v B\nGame 1: 13-2");
    expect(out.ok && out.result.date).toBeNull();
  });

  it("rejects text without teams or scores", () => {
    expect(parseMatchResult("hello there").ok).toBe(false);
    expect(parseMatchResult("A v B\nno scores").ok).toBe(false);
    expect(parseMatchResult("").ok).toBe(false);
  });
});

describe("findFixtureCandidates", () => {
  const teams = [
    { id: "t1", name: "Total Shambolics" },
    { id: "t2", name: "Shamblers" },
    { id: "t3", name: "TandeM" },
    { id: "t4", name: "LCC Snowblowers" },
  ];
  const m = (id: string, a: string, b: string, scored = false) => ({
    id, team1Id: a, team2Id: b, team1Game1Score: scored ? 13 : null,
  });

  it("finds the fixture and spots when teams are listed the other way round", () => {
    const parsed = { date: null, team1: "Shamblers", team2: "Total Shambolics", games: [] };
    const res = findFixtureCandidates(parsed, [m("x", "t1", "t2"), m("y", "t3", "t4")], teams);
    expect(res).toHaveLength(1);
    expect(res[0].match.id).toBe("x");
    expect(res[0].flipped).toBe(true);
  });

  it("prefers exact names over partial ones", () => {
    // "Shamblers" is not inside "Total Shambolics", but check exact-beats-partial generally
    const t = [...teams, { id: "t5", name: "Shamblers Reserves" }];
    const parsed = { date: null, team1: "Shamblers", team2: "TandeM", games: [] };
    const res = findFixtureCandidates(parsed, [m("a", "t2", "t3"), m("b", "t5", "t3")], t);
    expect(res.map(c => c.match.id)).toEqual(["a"]);
  });

  it("prefers unplayed fixtures when the teams meet twice", () => {
    const parsed = { date: null, team1: "TandeM", team2: "LCC Snowblowers", games: [] };
    const res = findFixtureCandidates(parsed, [m("old", "t3", "t4", true), m("new", "t4", "t3")], teams);
    expect(res.map(c => c.match.id)).toEqual(["new"]);
    expect(res[0].flipped).toBe(true);
  });
});

describe("validateParsedGames", () => {
  it("applies the manual-entry rules", () => {
    expect(validateParsedGames([{ game: 1, score1: 13, score2: 8 }], 3)).toBeNull();
    expect(validateParsedGames([{ game: 1, score1: 14, score2: 8 }], 3)).toMatch(/maximum/);
    expect(validateParsedGames([{ game: 1, score1: 13, score2: 13 }], 3)).toMatch(/both/);
    expect(validateParsedGames([{ game: 3, score1: 13, score2: 1 }], 2)).toMatch(/doesn't exist/);
  });
});
