// POST /api/attempts: parse -> look up in content -> grade -> store, all on the server (docs/ARCHITECTURE.md 5.1).
// One bad item never fails the batch: it is answered `rejected` and the rest is stored.
import { getDayStatus } from "@/db/queries/practice";
import { findStoredGrade, getProfileShared, insertAttempt, markInProgress, refreshDoneScore } from "@/db/queries/attempts";
import { isDataError, withTransactionRetry } from "@/db/queries/tx";
import type { Db } from "@/db/types";
import { gradeExercise, isAttemptNoAllowed } from "@/lib/answers/grade";
import { parseAttemptBatch, type AttemptInput, type AttemptResult, type PostAttemptsResponse } from "@/lib/attempts/contract";
import { attemptSkill, deriveTags, findExercise } from "@/lib/attempts/derive";
import { isDayUnlocked } from "@/lib/attempts/unlock";
import { getLesson, getTaughtWords } from "@/lib/content/repo";
import { hasRole } from "@/lib/progress/sources";
import type { Lesson } from "@/lib/content/schema";
import { clampTimestamp, timestampFloor } from "./clamp";

export type HandlerDeps = { db: Db; userId: string; now: Date };
export type HandlerResult<T> = { status: 200; body: T } | { status: 400 | 409; body: { error: string } };

const dayOf = (exerciseId: string) => Number(exerciseId.slice(1, 4));

type Prepared = { index: number; a: AttemptInput; day: number; lesson: Lesson; found: NonNullable<ReturnType<typeof findExercise>>; tags: string[] };

export async function handlePostAttempts(body: unknown, { db, userId, now }: HandlerDeps): Promise<HandlerResult<PostAttemptsResponse>> {
  const parsed = parseAttemptBatch(body);
  if (!parsed.ok) return { status: 400, body: { error: "invalid_body" } };

  // Content is read once per request (each lesson, and each day's taught words), never once per item. A lesson file
  // that fails to load only affects its own items: they are answered `unknown_exercise`.
  const lessons = new Map<number, Lesson | null>();
  const lessonFor = (day: number) => {
    if (!lessons.has(day)) {
      try {
        lessons.set(day, getLesson(day));
      } catch (err) {
        console.error(`[attempts] lesson for day ${day} failed to load:`, err);
        lessons.set(day, null);
      }
    }
    return lessons.get(day)!;
  };
  const taught = new Map<number, ReturnType<typeof getTaughtWords> | null>();
  const taughtFor = (day: number) => {
    if (!taught.has(day)) {
      try {
        taught.set(day, getTaughtWords(day));
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
    const day = dayOf(a.exerciseId);
    const lesson = lessonFor(day);
    const found = lesson ? findExercise(lesson, a.exerciseId) : undefined;
    const words = lesson && found ? taughtFor(day) : null;
    if (!lesson || !found || !words) {
      fixed[index] = { id: a.id, status: "rejected", reason: "unknown_exercise" };
      return;
    }
    work.push({ index, a, day, lesson, found, tags: deriveTags(lesson, found.exercise, found.section, words) });
  });

  // Rows are written in id order whatever the request order, so two batches with the same ids can never wait on each
  // other in a cycle (deadlock). Results go back in request order. Array.sort is stable: a repeated id keeps its order.
  const ordered = [...work].sort((x, y) => (x.a.id < y.a.id ? -1 : x.a.id > y.a.id ? 1 : 0));

  const results = await withTransactionRetry(db, async (tx) => {
    const out = [...fixed];
    const profile = await getProfileShared(tx, userId);
    const floor = timestampFloor(now, profile.startDate, profile.timezone);
    const firstCreated = new Map<number, Date>(); // day -> earliest created_at of a newly stored attempt

    for (const w of ordered) {
      const { a, day, found } = w;
      if (!isDayUnlocked(day, profile.currentDay)) {
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
            source: a.source,
            sessionId: a.sessionId,
            attemptNo: a.attemptNo,
            createdAt,
          });
          if (created) return { id: a.id, status: "created" as const, ...grade };
          // the id exists: report what was stored, never the grade of this (possibly different) payload
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
