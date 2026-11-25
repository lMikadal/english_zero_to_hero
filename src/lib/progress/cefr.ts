// docs/PROGRESS.md section 4: estimated CEFR level.
import { CEFR_REQUIREMENTS, CHECKPOINT_PASS_SCORE } from "./config";
import type { ProgressLike } from "./types";

export type EstimatedLevel = "preA1" | (typeof CEFR_REQUIREMENTS)[number]["level"];

export type CefrEstimate = {
  level: EstimatedLevel;
  next: EstimatedLevel | null;
  /** 0..100 (rounded down) towards `next`; null at the top level */
  percentToNext: number | null;
};

/**
 * Highest level whose checkpoint day was finished with score >= 70% AND whose word minimum is met.
 * Progress towards the next level is min(vocab progress, lesson progress):
 * - vocab progress = known words / next level's minimum, capped at 100%
 * - lesson progress = done days up to the next checkpoint day / that checkpoint day, where the checkpoint
 *   day itself counts only once passed (so 100% is reachable only by actually passing)
 */
export function estimateCefr(knownWords: number, progress: readonly ProgressLike[]): CefrEstimate {
  const done = new Map<number, ProgressLike>();
  for (const p of progress) if (p.status === "done") done.set(p.day, p);

  const passed = (day: number) => (done.get(day)?.score ?? -1) >= CHECKPOINT_PASS_SCORE;

  let reached = -1;
  CEFR_REQUIREMENTS.forEach((r, i) => {
    if (passed(r.checkpointDay) && knownWords >= r.minKnownWords) reached = i;
  });

  const level: EstimatedLevel = reached < 0 ? "preA1" : CEFR_REQUIREMENTS[reached].level;
  const target = CEFR_REQUIREMENTS[reached + 1];
  if (!target) return { level, next: null, percentToNext: null };

  let doneDays = 0;
  for (const day of done.keys()) {
    if (day < target.checkpointDay || (day === target.checkpointDay && passed(day))) doneDays += 1;
  }
  // integer maths before dividing, so 29/100 gives 29 and not 28.999...
  const vocab = Math.floor((Math.min(knownWords, target.minKnownWords) * 100) / target.minKnownWords);
  const lessons = Math.floor((Math.min(doneDays, target.checkpointDay) * 100) / target.checkpointDay);
  return { level, next: target.level, percentToNext: Math.min(vocab, lessons) };
}
