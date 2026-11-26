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
    const next = applyRating(newCardState(NOW), rating, NOW);
    expect(next.stability).toBeCloseTo(W[rating - 1], 4);
    expect(next.difficulty).toBeCloseTo(clamp(W[4] - Math.exp(W[5] * (rating - 1)) + 1, 1, 10), 3);
    expect(next.reps).toBe(1);
    expect(next.lastReview?.getTime()).toBe(NOW.getTime());
  });

  it("learning steps 1m / 10m: again 1 minute, hard 5.5 minutes, good 10 minutes, easy graduates after 8 days", () => {
    const due = (r: Rating) => applyRating(newCardState(NOW), r, NOW);
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
    const next = applyRating(card, rating, NOW);
    expect(next.state).toBe(2);
    expect(next.stability).toBeCloseTo(success(rating), 3);
    expect(next.scheduledDays).toBe(Math.max(1, Math.round(success(rating))));
    expect(next.due.getTime()).toBe(NOW.getTime() + next.scheduledDays * DAY);
  });

  it("rating 1 (forgot): relearning, the post-lapse stability, due in 10 minutes, one lapse", () => {
    const next = applyRating(card, 1, NOW);
    expect(next.state).toBe(3);
    expect(next.lapses).toBe(1);
    expect(next.stability).toBeCloseTo(lapse, 3);
    expect(next.due.getTime() - NOW.getTime()).toBe(10 * MIN);
  });
});
