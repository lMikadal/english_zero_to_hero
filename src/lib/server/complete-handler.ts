// POST /api/lessons/complete: one transaction that finishes the day (docs/ARCHITECTURE.md 5.1).
import {
  advanceCurrentDay,
  computeLessonScore,
  getProfile,
  getProgress,
  getStreak,
  markDone,
  touchStreak,
} from "@/db/queries/progress";
import { completeLessonRequestSchema, type CompleteLessonResponse } from "@/lib/attempts/contract";
import { isDayUnlocked } from "@/lib/attempts/unlock";
import { localDate, resolveTimeZone } from "@/lib/progress/dates";
import { clampToNow } from "./clamp";
import type { HandlerDeps, HandlerResult } from "./attempts-handler";

export async function handleCompleteLesson(body: unknown, { db, userId, now }: HandlerDeps): Promise<HandlerResult<CompleteLessonResponse>> {
  const parsed = completeLessonRequestSchema.safeParse(body);
  if (!parsed.success) return { status: 400, body: { error: "invalid_body" } };
  const { day, completedAt: clientCompletedAt } = parsed.data;

  const response = await db.transaction(async (tx): Promise<CompleteLessonResponse | null> => {
    const profile = await getProfile(tx, userId);
    if (!isDayUnlocked(day, profile.currentDay)) return null;

    const completedAt = clampToNow(clientCompletedAt, now);
    const score = await computeLessonScore(tx, userId, day);
    const done = await markDone(tx, userId, day, completedAt, score);

    if (done) {
      const streak = await touchStreak(tx, userId, localDate(completedAt, resolveTimeZone(profile.timezone)));
      const currentDay = await advanceCurrentDay(tx, userId, day);
      return { progress: { day, status: "done", score: done.score, completedAt: done.completedAt!.toISOString() }, streak, currentDay };
    }
    // already done: report the stored state, change nothing
    const stored = (await getProgress(tx, userId, day))!;
    return {
      progress: { day, status: "done", score: stored.score, completedAt: stored.completedAt!.toISOString() },
      streak: await getStreak(tx, userId),
      currentDay: (await getProfile(tx, userId)).currentDay,
    };
  });

  if (!response) return { status: 409, body: { error: "locked_day" } };
  return { status: 200, body: response };
}
