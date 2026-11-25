// The ONE place that decides who the current user is. M1 has a single local user; Better Auth (M2) replaces
// the body of getCurrentUserId() and nothing else needs to change (every table already has user_id).
import { getDb } from "@/db/client";
import { profiles, user } from "@/db/schema";
import type { Db } from "@/db/types";
import { localDate } from "@/lib/progress/dates";
import { DEFAULT_TIME_ZONE } from "@/lib/progress/config";

export const LOCAL_USER_ID = "local";

/**
 * Makes sure the local user and its profile exist (start date = today in Asia/Bangkok, day 1) and returns the id.
 * Safe under concurrent first calls: both inserts are ON CONFLICT DO NOTHING, so racers converge on one row each.
 */
export async function ensureLocalUser(db: Db, now: Date = new Date()): Promise<string> {
  await db.transaction(async (tx) => {
    await tx
      .insert(user)
      .values({ id: LOCAL_USER_ID, name: "Learner", email: "local@local.invalid" })
      .onConflictDoNothing();
    await tx
      .insert(profiles)
      .values({ userId: LOCAL_USER_ID, startDate: localDate(now, DEFAULT_TIME_ZONE), currentDay: 1, timezone: DEFAULT_TIME_ZONE })
      .onConflictDoNothing();
  });
  return LOCAL_USER_ID;
}

export function getCurrentUserId(): Promise<string> {
  return ensureLocalUser(getDb());
}
