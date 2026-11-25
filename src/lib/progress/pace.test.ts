import { describe, expect, it } from "vitest";
import { estimatePace } from "./pace";
import { addDays } from "./dates";
import { NOW } from "./test-utils";
import type { ProgressLike } from "./types";

const TZ = "Asia/Bangkok";
const TODAY = "2026-06-15"; // NOW in Bangkok

/** n done lessons, each completed at noon (Bangkok) `daysBack` days before today */
const doneOn = (n: number, daysBack: number, startDay = 1): ProgressLike[] =>
  Array.from({ length: n }, (_, i) => ({
    day: startDay + i,
    status: "done" as const,
    score: null,
    completedAt: new Date(`${addDays(TODAY, -daysBack)}T05:00:00Z`),
  }));

const run = (startDate: string, progress: ProgressLike[], now = NOW, timeZone = TZ) =>
  estimatePace({ startDate, now, timeZone, progress });

describe("expected day", () => {
  it("is 1 when start_date is today", () => {
    expect(run(TODAY, []).expectedDay).toBe(1);
  });

  it("counts days since start_date plus 1", () => {
    expect(run("2026-06-14", []).expectedDay).toBe(2);
    expect(run("2026-06-06", []).expectedDay).toBe(10);
  });

  it("caps at 365", () => {
    expect(run("2025-06-16", []).expectedDay).toBe(365); // 364 days since start, day 365
    expect(run("2025-06-15", []).expectedDay).toBe(365); // 365 days since start: capped
    expect(run("2020-01-01", []).expectedDay).toBe(365);
  });

  it("is at least 1 when start_date is in the future", () => {
    expect(run("2026-06-20", []).expectedDay).toBe(1);
  });

  it("uses the user's time zone for 'today'", () => {
    const lateUtc = new Date("2026-06-14T20:00:00Z"); // 15 Jun 03:00 in Bangkok, 14 Jun in UTC
    expect(run("2026-06-14", [], lateUtc, "Asia/Bangkok").expectedDay).toBe(2);
    expect(run("2026-06-14", [], lateUtc, "UTC").expectedDay).toBe(1);
  });
});

describe("days behind and status", () => {
  // start 9 days ago: expected day 10, so behind = 10 - done - 1 = 9 - done
  const start = "2026-06-06";
  const behind = (done: number) => run(start, doneOn(done, 1));

  it("does not count today's lesson as behind", () => {
    expect(behind(9)).toMatchObject({ reachedDay: 9, daysBehind: 0, status: "on_track" });
    expect(run(TODAY, [])).toMatchObject({ daysBehind: 0, status: "on_track" });
  });

  it("is on track when ahead (negative days behind)", () => {
    expect(behind(12)).toMatchObject({ daysBehind: -3, status: "on_track" });
  });

  it("slightly behind at 1 to 3 days", () => {
    expect(behind(8)).toMatchObject({ daysBehind: 1, status: "slightly_behind" });
    expect(behind(6)).toMatchObject({ daysBehind: 3, status: "slightly_behind" });
  });

  it("behind at 4 days or more", () => {
    expect(behind(5)).toMatchObject({ daysBehind: 4, status: "behind" });
  });

  it("only counts lessons with status done", () => {
    const p: ProgressLike[] = [
      ...doneOn(2, 1),
      { day: 3, status: "in_progress", score: null, completedAt: null },
      { day: 4, status: "not_started", score: null, completedAt: null },
    ];
    expect(run(start, p).reachedDay).toBe(2);
  });
});

describe("pace and projection", () => {
  it("is lessons done in the last 14 local days divided by 14", () => {
    expect(run("2026-01-01", doneOn(14, 3)).pace).toBe(1);
    expect(run("2026-01-01", doneOn(7, 3)).pace).toBe(0.5);
  });

  it("includes the 14th local day (today minus 13) and excludes the one before", () => {
    expect(run("2026-01-01", doneOn(1, 13)).pace).toBe(1 / 14);
    expect(run("2026-01-01", doneOn(1, 14)).pace).toBe(0);
  });

  it("buckets completions by local date: 00:30 Bangkok is the new day", () => {
    // 2026-06-01T17:30Z is 2 Jun 00:30 in Bangkok = today minus 13 (included); in UTC it is 1 Jun = minus 14
    const p: ProgressLike[] = [{ day: 1, status: "done", score: null, completedAt: new Date("2026-06-01T17:30:00Z") }];
    expect(run("2026-01-01", p, NOW, "Asia/Bangkok").pace).toBe(1 / 14);
    expect(run("2026-01-01", p, NOW, "UTC").pace).toBe(0);
  });

  it("projects finish as today + remaining / pace, rounded up to a whole day", () => {
    // 14 recent lessons (pace 1), 100 done in total: 265 left
    const p = [...doneOn(14, 2), ...doneOn(86, 100, 15)];
    expect(run("2026-01-01", p).projectedFinish).toEqual({ kind: "date", date: addDays(TODAY, 265) });
    // 3 in window (3/14 per day), 10 done in total: 355 left -> 355 * 14 / 3 = 1656.67 -> 1657
    const q = [...doneOn(3, 2), ...doneOn(7, 100, 4)];
    expect(run("2026-01-01", q).projectedFinish).toEqual({ kind: "date", date: addDays(TODAY, 1657) });
  });

  it("cannot project with zero pace, never Infinity or NaN", () => {
    const r = run("2026-01-01", doneOn(5, 40));
    expect(r.pace).toBe(0);
    expect(r.projectedFinish).toEqual({ kind: "cannot_project" });
    expect(run("2026-01-01", []).projectedFinish).toEqual({ kind: "cannot_project" });
  });

  it("finishes today when all 365 lessons are done, even at zero pace", () => {
    expect(run("2025-01-01", doneOn(365, 60)).projectedFinish).toEqual({ kind: "date", date: TODAY });
  });

  it("adds the days to today's date in the user's time zone", () => {
    const lateUtc = new Date("2026-06-14T20:00:00Z"); // still 14 Jun in UTC, already 15 Jun in Bangkok
    const p = doneOn(14, 2).map((x) => ({ ...x, completedAt: new Date(lateUtc.getTime() - 2 * 86_400_000) }));
    const r = estimatePace({ startDate: "2026-01-01", now: lateUtc, timeZone: "Asia/Bangkok", progress: p });
    expect(r.projectedFinish).toEqual({ kind: "date", date: addDays("2026-06-15", 351) });
  });

  it("defaults the time zone to Asia/Bangkok", () => {
    const lateUtc = new Date("2026-06-14T20:00:00Z");
    expect(estimatePace({ startDate: "2026-06-14", now: lateUtc, progress: [] }).expectedDay).toBe(2);
  });
});

describe("new learners", () => {
  it("divides by the days since start while under 14", () => {
    // started 9 days ago: day 10 of the plan, 6 lessons done -> 6 / 10
    expect(run("2026-06-06", doneOn(6, 1)).pace).toBeCloseTo(0.6, 10);
    // start today: one day of history
    expect(run(TODAY, doneOn(1, 0)).pace).toBe(1);
    // 14th day of the plan: full window
    expect(run("2026-06-02", doneOn(7, 1)).pace).toBe(0.5);
    expect(run("2026-01-01", doneOn(7, 1)).pace).toBe(0.5);
  });

  it("projects with the shorter divisor", () => {
    // 6 done in 10 days, 359 left: 359 * 10 / 6 = 598.3 -> 599
    expect(run("2026-06-06", doneOn(6, 1)).projectedFinish).toEqual({ kind: "date", date: addDays(TODAY, 599) });
  });

  it("uses a divisor of 1 when start_date is in the future", () => {
    expect(run("2026-06-20", []).pace).toBe(0);
  });
});

describe("invalid input", () => {
  it.each(["", "garbage", "2026-13-01", "2026-02-30", "15/06/2026"])("throws a clear error for startDate %j", (bad) => {
    expect(() => run(bad, [])).toThrow(/startDate/);
  });

  it("falls back to Asia/Bangkok for a bad time zone", () => {
    expect(run(TODAY, [], NOW, "Asia/Bankok").expectedDay).toBe(1);
  });
});
