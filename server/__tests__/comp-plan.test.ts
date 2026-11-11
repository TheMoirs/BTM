import { describe, it, expect } from "vitest";
import { compGivesUnlimited } from "@shared/plans";

describe("free Unlimited given by the admin", () => {
  const now = new Date("2026-11-11T12:00:00Z");
  it("not given", () => expect(compGivesUnlimited({ compUnlimited: false }, now)).toBe(false));
  it("no end date", () => expect(compGivesUnlimited({ compUnlimited: true, compUntil: null }, now)).toBe(true));
  it("before the end date", () => expect(compGivesUnlimited({ compUnlimited: true, compUntil: "2026-12-31T23:59:59Z" }, now)).toBe(true));
  it("after the end date", () => expect(compGivesUnlimited({ compUnlimited: true, compUntil: "2026-11-10T23:59:59Z" }, now)).toBe(false));
});
