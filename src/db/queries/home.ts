// What the home page shows. Read-only; takes the shared client or a transaction.
import { and, eq } from "drizzle-orm";
import { COURSE_DAYS } from "@/lib/progress/config";
import { daysBetween, localDate, resolveTimeZone } from "@/lib/progress/dates";
import { activityDays, progress, streaks } from "../schema";
import type { DbOrTx } from "../types";
import { getProfile } from "./progress";

export type LearnerHome = {
  currentDay: number;
  /** `current` is 0 once the run has lapsed (last active day before yesterday); `longest` is never reduced. */
  streak: { current: number; longest: number };
  /** True when today's date in the learner's time zone already has an activity day. */
  activeToday: boolean;
  /** Day 365 is done (current_day itself stops at 365). */
  courseComplete: boolean;
};

export async function getLearnerHome(db: DbOrTx, userId: string, now: Date = new Date()): Promise<LearnerHome> {
  const profile = await getProfile(db, userId);
  const today = localDate(now, resolveTimeZone(profile.timezone));
  const [streakRow] = await db.select().from(streaks).where(eq(streaks.userId, userId));
  const [active] = await db
    .select({ d: activityDays.localDate })
    .from(activityDays)
    .where(and(eq(activityDays.userId, userId), eq(activityDays.localDate, today)));
  const [last] = await db
    .select({ status: progress.status })
    .from(progress)
    .where(and(eq(progress.userId, userId), eq(progress.day, COURSE_DAYS)));

  const lastActive = streakRow?.lastActiveDate;
  const alive = lastActive != null && daysBetween(lastActive, today) <= 1;
  return {
    currentDay: profile.currentDay,
    streak: { current: alive ? streakRow.current : 0, longest: streakRow?.longest ?? 0 },
    activeToday: active !== undefined,
    courseComplete: last?.status === "done",
  };
}
