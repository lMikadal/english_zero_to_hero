import { describe, expect, it } from "vitest";
import { estimateCefr } from "./cefr";
import type { CheckpointResultLike, ProgressLike } from "./types";

const done = (day: number, score: number | null = null): ProgressLike => ({
  day,
  status: "done",
  score,
  completedAt: new Date("2026-01-01T00:00:00Z"),
});
const days = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => done(from + i));
const cp = (afterDay: number, score: number): CheckpointResultLike => ({ afterDay, score });

describe("estimateCefr: the level comes from checkpoint RESULTS, not from the lesson score of the checkpoint day", () => {
  it("preA1 with nothing done and progressing towards A1", () => {
    expect(estimateCefr(0, [], [])).toEqual({ level: "preA1", next: "A1", percentToNext: 0 });
  });

  // plan 3b test 1
  it("day 60 done with a 100% lesson score but no checkpoint result stays preA1", () => {
    expect(estimateCefr(400, days(1, 60).map((p) => (p.day === 60 ? done(60, 1) : p)), []).level).toBe("preA1");
  });

  // plan 3b test 2
  it("a result of 0.7 and 400 words give A1; 399 words or 0.69 do not", () => {
    expect(estimateCefr(400, days(1, 60), [cp(60, 0.7)]).level).toBe("A1");
    expect(estimateCefr(399, days(1, 60), [cp(60, 0.7)]).level).toBe("preA1");
    expect(estimateCefr(400, days(1, 60), [cp(60, 0.69)]).level).toBe("preA1");
  });

  // plan 3b test 3
  it("two sittings (0.5 then 0.8) pass: any sitting at the pass mark is enough, in either order", () => {
    expect(estimateCefr(400, days(1, 60), [cp(60, 0.5), cp(60, 0.8)]).level).toBe("A1");
    expect(estimateCefr(400, days(1, 60), [cp(60, 0.8), cp(60, 0.5)]).level).toBe("A1");
    expect(estimateCefr(400, days(1, 60), [cp(60, 0.5), cp(60, 0.6)]).level).toBe("preA1");
  });

  // plan 3b test 4
  it("everything but the checkpoint: percentToNext is 99, never 100 (100% means really passed)", () => {
    expect(estimateCefr(400, days(1, 60), [])).toMatchObject({ level: "preA1", next: "A1", percentToNext: 99 });
    expect(estimateCefr(9999, days(1, 60), [cp(60, 0.69)]).percentToNext).toBe(99);
  });

  it("a result for another checkpoint day does not pass this one", () => {
    expect(estimateCefr(400, days(1, 60), [cp(30, 1), cp(90, 1)]).level).toBe("preA1");
  });

  it("a result does not need the lesson of its day to be in `progress`", () => {
    expect(estimateCefr(1200, [], [cp(150, 0.9)]).level).toBe("A2");
  });

  it("takes the highest level meeting both conditions", () => {
    const p = days(1, 150);
    const results = [cp(60, 0.8), cp(150, 0.7)];
    expect(estimateCefr(1200, p, results).level).toBe("A2");
    expect(estimateCefr(1199, p, results).level).toBe("A1");
    const all = [cp(60, 0.9), cp(150, 0.9), cp(270, 0.9), cp(360, 0.7)];
    expect(estimateCefr(2400, days(1, 360), all)).toMatchObject({ level: "B2", next: null, percentToNext: null });
    expect(estimateCefr(1839, days(1, 270), all.slice(0, 3)).level).toBe("A2");
    expect(estimateCefr(1840, days(1, 270), all.slice(0, 3)).level).toBe("B1");
  });

  it("uses the pass mark with a small epsilon and ignores non-finite scores", () => {
    expect(estimateCefr(400, days(1, 60), [cp(60, 0.7 - 1e-10)]).level).toBe("A1");
    expect(estimateCefr(400, days(1, 60), [cp(60, 0.699)]).level).toBe("preA1");
    expect(estimateCefr(400, days(1, 60), [cp(60, Number.NaN)]).level).toBe("preA1");
    expect(estimateCefr(400, days(1, 60), [cp(60, Number.POSITIVE_INFINITY)]).level).toBe("preA1");
  });

  it("ignores a progress row that is not done", () => {
    const p: ProgressLike[] = [...days(1, 59), { day: 60, status: "in_progress", score: null, completedAt: null }];
    expect(estimateCefr(400, p, []).percentToNext).toBe(98); // 59/60
  });
});

describe("estimateCefr: progress towards the next level", () => {
  it("is the smaller of vocab and lesson progress, rounded down", () => {
    expect(estimateCefr(200, days(1, 30), []).percentToNext).toBe(50);
    expect(estimateCefr(100, days(1, 30), []).percentToNext).toBe(25);
    expect(estimateCefr(399, days(1, 6), []).percentToNext).toBe(10);
    expect(estimateCefr(399, days(1, 59), []).percentToNext).toBe(98);
  });

  it("counts the lessons up to and including the checkpoint day, but caps at 99 until its checkpoint is passed", () => {
    expect(estimateCefr(400, days(1, 60), []).percentToNext).toBe(99);
    expect(estimateCefr(400, days(1, 59), []).percentToNext).toBe(98);
  });

  it("caps vocab progress at 100% and counts days only up to the next checkpoint day", () => {
    expect(estimateCefr(9999, days(1, 30), []).percentToNext).toBe(50);
    // A1 reached; the next target is A2 (day 150): days 1..60 count towards it
    expect(estimateCefr(400, days(1, 60), [cp(60, 0.7)])).toMatchObject({ level: "A1", next: "A2", percentToNext: 33 }); // min(400/1200 = 33.3%, 60/150 = 40%)
  });

  it("the lesson score of a checkpoint day has no say any more", () => {
    const withScore = days(1, 60).map((p) => (p.day === 60 ? done(60, 1) : p));
    expect(estimateCefr(400, withScore, [cp(60, 0.7)])).toEqual(estimateCefr(400, days(1, 60), [cp(60, 0.7)]));
  });
});
