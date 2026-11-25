import { describe, expect, it } from "vitest";
import { computeStreak } from "./streak";

describe("computeStreak", () => {
  it("is empty without activity", () => {
    expect(computeStreak([])).toEqual({ current: 0, longest: 0, lastActiveDate: null });
  });
  it("a single day is a streak of 1", () => {
    expect(computeStreak(["2026-11-25"])).toEqual({ current: 1, longest: 1, lastActiveDate: "2026-11-25" });
  });
  it("counts consecutive days ending at the latest activity day", () => {
    expect(computeStreak(["2026-11-23", "2026-11-24", "2026-11-25"])).toEqual({ current: 3, longest: 3, lastActiveDate: "2026-11-25" });
  });
  it("ignores duplicates", () => {
    expect(computeStreak(["2026-11-25", "2026-11-25", "2026-11-24"])).toEqual({ current: 2, longest: 2, lastActiveDate: "2026-11-25" });
  });
  it("does not depend on insertion order (an old day syncing late)", () => {
    expect(computeStreak(["2026-11-26", "2026-11-24", "2026-11-25"])).toEqual({ current: 3, longest: 3, lastActiveDate: "2026-11-26" });
    expect(computeStreak(["2026-11-24", "2026-11-26"])).toMatchObject({ current: 1, longest: 1 });
    expect(computeStreak(["2026-11-26", "2026-11-24", "2026-11-25"])).toEqual(computeStreak(["2026-11-24", "2026-11-25", "2026-11-26"]));
  });
  it("a gap ends the current run but longest remembers the best run", () => {
    expect(computeStreak(["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-20", "2026-11-21"])).toEqual({
      current: 2,
      longest: 4,
      lastActiveDate: "2026-11-21",
    });
  });
  it("runs across month and year boundaries", () => {
    expect(computeStreak(["2026-12-30", "2026-12-31", "2027-01-01"])).toEqual({ current: 3, longest: 3, lastActiveDate: "2027-01-01" });
    expect(computeStreak(["2028-02-28", "2028-02-29", "2028-03-01"]).current).toBe(3);
  });
});
