import { describe, expect, it } from "vitest";
import { estimateCefr } from "./cefr";
import type { ProgressLike } from "./types";

const done = (day: number, score: number | null = null): ProgressLike => ({
  day,
  status: "done",
  score,
  completedAt: new Date("2026-01-01T00:00:00Z"),
});
const days = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => done(from + i));
/** days 1..n done, with the checkpoint day (if reached) scored */
const upTo = (n: number, checkpoint: [number, number][] = []) => [
  ...days(1, n).filter((p) => !checkpoint.some(([d]) => d === p.day)),
  ...checkpoint.map(([d, s]) => done(d, s)),
];

describe("estimateCefr", () => {
  it("is preA1 with nothing done and progresses towards A1", () => {
    const r = estimateCefr(0, []);
    expect(r.level).toBe("preA1");
    expect(r.next).toBe("A1");
    expect(r.percentToNext).toBe(0);
  });

  it("needs BOTH the checkpoint and the word count for A1", () => {
    expect(estimateCefr(400, upTo(60, [[60, 0.7]])).level).toBe("A1");
    expect(estimateCefr(399, upTo(60, [[60, 0.7]])).level).toBe("preA1");
    expect(estimateCefr(400, upTo(60, [[60, 0.69]])).level).toBe("preA1");
    expect(estimateCefr(400, upTo(59)).level).toBe("preA1");
  });

  it("ignores a checkpoint row that is not done", () => {
    const p: ProgressLike[] = [...upTo(59), { day: 60, status: "in_progress", score: 0.95, completedAt: null }];
    expect(estimateCefr(500, p).level).toBe("preA1");
  });

  it("takes the highest level meeting both conditions", () => {
    const p = upTo(150, [[60, 0.8], [150, 0.7]]);
    expect(estimateCefr(1200, p).level).toBe("A2");
    expect(estimateCefr(1199, p).level).toBe("A1");
    const all = upTo(360, [[60, 0.9], [150, 0.9], [270, 0.9], [360, 0.7]]);
    expect(estimateCefr(2400, all)).toMatchObject({ level: "B2", next: null, percentToNext: null });
    expect(estimateCefr(1849, upTo(270, [[60, 1], [150, 1], [270, 1]])).level).toBe("A2");
    expect(estimateCefr(1850, upTo(270, [[60, 1], [150, 1], [270, 1]])).level).toBe("B1");
  });

  it("can reach a high level even if an earlier checkpoint row is missing", () => {
    expect(estimateCefr(1200, [done(150, 0.9)]).level).toBe("A2");
  });

  it("progress is the smaller of vocab and lesson progress, rounded down", () => {
    // 200 / 400 words = 50%; 30 of 60 days = 50%
    expect(estimateCefr(200, days(1, 30)).percentToNext).toBe(50);
    // vocab smaller: 100/400 = 25%, lessons 30/60 = 50%
    expect(estimateCefr(100, days(1, 30)).percentToNext).toBe(25);
    // lessons smaller: words 399/400 -> 99, lessons 6/60 = 10
    expect(estimateCefr(399, days(1, 6)).percentToNext).toBe(10);
    expect(estimateCefr(399, days(1, 59)).percentToNext).toBe(98); // 59/60 = 98.33
  });

  it("counts the checkpoint day as lesson progress only when passed", () => {
    expect(estimateCefr(400, upTo(60, [[60, 0.69]])).percentToNext).toBe(98); // 59/60
    expect(estimateCefr(400, upTo(59)).percentToNext).toBe(98);
  });

  it("caps vocab progress at 100% and counts days only up to the next checkpoint", () => {
    expect(estimateCefr(9999, days(1, 30)).percentToNext).toBe(50);
    // A1 reached; the next target is A2 (day 150): days 1..60 count towards it
    const p = upTo(60, [[60, 0.7]]);
    expect(estimateCefr(400, p)).toMatchObject({ level: "A1", next: "A2", percentToNext: 33 }); // min(400/1200 = 33.3%, 60/150 = 40%)
  });
});
