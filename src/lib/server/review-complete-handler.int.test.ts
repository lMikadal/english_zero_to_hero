// @vitest-environment node
// POST /api/reviews/complete: when does a review session count for the streak? (docs/plans/vocab-review-plan.md 2.4 and 5.2)
import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { activityDays, attempts, profiles, progress, srsCards, streaks, user } from "@/db/schema";
import { cleanDatabase, connectTestDb } from "@/db/test-utils";
import type { CompleteReviewResponse, ReviewInput } from "@/lib/srs/contract";
import type { Rating } from "@/lib/srs/scheduler";
import { handleCompleteReview } from "./review-complete-handler";
import { handlePostReviews } from "./review-handler";
import { finishDay, NOW, REVIEW_SESSION, reviewItem, seedLocal } from "./test-helpers";

const { sql, db } = connectTestDb();
const T1 = new Date("2026-11-26T05:00:00.000Z"); // noon on 26 Nov in Bangkok; day 1 was finished on the 25th
const START = new Date(T1.getTime() - 600_000);
const DAY1 = ["v-hello", "v-name", "v-nice", "v-meet", "v-cat"];
let userId: string;

const review = async (items: ReviewInput[], now = T1, uid = userId) => {
  const r = await handlePostReviews({ reviews: items }, { db, userId: uid, now });
  expect(r.status).toBe(200);
};
const reviewAll = (rating: Rating, words = DAY1, over: Partial<ReviewInput> = {}) => review(words.map((w) => reviewItem(w, "en_th", rating, T1, over)));
const complete = async (over: Record<string, unknown> = {}, now = T1, uid = userId) => {
  const r = await handleCompleteReview({ sessionId: REVIEW_SESSION, startedAt: START.toISOString(), completedAt: now.toISOString(), ...over }, { db, userId: uid, now });
  expect(r.status).toBe(200);
  return r.body as CompleteReviewResponse;
};
const days = () => db.select().from(activityDays).where(eq(activityDays.userId, userId)).orderBy(asc(activityDays.localDate));
const dueNow = (word: string, direction: "en_th" | "th_en", due = new Date(T1.getTime() - 3_600_000)) =>
  db.update(srsCards).set({ due }).where(and(eq(srsCards.vocabId, word), eq(srsCards.direction, direction)));

beforeEach(async () => {
  await cleanDatabase(sql);
  userId = await seedLocal(db, 1);
  await finishDay(db, userId, 1); // lesson activity on 25 Nov; en_th cards due at 00:00 on the 26th, th_en on the 27th
});
afterAll(async () => {
  await cleanDatabase(sql);
  await sql.end();
});

describe("a finished session counts for the streak", () => {
  it("every card due that day was reviewed (both directions): counted, activity_days gets (day of startedAt, review)", async () => {
    await dueNow("v-hello", "th_en"); // one th_en is due as well
    await reviewAll(4);
    await review([reviewItem("v-hello", "th_en", 4, T1)]);
    expect(await complete()).toEqual({ sessionDate: "2026-11-26", reviewed: 6, remainingDue: 0, streak: { current: 2, longest: 2 }, countedForStreak: true });
    expect(await days()).toEqual([
      expect.objectContaining({ localDate: "2026-11-25", source: "lesson" }),
      expect.objectContaining({ localDate: "2026-11-26", source: "review" }),
    ]);
    expect((await db.select().from(streaks).where(eq(streaks.userId, userId)))[0]).toMatchObject({ current: 2, longest: 2, lastActiveDate: "2026-11-26" });
  });

  it("GUARD: a card still due today keeps the day from counting (the 'Again' card comes back in 10 minutes)", async () => {
    await reviewAll(4, DAY1.slice(0, 4));
    await review([reviewItem("v-cat", "en_th", 1, T1)]);
    const r = await complete();
    expect(r).toMatchObject({ sessionDate: "2026-11-26", reviewed: 5, remainingDue: 1, countedForStreak: false, streak: { current: 1, longest: 1 } });
    expect((await days()).map((d) => d.localDate)).toEqual(["2026-11-25"]);
  });

  it("the same card reviewed again with Easy afterwards (a new card needs both learning steps with Good): counted", async () => {
    await reviewAll(4, DAY1.slice(0, 4));
    await review([reviewItem("v-cat", "en_th", 1, T1)]);
    expect((await complete()).countedForStreak).toBe(false);
    await review([reviewItem("v-cat", "en_th", 4, new Date(T1.getTime() + 11 * 60_000))], new Date(T1.getTime() + 11 * 60_000));
    const r = await complete({}, new Date(T1.getTime() + 12 * 60_000));
    expect(r).toMatchObject({ remainingDue: 0, countedForStreak: true, reviewed: 6 });
    expect((await days()).find((d) => d.localDate === "2026-11-26")?.source).toBe("review");
  });

  it("GUARD: only a th_en card left (en_th all done) is not complete: both directions count", async () => {
    await dueNow("v-name", "th_en");
    await reviewAll(4);
    expect(await complete()).toMatchObject({ remainingDue: 1, countedForStreak: false });
    expect((await days()).map((d) => d.localDate)).toEqual(["2026-11-25"]);
  });

  it("GUARD: no review in the session: not counted, even if nothing is left due", async () => {
    await db.update(srsCards).set({ due: new Date("2027-01-01T00:00:00.000Z") });
    expect(await complete()).toMatchObject({ reviewed: 0, remainingDue: 0, countedForStreak: false });
    expect((await days()).map((d) => d.localDate)).toEqual(["2026-11-25"]);
  });

  it("a day with nothing due and no session reviews does not count (no free streak)", async () => {
    await db.update(srsCards).set({ due: new Date("2027-01-01T00:00:00.000Z") });
    await review([reviewItem("v-hello", "en_th", 4, T1, { sessionId: randomUUID() })]); // another session's review
    expect(await complete()).toMatchObject({ reviewed: 0, countedForStreak: false });
  });

  it("only this session's reviews are counted for `reviewed`", async () => {
    await reviewAll(4, DAY1.slice(0, 2), { sessionId: randomUUID() });
    await reviewAll(4, DAY1.slice(2));
    expect((await complete()).reviewed).toBe(3);
  });

  it("GUARD: a completion repeated is identical (same response, no new rows)", async () => {
    await reviewAll(4);
    const first = await complete();
    const rows = await days();
    const streakNow = async () => {
      const { current, longest, lastActiveDate } = (await db.select().from(streaks).where(eq(streaks.userId, userId)))[0];
      return { current, longest, lastActiveDate };
    };
    const streakRow = await streakNow();
    expect(await complete()).toEqual(first);
    expect(await complete({ completedAt: new Date(T1.getTime() + 5000).toISOString() })).toEqual(first);
    expect(await days()).toEqual(rows);
    expect(await streakNow()).toEqual(streakRow);
  });

  it("a day counts once: a second session on the same day adds no row and does not raise the streak", async () => {
    await reviewAll(4);
    const first = await complete();
    const second = randomUUID();
    await review([reviewItem("v-hello", "en_th", 4, new Date(T1.getTime() + 60_000), { sessionId: second })], new Date(T1.getTime() + 60_000));
    const r = await complete({ sessionId: second }, new Date(T1.getTime() + 120_000));
    expect(r.streak).toEqual(first.streak);
    expect(r.countedForStreak).toBe(true);
    expect((await days()).filter((d) => d.localDate === "2026-11-26")).toHaveLength(1);
  });

  it("a day that already has lesson activity keeps its row (no second row, source stays `lesson`)", async () => {
    const at = new Date(NOW.getTime() + 3_600_000); // 18:00 on the 25th, the lesson's own day
    await dueNow("v-hello", "en_th", NOW);
    await db.update(srsCards).set({ due: new Date("2027-01-01T00:00:00.000Z") }).where(eq(srsCards.direction, "th_en"));
    await review([reviewItem("v-hello", "en_th", 4, at)], at);
    const r = await complete({ startedAt: NOW.toISOString() }, at);
    expect(r).toMatchObject({ sessionDate: "2026-11-25", countedForStreak: true, remainingDue: 0 });
    expect(await days()).toEqual([expect.objectContaining({ localDate: "2026-11-25", source: "lesson" })]);
  });
});

describe("which day, which cards", () => {
  it("the day is the day the session STARTED (23:50 local), not the day it ended (00:10)", async () => {
    const start = new Date("2026-11-26T16:50:00.000Z"); // 23:50 on 26 Nov in Bangkok
    const end = new Date("2026-11-26T17:10:00.000Z"); // 00:10 on 27 Nov
    await review(DAY1.map((w) => reviewItem(w, "en_th", 4, new Date(start.getTime() + 300_000))), end);
    const r = await complete({ startedAt: start.toISOString(), completedAt: end.toISOString() }, end);
    expect(r).toMatchObject({ sessionDate: "2026-11-26", countedForStreak: true });
    expect((await days()).map((d) => d.localDate)).toEqual(["2026-11-25", "2026-11-26"]);
  });

  it("a card created AFTER the session started does not have to be reviewed (the lesson finished mid-session)", async () => {
    await reviewAll(4, DAY1.slice(0, 4));
    await db.update(srsCards).set({ createdAt: new Date(START.getTime() + 60_000), due: START }).where(and(eq(srsCards.vocabId, "v-cat"), eq(srsCards.direction, "en_th")));
    expect(await complete()).toMatchObject({ remainingDue: 0, countedForStreak: true });
  });

  it("a card of a word that is no longer taught does not count", async () => {
    await reviewAll(4, DAY1.slice(0, 4));
    // stale card of a day that is not finished (cannot be reviewed through the API, can exist in the table)
    await db.insert(srsCards).values({ userId, vocabId: "v-how", direction: "en_th", due: T1 });
    expect((await complete()).remainingDue).toBe(1); // v-cat en_th only: v-how is not in the finished days
  });

  it("startedAt far in the past (2020) does not move the day back: the day is that of the session's reviews, and the flag is asserted", async () => {
    await reviewAll(4);
    const r = await complete({ startedAt: "2020-01-01T00:00:00.000Z" });
    expect(r).toMatchObject({ sessionDate: "2026-11-26", countedForStreak: true, remainingDue: 0 }); // the honest session still counts, for its own day
    expect((await days()).map((d) => d.localDate)).toEqual(["2026-11-25", "2026-11-26"]);
  });

  it("a start in the future is cut to now", async () => {
    await reviewAll(4);
    expect((await complete({ startedAt: "2030-01-01T00:00:00.000Z" })).sessionDate).toBe("2026-11-26");
  });

  it("uses the profile's time zone for the day", async () => {
    await db.update(profiles).set({ timezone: "America/Los_Angeles" }).where(eq(profiles.userId, userId));
    await db.update(srsCards).set({ due: new Date("2026-11-25T00:00:00.000Z") }).where(eq(srsCards.direction, "en_th"));
    await reviewAll(4);
    expect(await complete()).toMatchObject({ sessionDate: "2026-11-25", countedForStreak: true }); // 21:00 on the 25th in Los Angeles
  });

  it("another user's reviews and cards do not leak in", async () => {
    await db.insert(user).values({ id: "other", name: "O", email: "o@example.com" });
    await db.insert(profiles).values({ userId: "other", startDate: "2026-11-25" });
    await db.insert(progress).values({ userId: "other", day: 1, status: "done", startedAt: NOW, completedAt: NOW, score: 1 });
    await reviewAll(4, DAY1, { sessionId: REVIEW_SESSION });
    await handlePostReviews({ reviews: [reviewItem("v-hello", "en_th", 4, T1)] }, { db, userId: "other", now: T1 });
    await db.update(srsCards).set({ createdAt: NOW }).where(eq(srsCards.userId, "other")); // their cards existed before the session began
    expect(await complete()).toMatchObject({ reviewed: 5, countedForStreak: true });
    expect((await complete({}, T1, "other")).countedForStreak).toBe(false); // the other user still has 4 due
  });
});

describe("GUARD: a streak day cannot be earned without finishing that day's reviews", () => {
  const T3 = new Date("2026-11-28T05:00:00.000Z"); // noon on 28 Nov: the learner missed the 26th and 27th
  const rowsFor = async () => (await days()).map((d) => `${d.localDate}/${d.source}`);

  it("A) back-fill: one stored review plus startedAt on a missed day does not fill that day (the day comes from the reviews, not the client)", async () => {
    // today (28 Nov) the learner reviews everything: that session is honest for the 28th ...
    await review(DAY1.flatMap((w) => [reviewItem(w, "en_th", 4, T3), reviewItem(w, "th_en", 4, T3)]), T3);
    for (const startedAt of ["2026-11-26T05:00:00.000Z", "2026-11-27T05:00:00.000Z", "2026-11-12T05:00:00.000Z", "2020-01-01T00:00:00.000Z"]) {
      const r = await complete({ startedAt }, T3);
      expect(r.sessionDate).toBe("2026-11-28");
    }
    // ... and not one of the missed days got a row
    expect(await rowsFor()).toEqual(["2026-11-25/lesson", "2026-11-28/review"]);
  });

  it("A) the same session completed with different startedAt values never adds a second day", async () => {
    await review(DAY1.flatMap((w) => [reviewItem(w, "en_th", 4, T3), reviewItem(w, "th_en", 4, T3)]), T3);
    await complete({ startedAt: new Date(T3.getTime() - 600_000).toISOString() }, T3);
    const once = await rowsFor();
    for (const startedAt of [T3.toISOString(), new Date(T3.getTime() + 20 * 3_600_000).toISOString(), "2026-11-26T05:00:00.000Z", "2026-10-30T05:00:00.000Z"]) await complete({ startedAt }, T3);
    expect(await rowsFor()).toEqual(once);
  });

  it("B) one answer while most cards are due: a startedAt from before the cards existed does not hide them", async () => {
    await review([reviewItem("v-hello", "en_th", 4, T1)]);
    const r = await complete({ startedAt: "2020-01-01T00:00:00.000Z" });
    expect(r).toMatchObject({ reviewed: 1, remainingDue: 4, countedForStreak: false });
    expect(await rowsFor()).toEqual(["2026-11-25/lesson"]);
  });

  it("C) a day with nothing due: one early review does not count (zero-due days do not count)", async () => {
    await db.update(srsCards).set({ due: new Date("2027-01-01T00:00:00.000Z") });
    await review([reviewItem("v-hello", "en_th", 4, T1)]);
    expect(await complete()).toMatchObject({ reviewed: 1, remainingDue: 0, countedForStreak: false });
    expect(await rowsFor()).toEqual(["2026-11-25/lesson"]);
  });

  it("C) early reviews of cards that were not due do not count, even next to one that was", async () => {
    await db.update(srsCards).set({ due: new Date("2027-01-01T00:00:00.000Z") }).where(eq(srsCards.direction, "th_en"));
    await dueNow("v-cat", "en_th", new Date("2027-01-01T00:00:00.000Z")); // nothing is due at all
    await review(DAY1.map((w) => reviewItem(w, "th_en", 4, T1)));
    expect(await complete()).toMatchObject({ remainingDue: 0, countedForStreak: false });
  });

  it("the honest path counts: every due card reviewed today", async () => {
    await reviewAll(4);
    expect(await complete()).toMatchObject({ sessionDate: "2026-11-26", remainingDue: 0, countedForStreak: true });
  });

  it("a session that crosses midnight counts for the day it started (first answer 23:55, completion 00:10)", async () => {
    const first = new Date("2026-11-26T16:55:00.000Z"); // 23:55 on the 26th in Bangkok
    const end = new Date("2026-11-26T17:10:00.000Z");
    await review(DAY1.map((w) => reviewItem(w, "en_th", 4, first)), end);
    expect(await complete({ startedAt: new Date(first.getTime() - 300_000).toISOString() }, end)).toMatchObject({ sessionDate: "2026-11-26", countedForStreak: true });
  });
});

describe("request checks and the lesson side", () => {
  it("400 for a malformed body", async () => {
    for (const bad of [null, {}, { sessionId: "x", startedAt: START.toISOString(), completedAt: T1.toISOString() }, { sessionId: REVIEW_SESSION }, { sessionId: REVIEW_SESSION, startedAt: "no", completedAt: "no" }, { sessionId: REVIEW_SESSION, startedAt: START.toISOString(), completedAt: T1.toISOString(), extra: 1 }]) {
      expect((await handleCompleteReview(bad, { db, userId, now: T1 })).status).toBe(400);
    }
  });

  it("GUARD: progress, profiles and attempts are not changed by a completion", async () => {
    await db.insert(attempts).values({ userId, exerciseId: "d001-pron-01", day: 1, skill: "pronunciation", exerciseType: "minimal-pair", correct: true });
    await reviewAll(4);
    const snap = async () => ({
      progress: await db.select().from(progress).orderBy(progress.day),
      profiles: await db.select().from(profiles).orderBy(profiles.userId),
      attempts: await db.select().from(attempts).orderBy(attempts.id),
    });
    const before = await snap();
    await complete();
    await complete();
    expect(await snap()).toEqual(before);
  });
});
