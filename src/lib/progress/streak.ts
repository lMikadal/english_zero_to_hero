// Streak rule (docs/PROGRESS.md section 5): a calendar day counts once; consecutive days add one; a gap resets to 1.
import { daysBetween } from "./dates";

export type StreakState = { current: number; longest: number; lastActiveDate: string | null };

/** Streak after activity on `localDate` (YYYY-MM-DD in the user's zone). An older date (late offline replay) changes nothing. */
export function nextStreak(prev: StreakState, localDate: string): StreakState {
  if (prev.lastActiveDate !== null) {
    const gap = daysBetween(prev.lastActiveDate, localDate);
    if (gap <= 0) return prev;
    const current = gap === 1 ? prev.current + 1 : 1;
    return { current, longest: Math.max(prev.longest, current), lastActiveDate: localDate };
  }
  return { current: 1, longest: Math.max(prev.longest, 1), lastActiveDate: localDate };
}
