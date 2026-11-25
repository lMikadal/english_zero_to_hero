// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { cleanDatabase, connectTestDb } from "@/db/test-utils";
import { handleCompleteLesson } from "@/lib/server/complete-handler";
import { NOW, seedLocal, SESSION } from "@/lib/server/test-helpers";
import { getLearnerHome } from "./home";

const { sql, db } = connectTestDb();
let userId: string;

const complete = (day: number, now = NOW) =>
  handleCompleteLesson({ day, sessionId: SESSION, completedAt: new Date(now.getTime() - 60_000).toISOString() }, { db, userId, now });
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
    });
  });

  it("after completing day 1: day 2, streak 1, active today", async () => {
    expect((await complete(1)).status).toBe(200);
    expect(await getLearnerHome(db, userId, NOW)).toEqual({
      currentDay: 2,
      streak: { current: 1, longest: 1 },
      activeToday: true,
      courseComplete: false,
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
