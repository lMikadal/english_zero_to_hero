// docs/PROGRESS.md section 3.1: status of weaknesses from their drill and retest attempts, and the
// single list of weak points the UI shows.
import { DAY_MS, MAX_DRILLS_PER_DAY, MIN_RETEST_GRADED_ATTEMPTS, RETEST_PASS_RATE, RETEST_PASSES_TO_FIX, TOP_WEAKNESSES_PER_ANGLE, WEAKNESS_WINDOW_DAYS } from "./config";
import { localDate, resolveTimeZone } from "./dates";
import { hasRole } from "./sources";
import {
  ANGLES,
  compareRates,
  gradedScore,
  groupKeys,
  groupStats,
  parseWeaknessTag,
  poolStat,
  type PoolStat,
  weaknessTag,
  type Weakness,
} from "./weakness";
import type { AttemptLike } from "./types";

export type DrillStatus = "not_started" | "in_progress" | "awaiting_retest" | "fixed";

export type SessionResult = {
  sessionId: string;
  /** ISO timestamp of the session's last attempt */
  completedAt: string;
  /** calendar date of completedAt in the user's time zone */
  localDate: string;
  /** number of graded attempts (score not null) */
  graded: number;
  /** mean score of the graded attempts, 0..1 (0 when none) */
  score: number;
  passed: boolean;
};

const isLessonSource = (a: AttemptLike) => hasRole(a.source, "detection");
const isDrillSource = (a: AttemptLike) => hasRole(a.source, "drillActivity");

/**
 * Does the attempt count for this weakness? Drill and retest attempts match ONLY by their
 * `weakness:*` tag. Lesson and checkpoint attempts match by phoneme/vocab tag, exercise type or skill.
 */
export function matchesWeakness(a: AttemptLike, w: Weakness): boolean {
  if (isDrillSource(a)) return a.tags.includes(weaknessTag(w));
  return groupKeys(a).some((k) => k.angle === w.angle && k.key === w.key);
}

/** One result per retest session of this weakness, oldest first. Attempts without a sessionId are ignored. */
export function sessionResults(attempts: readonly AttemptLike[], w: Weakness, timeZone: string): SessionResult[] {
  const tz = resolveTimeZone(timeZone);
  const sessions = new Map<string, { sum: number; graded: number; last: number }>();
  for (const a of attempts) {
    if (a.source !== "retest" || a.sessionId === null || !matchesWeakness(a, w)) continue;
    const s = sessions.get(a.sessionId) ?? { sum: 0, graded: 0, last: -Infinity };
    s.last = Math.max(s.last, a.createdAt.getTime());
    const score = gradedScore(a);
    if (score !== null) {
      s.graded += 1;
      s.sum += score;
    }
    sessions.set(a.sessionId, s);
  }
  return [...sessions]
    .map(([sessionId, s]) => {
      const last = new Date(s.last);
      return {
        sessionId,
        completedAt: last.toISOString(),
        localDate: localDate(last, tz),
        graded: s.graded,
        score: s.graded === 0 ? 0 : s.sum / s.graded,
        // compare sums, not means, with an epsilon: 6.4 of 8 must pass at exactly 80%
        passed: s.graded >= MIN_RETEST_GRADED_ATTEMPTS && s.sum >= s.graded * RETEST_PASS_RATE - 1e-9,
      };
    })
    .sort((a, b) => (a.completedAt < b.completedAt ? -1 : a.completedAt > b.completedAt ? 1 : 0) || (a.sessionId < b.sessionId ? -1 : 1));
}

/** Time the weakness became fixed: the second passed retest, on a different local day, after `after`. */
function fixedAt(results: readonly SessionResult[], after: number): number | null {
  const days = new Set<string>();
  for (const r of results) {
    const t = Date.parse(r.completedAt);
    if (!r.passed || t <= after) continue;
    days.add(r.localDate);
    if (days.size >= RETEST_PASSES_TO_FIX) return t;
  }
  return null;
}

export type WeaknessEvaluation = {
  status: DrillStatus;
  sessions: SessionResult[];
  /** error rate now, from qualifying lesson/checkpoint attempts made after the last fix (0 when none) */
  errorRate: number;
  /** number of those attempts inside the 14-day window */
  attempts: number;
  weak: boolean;
  recovered: boolean;
  /** local date of the latest passed retest of the current cycle, or null */
  passedOn: string | null;
};

/**
 * Status of one weakness.
 * - A weakness is fixed after 2 passed retests on different local days.
 * - After a fix, it reopens at the first qualifying lesson/checkpoint attempt (made after the fix) at
 *   which the weak rule holds, with the 14-day window ending at that attempt. Reopening starts a new
 *   cycle: only drill/retest attempts after that moment count.
 * - A cycle that is open (in progress or awaiting a retest) is closed, and shown as not started, when
 *   the current error rate has recovered on its own (< 15% with at least 5 attempts).
 * - The error rate counts only lesson/checkpoint attempts made after the last fix.
 */
export function evaluateWeakness(
  attempts: readonly AttemptLike[],
  w: Weakness,
  now: Date,
  timeZone: string,
): WeaknessEvaluation {
  const tz = resolveTimeZone(timeZone);
  const nowMs = now.getTime();
  const own = attempts.filter((a) => matchesWeakness(a, w) && a.createdAt.getTime() <= nowMs);
  const lessons = own
    .filter((a) => isLessonSource(a) && a.attemptNo === 1 && gradedScore(a) !== null)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const drills = own.filter(isDrillSource);
  const sessions = sessionResults(own, w, tz);

  /**
   * First time t (ms) after `after` and before `before` at which `test` holds for the window ending at t.
   * `pool` is sorted by time. Candidate times are the pool's attempt times plus `extra`. Two pointers keep
   * the window at its 14-day slice, so the work is (points x window size), not (points x pool size).
   */
  const firstTime = (
    pool: readonly AttemptLike[],
    after: number,
    before: number,
    extra: number[],
    test: (s: PoolStat, t: number) => boolean,
  ): number | null => {
    const times = [...new Set([...pool.map((a) => a.createdAt.getTime()), ...extra])]
      .filter((t) => t > after && t < before)
      .sort((x, y) => x - y);
    let lo = 0;
    let hi = 0;
    for (const t of times) {
      while (hi < pool.length && pool[hi].createdAt.getTime() <= t) hi += 1;
      while (lo < hi && pool[lo].createdAt.getTime() < t - WEAKNESS_WINDOW_DAYS * DAY_MS) lo += 1;
      if (test(poolStat(pool.slice(lo, hi), t), t)) return t;
    }
    return null;
  };
  const firstDrillAfter = (t0: number) =>
    drills.reduce((m, a) => (a.createdAt.getTime() > t0 ? Math.min(m, a.createdAt.getTime()) : m), Infinity);

  let cycleStart = -Infinity;
  let baseStart = -Infinity;
  let fixed = false;
  for (;;) {
    const f = fixedAt(sessions, cycleStart);
    // Natural recovery closes an open cycle: the first moment (a lesson attempt, or now) with drill
    // activity in the cycle at which the rate is < 15% over >= 5 attempts. Older sessions then no longer count.
    const activityFrom = firstDrillAfter(cycleStart);
    const base = lessons.filter((a) => a.createdAt.getTime() > baseStart);
    const recoveredAt = firstTime(base, Math.max(cycleStart, activityFrom - 1), f ?? Infinity, [nowMs], (s) => s.recovered);
    if (recoveredAt !== null) {
      cycleStart = recoveredAt;
      continue;
    }
    if (f === null) break;
    baseStart = f;
    const post = lessons.filter((a) => a.createdAt.getTime() > f);
    const reopenAt = firstTime(post, f, Infinity, [], (s) => s.weak);
    if (reopenAt === null) {
      fixed = true;
      break;
    }
    cycleStart = reopenAt;
  }

  const base = lessons.filter((a) => a.createdAt.getTime() > baseStart);
  const stat = poolStat(base, nowMs);
  const errorRate = stat.errorRate;
  const count = stat.attempts;
  const weak = stat.weak;
  const recovered = stat.recovered;

  const cycleSessions = sessions.filter((r) => Date.parse(r.completedAt) > cycleStart);
  const passed = cycleSessions.filter((r) => r.passed);
  const active = drills.some((a) => a.createdAt.getTime() > cycleStart);
  let status: DrillStatus;
  if (fixed) status = "fixed";
  else if (passed.length > 0) status = "awaiting_retest";
  else if (active) status = "in_progress";
  else status = "not_started";

  return {
    status,
    sessions,
    errorRate,
    attempts: count,
    weak,
    recovered,
    passedOn: passed.length > 0 ? passed[passed.length - 1].localDate : null,
  };
}

/** Status (and session history) of one weakness. See `evaluateWeakness` for the rules. */
export const weaknessStatus = evaluateWeakness;

export type WeakPoint = Weakness & {
  errorRate: number;
  attempts: number;
  status: DrillStatus;
  /** local date of the latest passed retest in the current cycle, or null */
  passedOn: string | null;
};

/**
 * THE list the UI shows: weak points per angle (ordered by angle, then worst error rate, at most 5 per
 * angle). A group is listed when it is weak now (>= 30% with >= 5 qualifying attempts), or it has an
 * open drill cycle and has not recovered. Fixed and naturally recovered weaknesses are not listed.
 */
export function weakPoints(attempts: readonly AttemptLike[], now: Date, timeZone: string): WeakPoint[] {
  const candidates = new Map<string, Weakness>();
  const add = (w: Weakness) => candidates.set(`${w.angle}\u0000${w.key}`, w);
  for (const s of groupStats(attempts, now)) if (s.weak) add({ angle: s.angle, key: s.key });
  for (const a of attempts) {
    if (!isDrillSource(a)) continue;
    for (const tag of a.tags) {
      const w = parseWeaknessTag(tag);
      if (w) add(w);
    }
  }

  const listed: WeakPoint[] = [];
  for (const w of candidates.values()) {
    const ev = evaluateWeakness(attempts, w, now, timeZone);
    const open = ev.status === "in_progress" || ev.status === "awaiting_retest";
    if (ev.status === "fixed" || !(ev.weak || (open && !ev.recovered))) continue;
    listed.push({ ...w, errorRate: ev.errorRate, attempts: ev.attempts, status: ev.status, passedOn: ev.passedOn });
  }

  const result: WeakPoint[] = [];
  for (const angle of ANGLES) {
    result.push(...listed.filter((p) => p.angle === angle).sort(compareRates).slice(0, TOP_WEAKNESSES_PER_ANGLE));
  }
  return result;
}

/**
 * At most 2 weak points to recommend today: not fixed, not awaiting a retest that already passed today
 * (it cannot progress until tomorrow), worst error rate first, ties by angle order then key.
 * `today` is the local calendar date, "YYYY-MM-DD".
 */
export function recommendDrills(points: readonly WeakPoint[], today: string, max = MAX_DRILLS_PER_DAY): WeakPoint[] {
  return points
    .filter((p) => p.status !== "fixed" && !(p.status === "awaiting_retest" && p.passedOn === today))
    .sort((a, b) => {
      const byRate = compareRates({ errorRate: a.errorRate, key: "" }, { errorRate: b.errorRate, key: "" });
      return byRate || ANGLES.indexOf(a.angle) - ANGLES.indexOf(b.angle) || compareRates(a, b);
    })
    .slice(0, max);
}
