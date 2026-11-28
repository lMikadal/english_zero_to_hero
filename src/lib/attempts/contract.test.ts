import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import type { AttemptSource } from "@/db/schema"; // type-only: erased, no runtime import of src/db
import type { Section } from "@/lib/content/schema";
import {
  API,
  ATTEMPT_SOURCES,
  attemptAnswerSchema,
  attemptInputSchema,
  attemptBatchEnvelopeSchema,
  clampDurationMs,
  completeCheckpointRequestSchema,
  completeLessonRequestSchema,
  completePracticeRequestSchema,
  newId,
  parseAttemptBatch,
  type AttemptInput,
  type AttemptResult,
  type CheckpointSkillResult,
  type CompleteCheckpointResponse,
  type CompleteLessonResponse,
  type CompletePracticeResponse,
  type PostAttemptsResponse,
  type RejectedReason,
  REPLAY_SKILLS,
  type ReplaySkill,
} from "./contract";

const uuid = "7b0f6f4e-5c1b-4f55-9a43-0d1c2e3f4a5b";
const valid = {
  id: uuid,
  exerciseId: "d001-listen-01",
  sessionId: "11111111-2222-4333-8444-555555555555",
  answer: { kind: "choice", selected: 0 },
  createdAt: "2026-11-25T10:00:00.000Z",
};

describe("types stay in sync with the DB schema", () => {
  it("ATTEMPT_SOURCES equals AttemptSource", () => {
    expectTypeOf<(typeof ATTEMPT_SOURCES)[number]>().toEqualTypeOf<AttemptSource>();
    expect([...ATTEMPT_SOURCES]).toEqual(["lesson", "drill", "retest", "checkpoint", "practice", "checkpoint_retake"]);
  });
  it("ReplaySkill equals the skill of a lesson section", () => {
    expectTypeOf<ReplaySkill>().toEqualTypeOf<Section["skill"]>();
    expect([...REPLAY_SKILLS]).toEqual(["pronunciation", "listening", "speaking", "reading", "writing"]);
  });
  it("RejectedReason has already_answered (a second answer to a checkpoint exercise in one sitting)", () => {
    expectTypeOf<"already_answered">().toExtend<RejectedReason>();
  });
  it("RejectedReason has not_finished", () => {
    expectTypeOf<"not_finished">().toExtend<RejectedReason>();
  });
});

describe("API", () => {
  it("names the three endpoints", () => {
    expect(API).toEqual({
      attempts: "/api/attempts",
      completeLesson: "/api/lessons/complete",
      completePractice: "/api/practice/complete",
      completeCheckpoint: "/api/checkpoints/complete",
    });
  });
});

describe("attemptAnswerSchema", () => {
  it.each([
    { kind: "choice", selected: 2 },
    { kind: "choices", selected: [0, 1] },
    { kind: "pairs", selected: ["a", "b"] },
    { kind: "text", text: "Nice to meet you" },
    { kind: "texts", texts: ["from"] },
    { kind: "match", pairs: { "v-cat": "v-cat" } },
    { kind: "self", rating: "ok" },
    { kind: "self", rating: "unsure", recordingId: uuid },
  ])("accepts %j", (a) => expect(attemptAnswerSchema.safeParse(a).success).toBe(true));

  it("caps the number of match keys", () => {
    const pairs = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`v-w${i}`, `v-w${i}`]));
    expect(attemptAnswerSchema.safeParse({ kind: "match", pairs: pairs(20) }).success).toBe(true);
    expect(attemptAnswerSchema.safeParse({ kind: "match", pairs: pairs(21) }).success).toBe(false);
  });

  it.each([
    { kind: "choice", selected: -1 },
    { kind: "choice", selected: 1.5 },
    { kind: "pairs", selected: ["c"] },
    { kind: "self", rating: "great" },
    { kind: "self", rating: "ok", recordingId: "nope" },
    { kind: "text" },
    { kind: "unknown" },
    { kind: "choice", selected: 0, correct: true },
  ])("rejects %j", (a) => expect(attemptAnswerSchema.safeParse(a).success).toBe(false));
});

describe("attemptInputSchema", () => {
  it("accepts a valid item and defaults source to lesson and attemptNo to 1", () => {
    const r = attemptInputSchema.parse(valid);
    expect(r.source).toBe("lesson");
    expect(r.attemptNo).toBe(1);
  });
  it("accepts attemptNo 2, durationMs and every source", () => {
    expect(attemptInputSchema.parse({ ...valid, attemptNo: 2, durationMs: 1200, source: "retest" })).toMatchObject({
      attemptNo: 2, durationMs: 1200, source: "retest",
    });
  });
  it.each([0, 3, "1", 1.5])("rejects attemptNo %j", (attemptNo) => {
    expect(attemptInputSchema.safeParse({ ...valid, attemptNo }).success).toBe(false);
  });
  it("rejects a bad uuid for id and sessionId", () => {
    expect(attemptInputSchema.safeParse({ ...valid, id: "abc" }).success).toBe(false);
    expect(attemptInputSchema.safeParse({ ...valid, sessionId: "abc" }).success).toBe(false);
  });
  it("rejects extra keys, e.g. a client-sent correct or score", () => {
    expect(attemptInputSchema.safeParse({ ...valid, correct: true }).success).toBe(false);
    expect(attemptInputSchema.safeParse({ ...valid, score: 1 }).success).toBe(false);
  });
  it("rejects a bad exercise id, source, duration and timestamp", () => {
    expect(attemptInputSchema.safeParse({ ...valid, exerciseId: "listen-1" }).success).toBe(false);
    expect(attemptInputSchema.safeParse({ ...valid, source: "other" }).success).toBe(false);
    expect(attemptInputSchema.safeParse({ ...valid, durationMs: -1 }).success).toBe(false);
    expect(attemptInputSchema.safeParse({ ...valid, durationMs: 3_600_001 }).success).toBe(false);
    expect(attemptInputSchema.safeParse({ ...valid, createdAt: "yesterday" }).success).toBe(false);
  });
  it("AttemptInput carries the defaults as required fields", () => {
    expectTypeOf<AttemptInput["attemptNo"]>().toEqualTypeOf<1 | 2>();
    expectTypeOf<AttemptInput["source"]>().toEqualTypeOf<AttemptSource>();
  });
});

describe("attemptBatchEnvelopeSchema", () => {
  it("accepts 1 to 50 items of any shape (items are validated one by one)", () => {
    expect(attemptBatchEnvelopeSchema.safeParse({ attempts: [valid] }).success).toBe(true);
    expect(attemptBatchEnvelopeSchema.safeParse({ attempts: [null, 1, "x"] }).success).toBe(true);
    expect(attemptBatchEnvelopeSchema.safeParse({ attempts: Array(50).fill(valid) }).success).toBe(true);
  });
  it("rejects 0 items, more than 50 items and a non-array", () => {
    expect(attemptBatchEnvelopeSchema.safeParse({ attempts: [] }).success).toBe(false);
    expect(attemptBatchEnvelopeSchema.safeParse({ attempts: Array(51).fill(valid) }).success).toBe(false);
    expect(attemptBatchEnvelopeSchema.safeParse({ attempts: valid }).success).toBe(false);
    expect(attemptBatchEnvelopeSchema.safeParse({}).success).toBe(false);
  });
});

describe("parseAttemptBatch: one bad item must not reject the whole batch", () => {
  const id2 = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
  it("a bad envelope is not ok (the API answers 400)", () => {
    for (const body of [null, "x", 5, [], {}, { attempts: [] }, { attempts: "x" }, { attempts: Array(51).fill(valid) }]) {
      expect(parseAttemptBatch(body)).toEqual({ ok: false });
    }
  });
  it("returns one entry per item, in order, parsed with defaults", () => {
    const r = parseAttemptBatch({ attempts: [valid, { ...valid, id: id2, attemptNo: 2 }] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.items).toHaveLength(2);
    expect(r.items[0]).toMatchObject({ ok: true, id: uuid, attempt: { id: uuid, source: "lesson", attemptNo: 1 } });
    expect(r.items[1]).toMatchObject({ ok: true, id: id2, attempt: { attemptNo: 2 } });
  });
  it.each([
    ["a 2 hour duration", { durationMs: 7_200_000 }],
    ["a negative duration", { durationMs: -5 }],
    ["a 6000 character paste", { answer: { kind: "text", text: "x".repeat(6000) } }],
    ["an unknown answer kind from an older build", { answer: { kind: "old-kind" } }],
    ["an extra key", { correct: true }],
  ])("%s rejects only that item and keeps its id", (_name, patch) => {
    const r = parseAttemptBatch({ attempts: [valid, { ...valid, id: id2, ...patch }, { ...valid, id: "cccccccc-bbbb-4ccc-8ddd-eeeeeeeeeeee" }] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.items.map((i) => i.ok)).toEqual([true, false, true]);
    expect(r.items[1]).toEqual({ ok: false, id: id2 });
  });
  it("an item whose id is unreadable is invalid with id null", () => {
    const r = parseAttemptBatch({ attempts: [{ ...valid, id: "nope" }, null, 7, { ...valid, id: undefined }] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.items).toEqual([{ ok: false, id: null }, { ok: false, id: null }, { ok: false, id: null }, { ok: false, id: null }]);
  });
  it("a valid id is kept even when the rest of the item is garbage", () => {
    const r = parseAttemptBatch({ attempts: [{ id: uuid, answer: 5 }] });
    expect(r).toEqual({ ok: true, items: [{ ok: false, id: uuid }] });
  });
});

describe("clampDurationMs", () => {
  it("clamps to 0..3_600_000, rounds and treats non-finite values as 0", () => {
    expect(clampDurationMs(1234.6)).toBe(1235);
    expect(clampDurationMs(-50)).toBe(0);
    expect(clampDurationMs(7_200_000)).toBe(3_600_000);
    expect(clampDurationMs(Number.NaN)).toBe(0);
    expect(clampDurationMs(Number.POSITIVE_INFINITY)).toBe(0);
    expect(attemptInputSchema.safeParse({ ...valid, durationMs: clampDurationMs(99_999_999) }).success).toBe(true);
  });
});

describe("completeLessonRequestSchema", () => {
  const ok = { day: 1, sessionId: uuid, completedAt: "2026-11-25T10:00:00Z" };
  it("accepts a valid body", () => expect(completeLessonRequestSchema.safeParse(ok).success).toBe(true));
  it.each([0, 366, 1.5])("rejects day %j", (day) => {
    expect(completeLessonRequestSchema.safeParse({ ...ok, day }).success).toBe(false);
  });
  it("rejects extra keys and a bad session id", () => {
    expect(completeLessonRequestSchema.safeParse({ ...ok, score: 1 }).success).toBe(false);
    expect(completeLessonRequestSchema.safeParse({ ...ok, sessionId: "x" }).success).toBe(false);
  });
});

describe("response types", () => {
  it("allow every documented status and the locked_day reason", () => {
    const r: PostAttemptsResponse = {
      results: [
        { id: uuid, status: "created", correct: true, score: 1 },
        { id: uuid, status: "duplicate" },
        { id: uuid, status: "rejected", reason: "locked_day" },
        { id: uuid, status: "rejected", reason: "unknown_exercise" },
        { id: uuid, status: "rejected", reason: "kind_mismatch" },
        { id: uuid, status: "rejected", reason: "unsupported" },
        { id: uuid, status: "rejected", reason: "invalid" },
        { id: null, status: "rejected", reason: "invalid" },
      ],
    };
    expect(r.results).toHaveLength(8);
    // a lesson result carries the grade; a checkpoint result is only `{ id, status }` (nothing about right or wrong goes back during the test, D5)
    const checkpointCreated: AttemptResult = { id: uuid, status: "created" };
    void checkpointCreated;
    const already: AttemptResult = { id: uuid, status: "rejected", reason: "already_answered" };
    void already;
    // @ts-expect-error a created lesson result cannot carry a half grade
    const halfGrade: AttemptResult = { id: uuid, status: "created", correct: true };
    void halfGrade;
    const dup: AttemptResult = { id: uuid, status: "duplicate" };
    void dup;
    // @ts-expect-error rejected without a reason
    const noReason: AttemptResult = { id: uuid, status: "rejected" };
    void noReason;
    const g: AttemptResult = { id: uuid, status: "created", correct: false, score: 0.5, items: [true, false] };
    void g;
    const c: CompleteLessonResponse = {
      progress: { day: 1, status: "done", score: null, completedAt: "2026-11-25T10:00:00.000Z" },
      streak: { current: 1, longest: 1 },
      currentDay: 2,
      pendingCheckpoint: null,
    };
    expect(c.currentDay).toBe(2);
    const pending: CompleteLessonResponse = { ...c, pendingCheckpoint: 30 };
    expect(pending.pendingCheckpoint).toBe(30);
    // @ts-expect-error the field is required: a response always says whether a checkpoint blocks the next day
    const missing: CompleteLessonResponse = { progress: c.progress, streak: c.streak, currentDay: 2 };
    void missing;
  });
});

describe("newId", () => {
  afterEach(() => vi.unstubAllGlobals());
  const v4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

  it("uses crypto.randomUUID when available", () => {
    vi.stubGlobal("crypto", { randomUUID: () => uuid });
    expect(newId()).toBe(uuid);
  });
  it("falls back to getRandomValues (randomUUID is missing over plain http)", () => {
    vi.stubGlobal("crypto", {
      getRandomValues: (a: Uint8Array) => {
        a.forEach((_, i) => (a[i] = (i * 37 + 11) % 256));
        return a;
      },
    });
    const id = newId();
    expect(id).toMatch(v4);
    expect(attemptInputSchema.safeParse({ ...valid, id }).success).toBe(true);
  });
  it("generates distinct valid ids with the real crypto", () => {
    const a = newId();
    expect(a).toMatch(v4);
    expect(newId()).not.toBe(a);
  });
});

describe("strings Postgres jsonb cannot store are invalid", () => {
  const bad = ["a\u0000b", "x\ud800y", "\udc00", "end\ud83d"];
  it.each(bad)("rejects %j in text, texts, match keys and match values", (s) => {
    expect(attemptAnswerSchema.safeParse({ kind: "text", text: s }).success).toBe(false);
    expect(attemptAnswerSchema.safeParse({ kind: "texts", texts: ["ok", s] }).success).toBe(false);
    expect(attemptAnswerSchema.safeParse({ kind: "match", pairs: { [s]: "v-a" } }).success).toBe(false);
    expect(attemptAnswerSchema.safeParse({ kind: "match", pairs: { "v-a": s } }).success).toBe(false);
  });
  it("still accepts Thai text, emoji (a valid surrogate pair) and ordinary control characters", () => {
    for (const text of ["สวัสดี", "hi 😀", "tab\there\nnewline"]) {
      expect(attemptAnswerSchema.safeParse({ kind: "text", text }).success).toBe(true);
    }
  });
  it("turns such an item into { ok: false } without rejecting the batch", () => {
    const r = parseAttemptBatch({ attempts: [{ ...valid, answer: { kind: "text", text: "a\u0000" } }, valid] });
    expect(r).toMatchObject({ ok: true, items: [{ ok: false, id: uuid }, { ok: true }] });
  });
});

describe("timestamps", () => {
  const items = (createdAt: string) => attemptInputSchema.safeParse({ ...valid, createdAt }).success;
  const completes = (completedAt: string) => completeLessonRequestSchema.safeParse({ day: 1, sessionId: uuid, completedAt }).success;
  it.each(["2026-11-25T10:00:00Z", "2026-11-25T10:00:00.123Z", "2026-11-25T17:00:00+07:00", "2026-11-25T17:00:00.5-00:00"])("accepts %s", (t) => {
    expect(items(t)).toBe(true);
    expect(completes(t)).toBe(true);
  });
  it.each(["0000-01-01T00:00:00Z", "0001-01-01T00:00:00Z", "1899-12-31T23:59:59Z", "2101-01-01T00:00:00Z", "9999-12-31T23:59:59Z", "2026-13-01T00:00:00Z", "2026-11-25"])("rejects %s", (t) => {
    expect(items(t)).toBe(false);
    expect(completes(t)).toBe(false);
  });
  it("accepts the epoch, 1900 and 2100 (they are clamped by the server, not rejected)", () => {
    for (const t of ["1970-01-01T00:00:00Z", "1900-01-01T00:00:00Z", "2100-12-31T00:00:00Z"]) expect(items(t)).toBe(true);
  });
});

describe("completePracticeRequestSchema", () => {
  const ok = { kind: "replay", day: 1, skill: null, sessionId: uuid, completedAt: "2026-11-26T10:00:00.000Z" };
  it("accepts a whole-lesson replay (skill null) and each replay skill", () => {
    expect(completePracticeRequestSchema.safeParse(ok).success).toBe(true);
    for (const skill of REPLAY_SKILLS) expect(completePracticeRequestSchema.safeParse({ ...ok, skill }).success).toBe(true);
  });
  it("rejects vocabulary or any other skill, a missing skill, a missing or other kind, and extra fields", () => {
    expect(completePracticeRequestSchema.safeParse({ ...ok, skill: "vocabulary" }).success).toBe(false);
    expect(completePracticeRequestSchema.safeParse({ ...ok, skill: "Listening" }).success).toBe(false);
    expect(completePracticeRequestSchema.safeParse({ ...ok, skill: undefined }).success).toBe(false);
    expect(completePracticeRequestSchema.safeParse({ ...ok, kind: undefined }).success).toBe(false);
    expect(completePracticeRequestSchema.safeParse({ ...ok, kind: "drill" }).success).toBe(false);
    expect(completePracticeRequestSchema.safeParse({ ...ok, extra: 1 }).success).toBe(false);
  });
  it("validates day, sessionId and completedAt like the lesson completion", () => {
    for (const day of [0, 366, 1.5]) expect(completePracticeRequestSchema.safeParse({ ...ok, day }).success).toBe(false);
    expect(completePracticeRequestSchema.safeParse({ ...ok, sessionId: "nope" }).success).toBe(false);
    expect(completePracticeRequestSchema.safeParse({ ...ok, completedAt: "yesterday" }).success).toBe(false);
    expect(completePracticeRequestSchema.safeParse({ ...ok, completedAt: "1800-01-01T00:00:00Z" }).success).toBe(false);
  });
  it("the response type carries the session score, the stored lesson score and the streak", () => {
    expectTypeOf<CompletePracticeResponse>().toEqualTypeOf<{
      session: { sessionId: string; day: number; skill: ReplaySkill | null; score: number | null; graded: number };
      lessonScore: number | null;
      streak: { current: number; longest: number };
      countedForStreak: boolean;
    }>();
  });
});

describe("completeCheckpointRequestSchema", () => {
  const ok = { afterDay: 30, sessionId: uuid, completedAt: "2026-11-28T10:00:00.000Z" };
  it("accepts every checkpoint day, 30 to 360", () => {
    for (let afterDay = 30; afterDay <= 360; afterDay += 30) expect(completeCheckpointRequestSchema.safeParse({ ...ok, afterDay }).success).toBe(true);
  });
  it("rejects a day that is not a checkpoint day", () => {
    for (const afterDay of [0, 29, 31, 45, 390, 365, 30.5, "30", null]) expect(completeCheckpointRequestSchema.safeParse({ ...ok, afterDay }).success).toBe(false);
  });
  it("rejects extra fields, a bad sessionId and a bad or out of range completedAt", () => {
    expect(completeCheckpointRequestSchema.safeParse({ ...ok, extra: 1 }).success).toBe(false);
    expect(completeCheckpointRequestSchema.safeParse({ ...ok, sessionId: "nope" }).success).toBe(false);
    expect(completeCheckpointRequestSchema.safeParse({ ...ok, completedAt: "yesterday" }).success).toBe(false);
    expect(completeCheckpointRequestSchema.safeParse({ ...ok, completedAt: "1800-01-01T00:00:00Z" }).success).toBe(false);
    expect(completeCheckpointRequestSchema.safeParse({ afterDay: 30, sessionId: uuid }).success).toBe(false);
  });
  it("the response types carry the frozen result, the streak and the next day", () => {
    expectTypeOf<CheckpointSkillResult>().toEqualTypeOf<{
      skill: ReplaySkill;
      weight: number;
      score: number | null;
      answered: number;
      total: number;
      selfOk: number | null;
    }>();
    expectTypeOf<CompleteCheckpointResponse>().toEqualTypeOf<{
      result: { sessionId: string; afterDay: number; score: number; passed: boolean; skills: CheckpointSkillResult[]; completedAt: string; sitting: number; best: number };
      streak: { current: number; longest: number };
      nextDay: number | null;
    }>();
  });
});
