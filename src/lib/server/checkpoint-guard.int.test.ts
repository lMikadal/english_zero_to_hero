// @vitest-environment node
// The main guard of the checkpoint server: no checkpoint attempt or completion changes progress, profiles or the review cards
// (docs/plans/checkpoint-plan.md 3.5 item 34, 3.8).
import { randomUUID } from "node:crypto";
import { asc } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { profiles, progress, srsCards, srsReviews } from "@/db/schema";
import { cleanDatabase, connectTestDb } from "@/db/test-utils";
import { handlePostAttempts } from "./attempts-handler";
import { handleCompleteCheckpoint } from "./checkpoint-complete-handler";
import { checkpointContent, CP_RIGHT, CP_WRONG, cpItem, finishDay, NOW, seedLocal } from "./test-helpers";

const { sql, db } = connectTestDb();
let userId: string;
const content = checkpointContent();

/** every column of every row, so a changed updated_at counts too */
const snapshot = async () => ({
  progress: await db.select().from(progress).orderBy(asc(progress.day)),
  profiles: await db.select().from(profiles).orderBy(asc(profiles.userId)),
  srsCards: await db.select().from(srsCards).orderBy(asc(srsCards.vocabId), asc(srsCards.direction)),
  srsReviews: await db.select().from(srsReviews).orderBy(asc(srsReviews.id)),
});
const ids = Object.keys(CP_RIGHT);

beforeEach(async () => {
  await cleanDatabase(sql);
  userId = await seedLocal(db, 30);
});
afterAll(async () => {
  await cleanDatabase(sql);
  await sql.end();
});

describe("checkpoint requests leave progress, profiles and the review cards byte-identical", () => {
  it("covers attempts of every kind, a retake, and two finished sittings", async () => {
    await finishDay(db, userId, 30, new Date(NOW.getTime() - 3_600_000));
    const before = await snapshot();
    expect(before.progress.length).toBe(1);
    expect(before.srsCards.length).toBeGreaterThan(0);

    const sit = async (session: string, minutesAgo: number, answers: Record<string, unknown>) => {
      const items = ids.map((id, i) => cpItem(id, (answers[id] ?? CP_RIGHT[id]) as never, { sessionId: session, createdAt: new Date(NOW.getTime() - (minutesAgo * 60 - i) * 1000).toISOString() }));
      const r = await handlePostAttempts({ attempts: items }, { db, userId, now: NOW, content });
      expect(r.status).toBe(200);
      const done = await handleCompleteCheckpoint({ afterDay: 30, sessionId: session, completedAt: NOW.toISOString() }, { db, userId, now: NOW, content });
      expect(done.status).toBe(200);
    };
    await sit(randomUUID(), 50, CP_WRONG);
    expect(await snapshot()).toEqual(before);
    await sit(randomUUID(), 20, {}); // the second sitting: every answer is a retake
    expect(await snapshot()).toEqual(before);

    // repeated and rejected requests
    const again = await handleCompleteCheckpoint({ afterDay: 30, sessionId: randomUUID(), completedAt: NOW.toISOString() }, { db, userId, now: NOW, content });
    expect(again.status).toBe(409);
    expect(await snapshot()).toEqual(before);
  });
});
