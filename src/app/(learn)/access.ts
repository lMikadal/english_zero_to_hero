// Server-only seam: what the current learner may open. The day page reads the learner's current day here
// (profiles.current_day of whoever getCurrentUserId() says is signed in).
import { getDb } from "@/db/client";
import { getProfile } from "@/db/queries/progress";
import { getCurrentUserId } from "@/lib/server/current-user";

export async function getCurrentDay(): Promise<number> {
  const userId = await getCurrentUserId();
  return (await getProfile(getDb(), userId)).currentDay;
}
