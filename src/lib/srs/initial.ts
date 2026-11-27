// When a new card is first due. The ONE place that decides it (docs/plans/vocab-review-plan.md 2.1/4); the server
// calls this and never computes a due date itself. Pure and client-safe.
import { addDays, localDate, localMidnight } from "@/lib/progress/dates";
import { SIBLING_STAGGER_DAYS } from "./config";
import type { ReviewDirection } from "./contract";

export type CardOrigin =
  /** The lesson was just finished; `completedAt` is the instant the server stored. */
  | { kind: "lesson"; completedAt: Date }
  /** The lesson was finished before this feature existed: the cards are created now. */
  | { kind: "backfill" };

/** A Record: a new direction without a rule is a compile error. */
export function initialDues(origin: CardOrigin, now: Date, timeZone: string): Record<ReviewDirection, Date> {
  if (origin.kind === "lesson") {
    const first = addDays(localDate(origin.completedAt, timeZone), 1);
    return {
      en_th: localMidnight(first, timeZone),
      th_en: localMidnight(addDays(first, SIBLING_STAGGER_DAYS), timeZone),
    };
  }
  return {
    en_th: new Date(now),
    th_en: localMidnight(addDays(localDate(now, timeZone), 1), timeZone),
  };
}
