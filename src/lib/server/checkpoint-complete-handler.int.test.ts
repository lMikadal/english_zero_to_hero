// @vitest-environment node
// POST /api/checkpoints/complete (docs/plans/checkpoint-plan.md 3.5 items 29-35).
import { asc, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { activityDays, attempts, checkpointResults, profiles, progress, streaks, user } from "@/db/schema";
import { cleanDatabase, connectTestDb } from "@/db/test-utils";
import type { AttemptAnswer, CompleteCheckpointResponse } from "@/lib/attempts/contract";
import { handlePostAttempts } from "./attempts-handler";
import { handleCompleteCheckpoint } from "./checkpoint-complete-handler";
import { checkpointContent, CP_RIGHT, CP_WRONG, cpItem, finishDay, NOW, seedLocal } from "./test-helpers";

const { sql, db } = connectTestDb();
let userId: string;
const S1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const S2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const sec = (s: number) => new Date(NOW.getTime() - s * 1000).toISOString();

const complete = (body: unknown, content = checkpointContent(), now = NOW) => handleCompleteCheckpoint(body, { db, userId, now, content });
const req = (over: Record<string, unknown> = {}) => ({ afterDay: 30, sessionId: S1, completedAt: NOW.toISOString(), ...over });
const ok = (r: Awaited<ReturnType<typeof complete>>) => {
  expect(r.status).toBe(200);
  return r.body as CompleteCheckpointResponse;
};
const content = checkpointContent();

/** Sends the answers of one sitting: `answers` maps an exercise id to its answer; item i is created `startSecondsAgo - i` seconds ago. */
async function sit(session: string, answers: Record<string, AttemptAnswer>, startSecondsAgo = 600) {
  const items = Object.entries(answers).map(([id, a], i) => cpItem(id, a, { sessionId: session, createdAt: sec(startSecondsAgo - i) }));
  const r = await handlePostAttempts({ attempts: items }, { db, userId, now: NOW, content });
  expect(r.status).toBe(200);
  return items;
}
const only = (ids: string[], from = CP_RIGHT) => Object.fromEntries(ids.map((id) => [id, from[id]]));

beforeEach(async () => {
  await cleanDatabase(sql);
  userId = await seedLocal(db, 30);
  await finishDay(db, userId, 30, new Date(NOW.getTime() - 7_200_000));
});
afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  await cleanDatabase(sql);
  await sql.end();
});

describe("item 29: what is refused", () => {
  it("400 invalid_body for a body that does not fit the schema", async () => {
    for (const bad of [null, {}, req({ afterDay: 45 }), req({ afterDay: 31 }), req({ sessionId: "x" }), req({ completedAt: "yesterday" }), req({ extra: 1 })]) {
      expect(await complete(bad)).toEqual({ status: 400, body: { error: "invalid_body" } });
    }
  });

  it("409 not_completable without a file, with a broken file (logged), and for a checkpoint day that has no file", async () => {
    await sit(S1, only(["c030-listen-01"]));
    expect(await complete(req(), checkpointContent({}))).toEqual({ status: 409, body: { error: "not_completable" } });
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await complete(req(), checkpointContent({ 30: "throws" }))).toEqual({ status: 409, body: { error: "not_completable" } });
    expect(err).toHaveBeenCalled();
    expect(await complete(req({ afterDay: 60 }))).toEqual({ status: 409, body: { error: "not_completable" } });
  });

  it("409 not_completable when day A is not done", async () => {
    await db.update(progress).set({ status: "in_progress", completedAt: null }).where(eq(progress.day, 30));
    await sit(S1, only(["c030-listen-01"])).catch(() => {});
    expect(await complete(req())).toEqual({ status: 409, body: { error: "not_completable" } });
    expect(await db.select().from(checkpointResults)).toHaveLength(0);
  });

  it("409 not_completable when the sitting has no stored attempt (an empty request cannot unlock the next day), and nothing is written", async () => {
    const before = { streak: await db.select().from(streaks), days: await db.select().from(activityDays) };
    expect(await complete(req())).toEqual({ status: 409, body: { error: "not_completable" } });
    await sit(S2, only(["c030-listen-01"])); // another session's attempt does not count
    expect(await complete(req())).toEqual({ status: 409, body: { error: "not_completable" } });
    expect(await db.select().from(checkpointResults)).toHaveLength(0);
    expect({ streak: await db.select().from(streaks), days: await db.select().from(activityDays) }).toEqual(before);
  });

  it("409 for a session id that belongs to another user's result, or to another checkpoint", async () => {
    await sit(S1, only(["c030-listen-01"]));
    await db.insert(user).values({ id: "other", name: "O", email: "o@example.com" });
    await db.insert(checkpointResults).values({ id: S1, userId: "other", afterDay: 30, score: 1, skills: [], startedAt: NOW, completedAt: NOW });
    expect(await complete(req())).toEqual({ status: 409, body: { error: "not_completable" } });
    await db.delete(checkpointResults);
    await db.insert(checkpointResults).values({ id: S1, userId, afterDay: 60, score: 1, skills: [], startedAt: NOW, completedAt: NOW });
    expect(await complete(req())).toEqual({ status: 409, body: { error: "not_completable" } });
  });
});

describe("item 30: the score is scoreCheckpoint over this sitting's first answers", () => {
  it("weighted score, five skill rows in file order, the self-rated section not scored", async () => {
    await sit(S1, {
      ...only(["c030-pron-01", "c030-pron-02", "c030-pron-03"]), // pronunciation 3/3
      ...only(["c030-listen-01"]), ...only(["c030-listen-02"], CP_WRONG), // listening 1/3 (one right, one wrong, one missing)
      ...only(["c030-speak-01", "c030-speak-03"]), // speaking: ok + unsure
      ...only(["c030-read-01", "c030-read-02", "c030-read-03"]), // reading 3/3
    });
    const body = ok(await complete(req()));
    expect(body.result.score).toBeCloseTo((20 * 1 + 25 * (1 / 3) + 20 * 1) / 100, 12);
    expect(body.result.passed).toBe(false);
    expect(body.result.skills).toEqual([
      { skill: "pronunciation", weight: 20, score: 1, answered: 3, total: 3, selfOk: null },
      { skill: "listening", weight: 25, score: 1 / 3, answered: 2, total: 3, selfOk: null },
      { skill: "speaking", weight: 0, score: null, answered: 2, total: 3, selfOk: 1 },
      { skill: "reading", weight: 20, score: 1, answered: 3, total: 3, selfOk: null },
      { skill: "writing", weight: 35, score: 0, answered: 0, total: 4, selfOk: null },
    ]);
    const [stored] = await db.select().from(checkpointResults);
    expect(stored).toMatchObject({ id: S1, userId, afterDay: 30, score: body.result.score });
    expect(stored.skills).toEqual(body.result.skills);
  });

  it("a perfect sitting scores 1 and passes; exactly the pass mark passes", async () => {
    await sit(S1, CP_RIGHT);
    const body = ok(await complete(req()));
    expect(body.result.score).toBeCloseTo(1, 12);
    expect(body.result).toMatchObject({ passed: true, afterDay: 30, sessionId: S1, sitting: 1 });
    expect(body.result.best).toBeCloseTo(1, 12);
  });

  it("when an exercise was answered twice in the sitting the OLDEST answer counts", async () => {
    const right = cpItem("c030-listen-01", CP_RIGHT["c030-listen-01"], { sessionId: S1, createdAt: sec(100) });
    const wrongEarlier = cpItem("c030-listen-01", CP_WRONG["c030-listen-01"], { sessionId: S1, createdAt: sec(200) });
    await handlePostAttempts({ attempts: [right, wrongEarlier] }, { db, userId, now: NOW, content });
    const body = ok(await complete(req()));
    expect(body.result.skills.find((s) => s.skill === "listening")).toMatchObject({ score: 0, answered: 1 });
  });

  it("attempts of another sitting, lesson attempts and answers kept as retakes of this sitting are handled: only this session counts", async () => {
    await sit(S2, only(["c030-pron-01", "c030-pron-02", "c030-pron-03"])); // an earlier sitting: this one's answers are retakes
    await sit(S1, only(["c030-pron-01"], CP_WRONG), 300);
    const body = ok(await complete(req()));
    expect(body.result.skills[0]).toMatchObject({ skill: "pronunciation", score: 0, answered: 1 });
  });
});

describe("item 31: idempotent", () => {
  it("calling twice answers the stored result and writes one row, without recomputing", async () => {
    await sit(S1, only(["c030-listen-01"]));
    const first = ok(await complete(req()));
    await sit(S1, only(["c030-listen-02", "c030-listen-03"]), 100); // late attempts of the same session do not change a stored result
    const second = ok(await complete(req({ completedAt: sec(5) })));
    expect(second.result).toEqual(first.result);
    expect(await db.select().from(checkpointResults)).toHaveLength(1);
  });

  it("two simultaneous requests write one row and both answer the same result", async () => {
    await sit(S1, CP_RIGHT);
    const [a, b] = await Promise.all([complete(req()), complete(req())]);
    expect(ok(a).result).toEqual(ok(b).result);
    expect(await db.select().from(checkpointResults)).toHaveLength(1);
  });
});

describe("item 32: the times", () => {
  it("started_at is the first attempt of the sitting and completed_at the client's time", async () => {
    await sit(S1, only(["c030-listen-01", "c030-listen-02"]), 600);
    const at = new Date(NOW.getTime() - 60_000).toISOString();
    ok(await complete(req({ completedAt: at })));
    const [row] = await db.select().from(checkpointResults);
    expect(row.startedAt).toEqual(new Date(sec(600)));
    expect(row.completedAt).toEqual(new Date(at));
  });

  it("a completion time in the future is cut to now", async () => {
    await sit(S1, only(["c030-listen-01"]));
    ok(await complete(req({ completedAt: "2026-12-31T00:00:00Z" })));
    expect((await db.select().from(checkpointResults))[0].completedAt).toEqual(NOW);
  });

  it("a completion time before the sitting is raised to the last attempt", async () => {
    await sit(S1, only(["c030-listen-01", "c030-listen-02"]), 600); // last attempt at 599 s ago
    ok(await complete(req({ completedAt: new Date(NOW.getTime() - 3_000_000).toISOString() })));
    const [row] = await db.select().from(checkpointResults);
    expect(row.completedAt).toEqual(new Date(sec(599)));
    expect(row.completedAt.getTime()).toBeGreaterThanOrEqual(row.startedAt.getTime());
  });
});

describe("item 33: the streak", () => {
  it("a sitting counts as activity of its local day, source checkpoint, and answers the streak", async () => {
    await db.delete(activityDays);
    await db.delete(streaks);
    await sit(S1, only(["c030-listen-01"]));
    const body = ok(await complete(req()));
    expect(body.streak).toEqual({ current: 1, longest: 1 });
    expect(await db.select().from(activityDays)).toEqual([{ userId, localDate: "2026-11-25", source: "checkpoint" }]);
  });

  it("a day that already has activity gets no second row and keeps its source", async () => {
    const before = await db.select().from(activityDays);
    await sit(S1, only(["c030-listen-01"]));
    ok(await complete(req()));
    ok(await complete(req()));
    expect(await db.select().from(activityDays).orderBy(asc(activityDays.localDate))).toEqual(before);
  });

  it("a completion that is repeated touches the streak again (a retry after a lost response)", async () => {
    await db.delete(activityDays);
    await db.delete(streaks);
    await sit(S1, only(["c030-listen-01"]));
    ok(await complete(req()));
    await db.delete(activityDays);
    ok(await complete(req()));
    expect(await db.select().from(activityDays)).toHaveLength(1);
  });
});

describe("item 35 and the sitting count", () => {
  it("nextDay is 31 when lesson 31 exists and is playable, null when it has no lesson file", async () => {
    await sit(S1, only(["c030-listen-01"]));
    expect(ok(await complete(req())).nextDay).toBe(31);
    await sit(S2, only(["c030-listen-01"]));
    const noLesson = { ...content, getLesson: () => null };
    expect(ok(await complete(req({ sessionId: S2 }), noLesson)).nextDay).toBeNull();
  });

  it("a second sitting is sitting 2 and best is the best of the two; a worse second sitting keeps best", async () => {
    await sit(S1, CP_RIGHT, 7200);
    const first = ok(await complete(req({ completedAt: sec(3600) })));
    expect(first.result).toMatchObject({ sitting: 1 });
    await sit(S2, only(["c030-pron-01"], CP_WRONG), 1200);
    const second = ok(await complete(req({ sessionId: S2 })));
    expect(second.result.sitting).toBe(2);
    expect(second.result.score).toBe(0);
    expect(second.result.passed).toBe(false);
    expect(second.result.best).toBeCloseTo(1, 12);
    // asking again for the first sitting still gives sitting 1
    expect(ok(await complete(req())).result.sitting).toBe(1);
  });

  it("completedAt in the response is the stored time as an ISO string", async () => {
    await sit(S1, only(["c030-listen-01"]));
    const at = new Date(NOW.getTime() - 60_000).toISOString();
    expect(ok(await complete(req({ completedAt: at }))).result.completedAt).toBe(at);
  });
});

describe("writes", () => {
  it("never creates attempts: only the learner's own attempts are in the table", async () => {
    await sit(S1, only(["c030-listen-01"]));
    const before = await db.select().from(attempts).orderBy(asc(attempts.id));
    ok(await complete(req()));
    expect(await db.select().from(attempts).orderBy(asc(attempts.id))).toEqual(before);
    expect((await db.select().from(profiles))[0].currentDay).toBe(31);
  });
});
