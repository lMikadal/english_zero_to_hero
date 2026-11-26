// @vitest-environment node
// A lesson that lacks a skill: real lessons 1-7 all have all five, so the lesson is stripped through a mock.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanDatabase, connectTestDb } from "@/db/test-utils";
import { handleCompletePractice } from "./practice-complete-handler";
import { finishDay, NOW, PRACTICE_SESSION, seedLocal } from "./test-helpers";

vi.mock("@/lib/content/repo", async (orig) => {
  const real = await orig<typeof import("@/lib/content/repo")>();
  return { ...real, getLesson: (day: number) => {
    const l = real.getLesson(day);
    return l && { ...l, sections: l.sections.filter((s) => s.skill !== "writing") };
  } };
});

const { sql, db } = connectTestDb();
let userId: string;
beforeEach(async () => {
  await cleanDatabase(sql);
  userId = await seedLocal(db, 1);
});
afterAll(async () => {
  await cleanDatabase(sql);
  await sql.end();
});

describe("a skill the lesson does not have", () => {
  it("409 not_replayable, and the whole lesson still works", async () => {
    await finishDay(db, userId, 1);
    const req = (skill: string | null) => ({ kind: "replay", day: 1, skill, sessionId: PRACTICE_SESSION, completedAt: NOW.toISOString() });
    expect(await handleCompletePractice(req("writing"), { db, userId, now: NOW })).toEqual({ status: 409, body: { error: "not_replayable" } });
    expect((await handleCompletePractice(req("reading"), { db, userId, now: NOW })).status).toBe(200);
    expect((await handleCompletePractice(req(null), { db, userId, now: NOW })).status).toBe(200);
  });
});
