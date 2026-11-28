// Server-only seam: what the current learner may open. The day page reads the learner's current day here
// (profiles.current_day of whoever getCurrentUserId() says is signed in).
import { cache } from "react";
import { getDb } from "@/db/client";
import { getCheckpointGate } from "@/db/queries/checkpoints";
import { getDayStatus as queryDayStatus } from "@/db/queries/practice";
import { getProfile } from "@/db/queries/progress";
import type { ProgressStatus } from "@/db/schema";
import type { Accent } from "@/lib/audio/source";
import { getCheckpoint } from "@/lib/content/repo";
import { getCurrentUserId } from "@/lib/server/current-user";

/** One profile read (and, on first use, one seeding write) per request: the layout and the page share it. */
export const getLearnerProfile = cache(async () => getProfile(getDb(), await getCurrentUserId()));

export async function getCurrentDay(): Promise<number> {
  return (await getLearnerProfile()).currentDay;
}

/**
 * What the learner may open now: their current day, the checkpoint that blocks day `currentDay` (null when none: no file, a
 * broken file, already sat, or the learner is past it: D15) and the highest day they may play. One read per request.
 */
export const getGate = cache(async () => {
  const profile = await getLearnerProfile();
  const gate = await getCheckpointGate(getDb(), await getCurrentUserId(), profile, { getCheckpoint });
  return { currentDay: profile.currentDay, blocking: gate.blocking, playableDay: gate.playableDay };
});

/** The learner's preferred accent for spoken English (profiles.accent, "us" by default). */
export async function getAccent(): Promise<Accent> {
  return (await getLearnerProfile()).accent;
}

/** Progress of one day for the learner (`not_started` when there is no row): the day page opens a done day as a replay. */
export async function getDayStatus(day: number): Promise<ProgressStatus> {
  return queryDayStatus(getDb(), await getCurrentUserId(), day);
}
