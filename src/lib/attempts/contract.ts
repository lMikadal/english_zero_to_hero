// The attempts API contract shared by the server (route handlers) and the client (offline queue, player).
// Client-safe: must not import node:*, src/db or the content loader. Shapes are documented in
// docs/ARCHITECTURE.md section 5.1.
import { z } from "zod";
import type { Grade } from "@/lib/answers/grade";
import { isCheckpointDay } from "@/lib/content/checkpoint-schema";
import { EXERCISE_ID_PATTERN } from "@/lib/content/schema";

/** Kept equal to `AttemptSource` in src/db/schema.ts by a type test (contract.test.ts). */
export const ATTEMPT_SOURCES = ["lesson", "drill", "retest", "checkpoint", "practice", "checkpoint_retake"] as const;

export const API = {
  attempts: "/api/attempts",
  completeLesson: "/api/lessons/complete",
  completePractice: "/api/practice/complete",
  completeCheckpoint: "/api/checkpoints/complete",
} as const;

const exerciseId = z.string().regex(EXERCISE_ID_PATTERN);
const index = z.number().int().min(0).max(1000);

// Postgres jsonb refuses U+0000 and unpaired surrogates (22P05); one such item must be `invalid`, not a 500.
const UNSTORABLE = /\u0000|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
const storable = (max: number) => z.string().max(max).refine((s) => !UNSTORABLE.test(s), "contains a character that cannot be stored");

/** ISO 8601 with `Z` or a numeric offset. Years outside 1900..2100 are invalid (Postgres limits, absurd clocks); the server clamps the rest. */
export const isoTimestamp = z.iso.datetime({ offset: true }).refine((s) => {
  const year = new Date(s).getUTCFullYear();
  return year >= 1900 && year <= 2100;
}, "timestamp out of range");

export const attemptAnswerSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("choice"), selected: index }),
  z.strictObject({ kind: z.literal("choices"), selected: z.array(index).max(100) }),
  z.strictObject({ kind: z.literal("pairs"), selected: z.array(z.enum(["a", "b"])).max(100) }),
  z.strictObject({ kind: z.literal("text"), text: storable(5000) }),
  z.strictObject({ kind: z.literal("texts"), texts: z.array(storable(1000)).max(100) }),
  z.strictObject({
    kind: z.literal("match"),
    pairs: z.record(storable(100), storable(100)).refine((o) => Object.keys(o).length <= 20, "too many pairs"),
  }),
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
  createdAt: isoTimestamp,
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

export type RejectedReason = "unknown_exercise" | "kind_mismatch" | "unsupported" | "locked_day" | "not_finished" | "invalid";
export type AttemptResult =
  | ({ id: string; status: "created" } & Grade)
  | ({ id: string; status: "duplicate" } & Partial<Grade>)
  | { id: string | null; status: "rejected"; reason: RejectedReason };
export type PostAttemptsResponse = { results: AttemptResult[] };

export const completeLessonRequestSchema = z.strictObject({
  day: z.number().int().min(1).max(365),
  sessionId: z.uuid(),
  completedAt: isoTimestamp,
});
export type CompleteLessonRequest = z.infer<typeof completeLessonRequestSchema>;
export type CompleteLessonResponse = {
  progress: { day: number; status: "done"; score: number | null; completedAt: string };
  streak: { current: number; longest: number };
  currentDay: number;
  /** A: the checkpoint that now blocks day A+1 (the learner must sit it before the next lesson), else null. */
  pendingCheckpoint: number | null;
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

/** Section skills a replay can pick (same values as SKILLS in src/lib/content/schema.ts; a type test keeps them equal). */
export const REPLAY_SKILLS = ["pronunciation", "listening", "speaking", "reading", "writing"] as const;
export type ReplaySkill = (typeof REPLAY_SKILLS)[number];

export const completePracticeRequestSchema = z.strictObject({
  kind: z.literal("replay"), // the future 10-question set will be another kind of this union
  day: z.number().int().min(1).max(365),
  skill: z.enum(REPLAY_SKILLS).nullable(), // null = the whole lesson
  sessionId: z.uuid(),
  completedAt: isoTimestamp,
});
export type CompletePracticeRequest = z.infer<typeof completePracticeRequestSchema>;
export type CompletePracticeResponse = {
  session: { sessionId: string; day: number; skill: ReplaySkill | null; score: number | null; graded: number };
  /** The stored `progress.score` of the lesson (read only), for display. */
  lessonScore: number | null;
  streak: { current: number; longest: number };
  countedForStreak: boolean;
};

export const completeCheckpointRequestSchema = z.strictObject({
  afterDay: z.number().int().refine(isCheckpointDay, "afterDay must be 30, 60, ... 360"),
  sessionId: z.uuid(),
  completedAt: isoTimestamp,
});
export type CompleteCheckpointRequest = z.infer<typeof completeCheckpointRequestSchema>;

/** One skill of a finished sitting; frozen in `checkpoint_results.skills`. */
export type CheckpointSkillResult = {
  skill: ReplaySkill;
  /** Share of the total, 0..100; 0 = shown but not scored. */
  weight: number;
  /** 0..1; null when weight is 0. */
  score: number | null;
  /** Exercises of the section with a stored answer. */
  answered: number;
  total: number;
  /** For a weight 0 section: how many exercises the learner rated "ok"; null otherwise. */
  selfOk: number | null;
};
export type CompleteCheckpointResponse = {
  result: {
    sessionId: string;
    afterDay: number;
    score: number;
    passed: boolean;
    skills: CheckpointSkillResult[];
    completedAt: string;
    /** 1 for the first finished sitting of this checkpoint, 2 for the second ... (this sitting included). */
    sitting: number;
    /** The best score over all finished sittings of this checkpoint. */
    best: number;
  };
  streak: { current: number; longest: number };
  /** Day A+1 when it has a lesson file and can be played now, else null. */
  nextDay: number | null;
};
