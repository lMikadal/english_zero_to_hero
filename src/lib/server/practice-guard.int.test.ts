// @vitest-environment node
// The main guard of the replay feature: no kind of practice request may change `progress` or `profiles`.
import { asc } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { profiles, progress } from "@/db/schema";
import { cleanDatabase, connectTestDb } from "@/db/test-utils";
import { handlePostAttempts } from "./attempts-handler";
import { handleCompletePractice } from "./practice-complete-handler";
import { ANSWERS, attemptItem, finishDay, NOW, PRACTICE_SESSION, seedLocal } from "./test-helpers";

const { sql, db } = connectTestDb();
let userId: string;

/** every column of every row, so a changed updated_at counts too */
const snapshot = async () => ({
  progress: await db.select().from(progress).orderBy(asc(progress.day)),
  profiles: await db.select().from(profiles).orderBy(asc(profiles.userId)),
});
const send = (items: ReturnType<typeof attemptItem>[], now = NOW) => handlePostAttempts({ attempts: items }, { db, userId, now });
const practice = (id: string, answer: Parameters<typeof attemptItem>[1], over: Record<string, unknown> = {}) =>
  attemptItem(id, answer, { source: "practice", sessionId: PRACTICE_SESSION, ...over });
const complete = (over: Record<string, unknown> = {}, now = NOW) =>
  handleCompletePractice({ kind: "replay", day: 1, skill: null, sessionId: PRACTICE_SESSION, completedAt: now.toISOString(), ...over }, { db, userId, now });
const results = (r: Awaited<ReturnType<typeof send>>) => (r.body as { results: { status: string; reason?: string }[] }).results;

beforeEach(async () => {
  await cleanDatabase(sql);
  userId = await seedLocal(db, 1);
});
afterAll(async () => {
  await cleanDatabase(sql);
  await sql.end();
});

describe("practice requests leave progress and profiles byte-identical", () => {
  it("covers every kind of request", async () => {
    // day 1 finished with a real lesson attempt, so progress.score is set
    await send([attemptItem("d001-listen-01", ANSWERS.listenChooseRight, { createdAt: new Date(NOW.getTime() - 120_000).toISOString() })]);
    await finishDay(db, userId, 1, new Date(NOW.getTime() - 60_000));
    const later = new Date(NOW.getTime() + 86_400_000);
    const before = await snapshot();
    expect(before.progress[0]).toMatchObject({ status: "done", score: 1 });

    const t = (s: number) => new Date(NOW.getTime() - s * 1000).toISOString();
    // attempts: accepted right, accepted wrong, created before completed_at, attempt_no 2
    expect(results(await send([
      practice("d001-listen-01", ANSWERS.listenChooseWrong, { createdAt: t(90) }), // before completed_at
      practice("d001-write-01", ANSWERS.arrangeRight, { createdAt: NOW.toISOString() }),
      practice("d001-pron-02", ANSWERS.minimalPairRight, { attemptNo: 2 }),
    ])).map((r) => r.status)).toEqual(["created", "created", "created"]);
    expect(await snapshot()).toEqual(before);

    // attempts: rejected (not finished day is checked elsewhere; here a bad answer kind and an unknown exercise)
    expect(results(await send([practice("d001-listen-01", ANSWERS.arrangeRight), practice("d001-nope-99", ANSWERS.selfOk)])).map((r) => r.status)).toEqual(["rejected", "rejected"]);
    // duplicate id
    const dup = practice("d001-write-02", { kind: "text", text: "x" });
    await send([dup]);
    expect(results(await send([dup]))[0].status).toBe("duplicate");
    expect(await snapshot()).toEqual(before);

    // completions: whole lesson, single skill, repeated, on a later day, and a day that is not done
    expect((await complete()).status).toBe(200);
    expect((await complete({ skill: "reading" })).status).toBe(200);
    expect((await complete()).status).toBe(200);
    expect((await complete({ completedAt: later.toISOString() }, later)).status).toBe(200);
    expect((await complete({ day: 2 })).status).toBe(409); // day 2 is unlocked but not done
    expect(await snapshot()).toEqual(before);
  });

  it("a practice attempt for a day that is not done is rejected not_finished, per item, and does not poison the batch", async () => {
    const r = await send([
      practice("d001-listen-01", ANSWERS.listenChooseRight), // day 1 not done
      attemptItem("d001-listen-02", ANSWERS.dictationRight), // lesson attempt, same batch
    ]);
    expect(results(r)).toEqual([expect.objectContaining({ status: "rejected", reason: "not_finished" }), expect.objectContaining({ status: "created" })]);
    // the lesson attempt started day 1; a practice attempt must still be refused until it is done
    expect(results(await send([practice("d001-listen-01", ANSWERS.listenChooseRight)]))[0]).toMatchObject({ status: "rejected", reason: "not_finished" });
  });
});
