// docs/PROGRESS.md section 5: progress against the 365-day plan. All dates are calendar dates in the
// user's time zone.
import { COURSE_DAYS, DEFAULT_TIME_ZONE, PACE_WINDOW_DAYS, SLIGHTLY_BEHIND_MAX_DAYS } from "./config";
import { addDays, daysBetween, localDate } from "./dates";
import type { ProgressLike } from "./types";

export type PaceStatus = "on_track" | "slightly_behind" | "behind";
export type ProjectedFinish = { kind: "date"; date: string } | { kind: "cannot_project" };

export type PaceResult = {
  /** day the plan says the learner should be on, 1..365 */
  expectedDay: number;
  /** number of lessons done */
  reachedDay: number;
  /** expectedDay - reachedDay - 1; zero or negative means on track */
  daysBehind: number;
  /** lessons finished in the last 14 local days (today included) / 14 */
  pace: number;
  projectedFinish: ProjectedFinish;
  status: PaceStatus;
};

export function estimatePace(input: {
  /** profiles.startDate, "YYYY-MM-DD" */
  startDate: string;
  now: Date;
  timeZone?: string;
  progress: readonly ProgressLike[];
}): PaceResult {
  const timeZone = input.timeZone ?? DEFAULT_TIME_ZONE;
  const today = localDate(input.now, timeZone);
  const expectedDay = Math.min(COURSE_DAYS, Math.max(1, daysBetween(input.startDate, today) + 1));

  const done = input.progress.filter((p) => p.status === "done");
  const reachedDay = done.length;
  const daysBehind = expectedDay - reachedDay - 1;

  const windowStart = addDays(today, -(PACE_WINDOW_DAYS - 1));
  const recent = done.filter((p) => {
    if (!p.completedAt) return false;
    const d = localDate(p.completedAt, timeZone);
    return d >= windowStart && d <= today;
  }).length;

  const remaining = Math.max(0, COURSE_DAYS - reachedDay);
  let projectedFinish: ProjectedFinish;
  if (remaining === 0) projectedFinish = { kind: "date", date: today };
  else if (recent === 0) projectedFinish = { kind: "cannot_project" };
  else projectedFinish = { kind: "date", date: addDays(today, Math.ceil((remaining * PACE_WINDOW_DAYS) / recent)) };

  const status: PaceStatus =
    daysBehind <= 0 ? "on_track" : daysBehind <= SLIGHTLY_BEHIND_MAX_DAYS ? "slightly_behind" : "behind";

  return { expectedDay, reachedDay, daysBehind, pace: recent / PACE_WINDOW_DAYS, projectedFinish, status };
}
