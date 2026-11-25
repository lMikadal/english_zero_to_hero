// @vitest-environment node
import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { attempts, progress } from "@/db/schema";
import { cleanDatabase, connectTestDb } from "@/db/test-utils";
import { handlePostAttempts } from "./attempts-handler";
import { ANSWERS, attemptItem, NOW, seedLocal, SESSION } from "./test-helpers";

const { sql, db } = connectTestDb();
let userId: string;

const post = (body: unknown, now = NOW) => handlePostAttempts(body, { db, userId, now });
const batch = (...items: ReturnType<typeof attemptItem>[]) => ({ attempts: items });
const rows = () => db.select().from(attempts).orderBy(asc(attempts.createdAt), asc(attempts.id));

beforeEach(async () => {
  await cleanDatabase(sql);
  userId = await seedLocal(db, 1);
});
afterAll(async () => {
  await cleanDatabase(sql);
  await sql.end();
});

describe("envelope", () => {
  it("400 for a body that is not { attempts: [...] }", async () => {
    for (const bad of [null, "x", {}, { attempts: [] }, { attempts: "no" }]) {
      expect((await post(bad)).status).toBe(400);
    }
    expect((await post({ attempts: Array.from({ length: 51 }, () => 1) })).status).toBe(400);
    expect(await rows()).toHaveLength(0);
  });
});

describe("created attempts", () => {
  it("stores every column from content and the contract, and returns the grade", async () => {
    const it1 = attemptItem("d001-pron-02", ANSWERS.minimalPairOneWrong, { durationMs: 4200, attemptNo: 1 });
    const res = await post(batch(it1));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      results: [{ id: it1.id, status: "created", correct: false, score: 2 / 3, items: [false, true, true] }],
    });
    const [row] = await rows();
    expect(row).toMatchObject({
      id: it1.id,
      userId,
      exerciseId: "d001-pron-02",
      day: 1,
      skill: "pronunciation",
      exerciseType: "minimal_pair",
      correct: false,
      score: 2 / 3,
      answer: ANSWERS.minimalPairOneWrong,
      durationMs: 4200,
      tags: ["phoneme:ae"],
      source: "lesson",
      sessionId: SESSION,
      attemptNo: 1,
    });
    expect(row.createdAt.toISOString()).toBe(it1.createdAt);
  });

  it("returns results in order, one per item, mixing correct, wrong, unknown and invalid", async () => {
    const good = attemptItem("d001-listen-01", ANSWERS.listenChooseRight);
    const bad = attemptItem("d001-listen-01", ANSWERS.listenChooseWrong);
    const unknown = attemptItem("d001-listen-99", ANSWERS.listenChooseRight);
    const invalidId = randomUUID();
    const res = await post({ attempts: [good, { id: invalidId, nonsense: true }, bad, unknown, 42] });
    expect(res.status).toBe(200);
    expect((res.body as { results: unknown[] }).results).toEqual([
      { id: good.id, status: "created", correct: true, score: 1 },
      { id: invalidId, status: "rejected", reason: "invalid" },
      { id: bad.id, status: "created", correct: false, score: 0 },
      { id: unknown.id, status: "rejected", reason: "unknown_exercise" },
      { id: null, status: "rejected", reason: "invalid" },
    ]);
    expect(await rows()).toHaveLength(2);
  });

  it("rejects kind_mismatch and unsupported without storing", async () => {
    const mismatch = attemptItem("d001-listen-01", ANSWERS.arrangeRight);
    const unsupported = attemptItem("d001-pron-01", ANSWERS.selfOk); // phoneme_intro
    const res = await post(batch(mismatch, unsupported));
    expect((res.body as { results: unknown[] }).results).toEqual([
      { id: mismatch.id, status: "rejected", reason: "kind_mismatch" },
      { id: unsupported.id, status: "rejected", reason: "unsupported" },
    ]);
    expect(await rows()).toHaveLength(0);
    expect(await db.select().from(progress)).toHaveLength(0);
  });

  it("tags: pronunciation gets the phoneme and no implicit vocab; others get implicit vocab", async () => {
    const pron = attemptItem("d001-pron-02", ANSWERS.minimalPairRight);
    const dict = attemptItem("d001-listen-02", ANSWERS.dictationRight);
    await post(batch(pron, dict));
    const byId = new Map((await rows()).map((r) => [r.id, r]));
    expect(byId.get(pron.id)!.tags).toEqual(["phoneme:ae"]);
    expect(byId.get(dict.id)!.tags).toEqual(["vocab:v-meet", "vocab:v-nice"]);
    expect(byId.get(dict.id)!.skill).toBe("listening");
  });

  it("a vocabulary exercise gets skill vocabulary and its vocab tags", async () => {
    await seedLocal(db, 3);
    const pairs = Object.fromEntries(["v-where", "v-country", "v-city", "v-sit", "v-big", "v-fish"].map((v) => [v, v]));
    const it1 = attemptItem("d003-write-04", { kind: "match", pairs });
    const res = await post(batch(it1));
    expect((res.body as { results: { status: string; correct?: boolean }[] }).results[0]).toMatchObject({ status: "created", correct: true, score: 1 });
    const [row] = await rows();
    expect(row.skill).toBe("vocabulary");
    expect(row.tags).toEqual(["vocab:v-big", "vocab:v-city", "vocab:v-country", "vocab:v-fish", "vocab:v-sit", "vocab:v-where"]);
  });

  it("self-rated speaking is stored with score null and correct from the rating", async () => {
    const ok = attemptItem("d001-speak-01", ANSWERS.selfOk);
    const unsure = attemptItem("d001-pron-03", ANSWERS.selfUnsure);
    const res = await post(batch(ok, unsure));
    expect((res.body as { results: unknown[] }).results).toEqual([
      { id: ok.id, status: "created", correct: true, score: null },
      { id: unsure.id, status: "created", correct: false, score: null },
    ]);
    const byId = new Map((await rows()).map((r) => [r.id, r]));
    expect(byId.get(ok.id)).toMatchObject({ score: null, correct: true, answer: ANSWERS.selfOk, skill: "speaking" });
    expect(byId.get(unsure.id)).toMatchObject({ score: null, correct: false });
  });

  it("stores attemptNo 2 and rejects it as invalid for a type that is never retried", async () => {
    const retry = attemptItem("d001-listen-01", ANSWERS.listenChooseRight, { attemptNo: 2 });
    const selfRetry = attemptItem("d001-speak-01", ANSWERS.selfOk, { attemptNo: 2 });
    const res = await post(batch(retry, selfRetry));
    expect((res.body as { results: unknown[] }).results).toEqual([
      { id: retry.id, status: "created", correct: true, score: 1 },
      { id: selfRetry.id, status: "rejected", reason: "invalid" },
    ]);
    const all = await rows();
    expect(all).toHaveLength(1);
    expect(all[0].attemptNo).toBe(2);
  });

  it("applies defaults for source and attemptNo when the client omits them", async () => {
    const { source: _s, attemptNo: _a, ...bare } = attemptItem("d001-listen-01", ANSWERS.listenChooseRight);
    await post({ attempts: [bare] });
    expect((await rows())[0]).toMatchObject({ source: "lesson", attemptNo: 1 });
  });

  it("clamps created_at to at most now + 5 minutes", async () => {
    const future = attemptItem("d001-listen-01", ANSWERS.listenChooseRight, { createdAt: "2030-01-01T00:00:00.000Z" });
    const edge = attemptItem("d001-write-01", ANSWERS.arrangeRight, { createdAt: new Date(NOW.getTime() + 60_000).toISOString() });
    await post(batch(future, edge));
    const byId = new Map((await rows()).map((r) => [r.id, r]));
    expect(byId.get(future.id)!.createdAt.toISOString()).toBe(new Date(NOW.getTime() + 5 * 60_000).toISOString());
    expect(byId.get(edge.id)!.createdAt.toISOString()).toBe(edge.createdAt);
  });
});

describe("idempotence", () => {
  it("the same id twice gives one row and 'duplicate' with the stored grade", async () => {
    const it1 = attemptItem("d001-listen-01", ANSWERS.listenChooseWrong);
    await post(batch(it1));
    const again = await post(batch(it1));
    expect(again.body).toEqual({ results: [{ id: it1.id, status: "duplicate", correct: false, score: 0 }] });
    expect(await rows()).toHaveLength(1);
  });

  it("a duplicate id inside one batch is created once, then duplicate", async () => {
    const it1 = attemptItem("d001-listen-01", ANSWERS.listenChooseRight);
    const res = await post(batch(it1, it1));
    expect((res.body as { results: { status: string }[] }).results.map((r) => r.status)).toEqual(["created", "duplicate"]);
    expect(await rows()).toHaveLength(1);
  });

  it("a duplicate id with a different payload returns 'duplicate' and leaves the row untouched", async () => {
    const it1 = attemptItem("d001-listen-01", ANSWERS.listenChooseWrong, { durationMs: 1000 });
    await post(batch(it1));
    const before = (await rows())[0];
    const changed = { ...it1, answer: ANSWERS.listenChooseRight, durationMs: 9999, attemptNo: 2 as const };
    const res = await post(batch(changed), new Date(NOW.getTime() + 3_600_000));
    expect((res.body as { results: { status: string; correct?: boolean }[] }).results[0]).toMatchObject({ status: "duplicate", correct: false, score: 0 });
    expect((await rows())[0]).toEqual(before);
  });

  it("replaying the same batch twice yields identical database state", async () => {
    const items = [
      attemptItem("d001-listen-01", ANSWERS.listenChooseRight),
      attemptItem("d001-pron-02", ANSWERS.minimalPairOneWrong),
      attemptItem("d001-speak-01", ANSWERS.selfOk),
    ];
    await post(batch(...items));
    const snapshot = async () => ({ a: await rows(), p: await db.select().from(progress) });
    const first = await snapshot();
    await post(batch(...items), new Date(NOW.getTime() + 600_000));
    expect(await snapshot()).toEqual(first);
  });

  it("another user's attempt id is a duplicate without leaking its grade", async () => {
    await sql`INSERT INTO "user" (id, name, email) VALUES ('other', 'o', 'o@example.com')`;
    const it1 = attemptItem("d001-listen-01", ANSWERS.listenChooseRight);
    await sql`INSERT INTO profiles (user_id, start_date) VALUES ('other', '2026-11-25')`;
    await handlePostAttempts(batch(it1), { db, userId: "other", now: NOW });
    const res = await post(batch(it1));
    expect(res.body).toEqual({ results: [{ id: it1.id, status: "duplicate" }] });
  });
});

describe("locked days", () => {
  it("rejects an attempt for a day after current_day", async () => {
    const day3 = attemptItem("d003-write-03", { kind: "texts", texts: ["from"] });
    const day1 = attemptItem("d001-listen-01", ANSWERS.listenChooseRight);
    const res = await post(batch(day3, day1));
    expect((res.body as { results: unknown[] }).results).toEqual([
      { id: day3.id, status: "rejected", reason: "locked_day" },
      { id: day1.id, status: "created", correct: true, score: 1 },
    ]);
    expect(await rows()).toHaveLength(1);
    expect((await db.select().from(progress)).map((p) => p.day)).toEqual([1]);
  });

  it("accepts a replay of an earlier day once current_day has moved on", async () => {
    await seedLocal(db, 5);
    const res = await post(batch(attemptItem("d002-listen-01", { kind: "choice", selected: 1 })));
    expect((res.body as { results: { status: string }[] }).results[0].status).toBe("created");
  });
});

describe("progress", () => {
  it("marks the day in_progress with started_at when the first attempt arrives", async () => {
    const it1 = attemptItem("d001-listen-01", ANSWERS.listenChooseRight);
    await post(batch(it1));
    const [p] = await db.select().from(progress);
    expect(p).toMatchObject({ userId, day: 1, status: "in_progress", completedAt: null });
    expect(p.startedAt?.toISOString()).toBe(it1.createdAt);
  });

  it("keeps the first started_at and never downgrades a done day", async () => {
    await post(batch(attemptItem("d001-listen-01", ANSWERS.listenChooseRight)));
    const [first] = await db.select().from(progress);
    await sql`UPDATE progress SET status = 'done', completed_at = ${NOW.toISOString()}, score = 0.9`;
    await post(batch(attemptItem("d001-write-01", ANSWERS.arrangeRight, { attemptNo: 2 })));
    const [after] = await db.select().from(progress).where(eq(progress.day, 1));
    expect(after).toMatchObject({ status: "done", score: 0.9 });
    expect(after.startedAt).toEqual(first.startedAt);
  });
});
