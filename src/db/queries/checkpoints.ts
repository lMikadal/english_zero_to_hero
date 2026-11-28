// Reads and the one idempotent write for the monthly checkpoint (docs/plans/checkpoint-plan.md 4.7). Everything takes a
// client or a transaction. The checkpoint never writes `progress` or `profiles`; the lock is computed from what is here.
import { and, asc, eq, gt, inArray, isNotNull, ne } from "drizzle-orm";
import type { CheckpointSkillResult } from "@/lib/attempts/contract";
import { blockingCheckpoint, playableDay } from "@/lib/checkpoints/gate";
import { checkpointSummary, type ScoreRow } from "@/lib/checkpoints/score";
import { CHECKPOINT_INTERVAL, isCheckpointDay, type Checkpoint } from "@/lib/content/checkpoint-schema";
import { CHECKPOINT_RESUME_HOURS } from "@/lib/progress/config";
import { localDate, resolveTimeZone } from "@/lib/progress/dates";
import { attempts, checkpointResults, profiles, progress } from "../schema";
import type { DbOrTx } from "../types";

/** The part of the content seam these queries need (`getCheckpoint` of src/lib/content/repo; tests pass a fake). */
export type CheckpointContent = { getCheckpoint(afterDay: number): Checkpoint | null };
export type StoredCheckpointResult = {
  /** The sitting's sessionId. */
  id: string;
  afterDay: number;
  score: number;
  skills: CheckpointSkillResult[];
  startedAt: Date;
  completedAt: Date;
};
export type NewCheckpointResult = typeof checkpointResults.$inferInsert & { id: string };

const CHECKPOINT_SOURCES = ["checkpoint", "checkpoint_retake"] as const;
const resultColumns = {
  id: checkpointResults.id,
  afterDay: checkpointResults.afterDay,
  score: checkpointResults.score,
  skills: checkpointResults.skills,
  startedAt: checkpointResults.startedAt,
  completedAt: checkpointResults.completedAt,
};

/**
 * Which checkpoint blocks the learner's next day and the highest day they may play (D1, D15, plan 3.2). Reads the
 * database only when `currentDay - 1` is a checkpoint day and its file loads. A missing or broken file never blocks
 * (a broken one is logged): the learner can always carry on.
 */
export async function getCheckpointGate(
  db: DbOrTx,
  userId: string,
  profile: { currentDay: number },
  content: CheckpointContent,
): Promise<{ blocking: number | null; playableDay: number }> {
  const { currentDay } = profile;
  const afterDay = currentDay - 1;
  if (!isCheckpointDay(afterDay)) return { blocking: null, playableDay: currentDay };
  let file: Checkpoint | null = null;
  try {
    file = content.getCheckpoint(afterDay);
  } catch (err) {
    console.error(`[checkpoint] the file for checkpoint ${afterDay} failed to load, so it does not block:`, err);
  }
  if (!file) return { blocking: null, playableDay: currentDay };
  const [result] = await db
    .select({ id: checkpointResults.id })
    .from(checkpointResults)
    .where(and(eq(checkpointResults.userId, userId), eq(checkpointResults.afterDay, afterDay)))
    .limit(1);
  const [started] = await db.select({ day: progress.day }).from(progress).where(and(eq(progress.userId, userId), eq(progress.day, currentDay))).limit(1);
  const blocking = blockingCheckpoint({ currentDay, exists: () => true, taken: () => result !== undefined, currentDayStarted: started !== undefined });
  return { blocking, playableDay: playableDay(currentDay, blocking) };
}

/** Every finished sitting of the user, oldest first (by completedAt, then id), optionally of one checkpoint. */
export async function listCheckpointResults(db: DbOrTx, userId: string, afterDay?: number): Promise<StoredCheckpointResult[]> {
  return db
    .select(resultColumns)
    .from(checkpointResults)
    .where(and(eq(checkpointResults.userId, userId), afterDay === undefined ? undefined : eq(checkpointResults.afterDay, afterDay)))
    .orderBy(asc(checkpointResults.completedAt), asc(checkpointResults.id));
}

/**
 * Idempotent insert: true when the row was created, false when the id already exists (nothing is changed). The id is the
 * client's sessionId and is unique across all users, so `false` can also mean "someone else's id": read it back with
 * `getCheckpointResult(tx, userId, id)`, which is undefined in that case.
 */
export async function insertCheckpointResult(db: DbOrTx, row: NewCheckpointResult): Promise<boolean> {
  const inserted = await db.insert(checkpointResults).values(row).onConflictDoNothing({ target: checkpointResults.id }).returning({ id: checkpointResults.id });
  return inserted.length > 0;
}

/** The stored result of this user with this sitting id, or undefined (unknown id, or it belongs to someone else). */
export async function getCheckpointResult(db: DbOrTx, userId: string, id: string): Promise<StoredCheckpointResult | undefined> {
  const [row] = await db
    .select(resultColumns)
    .from(checkpointResults)
    .where(and(eq(checkpointResults.id, id), eq(checkpointResults.userId, userId)));
  return row;
}

/**
 * The stored first-try answers of one sitting for `exerciseIds` (both checkpoint sources), oldest first: what
 * scoreCheckpoint takes. Empty `exerciseIds` gives an empty list.
 */
export async function sittingRows(db: DbOrTx, userId: string, afterDay: number, sessionId: string, exerciseIds: readonly string[]): Promise<ScoreRow[]> {
  if (exerciseIds.length === 0) return [];
  return db
    .select({ id: attempts.id, exerciseId: attempts.exerciseId, score: attempts.score, correct: attempts.correct, createdAt: attempts.createdAt })
    .from(attempts)
    .where(
      and(
        eq(attempts.userId, userId),
        eq(attempts.day, afterDay),
        eq(attempts.sessionId, sessionId),
        inArray(attempts.source, [...CHECKPOINT_SOURCES]),
        eq(attempts.attemptNo, 1),
        inArray(attempts.exerciseId, [...exerciseIds]),
      ),
    )
    .orderBy(asc(attempts.createdAt), asc(attempts.id));
}

/**
 * The sitting a learner can resume (D8): the session of the most recently answered checkpoint attempt of A that has no
 * result yet, provided its FIRST answer is at most CHECKPOINT_RESUME_HOURS old (exactly 24 hours still counts). `answered`
 * lists the exercises with a stored answer, in the order they were answered, each once. Only answers that reached the
 * server are seen.
 */
export async function findOpenSitting(db: DbOrTx, userId: string, afterDay: number, now: Date): Promise<{ sessionId: string; answered: string[] } | null> {
  const rows = await db
    .select({ sessionId: attempts.sessionId, exerciseId: attempts.exerciseId, createdAt: attempts.createdAt })
    .from(attempts)
    .where(and(eq(attempts.userId, userId), eq(attempts.day, afterDay), inArray(attempts.source, [...CHECKPOINT_SOURCES]), isNotNull(attempts.sessionId)))
    .orderBy(asc(attempts.createdAt), asc(attempts.id));
  if (rows.length === 0) return null;
  const finished = new Set((await db.select({ id: checkpointResults.id }).from(checkpointResults).where(eq(checkpointResults.userId, userId))).map((r) => r.id));
  const sessions = new Map<string, { first: Date; last: Date; answered: string[] }>();
  for (const r of rows) {
    const id = r.sessionId as string;
    if (finished.has(id)) continue;
    const s = sessions.get(id) ?? { first: r.createdAt, last: r.createdAt, answered: [] };
    s.last = r.createdAt;
    if (!s.answered.includes(r.exerciseId)) s.answered.push(r.exerciseId);
    sessions.set(id, s);
  }
  let latest: [string, { first: Date; last: Date; answered: string[] }] | undefined;
  for (const entry of sessions) if (!latest || entry[1].last.getTime() >= latest[1].last.getTime()) latest = entry;
  if (!latest) return null;
  const [sessionId, s] = latest;
  if (now.getTime() - s.first.getTime() > CHECKPOINT_RESUME_HOURS * 3_600_000) return null;
  return { sessionId, answered: s.answered };
}

/** Whether the learner has any stored attempt of this exercise other than `exceptId` (any session, any source): the next answer is then a retake (D11). */
export async function hasEarlierAnswer(db: DbOrTx, userId: string, exerciseId: string, exceptId: string): Promise<boolean> {
  const rows = await db
    .select({ id: attempts.id })
    .from(attempts)
    .where(and(eq(attempts.userId, userId), eq(attempts.exerciseId, exerciseId), ne(attempts.id, exceptId)))
    .limit(1);
  return rows.length > 0;
}

/** The given exercises the learner answered as a replay (`practice`) strictly after `since` (the "ฝึกแล้ว" tick on the result page). */
export async function practisedSince(db: DbOrTx, userId: string, exerciseIds: readonly string[], since: Date): Promise<Set<string>> {
  if (exerciseIds.length === 0) return new Set();
  const rows = await db
    .selectDistinct({ exerciseId: attempts.exerciseId })
    .from(attempts)
    .where(and(eq(attempts.userId, userId), eq(attempts.source, "practice"), gt(attempts.createdAt, since), inArray(attempts.exerciseId, [...exerciseIds])));
  return new Set(rows.map((r) => r.exerciseId));
}

export type CheckpointOverviewEntry = {
  afterDay: number;
  status: "not_taken" | "passed" | "not_passed";
  sittings: number;
  latest: number | null;
  best: number | null;
  /** Any sitting reached the pass mark. */
  passed: boolean;
  /** The latest sitting finished on today's date in the learner's time zone (D4: the next one is for tomorrow). */
  completedToday: boolean;
};

/**
 * Every checkpoint that is open to the learner (its file loads and day A is done) with how they stand, in afterDay
 * order: for /practice and the home page. A file that fails to load is skipped (and logged).
 */
export async function getCheckpointOverview(db: DbOrTx, userId: string, content: CheckpointContent, now: Date): Promise<CheckpointOverviewEntry[]> {
  const files: number[] = [];
  for (let afterDay = CHECKPOINT_INTERVAL; afterDay <= 360; afterDay += CHECKPOINT_INTERVAL) {
    try {
      if (content.getCheckpoint(afterDay)) files.push(afterDay);
    } catch (err) {
      console.error(`[checkpoint] the file for checkpoint ${afterDay} failed to load, so it is not offered:`, err);
    }
  }
  if (files.length === 0) return [];
  const done = await db
    .select({ day: progress.day })
    .from(progress)
    .where(and(eq(progress.userId, userId), eq(progress.status, "done"), inArray(progress.day, files)));
  const open = new Set(done.map((r) => r.day));
  const openDays = files.filter((d) => open.has(d));
  if (openDays.length === 0) return [];
  const [profile] = await db.select({ timezone: profiles.timezone }).from(profiles).where(eq(profiles.userId, userId));
  const zone = resolveTimeZone(profile?.timezone);
  const today = localDate(now, zone);
  const results = await listCheckpointResults(db, userId);
  const summaries = new Map(checkpointSummary(results).map((s) => [s.afterDay, s]));
  return openDays.map((afterDay): CheckpointOverviewEntry => {
    const s = summaries.get(afterDay);
    if (!s) return { afterDay, status: "not_taken", sittings: 0, latest: null, best: null, passed: false, completedToday: false };
    const last = results.filter((r) => r.afterDay === afterDay).at(-1)!;
    return {
      afterDay,
      status: s.passed ? "passed" : "not_passed",
      sittings: s.sittings,
      latest: s.latest,
      best: s.best,
      passed: s.passed,
      completedToday: localDate(last.completedAt, zone) === today,
    };
  });
}
