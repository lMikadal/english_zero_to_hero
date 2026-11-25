"use client";
import { useEffect, useReducer, useRef, useState } from "react";
import { correctAnswerText, gradeExercise, isRetryable } from "@/lib/answers/grade";
import { newId, type AttemptAnswer } from "@/lib/attempts/contract";
import type { ExerciseType, Lesson } from "@/lib/content/schema";
import type { CompleteResult, SyncSink } from "@/lib/offline/sink";
import { isRegistered, renderExercise } from "@/components/exercises/registry";
import type { VocabLookup } from "@/components/exercises/types";
import { CompletionScreen } from "./CompletionScreen";
import {
  createPlayerState, currentItem, elapsedMs, canAdvance, firstAttemptScore, isRetryRound, playerReducer, recordsAttempt,
} from "./player-state";

const BTN = "min-h-11 w-full rounded-lg px-4 py-2 text-base font-semibold";

export type LessonPlayerProps = {
  lesson: Lesson;
  vocab: VocabLookup;
  sink: SyncSink;
  /** Monotonic clock in ms; tests pass a fake. */
  clock?: () => number;
};

export function LessonPlayer({ lesson, vocab, sink, clock = () => performance.now() }: LessonPlayerProps) {
  const [state, dispatch] = useReducer(playerReducer, undefined, () =>
    createPlayerState({ lesson, sessionId: newId(), now: clock(), isSupported: isRegistered }),
  );
  const [completion, setCompletion] = useState<CompleteResult | null>(null);
  const completing = useRef(false);

  useEffect(() => {
    if (state.phase !== "complete" || completing.current) return;
    completing.current = true;
    sink
      .completeLesson({ day: lesson.day, sessionId: state.sessionId, completedAt: new Date().toISOString() })
      .then(setCompletion, () => setCompletion({ status: "rejected", code: 400 }));
  }, [state.phase, state.sessionId, sink, lesson.day]);

  if (state.phase === "complete") {
    return <CompletionScreen result={completion} localScore={firstAttemptScore(state)} />;
  }

  const item = currentItem(state);
  const { exercise } = item.step;
  const record = state.answers[item.key];
  const graded = recordsAttempt(item);

  const onAnswer = (answer: AttemptAnswer) => {
    if (!graded || record) return; // one attempt per exercise per round
    const grade = gradeExercise(exercise, answer);
    if ("error" in grade) return;
    const now = clock();
    sink.sendAttempt({
      id: newId(),
      exerciseId: exercise.id,
      sessionId: state.sessionId,
      source: "lesson",
      attemptNo: item.attemptNo,
      answer,
      durationMs: elapsedMs(state, now),
      createdAt: new Date().toISOString(),
    });
    dispatch({ type: "answer", answer, grade, now });
  };
  const goNext = () => dispatch({ type: "next", now: clock() });
  const skip = () => dispatch({ type: "skip", now: clock() });

  const position = state.items.filter((i) => i.attemptNo === item.attemptNo);
  const x = position.indexOf(item) + 1;
  const total = position.length;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 p-4">
      <header className="flex flex-col gap-1">
        <div className="flex items-center justify-between text-sm text-zinc-600">
          <span>{item.step.sectionTitle.th}</span>
          <span>ข้อ {x} / {total}</span>
        </div>
        <div className="h-2 rounded-full bg-zinc-200" aria-hidden>
          <div className="h-2 rounded-full bg-sky-600" style={{ width: `${(x / total) * 100}%` }} />
        </div>
        {isRetryRound(state) && <p className="text-sm font-medium text-amber-800">ทบทวนข้อที่ตอบผิด</p>}
      </header>

      {item.step.supported ? (
        <div key={item.key}>
          {renderExercise(exercise, { vocab, onAnswer, onContinue: skip, result: record?.grade })}
        </div>
      ) : (
        <div className="flex flex-col gap-3 rounded-lg bg-zinc-50 p-4">
          <p className="text-lg font-semibold">ยังไม่รองรับ</p>
          <p className="text-sm text-zinc-600">แบบฝึกหัดชนิดนี้ยังเล่นไม่ได้ในเวอร์ชันนี้ ข้ามไปก่อนได้</p>
          <button type="button" onClick={skip} className={`${BTN} border border-zinc-300`}>ข้าม</button>
        </div>
      )}

      {record && <Feedback type={exercise.type} correct={record.grade.correct} lines={isRetryable(exercise.type) ? correctAnswerText(exercise) : []} />}

      {graded && (
        <button type="button" disabled={!canAdvance(state)} onClick={goNext} className={`${BTN} bg-sky-600 text-white disabled:bg-zinc-300 disabled:text-zinc-600`}>
          ถัดไป
        </button>
      )}
    </main>
  );
}

function Feedback({ type, correct, lines }: { type: ExerciseType; correct: boolean; lines: string[] }) {
  if (!isRetryable(type)) {
    return <p role="status" className="rounded-lg bg-zinc-100 p-3">บันทึกแล้ว</p>;
  }
  return correct ? (
    <p role="status" className="rounded-lg bg-green-100 p-3 font-semibold text-green-900">ถูกต้อง</p>
  ) : (
    <div role="status" className="rounded-lg bg-red-100 p-3 text-red-900">
      <p className="font-semibold">ยังไม่ถูก</p>
      {lines.length > 0 && (
        <>
          <p className="text-sm">คำตอบที่ถูกต้อง</p>
          <ul>{lines.map((l, i) => <li key={i} className="font-medium">{l}</li>)}</ul>
        </>
      )}
    </div>
  );
}
