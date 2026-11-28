// D4: a checkpoint may be sat again from the next calendar day (docs/plans/checkpoint-plan.md). One function decides it, for the
// server (POST /api/checkpoints/complete refuses with retake_tomorrow) and for the pages (getCheckpointOverview.completedToday),
// so the page never offers a sitting the server will refuse. Pure and client-safe.
import { localDate } from "@/lib/progress/dates";

/**
 * True when any of the sittings was stored on today's date in the learner's time zone. `savedAts` are the SERVER's times
 * (`checkpoint_results.created_at`), never the `completedAt` a client claims, and `now` is the server clock, so a client
 * cannot back-date its way around the rule. The zone is the profile's current one for both sides: after a zone change the
 * earlier sittings are judged by the new zone's calendar. An invalid zone falls back to Asia/Bangkok.
 */
export function sittingSavedToday(savedAts: readonly Date[], now: Date, timeZone: string): boolean {
  const today = localDate(now, timeZone);
  return savedAts.some((d) => localDate(d, timeZone) === today);
}
