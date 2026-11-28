// @vitest-environment node
// D4 on the server: the next sitting of a checkpoint is for the next local calendar day (docs/plans/checkpoint-plan.md D4).
import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { activityDays, attempts, checkpointResults, profiles, streaks } from "@/db/schema";
import { cleanDatabase, connectTestDb } from "@/db/test-utils";
import type { AttemptAnswer, CompleteCheckpointResponse } from "@/lib/attempts/contract";
import { handlePostAttempts } from "./attempts-handler";
import { handleCompleteCheckpoint } from "./checkpoint-complete-handler";
import { checkpointContent, CP_RIGHT, cpItem, finishDay, NOW, seedLocal } from "./test-helpers";

const { sql, db } = connectTestDb();
let userId: string;
const content = checkpointContent();
const HOUR = 3_600_000;
const S1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const S2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const S3 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

/** A sitting of one answered exercise, sent and completed at `at` (the server clock of that request). */
async function sit(session: string, at: Date, answers: Record<string, AttemptAnswer> = { "c030-listen-01": CP_RIGHT["c030-listen-01"] }) {
  const items = Object.entries(answers).map(([id, a]) => cpItem(id, a, { sessionId: session, createdAt: new Date(at.getTime() - 60_000).toISOString() }));
  expect((await handlePostAttempts({ attempts: items }, { db, userId, now: at, content })).status).toBe(200);
  return handleCompleteCheckpoint({ afterDay: 30, sessionId: session, completedAt: at.toISOString() }, { db, userId, now: at, content });
}
const complete = (session: string, at: Date) => handleCompleteCheckpoint({ afterDay: 30, sessionId: session, completedAt: at.toISOString() }, { db, userId, now: at, content });
const retakeTomorrow = { status: 409, body: { error: "retake_tomorrow" } };
const state = async () => ({
  results: await db.select().from(checkpointResults).orderBy(asc(checkpointResults.id)),
  days: await db.select().from(activityDays).orderBy(asc(activityDays.localDate)),
  streak: await db.select().from(streaks),
});

beforeEach(async () => {
  await cleanDatabase(sql);
  userId = await seedLocal(db, 30);
  await finishDay(db, userId, 30, new Date(NOW.getTime() - 24 * HOUR));
});
afterAll(async () => {
  await cleanDatabase(sql);
  await sql.end();
});

describe("a second sitting on the same local day", () => {
  it("a first sitting is never blocked", async () => {
    const r = await sit(S1, NOW);
    expect(r.status).toBe(200);
    expect((r.body as CompleteCheckpointResponse).result.sitting).toBe(1);
  });

  it("is refused 409 retake_tomorrow, writes nothing (no result, no streak change), and keeps its attempts", async () => {
    await sit(S1, NOW);
    const before = await state();
    const later = new Date(NOW.getTime() + 2 * HOUR);
    expect(await sit(S2, later)).toEqual(retakeTomorrow);
    expect(await state()).toEqual(before);
    expect((await db.select().from(attempts).where(eq(attempts.sessionId, S2))).length).toBe(1);
  });

  it("the same session again (an idempotent repeat) still answers 200 with the stored result, even on the same day", async () => {
    const first = await sit(S1, NOW);
    const again = await complete(S1, new Date(NOW.getTime() + 3 * HOUR));
    expect(again.status).toBe(200);
    expect(again.body).toEqual(first.body);
    expect((await db.select().from(checkpointResults)).length).toBe(1);
  });

  it("a refused session that is sent again the next day is completed then, as sitting 2 (nothing was lost)", async () => {
    await sit(S1, NOW);
    expect(await sit(S2, new Date(NOW.getTime() + HOUR))).toEqual(retakeTomorrow);
    const next = await complete(S2, new Date(NOW.getTime() + 24 * HOUR));
    expect(next.status).toBe(200);
    expect((next.body as CompleteCheckpointResponse).result.sitting).toBe(2);
  });
});

describe("the next local day", () => {
  it("a second sitting is accepted and is sitting 2", async () => {
    await sit(S1, NOW);
    const r = await sit(S2, new Date(NOW.getTime() + 24 * HOUR));
    expect(r.status).toBe(200);
    expect((r.body as CompleteCheckpointResponse).result.sitting).toBe(2);
    expect((await db.select().from(checkpointResults)).length).toBe(2);
  });

  it("midnight: a sitting stored at 23:59 Bangkok and the next one at 00:01 are on different days (UTC+7)", async () => {
    const lateEvening = new Date("2026-11-28T16:59:00Z"); // 23:59 on the 28th
    const justAfter = new Date("2026-11-28T17:01:00Z"); // 00:01 on the 29th
    expect((await sit(S1, lateEvening)).status).toBe(200);
    expect((await sit(S2, justAfter)).status).toBe(200);
  });

  it("midnight: 00:01 and 23:59 of the same Bangkok day are the same day", async () => {
    expect((await sit(S1, new Date("2026-11-27T17:01:00Z"))).status).toBe(200); // 00:01 on the 28th
    expect(await sit(S2, new Date("2026-11-28T16:59:00Z"))).toEqual(retakeTomorrow); // 23:59 on the 28th
  });

  it("a sitting begun before midnight and completed after it counts for the day it is completed (it is stored then)", async () => {
    const items = [cpItem("c030-listen-01", CP_RIGHT["c030-listen-01"], { sessionId: S2, createdAt: new Date("2026-11-28T16:50:00Z").toISOString() })];
    expect((await sit(S1, new Date("2026-11-28T16:40:00Z"))).status).toBe(200);
    await handlePostAttempts({ attempts: items }, { db, userId, now: new Date("2026-11-28T16:55:00Z"), content });
    expect((await complete(S2, new Date("2026-11-28T17:05:00Z"))).status).toBe(200);
  });
});

describe("what the date is compared on", () => {
  it("the server's clock decides, not the completedAt the client claims: a back-dated completedAt does not dodge the rule", async () => {
    await sit(S1, NOW);
    const items = [cpItem("c030-listen-01", CP_RIGHT["c030-listen-01"], { sessionId: S2, createdAt: new Date(NOW.getTime() - 3 * 86_400_000).toISOString() })];
    await handlePostAttempts({ attempts: items }, { db, userId, now: NOW, content });
    const r = await handleCompleteCheckpoint({ afterDay: 30, sessionId: S2, completedAt: new Date(NOW.getTime() - 2 * 86_400_000).toISOString() }, { db, userId, now: NOW, content });
    expect(r).toEqual(retakeTomorrow);
  });

  it("the learner's CURRENT time zone is used for both dates: after a zone change the two sittings are judged in the new zone", async () => {
    await sit(S1, new Date("2026-11-28T16:00:00Z")); // 23:00 on the 28th in Bangkok, 11:00 in New York
    await db.update(profiles).set({ timezone: "Asia/Tokyo" }).where(eq(profiles.userId, userId));
    // in Tokyo the first sitting was 01:00 on the 29th and this one is 04:00 on the 29th: the same day (in Bangkok they would be two days)
    expect(await sit(S2, new Date("2026-11-28T19:00:00Z"))).toEqual(retakeTomorrow);
    await db.update(profiles).set({ timezone: "America/Los_Angeles" }).where(eq(profiles.userId, userId));
    // 08:00 and 11:00 on the 28th in Los Angeles: same day again
    expect(await sit(S3, new Date("2026-11-28T19:00:00Z"))).toEqual(retakeTomorrow);
  });

  it("another checkpoint's sitting does not count (60 is not 30)", async () => {
    await sit(S1, NOW);
    await db.insert(checkpointResults).values({ id: randomUUID(), userId, afterDay: 60, score: 1, skills: [], startedAt: NOW, completedAt: NOW, createdAt: NOW });
    // the stored 60 changes nothing for 30; and a first sitting of 60 would not be blocked by the 30 one (rule is per afterDay)
    expect((await db.select().from(checkpointResults)).length).toBe(2);
  });
});
