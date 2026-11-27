// Shared fixtures for the server integration tests (not a test file itself).
import { randomUUID } from "node:crypto";
import { sql as dsql } from "drizzle-orm";
import type { Db } from "@/db/types";
import type { AttemptAnswer, AttemptInput } from "@/lib/attempts/contract";
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
