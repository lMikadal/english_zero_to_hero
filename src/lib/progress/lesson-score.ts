export type LessonScoreRow = { id?: string; exerciseId: string; score: number | null; createdAt: Date };

/**
 * Lesson score (fraction 0..1): mean over exercises of the latest graded row for each (equal `createdAt` is broken
 * on the larger `id`, so the result does not depend on row order). Callers pass first-attempt (`attempt_no = 1`)
 * lesson rows only; rows with a null score (self-rated speaking, free_write) are ignored. Null when nothing was graded.
 */
export function lessonScore(rows: readonly LessonScoreRow[]): number | null {
  const newer = (a: LessonScoreRow, b: LessonScoreRow) => {
    const dt = a.createdAt.getTime() - b.createdAt.getTime();
    return dt !== 0 ? dt > 0 : (a.id ?? "") > (b.id ?? "");
  };
  const latest = new Map<string, LessonScoreRow>();
  for (const r of rows) {
    if (r.score === null) continue;
    const cur = latest.get(r.exerciseId);
    if (!cur || newer(r, cur)) latest.set(r.exerciseId, r);
  }
  if (latest.size === 0) return null;
  let sum = 0;
  for (const r of latest.values()) sum += r.score!;
  return sum / latest.size;
}
