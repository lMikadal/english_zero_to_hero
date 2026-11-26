// @vitest-environment node
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { activityDays } from "@/db/schema";
import { cleanDatabase, connectTestDb } from "@/db/test-utils";
import type { CompletePracticeResponse } from "@/lib/attempts/contract";
import { handlePostAttempts } from "./attempts-handler";
import { handleCompletePractice } from "./practice-complete-handler";
import { ANSWERS, attemptItem, finishDay, NOW, PRACTICE_SESSION, seedLocal } from "./test-helpers";

const { sql, db } = connectTestDb();
let userId: string;

const DAY2 = new Date(NOW.getTime() + 86_400_000);
const body = (over: Record<string, unknown> = {}) => ({ kind: "replay", day: 1, skill: null, sessionId: PRACTICE_SESSION, completedAt: NOW.toISOString(), ...over });
const complete = (b: unknown, now = NOW) => handleCompletePractice(b, { db, userId, now });
const ok = (r: Awaited<ReturnType<typeof complete>>) => {
  expect(r.status).toBe(200);
  return r.body as CompletePracticeResponse;
};
const practice = (exerciseId: string, answer: Parameters<typeof attemptItem>[1], over: Record<string, unknown> = {}) =>
  attemptItem(exerciseId, answer, { source: "practice", sessionId: PRACTICE_SESSION, ...over });
const send = (...items: ReturnType<typeof attemptItem>[]) => handlePostAttempts({ attempts: items }, { db, userId, now: NOW });
const days = () => db.select().from(activityDays).where(eq(activityDays.userId, userId));

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
    for (const bad of [null, {}, body({ kind: "x" }), body({ skill: "vocabulary" }), body({ day: 0 }), { ...body(), extra: 1 }]) {
      expect((await complete(bad)).status).toBe(400);
    }
  });
  it("409 not_replayable when the day is not done, and when the lesson file is missing", async () => {
    expect(await complete(body())).toEqual({ status: 409, body: { error: "not_replayable" } });
    await seedLocal(db, 8);
    expect((await complete(body({ day: 8 }))).status).toBe(409);
    await finishDay(db, userId, 1);
    expect((await complete(body())).status).toBe(200);
  });
});

describe("session score", () => {
  beforeEach(async () => {
    await finishDay(db, userId, 1);
  });
  const t = (s: number) => new Date(NOW.getTime() - s * 1000).toISOString();

  it("is the mean of this session's first graded practice attempts only", async () => {
    await send(
      practice("d001-listen-01", ANSWERS.listenChooseRight, { createdAt: t(300) }), // 1
      practice("d001-pron-02", ANSWERS.minimalPairOneWrong, { createdAt: t(290) }), // 2/3
      practice("d001-pron-02", ANSWERS.minimalPairRight, { createdAt: t(100), attemptNo: 2 }), // retry: ignored
      practice("d001-speak-01", ANSWERS.selfOk, { createdAt: t(280) }), // null score: ignored
      practice("d001-write-01", ANSWERS.arrangeRight, { createdAt: t(270), sessionId: "33333333-3333-4333-8333-333333333333" }), // other session
      attemptItem("d001-write-01", { kind: "text", text: "wrong" }, { createdAt: t(260) }), // lesson source
    );
    const res = ok(await complete(body()));
    expect(res.session).toEqual({ sessionId: PRACTICE_SESSION, day: 1, skill: null, score: expect.closeTo((1 + 2 / 3) / 2), graded: 2 });
  });

  it("is null with graded 0 when the session has no scored item", async () => {
    await send(practice("d001-speak-01", ANSWERS.selfOk));
    expect(ok(await complete(body())).session).toMatchObject({ score: null, graded: 0 });
    expect(ok(await complete(body({ sessionId: "44444444-4444-4444-8444-444444444444" }))).session).toMatchObject({ score: null, graded: 0 });
  });

  it("a single-skill session counts only that skill's exercises", async () => {
    await send(practice("d001-listen-01", ANSWERS.listenChooseRight), practice("d001-pron-02", ANSWERS.minimalPairOneWrong));
    expect(ok(await complete(body({ skill: "listening" }))).session).toMatchObject({ skill: "listening", score: 1, graded: 1 });
  });

  it("reports the stored lesson score, read only", async () => {
    expect(ok(await complete(body())).lessonScore).toBeNull();
  });
});

describe("streak", () => {
  beforeEach(async () => {
    await finishDay(db, userId, 1); // activity 2026-11-25 (source lesson), streak 1
  });

  it("whole lesson on a new day: writes activity_days(source=practice) and extends the streak", async () => {
    const res = ok(await complete(body({ completedAt: DAY2.toISOString() }), DAY2));
    expect(res.countedForStreak).toBe(true);
    expect(res.streak).toEqual({ current: 2, longest: 2 });
    expect((await days()).find((d) => d.localDate === "2026-11-26")?.source).toBe("practice");
  });

  it("whole lesson on a day that already has activity: no new row, source kept, streak unchanged", async () => {
    const res = ok(await complete(body()));
    expect(res.streak).toEqual({ current: 1, longest: 1 });
    expect(res.countedForStreak).toBe(true);
    const rows = await days();
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe("lesson");
  });

  it("a single skill never writes a day and reports countedForStreak false", async () => {
    const res = ok(await complete(body({ skill: "listening", completedAt: DAY2.toISOString() }), DAY2));
    expect(res.countedForStreak).toBe(false);
    expect(res.streak).toEqual({ current: 1, longest: 1 });
    expect(await days()).toHaveLength(1);
  });

  it("the same session again returns the same result and adds no second day", async () => {
    const first = ok(await complete(body({ completedAt: DAY2.toISOString() }), DAY2));
    const later = new Date(DAY2.getTime() + 3_600_000);
    const second = ok(await complete(body({ completedAt: DAY2.toISOString() }), later));
    expect(second).toEqual(first);
    expect(await days()).toHaveLength(2);
    expect(second.streak).toEqual({ current: 2, longest: 2 });
  });

  it("two identical completions at once do not error and count once", async () => {
    const b = body({ completedAt: DAY2.toISOString() });
    const [a, c] = await Promise.all([complete(b, DAY2), complete(b, DAY2)]);
    expect(ok(a)).toEqual(ok(c));
    expect(await days()).toHaveLength(2);
    expect(ok(a).streak).toEqual({ current: 2, longest: 2 });
  });

  it("completion without any attempt still counts a whole-lesson replay (plan 3.4 item 23)", async () => {
    expect(ok(await complete(body({ completedAt: DAY2.toISOString() }), DAY2))).toMatchObject({ session: { score: null, graded: 0 }, countedForStreak: true });
  });
});
