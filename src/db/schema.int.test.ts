// @vitest-environment node
import { randomUUID } from "node:crypto";
import { eq, sql as dsql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  attempts,
  profiles,
  progress,
  pushSubscriptions,
  recordings,
  reminderSettings,
  srsCards,
  streaks,
  user,
} from "./schema";
import { cleanDatabase, connectTestDb, pgErrorCode } from "./test-utils";

const { sql, db } = connectTestDb();
const UNIQUE = "23505";
const FK = "23503";
const CHECK = "23514";
const BAD_ENUM = "22P02";

async function newUser(id = "u1") {
  await db.insert(user).values({ id, name: "Test", email: `${id}@example.com` });
  return id;
}

beforeEach(async () => {
  await cleanDatabase(sql);
});
afterAll(async () => {
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
});

describe("profiles", () => {
  it("applies defaults and rejects an unknown accent or day out of range", async () => {
    const id = await newUser();
    await db.insert(profiles).values({ userId: id, startDate: "2026-01-01" });
    const [p] = await db.select().from(profiles);
    expect(p.currentDay).toBe(1);
    expect(p.accent).toBe("us");
    expect(await pgErrorCode(db.insert(profiles).values({ userId: "nobody", startDate: "2026-01-01" }))).toBe(FK);
    expect(await pgErrorCode(db.update(profiles).set({ currentDay: 0 }))).toBe(CHECK);
    expect(await pgErrorCode(db.update(profiles).set({ currentDay: 366 }))).toBe(CHECK);
    expect(await pgErrorCode(db.execute(dsql`UPDATE profiles SET accent = 'au'`))).toBe(BAD_ENUM);
  });
});

describe("progress", () => {
  it("has composite primary key (user_id, day) and defaults status to not_started", async () => {
    const id = await newUser();
    await db.insert(progress).values({ userId: id, day: 1 });
    const [row] = await db.select().from(progress);
    expect(row.status).toBe("not_started");
    expect(await pgErrorCode(db.insert(progress).values({ userId: id, day: 1 }))).toBe(UNIQUE);
    await db.insert(progress).values({ userId: id, day: 2, status: "done" });
  });

  it("rejects unknown status and day outside 1..365", async () => {
    const id = await newUser();
    expect(await pgErrorCode(db.execute(dsql`INSERT INTO progress (user_id, day, status) VALUES (${id}, 1, 'finished')`))).toBe(BAD_ENUM);
    expect(await pgErrorCode(db.insert(progress).values({ userId: id, day: 0 }))).toBe(CHECK);
    expect(await pgErrorCode(db.insert(progress).values({ userId: id, day: 366 }))).toBe(CHECK);
    await db.insert(progress).values({ userId: id, day: 365 });
  });
});

describe("attempts", () => {
  it("rejects a duplicate id, and an idempotent upsert leaves exactly one row", async () => {
    const id = await newUser();
    const attemptId = randomUUID();
    const row = { id: attemptId, userId: id, exerciseId: "d001-pron-01", correct: true, answer: { picked: "b" } };
    await db.insert(attempts).values(row);
    expect(await pgErrorCode(db.insert(attempts).values(row))).toBe(UNIQUE);
    await db.insert(attempts).values(row).onConflictDoNothing();
    await db.insert(attempts).values(row).onConflictDoNothing();
    const rows = await db.select().from(attempts);
    expect(rows).toHaveLength(1);
    expect(rows[0].answer).toEqual({ picked: "b" });
    expect(rows[0].createdAt).toBeInstanceOf(Date);
  });

  it("generates an id when the client gives none", async () => {
    const id = await newUser();
    const [row] = await db.insert(attempts).values({ userId: id, exerciseId: "x", correct: false }).returning();
    expect(row.id).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("srs_cards", () => {
  it("allows one word in different directions but not a duplicate", async () => {
    const id = await newUser();
    await db.insert(srsCards).values({ userId: id, vocabId: "w-hello", direction: "en_th" });
    await db.insert(srsCards).values({ userId: id, vocabId: "w-hello", direction: "th_en" });
    expect(await pgErrorCode(db.insert(srsCards).values({ userId: id, vocabId: "w-hello", direction: "en_th" }))).toBe(UNIQUE);
    const [c] = await db.select().from(srsCards).where(eq(srsCards.direction, "en_th"));
    expect([c.reps, c.lapses, c.state]).toEqual([0, 0, 0]);
    expect(c.due).toBeInstanceOf(Date);
    expect(c.lastReview).toBeNull();
  });

  it("rejects unknown direction, negative counters and state out of range", async () => {
    const id = await newUser();
    expect(await pgErrorCode(db.execute(dsql`INSERT INTO srs_cards (user_id, vocab_id, direction) VALUES (${id}, 'w', 'sideways')`))).toBe(BAD_ENUM);
    expect(await pgErrorCode(db.insert(srsCards).values({ userId: id, vocabId: "w", direction: "speak", reps: -1 }))).toBe(CHECK);
    expect(await pgErrorCode(db.insert(srsCards).values({ userId: id, vocabId: "w", direction: "speak", lapses: -1 }))).toBe(CHECK);
    expect(await pgErrorCode(db.insert(srsCards).values({ userId: id, vocabId: "w", direction: "speak", state: 4 }))).toBe(CHECK);
  });

  it("has an index on (user_id, due)", async () => {
    const rows = await sql`SELECT indexdef FROM pg_indexes WHERE tablename = 'srs_cards'`;
    expect(rows.some((r) => /\(user_id, due\)/.test(r.indexdef))).toBe(true);
  });
});

describe("indexes", () => {
  it("attempts has (user_id, created_at) and (user_id, exercise_id)", async () => {
    const rows = await sql`SELECT indexdef FROM pg_indexes WHERE tablename = 'attempts'`;
    const defs = rows.map((r) => r.indexdef as string);
    expect(defs.some((d) => /\(user_id, created_at\)/.test(d))).toBe(true);
    expect(defs.some((d) => /\(user_id, exercise_id\)/.test(d))).toBe(true);
  });
});

describe("recordings", () => {
  it("rejects a duplicate id", async () => {
    const id = await newUser();
    const row = { id: randomUUID(), userId: id, exerciseId: "e", objectKey: "u/a.webm" };
    await db.insert(recordings).values(row);
    expect(await pgErrorCode(db.insert(recordings).values(row))).toBe(UNIQUE);
  });
});

describe("streaks", () => {
  it("defaults counters to 0 and rejects negatives", async () => {
    const id = await newUser();
    await db.insert(streaks).values({ userId: id });
    const [s] = await db.select().from(streaks);
    expect([s.current, s.longest, s.freezesLeft]).toEqual([0, 0, 0]);
    expect(s.lastActiveDate).toBeNull();
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
  it("defaults to disabled with no types", async () => {
    const id = await newUser();
    await db.insert(reminderSettings).values({ userId: id });
    const [r] = await db.select().from(reminderSettings);
    expect(r.enabled).toBe(false);
    expect(r.types).toEqual([]);
    expect(typeof r.remindAt).toBe("string");
  });
});

describe("ON DELETE CASCADE", () => {
  it("deleting a user removes rows in every child table", async () => {
    const id = await newUser();
    await newUser("other");
    await db.insert(profiles).values({ userId: id, startDate: "2026-01-01" });
    await db.insert(progress).values({ userId: id, day: 1 });
    await db.insert(attempts).values({ userId: id, exerciseId: "e", correct: true });
    await db.insert(srsCards).values({ userId: id, vocabId: "w", direction: "en_th" });
    await db.insert(recordings).values({ userId: id, exerciseId: "e", objectKey: "k" });
    await db.insert(streaks).values({ userId: id });
    await db.insert(pushSubscriptions).values({ userId: id, endpoint: "e", p256dh: "p", auth: "a" });
    await db.insert(reminderSettings).values({ userId: id });
    await db.insert(progress).values({ userId: "other", day: 1 });

    await db.delete(user).where(eq(user.id, id));

    for (const t of [profiles, attempts, srsCards, recordings, streaks, pushSubscriptions, reminderSettings]) {
      expect(await db.select().from(t)).toHaveLength(0);
    }
    const left = await db.select().from(progress);
    expect(left).toHaveLength(1);
    expect(left[0].userId).toBe("other");
  });

  it("rejects child rows whose user does not exist", async () => {
    expect(await pgErrorCode(db.insert(attempts).values({ userId: "ghost", exerciseId: "e", correct: true }))).toBe(FK);
  });
});
