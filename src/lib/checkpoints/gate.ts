// Which checkpoint (if any) stands between a learner and the next lesson (docs/plans/checkpoint-plan.md D1, 3.2 items 13-16).
// Pure and client-safe. The lock is computed live from facts, never stored, so deleting the exam file or changing the
// rule needs no data fix. The facts come from src/db/queries/checkpoints.ts (getCheckpointGate).
import { isCheckpointDay } from "@/lib/content/checkpoint-schema";

/**
 * The checkpoint A that blocks day A+1, or null. A blocks when the learner's current day is A+1 (so day A is done), A has
 * an exam file, no sitting of A has been finished (whatever its score: D1), and day A+1 has not been started (D15: nobody
 * is locked retroactively). `exists` and `taken` are only asked about A, and only when A is a checkpoint day.
 */
export function blockingCheckpoint(a: {
  currentDay: number;
  exists: (afterDay: number) => boolean;
  taken: (afterDay: number) => boolean;
  /** A `progress` row exists for `currentDay` (any status). */
  currentDayStarted: boolean;
}): number | null {
  const afterDay = a.currentDay - 1;
  if (!isCheckpointDay(afterDay)) return null;
  if (a.currentDayStarted) return null;
  if (!a.exists(afterDay)) return null;
  if (a.taken(afterDay)) return null;
  return afterDay;
}

/** The highest day a learner may play now: the day before the blocking checkpoint's next day, else the current day. */
export const playableDay = (currentDay: number, blocking: number | null): number => (blocking === null ? currentDay : currentDay - 1);
