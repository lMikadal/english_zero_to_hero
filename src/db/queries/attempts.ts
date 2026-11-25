// Attempt writes. Everything takes a client or a transaction so handlers can compose them.
import { and, eq } from "drizzle-orm";
import { attempts, profiles, progress } from "../schema";
import type { DbOrTx } from "../types";

export type NewAttempt = typeof attempts.$inferInsert & { id: string };

export async function getCurrentDay(db: DbOrTx, userId: string): Promise<number> {
  const [row] = await db.select({ currentDay: profiles.currentDay }).from(profiles).where(eq(profiles.userId, userId));
  if (!row) throw new Error(`no profile for user ${userId}`);
  return row.currentDay;
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

/** First activity on a day: progress -> in_progress. An existing row (in_progress or done) is never touched. */
export async function markInProgress(db: DbOrTx, userId: string, day: number, startedAt: Date): Promise<void> {
  await db.insert(progress).values({ userId, day, status: "in_progress", startedAt }).onConflictDoNothing();
}

