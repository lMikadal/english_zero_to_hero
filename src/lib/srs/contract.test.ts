import { describe, expect, expectTypeOf, it } from "vitest";
import type { SrsDirection } from "@/db/schema"; // type-only: erased
import { VOCAB_ID_PATTERN } from "@/lib/content/schema";
import {
  API_SRS, completeReviewRequestSchema, DIRECTION_LABEL_TH, fromWire, parseReviewBatch, REVIEW_DIRECTIONS, reviewInputSchema,
  toWire, type ReviewDirection, type ReviewInput, type ReviewQueue, type ReviewResult, type WireCardState,
} from "./contract";
import { applyRating, newCardState, type CardState, type Rating } from "./scheduler";

const id = "7b0f6f4e-5c1b-4f55-9a43-0d1c2e3f4a5b";
const sessionId = "11111111-2222-4333-8444-555555555555";
const valid = { id, sessionId, vocabId: "v-hello", direction: "en_th", rating: 3, reviewedAt: "2026-11-26T10:00:00.000Z" };

describe("types stay in sync", () => {
  it("REVIEW_DIRECTIONS is a subset of the DB's SrsDirection, and it is en_th and th_en", () => {
    expectTypeOf<ReviewDirection>().toExtend<SrsDirection>();
    expect([...REVIEW_DIRECTIONS]).toEqual(["en_th", "th_en"]);
    expectTypeOf<ReviewDirection>().toEqualTypeOf<"en_th" | "th_en">();
  });
  it("the zod rating is the scheduler's Rating", () => {
    expectTypeOf<ReviewInput["rating"]>().toEqualTypeOf<Rating>();
  });
  it("the direction of a queue card is the same ReviewDirection", () => {
    expectTypeOf<ReviewQueue["cards"][number]["direction"]>().toEqualTypeOf<ReviewDirection>();
    expectTypeOf<ReviewInput["direction"]>().toEqualTypeOf<ReviewDirection>();
  });
  it("DIRECTION_LABEL_TH has a label for every direction", () => {
    expect(DIRECTION_LABEL_TH).toEqual({ en_th: "อังกฤษ → ไทย", th_en: "ไทย → อังกฤษ" });
    expectTypeOf<keyof typeof DIRECTION_LABEL_TH>().toEqualTypeOf<ReviewDirection>();
  });
  it("API_SRS names the two endpoints", () => {
    expect(API_SRS).toEqual({ reviews: "/api/reviews", completeReview: "/api/reviews/complete" });
  });
  it("VOCAB_ID_PATTERN is exported by the content schema", () => {
    expect(VOCAB_ID_PATTERN.test("v-hello")).toBe(true);
    expect(VOCAB_ID_PATTERN.test("v-ice-cream")).toBe(true);
    expect(VOCAB_ID_PATTERN.test("hello")).toBe(false);
  });
  it("ReviewResult has created, duplicate (with the stored card) and rejected", () => {
    expectTypeOf<Extract<ReviewResult, { status: "rejected" }>["reason"]>().toEqualTypeOf<"unknown_word" | "not_taught" | "invalid">();
    expectTypeOf<Extract<ReviewResult, { status: "created" | "duplicate" }>["card"]>().toEqualTypeOf<WireCardState>();
  });
});

describe("reviewInputSchema", () => {
  it("accepts a valid review for both directions", () => {
    expect(reviewInputSchema.safeParse(valid).success).toBe(true);
    expect(reviewInputSchema.safeParse({ ...valid, direction: "th_en" }).success).toBe(true);
  });
  it.each([0, 5, -1, 3.5, "3", null, undefined])("rejects rating %s", (rating) => {
    expect(reviewInputSchema.safeParse({ ...valid, rating }).success).toBe(false);
  });
  it.each([1, 2, 3, 4])("accepts rating %i", (rating) => {
    expect(reviewInputSchema.safeParse({ ...valid, rating }).success).toBe(true);
  });
  it.each(["listen_spell", "speak", "", "EN_TH", undefined])("rejects direction %s", (direction) => {
    expect(reviewInputSchema.safeParse({ ...valid, direction }).success).toBe(false);
  });
  it.each(["hello", "V-hello", "v-", "v hello", "", "v-hello!"])("rejects vocabId %j", (vocabId) => {
    expect(reviewInputSchema.safeParse({ ...valid, vocabId }).success).toBe(false);
  });
  it("rejects extra fields (strict)", () => {
    expect(reviewInputSchema.safeParse({ ...valid, userId: "x" }).success).toBe(false);
  });
  it("rejects ids that are not uuids and timestamps that are not ISO or out of range", () => {
    expect(reviewInputSchema.safeParse({ ...valid, id: "abc" }).success).toBe(false);
    expect(reviewInputSchema.safeParse({ ...valid, sessionId: "abc" }).success).toBe(false);
    expect(reviewInputSchema.safeParse({ ...valid, reviewedAt: "yesterday" }).success).toBe(false);
    expect(reviewInputSchema.safeParse({ ...valid, reviewedAt: "1850-01-01T00:00:00Z" }).success).toBe(false);
  });
  it("durationMs is optional, an integer from 0 to 3,600,000", () => {
    expect(reviewInputSchema.safeParse({ ...valid, durationMs: 0 }).success).toBe(true);
    expect(reviewInputSchema.safeParse({ ...valid, durationMs: 3_600_000 }).success).toBe(true);
    expect(reviewInputSchema.safeParse({ ...valid, durationMs: 3_600_001 }).success).toBe(false);
    expect(reviewInputSchema.safeParse({ ...valid, durationMs: -1 }).success).toBe(false);
    expect(reviewInputSchema.safeParse({ ...valid, durationMs: 1.5 }).success).toBe(false);
  });
});

describe("parseReviewBatch", () => {
  it("is ok with one entry per item, in order", () => {
    const r = parseReviewBatch({ reviews: [valid, { ...valid, id: "8b0f6f4e-5c1b-4f55-9a43-0d1c2e3f4a5b", direction: "th_en" }] });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.items.map((i) => i.ok)).toEqual([true, true]);
      expect(r.items[0].id).toBe(id);
    }
  });
  it("one bad item does not fail the batch; it keeps its id when readable", () => {
    const r = parseReviewBatch({ reviews: [valid, { ...valid, rating: 9 }, { rating: 1 }, "junk"] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.items).toEqual([expect.objectContaining({ ok: true }), { ok: false, id }, { ok: false, id: null }, { ok: false, id: null }]);
  });
  it("an envelope that is wrong is a whole-body failure: not an object, no reviews, empty, 51 items", () => {
    expect(parseReviewBatch(null)).toEqual({ ok: false });
    expect(parseReviewBatch({})).toEqual({ ok: false });
    expect(parseReviewBatch({ reviews: [] })).toEqual({ ok: false });
    expect(parseReviewBatch({ reviews: Array(51).fill(valid) })).toEqual({ ok: false });
    expect(parseReviewBatch({ attempts: [valid] })).toEqual({ ok: false });
    expect(parseReviewBatch({ reviews: "x" })).toEqual({ ok: false });
  });
  it("50 items is fine", () => {
    expect(parseReviewBatch({ reviews: Array(50).fill(valid) }).ok).toBe(true);
  });
});

describe("completeReviewRequestSchema", () => {
  const ok = { sessionId, startedAt: "2026-11-26T10:00:00.000Z", completedAt: "2026-11-26T10:05:00.000Z" };
  it("accepts a session and rejects extras and bad timestamps", () => {
    expect(completeReviewRequestSchema.safeParse(ok).success).toBe(true);
    expect(completeReviewRequestSchema.safeParse({ ...ok, day: 1 }).success).toBe(false);
    expect(completeReviewRequestSchema.safeParse({ ...ok, startedAt: "x" }).success).toBe(false);
    expect(completeReviewRequestSchema.safeParse({ ...ok, sessionId: "x" }).success).toBe(false);
  });
});

describe("toWire / fromWire", () => {
  const NOW = new Date("2026-01-01T01:00:00.000Z");
  it("round-trips every state exactly", () => {
    const cards: CardState[] = [newCardState(NOW), applyRating(newCardState(NOW), 3, NOW, "UTC")];
    cards.push(applyRating(cards[1], 3, cards[1].due, "UTC"));
    for (const c of cards) expect(fromWire(toWire(c))).toEqual(c);
  });
  it("uses ISO strings and survives JSON", () => {
    const c = applyRating(newCardState(NOW), 3, NOW, "UTC");
    const w = toWire(c);
    expect(w.due).toBe("2026-01-01T01:10:00.000Z");
    expect(w.lastReview).toBe("2026-01-01T01:00:00.000Z");
    expect(toWire(newCardState(NOW)).lastReview).toBeNull();
    expect(JSON.parse(JSON.stringify(w))).toEqual(w);
  });
});
