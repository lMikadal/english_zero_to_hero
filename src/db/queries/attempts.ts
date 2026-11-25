// Attempt writes. Everything takes a client or a transaction so handlers can compose them.
import { and, eq, sql } from "drizzle-orm";
import { attempts, profiles, progress } from "../schema";
import type { DbOrTx } from "../types";
import { computeLessonScore } from "./progress";

export type NewAttempt = typeof attempts.$inferInsert & { id: string };

/**
 * The profile with a SHARE lock. A lesson completion holds it FOR UPDATE until it commits, so an attempt for the
 * day that completion unlocks waits for the commit instead of being answered `locked_day` from a stale read.
 */
export async function getProfileShared(db: DbOrTx, userId: string) {
  const [row] = await db.select().from(profiles).where(eq(profiles.userId, userId)).for("share");
  if (!row) throw new Error(`no profile for user ${userId}`);
  return row;
}

/** Idempotent insert: true when a row was created, false when the id already existed (nothing is changed). */
export async function insertAttempt(db: DbOrTx, row: NewAttempt): Promise<boolean> {
  const inserted = await db.insert(attempts).values(row).onConflictDoNothing({ target: attempts.id }).returning({ id: attempts.id });
  return inserted.length > 0;
}

/** The grade stored for an attempt id of this user, or undefined (unknown id, or it belongs to someone else). */
export async function findStoredGrade(db: DbOrTx, userId: string, id: string): Promise<{ correct: boolean; score: number | null } | undefined> {
  const [row] = await db
    .select({ correct: attempts.correct, score: attempts.score })
    .from(attempts)
    .where(and(eq(attempts.id, id), eq(attempts.userId, userId)));
  return row;
}

/**
 * Activity on a day: progress -> in_progress, or an earlier `startedAt` for a day that is not done yet (an offline
 * attempt can sync late). A done day is never touched. Takes the row lock either way (the caller relies on it).
 */
export async function markInProgress(db: DbOrTx, userId: string, day: number, startedAt: Date): Promise<void> {
  await db
    .insert(progress)
    .values({ userId, day, status: "in_progress", startedAt })
    .onConflictDoUpdate({
      target: [progress.userId, progress.day],
      set: { startedAt: sql`LEAST(COALESCE(${progress.startedAt}, ${startedAt.toISOString()}::timestamptz), ${startedAt.toISOString()}::timestamptz)`, updatedAt: sql`now()` },
      setWhere: sql`${progress.status} <> 'done'`,
    });
}

/**
 * After new attempts for a day that is already `done` (a completion that won a race against its own attempts, or a
 * replay): recompute the stored score from the attempts created up to `completed_at`, so a later replay of a
 * finished lesson never rewrites its score. Call after `markInProgress`, which holds the row lock.
 */
export async function refreshDoneScore(db: DbOrTx, userId: string, day: number): Promise<void> {
  const [row] = await db
    .select({ status: progress.status, completedAt: progress.completedAt, score: progress.score })
    .from(progress)
    .where(and(eq(progress.userId, userId), eq(progress.day, day)))
    .for("update");
  if (!row || row.status !== "done" || !row.completedAt) return;
  const score = await computeLessonScore(db, userId, day, row.completedAt);
  if (score === row.score || (score !== null && row.score !== null && Math.abs(score - row.score) < 1e-12)) return; // unchanged: leave the row alone
  await db.update(progress).set({ score, updatedAt: sql`now()` }).where(and(eq(progress.userId, userId), eq(progress.day, day), eq(progress.status, "done")));
}
