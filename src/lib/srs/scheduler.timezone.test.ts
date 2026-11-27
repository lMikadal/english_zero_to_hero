// Days are the learner's LOCAL calendar days (profiles.timezone), not UTC days. ts-fsrs counts a day as a difference of
// UTC calendar dates; proved with the real library on 2026-11-27 (a Review card last seen at 12:00 Asia/Bangkok on
// 1 Jan, reviewed with Good): at 06:30 Bangkok the next morning (23:30Z) the library saw 0 days (stability stayed 3),
// at 07:30 Bangkok (00:30Z) it saw 1 day (stability 6.367), and at 00:30 Bangkok two days later it still saw 1.
// The adapter shifts every instant to local wall-clock-as-UTC before calling the library, so these tests hold.
import { describe, expect, it } from "vitest";
import { SAME_SESSION_MAX_MS } from "./config";
import { applyRating, previewRatings, RATINGS, toStoredState, type CardState } from "./scheduler";

const BKK = "Asia/Bangkok";
const LA = "America/Los_Angeles";
const DAY = 86_400_000;
const MIN = 60_000;

/** A Review card, last seen (and due) at `last`. */
const reviewCard = (last: string, over: Partial<CardState> = {}): CardState => ({
  due: new Date(last), stability: 3, difficulty: 5, scheduledDays: 3, learningSteps: 0, elapsedDays: 3, reps: 4, lapses: 0, state: 2, lastReview: new Date(last), ...over,
});
const key = (c: CardState) => ({ stability: c.stability, difficulty: c.difficulty, scheduledDays: c.scheduledDays, state: c.state, elapsedDays: c.elapsedDays });
const localHour = (d: Date, tz: string) => Number(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", hour: "numeric" }).format(d));
const localParts = (d: Date, tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(d);

describe("Asia/Bangkok (UTC+7: the UTC day changes at 07:00 local)", () => {
  const card = reviewCard("2026-01-01T05:00:00.000Z"); // 12:00 on 1 Jan, Bangkok
  const noonNextDay = new Date("2026-01-02T05:00:00.000Z"); // 12:00 on 2 Jan
  const reference = applyRating(card, 3, noonNextDay, BKK);

  it("reviewed at 12:00 the next local day counts 1 day", () => {
    expect(reference.elapsedDays).toBe(1);
    expect(reference.stability).toBeGreaterThan(card.stability);
  });
  it.each([
    ["06:30 next morning (before the UTC midnight)", "2026-01-01T23:30:00.000Z"],
    ["00:00:30 next morning", "2026-01-01T17:00:30.000Z"],
    ["07:30 next morning (after the UTC midnight)", "2026-01-02T00:30:00.000Z"],
    ["23:59 the same evening of the next day", "2026-01-02T16:59:00.000Z"],
  ])("%s gives the same schedule as the equivalent local-noon review (same memory, same day count)", (_n, t) => {
    const next = applyRating(card, 3, new Date(t), BKK);
    expect(key(next)).toEqual(key(reference));
  });
  it("the same evening (23:59 on the day of the last review) is a same-day review: 0 days", () => {
    const next = applyRating(card, 3, new Date("2026-01-01T16:59:00.000Z"), BKK);
    expect(next.elapsedDays).toBe(0);
  });
  it("two local days later (00:30 on 3 Jan = 17:30Z on 2 Jan) counts 2 days, like noon on 3 Jan", () => {
    const early = applyRating(card, 3, new Date("2026-01-02T17:30:00.000Z"), BKK);
    const noon = applyRating(card, 3, new Date("2026-01-03T05:00:00.000Z"), BKK);
    expect(early.elapsedDays).toBe(2);
    expect(key(early)).toEqual(key(noon));
  });
  it("with the UTC zone the same instants are counted in UTC days (the zone is not ignored)", () => {
    const utc0 = applyRating(card, 3, new Date("2026-01-01T23:30:00.000Z"), "UTC");
    const utc1 = applyRating(card, 3, new Date("2026-01-02T00:30:00.000Z"), "UTC");
    expect([utc0.elapsedDays, utc1.elapsedDays]).toEqual([0, 1]);
  });
  it("due is the same local wall-clock time N days later, as a real instant", () => {
    const next = applyRating(card, 3, new Date("2026-01-01T23:30:00.000Z"), BKK); // 06:30 on 2 Jan
    expect(next.scheduledDays).toBeGreaterThanOrEqual(1);
    expect(localParts(next.due, BKK).slice(-5)).toBe("06:30");
    expect(next.due.getTime() - new Date("2026-01-01T23:30:00.000Z").getTime()).toBe(next.scheduledDays * DAY);
  });
});

describe("America/Los_Angeles across the DST change (2026-03-08, a 23-hour day)", () => {
  const card = reviewCard("2026-03-07T20:00:00.000Z"); // 12:00 PST on 7 Mar
  it.each([
    ["00:30 PDT on 9 Mar (2 local days)", "2026-03-09T07:30:00.000Z", 2],
    ["12:00 PDT on 9 Mar (2 local days)", "2026-03-09T19:00:00.000Z", 2],
    ["00:30 PST on 8 Mar (1 local day), 08:30Z", "2026-03-08T08:30:00.000Z", 1],
    ["23:30 PST on 7 Mar (same local day), 07:30Z on 8 Mar", "2026-03-08T07:30:00.000Z", 0],
  ])("%s counts %i day(s)", (_n, t, days) => {
    expect(applyRating(card, 3, new Date(t), LA).elapsedDays).toBe(days);
  });
  it("12:00 and 00:30 two local days later give the same schedule", () => {
    expect(key(applyRating(card, 3, new Date("2026-03-09T07:30:00.000Z"), LA))).toEqual(key(applyRating(card, 3, new Date("2026-03-09T19:00:00.000Z"), LA)));
  });
  it("a due date in days keeps its local wall-clock time across the change and is a real instant", () => {
    const start = new Date("2026-03-07T20:00:00.000Z"); // 12:00 PST
    const easy = applyRating({ ...reviewCard("2026-03-07T20:00:00.000Z"), state: 0, stability: 0, difficulty: 0, reps: 0, lastReview: null, scheduledDays: 0, elapsedDays: 0 }, 4, start, LA);
    expect(easy.scheduledDays).toBe(8);
    expect(easy.due.toISOString()).toBe("2026-03-15T19:00:00.000Z"); // 12:00 PDT on 15 Mar, not 13:00
    expect(localHour(easy.due, LA)).toBe(12);
    expect(Number.isNaN(easy.due.getTime())).toBe(false);
  });
  it("the autumn change (2026-11-01, a 25-hour day) keeps the wall-clock time too", () => {
    const start = new Date("2026-10-28T19:00:00.000Z"); // 12:00 PDT
    const easy = applyRating({ ...reviewCard("2026-10-28T19:00:00.000Z"), state: 0, stability: 0, difficulty: 0, reps: 0, lastReview: null, scheduledDays: 0, elapsedDays: 0 }, 4, start, LA);
    expect(localParts(easy.due, LA)).toBe("2026-11-05, 12:00");
  });
  it("a due time that does not exist (02:30 on the spring-forward day) still comes out as a valid instant within an hour of it", () => {
    // Easy on a new card = 8 days: 02:30 PST on 28 Feb + 8 days = 02:30 on 8 Mar, which does not exist in Los Angeles
    const start = new Date("2026-02-28T10:30:00.000Z");
    const fresh: CardState = { due: start, stability: 0, difficulty: 0, scheduledDays: 0, learningSteps: 0, elapsedDays: 0, reps: 0, lapses: 0, state: 0, lastReview: null };
    const next = applyRating(fresh, 4, start, LA);
    expect(next.scheduledDays).toBe(8);
    expect(Number.isNaN(next.due.getTime())).toBe(false);
    expect(Math.abs((next.due.getTime() - start.getTime()) / DAY - 8)).toBeLessThanOrEqual(1 / 24 + 1e-9);
  });
});

describe("minute steps are real durations, in every zone and across a DST change", () => {
  const fresh: CardState = { due: new Date(0), stability: 0, difficulty: 0, scheduledDays: 0, learningSteps: 0, elapsedDays: 0, reps: 0, lapses: 0, state: 0, lastReview: null };
  it.each([
    ["UTC", "2026-01-01T01:00:00.000Z"],
    [BKK, "2026-01-01T16:55:00.000Z"], // 23:55 local: the steps cross local midnight
    [LA, "2026-03-08T09:55:00.000Z"], // 01:55 PST: the steps cross the 02:00 -> 03:00 change
    [LA, "2026-11-01T08:55:00.000Z"], // 01:55 PDT: the steps cross the fall-back hour
    ["Pacific/Auckland", "2026-09-26T13:55:00.000Z"],
  ])("%s at %s: again 1 min, hard 5.5 min, good 10 min, and a Review card forgotten 10 min", (tz, t) => {
    const now = new Date(t);
    const p = previewRatings({ ...fresh, due: now }, now, tz);
    expect([1, 2, 3].map((r) => p[r as 1 | 2 | 3].due.getTime() - now.getTime())).toEqual([1 * MIN, 5.5 * MIN, 10 * MIN]);
    expect(p[3].learningSteps).toBe(1);
    const review = reviewCard(new Date(now.getTime() - 3 * DAY).toISOString(), { due: now });
    expect(applyRating(review, 1, now, tz).due.getTime() - now.getTime()).toBe(10 * MIN);
  });
});

// Learning steps are minutes apart. A midnight crossing between two answers of the same session must not count as a day:
// that would switch FSRS to the long-term formula and graduate the card to ~7 days instead of ~2.
describe("learning steps across local midnight are the same session (elapsed 0)", () => {
  const fresh = (due: Date): CardState => ({ due, stability: 0, difficulty: 0, scheduledDays: 0, learningSteps: 0, elapsedDays: 0, reps: 0, lapses: 0, state: 0, lastReview: null });
  const shape = (c: CardState) => ({ stability: c.stability, difficulty: c.difficulty, state: c.state, scheduledDays: c.scheduledDays, elapsedDays: c.elapsedDays, learningSteps: c.learningSteps, reps: c.reps });
  /** two Good answers 10 minutes apart: new -> step 1 -> graduation */
  const twoGood = (t0: Date, tz: string) => {
    const a = applyRating(fresh(t0), 3, t0, tz);
    const t1 = new Date(t0.getTime() + 10 * MIN);
    return { a, b: applyRating(a, 3, t1, tz) };
  };
  const cases: [string, string, string, string][] = [
    ["Asia/Bangkok", "23:55 -> 00:05", "2026-01-01T16:55:00.000Z", "2026-01-01T05:00:00.000Z"], // 23:55 local vs 12:00 local
    [LA, "23:55 -> 00:05 on the spring-forward night", "2026-03-08T07:55:00.000Z", "2026-03-07T20:00:00.000Z"], // 23:55 PST 7 Mar vs 12:00 PST
    ["UTC", "23:55 -> 00:05", "2026-01-01T23:55:00.000Z", "2026-01-01T12:00:00.000Z"],
  ];
  it.each(cases)("%s %s gives exactly the schedule of 12:00 -> 12:10", (tz, _n, cross, noonStart) => {
    const across = twoGood(new Date(cross), tz);
    const noon = twoGood(new Date(noonStart), tz);
    expect(across.b.elapsedDays).toBe(0);
    expect(shape(across.b)).toEqual(shape(noon.b));
    expect(shape(across.a)).toEqual(shape(noon.a));
    expect(across.b.state).toBe(2);
    expect(across.b.scheduledDays).toBeLessThanOrEqual(3); // ~2 days, not ~7
  });
  it("a Relearning card answered across midnight is also same-session", () => {
    const review = reviewCard("2026-01-01T05:00:00.000Z");
    const t0 = new Date("2026-01-04T16:55:00.000Z"); // 23:55 local, 3 days later (due)
    const lapsed = applyRating(review, 1, t0, BKK);
    expect(lapsed.state).toBe(3);
    const back = applyRating(lapsed, 3, lapsed.due, BKK); // 00:05 next local day
    const t0n = new Date("2026-01-04T05:00:00.000Z");
    const lapsedN = applyRating(review, 1, t0n, BKK);
    const backN = applyRating(lapsedN, 3, lapsedN.due, BKK); // 12:10
    expect(back.elapsedDays).toBe(0);
    expect(shape(back)).toEqual(shape(backN));
  });
  it("a Learning card answered the next morning (at least 4 hours later, next calendar day) still counts 1 day", () => {
    const t0 = new Date("2026-01-01T16:55:00.000Z"); // 23:55 local
    const a = applyRating(fresh(t0), 3, t0, BKK);
    const morning = new Date(t0.getTime() + SAME_SESSION_MAX_MS + MIN); // 04:56 local next day
    expect(applyRating(a, 3, morning, BKK).elapsedDays).toBe(1);
  });
  it("the limit is exclusive: just under SAME_SESSION_MAX_MS is the same session, exactly SAME_SESSION_MAX_MS follows the calendar", () => {
    const t0 = new Date("2026-01-01T16:55:00.000Z"); // 23:55 local
    const a = applyRating(fresh(t0), 3, t0, BKK);
    expect(applyRating(a, 3, new Date(t0.getTime() + SAME_SESSION_MAX_MS - 1), BKK).elapsedDays).toBe(0);
    expect(applyRating(a, 3, new Date(t0.getTime() + SAME_SESSION_MAX_MS), BKK).elapsedDays).toBe(1);
  });
  it("SAME_SESSION_MAX_MS is 4 hours", () => {
    expect(SAME_SESSION_MAX_MS).toBe(4 * 3_600_000);
  });
  it("a Review-state card is NOT affected: 23:55 then 00:05 is still 1 calendar day", () => {
    const review = reviewCard("2026-01-01T16:55:00.000Z");
    expect(applyRating(review, 3, new Date("2026-01-01T17:05:00.000Z"), BKK).elapsedDays).toBe(1);
  });
  it("a new card has no last review: unchanged", () => {
    expect(applyRating(fresh(new Date(0)), 3, new Date("2026-01-01T16:55:00.000Z"), BKK).elapsedDays).toBe(0);
  });
  it("applyRating still equals previewRatings[r] across midnight", () => {
    const t0 = new Date("2026-01-01T16:55:00.000Z");
    const a = applyRating(fresh(t0), 3, t0, BKK);
    const now = new Date(t0.getTime() + 10 * MIN);
    const p = previewRatings(a, now, BKK);
    for (const r of RATINGS) expect(applyRating(a, r, now, BKK)).toEqual(p[r]);
  });
});

describe("applyRating is previewRatings[r] by construction, in every zone", () => {
  it.each(["UTC", BKK, LA, "Pacific/Auckland"])("%s", (tz) => {
    const card = reviewCard("2026-03-07T20:00:00.000Z");
    for (const t of ["2026-03-07T21:00:00.000Z", "2026-03-08T07:30:00.000Z", "2026-03-09T07:30:00.000Z", "2026-06-01T12:00:00.000Z"]) {
      const now = new Date(t);
      const p = previewRatings(card, now, tz);
      for (const r of RATINGS) expect(applyRating(card, r, now, tz)).toEqual(p[r]);
    }
  });
});

describe("the stored elapsed_days is the day count FSRS used", () => {
  it("the new card state carries the local-day difference of this review and toStoredState writes it", () => {
    const card = reviewCard("2026-01-01T05:00:00.000Z");
    for (const [t, days] of [["2026-01-01T16:59:00.000Z", 0], ["2026-01-01T23:30:00.000Z", 1], ["2026-01-02T17:30:00.000Z", 2], ["2026-01-08T05:00:00.000Z", 7]] as const) {
      const next = applyRating(card, 3, new Date(t), BKK);
      expect(next.elapsedDays).toBe(days);
      expect(toStoredState(next).elapsed_days).toBe(days);
    }
  });
  it("0 means FSRS used the same-day (short-term) formula, so the stability differs from a next-day review", () => {
    const card = reviewCard("2026-01-01T05:00:00.000Z");
    const same = applyRating(card, 3, new Date("2026-01-01T16:59:00.000Z"), BKK);
    const next = applyRating(card, 3, new Date("2026-01-01T23:30:00.000Z"), BKK);
    expect(same.elapsedDays).toBe(0);
    expect(next.elapsedDays).toBe(1);
    expect(same.stability).not.toBeCloseTo(next.stability, 2);
  });
  it("a new card has elapsed 0", () => {
    const fresh: CardState = { due: new Date(0), stability: 0, difficulty: 0, scheduledDays: 0, learningSteps: 0, elapsedDays: 0, reps: 0, lapses: 0, state: 0, lastReview: null };
    expect(applyRating(fresh, 3, new Date("2026-01-01T01:00:00.000Z"), BKK).elapsedDays).toBe(0);
  });
});
