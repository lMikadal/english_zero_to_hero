// Streak rule (docs/PROGRESS.md section 5): derived from the set of active calendar days, so the result never
// depends on the order in which days arrive (an offline device may sync a past day late).
import { daysBetween } from "./dates";

export type StreakState = { current: number; longest: number; lastActiveDate: string | null };

/**
 * `dates` are YYYY-MM-DD local dates with activity, in any order, duplicates allowed. `current` is the run of
 * consecutive days that ends at the latest active day (whether it is still alive today is a display concern).
 */
export function computeStreak(dates: readonly string[]): StreakState {
  const days = [...new Set(dates)].sort();
  if (days.length === 0) return { current: 0, longest: 0, lastActiveDate: null };
  let run = 1;
  let longest = 1;
  for (let i = 1; i < days.length; i++) {
    run = daysBetween(days[i - 1], days[i]) === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
  }
  return { current: run, longest, lastActiveDate: days[days.length - 1] };
}
