// docs/PROGRESS.md section 3.1: status of one weakness from its drill and retest attempts.
import { MAX_DRILLS_PER_DAY, RETEST_PASS_RATE, RETEST_PASSES_TO_FIX } from "./config";
import { localDate } from "./dates";
import { ANGLES, groupStats, type Angle } from "./weakness";
import type { AttemptLike } from "./types";

export type Weakness = { angle: Angle; key: string };
export type DrillStatus = "not_started" | "in_progress" | "awaiting_retest" | "fixed";

export type SessionResult = {
  sessionId: string;
  completedAt: Date;
  /** calendar date of completedAt in the user's time zone */
  localDate: string;
  correct: number;
  total: number;
  /** correct / total, for showing the score history */
  score: number;
  passed: boolean;
};

export function matchesWeakness(a: AttemptLike, w: Weakness): boolean {
  switch (w.angle) {
    case "phoneme":
    case "vocab":
      return a.tags.includes(w.key);
    case "exerciseType":
      return a.exerciseType === w.key;
    case "skill":
      return a.skill === w.key;
  }
}

/** One result per retest session of this weakness, oldest first. Attempts without a sessionId are ignored. */
export function sessionResults(attempts: readonly AttemptLike[], w: Weakness, timeZone: string): SessionResult[] {
  const sessions = new Map<string, { correct: number; total: number; last: Date }>();
  for (const a of attempts) {
    if (a.source !== "retest" || a.sessionId === null || !matchesWeakness(a, w)) continue;
    const s = sessions.get(a.sessionId) ?? { correct: 0, total: 0, last: a.createdAt };
    s.total += 1;
    if (a.correct) s.correct += 1;
    if (a.createdAt > s.last) s.last = a.createdAt;
    sessions.set(a.sessionId, s);
  }
  return [...sessions]
    .map(([sessionId, s]) => ({
      sessionId,
      completedAt: s.last,
      localDate: localDate(s.last, timeZone),
      correct: s.correct,
      total: s.total,
      score: s.correct / s.total,
      // integer maths: 4/5 must pass at exactly 80%
      passed: s.correct * 100 >= s.total * Math.round(RETEST_PASS_RATE * 100),
    }))
    .sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime() || (a.sessionId < b.sessionId ? -1 : 1));
}

/** Time the weakness became fixed: the second passed retest, on a different local day, after `after`. */
function fixedAt(results: readonly SessionResult[], after: number): Date | null {
  const days = new Set<string>();
  for (const r of results) {
    if (!r.passed || r.completedAt.getTime() <= after) continue;
    days.add(r.localDate);
    if (days.size >= RETEST_PASSES_TO_FIX) return r.completedAt;
  }
  return null;
}

/**
 * Status of one weakness. A fixed weakness reopens when the lesson error rate (lesson and checkpoint
 * attempts made after it was fixed, 14-day window, 5-attempt minimum) is back at the weak threshold;
 * reopening starts a new cycle, so earlier drills and passes no longer count.
 */
export function weaknessStatus(
  attempts: readonly AttemptLike[],
  w: Weakness,
  now: Date,
  timeZone: string,
): { status: DrillStatus; sessions: SessionResult[] } {
  const own = attempts.filter((a) => matchesWeakness(a, w));
  const results = sessionResults(own, w, timeZone);
  let cycleStart = -Infinity;
  for (;;) {
    const fixed = fixedAt(results, cycleStart);
    if (fixed) {
      const later = own.filter((a) => a.createdAt.getTime() > fixed.getTime());
      const stat = groupStats(later, now).find((s) => s.angle === w.angle && s.key === w.key);
      if (stat?.weak) {
        cycleStart = fixed.getTime();
        continue;
      }
      return { status: "fixed", sessions: results };
    }
    const inCycle = own.filter(
      (a) => (a.source === "drill" || a.source === "retest") && a.createdAt.getTime() > cycleStart,
    );
    const passed = results.some((r) => r.passed && r.completedAt.getTime() > cycleStart);
    const status: DrillStatus = passed ? "awaiting_retest" : inCycle.length > 0 ? "in_progress" : "not_started";
    return { status, sessions: results };
  }
}

export type DrillCandidate = Weakness & { status: DrillStatus; errorRate: number };

/** At most 2 weaknesses to recommend today: unfixed, worst error rate first, ties by angle then key. */
export function recommendDrills(candidates: readonly DrillCandidate[], max = MAX_DRILLS_PER_DAY): DrillCandidate[] {
  return candidates
    .filter((c) => c.status !== "fixed")
    .sort(
      (a, b) =>
        b.errorRate - a.errorRate ||
        ANGLES.indexOf(a.angle) - ANGLES.indexOf(b.angle) ||
        (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
    )
    .slice(0, max);
}
