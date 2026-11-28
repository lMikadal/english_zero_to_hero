// Scoring a checkpoint sitting (docs/plans/checkpoint-plan.md 4.4, D2, D6, D12). Pure and client-safe: the server freezes
// the result with it, the pages use isCheckpointPass / weakSkills to read it back.
import type { CheckpointSkillResult } from "@/lib/attempts/contract";
import type { Checkpoint } from "@/lib/content/checkpoint-schema";
import { CHECKPOINT_PASS_SCORE } from "@/lib/progress/config";

export type ScoreRow = { id?: string; exerciseId: string; score: number | null; correct: boolean; createdAt: Date };

/** The oldest row wins (answering again to "fix" an answer does not count); on equal time the smaller id. */
function older(a: ScoreRow, b: ScoreRow): boolean {
  const ta = a.createdAt.getTime();
  const tb = b.createdAt.getTime();
  if (ta !== tb) return ta < tb;
  return (a.id ?? "") < (b.id ?? "");
}

/**
 * Score of a sitting. A section with weight > 0 is the plain mean of the scores of ALL its exercises (an exercise with no
 * row, or a null score, counts 0, so the divisor never depends on how many were answered); the total is
 * sum(weight * section score) / 100. A weight 0 section (self-rated speaking) has `score: null` and `selfOk` = how many
 * exercises were rated ok; it adds nothing to the total. `answered` = exercises that have a row.
 * Rows of exercises that are not in the file are ignored.
 */
export function scoreCheckpoint(cp: Checkpoint, rows: readonly ScoreRow[]): { score: number; skills: CheckpointSkillResult[] } {
  const first = new Map<string, ScoreRow>();
  for (const r of rows) {
    const cur = first.get(r.exerciseId);
    if (!cur || older(r, cur)) first.set(r.exerciseId, r);
  }
  let weighted = 0;
  const skills = cp.sections.map((section): CheckpointSkillResult => {
    const mine = section.exercises.map((e) => first.get(e.id));
    const answered = mine.filter((r) => r !== undefined).length;
    const total = section.exercises.length;
    if (section.weight === 0) {
      return { skill: section.skill, weight: 0, score: null, answered, total, selfOk: mine.filter((r) => r?.correct === true).length };
    }
    const sum = mine.reduce((acc, r) => acc + (r?.score ?? 0), 0);
    const score = total === 0 ? 0 : sum / total;
    weighted += section.weight * score;
    return { skill: section.skill, weight: section.weight, score, answered, total, selfOk: null };
  });
  // the DB CHECK is 0..1: weights that add up to 100 can still drift a hair over 1 in floating point
  return { score: Math.min(1, Math.max(0, weighted / 100)), skills };
}

export const isCheckpointPass = (score: number): boolean => score >= CHECKPOINT_PASS_SCORE - 1e-9;

/** The scored skills under the pass mark (D2): offered as "ควรฝึกซ่อม" even when the total passes. */
export const weakSkills = (skills: readonly CheckpointSkillResult[]): CheckpointSkillResult[] =>
  skills.filter((s) => s.weight > 0 && !isCheckpointPass(s.score ?? 0));

export type CheckpointSummary = { afterDay: number; sittings: number; latest: number; best: number; passed: boolean };

/** Per checkpoint (ordered by afterDay): number of finished sittings, the latest and the best score, passed = any sitting passed. */
export function checkpointSummary(results: readonly { afterDay: number; score: number; completedAt: Date }[]): CheckpointSummary[] {
  const byDay = new Map<number, { afterDay: number; score: number; completedAt: Date }[]>();
  for (const r of results) byDay.set(r.afterDay, [...(byDay.get(r.afterDay) ?? []), r]);
  return [...byDay.entries()]
    .sort(([a], [b]) => a - b)
    .map(([afterDay, list]) => {
      const latest = list.reduce((acc, r) => (r.completedAt.getTime() >= acc.completedAt.getTime() ? r : acc));
      const best = Math.max(...list.map((r) => r.score));
      return { afterDay, sittings: list.length, latest: latest.score, best, passed: isCheckpointPass(best) };
    });
}
