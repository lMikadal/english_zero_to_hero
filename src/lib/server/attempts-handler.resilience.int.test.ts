// @vitest-environment node
// One poison item must never fail its batch: the others are stored and the bad one is answered `rejected`.
import { sql as dsql } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { attempts } from "@/db/schema";
import { cleanDatabase, connectTestDb } from "@/db/test-utils";
import { handlePostAttempts } from "./attempts-handler";
import { handleCompleteLesson } from "./complete-handler";
import { ANSWERS, attemptItem, NOW, seedLocal } from "./test-helpers";

const control = vi.hoisted(() => ({ brokenDays: new Set<number>(), taughtBroken: false, lesson365: false, failInsertFor: new Set<string>() }));

vi.mock("@/lib/content/repo", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/content/repo")>();
  return {
    ...real,
    getLesson: (day: number, ...rest: [string?]) => {
      if (control.brokenDays.has(day)) throw new Error(`lesson ${day} is broken`);
      return real.getLesson(control.lesson365 && day === 365 ? 1 : day, ...rest);
    },
    getTaughtWords: (day: number, ...rest: [string?]) => {
      if (control.taughtBroken) throw new Error("vocab is broken");
      return real.getTaughtWords(day, ...rest);
    },
  };
});

vi.mock("@/db/queries/attempts", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/db/queries/attempts")>();
  return {
    ...real,
    insertAttempt: async (db: Parameters<typeof real.insertAttempt>[0], row: Parameters<typeof real.insertAttempt>[1]) => {
      if (control.failInsertFor.has(row.id)) {
        // a real statement error: it aborts the transaction unless the item runs in its own savepoint
        await db.execute(dsql`SELECT 1 / 0`);
      }
      return real.insertAttempt(db, row);
    },
  };
});

const { sql, db } = connectTestDb();
let userId: string;
const post = (body: unknown) => handlePostAttempts(body, { db, userId, now: NOW });
const stored = async () => (await db.select().from(attempts)).map((r) => r.exerciseId).sort();

beforeEach(async () => {
  await cleanDatabase(sql);
  userId = await seedLocal(db, 7);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  control.brokenDays.clear();
  control.taughtBroken = false;
  control.lesson365 = false;
  control.failInsertFor.clear();
  vi.restoreAllMocks();
});
afterAll(async () => {
  await cleanDatabase(sql);
  await sql.end();
});

type Results = { results: { id: string | null; status: string; reason?: string }[] };

describe("a poison item rejects only itself", () => {
  const good = () => attemptItem("d001-listen-01", ANSWERS.listenChooseRight);
  const good2 = () => attemptItem("d001-write-01", ANSWERS.arrangeRight);

  it("NUL in an answer, a lone surrogate and a year-0000 timestamp are `invalid`; the rest is stored", async () => {
    const nul = attemptItem("d001-listen-02", { kind: "text", text: "nice\u0000 to meet you" });
    const lone = attemptItem("d001-pron-03", ANSWERS.selfOk);
    const loneBad = { ...attemptItem("d002-write-03", { kind: "text", text: "x\ud800" }) };
    const y0 = attemptItem("d001-speak-01", ANSWERS.selfOk, { createdAt: "0000-01-01T00:00:00Z" });
    const a = good();
    const b = good2();
    const res = await post({ attempts: [a, nul, loneBad, y0, b, lone] });
    expect(res.status).toBe(200);
    expect((res.body as Results).results.map((r) => [r.status, r.reason])).toEqual([
      ["created", undefined],
      ["rejected", "invalid"],
      ["rejected", "invalid"],
      ["rejected", "invalid"],
      ["created", undefined],
      ["created", undefined],
    ]);
    expect(await stored()).toEqual(["d001-listen-01", "d001-pron-03", "d001-write-01"]);
  });

  it("a lesson file that fails to load answers unknown_exercise for its items only", async () => {
    control.brokenDays.add(2);
    const broken = attemptItem("d002-listen-01", { kind: "choice", selected: 1 });
    const res = await post({ attempts: [good(), broken, good2()] });
    expect((res.body as Results).results.map((r) => [r.status, r.reason])).toEqual([
      ["created", undefined],
      ["rejected", "unknown_exercise"],
      ["created", undefined],
    ]);
    expect(await stored()).toEqual(["d001-listen-01", "d001-write-01"]);
    expect(console.error).toHaveBeenCalled();
  });

  it("a failing taught-words lookup answers unknown_exercise for that item and does not fail the batch", async () => {
    control.taughtBroken = true;
    const res = await post({ attempts: [good()] });
    expect(res.status).toBe(200);
    expect((res.body as Results).results[0]).toMatchObject({ status: "rejected", reason: "unknown_exercise" });
  });

  it("a database error inside one item is rolled back to a savepoint: that item is `invalid`, the others are stored", async () => {
    const bad = attemptItem("d001-listen-02", ANSWERS.dictationRight);
    control.failInsertFor.add(bad.id);
    const a = good();
    const b = good2();
    const res = await post({ attempts: [a, bad, b] });
    expect(res.status).toBe(200);
    expect((res.body as Results).results.map((r) => [r.status, r.reason])).toEqual([
      ["created", undefined],
      ["rejected", "invalid"],
      ["created", undefined],
    ]);
    expect(await stored()).toEqual(["d001-listen-01", "d001-write-01"]);
  });

  it("loads each lesson once per request, not once per item", async () => {
    const real = await import("@/lib/content/repo");
    const spy = vi.spyOn(real, "getLesson");
    const items = ["d001-listen-01", "d001-write-01", "d001-listen-02", "d001-speak-01"].map((e, i) =>
      attemptItem(e, [ANSWERS.listenChooseRight, ANSWERS.arrangeRight, ANSWERS.dictationRight, ANSWERS.selfOk][i]),
    );
    await post({ attempts: items });
    expect(spy.mock.calls.filter(([d]) => d === 1)).toHaveLength(1);
  });
});

describe("lesson completion needs a lesson that exists", () => {
  const complete = (day: number) => handleCompleteLesson({ day, sessionId: "11111111-1111-4111-8111-111111111111", completedAt: NOW.toISOString() }, { db, userId, now: NOW });

  it("409 when the lesson file for the day cannot be loaded, and nothing is unlocked", async () => {
    control.brokenDays.add(3);
    const res = await complete(3);
    expect(res.status).toBe(409);
    expect((await db.execute(dsql`SELECT current_day FROM profiles`))[0].current_day).toBe(7);
  });

  it("current_day is capped at 365", async () => {
    control.lesson365 = true;
    await seedLocal(db, 365);
    const res = await complete(365);
    expect(res.status).toBe(200);
    expect((res.body as { currentDay: number }).currentDay).toBe(365);
  });
});
