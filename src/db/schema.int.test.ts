// @vitest-environment node
import { randomUUID } from "node:crypto";
import { eq, sql as dsql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  activityDays,
  attempts,
  checkpointResults,
  profiles,
  progress,
  pushSubscriptions,
  recordings,
  reminderSettings,
  srsCards,
  srsReviews,
  streaks,
  user,
} from "./schema";
import { cleanDatabase, connectTestDb, pgErrorCode } from "./test-utils";

const { sql, db } = connectTestDb();
const UNIQUE = "23505";
const FK = "23503";
const CHECK = "23514";
const NOT_NULL = "23502";

async function newUser(id = "u1") {
  await db.insert(user).values({ id, name: "Test", email: `${id}@example.com` });
  return id;
}

function attemptRow(userId: string, over: Partial<typeof attempts.$inferInsert> = {}): typeof attempts.$inferInsert {
  return { userId, exerciseId: "d001-pron-01", day: 1, skill: "pronunciation", exerciseType: "minimal-pair", correct: true, ...over };
}

function reviewRow(userId: string, over: Partial<typeof srsReviews.$inferInsert> = {}): typeof srsReviews.$inferInsert {
  return { userId, vocabId: "w-hello", direction: "en_th", rating: 3, reviewedAt: new Date(), stateAfter: { due: "2026-01-02" }, ...over };
}

/** A review needs its card (FK srs_reviews -> srs_cards): create the card the default reviewRow points at. */
async function newCard(userId: string, vocabId = "w-hello", direction: "en_th" | "th_en" = "en_th") {
  await db.insert(srsCards).values({ userId, vocabId, direction }).onConflictDoNothing();
}

async function indexDefs(table: string): Promise<string[]> {
  const rows = await sql`SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = ${table}`;
  return rows.map((r) => r.indexdef as string);
}

beforeEach(async () => {
  await cleanDatabase(sql);
});
afterAll(async () => {
  await cleanDatabase(sql);
  await sql.end();
});

describe("user", () => {
  it("has Better Auth core defaults and a unique email", async () => {
    await newUser("a");
    const [row] = await db.select().from(user).where(eq(user.id, "a"));
    expect(row.emailVerified).toBe(false);
    expect(row.image).toBeNull();
    expect(row.createdAt).toBeInstanceOf(Date);
    expect(row.updatedAt).toBeInstanceOf(Date);
    const code = await pgErrorCode(db.insert(user).values({ id: "b", name: "x", email: "a@example.com" }));
    expect(code).toBe(UNIQUE);
  });

  it("treats email as case-insensitively unique", async () => {
    await db.insert(user).values({ id: "a", name: "x", email: "Mixed@Example.com" });
    expect(await pgErrorCode(db.insert(user).values({ id: "b", name: "y", email: "mixed@example.com" }))).toBe(UNIQUE);
  });
});

describe("NOT NULL on key columns", () => {
  it("rejects missing required values", async () => {
    const id = await newUser();
    expect(await pgErrorCode(db.execute(dsql`INSERT INTO "user" (id, email) VALUES ('z', 'z@x.com')`))).toBe(NOT_NULL);
    expect(await pgErrorCode(db.execute(dsql`INSERT INTO profiles (user_id) VALUES (${id})`))).toBe(NOT_NULL);
    expect(await pgErrorCode(db.execute(dsql`INSERT INTO attempts (user_id, exercise_id, day, skill, exercise_type) VALUES (${id}, 'e', 1, 'reading', 't')`))).toBe(NOT_NULL);
    expect(await pgErrorCode(db.execute(dsql`INSERT INTO attempts (user_id, day, skill, exercise_type, correct) VALUES (${id}, 1, 'reading', 't', true)`))).toBe(NOT_NULL);
    expect(await pgErrorCode(db.execute(dsql`INSERT INTO recordings (user_id, exercise_id) VALUES (${id}, 'e')`))).toBe(NOT_NULL);
    expect(await pgErrorCode(db.execute(dsql`INSERT INTO srs_cards (user_id, vocab_id) VALUES (${id}, 'w')`))).toBe(NOT_NULL);
  });
});

describe("profiles", () => {
  it("applies defaults and rejects an unknown accent or day out of range", async () => {
    const id = await newUser();
    await db.insert(profiles).values({ userId: id, startDate: "2026-01-01" });
    const [p] = await db.select().from(profiles);
    expect(p.currentDay).toBe(1);
    expect(p.accent).toBe("us");
    expect(p.updatedAt).toBeInstanceOf(Date);
    expect(await pgErrorCode(db.insert(profiles).values({ userId: "nobody", startDate: "2026-01-01" }))).toBe(FK);
    expect(await pgErrorCode(db.update(profiles).set({ currentDay: 0 }))).toBe(CHECK);
    expect(await pgErrorCode(db.update(profiles).set({ currentDay: 366 }))).toBe(CHECK);
    expect(await pgErrorCode(db.execute(dsql`UPDATE profiles SET accent = 'au'`))).toBe(CHECK);
  });
});

describe("progress", () => {
  it("has composite primary key (user_id, day) and defaults status to not_started", async () => {
    const id = await newUser();
    await db.insert(progress).values({ userId: id, day: 1 });
    const [row] = await db.select().from(progress);
    expect(row.status).toBe("not_started");
    expect(row.startedAt).toBeNull();
    expect(row.updatedAt).toBeInstanceOf(Date);
    expect(await pgErrorCode(db.insert(progress).values({ userId: id, day: 1 }))).toBe(UNIQUE);
    await db.insert(progress).values({ userId: id, day: 2, status: "in_progress", startedAt: new Date() });
    await db.insert(progress).values({ userId: id, day: 3, status: "done", completedAt: new Date() });
  });

  it("rejects unknown status and day outside 1..365", async () => {
    const id = await newUser();
    expect(await pgErrorCode(db.execute(dsql`INSERT INTO progress (user_id, day, status) VALUES (${id}, 1, 'finished')`))).toBe(CHECK);
    expect(await pgErrorCode(db.insert(progress).values({ userId: id, day: 0 }))).toBe(CHECK);
    expect(await pgErrorCode(db.insert(progress).values({ userId: id, day: 366 }))).toBe(CHECK);
    await db.insert(progress).values({ userId: id, day: 365 });
  });

  it("requires completed_at when status is done", async () => {
    const id = await newUser();
    expect(await pgErrorCode(db.insert(progress).values({ userId: id, day: 1, status: "done" }))).toBe(CHECK);
  });
});

describe("attempts", () => {
  it("rejects a duplicate id, and an idempotent upsert leaves exactly one row", async () => {
    const id = await newUser();
    const row = { ...attemptRow(id), id: randomUUID(), answer: { picked: "b" } };
    await db.insert(attempts).values(row);
    expect(await pgErrorCode(db.insert(attempts).values(row))).toBe(UNIQUE);
    await db.insert(attempts).values(row).onConflictDoNothing();
    await db.insert(attempts).values(row).onConflictDoNothing();
    const rows = await db.select().from(attempts);
    expect(rows).toHaveLength(1);
    expect(rows[0].answer).toEqual({ picked: "b" });
    expect(rows[0].createdAt).toBeInstanceOf(Date);
  });

  it("generates an id and applies defaults for tags, source and optional columns", async () => {
    const id = await newUser();
    const [row] = await db.insert(attempts).values(attemptRow(id, { correct: false })).returning();
    expect(row.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(row.tags).toEqual([]);
    expect(row.source).toBe("lesson");
    expect(row.durationMs).toBeNull();
    expect(row.sessionId).toBeNull();
  });

  it("stores tags, source, session_id and duration", async () => {
    const id = await newUser();
    const sessionId = randomUUID();
    const [row] = await db
      .insert(attempts)
      .values(attemptRow(id, { tags: ["phoneme:ae", "vocab:v-cat"], source: "retest", sessionId, durationMs: 1200, score: 0.75 }))
      .returning();
    expect(row.tags).toEqual(["phoneme:ae", "vocab:v-cat"]);
    expect(row.source).toBe("retest");
    expect(row.sessionId).toBe(sessionId);
    expect(row.score).toBe(0.75);
  });

  it("defaults attempt_no to 1 and only allows 1 or 2", async () => {
    const id = await newUser();
    const [row] = await db.insert(attempts).values(attemptRow(id)).returning();
    expect(row.attemptNo).toBe(1);
    const [second] = await db.insert(attempts).values(attemptRow(id, { attemptNo: 2 })).returning();
    expect(second.attemptNo).toBe(2);
    expect(await pgErrorCode(db.insert(attempts).values(attemptRow(id, { attemptNo: 0 })))).toBe(CHECK);
    expect(await pgErrorCode(db.insert(attempts).values(attemptRow(id, { attemptNo: 3 })))).toBe(CHECK);
  });

  it("rejects day out of range, unknown skill or source, negative duration", async () => {
    const id = await newUser();
    expect(await pgErrorCode(db.insert(attempts).values(attemptRow(id, { day: 0 })))).toBe(CHECK);
    expect(await pgErrorCode(db.insert(attempts).values(attemptRow(id, { day: 366 })))).toBe(CHECK);
    expect(await pgErrorCode(db.execute(dsql`INSERT INTO attempts (user_id, exercise_id, day, skill, exercise_type, correct) VALUES (${id}, 'e', 1, 'dancing', 't', true)`))).toBe(CHECK);
    expect(await pgErrorCode(db.execute(dsql`INSERT INTO attempts (user_id, exercise_id, day, skill, exercise_type, correct, source) VALUES (${id}, 'e', 1, 'reading', 't', true, 'exam')`))).toBe(CHECK);
    expect(await pgErrorCode(db.insert(attempts).values(attemptRow(id, { durationMs: -1 })))).toBe(CHECK);
    for (const skill of ["pronunciation", "listening", "speaking", "reading", "writing", "vocabulary"] as const) {
      await db.insert(attempts).values(attemptRow(id, { skill }));
    }
    for (const source of ["lesson", "drill", "retest", "checkpoint", "practice", "checkpoint_retake"] as const) {
      await db.insert(attempts).values(attemptRow(id, { source }));
    }
  });

  it("has the expected indexes including a GIN index on tags", async () => {
    const defs = await indexDefs("attempts");
    const has = (re: RegExp) => defs.some((d) => re.test(d));
    expect(has(/\(user_id, created_at\)/)).toBe(true);
    expect(has(/\(user_id, exercise_id\)/)).toBe(true);
    expect(has(/\(user_id, skill, created_at\)/)).toBe(true);
    expect(has(/\(user_id, source, created_at\)/)).toBe(true);
    expect(has(/USING gin \(tags\)/)).toBe(true);
    expect(has(/\(user_id, day\)/)).toBe(true);
    expect(has(/\(user_id, session_id\)/)).toBe(true);
  });

  it("accepts source 'practice' and rejects other values with a CHECK violation", async () => {
    const id = await newUser();
    const [row] = await db.insert(attempts).values(attemptRow(id, { source: "practice" })).returning();
    expect(row.source).toBe("practice");
    expect(await pgErrorCode(db.execute(dsql`INSERT INTO attempts (user_id, exercise_id, day, skill, exercise_type, correct, source) VALUES (${id}, 'e', 1, 'reading', 't', true, 'foo')`))).toBe(CHECK);
  });
});

describe("attempts: checkpoint_retake", () => {
  it("accepts source 'checkpoint_retake' (migration 0005) and still rejects unknown sources", async () => {
    const id = await newUser();
    const [row] = await db.insert(attempts).values(attemptRow(id, { exerciseId: "c030-pron-01", day: 30, source: "checkpoint_retake" })).returning();
    expect(row.source).toBe("checkpoint_retake");
    expect(await pgErrorCode(db.execute(dsql`INSERT INTO attempts (user_id, exercise_id, day, skill, exercise_type, correct, source) VALUES (${id}, 'e', 1, 'reading', 't', true, 'checkpoint_retakes')`))).toBe(CHECK);
  });
});

describe("checkpoint_results", () => {
  const skills = [{ skill: "listening", weight: 100, score: 0.5, answered: 2, total: 4, selfOk: null }] as const;
  const resultRow = (userId: string, over: Partial<typeof checkpointResults.$inferInsert> = {}): typeof checkpointResults.$inferInsert => ({
    id: randomUUID(), userId, afterDay: 30, score: 0.5, skills: [...skills], startedAt: new Date("2026-11-28T10:00:00Z"), completedAt: new Date("2026-11-28T10:30:00Z"), ...over,
  });

  it("stores a result with its skills as jsonb and a created_at default", async () => {
    const id = await newUser();
    const row = resultRow(id);
    await db.insert(checkpointResults).values(row);
    const [stored] = await db.select().from(checkpointResults).where(eq(checkpointResults.id, row.id!));
    expect(stored).toMatchObject({ userId: id, afterDay: 30, score: 0.5, skills: [...skills] });
    expect(stored.completedAt).toEqual(new Date("2026-11-28T10:30:00Z"));
    expect(stored.createdAt).toBeInstanceOf(Date);
  });

  it("the id is the sitting's session id: a second insert of it is a conflict (idempotent)", async () => {
    const id = await newUser();
    const row = resultRow(id);
    await db.insert(checkpointResults).values(row);
    expect(await pgErrorCode(db.insert(checkpointResults).values(row))).toBe(UNIQUE);
    expect(await db.insert(checkpointResults).values(row).onConflictDoNothing({ target: checkpointResults.id }).returning()).toHaveLength(0);
  });

  it("allows several sittings of one checkpoint for one user", async () => {
    const id = await newUser();
    await db.insert(checkpointResults).values([resultRow(id), resultRow(id), resultRow(id, { afterDay: 60 })]);
    expect(await db.select().from(checkpointResults)).toHaveLength(3);
  });

  it("rejects an after_day that is not 30, 60 ... 360 (23514)", async () => {
    const id = await newUser();
    for (const afterDay of [31, 0, 29, 45, 390, 361]) expect(await pgErrorCode(db.insert(checkpointResults).values(resultRow(id, { afterDay }))), String(afterDay)).toBe(CHECK);
    for (const afterDay of [30, 60, 360]) await db.insert(checkpointResults).values(resultRow(id, { afterDay }));
  });

  it("rejects a score outside 0..1 (23514) but accepts the bounds", async () => {
    const id = await newUser();
    for (const score of [1.2, -0.1]) expect(await pgErrorCode(db.insert(checkpointResults).values(resultRow(id, { score })))).toBe(CHECK);
    for (const score of [0, 1]) await db.insert(checkpointResults).values(resultRow(id, { score }));
  });

  it("rejects completed_at before started_at (23514) but accepts equal times", async () => {
    const id = await newUser();
    expect(await pgErrorCode(db.insert(checkpointResults).values(resultRow(id, { completedAt: new Date("2026-11-28T09:59:59Z") })))).toBe(CHECK);
    await db.insert(checkpointResults).values(resultRow(id, { completedAt: new Date("2026-11-28T10:00:00Z") }));
  });

  it("requires every column and a real user, and goes away with the user", async () => {
    const id = await newUser();
    expect(await pgErrorCode(db.insert(checkpointResults).values(resultRow("ghost")))).toBe(FK);
    expect(await pgErrorCode(db.execute(dsql`INSERT INTO checkpoint_results (id, user_id, after_day, score, started_at, completed_at) VALUES (${randomUUID()}, ${id}, 30, 0.5, now(), now())`))).toBe(NOT_NULL);
    await db.insert(checkpointResults).values(resultRow(id));
    await db.delete(user).where(eq(user.id, id));
    expect(await db.select().from(checkpointResults)).toHaveLength(0);
  });

  it("has the (user_id, after_day, completed_at) index", async () => {
    const defs = await indexDefs("checkpoint_results");
    expect(defs.some((d) => /\(user_id, after_day, completed_at\)/.test(d))).toBe(true);
  });
});

describe("srs_cards", () => {
  it("allows one word in different directions but not a duplicate", async () => {
    const id = await newUser();
    await db.insert(srsCards).values({ userId: id, vocabId: "w-hello", direction: "en_th" });
    await db.insert(srsCards).values({ userId: id, vocabId: "w-hello", direction: "th_en" });
    expect(await pgErrorCode(db.insert(srsCards).values({ userId: id, vocabId: "w-hello", direction: "en_th" }))).toBe(UNIQUE);
    const [c] = await db.select().from(srsCards).where(eq(srsCards.direction, "en_th"));
    expect([c.reps, c.lapses, c.state, c.scheduledDays, c.learningSteps, c.elapsedDays]).toEqual([0, 0, 0, 0, 0, 0]);
    expect(c.due).toBeInstanceOf(Date);
    expect(c.updatedAt).toBeInstanceOf(Date);
    expect(c.lastReview).toBeNull();
  });

  it("keeps double precision for stability and difficulty", async () => {
    const id = await newUser();
    const stability = 21.123456789012345;
    const [c] = await db.insert(srsCards).values({ userId: id, vocabId: "w", direction: "speak", stability, difficulty: 5.987654321098765 }).returning();
    expect(c.stability).toBe(stability);
    expect(c.difficulty).toBe(5.987654321098765);
  });

  it("rejects unknown direction, negative counters and state out of range", async () => {
    const id = await newUser();
    expect(await pgErrorCode(db.execute(dsql`INSERT INTO srs_cards (user_id, vocab_id, direction) VALUES (${id}, 'w', 'sideways')`))).toBe(CHECK);
    const base = { userId: id, vocabId: "w", direction: "speak" } as const;
    expect(await pgErrorCode(db.insert(srsCards).values({ ...base, reps: -1 }))).toBe(CHECK);
    expect(await pgErrorCode(db.insert(srsCards).values({ ...base, lapses: -1 }))).toBe(CHECK);
    // the TypeScript type is 0 | 1 | 2 | 3, so a state out of range can only be written with raw SQL (the CHECK still guards it)
    expect(await pgErrorCode(db.execute(dsql`INSERT INTO srs_cards (user_id, vocab_id, direction, state) VALUES (${id}, 'w', 'speak', 4)`))).toBe(CHECK);
    expect(await pgErrorCode(db.insert(srsCards).values({ ...base, scheduledDays: -1 }))).toBe(CHECK);
    expect(await pgErrorCode(db.insert(srsCards).values({ ...base, learningSteps: -1 }))).toBe(CHECK);
    expect(await pgErrorCode(db.insert(srsCards).values({ ...base, elapsedDays: -1 }))).toBe(CHECK);
    expect(await pgErrorCode(db.insert(srsCards).values({ ...base, stability: -0.5 }))).toBe(CHECK);
    expect(await pgErrorCode(db.insert(srsCards).values({ ...base, difficulty: -0.5 }))).toBe(CHECK);
  });

  it("created_at has a default (now), is NOT NULL, and is not changed by updates", async () => {
    const id = await newUser();
    const before = Date.now();
    const [c] = await db.insert(srsCards).values({ userId: id, vocabId: "w", direction: "en_th" }).returning();
    expect(c.createdAt).toBeInstanceOf(Date);
    expect(Math.abs(c.createdAt.getTime() - before)).toBeLessThan(60_000);
    const explicit = new Date("2026-01-01T00:00:00.000Z");
    const [d] = await db.insert(srsCards).values({ userId: id, vocabId: "w2", direction: "en_th", createdAt: explicit }).returning();
    expect(d.createdAt).toEqual(explicit);
    expect(await pgErrorCode(db.execute(dsql`UPDATE srs_cards SET created_at = NULL WHERE vocab_id = 'w'`))).toBe(NOT_NULL);
  });

  it("has an index on (user_id, due)", async () => {
    const rows = await sql`SELECT indexdef FROM pg_indexes WHERE tablename = 'srs_cards'`;
    expect(rows.some((r) => /\(user_id, due\)/.test(r.indexdef))).toBe(true);
  });
});

describe("srs_reviews", () => {
  it("rejects a duplicate id, and an idempotent upsert leaves one row", async () => {
    const id = await newUser();
    await newCard(id);
    const row = { ...reviewRow(id), id: randomUUID() };
    await db.insert(srsReviews).values(row);
    expect(await pgErrorCode(db.insert(srsReviews).values(row))).toBe(UNIQUE);
    await db.insert(srsReviews).values(row).onConflictDoNothing();
    expect(await db.select().from(srsReviews)).toHaveLength(1);
  });

  it("defaults id and stores before/after state and duration", async () => {
    const id = await newUser();
    await newCard(id);
    const [r] = await db.insert(srsReviews).values(reviewRow(id, { stateBefore: { s: 1 }, durationMs: 800 })).returning();
    expect(r.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(r.stateBefore).toEqual({ s: 1 });
    expect(r.stateAfter).toEqual({ due: "2026-01-02" });
    expect(r.createdAt).toBeInstanceOf(Date);
  });

  it("validates rating 1..4, direction, duration and required columns", async () => {
    const id = await newUser();
    await newCard(id);
    expect(await pgErrorCode(db.insert(srsReviews).values(reviewRow(id, { rating: 0 })))).toBe(CHECK);
    expect(await pgErrorCode(db.insert(srsReviews).values(reviewRow(id, { rating: 5 })))).toBe(CHECK);
    expect(await pgErrorCode(db.insert(srsReviews).values(reviewRow(id, { durationMs: -5 })))).toBe(CHECK);
    expect(await pgErrorCode(db.execute(dsql`INSERT INTO srs_reviews (user_id, vocab_id, direction, rating, reviewed_at, state_after) VALUES (${id}, 'w', 'up', 3, now(), '{}')`))).toBe(CHECK);
    expect(await pgErrorCode(db.execute(dsql`INSERT INTO srs_reviews (user_id, vocab_id, direction, rating, reviewed_at) VALUES (${id}, 'w', 'en_th', 3, now())`))).toBe(NOT_NULL);
    for (const rating of [1, 2, 3, 4]) await db.insert(srsReviews).values(reviewRow(id, { rating }));
  });

  it("has its indexes, including (user_id, session_id)", async () => {
    const defs = await indexDefs("srs_reviews");
    expect(defs.some((d) => /\(user_id, reviewed_at\)/.test(d))).toBe(true);
    expect(defs.some((d) => /\(user_id, vocab_id, direction, reviewed_at\)/.test(d))).toBe(true);
    expect(defs.some((d) => /\(user_id, session_id\)/.test(d))).toBe(true);
  });

  it("a review without its card is rejected (FK on user, word and direction), and the direction must be the card's", async () => {
    const id = await newUser();
    expect(await pgErrorCode(db.insert(srsReviews).values(reviewRow(id)))).toBe(FK);
    await newCard(id, "w-hello", "en_th");
    expect(await pgErrorCode(db.insert(srsReviews).values(reviewRow(id, { direction: "th_en" })))).toBe(FK);
    expect(await pgErrorCode(db.insert(srsReviews).values(reviewRow(id, { vocabId: "w-other" })))).toBe(FK);
    await db.insert(srsReviews).values(reviewRow(id));
    await newCard(id, "w-hello", "th_en");
    await db.insert(srsReviews).values(reviewRow(id, { direction: "th_en" }));
  });

  it("another user's card does not satisfy the FK", async () => {
    const a = await newUser("a");
    const b = await newUser("b");
    await newCard(a);
    expect(await pgErrorCode(db.insert(srsReviews).values(reviewRow(b)))).toBe(FK);
  });

  it("deleting a card deletes its reviews; session_id is optional and stored", async () => {
    const id = await newUser();
    await newCard(id);
    const session = randomUUID();
    const [r] = await db.insert(srsReviews).values(reviewRow(id, { sessionId: session })).returning();
    expect(r.sessionId).toBe(session);
    const [noSession] = await db.insert(srsReviews).values(reviewRow(id)).returning();
    expect(noSession.sessionId).toBeNull();
    await db.delete(srsCards).where(eq(srsCards.userId, id));
    expect(await db.select().from(srsReviews)).toHaveLength(0);
  });
});

describe("recordings", () => {
  it("rejects a duplicate id and defaults tags", async () => {
    const id = await newUser();
    const row = { id: randomUUID(), userId: id, exerciseId: "e", objectKey: "u/a.webm" };
    await db.insert(recordings).values(row);
    expect(await pgErrorCode(db.insert(recordings).values(row))).toBe(UNIQUE);
    const [r] = await db.select().from(recordings);
    expect(r.tags).toEqual([]);
    expect(r.day).toBeNull();
  });

  it("validates day 1..365", async () => {
    const id = await newUser();
    const base = { userId: id, exerciseId: "e", objectKey: "k" };
    expect(await pgErrorCode(db.insert(recordings).values({ ...base, day: 0 }))).toBe(CHECK);
    expect(await pgErrorCode(db.insert(recordings).values({ ...base, day: 366 }))).toBe(CHECK);
    await db.insert(recordings).values({ ...base, day: 7, tags: ["phoneme:th"] });
  });
});

describe("streaks", () => {
  it("defaults counters to 0 and rejects negatives", async () => {
    const id = await newUser();
    await db.insert(streaks).values({ userId: id });
    const [s] = await db.select().from(streaks);
    expect([s.current, s.longest, s.freezesLeft]).toEqual([0, 0, 0]);
    expect(s.lastActiveDate).toBeNull();
    expect(s.updatedAt).toBeInstanceOf(Date);
    expect(await pgErrorCode(db.update(streaks).set({ current: -1 }))).toBe(CHECK);
    expect(await pgErrorCode(db.update(streaks).set({ longest: -1 }))).toBe(CHECK);
    expect(await pgErrorCode(db.update(streaks).set({ freezesLeft: -1 }))).toBe(CHECK);
    expect(await pgErrorCode(db.insert(streaks).values({ userId: id }))).toBe(UNIQUE);
  });
});

describe("push_subscriptions", () => {
  it("endpoint is unique", async () => {
    const a = await newUser("a");
    const b = await newUser("b");
    const sub = { userId: a, endpoint: "https://push.example/1", p256dh: "k", auth: "s" };
    await db.insert(pushSubscriptions).values(sub);
    expect(await pgErrorCode(db.insert(pushSubscriptions).values({ ...sub, userId: b }))).toBe(UNIQUE);
  });
});

describe("reminder_settings", () => {
  it("defaults to disabled, 20:00 and no types", async () => {
    const id = await newUser();
    await db.insert(reminderSettings).values({ userId: id });
    const [r] = await db.select().from(reminderSettings);
    expect(r.enabled).toBe(false);
    expect(r.types).toEqual([]);
    expect(r.remindAt).toBe("20:00:00");
    expect(r.updatedAt).toBeInstanceOf(Date);
  });
});

describe("ON DELETE CASCADE", () => {
  it("deleting a user removes rows in every child table and keeps other users' rows", async () => {
    const id = await newUser();
    await newUser("other");
    const seed = async (u: string) => {
      await db.insert(profiles).values({ userId: u, startDate: "2026-01-01" });
      await db.insert(progress).values({ userId: u, day: 1 });
      await db.insert(attempts).values(attemptRow(u));
      await db.insert(srsCards).values({ userId: u, vocabId: "w", direction: "en_th" });
      await db.insert(srsReviews).values(reviewRow(u, { vocabId: "w" }));
      await db.insert(recordings).values({ userId: u, exerciseId: "e", objectKey: `k-${u}` });
      await db.insert(streaks).values({ userId: u });
      await db.insert(pushSubscriptions).values({ userId: u, endpoint: `e-${u}`, p256dh: "p", auth: "a" });
      await db.insert(reminderSettings).values({ userId: u });
    };
    await seed(id);
    await seed("other");

    await db.delete(user).where(eq(user.id, id));

    for (const t of [profiles, progress, attempts, srsCards, srsReviews, recordings, streaks, pushSubscriptions, reminderSettings]) {
      const rows = await db.select().from(t);
      expect(rows).toHaveLength(1);
      expect((rows[0] as { userId: string }).userId).toBe("other");
    }
  });

  it("rejects child rows whose user does not exist", async () => {
    expect(await pgErrorCode(db.insert(attempts).values(attemptRow("ghost")))).toBe(FK);
  });
});

describe("activity_days", () => {
  it("keeps one row per user and local date, defaults source, and cascades with the user", async () => {
    const id = await newUser();
    await db.insert(activityDays).values({ userId: id, localDate: "2026-11-25" });
    await db.insert(activityDays).values({ userId: id, localDate: "2026-11-25" }).onConflictDoNothing();
    expect(await pgErrorCode(db.insert(activityDays).values({ userId: id, localDate: "2026-11-25" }))).toBe(UNIQUE);
    await db.insert(activityDays).values({ userId: id, localDate: "2026-11-26", source: "practice" });
    const rows = await db.select().from(activityDays).orderBy(activityDays.localDate);
    expect(rows.map((r) => [r.localDate, r.source])).toEqual([["2026-11-25", "lesson"], ["2026-11-26", "practice"]]);
    await db.insert(activityDays).values({ userId: id, localDate: "2026-11-28", source: "review" });
    expect((await db.select().from(activityDays).where(eq(activityDays.localDate, "2026-11-28")))[0].source).toBe("review");
    await db.insert(activityDays).values({ userId: id, localDate: "2026-11-29", source: "checkpoint" });
    expect((await db.select().from(activityDays).where(eq(activityDays.localDate, "2026-11-29")))[0].source).toBe("checkpoint");
    expect(await pgErrorCode(db.execute(dsql`INSERT INTO activity_days (user_id, local_date, source) VALUES (${id}, '2026-11-27', 'foo')`))).toBe(CHECK);
    expect(await pgErrorCode(db.execute(dsql`INSERT INTO activity_days (user_id, local_date, source) VALUES (${id}, '2026-11-27', 'srs')`))).toBe(CHECK);
    expect(await pgErrorCode(db.insert(activityDays).values({ userId: "nobody", localDate: "2026-11-25" }))).toBe(FK);
    await db.delete(user).where(eq(user.id, id));
    expect(await db.select().from(activityDays)).toHaveLength(0);
  });
});
