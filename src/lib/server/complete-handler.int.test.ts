// @vitest-environment node
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { attempts, profiles, progress, streaks } from "@/db/schema";
import { cleanDatabase, connectTestDb } from "@/db/test-utils";
import type { CompleteLessonResponse } from "@/lib/attempts/contract";
import { handlePostAttempts } from "./attempts-handler";
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
    for (const bad of [null, {}, req(0), req(366), { ...req(1), extra: 1 }, { ...req(1), sessionId: "x" }, { ...req(1), completedAt: "yesterday" }]) {
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
    const first = ok(await complete(req(1)));
    const rowsBefore = { p: await progressRow(1), s: await streak(), pr: await profile() };
    await send(attemptItem("d001-listen-01", ANSWERS.listenChooseWrong)); // late attempt must not change the score
    const later = new Date(NOW.getTime() + 86_400_000 * 3);
    const second = ok(await complete(req(1, later.toISOString()), later));
    expect(second).toEqual(first);
    expect({ p: await progressRow(1), s: await streak(), pr: await profile() }).toEqual(rowsBefore);
  });

  it("clamps completedAt to now + 5 minutes", async () => {
    const body = ok(await complete(req(1, "2031-01-01T00:00:00.000Z")));
    expect(body.progress.completedAt).toBe(new Date(NOW.getTime() + 5 * 60_000).toISOString());
  });

  it("completing day 1 unlocks day 2", async () => {
    const item = () => attemptItem("d002-listen-01", { kind: "choice", selected: 1 });
    const before = await send(item());
    expect((before.body as { results: { reason?: string }[] }).results[0].reason).toBe("locked_day");
    await complete(req(1));
    const after = await send(item());
    expect((after.body as { results: { status: string }[] }).results[0].status).toBe("created");
  });

  it("current_day never moves back (replay) and is capped at 365", async () => {
    await seedLocal(db, 5);
    expect(ok(await complete(req(1))).currentDay).toBe(5);
    await seedLocal(db, 365);
    expect(ok(await complete(req(365))).currentDay).toBe(365);
    expect((await profile()).currentDay).toBe(365);
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

  it("a late replay of an older local day leaves the streak unchanged", async () => {
    await seedLocal(db, 2);
    const later = new Date(NOW.getTime() + 86_400_000);
    await complete(req(1, later.toISOString()), later);
    const r = ok(await complete(req(2, NOW.toISOString()), later));
    expect(r.streak).toEqual({ current: 1, longest: 1 });
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
