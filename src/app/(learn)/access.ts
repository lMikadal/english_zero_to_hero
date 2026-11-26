// Server-only seam: what the current learner may open. The day page reads the learner's current day here
// (profiles.current_day of whoever getCurrentUserId() says is signed in).
import { cache } from "react";
import { getDb } from "@/db/client";
import { getDayStatus as queryDayStatus } from "@/db/queries/practice";
import { getProfile } from "@/db/queries/progress";
import type { ProgressStatus } from "@/db/schema";
import type { Accent } from "@/lib/audio/source";
import { getCurrentUserId } from "@/lib/server/current-user";

/** One profile read (and, on first use, one seeding write) per request: the layout and the page share it. */
export const getLearnerProfile = cache(async () => getProfile(getDb(), await getCurrentUserId()));

export async function getCurrentDay(): Promise<number> {
  return (await getLearnerProfile()).currentDay;
}

/** The learner's preferred accent for spoken English (profiles.accent, "us" by default). */
export async function getAccent(): Promise<Accent> {
  return (await getLearnerProfile()).accent;
}

/** Progress of one day for the learner (`not_started` when there is no row): the day page opens a done day as a replay. */
export async function getDayStatus(day: number): Promise<ProgressStatus> {
  return queryDayStatus(getDb(), await getCurrentUserId(), day);
}
