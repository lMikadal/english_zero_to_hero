// The attempts API contract shared by the server (route handlers) and the client (offline queue, player).
// Client-safe: must not import node:*, src/db or the content loader. Shapes are documented in
// docs/ARCHITECTURE.md section 5.1.
import { z } from "zod";
import type { Grade } from "@/lib/answers/grade";
import { EXERCISE_ID_PATTERN } from "@/lib/content/schema";

/** Kept equal to `AttemptSource` in src/db/schema.ts by a type test (contract.test.ts). */
export const ATTEMPT_SOURCES = ["lesson", "drill", "retest", "checkpoint"] as const;

export const API = { attempts: "/api/attempts", completeLesson: "/api/lessons/complete" } as const;

const exerciseId = z.string().regex(EXERCISE_ID_PATTERN);
const index = z.number().int().min(0).max(1000);

export const attemptAnswerSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("choice"), selected: index }),
  z.strictObject({ kind: z.literal("choices"), selected: z.array(index).max(100) }),
  z.strictObject({ kind: z.literal("pairs"), selected: z.array(z.enum(["a", "b"])).max(100) }),
  z.strictObject({ kind: z.literal("text"), text: z.string().max(5000) }),
  z.strictObject({ kind: z.literal("texts"), texts: z.array(z.string().max(1000)).max(100) }),
  z.strictObject({ kind: z.literal("match"), pairs: z.record(z.string().max(100), z.string().max(100)) }),
  z.strictObject({ kind: z.literal("self"), rating: z.enum(["ok", "unsure"]), recordingId: z.uuid().optional() }),
]);
export type AttemptAnswer = z.infer<typeof attemptAnswerSchema>;

export const attemptInputSchema = z.strictObject({
  id: z.uuid(),
  exerciseId,
  sessionId: z.uuid(),
  source: z.enum(ATTEMPT_SOURCES).default("lesson"),
  /** 1 = first try (counts for scores); 2 = the end-of-lesson retry round. */
  attemptNo: z.union([z.literal(1), z.literal(2)]).default(1),
  answer: attemptAnswerSchema,
  durationMs: z.number().int().min(0).max(3_600_000).optional(),
  createdAt: z.iso.datetime(),
});
/** An item as sent: defaults are filled in. */
export type AttemptInput = z.infer<typeof attemptInputSchema>;

/** What a client sends. Build items with `source` and `attemptNo` set explicitly (AttemptInput is the parsed type). */
export type PostAttemptsRequest = { attempts: AttemptInput[] };

/** Longest `durationMs` the contract accepts; clients clamp to this before sending. */
export const MAX_DURATION_MS = 3_600_000;

/**
 * Clients measure duration with a monotonic clock (performance.now()) and clamp it with this before sending, so a
 * phone left overnight or a clock change never makes an item invalid.
 */
export function clampDurationMs(ms: number): number {
  if (!Number.isFinite(ms)) return 0;
  return Math.min(MAX_DURATION_MS, Math.max(0, Math.round(ms)));
}

/** Only the envelope is checked as a whole (400 if it fails); every item is validated separately. */
export const attemptBatchEnvelopeSchema = z.object({ attempts: z.array(z.unknown()).min(1).max(50) });

export type ParsedAttemptItem =
  | { ok: true; id: string; attempt: AttemptInput }
  /** `id` is the item's id when it is a readable uuid, else null. */
  | { ok: false; id: string | null };
export type ParsedAttemptBatch = { ok: true; items: ParsedAttemptItem[] } | { ok: false };

/**
 * Splits a request body into one entry per item, in order. One bad item (a 2 hour duration, a long paste, a shape
 * from an older build) becomes `{ ok: false }` and is answered `rejected` / `invalid`; it never rejects the batch.
 * `{ ok: false }` for the whole body means 400 (bad envelope; unparseable JSON is also a 400, decided by the caller).
 */
export function parseAttemptBatch(body: unknown): ParsedAttemptBatch {
  const env = attemptBatchEnvelopeSchema.safeParse(body);
  if (!env.success) return { ok: false };
  const idOf = z.uuid();
  return {
    ok: true,
    items: env.data.attempts.map((raw): ParsedAttemptItem => {
      const r = attemptInputSchema.safeParse(raw);
      if (r.success) return { ok: true, id: r.data.id, attempt: r.data };
      const id = raw && typeof raw === "object" ? idOf.safeParse((raw as { id?: unknown }).id) : undefined;
      return { ok: false, id: id?.success ? id.data : null };
    }),
  };
}

export type RejectedReason = "unknown_exercise" | "kind_mismatch" | "unsupported" | "locked_day" | "invalid";
export type AttemptResult =
  | ({ id: string; status: "created" } & Grade)
  | ({ id: string; status: "duplicate" } & Partial<Grade>)
  | { id: string | null; status: "rejected"; reason: RejectedReason };
export type PostAttemptsResponse = { results: AttemptResult[] };

export const completeLessonRequestSchema = z.strictObject({
  day: z.number().int().min(1).max(365),
  sessionId: z.uuid(),
  completedAt: z.iso.datetime(),
});
export type CompleteLessonRequest = z.infer<typeof completeLessonRequestSchema>;
export type CompleteLessonResponse = {
  progress: { day: number; status: "done"; score: number | null; completedAt: string };
  streak: { current: number; longest: number };
  currentDay: number;
};

/** crypto.randomUUID does not exist over plain http (tailnet IP), so fall back to getRandomValues. */
export function newId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
