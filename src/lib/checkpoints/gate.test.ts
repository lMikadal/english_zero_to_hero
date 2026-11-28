import { describe, expect, it, vi } from "vitest";
import { blockingCheckpoint, playableDay } from "./gate";

type Args = Parameters<typeof blockingCheckpoint>[0];
const args = (over: Partial<Args> = {}): Args => ({ currentDay: 31, exists: () => true, taken: () => false, currentDayStarted: false, ...over });

describe("blockingCheckpoint", () => {
  it("blocks day A+1 when the file exists, it has not been taken and day A+1 has not started", () => {
    expect(blockingCheckpoint(args())).toBe(30);
    expect(blockingCheckpoint(args({ currentDay: 61 }))).toBe(60);
    expect(blockingCheckpoint(args({ currentDay: 361 }))).toBe(360);
  });

  it("does not block when there is no checkpoint file (the content file is the switch)", () => {
    expect(blockingCheckpoint(args({ exists: () => false }))).toBeNull();
  });

  it("does not block once a result exists, whatever the score", () => {
    expect(blockingCheckpoint(args({ taken: () => true }))).toBeNull();
  });

  it("does not block a learner who already started day A+1 (D15: nobody is locked retroactively)", () => {
    expect(blockingCheckpoint(args({ currentDayStarted: true }))).toBeNull();
  });

  it("only day 31, 61 ... 361 can be blocked", () => {
    for (const currentDay of [1, 2, 29, 30, 32, 60, 62, 100, 360, 365]) expect(blockingCheckpoint(args({ currentDay }))).toBeNull();
  });

  it("truth table over the three conditions and a range of days", () => {
    const blockers = new Set([31, 61, 91, 121, 151, 181, 211, 241, 271, 301, 331, 361]);
    for (const currentDay of [1, 2, 30, 31, 32, 61, 62, 361]) {
      for (const exists of [true, false]) {
        for (const taken of [true, false]) {
          for (const currentDayStarted of [true, false]) {
            const expected = blockers.has(currentDay) && exists && !taken && !currentDayStarted ? currentDay - 1 : null;
            expect(blockingCheckpoint({ currentDay, exists: () => exists, taken: () => taken, currentDayStarted }), JSON.stringify({ currentDay, exists, taken, currentDayStarted })).toBe(expected);
          }
        }
      }
    }
  });

  it("asks about afterDay = currentDay - 1 only, and nothing at all when that is not a checkpoint day", () => {
    const exists = vi.fn(() => true);
    const taken = vi.fn(() => false);
    blockingCheckpoint({ currentDay: 31, exists, taken, currentDayStarted: false });
    expect(exists).toHaveBeenCalledWith(30);
    expect(taken).toHaveBeenCalledWith(30);
    exists.mockClear();
    taken.mockClear();
    blockingCheckpoint({ currentDay: 32, exists, taken, currentDayStarted: false });
    expect(exists).not.toHaveBeenCalled();
    expect(taken).not.toHaveBeenCalled();
  });
});

describe("playableDay", () => {
  it("is the current day when nothing blocks and the day before it when a checkpoint does", () => {
    expect(playableDay(31, null)).toBe(31);
    expect(playableDay(31, 30)).toBe(30);
    expect(playableDay(361, 360)).toBe(360);
    expect(playableDay(1, null)).toBe(1);
  });
});
