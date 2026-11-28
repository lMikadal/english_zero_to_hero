// POST /api/lessons/complete: one transaction that finishes the day (docs/ARCHITECTURE.md 5.1).
import {
  advanceCurrentDay,
  computeLessonScore,
  finishProgress,
  getProfile,
  getStreak,
  lockProgress,
  touchStreak,
} from "@/db/queries/progress";
import { withTransactionRetry } from "@/db/queries/tx";
import { completeLessonRequestSchema, type CompleteLessonResponse } from "@/lib/attempts/contract";
import { isDayUnlocked } from "@/lib/attempts/unlock";
import { reconcileCards, repoContent, type CardContent } from "@/lib/srs/cards";
import { localDate, resolveTimeZone } from "@/lib/progress/dates";
import type { HandlerDeps, HandlerResult } from "./attempts-handler";
import { clampTimestamp, timestampFloor } from "./clamp";

/** A day can be completed only when the lesson exists (a missing or broken file must not unlock the next day). */
function lessonExists(day: number, content: Pick<CardContent, "getLesson">): boolean {
  try {
    return content.getLesson(day) !== null;
  } catch (err) {
    console.error(`[complete] lesson for day ${day} failed to load:`, err);
    return false;
  }
}

/** `content` is a test seam: where lessons (do they exist?) and the words of the finished lessons come from (default: the content files). */
export async function handleCompleteLesson(body: unknown, { db, userId, now, content }: HandlerDeps & { content?: CardContent }): Promise<HandlerResult<CompleteLessonResponse>> {
  const parsed = completeLessonRequestSchema.safeParse(body);
  if (!parsed.success) return { status: 400, body: { error: "invalid_body" } };
  const { day, completedAt: clientCompletedAt } = parsed.data;
  const exists = lessonExists(day, content ?? repoContent);

  const response = await withTransactionRetry(db, async (tx): Promise<CompleteLessonResponse | null> => {
    // Lock order: profile, then this day's progress row, then streak. Attempts take the profile SHARE lock first too.
    const profile = await getProfile(tx, userId, { lock: "update" });
    if (!exists || !isDayUnlocked(day, profile.currentDay)) return null;

    const tz = resolveTimeZone(profile.timezone);
    const clamped = clampTimestamp(clientCompletedAt, now, timestampFloor(now, profile.startDate, tz));
    const row = await lockProgress(tx, userId, day, clamped);

    if (row.status === "done") {
      // already done: report the stored state, change nothing
      return {
        progress: { day, status: "done", score: row.score, completedAt: row.completedAt!.toISOString() },
        streak: await getStreak(tx, userId),
        currentDay: profile.currentDay,
        pendingCheckpoint: null, // PR 3 of docs/plans/checkpoint-plan.md fills this in (the gate is not wired into the handlers yet)
      };
    }

    // started_at <= completed_at, always (the first attempt may carry a later clock than the completion)
    const completedAt = row.startedAt && row.startedAt > clamped ? row.startedAt : clamped;
    const score = await computeLessonScore(tx, userId, day, completedAt);
    const done = await finishProgress(tx, userId, day, completedAt, score);
    const streak = await touchStreak(tx, userId, localDate(completedAt, tz));
    const currentDay = await advanceCurrentDay(tx, userId, day);
    // the lesson's words become review cards in the same transaction (docs/plans/vocab-review-plan.md 2.1); not reported in the response
    await reconcileCards(tx, userId, now, tz, { completed: { day, completedAt }, content });
    return { progress: { day, status: "done", score: done.score, completedAt: done.completedAt!.toISOString() }, streak, currentDay, pendingCheckpoint: null };
  });

  if (!response) return { status: 409, body: { error: "locked_day" } };
  return { status: 200, body: response };
}
