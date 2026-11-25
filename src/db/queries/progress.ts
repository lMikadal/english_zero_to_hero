// Progress and streak writes for lesson completion. Everything takes a client or a transaction.
import { and, asc, eq, lte, sql } from "drizzle-orm";
import { lessonScore } from "@/lib/progress/lesson-score";
import { COURSE_DAYS } from "@/lib/progress/config";
import { computeStreak } from "@/lib/progress/streak";
import { activityDays, attempts, profiles, progress, streaks } from "../schema";
import type { DbOrTx } from "../types";

export type StreakValue = { current: number; longest: number };

/** The profile. `lock: "update"` takes the row lock a completion holds until commit (see getProfileShared). */
export async function getProfile(db: DbOrTx, userId: string, opts: { lock?: "update" } = {}) {
  const q = db.select().from(profiles).where(eq(profiles.userId, userId));
  const [row] = await (opts.lock === "update" ? q.for("update") : q);
  if (!row) throw new Error(`no profile for user ${userId}`);
  return row;
}

export async function getStreak(db: DbOrTx, userId: string): Promise<StreakValue> {
  const [row] = await db.select({ current: streaks.current, longest: streaks.longest }).from(streaks).where(eq(streaks.userId, userId));
  return row ?? { current: 0, longest: 0 };
}

/**
 * Records activity on `localDate` (YYYY-MM-DD in the user's zone) and returns the streak. Shared by lesson completion
 * and, later, SRS reviews. The day goes into `activity_days` and the streak is recomputed from that set, so the result
 * does not depend on arrival order (a past day that syncs late joins its run). `current` is the run of consecutive
 * days ending at the latest active day. The streak row is locked, so concurrent calls serialise.
 */
export async function touchStreak(db: DbOrTx, userId: string, localDate: string, source = "lesson"): Promise<StreakValue> {
  await db.insert(streaks).values({ userId }).onConflictDoNothing();
  await db.select({ userId: streaks.userId }).from(streaks).where(eq(streaks.userId, userId)).for("update");
  await db.insert(activityDays).values({ userId, localDate, source }).onConflictDoNothing();
  const days = await db.select({ d: activityDays.localDate }).from(activityDays).where(eq(activityDays.userId, userId));
  const s = computeStreak(days.map((r) => r.d));
  await db
    .update(streaks)
    .set({ current: s.current, longest: s.longest, lastActiveDate: s.lastActiveDate, updatedAt: sql`now()` })
    .where(eq(streaks.userId, userId));
  return { current: s.current, longest: s.longest };
}

/**
 * Lesson score for `day`: first attempts (attempt_no = 1) of lesson source, graded rows only, latest per exercise;
 * null when none. `upTo` limits it to attempts created at or before that instant.
 */
export async function computeLessonScore(db: DbOrTx, userId: string, day: number, upTo?: Date): Promise<number | null> {
  const rows = await db
    .select({ id: attempts.id, exerciseId: attempts.exerciseId, score: attempts.score, createdAt: attempts.createdAt })
    .from(attempts)
    .where(
      and(
        eq(attempts.userId, userId),
        eq(attempts.day, day),
        eq(attempts.source, "lesson"),
        eq(attempts.attemptNo, 1),
        sql`${attempts.score} IS NOT NULL`,
        upTo ? lte(attempts.createdAt, upTo) : undefined,
      ),
    )
    .orderBy(asc(attempts.createdAt), asc(attempts.id));
  return lessonScore(rows);
}

/** The progress row for `day`, created as in_progress (started now-ish) when missing, and locked FOR UPDATE. */
export async function lockProgress(db: DbOrTx, userId: string, day: number, startedAt: Date) {
  await db.insert(progress).values({ userId, day, status: "in_progress", startedAt }).onConflictDoNothing();
  const [row] = await db
    .select()
    .from(progress)
    .where(and(eq(progress.userId, userId), eq(progress.day, day)))
    .for("update");
  return row;
}

/** Marks a locked, not-yet-done row done. `completedAt` must already be >= started_at. */
export async function finishProgress(db: DbOrTx, userId: string, day: number, completedAt: Date, score: number | null) {
  const [row] = await db
    .update(progress)
    .set({ status: "done", score, completedAt, startedAt: sql`COALESCE(${progress.startedAt}, ${completedAt.toISOString()}::timestamptz)`, updatedAt: sql`now()` })
    .where(and(eq(progress.userId, userId), eq(progress.day, day)))
    .returning();
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
