// An independent check of the first review and of one Review-state review, written from the published FSRS-6
// formulas (https://github.com/open-spaced-repetition/fsrs4anki/wiki/The-Algorithm) with the published default
// weights, NOT from ts-fsrs. If the adapter wired the wrong model, retention or rating, these numbers would not match.
import { describe, expect, it } from "vitest";
import { applyRating, newCardState, RATINGS, type CardState, type Rating } from "./scheduler";

const W = [0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542];
const NOW = new Date("2026-01-01T01:00:00.000Z");
const MIN = 60_000;
const DAY = 86_400_000;
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

describe("first review of a new card (FSRS-6 initial stability and difficulty)", () => {
  it.each(RATINGS.map((r) => [r] as const))("rating %i", (rating) => {
    const next = applyRating(newCardState(NOW), rating, NOW, "UTC");
    expect(next.stability).toBeCloseTo(W[rating - 1], 4);
    expect(next.difficulty).toBeCloseTo(clamp(W[4] - Math.exp(W[5] * (rating - 1)) + 1, 1, 10), 3);
    expect(next.reps).toBe(1);
    expect(next.lastReview?.getTime()).toBe(NOW.getTime());
  });

  it("learning steps 1m / 10m: again 1 minute, hard 5.5 minutes, good 10 minutes, easy graduates after 8 days", () => {
    const due = (r: Rating) => applyRating(newCardState(NOW), r, NOW, "UTC");
    expect(due(1).due.getTime() - NOW.getTime()).toBe(1 * MIN);
    expect(due(2).due.getTime() - NOW.getTime()).toBe(5.5 * MIN);
    expect(due(3).due.getTime() - NOW.getTime()).toBe(10 * MIN);
    expect([due(1).state, due(2).state, due(3).state, due(4).state]).toEqual([1, 1, 1, 2]);
    expect(due(4).due.getTime() - NOW.getTime()).toBe(8 * DAY);
  });
});

describe("a Review-state card (stability 3, difficulty 5, last seen 3 days ago)", () => {
  const card: CardState = {
    due: NOW, stability: 3, difficulty: 5, scheduledDays: 3, learningSteps: 0, elapsedDays: 3, reps: 4, lapses: 0, state: 2,
    lastReview: new Date(NOW.getTime() - 3 * DAY),
  };
  const decay = -W[20];
  const factor = 0.9 ** (1 / decay) - 1;
  const R = (1 + (factor * 3) / card.stability) ** decay;
  const success = (rating: Rating) =>
    card.stability *
    (1 + Math.exp(W[8]) * (11 - card.difficulty) * card.stability ** -W[9] * (Math.exp(W[10] * (1 - R)) - 1) * (rating === 2 ? W[15] : 1) * (rating === 4 ? W[16] : 1));
  const lapse = Math.min(W[11] * card.difficulty ** -W[12] * ((card.stability + 1) ** W[13] - 1) * Math.exp(W[14] * (1 - R)), card.stability);

  it.each([2, 3, 4] as const)("rating %i: new stability and interval in whole days", (rating) => {
    const next = applyRating(card, rating, NOW, "UTC");
    expect(next.state).toBe(2);
    expect(next.stability).toBeCloseTo(success(rating), 3);
    expect(next.scheduledDays).toBe(Math.max(1, Math.round(success(rating))));
    expect(next.due.getTime()).toBe(NOW.getTime() + next.scheduledDays * DAY);
  });

  it("rating 1 (forgot): relearning, the post-lapse stability, due in 10 minutes, one lapse", () => {
    const next = applyRating(card, 1, NOW, "UTC");
    expect(next.state).toBe(3);
    expect(next.lapses).toBe(1);
    expect(next.stability).toBeCloseTo(lapse, 3);
    expect(next.due.getTime() - NOW.getTime()).toBe(10 * MIN);
  });
});

// ---- the same published formulas, as a small model, checked over a grid (t different from S, every rating, difficulty
// ---- update, short-term review, post-lapse stability, the clamps) -------------------------------------------------
const TZ = "Asia/Bangkok"; // reviews at local noon, so every elapsed time below is a whole number of local days
const noon = (day: number) => new Date(Date.UTC(2026, 0, 1, 5, 0, 0) + day * DAY); // 12:00 Bangkok on 1 Jan + day
const R = (t: number, S: number) => (1 + (0.9 ** (1 / -W[20]) - 1) * (t / S)) ** -W[20];
const D0 = (g: number) => W[4] - Math.exp(W[5] * (g - 1)) + 1;
/** FSRS-6 difficulty: linear damping, then mean reversion towards D0(4) (not clamped), then clamped to 1..10. */
const nextD = (D: number, g: number) => clamp(W[7] * D0(4) + (1 - W[7]) * (D + (-W[6] * (g - 3) * (10 - D)) / 9), 1, 10);
const sRecall = (S: number, D: number, r: number, g: number) =>
  S * (1 + Math.exp(W[8]) * (11 - D) * S ** -W[9] * (Math.exp(W[10] * (1 - r)) - 1) * (g === 2 ? W[15] : 1) * (g === 4 ? W[16] : 1));
const sForget = (S: number, D: number, r: number) =>
  Math.min(W[11] * D ** -W[12] * ((S + 1) ** W[13] - 1) * Math.exp(W[14] * (1 - r)), S / Math.exp(W[17] * W[18]));
const sShortRaw = (S: number, g: number) => S * Math.exp(W[17] * (g - 3 + W[18])) * S ** -W[19];
// FSRS-6: for G >= 2 (Hard, Good, Easy) a same-day review never lowers stability; only Again can
const sShort = (S: number, g: number) => (g >= 2 ? Math.max(sShortRaw(S, g), S) : sShortRaw(S, g));
const state = (S: number, D: number, st: 1 | 2 | 3, last: Date): CardState => ({
  due: last, stability: S, difficulty: D, scheduledDays: st === 2 ? Math.max(1, Math.round(S)) : 0, learningSteps: st === 1 ? 1 : 0, elapsedDays: 0, reps: 5, lapses: 0, state: st, lastReview: last,
});
const rel = (actual: number, expected: number) => expect(actual / expected).toBeCloseTo(1, 5);

describe("long-term review (at least one local day since the last review): t differs from S", () => {
  const cases = [0.8, 3, 25].flatMap((S) => [2, 5, 9].flatMap((D) => [1, 4, 30].map((t) => [S, D, t] as const)));
  it.each(cases)("S=%d D=%d t=%d days: new stability, difficulty and intervals for every rating", (S, D, t) => {
    const card = state(S, D, 2, noon(0));
    const now = noon(t);
    const r = R(t, S);
    const i = { 2: Math.round(sRecall(S, D, r, 2)), 3: Math.round(sRecall(S, D, r, 3)), 4: Math.round(sRecall(S, D, r, 4)) };
    const hard = Math.min(Math.max(1, i[2]), Math.max(1, i[3]));
    const good = Math.max(Math.max(1, i[3]), hard + 1);
    const easy = Math.max(Math.max(1, i[4]), good + 1);
    for (const g of [2, 3, 4] as const) {
      const next = applyRating(card, g, now, TZ);
      rel(next.stability, sRecall(S, D, r, g));
      expect(next.difficulty).toBeCloseTo(nextD(D, g), 4);
      expect(next.state).toBe(2);
      expect(next.elapsedDays).toBe(t);
      expect(next.scheduledDays).toBe({ 2: hard, 3: good, 4: easy }[g]);
    }
    const lapse = applyRating(card, 1, now, TZ);
    rel(lapse.stability, sForget(S, D, r));
    expect(lapse.difficulty).toBeCloseTo(nextD(D, 1), 4);
    expect([lapse.state, lapse.lapses, lapse.scheduledDays]).toEqual([3, 1, 0]);
  });

  it("the decay w20 matters: 100 days after a stability of 1 the retrievability is about 0.5, and the result follows the formula, not a fixed-decay shortcut", () => {
    expect(R(100, 1)).toBeLessThan(0.55);
    expect(R(100, 1)).toBeGreaterThan(0.45);
    const next = applyRating(state(1, 5, 2, noon(0)), 3, noon(100), TZ);
    rel(next.stability, sRecall(1, 5, R(100, 1), 3));
  });

  it("difficulty moves the right way: Again raises it, Easy lowers it, Good keeps it almost still, and it stays within 1..10", () => {
    const card = state(5, 5, 2, noon(0));
    const d = ([1, 2, 3, 4] as const).map((g) => applyRating(card, g, noon(5), TZ).difficulty);
    expect(d[0]).toBeGreaterThan(d[1]);
    expect(d[1]).toBeGreaterThan(d[2]);
    expect(d[2]).toBeGreaterThan(d[3]);
    expect(Math.abs(d[2] - 5)).toBeLessThan(0.01);
    for (const D of [1, 10]) for (const g of [1, 4] as const) {
      const next = applyRating(state(5, D, 2, noon(0)), g, noon(5), TZ).difficulty;
      expect(next).toBeGreaterThanOrEqual(1);
      expect(next).toBeLessThanOrEqual(10);
    }
  });

  it("post-lapse stability is capped at S / exp(w17 * w18) when the formula would give more (a very small S that was not seen for a long time)", () => {
    const S = 0.01;
    const t = 1000;
    const uncapped = W[11] * 1 ** -W[12] * ((S + 1) ** W[13] - 1) * Math.exp(W[14] * (1 - R(t, S)));
    const cap = S / Math.exp(W[17] * W[18]);
    expect(cap).toBeLessThan(uncapped); // the cap really is the binding one here
    const next = applyRating(state(S, 1, 2, noon(0)), 1, noon(t), TZ);
    rel(next.stability, Math.min(uncapped, cap));
  });
});

describe("same-day review (short-term formula, w17..w19) and the graduation clamp", () => {
  const first = new Date("2026-01-01T05:00:00.000Z");
  const later = new Date(first.getTime() + 10 * MIN);
  it.each([
    [1, 0.8, 6],
    [2, 0.8, 6],
    [3, 0.8, 6],
    [4, 0.8, 6],
    [3, 2.3065, 2.1181],
    [4, 2.3065, 2.1181],
    [2, 2.3065, 2.1181],
    [3, 12, 4],
  ] as const)("rating %i on a Learning card with S=%d D=%d, 10 minutes after the last review", (g, S, D) => {
    const next = applyRating(state(S, D, 1, first), g, later, TZ);
    expect(next.elapsedDays).toBe(0);
    rel(next.stability, sShort(S, g));
    expect(next.difficulty).toBeCloseTo(nextD(D, g), 4);
  });
  it("the clamp binds: a Good same-day review would lower stability from 2.3065, so it is kept (the graduation case)", () => {
    expect(sShortRaw(2.3065, 3)).toBeLessThan(2.3065);
    const learning = state(2.3065, 2.1181, 1, first);
    const graduated = applyRating(learning, 3, later, TZ);
    expect(graduated.stability).toBeCloseTo(2.3065, 4);
    expect(graduated.state).toBe(2);
    expect(graduated.scheduledDays).toBe(Math.round(2.3065));
  });
  it("the clamp covers Hard too (G >= 2), but not Again: a same-day Again lowers stability, a same-day Hard does not", () => {
    expect(sShortRaw(2.3065, 2)).toBeLessThan(2.3065);
    const hard = applyRating(state(2.3065, 2.1181, 1, first), 2, later, TZ);
    expect(hard.stability).toBeCloseTo(2.3065, 4);
    const again = applyRating(state(2.3065, 2.1181, 1, first), 1, later, TZ);
    expect(again.stability).toBeLessThan(2.3065);
    rel(again.stability, sShortRaw(2.3065, 1));
  });
  it("a Review card seen again the same local day uses the short-term formula too (elapsed 0)", () => {
    const next = applyRating(state(10, 5, 2, first), 3, later, TZ);
    expect(next.elapsedDays).toBe(0);
    rel(next.stability, sShort(10, 3));
  });
  it("the reviewer's hand-checked values: good x4 step 3 (S 10.971, D 2.1043), lapse from Review (S 0.6077), relearning (S 0.6598)", () => {
    // starts from the hand-checked golden steps' inputs, but the expected numbers come from the formulas above
    const r3 = applyRating(state(2.3065, 2.1112, 2, first), 3, new Date(first.getTime() + 2 * DAY), "UTC");
    rel(r3.stability, sRecall(2.3065, 2.1112, R(2, 2.3065), 3));
    expect(r3.stability).toBeCloseTo(10.971, 2);
    expect(r3.difficulty).toBeCloseTo(nextD(2.1112, 3), 4);
    expect(r3.difficulty).toBeCloseTo(2.1043, 3);
    const lapsed = applyRating(state(2.3065, 2.1112, 2, first), 1, new Date(first.getTime() + 2 * DAY), "UTC");
    expect(lapsed.stability).toBeCloseTo(sForget(2.3065, 2.1112, R(2, 2.3065)), 4);
    expect(lapsed.stability).toBeCloseTo(0.6077, 3);
    const relearn = applyRating(state(lapsed.stability, lapsed.difficulty, 3, new Date(lapsed.lastReview!)), 3, new Date(lapsed.due.getTime()), "UTC");
    rel(relearn.stability, sShort(lapsed.stability, 3));
    expect(relearn.stability).toBeCloseTo(0.6598, 3);
  });
});

