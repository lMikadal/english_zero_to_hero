import { describe, expect, it } from "vitest";
import { nextStreak, type StreakState } from "./streak";

const s = (current: number, longest: number, lastActiveDate: string | null): StreakState => ({ current, longest, lastActiveDate });

describe("nextStreak", () => {
  it("starts at 1 on the first active day", () => {
    expect(nextStreak(s(0, 0, null), "2026-11-25")).toEqual(s(1, 1, "2026-11-25"));
  });
  it("leaves the same day unchanged", () => {
    expect(nextStreak(s(3, 5, "2026-11-25"), "2026-11-25")).toEqual(s(3, 5, "2026-11-25"));
  });
  it("adds one on the next day", () => {
    expect(nextStreak(s(3, 3, "2026-11-25"), "2026-11-26")).toEqual(s(4, 4, "2026-11-26"));
  });
  it("counts across a month and year boundary", () => {
    expect(nextStreak(s(1, 1, "2026-12-31"), "2027-01-01")).toEqual(s(2, 2, "2027-01-01"));
  });
  it("resets to 1 after a gap but keeps longest", () => {
    expect(nextStreak(s(7, 7, "2026-11-20"), "2026-11-25")).toEqual(s(1, 7, "2026-11-25"));
  });
  it("never lowers longest", () => {
    expect(nextStreak(s(2, 9, "2026-11-25"), "2026-11-26")).toEqual(s(3, 9, "2026-11-26"));
  });
  it("leaves the state unchanged for an older date (late offline replay)", () => {
    expect(nextStreak(s(4, 6, "2026-11-25"), "2026-11-23")).toEqual(s(4, 6, "2026-11-25"));
  });
});
