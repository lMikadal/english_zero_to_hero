// docs/PROGRESS.md section 3: weak points from the last 14 days of attempts.
import {
  DAY_MS,
  DETECTION_SOURCES,
  MIN_ATTEMPTS,
  RECOVERED_ERROR_RATE,
  TOP_WEAKNESSES_PER_ANGLE,
  WEAK_ERROR_RATE,
  WEIGHT_HALF_LIFE_DAYS,
  WEAKNESS_WINDOW_DAYS,
} from "./config";
import { normalizeScore } from "./score";
import type { AttemptLike } from "./types";

export const ANGLES = ["phoneme", "vocab", "exerciseType", "skill"] as const;
export type Angle = (typeof ANGLES)[number];

export type Weakness = { angle: Angle; key: string };

/**
 * Tag every drill and retest attempt carries to name the weakness it targets, e.g. `weakness:phoneme:ae`,
 * `weakness:vocab:v-cat`, `weakness:skill:listening`, `weakness:exerciseType:dictation`. The drill player
 * must use this helper so the string matches what the status formulas look for.
 */
export const weaknessTag = (w: Weakness): string =>
  w.angle === "phoneme" || w.angle === "vocab" ? `weakness:${w.key}` : `weakness:${w.angle}:${w.key}`;

/** Inverse of `weaknessTag`; null when the tag is not a weakness tag. */
export function parseWeaknessTag(tag: string): Weakness | null {
  if (!tag.startsWith("weakness:")) return null;
  const rest = tag.slice("weakness:".length);
  for (const angle of ["phoneme", "vocab"] as const) {
    if (rest.startsWith(`${angle}:`) && rest.length > angle.length + 1) return { angle, key: rest };
  }
  for (const angle of ["skill", "exerciseType"] as const) {
    if (rest.startsWith(`${angle}:`) && rest.length > angle.length + 1) return { angle, key: rest.slice(angle.length + 1) };
  }
  return null;
}

/** The score as a fraction 0..1, or null when the attempt is ungraded. */
export const gradedScore = (a: Pick<AttemptLike, "score">): number | null => normalizeScore(a.score);

export type GroupStat = {
  angle: Angle;
  /** the tag (`phoneme:ae`, `vocab:v-cat`), the exercise type, or the skill */
  key: string;
  /** unweighted number of attempts in the window */
  attempts: number;
  /** weighted sum of (1 - score) / weighted total */
  errorRate: number;
  weak: boolean;
  recovered: boolean;
};

// Error rates are sums of floats; the epsilon keeps "exactly 30%" weak.
const EPSILON = 1e-9;
export const isWeak = (rate: number) => rate >= WEAK_ERROR_RATE - EPSILON;
export const isRecovered = (rate: number) => rate < RECOVERED_ERROR_RATE - EPSILON;

const compareStrings = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Group keys an attempt belongs to, per angle. */
export function groupKeys(a: Pick<AttemptLike, "tags" | "exerciseType" | "skill">): { angle: Angle; key: string }[] {
  const keys: { angle: Angle; key: string }[] = [];
  for (const tag of new Set(a.tags)) {
    if (tag.startsWith("phoneme:")) keys.push({ angle: "phoneme", key: tag });
    else if (tag.startsWith("vocab:")) keys.push({ angle: "vocab", key: tag });
  }
  keys.push({ angle: "exerciseType", key: a.exerciseType }, { angle: "skill", key: a.skill });
  return keys;
}

/**
 * Attempts that count as evidence for detection: graded (score not null) first tries (attemptNo 1) from
 * normal lessons and checkpoints, inside the window.
 */
export function detectionAttempts(attempts: readonly AttemptLike[], now: Date): AttemptLike[] {
  const from = now.getTime() - WEAKNESS_WINDOW_DAYS * DAY_MS;
  return attempts.filter((a) => {
    const t = a.createdAt.getTime();
    return (
      a.attemptNo === 1 &&
      gradedScore(a) !== null &&
      (DETECTION_SOURCES as readonly string[]).includes(a.source) &&
      t >= from &&
      t <= now.getTime()
    );
  });
}

type Acc = { angle: Angle; key: string; attempts: number; wrong: number; total: number };

/** Stats for every group that has at least one detection attempt. */
export function groupStats(attempts: readonly AttemptLike[], now: Date): GroupStat[] {
  const groups = new Map<string, Acc>();
  for (const a of detectionAttempts(attempts, now)) {
    const weight = 0.5 ** ((now.getTime() - a.createdAt.getTime()) / DAY_MS / WEIGHT_HALF_LIFE_DAYS);
    for (const { angle, key } of groupKeys(a)) {
      const id = `${angle}\u0000${key}`;
      let g = groups.get(id);
      if (!g) groups.set(id, (g = { angle, key, attempts: 0, wrong: 0, total: 0 }));
      g.attempts += 1;
      g.total += weight;
      g.wrong += weight * (1 - (gradedScore(a) ?? 1)); // partial credit: error is 1 - score
    }
  }
  return [...groups.values()].map((g) => {
    const errorRate = g.wrong / g.total;
    const enough = g.attempts >= MIN_ATTEMPTS;
    return {
      angle: g.angle,
      key: g.key,
      attempts: g.attempts,
      errorRate,
      weak: enough && isWeak(errorRate),
      recovered: enough && isRecovered(errorRate),
    };
  });
}

export type PoolStat = Pick<GroupStat, "attempts" | "errorRate" | "weak" | "recovered">;

/**
 * Weighted error rate of ONE group's attempts as of `at` (ms), over the 14-day window ending at `at`.
 * The attempts must already be qualifying (graded first tries from lessons/checkpoints) and belong to the
 * group. Same formula as `groupStats`, without grouping, so it is cheap to call per evaluation point.
 */
export function poolStat(pool: readonly AttemptLike[], at: number): PoolStat {
  const from = at - WEAKNESS_WINDOW_DAYS * DAY_MS;
  let attempts = 0;
  let wrong = 0;
  let total = 0;
  for (const a of pool) {
    const t = a.createdAt.getTime();
    if (t < from || t > at) continue;
    const weight = 0.5 ** ((at - t) / DAY_MS / WEIGHT_HALF_LIFE_DAYS);
    attempts += 1;
    total += weight;
    wrong += weight * (1 - (gradedScore(a) ?? 1));
  }
  const errorRate = attempts === 0 ? 0 : wrong / total;
  const enough = attempts >= MIN_ATTEMPTS;
  return { attempts, errorRate, weak: enough && isWeak(errorRate), recovered: enough && isRecovered(errorRate) };
}

/** Highest error rate first; rates within a tiny epsilon are ties, broken by key. */
export const compareRates = (a: { errorRate: number; key: string }, b: { errorRate: number; key: string }) =>
  Math.abs(b.errorRate - a.errorRate) > EPSILON ? b.errorRate - a.errorRate : compareStrings(a.key, b.key);

export const compareStats = compareRates;

/**
 * Weak groups per angle, worst first, at most 5 each. Low-level: it ignores drill progress, so UI code
 * should call `weakPoints` (drills.ts), which also applies fixed/in-progress/recovered state.
 */
export function detectWeaknesses(attempts: readonly AttemptLike[], now: Date): Record<Angle, GroupStat[]> {
  const stats = groupStats(attempts, now).filter((s) => s.weak).sort(compareStats);
  const result: Record<Angle, GroupStat[]> = { phoneme: [], vocab: [], exerciseType: [], skill: [] };
  for (const s of stats) if (result[s.angle].length < TOP_WEAKNESSES_PER_ANGLE) result[s.angle].push(s);
  return result;
}
