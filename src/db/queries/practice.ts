// Reads for the replay feature (docs/plans/replay-plan.md 4.5). Read only: replays never write progress.
import { and, desc, eq } from "drizzle-orm";
import { progress, type ProgressStatus } from "../schema";
import type { DbOrTx } from "../types";

/** Finished days, newest day first. */
export async function listDoneDays(db: DbOrTx, userId: string): Promise<{ day: number; score: number | null; completedAt: Date }[]> {
  const rows = await db
    .select({ day: progress.day, score: progress.score, completedAt: progress.completedAt })
    .from(progress)
    .where(and(eq(progress.userId, userId), eq(progress.status, "done")))
    .orderBy(desc(progress.day));
  // progress_done_has_completed_at guarantees completedAt for done rows
  return rows.map((r) => ({ day: r.day, score: r.score, completedAt: r.completedAt as Date }));
}

/** `not_started` when the day has no row. */
export async function getDayStatus(db: DbOrTx, userId: string, day: number): Promise<ProgressStatus> {
  const [row] = await db.select({ status: progress.status }).from(progress).where(and(eq(progress.userId, userId), eq(progress.day, day)));
  return row?.status ?? "not_started";
}
