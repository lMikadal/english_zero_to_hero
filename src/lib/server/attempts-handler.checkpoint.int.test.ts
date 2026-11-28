// @vitest-environment node
// POST /api/attempts for checkpoint exercises (docs/plans/checkpoint-plan.md 3.2 items 14-15, 3.4 items 24-28).
import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { attempts, checkpointResults, profiles, progress } from "@/db/schema";
import { cleanDatabase, connectTestDb } from "@/db/test-utils";
import { handlePostAttempts } from "./attempts-handler";
import { ANSWERS, attemptItem, checkpointContent, CP_RIGHT, CP_SESSION, CP_WRONG, cpItem, finishDay, NOW, seedLocal } from "./test-helpers";

const { sql, db } = connectTestDb();
let userId: string;

const post = (items: ReturnType<typeof attemptItem>[], content = checkpointContent(), now = NOW) =>
  handlePostAttempts({ attempts: items }, { db, userId, now, content });
const rows = () => db.select().from(attempts).orderBy(asc(attempts.createdAt), asc(attempts.id));
const statuses = (r: Awaited<ReturnType<typeof post>>) => (r.body as { results: { status: string; reason?: string }[] }).results;

/** day 30 finished and day 31 not started: the checkpoint blocks day 31 */
async function blockedAfterDay30() {
  await db.update(profiles).set({ currentDay: 30 }).where(eq(profiles.userId, userId));
  await finishDay(db, userId, 30, new Date(NOW.getTime() - 3_600_000));
}

beforeEach(async () => {
  await cleanDatabase(sql);
  userId = await seedLocal(db, 30);
});
afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  await cleanDatabase(sql);
  await sql.end();
});

describe("a checkpoint attempt is stored from the checkpoint file (item 24)", () => {
  it("stores day = A, skill, type, tags, source checkpoint, attempt 1, the session, and returns the grade", async () => {
    await blockedAfterDay30();
    const pron = cpItem("c030-pron-01", CP_WRONG["c030-pron-01"]);
    const vocab = cpItem("c030-vocab-01", CP_RIGHT["c030-vocab-01"]);
    const listen = cpItem("c030-listen-01", CP_RIGHT["c030-listen-01"]);
    const res = await post([pron, vocab, listen]);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      results: [
        { id: pron.id, status: "created", correct: false, score: 0, items: [false, false, false] },
        { id: vocab.id, status: "created", correct: true, score: 1, items: [true, true, true, true, true] },
        { id: listen.id, status: "created", correct: true, score: 1 },
      ],
    });
    const stored = Object.fromEntries((await rows()).map((r) => [r.exerciseId, r]));
    expect(stored["c030-pron-01"]).toMatchObject({ userId, day: 30, skill: "pronunciation", exerciseType: "minimal_pair", source: "checkpoint", attemptNo: 1, sessionId: CP_SESSION, correct: false, score: 0 });
    expect(stored["c030-pron-01"].tags).toEqual(["phoneme:ae", "phoneme:eh"]);
    expect(stored["c030-vocab-01"]).toMatchObject({ skill: "vocabulary", exerciseType: "vocab_match", day: 30 });
    expect(stored["c030-vocab-01"].tags).toEqual(expect.arrayContaining(["vocab:v-dog", "vocab:v-cat"]));
    expect(stored["c030-listen-01"]).toMatchObject({ skill: "listening", exerciseType: "listen_choose" });
    expect(stored["c030-listen-01"].answer).toEqual(CP_RIGHT["c030-listen-01"]);
  });

  it("unknown exercise: an id that is not in the file, a day without a file, a broken file", async () => {
    await blockedAfterDay30();
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await post([cpItem("c030-listen-99", CP_RIGHT["c030-listen-01"]), cpItem("c060-pron-01", CP_RIGHT["c030-pron-01"])]);
    expect(statuses(r).map((x) => [x.status, x.reason])).toEqual([["rejected", "unknown_exercise"], ["rejected", "unknown_exercise"]]);
    const broken = await post([cpItem("c030-listen-01", CP_RIGHT["c030-listen-01"])], checkpointContent({ 30: "throws" }));
    expect(statuses(broken)[0]).toMatchObject({ status: "rejected", reason: "unknown_exercise" });
    expect(err).toHaveBeenCalled();
    expect(await rows()).toHaveLength(0);
  });

  it("a wrong kind of answer is kind_mismatch, as for lessons", async () => {
    await blockedAfterDay30();
    expect(statuses(await post([cpItem("c030-listen-01", ANSWERS.arrangeRight)]))[0]).toMatchObject({ status: "rejected", reason: "kind_mismatch" });
  });

  it("a self-rated speaking exercise is stored with score null", async () => {
    await blockedAfterDay30();
    expect(statuses(await post([cpItem("c030-speak-01", CP_RIGHT["c030-speak-01"])]))[0]).toMatchObject({ status: "created", correct: true, score: null });
  });
});

describe("source and attempt number rules (item 25)", () => {
  it("a c… id needs source checkpoint or checkpoint_retake: lesson, drill, retest and practice are invalid", async () => {
    await blockedAfterDay30();
    const items = (["lesson", "drill", "retest", "practice"] as const).map((source) => cpItem("c030-listen-01", CP_RIGHT["c030-listen-01"], { source }));
    expect(statuses(await post(items)).map((r) => [r.status, r.reason])).toEqual(Array(4).fill(["rejected", "invalid"]));
    expect(await rows()).toHaveLength(0);
  });

  it("a c… id with attemptNo 2 is invalid, even for a retryable type", async () => {
    await blockedAfterDay30();
    expect(statuses(await post([cpItem("c030-listen-01", CP_RIGHT["c030-listen-01"], { attemptNo: 2 })]))[0]).toMatchObject({ status: "rejected", reason: "invalid" });
  });

  it("a d… id may not use source checkpoint or checkpoint_retake", async () => {
    await blockedAfterDay30();
    const items = (["checkpoint", "checkpoint_retake"] as const).map((source) => attemptItem("d001-listen-01", ANSWERS.listenChooseRight, { source }));
    expect(statuses(await post(items)).map((r) => [r.status, r.reason])).toEqual([["rejected", "invalid"], ["rejected", "invalid"]]);
    expect(await rows()).toHaveLength(0);
  });

  it("one invalid item does not poison the batch", async () => {
    await blockedAfterDay30();
    const good = cpItem("c030-listen-01", CP_RIGHT["c030-listen-01"]);
    const bad = cpItem("c030-listen-02", CP_RIGHT["c030-listen-02"], { source: "lesson" });
    const out = statuses(await post([bad, good]));
    expect(out.map((r) => r.status)).toEqual(["rejected", "created"]);
  });
});

describe("locking (item 26 and 3.2 items 14-15)", () => {
  it("locked_day when A is beyond what the learner may play", async () => {
    await db.update(profiles).set({ currentDay: 15 }).where(eq(profiles.userId, userId));
    expect(statuses(await post([cpItem("c030-listen-01", CP_RIGHT["c030-listen-01"])]))[0]).toMatchObject({ status: "rejected", reason: "locked_day" });
  });

  it("not_finished when day A is not done (current day is A but the lesson is still open)", async () => {
    expect(statuses(await post([cpItem("c030-listen-01", CP_RIGHT["c030-listen-01"])]))[0]).toMatchObject({ status: "rejected", reason: "not_finished" });
    expect(await rows()).toHaveLength(0);
  });

  it("while the checkpoint blocks, a d031 attempt is locked_day and day 30 and earlier stay open", async () => {
    await blockedAfterDay30();
    const r = statuses(await post([attemptItem("d031-listen-01", { kind: "choice", selected: 0 }), attemptItem("d001-listen-01", ANSWERS.listenChooseRight, { source: "practice" })]));
    expect(r[0]).toMatchObject({ status: "rejected", reason: "locked_day" });
    expect(r[1]).toMatchObject({ status: "created" });
  });

  it("once a result exists the next day is playable again and a d031 attempt is created", async () => {
    await blockedAfterDay30();
    await db.insert(checkpointResults).values({ id: randomUUID(), userId, afterDay: 30, score: 0.1, skills: [], startedAt: NOW, completedAt: NOW });
    expect(statuses(await post([attemptItem("d031-listen-01", { kind: "choice", selected: 0 })]))[0]).toMatchObject({ status: "created" });
  });

  it("without a checkpoint file day 31 is not blocked", async () => {
    await blockedAfterDay30();
    expect(statuses(await post([attemptItem("d031-listen-01", { kind: "choice", selected: 0 })], checkpointContent({})))[0]).toMatchObject({ status: "created" });
  });

  it("a broken checkpoint file does not block either (it is logged)", async () => {
    await blockedAfterDay30();
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(statuses(await post([attemptItem("d031-listen-01", { kind: "choice", selected: 0 })], checkpointContent({ 30: "throws" })))[0]).toMatchObject({ status: "created" });
    expect(err).toHaveBeenCalled();
  });

  it("a learner who already started day 31 (D15) is not locked out of it", async () => {
    await blockedAfterDay30();
    await db.insert(progress).values({ userId, day: 31, status: "in_progress", startedAt: NOW });
    expect(statuses(await post([attemptItem("d031-listen-01", { kind: "choice", selected: 0 })]))[0]).toMatchObject({ status: "created" });
  });

  it("after the checkpoint is passed over the learner can still send retakes for it (A is below the current day)", async () => {
    await blockedAfterDay30();
    await db.insert(checkpointResults).values({ id: randomUUID(), userId, afterDay: 30, score: 0.9, skills: [], startedAt: NOW, completedAt: NOW });
    await db.update(profiles).set({ currentDay: 40 }).where(eq(profiles.userId, userId));
    expect(statuses(await post([cpItem("c030-listen-01", CP_RIGHT["c030-listen-01"])]))[0]).toMatchObject({ status: "created" });
  });
});

describe("the server decides checkpoint or checkpoint_retake (item 27, D11)", () => {
  it("the first answer ever is stored as checkpoint even when the client says checkpoint_retake", async () => {
    await blockedAfterDay30();
    await post([cpItem("c030-listen-01", CP_RIGHT["c030-listen-01"], { source: "checkpoint_retake" })]);
    expect((await rows()).map((r) => r.source)).toEqual(["checkpoint"]);
  });

  it("a later answer to the same exercise (another sitting) is stored as checkpoint_retake even when the client says checkpoint", async () => {
    await blockedAfterDay30();
    await post([cpItem("c030-listen-01", CP_WRONG["c030-listen-01"], { createdAt: new Date(NOW.getTime() - 120_000).toISOString() })]);
    await post([cpItem("c030-listen-01", CP_RIGHT["c030-listen-01"], { sessionId: randomUUID(), source: "checkpoint" })]);
    expect((await rows()).map((r) => r.source)).toEqual(["checkpoint", "checkpoint_retake"]);
  });

  it("two answers of one exercise in one request: one checkpoint and one checkpoint_retake", async () => {
    await blockedAfterDay30();
    await post([cpItem("c030-listen-01", CP_WRONG["c030-listen-01"]), cpItem("c030-listen-01", CP_RIGHT["c030-listen-01"])]);
    expect((await rows()).map((r) => r.source).sort()).toEqual(["checkpoint", "checkpoint_retake"]);
  });

  it("sending the same attempt id again is a duplicate and changes nothing (also when it was stored as a retake)", async () => {
    await blockedAfterDay30();
    const first = cpItem("c030-listen-01", CP_RIGHT["c030-listen-01"]);
    const second = cpItem("c030-listen-01", CP_RIGHT["c030-listen-01"], { sessionId: randomUUID() });
    await post([first]);
    await post([second]);
    const before = await rows();
    expect(statuses(await post([first, second])).map((r) => r.status)).toEqual(["duplicate", "duplicate"]);
    expect(await rows()).toEqual(before);
  });
});

describe("a checkpoint attempt never touches progress (item 28)", () => {
  it("progress and the score of day 30 are unchanged by checkpoint attempts, and no progress row appears for day 31", async () => {
    await blockedAfterDay30();
    const before = await db.select().from(progress).orderBy(asc(progress.day));
    await post(Object.keys(CP_RIGHT).map((id) => cpItem(id, CP_WRONG[id] ?? CP_RIGHT[id])));
    await post([cpItem("c030-listen-01", CP_RIGHT["c030-listen-01"], { sessionId: randomUUID() })]);
    expect(await db.select().from(progress).orderBy(asc(progress.day))).toEqual(before);
    expect(await rows()).toHaveLength(17);
  });
});
