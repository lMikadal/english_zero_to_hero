// POST /api/attempts: parse -> look up in content -> grade -> store, all on the server (docs/ARCHITECTURE.md 5.1).
import { findStoredGrade, getCurrentDay, insertAttempt, markInProgress } from "@/db/queries/attempts";
import type { Db } from "@/db/types";
import { gradeExercise, isAttemptNoAllowed } from "@/lib/answers/grade";
import { parseAttemptBatch, type AttemptResult, type PostAttemptsResponse } from "@/lib/attempts/contract";
import { attemptSkill, deriveTags, findExercise } from "@/lib/attempts/derive";
import { isDayUnlocked } from "@/lib/attempts/unlock";
import { getLesson, getTaughtWords } from "@/lib/content/repo";
import type { Lesson } from "@/lib/content/schema";
import { clampToNow } from "./clamp";

export type HandlerDeps = { db: Db; userId: string; now: Date };
export type HandlerResult<T> = { status: 200; body: T } | { status: 400 | 409; body: { error: string } };

const dayOf = (exerciseId: string) => Number(exerciseId.slice(1, 4));

export async function handlePostAttempts(body: unknown, { db, userId, now }: HandlerDeps): Promise<HandlerResult<PostAttemptsResponse>> {
  const parsed = parseAttemptBatch(body);
  if (!parsed.ok) return { status: 400, body: { error: "invalid_body" } };

  const lessons = new Map<number, Lesson | null>();
  const lessonFor = (day: number) => {
    if (!lessons.has(day)) lessons.set(day, getLesson(day));
    return lessons.get(day)!;
  };

  const results = await db.transaction(async (tx) => {
    const currentDay = await getCurrentDay(tx, userId);
    const firstCreated = new Map<number, Date>(); // day -> earliest created_at of a newly stored attempt
    const out: AttemptResult[] = [];

    for (const item of parsed.items) {
      if (!item.ok) {
        out.push({ id: item.id, status: "rejected", reason: "invalid" });
        continue;
      }
      const a = item.attempt;
      const day = dayOf(a.exerciseId);
      const lesson = lessonFor(day);
      const found = lesson ? findExercise(lesson, a.exerciseId) : undefined;
      if (!lesson || !found) {
        out.push({ id: a.id, status: "rejected", reason: "unknown_exercise" });
        continue;
      }
      if (!isDayUnlocked(day, currentDay)) {
        out.push({ id: a.id, status: "rejected", reason: "locked_day" });
        continue;
      }
      const grade = gradeExercise(found.exercise, a.answer);
      if ("error" in grade) {
        out.push({ id: a.id, status: "rejected", reason: grade.error });
        continue;
      }
      if (!isAttemptNoAllowed(found.exercise.type, a.attemptNo)) {
        out.push({ id: a.id, status: "rejected", reason: "invalid" });
        continue;
      }

      const createdAt = clampToNow(a.createdAt, now);
      const created = await insertAttempt(tx, {
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
        tags: deriveTags(lesson, found.exercise, found.section, getTaughtWords(day)),
        source: a.source,
        sessionId: a.sessionId,
        attemptNo: a.attemptNo,
        createdAt,
      });
      if (created) {
        const prev = firstCreated.get(day);
        if (!prev || createdAt < prev) firstCreated.set(day, createdAt);
        out.push({ id: a.id, status: "created", ...grade });
      } else {
        // the id exists: report what was stored, never the grade of this (possibly different) payload
        out.push({ id: a.id, status: "duplicate", ...(await findStoredGrade(tx, userId, a.id)) });
      }
    }

    for (const [day, startedAt] of firstCreated) await markInProgress(tx, userId, day, startedAt);
    return out;
  });

  return { status: 200, body: { results } };
}
