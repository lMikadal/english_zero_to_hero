// @vitest-environment node
// POST /api/reviews against the real database (docs/plans/vocab-review-plan.md 5.2 and 4.4.13).
import { createHash } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { attempts, profiles, progress, srsCards, srsReviews, user } from "@/db/schema";
import { cleanDatabase, connectTestDb } from "@/db/test-utils";
import type { PostReviewsResponse, ReviewInput, ReviewResult } from "@/lib/srs/contract";
import { toWire } from "@/lib/srs/contract";
import { rowToCardState } from "@/lib/srs/cards";
import { applyRating, fromStoredState, toStoredState, type Rating } from "@/lib/srs/scheduler";
import { handleCompleteReview } from "./review-complete-handler";
import { handlePostReviews } from "./review-handler";
import { finishDay, NOW, REVIEW_SESSION, reviewItem, seedLocal } from "./test-helpers";

const { sql, db } = connectTestDb();
const TZ = "Asia/Bangkok";
const T1 = new Date("2026-11-26T05:00:00.000Z"); // noon on 26 Nov in Bangkok, the day after day 1 was finished
let userId: string;

const post = (items: unknown[], now = T1, uid = userId) => handlePostReviews({ reviews: items }, { db, userId: uid, now });
const results = async (items: unknown[], now = T1, uid = userId): Promise<ReviewResult[]> => {
  const r = await post(items, now, uid);
  expect(r.status).toBe(200);
  return (r.body as PostReviewsResponse).results;
};
const cards = (uid = userId) => db.select().from(srsCards).where(eq(srsCards.userId, uid)).orderBy(asc(srsCards.vocabId), asc(srsCards.direction));
const card = async (vocabId: string, direction: "en_th" | "th_en") => (await db.select().from(srsCards).where(and(eq(srsCards.userId, userId), eq(srsCards.vocabId, vocabId), eq(srsCards.direction, direction))))[0];
const reviews = () => db.select().from(srsReviews).orderBy(asc(srsReviews.reviewedAt), asc(srsReviews.id));
const md5 = (rows: unknown) => createHash("md5").update(JSON.stringify(rows)).digest("hex");
const item = (vocabId: string, direction: ReviewInput["direction"], rating: Rating, over: Partial<ReviewInput> = {}) => reviewItem(vocabId, direction, rating, T1, over);

beforeEach(async () => {
  await cleanDatabase(sql);
  userId = await seedLocal(db, 1);
  await finishDay(db, userId, 1); // 5 words x 2 cards; en_th due 00:00 on 26 Nov in Bangkok, th_en a day later
});
afterAll(async () => {
  await cleanDatabase(sql);
  await sql.end();
});

describe("a review of a New card", () => {
  it("is created: the response card is the server's applyRating, stored as state_after, and the card row equals it", async () => {
    const before = await card("v-hello", "en_th");
    const it1 = item("v-hello", "en_th", 3, { durationMs: 4200 });
    const [res] = await results([it1]);
    const expected = applyRating(rowToCardState(before), 3, new Date(it1.reviewedAt), TZ);
    expect(res).toEqual({ id: it1.id, status: "created", card: toWire(expected) });
    expect(expected.reps).toBe(1);

    const [row] = await reviews();
    expect(row).toMatchObject({ id: it1.id, userId, vocabId: "v-hello", direction: "en_th", rating: 3, durationMs: 4200, sessionId: REVIEW_SESSION });
    expect(row.reviewedAt).toEqual(new Date(it1.reviewedAt));
    expect(row.stateBefore).toEqual(toStoredState(rowToCardState(before)));
    expect((row.stateBefore as { state: number }).state).toBe(0);
    expect(row.stateAfter).toEqual(toStoredState(expected));

    const after = await card("v-hello", "en_th");
    expect(rowToCardState(after)).toEqual(expected);
    expect(after.reps).toBe(1);
  });

  it.each([1, 2, 3, 4] as Rating[])("GUARD: with rating %i, state_after = applyRating(state_before, rating, clamped reviewedAt, profile timezone) and the response is that card", async (rating) => {
    const it1 = item("v-name", "en_th", rating);
    const [res] = await results([it1]);
    const [row] = await reviews();
    const recomputed = applyRating(fromStoredState(row.stateBefore), rating, row.reviewedAt, TZ);
    expect(row.stateAfter).toEqual(toStoredState(recomputed));
    expect(res.status === "created" && res.card).toEqual(toWire(recomputed));
    expect(rowToCardState(await card("v-name", "en_th"))).toEqual(recomputed);
  });

  it("uses the profile's time zone, not the server's or the client's", async () => {
    await db.update(profiles).set({ timezone: "America/Los_Angeles" }).where(eq(profiles.userId, userId));
    const it1 = item("v-meet", "en_th", 3);
    const [res] = await results([it1]);
    const [row] = await reviews();
    expect(row.stateAfter).toEqual(toStoredState(applyRating(fromStoredState(row.stateBefore), 3, new Date(it1.reviewedAt), "America/Los_Angeles")));
    expect(res.status).toBe("created");
  });

  it("a review before the card is due is accepted and scheduled by applyRating (early review)", async () => {
    const due = new Date("2026-12-20T00:00:00.000Z");
    await db.update(srsCards).set({ state: 2, stability: 12, difficulty: 5, reps: 4, scheduledDays: 20, due, lastReview: new Date("2026-11-01T05:00:00.000Z") }).where(eq(srsCards.vocabId, "v-cat"));
    const before = rowToCardState(await card("v-cat", "en_th"));
    const it1 = item("v-cat", "en_th", 3);
    const [res] = await results([it1]);
    expect(res.status).toBe("created");
    const expected = applyRating(before, 3, new Date(it1.reviewedAt), TZ);
    expect(rowToCardState(await card("v-cat", "en_th"))).toEqual(expected);
    expect(expected.reps).toBe(5);
  });
});

describe("a duplicate (same id)", () => {
  it("answers `duplicate` with the stored card, does not reschedule and does not add a row", async () => {
    const it1 = item("v-hello", "en_th", 3);
    const [first] = await results([it1]);
    const snapshot = { cards: md5(await cards()), reviews: md5(await reviews()) };
    const [again] = await results([it1]);
    expect(again).toEqual({ id: it1.id, status: "duplicate", card: first.status === "created" ? first.card : null });
    expect(md5(await cards())).toBe(snapshot.cards);
    expect(md5(await reviews())).toBe(snapshot.reviews);
    expect((await card("v-hello", "en_th")).reps).toBe(1);
  });

  it("answers with the card as it was after THAT review, even when the card has moved on", async () => {
    const r1 = item("v-hello", "en_th", 3, { reviewedAt: new Date(T1.getTime() - 120_000).toISOString() });
    const r2 = item("v-hello", "en_th", 3);
    const [a] = await results([r1]);
    await results([r2]);
    const [dup] = await results([r1]);
    expect(dup.status).toBe("duplicate");
    expect(dup.status === "duplicate" && dup.card).toEqual(a.status === "created" && a.card);
    expect((await card("v-hello", "en_th")).reps).toBe(2);
    expect(await reviews()).toHaveLength(2);
  });

  it("a card rebuilt from state_after through fromStoredState is what comes back", async () => {
    const it1 = item("v-name", "en_th", 1);
    await results([it1]);
    const [row] = await reviews();
    const [dup] = await results([it1]);
    expect(dup.status === "duplicate" && dup.card).toEqual(toWire(fromStoredState(row.stateAfter)));
  });

  it("GUARD: the same review sent concurrently (Promise.all) creates one row and reschedules once", async () => {
    const it1 = item("v-nice", "en_th", 3);
    const out = await Promise.all(Array.from({ length: 6 }, () => results([it1])));
    const statuses = out.map((r) => r[0].status).sort();
    expect(statuses).toEqual(["created", "duplicate", "duplicate", "duplicate", "duplicate", "duplicate"]);
    const cardsSeen = new Set(out.map((r) => JSON.stringify((r[0] as { card: unknown }).card)));
    expect(cardsSeen.size).toBe(1);
    expect(await reviews()).toHaveLength(1);
    expect((await card("v-nice", "en_th")).reps).toBe(1);
  });

  it("the same id twice in one batch: the second is a duplicate", async () => {
    const it1 = item("v-meet", "en_th", 4);
    const r = await results([it1, it1]);
    expect(r.map((x) => x.status)).toEqual(["created", "duplicate"]);
    expect((await card("v-meet", "en_th")).reps).toBe(1);
  });

  it("an id that belongs to another user is rejected, and that user's review is untouched", async () => {
    await db.insert(user).values({ id: "other", name: "O", email: "o@example.com" });
    await db.insert(profiles).values({ userId: "other", startDate: "2026-11-25" });
    await db.insert(progress).values({ userId: "other", day: 1, status: "done", startedAt: NOW, completedAt: NOW, score: 1 });
    const mine = item("v-hello", "en_th", 3);
    await results([mine]);
    const before = md5(await reviews());
    const r = await results([mine], T1, "other"); // their word is taught, so only the id is wrong
    expect(r).toEqual([{ id: mine.id, status: "rejected", reason: "invalid" }]);
    expect(md5(await reviews())).toBe(before);
    expect((await reviews())[0].userId).toBe(userId);
  });
});

describe("order", () => {
  const ID_LATE = "ffffffff-ffff-4fff-8fff-ffffffffffff";
  const ID_EARLY = "00000000-0000-4000-8000-000000000000";
  it("GUARD: two reviews of one card in a batch apply in request order, never sorted by id", async () => {
    const t1 = new Date(T1.getTime() - 300_000);
    const t2 = new Date(T1.getTime() - 60_000);
    const first = item("v-hello", "en_th", 1, { id: ID_LATE, reviewedAt: t1.toISOString() }); // larger id, but sent first
    const second = item("v-hello", "en_th", 3, { id: ID_EARLY, reviewedAt: t2.toISOString() });
    const c0 = rowToCardState(await card("v-hello", "en_th"));
    const r = await results([first, second]);
    const s1 = applyRating(c0, 1, t1, TZ);
    const s2 = applyRating(s1, 3, t2, TZ);
    expect(r[0]).toEqual({ id: ID_LATE, status: "created", card: toWire(s1) });
    expect(r[1]).toEqual({ id: ID_EARLY, status: "created", card: toWire(s2) });
    expect(rowToCardState(await card("v-hello", "en_th"))).toEqual(s2);
    expect(s2.reps).toBe(2);
  });

  it("results come back in request order even though locks are taken in card order", async () => {
    const items = [item("v-nice", "th_en", 3), item("v-cat", "en_th", 3), item("v-hello", "en_th", 3)];
    expect((await results(items)).map((r) => r.id)).toEqual(items.map((i) => i.id));
  });

  it("a later review stamped EARLIER than the card's last review is raised to it (time never goes back)", async () => {
    const t1 = new Date(T1.getTime() - 60_000);
    await results([item("v-hello", "en_th", 3, { reviewedAt: t1.toISOString() })]);
    const late = item("v-hello", "en_th", 3, { reviewedAt: new Date(T1.getTime() - 3_600_000).toISOString() });
    const [res] = await results([late]);
    expect(res.status).toBe("created");
    const stored = (await reviews()).find((x) => x.id === late.id)!;
    expect(stored.reviewedAt).toEqual(t1);
    expect((await card("v-hello", "en_th")).lastReview).toEqual(t1);
  });

  it("two batches that touch the same cards in opposite orders both finish (locks in a fixed order, no deadlock)", async () => {
    const words = ["v-hello", "v-name", "v-nice", "v-meet", "v-cat"];
    const a = words.map((w) => item(w, "en_th", 3));
    const b = [...words].reverse().map((w) => item(w, "en_th", 3));
    const [ra, rb] = await Promise.all([results(a), results(b)]);
    expect([...ra, ...rb].every((r) => r.status === "created")).toBe(true);
    expect((await card("v-hello", "en_th")).reps).toBe(2);
  });
});

describe("only the card of the direction reviewed changes", () => {
  it("a th_en review changes the th_en card of that word and nothing else", async () => {
    const before = await cards();
    const [res] = await results([item("v-hello", "th_en", 3)]);
    expect(res.status).toBe("created");
    const after = await cards();
    expect(after.filter((c) => !(c.vocabId === "v-hello" && c.direction === "th_en"))).toEqual(before.filter((c) => !(c.vocabId === "v-hello" && c.direction === "th_en")));
    const changed = after.find((c) => c.vocabId === "v-hello" && c.direction === "th_en")!;
    expect(changed.reps).toBe(1);
    expect(changed.state).not.toBe(0);
    expect((await reviews())[0]).toMatchObject({ vocabId: "v-hello", direction: "th_en" });
  });
});

describe("rejections do not poison the batch", () => {
  it("unknown word, word not taught, invalid item: each is rejected with its reason and the good items are created", async () => {
    const good1 = item("v-hello", "en_th", 3);
    const good2 = item("v-cat", "th_en", 4);
    const unknown = item("v-no-such-word", "en_th", 3);
    const notTaught = item("v-how", "en_th", 3); // a day 2 word, day 2 is not finished
    const bad = { ...item("v-name", "en_th", 3), rating: 5 };
    const r = await results([unknown, good1, notTaught, bad, good2]);
    expect(r).toEqual([
      { id: unknown.id, status: "rejected", reason: "unknown_word" },
      expect.objectContaining({ id: good1.id, status: "created" }),
      { id: notTaught.id, status: "rejected", reason: "not_taught" },
      { id: bad.id, status: "rejected", reason: "invalid" },
      expect.objectContaining({ id: good2.id, status: "created" }),
    ]);
    expect((await reviews()).map((x) => x.id).sort()).toEqual([good1.id, good2.id].sort());
    expect((await cards()).some((c) => c.vocabId === "v-how")).toBe(false); // no card made for a word not taught
  });

  it("an item that is not even an object is rejected with a null id", async () => {
    const r = await results([42, item("v-hello", "en_th", 3)]);
    expect(r[0]).toEqual({ id: null, status: "rejected", reason: "invalid" });
    expect(r[1].status).toBe("created");
  });

  it("another user's cards are not reachable: a learner with no finished lesson gets not_taught and nothing is written to the first user's cards", async () => {
    await db.insert(user).values({ id: "other", name: "O", email: "o@example.com" });
    await db.insert(profiles).values({ userId: "other", startDate: "2026-11-25" });
    const before = md5(await cards());
    const it1 = item("v-hello", "en_th", 3);
    expect(await results([it1], T1, "other")).toEqual([{ id: it1.id, status: "rejected", reason: "not_taught" }]);
    expect(md5(await cards())).toBe(before);
    expect(await reviews()).toHaveLength(0);
    expect(await cards("other")).toHaveLength(0);
  });

  it("a taught word whose card is missing (deleted) gets its card back and is reviewed", async () => {
    await db.delete(srsCards).where(eq(srsCards.vocabId, "v-cat"));
    const [res] = await results([item("v-cat", "en_th", 3)]);
    expect(res.status).toBe("created");
    expect(await cards()).toHaveLength(10);
  });

  it("a body that is not a batch is a 400", async () => {
    for (const bad of [null, {}, { reviews: [] }, { reviews: "x" }, { reviews: Array.from({ length: 51 }, () => 1) }]) {
      expect((await handlePostReviews(bad, { db, userId, now: T1 })).status).toBe(400);
    }
  });
});

describe("the clock of the client", () => {
  it("a future reviewedAt is cut to the server's now; one older than the profile's start is raised to it", async () => {
    const future = item("v-hello", "en_th", 3, { reviewedAt: "2030-01-01T00:00:00.000Z" });
    const ancient = item("v-name", "en_th", 3, { reviewedAt: "2000-01-01T00:00:00.000Z" });
    await results([future, ancient]);
    const rows = await reviews();
    expect(rows.find((x) => x.id === future.id)!.reviewedAt).toEqual(T1);
    expect(rows.find((x) => x.id === ancient.id)!.reviewedAt).toEqual(new Date("2026-11-24T17:00:00.000Z")); // 25 Nov 00:00 in Bangkok = profile start
  });
});

describe("GUARD: a review never touches the lesson side", () => {
  it("progress, profiles and attempts are the same after reviews and a completion", async () => {
    await db.insert(attempts).values({ userId, exerciseId: "d001-pron-01", day: 1, skill: "pronunciation", exerciseType: "minimal-pair", correct: true });
    const snap = async () => ({
      progress: await db.select().from(progress).orderBy(progress.day),
      profiles: await db.select().from(profiles).orderBy(profiles.userId),
      attempts: await db.select().from(attempts).orderBy(attempts.id),
    });
    const before = await snap();
    await results([item("v-hello", "en_th", 3), item("v-name", "en_th", 1), item("v-cat", "th_en", 4), item("v-how", "en_th", 3)]);
    const done = await handleCompleteReview({ sessionId: REVIEW_SESSION, startedAt: new Date(T1.getTime() - 600_000).toISOString(), completedAt: T1.toISOString() }, { db, userId, now: T1 });
    expect(done.status).toBe(200);
    expect(await snap()).toEqual(before);
  });
});
