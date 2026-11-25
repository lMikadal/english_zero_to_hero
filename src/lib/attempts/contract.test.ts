import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import type { AttemptSource } from "@/db/schema"; // type-only: erased, no runtime import of src/db
import {
  API,
  ATTEMPT_SOURCES,
  attemptAnswerSchema,
  attemptInputSchema,
  attemptBatchEnvelopeSchema,
  clampDurationMs,
  completeLessonRequestSchema,
  newId,
  parseAttemptBatch,
  type AttemptInput,
  type AttemptResult,
  type CompleteLessonResponse,
  type PostAttemptsResponse,
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
    expect([...ATTEMPT_SOURCES]).toEqual(["lesson", "drill", "retest", "checkpoint"]);
  });
});

describe("API", () => {
  it("names the two endpoints", () => {
    expect(API).toEqual({ attempts: "/api/attempts", completeLesson: "/api/lessons/complete" });
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
    // created always carries the grade; duplicate may; rejected carries a reason
    // @ts-expect-error created without a grade
    const noGrade: AttemptResult = { id: uuid, status: "created" };
    void noGrade;
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
    };
    expect(c.currentDay).toBe(2);
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
