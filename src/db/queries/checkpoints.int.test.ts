// @vitest-environment node
import { randomUUID } from "node:crypto";
import { sql as dsql } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanDatabase, connectTestDb } from "@/db/test-utils";
import { attempts, checkpointResults, progress, user, type AttemptSource } from "@/db/schema";
import type { Checkpoint } from "@/lib/content/checkpoint-schema";
import { checkpointFixture } from "@/lib/answers/test-content";
import { seedLocal } from "@/lib/server/test-helpers";
import {
  findOpenSitting,
  getCheckpointGate,
  getCheckpointOverview,
  getCheckpointResult,
  hasEarlierAnswer,
  insertCheckpointResult,
  listCheckpointResults,
  practisedSince,
  sittingRows,
} from "./checkpoints";

const { sql, db } = connectTestDb();
let userId: string;

const NOW = new Date("2026-11-28T12:00:00.000Z");
const HOUR = 3_600_000;
const at = (msBeforeNow: number) => new Date(NOW.getTime() - msBeforeNow);
const withFile = (...days: number[]) => ({ getCheckpoint: (d: number): Checkpoint | null => (days.includes(d) ? { ...checkpointFixture, afterDay: d } : null) });

async function attempt(over: Partial<typeof attempts.$inferInsert> & { exerciseId: string; sessionId?: string | null; user?: string }) {
  const { user, ...rest } = over;
  const row = { id: randomUUID(), userId: user ?? userId, day: 30, skill: "listening" as const, exerciseType: "listen_choose", correct: true, score: 1, source: "checkpoint" as AttemptSource, createdAt: at(0), ...rest };
  await db.insert(attempts).values(row);
  return row;
}
async function result(over: Partial<typeof checkpointResults.$inferInsert> = {}) {
  const row = { id: randomUUID(), userId, afterDay: 30, score: 0.5, skills: [], startedAt: at(HOUR), completedAt: at(0), ...over };
  await db.insert(checkpointResults).values(row);
  return row;
}
const otherUser = () => db.insert(user).values({ id: "other", name: "Other", email: "other@example.com" });
const doneDay = (day: number) => db.insert(progress).values({ userId, day, status: "done", score: 1, startedAt: at(HOUR), completedAt: at(0) });

beforeEach(async () => {
  await cleanDatabase(sql);
  userId = await seedLocal(db, 31);
});
afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  await cleanDatabase(sql);
  await sql.end();
});

describe("getCheckpointGate", () => {
  it("blocks day 31 while the checkpoint file exists and nothing is taken: playableDay is 30", async () => {
    expect(await getCheckpointGate(db, userId, { currentDay: 31 }, withFile(30))).toEqual({ blocking: 30, playableDay: 30 });
  });

  it("does not block once a result exists, whatever the score", async () => {
    await result({ score: 0 });
    expect(await getCheckpointGate(db, userId, { currentDay: 31 }, withFile(30))).toEqual({ blocking: null, playableDay: 31 });
  });

  it("does not block a learner who already started day 31 (D15), in progress or done", async () => {
    await db.insert(progress).values({ userId, day: 31, status: "in_progress", startedAt: at(HOUR) });
    expect(await getCheckpointGate(db, userId, { currentDay: 31 }, withFile(30))).toEqual({ blocking: null, playableDay: 31 });
  });

  it("another user's result or a result of another checkpoint does not unblock", async () => {
    await otherUser();
    await result({ userId: "other" });
    expect(await getCheckpointGate(db, userId, { currentDay: 31 }, withFile(30))).toMatchObject({ blocking: 30 });
    await result({ afterDay: 60 });
    expect(await getCheckpointGate(db, userId, { currentDay: 31 }, withFile(30))).toMatchObject({ blocking: 30 });
    expect(await getCheckpointGate(db, userId, { currentDay: 61 }, withFile(60))).toEqual({ blocking: null, playableDay: 61 });
  });

  it("a progress row of another day does not count as started", async () => {
    await db.insert(progress).values({ userId, day: 30, status: "done", completedAt: at(0) });
    expect(await getCheckpointGate(db, userId, { currentDay: 31 }, withFile(30))).toMatchObject({ blocking: 30 });
  });

  it("does not block without a file, and a broken file logs an error and does not block (plan 3.2 item 16)", async () => {
    expect(await getCheckpointGate(db, userId, { currentDay: 31 }, withFile())).toEqual({ blocking: null, playableDay: 31 });
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const broken = { getCheckpoint: () => { throw new Error("bad json"); } };
    expect(await getCheckpointGate(db, userId, { currentDay: 31 }, broken)).toEqual({ blocking: null, playableDay: 31 });
    expect(err).toHaveBeenCalled();
  });

  it("reads neither content nor the database unless currentDay - 1 is a checkpoint day", async () => {
    const getCheckpoint = vi.fn(() => checkpointFixture);
    const guarded = new Proxy(db, { get() { throw new Error("the database must not be touched"); } }) as typeof db;
    for (const currentDay of [1, 2, 30, 32, 60, 365]) {
      expect(await getCheckpointGate(guarded, userId, { currentDay }, { getCheckpoint })).toEqual({ blocking: null, playableDay: currentDay });
    }
    expect(getCheckpoint).not.toHaveBeenCalled();
  });

  it("handles the last checkpoint: day 361 blocks until day 360's checkpoint is taken", async () => {
    expect(await getCheckpointGate(db, userId, { currentDay: 361 }, withFile(360))).toEqual({ blocking: 360, playableDay: 360 });
  });
});

describe("insertCheckpointResult / getCheckpointResult / listCheckpointResults", () => {
  const row = (over: Partial<Parameters<typeof insertCheckpointResult>[1]> = {}) => ({ id: randomUUID(), userId, afterDay: 30, score: 0.8, skills: [], startedAt: at(HOUR), completedAt: at(0), ...over });

  it("inserts once: true the first time, false for the same id, and the stored row is not changed", async () => {
    const r = row();
    expect(await insertCheckpointResult(db, r)).toBe(true);
    expect(await insertCheckpointResult(db, { ...r, score: 0.1 })).toBe(false);
    expect((await getCheckpointResult(db, userId, r.id))?.score).toBe(0.8);
  });

  it("a session id that already belongs to another user is not inserted and not readable by this user", async () => {
    await otherUser();
    const r = row({ userId: "other" });
    await insertCheckpointResult(db, r);
    expect(await insertCheckpointResult(db, { ...r, userId })).toBe(false);
    expect(await getCheckpointResult(db, userId, r.id)).toBeUndefined();
  });

  it("getCheckpointResult returns the frozen row with its skills", async () => {
    const skills = [{ skill: "listening" as const, weight: 100, score: 0.8, answered: 4, total: 5, selfOk: null }];
    const r = row({ skills });
    await insertCheckpointResult(db, r);
    expect(await getCheckpointResult(db, userId, r.id)).toEqual({ id: r.id, afterDay: 30, score: 0.8, skills, startedAt: r.startedAt, completedAt: r.completedAt });
    expect(await getCheckpointResult(db, userId, randomUUID())).toBeUndefined();
  });

  it("lists every sitting of the user, oldest first, optionally for one afterDay", async () => {
    const a = row({ afterDay: 30, completedAt: at(3 * HOUR), startedAt: at(4 * HOUR) });
    const b = row({ afterDay: 60, completedAt: at(2 * HOUR), startedAt: at(3 * HOUR) });
    const c = row({ afterDay: 30, completedAt: at(HOUR), startedAt: at(2 * HOUR), score: 0.9 });
    for (const r of [c, a, b]) await insertCheckpointResult(db, r);
    expect((await listCheckpointResults(db, userId)).map((r) => r.id)).toEqual([a.id, b.id, c.id]);
    expect((await listCheckpointResults(db, userId, 30)).map((r) => r.id)).toEqual([a.id, c.id]);
    expect(await listCheckpointResults(db, userId, 90)).toEqual([]);
    expect((await listCheckpointResults(db, userId))[2]).toEqual({ id: c.id, afterDay: 30, score: 0.9, skills: [], startedAt: c.startedAt, completedAt: c.completedAt });
  });

  it("does not list another user's results", async () => {
    await otherUser();
    await insertCheckpointResult(db, row({ userId: "other" }));
    expect(await listCheckpointResults(db, userId)).toEqual([]);
  });
});

describe("sittingRows", () => {
  const S = randomUUID();
  const ids = ["c030-listen-01", "c030-listen-02", "c030-listen-03"];

  it("returns the first-try rows of this session, both checkpoint sources, for the given exercises only", async () => {
    const a = await attempt({ exerciseId: ids[0], sessionId: S, score: 1, correct: true, createdAt: at(3000) });
    const b = await attempt({ exerciseId: ids[1], sessionId: S, source: "checkpoint_retake", score: 0.5, correct: false, createdAt: at(2000) });
    await attempt({ exerciseId: "c030-listen-04", sessionId: S, createdAt: at(1000) }); // not asked for
    await attempt({ exerciseId: ids[0], sessionId: randomUUID() }); // another session
    await attempt({ exerciseId: ids[0], sessionId: S, source: "lesson" }); // not a checkpoint source
    await attempt({ exerciseId: ids[2], sessionId: S, attemptNo: 2 }); // not a first try
    await attempt({ exerciseId: "c060-pron-01", sessionId: S, day: 60 }); // another checkpoint day
    const rows = await sittingRows(db, userId, 30, S, ids);
    expect(rows).toEqual([
      { id: a.id, exerciseId: ids[0], score: 1, correct: true, createdAt: a.createdAt },
      { id: b.id, exerciseId: ids[1], score: 0.5, correct: false, createdAt: b.createdAt },
    ]);
  });

  it("is empty for no exercise ids and for another user's session", async () => {
    await attempt({ exerciseId: ids[0], sessionId: S });
    expect(await sittingRows(db, userId, 30, S, [])).toEqual([]);
    await otherUser();
    expect(await sittingRows(db, "other", 30, S, ids)).toEqual([]);
  });

  it("orders by createdAt then id (a sitting has at most one row per exercise: the database allows no second one)", async () => {
    const late = await attempt({ exerciseId: ids[0], sessionId: S, createdAt: at(1000) });
    const early = await attempt({ exerciseId: ids[1], sessionId: S, createdAt: at(5000) });
    expect((await sittingRows(db, userId, 30, S, ids)).map((r) => r.id)).toEqual([early.id, late.id]);
  });
});

describe("findOpenSitting (D8: resume within 24 hours of the first answer)", () => {
  const S = randomUUID();

  it("is null when the learner has no checkpoint attempt", async () => {
    expect(await findOpenSitting(db, userId, 30, NOW)).toBeNull();
  });

  it("returns the session and the exercises answered so far, in the order they were answered", async () => {
    await attempt({ exerciseId: "c030-listen-02", sessionId: S, createdAt: at(2 * HOUR) });
    await attempt({ exerciseId: "c030-pron-01", sessionId: S, createdAt: at(HOUR) });
    await attempt({ exerciseId: "c030-pron-02", sessionId: S, source: "checkpoint_retake", createdAt: at(HOUR / 2) });
    expect(await findOpenSitting(db, userId, 30, NOW)).toEqual({ sessionId: S, answered: ["c030-listen-02", "c030-pron-01", "c030-pron-02"] });
  });

  it("the first answer exactly 24 hours ago can still resume; one millisecond more cannot", async () => {
    await attempt({ exerciseId: "c030-pron-01", sessionId: S, createdAt: at(24 * HOUR) });
    expect(await findOpenSitting(db, userId, 30, NOW)).toEqual({ sessionId: S, answered: ["c030-pron-01"] });
    expect(await findOpenSitting(db, userId, 30, new Date(NOW.getTime() + 1))).toBeNull();
  });

  it("the 24 hours count from the FIRST answer, not the last", async () => {
    await attempt({ exerciseId: "c030-pron-01", sessionId: S, createdAt: at(25 * HOUR) });
    await attempt({ exerciseId: "c030-pron-02", sessionId: S, createdAt: at(HOUR) });
    expect(await findOpenSitting(db, userId, 30, NOW)).toBeNull();
  });

  it("a sitting that already has a result is not open", async () => {
    await attempt({ exerciseId: "c030-pron-01", sessionId: S, createdAt: at(HOUR) });
    await result({ id: S });
    expect(await findOpenSitting(db, userId, 30, NOW)).toBeNull();
  });

  it("with two open sittings the one with the latest answer is returned", async () => {
    const older = randomUUID();
    await attempt({ exerciseId: "c030-pron-01", sessionId: older, createdAt: at(5 * HOUR) });
    await attempt({ exerciseId: "c030-pron-02", sessionId: S, createdAt: at(2 * HOUR) });
    expect((await findOpenSitting(db, userId, 30, NOW))?.sessionId).toBe(S);
  });

  it("ignores lesson attempts, attempts without a session, other days and other users", async () => {
    await attempt({ exerciseId: "d030-listen-01", sessionId: S, source: "lesson", createdAt: at(HOUR) });
    await attempt({ exerciseId: "c030-pron-01", sessionId: null, createdAt: at(HOUR) });
    await attempt({ exerciseId: "c060-pron-01", sessionId: S, day: 60, createdAt: at(HOUR) });
    await otherUser();
    await attempt({ exerciseId: "c030-pron-01", sessionId: randomUUID(), user: "other", createdAt: at(HOUR) });
    expect(await findOpenSitting(db, userId, 30, NOW)).toBeNull();
    expect((await findOpenSitting(db, userId, 60, NOW))?.sessionId).toBe(S);
  });

  it("a result of ANOTHER user with the same id does not close this sitting", async () => {
    await otherUser();
    await attempt({ exerciseId: "c030-pron-01", sessionId: S, createdAt: at(HOUR) });
    await result({ id: S, userId: "other" });
    expect((await findOpenSitting(db, userId, 30, NOW))?.sessionId).toBe(S);
  });
});

describe("hasEarlierAnswer", () => {
  it("is false without any attempt and false when the only attempt is the one asked about", async () => {
    expect(await hasEarlierAnswer(db, userId, "c030-pron-01", randomUUID())).toBe(false);
    const a = await attempt({ exerciseId: "c030-pron-01", sessionId: randomUUID() });
    expect(await hasEarlierAnswer(db, userId, "c030-pron-01", a.id)).toBe(false);
  });

  it("is true when the learner has answered the exercise with another attempt id, from any session or source", async () => {
    const a = await attempt({ exerciseId: "c030-pron-01", sessionId: randomUUID() });
    expect(await hasEarlierAnswer(db, userId, "c030-pron-01", randomUUID())).toBe(true);
    const b = await attempt({ exerciseId: "c030-pron-01", sessionId: randomUUID(), source: "checkpoint_retake" });
    expect(await hasEarlierAnswer(db, userId, "c030-pron-01", a.id)).toBe(true);
    expect(await hasEarlierAnswer(db, userId, "c030-pron-01", b.id)).toBe(true);
  });

  it("does not look at other exercises or other users", async () => {
    await attempt({ exerciseId: "c030-pron-02", sessionId: randomUUID() });
    await otherUser();
    await attempt({ exerciseId: "c030-pron-01", sessionId: randomUUID(), user: "other" });
    expect(await hasEarlierAnswer(db, userId, "c030-pron-01", randomUUID())).toBe(false);
  });
});

describe("practisedSince", () => {
  const since = at(HOUR);

  it("returns the exercises with a practice attempt strictly after `since`", async () => {
    await attempt({ exerciseId: "d001-pron-01", source: "practice", day: 1, createdAt: at(HOUR / 2) });
    await attempt({ exerciseId: "d001-pron-02", source: "practice", day: 1, createdAt: since }); // not strictly after
    await attempt({ exerciseId: "d001-pron-03", source: "practice", day: 1, createdAt: at(2 * HOUR) });
    await attempt({ exerciseId: "d001-pron-04", source: "lesson", day: 1, createdAt: at(HOUR / 2) });
    await attempt({ exerciseId: "d001-pron-05", source: "practice", day: 1, createdAt: at(HOUR / 2) }); // not asked for
    const got = await practisedSince(db, userId, ["d001-pron-01", "d001-pron-02", "d001-pron-03", "d001-pron-04"], since);
    expect([...got]).toEqual(["d001-pron-01"]);
  });

  it("is empty for no ids and ignores other users", async () => {
    expect(await practisedSince(db, userId, [], since)).toEqual(new Set());
    await otherUser();
    await attempt({ exerciseId: "d001-pron-01", source: "practice", day: 1, user: "other", createdAt: at(0) });
    expect(await practisedSince(db, userId, ["d001-pron-01"], since)).toEqual(new Set());
  });
});

describe("getCheckpointOverview", () => {
  it("is empty when no checkpoint file exists", async () => {
    await doneDay(30);
    expect(await getCheckpointOverview(db, userId, withFile(), NOW)).toEqual([]);
  });

  it("lists a checkpoint only when its file exists AND day A is done", async () => {
    await doneDay(30);
    expect((await getCheckpointOverview(db, userId, withFile(30, 60), NOW)).map((o) => o.afterDay)).toEqual([30]);
    await doneDay(60);
    expect((await getCheckpointOverview(db, userId, withFile(30, 60), NOW)).map((o) => o.afterDay)).toEqual([30, 60]);
    expect((await getCheckpointOverview(db, userId, withFile(60), NOW)).map((o) => o.afterDay)).toEqual([60]);
  });

  it("not taken yet", async () => {
    await doneDay(30);
    expect(await getCheckpointOverview(db, userId, withFile(30), NOW)).toEqual([
      { afterDay: 30, status: "not_taken", sittings: 0, latest: null, best: null, passed: false, completedToday: false },
    ]);
  });

  it("taken: sittings, latest, best, passed (any sitting at 70% or more), in the learner's time zone for completedToday", async () => {
    await doneDay(30);
    await result({ score: 0.9, startedAt: at(50 * HOUR), completedAt: at(49 * HOUR) });
    await result({ score: 0.4, startedAt: at(HOUR), completedAt: at(0) });
    expect(await getCheckpointOverview(db, userId, withFile(30), NOW)).toEqual([
      { afterDay: 30, status: "passed", sittings: 2, latest: 0.4, best: 0.9, passed: true, completedToday: true },
    ]);
  });

  it("not passed when no sitting reached 70%; completedToday is false when the last sitting was on an earlier local day", async () => {
    await doneDay(30);
    await result({ score: 0.6, startedAt: at(30 * HOUR), completedAt: at(29 * HOUR) });
    expect(await getCheckpointOverview(db, userId, withFile(30), NOW)).toEqual([
      { afterDay: 30, status: "not_passed", sittings: 1, latest: 0.6, best: 0.6, passed: false, completedToday: false },
    ]);
  });

  it("uses the profile's time zone for 'today' (Asia/Bangkok is UTC+7)", async () => {
    await doneDay(30);
    // 17:30Z on the 27th is 00:30 on the 28th in Bangkok; NOW (12:00Z on the 28th) is 19:00 on the 28th there
    await result({ score: 0.8, startedAt: new Date("2026-11-27T17:00:00Z"), completedAt: new Date("2026-11-27T17:30:00Z") });
    expect((await getCheckpointOverview(db, userId, withFile(30), NOW))[0].completedToday).toBe(true);
    await db.execute(dsql`UPDATE profiles SET timezone = 'America/New_York' WHERE user_id = ${userId}`);
    expect((await getCheckpointOverview(db, userId, withFile(30), NOW))[0].completedToday).toBe(false);
  });

  it("does not use other users' results", async () => {
    await doneDay(30);
    await otherUser();
    await result({ userId: "other" });
    expect((await getCheckpointOverview(db, userId, withFile(30), NOW))[0].status).toBe("not_taken");
  });
});
