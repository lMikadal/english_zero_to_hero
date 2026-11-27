import { FSRS6_DEFAULT_WEIGHTS } from "ts-fsrs/models/fsrs-6";
import { Rating as LibRating, State as LibState } from "ts-fsrs";
import { describe, expect, expectTypeOf, it } from "vitest";
import { SRS_CONFIG } from "./config";
import {
  applyRating, effectiveLibraryConfig, newCardState, previewRatings, RATING_LABEL_TH, RATINGS, toStoredState,
  type CardState, type Rating,
} from "./scheduler";

const NOW = new Date("2026-01-01T01:00:00.000Z");
const DAY = 86_400_000;

function deepFreeze<T>(o: T): T {
  if (o instanceof Date) return Object.freeze(o);
  if (o && typeof o === "object") for (const v of Object.values(o)) deepFreeze(v);
  return Object.freeze(o);
}

describe("configuration is explicit and pinned", () => {
  it("SRS_CONFIG holds every value (nothing is left to a library default)", () => {
    expect(SRS_CONFIG).toEqual({
      algorithm: "FSRS-6",
      desiredRetention: 0.9,
      enableShortTerm: true,
      learningSteps: ["1m", "10m"],
      relearningSteps: ["10m"],
      graduatingInterval: 1,
      enableFuzz: false,
      maximumInterval: 36500,
      weights: [0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542],
    });
  });
  it("the library really runs with those values", () => {
    expect(effectiveLibraryConfig()).toEqual({
      weights: SRS_CONFIG.weights,
      enableShortTerm: true,
      numRelearningSteps: 1,
      fractionalDays: false,
      desiredRetention: { 1: 0.9, 2: 0.9, 3: 0.9, 4: 0.9 },
      enableFuzz: false,
      maximumInterval: 36500,
      clearStatsOnForget: true,
      learningSteps: ["1m", "10m"],
      relearningSteps: ["10m"],
      graduatingInterval: 1,
      allowModelOverride: false,
    });
  });
  it("our FSRS-6 weights equal the library's published FSRS-6 defaults (an upgrade that changes them fails here)", () => {
    expect([...SRS_CONFIG.weights]).toEqual([...FSRS6_DEFAULT_WEIGHTS]);
  });
});

describe("ratings", () => {
  it("RATINGS are the library's Again, Hard, Good, Easy values", () => {
    expect([...RATINGS]).toEqual([LibRating.Again, LibRating.Hard, LibRating.Good, LibRating.Easy]);
    expect([...RATINGS]).toEqual([1, 2, 3, 4]);
  });
  it("Rating is exactly 1 | 2 | 3 | 4", () => {
    expectTypeOf<Rating>().toEqualTypeOf<1 | 2 | 3 | 4>();
  });
  it("every rating has a Thai label (Record: a missing one is a compile error)", () => {
    expect(RATING_LABEL_TH).toEqual({ 1: "จำไม่ได้", 2: "ยาก", 3: "ได้", 4: "ง่าย" });
    expectTypeOf<keyof typeof RATING_LABEL_TH>().toEqualTypeOf<Rating>();
    expectTypeOf(RATING_LABEL_TH).toExtend<Record<Rating, string>>();
  });
  it("CardState.state values are the library's State values", () => {
    expect([LibState.New, LibState.Learning, LibState.Review, LibState.Relearning]).toEqual([0, 1, 2, 3]);
  });
});

describe("newCardState", () => {
  it("is State New with zeroed memory, due where asked", () => {
    const due = new Date("2026-02-03T04:05:06.000Z");
    expect(newCardState(due)).toEqual({
      due, stability: 0, difficulty: 0, scheduledDays: 0, learningSteps: 0, elapsedDays: 0, reps: 0, lapses: 0, state: 0, lastReview: null,
    });
  });
  it("does not share the Date it was given", () => {
    const due = new Date(NOW);
    const card = newCardState(due);
    due.setUTCFullYear(2000);
    expect(card.due.getUTCFullYear()).toBe(2026);
  });
});

/** Cards in each state, built by playing real reviews: [label, card, a review time]. */
function cards(): [string, CardState, Date][] {
  const fresh = newCardState(NOW);
  const learning = applyRating(fresh, 3, NOW, "UTC");
  const review = applyRating(learning, 3, learning.due, "UTC");
  const relearning = applyRating(review, 1, review.due, "UTC");
  const out: [string, CardState, Date][] = [];
  for (const [label, c] of [["new", fresh], ["learning", learning], ["review", review], ["relearning", relearning]] as const) {
    out.push([`${label}, on time`, c, new Date(Math.max(c.due.getTime(), c.lastReview?.getTime() ?? 0))]);
    out.push([`${label}, 3 days late`, c, new Date(c.due.getTime() + 3 * DAY)]);
  }
  const mature = applyRating(applyRating(review, 3, review.due, "UTC"), 3, new Date(review.due.getTime() + 2 * DAY + 3600_000 * 0), "UTC");
  out.push(["mature, 8 hours early", mature, new Date(mature.due.getTime() - 8 * 3600_000)]);
  return out;
}

describe("applyRating and previewRatings", () => {
  it.each(cards().map(([label, c, t]) => [label, c, t] as const))("applyRating == previewRatings[r] for every rating (%s)", (_l, card, now) => {
    const preview = previewRatings(card, now, "UTC");
    for (const r of RATINGS) expect(applyRating(card, r, now, "UTC")).toEqual(preview[r]);
  });

  it("previewRatings has exactly the four ratings", () => {
    const p = previewRatings(newCardState(NOW), NOW, "UTC");
    expect(Object.keys(p).map(Number)).toEqual([1, 2, 3, 4]);
  });

  it("is pure: a deep-frozen input is not touched and the same call gives the same answer", () => {
    for (const [, card, now] of cards()) {
      const frozen = deepFreeze(structuredClone(card));
      const frozenNow = deepFreeze(new Date(now));
      const before = structuredClone(frozen);
      for (const r of RATINGS) {
        expect(applyRating(frozen, r, frozenNow, "UTC")).toEqual(applyRating(frozen, r, frozenNow, "UTC"));
      }
      expect(previewRatings(frozen, frozenNow, "UTC")).toEqual(previewRatings(frozen, frozenNow, "UTC"));
      expect(frozen).toEqual(before);
    }
  });

  it("previewRatings does not change what applyRating returns afterwards", () => {
    const [, card, now] = cards()[2];
    const first = applyRating(card, 3, now, "UTC");
    previewRatings(card, now, "UTC");
    expect(applyRating(card, 3, now, "UTC")).toEqual(first);
  });

  it("returns new Date objects (mutating a result cannot change the card)", () => {
    const [, card, now] = cards()[2];
    const next = applyRating(card, 3, now, "UTC");
    expect(next.due).not.toBe(card.due);
    expect(next.lastReview).not.toBe(card.lastReview);
  });

  it("the card id of the library never leaks: the result has exactly the CardState keys", () => {
    const next = applyRating(newCardState(NOW), 3, NOW, "UTC");
    expect(Object.keys(next).sort()).toEqual(
      ["difficulty", "due", "elapsedDays", "lapses", "lastReview", "learningSteps", "reps", "scheduledDays", "stability", "state"],
    );
  });

  it("elapsedDays is the difference of calendar dates (here UTC) between the last review and this one", () => {
    const card = applyRating(newCardState(NOW), 4, NOW, "UTC"); // Easy: due in 8 days
    expect(applyRating(card, 3, new Date(NOW.getTime() + 8 * DAY), "UTC").elapsedDays).toBe(8);
    expect(applyRating(card, 3, new Date(NOW.getTime() + 8 * DAY - 2 * 3600_000), "UTC").elapsedDays).toBe(7); // 23:00 on the 8th calendar day, not 01:00 on the 9th
  });

  it("never schedules past the maximum interval (36500 days)", () => {
    const old: CardState = {
      due: NOW, stability: 36000, difficulty: 1, scheduledDays: 36000, learningSteps: 0, elapsedDays: 36000, reps: 30, lapses: 0, state: 2,
      lastReview: new Date(NOW.getTime() - 36000 * DAY),
    };
    for (const r of [2, 3, 4] as const) expect(applyRating(old, r, NOW, "UTC").scheduledDays).toBeLessThanOrEqual(36500);
    expect(applyRating(old, 4, NOW, "UTC").scheduledDays).toBe(36500);
  });

  it("is deterministic with no fuzz: 100 reviews of the same card on the same day agree", () => {
    const [, card, now] = cards()[4];
    const first = applyRating(card, 3, now, "UTC");
    for (let i = 0; i < 100; i++) expect(applyRating(card, 3, now, "UTC")).toEqual(first);
  });
});

describe("toStoredState (the jsonb of srs_reviews.state_before / state_after, docs/PROGRESS.md 2)", () => {
  it("is snake_case with ISO strings and a numeric state", () => {
    const card: CardState = {
      due: new Date("2026-03-01T01:10:00.000Z"), stability: 46.3169, difficulty: 2.0975, scheduledDays: 46, learningSteps: 0, elapsedDays: 11,
      reps: 4, lapses: 1, state: 2, lastReview: new Date("2026-01-14T01:10:00.000Z"),
    };
    expect(toStoredState(card)).toEqual({
      due: "2026-03-01T01:10:00.000Z", stability: 46.3169, difficulty: 2.0975, elapsed_days: 11, scheduled_days: 46, learning_steps: 0,
      reps: 4, lapses: 1, state: 2, last_review: "2026-01-14T01:10:00.000Z",
    });
  });
  it("a new card has state 0 and last_review null (state_before is never null)", () => {
    expect(toStoredState(newCardState(NOW))).toEqual({
      due: NOW.toISOString(), stability: 0, difficulty: 0, elapsed_days: 0, scheduled_days: 0, learning_steps: 0, reps: 0, lapses: 0, state: 0, last_review: null,
    });
  });
  it("survives JSON", () => {
    const s = toStoredState(applyRating(newCardState(NOW), 3, NOW, "UTC"));
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });
});
