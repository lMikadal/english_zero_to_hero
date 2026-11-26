// POST /api/practice/complete: ends a replay session (docs/plans/replay-plan.md 3.4). It reads progress and writes
// nothing of progress / profiles / attempts; the only writes are the streak (activity_days + streaks) of a whole-lesson
// replay. The eslint rule no-restricted-imports bans the progress writers from every practice-* file.
import { getProfile, getStreak, touchStreak } from "@/db/queries/progress";
import { getDayProgress, hasSessionActivity, sessionFirstAttempts } from "@/db/queries/practice";
import { withTransactionRetry } from "@/db/queries/tx";
import { completePracticeRequestSchema, type CompletePracticeResponse } from "@/lib/attempts/contract";
import { getLesson } from "@/lib/content/repo";
import { replaySections } from "@/lib/practice/replay";
import { localDate, resolveTimeZone } from "@/lib/progress/dates";
import { lessonScore } from "@/lib/progress/lesson-score";
import type { HandlerDeps, HandlerResult } from "./attempts-handler";
import { clampTimestamp, timestampFloor } from "./clamp";

export async function handleCompletePractice(body: unknown, { db, userId, now }: HandlerDeps): Promise<HandlerResult<CompletePracticeResponse>> {
  const parsed = completePracticeRequestSchema.safeParse(body);
  if (!parsed.success) return { status: 400, body: { error: "invalid_body" } };
  const { day, skill, sessionId, completedAt: clientCompletedAt } = parsed.data;

  let lesson;
  try {
    lesson = getLesson(day);
  } catch (err) {
    console.error(`[practice-complete] lesson for day ${day} failed to load:`, err);
    lesson = null;
  }
  const exerciseIds = lesson ? replaySections(lesson, skill).flatMap((s) => s.exercises.map((e) => e.id)) : [];
  const notReplayable = { status: 409 as const, body: { error: "not_replayable" } };
  if (!lesson || exerciseIds.length === 0) return notReplayable;

  const response = await withTransactionRetry(db, async (tx): Promise<CompletePracticeResponse | null> => {
    // Lock order: profile (not locked), progress (not locked), then streaks (locked by touchStreak). The lesson
    // completion locks profile -> progress -> streaks, so the orders never form a cycle.
    const profile = await getProfile(tx, userId);
    const row = await getDayProgress(tx, userId, day);
    if (row?.status !== "done" || !row.completedAt) return null;

    const rows = await sessionFirstAttempts(tx, userId, day, sessionId, exerciseIds);
    const score = lessonScore(rows);
    const graded = new Set(rows.map((r) => r.exerciseId)).size;

    // Whole lesson counts only with real activity: at least one stored practice attempt of this session.
    const counted = skill === null && (await hasSessionActivity(tx, userId, day, sessionId, exerciseIds));
    let streak;
    if (counted) {
      const tz = resolveTimeZone(profile.timezone);
      // never earlier than the day's own completion: a replay can be completed many times, so it must not back-fill days
      const clamped = clampTimestamp(clientCompletedAt, now, timestampFloor(now, profile.startDate, tz));
      const at = clamped < row.completedAt ? row.completedAt : clamped;
      streak = await touchStreak(tx, userId, localDate(at, tz), "practice");
    } else {
      streak = await getStreak(tx, userId);
    }
    return { session: { sessionId, day, skill, score, graded }, lessonScore: row.score, streak, countedForStreak: counted };
  });

  if (!response) return notReplayable;
  return { status: 200, body: response };
}
