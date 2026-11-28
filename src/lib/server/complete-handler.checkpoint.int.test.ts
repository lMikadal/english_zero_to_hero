// @vitest-environment node
// POST /api/lessons/complete and the checkpoint gate (docs/plans/checkpoint-plan.md 3.2 items 14-16, PR 3).
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkpointResults, profiles, progress } from "@/db/schema";
import { cleanDatabase, connectTestDb } from "@/db/test-utils";
import { handleCompleteLesson } from "./complete-handler";
import { checkpointContent, NOW, seedLocal, SESSION } from "./test-helpers";

const { sql, db } = connectTestDb();
let userId: string;

const complete = (day: number, checkpoints = checkpointContent(), now = NOW) =>
  handleCompleteLesson({ day, sessionId: SESSION, completedAt: new Date(now.getTime() - 60_000).toISOString() }, { db, userId, now, checkpoints });
const body = (r: Awaited<ReturnType<typeof complete>>) => r.body as { currentDay?: number; pendingCheckpoint?: number | null; error?: string };

beforeEach(async () => {
  await cleanDatabase(sql);
  userId = await seedLocal(db, 30);
});
afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  await cleanDatabase(sql);
  await sql.end();
});

describe("finishing the day before a checkpoint", () => {
  it("finishing day 30 answers pendingCheckpoint 30 and moves the learner to day 31", async () => {
    const r = await complete(30);
    expect(r.status).toBe(200);
    expect(body(r)).toMatchObject({ currentDay: 31, pendingCheckpoint: 30 });
  });

  it("finishing day 30 again (already done) still reports the checkpoint that blocks day 31", async () => {
    await complete(30);
    expect(body(await complete(30))).toMatchObject({ currentDay: 31, pendingCheckpoint: 30 });
  });

  it("day 31 cannot be completed while the checkpoint blocks it: 409 locked_day, nothing written", async () => {
    await complete(30);
    const r = await complete(31);
    expect(r).toEqual({ status: 409, body: { error: "locked_day" } });
    expect(await db.select().from(progress).where(eq(progress.day, 31))).toHaveLength(0);
    expect((await db.select().from(profiles))[0].currentDay).toBe(31);
  });

  it("a result of any score unblocks day 31", async () => {
    await complete(30);
    await db.insert(checkpointResults).values({ id: randomUUID(), userId, afterDay: 30, score: 0, skills: [], startedAt: NOW, completedAt: NOW });
    const r = await complete(31);
    expect(r.status).toBe(200);
    expect(body(r)).toMatchObject({ currentDay: 32, pendingCheckpoint: null });
  });

  it("without a checkpoint file: pendingCheckpoint null and day 31 completes", async () => {
    expect(body(await complete(30, checkpointContent({})))).toMatchObject({ currentDay: 31, pendingCheckpoint: null });
    expect((await complete(31, checkpointContent({}))).status).toBe(200);
  });

  it("a broken checkpoint file does not block (and is logged)", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const broken = checkpointContent({ 30: "throws" });
    expect(body(await complete(30, broken)).pendingCheckpoint).toBeNull();
    expect((await complete(31, broken)).status).toBe(200);
    expect(err).toHaveBeenCalled();
  });

  it("an ordinary day reports pendingCheckpoint null", async () => {
    await db.update(profiles).set({ currentDay: 5 }).where(eq(profiles.userId, userId));
    expect(body(await complete(5))).toMatchObject({ currentDay: 6, pendingCheckpoint: null });
  });

  it("a learner who already started day 31 (D15) is not blocked: day 31 completes", async () => {
    await complete(30);
    await db.insert(progress).values({ userId, day: 31, status: "in_progress", startedAt: NOW });
    expect((await complete(31)).status).toBe(200);
  });
});
