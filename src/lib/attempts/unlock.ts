// Client-safe. Both the day page and POST /api/attempts use this (docs/plans/m1-lesson-player-decisions.md item 3).

const isDay = (n: number) => Number.isInteger(n) && n >= 1 && n <= 365;

/** A day is playable when `day <= currentDay`; finished days stay open for replay. */
export function isDayUnlocked(day: number, currentDay: number): boolean {
  return isDay(day) && isDay(currentDay) && day <= currentDay;
}
