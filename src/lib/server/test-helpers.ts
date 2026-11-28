// Shared fixtures for the server integration tests (not a test file itself).
import { randomUUID } from "node:crypto";
import { sql as dsql } from "drizzle-orm";
import type { Db } from "@/db/types";
import type { AttemptAnswer, AttemptInput } from "@/lib/attempts/contract";
import { checkpointFixture } from "@/lib/answers/test-content";
import type { Checkpoint } from "@/lib/content/checkpoint-schema";
import { getLesson, getTaughtWords } from "@/lib/content/repo";
import type { ReviewInput } from "@/lib/srs/contract";
import { ensureLocalUser } from "./current-user";

/** A content source with no lessons and no words: pass it as `content` to get "this day has no lesson file" without
 * depending on which files exist in content/ (that folder grows to 365 days, so no day number is safe to call missing). */
export const NO_LESSONS = { getLesson: () => null, getVocab: () => null } as const;

export const NOW = new Date("2026-11-25T10:00:00.000Z");
export const SESSION = "11111111-1111-4111-8111-111111111111";

/** Creates the local user and sets `profiles.current_day`; returns the user id. */
export async function seedLocal(db: Db, currentDay = 1, now = NOW): Promise<string> {
  const userId = await ensureLocalUser(db, now);
  await db.execute(dsql`UPDATE profiles SET current_day = ${currentDay} WHERE user_id = ${userId}`);
  return userId;
}

export function attemptItem(exerciseId: string, answer: AttemptAnswer, over: Partial<AttemptInput> = {}): AttemptInput {
  return {
    id: randomUUID(),
    exerciseId,
    sessionId: SESSION,
    source: "lesson",
    attemptNo: 1,
    answer,
    createdAt: new Date(NOW.getTime() - 60_000).toISOString(),
    ...over,
  };
}

// Right and wrong answers for real day 1-3 exercises (content/lessons/day-00{1..3}.json).
export const ANSWERS = {
  listenChooseRight: { kind: "choice", selected: 0 } as AttemptAnswer, // d001-listen-01
  listenChooseWrong: { kind: "choice", selected: 1 } as AttemptAnswer,
  arrangeRight: { kind: "text", text: "My name is Sam" } as AttemptAnswer, // d001-write-01
  dictationRight: { kind: "text", text: "Nice to meet you" } as AttemptAnswer, // d001-listen-02
  minimalPairRight: { kind: "pairs", selected: ["a", "b", "a"] } as AttemptAnswer, // d001-pron-02
  minimalPairOneWrong: { kind: "pairs", selected: ["b", "b", "a"] } as AttemptAnswer,
  selfOk: { kind: "self", rating: "ok" } as AttemptAnswer, // d001-speak-01 / d001-pron-03
  selfUnsure: { kind: "self", rating: "unsure" } as AttemptAnswer,
};

/** Finishes `day` the normal way (lesson attempts + completion), the precondition of every practice test. */
export async function finishDay(db: Db, userId: string, day: number, now = NOW): Promise<void> {
  const { handleCompleteLesson } = await import("./complete-handler");
  const r = await handleCompleteLesson({ day, sessionId: SESSION, completedAt: now.toISOString() }, { db, userId, now });
  if (r.status !== 200) throw new Error(`could not finish day ${day}: ${JSON.stringify(r.body)}`);
}

export const PRACTICE_SESSION = "22222222-2222-4222-8222-222222222222";

export const REVIEW_SESSION = "33333333-3333-4333-8333-333333333333";

/** A review request item (docs/plans/vocab-review-plan.md 5.1) with a fresh id; `reviewedAt` defaults to a minute before `at`. */
export function reviewItem(
  vocabId: string,
  direction: ReviewInput["direction"],
  rating: ReviewInput["rating"],
  at: Date,
  over: Partial<ReviewInput> = {},
): ReviewInput {
  return { id: randomUUID(), sessionId: REVIEW_SESSION, vocabId, direction, rating, reviewedAt: new Date(at.getTime() - 60_000).toISOString(), ...over };
}

// --- monthly checkpoint (docs/plans/checkpoint-plan.md) -------------------------------------------------------------

export const CP_SESSION = "44444444-4444-4444-8444-444444444444";

/** The content seam the checkpoint handlers take: the real lessons, and `checkpointFixture` as the file of day 30 only (or `files`). */
export function checkpointContent(files: Record<number, Checkpoint | null | "throws"> = { 30: checkpointFixture }) {
  return {
    getLesson,
    getTaughtWords,
    getCheckpoint(afterDay: number): Checkpoint | null {
      const f = files[afterDay];
      if (f === "throws") throw new Error("broken checkpoint file");
      return f ?? null;
    },
  };
}

/** A fully right answer for every exercise of `checkpointFixture`. */
export const CP_RIGHT: Record<string, AttemptAnswer> = {
  "c030-pron-01": { kind: "pairs", selected: ["a", "b", "a"] },
  "c030-pron-02": { kind: "pairs", selected: ["b", "a", "a"] },
  "c030-pron-03": { kind: "pairs", selected: ["a", "b"] },
  "c030-listen-01": { kind: "choice", selected: 0 },
  "c030-listen-02": { kind: "text", text: "My dog is big" },
  "c030-listen-03": { kind: "text", text: "Please come, Ben" },
  "c030-speak-01": { kind: "self", rating: "ok" },
  "c030-speak-02": { kind: "self", rating: "ok" },
  "c030-speak-03": { kind: "self", rating: "unsure" },
  "c030-read-01": { kind: "choices", selected: [0] },
  "c030-read-02": { kind: "choices", selected: [0] },
  "c030-read-03": { kind: "choices", selected: [0] },
  "c030-write-01": { kind: "text", text: "My dog is big" },
  "c030-write-02": { kind: "texts", texts: ["am"] },
  "c030-write-03": { kind: "text", text: "This is my friend" },
  "c030-vocab-01": { kind: "match", pairs: { "v-dog": "v-dog", "v-cat": "v-cat", "v-cup": "v-cup", "v-bus": "v-bus", "v-box": "v-box" } },
};
/** An answer of the right kind that is wrong (score 0) for the exercises that are graded. */
export const CP_WRONG: Record<string, AttemptAnswer> = {
  "c030-pron-01": { kind: "pairs", selected: ["b", "a", "b"] },
  "c030-pron-02": { kind: "pairs", selected: ["a", "b", "b"] },
  "c030-pron-03": { kind: "pairs", selected: ["b", "a"] },
  "c030-listen-01": { kind: "choice", selected: 1 },
  "c030-listen-02": { kind: "text", text: "nope" },
  "c030-listen-03": { kind: "text", text: "nope" },
  "c030-read-01": { kind: "choices", selected: [1] },
  "c030-read-02": { kind: "choices", selected: [1] },
  "c030-read-03": { kind: "choices", selected: [1] },
  "c030-write-01": { kind: "text", text: "dog my" },
  "c030-write-02": { kind: "texts", texts: ["is"] },
  "c030-write-03": { kind: "text", text: "nope" },
  "c030-vocab-01": { kind: "match", pairs: { "v-dog": "v-cat", "v-cat": "v-dog", "v-cup": "v-bus", "v-bus": "v-cup", "v-box": "v-dog" } },
};

/** An attempt of the checkpoint sitting `session` (source checkpoint, attempt 1), one minute before NOW unless `createdAt` is given. */
export function cpItem(exerciseId: string, answer: AttemptAnswer, over: Partial<AttemptInput> = {}): AttemptInput {
  return attemptItem(exerciseId, answer, { source: "checkpoint", sessionId: CP_SESSION, ...over });
}
