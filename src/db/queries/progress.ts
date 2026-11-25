// Progress and streak writes for lesson completion. Everything takes a client or a transaction.
import { and, eq, sql } from "drizzle-orm";
import { lessonScore } from "@/lib/progress/lesson-score";
import { nextStreak } from "@/lib/progress/streak";
import { COURSE_DAYS } from "@/lib/progress/config";
import { attempts, profiles, progress, streaks } from "../schema";
import type { DbOrTx } from "../types";

export type StreakValue = { current: number; longest: number };

export async function getProfile(db: DbOrTx, userId: string) {
  const [row] = await db.select().from(profiles).where(eq(profiles.userId, userId));
  if (!row) throw new Error(`no profile for user ${userId}`);
  return row;
}

export async function getStreak(db: DbOrTx, userId: string): Promise<StreakValue> {
  const [row] = await db.select({ current: streaks.current, longest: streaks.longest }).from(streaks).where(eq(streaks.userId, userId));
  return row ?? { current: 0, longest: 0 };
}

/**
 * Records activity on `localDate` (YYYY-MM-DD in the user's zone) and returns the streak. Shared by lesson completion
 * and, later, SRS reviews. The row is locked, so concurrent calls serialise; an older date changes nothing.
 */
export async function touchStreak(db: DbOrTx, userId: string, localDate: string): Promise<StreakValue> {
  await db.insert(streaks).values({ userId }).onConflictDoNothing();
  const [row] = await db.select().from(streaks).where(eq(streaks.userId, userId)).for("update");
  const prev = { current: row.current, longest: row.longest, lastActiveDate: row.lastActiveDate };
  const next = nextStreak(prev, localDate);
  if (next !== prev) {
    await db
      .update(streaks)
      .set({ current: next.current, longest: next.longest, lastActiveDate: next.lastActiveDate, updatedAt: sql`now()` })
      .where(eq(streaks.userId, userId));
  }
  return { current: next.current, longest: next.longest };
}

/** Lesson score for `day`: first attempts (attempt_no = 1) of lesson-source, graded rows only; null when none. */
export async function computeLessonScore(db: DbOrTx, userId: string, day: number): Promise<number | null> {
  const rows = await db
    .select({ exerciseId: attempts.exerciseId, score: attempts.score, createdAt: attempts.createdAt })
    .from(attempts)
    .where(
      and(eq(attempts.userId, userId), eq(attempts.day, day), eq(attempts.source, "lesson"), eq(attempts.attemptNo, 1), sql`${attempts.score} IS NOT NULL`),
    );
  return lessonScore(rows);
}

/**
 * Marks `day` done. Returns the row only when THIS call completed it; an already-done day is left untouched
 * (first completed_at and score are kept) and gives undefined. Safe under concurrent calls: the loser waits on the
 * row lock, then its `WHERE status <> 'done'` no longer matches.
 */
export async function markDone(db: DbOrTx, userId: string, day: number, completedAt: Date, score: number | null) {
  const [row] = await db
    .insert(progress)
    .values({ userId, day, status: "done", score, startedAt: completedAt, completedAt })
    .onConflictDoUpdate({
      target: [progress.userId, progress.day],
      set: { status: "done", score, completedAt, startedAt: sql`COALESCE(${progress.startedAt}, ${completedAt.toISOString()}::timestamptz)`, updatedAt: sql`now()` },
      setWhere: sql`${progress.status} <> 'done'`,
    })
    .returning();
  return row;
}

export async function getProgress(db: DbOrTx, userId: string, day: number) {
  const [row] = await db.select().from(progress).where(and(eq(progress.userId, userId), eq(progress.day, day)));
  return row;
}

/** current_day = max(current_day, day + 1), capped at 365; returns the new value. */
export async function advanceCurrentDay(db: DbOrTx, userId: string, day: number): Promise<number> {
  const [row] = await db
    .update(profiles)
    .set({ currentDay: sql`LEAST(${COURSE_DAYS}, GREATEST(${profiles.currentDay}, ${day + 1}))`, updatedAt: sql`now()` })
    .where(eq(profiles.userId, userId))
    .returning({ currentDay: profiles.currentDay });
  return row.currentDay;
}
