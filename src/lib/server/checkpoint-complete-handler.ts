// POST /api/checkpoints/complete: ends a checkpoint sitting (docs/plans/checkpoint-plan.md 3.5). It freezes the score into
// `checkpoint_results` and touches the streak; it never writes progress, profiles, attempts or the review cards. The eslint rule
// no-restricted-imports bans those writers from every checkpoint-* file.
import { checkpointSavedAts, getCheckpointResult, insertCheckpointResult, listCheckpointResults, sittingRows, type StoredCheckpointResult } from "@/db/queries/checkpoints";
import { getDayProgress } from "@/db/queries/practice";
import { getProfile, touchStreak } from "@/db/queries/progress";
import { withTransactionRetry } from "@/db/queries/tx";
import { completeCheckpointRequestSchema, type CompleteCheckpointError, type CompleteCheckpointResponse } from "@/lib/attempts/contract";
import { isDayUnlocked } from "@/lib/attempts/unlock";
import { sittingSavedToday } from "@/lib/checkpoints/retake";
import { isCheckpointPass, scoreCheckpoint } from "@/lib/checkpoints/score";
import type { Checkpoint } from "@/lib/content/checkpoint-schema";
import { getCheckpoint, getLesson } from "@/lib/content/repo";
import type { Lesson } from "@/lib/content/schema";
import { localDate, resolveTimeZone } from "@/lib/progress/dates";
import type { HandlerDeps, HandlerResult } from "./attempts-handler";
import { clampTimestamp, timestampFloor } from "./clamp";

export type CheckpointCompleteContent = { getCheckpoint(afterDay: number): Checkpoint | null; getLesson(day: number): Lesson | null };

/** `content` is a test seam: where the checkpoint file and the next lesson come from (default: the content files). */
export async function handleCompleteCheckpoint(
  body: unknown,
  { db, userId, now, content = { getCheckpoint, getLesson } }: HandlerDeps & { content?: CheckpointCompleteContent },
): Promise<HandlerResult<CompleteCheckpointResponse>> {
  const parsed = completeCheckpointRequestSchema.safeParse(body);
  if (!parsed.success) return { status: 400, body: { error: "invalid_body" } };
  const { afterDay, sessionId, completedAt: clientCompletedAt } = parsed.data;
  const conflict = (error: CompleteCheckpointError) => ({ status: 409 as const, body: { error } });
  const notCompletable = conflict("not_completable");

  let file: Checkpoint | null = null;
  try {
    file = content.getCheckpoint(afterDay);
  } catch (err) {
    console.error(`[checkpoint-complete] checkpoint ${afterDay} failed to load:`, err);
  }
  if (!file) return notCompletable;
  const checkpoint = file;
  const exerciseIds = checkpoint.sections.flatMap((s) => s.exercises.map((e) => e.id));

  const response = await withTransactionRetry(db, async (tx): Promise<CompleteCheckpointResponse | "retake_tomorrow" | null> => {
    // Lock order: profile (not locked), progress (not locked), checkpoint_results (unique id), then streaks (locked by
    // touchStreak). A lesson completion locks profile -> progress -> streaks, so the orders never form a cycle.
    const profile = await getProfile(tx, userId);
    const tz = resolveTimeZone(profile.timezone);
    const dayRow = await getDayProgress(tx, userId, afterDay);
    if (dayRow?.status !== "done") return null;

    let stored: StoredCheckpointResult | undefined = await getCheckpointResult(tx, userId, sessionId);
    if (stored && stored.afterDay !== afterDay) return null; // a sitting belongs to one checkpoint
    if (!stored) {
      const rows = await sittingRows(tx, userId, afterDay, sessionId, exerciseIds);
      if (rows.length === 0) return null; // an empty request must not unlock the next day
      // D4: from the next local day only. The date is the day the server stores this sitting (its own clock, in the learner's
      // current time zone) against the days it stored earlier sittings: a sitting begun before midnight and completed after it
      // counts for the new day, and nothing the client claims (completedAt, createdAt) can move it. The same session id sent
      // again was answered above, so a repeat of a stored sitting is never refused. The attempts stay stored, so the same
      // session can be completed tomorrow.
      const earlier = await checkpointSavedAts(tx, userId, afterDay, sessionId);
      if (sittingSavedToday(earlier.map((r) => r.savedAt), now, tz)) return "retake_tomorrow";
      const { score, skills } = scoreCheckpoint(checkpoint, rows);
      const times = rows.map((r) => r.createdAt.getTime());
      const startedAt = new Date(Math.min(...times));
      const lastAttempt = new Date(Math.max(...times));
      const clamped = clampTimestamp(clientCompletedAt, now, timestampFloor(now, profile.startDate, tz));
      const completedAt = clamped < lastAttempt ? lastAttempt : clamped;
      await insertCheckpointResult(tx, { id: sessionId, userId, afterDay, score, skills, startedAt, completedAt, createdAt: now });
      // false from the insert: someone finished the same sitting a moment ago (read theirs), or the id is another user's (undefined: refuse)
      stored = await getCheckpointResult(tx, userId, sessionId);
      if (!stored) return null;
    }

    const sittings = await listCheckpointResults(tx, userId, afterDay);
    const position = sittings.findIndex((r) => r.id === stored.id);
    const upToThis = sittings.slice(0, position + 1);
    // every 200 counts as activity of the day the sitting was finished (D7); a day that has activity gets no second row
    const streak = await touchStreak(tx, userId, localDate(stored.completedAt, tz), "checkpoint");

    const next = afterDay + 1;
    let nextDay: number | null = null;
    try {
      if (isDayUnlocked(next, profile.currentDay) && content.getLesson(next) !== null) nextDay = next;
    } catch (err) {
      console.error(`[checkpoint-complete] lesson for day ${next} failed to load:`, err);
    }
    return {
      result: {
        sessionId: stored.id,
        afterDay,
        score: stored.score,
        passed: isCheckpointPass(stored.score),
        skills: stored.skills,
        completedAt: stored.completedAt.toISOString(),
        sitting: position + 1,
        best: Math.max(...upToThis.map((r) => r.score)),
      },
      streak,
      nextDay,
    };
  });

  if (response === "retake_tomorrow") return conflict("retake_tomorrow");
  if (!response) return notCompletable;
  return { status: 200, body: response };
}
