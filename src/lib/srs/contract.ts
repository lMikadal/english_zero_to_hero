// The vocabulary review contract shared by the server (route handlers, later PRs) and the client (queue, page).
// Client-safe: must not import node:*, src/db or the content loader. See docs/plans/vocab-review-plan.md section 5.
import { z } from "zod";
import { isoTimestamp } from "@/lib/attempts/contract";
import { VOCAB_ID_PATTERN } from "@/lib/content/schema";
import type { CardState, Rating } from "./scheduler";

export const API_SRS = { reviews: "/api/reviews", completeReview: "/api/reviews/complete" } as const;

/** A subset of SrsDirection (src/db/schema.ts), checked by a type test. Not `string`, not SrsDirection: no other direction has a face yet. */
export const REVIEW_DIRECTIONS = ["en_th", "th_en"] as const;
export type ReviewDirection = (typeof REVIEW_DIRECTIONS)[number];

export const DIRECTION_LABEL_TH = { en_th: "อังกฤษ → ไทย", th_en: "ไทย → อังกฤษ" } as const satisfies Record<ReviewDirection, string>;

const rating: z.ZodType<Rating> = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]);

export const reviewInputSchema = z.strictObject({
  id: z.uuid(),
  sessionId: z.uuid(),
  vocabId: z.string().regex(VOCAB_ID_PATTERN),
  direction: z.enum(REVIEW_DIRECTIONS),
  rating,
  reviewedAt: isoTimestamp,
  durationMs: z.number().int().min(0).max(3_600_000).optional(),
});
export type ReviewInput = z.infer<typeof reviewInputSchema>;

/** A card state as sent over the wire: CardState with ISO strings. */
export type WireCardState = Omit<CardState, "due" | "lastReview"> & { due: string; lastReview: string | null };

export function toWire(c: CardState): WireCardState {
  return { ...c, due: c.due.toISOString(), lastReview: c.lastReview ? c.lastReview.toISOString() : null };
}
export function fromWire(w: WireCardState): CardState {
  return { ...w, due: new Date(w.due), lastReview: w.lastReview ? new Date(w.lastReview) : null };
}

export type ParsedItem<T> = { ok: true; id: string; value: T } | { ok: false; id: string | null };
export type ParsedBatch<T> = { ok: true; items: ParsedItem<T>[] } | { ok: false };

const batchEnvelopeSchema = z.object({ reviews: z.array(z.unknown()).min(1).max(50) });

/** Same rules as parseAttemptBatch: a bad envelope is a whole-body failure (400); a bad item is `{ ok: false }` and never fails the batch. */
export function parseReviewBatch(body: unknown): ParsedBatch<ReviewInput> {
  const env = batchEnvelopeSchema.safeParse(body);
  if (!env.success) return { ok: false };
  const idOf = z.uuid();
  return {
    ok: true,
    items: env.data.reviews.map((raw): ParsedItem<ReviewInput> => {
      const r = reviewInputSchema.safeParse(raw);
      if (r.success) return { ok: true, id: r.data.id, value: r.data };
      const id = raw && typeof raw === "object" ? idOf.safeParse((raw as { id?: unknown }).id) : undefined;
      return { ok: false, id: id?.success ? id.data : null };
    }),
  };
}

export type ReviewRejectedReason = "unknown_word" | "not_taught" | "invalid";
export type ReviewResult =
  | { id: string; status: "created" | "duplicate"; card: WireCardState }
  | { id: string | null; status: "rejected"; reason: ReviewRejectedReason };
export type PostReviewsResponse = { results: ReviewResult[] };

export const completeReviewRequestSchema = z.strictObject({ sessionId: z.uuid(), startedAt: isoTimestamp, completedAt: isoTimestamp });
export type CompleteReviewRequest = z.infer<typeof completeReviewRequestSchema>;
export type CompleteReviewResponse = {
  sessionDate: string;
  reviewed: number;
  remainingDue: number;
  streak: { current: number; longest: number };
  countedForStreak: boolean;
};

/** What the /review page gets from the server as props. */
export type ReviewQueue = {
  today: string;
  endOfToday: string;
  timeZone: string;
  cards: { vocabId: string; direction: ReviewDirection; state: WireCardState; word: string; ipa: string; th: string; example: { en: string; th: string } | null }[];
};
