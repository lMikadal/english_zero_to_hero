import { describe, expect, it } from "vitest";
import { isDayUnlocked } from "./unlock";

describe("isDayUnlocked", () => {
  it("is true for days up to and including the current day", () => {
    expect(isDayUnlocked(1, 1)).toBe(true);
    expect(isDayUnlocked(3, 5)).toBe(true);
    expect(isDayUnlocked(5, 5)).toBe(true);
    expect(isDayUnlocked(365, 365)).toBe(true);
  });
  it("is false for later days", () => {
    expect(isDayUnlocked(2, 1)).toBe(false);
    expect(isDayUnlocked(365, 364)).toBe(false);
  });
  it.each([
    [0, 5], [366, 365], [-1, 5], [1.5, 5], [Number.NaN, 5],
    [1, 0], [1, 366], [1, 2.5], [1, Number.NaN],
  ])("is false when either day is outside 1..365 or not an integer (%j, %j)", (day, cur) => {
    expect(isDayUnlocked(day, cur)).toBe(false);
  });
});
