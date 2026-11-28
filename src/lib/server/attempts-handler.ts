// POST /api/attempts: parse -> look up in content -> grade -> store, all on the server (docs/ARCHITECTURE.md 5.1).
// One bad item never fails the batch: it is answered `rejected` and the rest is stored.
import { answeredInSitting, getCheckpointGate, hasEarlierAnswer } from "@/db/queries/checkpoints";
import { getDayStatus } from "@/db/queries/practice";
import { findStoredGrade, getProfileShared, insertAttempt, markInProgress, refreshDoneScore } from "@/db/queries/attempts";
import { isDataError, withTransactionRetry } from "@/db/queries/tx";
import type { Db } from "@/db/types";
import { gradeExercise, isAttemptNoAllowed } from "@/lib/answers/grade";
import { parseAttemptBatch, type AttemptInput, type AttemptResult, type PostAttemptsResponse } from "@/lib/attempts/contract";
import { attemptSkill, deriveTags, findExercise, type HasSections } from "@/lib/attempts/derive";
import { isDayUnlocked } from "@/lib/attempts/unlock";
import type { Checkpoint } from "@/lib/content/checkpoint-schema";
import { getCheckpoint, getLesson, getTaughtWords } from "@/lib/content/repo";
import { hasRole } from "@/lib/progress/sources";
import type { Lesson } from "@/lib/content/schema";
import { clampTimestamp, timestampFloor } from "./clamp";

export type HandlerDeps = { db: Db; userId: string; now: Date };
export type HandlerResult<T> = { status: 200; body: T } | { status: 400 | 409; body: { error: string } };

/** The day in the id: `d031-...` is the lesson of day 31, `c030-...` the checkpoint taken after day 30 (its attempts belong to day 30). */
const dayOf = (exerciseId: string) => Number(exerciseId.slice(1, 4));
const isCheckpointId = (exerciseId: string) => exerciseId.startsWith("c");
const isCheckpointSource = (source: AttemptInput["source"]) => source === "checkpoint" || source === "checkpoint_retake";

type Prepared = { index: number; a: AttemptInput; day: number; container: HasSections; found: NonNullable<ReturnType<typeof findExercise>>; tags: string[] };

/** Where exercises come from; a test seam (default: the content files). */
export type AttemptsContent = {
  getLesson(day: number): Lesson | null;
  getCheckpoint(afterDay: number): Checkpoint | null;
  getTaughtWords(day: number): ReadonlyMap<string, string>;
};
// wrappers, not the functions themselves: each call goes through the module, so a test can spy on the repo
const repoContent: AttemptsContent = { getLesson: (d) => getLesson(d), getCheckpoint: (d) => getCheckpoint(d), getTaughtWords: (d) => getTaughtWords(d) };

export async function handlePostAttempts(body: unknown, { db, userId, now, content = repoContent }: HandlerDeps & { content?: AttemptsContent }): Promise<HandlerResult<PostAttemptsResponse>> {
  const parsed = parseAttemptBatch(body);
  if (!parsed.ok) return { status: 400, body: { error: "invalid_body" } };

  // Content is read once per request (each lesson or checkpoint, and each day's taught words), never once per item. A
  // file that fails to load only affects its own items: they are answered `unknown_exercise`.
  const containers = new Map<string, HasSections | null>();
  const containerFor = (checkpoint: boolean, day: number): HasSections | null => {
    const key = `${checkpoint ? "c" : "d"}${day}`;
    if (!containers.has(key)) {
      try {
        containers.set(key, checkpoint ? content.getCheckpoint(day) : content.getLesson(day));
      } catch (err) {
        console.error(`[attempts] ${checkpoint ? "checkpoint" : "lesson"} for day ${day} failed to load:`, err);
        containers.set(key, null);
      }
    }
    return containers.get(key)!;
  };
  const taught = new Map<number, ReturnType<typeof getTaughtWords> | null>();
  const taughtFor = (day: number) => {
    if (!taught.has(day)) {
      try {
        taught.set(day, content.getTaughtWords(day));
      } catch (err) {
        console.error(`[attempts] taught words for day ${day} failed to load:`, err);
        taught.set(day, null);
      }
    }
    return taught.get(day)!;
  };

  const fixed: (AttemptResult | undefined)[] = new Array(parsed.items.length);
  const work: Prepared[] = [];
  parsed.items.forEach((item, index) => {
    if (!item.ok) {
      fixed[index] = { id: item.id, status: "rejected", reason: "invalid" };
      return;
    }
    const a = item.attempt;
    // `c…` ids are checkpoint exercises: source checkpoint or checkpoint_retake, first try only. A `d…` id never uses
    // those two sources (the server alone decides which of them a checkpoint answer is stored as).
    const checkpoint = isCheckpointId(a.exerciseId);
    if (checkpoint ? !isCheckpointSource(a.source) || a.attemptNo !== 1 : isCheckpointSource(a.source)) {
      fixed[index] = { id: a.id, status: "rejected", reason: "invalid" };
      return;
    }
    const day = dayOf(a.exerciseId);
    const container = containerFor(checkpoint, day);
    const found = container ? findExercise(container, a.exerciseId) : undefined;
    const words = container && found ? taughtFor(day) : null;
    if (!container || !found || !words) {
      fixed[index] = { id: a.id, status: "rejected", reason: "unknown_exercise" };
      return;
    }
    work.push({ index, a, day, container, found, tags: deriveTags(container, found.exercise, found.section, words) });
  });

  // Lesson rows are written in id order whatever the request order, so two batches with the same ids can never wait on each
  // other in a cycle (deadlock). Results go back in request order. Array.sort is stable: a repeated id keeps its order.
  // Checkpoint rows go first, in REQUEST order: when one exercise appears twice in a batch the first one sent is the answer
  // that counts, never the one with the smaller id (a deadlock between two such batches is retried by withTransactionRetry).
  const byId = (x: Prepared, y: Prepared) => (x.a.id < y.a.id ? -1 : x.a.id > y.a.id ? 1 : 0);
  const ordered = [...work.filter((w) => isCheckpointId(w.a.exerciseId)), ...work.filter((w) => !isCheckpointId(w.a.exerciseId)).sort(byId)];

  const results = await withTransactionRetry(db, async (tx) => {
    const out = [...fixed];
    const profile = await getProfileShared(tx, userId);
    const floor = timestampFloor(now, profile.startDate, profile.timezone);
    const firstCreated = new Map<number, Date>(); // day -> earliest created_at of a newly stored attempt
    // a checkpoint that has not been taken holds day A+1 back: the highest playable day is then A (docs/plans/checkpoint-plan.md D1)
    const { playableDay } = await getCheckpointGate(tx, userId, profile, content);

    for (const w of ordered) {
      const { a, day, found } = w;
      if (!isDayUnlocked(day, playableDay)) {
        out[w.index] = { id: a.id, status: "rejected", reason: "locked_day" };
        continue;
      }
      // A source that never touches progress (practice) replays finished days only (plan U2). No lock: a done day
      // never stops being done.
      if (!hasRole(a.source, "touchesProgress") && (await getDayStatus(tx, userId, day)) !== "done") {
        out[w.index] = { id: a.id, status: "rejected", reason: "not_finished" };
        continue;
      }
      const grade = gradeExercise(found.exercise, a.answer);
      if ("error" in grade) {
        out[w.index] = { id: a.id, status: "rejected", reason: grade.error };
        continue;
      }
      if (!isAttemptNoAllowed(found.exercise.type, a.attemptNo)) {
        out[w.index] = { id: a.id, status: "rejected", reason: "invalid" };
        continue;
      }

      const createdAt = clampTimestamp(a.createdAt, now, floor);
      try {
        // a savepoint per item: a database error in one item rolls back only that item
        out[w.index] = await tx.transaction(async (sp) => {
          // D11: the first answer a learner ever gives to a checkpoint exercise is `checkpoint`, every later one `checkpoint_retake`
          const checkpoint = isCheckpointId(a.exerciseId);
          // One answer per exercise per sitting: a second one (any attempt id, any client time) is refused, so it can never
          // replace the first. The same attempt id is a retry and falls through to `duplicate`. The partial unique index
          // attempts_checkpoint_one_answer_idx is the backstop.
          if (checkpoint && (await answeredInSitting(sp, userId, a.sessionId, a.exerciseId, a.id))) return { id: a.id, status: "rejected" as const, reason: "already_answered" as const };
          const source = checkpoint ? ((await hasEarlierAnswer(sp, userId, a.exerciseId, a.id)) ? "checkpoint_retake" : "checkpoint") : a.source;
          const created = await insertAttempt(sp, {
            id: a.id,
            userId,
            exerciseId: a.exerciseId,
            day,
            skill: attemptSkill(found.section, found.exercise),
            exerciseType: found.exercise.type,
            correct: grade.correct,
            score: grade.score,
            answer: a.answer,
            durationMs: a.durationMs ?? null,
            tags: w.tags,
            source,
            sessionId: a.sessionId,
            attemptNo: a.attemptNo,
            createdAt,
          });
          // a checkpoint answer is acknowledged without its grade (D5)
          if (created) return checkpoint ? { id: a.id, status: "created" as const } : { id: a.id, status: "created" as const, ...grade };
          // the id exists: report what was stored, never the grade of this (possibly different) payload
          if (checkpoint) return { id: a.id, status: "duplicate" as const };
          return { id: a.id, status: "duplicate" as const, ...(await findStoredGrade(sp, userId, a.id)) };
        });
        if (out[w.index]!.status === "created" && hasRole(a.source, "touchesProgress")) {
          const prev = firstCreated.get(day);
          if (!prev || createdAt < prev) firstCreated.set(day, createdAt);
        }
      } catch (err) {
        if (!isDataError(err)) throw err; // deadlock, connection loss...: the whole request is retried or fails
        console.error(`[attempts] item ${a.id} (${a.exerciseId}) rejected by the database:`, err);
        out[w.index] = { id: a.id, status: "rejected", reason: "invalid" };
      }
    }

    // progress rows in day order (a fixed lock order); a done day gets its score recomputed
    for (const day of [...firstCreated.keys()].sort((x, y) => x - y)) {
      await markInProgress(tx, userId, day, firstCreated.get(day)!);
      await refreshDoneScore(tx, userId, day);
    }
    return out as AttemptResult[];
  });

  return { status: 200, body: { results } };
}
