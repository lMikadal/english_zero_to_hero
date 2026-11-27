// @vitest-environment node
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { attempts, profiles, progress, srsCards, streaks } from "@/db/schema";
import { cleanDatabase, connectTestDb } from "@/db/test-utils";
import type { CompleteLessonResponse } from "@/lib/attempts/contract";
import { handlePostAttempts } from "./attempts-handler";
import { touchStreak } from "@/db/queries/progress";
import { handleCompleteLesson } from "./complete-handler";
import { ANSWERS, attemptItem, NOW, seedLocal, SESSION } from "./test-helpers";

const { sql, db } = connectTestDb();
let userId: string;

const complete = (body: unknown, now = NOW) => handleCompleteLesson(body, { db, userId, now });
const req = (day: number, completedAt = NOW.toISOString()) => ({ day, sessionId: SESSION, completedAt });
const send = (...items: ReturnType<typeof attemptItem>[]) => handlePostAttempts({ attempts: items }, { db, userId, now: NOW });
const ok = (r: Awaited<ReturnType<typeof complete>>) => {
  expect(r.status).toBe(200);
  return r.body as CompleteLessonResponse;
};
const profile = async () => (await db.select().from(profiles).where(eq(profiles.userId, userId)))[0];
const streak = async () => (await db.select().from(streaks).where(eq(streaks.userId, userId)))[0];
const progressRow = async (day: number) => (await db.select().from(progress).where(eq(progress.day, day)))[0];

beforeEach(async () => {
  await cleanDatabase(sql);
  userId = await seedLocal(db, 1);
});
afterAll(async () => {
  await cleanDatabase(sql);
  await sql.end();
});

describe("request checks", () => {
  it("400 for a malformed body", async () => {
    for (const bad of [null, {}, req(0), req(366), req(1, "0000-01-01T00:00:00Z"), req(1, "9999-01-01T00:00:00Z"), { ...req(1), extra: 1 }, { ...req(1), sessionId: "x" }, { ...req(1), completedAt: "yesterday" }]) {
      expect((await complete(bad)).status).toBe(400);
    }
    expect(await db.select().from(progress)).toHaveLength(0);
  });

  it("409 for a locked day and writes nothing", async () => {
    const r = await complete(req(2));
    expect(r.status).toBe(409);
    expect(await db.select().from(progress)).toHaveLength(0);
    expect(await streak()).toBeUndefined();
    expect((await profile()).currentDay).toBe(1);
  });
});

describe("a lesson that does not exist cannot be completed", () => {
  it("409 for day 8 even when current_day allows it (no lesson file), and nothing changes", async () => {
    await seedLocal(db, 8);
    expect((await complete(req(8))).status).toBe(409);
    expect(await db.select().from(progress)).toHaveLength(0);
    expect(await streak()).toBeUndefined();
    expect((await profile()).currentDay).toBe(8);
  });
  it("does NOT require stored attempts: completing day 1 with none is fine", async () => {
    expect((await complete(req(1))).status).toBe(200);
  });
});

describe("completing a lesson", () => {
  it("sets done, completed_at, streak 1 and advances current_day", async () => {
    const at = new Date(NOW.getTime() - 30_000).toISOString();
    await send(attemptItem("d001-listen-01", ANSWERS.listenChooseRight));
    const body = ok(await complete(req(1, at)));
    expect(body).toEqual({
      progress: { day: 1, status: "done", score: 1, completedAt: at },
      streak: { current: 1, longest: 1 },
      currentDay: 2,
    });
    expect(await progressRow(1)).toMatchObject({ status: "done", score: 1, completedAt: new Date(at) });
    expect(await streak()).toMatchObject({ current: 1, longest: 1, lastActiveDate: "2026-11-25" });
    expect((await profile()).currentDay).toBe(2);
  });

  it("score is the mean of the latest first-attempt graded lesson attempt per exercise", async () => {
    const t = (s: number) => new Date(NOW.getTime() - s * 1000).toISOString();
    await send(
      attemptItem("d001-listen-01", ANSWERS.listenChooseRight, { createdAt: t(600) }), // 1
      attemptItem("d001-pron-02", ANSWERS.minimalPairOneWrong, { createdAt: t(500) }), // 2/3
      attemptItem("d001-pron-02", ANSWERS.minimalPairRight, { createdAt: t(100), attemptNo: 2 }), // retry: ignored
      attemptItem("d001-write-01", { kind: "text", text: "wrong" }, { createdAt: t(400) }), // 0, superseded
      attemptItem("d001-write-01", ANSWERS.arrangeRight, { createdAt: t(300) }), // 1 (latest first attempt)
      attemptItem("d001-speak-01", ANSWERS.selfOk, { createdAt: t(200) }), // score null: ignored
      attemptItem("d001-listen-02", ANSWERS.dictationRight, { source: "drill", createdAt: t(150) }), // not a lesson attempt
    );
    const body = ok(await complete(req(1)));
    expect(body.progress.score).toBeCloseTo((1 + 2 / 3 + 1) / 3);
    expect((await progressRow(1)).score).toBeCloseTo((1 + 2 / 3 + 1) / 3);
  });

  it("score is null when there is no graded first attempt", async () => {
    expect(ok(await complete(req(1))).progress.score).toBeNull();
    await seedLocal(db, 1);
    await db.delete(progress);
    await send(attemptItem("d001-speak-01", ANSWERS.selfOk));
    expect(ok(await complete(req(1))).progress.score).toBeNull();
  });

  it("keeps started_at from the first attempt", async () => {
    const it1 = attemptItem("d001-listen-01", ANSWERS.listenChooseRight);
    await send(it1);
    await complete(req(1));
    expect((await progressRow(1)).startedAt?.toISOString()).toBe(it1.createdAt);
  });

  it("a second completion changes nothing and returns the same shape", async () => {
    await send(attemptItem("d001-listen-01", ANSWERS.listenChooseRight));
    const first = ok(await complete(req(1)));
    const rowsBefore = { p: await progressRow(1), s: await streak(), pr: await profile() };
    const later = new Date(NOW.getTime() + 86_400_000 * 3);
    const second = ok(await complete(req(1, later.toISOString()), later));
    expect(second).toEqual(first);
    expect({ p: await progressRow(1), s: await streak(), pr: await profile() }).toEqual(rowsBefore);
  });

  it("an attempt that was created before the completion but syncs after it fixes the lesson score", async () => {
    // two devices / a retried batch: the completion wins the race against its own attempts
    ok(await complete(req(1, new Date(NOW.getTime() - 30_000).toISOString())));
    expect((await progressRow(1)).score).toBeNull();
    await send(attemptItem("d001-listen-01", ANSWERS.listenChooseRight, { createdAt: new Date(NOW.getTime() - 60_000).toISOString() }));
    expect((await progressRow(1))).toMatchObject({ status: "done", score: 1 });
    await send(attemptItem("d001-write-01", { kind: "text", text: "wrong" }, { createdAt: new Date(NOW.getTime() - 50_000).toISOString() }));
    expect((await progressRow(1)).score).toBeCloseTo(0.5);
    // a second completion still reports the corrected score
    expect(ok(await complete(req(1))).progress.score).toBeCloseTo(0.5);
  });

  it("replaying a finished lesson later (attempts created after completed_at) does not rewrite its score", async () => {
    await send(attemptItem("d001-listen-01", ANSWERS.listenChooseRight, { createdAt: new Date(NOW.getTime() - 120_000).toISOString() }));
    ok(await complete(req(1, new Date(NOW.getTime() - 60_000).toISOString())));
    const before = await progressRow(1);
    const later = new Date(NOW.getTime() + 3_600_000);
    await handlePostAttempts(
      { attempts: [attemptItem("d001-write-01", { kind: "text", text: "wrong" }, { createdAt: later.toISOString() })] },
      { db, userId, now: later },
    );
    expect(await progressRow(1)).toEqual(before);
  });

  it("a practice attempt created before completed_at never enters the lesson score", async () => {
    ok(await complete(req(1, new Date(NOW.getTime() - 30_000).toISOString())));
    await send(attemptItem("d001-listen-01", ANSWERS.listenChooseWrong, { source: "practice", createdAt: new Date(NOW.getTime() - 60_000).toISOString() }));
    expect((await progressRow(1)).score).toBeNull();
    await send(attemptItem("d001-write-01", ANSWERS.arrangeRight, { createdAt: new Date(NOW.getTime() - 50_000).toISOString() }));
    await send(attemptItem("d001-listen-02", ANSWERS.dictationRight, { source: "practice", createdAt: new Date(NOW.getTime() - 40_000).toISOString() }));
    expect((await progressRow(1)).score).toBe(1);
  });

  it("recomputing for a done day ignores attempt_no 2, null scores and other sources", async () => {
    ok(await complete(req(1)));
    await send(
      attemptItem("d001-listen-01", ANSWERS.listenChooseWrong),
      attemptItem("d001-listen-01", ANSWERS.listenChooseRight, { attemptNo: 2 }),
      attemptItem("d001-speak-01", ANSWERS.selfOk),
    );
    expect((await progressRow(1)).score).toBe(0);
  });

  it("clamps completedAt to [floor, now]: the future becomes now, the epoch becomes the start of the profile", async () => {
    expect(ok(await complete(req(1, "2031-01-01T00:00:00.000Z"))).progress.completedAt).toBe(NOW.toISOString());
    await db.delete(progress);
    await seedLocal(db, 1);
    expect(ok(await complete(req(1, "1970-01-01T00:00:00.000Z"))).progress.completedAt).toBe("2026-11-24T17:00:00.000Z");
    await db.delete(progress);
    await seedLocal(db, 1);
    expect(ok(await complete(req(1, "1900-01-01T00:00:00.000Z"))).progress.completedAt).toBe("2026-11-24T17:00:00.000Z");
  });

  it("accepts a numeric offset", async () => {
    expect(ok(await complete(req(1, "2026-11-25T16:00:00+07:00"))).progress.completedAt).toBe("2026-11-25T09:00:00.000Z");
  });

  it("started_at is never after completed_at, even when the completion is dated before the first attempt", async () => {
    const attemptAt = new Date(NOW.getTime() - 60_000).toISOString();
    await send(attemptItem("d001-listen-01", ANSWERS.listenChooseRight, { createdAt: attemptAt }));
    const body = ok(await complete(req(1, new Date(NOW.getTime() - 3_600_000).toISOString())));
    const row = await progressRow(1);
    expect(row.startedAt!.getTime()).toBeLessThanOrEqual(row.completedAt!.getTime());
    expect(body.progress.completedAt).toBe(attemptAt);
  });

  it("completing day 1 unlocks day 2", async () => {
    const item = () => attemptItem("d002-listen-01", { kind: "choice", selected: 1 });
    const before = await send(item());
    expect((before.body as { results: { reason?: string }[] }).results[0].reason).toBe("locked_day");
    await complete(req(1));
    const after = await send(item());
    expect((after.body as { results: { status: string }[] }).results[0].status).toBe("created");
  });

  it("current_day never moves back when an earlier day is replayed", async () => {
    await seedLocal(db, 5);
    expect(ok(await complete(req(1))).currentDay).toBe(5);
    expect((await profile()).currentDay).toBe(5);
  });

  it("two concurrent completions of the same day count once", async () => {
    const [a, b] = await Promise.all([complete(req(1)), complete(req(1))]);
    expect(ok(a)).toEqual(ok(b));
    expect(await streak()).toMatchObject({ current: 1, longest: 1 });
    expect((await profile()).currentDay).toBe(2);
  });
});

describe("streak", () => {
  const bangkok = (iso: string) => new Date(iso);

  it("counts two local days across Bangkok midnight and not two lessons in one local day", async () => {
    await seedLocal(db, 3);
    const t1 = bangkok("2026-11-25T16:59:00Z"); // 23:59 on 25 Nov in Bangkok
    const t2 = bangkok("2026-11-25T17:01:00Z"); // 00:01 on 26 Nov
    const t3 = bangkok("2026-11-26T05:00:00Z"); // same local day as t2
    expect(ok(await complete(req(1, t1.toISOString()), t1)).streak).toEqual({ current: 1, longest: 1 });
    expect(ok(await complete(req(2, t2.toISOString()), t2)).streak).toEqual({ current: 2, longest: 2 });
    expect(ok(await complete(req(3, t3.toISOString()), t3)).streak).toEqual({ current: 2, longest: 2 });
    expect(await streak()).toMatchObject({ lastActiveDate: "2026-11-26" });
  });

  it("two lessons in the same local day count as one day", async () => {
    await seedLocal(db, 2);
    ok(await complete(req(1)));
    expect(ok(await complete(req(2, new Date(NOW.getTime() + 60_000).toISOString()), NOW)).streak).toEqual({ current: 1, longest: 1 });
  });

  it("resets after a gap but keeps the longest", async () => {
    await seedLocal(db, 3);
    const day = (n: number) => new Date(NOW.getTime() + n * 86_400_000);
    await complete(req(1, day(0).toISOString()), day(0));
    await complete(req(2, day(1).toISOString()), day(1));
    expect(ok(await complete(req(3, day(4).toISOString()), day(4))).streak).toEqual({ current: 1, longest: 2 });
  });

  it("does not depend on arrival order: a past day that syncs late joins the run", async () => {
    await seedLocal(db, 3);
    const mon = new Date("2026-11-23T05:00:00Z");
    const tue = new Date("2026-11-24T05:00:00Z");
    const wed = new Date("2026-11-25T05:00:00Z");
    await sql`UPDATE profiles SET start_date = '2026-11-20'`;
    expect(ok(await complete(req(1, tue.toISOString()), wed)).streak).toEqual({ current: 1, longest: 1 }); // Tuesday arrives first
    expect(ok(await complete(req(2, mon.toISOString()), wed)).streak).toEqual({ current: 2, longest: 2 }); // Monday syncs on Wednesday
    expect(ok(await complete(req(3, wed.toISOString()), wed)).streak).toEqual({ current: 3, longest: 3 });
    expect((await sql`SELECT local_date::text FROM activity_days ORDER BY 1`).map((r) => r.local_date)).toEqual(["2026-11-23", "2026-11-24", "2026-11-25"]);
  });

  it("a completion dated 1970 does not reset the streak (it is clamped into the window)", async () => {
    await seedLocal(db, 2);
    await sql`UPDATE profiles SET start_date = '2026-11-20'`;
    const day1 = new Date("2026-11-25T05:00:00Z");
    ok(await complete(req(1, day1.toISOString()), day1));
    const r = ok(await complete(req(2, "1970-01-01T00:00:00Z"), day1));
    expect(r.streak.current).toBe(1); // day 2 was clamped to the profile start (Nov 20), not adjacent to Nov 25
    expect(r.streak.longest).toBe(1);
    const again = ok(await complete(req(2, "1970-01-01T00:00:00Z"), day1));
    expect(again.streak).toEqual(r.streak);
  });
});

describe("touchStreak", () => {
  it("is order independent and idempotent", async () => {
    for (const d of ["2026-11-26", "2026-11-24", "2026-11-25", "2026-11-26"]) {
      await db.transaction((tx) => touchStreak(tx, userId, d));
    }
    expect(await db.transaction((tx) => touchStreak(tx, userId, "2026-11-24"))).toEqual({ current: 3, longest: 3 });
    expect(await streak()).toMatchObject({ current: 3, longest: 3, lastActiveDate: "2026-11-26" });
  });
  it("a gap keeps longest and starts a new run", async () => {
    for (const d of ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-10"]) await db.transaction((tx) => touchStreak(tx, userId, d));
    expect(await streak()).toMatchObject({ current: 1, longest: 3, lastActiveDate: "2026-11-10" });
  });
});

describe("attempt rows are untouched by completion", () => {
  it("does not modify attempts", async () => {
    await send(attemptItem("d001-listen-01", ANSWERS.listenChooseRight));
    const before = await db.select().from(attempts);
    await complete(req(1));
    expect(await db.select().from(attempts)).toEqual(before);
  });
});

describe("finishing a lesson creates its review cards (docs/plans/vocab-review-plan.md 2.1)", () => {
  const cardRows = () => db.select().from(srsCards).orderBy(srsCards.vocabId, srsCards.direction);
  const DAY1 = ["v-cat", "v-hello", "v-meet", "v-name", "v-nice"];
  const iso = (c: { due: Date }) => c.due.toISOString();

  it("day 1 gives 10 New cards: en_th due at the next local midnight, th_en one day later (Asia/Bangkok)", async () => {
    ok(await complete(req(1)));
    const rows = await cardRows();
    expect(rows).toHaveLength(10);
    expect(rows.map((c) => c.vocabId)).toEqual(DAY1.flatMap((w) => [w, w]));
    expect(rows.every((c) => c.state === 0 && c.reps === 0 && c.lastReview === null)).toBe(true);
    expect(rows.filter((c) => c.direction === "en_th").map(iso)).toEqual(Array(5).fill("2026-11-25T17:00:00.000Z")); // 00:00 on 26 Nov, Bangkok
    expect(rows.filter((c) => c.direction === "th_en").map(iso)).toEqual(Array(5).fill("2026-11-26T17:00:00.000Z")); // 00:00 on 27 Nov
    expect(rows.every((c) => c.createdAt.getTime() === NOW.getTime())).toBe(true);
  });

  it("the same in another zone (America/Los_Angeles): the next LOCAL midnight", async () => {
    await db.update(profiles).set({ timezone: "America/Los_Angeles" }).where(eq(profiles.userId, userId));
    ok(await complete(req(1))); // 02:00 on 25 Nov in Los Angeles
    const rows = await cardRows();
    expect(rows.filter((c) => c.direction === "en_th").map(iso)).toEqual(Array(5).fill("2026-11-26T08:00:00.000Z"));
    expect(rows.filter((c) => c.direction === "th_en").map(iso)).toEqual(Array(5).fill("2026-11-27T08:00:00.000Z"));
  });

  it("finishing at 23:59 local and at 00:01 local gives different first-review days (the day the lesson was finished counts)", async () => {
    const late = new Date("2026-11-25T16:59:00.000Z"); // 23:59 on 25 Nov, Bangkok
    ok(await complete(req(1, late.toISOString()), late));
    expect((await cardRows()).filter((c) => c.direction === "en_th").map(iso)).toEqual(Array(5).fill("2026-11-25T17:00:00.000Z"));
    await cleanDatabase(sql);
    userId = await seedLocal(db, 1);
    const after = new Date("2026-11-25T17:01:00.000Z"); // 00:01 on 26 Nov
    ok(await complete(req(1, after.toISOString()), after));
    expect((await cardRows()).filter((c) => c.direction === "en_th").map(iso)).toEqual(Array(5).fill("2026-11-26T17:00:00.000Z"));
  });

  it("a second completion creates nothing and changes no card", async () => {
    ok(await complete(req(1)));
    const before = await cardRows();
    const later = new Date(NOW.getTime() + 3 * 86_400_000);
    ok(await complete(req(1, later.toISOString()), later));
    expect(await cardRows()).toEqual(before);
  });

  it("a completion that is refused (locked day, missing lesson file) creates no card", async () => {
    expect((await complete(req(2))).status).toBe(409);
    await seedLocal(db, 8);
    expect((await complete(req(8))).status).toBe(409);
    expect(await cardRows()).toHaveLength(0);
  });

  it("day 2 adds only day 2's words, and the cards of day 1 are not touched", async () => {
    ok(await complete(req(1)));
    const day1 = await cardRows();
    const t2 = new Date(NOW.getTime() + 86_400_000);
    ok(await complete(req(2, t2.toISOString()), t2));
    const all = await cardRows();
    expect(all).toHaveLength(10 + 14); // day 2 teaches 7 words
    for (const c of day1) expect(all).toContainEqual(c);
  });

  it("the response shape does not change (no cards in it)", async () => {
    const body = ok(await complete(req(1)));
    expect(Object.keys(body).sort()).toEqual(["currentDay", "progress", "streak"]);
  });

  it("a failure while creating the cards rolls the whole completion back", async () => {
    // make inserting one of day 1's cards fail, as a broken database would
    await sql`ALTER TABLE srs_cards ADD CONSTRAINT srs_cards_test_block CHECK (vocab_id <> 'v-cat')`;
    try {
      await expect(complete(req(1))).rejects.toThrow();
      expect(await db.select().from(progress)).toHaveLength(0);
      expect((await profile()).currentDay).toBe(1);
      expect(await streak()).toBeUndefined();
    } finally {
      await sql`ALTER TABLE srs_cards DROP CONSTRAINT srs_cards_test_block`;
    }
  });
});
