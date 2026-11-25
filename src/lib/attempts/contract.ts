// The attempts API contract shared by the server (route handlers) and the client (offline queue, player).
// Client-safe: must not import node:*, src/db or the content loader. Shapes are documented in
// docs/ARCHITECTURE.md section 5.1.
import { z } from "zod";
import type { Grade } from "@/lib/answers/grade";

/** Kept equal to `AttemptSource` in src/db/schema.ts by a type test (contract.test.ts). */
export const ATTEMPT_SOURCES = ["lesson", "drill", "retest", "checkpoint"] as const;

export const API = { attempts: "/api/attempts", completeLesson: "/api/lessons/complete" } as const;

const exerciseId = z.string().regex(/^d\d{3}-(pron|listen|speak|read|write|vocab)-\d{2}$/);
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

export const postAttemptsRequestSchema = z.strictObject({
  attempts: z.array(attemptInputSchema).min(1).max(50),
});
export type PostAttemptsRequest = z.infer<typeof postAttemptsRequestSchema>;

export type RejectedReason = "unknown_exercise" | "kind_mismatch" | "unsupported" | "locked_day";
export type AttemptResult =
  | ({ id: string; status: "created" | "duplicate" } & Partial<Grade>)
  | { id: string; status: "rejected"; reason: RejectedReason };
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
