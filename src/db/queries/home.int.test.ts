// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { cleanDatabase, connectTestDb } from "@/db/test-utils";
import { handleCompleteLesson } from "@/lib/server/complete-handler";
import { checkpointContent, NOW, seedLocal, SESSION } from "@/lib/server/test-helpers";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { checkpointResults, profiles } from "@/db/schema";
import { getLearnerHome } from "./home";

const { sql, db } = connectTestDb();
let userId: string;

const complete = (day: number, now = NOW, checkpoints?: ReturnType<typeof checkpointContent>) =>
  handleCompleteLesson({ day, sessionId: SESSION, completedAt: new Date(now.getTime() - 60_000).toISOString() }, { db, userId, now, checkpoints });
const DAY = 86_400_000;

beforeEach(async () => {
  await cleanDatabase(sql);
  userId = await seedLocal(db, 1);
});
afterAll(async () => {
  await cleanDatabase(sql);
  await sql.end();
});

describe("getLearnerHome", () => {
  it("on a fresh database: day 1, no streak, not active today, course not complete", async () => {
    expect(await getLearnerHome(db, userId, NOW)).toEqual({
      currentDay: 1,
      streak: { current: 0, longest: 0 },
      activeToday: false,
      courseComplete: false,
      blockingCheckpoint: null,
      checkpointNote: null,
    });
  });

  it("after completing day 1: day 2, streak 1, active today", async () => {
    expect((await complete(1)).status).toBe(200);
    expect(await getLearnerHome(db, userId, NOW)).toEqual({
      currentDay: 2,
      streak: { current: 1, longest: 1 },
      activeToday: true,
      courseComplete: false,
      blockingCheckpoint: null,
      checkpointNote: null,
    });
  });

  it("the next calendar day: streak still alive (1) but not active today yet", async () => {
    await complete(1);
    const home = await getLearnerHome(db, userId, new Date(NOW.getTime() + DAY));
    expect(home).toMatchObject({ currentDay: 2, streak: { current: 1, longest: 1 }, activeToday: false });
  });

  it("two days later the current streak has lapsed to 0 but the longest is kept", async () => {
    await complete(1);
    const home = await getLearnerHome(db, userId, new Date(NOW.getTime() + 2 * DAY));
    expect(home).toMatchObject({ streak: { current: 0, longest: 1 }, activeToday: false });
  });

  it("uses the learner's local date, not UTC (18:30Z is already tomorrow in Bangkok)", async () => {
    await complete(1);
    const home = await getLearnerHome(db, userId, new Date("2026-11-25T18:30:00Z"));
    expect(home.activeToday).toBe(false);
    expect(home.streak.current).toBe(1);
  });

  it("courseComplete once day 365 is done", async () => {
    await sql`UPDATE profiles SET current_day = 365`;
    await sql`INSERT INTO progress (user_id, day, status, completed_at) VALUES (${userId}, 365, 'done', now())`;
    expect(await getLearnerHome(db, userId, NOW)).toMatchObject({ currentDay: 365, courseComplete: true });
  });

  it("day 365 not done yet is not complete", async () => {
    await sql`UPDATE profiles SET current_day = 365`;
    expect(await getLearnerHome(db, userId, NOW)).toMatchObject({ currentDay: 365, courseComplete: false });
  });
});

describe("getLearnerHome: the checkpoint fields", () => {
  const home = (content = checkpointContent(), now = NOW) => getLearnerHome(db, userId, now, content);
  const finish30 = async () => {
    await db.update(profiles).set({ currentDay: 30 }).where(eq(profiles.userId, userId));
    expect((await complete(30, NOW, checkpointContent())).status).toBe(200);
  };
  const result = (score: number) => db.insert(checkpointResults).values({ id: randomUUID(), userId, afterDay: 30, score, skills: [], startedAt: NOW, completedAt: NOW });

  it("after day 30 with a checkpoint file: it blocks, and the note says it is not taken", async () => {
    await finish30();
    expect(await home()).toMatchObject({ currentDay: 31, blockingCheckpoint: 30, checkpointNote: { afterDay: 30, status: "not_taken" } });
  });

  it("after a sitting under 70% it no longer blocks but the note says not passed", async () => {
    await finish30();
    await result(0.5);
    expect(await home()).toMatchObject({ blockingCheckpoint: null, checkpointNote: { afterDay: 30, status: "not_passed" } });
  });

  it("a passed checkpoint gives no note", async () => {
    await finish30();
    await result(0.7);
    expect(await home()).toMatchObject({ blockingCheckpoint: null, checkpointNote: null });
  });

  it("without a checkpoint file there is no block and no note, and before day 30 is done there is no note", async () => {
    await finish30();
    expect(await home(checkpointContent({}))).toMatchObject({ blockingCheckpoint: null, checkpointNote: null });
    await db.update(profiles).set({ currentDay: 5 }).where(eq(profiles.userId, userId));
    expect(await getLearnerHome(db, userId, NOW, checkpointContent())).toMatchObject({ blockingCheckpoint: null });
  });

  it("a learner past day 31 who never sat it (D15) is not blocked, but the note offers it", async () => {
    await finish30();
    await db.update(profiles).set({ currentDay: 40 }).where(eq(profiles.userId, userId));
    expect(await home()).toMatchObject({ blockingCheckpoint: null, checkpointNote: { afterDay: 30, status: "not_taken" } });
  });
});
