import { describe, expect, it } from "vitest";
import { simulateLoad } from "./simulate";

const base = { wordsPerLessonDay: 5, days: 40, againRate: 0.1 } as const;

describe("simulateLoad", () => {
  it("is deterministic: same input, same output", () => {
    expect(simulateLoad(base).days).toEqual(simulateLoad(base).days);
  });
  it("a different seed gives a different (but still valid) run", () => {
    const a = simulateLoad({ ...base, seed: 1 });
    const b = simulateLoad({ ...base, seed: 2 });
    expect(a.days.map((d) => d.presses)).not.toEqual(b.days.map((d) => d.presses));
  });
  it("returns one row per day, numbered from 1", () => {
    const r = simulateLoad(base);
    expect(r.days).toHaveLength(40);
    expect(r.days.map((d) => d.day)).toEqual(Array.from({ length: 40 }, (_, i) => i + 1));
  });
  it("nothing is due on day 1 of a steady run (the first lesson is only finished that day)", () => {
    expect(simulateLoad(base).days[0]).toMatchObject({ due: 0, presses: 0 });
  });
  it("every due card is pressed at least once", () => {
    for (const d of simulateLoad(base).days) expect(d.presses).toBeGreaterThanOrEqual(d.due);
  });
  it("a lesson's new words appear the next day as en_th and the day after as th_en (2 new cards per word, over two days)", () => {
    const r = simulateLoad({ wordsPerLessonDay: 5, days: 4, againRate: 0 });
    expect(r.days.map((d) => d.newCards)).toEqual([0, 5, 10, 10]);
  });
  it("lesson days: with 5 new-word days a week, days 6 and 7 add no words", () => {
    const r = simulateLoad({ wordsPerLessonDay: 4, days: 10, againRate: 0, newWordDaysPerWeek: 5 });
    // new cards seen on day d = en_th of the lesson of day d-1 + th_en of the lesson of day d-2
    expect(r.days.map((d) => d.newCards)).toEqual([0, 4, 8, 8, 8, 8, 4, 0, 4, 8]);
  });
  it("a backfill of 36 words: 36 new en_th cards on the first day, then 36 th_en on the next", () => {
    const r = simulateLoad({ wordsPerLessonDay: 0, days: 3, againRate: 0, backfillWords: 36 });
    expect(r.days[0]).toMatchObject({ day: 1, due: 36, newCards: 36 });
    expect(r.days[1].newCards).toBe(36);
    expect(r.days[2].newCards).toBe(0);
  });
  it("a new card takes more than one press (learning steps 1m and 10m)", () => {
    const r = simulateLoad({ wordsPerLessonDay: 0, days: 1, againRate: 0, backfillWords: 36 });
    expect(r.days[0].presses).toBeGreaterThan(36);
    expect(r.days[0].presses).toBeLessThanOrEqual(36 * 3);
  });
  it("a week off (no reviews, no lessons) piles cards up, then the first day back is heavier than a normal day", () => {
    const normal = simulateLoad({ ...base, days: 60 });
    const off = simulateLoad({ ...base, days: 60, offDays: { from: 41, to: 47 } });
    expect(off.days.slice(40, 47).every((d) => d.presses === 0)).toBe(true);
    expect(off.days[47].due).toBeGreaterThan(normal.days[47].due);
    expect(off.days[47].presses).toBeGreaterThan(Math.max(...normal.days.slice(30, 47).map((d) => d.presses)));
  });
  it("more forgetting means more work", () => {
    const lo = simulateLoad({ ...base, days: 60, againRate: 0.05 });
    const hi = simulateLoad({ ...base, days: 60, againRate: 0.3 });
    expect(hi.meanPresses(30, 60)).toBeGreaterThan(lo.meanPresses(30, 60));
  });
  it("meanPresses(from, to) averages the rows from..to inclusive", () => {
    const r = simulateLoad(base);
    const rows = r.days.filter((d) => d.day >= 10 && d.day <= 20);
    expect(r.meanPresses(10, 20)).toBeCloseTo(rows.reduce((s, d) => s + d.presses, 0) / rows.length, 10);
  });
  it("minutes = presses * secondsPerPress / 60", () => {
    const r = simulateLoad({ ...base, secondsPerPress: 12 });
    for (const d of r.days) expect(d.minutes).toBeCloseTo((d.presses * 12) / 60, 10);
  });
  it("steady state at 5 words per lesson: the daily load on days 60 to 90 is between 20 and 120 presses (a sanity band; exact numbers are pinned below)", () => {
    const m = simulateLoad({ wordsPerLessonDay: 5, days: 90, againRate: 0.1 }).meanPresses(60, 90);
    expect(m).toBeGreaterThan(20);
    expect(m).toBeLessThan(120);
  });
});

// The numbers quoted in docs/plans/vocab-review-plan.md 2.7. Seed 1, Again 10%, then Hard 15% / Good 65% / Easy 20% of
// the rest, 10 seconds a press, ts-fsrs 6.0.1 with SRS_CONFIG. If the library or the configuration changes, these move
// and the plan must be updated with them.
describe("simulateLoad: the numbers in the plan (Again 10%, seed 1)", () => {
  const again = 0.1;
  it("backfill of 36 words: day 1 has 36 new en_th cards, day 2 the 36 th_en cards", () => {
    const r = simulateLoad({ wordsPerLessonDay: 0, days: 14, againRate: again, backfillWords: 36 });
    expect(r.days.slice(0, 3).map((d) => [d.due, d.newCards, d.presses])).toEqual([[36, 36, 84], [42, 36, 104], [27, 0, 29]]);
  });
  it.each([
    [5, 52.8, 37.9],
    [8, 83.8, 61.0],
    [11, 113.5, 82.8],
  ])("steady state, %i new words per lesson: mean %d presses a day over days 60 to 90 (%d cards due)", (words, presses, due) => {
    const r = simulateLoad({ wordsPerLessonDay: words, days: 90, againRate: again });
    expect(r.meanPresses(60, 90)).toBeCloseTo(presses, 0);
    const rows = r.days.filter((d) => d.day >= 60);
    expect(rows.reduce((s, d) => s + d.due, 0) / rows.length).toBeCloseTo(due, 0);
  });
  it("a week off (days 61 to 67) at 5 words per lesson: 155 cards due and 198 presses on the first day back", () => {
    const r = simulateLoad({ wordsPerLessonDay: 5, days: 80, againRate: again, offDays: { from: 61, to: 67 } });
    expect([r.days[67].due, r.days[67].presses]).toEqual([155, 198]);
    expect(r.days.slice(68, 72).map((d) => d.presses)).toEqual([39, 52, 26, 39]);
  });
});

