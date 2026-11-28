// What the home page shows. Read-only; takes the shared client or a transaction.
import { and, eq } from "drizzle-orm";
import { getCheckpoint } from "@/lib/content/repo";
import { COURSE_DAYS } from "@/lib/progress/config";
import { daysBetween, localDate, resolveTimeZone } from "@/lib/progress/dates";
import { activityDays, progress, streaks } from "../schema";
import type { DbOrTx } from "../types";
import { getCheckpointGate, getCheckpointOverview, type CheckpointContent } from "./checkpoints";
import { getProfile } from "./progress";

export type LearnerHome = {
  currentDay: number;
  /** `current` is 0 once the run has lapsed (last active day before yesterday); `longest` is never reduced. */
  streak: { current: number; longest: number };
  /** True when today's date in the learner's time zone already has an activity day. */
  activeToday: boolean;
  /** Day 365 is done (current_day itself stops at 365). */
  courseComplete: boolean;
  /** A: the monthly checkpoint that holds day A+1 back until it is sat (any score), else null (docs/plans/checkpoint-plan.md D1). */
  blockingCheckpoint: number | null;
  /**
   * The latest checkpoint that is open (its file loads and day A is done) when it is not passed yet; null when it is passed
   * or none is open. `status` is `not_taken` or `not_passed`.
   */
  checkpointNote: { afterDay: number; status: "not_taken" | "not_passed" } | null;
};

export async function getLearnerHome(
  db: DbOrTx,
  userId: string,
  now: Date = new Date(),
  /** a test seam: where the checkpoint files come from (default: the content files) */
  content: CheckpointContent = { getCheckpoint },
): Promise<LearnerHome> {
  const profile = await getProfile(db, userId);
  const today = localDate(now, resolveTimeZone(profile.timezone));
  const [[streakRow], [active], [last]] = await Promise.all([
    db.select().from(streaks).where(eq(streaks.userId, userId)),
    db
      .select({ d: activityDays.localDate })
      .from(activityDays)
      .where(and(eq(activityDays.userId, userId), eq(activityDays.localDate, today))),
    db
      .select({ status: progress.status })
      .from(progress)
      .where(and(eq(progress.userId, userId), eq(progress.day, COURSE_DAYS))),
  ]);

  const gate = await getCheckpointGate(db, userId, profile, content);
  const open = await getCheckpointOverview(db, userId, content, now);
  const latest = open.at(-1);
  const checkpointNote = latest && latest.status !== "passed" ? { afterDay: latest.afterDay, status: latest.status } : null;

  const lastActive = streakRow?.lastActiveDate;
  const alive = lastActive != null && daysBetween(lastActive, today) <= 1;
  return {
    currentDay: profile.currentDay,
    streak: { current: alive ? streakRow.current : 0, longest: streakRow?.longest ?? 0 },
    activeToday: active !== undefined,
    courseComplete: last?.status === "done",
    blockingCheckpoint: gate.blocking,
    checkpointNote,
  };
}
