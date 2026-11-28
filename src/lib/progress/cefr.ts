// docs/PROGRESS.md section 4: estimated CEFR level.
import { isCheckpointPass } from "@/lib/checkpoints/score";
import { CEFR_REQUIREMENTS } from "./config";
import { normalizeScore } from "./score";
import type { CheckpointResultLike, ProgressLike } from "./types";

export type EstimatedLevel = "preA1" | (typeof CEFR_REQUIREMENTS)[number]["level"];

export type CefrEstimate = {
  level: EstimatedLevel;
  next: EstimatedLevel | null;
  /** 0..100 (rounded down) towards `next`; null at the top level */
  percentToNext: number | null;
};

/**
 * Highest level whose checkpoint was passed (ANY finished sitting of it at the pass mark, docs/plans/checkpoint-plan.md 3.8)
 * AND whose word minimum is met. The checkpoint day's own lesson is an ordinary lesson and has no say.
 * Progress towards the next level is min(vocab progress, lesson progress):
 * - vocab progress = known words / next level's minimum, capped at 100%
 * - lesson progress = done days up to and including the next checkpoint day / that checkpoint day; it is capped at 99%
 *   until that checkpoint is passed, so 100% is reachable only by actually passing
 */
export function estimateCefr(knownWords: number, progress: readonly ProgressLike[], checkpoints: readonly CheckpointResultLike[]): CefrEstimate {
  const doneDays = new Set<number>();
  for (const p of progress) if (p.status === "done") doneDays.add(p.day);

  // a non-finite score never passes; the epsilon of isCheckpointPass lets 0.7 computed as 7/10 or summed floats pass
  const passed = (day: number) => checkpoints.some((c) => c.afterDay === day && isCheckpointPass(normalizeScore(c.score) ?? -1));

  let reached = -1;
  CEFR_REQUIREMENTS.forEach((r, i) => {
    if (passed(r.checkpointDay) && knownWords >= r.minKnownWords) reached = i;
  });

  const level: EstimatedLevel = reached < 0 ? "preA1" : CEFR_REQUIREMENTS[reached].level;
  const target = CEFR_REQUIREMENTS[reached + 1];
  if (!target) return { level, next: null, percentToNext: null };

  let lessonDays = 0;
  for (const day of doneDays) if (day <= target.checkpointDay) lessonDays += 1;
  // integer maths before dividing, so 29/100 gives 29 and not 28.999...
  const vocab = Math.floor((Math.min(knownWords, target.minKnownWords) * 100) / target.minKnownWords);
  const lessons = Math.floor((Math.min(lessonDays, target.checkpointDay) * 100) / target.checkpointDay);
  const percent = Math.min(vocab, lessons);
  return { level, next: target.level, percentToNext: passed(target.checkpointDay) ? percent : Math.min(percent, 99) };
}
