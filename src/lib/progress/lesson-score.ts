export type LessonScoreRow = { exerciseId: string; score: number | null; createdAt: Date };

/**
 * Lesson score (fraction 0..1): mean over exercises of the latest graded row for each. Callers pass first-attempt
 * (`attempt_no = 1`) lesson rows only; rows with a null score (self-rated speaking, free_write) are ignored.
 * Null when nothing was graded.
 */
export function lessonScore(rows: readonly LessonScoreRow[]): number | null {
  const latest = new Map<string, LessonScoreRow>();
  for (const r of rows) {
    if (r.score === null) continue;
    const cur = latest.get(r.exerciseId);
    if (!cur || r.createdAt >= cur.createdAt) latest.set(r.exerciseId, r);
  }
  if (latest.size === 0) return null;
  let sum = 0;
  for (const r of latest.values()) sum += r.score!;
  return sum / latest.size;
}
