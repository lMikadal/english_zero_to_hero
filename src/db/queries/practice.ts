// Reads for the replay feature (docs/plans/replay-plan.md 4.5). Read only: replays never write progress.
import { and, asc, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { attempts, progress, type ProgressStatus } from "../schema";
import type { DbOrTx } from "../types";

/** Finished days, newest day first. */
export async function listDoneDays(db: DbOrTx, userId: string): Promise<{ day: number; score: number | null; completedAt: Date }[]> {
  const rows = await db
    .select({ day: progress.day, score: progress.score, completedAt: progress.completedAt })
    .from(progress)
    .where(and(eq(progress.userId, userId), eq(progress.status, "done")))
    .orderBy(desc(progress.day));
  // progress_done_has_completed_at guarantees completedAt for done rows
  return rows.map((r) => ({ day: r.day, score: r.score, completedAt: r.completedAt as Date }));
}

/** `not_started` when the day has no row. */
export async function getDayStatus(db: DbOrTx, userId: string, day: number): Promise<ProgressStatus> {
  const [row] = await db.select({ status: progress.status }).from(progress).where(and(eq(progress.userId, userId), eq(progress.day, day)));
  return row?.status ?? "not_started";
}

/** The day's progress row (read only), or undefined when there is none. */
export async function getDayProgress(db: DbOrTx, userId: string, day: number) {
  const [row] = await db
    .select({ status: progress.status, score: progress.score, completedAt: progress.completedAt })
    .from(progress)
    .where(and(eq(progress.userId, userId), eq(progress.day, day)));
  return row;
}

/** First graded practice attempts of one session for the given exercises (the rows `lessonScore` takes). */
export async function sessionFirstAttempts(db: DbOrTx, userId: string, day: number, sessionId: string, exerciseIds: readonly string[]) {
  if (exerciseIds.length === 0) return [];
  return db
    .select({ id: attempts.id, exerciseId: attempts.exerciseId, score: attempts.score, createdAt: attempts.createdAt })
    .from(attempts)
    .where(
      and(
        eq(attempts.userId, userId),
        eq(attempts.day, day),
        eq(attempts.sessionId, sessionId),
        eq(attempts.source, "practice"),
        eq(attempts.attemptNo, 1),
        isNotNull(attempts.score),
        inArray(attempts.exerciseId, exerciseIds),
      ),
    )
    .orderBy(asc(attempts.createdAt), asc(attempts.id));
}

/** Whether the session has any stored practice attempt (any attempt_no, score may be null) for these exercises. */
export async function hasSessionActivity(db: DbOrTx, userId: string, day: number, sessionId: string, exerciseIds: readonly string[]): Promise<boolean> {
  if (exerciseIds.length === 0) return false;
  const rows = await db
    .select({ id: attempts.id })
    .from(attempts)
    .where(and(eq(attempts.userId, userId), eq(attempts.day, day), eq(attempts.sessionId, sessionId), eq(attempts.source, "practice"), inArray(attempts.exerciseId, exerciseIds)))
    .limit(1);
  return rows.length > 0;
}
